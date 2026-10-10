// ─────────────────────────────────────────────────────────────────────────────
// CopSystem: police pursuit.
//  • Spawning (heat level from rules.heat.levels): up to level.maxCops active
//    units every level.spawnEvery s, behind the RV out of view (90–130 m) or
//    ahead (oncoming lane on normal roads; forward side of the median on the
//    freeway). Kinds: cop, cop_suv (level.suv), moto_cop (level.moto, share
//    rules.heat.moto.share), interceptor (freeway at ≥ 3★), one heli (level.heli),
//    one rhino_truck (level.rhino, rules.heat.rhino). New units only come while the
//    police still know where you are (heat not decaying).
//  • AI: pursue a slot near the RV — behind it at low levels, alongside it at
//    `ram` levels with periodic side rams (copRamDamage / suvRamDamage / moto
//    ramDamage). When the RV slows down they box it in (bust). Weak avoidance of
//    solid things ahead (motos weave through traffic). Collision damage; hp ≤ 0 →
//    wrecked (copWreckPoints, copWreck). A moto cop hit by the RV is knocked over.
//  • Rhino armoured truck (5★): overtakes and holds rules.heat.rhino.aheadDist
//    ahead of the RV; every throwEvery s it lobs a `flashbang` canister (variant
//    0 FLASH, 1 FOAM; ≤ maxCanistersOut) ballistically onto the road ahead: state 0
//    flying (y > 0) → 1 on the ground (fuse) → 2 burst. Flash: within radius →
//    damage + sideways push + snapshot fx.flash. Foam: leaves a `foam_patch`
//    obstacle that caps the RV's speed (rhino.foam.slowTo for foam.seconds).
//    Event 'canister' {kind, x, z, hitRv}. High hp; ramming it hurts the RV.
//  • Roadblocks (level.roadblocks) ~220 m ahead every roadblockEvery s: barricade
//    + two parked cops angled across the road leaving a one-lane gap (forward
//    side when there is a median).
//  • Spike strips (level.spikes) ahead in the RV's lane every spikesEvery s.
//  • Bridge: when the RV passes the lip, every cop brakes to a stop before the
//    ramp (state 5); a cop right behind may comically sail off the ramp.
//  • Patrols (baseline heat): parked patrol cars at intersections in the biomes of
//    rules.sim.patrol.biomes. Speeding past one at 0 stars → a "ticket"; incidents
//    in its sight add witnessHeat. With a star it pulls out and joins the chase.
//  • Plugin hooks: applyEffect(id, {push, soak, stall, blind, damage}) → states
//    6 soaked (slow, can't see) / 7 stalled (engine dead, coasts) / 8 paint-blind
//    (swerves); setRedirect(fn, s) → chasing cops drive to fn(cop) instead.
// state: 0 parked (roadblock/patrol), 1 chase, 2 blinded (smoke), 3 spun out (oil),
//        4 wrecked, 5 gave up, 6 soaked, 7 stalled, 8 paint-blind.  heli: 1 chasing, 0 leaving.
// Unity port: PoliceManager + CopCar / CopMoto / RhinoTruck / CopHeli + Canister.
// ─────────────────────────────────────────────────────────────────────────────
import { KIND_ID } from '../shared/protocol.js';
import { clamp, wrapAngle } from './util.js';
import { Rng, hashSeed } from './rng.js';
import { initBodyShape } from './collisions.js';
import { aiDrive, coastBody, aiVertical, constrainAi } from './vehicle.js';

const DISABLED = new Set([6, 7, 8]);
const NO_SPAWN_ZONES = new Set(['toll_plaza', 'car_wash', 'river_bridge', 'drawbridge', 'garage', 'bridge', 'rail_crossing']);

export class CopSystem {
  constructor(sim) {
    this.sim = sim;
    this.rng = sim.rngCops;
    this.rngRhino = new Rng(hashSeed(sim.seed, 808));
    this.cops = [];
    this.canisters = [];
    this.spawnT = 0;
    this.roadblockT = 0;
    this.spikesT = 0;
    this.noMoreSpawns = false;
    this.ramGlobalCd = 0;
    this.redirect = null;   // { fn, t }
    this.rhinoSeen = false;
    this.canisterCount = 0;
    this._P = { accel: 9, brake: 14, grip: 13, maxYawRate: 1.7 };
    this._PM = { accel: 12, brake: 16, grip: 17, maxYawRate: 2.6 };
    this._PR = { accel: 6.5, brake: 11, grip: 10, maxYawRate: 1.3 };
    this.patrols = this._planPatrols();
  }

  _Pof(c) { return c.kind === 'moto_cop' ? this._PM : c.kind === 'rhino_truck' ? this._PR : this._P; }

  // ── patrols ────────────────────────────────────────────────────────────────
  _planPatrols() {
    const sim = this.sim, Pc = sim.cfg.patrol, road = sim.road;
    if (!Pc || !Pc.enabled) return [];
    const rng = new Rng(hashSeed(sim.seed, 606));
    const out = [];
    for (const iz of sim.track.intersectionZs()) {
      const b = road.biome(iz);
      const roll = rng.float(), side = rng.sign();
      if (!Pc.biomes.includes(b.id) || iz < (Pc.minZ ?? 150) || roll >= Pc.chance) continue;
      const pz = iz + (Pc.zOffset ?? 5);
      // no parked patrols in structure zones (rail crossing + yard siding, toll plaza, car wash…)
      if (sim.structures && sim.structures.layout.zones.some(([a, b2, kind]) => NO_SPAWN_ZONES.has(kind) && pz >= a - 10 && pz <= b2 + 10)) continue;
      out.push({ z: pz, side, spawned: false });
    }
    return out;
  }

  _spawnPatrols() {
    const sim = this.sim, rv = sim.rv, Pc = sim.cfg.patrol, road = sim.road;
    for (const p of this.patrols) {
      if (p.spawned || p.z > rv.z + Pc.spawnAhead || p.z < rv.z - 20) continue;
      p.spawned = true;
      const u = p.side * (road.hw(p.z) + road.sh(p.z) + Pc.offset);
      const yaw = road.heading(p.z) + p.side * Math.PI / 2; // nose toward the road
      const c = this._makeCop('cop', road.xAt(p.z, u), p.z, yaw, 0);
      c.vx = c.vz = 0; c.state = 0; c.parked = true; c.patrol = true; c.ticketed = false; c.variant = 1;
      this.cops.push(c);
    }
  }

  // Parked patrol: watches the RV go by.
  _patrol(c, dt) {
    const sim = this.sim, rv = sim.rv, Pc = sim.cfg.patrol, heat = sim.heat;
    coastBody(c, 12, 4, dt);
    if (sim.phase !== 'drive' || heat.gaveUp) return;
    const dx = rv.x - c.x, dz = rv.z - c.z, d = Math.hypot(dx, dz);
    if (d > Pc.watchRadius) return;
    const limit = Pc.speedLimit[sim.road.biome(rv.z).id] ?? 99;
    // a fresh offence (no stars yet) gets a ticket; during a chase the patrol just joins in
    if (!c.ticketed && heat.stars === 0 && Math.abs(rv.speed) > limit && sim.t - (this.lastTicketT ?? -1e9) >= (Pc.ticketCooldown ?? 0)) {
      c.ticketed = true;
      this.lastTicketT = sim.t;
      heat.add(Pc.speedingHeat);
      sim.emit({ type: 'msg', text: 'Speeding past a patrol car!', tone: 'bad' });
    }
    if (heat.stars >= 1 && dz > -12 && this.activeCount() < heat.level().maxCops) { c.parked = false; c.state = 1; c.patrol = false; }
  }

  // An incident (smash / ped / crash / ram) happened at the RV: any patrol in sight adds extra heat.
  witness(kind) {
    const sim = this.sim, rv = sim.rv, Pc = sim.cfg.patrol;
    if (!Pc || !Pc.enabled) return 0;
    const R2 = Pc.watchRadius * Pc.watchRadius;
    for (const c of this.cops) {
      if (!c.patrol || c.state !== 0) continue;
      const dx = rv.x - c.x, dz = rv.z - c.z;
      if (dx * dx + dz * dz < R2) return Pc.witnessHeat * (kind === 'smash' ? 0.5 : 1);
    }
    return 0;
  }

  activeCount() {
    let n = 0;
    for (const c of this.cops) {
      if (c.kind === 'heli' || c.kind === 'rhino_truck' || c.parked) continue;
      if (c.state === 1 || c.state === 2 || c.state === 3 || DISABLED.has(c.state)) n++;
    }
    return n;
  }
  hasHeli() { return this.cops.some((c) => c.kind === 'heli' && c.state === 1); }
  hasRhino() { return this.cops.some((c) => c.kind === 'rhino_truck' && c.state !== 4 && c.state !== 5); }

  onStarsUp(stars) {
    const C = this.sim.cfg.cops;
    this.spawnT = Math.min(this.spawnT, C.firstSpawnDelay);
    if (stars >= 3 && this.roadblockT <= 0) this.roadblockT = C.firstRoadblockDelay;
    if (stars >= 3 && this.spikesT <= 0) this.spikesT = C.firstRoadblockDelay + 4;
  }

  clearAll() { this.cops = []; this.canisters = []; }

  setRedirect(fn, seconds) { this.redirect = fn && seconds > 0 ? { fn, t: seconds } : null; }

  // ── spawning ────────────────────────────────────────────────────────────────
  _validSpawnZ(z) {
    const sim = this.sim, br = sim.route.bridge;
    if (z < 5 || z > sim.route.sellPoint.z - 40) return false;
    if (br && z > br.rampStart - 60 && z < br.landingEnd + 20) return false;
    for (const [a, b, kind] of sim.structures.layout.zones) if (z >= a && z <= b && NO_SPAWN_ZONES.has(kind)) return false;
    return sim.road.surfaceY(z) === 0;
  }

  _dims(kind) {
    const C = this.sim.cfg.cops, H = this.sim.rules.heat;
    switch (kind) {
      case 'cop_suv': return { len: C.suvLength, wid: C.suvWidth, mass: C.suvMass, hp: C.suvHp };
      case 'moto_cop': return { len: C.motoLength ?? 2.3, wid: C.motoWidth ?? 0.95, mass: C.motoMass ?? 0.45, hp: H.moto?.hp ?? 12 };
      case 'rhino_truck': return { len: C.rhinoLength ?? 6.6, wid: C.rhinoWidth ?? 2.7, mass: C.rhinoMass ?? 4.5, hp: H.rhino?.hp ?? 160 };
      case 'interceptor': return { len: C.interceptorLength ?? 4.95, wid: C.interceptorWidth ?? 1.98, mass: C.interceptorMass ?? 1.3, hp: C.interceptorHp ?? 50 };
      default: return { len: C.length, wid: C.width, mass: C.mass, hp: C.hp };
    }
  }

  _makeCop(kind, x, z, yaw, speed) {
    const sim = this.sim;
    const d = this._dims(kind);
    const c = {
      cat: 'cop', id: sim.newId(), kind, kid: KIND_ID[kind], variant: 0,
      x, y: 0, z, yaw, vx: Math.sin(yaw) * speed, vz: Math.cos(yaw) * speed, vy: 0, w: 0,
      speed, state: 1, hp: d.hp, timer: 0, ramT: 0, ramCd: 1 + this.rng.float(0, 2),
      ramHit: false, side: this.rng.sign(), parked: false, airborne: false, groundVy: 0,
      oilCd: 0, smokeCd: 0, avoidU: 0, plunge: false, hitCd: 0, prevState: 1, fxCd: 0,
    };
    initBodyShape(c, d.len, d.wid, d.mass, kind === 'rhino_truck' ? 0.5 : 1);
    const sy = sim.road.surfaceY(z); c.y = sy == null ? 0 : sy;
    return c;
  }

  _pickKind(level, z) {
    const sim = this.sim, H = sim.rules.heat, rng = this.rng;
    const r1 = rng.float(), r2 = rng.float();
    if (level.moto && r1 < (H.moto?.share ?? 0.35)) return 'moto_cop';
    const freeway = sim.road.biome(z).road?.type === 'freeway';
    if (freeway && level.stars >= 3 && r2 < 0.45) return 'interceptor';
    return level.suv && r2 < 0.4 ? 'cop_suv' : 'cop';
  }

  _spawnCar(level, forceKind = null) {
    const sim = this.sim, road = sim.road, rv = sim.rv, C = sim.cfg.cops, rng = this.rng;
    const ahead = rng.chance(C.spawnAheadChance);
    const dBehind = rng.float(C.spawnBehind[0], C.spawnBehind[1]);
    const dAhead = rng.float(C.spawnAhead[0], C.spawnAhead[1]);
    let z, dir;
    if (ahead && this._validSpawnZ(rv.z + dAhead)) { z = rv.z + dAhead; dir = -1; }
    else if (this._validSpawnZ(rv.z - dBehind)) { z = rv.z - dBehind; dir = 1; }
    else if (this._validSpawnZ(rv.z + dAhead)) { z = rv.z + dAhead; dir = -1; }
    else return null;
    const kind = forceKind || this._pickKind(level, z);
    // freeway: no U-turns across the median → "ahead" units wait on the forward side
    const median = road.median(z) > 0;
    let u, yaw, speed;
    if (dir < 0 && median) {
      u = road.laneU(z, 1, road.lanesPerDir(z) - 1);
      yaw = road.heading(z); speed = 10;
    } else {
      u = road.laneU(z, dir, 0);
      yaw = road.heading(z) + (dir < 0 ? Math.PI : 0);
      speed = dir > 0 ? Math.max(14, Math.abs(rv.speed)) : 16;
    }
    if (sim.laneBlocked(z, u)) return null;
    // don't drop onto traffic
    for (const car of sim.traffic.cars) if (Math.abs(car.z - z) < 10 && Math.abs(road.uAt(car.x, car.z) - u) < 2.8) return null;
    const c = this._makeCop(kind, road.xAt(z, u), z, yaw, speed);
    if (kind === 'rhino_truck') { c.throwT = (sim.rules.heat.rhino?.throwEvery ?? 5.5) * 0.6; c.aheadD = this.rngRhino.float(...(sim.rules.heat.rhino?.aheadDist ?? [25, 45])); }
    this.cops.push(c);
    return c;
  }

  _spawnRhino() {
    const sim = this.sim, rv = sim.rv, road = sim.road;
    for (const d of [110, 140, 80]) {
      const z = rv.z - d;
      if (!this._validSpawnZ(z)) continue;
      const u = road.laneU(z, 1, 0);
      if (sim.traffic.cars.some((car) => Math.abs(car.z - z) < 12 && Math.abs(road.uAt(car.x, car.z) - u) < 3)) continue;
      const c = this._makeCop('rhino_truck', road.xAt(z, u), z, road.heading(z), Math.max(16, Math.abs(rv.speed)));
      const Rh = sim.rules.heat.rhino || {};
      c.throwT = (Rh.throwEvery ?? 5.5) * 0.6;
      c.aheadD = this.rngRhino.float(...(Rh.aheadDist ?? [25, 45]));
      this.cops.push(c);
      if (!this.rhinoSeen) { this.rhinoSeen = true; sim.emit({ type: 'msg', text: 'The Rhino is coming — armoured truck!', tone: 'bad' }); }
      return c;
    }
    return null;
  }

  _spawnHeli() {
    const sim = this.sim, rv = sim.rv, C = sim.cfg.cops;
    const h = {
      cat: 'cop', id: sim.newId(), kind: 'heli', kid: KIND_ID.heli, variant: 0,
      x: rv.x, y: C.heliHeight, z: rv.z - 90, yaw: rv.yaw, vx: 0, vz: 0, vy: 0, w: 0, speed: 0,
      state: 1, hp: 999, timer: 0, parked: false,
    };
    this.cops.push(h);
    sim.emit({ type: 'msg', text: 'Police helicopter overhead!', tone: 'bad' });
  }

  _roadblock() {
    const sim = this.sim, road = sim.road, rv = sim.rv, C = sim.cfg.cops, rng = this.rng;
    const br = sim.route.bridge;
    let z = rv.z + C.roadblockAhead;
    const bad = (zz) => {
      if (!this._validSpawnZ(zz)) return true;
      if (br && zz > br.rampStart - 120) return true;
      if (sim.structures.inZone(zz, 20)) return true;
      for (const s of sim.route.stops) if (Math.abs(zz - s.z) < s.lotLength / 2 + 25) return true;
      for (const e of sim.route.events) {
        if (e.type === 'train' && Math.abs(zz - e.z) < 40) return true;
        if (e.type === 'roadwork' && zz > e.from - 40 && zz < e.to + 40) return true;
      }
      return false;
    };
    let tries = 0;
    while (bad(z) && tries < 6) { z += 25; tries++; }
    if (bad(z)) return false;
    const hw = road.hw(z), sh = road.sh(z), h = road.heading(z);
    const n = Math.max(2, road.lanesPerDir(z) * 2), lw = (2 * hw) / n;
    const median = road.median(z) > 0;
    // gap: one lane chosen at random (forward side if there is a median); the rest + that shoulder is blocked
    const gapLane = median ? rng.int(Math.ceil(n / 2), n - 1) : rng.int(0, n - 1);
    const gapU0 = -hw + gapLane * lw, gapU1 = gapU0 + lw;
    const bands = [];
    if (gapU0 > -hw + 0.1) bands.push([-hw - sh * 0.6, gapU0]);
    if (gapU1 < hw - 0.1) bands.push([gapU1, hw + sh * 0.6]);
    if (gapLane === 0) bands.push([-hw - sh - 0.5, -hw - sh * 0.4]);
    if (gapLane === n - 1) bands.push([hw + sh * 0.4, hw + sh + 0.5]);
    let longest = bands[0];
    for (const b of bands) if (b[1] - b[0] > longest[1] - longest[0]) longest = b;
    for (const [a, b] of bands) {
      const len = b - a;
      const pieces = Math.max(1, Math.ceil(len / 4.6));
      for (let i = 0; i < pieces; i++) {
        const uc = a + (len * (i + 0.5)) / pieces;
        const hl = Math.max(0.2, Math.min(1.6, len / pieces / 2 - 0.6));
        sim.obstacles.add('roadblock', road.xAt(z, uc), z, { yaw: h + Math.PI / 2, halfLen: hl, src: 'roadblock' });
      }
    }
    // two parked cops angled across the longest blocked band, staggered behind the barricade
    const [a, b] = longest;
    for (let i = 0; i < 2; i++) {
      const uc = a + (b - a) * (i === 0 ? 0.3 : 0.7);
      const zc = z + 5 + i * 5.5;
      const ang = (i === 0 ? 1 : -1) * 1.0;
      const kind = sim.heat.level().suv && i === 1 ? 'cop_suv' : 'cop';
      const c = this._makeCop(kind, road.xAt(zc, uc), zc, h + Math.PI / 2 + ang * 0.6, 0);
      c.vx = c.vz = 0; c.speed = 0; c.state = 0; c.parked = true;
      this.cops.push(c);
    }
    sim.emit({ type: 'msg', text: 'Roadblock ahead!', tone: 'bad' });
    return true;
  }

  _spikes() {
    const sim = this.sim, road = sim.road, rv = sim.rv, C = sim.cfg.cops, rng = this.rng;
    const z = rv.z + rng.float(C.spikesAhead[0], C.spikesAhead[1]);
    const br = sim.route.bridge;
    if (!this._validSpawnZ(z) || (br && z > br.rampStart - 120) || sim.structures.inZone(z, 10)) return;
    for (const s of sim.route.stops) if (Math.abs(z - s.z) < s.lotLength / 2 + 10) return;
    const rvU = road.uAt(rv.x, rv.z);
    const { dir, rank } = road.nearestLane(z, clamp(rvU, -road.hw(z) + 0.5, road.hw(z) - 0.5));
    const u = road.laneU(z, dir, rank);
    const lw = road.lw(z);
    sim.obstacles.add('spikes', road.xAt(z, u), z, { yaw: road.heading(z) + Math.PI / 2, halfLen: Math.max(0.3, lw / 2 - 1.0), src: 'spikes' });
  }

  // ── give up (bridge / zero stars) ──────────────────────────────────────────
  bridgeGiveUp() {
    const sim = this.sim, rv = sim.rv, C = sim.cfg.cops;
    this.noMoreSpawns = true;
    this.redirect = null;
    for (const c of this.cops) {
      if (c.kind === 'heli') { c.state = 0; continue; }
      if (c.state === 4) continue;
      c.patrol = false;
      const behind = rv.z - c.z;
      if ((c.state === 1) && behind > 0 && behind < C.comicFlyRange && !c.parked && Math.abs(c.speed) > 15 && c.kind !== 'rhino_truck') c.plunge = true;
      else { c.state = 5; c.parked = false; }
    }
    for (const k of this.canisters) if (k.state === 0 || k.state === 1) k.dud = true;
  }

  // ── per step ────────────────────────────────────────────────────────────────
  update(dt) {
    const sim = this.sim, heat = sim.heat, rv = sim.rv, C = sim.cfg.cops, H = sim.rules.heat;
    const level = heat.level();
    if (this.ramGlobalCd > 0) this.ramGlobalCd -= dt;
    if (this.redirect) { this.redirect.t -= dt; if (this.redirect.t <= 0 || sim.phase !== 'drive') this.redirect = null; }
    if (!this.noMoreSpawns && sim.phase !== 'garage') this._spawnPatrols();
    const knows = heat.unseenT < H.decayDelay || heat.seen;
    if (sim.phase === 'drive' && !heat.gaveUp && !this.noMoreSpawns) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = level.spawnEvery;
        if (level.maxCops > 0 && this.activeCount() < level.maxCops && (knows || !sim.cfg.heatExtra.spawnNeedsRecent)) this._spawnCar(level);
      }
      if (level.heli && !this.cops.some((c) => c.kind === 'heli')) this._spawnHeli();
      if (level.rhino && knows && !this.hasRhino()) {
        this.rhinoT = (this.rhinoT ?? (H.rhino?.spawnDelay ?? 4)) - dt;
        if (this.rhinoT <= 0) { this.rhinoT = H.rhino?.respawnEvery ?? 25; this._spawnRhino(); }
      }
      if (level.roadblocks && knows) {
        this.roadblockT -= dt;
        if (this.roadblockT <= 0) { this.roadblockT = H.roadblockEvery; this._roadblock(); }
      }
      if (level.spikes && knows) {
        this.spikesT -= dt;
        if (this.spikesT <= 0) { this.spikesT = H.spikesEvery; this._spikes(); }
      }
    }
    // drop below a level's cap → extra chasers peel off; zero stars → everyone gives up
    let active = 0;
    for (const c of this.cops) {
      if (c.kind === 'heli') { if (!level.heli && c.state === 1) c.state = 0; continue; }
      if (c.kind === 'rhino_truck') { if (!level.rhino && c.state === 1 && !c.parked) c.state = 5; continue; }
      if (c.state === 1 && !c.parked && !c.plunge) {
        active++;
        if (level.maxCops === 0 || active > level.maxCops + 1) c.state = 5;
      }
    }
    for (const c of this.cops) {
      c.redirected = false;
      if (c.kind === 'heli') { this._heli(c, dt); continue; }
      if (c.hitCd > 0) c.hitCd -= dt;
      if (c.oilCd > 0) c.oilCd -= dt;
      if (c.smokeCd > 0) c.smokeCd -= dt;
      switch (c.state) {
        case 0: if (c.patrol) this._patrol(c, dt); else this._parked(c, dt); break;
        case 1:
          if (c.plunge) this._plunge(c, dt);
          else if (c.kind === 'rhino_truck') this._rhino(c, level, dt);
          else this._chase(c, level, dt);
          break;
        case 2: this._blinded(c, dt, 0.4); break;
        case 3: coastBody(c, 5, 0.8, dt); c.timer -= dt; if (c.timer <= 0) c.state = 1; break;
        case 4: coastBody(c, c.kind === 'moto_cop' ? 7 : 9, 2.0, dt); break;
        case 5: this._gaveUp(c, dt); break;
        case 6: this._soaked(c, dt); break;
        case 7: this._stalled(c, dt); break;
        case 8: this._blinded(c, dt, 0.55); break;
      }
      const wall = constrainAi(sim, c);
      if (wall > 7 && c.state !== 4) this.damage(c, (wall - 7) * C.damageMult * (C.aiCrashDamageScale ?? 0.25) * (c.kind === 'moto_cop' ? 3 : 1));
      if (aiVertical(sim, c, dt) === 'fell') {
        c.dead = true;
        if (c.state !== 4) {
          this._wreckScore(c);
          sim.emit({ type: 'msg', text: 'A cop took the plunge!', tone: 'good' });
        }
      }
    }
    this._updateCanisters(dt);
    // despawn
    const lose = C.loseRange;
    this.cops = this.cops.filter((c) => {
      if (c.dead) return false;
      const d = Math.abs(c.z - rv.z);
      if (c.kind === 'heli') return !(c.state === 0 && (c.timer > 12 || d > 400));
      if (c.state === 4 || c.state === 5 || c.parked) return c.z > rv.z - 160 && c.z < rv.z + 600;
      if (this.redirect && c.state === 1) return d < lose + 400;
      return d < lose;
    });
  }

  _heli(h, dt) {
    const sim = this.sim, rv = sim.rv, C = sim.cfg.cops;
    let tx, tz, ty;
    if (h.state === 1) {
      const s = Math.sin(rv.yaw), c = Math.cos(rv.yaw);
      tx = rv.x - s * 16 + Math.sin(sim.t * 0.4) * 6; tz = rv.z - c * 16; ty = C.heliHeight;
    } else { h.timer += dt; tx = h.x + 40; tz = h.z - 20; ty = C.heliHeight + 30; }
    const dx = tx - h.x, dz = tz - h.z, d = Math.hypot(dx, dz);
    const vmax = C.heliSpeed;
    const want = Math.min(vmax, d * 1.2);
    const vx = d > 1e-3 ? (dx / d) * want : 0, vz = d > 1e-3 ? (dz / d) * want : 0;
    const k = Math.min(1, 1.5 * dt);
    h.vx += (vx - h.vx) * k; h.vz += (vz - h.vz) * k;
    h.x += h.vx * dt; h.z += h.vz * dt;
    h.y += (ty - h.y) * Math.min(1, 0.8 * dt);
    // nose toward the RV (or travel direction when leaving)
    const yawT = h.state === 1 ? Math.atan2(rv.x - h.x, rv.z - h.z) : Math.atan2(h.vx, h.vz);
    h.yaw += wrapAngle(yawT - h.yaw) * Math.min(1, 2 * dt);
    h.speed = Math.hypot(h.vx, h.vz);
  }

  _parked(c, dt) {
    const sim = this.sim, rv = sim.rv, C = sim.cfg.cops;
    coastBody(c, 12, 4, dt);
    // RV got past the roadblock → join the chase (if the level allows another car)
    if (rv.z > c.z + 6 && rv.z - c.z < C.parkedActivateRange && sim.phase === 'drive' && !sim.heat.gaveUp) {
      if (this.activeCount() < sim.heat.level().maxCops + 1) { c.parked = false; c.state = 1; }
      else c.state = 5;
    }
  }

  _avoid(c, tx, tz) {
    // weak avoidance: if something solid sits right in our path, aim beside it (motos look further, weave)
    const sim = this.sim;
    const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
    const moto = c.kind === 'moto_cop';
    let best = null, bestD = moto ? 30 : 22;
    const check = (o, r) => {
      const dx = o.x - c.x, dz = o.z - c.z;
      const along = dx * s + dz * co;
      if (along < 2 || along > bestD) return;
      const lat = -dx * co + dz * s;
      if (Math.abs(lat) > r + c.r + 0.6) return;
      best = { o, lat, r }; bestD = along;
    };
    for (const o of sim.obstacles.list) if (o.solid && o.state === 0 && !o.falling && Math.abs(o.z - c.z) < 32) check(o, o.r + o.hl);
    for (const o of sim.traffic.cars) if (Math.abs(o.z - c.z) < 32 && (moto || o.state !== 0 || Math.abs(o.speed) < Math.abs(c.speed) - 4)) check(o, o.wid / 2 + 0.5);
    if (!best) return [tx, tz];
    const side = best.lat > 0 ? -1 : 1; // lat>0 means obstacle on our right → go left (-right)
    const off = (best.r + c.r + 1.2) * side;
    // right vector (-cos, sin)
    return [tx + -co * off, tz + s * off];
  }

  _topSpeed(c, level) {
    const H = this.sim.rules.heat;
    if (c.kind === 'moto_cop') return H.moto?.topSpeed ?? 38;
    if (c.kind === 'rhino_truck') return H.rhino?.topSpeed ?? 33;
    const base = level.copTopSpeed || 28;
    return c.kind === 'interceptor' ? base + 3 : base;
  }

  _chase(c, level, dt) {
    const sim = this.sim, rv = sim.rv, C = sim.cfg.cops, road = sim.road;
    let top = this._topSpeed(c, level);
    // redirected (the Midnight Comet): chase that target instead
    if (this.redirect) {
      let tgt = null;
      try { tgt = this.redirect.fn(c); } catch (e) { tgt = null; }
      if (tgt && Number.isFinite(tgt.x) && Number.isFinite(tgt.z)) {
        c.redirected = true; c.ramT = 0;
        let [tx, tz] = this._avoid(c, tgt.x, tgt.z);
        const d = Math.hypot(tgt.x - c.x, tgt.z - c.z);
        aiDrive(c, tx, tz, Math.min(top + 2, 6 + d * 0.8), this._Pof(c), dt);
        return;
      }
    }
    const s = Math.sin(rv.yaw), co = Math.cos(rv.yaw);
    const rx = -co, rz = s;
    const rvSpeed = Math.abs(rv.speed);
    const dx = c.x - rv.x, dz = c.z - rv.z;
    const dist = Math.hypot(dx, dz);
    const along = dx * s + dz * co; // >0: cop ahead of the RV
    c.ramCd -= dt;
    let slotAlong, slotLat;
    const slow = rvSpeed < sim.rules.heat.bust.maxRvSpeed + 3;
    if (slow) { slotAlong = 0.5; slotLat = c.side * 3.4; }
    else if (level.ram) { slotAlong = -1.0; slotLat = c.side * C.sideOffset; }
    else { slotAlong = -C.followDist - 2; slotLat = 0; }
    // keep the slot on drivable ground (and on our side of a median); flip side if it falls off the road
    let sx = rv.x + s * slotAlong + rx * slotLat, sz = rv.z + co * slotAlong + rz * slotLat;
    const su = road.uAt(sx, sz), rvU = road.uAt(rv.x, rv.z), mh = road.median(sz);
    const crossesMedian = mh > 0 && Math.sign(su) !== Math.sign(rvU);
    if ((Math.abs(su) > road.hw(sz) + road.sh(sz) + 4 || crossesMedian) && slotLat !== 0) {
      c.side = -c.side; slotLat = -slotLat;
      sx = rv.x + s * slotAlong + rx * slotLat; sz = rv.z + co * slotAlong + rz * slotLat;
    }
    let tx, tz, v;
    const sdx = sx - c.x, sdz = sz - c.z;
    const slotAlongErr = sdx * s + sdz * co;
    const dSlot = Math.hypot(sdx, sdz);
    // approach speed: RV speed + what we can still brake away over the remaining distance
    const closing = (d) => Math.sqrt(2 * C.brake * 0.55 * Math.max(0, d));
    if (c.ramT > 0) {
      c.ramT -= dt;
      tx = rv.x + s * 1.5; tz = rv.z + co * 1.5; v = rvSpeed + 4;
    } else {
      if (along < -25 || dist > 40) {
        // far: chase a point a bit ahead of the RV
        const lead = clamp(rvSpeed * 0.6, 4, 16);
        tx = rv.x + s * lead + rx * slotLat * 0.5; tz = rv.z + co * lead + rz * slotLat * 0.5;
        v = top + (dist > C.rubberBandFrom && sim.heat.stars >= (C.rubberBandMinStars ?? 3) ? C.rubberBand : 0);
        v = Math.min(v, rvSpeed + closing(dist - 6));
      } else if (slow) {
        // box the RV in: drive to the slot beside it, reversing if we overshot
        const ownAlong = sdx * Math.sin(c.yaw) + sdz * Math.cos(c.yaw);
        tx = sx; tz = sz;
        if (ownAlong < -1.0 && dSlot < 16) v = -Math.min(5, 1 + dSlot * 0.6);
        else { tx = sx + s * 3; tz = sz + co * 3; v = dSlot < 1.2 ? 0 : Math.min(top, rvSpeed + closing(dSlot - 0.8)); }
      } else {
        tx = sx + s * 8; tz = sz + co * 8;
        v = clamp(rvSpeed + Math.sign(slotAlongErr) * Math.min(10, closing(Math.abs(slotAlongErr))), 0, top + 2);
      }
      // oncoming cop still facing us: drive past, it will U-turn when the target is behind
      if (level.ram && !slow && c.ramCd <= 0 && this.ramGlobalCd <= 0 && Math.abs(slotAlongErr) < 3 && rvSpeed > 6 && dist < C.ramRange) {
        const lat = (c.x - rv.x) * rx + (c.z - rv.z) * rz;
        if (Math.abs(lat) < 5.5) {
          c.ramT = C.ramSeconds; c.ramCd = C.ramCooldown + this.rng.float(0, 1.5); c.ramHit = false;
          this.ramGlobalCd = C.ramGlobalCooldown ?? 3.5;
        }
      }
    }
    if (c.ramT <= 0 && v > 0) [tx, tz] = this._avoid(c, tx, tz);
    if (sim.rv.grace > 0) v = Math.min(v, rvSpeed);
    // stop at the broken bridge no matter what
    const br = sim.route.bridge;
    if (br && c.z > br.rampStart - 120) v = Math.min(v, Math.max(0, (br.rampStart - C.stopBeforeRamp - c.z) * 0.6));
    aiDrive(c, tx, tz, v, this._Pof(c), dt);
  }

  // ── the Rhino ──────────────────────────────────────────────────────────────
  _rhino(c, level, dt) {
    const sim = this.sim, rv = sim.rv, road = sim.road, C = sim.cfg.cops, Rh = sim.rules.heat.rhino || {};
    const top = this._topSpeed(c, level);
    if (this.redirect) {
      let tgt = null;
      try { tgt = this.redirect.fn(c); } catch (e) { tgt = null; }
      if (tgt && Number.isFinite(tgt.x)) { c.redirected = true; aiDrive(c, tgt.x, tgt.z, top, this._PR, dt); return; }
    }
    const s = Math.sin(rv.yaw), co = Math.cos(rv.yaw);
    const rvSpeed = Math.abs(rv.speed);
    const along = (c.x - rv.x) * s + (c.z - rv.z) * co;
    const rvU = road.uAt(rv.x, rv.z), myU = road.uAt(c.x, c.z);
    const aheadD = c.aheadD ?? 35;
    let tz, u, v;
    const n = road.lanesPerDir(c.z);
    const mh = road.median(c.z) > 0;
    if (along < aheadD - 6) {
      // overtake in a lane beside the RV, then cut in
      const passU = (() => {
        const lanes = [];
        for (let r = 0; r < n; r++) lanes.push(road.laneU(c.z, 1, r));
        if (!mh) for (let r = 0; r < n; r++) lanes.push(road.laneU(c.z, -1, r));
        let best = lanes[0], bd = -1;
        for (const lu of lanes) { const d = Math.abs(lu - rvU); if (d > 2.6 && (bd < 0 || d < bd)) { bd = d; best = lu; } }
        return bd < 0 ? rvU + 3.6 : best;
      })();
      u = along > -8 && along < 8 ? passU : (Math.abs(myU - rvU) > 2.6 ? myU : passU);
      tz = c.z + 14;
      const rb = along < -90 ? (C.rubberBand ?? 5) : 0;
      v = top + rb;
      c.ahead = false;
    } else {
      // hold the slot ahead in the RV's lane and lob canisters back
      u = clamp(rvU, -road.hw(c.z) + 1.5, road.hw(c.z) - 1.5);
      if (mh && Math.sign(u) !== Math.sign(myU)) u = myU;
      tz = c.z + 14;
      v = clamp(rvSpeed + (aheadD - along) * 0.6, 0, top);
      c.ahead = true;
    }
    const br = sim.route.bridge;
    if (br && c.z > br.rampStart - 120) v = Math.min(v, Math.max(0, (br.rampStart - C.stopBeforeRamp - c.z) * 0.6));
    let [tx, tzz] = this._avoid(c, road.xAt(tz, u), tz);
    aiDrive(c, tx, tzz, v, this._PR, dt);
    // throwing: 'rhinoLob' {id} ~0.6 s before each throw (the renderer opens the doors / swings the lobber)
    c.throwT = (c.throwT ?? 3) - dt;
    const out = this.canisters.filter((k) => k.state < 2).length;
    const inPos = sim.phase === 'drive' && along > 10 && along < 80 && out < (Rh.maxCanistersOut ?? 3);
    if (c.throwT <= 0.6 && !c.lobbing && inPos) { c.lobbing = true; sim.emit({ type: 'rhinoLob', id: c.id }); }
    if (c.throwT <= 0 && c.lobbing) {
      c.lobbing = false;
      c.throwT = (Rh.throwEvery ?? 5.5) * (0.85 + this.rngRhino.float(0, 0.3));
      if (inPos) this._throwCanister(c, Rh);
    } else if (c.throwT <= 0) c.throwT = 0.6;
  }

  _throwCanister(c, Rh) {
    const sim = this.sim, rv = sim.rv, road = sim.road, rng = this.rngRhino;
    const foam = rng.chance(0.5);
    const F = foam ? (Rh.foam || {}) : (Rh.flash || {});
    const flight = 0.9;
    // aim where the RV will be when it goes off (flight + about half the fuse), on the road
    const lead = flight + (F.fuse ?? 0.6) * 0.6;
    let tzz = rv.z + rv.vz * lead, txx = rv.x + rv.vx * lead;
    const back = c.z - 6;
    if (tzz > back) tzz = back;
    if (tzz < rv.z + 6) tzz = rv.z + 6 + rng.float(0, 4);
    const tu = clamp(road.uAt(txx, tzz) + rng.float(-1.5, 1.5), -road.hw(tzz) + 0.5, road.hw(tzz) - 0.5);
    txx = road.xAt(tzz, tu);
    const sx = c.x - Math.sin(c.yaw) * 3.0, sz = c.z - Math.cos(c.yaw) * 3.0, sy = 2.6;
    const g = sim.g, vy = (0 - sy + 0.5 * g * flight * flight) / flight;
    const k = {
      id: sim.newId(), variant: foam ? 1 : 0, x: sx, y: sy, z: sz, vx: (txx - sx) / flight, vz: (tzz - sz) / flight, vy,
      yaw: c.yaw, state: 0, t: 0, fuse: F.fuse ?? 0.6, dud: false, owner: c.id,
    };
    this.canisters.push(k);
    this.canisterCount++;
  }

  _updateCanisters(dt) {
    const sim = this.sim, rv = sim.rv, road = sim.road, Rh = sim.rules.heat.rhino || {};
    for (const k of this.canisters) {
      k.t += dt;
      if (k.state === 0) {
        k.vy -= sim.g * dt; k.x += k.vx * dt; k.z += k.vz * dt; k.y += k.vy * dt; k.yaw += 9 * dt;
        const gy = road.surfaceY(k.z) ?? -50;
        if (k.y <= gy + 0.08 && k.vy < 0) { k.y = gy + 0.08; k.state = 1; k.t = 0; k.vx = k.vz = 0; }
        if (k.y < -20) k.gone = true;
      } else if (k.state === 1) {
        if (k.t >= k.fuse) {
          k.state = 2; k.t = 0;
          if (k.dud || sim.phase !== 'drive') { k.gone = true; continue; }
          this._burst(k, Rh);
        }
      } else if (k.state === 2) {
        if (k.t > 0.7) k.gone = true;
      }
    }
    this.canisters = this.canisters.filter((k) => !k.gone && Math.abs(k.z - rv.z) < 400);
  }

  _burst(k, Rh) {
    const sim = this.sim, rv = sim.rv;
    const dx = rv.x - k.x, dz = rv.z - k.z, d = Math.hypot(dx, dz);
    if (k.variant === 0) {
      const F = Rh.flash || {};
      const R = F.radius ?? 7;
      const hit = d < R + rv.hl * 0.6 && !(rv.airborne && rv.y > 3);
      if (hit) {
        const f = clamp(1 - d / (R + rv.hl), 0.35, 1);
        sim.damageRv((F.damage ?? 8) * f, 'flashbang');
        // sideways shove (away from the burst, across the RV's heading)
        const rx = -Math.cos(rv.yaw), rz = Math.sin(rv.yaw);
        const sideSign = (dx * rx + dz * rz) >= 0 ? 1 : -1;
        const p = (F.push ?? 7) * f;
        sim.pushRv(rx * sideSign * p, rz * sideSign * p, 0.15);
        sim.addBump(0.6);
        sim.setFx({ flash: 1 }, F.whiteout ?? 0.55);
      } else if (d < R * 2.5) sim.setFx({ flash: clamp(0.8 - d / (R * 3), 0.1, 0.6) }, 0.15);
      // it dazzles cops too
      for (const c of this.cops) {
        if (c.kind === 'heli' || c.state !== 1 || c.kind === 'rhino_truck') continue;
        if (Math.hypot(c.x - k.x, c.z - k.z) < R) this.blind(c, 2);
      }
      sim.emit({ type: 'canister', kind: 'flash', x: k.x, z: k.z, hitRv: hit });
    } else {
      const F = Rh.foam || {};
      sim.obstacles.add('foam_patch', k.x, k.z, { yaw: k.yaw, src: 'foam', life: F.patchSeconds ?? 30, r: F.radius ?? undefined });
      const hit = d < (F.radius ?? 5) + rv.hl * 0.5;
      if (hit) { rv.foamT = Math.max(rv.foamT, F.seconds ?? 3); rv.foamTo = F.slowTo ?? 4; }
      sim.emit({ type: 'canister', kind: 'foam', x: k.x, z: k.z, hitRv: hit });
    }
  }

  _plunge(c, dt) {
    const road = this.sim.road;
    const tz = c.z + 30;
    aiDrive(c, road.xAt(tz, road.uAt(c.x, c.z) * 0.9), tz, 34, this._Pof(c), dt);
  }

  _blinded(c, dt, slow = 0.4) {
    const road = this.sim.road;
    c.timer -= dt;
    if (c.parked) { coastBody(c, 12, 4, dt); }
    else {
      const wob = Math.sin(this.sim.t * 1.7 + c.id) * 3;
      const dir = Math.cos(c.yaw - road.heading(c.z)) >= 0 ? 1 : -1;
      const tz = c.z + dir * 14;
      aiDrive(c, road.xAt(tz, road.uAt(c.x, c.z) + wob), tz, Math.abs(c.speed) * (1 - slow * dt * 3), this._Pof(c), dt);
    }
    if (c.timer <= 0) this._recover(c);
  }

  // soaked (the hose): wipers flailing — back off from the RV and don't come closer
  _soaked(c, dt) {
    const sim = this.sim, rv = sim.rv;
    c.timer -= dt;
    const dx = c.x - rv.x, dz = c.z - rv.z, d = Math.hypot(dx, dz) || 1;
    if (d < (sim.cfg.cops.soakBackOff ?? 14)) {
      // away from the RV: forward if we face away, else reverse
      const ax = dx / d, az = dz / d;
      const fwd = Math.sin(c.yaw) * ax + Math.cos(c.yaw) * az;
      const tx = c.x + ax * 10, tz = c.z + az * 10;
      if (fwd >= 0) aiDrive(c, tx, tz, 4, this._Pof(c), dt);
      else aiDrive(c, tx, tz, -3.5, this._Pof(c), dt);
      c.parked = false;
    } else coastBody(c, 9, 3, dt);
    if (c.timer <= 0) this._recover(c);
  }

  _stalled(c, dt) {
    c.timer -= dt;
    coastBody(c, c.parked ? 12 : 6, 2, dt);
    if (c.timer <= 0) this._recover(c);
  }

  _recover(c) {
    c.timer = 0;
    c.state = c.prevState === 0 && c.parked ? 0 : 1;
  }

  _gaveUp(c, dt) {
    const sim = this.sim, road = sim.road, br = sim.route.bridge, C = sim.cfg.cops;
    const dir = Math.cos(c.yaw - road.heading(c.z)) >= 0 ? 1 : -1;
    let v = Math.max(0, Math.abs(c.speed) - 8 * dt);
    if (br && dir > 0 && c.z < br.lip + 5) {
      const stopZ = br.rampStart - C.stopBeforeRamp;
      v = Math.min(v, Math.max(0, (stopZ - c.z) * 0.7));
    }
    const tz = c.z + dir * 12;
    const u = road.uAt(c.x, c.z);
    aiDrive(c, road.xAt(tz, u), tz, v, this._Pof(c), dt);
  }

  // ── contact with the RV (called by GameSim collisions) ─────────────────────
  rvContact(o, vn, rvAggressor) {
    const sim = this.sim, R = sim.rules.rv, H = sim.rules.heat, C = sim.cfg.cops;
    const rammedByCop = o.ramT > 0;
    if (o.ramT > 0 && !o.ramHit && o.state === 1) {
      o.ramHit = true; o.ramT = 0;
      const dmg = o.kind === 'cop_suv' ? H.suvRamDamage : o.kind === 'moto_cop' ? (H.moto?.ramDamage ?? 3) : o.kind === 'interceptor' ? H.copRamDamage + 2 : H.copRamDamage;
      sim.damageRv(dmg, 'ram');
      sim.addBump(o.kind === 'moto_cop' ? 0.3 : 0.7);
      sim.emit({ type: 'crash', x: o.x, z: o.z, power: o.kind === 'moto_cop' ? 0.25 : 0.5 });
    } else if (vn > R.minCrashSpeed) {
      const k = o.kind === 'moto_cop' ? 0.15 : o.kind === 'rhino_truck' ? 1.2 : 0.6;
      sim.damageRv(R.crashDamagePerMps * (vn - R.minCrashSpeed) * k, 'crash');
      sim.addBump(clamp(vn / 15, 0.2, 1));
      sim.emit({ type: 'crash', x: o.x, z: o.z, power: clamp(vn / 25, 0.1, 1) });
    }
    if (o.kind === 'rhino_truck') {
      // armoured: ramming it hurts you
      if (rvAggressor && vn > 3 && o.hitCd <= 0) sim.damageRv((H.rhino?.ramDamage ?? 14) * clamp(vn / 14, 0.3, 1.2), 'rhino');
      if (vn > 1.5) this.damage(o, vn * C.damageMult * 0.25);
    } else if (o.kind === 'moto_cop') {
      // a ram knocks the rider over
      if ((rvAggressor && vn > 1.5) || vn > 5) this.damage(o, 999);
      else if (vn > 1) this.damage(o, vn * C.damageMult);
    } else if (vn > 1.5) this.damage(o, vn * C.damageMult * (rammedByCop ? 0.5 : 1));
    // the RV ramming a police car (not being rammed / boxed in by one) is assaulting an officer → heat
    if (rvAggressor && !rammedByCop && vn > (C.copRamHeatMinSpeed ?? 4) && o.hitCd <= 0 && o.state !== 4) { o.hitCd = C.copRamHeatCooldown ?? 4; sim.heat.incident(H.sources.copRam, 'copRam'); }
    if (o.state === 0 && o.parked && vn > 2) { o.parked = false; o.state = 1; }
  }

  // ── damage / gadgets / plugin effects ────────────────────────────────────────
  damage(c, amount) {
    if (c.kind === 'heli' || c.state === 4 || !(amount > 0)) return;
    c.hp -= amount;
    if (c.hp <= 0) {
      c.state = 4; c.parked = false; c.plunge = false; c.ramT = 0;
      if (c.kind === 'moto_cop') { c.w += this.rng.sign() * 2.5; }
      this._wreckScore(c);
      this.sim.emit({ type: 'copWreck', x: c.x, z: c.z, kind: c.kind });
      if (c.kind === 'rhino_truck') this.sim.emit({ type: 'msg', text: 'The Rhino is down!', tone: 'good' });
    }
  }
  _wreckScore(c) {
    const sim = this.sim;
    if (c.scored) return;
    c.scored = true;
    sim.score.points += sim.rules.scoring.copWreckPoints * (c.kind === 'rhino_truck' ? 3 : c.kind === 'moto_cop' ? 0.5 : 1);
    sim.score.copsWrecked++;
  }

  blind(c, seconds) {
    if (c.kind === 'heli' || c.state === 4 || c.state === 5 || c.smokeCd > 0) return;
    if (!DISABLED.has(c.state) && c.state !== 2) c.prevState = c.state === 0 && c.parked ? 0 : 1;
    c.state = 2; c.timer = seconds; c.ramT = 0; c.smokeCd = seconds + 1;
    if (c.prevState !== 0) c.parked = false;
  }
  spinOut(c, seconds) {
    if (c.kind === 'heli' || c.state === 4 || c.oilCd > 0) return;
    c.state = 3; c.timer = seconds; c.ramT = 0; c.parked = false; c.oilCd = seconds + 1.5;
    c.w += this.rng.sign() * (c.kind === 'rhino_truck' ? 1.2 : 3.5 + this.rng.float(0, 2));
  }

  // sim.applyCopEffect(id, { push:{x,z}, soak, stall, blind, damage })
  applyEffect(id, eff) {
    const c = this.cops.find((x) => x.id === id && !x.dead);
    if (!c) return false;
    if (eff.push) { c.vx += +eff.push.x || 0; c.vz += +eff.push.z || 0; }
    if (eff.damage > 0) this.damage(c, +eff.damage);
    if (c.kind === 'heli' || c.state === 4 || c.state === 5) return true;
    let state = 0, secs = 0;
    if (eff.stall > 0) { state = 7; secs = +eff.stall; }
    else if (eff.blind > 0) { state = 8; secs = +eff.blind; }
    else if (eff.soak > 0) { state = 6; secs = +eff.soak; }
    if (state) {
      if (!DISABLED.has(c.state) && c.state !== 2 && c.state !== 3) c.prevState = c.state === 0 && c.parked ? 0 : 1;
      c.timer = c.state === state ? Math.max(c.timer, secs) : secs;
      c.state = state; c.ramT = 0;
    }
    return true;
  }

  pushEnts(out) {
    for (const c of this.cops) out.push([c.id, c.kid, c.x, c.y, c.z, c.yaw, c.variant, c.state]);
    const kid = KIND_ID.flashbang;
    for (const k of this.canisters) out.push([k.id, kid, k.x, k.y, k.z, k.yaw, k.variant, k.state]);
  }
}
