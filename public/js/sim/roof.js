// ─────────────────────────────────────────────────────────────────────────────
// RoofDefence — Doc's roof defence at supply stops (Agent ROOF). PURE LOGIC: no DOM,
// no three.js, no Math.random (own seeded RNG from sim.seed) → deterministic.
//
//   const roof = new RoofDefence(sim);   // GameSim builds it (EXPANSION_CONTRACT "Sim hooks")
//   roof.command(cmd)                    // CMD.ROOF_ENTER / ROOF_LEAVE / ROOF_AIM / ROOF_THROW
//   roof.update(dt)                      // phase 'drive' (safe to call in any phase)
//   roof.state()                         // → snap.stop.roof (and snap.rv.roofDoc = roof.roofDoc)
//   roof.active                          // Doc is up there (or climbing)
//
// Rules (rules.roof):
//  • roofEnter is accepted in phase 'drive' while the stop is parked/shopping/returning/loading,
//    OR whenever the RV is (nearly) standing still (|speed| < 1 m/s) — stuck at a roadblock, the
//    drawbridge, the toll plaza … (decision: Doc may defend any stationary RV). Climbing takes
//    climbSeconds each way; hose/throws only work once fully up.
//  • Auto climb-down: the stop Doc defended ends (done/left), the RV goes faster than 3 m/s,
//    or the phase leaves 'drive'.
//  • Hose: cone test from the nozzle pivot (ROOF_GEOM.nozzle, RV-local, y 4.2 = Doc's chest on
//    the roof) along (aimYaw, aimPitch) against sim.copsList(): horizontal distance ≤ hose.range,
//    angle to the cop's body centre (y 0.9) ≤ hose.coneDeg (HALF-angle) + atan(1.1 m / dist).
//    One pulse per cop every 0.25 s → sim.applyCopEffect(id, { soak: soakSeconds,
//    push: {x,z} }) where push is a velocity impulse in m/s (world XZ, away from the RV),
//    0.5 × hose.push × (1 − 0.6 · dist/range) per pulse. roofHit (device 'hose') at most once
//    per cop per 1.2 s.
//  • Throws (roofThrow {device, x, z}): target clamped to 3..25 m from the RV centre, lands after
//    throwFlightTime(dist) s. firecracker → stall stallSeconds for cops within radius;
//    balloon → blind (paint) blindSeconds within radius; flare → red smoke zone (radius,
//    seconds) that keeps every cop inside blinded (1.5 s refreshed 4×/s). roofHit per cop hit.
//  • Ammo: firecracker/balloon refilled to rules ammo at every new stop. Crafted gadgets: every
//    oil-slick charge in inv.gadgets adds +1 paint balloon at refill (max +2, not consumed).
//    Flare (flare.usesSmokeCharge) consumes one smoke-bomb charge via sim.useGadget('smoke',
//    { x, z, place: false, source: 'roof' }) → bool (fallback: decrements sim.inv.gadgets.smoke).
//  • Solo (sim.solo): an AI Doc climbs up 0.8 s after the stop parks, sprays the nearest
//    approaching cop with rules.roof.aiAccuracy (chance per 0.35 s re-aim of being on target),
//    throws a firecracker when 2+ active cops are within 20 m (paint balloon when out, or at a
//    lone cop inside 11 m). Any human roof command takes over for 1.5 s.
// Unity port: a RoofDefence MonoBehaviour on the RV (same fields; Physics.OverlapSphere for the
// throw radii, a Vector3.Angle cone test for the hose; System.Random(seed) for the AI).
// ─────────────────────────────────────────────────────────────────────────────
import { CMD, EV } from '../shared/protocol.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const DEG = Math.PI / 180;

export const ROOF_ACTIVE_STATES = Object.freeze(['parked', 'shopping', 'returning', 'loading']);
const ACTIVE = new Set(ROOF_ACTIVE_STATES);
export const DEVICES = Object.freeze(['firecracker', 'balloon', 'flare']);
export const COP_KINDS = Object.freeze(['cop', 'cop_suv', 'interceptor', 'moto_cop', 'rhino_truck']);
const COP_KIND_SET = new Set(COP_KINDS);
/** cop entity states the hose/throws neutralise (protocol): 2 smoke-blind, 3 spun out, 4 wrecked, 5 gave up, 6 soaked, 7 stalled, 8 paint-blind */
export const COP_OUT_STATES = Object.freeze([2, 3, 4, 5, 6, 7, 8]);
const OUT = new Set(COP_OUT_STATES);

/** Shared geometry (RV-local metres: +Z front, +X driver's left, y up). The client uses the same numbers. */
export const ROOF_GEOM = Object.freeze({
  roofY: 3.11,
  hatch: Object.freeze({ x: 0.15, z: -1.1 }),              // roof_hatch userData.rvMount
  stance: Object.freeze({ x: 0.0, z: -1.8 }),              // where Doc stands on the roof
  nozzle: Object.freeze({ x: 0.0, y: 4.2, z: -1.8 }),      // hose aim pivot (Doc's chest)
  hand: Object.freeze({ x: 0.0, y: 4.55, z: -1.8 }),       // throw release point
  copAimY: 0.9,                                             // aim height on a police car
  copRadius: 1.1,                                           // body allowance for the cone test
  throwMin: 3, throwMax: 25,
  autoDownSpeed: 3, enterMaxSpeed: 1,
});

const HOSE_PULSE = 0.25, HOSE_EVENT_GAP = 1.2, FLARE_PULSE = 0.25, FLARE_BLIND = 1.5;
const LAND_LIFE = { firecracker: 1.8, balloon: 6 };   // seconds a landed effect stays in state().fx (visual)

// ── small pure helpers (exported for the client + tests) ─────────────────────
export function rvToWorld(rv, lx, lz) {
  const c = Math.cos(rv.yaw || 0), s = Math.sin(rv.yaw || 0);
  return { x: rv.x + lx * c + lz * s, z: rv.z - lx * s + lz * c };
}
export function worldToRv(rv, x, z) {
  const c = Math.cos(rv.yaw || 0), s = Math.sin(rv.yaw || 0), dx = x - rv.x, dz = z - rv.z;
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}
export function nozzleWorld(rv) {
  const N = ROOF_GEOM.nozzle, p = rvToWorld(rv, N.x, N.z);
  return { x: p.x, y: (rv.y || 0) + N.y, z: p.z };
}
/** World direction of an RV-local (yaw, pitch) aim. yaw 0 = RV forward. */
export function aimDirWorld(rv, yaw, pitch) {
  const a = (rv.yaw || 0) + yaw, cp = Math.cos(pitch);
  return { x: Math.sin(a) * cp, y: Math.sin(pitch), z: Math.cos(a) * cp };
}
/** RV-local { yaw, pitch } that points the nozzle pivot at world (x, y, z). */
export function aimAt(rv, x, z, y = ROOF_GEOM.copAimY) {
  const n = nozzleWorld(rv), dx = x - n.x, dy = y - n.y, dz = z - n.z;
  return { yaw: wrap(Math.atan2(dx, dz) - (rv.yaw || 0)), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}
export function throwFlightTime(dist) { return 0.45 + 0.035 * Math.max(0, dist); }
/** Clamp a throw target to throwMin..throwMax metres from the RV centre. */
export function clampThrowTarget(rv, x, z) {
  const G = ROOF_GEOM;
  let dx = x - rv.x, dz = z - rv.z, d = Math.hypot(dx, dz);
  if (!(d > 1e-6)) { const f = rvToWorld(rv, 0, -1); dx = f.x - rv.x; dz = f.z - rv.z; d = 1; }
  const k = clamp(d, G.throwMin, G.throwMax) / d;
  const tx = rv.x + dx * k, tz = rv.z + dz * k;
  return { x: tx, z: tz, dist: Math.hypot(tx - rv.x, tz - rv.z) };
}
/** Hose cone test → { hit, dist (horizontal from the nozzle), ang (rad), allow (rad) }. */
export function hoseTest(rv, yaw, pitch, cop, hose) {
  const G = ROOF_GEOM, n = nozzleWorld(rv);
  const vx = cop.x - n.x, vy = G.copAimY + (cop.y || 0) - n.y, vz = cop.z - n.z;
  const dh = Math.hypot(vx, vz), d3 = Math.hypot(vx, vy, vz) || 1e-6;
  const dir = aimDirWorld(rv, yaw, pitch);
  const ang = Math.acos(clamp((vx * dir.x + vy * dir.y + vz * dir.z) / d3, -1, 1));
  const allow = hose.coneDeg * DEG + Math.atan(G.copRadius / d3);
  return { hit: dh <= hose.range && ang <= allow, dist: dh, ang, allow };
}
function rng32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rulesOf(sim) {
  const r = sim?.rules?.roof ?? sim?.data?.rules?.roof ?? {};
  const h = r.hose || {}, f = r.firecracker || {}, b = r.balloon || {}, fl = r.flare || {};
  return {
    climbSeconds: r.climbSeconds ?? 1.6,
    hose: { range: h.range ?? 15, coneDeg: h.coneDeg ?? 10, push: h.push ?? 5, soakSeconds: h.soakSeconds ?? 2.5 },
    firecracker: { ammo: f.ammo ?? 3, radius: f.radius ?? 6, stallSeconds: f.stallSeconds ?? 3 },
    balloon: { ammo: b.ammo ?? 4, radius: b.radius ?? 2.5, blindSeconds: b.blindSeconds ?? 4 },
    flare: { usesSmokeCharge: fl.usesSmokeCharge !== false, ammo: fl.ammo ?? 1, radius: fl.radius ?? 9, seconds: fl.seconds ?? 6 },
    aiAccuracy: clamp(r.aiAccuracy ?? 0.55, 0, 1),
  };
}

export class RoofDefence {
  constructor(sim) {
    this.sim = sim;
    this.R = rulesOf(sim);
    this.active = false;          // Doc is on the roof or climbing
    this.climb = 0;               // 0 inside … 1 standing on the roof
    this.climbDir = 0;            // +1 up, −1 down, 0 steady
    this.aimYaw = Math.PI;        // RV-local; default: watching the road behind
    this.aimPitch = -0.2;
    this.spray = false;
    this.ammo = { firecracker: this.R.firecracker.ammo, balloon: this.R.balloon.ammo, flare: this.R.flare.ammo };
    this.refilledFor = null;      // stop id the ammo was last refilled for
    this.stopId = null;           // stop Doc climbed up for (null = stationary RV, no stop)
    this.t = 0;
    this.humanT = -1e9;           // last human roof command (solo: the AI yields for 1.5 s)
    this.aiOn = false;
    this.thrown = [];             // in flight: { id, device, x0, z0, x, z, t, T }
    this.landed = [];             // effects:   { id, device, x, z, t, life, hit:Set, pulse }
    this._nid = 1;
    this._hoseT = new Map();      // copId → last hose pulse time
    this._hoseEv = new Map();     // copId → last hose roofHit time
    this._outUntil = new Map();   // copId → when the effect we last put on it wears off (AI re-soaks before that)
    this.stats = { hosePulses: 0, hoseHits: 0, throws: 0, rejected: 0, hits: { hose: 0, firecracker: 0, balloon: 0, flare: 0 } };
    this.rand = rng32(((sim?.seed ?? 1) ^ 0x5eed700f) >>> 0);
    this.ai = { enterT: 0, aimT: 0, errYaw: 0, errPitch: 0, throwCd: 1.0, targetId: null };
  }

  get onRoof() { return this.active && this.climb >= 1 && this.climbDir === 0; }
  /** for snap.rv.roofDoc: Doc is visible on the roof from outside (head and shoulders out of the hatch) */
  get roofDoc() { return this.active && this.climb > 0.5; }

  // ── commands (cook → host) ─────────────────────────────────────────────────
  command(cmd) {
    if (!cmd || typeof cmd.type !== 'string') return false;
    if (this.sim?.crew?.cookDown) return false;   // Doc is out cold
    switch (cmd.type) {
      case CMD.ROOF_ENTER: this.humanT = this.t; return this._enter('human');
      case CMD.ROOF_LEAVE: this.humanT = this.t; return this._leave('human');
      case CMD.ROOF_AIM:
        this.humanT = this.t;
        if (Number.isFinite(cmd.yaw)) this.aimYaw = wrap(cmd.yaw);
        if (Number.isFinite(cmd.pitch)) this.aimPitch = clamp(cmd.pitch, -1.3, 0.7);
        this.spray = !!cmd.spray;
        return true;
      case CMD.ROOF_THROW:
        this.humanT = this.t;
        return this._throw(cmd.device, +cmd.x, +cmd.z);
      default: return false;
    }
  }

  canEnter() {
    const sim = this.sim;
    if (!sim || sim.phase !== 'drive') return false;
    const st = this._stop();
    if (st && ACTIVE.has(st.state)) return true;
    return Math.abs(sim.rv?.speed ?? 0) < ROOF_GEOM.enterMaxSpeed && !sim.rv?.airborne;
  }

  _enter(who) {
    if (this.active && this.climbDir >= 0) return true;              // already up / going up
    if (this.active && this.climbDir < 0) { this.climbDir = 1; return true; }   // turn around on the ladder
    if (!this.canEnter()) {
      this.stats.rejected++;
      if (who === 'human') this._msg('Can\'t get on the roof while we\'re moving!', 'bad');
      return false;
    }
    const st = this._stop();
    this.stopId = st && ACTIVE.has(st.state) ? st.id : null;
    this.active = true; this.climbDir = 1; this.spray = false;
    this._emit({ type: EV.ROOF, on: true });
    this._msg(who === 'ai' ? 'Doc climbs onto the roof with the hose!' : 'Doc\'s on the roof — hold them off!', 'info');
    return true;
  }
  _leave(why) {
    if (!this.active || this.climbDir < 0) return false;
    this.climbDir = -1; this.spray = false;
    if (why === 'auto') this._msg('Doc climbs back inside.', 'info');
    return true;
  }

  // ── per tick ───────────────────────────────────────────────────────────────
  update(dt) {
    if (!(dt > 0)) return;
    const sim = this.sim;
    if (!sim || !sim.rv) return;
    this.t += dt;
    const st = this._stop();
    const stopOn = !!(st && ACTIVE.has(st.state));
    if (stopOn && st.id !== this.refilledFor) { this.refilledFor = st.id; this._refill(); }
    if (this.active && stopOn && this.stopId == null) this.stopId = st.id;   // pulled into a lot while up there
    const drive = sim.phase === 'drive';
    // solo AI (before the auto-down so it never fights it)
    this.aiOn = !!sim.solo && this.t - this.humanT >= 1.5;
    if (this.aiOn && drive) this._ai(dt, st, stopOn);
    // auto climb-down
    if (this.active && this.climbDir >= 0) {
      const stopOver = this.stopId != null && !(stopOn && st.id === this.stopId);
      if (!drive || Math.abs(sim.rv.speed || 0) > ROOF_GEOM.autoDownSpeed || stopOver) this._leave('auto');
    }
    // climbing
    if (this.climbDir !== 0) {
      this.climb = clamp(this.climb + this.climbDir * dt / Math.max(0.05, this.R.climbSeconds), 0, 1);
      if (this.climbDir > 0 && this.climb >= 1) this.climbDir = 0;
      else if (this.climbDir < 0 && this.climb <= 0) {
        this.climbDir = 0; this.active = false; this.spray = false; this.stopId = null;
        this._emit({ type: EV.ROOF, on: false });
      }
    }
    if (drive && this.onRoof && this.spray) this._hose();
    this._updateThrown(dt);
  }

  // ── hose ──────────────────────────────────────────────────────────────────
  _hose() {
    const sim = this.sim, rv = sim.rv, H = this.R.hose;
    for (const c of this._cops()) {
      const r = hoseTest(rv, this.aimYaw, this.aimPitch, c, H);
      if (!r.hit) continue;
      const last = this._hoseT.get(c.id);
      if (last != null && this.t - last < HOSE_PULSE - 1e-9) continue;
      this._hoseT.set(c.id, this.t);
      const ax = c.x - rv.x, az = c.z - rv.z, al = Math.hypot(ax, az) || 1;
      const m = 0.5 * H.push * (1 - 0.6 * clamp(r.dist / H.range, 0, 1));
      this._effect(c.id, { soak: H.soakSeconds, push: { x: (ax / al) * m, z: (az / al) * m } });
      this.stats.hosePulses++;
      const le = this._hoseEv.get(c.id);
      if (le == null || this.t - le >= HOSE_EVENT_GAP) {
        this._hoseEv.set(c.id, this.t);
        this.stats.hoseHits++; this.stats.hits.hose++;
        this._emit({ type: EV.ROOF_HIT, copId: c.id, device: 'hose', x: c.x, z: c.z });
      }
    }
  }

  // ── throws ────────────────────────────────────────────────────────────────
  _flareAmmo() {
    if (!this.R.flare.usesSmokeCharge) return this.ammo.flare | 0;
    return Math.max(0, this.sim?.inv?.gadgets?.smoke | 0);
  }
  _refill() {
    const oil = Math.max(0, this.sim?.inv?.gadgets?.oil | 0);
    this.ammo.firecracker = this.R.firecracker.ammo;
    this.ammo.balloon = this.R.balloon.ammo + Math.min(2, oil);
    this.ammo.flare = this.R.flare.ammo;
  }
  _useSmoke(x, z) {
    const sim = this.sim;
    if (typeof sim.useGadget === 'function') return !!sim.useGadget('smoke', { x, z, place: false, source: 'roof' });
    const g = sim.inv?.gadgets;
    if (g && g.smoke > 0) { g.smoke--; return true; }
    return false;
  }
  _throw(device, x, z, who = 'human') {
    if (!DEVICES.includes(device) || !Number.isFinite(x) || !Number.isFinite(z)) return false;
    if (!this.onRoof || this.sim.phase !== 'drive') { this.stats.rejected++; return false; }
    const rv = this.sim.rv, tgt = clampThrowTarget(rv, x, z);
    if (device === 'flare') {
      if (this.R.flare.usesSmokeCharge) {
        if (!this._useSmoke(tgt.x, tgt.z)) { this.stats.rejected++; if (who === 'human') this._msg('No smoke bombs for a flare — cook one!', 'bad'); return false; }
      } else if (this.ammo.flare > 0) this.ammo.flare--;
      else { this.stats.rejected++; return false; }
    } else {
      if ((this.ammo[device] | 0) <= 0) { this.stats.rejected++; if (who === 'human') this._msg(device === 'firecracker' ? 'Out of firecrackers!' : 'Out of paint balloons!', 'bad'); return false; }
      this.ammo[device]--;
    }
    const h = rvToWorld(rv, ROOF_GEOM.hand.x, ROOF_GEOM.hand.z);
    this.thrown.push({ id: this._nid++, device, x0: h.x, z0: h.z, x: tgt.x, z: tgt.z, t: 0, T: throwFlightTime(tgt.dist) });
    this.stats.throws++;
    return true;
  }
  _updateThrown(dt) {
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const p = this.thrown[i];
      p.t += dt;
      if (p.t < p.T) continue;
      this.thrown.splice(i, 1);
      this._land(p);
    }
    for (let i = this.landed.length - 1; i >= 0; i--) {
      const e = this.landed[i];
      e.t += dt;
      if (e.device === 'flare' && e.t < e.life) {
        e.pulse -= dt;
        if (e.pulse <= 0) { e.pulse += FLARE_PULSE; this._radius(e, this.R.flare.radius, { blind: FLARE_BLIND }); }
      }
      if (e.t >= e.life) this.landed.splice(i, 1);
    }
  }
  _land(p) {
    const e = { id: p.id, device: p.device, x: p.x, z: p.z, t: 0, life: p.device === 'flare' ? this.R.flare.seconds : LAND_LIFE[p.device], hit: new Set(), pulse: 0 };
    if (p.device === 'firecracker') this._radius(e, this.R.firecracker.radius, { stall: this.R.firecracker.stallSeconds });
    else if (p.device === 'balloon') this._radius(e, this.R.balloon.radius, { blind: this.R.balloon.blindSeconds });
    else { e.pulse = FLARE_PULSE; this._radius(e, this.R.flare.radius, { blind: FLARE_BLIND }); }
    this.landed.push(e);
  }
  _radius(e, r, effect) {
    const r2 = r * r;
    for (const c of this._cops()) {
      const dx = c.x - e.x, dz = c.z - e.z;
      if (dx * dx + dz * dz > r2) continue;
      this._effect(c.id, { ...effect });
      if (!e.hit.has(c.id)) {
        e.hit.add(c.id);
        this.stats.hits[e.device]++;
        this._emit({ type: EV.ROOF_HIT, copId: c.id, device: e.device, x: c.x, z: c.z });
      }
    }
  }

  // ── solo AI ───────────────────────────────────────────────────────────────
  _ai(dt, st, stopOn) {
    const A = this.ai, sim = this.sim, rv = sim.rv, R = this.R;
    if (!this.active) {
      A.enterT = stopOn ? A.enterT + dt : 0;
      if (stopOn && A.enterT >= 0.8 && this.canEnter()) { this._enter('ai'); A.enterT = 0; A.throwCd = 1.0; }
      return;
    }
    if (!this.onRoof) { this.spray = false; return; }
    const cops = this._cops();
    // target: the nearest cop that is active — or one of ours parked close by whose soak/stall/paint is about to wear off
    let best = null, bd = Infinity;
    for (const c of cops) {
      const d = Math.hypot(c.x - rv.x, c.z - rv.z);
      if (OUT.has(c.state) && !(d < R.hose.range && (this._outUntil.get(c.id) ?? -1) - this.t < 0.5)) continue;
      if (d < 45 && d < bd) { bd = d; best = c; }
    }
    // re-roll the aim error (accuracy = chance the next 0.35 s are on target)
    A.aimT -= dt;
    const cone = R.hose.coneDeg * DEG;
    if (A.aimT <= 0 || (best && best.id !== A.targetId)) {
      A.aimT = 0.35;
      A.targetId = best ? best.id : null;
      if (this.rand() < R.aiAccuracy) { A.errYaw = (this.rand() - 0.5) * cone * 0.8; A.errPitch = (this.rand() - 0.5) * cone * 0.4; }
      else { A.errYaw = (this.rand() < 0.5 ? -1 : 1) * cone * (1.6 + this.rand() * 1.4); A.errPitch = (this.rand() - 0.5) * cone; }
    }
    if (best) {
      const lead = 0.25;
      const vx = Math.sin(best.yaw || 0) * (best.speed || 0), vz = Math.cos(best.yaw || 0) * (best.speed || 0);
      const want = aimAt(rv, best.x + vx * lead, best.z + vz * lead);
      const k = Math.min(1, dt * 7);
      this.aimYaw = wrap(this.aimYaw + wrap(want.yaw + A.errYaw - this.aimYaw) * k);
      this.aimPitch += (want.pitch + A.errPitch - this.aimPitch) * k;
      this.spray = bd <= R.hose.range + 1.5;
    } else this.spray = false;
    // throws: the hose covers one cop; firecrackers/balloons cover the rest
    A.throwCd -= dt;
    if (A.throwCd > 0 || (this.ammo.firecracker | 0) + (this.ammo.balloon | 0) <= 0) return;
    const range = R.hose.range, fr = R.firecracker.radius;
    const P = [];
    for (const c of cops) {
      if (OUT.has(c.state)) continue;
      const d = Math.hypot(c.x - rv.x, c.z - rv.z);
      if (d > ROOF_GEOM.throwMax) continue;
      const T = throwFlightTime(d), sp = c.speed || 0;
      P.push({ id: c.id, d, x: c.x + Math.sin(c.yaw || 0) * sp * T, z: c.z + Math.cos(c.yaw || 0) * sp * T });
    }
    if (!P.length) return;
    P.sort((a, b) => a.d - b.d || a.id - b.id);
    const unhosed = P.filter((p) => p.id !== A.targetId || p.d > range - 1);
    // while Rook shops only the bust matters: spare throws (beyond 3 kept for the loading run, when the lot
    // ring must be clear) go at a second cop; 2+ cops within 20 m or one inside 11 m always get one
    const loadRun = !!st && (st.state === 'returning' || st.state === 'loading');
    const total = (this.ammo.firecracker | 0) + (this.ammo.balloon | 0);
    const emergency = !!unhosed[0] && unhosed[0].d < 11;
    const miss = () => (this.rand() < R.aiAccuracy ? 0.8 : 3.0) * (this.rand() - 0.5) * 2;
    let dev = null, tx = 0, tz = 0;
    if (P.filter((p) => p.d < 20).length >= 2) {
      // 2+ cops within 20 m → a firecracker: at the tightest pair/cluster, else at the cop the hose isn't on
      let best = null;
      for (const p of P) {
        const m = P.filter((q) => Math.hypot(q.x - p.x, q.z - p.z) <= fr * 0.9);
        if (m.length >= 2 && (!best || m.length > best.length)) best = m;
      }
      const tgt = best ? { x: best.reduce((a, q) => a + q.x, 0) / best.length, z: best.reduce((a, q) => a + q.z, 0) / best.length } : unhosed[0];
      if (tgt) { dev = this.ammo.firecracker > 0 ? 'firecracker' : 'balloon'; tx = tgt.x; tz = tgt.z; }
    } else if (unhosed.length && (emergency || loadRun || (P.length >= 2 && total > 3))) {
      dev = this.ammo.balloon > 0 ? 'balloon' : 'firecracker'; tx = unhosed[0].x; tz = unhosed[0].z;
    }
    if (!dev) return;
    A.throwCd = this._throw(dev, tx + miss(), tz + miss(), 'ai') ? (loadRun ? 1.5 : dev === 'firecracker' ? 3.0 : 2.5) : 0.5;
  }

  // ── snapshot ──────────────────────────────────────────────────────────────
  state() {
    const fx = [];
    for (const p of this.thrown) fx.push({ id: p.id, device: p.device, phase: 'fly', x0: p.x0, z0: p.z0, x: p.x, z: p.z, t: p.t, T: p.T });
    for (const e of this.landed) fx.push({ id: e.id, device: e.device, phase: 'land', x0: e.x, z0: e.z, x: e.x, z: e.z, t: e.t, T: e.life });
    return {
      active: this.active,
      climbing: this.climbDir !== 0,
      climbDir: this.climbDir > 0 ? 'up' : this.climbDir < 0 ? 'down' : null,
      climb: this.climb,
      onRoof: this.onRoof,
      aimYaw: this.aimYaw, aimPitch: this.aimPitch,
      spray: this.onRoof && this.spray,
      ammo: { firecracker: this.ammo.firecracker, balloon: this.ammo.balloon, flare: this._flareAmmo() },
      ai: this.aiOn && this.active,
      fx,
    };
  }

  // ── helper-API adapters (GameSim helpers; legacy fallbacks keep old sims working) ──
  _stop() {
    const sim = this.sim;
    if (sim.stop !== undefined) {
      const s = sim.stop;
      if (!s) return null;
      return { id: s.id ?? s.def?.id ?? null, state: s.state };
    }
    const cur = sim.stops?.current;           // pre-expansion StopSystem: inside an un-looted lot = loading
    return cur ? { id: cur.def?.id ?? null, state: 'loading' } : null;
  }
  _cops() {
    const sim = this.sim;
    let list;
    if (typeof sim.copsList === 'function') list = sim.copsList() || [];
    else list = (sim.cops?.cops || []).map((c) => ({ id: c.id, kind: c.kind, x: c.x, z: c.z, yaw: c.yaw, speed: c.speed, state: c.state }));
    return list.filter((c) => c && c.kind !== 'heli' && (!c.kind || COP_KIND_SET.has(c.kind)) && c.state !== 4);
  }
  _effect(id, e) {
    const sim = this.sim;
    const until = this.t + Math.max(e.soak || 0, e.stall || 0, e.blind || 0);
    if (until > (this._outUntil.get(id) ?? -1)) this._outUntil.set(id, until);
    if (typeof sim.applyCopEffect === 'function') { sim.applyCopEffect(id, e); return; }
    // legacy: blind the cop (state 2) for the longest effect
    const c = sim.cops?.cops?.find((k) => k.id === id);
    const s = Math.max(e.soak || 0, e.stall || 0, e.blind || 0);
    if (c && s > 0 && typeof sim.cops.blind === 'function') sim.cops.blind(c, s);
  }
  _emit(ev) { if (typeof this.sim.emit === 'function') this.sim.emit(ev); }
  _msg(text, tone = 'info') {
    if (typeof this.sim.msg === 'function') this.sim.msg(text, tone);
    else this._emit({ type: EV.MSG, text, tone });
  }
}

export default RoofDefence;
