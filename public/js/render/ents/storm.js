// ─────────────────────────────────────────────────────────────────────────────
// Storm light near the tornado: darkens + tints fog, background, sun and sky.
//
// Preferred path: an environment hook — if `scene.userData.env.setStorm(k, color)`
// exists (VIEW-WORLD-A's Environment), we call it and do nothing else.
// Fallback (no hook): we patch the frame right before it is drawn via
// scene.onBeforeRender (after env.update() has set this frame's values), and
// restore the originals in scene.onAfterRender, so env's own smoothing never sees
// our changes and render-target passes (mirrors) don't compound them. A dark
// translucent dome far out around the camera tints the sky.
//
//   const storm = new StormLight(scene); storm.set(k 0..1); storm.dispose();
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const STORM_FOG = new THREE.Color('#544a40');
const STORM_HEMI = new THREE.Color('#9a8f80');

export class StormLight {
  constructor(scene) {
    this.scene = scene;
    this.k = 0; this.target = 0;
    this.saved = null;
    // dark overhead, lighter band at the horizon (so the funnel reads against it)
    this.domeU = { uK: { value: 0 }, uCol: { value: new THREE.Color('#2a251f') } };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), new THREE.ShaderMaterial({
      uniforms: this.domeU, transparent: true, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uK; uniform vec3 uCol; varying vec3 vDir; void main() { float a = uK * mix(0.18, 0.78, smoothstep(0.0, 0.42, vDir.y)); gl_FragColor = vec4(uCol, a); \n#include <colorspace_fragment>\n }',
    }));
    this.dome.scale.setScalar(1500);
    this.dome.renderOrder = -9;
    this.dome.frustumCulled = false;
    this.dome.visible = false;
    scene.add(this.dome);
    const prevB = scene.onBeforeRender, prevA = scene.onAfterRender;
    this._prevB = prevB; this._prevA = prevA;
    scene.onBeforeRender = (renderer, sc, camera, rt) => { if (prevB) prevB.call(sc, renderer, sc, camera, rt); this._before(camera); };
    scene.onAfterRender = (renderer, sc, camera) => { this._after(); if (prevA) prevA.call(sc, renderer, sc, camera); };
  }
  /** Storm strength 0..1 (smoothed internally). */
  set(k) { this.target = Math.max(0, Math.min(1, k || 0)); }
  update(dt) { this.k += (this.target - this.k) * Math.min(1, dt * 1.2); if (this.k < 0.002 && this.target === 0) this.k = 0; }

  _hook() { const env = this.scene.userData && this.scene.userData.env; return env && typeof env.setStorm === 'function' ? env : null; }
  _before(camera) {
    const k = this.k;
    const env = this._hook();
    if (env) { try { env.setStorm(k, STORM_FOG); } catch (e) { /* ignore */ } this.dome.visible = false; return; }
    this.dome.visible = k > 0.01;
    if (!(k > 0.01)) return;
    this.dome.position.copy(camera.position);
    this.dome.updateMatrixWorld();            // world matrices were computed before onBeforeRender
    this.domeU.uK.value = k;
    const sc = this.scene;
    if (!this.lights) { this.lights = []; sc.traverse((o) => { if (o.isDirectionalLight || o.isHemisphereLight) this.lights.push(o); }); }
    if (!this.saved) {
      this.saved = { fog: sc.fog ? { c: sc.fog.color.clone(), n: sc.fog.near, f: sc.fog.far } : null, bg: sc.background && sc.background.isColor ? sc.background.clone() : null,
        lights: this.lights.map((l) => ({ l, i: l.intensity, c: l.color.clone() })) };
    }
    const s = this.saved;
    if (sc.fog && s.fog) { sc.fog.color.copy(s.fog.c).lerp(STORM_FOG, 0.8 * k); sc.fog.near = s.fog.n * (1 - 0.35 * k); sc.fog.far = s.fog.f * (1 - 0.25 * k); }
    if (s.bg && sc.background && sc.background.isColor) sc.background.copy(s.bg).lerp(STORM_FOG, 0.8 * k);
    for (const e of s.lights) {
      if (e.l.isDirectionalLight) e.l.intensity = e.i * (1 - 0.65 * k);
      else { e.l.intensity = e.i * (1 - 0.35 * k); e.l.color.copy(e.c).lerp(STORM_HEMI, 0.55 * k); }
    }
  }
  _after() {
    const s = this.saved;
    if (!s) return;
    const sc = this.scene;
    if (sc.fog && s.fog) { sc.fog.color.copy(s.fog.c); sc.fog.near = s.fog.n; sc.fog.far = s.fog.f; }
    if (s.bg && sc.background && sc.background.isColor) sc.background.copy(s.bg);
    for (const e of s.lights) { e.l.intensity = e.i; e.l.color.copy(e.c); }
    this.saved = null;
  }
  dispose() {
    this.dome.removeFromParent(); this.dome.geometry.dispose(); this.dome.material.dispose();
    this.scene.onBeforeRender = this._prevB || function () {};
    this.scene.onAfterRender = this._prevA || function () {};
  }
}
