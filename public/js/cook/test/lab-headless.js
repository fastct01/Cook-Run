// Headless logic test for CookLab + every minigame (no DOM).  Run: node public/js/cook/test/lab-headless.js
import { loadDataNode } from '../../data/loadData.js';
import { CookLab, LAB_STATES } from '../CookLab.js';
import { CMD, EV } from '../../shared/protocol.js';

const data = await loadDataNode();
const sent = [];
let pendingEvents = [];
const lab = new CookLab(data, { sendCommand: (c) => { sent.push(c); if (c.type === CMD.START_RECIPE) pendingEvents.push({ type: EV.RECIPE_OK, reqId: c.reqId, recipeId: c.recipeId }); } });
const mat = { salts: 3, solvent: 3, fuel: 3, ice: 3, catalyst: 2, scrap: 3, syrup: 2 };
let t = 0;
let latAcc = 0, bump = 0;
function snap() {
  const s = { t, phase: 'drive', inv: { mat, units: 0, quality: 0, gadgets: { smoke: 0, oil: 0, nitro: 0 } }, feel: { latAcc, bump, speed: 20 }, alert: { copClose: false, copDist: 200 }, crew: { driver: 100, cook: 100 }, events: pendingEvents };
  pendingEvents = [];
  return s;
}
const dt = 1 / 60;
function tick(n = 1, fn) { for (let i = 0; i < n; i++) { t += dt; if (i % 4 === 0) lab.applySnapshot(snap()); fn?.(lab.current, i); lab.update(dt); } }
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; };

// player bots per step type (operate the minigame through its pointer API)
function play(g, i) {
  if (!g) return;
  const tt = i * dt;
  switch (g.type) {
    case 'grind': case 'stir': {
      const cx = g.type === 'grind' ? 0.5 : 0.42, cy = g.type === 'grind' ? 0.58 : 0.56;
      const rps = g.type === 'stir' ? g.target : 1.5;
      const a = tt * Math.PI * 2 * rps;
      const x = cx + Math.cos(a) * 0.12, y = cy + Math.sin(a) * 0.05;
      if (!g.pointer.down) g.pointerDown(x, y); else g.pointerMove(x, y);
      break;
    }
    case 'measure': {
      const mid = (g.min + g.max) / 2;
      if (!g.poured && !g.pointer.down) g.pointerDown(0.5, 0.5);
      if (g.pointer.down && g.level >= mid - g.rate / 60 * 2) g.pointerUp(0.5, 0.5);
      break;
    }
    case 'heat': {
      const mid = (g.bandMin + g.bandMax) / 2;
      // simple controller: aim the dial at the equilibrium of the band centre with P-term
      const base = 0.55;
      g.setDial(Math.max(0, Math.min(1, base + (g.temp < g.bandMin ? 0.35 : 0) + (mid - g.temp) * 0.006)));
      break;
    }
    case 'cool': {
      // counter the disturbance
      const want = -g.d;
      const nx = 0.5 + want / 2.4;
      if (!g.pointer.down) g.pointerDown(nx, 0.6); else g.pointerMove(nx, 0.6);
      break;
    }
    case 'break': {
      if (i % 10 === 0) { const k = g.shards.findIndex((s) => s.state === 'on'); if (k >= 0) g.snap(k); }
      break;
    }
    case 'hammer': {
      if (i % 6 === 0) { const tg = g.targets()[0]; if (tg) { g.pointerDown(tg.x, tg.y); g.pointerUp(tg.x, tg.y); } }
      break;
    }
  }
}

function runRecipe(id, maxSec = 120) {
  sent.length = 0;
  const r = lab.requestRecipe(id);
  ok(r.ok, `requestRecipe(${id}) accepted`);
  ok(sent[0]?.type === CMD.START_RECIPE && sent[0].reqId === r.reqId, 'START_RECIPE sent with reqId');
  const types = new Set();
  for (let i = 0; i < maxSec * 60; i++) {
    if (lab.current) types.add(lab.current.type);
    tick(1, () => play(lab.current, i));
    if (lab.state === LAB_STATES.DONE || lab.state === LAB_STATES.FAILED) break;
  }
  const done = sent.find((c) => c.type === CMD.RECIPE_DONE);
  ok(lab.state === LAB_STATES.DONE && done && done.reqId === r.reqId, `${id}: RECIPE_DONE quality=${done?.quality} steps=${[...types].join(',')} scores=${lab.stepScores.map((s) => s.score.toFixed(2)).join(',')}`);
  tick(60 * 6);
  ok(lab.state === LAB_STATES.IDLE, `${id}: back to idle`);
  return done;
}

// lab state shape
const ls = lab.getLabState();
ok(['cooking', 'recipeId', 'step', 'stepType', 'temp', 'fumes', 'fire', 'ventOpen', 'curtains', 'cookHurt'].every((k) => k in ls), 'LabState has all protocol fields');

latAcc = 0; bump = 0;
lab.applySnapshot(snap());
runRecipe('premium');
for (const id of ['street', 'smoke', 'oil', 'nitro', 'patch', 'icepack']) runRecipe(id);

// denial
{
  const save = { ...mat }; mat.syrup = 0; lab.applySnapshot(snap());
  const r = lab.requestRecipe('premium');
  ok(!r.ok && /Missing/.test(r.reason), `premium blocked when missing syrup (${r.reason})`);
  Object.assign(mat, save); lab.applySnapshot(snap());
}
// host denial
{
  sent.length = 0;
  const orig = lab._send;
  lab._send = (c) => { sent.push(c); if (c.type === CMD.START_RECIPE) pendingEvents.push({ type: EV.RECIPE_DENIED, reqId: c.reqId, recipeId: c.recipeId, reason: 'no salts' }); };
  lab.requestRecipe('street'); tick(10);
  ok(lab.state === LAB_STATES.IDLE, 'RECIPE_DENIED → idle');
  // timeout
  lab._send = (c) => sent.push(c);
  lab.requestRecipe('street'); tick(60 * 5.2);
  ok(lab.state === LAB_STATES.IDLE && /No answer/.test(lab.message.text), 'request times out after 5 s');
  lab._send = orig;
}
// fire + extinguish
{
  sent.length = 0;
  lab.startFire(0.3);
  ok(lab.fire > 0, 'fire started');
  const f0 = lab.fire; lab.extinguish(); ok(Math.abs(f0 - lab.fire - 0.18) < 1e-6, 'beat −0.18');
  lab.useExtinguisher(); ok(lab.fire === 0 && lab.extinguisher === 2, 'extinguisher puts it out, 2 charges left');
  lab.startFire(0.5); tick(60 * 8);
  ok(sent.some((c) => c.type === CMD.EXPLOSION && c.power === 1) && lab.fire === 0, 'unattended fire explodes → EXPLOSION, fire reset');
}
// explosion fails a batch
{
  sent.length = 0;
  lab.requestRecipe('street'); tick(10);
  ok(lab.state === LAB_STATES.RUNNING, 'street running');
  lab.startFire(0.9); tick(60 * 2);
  ok(sent.some((c) => c.type === CMD.RECIPE_FAIL && c.reason === 'explosion'), 'explosion → RECIPE_FAIL');
  tick(60 * 6);
}
// abort
{
  sent.length = 0;
  lab.requestRecipe('smoke'); tick(10);
  lab.abortBatch();
  ok(sent.some((c) => c.type === CMD.RECIPE_FAIL && c.reason === 'aborted') && lab.state === LAB_STATES.FAILED, 'abort → RECIPE_FAIL aborted');
  tick(60 * 6);
}
// fumes / vent
{
  lab.fumes = 0.5; lab.toggleVent(true); tick(60);
  ok(lab.fumes < 0.4, `vent open clears fumes (${lab.fumes.toFixed(2)})`);
  lab.toggleVent(false);
}
// cook down
{
  const s = snap(); s.crew = { driver: 100, cook: 0 }; lab.applySnapshot(s);
  ok(lab.cookDown && lab.pointerDown(0.5, 0.5) === false, 'cook down disables input');
  tick(60 * 12.5, null);
  ok(!lab.cookDown, 'cook auto-recovers after 12 s');
}
// spill in measure
{
  sent.length = 0;
  lab.requestRecipe('smoke'); tick(10);
  const g = lab.current; g.pointerDown(0.5, 0.5);
  tick(60 * 5);
  ok(lab.stepScores[0]?.score === 0.2, `overfill → measure score 0.2 (${lab.stepScores[0]?.score})`);
  lab.abortBatch(); tick(60 * 6);
}
// callout
{ sent.length = 0; lab._calloutCd = 0; lab.callout('Slow down!'); ok(sent[0]?.type === CMD.CALLOUT && sent[0].text === 'Slow down!', 'CALLOUT sent'); }
// bumpy premium still completes
latAcc = 3; bump = 0;
{
  let i = 0;
  const orig = tick;
  sent.length = 0;
  lab.requestRecipe('premium');
  for (; i < 120 * 60; i++) {
    latAcc = Math.sin(i / 60 * 0.8) * 4;
    bump = (i % 300) < 6 ? 0.7 : 0;
    tick(1, () => play(lab.current, i));
    if (lab.state !== LAB_STATES.RUNNING && lab.state !== LAB_STATES.REQUESTING) break;
  }
  const d = sent.find((c) => c.type === CMD.RECIPE_DONE || c.type === CMD.RECIPE_FAIL);
  ok(!!d, `bumpy premium resolved: ${d?.type} q=${d?.quality} reason=${d?.reason} scores=${lab.stepScores.map((s) => s.score.toFixed(2)).join(',')}`);
  void orig;
}

// ── station presence (3D van lab; VAN_CONTRACT "CookLab extension") ──────────
{
  latAcc = 0; bump = 0;
  tick(60 * 6);                       // let the last result card clear
  ok(lab.state === LAB_STATES.IDLE, 'presence: lab idle before the presence tests');
  const { STEP_STATION, stationForStep } = await import('../stations.js');
  ok(lab.presenceMode === 'any' && lab.awayFromStation === false, 'presence: default mode is "any", never away');
  const want = { grind: 'grind', measure: 'measure', heat: 'stove', stir: 'stove', cool: 'cool', break: 'break', hammer: 'hammer' };
  ok(Object.entries(want).every(([k, v]) => STEP_STATION[k] === v && stationForStep(k) === v && lab.stationForStep(k) === v) && lab.stationForStep('nope') === null,
    'presence: stationForStep maps every step type (heat/stir → stove)');

  // 'any' mode: input reaches the minigame without any presence
  sent.length = 0;
  lab.requestRecipe('icepack'); tick(10);
  ok(lab.state === LAB_STATES.RUNNING && lab.current?.type === 'grind' && lab.inputEnabled, 'presence: "any" mode → input enabled with no presence');
  lab.abortBatch(); tick(60 * 6);

  // 'station' mode
  lab.setPresenceMode('station');
  ok(lab.presenceMode === 'station', 'presence: setPresenceMode("station")');
  sent.length = 0;
  lab.setPresence(null);
  lab.requestRecipe('premium'); tick(10);
  let g = lab.current;
  ok(g?.type === 'grind' && lab.stepStation === 'grind', `presence: premium starts at the grind station (stepStation=${lab.stepStation})`);
  ok(lab.awayFromStation && !lab.inputEnabled && lab.pointerDown(0.62, 0.58) === false, 'presence: away → awayFromStation, input blocked, pointerDown refused');
  // try to grind through the lab API while away: nothing happens, the step is frozen
  const t0 = g.t;
  for (let i = 0; i < 120; i++) { const a = i * 0.25; lab.pointerMove(0.5 + Math.cos(a) * 0.12, 0.58 + Math.sin(a) * 0.05); tick(1); }
  ok(g.turnsDone === 0 && g.progress === 0 && g.t === t0, `presence: away from the grinder → paused, no progress (turns=${g.turnsDone.toFixed(2)}, t=${g.t})`);
  lab.setPresence('measure');
  ok(lab.awayFromStation, 'presence: at the wrong station still counts as away');
  lab.setPresence('grind');
  ok(!lab.awayFromStation && lab.inputEnabled, 'presence: at the grind station → input enabled');
  // play the grind through the lab API (gated path)
  lab.pointerDown(0.62, 0.58);
  for (let i = 0; i < 60 * 20 && lab.current === g && !g.done; i++) { const a = i * 0.2; lab.pointerMove(0.5 + Math.cos(a) * 0.12, 0.58 + Math.sin(a) * 0.05); tick(1); }
  lab.pointerUp(0.5, 0.5);
  ok(g.done && g.score > 0.6, `presence: grind completed at its station via lab.pointer* (score ${g.score.toFixed(2)})`);
  tick(80); // step pause → measure
  g = lab.current;
  ok(g?.type === 'measure' && lab.awayFromStation && lab.stepStation === 'measure', 'presence: next step (measure) → away until Doc walks over');
  // leaving mid-pour releases the hold
  lab.setPresence('measure');
  lab.pointerDown(0.5, 0.5); tick(20);
  const lvl = g.level;
  ok(g.pouring && lvl > 0, `presence: pouring at the measuring bench (level ${lvl.toFixed(3)})`);
  lab.setPresence(null);
  ok(!g.pouring && !g.pointer.down, 'presence: walking away releases the pour');
  tick(120);
  ok(g.level === lvl && !g.done, 'presence: measure frozen while away (no settle, no judge)');
  lab.setPresence('measure');
  lab.pointerDown(0.5, 0.5);
  for (let i = 0; i < 600 && g.level < (g.min + g.max) / 2 - 0.006; i++) tick(1);
  lab.pointerUp(0.5, 0.5); tick(60);
  ok(g.done && g.result === 'good', `presence: measure judged after returning (level ${g.level.toFixed(3)}, ${g.result})`);
  tick(80); // → heat
  g = lab.current;
  ok(g?.type === 'heat' && lab.stepStation === 'stove', 'presence: heat step at the stove');
  lab.setPresence('stove');
  g.setDial(1); // crank it and walk off
  lab.setPresence(null);
  ok(lab.awayFromStation && !lab.inputEnabled, 'presence: away from the stove');
  const temp0 = g.temp, ht0 = g.t;
  let fireSeen = false;
  for (let i = 0; i < 60 * 25 && !fireSeen; i++) { tick(1); if (lab.fire > 0) fireSeen = true; }
  ok(g.t > ht0 && g.temp > temp0 + 60, `presence: burner keeps heating while away (${temp0.toFixed(0)}° → ${g.temp.toFixed(0)}°)`);
  ok(fireSeen && lab.temp === g.temp, `presence: unattended burner starts a fire (fire=${lab.fire.toFixed(2)})`);
  ok(lab.key('Minus') === false, 'presence: keys blocked while away');
  lab.useExtinguisher(); lab.extinguish(); lab.extinguish();
  lab.abortBatch(); tick(60 * 6);
  ok(lab.state === LAB_STATES.IDLE && lab.awayFromStation === false, 'presence: not cooking → never away');
  // fire beating by focus coords is a 2D-only shortcut
  lab.requestRecipe('patch'); tick(10);
  lab.setPresence('hammer');
  lab.startFire(0.3);
  const f1 = lab.fire;
  const r = lab.pointerDown(0.34, 0.72);
  ok(r === true && lab.fire === f1, 'presence: in "station" mode a click on the 2D fire area does not beat the fire');
  lab.useExtinguisher(); lab.extinguish();
  lab.abortBatch(); tick(60 * 6);
  lab.setPresenceMode('any');
  lab.setPresence(null);
  ok(lab.presenceMode === 'any', 'presence: back to "any"');
  lab.startFire(0.3);
  const f2 = lab.fire;
  lab.requestRecipe('patch'); tick(10);
  ok(lab.pointerDown(0.34, 0.72) === 'fire' && lab.fire < f2, 'presence: "any" mode keeps the 2D click-to-beat');
  lab.useExtinguisher(); lab.extinguish(); lab.extinguish();
  lab.abortBatch(); tick(60 * 6);
}

// ── difficulty levers (Round 3: rules.cook via shared/difficulty.js withDifficulty) ──────────
{
  const { withDifficulty } = await import('../../shared/difficulty.js');
  const { createMinigame } = await import('../minigames/index.js');
  const { mulberry32 } = await import('../../sim/rng.js');
  const labs = Object.fromEntries(['easy', 'hard', 'extreme'].map((l) => [l, new CookLab(withDifficulty(data, l), { sendCommand: () => {} })]));
  const L = (l) => labs[l].levers;
  ok(L('hard').zoneScale === 1 && L('hard').hurtMult === 1 && L('hard').spillMult === 1 && L('hard').burnerFireMult === 1, 'levers: Hard = 1 everywhere');
  ok(L('easy').zoneScale === 1.3 && L('extreme').zoneScale === 0.7 && L('easy').hurtMult === 0.6 && L('extreme').spillMult === 1.8 && L('extreme').burnerFireMult === 1.5, 'levers: Easy / Extreme values from rules.cook');
  ok(new CookLab({ lab: data.lab, route: data.route, rules: {} }, {}).levers.zoneScale === 1, 'levers: raw rules without a cook block → Hard defaults');
  const mg = (l, step) => createMinigame(step, { hazards: data.lab.hazards, rand: mulberry32(7), levers: L(l), toast() {}, emit() {}, startFire() {} });
  const w = (l) => { const m = mg(l, { type: 'measure', targetMin: 0.6, targetMax: 0.75 }); const h = mg(l, { type: 'heat', bandMin: 180, bandMax: 220, fireAt: 260 });
    const st = mg(l, { type: 'stir', targetRps: 1 }); const c = mg(l, { type: 'cool' }); return { m: m.max - m.min, h: h.bandMax - h.bandMin, mid: (h.bandMin + h.bandMax) / 2, s: st.tol, c: c.centre }; };
  const we = w('easy'), wh = w('hard'), wx = w('extreme');
  ok(Math.abs(wh.m - 0.15) < 1e-9 && wh.h === 40 && Math.abs(wh.s - 0.35) < 1e-9 && Math.abs(wh.c - 0.22) < 1e-9, 'zoneScale: Hard zones unchanged (measure 0.15, heat 40°, stir ±35%, cool 0.22)');
  ok(we.m > wh.m && wh.m > wx.m && we.h > wh.h && wh.h > wx.h && we.s > wh.s && wh.s > wx.s && we.c > wh.c && wh.c > wx.c && we.mid === 200 && wx.mid === 200,
    `zoneScale: Easy wider, Extreme narrower, same centre (measure ${we.m.toFixed(3)}/${wh.m.toFixed(3)}/${wx.m.toFixed(3)}, heat ${we.h}/${wh.h}/${wx.h}°)`);
  // hurtMult: 1 s of choking fumes
  const hurt = (l) => { const lb = labs[l]; lb.getLabState(); lb.fumes = 0.95; lb.ventOpen = false; for (let i = 0; i < 60; i++) { lb.fumes = 0.95; lb.update(1 / 60); } return lb.getLabState().cookHurt; };
  const he = hurt('easy'), hh = hurt('hard'), hx = hurt('extreme');
  ok(hh > 0 && Math.abs(he / hh - 0.6) < 0.05 && Math.abs(hx / hh - 1.5) < 0.05, `hurtMult: fume damage per s Easy ${he} · Hard ${hh} · Extreme ${hx}`);
  // spillMult: the same bump (0.7) on the mortar
  const spill = (l) => { const lb = labs[l]; const g = mg(l, { type: 'grind', turns: 6 }); const sm = lb.levers.spillMult;
    g.update(1 / 60, { latAcc: 0, bump: 0.7, bumpHit: Math.min(1.5, 0.7 * sm) }); return 1 - g.powder; };
  const se = spill('easy'), sh = spill('hard'), sx = spill('extreme');
  ok(se === 0 && sh > 0 && sx > sh, `spillMult: powder lost to one 0.7 bump Easy ${se.toFixed(2)} · Hard ${sh.toFixed(2)} · Extreme ${sx.toFixed(2)}`);
  // spillMult reaches the minigame through CookLab
  {
    const lb = labs.extreme;
    lb.applySnapshot({ phase: 'drive', inv: { mat, units: 0, quality: 0, gadgets: {} }, crew: { driver: 100, cook: 100 }, events: [] });
    let got = null;
    lb.requestRecipe('street'); lb.applySnapshot({ events: [{ type: EV.RECIPE_OK, reqId: lb.reqId, recipeId: 'street' }] });
    const g = lb.current; const orig = g.update.bind(g); g.update = (dt, f) => { got = f.bumpHit; return orig(dt, f); };
    lb._pendingBump = 0.5; lb.update(1 / 60);
    ok(Math.abs(got - 0.9) < 1e-9, `spillMult: CookLab scales feel.bumpHit for the step (0.5 → ${got})`);
    lb.abortBatch(); for (let i = 0; i < 400; i++) lb.update(1 / 60);
  }
  // burnerFireMult: walk away from a burner left at the band (dial for 200°) — how soon does it catch fire?
  const fireAfter = (l) => { let fireT = null; const g = createMinigame({ type: 'heat', bandMin: 180, bandMax: 220, fireAt: 260, duration: 999 },
    { hazards: data.lab.hazards, rand: mulberry32(11), levers: L(l), toast() {}, emit() {}, startFire() { if (fireT == null) fireT = g.t; } });
    g.setDial(0.55); for (let i = 0; i < 60 * 25; i++) g.update(1 / 60, {});   // settle while watched
    g.unwatched = true; const t0 = g.t; for (let i = 0; i < 60 * 90 && fireT == null; i++) g.update(1 / 60, {}); return fireT == null ? null : fireT - t0; };
  const fe = fireAfter('easy'), fh = fireAfter('hard'), fx = fireAfter('extreme');
  ok(fx != null && fx < 60 && (fh == null || fh > fx) && (fe == null || (fh != null && fe > fh)), `burnerFireMult: unwatched burner at the band catches fire after Easy ${fe?.toFixed(1) ?? 'never'} · Hard ${fh?.toFixed(1) ?? 'never'} · Extreme ${fx?.toFixed(1) ?? 'never'} s (90 s max)`);
  // LabState.shop
  const lb = labs.hard;
  ok(lb.getLabState().shop === null, 'shop: LabState.shop is null while Doc is not shopping');
  lb.setShopProgress({ stopId: 'hardware', label: 'Grab the list 2/3', frac: 0.66, tLeft: 21.37 });
  const sh1 = lb.getLabState().shop;
  ok(sh1 && sh1.stopId === 'hardware' && sh1.label === 'Grab the list 2/3' && sh1.frac === 0.66 && sh1.tLeft === 21.4, `shop: setShopProgress → LabState.shop ${JSON.stringify(sh1)}`);
  lb.setShopProgress(null);
  ok(lb.getLabState().shop === null, 'shop: setShopProgress(null) clears it');
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
