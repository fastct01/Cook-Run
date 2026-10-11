// ─────────────────────────────────────────────────────────────────────────────
// FpShop — Round 3 (agent SHOPS): shared machinery for Doc's FIRST-PERSON shop runs. Local only (cook client,
// or the solo host). Replaces the third-person Rook ShopBase.
//   • its own THREE.Scene + camera (Doc's eye 1.62 m) drawn through view.setSceneOverride; Doc's body is not
//     drawn, his gloved hands are (onfoot/fpHands.js, parented to the camera; the camera is in the scene)
//   • input: pointer-lock mouse-look (click the canvas to lock; drag-look when the lock is unavailable),
//     WASD relative to the view, Shift run, ←/→ turn, E / Enter / Space / LMB interact, hold Esc 1 s = abort
//   • "look at it + E": interactables (addTarget) are focused by the view ray (angle, reach, line of sight)
//   • timer = stopDef.shop.timeLimit × rules.shops.timeMult, penalties, onProgress({label, frac, tLeft}) at 4 Hz,
//     result card, onDone(score) / onAbort()
//   • test hooks: setBot(on) (scripted player through the same key/look path), fastForward(s), setLook(yaw, pitch),
//     debugState()
// Subclasses implement: build(), step(h), progress() → {label, frac}, timeUp() → {score, lines}, bot(h), visual(dt),
//   optionally cameraPose() (seated: forklift / crane) and controls().
// Yaw convention (same as World2D.walk): yaw 0 looks along +Z, forward = (sin yaw, cos yaw); pitch > 0 looks up.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { createFpHands } from '../fpHands.js';
import { ShopHud } from './shopHud.js';
import { World2D, walk, clamp, wrap } from './world2d.js';

export const EYE = 1.62;
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'];
const ACT_KEYS = ['KeyE', 'Enter', 'Space'];
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _d = new THREE.Vector3();
const _size = new THREE.Vector2();

export class FpShop {
  constructor(view, stopDef, data, opts = {}) {
    this.view = view;
    this.def = stopDef || {};
    this.shop = this.def.shop || {};
    this.data = data;
    this.opts = opts;
    this.bonusAt = data?.rules?.stops?.bonusScore ?? 0.8;
    this.timeMult = data?.rules?.shops?.timeMult ?? 1;
    this.timeLimit = Math.max(8, (this.shop.timeLimit || 35) * this.timeMult);
    this.t = 0; this.penalty = 0;
    this.phase = 'intro'; this.introT = 0; this.resultT = 0; this.introLen = 0.9;
    this.keys = new Set(); this.vkeys = new Set(); this.edges = new Set();
    this.extraKeys = [];
    this.botOn = false;
    this._done = false; this._aborted = false; this._destroyed = false;
    this.mouse = { down: false };
    this.escHeld = false; this.escT = 0;
    this._look = { dx: 0, dy: 0 };
    this._seen = new WeakSet();
    this.look = { sens: 0.0022, minPitch: -1.3, maxPitch: 1.2 };
    this.P = { x: 0, z: 0, yaw: 0, pitch: -0.1, eye: EYE, bobPh: 0, yawRate: 0, pitchRate: 0, seated: false };
    this.B = { x: 0, z: 0, yaw: 0, vx: 0, vz: 0, speed: 0 };      // the body for World2D.walk (its yaw is unused)
    this.walkSpeed = 3.1; this.runSpeed = 5.2; this.radius = 0.3;
    this.targets = []; this.focus = null; this.holdT = 0; this.goal = null;
    this.handAct = 0; this.handAct2 = 0;
    this.threatSide = 0; this.vigK = 0; this.alertInfo = null; this.promptOverride = null;
    this.shake = 0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#2a2d31');
    this.camera = new THREE.PerspectiveCamera(66, 16 / 9, 0.04, 400);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.hands = createFpHands({ gloves: opts.gloves !== false });
    this.camera.add(this.hands.root);
    this.hands.root.scale.setScalar(0.9); this.hands.root.position.set(0, -0.012, 0);
    this.world = new World2D({ x0: -10, x1: 10, z0: -7, z1: 7 });

    const host = opts.hudRoot || view.canvas?.parentElement || document.body;
    this.hud = new ShopHud(host, { store: this.def.name || 'Shop', controls: this.controls() });
    this.hud.setTimer(this.timeLimit, 1, false);

    this.build();
    this.B.x = this.P.x; this.B.z = this.P.z;
    this._bindPointer();
    view.setSceneOverride((renderer, dt) => this._render(renderer, dt));
    this.hud.fade(1, 0);
    requestAnimationFrame(() => this.hud.fade(0, 320));
    this.hud.intro(this.shop.title || 'Shop run', this.def.name || '');
    this._progT = 0;
    this._visual(0);
  }

  // ── subclass hooks ────────────────────────────────────────────────────────
  build() {}
  step() {}
  progress() { return { label: '', frac: 0 }; }
  timeUp() { return { score: 0.1, lines: ['Out of time'] }; }
  bot() { return null; }
  visual() {}
  controls() { return [['Mouse', 'look'], ['W A S D', 'walk'], ['Shift', 'run'], ['E', 'grab']]; }
  /** Seated modes return { x, y, z, yaw, pitch, lookYaw } (world; lookYaw = the look's offset from the seat heading); null = on foot at P. */
  cameraPose() { return null; }
  get handledKeys() { return MOVE_KEYS.concat(ACT_KEYS, this.extraKeys); }

  // ── public API (via ShopChallenge) ───────────────────────────────────────
  onKey(e, down) {
    if (this._done || this._aborted || this._destroyed) return false;
    const c = e.code;
    if (c === 'Escape') { this.escHeld = !!down; return true; }
    if (!this.handledKeys.includes(c)) return false;
    if (down) { if (!e.repeat && !this.keys.has(c)) this.edges.add(c); this.keys.add(c); }
    else this.keys.delete(c);
    return true;
  }
  clearKeys() { this.keys.clear(); this.escHeld = false; this.mouse.down = false; }
  /** mousemove / mousedown / mouseup (+ pointer* equivalents) from main.js; duplicates of events the shop already saw are ignored. */
  onPointer(e) { this._pointer(e); }
  setBot(on) { this.botOn = !!on; if (on) this.hud.lockHint(false); }
  /** Test hook (pointer lock does not work headless): set the view directly. */
  setLook(yaw, pitch) { if (yaw != null) this.P.yaw = yaw; if (pitch != null) this.P.pitch = clamp(pitch, this.look.minPitch, this.look.maxPitch); this._lookSet = true; }
  abort() {
    if (this._aborted || this._done) return;
    this._aborted = true;
    this.phase = 'aborted';
    try { this.opts.onAbort && this.opts.onAbort(); } catch (e) { console.error(e); }
  }
  get timeLeft() { return Math.max(0, this.timeLimit - this.t - this.penalty); }
  get done() { return this._done; }

  update(dt) {
    this._updated = true;
    dt = clamp(dt || 0, 0, 0.1);
    if (this._aborted || this._destroyed) return;
    const n = Math.max(1, Math.ceil(dt / (1 / 30)));
    for (let i = 0; i < n && !this._destroyed && !this._aborted; i++) this._step(dt / n);   // onDone may destroy us mid-loop
    if (!this._destroyed) this._visual(dt);
  }
  fastForward(sec) {
    const n = Math.round(sec * 60);
    for (let i = 0; i < n && !this._done && !this._aborted && !this._destroyed; i++) this._step(1 / 60);
    if (!this._destroyed) this._visual(1 / 60);
  }

  // ── input helpers ─────────────────────────────────────────────────────────
  held(code) { return this.keys.has(code) || this.vkeys.has(code); }
  pressed(code) { return this.edges.has(code); }
  get actPressed() { return ACT_KEYS.some((c) => this.edges.has(c)) || this.edges.has('MOUSE'); }
  get actHeld() { return ACT_KEYS.some((c) => this.held(c)) || this.mouse.down; }
  get running() { return this.held('ShiftLeft') || this.held('ShiftRight'); }
  axes() {
    const f = (this.held('KeyW') || this.held('ArrowUp') ? 1 : 0) - (this.held('KeyS') || this.held('ArrowDown') ? 1 : 0);
    const r = (this.held('KeyD') ? 1 : 0) - (this.held('KeyA') ? 1 : 0);
    const turn = (this.held('ArrowRight') ? 1 : 0) - (this.held('ArrowLeft') ? 1 : 0);
    return { f, r, turn };
  }
  get fwd() { return { x: Math.sin(this.P.yaw), z: Math.cos(this.P.yaw) }; }

  /** On-foot step: WASD relative to the view. Returns the World2D collider tag hit (or undefined). */
  walkStep(h, { speedMul = 1, canRun = true } = {}) {
    const P = this.P, B = this.B;
    const { f, r } = this.axes();
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw), rx = -Math.cos(P.yaw), rz = Math.sin(P.yaw);
    let x = fx * f + rx * r, z = fz * f + rz * r;
    const l = Math.hypot(x, z); if (l > 1) { x /= l; z /= l; }
    const max = (canRun && this.running ? this.runSpeed : this.walkSpeed) * speedMul;
    B.x = P.x; B.z = P.z;
    const hit = walk(B, x, z, max, h, this.world, this.radius, { accel: 22 });
    P.x = B.x; P.z = B.z;
    return hit;
  }
  get speed() { return this.B.speed; }

  // ── interactables ─────────────────────────────────────────────────────────
  /**
   * t: { id, pos: Vector3 | () => Vector3, r = 0.3 (aim radius, m), reach = 2.3 (m from the eye), label, sub, key = 'E',
   *      when: () => bool, use: () => void, hold: seconds (hold E), los = true }
   */
  addTarget(t) { const T = { r: 0.3, reach: 2.3, key: 'E', los: true, when: () => true, ...t }; this.targets.push(T); return T; }
  targetPos(T) { return typeof T.pos === 'function' ? T.pos() : T.pos; }
  /** Eye position / view direction from the current state (not the camera object, which is placed per frame). */
  eyePos(out = _v) { const s = this.cameraPose(); return s ? out.set(s.x, s.y, s.z) : out.set(this.P.x, this.P.eye, this.P.z); }
  viewDir(out = _f) { const P = this.cameraPose() || this.P; return out.set(Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), Math.cos(P.yaw) * Math.cos(P.pitch)); }
  _focusPick() {
    const eye = this.eyePos(new THREE.Vector3()), fwd = this.viewDir(new THREE.Vector3());
    let best = null, bs = 1;
    for (const T of this.targets) {
      if (!T.when()) continue;
      const p = this.targetPos(T); if (!p) continue;
      _d.subVectors(p, eye);
      const d = _d.length();
      if (d > T.reach + T.r || d < 1e-3) continue;
      _d.divideScalar(d);
      const ang = Math.acos(clamp(_d.dot(fwd), -1, 1));
      const allow = Math.atan2(T.r, d) + 0.06;
      const s = ang / allow;
      if (s > bs) continue;
      if (T.los && !this.P.seated && !this.world.segClear(this.P.x, this.P.z, p.x, p.z, 0.01)) continue;
      best = T; bs = s;
    }
    return best;
  }

  // ── step / visual ─────────────────────────────────────────────────────────
  _step(h) {
    if (this.botOn && this.phase !== 'aborted' && this.phase !== 'done') this._botApply(h);
    // hold Esc 1 s → abort
    if (this.escHeld) { this.escT += h; if (this.escT >= 1) { this.escT = 0; this.abort(); return; } } else this.escT = Math.max(0, this.escT - h * 3);
    this._applyLook(h);
    if (this.phase === 'intro') {
      this.introT += h;
      if (this.introT >= this.introLen) this.phase = 'play';
    } else if (this.phase === 'play') {
      this.t += h;
      this.step(h);
      if (this.phase === 'play') {
        this.focus = this._focusPick();
        const F = this.focus;
        if (F && F.hold) {
          if (this.actHeld) { this.holdT += h; if (this.holdT >= F.hold) { this.holdT = 0; this._use(F); } } else this.holdT = 0;
        } else {
          this.holdT = 0;
          if (F && this.actPressed && !this._consumed) this._use(F);
        }
      }
      this._consumed = false;
      if (this.phase === 'play' && this.timeLeft <= 0) { const r = this.timeUp(); this.finish(r.score, ['Out of time', ...(r.lines || [])], 'TIME!'); }
    } else if (this.phase === 'result') {
      this.resultT += h;
      if ((this.resultT > 0.6 && this.actPressed) || this.resultT >= 2.6) this._continue();
    }
    this.edges.clear();
  }
  _use(T) { this.hands.reach('r'); try { T.use(); } catch (e) { console.error('[shop] use', e); } }
  /** A subclass that handled E itself this step calls this so a focused target does not also fire. */
  consumeAct() { this._consumed = true; }

  _applyLook(h) {
    const P = this.P, L = this.look;
    const { turn } = this.axes();
    let dx = this._look.dx, dy = this._look.dy;
    this._look.dx = 0; this._look.dy = 0;
    if (turn) dx += turn * 2.2 * h / L.sens;
    const y0 = P.yaw, p0 = P.pitch;
    let dyaw = -dx * L.sens;
    if (L.maxYawRate != null && h > 0) dyaw = clamp(dyaw, -L.maxYawRate * h, L.maxYawRate * h);   // heavy turning (trolley)
    P.yaw = wrap(P.yaw + dyaw);
    if (L.yawMin != null) P.yaw = clamp(P.yaw, L.yawMin, L.yawMax);
    P.pitch = clamp(P.pitch - dy * L.sens, L.minPitch, L.maxPitch);
    if (h > 0) {
      const k = Math.min(1, h * 12);
      P.yawRate += (wrap(P.yaw - y0) / h - P.yawRate) * k;
      P.pitchRate += ((P.pitch - p0) / h - P.pitchRate) * k;
    }
  }

  _visual(dt) {
    const P = this.P;
    // camera
    const seat = this.cameraPose();
    const cam = this.camera;
    if (seat) {
      cam.position.set(seat.x, seat.y, seat.z);
      cam.rotation.set(seat.pitch, seat.yaw + Math.PI, 0, 'YXZ');
      this._view = { yaw: seat.yaw, pitch: seat.pitch };
    } else {
      const sp = this.B.speed;
      P.bobPh += sp * dt * 2.1;
      const bob = Math.sin(P.bobPh * 2) * 0.028 * clamp(sp / 3, 0, 1.4);
      cam.position.set(P.x, P.eye + bob, P.z);
      cam.rotation.set(P.pitch, P.yaw + Math.PI, Math.sin(P.bobPh) * 0.004 * clamp(sp / 3, 0, 1.4), 'YXZ');
      this._view = null;
    }
    if (this.shake > 0) { const a = this.shake * 0.025, t = performance.now() / 30; cam.position.x += Math.sin(t * 1.3) * a; cam.position.y += Math.sin(t * 1.7) * a; this.shake = Math.max(0, this.shake - dt * 2.5); }
    cam.updateMatrixWorld();
    // subclass (props, NPCs, hands pose)
    this.visual(dt);
    // hands
    this.hands.update(dt, { walk: this.P.seated ? 0 : clamp(this.B.speed / this.walkSpeed, 0, 1.6), sway: { x: P.yawRate, y: P.pitchRate }, act: this.handAct, act2: this.handAct2, pitch: seat ? seat.pitch : P.pitch, yaw: seat ? (seat.lookYaw ?? 0) : 0 });
    this._hudFrame(dt);
  }

  _hudFrame(dt) {
    const H = this.hud;
    const left = this.phase === 'intro' ? this.timeLimit : this.timeLeft;
    H.setTimer(left, left / this.timeLimit, left < 8 && this.phase === 'play');
    const playing = this.phase === 'play';
    if (playing) {
      const F = this.focus;
      if (this.promptOverride) H.setPrompt(this.promptOverride);
      else if (F) H.setPrompt({ key: F.key, text: F.label, sub: F.sub || '' });
      else H.setPrompt(null);
      H.setCrosshair(F || this.promptOverride ? 'on' : 'idle', F && F.hold ? this.holdT / F.hold : this.crossHold || 0);
      H.setAlert(this.alertInfo);
      H.setThreat(this.threatSide, this.vigK);
      this._marker();
    } else if (this.phase === 'intro') {
      H.setPrompt(null); H.setCrosshair('idle'); H.setMarker(null); H.setEdge(null);
    }
    H.holdEsc(this.escT > 0 ? this.escT : null);
    const lockable = !this.botOn && !this._lookSet && this.phase !== 'result' && !this._done;
    H.lockHint(lockable && !this.locked && !this._noLock);
    // progress callback ~4 Hz
    this._progT -= dt;
    if (this._progT <= 0 && this.opts.onProgress && (this.phase === 'play' || this.phase === 'intro')) {
      this._progT = 0.25;
      const p = this.progress() || {};
      try { this.opts.onProgress({ label: p.label || '', frac: clamp(p.frac || 0, 0, 1), tLeft: Math.round(left * 10) / 10 }); } catch (e) { console.error(e); }
    }
  }

  _marker() {
    const H = this.hud, g = typeof this.goal === 'function' ? this.goal() : this.goal;
    if (!g) { H.setMarker(null); H.setEdge(null); return; }
    this.view.renderer.getSize(_size);
    const W = _size.x, Hh = _size.y;
    _v.copy(g).project(this.camera);
    const behind = _v.z > 1;
    let x = _v.x, y = _v.y;
    if (!behind && Math.abs(x) < 0.9 && Math.abs(y) < 0.86) {
      // hide the chevron when we are basically on it (the crosshair / prompt take over)
      if (this.focus && Math.hypot(x * W / 2, y * Hh / 2) < 30) H.setMarker(null);
      else H.setMarker((x * 0.5 + 0.5) * W, (-y * 0.5 + 0.5) * Hh - 22);
      H.setEdge(null);
      return;
    }
    if (behind) { x = -x; y = -y; }
    const l = Math.hypot(x, y) || 1; x /= l; y /= l;
    const ex = W / 2 + x * (W / 2 - 40), ey = Hh / 2 - y * (Hh / 2 - 60);
    H.setMarker(null);
    H.setEdge(ex, ey, Math.atan2(-y, x));
  }

  _render(renderer, dt) {
    if (!this._updated && this.opts.selfDrive !== false) this.update(dt);   // main.js forgot update(): drive ourselves
    this._updated = false;
    if (this._destroyed) return;
    renderer.getSize(_size);
    const a = _size.x / Math.max(1, _size.y);
    if (Math.abs(this.camera.aspect - a) > 1e-3) { this.camera.aspect = a; this.camera.updateProjectionMatrix(); }
    const clip = renderer.localClippingEnabled;
    if (this.clipping) renderer.localClippingEnabled = true;
    renderer.render(this.scene, this.camera);
    renderer.localClippingEnabled = clip;
    this.drawCalls = renderer.info.render.calls;
  }

  // ── feedback ──────────────────────────────────────────────────────────────
  timePenalty(sec, text = null) {
    this.penalty += sec;
    this.hud.timerHit();
    this.hud.toast(text || `−${sec}s`, 'bad');
    this.hud.flash('red');
    this.shake = Math.max(this.shake, 0.5);
  }
  toast(text, tone = 'info') { this.hud.toast(text, tone); }

  /** End of play: result card; onDone(score) after it (E or 2.6 s). */
  finish(score, lines = [], headline = null) {
    if (this.phase === 'result' || this.phase === 'done') return;
    score = clamp(+score || 0, 0, 1);
    this.score = score;
    this.phase = 'result'; this.resultT = 0;
    this.keys.clear(); this.vkeys.clear(); this.mouse.down = false;
    this.hud.hideAll();
    if (headline) this.hud.toast(headline, score >= 0.5 ? 'good' : 'bad');
    this.hud.flash(score >= 0.5 ? 'green' : 'red');
    this.card = this.hud.result({ title: this.shop.title || '', store: this.def.name || '', score, bonusAt: this.bonusAt, lines, autoMs: 1e9, onContinue: () => this._continue() });
    if (this.opts.onProgress) try { this.opts.onProgress({ label: 'Done', frac: 1, tLeft: Math.round(this.timeLeft * 10) / 10 }); } catch (e) { console.error(e); }
  }
  _continue() {
    if (this._done) return;
    this._done = true;
    this.phase = 'done';
    if (this.card && !this.card.done) this.card.go();
    try { this.opts.onDone && this.opts.onDone(this.score); } catch (e) { console.error(e); }
  }

  // ── pointer: lock on click, look while locked (drag-look without a lock) ─
  get canvas() { return this.view.renderer?.domElement || this.view.canvas || null; }
  get locked() { return typeof document !== 'undefined' && !!this.canvas && document.pointerLockElement === this.canvas; }
  _bindPointer() {
    const cv = this.canvas;
    if (!cv || typeof window === 'undefined') return;
    const onDown = (e) => this._pointer(e), onMove = (e) => this._pointer(e), onUp = (e) => this._pointer(e);
    const onLock = () => { if (!this.locked) this.mouse.down = false; };
    const onLockErr = () => { this._noLock = true; };
    cv.addEventListener('pointerdown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('pointerup', onUp);
    document.addEventListener('pointerlockchange', onLock);
    document.addEventListener('pointerlockerror', onLockErr);
    this._unbind = () => {
      cv.removeEventListener('pointerdown', onDown); window.removeEventListener('mousemove', onMove); window.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointerlockchange', onLock); document.removeEventListener('pointerlockerror', onLockErr);
    };
  }
  _pointer(e) {
    if (!e || this._destroyed || this._done || this._aborted) return;
    if (this._seen.has(e)) return;
    this._seen.add(e);
    const type = e.type;
    if (type === 'mousemove') {                     // look (pointermove copies of the same motion are ignored)
      const dragging = !this.locked && (e.buttons & 1) && this._noLockDrag;
      if (this.locked || dragging) { this._look.dx += e.movementX || 0; this._look.dy += e.movementY || 0; }
      return;
    }
    if (type === 'pointerdown' || type === 'mousedown') {
      if (e.button !== 0 && e.button !== undefined) return;
      if (!this.locked && !this._noLock && !this.botOn) { this._requestLock(); this._noLockDrag = true; return; }
      this._noLockDrag = !this.locked;
      this.mouse.down = true; this.edges.add('MOUSE');
      return;
    }
    if (type === 'pointerup' || type === 'mouseup') { if (e.button === 0 || e.button === undefined) this.mouse.down = false; }
  }
  _requestLock() {
    const c = this.canvas;
    if (!c || !c.requestPointerLock) { this._noLock = true; return; }
    try { const p = c.requestPointerLock(); if (p && p.catch) p.catch(() => { this._noLock = true; }); } catch (e) { this._noLock = true; }
  }

  // ── bot: scripted player through the same key + look path ────────────────
  _botApply(h) {
    const b = this.phase === 'result' ? { act: this.resultT > 0.8 } : this.phase === 'intro' ? {} : this.bot(h) || {};
    const want = new Set(b.keys || []);
    if (b.run) want.add('ShiftLeft');
    if (b.held) want.add('KeyE');
    for (const k of want) if (!this.vkeys.has(k)) this.edges.add(k);
    if (b.act && !this.vkeys.has('KeyE')) this.edges.add('KeyE');
    this.vkeys = want;
    // look: turn toward the wanted angles like a mouse would (rate-limited), via the same delta path
    const rate = (b.turnRate ?? 5) * h, S = this.look.sens;
    if (b.yaw != null) { const d = clamp(wrap(b.yaw - this.P.yaw), -rate, rate); this._look.dx += -d / S; }
    if (b.pitch != null) { const d = clamp(b.pitch - this.P.pitch, -rate, rate); this._look.dy += -d / S; }
  }
  /** Path-follow toward goal {x, z}. → { arrived, yaw, keys, run } (merge into the bot's return). */
  botNav(goal, h, { run = true, arrive = 0.45, radius = 0.32, slowNear = 0 } = {}) {
    const P = this.P;
    const dist = Math.hypot(goal.x - P.x, goal.z - P.z);
    if (dist <= arrive) return { arrived: true, keys: [] };
    const key = `${goal.x.toFixed(2)},${goal.z.toFixed(2)}`;
    let bn = this._bn;
    if (!bn || bn.key !== key || bn.t > 2.5 || !bn.path) bn = this._bn = { key, path: this.world.path(P.x, P.z, goal.x, goal.z, radius), t: 0, st: 0, lx: P.x, lz: P.z, back: 0 };
    bn.t += h; bn.st += h;
    if (bn.st > 0.8) { if (Math.hypot(P.x - bn.lx, P.z - bn.lz) < 0.15) bn.back = 0.45; bn.st = 0; bn.lx = P.x; bn.lz = P.z; }
    if (bn.back > 0) { bn.back -= h; if (bn.back <= 0) bn.path = null; return { arrived: false, keys: ['KeyS', bn.t % 2 > 1 ? 'KeyA' : 'KeyD'] }; }
    const Pth = bn.path;
    while (Pth.length > 1 && Math.hypot(Pth[0].x - P.x, Pth[0].z - P.z) < 0.45) Pth.shift();
    const w = Pth[0] || goal;
    const yaw = Math.atan2(w.x - P.x, w.z - P.z);
    const err = Math.abs(wrap(yaw - P.yaw));
    const keys = err < 0.7 && !(slowNear && dist < slowNear && this.B.speed > 1.6) ? ['KeyW'] : [];
    return { arrived: false, yaw, pitch: -0.1, keys, run: run && err < 0.35 && dist > 1.6 };
  }
  /** Angles to look at a world point from the eye. */
  botAim(p) {
    const P = this.P, dx = p.x - P.x, dz = p.z - P.z;
    return { yaw: Math.atan2(dx, dz), pitch: Math.atan2(p.y - P.eye, Math.hypot(dx, dz)) };
  }
  /** Walk to within reach of target T (optionally to a stand point), look at it, press E when it is focused. */
  botUse(T, h, { stand = null, run = true, radius = 0.32 } = {}) {
    const P = this.P, p = this.targetPos(T);
    const goal = stand || p;
    const reach = Math.min(T.reach, 2.2) - 0.55;
    const d = Math.hypot(p.x - P.x, p.z - P.z);
    if (stand ? Math.hypot(stand.x - P.x, stand.z - P.z) > 0.45 && d > reach : d > reach) {
      const n = this.botNav(goal, h, { run, radius, arrive: stand ? 0.4 : reach });
      if (!n.arrived) return n;
    }
    const a = this.botAim(p);
    this._botCd = Math.max(0, (this._botCd || 0) - h);
    const on = this.focus === T && Math.abs(wrap(a.yaw - P.yaw)) < 0.25;
    if (on && T.hold) return { ...a, held: true };
    if (on && this._botCd <= 0) { this._botCd = 0.3; return { ...a, act: true }; }
    return a;
  }

  debugState() {
    return {
      type: this.shop.type, variant: this.shop.variant || null, phase: this.phase, t: +this.t.toFixed(2), timeLeft: +this.timeLeft.toFixed(2),
      timeLimit: this.timeLimit, score: this.score ?? null, P: { x: +this.P.x.toFixed(2), z: +this.P.z.toFixed(2), yaw: +this.P.yaw.toFixed(3), pitch: +this.P.pitch.toFixed(3) },
      focus: this.focus ? this.focus.id : null, hands: this.hands.pose, calls: this.drawCalls, progress: this.progress(), ...(this.debugExtra ? this.debugExtra() : {}),
    };
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this.view._sceneOverride) this.view.setSceneOverride(null);
    if (this._unbind) this._unbind();
    if (this.locked) { try { document.exitPointerLock(); } catch (e) { /* */ } }
    this.hud.destroy();
    try { this.hands.dispose(); } catch (e) { /* */ }
    this.scene.traverse((o) => {
      if (o.userData && typeof o.userData.dispose === 'function') { try { o.userData.dispose(); } catch (e) { /* */ } }
      if (o.isMesh && o.userData.ownGeo) o.geometry.dispose();
    });
    if (this.dispose) this.dispose();
  }
}

export { World2D, walk, clamp, wrap };
