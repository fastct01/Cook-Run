// ─────────────────────────────────────────────────────────────────────────────
// GameSim — the authoritative Cook & Run simulation (host side). Pure logic:
// no DOM, no three.js, no Math.random (seeded Rng streams), fixed dt = 1/60.
//
//   const sim = new GameSim(data, { seed, solo });
//   sim.step(input, dt)          DriverInput; dt = 1/60 (larger dt is sub-stepped)
//   sim.snapshot()               full Snapshot; drains the LOCAL event queue
//   sim.netSnapshot()            compact Snapshot (ents near the RV, numbers 2 dp) +
//                                events drained from the NET queue
//   sim.drainNetEvents()         → events since the last net drain
//   sim.applyCookCommand(cmd)    CookCommand (protocol.js CMD): lab · roof* · avatar*
//   sim.applyDriverCommand(cmd)  DCMD (driver-local): shopDone · shopAbort · skipTutorial
//   sim.setLabState(lab)         LabState
//   sim.phase, sim.result        'garage'|'countdown'|'drive'|'won'|'lost'; EndResult when over
// Every emitted event goes to BOTH queues (local + net). Each queue is capped
// at 256 (oldest dropped) so an undrained queue can't grow forever.
//
// Phases (EXPANSION_CONTRACT.md): 'garage' (route.start.garage: the on-foot tutorial,
// sim/garage.js; the RV is parked inside Rook's Garage and static) → 'countdown'
// (rules.sim.garageCountdownSeconds, 1.5 s) → 'drive' → 'won' | 'lost'.
// DriverInput gains moveX, moveZ (world-space on-foot vector −1..1), interact
// (edge-triggered) and interactHeld (level: true while E is held — the engine crank);
// the whole input is passed to garage.update(dt, input) in the garage phase.
//
// ── HELPER API for plugins (set-pieces, garage tutorial, roof defence) ─────────
// Plugins use ONLY these (Unity: an ISimServices interface):
//   sim.rv                     { x, y, z, yaw, speed, vx, vz, hp, airborne, … }   READ ONLY
//   sim.track, sim.time (s), sim.data, sim.seed, sim.phase, sim.rules, sim.road
//   sim.newId()                → unique entity id (shared counter with every system)
//   sim.kindId(kind)           → KIND_ID[kind] (protocol.js), −1 if unknown
//   sim.emit(ev)               push an event to both queues ({ type, … })
//   sim.msg(text, tone='info') HUD toast ('info'|'good'|'bad')
//   sim.damageRv(amount, cause)          RV hp (drive phase only; respects respawn grace)
//   sim.pushRv(dx, dz, speedLoss = 0)    velocity kick in m/s (world XZ); speedLoss 0..1 =
//                                        fraction of the current velocity removed first
//   sim.addHeat(amount, reason)          wanted level (+); a negative amount lowers it
//   sim.dropStars(n, reason)             −n stars (value −n, ≥ 0) + EV.heatDrop {stars, reason}
//   sim.copsList()             → [{ id, kind, x, y, z, yaw, speed, state }] (no wrecked/despawned)
//   sim.applyCopEffect(id, { push:{x,z}, soak:s, stall:s, blind:s, damage })
//                              soak → state 6 (hose), stall → 7 (firecracker), blind → 8
//                              (paint); timers in seconds; disabled cops don't bust/block.
//   sim.redirectCops(fn, seconds)   chasing cops drive to fn(cop) → {x,z} | null (null =
//                              chase the RV as usual) for `seconds` (the Midnight Comet)
//   sim.setFx({ fog, flash, shock }, hold = 0)   max-merged into snapshot.fx (0..1). Values
//                              decay (fog 0.45/s, flash 1.4/s, shock 2.2/s) after `hold` s:
//                              call every step to keep an effect up.
//   sim.spawnTrafficCar(kind, x, z, yaw, speed) → id   (any rules.traffic kind; it then
//                              drives in the nearest lane in its heading's direction)
//   sim.trafficList()          → [{ id, kind, x, z, yaw, speed, state }]
//   sim.applyTrafficEffect(id, { push:{x,z}, crash:bool, launch:vy, remove:bool })
//   sim.surfaceAt(z)           drivable height (set-piece surface first, then the Track);
//                              null = gap
//   sim.laneBlocked(z, u)      set-piece lane blocking (traffic + autopilot honour it)
//   sim.respawnRv(z, reason)   put the RV back on the road at z (forward lane, 0 speed, grace)
//   sim.takeProduct(n) → taken · sim.addPoints(n, reason) · sim.heatStars()
//   sim.gadgetZones() → [{ kind, x, z, r, age }] · sim.useGadget(kind, { x, z, place }) → bool
//   sim.stop → null | { id, name, state, shopType }   (the supply-stop state machine)
// Set-piece colliders (host.colliders): circles { x, z, r, solid?, damage?, kind?, onHit?,
//   vx?, vz?, id? }. solid === true blocks vehicles; otherwise it is a trigger. `damage`
//   hits the RV (solid: scaled by impact speed; trigger: once per contact). onHit(sim,
//   { by: 'rv'|'cop'|'car', id, speed }) is called once per contact (0.8 s cooldown).
//
// ── Snapshot: base contract in shared/protocol.js + EXPANSION_CONTRACT.md ──────
// {
//   ...protocol Snapshot...,
//   phase, garage: null | garage.state(),  stop: null | { id, name, shopType, state,
//     shopT, shopMax, loadT, loadTime, progress, blocked, copDist, score, ok, bonus, side,
//     roof: roof.state() },
//   nearStop: null | { id, name, dist, side, z, shopType }   (within rules.stops.bannerDist)
//   timeOfDay: hour, area: { id, name }, fx: { fog, flash, shock },
//   setpieces: [ host.state() … ], roof: roof.state() (also in stop.roof),
//   rv:     { ..., zone: 'road'|'shoulder'|'dirt'|'lot', drift, handbrake, horn, grace,
//             regen: bool, roofDoc: bool, slip: bool, foam: bool, shock: bool },
//   crew:   { driver, cook, cookDown }, heat: { ..., unseen }, inv: { ..., value },
//   bridge: { dist, speedNeeded, lip, launchSpeed, cleared, falls },
//   weather: 'clear'|'dust', train: null | { z, state, dist }, sell: { x, z, dist, radius },
//   looted: [stopId], closed: [stopId], maxStars, redirect: s left of a cop redirect
// }
// Entity states: see protocol.js; cops 6 soaked, 7 stalled, 8 paint-blind; flashbang
//   0 flying (y>0) · 1 armed on the ground · 2 burst, variant 0 flash · 1 foam.
// ─────────────────────────────────────────────────────────────────────────────
import { KIND_ID } from '../shared/protocol.js';
import { Track } from './track.js';
import { Rng, hashSeed } from './rng.js';
import { Road } from './road.js';
import { buildSimConfig } from './config.js';
import { FIXED_DT, clamp, roundDeep } from './util.js';
import { capsuleCapsule, capsuleCircle, resolveBodies, resolveStatic, updateCapsule } from './collisions.js';
import { createRv, placeRv, forwardLaneU, updateRvControl, updateRvVertical, constrainRv } from './vehicle.js';
import { TrafficSystem } from './traffic.js';
import { PedSystem } from './peds.js';
import { ObstacleSystem } from './obstacles.js';
import { CopSystem } from './cops.js';
import { HeatSystem } from './heat.js';
import { StopSystem } from './stops.js';
import { RouteEvents } from './events.js';
import { BridgeSystem } from './bridge.js';
import { GadgetSystem } from './gadgets.js';
import { LabLink } from './lab.js';
import { ScoringSystem } from './scoring.js';
import { StructureSystem } from './structures.js';

// ── optional plugin modules: a missing or throwing module never takes the sim down ──
async function optionalImport(spec) {
  try { return await import(spec); } catch (e) { console.warn(`[sim] optional module ${spec} failed to load:`, e && e.message ? e.message : e); return null; }
}
const [HOST_MOD, GARAGE_MOD, ROOF_MOD] = await Promise.all([
  optionalImport('./setpieces/host.js'), optionalImport('./garage.js'), optionalImport('./roof.js'),
]);

class NullSetPieceHost {
  constructor(sim) { this.sim = sim; this.active = []; }
  update() {} ents(out) { return out; } colliders(out) { return out; }
  surfaceY() { return undefined; } laneBlocked() { return false; } state() { return []; } resetBehind() {}
}
class StubGarage {
  constructor(sim) { this.sim = sim; this.done = true; }
  update() {} command() {} state() { return null; }
}
const ROOF_IDLE = Object.freeze({ active: false, aimYaw: 0, aimPitch: 0, spray: false, ammo: { firecracker: 0, balloon: 0, flare: 0 } });
class StubRoof {
  constructor(sim) { this.sim = sim; this.active = false; }
  command() {} update() {} state() { return { ...ROOF_IDLE, ammo: { ...ROOF_IDLE.ammo } }; }
}
const SetPieceHostCls = HOST_MOD?.SetPieceHost ?? NullSetPieceHost;
const GarageCls = GARAGE_MOD?.GarageTutorial ?? StubGarage;
const RoofCls = ROOF_MOD?.RoofDefence ?? StubRoof;

const EVENT_CAP = 256;
const _con = { nx: 0, nz: 0, depth: 0, px: 0, pz: 0 };
const NO_INPUT = Object.freeze({ throttle: 0, steer: 0, handbrake: false, horn: false, smoke: false, oil: false, nitro: false, reset: false, moveX: 0, moveZ: 0, interact: false });
const HOLD_INPUT = Object.freeze({ ...NO_INPUT, handbrake: true });
const FX_DECAY = { fog: 0.45, flash: 1.4, shock: 2.2 };
const FX_KEYS = ['fog', 'flash', 'shock'];
const ROOF_CMDS = new Set(['roofEnter', 'roofLeave', 'roofAim', 'roofThrow']);
const AVATAR_CMDS = new Set(['avatarMove', 'avatarAct']);

export class GameSim {
  constructor(data, opts = {}) {
    this.data = data;
    this.route = data.route;
    this.rules = data.rules;
    this.seed = (opts.seed ?? data.route.defaultSeed ?? 1) >>> 0;
    this.solo = !!opts.solo;
    this.cfg = buildSimConfig(data.rules);
    this.g = data.route.bridge?.gravity ?? 9.81;
    this.track = new Track(data.route, this.seed);
    this.road = new Road(this.track);
    this.roadworks = this.track.roadworks();

    // independent deterministic RNG streams per system (adding calls in one system never shifts another)
    this.rngTraffic = new Rng(hashSeed(this.seed, 101));
    this.rngPeds = new Rng(hashSeed(this.seed, 202));
    this.rngCops = new Rng(hashSeed(this.seed, 303));
    this.rngEvents = new Rng(hashSeed(this.seed, 404));
    this.rngFx = new Rng(hashSeed(this.seed, 505));
    this.rngHazards = new Rng(hashSeed(this.seed, 707));

    this._nextId = 1;
    this._evLocal = [];
    this._evNet = [];
    this._errs = {};
    this.t = 0;
    this.driveTime = 0;
    this.phase = 'countdown';
    this.countdown = this.cfg.countdownSeconds;
    this.lostReason = null;
    this.result = null;
    this.weather = 'clear';
    this.stepCount = 0;
    this.fx = { fog: 0, flash: 0, shock: 0 };
    this._fxHold = { fog: 0, flash: 0, shock: 0 };
    this.lastDamageT = -999;
    this.falls = 0;
    this._spCols = [];
    this._spHit = new Map();

    const R = this.rules.rv;
    this.crew = { driver: R.crewMaxHp, cook: R.crewMaxHp, cookDown: false };
    this.score = { points: 0, chaos: 0, knocked: 0, smashed: 0, copsWrecked: 0 };
    const sg = this.cfg.startGadgets || {};
    this.inv = {
      mat: { ...(data.lab.startInventory || {}) }, units: 0, quality: 0,
      gadgets: { smoke: sg.smoke | 0, oil: sg.oil | 0, nitro: sg.nitro | 0 }, value: 0,
    };
    this.lab = { cooking: false, recipeId: null, step: 0, stepType: null, temp: 0, fumes: 0, fire: 0, ventOpen: false, curtains: false, cookHurt: 0 };
    this.feel = { latAcc: 0, bump: 0, speed: 0 };
    this.alert = { copClose: false, copDist: 999 };

    this.rv = createRv(this);
    this.structures = new StructureSystem(this);
    const z0 = this.route.start.z;
    const gar = this.route.start.garage && this.structures.garage;
    if (gar) { const p = gar.park; placeRv(this, p.z, null, p.yaw, p.x); }
    else placeRv(this, z0, forwardLaneU(this.road, z0));

    // systems (order matters only for construction-time dependencies)
    this.stops = new StopSystem(this);
    this.obstacles = new ObstacleSystem(this);
    this.heat = new HeatSystem(this);
    this.cops = new CopSystem(this);
    this.traffic = new TrafficSystem(this);
    this.peds = new PedSystem(this);
    this.events = new RouteEvents(this);
    this.bridgeSys = new BridgeSystem(this);
    this.gadgets = new GadgetSystem(this);
    this.labLink = new LabLink(this);
    this.scoring = new ScoringSystem(this);

    // plugins (EXPANSION_CONTRACT.md §Sim hooks)
    this.setpieces = this._construct(SetPieceHostCls, NullSetPieceHost, 'setpieces');
    this.road.overlay = (z) => this._spSurface(z);
    this.roof = this._construct(RoofCls, StubRoof, 'roof');
    this.garage = null;
    if (this.route.start.garage) {
      this.phase = 'garage';
      this.countdown = this.cfg.garageCountdownSeconds ?? 1.5;
      this.garage = this._construct(GarageCls, StubGarage, 'garage');
      // the tutorial owns the RV's parking spot (falls back to the structure layout)
      const p = this.garage.rvPark;
      if (p && Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.yaw) && gar && Math.hypot(p.x - gar.park.x, p.z - gar.park.z) < 4) placeRv(this, p.z, null, p.yaw, p.x);
      if (this.garage.done) this._endGarage();
    }

    this.biomeId = this.road.biome(this.rv.z).id;
    const b = this.road.biome(this.rv.z);
    this.emit({ type: 'biome', id: b.id, name: b.name });
    // pre-warm the world so the first frame isn't empty
    this.obstacles.update(0);
  }

  _construct(Cls, Fallback, tag) {
    try { return new Cls(this); } catch (e) { this._plugErr(tag, e, true); return new Fallback(this); }
  }
  _plugErr(tag, e, fatal = false) {
    const n = (this._errs[tag] = (this._errs[tag] || 0) + 1);
    if (n <= 3) console.error(`[sim] ${tag} threw:`, e);
    if (!fatal && n >= 30) {
      // a plugin that keeps throwing is swapped for its stub so the game goes on
      if (tag.startsWith('garage') && !(this.garage instanceof StubGarage)) { this.garage = new StubGarage(this); console.error('[sim] garage tutorial disabled after repeated errors'); }
      if (tag.startsWith('roof') && !(this.roof instanceof StubRoof)) { this.roof = new StubRoof(this); console.error('[sim] roof defence disabled after repeated errors'); }
      if (tag.startsWith('setpieces') && !(this.setpieces instanceof NullSetPieceHost)) { this.setpieces = new NullSetPieceHost(this); console.error('[sim] set-pieces disabled after repeated errors'); }
    }
  }
  _spSurface(z) {
    try { return this.setpieces.surfaceY(z); } catch (e) { this._plugErr('setpieces.surfaceY', e); return undefined; }
  }
  _safeGarageState() {
    if (!this.garage) return null;
    try { return this.garage.state() ?? null; } catch (e) { this._plugErr('garage.state', e); return null; }
  }
  _roofState() {
    try { return this.roof.state(); } catch (e) { this._plugErr('roof.state', e); return { ...ROOF_IDLE, ammo: { ...ROOF_IDLE.ammo } }; }
  }
  _endGarage() {
    if (this.phase !== 'garage') return;
    this.phase = 'countdown';
    this.countdown = this.cfg.garageCountdownSeconds ?? 1.5;
    this.emit({ type: 'msg', text: 'Engine running. Let\'s roll!', tone: 'good' });
  }

  // ── public API ──────────────────────────────────────────────────────────────
  step(input, dt = FIXED_DT) {
    input = input || NO_INPUT;
    if (!(dt > 0)) return;
    const n = Math.max(1, Math.min(8, Math.ceil(dt / FIXED_DT - 1e-6)));
    const h = dt / n;
    for (let i = 0; i < n; i++) this._tick(i === 0 ? input : { ...input, smoke: false, oil: false, nitro: false, reset: false, interact: false }, h);
  }

  applyCookCommand(cmd) {
    if (!cmd || typeof cmd !== 'object') return;
    if (ROOF_CMDS.has(cmd.type)) { try { this.roof.command(cmd); } catch (e) { this._plugErr('roof.command', e); } return; }
    if (AVATAR_CMDS.has(cmd.type)) { if (this.garage) { try { this.garage.command(cmd); } catch (e) { this._plugErr('garage.command', e); } } return; }
    this.labLink.apply(cmd);
  }
  setLabState(lab) { this.labLink.setLabState(lab); }

  // Driver-local commands (protocol.js DCMD) — never sent over the network.
  applyDriverCommand(cmd) {
    if (!cmd || typeof cmd !== 'object') return false;
    switch (cmd.type) {
      case 'skipTutorial':
        if (this.phase !== 'garage') return false;
        if (this.garage && typeof this.garage.skip === 'function') { try { this.garage.skip(); } catch (e) { this._plugErr('garage.skip', e); } }
        this._endGarage();
        this.emit({ type: 'tutorial', step: -1, stepId: 'skipped' });
        return true;
      case 'shopDone': return this.stops.shopDone(cmd.stopId ?? null, cmd.score);
      case 'shopAbort': return this.stops.shopAbort(cmd.stopId ?? null);
      default: return false;
    }
  }

  drainNetEvents() { const e = this._evNet; this._evNet = []; return e; }
  drainLocalEvents() { const e = this._evLocal; this._evLocal = []; return e; }

  snapshot() {
    const ents = this._collectEnts();
    return this._buildSnapshot(ents, this.drainLocalEvents());
  }

  netSnapshot() {
    const N = this.rules.net, rv = this.rv;
    const all = this._collectEnts();
    const behind = N.snapshotRadiusBehind ?? 120, ahead = N.snapshotRadiusAhead ?? 260;
    const heliKind = KIND_ID.heli;
    let ents = all.filter((e) => {
      const dz = e[4] - rv.z;
      return e[1] === heliKind || (dz >= -behind && dz <= ahead);
    });
    const max = N.maxEntitiesInSnapshot ?? 90;
    if (ents.length > max) {
      const d = (e) => { const dx = e[2] - rv.x, dz = e[4] - rv.z; return dx * dx + dz * dz * (dz < 0 ? 2 : 1); };
      ents = ents.map((e) => [d(e), e]).sort((a, b) => a[0] - b[0] || a[1][0] - b[1][0]).slice(0, max).map((p) => p[1]);
    }
    return roundDeep(this._buildSnapshot(ents, this.drainNetEvents()));
  }

  // ── helper API (see header) ──────────────────────────────────────────────────
  get time() { return this.t; }
  newId() { return this._nextId++; }
  kindId(kind) { return KIND_ID[kind] ?? -1; }

  emit(ev) {
    const a = this._evLocal, b = this._evNet;
    a.push(ev); if (a.length > EVENT_CAP) a.shift();
    b.push(ev); if (b.length > EVENT_CAP) b.shift();
  }
  msg(text, tone = 'info') { this.emit({ type: 'msg', text: String(text), tone }); }

  addBump(v) { if (v > this.feel.bump) this.feel.bump = Math.min(1, v); }

  damageRv(amount, cause = 'crash', noCrew = false) {
    if (!(amount > 0) || this.phase !== 'drive') return;
    const rv = this.rv;
    if (rv.grace > 0 && cause !== 'fall') return;
    rv.hp = Math.max(0, rv.hp - amount);
    this.lastDamageT = this.t;
    if (!noCrew) {
      const share = this.cfg.rv.crewCrashShare ?? 0.08;
      this.hurtDriver(amount * share);
      this.labLink.hurtCook(amount * share);
    }
    if (rv.hp <= 0) this.lose('wrecked');
  }

  pushRv(dx, dz, speedLoss = 0) {
    if (this.phase !== 'drive') return;
    const rv = this.rv, k = 1 - clamp(+speedLoss || 0, 0, 1);
    rv.vx = rv.vx * k + (+dx || 0);
    rv.vz = rv.vz * k + (+dz || 0);
    rv.speed = rv.vx * Math.sin(rv.yaw) + rv.vz * Math.cos(rv.yaw);
  }

  addHeat(amount, reason = '') {
    if (!(Math.abs(amount) > 0)) return;
    if (amount > 0) this.heat.add(amount);
    else if (!this.heat.gaveUp) this.heat.set(Math.max(0, this.heat.value + amount));
  }

  dropStars(n = 1, reason = '') {
    const h = this.heat;
    if (h.gaveUp || h.value <= 0) return;
    const before = h.stars;
    h.value = Math.max(0, h.value - Math.max(0, +n || 0));
    h.unseenT = Math.max(h.unseenT, this.rules.heat.decayDelay ?? 7);
    h._syncStars();
    if (reason === 'carWash' || /wash/i.test(String(reason))) this.structures.carWashDropped = true;
    this.emit({ type: 'heatDrop', stars: h.stars, from: before, reason });
  }

  copsList() {
    const out = [];
    for (const c of this.cops.cops) {
      if (c.dead) continue;
      out.push({ id: c.id, kind: c.kind, x: c.x, y: c.y, z: c.z, yaw: c.yaw, speed: c.speed, state: c.state });
    }
    return out;
  }
  applyCopEffect(id, eff) { return this.cops.applyEffect(id, eff || {}); }
  redirectCops(fn, seconds) { this.cops.setRedirect(typeof fn === 'function' ? fn : null, +seconds || 0); }

  setFx(o, hold = 0) {
    if (!o) return;
    for (const k of FX_KEYS) {
      const v = +o[k];
      if (!(v > 0)) continue;
      if (v > this.fx[k]) this.fx[k] = Math.min(1, v);
      if (hold > this._fxHold[k]) this._fxHold[k] = hold;
    }
  }

  spawnTrafficCar(kind, x, z, yaw, speed = 0) {
    const car = this.traffic.spawnAt(kind, x, z, yaw, speed);
    return car ? car.id : null;
  }
  trafficList() {
    return this.traffic.cars.map((c) => ({ id: c.id, kind: c.kind, x: c.x, z: c.z, yaw: c.yaw, speed: c.speed, state: c.state }));
  }
  applyTrafficEffect(id, eff = {}) { return this.traffic.applyEffect(id, eff); }

  surfaceAt(z) { return this.road.surfaceY(z); }

  // ── optional helpers (used by SETPIECES / ROOF when present) ──
  heatStars() { return this.heat.stars; }
  addPoints(n, reason = '') { if (Number.isFinite(+n)) this.score.points += +n; }
  // take up to n bags of product (the Rattlers); → units actually taken
  takeProduct(n = 1) {
    const inv = this.inv, k = Math.max(0, Math.min(inv.units, Math.floor(+n || 0)));
    if (k > 0) { const avg = this.avgUnitValue(); inv.units -= k; inv.value = Math.max(0, inv.value - k * avg); }
    return k;
  }
  // respawn the RV at z (forward lane, 0 speed, grace) — e.g. the drawbridge splash
  respawnRv(z, reason = '') {
    if (this.phase !== 'drive') return;
    this.falls++;
    this.respawnAt(+z || this.rv.z);
    this.emit({ type: 'fell', at: reason || 'respawn' });
  }
  // active driver gadgets on the road: [{ kind: 'smoke'|'oil', x, z, r, age }]
  gadgetZones() { return this.gadgets.zones(); }
  // spend a gadget charge (the roof flare uses a smoke charge); place → drop it at (x, z)
  useGadget(kind, opts = {}) { return this.gadgets.use(kind, opts); }
  // the supply stop state machine, light (no roof state): { id, name, state, shopType } | null
  get stop() { const a = this.stops.active; return a ? { id: a.st.def.id, name: a.st.def.name, state: a.state, shopType: a.st.shopType } : null; }
  laneBlocked(z, u) {
    try { return !!this.setpieces.laneBlocked(z, u); } catch (e) { this._plugErr('setpieces.laneBlocked', e); return false; }
  }

  hurtDriver(v) {
    if (!(v > 0) || this.phase !== 'drive') return;
    this.crew.driver = Math.max(0, this.crew.driver - v);
    if (this.crew.driver <= 0) this.lose('crewDown');
  }

  isNearSell(x, z, extra = 0) { return this.stops.isNearSell(x, z, extra); }
  avgUnitValue() { return this.inv.units > 0 ? this.inv.value / this.inv.units : 0; }

  lose(reason) {
    if (this.phase === 'won' || this.phase === 'lost') return;
    this.phase = 'lost';
    this.lostReason = reason;
    const texts = {
      wrecked: 'The RV is wrecked!', busted: 'BUSTED!', crewDown: 'Rook passed out at the wheel!',
    };
    if (texts[reason]) this.emit({ type: 'msg', text: texts[reason], tone: 'bad' });
    this.result = this.scoring.buildResult(false, reason);
    this.emit({ type: 'end', result: this.result });
  }

  win() {
    if (this.phase === 'won' || this.phase === 'lost') return;
    this.phase = 'won';
    this.lostReason = null;
    this.result = this.scoring.buildResult(true, 'delivered');
    this.emit({ type: 'msg', text: `Deal done! ${this.inv.units} bags delivered.`, tone: 'good' });
    this.emit({ type: 'end', result: this.result });
  }

  // Respawn after a fall that isn't the canyon (drawbridge gap → the water): back behind
  // the hazard in a forward lane, some damage, set-pieces behind may run again.
  onFellGeneric(z) {
    if (this.phase !== 'drive') return;
    this.falls++;
    this.emit({ type: 'fell', at: 'water' });
    this.damageRv(this.cfg.rv.waterFallDamage ?? 15, 'fall');
    if (this.phase !== 'drive') return;
    let zr = z - 90;
    for (const [a, b] of this.structures.layout.zones) if (z >= a && z <= b) zr = Math.min(zr, a - 40);
    this.respawnAt(zr);
    this.emit({ type: 'msg', text: 'Splash! Fished out and back on the road.', tone: 'bad' });
  }

  respawnAt(z) {
    const rv = this.rv;
    placeRv(this, z, forwardLaneU(this.road, z));
    rv.grace = this.cfg.rv.respawnGrace;
    rv.nitroT = 0; rv.flatT = 0;
    this.traffic.reset(z);
    this.peds.reset(z);
    this.obstacles.clearDynamicNear(z - 50, z + 250);
    this.heat.bust = 0;
    try { this.setpieces.resetBehind(z); } catch (e) { this._plugErr('setpieces.resetBehind', e); }
  }

  // ── the fixed step ──────────────────────────────────────────────────────────
  _tick(input, dt) {
    this.t += dt;
    this.stepCount++;
    const rv = this.rv;
    this._fxDecay(dt);
    if (this.phase === 'garage') {
      if (this.garage) { try { this.garage.update(dt, input); } catch (e) { this._plugErr('garage.update', e); } }
      // the RV is held where the tutorial parks it
      const p = this.garage && this.garage.rvPark;
      if (p && Number.isFinite(p.x) && Number.isFinite(p.z) && (Math.abs(rv.x - p.x) > 1e-6 || Math.abs(rv.z - p.z) > 1e-6)) placeRv(this, p.z, null, Number.isFinite(p.yaw) ? p.yaw : rv.yaw, p.x);
      if (!this.garage || this.garage.done) this._endGarage();
    } else if (this.phase === 'countdown') {
      this.countdown = Math.max(0, this.countdown - dt);
      if (this.countdown <= 0) {
        this.phase = 'drive';
        this.emit({ type: 'msg', text: 'GO!', tone: 'good' });
      }
    } else if (this.phase === 'drive') this.driveTime += dt;
    if (rv.grace > 0) rv.grace = Math.max(0, rv.grace - dt);

    const held = this.stops.holdsRv();
    if (this.phase === 'drive' && !held) {
      this.gadgets.handleInput(input);
      if (input.reset) this._resetRv();
      rv.horn = !!input.horn;
      if (rv.horn) this.peds.horn();
    } else rv.horn = false;

    const prevZ = rv.z;
    updateRvControl(this, held ? HOLD_INPUT : input, dt);
    this.traffic.update(dt);
    this.cops.update(dt);
    this.peds.update(dt);
    this.obstacles.update(dt);
    // set-pieces also run after a win (the handover cutscene)
    if (this.phase === 'drive' || this.phase === 'won') { try { this.setpieces.update(dt); } catch (e) { this._plugErr('setpieces.update', e); } }
    this._vehicleCollisions();
    this._structureCollisions();
    this.obstacles.collideRv(dt);
    this.events.update(dt);
    this.gadgets.update(dt);
    this.structures.update(dt);
    if (!rv.airborne || rv.y > -2) constrainRv(this, dt);
    updateRvVertical(this, dt, prevZ);

    this.bridgeSys.update(dt);
    this.stops.update(dt);
    if (this.phase === 'drive') { try { this.roof.update(dt); } catch (e) { this._plugErr('roof.update', e); } }
    rv.roofDoc = !!(this.roof.roofDoc ?? this.roof.active);
    this.heat.update(dt);
    this.labLink.update(dt);
    this._regen(dt);
    this._updateFeel(dt);
    this.scoring.update(dt);

    // biome change
    const bid = this.road.biome(rv.z).id;
    if (bid !== this.biomeId) {
      this.biomeId = bid;
      const b = this.road.biome(rv.z);
      this.emit({ type: 'biome', id: b.id, name: b.name });
    }
    // sell point
    if (this.phase === 'drive' && !rv.airborne && Math.abs(rv.speed) < this.cfg.sell.maxSpeed && this.stops.isNearSell(rv.x, rv.z)) {
      const need = this.route.sellPoint.requiredUnits;
      if (this.inv.units >= need) this.win();
      else {
        const unit = this.data.lab.product.unitName || 'bag';
        this.emit({ type: 'msg', text: `The buyer wanted ${need} ${unit}s. You brought ${this.inv.units}.`, tone: 'bad' });
        this.lose('noProduct');
      }
    }
  }

  _fxDecay(dt) {
    for (const k of FX_KEYS) {
      if (this._fxHold[k] > 0) this._fxHold[k] = Math.max(0, this._fxHold[k] - dt);
      else if (this.fx[k] > 0) this.fx[k] = Math.max(0, this.fx[k] - FX_DECAY[k] * dt);
    }
  }

  _regen(dt) {
    const R = this.rules.rv, rv = this.rv;
    const rate = R.regenPerSec ?? 0;
    const on = this.phase === 'drive' && rate > 0 && rv.hp > 0 && rv.hp < R.maxHp && this.t - this.lastDamageT >= (R.regenDelay ?? 10);
    if (on) rv.hp = Math.min(R.maxHp, rv.hp + rate * dt);
    if (on !== rv.regen) { rv.regen = on; this.emit({ type: 'regen', on }); }
  }

  timeOfDay() {
    const k = this.route.timeOfDay;
    if (!k || !k.length) return 12;
    const z = this.rv.z;
    if (z <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) {
      if (z <= k[i][0]) { const [z0, h0] = k[i - 1], [z1, h1] = k[i]; return h0 + (h1 - h0) * (z - z0) / Math.max(1e-6, z1 - z0); }
    }
    return k[k.length - 1][1];
  }

  // Find a clear spot on the road near z (lanes first, then a little further ahead) with
  // free road in front of it (so a reset hops past whatever the RV was stuck on).
  // minDz: skip spots closer than that (a repeated reset at the same place hops further).
  _clearSpot(z0, minDz = 0) {
    const road = this.road, rv = this.rv;
    const rails = this.structures.layout.railLines || [];
    const railKeep = rv.len / 2 + 4.5;   // never park the RV within ~4 m of a rail line
    const bodies = [...this.traffic.cars, ...this.cops.cops.filter((c) => c.kind !== 'heli')];
    const solids = this.obstacles.list.filter((o) => o.solid || o.kind === 'roadblock' || (o.flat && (o.def.drag || o.def.foam || o.def.shock)));
    const n = road.lanesPerDir(z0);
    const us = [forwardLaneU(road, z0)];
    for (let r = 0; r < n; r++) us.push(road.laneU(z0, 1, r));
    if (!road.median(z0)) for (let r = 0; r < n; r++) us.push(road.laneU(z0, -1, r));
    for (const dz of [0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 112, 128, -8]) {
      if (dz < minDz && dz !== -8) continue;
      if (dz === -8 && minDz > 0) continue;
      const z = z0 + dz;
      if (road.surfaceY(z) !== 0 && dz !== 0) continue;
      if (rails.some((r) => Math.abs(z - r.z) < railKeep)) continue;
      // never drop the RV into the toll booths / the car wash tunnel walls
      if (this.structures.layout.tolls.some((t) => z > t.from - 12 && z < t.to + 12)) continue;
      if (this.structures.layout.carWashes.some((w) => z > w.from - 10 && z < w.to + 10)) continue;
      for (const u of us) {
        const x = road.xAt(z, u);
        if (this.laneBlocked(z, u)) continue;
        let ok = true;
        // no vehicle beside the spot or in the next ~14 m of that lane
        for (const b of bodies) {
          const rel = b.z - z, reach = (b.len || 5) / 2 + rv.len / 2;
          if (rel > -(reach + 1) && rel < reach + 14 && Math.abs(b.x - x) < (b.wid || 2) / 2 + rv.wid / 2 + 0.6) { ok = false; break; }
        }
        if (ok) for (const o of solids) {
          const rel = o.z - z;
          if (rel > -(rv.len / 2 + o.r + 1) && rel < rv.len / 2 + o.r + 12 && Math.abs(o.x - x) < rv.wid / 2 + o.r + o.hl + 0.5) { ok = false; break; }
        }
        // set-piece solids (dropped cars, wagons…) and blocked road boxes around/ahead of the spot
        if (ok) for (const c of this._spCols) {
          if (c.solid !== true) continue;
          const rel = c.z - z;
          if (rel > -(rv.len / 2 + c.r + 1) && rel < rv.len / 2 + c.r + 12 && Math.abs(c.x - x) < rv.wid / 2 + c.r + 0.5) { ok = false; break; }
        }
        // set-piece road boxes anywhere across the RV's width, around and just ahead of the spot
        const hwR = rv.wid / 2 + 0.3;
        if (ok) for (const k of [-5, 0, 6, 12, 18]) if (this.laneBlocked(z + k, u) || this.laneBlocked(z + k, u - hwR) || this.laneBlocked(z + k, u + hwR)) { ok = false; break; }
        if (ok) return { z, u };
      }
    }
    let zf = z0 + minDz;
    for (const r of rails) if (Math.abs(zf - r.z) < railKeep) zf = r.z + railKeep + 0.5;
    return { z: zf, u: forwardLaneU(road, zf) };
  }

  _resetRv() {
    const rv = this.rv;
    if (rv.airborne || rv.resetCd > 0) return;
    const z0 = rv.z;
    if (this.road.surfaceY(z0) == null) return;
    // reset again and again at the same spot (wedged on something the checks don't see):
    // each repeat hops further ahead (16, 32, 48 … m)
    const lr = this._lastReset;
    const rep = lr && Math.abs(z0 - lr.z) < 12 && this.t - lr.t < 60 ? lr.n + 1 : 0;
    const { z, u } = this._clearSpot(z0, Math.min(96, rep * 16));
    this._lastReset = { z, t: this.t, n: rep };
    placeRv(this, z, u);
    rv.resetCd = this.cfg.rv.resetCooldown;
    rv.grace = Math.max(rv.grace, 1);
    this.emit({ type: 'msg', text: 'Back on the road.', tone: 'info' });
  }

  _updateFeel(dt) {
    const rv = this.rv, F = this.cfg.feel, f = this.feel;
    const raw = rv.airborne ? 0 : rv.speed * rv.w;
    f.latAcc += (raw - f.latAcc) * Math.min(1, dt / Math.max(1e-3, F.latAccSmooth));
    f.bump = Math.max(0, f.bump - F.bumpDecay * dt);
    f.speed = rv.speed;
    rv.latAcc = f.latAcc;
  }

  // Vehicle-vs-vehicle: RV, traffic, cops (capsules). O(n²) with a cheap z reject — n stays < 30.
  _vehicleCollisions() {
    const rv = this.rv, R = this.rules.rv, H = this.rules.heat, C = this.cfg.cops;
    const bodies = [];
    if (!(rv.airborne && rv.y > 1.5)) bodies.push(rv);
    for (const c of this.traffic.cars) if (!c.airborne) bodies.push(c);
    for (const c of this.cops.cops) if (c.kind !== 'heli' && !c.airborne) bodies.push(c);
    const rest = this.cfg.traffic.restitution;
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        const reach = a.hl + a.r + b.hl + b.r;
        if (Math.abs(a.z - b.z) > reach || Math.abs(a.x - b.x) > reach) continue;
        if (!capsuleCapsule(a, b, _con)) continue;
        // who drove into whom (pre-impulse velocities along the contact normal a→b)
        const vA = a.vx * _con.nx + a.vz * _con.nz, vB = -(b.vx * _con.nx + b.vz * _con.nz);
        const vn = resolveBodies(a, b, _con, rest);
        if (a === rv) this._rvHit(b, vn, R, H, C, vA - vB > 2 && vA > 3);
        else this._aiHit(a, b, vn, C);
      }
    }
    // AI bodies vs props and peds (the RV's own prop/ped hits are handled by those systems)
    for (const b of bodies) {
      if (b === rv) continue;
      if (Math.abs(b.z - rv.z) > 140) continue;
      const vn = this.obstacles.collideBody(b);
      if (vn > 5) {
        if (b.cat === 'cop') this.cops.damage(b, (vn - 5) * C.damageMult * (C.aiCrashDamageScale ?? 0.25));
        else if (b.state === 0) this.traffic.crash(b, false);
      }
      this.peds.collideBody(b);
    }
  }

  // Static structure walls (garage, toll islands, car wash) + set-piece colliders.
  _structureCollisions() {
    const rv = this.rv, S = this.structures;
    const rvLow = !(rv.airborne && rv.y > 1.5);
    if (rvLow) S.collideBody(rv, true);
    for (const c of this.traffic.cars) if (!c.airborne && Math.abs(c.z - rv.z) < 400) {
      const vn = S.collideBody(c, false);
      if (vn > 6 && c.state === 0) this.traffic.crash(c, false, vn);
    }
    for (const c of this.cops.cops) if (c.kind !== 'heli' && !c.airborne) {
      const vn = S.collideBody(c, false);
      if (vn > 7) this.cops.damage(c, (vn - 7) * this.cfg.cops.damageMult * 0.25);
    }
    // set-piece colliders
    const cols = this._spCols; cols.length = 0;
    if (this.phase === 'drive') { try { this.setpieces.colliders(cols); } catch (e) { this._plugErr('setpieces.colliders', e); cols.length = 0; } }
    if (!cols.length) return;
    if (rvLow) for (let i = 0; i < cols.length; i++) this._spCollide(rv, cols[i], i, 'rv');
    for (const car of this.traffic.cars) {
      if (car.airborne || Math.abs(car.z - rv.z) > 300) continue;
      for (let i = 0; i < cols.length; i++) if (cols[i].solid === true) this._spCollide(car, cols[i], i, 'car');
    }
    for (const cop of this.cops.cops) {
      if (cop.kind === 'heli' || cop.airborne) continue;
      for (let i = 0; i < cols.length; i++) if (cols[i].solid === true) this._spCollide(cop, cols[i], i, 'cop');
    }
  }

  _spCollide(b, c, i, by) {
    if (!(c.r > 0) || !Number.isFinite(c.x) || !Number.isFinite(c.z)) return;
    if (Math.abs(c.z - b.z) > b.hl + b.r + c.r + 0.5) return;
    if (!capsuleCircle(b, c.x, c.z, c.r, _con)) return;
    const cvx = +c.vx || 0, cvz = +c.vz || 0;
    let vn = 0;
    if (c.solid === true) {
      b.vx -= cvx; b.vz -= cvz;
      vn = resolveStatic(b, _con, 0.2);
      b.vx += cvx; b.vz += cvz;
      updateCapsule(b);
    } else {
      vn = Math.abs((b.vx - cvx) * _con.nx + (b.vz - cvz) * _con.nz);
    }
    const key = `${c.id ?? c.kind ?? i}:${b.id}`;
    const last = this._spHit.get(key);
    const fresh = last == null || this.t - last > 0.8;
    // solid: onHit every frame of contact (the plugin keeps its own per-body cooldown);
    // trigger: once per contact (0.8 s cooldown). Damage / crash events: once per 0.8 s.
    if (typeof c.onHit === 'function' && (c.solid === true || fresh)) { try { c.onHit(this, { by, id: b.id, speed: vn }); } catch (e) { this._plugErr('setpieces.onHit', e); } }
    if (!fresh) return;
    this._spHit.set(key, this.t);
    if (this._spHit.size > 400) { for (const [k, v] of this._spHit) if (this.t - v > 2) this._spHit.delete(k); }
    if (by === 'rv') {
      const R = this.rules.rv;
      if (c.damage > 0) this.damageRv(c.solid === true ? c.damage * clamp(vn / 12, 0.4, 1.5) : c.damage, c.kind || 'setpiece');
      if (c.solid === true && vn > R.minCrashSpeed) {
        this.addBump(clamp(vn / 14, 0.25, 1));
        this.emit({ type: 'crash', x: _con.px, z: _con.pz, power: clamp(vn / 25, 0.1, 1) });
      }
    } else if (by === 'cop') {
      if (vn > 6) this.cops.damage(b, (vn - 6) * this.cfg.cops.damageMult * 0.3);
    } else if (by === 'car') {
      if (vn > 6 && b.state === 0) this.traffic.crash(b, false, vn);
    }
  }

  // rvAggressor: the RV drove into `o` (not the other way round).
  _rvHit(o, vn, R, H, C, rvAggressor = false) {
    const rv = this.rv;
    if (o.cat === 'cop') {
      this.cops.rvContact(o, vn, rvAggressor);
      return;
    }
    // traffic / rival
    if (o.hostile) {
      this.traffic.rivalContact(o);
      if (vn > 1.5) this.traffic.damage(o, vn * C.damageMult);
      if (vn > R.minCrashSpeed) {
        this.damageRv(R.crashDamagePerMps * (vn - R.minCrashSpeed) * 0.6, 'crash');
        this.addBump(clamp(vn / 15, 0.2, 1));
      }
      return;
    }
    if (vn > R.minCrashSpeed) {
      const massF = 0.6 + 0.4 * clamp(o.mass, 0.5, 3.5);
      this.damageRv(R.crashDamagePerMps * (vn - R.minCrashSpeed) * massF, 'crash');
      this.addBump(clamp(vn / 14, 0.25, 1));
      this.traffic.crash(o, rvAggressor, vn);
      this.emit({ type: 'crash', x: (rv.x + o.x) / 2, z: (rv.z + o.z) / 2, power: clamp(vn / 25, 0.1, 1) });
    } else if (vn > 1.0) this.addBump(0.15);
  }

  _aiHit(a, b, vn, C) {
    if (vn <= 4) return;
    const k = C.aiCrashDamageScale ?? 0.25;
    for (const x of [a, b]) {
      if (x.cat === 'cop') this.cops.damage(x, (vn - 4) * C.damageMult * k * (x.kind === 'moto_cop' ? 3 : 1));
      else if (x.hostile) this.traffic.damage(x, (vn - 4) * C.damageMult * k);
      else if (vn > 6) this.traffic.crash(x, false, vn);
    }
  }

  // ── snapshot assembly ───────────────────────────────────────────────────────
  _collectEnts() {
    const out = [];
    this.cops.pushEnts(out);
    this.traffic.pushEnts(out);
    this.peds.pushEnts(out);
    this.obstacles.pushEnts(out);
    this.gadgets.pushEnts(out);
    this.events.pushEnts(out);
    const n = out.length;
    try { this.setpieces.ents(out); } catch (e) { this._plugErr('setpieces.ents', e); out.length = n; }
    for (let i = n; i < out.length; i++) {
      const e = out[i];
      if (!Array.isArray(e) || e.length !== 8 || !(e[1] >= 0)) { out.splice(i, 1); i--; }
    }
    return out;
  }

  _buildSnapshot(ents, events) {
    const rv = this.rv, R = this.rules.rv, heat = this.heat, inv = this.inv, br = this.route.bridge;
    const tr = this.events.trainInfo();
    const sp = this.stops.sell;
    const biome = this.road.biome(rv.z);
    let setpieces = [];
    try { setpieces = this.setpieces.state() || []; } catch (e) { this._plugErr('setpieces.state', e); }
    return {
      t: this.t,
      phase: this.phase,
      countdown: this.countdown,
      lostReason: this.lostReason,
      garage: this.phase === 'garage' || this.phase === 'countdown' ? this._safeGarageState() : null,
      rv: {
        x: rv.x, y: rv.y, z: rv.z, yaw: rv.yaw, pitch: rv.pitch, roll: rv.roll, speed: rv.speed, steer: rv.steer,
        hp: rv.hp, airborne: rv.airborne, nitro: clamp(rv.nitroT / (R.nitroSeconds || 1), 0, 1), flatTyre: rv.flatT > 0,
        onRoad: rv.onRoad, zone: rv.zone, drift: rv.drift, handbrake: !!rv.handbrake, horn: !!rv.horn, grace: rv.grace,
        regen: !!rv.regen, roofDoc: !!rv.roofDoc, slip: rv.slipT > 0, foam: rv.foamT > 0, shock: rv.shockT > 0,
      },
      crew: { driver: this.crew.driver, cook: this.crew.cook, cookDown: this.crew.cookDown },
      heat: { value: heat.value, stars: heat.stars, seen: heat.seen, gaveUp: heat.gaveUp, unseen: Math.min(99, heat.unseenT) },
      bust: heat.bust,
      score: { ...this.score },
      inv: { mat: { ...inv.mat }, units: inv.units, quality: inv.quality, gadgets: { ...inv.gadgets }, value: inv.value },
      stop: this.stops.stopInfo(),
      nearStop: this.stops.nearStop(),
      bridge: {
        dist: br ? br.lip - rv.z : 0, speedNeeded: this.bridgeSys.speedNeeded, lip: br ? br.lip : 0,
        launchSpeed: this.bridgeSys.launchSpeed, cleared: this.bridgeSys.cleared, falls: this.bridgeSys.falls,
      },
      biome: this.biomeId,
      area: { id: biome.id, name: biome.name },
      timeOfDay: this.timeOfDay(),
      dist: rv.z,
      routeLength: this.route.routeLength,
      feel: { latAcc: this.feel.latAcc, bump: this.feel.bump, speed: this.feel.speed },
      alert: { copClose: this.alert.copClose, copDist: this.alert.copDist },
      lab: { fumes: this.lab.fumes, fire: this.lab.fire, ventOpen: this.lab.ventOpen, curtains: this.lab.curtains, cooking: this.lab.cooking },
      fx: { fog: this.fx.fog, flash: this.fx.flash, shock: this.fx.shock },
      roof: this._roofState(),
      weather: this.weather,
      train: tr ? { z: tr.z, state: tr.state, dist: tr.dist } : null,
      sell: { x: sp.x, z: sp.z, dist: Math.hypot(sp.x - rv.x, sp.z - rv.z), radius: this.route.sellPoint.radius },
      looted: this.stops.stops.filter((s) => s.looted).map((s) => s.def.id),
      closed: this.stops.stops.filter((s) => s.closed).map((s) => s.def.id),
      maxStars: heat.maxStars,
      redirect: this.cops.redirect ? this.cops.redirect.t : 0,
      setpieces,
      ents,
      events,
    };
  }
}

export default GameSim;
