// ─────────────────────────────────────────────────────────────────────────────
// midnight_comet — Downtown (route.json z 5600). The masked Midnight Comet
// (rocket car comet_car, hero inside) comes up from BEHIND the RV with six
// chasing police cars strung out behind him in his lane, sirens on, pulls up
// PARALLEL beside the RV and matches its speed for def.alongSeconds (5 s; seeded
// 4.6–5.6 s when absent) — he cracks the canopy and salutes — then lights the
// booster and rockets off down the road with the convoy chasing him. When he
// boosts, sim.redirectCops() sends YOUR chasing cops after him for
// def.pullSeconds (60 s), so they leave you and heat can decay.
//
// Timeline  idle → approach (RV within 100 m of def.z: he appears 80 m behind the
//           RV, up to 17 m/s faster, and eases onto the spot beside the cab) →
//           alongside → boost (to 68 m/s; cops up to 42–45 m/s) → gone (each
//           body despawns ≥ 360 m ahead of the RV, beyond downtown's 300 m fog).
//           RV stopped / crawling / reversing: he still pulls alongside (he never
//           reverses), salutes and boosts off.
// Lane      the nearest other forward lane (RV in the left lane → he takes the
//           right one); then the right shoulder; the oncoming lane only when there
//           is no other forward lane. Re-picked during the approach if the RV moves
//           into it. Alongside, his lane follows the RV sideways (parallel). Every
//           body keeps its centre ≥ 3.9 m from the RV's (≥ 1.5 m gap) while level
//           with it; one coming up from behind that isn't clear yet waits just short
//           of the RV's tail, and passes on the other side if the RV has it pinned
//           against the road edge.
// Redirect  target for each redirected cop: a carrot 35 m ahead of it in his lane,
//           never past a virtual Comet doing 50 m/s from the boost point (capped
//           before the bridge / sell point). Pure function of time + cop + RV.
// Entities  comet_car  variant 0 · state 1 boosting (approach), 0 cruising,
//                      2 salute (canopy cracked + visor glint), 3 full afterburner
//           cop ×6     variant 0 · state 1 chase (lights + siren)
//           all drive along the road (yaw = travel direction), y 0
// Colliders TRIGGERS only (solid: false) within 25 m of the RV: he and his convoy
//           ghost through traffic and cops like a cartoon. RV touching one = a
//           sideways shove (+ light damage, ≤ 3 per hit and 8 in all, only when the
//           RV slid into him). No lane blocks (the autopilot reads `ids`).
// state()   { dir (= side: +1 he is on the RV's right / +u, −1 left), side,
//             cometU, cometS, x, z (comet position, null once gone), redirected,
//             pull (s of redirect left), cops: 6, ids: [live comet + cop entity ids] }
// Captions  EV 'alongside' "THE MIDNIGHT COMET!" + sub (good). approach / boost
//           change phase silently, with toasts ("Sirens coming up behind you…",
//           "ZOOOM! Your tail peels off after the Comet!").
// Unity: MidnightCometSetPiece.
// ─────────────────────────────────────────────────────────────────────────────
import { Scripted, H, clamp, approach } from './common.js';
import { EV } from '../../shared/protocol.js';

const TRIGGER_D = 100;     // RV within this many metres of def.z → he appears
const SPAWN_BACK = 80;     // m behind the RV
const LEAD = 2.6;          // alongside: his centre this far ahead of the RV's (canopy by the cab)
const REL_MAX = 17;        // m/s faster than the RV while catching up
const SEP_GAP = 1.6;       // lateral gap kept to the RV's side (RV half width 1.3)
const RV_HALF_W = 1.3, RV_HALF_L = 4.3;
const BOOST_TOP = 68, BOOST_ACC = 15, COP_TOP = 45;
const DESPAWN_AHEAD = 360;
const DMG_CAP = 8;         // hp: most the RV can lose leaning on him / his convoy
const LAT_V = 6;           // m/s max sideways speed
const CAPTION_SUB = 'Six cop cars on his tail — and he just saluted you';

export class MidnightComet extends Scripted {
  start() {
    const rng = this.rng;
    this.zc = this.def.z;
    this.pullSeconds = this.def.pullSeconds ?? this.sim.data.rules?.heat?.comet?.pullSeconds ?? 60;
    this.alongDur = this.def.alongSeconds ?? rng.float(4.6, 5.6);
    this.saluteAt = rng.float(0.8, 1.3);
    this.side = 1;
    this.laneU = 0;
    this.comet = null;
    this.chasers = [];
    this.redirectAt = null;
    this.alongT = 0;
    this.phaseT = 0;
    this.boostT = 0;
    this.shoved = false;
    this.dmg = 0;
    // the six chasers: distance behind the comet, weave, top speed while he boosts away
    this.plan = [];
    for (let i = 0; i < 6; i++) {
      this.plan.push({ back: 11 + i * 8.6 + rng.float(-1, 1), wob: rng.float(0, 6.283), wobA: rng.float(0.12, 0.3), top: COP_TOP - rng.float(0, 3) });
    }
    // the whole run (approach + alongside + boost) travels with the RV: keep us alive past the zone
    this.extendRange(this.zc + 1500);
  }

  // ── helpers ────────────────────────────────────────────────────────────────
  _rvAlong() { const rv = this.rv, h = this.g.heading(rv.z); return (rv.vx || 0) * Math.sin(h) + (rv.vz || 0) * Math.cos(h); }
  _rvDu() { const rv = this.rv; return this.g.slope(rv.z) * (rv.vz || 0) - (rv.vx || 0); }
  _sep(b) { return RV_HALF_W + b.wid / 2 + SEP_GAP; }
  _lim(b) { return this.g.edge(b.s) - b.wid / 2 - 0.25; }

  /** his lane: nearest other forward lane; then the right shoulder; then the oncoming lane */
  _pickLane() {
    const g = this.g, z = this.rv.z, rvU = this.rvU();
    const n = g.lanesPerDir(z), lw = g.lw(z), hw = g.hw(z), sh = g.sh(z);
    const cands = [];
    for (let r = 0; r < n; r++) {
      cands.push({ u: (r + 0.5) * lw, cost: 0 });
      cands.push({ u: -(r + 0.5) * lw, cost: 6 + r });
    }
    if (sh >= 2.4) cands.push({ u: hw + sh / 2, cost: 3 });
    const lim = g.edge(z) - 1.05 - 0.25, need = RV_HALF_W + 1.05 + SEP_GAP;
    let best = null;
    for (const c of cands) {
      if (Math.abs(c.u - rvU) < lw * 0.75) continue;      // that's the RV's own lane
      if (Math.abs(rvU + Math.sign(c.u - rvU) * need) > lim) continue;   // no room for the gap on that side
      const score = c.cost + Math.abs(c.u - rvU) * 0.5 + (c.u > rvU ? 0.3 : 0);  // tie → pass on the left
      if (!best || score < best.score) best = { ...c, score };
    }
    if (!best) best = { u: rvU - 4 };
    this.laneU = best.u;
    this.side = best.u >= rvU ? 1 : -1;
  }

  _spawn() {
    const rv = this.rv;
    this._pickLane();
    const s0 = Math.max(5, rv.z - SPAWN_BACK);
    const v0 = Math.max(0, this._rvAlong()) + REL_MAX;
    this.comet = this.body('comet_car', 0, 0, s0, 0, { s: s0, u: this.laneU, v: v0, du: 0, len: 6.1, wid: 2.1, dodge: 0 });
    this.comet.state = 1;
    for (const p of this.plan) {
      const c = this.body('cop', 0, 0, s0 - p.back, 0, { s: s0 - p.back, u: this.laneU, v: v0, du: 0, len: 4.8, wid: 2.0, dodge: 0, plan: p });
      c.state = 1;
      this.chasers.push(c);
    }
    for (const b of this.bodies) b.onHit = (sim, info) => this._contact(b, info);
    this._layout();
  }

  _layout() {
    const g = this.g;
    for (const b of this.bodies) {
      const sl = g.slope(b.s);
      b.x = g.xAt(b.s, b.u); b.z = b.s; b.y = 0;
      const ds = Math.max(b.v, 4), du = b.du * clamp(b.v / 4, 0, 1);
      b.yaw = Math.atan2(sl * ds - du, ds);
      b.vx = sl * b.v - b.du; b.vz = b.v;
    }
  }

  // ── motion ───────────────────────────────────────────────────────────────────
  _driveComet(dt, vRv) {
    const c = this.comet, rv = this.rv;
    if (this.phase === 'boost') {
      c.v = Math.min(BOOST_TOP, c.v + BOOST_ACC * dt);
    } else {
      // ease onto the spot beside the cab and hold it (never reverses); pinned against the road
      // edge by the RV, drop back behind it instead (he then swings round the other side)
      const base = Math.max(0, vRv);
      const err = rv.z + (this._pinned() ? -(RV_HALF_L + c.len / 2 + 2.5) : LEAD) - c.s;
      const rel = clamp(Math.sign(err) * Math.sqrt(2 * 3.2 * Math.abs(err)), -6, REL_MAX);
      c.v = approach(c.v, Math.max(0, base + rel), 14 * dt);
    }
    const s0 = c.s;
    c.s += c.v * dt;
    if (c.alive) this._gate(c, s0, vRv);
  }

  _driveCop(b, dt, vRv) {
    const c = this.comet, p = b.plan;
    const err = c.s - p.back - b.s;
    const rel = clamp(Math.sign(err) * Math.sqrt(2 * 3 * Math.abs(err)), -8, 20);
    const top = this.phase === 'boost' ? p.top : 60;
    b.v = approach(b.v, clamp(c.v + rel, 0, top), (this.phase === 'boost' ? 9 : 14) * dt);
    const s0 = b.s;
    b.s += b.v * dt;
    this._gate(b, s0, vRv);
  }

  /** no room for the gap on his side and not clear of the RV yet */
  _pinned() {
    const c = this.comet, rvU = this.rvU(), need = this._sep(c);
    return Math.abs(rvU + this.side * need) > this._lim(c) && (c.u - rvU) * this.side < need - 0.25;
  }

  /** boosting off: settle into a clean lane on his side (keeping the gap), not wherever the RV left him */
  _laneForBoost() {
    const g = this.g, z = this.rv.z, rvU = this.rvU(), c = this.comet;
    const n = g.lanesPerDir(z), lw = g.lw(z), need = this._sep(c), lim = this._lim(c);
    let best = null;
    for (let r = 0; r < n; r++) for (const d of [1, -1]) {
      const u = d * (r + 0.5) * lw;
      if ((u - rvU) * this.side < need - 0.1 || Math.abs(u) > lim) continue;
      const cost = Math.abs(u - c.u) + (d < 0 ? 2 : 0);
      if (!best || cost < best.cost) best = { u, cost };
    }
    if (best) this.laneU = best.u;
  }

  /** coming up from behind: hold just short of the RV's tail until we are clear of it sideways */
  _gate(b, sPrev, vRv) {
    const back = this.rv.z - (RV_HALF_L + b.len / 2 + 1);
    if (sPrev > back + 0.01 || b.s <= back) return;
    const ps = b.pass ?? this.side;
    if ((b.u - this.rvU()) * ps >= this._sep(b) - 0.4) return;
    b.s = back; b.v = Math.min(b.v, Math.max(0, vRv));
  }

  /** alongside, his lane follows the RV sideways (parallel at a fixed gap, never off the road) */
  _followLane(dt) {
    const c = this.comet, rvU = this.rvU();
    const lim = this._lim(c);
    const want = clamp(rvU + this.side * this._sep(c), -lim, lim);
    this.laneU = approach(this.laneU, want, 2.5 * dt);
  }

  /** sideways: his lane, pushed out to keep the gap while level with the RV */
  _steer(b, dt, vRv) {
    const rv = this.rv, rvU = this.rvU(), side = this.side;
    let uT = this.laneU + (b.plan ? Math.sin(this.t * 0.9 + b.plan.wob) * b.plan.wobA : 0);
    // level with the RV (or about to be: look ahead by the closing speed)
    const ahead = b.len / 2 + RV_HALF_L + 3;
    const behind = ahead + Math.max(0, b.v - vRv) * 2;
    const dS = b.s - rv.z, lim = this._lim(b);
    let ff = 0;                                                  // feed-forward: match the RV sliding toward us
    if (dS < ahead && dS > -behind) {
      const need = this._sep(b);
      // still behind the RV's tail: pass on the other side if the RV has us pinned to the edge
      if (dS < -(b.len / 2 + RV_HALF_L)) {
        const okA = Math.abs(rvU + side * need) <= lim, okB = Math.abs(rvU - side * need) <= lim;
        b.pass = okA || !okB ? side : -side;
      }
      const ps = b.pass ?? side;
      uT = ps > 0 ? Math.max(uT, rvU + need) : Math.min(uT, rvU - need);
      const rvDu = this._rvDu();
      if (rvDu * ps > 0 && (b.u - rvU) * ps < need + 1) ff = rvDu;
      // he came past on the other side: that is his side now (the convoy follows)
      if (b === this.comet && ps !== side) { this.side = ps; this.laneU = clamp(rvU + ps * need, -lim, lim); }
    } else b.pass = null;
    uT += (b.pass ?? side) * b.dodge;
    uT = clamp(uT, -lim, lim);
    const du = clamp((uT - b.u) * 3.5 + ff, -LAT_V, LAT_V);
    b.u += du * dt; b.du = du;
    if (b.dodge > 0) b.dodge = Math.max(0, b.dodge - 0.8 * dt);
  }

  // ── the redirect: a virtual Comet ahead, pure function of time (works after we retire) ──
  _redirect() {
    const sim = this.sim, g = this.g;
    this.redirectAt = H.time(sim);
    const t0 = this.redirectAt, s0 = this.comet.s, laneU = this.laneU, side = this.side;
    const route = sim.route || sim.data?.route || {};
    let sMax = Infinity;
    if (route.bridge) sMax = Math.min(sMax, route.bridge.rampStart - 250);
    if (route.sellPoint) sMax = Math.min(sMax, route.sellPoint.z - 300);
    const V = 50;
    const active = H.cops(sim).filter((c) => c.kind !== 'heli' && c.state === 1).length;
    if (typeof sim.redirectCops === 'function') {
      sim.redirectCops((cop) => {
        const now = H.time(sim);
        const sV = Math.min(sMax, s0 + V * Math.max(0, now - t0));
        const cz = cop && Number.isFinite(cop.z) ? cop.z : sV;
        const tz = Math.max(5, Math.min(sV, cz + 35));          // a carrot down the road, in his lane
        let u = laneU;
        const rv = sim.rv;
        if (rv && (Math.abs(tz - rv.z) < 16 || (cz > rv.z - 30 && cz < rv.z + 12))) {   // overtaking the RV: keep to his side of it
          const ru = g.uAt(rv.x, rv.z), lim0 = g.edge(tz) - 1.2;
          const sd = Math.abs(ru + side * 4.2) <= lim0 ? side : -side;   // no room on his side: pass on the other
          if (sd === side) u = side > 0 ? Math.max(u, ru + 4.2) : Math.min(u, ru - 4.2);
          else u = ru + sd * 4.2;
        }
        const lim = g.edge(tz) - 1.2;
        u = clamp(u, -lim, lim);
        return { x: g.xAt(tz, u), z: tz };
      }, this.pullSeconds);
    }
    this.say(active > 0 ? 'ZOOOM! Your tail peels off after the Comet!' : 'ZOOOM! The Comet rockets off, sirens wailing after him.', 'good');
  }

  // ── RV contact (trigger colliders): a sideways shove, light damage only if the RV steered in ──
  _contact(b, info) {
    if (!info || (info.by && info.by !== 'rv') || !b.alive) return;
    if (b.hitCd > 0) return;
    b.hitCd = 0.6;
    const sim = this.sim, rv = this.rv, h = this.g.heading(b.s);
    const rvU = this.rvU();
    const away = Math.sign(rvU - b.u) || -this.side;           // which way (in u) the RV sits from him
    const closing = Math.max(0, (this._rvDu() - b.du) * -away); // RV sliding toward him (m/s)
    const kick = 3.2 + closing * 0.6;
    const ux = -Math.cos(h) * away, uz = Math.sin(h) * away;    // world direction of +u · away
    H.push(sim, ux * kick, uz * kick, closing > 1 ? 0.06 : 0.02);
    if (closing > 0.8 && this.dmg < DMG_CAP) {
      const a = Math.min(3, 1 + closing * 0.4, DMG_CAP - this.dmg);
      this.dmg += a;
      H.damage(sim, a, 'setpiece');
    }
    b.dodge = Math.min(1.5, b.dodge + 0.9);
    H.crash(sim, (b.x + rv.x) / 2, (b.z + rv.z) / 2, 0.12 + closing * 0.05);
    if (!this.shoved && b === this.comet) { this.shoved = true; this.say('Hands off the hero! He nudges you back.', 'info'); }
  }

  // ── main loop ───────────────────────────────────────────────────────────────
  _enter(phase) { this.phase = phase; this.phaseT = 0; }

  update(dt) {
    this.t += dt;
    this.tickBodies(dt);
    this.clearBlocks();
    const d = this.ahead(this.zc);
    if (this.phase === 'idle') {
      if (d < -400) { this.phase = 'missed'; this.done = true; return; }   // silent (no caption)
      if (d > TRIGGER_D) return;
      this._spawn();
      this._enter('approach');                                     // silent: the caption waits for the reveal
      this.say('Sirens coming up behind you… lots of them.', 'info');
    }
    if (!this.comet) return;
    this.phaseT += dt;
    const vRv = this._rvAlong(), rv = this.rv, c = this.comet;

    if (this.phase === 'approach') {
      // the RV moved into his lane before he got there: pick another
      const rvU = this.rvU(), need = this._sep(c);
      if (c.s < rv.z - 12 && (Math.abs(rvU - this.laneU) < need - 0.3 || Math.abs(rvU + this.side * need) > this._lim(c))) this._pickLane();
      const err = rv.z + LEAD - c.s;
      if ((Math.abs(err) < 2 && Math.abs(c.v - Math.max(0, vRv)) < 3) || (this.phaseT > 14 && Math.abs(err) < 10)) {
        this._enter('alongside');
        this.sim.emit({ type: EV.SETPIECE, id: this.id, kind: this.type, phase: 'alongside', caption: 'THE MIDNIGHT COMET!', sub: CAPTION_SUB });
        H.msg(this.sim, 'THE MIDNIGHT COMET!', 'good');
        this.captions++;
      } else if (this.phaseT > 14) { this._enter('boost'); this._redirect(); }
    } else if (this.phase === 'alongside') {
      if (Math.abs(rv.z + LEAD - c.s) < 4) this.alongT += dt;   // the clock runs while he's level with the cab
      if (this.alongT >= this.alongDur || this.phaseT > this.alongDur + 8) { this._enter('boost'); this._laneForBoost(); this._redirect(); }
    } else if (this.phase === 'boost') {
      this.boostT += dt;
    }

    // drive
    if (this.phase === 'alongside') this._followLane(dt);
    this._driveComet(dt, vRv);                                     // (keeps going after despawn: the convoy follows it)
    for (const b of this.chasers) if (b.alive) this._driveCop(b, dt, vRv);
    for (const b of this.bodies) if (b.alive) this._steer(b, dt, vRv);
    this._layout();

    // the comet's look: boosting in, cruising, salute, afterburner
    if (this.phase === 'approach') c.state = Math.abs(rv.z + LEAD - c.s) > 12 ? 1 : 0;
    else if (this.phase === 'alongside') c.state = this.alongT >= this.saluteAt && this.alongT < this.alongDur - 1.0 ? 2 : 0;
    else c.state = 3;

    // despawn well ahead (beyond the fog) — or, failing that, eventually
    if (this.phase === 'boost') {
      for (const b of this.bodies) {
        if (!b.alive) continue;
        const ds = b.s - rv.z;
        if (ds > DESPAWN_AHEAD || (this.boostT > 40 && Math.abs(ds) > 150) || this.boostT > 90) b.alive = false;
      }
      if (this.bodies.every((b) => !b.alive)) { this.setPhase('gone'); this.done = true; }
    }
  }

  colliders(out) {
    if (!this.comet) return;
    const rv = this.rv;
    for (const b of this.bodies) {
      if (!b.alive || Math.abs(b.s - rv.z) > 25) continue;
      this.boxCircles(out, b.x, b.z, b.yaw, b.len * 0.94, b.wid * 0.95, {
        id: b.id, kind: 'setpiece', solid: false, damage: 0, vx: b.vx || 0, vz: b.vz || 0, onHit: b.onHit,
      });
    }
  }

  extraState() {
    const pullLeft = this.redirectAt == null ? 0 : clamp(this.pullSeconds - (H.time(this.sim) - this.redirectAt), 0, this.pullSeconds);
    const c = this.comet && this.comet.alive ? this.comet : null, r1 = (v) => Math.round(v * 10) / 10;
    const ids = this.bodies.filter((b) => b.alive).map((b) => b.id);
    return {
      dir: this.side, side: this.side,
      cometU: c ? r1(c.u) : null, cometS: c ? r1(c.s) : null,
      x: c ? r1(c.x) : null, z: c ? r1(c.z) : null,
      redirected: this.redirectAt != null, pull: r1(pullLeft), cops: 6, ids,
    };
  }
}
