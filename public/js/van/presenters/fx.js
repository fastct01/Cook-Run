// ─────────────────────────────────────────────────────────────────────────────
// Presenter FX — tiny pooled particle systems + flame tongues for the 3D cook
// stations (Agent VANCOOK). Every pool is ONE InstancedMesh (= one draw call)
// with per-instance colour; particles fade by shrinking (no per-instance alpha),
// which keeps the materials opaque/additive and cheap.
//
// The world particle system (render/particles.js) fades particles within 6 m of
// the camera, which is useless at a 1 m close-up — hence these.
// Unity: a ParticleSystem per pool (mesh render mode, size-over-lifetime curve).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

// shared unit geometries (never disposed)
const GEO = {};
export function fxGeometry(kind) {
  if (GEO[kind]) return GEO[kind];
  let g;
  switch (kind) {
    case 'ico': g = new THREE.IcosahedronGeometry(1, 0); break;
    case 'octa': g = new THREE.OctahedronGeometry(1, 0); break;
    case 'tetra': g = new THREE.TetrahedronGeometry(1, 0); break;
    case 'box': g = new THREE.BoxGeometry(1, 1, 1); break;
    case 'spark': g = new THREE.BoxGeometry(0.35, 0.35, 1.6); break;           // streak along +Z
    case 'flame': {                                                            // tongue, base at y=0, tip at y=1
      g = new THREE.ConeGeometry(0.5, 1, 5, 1, false);
      g.translate(0, 0.5, 0);
      break;
    }
    default: g = new THREE.IcosahedronGeometry(1, 0);
  }
  GEO[kind] = g;
  return g;
}

// shared materials (never disposed; never mutated)
const MATS = {};
export function fxMaterial(kind) {
  if (MATS[kind]) return MATS[kind];
  let m;
  switch (kind) {
    case 'matte': m = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, name: 'VC_fx_matte' }); break;
    case 'steam': m = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, transparent: true, opacity: 0.2, depthWrite: false, name: 'VC_fx_steam' }); break;
    case 'glow': m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, name: 'VC_fx_glow' }); break;
    case 'flame': m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, name: 'VC_fx_flame' }); break;
    case 'liquid': m = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, name: 'VC_fx_liquid' }); break;
    case 'spark': m = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, name: 'VC_fx_spark' }); break;
    default: m = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  }
  MATS[kind] = m;
  return m;
}

/**
 * Pool of simple physics particles drawn as one InstancedMesh.
 *   const dust = new ParticlePool(parent, { cap: 48, geo: 'ico', mat: 'matte', gravity: -1.2 });
 *   dust.emit({ x, y, z, vx, vy, vz, life, size, color, grow, spin });
 *   dust.update(dt);
 */
export class ParticlePool {
  constructor(parent, o = {}) {
    this.cap = o.cap || 48;
    this.gravity = o.gravity ?? -2.4;
    this.drag = o.drag ?? 0.6;
    this.floorY = o.floorY ?? null;       // particles settle on this local y (null = fall forever)
    this.killY = o.killY ?? -2;           // removed below this y
    this.bounce = o.bounce ?? 0.15;
    this.mesh = new THREE.InstancedMesh(fxGeometry(o.geo || 'ico'), fxMaterial(o.mat || 'matte'), this.cap);
    this.mesh.name = o.name || 'fx';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = o.renderOrder ?? 0;
    // instanceColor must exist before the first render so the shader compiles with it
    this.mesh.setColorAt(0, _c.set(o.color || '#ffffff'));
    this.p = [];
    parent.add(this.mesh);
  }

  get alive() { return this.p.length; }

  emit(o) {
    if (this.p.length >= this.cap) this.p.shift();
    const life = o.life ?? 0.8;
    this.p.push({
      x: o.x || 0, y: o.y || 0, z: o.z || 0,
      vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      life, max: life, size: o.size ?? 0.01, grow: o.grow ?? 1,
      rx: o.rx ?? Math.random() * 6, ry: o.ry ?? Math.random() * 6, rz: o.rz ?? 0,
      spin: o.spin ?? 0, color: new THREE.Color(o.color || '#ffffff'),
      g: o.gravity ?? this.gravity, stretch: o.stretch || 0, settled: false,
    });
  }

  burst(n, fn) { for (let i = 0; i < n; i++) this.emit(fn(i)); }

  clear() { this.p.length = 0; this.mesh.count = 0; }

  update(dt) {
    const P = this.p;
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i];
      q.life -= dt;
      if (q.life <= 0 || q.y < this.killY) { P.splice(i, 1); continue; }
      if (!q.settled) {
        q.vy += q.g * dt;
        const k = Math.exp(-this.drag * dt);
        q.vx *= k; q.vz *= k;
        q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
        q.rx += q.spin * dt; q.ry += q.spin * 0.7 * dt;
        if (this.floorY !== null && q.y < this.floorY && q.vy < 0) {
          q.y = this.floorY;
          if (Math.abs(q.vy) > 0.4 && this.bounce > 0) { q.vy = -q.vy * this.bounce; q.vx *= 0.5; q.vz *= 0.5; }
          else { q.vy = 0; q.vx = 0; q.vz = 0; q.settled = true; }
        }
      }
    }
    const n = P.length;
    for (let i = 0; i < n; i++) {
      const q = P[i];
      const k = 1 - q.life / q.max;                       // 0 → 1 over the life
      const fade = q.life < q.max * 0.35 ? q.life / (q.max * 0.35) : 1;
      const s = q.size * (1 + (q.grow - 1) * k) * fade;
      if (q.stretch) {
        // streak along the velocity (sparks, drops)
        _p.set(q.vx, q.vy, q.vz);
        const sp = _p.length() || 1;
        _q.setFromUnitVectors(_s.set(0, 0, 1), _p.divideScalar(sp));
        _s.set(s, s, s * (1 + sp * q.stretch));
      } else {
        _q.setFromEuler(_e.set(q.rx, q.ry, q.rz));
        _s.set(s, s, s);
      }
      _m.compose(_p.set(q.x, q.y, q.z), _q, _s);
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, q.color);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.dispose();
  }
}

/**
 * A ring of flame tongues (one InstancedMesh, additive). Call set() every frame.
 *   const ring = new FlameRing(parent, { count: 10, radius: 0.1, y: 0.08 });
 *   ring.set(t, { radius, height, color, inner, lean, jitter });
 */
export class FlameRing {
  constructor(parent, o = {}) {
    this.count = o.count || 10;
    this.mesh = new THREE.InstancedMesh(fxGeometry('flame'), fxMaterial('flame'), this.count * 2);
    this.mesh.name = o.name || 'flames';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = o.renderOrder ?? 3;
    this.mesh.setColorAt(0, _c.set('#ffffff'));
    this.mesh.position.set(o.x || 0, o.y || 0, o.z || 0);
    this.mesh.count = 0;
    this.seed = o.seed ?? 1;
    parent.add(this.mesh);
  }

  /**
   * @param t      time (s)
   * @param o      { radius, height (0 = off), width, color, inner (core colour), lean (outward rad), jitter (0..1), arc:[a0,a1] }
   */
  set(t, o) {
    const h = o.height || 0;
    if (h <= 0.0005) { this.mesh.count = 0; return; }
    const n = this.count, R = o.radius ?? 0.1, w = o.width ?? 0.03, lean = o.lean ?? 0.25, jit = o.jitter ?? 0.25;
    const outer = _c.set(o.color || '#7fb6d9').clone();
    const inner = new THREE.Color(o.inner || '#dff2ff');
    const a0 = o.arc ? o.arc[0] : 0, a1 = o.arc ? o.arc[1] : Math.PI * 2;
    let k = 0;
    for (let i = 0; i < n; i++) {
      const a = a0 + (a1 - a0) * ((i + 0.5) / n);
      const f = 1 + Math.sin(t * (13 + (i % 4) * 3.1) + i * 1.7 + this.seed) * jit + Math.sin(t * 29 + i * 4.1) * jit * 0.4;
      const hh = h * Math.max(0.2, f);
      // lean outward: rotate +Y toward the radial direction (axis = Y × radial)
      _q.setFromAxisAngle(_s.set(-Math.sin(a), 0, -Math.cos(a)), lean + Math.sin(t * 7 + i) * jit * 0.15);
      for (let layer = 0; layer < 2; layer++) {
        const s = layer === 0 ? 1 : 0.55;
        _p.set(Math.cos(a) * R, 0, -Math.sin(a) * R);
        _m.compose(_p, _q, _s.set(w * s, hh * s, w * s * 0.8));
        this.mesh.setMatrixAt(k, _m);
        this.mesh.setColorAt(k, layer === 0 ? outer : inner);
        k++;
      }
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.dispose();
  }
}

/** Deterministic-ish small random in [a, b). Presenters are view-only, so Math.random is fine here. */
export const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
