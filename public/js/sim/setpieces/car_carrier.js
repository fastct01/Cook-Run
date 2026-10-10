// ─────────────────────────────────────────────────────────────────────────────
// car_carrier — Interstate (route.json z 21500).
// A car carrier drives ahead of the RV in the forward lane nearest to it at
// 14 m/s (it spawns 400 m ahead, in the fog). When the RV closes to ~85 m (or the carrier passes def.z + 250) its
// ramp drops and the six cargo cars roll off the back one by one (every 1.5 s):
// lower deck first (cargo_3, 4, 5), then the upper deck tumbles off (cargo_0, 1, 2).
// The dropped cars bounce, spin and slide to a stop as wrecks (solid). Chasing
// cops that run into them take damage. Empty, the carrier pulls onto the right
// shoulder and parks (it never vanishes in front of the RV).
// Entities  car_carrier  variant 0 blue cab / 1 red cab · state 0 driving (ramp up),
//                        1 ramp down + dropping, 2 empty (parked when speed 0)
//           sedan / hatch (variants 0–5) — the dropped cars: state 2 tumbling/sliding
//                        (y > 0 while in the air: roll it), 1 wrecked at rest.
//                        On spawn hide the matching cargo_i part (state().cargo bit i).
// Colliders carrier solid (17 × 2.6); dropped cars solid when low (y < 1.2).
// state()   { ramp 0..1 (ramp.rotation.x = −2.12·ramp), cargo (bitmask, bit i = cargo_i
//             still on board), dropped, lane u }
// Unity: CarCarrierSetPiece.
// ─────────────────────────────────────────────────────────────────────────────
import { Scripted, H, clamp, approach } from './common.js';

const LEN = 17, WID = 2.6, SPEED = 14, DROP_EVERY = 1.5, SPAWN_AHEAD = 400;
const CARGO = [ // index → [deck y, local z from the carrier centre]
  [2.89, -6.3], [2.89, -2.0], [2.89, 2.3], [1.24, -6.3], [1.24, -2.0], [1.24, 2.3],
];
const ORDER = [3, 4, 5, 0, 1, 2];

export class CarCarrier extends Scripted {
  start() {
    const g = this.g, rv = this.sim.rv, rng = this.rng;
    this.extendRange(this.def.z + 700);
    const s = Math.max(rv.z + SPAWN_AHEAD, this.def.z - 250);   // in the fog (interstate fogFar 460)
    // forward lane nearest to the RV
    const n = g.lanesPerDir(s), lw = g.lw(s);
    const ru = clamp(this.rvU(), 0.1, n * lw);
    const rank = clamp(Math.round(ru / lw - 0.5), 0, n - 1);
    this.laneU = g.laneU(s, 1, rank);
    this.carrier = this.body('car_carrier', rng.int(0, 1), 0, 0, 0, { s, u: this.laneU, v: SPEED, len: LEN, wid: WID });
    this.cargo = 0b111111;
    this.ramp = 0;
    this.dropT = 0;
    this.next = 0;
    this.cars = [];
    this.carKinds = ORDER.map((_, i) => (i % 2 ? 'hatch' : 'sedan'));
    this.carVars = ORDER.map(() => rng.int(0, 5));
    this.copHit = new Map();
    this.phase = 'cruising';
    this._place(0);
  }

  _place(dt) {
    const c = this.carrier, g = this.g;
    const prevU = c.u;
    c.s += c.v * dt;
    if (this.phase === 'empty' || this.phase === 'parked') {
      const target = g.hw(c.s) + g.sh(c.s) * 0.5 + 0.6;
      c.u = approach(c.u, target, 1.4 * dt);
    }
    const du = dt > 0 ? (c.u - prevU) / dt : 0;
    c.x = g.xAt(c.s, c.u); c.z = c.s;
    c.yaw = g.yawFor(c.s, Math.max(0.3, c.v), du);
    c.vx = g.slope(c.s) * c.v - du; c.vz = c.v;
  }

  _drop(idx) {
    const c = this.carrier, rng = this.rng;
    const [deckY] = CARGO[idx];
    const k = ORDER.indexOf(idx);
    const back = LEN / 2 + 2.2;
    const sY = Math.sin(c.yaw), cY = Math.cos(c.yaw);
    const car = this.body(this.carKinds[k], this.carVars[k], c.x - sY * back, c.z - cY * back, c.yaw, {
      len: 4.4, wid: 1.9, w: rng.float(-2.5, 2.5), cargo: idx,
    });
    const rel = deckY > 2 ? rng.float(6, 9) : rng.float(8, 11);   // rolls backward off the ramp
    car.vx = c.vx - sY * rel + rng.float(-1.6, 1.6);
    car.vz = c.vz - cY * rel;
    car.vy = deckY > 2 ? rng.float(1.0, 2.5) : 0.4;
    car.y = deckY > 2 ? deckY : 0.6;
    car.state = 2;
    this.cars.push(car);
    this.cargo &= ~(1 << idx);
  }

  _carPhysics(car, dt) {
    if (car.state === 1) return;
    car.vy -= 9.81 * dt;
    car.x += car.vx * dt; car.z += car.vz * dt; car.y += car.vy * dt;
    car.yaw += car.w * dt;
    if (car.y <= 0) {
      car.y = 0;
      if (car.vy < -2.5) { car.vy = -car.vy * 0.3; car.w += this.rng.float(-1.5, 1.5); H.crash(this.sim, car.x, car.z, 0.35); }
      else car.vy = 0;
      // ground friction
      const v = Math.hypot(car.vx, car.vz);
      if (v > 0) { const nv = Math.max(0, v - 7 * dt); car.vx *= nv / v; car.vz *= nv / v; }
      car.w *= Math.max(0, 1 - 1.8 * dt);
      if (v < 0.4 && car.vy === 0) { car.state = 1; car.vx = car.vz = 0; car.w = 0; }
    }
    // keep inside the drivable band
    const u = this.g.uAt(car.x, car.z), lim = this.g.limit(car.z) - 1.2;
    if (Math.abs(u) > lim) { car.x = this.g.xAt(car.z, Math.sign(u) * lim); car.vx *= -0.3; }
  }

  _fallOnRv(car) {
    const sim = this.sim, rv = sim.rv;
    if (car.y < 1.0 || car.y > 3.8 || car.vy > 0 || car.hitCd > 0) return;
    if (Math.hypot(car.x - rv.x, car.z - rv.z) > 3.2) return;
    car.hitCd = 1.5;
    H.damage(sim, 8, 'falling_car');
    H.crash(sim, car.x, car.z, 0.9);
    car.vy = 3; car.vx += (car.x - rv.x) * 2; car.vz = rv.vz ?? car.vz;
  }

  update(dt) {
    this.t += dt;
    this.tickBodies(dt);
    this.clearBlocks();
    const rv = this.sim.rv, c = this.carrier;
    const gap = (c.z - LEN / 2) - rv.z;
    if (this.phase === 'cruising') {
      if ((gap < 85 && gap > -LEN) || c.s > this.def.z + 250) this.setPhase('dropping', 'CAR CARRIER — INCOMING!', 'bad');
    } else if (this.phase === 'dropping') {
      this.ramp = approach(this.ramp, 1, dt / 1.2);
      if (this.ramp >= 1) {
        this.dropT -= dt;
        if (this.dropT <= 0 && this.next < ORDER.length) { this._drop(ORDER[this.next++]); this.dropT = DROP_EVERY; }
        if (this.next >= ORDER.length) this.setPhase('empty');
      }
    } else if (this.phase === 'empty') {
      c.v = approach(c.v, 0, 1.6 * dt);
      if (c.v <= 0.01) this.setPhase('parked');
    }
    if ((this.phase === 'cruising' || this.phase === 'dropping') && c.s > this.def.z + 450) {
      // never drive on forever: shed what's left at once and pull over
      while (this.next < ORDER.length) this._drop(ORDER[this.next++]);
      this.setPhase('empty');
    }
    this._place(dt);
    c.state = this.phase === 'cruising' ? 0 : this.phase === 'dropping' ? 1 : 2;
    for (const car of this.cars) { this._carPhysics(car, dt); this._fallOnRv(car); }
    // blocks
    this.blockBody(c, LEN / 2 + (c.v > 1 ? 6 : 1), WID / 2, 0.8);
    for (const car of this.cars) if (car.y < 1.5) this.blockBody(car, 2.4, 1.6, 0.6);
    if (this.phase === 'parked' && rv.z > c.z + 200) this.done = true;
  }

  // a cop (or traffic car) ran into a dropped car (GameSim collider contact)
  _copHitsCar(car, info) {
    if (!info || info.by !== 'cop') return;
    const key = info.id * 64 + car.cargo;
    const last = this.copHit.get(key) ?? -9;
    if (this.t - last < 2) return;
    this.copHit.set(key, this.t);
    const v = Math.max(4, info.speed || 0);
    H.copEffect(this.sim, info.id, { push: { x: (this.rng.next() - 0.5) * 6, z: -v * 0.3 }, damage: 12 + v * 1.5 });
    if (car.state === 1) { car.state = 2; car.mode = 'nudged'; }
    car.vx += (this.rng.next() - 0.5) * 3; car.vz += v * 0.25;
  }

  colliders(out) {
    const rv = this.sim.rv, c = this.carrier;
    if (Math.abs(c.z - rv.z) < 40) {
      this.solidBox(out, c, LEN, WID, { damage: 9, speedLoss: 0.3 });
    }
    for (const car of this.cars) {
      if (car.y > 1.2 || Math.abs(car.z - rv.z) > 140) continue;
      this.solidBox(out, car, car.len, car.wid, { damage: 7, speedLoss: 0.15, onOther: (info) => this._copHitsCar(car, info) });
    }
  }

  extraState() {
    return { ramp: Math.round(this.ramp * 100) / 100, cargo: this.cargo, dropped: this.next, lane: Math.round(this.laneU * 100) / 100 };
  }
}
