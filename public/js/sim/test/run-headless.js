// ─────────────────────────────────────────────────────────────────────────────
// Headless sim tests:  npm run test:sim   (node public/js/sim/test/run-headless.js)
//   a) full 40 km run: Autopilot + fake cook + fake shop driver (shopDone 0.8 after ~25 s)
//      + the solo roof AI → WIN; per-area timing, stops, set-pieces, stars, regen
//   a') forced 5★ on the freeway: the Rhino overtakes, throws flash/foam canisters
//   a'') cruise mode = main.js's labPilot driving for the solo player while they cook
//      (maxSpeed 19, no stops, no nitro, no sim handle): 0 → 38 km without getting wrecked,
//      busted or stuck, never hit by the train, never standing within 4 m of a rail line
//   b) jump at the new lip (38900): ~70% of speedNeeded falls → checkpoint; full speed clears
//   c) busted: stand still at 3 stars → busted; a moving RV is not busted
//   d) determinism: same seed + inputs → identical snapshots
//   e) netSnapshot JSON size (avg < 4 KB, every one < 64 KB)
//   f) performance: steps / second
//   g) lab coupling: cookHurt, cook-down (12 s → 25 hp), curtains/spotted, recipe flow
//   h) garage phase: stub tutorial → countdown; ONFOOT's tutorial played with scripted
//      inputs (Autopilot tutorial:'play'); skipTutorial; door collider; drive out
//   i) stop flow: parked → shopping → returning → loading → done, bonus, cop blocking,
//      disabled cops don't block, abort, drive-off, alarm, nearStop banner range
//   j) hazards apply their effects (+ placement rules)
//   k) helper API smoke test; car-wash fallback; rail-crossing zone; reset placement
//   l) Round 3: withDifficulty levers · snapshot/EndResult difficulty · bust grace per difficulty ·
//      regen on all three bars · cop effects (holes/crack/tyre 9/radiator 10/duck) + copFx ·
//      return fire only while Rook is up · chase fire only from chaseStars · stop response cops ·
//      DCMD roof routing + the cook's old roof commands ignored
//   m) full 40 km bot runs on Easy and Extreme (Hard = a): Easy wins, Extreme ends and is clearly
//      harder (more damage taken / busted). --diffSeeds=1,2 adds seeds to the comparison.
//   r) DEFEND's sim/test/roof-*.js (if present), each run as a child process
// Options: --seed=N  --seeds=1,2 (extra full + cruise runs; informational)  --seeds=none (default)
//          --only=a,b,…  --strict (extra seeds must win too)  --verbose
// ─────────────────────────────────────────────────────────────────────────────
import { loadDataNode } from '../../data/loadData.js';
import { GameSim } from '../GameSim.js';
import { Autopilot } from '../autopilot.js';
import { computeSpeedNeeded } from '../bridge.js';
import { KIND, KIND_ID, EV } from '../../shared/protocol.js';
import { withDifficulty, normDifficulty, difficultyInfo, DIFFICULTIES } from '../../shared/difficulty.js';

const DT = 1 / 60;
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const VERBOSE = !!args.verbose;
const SEED = args.seed ? +args.seed : null;
const ONLY = args.only ? new Set(String(args.only).split(',')) : null;
const run = (k) => !ONLY || ONLY.has(k);
const TRACE = args.trace != null ? +args.trace : null;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  return ok;
}
const hr = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 70 - t.length))}`);
const fmtT = (s) => { const r = Math.round(s); return `${Math.floor(r / 60)}m${String(r % 60).padStart(2, '0')}s`; };
const COPK = new Set(['cop', 'cop_suv', 'interceptor', 'moto_cop', 'rhino_truck']);

// A fake cook: requests recipes when materials allow (premium > street; one nitro once ice is in),
// sends recipeDone after `cookSeconds` of sim time with quality q, patches the RV when it is hurt.
// Curtains stay closed; the vent opens when fumes build up (visible smoke → a little heat → cops).
class FakeCook {
  constructor(data, { cookSeconds = 25, quality = 0.8, ventPolicy = 'always' } = {}) {
    this.data = data; this.cookSeconds = cookSeconds; this.q = quality; this.ventPolicy = ventPolicy;
    this.busy = null; this.req = 0; this.nitroMade = 0; this.log = [];
    this.recipes = Object.fromEntries(data.lab.recipes.map((r) => [r.id, r]));
  }
  can(mat, id) { return Object.entries(this.recipes[id].needs).every(([k, n]) => (mat[k] || 0) >= n); }
  update(sim, snap) {
    for (const e of snap.events) {
      if (e.type === 'recipeOk' && this.busy && e.reqId === this.busy.reqId) this.busy.ok = true;
      if (e.type === 'recipeDenied' && this.busy && e.reqId === this.busy.reqId) this.busy = null;
    }
    if (this.busy && this.busy.ok && sim.t - this.busy.t0 >= this.busy.dur) {
      sim.applyCookCommand({ type: 'recipeDone', reqId: this.busy.reqId, recipeId: this.busy.id, quality: this.q });
      this.log.push(`${fmtT(sim.t)} ${this.busy.id}`);
      this.busy = null;
    }
    if (!this.busy && !snap.crew.cookDown && snap.phase === 'drive') {
      const mat = snap.inv.mat;
      let id = null;
      const g = snap.inv.gadgets, need = this.data.route.sellPoint.requiredUnits;
      if (snap.rv.hp < 60 && this.can(mat, 'patch')) id = 'patch';
      else if (this.nitroMade < 1 && this.can(mat, 'nitro') && (mat.ice || 0) >= 1) id = 'nitro';
      // with enough product for the buyer, Doc crafts one smoke bomb and one oil slick for the finale
      else if (snap.inv.units >= need + 4 && (g.smoke || 0) < 1 && this.can(mat, 'smoke')) id = 'smoke';
      else if (snap.inv.units >= need + 4 && (g.oil || 0) < 1 && this.can(mat, 'oil')) id = 'oil';
      else if (this.can(mat, 'premium')) id = 'premium';
      else if (this.can(mat, 'street') && !this._savePremium(mat)) id = 'street';
      if (id) {
        if (id === 'nitro') this.nitroMade++;
        this.busy = { id, reqId: ++this.req, t0: sim.t, ok: false, dur: ['nitro', 'patch', 'smoke', 'oil'].includes(id) ? 10 : this.cookSeconds };
        sim.applyCookCommand({ type: 'startRecipe', reqId: this.busy.reqId, recipeId: id });
      }
    }
    const cooking = !!(this.busy && this.busy.ok && this.recipes[this.busy.id].kind === 'product');
    const dt = this.lastT == null ? 0 : sim.t - this.lastT; this.lastT = sim.t;
    this.fumes = this.fumes ?? 0;
    if (this.vent == null) this.vent = false;
    this.fumes = Math.max(0, Math.min(1, this.fumes + ((cooking ? 0.05 : 0) - (this.vent ? 0.12 : 0.01)) * dt));
    if (this.ventPolicy === 'always') this.vent = cooking || this.fumes > 0.3;
    else if (this.fumes > 0.6) this.vent = true; else if (this.fumes < 0.25) this.vent = false;
    sim.setLabState({ cooking, recipeId: this.busy ? this.busy.id : null, step: 0,
      stepType: null, temp: 150, fumes: this.fumes, fire: 0, ventOpen: this.vent, curtains: true, cookHurt: 0 });
  }
  _savePremium(mat) {
    const needP = this.recipes.premium.needs;
    const haveRare = (mat.catalyst || 0) >= 1 || (mat.syrup || 0) >= 1;
    if (!haveRare) return false;
    for (const k of ['salts', 'solvent', 'fuel']) if ((mat[k] || 0) - 1 < needP[k]) return true;
    return false;
  }
}

// The driver-side shop challenge stand-in: shopDone(score) `seconds` after Rook starts shopping.
class FakeShop {
  constructor({ seconds = 25, score = 0.8 } = {}) { this.seconds = seconds; this.score = score; this.t0 = null; this.id = null; this.sent = new Set(); this.count = 0; }
  update(sim, snap) {
    const st = snap.stop;
    if (!st || st.state !== 'shopping') { this.t0 = null; return; }
    if (this.id !== st.id) { this.id = st.id; this.t0 = sim.t; }
    if (this.t0 == null) this.t0 = sim.t;
    if (!this.sent.has(st.id) && sim.t - this.t0 >= this.seconds) {
      this.sent.add(st.id); this.count++;
      sim.applyDriverCommand({ type: 'shopDone', stopId: st.id, score: this.score });
    }
  }
}

function toDrive(sim, maxSteps = 60 * 10) {
  sim.applyDriverCommand({ type: 'skipTutorial' });
  for (let i = 0; i < maxSteps && sim.phase !== 'drive'; i++) sim.step({ throttle: 0, steer: 0, handbrake: true }, DT);
}
function placeAt(sim, z, u = null) {
  const road = sim.road;
  const uu = u ?? road.laneU(z, 1, Math.max(0, road.lanesPerDir(z) - 2));
  sim.rv.z = z; sim.rv.x = road.xAt(z, uu); sim.rv.yaw = road.heading(z); sim.rv.vx = sim.rv.vz = 0; sim.rv.speed = 0; sim.rv.w = 0;
  sim.rv.medSide = uu >= 0 ? 1 : -1;
  sim.traffic.frontier = z + 40; sim.peds.frontier = z + 40;
  sim.traffic.cars = sim.traffic.cars.filter((c) => Math.abs(c.z - z) > 300);
}

function runFull(data, seed, opts = {}) {
  if (opts.difficulty) data = withDifficulty(data, opts.difficulty);
  const sim = new GameSim(data, { seed, solo: opts.solo ?? true });
  const ap = new Autopilot(data, { seed, sim, onDriverCommand: (c) => sim.applyDriverCommand(c) });
  const cook = new FakeCook(data, opts.cook);
  const shop = new FakeShop(opts.shop);
  let snap = sim.snapshot();
  const stat = { maxStars: 0, jumped: false, landed: false, fell: 0, copsGaveUp: false, gaveUpZ: null, lipSpeed: null,
    cops: 0, events: {}, copsAfterBridge: 0, netBytes: [], copsAliveAtLip: 0, areas: {}, areaOrder: [], setpieces: new Set(),
    rhino: false, motos: 0, regenOn: 0, regenHp: 0, canisters: 0, maxSnapBytes: 0, minHp: 100, fxMax: { fog: 0, flash: 0, shock: 0 },
    roofHits: 0, firstDriveT: null };
  const seenCops = new Set(), seenMoto = new Set();
  const maxSteps = 60 * 60 * 60;
  let i = 0, lastArea = null, tArea = 0, hpPrev = sim.rv.hp;
  for (; i < maxSteps; i++) {
    const inp = ap.update(snap);
    const pre = TRACE != null && inp.reset ? { z: sim.rv.z, u: sim.road.uAt(sim.rv.x, sim.rv.z), cd: sim.rv.resetCd, air: sim.rv.airborne, held: sim.stops.holdsRv() } : null;
    sim.step(inp, DT);
    if (pre && sim.rv.z > TRACE) console.log(`    RESET t=${sim.t.toFixed(1)} from z=${pre.z.toFixed(1)} u=${pre.u.toFixed(1)} cd=${pre.cd.toFixed(2)} air=${pre.air} held=${pre.held} → z=${sim.rv.z.toFixed(1)} u=${sim.road.uAt(sim.rv.x, sim.rv.z).toFixed(1)} mode=${ap.dbg?.mode}`);
    cook.update(sim, snap);
    snap = sim.snapshot();
    shop.update(sim, snap);
    if (sim.phase === 'drive' && stat.firstDriveT == null) stat.firstDriveT = sim.t;
    if (i % 4 === 0) { const b = JSON.stringify(sim.netSnapshot()).length; stat.netBytes.push(b); }
    stat.maxStars = Math.max(stat.maxStars, snap.heat.stars);
    stat.minHp = Math.min(stat.minHp, snap.rv.hp);
    for (const k of ['fog', 'flash', 'shock']) stat.fxMax[k] = Math.max(stat.fxMax[k], snap.fx[k]);
    if (snap.rv.regen && snap.rv.hp > hpPrev) stat.regenHp += snap.rv.hp - hpPrev;
    hpPrev = snap.rv.hp;
    for (const sp of snap.setpieces) stat.setpieces.add(sp.id);
    if (snap.area.id !== lastArea) { if (lastArea) stat.areas[lastArea] = (stat.areas[lastArea] || 0) + (snap.t - tArea); lastArea = snap.area.id; tArea = snap.t; stat.areaOrder.push(lastArea); }
    for (const e of snap.ents) {
      const k = KIND[e[1]];
      if (COPK.has(k) && e[7] !== 0) seenCops.add(e[0]);
      if (k === 'rhino_truck') stat.rhino = true;
      if (k === 'moto_cop') seenMoto.add(e[0]);
    }
    for (const e of snap.events) {
      stat.events[e.type] = (stat.events[e.type] || 0) + 1;
      if (e.type === 'regen' && e.on) stat.regenOn++;
      if (e.type === 'canister') stat.canisters++;
      if (e.type === 'roofHit') stat.roofHits++;
      if (e.type === 'jump' && e.at === 'canyon') { stat.jumped = true; stat.lipSpeed = sim.bridgeSys.launchSpeed; }
      if (e.type === 'landed' && sim.rv.z > data.route.bridge.gapEnd - 2) stat.landed = true;
      if (e.type === 'fell') stat.fell++;
      if (e.type === 'copsGaveUp') {
        stat.copsGaveUp = true; stat.gaveUpZ = sim.rv.z;
        stat.copsAliveAtLip = snap.ents.filter((x) => COPK.has(KIND[x[1]]) && x[7] !== 4).length;
      }
      if (VERBOSE && !['smash', 'pedHit', 'crash', 'gadget', 'regen', 'roof', 'roofHit'].includes(e.type)) console.log(`    ${fmtT(snap.t)} z=${snap.rv.z.toFixed(0)} ${JSON.stringify(e).slice(0, 130)}`);
    }
    if (sim.bridgeSys.passedLip) {
      const chasing = sim.cops.cops.filter((c) => c.state === 1 && c.kind !== 'heli' && !c.plunge).length;
      stat.copsAfterBridge = Math.max(stat.copsAfterBridge, chasing);
    }
    if (TRACE != null && snap.rv.z > TRACE && i % 60 === 0 && (stat.traced = (stat.traced || 0) + 1) < 400) {
      const near = snap.ents.filter((e) => Math.abs(e[4] - snap.rv.z) < 30).map((e) => `${KIND[e[1]]}@${(e[4] - snap.rv.z).toFixed(0)},${sim.road.uAt(e[2], e[4]).toFixed(1)}/${e[7]}`);
      console.log(`    TRACE t=${snap.t.toFixed(1)} z=${snap.rv.z.toFixed(1)} u=${sim.road.uAt(snap.rv.x, snap.rv.z).toFixed(2)} v=${snap.rv.speed.toFixed(1)} yawErr=${(snap.rv.yaw - sim.road.heading(snap.rv.z)).toFixed(2)} stars=${snap.heat.stars} cop=${snap.alert.copDist.toFixed(0)} bust=${snap.bust.toFixed(2)} stop=${snap.stop?.state} ${JSON.stringify(ap.dbg)} thr=${inp.throttle.toFixed(2)} st=${inp.steer.toFixed(2)} hb=${inp.handbrake} reset=${inp.reset}`);
      console.log(`      near ${near.join(' ')} | sp ${snap.setpieces.map((s) => `${s.id}:${s.phase}${s.blocks ? '#' + s.blocks.length : ''}`).join(',')}`);
    }
    if (sim.phase === 'won' || sim.phase === 'lost') break;
  }
  if (lastArea) stat.areas[lastArea] = (stat.areas[lastArea] || 0) + (snap.t - tArea);
  stat.cops = seenCops.size; stat.motos = seenMoto.size;
  return { sim, snap, stat, steps: i, cook, shop, ap };
}

// main.js's labPilot: the Autopilot drives for the solo player while they cook (they hand the
// wheel back before the canyon). No sim handle, no driver commands — snapshots only.
export function runCruise(data, seed, { delay = 0, endZ = 38000, maxMin = 50, onStep = null } = {}) {
  const sim = new GameSim(data, { seed, solo: true });
  for (let i = 0; i < delay * 60; i++) sim.step({ throttle: 0, steer: 0, handbrake: true }, DT);   // the player in the garage
  sim.applyDriverCommand({ type: 'skipTutorial' });
  const ap = new Autopilot(data, { seed, maxSpeed: 19, useNitro: false });
  for (const st of data.route.stops) ap.skipped.add(st.id);
  const cook = new FakeCook(data);
  const rails = sim.structures.layout.railLines || [];
  const keep = sim.rv.len / 2 + 4 - 0.15;
  const dmg = {};
  const dmgRv = sim.damageRv.bind(sim);
  sim.damageRv = (a, cause) => { dmg[cause] = (dmg[cause] || 0) + a; return dmgRv(a, cause); };
  const st = { resets: 0, maxStall: 0, trainHits: 0, railStops: 0, minHp: 100, maxStars: 0, spHits: {} };
  let snap = sim.snapshot(), progZ = -1e9, progT = 0, stillT = 0;
  for (let i = 0; i < maxMin * 3600; i++) {
    const inp = ap.update(snap);
    if (inp.reset) st.resets++;
    sim.step(inp, DT);
    cook.update(sim, snap);
    snap = sim.snapshot();
    if (onStep) onStep(sim, snap, ap, inp, i);
    st.minHp = Math.min(st.minHp, snap.rv.hp); st.maxStars = Math.max(st.maxStars, snap.heat.stars);
    for (const e of snap.events) if (e.type === 'msg' && /hit the train/i.test(e.text)) st.trainHits++;
    if (sim.rv.z > progZ + 15) { progZ = sim.rv.z; progT = sim.t; }
    if (sim.t - progT > st.maxStall) { st.maxStall = sim.t - progT; st.stallAt = `z${progZ.toFixed(0)}@${fmtT(progT)}`; }
    if (rails.some((r) => Math.abs(sim.rv.z - r.z) < keep) && Math.abs(snap.rv.speed) < 0.3) { stillT += DT; if (stillT > 0.5 && stillT - DT <= 0.5) st.railStops++; } else stillT = 0;
    if (sim.phase === 'won' || sim.phase === 'lost' || sim.rv.z >= endZ) break;
  }
  const SP = new Set(['freight_wagon', 'combine', 'wide_load', 'car_carrier', 'tornado', 'flying_car', 'parade_float', 'stagecoach', 'log', 'cattle', 'inflatable_gorilla', 'setpiece']);
  for (const [k, v] of Object.entries(dmg)) if (SP.has(k) || /setpiece|wagon|combine|tornado|carrier|float|stagecoach|gorilla/.test(k)) st.spHits[k] = +v.toFixed(1);
  st.ok = sim.phase === 'drive' && sim.rv.z >= endZ && st.trainHits === 0 && st.railStops === 0;
  return { sim, st, ap, dmg };
}
const cruiseLine = (seed, C) => `seed ${seed} cruise: ${C.st.ok ? 'ok  ' : 'FAIL'} ${C.sim.phase}${C.sim.result ? '/' + C.sim.result.reason : ''} z=${C.sim.rv.z.toFixed(0)} t=${fmtT(C.sim.t)} hp=${C.sim.rv.hp.toFixed(0)} (min ${C.st.minHp.toFixed(0)}) stars≤${C.st.maxStars} resets=${C.st.resets} maxStall=${C.st.maxStall.toFixed(0)}s(${C.st.stallAt || '-'}) train=${C.st.trainHits} railStops=${C.st.railStops} setpieceDmg=${JSON.stringify(C.st.spHits)}`;

async function main() {
  const data = await loadDataNode();
  const seed = SEED ?? data.route.defaultSeed;
  console.log(`Cook & Run — headless sim tests (seed ${seed}, ${data.route.routeLength / 1000} km route)`);
  let A = null;

  // ── a) full run ─────────────────────────────────────────────────────────────
  if (run('a') || run('e')) {
    hr('a) full 40 km run: Autopilot + fake cook + fake shop driver + solo roof AI');
    const t0 = Date.now();
    A = runFull(data, seed);
    const r = A.sim.result || {};
    const st = A.stat;
    console.log(`  phase=${A.sim.phase} reason=${r.reason} sim time ${fmtT(A.sim.t)} (${A.sim.t.toFixed(1)} s; drive ${fmtT(A.sim.driveTime)}), wall ${(Date.now() - t0)}ms`);
    console.log(`  units=${r.units} quality=${r.quality} payout=$${r.payout} points=${r.points} rating=${r.stars}★`);
    console.log(`  rv hp=${A.sim.rv.hp.toFixed(1)} (min ${st.minHp.toFixed(1)}) driver=${A.sim.crew.driver.toFixed(1)} cook=${A.sim.crew.cook.toFixed(1)} regen: ${st.regenOn}× on, +${st.regenHp.toFixed(1)} hp`);
    console.log(`  max stars=${st.maxStars} cops seen=${st.cops} (moto ${st.motos}) rhino=${st.rhino} canisters=${st.canisters} copsWrecked=${A.sim.score.copsWrecked} peds knocked=${A.sim.score.knocked} smashed=${A.sim.score.smashed}`);
    console.log(`  per area: ${st.areaOrder.map((a) => `${a} ${fmtT(st.areas[a] || 0)}`).join(' · ')}`);
    console.log(`  stops: ${A.sim.stops.log.map((s) => `${s.id}${s.looted ? '✓' : '✗'}${s.bonus ? '+' : ''}`).join(' ')} — looted ${A.sim.stops.lootedCount()}/${data.route.stops.length}, shopDone sent ${A.shop.count}`);
    const allSp = (data.route.setpieces || []).map((d) => d.id);
    const missing = allSp.filter((id) => !st.setpieces.has(id));
    console.log(`  set-pieces seen ${st.setpieces.size}/${allSp.length}: ${[...st.setpieces].join(', ')}${missing.length ? ` (not seen: ${missing.join(', ')})` : ''}`);
    console.log(`  fx max: fog ${st.fxMax.fog.toFixed(2)} flash ${st.fxMax.flash.toFixed(2)} shock ${st.fxMax.shock.toFixed(2)}; roof hits ${st.roofHits}; hazard contacts ${JSON.stringify(A.sim.obstacles.hits)}`);
    console.log(`  bridge: speedNeeded=${A.sim.bridgeSys.speedNeeded.toFixed(2)} lip speed=${st.lipSpeed?.toFixed(2)} falls=${st.fell}`);
    console.log(`  cook: ${A.cook.log.join(' | ')}`);
    console.log(`  events: ${Object.entries(st.events).map(([k, v]) => `${k}:${v}`).join(' ')}`);
    if (r.breakdown) console.log(`  points breakdown: ${JSON.stringify(r.breakdown)}`);
    check('a1 reaches the sell point and WINS', A.sim.phase === 'won', `phase=${A.sim.phase} reason=${r.reason} at z=${A.sim.rv.z.toFixed(0)}`);
    check('a2 canyon jump at the new lip succeeds (jumped, landed beyond the gap, no fall)', st.jumped && st.landed && st.fell === 0, `jumped=${st.jumped} landed=${st.landed} falls=${st.fell}`);
    check('a3 cops give up after the bridge', st.copsGaveUp && A.sim.heat.gaveUp && A.sim.heat.value === 0 && st.copsAfterBridge === 0,
      `gaveUp=${st.copsGaveUp} at z=${st.gaveUpZ?.toFixed(0)} chasing after=${st.copsAfterBridge}`);
    // (Round 3: cops come to every stop and the chase runs hotter — ~43 min with the bots)
    check('a4 run length 30–50 min sim time', A.sim.t >= 30 * 60 && A.sim.t <= 50 * 60, fmtT(A.sim.t));
    check('a5 ≥ 6 of 8 supply stops looted', A.sim.stops.lootedCount() >= 6, `${A.sim.stops.lootedCount()}`);
    check('a6 the chase happened (≥ 1 star, ≥ 1 cop)', st.maxStars >= 1 && st.cops >= 1, `maxStars=${st.maxStars} cops=${st.cops}`);
    check('a7 HP regen happened', st.regenOn >= 1 && st.regenHp > 1, `${st.regenOn}× +${st.regenHp.toFixed(1)} hp`);
    check('a8 ≥ 14 of 17 set-pieces ran', st.setpieces.size >= Math.min(14, allSp.length), `${st.setpieces.size}`);
    check('a9 drove through all 13 areas in order from the garage', st.areaOrder.length >= data.route.biomes.length && st.areaOrder[0] === data.route.biomes[0].id, st.areaOrder.join('>'));

    const extra = !args.seeds || args.seeds === 'none' ? [] : String(args.seeds).split(',').map(Number);
    if (extra.length) console.log(`  robustness (other seeds${args.strict ? '' : ', informational'}):`);
    for (const s of extra) {
      const E = runFull(data, s);
      const er = E.sim.result || {};
      console.log(`  seed ${s} full:   ${E.sim.phase} ${er.reason} t=${fmtT(E.sim.t)} z=${E.sim.rv.z.toFixed(0)} units=${er.units} hp=${E.sim.rv.hp.toFixed(0)} stars=${E.stat.maxStars} cops=${E.stat.cops} looted=${E.sim.stops.lootedCount()} falls=${E.stat.fell} sp=${E.stat.setpieces.size} pts=${er.points} resets=${E.ap.resets || 0}`);
      if (args.strict) check(`a* seed ${s} wins`, E.sim.phase === 'won', `${E.sim.phase} ${er.reason}`);
      const C = runCruise(data, s, { delay: (s * 7) % 24 });
      console.log(`  ${cruiseLine(s, C)}`);
      if (args.strict) check(`a* seed ${s} cruise 0→38 km`, C.st.ok, `${C.sim.phase} z=${C.sim.rv.z.toFixed(0)}`);
    }
  }

  // ── a'') cruise mode (the solo player's autopilot) ─────────────────────────
  if (run('a') || run('cruise')) {
    hr("a'') cruise mode: labPilot (maxSpeed 19, no stops) drives 0 → 38 km while Doc cooks");
    const C = runCruise(data, seed);
    console.log(`  ${cruiseLine(seed, C)}`);
    check("a''1 cruise mode reaches 38 km (hand-back) — not wrecked, busted or stuck", C.sim.phase === 'drive' && C.sim.rv.z >= 38000 && C.st.maxStall < 90, `${C.sim.phase} z=${C.sim.rv.z.toFixed(0)} maxStall ${C.st.maxStall.toFixed(0)} s`);
    check("a''2 never hit by the train, never standing within 4 m of a rail line", C.st.trainHits === 0 && C.st.railStops === 0, `train ${C.st.trainHits} railStops ${C.st.railStops}`);
  }

  // ── a') the Rhino at 5★ ────────────────────────────────────────────────────
  if (run('a') || run('rhino')) {
    hr("a') forced 5★ on the freeway: the Rhino + canisters");
    const sim = new GameSim(data, { seed, solo: true });
    toDrive(sim);
    placeAt(sim, 20800);
    const ap = new Autopilot(data, { seed, sim, stops: false, useNitro: false });
    sim.heat.set(5.6);
    let snap = sim.snapshot(), rhinoT = null, maxAhead = -999, flash = 0, foamHit = 0, foamPatch = 0, cans = { flash: 0, foam: 0, hitRv: 0 }, states = new Set(), hp0 = sim.rv.hp, fxFlash = 0;
    for (let i = 0; i < 60 * 120; i++) {
      sim.step(ap.update(snap), DT); snap = sim.snapshot();
      if (sim.heat.value < 5.2) sim.heat.set(5.6);   // keep it at 5★ for the test
      const rh = sim.cops.cops.find((c) => c.kind === 'rhino_truck' && c.state !== 4);
      if (rh && rhinoT == null) rhinoT = sim.t;
      if (rh) maxAhead = Math.max(maxAhead, (rh.x - sim.rv.x) * Math.sin(sim.rv.yaw) + (rh.z - sim.rv.z) * Math.cos(sim.rv.yaw));
      for (const k of sim.cops.canisters) states.add(k.state);
      for (const e of snap.events) if (e.type === 'canister') { cans[e.kind]++; if (e.hitRv) cans.hitRv++; }
      if (sim.obstacles.list.some((o) => o.kind === 'foam_patch')) foamPatch++;
      if (sim.rv.foamT > 0) foamHit++;
      fxFlash = Math.max(fxFlash, snap.fx.flash);
      if (sim.phase !== 'drive') break;
    }
    console.log(`  rhino spawned after ${rhinoT != null ? (rhinoT).toFixed(1) : '—'} s · max lead ${maxAhead.toFixed(1)} m · canisters thrown ${sim.cops.canisterCount} (flash ${cans.flash}, foam ${cans.foam}, hit RV ${cans.hitRv}) · states seen ${[...states].join(',')} · fx.flash max ${fxFlash.toFixed(2)} · foam patch frames ${foamPatch}, RV foamed ${foamHit} · hp ${hp0}→${sim.rv.hp.toFixed(0)} phase=${sim.phase}`);
    check("a'1 the Rhino spawns at 5★ and gets ahead of the RV", rhinoT != null && maxAhead > 15, `lead ${maxAhead.toFixed(1)} m`);
    check("a'2 it throws flash + foam canisters that fly (0), arm (1) and burst (2)", sim.cops.canisterCount >= 3 && cans.flash + cans.foam >= 2 && states.has(0) && states.has(1) && states.has(2), `thrown ${sim.cops.canisterCount}, bursts ${cans.flash + cans.foam}`);
    check("a'3 bursts affect the RV (flash white-out / foam patch)", fxFlash > 0 || foamPatch > 0, `fx.flash ${fxFlash.toFixed(2)} foam frames ${foamPatch}`);
    // ramming the Rhino hurts
    const s2 = new GameSim(data, { seed, solo: true }); toDrive(s2); placeAt(s2, 20800); s2.heat.set(5.5);
    // a stalled Rhino 28 m straight ahead along the RV's heading; the RV rams it at ~22 m/s
    const yaw0 = s2.rv.yaw;
    s2.traffic.cars = [];
    const rh = s2.cops._makeCop('rhino_truck', s2.rv.x + Math.sin(yaw0) * 28, s2.rv.z + Math.cos(yaw0) * 28, yaw0, 0); s2.cops.cops.push(rh);
    rh.state = 7; rh.timer = 10; rh.prevState = 1;
    s2.rv.vx = Math.sin(yaw0) * 22; s2.rv.vz = Math.cos(yaw0) * 22; s2.rv.speed = 22;
    const hpA = s2.rv.hp, rhHp = rh.hp;
    for (let i = 0; i < 180; i++) s2.step({ throttle: 1, steer: 0 }, DT);
    check("a'4 ramming the Rhino hurts the RV more than the Rhino", hpA - s2.rv.hp > 8 && rh.hp > 0, `RV −${(hpA - s2.rv.hp).toFixed(1)} hp, Rhino ${rhHp}→${rh.hp.toFixed(0)}`);
  }

  // ── b) jump at the new lip ─────────────────────────────────────────────────
  if (run('b')) {
    hr('b) jump at the new lip: ~70% of speedNeeded → fall → checkpoint; full speed clears');
    const b = data.route.bridge;
    const sim = new GameSim(data, { seed, solo: true });
    const need = sim.bridgeSys.speedNeeded;
    const angle = sim.track.rampAngle();
    const indep = computeSpeedNeeded(b, angle, 0);
    console.log(`  lip z=${b.lip}, speedNeeded=${need.toFixed(2)} m/s (with ${sim.cfg.rv.jumpLandMargin} m margin; bare gap ${indep.toFixed(2)}), ramp ${(angle * 180 / Math.PI).toFixed(1)}°, gap ${b.gapEnd - b.gapStart} m, top speed ${data.rules.rv.topSpeed}, nitro ${data.rules.rv.nitroSpeed}`);
    check('b0 speedNeeded is reachable at top speed (no nitro)', need < data.rules.rv.topSpeed - 0.5, `${need.toFixed(2)} < ${data.rules.rv.topSpeed}`);
    const jumpAt = (target, label) => {
      const s2 = new GameSim(data, { seed, solo: true });
      toDrive(s2);
      s2.inv.units = 4; s2.inv.value = 4 * 1000; s2.inv.quality = 0.8;
      const rf = (data.route.events || []).find((e) => e.type === 'rockfall');
      const z0 = Math.max(b.rampStart - 260, (rf ? rf.to : 0) + 5);
      s2.traffic.cars = []; s2.cops.clearAll();
      const ap = new Autopilot(data, { seed, maxSpeed: target, useNitro: false, sim: s2 });
      const u0 = s2.road.laneU(z0, 1, 0);
      placeAt(s2, z0, u0);
      s2.rv.vx = Math.sin(s2.rv.yaw) * target; s2.rv.vz = Math.cos(s2.rv.yaw) * target;
      s2.traffic.frontier = z0 + 400; s2.peds.frontier = z0 + 400;
      const hp0 = s2.rv.hp;
      let snap = s2.snapshot(), lip = null, fell = false, landed = false, respawn = null, hpLip = null;
      for (let i = 0; i < 60 * 40 && !respawn; i++) {
        const inp = ap.update(snap);
        if (s2.rv.z > b.rampStart - 80) { inp.steer = inp.steer * 0.5; }
        const hpBefore = s2.rv.hp;
        s2.step(inp, DT);
        snap = s2.snapshot();
        for (const e of snap.events) {
          if (e.type === 'jump' && e.at === 'canyon') { lip = s2.bridgeSys.launchSpeed; hpLip = s2.rv.hp; }
          if (e.type === 'landed' && s2.rv.z > b.gapEnd - 2) landed = true;
          if (e.type === 'fell') { fell = true; respawn = { z: s2.rv.z, speed: s2.rv.speed, hp: s2.rv.hp, hpBefore, units: s2.inv.units, cops: s2.cops.cops.length, grace: s2.rv.grace, lane: s2.road.uAt(s2.rv.x, s2.rv.z) }; }
        }
        if (landed && s2.rv.z > b.landingEnd + 20) break;
        if (s2.phase !== 'drive') break;
      }
      console.log(`  ${label}: target ${target.toFixed(2)} m/s, lip speed ${lip?.toFixed(2)}, ${fell ? 'FELL' : landed ? 'LANDED' : 'neither'}${respawn ? `, respawn z=${respawn.z.toFixed(1)} u=${respawn.lane.toFixed(2)} v=${respawn.speed.toFixed(2)} hp ${hp0}→${respawn.hp.toFixed(1)} units 4→${respawn.units} cops=${respawn.cops} grace=${respawn.grace.toFixed(2)}` : ''}`);
      return { lip, fell, landed, respawn, hp0: hpLip ?? hp0 };
    };
    const slow = jumpAt(need * 0.7, '70% speed');
    check('b1 ~70% of speedNeeded falls into the canyon', slow.fell && !slow.landed);
    const P = b.fallPenalty;
    const rs = slow.respawn;
    check('b2 respawn at checkpoint, forward lane, 0 speed', rs && Math.abs(rs.z - b.checkpointZ) < 0.5 && rs.lane > 0 && Math.abs(rs.speed) < 0.01,
      rs ? `z=${rs.z.toFixed(1)} u=${rs.lane.toFixed(2)}` : 'no respawn');
    check('b3 fall penalty applied (hp −30, units −1), cops cleared, grace', rs && Math.abs((rs.hpBefore - rs.hp) - P.rvDamage) < 0.01 && rs.units === 3 && rs.cops === 0 && rs.grace > 0,
      rs ? `Δhp at the fall=${(rs.hpBefore - rs.hp).toFixed(1)} units=${rs.units}` : '');
    const full = jumpAt(data.rules.rv.topSpeed, 'full speed');
    check('b4 full speed (no nitro) clears the gap', full.landed && !full.fell);
    const edge = jumpAt(need + 0.6, 'speedNeeded + 0.6');
    check('b5 just above speedNeeded clears the gap', edge.landed && !edge.fell);
    const under = jumpAt(need - 1.2, 'speedNeeded − 1.2');
    check('b6 just below speedNeeded falls', under.fell);
  }

  // ── c) busted ───────────────────────────────────────────────────────────────
  if (run('c')) {
    hr('c) busted: stand still at 3 stars');
    {
      const sim = new GameSim(data, { seed, solo: false });
      const idle = { throttle: 0, steer: 0, handbrake: true, horn: false, smoke: false, oil: false, nitro: false, reset: false };
      toDrive(sim);
      placeAt(sim, 600, sim.road.laneU(600, 1, 0));
      sim.heat.set(3.2);
      const tStart = sim.t;
      let bustedAt = null, firstCop = null;
      for (let i = 0; i < 60 * 30; i++) {
        sim.step(idle, DT);
        if (firstCop == null && sim.cops.cops.some((c) => !c.patrol)) firstCop = sim.t - tStart;
        if (sim.phase === 'lost') { bustedAt = sim.t - tStart; break; }
      }
      console.log(`  first cop after ${firstCop?.toFixed(2)} s, lost=${sim.lostReason} after ${bustedAt?.toFixed(2)} s`);
      check('c1 busted within ~12 s standing still at 3 stars', sim.lostReason === 'busted' && bustedAt <= 12, `${bustedAt?.toFixed(2)} s`);
      check('c2 result reports busted, not won', sim.result && sim.result.won === false && sim.result.reason === 'busted');
    }
    {
      const sim = new GameSim(data, { seed, solo: false });
      const ap = new Autopilot(data, { seed, maxSpeed: 9, useNitro: false, sim, stops: false });
      toDrive(sim);
      placeAt(sim, 600, sim.road.laneU(600, 1, 0));
      sim.heat.set(3.5);
      let snap = sim.snapshot(), maxBust = 0, minDist = 999, hp0 = sim.rv.hp;
      for (let i = 0; i < 60 * 25; i++) {
        const inp = ap.update(snap); inp.smoke = inp.oil = false;
        sim.step(inp, DT); snap = sim.snapshot();
        if (i > 60 * 6) maxBust = Math.max(maxBust, snap.bust);
        minDist = Math.min(minDist, snap.alert.copDist);
        if (sim.phase !== 'drive') break;
      }
      console.log(`  moving at ≤9 m/s for 25 s at 3 stars: phase=${sim.phase} closest cop ${minDist.toFixed(1)} m, max bust ${maxBust.toFixed(2)}, hp ${hp0}→${sim.rv.hp.toFixed(0)}`);
      check('c3 a moving RV is not busted (bust needs the RV nearly stopped)', sim.phase === 'drive' && minDist < 10, `phase=${sim.phase} maxBust=${maxBust.toFixed(2)}`);
    }
  }

  // ── d) determinism ─────────────────────────────────────────────────────────
  if (run('d')) {
    hr('d) determinism');
    const mk = () => {
      const sim = new GameSim(data, { seed, solo: true });
      const ap = new Autopilot(data, { seed, sim, onDriverCommand: (c) => sim.applyDriverCommand(c) });
      const cook = new FakeCook(data);
      return { sim, ap, cook, shop: new FakeShop(), snap: sim.snapshot() };
    };
    const a = mk(), b = mk();
    let same = true, firstDiff = -1;
    for (let i = 0; i < 6000; i++) {
      for (const x of [a, b]) {
        const inp = x.ap.update(x.snap);
        if (i === 900) inp.smoke = true;
        if (i % 200 === 0) inp.horn = true;
        x.sim.step(inp, DT);
        x.cook.update(x.sim, x.snap);
        x.snap = x.sim.snapshot();
        x.shop.update(x.sim, x.snap);
      }
      if (i % 100 === 0 && JSON.stringify(a.snap) !== JSON.stringify(b.snap)) { same = false; firstDiff = i; break; }
    }
    const ja = JSON.stringify(a.sim.snapshot()), jb = JSON.stringify(b.sim.snapshot());
    const na = JSON.stringify(a.sim.netSnapshot()), nb = JSON.stringify(b.sim.netSnapshot());
    same = same && ja === jb && na === nb;
    console.log(`  after 6000 steps: z=${a.sim.rv.z.toFixed(2)} t=${a.sim.t.toFixed(2)} ents=${a.snap.ents.length} setpieces=${a.snap.setpieces.length} snapshot bytes=${ja.length}${firstDiff >= 0 ? ` first diff at step ${firstDiff}` : ''}`);
    check('d1 identical snapshots (same seed + inputs, 6000 steps)', same);
    const c = new GameSim(data, { seed: seed + 1, solo: true });
    check('d2 different seed gives a different world', JSON.stringify(c.snapshot().ents) !== JSON.stringify(new GameSim(data, { seed, solo: true }).snapshot().ents) || c.track.centerX(500) !== new GameSim(data, { seed, solo: true }).track.centerX(500));
  }

  // ── e) netSnapshot size ────────────────────────────────────────────────────
  if (run('e') && A) {
    hr('e) netSnapshot size');
    const bytes = A.stat.netBytes;
    const avg = bytes.reduce((s, v) => s + v, 0) / bytes.length;
    const max = Math.max(...bytes);
    const sorted = [...bytes].sort((x, y) => x - y);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    console.log(`  samples=${bytes.length} avg=${(avg / 1024).toFixed(2)} KB p95=${(p95 / 1024).toFixed(2)} KB max=${(max / 1024).toFixed(2)} KB`);
    check('e1 typical (avg) netSnapshot < 4 KB', avg < 4 * 1024, `${avg.toFixed(0)} B`);
    check('e2 every netSnapshot well under the 64 KB relay limit (< 16 KB)', max < 16 * 1024, `${max} B`);
    const sim = new GameSim(data, { seed, solo: true });
    toDrive(sim);
    for (let i = 0; i < 600; i++) sim.step({ throttle: 1, steer: 0 }, DT);
    const ns = sim.netSnapshot();
    const keys = ['t', 'phase', 'countdown', 'lostReason', 'rv', 'crew', 'heat', 'bust', 'score', 'inv', 'stop', 'nearStop', 'bridge', 'biome', 'dist', 'routeLength', 'feel', 'alert', 'lab', 'ents', 'events',
      'garage', 'timeOfDay', 'area', 'fx', 'setpieces'];
    const missing = keys.filter((k) => !(k in ns));
    const rvKeys = ['regen', 'roofDoc'].filter((k) => !(k in ns.rv));
    const tupleOk = ns.ents.every((e) => e.length === 8 && e.every((v) => typeof v === 'number'));
    const rounded = ns.ents.every((e) => e.every((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6));
    check('e3 snapshot has every protocol + expansion field, 8-number entity tuples, 2-dp rounding', !missing.length && !rvKeys.length && tupleOk && rounded, missing.length || rvKeys.length ? `missing ${missing} ${rvKeys}` : `${ns.ents.length} ents`);
    const s3 = new GameSim(data, { seed, solo: true });
    s3.emit({ type: 'msg', text: 'x', tone: 'info' });
    const l1 = s3.snapshot().events.length, n1 = s3.netSnapshot().events.length, l2 = s3.snapshot().events.length, n2 = s3.drainNetEvents().length;
    check('e4 events reach both queues; each drains independently', l1 >= 1 && n1 >= 1 && l2 === 0 && n2 === 0, `local ${l1}→${l2} net ${n1}→${n2}`);
  }

  // ── f) performance ─────────────────────────────────────────────────────────
  if (run('f')) {
    hr('f) performance');
    const sim = new GameSim(data, { seed, solo: true });
    const ap = new Autopilot(data, { seed, sim, onDriverCommand: (c) => sim.applyDriverCommand(c) });
    let snap = sim.snapshot();
    const N = 20000;
    const t = process.hrtime.bigint(), cpu0 = process.cpuUsage();
    for (let i = 0; i < N; i++) { sim.step(ap.update(snap), DT); snap = sim.snapshot(); if (sim.phase === 'won' || sim.phase === 'lost') break; }
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    const cpu = process.cpuUsage(cpu0), cpuMs = (cpu.user + cpu.system) / 1000;
    // CPU time, not wall time: a busy machine (other test runs, browsers) must not fail this check
    const sps = (N / Math.max(1, cpuMs)) * 1000, wallSps = (N / ms) * 1000;
    const sim2 = new GameSim(data, { seed, solo: true }); toDrive(sim2);
    const t2 = process.hrtime.bigint();
    for (let i = 0; i < N; i++) sim2.step({ throttle: 1, steer: Math.sin(i / 90) * 0.3 }, DT);
    const ms2 = Number(process.hrtime.bigint() - t2) / 1e6;
    console.log(`  step+snapshot+autopilot: ${sps.toFixed(0)} steps per CPU-second (${(cpuMs / N * 1000).toFixed(1)} µs/step; wall ${wallSps.toFixed(0)}/s); step only: ${(N / ms2 * 1000).toFixed(0)} steps/s wall`);
    check('f1 ≫ 60 steps/s (≥ 3000)', sps >= 3000, `${sps.toFixed(0)}`);
  }

  // ── g) lab coupling ─────────────────────────────────────────────────────────
  if (run('g')) {
    hr('g) lab coupling (cook rules)');
    const mk = () => { const s = new GameSim(data, { seed, solo: true }); toDrive(s); return s; };
    const lab = (o = {}) => ({ cooking: false, recipeId: null, step: 0, stepType: null, temp: 70, fumes: 0, fire: 0, ventOpen: false, curtains: true, cookHurt: 0, ...o });
    const idle = { throttle: 0, steer: 0, handbrake: true };
    let s = mk();
    s.setLabState(lab({ cookHurt: 7.5 }));
    check('g1 LabState.cookHurt is subtracted from crew.cook', Math.abs(s.crew.cook - 92.5) < 1e-9, `cook=${s.crew.cook}`);
    s.setLabState(lab({ fumes: 0.9, cookHurt: 0 })); for (let i = 0; i < 60; i++) s.step(idle, DT);
    check('g2 fumes hurt the driver; cook damage only via cookHurt (no double count)', s.crew.cook === 92.5 && s.crew.driver < 100, `cook=${s.crew.cook} driver=${s.crew.driver.toFixed(2)}`);
    s.setLabState(lab({ cookHurt: 200 }));
    const evs = s.snapshot().events;
    s.applyCookCommand({ type: 'startRecipe', reqId: 'x1', recipeId: 'street' });
    const den = s.snapshot().events.find((e) => e.type === 'recipeDenied');
    const units0 = s.inv.units, mat0 = JSON.stringify(s.inv.mat);
    s.applyCookCommand({ type: 'recipeDone', reqId: 'x1', recipeId: 'street', quality: 1 });
    const hpE = s.rv.hp;
    s.applyCookCommand({ type: 'explosion', power: 1 });
    check('g3 cook at 0 hp → crew.cookDown, commands ignored (startRecipe denied)', s.crew.cookDown && s.crew.cook === 0 && den && den.reason === 'Doc is out cold' && s.inv.units === units0 && JSON.stringify(s.inv.mat) === mat0 && s.rv.hp === hpE && !evs.some((e) => e.type === 'end'),
      `cookDown=${s.crew.cookDown} denied=${den?.reason} phase=${s.phase}`);
    for (let i = 0; i < Math.round(11.9 * 60); i++) s.step(idle, DT);
    const stillDown = s.crew.cookDown;
    for (let i = 0; i < 12; i++) s.step(idle, DT);
    check('g4 Doc comes round after 12 s with 25 hp', stillDown && !s.crew.cookDown && s.crew.cook === 25, `after 11.9 s down=${stillDown}, after 12.1 s down=${s.crew.cookDown} hp=${s.crew.cook}`);
    s = mk();
    s.applyCookCommand({ type: 'startRecipe', reqId: 'r1', recipeId: 'premium' });
    const d1 = s.snapshot().events.find((e) => e.type === 'recipeDenied');
    s.applyCookCommand({ type: 'startRecipe', reqId: 'r2', recipeId: 'street' });
    const ok2 = s.snapshot().events.find((e) => e.type === 'recipeOk' && e.reqId === 'r2');
    s.applyCookCommand({ type: 'recipeDone', reqId: 'r2', recipeId: 'street', quality: 0.92 });
    s.applyCookCommand({ type: 'recipeDone', reqId: 'r2', recipeId: 'street', quality: 0.92 });
    const msg = s.snapshot().events.find((e) => e.type === 'msg' && /Street Batch — 92%/.test(e.text));
    check('g5 startRecipe checks/deducts inventory; recipeDone pays once per accepted reqId', d1 && /Missing/.test(d1.reason) && ok2 && s.inv.units === 2 && Math.abs(s.inv.quality - 0.92) < 1e-9 && msg,
      `denied="${d1?.reason}" units=${s.inv.units} q=${s.inv.quality} msg="${msg?.text}"`);
    const spot = (curtains) => {
      const t = mk();
      placeAt(t, 600, t.road.laneU(600, 1, 0));
      t.heat.set(1.2);
      const c = t.cops._makeCop('cop', t.rv.x + 3.5, t.rv.z, t.rv.yaw, 0); c.state = 1; t.cops.cops.push(c);
      t.setLabState(lab({ cooking: true, curtains }));
      let spotted = false;
      for (let i = 0; i < 30; i++) { t.step(idle, DT); if (t.snapshot().events.some((e) => e.type === 'spotted')) spotted = true; }
      return { spotted, heat: t.heat.value, close: t.alert.copClose };
    };
    const closed = spot(true), open = spot(false);
    check('g6 spotted only when cooking with curtains OPEN and a cop close', !closed.spotted && open.spotted && open.close && open.heat > closed.heat,
      `closed: spotted=${closed.spotted} heat=${closed.heat.toFixed(2)}; open: spotted=${open.spotted} heat=${open.heat.toFixed(2)}`);
  }

  // ── h) garage phase ─────────────────────────────────────────────────────────
  if (run('h')) {
    hr('h) garage phase: stub tutorial · ONFOOT tutorial played by script · skipTutorial · drive out');
    // h1 stub: a tutorial that is done at once → countdown (1.5 s) → drive
    {
      const sim = new GameSim(data, { seed, solo: true });
      sim.garage = { done: true, update() {}, command() {}, state() { return null; } };
      sim.phase = 'garage';
      const p0 = { x: sim.rv.x, z: sim.rv.z };
      let tCount = null, tDrive = null;
      for (let i = 0; i < 300 && !tDrive; i++) { sim.step({ throttle: 1, steer: 0.5 }, DT); if (sim.phase === 'countdown' && tCount == null) tCount = sim.t; if (sim.phase === 'drive') tDrive = sim.t; }
      const moved = Math.hypot(sim.rv.x - p0.x, sim.rv.z - p0.z);
      check('h1 stub tutorial (done) → countdown → drive after ~1.5 s; RV static until then', tCount != null && tDrive != null && Math.abs(tDrive - tCount - 1.5) < 0.1 && moved < 0.05, `countdown at ${tCount?.toFixed(2)} s, drive at ${tDrive?.toFixed(2)} s, moved ${moved.toFixed(3)} m`);
    }
    // h2 the real tutorial (if ONFOOT's module is in): Rook scripted by the Autopilot, AI Doc (solo)
    {
      const sim = new GameSim(data, { seed, solo: true });
      const real = !!(sim.garage && typeof sim.garage.state === 'function' && sim.garage.state());
      if (!real) console.log('  (no garage tutorial module: stub only)');
      const g0 = sim.snapshot().garage;
      const park = sim.structures.garage.park;
      const ap = new Autopilot(data, { seed, sim, tutorial: 'play' });
      let snap = sim.snapshot(), steps = new Set(), tDone = null, maxMove = 0, doorClosedSeen = false, tDrive = null;
      const p0 = { x: sim.rv.x, z: sim.rv.z };
      for (let i = 0; i < 60 * 240 && sim.phase === 'garage'; i++) {
        const inp = ap.update(snap);
        inp.throttle = 1; // must be ignored in the garage
        sim.step(inp, DT); snap = sim.snapshot();
        if (sim.structures.doorClosed()) doorClosedSeen = true;
        if (snap.garage) steps.add(snap.garage.stepId);
        maxMove = Math.max(maxMove, Math.hypot(sim.rv.x - p0.x, sim.rv.z - p0.z));
      }
      tDone = sim.t;
      for (let i = 0; i < 200 && sim.phase !== 'drive'; i++) { sim.step(ap.update(snap), DT); snap = sim.snapshot(); }
      tDrive = sim.t;
      if (real) {
        console.log(`  tutorial: steps ${[...steps].join(' > ')}, done after ${tDone.toFixed(1)} s, drive at ${tDrive.toFixed(1)} s; RV moved ${maxMove.toFixed(3)} m meanwhile; park (${park.x.toFixed(2)}, ${park.z.toFixed(2)}) vs tutorial rvPark (${g0?.rvPark?.x?.toFixed(2)}, ${g0?.rvPark?.z?.toFixed(2)})`);
        check('h2 ONFOOT tutorial completes with scripted Rook inputs (AI Doc) → countdown → drive', sim.phase === 'drive' && tDone < 200 && steps.has('crank'), `${tDone.toFixed(1)} s`);
        check('h3 RV static in the garage phase, parked at the tutorial rvPark, door collider closed until opened', maxMove < 0.05 && doorClosedSeen && Math.hypot(park.x - g0.rvPark.x, park.z - g0.rvPark.z) < 0.05);
      }
      // drive out of the door and onto the road
      let hpMin = sim.rv.hp, reached = false, crashes = 0;
      for (let i = 0; i < 60 * 40; i++) {
        sim.step(ap.update(snap), DT); snap = sim.snapshot();
        hpMin = Math.min(hpMin, sim.rv.hp);
        crashes += snap.events.filter((e) => e.type === 'crash').length;
        if (sim.rv.z > 260 && Math.abs(sim.road.uAt(sim.rv.x, sim.rv.z)) < sim.road.hw(sim.rv.z)) { reached = true; break; }
      }
      check('h4 the Autopilot drives out of the garage door and onto the road', reached && hpMin > 92, `reached=${reached} z=${sim.rv.z.toFixed(0)} hp min ${hpMin.toFixed(1)} crashes ${crashes}`);
    }
    // h5 skipTutorial
    {
      const sim = new GameSim(data, { seed, solo: false });
      const ok = sim.applyDriverCommand({ type: 'skipTutorial' });
      const ph = sim.phase;
      const g = sim.snapshot().garage;
      check('h5 skipTutorial → countdown at once (garage.skip(): engine on, door open)', ok && ph === 'countdown' && (!g || (g.items && g.items.door >= 0.9)), `phase=${ph} door=${g?.items?.door}`);
      // the door blocks while closed: a fresh sim, force drive with the door shut
      const s2 = new GameSim(data, { seed, solo: false });
      s2.phase = 'drive';
      s2.structures.doorClosed = () => true;
      for (let i = 0; i < 60 * 6; i++) s2.step({ throttle: 1, steer: 0 }, DT);
      const l = s2.structures.garage.toLocal(s2.rv.x, s2.rv.z);
      check('h6 a closed garage door is solid (RV stays inside)', l.z < 5 - 4.0, `RV local z ${l.z.toFixed(2)} (door at 5)`);
    }
  }

  // ── i) stop flow ────────────────────────────────────────────────────────────
  if (run('i')) {
    hr('i) stop flow: parked → shopping → returning → loading → done');
    const def = data.route.stops[0];
    const mk = () => {
      const sim = new GameSim(data, { seed, solo: false });
      toDrive(sim);
      const st = sim.stops.stops[0];
      sim.rv.z = st.lot.cz; sim.rv.x = st.lot.cx; sim.rv.yaw = sim.road.heading(st.lot.cz); sim.rv.vx = sim.rv.vz = 0; sim.rv.speed = 0;
      sim.traffic.cars = []; sim.cops.clearAll(); sim.cops.patrols.forEach((p) => { p.spawned = true; });
      sim.cops.dispatchToStop = () => null;   // no police response in the stop-flow tests (section l covers it)
      return sim;
    };
    const hold = { throttle: 0, steer: 0, handbrake: true };
    {
      const sim = mk();
      const states = [], evs = [];
      const mat0 = { ...sim.inv.mat };
      let firstShopping = null, snapStop = null;
      for (let i = 0; i < 60 * 40; i++) {
        const st = sim.stops.state();
        if (st && states[states.length - 1] !== st) states.push(st);
        if (st === 'shopping' && firstShopping == null) firstShopping = sim.t;
        if (st === 'shopping' && sim.t - firstShopping > 3 && !evs.includes('sent')) { evs.push('sent'); sim.applyDriverCommand({ type: 'shopDone', stopId: def.id, score: 0.85 }); }
        // driving input is ignored while Rook is out
        sim.step(st === 'shopping' ? { throttle: 1, steer: 1 } : hold, DT);
        const s = sim.snapshot();
        if (s.stop && s.stop.state === 'loading' && !snapStop) snapStop = s.stop;
        for (const e of s.events) if (['stopParked', 'shopResult', 'stopDone'].includes(e.type)) evs.push(e.type);
        if (!sim.stops.active && states.includes('done')) break;
      }
      const first = Object.keys(def.gives)[0];
      const gained = Object.fromEntries(Object.keys(def.gives).map((k) => [k, (sim.inv.mat[k] || 0) - (mat0[k] || 0)]));
      console.log(`  states ${states.join(' > ')} · events ${evs.join(',')} · gained ${JSON.stringify(gained)} · snapshot.stop ${JSON.stringify(snapStop).slice(0, 220)}`);
      check('i1 the stop runs parked → shopping → returning → loading → done', states.join('>') === 'parked>shopping>returning>loading>done' && evs.includes('stopParked') && evs.includes('shopResult') && evs.includes('stopDone'));
      check('i2 score ≥ bonusScore → +1 of the first item; looted', sim.stops.stops[0].looted && gained[first] === def.gives[first] + 1);
      check('i3 snapshot.stop has the contract fields incl. doc, docShop and roof', snapStop && ['id', 'name', 'shopType', 'state', 'shopT', 'loadT', 'progress', 'blocked', 'copDist', 'roof', 'doc', 'docShop'].every((k) => k in snapStop) && snapStop.roof && 'available' in snapStop.roof);
    }
    {
      // RV held still once Doc is out (CMD.shopEnter from the cook)
      const sim = mk();
      for (let i = 0; i < 60; i++) sim.step(hold, DT);
      const docIn = sim.snapshot().stop?.doc;
      sim.applyCookCommand({ type: 'shopEnter', stopId: def.id });
      const evOut = sim.snapshot().events.find((e) => e.type === 'docOut');
      const p = { x: sim.rv.x, z: sim.rv.z };
      for (let i = 0; i < 120; i++) sim.step({ throttle: 1, steer: 0.5 }, DT);
      const s1 = sim.snapshot().stop;
      check('i4 shopEnter → doc out, EV.DOC_OUT, driving input ignored while Doc is out', docIn === 'in' && evOut && evOut.out === true && sim.stops.state() === 'shopping' && s1.doc === 'out' && s1.held && Math.hypot(sim.rv.x - p.x, sim.rv.z - p.z) < 0.05);
      // LabState.shop → stop.docShop
      sim.setLabState({ cooking: false, shop: { stopId: def.id, label: 'Grab 2/3', frac: 0.66, tLeft: 21 } });
      const ds = sim.snapshot().stop.docShop;
      check('i4b LabState.shop → snapshot stop.docShop', ds && ds.label === 'Grab 2/3' && Math.abs(ds.frac - 0.66) < 1e-9 && ds.tLeft === 21, JSON.stringify(ds));
    }
    {
      // Doc still inside: not held; driving out of the lot cancels the stop (not closed, can retry)
      const sim = mk();
      for (let i = 0; i < 60; i++) sim.step(hold, DT);
      const st0 = sim.stops.state();
      for (let i = 0; i < 60 * 4; i++) sim.step({ throttle: 1, steer: 0 }, DT);
      const st = sim.stops.stops[0];
      check('i4c doc still inside: the RV may drive off — the stop is cancelled, unlooted and retryable', st0 === 'shopping' && !sim.stops.active && !st.looted && !st.closed, `state before ${st0}, active=${sim.stops.state()}, looted=${st.looted}, closed=${st.closed}`);
    }
    {
      // cop blocking loading; a soaked cop doesn't block
      const sim = mk();
      for (let i = 0; i < 60; i++) sim.step(hold, DT);
      sim.applyDriverCommand({ type: 'shopDone', stopId: def.id, score: 0.5 });
      for (let i = 0; i < 60 * 2.2; i++) sim.step(hold, DT);
      sim.heat.set(1.5); sim.cops.noMoreSpawns = true;
      const c = sim.cops._makeCop('cop', sim.rv.x + 12, sim.rv.z + 8, 0, 0); c.state = 1; sim.cops.cops.push(c);
      const keep = () => { c.x = sim.rv.x + 12; c.z = sim.rv.z + 8; c.vx = c.vz = 0; };
      const st0 = sim.stops.state(), l0 = sim.stops.active?.loadT ?? -1;
      for (let i = 0; i < 90; i++) { keep(); sim.step(hold, DT); }
      const blocked = sim.snapshot().stop, l1 = sim.stops.active?.loadT ?? -1;
      sim.applyCopEffect(c.id, { soak: 5 });
      for (let i = 0; i < 90; i++) { keep(); sim.step(hold, DT); }
      const l2 = sim.stops.active?.loadT ?? -1;
      for (let i = 0; i < 60 * 4; i++) { keep(); if (c.state !== 6) sim.applyCopEffect(c.id, { soak: 5 }); sim.step(hold, DT); }
      const mat = sim.inv.mat;
      console.log(`  loading: state ${st0}, loadT ${l0.toFixed(2)}→${l1.toFixed(2)} with a cop 14 m away (blocked=${blocked?.blocked} copDist ${blocked?.copDist?.toFixed(1)}), soaked → ${l2.toFixed(2)}; looted=${sim.stops.stops[0].looted}`);
      check('i5 an active cop within copBlockRadius pauses loading', st0 === 'loading' && Math.abs(l1 - l0) < 1e-6 && blocked && blocked.blocked);
      check('i6 a soaked cop (state 6) does not block; no bonus below bonusScore', l2 > l1 && sim.stops.stops[0].looted && sim.stops.log[0].bonus === false);
    }
    {
      // abort → returning → done unlooted (closed); drive-off during loading → closed
      const sim = mk();
      for (let i = 0; i < 60; i++) sim.step(hold, DT);
      sim.applyDriverCommand({ type: 'shopAbort', stopId: def.id });
      for (let i = 0; i < 60 * 3; i++) sim.step(hold, DT);
      const st = sim.stops.stops[0];
      const ns = sim.snapshot().nearStop;
      check('i7 shopAbort → returning → done, the stop is left unlooted (closed, not in nearStop)', !st.looted && st.closed && (!ns || ns.id !== def.id));
      const s2 = mk();
      for (let i = 0; i < 60; i++) s2.step(hold, DT);
      s2.applyDriverCommand({ type: 'shopDone', stopId: def.id, score: 1 });
      for (let i = 0; i < 60 * 2.1; i++) s2.step(hold, DT);
      const was = s2.stops.state();
      for (let i = 0; i < 60 * 3; i++) s2.step({ throttle: 1, steer: -0.3 }, DT);
      check('i8 driving off during loading leaves the stop unlooted', was === 'loading' && !s2.stops.stops[0].looted && s2.stops.stops[0].closed);
    }
    {
      // Last Chance Gas alarm, nearStop banner range
      const sim = new GameSim(data, { seed, solo: false });
      toDrive(sim);
      const st = sim.stops.stops.find((s) => s.def.alarm > 0);
      placeAt(sim, st.def.z - 790);
      const ns = sim.snapshot().nearStop;
      placeAt(sim, st.def.z - 810);
      const ns2 = sim.snapshot().nearStop;
      sim.rv.z = st.lot.cz; sim.rv.x = st.lot.cx; sim.rv.yaw = sim.road.heading(st.lot.cz);
      sim.cops.clearAll();
      const h0 = sim.heat.value;
      for (let i = 0; i < 60; i++) sim.step(hold, DT);
      sim.applyDriverCommand({ type: 'shopDone', stopId: st.def.id, score: 0.9 });
      for (let i = 0; i < 60 * 6; i++) sim.step(hold, DT);
      check('i9 nearStop reported from 800 m (rules.stops.bannerDist)', ns && ns.id === st.def.id && Math.abs(ns.dist - 790) < 1 && (!ns2 || ns2.id !== st.def.id), `at 790: ${ns?.id} · at 810: ${ns2?.id ?? 'none'}`);
      check('i10 Last Chance Gas trips the alarm when done (heat +alarm)', st.looted && sim.heat.value - h0 >= st.def.alarm - 0.2, `heat ${h0.toFixed(2)}→${sim.heat.value.toFixed(2)}`);
    }
  }

  // ── j) hazards ──────────────────────────────────────────────────────────────
  if (run('j')) {
    hr('j) hazards apply their effects');
    const zT = 16200;  // suburbs, clear of stops / set-pieces
    const mk = (kind, u = null, opts = {}, speed = 18) => {
      const sim = new GameSim(data, { seed, solo: false });
      toDrive(sim);
      placeAt(sim, zT - 30, sim.road.laneU(zT, 1, 0));
      sim.rv.vx = Math.sin(sim.rv.yaw) * speed; sim.rv.vz = Math.cos(sim.rv.yaw) * speed; sim.rv.speed = speed;
      sim.obstacles.list = sim.obstacles.list.filter((o) => Math.abs(o.z - zT) > 80);
      sim.obstacles.loaded = new Set([...Array(2000).keys()]);   // no chunk props in the way
      sim.traffic.cars = []; sim.peds.peds = [];
      const uu = u ?? sim.road.laneU(zT, 1, 0);
      const o = sim.obstacles.add(kind, sim.road.xAt(zT, uu), zT, opts);
      return { sim, o };
    };
    const drive = (sim, secs, speed = 18, fn = null) => {
      const res = { slip: false, fog: 0, shock: 0, shockT: 0, bump: 0, foam: false, minSpeed: 99, hp0: sim.rv.hp, latV: 0, steerLost: false };
      for (let i = 0; i < 60 * secs; i++) {
        const v = sim.rv.speed;
        sim.step({ throttle: v < speed ? 1 : 0.2, steer: 0 }, DT);
        const s = sim.snapshot();
        if (sim.rv.slipT > 0) res.slip = true;
        if (sim.rv.foamT > 0) res.foam = true;
        if (sim.rv.shockT > 0) { res.shockT = Math.max(res.shockT, sim.rv.shockT); res.steerLost = true; }
        res.fog = Math.max(res.fog, s.fx.fog); res.shock = Math.max(res.shock, s.fx.shock);
        res.bump = Math.max(res.bump, s.feel.bump);
        res.minSpeed = Math.min(res.minSpeed, Math.abs(sim.rv.speed));
        res.latV = Math.max(res.latV, Math.abs(sim.rv.drift));
        if (fn) fn(sim, s);
      }
      res.dhp = res.hp0 - sim.rv.hp;
      return res;
    };
    const out = {};
    { const { sim } = mk('steam_leak'); out.steam = drive(sim, 3); check('j1 steam_leak: slip (grip loss) + windscreen fog for `fog` s', out.steam.slip && out.steam.fog > 0.9, `slip=${out.steam.slip} fog=${out.steam.fog.toFixed(2)}`); }
    { const { sim } = mk('water_main'); out.water = drive(sim, 3); check('j2 water_main: slip + drag + fog', out.water.slip && out.water.fog > 0.5 && out.water.minSpeed < 17, `slip=${out.water.slip} fog=${out.water.fog.toFixed(2)} minSpeed=${out.water.minSpeed.toFixed(1)}`); }
    { const { sim } = mk('trench_plates'); const r = drive(sim, 3); const { sim: s2 } = mk('manhole_open'); const r2 = drive(s2, 3); check('j3 trench_plates / manhole_open: bumps', r.bump > 0.3 && r2.bump > 0.4, `trench bump ${r.bump.toFixed(2)} manhole bump ${r2.bump.toFixed(2)} dmg ${r2.dhp.toFixed(1)}`); }
    { const { sim, o } = mk('sinkhole', sim0u(data, zT)); const r = drive(sim, 3); check('j4 sinkhole: solid blocker at the lane edge', r.dhp > 2 && r.minSpeed < 10, `dhp=${r.dhp.toFixed(1)} minSpeed=${r.minSpeed.toFixed(1)}`); }
    { const { sim } = mk('broken_car', null, { yaw: 0, halfLen: 2.3, r: 1.0 }); const r = drive(sim, 3); check('j5 broken_car: solid blocker', r.dhp > 2 && r.minSpeed < 10, `dhp=${r.dhp.toFixed(1)} minSpeed=${r.minSpeed.toFixed(1)}`); }
    {
      const bumpAt = (v) => { const sim = new GameSim(data, { seed, solo: false }); toDrive(sim); placeAt(sim, zT - 30, sim.road.laneU(zT, 1, 0)); sim.obstacles.list = []; sim.obstacles.loaded = new Set([...Array(2000).keys()]); sim.traffic.cars = []; const hw = sim.road.hw(zT); sim.obstacles.add('speed_bump', sim.road.xAt(zT, 0), zT, { yaw: sim.road.heading(zT), axisYaw: sim.road.heading(zT) + Math.PI / 2, halfLen: hw - 0.45, r: 0.45 }); sim.rv.vz = v; sim.rv.speed = v; return drive(sim, 30 / v + 1.5, v).bump; };
      const lo = bumpAt(8), hi = bumpAt(26);
      check('j6 speed_bump across the lanes, bump scales with speed', hi > lo * 1.5 && lo > 0.05, `8 m/s → ${lo.toFixed(2)}, 26 m/s → ${hi.toFixed(2)}`);
    }
    { const { sim, o } = mk('trolley'); const r = drive(sim, 3); check('j7 trolley: smashable', o.flying || o.state >= 1 || sim.obstacles.hits.trolley > 0, `state=${o.state}`); }
    { const { sim } = mk('power_line_down'); const r = drive(sim, 3); check('j8 power_line_down: shock = ~1 s lost steering + damage + fx.shock', r.steerLost && r.shockT > 0.9 && r.dhp > 3 && r.shock > 0.9, `shockT=${r.shockT.toFixed(2)} dhp=${r.dhp.toFixed(1)} fx.shock=${r.shock.toFixed(2)}`); }
    {
      const { sim, o } = mk('log', null, {}, 14);
      o.home = 1; o.trigger = 60; o.yaw = sim.road.heading(zT) + Math.PI / 2; o.axisYaw = sim.road.heading(zT); o.hl = 2.4; o.r = 0.6;
      o.x = sim.road.xAt(zT, 9); sim.obstacles._ends(o);
      const u0 = sim.road.uAt(o.x, o.z);
      drive(sim, 1.0, 6);
      const u1 = sim.road.uAt(o.x, o.z);
      check('j9 log: rolls across the road when the RV comes', o.state === 1 || Math.abs(u1 - u0) > 1, `u ${u0.toFixed(1)}→${u1.toFixed(1)} state ${o.state}`);
    }
    {
      const { sim, o } = mk('dust_devil');
      o.state = 1; o.dirU = 0; o.timer = 99;
      const r = drive(sim, 3);
      check('j10 dust_devil: wanders, pushes the RV sideways', r.latV > 1.0, `max lateral slip ${r.latV.toFixed(2)} m/s`);
    }
    { const { sim } = mk('flood_wash', 0, { yaw: 0, axisYaw: Math.PI / 2, halfLen: 2, r: 2.6 }); const r = drive(sim, 3); check('j11 flood_wash: drag + fog', r.fog > 0.5 && r.minSpeed < 17, `fog=${r.fog.toFixed(2)} minSpeed=${r.minSpeed.toFixed(1)}`); }
    {
      const { sim, o } = mk('sheep'); o.home = 1; o.timer = 99;
      const r = drive(sim, 3);
      check('j12 sheep: wandering solid blocker', r.minSpeed < 12 && sim.obstacles.hits.sheep > 0, `minSpeed=${r.minSpeed.toFixed(1)}`);
    }
    { const { sim } = mk('foam_patch'); const r = drive(sim, 3, 18); check('j13 foam_patch: slows the RV (speed cap)', r.foam && r.minSpeed < 6, `foam=${r.foam} minSpeed=${r.minSpeed.toFixed(1)}`); }
    // placement: deterministic per chunk; never in stop lots / structures / set-piece zones; lane always open
    {
      const sim = new GameSim(data, { seed, solo: false });
      const O = sim.obstacles;
      const placed = [];
      for (let ci = 0; ci < data.route.routeLength / O.size; ci++) { O.list = []; O._genChunk(ci); placed.push(...O.list.filter((o) => o.src === 'chunk')); }
      const bad = placed.filter((o) => O._excluded(o.z));
      const kinds = new Set(placed.map((o) => o.kind));
      const solid = placed.filter((o) => o.solid && !['cow', 'sheep'].includes(o.kind));
      let both = 0;
      for (const a of solid) for (const b of solid) if (a !== b && Math.abs(a.z - b.z) < 13 && Math.sign(a.u) !== Math.sign(b.u) && Math.abs(a.u) < sim.road.hw(a.z) + 1 && Math.abs(b.u) < sim.road.hw(b.z) + 1) both++;
      const again = (() => { O.list = []; O._genChunk(321); const a = JSON.stringify(O.list.map((o) => [o.kind, o.x, o.z])); O.list = []; O._genChunk(321); return a === JSON.stringify(O.list.map((o) => [o.kind, o.x, o.z])); })();
      const want = ['steam_leak', 'water_main', 'trench_plates', 'manhole_open', 'sinkhole', 'speed_bump', 'broken_car', 'trolley', 'power_line_down', 'log', 'dust_devil', 'flood_wash', 'sheep'];
      const missingK = want.filter((k) => !kinds.has(k));
      console.log(`  placed ${placed.length} chunk props over 40 km; kinds ${kinds.size}; in excluded zones ${bad.length}; solid pairs blocking both sides ${both}`);
      check('j14 placement: per-biome lists, deterministic per chunk, never in excluded zones, a lane always open', !bad.length && again && both === 0 && !missingK.length, missingK.length ? `missing ${missingK}` : '');
    }
  }

  // ── k) helper API ──────────────────────────────────────────────────────────
  if (run('k')) {
    hr('k) helper API smoke test');
    const sim = new GameSim(data, { seed, solo: false });
    toDrive(sim);
    placeAt(sim, 16200);
    const fails = [];
    const t = (name, ok) => { if (!ok) fails.push(name); };
    const id1 = sim.newId(), id2 = sim.newId();
    t('newId', id2 === id1 + 1);
    t('kindId', sim.kindId('tornado') === KIND_ID.tornado && sim.kindId('nope') === -1);
    t('time/track/data/seed/phase/rv', sim.time === sim.t && sim.track && sim.data && sim.seed === (seed >>> 0) && sim.phase === 'drive' && typeof sim.rv.x === 'number');
    sim.msg('hello', 'good'); sim.emit({ type: 'custom', a: 1 });
    const evs = sim.snapshot().events;
    t('msg/emit', evs.some((e) => e.type === 'msg' && e.text === 'hello' && e.tone === 'good') && evs.some((e) => e.type === 'custom'));
    const hp = sim.rv.hp; sim.damageRv(5, 'test'); t('damageRv', Math.abs(sim.rv.hp - (hp - 5)) < 1e-9);
    sim.rv.vx = 0; sim.rv.vz = 10; sim.pushRv(3, 0, 0.5); t('pushRv', Math.abs(sim.rv.vx - 3) < 1e-9 && Math.abs(sim.rv.vz - 5) < 1e-9);
    sim.addHeat(2.4, 'test'); t('addHeat', sim.heat.stars === 2);
    sim.dropStars(1, 'test'); const hd = sim.snapshot().events.find((e) => e.type === 'heatDrop'); t('dropStars', sim.heat.stars === 1 && hd && hd.reason === 'test');
    t('heatStars', sim.heatStars() === 1);
    const c = sim.cops._makeCop('cop', sim.rv.x + 20, sim.rv.z + 20, 0, 0); sim.cops.cops.push(c);
    const L = sim.copsList(); t('copsList', L.some((x) => x.id === c.id && x.kind === 'cop' && 'state' in x && 'speed' in x));
    sim.applyCopEffect(c.id, { soak: 2 }); t('applyCopEffect soak → 6', c.state === 6);
    sim.applyCopEffect(c.id, { stall: 2 }); t('stall → 7', c.state === 7);
    sim.applyCopEffect(c.id, { blind: 2 }); t('blind → 8', c.state === 8);
    const hpC = c.hp; sim.applyCopEffect(c.id, { damage: 5, push: { x: 4, z: 0 } }); t('damage + push', c.hp === hpC - 5 && c.vx >= 4);
    for (let i = 0; i < 60 * 2.2; i++) sim.step({ throttle: 0, handbrake: true }, DT);
    t('effects time out → chasing again', c.state === 1);
    let called = 0;
    sim.redirectCops((cop) => { called++; return { x: cop.x + 50, z: cop.z + 200 }; }, 1);
    for (let i = 0; i < 30; i++) sim.step({ throttle: 0, handbrake: true }, DT);
    t('redirectCops', called > 0 && c.redirected === true);
    for (let i = 0; i < 60; i++) sim.step({ throttle: 0, handbrake: true }, DT);
    t('redirect ends', !sim.cops.redirect);
    sim.setFx({ fog: 0.7, flash: 0.5 }, 0.5); const fx = sim.snapshot().fx; t('setFx', fx.fog === 0.7 && fx.flash === 0.5);
    sim.setFx({ fog: 0.3 }); t('setFx max-merge', sim.fx.fog === 0.7);
    for (let i = 0; i < 120; i++) sim.step({ throttle: 0, handbrake: true }, DT);
    t('setFx decays', sim.fx.flash === 0 && sim.fx.fog < 0.7);
    const tid = sim.spawnTrafficCar('sedan', sim.road.xAt(sim.rv.z + 60, 1.8), sim.rv.z + 60, sim.road.heading(sim.rv.z), 10);
    t('spawnTrafficCar', tid != null && sim.trafficList().some((x) => x.id === tid));
    t('applyTrafficEffect', sim.applyTrafficEffect(tid, { launch: 6 }) && sim.traffic.cars.find((x) => x.id === tid).airborne);
    t('surfaceAt / laneBlocked', sim.surfaceAt(16200) === 0 && sim.laneBlocked(16200, 0) === false);
    const u0 = sim.inv.units; sim.inv.units = 3; sim.inv.value = 3000; t('takeProduct', sim.takeProduct(2) === 2 && sim.inv.units === 1); sim.inv.units = u0;
    const p0 = sim.score.points; sim.addPoints(50); t('addPoints', sim.score.points === p0 + 50);
    sim.inv.gadgets.smoke = 1; t('useGadget', sim.useGadget('smoke', { x: sim.rv.x, z: sim.rv.z + 10, place: true }) && sim.inv.gadgets.smoke === 0 && sim.gadgetZones().length === 1);
    sim.respawnRv(16000, 'test'); t('respawnRv', Math.abs(sim.rv.z - 16000) < 0.01 && sim.rv.speed === 0 && sim.rv.grace > 0);
    t('sim.stop getter', sim.stop === null);
    check('k1 every helper in the contract (+ the optional ones) works', !fails.length, fails.length ? `failed: ${fails.join(', ')}` : '30 assertions');

    // k2 car wash: the car_wash set-piece decides; SIM-CORE's fallback only when the plugin is missing
    const W = sim.structures.layout.carWashes[0];
    const washPass = (noPlugin, speed) => {
      const s = new GameSim(data, { seed, solo: true });
      toDrive(s);
      if (noPlugin) s.setpieces = { active: [], update() {}, ents(o) { return o; }, colliders(o) { return o; }, surfaceY() { return undefined; }, laneBlocked() { return false; }, state() { return []; }, resetBehind() {} };
      placeAt(s, W.from - 70, W.axisU);
      const ap = new Autopilot(data, { seed, sim: s, maxSpeed: speed, useNitro: false, stops: false });
      let snap = s.snapshot(), drops = 0, maxV = 0, inside = 0;
      for (let i = 0; i < 60 * 20 && s.rv.z < W.to + 30; i++) {
        s.traffic.cars = []; s.cops.clearAll();
        if (s.heat.stars < 1 && !drops) s.heat.set(1.5);
        s.step(ap.update(snap), DT); snap = s.snapshot();
        if (s.rv.z > W.from && s.rv.z < W.to) { maxV = Math.max(maxV, s.rv.speed); if (Math.abs(s.road.uAt(s.rv.x, s.rv.z) - W.axisU) <= W.halfIn) inside++; }
        for (const e of snap.events) if (e.type === 'heatDrop' && /wash/i.test(String(e.reason))) drops++;
      }
      return { drops, maxV, inside };
    };
    const wSlow = washPass(false, 11), wFast = washPass(false, 22), wNone = washPass(true, 22);
    console.log(`  car wash: plugin+slow drops=${wSlow.drops} (v ${wSlow.maxV.toFixed(0)}) · plugin+too fast drops=${wFast.drops} (v ${wFast.maxV.toFixed(0)}) · no plugin+fast drops=${wNone.drops} (v ${wNone.maxV.toFixed(0)})`);
    check('k2 car wash: the set-piece decides (a refused too-fast pass drops nothing); fallback only without the plugin', wSlow.drops === 1 && wFast.drops === 0 && wNone.drops === 1 && wFast.inside > 30 && wNone.inside > 30,
      `slow ${wSlow.drops} fast ${wFast.drops} none ${wNone.drops}`);

    // k3 rail crossing zone covers the yard siding: no props, no parked patrols, no cop spawns
    const rz = sim.structures.layout.zones.find((zz) => zz[2] === 'rail_crossing');
    const rl = sim.structures.layout.railLines;
    const sid = rl.find((r) => r.kind === 'siding');
    const O = sim.obstacles;
    let propsIn = 0;
    for (let ci = Math.floor(1700 / O.size); ci <= Math.ceil(1900 / O.size); ci++) { O.list = []; O._genChunk(ci); propsIn += O.list.filter((o) => o.src === 'chunk' && o.z > 1770 && o.z < 1840).length; }
    const patrolIn = sim.cops.patrols.filter((p) => p.z > 1765 && p.z < 1845).length;
    const copSpawnOk = [1780, 1800, 1824, 1834].every((zz) => !sim.cops._validSpawnZ(zz));
    console.log(`  rail lines ${rl.map((r) => `${r.kind}@${r.z}`).join(', ')} · zone ${rz && rz.slice(0, 2).join('…')} · props in 1770–1840: ${propsIn} · patrols: ${patrolIn} · cop spawn blocked: ${copSpawnOk}`);
    check('k3 the rail-crossing zone runs past the yard siding (~z 1835): no props, patrols or cop spawns', rz && sid && rz[1] >= sid.z + 10 && propsIn === 0 && patrolIn === 0 && copSpawnOk, `zone to ${rz && rz[1]}`);

    // k4 resets never park the RV on the rails; a repeated reset at the same spot hops further ahead
    const s4 = new GameSim(data, { seed, solo: true }); toDrive(s4);
    const onRails = [1795, 1800, 1806, 1820, 1824, 1829].map((zz) => { placeAt(s4, zz); s4.rv.resetCd = 0; s4.step({ throttle: 0, steer: 0, reset: true }, DT); return Math.min(...rl.map((r) => Math.abs(s4.rv.z - r.z))); });
    placeAt(s4, 12000); s4.traffic.cars = [];
    const hops = [];
    for (let k = 0; k < 4; k++) { s4.rv.resetCd = 0; const z0 = s4.rv.z; s4.step({ throttle: 0, steer: 0, reset: true }, DT); hops.push(+(s4.rv.z - z0).toFixed(1)); }
    console.log(`  reset from the rails → nearest rail ${onRails.map((d) => d.toFixed(1)).join(' / ')} m · repeated resets hop ${hops.join(', ')} m`);
    check('k4 resets: never within 4 m (body) of a rail line; repeats at one spot hop forward', onRails.every((d) => d >= s4.rv.len / 2 + 4) && hops[1] >= 12 && hops[2] >= 12, `min ${Math.min(...onRails).toFixed(1)} m`);
  }


  // ── l) Round 3 ──────────────────────────────────────────────────────────────
  if (run('l')) {
    hr('l) Round 3: difficulty · bust grace · regen · cop effects · cops fire back · stop response');
    const raw = data;
    const before = JSON.stringify(raw);
    const D = Object.fromEntries(DIFFICULTIES.map((l) => [l, withDifficulty(raw, l)]));
    {
      const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
      const expect = [
        // [path in rules (or route.…), easy, hard, extreme]
        ['heat.copRamDamage', 4, 6, 9], ['heat.suvRamDamage', 6, 10, 15],
        ['heat.levels.3.copTopSpeed', 30, 32, 34], ['heat.levels.1.maxCops', 1, 1, 2], ['heat.levels.3.maxCops', 2, 3, 4],
        ['heat.levels.2.spawnEvery', 9.1, 7, 5.25], ['heat.sources.pedHit', 0.315, 0.45, 0.585],
        ['heat.decayDelay', 5, 7, 10], ['heat.decayPerSec', 0.08, 0.05, 0.03],
        ['heat.levels.4.rhino', false, undefined, true], ['heat.levels.5.rhino', false, true, true],
        ['defend.copFire.chaseStars', 5, undefined, 3], ['heat.bust.grace', 5, 3, 1.5], ['heat.bust.seconds', 6, 4, 2.5],
        ['rv.regenPerSec', 0.45, 0.3, 0.15], ['rv.regenDelay', 6, 10, 15], ['rv.crashDamagePerMps', 0.385, 0.55, 0.715],
        ['cook.hurtMult', 0.6, 1, 1.5], ['cook.zoneScale', 1.3, 1, 0.7], ['cook.burnerFireMult', 0.6, 1, 1.5], ['cook.spillMult', 0.35, 1, 1.8],
        ['sim.obstacles.densityMult', 0.7, 1, 1.3], ['sim.traffic.densityMult', 0.8, 1, 1.2], ['shops.timeMult', 1.25, 1, 0.75],
        ['defend.hitsMult', 0.75, undefined, 1.5], ['defend.ammoMult', 1.5, undefined, 0.7], ['defend.flare', undefined, undefined, 0],
        ['driver.lookCooldown', 20, 30, 45], ['route.sellPoint.requiredUnits', 4, 6, 8],
        ['sim.startGadgets.smoke', 2, 1, 0], ['sim.startGadgets.nitro', 1, 0, 0],
        ['bridge.missDamage', 20, 30, 50], ['bridge.missBags', 1, 1, 2], ['scoring.mult', 0.75, 1, 1.5],
        ['stops.response.cops', 1, 2, 3], ['stops.response.delay', 12, 8, 5],
      ];
      const bad = [];
      for (const [path, ...want] of expect) {
        DIFFICULTIES.forEach((l, i) => {
          const root = path.startsWith('route.') ? D[l].route : D[l].rules;
          const v = get(root, path.replace(/^route\./, ''));
          const w = want[i];
          if (w === undefined) return;   // Hard value lives in DEFEND's block (or isn't a lever there)
          const ok = typeof w === 'number' ? Math.abs(v - w) < 1e-6 : v === w;
          if (!ok) bad.push(`${l}:${path}=${v} (want ${w})`);
        });
      }
      // Hard return fire / chase numbers scaled for Easy / Extreme (relative to Hard, or the contract defaults)
      const cf = (l) => D[l].rules.defend?.copFire || {};
      const hf = { returnEvery: 2.4, returnDamage: 2, chaseEvery: 6, chaseDamage: 1.5, ...(raw.rules.defend?.copFire || {}) };
      if (Math.abs(cf('easy').returnEvery - hf.returnEvery * 2.5) > 1e-6 || Math.abs(cf('extreme').returnDamage - hf.returnDamage * 1.5) > 1e-6) bad.push(`copFire easy ${JSON.stringify(cf('easy'))} extreme ${JSON.stringify(cf('extreme'))}`);
      check('l1 withDifficulty: every lever of the table on Easy / Hard / Extreme', !bad.length, bad.length ? bad.slice(0, 6).join('; ') : `${expect.length} levers × 3 levels`);
      const hardSame = JSON.stringify(D.hard.rules) === JSON.stringify(raw.rules) && JSON.stringify(D.hard.route) === JSON.stringify(raw.route);
      const again = withDifficulty(D.extreme, 'extreme');
      check('l2 withDifficulty: Hard = the rules as written; input never mutated; new objects; re-applying starts from the originals', hardSame && JSON.stringify(raw) === before && D.hard.rules !== raw.rules && D.easy.route !== raw.route && D.extreme.difficulty === 'extreme'
        && JSON.stringify(again.rules) === JSON.stringify(D.extreme.rules) && normDifficulty('EXTREME') === 'extreme' && normDifficulty('nope') === 'hard' && normDifficulty() === 'hard'
        && difficultyInfo('easy').color === '#D9C38A' && difficultyInfo('hard').color === '#E07A3C' && difficultyInfo('extreme').color === '#E5483A');
      // snapshot + EndResult
      const sx = new GameSim(D.extreme, { seed, solo: true }); toDrive(sx);
      sx.inv.units = 9; sx.inv.value = 9000; sx.inv.quality = 0.8; sx.score.points = 1000;
      const snapD = sx.snapshot().difficulty;
      sx.win();
      const rx = sx.result;
      const sh = new GameSim(D.hard, { seed, solo: true }); toDrive(sh);
      sh.inv.units = 9; sh.inv.value = 9000; sh.inv.quality = 0.8; sh.score.points = 1000; sh.driveTime = sx.driveTime; sh.win();
      const rh = sh.result;
      const raw0 = new GameSim(raw, { seed, solo: true });
      check('l3 snapshot.difficulty; EndResult { difficulty, scoreMult } with points × mult; raw data → hard', snapD === 'extreme' && rx.difficulty === 'extreme' && rx.scoreMult === 1.5 && rh.scoreMult === 1 && rh.difficulty === 'hard'
        && Math.abs(rx.points - Math.round(rh.points * 1.5)) <= 1 && raw0.snapshot().difficulty === 'hard', `extreme ${rx.points} pts vs hard ${rh.points}`);
      // start gadgets / bags needed / bridge miss
      const se = new GameSim(D.easy, { seed, solo: true }), sxx = new GameSim(D.extreme, { seed, solo: true });
      check('l4 start gadgets + bags needed per difficulty', se.inv.gadgets.smoke === 2 && se.inv.gadgets.nitro === 1 && sxx.inv.gadgets.smoke === 0 && se.route.sellPoint.requiredUnits === 4 && sxx.route.sellPoint.requiredUnits === 8);
    }
    // ── bust grace on every difficulty: a running cop parked beside the stopped RV
    {
      const res = [];
      for (const l of DIFFICULTIES) {
        const sim = new GameSim(D[l], { seed, solo: false });
        toDrive(sim); placeAt(sim, 600, sim.road.laneU(600, 1, 0));
        sim.cops.clearAll(); sim.cops.noMoreSpawns = true; sim.traffic.cars = [];
        sim.heat.set(2.2);
        const c = sim.cops._makeCop('cop', sim.rv.x, sim.rv.z, sim.rv.yaw, 0); sim.cops.cops.push(c);
        const B = sim.rules.heat.bust;
        let firstBust = null, lostT = null, graceSeen = [];
        const t0 = sim.t;
        for (let i = 0; i < 60 * 20; i++) {
          const rx = -Math.cos(sim.rv.yaw), rz = Math.sin(sim.rv.yaw);
          c.x = sim.rv.x + rx * 3.4; c.z = sim.rv.z + rz * 3.4; c.vx = c.vz = 0; c.speed = 0; c.state = 1;
          sim.step({ throttle: 0, steer: 0, handbrake: true }, DT);
          const sn = sim.snapshot();
          if (i % 30 === 0) graceSeen.push(sn.bustInfo.grace);
          if (firstBust == null && sn.bust > 0) firstBust = sim.t - t0;
          if (sim.phase === 'lost') { lostT = sim.t - t0; break; }
        }
        res.push({ l, firstBust, lostT, grace: B.grace, secs: B.seconds, reason: sim.lostReason, graceDown: graceSeen[0] > graceSeen[2] });
      }
      console.log('  ' + res.map((r) => `${r.l}: grace ${r.grace} s → meter from ${r.firstBust?.toFixed(2)} s, busted at ${r.lostT?.toFixed(2)} s (grace + ${r.secs} s)`).join(' · '));
      check('l5 stopping with stars never busts inside the grace; then busted after grace + bust.seconds (each difficulty)', res.every((r) => r.firstBust != null && r.firstBust >= r.grace - 0.02 && r.reason === 'busted' && Math.abs(r.lostT - (r.grace + r.secs)) < 0.15 && r.graceDown));
      // moving faster than maxRvSpeed resets the stopped clock
      const sim = new GameSim(D.hard, { seed, solo: false });
      toDrive(sim); placeAt(sim, 600, sim.road.laneU(600, 1, 0)); sim.cops.clearAll(); sim.cops.noMoreSpawns = true;
      for (let i = 0; i < 120; i++) sim.step({ throttle: 0, handbrake: true }, DT);
      const st1 = sim.rv.stopped;
      for (let i = 0; i < 120 && Math.abs(sim.rv.speed) < 5; i++) sim.step({ throttle: 1 }, DT);
      check('l6 rv.stopped counts while |speed| < 4 and resets when faster; bustInfo armed after the grace', st1 > 1.9 && sim.rv.stopped === 0 && sim.snapshot().bustInfo.armed === false && typeof sim.snapshot().rv.stopped === 'number', `stopped ${st1.toFixed(2)} → ${sim.rv.stopped}`);
    }
    // ── regen on all three bars, each with its own timer, never from 0
    {
      const sim = new GameSim(D.hard, { seed, solo: true });
      toDrive(sim); placeAt(sim, 16200); sim.cops.clearAll(); sim.cops.noMoreSpawns = true; sim.traffic.cars = []; sim.peds.peds = [];
      const R = sim.rules.rv, hold = { throttle: 0, handbrake: true };
      const evs = [];
      const stepS = (secs) => { for (let i = 0; i < Math.round(secs * 60); i++) { sim.step(hold, DT); for (const e of sim.snapshot().events) if (e.type === 'regen') evs.push({ ...e, t: sim.t }); } };
      sim.damageRv(20, 'test', true);            // t0: hull
      stepS(5); sim.hurtDriver(10);              // t0+5: Rook
      stepS(3); sim.labLink.hurtCook(15);        // t0+8: Doc
      stepS(1.9);                                 // t0+9.9
      const a = { rv: sim.rv.hp, d: sim.crew.driver, c: sim.crew.cook };
      stepS(5.2);                                  // t0+15.1: hull healing for 5.1 s, Rook from t0+15
      const b = { rv: sim.rv.hp, d: sim.crew.driver, c: sim.crew.cook, regen: sim.snapshot().crew.regen };
      stepS(5);                                    // t0+20.1
      const c = { rv: sim.rv.hp, d: sim.crew.driver, c: sim.crew.cook };
      const rate = R.regenPerSec;
      const ok1 = a.rv === 80 && a.d === 90 && a.c === 85;
      const ok2 = Math.abs(b.rv - (80 + rate * 5.1)) < 0.05 && Math.abs(b.d - 90) < 0.05 && b.c === 85;
      const ok3 = Math.abs(c.d - (90 + rate * 5.1)) < 0.06 && Math.abs(c.c - (85 + rate * 2.1)) < 0.06;
      const bars = new Set(evs.filter((e) => e.on).map((e) => e.bar));
      console.log(`  regen ${rate}/s after ${R.regenDelay} s: hull 80→${b.rv.toFixed(2)}→${c.rv.toFixed(2)} · Rook 90→${b.d.toFixed(2)}→${c.d.toFixed(2)} · Doc 85→${b.c.toFixed(2)}→${c.c.toFixed(2)} · events on: ${[...bars].join(',')}`);
      check('l7 regen: each bar heals regenPerSec after regenDelay s since ITS OWN last damage; EV.REGEN {on, bar}', ok1 && ok2 && ok3 && bars.has('rv') && bars.has('driver') && bars.has('cook'));
      // never from 0: Doc knocked out stays at 0 (cookDown), then comes back at 25 and waits the delay
      sim.labLink.hurtCook(500);
      stepS(11);
      const down = sim.crew.cook;
      stepS(1.2);
      const back = sim.crew.cook;
      stepS(5);
      check('l8 regen never revives a bar at 0 (Doc out cold) and waits the delay after he is back', down === 0 && back === sim.cfg.lab.cookReviveHp && sim.crew.cook === back, `down ${down} → back ${back} → ${sim.crew.cook}`);
      // per difficulty rate
      const rates = DIFFICULTIES.map((l) => { const s2 = new GameSim(D[l], { seed, solo: true }); toDrive(s2); placeAt(s2, 16200); s2.cops.clearAll(); s2.cops.noMoreSpawns = true; s2.traffic.cars = []; s2.peds.peds = [];
        s2.damageRv(30, 'test', true); const d0 = s2.rules.rv.regenDelay; for (let i = 0; i < Math.round((d0 + 4) * 60); i++) s2.step(hold, DT); return { l, gain: s2.rv.hp - 70, want: s2.rules.rv.regenPerSec * 4 }; });
      check('l9 regen rate / delay follow the difficulty (Easy 0.45/6 s · Hard 0.3/10 s · Extreme 0.15/15 s)', rates.every((r) => Math.abs(r.gain - r.want) < 0.05), rates.map((r) => `${r.l} +${r.gain.toFixed(2)}`).join(' '));
    }
    // ── cop effects: holes, crack, tyre (9), radiator (10), duck; copFx
    {
      const sim = new GameSim(D.hard, { seed, solo: false });
      toDrive(sim); placeAt(sim, 16200); sim.cops.clearAll(); sim.cops.noMoreSpawns = true; sim.traffic.cars = [];
      sim.heat.set(1.5);
      const yaw = sim.rv.yaw, mk = (ahead, lat = 0, speed = 0) => { const c = sim.cops._makeCop('cop', sim.rv.x + Math.sin(yaw) * ahead - Math.cos(yaw) * lat, sim.rv.z + Math.cos(yaw) * ahead + Math.sin(yaw) * lat, yaw, speed); sim.cops.cops.push(c); return c; };
      const A = mk(60, 0, 15), B = mk(90, 3, 15), C = mk(120, -3, 0), E = mk(150, 0, 0), F = mk(180, 3, 0);
      const w0 = A.w;
      sim.applyCopEffect(A.id, { tyre: 'fl', hole: 3 });
      sim.applyCopEffect(B.id, { radiator: true, hole: 1 });
      sim.applyCopEffect(C.id, { hole: 2, crack: true });
      sim.applyCopEffect(E.id, { tyre: 'rr', radiator: true });
      sim.applyCopEffect(F.id, { radiator: true });
      const s0 = { A: A.state, B: B.state, C: C.state, E: E.state, duck: C.duckT };
      sim.applyCopEffect(A.id, { stall: 30 }); sim.cops.blind(A, 5); sim.cops.spinOut(B, 3);
      sim.applyCopEffect(F.id, { stall: 30 });
      const fx = sim.snapshot().copFx;
      const tup = (c) => fx.find((t) => t[0] === c.id);
      const hold = { throttle: 0, handbrake: true };
      for (let i = 0; i < 60 * 3; i++) sim.step(hold, DT);
      const vA3 = Math.abs(A.speed);
      for (let i = 0; i < 60 * 12.2; i++) sim.step(hold, DT);   // t ≈ 15.2 s
      const sB = B.state, sF = F.state, sA15 = A.state;
      for (let i = 0; i < 60 * 5.2; i++) sim.step(hold, DT);    // t ≈ 20.4 s
      const sA20 = A.state;
      console.log(`  states right after: tyre ${s0.A} radiator ${s0.B} hole+crack ${s0.C} (duck ${s0.duck.toFixed(1)} s) tyre+radiator ${s0.E} · tyre car ${w0.toFixed(2)}→ yaw rate pulled left, speed after 3 s ${vA3.toFixed(1)} · at 15.2 s radiator→${sB}, stalled-30 radiator ${sF} · tyre car at 15.2 s ${sA15}, at 20.4 s ${sA20} · copFx ${JSON.stringify(fx)}`);
      check('l10 tyre → state 9 (slews to a stop, out ~20 s, then gives up = 5); stall/smoke/oil don\'t change it', s0.A === 9 && vA3 < 1.5 && sA15 === 9 && sA20 === 5);
      check('l11 radiator → state 10 (stalled, steaming) for 15 s, then back to the chase; a stall only lengthens it; tyre beats radiator', s0.B === 10 && sB === 1 && sF === 10 && s0.E === 9);
      check('l12 copFx tuples [id, holes, crack, tyreMask, steam]; a non-disabling hit makes the officers duck', tup(A) && tup(A)[1] === 3 && tup(A)[3] === 1 && tup(B)[4] === 1 && tup(C)[1] === 2 && tup(C)[2] === 1 && tup(E)[3] === 8 && tup(E)[4] === 1 && s0.C === 1 && s0.duck > 1);
      // disabled 9/10 cars neither see, bust, block loading, nor ring the lab alert
      const s2 = new GameSim(D.hard, { seed, solo: false });
      toDrive(s2); placeAt(s2, 600, s2.road.laneU(600, 1, 0)); s2.cops.clearAll(); s2.cops.noMoreSpawns = true; s2.traffic.cars = [];
      s2.heat.set(1.5);
      const k1 = s2.cops._makeCop('cop', s2.rv.x - Math.cos(s2.rv.yaw) * 3.4, s2.rv.z + Math.sin(s2.rv.yaw) * 3.4, s2.rv.yaw, 0); s2.cops.cops.push(k1);
      const k2 = s2.cops._makeCop('cop', s2.rv.x + Math.cos(s2.rv.yaw) * 3.4, s2.rv.z - Math.sin(s2.rv.yaw) * 3.4, s2.rv.yaw, 0); s2.cops.cops.push(k2);
      s2.applyCopEffect(k1.id, { tyre: 'fl' }); s2.applyCopEffect(k2.id, { radiator: true });
      let maxBust = 0, seen = false, alert = 999;
      for (let i = 0; i < 60 * 10; i++) { s2.step({ throttle: 0, handbrake: true }, DT); const sn = s2.snapshot(); maxBust = Math.max(maxBust, sn.bust); seen = seen || sn.heat.seen; alert = Math.min(alert, sn.alert.copDist); }
      check('l13 states 9/10 never see, bust or ring the lab alert', maxBust === 0 && !seen && alert > 100, `bust ${maxBust} seen ${seen} alert ${alert}`);
    }
    // ── cops fire back: return fire only while Rook is up; chase fire only from chaseStars
    {
      const fakeRoof = (up) => ({ active: up, roofRook: up, onRoof: up, holdsRv: up, climb: up ? 1 : 0, update() {}, command() { return false; }, state() { return { active: up, available: false, why: null, nearCop: 999 }; } });
      const returnFire = (l, up) => {
        const sim = new GameSim(D[l], { seed, solo: false });
        toDrive(sim); placeAt(sim, 16200); sim.cops.clearAll(); sim.cops.noMoreSpawns = true; sim.traffic.cars = []; sim.peds.peds = [];
        sim.roof = fakeRoof(up);
        sim.heat.set(1.5);
        const c = sim.cops._makeCop('cop', sim.rv.x + Math.sin(sim.rv.yaw) * 15, sim.rv.z + Math.cos(sim.rv.yaw) * 15, sim.rv.yaw + Math.PI, 0); sim.cops.cops.push(c);
        const shots = [];
        const hp0 = sim.rv.hp, d0 = sim.crew.driver;
        for (let i = 0; i < 60 * 60; i++) {
          c.x = sim.rv.x + Math.sin(sim.rv.yaw) * 15; c.z = sim.rv.z + Math.cos(sim.rv.yaw) * 15; c.vx = c.vz = 0; c.speed = 0; c.state = 1;
          if (sim.heat.value < 1.2) sim.heat.set(1.5);   // keep the chase on (calm decay would end it after ~30 s)
          sim.step({ throttle: 0, handbrake: true }, DT);
          for (const e of sim.snapshot().events) if (e.type === EV.COP_SHOT) shots.push(e);
          if (sim.phase !== 'drive') break;
        }
        return { shots, hits: shots.filter((e) => e.hit).length, rvDmg: sim.damageTaken.rv, rookDmg: sim.damageTaken.driver, phase: sim.phase, F: sim.cops.copFire(), dHull: hp0 - sim.rv.hp, dRook: d0 - sim.crew.driver };
      };
      const down = returnFire('hard', false), up = returnFire('hard', true), upE = returnFire('easy', true), upX = returnFire('extreme', true);
      const F = up.F;
      const e0 = up.shots[0] || {};
      console.log(`  return fire over 60 s at a cop 15 m away: Rook down ${down.shots.length} shots · up: Easy ${upE.shots.length} (${upE.hits} hits, hull −${upE.rvDmg.toFixed(1)}) · Hard ${up.shots.length} (${up.hits} hits, hull −${up.rvDmg.toFixed(1)}, Rook −${up.rookDmg.toFixed(1)}) · Extreme ${upX.shots.length} (${upX.hits} hits, hull −${upX.rvDmg.toFixed(1)})`);
      const expShots = 60 / F.returnEvery;
      check('l14 return fire only while Rook is up: ~every returnEvery s, hits hull returnDamage + Rook × rookShare; EV.COP_SHOT shape', down.shots.length === 0 && up.shots.length >= expShots * 0.7 && up.shots.length <= expShots * 1.35
        && Math.abs(up.rvDmg - up.hits * F.returnDamage) < 1e-6 && Math.abs(up.rookDmg - up.hits * F.returnDamage * F.rookShare) < 1e-6 && up.hits > 0 && up.hits < up.shots.length
        && e0.target === 'rook' && ['copId', 'x', 'y', 'z', 'tx', 'ty', 'tz', 'hit', 'damage'].every((k) => k in e0));
      check('l15 return fire scales with the difficulty (Easy < Hard < Extreme damage taken)', upE.rvDmg < up.rvDmg && up.rvDmg < upX.rvDmg && upE.shots.length < up.shots.length && up.shots.length < upX.shots.length);
      const chase = (l, stars) => {
        const sim = new GameSim(D[l], { seed, solo: false });
        toDrive(sim); placeAt(sim, 20800); sim.cops.clearAll(); sim.cops.noMoreSpawns = true; sim.traffic.cars = []; sim.peds.peds = [];
        sim.rv.grace = 0;
        const c = sim.cops._makeCop('cop', sim.rv.x, sim.rv.z - 15, sim.rv.yaw, 0); sim.cops.cops.push(c);
        const shots = [];
        for (let i = 0; i < 60 * 40; i++) {
          if (Math.floor(sim.heat.value) !== stars) sim.heat.set(stars + 0.5);
          const s = Math.sin(sim.rv.yaw), co = Math.cos(sim.rv.yaw);
          c.x = sim.rv.x - s * 15; c.z = sim.rv.z - co * 15; c.vx = sim.rv.vx; c.vz = sim.rv.vz; c.yaw = sim.rv.yaw; c.speed = sim.rv.speed; c.state = 1; c.ramT = 0; c.ramCd = 99;
          sim.step({ throttle: sim.rv.speed < 14 ? 1 : 0.2, steer: 0 }, DT);
          for (const e of sim.snapshot().events) if (e.type === EV.COP_SHOT) shots.push(e);
          if (sim.phase !== 'drive') break;
        }
        return { n: shots.length, rv: shots.every((e) => e.target === 'rv'), dmg: sim.damageTaken.rv, chaseStars: sim.cops.copFire().chaseStars };
      };
      const h3 = chase('hard', 3), h4 = chase('hard', 4), x3 = chase('extreme', 3), e4 = chase('easy', 4), e5 = chase('easy', 5);
      console.log(`  chase fire over 40 s (cop 15 m behind the moving RV): Hard 3★ ${h3.n} · Hard 4★ ${h4.n} · Extreme 3★ ${x3.n} · Easy 4★ ${e4.n} · Easy 5★ ${e5.n}`);
      check('l16 chase fire only from chaseStars (Easy 5★, Hard 4★, Extreme 3★), at the moving RV (hull only)', h3.n === 0 && h4.n > 0 && x3.n > 0 && e4.n === 0 && e5.n > 0 && h4.rv && x3.rv);
    }
    // ── cops sent to every stop
    {
      const res = [];
      for (const l of DIFFICULTIES) {
        const sim = new GameSim(D[l], { seed, solo: false });
        toDrive(sim);
        const st = sim.stops.stops[0];
        sim.rv.z = st.lot.cz; sim.rv.x = st.lot.cx; sim.rv.yaw = sim.road.heading(st.lot.cz); sim.rv.vx = sim.rv.vz = 0; sim.rv.speed = 0;
        sim.traffic.cars = []; sim.cops.clearAll(); sim.cops.patrols.forEach((p) => { p.spawned = true; });
        const R = sim.cops.responseRules();
        let ev = null, h1 = null, firstSpawn = null, n = 0, toast = false;
        const t0 = sim.t;
        for (let i = 0; i < 60 * (R.delay + 8); i++) {
          sim.step({ throttle: 0, handbrake: true }, DT);
          for (const e of sim.snapshot().events) { if (e.type === EV.STOP_COPS) { ev = e; h1 = sim.heat.value; } if (e.type === 'msg' && /called it in/.test(e.text)) toast = true; }
          n = sim.cops.cops.filter((c) => c.response === st.def.id).length;
          if (n > 0 && firstSpawn == null) firstSpawn = sim.t - t0;
        }
        res.push({ l, ev, h1, firstSpawn, n, toast, R });
      }
      console.log('  ' + res.map((r) => `${r.l}: ${r.ev?.count} cops (eta ${r.ev?.eta} s) heat→${r.h1?.toFixed(2)} first at ${r.firstSpawn?.toFixed(1)} s, ${r.n} spawned`).join(' · '));
      check('l17 parking at a stop calls in N cops after `delay` s (heat ≥ 1.2, EV.STOP_COPS + toast) — 1 / 2 / 3 per difficulty', res.every((r) => r.ev && r.ev.count === r.R.cops && r.h1 >= 1.2 && r.toast && r.firstSpawn >= r.R.delay - 0.05 && r.firstSpawn < r.R.delay + 2 && r.n === r.R.cops) && res.map((r) => r.n).join() === '1,2,3');
    }
    // ── DCMD roof routing; the cook's old roof commands are ignored
    {
      const sim = new GameSim(D.hard, { seed, solo: false });
      toDrive(sim);
      const got = [];
      sim.roof = { active: false, roofRook: false, holdsRv: true, command(c) { got.push(c.type); return 'ok'; }, update() {}, state() { return { active: false }; } };
      const r1 = sim.applyDriverCommand({ type: 'defend', on: true, ai: true });
      for (const t of ['roofAim', 'roofFire', 'roofReload', 'roofSelect', 'roofThrow']) sim.applyDriverCommand({ type: t });
      for (const t of ['roofEnter', 'roofLeave', 'roofAim', 'roofThrow']) sim.applyCookCommand({ type: t });
      placeAt(sim, 16200);
      const p = { x: sim.rv.x, z: sim.rv.z };
      for (let i = 0; i < 90; i++) sim.step({ throttle: 1, steer: 0 }, DT);
      const held = Math.hypot(sim.rv.x - p.x, sim.rv.z - p.z) < 0.05;
      check('l18 DCMD defend/roofAim/roofFire/roofReload/roofSelect/roofThrow → roof.command(); cook roof* ignored; roof.holdsRv holds the RV; rv.roofDoc false', r1 === 'ok' && got.join() === 'defend,roofAim,roofFire,roofReload,roofSelect,roofThrow' && held && sim.snapshot().rv.roofDoc === false, got.join());
    }
  }

  // ── m) full runs on Easy and Extreme (Hard is run a) ─────────────────────────
  if (run('m')) {
    hr('m) full 40 km bot runs per difficulty (solo: AI Rook defends the stops)');
    const seeds = [seed, ...(args.diffSeeds ? String(args.diffSeeds).split(',').map(Number) : [])];
    const out = {};
    for (const l of ['easy', 'hard', 'extreme']) {
      out[l] = [];
      for (const s of seeds) {
        const R = (l === 'hard' && s === seed && A) ? A : runFull(data, s, { difficulty: l });
        const r = R.sim.result || {};
        const row = { s, phase: R.sim.phase, reason: r.reason ?? R.sim.lostReason, z: R.sim.rv.z, t: R.sim.t, dmg: R.sim.damageTaken.rv, rook: R.sim.damageTaken.driver, looted: R.sim.stops.lootedCount(), stars: R.stat.maxStars, pts: r.points, ended: R.sim.phase === 'won' || R.sim.phase === 'lost', dmgPerKm: R.sim.damageTaken.rv / Math.max(0.5, R.sim.rv.z / 1000) };
        out[l].push(row);
        console.log(`  ${l.padEnd(7)} seed ${s}: ${row.phase}/${row.reason} at ${(row.z / 1000).toFixed(1)} km in ${fmtT(row.t)} · hull damage taken ${row.dmg.toFixed(0)} (${row.dmgPerKm.toFixed(1)}/km) · Rook −${row.rook.toFixed(0)} · stops ${row.looted}/8 · ≤${row.stars}★ · ${row.pts} pts`);
      }
    }
    const sum = (l, k) => out[l].reduce((a, r) => a + r[k], 0);
    const busts = (l) => out[l].filter((r) => r.reason === 'busted' || r.reason === 'wrecked' || r.reason === 'crewDown').length;
    check('m1 every difficulty runs to an end (won or lost — never stuck)', ['easy', 'hard', 'extreme'].every((l) => out[l].every((r) => r.ended)));
    check('m2 Easy and Hard deliver on the default seed', out.easy[0].phase === 'won' && out.hard[0].phase === 'won', `easy ${out.easy[0].phase}, hard ${out.hard[0].phase}`);
    check('m3 Extreme is clearly harder than Hard (more damage per km, or more busts/wrecks) and Easy easier', (sum('extreme', 'dmgPerKm') > sum('hard', 'dmgPerKm') * 1.2 || busts('extreme') > busts('hard')) && sum('easy', 'dmgPerKm') < sum('hard', 'dmgPerKm'),
      `damage/km easy ${sum('easy', 'dmgPerKm').toFixed(1)} · hard ${sum('hard', 'dmgPerKm').toFixed(1)} · extreme ${sum('extreme', 'dmgPerKm').toFixed(1)}; lost easy ${busts('easy')} · hard ${busts('hard')} · extreme ${busts('extreme')}`);
  }

  // ── r) DEFEND's own roof tests (sim/test/roof-*.js), each in a child process ─
  if (run('r')) {
    const { readdirSync } = await import('node:fs');
    const { spawnSync } = await import('node:child_process');
    const { fileURLToPath } = await import('node:url');
    const dir = fileURLToPath(new URL('./', import.meta.url));
    let files = [];
    try { files = readdirSync(dir).filter((f) => /^roof-.*\.(m?js)$/.test(f)).sort(); } catch (e) { files = []; }
    if (files.length) {
      hr(`r) DEFEND roof tests: ${files.join(', ')}`);
      for (const f of files) {
        const p = spawnSync(process.execPath, [dir + f], { encoding: 'utf8', timeout: 10 * 60 * 1000 });
        const outp = `${p.stdout || ''}${p.stderr || ''}`.trim().split('\n');
        console.log(outp.slice(-6).map((x) => '    ' + x).join('\n'));
        check(`r ${f} passes`, p.status === 0, `exit ${p.status}${p.error ? ' ' + p.error.message : ''}`);
      }
    }
  }

  // ── summary ───────────────────────────────────────────────────────────────
  const failed = results.filter((x) => !x.ok);
  hr('summary');
  console.log(`  ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.log(`  FAILED: ${failed.map((f) => f.name).join('; ')}`); process.exitCode = 1; }
  else console.log('  ALL PASS');
}

// lateral offset for an edge blocker (sinkhole) in the forward lane
function sim0u(data, z) { return null; }

export { FakeCook, FakeShop, runFull };
// run the suite only when executed directly (scripts may import the harness)
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].startsWith('/') ? '' : process.cwd() + '/'}${process.argv[1]}`).href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
