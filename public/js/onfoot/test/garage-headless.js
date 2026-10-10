// ─────────────────────────────────────────────────────────────────────────────
// Headless tests for sim/garage.js (GarageTutorial):   node public/js/onfoot/test/garage-headless.js
//   a) two players, scripted inputs through the real input paths (DriverInput for Rook, CMD for Doc)
//      → every step completes, in order (load/door may swap), door animates, engine cranking → on
//   b) solo: only Rook is scripted; AI Doc does the notebook, the crate and boards by himself
//   c) hold-E: releasing early stalls the crank; edge-only input (no interactHeld) auto-cranks
//   d) skip(): done, final items, EV.TUTORIAL 'skipped'
//   e) determinism: same inputs → identical state hash (twice), and with GameSim-like Track
//   f) fallback input (steer/throttle + `oil` edge) still lets Rook move and act
//   g) frame conversions round-trip; rvPark sits on the rooks_garage `bay`
//   h) END TO END on the real GameSim: two players (DriverInput + CMD through sim.applyCookCommand,
//      15 Hz like the network), solo (AI Doc), and DCMD.skipTutorial → garage → countdown → drive
// ─────────────────────────────────────────────────────────────────────────────
import { GarageTutorial, STEPS, LAYOUT, planPath, garageFrame } from '../../sim/garage.js';
import { loadDataNode } from '../../data/loadData.js';
import { Track } from '../../sim/track.js';
import { CMD, EV, DCMD } from '../../shared/protocol.js';
import { GameSim } from '../../sim/GameSim.js';

const DT = 1 / 60;
let fails = 0;
function check(name, ok, detail = '') {
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}
const hr = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 66 - t.length))}`);

const data = await loadDataNode();
const track = new Track(data.route, data.route.defaultSeed ?? 1);

function mockSim(solo) {
  const events = [];
  return { track, route: data.route, rules: data.rules, data, solo, emit: (e) => events.push(e), events };
}

/** A scripted player: walks to state.target[who] along planned waypoints and presses E when `near`. */
class Bot {
  constructor(g, who) { this.g = g; this.who = who; this.path = null; this.goal = null; this.cd = 0; this.holdMode = 'held'; }
  // world move vector + act edge + held
  tick(st) {
    const g = this.g, F = g.frame;
    const tgt = st.target[this.who];
    const me = st[this.who];
    const out = { mx: 0, mz: 0, run: true, act: false, held: false };
    this.cd = Math.max(0, this.cd - DT);
    if (st.task[this.who] === 'crank' && this.who === 'rook') {
      out.held = true;
      if (this.cd === 0) { out.act = true; this.cd = 10; }
      return out;
    }
    if (!tgt || me.inRv) return out;
    const L = F.toLocal(me.x, me.z), T = F.toLocal(tgt.x, tgt.z);
    if (!this.goal || Math.hypot(this.goal.x - T.x, this.goal.z - T.z) > 0.2) { this.goal = T; this.path = planPath(L.x, L.z, T.x, T.z); }
    if (st.near[this.who]) {
      if (this.cd === 0) { out.act = true; this.cd = 0.3; }
      return out;
    }
    if (this.path && this.path.length > 1 && Math.hypot(L.x - this.path[0].x, L.z - this.path[0].z) < 0.35) this.path.shift();
    const w = this.path && this.path.length ? this.path[0] : T;
    let dx = w.x - L.x, dz = w.z - L.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const d = F.dirToWorld(dx, dz);
    out.mx = d.x; out.mz = d.z;
    return out;
  }
}

function runTwoPlayer({ maxT = 120, holdMode = 'held', record = null } = {}) {
  const sim = mockSim(false);
  const g = new GarageTutorial(sim);
  const rook = new Bot(g, 'rook'), doc = new Bot(g, 'doc');
  let t = 0, n = 0, docMove = null;
  const engineSeen = new Set();
  let doorSeq = [];
  while (!g.done && t < maxT) {
    const st = g.state();
    const r = rook.tick(st), d = doc.tick(st);
    if (n % 4 === 0) { docMove = { type: CMD.AVATAR_MOVE, mx: d.mx, mz: d.mz, run: d.run }; g.command(docMove); }
    if (d.act) g.command({ type: CMD.AVATAR_ACT });
    const input = { throttle: 0, steer: 0, moveX: r.mx, moveZ: r.mz, run: r.run, interact: r.act };
    if (holdMode === 'held') input.interactHeld = r.held;
    g.update(DT, input);
    engineSeen.add(g.items.engine);
    if (n % 30 === 0) doorSeq.push(g.items.door);
    if (record) record.push(JSON.stringify(g.state()));
    t += DT; n++;
  }
  return { g, sim, t, engineSeen, doorSeq };
}

// ── a) two players ──────────────────────────────────────────────────────────
hr('a) two players, scripted inputs (Rook: DriverInput · Doc: CMD.avatarMove/avatarAct)');
{
  const { g, sim, t, engineSeen, doorSeq } = runTwoPlayer();
  check('tutorial done', g.done, `${t.toFixed(1)} s`);
  const evs = sim.events.filter((e) => e.type === EV.TUTORIAL);
  const order = evs.map((e) => e.done);
  check('EV.TUTORIAL emitted for every step', evs.length === STEPS.length, order.join(' → '));
  const ix = (id) => order.indexOf(id);
  check('order: markers < grab < {load, door} < board < crank',
    ix('markers') === 0 && ix('grab') === 1 && Math.min(ix('load'), ix('door')) === 2 && Math.max(ix('load'), ix('door')) === 3 && ix('board') === 4 && ix('crank') === 5);
  check('every EV carries step/stepId', evs.every((e) => Number.isInteger(e.step) && typeof e.stepId === 'string'));
  const s = g.state();
  check('final items', s.items.keys === 'rook' && s.items.notebook === 'doc' && s.items.crate === 'rv' && s.items.plug === 'out' && s.items.door === 1 && s.items.engine === 'on', JSON.stringify(s.items));
  check('both in the RV', s.rook.inRv && s.doc.inRv);
  check('engine went off → cranking → on', engineSeen.has('off') && engineSeen.has('cranking') && engineSeen.has('on'));
  const mid = doorSeq.filter((v) => v > 0.05 && v < 0.95);
  check('door animated 0 → 1 over ~3 s', mid.length >= 3 && mid.length <= 7, `${mid.length} half-second samples in between`);
  check("finishes in a sensible time (8–60 s)", t > 8 && t < 60, `${t.toFixed(1)} s`);
  check('snapshot shape', ['step', 'stepId', 'steps', 'rook', 'doc', 'items', 'prompt'].every((k) => k in s) && ['x', 'z', 'yaw', 'speed', 'carry', 'inRv'].every((k) => k in s.rook));
  check('state is JSON-safe', JSON.stringify(JSON.parse(JSON.stringify(s))) === JSON.stringify(s));
}

// prompts + gating spot checks
hr('a2) prompts and gating');
{
  const g = new GarageTutorial(mockSim(false));
  const s0 = g.state();
  check('initial prompts', /key rack/i.test(s0.prompt.rook) && /desk/i.test(s0.prompt.doc), `${s0.prompt.rook} | ${s0.prompt.doc}`);
  check('initial targets are the two markers', !!s0.target.rook && !!s0.target.doc);
  // teleport Rook to his marker, press E before Doc arrives → keys stay on the hook
  Object.assign(g.R, LAYOUT.markers.rook);
  g.update(DT, { moveX: 0, moveZ: 0, interact: true });
  check('E before both reach markers does nothing', g.items.keys === 'hook' && /Wait for Doc/.test(g.state().prompt.rook), g.state().prompt.rook);
  Object.assign(g.D, LAYOUT.markers.doc);
  g.update(DT, {});
  check('both at markers → step 1 grab', g.step === 1 && g.state().prompt.rook === 'Grab the keys from the hook [E]', g.state().prompt.rook);
  g.update(DT, { interact: true });
  check('keys taken', g.items.keys === 'rook');
  g.command({ type: CMD.AVATAR_ACT }); g.update(DT, {});
  check('notebook taken → step 2', g.items.notebook === 'doc' && g.step === 2);
  // Rook tries the door button without unplugging
  Object.assign(g.R, LAYOUT.use.button); g.update(DT, { interact: true });
  check('door button needs the plug out first', !g.doorOpening && /Unplug/.test(g.state().prompt.rook), g.state().prompt.rook);
  // Doc drops the crate mid-way and picks it up again
  Object.assign(g.D, { x: LAYOUT.crateStart.x + 0.6, z: LAYOUT.crateStart.z + 0.6 });
  g.command({ type: CMD.AVATAR_ACT }); g.update(DT, {});
  check('crate picked up (carry)', g.items.crate === 'doc' && g.D.carry === 'crate');
  // carrying is slower and can't run
  let vmax = 0;
  for (let i = 0; i < 60; i++) { if (i % 4 === 0) g.command({ type: CMD.AVATAR_MOVE, mx: 1, mz: 0, run: true }); g.update(DT, {}); vmax = Math.max(vmax, g.D.speed); }
  check("carry speed ≤ 1.95 m/s even with run", vmax <= 1.95 && vmax > 1.2, vmax.toFixed(2));
  g.command({ type: CMD.AVATAR_ACT }); g.update(DT, {});
  check('E away from the RV puts the crate down', g.items.crate === 'floor' && !g.D.carry);
  check('no step advanced by the drop', g.step === 2 && !g.complete.load);
}

// ── b) solo ────────────────────────────────────────────────────────────────
hr('b) solo: AI Doc');
{
  const sim = mockSim(true);
  const g = new GarageTutorial(sim);
  const rook = new Bot(g, 'rook');
  let t = 0, n = 0, docMoved = 0, lastD = { x: g.D.x, z: g.D.z }, maxDocSpeed = 0, docAtMarkerT = null, docBoardT = null;
  g.command({ type: CMD.AVATAR_MOVE, mx: 1, mz: 0 }); // ignored in solo
  while (!g.done && t < 150) {
    const st = g.state();
    const r = rook.tick(st);
    g.update(DT, { moveX: r.mx, moveZ: r.mz, run: r.run, interact: r.act, interactHeld: r.held });
    docMoved += Math.hypot(g.D.x - lastD.x, g.D.z - lastD.z); lastD = { x: g.D.x, z: g.D.z };
    maxDocSpeed = Math.max(maxDocSpeed, g.D.speed);
    if (docAtMarkerT == null && g.D.atMarker) docAtMarkerT = t;
    if (docBoardT == null && g.D.inRv) docBoardT = t;
    t += DT; n++;
  }
  const s = g.state();
  check('solo tutorial done', g.done, `${t.toFixed(1)} s`);
  check('AI Doc took the notebook, loaded the crate, boarded', s.items.notebook === 'doc' && s.items.crate === 'rv' && s.doc.inRv);
  check('AI Doc walked (believable speed ≤ walk)', docMoved > 12 && maxDocSpeed <= 2.65, `${docMoved.toFixed(1)} m, max ${maxDocSpeed.toFixed(2)} m/s`);
  check('AI Doc reached his marker early', docAtMarkerT != null && docAtMarkerT < 8, `${docAtMarkerT?.toFixed(1)} s`);
  check('AI Doc boarded', docBoardT != null, `${docBoardT?.toFixed(1)} s`);
  // the AI alone (Rook idle) still does everything he can and waits
  const g2 = new GarageTutorial(mockSim(true));
  Object.assign(g2.R, LAYOUT.markers.rook);
  for (let i = 0; i < 60 * 40; i++) g2.update(DT, i === 600 ? { interact: true } : {});
  check('idle Rook: AI Doc finishes his part and waits in the RV', g2.items.crate === 'rv' && g2.D.inRv && !g2.done, `prompt doc: ${g2.state().prompt.doc}`);
}

// ── c) hold E ──────────────────────────────────────────────────────────────
hr('c) crank: hold E');
{
  const g = new GarageTutorial(mockSim(false));
  // fast-forward to the crank step
  for (const k of ['markers', 'grab', 'load', 'door']) g.complete[k] = true;
  Object.assign(g.items, { keys: 'rook', notebook: 'doc', crate: 'rv', plug: 'out' }); g.doorOpening = true;
  g.R.inRv = true; g.D.inRv = true; g.complete.board = true;
  g.update(DT, { interact: true, interactHeld: true });
  for (let i = 0; i < 45; i++) g.update(DT, { interactHeld: true });
  check('cranking while held', g.items.engine === 'cranking' && g.state().hold > 0.4, `hold ${g.state().hold}`);
  for (let i = 0; i < 60; i++) g.update(DT, { interactHeld: false });
  check('released early → stalls back to off', g.items.engine === 'off' && g.hold === 0);
  let tOn = null;
  for (let i = 0; i < 60 * 4; i++) { g.update(DT, { interactHeld: true }); if (tOn == null && g.items.engine === 'on') tOn = i * DT; }
  check('held ≥ 1.5 s → on at ~2 s', tOn != null && tOn > 1.9 && tOn < 2.2, `${tOn?.toFixed(2)} s`);
  check('done shortly after the engine is on', g.done);
  // edge-only (main.js without interactHeld): one press cranks by itself
  const h = new GarageTutorial(mockSim(false));
  for (const k of ['markers', 'grab', 'load', 'door', 'board']) h.complete[k] = true;
  h.R.inRv = h.D.inRv = true;
  h.update(DT, { interact: true });
  for (let i = 0; i < 60 * 3; i++) h.update(DT, {});
  check('edge-only input auto-cranks to done', h.done && h.items.engine === 'on');
}

// ── d) skip ────────────────────────────────────────────────────────────────
hr('d) skip');
{
  const sim = mockSim(false);
  const g = new GarageTutorial(sim);
  for (let i = 0; i < 30; i++) g.update(DT, { moveX: 1, moveZ: 0 });
  g.skip();
  const s = g.state();
  check('skip → done', g.done && s.done && s.skipped);
  check('skip → final items + both in RV', s.items.engine === 'on' && s.items.door === 1 && s.items.crate === 'rv' && s.rook.inRv && s.doc.inRv);
  check('skip emits EV.TUTORIAL skipped', sim.events.some((e) => e.type === EV.TUTORIAL && e.stepId === 'skipped'));
  g.update(DT, { moveX: 1 }); g.skip();
  check('update/skip after done are no-ops', g.done && sim.events.filter((e) => e.stepId === 'skipped').length === 1);
}

// ── e) determinism ─────────────────────────────────────────────────────────
hr('e) determinism');
{
  const hash = (arr) => { let h = 2166136261 >>> 0; for (const s of arr) for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16); };
  const a = [], b = [];
  const ra = runTwoPlayer({ record: a }), rb = runTwoPlayer({ record: b });
  check('two runs → identical state streams', a.length === b.length && hash(a) === hash(b), `${a.length} states, ${hash(a)}`);
  check('same finish time', ra.t === rb.t);
  // solo determinism
  const run = () => { const g = new GarageTutorial(mockSim(true)); const bot = new Bot(g, 'rook'); const rec = []; for (let i = 0; i < 60 * 40 && !g.done; i++) { const r = bot.tick(g.state()); g.update(DT, { moveX: r.mx, moveZ: r.mz, run: r.run, interact: r.act, interactHeld: r.held }); rec.push(JSON.stringify(g.state())); } return rec; };
  const s1 = run(), s2 = run();
  check('solo AI deterministic', hash(s1) === hash(s2), `${s1.length} states`);
}

// ── f) fallback input ──────────────────────────────────────────────────────
hr('f) fallback input (no moveX/moveZ: steer/throttle, E = oil)');
{
  const g = new GarageTutorial(mockSim(false));
  const z0 = g.R.z;
  for (let i = 0; i < 60; i++) g.update(DT, { throttle: 1, steer: 0 });
  check('W moves Rook toward the back wall (local −Z)', g.R.z < z0 - 1.5, `${z0.toFixed(2)} → ${g.R.z.toFixed(2)}`);
  Object.assign(g.R, LAYOUT.markers.rook); Object.assign(g.D, LAYOUT.markers.doc); g.update(DT, {});
  g.update(DT, { oil: true });
  check('oil edge works as E', g.items.keys === 'rook');
}

// ── g) frame ───────────────────────────────────────────────────────────────
hr('g) frame + world positions');
{
  const F = garageFrame(track, data.route);
  const p = F.toWorld(3.1, -2.7), q = F.toLocal(p.x, p.z);
  check('toWorld/toLocal round trip', Math.abs(q.x - 3.1) < 1e-9 && Math.abs(q.z + 2.7) < 1e-9);
  const gx = track.xAt(45, 18);
  // rooks_garage bay is exterior-local (2.2, −2.2) → world (gx − 2.2, 45 − 2.2)
  const g = new GarageTutorial(mockSim(false));
  check('rvPark = exterior bay, nose to the road (+X)', Math.abs(g.rvPark.x - (gx - 2.2)) < 1e-6 && Math.abs(g.rvPark.z - 42.8) < 1e-6 && Math.abs(g.rvPark.yaw - Math.PI / 2) < 1e-9, JSON.stringify(g.rvPark));
  const door = F.toWorld(4.0, 7.07);
  check('interior door faces the road (world +X), aligned with the exterior door', Math.abs(door.x - (gx + 5.07)) < 1e-6 && Math.abs(door.z - (45 - 2.2)) < 1e-6, `door (${door.x.toFixed(2)}, ${door.z.toFixed(2)}), road centre x ${track.centerX(45).toFixed(2)}`);
  check('road is on the door side', track.centerX(45) > door.x);
}

// ── h) end to end on the real GameSim ───────────────────────────────────────
hr('h) real GameSim: garage → countdown → drive (two players · solo · skip)');
{
  const NO = { throttle: 0, steer: 0, handbrake: false, horn: false, smoke: false, oil: false, nitro: false, reset: false };
  function play(solo, { maxT = 120 } = {}) {
    const sim = new GameSim(data, { seed: 1337, solo });
    const ok0 = sim.phase === 'garage' && sim.garage instanceof GarageTutorial;
    const rook = new Bot(sim.garage, 'rook'), doc = solo ? null : new Bot(sim.garage, 'doc');
    const rv0 = { x: sim.rv.x, z: sim.rv.z };
    let t = 0, n = 0, rvMoved = 0, tutEvents = [], tCount = null, tDrive = null, snapsOk = true;
    while (t < maxT && sim.phase !== 'drive') {
      const snap = sim.snapshot();
      for (const e of snap.events || []) if (e.type === EV.TUTORIAL) tutEvents.push(e.done);
      const G = snap.garage;
      if (sim.phase === 'garage' && !G) snapsOk = false;
      let input = { ...NO, throttle: 1 };              // throttle must be ignored in the garage
      if (G && sim.phase === 'garage') {
        const r = rook.tick(G);
        input = { ...input, moveX: r.mx, moveZ: r.mz, run: r.run, interact: r.act, interactHeld: r.held };
        if (doc) {
          const d = doc.tick(G);
          if (n % 4 === 0) sim.applyCookCommand({ type: CMD.AVATAR_MOVE, mx: d.mx, mz: d.mz, run: d.run });   // ~15 Hz
          if (d.act) sim.applyCookCommand({ type: CMD.AVATAR_ACT });
        }
      }
      sim.step(input, DT);
      if (sim.phase === 'garage') rvMoved = Math.max(rvMoved, Math.hypot(sim.rv.x - rv0.x, sim.rv.z - rv0.z));
      if (sim.phase === 'countdown' && tCount == null) tCount = t;
      t += DT; n++;
    }
    if (sim.phase === 'drive') tDrive = t;
    return { sim, ok0, t, tCount, tDrive, rvMoved, tutEvents, snapsOk, rv0 };
  }
  for (const solo of [false, true]) {
    const r = play(solo);
    const tag = solo ? 'solo' : 'two players';
    check(`${tag}: GameSim starts in 'garage' with GarageTutorial`, r.ok0);
    check(`${tag}: snapshot.garage present all through the garage phase`, r.snapsOk);
    check(`${tag}: tutorial → countdown → drive`, r.tCount != null && r.tDrive != null && r.tDrive - r.tCount > 1.2 && r.tDrive - r.tCount < 1.8, `countdown at ${r.tCount?.toFixed(1)} s, drive at ${r.tDrive?.toFixed(1)} s`);
    check(`${tag}: all 6 steps reported by EV.TUTORIAL in order`, r.tutEvents.join(',').replace('door,load', 'load,door') === 'markers,grab,load,door,board,crank', r.tutEvents.join(' → '));
    check(`${tag}: RV static at rvPark during the tutorial`, r.rvMoved < 0.01 && Math.hypot(r.rv0.x - r.sim.garage.rvPark.x, r.rv0.z - r.sim.garage.rvPark.z) < 0.05, `moved ${r.rvMoved.toFixed(3)} m`);
  }
  // cook commands for the wrong avatar in solo are ignored (the AI owns Doc)
  {
    const sim = new GameSim(data, { seed: 1337, solo: true });
    const d0 = { ...sim.garage.D };
    sim.applyCookCommand({ type: CMD.AVATAR_MOVE, mx: 1, mz: 0, run: true });
    check('solo: cook avatar commands are ignored (AI Doc)', sim.garage.docIn.t < 0 && sim.garage.D.x === d0.x);
  }
  // skip
  {
    const sim = new GameSim(data, { seed: 1337, solo: false });
    for (let i = 0; i < 30; i++) sim.step({ ...NO, moveX: 1, moveZ: 0 }, DT);
    const ok = sim.applyDriverCommand({ type: DCMD.SKIP_TUTORIAL });
    const snap = sim.snapshot();
    check('DCMD.skipTutorial → countdown at once, final items', ok !== false && sim.phase === 'countdown' && snap.garage && snap.garage.skipped && snap.garage.items.engine === 'on' && snap.garage.items.door === 1, `phase=${sim.phase}`);
    let k = 0; while (sim.phase !== 'drive' && k < 200) { sim.step(NO, DT); k++; }
    check('… then drive after the countdown', sim.phase === 'drive', `${(k * DT).toFixed(2)} s`);
  }
  // netSnapshot carries the garage (rounded) for the cook
  {
    const sim = new GameSim(data, { seed: 1337, solo: false });
    sim.step(NO, DT);
    const ns = sim.netSnapshot();
    check('netSnapshot includes garage (rounded, JSON-safe)', ns.garage && typeof ns.garage.prompt.doc === 'string' && JSON.stringify(ns.garage).length < 3000, `${JSON.stringify(ns.garage).length} bytes`);
  }
}

console.log(`\n${fails ? `${fails} FAILED` : 'ALL PASS'}`);
process.exit(fails ? 1 : 0);
