// ─────────────────────────────────────────────────────────────────────────────
// WorldView — the 3D world for both roles.
//
//   const view = new WorldView(canvas, data, { seed, role: 'driver'|'cook', audio? });
//   await view.ready;                       // optional: models loaded (render() is safe before)
//   view.pushSnapshot(snap, { interpolate }) // driver: every frame, no interp; cook: on arrival
//   view.render(dt)                          // seconds; call every animation frame
//   view.setCamera('chase'|'rear'|'cinematic')
//   view.resize(); view.destroy();
//   view.onEvent(cb)                         // cb(ev) for every snapshot event the view consumes
//   view.setHourOverride(h|null)             // force the time of day (else snap.timeOfDay, else route keyframes)
//   view.world                               // { chunks, structures, protos, layout } (VIEW-WORLD-A internals)
//   view.setGarageExteriorVisible(bool)      // ONFOOT: hide the garage exterior while the interior is shown
//
// If `audio` (from render/audio.js createAudio()) is passed, the view forwards
// audio.update(snap, dt) every frame and audio.event(ev) for each event, using the
// same (interpolated, de-duplicated) stream it renders — handy for the cook.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Track } from '../sim/track.js';
import { EV } from '../shared/protocol.js';
import { ModelLib } from './models.js';
import { RoadInfo } from './roadBuilder.js';
import { Chunks } from './chunks.js';
import { Environment } from './env.js';
import { Particles } from './particles.js';
import { EntityView } from './entities.js';
import { RvView } from './rv.js';
import { CameraRig } from './cameras.js';
import { Fx } from './fx.js';
import { ATLAS } from './textures.js';
import { StructuresView } from './world/structures.js';
import { WTIME } from './world/materials.js';
import { NightLights } from './world/lights.js';

const INTERP_DELAY = 0.1;      // seconds the cook renders in the past
export const RV_LAYER = 1;   // the RV body's layer (hidden from in-cab / rear-window cameras)

const lerp = (a, b, t) => a + (b - a) * t;
const lerpAng = (a, b, t) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * t; };

export class WorldView {
  constructor(canvas, data, { seed, role = 'driver', audio = null, shadows = true, pixelRatio = null } = {}) {
    this.canvas = canvas;
    this.data = data;
    this.route = data.route;
    this.rules = data.rules || {};
    this.seed = (seed ?? this.route.defaultSeed ?? 1) | 0;
    this.role = role;
    this.audio = audio;
    this.track = new Track(this.route, this.seed);
    this.info = new RoadInfo(this.track, this.route, this.seed);
    this.listeners = [];
    this.destroyed = false;

    // renderer
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    r.setPixelRatio(Math.min(pixelRatio ?? window.devicePixelRatio ?? 1, 1.75));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.08;
    r.shadowMap.enabled = shadows;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.info.autoReset = true;
    this.renderer = r;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.25, 2600);
    this.camera.layers.enable(RV_LAYER);
    this.env = new Environment(this.scene, this.info, { shadows });
    this.env.sun.shadow.camera.layers.enable(RV_LAYER);
    this.particles = new Particles(this.scene, { cap: 1400 });
    this.camRig = new CameraRig(this.camera, this.track);
    this.cameraMode = role === 'cook' ? 'rear' : 'chase';
    this.camRig.setMode(this.cameraMode);

    // snapshot state
    this.latest = null;          // last snapshot pushed
    this.cur = null;             // snapshot used for this frame (maybe interpolated)
    this.buffer = [];            // interpolation buffer [{ t, snap, events }]
    this.renderT = null;
    this.pendingEvents = [];
    this.lastZ = null;
    this.time = 0;
    this.lastFrame = performance.now();
    this.stats = { calls: 0, triangles: 0, chunks: 0, ents: 0, particles: 0 };

    this._overlay();
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(canvas);
    }

    this.lib = null;
    this.ready = ModelLib.load().then((lib) => {
      if (this.destroyed) return;
      this.lib = lib;
      this.chunks = new Chunks(this.scene, this.info, lib, this.seed);
      this.chunks.setRange(150, 500);
      this.structures = new StructuresView(this.scene, this.info, lib, { rules: this.rules });
      for (const id of this._lootedEarly || []) this.structures.markLooted(id);
      if (this._garageVis === false) this.structures.setGarageVisible(false);
      this.nightLights = new NightLights(this.scene);
      this.world = { chunks: this.chunks, structures: this.structures, protos: this.chunks.protos, layout: this.chunks.layout, lights: this.nightLights };
      this.entities = new EntityView(this.scene, lib, this.particles, { rules: this.rules, track: this.track });
      this.rv = new RvView(this.scene, lib, this.particles, this.info);
      this.rv.inst.rig.mesh.layers.set(RV_LAYER);
      this.camRig.rvLen = this.rv.size.l; this.camRig.rvH = this.rv.size.h;
      this.fx = new Fx(this.scene, this.particles, this.info, this.track);
      for (const id of this._lootedEarly || []) this.fx.markLooted(id);
      this.modelSource = lib.source;
      this.rvAnchor = this.rv.anchor;   // [van hook] RV-local frame (tilt group child) for the 3D lab interior
      if (this.vanMode) this._applyVanMode();
      return this;
    }).catch((e) => { console.error('[view] init failed', e); throw e; });
  }

  // ── public API ────────────────────────────────────────────────────────────
  onEvent(cb) { this.listeners.push(cb); return () => { this.listeners = this.listeners.filter((f) => f !== cb); }; }

  pushSnapshot(snap, { interpolate = false } = {}) {
    if (!snap || this.destroyed) return;
    this.latest = snap;
    if (!interpolate) {
      this.buffer.length = 0;
      this.cur = snap;
      if (snap.events && snap.events.length) this.pendingEvents.push(...snap.events);
      return;
    }
    // drop out-of-order / duplicate
    const last = this.buffer[this.buffer.length - 1];
    if (last && snap.t <= last.t) {
      if (snap.t === last.t) return;
      if (last.t - snap.t > 2) { this.buffer.length = 0; this.renderT = null; } // restart / rewind
      else return;
    }
    this.buffer.push({ t: snap.t, snap, events: snap.events || [] });
    if (this.buffer.length > 40) this.buffer.splice(0, this.buffer.length - 40);
  }

  setCamera(mode) {
    if (!['chase', 'rear', 'cinematic'].includes(mode)) return;
    this.cameraMode = mode;
    this.camRig.setMode(mode);
    this._updateOverlayMode();
  }
  setCinematic(opts) { this.camRig.setCinematic(opts); }
  /** ONFOOT: hide the `rooks_garage` exterior (its walls clash with garage_interior) during the tutorial. */
  setGarageExteriorVisible(on) { this._garageVis = on !== false; if (this.structures) this.structures.setGarageVisible(this._garageVis); }
  /** Force the time of day (hours, e.g. 6.6 … 19.8); null → snap.timeOfDay / route keyframes. */
  setHourOverride(h) { this._hour = h == null || !isFinite(h) ? null : +h; }

  // ── [van hooks] used by van/VanLab3D.js — inert unless called ─────────────
  // setCameraController(ctrl|null): while set, ctrl.update(dt, camera, snap) places the camera
  // every frame instead of the built-in rig (and the cook's rear-window overlay is hidden).
  setCameraController(ctrl) {
    const had = !!this.cameraController;
    this.cameraController = ctrl || null;
    if (had && !ctrl) this.camRig.first = true;   // built-in rig snaps back cleanly
    this._updateOverlayMode();
  }
  // setVanMode(bool): hide the baked RV body (main camera + sun shadow) so the cut-away interior
  // shows, keep the shadow frustum / chunk streaming centred on the van, suppress the exterior
  // window fire glow. Off restores everything exactly.
  setVanMode(on) {
    this.vanMode = !!on;
    this._applyVanMode();
  }
  _applyVanMode() {
    if (!this.rv) return;
    const on = !!this.vanMode;
    this.rv.inst.root.visible = !on;
    this.rv.suppressGlow = on;
    this.env.setShadowFocus(on ? 34 : 60);
    this._updateOverlayMode();
  }

  resize() {
    const c = this.canvas;
    let w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) { w = c.parentElement?.clientWidth || window.innerWidth; h = c.parentElement?.clientHeight || window.innerHeight; }
    w = Math.max(1, Math.floor(w)); h = Math.max(1, Math.floor(h));
    if (this._w === w && this._h === h) return;
    this._w = w; this._h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._layoutOverlay();
  }

  /**
   * Expansion hook: while set, render(dt) hands the frame to `fn(renderer, dt, view)` instead of drawing the
   * world (used by the driver's shop-challenge interiors). The world still updates (audio, buffers) but is not drawn.
   */
  setSceneOverride(fn) { this._sceneOverride = typeof fn === 'function' ? fn : null; }

  /** Expansion hook: fn(renderer, scene, camera, snap, dt) runs right before the main draw each frame
   *  (e.g. render-target mirrors). Returns an unsubscribe function. */
  addPreRender(fn) { (this._preRender ||= []).push(fn); return () => { this._preRender = this._preRender.filter((f) => f !== fn); }; }

  render(dt, { draw = true } = {}) {
    if (this.destroyed) return;
    if (this._sceneOverride) {
      const d = Math.min(0.1, Math.max(0, dt ?? 0));
      if (this.cur && this.audio) { try { this.audio.update(this.cur, d); } catch (e) { /* best effort */ } }
      if (this.buffer.length) this._interpolate(d);
      try { this._sceneOverride(this.renderer, d, this); } catch (e) { console.error('[view] scene override', e); }
      return;
    }
    const nowMs = performance.now();
    if (dt == null) dt = (nowMs - this.lastFrame) / 1000;
    this.lastFrame = nowMs;
    dt = Math.min(0.1, Math.max(0, dt));
    this.time += dt;
    if (this.buffer.length) this._interpolate(dt);
    const snap = this.cur;
    if (!this.lib || !snap || !snap.rv) {
      // not ready: just the sky so the canvas is never blank
      this.env.update(dt, { x: 0, z: 0 }, snap?.rv?.z ?? 0, 0, this.camera, this._hour ?? snap?.timeOfDay ?? null);
      this.renderer.toneMappingExposure = this.env.exposure;
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const rv = snap.rv;
    // teleport (preset/reset/checkpoint) → build synchronously, snap camera
    const jumped = this.lastZ == null || Math.abs(rv.z - this.lastZ) > 80;
    this.lastZ = rv.z;
    const camZ = this._focusZ(rv);
    this.chunks.setRange(150, Math.min(600, Math.max(440, this.env.fogFar + 70)));
    this.chunks.update(camZ, jumped ? Infinity : 7);
    WTIME.value = this.time;
    if (jumped) { this.camRig.first = true; this.particles.clear(); }

    // events
    if (this.pendingEvents.length) {
      const evs = this.pendingEvents; this.pendingEvents = [];
      for (const ev of evs) this._event(ev, snap);
    }
    this.rv.update(snap, dt);
    if (this.cameraController) this.cameraController.update(dt, this.camera, snap);
    else this.camRig.update(dt, rv, snap.feel || {});
    this._fumes(dt, snap);
    this.entities.update(snap.ents || [], dt, { rv, cam: this.camera.position, far: 420, snap });
    this.fx.update(dt, snap, this.camera.position);
    // the world's stop arrow + lot ring replace the old per-stop markers (the sell marker stays)
    if (this.fx.markers) for (const m of this.fx.markers) if (!m.sell) { if (m.ring) m.ring.visible = false; if (m.arrow) m.arrow.visible = false; }
    this.structures.update(dt, snap, this.camera.position, rv.z);
    // environment: dust storm
    const dust = this._dustTarget(snap);
    const fwd = this.vanMode ? -6 : this.cameraMode === 'rear' ? -22 : 26;
    this.env.update(dt, { x: rv.x + Math.sin(rv.yaw) * fwd, z: rv.z + Math.cos(rv.yaw) * fwd }, rv.z, dust, this.camera, this._hour ?? snap.timeOfDay ?? null);
    this.renderer.toneMappingExposure = this.env.exposure;
    this.nightLights.update(this.chunks.map, this.env.night);
    if (this.env.dust > 0.03) this._dustParticles(dt, this.env.dust, rv);
    this.particles.setFog(this.env.fogColor, this.env.fogNear, this.env.fogFar);
    this.particles.update(dt);
    if (this.audio) { try { this.audio.update(snap, dt); } catch (e) { /* audio is best-effort */ } }
    this._overlayUpdate(dt, snap);

    if (!draw) return;
    if (this._preRender) for (const fn of this._preRender) { try { fn(this.renderer, this.scene, this.camera, snap, dt); } catch (e) { console.error('[view] preRender', e); } }
    this.renderer.render(this.scene, this.camera);
    const inf = this.renderer.info.render;
    this.stats.calls = inf.calls; this.stats.triangles = inf.triangles;
    this.stats.chunks = this.chunks.map.size; this.stats.ents = this.entities.visibleCount; this.stats.particles = this.particles.count;
    const mem = this.renderer.info.memory;
    this.stats.geometries = mem.geometries; this.stats.textures = mem.textures; this.stats.hour = +this.env.hour.toFixed(2);
  }

  // true when every chunk in range is built (useful for screenshots/tests)
  isSettled() { return !!(this.lib && this.cur && this.cur.rv && this.chunks.pending(this._focusZ(this.cur.rv)) === 0); }
  _focusZ(rv) { return this.vanMode ? rv.z - 30 : this.cameraMode === 'rear' ? rv.z - 60 : rv.z; }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this._ro) this._ro.disconnect();
    try {
      this.chunks && this.chunks.dispose();
      this.structures && this.structures.dispose();
      this.nightLights && this.nightLights.dispose();
      this.entities && this.entities.dispose();
      this.rv && this.rv.dispose();
      this.fx && this.fx.dispose();
      this.particles.dispose();
      this.env.dispose();
    } catch (e) { console.warn(e); }
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.renderer.dispose();
    if (this.overlay) this.overlay.remove();
    this.listeners = [];
  }

  // ── internals ─────────────────────────────────────────────────────────────
  // Cook side: a monotonic render clock that advances with frame dt and is gently
  // steered toward (newest snapshot time − INTERP_DELAY). Robust to host clock drift,
  // packet jitter and bursts; never runs backwards.
  _interpolate(dt) {
    const buf = this.buffer;
    const newest = buf[buf.length - 1].t;
    const target = newest - INTERP_DELAY;
    if (this.renderT == null || Math.abs(target - this.renderT) > 0.6) this.renderT = target;
    else {
      const err = target - this.renderT;
      const rate = 1 + Math.max(-0.35, Math.min(0.35, err * 2.5));
      this.renderT += dt * rate;
    }
    const rt = this.renderT;
    // fire events of every snapshot we have reached
    for (const b of buf) if (!b.fired && b.t <= rt + 1e-6) { b.fired = true; if (b.events.length) this.pendingEvents.push(...b.events); }
    let i = buf.length - 1;
    while (i > 0 && buf[i - 1].t > rt) i--;
    // drop entries older than the bracket
    if (i > 1) { const old = buf.splice(0, i - 1); for (const o of old) if (!o.fired && o.events.length) this.pendingEvents.push(...o.events); i = 1; }
    const B = buf[i], A = buf[i - 1];
    if (!A || rt >= B.t) {
      // starved (late packet) → hold the newest, with a short extrapolation of the RV
      const s = B.snap;
      const ex = Math.min(0.15, Math.max(0, rt - B.t));
      if (ex > 0 && s.rv && !s.rv.airborne) {
        this.cur = { ...s, rv: { ...s.rv, x: s.rv.x + Math.sin(s.rv.yaw) * s.rv.speed * ex, z: s.rv.z + Math.cos(s.rv.yaw) * s.rv.speed * ex } };
      } else this.cur = s;
      if (!B.fired) { B.fired = true; if (B.events.length) this.pendingEvents.push(...B.events); }
      return;
    }
    if (rt <= A.t) { this.cur = A.snap; return; }
    const t = (rt - A.t) / Math.max(1e-6, B.t - A.t);
    this.cur = interpSnap(A.snap, B.snap, t);
  }

  _event(ev, snap) {
    for (const f of this.listeners) { try { f(ev); } catch (e) { console.warn(e); } }
    if (this.audio) { try { this.audio.event(ev, snap); } catch (e) { /* ignore */ } }
    const rv = snap.rv;
    const y = (z) => { const s = this.track.surfaceY(z); return s == null ? rv.y : s; };
    switch (ev.type) {
      case EV.PED_HIT:
        this.fx.pop('pedHit', ev.x, y(ev.z), ev.z);
        this.fx.burst(ev.x, y(ev.z), ev.z, [1, 0.85, 0.3], 10);
        this.camRig.shake(0.25);
        break;
      case EV.CRASH: {
        const p = Math.min(1.5, ev.power ?? 0.6);
        this.fx.pop('crash', ev.x, y(ev.z), ev.z, { scale: 0.8 + p * 0.3 });
        this.rv.sparks(ev.x, y(ev.z), ev.z, p);
        this.camRig.shake(0.35 + p * 0.6);
        break;
      }
      case EV.SMASH:
        this.fx.pop('smash', ev.x, y(ev.z), ev.z, { scale: 0.85 });
        this.fx.burst(ev.x, y(ev.z), ev.z, [0.95, 0.9, 0.8], 12);
        this.camRig.shake(0.15);
        break;
      case EV.COP_WRECK:
        this.fx.pop('copWreck', ev.x, y(ev.z), ev.z);
        this.rv.sparks(ev.x, y(ev.z), ev.z, 1.2);
        this.camRig.shake(0.4);
        break;
      case EV.STOP_DONE:
        this.fx.markLooted(ev.id);
        if (this.structures) this.structures.markLooted(ev.id);
        break;
      case EV.LANDED:
        this.camRig.shake(ev.hard ? 1.2 : 0.55);
        this.rv.dustBurst(rv.x, rv.y, rv.z, ev.hard ? 34 : 18);
        if (ev.hard) this.fx.pop('landed', rv.x, rv.y, rv.z);
        break;
      case EV.FELL:
        this.camRig.shake(0.8);
        break;
      case EV.GADGET:
        if (ev.gadget === 'smoke') this._smokeBurst(ev.x ?? rv.x, ev.z ?? rv.z);
        if (ev.gadget === 'nitro') this.camRig.shake(0.2);
        break;
      default: break;
    }
    // expansion events (canister, roofHit, setpiece, …) also go to the effects layer
    try { this.fx?.event?.(ev, snap); } catch (e) { /* fx is best-effort */ }
  }

  _smokeBurst(x, z) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 5;
      this.particles.spawn({ x, y: 0.8, z, vx: Math.cos(a) * s, vy: 0.5 + Math.random() * 2, vz: Math.sin(a) * s, life: 1.6, size: 1.6, size1: 5, r: 0.9, g: 0.9, b: 0.88, alpha: 0.75, cell: ATLAS.PUFF, drag: 2.2 });
    }
  }

  _dustTarget(snap) {
    if (snap.weather === 'dust') return 1;
    if (snap.weather && snap.weather !== 'dust') return 0;
    const d = this.info.dust;
    if (!d) return 0;
    const z = snap.rv.z;
    const ramp = 45;
    if (z < d.from - ramp || z > d.to + ramp) return 0;
    const a = Math.min(1, (z - (d.from - ramp)) / ramp), b = Math.min(1, ((d.to + ramp) - z) / ramp);
    return Math.max(0, Math.min(a, b));
  }

  _dustParticles(dt, k, rv) {
    const cam = this.camera.position;
    this._dustAcc = (this._dustAcc || 0) + dt * 90 * k;
    while (this._dustAcc > 1) {
      this._dustAcc -= 1;
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 38;
      const x = cam.x + Math.cos(a) * r, z = cam.z + Math.sin(a) * r + Math.cos(rv.yaw) * 10;
      const big = Math.random() < 0.35;
      const c = 0.72 + Math.random() * 0.14;
      this.particles.spawn({
        x, y: Math.random() * 7, z, vx: -11 - Math.random() * 8, vy: (Math.random() - 0.3) * 1.2, vz: (Math.random() - 0.5) * 4,
        life: 1.2 + Math.random(), size: big ? 3 + Math.random() * 3 : 0.4, size1: big ? 6 : 0.5,
        r: c, g: c * 0.72, b: c * 0.46, alpha: big ? 0.35 * k : 0.7 * k, cell: big ? ATLAS.PUFF : ATLAS.SPARK, spin: 0,
        rot: big ? Math.random() * 6 : 0,
      });
    }
  }

  // fumes wobble (driver only, camera side) — vignette is the DOM overlay
  _fumes(dt, snap) {
    const f = (snap.lab && snap.lab.fumes) || 0;
    const k = this.role === 'driver' ? Math.max(0, (f - 0.6) / 0.4) : Math.max(0, (f - 0.75) / 0.25) * 0.4;
    this._fumesK = (this._fumesK || 0) + (k - (this._fumesK || 0)) * Math.min(1, dt * 2);
    const w = this._fumesK;
    if (w > 0.01) {
      this.camera.rotateZ(Math.sin(this.time * 1.7) * 0.025 * w);
      const fov = this.camera.fov + Math.sin(this.time * 2.3) * 2.5 * w;
      this.camera.fov = fov; this.camera.updateProjectionMatrix();
    }
  }

  // ── DOM overlay: fumes haze + cook's rear-window frame ────────────────────
  _overlay() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    const o = document.createElement('div');
    o.className = 'cr-view-overlay';
    o.style.cssText = 'position:absolute;pointer-events:none;overflow:hidden;z-index:1;';
    o.innerHTML = `
      <div class="cr-fumes" style="position:absolute;inset:0;opacity:0;
        background:radial-gradient(ellipse 75% 70% at 50% 50%, rgba(120,180,70,0) 35%, rgba(110,165,60,.46) 68%, rgba(55,100,30,.88) 100%)"></div>
      <div class="cr-fumes2" style="position:absolute;inset:-6%;opacity:0;
        background:radial-gradient(ellipse at 28% 62%, rgba(175,225,120,.28), rgba(175,225,120,0) 48%),
                   radial-gradient(ellipse at 72% 38%, rgba(150,215,110,.24), rgba(150,215,110,0) 44%),
                   radial-gradient(ellipse at 50% 85%, rgba(140,200,100,.2), rgba(140,200,100,0) 40%)"></div>
      <div class="cr-rear" style="position:absolute;inset:0;display:none">
        <svg viewBox="0 0 1600 900" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%">
          <defs>
            <linearGradient id="crWall" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#3b3631"/><stop offset="1" stop-color="#2a2622"/>
            </linearGradient>
            <linearGradient id="crGlass" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="rgba(255,255,255,.10)"/><stop offset=".35" stop-color="rgba(255,255,255,0)"/>
              <stop offset=".6" stop-color="rgba(255,255,255,.05)"/><stop offset="1" stop-color="rgba(0,0,0,.18)"/>
            </linearGradient>
            <mask id="crHole"><rect width="1600" height="900" fill="#fff"/><rect x="170" y="110" width="1260" height="600" rx="70" fill="#000"/></mask>
          </defs>
          <rect width="1600" height="900" fill="url(#crWall)" mask="url(#crHole)"/>
          <g mask="url(#crHole)" opacity=".5" stroke="#4a443d" stroke-width="3">
            <line x1="0" y1="770" x2="1600" y2="770"/><line x1="0" y1="830" x2="1600" y2="830"/>
            <line x1="120" y1="0" x2="120" y2="900"/><line x1="1480" y1="0" x2="1480" y2="900"/>
          </g>
          <rect x="170" y="110" width="1260" height="600" rx="70" fill="url(#crGlass)"/>
          <rect x="158" y="98" width="1284" height="624" rx="80" fill="none" stroke="#1d1a17" stroke-width="26"/>
          <rect x="170" y="110" width="1260" height="600" rx="70" fill="none" stroke="#6b6f72" stroke-width="5"/>
          <line x1="800" y1="110" x2="800" y2="710" stroke="#1d1a17" stroke-width="16"/>
          <g class="cr-curtL"><path d="M150 80 Q230 300 190 520 Q170 650 240 740 L120 740 L120 80 Z" fill="#9c4a32"/>
            <path d="M150 80 Q200 300 170 520 Q160 650 200 740" fill="none" stroke="#7a3826" stroke-width="10"/></g>
          <g class="cr-curtR"><path d="M1450 80 Q1370 300 1410 520 Q1430 650 1360 740 L1480 740 L1480 80 Z" fill="#9c4a32"/>
            <path d="M1450 80 Q1400 300 1430 520 Q1440 650 1400 740" fill="none" stroke="#7a3826" stroke-width="10"/></g>
          <rect x="110" y="70" width="1380" height="22" rx="6" fill="#5a5d62"/>
          <rect x="0" y="790" width="1600" height="110" fill="#2b2724"/>
          <rect x="0" y="782" width="1600" height="14" fill="#4f8f8a"/>
        </svg>
        <div class="cr-fresh" style="position:absolute;left:50%;top:13%;width:3.2%;height:16%;transform-origin:50% 0;">
          <svg viewBox="0 0 40 120" style="width:100%;height:100%"><line x1="20" y1="0" x2="20" y2="40" stroke="#ddd" stroke-width="2"/>
          <path d="M20 38 L36 70 L28 70 L38 92 L24 92 L24 104 L16 104 L16 92 L2 92 L12 70 L4 70 Z" fill="#4f8f8a" stroke="#22262a" stroke-width="2"/></svg>
        </div>
      </div>`;
    parent.appendChild(o);
    this.overlay = o;
    this.ovFumes = o.querySelector('.cr-fumes');
    this.ovFumes2 = o.querySelector('.cr-fumes2');
    this.ovRear = o.querySelector('.cr-rear');
    this.ovFresh = o.querySelector('.cr-fresh');
    this.ovCurtL = o.querySelector('.cr-curtL');
    this.ovCurtR = o.querySelector('.cr-curtR');
    this._fresh = { a: 0, v: 0 };
    this._updateOverlayMode();
  }
  _layoutOverlay() {
    if (!this.overlay) return;
    const c = this.canvas;
    const s = this.overlay.style;
    s.left = c.offsetLeft + 'px'; s.top = c.offsetTop + 'px';
    s.width = (c.clientWidth || this._w) + 'px'; s.height = (c.clientHeight || this._h) + 'px';
  }
  _updateOverlayMode() {
    if (!this.ovRear) return;
    this.ovRear.style.display = this.cameraMode === 'rear' && !this.cameraController ? 'block' : 'none';
    // main camera hides the RV body when sitting inside it
    if (this.cameraMode === 'rear') this.camera.layers.disable(RV_LAYER); else this.camera.layers.enable(RV_LAYER);
  }
  _overlayUpdate(dt, snap) {
    if (!this.overlay) return;
    this._layoutOverlay();
    const f = (snap.lab && snap.lab.fumes) || 0;
    const k = this.role === 'driver' && this.cameraMode !== 'rear' ? Math.max(0, Math.min(1, (f - 0.6) / 0.35)) : 0;
    const op = k > 0 ? (0.55 + 0.45 * Math.sin(this.time * 2.2) * 0.3) * k : 0;
    this.ovFumes.style.opacity = op.toFixed(3);
    this.ovFumes2.style.opacity = (k * 0.8).toFixed(3);
    if (k > 0) this.ovFumes2.style.transform = `translate(${Math.sin(this.time * 0.9) * 2}%, ${Math.cos(this.time * 0.7) * 2}%) scale(${1 + Math.sin(this.time * 1.3) * 0.03})`;
    if (this.cameraMode === 'rear') {
      const lat = (snap.feel && snap.feel.latAcc) || 0;
      const fr = this._fresh;
      fr.v += (-fr.a * 30 - fr.v * 2.2 + lat * 0.06 + ((snap.feel && snap.feel.bump) || 0) * (Math.random() - 0.5) * 6) * dt;
      fr.a += fr.v * dt;
      fr.a = Math.max(-0.8, Math.min(0.8, fr.a));
      this.ovFresh.style.transform = `rotate(${(fr.a * 57).toFixed(1)}deg)`;
      const closed = snap.lab && snap.lab.curtains;
      const cx = closed ? 260 : 0;
      this.ovCurtL.setAttribute('transform', `translate(${cx} 0)`);
      this.ovCurtR.setAttribute('transform', `translate(${-cx} 0)`);
    }
  }
}

// ── snapshot interpolation (cook side) ─────────────────────────────────────
function interpSnap(a, b, t) {
  const out = { ...b };
  if (a.rv && b.rv) {
    const ra = a.rv, rb = b.rv;
    out.rv = { ...rb, x: lerp(ra.x, rb.x, t), y: lerp(ra.y, rb.y, t), z: lerp(ra.z, rb.z, t), yaw: lerpAng(ra.yaw, rb.yaw, t),
      pitch: lerp(ra.pitch || 0, rb.pitch || 0, t), roll: lerp(ra.roll || 0, rb.roll || 0, t), speed: lerp(ra.speed, rb.speed, t), steer: lerp(ra.steer || 0, rb.steer || 0, t) };
    if (Math.hypot(rb.x - ra.x, rb.z - ra.z) > 60) out.rv = rb; // teleport
  }
  if (a.feel && b.feel) out.feel = { ...b.feel, latAcc: lerp(a.feel.latAcc || 0, b.feel.latAcc || 0, t), bump: Math.max(a.feel.bump || 0, b.feel.bump || 0) };
  if (a.ents && b.ents) {
    const m = new Map();
    for (const e of a.ents) m.set(e[0], e);
    out.ents = b.ents.map((eb) => {
      const ea = m.get(eb[0]);
      if (!ea || ea[1] !== eb[1]) return eb;
      if (Math.abs(eb[4] - ea[4]) > 40) return eb;
      return [eb[0], eb[1], lerp(ea[2], eb[2], t), lerp(ea[3], eb[3], t), lerp(ea[4], eb[4], t), lerpAng(ea[5], eb[5], t), eb[6], t < 0.5 ? ea[7] : eb[7]];
    });
  }
  out.events = [];
  return out;
}
