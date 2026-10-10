// ─────────────────────────────────────────────────────────────────────────────
// combine — Farmland (route.json z 31200).
// A combine harvester (5.6 m header) trundles along the road centre at 4 m/s,
// taking both lanes, for ~400 m from def.z − 60, then turns off into the field
// and stops. Squeeze past on the dirt shoulder / field edge (2+ m each side plus
// 30 m of field). If the RV crawls behind it for 15 s the farmer pulls into the
// field early.
// Entities  combine  variant 0 green / 1 faded red
//                    state 0 driving (reel spinning), 1 turning into the field, 2 stopped (reel idle)
// Colliders solid circles covering 9.4 × 5.8 m; RV hit = damage by closing speed.
// state()   { z, u, travelled, impatient, fieldSide }
// Unity: CombineSetPiece.
// ─────────────────────────────────────────────────────────────────────────────
import { Scripted, approach } from './common.js';

const LEN = 9.4, WID = 5.8, SPEED = 4, RUN = 400;

export class Combine extends Scripted {
  start() {
    const rng = this.rng, z = this.def.z;
    this.s0 = z - 60;
    this.extendRange(this.s0 + RUN + 80);
    this.fieldSide = rng.sign();
    this.cb = this.body('combine', rng.int(0, 1), 0, 0, 0, { s: this.s0, u: 0, v: SPEED });
    this.place(this.cb, this.s0, 0);
    this.cb.yaw = this.g.heading(this.s0);
    this.travelled = 0;
    this.impatient = 0;
    this.announced = false;
    this.phase = 'driving';
  }

  update(dt) {
    this.t += dt;
    this.tickBodies(dt);
    this.clearBlocks();
    const rv = this.sim.rv, b = this.cb, g = this.g;
    const behind = (b.z - LEN / 2) - rv.z;
    if (!this.announced && behind < 180 && behind > 0) { this.announced = true; this.beat('approach', 'COMBINE HARVESTER — squeeze past on the shoulder!', 'info'); }
    let du = 0;
    if (this.phase === 'driving') {
      if (behind > 0 && behind < 25 && Math.abs(rv.speed || 0) < 7) this.impatient += dt;
      b.v = SPEED;
      if (this.travelled >= RUN || this.impatient > 15) this.setPhase('turning', this.impatient > 15 ? 'The farmer pulls into the field.' : null, 'good');
    } else if (this.phase === 'turning') {
      const target = this.fieldSide * (g.edge(b.s) + 14);
      const prev = b.u;
      b.u = approach(b.u, target, 2.6 * dt);
      du = (b.u - prev) / dt;
      b.v = approach(b.v, 1.5, 1 * dt);
      if (Math.abs(b.u - target) < 0.05) this.setPhase('field');
    } else if (this.phase === 'field') {
      b.v = approach(b.v, 0, 1.5 * dt);
    }
    b.s += b.v * dt; this.travelled += b.v * dt;
    b.x = g.xAt(b.s, b.u); b.z = b.s;
    const yawT = g.yawFor(b.s, Math.max(0.2, b.v), du);
    b.yaw += (yawT - b.yaw) * Math.min(1, 3 * dt);
    b.vx = g.slope(b.s) * b.v - du; b.vz = b.v;
    b.state = this.phase === 'driving' ? 0 : this.phase === 'turning' ? 1 : 2;
    this.blockBody(b, LEN / 2 + (b.v > 0.5 ? 5 : 0), WID / 2, 0.7);
    if (this.phase === 'field' && rv.z > b.z + 150) this.done = true;
  }

  colliders(out) {
    const b = this.cb;
    if (Math.abs(b.z - this.sim.rv.z) > 30) return;
    // header-wide box: three circles of r = 2.9
    this.solidBox(out, b, LEN, WID, { damage: 9, speedLoss: 0.35 });
  }

  extraState() {
    const r1 = (v) => Math.round(v * 10) / 10;
    return { z: r1(this.cb.z), u: r1(this.cb.u), travelled: r1(this.travelled), impatient: r1(this.impatient), fieldSide: this.fieldSide };
  }
}
