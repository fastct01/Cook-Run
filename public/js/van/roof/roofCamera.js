// ─────────────────────────────────────────────────────────────────────────────
// RoofCamera — over-the-shoulder camera for Doc on the RV roof (Agent ROOF).
// Plugged in with view.setCameraController(cam); cam.update(dt, camera, snap) runs inside
// view.render() right after the RV pose update.
//
//  • Pose: behind Doc's right shoulder, orbiting a pivot above his head; yaw/pitch are RV-local
//    (yaw 0 = RV forward). The view direction IS the aim direction (crosshair at screen centre
//    in mouse-lock mode); the free-cursor mode aims at the cursor instead.
//  • Blends: blendIn(dur) eases from the dollhouse VanCamera pose to the roof pose (the climb),
//    blendOut(dur) back. The dollhouse pose is computed every frame by running the VanCamera on a
//    scratch camera, so the hand-over at either end is seamless. setK(k) drives it externally
//    (AI climbs follow snap.roof.climb).
// Unity: a Cinemachine 3rd-person follow vcam on a "RoofPivot" child of the RV + a blend to the lab vcam.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { ROOF_GEOM } from '../../sim/roof.js';

const G = ROOF_GEOM;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const _eye = new THREE.Vector3(), _tgt = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();

export const PITCH_MIN = -0.95, PITCH_MAX = 0.32;

export class RoofCamera {
  constructor(view, vanCam) {
    this.view = view;
    this.vanCam = vanCam;
    this.yaw = Math.PI;          // RV-local
    this.pitch = -0.22;
    this.dist = 3.6;
    this.shoulder = 0.85;
    this.fov = 60;
    this.k = 1;                  // 0 = dollhouse … 1 = roof
    this.mode = 'roof';          // 'roof' | 'in' | 'out' | 'ext'
    this.dur = 1.6;
    this.time = 0;
    this.kick = 0;               // throw recoil
    this._scratch = new THREE.PerspectiveCamera(50, 16 / 9, 0.25, 2600);
  }
  setAim(yaw, pitch) { this.yaw = yaw; this.pitch = clamp(pitch, PITCH_MIN, PITCH_MAX); }
  blendIn(dur = 1.6) { this.mode = 'in'; this.dur = Math.max(0.05, dur); if (this.k >= 0.999) this.k = 0; if (this.vanCam && this.vanCam.snap) this.vanCam.snap(); }
  blendOut(dur = 1.6) { this.mode = 'out'; this.dur = Math.max(0.05, dur); }
  setK(k) { this.mode = 'ext'; this.k = clamp(k, 0, 1); }
  get atRoof() { return this.k >= 0.999; }
  get atDoll() { return this.k <= 0.001; }

  /** RV-local eye + target for the current yaw/pitch. */
  localPose(eye, target) {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dx = sy * cp, dy = sp, dz = cy * cp, rx = -cy, rz = sy;
    const px = G.stance.x, py = G.roofY + 1.75, pz = G.stance.z;
    const d = this.dist * (1 + this.kick * 0.05);
    eye.set(px - dx * d + rx * this.shoulder, py - dy * d + 0.3, pz - dz * d + rz * this.shoulder);
    eye.y = Math.max(eye.y, G.roofY + 0.95);
    target.set(eye.x + dx * 10, eye.y + dy * 10, eye.z + dz * 10);
  }

  update(dt, camera, snap) {
    const view = this.view, rv = view.rv;
    if (!rv || !view.rvAnchor) return;
    this.time += dt;
    this.kick = Math.max(0, this.kick - dt * 4);
    if (this.mode === 'in') { this.k = Math.min(1, this.k + dt / this.dur); if (this.k >= 1) this.mode = 'roof'; }
    else if (this.mode === 'out') this.k = Math.max(0, this.k - dt / this.dur);
    const anchor = view.rvAnchor;
    anchor.updateWorldMatrix(true, false);
    this.localPose(_eye, _tgt);
    _eye.applyMatrix4(anchor.matrixWorld);
    _tgt.applyMatrix4(anchor.matrixWorld);
    _m.lookAt(_eye, _tgt, _up);
    _q.setFromRotationMatrix(_m);
    const w = smooth(this.k);
    if (w < 0.999 && this.vanCam) {
      const s = this._scratch;
      s.aspect = camera.aspect;
      this.vanCam.update(dt, s, snap);
      camera.position.copy(s.position).lerp(_eye, w);
      camera.quaternion.copy(s.quaternion).slerp(_q, w);
      const fov = s.fov + (this.fov - s.fov) * w;
      const near = (s.near || 0.25) + (0.25 - (s.near || 0.25)) * w;   // the van cam's cut-away near plane → normal
      if (Math.abs(camera.fov - fov) > 1e-3 || Math.abs(camera.near - near) > 1e-3) { camera.fov = fov; camera.near = near; camera.updateProjectionMatrix(); }
    } else {
      camera.position.copy(_eye);
      camera.quaternion.copy(_q);
      if (Math.abs(camera.fov - this.fov) > 1e-3 || camera.near !== 0.25) { camera.fov = this.fov; camera.near = 0.25; camera.updateProjectionMatrix(); }
    }
    camera.up.set(0, 1, 0);
    // world shake (crash / landing) — reduced
    const rig = view.camRig;
    if (rig && rig.shakeAmt > 0.001 && w > 0.5) {
      const a = rig.shakeAmt * 0.5, t = this.time * 38;
      camera.position.x += Math.sin(t * 1.1) * 0.08 * a; camera.position.y += Math.sin(t * 1.7 + 1) * 0.07 * a;
      rig.shakeAmt = Math.max(0, rig.shakeAmt - dt * 2.2);
    }
    camera.updateMatrixWorld();
  }
}
