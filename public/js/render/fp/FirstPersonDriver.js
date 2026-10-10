// ─────────────────────────────────────────────────────────────────────────────
// FirstPersonDriver — Rook's first-person cab view (driver role / solo driving).
//
//   const fp = new FirstPersonDriver(view, data, { hudRoot, audio });   // audio optional
//   fp.setActive(true)                 // wanted on; it takes the camera when nobody else holds it
//   fp.update(dt, snap, input?)        // every frame BEFORE view.render(dt); input = DriverInput (optional)
//   fp.onPointer(e)                    // mousemove (pointer-lock deltas or screen position)
//   fp.lookAround() → bool             // C key: 3 s outside orbit; false while on cooldown / inactive
//   fp.cooldown                        // 0 = ready … 1 = just used (→ hud.setLookCooldown(fp.cooldown))
//   fp.driveState                      // { rpm, gear, throttle, load, running } (→ audio.setDriveState)
//   fp.destroy()
//
// What it does
//   • createModel('rv_cab_fp') under view.rvAnchor at userData.rvOffset (its rv_frame = RV-local).
//   • Camera controller (view.setCameraController) at userData.eye; the baked RV body (layer 1) is
//     hidden from the main camera, its shadow stays (the sun's shadow camera keeps layer 1).
//   • Head look ±70° yaw / ±20° pitch (damped, eases back after 1.5 s idle); pointer lock on a
//     canvas click (option), else the mouse position relative to the screen centre.
//   • Bob/sway from snap.feel + rv.pitch/roll, shakes on crashes/landings, nitro FOV kick.
//   • Gauges: speed (0–100 mph), rpm from a simulated 3-speed automatic (gearbox.js, shared with the
//     audio), temperature climbing when the hull is low / the lab is on fire, fuel draining along the
//     route, odometer, PRNDL and warning lamps (cabInterior.js). Wheel follows rv.steer with a kick on
//     bumps. Wipers sweep on fx.fog > 0.1 or in the dust storm.
//   • Cab dressing + worn materials + a new 3-spoke wheel (cabInterior.js / cabMaterials.js) and
//     Rook's IK arms whose hands grip the rim, shuffle at full lock, hit the horn and reach for the
//     column shifter (cabArms.js).
//   • Live mirrors (mirrors.js) through view.addPreRender at ~20 Hz round-robin.
//   • Windscreen: on-glass condensation (windscreen.js) wiped by the blades; DOM overlay (overlay.js)
//     for vignette, flash white-out and shock sparks.
//   • Look-around (C): camera leaves the cab, orbits the RV at 14 m for 3 s (mouse swings it), then
//     returns; 30 s cooldown.
//   • Inactive while snap.phase === 'garage' (the on-foot camera runs) or while another camera
//     controller (VanLab3D, GarageView) holds the camera; re-claims it as soon as it is free.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { createModel } from '../../assets/index.js';
import { EV } from '../../shared/protocol.js';
import { Gearbox } from './gearbox.js';
import { Mirrors } from './mirrors.js';
import { WindscreenFog } from './windscreen.js';
import { FpOverlay } from './overlay.js';
import { CabInterior, RIM_R } from './cabInterior.js';
import { CabArms } from './cabArms.js';

export const RV_LAYER = 1;                     // WorldView's RV body layer (not exported there)
export const LOOK_SECONDS = 3;
export const LOOK_COOLDOWN = 30;
const LOOK_RADIUS = 14;
const MAX_YAW = THREE.MathUtils.degToRad(70);
const MAX_PITCH = THREE.MathUtils.degToRad(20);
const NEAR = 0.08;
const DEFAULTS = { eye: [0.55, 1.98, 2.5], eyePitch: -0.15, fov: 72, rvOffset: [0, 0, 2.8] };
// Tuned on screenshots: a touch wider and lower than the asset's rest pose feels less cramped
// (visor + mirror take less of the frame, all three gauges clear the hands). Options override.
const VIEW_FOV = 76, VIEW_PITCH = -0.16;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const _p = new THREE.Vector3(), _p2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ'), _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0);

export class FirstPersonDriver {
  constructor(view, data, { hudRoot = null, audio = null, pointerLock = true, mirrors = true, mirrorHz = 20, mirrorScale = 1, mirrorFar = 150, fov = VIEW_FOV, pitch = VIEW_PITCH } = {}) {
    this.view = view;
    this.data = data;
    this.rules = data.rules || {};
    this.audio = audio;
    this.opts = { pointerLock, mirrors, mirrorHz, mirrorScale, mirrorFar, fov, pitch };
    this.wanted = false;
    this.owning = false;
    this.built = false;
    this.destroyed = false;
    this.snap = null;
    const R = this.rules.rv || {};
    this.gearbox = new Gearbox({ topSpeed: R.topSpeed || 30, accel: R.accel || 7.5 });
    // head + body motion
    this.head = { yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, idle: 9, lean: 0, roll: 0 };
    this.bob = 0; this.bobV = 0; this.prevBump = 0;
    this.shakeAmt = 0; this.shakeT = 0;
    this.fovKick = 0;
    this.time = 0;
    // look-around
    this.look = { t: -1, blend: 0, swing: 0, tSwing: 0, cd: 0 };
    // gauges
    this.vis = { speed: 2.36, rpm: 2.1, temp: 0.3, wheel: 0, wiperA: 0, wiperPrev: 0, wiperPhase: 0, wiping: false };
    this.tempT = 0.3;
    this.stats = { mirrorCalls: 0, mirrorRenders: 0 };
    this.ctrl = { name: 'firstPerson', update: (dt, camera, snap) => this._place(dt, camera, snap) };
    this.overlay = typeof document !== 'undefined' ? new FpOverlay(hudRoot, view.canvas) : null;
    this._offEv = view.onEvent ? view.onEvent((ev) => this._onEvent(ev)) : null;
    this._onClick = () => { if (this.owning && this.opts.pointerLock && this.look.t < 0) this.requestPointerLock(); };
    this._onLockChange = () => { this.locked = typeof document !== 'undefined' && document.pointerLockElement === this.view.canvas; };
    if (view.canvas) view.canvas.addEventListener('click', this._onClick);
    if (typeof document !== 'undefined') document.addEventListener('pointerlockchange', this._onLockChange);
    this.locked = false;
    this.ready = Promise.resolve(view.ready).then(() => { if (!this.destroyed) this._build(); return this; })
      .catch((e) => { console.error('[fp] init failed', e); });
  }

  // ── build ───────────────────────────────────────────────────────────────
  _build() {
    const view = this.view;
    if (!view.rvAnchor) throw new Error('view.rvAnchor missing');
    const cab = createModel('rv_cab_fp');
    const ud = cab.userData || {};
    this.ud = { ...DEFAULTS, ...ud };
    if (this.opts.fov != null) this.ud.fov = this.opts.fov;
    if (this.opts.pitch != null) this.ud.eyePitch = this.opts.pitch;
    cab.position.set(...this.ud.rvOffset);
    cab.name = 'fp_cab';
    cab.visible = false;
    cab.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    view.rvAnchor.add(cab);
    this.cab = cab;
    this.frame = cab.getObjectByName('rv_frame') || cab;
    const g = (n) => cab.getObjectByName(n);
    this.parts = {
      speed: g('needle_speed'), rpm: g('needle_rpm'), temp: g('needle_temp'), wheel: g('wheel'),
      handL: g('hand_l'), handR: g('hand_r'), wiperL: g('wiper_l'), wiperR: g('wiper_r'),
      wiperMountL: g('wiper_l_mount'), wiperMountR: g('wiper_r_mount'),
    };
    this.eye = new THREE.Vector3(...this.ud.eye);
    this.interior = new CabInterior(cab);
    this.arms = new CabArms(this.frame, { mount: g('wheel_mount'), rimRadius: RIM_R });
    this._armEye = new THREE.Vector3();
    const rvSize = view.rv?.size || {};
    this.mirrors = this.opts.mirrors ? new Mirrors(cab, { rvLength: rvSize.l || 8.6, rvHeight: rvSize.h || 3.4, hz: this.opts.mirrorHz, scale: this.opts.mirrorScale, far: this.opts.mirrorFar }) : null;
    this.fog = typeof document !== 'undefined' ? new WindscreenFog(this.frame) : null;
    this._offPre = view.addPreRender ? view.addPreRender((renderer, scene, camera, snap, dt) => this._preRender(renderer, scene, camera, snap, dt)) : null;
    this.built = true;
  }

  // ── public API ──────────────────────────────────────────────────────────
  setActive(on) {
    this.wanted = !!on;
    if (!this.wanted && this.owning) this._release();
    if (this.wanted) this._sync();
  }
  get active() { return this.owning; }
  get mode() { return !this.owning ? 'off' : this.look.blend > 0.01 ? 'look' : 'fp'; }
  get cooldown() { return clamp(this.look.cd / LOOK_COOLDOWN, 0, 1); }
  get gear() { return this.gearbox.gear; }
  get rpm() { return this.gearbox.rpm; }
  get throttle() { return this.gearbox.throttle; }
  get driveState() { const g = this.gearbox; return { rpm: g.rpm, gear: g.gear, throttle: g.throttle, load: g.load, running: g.running }; }

  /** C key. Starts the 3 s outside orbit; false while on cooldown or not in first person. */
  lookAround() {
    if (!this.owning || this.look.cd > 0 || this.look.t >= 0) return false;
    this.look.t = 0;
    this.look.cd = LOOK_COOLDOWN;
    this.look.swing = 0; this.look.tSwing = 0;
    if (typeof document !== 'undefined' && document.pointerLockElement) { /* keep the lock: deltas swing the orbit */ }
    return true;
  }

  requestPointerLock() {
    const c = this.view.canvas;
    if (!c || !c.requestPointerLock || document.pointerLockElement === c) return;
    try { const p = c.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not allowed (iframe / headless) */ }
  }

  /** Mouse move. Pointer lock → relative deltas; otherwise the cursor position vs the canvas centre. */
  onPointer(e) {
    if (!e) return;
    const lockedHere = typeof document !== 'undefined' && document.pointerLockElement === this.view.canvas;
    const H = this.head;
    if (this.look.t >= 0) {
      if (lockedHere) this.look.tSwing = clamp(this.look.tSwing - (e.movementX || 0) * 0.006, -2.2, 2.2);
      else { const n = this._norm(e); if (n) this.look.tSwing = -n.x * 2.0; }
      return;
    }
    if (lockedHere) {
      H.tYaw = clamp(H.tYaw - (e.movementX || 0) * 0.0032, -MAX_YAW, MAX_YAW);
      H.tPitch = clamp(H.tPitch - (e.movementY || 0) * 0.0032, -MAX_PITCH, MAX_PITCH);
    } else {
      const n = this._norm(e);
      if (!n) return;
      const dz = (v) => Math.sign(v) * Math.max(0, Math.abs(v) - 0.14) / 0.86;
      H.tYaw = -dz(n.x) * MAX_YAW;
      H.tPitch = -dz(n.y) * MAX_PITCH;
    }
    H.idle = 0;
  }
  _norm(e) {
    const c = this.view.canvas;
    if (!c || e.clientX == null) return null;
    const r = c.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1), y: clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1) };
  }

  /** Direct head pose (tests / gamepad): yaw +left, pitch +up, radians. */
  setHead(yaw, pitch = 0, { hold = true } = {}) {
    this.head.tYaw = clamp(yaw, -MAX_YAW, MAX_YAW); this.head.tPitch = clamp(pitch, -MAX_PITCH, MAX_PITCH);
    this.head.idle = hold ? -1e9 : 0;
  }

  shake(amount) { this.shakeAmt = Math.min(1.6, Math.max(this.shakeAmt, amount)); }

  // ── per frame (call before view.render) ─────────────────────────────────
  update(dt, snap, input = null) {
    if (this.destroyed) return;
    dt = clamp(dt || 0, 0, 0.1);
    this.time += dt;
    if (snap) this.snap = snap;
    snap = this.snap;
    if (!snap) return;
    const rv = snap.rv || {};
    // gearbox (always: the audio uses it even when the camera belongs to someone else)
    const gi = snap.garage?.items;
    const engine = snap.phase === 'garage' ? (gi?.engine || 'off') : 'on';
    this.gearbox.update(dt, {
      speed: rv.speed || 0, throttle: input && snap.phase === 'drive' ? Math.max(0, input.throttle || 0) : (snap.phase === 'countdown' ? 0 : null),
      airborne: !!rv.airborne, nitro: (rv.nitro || 0) > 0, engine, braking: !!(input && input.throttle < -0.1),
    });
    if (this.audio && this.audio.setDriveState) this.audio.setDriveState(this.driveState);
    this._sync();
    // look-around timing + cooldown
    const L = this.look;
    if (L.cd > 0) L.cd = Math.max(0, L.cd - dt);
    if (L.t >= 0) {
      L.t += dt;
      const s = L.t;
      L.blend = s < 0.6 ? smooth(s / 0.6) : s < LOOK_SECONDS - 0.6 ? 1 : smooth((LOOK_SECONDS - s) / 0.6);
      L.swing = damp(L.swing, L.tSwing, 4, dt);
      if (s >= LOOK_SECONDS) { L.t = -1; L.blend = 0; }
    }
    if (!this.built) return;
    this._head(dt, snap, rv);
    this._animateCab(dt, snap, rv);
    const fx = snap.fx || {};
    const light = this._light(snap);
    if (this.fog) {
      this.fog.update(dt, { fog: this.owning ? fx.fog || 0 : 0, speed: Math.abs(rv.speed || 0), light, wipers: this._wiperList });
    }
    const hidden = !!this.view._sceneOverride || snap.phase === 'garage';
    if (this.overlay) this.overlay.update(dt, { on: this.owning && !hidden, flash: fx.flash || 0, shock: fx.shock || 0, look: L.blend });
    const showCab = this.owning && L.blend < 0.02;
    this.cab.visible = showCab;
    if (this.mirrors) { this.stats.mirrorCalls = this.mirrors.stats.calls; this.stats.mirrorRenders = this.mirrors.stats.renders; }
  }

  _light(snap) {
    const h = snap.timeOfDay;
    if (typeof h !== 'number') return 1;
    if (h > 17.4) return clamp(1 - (h - 17.4) / 3.2 * 0.6, 0.4, 1);
    if (h < 7.2) return clamp(0.7 + (h - 6) * 0.25, 0.55, 1);
    return 1;
  }

  // take/release the camera
  _sync() {
    if (!this.built || this.destroyed) return;
    const v = this.view;
    const phase = this.snap?.phase;
    const other = v.cameraController && v.cameraController !== this.ctrl;
    const want = this.wanted && phase !== 'garage' && !other;
    if (want && !this.owning) this._acquire();
    else if (!want && this.owning) this._release(other);
    else if (want && v.cameraController !== this.ctrl) v.setCameraController(this.ctrl);   // someone cleared it
  }
  _acquire() {
    const v = this.view, cam = v.camera;
    this.owning = true;
    v.setCameraController(this.ctrl);
    this._savedNear = cam.near;
    cam.near = NEAR; cam.updateProjectionMatrix();
    cam.layers.disable(RV_LAYER);
    this.cab.visible = true;
    if (this.interior && !this._bulbDone) { this._bulbDone = true; this.interior.bulbCheck(); }   // key-on lamp test, once
  }
  _release(stolen = false) {
    const v = this.view, cam = v.camera;
    this.owning = false;
    if (!stolen && v.cameraController === this.ctrl) v.setCameraController(null);
    if (this._savedNear != null) { cam.near = this._savedNear; cam.updateProjectionMatrix(); }
    cam.layers.enable(RV_LAYER);
    if (this.cab) this.cab.visible = false;
    if (this.fog) this.fog.clear();
    this.look.t = -1; this.look.blend = 0;
    if (typeof document !== 'undefined' && document.pointerLockElement === v.canvas) { try { document.exitPointerLock(); } catch (e) { /* */ } }
    if (this.overlay) this.overlay.update(0, { on: false });
  }

  // ── head, bob, sway ─────────────────────────────────────────────────────
  _head(dt, snap, rv) {
    const H = this.head;
    H.idle += dt;
    if (H.idle > 1.5) { H.tYaw = damp(H.tYaw, 0, 2.6, dt); H.tPitch = damp(H.tPitch, 0, 2.6, dt); }
    const autoYaw = -(rv.steer || 0) * 0.09;                              // glance into the turn
    H.yaw = damp(H.yaw, clamp(H.tYaw + autoYaw, -MAX_YAW, MAX_YAW), 9, dt);
    H.pitch = damp(H.pitch, H.tPitch, 9, dt);
    const feel = snap.feel || {};
    const bump = feel.bump || 0;
    // bump impulse on the rising edge + continuous road buzz
    if (bump > this.prevBump + 0.05) this.bobV -= (bump - this.prevBump) * 1.6;
    this.prevBump = bump;
    this.bobV += (-this.bob * 160 - this.bobV * 11) * dt;
    this.bob = clamp(this.bob + this.bobV * dt, -0.09, 0.07);
    // centrifugal lean (head moves to the outside of the turn)
    const lat = clamp(feel.latAcc || 0, -25, 25);
    H.lean = damp(H.lean, clamp(-lat * 0.0035, -0.06, 0.06), 5, dt);
    H.roll = damp(H.roll, clamp(lat * 0.0028, -0.05, 0.05), 5, dt);
    // FOV kick on nitro
    this.fovKick = damp(this.fovKick, (rv.nitro || 0) > 0 ? 9 : 0, (rv.nitro || 0) > 0 ? 5 : 2, dt);
    // shock jitter
    const shock = (snap.fx && snap.fx.shock) || 0;
    if (shock > 0.05) this.shake(0.25 + shock * 0.5);
  }

  // ── gauges, wheel, wipers ───────────────────────────────────────────────
  _animateCab(dt, snap, rv) {
    const P = this.parts, V = this.vis;
    const mph = Math.abs(rv.speed || 0) * 2.23694;
    const bumpJ = ((snap.feel && snap.feel.bump) || 0) * Math.sin(this.time * 47) * 0.03;
    V.speed = damp(V.speed, lerp(2.36, -2.36, clamp(mph / 100, 0, 1.05)), 7, dt);
    V.rpm = damp(V.rpm, lerp(2.1, -2.1, clamp(this.gearbox.rpm / 6000, 0, 1.02)), 14, dt);
    // temperature: warms up to normal, climbs when the hull is low or the lab is burning
    const hp = rv.hp ?? 100;
    const fire = (snap.lab && snap.lab.fire) || 0;
    let tT = this.gearbox.running ? 0.5 : 0.3;
    if (hp < 40) tT = Math.max(tT, 0.5 + ((40 - hp) / 40) * 0.48);
    if (fire > 0.3) tT = Math.max(tT, 0.82 + fire * 0.15);
    this.tempT += clamp(tT - this.tempT, -dt * 0.012, dt * (tT > 0.6 ? 0.03 : 0.008));
    V.temp = lerp(0.85, -0.85, clamp(this.tempT, 0, 1));
    if (P.speed) P.speed.rotation.z = V.speed + bumpJ;
    if (P.rpm) P.rpm.rotation.z = V.rpm + bumpJ * 0.5;
    if (P.temp) P.temp.rotation.z = V.temp;
    // steering wheel (+ = right), kicking a little on bumps; Rook's arms grip it (cabArms.js)
    V.wheel = damp(V.wheel, clamp((rv.steer || 0) * 1.7, -2.2, 2.2), 14, dt);
    const wheelNow = V.wheel + bumpJ * 0.7;
    if (P.wheel) P.wheel.rotation.z = wheelNow;
    if (this.owning) {
      const H = this.head;
      this.arms.update(dt, {
        wheel: wheelNow, eye: this._armEye.set(this.eye.x + H.lean, this.eye.y + this.bob, this.eye.z),
        horn: !!rv.horn, gear: this.gearbox.gear, bump: (snap.feel && snap.feel.bump) || 0,
      });
      this.interior.update(dt, { snap, gear: this.gearbox.gear, light: this._light(snap), running: this.gearbox.running });
    }
    // wipers: run on windscreen fog or in the dust storm; finish the stroke and park when done
    const fx = snap.fx || {};
    const want = (fx.fog || 0) > 0.1 || snap.weather === 'dust' || !!this.forceWipers;
    V.wiperPrev = V.wiperA;
    if (want || V.wiperPhase > 0) {
      const period = 1.15;
      V.wiperPhase += dt / period;
      if (V.wiperPhase >= 1) V.wiperPhase = want ? V.wiperPhase - 1 : 0;
      const p = V.wiperPhase;
      V.wiperA = p < 0.44 ? 1.75 * smooth(p / 0.44) : p < 0.88 ? 1.75 * smooth(1 - (p - 0.44) / 0.44) : 0;
      if (!want && p === 0) V.wiperA = 0;
    } else V.wiperA = 0;
    if (P.wiperL) P.wiperL.rotation.z = V.wiperA;
    if (P.wiperR) P.wiperR.rotation.z = V.wiperA;
    this._wiperList = [
      { mount: P.wiperMountL, angle: V.wiperA, prev: V.wiperPrev },
      { mount: P.wiperMountR, angle: V.wiperA, prev: V.wiperPrev },
    ];
  }

  // ── events → shakes ─────────────────────────────────────────────────────
  _onEvent(ev) {
    if (!ev || !this.owning) return;
    switch (ev.type) {
      case EV.CRASH: this.shake(0.35 + Math.min(1.5, ev.power ?? 0.6) * 0.6); break;
      case EV.PED_HIT: this.shake(0.22); break;
      case EV.SMASH: this.shake(0.14); break;
      case EV.COP_WRECK: this.shake(0.35); break;
      case EV.LANDED: this.shake(ev.hard ? 1.2 : 0.6); this.bobV -= ev.hard ? 2.2 : 1.2; break;
      case EV.FELL: this.shake(0.8); break;
      case EV.CANISTER: if (ev.hitRv || ev.kind === 'flash') this.shake(ev.hitRv ? 0.7 : 0.3); break;
      case EV.GADGET: if (ev.gadget === 'nitro') this.shake(0.25); break;
      default: break;
    }
  }

  // ── camera controller (called inside view.render, after the RV pose) ────
  _place(dt, camera, snap) {
    if (!this.built) return;
    const rv = snap && snap.rv;
    if (!rv) return;
    const H = this.head, L = this.look;
    // keep the RV body hidden while in the cab, shown during the look-around
    if (L.blend > 0.02) camera.layers.enable(RV_LAYER); else camera.layers.disable(RV_LAYER);
    this.frame.updateWorldMatrix(true, false);
    // eye in RV-local: seat + lean + bob
    const eye = this.eye;
    _p.set(eye.x + H.lean, eye.y + this.bob, eye.z).applyMatrix4(this.frame.matrixWorld);
    this.frame.getWorldQuaternion(_q);
    // the head stays a bit more level than the body
    const bodyRoll = (this.view.rv?.tilt?.rotation?.z) || 0;
    const engineBuzz = (this.gearbox.rpm < 1100 ? 0.0016 : 0.0007) * Math.sin(this.time * 71) * (this.gearbox.running ? 1 : 0);
    const portrait = clamp((1.25 - (camera.aspect || 1.7)) / 0.8, 0, 1);   // tall screens: look a bit lower (less roof)
    _e.set(this.ud.eyePitch - portrait * 0.12 + H.pitch + this.bob * 0.35 + engineBuzz, Math.PI + H.yaw, -bodyRoll * 0.45 + H.roll, 'YXZ');
    _q2.setFromEuler(_e);
    _q.multiply(_q2);
    let fov = this._baseFov(camera.aspect) + this.fovKick + Math.min(3, Math.abs(rv.speed || 0) * 0.08);
    if (L.blend > 0.001) {
      // orbit pose
      const base = this.view.rv?.outer?.position || _p2.set(rv.x, rv.y, rv.z);
      const t = Math.max(0, L.t);
      const ang = rv.yaw + Math.PI + 0.75 - (t / LOOK_SECONDS) * 1.5 + L.swing;
      const ox = base.x + Math.sin(ang) * LOOK_RADIUS, oz = base.z + Math.cos(ang) * LOOK_RADIUS;
      const gy = this.view.track ? this.view.track.surfaceY(oz) : null;
      const oy = Math.max((rv.y || 0) + 4.6, (gy == null ? rv.y || 0 : gy) + 1.8);
      _p2.set(ox, oy, oz);
      const target = new THREE.Vector3(base.x, (rv.y || 0) + 1.6, base.z);
      _m.lookAt(_p2, target, _up);
      const qo = new THREE.Quaternion().setFromRotationMatrix(_m);
      const b = L.blend;
      _p.lerp(_p2, b);
      _p.y += Math.sin(b * Math.PI) * 1.2;
      _q.slerp(qo, b);
      fov = lerp(fov, 58, b);
    }
    camera.position.copy(_p);
    camera.quaternion.copy(_q);
    camera.up.set(0, 1, 0);
    // shake
    if (this.shakeAmt > 0.001) {
      this.shakeT += dt;
      const a = this.shakeAmt * (1 - L.blend * 0.7), t = this.shakeT * 38;
      camera.position.x += (Math.sin(t * 1.1) + Math.sin(t * 2.3) * 0.5) * 0.02 * a;
      camera.position.y += (Math.sin(t * 1.7 + 1) + Math.sin(t * 3.1) * 0.4) * 0.025 * a;
      camera.rotateX(Math.sin(t * 1.9) * 0.012 * a);
      camera.rotateY(Math.sin(t * 1.3 + 2) * 0.012 * a);
      camera.rotateZ(Math.sin(t * 1.3) * 0.02 * a);
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.0);
    }
    if (camera.near !== NEAR) { camera.near = NEAR; }
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  /** Vertical FOV: the cab's 72°, widened on narrow (portrait) screens so ~90° stays visible across. */
  _baseFov(aspect) {
    const base = this.ud.fov || 72;
    const a = aspect || 16 / 9;
    const need = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(90) / 2) / a));
    return clamp(Math.max(base, need), base, 104);
  }

  // ── mirrors (view.addPreRender) ─────────────────────────────────────────
  _preRender(renderer, scene, camera, snap, dt) {
    if (!this.owning || !this.mirrors || !this.cab.visible || this.look.blend > 0.02) return;
    this.mirrors.render(renderer, scene, camera, dt);
  }

  destroy() {
    if (this.destroyed) return;
    if (this.owning) this._release();
    this.destroyed = true;
    if (this._offEv) this._offEv();
    if (this._offPre) this._offPre();
    if (this.view.canvas) this.view.canvas.removeEventListener('click', this._onClick);
    if (typeof document !== 'undefined') document.removeEventListener('pointerlockchange', this._onLockChange);
    if (this.mirrors) this.mirrors.dispose();
    if (this.fog) this.fog.dispose();
    if (this.arms) this.arms.dispose();
    if (this.interior) this.interior.dispose();
    if (this.overlay) this.overlay.destroy();
    if (this.cab) this.cab.removeFromParent();
  }
}

export default FirstPersonDriver;
