// ─────────────────────────────────────────────────────────────────────────────
// handover — the Abandoned Drive-In sell point (route.json z 39800). Cosmetic.
// Kestrel's long white car is parked at the back of the drive-in lot, Kestrel
// beside it, two of his men (generic peds) by the boot. Phases for the end
// cutscene:
//   waiting  → arriving (RV within 150 m: they turn to face it)
//            → checking (RV parked inside the sell radius at < 3.5 m/s, or the sim
//              phase is 'won'): the men walk to the RV's side door (driver's right,
//              1 m behind the middle), Kestrel steps forward 2 m
//            → done (men at the door for 3 s: bags checked).
// The walkers' targets are in state() so the renderer can finish the walk even if
// the sim stops updating set-pieces after the win.
// Entities  kestrel_car  variant 0 white · state 0 parked
//           kestrel      state 0 idle (cane), 1 walking, 2 talking (gesture)
//           ped ×2       variants from the seed · state 0 (walk cycle only while moving;
//                        idle when the position doesn't change)
// Colliders the car (solid).
// state()   { door:{x,z}, walkers:[{id,x,z,tx,tz}], car:{x,z,yaw}, checkT }
// Unity: HandoverSetPiece (drives the end cutscene).
// ─────────────────────────────────────────────────────────────────────────────
import { Scripted, approach } from './common.js';

const WALK = 1.4;

export class Handover extends Scripted {
  start() {
    const rng = this.rng, g = this.g, sim = this.sim;
    const sp = sim.track.sellPointPos ? sim.track.sellPointPos() : { x: g.xAt(this.def.z, 15), z: this.def.z, u: 15 };
    const side = sim.data.route.sellPoint?.side ?? 1;
    this.side = side;
    this.sp = sp;
    const h = g.heading(sp.z);
    const faceRoad = h + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    this.car = this.body('kestrel_car', 0, 0, 0, faceRoad - side * 0.35, { len: 5.8, wid: 2.0 });
    this.place(this.car, sp.z + 7, sp.u + side * 8);
    this.kestrel = this.body('kestrel', 0, 0, 0, faceRoad);
    this.place(this.kestrel, sp.z + 3.5, sp.u + side * 6.2);
    this.men = [];
    for (const dz of [10.8, 8.9]) {
      const m = this.body('ped', rng.int(0, 7), 0, 0, faceRoad, { tx: 0, tz: 0 });
      this.place(m, sp.z + dz, sp.u + side * 8.6);
      m.tx = m.x; m.tz = m.z;
      this.men.push(m);
    }
    this.kestrel.tx = this.kestrel.x; this.kestrel.tz = this.kestrel.z;
    this.door = null;
    this.checkT = 0;
    this.phase = 'waiting';
  }

  _walk(b, dt, faceYaw) {
    const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
    if (d > 0.05) {
      const k = Math.min(1, (WALK * dt) / d);
      b.x += dx * k; b.z += dz * k;
      b.yaw = Math.atan2(dx, dz);
      return false;
    }
    if (faceYaw != null) b.yaw = approach(b.yaw, faceYaw, 3 * dt);
    return true;
  }

  update(dt) {
    this.t += dt;
    this.tickBodies(dt);
    const sim = this.sim, rv = sim.rv, sp = this.sp;
    const dist = Math.hypot(rv.x - sp.x, rv.z - sp.z);
    const radius = sim.data.route.sellPoint?.radius ?? 18;
    if (this.phase === 'waiting' && dist < 150) this.setPhase('arriving');
    if ((this.phase === 'arriving' || this.phase === 'waiting') && ((dist < radius && Math.abs(rv.speed || 0) < 3.5) || sim.phase === 'won')) {
      this.setPhase('checking', null);
      const s = Math.sin(rv.yaw), c = Math.cos(rv.yaw);
      const rx = -c, rz = s;                       // RV right
      this.door = { x: rv.x + rx * 2.0 - s * 1.0, z: rv.z + rz * 2.0 - c * 1.0 };
      this.men[0].tx = this.door.x + rx * 0.9 + s * 0.6; this.men[0].tz = this.door.z + rz * 0.9 + c * 0.6;
      this.men[1].tx = this.door.x + rx * 1.1 - s * 0.9; this.men[1].tz = this.door.z + rz * 1.1 - c * 0.9;
      const kx = this.kestrel.x, kz = this.kestrel.z, dx = this.door.x - kx, dz = this.door.z - kz, d = Math.hypot(dx, dz) || 1;
      this.kestrel.tx = kx + (dx / d) * Math.min(2, d * 0.4); this.kestrel.tz = kz + (dz / d) * Math.min(2, d * 0.4);
    }
    if (this.phase === 'arriving') {
      // turn to watch the RV come in
      for (const b of [this.kestrel, ...this.men]) b.yaw = approach(b.yaw, Math.atan2(rv.x - b.x, rv.z - b.z), 1.5 * dt);
    }
    if (this.phase === 'checking' || this.phase === 'done') {
      const toRv = (b) => Math.atan2(rv.x - b.x, rv.z - b.z);
      const kDone = this._walk(this.kestrel, dt, toRv(this.kestrel));
      this.kestrel.state = kDone ? 2 : 1;
      let arrived = true;
      for (const m of this.men) { if (!this._walk(m, dt, toRv(m))) arrived = false; }
      if (arrived) this.checkT += dt;
      if (this.phase === 'checking' && this.checkT >= 3) this.setPhase('done');
    }
  }

  colliders(out) {
    const c = this.car;
    if (Math.abs(c.z - this.sim.rv.z) > 30) return;
    this.solidBox(out, c, c.len, c.wid, { damage: 4, speedLoss: 0.3 });
  }

  extraState() {
    const r = (v) => Math.round(v * 100) / 100;
    return {
      door: this.door ? { x: r(this.door.x), z: r(this.door.z) } : null,
      walkers: [this.kestrel, ...this.men].map((b) => ({ id: b.id, x: r(b.x), z: r(b.z), tx: r(b.tx), tz: r(b.tz) })),
      car: { x: r(this.car.x), z: r(this.car.z), yaw: r(this.car.yaw) }, checkT: r(this.checkT),
    };
  }
}
