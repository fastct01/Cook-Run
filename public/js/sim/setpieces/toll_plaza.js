// ─────────────────────────────────────────────────────────────────────────────
// toll_plaza — Interstate (route.json z 24500). The booths/islands/canopy are the
// `toll_plaza` structure (VIEW-WORLD-A draws it, SIM-CORE gives the islands colliders).
// This set-piece runs the four barrier arms and, at ≥ 2★, a police checkpoint.
// Model mapping (toll_plaza placed at the road centre with rotation.y = π):
//   toll lane i is at u = lanes[i] = −7.5, −2.5, 2.5, 7.5 (u = model-local x); its
//   arm_i spans u ∈ [lanes[i] − 1.65, lanes[i] + 2.0] at z = def.z + 1.6.
//  • < 2★ (checked once, 320 m out): open-road tolling — the arm of whichever lane
//    the RV heads for lifts when it gets within 60 m. No police.
//  • ≥ 2★: CHECKPOINT. All arms down, two cop cars parked angled across the outer
//    lane exits, four officers on the islands. Arms never block: driving through
//    one smashes it (+heat, +points, small slow). Officers dive out of the way.
// Entities  cop          variant 0 · state 1 (parked with lights + siren on; they don't move)
//           cop_officer  variants 0–2 · ped states: 0 standing (hand up), 1 diving aside,
//                        3 on the ground, 4 getting up
// Colliders the two parked cop cars (solid). Arms: crossing test done here.
// state()   { gates:[g0..g3] 0 up · 1 down · 2 smashed, lanes, gateZ, checkpoint }
// Unity: TollPlazaSetPiece.
// ─────────────────────────────────────────────────────────────────────────────
import { Scripted, H, approach } from './common.js';

const LANES = [-7.5, -2.5, 2.5, 7.5];

export class TollPlaza extends Scripted {
  start() {
    this.gateZ = this.def.z + 1.6;
    this.lanes = LANES.slice();
    this.span = this.lanes.map((u) => [u - 1.65, u + 2.0]);
    this.gates = [1, 1, 1, 1];
    this.checkpoint = null;   // decided 320 m out
    this.smashed = 0;
    this.prevNose = null;
    this.cops = []; this.officers = [];
    this.phase = 'idle';
  }

  _setupCheckpoint() {
    const g = this.g, z = this.gateZ, h = g.heading(z), rng = this.rng;
    for (const [i, side] of [[0, -1], [3, 1]]) {
      const zc = z + 12 + (i ? 4 : 0);
      const c = this.body('cop', 0, 0, 0, h + side * 0.95, { len: 4.8, wid: 2.0 });
      this.place(c, zc, this.lanes[i]);
      c.state = 1;
      this.cops.push(c);
    }
    [-5, 0, 5, 10].forEach((u, i) => {
      const o = this.body('cop_officer', rng.int(0, 2), 0, 0, h + Math.PI, { home: u + (i === 3 ? -0.6 : 0), timer: 0 });
      this.place(o, z + 2.6, o.home);
      this.officers.push(o);
    });
  }

  _rvNose() {
    const rv = this.sim.rv;
    const hl = (rv.len ?? 8.6) / 2;
    const x = rv.x + Math.sin(rv.yaw) * hl, z = rv.z + Math.cos(rv.yaw) * hl;
    return { x, z, u: this.g.uAt(x, z) };
  }

  update(dt) {
    this.t += dt;
    this.tickBodies(dt);
    this.clearBlocks();
    const sim = this.sim, rv = sim.rv, d = this.ahead(this.gateZ);
    if (this.checkpoint === null) {
      if (d > 320) return;
      if (d < -5) { this.checkpoint = false; this.gates = [0, 0, 0, 0]; this.setPhase('passed'); return; }
      this.checkpoint = H.stars(sim) >= 2;
      if (this.checkpoint) { this._setupCheckpoint(); this.setPhase('checkpoint', 'POLICE CHECKPOINT AT THE TOLL!', 'bad'); }
      else this.setPhase('open');
    }
    const nose = this._rvNose();
    const rvU = this.rvU();
    // open-road tolling: lift the arm of the lane the RV is heading for
    if (!this.checkpoint && d < 60 && d > -10) {
      for (let i = 0; i < 4; i++) {
        const [a, b] = this.span[i];
        if (this.gates[i] === 1 && rvU + 1.6 > a && rvU - 1.6 < b) this.gates[i] = 0;
      }
    }
    // crossing the arm line
    if (this.prevNose != null && this.prevNose < this.gateZ && nose.z >= this.gateZ) {
      for (let i = 0; i < 4; i++) {
        const [a, b] = this.span[i];
        if (this.gates[i] === 1 && nose.u + 1.25 > a && nose.u - 1.25 < b) this._smash(i);
      }
    }
    this.prevNose = nose.z;
    // officers dive out of the way
    for (const o of this.officers) {
      if (o.state === 0) {
        const front = o.z - rv.z;
        if (front > -2 && front < 30 && Math.abs(o.u - rvU) < 4.5 && Math.abs(rv.speed || 0) > 6) {
          o.state = 1; o.timer = 0.6; o.diveTo = o.u + (o.u >= rvU ? 2.6 : -2.6);
        }
      } else if (o.state === 1) {
        o.u = approach(o.u, o.diveTo, 5 * dt); o.timer -= dt;
        if (o.timer <= 0) { o.state = 3; o.timer = 1.6; }
      } else if (o.state === 3) { o.timer -= dt; if (o.timer <= 0) { o.state = 4; o.timer = 1.0; } }
      else if (o.state === 4) { o.timer -= dt; if (o.timer <= 0) o.state = 0; }
      this.place(o, o.z, o.u);
    }
    for (const c of this.cops) this.blockBody(c, 2.6, 2.6, 0.6);
    if (d < -30 && this.phase !== 'passed') this.setPhase('passed');
    if (d < -200) this.done = true;
  }

  _smash(i) {
    const sim = this.sim;
    this.gates[i] = 2;
    this.smashed++;
    H.heat(sim, this.checkpoint ? 0.5 : 0.15, 'tollGate');
    H.points(sim, this.checkpoint ? 250 : 100, 'tollGate');
    H.push(sim, 0, 0, 0.08);
    const u = this.lanes[i];
    sim.emit({ type: 'smash', x: this.g.xAt(this.gateZ, u), z: this.gateZ, kind: 'toll_gate' });
    if (this.smashed === 1) this.beat('smashed', this.checkpoint ? 'Smashed through the checkpoint!' : 'Toll gate smashed!', 'bad');
  }

  colliders(out) {
    for (const c of this.cops) {
      this.solidBox(out, c, c.len, c.wid, { damage: 6, speedLoss: 0.25 });
    }
  }

  extraState() {
    return { gates: this.gates.slice(), lanes: this.lanes, gateZ: this.gateZ, checkpoint: !!this.checkpoint };
  }
}
