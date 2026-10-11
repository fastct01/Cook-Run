// ─────────────────────────────────────────────────────────────────────────────
// ShopChallenge — Doc's FIRST-PERSON shop run at a supply stop (Round 3, agent SHOPS). Local, not networked:
// it runs on the cook client (or the solo host) and reports through the callbacks.
//
//   const shop = new ShopChallenge(view, stopDef, data, {
//     hudRoot, onDone(score), onAbort(), onProgress({ label, frac, tLeft }) /* ~4 Hz */, firstPerson: true });
//   shop.update(dt)            every frame (it also self-drives through the scene override if you forget)
//   shop.onKey(e, down) → bool keydown/keyup: WASD, Shift, ←/→ turn, E/Enter/Space, R/F/Q/Z (forks), Esc (hold 1 s = abort)
//   shop.onPointer(e)          optional: mousemove/mousedown/mouseup (or pointer*) — the shop also listens on the canvas
//                              itself (click = pointer lock, then look; LMB = interact); duplicate events are ignored
//   shop.destroy()             after onDone / onAbort (releases view.setSceneOverride, the DOM, the pointer lock)
// Test hooks: setBot(true) (scripted player through the same key + look path), fastForward(sec), setLook(yaw, pitch)
// (pointer lock does not work headless), debugState().
// Types (stopDef.shop.type): collect (+ variant 'trolley'), haggle, forklift, pump, goat, crane, alarm.
// Each renders its OWN THREE.Scene through view.setSceneOverride((renderer, dt) => …).
// Time limit: stopDef.shop.timeLimit × (data.rules.shops?.timeMult ?? 1).
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
    if (!SHOP_TYPES[type]) console.warn(`[shops] unknown shop type "${type}", using collect`);
    this.type = type;
    this.stopId = stopDef?.id;
    this.impl = new C(view, stopDef, data, opts);
  }
  update(dt) { this.impl.update(dt); }
  onKey(e, down) { return this.impl.onKey(e, down); }
  onPointer(e) { this.impl.onPointer?.(e); }
  clearKeys() { this.impl.clearKeys?.(); }
  destroy() { this.impl.destroy(); }
  get done() { return this.impl._done; }
  get aborted() { return this.impl._aborted; }
  get score() { return this.impl.score ?? null; }
  get timeLeft() { return this.impl.timeLeft; }
  setBot(on) { this.impl.setBot(on); }
  setLook(yaw, pitch) { this.impl.setLook?.(yaw, pitch); }
  fastForward(sec) { this.impl.fastForward(sec); }
  debugState() { return this.impl.debugState(); }
}
