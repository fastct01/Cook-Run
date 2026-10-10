// ─────────────────────────────────────────────────────────────────────────────
// wide_load — Suburbs (route.json z 15600, speed 6, length 700).
// A house on a flatbed (wide_load v0, 16.8 × 4.5 m, collider 5 m wide) crawls
// along the road centre at def.speed with two escort pickups (wide_load v1):
// one behind it in the forward lane (the RV meets it first), one ahead of it in
// the oncoming lane. Together they close both lanes. After def.length metres
// (or when the RV has been crawling right behind it for 20 s) the convoy pulls
// over onto the right shoulder/verge and parks. Detours: squeeze along the right
// verge, or the back gardens on the left (biome `yards`, side −1, VIEW-WORLD-A).
// Starts 100 m before def.z when the set-piece activates (out of sight).
// Entities  wide_load  v0 house hauler · v1 escort pickup
//                      state 0 driving, 1 parked (pulled over), 2 pulling over (indicator on)
//                      amber beacons always flash
// Colliders solid circles (house 16.8 × 5.0, escorts 5.4 × 2.0); RV hit = damage by closing speed.
// state()   { z (house), u (house), travelled, length, impatient (s) }
// Unity: WideLoadSetPiece.
// ─────────────────────────────────────────────────────────────────────────────
import { Scripted, approach } from './common.js';

const HOUSE_LEN = 16.8, HOUSE_WID = 5.0, ESC_LEN = 5.4, ESC_WID = 2.0;

export class WideLoad extends Scripted {
  start() {
    const d = this.def;
    this.speed = d.speed ?? 6;
    this.length = d.length ?? 700;
    this.s0 = d.z - 100;
    this.s = this.s0;                 // house centre
    this.v = this.speed;
    this.travelled = 0;
    this.impatient = 0;
    this.extendRange(this.s0 + this.length + 120);
    const lw = this.g.lw(this.s);
    this.house = this.body('wide_load', 0, 0, 0, 0, { du: 0, len: HOUSE_LEN, wid: HOUSE_WID });
    this.rear = this.body('wide_load', 1, 0, 0, 0, { ds: -(HOUSE_LEN / 2 + ESC_LEN / 2 + 5), du: lw * 0.5, len: ESC_LEN, wid: ESC_WID });
    this.front = this.body('wide_load', 1, 0, 0, 0, { ds: HOUSE_LEN / 2 + ESC_LEN / 2 + 7, du: -lw * 0.5, len: ESC_LEN, wid: ESC_WID });
    this.pullU = 0;     // lateral shift while pulling over
    this.phase = 'convoy';
    this.announced = false;
    this._layout(0);
  }

  _layout(dt) {
    const g = this.g;
    for (const b of this.bodies) {
      const s = this.s + (b.ds ?? 0);
      let u = (b.du ?? 0);
      if (this.phase !== 'convoy') {
        // pull over: everyone lines up on the right verge
        const target = g.hw(s) + g.sh(s) + (b === this.house ? 1.2 : 0.6);
        b.pu = approach(b.pu ?? u, target, 1.6 * dt);
        u = b.pu;
      }
      const prevU = b.u ?? u;
      b.u = u; b.s = s;
      b.x = g.xAt(s, u); b.z = s;
      const du = dt > 0 ? (u - prevU) / dt : 0;
      b.yaw = g.yawFor(s, Math.max(0.3, this.v), du);
      b.vx = g.slope(s) * this.v - du; b.vz = this.v;
    }
  }

  update(dt) {
    this.t += dt;
    this.tickBodies(dt);
    this.clearBlocks();
    const rv = this.sim.rv;
    const rearZ = this.rear.z - ESC_LEN / 2;
    // impatience: RV crawling right behind the convoy
    const behind = rearZ - rv.z;
    if (this.phase === 'convoy' && behind > 0 && behind < 30 && Math.abs(rv.speed || 0) < this.speed + 3) this.impatient += dt;
    if (!this.announced && behind < 160) { this.announced = true; this.beat('approach', 'WIDE LOAD! Crawl behind it or cut through the gardens.', 'info'); }
    if (this.phase === 'convoy') {
      this.v = this.speed;
      this.s += this.v * dt; this.travelled += this.v * dt;
      if (this.travelled >= this.length || this.impatient > 20) this.setPhase('pullover', this.impatient > 20 ? 'The wide load pulls over to let you by.' : null, 'good');
    } else if (this.phase === 'pullover') {
      this.v = approach(this.v, 0, 1.2 * dt);
      this.s += this.v * dt;
      if (this.v <= 0.01 && this.bodies.every((b) => b.pu != null && Math.abs(b.pu - (this.g.hw(b.s) + this.g.sh(b.s) + (b === this.house ? 1.2 : 0.6))) < 0.05)) this.setPhase('parked');
    }
    this._layout(dt);
    for (const b of this.bodies) b.state = this.phase === 'convoy' ? 0 : this.phase === 'pullover' ? 2 : 1;
    for (const b of this.bodies) this.blockBody(b, b.len / 2 + (this.phase === 'convoy' ? 4 : 0), b.wid / 2, 0.8);
    if (this.phase === 'convoy') this.block(this.rear.z - ESC_LEN / 2 - 2, this.front.z + ESC_LEN / 2 + 2, -this.g.hw(this.s) - 0.2, this.g.hw(this.s) + 0.2);
    if (this.phase === 'parked' && rv.z > this.front.z + 150) this.done = true;
  }

  colliders(out) {
    const rv = this.sim.rv;
    for (const b of this.bodies) {
      if (Math.abs(b.z - rv.z) > 40) continue;
      this.solidBox(out, b, b.len, b.wid, { damage: b === this.house ? 10 : 7, speedLoss: 0.3 });
    }
  }

  extraState() {
    const r1 = (v) => Math.round(v * 10) / 10;
    return { z: r1(this.house.z), u: r1(this.house.u), travelled: r1(this.travelled), length: this.length, impatient: r1(this.impatient) };
  }
}
