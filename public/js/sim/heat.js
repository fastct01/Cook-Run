// ─────────────────────────────────────────────────────────────────────────────
// HeatSystem: wanted level.
//  • value accumulates from rules.heat.sources (callers use add()); stars = floor.
//  • "seen": any active cop within copSightRange (not blinded/spun/wrecked/gave up,
//    and not inside the dust storm), or the helicopter.
//  • decays at decayPerSec only after decayDelay s unseen (and no heli).
//  • calm decay: even while seen, after calmDelay s without a new incident heat
//    bleeds off at calmDecayPerSec (rules.sim.heatExtra) — the cops lose interest.
//  • After the bridge lip: gaveUp → value 0 forever.
//  • Bust meter (Round 3): rv.stopped accumulates while |speed| < bust.maxRvSpeed (4) and the
//    RV is on the ground (any faster frame resets it). The meter may fill only once
//    stopped ≥ bust.grace (Hard 3 s; bustInfo.armed) AND a running cop (state 1, not
//    redirected) is within bust.radius; it fills over bust.seconds (Hard 4 s) and drains at
//    decayPerSec; full → phase lost 'busted'. Soaked (6), stalled (7), paint-blind (8),
//    smoke-blind (2), spun-out (3), tyre-out (9) and steaming (10) cops neither see nor bust.
//    This applies at supply stops too (Rook's roof defence keeps them off).
//    bustInfo { grace: s left before the meter may fill, armed, defended: sim.roof.onRoof }.
// Unity port: HeatManager (singleton MonoBehaviour).
// ─────────────────────────────────────────────────────────────────────────────
import { clamp } from './util.js';

export class HeatSystem {
  constructor(sim) {
    this.sim = sim;
    this.H = sim.rules.heat;
    this.value = 0;
    this.stars = 0;
    this.maxStars = 0;
    this.seen = false;
    this.unseenT = 99;
    this.gaveUp = false;
    this.bust = 0;
    this.calmT = 0;   // seconds since the last witnessed incident
    this.armed = false;     // RV stopped for longer than bust.grace
    this.graceLeft = 0;     // s until the meter may fill (bustInfo.grace)
  }

  // Round 3 bust snapshot block: { grace, armed, defended }
  info() {
    let defended = false;
    try { defended = !!this.sim.roof?.onRoof; } catch (e) { defended = false; }
    return { grace: this.graceLeft, armed: this.armed, defended };
  }

  get max() { return (this.H.maxStars ?? 5) + 0.99; }
  level() { const L = this.H.levels; return L[clamp(this.stars, 0, L.length - 1)]; }

  // witnessed = someone saw it happen and calls it in (resets the decay timer). Lab vent smoke is
  // not witnessed unless rules.sim.lab.ventSmokeWitnessed = true.
  add(v, witnessed = true) {
    if (this.gaveUp || !(v > 0) || this.sim.phase !== 'drive') return;
    this.value = clamp(this.value + v, 0, this.max);
    if (witnessed) { this.unseenT = 0; this.calmT = 0; }
    this._syncStars();
  }

  // A discrete, witnessed incident (smash / pedHit / carCrash / copRam): base heat + patrol witness bonus.
  incident(v, kind) {
    if (this.gaveUp || this.sim.phase !== 'drive') return;
    this.add(v + this.sim.cops.witness(kind));
  }

  set(v) { this.value = clamp(v, 0, this.max); this.unseenT = 0; this.calmT = 0; this._syncStars(); }

  _syncStars() {
    const s = Math.floor(this.value);
    if (s !== this.stars) {
      const up = s > this.stars;
      this.stars = s;
      if (s > this.maxStars) this.maxStars = s;
      this.sim.emit({ type: 'stars', stars: s });
      if (up && s >= 1) this.sim.cops.onStarsUp(s);
    }
  }

  giveUp() {
    if (this.gaveUp) return;
    this.gaveUp = true;
    this.value = 0; this.bust = 0;
    this._syncStars();
  }

  update(dt) {
    const sim = this.sim, H = this.H, rv = sim.rv;
    const dust = sim.weather === 'dust';
    let seen = false;
    if (!dust && !this.gaveUp) {
      const R2 = H.copSightRange * H.copSightRange;
      for (const c of sim.cops.cops) {
        if (c.kind === 'heli') { if (c.state === 1) seen = true; continue; }
        if (c.state !== 1 && c.state !== 0) continue;   // smoke/oil/soaked/stalled/paint-blind/tyre-out/steaming cops can't see
        if (c.state === 0 && !c.parked) continue;
        if (c.redirected) continue;                       // busy chasing someone else (the Comet)
        const dx = c.x - rv.x, dz = c.z - rv.z;
        if (dx * dx + dz * dz < R2) { seen = true; break; }
      }
    }
    this.seen = seen;
    if (seen) this.unseenT = 0; else this.unseenT += dt;
    // someone called the RV in at a supply stop: the police know where it is until the response arrives
    if (!this.gaveUp && sim.cops.calledIn?.()) { this.unseenT = 0; this.calmT = 0; }
    const heli = sim.cops.hasHeli() && !dust;
    this.calmT += dt;
    const X = sim.cfg.heatExtra;
    if (!seen && !heli && this.unseenT >= H.decayDelay && this.value > 0) {
      this.value = Math.max(0, this.value - H.decayPerSec * dt);
      this._syncStars();
    } else if (this.value > 0 && this.calmT >= X.calmDelay && sim.phase === 'drive') {
      this.value = Math.max(0, this.value - X.calmDecayPerSec * dt);
      this._syncStars();
    }
    // bust meter: stopped for longer than the grace + a running cop close by
    const B = H.bust || {};
    const maxV = B.maxRvSpeed ?? 4, grace = B.grace ?? 3, secs = B.seconds ?? 4, radius = B.radius ?? 7.5;
    if (sim.phase === 'drive' && !rv.airborne && Math.abs(rv.speed) < maxV) rv.stopped = (rv.stopped || 0) + dt;
    else rv.stopped = 0;
    this.armed = sim.phase === 'drive' && rv.stopped >= grace;
    this.graceLeft = sim.phase === 'drive' && rv.stopped > 0 ? Math.max(0, grace - rv.stopped) : grace;
    let close = false;
    if (this.armed && rv.grace <= 0) {
      const R2 = radius * radius;
      for (const c of sim.cops.cops) {
        if (c.kind === 'heli' || c.state !== 1 || c.redirected) continue;
        const dx = c.x - rv.x, dz = c.z - rv.z;
        if (dx * dx + dz * dz < R2) { close = true; break; }
      }
    }
    if (close) this.bust = Math.min(1, this.bust + dt / Math.max(0.1, secs));
    else this.bust = Math.max(0, this.bust - (B.decayPerSec ?? 0.6) * dt);
    if (this.bust >= 1 && sim.phase === 'drive') sim.lose('busted');
  }
}
