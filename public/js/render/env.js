// ─────────────────────────────────────────────────────────────────────────────
// Environment (VIEW-WORLD-A): gradient sky dome, distance fog, sun (directional,
// shadowed, follows the RV), hemisphere fill — driven by the TIME OF DAY
// (snap.timeOfDay, 6.6 → 19.8 h along the route) and blended with each area's
// route.json colours. Dawn: warm, low, from behind-left. Noon: white, high, from
// the left (south). Golden hour / sunset: orange → red, low, ahead-left, long
// shadows. After ~18.5 h the baked street lights / neon (GLOW) brighten.
// The dust storm overrides fog with a thick orange-brown haze.
//   env.update(dt, focus, z, dustTarget, camera, hour?)   hour defaults to the route keyframes at z
//   env.exposure (WorldView applies it), env.night (0..1), env.hour
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { GLOW } from './world/materials.js';

const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }`;
const SKY_FRAG = /* glsl */`
  uniform vec3 top, horizon, ground, sunDir, sunCol, glowCol;
  uniform float haze, sunSize;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 c = mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.5));
    float s = max(dot(d, sunDir), 0.0);
    // warm glow around the low sun, spread along the horizon
    float hz = 1.0 - clamp(abs(h) * 3.0, 0.0, 1.0);
    c += glowCol * (pow(s, 6.0) * 0.55 + pow(s, 2.0) * 0.18 * hz);
    c = mix(c, horizon, haze);
    if (h < 0.0) c = mix(horizon, ground, clamp(-h * 6.0, 0.0, 1.0));
    c += sunCol * (pow(s, sunSize) * 1.4 + pow(s, 40.0) * 0.16) * (1.0 - haze * 0.8);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;

const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _c3 = new THREE.Color(), _v = new THREE.Vector3();
const DUST_FOG = new THREE.Color('#b8875a');
const DUST_SKY = new THREE.Color('#c69466');
const WHITE = new THREE.Color('#ffffff');

// time-of-day keys: hour → palette (sRGB hex) and light levels
const TOD = [
  { h: 6.0, sun: '#ff9450', sunI: 1.9, top: '#7a8cb8', hor: '#f6b07e', glow: '#ff9a62', hemi: 0.8, fogW: 0.72, exp: 1.12 },
  { h: 7.0, sun: '#ffae6c', sunI: 2.1, top: '#8098c4', hor: '#f2c294', glow: '#ffb27a', hemi: 0.92, fogW: 0.58, exp: 1.1 },
  { h: 8.4, sun: '#ffdcb6', sunI: 2.3, top: '#88b2d8', hor: '#dcdcd6', glow: '#ffe2c0', hemi: 1.1, fogW: 0.3, exp: 1.08 },
  { h: 10.5, sun: '#fff3e2', sunI: 2.5, top: '#88bde0', hor: '#d2e3ea', glow: '#ffffff', hemi: 1.22, fogW: 0.18, exp: 1.08 },
  { h: 14.5, sun: '#fff3e0', sunI: 2.5, top: '#88bbdf', hor: '#d8e2e0', glow: '#fff6e6', hemi: 1.22, fogW: 0.2, exp: 1.08 },
  { h: 16.2, sun: '#ffcf8a', sunI: 2.45, top: '#86acd0', hor: '#efd2a2', glow: '#ffd49a', hemi: 1.1, fogW: 0.4, exp: 1.09 },
  { h: 17.4, sun: '#ffa452', sunI: 2.45, top: '#8496c0', hor: '#f4b878', glow: '#ffa858', hemi: 1.0, fogW: 0.62, exp: 1.12 },
  { h: 18.4, sun: '#ff8c44', sunI: 2.2, top: '#7480b0', hor: '#f4a06a', glow: '#ff8e4a', hemi: 0.92, fogW: 0.7, exp: 1.14 },
  { h: 19.2, sun: '#ff7440', sunI: 1.9, top: '#5e6898', hor: '#ee8660', glow: '#ff7040', hemi: 0.84, fogW: 0.74, exp: 1.16 },
  { h: 20.0, sun: '#ff5c32', sunI: 1.5, top: '#48548a', hor: '#e06c58', glow: '#ff5832', hemi: 0.76, fogW: 0.78, exp: 1.2 },
];
for (const k of TOD) for (const key of ['sun', 'top', 'hor', 'glow']) k[key] = new THREE.Color(k[key]);

export const SUNRISE = 6.2, SUNSET = 20.0, NOON = 12.8, SUN_MAX = 62 * Math.PI / 180;
/** sun elevation (rad): low and slow at both ends (long dawn / golden-hour light), 62° at 12:48 */
export function sunElevAt(h) {
  const s = h < NOON ? Math.sin(Math.PI / 2 * Math.max(0, h - SUNRISE) / (NOON - SUNRISE)) : Math.sin(Math.PI / 2 * Math.max(0, SUNSET - h) / (SUNSET - NOON));
  return Math.max(0.03, SUN_MAX * Math.pow(Math.max(0, s), 1.6));
}
/** sun direction (toward the sun) for an hour; +X = the driver's left (south), +Z = ahead (west) */
export function sunDirAt(h, out = new THREE.Vector3()) {
  const k = Math.min(1, Math.max(0, (h - SUNRISE) / (SUNSET - SUNRISE)));
  const e = sunElevAt(h);
  const phi = Math.PI * (0.8 - 0.5 * k);
  const ce = Math.cos(e);
  return out.set(Math.sin(phi) * ce, Math.sin(e), Math.cos(phi) * ce).normalize();
}
function todAt(h) {
  if (h <= TOD[0].h) return [TOD[0], TOD[0], 0];
  for (let i = 1; i < TOD.length; i++) if (h <= TOD[i].h) { const a = TOD[i - 1], b = TOD[i]; return [a, b, (h - a.h) / (b.h - a.h)]; }
  const l = TOD[TOD.length - 1]; return [l, l, 0];
}
const lerp = (a, b, t) => a + (b - a) * t;

export class Environment {
  constructor(scene, info, { shadows = true, shadowSize = 2048 } = {}) {
    this.scene = scene; this.info = info;
    this.fog = new THREE.Fog('#c5dbe2', 90, 340);
    scene.fog = this.fog;
    this.bg = new THREE.Color();
    scene.background = this.bg;

    this.skyU = {
      top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, ground: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color('#fff3dc') }, glowCol: { value: new THREE.Color() },
      haze: { value: 0 }, sunSize: { value: 900 },
    };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
    }));
    sky.scale.setScalar(2000);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.sky = sky;
    scene.add(sky);

    this.hemi = new THREE.HemisphereLight('#dfe9f0', '#8a7a62', 1.25);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff3dc', 2.4);
    this.sun.castShadow = shadows;
    const sc = this.sun.shadow;
    sc.mapSize.set(shadowSize, shadowSize);
    sc.camera.left = -60; sc.camera.right = 60; sc.camera.top = 60; sc.camera.bottom = -60;
    sc.camera.near = 1; sc.camera.far = 300;
    sc.bias = -0.0006; sc.normalBias = 0.05;
    sc.radius = 2;
    scene.add(this.sun, this.sun.target);
    this.sunDir = new THREE.Vector3(0.4, 0.8, 0.3).normalize();
    this.dust = 0;
    this.fogNear = 90; this.fogFar = 340;
    this.fogColor = new THREE.Color();
    this.groundColor = new THREE.Color();
    this.hour = 12; this.night = 0; this.exposure = 1.08; this.elev = 1;
  }

  // focus: point the shadow frustum centres on (RV); z for biome lookup; dustTarget 0..1; hour (optional)
  update(dt, focus, z, dustTarget, camera, hour = null) {
    const info = this.info;
    const k = 1 - Math.exp(-dt * 1.2);
    this.dust += (dustTarget - this.dust) * (dt > 0 ? k : 1);
    const d = this.dust;
    const h = hour ?? (typeof info.hourAt === 'function' ? info.hourAt(z) : 12);
    this.hour = h;
    const [A, B, t] = todAt(h);
    // biome colours, pulled toward the time-of-day palette
    const fogW = lerp(A.fogW, B.fogW, t);
    const todHor = _c3.copy(A.hor).lerp(B.hor, t);
    const sky = info.color(z, 'sky', _c1);
    const fog = info.color(z, 'fog', _c2);
    fog.lerp(todHor, fogW);
    this.fogColor.copy(fog).lerp(DUST_FOG, d);
    this.fog.color.copy(this.fogColor);
    this.bg.copy(this.fogColor);
    const near = info.num(z, 'fogNear'), far = info.num(z, 'fogFar');
    this.fogNear = near * (1 - d) + 4 * d;
    this.fogFar = far * (1 - d) + 75 * d;
    this.fog.near = this.fogNear; this.fog.far = this.fogFar;
    const top = this.skyU.top.value.copy(A.top).lerp(B.top, t).lerp(sky.multiplyScalar(0.9), 0.35 * (1 - fogW * 0.6));
    top.lerp(DUST_SKY, d);
    this.skyU.horizon.value.copy(fog).lerp(top, 0.12).lerp(DUST_FOG, d);
    this.skyU.ground.value.copy(this.fogColor);
    this.skyU.haze.value = d;
    this.skyU.glowCol.value.copy(A.glow).lerp(B.glow, t).multiplyScalar(0.55 * (1 - Math.min(1, this.elev * 2.2)));
    // sun
    sunDirAt(h, this.sunDir);
    this.elev = Math.asin(this.sunDir.y);
    this.skyU.sunDir.value.copy(this.sunDir);
    this.skyU.sunSize.value = this.elev < 0.12 ? 420 : 900;
    const biomeSun = info.color(z, 'sun', _c1);
    this.sun.color.copy(A.sun).lerp(B.sun, t).lerp(biomeSun, 0.25);
    this.skyU.sunCol.value.copy(this.sun.color);
    this.sun.intensity = lerp(A.sunI, B.sunI, t) * (1 + 0.35 * (1 - Math.min(1, this.elev / 0.35))) * (1 - d * 0.65);
    this.hemi.intensity = lerp(A.hemi, B.hemi, t) + d * 0.45;
    // low sun: the sky fill picks up the sun's warmth (dawn / golden hour / sunset)
    const warm = 1 - Math.min(1, this.elev / 0.45);
    this.hemi.color.copy(top).lerp(WHITE, 0.42).lerp(this.sun.color, 0.42 * warm).lerp(DUST_FOG, d * 0.6);
    info.color(z, 'ground', this.groundColor);
    this.hemi.groundColor.copy(this.groundColor).multiplyScalar(0.72).lerp(this.sun.color, 0.12);
    this.exposure = lerp(A.exp, B.exp, t);
    // street lights / neon brighten in the evening
    this.night = Math.min(1, Math.max(0, (h - 18.3) / 1.3));
    GLOW.value = 1 + 2.4 * this.night * this.night;
    // shadow camera follows the focus, texel-snapped to avoid shimmering
    const sc = this.sun.shadow.camera;
    const span = sc.right - sc.left;
    const texel = span / this.sun.shadow.mapSize.x;
    const fx = focus.x, fz = focus.z;
    const L = 140;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + this.sunDir.x * L, Math.max(6, this.sunDir.y * L), fz + this.sunDir.z * L);
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
    sc.updateMatrixWorld();
    const lp = _v.set(fx, 0, fz).applyMatrix4(sc.matrixWorldInverse);
    const sx = Math.round(lp.x / texel) * texel - lp.x, sy = Math.round(lp.y / texel) * texel - lp.y;
    if (sx || sy) {
      const off = new THREE.Vector3(sx, sy, 0).transformDirection(sc.matrixWorld).multiplyScalar(Math.hypot(sx, sy));
      this.sun.position.add(off); this.sun.target.position.add(off);
      this.sun.target.updateMatrixWorld(); this.sun.updateMatrixWorld();
    }
    if (camera) this.sky.position.copy(camera.position);
  }

  setShadowFocus(radius) {
    const sc = this.sun.shadow.camera;
    sc.left = -radius; sc.right = radius; sc.top = radius; sc.bottom = -radius;
    sc.updateProjectionMatrix();
  }

  dispose() {
    this.sky.geometry.dispose(); this.sky.material.dispose();
    this.sun.shadow.map && this.sun.shadow.map.dispose();
    this.scene.remove(this.sky, this.sun, this.sun.target, this.hemi);
  }
}
