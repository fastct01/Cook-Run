// ─────────────────────────────────────────────────────────────────────────────
// World materials (VIEW-WORLD-A). Every static chunk mesh uses one of these
// shared materials, so a chunk costs a handful of draw calls:
//   ground  – terrain, road, tiles (vertex colour, flat shaded)
//   decal   – lots / side streets (polygon offset)
//   marks   – lane paint, rails in asphalt (stronger polygon offset)
//   emit    – baked scenery: vertex colour + per-vertex emission × GLOW (night)
//   far     – like emit, weaker fog (distant silhouettes: mesas, ships, skylines)
//   atlas   – scenery signs packed into a runtime atlas (see atlas.js); emission
//             either constant or from the sign texture (neon), × GLOW
//   cobble  – Old Town street: procedural cobblestones in world space
//   water   – sea / channel / river: vertex colour + moving glints
// GLOW and WTIME are shared uniform objects driven by WorldView every frame.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

export const GLOW = { value: 1 };     // baked emission multiplier (1 by day, ~3 at night)
export const WTIME = { value: 0 };    // seconds (water ripples)

const cache = new Map();

const FAR_FOG = '#ifdef USE_FOG\n float fogFactor = smoothstep( fogNear, fogFar * 2.4, vFogDepth ) * 0.8;\n gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );\n#endif';

function patchEmit(m, key, { far = false, atlas = false } = {}) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = GLOW;
    let vs = sh.vertexShader, fs = sh.fragmentShader;
    vs = 'attribute vec3 aEmit;\nvarying vec3 vEmitV;\n' + (atlas ? 'attribute float aEmitMap;\nvarying float vEmitMap;\n' : '') +
      vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n vEmitV = aEmit;' + (atlas ? '\n vEmitMap = aEmitMap;' : ''));
    fs = 'uniform float uGlow;\nvarying vec3 vEmitV;\n' + (atlas ? 'varying float vEmitMap;\n' : '') + fs.replace('#include <emissivemap_fragment>',
      atlas ? '#include <emissivemap_fragment>\n totalEmissiveRadiance += vEmitV * mix(vec3(1.0), texture2D(map, vMapUv).rgb, vEmitMap) * uGlow;'
        : '#include <emissivemap_fragment>\n totalEmissiveRadiance += vEmitV * uGlow;');
    if (far) fs = fs.replace('#include <fog_fragment>', FAR_FOG);
    sh.vertexShader = vs; sh.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => 'wmat_' + key;
}

/** Shared vertex-colour material. variant: ground | decal | marks | emit | far | emitDS */
export function worldMat(variant = 'emit') {
  let m = cache.get(variant);
  if (m) return m;
  const flat = variant !== 'decal' && variant !== 'marks';
  m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: flat, side: variant === 'emitDS' ? THREE.DoubleSide : THREE.FrontSide });
  m.name = 'w_' + variant;
  const emit = variant === 'emit' || variant === 'far' || variant === 'emitDS';
  m.userData.emit = emit;
  if (variant === 'marks') { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -8; }
  if (variant === 'decal') { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -3; }
  if (emit) patchEmit(m, variant, { far: variant === 'far' });
  cache.set(variant, m);
  return m;
}

/** Atlas sign material for one atlas page. cut: alpha-tested (letters), side: THREE side. */
export function atlasMat(page, cut = false, side = THREE.FrontSide) {
  const key = `atlas_${page.id}_${cut ? 1 : 0}_${side}`;
  let m = cache.get(key);
  if (m) return m;
  m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, map: page.texture, side });
  if (cut) { m.alphaTest = 0.5; }
  m.name = 'w_' + key;
  m.userData.emit = true;
  m.userData.atlas = true;
  patchEmit(m, 'atlas' + (cut ? 'C' : ''), { atlas: true });
  cache.set(key, m);
  return m;
}

/** Cobblestone street: vertex colour × procedural stones (world XZ), faded with distance to avoid shimmer. */
export function cobbleMat() {
  let m = cache.get('cobble');
  if (m) return m;
  m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: false });
  m.name = 'w_cobble';
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <worldpos_vertex>',
      '#include <worldpos_vertex>\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vWPos;\nfloat cbHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' +
      sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec2 p = vec2(vWPos.x / 0.36, vWPos.z / 0.27);
    float row = floor(p.y);
    p.x += 0.5 * mod(row, 2.0) + 0.13 * cbHash(vec2(row, 3.0));
    vec2 cell = floor(p);
    vec2 f = fract(p) - 0.5;
    vec2 q = max(abs(f) - vec2(0.36, 0.33), 0.0);
    float d = length(q);
    float mortar = smoothstep(0.02, 0.1, d);
    float h = cbHash(cell);
    float dome = 1.0 - dot(f, f) * 0.9;
    vec2 fw = fwidth(p);
    float fade = clamp(1.25 - max(fw.x, fw.y) * 1.1, 0.0, 1.0);
    vec3 stone = diffuseColor.rgb * (0.82 + 0.3 * h) * (0.9 + 0.12 * dome);
    stone = mix(stone, diffuseColor.rgb * 0.55, mortar);
    diffuseColor.rgb = mix(diffuseColor.rgb * 0.93, stone, fade);
  }`);
  };
  m.customProgramCacheKey = () => 'wmat_cobble';
  cache.set('cobble', m);
  return m;
}

/** Water: vertex colour (depth tint baked by the builder) with drifting sun glints. */
export function waterMat() {
  let m = cache.get('water');
  if (m) return m;
  m = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 140, specular: new THREE.Color('#6d8590'), flatShading: false });
  m.name = 'w_water';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWTime = WTIME;
    sh.vertexShader = 'varying vec3 vWPosW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>',
      '#include <worldpos_vertex>\n vWPosW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform float uWTime;\nvarying vec3 vWPosW;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    vec2 w = vWPosW.xz;
    float t = uWTime;
    vec2 g = vec2(sin(w.x * 0.21 + t * 1.1) + sin(w.y * 0.17 - t * 0.8) * 0.7 + sin((w.x + w.y) * 0.53 + t * 1.7) * 0.35,
                  cos(w.y * 0.23 + t * 0.9) + cos(w.x * 0.19 - t * 1.2) * 0.7 + cos((w.x - w.y) * 0.47 - t * 1.5) * 0.35);
    vec3 nW = normalize(vec3(g.x * 0.07, 1.0, g.y * 0.07));
    normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
  }`);
  };
  m.customProgramCacheKey = () => 'wmat_water';
  cache.set('water', m);
  return m;
}

export function disposeWorldMaterials() {
  for (const m of cache.values()) m.dispose();
  cache.clear();
}
