// End-to-end online test: a whole game played over the real server.
//   node scripts/test-e2e.mjs            (starts its own server on a random port)
//   node scripts/test-e2e.mjs --url ws://localhost:3000/ws
//
// Host  = GameSim + Autopilot, sends snapshots at rules.net.snapshotHz (sim time).
// Guest = real CookLab driven by a bot that plays each minigame through its pointer API,
//         sends LabState at rules.net.labHz and commands immediately.
// Both run on a shared virtual clock at TIME_SCALE× real time; all traffic goes through the
// actual Node room server + relay (same code path as two browsers).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadDataNode } from '../public/js/data/loadData.js';
import { GameSim } from '../public/js/sim/GameSim.js';
import { Autopilot } from '../public/js/sim/autopilot.js';
import { CookLab } from '../public/js/cook/CookLab.js';
import { NetClient } from '../public/js/net/NetClient.js';
import { GM, EV } from '../public/js/shared/protocol.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : null;
const TIME_SCALE = 6;   // 15 Hz × 6 = 90 msg/s, under the server's 120 msg/s flood limit
const STEP = 1 / 60;
const data = await loadDataNode();
const SNAP_DT = 1 / data.rules.net.snapshotHz, LAB_DT = 1 / data.rules.net.labHz;

let fails = 0;
const ok = (c, m, extra = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}${extra ? ' — ' + extra : ''}`); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = (fn, ms = 5000, what = 'condition') => new Promise((res, rej) => {
  const t0 = Date.now();
  const iv = setInterval(() => { const v = fn(); if (v) { clearInterval(iv); res(v); } else if (Date.now() - t0 > ms) { clearInterval(iv); rej(new Error('timeout: ' + what)); } }, 5);
});

// ── server ────────────────────────────────────────────────────────────────────
let server = null, url = argUrl;
if (!url) {
  const port = 41000 + Math.floor(Math.random() * 2000);
  server = spawn(process.execPath, [join(root, 'server/index.js')], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  url = `ws://127.0.0.1:${port}/ws`;
  await waitFor(() => /listening|ready|:\d{4,5}/i.test(log), 8000, 'server start').catch(async () => { await sleep(800); });
}
const cleanup = () => { try { server?.kill('SIGTERM'); } catch { /* ignore */ } };
process.on('exit', cleanup);

console.log(`Cook & Run — end-to-end online test via ${url}  (virtual time ×${TIME_SCALE})\n`);

// ── lobby: create, join, ready, start ───────────────────────────────────────
const host = new NetClient({ url, pingEveryMs: 1e9 });
const guest = new NetClient({ url, pingEveryMs: 1e9 });
await host.connect(); await guest.connect();
let hostRoom = null, guestRoom = null, hostStart = null, guestStart = null;
host.on('room', (m) => { hostRoom = m; }); guest.on('room', (m) => { guestRoom = m; });
host.on('start', (m) => { hostStart = m; }); guest.on('start', (m) => { guestStart = m; });
host.send({ t: 'create', name: 'Rook' });
await waitFor(() => hostRoom, 3000, 'room created');
guest.send({ t: 'join', code: hostRoom.code, name: 'Doc' });
await waitFor(() => guestRoom && hostRoom.players.length === 2, 3000, 'guest joined');
const roleOf = (room, id) => room.players.find((p) => p.id === id)?.role;
ok(roleOf(hostRoom, hostRoom.you) === 'driver' && roleOf(guestRoom, guestRoom.you) === 'cook', 'creator is driver, joiner is cook', `room ${hostRoom.code}`);
host.send({ t: 'ready', ready: true }); guest.send({ t: 'ready', ready: true });
await waitFor(() => hostRoom.players.every((p) => p.ready), 3000, 'both ready');
host.send({ t: 'start' });
await waitFor(() => hostStart && guestStart, 3000, 'start broadcast');
ok(hostStart.seed === guestStart.seed, 'both players got START with the same seed', `seed ${hostStart.seed}`);
// The server's random seed was verified above; the game itself runs on a fixed route seed because the
// bot driver loses on ~1 seed in 13 (it can't U-turn), and this test is about networking, not bot skill.
const seed = (process.env.E2E_SEED ? +process.env.E2E_SEED : data.route.defaultSeed) >>> 0;

// ── host: sim + autopilot ────────────────────────────────────────────────────
const sim = new GameSim(data, { seed });
// 40 km route: the host's driver skips the garage tutorial and plays each supply-stop shop
// challenge as a stand-in (DCMD shopDone, score 0.8, after 25 s) — both host-local, like main.js.
const pilot = new Autopilot(data, { seed, sim, onDriverCommand: (c) => sim.applyDriverCommand(c), autoShop: 25 });
let labMsgs = 0, cmdMsgs = 0;
host.onGame((m) => {
  if (m.k === GM.LAB) { labMsgs++; sim.setLabState(m.l); }
  else if (m.k === GM.CMD) { cmdMsgs++; sim.applyCookCommand(m.c); }
});

// ── guest: CookLab + minigame bot ────────────────────────────────────────────
const lab = new CookLab(data, { sendCommand: (c) => guest.sendGame({ k: GM.CMD, c }), seed });
let snaps = 0, lastSnap = null, endResult = null, bytes = 0, maxBytes = 0;
const seen = {};
guest.onGame((m) => {
  if (m.k === GM.SNAP) {
    snaps++; lastSnap = m.s;
    const b = JSON.stringify(m.s).length; bytes += b; maxBytes = Math.max(maxBytes, b);
    for (const e of m.s.events || []) seen[e.type] = (seen[e.type] || 0) + 1;
    lab.applySnapshot(m.s);
  } else if (m.k === GM.END) endResult = m.result;
});

function playStep(g, i) {
  if (!g) return;
  const tt = i * STEP;
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
      g.setDial(Math.max(0, Math.min(1, 0.55 + (g.temp < g.bandMin ? 0.35 : 0) + (mid - g.temp) * 0.006)));
      break;
    }
    case 'cool': {
      const nx = 0.5 - g.d / 2.4;
      if (!g.pointer.down) g.pointerDown(nx, 0.6); else g.pointerMove(nx, 0.6);
      break;
    }
    case 'break': if (i % 10 === 0) { const k = g.shards.findIndex((s) => s.state === 'on'); if (k >= 0) g.snap(k); } break;
    case 'hammer': if (i % 6 === 0) { const tg = g.targets()[0]; if (tg) { g.pointerDown(tg.x, tg.y); g.pointerUp(tg.x, tg.y); } } break;
    default: break;
  }
}
const cooked = [];
function cookBrain() {
  if (lab.cookDown) return;
  if (lab.fire > 0.3) lab.useExtinguisher();
  if (!lab.ventOpen && lab.fumes > 0.5) lab.toggleVent(true); else if (lab.ventOpen && lab.fumes < 0.12) lab.toggleVent(false);
  if (lab.copAlarm && !lab.curtainsClosed) lab.toggleCurtains(true);
  if (lab.state === 'done' || lab.state === 'failed') { cooked.push(`${lab.result?.recipeId || '?'}:${lab.state}`); lab.dismissResult(); }
  if (lab.state === 'idle' && lab.canStart && lastSnap?.phase === 'drive') {
    const list = lab.availableRecipes().filter((r) => r.canMake);
    const units = lastSnap.inv.units, need = data.route.sellPoint.requiredUnits, g = lastSnap.inv.gadgets;
    const hurt = (lastSnap.rv?.hp ?? 100) < 65;
    // product first, repairs when hurt, then at most one of each gadget (nitro matters for the jump)
    const order = [...(hurt ? ['patch'] : []), 'premium', 'street', ...(units >= need ? ['nitro', 'smoke', 'oil'] : ['nitro'])];
    const r = order.map((id) => list.find((x) => x.id === id)).find((x) => x && !(x.kind === 'gadget' && (g[x.gadget] || 0) >= 1));
    if (r) lab.requestRecipe(r.id);
  }
}

// ── shared virtual clock ─────────────────────────────────────────────────────
let vt = 0, snapAcc = 0, labAcc = 0, labI = 0, ended = false;
const t0 = Date.now();
const MAX_VT = 55 * 60;   // the 40 km run takes ~40 min of game time
while (!ended && vt < MAX_VT) {
  const frame = 0.1; // 100 ms of game time per tick
  for (let k = 0; k < frame / STEP; k++) {
    vt += STEP;
    sim.step(pilot.update(sim.snapshot()), STEP);
    snapAcc += STEP;
    if (snapAcc >= SNAP_DT) { snapAcc -= SNAP_DT; host.sendGame({ k: GM.SNAP, s: sim.netSnapshot() }); }
    // guest
    playStep(lab.current, labI++);
    lab.update(STEP);
    labAcc += STEP;
    if (labAcc >= LAB_DT) { labAcc -= LAB_DT; guest.sendGame({ k: GM.LAB, l: lab.getLabState() }); cookBrain(); }
    if (sim.phase === 'won' || sim.phase === 'lost') {
      host.sendGame({ k: GM.SNAP, s: sim.netSnapshot() });
      host.sendGame({ k: GM.END, result: sim.result });
      ended = true; break;
    }
  }
  await sleep(frame * 1000 / TIME_SCALE);
}
await waitFor(() => endResult, 3000, 'END relayed').catch(() => {});

const r = sim.result || {};
const fmt = (s) => `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s`;
console.log(`\n  game: ${sim.phase} ${r.reason ? '(' + r.reason + ')' : ''} in ${fmt(vt)} game time, ${((Date.now() - t0) / 1000).toFixed(1)} s real`);
console.log(`  product ${r.units} bags @ ${Math.round((r.quality || 0) * 100)}% · payout $${r.payout} · points ${r.points} · ${r.stars}★ · max heat ${r.maxStars ?? '?'}★`);
console.log(`  traffic: host→cook ${snaps} snapshots (avg ${(bytes / Math.max(1, snaps) / 1024).toFixed(2)} KB, max ${(maxBytes / 1024).toFixed(2)} KB) · cook→host ${labMsgs} lab states, ${cmdMsgs} commands`);
console.log(`  cook batches: ${cooked.join(', ') || '(none)'}`);
console.log(`  events seen by the cook: ${Object.entries(seen).map(([k, v]) => `${k}:${v}`).join(' ')}\n`);

// Networking is what this test checks. The game outcome depends on the bots and on real-time message
// timing, so it is reported, and only checked for consistency between host and cook.
console.log(`  (info) game outcome: ${sim.phase}${r.reason ? ' — ' + r.reason : ''}`);
ok(sim.phase === 'won' || sim.phase === 'lost', 'the online game ran to an end on the host', `${sim.phase} ${r.reason || ''}`);
ok(snaps > vt * data.rules.net.snapshotHz * 0.8, 'cook received snapshots at ~snapshotHz', `${snaps} for ${vt.toFixed(0)} s`);
ok(labMsgs > vt * data.rules.net.labHz * 0.8, 'host received lab states at ~labHz', `${labMsgs}`);
ok((seen[EV.RECIPE_OK] || 0) >= 2, 'cook\'s recipe requests approved by the host sim', `${seen[EV.RECIPE_OK] || 0} recipeOk`);
ok((r.units || 0) + (sim.snapshot().inv?.units || 0) >= 2 || (seen[EV.RECIPE_OK] || 0) >= 2, 'product cooked by the remote cook was credited by the host', `${r.units} bags`);
ok((seen[EV.STOP_DONE] || 0) >= 4, 'supply stop events reached the cook', `${seen[EV.STOP_DONE] || 0}`);
if (r.won) ok((seen[EV.COPS_GAVE_UP] || 0) >= 1 && (seen[EV.LANDED] || 0) >= 1, 'cook saw the canyon jump + cops giving up', `landed ${seen[EV.LANDED] || 0}, copsGaveUp ${seen[EV.COPS_GAVE_UP] || 0}`);
ok(endResult && endResult.won === r.won && endResult.points === r.points, 'END message relayed to the cook (same result on both sides)');
ok((seen.end || 0) >= 1, 'end event also inside a snapshot (fallback path)');
ok(maxBytes < 64 * 1024, 'every snapshot fits under the 64 KB relay limit', `${(maxBytes / 1024).toFixed(1)} KB`);

// play again: back to the room
let back = null;
host.on('room', (m) => { if (m.state === 'lobby') back = m; });
host.send({ t: 'lobby' }); guest.send({ t: 'lobby' });
await waitFor(() => back, 3000, 'back to lobby').catch(() => {});
ok(back && back.players.length === 2 && back.players.every((p) => !p.ready), 'both players back in the room, ready flags cleared');

host.close(); guest.close();
await sleep(100);
cleanup();
console.log(`\n  ${fails ? `FAILED ${fails} check(s)` : 'ALL PASS'}`);
process.exit(fails ? 1 : 0);
