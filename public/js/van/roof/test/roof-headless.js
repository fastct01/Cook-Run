// ─────────────────────────────────────────────────────────────────────────────
// Node unit tests for sim/roof.js (Agent ROOF) against MockStopSim.
//   node public/js/van/roof/test/roof-headless.js
// a) hose cone hits a cop in the cone, misses one outside it (and one beyond range)
// b) entering rules + climb time + auto climb-down
// c) ammo: per-stop refill, oil bonus, empty → rejected, flare uses a smoke charge
// d) throws: firecracker stalls / balloon blinds / flare blinds in radius, after the flight time
// e) solo AI defends a scripted stop (3 cops at 6 m/s) vs a no-defence control
// f) determinism: same seed → identical state/event log; different seed → different
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MockStopSim } from '../mockStopSim.js';
import { RoofDefence, aimAt, hoseTest, rvToWorld, worldToRv, clampThrowTarget, throwFlightTime, ROOF_GEOM } from '../../../sim/roof.js';
import { CMD, EV } from '../../../shared/protocol.js';

const here = dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(readFileSync(join(here, '../../../data/rules.json'), 'utf8'));
const DT = 1 / 60;
let fails = 0, passes = 0;
const ok = (cond, msg, extra = '') => { if (cond) { passes++; console.log(`  ✓ ${msg}`); } else { fails++; console.log(`  ✗ ${msg} ${extra}`); } };
const run = (sim, sec) => { const n = Math.round(sec / DT); for (let i = 0; i < n; i++) sim.step(DT); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

console.log('Cook & Run — roof defence tests (sim/roof.js)\n');

// ── 0) frame helpers ────────────────────────────────────────────────────────
console.log('0) frames');
{
  const rv = { x: 12, z: 340, yaw: 0.4 };
  const w = rvToWorld(rv, 1.3, -2.2), l = worldToRv(rv, w.x, w.z);
  ok(near(l.x, 1.3) && near(l.z, -2.2), 'rvToWorld ∘ worldToRv = identity');
  const f = rvToWorld(rv, 0, 10);
  ok(near(f.x - rv.x, Math.sin(0.4) * 10) && near(f.z - rv.z, Math.cos(0.4) * 10), 'RV-local +Z is forward (sin yaw, cos yaw)');
  const c = clampThrowTarget(rv, rv.x + 80, rv.z), c2 = clampThrowTarget(rv, rv.x + 0.5, rv.z);
  ok(near(c.dist, 25, 1e-9) && near(c2.dist, 3, 1e-9), 'throw target clamped to 3..25 m', `${c.dist} ${c2.dist}`);
}

// ── a) hose cone ────────────────────────────────────────────────────────────
console.log('\na) hose cone');
{
  const sim = new MockStopSim(rules, { seed: 7, rv: { x: 0, z: 0, yaw: 0 } });
  sim.startStop(); run(sim, 0.7);
  const inCone = sim.addCop({ x: 0, z: -12 });                  // straight behind, 10 m from the nozzle
  const offCone = sim.addCop({ x: -8, z: -9 });                 // ~40° off the aim
  const far = sim.addCop({ x: 0.2, z: -24 });                   // in the cone but beyond range
  for (const c of sim.cops) c.maxSpeed = 0;                      // hold still
  sim.roof.command({ type: CMD.ROOF_ENTER });
  ok(sim.roof.active && sim.roof.climbDir === 1, 'roofEnter at a parked stop → climbing up');
  run(sim, 0.8);
  ok(!sim.roof.onRoof, 'still climbing after 0.8 s (climbSeconds 1.6)');
  run(sim, 0.9);
  ok(sim.roof.onRoof, 'on the roof after 1.7 s');
  const a = aimAt(sim.rv, 0, -12);
  const t1 = hoseTest(sim.rv, a.yaw, a.pitch, sim.cops[0], sim.roof.R.hose);
  const t2 = hoseTest(sim.rv, a.yaw, a.pitch, sim.cops[1], sim.roof.R.hose);
  const t3 = hoseTest(sim.rv, a.yaw, a.pitch, sim.cops[2], sim.roof.R.hose);
  ok(t1.hit && !t2.hit && !t3.hit, 'hoseTest: in-cone hit, off-cone miss, beyond-range miss', JSON.stringify([t1, t2, t3]));
  sim.events.length = 0;
  sim.roof.command({ type: CMD.ROOF_AIM, yaw: a.yaw, pitch: a.pitch, spray: true });
  run(sim, 0.3);
  const st = (id) => sim.cops.find((c) => c.id === id).state;
  ok(st(inCone) === 6, 'cop in the cone is soaked (state 6)');
  ok(st(offCone) === 1 && st(far) === 1, 'cop outside the cone and cop beyond range untouched');
  const hits = sim.events.filter((e) => e.type === EV.ROOF_HIT);
  ok(hits.length === 1 && hits[0].copId === inCone && hits[0].device === 'hose', 'exactly one roofHit (hose) event', JSON.stringify(hits));
  const c0 = sim.cops.find((c) => c.id === inCone);
  ok(c0.pvz < -0.5, 'hose push is away from the RV', `pvz ${c0.pvz}`);
  sim.roof.command({ type: CMD.ROOF_AIM, yaw: a.yaw, pitch: a.pitch, spray: false });
  run(sim, 3);
  ok(st(inCone) === 1, 'soak wears off after soakSeconds once the spray stops');
}

// ── b) enter / leave rules ───────────────────────────────────────────────────
console.log('\nb) entering, climbing, auto climb-down');
{
  const sim = new MockStopSim(rules, { seed: 3 });
  sim.rv.speed = 12;
  ok(!sim.roof.command({ type: CMD.ROOF_ENTER }) && !sim.roof.active, 'roofEnter rejected while driving at 12 m/s (no stop)');
  sim.rv.speed = 0.5;
  ok(sim.roof.command({ type: CMD.ROOF_ENTER }) && sim.roof.active, 'roofEnter accepted with the RV standing still (< 1 m/s), no stop');
  run(sim, 1.7);
  ok(sim.roof.onRoof && sim.roof.state().onRoof, 'up after climbSeconds');
  sim.rv.speed = 4;
  run(sim, 0.1);
  ok(sim.roof.climbDir === -1, 'RV faster than 3 m/s → auto climb-down');
  run(sim, 1.7);
  ok(!sim.roof.active, 'back inside after climbSeconds');
  const evs = sim.events.filter((e) => e.type === EV.ROOF).map((e) => e.on);
  ok(evs.join() === 'true,false', 'EV.ROOF on/off emitted', evs.join());

  const s2 = new MockStopSim(rules, { seed: 3 });
  s2.startStop(2); run(s2, 0.7);
  s2.roof.command({ type: CMD.ROOF_ENTER }); run(s2, 1.7);
  ok(s2.roof.onRoof && s2.roof.stopId === 'hardware', 'up at the stop');
  s2.roof.command({ type: CMD.ROOF_LEAVE }); run(s2, 0.1);
  ok(s2.roof.climbDir === -1, 'roofLeave → climbing down');
  s2.roof.command({ type: CMD.ROOF_ENTER });
  ok(s2.roof.climbDir === 1, 'roofEnter while climbing down turns around');
  run(s2, 2);
  ok(s2.roof.onRoof, 'up again');
  run(s2, 2 + 2 + 2.6 + 0.2);                         // shop 2 s → returning 2 s → loading 2.5 s → done
  ok(s2.roof.climbDir === -1 || !s2.roof.active, 'stop done → Doc auto-climbs down', JSON.stringify(s2.stopSnapshot()));
  s2.crew.cookDown = true;
  ok(!s2.roof.command({ type: CMD.ROOF_ENTER }), 'commands ignored while Doc is out cold');
}

// ── c) ammo ──────────────────────────────────────────────────────────────────
console.log('\nc) ammo');
{
  const sim = new MockStopSim(rules, { seed: 5, gadgets: { smoke: 1, oil: 3 } });
  sim.startStop(); run(sim, 0.7);
  const R = rules.roof;
  ok(sim.roof.ammo.firecracker === R.firecracker.ammo, `firecrackers refilled to ${R.firecracker.ammo}`);
  ok(sim.roof.ammo.balloon === R.balloon.ammo + 2, `balloons = ${R.balloon.ammo} + oil bonus (max +2)`, `${sim.roof.ammo.balloon}`);
  ok(sim.roof.state().ammo.flare === 1, 'flare ammo = smoke charges (1)');
  ok(!sim.roof.command({ type: CMD.ROOF_THROW, device: 'firecracker', x: 0, z: -15 }), 'throw rejected before Doc is on the roof');
  sim.roof.command({ type: CMD.ROOF_ENTER }); run(sim, 1.7);
  let n = 0;
  for (let i = 0; i < 5; i++) if (sim.roof.command({ type: CMD.ROOF_THROW, device: 'firecracker', x: 0, z: -15 })) n++;
  ok(n === R.firecracker.ammo && sim.roof.ammo.firecracker === 0, `${R.firecracker.ammo} firecrackers thrown, the rest rejected`, `${n}`);
  ok(sim.events.some((e) => e.type === 'msg' && /Out of firecrackers/.test(e.text)), 'empty → "Out of firecrackers!" toast');
  ok(sim.roof.command({ type: CMD.ROOF_THROW, device: 'flare', x: 5, z: -15 }) && sim.inv.gadgets.smoke === 0, 'flare consumes a smoke charge (useGadget)');
  ok(!sim.roof.command({ type: CMD.ROOF_THROW, device: 'flare', x: 5, z: -15 }), 'second flare rejected (no smoke left)');
  ok(!sim.roof.command({ type: CMD.ROOF_THROW, device: 'bazooka', x: 5, z: -15 }), 'unknown device rejected');
  // next stop → refill
  sim.roof.command({ type: CMD.ROOF_LEAVE }); run(sim, 2);
  sim.leaveStop(); run(sim, 0.2);
  sim.stopDef = { ...sim.stopDef, id: 'market' };
  sim.startStop(); run(sim, 0.7);
  ok(sim.roof.ammo.firecracker === R.firecracker.ammo, 'next stop refills the firecrackers');
}

// ── d) throws ────────────────────────────────────────────────────────────────
console.log('\nd) throw effects');
{
  const sim = new MockStopSim(rules, { seed: 9, gadgets: { smoke: 2 } });
  sim.startStop(); run(sim, 0.7);
  sim.roof.command({ type: CMD.ROOF_ENTER }); run(sim, 1.7);
  const a = sim.addCop({ x: 3, z: -18 }), b = sim.addCop({ x: -3, z: -20 }), far = sim.addCop({ x: 20, z: -20 });
  for (const c of sim.cops) c.maxSpeed = 0;
  sim.events.length = 0;
  sim.roof.command({ type: CMD.ROOF_THROW, device: 'firecracker', x: 0, z: -19 });
  const T = throwFlightTime(19);
  run(sim, T * 0.5);
  ok(sim.cops.every((c) => c.state === 1), 'nothing happens mid-flight');
  ok(sim.roof.state().fx.some((f) => f.phase === 'fly' && f.device === 'firecracker'), 'state().fx shows the projectile in flight');
  run(sim, T * 0.5 + 0.05);
  const S = (id) => sim.cops.find((c) => c.id === id).state;
  ok(S(a) === 7 && S(b) === 7 && S(far) === 1, 'firecracker stalls both cops within 6 m, not the far one');
  ok(sim.events.filter((e) => e.type === EV.ROOF_HIT && e.device === 'firecracker').length === 2, 'two roofHit (firecracker) events');
  run(sim, 3.2);
  sim.roof.command({ type: CMD.ROOF_THROW, device: 'balloon', x: 3, z: -18 });
  run(sim, throwFlightTime(18.3) + 0.05);
  ok(S(a) === 8 && S(b) === 1, 'paint balloon (2.5 m) blinds only the cop it lands on');
  sim.roof.command({ type: CMD.ROOF_THROW, device: 'flare', x: 18, z: -18 });
  run(sim, throwFlightTime(25) + 0.1);
  ok(S(far) === 8, 'smoke flare blinds the cop inside its 9 m cloud');
  run(sim, 4);
  ok(S(far) === 8, '…and keeps it blind while the flare burns');
  run(sim, rules.roof.flare.seconds + FLARE_SLACK());
  ok(S(far) === 1, 'flare burns out after flare.seconds');
}
function FLARE_SLACK() { return 1.6; }

// ── e) solo AI scenario ──────────────────────────────────────────────────────
// Rook shops for 30 s, then returning (2 s) and loading (2.5 s, paused while an ACTIVE cop is inside the
// 25 m lot ring). Three cops drive at the RV at 6 m/s from behind, ahead and across the lot, and keep
// coming back. The hose only reaches 15 m, so "keeping cops out of 25 m" means: every cop that enters the
// 25 m ring is neutralised (soaked/stalled/blinded) within a few seconds, so loading can finish, and no cop
// ever stays close enough to bust the RV (7.5 m for 2.5 s). Stats are taken while the stop is on.
console.log('\ne) solo AI defends a stop (3 cops approaching at 6 m/s)');
function scenario({ seed = 11, solo = true, maxSeconds = 60 } = {}) {
  const sim = new MockStopSim(rules, { seed, solo, rv: { x: 0, z: 0, yaw: 0 }, copSpeed: 6 });
  sim.startStop(30);
  sim.addCop({ x: 1.5, z: -62 });               // up the road behind
  sim.addCop({ x: -2.0, z: 70 });               // from ahead
  sim.addCop({ x: -48, z: -40 });               // across the lot
  const log = [];
  let firstUp = null;
  const n = Math.round(maxSeconds / DT);
  for (let i = 0; i < n && sim.stats.doneAt == null; i++) {
    sim.step(DT);
    if (firstUp == null && sim.roof.onRoof) firstUp = sim.t;
    if (i % 30 === 0) log.push(JSON.stringify([+sim.t.toFixed(3), sim.roof.state(), sim.cops.map((c) => [c.x, c.z, c.state])]));
  }
  return { sim, firstUp, log, events: sim.events.map((e) => JSON.stringify(e)) };
}
{
  const r = scenario();
  const S = r.sim.stats;
  const pct = (v, t) => `${(v / t * 100).toFixed(0)}%`;
  console.log(`     AI: up at ${r.firstUp?.toFixed(2)} s · loaded at ${S.doneAt?.toFixed(1)} s (35.1 s earliest) · busts ${S.bustsAtStop} · closest active cop ${S.minActive.toFixed(1)} m · longest a cop stayed active inside 25 m ${S.maxCopRun.toFixed(2)} s · an active cop inside 25 m ${pct(S.activeInside, S.stopT)} of the stop · hose hits ${r.sim.roof.stats.hoseHits} · throws ${r.sim.roof.stats.throws}`);
  const ctl = scenario({ solo: false });
  const C = ctl.sim.stats;
  console.log(`     no defence: loaded ${C.doneAt == null ? 'never' : C.doneAt.toFixed(1)} · busts ${C.bustsAtStop} · closest ${C.minActive.toFixed(1)} m · longest a cop stayed inside 25 m ${C.maxCopRun.toFixed(1)} s · an active cop inside 25 m ${pct(C.activeInside, C.stopT)}`);
  ok(r.firstUp != null && r.firstUp < 0.6 + 0.8 + 1.6 + 0.1, 'AI climbs up by itself ~0.8 s after the stop parks');
  ok(S.bustsAtStop === 0, 'no bust while the AI defends');
  ok(S.maxCopRun < 4, 'every cop entering the 25 m lot ring is neutralised within 4 s', `${S.maxCopRun}`);
  ok(S.doneAt != null && S.doneAt < 55, 'loading finishes (the ring gets cleared)', `${S.doneAt}`);
  ok(C.bustsAtStop > 0 && C.doneAt == null && C.minActive < 6, 'control (no AI): cops park next to the RV, bust it and block loading forever');
  ok(r.sim.roof.stats.throws > 0 && r.sim.roof.stats.hoseHits > 3, 'AI used the hose and threw something');
  ok(r.sim.events.some((e) => e.type === EV.ROOF_HIT && e.device === 'firecracker'), 'AI firecracker hit (2+ cops within 20 m)');
  let worst = 0, busts = 0, unloaded = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const x = scenario({ seed }).sim.stats;
    worst = Math.max(worst, x.maxCopRun); busts += x.bustsAtStop; if (x.doneAt == null) unloaded++;
  }
  ok(busts === 0 && unloaded === 0 && worst < 4, `12 seeds: 0 busts, all loaded, worst unanswered cop ${worst.toFixed(2)} s`, `${busts} ${unloaded}`);

  // f) determinism
  console.log('\nf) determinism');
  const r2 = scenario();
  ok(r.log.join('\n') === r2.log.join('\n') && r.events.join('\n') === r2.events.join('\n'), 'same seed → identical state + event log');
  const r3 = scenario({ seed: 12 });
  ok(r.log.join('\n') !== r3.log.join('\n'), 'different seed → different AI aim errors');
  let usesRandom = false;
  const orig = Math.random;
  Math.random = () => { usesRandom = true; return orig(); };
  scenario({ maxSeconds: 5 });
  Math.random = orig;
  ok(!usesRandom, 'never calls Math.random');
}

// ── g) robustness against a bare sim (stub-like) ─────────────────────────────
console.log('\ng) robustness');
{
  const bare = { rv: { x: 0, z: 0, yaw: 0, speed: 0 }, phase: 'drive', rules };
  const r = new RoofDefence(bare);
  r.update(DT); r.command({ type: CMD.ROOF_ENTER }); for (let i = 0; i < 120; i++) r.update(DT);
  r.command({ type: CMD.ROOF_AIM, yaw: 1, pitch: -0.2, spray: true }); r.update(DT);
  r.command({ type: CMD.ROOF_THROW, device: 'firecracker', x: 4, z: 9 }); for (let i = 0; i < 120; i++) r.update(DT);
  const s = r.state();
  ok(s.onRoof && s.ammo.firecracker === rules.roof.firecracker.ammo - 1, 'works on a sim without the helper API (no throw)');
  ok(JSON.stringify(s) === JSON.stringify(JSON.parse(JSON.stringify(s))), 'state() is plain JSON');
  void ROOF_GEOM;
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
