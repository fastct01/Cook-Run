// ─────────────────────────────────────────────────────────────────────────────
// FX: comic pop-up words at event positions, pulsing ground markers for supply
// stops / the sell point, and impact bursts. [wreck] explosion(x, y, z, power) fireball +
// scorch(x, y, z, r) decals + one pre-made orange PointLight (explosion flash / burning wreck). DOM overlays (fumes haze, rear
// window frame) are handled by WorldView; police edge pulse lives in the HUD.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { comicWordTexture, ringTexture, ATLAS } from './textures.js';
import { XATLAS } from './ents/atlas.js';

const WORDS = {
  pedHit: [['BONK!', '#ffd94a', '#d8433a'], ['BOING!', '#ffd94a', '#3a6fd8'], ['WHUMP!', '#f1ead8', '#d9a83a'], ['OOF!', '#ffd94a', '#9c4a32']],
  crash: [['CRASH!', '#f1ead8', '#d8433a'], ['KRUNCH!', '#ffd94a', '#9c4a32']],
  smash: [['SMASH!', '#ffd94a', '#4f8f8a'], ['WHAM!', '#f1ead8', '#d9a83a'], ['KLANG!', '#ffd94a', '#9c4a32']],
  copWreck: [['WRECKED!', '#f1ead8', '#3a6fd8']],
  landed: [['THUD!', '#f1ead8', '#9c4a32']],
  // ── expansion ──
  canister: [['BANG!', '#ffffff', '#d8433a']],
  foam: [['FOOMP!', '#fff6d8', '#4f8f8a']],
  splash: [['SPLASH!', '#e8f6ff', '#3a86c8'], ['SPLOOSH!', '#e8f6ff', '#3a86c8']],
  firecracker: [['POP-POP!', '#ffd94a', '#d8433a'], ['BANG!', '#ffd94a', '#d8433a']],
  balloon: [['SPLAT!', '#f1ead8', '#c94f6d']],
  flare: [['FSSSH!', '#ffd94a', '#9c4a32']],
  moo: [['MOO!', '#f1ead8', '#6b5844']],
  whoosh: [['WHOOSH!', '#f1ead8', '#6b5844']],
};
// Set-piece start: a comic word (+ a little burst) where it happens (camera-independent, world space).
// [word, fill, burst, particle colour or null]
const SETPIECE_WORDS = {
  tornado: ['WHOOSH!', '#f1ead8', '#6b5844', [0.75, 0.66, 0.52]],
  cattle_drive: ['MOO!', '#f1ead8', '#6b5844', null],
  parade: ['TA-DAA!', '#ffd94a', '#d8433a', 'confetti'],
  midnight_comet: ['ZOOOM!', '#e8fbff', '#1d2b5a', [0.5, 1, 0.95]],
  drawbridge: ['DING-DING!', '#ffd94a', '#9c4a32', null],
  freight_wagons: ['CLANK!', '#f1ead8', '#9c4a32', [1, 0.8, 0.4]],
  car_carrier: ['KA-CHUNK!', '#f1ead8', '#3a6fd8', null],
  inflatable_gorilla: ['BOING!', '#ffd94a', '#7b62a8', null],
  log_spill: ['TIMBER!', '#ffd94a', '#6b5844', [0.6, 0.45, 0.3]],
  rattlers: ['VROOM!', '#f1ead8', '#22262a', null],
  stagecoach: ['YEEHAW!', '#ffd94a', '#9c4a32', [0.75, 0.62, 0.45]],
  wide_load: ['BEEP BEEP!', '#ffd94a', '#e8a23a', null],
  combine: ['CHUGGA!', '#ffd94a', '#7e9b6e', [0.85, 0.75, 0.4]],
  car_wash: ['SPLOOSH!', '#e8f6ff', '#3a86c8', [0.85, 0.95, 1]],
  pratt_jump: ['NOOOO!', '#f1ead8', '#1f2a44', null],
};
const IDLE_PHASE = /^(idle|wait|waiting|armed|pending|done|gone|over|end|finished)$/;

export class Fx {
  constructor(scene, particles, info, track) {
    this.scene = scene; this.particles = particles; this.info = info; this.track = track;
    this.root = new THREE.Group(); this.root.name = 'fx';
    scene.add(this.root);
    scene.userData.crFx = this;          // entities (ents/*) pop their words through popWord()
    this.spSeen = new Map();             // set-piece id → last phase (start effects)
    this.words = [];
    this.pool = [];
    this.time = 0;
    this.n = 0;
    // markers
    this.looted = new Set();
    this.markers = [];
    const ringGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const arrowGeo = new THREE.ConeGeometry(0.9, 1.8, 4).rotateX(Math.PI);
    this.ringGeo = ringGeo; this.arrowGeo = arrowGeo;
    for (const st of info.stops) {
      const lot = st.lot;
      this.markers.push(this._marker({ id: st.id, x: lot.cx, z: lot.cz, r: Math.min(lot.halfLen, lot.halfDepth + 3) * 1.15, color: '#e8b84a', y: 0.06 }));
    }
    // [wreck] one orange point light for explosions + the burning wreck. Created up front with intensity 0
    // (adding a light later recompiles every material → a hitch right at the explosion).
    this.light = new THREE.PointLight('#ff9a48', 0, 70, 1.4);
    this.light.castShadow = false;
    this.root.add(this.light);
    this.lightFlash = 0;             // decaying explosion flash (0..1+)
    this.burn = null;                // { x, y, z, k } steady fire light (set by the RV wreck every frame)
    this.scorches = [];              // persistent scorch decals { x, y, z, r, rot }
    if (info.sell) {
      const sp = info.sell;
      const hw = track.halfWidth(sp.z) + track.shoulder(sp.z);
      const u = sp.side * (hw + 12);
      this.markers.push(this._marker({ id: '__sell', x: track.xAt(sp.z, u), z: sp.z, r: (sp.radius || 18) * 0.6, color: '#7fd6c2', y: 0.06, sell: true }));
    }
  }

  _marker({ id, x, z, r, color, y, sell }) {
    const ringMat = new THREE.MeshBasicMaterial({ color, map: ringTexture(), transparent: true, depthWrite: false, opacity: 0.85, fog: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 });
    const ring = new THREE.Mesh(this.ringGeo, ringMat);
    ring.position.set(x, y, z); ring.scale.set(r * 2, 1, r * 2); ring.renderOrder = 4;
    const arrowMat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.6, flatShading: true });
    const arrow = new THREE.Mesh(this.arrowGeo, arrowMat);
    arrow.position.set(x, 6, z);
    arrow.castShadow = false;
    this.root.add(ring, arrow);
    return { id, x, z, r, ring, arrow, sell, base: new THREE.Color(color) };
  }

  markLooted(id) { this.looted.add(id); }

  pop(type, x, y, z, { scale = 1 } = {}) {
    const list = WORDS[type];
    if (!list) return;
    const [word, fill, burst] = list[this.n++ % list.length];
    this.popWord(word, x, y, z, { fill, burst, scale: scale * (type === 'copWreck' ? 1.25 : 1) });
  }

  /** Any comic word at a world position: popWord('BANG!', x, y, z, { fill, burst, scale }) */
  popWord(word, x, y, z, { fill = '#ffd94a', burst = '#d8433a', scale = 1 } = {}) {
    // de-duplicate the same word at the same spot within 0.3 s (event + state detection)
    const key = word + '|' + Math.round(x / 3) + '|' + Math.round(z / 3);
    const last = this._recent || (this._recent = new Map());
    if (this.time - (last.get(key) ?? -9) < 0.3) return;
    last.set(key, this.time);
    if (last.size > 64) for (const [k, t] of last) if (this.time - t > 1) last.delete(k);
    let s = this.pool.pop();
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, fog: false }));
      s.renderOrder = 30;
    }
    s.material.map = comicWordTexture(word, { fill, burst });
    s.material.needsUpdate = true;
    s.material.rotation = (Math.random() - 0.5) * 0.3;
    s.position.set(x, y + 2.6, z);
    s.userData = { t: 0, life: 1.15, scale, vy: 1.6 };
    this.root.add(s);
    this.words.push(s);
  }

  /** Optional: WorldView may forward expansion events here (default branch of _event). */
  event(ev, snap) {
    if (!ev) return;
    const rv = snap && snap.rv;
    const y = rv ? rv.y : 0;
    if (ev.type === 'roofHit' && ev.device === 'flare' && typeof ev.x === 'number') this.pop('flare', ev.x, y, ev.z, { scale: 0.85 });
    if (ev.type === 'setpiece' && ev.id) this._setpieceStart({ id: ev.id, type: ev.kind || ev.setpiece || ev.spType, phase: ev.phase, x: ev.x, z: ev.z }, snap);
  }

  _setpieceStart(sp, snap) {
    const prev = this.spSeen.get(sp.id);
    const ph = String(sp.phase ?? 'active');
    this.spSeen.set(sp.id, ph);
    if (prev !== undefined && (prev === ph || !IDLE_PHASE.test(prev))) return;   // only idle → active (or first sight)
    if (IDLE_PHASE.test(ph)) return;
    const w = SETPIECE_WORDS[sp.type];
    if (!w) return;
    const rv = snap && snap.rv;
    let x = sp.x, z = sp.z;
    if (typeof x !== 'number' || typeof z !== 'number') {
      if (!rv) return;
      x = rv.x + Math.sin(rv.yaw) * 30; z = rv.z + Math.cos(rv.yaw) * 30;
    }
    const gy = this.track && this.track.surfaceY(z);
    const y = gy == null ? (rv ? rv.y : 0) : gy;
    this.popWord(w[0], x, y + (sp.type === 'tornado' ? 12 : 1.5), z, { fill: w[1], burst: w[2], scale: sp.type === 'tornado' ? 2.2 : 1.1 });
    const c = w[3];
    if (c === 'confetti') {
      const C = [[0.85, 0.26, 0.23], [0.95, 0.8, 0.25], [0.31, 0.56, 0.54], [0.95, 0.95, 0.9]];
      for (let i = 0; i < 60; i++) { const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 6, k = C[i % 4]; this.particles.spawn({ x, y: y + 4, z, vx: Math.cos(a) * s, vy: 3 + Math.random() * 5, vz: Math.sin(a) * s, gravity: 3, drag: 1.2, life: 2.6, size: 0.25, r: k[0], g: k[1], b: k[2], cell: XATLAS.CONFETTI, spin: 10, floor: y + 0.05 }); }
    } else if (c) {
      for (let i = 0; i < 24; i++) { const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 6; this.particles.spawn({ x: x + Math.cos(a) * 2, y: y + 0.5, z: z + Math.sin(a) * 2, vx: Math.cos(a) * s, vy: 0.6 + Math.random() * 2, vz: Math.sin(a) * s, life: 1.8, size: 1.5, size1: 5, r: c[0], g: c[1], b: c[2], alpha: 0.5, cell: ATLAS.PUFF, drag: 1.6 }); }
    }
  }

  /**
   * [wreck] A big fiery explosion at a world position: white flash, rolling fireball, black smoke
   * billow, sparks/embers, ground shockwave ring, light flash. power ~1 = the RV going up; 0.3–0.7 = secondaries.
   */
  explosion(x, y, z, power = 1) {
    const P = this.particles, p = Math.max(0.2, power), R = Math.random;
    const gy = this._groundY(z, y);
    // flash core + rays
    P.spawn({ x, y: y + 1.2, z, life: 0.16 + 0.1 * p, size: 7 * p, size1: 13 * p, r: 1, g: 0.9, b: 0.7, alpha: 0.9, cell: XATLAS.FLASH, additive: true, fadeIn: 0 });
    P.spawn({ x, y: y + 1.4, z, life: 0.4 + 0.2 * p, size: 5 * p, size1: 10 * p, r: 1, g: 0.5, b: 0.15, alpha: 0.7, cell: ATLAS.GLOW, additive: true, fadeIn: 0 });
    // fireball: lumpy additive puffs rolling outward and up (white-yellow → orange → deep red)
    const nf = Math.round(18 + 30 * p);
    for (let i = 0; i < nf; i++) {
      const a = R() * Math.PI * 2, e = R() * 1.3 - 0.15, s = (3 + R() * 7) * (0.55 + 0.45 * p);
      const ce = Math.cos(e);
      P.spawn({
        x: x + Math.cos(a) * R() * 1.2 * p, y: y + 0.8 + R() * 1.6 * p, z: z + Math.sin(a) * R() * 2 * p,
        vx: Math.cos(a) * ce * s, vy: Math.sin(e) * s + 2.5 * p, vz: Math.sin(a) * ce * s,
        life: 0.7 + R() * 0.8 * p, size: (1.6 + R() * 1.6) * p, size1: (4.5 + R() * 4) * p,
        r: 1, g: 0.68 + R() * 0.15, b: 0.25, r1: 0.55, g1: 0.1, b1: 0.02, alpha: 0.45, cell: R() < 0.8 ? ATLAS.PUFF : ATLAS.FLAME, additive: true,
        drag: 2.4, gravity: -1.5, spin: (R() - 0.5) * 2, fadeIn: 0.02,
      });
    }
    // dense orange fire body (normal blend: keeps its colour instead of saturating to white)
    for (let i = 0; i < Math.round(10 + 16 * p); i++) {
      const a = R() * Math.PI * 2, e = R() * 1.1, s = (2 + R() * 5) * (0.55 + 0.45 * p);
      P.spawn({
        x: x + Math.cos(a) * R() * 1.5 * p, y: y + 1 + R() * 1.5 * p, z: z + Math.sin(a) * R() * 2 * p,
        vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + 3 * p, vz: Math.sin(a) * Math.cos(e) * s,
        life: 0.8 + R() * 0.7, size: (2 + R() * 1.5) * p, size1: (5 + R() * 3) * p,
        r: 1, g: 0.62, b: 0.18, r1: 0.25, g1: 0.08, b1: 0.04, alpha: 0.9, cell: ATLAS.PUFF, drag: 2.2, gravity: -1.5, spin: (R() - 0.5) * 2, fadeIn: 0.02,
      });
    }
    // black smoke billow, slower and bigger, behind the fire
    const ns = Math.round(14 + 26 * p);
    for (let i = 0; i < ns; i++) {
      const a = R() * Math.PI * 2, s = (1.5 + R() * 4) * p, d = 0.05 + R() * 0.09;
      P.spawn({
        x: x + Math.cos(a) * R() * 2 * p, y: y + 1.5 + R() * 2.5 * p, z: z + Math.sin(a) * R() * 2.5 * p,
        vx: Math.cos(a) * s, vy: 2.5 + R() * 4 * p, vz: Math.sin(a) * s,
        life: 2.6 + R() * 2.4 * p, size: (2.5 + R() * 2) * p, size1: (9 + R() * 7) * p,
        r: d, g: d * 0.95, b: d * 0.9, alpha: 1, cell: ATLAS.PUFF, drag: 1.2, spin: (R() - 0.5) * 0.6, fadeIn: 0.25,
      });
    }
    // sparks + embers
    const nk = Math.round(30 + 60 * p);
    for (let i = 0; i < nk; i++) {
      const a = R() * Math.PI * 2, e = 0.15 + R() * 1.25, s = (8 + R() * 18) * (0.5 + 0.5 * p);
      P.spawn({
        x, y: y + 1.4, z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s, vz: Math.sin(a) * Math.cos(e) * s,
        gravity: 14, drag: 0.6, life: 0.8 + R() * 1.4, size: 0.35, size1: 0.1, r: 1, g: 0.92, b: 0.6, r1: 1, g1: 0.4, b1: 0.08,
        cell: R() < 0.5 ? ATLAS.GLOW : ATLAS.SPARK, additive: true, floor: gy + 0.05, spin: 6,
      });
    }
    // ground: shockwave ring + dust skirt
    P.spawn({ x, y: gy + 0.08, z, flat: true, additive: true, life: 0.55, size: 3 * p, size1: 34 * p, r: 1, g: 0.8, b: 0.5, alpha: 0.9, cell: XATLAS.SHOCK, linearSize: true, fadeIn: 0 });
    for (let i = 0; i < Math.round(10 + 14 * p); i++) {
      const a = R() * Math.PI * 2, s = (8 + R() * 8) * p;
      P.spawn({ x: x + Math.cos(a) * 2, y: gy + 0.4, z: z + Math.sin(a) * 2, vx: Math.cos(a) * s, vy: 0.3 + R(), vz: Math.sin(a) * s, life: 1.4 + R(), size: 2, size1: 6 * p, r: 0.55, g: 0.5, b: 0.44, alpha: 0.5, cell: ATLAS.PUFF, drag: 2.6 });
    }
    this.lightFlash = Math.max(this.lightFlash, 0.6 + 0.6 * p);
    this._lightAt = { x, y: y + 5, z };
  }

  /** [wreck] persistent burnt patch on the ground (drawn every frame until dispose). */
  scorch(x, y, z, r = 6) {
    if (this.scorches.length > 8) this.scorches.shift();
    this.scorches.push({ x, y: this._groundY(z, y), z, r, rot: Math.random() * 6.28 });
  }

  _groundY(z, fallback) {
    const s = this.track && this.track.surfaceY(z);
    return s == null || !Number.isFinite(s) || Math.abs(s - fallback) > 3 ? fallback : s;
  }

  _updateLight(dt) {
    const L = this.light;
    this.lightFlash = Math.max(0, this.lightFlash - dt * 2.6);
    const b = this.burn;
    let I = 0;
    if (b && b.k > 0) {
      const fl = 0.72 + 0.28 * Math.sin(this.time * 19) * Math.sin(this.time * 7.7 + 1.3);
      I = 70 * b.k * fl;
      L.position.set(b.x, b.y, b.z);
    }
    if (this.lightFlash > 0.01) {
      I = Math.max(I, 300 * this.lightFlash * this.lightFlash);
      if (this._lightAt && !(b && b.k > 0)) L.position.set(this._lightAt.x, this._lightAt.y, this._lightAt.z);
    }
    L.intensity = I;
    L.color.setRGB(1, 0.62 + 0.25 * Math.min(1, this.lightFlash), 0.3 + 0.35 * Math.min(1, this.lightFlash));
    for (const s of this.scorches) {
      this.particles.once({ x: s.x, y: s.y + 0.04, z: s.z, flat: true, cell: XATLAS.SPLAT, size: s.r * 2, rot: s.rot, r: 0.03, g: 0.028, b: 0.025, alpha: 0.88 });
      this.particles.once({ x: s.x, y: s.y + 0.05, z: s.z, flat: true, cell: ATLAS.GLOW, size: s.r * 1.6, rot: s.rot, r: 0.02, g: 0.018, b: 0.015, alpha: 0.7 });
    }
  }

  burst(x, y, z, color = [1, 0.9, 0.4], n = 14) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 5;
      this.particles.spawn({ x, y: y + 1, z, vx: Math.cos(a) * s, vy: 2 + Math.random() * 4, vz: Math.sin(a) * s, gravity: 9, life: 0.7, size: 0.5, size1: 0.2, r: color[0], g: color[1], b: color[2], cell: ATLAS.STAR, spin: 8, floor: 0.1 });
    }
  }

  update(dt, snap, camPos) {
    this.time += dt;
    this._updateLight(dt);
    // set-piece start effects (from the snapshot, so it works for both roles without event forwarding)
    if (snap && Array.isArray(snap.setpieces)) for (const sp of snap.setpieces) if (sp && sp.id) this._setpieceStart(sp, snap);
    // words
    for (let i = this.words.length - 1; i >= 0; i--) {
      const s = this.words[i], u = s.userData;
      u.t += dt;
      const t = u.t / u.life;
      if (t >= 1) { s.removeFromParent(); this.words.splice(i, 1); this.pool.push(s); continue; }
      const pop = t < 0.15 ? 0.3 + (t / 0.15) * 1.0 : t < 0.25 ? 1.3 - ((t - 0.15) / 0.1) * 0.3 : 1.0;
      const d = camPos ? Math.max(8, s.position.distanceTo(camPos)) : 20;
      const k = u.scale * pop * (0.12 * d * 0.5 + 2.2) * 0.55;
      s.scale.set(k * 2, k, 1);
      s.position.y += u.vy * dt;
      s.material.opacity = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
    }
    // markers
    const active = snap && snap.stop ? snap.stop : null;
    for (const m of this.markers) {
      const done = m.sell ? false : this.looted.has(m.id);
      const near = camPos ? Math.abs(camPos.z - m.z) < 600 : true;
      const show = !done && near && !(snap && snap.phase === 'won' && m.sell);
      m.ring.visible = show; m.arrow.visible = show;
      if (!show) continue;
      const inside = active && active.id === m.id;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * (inside ? 7 : 3.2));
      const k = 1 + pulse * 0.06;
      m.ring.scale.set(m.r * 2 * k, 1, m.r * 2 * k);
      m.ring.rotation.y = this.time * 0.3;
      m.ring.material.opacity = 0.5 + 0.35 * pulse;
      if (inside) {
        m.ring.material.color.set(active.blocked ? '#d8433a' : '#7fd6c2');
      } else m.ring.material.color.copy(m.base);
      m.arrow.position.y = 6.2 + Math.sin(this.time * 2.4) * 0.6;
      m.arrow.rotation.y = this.time * 1.4;
      m.arrow.material.color.copy(m.ring.material.color);
      m.arrow.material.emissive.copy(m.ring.material.color);
    }
  }

  dispose() {
    if (this.scene.userData.crFx === this) delete this.scene.userData.crFx;
    this.root.removeFromParent();
    this.light.dispose?.();
    for (const m of this.markers) { m.ring.material.dispose(); m.arrow.material.dispose(); }
    for (const s of [...this.words, ...this.pool]) s.material.dispose();
    this.ringGeo.dispose(); this.arrowGeo.dispose();
  }
}
