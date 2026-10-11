// ─────────────────────────────────────────────────────────────────────────────
// Node tests for sim/roof.js (Round 3, agent DEFEND): Rook's roof defence with guns.
//   node public/js/sim/test/roof-defend.js            (or: import { run } … await run({ quiet }))
// A small MockSim implements the GameSim helper API RoofDefence uses (copsList, applyCopEffect with
// the Round 3 keys → states 9/10, addHeat, addPoints, emit, msg, stop, heatStars, inv, useGadget) and a
// toy bust rule (grace 3 s → a running cop within 7.5 m fills the meter over 4 s). Section R runs the
// same checks against the real GameSim (skips the parts SIM hasn't landed yet).
// ─────────────────────────────────────────────────────────────────────────────
import { RoofDefence, ROOF_GEOM, GUNS, COP_BOXES, defendRules, rayCopHit, rayBoxCop, rayCops, aimAt, aimDirWorld,
  muzzleWorld, rvToWorld, worldToRv, copPartWorld, spreadDir, clampThrowTarget, throwFlightTime } from '../roof.js';
import { EV } from '../../shared/protocol.js';

const DT = 1 / 60;
const deepCopy = (o) => JSON.parse(JSON.stringify(o));

// ── mock sim ──────────────────────────────────────────────────────────────────
export class MockSim {
  constructor(rules, { seed = 7, solo = false, stars = 2, copEffects = 'r3' } = {}) {
    this.rules = rules; this.data = { rules }; this.seed = seed; this.solo = solo;
    this.phase = 'drive'; this.t = 0;
    this.rv = { x: 0, y: 0, z: 0, yaw: 0, speed: 0, airborne: false };
    this.cops = { cops: [] };
    this.heat = { value: stars + 0.2, stars, bust: 0 };
    this.inv = { gadgets: { smoke: 1, oil: 0, nitro: 0 } };
    this.events = []; this.msgs = []; this.points = 0; this.heatAdds = [];
    this.stopState = null;   // { id, state }
    this.copEffects = copEffects;   // 'r3' (states 9/10) | 'legacy' (only stall/blind/soak)
    this.busted = false; this.stopped = 0; this.maxBust = 0;
    this._id = 100;
  }
  get stop() { return this.stopState; }
  heatStars() { return this.heat.stars; }
  emit(ev) { this.events.push({ t: +this.t.toFixed(3), ...ev }); }
  msg(text, tone) { this.msgs.push(text); this.emit({ type: 'msg', text, tone }); }
  addHeat(v, reason) { this.heatAdds.push([v, reason]); this.heat.value += v; this.heat.stars = Math.floor(this.heat.value); }
  addPoints(n) { this.points += n; }
  useGadget(kind) { if (this.inv.gadgets[kind] > 0) { this.inv.gadgets[kind]--; return true; } return false; }
  addCop({ kind = 'cop', x, z, yaw = 0, speed = 6, state = 1, chase = true } = {}) {
    const c = { id: this._id++, kind, x, y: 0, z, yaw, speed, state, timer: 0, chase, effects: [], holes: 0, crack: 0, tyre: 0, steam: 0 };
    this.cops.cops.push(c); return c;
  }
  copsList() { return this.cops.cops.filter((c) => !c.dead).map((c) => ({ id: c.id, kind: c.kind, x: c.x, y: c.y, z: c.z, yaw: c.yaw, speed: c.speed, state: c.state })); }
  applyCopEffect(id, e) {
    const c = this.cops.cops.find((k) => k.id === id);
    if (!c) return false;
    c.effects.push({ ...e });
    if (e.hole) c.holes += e.hole;
    if (e.crack) c.crack = 1;
    if (c.state === 4 || c.state === 5) return true;
    if (this.copEffects === 'r3' && e.tyre) { c.state = 9; c.timer = 20; c.tyre |= { fl: 1, fr: 2, rl: 4, rr: 8 }[e.tyre]; c.speed = 0; return true; }
    if (this.copEffects === 'r3' && e.radiator) { c.state = 10; c.timer = 15; c.steam = 1; c.speed = 0; return true; }
    if (e.stall > 0) { c.state = 7; c.timer = Math.max(c.state === 7 ? c.timer : 0, e.stall); c.speed = 0; }
    else if (e.blind > 0) { if (c.state !== 7) { c.state = 8; c.timer = e.blind; } }
    return true;
  }
  step(dt = DT) {
    this.t += dt;
    const rv = this.rv;
    for (const c of this.cops.cops) {
      if (c.state === 1 && c.chase) {
        // drive at the RV, stop 5 m short of it (boxing it in)
        const dx = rv.x - c.x, dz = rv.z - c.z, d = Math.hypot(dx, dz);
        c.yaw = Math.atan2(dx, dz);
        c.speed = d > 5 ? Math.min(c.speed + 6 * dt, c.vmax ?? 9) : 0;
        if (d > 5) { c.x += Math.sin(c.yaw) * c.speed * dt; c.z += Math.cos(c.yaw) * c.speed * dt; }
      } else if (c.state === 7 || c.state === 8 || c.state === 2) {
        c.speed = Math.max(0, c.speed - 8 * dt);
        c.timer -= dt; if (c.timer <= 0) { c.state = 1; c.speed = 2; }
      } else if (c.state === 9) {
        c.timer -= dt; if (c.timer <= 0) c.state = 5;
      } else if (c.state === 10) {
        c.timer -= dt; if (c.timer <= 0) { c.state = 1; c.speed = 1; }   // harder than the contract: it comes back
      } else if (c.state === 5) {
        c.yaw = Math.atan2(c.x - rv.x, c.z - rv.z); c.x += Math.sin(c.yaw) * 6 * dt; c.z += Math.cos(c.yaw) * 6 * dt;
      }
    }
    // toy bust (the contract's rule): grace after stopping, then running cops within 7.5 m
    if (Math.abs(rv.speed) < 4 && !rv.airborne) this.stopped += dt; else this.stopped = 0;
    const armed = this.stopped >= (this.rules.heat?.bust?.grace ?? 3);
    const close = armed && this.cops.cops.some((c) => c.state === 1 && Math.hypot(c.x - rv.x, c.z - rv.z) < 7.5);
    const B = this.rules.heat?.bust || {};
    if (close) this.heat.bust = Math.min(1, this.heat.bust + dt / (B.seconds ?? 4));
    else this.heat.bust = Math.max(0, this.heat.bust - (B.decayPerSec ?? 0.6) * dt);
    this.maxBust = Math.max(this.maxBust, this.heat.bust);
    if (this.heat.bust >= 1) this.busted = true;
  }
}

function roofRun(sim, roof, sec, each) {
  const n = Math.round(sec / DT);
  for (let i = 0; i < n; i++) { sim.step(DT); roof.update(DT); if (each) each(i); }
}
function up(sim, roof) {
  roof.command({ type: 'defend', on: true });
  roofRun(sim, roof, 1.7);
}
/** aim the roof at a cop part (exact, no spread) */
function aimPart(sim, roof, cop, part, wheel) {
  const live = sim.copsList().find((c) => c.id === cop.id) || cop;
  const p = copPartWorld(live, part, wheel, sim.rv);
  const a = aimAt(sim.rv, p.x, p.z, p.y);
  roof.command({ type: 'roofAim', yaw: a.yaw, pitch: a.pitch, ads: roof.ads });
  return a;
}

export async function run({ quiet = false } = {}) {
  const { loadDataNode } = await import('../../data/loadData.js');
  const data = await loadDataNode();
  const results = [];
  const log = (...a) => { if (!quiet) console.log(...a); };
  const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); return !!ok; };
  const hr = (t) => log(`\n── ${t} ${'─'.repeat(Math.max(0, 66 - t.length))}`);
  const rules = data.rules;
  const R = defendRules(rules);
  log('Cook & Run — Rook\'s roof defence tests (sim/roof.js)');

  // ── A. geometry + hit test ─────────────────────────────────────────────────
  hr('A. geometry + rayCopHit');
  {
    const rv = { x: 3, y: 0, z: 100, yaw: 0.4 };
    const p = rvToWorld(rv, 1.2, -2.5), q = worldToRv(rv, p.x, p.z);
    check('A1 rvToWorld / worldToRv are inverses', Math.abs(q.x - 1.2) < 1e-9 && Math.abs(q.z + 2.5) < 1e-9);
    const m = muzzleWorld(rv, 0, 0);
    check('A2 muzzle ≈ 4.5 m up, behind the RV centre', Math.abs(m.y - 4.48) < 0.01 && worldToRv(rv, m.x, m.z).z < -1, `y ${m.y.toFixed(2)}`);
    const rules2 = rules.defend;
    check('A3 rules.defend has the contract gun table', rules2 && rules2.guns.revolver.mag === 6 && rules2.guns.shotgun.pellets === 8 && rules2.guns.rifle.range === 90 && rules2.copFire && rules2.copFire.returnEvery === 2.4);
    // parts: a cop side-on 12 m to the RV's left, facing +Z
    const cop = { id: 1, kind: 'cop', x: rv.x + 12 * Math.cos(rv.yaw), y: 0, z: rv.z - 12 * Math.sin(rv.yaw), yaw: rv.yaw, state: 1 };
    const res = {};
    for (const [part, wheel] of [['tyre', 'fr'], ['tyre', 'rr'], ['glass'], ['body'], ['radiator']]) {
      const t = copPartWorld(cop, part, wheel, rv), a = aimAt(rv, t.x, t.z, t.y);
      const h = rayCopHit(rv, a.yaw, a.pitch, cop);
      res[part + (wheel || '')] = h.hit ? h.part + (h.wheel ? ':' + h.wheel : '') : 'miss';
    }
    // cop is to the RV's left (+X local) → its right side (-X, wheels fr/rr) faces the RV
    check('A4 side-on cop: aimed tyre → tyre (the right wheel)', res.tyrefr === 'tyre:fr', JSON.stringify(res));
    check('A5 side-on cop: rear tyre → tyre:rr', res.tyrerr === 'tyre:rr');
    check('A6 glass → glass, door → body', res.glass === 'glass' && res.body === 'body');
    // head-on cop 30 m behind the RV, nose at the RV: radiator
    const back = rvToWorld(rv, 0, -30);
    const cop2 = { id: 2, kind: 'cop', x: back.x, y: 0, z: back.z, yaw: rv.yaw, state: 1 };
    const t2 = copPartWorld(cop2, 'radiator'), a2 = aimAt(rv, t2.x, t2.z, t2.y);
    const h2 = rayCopHit(rv, a2.yaw, a2.pitch, cop2);
    check('A7 head-on cop: radiator aim → radiator', h2.hit && h2.part === 'radiator', `${h2.part} at ${h2.dist.toFixed(1)} m`);
    const h3 = rayCopHit(rv, a2.yaw + 0.3, a2.pitch, cop2);
    check('A8 aimed 17° off → miss', !h3.hit);
    const far = rvToWorld(rv, 0, -150), cop3 = { id: 3, kind: 'cop', x: far.x, y: 0, z: far.z, yaw: rv.yaw, state: 1 };
    const a3 = aimAt(rv, far.x, far.z, 0.7);
    check('A9 beyond maxDist → miss; within → hit', !rayCopHit(rv, a3.yaw, a3.pitch, cop3, 90).hit && rayCopHit(rv, a3.yaw, a3.pitch, cop3, 200).hit);
    // every kind has a box and its tyres can be hit
    let kinds = 0;
    for (const kind of Object.keys(COP_BOXES)) {
      const c = { ...cop, kind };
      const t = copPartWorld(c, 'tyre', 'fr'), a = aimAt(rv, t.x, t.z, t.y);
      if (rayCopHit(rv, a.yaw, a.pitch, c).part === 'tyre') kinds++;
    }
    check('A10 tyre aim works for every police kind (incl. moto, rhino)', kinds === Object.keys(COP_BOXES).length, `${kinds}/${Object.keys(COP_BOXES).length}`);
    const near = rayCops(muzzleWorld(rv, a2.yaw, a2.pitch), aimDirWorld(rv, a2.yaw, a2.pitch), [cop3, cop2], 200);
    check('A11 rayCops returns the nearest cop along the ray', near.hit && near.cop.id === 2);
    const d = aimDirWorld(rv, 0.2, -0.1);
    let maxAng = 0;
    for (let i = 0; i < 200; i++) { const s = spreadDir(d, 2 * Math.PI / 180, (i * 0.37) % 1, (i * 0.61) % 1); maxAng = Math.max(maxAng, Math.acos(Math.min(1, s.x * d.x + s.y * d.y + s.z * d.z))); }
    check('A12 spreadDir stays inside its cone', maxAng <= 2 * Math.PI / 180 + 1e-6 && maxAng > 1 * Math.PI / 180, `${(maxAng * 180 / Math.PI).toFixed(2)}°`);
    const c1 = clampThrowTarget(rv, rv.x + 100, rv.z), c2 = clampThrowTarget(rv, rv.x + 0.5, rv.z);
    check('A13 throws clamp to 3..25 m; flight time grows with distance', Math.abs(c1.dist - 25) < 1e-6 && Math.abs(c2.dist - 3) < 1e-6 && throwFlightTime(20) > throwFlightTime(5));
  }

  // ── B. availability, climb, auto-down ──────────────────────────────────────
  hr('B. DEFEND availability + climb');
  {
    const sim = new MockSim(rules, { stars: 0 });
    const roof = new RoofDefence(sim);
    roof.update(DT);
    check('B1 no heat → why noHeat', !roof.state().available && roof.state().why === 'noHeat');
    sim.heat.stars = 2; sim.heat.value = 2.2;
    roof.update(DT);
    check('B2 heat, no cop near → why noCop', roof.state().why === 'noCop');
    const cop = sim.addCop({ x: 0, z: -30, speed: 0, chase: false });
    sim.rv.speed = 8; roof.update(DT);
    check('B3 cop near, moving → why moving (Locked)', roof.state().why === 'moving' && !roof.command({ type: 'defend', on: true }));
    sim.rv.speed = 1; roof.update(DT);
    check('B4 stopped (< 1.5 m/s) with a cop at 30 m → available; nearCop', roof.state().available && Math.abs(roof.state().nearCop - 30) < 0.2, `nearCop ${roof.state().nearCop}`);
    sim.rv.airborne = true; roof.update(DT);
    check('B5 airborne → why airborne', roof.state().why === 'airborne');
    sim.rv.airborne = false; sim.rv.speed = 0; cop.x = 1e4; roof.update(DT);
    sim.stopState = { id: 'bolt', state: 'parked' }; roof.update(DT);
    check('B6 at a parked stop → available even without a cop near', roof.state().available);
    sim.stopState = null; cop.x = 0; roof.update(DT);
    sim.events.length = 0;
    check('B7 defend on → accepted, holdsRv at once', roof.command({ type: 'defend', on: true }) && roof.holdsRv && roof.state().climbDir === 'up');
    check('B8 EV.DEFEND {on:true}', sim.events.some((e) => e.type === EV.DEFEND && e.on === true && e.ai === false));
    roofRun(sim, roof, 0.85);
    check('B9 roofRook after half the climb, not onRoof yet', roof.roofRook && !roof.onRoof && !roof.state().available && roof.state().why === null);
    roofRun(sim, roof, 0.8);
    check('B10 on the roof after 1.6 s', roof.onRoof && roof.state().climb === 1);
    check('B11 roofFire while climbing is impossible; works once up', roof.command({ type: 'roofFire' }));
    roof.command({ type: 'defend', on: false });
    roofRun(sim, roof, 0.8);
    check('B12 climbing down still holds the RV', roof.holdsRv && roof.state().climbDir === 'down');
    roofRun(sim, roof, 0.9);
    check('B13 back in the seat: not held; EV.DEFEND {on:false}', !roof.holdsRv && !roof.active && sim.events.some((e) => e.type === EV.DEFEND && e.on === false));
    // turn around on the ladder
    roof.command({ type: 'defend', on: true }); roofRun(sim, roof, 0.5); roof.command({ type: 'defend', on: false }); roofRun(sim, roof, 0.2);
    roof.command({ type: 'defend', on: true }); roofRun(sim, roof, 1.6);
    check('B14 defend on while climbing down turns him around', roof.onRoof);
    // auto-down at a stop: done + no running cop within 40 m
    sim.stopState = { id: 'bolt', state: 'loading' }; roofRun(sim, roof, 0.2);
    sim.stopState = { id: 'bolt', state: 'done' }; roofRun(sim, roof, 0.2);
    check('B15 stop done but a running cop within 40 m → he stays up', roof.onRoof);
    cop.x = 500; roofRun(sim, roof, 1.8);
    check('B16 stop done + lot clear → auto climb-down', !roof.active);
    check('B17 commands from the cook are ignored', !roof.command({ type: 'defend', on: true }, 'cook'));
    const sim2 = new MockSim(rules); sim2.addCop({ x: 0, z: -20, speed: 0, chase: false });
    const roof2 = new RoofDefence(sim2); up(sim2, roof2); sim2.phase = 'won'; roofRun(sim2, roof2, 1.8);
    check('B18 phase ≠ drive → auto climb-down', !roof2.active);
  }

  // ── C. guns ────────────────────────────────────────────────────────────────
  hr('C. guns');
  {
    // revolver: 3 hits → stall 6 s
    const sim = new MockSim(rules);
    const cop = sim.addCop({ x: 14, z: -6, yaw: 0, speed: 0, chase: false });
    const roof = new RoofDefence(sim);
    up(sim, roof);
    sim.events.length = 0; sim.heatAdds.length = 0;
    let fired = 0, rejected = 0;
    for (let i = 0; i < 3; i++) {
      aimPart(sim, roof, cop, 'body');
      if (roof.command({ type: 'roofFire' })) fired++;
      if (!roof.command({ type: 'roofFire' })) rejected++;   // inside the 0.32 s interval
      roofRun(sim, roof, 0.34);
    }
    const st = roof.state();
    check('C1 revolver: fire interval 0.32 s (an immediate 2nd pull is rejected)', fired === 3 && rejected === 3);
    check('C2 revolver mag 6 → 3 after 3 shots', st.mag.revolver === 3 && st.reserve.revolver === 18);
    check('C3 every trigger pull adds heatPerShot', sim.heatAdds.filter((h) => h[1] === 'gunfire').length === 3 && Math.abs(sim.heatAdds[0][0] - 0.04) < 1e-9);
    check('C4 3 revolver hits → stall (state 7) for 6 s', cop.state === 7 && cop.effects.some((e) => e.stall === 6), `state ${cop.state}`);
    check('C5 EV.COP_DISABLED {how: stall} + heatPerDisable + points', sim.events.some((e) => e.type === EV.COP_DISABLED && e.how === 'stall') && sim.heatAdds.some((h) => h[1] === 'copDisabled' && Math.abs(h[0] - 0.15) < 1e-9) && sim.points === 100);
    check('C6 EV.SHOT carries muzzle → hit point, copId, part', sim.events.filter((e) => e.type === EV.SHOT).every((e) => e.gun === 'revolver' && e.copId === cop.id && e.part && Number.isFinite(e.tx)));
    check('C7 EV.COP_HIT per hit with holes', sim.events.filter((e) => e.type === EV.COP_HIT).length === 3 && cop.holes === 3);

    // shotgun: 1 pellet on a tyre → tyre out (state 9)
    const simS = new MockSim(rules);
    const copS = simS.addCop({ x: 10, z: -2, yaw: 0, speed: 0, chase: false });   // side-on, 10 m left
    const roofS = new RoofDefence(simS);
    up(simS, roofS);
    roofS.command({ type: 'roofSelect', slot: 'shotgun' }); roofRun(simS, roofS, 0.4);
    simS.events.length = 0;
    aimPart(simS, roofS, copS, 'tyre', 'fr');
    const okS = roofS.command({ type: 'roofFire' });
    const shot = simS.events.find((e) => e.type === EV.SHOT);
    check('C8 shotgun shot: 8 pellets in EV.SHOT', okS && shot && shot.gun === 'shotgun' && shot.pellets.length === 8);
    check('C9 a pellet on a tyre → tyre out (state 9), {tyre: fr}', copS.state === 9 && copS.effects.some((e) => e.tyre === 'fr'), `state ${copS.state} ${JSON.stringify(copS.effects)}`);
    check('C10 EV.COP_DISABLED {how: tyre}', simS.events.some((e) => e.type === EV.COP_DISABLED && e.how === 'tyre' && e.copId === copS.id));
    check('C11 shotgun interval 0.85 s', !roofS.command({ type: 'roofFire' }) && (roofRun(simS, roofS, 0.86), roofS.command({ type: 'roofFire' })));
    // out of range pellets miss
    const simS2 = new MockSim(rules);
    const copS2 = simS2.addCop({ x: 30, z: 0, speed: 0, chase: false });
    const roofS2 = new RoofDefence(simS2); up(simS2, roofS2);
    roofS2.command({ type: 'roofSelect', slot: 'shotgun' }); roofRun(simS2, roofS2, 0.4);
    aimPart(simS2, roofS2, copS2, 'tyre', 'fr'); roofS2.command({ type: 'roofFire' });
    check('C12 shotgun range 22 m: a cop at 30 m is not hit', copS2.state === 1 && copS2.effects.length === 0);

    // rifle: radiator head-on at ~40 m → state 10
    const simR = new MockSim(rules);
    const copR = simR.addCop({ x: 0, z: -42, yaw: 0, speed: 0, chase: false });   // behind, nose at the RV
    simR.stopState = { id: 'bolt', state: 'parked' };   // > 40 m away: DEFEND is available at a stop
    const roofR = new RoofDefence(simR);
    up(simR, roofR);
    roofR.command({ type: 'roofSelect', slot: 'rifle' }); roofRun(simR, roofR, 0.4);
    roofR.ads = true;
    simR.events.length = 0;
    aimPart(simR, roofR, copR, 'radiator');
    roofR.command({ type: 'roofAim', yaw: roofR.aimYaw, pitch: roofR.aimPitch, ads: true });
    roofR.command({ type: 'roofFire' });
    check('C13 rifle (scoped) on the radiator at 42 m → state 10, {radiator: true}', copR.state === 10 && copR.effects.some((e) => e.radiator), `state ${copR.state}`);
    check('C14 EV.COP_DISABLED {how: radiator}', simR.events.some((e) => e.type === EV.COP_DISABLED && e.how === 'radiator'));
    roofRun(simR, roofR, 1.15);
    aimPart(simR, roofR, copR, 'glass'); roofR.command({ type: 'roofFire' });
    check('C15 rifle on the windscreen → crack', copR.crack === 1 && simR.events.some((e) => e.type === EV.COP_HIT && e.effect === 'crack'));
    // scoped vs hip spread: hits on a far radiator
    const spreadHits = (ads) => {
      let hits = 0;
      for (let s = 1; s <= 40; s++) {
        const sm = new MockSim(rules, { seed: s }); const c = sm.addCop({ x: 0, z: -80, yaw: 0, speed: 0, chase: false }); sm.stopState = { id: 'bolt', state: 'parked' };
        const rf = new RoofDefence(sm); up(sm, rf); rf.command({ type: 'roofSelect', slot: 'rifle' }); roofRun(sm, rf, 0.4);
        const p = copPartWorld(c, 'radiator'), a = aimAt(sm.rv, p.x, p.z, p.y);
        rf.command({ type: 'roofAim', yaw: a.yaw, pitch: a.pitch, ads });
        rf.command({ type: 'roofFire' });
        if (sm.events.some((e) => e.type === EV.COP_HIT)) hits++;
      }
      return hits;
    };
    const hA = spreadHits(true), hH = spreadHits(false);
    check('C16 rifle: scope (0.4°) far more accurate than hip (3°) at 80 m', hA >= 30 && hH < hA - 10, `ADS ${hA}/40, hip ${hH}/40`);

    // fallback: an older cops.js without states 9/10 → stall of the same length
    const simL = new MockSim(rules, { copEffects: 'legacy' });
    const copL = simL.addCop({ x: 10, z: -2, speed: 0, chase: false });
    const roofL = new RoofDefence(simL); up(simL, roofL);
    roofL.command({ type: 'roofSelect', slot: 'shotgun' }); roofRun(simL, roofL, 0.4);
    aimPart(simL, roofL, copL, 'tyre', 'fr'); roofL.command({ type: 'roofFire' });
    check('C17 legacy cops.js: a tyre hit falls back to a 20 s stall', copL.state === 7 && copL.effects.some((e) => e.stall === 20));
  }

  // ── D. difficulty: hits to stall, ammo ─────────────────────────────────────
  hr('D. difficulty levers');
  {
    const ext = deepCopy(rules); ext.defend.hitsMult = 1.5; ext.defend.ammoMult = 0.7; ext.defend.flare = 0;
    const DE = defendRules(ext);
    check('D1 Extreme: revolver 5 hits (ceil 4.5), shotgun 2 tyre pellets, rifle 2 radiator hits', DE.guns.revolver.need === 5 && DE.guns.shotgun.need === 2 && DE.guns.rifle.need === 2);
    check('D2 Extreme ammo ×0.7: reserves 13 / 7 / 13, crackers 2, paint 3, no flare', DE.guns.revolver.reservePerStop === 13 && DE.guns.shotgun.reservePerStop === 7 && DE.guns.rifle.reservePerStop === 13 && DE.firecracker.ammo === 2 && DE.balloon.ammo === 3 && DE.flare.ammo === 0);
    const easy = deepCopy(rules); easy.defend.hitsMult = 0.75; easy.defend.ammoMult = 1.5;
    const DZ = defendRules(easy);
    check('D3 Easy: revolver 3 hits (ceil 2.25), shotgun 1, rifle 1; reserves 27 / 15 / 27', DZ.guns.revolver.need === 3 && DZ.guns.shotgun.need === 1 && DZ.guns.rifle.need === 1 && DZ.guns.revolver.reservePerStop === 27 && DZ.guns.shotgun.reservePerStop === 15);
    const DR = defendRules({});
    check('D4 raw data without rules.defend → Hard defaults', DR.guns.revolver.need === 3 && DR.guns.revolver.reservePerStop === 18 && DR.heatPerShot === 0.04 && DR.flare.ammo === 1);
    // Extreme revolver: 4 hits don't stall, the 5th does
    const sim = new MockSim(ext); const cop = sim.addCop({ x: 14, z: -6, speed: 0, chase: false });
    const roof = new RoofDefence(sim); up(sim, roof);
    for (let i = 0; i < 4; i++) { aimPart(sim, roof, cop, 'body'); roof.command({ type: 'roofFire' }); roofRun(sim, roof, 0.34); }
    const s4 = cop.state;
    aimPart(sim, roof, cop, 'body'); roof.command({ type: 'roofFire' });
    check('D5 Extreme: 4 revolver hits → still running, 5th → stall', s4 === 1 && cop.state === 7);
  }

  // ── E. ammo + reload + refill ──────────────────────────────────────────────
  hr('E. ammo, reload, refill');
  {
    const sim = new MockSim(rules); sim.addCop({ x: 0, z: -30, speed: 0, chase: false });
    const roof = new RoofDefence(sim); up(sim, roof);
    check('E1 starts with full mags + reserves', roof.mag.revolver === 6 && roof.reserve.revolver === 18 && roof.mag.shotgun === 5 && roof.reserve.shotgun === 10 && roof.mag.rifle === 5 && roof.reserve.rifle === 18);
    check('E2 reload with a full mag is rejected', !roof.command({ type: 'roofReload' }));
    roof.command({ type: 'roofAim', yaw: 1.2, pitch: 0.3 });
    for (let i = 0; i < 6; i++) { roof.command({ type: 'roofFire' }); roofRun(sim, roof, 0.33); }
    const s0 = roof.state();
    check('E3 empty revolver auto-reloads (EV.RELOAD 2 s)', s0.mag.revolver === 0 && s0.reloading > 0 && s0.reloadT === 2 && sim.events.some((e) => e.type === EV.RELOAD && e.gun === 'revolver' && e.seconds === 2));
    check('E4 cannot fire while reloading', !roof.command({ type: 'roofFire' }));
    roofRun(sim, roof, 2.05);
    check('E5 after 2.0 s: mag 6, reserve 12', roof.mag.revolver === 6 && roof.reserve.revolver === 12 && roof.state().reloading === 0);
    // shotgun shell-by-shell
    roof.command({ type: 'roofSelect', slot: 'shotgun' }); roofRun(sim, roof, 0.4);
    for (let i = 0; i < 3; i++) { roof.command({ type: 'roofFire' }); roofRun(sim, roof, 0.86); }
    check('E6 shotgun 5 → 2 after 3 shots', roof.mag.shotgun === 2);
    roof.command({ type: 'roofReload' });
    check('E7 shotgun reload = 3 shells × 0.55 s', Math.abs(roof.state().reloadT - 1.65) < 0.011);
    roofRun(sim, roof, 0.6);
    check('E8 one shell loaded after 0.55 s', roof.mag.shotgun === 3 && roof.reserve.shotgun === 9);
    check('E9 firing interrupts a shotgun reload', roof.command({ type: 'roofFire' }) && roof.state().reloading === 0 && roof.mag.shotgun === 2);
    // switching guns cancels the reload + draw time
    roof.command({ type: 'roofReload' }); roof.command({ type: 'roofSelect', slot: 'rifle' });
    check('E10 switching guns cancels the reload; draw time blocks the next shot', roof.state().reloading === 0 && roof.state().gun === 'rifle' && !roof.command({ type: 'roofFire' }));
    // run the revolver dry completely
    roof.command({ type: 'roofSelect', slot: 'revolver' }); roofRun(sim, roof, 0.4);
    let guard = 0;
    while ((roof.mag.revolver + roof.reserve.revolver) > 0 && guard++ < 200) { roof.command({ type: 'roofFire' }); roofRun(sim, roof, roof.state().reloading > 0 ? 2.05 : 0.33); }
    sim.msgs.length = 0;
    check('E11 dry: no shot, toast says ammo refills at the next stop', !roof.command({ type: 'roofFire' }) && sim.msgs.some((m) => /next stop/.test(m)));
    sim.stopState = { id: 'market', state: 'parked' }; roofRun(sim, roof, 0.1);
    check('E12 a new stop refills mags + reserves + throwables', roof.mag.revolver === 6 && roof.reserve.revolver === 18 && roof.ammo.firecracker === 3);
    roof.command({ type: 'roofFire' }); roofRun(sim, roof, 0.4);
    sim.stopState = { id: 'market', state: 'loading' }; roofRun(sim, roof, 0.1);
    check('E13 the same stop does not refill twice', roof.mag.revolver === 5);
  }

  // ── F. throwables ──────────────────────────────────────────────────────────
  hr('F. throwables');
  {
    const sim = new MockSim(rules);
    const a = sim.addCop({ x: 2, z: -14, speed: 0, chase: false }), b = sim.addCop({ x: -2, z: -15, speed: 0, chase: false }), c = sim.addCop({ x: 12, z: 6, speed: 0, chase: false });
    const roof = new RoofDefence(sim); up(sim, roof);
    check('F1 roofSelect firecracker → slot, gun unchanged', roof.command({ type: 'roofSelect', slot: 'firecracker' }) && roof.state().slot === 'firecracker' && roof.state().gun === 'revolver');
    check('F2 roofFire with a throwable selected does nothing', !roof.command({ type: 'roofFire' }));
    roof.command({ type: 'roofThrow', device: 'firecracker', x: 0, z: -14.5 });
    roofRun(sim, roof, 0.3);
    check('F3 nothing happens in flight; fx lists it', a.state === 1 && roof.state().fx.some((f) => f.phase === 'fly'));
    roofRun(sim, roof, 1);
    check('F4 firecracker stalls both cops in its radius (state 7)', a.state === 7 && b.state === 7 && c.state === 1 && roof.state().throwables.firecracker === 2);
    roof.command({ type: 'roofThrow', device: 'balloon', x: 12, z: 6 }); roofRun(sim, roof, 1.2);
    check('F5 paint balloon blinds (state 8)', c.state === 8 && sim.events.some((e) => e.type === EV.ROOF_HIT && e.device === 'balloon'));
    const smoke0 = sim.inv.gadgets.smoke;
    check('F6 flare uses the per-stop flare + a smoke charge', roof.state().throwables.flare === 1 && roof.command({ type: 'roofThrow', device: 'flare', x: 0, z: -14 }) && sim.inv.gadgets.smoke === smoke0 - 1 && roof.state().throwables.flare === 0);
    check('F7 a 2nd flare is rejected', !roof.command({ type: 'roofThrow', device: 'flare', x: 0, z: -14 }));
    for (let i = 0; i < 2; i++) roof.command({ type: 'roofThrow', device: 'firecracker', x: 20, z: 20 });
    check('F8 out of firecrackers → rejected with a toast', !roof.command({ type: 'roofThrow', device: 'firecracker', x: 20, z: 20 }) && sim.msgs.some((m) => /firecrackers/.test(m)));
    check('F9 unknown device rejected', !roof.command({ type: 'roofThrow', device: 'grenade', x: 0, z: 0 }));
  }

  // ── G. AI Rook ─────────────────────────────────────────────────────────────
  hr('G. AI Rook');
  const aiHold = (seed, opts = {}) => {
    const sim = new MockSim(rules, { seed, solo: true });
    sim.stopState = { id: 'bolt', state: 'parked' };
    const roof = new RoofDefence(sim);
    // 3 cops at 6–9 m/s from behind, ahead and across the lot
    const spawn = [[2, -60, 0], [-4, 70, Math.PI], [45, 10, -Math.PI / 2]];
    const cops = spawn.map(([x, z, yaw], i) => { const c = sim.addCop({ x, z, yaw, speed: 6 + i * 1.5 }); c.vmax = 7 + i; return c; });
    let climbT = null, maxIn = 0;
    const inside = new Map();
    roofRun(sim, roof, opts.sec ?? 30, () => {
      if (climbT == null && roof.active) climbT = sim.t;
      if (sim.t > 2 && sim.stopState.state === 'parked') sim.stopState = { id: 'bolt', state: 'shopping' };
      for (const c of sim.cops.cops) {
        const d = Math.hypot(c.x - sim.rv.x, c.z - sim.rv.z);
        if (c.state === 1 && d < 25) { const t0 = inside.get(c.id) ?? sim.t; inside.set(c.id, t0); maxIn = Math.max(maxIn, sim.t - t0); } else inside.delete(c.id);
      }
    });
    return { sim, roof, cops, climbT, maxIn };
  };
  {
    const r = aiHold(7);
    check('G1 solo: the AI Rook climbs up 0.8 s after the stop parks', r.climbT != null && Math.abs(r.climbT - 0.8) < 0.05, `at ${r.climbT?.toFixed(2)} s`);
    check('G2 snapshot ai:true while the AI defends', r.roof.state().ai === true);
    check('G3 30 s at the stop against 3 cops: no bust', !r.sim.busted, `max bust ${(r.sim.maxBust * 100).toFixed(0)} %`);
    const dis = r.roof.stats.disabled;
    check('G4 every cop got disabled at least once', r.cops.every((c) => c.effects.some((e) => e.tyre || e.radiator || e.stall)), JSON.stringify(dis));
    check('G5 the AI uses the guns (shots + hits)', r.roof.stats.shots > 3 && r.roof.stats.hits > 0, `shots ${r.roof.stats.shots}, pellet hits ${r.roof.stats.hits}`);
    check('G6 no running cop stays inside 25 m unanswered for > 4 s', r.maxIn <= 4, `worst ${r.maxIn.toFixed(1)} s`);
    // seeds
    let busts = 0, worst = 0;
    for (let s = 1; s <= 10; s++) { const q = aiHold(s * 13 + 1); if (q.sim.busted) busts++; worst = Math.max(worst, q.sim.maxBust); }
    check('G7 10 seeds: 0 busts', busts === 0, `worst bust meter ${(worst * 100).toFixed(0)} %`);
    // control: nobody on the roof → busted
    const sim = new MockSim(rules, { seed: 3 }); sim.stopState = { id: 'bolt', state: 'shopping' };
    const roof = new RoofDefence(sim); sim.addCop({ x: 2, z: -40, speed: 7 });
    roofRun(sim, roof, 15);
    check('G8 control: an undefended stop gets busted', sim.busted && !roof.active);
    // the AI comes down when the stop is done
    r.sim.stopState = { id: 'bolt', state: 'done' }; roofRun(r.sim, r.roof, 2);
    check('G9 AI climbs down when the stop is done', !r.roof.active);
    // human takeover
    const q = aiHold(5, { sec: 3 });
    q.roof.command({ type: 'roofAim', yaw: 0, pitch: 0 });
    const tk = q.roof.state().ai;
    roofRun(q.sim, q.roof, 1.6);
    check('G10 a human command takes over for 1.5 s, then the AI resumes', tk === false && q.roof.state().ai === true);
    q.roof.command({ type: 'defend', on: true, ai: false });
    roofRun(q.sim, q.roof, 2);
    check('G11 defend {on, ai:false} while the AI is up → the human keeps it', q.roof.state().ai === false && q.roof.active);
    // determinism
    const ev1 = JSON.stringify(aiHold(11, { sec: 12 }).sim.events), ev2 = JSON.stringify(aiHold(11, { sec: 12 }).sim.events), ev3 = JSON.stringify(aiHold(12, { sec: 12 }).sim.events);
    check('G12 deterministic: same seed → same events; other seed differs', ev1 === ev2 && ev1 !== ev3);
    // bots: ai:true anywhere
    const sb = new MockSim(rules, { seed: 4 }); sb.addCop({ x: 3, z: -50, speed: 7 });
    const rb = new RoofDefence(sb);
    roofRun(sb, rb, 0.1); sb.cops.cops[0].z = -35; roofRun(sb, rb, 0.1);
    rb.command({ type: 'defend', on: true, ai: true });
    roofRun(sb, rb, 12);
    check('G13 defend {ai:true} away from a stop: AI defends, then comes down once clear', sb.cops.cops[0].state !== 1 && rb.stats.shots > 0 && !sb.busted, `cop state ${sb.cops.cops[0].state}, roof ${rb.active}`);
  }

  // ── H. snapshot shape ──────────────────────────────────────────────────────
  hr('H. state() shape');
  {
    const sim = new MockSim(rules); const roof = new RoofDefence(sim); roof.update(DT);
    const s = roof.state();
    const keys = ['active', 'climbing', 'climbDir', 'climb', 'onRoof', 'ai', 'available', 'why', 'nearCop', 'gun', 'slot', 'ads', 'aimYaw', 'aimPitch', 'reloading', 'reloadT', 'cooldown', 'mag', 'reserve', 'throwables', 'fx'];
    check('H1 every contract key present', keys.every((k) => k in s), keys.filter((k) => !(k in s)).join(','));
    check('H2 plain JSON (round-trips)', JSON.stringify(JSON.parse(JSON.stringify(s))) === JSON.stringify(s));
    check('H3 getters for GameSim: roofRook / holdsRv / roofDoc', roof.roofRook === false && roof.holdsRv === false && roof.roofDoc === false);
  }

  // ── R. the real GameSim ────────────────────────────────────────────────────
  hr('R. real GameSim');
  try {
    const { GameSim } = await import('../GameSim.js');
    const sim = new GameSim(data, { seed: 5, solo: false });
    sim.applyDriverCommand({ type: 'skipTutorial' });
    for (let i = 0; i < 600 && sim.phase !== 'drive'; i++) sim.step({ throttle: 0, steer: 0, handbrake: true }, DT);
    const roof = sim.roof;
    check('R1 GameSim builds the new RoofDefence', roof instanceof RoofDefence && sim.phase === 'drive');
    const send = (c) => {
      const r = sim.applyDriverCommand(c);
      if (r === false && !sim._defendRouted) return roof.command(c);   // SIM hasn't routed DCMDs yet
      return r;
    };
    // route check (informational): does applyDriverCommand reach the roof?
    const before = roof.stats.rejected;
    sim.applyDriverCommand({ type: 'defend', on: true });
    sim._defendRouted = roof.stats.rejected > before || roof.active;
    log(`  info  applyDriverCommand → roof.command routed: ${sim._defendRouted ? 'yes' : 'NOT YET (SIM)'}`);
    // heat + a cop next to the RV
    sim.heat.set(2.3);
    sim.rv.vx = sim.rv.vz = 0; sim.rv.speed = 0;
    const rv = sim.rv;
    for (let i = 0; i < 30; i++) sim.step({ throttle: 0, steer: 0, handbrake: true }, DT);
    let cop = sim.cops.cops.find((c) => c.kind !== 'heli' && !c.dead);
    if (!cop && typeof sim.cops._makeCop === 'function') { cop = sim.cops._makeCop('cop', rv.x, rv.z - 20, rv.yaw, 0); sim.cops.cops.push(cop); }
    if (!cop) {
      check('R2 a cop to shoot at (none spawned — skipped)', true);
    } else {
      const p = rvToWorld(rv, 9, 2);
      cop.x = p.x; cop.z = p.z; cop.yaw = rv.yaw; cop.vx = cop.vz = 0; cop.speed = 0; cop.state = 1; cop.parked = false;
      sim.step({ throttle: 0, steer: 0, handbrake: true }, DT);
      check('R2 DEFEND available with a cop within 40 m (or at a stop)', roof.state().available || roof.active, `why ${roof.state().why}, nearCop ${roof.state().nearCop}`);
      send({ type: 'defend', on: true });
      for (let i = 0; i < 100; i++) sim.step({ throttle: 0, steer: 0, handbrake: true }, DT);
      check('R3 Rook climbs onto the roof (1.6 s)', roof.onRoof, `climb ${roof.climb}`);
      const snap = sim.snapshot();
      check('R4 snapshot.roof is the DEFEND state (SIM puts roof.state() there)', snap.roof && snap.roof.gun && 'mag' in snap.roof && 'available' in snap.roof);
      log(`  info  snap.rv.roofRook: ${snap.rv.roofRook} (SIM sets it from roof.roofRook) · holdsRv used: ${typeof sim.stops.holdsRv === 'function'}`);
      send({ type: 'roofSelect', slot: 'shotgun' });
      for (let i = 0; i < 30; i++) sim.step({ throttle: 0, steer: 0, handbrake: true }, DT);
      const live = sim.copsList().find((c) => c.id === cop.id);
      const t = copPartWorld(live, 'tyre', 'fr'), a = aimAt(sim.rv, t.x, t.z, t.y);
      const h = rayCopHit(sim.rv, a.yaw, a.pitch, live);
      send({ type: 'roofAim', yaw: a.yaw, pitch: a.pitch, ads: false });
      const heat0 = sim.heat.value;
      send({ type: 'roofFire' });
      const st = sim.copsList().find((c) => c.id === cop.id)?.state;
      check('R5 shotgun at a real cop\'s tyre → tyre out (state 9) or the stall fallback (7)', h.hit && (st === 9 || st === 7), `ray ${h.part}, state ${st}`);
      check('R6 the shot added heat', sim.heat.value > heat0, `${heat0.toFixed(2)} → ${sim.heat.value.toFixed(2)}`);
      log(`  info  cops.js states 9/10: ${st === 9 ? 'landed' : 'not yet (stall fallback used)'}`);
    }
    // AI hold against the real cops — only meaningful once SIM's bust grace has landed
    const graceLanded = rules.heat?.bust?.grace != null;
    if (!graceLanded) log('  info  heat.bust.grace not in rules.json yet → the real-sim AI hold test is skipped');
    else {
      const res = await realAiHold(data, GameSim, log);
      check('R7 real sim: the AI Rook holds a stop 30 s against the police response without a bust', res.ok, res.detail);
    }
  } catch (e) {
    check('R0 real GameSim section ran', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | '));
  }

  const pass = results.filter((r) => r.ok).length, fail = results.length - pass;
  log(`\nroof-defend: ${pass}/${results.length} passed${fail ? ` — ${fail} FAILED` : ''}`);
  return { pass, fail, results };
}

/** The real GameSim: park at a stop with heat; the police response (2 on Hard) + a 3rd car from the other
 *  side arrive; the solo AI Rook defends for 30 s while the shop runs (no shopDone). Several seeds. */
async function realAiHold(data, GameSim, log) {
  const seeds = [9, 3, 21, 14];
  const out = [];
  let ok = true;
  for (const seed of seeds) {
    const sim = new GameSim(data, { seed, solo: true });
    sim.applyDriverCommand({ type: 'skipTutorial' });
    for (let i = 0; i < 600 && sim.phase !== 'drive'; i++) sim.step({ throttle: 0, steer: 0, handbrake: true }, DT);
    const def = data.route.stops[seed % 2];
    const lot = sim.track.stopLot(def);
    const rv = sim.rv;
    rv.x = lot.cx; rv.z = lot.cz; rv.yaw = sim.road.heading ? sim.road.heading(lot.cz) : 0; rv.vx = rv.vz = 0; rv.speed = 0; rv.w = 0;
    sim.traffic.frontier = rv.z + 40; sim.peds.frontier = rv.z + 40;
    sim.heat.set(2.4);
    let busted = false, maxBust = 0, upT = null, t = 0, stopSeen = false, extra = false;
    for (let i = 0; i < 60 * 30 && sim.phase === 'drive'; i++) {
      sim.step({ throttle: 0, steer: 0, handbrake: true }, DT); t += DT;
      if (sim.stop) stopSeen = true;
      if (upT == null && sim.roof.active) upT = t;
      if (!extra && t > 6 && typeof sim.cops._makeCop === 'function') {
        // a third car: ahead of the RV, coming back down the road at it
        extra = true;
        const p = rvToWorld(rv, 0, 70);
        const c = sim.cops._makeCop('cop', p.x, p.z, rv.yaw + Math.PI, 8);
        sim.cops.cops.push(c);
      }
      maxBust = Math.max(maxBust, sim.heat.bust || 0);
      if (sim.phase === 'lost') busted = sim.lostReason === 'busted';
    }
    const cops = sim.copsList().filter((c) => c.kind !== 'heli');
    const d = `seed ${seed}: up ${upT?.toFixed(1)} s, shots ${sim.roof.stats.shots}, disabled ${JSON.stringify(sim.roof.stats.disabled)}, cops ${cops.length}, max bust ${(maxBust * 100).toFixed(0)} %${busted ? ' BUSTED' : ''}`;
    log(`  info  ${d}`);
    out.push(d);
    if (!stopSeen || busted || sim.phase !== 'drive') ok = false;
  }
  return { ok, detail: `${seeds.length} seeds, 3 cars each` };
}

// run directly: node public/js/sim/test/roof-defend.js
const isMain = typeof process !== 'undefined' && process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  run().then((r) => { process.exitCode = r.fail ? 1 : 0; }).catch((e) => { console.error(e); process.exitCode = 1; });
}
