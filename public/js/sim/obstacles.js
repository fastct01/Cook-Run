// ─────────────────────────────────────────────────────────────────────────────
// ObstacleSystem: road props and hazards.
//  • Chunk props: per 50 m chunk, placed deterministically with
//    Rng(hashSeed(seed, chunkIndex)) from biome.obstacles / obstaclePer100m.
//    Loaded/unloaded with a window around the RV; smashed props stay smashed.
//    Never inside supply-stop lots, structures (structures.js zones), set-piece
//    zones, at the start, the train crossing, the roadwork zone or the sell point.
//    Solid blockers keep ≥ 7 m from the chunk edges and never sit on both sides of
//    the road within 14 m of each other, so a lane is always open.
//  • Dynamic props: roadwork cones/barriers, roadblock barricades, spike strips,
//    falling rocks, foam patches (added by other systems through add()).
//  • Behaviour from rules.obstacles:
//      smashable → flies (state 1) → gone (2); solid (non-smashable, non-flat) →
//      static collision + damage/slow/bump; flat → no blocking:
//        bump/damage/slow (pothole, manhole_open, trench_plates; speed_bump scaled
//        by speed), drag (sanddrift, water_main, flood_wash), slip (steam_leak,
//        water_main: grip × slip), fog (fx.fog for `fog` s), shock (power_line_down:
//        `shock` s of lost steering + damage + fx.shock), push (dust_devil: sideways
//        shove), foam (foam_patch: speed capped at rules.heat.rhino.foam.slowTo).
//      moves → tumbleweed / trolley roll across, cow / sheep wander (solid blockers),
//        log rolls across the road (solid, 1 = rolling), dust_devil wanders.
// Entity states: smashables 0 standing · 1 knocked (flying) · 2 gone; cow/sheep/log
//   0 idle · 1 moving; dust_devil 1; everything else 0.
// Unity port: ObstacleSpawner (chunk streaming) + Obstacle (MonoBehaviour).
// ─────────────────────────────────────────────────────────────────────────────
import { KIND_ID } from '../shared/protocol.js';
import { Rng, hashSeed } from './rng.js';
import { clamp, TAU } from './util.js';
import { capsuleSegment, resolveStatic } from './collisions.js';

const PLACE = {
  cone: 'lane', barrier: 'lane', pothole: 'lane', rock_small: 'lane', rock: 'lane', cactus_road: 'lane',
  hay: 'lane', sanddrift: 'road', trashcan: 'kerb', mailbox: 'kerb', hydrant: 'kerb', sprinkler: 'kerb',
  cow: 'roadside', tumbleweed: 'roadside',
  steam_leak: 'lane', water_main: 'lane', trench_plates: 'lane', manhole_open: 'lane', power_line_down: 'lane',
  sinkhole: 'edge', broken_car: 'edgecar', speed_bump: 'across', trolley: 'kerb', log: 'roadside',
  dust_devil: 'road', flood_wash: 'centre', sheep: 'roadside',
};
const SOLID_BLOCKERS = new Set(['rock', 'rock_small', 'sinkhole', 'broken_car', 'barrier', 'hay', 'cow', 'sheep', 'log']);
const _c = { nx: 0, nz: 0, depth: 0, px: 0, pz: 0 };

export class ObstacleSystem {
  constructor(sim) {
    this.sim = sim;
    this.list = [];
    this.loaded = new Set();
    this.smashed = new Set();   // keys of chunk props that were destroyed (persist across reloads)
    this.size = sim.cfg.obstacles.chunk;
    this.rngDyn = sim.rngEvents;
    this._solid = [];
    this._excl = this._buildExclusions();
    this.hits = {};             // kind → number of RV contacts (tests / stats)
  }

  _buildExclusions() {
    const sim = this.sim, r = sim.route, ex = [];
    for (const s of r.stops) ex.push([s.z - s.lotLength / 2 - 12, s.z + s.lotLength / 2 + 12]);
    const br = r.bridge;
    if (br) ex.push([br.rampStart - 40, br.landingEnd + 25]);
    for (const e of r.events || []) {
      if (e.type === 'train') ex.push([e.z - 22, e.z + 22]);
      if (e.type === 'roadwork') ex.push([e.from - 25, e.to + 25]);
    }
    if (sim.structures) for (const [a, b] of sim.structures.layout.zones) ex.push([a, b]);
    for (const d of r.setpieces || []) {
      const from = d.from ?? d.z, to = d.to ?? ((d.z ?? 0) + (d.length ?? 0));
      if (from == null) continue;
      ex.push([from - 60, to + 60]);
    }
    ex.push([-1e9, r.start.z + sim.cfg.obstacles.excludeStart]);
    ex.push([r.sellPoint.z - 70, 1e9]);
    for (const iz of sim.track.intersectionZs()) ex.push([iz - 7, iz + 7]);
    return ex;
  }
  _excluded(z) { for (const [a, b] of this._excl) if (z >= a && z <= b) return true; return false; }

  _make(kind, x, z, opts = {}) {
    const sim = this.sim, def = sim.rules.obstacles[kind] || { radius: 0.6, smashable: true, damage: 0, slow: 0, points: 0, heat: 0 };
    const o = {
      cat: 'obs', id: sim.newId(), kind, kid: KIND_ID[kind] ?? 0, def,
      x, y: opts.y ?? 0, z, u: sim.road.uAt(x, z), yaw: opts.yaw ?? 0, axisYaw: opts.axisYaw ?? null,
      r: opts.r ?? def.radius, hl: opts.halfLen ?? 0,
      state: opts.state ?? 0, variant: opts.variant ?? 0, vx: 0, vy: opts.vy ?? 0, vz: 0, spin: 0,
      timer: opts.timer ?? 0, hitCd: 0, gone: false, removeT: 0, flying: false,
      key: opts.key ?? null, chunk: opts.chunk ?? null, src: opts.src ?? 'dyn',
      flat: !!def.flat, solid: !def.smashable && !def.flat, falling: !!opts.falling,
      targetU: opts.targetU ?? 0, used: false, owner: opts.owner ?? null, life: opts.life ?? 0,
    };
    this._ends(o);
    return o;
  }
  _ends(o) {
    const a = o.axisYaw ?? o.yaw;
    const s = Math.sin(a) * o.hl, c = Math.cos(a) * o.hl;
    o.ax = o.x + s; o.az = o.z + c; o.bx = o.x - s; o.bz = o.z - c;
  }

  add(kind, x, z, opts = {}) { const o = this._make(kind, x, z, opts); this.list.push(o); return o; }

  // ── chunk streaming ─────────────────────────────────────────────────────────
  _genChunk(ci) {
    const sim = this.sim, road = sim.road, size = this.size;
    const z0 = ci * size;
    if (z0 > sim.route.routeLength + 100) return;
    const rng = new Rng(hashSeed(sim.seed, ci));
    const biome = road.biome(z0 + size / 2);
    const kinds = biome.obstacles || [];
    const n = (biome.obstaclePer100m || 0) * size / 100 * (sim.cfg.obstacles.densityMult ?? 1);   // difficulty lever
    const count = Math.floor(n) + (rng.float() < n - Math.floor(n) ? 1 : 0);
    const solids = [];
    for (let i = 0; i < count; i++) {
      const kind = rng.pick(kinds);
      let z = z0 + rng.float(2, size - 2);
      const a = rng.float(), b = rng.float(), side = rng.sign(), yawR = rng.float(0, TAU), varR = rng.int(0, 3);
      if (!kind || this._excluded(z)) continue;
      const key = ci * 64 + i;
      if (this.smashed.has(key)) continue;
      const hw = road.hw(z), sh = road.sh(z), h = road.heading(z);
      const blocker = SOLID_BLOCKERS.has(kind);
      if (blocker) {
        z = z0 + 7 + (z - z0 - 2) / (size - 4) * (size - 14);
        if (solids.some((s) => Math.abs(s.z - z) < 14 && s.side !== side)) continue;
      }
      let u, yaw = yawR, extra = {};
      switch (PLACE[kind] || 'lane') {
        case 'kerb': u = side * (hw + 0.45 + a * Math.max(0.2, sh - 0.9)); break;
        case 'roadside': u = side * (hw + sh + 2 + a * 4); break;
        case 'road': u = (a * 2 - 1) * Math.max(0.5, hw - 1.5); break;
        case 'centre': u = 0; break;
        case 'edge': u = side * (hw + 0.6); break;
        case 'edgecar': u = side * (hw - 0.3); break;
        case 'across': u = 0; break;
        default: {
          const nl = road.lanesPerDir(z);
          u = road.laneU(z, side, Math.min(nl - 1, Math.floor(b * nl))) + (a - 0.5) * 1.4;
        }
      }
      if (road.median(z) && Math.abs(u) < 1.2 && PLACE[kind] !== 'across' && PLACE[kind] !== 'centre') u = side * 1.9;
      if (kind === 'barrier') yaw = h + Math.PI / 2;
      if (kind === 'cow' || kind === 'tumbleweed' || kind === 'sheep' || kind === 'trolley') yaw = h + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
      if (kind === 'broken_car') { yaw = h + (side > 0 ? 0 : Math.PI); extra = { halfLen: 2.3, r: 1.0 }; }
      if (kind === 'log') { yaw = h + Math.PI / 2; extra = { axisYaw: h, halfLen: 2.4, r: 0.6 }; }
      if (kind === 'speed_bump') {
        // one 7 m bump per `lateral` metres of carriageway, axis across the road
        const lat = this.sim.rules.obstacles.speed_bump?.lateral ?? 7;
        const pieces = Math.max(1, Math.ceil((2 * hw - 0.4) / lat));
        for (let p = 0; p < pieces; p++) {
          const uc = -hw + (2 * hw) * (p + 0.5) / pieces;
          const o = this._make(kind, road.xAt(z, uc), z, { yaw: h, axisYaw: h + Math.PI / 2, halfLen: Math.max(0.3, Math.min(lat, 2 * hw / pieces) / 2 - 0.45), r: 0.45, key: key * 8 + p, chunk: ci, src: 'chunk' });
          this.list.push(o);
        }
        continue;
      }
      if (kind === 'flood_wash') { yaw = h; extra = { axisYaw: h + Math.PI / 2, halfLen: Math.max(0.5, hw - 1.6), r: 2.6 }; }
      if (kind === 'steam_leak' && a < 0.3) { u = side * (hw - 0.5); extra = { variant: 1 }; }
      const x = road.xAt(z, u);
      const o = this._make(kind, x, z, { yaw, variant: varR, key, chunk: ci, src: 'chunk', ...extra });
      if (kind === 'cow' || kind === 'sheep') { o.timer = 1 + a * 4; o.home = side; }
      if (kind === 'tumbleweed' || kind === 'trolley') { o.home = side; o.trigger = 45 + b * 50; o.y = kind === 'tumbleweed' ? 0.4 : 0; }
      if (kind === 'trolley') o.variant = varR & 1;
      if (kind === 'log') { o.home = side; o.trigger = 35 + b * 30; }
      if (kind === 'dust_devil') { o.state = 1; o.dirU = -side; o.home = side; o.timer = 2 + a * 3; }
      if (blocker) solids.push({ z, side: Math.sign(u) || side });
      this.list.push(o);
      if (kind === 'sheep') {
        // a small flock
        const extraN = 2 + (varR & 1);
        for (let k = 0; k < extraN; k++) {
          const dz = (k + 1) * 2.2 * (k % 2 ? 1 : -1), du = side * (0.8 + k * 0.6);
          const s2 = this._make('sheep', road.xAt(z + dz, u + du), z + dz, { yaw, variant: (varR + k) & 1, key: key * 8 + k + 1, chunk: ci, src: 'chunk' });
          s2.timer = 1.5 + k; s2.home = side;
          this.list.push(s2);
        }
      }
    }
  }

  _stream() {
    const sim = this.sim, rv = sim.rv, C = sim.cfg.obstacles, size = this.size;
    const a = Math.floor((rv.z - C.windowBehind) / size), b = Math.floor((rv.z + C.windowAhead) / size);
    for (let ci = a; ci <= b; ci++) if (!this.loaded.has(ci)) { this.loaded.add(ci); this._genChunk(ci); }
    // unload chunks far outside the window
    for (const ci of [...this.loaded]) {
      if (ci < a - 1 || ci > b + 2) {
        this.loaded.delete(ci);
        this.list = this.list.filter((o) => o.chunk !== ci || o.flying);
      }
    }
  }

  // ── per-step ────────────────────────────────────────────────────────────────
  update(dt) {
    const sim = this.sim, road = sim.road, rv = sim.rv, g = sim.g, C = sim.cfg.obstacles;
    this._stream();
    for (const o of this.list) {
      if (o.hitCd > 0) o.hitCd -= dt;
      if (o.life > 0) { o.life -= dt; if (o.life <= 0) { o.gone = true; continue; } }
      if (o.flying) { // knocked flying
        o.vy -= g * dt; o.x += o.vx * dt; o.z += o.vz * dt; o.y += o.vy * dt; o.yaw += o.spin * dt;
        const gy = road.surfaceY(o.z) ?? -60;
        if (o.y < gy) { o.y = gy; o.vy *= -0.3; o.vx *= 0.6; o.vz *= 0.6; o.spin *= 0.6; }
        o.timer -= dt;
        if (o.timer <= 0) { o.flying = false; o.state = 2; o.removeT = 0.5; }
        this._ends(o);
        continue;
      }
      if (o.state === 2 && o.def.smashable) { o.removeT -= dt; if (o.removeT <= 0) o.gone = true; continue; }
      if (o.falling) {
        o.vy -= g * dt; o.y += o.vy * dt;
        if (o.y <= 0) { o.y = 0; o.falling = false; o.landedNow = true; }
        continue;
      }
      switch (o.kind) {
        case 'cow': this._wander(o, dt, 0.7); break;
        case 'sheep': this._wander(o, dt, 0.9); break;
        case 'tumbleweed': this._tumble(o, dt, 5.5); break;
        case 'trolley': this._tumble(o, dt, 1.8); break;
        case 'log': this._log(o, dt); break;
        case 'dust_devil': this._devil(o, dt); break;
      }
    }
    const zb = rv.z - C.windowBehind - 40, za = rv.z + C.windowAhead + 120;
    this.list = this.list.filter((o) => !o.gone && (o.chunk != null || (o.z > zb && o.z < za)));
  }

  _wander(o, dt, speed) {
    const road = this.sim.road, rng = this.rngDyn;
    o.timer -= dt;
    if (o.state === 0) {
      if (o.timer <= 0) {
        o.state = 1; o.timer = 3 + rng.float(0, 5);
        const hw = road.hw(o.z), sh = road.sh(o.z);
        o.targetU = o.home * (rng.chance(0.55) ? rng.float(-hw + 0.5, hw) : hw + sh + rng.float(1, 5));
      }
    } else {
      const u = road.uAt(o.x, o.z), d = o.targetU - u;
      if (Math.abs(d) < 0.2 || o.timer <= 0) { o.state = 0; o.timer = 2 + rng.float(0, 5); }
      else {
        const sp = speed * Math.sign(d);
        const h = road.heading(o.z);
        o.x += -Math.cos(h) * sp * dt; o.z += Math.sin(h) * sp * dt;
        o.yaw = h + (d > 0 ? -Math.PI / 2 : Math.PI / 2);
      }
    }
    o.u = road.uAt(o.x, o.z);
    this._ends(o);
  }

  // tumbleweed / trolley: wait at the roadside, roll across once the RV gets close
  _tumble(o, dt, speed) {
    const sim = this.sim, road = sim.road, rv = sim.rv;
    if (!o.rolling) {
      const d = o.z - rv.z;
      if (d > 10 && d < o.trigger && !o.used) { o.rolling = true; o.used = true; o.dirU = -o.home; }
    } else {
      const h = road.heading(o.z), sp = speed * o.dirU;
      o.x += -Math.cos(h) * sp * dt; o.z += (Math.sin(h) * sp + (o.kind === 'tumbleweed' ? 0.6 : 0.2)) * dt;
      if (o.kind === 'tumbleweed') { o.yaw += 6 * dt * o.dirU; o.y = 0.4 + Math.abs(Math.sin(sim.t * 5 + o.id)) * 0.4; }
      else o.yaw = h + (o.dirU > 0 ? -Math.PI / 2 : Math.PI / 2);
      const u = road.uAt(o.x, o.z);
      if (u * o.dirU > road.hw(o.z) + road.sh(o.z) + 6) { o.rolling = false; o.home = o.dirU; if (o.kind === 'tumbleweed') o.y = 0.4; }
    }
    o.u = road.uAt(o.x, o.z);
    this._ends(o);
  }

  // log: rolls down the hillside across the road when the RV comes (solid while rolling)
  _log(o, dt) {
    const sim = this.sim, road = sim.road, rv = sim.rv;
    if (o.state === 0) {
      const d = o.z - rv.z;
      if (!o.used && d > 15 && d < o.trigger) { o.state = 1; o.used = true; o.dirU = -o.home; }
    } else {
      const h = road.heading(o.z), sp = 3.6 * o.dirU;
      o.x += -Math.cos(h) * sp * dt; o.z += Math.sin(h) * sp * dt;
      o.roll = (o.roll || 0) + Math.abs(sp) * dt / 0.44;
      const u = road.uAt(o.x, o.z);
      if (u * o.dirU > road.hw(o.z) + road.sh(o.z) + 3) { o.state = 0; o.home = o.dirU; }
    }
    o.u = road.uAt(o.x, o.z);
    this._ends(o);
  }

  // dust devil: drifts back and forth across the road
  _devil(o, dt) {
    const sim = this.sim, road = sim.road, rng = this.rngDyn;
    o.timer -= dt;
    const h = road.heading(o.z);
    const u = road.uAt(o.x, o.z), lim = road.hw(o.z) + 5;
    if (o.timer <= 0 || Math.abs(u) > lim) { o.timer = 2 + rng.float(0, 3); o.dirU = Math.abs(u) > lim ? -Math.sign(u) : rng.sign(); }
    const sp = 2.2 * o.dirU;
    o.x += -Math.cos(h) * sp * dt; o.z += (Math.sin(h) * sp + Math.sin(sim.t * 0.7 + o.id) * 0.8) * dt;
    o.yaw += 2.4 * dt;
    o.u = road.uAt(o.x, o.z);
    this._ends(o);
  }

  _inert(o) { return o.flying || o.gone || (o.state === 2 && o.def.smashable); }

  // Solid things standing in the road (for traffic lane-follow / AI avoidance).
  solidNear(z, dir, range) {
    const out = this._solid; out.length = 0;
    for (const o of this.list) {
      if (this._inert(o) || o.flat || o.falling) continue;
      if (o.kind === 'cone' || o.kind === 'sprinkler' || o.kind === 'trolley' || o.kind === 'tumbleweed') continue;
      const d = (o.z - z) * dir;
      if (d < -3 || d > range + 5) continue;
      out.push(o);
    }
    return out;
  }

  _smash(o, b, v, byRv) {
    const sim = this.sim, rng = this.rngDyn;
    o.state = 1; o.flying = true; o.timer = sim.cfg.obstacles.flyingSeconds;
    const dx = o.x - b.x, dz = o.z - b.z, d = Math.hypot(dx, dz) || 1;
    o.vx = b.vx * 0.9 + (dx / d) * (1.5 + v * 0.12);
    o.vz = b.vz * 0.9 + (dz / d) * (1.5 + v * 0.12);
    o.vy = 2.5 + v * 0.22 * (0.7 + rng.float(0, 0.6));
    o.spin = rng.sign() * (5 + rng.float(0, 8));
    o.y = Math.max(o.y, 0.2);
    if (o.key != null) this.smashed.add(o.key);
    if (byRv) {
      const def = o.def;
      sim.score.points += def.points || 0;
      sim.score.smashed++;
      sim.heat.incident(def.heat || 0, 'smash');
      sim.emit({ type: 'smash', x: o.x, z: o.z, kind: o.kind });
    }
  }

  // Flat hazards: effects while the RV is over them.
  _flat(o, v, dt) {
    const sim = this.sim, rv = sim.rv, def = o.def;
    const first = o.hitCd <= 0;
    if (def.slip) { const k = def.slip; rv.slipK = rv.slipT > 0 ? Math.min(rv.slipK, k) : k; rv.slipT = 0.35; }
    if (def.drag) {
      rv.sandT = 0.12;
      if (first && v > 4 && (def.bump || !def.slip)) { sim.addBump(def.bump ?? 0.3); }
    }
    if (def.foam) { rv.foamT = Math.max(rv.foamT, def.foam); rv.foamTo = sim.rules.heat.rhino?.foam?.slowTo ?? 4; }
    if (def.push) {
      // dust devil: a sideways gust (def.push m/s across the RV's heading, the way the
      // column swirls) on entry, and the dust breaks traction while inside
      if (first) {
        const rx = -Math.cos(rv.yaw), rz = Math.sin(rv.yaw);           // RV right
        const side = ((rv.x - o.x) * rx + (rv.z - o.z) * rz) >= 0 ? 1 : -1;
        rv.vx += rx * side * def.push; rv.vz += rz * side * def.push;
        sim.addBump(0.3); sim.setFx({ fog: 0.4 }, 0.5); o.hitCd = 1.2;
        this.hits[o.kind] = (this.hits[o.kind] || 0) + 1;
      }
      rv.slipK = rv.slipT > 0 ? Math.min(rv.slipK, 0.35) : 0.35; rv.slipT = 0.6;
    }
    if (def.shock && first) {
      rv.shockT = Math.max(rv.shockT, def.shock);
      sim.damageRv(def.damage || 0, 'shock');
      sim.setFx({ shock: 1 }, def.shock * 0.6);
      sim.addBump(0.4);
      sim.emit({ type: 'msg', text: 'ZAP! Live wire!', tone: 'bad' });
      sim.emit({ type: 'crash', x: o.x, z: o.z, power: 0.2 });
      o.hitCd = Math.max(1.2, def.shock + 0.3);
      this.hits[o.kind] = (this.hits[o.kind] || 0) + 1;
      return;
    }
    if (!first) return;
    if (def.fog) sim.setFx({ fog: 1 }, def.fog);
    let did = !!(def.fog || def.slip || def.drag || def.foam || def.push);
    if ((def.bump || def.damage || def.slow) && !def.push && v > 2) {
      const f = o.kind === 'speed_bump' ? clamp(v / 14, 0.15, 1.5) : clamp(v / 20, 0.3, 1);
      const dmg = o.kind === 'speed_bump' ? (v > 22 ? (v - 22) * 0.3 : 0) : (def.damage || 0) * f;
      if (dmg > 0) sim.damageRv(dmg, o.kind);
      const k = 1 - (def.slow || 0) * f; rv.vx *= k; rv.vz *= k;
      if (def.bump) sim.addBump(Math.min(1, def.bump * f));
      did = true;
    }
    if (did) { o.hitCd = sim.cfg.obstacles.hitCooldown; this.hits[o.kind] = (this.hits[o.kind] || 0) + 1; }
  }

  // RV vs obstacles.
  collideRv(dt) {
    const sim = this.sim, rv = sim.rv, R = sim.rules.rv;
    const airLow = !rv.airborne || rv.y - (sim.road.surfaceY(rv.z) ?? -99) < 1.0;
    for (const o of this.list) {
      if (this._inert(o)) continue;
      if (Math.abs(o.z - rv.z) > rv.hl + rv.r + o.r + o.hl + 1) continue;
      if (o.falling) {
        // a falling rock landing on the roof
        if (o.y < 3.5 && o.y > 0.3 && capsuleSegment(rv, o.ax, o.az, o.bx, o.bz, o.r * 0.8, _c)) {
          sim.damageRv(o.def.damage, 'rock');
          sim.addBump(1);
          sim.emit({ type: 'crash', x: o.x, z: o.z, power: 0.9 });
          o.gone = true; o.state = 2;
        }
        continue;
      }
      if (!airLow) continue;
      if (!capsuleSegment(rv, o.ax, o.az, o.bx, o.bz, o.r, _c)) continue;
      const def = o.def, v = Math.hypot(rv.vx, rv.vz);
      if (def.smashable) {
        if (v > 1.5) {
          this._smash(o, rv, v, true);
          if (def.damage) sim.damageRv(def.damage, 'prop');
          const k = 1 - (def.slow || 0);
          rv.vx *= k; rv.vz *= k;
          sim.addBump(def.bump ?? Math.min(0.6, 0.12 + (def.damage || 0) * 0.06));
          this.hits[o.kind] = (this.hits[o.kind] || 0) + 1;
        } else resolveStatic(rv, _c, 0);
        continue;
      }
      if (o.flat) {
        if (o.kind === 'spikes') {
          if (!o.used) {
            o.used = true;
            rv.flatT = def.flatTyreSeconds ?? 8;
            sim.damageRv(def.damage || 0, 'spikes');
            sim.addBump(0.5);
            sim.emit({ type: 'msg', text: 'Flat tyre! Spikes!', tone: 'bad' });
            sim.emit({ type: 'crash', x: o.x, z: o.z, power: 0.2 });
          }
        } else this._flat(o, v, dt);
        continue;
      }
      // solid
      const vn = resolveStatic(rv, _c, 0.1);
      if (o.hitCd <= 0 && vn > 1.5) {
        const f = vn < 3 ? 0 : clamp(vn / 14, 0.25, 1.3);
        sim.damageRv((def.damage || 0) * f, o.kind);
        const k = 1 - (def.slow || 0) * clamp(vn / 14, 0.2, 1);
        rv.vx *= k; rv.vz *= k;
        sim.addBump((def.bump ?? 0.8) * clamp(vn / 12, 0.3, 1));
        if (vn > R.minCrashSpeed) sim.emit({ type: 'crash', x: _c.px, z: _c.pz, power: clamp(vn / 25, 0.1, 1) });
        if (o.kind === 'cow') sim.emit({ type: 'msg', text: 'Mooo!', tone: 'info' });
        if (o.kind === 'sheep') sim.emit({ type: 'msg', text: 'Baaa!', tone: 'info' });
        o.hitCd = sim.cfg.obstacles.hitCooldown;
        this.hits[o.kind] = (this.hits[o.kind] || 0) + 1;
      }
    }
  }

  // AI vehicle vs obstacles: smash smashables (no score), bounce off solids. Returns closing speed of a solid hit.
  collideBody(b) {
    let worst = 0;
    for (const o of this.list) {
      if (this._inert(o) || o.falling || o.flat) continue;
      if (o.owner === b) continue;
      if (Math.abs(o.z - b.z) > b.hl + b.r + o.r + o.hl + 1) continue;
      if (!capsuleSegment(b, o.ax, o.az, o.bx, o.bz, o.r, _c)) continue;
      const v = Math.hypot(b.vx, b.vz);
      if (o.def.smashable) { if (v > 2) this._smash(o, b, v, false); else resolveStatic(b, _c, 0); }
      else worst = Math.max(worst, resolveStatic(b, _c, 0.1));
    }
    return worst;
  }

  // Remove everything near z (respawn at checkpoint clears dynamic hazards; chunk props regenerate).
  clearDynamicNear(z0, z1) {
    this.list = this.list.filter((o) => o.chunk != null || o.src === 'roadwork' || o.z < z0 || o.z > z1);
  }

  pushEnts(out) {
    for (const o of this.list) out.push([o.id, o.kid, o.x, o.y, o.z, o.yaw, o.variant, o.state]);
  }
}
