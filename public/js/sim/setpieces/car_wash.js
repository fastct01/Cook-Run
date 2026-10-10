// ─────────────────────────────────────────────────────────────────────────────
// car_wash — Suds City Car Wash, strip mall (route.json z 28200, side 1).
// The wash tunnel (the `car_wash` structure: VIEW-WORLD-A draws it, SIM-CORE's
// structures.js gives it walls) stands over the right-hand lanes: tunnel axis
// u = side·halfWidth/2 (3.5 m), inside |u − axis| ≤ 2.9, z ∈ [def.z − 9, def.z + 9]
// (read from sim.structures.layout when present). Drive through it
// (≥ 75 % of its length inside the lane) slower than 15 m/s with no police car
// within 40 m → sim.dropStars(rules.heat.carWashDrop) — once per run.
// While inside: windscreen suds (sim.setFx({fog})) and the brushes spin.
// Entities: none.
// state()   { progress 0..1, washing (RV inside → spin brushes, foam particles),
//             u, halfWidth, z0, z1, used (the one-time drop is spent) }
// Captions  'clean' "SPARKLING CLEAN — 1 star lost" (or "SPARKLING CLEAN!" at 0★),
//           fail beats: "Too fast for the wash!" / "Not with a cop watching!"
// Unity: CarWashSetPiece (trigger volume).
// ─────────────────────────────────────────────────────────────────────────────
import { Scripted, H } from './common.js';

const MAX_SPEED = 15, COP_RANGE = 40, HALF = 9;

export class CarWash extends Scripted {
  start() {
    const g = this.g, d = this.def, z = d.z;
    // tunnel geometry = SIM-CORE's structure layout (sim/structures.js carWashLayout): walls at
    // axisU ± 3.2 over z ± 9, inside |u − axisU| ≤ 2.9, axisU = side · halfWidth / 2
    const lay = this.sim.structures?.layout?.carWashes?.find((w) => Math.abs(w.z - z) < 60);
    this.side = d.side ?? lay?.side ?? 1;
    this.z0 = lay?.from ?? z - HALF; this.z1 = lay?.to ?? z + HALF;
    this.uc = lay?.axisU ?? this.side * g.hw(z) / 2;
    this.half = lay?.halfIn ?? 2.9;
    this.progress = 0;
    this.washing = false;
    this.failedFast = false; this.failedCop = false;
    this.prevZ = null;
    this.phase = this.host.carWashUsed ? 'used' : 'idle';
  }

  _copNear() {
    const rv = this.sim.rv;
    for (const c of H.cops(this.sim)) {
      if (c.kind === 'heli' || c.state === 4 || c.state === 5) continue;
      if (Math.hypot(c.x - rv.x, c.z - rv.z) < COP_RANGE) return true;
    }
    return false;
  }

  update(dt) {
    this.t += dt;
    const sim = this.sim, rv = sim.rv;
    const inside = !rv.airborne && rv.z >= this.z0 && rv.z <= this.z1 && Math.abs(this.rvU() - this.uc) <= this.half;
    const dz = this.prevZ == null ? 0 : Math.max(0, rv.z - this.prevZ);
    this.prevZ = rv.z;
    this.washing = inside;
    if (inside) H.fx(sim, { fog: 0.55 }, 0.6);
    if (this.phase === 'used' || this.phase === 'clean') { if (rv.z > this.z1 + 150) this.done = true; return; }
    if (!inside) {
      if (rv.z > this.z1 + 150) this.done = true;
      if (rv.z > this.z1 && this.phase === 'washing') this.setPhase('dirty');
      return;
    }
    if (this.phase === 'idle' || this.phase === 'dirty') this.setPhase('washing');
    const speed = Math.abs(rv.speed || 0);
    if (speed >= MAX_SPEED) {
      if (!this.failedFast) { this.failedFast = true; this.beat('tooFast', 'Too fast for the wash!', 'bad'); }
      this.progress = 0;
      return;
    }
    if (this._copNear()) {
      if (!this.failedCop) { this.failedCop = true; this.beat('copWatching', 'Not with a cop watching!', 'bad'); }
      this.progress = 0;
      return;
    }
    this.progress += dz / (this.z1 - this.z0);
    if (this.progress >= 0.75) {
      this.host.carWashUsed = true;
      const stars = H.stars(sim);
      const n = sim.data.rules?.heat?.carWashDrop ?? 1;
      if (stars > 0) H.dropStars(sim, n, 'car wash');
      this.setPhase('clean', stars > 0 ? `SPARKLING CLEAN — ${n} star${n > 1 ? 's' : ''} lost` : 'SPARKLING CLEAN!', 'good');
    }
  }

  extraState() {
    const r = (v) => Math.round(v * 100) / 100;
    return { progress: r(Math.min(1, this.progress / 0.75)), washing: this.washing, u: r(this.uc), halfWidth: this.half, z0: this.z0, z1: this.z1, used: !!this.host.carWashUsed };
  }
}
