// ─────────────────────────────────────────────────────────────────────────────
// roofFx — WORLD-space effects of the roof defence (Agent ROOF), all local to the cook's view:
//   thrown projectiles (firecracker string / paint balloon / smoke flare) flying a parabola,
//   firecracker sparks + flashes + smoke + a comic "BANG!", paint splat decals + droplets,
//   red flare smoke (radius rules.roof.flare.radius, rules.roof.flare.seconds), hose splashes.
// Particles go through view.particles (the world's pooled billboards: 2 draw calls total).
// Projectiles are created on a local throw (instant feedback) and/or from snap.roof.fx entries
// (authoritative; solo AI throws) and de-duplicated by id.
// Unity: pooled projectile prefabs + ParticleSystems + a URP decal projector for the splat.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { ATLAS } from '../../render/textures.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const PAINT = ['#c94f6d', '#3e9e9a', '#d9b13a', '#7b62a8'];
const _p = new THREE.Vector3();
let _seed = 1;
const rnd = () => { _seed = (_seed * 16807) % 2147483647; return _seed / 2147483647; };   // cosmetic only
const hexRgb = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class RoofFx {
  constructor(view, createModel, rules = {}) {
    this.view = view;
    this.scene = view.scene;
    this.cm = (k, v = 0) => { try { return createModel ? createModel(k, v) : null; } catch (e) { return null; } };
    this.R = rules;
    this.items = [];
    this.byId = new Map();
    this.root = new THREE.Group(); this.root.name = 'roof_fx'; this.scene.add(this.root);
    this.time = 0;
    this.splatTex = canvasTex(128, 128, (g, w) => {
      g.fillStyle = '#fff';
      const blob = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
      blob(64, 64, 34);
      for (let i = 0; i < 14; i++) { const a = i * 2.39996, d = 30 + (i % 3) * 8, r = 6 + (i * 7) % 9; blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r); }
      for (let i = 0; i < 10; i++) { const a = i * 0.77 + 0.3, d = 48 + (i % 4) * 4; blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 3 + (i % 3)); }
      void w;
    });
    this.bangTex = canvasTex(256, 128, (g) => {
      g.translate(128, 64); g.rotate(-0.12);
      g.beginPath();
      for (let i = 0; i < 22; i++) { const a = (i / 22) * Math.PI * 2, r = i % 2 ? 46 : 62; g.lineTo(Math.cos(a) * r * 1.8, Math.sin(a) * r); }
      g.closePath(); g.fillStyle = '#ffd94a'; g.fill(); g.lineWidth = 6; g.strokeStyle = '#7a2a10'; g.stroke();
      g.font = '900 54px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 8; g.strokeStyle = '#22262a'; g.strokeText('BANG!', 0, 4); g.fillStyle = '#e8423a'; g.fillText('BANG!', 0, 4);
    });
    this.stickGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.32, 6).rotateZ(Math.PI / 2);
    this.stickMat = new THREE.MeshLambertMaterial({ color: '#c8322a', emissive: '#5a0c08' });
    this.capMat = new THREE.MeshBasicMaterial({ color: '#ffe0a0' });
    this.capGeo = new THREE.SphereGeometry(0.045, 6, 4);
    this.splatGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  }

  groundY(x, z) { const y = this.view.track?.surfaceY?.(z); return (y == null ? 0 : y); }

  // ── projectiles ──────────────────────────────────────────────────────────
  /** from: world Vector3 (Doc's hand), to: {x, z}; T: flight seconds; id: sim fx id or null (local prediction). */
  launch(device, from, to, T, { id = null, t = 0, variant = null } = {}) {
    const obj = this._projectileObj(device, variant);
    const ty = this.groundY(to.x, to.z);
    const it = { device, id, phase: 'fly', t, T: Math.max(0.1, T), from: from.clone(), to: new THREE.Vector3(to.x, ty, to.z), obj, life: 0, born: this.time,
      variant: variant ?? Math.floor(rnd() * 4), spin: (rnd() - 0.5) * 14 };
    this.root.add(obj);
    this.items.push(it);
    if (id != null) this.byId.set(id, it);
    return it;
  }
  _projectileObj(device, variant) {
    if (device === 'firecracker') {
      const m = this.cm('firecracker_string'); if (m) { m.scale.setScalar(0.55); return m; }
    } else if (device === 'balloon') {
      const m = this.cm('paint_balloon', variant ?? Math.floor(rnd() * 4)); if (m) { m.scale.setScalar(1.25); return m; }
    }
    // flare (and fallbacks): a red stick with a hot tip
    const g = new THREE.Group();
    g.add(new THREE.Mesh(this.stickGeo, this.stickMat));
    const cap = new THREE.Mesh(this.capGeo, this.capMat); cap.position.x = 0.17; g.add(cap);
    return g;
  }
  /** Link a locally predicted projectile to the sim's fx id once it shows up. */
  adopt(it, id) { it.id = id; this.byId.set(id, it); }
  findPending(device, x, z, maxAge = 1.5) {
    let best = null, bd = 2.5;
    for (const it of this.items) {
      if (it.id != null || it.device !== device || this.time - it.born > maxAge) continue;
      const d = Math.hypot(it.to.x - x, it.to.z - z);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
  /** Apply snap.roof.fx (authoritative). Spawns what we haven't seen; nudges timing of what we have. */
  sync(list, handWorld) {
    if (!Array.isArray(list)) return;
    for (const f of list) {
      let it = this.byId.get(f.id);
      if (!it) {
        const pend = f.phase === 'fly' ? this.findPending(f.device, f.x, f.z) : null;
        if (pend) { this.adopt(pend, f.id); continue; }
        if (this._seen && this._seen.has(f.id)) continue;
        if (f.phase === 'fly') it = this.launch(f.device, handWorld || new THREE.Vector3(f.x0, 4.5, f.z0), { x: f.x, z: f.z }, f.T, { id: f.id, t: f.t });
        else if (f.t < f.T - 0.2) { it = this.launch(f.device, new THREE.Vector3(f.x, 0, f.z), { x: f.x, z: f.z }, 0.1, { id: f.id, t: 0.1 }); this._land(it); it.life = f.t; }
      }
      (this._seen ||= new Set()).add(f.id);
    }
    if (this._seen && this._seen.size > 200) this._seen = new Set([...this._seen].slice(-100));
  }

  // ── hose ─────────────────────────────────────────────────────────────────
  /** Continuous splash where the stream lands (world), called each frame while spraying. */
  splash(x, y, z, dt, hit = false) {
    const P = this.view.particles;
    if (!P) return;
    const n = Math.min(4, Math.max(1, Math.round(dt * (hit ? 70 : 40))));
    for (let i = 0; i < n; i++) {
      P.spawn({ x: x + (rnd() - 0.5) * 0.5, y: y + 0.1, z: z + (rnd() - 0.5) * 0.5, vx: (rnd() - 0.5) * 3, vy: 1.2 + rnd() * 2.2, vz: (rnd() - 0.5) * 3,
        life: 0.45 + rnd() * 0.3, size: 0.35, size1: 1.1, r: 0.85, g: 0.95, b: 1, alpha: 0.7, cell: ATLAS.PUFF, gravity: 6, drag: 1.5, floor: y });
    }
  }
  burst(x, y, z, color = '#cdeefe', n = 14) {
    const P = this.view.particles;
    if (!P) return;
    const [r, g, b] = hexRgb(color);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, s = 1.5 + rnd() * 3;
      P.spawn({ x, y: y + 0.6, z, vx: Math.cos(a) * s, vy: 1.5 + rnd() * 3, vz: Math.sin(a) * s, life: 0.6 + rnd() * 0.4, size: 0.4, size1: 1.3, r, g, b, alpha: 0.85, cell: ATLAS.PUFF, gravity: 7, drag: 1.2, floor: y });
    }
  }

  // ── landing effects ──────────────────────────────────────────────────────
  _land(it) {
    it.phase = 'land'; it.life = 0;
    const { x, y, z } = it.to;
    const P = this.view.particles;
    if (it.device === 'firecracker') {
      it.obj.scale.setScalar(1); it.obj.position.set(x, y + 0.01, z); it.obj.rotation.set(0, rnd() * 6.28, 0);
      it.lifeMax = 1.9;
      it.bang = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.bangTex, transparent: true, depthWrite: false, depthTest: false }));
      it.bang.renderOrder = 20; it.bang.position.set(x, y + 2.2, z); it.bang.scale.set(0.01, 0.01, 1);
      this.root.add(it.bang);
      if (P) for (let i = 0; i < 6; i++) P.spawn({ x, y: y + 0.4, z, vx: (rnd() - 0.5) * 2, vy: 1 + rnd(), vz: (rnd() - 0.5) * 2, life: 1.6, size: 1.2, size1: 3.5, r: 0.55, g: 0.55, b: 0.55, alpha: 0.55, cell: ATLAS.PUFF, drag: 1.5 });
    } else if (it.device === 'balloon') {
      it.obj.visible = false;
      const col = new THREE.Color(PAINT[it.variant % 4]);
      const m = new THREE.Mesh(this.splatGeo, new THREE.MeshBasicMaterial({ map: this.splatTex, color: col, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      const r = (this.R.balloon?.radius ?? 2.5);
      m.scale.set(r * 2.1, 1, r * 2.1); m.rotation.y = rnd() * 6.28; m.position.set(x, y + 0.04, z); m.renderOrder = 2;
      this.root.add(m); it.splat = m; it.lifeMax = 8;
      if (P) for (let i = 0; i < 26; i++) {
        const a = rnd() * Math.PI * 2, s = 2 + rnd() * 5;
        P.spawn({ x, y: y + 0.3, z, vx: Math.cos(a) * s, vy: 2 + rnd() * 4, vz: Math.sin(a) * s, life: 0.7 + rnd() * 0.4, size: 0.35, size1: 0.7, r: col.r, g: col.g, b: col.b, alpha: 1, cell: ATLAS.PUFF, gravity: 12, floor: y + 0.05 });
      }
    } else {
      it.obj.position.set(x, y + 0.04, z); it.obj.rotation.set(0, rnd() * 6.28, 0);
      it.lifeMax = this.R.flare?.seconds ?? 6;
    }
  }
  _updateLanded(it, dt) {
    const P = this.view.particles, { x, y, z } = it.to, t = it.life;
    if (it.device === 'firecracker') {
      const on = t < 1.5;
      if (P && on) {
        const n = Math.round(dt * 150);
        for (let i = 0; i < n; i++) {
          const u = rnd() - 0.5, px = x + Math.cos(it.obj.rotation.y) * u * 1.2, pz = z - Math.sin(it.obj.rotation.y) * u * 1.2;
          P.spawn({ x: px, y: y + 0.08, z: pz, vx: (rnd() - 0.5) * 5, vy: 2 + rnd() * 4, vz: (rnd() - 0.5) * 5, life: 0.25 + rnd() * 0.25, size: 0.35, size1: 0.1,
            r: 1, g: 0.8 + rnd() * 0.2, b: 0.35, alpha: 1, cell: rnd() < 0.5 ? ATLAS.SPARK : ATLAS.STAR, gravity: 9, additive: true });
        }
        if (Math.floor(t / 0.11) !== Math.floor((t - dt) / 0.11)) {
          P.spawn({ x: x + (rnd() - 0.5) * 1.4, y: y + 0.3, z: z + (rnd() - 0.5) * 1.4, life: 0.14, size: 3.2, size1: 4.5, r: 1, g: 0.85, b: 0.55, alpha: 1, cell: ATLAS.GLOW, additive: true });
          P.spawn({ x: x + (rnd() - 0.5) * 1.4, y: y + 0.25, z: z + (rnd() - 0.5) * 1.4, life: 0.2, size: 1.2, size1: 2.4, r: 1, g: 1, b: 0.85, alpha: 1, cell: ATLAS.STAR, spin: 8, additive: true });
          if (rnd() < 0.5) P.spawn({ x: x + (rnd() - 0.5), y: y + 0.4, z: z + (rnd() - 0.5), vy: 0.8, life: 1.4, size: 0.8, size1: 2.6, r: 0.6, g: 0.6, b: 0.6, alpha: 0.45, cell: ATLAS.PUFF, drag: 1 });
        }
      }
      if (it.bang) {
        const k = t < 0.18 ? t / 0.18 : 1, fade = clamp((1.1 - t) / 0.4, 0, 1);
        const s = (2.6 + 0.4 * Math.sin(t * 30) * (t < 0.6 ? 1 : 0)) * (0.4 + 0.6 * k);
        it.bang.scale.set(s * 2, s, 1); it.bang.position.y = y + 2.2 + t * 0.6; it.bang.material.opacity = fade;
        it.bang.visible = fade > 0.01;
      }
      it.obj.visible = t < 1.55;
    } else if (it.device === 'balloon') {
      if (it.splat) it.splat.material.opacity = clamp((it.lifeMax - t) / 2, 0, 0.95);
    } else {
      const R = this.R.flare?.radius ?? 9, burning = t < it.lifeMax;
      if (P && burning) {
        P.once({ x, y: y + 0.25, z, size: 1.3 + Math.sin(t * 40) * 0.25, r: 1, g: 0.25, b: 0.15, alpha: 0.95, cell: ATLAS.GLOW, additive: true });
        const grow = clamp(t / 1.2, 0.25, 1);
        const n = Math.max(1, Math.round(dt * 16));
        for (let i = 0; i < n; i++) {
          const a = rnd() * Math.PI * 2, d = rnd() * R * 0.55 * grow;
          P.spawn({ x: x + Math.cos(a) * d, y: y + 0.4 + rnd() * 0.6, z: z + Math.sin(a) * d, vx: Math.cos(a) * (0.6 + rnd()), vy: 0.7 + rnd() * 1.1, vz: Math.sin(a) * (0.6 + rnd()),
            life: 2.6 + rnd(), size: 2.2, size1: 6.5 * grow + 1, r: 0.92, g: 0.3, b: 0.26, r1: 0.78, g1: 0.55, b1: 0.55, alpha: 0.6, fadeIn: 0.3, cell: ATLAS.PUFF, drag: 0.8, spin: (rnd() - 0.5) });
        }
        if (rnd() < dt * 30) P.spawn({ x, y: y + 0.2, z, vx: (rnd() - 0.5) * 2, vy: 1.5 + rnd() * 2, vz: (rnd() - 0.5) * 2, life: 0.4, size: 0.18, size1: 0.05, r: 1, g: 0.7, b: 0.3, alpha: 1, cell: ATLAS.SPARK, gravity: 6, additive: true });
      }
      it.obj.visible = t < it.lifeMax + 0.8;
    }
  }

  update(dt) {
    this.time += dt;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.phase === 'fly') {
        it.t += dt;
        const u = clamp(it.t / it.T, 0, 1);
        const dist = Math.hypot(it.to.x - it.from.x, it.to.z - it.from.z);
        const h = 1.2 + dist * 0.22;
        _p.lerpVectors(it.from, it.to, u); _p.y += 4 * h * u * (1 - u);
        it.obj.position.copy(_p);
        it.obj.rotation.x += it.spin * dt; it.obj.rotation.z += it.spin * 0.6 * dt;
        if (it.device === 'flare' && this.view.particles && rnd() < 0.7) this.view.particles.spawn({ x: _p.x, y: _p.y, z: _p.z, life: 0.5, size: 0.4, size1: 1.2, r: 0.95, g: 0.35, b: 0.3, alpha: 0.6, cell: ATLAS.PUFF, drag: 2 });
        if (u >= 1) this._land(it);
        continue;
      }
      it.life += dt;
      this._updateLanded(it, dt);
      if (it.life > (it.lifeMax ?? 2) + 1) this._remove(i);
    }
  }
  _remove(i) {
    const it = this.items[i];
    this.items.splice(i, 1);
    if (it.id != null && this.byId.get(it.id) === it) this.byId.delete(it.id);
    it.obj.removeFromParent();
    if (it.bang) { it.bang.removeFromParent(); it.bang.material.dispose(); }
    if (it.splat) { it.splat.removeFromParent(); it.splat.material.dispose(); }
  }
  get count() { return this.items.length; }
  clear() { for (let i = this.items.length - 1; i >= 0; i--) this._remove(i); }
  dispose() {
    this.clear();
    this.root.removeFromParent();
    this.splatTex.dispose(); this.bangTex.dispose(); this.stickGeo.dispose(); this.stickMat.dispose(); this.capGeo.dispose(); this.capMat.dispose(); this.splatGeo.dispose();
  }
}
