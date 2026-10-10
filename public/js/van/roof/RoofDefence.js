// ─────────────────────────────────────────────────────────────────────────────
// RoofClient — the cook's roof defence mode inside VanLab3D (Agent ROOF).
//
//   VanLab3D creates it (dynamic import, guarded) once the interior is built:
//     this.roof = new RoofClient(vanLab, { createModel, spectate })
//   and forwards: roof.update(dt, snap) every frame · roof.onKey(e, down) · roof.pointerDown/Move/Up(e)
//   · roof.wheel(e) · roof.setActive(on) · roof.destroy(). While roof.ownsDoc is true VanLab3D skips
//   Doc's lab movement/stations (the lab hazards keep running underneath).
//
// Modes: 'off' (lab; during a stop the banner + pulsing hatch say "get on the roof [R]") → 'walk'
// (Doc walks to the hatch) → 'up' (lid flips open, ladder unfolds, Doc climbs; CMD.ROOF_ENTER sent;
// camera blends dollhouse → over-the-shoulder) → 'roof' (aim / spray / throw; CMD.ROOF_AIM @ 10 Hz,
// CMD.ROOF_THROW) → 'down' (reverse; CMD.ROOF_LEAVE when the player asked, nothing when the sim
// auto-climbs him down) → 'off'. 'ai': the solo AI Doc is up there (snap roof.ai) — drawn from the
// snapshot; R takes over. The sim is authoritative: snapshot roof.active/climbDir drive auto-down.
//
// Controls on the roof: mouse aims (free cursor = crosshair, screen edges pan; M toggles pointer
// lock = mouse-look with a centre crosshair); hold LMB / Space = hose; RMB click / E = throw the
// selected device at the ground under the crosshair; RMB drag = turn; 1/2/3 pick firecracker /
// paint balloon / smoke flare; A/D (←/→) turn, W/S pitch; wheel = camera distance; R or Q = climb
// down. Touch: tap/hold = spray at that point, drag = sweep, buttons for devices / THROW / DOWN / turn.
// Unity: a RoofDefenceClient MonoBehaviour on the lab prefab (same state machine), Input System
// actions for aim/spray/throw/select, a Cinemachine vcam (RoofCamera) and pooled FX (RoofFx).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { CMD, EV, KIND_ID } from '../../shared/protocol.js';
import { ROOF_GEOM, ROOF_ACTIVE_STATES, COP_KINDS, clampThrowTarget, throwFlightTime, hoseTest, worldToRv } from '../../sim/roof.js';
import { RoofScene, DEVICE_COLOR } from './roofScene.js';
import { RoofCamera, PITCH_MIN, PITCH_MAX } from './roofCamera.js';
import { RoofFx } from './roofFx.js';
import { RoofHud } from './RoofHud.js';

const G = ROOF_GEOM;
const ACTIVE = new Set(ROOF_ACTIVE_STATES);
const COP_IDS = new Set(COP_KINDS.map((k) => KIND_ID[k]).filter((v) => v != null));
const DEVICES = ['firecracker', 'balloon', 'flare'];
const AIM_DT = 0.1;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpAng = (a, b, t) => a + wrap(b - a) * t;
const SPOT = { x: G.hatch.x, z: G.hatch.z + 0.1 };      // where Doc stands at the foot of the ladder (in the aisle)
// dollhouse close-up on the ladder while Doc walks over and climbs (VanCamera.setFocus pose, hatch-anchor space)
// (above the cab end of the van looking back down at the ladder, so shop fronts / awnings beside the lot
// and the roof rack behind the hatch never get in the way)
const CLIMB_POSE = Object.freeze({ pos: { x: -1.2, y: 5.0, z: 3.6 }, target: { x: 0.05, y: 1.25, z: -0.35 }, fov: 56 });
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _ndc = new THREE.Vector2(), _ray = new THREE.Raycaster();

function rulesOf(r = {}) {
  return {
    climbSeconds: r.climbSeconds ?? 1.6,
    hose: { range: 15, coneDeg: 10, push: 5, soakSeconds: 2.5, ...(r.hose || {}) },
    firecracker: { ammo: 3, radius: 6, stallSeconds: 3, ...(r.firecracker || {}) },
    balloon: { ammo: 4, radius: 2.5, blindSeconds: 4, ...(r.balloon || {}) },
    flare: { usesSmokeCharge: true, radius: 9, seconds: 6, ...(r.flare || {}) },
  };
}

export class RoofClient {
  /**
   * @param {VanLab3D} van
   * @param {object} o  { createModel, spectate: bool (follow the solo AI defender with the roof camera) }
   */
  constructor(van, { createModel = null, spectate = false } = {}) {
    this.van = van; this.view = van.view; this.lab = van.lab;
    this.R = rulesOf(van.data?.rules?.roof);
    this.mode = 'off';
    this.u = 0;                    // climb progress 0 (inside) … 1 (standing on the roof)
    this.modeT = 0;
    this.time = 0;
    this.device = 'firecracker';
    this.spectate = !!spectate;
    this.snap = null; this.sr = null;
    this.input = { lmb: false, space: false, touch: false, touchUntil: 0, rmb: null, keys: new Set(), turn: 0, inside: false };
    this.cursor = null;            // { x, y } in canvas CSS px (free-cursor aim) or null = screen centre
    this.lock = false;
    this.aim = { yaw: Math.PI, pitch: -0.25, spray: false, hit: null, dist: 0, ground: new THREE.Vector3(), groundOk: false, hose: new THREE.Vector3() };
    this.docYaw = Math.PI; this.docPitch = -0.2;
    this.throwK = 0;
    this.sendT = 0; this.sentSpray = false; this.enterT = 0;
    this.pending = { firecracker: [], balloon: [], flare: [] };
    this.enteredStop = null;
    this.ammoView = { firecracker: 0, balloon: 0, flare: 0 };
    this.stats = { aimsSent: 0, throwsSent: 0, enters: 0, leaves: 0, hits: 0 };
    const FY = van.it?.dims?.FY ?? 0.72;
    this.scene = new RoofScene(this.view.rvAnchor, createModel, { floorY: FY, rules: this.R });
    this.climbAnchor = new THREE.Object3D(); this.climbAnchor.name = 'roof_climb_focus';
    this.climbAnchor.position.set(G.hatch.x, FY, G.hatch.z);
    this.scene.root.add(this.climbAnchor);
    this.cam = new RoofCamera(this.view, van.cam);
    this.fx = new RoofFx(this.view, createModel, this.R);
    this.hud = van.hudRoot ? new RoofHud(van.hudRoot, {
      onClimb: () => this.requestClimb(), onDevice: (d) => this.select(d), onThrow: () => this.throwNow(),
      onDown: () => this.requestDown(), onTurn: (dir, down) => { this.input.turn = down ? dir : 0; },
    }) : null;
    if (this.hud) this.hud.setVisible(van.active);
    try { if (this.hud && typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) this.hud.setTouch(true); } catch (e) { /* ignore */ }
    this._unEv = this.view.onEvent ? this.view.onEvent((ev) => this._onEvent(ev)) : null;
    this._lockH = () => { this.lock = document.pointerLockElement === van.canvas; if (!this.lock) this.cursor = this.cursor || null; };
    document.addEventListener('pointerlockchange', this._lockH);
    this._leaveH = () => { this.input.inside = false; };
    this._enterH = () => { this.input.inside = true; };
    van.canvas.addEventListener('pointerleave', this._leaveH);
    van.canvas.addEventListener('pointerenter', this._enterH);
  }

  get ownsDoc() { return this.mode === 'up' || this.mode === 'roof' || this.mode === 'down' || this.mode === 'ai'; }
  get onRoof() { return this.mode === 'roof' && this.u >= 1; }
  get state() { return { mode: this.mode, u: +this.u.toFixed(3), device: this.device, aim: { yaw: +this.aim.yaw.toFixed(3), pitch: +this.aim.pitch.toFixed(3), spray: this.aim.spray }, ammo: { ...this.ammoView }, fx: this.fx.count, lock: this.lock, stats: { ...this.stats } }; }

  // ── eligibility ────────────────────────────────────────────────────────────
  _stopOn(s = this.snap) { const st = s?.stop; return !!st && (ACTIVE.has(st.state) || (st.state == null && st.progress != null)); }
  canClimb() {
    const s = this.snap;
    if (!s || (s.phase && s.phase !== 'drive') || this.lab.cookDown) return false;
    if (this._stopOn(s)) return true;
    return Math.abs(s.rv?.speed ?? 99) < G.enterMaxSpeed;
  }

  // ── actions ────────────────────────────────────────────────────────────────
  send(cmd) { try { this.van.sendCommand && this.van.sendCommand(cmd); } catch (e) { console.warn('[roof] send failed', e); } }
  select(dev) { if (DEVICES.includes(dev)) this.device = dev; }
  requestClimb() {
    if (this.mode === 'ai') { this._takeOver(); return true; }
    if (this.mode !== 'off') return false;
    if (!this.canClimb()) { this._toast(this.lab.cookDown ? 'Doc is out cold!' : 'Doc only goes up when the RV is parked', 'info'); return false; }
    const van = this.van, doc = van.doc;
    if (doc.state === 'working') van._leaveStation();
    if (van.ext && van.ext.state === 'hand') van._hangExtinguisher();
    if (van.hud) { van.hud.closeBoard(); van.hud.togglePantry(false); }
    if (Math.hypot(doc.x - SPOT.x, doc.z - SPOT.z) < 0.15) this._startUp();
    else { doc.walkTo(SPOT.x, SPOT.z, null); this._setMode('walk'); }
    this._climbFocus(true);
    return true;
  }
  requestDown() {
    if (this.mode === 'roof' || this.mode === 'up') { this.send({ type: CMD.ROOF_LEAVE }); this.stats.leaves++; this._startDown(); return true; }
    return false;
  }
  throwNow() {
    if (!this.onRoof) return false;
    const dev = this.device;
    if ((this.ammoView[dev] | 0) <= 0) {
      this._toast(dev === 'flare' ? 'No smoke bombs for a flare — cook one!' : dev === 'firecracker' ? 'Out of firecrackers!' : 'Out of paint balloons!', 'bad');
      return false;
    }
    const rv = this._rvWorld();
    if (!rv || !this.aim.groundOk) return false;
    const tgt = clampThrowTarget(rv, this.aim.ground.x, this.aim.ground.z);
    this.send({ type: CMD.ROOF_THROW, device: dev, x: +tgt.x.toFixed(2), z: +tgt.z.toFixed(2) });
    this.stats.throwsSent++;
    this.pending[dev].push({ t: this.time, base: this.sr?.ammo?.[dev] ?? 0 });
    this.fx.launch(dev, this._handWorld(_v), tgt, throwFlightTime(tgt.dist));
    this.throwK = 0.0001; this.cam.kick = 1;
    return true;
  }
  /** Debug/test: aim at a world point (x, y, z) — turns the camera so the centre crosshair sits on it. */
  aimAtWorld(x, z, y = G.copAimY) {
    const a = this.view.rvAnchor;
    if (!a) return;
    a.updateWorldMatrix(true, false);
    const l = a.worldToLocal(new THREE.Vector3(x, y, z));
    this.cursor = null;
    const eye = new THREE.Vector3(), tg = new THREE.Vector3();
    for (let i = 0; i < 6; i++) {          // the eye moves with yaw/pitch → fixed-point iterate
      this.cam.localPose(eye, tg);
      const dx = l.x - eye.x, dy = l.y - eye.y, dz = l.z - eye.z;
      this.cam.setAim(Math.atan2(dx, dz), Math.atan2(dy, Math.hypot(dx, dz)));
    }
  }

  _setMode(m) { this.mode = m; this.modeT = 0; if (m === 'off') this._climbFocus(false); }
  _climbFocus(on) {
    const vc = this.van.cam;
    if (!vc || !vc.setFocus) return;
    if (on) vc.setFocus(this.climbAnchor, CLIMB_POSE);
    else if (vc.focus && vc.focus.anchor === this.climbAnchor) vc.setFocus(null);
  }
  _toast(text, tone) { try { this.van.hud && this.van.hud.toast(text, tone); } catch (e) { /* ignore */ } }
  _engageView(on) {
    const van = this.van;
    van.hud && van.hud.el && van.hud.el.classList.toggle('vh-roofmode', !!on);
    if (on && typeof this.lab.setPresence === 'function') this.lab.setPresence(null);
  }
  _startUp(fromU = 0) {
    this._setMode('up');
    this.u = fromU;
    this.enterT = 0;
    this.send({ type: CMD.ROOF_ENTER }); this.stats.enters++;
    this.enteredStop = this._stopOn() ? this.snap.stop.id ?? true : null;
    this._faceThreat();
    this._climbFocus(true);
    this.cam.setK(this._camK(fromU));
    if (this.van.active) this.view.setCameraController(this.cam);
    this.scene.setGear(true);
    this._engageView(true);
  }
  _startDown() {
    this._setMode('down');
    this.input.lmb = this.input.space = this.input.touch = false; this.input.rmb = null; this.aim.spray = false;
    this._climbFocus(true);
    this.cam.setK(this._camK(this.u));
    if (this.lock) { try { document.exitPointerLock(); } catch (e) { /* ignore */ } }
  }
  _finishDown() {
    const van = this.van, doc = van.doc;
    this._setMode('off');
    this.u = 0;
    this.scene.setGear(false);
    this.scene.doc.visible = false;
    this.scene.setLid(0); this.scene.setLadder(0);
    this.scene.updateStream(1, false, _v.set(0, 0, 0), _v2.set(0, 0, 0), this.time);
    if (van.avatar) van.avatar.model.visible = true;
    if (doc) { doc.cancelPath(); doc.x = SPOT.x; doc.z = SPOT.z; doc.yaw = Math.PI; doc.vx = doc.vz = 0; if (doc.state !== 'down') doc.state = 'idle'; }
    if (van.active) { this.view.setCameraController(van.cam); }
    this._climbFocus(false);
    this._engageView(false);
  }
  _takeOver() {
    const sr = this.sr;
    this.send({ type: CMD.ROOF_ENTER }); this.stats.enters++;
    this._sendAim(true);
    if (sr && sr.onRoof) {
      this._setMode('roof'); this.u = 1; this.enterT = 0;
      this.enteredStop = this._stopOn() ? this.snap.stop.id ?? true : null;
      this.cam.setAim(sr.aimYaw ?? Math.PI, clamp(sr.aimPitch ?? -0.25, PITCH_MIN, PITCH_MAX));
      if (this.cam.k < 0.999) this.cam.blendIn(0.6);
      if (this.van.active) this.view.setCameraController(this.cam);
      this.scene.setGear(true); this._engageView(true);
    } else this._startUp(sr ? clamp(sr.climb ?? 0, 0, 0.95) : 0);
  }
  _faceThreat() {
    // start looking at the nearest cop (or back down the road)
    const s = this.snap, rv = s?.rv;
    let yaw = Math.PI;
    if (rv) {
      let bd = 80;
      for (const e of s.ents || []) {
        if (!COP_IDS.has(e[1])) continue;
        const d = Math.hypot(e[2] - rv.x, e[4] - rv.z);
        if (d < bd) { bd = d; const l = worldToRv(rv, e[2], e[4]); yaw = Math.atan2(l.x - G.nozzle.x, l.z - G.nozzle.z); }
      }
    }
    this.cam.setAim(yaw, -0.25);
    this.docYaw = yaw;
  }

  // ── per frame ──────────────────────────────────────────────────────────────
  update(dt, snap) {
    dt = clamp(dt || 0, 0, 0.1);
    this.time += dt; this.modeT += dt; this.enterT += dt;
    if (snap) this.snap = snap;
    const s = this.snap || {};
    const sr = this.sr = s.roof || s.stop?.roof || null;
    const van = this.van, active = van.active;
    this.scene.root.visible = active;
    if (this.hud) this.hud.setVisible(active);
    this._updateAmmo(sr);
    if (!active) { this.fx.update(dt); return; }
    const simUp = !!sr?.active;
    // reconcile with the sim
    if (this.mode === 'off' && simUp && this.modeT > 0.3) {
      if (sr.ai) this._setMode('ai');
      else this._takeOver();          // we lost local state (re-activated) → resume
    }
    if (this.mode === 'ai' && !simUp) this._finishDown();
    if (this.mode === 'ai' && simUp && !sr.ai && this.modeT > 1.0) this._takeOver();
    if (this.mode === 'roof' || this.mode === 'up') {
      // snap.stop.roof only exists during a stop: without one, mirror the sim's auto-down rules locally
      const stopNow = this._stopOn(s) ? s.stop.id ?? true : null;
      if (sr && this.enterT > 1.5 && !simUp) { this._toast('Can\'t get on the roof now', 'info'); this._startDown(); }
      else if (this.mode === 'roof' && sr && sr.climbDir === 'down') this._startDown();
      else if (Math.abs(s.rv?.speed ?? 0) > G.autoDownSpeed || (s.phase && s.phase !== 'drive')) this._startDown();
      else if (this.enteredStop != null && stopNow !== this.enteredStop && this.enterT > 0.5) this._startDown();
    }
    if (this.mode !== 'off' && this.mode !== 'walk' && this.lab.cookDown && this.mode !== 'down') { this.send({ type: CMD.ROOF_LEAVE }); this._startDown(); }

    switch (this.mode) {
      case 'off': this._updateOff(dt, s); break;
      case 'walk': this._updateWalk(dt); break;
      case 'up':
        this.u = Math.min(1, this.u + dt / this.R.climbSeconds);
        this._pose(dt, this.u);
        if (this.u >= 1) this._setMode('roof');
        break;
      case 'roof': this._updateRoof(dt, s); break;
      case 'down':
        this.u = Math.max(0, this.u - dt / this.R.climbSeconds);
        this._pose(dt, this.u);
        if (this.u <= 0) this._finishDown();
        break;
      case 'ai': this._updateAi(dt, s, sr); break;
      default: break;
    }
    if (this.mode !== 'roof') { this.scene.setPreview(false); if (this.mode !== 'ai') this.scene.updateStream(dt, false, _v, _v2, this.time); }
    this.fx.sync(sr?.fx, this._handWorld(_v2));
    this.fx.update(dt);
    this._updateHud(s, sr);
  }

  _updateOff(dt, s) {
    const at = this._stopOn(s) && !this.lab.cookDown;
    this.scene.setHighlight(at, this.time);
    this.scene.setLid(0); this.scene.setLadder(0);
    if (this.hud) {
      const st = s.stop?.state;
      const text = st === 'returning' ? 'Rook\'s coming back — cover him from the roof!' : st === 'loading' ? 'Loading — keep the lot clear from the roof!' : 'Rook\'s in the shop — get on the roof!';
      this.hud.banner(at, text, at ? (s.stop?.name || '') : '');
      this.hud.showRoof(false);
    }
  }
  _updateWalk() {
    const doc = this.van.doc;
    this.scene.setHighlight(true, this.time);
    if (this.hud) this.hud.banner(false);
    const d = Math.hypot(doc.x - SPOT.x, doc.z - SPOT.z);
    if (d < 0.12 && !doc.path.length) { this._startUp(); return; }
    if ((!doc.path.length && d > 0.12 && this.modeT > 0.2) || this.modeT > 6 || !this.canClimb()) this._setMode('off');
  }

  /** Camera weight of the roof pose for climb progress u: the dollhouse close-up shows the climb, then it swoops up. */
  _camK(u) { return smooth((u - 0.42) / 0.58); }
  /** Climb pose: u 0 = at the foot of the ladder, 1 = standing at the stance. */
  _pose(dt, u) {
    const sc = this.scene, van = this.van, av = van.avatar, FY = van.it.dims.FY;
    if (this.mode === 'up' || this.mode === 'down' || (this.mode === 'ai' && this.spectate)) this.cam.setK(this._camK(u));
    sc.setHighlight(false, this.time);
    sc.setLid(smooth(u / 0.15)); sc.setLadder(smooth(u / 0.12));
    sc.setGear(u > 0.5);                 // the roof rack would hide the ladder in the close-up
    if (u < 0.74) {
      sc.doc.visible = false;
      if (av) {
        const m = av.model, j = av.j, c = smooth((u - 0.08) / 0.66), ph = c * 10;
        m.visible = true;
        m.position.set(SPOT.x, FY + c * (G.roofY - 0.3 - FY), SPOT.z);
        m.rotation.set(0.08, Math.PI, 0);
        j.al.rotation.set(-2.6 + 0.35 * Math.sin(ph), 0, 0.1); j.ar.rotation.set(-2.6 - 0.35 * Math.sin(ph), 0, -0.1);
        j.ll.rotation.set(-0.45 + 0.45 * Math.sin(ph), 0, 0.04); j.lr.rotation.set(-0.45 - 0.45 * Math.sin(ph), 0, -0.04);
        j.body.rotation.set(0.1, 0, 0); j.head.rotation.set(-0.35, 0, 0);
      }
    } else {
      if (av) av.model.visible = false;
      const k = smooth((u - 0.74) / 0.26);
      const yaw = lerpAng(Math.PI, this.cam.yaw, k);
      this.docYaw = yaw;
      sc.poseDoc({ x: SPOT.x + (G.stance.x - SPOT.x) * k, y: G.roofY - 0.3 * (1 - smooth(k * 1.6)), z: SPOT.z + (G.stance.z - SPOT.z) * k,
        yaw, pitch: -0.15, crouch: 1 - k, t: this.time });
    }
  }

  _updateRoof(dt, s) {
    const cam = this.cam, I = this.input, K = I.keys, sc = this.scene;
    this.u = 1;
    sc.setHighlight(false, this.time); sc.setLid(1); sc.setLadder(1); sc.setGear(true);
    if (this.van.avatar) this.van.avatar.model.visible = false;
    // turning: keys, touch buttons, free-cursor screen edges
    const kt = (K.has('KeyA') || K.has('ArrowLeft') ? 1 : 0) - (K.has('KeyD') || K.has('ArrowRight') ? 1 : 0) + I.turn;
    const kp = (K.has('KeyW') || K.has('ArrowUp') ? 1 : 0) - (K.has('KeyS') || K.has('ArrowDown') ? 1 : 0);
    let yaw = cam.yaw + kt * 1.9 * dt, pitch = cam.pitch + kp * 1.1 * dt;
    if (!this.lock && this.cursor && I.inside && !I.rmb) {
      const n = this._cursorNdc(_ndc);
      if (Math.abs(n.x) > 0.62) yaw -= Math.sign(n.x) * ((Math.abs(n.x) - 0.62) / 0.38) * 1.6 * dt;
      if (n.y > 0.8) pitch += ((n.y - 0.8) / 0.2) * 0.8 * dt;
      if (n.y < -0.85) pitch -= ((-n.y - 0.85) / 0.15) * 0.8 * dt;
    }
    cam.setAim(wrap(yaw), pitch);
    if (this.view.cameraController === cam) cam.update(0, this.view.camera, s);   // pose the camera now so the crosshair ray isn't a frame late
    this._computeAim(s);
    // Doc follows the aim
    const k = Math.min(1, dt * 14);
    this.docYaw = lerpAng(this.docYaw, this.aim.yaw, k);
    this.docPitch += (this.aim.pitch - this.docPitch) * k;
    if (this.throwK > 0) { this.throwK += dt / 0.45; if (this.throwK >= 1) this.throwK = 0; }
    const spray = this.aim.spray = I.lmb || I.space || I.touch || this.time < I.touchUntil;
    this.scene.poseDoc({ yaw: this.docYaw, pitch: this.docPitch, spray, throwK: this.throwK, t: this.time });
    // stream + splash
    const a = this.scene.nozzleLocal(_o);
    const b = this._streamEnd(_d);
    this.scene.updateStream(dt, spray, a, b, this.time);
    if (spray) { const w = this.view.rvAnchor.localToWorld(_v.copy(b)); this.fx.splash(w.x, w.y, w.z, dt, !!this.aim.hit); }
    // preview
    const dev = this.device;
    const tgt = this._previewTarget();
    if (tgt) this.scene.setPreview(true, _v2.set(G.hand.x, G.hand.y - 0.2, G.hand.z), tgt, this.R[dev]?.radius ?? 2, (this.ammoView[dev] | 0) > 0 ? DEVICE_COLOR[dev] : '#8a8f93', this.time);
    else this.scene.setPreview(false);
    // network
    this.sendT -= dt;
    if (this.sendT <= 0 || spray !== this.sentSpray) this._sendAim(false);
  }
  _sendAim(force) {
    this.sendT = AIM_DT;
    this.sentSpray = this.aim.spray;
    this.send({ type: CMD.ROOF_AIM, yaw: +this.aim.yaw.toFixed(3), pitch: +this.aim.pitch.toFixed(3), spray: !!this.aim.spray });
    this.stats.aimsSent++;
    void force;
  }

  _updateAi(dt, s, sr) {
    const u = clamp(sr.climb ?? 1, 0, 1);
    this.u = u;
    const yaw = sr.aimYaw ?? Math.PI, pitch = sr.aimPitch ?? -0.2;
    if (this.spectate) {
      this.cam.setAim(lerpAng(this.cam.yaw, yaw, Math.min(1, dt * 4)), clamp(this.cam.pitch + (clamp(pitch + 0.04, PITCH_MIN, PITCH_MAX) - this.cam.pitch) * Math.min(1, dt * 4), PITCH_MIN, PITCH_MAX));
      this.cam.setK(this._camK(u));
      if (this.view.cameraController !== this.cam) this.view.setCameraController(this.cam);
    } else {
      this.cam.setAim(yaw, clamp(pitch, PITCH_MIN, PITCH_MAX));
      if (this.view.cameraController !== this.van.cam) this.view.setCameraController(this.van.cam);
    }
    this._engageView(this.spectate);
    if (u < 1 || sr.climbing) { this._pose(dt, u); this.scene.updateStream(dt, false, _v, _v2, this.time); return; }
    this.scene.setGear(true); this.scene.setLid(1); this.scene.setLadder(1);
    if (this.van.avatar) this.van.avatar.model.visible = false;
    const k = Math.min(1, dt * 10);
    this.docYaw = lerpAng(this.docYaw, yaw, k); this.docPitch += (pitch - this.docPitch) * k;
    this.aim.yaw = yaw; this.aim.pitch = pitch; this.aim.spray = !!sr.spray;
    this.scene.poseDoc({ yaw: this.docYaw, pitch: this.docPitch, spray: !!sr.spray, t: this.time });
    // stream along the AI's aim: end where it meets the ground (or the cop it hits)
    this._aimFromAngles(s, yaw, pitch);
    const a = this.scene.nozzleLocal(_o), b = this._streamEnd(_d);
    this.scene.updateStream(dt, !!sr.spray, a, b, this.time);
    if (sr.spray) { const w = this.view.rvAnchor.localToWorld(_v.copy(b)); this.fx.splash(w.x, w.y, w.z, dt, !!this.aim.hit); }
  }

  // ── aim maths ──────────────────────────────────────────────────────────────
  _cursorNdc(out) {
    const r = this.van.canvas.getBoundingClientRect();
    if (!this.cursor || this.lock) return out.set(0, 0);
    return out.set((this.cursor.x / r.width) * 2 - 1, -(this.cursor.y / r.height) * 2 + 1);
  }
  _rvWorld() { const rv = this.view.cur?.rv || this.snap?.rv; return rv || null; }
  _handWorld(out) {
    const a = this.view.rvAnchor;
    if (!a) return out.set(0, 4.5, 0);
    a.updateWorldMatrix(true, false);
    const f = Math.sin(this.docYaw), c = Math.cos(this.docYaw);
    return a.localToWorld(out.set(G.hand.x + f * 0.3, G.hand.y - 0.1, G.hand.z + c * 0.3));
  }
  /** Ray through the crosshair → hose aim (plane y = copAimY) + ground point (y = 0), all RV-local; sets aim.yaw/pitch. */
  _computeAim(s) {
    const view = this.view, cam = view.camera, anchor = view.rvAnchor;
    anchor.updateWorldMatrix(true, false);
    cam.updateMatrixWorld();
    _ray.setFromCamera(this._cursorNdc(_ndc), cam);
    const o = anchor.worldToLocal(_o.copy(_ray.ray.origin));
    const d = anchor.worldToLocal(_d.copy(_ray.ray.origin).add(_ray.ray.direction)).sub(o).normalize();
    const hit = (y) => (d.y < -1e-4 ? (y - o.y) / d.y : -1);
    let th = hit(G.copAimY);
    const P = this.aim.hose;
    if (th > 0 && th < 120) P.copy(o).addScaledVector(d, th); else P.copy(o).addScaledVector(d, 40);
    const tg = hit(0);
    this.aim.groundOk = true;
    const gl = _v.copy(o).addScaledVector(d, tg > 0 && tg < 200 ? tg : 30);
    if (!(tg > 0 && tg < 200)) gl.y = 0;
    this.aim.groundLocal = this.aim.groundLocal || new THREE.Vector3();
    this.aim.groundLocal.copy(gl);
    this.aim.ground.copy(anchor.localToWorld(_v2.copy(gl)));
    const dx = P.x - G.nozzle.x, dy = P.y - G.nozzle.y, dz = P.z - G.nozzle.z;
    this.aim.yaw = Math.atan2(dx, dz);
    this.aim.pitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -1.3, 0.7);
    this.aim.dist = Math.hypot(gl.x - G.nozzle.x, gl.z - G.nozzle.z);
    this._hitTest(s);
  }
  /** AI / spectate: aim from yaw/pitch angles (no ray). */
  _aimFromAngles(s, yaw, pitch) {
    const cp = Math.cos(pitch), dx = Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = Math.cos(yaw) * cp;
    const t = dy < -1e-3 ? (0 - G.nozzle.y) / dy : 30;
    this.aim.groundLocal = this.aim.groundLocal || new THREE.Vector3();
    this.aim.groundLocal.set(G.nozzle.x + dx * t, 0, G.nozzle.z + dz * t);
    this.aim.dist = Math.hypot(dx * t, dz * t);
    this.aim.yaw = yaw; this.aim.pitch = pitch;
    this._hitTest(s);
  }
  /** Client-side hose test against the snapshot cops (visual only: stream end + crosshair). */
  _hitTest(s) {
    const rv = this._rvWorld();
    this.aim.hit = null;
    if (!rv) return;
    let best = null;
    for (const e of (this.view.cur?.ents || s.ents || [])) {
      if (!COP_IDS.has(e[1])) continue;
      const r = hoseTest(rv, this.aim.yaw, this.aim.pitch, { x: e[2], z: e[4], y: e[3] }, this.R.hose);
      if (r.hit && (!best || r.dist < best.dist)) best = { id: e[0], x: e[2], y: e[3], z: e[4], dist: r.dist };
    }
    this.aim.hit = best;
  }
  _streamEnd(out) {
    const range = this.R.hose.range, A = this.aim;
    if (A.hit) {
      const a = this.view.rvAnchor;
      return a.worldToLocal(out.set(A.hit.x, (A.hit.y || 0) + G.copAimY, A.hit.z));
    }
    const g = A.groundLocal || out.set(G.nozzle.x, 0, G.nozzle.z - 10);
    const dx = g.x - G.nozzle.x, dz = g.z - G.nozzle.z, dh = Math.hypot(dx, dz) || 1;
    const k = Math.min(dh, range) / dh;
    return out.set(G.nozzle.x + dx * k, 0.05, G.nozzle.z + dz * k);
  }
  _previewTarget() {
    if (!this.aim.groundLocal) return null;
    const g = this.aim.groundLocal;
    let dx = g.x, dz = g.z, d = Math.hypot(dx, dz);
    if (d < 1e-3) { dx = 0; dz = -1; d = 1; }
    const k = clamp(d, G.throwMin, G.throwMax) / d;
    return { x: dx * k, y: 0, z: dz * k };
  }

  _updateAmmo(sr) {
    const a = sr?.ammo || {};
    for (const d of DEVICES) {
      const n = a[d] ?? 0;
      this.pending[d] = this.pending[d].filter((p) => this.time - p.t < 1.5 && n >= p.base);
      this.ammoView[d] = Math.max(0, n - this.pending[d].length);
    }
  }

  // ── HUD ────────────────────────────────────────────────────────────────────
  _updateHud(s, sr) {
    const hud = this.hud;
    if (!hud) return;
    const showRoof = this.mode === 'roof' || this.mode === 'up' || (this.mode === 'ai' && this.spectate);
    hud.showRoof(showRoof);
    if (this.mode !== 'off') hud.banner(false);
    if (!showRoof) return;
    const r = this.van.canvas.getBoundingClientRect();
    const W = r.width || 1, H = r.height || 1;
    const cross = this.lock || !this.cursor || this.mode !== 'roof' ? { x: W / 2, y: H / 2 } : { x: this.cursor.x, y: this.cursor.y };
    const far = !this.aim.hit && this.aim.dist > this.R.hose.range;
    cross.spray = this.aim.spray; cross.hit = !!this.aim.hit; cross.far = far;
    cross.label = this.mode !== 'roof' ? '' : this.aim.hit ? `${Math.round(this.aim.hit.dist)} m · ON TARGET` : `${Math.round(this.aim.dist)} m${far ? ' · out of hose range' : ''}`;
    // stop status
    const st = s.stop;
    let status;
    const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    if (!st) status = { text: 'RV stopped — hold them off', sub: 'R: climb down' };
    else if (st.state === 'parked' || st.state === 'shopping') status = { text: 'Rook is in the shop', sub: `${st.name || ''}${st.shopT != null ? ' · ' + mmss(st.shopT) : ''} · keep the cops off the RV` };
    else if (st.state === 'returning') status = { text: 'Rook is running back!', sub: 'cover him' };
    else if (st.state === 'loading' || st.state == null) status = { text: `Loading supplies ${Math.round((st.progress || 0) * 100)}%`, progress: st.progress || 0, blocked: !!st.blocked, sub: st.blocked ? 'BLOCKED — cops inside 25 m!' : 'keep the lot clear' };
    else status = { text: 'Loaded!', sub: 'climbing down…', progress: 1 };
    // cop markers
    const cops = [];
    const rv = this._rvWorld(), camera = this.view.camera;
    if (rv) {
      const list = [];
      for (const e of (this.view.cur?.ents || s.ents || [])) {
        if (!COP_IDS.has(e[1]) || e[7] === 4) continue;
        const d = Math.hypot(e[2] - rv.x, e[4] - rv.z);
        if (d < 75) list.push({ e, d });
      }
      list.sort((a, b) => a.d - b.d);
      for (const { e, d } of list.slice(0, 8)) {
        _v.set(e[2], (e[3] || 0) + 1.9, e[4]).project(camera);
        const behind = _v.z > 1;
        let x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
        const on = !behind && x > 30 && x < W - 30 && y > 60 && y < H - 70;
        let angle = 0;
        if (!on) {
          let dx = x - W / 2, dy = y - H / 2;
          if (behind) { dx = -dx; dy = -dy; if (Math.abs(dy) < 1) dy = H; }
          angle = Math.atan2(dy, dx) + Math.PI / 2;
          const m = Math.max(Math.abs(dx) / (W / 2 - 48), Math.abs(dy) / (H / 2 - 72)) || 1;
          x = W / 2 + dx / m; y = H / 2 + dy / m;
        }
        cops.push({ x, y, on, dist: d, state: e[7], angle });
      }
    }
    hud.update({ cross, device: this.device, ammo: this.ammoView, spray: this.aim.spray, status, cops, ai: this.mode === 'ai' });
    void sr;
  }
  _onEvent(ev) {
    if (!ev || !this.van.active) return;
    if (ev.type === EV.ROOF_HIT) {
      this.stats.hits++;
      const y = this.view.track?.surfaceY?.(ev.z) ?? 0;
      if (ev.device === 'hose') this.fx.burst(ev.x, y, ev.z, '#cdeefe', 10);
      if (this.hud && (this.mode === 'roof' || this.mode === 'ai')) {
        _v.set(ev.x, y + 2.4, ev.z).project(this.view.camera);
        if (_v.z < 1) {
          const r = this.van.canvas.getBoundingClientRect();
          this.hud.pop(ev.device, (_v.x * 0.5 + 0.5) * r.width, (-_v.y * 0.5 + 0.5) * r.height);
        }
      }
    }
  }

  // ── input (forwarded by VanLab3D) ──────────────────────────────────────────
  onKey(e, down) {
    const code = e.code;
    if (this.mode === 'off' || this.mode === 'walk') {
      if (code !== 'KeyR') return false;
      if (down && !e.repeat) { if (this.mode === 'walk') this._setMode('off'); else this.requestClimb(); }
      return true;
    }
    if (code === 'Tab' || code === 'Escape' || /^F\d+$/.test(code)) return false;
    if (this.mode === 'ai') {
      if (code === 'KeyR' && down && !e.repeat) this._takeOver();
      return true;
    }
    if (!down) {
      this.input.keys.delete(code);
      if (code === 'Space') this.input.space = false;
      return true;
    }
    if (e.repeat) return true;
    switch (code) {
      case 'KeyR': case 'KeyQ': if (this.mode === 'down') { if (this.canClimb()) this._startUp(this.u); } else this.requestDown(); break;
      case 'Digit1': case 'Numpad1': this.select('firecracker'); break;
      case 'Digit2': case 'Numpad2': this.select('balloon'); break;
      case 'Digit3': case 'Numpad3': this.select('flare'); break;
      case 'KeyE': this.throwNow(); break;
      case 'Space': this.input.space = true; break;
      case 'KeyM': this._toggleLock(); break;
      default: this.input.keys.add(code); break;
    }
    return true;
  }
  _toggleLock() {
    const c = this.van.canvas;
    if (this.lock) { try { document.exitPointerLock(); } catch (e) { /* ignore */ } return; }
    try { const p = c.requestPointerLock && c.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not available */ }
  }
  _pos(e) { const r = this.van.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  _hitHatch(e) {
    const r = this.van.canvas.getBoundingClientRect();
    _ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.view.camera.updateMatrixWorld();
    _ray.setFromCamera(_ndc, this.view.camera);
    return _ray.intersectObjects([this.scene.hatch, this.scene.ring, this.scene.arrow, this.scene.glow], true).length > 0;
  }
  pointerDown(e) {
    if (this.mode === 'off') {
      if ((e.button === 0 || e.pointerType !== 'mouse') && this.canClimb() && this._hitHatch(e)) { this.requestClimb(); return true; }
      return false;
    }
    if (this.mode === 'walk') return false;
    if (this.mode !== 'roof') return true;
    this.input.inside = true;
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      if (this.hud) this.hud.setTouch(true);
      this.cursor = this._pos(e); this.input.touch = true;
      try { this.van.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      e.preventDefault && e.preventDefault();
      return true;
    }
    if (!this.lock) this.cursor = this._pos(e);
    if (e.button === 0) { this.input.lmb = true; try { this.van.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
    else if (e.button === 2) this.input.rmb = { x: e.clientX, y: e.clientY, moved: 0 };
    return true;
  }
  pointerMove(e) {
    if (this.mode === 'off') {
      if (this.canClimb() && this._stopOn() && this._hitHatch(e)) { this.van.canvas.style.cursor = 'pointer'; return true; }
      return false;
    }
    if (this.mode === 'walk') return false;
    if (this.mode !== 'roof') return true;
    this.input.inside = true;
    this.van.canvas.style.cursor = this.lock ? 'none' : 'none';
    if (this.lock) {
      this.cam.setAim(this.cam.yaw - (e.movementX || 0) * 0.0026, this.cam.pitch - (e.movementY || 0) * 0.0026);
      return true;
    }
    const p = this._pos(e);
    if (this.input.rmb) {
      const dx = e.clientX - this.input.rmb.x, dy = e.clientY - this.input.rmb.y;
      this.input.rmb.moved += Math.abs(dx) + Math.abs(dy);
      this.input.rmb.x = e.clientX; this.input.rmb.y = e.clientY;
      if (this.input.rmb.moved > 6) { this.cam.setAim(this.cam.yaw - dx * 0.005, this.cam.pitch - dy * 0.004); return true; }
    }
    this.cursor = p;
    return true;
  }
  pointerUp(e) {
    if (this.mode === 'off' || this.mode === 'walk') return false;
    if (this.mode !== 'roof') return true;
    if (e.pointerType === 'touch' || e.pointerType === 'pen') { this.input.touch = false; this.input.touchUntil = this.time + 0.35; return true; }
    if (e.button === 0) this.input.lmb = false;
    if (e.button === 2 && this.input.rmb) { const m = this.input.rmb.moved; this.input.rmb = null; if (m <= 6) this.throwNow(); }
    try { this.van.canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    return true;
  }
  wheel(e) {
    if (this.mode !== 'roof') return this.ownsDoc;
    this.cam.dist = clamp(this.cam.dist + (e.deltaY > 0 ? 0.4 : -0.4), 2.2, 5.2);
    return true;
  }

  setActive(on) {
    if (on) {
      if (this.hud) this.hud.setVisible(true);
      if (this.mode === 'up' || this.mode === 'roof' || this.mode === 'down' || (this.mode === 'ai' && this.spectate)) this.view.setCameraController(this.cam);
      return;
    }
    if (this.hud) this.hud.setVisible(false);
    if (this.lock) { try { document.exitPointerLock(); } catch (e) { /* ignore */ } }
    this.input.lmb = this.input.space = this.input.touch = false; this.input.keys.clear(); this.input.rmb = null;
    if (this.mode !== 'off') {
      // leave the sim's Doc where he is (solo: the AI takes over after 1.5 s); reset our visuals
      const wasUp = this.mode === 'roof' || this.mode === 'up';
      this._finishDown();
      if (wasUp) this.modeT = -1;      // don't instantly "resume" on re-activation flicker
    }
    this.scene.root.visible = false;
  }
  destroy() {
    if (this._unEv) this._unEv();
    document.removeEventListener('pointerlockchange', this._lockH);
    this.van.canvas.removeEventListener('pointerleave', this._leaveH);
    this.van.canvas.removeEventListener('pointerenter', this._enterH);
    if (this.view.cameraController === this.cam) this.view.setCameraController(null);
    this.fx.dispose();
    this.scene.dispose();
    this.hud && this.hud.destroy();
    this._engageView(false);
  }
}

export default RoofClient;
