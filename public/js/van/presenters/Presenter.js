// ─────────────────────────────────────────────────────────────────────────────
// Presenter base (Agent VANCOOK) — the 3D view + 3D input of ONE lab step.
//
// A presenter sits on a station's anchor (VAN_CONTRACT "ANCHOR FRAME"), builds its props
// as children of a root group, reads the LIVE minigame (ctx.lab.current — the same object
// CookLab updates) every frame, and turns 3D pointer hits into that minigame's input.
// It never advances the minigame logic itself; CookLab.update() does.
//
// Unity: Presenter = MonoBehaviour on the station prefab; Update() reads the C# minigame's
// public state, OnPointer*(hit) maps RaycastHit.point (station-local) to minigame input.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const _v = new THREE.Vector3();

export class Presenter {
  /**
   * @param {string} type   step type ('grind' …)
   * @param {object} ctx    { anchor: Object3D, lab?: CookLab, game?: Minigame, step?: object, recipe?: object }
   */
  constructor(type, ctx = {}) {
    this.type = type;
    this.ctx = ctx;
    this.anchor = ctx.anchor || null;
    this.lab = ctx.lab || null;
    const cur = this.lab?.current;
    this.g = ctx.game || (cur && cur.type === type ? cur : null);
    this.step = ctx.step || this.g?.params || {};
    this.recipe = ctx.recipe || this.lab?.recipe || null;
    this.root = new THREE.Group();
    this.root.name = `presenter_${type}`;
    this.body = new THREE.Group();         // shaken on bumps
    this.body.name = 'body';
    this.root.add(this.body);
    if (this.anchor) this.anchor.add(this.root);
    this.t = 0;
    this.active = true;
    this.feel = { latAcc: 0, bump: 0, speed: 0, bumpHit: 0 };
    this.dragging = false;
    this._pick = [];
    this._dragPick = null;
    this._disposables = [];
    this._shake = 0;
    this._prevBumpFlash = 0;
    this.disposed = false;
  }

  // ── state helpers ───────────────────────────────────────────────────────────
  /** The minigame this presenter shows (live object; may be finished during the step pause). */
  get game() { return this.g; }
  /** Material (ingredient) of the step: { id, name, color }. */
  get material() { return this.g?.material || { id: 'salts', name: 'Mesa Salts', color: '#e8e1cf' }; }
  /** Product colour (lab.json product.color). */
  get productColor() { return this.lab?.product?.color || this.g?.ctx?.product?.color || '#7fd6c2'; }
  /** True when pointer input may reach the minigame right now (Doc working here, step live, lab allows input). */
  get playable() {
    const g = this.g;
    if (!this.active || !g || g.done || g.failed) return false;
    if (!this.lab) return true;
    return this.lab.inputEnabled && this.lab.current === g;
  }
  /** Short control hint for the HUD (override). */
  get hint() { return ''; }
  /** CSS cursor while working this station (the minigame's own hint: 'grab', 'pointer', 'ns-resize', …). */
  get cursor() { return this.playable ? (this.g?.cursor || 'default') : 'default'; }
  /** Progress 0..1 and score for HUDs that only hold the presenter. */
  get progress() { return this.g ? this.g.progress : 0; }
  get score() { return this.g ? this.g.score : 0; }

  /** Register something to dispose with the presenter (geometry / material / texture / helper with dispose()). */
  own(x) { if (x) this._disposables.push(x); return x; }

  // ── frame ───────────────────────────────────────────────────────────────────
  /** @param {number} dt  @param {{feel?, active?}} o */
  update(dt, o = {}) {
    if (this.disposed) return;
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    this.t += dt;
    const wasActive = this.active;
    this.active = o.active !== false;
    if (o.feel) this.feel = o.feel; else if (this.lab?.feel) this.feel = this.lab.feel;
    const cur = this.lab?.current;
    if (cur && cur !== this.g && cur.type === this.type) { this.g = cur; this.step = cur.params || this.step; this._onGameChanged?.(); }
    if (wasActive && !this.active) {
      // Doc stepped away: the host stops forwarding input, so drop drags and held keys now
      if (this.dragging) this._endDrag();
      if (this._keysHeld) this._keysHeld.clear();
      this._releaseKeys();
    }
    // bump shake (CookLab.bumpFlash jumps to 1 on big bumps)
    const bf = this.lab?.bumpFlash ?? 0;
    if (bf > this._prevBumpFlash + 0.3) this._shake = 1;
    this._prevBumpFlash = bf;
    if ((this.feel?.bumpHit || 0) > 0.3) this._shake = Math.max(this._shake, this.feel.bumpHit);
    this._shake = Math.max(0, this._shake - dt * 4);
    const s = this._shake * this._shake * 0.006;
    this.body.position.set(Math.sin(this.t * 61) * s, Math.abs(Math.sin(this.t * 47)) * s, Math.cos(this.t * 53) * s);
    if (this.g) this._update(dt);
  }
  _update(_dt) {}

  // ── input (hit = { local: Vector3 in anchor space, object } | null) ──────────
  /** Meshes to raycast. Call per raycast: while dragging it may return a drag plane only. */
  pick() { return this.dragging && this._dragPick ? this._dragPick : this._pick; }
  pointerDown(_hit) { return false; }
  pointerMove(_hit) {}
  pointerUp(_hit) { if (this.dragging) this._endDrag(); }
  _endDrag() { this.dragging = false; }
  /** Forget held-key state (override in presenters that play keys). */
  _releaseKeys() {}
  /** Keyboard play (KeyboardEvent.code). Return true if consumed. */
  key(_code, _isDown) { return false; }
  /**
   * Key bookkeeping for subclasses: a keyup is only consumed if its keydown was, so the host
   * never ends up with a key stuck in its own held set (e.g. A/D = walk in VanLab3D).
   * Returns true when the event belongs to this presenter; `wants` = this presenter plays that key.
   */
  _keyGate(code, isDown, wants) {
    this._keysHeld = this._keysHeld || new Set();
    if (isDown) {
      if (this._keysHeld.has(code)) return true;                 // auto-repeat
      if (!wants || !this.playable) return false;
      this._keysHeld.add(code);
      return true;
    }
    if (!this._keysHeld.has(code)) return false;
    this._keysHeld.delete(code);
    return true;
  }

  // ── camera / debug ──────────────────────────────────────────────────────────
  /** Close-up pose in ANCHOR space: { pos: Vector3, target: Vector3, fov }. */
  camera() { return { pos: new THREE.Vector3(0, 0.65, 0.6), target: new THREE.Vector3(0, 0.08, -0.3), fov: 45 }; }
  /**
   * Test/automation helper: where to aim (anchor-local, plain arrays). Shape depends on the type:
   *   { kind: 'circle', center, radius }          grind / stir   (drag in circles)
   *   { kind: 'hold', point }                      measure        (press & hold)
   *   { kind: 'knob', point, up, perDial }         heat           (drag along `up`: perDial metres = full range)
   *   { kind: 'slide', point, axis, perHand }      cool           (move along x)
   *   { kind: 'click', points: [[x,y,z], …] }      break / hammer (click the first one)
   */
  debugTargets() { return { kind: 'none' }; }

  /** Number of visible draw calls under the root (perf budget check). */
  drawCalls() {
    let n = 0;
    this.root.traverseVisible((o) => { if ((o.isMesh || o.isInstancedMesh || o.isPoints || o.isLine) && !o.userData.hitProxy && !(o.isInstancedMesh && o.count === 0)) n++; });
    return n;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.dragging) this._endDrag();
    this.root.removeFromParent();
    this.root.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.userData.ownGeometry && o.geometry) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); });
    for (const d of this._disposables) { try { d.dispose?.(); } catch (e) { /* ignore */ } }
    this._disposables.length = 0;
  }

  // ── helpers for subclasses ──────────────────────────────────────────────────
  /** Anchor-space point → this.body space (props live in body; body only jitters a few mm). */
  _toBody(p) { return _v.copy(p).sub(this.body.position); }
}

/** Unity-style damp: move a toward b with rate r (1/s). */
export function damp(a, b, r, dt) { return a + (b - a) * (1 - Math.exp(-r * dt)); }
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
