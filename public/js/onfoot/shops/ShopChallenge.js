// ─────────────────────────────────────────────────────────────────────────────
// ShopChallenge — the driver-side shop challenge at a supply stop (Agent ONFOOT). Local, not networked.
//
//   const shop = new ShopChallenge(view, stopDef, data, { onDone(score), onAbort(), hudRoot });
//   shop.update(dt)            every frame (logic; it also self-drives if you forget, via the scene override)
//   shop.onKey(e, down) → bool keydown/keyup while shopping (WASD/arrows, Shift, E/Space/Enter, R/F, Esc)
//   shop.destroy()             after onDone / onAbort (releases view.setSceneOverride and the DOM)
// Pointer: left click / tap on view.renderer.domElement = E.
// Types (stopDef.shop.type): collect (+ variant 'trolley'), haggle, forklift, pump, goat, crane, alarm.
// Each renders its OWN THREE.Scene through view.setSceneOverride((renderer, dt) => …).
// Test hooks: setBot(true) (scripted player through the same key path), fastForward(sec), debugState().
// ─────────────────────────────────────────────────────────────────────────────
import { CollectChallenge } from './collect.js';
import { HaggleChallenge } from './haggle.js';
import { ForkliftChallenge } from './forklift.js';
import { PumpChallenge } from './pump.js';
import { GoatChallenge } from './goat.js';
import { CraneChallenge } from './crane.js';
import { AlarmChallenge } from './alarm.js';

export const SHOP_TYPES = Object.freeze({
  collect: CollectChallenge, haggle: HaggleChallenge, forklift: ForkliftChallenge, pump: PumpChallenge,
  goat: GoatChallenge, crane: CraneChallenge, alarm: AlarmChallenge,
});

export class ShopChallenge {
  constructor(view, stopDef, data, opts = {}) {
    const type = stopDef?.shop?.type;
    const C = SHOP_TYPES[type] || CollectChallenge;
    if (!SHOP_TYPES[type]) console.warn(`[onfoot] unknown shop type "${type}", using collect`);
    this.type = type;
    this.stopId = stopDef?.id;
    this.impl = new C(view, stopDef, data, opts);
  }
  update(dt) { this.impl.update(dt); }
  onKey(e, down) { return this.impl.onKey(e, down); }
  destroy() { this.impl.destroy(); }
  get done() { return this.impl._done; }
  get score() { return this.impl.score ?? null; }
  setBot(on) { this.impl.setBot(on); }
  fastForward(sec) { this.impl.fastForward(sec); }
  debugState() { return this.impl.debugState(); }
}
