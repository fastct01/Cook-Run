// ─────────────────────────────────────────────────────────────────────────────
// TrafficSystem: civilian cars (forward + oncoming) and the hostile desert rival.
//  • Spawn: a "frontier" sweeps ahead of the RV; every 10 m of new road rolls
//    biome.trafficPer100m (deterministic given the same inputs).
//  • Drive: lane following (gentle lane-centering via pure pursuit), slow down
//    behind whatever is ahead in the lane, swerve around stopped things,
//    stop for train gates / the roadwork flagger / the broken bridge.
//  • Despawn far behind / far ahead.
//  • Rival (desert): matches the RV's speed, pulls alongside and side-swipes it;
//    shaken off by oil/smoke, or by wrecking it.
// Expansion: kinds come from biome.traffic (sizes in rules.traffic); wide vehicles
// (combine) hug the kerb; `rails` vehicles (streetcar, biome.streetcarPer100m) stay in
// lane rank 0 on the tram tracks — no swerving, lane changes or overtaking — and stop
// at the end of the tram road; multi-lane roads change lanes around slow/stopped things;
// lanes merge into the toll-plaza booths; set-piece laneBlocked() and raised / missing
// road surface (drawbridge) ahead are treated as stop lines.
// Plugin hooks: spawnAt(kind, x, z, yaw, speed), applyEffect(id, {push, crash, launch, remove}).
// state: 0 driving, 1 crashed/stopped, 2 spun out.
// Unity port: TrafficManager + AiCar (MonoBehaviour) using AiCarMotor.
// ─────────────────────────────────────────────────────────────────────────────
import { KIND_ID } from '../shared/protocol.js';
import { clamp, wrapAngle } from './util.js';
import { initBodyShape } from './collisions.js';
import { Rng, hashSeed } from './rng.js';
import { aiDrive, coastBody, aiVertical } from './vehicle.js';
import { tollLaneU } from './structures.js';

export class TrafficSystem {
  constructor(sim) {
    this.sim = sim;
    this.cars = [];
    this.rng = sim.rngTraffic;
    this.frontier = sim.route.start.z + 40;
    this.rivalIdx = 0;
    this._lead = { d: 0, v: 0, u: 0, w: 0, stationary: false, obj: null };
  }

  reset(z) {
    // after a respawn: drop cars near the checkpoint, restart the spawn frontier
    this.cars = this.cars.filter((c) => Math.abs(c.z - z) > 160 && !c.hostile);
    this.frontier = Math.max(z + 60, Math.min(this.frontier, z + 120));
  }

  // Lateral target for a car in lane (dir, rank) at z, honouring roadwork closures,
  // toll-plaza booths and wide loads (they hug the kerb).
  laneTargetU(z, dir, rank, car = null) {
    const sim = this.sim, road = sim.road;
    let u = road.laneU(z, dir, rank);
    if (car && car.rails) return u;
    if (car && car.wid > road.lw(z) - 0.4) u += dir * Math.min(1.4, (car.wid - road.lw(z)) / 2 + 0.5);
    const tu = sim.structures ? tollLaneU(sim.structures.layout, z, dir, rank, u) : null;
    if (tu != null) return tu;
    for (const rw of sim.roadworks) {
      const a = dir > 0 ? rw.from - 45 : rw.from - 8, b = dir > 0 ? rw.to + 8 : rw.to + 45;
      if (z < a || z > b) continue;
      if (u >= rw.u0 - 0.2 && u <= rw.u1 + 0.2) {
        // pick nearest open lane centre, same direction preferred
        const n = road.lanesPerDir(z);
        let best = null, bestScore = 1e9;
        for (const d of [1, -1]) for (let r = 0; r < n; r++) {
          const lu = road.laneU(z, d, r);
          if (lu >= rw.u0 - 0.2 && lu <= rw.u1 + 0.2) continue;
          const score = Math.abs(lu - u) + (d === dir ? 0 : 50);
          if (score < bestScore) { bestScore = score; best = lu; }
        }
        if (best != null) u = best;
      }
    }
    return u;
  }

  // Stop-line speed limit for ordinary traffic: train gates, roadwork flagger, bridge out.
  stopLimit(car, vT) {
    const sim = this.sim, road = sim.road, dir = car.dir;
    const front = car.z + dir * car.len / 2;
    // train crossing
    const tr = sim.events.trainInfo();
    if (tr && (tr.state === 'warn' || tr.state === 'pass')) {
      const stopZ = tr.z - dir * 9;
      const d = (stopZ - front) * dir;
      if (d > -1 && d < 60) vT = Math.min(vT, Math.max(0, d * 0.7));
    }
    // roadwork: when the closure takes the only lane of the other direction, this direction holds
    for (const rw of sim.roadworks) {
      if (road.lanesPerDir((rw.from + rw.to) / 2) > 1) continue;
      if (rw.closedSide === dir) continue; // we are the diverted direction
      const stopZ = dir > 0 ? rw.from - 12 : rw.to + 12;
      const d = (stopZ - front) * dir;
      if (d > -1 && d < 70) vT = Math.min(vT, Math.max(0, d * 0.7));
    }
    // broken bridge: forward cars stop before the ramp
    const br = sim.route.bridge;
    if (br && dir > 0) {
      const d = br.rampStart - 55 - front;
      if (d < 120) vT = Math.min(vT, Math.max(0, d * 0.5));
    }
    // toll plaza: slow through the booths
    for (const t of sim.structures.layout.tolls) {
      const d = (t.z - front) * dir;
      if (d > -12 && d < 90) vT = Math.min(vT, 8 + Math.max(0, d - 10) * 0.12);
    }
    // raised / missing road ahead outside the canyon (drawbridge): stop short of it
    const canyonA = br ? br.rampStart - 60 : Infinity, canyonB = br ? br.landingEnd + 20 : -Infinity;
    for (const d of [6, 14, 24, 36]) {
      const zz = front + dir * d;
      if (zz > canyonA && zz < canyonB) break;
      const y = road.surfaceY(zz);
      if (y == null || Math.abs(y) > 0.35) { vT = Math.min(vT, Math.max(0, (d - 5) * 0.6)); break; }
    }
    // tram tracks end: streetcars stop at the terminus
    if (car.rails) {
      const end = this._tramEnd(car.z, dir);
      if (end != null) { const d = (end - front) * dir - 8; if (d < 60) vT = Math.min(vT, Math.max(0, d * 0.5)); }
    }
    return vT;
  }

  _tramEnd(z, dir) {
    const b = this.sim.road.biome(z);
    if (!(b.road && b.road.tramTracks)) return null;
    return dir > 0 ? b.to : b.from;
  }

  // set-piece lane blocking ahead (cached per car, refreshed ~7 Hz): distance or Infinity
  _blockAhead(car, laneU) {
    const sim = this.sim;
    if (car.blkT > 0 && Math.abs((car.blkU ?? 1e9) - laneU) < 0.5) return car.blkD;
    car.blkT = 0.15; car.blkU = laneU;
    let d = Infinity;
    const dir = car.dir, front = car.len / 2;
    for (const k of [3, 9, 17, 27, 40]) {
      const zz = car.z + dir * (front + k);
      if (sim.laneBlocked(zz, laneU)) { d = k; break; }
    }
    car.blkD = d;
    return d;
  }

  spawnCar(kind, z, dir, rank, speed, opts = {}) {
    const sim = this.sim, road = sim.road, T = sim.rules.traffic[kind];
    if (!T) return null;
    const proto = { wid: T.width, rails: !!T.rails };
    const u = opts.u ?? this.laneTargetU(z, dir, rank, proto);
    const yaw = opts.yaw ?? road.heading(z) + (dir < 0 ? Math.PI : 0);
    const car = {
      cat: 'car', id: sim.newId(), kind, kid: KIND_ID[kind], variant: opts.variant ?? this.rng.int(0, 5),
      x: road.xAt(z, u), y: 0, z, yaw, vx: Math.sin(yaw) * speed, vz: Math.cos(yaw) * speed, vy: 0, w: 0,
      speed, desired: speed, state: 0, dir, rank, timer: 0, airborne: false, groundVy: 0,
      hostile: !!T.hostile, crashedByRv: false, oilCd: 0, swerveU: null, stuckT: 0,
      hp: opts.hp ?? 100, rails: !!T.rails, slowKind: !!T.slow, blkT: 0, blkD: Infinity, laneCd: 0,
    };
    if (opts.x != null) car.x = opts.x;
    initBodyShape(car, T.length, T.width, T.mass ?? 1, T.mass > 4 ? 0.5 : 1);
    const sy = road.surfaceY(z); car.y = sy == null ? 0 : sy;
    this.cars.push(car);
    return car;
  }

  _canSpawnAt(z, u, len = 5) {
    const sim = this.sim, br = sim.route.bridge;
    if (br && z > br.straightFrom - 100) return false;
    if (z > sim.route.sellPoint.z - 80) return false;
    for (const c of this.cars) if (Math.abs(c.z - z) < 10 + (c.len + len) / 2 && Math.abs(sim.road.uAt(c.x, c.z) - u) < 2.5) return false;
    for (const s of sim.route.stops) if (Math.abs(z - s.z) < s.lotLength / 2 + 6) return false;
    for (const [a, b, kind] of sim.structures.layout.zones) if (z > a + 10 && z < b - 10 && kind !== 'overpass' && kind !== 'rail_crossing') return false;
    const y = sim.road.surfaceY(z);
    if (y == null || Math.abs(y) > 0.2) return false;
    if (sim.laneBlocked(z, u)) return false;
    return true;
  }

  _spawnSweep() {
    const sim = this.sim, rv = sim.rv, C = sim.cfg.traffic, road = sim.road, rng = this.rng;
    const target = rv.z + C.spawnAhead[1];
    let guard = 0;
    while (this.frontier < target && guard++ < 80) {
      const z0 = this.frontier; this.frontier += 10;
      if (z0 < rv.z + C.spawnAhead[0] - 200 && sim.t > 0.5) continue; // stale segment (e.g. after a big teleport)
      const biome = road.biome(z0);
      const kinds = (biome.traffic || []).filter((k) => k !== 'rival');
      const p = (biome.trafficPer100m || 0) * 0.1;
      const roll = rng.float(), zz = z0 + rng.float(0, 10), dirRoll = rng.float(), rankRoll = rng.float();
      const kRoll = rng.float(), sRoll = rng.float();
      if (!kinds.length || roll >= p || this.cars.length >= C.maxCars) continue;
      const dir = dirRoll < C.oncomingShare ? -1 : 1;
      const n = road.lanesPerDir(zz);
      const rank = Math.min(n - 1, Math.floor(rankRoll * n));
      const u = this.laneTargetU(zz, dir, rank);
      if (!this._canSpawnAt(zz, u)) continue;
      if (Math.abs(zz - rv.z) < 60) continue;
      const kind = kinds[Math.floor(kRoll * kinds.length)];
      const T = sim.rules.traffic[kind];
      if (!T) continue;
      if (T.length > 12 && !this._canSpawnAt(zz, u, T.length)) continue;
      const spd = T.speed[0] + (T.speed[1] - T.speed[0]) * sRoll;
      this.spawnCar(kind, zz, dir, rank, spd);
    }
  }

  // Streetcars (biome.streetcarPer100m on tram-track roads): own frontier + rng stream.
  _tramSweep() {
    const sim = this.sim, rv = sim.rv, C = sim.cfg.traffic, road = sim.road;
    if (!this.rngTram) { this.rngTram = new Rng(hashSeed(sim.seed, 909)); this.tramFrontier = this.frontier; }
    const rng = this.rngTram;
    const target = rv.z + C.spawnAhead[1];
    let guard = 0;
    while (this.tramFrontier < target && guard++ < 80) {
      const z0 = this.tramFrontier; this.tramFrontier += 10;
      const b = road.biome(z0);
      const p = (b.streetcarPer100m || 0) * 0.1;
      const roll = rng.float(), dirRoll = rng.float(), zz = z0 + rng.float(0, 10);
      if (!(p > 0) || roll >= p || !(b.road && b.road.tramTracks)) continue;
      if (z0 < rv.z + C.spawnAhead[0] - 200 && sim.t > 0.5) continue;
      if (this.cars.length >= C.maxCars + 2) continue;
      const dir = dirRoll < 0.5 ? -1 : 1;
      const end = dir > 0 ? b.to : b.from;
      if ((end - zz) * dir < 160 || Math.abs(zz - rv.z) < 70) continue;
      const u = road.laneU(zz, dir, 0);
      if (!this._canSpawnAt(zz, u, 14)) continue;
      const T = sim.rules.traffic.streetcar;
      if (!T) continue;
      this.spawnCar('streetcar', zz, dir, 0, T.speed[0] + (T.speed[1] - T.speed[0]) * rng.float(), { variant: rng.int(0, 1) });
    }
  }

  // Plugin helper: a car at an arbitrary pose; it then drives in the nearest lane of its heading.
  spawnAt(kind, x, z, yaw, speed = 0) {
    const sim = this.sim, road = sim.road;
    if (!sim.rules.traffic[kind]) return null;
    const dir = Math.cos(yaw - road.heading(z)) >= 0 ? 1 : -1;
    const { rank } = road.nearestLane(z, Math.abs(road.uAt(x, z)));
    const car = this.spawnCar(kind, z, dir, rank, +speed || 0, { x, yaw, variant: 0 });
    if (car) { car.x = x; car.z = z; car.yaw = yaw; initBodyShape(car, car.len, car.wid, car.mass, car.angular); car.fromPlugin = true; }
    return car;
  }

  applyEffect(id, eff = {}) {
    const car = this.cars.find((c) => c.id === id);
    if (!car) return false;
    if (eff.remove) { car.dead = true; return true; }
    if (eff.push) { car.vx += +eff.push.x || 0; car.vz += +eff.push.z || 0; }
    if (eff.launch > 0) { car.airborne = true; car.launched = true; car.vy = +eff.launch; car.y = Math.max(car.y, 0.3); car.w += this.rng.sign() * 2.5; }
    if (eff.crash || eff.launch > 0) this.crash(car, false, eff.launch > 0 ? 20 : 10);
    return true;
  }

  // ── rival ────────────────────────────────────────────────────────────────
  _rivalSpawn() {
    const sim = this.sim, R = sim.cfg.rival, rv = sim.rv;
    const at = R.spawnAt || [];
    if (this.rivalIdx >= at.length || rv.z < at[this.rivalIdx]) return;
    this.rivalIdx++;
    if (!sim.rules.traffic.rival || sim.phase !== 'drive') return;
    if (this.cars.some((c) => c.hostile && c.state === 0)) return;
    const z = rv.z - R.spawnBehind;
    const car = this.spawnCar('rival', z, 1, 0, Math.max(10, rv.speed + 4), { variant: 0, hp: R.hp });
    car.ramCd = 1.5; car.ramT = 0; car.side = this.rng.sign(); car.giveUp = false;
    sim.emit({ type: 'msg', text: 'A rival crew is on your tail!', tone: 'bad' });
  }

  _rivalAi(car, dt) {
    const sim = this.sim, rv = sim.rv, R = sim.cfg.rival, T = sim.rules.traffic.rival, road = sim.road;
    const P = this._P(car);
    car.ramCd -= dt;
    car.chaseT = (car.chaseT || 0) + dt;
    if (car.z > (sim.route.bridge?.straightFrom ?? 1e9) - 150 || !(R.biomes || ['saltflats']).includes(sim.road.biome(car.z).id)) car.giveUp = true;
    if (!car.giveUp && ((car.rams || 0) >= (R.maxRams ?? 4) || car.chaseT > (R.maxChaseSeconds ?? 45))) {
      car.giveUp = true;
      sim.emit({ type: 'msg', text: 'The rival crew backs off.', tone: 'info' });
    }
    if (car.giveUp) {
      // ahead of the RV: speed off down the road; otherwise drop back and pull off onto the dirt
      const ahead = car.z > rv.z + 4;
      const tz = car.z + 25;
      const u = ahead ? road.laneU(tz, 1, 0) : road.hw(tz) + road.sh(tz) + Math.min(6, road.sideRoom(tz) - 1.5);
      const v = ahead ? R.topSpeed : Math.max(0, Math.min(car.speed, Math.abs(rv.speed) - 5));
      aiDrive(car, road.xAt(tz, u), tz, v, P, dt);
      return;
    }
    const s = Math.sin(rv.yaw), c = Math.cos(rv.yaw);
    const rx = -c, rz = s; // RV right vector
    const top = R.topSpeed;
    let tx, tz, v;
    if (car.ramT > 0) {
      car.ramT -= dt;
      tx = rv.x + s * 2; tz = rv.z + c * 2; v = top;
    } else {
      const slotX = rv.x + rx * car.side * R.sideOffset, slotZ = rv.z + rz * car.side * R.sideOffset;
      const dx = slotX - car.x, dz = slotZ - car.z;
      const along = dx * s + dz * c, lat = -dx * c + dz * s;
      tx = slotX + s * 8; tz = slotZ + c * 8;
      v = clamp(Math.abs(rv.speed) + clamp(along * 1.2, -8, 10), 0, top);
      if (Math.abs(along) < 2.2 && Math.abs(lat) < 1.6 && car.ramCd <= 0 && Math.abs(rv.speed) > 5) {
        car.ramT = R.ramSeconds; car.ramCd = R.ramCooldown; car.ramHit = false;
      }
      // keep the slot side on the road
      const slotU = road.uAt(slotX, slotZ);
      if (Math.abs(slotU) > road.hw(slotZ) + road.sh(slotZ) + 6) car.side = -car.side;
    }
    aiDrive(car, tx, tz, v, P, dt);
    if (Math.abs(car.z - rv.z) > 220) car.giveUp = true;
  }

  // Called by collisions when the rival touches the RV.
  rivalContact(car) {
    const sim = this.sim, T = sim.rules.traffic.rival;
    if (car.ramT > 0 && !car.ramHit) {
      car.ramHit = true; car.ramT = 0; car.rams = (car.rams || 0) + 1;
      sim.damageRv(T.ramDamage ?? 7, 'ram');
      sim.addBump(0.7);
      sim.emit({ type: 'crash', x: car.x, z: car.z, power: 0.5 });
    }
  }

  // Shaken off by a gadget.
  rivalShaken(car) {
    const sim = this.sim;
    if (!car.giveUp && sim.cfg.rival.giveUpAfterGadget) {
      car.giveUp = true;
      sim.emit({ type: 'msg', text: 'You shook off the rival!', tone: 'good' });
    }
  }

  _P(car) {
    const g = this.sim.g;
    return { accel: 6, brake: 14, grip: 0.85 * g * 1.2, maxYawRate: car.hostile ? 1.6 : 1.1 };
  }

  // Find what is ahead of `car` in its lane band.
  _leader(car, laneU) {
    const sim = this.sim, road = sim.road, dir = car.dir, C = sim.cfg.traffic;
    const L = this._lead; L.obj = null; L.d = 1e9; L.v = 0; L.u = 0; L.w = 0; L.stationary = false;
    const myHalf = car.wid / 2;
    const test = (o, oz, ou, owid, olen, vAlong, stationary) => {
      const d = (oz - car.z) * dir - (car.len + olen) / 2;
      if (d < -1.5 || d > C.lookAhead || d >= L.d) return;
      if (Math.abs(ou - laneU) > owid / 2 + myHalf + 0.25) return;
      L.obj = o; L.d = d; L.v = vAlong; L.u = ou; L.w = owid; L.stationary = stationary;
    };
    for (const o of this.cars) {
      if (o === car) continue;
      const va = (o.vz * dir);
      test(o, o.z, road.uAt(o.x, o.z), o.wid, o.len, va, o.state !== 0 || Math.abs(va) < 1);
    }
    for (const o of sim.cops.cops) {
      if (o.airborne) continue;
      const va = (o.vz * dir);
      test(o, o.z, road.uAt(o.x, o.z), o.wid, o.len, va, Math.abs(va) < 1);
    }
    const rv = sim.rv;
    if (!rv.airborne) { const va = rv.vz * dir; test(rv, rv.z, road.uAt(rv.x, rv.z), rv.wid, rv.len, va, Math.abs(va) < 1); }
    for (const o of sim.obstacles.solidNear(car.z, dir, C.lookAhead)) test(o, o.z, o.u, o.r * 2 + (o.halfLen || 0) * 2, o.r * 2, 0, true);
    for (const p of sim.peds.peds) {
      if (p.state > 1) continue;
      const pu = road.uAt(p.x, p.z);
      if (Math.abs(pu) > road.hw(p.z) + 0.6) continue;
      test(p, p.z, pu, 1.2, 1.0, 0, false);
    }
    return L;
  }

  update(dt) {
    const sim = this.sim, rv = sim.rv, C = sim.cfg.traffic, road = sim.road;
    if (sim.phase !== 'countdown' || sim.t > 0) { this._spawnSweep(); this._tramSweep(); }
    this._rivalSpawn();
    for (const car of this.cars) {
      if (car.oilCd > 0) car.oilCd -= dt;
      if (car.blkT > 0) car.blkT -= dt;
      if (car.laneCd > 0) car.laneCd -= dt;
      if (car.launched && car.airborne) {
        car.x += car.vx * dt; car.z += car.vz * dt; car.yaw += car.w * dt;
      } else if (car.rails && car.state !== 0) {
        // a streetcar can't be knocked off its rails: it brakes, then carries on
        coastBody(car, 9, 6, dt);
        car.timer += dt;
        if (car.timer > 2.5) { car.state = 0; car.timer = 0; }
      } else if (car.state === 1) {
        coastBody(car, C.crashFriction, 1.8, dt);
        // light crashes: the driver shakes it off and carries on if the car still points the right way
        car.timer += dt;
        if (!car.hostile && car.timer > (C.recoverSeconds ?? 6) && Math.abs(car.speed) < 1) {
          const want = road.heading(car.z) + (car.dir < 0 ? Math.PI : 0);
          if (Math.abs(wrapAngle(car.yaw - want)) < 0.9 && !car.wrecked) { car.state = 0; car.desired *= 0.8; car.swerveU = null; }
          else car.wrecked = true;
        }
        // a wreck left on the carriageway gets pushed onto the verge (pile-ups clear up)
        if (car.wrecked && car.timer > (C.wreckClearSeconds ?? 9) && !car.airborne) {
          // lateral half-extent of the (possibly sideways) wreck
          const phi = car.yaw - road.heading(car.z);
          const lat = Math.abs(Math.sin(phi)) * car.len / 2 + Math.abs(Math.cos(phi)) * car.wid / 2;
          const u = road.uAt(car.x, car.z), lim = road.hw(car.z) + lat + 0.4;
          if (Math.abs(u) < lim) {
            const side = u >= 0 ? 1 : -1, h = road.heading(car.z), sp = 1.6 * dt;
            car.x += -Math.cos(h) * side * sp; car.z += Math.sin(h) * side * sp;
            initBodyShape(car, car.len, car.wid, car.mass, car.angular);
          }
        }
      }
      else if (car.state === 2) {
        coastBody(car, C.spinFriction, 0.8, dt);
        car.timer -= dt;
        if (car.timer <= 0) { car.state = 0; if (car.hostile) this.rivalShaken(car); }
      } else if (car.hostile) this._rivalAi(car, dt);
      else this._drive(car, dt);
      const fell = aiVertical(sim, car, dt);
      if (fell) car.dead = true;
      if (car.launched && !car.airborne) { car.launched = false; car.wrecked = true; car.state = 1; }
    }
    // despawn
    const zb = rv.z - C.windowBehind, za = rv.z + C.windowAhead;
    this.cars = this.cars.filter((c) => !c.dead && c.z > zb - (c.hostile && !c.giveUp ? 200 : 0) && c.z < za);
  }

  _drive(car, dt) {
    const sim = this.sim, road = sim.road, C = sim.cfg.traffic;
    const dir = car.dir;
    const nLanes = road.lanesPerDir(car.z);
    if (car.rank > nLanes - 1) car.rank = nLanes - 1;
    let laneU = this.laneTargetU(car.z, dir, car.rank, car);
    const br = sim.route.bridge;
    if (br && dir > 0 && car.z > br.rampStart - 150) laneU = road.hw(car.z) + road.sh(car.z) * 0.5 + 0.6; // pull over: bridge out
    if (car.overtake) {
      laneU = road.laneU(car.z, -dir, 0);
      if ((car.z - car.overtake.until) * dir > 0 || car.overtake.t > 9) car.overtake = null;
      else car.overtake.t += dt;
    }
    if (car.swerveU != null) laneU = car.swerveU;
    const L = this._leader(car, laneU);
    // set-piece blocks ahead in this lane count as a stopped leader
    const bd = this._blockAhead(car, laneU);
    if (bd < Infinity && (L.obj == null || bd < L.d)) { L.obj = { cat: 'block', z: car.z + dir * (car.len / 2 + bd), len: 1 }; L.d = bd; L.v = 0; L.u = laneU; L.w = 2; L.stationary = true; }
    let vT = car.desired + (car.overtake ? 4 : 0);
    // multi-lane roads: move over to get round slow traffic
    if (!car.rails && nLanes > 1 && car.laneCd <= 0 && L.obj && L.obj.cat === 'car' && L.v < car.desired - 3 && L.d < 25 && car.swerveU == null) {
      const r2 = this._freeLane(car, nLanes);
      if (r2 != null) { car.rank = r2; car.laneCd = 4; }
    }
    // overtake slow vehicles through the oncoming lane on single-lane roads when it is clear
    if (!car.overtake && !car.rails && car.len < 10 && !car.slowKind && L.obj && L.obj.cat === 'car' && L.obj.state === 0 && nLanes === 1 && !road.median(car.z) &&
        L.v < car.desired - 3 && L.d < 22 && this._oncomingClear(car, L.obj)) {
      car.overtake = { until: L.obj.z + dir * (L.obj.len / 2 + car.len / 2 + 7), t: 0 };
    }
    if (L.obj) {
      // time-headway follow law + emergency stop when inside braking distance
      const v = Math.max(0, car.speed), lv = Math.max(0, L.v);
      const gap = C.followGap * 0.6 + v * (C.headway ?? 0.9);
      let follow = lv + (L.d - gap) * 0.8;
      const brakeD = (v * v - lv * lv) / (2 * 12);
      if (L.d - 2 < brakeD) follow = Math.min(follow, lv * 0.5);
      if (L.d < 2.5) follow = 0;
      vT = Math.max(0, Math.min(vT, follow));
      if (L.stationary && L.d < 25 && car.swerveU == null && !car.rails && !L.obj.cat?.startsWith?.('ped') && !(L.obj.cat === 'block' && L.d < 4)) {
        car.stuckT += dt;
        if (car.stuckT > 0.6) {
          // swerve around: prefer another lane in our direction, else the outer side
          const n = nLanes;
          if (n > 1) { const r2 = this._freeLane(car, n, true); car.rank = r2 ?? (car.rank === 0 ? 1 : car.rank - 1); car.stuckT = 0; car.laneCd = 3; }
          else if (L.obj.cat === 'block') { car.stuckT = 0; }
          else {
            const lim = road.hw(car.z) + road.sh(car.z) - car.wid / 2 - 0.2;
            const outer = L.u + dir * (L.w / 2 + car.wid / 2 + 0.7);
            const inner = L.u - dir * (L.w / 2 + car.wid / 2 + 0.7);
            car.swerveU = Math.abs(outer) <= lim + 1.5 ? outer : inner;
            car.swerveUntil = L.obj.z + dir * (L.obj.len || 3) + dir * 6;
            car.stuckT = 0;
          }
        }
      } else car.stuckT = Math.max(0, car.stuckT - dt);
    } else car.stuckT = 0;
    if (car.swerveU != null) {
      vT = Math.min(vT + 6, 9);
      if ((car.z - car.swerveUntil) * dir > 0) car.swerveU = null;
    }
    vT = this.stopLimit(car, vT);
    const look = Math.max(9, Math.abs(car.speed) * 0.9);
    const tz = car.z + dir * look;
    aiDrive(car, road.xAt(tz, laneU), tz, vT, this._P(car), dt);
  }

  // an adjacent lane (same direction) that is clear of cars and set-piece blocks, or null
  _freeLane(car, n, any = false) {
    const sim = this.sim, road = sim.road, dir = car.dir;
    const opts = [car.rank + 1, car.rank - 1].filter((r) => r >= 0 && r < n);
    for (const r of opts) {
      const u = road.laneU(car.z, dir, r);
      let ok = true;
      for (const o of this.cars) {
        if (o === car) continue;
        const d = (o.z - car.z) * dir;
        if (d < -(o.len + car.len) / 2 - 8 || d > 28) continue;
        if (Math.abs(road.uAt(o.x, o.z) - u) < (o.wid + car.wid) / 2 + 0.3) { ok = false; break; }
      }
      if (ok && sim.rv && !sim.rv.airborne) {
        const d = (sim.rv.z - car.z) * dir;
        if (d > -14 && d < 20 && Math.abs(road.uAt(sim.rv.x, sim.rv.z) - u) < 2.8) ok = false;
      }
      if (ok && sim.laneBlocked(car.z + dir * 15, u)) ok = false;
      if (ok) return r;
    }
    return null;
  }

  _oncomingClear(car, lead) {
    const sim = this.sim, road = sim.road, dir = car.dir;
    const z0 = car.z - dir * 12, z1 = lead.z + dir * 110;
    const lo = Math.min(z0, z1), hi = Math.max(z0, z1);
    const bad = (b) => b !== car && b.z > lo && b.z < hi && road.uAt(b.x, b.z) * dir < 0.4;
    for (const o of this.cars) if (bad(o)) return false;
    for (const o of sim.cops.cops) if (o.kind !== 'heli' && bad(o)) return false;
    if (bad(sim.rv)) return false;
    for (const o of sim.obstacles.list) if (o.solid && o.state === 0 && bad(o)) return false;
    // no overtaking near the train crossing, roadwork or the bridge
    for (const e of sim.route.events) {
      if (e.z != null && e.z > lo - 20 && e.z < hi + 20) return false;
      if (e.from != null && e.type === 'roadwork' && hi > e.from - 30 && lo < e.to + 30) return false;
    }
    return true;
  }

  // Oil slick hit.
  spinOut(car, seconds) {
    if (car.state === 1) return;
    car.state = 2; car.timer = seconds;
    car.w += (this.rng.chance(0.5) ? 1 : -1) * (3.5 + this.rng.float(0, 2));
    if (car.hostile) this.rivalShaken(car);
  }

  crash(car, byRv, power = 10) {
    if (car.rails) {
      if (car.state === 0) { car.state = 1; car.timer = 0; }
      if (byRv && !car.crashedByRv) { car.crashedByRv = true; this.sim.heat.incident(this.sim.rules.heat.sources.carCrash, 'carCrash'); }
      return;
    }
    if (car.state !== 1) { car.state = 1; car.timer = 0; }
    else car.timer = Math.min(car.timer, 2);
    if (power > 14) car.wrecked = true;
    if (byRv && !car.crashedByRv) {
      car.crashedByRv = true;
      this.sim.heat.incident(this.sim.rules.heat.sources.carCrash, 'carCrash');
    }
  }

  damage(car, amount) {
    if (!car.hostile) return;
    car.hp -= amount;
    if (car.hp <= 0 && car.state !== 1) {
      car.state = 1; car.giveUp = true;
      this.sim.scoring.add(this.sim.rules.scoring.copWreckPoints / 2);
      this.sim.emit({ type: 'msg', text: 'Rival wrecked!', tone: 'good' });
    }
  }

  pushEnts(out) {
    for (const c of this.cars) out.push([c.id, c.kid, c.x, c.y, c.z, c.yaw, c.variant, c.state]);
  }
}

