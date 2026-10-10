// ─────────────────────────────────────────────────────────────────────────────
// Set-piece host: runs the scripted events listed in route.json `setpieces`.
// Pure logic (no DOM/three). One plugin class per set-piece `type`, registered
// in ./index.js. GameSim owns one host (see EXPANSION_CONTRACT.md §Sim hooks):
//
//   this.setpieces = new SetPieceHost(this);          // constructor
//   this.setpieces.update(dt);                         // every step, phase 'drive'
//   this.setpieces.ents(out);                          // snapshot: push entity tuples
//   this.setpieces.colliders(out);                     // collision: push collider objects
//   this.setpieces.surfaceY(z)                         // number | null (gap) | undefined (no opinion)
//   this.setpieces.laneBlocked(z, u)                   // bool — traffic/autopilot avoid
//   this.setpieces.state()                             // snapshot.setpieces
//
// Unity: a SetPieceDirector MonoBehaviour holding ISetPiece instances.
// ─────────────────────────────────────────────────────────────────────────────
import { SETPIECE_TYPES } from './index.js';
export { SetPiece } from './base.js';

const ACTIVATE_AHEAD = 450;   // m before the set-piece zone starts
const DEACTIVATE_BEHIND = 250; // m after the zone ends

export class SetPieceHost {
  constructor(sim) {
    this.sim = sim;
    this.seed = sim.seed >>> 0;
    this.defs = (sim.data.route.setpieces || []).slice();
    this.active = [];
    this.started = new Set();
    this.finished = new Set();
  }

  _range(def) {
    const from = def.from ?? def.z ?? 0, to = def.to ?? def.z ?? from;
    return [from - ACTIVATE_AHEAD, to + DEACTIVATE_BEHIND];
  }

  update(dt) {
    const z = this.sim.rv?.z ?? 0;
    // activate
    for (const def of this.defs) {
      if (this.started.has(def.id)) continue;
      const [a, b] = this._range(def);
      if (z >= a && z <= b) {
        const Cls = SETPIECE_TYPES[def.type];
        this.started.add(def.id);
        if (!Cls) continue;   // unknown type: silently skipped (data can run ahead of code)
        const sp = new Cls(this, def);
        this.active.push(sp);
        try { sp.start(); } catch (e) { console.error('[setpiece] start', def.id, e); sp.done = true; }
      }
    }
    // update + retire
    for (const sp of this.active) {
      if (sp.done) continue;
      try { sp.update(dt); } catch (e) { console.error('[setpiece] update', sp.id, e); sp.done = true; }
      const [, b] = this._range(sp.def);
      if (z > b + 200) sp.done = true;
    }
    if (this.active.some((s) => s.done)) {
      for (const s of this.active) if (s.done) this.finished.add(s.id);
      this.active = this.active.filter((s) => !s.done);
    }
  }

  ents(out) { for (const sp of this.active) sp.ents(out); return out; }
  colliders(out) { for (const sp of this.active) sp.colliders(out); return out; }
  surfaceY(z) {
    for (const sp of this.active) { const y = sp.surfaceY(z); if (y !== undefined) return y; }
    return undefined;
  }
  laneBlocked(z, u) { for (const sp of this.active) if (sp.laneBlocked(z, u)) return true; return false; }
  state() { return this.active.map((sp) => sp.state()); }
  /** respawn at a checkpoint behind a set-piece: let it run again if the player comes back */
  resetBehind(z) {
    for (const def of this.defs) {
      const [a] = this._range(def);
      if (a > z && this.finished.has(def.id)) { this.finished.delete(def.id); this.started.delete(def.id); }
    }
  }
}
