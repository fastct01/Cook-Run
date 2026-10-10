// Scripted garage player for tests/harness (not used by the game). Walks to state.target[who] along
// planned waypoints and presses E when `near`; holds E on the crank. World-space output.
import { planPath, garageFrame } from '../../sim/garage.js';

export class GarageBot {
  constructor(who, frame) { this.who = who; this.F = frame; this.path = null; this.goal = null; this.cd = 0; }
  tick(G, dt) {
    const out = { mx: 0, mz: 0, run: true, act: false, held: false };
    if (!G) return out;
    this.cd = Math.max(0, this.cd - dt);
    const me = G[this.who];
    if (G.task && G.task[this.who] === 'crank' && this.who === 'rook') {
      out.held = true;
      if (this.cd === 0) { out.act = true; this.cd = 10; }
      return out;
    }
    const tgt = G.target && G.target[this.who];
    if (!tgt || !me || me.inRv) return out;
    const L = this.F.toLocal(me.x, me.z), T = this.F.toLocal(tgt.x, tgt.z);
    if (!this.goal || Math.hypot(this.goal.x - T.x, this.goal.z - T.z) > 0.2) { this.goal = T; this.path = planPath(L.x, L.z, T.x, T.z); }
    if (G.near && G.near[this.who]) { if (this.cd === 0) { out.act = true; this.cd = 0.35; } return out; }
    if (this.path && this.path.length > 1 && Math.hypot(L.x - this.path[0].x, L.z - this.path[0].z) < 0.4) this.path.shift();
    const w = this.path && this.path.length ? this.path[0] : T;
    let dx = w.x - L.x, dz = w.z - L.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const d = this.F.dirToWorld(dx, dz);
    out.mx = d.x; out.mz = d.z;
    return out;
  }
}
export { garageFrame };

/** Turn a world move vector into WASD codes for a camera looking along `yaw` (8 directions). */
export function wasdFor(mx, mz, yaw) {
  const f = mx * Math.sin(yaw) + mz * Math.cos(yaw);
  const r = mx * -Math.cos(yaw) + mz * Math.sin(yaw);
  const codes = [];
  if (f > 0.38) codes.push('KeyW'); else if (f < -0.38) codes.push('KeyS');
  if (r > 0.38) codes.push('KeyD'); else if (r < -0.38) codes.push('KeyA');
  return codes;
}
