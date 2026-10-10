// ─────────────────────────────────────────────────────────────────────────────
// MockStopSim — a tiny deterministic stand-in for GameSim around ONE supply stop (Agent ROOF).
// PURE LOGIC (no DOM / three.js). Used by the node tests (van/roof/test/roof-headless.js) and by
// public/roof-test.html until SIM-CORE wires sim/roof.js into GameSim.
//
// It implements exactly the GameSim helper API RoofDefence uses (EXPANSION_CONTRACT "Helper API"):
//   rv, phase, solo, seed, rules, inv.gadgets, crew.cookDown, stop{ id, state }, emit(ev), msg(text, tone),
//   copsList(), applyCopEffect(id, { push, soak, stall, blind }), setFx(), useGadget(kind) → bool
// plus the stop flow (parked 0.6 s → shopping → returning 2 s → loading (paused while an ACTIVE cop is
// within copBlockRadius) → done) and a bust meter (rules.heat.bust) so the defence has something to defend.
//
// Mock cop behaviour (what we expect SIM-CORE's applyCopEffect to do):
//   active  (1) drive straight at the RV at copSpeed, stop at followDist
//   soaked  (6) back off from the RV at copSpeed (+ the hose push impulse, decaying)
//   stalled (7) engine dead: stand still
//   blind   (8) lost: crawl on at 40 % speed, weaving ±35° (like cops.js _blinded)
// ─────────────────────────────────────────────────────────────────────────────
import { RoofDefence } from '../../sim/roof.js';
import { KIND_ID } from '../../shared/protocol.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const DEFAULT_RULES = {
  roof: { climbSeconds: 1.6, hose: { range: 15, coneDeg: 10, push: 5, soakSeconds: 2.5 }, firecracker: { ammo: 3, radius: 6, stallSeconds: 3 },
    balloon: { ammo: 4, radius: 2.5, blindSeconds: 4 }, flare: { usesSmokeCharge: true, radius: 9, seconds: 6 }, aiAccuracy: 0.55 },
  stops: { copBlockRadius: 25, returnSeconds: 2.0, shopMaxSeconds: 90 },
  heat: { bust: { radius: 7.5, maxRvSpeed: 4, seconds: 2.5, decayPerSec: 0.6 } },
};

export class MockStopSim {
  /**
   * @param {object} rules  data.rules (roof/stops/heat.bust are read)
   * @param {object} o      { seed, solo, rv:{x,z,yaw}, copSpeed, followDist, stop:{id,name,shopType,loadTime}, gadgets }
   */
  constructor(rules = DEFAULT_RULES, o = {}) {
    this.rules = { ...DEFAULT_RULES, ...rules };
    this.seed = o.seed ?? 1;
    this.solo = !!o.solo;
    this.phase = 'drive';
    this.t = 0;
    this.rv = { x: o.rv?.x ?? 0, y: 0, z: o.rv?.z ?? 0, yaw: o.rv?.yaw ?? 0, speed: 0, airborne: false };
    this.inv = { gadgets: { smoke: 1, oil: 0, nitro: 0, ...(o.gadgets || {}) } };
    this.crew = { cookDown: false };
    this.copSpeed = o.copSpeed ?? 6;
    this.followDist = o.followDist ?? 5.5;
    this.stopDef = { id: 'hardware', name: 'Bolt & Barrel', shopType: 'collect', loadTime: 2.5, ...(o.stop || {}) };
    this.stop = null;
    this.cops = [];
    this.events = [];
    this.netEvents = [];
    this.fx = { fog: 0, flash: 0, shock: 0 };
    this.bust = 0;
    this.busted = 0;
    this._nid = 1000;
    this.shopFor = Infinity;
    this.stats = { stopT: 0, minDist: Infinity, minActive: Infinity, activeInside: 0, runActive: 0, maxRunActive: 0, maxCopRun: 0, blockedT: 0, loadingT: 0, bustsAtStop: 0, doneAt: null };
    this.roof = new RoofDefence(this);
  }

  // ── helper API (as GameSim) ───────────────────────────────────────────────
  newId() { return this._nid++; }
  kindId(k) { return KIND_ID[k]; }
  emit(ev) { this.events.push(ev); this.netEvents.push(ev); if (this.events.length > 256) this.events.shift(); }
  msg(text, tone = 'info') { this.emit({ type: 'msg', text, tone }); }
  setFx(f) { for (const k of ['fog', 'flash', 'shock']) if (f && f[k] > this.fx[k]) this.fx[k] = f[k]; }
  useGadget(kind) { const g = this.inv.gadgets; if ((g[kind] | 0) <= 0) return false; g[kind]--; return true; }
  copsList() { return this.cops.map((c) => ({ id: c.id, kind: c.kind, x: c.x, z: c.z, yaw: c.yaw, speed: c.speed, state: c.state })); }
  applyCopEffect(id, e = {}) {
    const c = this.cops.find((k) => k.id === id);
    if (!c) return;
    if (e.soak > 0) c.soakT = Math.max(c.soakT, e.soak);
    if (e.stall > 0) c.stallT = Math.max(c.stallT, e.stall);
    if (e.blind > 0) c.blindT = Math.max(c.blindT, e.blind);
    if (e.push) { c.pvx += e.push.x || 0; c.pvz += e.push.z || 0; }
    c.state = this._copState(c);
  }

  // ── scripting ─────────────────────────────────────────────────────────────
  addCop({ x, z, kind = 'cop', speed = null, offset = 0 }) {
    const c = { id: this.newId(), kind, x, z, yaw: Math.atan2(this.rv.x - x, this.rv.z - z), speed: 0, state: 1, maxSpeed: speed ?? this.copSpeed,
      soakT: 0, stallT: 0, blindT: 0, pvx: 0, pvz: 0, offset, runIn: 0 };
    this.cops.push(c);
    return c.id;
  }
  /** Park in the lot: parked → shopping (for shopSeconds, or until finishShop()) → returning → loading → done. */
  startStop(shopSeconds = Infinity) {
    const d = this.stopDef;
    this.stop = { id: d.id, name: d.name, shopType: d.shopType, state: 'parked', st: 0, shopT: 0, loadT: 0, progress: 0, blocked: false, copDist: 999 };
    this.shopFor = shopSeconds;
    this.emit({ type: 'stopParked', id: d.id });
  }
  finishShop() { if (this.stop && (this.stop.state === 'shopping' || this.stop.state === 'parked')) this._stopState('returning'); }
  leaveStop() { this.stop = null; }

  _stopState(s) { this.stop.state = s; this.stop.st = 0; }
  /** No collisions in the mock: just keep cop cars outside the RV's footprint (+ a car half-size). */
  _keepOut(c) {
    const rv = this.rv, cs = Math.cos(rv.yaw), sn = Math.sin(rv.yaw);
    const dx = c.x - rv.x, dz = c.z - rv.z;
    const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
    const HX = 1.3 + 1.6, HZ = 4.3 + 2.0;
    if (Math.abs(lx) >= HX || Math.abs(lz) >= HZ) return;
    let nx = lx, nz = lz;
    if (HX - Math.abs(lx) < HZ - Math.abs(lz)) nx = Math.sign(lx || 1) * HX; else nz = Math.sign(lz || 1) * HZ;
    c.x = rv.x + nx * cs + nz * sn; c.z = rv.z - nx * sn + nz * cs;
  }
  _copState(c) { return c.stallT > 0 ? 7 : c.soakT > 0 ? 6 : c.blindT > 0 ? 8 : 1; }

  step(dt) {
    this.t += dt;
    this.fx.fog = this.fx.flash = this.fx.shock = 0;
    const rv = this.rv;
    // cops
    for (const c of this.cops) {
      c.soakT = Math.max(0, c.soakT - dt); c.stallT = Math.max(0, c.stallT - dt); c.blindT = Math.max(0, c.blindT - dt);
      c.state = this._copState(c);
      const dx = rv.x - c.x, dz = rv.z - c.z, d = Math.hypot(dx, dz) || 1e-6;
      let vx = 0, vz = 0;
      if (c.state === 7) { /* stalled */ }
      else if (c.state === 6) { vx = -dx / d * c.maxSpeed; vz = -dz / d * c.maxSpeed; c.yaw = Math.atan2(dx, dz); }
      else if (c.state === 8) { const h = c.yaw + Math.sin(this.t * 1.7 + c.id) * 0.6, v = c.maxSpeed * 0.4; vx = Math.sin(h) * v; vz = Math.cos(h) * v; }
      else {
        c.yaw = Math.atan2(dx, dz);
        const sp = d > this.followDist ? Math.min(c.maxSpeed, (d - this.followDist) * 2) : 0;
        vx = dx / d * sp; vz = dz / d * sp;
      }
      const k = Math.exp(-3 * dt);
      c.pvx *= k; c.pvz *= k;
      c.x += (vx + c.pvx) * dt; c.z += (vz + c.pvz) * dt;
      c.speed = Math.hypot(vx, vz);
      this._keepOut(c);
    }
    // stop flow
    const S = this.rules.stops, st = this.stop;
    let active25 = false, near = 999;
    for (const c of this.cops) {
      const d = Math.hypot(c.x - rv.x, c.z - rv.z);
      near = Math.min(near, d);
      const inside = c.state === 1 && d < (S.copBlockRadius ?? 25);
      if (inside) active25 = true;
      c.runIn = inside ? c.runIn + dt : 0;                 // how long this cop has been active inside the lot ring
      if (st && st.state !== 'done') this.stats.maxCopRun = Math.max(this.stats.maxCopRun, c.runIn);
    }
    if (st) {
      st.st += dt;
      st.blocked = active25; st.copDist = near;
      if (st.state === 'parked' && st.st >= 0.6) this._stopState('shopping');
      else if (st.state === 'shopping') { st.shopT += dt; if (st.shopT >= Math.min(this.shopFor, S.shopMaxSeconds ?? 90)) this._stopState('returning'); }
      else if (st.state === 'returning' && st.st >= (S.returnSeconds ?? 2)) this._stopState('loading');
      else if (st.state === 'loading') {
        if (!active25) { st.loadT += dt; st.progress = clamp(st.loadT / this.stopDef.loadTime, 0, 1); }
        if (st.progress >= 1) { this._stopState('done'); this.emit({ type: 'stopDone', id: st.id, gives: {} }); this.msg('Loaded up!', 'good'); }
      } else if (st.state === 'done' && st.st >= 1.0) this.stop = null;
    }
    // bust meter
    const B = this.rules.heat?.bust || DEFAULT_RULES.heat.bust;
    const close = this.cops.some((c) => c.state === 1 && Math.hypot(c.x - rv.x, c.z - rv.z) < B.radius) && Math.abs(rv.speed) < B.maxRvSpeed;
    this.bust = close ? Math.min(1, this.bust + dt / B.seconds) : Math.max(0, this.bust - B.decayPerSec * dt);
    if (this.bust >= 1) { this.busted++; this.bust = 0; if (st) this.stats.bustsAtStop++; this.msg('BUSTED! (mock: carrying on)', 'bad'); }
    // roof
    this.roof.update(dt);
    // stats (only while the stop is on — afterwards the RV would drive off)
    const s = this.stats;
    if (st && st.state !== 'done') {
      s.stopT += dt;
      let nearActive = 999;
      for (const c of this.cops) if (c.state === 1) nearActive = Math.min(nearActive, Math.hypot(c.x - rv.x, c.z - rv.z));
      s.minDist = Math.min(s.minDist, near); s.minActive = Math.min(s.minActive, nearActive);
      if (active25) { s.activeInside += dt; s.runActive += dt; s.maxRunActive = Math.max(s.maxRunActive, s.runActive); } else s.runActive = 0;
      if (st.state === 'loading') { s.loadingT += dt; if (active25) s.blockedT += dt; }
    }
    if (st && st.state === 'done' && s.doneAt == null) s.doneAt = this.t;
  }

  /** snap.stop (contract shape) with the roof state. */
  stopSnapshot() {
    const st = this.stop;
    if (!st) return null;
    return { id: st.id, name: st.name, shopType: st.shopType, state: st.state, shopT: st.shopT, loadT: st.loadT, progress: st.progress,
      blocked: st.blocked, copDist: st.copDist, roof: this.roof.state() };
  }
  drainEvents() { const e = this.events; this.events = []; return e; }
}
