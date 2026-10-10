// ─────────────────────────────────────────────────────────────────────────────
// stagecoach — Ghost town main street, inside the dust storm (route.json z 37200).
// A tourist stagecoach bolts out of a side alley and gallops across the street
// (perpendicular, accelerating to ~10 m/s) when the RV is ~75 m away (short
// sight in the dust), then disappears down the alley opposite. Solid.
// Entities  stagecoach  variant 0 red / 1 green · state 0 standing, 1 galloping (horse legs +
//                       bob), 2 stopped · yaw = direction of travel (horses lead)
// Colliders solid circles along the coach (7.4 × 2.0) while near the road.
// state()   { dir (+1 = toward the driver's right), u, speed }
// Caption   'bolting' "RUNAWAY STAGECOACH!"
// Unity: StagecoachSetPiece.
// ─────────────────────────────────────────────────────────────────────────────
import { Scripted, approach } from './common.js';

const LEN = 7.4, WID = 2.0;

export class Stagecoach extends Scripted {
  start() {
    const rng = this.rng, g = this.g, z = this.def.z;
    this.zc = z;
    this.dir = rng.sign();
    this.v = 0;
    this.coach = this.body('stagecoach', rng.int(0, 1), 0, 0, 0, { u: -this.dir * (g.limit(z) + 4), len: LEN, wid: WID });
    this.coach.hidden = true;
    this._place();
    this.phase = 'idle';
  }

  _place() {
    const g = this.g, c = this.coach, z = this.zc;
    c.x = g.xAt(z, c.u); c.z = z;
    c.yaw = g.heading(z) - this.dir * Math.PI / 2;
    c.vx = -this.dir * this.v; c.vz = 0;
  }

  update(dt) {
    this.t += dt;
    this.tickBodies(dt);
    this.clearBlocks();
    const d = this.ahead(this.zc), c = this.coach, g = this.g;
    if (this.phase === 'idle') {
      if (d < -10) { this.setPhase('missed'); this.done = true; return; }
      if (d > 75 && this.eta(this.zc) > 3.4) return;
      this.setPhase('bolting', 'RUNAWAY STAGECOACH!', 'bad');
      c.hidden = false; c.state = 1; this.v = 6;
    }
    if (this.phase === 'bolting') {
      this.v = approach(this.v, 10, 2.5 * dt);
      c.u += this.dir * this.v * dt;
      this._place();
      if (Math.abs(c.u) - LEN / 2 < g.edge(this.zc) + 1) this.block(this.zc - WID / 2 - 1.5, this.zc + WID / 2 + 1.5, c.u - LEN / 2 - 1.5, c.u + LEN / 2 + 1.5 + this.dir * this.v);
      if (c.u * this.dir > g.limit(this.zc) + 6) { c.hidden = true; c.alive = false; this.setPhase('gone'); }
    }
    if (this.phase === 'gone' && d < -100) this.done = true;
  }

  colliders(out) {
    const c = this.coach;
    if (this.phase !== 'bolting' || Math.abs(c.z - this.sim.rv.z) > 25) return;
    this.solidBox(out, c, LEN, WID, { damage: 10, shove: 0.4, speedLoss: 0.35, minSpeed: 0.2 });
  }

  extraState() { return { dir: this.dir, u: Math.round(this.coach.u * 10) / 10, speed: Math.round(this.v * 10) / 10 }; }
}
