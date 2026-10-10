// Base class for set-piece plugins (kept separate from host.js so plugins can import it without a cycle).
import { Rng, hashSeed } from '../rng.js';

/**
 * Base class for set-pieces. Subclasses override what they need.
 * `this.sim` is the GameSim — use ONLY the helper API listed in EXPANSION_CONTRACT.md
 * (sim.rv, sim.track, sim.time, sim.newId(), sim.emit(), sim.msg(), sim.damageRv(), sim.pushRv(),
 *  sim.addHeat(), sim.copsList(), sim.applyCopEffect(), sim.redirectCops(), sim.kindId()).
 */
export class SetPiece {
  constructor(host, def) {
    this.host = host;
    this.sim = host.sim;
    this.def = def;
    this.id = def.id;
    this.type = def.type;
    this.rng = new Rng(hashSeed(host.seed, ...[...def.id].map((c) => c.charCodeAt(0))));
    this.phase = 'idle';     // free-form, reported in state()
    this.t = 0;              // seconds since start()
    this.done = false;
  }
  /** [from, to] z range the set-piece cares about. */
  get zone() { const d = this.def; return [d.from ?? d.z ?? 0, d.to ?? d.z ?? 0]; }
  start() {}
  update(dt) { this.t += dt; }
  /** push entity tuples [id, kindId, x, y, z, yaw, variant, state] */
  ents(out) {}
  /** push colliders: { x, z, r, solid?: bool, damage?: number, kind?: string, onHit?(sim) } (circles; use several for long things) */
  colliders(out) {}
  /** number = drivable height at z, null = no surface (gap), undefined = no opinion */
  surfaceY(z) { return undefined; }
  /** true if lane/position (z, u) is blocked for AI traffic & autopilot */
  laneBlocked(z, u) { return false; }
  /** small JSON for snapshot.setpieces (renderer/HUD/audio read it) */
  state() { return { id: this.id, type: this.type, phase: this.phase, t: Math.round(this.t * 100) / 100 }; }
}
