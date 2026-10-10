// ─────────────────────────────────────────────────────────────────────────────
// Entity renderer: Snapshot.ents tuples [id, kindId, x, y, z, yaw, variant, state]
// → pooled rigged models (1 draw call each, see rig.js) + per-kind animation.
// Created on first sight, hidden as soon as an id is absent, recycled after 1 s.
//
// Base-game kinds keep their hand-written paths below. Every expansion kind is
// driven by the data table in ents/anims.js (channels) plus an optional named
// controller in ents/controllers.js; cops of every kind share ents/copfx.js
// (states 0–8), the tornado is ents/tornado.js. See docs/NOTES-x-ents.md.
//
//   const ev = new EntityView(scene, lib, particles, { rules, track });
//   ev.update(snap.ents, dt, { rv, cam, far, snap? });   // snap optional (set-piece states)
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { KIND } from '../shared/protocol.js';
import { ATLAS } from './textures.js';
import { softDiscTexture, coneGradient } from './textures.js';
import { buildRigProto } from './rig.js';
import { ANIMS, compileChannels, evalChannels } from './ents/anims.js';
import { CONTROLLERS } from './ents/controllers.js';
import { copStatus, disposeCopFx } from './ents/copfx.js';
import { CUSTOM_BUILDERS, PAINT_COLORS } from './ents/models.js';
import { TornadoView } from './ents/tornado.js';
import { StormLight } from './ents/storm.js';
import { XATLAS } from './ents/atlas.js';

const CARS = new Set(['cop', 'cop_suv', 'sedan', 'hatch', 'van', 'pickup', 'bus', 'truck', 'tractor', 'rival']);
const COPS = new Set(['cop', 'cop_suv']);
const SMASH = new Set(['cone', 'trashcan', 'mailbox', 'hydrant', 'barrier', 'sprinkler', 'hay', 'cactus_road']);
const GEYSER = new Set(['hydrant', 'sprinkler']);
const NO_SHADOW = new Set(['pothole', 'sanddrift', 'oil_slick', 'spikes', 'smoke_cloud']);
const LINGER_GROUPS = new Set(['cop', 'vehicle', 'person', 'animal']);
const NEAR = 160;            // particle effects / detail only within this distance
const LOD_FAR = 220;         // beyond: channel animation at 1/3 rate

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _axis = new THREE.Vector3();
const _e = new THREE.Euler();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const DARK = new THREE.Color(0.38, 0.36, 0.35), WHITE = new THREE.Color(1, 1, 1), DIM = new THREE.Color(0.8, 0.78, 0.76);
const hashf = (id, k) => { let h = Math.imul((id | 0) ^ (k * 0x9e3779b1), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const qAxis = (out, axis, ang) => out.setFromAxisAngle(axis, ang);
const R = Math.random;

export class EntityView {
  constructor(scene, lib, particles, { rules, track } = {}) {
    this.scene = scene; this.lib = lib; this.particles = particles; this.P = particles; this.rules = rules || {}; this.track = track;
    this.root = new THREE.Group(); this.root.name = 'entities';
    scene.add(this.root);
    this.map = new Map();      // id → ent record
    this.pool = new Map();     // kind|variant → [inst]
    this.time = 0;
    this.smokeDur = this.rules.gadgets?.smoke?.duration ?? 6;
    this.smokeR = this.rules.gadgets?.smoke?.radius ?? 9;
    this.oilDur = this.rules.gadgets?.oil?.duration ?? 14;
    this.oilR = this.rules.gadgets?.oil?.radius ?? 4.5;
    this.rhinoEvery = this.rules.heat?.rhino?.throwEvery ?? 5.5;
    // shared helper meshes
    this.shadowGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
    this.shadowMatBase = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.4, depthWrite: false, map: softDiscTexture(), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.coneGeo = new THREE.CylinderGeometry(0.35, 1, 1, 18, 1, true).translate(0, -0.5, 0);
    this.coneMat = new THREE.MeshBasicMaterial({ color: '#fff6d8', map: coneGradient(), transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.discMat = new THREE.MeshBasicMaterial({ color: '#fff3c8', map: softDiscTexture(), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
    this.visibleCount = 0;
    this.kindCount = {};
    this.colors = new Map();
    this.storm = new StormLight(scene);
    this.tornado = null;       // TornadoView (lazy)
    this.snap = null; this.rv = null;
  }

  // ── models ──────────────────────────────────────────────────────────────
  _proto(kind, variant) {
    const key = kind + '|' + variant;
    let p = this.lib.entity && this.lib.entity.get(key);
    if (p) return p;
    const def = ANIMS[kind];
    let root;
    const missing = !this.lib.assets || (this.lib.kindList && !this.lib.kindList.has(kind));
    if (CUSTOM_BUILDERS[kind] && missing) root = CUSTOM_BUILDERS[kind](variant);
    else root = this.lib.create(kind, variant);
    p = buildRigProto(root, { partRe: def.parts || /^$/, lightRe: def.lights || /^light_/ });
    p.kind = kind; p.real = this.lib.isReal ? this.lib.isReal(kind) : false;
    p.comp = compileChannels(def, p);
    if (this.lib.entity) this.lib.entity.set(key, p);
    return p;
  }

  _acquire(kind, variant) {
    const key = kind + '|' + variant;
    const list = this.pool.get(key);
    if (list && list.length) return list.pop();
    const def = ANIMS[kind];
    let inst;
    if (def && def.group === 'virtual') {
      const root = new THREE.Group();
      inst = { rig: null, root, size: { w: 1, h: 1, l: 1 }, bbox: new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5)), virtual: true,
        proto: { parts: {}, pivots: [], partBox: [], anchors: {}, wheels: [], lightParts: new Set(), size: { w: 1, h: 1, l: 1 }, userData: {} } };
    } else {
      if (def) this._proto(kind, variant);
      inst = this.lib.instance(kind, variant, { castShadow: def ? def.shadow !== false : !NO_SHADOW.has(kind), receiveShadow: true, depthRig: !!def || kind === 'ped' || kind === 'crossing_gate' });
    }
    const outer = new THREE.Group();
    const spin = new THREE.Group();
    outer.add(spin); spin.add(inst.root);
    inst.outer = outer; inst.spin = spin; inst.key = key; inst.def = def;
    if (inst.virtual) return inst;
    const pb = inst.proto.partBox;
    const wi = inst.proto.parts.wheel_fl ?? inst.proto.parts.wheel_rl ?? inst.proto.parts.wheel_f ?? inst.proto.parts.wheel_r ?? (inst.proto.wheels.length ? inst.proto.parts[inst.proto.wheels[0]] : undefined);
    inst.wheelR = wi !== undefined && !pb[wi].isEmpty() ? Math.max(0.2, (pb[wi].max.y - pb[wi].min.y) / 2) : 0.4;
    inst.halfH = Math.max(0.2, (inst.bbox.max.y - inst.bbox.min.y) / 2);
    inst.lights = [];
    for (const [name, idx] of Object.entries(inst.proto.parts)) {
      if (/^light_(red|blue)/.test(name)) {
        const b = pb[idx];
        if (!b.isEmpty()) inst.lights.push({ name, idx, red: name.startsWith('light_red'), pos: this._topCluster(inst.proto, idx) || b.getCenter(new THREE.Vector3()) });
      }
    }
    if ((COPS.has(kind) || (def && def.group === 'cop')) && !inst.lights.length) {
      // model has no named light parts → synthesize glow positions on the roof
      const b = inst.bbox, y = b.max.y + 0.05, zc = (b.min.z + b.max.z) * 0.5 - 0.2;
      inst.lights.push({ name: 'light_red', red: true, pos: new THREE.Vector3(0.35, y, zc) }, { name: 'light_blue', red: false, pos: new THREE.Vector3(-0.35, y, zc) });
    }
    if (kind === 'crossing_gate') {
      const ai = inst.proto.parts.arm;
      if (ai !== undefined && !pb[ai].isEmpty()) {
        const c = pb[ai].getCenter(new THREE.Vector3()).sub(inst.proto.pivots[ai]);
        const ax = Math.abs(c.x) > Math.abs(c.z);
        inst.armAxis = ax ? Z : X;
        inst.armSign = ax ? Math.sign(c.x || 1) : -Math.sign(c.z || 1);
        inst.armTip = pb[ai].getCenter(new THREE.Vector3());
        // which way is the arm in the rest pose: horizontal (closed) or vertical (open)?
        const sz = pb[ai].getSize(new THREE.Vector3());
        inst.armRestDown = Math.max(sz.x, sz.z) > sz.y;
      }
    }
    return inst;
  }
  // centroid of the highest vertices of a part (light bar on the roof rather than the middle of a
  // lamp mesh that also covers grille / rear strobes)
  _topCluster(proto, idx) {
    const g = proto.geometry, pa = g.attributes.aPart, P = g.attributes.position;
    if (!pa) return null;
    let maxY = -1e9;
    for (let i = 0; i < pa.count; i++) if ((pa.getX(i) + 0.5 | 0) === idx) maxY = Math.max(maxY, P.getY(i));
    if (maxY < -1e8) return null;
    const c = new THREE.Vector3(); let n = 0;
    for (let i = 0; i < pa.count; i++) if ((pa.getX(i) + 0.5 | 0) === idx && P.getY(i) > maxY - 0.25) { c.x += P.getX(i); c.y += P.getY(i); c.z += P.getZ(i); n++; }
    return n ? c.multiplyScalar(1 / n).add(new THREE.Vector3(0, 0.06, 0)) : null;
  }
  /** clusters of a light part's vertices (≈0.8 m grid), model space, cached */
  lightPoints(inst, idx) {
    const pr = inst.proto;
    pr._lp = pr._lp || {};
    if (pr._lp[idx]) return pr._lp[idx];
    const g = pr.geometry, pa = g.attributes.aPart, P = g.attributes.position;
    const cells = new Map();
    for (let i = 0; i < pa.count; i++) {
      if ((pa.getX(i) + 0.5 | 0) !== idx) continue;
      const k = Math.round(P.getX(i) / 0.8) + ',' + Math.round(P.getY(i) / 0.8) + ',' + Math.round(P.getZ(i) / 0.8);
      let c = cells.get(k); if (!c) { c = { x: 0, y: 0, z: 0, n: 0 }; cells.set(k, c); }
      c.x += P.getX(i); c.y += P.getY(i); c.z += P.getZ(i); c.n++;
    }
    const out = [...cells.values()].sort((a, b) => b.n - a.n).slice(0, 6).map((c) => new THREE.Vector3(c.x / c.n, c.y / c.n, c.z / c.n));
    pr._lp[idx] = out;
    return out;
  }
  copLights(inst) { return inst.lights; }

  _release(rec) {
    const inst = rec.inst;
    inst.outer.removeFromParent();
    if (rec.extra) { for (const m of rec.extra) m.removeFromParent(); }
    disposeCopFx(rec);
    if (rec.kind === 'tornado' && this.tornado) this.tornado.setVisible(false);
    if (inst.rig) {
      inst.rig.tint(WHITE);
      inst.rig.resetPose();
      inst.rig.commit();
    }
    inst.spin.position.set(0, 0, 0); inst.spin.quaternion.identity(); inst.spin.scale.set(1, 1, 1); inst.root.position.set(0, 0, 0);
    let list = this.pool.get(inst.key);
    if (!list) { list = []; this.pool.set(inst.key, list); }
    if (list.length < 24) list.push(inst); else if (inst.rig) inst.rig.dispose();
  }

  // ── helpers used by the controllers (ents/controllers.js, ents/copfx.js) ─
  word(text, x, y, z, opts) { const fx = this.scene.userData && this.scene.userData.crFx; if (fx && fx.popWord) fx.popWord(text, x, y, z, opts); }
  rate(rec, key, perSec, dt) { const a = rec.acc; a[key] = (a[key] || 0) + perSec * dt; const n = Math.floor(a[key]); a[key] -= n; return n; }
  color(hex) { let c = this.colors.get(hex); if (!c) { c = new THREE.Color(hex); this.colors.set(hex, c); } return c; }
  groundY(rec) { const s = this.track ? this.track.surfaceY(rec.z) : 0; return s == null ? (rec.groundY ?? 0) : s; }
  setpiece(type, rec) {
    const list = this.snap && this.snap.setpieces;
    if (!Array.isArray(list)) return null;
    let best = null, bd = 1e18;
    for (const s of list) {
      if (!s || s.type !== type) continue;
      const d = rec && typeof s.x === 'number' && typeof s.z === 'number' ? (s.x - rec.x) ** 2 + (s.z - rec.z) ** 2 : 0;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  paintColorNear(rec) {
    let best = null, bd = 64;
    for (const r of this.map.values()) {
      if (r.kind !== 'paint_splat') continue;
      const d = (r.x - rec.x) ** 2 + (r.z - rec.z) ** 2;
      if (d < bd) { bd = d; best = r; }
    }
    return best ? PAINT_COLORS[(best.variant | 0) % 4] : null;
  }
  applyDetached(rec) {
    const det = rec.inst.def && rec.inst.def.detach;
    if (!det || !rec.detached || !rec.detached.size) return;
    for (const n of rec.detached) rec.inst.rig.setScale(n, 0);
    if (det.also) rec.inst.rig.setScale(det.also, 0);
  }
  canisterBurst(rec) {
    if (rec.burst) return;
    rec.burst = true;
    const P = this.P, x = rec.x, z = rec.z, y = Math.max(rec.y, this.groundY(rec)) + 0.3;
    const near = rec.dist == null || rec.dist < 260;
    if ((rec.variant | 0) === 1) {
      // FOAM: a white-yellow foam burst (the sim leaves a foam_patch)
      if (near) {
        for (let i = 0; i < 34; i++) {
          const a = R() * Math.PI * 2, s = 2 + R() * 6;
          P.spawn({ x, y, z, vx: Math.cos(a) * s, vy: 1 + R() * 4, vz: Math.sin(a) * s, gravity: 7, drag: 1.8, life: 1.1 + R() * 0.6, size: 0.8, size1: 2.6, r: 1, g: 0.97, b: 0.82, alpha: 0.95, cell: R() < 0.6 ? XATLAS.FOAM : XATLAS.SOFT, floor: y - 0.2, spin: (R() - 0.5) * 3 });
        }
        for (let i = 0; i < 6; i++) { const a = R() * Math.PI * 2, d = R() * 2.5; P.spawn({ x: x + Math.cos(a) * d, y: y - 0.22, z: z + Math.sin(a) * d, flat: true, life: 2.6, size: 1, size1: 3.2, r: 1, g: 0.97, b: 0.84, alpha: 0.9, cell: XATLAS.FOAM, rot: R() * 6 }); }
        P.spawn({ x, y: y + 0.5, z, life: 0.35, size: 3, size1: 7, r: 1, g: 1, b: 0.9, alpha: 0.7, cell: ATLAS.GLOW, additive: true });
      }
      this.word('FOOMP!', x, y, z, { fill: '#fff6d8', burst: '#4f8f8a', scale: 0.9 });
      return;
    }
    // FLASH: white bloom, shockwave ring, debris, smoke, BANG!
    P.spawn({ x, y: y + 0.6, z, life: 0.3, size: 4, size1: 13, r: 1, g: 1, b: 1, alpha: 1, cell: XATLAS.FLASH, additive: true, fadeIn: 0 });
    P.spawn({ x, y: y + 0.8, z, life: 0.45, size: 8, size1: 17, r: 1, g: 0.97, b: 0.88, alpha: 0.75, cell: ATLAS.GLOW, additive: true, fadeIn: 0 });
    if (near) {
      P.spawn({ x, y: y - 0.22, z, flat: true, life: 0.6, size: 1.5, size1: 24, linearSize: true, r: 1, g: 0.98, b: 0.9, alpha: 0.95, cell: XATLAS.SHOCK, additive: true, fadeIn: 0 });
      P.spawn({ x, y: y + 1, z, life: 0.4, size: 2, size1: 16, linearSize: true, r: 1, g: 1, b: 1, alpha: 0.7, cell: XATLAS.SHOCK, additive: true, fadeIn: 0 });
      P.spawn({ x, y: y - 0.24, z, flat: true, life: 4, size: 3.2, size1: 3.6, r: 0.08, g: 0.07, b: 0.06, alpha: 0.55, cell: ATLAS.GLOW, fadeIn: 0.05 });   // scorch
      for (let i = 0; i < 32; i++) {
        const a = R() * Math.PI * 2, s = 5 + R() * 12;
        P.spawn({ x, y, z, vx: Math.cos(a) * s, vy: 2 + R() * 7, vz: Math.sin(a) * s, gravity: 14, life: 0.4 + R() * 0.4, size: 0.4, size1: 0.12, r: 1, g: 0.95, b: 0.7, r1: 1, g1: 0.5, b1: 0.15, cell: ATLAS.GLOW, additive: true, floor: y - 0.25 });
      }
      for (let i = 0; i < 12; i++) {
        const a = R() * Math.PI * 2, s = 3 + R() * 7;
        P.spawn({ x, y, z, vx: Math.cos(a) * s, vy: 3 + R() * 6, vz: Math.sin(a) * s, gravity: 16, life: 1.1, size: 0.3, size1: 0.25, r: 0.25, g: 0.27, b: 0.32, cell: ATLAS.CHUNK, spin: (R() - 0.5) * 20, floor: y - 0.25 });
      }
      for (let i = 0; i < 12; i++) {
        const a = R() * Math.PI * 2, s = 1 + R() * 3;
        const g = 0.8 + R() * 0.12;
        P.spawn({ x: x + Math.cos(a), y: y + R(), z: z + Math.sin(a), vx: Math.cos(a) * s, vy: 0.8 + R() * 1.6, vz: Math.sin(a) * s, life: 2.2 + R(), size: 1.4, size1: 4.8, r: g, g, b: g, alpha: 0.6, cell: XATLAS.SOFT, drag: 1.4, fadeIn: 0.1 });
      }
    }
    this.word('BANG!', x, y, z, { fill: '#ffffff', burst: '#d8433a', scale: 1.1 });
  }

  // ents: tuples; ctx: { t, dt, rv:{x,y,z}, cam: Vector3, far, snap? }
  update(ents, dt, ctx) {
    this.time += dt;
    const now = this.time;
    this.snap = ctx.snap || (this.scene.userData && this.scene.userData.crSnap) || null;
    this.rv = ctx.rv || null;
    this.cam = ctx.cam;
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    const fresh = this._fresh || (this._fresh = []);
    fresh.length = 0;
    let vis = 0;
    for (const k in this.kindCount) this.kindCount[k] = 0;
    this._tornadoSeen = false;
    const far2 = (ctx.far ?? 400) ** 2;
    for (const e of ents) {
      const id = e[0], kind = KIND[e[1]];
      if (!kind) continue;
      seen.add(id);
      const variant = e[6] | 0;
      let rec = this.map.get(id);
      if (rec && (rec.kind !== kind || rec.variant !== variant)) { this._release(rec); this.map.delete(id); rec = null; }
      if (!rec) {
        let inst;
        try { inst = this._acquire(kind, variant); } catch (err) { console.error('[ents] cannot build', kind, err); seen.delete(id); continue; }
        rec = { id, kind, variant, inst, x: e[2], y: e[3], z: e[4], yaw: e[5], speed: 0, vx: 0, vz: 0, vy: 0, state: e[7], stateT: now, last: now, bornT: now, phase: hashf(id, 1) * 10, spinAng: 0, wheelAng: 0, extra: null, shown: false, roll: new THREE.Quaternion(), yawRate: 0, acc: {}, tq: new THREE.Quaternion(), air: 0 };
        if (inst.rig && inst.def && inst.proto.comp) rec.cacc = new Float64Array(inst.proto.comp.list.length);
        this.root.add(inst.outer);
        this.map.set(id, rec);
        rec.first = true;
        fresh.push(rec);
      }
      rec.last = now;
      const x = e[2], y = e[3], z = e[4], yaw = e[5], st = e[7];
      if (!rec.first && dt > 0) {
        const ivx = (x - rec.x) / dt, ivz = (z - rec.z) / dt;
        const k = 1 - Math.exp(-dt * 8);
        if (Math.abs(ivx) + Math.abs(ivz) < 120) { rec.vx += (ivx - rec.vx) * k; rec.vz += (ivz - rec.vz) * k; }
        rec.vy = (y - rec.y) / dt;
        let dy = yaw - rec.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        rec.yawRate += (dy / dt - rec.yawRate) * k;
      }
      if (rec.first) { const g = this.groundY({ x, z, groundY: 0 }); rec.groundY = g; rec.spawnAir = y - g > 0.8; }
      rec.first = false;
      rec.x = x; rec.y = y; rec.z = z; rec.yaw = yaw;
      if (st !== rec.state) { rec.prevState = rec.state; rec.state = st; rec.stateT = now; }
      rec.speed = Math.hypot(rec.vx, rec.vz);
      const fwd = rec.vx * Math.sin(yaw) + rec.vz * Math.cos(yaw);
      rec.fwd = fwd;
      const dx = x - ctx.cam.x, dz = z - ctx.cam.z;
      const d2 = dx * dx + dz * dz;
      const show = kind === 'tornado' || (d2 < far2 && !(SMASH.has(kind) && st === 2));
      rec.inst.outer.visible = show;
      if (rec.extra) for (const m of rec.extra) m.visible = show && m.userData.want !== false;
      rec.dist = Math.sqrt(d2);
      rec.near = rec.dist < NEAR;
      if (!show) continue;
      vis++;
      this.kindCount[kind] = (this.kindCount[kind] || 0) + 1;
      try { this._animate(rec, dt, ctx); } catch (err) { if (!this._warned) { this._warned = true; console.error('[ents] animate', kind, err); } }
    }
    // spawn-linked reactions: Rhino throws (new canister next to it), cargo / logs leaving their truck
    if (fresh.length) this._linkFresh(fresh);
    // hide absent / recycle after 1 s
    // absent ids: vehicles/peds linger 0.2 s at their last pose (hides one dropped network
    // snapshot when the entity cap reshuffles), everything else hides at once; recycled after 1 s
    for (const [id, rec] of this.map) {
      if (seen.has(id)) continue;
      const g = rec.inst.def && rec.inst.def.group;
      const linger = (CARS.has(rec.kind) || rec.kind === 'ped' || LINGER_GROUPS.has(g)) && now - rec.last < 0.2;
      if (!linger) {
        rec.inst.outer.visible = false;
        if (rec.extra) for (const m of rec.extra) m.visible = false;
        if (rec.splat) rec.splat.visible = false;
        // a canister that vanished while armed went off (in case the sim drops it without a state-2 frame)
        if (rec.kind === 'flashbang' && rec.state === 1 && !rec.burst && now - rec.last < 0.5) this.canisterBurst(rec);
      }
      if (now - rec.last > 1) { this._release(rec); this.map.delete(id); }
    }
    // tornado driven by the set-piece state alone (no `tornado` ent in the snapshot)
    if (!this._tornadoSeen) {
      const sp = this.setpiece('tornado', null);
      if (sp && typeof sp.x === 'number' && typeof sp.z === 'number') {
        this._tornadoUpdate({ x: sp.x, y: sp.y ?? this.groundY({ x: sp.x, z: sp.z }), z: sp.z, ...this._tornadoParams(sp) }, dt);
        this._tornadoSeen = true;
      } else if (this.tornado) { this.tornado.setVisible(false); this.storm.set(0); this.tornadoPos = null; }
    }
    this.storm.update(dt);
    this.visibleCount = vis;
  }

  _linkFresh(fresh) {
    for (const nr of fresh) {
      if (nr.kind === 'flashbang' && nr.state === 0) {
        let best = null, bd = 14 * 14;
        for (const r of this.map.values()) {
          if (r.kind !== 'rhino_truck') continue;
          const d = (r.x - nr.x) ** 2 + (r.z - nr.z) ** 2;
          if (d < bd) { bd = d; best = r; }
        }
        if (best) { if (best.door == null || best.door < 0.6) best.justThrew = true; best.throwAt = this.time; best.missed = 0; best.phantom = false; }
        continue;
      }
      for (const r of this.map.values()) {
        const det = r.inst.def && r.inst.def.detach;
        if (!det || r === nr || !det.kinds.includes(nr.kind)) continue;
        if ((r.x - nr.x) ** 2 + (r.z - nr.z) ** 2 > det.radius * det.radius) continue;
        // hide the cargo part nearest to where the new ent appeared
        const re = new RegExp('^' + det.glob.replace('*', '\\d+') + '$');
        r.inst.outer.updateMatrixWorld(true);
        let bestN = null, bd = 1e9;
        for (const [n, i] of Object.entries(r.inst.proto.parts)) {
          if (!re.test(n) || (r.detached && r.detached.has(n))) continue;
          const pb = r.inst.proto.partBox[i];
          if (pb.isEmpty()) continue;
          pb.getCenter(_v); r.inst.root.localToWorld(_v);
          const d = (_v.x - nr.x) ** 2 + (_v.y - nr.y) ** 2 + (_v.z - nr.z) ** 2;
          if (d < bd) { bd = d; bestN = n; }
        }
        if (bestN) { (r.detached || (r.detached = new Set())).add(bestN); nr.spawnAir = true; break; }
      }
    }
  }

  _tornadoParams(s) {
    // set-piece state → visual params (defensive: every field optional)
    const ph = String(s.phase || '');
    let intensity = typeof s.intensity === 'number' ? s.intensity : /idle|wait|gone|done|over|end/.test(ph) ? 0 : /form|spin.?up|dissip|fade|weak/.test(ph) ? 0.55 : 1;
    if (s.active === false) intensity = 0;
    // SETPIECES' tornado: radius = core radius (9 m × intensity), spin = ±2.4 rad/s (sign = direction)
    const r = typeof s.radius === 'number' ? s.radius : 9;
    const sp = typeof s.spin === 'number' ? s.spin / 2.4 : 1;
    const spin = Math.sign(sp || 1) * Math.max(0.3, Math.min(2, Math.abs(sp)));
    return { height: s.height ?? 70, radius: Math.max(10, Math.min(40, r * 3)), spin, intensity, bendX: s.bendX || 0, bendZ: s.bendZ || 0 };
  }
  _tornadoUpdate(p, dt) {
    if (!this.tornado) this.tornado = new TornadoView(this.scene, this.P, this.storm);
    this.tornado.setVisible(true);
    this.tornado.update(dt, p, this._camObj());
    this.tornadoPos = p;
  }
  _camObj() {
    // the controllers want a camera-like { position }; ctx.cam is the camera position vector
    if (!this._camProxy) this._camProxy = { position: new THREE.Vector3() };
    if (this.cam) this._camProxy.position.copy(this.cam);
    return this._camProxy;
  }

  _animate(rec, dt, ctx) {
    const { inst, kind } = rec;
    const o = inst.outer, sp = inst.spin;
    o.position.set(rec.x, rec.y, rec.z);
    o.rotation.set(0, rec.yaw, 0);
    sp.position.set(0, 0, 0); sp.quaternion.identity();
    inst.root.position.set(0, 0, 0);
    const def = inst.def;
    if (def) { this._animateX(rec, dt, ctx, def); return; }
    const rig = inst.rig;
    const P = this.particles;
    const age = (this.time - rec.stateT);

    if (CARS.has(kind)) {
      // wheels
      rec.wheelAng += (rec.fwd * dt) / inst.wheelR;
      qAxis(_q, X, rec.wheelAng);
      for (const w of inst.proto.wheels) rig.setRot(w, _q);
      let wob = 0;
      if (COPS.has(kind)) {
        o.updateMatrixWorld(true);
        wob = copStatus(this, rec, undefined, dt);
      } else {
        if (rec.state === 2) wob = Math.sin(age * 12) * 0.08 * Math.max(0, 1 - age / 2);
        rig.tint(rec.state === 1 ? DIM : WHITE);
        if (rec.state === 1 && Math.random() < dt * 3) {
          o.updateMatrixWorld(true);
          _v.set(0, inst.bbox.max.y * 0.6, inst.bbox.max.z * 0.8); o.localToWorld(_v);
          P.spawn({ x: _v.x, y: _v.y, z: _v.z, vy: 1.2, life: 1.8, size: 0.8, size1: 2.4, r: 0.75, g: 0.75, b: 0.74, alpha: 0.4, cell: ATLAS.PUFF, drag: 0.6 });
        }
      }
      if (!this._air(rec, dt)) {
        if (wob) { sp.position.y = inst.halfH * 0.4; inst.root.position.y = -inst.halfH * 0.4; sp.rotation.set(wob * 0.5, 0, wob); }
        // body bounce with speed
        if (rec.speed > 2) o.position.y += Math.abs(Math.sin(this.time * 9 + rec.phase)) * 0.015;
      }
      rig.commit();
      return;
    }

    switch (kind) {
      case 'ped': this._ped(rec, dt, age); break;
      case 'heli': this._heli(rec, dt, ctx); break;
      case 'crossing_gate': this._gate(rec, dt); break;
      case 'smoke_cloud': this._smoke(rec); break;
      case 'oil_slick': this._oil(rec); break;
      case 'falling_rock': this._rock(rec); break;
      case 'tumbleweed': this._roll(rec, dt, 0.7); break;
      case 'cow': {
        const walking = rec.speed > 0.2;
        rec.phase += dt * (walking ? 4 + rec.speed * 2 : 0);
        const sw = walking ? Math.sin(rec.phase) * 0.35 : 0;
        if (rig) {   // diagonal gait: FL+RR swing together, FR+RL opposite
          rig.setRot('leg_fl', qAxis(_q, X, sw)); rig.setRot('leg_rr', qAxis(_q, X, sw));
          rig.setRot('leg_fr', qAxis(_q, X, -sw)); rig.setRot('leg_rl', qAxis(_q, X, -sw));
        }
        if (walking) { o.position.y += Math.abs(Math.sin(this.time * 6 + rec.phase)) * 0.05; }
        // MOO! when the RV gets close (cattle drive)
        if (this.rv && rec.dist < 60 && Math.hypot(this.rv.x - rec.x, this.rv.z - rec.z) < 9 && this.time - (rec.mooT ?? -99) > 5 && hashf(rec.id, 7) < 0.6) {
          rec.mooT = this.time;
          this.word('MOO!', rec.x, rec.y + 1.2, rec.z, { fill: '#f1ead8', burst: '#6b5844', scale: 0.8 });
        }
        break;
      }
      default: break;
    }
    if (SMASH.has(kind)) {
      if (rec.state === 1) {
        // knocked: tumble while flying
        rec.spinAng += dt * (6 + hashf(rec.id, 3) * 6);
        _axis.set(hashf(rec.id, 4) - 0.5, 0.2, hashf(rec.id, 5) - 0.5).normalize();
        sp.position.y = inst.halfH; inst.root.position.y = -inst.halfH;
        qAxis(sp.quaternion, _axis, rec.spinAng);
        if (GEYSER.has(kind)) {
          if (!rec.geyser) rec.geyser = { x: rec.x, z: rec.z, t: this.time };
        }
      }
      if (rec.geyser) this._geyser(rec, dt);
    }
    if (rig) rig.commit();
  }

  // ── expansion kinds: table channels + controller + shared group behaviour ─
  _animateX(rec, dt, ctx, def) {
    const inst = rec.inst, rig = inst.rig, o = inst.outer, sp = inst.spin;
    if (def.group === 'virtual') {
      if (rec.kind === 'tornado') {
        this._tornadoSeen = true;
        const s = this.setpiece('tornado', rec) || {};
        this._tornadoUpdate({ x: rec.x, y: rec.y, z: rec.z, ...this._tornadoParams(s), ...(rec.state >= 2 && s.intensity == null ? { intensity: 0 } : {}) }, dt);
        return;
      }
      const c = CONTROLLERS[def.ctrl]; if (c) c(this, rec, dt);
      return;
    }
    // people knocked about by the RV (ped states 2 airborne, 3 down, 4 getting up; cop_officer 1 = diving)
    if (def.group === 'person' && (rec.state === 2 && rec.kind !== 'kestrel' || rec.state === 3 || rec.state === 4 || (rec.kind === 'cop_officer' && rec.state === 1))) {
      const st = rec.state; if (rec.kind === 'cop_officer' && st === 1) rec.state = 2;
      this._ped(rec, dt, this.time - rec.stateT);
      rec.state = st;
      rig.commit();
      return;
    }
    // LOD: far entities animate their channels at a third of the rate (accumulated dt)
    rec.lodAcc = (rec.lodAcc || 0) + dt;
    const lod = rec.dist > LOD_FAR ? 3 : 1;
    rec.lodN = ((rec.lodN || 0) + 1) % lod;
    const doAnim = rec.lodN === 0;
    const adt = rec.lodAcc;
    if (doAnim) rec.lodAcc = 0;
    if (doAnim) {
      if (def.wheels && inst.proto.wheels.length) {
        rec.wheelAng += (rec.fwd * adt) / inst.wheelR;
        qAxis(_q, X, rec.wheelAng);
        for (const w of inst.proto.wheels) rig.setRot(w, _q);
      }
      const comp = inst.proto.comp;
      if (comp && comp.list.length) evalChannels(comp, rig, rec.cacc, { t: this.time + rec.phase, dt: adt, speed: rec.speed, fwd: rec.fwd, yawRate: rec.yawRate, state: rec.state, seed: hashf(rec.id, 2) });
    }
    o.updateMatrixWorld(true);
    const c = def.ctrl && CONTROLLERS[def.ctrl];
    if (c) c(this, rec, dt);
    let wob = 0;
    if (def.group === 'cop') wob = copStatus(this, rec, def, dt);
    const flying = (def.group === 'vehicle' || def.group === 'cop') && this._air(rec, dt);
    if (!flying) {
      if (wob) { sp.position.y = inst.halfH * 0.4; inst.root.position.y = -inst.halfH * 0.4; sp.rotation.set(wob * 0.5, 0, wob + sp.rotation.z); }
      if ((def.group === 'cop' || def.group === 'vehicle') && rec.speed > 2 && def.ctrl !== 'moto') o.position.y += Math.abs(Math.sin(this.time * 9 + rec.phase)) * 0.015;
    }
    rig.commit();
  }

  // Vehicles in the air (tornado, cargo falling off the carrier): tumble + ground shadow.
  // Returns true while airborne/recovering (caller skips its own wobble).
  _air(rec, dt) {
    const inst = rec.inst, sp = inst.spin;
    const g = this.groundY(rec);
    const h = rec.y - g;
    const tor = this.tornadoPos && Math.hypot(this.tornadoPos.x - rec.x, this.tornadoPos.z - rec.z) < 160;
    const up = h > 0.8 && (tor || rec.spawnAir || h > 6);
    if (up) {
      rec.air = 1;
      rec.tumbling = true;
      if (!rec.tAxis) rec.tAxis = new THREE.Vector3(hashf(rec.id, 11) - 0.5, (hashf(rec.id, 12) - 0.5) * 0.6, hashf(rec.id, 13) - 0.5).normalize();
      const tsp = this.setpiece('tornado', rec);
      const rateR = (tor ? 2.2 + hashf(rec.id, 14) * 3 : 3.2) * (tsp && typeof tsp.spin === 'number' ? Math.max(0.5, tsp.spin) : 1);
      _q.setFromAxisAngle(rec.tAxis, rateR * dt);
      rec.tq.premultiply(_q);
      // shadow on the ground under it, sharper and darker as it comes down
      const k = Math.max(0, 1 - h / 45);
      const L = Math.max(2.5, inst.size ? Math.max(inst.size.l || 0, inst.size.w || 0) : 3);
      this.P.once({ x: rec.x, y: g + 0.06, z: rec.z, flat: true, cell: ATLAS.GLOW, size: L * (1.2 + h * 0.03), r: 0, g: 0, b: 0, alpha: 0.55 * k * k });
    } else if (rec.air > 0) {
      // landed: settle back upright
      rec.air = Math.max(0, rec.air - dt * 2.5);
      rec.tq.slerp(_q2.identity(), Math.min(1, dt * 5));
      if (rec.air === 0) { rec.tq.identity(); rec.tumbling = false; rec.spawnAir = false; }
    } else return false;
    sp.position.y = inst.halfH; inst.root.position.y = -inst.halfH;
    sp.quaternion.copy(rec.tq);
    return true;
  }

  _ped(rec, dt, age) {
    const rig = rec.inst.rig, sp = rec.inst.spin, o = rec.inst.outer;
    const s = rec.state;
    const P = this.particles;
    const sp01 = Math.min(1, rec.speed / 3.5);
    if (s === 0 || s === 1) {
      const run = s === 1;
      rec.phase += dt * (run ? 11 : 2.2 + rec.speed * 3.2) * (rec.speed > 0.15 || run ? 1 : 0.15);
      const amp = run ? 0.85 : 0.25 + 0.35 * sp01;
      const sw = Math.sin(rec.phase) * amp;
      rig.setRot('leg_l', qAxis(_q, X, sw)); rig.setRot('leg_r', qAxis(_q, X, -sw));
      if (run) {
        // arms up, flailing
        rig.setRot('arm_l', _q.setFromEuler(_e.set(-2.6 + Math.sin(rec.phase * 1.3) * 0.4, 0, 0.35)));
        rig.setRot('arm_r', _q.setFromEuler(_e.set(-2.6 - Math.sin(rec.phase * 1.3) * 0.4, 0, -0.35)));
      } else {
        rig.setRot('arm_l', qAxis(_q, X, -sw * 0.8)); rig.setRot('arm_r', qAxis(_q, X, sw * 0.8));
      }
      rig.setRot('head', qAxis(_q, Y, run ? Math.sin(rec.phase * 0.7) * 0.4 : 0));
      o.position.y += Math.abs(Math.cos(rec.phase)) * (run ? 0.12 : 0.04);
      return;
    }
    if (s === 2) {
      // airborne: cartoon tumble around the body centre
      rec.spinAng += dt * 11;
      sp.position.y = 1.0; rec.inst.root.position.y = -1.0;
      _axis.set(1, 0, 0.35 * Math.sin(rec.phase)).normalize();
      qAxis(sp.quaternion, _axis, -rec.spinAng);
      rig.setRot('arm_l', _q.setFromEuler(_e.set(-2.8, 0, 0.9))); rig.setRot('arm_r', _q.setFromEuler(_e.set(-2.8, 0, -0.9)));
      rig.setRot('leg_l', qAxis(_q, Z, 0.5)); rig.setRot('leg_r', qAxis(_q, Z, -0.5));
      return;
    }
    // lying on the back (3), blending up (4)
    const up = s === 4 ? Math.min(1, age / 0.9) : 0;
    const k = up * up * (3 - 2 * up);
    const lie = (1 - k);
    qAxis(sp.quaternion, X, -Math.PI / 2 * lie);
    o.position.y += 0.22 * lie;
    rig.setRot('arm_l', _q.setFromEuler(_e.set(0, 0, 1.25 * lie))); rig.setRot('arm_r', _q.setFromEuler(_e.set(0, 0, -1.25 * lie)));
    rig.setRot('leg_l', qAxis(_q, Z, 0.3 * lie)); rig.setRot('leg_r', qAxis(_q, Z, -0.3 * lie));
    rig.setRot('head', qAxis(_q, Y, Math.sin(this.time * 3) * 0.35 * lie));
    if (s === 3 || up < 0.7) {
      // circling stars above the head
      o.updateMatrixWorld(true);
      _v2.set(0, 0.55 + 1.2 * k, -1.55 * lie);
      for (let i = 0; i < 3; i++) {
        const a = this.time * 4 + (i * Math.PI * 2) / 3;
        _v.set(_v2.x + Math.cos(a) * 0.45, _v2.y + 0.25 + Math.sin(a * 2) * 0.05, _v2.z + Math.sin(a) * 0.45);
        o.localToWorld(_v);
        P.once({ x: _v.x, y: _v.y, z: _v.z, cell: ATLAS.STAR, size: 0.42, rot: a, alpha: 1 - up });
      }
    }
  }

  _heli(rec, dt, ctx) {
    const rig = rec.inst.rig;
    rec.spinAng += dt * 28;
    rig.setRot('rotor', qAxis(_q, Y, rec.spinAng));
    rig.setRot('tail_rotor', qAxis(_q, X, rec.spinAng * 1.7));
    // gentle nose-down + sway
    rec.inst.spin.rotation.set(0.08 + Math.sin(this.time * 0.9) * 0.03, 0, Math.sin(this.time * 0.7 + rec.phase) * 0.05);
    if (!rec.extra) {
      const cone = new THREE.Mesh(this.coneGeo, this.coneMat); cone.renderOrder = 12; cone.frustumCulled = false;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), this.discMat); disc.renderOrder = 3;
      this.root.add(cone, disc);
      rec.extra = [cone, disc];
    }
    const [cone, disc] = rec.extra;
    const on = rec.state === 1;
    cone.userData.want = on; disc.userData.want = on;
    cone.visible = on; disc.visible = on;
    if (!on) return;
    rec.inst.outer.updateMatrixWorld(true);
    const anc = rec.inst.proto.anchors.spot;
    _v.set(anc ? anc.x : 0, anc ? anc.y : 0.3, anc ? anc.z : 1.5);
    rec.inst.outer.localToWorld(_v);
    // aim at the RV if near, else ahead/below
    const tx = ctx.rv && Math.hypot(ctx.rv.x - rec.x, ctx.rv.z - rec.z) < 70 ? ctx.rv.x + Math.sin(this.time * 0.8) * 1.5 : rec.x + Math.sin(rec.yaw) * 8;
    const tz = ctx.rv && Math.hypot(ctx.rv.x - rec.x, ctx.rv.z - rec.z) < 70 ? ctx.rv.z + Math.cos(this.time * 0.6) * 1.5 : rec.z + Math.cos(rec.yaw) * 8;
    const ty = (ctx.rv ? ctx.rv.y : 0) + 0.05;
    _v2.set(tx - _v.x, ty - _v.y, tz - _v.z);
    const L = _v2.length();
    cone.position.copy(_v);
    cone.quaternion.setFromUnitVectors(_axis.set(0, -1, 0), _v2.normalize());
    cone.scale.set(5.5, L, 5.5);
    disc.position.set(tx, ty + 0.04, tz);
    disc.scale.setScalar(6.5 + Math.sin(this.time * 5) * 0.2);
  }

  _gate(rec, dt) {
    const inst = rec.inst, rig = inst.rig;
    const down = rec.state === 1;
    rec.armK = rec.armK ?? (down ? 1 : 0);
    rec.armK += ((down ? 1 : 0) - rec.armK) * Math.min(1, dt * 2.2);
    if (inst.armAxis) {
      // raised angle when open; if the model's rest pose is vertical, invert
      const open = 1 - rec.armK;
      const ang = inst.armRestDown ? open * 1.45 * inst.armSign : -rec.armK * 1.45 * inst.armSign;
      rig.setRot('arm', qAxis(_q, inst.armAxis, ang));
    }
    const fl = down && (this.time * 2) % 1 < 0.5;
    rig.setEmitPrefix('light_red', down ? (fl ? 3 : 0.1) : 0);
    if (down && rec.dist < 200) {
      rec.inst.outer.updateMatrixWorld(true);
      _v.set(0, inst.bbox.max.y * 0.82, 0.35); rec.inst.outer.localToWorld(_v);
      const side = fl ? 0.38 : -0.38;
      _v2.set(side, 0, 0).applyAxisAngle(Y, rec.yaw);
      this.particles.once({ x: _v.x + _v2.x, y: _v.y, z: _v.z + _v2.z, cell: ATLAS.GLOW, size: 1.6, r: 1, g: 0.2, b: 0.12, alpha: 0.95, additive: true });
    }
  }

  _smoke(rec) {
    rec.inst.root.visible = false;
    const age = (rec.state | 0) / 10;
    const dur = this.smokeDur, R = this.smokeR;
    const grow = Math.min(1, age / 1.2);
    const fade = Math.max(0, Math.min(1, (dur - age) / 1.6));
    const P = this.particles;
    for (let i = 0; i < 11; i++) {
      const a = hashf(rec.id, i) * Math.PI * 2, r = Math.sqrt(hashf(rec.id, i + 20)) * R * 0.62 * (0.4 + 0.6 * grow);
      const wob = Math.sin(this.time * 0.7 + i) * 0.4;
      const y = 1.0 + hashf(rec.id, i + 40) * 2.6 * grow + age * 0.15;
      const g = 0.82 + hashf(rec.id, i + 60) * 0.12;
      P.once({ x: rec.x + Math.cos(a) * r + wob, y, z: rec.z + Math.sin(a) * r, cell: ATLAS.PUFF, size: (2.2 + 4.8 * grow) * (0.75 + hashf(rec.id, i + 80) * 0.5), rot: a + this.time * 0.1 * (i % 2 ? 1 : -1), r: g, g: g, b: g * 0.98, alpha: 0.82 * fade });
    }
  }

  _oil(rec) {
    const age = (rec.state | 0) / 10;
    const s = rec.inst.proto.size;
    const k = (this.oilR * 2) / Math.max(0.5, s.w);
    const grow = Math.min(1, 0.4 + age / 0.6);
    const shrink = Math.max(0.2, Math.min(1, (this.oilDur - age) / 2.5));
    rec.inst.root.scale.set(k * grow * shrink, 1, k * grow * shrink);
    rec.inst.outer.position.y += 0.02;
  }

  _rock(rec) {
    const ground = this.track ? (this.track.surfaceY(rec.z) ?? 0) : 0;
    const h = rec.y - ground;
    if (!rec.extra) {
      const m = new THREE.Mesh(this.shadowGeo, this.shadowMatBase.clone());
      m.renderOrder = 3;
      this.root.add(m);
      rec.extra = [m];
    }
    const sh = rec.extra[0];
    const want = h > 0.4;
    sh.userData.want = want; sh.visible = want;
    if (want) {
      const t = Math.max(0, Math.min(1, 1 - h / 30));
      sh.position.set(rec.x, ground + 0.05, rec.z);
      sh.scale.setScalar(0.8 + 1.6 * t);
      sh.material.opacity = 0.15 + 0.55 * t;
    }
    rec.spinAng += 0.06;
    if (h > 0.4) rec.inst.spin.rotation.set(rec.spinAng, rec.spinAng * 0.6, 0);
  }

  _roll(rec, dt, r) {
    const sp = rec.inst.spin;
    if (rec.speed > 0.05) {
      _axis.set(rec.vz, 0, -rec.vx).normalize(); // cross(up, dir)
      _q.setFromAxisAngle(_axis, (rec.speed * dt) / r);
      rec.roll.premultiply(_q);
    }
    // roll in world space, outer has yaw → undo yaw for the spin quaternion
    _q2.setFromAxisAngle(Y, -rec.yaw);
    sp.quaternion.copy(_q2).multiply(rec.roll).multiply(_q3.setFromAxisAngle(Y, rec.yaw));
    sp.position.y = r; rec.inst.root.position.y = -r;
    rec.inst.outer.position.y += Math.abs(Math.sin(this.time * 5 + rec.phase)) * 0.25 * Math.min(1, rec.speed / 4);
  }

  _geyser(rec, dt) {
    const g = rec.geyser;
    const t = this.time - g.t;
    if (t > 6) return;
    const n = Math.random() < dt * 40 ? 2 : 0;
    for (let i = 0; i < n; i++) {
      this.particles.spawn({ x: g.x + (Math.random() - 0.5) * 0.3, y: 0.4, z: g.z + (Math.random() - 0.5) * 0.3, vx: (Math.random() - 0.5) * 1.6, vy: 7 + Math.random() * 3, vz: (Math.random() - 0.5) * 1.6, gravity: 9, life: 1.5, size: 0.5, size1: 1.4, r: 0.75, g: 0.88, b: 1, alpha: 0.7, cell: ATLAS.PUFF, floor: 0.05 });
    }
  }

  dispose() {
    for (const rec of this.map.values()) this._release(rec);
    this.map.clear();
    for (const list of this.pool.values()) for (const inst of list) if (inst.rig) inst.rig.dispose();
    this.pool.clear();
    if (this.tornado) this.tornado.dispose();
    this.storm.dispose();
    this.root.removeFromParent();
    this.shadowGeo.dispose(); this.coneGeo.dispose();
  }
}
