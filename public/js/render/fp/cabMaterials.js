// ─────────────────────────────────────────────────────────────────────────────
// Materials for Rook's first-person cab (render/fp). A shared uniform block drives them all:
//   CAB_UNIFORMS.uFill.value  — extra ambient inside the cab (diffuse × uFill → emissive), so the dash
//                               and the hands read at dawn / dusk
//   CAB_UNIFORMS.uShade       — [low, high] share of direct light reaching the footwell … dash top. The
//                               cab meshes take no shadows, so without it the interior is lit like the
//                               road; with it the cab darkens toward the floor and keeps its glow up top.
//   CAB_UNIFORMS.uWear.value  — strength of the object-space wear (grain, scuffs, dust) 0 … 1
//
//   cabWearMaterial({ flat, phong, toFrame })  vertex-colour material + wear (no UVs: the grime texture
//                                              is projected along the dominant object-space axis)
//   patchFill(material, key, toFrame)          fill + roof shading for any Lambert / Phong material
// `toFrame` (Matrix4, optional, kept by reference) maps the mesh's object space into the rv_frame
// (RV-local metres) where the height-based shading is evaluated; identity for meshes that sit at
// identity inside the frame. Update it in place for meshes that move inside the cab (the wheel).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { wearTexture } from '../textures.js';

export const CAB_UNIFORMS = {
  uFill: { value: 0.09 },
  uShade: { value: new THREE.Vector2(0.34, 0.82) },
  uWear: { value: 1 },
  uDust: { value: new THREE.Color('#b9a98c') },
  uWearMap: { value: null },
};

const DECL = `uniform float uFill;
uniform vec2 uShade;
varying vec3 vCabFrame;
`;
const FILL_CODE = '\n  totalEmissiveRadiance += diffuseColor.rgb * uFill;\n';
const SHADE_CODE = `#include <lights_fragment_end>
  {
    float hgt = smoothstep(0.95, 1.6, vCabFrame.y);
    float sh = mix(uShade.x, uShade.y, hgt);
    reflectedLight.directDiffuse *= sh;
    reflectedLight.directSpecular *= sh;
    reflectedLight.indirectDiffuse *= mix(0.6, 0.95, hgt);
  }
`;
function bindCommon(sh, toFrame) {
  sh.uniforms.uFill = CAB_UNIFORMS.uFill;
  sh.uniforms.uShade = CAB_UNIFORMS.uShade;
  sh.uniforms.uToFrame = { value: toFrame };
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nuniform mat4 uToFrame;\nvarying vec3 vCabFrame;\nvarying vec3 vCabPos;\n')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCabPos = position;\nvCabFrame = (uToFrame * vec4(position, 1.0)).xyz;\n');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + DECL)
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>' + FILL_CODE)
    .replace('#include <lights_fragment_end>', SHADE_CODE);
}

/** Cab fill + roof shading on any Lambert / Phong material. */
export function patchFill(mat, key = 'cabFill', toFrame = new THREE.Matrix4()) {
  mat.onBeforeCompile = (sh) => bindCommon(sh, toFrame);
  mat.customProgramCacheKey = () => 'cabFill|' + key;
  mat.userData.toFrame = toFrame;
  return mat;
}

/**
 * Vertex-colour material with object-space wear: fine vinyl grain, light scuffs on dark plastic,
 * dust settling on the up-facing dash top, darker grime in low-frequency blotches.
 */
export function cabWearMaterial({ flat = true, phong = false, shininess = 18, specular = '#1c1a18', scale = 2.6, name = 'CR_CabWear', toFrame = new THREE.Matrix4() } = {}) {
  if (!CAB_UNIFORMS.uWearMap.value && typeof document !== 'undefined') CAB_UNIFORMS.uWearMap.value = wearTexture();
  const mat = phong
    ? new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: flat, shininess, specular, name })
    : new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: flat, name });
  if (!CAB_UNIFORMS.uWearMap.value) return patchFill(mat, name, toFrame);
  mat.userData.toFrame = toFrame;
  mat.onBeforeCompile = (sh) => {
    bindCommon(sh, toFrame);
    sh.uniforms.uWear = CAB_UNIFORMS.uWear;
    sh.uniforms.uDust = CAB_UNIFORMS.uDust;
    sh.uniforms.uWearMap = CAB_UNIFORMS.uWearMap;
    sh.fragmentShader = sh.fragmentShader
      .replace('varying vec3 vCabFrame;\n', `varying vec3 vCabFrame;
varying vec3 vCabPos;
uniform float uWear;
uniform vec3 uDust;
uniform sampler2D uWearMap;
`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec3 cp = vCabPos * ${scale.toFixed(3)};
    vec3 fn = normalize(cross(dFdx(vCabPos), dFdy(vCabPos)));
    vec3 ff = normalize(cross(dFdx(vCabFrame), dFdy(vCabFrame)));
    vec3 an = abs(fn);
    vec2 wuv = an.x > an.y && an.x > an.z ? cp.zy : (an.y > an.z ? cp.xz : cp.xy);
    vec4 w = texture2D(uWearMap, wuv);
    vec4 w2 = texture2D(uWearMap, wuv * 0.21 + 0.37);
    float lum = dot(diffuseColor.rgb, vec3(0.333));
    // grain: ±4 % vinyl texture
    diffuseColor.rgb *= 1.0 + (w.r - 0.5) * 0.08 * uWear;
    // grime blotches darken a little, fine scuffs lift dark plastic a touch
    diffuseColor.rgb *= 1.0 - smoothstep(0.6, 0.95, w2.b) * 0.1 * uWear;
    diffuseColor.rgb += w.g * w.g * (0.012 + 0.03 * (1.0 - smoothstep(0.04, 0.25, lum))) * uWear;
    // dust on the up-facing dash top / ledges (not on laps and seats), patchy
    float up = smoothstep(0.6, 0.92, ff.y) * smoothstep(1.36, 1.43, vCabFrame.y) * step(2.86, vCabFrame.z);
    float dust = up * smoothstep(0.4, 0.85, w2.b * 0.7 + w.b * 0.3) * 0.22 * uWear;
    diffuseColor.rgb = mix(diffuseColor.rgb, uDust * (0.55 + 0.45 * lum), dust);
  }`);
  };
  mat.customProgramCacheKey = () => 'cabWear|' + (phong ? 'p' : 'l') + (flat ? 'f' : 's') + scale;
  return mat;
}
