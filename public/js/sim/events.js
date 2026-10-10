// ─────────────────────────────────────────────────────────────────────────────
// RouteEvents: the scripted set pieces from route.json `events`.
//  • roadwork  — barrier line + cones closing one lane between from..to (static
//                obstacles created once at start; side = event.closedSide, +1 = the
//                forward/outer lane). Cones are smashable, barriers are too.
//  • train     — a 60 m train crosses the road laterally at z on a cycle:
//                period / warn / pass seconds. crossing_gate entities each side go
//                down (state 1) during warn+pass. Hitting the train = big damage,
//                big bump, full stop. Events 'train' {state:'warn'|'pass'|'clear'}
//                fire when the RV is within train.announceRange.
//  • dustStorm — snapshot.weather = 'dust' while the RV is inside: cops lose sight.
//  • rockfall  — falling_rock entities spawn on the road ahead every `every` s
//                while the RV is in the zone; y drops from 25 → 0 (renderer draws
//                a shadow while y > 0); landed rocks are solid road obstacles.
// Unity port: RouteEventDirector + TrainCrossing / Rockfall components.
// ─────────────────────────────────────────────────────────────────────────────
import { KIND_ID } from '../shared/protocol.js';
import { clamp } from './util.js';
import { capsuleSegment, resolveStatic } from './collisions.js';

const _c = { nx: 0, nz: 0, depth: 0, px: 0, pz: 0 };

export class RouteEvents {
  constructor(sim) {
    this.sim = sim;
    this.rng = sim.rngEvents;
    const evs = sim.route.events || [];
    this.trains = evs.filter((e) => e.type === 'train').map((e) => this._initTrain(e));
    this.dust = evs.filter((e) => e.type === 'dustStorm');
    this.rockfalls = evs.filter((e) => e.type === 'rockfall').map((e) => ({ ...e, t: 0 }));
    this.inDust = false;
    this._buildRoadwork();
  }

  // ── roadwork ────────────────────────────────────────────────────────────────
  _buildRoadwork() {
    const sim = this.sim, road = sim.road;
    for (const rw of sim.roadworks) {
      const side = rw.closedSide;
      // cones taper in over the first 18 m, then a barrier line along the lane edge
      const inner = side > 0 ? rw.u0 : rw.u1; // lane edge toward the centre
      const outer = side > 0 ? rw.u1 : rw.u0;
      for (let z = rw.from - 18; z < rw.from; z += 3) {
        const t = (z - (rw.from - 18)) / 18;
        const u = outer + (inner + side * 0.4 - outer) * t;
        sim.obstacles.add('cone', road.xAt(z, u), z, { src: 'roadwork' });
      }
      for (let z = rw.from; z <= rw.to; z += 3.4) {
        const u = inner + side * 0.4;
        const isBarrier = Math.round((z - rw.from) / 3.4) % 3 === 0;
        if (isBarrier) {
          const uc = (rw.u0 + rw.u1) / 2;
          sim.obstacles.add('barrier', road.xAt(z, uc), z, { yaw: road.heading(z) + Math.PI / 2, src: 'roadwork', halfLen: 0.9 });
        } else sim.obstacles.add('cone', road.xAt(z, u), z, { src: 'roadwork' });
      }
      for (let z = rw.to + 3; z < rw.to + 15; z += 3) {
        const t = (z - rw.to) / 15;
        const u = inner + side * 0.4 + (outer - inner) * t;
        sim.obstacles.add('cone', road.xAt(z, u), z, { src: 'roadwork' });
      }
    }
  }

  // ── train ───────────────────────────────────────────────────────────────────
  _initTrain(e) {
    const sim = this.sim, road = sim.road, T = sim.cfg.train;
    const h = road.heading(e.z);
    const halfSpan = road.hw(e.z) + road.sh(e.z) + road.sideRoom(e.z) + 10; // runs from edge of view to edge of view
    const gateU = road.hw(e.z) + road.sh(e.z) * 0.5 + 0.3;
    return {
      ev: e, z: e.z, h, id: sim.newId(), gateIds: [sim.newId(), sim.newId()], gateU,
      phase: 'clear', lastPhase: 'clear', offset: 0, halfSpan: Math.max(halfSpan, T.length + 20), dirSign: 1,
      // track runs perpendicular to the road: lateral (u) axis
      cycle: e.period, warn: e.warn, pass: e.pass, trainU: 0, visible: false, hitCd: 0,
    };
  }

  _trainPhase(tr, t) {
    const c = tr.cycle, w = tr.warn, p = tr.pass;
    const ph = ((t + c * 0.35) % c + c) % c; // offset so the first warn isn't at t=0
    const clearLen = c - w - p;
    if (ph < clearLen) return { phase: 'clear', k: 0 };
    if (ph < clearLen + w) return { phase: 'warn', k: (ph - clearLen) / w };
    return { phase: 'pass', k: (ph - clearLen - w) / p };
  }

  trainInfo() {
    // nearest train ahead (or under) the RV
    const rv = this.sim.rv;
    let best = null;
    for (const tr of this.trains) if (!best || Math.abs(tr.z - rv.z) < Math.abs(best.z - rv.z)) best = tr;
    if (!best) return null;
    return { z: best.z, state: best.phase, dist: best.z - rv.z, trainU: best.visible ? best.trainU : null };
  }

  _updateTrain(tr, dt) {
    const sim = this.sim, rv = sim.rv, T = sim.cfg.train, road = sim.road;
    const { phase, k } = this._trainPhase(tr, sim.t);
    tr.phase = phase;
    // train position along its track (u). Moves from +span to -span during 'pass' (centre crosses the road mid-pass).
    if (phase === 'pass') {
      tr.visible = true;
      const span = tr.halfSpan + T.length / 2;
      tr.trainU = span - 2 * span * k;
    } else if (phase === 'warn') { tr.visible = false; tr.trainU = tr.halfSpan + T.length; }
    else tr.visible = false;
    if (phase !== tr.lastPhase) {
      if (Math.abs(rv.z - tr.z) < T.announceRange && rv.z < tr.z + 60) sim.emit({ type: 'train', state: phase });
      tr.lastPhase = phase;
    }
    if (tr.hitCd > 0) tr.hitCd -= dt;
    // collision with the train (capsule along u at z)
    if (tr.visible) {
      const hl = T.length / 2;
      const u0 = tr.trainU - hl, u1 = tr.trainU + hl;
      const ax = road.xAt(tr.z, u0), bx = road.xAt(tr.z, u1);
      const r = T.width / 2;
      const hitBody = (b) => capsuleSegment(b, ax, tr.z, bx, tr.z, r, _c);
      if (!rv.airborne && hitBody(rv)) {
        resolveStatic(rv, _c, 0);
        if (tr.hitCd <= 0) {
          tr.hitCd = 1.5;
          sim.damageRv(T.damage, 'train');
          sim.addBump(1);
          rv.vx *= 0.05; rv.vz *= 0.05; rv.w += (this.rng.sign()) * 0.8;
          sim.emit({ type: 'crash', x: rv.x, z: rv.z, power: 1 });
          sim.emit({ type: 'msg', text: 'You hit the train!', tone: 'bad' });
        }
      }
      for (const c of sim.cops.cops) if (c.kind !== 'heli' && hitBody(c)) { resolveStatic(c, _c, 0); sim.cops.damage(c, 999); }
      for (const car of sim.traffic.cars) if (hitBody(car)) { resolveStatic(car, _c, 0); sim.traffic.crash(car, false); }
    }
  }

  // ── rockfall ────────────────────────────────────────────────────────────────
  _updateRockfall(rf, dt) {
    const sim = this.sim, rv = sim.rv, road = sim.road, R = sim.cfg.rockfall, rng = this.rng;
    if (rv.z < rf.from - R.startBefore || rv.z > rf.to || sim.phase !== 'drive') return;
    rf.t -= dt;
    if (rf.t > 0) return;
    rf.t = rf.every * (0.7 + rng.float(0, 0.6));
    const count = sim.obstacles.list.filter((o) => o.kind === 'falling_rock').length;
    if (count >= R.maxRocks) return;
    // land ~lead seconds before the RV arrives (the renderer shows the shadow while it falls)
    const tFall = (2 + Math.sqrt(4 + 2 * sim.g * R.height)) / sim.g;
    const lead = rng.float(R.leadSeconds?.[0] ?? 0.8, R.leadSeconds?.[1] ?? 1.8);
    const z = rv.z + clamp(Math.max(8, Math.abs(rv.speed)) * (tFall + lead), R.spawnAhead[0], R.spawnAhead[1]);
    if (z > rf.to + 30) return;
    const hw = road.hw(z);
    const u = rng.float(-hw + 0.8, hw - 0.8);
    const H = R.height;
    // keep the road passable: never two rocks within minSpacing metres of each other along the road
    for (const o of sim.obstacles.list) if (o.kind === 'falling_rock' && Math.abs(o.z - z) < (R.minSpacing ?? 14)) return;
    sim.obstacles.add('falling_rock', road.xAt(z, u), z, { y: H, falling: true, vy: -2, yaw: rng.float(0, 6.28), variant: rng.int(0, 3), src: 'rockfall' });
  }

  update(dt) {
    const sim = this.sim, rv = sim.rv;
    for (const tr of this.trains) this._updateTrain(tr, dt);
    let dust = false;
    for (const d of this.dust) if (rv.z >= d.from && rv.z <= d.to) dust = true;
    if (dust !== this.inDust) {
      this.inDust = dust;
      sim.emit({ type: 'msg', text: dust ? 'Dust storm! The cops can\'t see you.' : 'Out of the dust.', tone: dust ? 'good' : 'info' });
    }
    sim.weather = dust ? 'dust' : 'clear';
    for (const rf of this.rockfalls) this._updateRockfall(rf, dt);
  }

  pushEnts(out) {
    const sim = this.sim, road = sim.road, T = sim.cfg.train;
    for (const tr of this.trains) {
      const down = tr.phase === 'warn' || tr.phase === 'pass' ? 1 : 0;
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? 1 : -1;
        const gz = tr.z - side * T.gateOffset;
        out.push([tr.gateIds[i], KIND_ID.crossing_gate, road.xAt(gz, side * tr.gateU), 0, gz, tr.h + (side > 0 ? 0 : Math.PI), i, down]);
      }
      if (tr.visible) {
        // model faces +Z; the train runs along −u (world +x… depending on sign), yaw = road heading ± 90°
        out.push([tr.id, KIND_ID.train, road.xAt(tr.z, tr.trainU), 0, tr.z, tr.h + Math.PI / 2, 0, 0]);
      }
    }
  }
}
