// ─────────────────────────────────────────────────────────────────────────────
// pratt_jump — Broken Canyon Bridge (route.json z 38900 = the bridge lip).
// Sergeant Dolores Pratt in her slick-top highway interceptor.
//  • heat ≥ 1★ when the RV passes def.z − 300: she appears ~120 m behind, closes
//    to ~14 m behind the RV (never rams), follows it up the ramp, arrives at the
//    lip too slow (19 m/s; ~25 is needed) and drops into the canyon.
//    Caption "SGT. PRATT DIDN'T MAKE IT!". If the RV itself falls and respawns
//    behind her, she brakes and parks before the ramp (cameo).
//  • 0★: cameo — her car parked on the verge 90 m before the ramp, Pratt standing
//    beside it writing in her notebook as the RV goes by.
// Entities  interceptor  variant 1 (slick-top) · state 1 chasing (lights on), 0 parked,
//                        5 gave up (stopped), 4 gone (fell) · y follows the ramp, then falls
//           sgt_pratt    (cameo only) state 0 writing in her notebook
// Colliders cameo car only (solid). The chasing car has none (it must not spoil the jump).
// state()   { car: 'interceptor', variant: 1, mode: 'chase'|'cameo'|null, y, falling }
// Unity: PrattJumpSetPiece.
// ─────────────────────────────────────────────────────────────────────────────
import { Scripted, H, clamp, approach } from './common.js';

const FAIL_SPEED = 19;

export class PrattJump extends Scripted {
  start() {
    this.br = this.sim.data.route.bridge;
    this.lip = this.br ? this.br.lip : this.def.z;
    this.rampStart = this.br ? this.br.rampStart : this.lip - 50;
    this.rampH = this.br ? this.br.rampHeight : 8;
    this.angle = Math.atan2(this.rampH, this.lip - this.rampStart);
    this.mode = null;
    this.car = null; this.pratt = null;
    this.falling = false;
    this.lastRvZ = this.sim.rv.z;
    this.phase = 'idle';
  }

  _spawnChase() {
    const rv = this.sim.rv, g = this.g;
    const s = rv.z - 120, u = clamp(this.rvU(), -g.hw(s) + 1, g.hw(s) - 1);
    this.car = this.body('interceptor', 1, 0, 0, g.heading(s), { v: Math.max(22, (rv.speed || 0) + 6), du: 0 });
    this.place(this.car, s, u);
    this.car.state = 1;
    this.mode = 'chase';
    this.setPhase('chasing', 'SGT. PRATT IS ON YOUR TAIL!', 'bad');
  }

  _spawnCameo(s) {
    const g = this.g;
    if (!this.car) this.car = this.body('interceptor', 1, 0, 0, 0, { v: 0, du: 0 });
    const c = this.car;
    c.v = 0; c.state = 0; c.y = 0;
    this.place(c, s, g.hw(s) + g.sh(s) + 1.0);
    c.yaw = g.heading(s) + 0.12;
    if (!this.pratt) this.pratt = this.body('sgt_pratt', 0, 0, 0, 0);
    this.place(this.pratt, s + 3.6, Math.min(g.limit(s) - 0.5, c.u + 1.0));
    this.pratt.yaw = g.heading(s) + Math.PI / 2; // facing the road (from the right verge)
    this.mode = 'cameo';
  }

  update(dt) {
    this.t += dt;
    this.tickBodies(dt);
    this.clearBlocks();
    const sim = this.sim, rv = sim.rv, g = this.g;
    const respawned = rv.z < this.lastRvZ - 25;
    this.lastRvZ = rv.z;
    if (this.phase === 'idle') {
      if (rv.z < this.def.z - 300) return;
      if (rv.z > this.lip) { this.done = true; return; }
      if (H.stars(sim) >= 1) this._spawnChase();
      else { this._spawnCameo(this.rampStart - 90); this.setPhase('cameo'); }
    }
    if (this.phase === 'cameo') {
      if (!this.saidCameo && this.pratt && Math.abs(this.pratt.z - rv.z) < 60) { this.saidCameo = true; this.beat('cameo', 'Sgt. Pratt takes notes…', 'info'); }
      if (rv.z > this.lip + 200) this.done = true;
      return;
    }
    const c = this.car;
    if (this.phase === 'chasing' || this.phase === 'ramp') {
      if (respawned || (rv.y < -5 && !this.falling)) {
        // the RV went into the canyon and is back at the checkpoint: she gives up and parks
        this._spawnCameo(this.rampStart - 30);
        c.state = 5;
        this.setPhase('cameo');
        return;
      }
      const toLip = this.lip - c.z;
      const rvPast = rv.z > this.lip - 1 || rv.airborne;
      let vT = clamp((rv.speed || 0) + ((rv.z - 14) - c.z) * 0.8, 0, 36);
      if (toLip < 70 && (rvPast || toLip < 40)) { vT = FAIL_SPEED; this.setPhase('ramp'); }
      c.v = approach(c.v, vT, 9 * dt);
      const uT = clamp(this.rvU(), -g.hw(c.z) + 1, g.hw(c.z) - 1);
      c.du = clamp((uT - c.u) * 1.5, -3, 3);
      c.s += c.v * dt; c.u += c.du * dt;
      c.x = g.xAt(c.s, c.u); c.z = c.s;
      const sy = g.baseSurface(c.z);
      c.y = sy == null ? c.y : sy;
      c.yaw = g.yawFor(c.s, Math.max(1, c.v), c.du);
      c.vx = g.slope(c.s) * c.v - c.du; c.vz = c.v;
      if (c.z >= this.lip) {
        this.falling = true;
        c.vy = c.v * Math.sin(this.angle); c.vz = c.v * Math.cos(this.angle); c.vx = 0;
        c.y = this.rampH;
        this.setPhase('airborne');
      }
      return;
    }
    if (this.phase === 'airborne') {
      c.vy -= 9.81 * dt;
      c.z += c.vz * dt; c.y += c.vy * dt;
      c.s = c.z; c.x = g.xAt(c.z, c.u);
      if (c.y < -2 && !this.saidFail) { this.saidFail = true; this.setPhase('falling', "SGT. PRATT DIDN'T MAKE IT!", 'good'); }
    }
    if (this.phase === 'falling') {
      c.vy -= 9.81 * dt;
      c.y += c.vy * dt; c.z += c.vz * 0.4 * dt; c.s = c.z; c.x = g.xAt(c.z, c.u);
      const depth = this.br ? this.br.canyonDepth : 60;
      if (c.y < -depth * 0.8) { c.state = 4; c.hidden = true; this.beat('crashed', null); this.setPhase('fallen'); }
    }
    if (this.phase === 'fallen' && rv.z > this.lip + 200) this.done = true;
  }

  colliders(out) {
    if (this.mode !== 'cameo' || !this.car) return;
    const c = this.car;
    if (Math.abs(c.z - this.sim.rv.z) > 25) return;
    this.solidBox(out, c, 4.95, 2.0, { damage: 6, speedLoss: 0.3 });
  }

  extraState() {
    return { car: 'interceptor', variant: 1, mode: this.mode, y: this.car ? Math.round(this.car.y * 10) / 10 : 0, falling: this.falling };
  }
}
