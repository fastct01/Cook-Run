// ─────────────────────────────────────────────────────────────────────────────
// VanLab3D — the cook's 3D lab inside the RV (orchestrator). See VAN_CONTRACT.md.
//
//   const van = new VanLab3D(view, lab, data, { canvas, hudRoot, role: 'cook'|'solo' });
//   await van.ready;                 // interior built (render is safe before)
//   van.setActive(true|false);       // dollhouse cam + interior + Doc input  |  view's own camera
//   van.update(dt, snap);            // every frame BEFORE view.render(dt)
//   van.onKey(e, isDown) → bool      // forward keydown/keyup while active
//   van.destroy();
//   van.docState                     // 'idle'|'walking'|'working'|'stumbling'|'down'
//
// Pieces: interior.js (cut-away shell + stations + anchors), DocController.js (pure movement
// logic), vanCamera.js (dollhouse / close-up), hazards3d.js (fire, fumes, vent, curtains, …),
// VanHud.js (prompts, step panel, recipe board). Step presenters come from
// ./presenters/index.js (Agent VANCOOK) — loaded dynamically, with a placeholder fallback.
// [roof hook] Agent ROOF's roof defence (./roof/RoofDefence.js, loaded dynamically, guarded) adds a
// 'roof' mode: during a supply stop R (or clicking the hatch) sends Doc up the roof ladder; while
// van.roof.ownsDoc the lab movement/stations are skipped. Extra options: { sendCommand(cmd) (cook →
// host; defaults to the CookLab's sender), roof: false (disable), roofSpectate: bool (follow the solo AI) }.
// Unity: a LabController MonoBehaviour on the RV prefab owning the same sub-components.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { buildInterior, poseSeated } from './interior.js';
import { DocController } from './DocController.js';
import { VanCamera, FALLBACK_CLOSEUP } from './vanCamera.js';
import { Hazards3D } from './hazards3d.js';
import { VanHud } from './VanHud.js';

const MOVE_KEYS = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
const STEP_STATION_FALLBACK = { grind: 'grind', measure: 'measure', heat: 'stove', stir: 'stove', cool: 'cool', break: 'break', hammer: 'hammer' };
const BOARD_POSE = { pos: { x: 0, y: 0.72, z: 1.25 }, target: { x: 0, y: 0.5, z: -0.6 }, fov: 50 };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4(), _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2();

export class VanLab3D {
  constructor(view, lab, data, { canvas = null, hudRoot = null, role = 'cook', sendCommand = null, roof = true, roofSpectate = false } = {}) {
    this.view = view; this.lab = lab; this.data = data; this.van = data.van; this.role = role;
    // [roof hook] cook → host commands (roofEnter/roofLeave/roofAim/roofThrow); falls back to the CookLab's sender
    this.sendCommand = typeof sendCommand === 'function' ? sendCommand : (cmd) => (typeof lab._send === 'function' ? lab._send(cmd) : undefined);
    this.roofOpts = { enabled: roof !== false, spectate: !!roofSpectate };
    this.roof = null;
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
    this._promptCache = null;
    this.stepStation = { ...STEP_STATION_FALLBACK };
    for (const st of this.van.stations || []) for (const t of st.steps || []) this.stepStation[t] = st.id;
    this._labUnsub = lab.subscribe ? lab.subscribe((type, d) => this._onLabEvent(type, d)) : null;
    this._bind();
    this.ready = this._init();
  }

  get docState() { return this.roof && this.roof.ownsDoc ? 'roof' : this.doc ? this.doc.state : 'idle'; }

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
    if (this.hudRoot) {
      this.hud = new VanHud(this.hudRoot, this.lab, this.data, {
        onCook: (id) => this.lab.requestRecipe(id),
        onDump: () => this.lab.abortBatch(),
        onBoardClosed: () => {
          if (this.cam && this._focusKind === 'board') this._setFocus(null);
          if (this.doc && this.doc.state === 'working' && this.doc.workStation === 'recipe') this.doc.stopWork();
        },
      });
      this.hud.setVisible(this.active);
    }
    if (this.roofOpts.enabled) await this._loadRoof(createModel);
    await this._loadPresenters();
    this._refreshBoardTexture(true);
    this.built = true;
    this._applyActive();
    return this;
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
  // [roof hook] roof defence client (Agent ROOF); the lab works without it
  async _loadRoof(createModel) {
    try {
      const m = await import('./roof/RoofDefence.js');
      if (this.destroyed) return;
      this.roof = new m.RoofClient(this, { createModel, spectate: this.roofOpts.spectate });
    } catch (e) { console.warn('[van] roof defence unavailable:', e && e.message); this.roof = null; }
  }

  /** Re-import ./presenters/index.js (e.g. after VANCOOK drops it in). */
  async reloadPresenters() {
    this._disposePresenter();
    for (const o of Object.values(this.idle)) o.removeFromParent();
    this.idle = {};
    await this._loadPresenters();
  }

  // the van cam pulls the near plane forward (cut-away); give the next camera the normal one back
  _restoreNear() {
    const cam = this.view.camera;
    if (cam && cam.near !== 0.25) { cam.near = 0.25; cam.updateProjectionMatrix(); }
    this.cam?.cut?.disable();
  }

  // ── activation ─────────────────────────────────────────────────────────────
  setActive(on) {
    this.active = !!on;
    if (this.built) this._applyActive();
  }
  _applyActive() {
    const on = this.active;
    this.it.root.visible = on;
    this.view.setVanMode && this.view.setVanMode(on);
    // only release the camera if we hold it (the garage tutorial / first-person cab may own it)
    if (this.view.setCameraController) {
      if (on) this.view.setCameraController(this.cam);
      else if (this.view.cameraController === this.cam) { this.view.setCameraController(null); this._restoreNear(); }
    }
    if (on) this.cam.snap();
    if (this.hud) this.hud.setVisible(on);
    this.hz.setActive(on);
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
    }
    if (this.roof) this.roof.setActive(on);   // [roof hook]
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
    if (this.roof) { try { this.roof.update(dt, snap); } catch (e) { console.error('[van] roof update', e); } }   // [roof hook]
    if (!this.active) return;
    if (this.roof && this.roof.ownsDoc) { this._updateRoofOwned(dt, snap); return; }
    // camera floor basis → keyboard directions are screen-relative
    this.cam.follow = this.cam.follow || { x: 0, z: 0 };
    this.cam.follow.x = doc.x; this.cam.follow.z = doc.z;
    const b = this.cam.floorBasis(this.view.camera);
    doc.setCameraBasis(b.rx, b.rz, b.fx, b.fz);
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
    this._updateWork(dt);
    this._updateSpray(dt);
    // presenter
    if (this.presenter) {
      const P = this.presenter;
      try { P.p.update && P.p.update(dt, { feel: lab.feel || feel, active: doc.state === 'working' && doc.workStation === P.station }); } catch (e) { console.error('[van] presenter update', e); this._disposePresenter(); }
    }
    // avatar + highlight + hazards + HUD
    this.avatar.update(dt, doc, { lab, ext: this.ext, workType: this.presenter?.game?.type, inputActive: this.pointer.down || this.held.has('KeyE') || this.held.has('Space') });
    // the close-up camera sits where Doc's head is: hide him while it's in (presenter props show the work)
    this.avatar.model.visible = !(this.cam.focus && this.cam.blend > 0.35 && this._focusKind) || doc.state === 'down';   // [roof hook] the roof's ladder close-up (no _focusKind) keeps Doc visible
    this._updateHighlight(dt);
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

  // [roof hook] Doc is on the roof (or climbing): no lab movement/stations; the lab keeps running underneath
  _updateRoofOwned(dt, snap) {
    const doc = this.doc, feel = snap.feel || {};
    doc.setMove(0, 0);
    this._updateWork(dt);
    if (this.presenter) {
      const P = this.presenter;
      try { P.p.update && P.p.update(dt, { feel: this.lab.feel || feel, active: false }); } catch (e) { console.error('[van] presenter update', e); this._disposePresenter(); }
    }
    this.it.parts.ring.visible = this.it.parts.arrow.visible = false;
    this.hz.update(dt, {
      snap, doc, lat: feel.latAcc || 0, sway: Math.min(1, Math.abs(feel.latAcc || 0) / 6),
      presenterAt: (id) => !!(this.presenter && this.presenter.station === id),
      spray: null, docHead: this.avatar.headPos(_v2), bumpFlicker: (feel.bump || 0) > 0.5, closeUp: false,
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
  _stationName(id) { return this.it?.stationById[id]?.name || id || ''; }
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

  /** E / click-arrival on a station. */
  _interact(id) {
    const lab = this.lab, doc = this.doc, hud = this.hud;
    if (lab.cookDown || doc.state === 'down') return;
    if (!id) return;
    const face = () => { doc.startWork(id); };
    switch (id) {
      case 'recipe':
        face();
        hud && hud.openBoard();
        this._setFocus(this.it.anchors.recipe, BOARD_POSE, 'board');
        return;
      case 'pantry':
        face(); doc.stopWork();
        hud && hud.togglePantry();
        return;
      case 'vent': face(); doc.stopWork(); lab.toggleVent(); return;
      case 'curtains': face(); doc.stopWork(); lab.toggleCurtains(); this.avatar.pull = 0.5; return;
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
        return;
      }
      default: break;
    }
    if (!this._isStepStation(id)) return;
    if (lab.state !== 'running') {
      hud && hud.toast(lab.state === 'requesting' ? 'Waiting for the driver to OK the batch…' : 'Nothing cooking — pick a recipe at the board', 'info');
      return;
    }
    const want = this._curStepStation();
    if (want === id) {
      if (this.ext.state === 'hand') this._dropExtinguisher(true);
      doc.startWork(id);
    } else hud && hud.toast(`Not needed right now — next: ${this._stationName(want)}`, 'info');
  }

  // ── fire / extinguisher ────────────────────────────────────────────────────
  _burnerDist() {
    const b = this.hz.burner;
    return Math.hypot(b.x - this.doc.x, b.z - this.doc.z);
  }
  _nearFire() { return this.lab.fire > 0 && this._burnerDist() < 1.7; }
  _grabExtinguisher() {
    const ex = this.it.parts.extinguisher;
    this.avatar.attachToHand(ex);
    this.ext.state = 'hand';
    this.hud && this.hud.toast(`Got the extinguisher (${this.lab.extinguisher ?? 0} charges)`, 'info');
  }
  _hangExtinguisher() {
    this._stopSpray();
    const ex = this.it.parts.extinguisher;
    this.it.root.add(ex);
    ex.position.copy(this.it.parts.extHome); ex.rotation.set(0, 0, 0); ex.scale.set(1, 1, 1);
    this.ext.state = 'home';
  }
  _dropExtinguisher(quiet = false) {
    if (this.ext.state !== 'hand') return;
    this._stopSpray();
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
    // turn toward the fire when it's close
    if (this._nearFire()) {
      const b = this.hz.burner;
      this.doc.yaw = Math.atan2(b.x - this.doc.x, b.z - this.doc.z);
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
      if (this._nearFire() && (this.lab.extinguisher ?? 0) >= 0) this.lab.extinguish();
    }
    if (this.lab.cookDown || this.ext.state !== 'hand') this._stopSpray();
  }
  _sprayRay() {
    const o = this.avatar.nozzleWorld(new THREE.Vector3());
    const yaw = this.doc.yaw;
    const d = new THREE.Vector3(Math.sin(yaw), -0.18, Math.cos(yaw)).normalize();
    if (this._nearFire()) { const b = this.hz.burner; d.set(b.x - o.x, b.y + 0.15 - o.y, b.z - o.z).normalize(); }
    return { on: true, origin: o, dir: d };
  }

  // ── HUD state ──────────────────────────────────────────────────────────────
  _hudState() {
    const lab = this.lab, doc = this.doc;
    const stepSt = this._curStepStation();
    const working = doc.state === 'working' && this._isStepStation(doc.workStation);
    let prompt = null;
    if (lab.cookDown) prompt = null;
    else if (doc.state === 'stumbling') prompt = { key: '', text: 'Whoa!', tone: 'bad' };
    else if (lab.fire > 0 && this._nearFire()) {
      prompt = this.ext.state === 'hand' ? { key: 'E', text: this.ext.spraying ? 'Spraying…' : 'Spray the fire!', tone: 'fire', sub: `${lab.extinguisher ?? 0} charges` }
        : { key: 'E', text: 'Beat out the fire!', tone: 'fire', sub: 'or grab the extinguisher' };
    } else if (working) prompt = { key: 'Q', text: 'Step away', tone: 'idle' };
    else if (this.hud?.boardOpen) prompt = null;
    else if (this._nearDroppedExt()) prompt = { key: 'E', text: 'Pick up the extinguisher' };
    else {
      const n = this._bestStation();
      if (n) prompt = this._promptFor(n.id, stepSt);
      else if (lab.fire > 0) prompt = { key: '', text: this.ext.state === 'hand' ? 'Get to the stove — FIRE!' : 'FIRE! Grab the extinguisher →', tone: 'fire' };
      else if (lab.state === 'running' && stepSt) prompt = { key: '', text: `Next step: ${this._stationName(stepSt)} →`, tone: 'next' };
      else if (lab.state === 'idle' && lab.canStart) prompt = { key: '', text: 'Pick a recipe at the board →', tone: 'idle' };
    }
    let awayText = null;
    if (lab.state === 'running' && stepSt && !working) {
      const st = lab.getCurrentStep();
      if (st && !st.paused) awayText = lab.current?.type === 'heat' ? 'The burner is still on!' : `Paused — go to the ${this._stationName(stepSt)}`;
    }
    return {
      prompt, working, hint: this.presenter && this.presenter.station === doc.workStation && this.presenter.p.hint !== lab.current?.instructions ? (this.presenter.p.hint || '') : '',
      nextName: stepSt ? this._stationName(stepSt) : '', awayText, carrying: this.ext.state === 'hand', docState: doc.state,
    };
  }
  _promptFor(id, stepSt) {
    const lab = this.lab;
    const name = this._stationName(id);
    switch (id) {
      case 'recipe': return { key: 'E', text: lab.state === 'running' ? 'Recipe Board (batch running)' : 'Recipe Board' };
      case 'pantry': return { key: 'E', text: this.hud?.pantryOpen ? 'Close the pantry' : 'Check the pantry' };
      case 'vent': return { key: 'E', text: lab.ventOpen ? 'Close the vent' : 'Open the vent' };
      case 'curtains': return { key: 'E', text: lab.curtainsClosed ? 'Open curtains' : 'Close curtains', tone: lab.copAlarm ? 'bad' : '' };
      case 'extinguisher': return this.ext.state === 'hand' ? { key: 'E', text: 'Hang the extinguisher back' } : this.ext.state === 'home' ? { key: 'E', text: 'Grab extinguisher' } : { key: '', text: 'Extinguisher is on the floor' };
      case 'stash': return { key: 'E', text: 'Count the stash' };
      default: break;
    }
    if (this._isStepStation(id)) {
      if (lab.state !== 'running') return { key: '', text: `${name} — pick a recipe first`, tone: 'idle' };
      if (stepSt === id) return { key: 'E', text: `Use ${name}`, sub: lab.getCurrentStep()?.paused ? 'next step' : (lab.current?.label || '') };
      return { key: '', text: `Not needed · Next: ${this._stationName(stepSt)} →`, tone: 'next' };
    }
    return { key: 'E', text: name };
  }

  // ── highlight: next station ring + bouncing arrow ─────────────────────────
  _updateHighlight() {
    const lab = this.lab, doc = this.doc, P = this.it.parts;
    let id = null;
    if (lab.fire > 0) id = this.ext.state === 'hand' ? 'stove' : this.ext.state === 'home' ? 'extinguisher' : null;
    else if (lab.state === 'running') id = this._curStepStation();
    else if (lab.state === 'idle' && lab.canStart && !this.hud?.boardOpen) id = 'recipe';
    if (id && doc.state === 'working' && doc.workStation === id) id = null;
    const st = id ? this.it.stationById[id] : null;
    P.ring.visible = P.arrow.visible = !!st;
    if (!st) return;
    const t = this.time;
    const D = this.it.dims;
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
    if (this.roof) { try { if (this.roof.onKey(e, isDown)) return true; } catch (err) { console.warn('[van] roof key', err); } }   // [roof hook]
    const code = e.code;
    const lab = this.lab, doc = this.doc, hud = this.hud;
    if (hud && hud.boardOpen) {
      if (hud.boardKey(code, isDown)) return true;
      if (isDown && (code === 'KeyE' || code === 'Space')) { hud.closeBoard(); this._leaveStation(); return true; }
    }
    // presenter gets first dibs on keys while working its station
    if (this.presenter && doc.state === 'working' && doc.workStation === this.presenter.station && this.presenter.p.key) {
      try { if (this.presenter.p.key(code, isDown)) return true; } catch (err) { console.warn('[van] presenter key', err); }
    }
    if (MOVE_KEYS[code]) {
      if (isDown) this.held.add(code); else this.held.delete(code);
      return true;
    }
    // Space = jump, except where it already means something: at a station (hold to pour, the board) or spraying
    if (code === 'Space' && doc.state !== 'working' && this.ext.state !== 'hand') {
      if (isDown && !e.repeat) this.jump();
      return true;
    }
    if (code === 'KeyE' || code === 'Space') {
      if (!isDown) {
        this.held.delete(code); this._stopSpray();
        if (this.presenter && this.presenter.p._placeholder && doc.state === 'working') this.presenter.p.pointerUp(null);
        return true;
      }
      if (e.repeat) return true;
      this.held.add(code);
      if (lab.cookDown) return true;
      if (doc.state === 'working') {
        if (doc.workStation === 'recipe') { hud && hud.openBoard(); return true; }
        // placeholder presenter: E plays the step
        if (this.presenter && this.presenter.p._placeholder) this.presenter.p.pointerDown({ local: new THREE.Vector3(), object: null });
        return true;
      }
      if (this.ext.state === 'hand') {
        const n = this._bestStation();
        if (n && n.id === 'extinguisher' && !this._nearFire()) { this._hangExtinguisher(); return true; }
        this._startSpray();
        return true;
      }
      if (this._nearFire()) {
        lab.extinguish();
        this.avatar.beat = 0.35;
        const b = this.hz.burner; doc.yaw = Math.atan2(b.x - doc.x, b.z - doc.z);
        return true;
      }
      if (this._nearDroppedExt()) { this._pickUpDropped(); return true; }
      const n = this._bestStation();
      if (n) this._interact(n.id);
      return true;
    }
    if (code === 'KeyQ' || code === 'Escape') {
      if (!isDown) return true;
      if (hud && hud.pantryOpen) { hud.togglePantry(false); return true; }
      if (doc.state === 'working') { this._leaveStation(); return true; }
      if (this.ext.state === 'hand') { this._dropExtinguisher(true); return true; }
      return code === 'KeyQ';
    }
    return false;
  }

  jump() {
    if (!this.active || (this.roof && this.roof.ownsDoc) || this.lab.cookDown) return false;
    return this.doc.jump();
  }

  _bind() {
    const c = this.canvas;
    this._h = {
      down: (e) => this._pointerDown(e),
      move: (e) => this._pointerMove(e),
      up: (e) => this._pointerUp(e),
      wheel: (e) => { if (!this.active || !this.built) return; e.preventDefault(); if (this.roof && this.roof.wheel(e)) return; if (!this.cam.focus) this.cam.zoomBy(e.deltaY > 0 ? 1 : -1); },
      ctx: (e) => { if (this.active) e.preventDefault(); },
    };
    c.addEventListener('pointerdown', this._h.down);
    c.addEventListener('pointermove', this._h.move);
    c.addEventListener('pointerup', this._h.up);
    c.addEventListener('pointercancel', this._h.up);
    c.addEventListener('wheel', this._h.wheel, { passive: false });
    c.addEventListener('contextmenu', this._h.ctx);
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
  _pointerDown(e) {
    if (!this.active || !this.built || this.destroyed) return;
    if (this.roof && this.roof.pointerDown(e)) return;   // [roof hook] (sees right-clicks too)
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const doc = this.doc, lab = this.lab;
    if (lab.cookDown) return;
    if (this.hud && this.hud.boardOpen) return;
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    this.pointer.down = true; this.pointer.id = e.pointerId;
    if (doc.state === 'working' && this.presenter && doc.workStation === this.presenter.station) {
      const hit = this._presenterHit(e);
      try { this.presenter.p.pointerDown && this.presenter.p.pointerDown(hit); } catch (err) { console.warn('[van] presenter pointerDown', err); }
      e.preventDefault();
      return;
    }
    if (doc.state === 'working') this._leaveStation();
    const ray = this._setRay(e);
    const sh = ray.intersectObjects(this.it.parts.stationPicks, false)[0];
    const fh = ray.intersectObject(this.it.parts.floorPick, false)[0];
    // carrying the extinguisher: press on the fire (or right next to Doc) and hold to spray; elsewhere = walk
    if (this.ext.state === 'hand') {
      const fp = fh ? this.it.root.worldToLocal(fh.point.clone()) : null;
      const b = this.hz.burner;
      const atFire = lab.fire > 0 && ((sh && sh.object.userData.station === 'stove') || (fp && Math.hypot(fp.x - b.x, fp.z - b.z) < 0.9));
      const atDoc = fp && Math.hypot(fp.x - doc.x, fp.z - doc.z) < 0.55;
      if ((atFire && this._burnerDist() < 1.9) || atDoc) {
        if (fp && !atFire) doc.yaw = Math.atan2(fp.x - doc.x, fp.z - doc.z);
        this._startSpray();
        return;
      }
      if (atFire) { doc.walkTo(b.x - 0.75, b.z, null); return; }
    }
    // fire click: beat it if close
    if (lab.fire > 0 && this._nearFire() && sh && sh.object.userData.station === 'stove') { lab.extinguish(); this.avatar.beat = 0.35; return; }
    if (sh && (!fh || sh.distance <= fh.distance + 0.05)) {
      const id = sh.object.userData.station;
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
    if (this.roof && this.roof.pointerMove(e)) return;   // [roof hook]
    const doc = this.doc;
    if (doc.state === 'working' && this.presenter && doc.workStation === this.presenter.station) {
      const hit = this._presenterHit(e);
      try { this.presenter.p.pointerMove && this.presenter.p.pointerMove(hit); } catch (err) { /* ignore */ }
      this.canvas.style.cursor = this.presenter.p.cursor || (hit && hit.object ? 'pointer' : 'crosshair');
      return;
    }
    if (this.pointer.down) return;
    // hover cursor over stations
    const ray = this._setRay(e);
    const sh = ray.intersectObjects(this.it.parts.stationPicks, false)[0];
    this.canvas.style.cursor = sh ? 'pointer' : 'default';
  }
  _pointerUp(e) {
    if (this.active && this.built && this.roof && this.roof.pointerUp(e)) return;   // [roof hook]
    if (!this.pointer.down) return;
    this.pointer.down = false;
    try { this.canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    this._stopSpray();
    if (this.presenter && this.doc.state === 'working' && this.doc.workStation === this.presenter.station) {
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
    }
    if (this._labUnsub) this._labUnsub();
    if (!this.built) return;
    this._disposePresenter();
    if (this.roof) { try { this.roof.destroy(); } catch (e) { console.warn('[van] roof destroy', e); } this.roof = null; }   // [roof hook]
    if (this.active) { this.view.setCameraController && this.view.setCameraController(null); this.view.setVanMode && this.view.setVanMode(false); this._restoreNear(); }
    if (typeof this.lab.setPresenceMode === 'function') this.lab.setPresenceMode('any');
    try { this.cam?.cut?.destroy(); } catch (e) { /* best effort */ }
    this.hz.dispose();
    this.hud && this.hud.destroy();
    for (const [id, o] of Object.entries(this.idle)) { if (this.presenters?.disposeIdleProps) this.presenters.disposeIdleProps(o); else o.removeFromParent(); delete this.idle[id]; }
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
