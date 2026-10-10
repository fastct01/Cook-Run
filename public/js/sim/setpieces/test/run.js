// ─────────────────────────────────────────────────────────────────────────────
// Set-piece tests (Agent SETPIECES):  node public/js/sim/setpieces/test/run.js [--verbose] [--only=type,…]
//   (a) MOCK: every set-piece through its whole life with a mock sim that implements
//       the GameSim helper API (same collider / pushRv / fall semantics as GameSim) and
//       a scripted RV (drivers: patient = stays in its lane, detour = picks a free
//       lane/shoulder/verge, reckless = ignores everything). Checks: no exceptions,
//       entity tuples valid (kind ids exist), colliders finite, state() JSON-clean,
//       blockers clear (longest stop < 60 s), EV.setpiece fired, determinism (same seed
//       → identical entity streams), plus per-type behaviour checks.
//   (b) REAL: when GameSim wires the host (it does), the real GameSim + Autopilot are
//       teleported in front of each set-piece and must get past it (no soft-lock);
//       events + damage are reported. --full also runs a whole game from the start.
// Options: --seed=N (default route.defaultSeed) --only=tornado,parade --no-real --full --verbose
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { loadDataNode } from '../../../data/loadData.js';
import { Track } from '../../track.js';
import { SetPieceHost } from '../host.js';
import { SETPIECE_TYPES } from '../index.js';
import { KIND, KIND_ID, EV } from '../../../shared/protocol.js';

const DT = 1 / 60;
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const VERBOSE = !!args.verbose;
const ONLY = args.only ? String(args.only).split(',') : null;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  if (!ok || VERBOSE) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  return ok;
}
const hr = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 74 - t.length))}`);
const r1 = (v) => Math.round(v * 10) / 10;

// capture console.error (the host logs plugin exceptions there and retires the plugin)
const errors = [];
const origErr = console.error;
console.error = (...a) => { errors.push(a.map(String).join(' ')); if (VERBOSE) origErr(...a); };

// ── mock sim ─────────────────────────────────────────────────────────────────
class MockSim {
  constructor(data, opts = {}) {
    this.data = data; this.route = data.route; this.rules = data.rules;
    this.seed = (opts.seed ?? data.route.defaultSeed ?? 1) >>> 0;
    this.track = new Track(data.route, this.seed);
    this.t = 0; this.phase = 'drive';
    this._id = 1;
    this.events = [];
    this.stars = opts.stars ?? 0;
    this.units = opts.units ?? 10;
    this.copsOn = opts.cops ?? this.stars > 0;
    this.log = { damage: 0, pushes: 0, drops: [], redirect: null, copEffects: 0, taken: 0, respawns: 0, fx: 0, heat: 0, points: 0, maxPull: 0 };
    this.zones = opts.zones || null;          // gadget zones generator (rattlers test)
    const z0 = opts.z0 ?? 0;
    const u0 = opts.u0 ?? this._fwdU(z0);
    this.rv = { x: this.track.xAt(z0, u0), y: 0, z: z0, yaw: this.track.headingAt(z0), speed: opts.v0 ?? 15, vx: 0, vz: 0, vy: 0, vs: 0,
      airborne: false, horn: false, hp: 100, len: 8.6, wid: 2.6, hl: 3.0, r: 1.3, groundVy: 0 };
    this._syncVel();
    this.cops = [];
    if (this.copsOn) for (let i = 0; i < 2; i++) this.cops.push({ id: 900000 + i, kind: 'cop', x: this.rv.x, z: z0 - 30 - i * 12, speed: 0, state: 1, hp: 45, back: 30 + i * 12, side: i ? 2 : -2 });
    this._hit = new Map();
    if (opts.noRespawn) { this.respawnRv = undefined; this.onFellGeneric = undefined; }
    this.setpieces = new SetPieceHost(this);
  }
  _fwdU(z) { const lanes = this.track.lanesAt(z); const n = Math.max(1, (lanes / 2) | 0); return (Math.max(0, n - 2) + 0.5) * this.track.laneWidth(z); }
  _syncVel() { const rv = this.rv, s = Math.sin(rv.yaw), c = Math.cos(rv.yaw); rv.vx = s * rv.speed - c * rv.vs; rv.vz = c * rv.speed + s * rv.vs; }
  // helper API
  get time() { return this.t; }
  newId() { return this._id++; }
  kindId(k) { return KIND_ID[k] ?? -1; }
  emit(ev) { this.events.push({ t: this.t, ...ev }); }
  msg(text, tone = 'info') { this.emit({ type: 'msg', text, tone }); }
  damageRv(a) { if (a > 0) { this.rv.hp -= a; this.log.damage += a; } }
  pushRv(dx, dz, loss = 0) {
    const rv = this.rv, k = 1 - Math.min(1, Math.max(0, loss));
    rv.vx = rv.vx * k + dx; rv.vz = rv.vz * k + dz;
    const s = Math.sin(rv.yaw), c = Math.cos(rv.yaw);
    rv.speed = rv.vx * s + rv.vz * c; rv.vs = -rv.vx * c + rv.vz * s;
    this.log.pushes++;
  }
  addHeat(a) { this.log.heat += a; }
  dropStars(n, reason) { this.stars = Math.max(0, this.stars - n); this.log.drops.push(reason); this.emit({ type: EV.HEAT_DROP, stars: this.stars, reason }); }
  heatStars() { return this.stars; }
  addPoints(n) { this.log.points += n; }
  copsList() { return this.cops.filter((c) => c.state !== 4).map((c) => ({ id: c.id, kind: c.kind, x: c.x, y: 0, z: c.z, yaw: 0, speed: c.speed, state: c.state })); }
  applyCopEffect(id, eff) {
    const c = this.cops.find((k) => k.id === id); if (!c) return;
    this.log.copEffects++;
    if (eff.damage) { c.hp -= eff.damage; if (c.hp <= 0) c.state = 4; }
  }
  redirectCops(fn, s) { this.log.redirect = { fn, s, at: this.t }; }
  setFx() { this.log.fx++; }
  takeProduct(n) { const k = Math.min(n, this.units); this.units -= k; this.log.taken += k; return k; }
  gadgetZones() { return this.zones ? this.zones(this) : []; }
  respawnRv(z) { this._place(z); this.log.respawns++; this.emit({ type: 'fell', at: 'respawn' }); }
  onFellGeneric(z) { this.damageRv(15); this.respawnRv(z - 100); }
  _place(z) {
    const rv = this.rv, u = this._fwdU(z);
    rv.z = z; rv.x = this.track.xAt(z, u); rv.yaw = this.track.headingAt(z); rv.speed = 0; rv.vs = 0; rv.y = 0; rv.vy = 0; rv.airborne = false;
    this._syncVel();
  }
  surfaceAt(z) { const y = this.setpieces.surfaceY(z); return y !== undefined ? y : this.track.surfaceY(z); }
  laneBlocked(z, u) { return this.setpieces.laneBlocked(z, u); }
}

// ── scripted driver ──────────────────────────────────────────────────────────
function segDist(rv, x, z) {
  const s = Math.sin(rv.yaw), c = Math.cos(rv.yaw);
  const ax = rv.x + s * rv.hl, az = rv.z + c * rv.hl, dx = -2 * s * rv.hl, dz = -2 * c * rv.hl;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  const px = ax + dx * t, pz = az + dz * t;
  return { d: Math.hypot(x - px, z - pz), px, pz };
}

class Driver {
  constructor(mode, o = {}) { this.mode = mode; this.cruise = o.cruise ?? 22; this.fixedU = o.u ?? null; this.choice = null; this.horn = !!o.horn; this.stopAt = o.stopAt ?? null; this.zoneSpeed = o.zoneSpeed || null; }
  _blockedDist(sim, u, look) {
    const rv = sim.rv, front = rv.z + 4.3;
    for (let d = 0; d <= look; d += 1) {
      const z = front + d;
      if (sim.setpieces.laneBlocked(z, u) || sim.setpieces.laneBlocked(z, u - 1.4) || sim.setpieces.laneBlocked(z, u + 1.4)) return d;
    }
    return look;
  }
  _solidDist(sim, cols, u, look) {
    const rv = sim.rv; let best = look;
    for (const c of cols) {
      if (c.solid !== true) continue;
      const along = c.z - rv.z - 4.3 - c.r;
      if (along < -6 || along > look) continue;
      const cu = sim.track.uAt(c.x, c.z);
      if (Math.abs(cu - u) < c.r + 1.5) best = Math.min(best, Math.max(0, along));
    }
    return best;
  }
  update(sim, cols) {
    const tr = sim.track, rv = sim.rv;
    const z = rv.z, hw = tr.halfWidth(z), sh = tr.shoulder(z), room = tr.sideRoom(z), lw = tr.laneWidth(z);
    const fwd = sim._fwdU(z);
    let u = fwd, free = 60;
    const look = 60;
    if (this.mode === 'lane') { u = this.fixedU; free = Math.min(this._blockedDist(sim, u, look), this._solidDist(sim, cols, u, look)); }
    else if (this.mode === 'patient') { free = Math.min(this._blockedDist(sim, u, look), this._solidDist(sim, cols, u, look)); }
    else if (this.mode === 'detour' || this.mode === 'reckless') {
      const n = Math.max(1, (tr.lanesAt(z) / 2) | 0);
      const cands = [fwd];
      for (let r = 0; r < n; r++) cands.push((r + 0.5) * lw, -(r + 0.5) * lw);
      cands.push(hw + sh * 0.5, -(hw + sh * 0.5), hw + sh + 2.5, -(hw + sh + 2.5));
      if (room > 8) cands.push(hw + sh + 6, -(hw + sh + 6));
      let best = null;
      for (const cu of cands) {
        const f = Math.min(this._blockedDist(sim, cu, look), this._solidDist(sim, cols, cu, look));
        const score = f - Math.abs(cu - fwd) * 0.3 + (this.choice != null && Math.abs(cu - this.choice) < 0.5 ? 4 : 0);
        if (!best || score > best.score) best = { cu, f, score };
      }
      u = best.cu; free = best.f; this.choice = u;
      // while moving across, also respect what is right ahead in the current band
      const cur = tr.uAt(rv.x, rv.z);
      if (Math.abs(cur - u) > 1) free = Math.min(free, Math.max(this._blockedDist(sim, cur, 12), 4));
    }
    let vT = this.mode === 'reckless' || this.mode === 'jumper' ? this.cruise : Math.min(this.cruise, Math.sqrt(2 * 6 * Math.max(0, free - 2.5)));
    for (const ev of sim.route.events || []) {
      if (ev.type !== 'train') continue;
      const d = ev.z - (z + 4.3);
      if (d < -2 || d > 80) continue;
      const c = ev.period, ph = (((sim.t + c * 0.35) % c) + c) % c, clearLen = c - ev.warn - ev.pass;
      if (ph >= clearLen) vT = Math.min(vT, Math.sqrt(2 * 6 * Math.max(0, d - 6)));
    }
    if (this.zoneSpeed && z > this.zoneSpeed[0] && z < this.zoneSpeed[1]) vT = Math.min(vT, this.zoneSpeed[2]);
    if (this.stopAt != null && z > this.stopAt - 60) vT = Math.min(vT, Math.sqrt(2 * 3 * Math.max(0, this.stopAt - z)));
    rv.horn = this.horn && free < 30;
    return { u, vT };
  }
}

function stepRv(sim, drv, dt, cols) {
  const rv = sim.rv, tr = sim.track;
  const { u: uT, vT } = drv.update(sim, cols);
  // longitudinal
  if (!rv.airborne) {
    const a = rv.speed < vT ? 7 : -14;
    rv.speed = rv.speed < vT ? Math.min(vT, rv.speed + a * dt) : Math.max(vT, rv.speed + a * dt);
    rv.vs = rv.vs > 0 ? Math.max(0, rv.vs - 13.5 * dt) : Math.min(0, rv.vs + 13.5 * dt);
    // steering: pure pursuit to the lateral target
    const L = 8 + Math.abs(rv.speed) * 0.5;
    const curU = tr.uAt(rv.x, rv.z);
    const uL = curU + Math.max(-L * 0.35, Math.min(L * 0.35, uT - curU));
    const want = Math.atan2(tr.xAt(rv.z + L, uL) - rv.x, L);
    let dy = want - rv.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    rv.yaw += Math.max(-1.2 * dt, Math.min(1.2 * dt, dy)) * Math.min(1, Math.abs(rv.speed) / 3);
  }
  sim._syncVel();
  const prevZ = rv.z;
  rv.x += rv.vx * dt; rv.z += rv.vz * dt;
  // lateral wall
  const lim = tr.halfWidth(rv.z) + tr.shoulder(rv.z) + tr.sideRoom(rv.z) - 1.3;
  const cu = tr.uAt(rv.x, rv.z);
  if (Math.abs(cu) > lim) rv.x = tr.xAt(rv.z, Math.sign(cu) * lim);
  // vertical (same rules as vehicle.js: gap → airborne; face below surface → bounce; < −5 → generic fall)
  const sy = sim.surfaceAt(rv.z);
  if (!rv.airborne) {
    if (sy == null) { rv.airborne = true; rv.vy = rv.groundVy; }
    else { rv.groundVy = (sy - rv.y) / dt; rv.y = sy; }
  } else {
    rv.vy -= 9.81 * dt; rv.y += rv.vy * dt;
    if (sy != null && rv.y <= sy) {
      if (rv.y < sy - 1.0) { rv.z = prevZ - 0.05 * Math.sign(rv.z - prevZ || 1); rv.speed *= -0.15; rv.vs *= 0.3; sim._syncVel(); }
      else { rv.y = sy; rv.vy = 0; rv.airborne = false; rv.groundVy = 0; }
    }
    const br = sim.route.bridge;
    const canyon = br && rv.z > br.rampStart - 5 && rv.z < br.landingEnd + 5;
    if (canyon && rv.y < -br.canyonDepth * 0.4) sim.respawnRv(br.checkpointZ);
    else if (!canyon && rv.y < -5 && typeof sim.onFellGeneric === 'function') sim.onFellGeneric(rv.z);
  }
  if (rv.y < -80) throw new Error('RV fell forever');
  // set-piece colliders (GameSim semantics: solid resolve + damage scaled by impact speed, onHit once / 0.8 s)
  if (!(rv.airborne && rv.y > 1.5)) for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    const { d, px, pz } = segDist(rv, c.x, c.z);
    if (d >= c.r + rv.r) continue;
    let nx = c.x - px, nz = c.z - pz; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    let vn = 0;
    const cvx = c.vx || 0, cvz = c.vz || 0;
    if (c.solid === true) {
      const pen = c.r + rv.r - d;
      rv.x -= nx * pen; rv.z -= nz * pen;
      const rvx = rv.vx - cvx, rvz = rv.vz - cvz;
      vn = rvx * nx + rvz * nz;
      if (vn > 0) { rv.vx -= vn * nx * 1.2; rv.vz -= vn * nz * 1.2; const s = Math.sin(rv.yaw), cc = Math.cos(rv.yaw); rv.speed = rv.vx * s + rv.vz * cc; rv.vs = -rv.vx * cc + rv.vz * s; }
      vn = Math.abs(vn);
    } else vn = Math.abs((rv.vx - cvx) * nx + (rv.vz - cvz) * nz);
    const key = `${c.id ?? c.kind ?? i}`;
    const last = sim._hit.get(key);
    if (last != null && sim.t - last <= 0.8) continue;
    sim._hit.set(key, sim.t);
    if (c.damage > 0) sim.damageRv(c.solid === true ? c.damage * Math.max(0.4, Math.min(1.5, vn / 12)) : c.damage);
    if (typeof c.onHit === 'function') c.onHit(sim, { by: 'rv', id: 0, speed: vn });
  }
}

function stepCops(sim, dt) {
  const rv = sim.rv, tr = sim.track;
  const red = sim.log.redirect && sim.t - sim.log.redirect.at < sim.log.redirect.s ? sim.log.redirect.fn : null;
  for (const c of sim.cops) {
    if (c.state === 4) continue;
    let tx, tz;
    const tgt = red ? red(c) : null;
    if (tgt) { tx = tgt.x; tz = tgt.z; } else { tz = rv.z - c.back; tx = tr.xAt(tz, tr.uAt(rv.x, rv.z) + c.side); }
    const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz) || 1;
    const v = Math.min(32, d * 1.5);
    c.x += (dx / d) * v * dt; c.z += (dz / d) * v * dt; c.speed = v;
  }
}

// ── validity checks ──────────────────────────────────────────────────────────
function badNumber(v) { return typeof v !== 'number' || !Number.isFinite(v); }
function validateFrame(sim, ctx) {
  const ents = sim.setpieces.ents([]);
  const ids = new Set();
  for (const e of ents) {
    if (!Array.isArray(e) || e.length !== 8) return `bad tuple ${JSON.stringify(e)}`;
    if (!Number.isInteger(e[0]) || ids.has(e[0])) return `bad/duplicate id ${e[0]}`;
    ids.add(e[0]);
    if (!Number.isInteger(e[1]) || e[1] < 0 || e[1] >= KIND.length) return `bad kind id ${e[1]}`;
    for (let i = 2; i <= 5; i++) if (badNumber(e[i])) return `non-finite ${i} in ${KIND[e[1]]} ${JSON.stringify(e)}`;
    if (!Number.isInteger(e[6]) || e[6] < 0 || !Number.isInteger(e[7]) || e[7] < 0) return `bad variant/state ${JSON.stringify(e)}`;
    ctx.kinds.add(KIND[e[1]]);
    if (e[3] > ctx.maxY[KIND[e[1]]] || ctx.maxY[KIND[e[1]]] == null) ctx.maxY[KIND[e[1]]] = e[3];
  }
  const cols = sim.setpieces.colliders([]);
  for (const c of cols) {
    if (badNumber(c.x) || badNumber(c.z) || badNumber(c.r) || !(c.r > 0 && c.r < 10)) return `bad collider ${JSON.stringify(c)}`;
    if (c.vx != null && badNumber(c.vx)) return 'bad collider vx';
  }
  const st = sim.setpieces.state();
  let bad = null;
  const json = JSON.stringify(st, (k, v) => { if (typeof v === 'number' && !Number.isFinite(v)) bad = k; return v; });
  if (bad) return `non-finite state field ${bad}`;
  ctx.stateBytes = Math.max(ctx.stateBytes, json.length);
  for (const s of st) if (s.phase) ctx.phases.add(`${s.id}:${s.phase}`);
  for (const z of [sim.rv.z, sim.rv.z + 10, sim.rv.z + 40]) {
    const y = sim.setpieces.surfaceY(z);
    if (!(y === undefined || y === null || Number.isFinite(y))) return `bad surfaceY ${y}`;
  }
  return null;
}

function hashEnts(sim, h) {
  for (const e of sim.setpieces.ents([])) for (const v of e) { const n = Math.round(v * 1000) | 0; h = (Math.imul(h ^ n, 16777619) >>> 0); }
  return h;
}

// ── scenario runner ──────────────────────────────────────────────────────────
function runScenario(data, def, o) {
  const [from, to] = [def.from ?? def.z, def.to ?? def.z];
  const z0 = o.z0 ?? from - 600;
  const sim = new MockSim(data, { seed: o.seed, stars: o.stars ?? 0, cops: o.cops, z0, u0: o.u0, v0: o.v0 ?? 18, noRespawn: o.noRespawn, zones: o.zones, units: o.units });
  // only this set-piece
  sim.setpieces.defs = sim.setpieces.defs.filter((d) => d.id === def.id);
  const drv = new Driver(o.driver || 'patient', o.drv || {});
  const ctx = { kinds: new Set(), maxY: {}, phases: new Set(), stateBytes: 0, err: null, maxStop: 0, stopT: 0, hash: 2166136261, maxSurface: -99, sawNull: false, extra: {} };
  const endZ = o.endZ ?? to + 420;
  const tMax = o.tMax ?? 240;
  const errBefore = errors.length;
  let steps = 0;
  try {
    while (sim.t < tMax) {
      sim.t += DT; steps++;
      sim.setpieces.update(DT);
      stepCops(sim, DT);
      const cols = sim.setpieces.colliders([]);
      stepRv(sim, drv, DT, cols);
      if (o.each) o.each(sim, ctx);
      if (Math.abs(sim.rv.speed) < 0.5 && !(o.stopAt != null && sim.rv.z > o.stopAt - 30)) { ctx.stopT += DT; ctx.maxStop = Math.max(ctx.maxStop, ctx.stopT); }
      else if (Math.abs(sim.rv.speed) > 2) ctx.stopT = 0;
      for (const z of [sim.rv.z + 5, sim.rv.z + 20]) { const y = sim.setpieces.surfaceY(z); if (y === null) ctx.sawNull = true; else if (typeof y === 'number') ctx.maxSurface = Math.max(ctx.maxSurface, y); }
      if (steps % 6 === 0) {
        const e = validateFrame(sim, ctx);
        if (e) { ctx.err = e; break; }
        ctx.hash = hashEnts(sim, ctx.hash);
      }
      if (sim.rv.z > endZ && !o.untilT) break;
      if (o.untilT && sim.t > o.untilT) break;
    }
  } catch (e) { ctx.err = 'exception: ' + (e.stack || e); }
  ctx.pluginErrors = errors.slice(errBefore);
  ctx.passed = sim.rv.z > endZ || (o.untilT && sim.t >= o.untilT);
  ctx.t = sim.t;
  ctx.sim = sim;
  ctx.events = sim.events.filter((e) => e.type === EV.SETPIECE && e.id === def.id);
  ctx.captions = sim.events.filter((e) => (e.type === EV.SETPIECE && e.caption) || e.type === 'msg').map((e) => e.caption || e.text);
  return ctx;
}

const QUIET_OK = new Set(['car_wash']); // may legitimately emit nothing for a driver that skips it

function basicChecks(def, label, c) {
  const tag = `${def.type} [${label}]`;
  check(`${tag}: no exceptions`, !c.err && c.pluginErrors.length === 0, c.err || c.pluginErrors[0] || '');
  check(`${tag}: RV gets past (no soft-lock)`, c.passed, `t=${r1(c.t)}s z=${r1(c.sim.rv.z)}`);
  check(`${tag}: longest stop < 60 s`, c.maxStop < 60, `${r1(c.maxStop)} s`);
  if (!QUIET_OK.has(def.type)) check(`${tag}: EV.setpiece fired`, c.events.length > 0, c.events.map((e) => e.phase).join('→'));
}

// ── per-type scenarios ───────────────────────────────────────────────────────
function scenarios(def) {
  const T = def.type;
  const base = [{ label: 'patient', driver: 'patient' }, { label: 'detour', driver: 'detour' }, { label: 'reckless', driver: 'reckless', drv: { cruise: 24 } }];
  switch (T) {
    case 'car_carrier': case 'tornado': return [{ label: 'detour', driver: 'detour', drv: { cruise: 27 } }, { label: 'reckless', driver: 'reckless', drv: { cruise: 27 } }];
    case 'midnight_comet': return [...base, { label: 'detour+cops', driver: 'detour', stars: 2 }];
    case 'toll_plaza': return [{ label: 'open 0★', driver: 'detour', stars: 0 }, { label: 'checkpoint 2★', driver: 'detour', stars: 2 }, { label: 'checkpoint reckless', driver: 'reckless', stars: 3 }];
    case 'car_wash': return [
      { label: 'wash lane slow 2★', driver: 'lane', stars: 2, cops: false, drv: { cruise: 12 }, laneWash: true },
      { label: 'wash lane slow 2★ cops near', driver: 'lane', stars: 2, drv: { cruise: 12 }, laneWash: true },
      { label: 'wash lane fast 2★', driver: 'lane', stars: 2, drv: { cruise: 22 }, laneWash: true },
      { label: 'skip', driver: 'patient' },
    ];
    case 'drawbridge': return [
      { label: 'patient', driver: 'patient' }, { label: 'detour', driver: 'detour' },
      { label: 'jumper 26', driver: 'jumper', drv: { cruise: 26 }, z0: def.from - 330, v0: 26 },
      { label: 'slow jumper 5', driver: 'jumper', drv: { cruise: 25, zoneSpeed: [def.from - 40, def.to + 5, 5] }, z0: def.from - 262, v0: 25, tMax: 300 },
      { label: 'safe mode (no respawn helpers)', driver: 'jumper', drv: { cruise: 9 }, z0: def.from - 330, v0: 20, noRespawn: true },
    ];
    case 'rattlers': return [
      { label: 'straight', driver: 'patient', drv: { cruise: 24 }, units: 8 },
      { label: 'oil drops', driver: 'patient', drv: { cruise: 24 }, units: 8, oil: true },
    ];
    case 'pratt_jump': return [
      { label: 'chase 1★', driver: 'jumper', stars: 1, drv: { cruise: 30 }, z0: def.z - 700 },
      { label: 'cameo 0★', driver: 'jumper', stars: 0, drv: { cruise: 30 }, z0: def.z - 700 },
    ];
    case 'handover': {
      const sp = new Track(DATA.route, DATA.route.defaultSeed).sellPointPos();
      return [{ label: 'park', driver: 'lane', drv: { cruise: 20, u: Math.min(sp.u, 7.5), stopAt: sp.z }, stopAt: sp.z, untilT: 0, park: true }];
    }
    default: return base;
  }
}

let DATA;

async function mockSuite(data) {
  DATA = data;
  const seed = args.seed ? +args.seed : data.route.defaultSeed;
  const defs = data.route.setpieces.filter((d) => !ONLY || ONLY.includes(d.type));
  hr(`(a) mock sim — ${defs.length} set-pieces, seed ${seed}`);
  check('registry covers every route set-piece type', data.route.setpieces.every((d) => SETPIECE_TYPES[d.type]), data.route.setpieces.filter((d) => !SETPIECE_TYPES[d.type]).map((d) => d.type).join(','));
  const report = [];
  for (const def of defs) {
    for (const sc of scenarios(def)) {
      const o = { seed, ...sc };
      if (sc.laneWash) {
        const tr = new Track(data.route, seed), z = def.z, hw = tr.halfWidth(z);
        o.drv = { ...sc.drv, u: (def.side ?? 1) * hw / 2 }; o.u0 = o.drv.u;   // = structures.js axisU
      }
      if (sc.oil) {
        o.zones = (sim) => {
          if (sim.t > (sim._oilNext ?? 0) && sim.setpieces.state().some((s) => s.type === 'rattlers' && s.phase === 'riding')) { sim._oilNext = sim.t + 6; sim._oil = { kind: 'oil', x: sim.rv.x - Math.sin(sim.rv.yaw) * 10, z: sim.rv.z - Math.cos(sim.rv.yaw) * 10, r: 4, age: 0, until: sim.t + 6 }; }
          return sim._oil && sim.t < sim._oil.until ? [sim._oil] : [];
        };
      }
      if (sc.park) {
        o.untilT = 70;
        o.each = (sim) => { if (Math.abs(sim.rv.speed) < 0.3 && sim.rv.z > sc.stopAt - 20) sim.phase = 'won'; };
      }
      if (def.type === 'drawbridge') {
        o.each = (sim, ctx) => { const st = sim.setpieces.state().find((s) => s.type === 'drawbridge'); if (st) ctx.extra.maxAngle = Math.max(ctx.extra.maxAngle ?? 0, st.angle); };
      }
      if (def.type === 'tornado') {
        o.each = (sim, ctx) => {
          const st = sim.setpieces.state().find((s) => s.type === 'tornado');
          if (st) { ctx.extra.maxPull = Math.max(ctx.extra.maxPull || 0, st.pull); ctx.extra.minDist = Math.min(ctx.extra.minDist ?? 999, st.rvDist); ctx.extra.flying = Math.max(ctx.extra.flying || 0, st.flying); }
        };
      }
      const c = runScenario(data, def, o);
      const c2 = runScenario(data, def, o);   // determinism
      basicChecks(def, sc.label, c);
      check(`${def.type} [${sc.label}]: deterministic`, c.hash === c2.hash && Math.abs(c.t - c2.t) < 1e-9, `${c.hash} vs ${c2.hash}`);
      typeChecks(def, sc, c);
      report.push({ type: def.type, label: sc.label, t: r1(c.t), stop: r1(c.maxStop), dmg: r1(c.sim.log.damage), kinds: [...c.kinds].join(','), phases: c.events.map((e) => e.phase).join('→'), captions: [...new Set(c.captions)].slice(0, 4).join(' | '), stateB: c.stateBytes });
    }
  }
  // seeds: entity layout differs between seeds (rng is per seed)
  const fw = data.route.setpieces.find((d) => d.type === 'cattle_drive');
  if (fw && (!ONLY || ONLY.includes('cattle_drive'))) {
    const a = runScenario(data, fw, { seed: 1, driver: 'patient' }), b = runScenario(data, fw, { seed: 2, driver: 'patient' });
    check('different seeds → different set-piece layouts', a.hash !== b.hash);
  }
  console.log('\n  type                 scenario                      t(s)  stop  dmg   phases');
  for (const r of report) console.log(`  ${r.type.padEnd(20)} ${r.label.padEnd(28)} ${String(r.t).padStart(6)} ${String(r.stop).padStart(5)} ${String(r.dmg).padStart(5)}  ${r.phases}`);
  if (VERBOSE) for (const r of report) console.log(`    ${r.type} [${r.label}] kinds: ${r.kinds} · state ≤ ${r.stateB} B · ${r.captions}`);
}

function typeChecks(def, sc, c) {
  const sim = c.sim, T = def.type, tag = `${T} [${sc.label}]`;
  const phases = c.events.map((e) => e.phase);
  switch (T) {
    case 'freight_wagons':
      check(`${tag}: wagons rolled`, phases.includes('rolling') && c.kinds.has('freight_wagon'));
      break;
    case 'midnight_comet':
      check(`${tag}: comet + 6 cops`, c.kinds.has('comet_car') && c.kinds.has('cop'));
      check(`${tag}: redirectCops(${def.pullSeconds})`, sim.log.redirect && sim.log.redirect.s === def.pullSeconds);
      if (sim.log.redirect) { const p = sim.log.redirect.fn({ id: 1, x: 0, z: 0 }); check(`${tag}: redirect target finite`, p && Number.isFinite(p.x) && Number.isFinite(p.z)); }
      break;
    case 'parade':
      check(`${tag}: float + band`, c.kinds.has('parade_float') && c.kinds.has('band_member'));
      break;
    case 'drawbridge': {
      if (sc.label.startsWith('safe')) check(`${tag}: never a gap in safe mode`, !c.sawNull && c.maxSurface < 6 && (c.extra.maxAngle ?? 0) <= 0.2001, `max ${r1(c.maxSurface)}`);
      else check(`${tag}: leaves rose`, (c.extra.maxAngle ?? 0) > 0.25, `max angle ${c.extra.maxAngle}`);
      if (sc.label.startsWith('jumper')) check(`${tag}: real gap opened`, c.sawNull);
      if (sc.label.startsWith('slow')) check(`${tag}: slow RV fell in and was respawned`, sim.log.respawns > 0, `respawns ${sim.log.respawns}`);
      break;
    }
    case 'wide_load':
      check(`${tag}: house + escorts`, c.kinds.has('wide_load'));
      if (sc.label === 'patient') check(`${tag}: pulled over for the crawling RV`, phases.includes('pullover'));
      break;
    case 'car_carrier': {
      const st = sim.setpieces.state().find((s) => s.type === 'car_carrier');
      check(`${tag}: all 6 cars dropped`, c.events.length && (st ? st.cargo === 0 : true));
      check(`${tag}: dropped cars were airborne`, (c.maxY.sedan ?? 0) > 0.5 || (c.maxY.hatch ?? 0) > 0.5);
      break;
    }
    case 'toll_plaza':
      if (sc.stars >= 2) check(`${tag}: checkpoint set up`, phases.includes('checkpoint') && c.kinds.has('cop_officer'));
      else check(`${tag}: no checkpoint at 0★, no gate smashed`, !phases.includes('checkpoint') && !phases.includes('smashed'));
      break;
    case 'inflatable_gorilla':
      check(`${tag}: broke loose`, phases.includes('loose'));
      break;
    case 'car_wash':
      if (sc.label.includes('cops near')) check(`${tag}: cop watching → no drop`, sim.log.drops.length === 0 && phases.includes('copWatching'));
      else if (sc.label.includes('slow')) check(`${tag}: dropped a star`, sim.log.drops.length === 1 && phases.includes('clean'), sim.log.drops.join(','));
      else if (sc.label.includes('fast')) check(`${tag}: too fast → no drop`, sim.log.drops.length === 0 && phases.includes('tooFast'));
      else check(`${tag}: skipped → no drop`, sim.log.drops.length === 0);
      break;
    case 'cattle_drive':
      check(`${tag}: herd crossed`, phases.includes('crossing') && phases.includes('clear'));
      break;
    case 'combine':
      if (sc.label === 'patient') check(`${tag}: turned into the field`, phases.includes('turning') || phases.includes('field'));
      break;
    case 'log_spill':
      check(`${tag}: logs rolled + cleared`, phases.includes('spilling') && phases.includes('clear') && c.kinds.has('log'));
      break;
    case 'rattlers': {
      const st = c.sim.log;
      check(`${tag}: bikers rode with the RV`, phases.includes('riding') && c.kinds.has('chopper'));
      if (sc.oil) check(`${tag}: oil knocked bikers off`, c.events.some((e) => e.phase === 'crash'));
      else check(`${tag}: grabs capped at 2`, st.taken <= 2, `taken ${st.taken}`);
      break;
    }
    case 'tornado':
      check(`${tag}: crossed the road in front of the RV`, phases.includes('crossing'));
      check(`${tag}: funnel + flying cars`, c.kinds.has('tornado') && (c.extra.flying || 0) > 0, `flying ${c.extra.flying}`);
      check(`${tag}: suction felt`, (c.extra.maxPull || 0) > 0.15, `pull ${r1(c.extra.maxPull || 0)} min dist ${r1(c.extra.minDist ?? 999)} m`);
      check(`${tag}: survivable damage`, sim.log.damage < 70, `${r1(sim.log.damage)} hp`);
      check(`${tag}: cars reached 15+ m`, Math.max(c.maxY.sedan ?? 0, c.maxY.pickup ?? 0, c.maxY.hatch ?? 0) > 15);
      break;
    case 'stagecoach':
      check(`${tag}: coach bolted`, phases.includes('bolting') && c.kinds.has('stagecoach'));
      break;
    case 'pratt_jump':
      if (sc.stars >= 1) check(`${tag}: Pratt chased and fell`, phases.includes('chasing') && phases.includes('fallen'), phases.join('→'));
      else check(`${tag}: cameo`, phases.includes('cameo') && c.kinds.has('sgt_pratt'));
      break;
    case 'handover':
      check(`${tag}: arriving → checking → done`, phases.includes('arriving') && phases.includes('checking') && phases.includes('done'), phases.join('→'));
      break;
    default: break;
  }
}

// ── (b) real GameSim ─────────────────────────────────────────────────────────
async function realSuite(data) {
  const src = readFileSync(new URL('../../GameSim.js', import.meta.url), 'utf8');
  if (!/setpieces/.test(src)) { hr('(b) real GameSim — SKIPPED (host not wired yet)'); return; }
  const { GameSim } = await import('../../GameSim.js');
  const { Autopilot } = await import('../../autopilot.js');
  const seed = args.seed ? +args.seed : data.route.defaultSeed;
  hr(`(b) real GameSim + Autopilot through each set-piece zone (seed ${seed})`);
  const STARS = { midnight_comet: 1.5, toll_plaza: 2.4, pratt_jump: 1.5, rattlers: 0, car_wash: 1.5 };
  const rows = [];
  for (const def of data.route.setpieces) {
    if (ONLY && !ONLY.includes(def.type)) continue;
    const from = def.from ?? def.z, to = def.to ?? def.z;
    const sim = new GameSim(data, { seed, solo: true });
    if (sim.phase === 'garage') sim.applyDriverCommand({ type: 'skipTutorial' });
    let guard = 0;
    while (sim.phase !== 'drive' && guard++ < 2000) sim.step(null, DT);
    for (const s of sim.stops.stops) s.looted = true;     // the autopilot shouldn't go shopping here
    sim.inv.units = Math.max(sim.inv.units, 8);
    const z0 = Math.max(60, from - 480);
    sim.respawnAt(z0);
    sim.rv.grace = 0;
    if (STARS[def.type]) sim.heat.add(STARS[def.type]);
    const ap = new Autopilot(data, { seed });
    const errBefore = errors.length;
    const hp0 = sim.rv.hp;
    const ev = []; let maxStop = 0, stopT = 0;
    const endZ = def.type === 'handover' ? Infinity : to + 300;
    while (sim.t < 400 && sim.rv.z < endZ && sim.phase === 'drive') {
      const snap = sim.snapshot();
      for (const e of snap.events) if (e.type === EV.SETPIECE && e.id === def.id) ev.push(e.phase);
      sim.step(ap.update(snap), DT);
      if (Math.abs(sim.rv.speed) < 0.5) { stopT += DT; maxStop = Math.max(maxStop, stopT); } else if (Math.abs(sim.rv.speed) > 2) stopT = 0;
      if (stopT > 90) break;
    }
    const final = sim.snapshot();
    for (const e of final.events) if (e.type === EV.SETPIECE && e.id === def.id) ev.push(e.phase);
    const passed = def.type === 'handover' ? sim.phase === 'won' : sim.rv.z >= endZ;
    const perr = errors.slice(errBefore).filter((m) => /setpiece|\[sim\]/i.test(m));
    check(`real ${def.type}: autopilot gets past`, passed, `phase ${sim.phase} z=${r1(sim.rv.z)} t=${r1(sim.t)}`);
    check(`real ${def.type}: no plugin errors`, perr.length === 0, perr[0] || '');
    if (!QUIET_OK.has(def.type)) check(`real ${def.type}: EV.setpiece fired`, ev.length > 0);
    rows.push({ type: def.type, ok: passed, dmg: r1(hp0 - sim.rv.hp), stop: r1(maxStop), phases: ev.join('→'), end: sim.phase });
  }
  console.log('\n  type                 pass  dmg   stop  phases');
  for (const r of rows) console.log(`  ${r.type.padEnd(20)} ${r.ok ? 'yes ' : 'NO  '} ${String(r.dmg).padStart(5)} ${String(r.stop).padStart(5)}  ${r.phases}${r.end !== 'drive' ? ` [${r.end}]` : ''}`);

  if (args.full) {
    hr('(b) full game from the start (Autopilot, shops auto-completed)');
    const sim = new GameSim(data, { seed, solo: true });
    if (sim.phase === 'garage') sim.applyDriverCommand({ type: 'skipTutorial' });
    const ap = new Autopilot(data, { seed });
    const seen = new Map(), zoneT = new Map();
    while (sim.t < 4500 && sim.phase !== 'won' && sim.phase !== 'lost') {
      const snap = sim.snapshot();
      if (sim.phase === 'drive') for (const def of data.route.setpieces) {
        const a = (def.from ?? def.z) - 150, b = (def.to ?? def.z) + 100;
        if (sim.rv.z >= a && sim.rv.z <= b) zoneT.set(def.id, (zoneT.get(def.id) || 0) + DT);
      }
      for (const e of snap.events) if (e.type === EV.SETPIECE) { if (!seen.has(e.id)) seen.set(e.id, []); seen.get(e.id).push(e.phase); }
      if (snap.stop && snap.stop.state === 'shopping') sim.applyDriverCommand({ type: 'shopDone', stopId: snap.stop.id, score: 0.85 });
      sim.step(ap.update(snap), DT);
    }
    console.log(`  result: ${sim.phase} ${sim.lostReason || ''} at t=${r1(sim.t)} s, z=${r1(sim.rv.z)}`);
    for (const def of data.route.setpieces) console.log(`    ${def.id.padEnd(11)} ${String(r1(zoneT.get(def.id) || 0)).padStart(6)} s in zone  ${(seen.get(def.id) || ['—']).join('→')}`);
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
const data = await loadDataNode();
await mockSuite(data);
if (!args["no-real"] || args.full) await realSuite(data);
const fails = results.filter((r) => !r.ok);
console.error = origErr;
hr(`RESULT: ${results.length - fails.length}/${results.length} passed`);
if (fails.length) { for (const f of fails) console.log(`  FAIL ${f.name} — ${f.detail}`); process.exitCode = 1; }
