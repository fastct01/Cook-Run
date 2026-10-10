// ─────────────────────────────────────────────────────────────────────────────
// freight_wagons — Ironworks rail yard by the level crossing (route.json z 1800).
// 3–4 runaway freight wagons (14 m/s) roll across the road on a yard SIDING 24 m past
// the main-line crossing (z = def.z + 24, rails along world X like the train's) when
// the RV is ~75 m (or 3 s) from it. If the train is warning/passing — or will start
// warning before the RV reaches the main line — they are held until the RV pulls away
// after the train, so they are always a real obstacle and never trap the RV on the
// train's rails (an RV that waits for the wagons waits beyond the main line).
// VIEW-WORLD-A: draw the siding (two rails across the road + yard) at state().railZ.
//
// Entities  freight_wagon  variant 0 boxcar · 1 tanker · 2 open hopper
//                          state 0 rolling (wheels turn), 1 stopped
//                          yaw = direction of travel (road heading ∓ π/2), y 0
// Colliders solid circles along each wagon (12 m × 3 m); RV hit = damage + shove.
// state()   { railZ (siding z), wagons, dir (+1 rolling toward the driver's right), speed,
//             gatesDown (bool: flash the crossing lights/bells while rolling) }
// Unity: FreightWagonsSetPiece.
// ─────────────────────────────────────────────────────────────────────────────
import { Scripted, H, copsNear } from './common.js';

const WAGON_LEN = 12, WAGON_WID = 3.0, SPEED = 14, TRIGGER = 75, SIDING = 24;   // siding z = def.z + SIDING

export class FreightWagons extends Scripted {
  start() {
    const rng = this.rng, g = this.g, z = this.def.z + (this.def.siding ?? SIDING);
    this.zr = z;
    this.n = rng.int(3, 4);
    this.dir = rng.sign();               // +1: rolls toward +u (starts on the driver's left)
    this.speed = SPEED;
    this.edge = g.edge(z);
    this.gaps = [];
    for (let i = 0; i < this.n - 1; i++) this.gaps.push(rng.float(3.5, 6));
    this.variants = [];
    for (let i = 0; i < this.n; i++) this.variants.push(rng.int(0, 2));
    this.total = this.n * WAGON_LEN + this.gaps.reduce((a, b) => a + b, 0);
    this.startLead = this.edge + 14;     // |u| of the lead wagon's nose at the start (behind the yard sheds)
    this.endTail = this.edge + 18;       // |u| of the tail beyond which the wagons are gone
    this.leadU = -this.dir * this.startLead;
    this.copHit = new Map();
    this.phase = 'idle';
  }

  // main-line train warning or passing (live state from sim/events.js, else its schedule formula)
  // …or about to warn before the RV reaches the main line (it will be stopped there anyway)
  _trainBusy() {
    const sim = this.sim;
    const live = sim.events && typeof sim.events.trainInfo === 'function' ? sim.events.trainInfo() : null;
    if (live && Math.abs(live.z - this.def.z) < 40 && (live.state === 'warn' || live.state === 'pass')) return true;
    const ev = (sim.data.route.events || []).find((e) => e.type === 'train' && Math.abs(e.z - this.def.z) < 40);
    if (!ev) return false;
    const c = ev.period, ph = ((((sim.t ?? H.time(sim)) + c * 0.35) % c) + c) % c;
    const clearLen = c - ev.warn - ev.pass;
    if (ph >= clearLen) return true;
    return clearLen - ph < Math.min(8, this.eta(this.def.z) + 1.5);
  }

  _spawn() {
    let off = 0;
    for (let i = 0; i < this.n; i++) {
      const b = this.body('freight_wagon', this.variants[i], 0, this.zr, 0, { off: off + WAGON_LEN / 2 });
      off += WAGON_LEN + (this.gaps[i] ?? 0);
      b.state = 0;
    }
    this._layout();
  }

  _layout() {
    const g = this.g, z = this.zr, h = g.heading(z);
    const yaw = h - this.dir * Math.PI / 2;
    const vx = -this.dir * this.speed, vz = 0; // rails run along world X at z (as the train in events.js)
    for (const b of this.bodies) {
      const u = this.leadU - this.dir * b.off;
      b.u = u; b.x = g.xAt(z, u); b.z = z; b.yaw = yaw; b.vx = vx; b.vz = vz;
    }
  }

  update(dt) {
    this.t += dt;
    this.tickBodies(dt);
    this.clearBlocks();
    const d = this.ahead(this.zr);
    if (this.phase === 'idle') {
      if (d < -6) { this.setPhase('missed'); this.done = true; return; }
      if (d > TRIGGER && this.eta(this.zr) > 3) return;
      // the train is coming/passing and the RV hasn't crossed the main line yet, or the RV is
      // queued at the gates: hold the wagons until it moves off again after the train
      if (this.sim.rv.z < this.def.z + 2 && this._trainBusy()) return;
      if (d < 60 && Math.abs(this.sim.rv.speed || 0) < 3) return;
      this._spawn();
      this.setPhase('rolling', 'RUNAWAY FREIGHT WAGONS!', 'bad');
    }
    if (this.phase === 'rolling') {
      this.leadU += this.dir * this.speed * dt;
      this._layout();
      this._hitCops();
      const tailU = this.leadU - this.dir * this.total;
      if (tailU * this.dir > this.endTail) {
        for (const b of this.bodies) b.alive = false;
        this.setPhase('clear');
        return;
      }
      for (const b of this.bodies) {
        if (Math.abs(b.u) - WAGON_LEN / 2 > this.edge + 2) continue;
        this.block(this.zr - WAGON_WID / 2 - 1.5, this.zr + WAGON_WID / 2 + 1.5, b.u - WAGON_LEN / 2 - 1, b.u + WAGON_LEN / 2 + 1);
      }
    }
    if (this.phase === 'clear' && d < -60) this.done = true;
  }

  _hitCops() {
    const sim = this.sim;
    for (const b of this.bodies) {
      for (const c of copsNear(sim, b.x, b.z, WAGON_LEN / 2 + 2.5)) {
        const along = Math.abs(c.x - b.x), across = Math.abs(c.z - b.z);
        if (along > WAGON_LEN / 2 + 1.2 || across > WAGON_WID / 2 + 1.2) continue;
        const last = this.copHit.get(c.id) ?? -9;
        if (this.t - last < 1.5) continue;
        this.copHit.set(c.id, this.t);
        H.copEffect(sim, c.id, { push: { x: b.vx * 1.2, z: (c.z >= b.z ? 4 : -4) }, damage: 30 });
        H.crash(sim, c.x, c.z, 0.7);
      }
    }
  }

  colliders(out) {
    if (this.phase !== 'rolling') return;
    for (const b of this.bodies) {
      if (!b.alive || Math.abs(b.u) - WAGON_LEN / 2 > this.edge + 18) continue;
      this.solidBox(out, b, WAGON_LEN, WAGON_WID, { damage: 14, shove: 0.5, speedLoss: 0.35, minSpeed: 0.2 });
    }
  }

  extraState() {
    return { railZ: this.zr, wagons: this.n, dir: this.dir, speed: this.speed, gatesDown: this.phase === 'rolling' };
  }
}
