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
// Options: --seed=N  --seeds=1,2 (extra full + cruise runs; informational)  --seeds=none (default)
//          --only=a,b,…  --strict (extra seeds must win too)  --verbose
// ─────────────────────────────────────────────────────────────────────────────
import { loadDataNode } from '../../data/loadData.js';
import { GameSim } from '../GameSim.js';
import { Autopilot } from '../autopilot.js';
import { computeSpeedNeeded } from '../bridge.js';
import { KIND, KIND_ID } from '../../shared/protocol.js';

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
    check('a4 run length 30–45 min sim time', A.sim.t >= 30 * 60 && A.sim.t <= 45 * 60, fmtT(A.sim.t));
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
    const t = process.hrtime.bigint();
    for (let i = 0; i < N; i++) { sim.step(ap.update(snap), DT); snap = sim.snapshot(); if (sim.phase === 'won' || sim.phase === 'lost') break; }
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    const sps = (N / ms) * 1000;
    const sim2 = new GameSim(data, { seed, solo: true }); toDrive(sim2);
    const t2 = process.hrtime.bigint();
    for (let i = 0; i < N; i++) sim2.step({ throttle: 1, steer: Math.sin(i / 90) * 0.3 }, DT);
    const ms2 = Number(process.hrtime.bigint() - t2) / 1e6;
    console.log(`  step+snapshot+autopilot: ${sps.toFixed(0)} steps/s (${(ms / N * 1000).toFixed(1)} µs/step); step only: ${(N / ms2 * 1000).toFixed(0)} steps/s`);
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
      check('i3 snapshot.stop has the contract fields incl. roof', snapStop && ['id', 'name', 'shopType', 'state', 'shopT', 'loadT', 'progress', 'blocked', 'copDist', 'roof'].every((k) => k in snapStop) && snapStop.roof && 'ammo' in snapStop.roof);
    }
    {
      // RV held still while shopping
      const sim = mk();
      for (let i = 0; i < 60; i++) sim.step(hold, DT);
      const p = { x: sim.rv.x, z: sim.rv.z };
      for (let i = 0; i < 120; i++) sim.step({ throttle: 1, steer: 0.5 }, DT);
      check('i4 driving input is ignored while Rook is in the shop', sim.stops.state() === 'shopping' && Math.hypot(sim.rv.x - p.x, sim.rv.z - p.z) < 0.05);
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
