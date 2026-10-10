// ─────────────────────────────────────────────────────────────────────────────
// drawbridge — Docks bascule bridge (route.json 13180–13230, riseSeconds, maxAngle).
// Phases: idle → bell (3 s) → rising (riseSeconds → maxAngle) → up (30 s) →
//         lowering (riseSeconds) → down. Rising starts when the RV is ≤ 250 m away.
// Geometry (matches the `drawbridge` model: 48 m opening, two 24 m leaves on
// trunnions 1 m under the deck at zc ∓ 24, model placed at roadY − 6):
//   leaf top surface at horizontal distance h from its trunnion:
//       y(h) = 1/cos(a) − 1 + h·tan(a),   h ∈ [0, tipH],  tipH = L·cos(a) − sin(a)
//   near leaf h = z − pivotA, far leaf h = pivotB − z; between the tips = the GAP.
// surfaceY(z): the deck height on the leaves; null over the gap once angle > 0.12
// (below that the gap < 0.6 m is bridged at tip height). The RV can jump it
// (≥ ~8 m/s at the tip clears the 8 m gap at full angle: it leaves the ramp with
// vy = v·tan a). Falling in: vehicle.js bounces the RV off a leaf face it meets
// below the deck, and GameSim.onFellGeneric (y < −5) respawns it behind the bridge
// with damage; we notice the respawn ('splash' beat) and lower the bridge 4 s later.
// (Without onFellGeneric we call sim.respawnRv ourselves at y < −4.5; with neither
// helper → SAFE MODE: never null, angle capped at 0.2 rad, the 1.4 m gap bridged.)
// While the RV waits ≥ 8 s in front of a raised bridge the operator lowers it early.
// Entities: none (the bridge is VIEW-WORLD-A's structure).
// state()   { angle (rad; leaf_l.rotation.x = −angle, leaf_r.rotation.x = +angle),
//             gap (m, 0 = closed), tipY (m above the road), pivots:[zA,zB],
//             bell (bool: bell + lights), barriers (bool: barrier arms down), mode 'gap'|'safe' }
// Unity: DrawbridgeSetPiece (drives the two leaf transforms + a deck MeshCollider).
// ─────────────────────────────────────────────────────────────────────────────
import { Scripted, H, smooth01 } from './common.js';

const BELL = 3, UP = 30, TRIGGER = 250, GAP_ANGLE = 0.12, WATER_Y = -6, SAFE_MAX = 0.2;

export class Drawbridge extends Scripted {
  start() {
    const d = this.def;
    this.zc = (d.from + d.to) / 2;
    this.L = Math.min(24, (d.to - d.from) / 2);
    this.pA = this.zc - this.L; this.pB = this.zc + this.L;
    this.riseSeconds = d.riseSeconds ?? 14;
    // who handles a fall into the water: GameSim (onFellGeneric at y < −5), us (respawnRv), or nobody (safe mode)
    this.simFalls = typeof this.sim.onFellGeneric === 'function';
    this.safe = !this.simFalls && !H.canRespawn(this.sim);
    this.wasInGap = false;
    this.maxAngle = this.safe ? Math.min(d.maxAngle ?? 0.55, SAFE_MAX) : (d.maxAngle ?? 0.55);
    this.angle = 0;
    this.pt = 0;          // time in the current phase
    this.waitT = 0;
    this.splashes = 0;
    this.lowerSoon = -1;
    this.phase = 'idle';
    if (this.ahead(d.from) < 0) this.phase = 'down';
  }

  _go(p, caption, tone) { this.pt = 0; this.setPhase(p, caption, tone); }

  update(dt) {
    this.t += dt; this.pt += dt;
    this.clearBlocks();
    const rv = this.sim.rv, d = this.ahead(this.pA);
    switch (this.phase) {
      case 'idle':
        if (d <= TRIGGER && d > 0) this._go('bell', 'DRAWBRIDGE RISING — jump it or wait!', 'bad');
        else if (d <= 0) this.phase = 'down';
        break;
      case 'bell':
        if (this.pt >= BELL) this._go('rising');
        break;
      case 'rising':
        this.angle = this.maxAngle * smooth01(this.pt / this.riseSeconds);
        if (this.pt >= this.riseSeconds) { this.angle = this.maxAngle; this._go('up'); }
        break;
      case 'up':
        if (this.pt >= UP) this._go('lowering', 'The bridge is coming down.', 'info');
        break;
      case 'lowering': {
        const k = 1 - smooth01(this.pt / this.riseSeconds);
        this.angle = Math.min(this.angle, this.maxAngle * k);
        if (this.pt >= this.riseSeconds) { this.angle = 0; this._go('down'); }
        break;
      }
      default: break;
    }
    // operator takes pity on a waiting RV
    // (waiting = dawdling in front of it: stopped, creeping or backing up — not driving at it)
    const waiting = rv.z < this.pA - 1 && rv.z > this.pA - 130 && (rv.speed || 0) < 5;
    if ((this.phase === 'up' || this.phase === 'rising') && waiting) {
      this.waitT += dt;
      if (this.waitT > 8) { this.waitT = 0; this._startLowering('The operator lowers the bridge for you.'); }
    } else this.waitT = Math.max(0, this.waitT - dt * 0.25);
    if (this.lowerSoon >= 0) { this.lowerSoon -= dt; if (this.lowerSoon < 0) this._startLowering(null); }
    this._fallCheck();
    // traffic / autopilot: the whole span is closed while the bridge is not down
    if (this.phase !== 'down' && this.phase !== 'idle') {
      const e = this.g.edge(this.zc) + 1.5;
      this.block(this.pA - 22, this.pB + 2, -e, e);
    }
    if (this.phase === 'down' && rv.z > this.pB + 120) this.done = true;
  }

  _startLowering(caption) {
    if (this.phase !== 'up' && this.phase !== 'rising') return;
    // lowering continues from the current angle
    const k = this.angle / this.maxAngle;
    this.pt = 0;
    this.setPhase('lowering', caption, 'good');
    // start the lowering curve where the leaves are now
    this.pt = this.riseSeconds * Math.max(0, findT(1 - k));
  }

  // ── geometry ────────────────────────────────────────────────────────────────
  _tipH(a) { return this.L * Math.cos(a) - Math.sin(a); }
  _leafY(h, a) { return 1 / Math.cos(a) - 1 + h * Math.tan(a); }
  gap() { const a = this.angle; return a <= 0 ? 0 : Math.max(0, 2 * this.L - 2 * this._tipH(a)); }

  surfaceY(z) {
    const a = this.angle;
    if (a <= 1e-4 || z < this.pA || z > this.pB) return undefined;
    const tipH = this._tipH(a);
    const hA = z - this.pA, hB = this.pB - z;
    // (a falling RV that meets a leaf face below its surface is bounced back by vehicle.js)
    if (hA <= tipH || hB <= tipH) return this._leafY(Math.min(hA, hB), a);
    if (this.safe || a <= GAP_ANGLE) return this._leafY(tipH, a);
    return null;
  }

  _fallCheck() {
    const sim = this.sim, rv = sim.rv;
    if (this.safe) return;
    const inChannel = rv.z > this.pA - 2 && rv.z < this.pB + 2 && rv.airborne && rv.y < 0;
    let splashed = false;
    if (this.simFalls) {
      // GameSim respawns the RV (damage + message) once it drops below −5 m: notice the jump back
      if (this.wasInGap && !inChannel && rv.z < this.pA - 20) splashed = true;
    } else if (inChannel && rv.y < WATER_Y + 1.5) {
      H.damage(sim, 15, 'water');
      H.respawn(sim, this.pA - 50, 'drawbridge');
      splashed = true;
    }
    this.wasInGap = inChannel;
    if (splashed) {
      this.splashes++;
      this.beat('splash', this.simFalls ? null : 'SPLASH! Fished out of the harbour.', 'bad');
      if (this.phase === 'up' || this.phase === 'rising') this.lowerSoon = 4;
    }
  }

  extraState() {
    const r = (v) => Math.round(v * 1000) / 1000;
    const a = this.angle, tipH = this._tipH(a);
    return {
      angle: r(a), gap: r(this.gap()), tipY: r(a > 0 ? this._leafY(tipH, a) : 0), pivots: [this.pA, this.pB],
      bell: this.phase === 'bell' || this.phase === 'rising' || this.phase === 'lowering',
      barriers: this.phase !== 'idle' && this.phase !== 'down', mode: this.safe ? 'safe' : 'gap', splashes: this.splashes,
    };
  }
}

// inverse of 1 − smooth01(t) = k  →  t (bisection; k ∈ [0,1])
function findT(target) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (smooth01(m) < target) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
