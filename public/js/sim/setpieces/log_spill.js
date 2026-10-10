// ─────────────────────────────────────────────────────────────────────────────
// log_spill — Foothills (route.json z 33000).
// A logging truck has jackknifed on a track up the hillside (uphill side picked
// per seed). When the RV is ~170 m out its chains snap: six logs roll down the
// slope and across the road in three waves of two (2.4 s apart, each wave at a
// different z), then come to rest on the downhill verge. Timing game: thread the
// gaps between waves, or wait ~10 s for the road to clear.
// Entities  logging_truck  variant 0 red / 1 cream · state 0 jackknifed (hazards on),
//                          1 spilled (chains gone); hide log_i where state().logs bit i is 0
//           log            state 0 rolling (trunk.rotation.x += distance / 0.44 — the log's
//                          local +Z is its roll direction, axis along the road), 1 resting
// Colliders solid circles along each log (6 m × 1.2 m) and the truck; rolling log hit =
//           heavy damage (rules.obstacles.log.damage) + shove along its roll; cops too.
// state()   { side (uphill, +1 = driver's right), logs (bitmask on the truck), wave, rolling }
// Unity: LogSpillSetPiece.
// ─────────────────────────────────────────────────────────────────────────────
import { Scripted, H, approach, copsNear } from './common.js';

const LOG_LEN = 6, LOG_WID = 1.2, WAVE_GAP = 2.4;

export class LogSpill extends Scripted {
  start() {
    const rng = this.rng, g = this.g, z = this.def.z;
    this.zc = z;
    this.side = rng.sign();
    this.rollDir = -this.side;
    const tz = z + 22;
    this.truck = this.body('logging_truck', rng.int(0, 1), 0, 0, 0, { len: 14.6, wid: 2.6 });
    this.place(this.truck, tz, this.side * (g.edge(tz) + 13));
    this.truck.yaw = g.heading(tz) + Math.PI + this.side * 0.75;
    this.logMask = 0b111111;
    const order = [[5, 3], [4, 2], [1, 0]];
    const zs = [z - 8 + rng.float(-2, 2), z + 5 + rng.float(-2, 2), z - 2 + rng.float(-2, 2)];
    this.waves = order.map((idx, w) => ({ idx, z: zs[w], at: w * WAVE_GAP, released: false }));
    this.logs = [];
    this.wave = 0;
    this.copHit = new Map();
    this.phase = 'idle';
  }

  _release(w) {
    const g = this.g;
    w.released = true;
    this.wave++;
    w.idx.forEach((bit, k) => {
      const s = w.z + (k ? 3.4 : -3.4);
      const u = this.side * (g.edge(s) + 9 + k * 1.5);
      const b = this.body('log', 0, 0, 0, 0, { v: 6.5 + this.rng.float(0, 1.2), rest: -this.side * (g.edge(s) + this.rng.float(5, 11)), len: LOG_LEN, wid: LOG_WID, bit });
      this.place(b, s, u);
      b.y = 0.55;
      this.logs.push(b);
      this.logMask &= ~(1 << bit);
    });
  }

  update(dt) {
    this.t += dt;
    this.tickBodies(dt);
    this.clearBlocks();
    const g = this.g, d = this.ahead(this.zc);
    if (this.phase === 'idle') {
      if (d < -20) { this.setPhase('missed'); this.done = true; return; }
      if (d < 170 || this.eta(this.zc) < 6.5) { this.setPhase('spilling', 'LOG SPILL!', 'bad'); this.t0 = this.t; this.truck.state = 1; }
      else return;
    }
    if (this.phase === 'spilling') {
      for (const w of this.waves) if (!w.released && this.t - this.t0 >= w.at) this._release(w);
    }
    let rolling = 0;
    for (const b of this.logs) {
      if (b.state === 1) continue;
      rolling++;
      const h = g.heading(b.s);
      const past = (b.u - (-this.side) * g.edge(b.s)) * this.rollDir; // > 0 once beyond the far edge
      b.v = past > 0 ? approach(b.v, 0, 2.6 * dt) : Math.min(10, b.v + 0.9 * dt);
      b.u += this.rollDir * b.v * dt;
      if ((b.u - b.rest) * this.rollDir >= 0 || b.v <= 0.05) { b.state = 1; b.v = 0; }
      b.x = g.xAt(b.s, b.u); b.z = b.s;
      b.yaw = h - this.rollDir * Math.PI / 2;
      b.vx = -this.rollDir * b.v; b.vz = 0;
      if (Math.abs(b.u) < g.edge(b.s) + 4) this.block(b.s - LOG_LEN / 2 - 0.8, b.s + LOG_LEN / 2 + 0.8, Math.min(b.u, b.u + this.rollDir * b.v * 1.5) - 1, Math.max(b.u, b.u + this.rollDir * b.v * 1.5) + 1);
    }
    this.rolling = rolling;
    this._hitCops();
    if (this.phase === 'spilling' && this.waves.every((w) => w.released) && rolling === 0) this.setPhase('clear');
    if (this.phase === 'clear' && d < -150) this.done = true;
  }

  _hitCops() {
    const sim = this.sim;
    for (const b of this.logs) {
      if (b.state !== 0) continue;
      for (const c of copsNear(sim, b.x, b.z, LOG_LEN / 2 + 2)) {
        if (Math.abs(c.z - b.z) > LOG_LEN / 2 + 1.2 || Math.abs(c.x - b.x) > LOG_WID / 2 + 1.3) continue;
        const last = this.copHit.get(c.id) ?? -9;
        if (this.t - last < 2) continue;
        this.copHit.set(c.id, this.t);
        H.copEffect(sim, c.id, { push: { x: b.vx * 1.2, z: -3 }, damage: 35 });
        H.crash(sim, c.x, c.z, 0.8);
      }
    }
  }

  colliders(out) {
    const rv = this.sim.rv;
    const dmg = this.sim.data.rules?.obstacles?.log?.damage ?? 14;
    for (const b of this.logs) {
      if (Math.abs(b.z - rv.z) > 25 || Math.abs(b.x - rv.x) > 25) continue;
      this.solidBox(out, b, LOG_LEN, LOG_WID, { yaw: this.g.heading(b.z), damage: b.state === 0 ? dmg : dmg * 0.4, shove: 0.6, speedLoss: 0.45, minSpeed: 0.2 });
    }
    const t = this.truck;
    if (Math.abs(t.z - rv.z) < 30) {
      this.solidBox(out, t, t.len, t.wid, { damage: 8, speedLoss: 0.4 });
    }
  }

  extraState() { return { side: this.side, logs: this.logMask, wave: this.wave, rolling: this.rolling ?? 0 }; }
}
