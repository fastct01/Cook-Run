// ─────────────────────────────────────────────────────────────────────────────
// Autopilot — a bot driver: Snapshot → DriverInput. Used by the headless tests,
// attract/demo mode and the solo "Rook's AI" (cruise mode with maxSpeed + skipped stops).
//   const ap = new Autopilot(data, { seed });   // same seed as the sim (road shape)
//   const input = ap.update(snapshot);          // call once per sim step / frame
// Options:
//   cruise, maxSpeed (hard cap), useNitro (true), brakeForPeds (false), biomeCruise {id: m/s}
//   onDriverCommand(cmd)  host-local DCMD sink (sim.applyDriverCommand). Enables:
//     tutorial: 'skip' (default with a sink) → sends skipTutorial; 'play' → walks Rook
//               through the garage tutorial from snapshot.garage (target / near / task)
//     autoShop: seconds → sends shopDone { score: autoShopScore (0.8) } after that long shopping
//   stops (true)          visit supply stops (park, wait while Rook shops / loads)
//   sim                   optional GameSim: laneBlocked() is used directly when given
//   ap.skipped            Set of stop ids to drive past (main.js fills it for cruise mode)
// Behaviour:
//  • garage: skip or play the tutorial; then drive straight out of the door, turn onto the road
//  • follows the forward lane centre, picks another lane / the shoulder / off-road to get
//    around slow or stopped things; slows down when everything is blocked (set-piece blocks
//    from snapshot.setpieces[].blocks, structure walls, the drawbridge, wide loads …)
//  • freeway: never crosses the median; toll plaza: lines up with a booth lane; car wash:
//    drives through the tunnel centre (it drops a star)
//  • honks at pedestrians ahead, waits for the train; avoids canisters, the tornado, hazards
//  • parks in each un-looted supply stop lot and holds still while the stop runs
//    (parked → shopping → returning → loading → done), then drives on
//  • drops oil / smoke when cops get close; floors it (nitro) before the canyon bridge
//  • stops at the sell point
// Entity velocities are estimated from position deltas between calls.
// Unity port: AutopilotDriver (attract mode / tests), reads the same Snapshot.
// ─────────────────────────────────────────────────────────────────────────────
import { KIND } from '../shared/protocol.js';
import { Track } from './track.js';
import { Road } from './road.js';
import { forwardLaneU } from './vehicle.js';
import { clamp, wrapAngle } from './util.js';
import { structureLayout, GARAGE_LOCAL } from './structures.js';

// the garage tutorial's path planner (optional — ONFOOT's module)
let GAR = null;
try { GAR = await import('./garage.js'); } catch (e) { GAR = null; }

// [half-width, half-length] of vehicles in the autopilot's eyes
const VEH = {
  cop: [1.0, 2.4], cop_suv: [1.05, 2.6], interceptor: [1.0, 2.5], moto_cop: [0.55, 1.2], rhino_truck: [1.4, 3.3],
  sedan: [0.95, 2.3], hatch: [0.9, 2.0], van: [1.0, 2.5], pickup: [1.0, 2.7], bus: [1.3, 5.5], truck: [1.3, 6.0],
  tractor: [1.1, 2.1], rival: [1.0, 2.7], garbage_truck: [1.3, 4.6], news_van: [1.1, 3.2], forklift: [0.7, 1.7],
  car_carrier: [1.3, 8.5], logging_truck: [1.3, 7.3], combine: [2.7, 4.7], streetcar: [1.3, 7.0],
  wide_load: [2.4, 8.4], stagecoach: [1.0, 3.7], parade_float: [2.2, 4.5], comet_car: [1.0, 2.5],
  freight_wagon: [1.6, 7.0], kestrel_car: [1.0, 2.5], broken_car: [1.0, 3.3], horse: [0.6, 1.3], cowboy_horse: [0.6, 1.3],
  inflatable_gorilla: [3.5, 3.5], tornado: [16, 16], band_member: [0.5, 0.5], cop_officer: [0.5, 0.5], swat_officer: [0.5, 0.5],
};
// half-width of static blockers; null = ignore
const BLOCK = {
  cow: 1.5, sheep: 1.1, rock_small: 0.9, rock: 1.6, falling_rock: 1.7, roadblock: 2.3, spikes: 1.9,
  hydrant: 0.6, train: 0, sinkhole: 3.1, log: 1.0, goat: 0.6,
};
const BLOCK_LEN = { log: 2.6, broken_car: 3.3 };
// soft = drive through if needed, but prefer a lane without it. SOFT_W: lane-choice penalty.
const SOFT = {
  ped: 0.7, pothole: 1.1, sanddrift: 3.0, trashcan: 0.7, mailbox: 0.6, hay: 1.3, cactus_road: 0.7,
  steam_leak: 3.0, water_main: 3.5, trench_plates: 2.6, manhole_open: 1.0, power_line_down: 3.0, dust_devil: 4.5,
  foam_patch: 4.5, flashbang: 5.0, trolley: 0.7, oil_slick: 4.5, barrier: 1.6, cone: 0.5,
};
const SOFT_W = { barrier: 4, cone: 0.5, ped: 6, power_line_down: 9, flashbang: 10, foam_patch: 7, dust_devil: 5, water_main: 4, steam_leak: 3, sinkhole: 9, oil_slick: 6 };
// kinds whose state 1 means "moving" (not "knocked flying")
const MOVING1 = new Set(['cow', 'sheep', 'log', 'dust_devil', 'goat']);
const COPS = new Set(['cop', 'cop_suv', 'interceptor', 'moto_cop', 'rhino_truck']);
const DEFAULT_CRUISE = {
  ironworks: 22, downtown: 21, oldtown: 18, docks: 23, suburbs: 23, interstate: 29, stripmall: 23,
  farmland: 26, foothills: 24, saltflats: 28, ghosttown: 20, canyon: 25, hideout: 20, city: 21,
};
const HOLD = new Set(['parked', 'shopping', 'returning', 'loading']);
const HARD_WAIT = 30;   // s to wait at a set-piece block (drawbridge up, wagons…) before unsticking / resetting

export class Autopilot {
  constructor(data, opts = {}) {
    this.data = data;
    this.route = data.route;
    this.rules = data.rules;
    this.track = new Track(data.route, opts.seed ?? data.route.defaultSeed ?? 1);
    this.road = new Road(this.track);
    this.cruise = opts.cruise ?? (data.rules.rv.topSpeed - 1);
    this.biomeCruise = { ...DEFAULT_CRUISE, ...(opts.biomeCruise || {}) };
    this.escapeT = 0;
    this.maxSpeed = opts.maxSpeed ?? Infinity;   // hard cap in every mode (tests: controlled jump speed)
    this.useNitro = opts.useNitro ?? true;
    this.brakeForPeds = opts.brakeForPeds ?? false; // false: sidewalk peds only get the horn; peds on the road are still avoided
    this.sim = opts.sim ?? null;
    this.onDriverCommand = typeof opts.onDriverCommand === 'function' ? opts.onDriverCommand : null;
    this.tutorial = opts.tutorial ?? (this.onDriverCommand ? 'skip' : 'play');
    this.autoShop = opts.autoShop ?? null;
    this.autoShopScore = opts.autoShopScore ?? 0.8;
    this.useStops = opts.stops ?? true;
    this.prev = new Map();
    this.lastT = null;
    this.choiceU = null;
    this.nitroUsed = 0;
    this.gadgetCd = 0;
    this.skipped = new Set();
    this.stopWait = 0;
    this.stuckT = 0;
    this.reverseT = 0;
    this.lots = this.route.stops.map((s) => ({ s, lot: this.track.stopLot(s) }));
    this.rw = this.track.roadworks();
    this.sell = this.track.sellPointPos();
    this.layout = structureLayout(this.track, this.route);
    this.exitedGarage = !this.route.start?.garage;
    this.skipSent = false;
    this.shopT0 = null; this.shopSent = null;
    this.gpath = null; this.gtask = null; this.gActT = -9;
    this.stats = { stopsParked: 0, shopDoneSent: 0 };
    this._staticBlockers = this._buildStaticBlockers();
    this.spDefs = new Map((this.route.setpieces || []).map((d) => [d.id, d]));
  }

  setSim(sim) { this.sim = sim; }

  // Structure walls as blocker boxes along the road: { z0, z1, u, hw }
  _buildStaticBlockers() {
    const out = [];
    for (const s of this.layout.segs) {
      const ua = this.road.uAt(s.ax, s.az), ub = this.road.uAt(s.bx, s.bz);
      out.push({ z0: Math.min(s.az, s.bz) - s.r, z1: Math.max(s.az, s.bz) + s.r, u: (ua + ub) / 2, hw: Math.abs(ua - ub) / 2 + s.r, kind: s.kind });
    }
    return out;
  }

  _vel(snap, dt) {
    const out = new Map();
    for (const e of snap.ents) {
      const p = this.prev.get(e[0]);
      let vx = 0, vz = 0;
      if (p && dt > 0) { vx = (e[2] - p[0]) / dt; vz = (e[4] - p[1]) / dt; }
      out.set(e[0], [vx, vz]);
    }
    const next = new Map();
    for (const e of snap.ents) next.set(e[0], [e[2], e[4]]);
    this.prev = next;
    return out;
  }

  _preferredU(z) {
    let u = forwardLaneU(this.road, z);
    for (const rw of this.rw) {
      if (z < rw.from - 40 || z > rw.to + 10) continue;
      if (u >= rw.u0 - 0.3 && u <= rw.u1 + 0.3) {
        const n = this.road.lanesPerDir(z);
        let best = null;
        for (const d of [1, -1]) for (let r = 0; r < n; r++) {
          const lu = this.road.laneU(z, d, r);
          if (lu >= rw.u0 - 0.3 && lu <= rw.u1 + 0.3) continue;
          if (best == null || Math.abs(lu - u) + (d > 0 ? 0 : 5) < Math.abs(best - u)) best = lu;
        }
        if (best != null) u = best;
      }
    }
    return u;
  }

  _blank() {
    return { throttle: 0, steer: 0, handbrake: false, horn: false, smoke: false, oil: false, nitro: false, reset: false, moveX: 0, moveZ: 0, interact: false, interactHeld: false };
  }

  update(snap) {
    const inp = this._blank();
    const dt = this.lastT == null ? 1 / 60 : Math.max(1e-3, snap.t - this.lastT);
    this.lastT = snap.t;
    const vel = this._vel(snap, dt);
    if (this.gadgetCd > 0) this.gadgetCd -= dt;
    if (snap.phase === 'garage') return this._garage(snap, inp, dt);
    if (snap.phase !== 'drive') { inp.handbrake = snap.phase !== 'countdown'; return inp; }
    return this._drive(snap, inp, dt, vel);
  }

  // ── garage tutorial (Rook) ─────────────────────────────────────────────────
  _garage(snap, inp, dt) {
    if (this.tutorial === 'skip' && this.onDriverCommand) {
      if (!this.skipSent) { this.skipSent = true; this.onDriverCommand({ type: 'skipTutorial' }); }
      return inp;
    }
    const g = snap.garage;
    if (!g || !g.rook) return inp;
    const rook = g.rook, task = g.task ? g.task.rook : null, tgt = g.target ? g.target.rook : null;
    inp.interactHeld = false;
    if (task === 'crank') { inp.interactHeld = true; inp.interact = this.gtask !== 'crank'; this.gtask = 'crank'; return inp; }
    if (rook.inRv || !tgt) { this.gtask = task; return inp; }
    if (g.near && g.near.rook) {
      if (snap.t - this.gActT > 0.6) { inp.interact = true; this.gActT = snap.t; }
      this.gtask = task;
      return inp;
    }
    // walk there (ONFOOT's planner in interior-local space when available)
    let wx = tgt.x, wz = tgt.z;
    const F = g.frame;
    if (GAR && typeof GAR.planPath === 'function' && F) {
      const c = Math.cos(F.rot), s = Math.sin(F.rot);
      const toL = (x, z) => { const dx = x - F.ox, dz = z - F.oz; return { x: dx * c - dz * s, z: dx * s + dz * c }; };
      const toW = (lx, lz) => ({ x: F.ox + lx * c + lz * s, z: F.oz - lx * s + lz * c });
      const a = toL(rook.x, rook.z), b = toL(tgt.x, tgt.z);
      if (this.gtask !== task || !this.gpath || !this.gpath.length || snap.t - (this.gpathT || 0) > 1.5) {
        try { this.gpath = GAR.planPath(a.x, a.z, b.x, b.z); } catch (e) { this.gpath = null; }
        this.gpathT = snap.t;
      }
      if (this.gpath && this.gpath.length) {
        while (this.gpath.length > 1 && Math.hypot(this.gpath[0].x - a.x, this.gpath[0].z - a.z) < 0.35) this.gpath.shift();
        const w = toW(this.gpath[0].x, this.gpath[0].z); wx = w.x; wz = w.z;
      }
    }
    this.gtask = task;
    const dx = wx - rook.x, dz = wz - rook.z, d = Math.hypot(dx, dz);
    if (d > 0.05) { const k = Math.min(1, d / 0.6) / d; inp.moveX = dx * k; inp.moveZ = dz * k; }
    return inp;
  }

  // ── driving ────────────────────────────────────────────────────────────────
  _drive(snap, inp, dt, vel) {
    const road = this.road, rv = snap.rv;
    const v = rv.speed, s = Math.sin(rv.yaw), c = Math.cos(rv.yaw);
    const rvU = road.uAt(rv.x, rv.z);
    const hw = road.hw(rv.z), sh = road.sh(rv.z);
    const br = this.route.bridge;
    const looted = new Set(snap.looted || []), closed = new Set(snap.closed || []);
    const stop = snap.stop;

    // ── leaving the garage ───────────────────────────────────────────────────
    const G = this.layout.garage;
    if (G && !this.exitedGarage) {
      const l = G.toLocal(rv.x, rv.z), D = GARAGE_LOCAL.door;
      const inside = Math.abs(rv.z - G.cz) < 14 && l.z < D.z + 4.9 && l.x > GARAGE_LOCAL.room.x0 - 2 && l.x < GARAGE_LOCAL.room.x1 + 2;
      if (inside) {
        const p = G.toWorld((D.x0 + D.x1) / 2, D.z + 20);
        this._steerTo(inp, rv, p.x, p.z, v);
        this._speed(inp, v, 4.5);
        this.dbg = { mode: 'garage-exit' };
        return inp;
      }
      this.exitedGarage = true;
    }

    // ── mode ────────────────────────────────────────────────────────────────
    let mode = 'cruise', target = null;
    if (this.useStops) {
      for (const { s: st, lot } of this.lots) {
        if (looted.has(st.id) || closed.has(st.id) || this.skipped.has(st.id)) continue;
        const d = st.z - rv.z;
        if (d < -st.lotLength / 2 + 2 || d > 170) continue;
        mode = 'stop'; target = { st, lot }; break;
      }
    }
    // a stop we didn't mean to make (cruise mode skips them all; a crash left us crawling in a
    // lot): drive on while it's only 'parked' (that cancels it); abort it if Rook is already out
    const unwanted = !!(stop && (!this.useStops || this.skipped.has(stop.id)));
    if (unwanted && stop.state === 'shopping' && this.onDriverCommand && this.abortSent !== stop.id) {
      this.abortSent = stop.id;
      this.onDriverCommand({ type: 'shopAbort', stopId: stop.id });
    }
    const atStop = stop && HOLD.has(stop.state) && !(unwanted && stop.state === 'parked');
    // don't pull in with cops on our tail: Rook would be out shopping with the RV boxed in
    if (mode === 'stop' && !atStop) {
      const dz = target.st.z - rv.z, hot = snap.heat && snap.heat.stars >= 1 && snap.alert && snap.alert.copDist < (snap.heat.stars >= 2 ? 90 : 55);
      if (snap.bust > 0.15 || (hot && dz < target.st.lotLength / 2 + 40)) { this.skipped.add(target.st.id); mode = 'cruise'; target = null; }
    }
    if (atStop) {
      // the stop runs: hold still (input is ignored while Rook is out anyway)
      this._autoShop(snap);
      if (stop.state === 'loading' && stop.blocked) this.stopWait += dt; else this.stopWait = 0;
      inp.handbrake = true;
      inp.throttle = 0;
      this.stuckT = 0;
      this.dbg = { mode: 'stop-' + stop.state };
      this._gadgets(snap, inp, 'stop', 99, 99, target);
      return inp;
    }
    this.shopT0 = null;
    const pastGap = br && rv.z > br.gapEnd;
    if (pastGap && snap.sell && rv.z > this.sell.z - 220) mode = 'sell';
    const jump = br && !pastGap && br.lip - rv.z < 320 && br.lip - rv.z > -5;
    if (jump) mode = 'jump';

    // ── lateral candidates ────────────────────────────────────────────────────
    const zAhead = rv.z + 20;
    const pref = this._preferredU(zAhead);
    const n = road.lanesPerDir(rv.z);
    const cands = [];
    const bId = road.biome(rv.z).id;
    const chased = snap.heat && snap.heat.stars > 0 && snap.alert && snap.alert.copDist < 120;
    let cruise = chased ? this.cruise : Math.min(this.cruise, this.biomeCruise[bId] ?? this.cruise);
    // freeway: stay on our side of the median (look a little ahead too)
    const median = road.median(rv.z) > 0 || road.median(rv.z + 60) > 0;
    const mySide = rvU >= 0 ? 1 : -1;
    for (const d of [1, -1]) for (let r = 0; r < n; r++) cands.push({ u: road.laneU(rv.z, d, r), cost: d > 0 ? 0 : 2.5 });
    // squeeze-through lines: the centre line (undivided roads) and the boundaries between same-direction lanes
    if (!median) cands.push({ u: 0, cost: 1.5 });
    for (let r = 1; r < n; r++) for (const d of [1, -1]) cands.push({ u: d * r * road.lw(rv.z), cost: d > 0 ? 1.0 : 3.5 });
    const sidewalk = !!road.biome(rv.z).sidewalk;
    const sc = sidewalk ? 9 : 0;
    cands.push({ u: hw + sh * 0.5, cost: 2.0 + sc }, { u: -(hw + sh * 0.5), cost: 3.0 + sc });
    const room = road.sideRoom(rv.z);
    if (room > 5) cands.push({ u: hw + sh + 2.5, cost: 4.0 + sc }, { u: -(hw + sh + 2.5), cost: 5.0 + sc });
    else if (room > 1.5 && !(br && rv.z > br.rampStart - 60)) {
      const lim = hw + sh + room - 1.8;
      cands.push({ u: lim, cost: 3.5 }, { u: -lim, cost: 4.5 });
    }
    // toll plaza ahead: the booth lanes
    let tollNear = null;
    for (const t of this.layout.tolls) if (t.z - rv.z < 140 && t.z - rv.z > -12) tollNear = t;
    if (tollNear) {
      for (const b of tollNear.booths) cands.push({ u: b, cost: -1.5 }, { u: -b, cost: 2.5 });
      for (const cnd of cands) if (Math.abs(cnd.u) > 10.5 || !tollNear.booths.some((b) => Math.abs(Math.abs(cnd.u) - b) < 0.3)) cnd.cost += tollNear.z - rv.z < 70 ? 30 : 4;
    }
    // set-piece detours (e.g. the parade's market-alley sidewalk): snapshot.setpieces[].free = [u0, u1]
    let detour = false;
    for (const sp of snap.setpieces || []) {
      if (!Array.isArray(sp.free) || sp.free.length !== 2) continue;
      const def = this.spDefs.get(sp.id);
      const a = (def?.from ?? def?.z ?? rv.z) - 200, b = (def?.to ?? def?.z ?? rv.z) + 40;
      if (rv.z < a || rv.z > b) continue;
      detour = true;
      const [f0, f1] = sp.free, side = f0 >= 0 ? 1 : -1;
      const inner = side > 0 ? f0 : f1, outer = side > 0 ? f1 : f0;
      const uD = inner + side * Math.min(2.2, Math.abs(outer - inner) / 2);
      cands.push({ u: uD, cost: 0.5, detour: true }, { u: inner + side * Math.min(4.5, Math.abs(outer - inner) * 0.7), cost: 1.0, detour: true });
    }
    // car wash ahead: drive through the tunnel centre (it drops a star)
    for (const w of this.layout.carWashes) {
      if (w.from - rv.z < 120 && w.to - rv.z > -5) cands.push({ u: w.axisU, cost: -2.0 });
    }
    // a rail crossing just ahead: stay in our own lanes (no queue-jumping on the wrong side)
    const railNear = (this.layout.railLines || []).some((r) => r.z - rv.z > -6 && r.z - rv.z < 120);
    const costAdj = (cnd) => {
      cnd.cost += Math.abs(cnd.u - pref) * 0.15;
      if (railNear && !median && cnd.u < -0.5) cnd.cost += 30;
      if (median && Math.sign(cnd.u) !== mySide) cnd.cost += 1000;
      // roadwork: closed band is not a candidate
      for (const rw of this.rw) {
        if (rv.z < rw.from - 30 || rv.z > rw.to + 5) continue;
        if (cnd.u >= rw.u0 - 1.2 && cnd.u <= rw.u1 + 1.2) cnd.cost += 50;
      }
    };
    for (const cnd of cands) costAdj(cnd);

    // ── blockers ─────────────────────────────────────────────────────────────
    const look = clamp(14 + Math.abs(v) * 2.2, 25, 80);
    const front = rv.z + 4.3;
    const blockers = [];
    let pedAhead = false, copBehind = 99, rivalNear = 99, waitHard = false, pedCrawl = Infinity;
    // the Midnight Comet's convoy (scripted cop cars chasing HIM): not our tail, no gadgets for them
    let convoy = null;
    for (const sp of snap.setpieces || []) {
      if (sp.type !== 'midnight_comet' || !Array.isArray(sp.ids)) continue;
      convoy = convoy || new Set();
      for (const id of sp.ids) convoy.add(id);
    }
    for (const e of snap.ents) {
      const kind = KIND[e[1]];
      const dx = e[2] - rv.x, dz = e[4] - rv.z;
      const along = dx * s + dz * c;
      const st = e[7];
      if (COPS.has(kind)) {
        if (st === 1 && along < 0 && along > -40 && !(convoy && convoy.has(e[0]))) copBehind = Math.min(copBehind, -along);
      }
      if (kind === 'rival' && st === 0 && Math.hypot(dx, dz) < 18) rivalNear = Math.min(rivalNear, Math.hypot(dx, dz));
      if (kind === 'heli' || kind === 'chopper' || kind === 'kestrel' || kind === 'sgt_pratt' || kind === 'comet_hero') continue;
      const extent = (VEH[kind] ? VEH[kind][1] : BLOCK_LEN[kind] ?? 1);
      // things entirely behind the RV's centre can't block it going forward
      if (along + extent < -0.5 || along > look + 80) continue;
      const eu = road.uAt(e[2], e[4]);
      // the Comet / his convoy coming past (from 45 m behind to level with us): their lane is
      // taken — never steer into it (they keep clear of OUR lane, so it never blocks where we are)
      if (convoy && convoy.has(e[0]) && along > -45 && along < 12) {
        const [cw, cl] = VEH[kind] || [1.0, 2.5];
        blockers.push({ kind, u: eu, hw: cw, d: 0, end: along + cl, vAlong: 0, soft: false, w: 1, stat: false, conv: true });
        continue;
      }
      if (kind === 'ped') {
        // the bot leans on the horn instead of braking for pedestrians (they panic and run)
        // (out to ~70 m and the far sidewalk: a runner waiting at the kerb stays put when it hears the horn)
        if (st <= 1 && along > 0 && along < 70 && Math.abs(eu - rvU) < 11) pedAhead = true;
        if (st >= 2) continue;
      }
      if (kind === 'flashbang' && st !== 1) continue;
      // airborne things (tornado-lifted cars, flying cones…) are ignored above 2.5 m;
      // falling rocks count where they will land
      if (e[3] > 2.5 && kind !== 'tornado' && kind !== 'falling_rock') continue;
      let hwid = null, soft = false, len = 1;
      if (VEH[kind]) {
        if (COPS.has(kind)) { if (st === 1 && along < 6) continue; if (st === 4 || st === 5) { /* wrecks block */ } }
        [hwid, len] = VEH[kind];
      } else if (BLOCK[kind] != null) { hwid = BLOCK[kind]; len = BLOCK_LEN[kind] ?? 1; }
      else if (kind === 'broken_car') { hwid = 1.1; len = 3.3; }
      else if (SOFT[kind] != null) {
        hwid = SOFT[kind]; soft = true;
        // peds on the carriageway are real blockers; on the sidewalk they just get the horn.
        // Off the carriageway ourselves (a set-piece detour down the market alley, the kerb)
        // we also crawl past anyone near our path below knockMinSpeed (a nudge: no knock, no heat)
        // — they panic and run sideways, so watch a wide strip, not just our footprint
        if (kind === 'ped' && st <= 1 && (detour || Math.abs(rvU) > hw + 0.3) && along > -3 && along < 24 && Math.abs(eu - rvU) < 4) pedCrawl = Math.min(pedCrawl, Math.max(0, along - 4.3));
        if (kind === 'ped' && (this.brakeForPeds || Math.abs(eu) < road.hw(e[4]) + 0.4)) { soft = false; hwid = 1.0; }
      }
      if (hwid == null || kind === 'train') continue;
      if (!VEH[kind] && !MOVING1.has(kind) && kind !== 'ped' && (st === 1 || st === 2) && kind !== 'flashbang') continue; // knocked flying / gone
      const ve = vel.get(e[0]) || [0, 0];
      const hd = road.heading(e[4]);
      const vAlong = ve[0] * Math.sin(hd) + ve[1] * Math.cos(hd);
      // orientation-aware extents for vehicles (freight wagons / turned cars lie across the road)
      if (VEH[kind]) {
        const phi = e[5] - hd, sp = Math.abs(Math.sin(phi)), cp = Math.abs(Math.cos(phi));
        const W = hwid, Lh = len;
        hwid = Lh * sp + W * cp; len = Lh * cp + W * sp;
      }
      // lateral motion: sweep the u range it covers until we get there (≤ 3 s)
      const vU = -(ve[0] * Math.cos(hd) - ve[1] * Math.sin(hd));
      let uC = eu;
      if (Math.abs(vU) > 1.5 && !soft) {
        const tA = Math.min(3, Math.max(0, along - len - 4.3) / Math.max(4, Math.abs(v)));
        uC = eu + vU * tA / 2; hwid += Math.abs(vU * tA) / 2;
      }
      const stat = Math.hypot(ve[0], ve[1]) < 0.6;   // parked / dropped / wrecked: a smaller safety margin
      blockers.push({ kind, u: uC, hw: hwid, d: Math.max(0, along - len - 4.3), end: along + len, vAlong, soft, w: SOFT_W[kind] ?? 0.6, stat });
    }
    // set-piece road blocks (snapshot.setpieces[].blocks: [z0, z1, u0, u1])
    for (const sp of snap.setpieces || []) {
      for (const b of sp.blocks || []) {
        if (b[1] < rv.z - 6 || b[0] > front + look + 40) continue;
        blockers.push({ kind: 'block', u: (b[2] + b[3]) / 2, hw: (b[3] - b[2]) / 2, d: Math.max(0, b[0] - front), end: b[1] - rv.z, vAlong: 0, soft: false, w: 1, hard: true, stat: true, sp: true });
      }
    }
    // direct laneBlocked() probes when we have the sim (plugins without `blocks`)
    if (this.sim && typeof this.sim.laneBlocked === 'function') {
      for (const cnd of cands) {
        if (cnd.cost > 100) continue;
        for (const k of [6, 18, 32]) {
          if (this.sim.laneBlocked(front + k, cnd.u)) { blockers.push({ kind: 'block', u: cnd.u, hw: 0.2, d: k, end: k + 4, vAlong: 0, soft: false, w: 1, hard: true, stat: true }); break; }
        }
      }
    }
    // structure walls (toll islands / guard walls, car wash) + the median barrier
    for (const b of this._staticBlockers) {
      if (b.z1 < rv.z - 6 || b.z0 > front + look) continue;
      blockers.push({ kind: b.kind, u: b.u, hw: b.hw, d: Math.max(0, b.z0 - front), end: b.z1 - rv.z, vAlong: 0, soft: false, w: 1, hard: true, stat: true, wall: true });
    }
    // squeeze lines: just beside the nearest stationary obstacles (a dropped car half in a lane,
    // a wreck): the lane centres may all be "blocked" while the RV still fits past it
    {
      const lim = hw + sh + Math.min(2.5, Math.max(0, road.sideRoom(rv.z) - 1.8));
      const near = blockers.filter((b) => b.stat && !b.soft && !b.wall && b.d < 45).sort((a, b) => a.d - b.d).slice(0, 4);
      for (const b of near) for (const side of [1, -1]) {
        const u = b.u + side * (b.hw + 1.5 + 0.3);
        if (Math.abs(u) > lim) continue;
        if (median && (Math.sign(u) !== mySide || Math.abs(u) < 1.7)) continue;
        const cnd = { u, cost: 1.2, hug: true };
        costAdj(cnd);
        cands.push(cnd);
      }
    }

    // RV half-width 1.3 + a safety margin: 0.35 m to anything moving, 0.2 m to stationary things
    const rvHalf = 1.3 + 0.35, rvHalfStat = 1.3 + 0.2;
    const over = (b, lo, hi) => { const m = b.stat ? rvHalfStat : rvHalf; return !(b.u + b.hw + m < lo || b.u - b.hw - m > hi); };
    const oncLook = Math.max(150, Math.abs(v) * 7);
    const evalCand = (cu) => {
      let dmin = look, vb = 99, soft = 0, hard = false, wall = false, onc = false, oncD = Infinity;
      // distance we cover while moving across to cu (lanes in between matter for that long)
      const dPass = Math.max(5, Math.abs(v) * Math.abs(cu - rvU) / 2.5);
      const lo = Math.min(cu, rvU), hi = Math.max(cu, rvU);
      for (const b of blockers) {
        const range = b.vAlong < -1 ? Math.max(look + Math.min(80, -b.vAlong * 2.5), oncLook) : look;
        if (b.d > range) continue;
        if (b.conv && Math.abs(cu - rvU) < 0.8) continue;
        let rel = over(b, cu, cu);
        if (!rel && b.d < dPass && !over(b, rvU, rvU)) rel = over(b, lo, hi);
        if (!rel) continue;
        if (b.soft) { soft += b.w * (b.d < 40 ? 1 : 0.4); continue; }
        // same-direction vehicle going faster than we want isn't blocking
        if (b.vAlong > cruise - 1) continue;
        // oncoming: what matters is the time to meet, express it as an equivalent distance
        const dEff = b.vAlong < -1 ? b.d * Math.max(1, Math.abs(v)) / Math.max(1, Math.abs(v) - b.vAlong) : b.d;
        if (dEff < dmin) { dmin = dEff; vb = Math.max(0, b.vAlong); hard = !!b.hard; wall = !!b.wall; }
        if (b.vAlong < -1 && b.d < oncLook) onc = true;
        if (b.vAlong < -1 && b.d < oncD) oncD = b.d;
      }
      return { dmin, vb, soft, hard, wall, onc, oncD };
    };
    // surface speed caps: shoulder / dirt / sand (vehicle.js topFactor)
    const RR = this.rules.rv, SC = this.rules.sim?.rv || {};
    const sandy = (SC.sandBiomes || ['ghosttown', 'hideout']).includes(bId);
    const surfCap = (u) => (Math.abs(u) > hw + sh ? RR.topSpeed * (sandy ? RR.sandSlow : RR.offroadSlow)
      : Math.abs(u) > hw ? RR.topSpeed * (SC.shoulderSlow ?? 0.85) : Infinity);
    let best = null;
    const hereLane = evalCand(rvU);
    const stuckBehind = hereLane.dmin < look && hereLane.vb > 1 && hereLane.vb < cruise - 5;
    for (const cnd of cands) {
      const r = evalCand(cnd.u);
      const blocked = r.dmin < look;
      const vb = blocked ? r.vb : 99;
      // attainable speed in this lane + time to collision (closing speed counts oncoming cars)
      const gap = 2.5 + Math.max(0, vb) * 0.35;
      const vAch = Math.min(surfCap(cnd.u), blocked ? Math.min(cruise, Math.max(0, Math.max(0, vb) + Math.sign(r.dmin - gap) * Math.sqrt(2 * 5 * Math.abs(r.dmin - gap)))) : cruise);
      const ttc = blocked ? r.dmin / Math.max(1, Math.abs(v) - vb) : 9;
      cnd.r = r; cnd.vAch = vAch;
      cnd.score = vAch * 0.5 + Math.min(ttc, 5) * 1.5 - cnd.cost - r.soft;
      // never pull out into the oncoming lanes with traffic coming (a long clear stretch is needed)
      if (cnd.u < -0.5 && r.oncD < oncLook) cnd.score -= rvU < -0.5 ? 8 : 25;
      if (this.choiceU != null && Math.abs(cnd.u - this.choiceU) < 0.5) cnd.score += stuckBehind ? 1.0 : 2.5; // hysteresis
      // stuck behind something slow on a two-lane road and the oncoming lane is clear for a long way: go round
      if (stuckBehind && cnd.u < -0.5 && r.oncD >= oncLook && !median && r.dmin >= look) cnd.score += 2.5;
      if (!best || cnd.score > best.score) best = cnd;
    }
    // commit to a lane choice for a moment (no flip-flopping) unless the new one is clearly better
    if (this.choiceU != null && Math.abs(best.u - this.choiceU) > 0.5 && snap.t - (this.choiceT ?? -9) < 1.2) {
      const keep = cands.find((cnd) => Math.abs(cnd.u - this.choiceU) < 0.5);
      if (keep && keep.score > best.score - 4) best = keep;
    }
    if (this.choiceU == null || Math.abs(best.u - this.choiceU) > 0.5) this.choiceT = snap.t;
    let uT = best.u;
    let vT = cruise;
    if (best.r.dmin < look) vT = Math.min(vT, best.vAch);
    // a set-piece block (drawbridge up, wide load, wagons…) clears by itself: wait for it a while;
    // a structure wall never does (unstick / reset instead)
    waitHard = best.r.dmin < look && best.r.hard && !best.r.wall && best.vAch < 3;
    // also respect what is right in front of us while we are still changing lanes
    const here = evalCand(rvU);
    if (here.dmin < 8 + Math.abs(v) * 0.4 && Math.abs(best.u - rvU) > 1) {
      const vHere = Math.max(0, Math.max(0, here.vb) + Math.sign(here.dmin - 2) * Math.sqrt(2 * 5 * Math.abs(here.dmin - 2)));
      // crawl while steering out from behind it (need forward motion to turn)
      vT = Math.min(vT, here.dmin > 1.2 ? Math.max(vHere, 3) : vHere);
    }
    this.choiceU = uT;
    this.dbg = { mode, best: { u: best.u, vAch: best.vAch, dmin: best.r.dmin, vb: best.r.vb } }; // for debugging/tests

    // ── mode overrides ────────────────────────────────────────────────────────
    let inLotNow = false;
    if (mode === 'stop') {
      const { st, lot } = target;
      const dz = st.z - rv.z;
      const begin = st.lotLength / 2 + 45;
      if (dz < begin) {
        uT = lot.u;
        this.choiceU = null;
      }
      const inLot = Math.abs(rv.z - lot.cz) < lot.halfLen - 3 && Math.abs(rv.x - lot.cx) < lot.halfDepth - 1.4;
      vT = Math.min(vT, Math.sqrt(2 * 3.2 * Math.max(0, dz - 1)) + 0.5);
      if (dz < begin && dz > 4) vT = Math.min(vT, Math.max(4, dz * 0.45));
      if (inLot && dz < 6) vT = 0;
      if (inLot && Math.abs(dz) < st.lotLength / 2 - 3) vT = 0;
      inLotNow = inLot;
    } else if (mode === 'jump') {
      const laneU = forwardLaneU(road, br.lip);
      const toLip = br.lip - rv.z;
      // the last 200 m (ramp approach) is clear: line up and floor it; before that keep dodging rocks
      if (toLip < 200) { uT = laneU; vT = 99; }
      else vT = Math.max(vT, Math.min(this.cruise, vT + 2));
      const nitroLeft = snap.inv.gadgets.nitro || 0;
      const secs = this.rules.rv.nitroSeconds;
      if (this.useNitro && nitroLeft > 0 && rv.nitro <= 0 && br.lip - rv.z < Math.abs(v) * secs + 15 && br.lip - rv.z > 20) inp.nitro = true;
    } else if (mode === 'sell') {
      const dz = this.sell.z - rv.z;
      uT = Math.min(this.sell.u, hw + sh + 3);
      vT = Math.min(vT, Math.sqrt(2 * 3 * Math.max(0, dz)) + 0.3);
      if (snap.sell.dist < snap.sell.radius - 3 || dz < 2) vT = 0;
    }
    // ── rail lines (the main line + the freight yard siding) ───────────────────
    // A train warning/passing or the runaway wagons rolling (gatesDown): stop 12 m short. If
    // that's no longer possible, brake hard to stop ≥ 4 m clear of the rails; if even that
    // can't be done (warning only — the train isn't there yet), commit and cross. Never stand
    // still within ~4 m of a rail line: don't drive in behind a queue that would stop us there.
    // vehicles in our lane going our way (they will queue at a closed crossing)
    const laneQ = blockers.filter((b) => VEH[b.kind] && !COPS.has(b.kind) && b.kind !== 'freight_wagon' && b.kind !== 'tornado' && b.vAlong > -1 && (over(b, best.u, best.u) || over(b, rvU, rvU)));
    const rail = this._rails(snap, rv, v, best, laneQ, evalCand(rvU));
    this._lastRail = rail;
    if (rail.vT != null) vT = Math.min(vT, rail.vT);
    let gates = rail.gates;
    // other set-pieces with gates and no rail line: stop 12 m before their z
    for (const sp of snap.setpieces || []) {
      if (!sp.gatesDown || sp.railZ != null) continue;
      const def = this.spDefs.get(sp.id);
      const zg = def ? (def.z ?? def.from) : null;
      if (zg != null && (gates == null || zg - rv.z < gates)) gates = zg - rv.z;
      if (zg != null && zg - rv.z > -3 && zg - rv.z - 12 < 90) vT = Math.min(vT, Math.sqrt(2 * 5 * Math.max(0, zg - rv.z - 12)));
    }
    // toll booths: thread them slowly
    if (tollNear) { const d = tollNear.z - rv.z; if (d > -8 && d < 80) vT = Math.min(vT, 11 + Math.max(0, d - 15) * 0.2); }
    // curves: lateral grip limit (look 15–45 m ahead)
    if (mode !== 'jump') {
      let k = 0;
      for (const d of [15, 30, 45]) k = Math.max(k, Math.abs(road.heading(rv.z + d + 5) - road.heading(rv.z + d - 5)) / 10);
      if (k > 1e-4) vT = Math.min(vT, Math.sqrt(7.5 / k));
    }
    // off the carriageway in town (sidewalk, market-alley detour): walking pace-ish, and a crawl
    // (under the peds' knockMinSpeed) when someone is right in front
    if (sidewalk && (Math.abs(rvU) > hw + 0.3 || Math.abs(uT) > hw + 0.3)) vT = Math.min(vT, 10);
    if (pedCrawl < Infinity) vT = Math.min(vT, 2.5 + Math.max(0, pedCrawl - 6) * 0.5);
    // just out of the garage (or any big heading error off the carriageway): turn onto the road gently
    const yawErr = Math.abs(wrapAngle(rv.yaw - road.heading(rv.z)));
    if (yawErr > 0.6 && Math.abs(rvU) > hw - 1) vT = Math.min(vT, 6);

    vT = Math.min(vT, this.maxSpeed);

    this._gadgets(snap, inp, mode, copBehind, rivalNear, target);
    inp.horn = pedAhead;

    if (rail.floor != null) vT = Math.max(vT, best.r.dmin < 4 ? 0 : Math.min(cruise, this.maxSpeed, rail.floor));
    if (rail.crossCap != null) vT = Math.min(vT, rail.crossCap);
    this._steerRoad(inp, rv, uT, rvU, v);
    this._speed(inp, v, vT);
    if (rail.hard && v > vT + 0.5) { inp.throttle = -1; inp.handbrake = false; }

    // ── unstick: wedged against something (or waiting behind a wreck) → reverse a bit, or reset ─────────
    const trainWait = rail.wait || (gates != null && gates > -3 && gates < 40);
    const loading = !!snap.stop || (mode === 'sell' && vT <= 0.01) || (inLotNow && vT <= 0.01);
    const waitingOnBlocker = (best.r.dmin < 6 || vT < 0.5) && !trainWait && !(waitHard && (this.hardT || 0) < HARD_WAIT);
    if ((inp.throttle > 0.5 || waitingOnBlocker) && Math.abs(v) < 0.8 && !loading) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt * 0.5);
    // rails: holding short of a crossing → no forward getaway; a rail line just behind → no reversing
    const keepR = (this.rules.rv.length ?? 8.6) / 2 + 4;
    // (a getaway may still cross ahead of the yard wagons / a queue; never in front of the train)
    const railHold = rail.train && rail.vT != null && rail.vT < 1.5;
    const railBehind = (this.layout.railLines || []).some((r) => rv.z - r.z > -keepR && rv.z - r.z < keepR + 4);
    // being boxed in by cops: commit to a getaway (forward if anything is open, else reverse out first)
    if (snap.bust > 0.1 && Math.abs(v) < 4 && this.reverseT <= 0 && this.escapeT <= 0 && !loading && !railHold) {
      if (best.r.dmin > 5) this.escapeT = 1.8; else if (!railBehind) { this.reverseT = 1.0; this.escapeU = best.u; }
      this.stuckT = 0;
    }
    if (railHold) this.escapeT = 0;
    if (railBehind) this.reverseT = 0;
    if (this.escapeT > 0) {
      this.escapeT -= dt;
      inp.throttle = 1; inp.handbrake = false;
    }
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      // back up while swinging the nose toward the free lane (reversing flips the steering)
      const du = (this.escapeU ?? uT) - rvU;
      inp.throttle = -1; inp.handbrake = false;
      inp.steer = Math.abs(du) > 0.8 ? -Math.sign(du) * 0.8 : 0;
      if (this.reverseT <= 0 && snap.bust > 0.05) this.escapeT = 1.8;
    } else if (this.stuckT > 1.2) { this.reverseT = railBehind ? 0 : 1.8; this.escapeU = best.u; this.stuckT = 0; this.stuckCount = (this.stuckCount || 0) + 1; }
    if (Math.abs(v) > 8) this.stuckCount = 0;
    if ((this.stuckCount || 0) >= 3 && !rv.airborne) { inp.reset = true; this.stuckCount = 0; }
    // facing the wrong way (spun out) and slow for a while → reset onto the road
    const yErr = Math.abs(wrapAngle(rv.yaw - road.heading(rv.z)));
    if (yErr > 1.0 && Math.abs(v) < 6 && !rv.airborne && !loading && Math.abs(rvU) < hw + sh + 6) {
      this.wrongT = (this.wrongT || 0) + dt;
      if (this.wrongT > 4) { inp.reset = true; this.wrongT = 0; }
    } else this.wrongT = Math.max(0, (this.wrongT || 0) - dt);
    // progress watchdog: the furthest point reached hasn't moved 15 m in 20 s while nothing is
    // meant to hold us → reset onto the road
    // waiting at a set-piece block (drawbridge, wide load…) is fine for a while, not forever (wrecks)
    // (decays slowly: backing off and coming back to the same block doesn't restart the wait)
    if (waitHard) this.hardT = (this.hardT || 0) + dt; else this.hardT = Math.max(0, (this.hardT || 0) - dt * 0.25);
    const holdOk = trainWait || (waitHard && this.hardT < HARD_WAIT) || loading || inLotNow || (mode === 'sell' && snap.sell && snap.sell.dist < 40);
    if (this.progZ == null || rv.z > this.progZ + 15 || holdOk) { this.progZ = Math.max(rv.z, holdOk ? -1e9 : (this.progZ ?? -1e9)); this.progT = snap.t; }
    else if (snap.t - this.progT > 20 && !rv.airborne) {
      inp.reset = true; this.progZ = rv.z; this.progT = snap.t; this.resets = (this.resets || 0) + 1;
      if (mode === 'stop' && target) this.skipped.add(target.st.id);   // can't get into that lot: drive on
    }
    // a reset puts us somewhere new: forget the old unstick manoeuvres
    if (inp.reset) { inp.throttle = 0; this.reverseT = 0; this.escapeT = 0; this.stuckT = 0; this.stuckCount = 0; this.wrongT = 0; this.choiceU = null; }
    return inp;
  }

  // Rail-line logic → { vT, hard, cross, wait, gates }. this.railCommit = z of the line being crossed.
  //  • danger (train warning/passing on the main line, the yard wagons rolling = gatesDown on
  //    the siding): stop 12 m short; too late for that → brake hard to stop ≥ 4 m clear; too
  //    late even for that while the train is only WARNING (or already on the rails) → commit
  //    and cross. While it is PASSING and the nose isn't over the rails → stop.
  //  • keep clear: never drive into a rail band (RV body within 4 m of a rail line) when the
  //    place we'll stop (our own stop line for the next rail, or the tail of a slow queue)
  //    is inside a band — e.g. traffic stopped for the wagons filling the one RV-sized slot
  //    between the main line and the siding.
  _rails(snap, rv, v, best, laneQ = [], here = null) {
    const out = { vT: null, hard: false, cross: false, wait: false, gates: null, train: false };
    const RVH = (this.rules.rv.length ?? 8.6) / 2;
    const M = 1.8;                                // aim this far outside a band (braking overshoot, room to stop again)
    const keep = RVH + 4;                         // RV centre ↔ rail line to stand still (body ≥ 4 m clear)
    const nose = RVH + 2.4;                       // closer than this the nose is over the rails
    const STOP = 12;                              // normal stop line (centre) before a rail line
    const aSoft = 5, aHard = 0.7 * (this.rules.rv.brake ?? 14);
    const lim = (x) => { out.vT = out.vT == null ? x : Math.min(out.vT, x); };
    const v2 = Math.max(0, v) ** 2;
    // stop at `room` m ahead: gently if possible, else hard
    const stopIn = (room) => {
      room = Math.max(0, room);
      if (v2 / (2 * aSoft) <= room + 0.5) lim(Math.sqrt(2 * aSoft * room));
      else { lim(Math.sqrt(2 * aHard * room)); out.hard = true; }
    };
    const lines = [];
    for (const rl of this.layout.railLines || []) {
      const d = rl.z - rv.z;
      if (this.railCommit === rl.z && d < -keep - 0.5) this.railCommit = null;
      if (d < -keep - 0.5 || d > 180) continue;
      let danger = null;
      if (rl.kind === 'main' && snap.train && Math.abs(snap.train.z - rl.z) < 3 && (snap.train.state === 'warn' || snap.train.state === 'pass')) danger = snap.train.state;
      for (const sp of snap.setpieces || []) if (sp.gatesDown && sp.railZ != null && Math.abs(sp.railZ - rl.z) < 3) danger = danger ?? 'gates';
      // a siding whose wagons haven't run yet (they may roll out the moment we pass the main line)
      const armed = (snap.setpieces || []).some((sp) => sp.railZ != null && Math.abs(sp.railZ - rl.z) < 3 && sp.phase === 'idle');
      lines.push({ z: rl.z, d, danger, armed });
    }
    if (!lines.length) return out;
    // approaching a main line with an armed siding right behind it: cross slowly enough (≤ 14 m/s)
    // to stop short of the siding if the wagons start rolling as soon as we're over
    for (let i = 0; i + 1 < lines.length; i++) {
      const A = lines[i], B = lines[i + 1];
      if (B.armed && B.z - A.z < 30 && A.d > -keep && A.d < 60) lim(Math.max(14, Math.sqrt(14 * 14 + 2 * aSoft * Math.max(0, A.d - 25))));
    }
    // rails < 30 m apart are one crossing: danger on the far one stops us before the near one
    // (the gap between the main line and the yard siding holds one RV at best)
    for (let i = lines.length - 2; i >= 0; i--) {
      const A = lines[i], B = lines[i + 1];
      if (B.danger && !A.danger && B.z - A.z < 30 && A.d > nose && this.railCommit !== A.z && this.railCommit !== B.z) A.danger = 'group';
    }
    // where will we come to a stop? our own stop lines (rails in danger ahead), the queue that
    // will form in our lane before such a rail, or the tail of a slow queue right now
    // zWait: the part of that which will clear by itself (a train, the wagons, a queue that moves)
    let zStop = Infinity, zWait = Infinity;
    for (const L of lines) {
      if (!L.danger || this.railCommit === L.z || L.d <= keep) continue;
      zStop = Math.min(zStop, L.z - STOP); zWait = Math.min(zWait, L.z - STOP);
      let q = 0;
      for (const b of laneQ) if (b.end < L.d - 2) q += Math.max(0, b.end - b.d - 4.3) + 2.5;
      if (q > 0) { const z = L.z - 5 - q - 2.5 - RVH; zStop = Math.min(zStop, z); zWait = Math.min(zWait, z); }
    }
    if (best && best.r.dmin < 90 && best.r.vb < 7) {
      const z = rv.z + best.r.dmin - 2.5;
      zStop = Math.min(zStop, z);
      if (best.r.vb > 0.5) zWait = Math.min(zWait, z);
    }
    if (here && here.dmin < 90 && here.vb > 0.5 && here.vb < 7) { const z = rv.z + here.dmin - 2.5; zStop = Math.min(zStop, z); zWait = Math.min(zWait, z); }
    // the exit isn't clear: we'd stop before getting our whole body past the band
    const stopsIn = (L) => zStop < L.z + keep + 0.3;
    for (const L of lines) {
      const d = L.d;
      if (this.railCommit === L.z) {
        out.cross = true;
        // another rail right after this one (the yard siding): cross at a speed that can still
        // stop short of it if its wagons start rolling the moment we're over
        if (lines.some((N) => N.z > L.z && N.z - L.z < 30)) out.crossCap = 14;
        continue;
      }
      if (L.danger) {
        if (out.gates == null || d < out.gates) out.gates = d;
        if (L.danger === 'warn' || L.danger === 'pass') out.train = true;
        if (d > STOP - 0.5 && d - STOP >= v2 / (2 * aSoft) - 1.5) {
          lim(Math.sqrt(2 * aSoft * Math.max(0, d - STOP)));          // the normal stop line
          if (d < STOP + 40) out.wait = true;
        } else if (d > keep && d - keep - M >= v2 / (2 * aHard) - 0.5) {
          stopIn(d - keep - M); out.hard = true; out.wait = true;      // late: hard, short of the band
        } else if (d > nose && (L.danger !== 'warn' || stopsIn(L))) {
          // the train / the wagons are coming through (or no way out beyond): full brake now
          lim(0); out.hard = true; out.wait = true;
        } else {
          // only a warning (the train isn't here yet), or the nose is already over the rails: go
          this.railCommit = L.z; out.cross = true;
        }
        continue;
      }
      // keep clear: don't drive into this band if we'd come to a stop inside it
      if (stopsIn(L)) {
        const w = zWait < L.z + keep + 0.3;
        if (d > keep + 0.3) { stopIn(d - keep - M); if (d < keep + 8 && w) out.wait = true; }
        else if (d > nose) { lim(0); out.hard = true; if (w) out.wait = true; }
      }
    }
    // committed: keep rolling until the body is clear of that band — gently (4 m/s) if another
    // rail line just beyond wants us stopped (the slot between the main line and the siding)
    if (out.cross) out.floor = out.vT != null ? Math.max(4, Math.min(14, out.vT)) : 14;
    return out;
  }

  _autoShop(snap) {
    const stop = snap.stop;
    if (!stop) return;
    if (stop.state === 'shopping') {
      if (this.shopT0 == null || this.shopFor !== stop.id) { this.shopT0 = snap.t; this.shopFor = stop.id; this.stats.stopsParked++; }
      if (this.onDriverCommand && this.autoShop != null && this.shopSent !== stop.id && snap.t - this.shopT0 >= this.autoShop) {
        this.shopSent = stop.id;
        this.stats.shopDoneSent++;
        this.onDriverCommand({ type: 'shopDone', stopId: stop.id, score: this.autoShopScore });
      }
    }
  }

  _gadgets(snap, inp, mode, copBehind, rivalNear, target) {
    const g = snap.inv.gadgets, rv = snap.rv;
    if (this.gadgetCd > 0 || mode === 'jump') return;
    if (snap.bust > 0.15 && g.smoke > 0) { inp.smoke = true; this.gadgetCd = 3; }
    // shake the tail before pulling into a supply stop (a chasing cop nearby blocks loading)
    else if (mode === 'stop' && copBehind < 35 && target && target.st.z - rv.z < 120 && (g.smoke > 0 || g.oil > 0)) {
      if (g.oil > 0) inp.oil = true; else inp.smoke = true;
      this.gadgetCd = 4;
    }
    else if (copBehind < 22 && g.oil > 0) { inp.oil = true; this.gadgetCd = 3; }
    else if (copBehind < 16 && g.smoke > 0) { inp.smoke = true; this.gadgetCd = 3; }
    else if (rivalNear < 12 && g.oil > 0) { inp.oil = true; this.gadgetCd = 3; }
    else if (rivalNear < 9 && g.smoke > 0) { inp.smoke = true; this.gadgetCd = 3; }
  }

  // pure pursuit on the road frame toward lateral offset uT
  _steerRoad(inp, rv, uT, rvU, v) {
    const road = this.road;
    const Ld = 7 + Math.abs(v) * 0.55;
    const zL = rv.z + Ld;
    // ease the lateral target so lane changes are smooth
    const uL = rvU + clamp(uT - rvU, -Ld * 0.35, Ld * 0.35);
    this._steerTo(inp, rv, road.xAt(zL, uL), zL, v, Ld);
  }

  _steerTo(inp, rv, xL, zL, v, Ld = null) {
    const want = Math.atan2(xL - rv.x, zL - rv.z);
    const alpha = wrapAngle(want - rv.yaw);
    const L = Ld ?? Math.max(4, Math.hypot(xL - rv.x, zL - rv.z));
    const R = this.rules.rv, C = this.rules.sim?.rv || {};
    const full = C.steerFullAt ?? 5, fall = C.steerFalloff ?? 18;
    const av = Math.max(1, Math.abs(v));
    const f = Math.min(1, av / full) / (1 + Math.max(0, av - full) / fall);
    const wWant = (2 * Math.sin(alpha) / L) * av;
    let steer = -wWant / (R.steerRate * f);
    if (v < 0) steer = -steer;
    inp.steer = clamp(steer, -1, 1);
  }

  _speed(inp, v, vT) {
    const err = vT - v;
    if (vT <= 0.01) {
      inp.throttle = v > 0.6 ? -1 : 0;
      if (Math.abs(v) < 1.5) inp.handbrake = true;
    } else if (err > 0.5) inp.throttle = 1;
    else if (err < -2.5) inp.throttle = -clamp(-err / 6, 0.3, 1);
    else inp.throttle = clamp(err * 0.5 + 0.3, 0, 1);
  }
}

export default Autopilot;
