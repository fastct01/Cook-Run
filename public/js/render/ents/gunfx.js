// ─────────────────────────────────────────────────────────────────────────────
// R3-DEFEND · gun effects in the world, shared by both roles (rv.js → Rook's shots, entities.js →
// the cops' return fire). One instance per scene: GunFx.of(scene, particles).
//   tracer(x0,y0,z0, x1,y1,z1, { warm })   a bright streak flying muzzle → impact + a faint trail
//   impact(x,y,z, kind, { dir })           'body' | 'glass' | 'tyre' | 'radiator' | 'ground' | 'rv'
//   muzzleSmoke(x,y,z, dir, big)           a puff drifting off the muzzle
//   casing(parent, localPos, localVel, variant, floorY)   a spent case bouncing on the roof (RV-local)
//   update(dt)                              (called by RvView every frame)
// No blood, no gore: impacts are sparks, glass glints, rubber/steam puffs and dust only.
// Particles go through the shared pooled billboards (render/particles.js); tracers are a small pool
// of additive boxes (≤ 24 live), casings ≤ 24 meshes. Unity: a TrailRenderer pool + ParticleSystems.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { ATLAS } from '../textures.js';
import { XATLAS } from './atlas.js';

const R = Math.random;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const TRACER_SPEED = 260;     // m/s (visual: slow enough to read at 60 fps)
const MAX_TRACERS = 24, MAX_CASINGS = 24;

export class GunFx {
  /** The scene's shared instance (created on first use). */
  static of(scene, particles) {
    const u = scene.userData;
    if (!u.crGunFx) u.crGunFx = new GunFx(scene, particles);
    else if (particles && !u.crGunFx.P) u.crGunFx.P = particles;
    return u.crGunFx;
  }

  constructor(scene, particles) {
    this.scene = scene; this.P = particles;
    this.root = new THREE.Group(); this.root.name = 'gunFx';
    scene.add(this.root);
    this.geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);   // unit box along +Z from the origin
    this.matHot = new THREE.MeshBasicMaterial({ color: '#fff1c2', transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.matWarm = new THREE.MeshBasicMaterial({ color: '#ff8f45', transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.tracers = [];
    this.casings = [];
    this.time = 0;
    this.layerMask = null;    // set by the owner if tracers must share a layer (default: all layers)
  }

  _tracerMesh(warm) {
    let t = this.tracers.find((q) => !q.live && q.warm === warm);
    if (!t && this.tracers.length < MAX_TRACERS * 2) {
      const head = new THREE.Mesh(this.geo, (warm ? this.matWarm : this.matHot).clone());
      const trail = new THREE.Mesh(this.geo, (warm ? this.matWarm : this.matHot).clone());
      head.frustumCulled = false; trail.frustumCulled = false;
      head.renderOrder = 8; trail.renderOrder = 7;
      this.root.add(head, trail);
      t = { head, trail, live: false, warm };
      this.tracers.push(t);
    }
    if (!t) t = this.tracers.reduce((a, b) => (a.age > b.age ? a : b));
    return t;
  }

  tracer(x0, y0, z0, x1, y1, z1, { warm = false, width = 1 } = {}) {
    const t = this._tracerMesh(warm);
    t.live = true; t.age = 0;
    t.a = new THREE.Vector3(x0, y0, z0); t.b = new THREE.Vector3(x1, y1, z1);
    t.len = t.a.distanceTo(t.b);
    t.T = Math.max(0.02, t.len / TRACER_SPEED);
    t.w = width;
    t.head.visible = true; t.trail.visible = true;
    t.head.position.copy(t.a); t.trail.position.copy(t.a);
    t.head.lookAt(t.b); t.trail.lookAt(t.b);
    t.trail.scale.set(0.012 * width, 0.012 * width, Math.max(0.01, t.len));
    t.head.scale.set(0.035 * width, 0.035 * width, 0.01);
    t.trail.material.opacity = 0.5; t.head.material.opacity = 1;
    return t;
  }

  muzzleSmoke(x, y, z, dir, big = false) {
    const P = this.P; if (!P) return;
    const n = big ? 4 : 2;
    for (let i = 0; i < n; i++) {
      const s = 0.8 + R() * 1.2;
      P.spawn({ x: x + dir.x * 0.1, y: y + dir.y * 0.1, z: z + dir.z * 0.1, vx: dir.x * s + (R() - 0.5) * 0.4, vy: dir.y * s + 0.35 + R() * 0.3, vz: dir.z * s + (R() - 0.5) * 0.4,
        life: 0.9 + R() * 0.6, size: big ? 0.35 : 0.22, size1: big ? 1.6 : 1.0, r: 0.82, g: 0.8, b: 0.77, alpha: 0.45, cell: XATLAS.SOFT, drag: 2.2, fadeIn: 0.02 });
    }
    P.spawn({ x, y, z, life: 0.06, size: big ? 1.3 : 0.9, size1: big ? 1.6 : 1.1, r: 1, g: 0.85, b: 0.5, alpha: 1, cell: ATLAS.GLOW, additive: true, fadeIn: 0 });
  }

  /** kind: 'body' | 'glass' | 'tyre' | 'radiator' | 'ground' | 'rv'; dir = shot direction (unit) */
  impact(x, y, z, kind = 'body', { dir = null, big = false } = {}) {
    const P = this.P; if (!P) return;
    const bx = dir ? -dir.x : 0, by = dir ? -dir.y : 0.5, bz = dir ? -dir.z : 0;   // bounce back toward the shooter
    if (kind === 'ground') {
      for (let i = 0; i < 3; i++) P.spawn({ x, y: y + 0.05, z, vx: (R() - 0.5) * 1.2 + bx, vy: 0.8 + R() * 1.2, vz: (R() - 0.5) * 1.2 + bz, life: 0.9 + R() * 0.5, size: 0.25, size1: 1.1, r: 0.72, g: 0.64, b: 0.52, alpha: 0.55, cell: ATLAS.DUST, drag: 2 });
      for (let i = 0; i < 4; i++) P.spawn({ x, y: y + 0.05, z, vx: (R() - 0.5) * 3 + bx * 2, vy: 1.5 + R() * 2.5, vz: (R() - 0.5) * 3 + bz * 2, gravity: 14, life: 0.5, size: 0.07, size1: 0.05, r: 0.45, g: 0.4, b: 0.34, cell: ATLAS.CHUNK, spin: 9, floor: y });
      return;
    }
    if (kind === 'glass') {
      for (let i = 0; i < 7; i++) P.spawn({ x, y, z, vx: (R() - 0.5) * 2.5 + bx * 1.5, vy: R() * 2, vz: (R() - 0.5) * 2.5 + bz * 1.5, gravity: 9.8, life: 0.45 + R() * 0.3, size: 0.12, size1: 0.06, r: 0.9, g: 0.97, b: 1, alpha: 1, cell: XATLAS.SPARK2, additive: true, spin: 8, floor: y - 1.2 });
      P.spawn({ x, y, z, life: 0.14, size: 0.5, size1: 0.8, r: 0.9, g: 0.96, b: 1, alpha: 0.9, cell: ATLAS.GLOW, additive: true, fadeIn: 0 });
      return;
    }
    if (kind === 'tyre') {
      for (let i = 0; i < (big ? 9 : 3); i++) P.spawn({ x, y, z, vx: (R() - 0.5) * (big ? 3 : 1), vy: 0.3 + R() * (big ? 1.4 : 0.6), vz: (R() - 0.5) * (big ? 3 : 1), life: big ? 1.3 : 0.7, size: big ? 0.4 : 0.2, size1: big ? 2.2 : 0.8, r: big ? 0.78 : 0.2, g: big ? 0.78 : 0.19, b: big ? 0.76 : 0.18, alpha: big ? 0.6 : 0.5, cell: big ? XATLAS.SOFT : ATLAS.PUFF, drag: 2.4 });
      for (let i = 0; i < (big ? 6 : 2); i++) P.spawn({ x, y, z, vx: (R() - 0.5) * 4, vy: 1 + R() * 2, vz: (R() - 0.5) * 4, gravity: 14, life: 0.5, size: 0.08, size1: 0.06, r: 0.12, g: 0.12, b: 0.12, cell: ATLAS.CHUNK, spin: 12, floor: y - 0.4 });
      return;
    }
    if (kind === 'radiator') {
      for (let i = 0; i < (big ? 10 : 4); i++) P.spawn({ x, y, z, vx: (R() - 0.5) * 1.6 + bx * 0.6, vy: 1 + R() * 1.6, vz: (R() - 0.5) * 1.6 + bz * 0.6, life: 1.4 + R() * 0.8, size: 0.3, size1: big ? 2.6 : 1.6, r: 0.95, g: 0.96, b: 0.97, alpha: 0.7, cell: XATLAS.SOFT, drag: 1.5, fadeIn: 0.03 });
    }
    // metal: sparks (body / radiator / the RV / Rook's roof)
    const n = kind === 'rv' ? 12 : 8;
    for (let i = 0; i < n; i++) {
      const s = 2 + R() * 5;
      P.spawn({ x, y, z, vx: (R() - 0.5) * s + bx * 2, vy: R() * s * 0.8, vz: (R() - 0.5) * s + bz * 2, gravity: 13, life: 0.25 + R() * 0.25, size: 0.16, size1: 0.05, r: 1, g: 0.9, b: 0.55, r1: 1, g1: 0.45, b1: 0.1, cell: ATLAS.GLOW, additive: true, floor: y - 2 });
    }
    P.spawn({ x, y, z, life: 0.08, size: 0.45, size1: 0.7, r: 1, g: 0.82, b: 0.45, alpha: 1, cell: ATLAS.GLOW, additive: true, fadeIn: 0 });
    P.spawn({ x, y, z, vx: bx * 0.4, vy: 0.4, vz: bz * 0.4, life: 0.6, size: 0.15, size1: 0.6, r: 0.35, g: 0.33, b: 0.31, alpha: 0.45, cell: ATLAS.PUFF, drag: 2 });
  }

  /** A spent case (createModel'd mesh group) under `parent` (RV-local frame), bouncing on y = floorY. */
  casing(parent, mesh, pos, vel, floorY) {
    if (!parent || !mesh) return;
    while (this.casings.length >= MAX_CASINGS) { const c = this.casings.shift(); c.mesh.removeFromParent(); }
    mesh.position.copy(pos);
    parent.add(mesh);
    this.casings.push({ mesh, v: vel.clone(), w: new THREE.Vector3((R() - 0.5) * 30, (R() - 0.5) * 30, (R() - 0.5) * 30), floorY, rest: false, age: 0, bounced: 0, onBounce: null });
    return this.casings[this.casings.length - 1];
  }

  update(dt) {
    this.time += dt;
    for (const t of this.tracers) {
      if (!t.live) continue;
      t.age += dt;
      const k = t.age / t.T;
      if (k < 1) {
        const segL = Math.min(7, t.len * 0.5);
        const head = Math.min(t.len, k * t.len);
        const tail = Math.max(0, head - segL);
        _d.subVectors(t.b, t.a).normalize();
        t.head.position.copy(t.a).addScaledVector(_d, tail);
        t.head.scale.z = Math.max(0.01, head - tail);
        t.head.material.opacity = 1;
      } else t.head.visible = false;
      const fade = Math.max(0, 1 - t.age / (t.T + 0.16));
      t.trail.material.opacity = 0.42 * fade;
      if (fade <= 0) { t.live = false; t.head.visible = false; t.trail.visible = false; }
    }
    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i];
      c.age += dt;
      const m = c.mesh;
      if (!c.rest) {
        c.v.y -= 9.8 * dt;
        m.position.addScaledVector(c.v, dt);
        m.rotation.x += c.w.x * dt; m.rotation.y += c.w.y * dt; m.rotation.z += c.w.z * dt;
        if (m.position.y < c.floorY + 0.012) {
          m.position.y = c.floorY + 0.012;
          if (Math.abs(c.v.y) < 0.6 || c.bounced > 2) { c.rest = true; m.rotation.x = Math.PI / 2; }
          else { c.v.y = -c.v.y * 0.35; c.v.x *= 0.5; c.v.z *= 0.5; c.w.multiplyScalar(0.5); c.bounced++; if (c.onBounce) c.onBounce(c); }
        }
      }
      if (c.age > 7) { m.removeFromParent(); this.casings.splice(i, 1); }
    }
  }

  dispose() {
    this.root.removeFromParent();
    for (const t of this.tracers) { t.head.material.dispose(); t.trail.material.dispose(); }
    for (const c of this.casings) c.mesh.removeFromParent();
    this.geo.dispose(); this.matHot.dispose(); this.matWarm.dispose();
    if (this.scene.userData.crGunFx === this) this.scene.userData.crGunFx = null;
  }
}

/** Unit direction a → b. */
export function dirOf(x0, y0, z0, x1, y1, z1, out = { x: 0, y: 0, z: 1 }) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, l = Math.hypot(dx, dy, dz) || 1;
  out.x = dx / l; out.y = dy / l; out.z = dz / l;
  return out;
}
void _a; void _b; void _up;
