// ─────────────────────────────────────────────────────────────────────────────
// rattlers — Salt flats (route.json z 35300). The Rattlers biker gang.
// From def.z − 300, 6–8 choppers roar up from ~80 m behind and ride in slots
// around the RV (both flanks, ahead, behind) for up to ~50 s, weaving. One at a
// time slips in right behind the rear door; if it stays there 3 s it grabs a bag
// (sim.takeProduct(1); without that helper: 3 damage + "pried at the door") and
// rides off with it. At most 2 grabs per encounter.
// Knock them off: sideswipe/ram them (any contact at > 4 m/s), drop oil or smoke
// on them (they crash), or swerve/brake so the grabber loses its spot.
// They bail when the tornado forms ahead (RV ≥ 36050) or after 50 s.
// The set-piece extends its own range (to 36100) because it travels with the RV.
// Entities  chopper  variants 0–3 (Rattlers) · state 0 riding, 1 grabbing (rider reaches for
//                    the RV's rear door), 2 crashed (bike down: slides then lies; rider tumbles),
//                    3 leaving (rides away off-road, despawns far out)
//                    yaw = direction of travel (lean it into its lateral motion)
// Colliders none (bikes are soft; contact handled here, the RV takes no damage).
// state()   { active, grabs, grabber (entity id | null), grabT (0..3 s), crashed }
// Unity: RattlersSetPiece.
// ─────────────────────────────────────────────────────────────────────────────
import { Scripted, H, clamp, approach } from './common.js';

const SLOTS = [[-6, -3.3], [-0.5, -3.5], [5, -3.3], [-6, 3.3], [-0.5, 3.5], [5, 3.3], [12, 0.4], [-14, -0.6]];
const GRAB_SLOT = [-6.2, 0], GRAB_SECONDS = 3, MAX_GRABS = 2, RIDE_SECONDS = 50, BAIL_Z = 36050;

export class Rattlers extends Scripted {
  start() {
    this.extendRange(BAIL_Z + 60);
    this.startZ = this.def.z - 300;
    this.n = this.rng.int(6, 8);
    this.grabs = 0; this.crashed = 0;
    this.grabber = null; this.grabT = 0; this.nextGrab = 6;
    this.rideT = 0;
    this.phase = 'idle';
  }

  _spawn() {
    const rng = this.rng, rv = this.sim.rv, g = this.g;
    const rvU = this.rvU();
    for (let i = 0; i < this.n; i++) {
      const s = rv.z - rng.float(65, 100);
      const u = clamp(rvU + rng.float(-6, 6), -g.edge(s) - 3, g.edge(s) + 3);
      const b = this.body('chopper', rng.int(0, 3), 0, 0, g.heading(s), {
        slot: SLOTS[i % SLOTS.length], v: Math.max(18, (rv.speed || 0) + 9), du: 0, ph: rng.float(0, 6.28), w: 0,
      });
      this.place(b, s, u);
    }
  }

  _rvLocal(b) {
    const rv = this.sim.rv;
    return { along: b.s - rv.z, lat: b.u - this.rvU() };
  }

  update(dt) {
    this.t += dt;
    this.tickBodies(dt);
    this.clearBlocks();
    const sim = this.sim, rv = sim.rv, g = this.g;
    if (this.phase === 'idle') {
      if (rv.z < this.startZ) return;
      if (rv.z > BAIL_Z - 150) { this.setPhase('missed'); this.done = true; return; }
      this._spawn();
      this.setPhase('approach');
    }
    const rvU = this.rvU(), rvV = Math.max(0, rv.speed || 0);
    if (this.phase === 'approach' || this.phase === 'riding') {
      if (this.phase === 'approach' && this.bodies.some((b) => Math.abs(this._rvLocal(b).along) < 25)) {
        this.setPhase('riding', "THE RATTLERS! Don't let them grab the bags!", 'bad');
      }
      if (this.phase === 'riding') this.rideT += dt;
      const riding = this.bodies.filter((b) => b.state <= 1);
      if (riding.length === 0 || this.rideT > RIDE_SECONDS || rv.z > BAIL_Z) {
        this.setPhase('leaving', rv.z > BAIL_Z && riding.length ? 'The Rattlers bail — they want no part of that twister!' : (riding.length ? 'The Rattlers peel off.' : null), 'good');
        for (const b of riding) this._leave(b);
      }
      // pick a grabber
      if (this.phase === 'riding' && !this.grabber && this.grabs < MAX_GRABS) {
        this.nextGrab -= dt;
        if (this.nextGrab <= 0 && riding.length) {
          let best = null;
          for (const b of riding) { const l = this._rvLocal(b); const d = Math.hypot(l.along - GRAB_SLOT[0], l.lat); if (!best || d < best.d) best = { b, d }; }
          this.grabber = best.b; this.grabT = 0;
        }
      }
    }
    const zones = H.gadgetZones(sim);
    for (const b of this.bodies) {
      if (!b.alive) continue;
      if (b.state === 0 || b.state === 1) this._ride(b, dt, rvU, rvV, zones);
      else if (b.state === 2) this._slide(b, dt);
      else if (b.state === 3) this._away(b, dt);
    }
    if (this.phase === 'leaving' && this.bodies.every((b) => !b.alive || b.state === 2)) {
      this.setPhase('over');
    }
    if (this.phase === 'over' && this.bodies.every((b) => !b.alive || rv.z - b.z > 200)) this.done = true;
  }

  _ride(b, dt, rvU, rvV, zones) {
    const sim = this.sim, rv = sim.rv, g = this.g;
    const isGrabber = this.grabber === b;
    const [sa, sl] = isGrabber ? GRAB_SLOT : b.slot;
    const weave = isGrabber ? 0.15 : 0.45;
    const tS = rv.z + sa, tU = rvU + sl + weave * Math.sin(this.t * 1.3 + b.ph);
    const vT = clamp(rvV + (tS - b.s) * 1.3, 0, 42);
    b.v = approach(b.v, vT, 14 * dt);
    const duT = clamp((tU - b.u) * 2.2, -6, 6);
    b.du = approach(b.du, duT, 18 * dt);
    b.s += b.v * dt; b.u += b.du * dt;
    // keep out of the RV body
    const l = this._rvLocal(b);
    if (Math.abs(l.along) < 4.8 && Math.abs(l.lat) < 2.1) b.u = rvU + (l.lat >= 0 ? 2.1 : -2.1);
    b.u = clamp(b.u, -g.limit(b.s) + 1, g.limit(b.s) - 1);
    b.x = g.xAt(b.s, b.u); b.z = b.s;
    b.yaw = g.yawFor(b.s, Math.max(1, b.v), b.du);
    b.vx = g.slope(b.s) * b.v - b.du; b.vz = b.v;
    // grabbing
    if (isGrabber) {
      const inZone = l.along > -8.5 && l.along < -4.2 && Math.abs(l.lat) < 1.7 && rvV > 3;
      b.state = inZone ? 1 : 0;
      this.grabT = inZone ? this.grabT + dt : Math.max(0, this.grabT - dt * 1.5);
      if (this.grabT >= GRAB_SECONDS) this._grab(b);
    } else b.state = 0;
    // knocked off: contact with the RV, oil, smoke
    const near = Math.abs(l.along) < 5.2 && Math.abs(l.lat) < 2.25;
    if (near && rvV > 4 && b.hitCd <= 0) { this._crash(b, 'rammed'); return; }
    for (const z of zones) {
      if (Math.hypot(b.x - z.x, b.z - z.z) < z.r) { this._crash(b, z.kind); return; }
    }
  }

  _grab(b) {
    const sim = this.sim;
    this.grabs++;
    const got = H.takeProduct(sim, 1);
    if (got == null) { H.damage(sim, 3, 'rattlers'); this.beat('grab', 'A Rattler pried at the back door!', 'bad'); }
    else if (got > 0) this.beat('grab', 'A Rattler grabbed a bag!', 'bad');
    else this.beat('grab', 'A Rattler found nothing to grab!', 'info');
    this.grabber = null; this.grabT = 0; this.nextGrab = 9;
    this._leave(b);
  }

  _crash(b, why) {
    const sim = this.sim;
    if (this.grabber === b) { this.grabber = null; this.grabT = 0; this.nextGrab = 5; }
    b.state = 2; this.crashed++;
    b.w = this.rng.sign() * this.rng.float(3, 6);
    b.du += (b.u >= this.rvU() ? 1 : -1) * 4;
    H.points(sim, 100, 'biker');
    H.crash(sim, b.x, b.z, 0.35);
    if (this.crashed === 1) this.beat('crash', why === 'rammed' ? 'Biker down!' : why === 'oil' ? 'Biker down — slicked!' : 'Biker down — lost in the smoke!', 'good');
  }

  _slide(b, dt) {
    const g = this.g;
    b.v = approach(b.v, 0, 9 * dt);
    b.du = approach(b.du, 0, 6 * dt);
    b.w = approach(b.w, 0, 3 * dt);
    b.s += b.v * dt; b.u += b.du * dt; b.yaw += b.w * dt;
    b.x = g.xAt(b.s, b.u); b.z = b.s;
    b.vx = g.slope(b.s) * b.v - b.du; b.vz = b.v;
  }

  _leave(b) { b.state = 3; b.leaveDir = b.u >= this.rvU() ? 1 : -1; if (this.grabber === b) this.grabber = null; }

  _away(b, dt) {
    const g = this.g;
    b.v = approach(b.v, 30, 6 * dt);
    b.du = approach(b.du, b.leaveDir * 9, 8 * dt);
    b.s += b.v * dt; b.u += b.du * dt;
    b.x = g.xAt(b.s, b.u); b.z = b.s;
    b.yaw = g.yawFor(b.s, b.v, b.du);
    b.vx = g.slope(b.s) * b.v - b.du; b.vz = b.v;
    if (Math.abs(b.u) > g.limit(b.s) + 30) b.alive = false;
  }

  extraState() {
    return {
      active: this.bodies.filter((b) => b.alive && b.state <= 1).length, grabs: this.grabs,
      grabber: this.grabber ? this.grabber.id : null, grabT: Math.round(this.grabT * 10) / 10, crashed: this.crashed,
    };
  }
}
