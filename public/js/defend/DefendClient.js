// ─────────────────────────────────────────────────────────────────────────────
// DefendClient — the driver's roof defence (Round 3, agent DEFEND). ROUND3_CONTRACT.md "Driver client".
//
//   import { DefendClient } from './defend/DefendClient.js';
//   const d = new DefendClient(view, data, { hudRoot, audio, sendDriverCommand: (c) => sim.applyDriverCommand(c) });
//   d.update(dt, snap)        every frame (host/driver). Takes the camera (view.setCameraController) while
//                             snap.roof.active && !snap.roof.ai; plays gun audio for every shot either way.
//   d.active                  true while it owns the camera / input (main.js: fp.setActive(false), hud.setMode('roof'))
//   d.onKey(e, down) → bool   1–3 guns · 4–6 throwables · R reload · W / F climb down · G throw · Shift steady (rifle)
//   d.onPointer(e) → bool     mousemove / mousedown / mouseup / contextmenu / wheel while active.
//                             Click locks the pointer; LMB fires (throws with 4–6 selected); RMB aims (rifle
//                             scope; with a throwable selected RMB throws); the wheel cycles the guns.
//   d.destroy()
// Test / harness helpers: d.setAim(yaw, pitch) · d.aimAtWorld(x, y, z) · d.fire() · d.throw(device?) ·
//   d.select(slot) · d.setAds(on) · d.debugState()
//
// The crosshair is the camera's centre ray; the target under it (aim.js) sets the roofAim yaw/pitch from the
// sim's aim pivot, so the sim's round lands under the crosshair. Rook (rv.js → ents/rookRoof.js) gets the
// same aim locally (no lag); shots, tracers, casings, impacts and cop damage come from the sim's events
// (both roles see them). This module draws the screen side: camera, recoil, HUD, scope, hit markers, toasts.
// Unity: a RoofDefenceClient MonoBehaviour (Cinemachine vcams + UI Toolkit + the same aim maths).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { defendRules, GUN_IDS, DEVICES, SLOTS } from '../sim/roof.js';
import { RoofCam, PITCH_MIN, PITCH_MAX } from './RoofCam.js';
import { RoofHud, ICO, fmtTime } from './RoofHud.js';
import { DefendAudio } from './audio.js';
import { copsFromSnap, crosshairTarget, aimToPoint, nearestCopYaw, unitOf, PART_LABEL, GUN_PART } from './aim.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _v = new THREE.Vector3();
const SENS = 0.0022;
const KICK = { revolver: 0.028, shotgun: 0.06, rifle: 0.045 };
const SLOT_KEYS = { Digit1: 'revolver', Digit2: 'shotgun', Digit3: 'rifle', Digit4: 'firecracker', Digit5: 'balloon', Digit6: 'flare', Numpad1: 'revolver', Numpad2: 'shotgun', Numpad3: 'rifle', Numpad4: 'firecracker', Numpad5: 'balloon', Numpad6: 'flare' };
const DEVICE_HINT = { firecracker: 'Firecracker · stalls cars within 6 m', balloon: 'Paint balloon · blinds a car', flare: 'Smoke flare · blinds every car in 9 m · uses a smoke bomb' };
const GUN_HINT = { revolver: '<b>3 hits</b> stall a car', shotgun: '<b>Tyres</b> · up to 22 m', rifle: 'Hood = <b>radiator</b> · RMB scope · hold <b>Shift</b> to steady' };

export class DefendClient {
  constructor(view, data, { hudRoot = null, audio = null, sendDriverCommand = null, canvas = null } = {}) {
    this.view = view;
    this.data = data;
    this.R = defendRules(data && data.rules);
    this.send = typeof sendDriverCommand === 'function' ? sendDriverCommand : () => false;
    this.canvas = canvas || view.canvas || null;
    this.cam = new RoofCam(view);
    this.hud = new RoofHud(hudRoot);
    this.hud.onSlot = (id) => { if (this._active) this.select(id); };
    this.audio = new DefendAudio(audio);
    this._active = false;
    this.snap = null; this.roof = null;
    this.target = null;
    this.aim = { yaw: Math.PI, pitch: -0.15 };
    this.ads = false; this.lmb = false; this.breath = false; this.breathT = 3;
    this.fireQueued = -1;
    this.time = 0;
    this.lastHumanShot = -9;
    this.shotHeat = 0; this.shotHeatT = -9;
    this.lastHitToast = -9;
    this.stopIndex = new Map((data?.route?.stops || []).map((s, i) => [s.id, i + 1]));
    this._seenSnap = null;
    this._locked = false;
    this.cam.onPosed = (camera, snap) => this._posed(camera, snap);
    this._onLock = () => { this._locked = typeof document !== 'undefined' && document.pointerLockElement === this.canvas; };
    if (typeof document !== 'undefined') document.addEventListener('pointerlockchange', this._onLock);
  }

  get active() { return this._active; }

  // ── per frame ────────────────────────────────────────────────────────────────
  update(dt, snap) {
    if (!snap) return;
    dt = Math.min(0.1, Math.max(0, dt || 0));
    this.time += dt;
    this.snap = snap;
    const roof = snap.roof || (snap.stop && snap.stop.roof) || null;
    this.roof = roof;
    this._events(snap);
    const want = !!(roof && roof.active && !roof.ai && snap.phase === 'drive' && !(snap.rv && snap.rv.wrecked));
    if (want && !this._active) this._take(snap, roof);
    else if (!want && this._active) this._release();
    if (!this._active) return;
    const rv = snap.rv;
    // camera mode + climb
    const gun = roof.gun || 'revolver';
    const slotGun = GUN_IDS.includes(roof.slot || gun);
    const scoping = this.ads && slotGun && gun === 'rifle' && roof.onRoof && !(roof.reloading > 0);
    this.cam.mode = scoping ? 'scope' : (this.ads && slotGun && roof.onRoof ? 'ads' : 'hip');
    this.cam.climb = clamp(roof.climb ?? 1, 0, 1);
    // scope sway: a slow figure-eight, nearly still while holding breath (Shift, ~3 s)
    if (scoping) {
      const holding = this.breath && this.breathT > 0;
      this.breathT = holding ? Math.max(0, this.breathT - dt) : Math.min(3, this.breathT + dt * 0.6);
      const amp = holding ? 0.0006 : 0.0042;
      this.cam.sway.x = Math.sin(this.time * 0.9) * amp; this.cam.sway.y = Math.sin(this.time * 1.8) * amp * 0.6;
    } else { this.cam.sway.x = 0; this.cam.sway.y = 0; this.breathT = Math.min(3, this.breathT + dt); }
    // the crosshair target → the aim the sim uses
    const ray = this.cam.eyeWorld();
    const cops = copsFromSnap(snap);
    if (ray) {
      this.target = crosshairTarget(ray.eye, ray.dir, cops, rv, 160);
      this.aim = aimToPoint(rv, this.target);
    }
    this.send({ type: 'roofAim', yaw: this.aim.yaw, pitch: this.aim.pitch, ads: this.cam.mode !== 'hip' });
    const rook = this.view.rv && this.view.rv.rook;
    if (rook) { rook.aimOverride = { yaw: this.aim.yaw, pitch: this.aim.pitch }; rook.hidden = this.cam.mode === 'scope' && this.cam.climb >= 1; }
    // buffered trigger pull (clicked just before the gun was ready)
    if (this.fireQueued >= 0 && this.time - this.fireQueued < 0.18 && (roof.cooldown || 0) <= 0.001) { this.fireQueued = -1; this.fire(); }
    if (this.fireQueued >= 0 && this.time - this.fireQueued >= 0.18) this.fireQueued = -1;
    if (this.time - this.shotHeatT > 3) this.shotHeat = 0;
    this.hud.update(this._vm(snap, roof, cops));
  }

  _take(snap, roof) {
    this._active = true;
    const rv = snap.rv;
    // face the sim's aim if he was already up (AI hand-over), else the nearest running cop
    const cy = roof.climb > 0.9 && Number.isFinite(roof.aimYaw) ? roof.aimYaw : nearestCopYaw(rv, copsFromSnap(snap));
    this.cam.yaw = cy != null ? cy : Math.PI;
    this.cam.pitch = -0.2;
    this.cam.climb = clamp(roof.climb ?? 0, 0, 1);
    this.ads = false;
    this.view.setCameraController(this.cam);
    this.hud.show(true);
  }

  _release() {
    this._active = false;
    if (this.view.cameraController === this.cam) this.view.setCameraController(null);
    const camera = this.view.camera;
    if (camera) { camera.fov = 62; camera.near = 0.25; camera.updateProjectionMatrix(); }
    const rook = this.view.rv && this.view.rv.rook;
    if (rook) { rook.aimOverride = null; rook.hidden = false; }
    this.hud.show(false);
    this.hud.layoutTags([]);
    this.ads = false; this.lmb = false; this.breath = false;
    if (typeof document !== 'undefined' && document.pointerLockElement === this.canvas) { try { document.exitPointerLock(); } catch (e) { /* */ } }
  }

  // ── events: audio (always), toasts + hit markers + recoil (while active) ──────
  _events(snap) {
    if (this._seenSnap === snap) return;
    this._seenSnap = snap;
    const evs = snap.events;
    if (!Array.isArray(evs) || !evs.length) return;
    const listener = this._active && this.view.camera ? { x: this.view.camera.position.x, z: this.view.camera.position.z, yaw: snap.rv ? snap.rv.yaw : 0 } : snap.rv;
    let humanShot = false;
    for (const ev of evs) {
      if (!ev || !ev.type) continue;
      try { this.audio.event(ev, snap, listener); } catch (e) { /* audio is best-effort */ }
      if (!this._active) continue;
      switch (ev.type) {
        case 'shot':
          if (!ev.ai) {
            humanShot = true; this.lastHumanShot = this.time;
            this.shotHeat += this.R.heatPerShot; this.shotHeatT = this.time;
            this.hud.toast({ key: 'shots', icon: ICO.gun(), text: 'Shots fired', value: `+${Math.max(1, Math.round(this.shotHeat * 100))}% heat`, tone: 'rust', ms: 2400 });
          }
          break;
        case 'copHit':
          if (humanShot || this.time - this.lastHumanShot < 0.05) this.hud.hitMarker('hit');
          break;
        case 'copDisabled': {
          const how = ev.how, pts = this.R.points[how] | 0;
          const icon = how === 'tyre' ? ICO.tyre('#F2B90F') : how === 'radiator' ? ICO.steam('#F2B90F') : ICO.power();
          const text = how === 'tyre' ? 'Tyre out' : how === 'radiator' ? 'Radiator hit' : 'Stalled';
          this.hud.toast({ key: 'dis' + ev.copId + how, icon, text, sub: `Unit ${unitOf(ev.copId)}`, value: pts ? `+${pts}` : '', tone: '', ms: 3200 });
          if (humanShot || this.time - this.lastHumanShot < 0.05) this.hud.hitMarker('disabled');
          break;
        }
        case 'copShot':
          if (ev.hit && ev.target === 'rook') {
            this.cam.shake(0.35);
            if (this.time - this.lastHitToast > 1.2) {
              this.lastHitToast = this.time;
              const dmg = (ev.damage || 0) * (this.R.copFire.rookShare ?? 0.5);
              this.hud.toast({ key: 'rookhit', icon: ICO.shield('#E5483A'), text: 'Taking fire', sub: 'Rook', value: dmg ? `−${Math.round(dmg * 10) / 10}` : '', tone: 'red', ms: 2000 });
            }
          }
          break;
        default: break;
      }
    }
  }

  // ── actions ──────────────────────────────────────────────────────────────────
  select(slot) {
    if (!SLOTS.includes(slot)) return false;
    if (DEVICES.includes(slot)) this.ads = false;
    return !!this.send({ type: 'roofSelect', slot });
  }
  setAds(on) { this.ads = !!on; }
  setAim(yaw, pitch) { this.cam.yaw = wrap(yaw); this.cam.pitch = clamp(pitch, PITCH_MIN, PITCH_MAX); }
  /** Point the crosshair at a world point (tests): solves the camera yaw/pitch iteratively (the eye depends on them). */
  aimAtWorld(x, y, z) {
    const rv = this.snap && this.snap.rv;
    if (!rv || !this.view.rvAnchor) return false;
    for (let i = 0; i < 6; i++) {
      const r = this.cam.eyeWorld(); if (!r) return false;
      const dx = x - r.eye.x, dy = y - r.eye.y, dz = z - r.eye.z;
      this.cam.yaw = wrap(Math.atan2(dx, dz) - (rv.yaw || 0));
      this.cam.pitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), PITCH_MIN, PITCH_MAX);
    }
    return true;
  }
  fire() {
    const roof = this.roof;
    if (!this._active || !roof || !roof.onRoof) return false;
    const slot = roof.slot || roof.gun;
    if (DEVICES.includes(slot)) return this.throw(slot);
    // make sure the sim has this frame's aim before the trigger pull
    this.send({ type: 'roofAim', yaw: this.aim.yaw, pitch: this.aim.pitch, ads: this.cam.mode !== 'hip' });
    const ok = !!this.send({ type: 'roofFire' });
    if (ok) {
      this.cam.kick(KICK[roof.gun] || 0.03);
      if (roof.gun === 'shotgun') this.cam.shake(0.18);
    } else if ((roof.mag?.[roof.gun] | 0) <= 0 && !(roof.reloading > 0)) this.audio.play('dry', { gain: 0.6 });
    else if ((roof.cooldown || 0) > 0) this.fireQueued = this.time;
    return ok;
  }
  throw(device = null) {
    const roof = this.roof;
    if (!this._active || !roof || !roof.onRoof || !this.target) return false;
    const dev = device || (DEVICES.includes(roof.slot) ? roof.slot : null) || this._lastDevice || 'firecracker';
    this._lastDevice = dev;
    const t = this.target.cop ? { x: this.target.cop.x, z: this.target.cop.z } : { x: this.target.x, z: this.target.z };
    return !!this.send({ type: 'roofThrow', device: dev, x: t.x, z: t.z });
  }
  climbDown() { return !!this.send({ type: 'defend', on: false }); }

  // ── input ────────────────────────────────────────────────────────────────────
  onKey(e, down) {
    if (!this._active || !e) return false;
    const code = e.code || '';
    if (SLOT_KEYS[code]) { if (down && !e.repeat) { const s = SLOT_KEYS[code]; if (DEVICES.includes(s)) this._lastDevice = s; this.select(s); } return true; }
    switch (code) {
      case 'KeyR': if (down && !e.repeat) this.send({ type: 'roofReload' }); return true;
      case 'KeyW': case 'KeyF': if (down && !e.repeat) this.climbDown(); return true;
      case 'KeyG': if (down && !e.repeat) this.throw(); return true;
      case 'ShiftLeft': case 'ShiftRight': this.breath = !!down; return true;
      case 'KeyA': case 'KeyS': case 'KeyD': case 'Space': case 'KeyQ': case 'KeyE': case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight':
        return true;   // nothing to drive up here (the RV is held); keep them from the driving inputs
      default: return false;
    }
  }

  onPointer(e) {
    if (!this._active || !e) return false;
    const t = e.type;
    if (t === 'contextmenu') { e.preventDefault?.(); return true; }
    if (t === 'mousemove' || t === 'pointermove') {
      if (!this._locked) return false;
      const k = this.cam.mode === 'scope' ? 0.25 : this.cam.mode === 'ads' ? 0.6 : 1;
      this.cam.yaw = wrap(this.cam.yaw - (e.movementX || 0) * SENS * k);
      this.cam.pitch = clamp(this.cam.pitch - (e.movementY || 0) * SENS * k, PITCH_MIN, PITCH_MAX);
      return true;
    }
    if (t === 'mousedown' || t === 'pointerdown') {
      if (!this._locked) { this._requestLock(); return true; }   // the first click only locks
      const slot = this.roof && (this.roof.slot || this.roof.gun);
      const device = DEVICES.includes(slot);
      if (e.button === 0) { this.lmb = true; this.fire(); }
      else if (e.button === 2) { if (device) this.throw(slot); else this.ads = true; }
      e.preventDefault?.();
      return true;
    }
    if (t === 'mouseup' || t === 'pointerup') {
      if (e.button === 0) this.lmb = false;
      if (e.button === 2) this.ads = false;
      return true;
    }
    if (t === 'wheel') {
      const i = GUN_IDS.indexOf(this.roof?.gun || 'revolver');
      this.select(GUN_IDS[(i + (e.deltaY > 0 ? 1 : 2)) % 3]);
      e.preventDefault?.();
      return true;
    }
    return false;
  }
  _requestLock() {
    const c = this.canvas;
    if (!c || !c.requestPointerLock) return;
    try { const p = c.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not allowed (headless / iframe) */ }
  }

  // ── HUD view model ───────────────────────────────────────────────────────────
  _vm(snap, roof, cops) {
    const rv = snap.rv;
    const gun = roof.gun || 'revolver', slot = roof.slot || gun, device = DEVICES.includes(slot);
    // stop chip
    const st = snap.stop;
    const stop = { pin: null, title: '', line: '', rightLabel: '', rightValue: '', frac: null };
    const near = [];
    for (const c of cops) if (c.state === 1 && Math.hypot(c.x - rv.x, c.z - rv.z) <= 40) near.push(c);
    if (st) {
      stop.pin = this.stopIndex.get(st.id) ?? null;
      stop.title = `Stop ${stop.pin ?? ''} · ${st.name || ''}`;
      const ds = st.docShop;
      if (st.state === 'parked') { stop.line = 'Parked — Doc\'s getting ready'; stop.rightLabel = 'Cops near'; stop.rightValue = String(near.length); }
      else if (st.state === 'shopping') {
        if (st.doc === 'out' || ds) {
          stop.line = `Doc inside · ${ds && ds.label ? ds.label : 'shopping'}`;
          stop.rightLabel = 'Doc out in'; stop.rightValue = fmtTime(ds && Number.isFinite(ds.tLeft) ? ds.tLeft : Math.max(0, (st.shopMax || 90) - (st.shopT || 0)));
          stop.frac = ds && Number.isFinite(ds.frac) ? ds.frac : null;
        } else { stop.line = 'Doc\'s heading for the side door'; stop.rightLabel = 'Shop time'; stop.rightValue = fmtTime(Math.max(0, (st.shopMax || 90) - (st.shopT || 0))); }
      } else if (st.state === 'returning') { stop.line = 'Doc\'s running back'; stop.rightLabel = 'Cops near'; stop.rightValue = String(near.length); }
      else if (st.state === 'loading') {
        stop.line = st.blocked ? 'Loading paused — a cop in the lot' : 'Loading the supplies';
        stop.rightLabel = 'Loaded'; stop.rightValue = `${Math.round((st.progress || 0) * 100)}%`; stop.frac = st.progress || 0;
      } else { stop.line = 'Loaded — climb down and go'; stop.rightLabel = 'Climb down'; stop.rightValue = 'F'; }
    } else {
      stop.title = `Roof · ${snap.area?.name || 'the road'}`;
      stop.line = near.length ? 'Hold them off, then climb down (F)' : 'All clear — climb down and drive (F)';
      stop.rightLabel = 'Cops near'; stop.rightValue = String(near.length);
    }
    // bust
    const bi = snap.bustInfo || {};
    const units = near.length;
    let sub = units ? `Nearest cop ${Math.round(roof.nearCop ?? 999)} m · ${units} unit${units === 1 ? '' : 's'}` : 'All clear';
    if (units && bi.grace > 0.05) sub = `Grace ${bi.grace.toFixed(1)} s · ${units} unit${units === 1 ? '' : 's'}`;
    const bust = { value: clamp(snap.bust || 0, 0, 1), sub };
    // target label
    let target = null;
    const T = this.target;
    if (T && device) {
      const d = Math.hypot(T.x - rv.x, T.z - rv.z);
      target = { dist: `${Math.round(Math.min(25, Math.max(3, d)))} m`, part: d > 25 ? 'Max 25 m' : 'Throw', tone: d > 25 ? 'far' : 'good' };
    } else if (T && T.cop) {
      const range = this.R.guns[gun]?.range ?? 45;
      const far = T.dist > range;
      const good = !far && (gun === 'revolver' || GUN_PART[gun] === T.part);
      target = { dist: `${Math.round(T.dist)} m`, part: far ? 'Out of range' : PART_LABEL[T.part] || T.part, tone: far ? 'far' : good ? 'good' : '' };
    }
    // slots + ammo
    const slots = {};
    for (const id of GUN_IDS) {
      const m = roof.mag?.[id] | 0, r = roof.reserve?.[id] | 0;
      slots[id] = { sel: slot === id, count: String(m), empty: m + r === 0, red: m === 0 };
    }
    const th = roof.throwables || {};
    for (const id of DEVICES) slots[id] = { sel: slot === id, count: `×${th[id] | 0}`, empty: (th[id] | 0) === 0, red: false };
    const mag = roof.mag?.[gun] | 0, reserve = roof.reserve?.[gun] | 0;
    const reloading = roof.reloading > 0 && roof.reloadT > 0;
    const ammo = { mag, reserve, reload: reloading ? clamp(1 - roof.reloading / roof.reloadT, 0.02, 1) : 0, dry: mag + reserve === 0, label: reloading ? 'Reloading' : mag + reserve === 0 ? 'Out — next stop' : 'Ammo' };
    // controls + hint
    const K = (k, txt) => `<span class="k"><span class="dfd-key">${k}</span>${txt}</span>`;
    const controls = `<div class="r">${K('LMB', device ? 'throw' : 'fire')}${K('RMB', device ? 'throw' : gun === 'rifle' ? 'scope' : 'aim')}${K('R', 'reload')}</div><div class="r">${K('1–3', 'guns')}${K('4–6', 'throw')}${K('F', 'climb down')}</div>`;
    let hint = device ? DEVICE_HINT[slot] : GUN_HINT[gun];
    if (!this._locked && roof.onRoof && typeof document !== 'undefined' && this.canvas && this.canvas.requestPointerLock) hint = '<b>Click</b> to aim with the mouse · ' + hint;
    if ((th.flare | 0) === 0 && slot === 'flare') hint = 'No flare — it needs a smoke bomb and the next stop\'s flare';
    const banner = roof.climbDir === 'up' ? `${ICO.ladder}Climbing onto the roof…` : roof.climbDir === 'down' ? `${ICO.ladder}Climbing back into the cab…` : '';
    const w = this.view.canvas?.clientWidth || 1280, h = this.view.canvas?.clientHeight || 720;
    const scope = this.cam.mode === 'scope' && this.cam.climb >= 1;
    const scopeText = T ? `${Math.round(T.dist)} m${T.cop ? ' · ' + (PART_LABEL[T.part] || '') : ''}${this.breath && this.breathT > 0 ? ' · steady' : ''}` : '';
    return { stop, bust, crosshair: device ? 'throw' : gun, target, scope, scopeText, banner, controls, hint, slots, ammo, climbing: roof.climbDir != null, w, h };
  }

  // cop tags, after the camera is posed (screen projection)
  _posed(camera, snap) {
    if (!this._active || !snap) return;
    const rv = snap.rv, c = this.view.canvas;
    const W = c?.clientWidth || 1280, H = c?.clientHeight || 720;
    const list = [];
    for (const cop of copsFromSnap(snap)) {
      if (!(cop.state === 9 || cop.state === 10 || cop.state === 7)) continue;
      const d = Math.hypot(cop.x - rv.x, cop.z - rv.z);
      if (d > 70) continue;
      _v.set(cop.x, (cop.y || 0) + 1.25, cop.z).project(camera);
      if (_v.z > 1 || Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05) continue;
      const ax = (_v.x * 0.5 + 0.5) * W, ay = (-_v.y * 0.5 + 0.5) * H;
      const chips = cop.state === 9 ? [[ICO.tyre(), 'Tyre out'], [ICO.back(), 'Backing off']]
        : cop.state === 10 ? [[ICO.steam(), 'Radiator hit'], [ICO.power(), 'Stalling']]
          : [[ICO.power(), 'Stalled']];
      list.push({ id: cop.id, d, ax, ay, unit: unitOf(cop.id), chips });
    }
    list.sort((a, b) => a.d - b.d);
    const out = list.slice(0, 3);
    // tags sit up-left of the car, kept on screen and off the centre crosshair
    for (const t of out) {
      t.x = clamp(t.ax - 110, 16, W - 260); t.y = clamp(t.ay - 64, 84, H - 170);
      if (Math.abs(t.x + 110 - W / 2) < 120 && Math.abs(t.y + 13 - H / 2) < 60) t.y -= 70;
    }
    this.hud.layoutTags(this.cam.mode === 'scope' ? [] : out);
  }

  debugState() {
    const r = this.roof || {};
    return { active: this._active, mode: this.cam.mode, camYaw: +this.cam.yaw.toFixed(3), camPitch: +this.cam.pitch.toFixed(3), aim: { yaw: +this.aim.yaw.toFixed(3), pitch: +this.aim.pitch.toFixed(3) },
      target: this.target ? { cop: this.target.cop ? this.target.cop.id : null, part: this.target.part, dist: +this.target.dist.toFixed(1) } : null,
      roof: { gun: r.gun, slot: r.slot, onRoof: r.onRoof, climb: r.climb, mag: r.mag, reserve: r.reserve, reloading: r.reloading, ai: r.ai }, locked: this._locked };
  }

  destroy() {
    if (this._active) this._release();
    this.hud.destroy();
    this.audio.destroy();
    if (typeof document !== 'undefined') document.removeEventListener('pointerlockchange', this._onLock);
  }
}

export default DefendClient;
