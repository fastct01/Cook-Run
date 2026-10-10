// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers for the set-piece plugins (Agent SETPIECES). Pure logic.
//
//  • Geo        — cached road geometry on top of sim.track (1 m samples, linearly
//                 interpolated exactly like sim/road.js, so x/u agree with the sim).
//  • Scripted   — SetPiece subclass every plugin extends: bodies (entity list),
//                 phase changes (+ EV.SETPIECE + HUD caption), road "blocks"
//                 (→ laneBlocked + snapshot `blocks` for the autopilot), collider
//                 helpers, impact handling with per-body cooldowns.
//  • thin wrappers around the GameSim helper API with safe fallbacks for the
//    optional helpers (takeProduct, addPoints, respawnRv, heatStars, gadgetZones).
//
// Road frame: s = distance along the route (== world z), u = lateral offset,
// u > 0 = driver's right. World x = centerX(s) − u (track.js convention).
// Unity port: SetPieceBase (abstract MonoBehaviour) + RoadGeo (baked arrays).
// ─────────────────────────────────────────────────────────────────────────────
import { SetPiece } from './base.js';
import { KIND_ID, EV } from '../../shared/protocol.js';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const approach = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));
export function wrapAngle(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
const r2 = (v) => Math.round(v * 100) / 100;

// ── road geometry ────────────────────────────────────────────────────────────
export class Geo {
  constructor(track) {
    this.track = track;
    this.rows = new Map();
    this.hasSide = typeof track.sideRoom === 'function';
  }
  _row(i) {
    let r = this.rows.get(i);
    if (r === undefined) {
      const t = this.track;
      r = {
        cx: t.centerX(i), hw: t.halfWidth(i), sh: t.shoulder(i), lw: t.laneWidth(i),
        room: this.hasSide ? t.sideRoom(i) : 14,
      };
      if (this.rows.size > 6000) this.rows.clear();
      this.rows.set(i, r);
    }
    return r;
  }
  _s(z, key) {
    const i = Math.floor(z), f = z - i;
    const a = this._row(i)[key];
    return f === 0 ? a : a + (this._row(i + 1)[key] - a) * f;
  }
  cx(z) { return this._s(z, 'cx'); }
  hw(z) { return this._s(z, 'hw'); }
  sh(z) { return this._s(z, 'sh'); }
  lw(z) { return this._s(z, 'lw'); }
  room(z) { return this._s(z, 'room'); }
  edge(z) { return this.hw(z) + this.sh(z); }                 // outer edge of the shoulder
  limit(z) { return this.hw(z) + this.sh(z) + this.room(z); } // building line / wall
  slope(z) { return this.cx(z + 0.5) - this.cx(z - 0.5); }
  heading(z) { return Math.atan(this.slope(z)); }
  xAt(z, u) { return this.cx(z) - u; }
  uAt(x, z) { return this.cx(z) - x; }
  biome(z) { return this.track.biomeAt(z); }
  lanesPerDir(z) { const n = (this.biome(z).lanes / 2) | 0; return n < 1 ? 1 : n; }
  laneU(z, dir, rank) { const n = this.lanesPerDir(z); const r = rank < n ? rank : n - 1; return dir * (r + 0.5) * this.lw(z); }
  /** the RV's start/respawn lane (rightmost-but-one forward lane), as vehicle.js forwardLaneU */
  fwdLaneU(z) { const n = this.lanesPerDir(z); return this.laneU(z, 1, Math.max(0, n - 2)); }
  baseSurface(z) { return this.track.surfaceY(z); }
  /** yaw (forward = (sin, cos)) for a road-frame velocity (ds, du) at s */
  yawFor(s, ds, du) { return Math.atan2(this.slope(s) * ds - du, ds); }
}
const GEO = new WeakMap();
export function geoFor(sim) {
  let g = GEO.get(sim.track);
  if (!g) { g = new Geo(sim.track); GEO.set(sim.track, g); }
  return g;
}

// ── GameSim helper wrappers (optional helpers get fallbacks) ────────────────
export const H = {
  time: (sim) => sim.time ?? sim.t ?? 0,
  kid: (sim, kind) => {
    const k = typeof sim.kindId === 'function' ? sim.kindId(kind) : undefined;
    return k ?? KIND_ID[kind];
  },
  msg(sim, text, tone = 'info') {
    if (typeof sim.msg === 'function') sim.msg(text, tone);
    else sim.emit({ type: 'msg', text, tone });
  },
  damage(sim, amount, cause) { if (amount > 0 && typeof sim.damageRv === 'function') sim.damageRv(amount, cause); },
  push(sim, dvx, dvz, loss = 0) { if (typeof sim.pushRv === 'function') sim.pushRv(dvx, dvz, loss); },
  heat(sim, amount, reason) {
    if (typeof sim.addHeat === 'function') sim.addHeat(amount, reason);
    else if (sim.heat && typeof sim.heat.add === 'function') sim.heat.add(amount);
  },
  dropStars(sim, n, reason) {
    if (typeof sim.dropStars === 'function') { sim.dropStars(n, reason); return true; }
    return false;
  },
  stars(sim) {
    if (typeof sim.heatStars === 'function') return sim.heatStars() | 0;
    return (sim.heat && sim.heat.stars) | 0;
  },
  cops(sim) { return typeof sim.copsList === 'function' ? (sim.copsList() || []) : []; },
  copEffect(sim, id, eff) { if (typeof sim.applyCopEffect === 'function') sim.applyCopEffect(id, eff); },
  points(sim, n, reason) { if (typeof sim.addPoints === 'function') sim.addPoints(n, reason); },
  /** → units taken, or null if the sim has no takeProduct helper */
  takeProduct(sim, n) { return typeof sim.takeProduct === 'function' ? sim.takeProduct(n) : null; },
  canRespawn: (sim) => typeof sim.respawnRv === 'function',
  respawn(sim, z, reason) { if (typeof sim.respawnRv === 'function') { sim.respawnRv(z, reason); return true; } return false; },
  fx(sim, fx, hold = 0) { if (typeof sim.setFx === 'function') sim.setFx(fx, hold); },
  /** smoke clouds / oil slicks: [{ kind: 'smoke'|'oil', x, z, r }] */
  gadgetZones(sim) {
    if (typeof sim.gadgetZones === 'function') return sim.gadgetZones() || [];
    const items = sim.gadgets && sim.gadgets.items;
    if (!Array.isArray(items)) return [];
    return items.map((it) => ({ kind: it.kind, x: it.x, z: it.z, r: it.kind === 'smoke' ? it.r * Math.min(1, 0.45 + it.age * 0.8) : it.r }));
  },
  crash(sim, x, z, power) { sim.emit({ type: 'crash', x, z, power: clamp(power, 0.05, 1) }); },
};

// ── base for every plugin ────────────────────────────────────────────────────
export class Scripted extends SetPiece {
  constructor(host, def) {
    super(host, def);
    this.g = geoFor(this.sim);
    this.bodies = [];
    this.blocks = [];          // [[z0, z1, u0, u1], ...] road boxes blocked right now
    this.captions = 0;
  }

  // --- small accessors
  get rv() { return this.sim.rv; }
  get now() { return H.time(this.sim); }
  rvU() { const rv = this.sim.rv; return this.g.uAt(rv.x, rv.z); }
  rvSpeed() { const rv = this.sim.rv; return Math.hypot(rv.vx || 0, rv.vz || 0) || Math.abs(rv.speed || 0); }
  /** metres from the RV to z along the road (positive = ahead) */
  ahead(z) { return z - this.sim.rv.z; }
  /** seconds until the RV reaches z at its current speed (Infinity when stopped/past) */
  eta(z) { const d = this.ahead(z), v = Math.max(0, this.sim.rv.speed || 0); return d <= 0 ? 0 : v < 0.5 ? Infinity : d / v; }

  /** extend the host's retirement range for set-pieces that travel with the RV */
  extendRange(to) { this.def = Object.freeze({ ...this.def, to: Math.max(to, this.def.to ?? this.def.z ?? 0) }); }

  // --- phases, events, captions
  setPhase(phase, caption = null, tone = 'info') {
    if (phase === this.phase) return;
    this.phase = phase;
    const ev = { type: EV.SETPIECE, id: this.id, kind: this.type, phase };
    if (caption) ev.caption = caption;
    this.sim.emit(ev);
    if (caption) { H.msg(this.sim, caption, tone); this.captions++; }
  }
  say(text, tone = 'info') { H.msg(this.sim, text, tone); }
  /** one-off EV.SETPIECE beat (e.g. 'splash') without changing this.phase */
  beat(name, caption = null, tone = 'info') {
    const ev = { type: EV.SETPIECE, id: this.id, kind: this.type, phase: name, beat: true };
    if (caption) ev.caption = caption;
    this.sim.emit(ev);
    if (caption) { H.msg(this.sim, caption, tone); this.captions++; }
  }

  // --- bodies
  body(kind, variant, x, z, yaw, extra) {
    const b = {
      id: this.sim.newId(), kind, kid: H.kid(this.sim, kind), variant: variant | 0,
      x, y: 0, z, yaw, state: 0, vx: 0, vy: 0, vz: 0, hitCd: 0, alive: true, hidden: false,
    };
    if (extra) Object.assign(b, extra);
    this.bodies.push(b);
    return b;
  }
  /** place a body from road-frame (s, u) */
  place(b, s, u) { b.s = s; b.u = u; b.x = this.g.xAt(s, u); b.z = s; return b; }
  tickBodies(dt) { for (const b of this.bodies) if (b.hitCd > 0) b.hitCd -= dt; }
  ents(out) {
    for (const b of this.bodies) {
      if (!b.alive || b.hidden) continue;
      out.push([b.id, b.kid, b.x, b.y, b.z, b.yaw, b.variant, b.state]);
    }
  }

  // --- colliders: a box (len along yaw × wid) as a row of circles
  boxCircles(out, x, z, yaw, len, wid, props) {
    if (wid > len) { const t = len; len = wid; wid = t; yaw += Math.PI / 2; }
    const r = wid / 2, hl = Math.max(0, len / 2 - r);
    const n = hl > 0.05 ? Math.max(2, Math.ceil((2 * hl) / (r * 1.2)) + 1) : 1;
    const s = Math.sin(yaw), c = Math.cos(yaw);
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0 : -hl + (2 * hl * i) / (n - 1);
      out.push({ x: x + s * k, z: z + c * k, r, solid: true, damage: 0, kind: 'setpiece', sp: this.id, ...props });
    }
  }

  /**
   * onHit handler for a solid body (see solidBox). GameSim already resolved the contact
   * (and emits the crash/bump for hard hits). The damage is applied HERE, scaled by the
   * closing speed with no floor — o.damage · clamp((v − 2) / 10, 0, 1.3) — because
   * GameSim's own collider.damage has a 40 % floor that re-applies every 0.8 s while a
   * moving body (wagon, log, coach) keeps leaning on the RV. Extras when the RV hit it:
   * shove along the body's motion, speed loss (scaled by impact speed), a callback.
   * Hits by cops/traffic go to o.onOther(info). Returns the impact speed (0 = ignored).
   */
  impact(b, o = {}, info = null) {
    const sim = this.sim, rv = sim.rv;
    const by = info && info.by ? info.by : 'rv';
    if (by !== 'rv') { if (o.onOther) o.onOther(info); return 0; }
    if (b.hitCd > 0) return 0;
    let v = info && Number.isFinite(info.speed) ? info.speed : NaN;
    if (!Number.isFinite(v)) {
      const dx = b.x - rv.x, dz = b.z - rv.z, d = Math.hypot(dx, dz) || 1;
      v = Math.abs(((rv.vx ?? 0) - (b.vx || 0)) * (dx / d) + ((rv.vz ?? 0) - (b.vz || 0)) * (dz / d));
    }
    if (v < (o.minSpeed ?? 0.5)) return 0;
    b.hitCd = o.cooldown ?? 0.8;
    if (o.damage > 0 && v > 2) H.damage(sim, o.damage * clamp((v - 2) / 10, 0, 1.3), o.cause || b.kind);
    const k = clamp(v / 10, 0.2, 1);
    const bodySpeed = Math.hypot(b.vx || 0, b.vz || 0);
    const loss = (o.speedLoss ?? 0) * k;
    if (o.shove && bodySpeed > 0.5) H.push(sim, b.vx * o.shove, b.vz * o.shove, loss);
    else if (loss > 0) H.push(sim, 0, 0, loss);
    if (o.onHit) o.onHit(v);
    return v;
  }

  /** solid box collider for a body (GameSim blocks vehicles; impact() applies o.damage) */
  solidBox(out, b, len, wid, o = {}) {
    b.hitOpts = o;
    if (!b.onHit) b.onHit = (sim, info) => this.impact(b, b.hitOpts || {}, info);
    this.boxCircles(out, b.x, b.z, o.yaw ?? b.yaw, len, wid, {
      id: b.id, kind: o.kind ?? b.kind, damage: 0, vx: b.vx || 0, vz: b.vz || 0, onHit: b.onHit,
    });
  }
  solidCircle(out, b, r, o = {}) {
    b.hitOpts = o;
    if (!b.onHit) b.onHit = (sim, info) => this.impact(b, b.hitOpts || {}, info);
    out.push({ x: b.x, z: b.z, r, solid: true, damage: 0, kind: o.kind ?? b.kind, id: b.id, sp: this.id, vx: b.vx || 0, vz: b.vz || 0, onHit: b.onHit });
  }

  // --- blocked road boxes (laneBlocked + snapshot)
  clearBlocks() { this.blocks.length = 0; }
  block(z0, z1, u0, u1) {
    this.blocks.push([Math.min(z0, z1), Math.max(z0, z1), Math.min(u0, u1), Math.max(u0, u1)]);
  }
  /** block the road footprint of a body (road-aligned box around it) */
  blockBody(b, halfAlong, halfAcross, pad = 0.6) {
    const u = b.u ?? this.g.uAt(b.x, b.z);
    this.block(b.z - halfAlong - pad, b.z + halfAlong + pad, u - halfAcross - pad, u + halfAcross + pad);
  }
  laneBlocked(z, u) {
    for (const b of this.blocks) if (z >= b[0] && z <= b[1] && u >= b[2] && u <= b[3]) return true;
    return false;
  }

  /** subclasses add fields here */
  extraState() { return null; }
  state() {
    const s = { id: this.id, type: this.type, phase: this.phase, t: r2(this.t) };
    const x = this.extraState();
    if (x) Object.assign(s, x);
    if (this.blocks.length) s.blocks = this.blocks.slice(0, 12).map((b) => b.map(r2));
    return s;
  }
}

// ── cops near a point ────────────────────────────────────────────────────────
export const ACTIVE_COP_STATES = new Set([1, 2, 3, 6, 7, 8]);
export function copsNear(sim, x, z, r, { activeOnly = false } = {}) {
  const out = [];
  const r2_ = r * r;
  for (const c of H.cops(sim)) {
    if (c.kind === 'heli') continue;
    if (activeOnly && !(c.state === 1)) continue;
    const dx = c.x - x, dz = c.z - z;
    if (dx * dx + dz * dz <= r2_) out.push(c);
  }
  return out;
}
