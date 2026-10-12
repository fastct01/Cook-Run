// ─────────────────────────────────────────────────────────────────────────────
// BridgeSystem: the Broken Canyon Bridge jump.
//  • speedNeeded: minimum lip speed (m/s) that clears the gap, solved from the
//    ramp angle θ, lip height h, landing height hL, gap length and gravity, for
//    the RV centre to reach (gapEnd + margin) before dropping below the far deck:
//      vz = v cosθ, vy = v sinθ;  y(t) = h + vy t − g t²/2 = hL  →  t(v)
//      need vz · t(v) ≥ gapLen + margin   (bisection on v)
//  • Launch / land / fall callbacks from vehicle.js. Fall → respawn at
//    checkpointZ in a forward lane, 0 speed, −rules.bridge.missDamage hp and
//    −rules.bridge.missBags bags (difficulty levers; fallback route bridge.fallPenalty),
//    cops cleared, respawnGrace seconds.
//  • Passing the lip (in flight or landed beyond it) → cops give up for good.
// Unity port: CanyonJump (MonoBehaviour) + static BridgeMath.SpeedNeeded().
// ─────────────────────────────────────────────────────────────────────────────
import { forwardLaneU, placeRv } from './vehicle.js';

// Time for a projectile launched at (vy) from height h to come down to hL.
function landTime(vy, h, hL, g) {
  const disc = vy * vy + 2 * g * (h - hL);
  if (disc < 0) return 0;
  return (vy + Math.sqrt(disc)) / g;
}

export function computeSpeedNeeded(bridge, angle, margin = 1.0) {
  const g = bridge.gravity ?? 9.81;
  const gap = (bridge.gapEnd - bridge.gapStart) + margin;
  const h = bridge.rampHeight, hL = bridge.landingHeight ?? 0;
  const reach = (v) => v * Math.cos(angle) * landTime(v * Math.sin(angle), h, hL, g);
  let lo = 0, hi = 200;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (reach(m) >= gap) hi = m; else lo = m; }
  return hi;
}

export class BridgeSystem {
  constructor(sim) {
    this.sim = sim;
    const b = sim.route.bridge;
    this.b = b;
    this.speedNeeded = b ? computeSpeedNeeded(b, sim.track.rampAngle(), sim.cfg.rv.jumpLandMargin) : 0;
    this.launchSpeed = 0;
    this.jumps = 0;
    this.cleared = false;
    this.falls = 0;
    this.passedLip = false;
  }

  dist() { return this.b ? this.b.lip - this.sim.rv.z : 0; }

  onLaunch(speed) {
    this.launchSpeed = speed;
    this.jumps++;
  }

  onLanded(hard) {
    const sim = this.sim, b = this.b;
    if (!b) return;
    if (sim.rv.z >= b.gapEnd && !this.cleared) {
      this.cleared = true;
      sim.emit({ type: 'msg', text: hard ? 'Made it! (ouch)' : 'Made it across!', tone: 'good' });
    }
  }

  onFell() {
    const sim = this.sim, b = this.b, rv = sim.rv, P = b.fallPenalty || {}, M = sim.rules.bridge || {};
    this.falls++;
    sim.emit({ type: 'fell' });
    sim.damageRv(M.missDamage ?? P.rvDamage ?? 30, 'fall');
    const lost = Math.min(sim.inv.units, Math.max(0, Math.round(M.missBags ?? P.productLost ?? 1)));
    if (lost > 0) { sim.inv.units -= lost; sim.inv.value = Math.max(0, sim.inv.value - lost * sim.avgUnitValue()); }
    if (sim.phase !== 'drive') return; // the fall wrecked the RV
    const z = b.checkpointZ;
    placeRv(sim, z, forwardLaneU(sim.road, z));
    rv.grace = sim.cfg.rv.respawnGrace;
    rv.nitroT = 0; rv.flatT = 0;
    sim.cops.clearAll();
    sim.cops.spawnT = 6;
    sim.traffic.reset(z);
    sim.peds.reset(z);
    sim.obstacles.clearDynamicNear(z - 50, z + 250);
    try { sim.setpieces?.resetBehind?.(z); } catch (e) { /* plugin error: ignore */ }
    this.passedLip = false;
    // the bridge give-up is permanent only once you actually make it; a fall resets the chase calm
    sim.heat.bust = 0;
    sim.emit({ type: 'msg', text: lost > 0 ? `Into the canyon! Lost ${lost} ${sim.data.lab.product.unitName}${lost > 1 ? 's' : ''}. Back to the checkpoint.` : 'Into the canyon! Back to the checkpoint.', tone: 'bad' });
  }

  update() {
    const sim = this.sim, b = this.b, rv = sim.rv;
    if (!b) return;
    if (!this.passedLip && rv.z > b.lip) {
      this.passedLip = true;
      if (sim.rules.heat.giveUpAtBridge !== false && !sim.heat.gaveUp) {
        sim.heat.giveUp();
        sim.cops.bridgeGiveUp();
        sim.emit({ type: 'copsGaveUp' });
        sim.emit({ type: 'msg', text: "The cops can't follow you over the canyon!", tone: 'good' });
      }
    }
  }
}
