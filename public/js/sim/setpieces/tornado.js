// ─────────────────────────────────────────────────────────────────────────────
// tornado — Salt flats (route.json z 36300). The user's request: "a tornado with
// flying cars in the desert".
// A funnel forms on the horizon 140 m off one side of the road (3 s, caption
// "TORNADO!") and churns across the salt flats diagonally toward the RV.
// TIMING: its lateral speed adapts to the RV so it CROSSES THE ROAD ~50 m IN FRONT
// OF THE RV (a close call you see coming: you pass 10–20 m behind it, in the pull and
// the falling cars), then keeps going across and dies out on
// the far side. If the RV is already too close when the funnel nears the road, the
// funnel hangs back (2 m/s) and lets it pass; if the RV stops, the funnel still
// crosses (≥ 3 m/s), so nothing waits forever.
//  • Suction within 60 m: pull toward the centre a = 22·(1 − d/60)^1.6 m/s² plus 30 %
//    swirl, applied with sim.pushRv every tick but capped so the suction never adds
//    more than 6–12 m/s of inward speed (6 m/s of swirl). That is about the RV's grip
//    limit at ~16 m: steer away or hit the nitro to get out; the handbrake doesn't.
//    Dust on the windscreen (setFx fog) and shaking (addBump) scale with the pull.
//  • Core (radius 9 m × intensity): 7 hp/s, capped at 35 hp per tornado, speed loss.
//  • Flying cars: 6–9 abandoned cars on the flats and verges along its path (a cluster
//    on both verges where it crosses), plus any traffic car that strays within ~23 m
//    (removed from traffic via applyTrafficEffect, re-created here),
//    get sucked up. They orbit the funnel rising to 25–40 m, then are flung out
//    aimed at the road 30–55 m ahead of the RV, crash down (bounce, slide) and stay
//    as solid wrecks. A car that comes down on the RV hurts (10 hp). At most 10.
//  • Cops within 60 m are dragged toward it; in the core they are stalled and take
//    24 hp/s (wrecked in ~2 s).
// Entities  tornado  ONE tuple: x, z = funnel base · y 0 · yaw = accumulated spin angle
//                    (rotate the funnel/debris by it) · variant 0 · state 0 forming,
//                    1 active, 2 dissipating. Size/fade from state() (radius, height,
//                    intensity).
//           sedan / pickup / hatch / van (variants 0–5) — the cars:
//                    state 1 = on the ground (parked/abandoned or landed wreck: smoke),
//                    state 2 = airborne (orbiting or flung): y up to 40 m. Tumble it
//                    freely (roll/pitch from time and id); yaw is given.
// Colliders cars on the ground (y < 1.2) are solid; nothing for the funnel itself.
// state()   { x, z (funnel base), radius (core m), height (m, 60), spin (rad/s, + = CCW
//             from above), intensity 0..1, side (+1: started on the driver's right),
//             crossed (bool), rvDist (m), pull 0..1 (suction at the RV: camera shake,
//             roar volume, windscreen dust), flying (cars in the air), cars (total) }
// Captions  'forming' "TORNADO!" · beats 'crossing' "IT'S CROSSING THE ROAD!",
//           'core' "INSIDE THE TORNADO!", 'copSucked' "The tornado swallows a cop car!",
//           'carHit' "A car fell on the RV!"
// Unity: TornadoSetPiece (+ a ParticleSystem funnel driven by state()).
// ─────────────────────────────────────────────────────────────────────────────
import { Scripted, H, clamp, approach, TAU, copsNear } from './common.js';

const PULL_R = 60, CORE_R = 9, A_MAX = 22, HEIGHT = 60, FORM = 3;
const START_U = 140, START_DS = 150, DRIFT = 5;      // m, m ahead, m/s toward the RV
const CROSS_AHEAD = 50;                              // cross the road when the RV is this far away
const PICKUP = CORE_R + 14, MAX_CARS = 12, CORE_CAP = 35;
const FLY_KINDS = new Set(['sedan', 'hatch', 'pickup', 'van']);

export class Tornado extends Scripted {
  start() {
    const rng = this.rng, g = this.g, zc = this.def.z;
    this.zc = zc;
    this.side = rng.sign();
    this.spinDir = rng.sign();
    this.s = zc + START_DS; this.u = this.side * START_U;
    this.du = -this.side * 6; this.ds = -DRIFT;
    this.spin = 0; this.spinRate = 2.4 * this.spinDir;
    this.intensity = 0;
    this.crossed = false;
    this.coreDamage = 0;
    this.said = {};
    this.copT = new Map();
    this.funnel = this.body('tornado', 0, g.xAt(this.s, this.u), this.s, 0);
    this.pull = 0; this.rvDist = 999;
    // abandoned cars along the expected path: a straight line from the start to the
    // expected road crossing (≈ zc + 55 for an RV at cruising speed), a few beyond it, and
    // a cluster on both verges near the crossing so it lifts cars right in front of the RV
    const n = rng.int(6, 9);
    const kinds = ['sedan', 'pickup', 'hatch'];
    this.cars = [];
    const cz = zc + 55;
    for (let i = 0; i < n; i++) {
      const k = i < n - 3 ? (i + 0.6) / (n - 3) * 0.85 : 0.95 + (i - (n - 3)) * 0.12;   // 0 = start, 1 = road crossing
      const ps = this.s + (cz - this.s) * k, pu = this.u * (1 - k);
      const s = ps + rng.float(-8, 8);
      let u = pu + rng.float(-8, 8);
      const edge = g.edge(s);
      if (Math.abs(u) < edge + 1.5) u = Math.sign(u || this.side) * (edge + 1.5 + rng.float(0, 3));
      u = clamp(u, -g.limit(s) + 2, g.limit(s) - 2);
      this._addCar(kinds[i % 3], rng.int(0, 5), s, u);
    }
    this.phase = 'idle';
  }

  _addCar(kind, variant, s, u) {
    const rng = this.rng;
    const c = this.body(kind, variant, 0, 0, rng.float(0, TAU), {
      mode: 'parked', yMax: rng.float(25, 40), orbitR: rng.float(10, 14), flingAfter: rng.float(3.5, 7.5),
      aimAhead: rng.float(30, 55), aimSide: rng.float(-6, 6), w: 0, len: 4.6, wid: 2.0,
    });
    this.place(c, s, u);
    c.state = 1;
    this.cars.push(c);
    return c;
  }

  get fx() { return this.g.xAt(this.s, this.u); }
  get fz() { return this.s; }

  update(dt) {
    this.t += dt;
    this.tickBodies(dt);
    this.clearBlocks();
    const sim = this.sim, rv = sim.rv, g = this.g;
    if (this.phase === 'idle') {
      if (rv.z > this.zc + 60) { this.setPhase('missed'); this.done = true; return; }
      this.setPhase('forming', 'TORNADO!', 'bad');
      this.formT = 0;
    }
    if (this.phase === 'forming') {
      this.formT += dt;
      this.intensity = clamp(this.formT / FORM, 0, 1);
      if (this.formT >= FORM) this.setPhase('active');
    } else if (this.phase === 'active') {
      this.intensity = approach(this.intensity, 1, dt);
      this.du = approach(this.du, -this.side * this._lateralSpeed(), 4 * dt);
      if (!this.crossed && this.u * this.side <= 0) {
        this.crossed = true;
        if (Math.abs(this.s - rv.z) < 160) this.beat('crossing', "IT'S CROSSING THE ROAD!", 'bad');
      }
      if (this.t > 75 || this.u * this.side < -120 || rv.z - this.s > 260) this.setPhase('dissipating');
    } else if (this.phase === 'dissipating') {
      this.intensity = approach(this.intensity, 0, dt / 4);
      if (this.intensity <= 0 && this.cars.every((c) => c.mode !== 'orbit' && c.mode !== 'flung')) this.setPhase('gone');
    }
    if (this.phase !== 'gone') {
      this.s += this.ds * dt; this.u += this.du * dt;
      this.spin += this.spinRate * dt * (0.4 + 0.6 * this.intensity);
    }
    const b = this.funnel;
    b.x = this.fx; b.z = this.fz; b.yaw = this.spin;
    b.vx = g.slope(this.s) * this.ds - this.du; b.vz = this.ds;
    b.state = this.phase === 'forming' ? 0 : this.phase === 'active' ? 1 : 2;
    b.hidden = this.phase === 'gone';
    this._pullRv(dt);
    this._pullCops();
    this._pickupTraffic();
    for (const c of this.cars) this._car(c, dt);
    // blocks: wrecks on the road (not the funnel itself: stopping in front of it is the worst idea)
    for (const c of this.cars) if ((c.mode === 'parked' || c.mode === 'wreck') && Math.abs(c.u ?? 99) < g.edge(c.z) + 2) this.blockBody(c, 2.4, 1.4, 0.6);
    if (this.phase === 'gone' && rv.z > this.zc + 150) this.done = true;
  }

  // lateral speed (m/s, toward the far side) that makes the funnel cross ~CROSS_AHEAD m before the RV
  _lateralSpeed() {
    const rv = this.sim.rv;
    if (this.crossed) return 7;
    const uAbs = this.u * this.side;                     // distance to the road centre
    const ahead = this.s - rv.z;                         // funnel z relative to the RV
    if (ahead <= 0) return 7;                            // RV already past: go on across
    const closing = Math.max(0.5, (rv.speed || 0) + DRIFT);
    const T = (ahead - CROSS_AHEAD) / closing;           // time until the RV is CROSS_AHEAD away
    if (T <= 0.3) return uAbs < 12 ? 9 : 2;              // too late: hang back and let it pass
    return clamp(uAbs / T, 3, 12);
  }

  _accel(d) {
    if (d >= PULL_R) return 0;
    return A_MAX * Math.pow(1 - d / PULL_R, 1.6) * this.intensity;
  }

  _pullRv(dt) {
    const sim = this.sim, rv = sim.rv;
    const dx = this.fx - rv.x, dz = this.fz - rv.z;
    const d = Math.hypot(dx, dz) || 0.01;
    this.rvDist = d;
    const a = this._accel(Math.max(d, 2));
    this.pull = clamp(a / A_MAX, 0, 1);
    if (a <= 0 || this.phase === 'gone' || rv.airborne) return;
    const nx = dx / d, nz = dz / d;
    // swirl: counter-clockwise (from above) for spinDir +1
    const tx = -nz * this.spinDir, tz = nx * this.spinDir;
    // suction never builds up more than vCap of inward speed (6..12 m/s) or 6 m/s of swirl,
    // so the RV is dragged and slewed, not hurled — and it can always drive out
    const k = 1 - Math.min(1, d / PULL_R);
    const vCap = 6 + 6 * k;
    const vIn = (rv.vx ?? 0) * nx + (rv.vz ?? 0) * nz, vSw = (rv.vx ?? 0) * tx + (rv.vz ?? 0) * tz;
    const pin = Math.max(0, Math.min(a * dt, vCap - vIn));
    const psw = Math.max(0, Math.min(a * 0.3 * dt, 6 - vSw));
    if (pin > 0 || psw > 0) H.push(sim, nx * pin + tx * psw, nz * pin + tz * psw, 0);
    if (this.pull > 0.12) {
      H.fx(sim, { fog: Math.min(0.75, this.pull * 0.9) }, 0.25);   // dust on the windscreen
      if (typeof sim.addBump === 'function') sim.addBump(Math.min(0.5, this.pull * 0.45));
    }
    const rc = CORE_R * this.intensity;
    if (d < rc) {
      const dmg = Math.min(7 * dt, CORE_CAP - this.coreDamage);
      if (dmg > 0) { this.coreDamage += dmg; H.damage(sim, dmg, 'tornado'); }
      H.push(sim, 0, 0, 0.6 * dt);
      this._once('core', 'INSIDE THE TORNADO!', 'bad');
    }
  }

  _once(key, caption, tone) { if (!this.said[key]) { this.said[key] = true; this.beat(key, caption, tone); } }

  _pullCops() {
    const sim = this.sim;
    if (this.intensity <= 0) return;
    for (const c of copsNear(sim, this.fx, this.fz, PULL_R)) {
      const last = this.copT.get(c.id) ?? -9;
      if (this.t - last < 0.25) continue;
      this.copT.set(c.id, this.t);
      const dx = this.fx - c.x, dz = this.fz - c.z, d = Math.hypot(dx, dz) || 0.01;
      const a = this._accel(d) * 1.3, k = 0.25;
      const eff = { push: { x: (dx / d) * a * k - (dz / d) * this.spinDir * a * 0.4 * k, z: (dz / d) * a * k + (dx / d) * this.spinDir * a * 0.4 * k } };
      if (d < CORE_R * this.intensity + 4) {
        eff.damage = 6; eff.stall = 1;
        this._once('copSucked', 'The tornado swallows a cop car!', 'good');
      }
      H.copEffect(sim, c.id, eff);
    }
  }

  // traffic cars that stray too close are taken over by the set-piece and thrown too
  _pickupTraffic() {
    const sim = this.sim;
    if (this.intensity < 0.6 || this.phase === 'gone' || this.cars.length >= MAX_CARS) return;
    if (typeof sim.trafficList !== 'function' || typeof sim.applyTrafficEffect !== 'function') return;
    for (const t of sim.trafficList()) {
      if (this.cars.length >= MAX_CARS) break;
      if (!FLY_KINDS.has(t.kind)) continue;
      const d = Math.hypot(t.x - this.fx, t.z - this.fz);
      if (d > PICKUP) continue;
      if (!sim.applyTrafficEffect(t.id, { remove: true })) continue;
      const c = this._addCar(t.kind, this.rng.int(0, 5), t.z, this.g.uAt(t.x, t.z));
      c.x = t.x; c.z = t.z; c.yaw = t.yaw;
      this._lift(c);
    }
  }

  _lift(c) {
    c.mode = 'orbit'; c.state = 2; c.orbitT = 0;
    c.ang = Math.atan2(c.x - this.fx, c.z - this.fz); c.rad = Math.hypot(c.x - this.fx, c.z - this.fz);
    c.y = Math.max(c.y, 0.3);
  }

  _car(c, dt) {
    const sim = this.sim, rv = sim.rv, g = this.g;
    const fx = this.fx, fz = this.fz;
    if (c.mode === 'parked' || c.mode === 'wreck') {
      const d = Math.hypot(c.x - fx, c.z - fz);
      if (this.intensity > 0.6 && this.phase !== 'gone' && this.phase !== 'dissipating' && d < PICKUP) this._lift(c);
      return;
    }
    if (c.mode === 'orbit') {
      c.orbitT += dt;
      c.rad = approach(c.rad, c.orbitR, 6 * dt);
      const w = 2.2 * this.spinDir * (0.5 + 0.5 * this.intensity);
      c.ang += w * dt;
      c.y = Math.min(c.yMax, c.y + 6 * dt);
      c.x = fx + Math.sin(c.ang) * c.rad; c.z = fz + Math.cos(c.ang) * c.rad;
      c.yaw += 3 * dt;
      // tangential velocity (for the fling), aimed at the road ahead of the RV
      const tvx = Math.cos(c.ang) * w * c.rad, tvz = -Math.sin(c.ang) * w * c.rad;
      const sY = Math.sin(rv.yaw), cY = Math.cos(rv.yaw);
      const aimX = rv.x + sY * c.aimAhead - cY * c.aimSide, aimZ = rv.z + cY * c.aimAhead + sY * c.aimSide;
      const ax = aimX - c.x, az = aimZ - c.z, al = Math.hypot(ax, az) || 1, tl = Math.hypot(tvx, tvz) || 1;
      const cos = (ax * tvx + az * tvz) / (al * tl);
      const ready = c.orbitT > c.flingAfter && c.y > 15;
      if ((ready && cos > 0.85) || c.orbitT > c.flingAfter + 6 || (this.phase === 'dissipating' && c.orbitT > 1.5)) {
        // speed to land near the aim point from this height (clamped 8..18 m/s)
        const tFall = (3 + Math.sqrt(9 + 2 * 9.81 * c.y)) / 9.81;
        const sp = clamp(al / tFall, 8, 18);
        const dirX = ready && cos > 0.85 ? ax / al : tvx / tl, dirZ = ready && cos > 0.85 ? az / al : tvz / tl;
        c.vx = dirX * sp; c.vz = dirZ * sp;
        c.vy = 3; c.w = this.rng.float(-4, 4);
        c.mode = 'flung';
      }
      return;
    }
    if (c.mode === 'flung') {
      c.vy -= 9.81 * dt;
      c.x += c.vx * dt; c.z += c.vz * dt; c.y += c.vy * dt; c.yaw += c.w * dt;
      // coming down on the RV
      if (c.y < 3.8 && c.y > 0.8 && c.vy < 0 && c.hitCd <= 0 && Math.hypot(c.x - rv.x, c.z - rv.z) < 3.2) {
        c.hitCd = 2;
        H.damage(sim, 10, 'falling_car');
        H.crash(sim, c.x, c.z, 1);
        this._once('carHit', 'A car fell on the RV!', 'bad');
        c.vy = 2.5; c.vx += (c.x - rv.x) * 2; c.vz += (c.z - rv.z) * 2;
      }
      if (c.y <= 0) {
        c.y = 0;
        if (c.vy < -3) { H.crash(sim, c.x, c.z, 0.7); c.vy = -c.vy * 0.25; c.vx *= 0.5; c.vz *= 0.5; }
        else { c.vy = 0; c.mode = 'slide'; }
      }
      const lim = g.limit(c.z) - 1.5, u = g.uAt(c.x, c.z);
      if (Math.abs(u) > lim + 25) c.x = g.xAt(c.z, Math.sign(u) * (lim + 25));
      return;
    }
    if (c.mode === 'slide') {
      const v = Math.hypot(c.vx, c.vz);
      if (v > 0.3) { const nv = Math.max(0, v - 7 * dt); c.vx *= nv / v; c.vz *= nv / v; c.x += c.vx * dt; c.z += c.vz * dt; c.yaw += c.w * dt; c.w *= Math.max(0, 1 - 2 * dt); }
      else { c.vx = c.vz = 0; c.mode = 'wreck'; c.state = 1; c.u = g.uAt(c.x, c.z); }
    }
  }

  colliders(out) {
    const rv = this.sim.rv;
    for (const c of this.cars) {
      if (!(c.mode === 'wreck' || c.mode === 'parked' || c.mode === 'slide') || c.y > 1.2) continue;
      if (Math.abs(c.z - rv.z) > 40 || Math.abs(c.x - rv.x) > 40) continue;
      this.solidBox(out, c, c.len, c.wid, { damage: 7, speedLoss: 0.25 });
    }
  }

  extraState() {
    const r1 = (v) => Math.round(v * 10) / 10;
    return {
      x: r1(this.fx), z: r1(this.fz), radius: r1(CORE_R * Math.max(0.3, this.intensity)), height: HEIGHT,
      spin: r1(this.spinRate), intensity: Math.round(this.intensity * 100) / 100, side: this.side, crossed: this.crossed,
      rvDist: r1(Math.min(999, this.rvDist)), pull: Math.round(this.pull * 100) / 100,
      flying: this.cars.filter((c) => c.mode === 'orbit' || c.mode === 'flung').length, cars: this.cars.length,
    };
  }
}
