// ─────────────────────────────────────────────────────────────────────────────
// VanLab3D — the cook's 3D lab inside the RV (orchestrator). See VAN_CONTRACT.md + ROUND3_CONTRACT.md
// ("Cook client: first person + shop run").
//
//   const van = new VanLab3D(view, lab, data, { canvas, hudRoot, role: 'cook'|'solo' });
//   await van.ready;                 // interior built (render is safe before)
//   van.setActive(true|false);       // camera + interior + Doc input  |  view's own camera (released only if we own it)
//   van.update(dt, snap);            // every frame BEFORE view.render(dt)
//   van.onKey(e, isDown) → bool      // forward keydown/keyup while active
//   van.destroy();
//   van.docState                     // 'idle'|'walking'|'working'|'stumbling'|'down'|'shop' (out on a shop run)
// Round 3 ([R3-DOCFP]):
//   van.setViewMode('fp'|'overview') / van.viewMode   // O toggles; default 'fp'; persisted (localStorage, guarded)
//   van.onShopRun = (stopDef) => {}  // called once the 0.8 s side-door jump-out finished (van idle until returnFromShop)
//   van.returnFromShop()             // Doc is back inside at the side door, first person again
//   van.shopPrompt                   // 'SHOP RUN — side door [E]' while a run is due, else null
//   van.setComfort(bool) / van.comfort            // damped sway (default on; persisted)
//   van.setLook(yaw, pitch) / van.look            // first-person view angles (van-local; tests / restore)
//   van.pointerLocked                             // canvas holds the pointer lock
//
// First person: Doc's eye 1.62 m above the van floor, riding DocController (walking, sway, stumbles, cornering
// push). Mouse-look with pointer lock (click the canvas; Esc releases, never pauses — P is main.js's), WASD relative
// to the view yaw. Look at a station (ray / view cone ≤ 1.9 m) + E (or LMB) uses it; working a step eases to the
// presenter close-up and frees the mouse for the props; Q/Esc steps back. The body is hidden; gloved hands
// (fpHands.js) idle/walk-bob, carry the extinguisher, swat fires, pull the cord, and grip the presenter's prop in
// close-ups (pestle, bottle, spoon, knob, hammer). V works the vent fan anywhere, Tab opens the Recipe Board.
// Overview: the old cut-away dollhouse (Doc visible, click-to-walk, wheel zoom).
//
// Pieces: interior.js (cut-away shell + FP shell + stations + anchors + hinged side door), DocController.js (pure
// movement logic), vanCamera.js (first person / dollhouse / close-up), hazards3d.js (fire, fumes, vent, curtains,
// …), VanHud.js (dark-glass panels, prompts, recipe board), fpHands.js (gloved hands). Step presenters come from
// ./presenters/index.js (Agent VANCOOK) — loaded dynamically, with a placeholder fallback.
// Doc no longer goes on the roof (Rook defends it now): ./roof/** is not imported any more.
// Unity: a LabController MonoBehaviour on the RV prefab owning the same sub-components.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { buildInterior, poseSeated } from './interior.js';
import { DocController } from './DocController.js';
import { VanCamera, FALLBACK_CLOSEUP, fpDir } from './vanCamera.js';
import { Hazards3D } from './hazards3d.js';
import { VanHud } from './VanHud.js';

const MOVE_KEYS = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
const STEP_STATION_FALLBACK = { grind: 'grind', measure: 'measure', heat: 'stove', stir: 'stove', cool: 'cool', break: 'break', hammer: 'hammer' };
const BOARD_POSE = { pos: { x: 0, y: 0.72, z: 1.25 }, target: { x: 0, y: 0.5, z: -0.6 }, fov: 50 };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => t * t * (3 - 2 * t);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4(), _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2();

// [R3-DOCFP] first person
export const EYE_HEIGHT = 1.62;             // Doc's eye above the van floor (m)
export const SHOP_PROMPT = 'SHOP RUN — side door [E]';
const FP_FOV = 72;
const PICK_RANGE = 1.9;                     // look-at reach (m from the eye)
const LOOK_SENS = 0.0022;                   // rad per mouse pixel
const TOUCH_SENS = 0.0055;
const PITCH_MIN = -1.35, PITCH_MAX = 1.2;
const JUMP_TIME = 0.8, RETURN_TIME = 0.6, DOOR_OPEN = -1.75;
const PREF_VIEW = 'cr.van.view', PREF_COMFORT = 'cr.van.comfort';
const prefGet = (k) => { try { return typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null; } catch (e) { return null; } };
const prefSet = (k, v) => { try { if (typeof localStorage !== 'undefined') localStorage.setItem(k, v); } catch (e) { /* private mode / blocked */ } };
// presenter prop the right fist grips in a close-up (prop-local point + the prop's long axis) and the hands pose
// (onfoot/fpHands.js POSES) whose left hand sits in a sensible place relative to that fist
const GRIPS = {
  grind: { prop: (p) => p.pestle, at: [0, 0.165, 0], axis: 'y', pose: 'pour' },
  measure: { prop: (p) => p.bottle && (p.bottle.group || p.bottle), at: [0, 0.1, 0], axis: 'y', pose: 'pour' },
  stir: { prop: (p) => p.spoon, at: [0, 0.215, 0], axis: 'y', pose: 'pour' },
  heat: { prop: (p) => p.set && p.set.knob, at: [0, 0, 0.03], axis: 'z', pose: 'pour' },
  break: { prop: (p) => p.hammer, at: [0, 0.045, 0], axis: 'y', pose: 'pour' },
  hammer: { prop: (p) => p.hammer, at: [0, 0.05, 0], axis: 'y', pose: 'pour' },
};
// the extinguisher in Doc's right fist (socket-local placement; the socket's X runs through the fist)
const EXT_IN_HAND = { carry: { pos: [0.03, -0.47, 0.02], rot: [0, 0, 0] } };
// keycaps for the step panel header while working a step
const STEP_KEYS = {
  heat: [['A', 'D', 'knob']], cool: [['A', 'D', 'tilt']], measure: [['Space', 'pour']],
  grind: [['Mouse', 'circles']], stir: [['Mouse', 'circles']], break: [['Click', 'snap']], hammer: [['Click', 'nail']],
};
const STEP_SUB = {
  grind: (s) => `${s.turns ?? 6} turns`,
  measure: (s) => `${Math.round((s.targetMin ?? 0.6) * 100)}–${Math.round((s.targetMax ?? 0.75) * 100)} % on the line`,
  heat: (s) => `${s.bandMin ?? 170}–${s.bandMax ?? 215}° · hold ${s.duration ?? 8} s`,
  stir: (s) => `steady, ${s.duration ?? 5} s`,
  cool: (s) => `keep it level, ${s.duration ?? 6} s`,
  break: (s) => `${s.shards ?? 6} shards`,
  hammer: (s) => `${s.nails ?? 4} nails`,
};
export { STEP_SUB };

function rayBox(o, d, h) {
  let t0 = -Infinity, t1 = Infinity;
  for (const a of ['x', 'y', 'z']) {
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < -h[a] || o[a] > h[a]) return null; continue; }
    let u = (-h[a] - o[a]) / d[a], w = (h[a] - o[a]) / d[a];
    if (u > w) { const tmp = u; u = w; w = tmp; }
    if (u > t0) t0 = u;
    if (w < t1) t1 = w;
    if (t0 > t1) return null;
  }
  if (t1 < 0) return null;
  return Math.max(0, t0);
}

export class VanLab3D {
  constructor(view, lab, data, { canvas = null, hudRoot = null, role = 'cook', viewMode = null, shopRun = null, comfort = null, lockHint = true } = {}) {
    this.view = view; this.lab = lab; this.data = data; this.van = data.van; this.role = role;
    this.canvas = canvas || view.canvas;
    this.hudRoot = hudRoot || this.canvas.parentElement;
    this.active = false;
    this.built = false;
    this.destroyed = false;
    this.held = new Set();
    this.presenter = null;          // { p, station, game, stepIndex }
    this.idle = {};                 // stationId → Object3D
    this.ext = { state: 'home', spraying: false, sprayT: 0 };   // home | hand | floor
    this.pointer = { down: false, id: null, target: null };
    this.stats = { calls: 0 };
    this.lastSnap = null;
    this.time = 0;
    this.stepStation = { ...STEP_STATION_FALLBACK };
    for (const st of this.van.stations || []) for (const t of st.steps || []) this.stepStation[t] = st.id;
    // [R3-DOCFP] view mode, comfort, look, pointer lock, shop run
    const savedView = prefGet(PREF_VIEW);
    this._mode = viewMode === 'fp' || viewMode === 'overview' ? viewMode : savedView === 'overview' ? 'overview' : 'fp';
    const savedComfort = prefGet(PREF_COMFORT);
    this.comfort = typeof comfort === 'boolean' ? comfort : savedComfort !== '0';
    this.look = { yaw: Math.PI, pitch: -0.16 };
    this.locked = false;
    this._autoUnlocked = false;
    this.lockHint = lockHint !== false;
    this._touchUsed = false;
    this.lookTarget = null;          // { id, dist } — what the crosshair is on
    this.shopRunEnabled = typeof shopRun === 'boolean' ? shopRun : role === 'cook';
    this.onShopRun = null;
    this.shop = { state: 'none', t: 0, stopDef: null, stopId: null };
    this._shopDue = null; this._shopLock = null; this._shopToasted = null;
    this.fx = { press: 0, downK: 0 };
    this._eye = new THREE.Vector3(); this._eyeM = new THREE.Matrix4(); this._eyeRot = { yaw: Math.PI, pitch: 0, roll: 0 };
    this._lastLook = { yaw: Math.PI, pitch: 0 };
    this._labUnsub = lab.subscribe ? lab.subscribe((type, d) => this._onLabEvent(type, d)) : null;
    this._bind();
    this.ready = this._init();
  }

  get docState() { return this.shop.state === 'jump' || this.shop.state === 'out' ? 'shop' : this.doc ? this.doc.state : 'idle'; }
  get viewMode() { return this._mode; }
  get pointerLocked() { return this.locked; }
  /** 'SHOP RUN — side door [E]' while a shop run is due (stop.state 'shopping', Doc still inside), else null. */
  get shopPrompt() { return this._shopDue && this.shop.state === 'none' ? SHOP_PROMPT : null; }

  async _init() {
    await this.view.ready;
    if (this.destroyed) return this;
    let createModel = null;
    try { ({ createModel } = await import('../assets/index.js')); } catch (e) { console.warn('[van] assets unavailable', e && e.message); }
    if (this.destroyed) return this;
    this.it = buildInterior(this.data, { createModel });
    this.it.root.visible = this.active;
    this.view.rvAnchor.add(this.it.root);
    this.doc = new DocController(this.van);
    this.avatar = new DocAvatar(createModel ? createModel('cook') : fallbackDoc(), this.it, this.van.doc?.scale ?? 0.92);
    this.cam = new VanCamera(this.view, this.it, this.van);
    this.hz = new Hazards3D(this.it, this.view, this.lab, this.data);
    await this._loadHands();
    if (this.destroyed) return this;
    if (this.hudRoot) {
      this.hud = new VanHud(this.hudRoot, this.lab, this.data, {
        onCook: (id) => this.lab.requestRecipe(id),
        onDump: () => this.lab.abortBatch(),
        onBoardClosed: () => {
          if (this.cam && this._focusKind === 'board') this._setFocus(null);
          if (this.doc && this.doc.state === 'working' && this.doc.workStation === 'recipe') this.doc.stopWork();
          this._relock();
        },
      });
      this.hud.setVisible(this.active);
    }
    this._buildPicks();
    await this._loadPresenters();
    this._refreshBoardTexture(true);
    this.built = true;
    this._applyMode(true);
    this._applyActive();
    return this;
  }

  // Doc's first-person gloved hands: the rig shared with the shop runs (Agent SHOPS, onfoot/fpHands.js). It is
  // camera-attached (overlay pass after a depth clear), so the view's camera joins the scene graph.
  async _loadHands() {
    try {
      const mod = await import('../onfoot/fpHands.js');
      if (this.destroyed || !mod || typeof mod.createFpHands !== 'function') return;
      this.hands = mod.createFpHands({ gloves: true });
      const cam = this.view.camera;
      if (!cam.parent) this.view.scene.add(cam);
      cam.add(this.hands.root);
      this.hands.root.visible = false;
      this._handsInner = this.hands.root.getObjectByName('fp_hands_inner') || this.hands.root.children[0] || null;
    } catch (e) { console.warn('[van] first-person hands unavailable:', e && e.message); this.hands = null; }
  }

  async _loadPresenters() {
    try {
      const mod = await import('./presenters/index.js');
      if (mod && typeof mod.createPresenter === 'function') {
        this.presenters = mod;
        if (mod.STEP_STATION) Object.assign(this.stepStation, mod.STEP_STATION);
      }
    } catch (e) {
      console.info('[van] presenters not available yet — using placeholders:', e && e.message);
      this.presenters = null;
    }
    // idle props per step station
    if (this.presenters && typeof this.presenters.buildIdleProps === 'function') {
      for (const id of new Set(Object.values(this.stepStation))) {
        try {
          const o = this.presenters.buildIdleProps(id);
          if (o) { o.name = o.name || `idle_${id}`; this.it.anchors[id]?.add(o); this.idle[id] = o; }
        } catch (e) { console.warn('[van] idle props failed for', id, e); }
      }
    }
  }

  /** Re-import ./presenters/index.js (e.g. after VANCOOK drops it in). */
  async reloadPresenters() {
    this._disposePresenter();
    for (const o of Object.values(this.idle)) o.removeFromParent();
    this.idle = {};
    await this._loadPresenters();
  }

  // the van cam pulls the near plane in/out; give the next camera the normal one back
  _restoreNear() {
    const cam = this.view.camera;
    if (cam && cam.near !== 0.25) { cam.near = 0.25; cam.updateProjectionMatrix(); }
    this.cam?.cut?.disable();
  }

  // ── activation / view mode ─────────────────────────────────────────────────
  setActive(on) {
    this.active = !!on;
    if (this.built) this._applyActive();
  }
  _applyActive() {
    const on = this.active;
    this.it.root.visible = on;
    this.view.setVanMode && this.view.setVanMode(on);
    // only release the camera if we hold it (the garage tutorial / first-person cab / shop may own it)
    if (this.view.setCameraController) {
      if (on) this.view.setCameraController(this.cam);
      else if (this.view.cameraController === this.cam) { this.view.setCameraController(null); this._restoreNear(); }
    }
    if (on) this.cam.snap();
    if (this.hud) this.hud.setVisible(on && this.shop.state !== 'out');
    this.hz.setActive(on);
    if (this.hands) this.hands.root.visible = on && this._mode === 'fp';
    // 'station' for as long as the 3D lab exists: while the solo player drives (inactive), Doc is at no
    // station, so steps pause (the burner keeps going) instead of running unattended.
    if (typeof this.lab.setPresenceMode === 'function') this.lab.setPresenceMode('station');
    if (!on) {
      this.held.clear();
      this.doc.setMove(0, 0);
      this._stopSpray();
      if (this.doc.state === 'working') this._leaveStation();
      if (typeof this.lab.setPresence === 'function') this.lab.setPresence(null);
      this.hud && (this.hud.closeBoard(), this.hud.togglePantry(false));
      this.canvas.style.cursor = '';
      this.it.parts.doorGlow.visible = false;
      if (this.shop.state !== 'out' && this.shop.state !== 'jump') this._releaseLock(false);
    }
  }

  /** 'fp' (first person, default) | 'overview' (the cut-away dollhouse). Persisted per browser. */
  setViewMode(mode) {
    mode = mode === 'overview' ? 'overview' : 'fp';
    if (mode === this._mode) return this._mode;
    this._mode = mode;
    prefSet(PREF_VIEW, mode);
    if (this.built) this._applyMode(false);
    return this._mode;
  }
  _applyMode(snap) {
    const fp = this._mode === 'fp';
    this.it.setViewMode(this._mode);
    this.cam.setMode(this._mode, { snap });
    if (this.ext.state === 'hand') this._attachExt();
    if (this.hands) this.hands.root.visible = this.active && fp;
    if (!fp) { this._releaseLock(false); this.lookTarget = null; }
    else if (this.doc) this.look.yaw = this.doc.state === 'working' ? this.look.yaw : this.doc.yaw;
    if (this.hud) this.hud.setMode(this._mode);
    this.canvas.style.cursor = '';
  }
  setComfort(on) { this.comfort = !!on; prefSet(PREF_COMFORT, this.comfort ? '1' : '0'); return this.comfort; }
  setLook(yaw, pitch = this.look.pitch) {
    if (Number.isFinite(yaw)) this.look.yaw = wrap(yaw);
    if (Number.isFinite(pitch)) this.look.pitch = clamp(pitch, PITCH_MIN, PITCH_MAX);
    return this.look;
  }

  // ── pointer lock ───────────────────────────────────────────────────────────
  _requestLock() {
    const c = this.canvas;
    if (!c || !c.requestPointerLock || typeof document === 'undefined' || document.pointerLockElement === c) return;
    try { const p = c.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not allowed (iframe / headless) */ }
  }
  _releaseLock(auto) {
    if (typeof document === 'undefined' || document.pointerLockElement !== this.canvas) return;
    this._autoUnlocked = !!auto;
    try { document.exitPointerLock(); } catch (e) { /* ignore */ }
  }
  /** Re-take the pointer after we freed it for a close-up / the board (needs a user gesture: key or click). */
  _relock() {
    if (this._mode !== 'fp' || !this.active || this.locked || !this._autoUnlocked) return;
    this._autoUnlocked = false;
    this._requestLock();
  }
  _needsCursor() {
    return (this.doc.state === 'working' && !!this._focusKind) || !!this.hud?.boardOpen;
  }

  // ── per frame ──────────────────────────────────────────────────────────────
  update(dt, snap) {
    if (!this.built || this.destroyed) return;
    dt = clamp(dt || 0, 0, 0.1);
    this.time += dt;
    if (snap) this.lastSnap = snap;
    snap = this.lastSnap || {};
    const lab = this.lab, doc = this.doc;
    this._animateVehicle(dt, snap);
    if (snap.rv && snap.rv.wrecked && this.hz && !this.hz.wreck) this.hz.wreckBlast();   // [wreck] the RV blew up
    this._updateShopDue(snap);
    if (!this.active) return;
    const fp = this._mode === 'fp';
    if (this.shop.state === 'out') { this.stats.calls = this.view.stats?.calls ?? 0; return; }   // main.js renders the shop
    if (this.shop.state === 'jump') { this._updateJump(dt, snap); return; }
    if (this.shop.state === 'return') this._updateReturn(dt);
    // keyboard directions: view-relative in first person, screen-relative in the overview
    if (fp) {
      const yaw = this.look.yaw;
      doc.setCameraBasis(-Math.cos(yaw), Math.sin(yaw), Math.sin(yaw), Math.cos(yaw));
    } else {
      this.cam.follow = this.cam.follow || { x: 0, z: 0 };
      this.cam.follow.x = doc.x; this.cam.follow.z = doc.z;
      const b = this.cam.floorBasis(this.view.camera);
      doc.setCameraBasis(b.rx, b.rz, b.fx, b.fz);
    }
    let mx = 0, mz = 0;
    for (const c of this.held) { const d = MOVE_KEYS[c]; if (d) { mx += d[0]; mz += d[1]; } }
    doc.setMove(clamp(mx, -1, 1), clamp(mz, -1, 1));
    if ((mx || mz) && doc.state === 'working') this._leaveStation();
    if ((mx || mz) && this.hud && this.hud.boardOpen) this.hud.closeBoard();
    if ((mx || mz) && this.hud && this.hud.pantryOpen) this.hud.togglePantry(false);
    // cook down
    doc.setDown(!!lab.cookDown);
    if (lab.cookDown && this.ext.state === 'hand') this._dropExtinguisher();
    const feel = snap.feel || {};
    doc.update(dt, { latAcc: feel.latAcc ?? lab.feel?.latAcc ?? 0, bump: feel.bump ?? 0 });
    for (const ev of doc.drainEvents()) this._onDocEvent(ev);
    if (fp && doc.state !== 'working' && doc.state !== 'down') doc.yaw = this.look.yaw;   // the body faces where we look
    this._updateWork(dt);
    this._updateSpray(dt);
    // presenter
    if (this.presenter) {
      const P = this.presenter;
      try { P.p.update && P.p.update(dt, { feel: lab.feel || feel, active: doc.state === 'working' && doc.workStation === P.station }); } catch (e) { console.error('[van] presenter update', e); this._disposePresenter(); }
    }
    this.fx.press = Math.max(0, this.fx.press - dt);
    // avatar (overview) / eye + hands (first person)
    this.avatar.update(dt, doc, { lab, ext: this.ext, workType: this.presenter?.game?.type, inputActive: this.pointer.down || this.held.has('KeyE') || this.held.has('Space') });
    if (fp) {
      this.avatar.model.visible = false;
      this._updateEye(dt);
      this.lookTarget = this._pickLook();
      if (this.locked && this._needsCursor()) this._releaseLock(true);
    } else {
      // the close-up camera sits where Doc's head is: hide him while it's in (presenter props show the work)
      this.avatar.model.visible = !(this.cam.focus && this.cam.blend > 0.35 && this._focusKind) || doc.state === 'down';
      this.lookTarget = null;
    }
    this._updateHands(dt);
    this._updateHighlight(dt);
    this._updateDoorMarker(dt);
    this.hz.update(dt, {
      snap, doc, lat: feel.latAcc || 0, sway: Math.min(1, Math.abs(feel.latAcc || 0) / 6),
      presenterAt: (id) => !!(this.presenter && this.presenter.station === id),
      spray: this.ext.spraying ? this._sprayRay() : null,
      docHead: this.avatar.headPos(_v2),
      bumpFlicker: (feel.bump || 0) > 0.5,
      closeUp: !!this.cam.focus,
    });
    this._refreshBoardTexture(false);
    if (this.hud) this.hud.update(dt, this._hudState());
    this.stats.calls = this.view.stats?.calls ?? 0;
  }

  // wheels spin with the road, steering wheel + Rook's arms follow rv.steer
  _animateVehicle(dt, snap) {
    const it = this.it, rv = this.view.rv;
    if (!it.root.visible) return;
    const ang = rv ? rv.wheelAng : 0, steerVis = rv ? rv.steerVis : 0;
    const W = it.parts.wheels;
    const q = new THREE.Quaternion(), qs = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
    it.parts.wheelDefs.forEach((w, i) => {
      qs.setFromAxisAngle(_Y, (w.s < 0 ? Math.PI : 0) + (w.front ? steerVis : 0));
      q.setFromAxisAngle(_X, w.s < 0 ? -ang : ang);
      qs.multiply(q);
      _m.compose(_v.set(w.x, w.y, w.z), qs, s);
      W.setMatrixAt(i, _m);
    });
    W.instanceMatrix.needsUpdate = true;
    const steer = snap.rv ? (snap.rv.steer || 0) : 0;
    this._steer = (this._steer || 0) + (steer - (this._steer || 0)) * Math.min(1, dt * 8);
    it.parts.steeringWheel.rotation.z = -this._steer * 1.7;
    if (it.parts.rook) poseSeated(it.parts.rook, this._steer);
  }

  // ── first person: eye, look-at pick, hands ────────────────────────────────
  _updateEye(dt) {
    const doc = this.doc, D = this.it.dims, t = this.time;
    const swayK = this.comfort ? 0.4 : 1;
    const down = doc.state === 'down';
    this.fx.downK += ((down ? 1 : 0) - this.fx.downK) * (1 - Math.exp(-dt * (down ? 5 : 3)));
    const walk = Math.min(1, doc.speed / 2.2) * (doc.airborne ? 0 : 1);
    const ph = doc.walkPhase;
    const yaw0 = this.look.yaw, fx = Math.sin(yaw0), fz = Math.cos(yaw0), rx = -fz, rz = fx;
    let x = doc.x, z = doc.z, y = D.FY + EYE_HEIGHT + doc.hop * (0.55 + 0.45 * swayK);
    y += Math.sin(ph * 2) * 0.018 * walk * (0.5 + 0.5 * swayK);           // head bob
    const side = Math.sin(ph) * 0.012 * walk * swayK;
    x += rx * side; z += rz * side;
    // cornering push / bumps: the head shifts with Doc's lean (van-local X) and the view rolls toward it (damped)
    const lean = doc.lean * (0.35 + 0.65 * swayK);
    x += lean * 0.6;
    let roll = lean * fz * 1.1, pitch = this.look.pitch, yaw = yaw0;
    if (doc.state === 'stumbling') {
      roll += Math.sin(t * 9) * 0.08 * swayK;
      pitch += Math.sin(t * 7.3) * 0.06 * swayK;
      yaw += Math.sin(t * 5.1) * 0.05 * swayK;
    }
    // cook down: flat on the floor, looking up at the ceiling (the stars circle overhead)
    const k = this.fx.downK;
    if (k > 0.001) { y = y * (1 - k) + (D.FY + 0.24) * k; pitch = pitch * (1 - k) + 1.0 * k; roll = roll * (1 - k) + 0.35 * k; }
    this._eye.set(x, y, z);
    this._eyeRot.yaw = yaw; this._eyeRot.pitch = pitch; this._eyeRot.roll = roll;
    const f = this.cam.fp;
    f.pos.copy(this._eye); f.yaw = yaw; f.pitch = pitch; f.roll = roll; f.fov = FP_FOV;
    this.cam.comfort = this.comfort ? 0.45 : 1;
    _e.set(pitch, yaw + Math.PI, roll, 'YXZ');
    _q.setFromEuler(_e);
    this._eyeM.compose(this._eye, _q, _s.set(1, 1, 1));
  }

  _buildPicks() {
    this._picks = [];
    const add = (id, mesh, parentMatrix) => {
      const p = mesh.geometry.parameters || {};
      const L = new THREE.Matrix4().compose(mesh.position, mesh.quaternion, new THREE.Vector3(1, 1, 1));
      const M = parentMatrix ? parentMatrix.clone().multiply(L) : L;
      this._picks.push({ id, M, inv: M.clone().invert(), half: new THREE.Vector3((p.width || 0.5) / 2, (p.height || 0.5) / 2, (p.depth || 0.5) / 2), center: new THREE.Vector3().setFromMatrixPosition(M) });
    };
    for (const m of this.it.parts.stationPicks) {
      const a = this.it.anchors[m.userData.station];
      a.updateMatrix();
      add(m.userData.station, m, a.matrix);
    }
    add('door', this.it.parts.doorPick, null);
  }
  /** What the crosshair is on: nearest pick volume along the view ray, else the station best inside a narrow cone. */
  _pickLook() {
    const doc = this.doc;
    if (doc.state === 'down' || doc.state === 'working' || this.hud?.boardOpen) return null;
    const o = this._eye, d = fpDir(this._eyeRot.yaw, this._eyeRot.pitch, _v3);
    let best = null;
    for (const P of this._picks) {
      _v.copy(o).applyMatrix4(P.inv);
      _v2.copy(d).transformDirection(P.inv);
      const t = rayBox(_v, _v2, P.half);
      if (t != null && t <= PICK_RANGE && (!best || t < best.dist)) best = { id: P.id, dist: t };
    }
    // the extinguisher lying on the floor
    if (this.ext.state === 'floor') {
      _v.copy(this.it.parts.extinguisher.position).sub(o);
      const dist = _v.length();
      if (dist < 1.7 && _v.normalize().dot(d) > Math.cos(0.3) && (!best || dist < best.dist + 0.2)) best = { id: 'extFloor', dist };
    }
    if (best) return best;
    let bestA = 0.28;
    for (const P of this._picks) {
      _v.copy(P.center).sub(o);
      const dist = _v.length();
      if (dist > PICK_RANGE + 0.35) continue;
      const a = Math.acos(clamp(_v.normalize().dot(d), -1, 1));
      if (a < bestA) { bestA = a; best = { id: P.id, dist }; }
    }
    return best;
  }

  /** The shared hands: camera-attached poses in first person; in a close-up the right fist is re-rooted onto the
   *  presenter's prop (pestle, bottle, spoon, knob, hammer) so the hand follows what the mouse plays. */
  _updateHands(dt) {
    const H = this.hands;
    if (!H) return;
    const doc = this.doc, P = this.presenter, cam = this.view.camera;
    const fp = this._mode === 'fp' && this.active && this.shop.state !== 'out';
    const yawRate = clamp(wrap(this.look.yaw - this._lastLook.yaw) / Math.max(dt, 1e-3), -8, 8);
    const pitchRate = clamp((this.look.pitch - this._lastLook.pitch) / Math.max(dt, 1e-3), -8, 8);
    this._lastLook.yaw = this.look.yaw; this._lastLook.pitch = this.look.pitch;
    const closeUp = !!this.cam.focus && this._focusKind === 'station' && doc.state === 'working' && P && P.station === doc.workStation;
    const spec = closeUp ? GRIPS[P.game?.type] : null;
    let prop = null;
    if (spec) { try { prop = spec.prop(P.p) || null; } catch (e) { prop = null; } }
    if (prop && !prop.isObject3D) prop = null;
    const show = fp && doc.state !== 'down' && this._focusKind !== 'board' && (!closeUp || !!prop);
    H.root.visible = show;
    this._handsCloseUp(show && closeUp);
    if (!show) return;
    try {
      if (closeUp) {
        const root = this.it.root;
        if (H.root.parent !== root) root.add(H.root);
        H.setPose(spec.pose, 0.12);
        H.update(dt, { walk: 0, act: 0 });
        // hands-root ← right socket, then place the root so that socket sits on the prop's grip point
        const inner = this._handsInner;
        inner.updateMatrix(); H.sockets.r.updateMatrix();
        _m.multiplyMatrices(inner.matrix, H.sockets.r.matrix).invert();
        root.updateWorldMatrix(true, false);
        _m2.copy(root.matrixWorld).invert();
        prop.updateWorldMatrix(true, false);
        const toLocal = _m3.multiplyMatrices(_m2, prop.matrixWorld);
        const p = _v.set(spec.at[0], spec.at[1], spec.at[2]).applyMatrix4(toLocal);
        const ax = _v2.set(0, spec.axis === 'z' ? 0 : 1, spec.axis === 'z' ? 1 : 0).transformDirection(toLocal);
        // the forearm comes from Doc's right shoulder: below-right of (and a little behind) the close-up camera
        const toward = _v3.set(0.45, -0.75, 0.2).applyQuaternion(cam.quaternion).add(cam.position).applyMatrix4(_m2);
        const Z = toward.sub(p);
        Z.addScaledVector(ax, -Z.dot(ax));
        if (Z.lengthSq() < 1e-6) Z.set(0, 0, 1);
        Z.normalize();
        const X = ax.negate();                       // thumb toward the business end of the tool
        const Y = _v4.crossVectors(Z, X).normalize();
        _m4.makeBasis(X, Y, Z).setPosition(p);
        _m4.multiply(_m);
        _m4.decompose(H.root.position, H.root.quaternion, H.root.scale);
        return;
      }
      if (H.root.parent !== cam) { cam.add(H.root); H.root.position.set(0, 0, 0); H.root.quaternion.identity(); H.root.scale.set(1, 1, 1); }
      const carry = this.ext.state === 'hand';
      const pose = this.shop.state === 'jump' ? 'grab' : carry ? (this.ext.spraying ? 'spray' : 'carry') : doc.state === 'stumbling' ? 'grab' : doc.speed > 0.3 ? 'walk' : 'idle';
      H.setPose(pose, pose === 'grab' ? 0.12 : 0.22);
      const st = doc.state === 'stumbling' ? Math.sin(this.time * 17) * 6 : 0;
      H.update(dt, { walk: Math.min(1.4, doc.speed / 2.6), sway: { x: yawRate + st, y: pitchRate + st * 0.6 }, act: this.ext.spraying ? 1 : 0, pitch: this._eyeRot.pitch });
    } catch (e) { if (!this._handsWarned) { this._handsWarned = true; console.warn('[van] hands', e); } }
  }
  /** Close-ups: only the gripping right hand with a short cuff (the full sleeves swamp a 0.9 m shot). Done on the
   *  shared rig's bones: left forearm collapsed, right forearm squashed along its length and the hand counter-scaled
   *  (exact while the pose has no wrist bend — 'grind'/'pour'/'carry' poses here). Restored when leaving. */
  _handsCloseUp(on) {
    if (on === !!this._handsCU) return;
    this._handsCU = on;
    const b = this.hands && this.hands.bones;
    if (!b || !b.fore_l || !b.fore_r || !b.hand_r) return;
    if (on) { b.fore_l.scale.setScalar(1e-3); b.fore_r.scale.set(1, 1, 0.27); b.hand_r.scale.set(1, 1, 1 / 0.27); }
    else { b.fore_l.scale.set(1, 1, 1); b.fore_r.scale.set(1, 1, 1); b.hand_r.scale.set(1, 1, 1); }
  }
  _handsReach(side = 'r') { try { this.hands && this.hands.reach && this.hands.reach(side); } catch (e) { /* cosmetic */ } }

  // ── shop run (side door) ───────────────────────────────────────────────────
  _updateShopDue(snap) {
    const st = snap && snap.stop;
    let due = null;
    if (this.shopRunEnabled && st && st.state === 'shopping' && st.doc === 'in') {
      const lock = this._shopLock;
      if (!(lock && lock.id === st.id && this.time < lock.until)) {
        const def = (this.data.route?.stops || []).find((s) => s.id === st.id) || { id: st.id, name: st.name || 'Supply stop' };
        due = { id: st.id, def };
      }
    }
    this._shopDue = due;
    if (due && this.active && this.built && this._shopToasted !== due.id && this.shop.state === 'none') {
      this._shopToasted = due.id;
      this.hud && this.hud.toast(`Shop run: ${due.def.name} — jump out of the side door`, 'good');
    }
  }
  _doorDist() { const s = this.it.parts.doorStand; return Math.hypot(this.doc.x - s.x, this.doc.z - s.z); }
  /** E on the side door: walk there, then jump out (only while a run is due). */
  _useDoor() {
    if (!this._shopDue || this.shop.state !== 'none') {
      this.hud && this.hud.toast(this.shopRunEnabled ? 'The side door — only at a supply stop' : 'Stay in the lab', 'info');
      return;
    }
    if (this.lab.cookDown || this.doc.state === 'down') return;
    const s = this.it.parts.doorStand;
    if (this._doorDist() < 0.35) this._startJump();
    else { if (this.doc.state === 'working') this._leaveStation(); this.doc.walkTo(s.x, s.z, 'door'); }
  }
  _startJump() {
    const due = this._shopDue;
    if (!due || this.shop.state !== 'none') return;
    const doc = this.doc;
    if (doc.state === 'working') this._leaveStation();
    if (this.ext.state === 'hand') this._hangExtinguisher();
    this._stopSpray();
    this.hud && (this.hud.closeBoard(), this.hud.togglePantry(false));
    this.held.clear();
    doc.cancelPath(); doc.setMove(0, 0); doc.vx = doc.vz = 0;
    const s = this.it.parts.doorStand;
    doc.x = s.x; doc.z = s.z; doc.yaw = -Math.PI / 2;
    if (typeof this.lab.setPresence === 'function') this.lab.setPresence(null);
    this.shop = { state: 'jump', t: 0, stopDef: due.def, stopId: due.id, yaw0: this.look.yaw, pitch0: this.look.pitch, eye0: this._eye.clone() };
    if (this._mode !== 'fp') this.shop.eye0.set(doc.x, this.it.dims.FY + EYE_HEIGHT, doc.z);
    this.it.parts.doorGlow.visible = false;
    this.it.parts.ring.visible = this.it.parts.arrow.visible = false;
  }
  _updateJump(dt, snap) {
    const S = this.shop, it = this.it, D = it.dims, dd = it.parts.doorDims, doc = this.doc;
    S.t += dt;
    const T = S.t;
    it.parts.doorPivot.rotation.y = DOOR_OPEN * smooth(Math.min(1, T / 0.28));
    const kt = smooth(Math.min(1, T / 0.25));
    const km = smooth(clamp((T - 0.18) / (JUMP_TIME - 0.18), 0, 1));
    const zMid = (dd.d0 + dd.d1) / 2 + 0.05;
    const x = S.eye0.x + (-2.35 - S.eye0.x) * km;
    const z = S.eye0.z + (zMid - S.eye0.z) * km;
    const arc = Math.sin(km * Math.PI) * 0.16;
    if (this._mode === 'fp') {
      const yaw = S.yaw0 + wrap(-Math.PI / 2 - S.yaw0) * kt;
      let pitch = S.pitch0 + (-0.1 - S.pitch0) * kt;
      if (km > 0.75) pitch -= Math.sin((km - 0.75) / 0.25 * Math.PI) * 0.18;   // landing dip
      const y = S.eye0.y + (EYE_HEIGHT - S.eye0.y) * km + arc;
      const f = this.cam.fp;
      f.pos.set(x, y, z); f.yaw = yaw; f.pitch = pitch; f.roll = Math.sin(km * Math.PI) * 0.04; f.fov = FP_FOV;
      this._eye.copy(f.pos);
      _e.set(pitch, yaw + Math.PI, f.roll, 'YXZ'); _q.setFromEuler(_e); this._eyeM.compose(this._eye, _q, _s.set(1, 1, 1));
      this.avatar.model.visible = false;
      this._updateHands(dt);
    } else {
      const m = this.avatar.model;
      m.visible = true;
      m.position.set(doc.x + (x - doc.x) * km, D.FY + (0 - D.FY) * km + arc, doc.z + (z - doc.z) * km);
      m.rotation.set(0, -Math.PI / 2, 0);
    }
    this.hz.update(dt, { snap, doc, lat: 0, sway: 0, presenterAt: (id) => !!(this.presenter && this.presenter.station === id), spray: null, docHead: this.avatar.headPos(_v2), bumpFlicker: false, closeUp: false });
    if (this.hud) this.hud.update(dt, this._hudState());
    if (T >= JUMP_TIME) {
      S.state = 'out';
      this.avatar.model.visible = false;
      if (this.hands) this.hands.root.visible = false;
      this.hud && this.hud.setVisible(false);
      const def = S.stopDef;
      if (typeof this.onShopRun === 'function') { try { this.onShopRun(def); } catch (e) { console.error('[van] onShopRun', e); } }
    }
  }
  /** The shop run ended (done or aborted): Doc is back inside at the side door, first person, the door swings shut. */
  returnFromShop() {
    if (!this.built || this.destroyed) return;
    const S = this.shop;
    if (S.state === 'none' || S.state === 'return') return;
    const doc = this.doc, s = this.it.parts.doorStand;
    doc.cancelPath(); doc.setMove(0, 0);
    doc.x = s.x + 0.12; doc.z = s.z; doc.vx = doc.vz = 0; doc.pushVx = doc.pushVz = 0;
    if (doc.state !== 'down') doc.state = 'idle';
    doc.yaw = Math.PI / 2;
    this.look.yaw = Math.PI / 2; this.look.pitch = -0.12;
    this._shopLock = { id: S.stopId, until: this.time + 8 };
    this.shop = { state: 'return', t: 0, stopDef: S.stopDef, stopId: S.stopId };
    this.held.clear();
    this.it.parts.doorPivot.rotation.y = DOOR_OPEN;
    this.cam.snap();
    if (this.hud) this.hud.setVisible(this.active);
  }
  _updateReturn(dt) {
    const S = this.shop;
    S.t += dt;
    this.it.parts.doorPivot.rotation.y = DOOR_OPEN * (1 - smooth(Math.min(1, S.t / 0.5)));
    if (S.t >= RETURN_TIME) { this.it.parts.doorPivot.rotation.y = 0; this.shop = { state: 'none', t: 0, stopDef: null, stopId: null }; }
  }
  _updateDoorMarker() {
    const g = this.it.parts.doorGlow;
    const on = !!this._shopDue && this.shop.state === 'none';
    g.visible = on;
    if (on) g.material.opacity = 0.55 + 0.35 * Math.sin(this.time * 4);
  }

  // ── stations / work ────────────────────────────────────────────────────────
  _stationOfStep(type) {
    if (!type) return null;
    if (typeof this.lab.stationForStep === 'function') { const s = this.lab.stationForStep(type); if (s) return s; }
    return this.stepStation[type] || null;
  }
  /** Station of the current step (or of the next one during the pause between steps). */
  _curStepStation() {
    const lab = this.lab;
    if (lab.state !== 'running') return null;
    if ('stepStation' in lab) return lab.stepStation;
    const st = lab.getCurrentStep && lab.getCurrentStep();
    if (!st) return null;
    if (st.paused) return this._stationOfStep(lab.recipe?.steps?.[st.index + 1]?.type);
    return this._stationOfStep(st.type);
  }
  /** Station Doc would use with E: nearest within reach, preferring ones that matter right now. */
  _bestStation() {
    const doc = this.doc, want = this._curStepStation();
    let best = null, bs = Infinity;
    for (const st of doc.stations) {
      const d = Math.hypot(st.stand.x - doc.x, st.stand.z - doc.z);
      if (d > doc.interactRadius) continue;
      let score = d;
      if (this._isStepStation(st.id) && st.id !== want) score += 0.35;
      if (st.id === want) score -= 0.2;
      if (st.id === 'recipe' && this.lab.state === 'idle') score -= 0.15;
      if (score < bs) { bs = score; best = { id: st.id, dist: d, station: st }; }
    }
    return best;
  }
  _stationName(id) { return id === 'door' ? 'Side door' : this.it?.stationById[id]?.name || id || ''; }
  _isStepStation(id) { return Object.values(this.stepStation).includes(id); }

  _updateWork() {
    const lab = this.lab, doc = this.doc;
    const ws = doc.state === 'working' ? doc.workStation : null;
    const stepSt = this._curStepStation();
    if (ws && this._isStepStation(ws)) {
      if (lab.state !== 'running' || stepSt !== ws) {
        this._leaveStation();
        if (lab.state === 'running' && stepSt) this.hud && this.hud.toast(`Next step: ${this._stationName(stepSt)} →`, 'info');
      }
    }
    const nowWs = doc.state === 'working' ? doc.workStation : null;
    if (typeof lab.setPresence === 'function') lab.setPresence(nowWs && this._isStepStation(nowWs) ? nowWs : null);
    // presenter lifecycle: alive while its step is current (inactive when Doc walks off)
    const g = lab.state === 'running' ? lab.current : null;
    if (this.presenter && (this.presenter.game !== g || !g)) this._disposePresenter();
    if (!this.presenter && g && !g.done && nowWs && this._stationOfStep(g.type) === nowWs) this._createPresenter(nowWs, g);
    // camera focus follows work
    if (nowWs && this._isStepStation(nowWs)) {
      const pose = this.presenter ? this._presenterPose() : FALLBACK_CLOSEUP;
      this._setFocus(this.it.anchors[nowWs], pose, 'station');
    } else if (this._focusKind === 'station') this._setFocus(null);
  }
  _presenterPose() {
    try { const c = this.presenter.p.camera && this.presenter.p.camera(); if (c && c.pos && c.target) return c; } catch (e) { /* fallback */ }
    return FALLBACK_CLOSEUP;
  }
  _setFocus(anchor, pose, kind = null) {
    this._focusKind = anchor ? kind : null;
    this.cam.setFocus(anchor, pose);
  }
  _createPresenter(stationId, game) {
    const lab = this.lab;
    const anchor = this.it.anchors[stationId];
    const step = lab.recipe?.steps?.[lab.stepIndex] || { type: game.type, label: game.label };
    let p = null;
    if (this.presenters) {
      try { p = this.presenters.createPresenter(game.type, { anchor, lab, game, step, recipe: lab.recipe }); } catch (e) { console.error('[van] createPresenter failed', game.type, e); p = null; }
    }
    if (!p) p = placeholderPresenter(game.type, { anchor, lab, game });
    this.presenter = { p, station: stationId, game, stepIndex: lab.stepIndex };
    if (this.idle[stationId]) this.idle[stationId].visible = false;
  }
  _disposePresenter() {
    const P = this.presenter;
    if (!P) return;
    this.presenter = null;
    try { P.p.dispose && P.p.dispose(); } catch (e) { console.warn('[van] presenter dispose', e); }
    if (this.idle[P.station]) this.idle[P.station].visible = true;
    if (this.pointer.down) this.pointer.down = false;
  }
  _leaveStation() {
    const doc = this.doc;
    const ws = doc.workStation;
    if (this.presenter && this.pointer.down) { try { this.presenter.p.pointerUp && this.presenter.p.pointerUp(null); } catch (e) { /* ignore */ } this.pointer.down = false; }
    doc.stopWork();
    if (ws === 'recipe' && this.hud) this.hud.closeBoard();
    if (typeof this.lab.setPresence === 'function') this.lab.setPresence(null);
    if (this._focusKind) this._setFocus(null);
  }
  /** First person: use a station you look at — right here if within reach, else walk over first. */
  _useStation(id) {
    const doc = this.doc;
    if (!id) return;
    if (id === 'door') { this._useDoor(); return; }
    if (doc.distToStation(id) <= doc.interactRadius) this._interact(id);
    else doc.walkToStation(id);
  }

  /** E / click-arrival on a station. */
  _interact(id) {
    const lab = this.lab, doc = this.doc, hud = this.hud;
    if (lab.cookDown || doc.state === 'down') return;
    if (!id) return;
    const face = () => { doc.startWork(id); };
    switch (id) {
      case 'door':
        if (this._shopDue && this.shop.state === 'none') this._startJump();
        return;
      case 'recipe':
        face();
        hud && hud.openBoard();
        this._setFocus(this.it.anchors.recipe, BOARD_POSE, 'board');
        return;
      case 'pantry':
        face(); doc.stopWork();
        hud && hud.togglePantry();
        this._handsReach('r');
        return;
      case 'vent': face(); doc.stopWork(); lab.toggleVent(); this._handsReach('r'); return;
      case 'curtains': face(); doc.stopWork(); lab.toggleCurtains(); this.avatar.pull = 0.5; this._handsReach('l'); return;
      case 'extinguisher':
        if (this.ext.state === 'hand') { this._hangExtinguisher(); return; }
        if (this.ext.state === 'home') { this._grabExtinguisher(); return; }
        hud && hud.toast('The extinguisher is on the floor!', 'bad');
        return;
      case 'stash': {
        face(); doc.stopWork();
        const inv = this.lastSnap?.inv || lab.inv || {};
        const need = this.data.route?.sellPoint?.requiredUnits ?? 6;
        hud && hud.toast(`${inv.units || 0} bag${inv.units === 1 ? '' : 's'} stashed · need ${need} · quality ${Math.round((inv.quality || 0) * 100)}%`, (inv.units || 0) >= need ? 'good' : 'info');
        this._handsReach('r');
        return;
      }
      default: break;
    }
    if (!this._isStepStation(id)) return;
    if (lab.state !== 'running') {
      hud && hud.toast(lab.state === 'requesting' ? 'Waiting for the driver to OK the batch…' : 'Nothing cooking — pick a recipe (Tab)', 'info');
      return;
    }
    const want = this._curStepStation();
    if (want === id) {
      if (this.ext.state === 'hand') this._dropExtinguisher(true);
      doc.startWork(id);
    } else hud && hud.toast(`Not needed right now — next: ${this._stationName(want)}`, 'info');
  }
  _toggleVent() {
    if (this.lab.cookDown) return;
    const open = this.lab.toggleVent();
    this._handsReach('r');
    this.hud && this.hud.toast(open ? 'Vent fan on' : 'Vent fan off', 'info');
  }
  _toggleBoard() {
    const hud = this.hud;
    if (!hud) return;
    if (hud.boardOpen) { hud.closeBoard(); return; }
    if (this.doc.state === 'working') this._leaveStation();
    hud.togglePantry(false);
    hud.openBoard();
    this._releaseLock(true);
  }

  // ── fire / extinguisher ────────────────────────────────────────────────────
  _burnerDist() {
    const b = this.hz.burner;
    return Math.hypot(b.x - this.doc.x, b.z - this.doc.z);
  }
  _nearFire() { return this.lab.fire > 0 && this._burnerDist() < 1.7; }
  /** First person: the fire is close and in front of you; overview: just close. */
  _fireInReach() {
    if (this._mode !== 'fp') return this._nearFire();
    if (!(this.lab.fire > 0) || this._burnerDist() > 2.1) return false;
    const b = this.hz.burner;
    _v.set(b.x - this._eye.x, b.y + 0.15 - this._eye.y, b.z - this._eye.z).normalize();
    return _v.dot(fpDir(this.look.yaw, this.look.pitch, _v2)) > Math.cos(0.55);
  }
  /** Put the carried extinguisher in Doc's hand: the first-person fist (hands rig socket) or the avatar's. */
  _attachExt() {
    const ex = this.it.parts.extinguisher;
    this._releaseExtFromHands();
    if (this._mode === 'fp' && this.hands) {
      try { this.hands.hold(ex, 'r', EXT_IN_HAND.carry); this._extInHands = true; ex.scale.set(1, 1, 1); return; } catch (e) { /* fall back to the avatar */ }
    }
    this.avatar.attachToHand(ex);
  }
  _releaseExtFromHands() {
    if (!this._extInHands) return;
    this._extInHands = false;
    try { this.hands && this.hands.hold(null, 'r'); } catch (e) { /* ignore */ }
  }
  _grabExtinguisher() {
    this.ext.state = 'hand';
    this._attachExt();
    this._handsReach('r');
    this.hud && this.hud.toast(`Got the extinguisher (${this.lab.extinguisher ?? 0} charges)`, 'info');
  }
  _hangExtinguisher() {
    this._stopSpray();
    this._releaseExtFromHands();
    const ex = this.it.parts.extinguisher;
    this.it.root.add(ex);
    ex.position.copy(this.it.parts.extHome); ex.rotation.set(0, 0, 0); ex.scale.set(1, 1, 1);
    this.ext.state = 'home';
  }
  _dropExtinguisher(quiet = false) {
    if (this.ext.state !== 'hand') return;
    this._stopSpray();
    this._releaseExtFromHands();
    const ex = this.it.parts.extinguisher, doc = this.doc;
    this.it.root.add(ex);
    const fx = Math.sin(doc.yaw), fz = Math.cos(doc.yaw);
    const p = doc.project(doc.x + fx * 0.35 + fz * 0.2, doc.z + fz * 0.35 - fx * 0.2);
    ex.position.set(p.x, this.it.dims.FY + 0.075, p.z);
    ex.rotation.set(0, doc.yaw + 1.2, Math.PI / 2);
    ex.scale.set(1, 1, 1);
    this.ext.state = 'floor';
    if (!quiet) this.hud && this.hud.toast('Dropped the extinguisher!', 'bad');
  }
  _nearDroppedExt() {
    if (this.ext.state !== 'floor') return false;
    if (this._mode === 'fp' && this.lookTarget?.id === 'extFloor') return true;
    const p = this.it.parts.extinguisher.position;
    return Math.hypot(p.x - this.doc.x, p.z - this.doc.z) < 0.75;
  }
  _pickUpDropped() {
    this._grabExtinguisher();
  }
  _startSpray() {
    if (this.ext.state !== 'hand' || this.ext.spraying) return;
    const lab = this.lab;
    if ((lab.extinguisher ?? 0) <= 0 && lab.fire > 0) { this.hud && this.hud.toast('Extinguisher’s empty — beat it out!', 'bad'); }
    if (this._fireInReach()) {
      if (this._mode !== 'fp') { const b = this.hz.burner; this.doc.yaw = Math.atan2(b.x - this.doc.x, b.z - this.doc.z); }   // turn toward the fire
      lab.useExtinguisher();
    }
    this.ext.spraying = true; this.ext.sprayT = 0; this.ext.sprayDur = 0;
  }
  _stopSpray() { this.ext.spraying = false; }
  _updateSpray(dt) {
    const e = this.ext;
    if (!e.spraying) return;
    e.sprayDur += dt;
    e.sprayT += dt;
    if (e.sprayT >= 0.4) {
      e.sprayT = 0;
      if (this._fireInReach() && (this.lab.extinguisher ?? 0) >= 0) this.lab.extinguish();
    }
    if (this.lab.cookDown || this.ext.state !== 'hand') this._stopSpray();
  }
  _sprayRay() {
    const o = this.avatar.nozzleWorld(new THREE.Vector3());
    if (this._mode === 'fp') {
      const d = fpDir(this.look.yaw, this.look.pitch - 0.04, new THREE.Vector3());
      return { on: true, origin: o, dir: d };
    }
    const yaw = this.doc.yaw;
    const d = new THREE.Vector3(Math.sin(yaw), -0.18, Math.cos(yaw)).normalize();
    if (this._nearFire()) { const b = this.hz.burner; d.set(b.x - o.x, b.y + 0.15 - o.y, b.z - o.z).normalize(); }
    return { on: true, origin: o, dir: d };
  }
  _beatFire() {
    this.lab.extinguish();
    this.avatar.beat = 0.35;
    this._handsReach('r');
    if (this._mode !== 'fp') { const b = this.hz.burner; this.doc.yaw = Math.atan2(b.x - this.doc.x, b.z - this.doc.z); }
  }

  // ── HUD state ──────────────────────────────────────────────────────────────
  _hudState() {
    const lab = this.lab, doc = this.doc, fp = this._mode === 'fp';
    const stepSt = this._curStepStation();
    const working = doc.state === 'working' && this._isStepStation(doc.workStation);
    const boardOpen = !!this.hud?.boardOpen;
    const jumping = this.shop.state === 'jump';
    let prompt = null;
    if (lab.cookDown || jumping) prompt = null;
    else if (doc.state === 'stumbling') prompt = { key: '', text: 'Whoa!', tone: 'bad' };
    else if (lab.fire > 0 && (fp ? this._fireInReach() || (this._nearFire() && this.lookTarget?.id === 'stove') : this._nearFire())) {
      prompt = this.ext.state === 'hand' ? { key: 'E', text: this.ext.spraying ? 'Spraying…' : 'Spray the fire!', tone: 'fire', sub: `${lab.extinguisher ?? 0} charges` }
        : { key: 'E', text: 'Beat out the fire!', tone: 'fire', sub: 'or grab the extinguisher' };
    } else if (working) prompt = fp ? null : { key: 'Q', text: 'Step away', tone: 'idle' };
    else if (boardOpen) prompt = null;
    else if (this._nearDroppedExt()) prompt = { key: 'E', text: 'Extinguisher', sub: 'pick it up' };
    else if (fp) {
      if (this.lookTarget && this.lookTarget.id !== 'extFloor') prompt = this._promptFor(this.lookTarget.id, stepSt);
      else if (lab.fire > 0) prompt = { key: '', text: 'FIRE!', sub: this.ext.state === 'hand' ? 'aim at the stove' : 'grab the extinguisher (back right)', tone: 'fire' };
    } else {
      const n = this._bestStation();
      if (this._shopDue && this.shop.state === 'none' && this._doorDist() < 0.8) prompt = this._promptFor('door', stepSt);
      else if (n) prompt = this._promptFor(n.id, stepSt);
      else if (lab.fire > 0) prompt = { key: '', text: this.ext.state === 'hand' ? 'Get to the stove — FIRE!' : 'FIRE! Grab the extinguisher →', tone: 'fire' };
      else if (lab.state === 'running' && stepSt) prompt = { key: '', text: `Next step: ${this._stationName(stepSt)} →`, tone: 'next' };
      else if (lab.state === 'idle' && lab.canStart) prompt = { key: '', text: 'Pick a recipe at the board →', tone: 'idle' };
    }
    let awayText = null;
    if (lab.state === 'running' && stepSt && !working) {
      const st = lab.getCurrentStep();
      if (st && !st.paused) awayText = lab.current?.type === 'heat' ? 'The burner is still on!' : `Paused — go to the ${this._stationName(stepSt)}`;
    }
    const due = this._shopDue && this.shop.state === 'none' ? this._shopDue : null;
    const sType = due?.def?.shop?.title || due?.def?.shop?.type || '';
    return {
      mode: this._mode,
      prompt, working, hint: this.presenter && this.presenter.station === doc.workStation && this.presenter.p.hint !== lab.current?.instructions ? (this.presenter.p.hint || '') : '',
      keys: working ? [...(STEP_KEYS[lab.current?.type] || []), ['Q', 'step away']] : null,
      stationName: working ? this._stationName(doc.workStation) : stepSt ? this._stationName(stepSt) : '',
      nextName: stepSt ? this._stationName(stepSt) : '', awayText, carrying: this.ext.state === 'hand', docState: doc.state,
      crosshair: fp && !working && !boardOpen && !jumping && doc.state !== 'down' && this._focusKind == null,
      xhairOn: fp && !!this.lookTarget,
      lockHint: fp && this.lockHint && !this.locked && !working && !boardOpen && !jumping && !this._touchUsed && doc.state !== 'down',
      shop: due ? { key: 'E', text: 'SHOP RUN', sub: `${due.def.name}${sType ? ' · ' + sType.toLowerCase() : ''} · side door`, near: this.lookTarget?.id === 'door' || this._doorDist() < 0.8 } : null,
    };
  }
  _promptFor(id, stepSt) {
    const lab = this.lab;
    const name = this._stationName(id);
    switch (id) {
      case 'recipe': return { key: 'E', text: 'Recipe Board', sub: lab.state === 'running' ? 'batch running' : 'choose a batch' };
      case 'pantry': return { key: 'E', text: 'Pantry', sub: this.hud?.pantryOpen ? 'close' : 'check the stock' };
      case 'vent': return { key: 'E', text: 'Vent fan', sub: lab.ventOpen ? 'switch it off' : 'switch it on' };
      case 'curtains': return { key: 'E', text: 'Curtain cord', sub: lab.curtainsClosed ? 'open the curtains' : 'close the curtains', tone: lab.copAlarm ? 'bad' : '' };
      case 'extinguisher': return this.ext.state === 'hand' ? { key: 'E', text: 'Extinguisher', sub: 'hang it back' } : this.ext.state === 'home' ? { key: 'E', text: 'Extinguisher', sub: `grab it · ${lab.extinguisher ?? 0} charges` } : { key: '', text: 'Extinguisher', sub: 'it’s on the floor' };
      case 'stash': {
        const inv = this.lastSnap?.inv || lab.inv || {};
        return { key: 'E', text: 'Product stash', sub: `${inv.units || 0} / ${this.data.route?.sellPoint?.requiredUnits ?? 6} bags` };
      }
      case 'door':
        return this._shopDue && this.shop.state === 'none' ? { key: 'E', text: 'Side door', sub: `jump out — ${this._shopDue.def.name}`, tone: 'shop' }
          : { key: '', text: 'Side door', sub: 'only at a supply stop', tone: 'idle' };
      default: break;
    }
    if (this._isStepStation(id)) {
      const st = this.it.stationById[id];
      const steps = (st?.steps || []).join(' · ');
      if (lab.state !== 'running') return { key: '', text: name, sub: steps ? `${steps} · pick a recipe first` : 'pick a recipe first', tone: 'idle' };
      if (stepSt === id) return { key: 'E', text: name, sub: lab.getCurrentStep()?.paused ? 'next step' : (lab.current?.label || steps) };
      return { key: '', text: name, sub: `not now · next: ${this._stationName(stepSt)}`, tone: 'next' };
    }
    return { key: 'E', text: name };
  }

  // ── highlight: next station ring + bouncing arrow ─────────────────────────
  _updateHighlight() {
    const lab = this.lab, doc = this.doc, P = this.it.parts;
    let id = null;
    if (lab.fire > 0) id = this.ext.state === 'hand' ? 'stove' : this.ext.state === 'home' ? 'extinguisher' : null;
    else if (this._shopDue && this.shop.state === 'none') id = 'door';
    else if (lab.state === 'running') id = this._curStepStation();
    else if (lab.state === 'idle' && lab.canStart && !this.hud?.boardOpen) id = 'recipe';
    if (id && doc.state === 'working' && doc.workStation === id) id = null;
    const t = this.time;
    const D = this.it.dims;
    if (id === 'door') {
      const s = P.doorStand, dd = P.doorDims;
      P.ring.visible = P.arrow.visible = true;
      P.ring.position.set(s.x, D.FY + 0.015, s.z);
      const pul = 1 + 0.08 * Math.sin(t * 6);
      P.ring.scale.set(pul, 1, pul);
      P.ring.material.color.set('#F2B90F');
      P.arrow.position.set(-D.XI + 0.25, D.FY + 1.55 + Math.abs(Math.sin(t * 4)) * 0.1, (dd.d0 + dd.d1) / 2);
      P.arrow.rotation.y = t * 2;
      P.arrow.material.color.set('#F2B90F');
      return;
    }
    const st = id ? this.it.stationById[id] : null;
    P.ring.visible = P.arrow.visible = !!st;
    if (!st) return;
    P.ring.position.set(st.stand.x, D.FY + 0.015, st.stand.z);
    const pul = 1 + 0.08 * Math.sin(t * 6);
    P.ring.scale.set(pul, 1, pul);
    P.ring.material.color.set(lab.fire > 0 ? '#ff7a2a' : '#d9a83a');
    const a = this.it.anchors[id];
    a.updateMatrix();
    const top = st.kind === 'shelf' ? 1.05 : st.kind === 'board' ? 1.05 : st.kind === 'wall' ? 0.75 : 0.45;
    _v.set(0, top + 0.12 + Math.abs(Math.sin(t * 4)) * 0.12, st.kind === 'board' ? -0.45 : -0.25).applyMatrix4(a.matrix);
    P.arrow.position.copy(_v);
    P.arrow.rotation.y = t * 2;
    P.arrow.material.color.set(lab.fire > 0 ? '#ff7a2a' : '#ffffff');
  }

  _refreshBoardTexture(force) {
    const lab = this.lab;
    const list = lab.availableRecipes ? lab.availableRecipes() : [];
    const sig = JSON.stringify([list.map((r) => r.canMake), lab.state === 'running']);
    if (!force && sig === this._boardTexSig) return;
    this._boardTexSig = sig;
    this.it.parts.board.draw(list.map((r) => ({ name: r.name, kind: r.kind, canMake: r.canMake, steps: r.steps })), { cooking: lab.state === 'running' });
  }

  _onLabEvent(type, d) {
    if (!this.built) return;
    if (type === 'bump' && d && d.power >= 0.9) this.doc.bumpImpulse(d.power);   // hard landings etc.
    if (type === 'recipeFailed' || type === 'recipeDone' || type === 'idle') { this._disposePresenter(); }
    if (type === 'cookDown') { this._leaveStation(); this.hud && this.hud.closeBoard(); }
  }
  _onDocEvent(ev) {
    if (ev.type === 'arrived' && ev.station) this._interact(ev.station);
    if (ev.type === 'stumble') {
      if (this.ext.state === 'hand') this._dropExtinguisher();
      this.hud && this.hud.toast('Whoa — big bump!', 'bad');
    }
  }

  // ── input ──────────────────────────────────────────────────────────────────
  onKey(e, isDown) {
    if (!this.active || !this.built) return false;
    const code = e.code;
    if (this.shop.state === 'out') return false;                         // the shop run (main.js) has the keys
    if (this.shop.state === 'jump') return !!MOVE_KEYS[code] || code === 'KeyE' || code === 'Space' || code === 'Escape';
    const lab = this.lab, doc = this.doc, hud = this.hud, fp = this._mode === 'fp';
    if (hud && hud.boardOpen) {
      if (code === 'Tab') { if (isDown && !e.repeat) hud.closeBoard(); return true; }
      if (hud.boardKey(code, isDown)) return true;
      if (isDown && (code === 'KeyE' || code === 'Space')) { hud.closeBoard(); this._leaveStation(); return true; }
    }
    // presenter gets first dibs on keys while working its station
    if (this.presenter && doc.state === 'working' && doc.workStation === this.presenter.station && this.presenter.p.key) {
      try { if (this.presenter.p.key(code, isDown)) return true; } catch (err) { console.warn('[van] presenter key', err); }
    }
    if (code === 'KeyO') { if (isDown && !e.repeat) this.setViewMode(fp ? 'overview' : 'fp'); return true; }
    if (code === 'KeyV') { if (isDown && !e.repeat) this._toggleVent(); return true; }
    if (code === 'Tab') { if (isDown && !e.repeat) this._toggleBoard(); return true; }
    if (MOVE_KEYS[code]) {
      if (isDown) { this.held.add(code); if (doc.state === 'working' || this._focusKind) this._relock(); }
      else this.held.delete(code);
      return true;
    }
    // Space = jump, except where it already means something: at a station (hold to pour, the board) or spraying
    if (code === 'Space' && doc.state !== 'working' && this.ext.state !== 'hand') {
      if (isDown && !e.repeat) this.jump();
      return true;
    }
    if (code === 'KeyE' || code === 'Space') {
      if (!isDown) { this.held.delete(code); this._useUp(); return true; }
      if (e.repeat) return true;
      this.held.add(code);
      this._useDown();
      return true;
    }
    if (code === 'KeyQ' || code === 'Escape') {
      if (!isDown) return true;
      if (hud && hud.pantryOpen) { hud.togglePantry(false); return true; }
      if (doc.state === 'working') { this._leaveStation(); if (code === 'KeyQ') this._relock(); return true; }
      if (this.ext.state === 'hand') { this._dropExtinguisher(true); return true; }
      return fp || code === 'KeyQ';   // first person: Esc only frees the mouse (the browser does that) — it never pauses
    }
    return false;
  }
  /** E / Space / LMB pressed (not while the board is open). */
  _useDown() {
    const lab = this.lab, doc = this.doc, hud = this.hud, fp = this._mode === 'fp';
    if (lab.cookDown) return;
    if (doc.state === 'working') {
      if (doc.workStation === 'recipe') { hud && hud.openBoard(); return; }
      // placeholder presenter: E plays the step
      if (this.presenter && this.presenter.p._placeholder) this.presenter.p.pointerDown({ local: new THREE.Vector3(), object: null });
      return;
    }
    const target = fp ? this.lookTarget?.id : null;
    if (this.ext.state === 'hand') {
      if (fp ? target === 'extinguisher' && !this._fireInReach() : this._bestStation()?.id === 'extinguisher' && !this._nearFire()) { this._hangExtinguisher(); return; }
      this._startSpray();
      return;
    }
    if (fp ? this._fireInReach() || (this._nearFire() && target === 'stove') : this._nearFire()) { this._beatFire(); return; }
    if (this._nearDroppedExt()) { this._pickUpDropped(); return; }
    if (fp) { if (target) this._useStation(target); return; }
    if (this._shopDue && this.shop.state === 'none' && this._doorDist() < 0.8) { this._useDoor(); return; }
    const n = this._bestStation();
    if (n) this._interact(n.id);
  }
  _useUp() {
    this._stopSpray();
    if (this.presenter && this.presenter.p._placeholder && this.doc.state === 'working') this.presenter.p.pointerUp(null);
  }

  jump() {
    if (!this.active || this.shop.state !== 'none' || this.lab.cookDown) return false;
    return this.doc.jump();
  }

  _bind() {
    const c = this.canvas;
    this._h = {
      down: (e) => this._pointerDown(e),
      move: (e) => this._pointerMove(e),
      up: (e) => this._pointerUp(e),
      wheel: (e) => { if (!this.active || !this.built) return; e.preventDefault(); if (this._mode === 'fp' || this.shop.state !== 'none') return; if (!this.cam.focus) this.cam.zoomBy(e.deltaY > 0 ? 1 : -1); },
      ctx: (e) => { if (this.active) e.preventDefault(); },
      lock: () => {
        const was = this.locked;
        this.locked = typeof document !== 'undefined' && document.pointerLockElement === this.canvas;
        if (this.locked) this._autoUnlocked = false;
        if (was !== this.locked && this.locked) this.canvas.style.cursor = '';
      },
    };
    c.addEventListener('pointerdown', this._h.down);
    c.addEventListener('pointermove', this._h.move);
    c.addEventListener('pointerup', this._h.up);
    c.addEventListener('pointercancel', this._h.up);
    c.addEventListener('wheel', this._h.wheel, { passive: false });
    c.addEventListener('contextmenu', this._h.ctx);
    if (typeof document !== 'undefined') document.addEventListener('pointerlockchange', this._h.lock);
  }
  _setRay(e) {
    const r = this.canvas.getBoundingClientRect();
    _ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.view.camera.updateMatrixWorld();
    _ray.setFromCamera(_ndc, this.view.camera);
    return _ray;
  }
  /** Presenter hit in anchor space: mesh hit, else the work plane (counter top y=0, or the wall plane z=−0.6 for wall stations). */
  _presenterHit(e) {
    const P = this.presenter;
    if (!P) return null;
    const ray = this._setRay(e);
    const anchor = this.it.anchors[P.station];
    let objs = [];
    try { objs = (P.p.pick && P.p.pick()) || []; } catch (err) { objs = []; }
    const hits = objs.length ? ray.intersectObjects(objs, true) : [];
    if (hits.length) {
      const h = hits[0];
      return { local: anchor.worldToLocal(h.point.clone()), object: h.object, point: h.point.clone() };
    }
    anchor.updateWorldMatrix(true, false);
    const kind = this.it.stationById[P.station]?.kind;
    const plane = new THREE.Plane();
    if (kind === 'wall') plane.setFromNormalAndCoplanarPoint(_v.set(0, 0, 1).transformDirection(anchor.matrixWorld), _v2.set(0, 0, -0.6).applyMatrix4(anchor.matrixWorld));
    else plane.setFromNormalAndCoplanarPoint(_v.set(0, 1, 0).transformDirection(anchor.matrixWorld), _v2.set(0, 0, 0).applyMatrix4(anchor.matrixWorld));
    const pt = new THREE.Vector3();
    if (ray.ray.intersectPlane(plane, pt)) return { local: anchor.worldToLocal(pt.clone()), object: null, point: pt, plane: true };
    return null;
  }
  _workingPresenter() {
    const doc = this.doc;
    return doc.state === 'working' && this.presenter && doc.workStation === this.presenter.station;
  }
  _pointerDown(e) {
    if (!this.active || !this.built || this.destroyed) return;
    if (this.shop.state === 'out' || this.shop.state === 'jump') return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const doc = this.doc, lab = this.lab;
    if (lab.cookDown) return;
    if (this.hud && this.hud.boardOpen) return;
    if (this._workingPresenter()) {
      try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      this.pointer.down = true; this.pointer.id = e.pointerId;
      const hit = this._presenterHit(e);
      try { this.presenter.p.pointerDown && this.presenter.p.pointerDown(hit); } catch (err) { console.warn('[van] presenter pointerDown', err); }
      e.preventDefault();
      return;
    }
    if (this._mode === 'fp') {
      if (e.pointerType === 'mouse' || !e.pointerType) {
        if (!this.locked) { this._requestLock(); return; }      // first click takes the mouse
        this.pointer.down = true; this.pointer.lmb = true;       // locked: LMB = use
        this._useDown();
        return;
      }
      // touch / pen: drag to look, tap to use
      this._touchUsed = true;
      try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      this.pointer = { down: true, id: e.pointerId, touch: true, lx: e.clientX, ly: e.clientY, moved: 0, t0: performance.now() };
      e.preventDefault();
      return;
    }
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    this.pointer.down = true; this.pointer.id = e.pointerId;
    if (doc.state === 'working') this._leaveStation();
    this._clickWorld(e);
  }
  /** Overview click / first-person tap: station → walk there and use it; floor → walk; door → shop run. */
  _clickWorld(e) {
    const doc = this.doc, lab = this.lab;
    const ray = this._setRay(e);
    const sh = ray.intersectObjects([...this.it.parts.stationPicks, this.it.parts.doorPick], false)[0];
    const fh = ray.intersectObject(this.it.parts.floorPick, false)[0];
    // carrying the extinguisher: press on the fire (or right next to Doc) and hold to spray; elsewhere = walk
    if (this.ext.state === 'hand') {
      const fp = fh ? this.it.root.worldToLocal(fh.point.clone()) : null;
      const b = this.hz.burner;
      const atFire = lab.fire > 0 && ((sh && sh.object.userData.station === 'stove') || (fp && Math.hypot(fp.x - b.x, fp.z - b.z) < 0.9));
      const atDoc = fp && Math.hypot(fp.x - doc.x, fp.z - doc.z) < 0.55;
      if ((atFire && this._burnerDist() < 1.9) || atDoc) {
        if (fp && !atFire && this._mode !== 'fp') doc.yaw = Math.atan2(fp.x - doc.x, fp.z - doc.z);
        this._startSpray();
        return;
      }
      if (atFire) { doc.walkTo(b.x - 0.75, b.z, null); return; }
    }
    // fire click: beat it if close
    if (lab.fire > 0 && this._nearFire() && sh && sh.object.userData.station === 'stove') { this._beatFire(); return; }
    if (sh && (!fh || sh.distance <= fh.distance + 0.05)) {
      const id = sh.object.userData.station;
      if (id === 'door') { this._useDoor(); return; }
      if (doc.distToStation(id) < 0.2) this._interact(id); else doc.walkToStation(id);
      return;
    }
    if (fh) {
      const p = this.it.root.worldToLocal(fh.point.clone());
      doc.walkTo(p.x, p.z, null);
    }
  }
  _pointerMove(e) {
    if (!this.active || !this.built) return;
    if (this.shop.state === 'out' || this.shop.state === 'jump') return;
    if (this._workingPresenter()) {
      const hit = this._presenterHit(e);
      try { this.presenter.p.pointerMove && this.presenter.p.pointerMove(hit); } catch (err) { /* ignore */ }
      this.canvas.style.cursor = this.presenter.p.cursor || (hit && hit.object ? 'pointer' : 'crosshair');
      return;
    }
    if (this._mode === 'fp') {
      if (this.locked) {
        this.setLook(this.look.yaw - (e.movementX || 0) * LOOK_SENS, this.look.pitch - (e.movementY || 0) * LOOK_SENS);
        return;
      }
      const p = this.pointer;
      if (p.down && p.touch && e.pointerId === p.id) {
        const dx = e.clientX - p.lx, dy = e.clientY - p.ly;
        p.lx = e.clientX; p.ly = e.clientY; p.moved += Math.abs(dx) + Math.abs(dy);
        this.setLook(this.look.yaw - dx * TOUCH_SENS, this.look.pitch - dy * TOUCH_SENS);
        return;
      }
      if (!this.hud?.boardOpen) this.canvas.style.cursor = this.lockHint ? 'pointer' : 'default';
      return;
    }
    if (this.pointer.down) return;
    // hover cursor over stations
    const ray = this._setRay(e);
    const sh = ray.intersectObjects([...this.it.parts.stationPicks, this.it.parts.doorPick], false)[0];
    this.canvas.style.cursor = sh ? 'pointer' : 'default';
  }
  _pointerUp(e) {
    const p = this.pointer;
    if (p.lmb) { this.pointer = { down: false, id: null }; this._useUp(); return; }
    if (p.touch && p.down) {
      this.pointer = { down: false, id: null };
      try { this.canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (this.active && this.built && p.moved < 12 && performance.now() - p.t0 < 400 && this.shop.state === 'none' && !this.lab.cookDown) this._clickWorld(e);
      return;
    }
    if (!p.down) return;
    this.pointer.down = false;
    try { this.canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    this._stopSpray();
    if (this._workingPresenter()) {
      const hit = this._presenterHit(e);
      try { this.presenter.p.pointerUp && this.presenter.p.pointerUp(hit); } catch (err) { /* ignore */ }
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    const c = this.canvas;
    if (this._h) {
      c.removeEventListener('pointerdown', this._h.down); c.removeEventListener('pointermove', this._h.move);
      c.removeEventListener('pointerup', this._h.up); c.removeEventListener('pointercancel', this._h.up);
      c.removeEventListener('wheel', this._h.wheel); c.removeEventListener('contextmenu', this._h.ctx);
      if (typeof document !== 'undefined') document.removeEventListener('pointerlockchange', this._h.lock);
    }
    if (this._labUnsub) this._labUnsub();
    this._releaseLock(false);
    if (!this.built) return;
    this._disposePresenter();
    if (this.active) { this.view.setCameraController && this.view.cameraController === this.cam && this.view.setCameraController(null); this.view.setVanMode && this.view.setVanMode(false); this._restoreNear(); }
    if (typeof this.lab.setPresenceMode === 'function') this.lab.setPresenceMode('any');
    try { this.cam?.cut?.destroy(); } catch (e) { /* best effort */ }
    this.hz.dispose();
    this.hud && this.hud.destroy();
    for (const [id, o] of Object.entries(this.idle)) { if (this.presenters?.disposeIdleProps) this.presenters.disposeIdleProps(o); else o.removeFromParent(); delete this.idle[id]; }
    this._releaseExtFromHands();
    if (this.ext.state === 'hand') this.it.root.add(this.it.parts.extinguisher);   // so it.dispose() frees it
    if (this.hands) { try { this.hands.dispose(); } catch (e) { /* best effort */ } this.hands = null; }
    this.avatar.model.removeFromParent();
    this.it.dispose();
  }
}
const _X = new THREE.Vector3(1, 0, 0), _Y = new THREE.Vector3(0, 1, 0);

// ── Doc's visual: walk cycle, work motion, stumble flail, lying down ────────
class DocAvatar {
  constructor(model, it, scale) {
    this.it = it;
    this.model = model;
    model.name = 'doc';
    model.scale.setScalar(scale);
    model.rotation.order = 'YXZ';
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    it.root.add(model);
    const g = (n) => model.getObjectByName(n) || new THREE.Object3D();
    this.j = { body: g('body'), head: g('head'), al: g('arm_l'), ar: g('arm_r'), ll: g('leg_l'), lr: g('leg_r') };
    this.scale = scale;
    this.downK = 0; this.downYaw = 0; this.downX = 0; this.downZ = 0;
    this.beat = 0; this.pull = 0;
    this.t = 0;
    this.hand = new THREE.Object3D(); this.hand.name = 'doc_hand_r';
    this.hand.position.set(0, -0.62, 0.06);
    this.j.ar.add(this.hand);
  }
  attachToHand(obj) {
    this.hand.add(obj);
    obj.position.set(0.0, -0.32, 0.05);
    obj.rotation.set(0, 0, 0);
    obj.scale.setScalar(1 / this.scale);
  }
  nozzleWorld(out) {
    const n = this.it.parts.extinguisher.getObjectByName('extinguisher_nozzle');
    n.updateWorldMatrix(true, false);
    out.setFromMatrixPosition(n.matrixWorld);
    return this.it.root.worldToLocal(out);
  }
  headPos(out) {
    this.j.head.updateWorldMatrix(true, false);
    out.setFromMatrixPosition(this.j.head.matrixWorld);
    return this.it.root.worldToLocal(out);
  }
  update(dt, doc, ctx) {
    this.t += dt;
    const t = this.t, j = this.j, m = this.model, D = this.it.dims;
    const lab = ctx.lab;
    this.beat = Math.max(0, this.beat - dt);
    this.pull = Math.max(0, this.pull - dt);
    const down = doc.state === 'down';
    this.downK += ((down ? 1 : 0) - this.downK) * (1 - Math.exp(-dt * (down ? 7 : 4)));
    if (down && this.downK < 0.05) {
      // lie along the aisle, head toward the side with more room
      this.downYaw = doc.z > -1.2 ? 0 : Math.PI;   // falling backward: head goes opposite to facing
      this.downX = clamp(doc.x, -0.25, 0.25); this.downZ = doc.z;
    }
    // base pose
    const lean = doc.lean;
    const lx = lean * Math.cos(doc.yaw), lz = lean * Math.sin(doc.yaw);
    m.position.set(doc.x + lean * 0.4, D.FY + doc.hop, doc.z);
    m.rotation.set(0, doc.yaw, 0);
    let bodyX = 0, bodyZ = -lx * 1.4, headX = 0, headY = 0;
    let al = 0.08, ar = 0.08, alz = 0, arz = 0, ll = 0, lr = 0;
    const sp = doc.speed;
    const ph = doc.walkPhase;
    if (doc.state === 'walking' || sp > 0.2) {
      const A = Math.min(1, sp / 2.2);
      ll = Math.sin(ph) * 0.62 * A; lr = -ll;
      al = -Math.sin(ph) * 0.5 * A; ar = -al;
      m.position.y += Math.abs(Math.cos(ph)) * 0.035 * A;
      bodyX = 0.06 * A + lz * 0.6;
    } else {
      al = 0.05 + Math.sin(t * 1.6) * 0.03; ar = 0.05 - Math.sin(t * 1.6) * 0.03;
      headY = Math.sin(t * 0.5) * 0.15;
    }
    if (doc.state === 'working') {
      const busy = ctx.inputActive ? 1 : 0.35;
      const w = ctx.workType;
      const s1 = Math.sin(t * (w === 'stir' ? 7 : w === 'hammer' ? 9 : w === 'grind' ? 6 : 4));
      al = -1.05 + s1 * 0.12 * busy; ar = -1.2 - s1 * 0.18 * busy;
      if (w === 'hammer') ar = -1.6 + Math.max(0, s1) * 0.9 * busy;
      if (w === 'stir') { arz = 0.15 * Math.cos(t * 7) * busy; ar = -1.15 + 0.12 * Math.sin(t * 7) * busy; }
      alz = -0.15; arz += 0.15;
      bodyX = 0.12; headX = 0.35;
      ll = lr = 0;
    }
    if (doc.airborne && doc.state !== 'working') { // jump: legs tucked, arms out
      const k = Math.min(1, doc.y / 0.18);
      ll = ll * (1 - k) - 0.9 * k; lr = lr * (1 - k) + 0.25 * k;
      al = al * (1 - k) - 1.1 * k; ar = ar * (1 - k) - 1.1 * k; alz = -0.35 * k; arz = 0.35 * k;
      m.position.y = D.FY + doc.hop;
    }
    if (ctx.ext.state === 'hand') {
      ar = ctx.ext.spraying ? -1.35 + Math.sin(t * 30) * 0.03 : -0.35;
      arz = 0.1;
    }
    if (this.beat > 0) { ar = -2.2 + Math.sin(t * 30) * 0.8; al = -1.6 + Math.cos(t * 30) * 0.6; }
    if (this.pull > 0) { al = -2.4 + (0.5 - this.pull) * 2.4; }
    if (doc.state === 'stumbling') {
      al = -2.6 + Math.sin(t * 16) * 0.6; ar = -2.4 + Math.cos(t * 15) * 0.6;
      alz = 0.9 + Math.sin(t * 13) * 0.4; arz = -0.9 - Math.cos(t * 12) * 0.4;
      ll = Math.sin(t * 14) * 0.5; lr = -ll;
      bodyX = Math.sin(t * 9) * 0.25; bodyZ += Math.sin(t * 7) * 0.3;
      headX = Math.sin(t * 11) * 0.3;
    }
    // lying down (blend)
    const k = this.downK;
    if (k > 0.001) {
      const yaw = this.downYaw;
      m.position.x += (this.downX - m.position.x) * k;
      m.position.z += (this.downZ - m.position.z) * k;
      m.position.y = D.FY + doc.hop * (1 - k) + 0.13 * this.scale * k;
      m.rotation.y = doc.yaw + Math.atan2(Math.sin(yaw - doc.yaw), Math.cos(yaw - doc.yaw)) * k;
      m.rotation.x = -Math.PI / 2 * k * 0.98;
      al = al * (1 - k) + (-0.4 + Math.sin(t * 2) * 0.05) * k; ar = ar * (1 - k) + (-0.3) * k;
      alz = alz * (1 - k) + 1.1 * k; arz = arz * (1 - k) - 1.1 * k;
      ll = ll * (1 - k) + 0.1 * k; lr = lr * (1 - k) - 0.1 * k;
      bodyX *= 1 - k; bodyZ *= 1 - k; headX = headX * (1 - k) + Math.sin(t * 1.5) * 0.2 * k;
    }
    j.body.rotation.set(bodyX, 0, bodyZ);
    j.head.rotation.set(headX, headY, 0);
    j.al.rotation.set(al, 0, alz); j.ar.rotation.set(ar, 0, arz);
    j.ll.rotation.set(ll, 0, 0.04); j.lr.rotation.set(lr, 0, -0.04);
    void lab;
  }
}

function fallbackDoc() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: '#e07a3f' });
  const body = new THREE.Object3D(); body.name = 'body'; body.position.y = 0.88; g.add(body);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.55, 0.25), mat); torso.position.y = 0.3; body.add(torso);
  for (const [n, x, y] of [['head', 0, 0.6], ['arm_l', 0.24, 0.5], ['arm_r', -0.24, 0.5], ['leg_l', 0.1, 0], ['leg_r', -0.1, 0]]) {
    const p = new THREE.Object3D(); p.name = n; p.position.set(x, y, 0); body.add(p);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, n === 'head' ? 0.28 : 0.6, 0.12), mat); m.position.y = n === 'head' ? 0.16 : -0.3; p.add(m);
  }
  return g;
}

// ── placeholder presenter (until VANCOOK's presenters/index.js exists) ──────
function placeholderPresenter(type, { anchor, lab, game }) {
  const geo = new THREE.BoxGeometry(0.3, 0.2, 0.3);
  const mat = new THREE.MeshBasicMaterial({ color: '#7fd6c2', transparent: true, opacity: 0.85 });
  const box = new THREE.Mesh(geo, mat);
  box.name = `placeholder_${type}`;
  box.position.set(0, type === 'hammer' ? 0.45 : 0.1, type === 'hammer' ? -0.5 : -0.3);
  anchor.add(box);
  let t = 0, down = false;
  const g = () => (lab.current === game ? game : null);
  return {
    _placeholder: true,
    hint: `Click / hold the glowing box (${type})`,
    update(dt, { active } = {}) {
      t += dt;
      mat.opacity = active ? 0.55 + 0.35 * Math.sin(t * 5) : 0.35;
      box.rotation.y += dt * (down ? 4 : 1);
    },
    pick() { return [box]; },
    pointerDown() { const m = g(); if (!m) return; down = true; m.pointerDown(0.5, 0.5); },
    pointerMove() { const m = g(); if (m && down) m.pointerMove(0.5 + Math.sin(t * 8) * 0.1, 0.5 + Math.cos(t * 8) * 0.1); },
    pointerUp() { const m = g(); down = false; if (m) m.pointerUp(0.5, 0.5); },
    key() { return false; },
    camera() { return FALLBACK_CLOSEUP; },
    dispose() { box.removeFromParent(); geo.dispose(); mat.dispose(); },
  };
}
