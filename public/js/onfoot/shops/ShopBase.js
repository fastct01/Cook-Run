// ─────────────────────────────────────────────────────────────────────────────
// ShopBase — shared machinery for the driver's shop challenges (Agent ONFOOT). Local only.
// Owns its own THREE.Scene + camera + lights, drawn through view.setSceneOverride; Rook on foot in
// third person (createModel('driver') + walk cycle); WASD/arrows camera-relative, Shift run,
// E / Enter / left click = interact, Space = jump (interact while Rook is hidden in a machine), Esc = abort; goal line + timer + prompts + result card.
// Subclasses implement: build(), step(h), timeUp() → {score, lines}, bot(h) (scripted test player).
// Unity: a ShopChallenge base MonoBehaviour in its own additive scene; subclasses per type.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { createModel } from '../../assets/index.js';
import { Avatar } from '../avatar.js';
import { OnfootHud, el, keycaps, resultCard } from '../hud.js';
import { World2D, walk, clamp, wrap } from './world2d.js';
import { JUMP, tryJump, stepJump, resetJump } from '../../shared/jump.js';

const _p = new THREE.Vector3();
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'];
const ACT_KEYS = ['KeyE', 'Enter'];
const JUMP_KEYS = ['Space'];

export class ShopBase {
  constructor(view, stopDef, data, opts = {}) {
    this.view = view;
    this.def = stopDef;
    this.shop = stopDef.shop || {};
    this.data = data;
    this.opts = opts;
    this.bonusAt = data?.rules?.stops?.bonusScore ?? 0.8;
    this.timeLimit = this.shop.timeLimit || 60;
    this.t = 0; this.penalty = 0;
    this.phase = 'intro'; this.introT = 0; this.resultT = 0;
    this.keys = new Set(); this.vkeys = new Set(); this.edges = new Set();
    this.extraKeys = [];
    this.botOn = false;
    this.prompt = null;
    this._done = false; this._aborted = false;
    this.mouse = { x: 0, y: 0, down: false };

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#2a2d31');
    this.camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 500);
    this.cam = { yaw: Math.PI, dist: 7.5, h: 6.0, look: 1.0, fov: 52, x: 0, z: 0, pos: null, at: null, lag: 5 };
    this.world = new World2D({ x0: -10, x1: 10, z0: -7, z1: 7 });
    this.rook = { x: 0, z: 0, yaw: 0, vx: 0, vz: 0, speed: 0, act: 0, carry: null, frozen: false, jt: -1, jumpBuf: 0, y: 0 };
    this.rookAv = new Avatar(createModel('driver'), { name: 'rook' });
    this.scene.add(this.rookAv.root);
    this.walkSpeed = 2.6; this.runSpeed = 4.2;

    const host = opts.hudRoot || view.canvas?.parentElement || document.body;
    this.hud = new OnfootHud(host, { kind: 'shop', role: 'driver' });
    const head = el('div', 'ofs-head', this.hud.top);
    this.goalEl = el('div', 'ofs-goal', head, `<b>${keycaps(this.shop.title || 'Shop run')}</b><span>${keycaps(this.shop.goal || '')}</span>`);
    this.timerEl = el('div', 'ofs-timer', head, '<b>0:00</b><i></i>');
    this.timerB = this.timerEl.querySelector('b'); this.timerI = this.timerEl.querySelector('i');
    el('div', 'ofs-esc', this.hud.root, '<kbd>Esc</kbd> give up');
    this.alertEl = el('div', 'ofs-alert', this.hud.root);

    this.build();
    this._bindPointer();
    view.setSceneOverride((renderer, dt) => this._render(renderer, dt));
    this.hud.fade(1, 0);
    requestAnimationFrame(() => this.hud.fade(0, 500));
    this.hud.pop(this.shop.title || 'GO', 'big');
  }

  // ── subclass hooks ────────────────────────────────────────────────────────
  build() {}
  step() {}
  timeUp() { return { score: 0.1, lines: ['Out of time'] }; }
  bot() { return null; }
  visual() {}
  get handledKeys() { return MOVE_KEYS.concat(ACT_KEYS, JUMP_KEYS, this.extraKeys); }
  /** Space acts as interact (not jump) while this is true: Rook is hidden in a machine. Subclasses extend it. */
  get spaceActs() { return !this.rookAv.visible; }
  canJump() { const R = this.rook; return this.phase === 'play' && !R.frozen && !this.spaceActs && R.carry !== 'push' && R.carry !== 'wheel'; }

  // ── public API (via ShopChallenge) ───────────────────────────────────────
  onKey(e, down) {
    if (this._done || this._aborted) return false;
    const c = e.code;
    if (c === 'Escape') { if (down) this.abort(); return true; }
    if (!this.handledKeys.includes(c)) return false;
    if (down) { if (!e.repeat && !this.keys.has(c)) this.edges.add(c); this.keys.add(c); }
    else this.keys.delete(c);
    return true;
  }
  setBot(on) { this.botOn = !!on; }
  abort() {
    if (this._aborted || this._done) return;
    this._aborted = true;
    this.phase = 'aborted';
    try { this.opts.onAbort && this.opts.onAbort(); } catch (e) { console.error(e); }
  }
  get timeLeft() { return Math.max(0, this.timeLimit - this.t - this.penalty); }

  update(dt) {
    this._updated = true;
    dt = clamp(dt || 0, 0, 0.1);
    if (this._aborted || this._destroyed) return;
    const n = Math.max(1, Math.ceil(dt / (1 / 30)));
    for (let i = 0; i < n && !this._destroyed; i++) this._step(dt / n);   // onDone may destroy us mid-loop
    if (!this._destroyed) this._visual(dt);
  }
  fastForward(sec) { const n = Math.round(sec * 60); for (let i = 0; i < n && !this._done && !this._aborted; i++) this._step(1 / 60); this._visual(1 / 60); }

  // ── input helpers ─────────────────────────────────────────────────────────
  held(code) { return this.keys.has(code) || this.vkeys.has(code); }
  pressed(code) { return this.edges.has(code); }
  get actPressed() { return ACT_KEYS.some((c) => this.edges.has(c)) || this.edges.has('MOUSE') || (this.spaceActs && this.edges.has('Space')); }
  get actHeld() { return ACT_KEYS.some((c) => this.held(c)) || this.mouse.down || this.vkeys.has('MOUSE') || (this.spaceActs && this.held('Space')); }
  get running() { return this.held('ShiftLeft') || this.held('ShiftRight'); }
  /** WASD relative to the camera → world vector. */
  moveInput(yaw = this.cam.yaw) {
    const f = (this.held('KeyW') || this.held('ArrowUp') ? 1 : 0) - (this.held('KeyS') || this.held('ArrowDown') ? 1 : 0);
    const r = (this.held('KeyD') || this.held('ArrowRight') ? 1 : 0) - (this.held('KeyA') || this.held('ArrowLeft') ? 1 : 0);
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    let x = fx * f + rx * r, z = fz * f + rz * r;
    const l = Math.hypot(x, z); if (l > 1) { x /= l; z /= l; }
    return { x, z, f, r };
  }
  /** Standard on-foot step for Rook. */
  walkRook(h, { speedMul = 1, canRun = true } = {}) {
    const R = this.rook;
    R.act = Math.max(0, R.act - h);
    if (R.frozen) { R.vx = R.vz = R.speed = 0; return null; }
    const m = this.moveInput();
    const max = (canRun && this.running ? this.runSpeed : this.walkSpeed) * speedMul;
    return walk(R, m.x, m.z, max, h, this.world, 0.3, { accel: R.jt >= 0 ? 16 * JUMP.airControl : 16 });
  }
  near(p, r = 1.15) { return Math.hypot(this.rook.x - p.x, this.rook.z - p.z) <= r; }

  // ── step / visual ─────────────────────────────────────────────────────────
  _step(h) {
    if (this.botOn && (this.phase === 'play' || this.phase === 'result')) this._botApply(h);
    if (this.phase === 'intro') {
      this.introT += h;
      if (this.introT >= 1.0) { this.phase = 'play'; }
    } else if (this.phase === 'play') {
      this.t += h;
      if (JUMP_KEYS.some((c) => this.edges.has(c)) && this.canJump()) tryJump(this.rook);
      this.step(h);
      if (this.canJump() || this.rook.jt >= 0) stepJump(this.rook, h, this.canJump()); else resetJump(this.rook);
      if (this.phase === 'play' && this.timeLeft <= 0) { const r = this.timeUp(); this.finish(r.score, ['⏱ Out of time', ...(r.lines || [])], 'TIME!'); }
    } else if (this.phase === 'result') {
      this.resultT += h;
      if (this.resultT > 0.6 && (this.actPressed || this.edges.has('Space'))) this._continue();
      else if (this.resultT >= 3.4) this._continue();
    }
    this.edges.clear();
  }
  _botApply(h) {
    const b = this.phase === 'result' ? { act: this.resultT > 1.0 } : this.bot(h) || {};
    const want = new Set();
    if (b.move) {
      const yaw = this.cam.yaw;
      const f = b.move.x * Math.sin(yaw) + b.move.z * Math.cos(yaw);
      const r = b.move.x * -Math.cos(yaw) + b.move.z * Math.sin(yaw);
      const th = b.fine ? 0.2 : 0.38;
      if (f > th) want.add('KeyW'); else if (f < -th) want.add('KeyS');
      if (r > th) want.add('KeyD'); else if (r < -th) want.add('KeyA');
    }
    if (b.run) want.add('ShiftLeft');
    if (b.held) want.add('KeyE');
    for (const k of b.keys || []) want.add(k);
    for (const k of want) if (!this.vkeys.has(k)) this.edges.add(k);
    if (b.act && !this.vkeys.has('KeyE')) this.edges.add('KeyE');
    this.vkeys = want;
  }

  _visual(dt) {
    const R = this.rook;
    this.rookAv.set({ x: R.x, z: R.z, y: R.y || 0, yaw: R.yaw, speed: R.speed, carry: R.carry, act: R.act, run: R.speed > 3.3 });
    this.rookAv.update(dt);
    this.visual(dt);
    // timer
    const left = this.phase === 'intro' ? this.timeLimit : this.timeLeft;
    const s = Math.ceil(left);
    const txt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (this._tt !== txt) { this._tt = txt; this.timerB.textContent = txt; }
    this.timerI.style.transform = `scaleX(${(left / this.timeLimit).toFixed(3)})`;
    this.timerEl.classList.toggle('low', left < 10 && this.phase === 'play');
    // prompt
    if (this.phase === 'play' && this.prompt) this.hud.instruction(this.prompt.text, { near: !!this.prompt.near, who: this.prompt.who || 'ROOK', sub: this.prompt.sub || '' });
    else if (this.phase === 'intro') this.hud.instruction(this.shop.goal || '', { who: 'GET READY', sub: '[W][A][S][D] move · [Shift] run · [Space] jump · [E] interact' });
    this._camera(dt);
  }

  /** Follow camera: look at (cam.x, look, cam.z) from yaw/dist/h. */
  _camera(dt) {
    const c = this.cam;
    const tx = c.x, tz = c.z;
    const want = _p.set(tx - Math.sin(c.yaw) * c.dist, c.h, tz - Math.cos(c.yaw) * c.dist);
    if (!c.pos) { c.pos = want.clone(); c.at = new THREE.Vector3(tx, c.look, tz); }
    const k = c.snap ? 1 : 1 - Math.exp(-dt * c.lag);
    c.pos.lerp(want, k);
    c.at.lerp(new THREE.Vector3(tx, c.look, tz), c.snap ? 1 : 1 - Math.exp(-dt * (c.lag + 3)));
    c.snap = false;
    this.camera.position.copy(c.pos);
    if (this.shake > 0) { const a = this.shake * 0.08, t = performance.now() / 25; this.camera.position.x += Math.sin(t * 1.3) * a; this.camera.position.y += Math.sin(t * 1.7) * a; this.shake = Math.max(0, this.shake - dt * 2.5); }
    this.camera.lookAt(c.at);
    if (this.camera.fov !== c.fov) { this.camera.fov = c.fov; this.camera.updateProjectionMatrix(); }
  }

  _render(renderer, dt) {
    if (!this._updated) this.update(dt);   // main.js forgot update(): drive ourselves
    this._updated = false;
    const sz = renderer.getSize(new THREE.Vector2());
    const a = sz.x / Math.max(1, sz.y);
    if (Math.abs(this.camera.aspect - a) > 1e-3) { this.camera.aspect = a; this.camera.updateProjectionMatrix(); }
    const clip = renderer.localClippingEnabled;
    if (this.clipping) renderer.localClippingEnabled = true;
    renderer.render(this.scene, this.camera);
    renderer.localClippingEnabled = clip;
    this.drawCalls = renderer.info.render.calls;
  }

  // ── feedback ──────────────────────────────────────────────────────────────
  screenOf(v, up = 0) {
    _p.copy(v); _p.y += up; _p.project(this.camera);
    if (_p.z > 1) return null;
    const cv = this.view.renderer.domElement, r = cv.getBoundingClientRect(), hr = this.hud.root.getBoundingClientRect();
    return { x: (_p.x * 0.5 + 0.5) * r.width + (r.left - hr.left), y: (-_p.y * 0.5 + 0.5) * r.height + (r.top - hr.top) };
  }
  popAt(text, tone, x, y, z) { const s = this.screenOf(new THREE.Vector3(x, y, z)); return this.hud.pop(text, tone, s ? s.x : null, s ? s.y : null); }
  popRook(text, tone = 'good') { return this.popAt(text, tone, this.rook.x, 2.3, this.rook.z); }
  timePenalty(sec, text = null) {
    this.penalty += sec;
    this.timerEl.classList.remove('hit'); void this.timerEl.offsetWidth; this.timerEl.classList.add('hit');
    this.hud.pop(text || `−${sec}s`, 'bad', null, null);
    this.shake = Math.max(this.shake || 0, 0.6);
  }
  flashAlert(ms = 600) { this.alertEl.classList.add('on'); clearTimeout(this._alertTm); this._alertTm = setTimeout(() => this.alertEl.classList.remove('on'), ms); }

  /** End of play: show the result card; onDone(score) after it. */
  finish(score, lines = [], headline = null) {
    if (this.phase === 'result' || this.phase === 'done') return;
    score = clamp(+score || 0, 0, 1);
    this.score = score;
    this.phase = 'result'; this.resultT = 0;
    this.prompt = null;
    this.keys.clear(); this.vkeys.clear();
    if (headline) this.hud.pop(headline, 'big');
    this.hud.bottom.style.display = 'none';
    this.hud.root.querySelectorAll('.ofs-meter, .ofs-seen, .ofs-list').forEach((e) => { e.style.display = 'none'; });
    this.card = resultCard(this.hud.center, { title: `${this.def.name} · ${this.shop.title || ''}`, score, bonusAt: this.bonusAt, lines, autoMs: 1e9, onContinue: () => this._continue() });
  }
  _continue() {
    if (this._done) return;
    this._done = true;
    this.phase = 'done';
    if (this.card && !this.card.done) this.card.go();
    try { this.opts.onDone && this.opts.onDone(this.score); } catch (e) { console.error(e); }
  }

  _bindPointer() {
    const cv = this.view.renderer && this.view.renderer.domElement;
    if (!cv) return;
    const pos = (e) => { const r = cv.getBoundingClientRect(); this.mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1; this.mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1; };
    const down = (e) => { if (e.button !== 0) return; pos(e); this.mouse.down = true; this.edges.add('MOUSE'); };
    const move = (e) => pos(e);
    const up = (e) => { if (e.button === 0) this.mouse.down = false; };
    cv.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    this._unbind = () => { cv.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }

  debugState() { return { type: this.shop.type, variant: this.shop.variant || null, phase: this.phase, t: this.t, timeLeft: this.timeLeft, score: this.score ?? null, rook: { x: +this.rook.x.toFixed(2), z: +this.rook.z.toFixed(2) }, calls: this.drawCalls, ...(this.debugExtra ? this.debugExtra() : {}) }; }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this.view._sceneOverride) this.view.setSceneOverride(null);
    if (this._unbind) this._unbind();
    clearTimeout(this._alertTm);
    this.hud.destroy();
    this.scene.traverse((o) => {
      if (o.userData && typeof o.userData.dispose === 'function') { try { o.userData.dispose(); } catch (e) { /* */ } }
      if (o.isMesh && o.userData.ownGeo) o.geometry.dispose();
    });
    if (this.dispose) this.dispose();
  }
}

export { World2D, walk, clamp, wrap };
