// ─────────────────────────────────────────────────────────────────────────────
// midnight_comet — Downtown intersection (route.json z 5600).
// The Midnight Comet (rocket car, hero inside) blasts across the intersection
// along the cross street at ~45 m/s with six police cars chasing (lights on).
// When he crosses the road, sim.redirectCops() sends YOUR chasing cops after him
// for def.pullSeconds (60 s): their target runs down the cross street, then back
// along the route away from the RV, so they peel off and heat can decay.
//
// Entities  comet_car  variant 0 · state 1 boosting (booster flame on), 0 coasting
//           cop ×6     variant 0 · state 1 chase (lights + siren)
//           all run along world X at z ≈ def.z (± 2.2 m for the two cop columns),
//           yaw = direction of travel, y 0
// Colliders solid circles (comet 6.1×2.1, cops 4.8×2.0) while near the road; RV hit
//           = damage + shove. Real cops caught in the stream get damage + push.
// state()   { dir, cometU, redirected, pull (s of redirect left), cops: 6 }
// Captions  'crossing' "THE MIDNIGHT COMET!" (good)
// Unity: MidnightCometSetPiece.
// ─────────────────────────────────────────────────────────────────────────────
import { Scripted, H, copsNear, clamp } from './common.js';

const COMET_SPEED = 45, START_U = 140, END_U = 170;

export class MidnightComet extends Scripted {
  start() {
    const rng = this.rng, z = this.def.z;
    this.zc = z;
    this.dir = rng.sign();
    this.pullSeconds = this.def.pullSeconds ?? this.sim.data.rules?.heat?.comet?.pullSeconds ?? 60;
    this.comet = null;
    this.chasers = [];
    this.redirectAt = null;
    this.copHit = new Map();
    // the six chasers: distance behind the comet, speed, column (z offset)
    this.plan = [];
    for (let i = 0; i < 6; i++) {
      this.plan.push({ back: 13 + i * 8 + rng.float(-1.5, 1.5), speed: rng.float(33, 36.5), col: i % 2 ? 2.2 : -2.2 });
    }
  }

  _spawn() {
    const z = this.zc;
    this.comet = this.body('comet_car', 0, 0, z, 0, { u: -this.dir * START_U, speed: COMET_SPEED, zOff: 0, len: 6.1, wid: 2.1 });
    this.comet.state = 1;
    for (const p of this.plan) {
      const c = this.body('cop', 0, 0, z + p.col, 0, { u: -this.dir * (START_U + p.back), speed: p.speed, zOff: p.col, len: 4.8, wid: 2.0 });
      c.state = 1;
      this.chasers.push(c);
    }
    this._layout();
  }

  _layout() {
    const g = this.g, h = g.heading(this.zc);
    for (const b of this.bodies) {
      const z = this.zc + b.zOff;
      b.x = g.xAt(z, b.u); b.z = z;
      b.yaw = h - this.dir * Math.PI / 2;
      b.vx = -this.dir * b.speed; b.vz = 0;
    }
  }

  /** virtual Comet position for the redirect (pure function of time — keeps working after this set-piece retires) */
  _target(tAbs) {
    const g = this.g, zc = this.zc, dir = this.dir;
    const dt = Math.max(0, tAbs - this.redirectAt);
    const uTurn = dir * (g.limit(zc) - 3);
    const t1 = Math.abs(uTurn - this.redirectU) / COMET_SPEED;
    if (dt < t1) {
      const u = this.redirectU + dir * COMET_SPEED * dt;
      return { x: g.xAt(zc, u), z: zc };
    }
    const z = Math.max(5, zc - COMET_SPEED * 0.8 * (dt - t1));
    const u = dir * (g.limit(z) - 3);
    return { x: g.xAt(z, u), z };
  }

  _redirect() {
    const sim = this.sim;
    this.redirectAt = H.time(sim);
    this.redirectU = this.comet.u;
    const active = H.cops(sim).filter((c) => c.kind !== 'heli' && c.state === 1).length;
    if (typeof sim.redirectCops === 'function') {
      const self = this;
      sim.redirectCops(() => self._target(H.time(sim)), this.pullSeconds);
    }
    if (active > 0) this.say('Your tail peels off after the Comet!', 'good');
  }

  update(dt) {
    this.t += dt;
    this.tickBodies(dt);
    this.clearBlocks();
    const d = this.ahead(this.zc);
    if (this.phase === 'idle') {
      if (d < -20) { this.setPhase('missed'); this.done = true; return; }
      if (d > 110 && this.eta(this.zc) > 7) return;
      this._spawn();
      this.setPhase('crossing', 'THE MIDNIGHT COMET!', 'good');
    }
    if (this.phase === 'crossing') {
      for (const b of this.bodies) b.u += this.dir * b.speed * dt;
      this._layout();
      if (this.redirectAt == null && this.comet.u * this.dir > 0) this._redirect();
      this._hitCops();
      const edge = this.g.edge(this.zc);
      for (const b of this.bodies) {
        if (!b.alive) continue;
        if (b.u * this.dir > END_U) { b.alive = false; continue; }
        if (Math.abs(b.u) - b.len / 2 < edge + 1) this.block(b.z - 2.5, b.z + 2.5, b.u - b.len / 2 - 2, b.u + b.len / 2 + 2);
      }
      if (this.bodies.every((b) => !b.alive)) this.setPhase('gone');
    }
    if (this.phase === 'gone' && d < -80) this.done = true;
  }

  _hitCops() {
    const sim = this.sim;
    for (const b of this.bodies) {
      if (!b.alive || Math.abs(b.u) > this.g.edge(this.zc) + 10) continue;
      for (const c of copsNear(sim, b.x, b.z, b.len / 2 + 2.6)) {
        const last = this.copHit.get(c.id) ?? -9;
        if (this.t - last < 2) continue;
        this.copHit.set(c.id, this.t);
        H.copEffect(sim, c.id, { push: { x: b.vx * 0.4, z: c.z >= b.z ? 5 : -5 }, damage: 18 });
        H.crash(sim, c.x, c.z, 0.6);
      }
    }
  }

  colliders(out) {
    if (this.phase !== 'crossing') return;
    const rv = this.sim.rv;
    if (Math.abs(rv.speed || 0) < 2 && Math.abs(rv.z - this.zc) < 6) return; // parked in the junction: they swerve round it
    const edge = this.g.edge(this.zc);
    for (const b of this.bodies) {
      if (!b.alive || Math.abs(b.u) - b.len / 2 > edge + 12) continue;
      this.solidBox(out, b, b.len, b.wid, { damage: b === this.comet ? 12 : 8, shove: 0.3, speedLoss: 0.2, minSpeed: 0.2 });
    }
  }

  extraState() {
    const pullLeft = this.redirectAt == null ? 0 : clamp(this.pullSeconds - (H.time(this.sim) - this.redirectAt), 0, this.pullSeconds);
    return { dir: this.dir, cometU: this.comet ? Math.round(this.comet.u * 10) / 10 : null, redirected: this.redirectAt != null, pull: Math.round(pullLeft * 10) / 10, cops: 6 };
  }
}
