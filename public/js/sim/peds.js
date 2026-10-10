// ─────────────────────────────────────────────────────────────────────────────
// PedSystem: slapstick pedestrians (adults only, variants 0..7).
//  • Spawn on sidewalks / roadside per biome.pedPer100m (frontier sweep ahead).
//  • Some walk along, some cross at intersections in groups, a few jaywalk, and runners wait on the
//    sidewalk and sprint across when the RV is a few seconds away (anywhere along the street);
//    honking before they go keeps them on the sidewalk.
//  • Horn → peds within hornScareRadius panic and run off the road.
//  • RV hit at ≥ knockMinSpeed → airborne arc with spin (2) → dazed (3) →
//    getting up (4) → walk away (0) / run (1). Scored once per ped.
// state: 0 walk, 1 panic/run, 2 airborne (knocked), 3 dazed on ground, 4 getting up
// Unity port: PedManager + Ped (MonoBehaviour) with an animator driven by `state`.
// ─────────────────────────────────────────────────────────────────────────────
import { KIND_ID } from '../shared/protocol.js';
import { clamp } from './util.js';
import { capsuleCircle } from './collisions.js';

const PED = KIND_ID.ped;
const _c = { nx: 0, nz: 0, depth: 0, px: 0, pz: 0 };

export class PedSystem {
  constructor(sim) {
    this.sim = sim;
    this.rng = sim.rngPeds;
    this.peds = [];
    this.frontier = sim.route.start.z + 30;
    this.ints = sim.track.intersectionZs();
    this.intIdx = 0;
    this.intTrigger = null;
    this._seedStart();
  }

  reset(z) {
    this.peds = this.peds.filter((p) => Math.abs(p.z - z) > 120);
    this.frontier = Math.max(z + 40, Math.min(this.frontier, z + 100));
    while (this.intIdx < this.ints.length && this.ints[this.intIdx] < z + 60) this.intIdx++;
  }

  // a few peds already around the start so Downtown isn't empty
  _seedStart() {
    const sim = this.sim, z0 = sim.route.start.z;
    for (let z = z0 - 40; z < z0 + 140; z += 10) this._rollSegment(z, true);
  }

  _walkBand(z) {
    const road = this.sim.road, b = road.biome(z);
    const hw = road.hw(z), sh = road.sh(z);
    if (b.sidewalk) return [hw + 0.7, hw + sh + 1.6];
    return [hw + sh + 0.8, hw + sh + 4.5];
  }

  _blockedZ(z) {
    const sim = this.sim;
    for (const s of sim.route.stops) if (Math.abs(z - s.z) < s.lotLength / 2 + 4) return true;
    const br = sim.route.bridge;
    if (br && z > br.straightFrom - 60) return true;
    return z > sim.route.sellPoint.z - 60;
  }

  spawnPed(z, u, mode, opts = {}) {
    const sim = this.sim, road = sim.road, P = sim.rules.peds, rng = this.rng;
    const sp = P.walkSpeed[0] + (P.walkSpeed[1] - P.walkSpeed[0]) * rng.float();
    const p = {
      cat: 'ped', id: sim.newId(), kid: PED, variant: opts.variant ?? rng.int(0, 7),
      x: road.xAt(z, u), y: 0, z, yaw: 0, vx: 0, vz: 0, vy: 0, spin: 0,
      state: 0, mode, speed: sp, dirZ: opts.dirZ ?? rng.sign(), targetU: opts.targetU ?? u,
      timer: 0, scored: false, delay: opts.delay ?? 0, jayZ: opts.jayZ ?? null,
    };
    this.peds.push(p);
    return p;
  }

  _rollSegment(z0, force = false) {
    const sim = this.sim, road = sim.road, rng = this.rng, C = sim.cfg.peds;
    const biome = road.biome(z0);
    const p = (biome.pedPer100m || 0) * 0.1;
    const a = rng.float(), zz = z0 + rng.float(0, 10), side = rng.sign(), t = rng.float(), j = rng.float();
    if (a >= p || this.peds.length >= C.maxPeds) return;
    if (this._blockedZ(zz) && !force) return;
    const [u0, u1] = this._walkBand(zz);
    const u = side * (u0 + (u1 - u0) * t);
    // keep the garage door → road crossing clear at the start
    const gar = sim.structures && sim.structures.garage;
    if (gar && side === gar.side && Math.abs(zz - gar.cz) < 32) return;
    const R = C.runners;
    if (j < C.jaywalkChance) {
      // jaywalker: waits at the kerb, steps out when the RV gets within ~60-120 m
      const ped = this.spawnPed(zz, side * (road.hw(zz) + 0.5), 'jay', { targetU: -side * (u0 + 1) });
      ped.jayRange = 60 + rng.float(0, 60);
    } else if (R && j < C.jaywalkChance + R.chance) {
      // runner: strolls on the sidewalk, then sprints across when the RV is react seconds away
      const ped = this.spawnPed(zz, u, 'dash');
      ped.react = rng.float(R.reactSeconds[0], R.reactSeconds[1]);
      ped.runSpeed = rng.float(R.runSpeed[0], R.runSpeed[1]);
      ped.dashTo = -side * (u0 + rng.float(0.3, 1.2));
    } else this.spawnPed(zz, u, 'walk');
  }

  _spawnSweep() {
    const sim = this.sim, rv = sim.rv, C = sim.cfg.peds;
    const target = rv.z + C.spawnAhead[1];
    let guard = 0;
    while (this.frontier < target && guard++ < 60) {
      const z0 = this.frontier; this.frontier += 10;
      if (z0 < rv.z + C.spawnAhead[0] - 150) continue;
      this._rollSegment(z0);
    }
    // intersection crossings (groups)
    while (this.intIdx < this.ints.length) {
      const iz = this.ints[this.intIdx];
      if (iz < rv.z + 20) { this.intIdx++; this.intTrigger = null; continue; }
      if (this.intTrigger == null) this.intTrigger = C.crossTriggerAhead[0] + this.rng.float() * (C.crossTriggerAhead[1] - C.crossTriggerAhead[0]);
      if (iz - rv.z > this.intTrigger) break;
      this.intIdx++; this.intTrigger = null;
      if (!this.rng.chance(C.crossGroupChance)) continue;
      const road = sim.road;
      if ((road.biome(iz).pedPer100m || 0) <= 0) continue;
      const n = this.rng.int(C.crossGroupSize[0], C.crossGroupSize[1]);
      const side = this.rng.sign();
      const [u0] = this._walkBand(iz);
      for (let i = 0; i < n; i++) {
        const dz = this.rng.float(-2.2, 2.2);
        this.spawnPed(iz + dz, side * (u0 + this.rng.float(0, 1.2)), 'cross', {
          targetU: -side * (u0 + this.rng.float(0.3, 1.5)), delay: this.rng.float(0, 1.2),
        });
      }
    }
  }

  // Horn: scare everyone close enough.
  horn() {
    const sim = this.sim, rv = sim.rv, R = sim.rules.peds.hornScareRadius, C = sim.cfg.peds;
    for (const p of this.peds) {
      if (p.state > 1) continue;
      const dx = p.x - rv.x, dz = p.z - rv.z;
      if (dx * dx + dz * dz > R * R) continue;
      this._panic(p, C.panicSeconds);
    }
  }

  _panic(p, seconds) {
    const road = this.sim.road;
    p.state = 1; p.timer = seconds;
    const u = road.uAt(p.x, p.z), rvU = road.uAt(this.sim.rv.x, this.sim.rv.z);
    // run to the nearest kerb away from the RV's line
    let side = u >= 0 ? 1 : -1;
    if (Math.abs(u) < 1.5) side = u >= rvU ? 1 : -1;
    const [u0, u1] = this._walkBand(p.z);
    p.targetU = side * (u0 + (u1 - u0) * 0.7);
    p.mode = 'walk';
  }

  update(dt) {
    const sim = this.sim, road = sim.road, rv = sim.rv, P = sim.rules.peds, C = sim.cfg.peds;
    this._spawnSweep();
    const g = sim.g;
    for (const p of this.peds) {
      switch (p.state) {
        case 0: case 1: {
          if (p.delay > 0) { p.delay -= dt; break; }
          const run = p.state === 1;
          const spd = run ? P.panicSpeed : p.speed;
          const u = road.uAt(p.x, p.z);
          let du = 0, dzv = 0;
          if (p.mode === 'cross' || run) {
            const d = p.targetU - u;
            if (Math.abs(d) < 0.3) { if (p.mode === 'cross') p.mode = 'walk'; }
            else du = Math.sign(d);
            dzv = run ? p.dirZ * 0.25 : 0;
            if (Math.abs(d) < 0.3) dzv = p.dirZ;
          } else if (p.mode === 'jay') {
            if (p.z - rv.z < p.jayRange && p.z > rv.z) p.mode = 'cross';
          } else if (p.mode === 'dash' && rv.horn && p.z > rv.z && p.z - rv.z < C.runners.hornCancelRange) {
            p.mode = 'walk';   // heard the horn: thinks better of it and stays on the sidewalk
          } else if (p.mode === 'dash' && p.z > rv.z && p.z - rv.z < Math.max(C.runners.minRange, rv.speed * p.react)) {
            p.mode = 'cross'; p.speed = p.runSpeed; p.targetU = p.dashTo;
          } else {
            dzv = p.dirZ;
            const d = p.targetU - u;
            if (Math.abs(d) > 0.2) du = Math.sign(d) * 0.5;
          }
          if (run) { p.timer -= dt; if (p.timer <= 0) p.state = 0; }
          // move in road frame: +u is −x (heading ~ small)
          const h = road.heading(p.z);
          const ch = Math.cos(h), sh = Math.sin(h);
          // world forward along road = (sh, ch); world +u direction = (-ch, sh)
          let mx = dzv * sh - du * ch, mz = dzv * ch + du * sh;
          const ml = Math.hypot(mx, mz);
          if (ml > 1e-6) { mx /= ml; mz /= ml; p.vx = mx * spd; p.vz = mz * spd; p.yaw = Math.atan2(mx, mz); }
          else { p.vx = 0; p.vz = 0; }
          p.x += p.vx * dt; p.z += p.vz * dt;
          break;
        }
        case 2: { // airborne
          p.vy -= g * dt;
          p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
          p.yaw += p.spin * dt;
          const gy = this._groundY(p);
          if (p.y <= gy && p.vy < 0) { p.y = gy; p.vy = 0; p.state = 3; p.timer = P.dazedSeconds; p.spin *= 0.2; }
          break;
        }
        case 3: { // dazed — slide to a stop
          const v = Math.hypot(p.vx, p.vz);
          if (v > 0) { const nv = Math.max(0, v - C.groundFriction * dt); p.vx *= nv / v; p.vz *= nv / v; }
          p.x += p.vx * dt; p.z += p.vz * dt;
          p.yaw += p.spin * dt; p.spin *= Math.max(0, 1 - 3 * dt);
          p.timer -= dt;
          if (p.timer <= 0) { p.state = 4; p.timer = C.getUpSeconds; p.vx = p.vz = 0; }
          break;
        }
        case 4: {
          p.timer -= dt;
          if (p.timer <= 0) {
            // stagger off the road
            const u = road.uAt(p.x, p.z);
            const side = u >= 0 ? 1 : -1;
            const [u0, u1] = this._walkBand(p.z);
            p.state = 0; p.mode = 'cross'; p.targetU = side * (u0 + (u1 - u0) * 0.5);
            p.dirZ = this.rng.sign();
          }
          break;
        }
      }
    }
    this._collideRv();
    const zb = rv.z - C.windowBehind, za = rv.z + C.windowAhead + 20;
    this.peds = this.peds.filter((p) => p.z > zb && p.z < za);
  }

  _groundY(p) { const y = this.sim.road.surfaceY(p.z); return y == null ? -50 : y; }

  _collideRv() {
    const sim = this.sim, rv = sim.rv, P = sim.rules.peds;
    if (rv.airborne && rv.y > 2) return;
    const r = P.radius;
    for (const p of this.peds) {
      if (p.state === 2) continue;
      if (Math.abs(p.z - rv.z) > 8) continue;
      if (!capsuleCircle(rv, p.x, p.z, r, _c)) continue;
      const v = Math.hypot(rv.vx, rv.vz);
      if (v >= P.knockMinSpeed) this.knock(p, rv, v, true);
      else { p.x += _c.nx * _c.depth; p.z += _c.nz * _c.depth; if (p.state === 0) this._panic(p, 2); }
    }
  }

  // Knock a ped flying. byRv → scored (once per ped).
  knock(p, src, v, byRv) {
    const sim = this.sim, rng = this.rng, S = sim.rules.scoring;
    const dx = p.x - src.x, dz = p.z - src.z, d = Math.hypot(dx, dz) || 1;
    const k = clamp(v, 3, 30);
    p.state = 2;
    p.vx = src.vx * 0.75 + (dx / d) * (2 + k * 0.15);
    p.vz = src.vz * 0.75 + (dz / d) * (2 + k * 0.15);
    p.vy = 3.5 + k * 0.28;
    p.spin = rng.sign() * (6 + rng.float(0, 6));
    p.y = Math.max(p.y, 0.3);
    if (byRv && !p.scored) {
      p.scored = true;
      sim.score.points += S.pedPoints;
      sim.score.chaos += S.pedChaosStars;
      sim.score.knocked++;
      sim.heat.incident(sim.rules.heat.sources.pedHit, 'pedHit');
      sim.addBump(0.25);
      sim.emit({ type: 'pedHit', x: p.x, z: p.z });
    }
  }

  // Generic: any vehicle body (cops, traffic) bumping into peds knocks them (no score).
  collideBody(b) {
    const P = this.sim.rules.peds;
    for (const p of this.peds) {
      if (p.state === 2 || Math.abs(p.z - b.z) > 7) continue;
      if (!capsuleCircle(b, p.x, p.z, P.radius, _c)) continue;
      const v = Math.hypot(b.vx, b.vz);
      if (v >= P.knockMinSpeed + 2) this.knock(p, b, v, false);
      else { p.x += _c.nx * _c.depth; p.z += _c.nz * _c.depth; }
    }
  }

  pushEnts(out) {
    for (const p of this.peds) out.push([p.id, PED, p.x, p.y, p.z, p.yaw, p.variant, p.state]);
  }
}
