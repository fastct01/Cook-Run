#!/usr/bin/env node
// Network tests for Cook & Run.
//
//   node scripts/test-net.mjs            protocol + relay + HTTP tests (needs only node + ws)
//   node scripts/test-net.mjs --browser  also runs the headless Chromium lobby check (Python Playwright)
//                                        and saves screenshots to docs/lobby-*.png
//
// Starts server/index.js as a child process on a random free port, drives it with
// raw `ws` clients and with the real browser-side NetClient/LocalBus modules
// (Node 22 has a global WebSocket), prints PASS/FAIL per check, exits 1 on failure.

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import WebSocket from 'ws';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WANT_BROWSER = process.argv.includes('--browser');
const VERBOSE = process.argv.includes('--verbose');

let passed = 0;
let failed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `  -- ${detail}` : ''}`); }
  return ok;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── server process ──────────────────────────────────────────────────────────
async function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

let child = null;
const serverLog = [];
async function startServer(port) {
  child = spawn(process.execPath, [join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => { const s = d.toString(); serverLog.push(s); if (VERBOSE) process.stdout.write(`    [server] ${s}`); });
  child.stderr.on('data', (d) => { const s = d.toString(); serverLog.push(s); process.stdout.write(`    [server:err] ${s}`); });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await sleep(100);
  }
  throw new Error('server did not start within 8 s');
}

async function stopServer() {
  if (!child || child.exitCode !== null) return null;
  const exited = new Promise((r) => child.once('exit', (code, sig) => r({ code, sig })));
  child.kill('SIGTERM');
  const res = await Promise.race([exited, sleep(6000).then(() => null)]);
  if (!res) child.kill('SIGKILL');
  return res;
}

// ── raw ws test client ──────────────────────────────────────────────────────
class TC {
  constructor(url, label) {
    this.label = label;
    this.ws = new WebSocket(url);
    this.inbox = [];
    this.waiters = [];
    this.closed = false;
    this.ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      for (let i = 0; i < this.waiters.length; i++) {
        const w = this.waiters[i];
        if (w.pred(msg)) { this.waiters.splice(i, 1); clearTimeout(w.timer); w.resolve(msg); return; }
      }
      this.inbox.push(msg);
    });
    this.ws.on('close', () => { this.closed = true; });
  }
  open() { return new Promise((res, rej) => { this.ws.once('open', res); this.ws.once('error', rej); }); }
  send(obj) { this.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); }
  // Wait for (and consume) the first message matching pred; checks already-buffered messages first.
  wait(pred, ms = 2000, what = 'message') {
    if (typeof pred === 'string') { const t = pred; pred = (m) => m.t === t; what = t; }
    const i = this.inbox.findIndex(pred);
    if (i >= 0) return Promise.resolve(this.inbox.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const w = { pred, resolve, timer: setTimeout(() => { this.waiters.splice(this.waiters.indexOf(w), 1); reject(new Error(`${this.label}: timeout waiting for ${what}`)); }, ms) };
      this.waiters.push(w);
    });
  }
  async none(pred, ms = 250) {
    await sleep(ms);
    return !this.inbox.some(pred);
  }
  drain() { const a = this.inbox; this.inbox = []; return a; }
  close() { try { this.ws.close(); } catch { /* ignore */ } }
}

const tryWait = async (p) => { try { return await p; } catch (e) { return { __err: e.message }; } };

// Snapshot-sized payload (~10 KB) shaped like protocol.js Snapshot.
function fakeSnapshot(n = 1) {
  const ents = [];
  for (let i = 0; i < 90; i++) ents.push([i + 1, i % 33, +(Math.sin(i) * 9).toFixed(2), 0, +(1200 + i * 3.7).toFixed(2), +(i * 0.13).toFixed(2), i % 6, i % 5]);
  return {
    t: 123.45 + n, phase: 'drive', countdown: 0, lostReason: null,
    rv: { x: -1.2, y: 0, z: 1234.56, yaw: 0.01, pitch: 0, roll: 0, speed: 22.3, steer: 0.1, hp: 88, airborne: false, nitro: 0.4, flatTyre: false, onRoad: true },
    crew: { driver: 100, cook: 92 }, heat: { value: 2.3, stars: 2, seen: true, gaveUp: false }, bust: 0,
    score: { points: 1200, chaos: 2, knocked: 1, smashed: 9, copsWrecked: 0 },
    inv: { mat: { salts: 2, solvent: 1, fuel: 1 }, units: 2, quality: 0.8, gadgets: { smoke: 1, oil: 0, nitro: 1 } },
    stop: null, nearStop: { id: 'gas_ice', name: 'Sunny Gas & Ice', dist: 120 },
    bridge: { dist: 5000, speedNeeded: 24.5 }, biome: 'suburbs', dist: 1234.56, routeLength: 7000,
    feel: { latAcc: 1.2, bump: 0.1, speed: 22.3 }, alert: { copClose: true, copDist: 40 },
    lab: { fumes: 0.2, fire: 0, ventOpen: true, curtains: false, cooking: true },
    ents,
    events: [{ type: 'msg', text: 'Sunny Gas & Ice ahead', tone: 'info' }, { type: 'stars', stars: 2 }],
    _pad: 'p'.repeat(6000), // real snapshots run ~3-12 KB; pad to the ~10 KB middle
  };
}

// ── tests ───────────────────────────────────────────────────────────────────
async function protocolTests(base) {
  const WS = `ws://127.0.0.1:${base.port}/ws`;
  console.log('\n[protocol]');

  // HTTP health + caching
  const hz = await fetch(`${base.http}/healthz`);
  const hj = await hz.json();
  check('/healthz → 200 JSON {ok, rooms, players, uptime}', hz.status === 200 && hj.ok === true && typeof hj.rooms === 'number' && typeof hj.players === 'number' && typeof hj.uptime === 'number', JSON.stringify(hj));
  const pj = await fetch(`${base.http}/js/shared/protocol.js`);
  check('static js served with max-age=60', pj.status === 200 && /max-age=60\b/.test(pj.headers.get('cache-control') || '') && /javascript/.test(pj.headers.get('content-type') || ''), `${pj.status} ${pj.headers.get('cache-control')}`);
  const ht = await fetch(`${base.http}/net-test.html`);
  check('html served no-cache', ht.status === 200 && /no-cache/.test(ht.headers.get('cache-control') || ''), `${ht.status} ${ht.headers.get('cache-control')}`);
  const vd = await fetch(`${base.http}/vendor/three/three.module.js`, { method: 'HEAD' });
  check('vendor/ long cache', vd.status === 200 && /max-age=604800/.test(vd.headers.get('cache-control') || ''), `${vd.status} ${vd.headers.get('cache-control')}`);

  // connect
  const A = new TC(WS, 'A'); const B = new TC(WS, 'B');
  await Promise.all([A.open(), B.open()]);
  check('permessage-deflate negotiated', /permessage-deflate/.test(A.ws.extensions || ''), A.ws.extensions);

  // ping/pong
  A.send({ t: 'ping', at: 42.5 });
  const pong = await tryWait(A.wait('pong'));
  check('PING → PONG {at}', pong.at === 42.5, JSON.stringify(pong));

  // create
  A.send({ t: 'create', name: '  <Rook>​ the\tDriver with a very long name ' });
  const roomA = await A.wait('room');
  const code = roomA.code;
  check('CREATE → ROOM with 4-char unambiguous code', /^[BCDFGHJKLMNPQRSTVWXYZ2-9]{4}$/.test(code), code);
  check('creator is host and auto driver', roomA.hostId === roomA.you && roomA.players.length === 1 && roomA.players[0].role === 'driver' && roomA.players[0].ready === false);
  const nm = roomA.players[0].name;
  check('name sanitised (no <>, zero-width, ≤16 chars)', nm.length <= 16 && !/[<>​\t]/.test(nm) && nm.startsWith('Rook'), JSON.stringify(nm));
  check('ROOM carries state:"lobby"', roomA.state === 'lobby');

  // bad joins
  B.send({ t: 'join', code: 'ZZ', name: 'Doc' });
  const e1 = await B.wait('error');
  check('JOIN malformed code → ERROR', e1.code === 'badCode' && typeof e1.msg === 'string', JSON.stringify(e1));
  const unknown = code === 'ZZZZ' ? 'YYYY' : 'ZZZZ';
  B.send({ t: 'join', code: unknown.toLowerCase(), name: 'Doc' });
  const e2 = await B.wait('error');
  check('JOIN unknown code → ERROR "No room…"', e2.code === 'notFound' && /No room/.test(e2.msg), JSON.stringify(e2));

  // join (lowercase code accepted)
  B.send({ t: 'join', code: code.toLowerCase(), name: 'Doc' });
  const roomB = await B.wait('room');
  const roomA2 = await A.wait('room');
  check('JOIN → both get ROOM with 2 players', roomB.players.length === 2 && roomA2.players.length === 2);
  const idA = roomA.you; const idB = roomB.you;
  const roleOf = (r, id) => r.players.find((p) => p.id === id)?.role;
  check('joiner auto-assigned cook', roleOf(roomB, idB) === 'cook' && roleOf(roomB, idA) === 'driver');

  // full room
  const C = new TC(WS, 'C'); await C.open();
  C.send({ t: 'join', code, name: 'Third' });
  const e3 = await C.wait('error');
  check('JOIN full room → ERROR', e3.code === 'full' && /full/i.test(e3.msg), JSON.stringify(e3));
  C.close();

  // role conflict
  B.send({ t: 'role', role: 'driver' });
  const e4 = await B.wait('error');
  check('ROLE taken by other player → rejected', e4.code === 'roleTaken', JSON.stringify(e4));
  B.send({ t: 'role', role: 'pilot' });
  const e5 = await B.wait('error');
  check('ROLE invalid value → rejected', e5.code === 'badRequest', JSON.stringify(e5));

  // swap
  A.send({ t: 'role', role: 'swap' });
  const sw = await B.wait('room'); await A.wait('room');
  check('ROLE swap exchanges roles', roleOf(sw, idA) === 'cook' && roleOf(sw, idB) === 'driver');
  B.send({ t: 'role', role: 'swap' });
  const sw2 = await A.wait('room'); await B.wait('room');
  check('swap back', roleOf(sw2, idA) === 'driver' && roleOf(sw2, idB) === 'cook');

  // start guards
  A.send({ t: 'start' });
  const e6 = await A.wait('error');
  check('START before ready → ERROR notReady', e6.code === 'notReady', JSON.stringify(e6));
  A.send({ t: 'ready', ready: 'yes' });
  const e7 = await A.wait('error');
  check('READY non-boolean → rejected', e7.code === 'badRequest');

  A.send({ t: 'ready', ready: true }); await A.wait('room'); await B.wait('room');
  B.send({ t: 'ready', ready: true });
  const rr = await A.wait('room'); await B.wait('room');
  check('READY flags broadcast', rr.players.every((p) => p.ready === true));

  B.send({ t: 'start' });
  const e8 = await B.wait('error');
  check('START from non-host → ERROR notHost', e8.code === 'notHost', JSON.stringify(e8));

  // relay before start is dropped
  A.send({ t: 'g', m: { k: 'chat', text: 'early' } });
  check('GAME before start is not relayed', await B.none((m) => m.t === 'g'));

  // start
  A.send({ t: 'start' });
  const [sA, sB] = await Promise.all([A.wait('start'), B.wait('start')]);
  check('START → both receive START with the same 32-bit seed', Number.isInteger(sA.seed) && sA.seed >= 0 && sA.seed <= 0xffffffff && sA.seed === sB.seed, `${sA.seed} vs ${sB.seed}`);
  check('START roles map', sA.roles[idA] === 'driver' && sA.roles[idB] === 'cook' && isDeepStrictEqual(sA.roles, sB.roles));
  const playingRoom = await A.wait('room'); await B.wait('room');
  check('room state → playing', playingRoom.state === 'playing');

  // no joiners while playing
  const D = new TC(WS, 'D'); await D.open();
  D.send({ t: 'join', code, name: 'Late' });
  const e9 = await D.wait('error');
  check('JOIN while playing → ERROR', e9.code === 'full' || e9.code === 'started', JSON.stringify(e9));
  D.close();

  // relay both directions with ~10 KB snapshot
  const snap = { k: 'snap', s: fakeSnapshot(1) };
  const snapBytes = Buffer.byteLength(JSON.stringify({ t: 'g', m: snap }));
  A.send({ t: 'g', m: snap });
  const gB = await tryWait(B.wait('g'));
  check(`relay driver→cook verbatim (${(snapBytes / 1024).toFixed(1)} KB snapshot)`, snapBytes > 9000 && isDeepStrictEqual(gB.m, snap) && gB.from === idA);
  check('sender does not get its own message back', await A.none((m) => m.t === 'g', 150));
  const lab = { k: 'lab', l: { cooking: true, recipeId: 'street', step: 2, stepType: 'stir', temp: 71.5, fumes: 0.3, fire: 0, ventOpen: true, curtains: true, cookHurt: 0 }, pad: 'y'.repeat(10000) };
  B.send({ t: 'g', m: lab });
  const gA = await tryWait(A.wait('g'));
  check('relay cook→driver verbatim (10 KB)', isDeepStrictEqual(gA.m, lab) && gA.from === idB);

  // payload limit
  A.send({ t: 'g', m: { k: 'snap', s: 'z'.repeat(70 * 1024) } });
  const e10 = await tryWait(A.wait('error'));
  check('payload > 64 KB → ERROR tooLarge (socket stays open)', e10.code === 'tooLarge' && !A.closed, JSON.stringify(e10).slice(0, 120));
  check('oversized payload not relayed', await B.none((m) => m.t === 'g', 150));

  // garbage input
  A.send('this is not json');
  const e11 = await A.wait('error');
  A.send({ t: 'warp' });
  const e12 = await A.wait('error');
  check('malformed JSON / unknown type → ERROR, no crash', e11.code === 'badRequest' && e12.code === 'badRequest');

  // back to lobby + restart
  B.send({ t: 'lobby' });
  const lb = await A.wait((m) => m.t === 'room' && m.state === 'lobby'); await B.wait('room');
  check("{t:'lobby'} returns room to lobby, ready cleared", lb.players.every((p) => p.ready === false) && lb.players.length === 2);
  A.send({ t: 'lobby' }); // idempotent
  const lb2 = await A.wait('room');
  check("second {t:'lobby'} is idempotent", lb2.state === 'lobby');
  check('GAME after lobby is not relayed', await (async () => { A.send({ t: 'g', m: { k: 'chat', text: 'x' } }); return B.none((m) => m.t === 'g', 150); })());
  A.send({ t: 'ready', ready: true }); B.send({ t: 'ready', ready: true });
  await sleep(100); A.drain(); B.drain();
  A.send({ t: 'start' });
  const [s2A, s2B] = await Promise.all([A.wait('start'), B.wait('start')]);
  check('restart after lobby → new START, same seed both sides', s2A.seed === s2B.seed);
  await A.wait('room'); await B.wait('room');

  // rate limit
  const R = new TC(WS, 'R'); await R.open();
  for (let i = 0; i < 500; i++) R.send({ t: 'ping', at: i });
  await sleep(600);
  const pongs = R.drain().filter((m) => m.t === 'pong').length;
  check(`rate limit drops excess silently (${pongs}/500 answered)`, pongs >= 150 && pongs <= 300 && !R.closed, `pongs=${pongs}`);
  await sleep(300);
  R.send({ t: 'ping', at: 7 });
  const p2 = await tryWait(R.wait('pong'));
  check('socket still usable after throttling', p2.at === 7);
  R.close();

  // peer left
  B.close();
  const pl = await tryWait(A.wait('peerLeft'));
  check('PEER_LEFT sent to remaining player on disconnect', pl.id === idB, JSON.stringify(pl));
  const after = await tryWait(A.wait('room'));
  check('room back to lobby with 1 player after peer left', after.players?.length === 1 && after.state === 'lobby' && after.hostId === idA);

  // host migration: new joiner, then host leaves → joiner becomes host
  const E = new TC(WS, 'E'); await E.open();
  E.send({ t: 'join', code, name: 'Doc2' });
  const re = await E.wait('room'); await A.wait('room');
  check('room reopens for a new partner after peer left', re.players.length === 2);
  A.send({ t: 'leave' });
  const pl2 = await E.wait('peerLeft');
  const hostR = await E.wait('room');
  check('LEAVE → other gets PEER_LEFT and becomes host', pl2.id === idA && hostR.hostId === re.you);
  E.close(); A.close();
  await sleep(200);
  const h2 = await (await fetch(`${base.http}/healthz`)).json();
  check('empty rooms cleaned up (/healthz rooms=0, players=0)', h2.rooms === 0 && h2.players === 0, JSON.stringify(h2));
}

async function unitTests() {
  console.log('\n[rooms.js unit: idle sweep + rate bucket with a fake clock]');
  const { RoomManager } = await import(join(ROOT, 'server/rooms.js'));
  let t = 1_000_000;
  const rm = new RoomManager({ log: () => {}, now: () => t });
  const mk = () => { const out = []; return { out, tr: { send: (s) => out.push(JSON.parse(s)), close() {}, bufferedAmount: 0 } }; };
  const a = mk(); const b = mk(); const c = mk();
  const ca = rm.connect(a.tr); const cb = rm.connect(b.tr); const cc = rm.connect(c.tr);
  rm.receive(ca, JSON.stringify({ t: 'create', name: 'A' }));
  rm.receive(cc, JSON.stringify({ t: 'create', name: 'C' }));
  const code = a.out.at(-1).code;
  rm.receive(cb, JSON.stringify({ t: 'join', code, name: 'B' }));
  t += 20 * 60 * 1000;
  rm.receive(ca, JSON.stringify({ t: 'ping', at: 1 }));      // pings don't keep a room alive
  rm.receive(cc, JSON.stringify({ t: 'ready', ready: true })); // real activity does
  t += 11 * 60 * 1000;
  const swept = rm.sweep();
  const expired = a.out.at(-1);
  check('rooms idle > 30 min are swept, players told why', swept === 1 && expired.t === 'error' && expired.code === 'expired' && !rm.rooms.has(code) && rm.rooms.size === 1);
  check('swept players can create a new room', (rm.receive(ca, JSON.stringify({ t: 'create', name: 'A' })), a.out.at(-1).t === 'room' && rm.rooms.size === 2));
  const d = mk(); const cd = rm.connect(d.tr);
  let answered = 0;
  for (let i = 0; i < 400; i++) rm.receive(cd, JSON.stringify({ t: 'ping', at: i }));
  answered = d.out.length;
  t += 1000;
  for (let i = 0; i < 400; i++) rm.receive(cd, JSON.stringify({ t: 'ping', at: i }));
  check(`token bucket: burst 200 then ~120/s (${answered} then ${d.out.length - answered})`, answered === 200 && d.out.length - answered === 120);
}

async function clientModuleTests(base) {
  console.log('\n[client modules]');
  const { NetClient, normalizeServerUrl } = await import(join(ROOT, 'public/js/net/NetClient.js'));
  const { LocalBus } = await import(join(ROOT, 'public/js/net/LocalBus.js'));

  check('normalizeServerUrl variants', normalizeServerUrl('localhost:3000') === 'ws://localhost:3000/ws'
    && normalizeServerUrl('https://x.onrender.com') === 'wss://x.onrender.com/ws'
    && normalizeServerUrl('ws://h:1/ws') === 'ws://h:1/ws');

  if (typeof globalThis.WebSocket !== 'function') {
    console.log('  SKIP  NetClient live test (no global WebSocket in this Node)');
  } else {
    const url = `ws://127.0.0.1:${base.port}/ws`;
    const a = new NetClient({ url, pingEveryMs: 300 });
    const b = new NetClient({ url, pingEveryMs: 300 });
    let opened = 0;
    a.on('open', () => opened++);
    a.send({ t: 'create', name: 'NetA' }); // queued before connect
    const roomP = new Promise((r) => a.on('room', r));
    await a.connect();
    const room = await roomP;
    check('NetClient queues send() until open; connect() resolves', opened === 1 && /^[A-Z0-9]{4}$/.test(room.code) && a.room === room && a.id === room.you);
    await b.connect();
    const bRoom = new Promise((r) => { const off = b.on('room', (m) => { off(); r(m); }); });
    b.send({ t: 'join', code: room.code, name: 'NetB' });
    await bRoom;
    a.send({ t: 'ready', ready: true }); b.send({ t: 'ready', ready: true });
    await sleep(150);
    const startB = new Promise((r) => b.on('start', r));
    a.send({ t: 'start' });
    const st = await startB;
    check('NetClient on("start") receives seed+roles', Number.isInteger(st.seed) && st.roles[b.id] === 'cook');
    const got = [];
    const off = b.onGame((m, from) => got.push({ m, from }));
    a.sendGame({ k: 'chat', text: 'COPS!' });
    await sleep(150);
    check('sendGame/onGame round trip (with from)', got.length === 1 && got[0].m.text === 'COPS!' && got[0].from === a.id);
    off();
    a.sendGame({ k: 'chat', text: 'again' });
    await sleep(150);
    check('onGame unsubscribe works', got.length === 1);
    await sleep(400);
    check(`latencyMs measured (${a.latencyMs} ms)`, typeof a.latencyMs === 'number' && a.latencyMs >= 0);
    const closed = new Promise((r) => b.on('close', r));
    a.close();
    const peerLeft = await new Promise((r) => { b.on('peerLeft', r); });
    check('peer close → peerLeft on NetClient', peerLeft.id === a.id);
    b.close();
    const ci = await closed;
    check("close() emits 'close' with intentional:true", ci.intentional === true);
    const c = new NetClient({ url: `ws://127.0.0.1:${base.port}/nope` });
    let errEvt = false;
    c.on('error', () => { errEvt = true; });
    const rejected = await c.connect().then(() => false, () => true);
    check("connect() rejects + 'error' event on bad endpoint", rejected && errEvt);
  }

  const [x, y] = LocalBus.pair();
  const recv = [];
  y.onGame((m, from) => recv.push({ m, from }));
  const obj = { k: 'snap', s: { rv: { z: 1 } } };
  x.sendGame(obj);
  check('LocalBus delivers asynchronously', recv.length === 0);
  await sleep(0);
  check('LocalBus delivers a structuredClone (not the same object)', recv.length === 1 && recv[0].m !== obj && isDeepStrictEqual(recv[0].m, obj));
  let closes = 0; x.on('close', () => closes++); y.on('close', () => closes++);
  x.close(); x.sendGame(obj); await sleep(0);
  check('LocalBus close() closes both ends', closes === 2 && recv.length === 1);
}

// ── browser check (Python Playwright) ───────────────────────────────────────
const PY = String.raw`
import json, sys, os
from playwright.sync_api import sync_playwright
base, outdir = sys.argv[1], sys.argv[2]
args = ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
res = {'ok': True, 'checks': [], 'errors': [], 'shots': []}
def ck(name, ok, detail=''):
    res['checks'].append([name, bool(ok), str(detail)[:300]])
    if not ok: res['ok'] = False
def watch(page, tag):
    page.on('console', lambda m: m.type == 'error' and res['errors'].append(f'{tag} console: {m.text}'))
    page.on('pageerror', lambda e: res['errors'].append(f'{tag} pageerror: {e}'))
def shot(page, name, toasts=False):
    if not toasts: page.evaluate("document.querySelectorAll('.crl-toast').forEach(t => t.remove())")
    page.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.matches('input') && document.activeElement.blur()")
    page.evaluate("(() => { const c = document.querySelector('.crl'); if (c) c.scrollTop = 0; })()")
    page.wait_for_timeout(120)
    p = os.path.join(outdir, name); page.screenshot(path=p); res['shots'].append(p)

def run(p):
    br = p.chromium.launch(args=args)
    for vp, tag in (({'width': 1280, 'height': 800}, 'desktop'), ({'width': 390, 'height': 844}, 'phone')):
        mobile = tag == 'phone'
        ctxA = br.new_context(viewport=vp, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
        ctxB = br.new_context(viewport=vp, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
        ctxA.grant_permissions(['clipboard-read', 'clipboard-write'], origin=base)
        A = ctxA.new_page(); B = ctxB.new_page()
        watch(A, tag + ':A'); watch(B, tag + ':B')
        A.goto(base + '/net-test.html'); A.wait_for_selector('.crl-menu')
        A.wait_for_timeout(600)
        A.fill('#crl-name', 'Rook')
        shot(A, f'lobby-title-{tag}.png')
        A.click('[data-act="howto"]'); A.wait_for_selector('dialog.crl-modal[open]'); A.wait_for_timeout(350)
        ck(f'{tag}: how-to modal opens', A.is_visible('dialog.crl-modal[open]'))
        shot(A, f'lobby-howto-{tag}.png')
        A.keyboard.press('Escape'); A.wait_for_timeout(150)
        ck(f'{tag}: Escape closes modal', not A.is_visible('dialog.crl-modal[open]'))
        A.click('[data-act="create"]'); A.wait_for_selector('.crl-plate-code')
        A.wait_for_function("document.querySelector('.crl-plate-code').textContent.length === 4")
        code = A.text_content('.crl-plate-code')
        invite = A.input_value('.crl-invite-url')
        ck(f'{tag}: invite link has ?room=CODE', invite.endswith('/?room=' + code), invite)
        A.click('[data-act="copy"]'); A.wait_for_timeout(200)
        clip = A.evaluate('navigator.clipboard.readText().catch(() => "")')
        ck(f'{tag}: copy invite link puts URL on clipboard', clip == invite, clip)
        # B opens the invite link (rewritten to the harness page, same query)
        B.goto(invite.replace('/?room=', '/net-test.html?room=')); B.wait_for_selector('.crl-menu')
        ck(f'{tag}: ?room= prefills join code', B.input_value('#crl-code') == code)
        ck(f'{tag}: Join button focused for invited player', B.evaluate("document.activeElement && document.activeElement.dataset.act") == 'join')
        B.fill('#crl-name', 'Doc')
        B.keyboard.press('Enter')
        B.wait_for_selector('.crl-plate-code')
        A.wait_for_function("document.querySelectorAll('.crl-role.is-taken').length === 1")
        ck(f'{tag}: A sees B in the cook seat', 'Doc' in A.text_content('.crl-role--cook'))
        # roles: B takes driver via swap, then swap back (exercise the cards)
        B.click('.crl-role--driver'); A.wait_for_function("document.querySelector('.crl-role--cook').classList.contains('is-mine')")
        ck(f'{tag}: role swap via card', 'Doc' in A.text_content('.crl-role--driver'))
        A.click('.crl-role--driver'); B.wait_for_function("document.querySelector('.crl-role--cook').classList.contains('is-mine')")
        ck(f'{tag}: Start disabled until ready', A.is_disabled('[data-act="start"]'), A.text_content('[data-bind="reason"]'))
        A.click('[data-act="ready"]')
        B.wait_for_function("document.querySelector('.crl-role--driver').classList.contains('is-ready')")
        shot(A, f'lobby-room-{tag}.png')
        B.click('[data-act="ready"]')
        A.wait_for_function("!document.querySelector('[data-act=\"start\"]').disabled")
        ck(f'{tag}: guest sees Host starts (disabled)', B.is_disabled('[data-act="start"]'))
        shot(A, f'lobby-room-ready-{tag}.png')
        A.click('[data-act="start"]')
        A.wait_for_function("window.__starts.length === 1"); B.wait_for_function("window.__starts.length === 1")
        sa = A.evaluate('window.__starts[0]'); sb = B.evaluate('window.__starts[0]')
        ck(f'{tag}: both onStart fired, online, same seed', sa['mode'] == 'online' == sb['mode'] and sa['seed'] == sb['seed'] and sa['roomCode'] == code, (sa, sb))
        ck(f'{tag}: roles driver/cook', sa['role'] == 'driver' and sb['role'] == 'cook')
        ck(f'{tag}: document.title shows START', A.title().startswith('START online driver'))
        # game traffic through the NetClient handed to onStart
        A.click('#ping-peer'); B.wait_for_function("window.__game.length === 1")
        ck(f'{tag}: game msg relayed via net from onStart', B.evaluate('window.__game[0].text') == 'COPS!')
        # back to room (resumeRoom), restart
        A.click('#back-room'); B.click('#back-room')
        A.wait_for_selector('.crl-plate-code'); B.wait_for_selector('.crl-plate-code')
        ck(f'{tag}: resumeRoom shows same room code', A.text_content('.crl-plate-code') == code == B.text_content('.crl-plate-code'))
        A.click('[data-act="ready"]'); B.wait_for_function("document.querySelector('.crl-role--driver').classList.contains('is-ready')")
        B.click('[data-act="ready"]'); A.wait_for_function("!document.querySelector('[data-act=\"start\"]').disabled")
        A.click('[data-act="start"]')
        A.wait_for_function("window.__starts.length === 2"); B.wait_for_function("window.__starts.length === 2")
        ck(f'{tag}: restart from resumed room fires onStart again', A.evaluate('window.__starts[1].seed') == B.evaluate('window.__starts[1].seed'))
        # quit to title on B → A notified
        B.click('#back-title'); B.wait_for_selector('.crl-menu')
        A.wait_for_function("document.getElementById('relay').textContent.includes('left')", timeout=5000)
        ck(f'{tag}: quitting player leaves room, partner notified', True)
        # bad code toast
        B.fill('#crl-code', 'QQQQ'); B.click('[data-act="join"]')
        B.wait_for_selector('.crl-toast--bad')
        ck(f'{tag}: unknown code shows error toast', 'No room' in B.text_content('.crl-toasts'))
        if tag == 'desktop':
            B.wait_for_timeout(250); shot(B, 'lobby-error-desktop.png', toasts=True)
        # solo
        B.goto(base + '/net-test.html'); B.wait_for_selector('.crl-menu')
        B.click('[data-act="solo"]'); B.wait_for_function("window.__starts.length === 1")
        so = B.evaluate('window.__starts[0]')
        ck(f'{tag}: Play Solo → onStart(mode solo, net null, numeric seed)', so['mode'] == 'solo' and so['net'] is None and isinstance(so['seed'], int))
        B.wait_for_function("window.__game.length === 1")
        ck(f'{tag}: horizontal overflow none', A.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
        ctxA.close(); ctxB.close()
    br.close()

with sync_playwright() as p:
    try:
        run(p)
    except Exception as e:
        import traceback
        ck('browser flow finished', False, traceback.format_exc()[-600:])
print('@@RESULT@@' + json.dumps(res))
`;

async function browserTests(base) {
  console.log('\n[browser] headless Chromium via Python Playwright');
  const probe = spawnSync('python3', ['-c', 'import playwright'], { encoding: 'utf8' });
  if (probe.status !== 0) { console.log('  SKIP  python3 + playwright not available'); return; }
  const dir = join(tmpdir(), `cookrun-net-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const py = join(dir, 'lobby_check.py');
  writeFileSync(py, PY);
  const outdir = join(ROOT, 'docs');
  mkdirSync(outdir, { recursive: true });
  const r = spawnSync('python3', ['-I', py, base.http, outdir], { encoding: 'utf8', timeout: 180000 });
  rmSync(dir, { recursive: true, force: true });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@RESULT@@'));
  if (!line) {
    check('browser script ran', false, (r.stderr || r.stdout || '').slice(-2000));
    return;
  }
  const res = JSON.parse(line.slice(10));
  for (const [name, ok, detail] of res.checks) check(name, ok, detail);
  check('no console errors / page errors', res.errors.length === 0, res.errors.slice(0, 5).join(' | '));
  for (const s of res.shots) console.log(`        screenshot ${s}`);
}

// ── main ────────────────────────────────────────────────────────────────────
const port = await freePort();
const base = { port, http: `http://127.0.0.1:${port}` };
console.log(`[test-net] starting server on :${port}`);
let crashed = null;
try {
  await startServer(port);
  await protocolTests(base);
  await unitTests();
  await clientModuleTests(base);
  if (WANT_BROWSER) await browserTests(base);
} catch (err) {
  crashed = err;
  check('test run completed without exceptions', false, err.stack || err.message);
} finally {
  const ex = await stopServer();
  check('server exits cleanly on SIGTERM', ex && ex.code === 0, JSON.stringify(ex));
}
if (VERBOSE || crashed) console.log(serverLog.join('').split('\n').slice(-30).join('\n'));
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  ${passed} passed, ${failed} failed${failed ? `: ${failures.join('; ')}` : ''}`);
process.exit(failed === 0 ? 0 : 1);
