// ─────────────────────────────────────────────────────────────────────────────
// cattle_drive — Farmland (route.json z 30000).
// 15–20 cows and two cowboys on horseback wait on one side of the road, then
// cross it slowly (~1.5 m/s) when the RV is ~230 m away, and graze on the far
// side. The road is clear again ~30 s after the drive starts (stragglers get
// hurried along after 26 s). Honking within 40 m makes nearby cows trot.
// A cow blocked by the RV steps around it (no deadlock with a waiting RV).
// Entities  cow           variant 0/1 · state 0 standing/grazing, 1 walking (as obstacles.js cows)
//           cowboy_horse  variant 0 bay / 1 chestnut · state 0 standing, 1 riding (walk cycle)
//           yaw = facing (direction of travel)
// Colliders solid circles (cow r 1.3 — rules.obstacles.cow; cowboy r 1.4). RV hit = damage
//           by closing speed (rules.obstacles.cow.damage), "Mooo!".
// state()   { dir (+1 = herd moves toward the driver's right), cows, onRoad (count) }
// Unity: CattleDriveSetPiece.
// ─────────────────────────────────────────────────────────────────────────────
import { Scripted } from './common.js';

const WALK = 1.5;

export class CattleDrive extends Scripted {
  start() {
    const rng = this.rng, g = this.g, zc = this.def.z;
    this.zc = zc;
    this.dir = rng.sign();
    const edge = g.edge(zc);
    this.edge = edge;
    const lead = -this.dir * (edge + 4);
    const n = rng.int(15, 20);
    this.cows = [];
    for (let i = 0; i < n; i++) {
      const s = zc + rng.float(-12, 12), u = lead - this.dir * rng.float(0, 17);
      const c = this.body('cow', rng.int(0, 1), 0, 0, 0, { sp: rng.float(1.3, 1.8), r: 1.3, mooT: 0, stopU: this.dir * (edge + rng.float(9, 24)), trotT: 0 });
      this.place(c, s, u);
      c.yaw = g.heading(s) + rng.float(-1.2, 1.2) + (this.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
      this.cows.push(c);
    }
    this.riders = [];
    const rearU = lead - this.dir * 20;
    for (const [s, u] of [[zc - 14, lead - this.dir * 8], [zc + 2, rearU]]) {
      const r = this.body('cowboy_horse', rng.int(0, 1), 0, 0, 0, { sp: WALK, r: 1.4, stopU: this.dir * (edge + 26), cowboy: true });
      this.place(r, s, u);
      r.yaw = g.heading(s) + (this.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
      this.riders.push(r);
    }
    this.crossT = 0;
    this.phase = 'waiting';
  }

  _rvBlocks(b, nextU) {
    // RV rectangle in road frame (approx): |z − rv.z| < 4.8, |u − rvU| < 1.6
    const rv = this.sim.rv, rvU = this.rvU();
    return Math.abs(b.z - rv.z) < 4.3 + b.r && Math.abs(nextU - rvU) < 1.3 + b.r && Math.abs(nextU - rvU) < Math.abs(b.u - rvU) + 0.01;
  }

  update(dt) {
    this.t += dt;
    this.tickBodies(dt);
    this.clearBlocks();
    const sim = this.sim, rv = sim.rv, g = this.g, d = this.ahead(this.zc);
    if (this.phase === 'waiting') {
      if (d < -15) { this.setPhase('missed'); this.done = true; return; }
      if (d < 230 || this.eta(this.zc) < 10) this.setPhase('crossing', 'CATTLE DRIVE! Mind the herd.', 'info');
      else return;
    }
    if (this.phase === 'crossing') {
      this.crossT += dt;
      const hurry = this.crossT > 26 ? 2.2 : 1;
      const honk = rv.horn && Math.abs(d) < 40;
      let onRoad = 0;
      for (const b of this.bodies) {
        const remaining = (b.stopU - b.u) * this.dir;
        if (remaining <= 0) { b.state = 0; continue; }
        if (b.trotT > 0) b.trotT -= dt;
        if (honk && !b.cowboy && Math.abs(b.z - rv.z) < 30 && b.trotT <= 0) b.trotT = 2;
        const v = b.sp * hurry * (b.trotT > 0 ? 1.8 : 1);
        const nextU = b.u + this.dir * v * dt;
        if (this._rvBlocks(b, nextU)) {
          // step around the RV along the road (toward its nearer end)
          const away = b.z >= rv.z ? 1 : -1;
          b.s += away * 1.2 * dt; b.z = b.s;
          b.state = 1;
        } else {
          b.u = nextU; b.state = 1;
        }
        b.x = g.xAt(b.s, b.u);
        b.yaw = g.heading(b.s) + (this.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
        if (Math.abs(b.u) < this.edge + 1) onRoad++;
      }
      this.onRoad = onRoad;
      for (const b of this.bodies) if (Math.abs(b.u) < this.edge + 2) this.blockBody(b, b.r, b.r, 0.5);
      if (this.bodies.every((b) => (b.stopU - b.u) * this.dir <= 0 || Math.abs(b.u) > this.edge + 3 && b.u * this.dir > 0)) {
        if (onRoad === 0) this.setPhase('clear');
      }
    }
    if (this.phase === 'clear') {
      // keep wandering to the grazing spot
      for (const b of this.bodies) {
        const remaining = (b.stopU - b.u) * this.dir;
        if (remaining > 0) { b.u += this.dir * b.sp * dt; b.state = 1; b.x = g.xAt(b.s, b.u); } else b.state = 0;
      }
      if (d < -150) this.done = true;
    }
  }

  colliders(out) {
    const rv = this.sim.rv;
    const dmg = this.sim.data.rules?.obstacles?.cow?.damage ?? 10;
    for (const b of this.bodies) {
      if (Math.abs(b.z - rv.z) > 12 || Math.abs(b.x - rv.x) > 12) continue;
      this.solidCircle(out, b, b.r, { damage: dmg, speedLoss: 0.35, minSpeed: 1.5, onHit: (v) => { if (v > 3 && b.mooT <= this.t) { b.mooT = this.t + 3; this.say(b.cowboy ? 'Yee-haw! Watch it!' : 'Mooo!', 'info'); } } });
    }
  }

  extraState() { return { dir: this.dir, cows: this.cows.length, onRoad: this.onRoad ?? 0 }; }
}
