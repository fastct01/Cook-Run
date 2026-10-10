// ─────────────────────────────────────────────────────────────────────────────
// Pooled billboard particle system: one InstancedBufferGeometry quad per blend
// mode (normal + additive) → 2 draw calls for every particle in the game.
// Expansion: two more layers of FLAT quads lying on the ground (decals: ripples,
// shockwave rings, paint splats, airborne-car shadows, foam) — `{ flat: true }` —
// drawn only when used (0 calls otherwise).
// Textures: the canvas atlas (textures.js, cells 0–15) + page 2 (ents/atlas.js,
// cells 16–31) combined in one 8×4 texture. Fog is applied manually.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { particleAtlas } from './textures.js';
import { drawExtraPage } from './ents/atlas.js';

const UV_CELL = /* glsl */`
    float page = floor(cell / 16.0);
    float cc = cell - page * 16.0;
    vec2 cellXY = vec2(mod(cc, 4.0) + page * 4.0, floor(cc / 4.0));
    vUv = vec2((cellXY.x + uv.x) / 8.0, 1.0 - (cellXY.y + 1.0 - uv.y) / 4.0);`;
const VERT = /* glsl */`
  attribute vec3 iPos;
  attribute vec4 iCol;
  attribute vec3 iMisc; // size, rotation, cell
  varying vec4 vCol;
  varying vec2 vUv;
  varying float vFogDepth;
  void main() {
    vCol = iCol;
    float cell = iMisc.z;
    ${UV_CELL}
    vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
    float c = cos(iMisc.y), s = sin(iMisc.y);
    vec2 p = (uv - 0.5) * iMisc.x;
    mv.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    vFogDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
// flat: the quad lies in the XZ plane (ground decal), rotated around Y
const VERT_FLAT = /* glsl */`
  attribute vec3 iPos;
  attribute vec4 iCol;
  attribute vec3 iMisc; // size, rotation, cell
  varying vec4 vCol;
  varying vec2 vUv;
  varying float vFogDepth;
  void main() {
    vCol = iCol;
    float cell = iMisc.z;
    ${UV_CELL}
    float c = cos(iMisc.y), s = sin(iMisc.y);
    vec2 p = (uv - 0.5) * iMisc.x;
    vec3 wp = iPos + vec3(c * p.x - s * p.y, 0.0, s * p.x + c * p.y);
    vec4 mv = modelViewMatrix * vec4(wp, 1.0);
    vFogDepth = -mv.z + 6.0;   // no near fade for decals
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */`
  uniform sampler2D map;
  uniform vec3 fogColor;
  uniform float fogNear, fogFar, fogAmt;
  varying vec4 vCol;
  varying vec2 vUv;
  varying float vFogDepth;
  void main() {
    vec4 t = texture2D(map, vUv);
    vec4 c = vec4(vCol.rgb * t.rgb, vCol.a * t.a);
    if (c.a < 0.004) discard;
    c.a *= smoothstep(0.6, 6.0, vFogDepth);      // fade out right in front of the camera
    if (c.a < 0.004) discard;
    float f = smoothstep(fogNear, fogFar, vFogDepth) * fogAmt;
    c.rgb = mix(c.rgb, fogColor, f);
    gl_FragColor = c;
    #include <colorspace_fragment>
  }`;

let combined = null;
function combinedAtlas() {
  if (combined) return combined;
  const base = particleAtlas();
  const img = base.image;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, 256, 256);
  g.save(); g.translate(256, 0); drawExtraPage(g); g.restore();
  combined = new THREE.CanvasTexture(c);
  combined.colorSpace = THREE.SRGBColorSpace;
  combined.generateMipmaps = true;
  combined.minFilter = THREE.LinearMipmapLinearFilter;
  return combined;
}

class Layer {
  constructor(cap, additive, flat = false) {
    this.cap = cap;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    g.setAttribute('uv', base.attributes.uv);
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4);
    this.misc = new Float32Array(cap * 3);
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aMisc = new THREE.InstancedBufferAttribute(this.misc, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iCol', this.aCol); g.setAttribute('iMisc', this.aMisc);
    g.instanceCount = 0;
    this.uniforms = {
      map: { value: combinedAtlas() },
      fogColor: { value: new THREE.Color('#ffffff') }, fogNear: { value: 100 }, fogFar: { value: 400 },
      fogAmt: { value: additive ? 0.85 : 1.0 },
    };
    const m = new THREE.ShaderMaterial({
      vertexShader: flat ? VERT_FLAT : VERT, fragmentShader: FRAG, uniforms: this.uniforms,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    if (flat) { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -6; }
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = flat ? (additive ? 5 : 4) : (additive ? 11 : 10);
    this.mesh.visible = false;
    this.geo = g; this.mat = m;
    // particle state
    this.p = [];
    for (let i = 0; i < cap; i++) this.p.push({ alive: false });
    this.alive = [];
    this.free = this.p.slice();
    this.onceList = [];
  }
  // draw one billboard for the current frame only (no simulation)
  once(o) { if (this.onceList.length < 400) this.onceList.push(o); }
  spawn(o) {
    let q = this.free.pop();
    if (!q) { q = this.alive.shift(); if (!q) return null; } // steal oldest
    q.alive = true;
    q.x = o.x; q.y = o.y; q.z = o.z;
    q.vx = o.vx || 0; q.vy = o.vy || 0; q.vz = o.vz || 0;
    q.age = 0; q.life = o.life || 1;
    q.s0 = o.size ?? 1; q.s1 = o.size1 ?? q.s0;
    q.r = o.r ?? 1; q.g = o.g ?? 1; q.b = o.b ?? 1;
    q.r1 = o.r1 ?? q.r; q.g1 = o.g1 ?? q.g; q.b1 = o.b1 ?? q.b;
    q.a = o.alpha ?? 1; q.fadeIn = o.fadeIn ?? 0.08;
    q.rot = o.rot ?? Math.random() * 6.28; q.vr = o.spin ?? 0;
    q.cell = o.cell ?? 0; q.drag = o.drag ?? 0; q.grav = o.gravity ?? 0;
    q.floor = o.floor ?? -1e9;
    q.lin = !!o.linearSize;
    this.alive.push(q);
    return q;
  }
  update(dt) {
    let n = 0;
    const P = this.pos, C = this.col, M = this.misc;
    const keep = [];
    for (const q of this.alive) {
      q.age += dt;
      if (q.age >= q.life) { q.alive = false; this.free.push(q); continue; }
      const k = Math.exp(-q.drag * dt);
      q.vx *= k; q.vy = q.vy * k - q.grav * dt; q.vz *= k;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < q.floor) { q.y = q.floor; q.vy *= -0.3; q.vx *= 0.6; q.vz *= 0.6; }
      q.rot += q.vr * dt;
      keep.push(q);
      if (n >= this.cap) continue;
      const t = q.age / q.life;
      const fi = q.fadeIn > 0 ? Math.min(1, q.age / q.fadeIn) : 1;
      const fo = 1 - t * t;
      P[n * 3] = q.x; P[n * 3 + 1] = q.y; P[n * 3 + 2] = q.z;
      C[n * 4] = q.r + (q.r1 - q.r) * t; C[n * 4 + 1] = q.g + (q.g1 - q.g) * t; C[n * 4 + 2] = q.b + (q.b1 - q.b) * t;
      C[n * 4 + 3] = q.a * fi * fo;
      M[n * 3] = q.s0 + (q.s1 - q.s0) * (q.lin ? t : Math.sqrt(t)); M[n * 3 + 1] = q.rot; M[n * 3 + 2] = q.cell;
      n++;
    }
    this.alive = keep;
    for (const o of this.onceList) {
      if (n >= this.cap) break;
      P[n * 3] = o.x; P[n * 3 + 1] = o.y; P[n * 3 + 2] = o.z;
      C[n * 4] = o.r ?? 1; C[n * 4 + 1] = o.g ?? 1; C[n * 4 + 2] = o.b ?? 1; C[n * 4 + 3] = o.alpha ?? 1;
      M[n * 3] = o.size ?? 1; M[n * 3 + 1] = o.rot ?? 0; M[n * 3 + 2] = o.cell ?? 0;
      n++;
    }
    this.onceList.length = 0;
    this.geo.instanceCount = n;
    if (n) {
      this.aPos.clearUpdateRanges(); this.aPos.addUpdateRange(0, n * 3); this.aPos.needsUpdate = true;
      this.aCol.clearUpdateRanges(); this.aCol.addUpdateRange(0, n * 4); this.aCol.needsUpdate = true;
      this.aMisc.clearUpdateRanges(); this.aMisc.addUpdateRange(0, n * 3); this.aMisc.needsUpdate = true;
    }
    this.mesh.visible = n > 0;
  }
  clear() { for (const q of this.alive) { q.alive = false; this.free.push(q); } this.alive = []; this.geo.instanceCount = 0; this.onceList.length = 0; }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

export class Particles {
  constructor(scene, { cap = 1200 } = {}) {
    this.normal = new Layer(cap, false);
    this.add = new Layer(Math.floor(cap / 2), true);
    this.flat = new Layer(320, false, true);
    this.flatAdd = new Layer(160, true, true);
    this.layers = [this.normal, this.add, this.flat, this.flatAdd];
    scene.add(this.normal.mesh, this.add.mesh, this.flat.mesh, this.flatAdd.mesh);
  }
  _layer(o) { return o.flat ? (o.additive ? this.flatAdd : this.flat) : (o.additive ? this.add : this.normal); }
  spawn(o) { return this._layer(o).spawn(o); }
  once(o) { this._layer(o).once(o); }
  setFog(color, near, far) {
    for (const l of this.layers) { l.uniforms.fogColor.value.copy(color); l.uniforms.fogNear.value = near; l.uniforms.fogFar.value = far; }
  }
  update(dt) { for (const l of this.layers) l.update(dt); }
  get count() { return this.normal.alive.length + this.add.alive.length + this.flat.alive.length + this.flatAdd.alive.length; }
  clear() { for (const l of this.layers) l.clear(); }
  dispose() { for (const l of this.layers) { l.mesh.removeFromParent(); l.dispose(); } }
}
