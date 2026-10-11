// ─────────────────────────────────────────────────────────────────────────────
// DEFEND client · the roof camera (view.setCameraController while the driver defends).
//   const cam = new RoofCam(view);
//   cam.yaw / cam.pitch            RV-local view direction (the crosshair); mouse moves them
//   cam.mode = 'hip' | 'ads' | 'scope'   over the shoulder · tight shoulder (revolver/shotgun RMB) · rifle scope
//   cam.climb = 0..1               the sim's climb: rises from the cab window to the shoulder pose
//   cam.kick(a) / cam.shake(a)     recoil (pitch up + push back) / hit shake
//   cam.eyeWorld(rv) → { eye, dir }   the centre ray the aim is cast along (same maths as update())
//   cam.onPosed = (camera, snap) => {}   called after the camera is placed (HUD projections)
//   update(dt, camera, snap)       (WorldView calls it inside render())
// RV-local frame: +Z front, +X left, y up; the RV anchor (view.rvAnchor) gives its world matrix.
// Over the right shoulder of Rook (pivot = his head on the stance), the eye clamps above the roof.
// Unity: a Cinemachine 3rd-person vcam on Rook + a scope vcam (FOV 13).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { ROOF_GEOM } from '../sim/roof.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const _eye = new THREE.Vector3(), _tgt = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _ce = new THREE.Vector3(), _ct = new THREE.Vector3();

export const PITCH_MIN = -1.15, PITCH_MAX = 0.5;
// RV-local poses
const PIVOT = { x: ROOF_GEOM.stance.x, y: ROOF_GEOM.roofY + 1.62, z: ROOF_GEOM.stance.z };
const CAB_EYE = { x: 0.62, y: 2.25, z: 3.05 };                    // the driver's eye in the cab (climb start)
const MODES = {
  hip: { dist: 3.7, shoulder: 1.05, lift: 0.42, fov: 60 },
  ads: { dist: 2.1, shoulder: 0.66, lift: 0.2, fov: 45 },
  scope: { dist: 0, shoulder: 0, lift: 0, fov: 13 },
};

export class RoofCam {
  constructor(view) {
    this.view = view;
    this.yaw = Math.PI; this.pitch = -0.18;
    this.mode = 'hip';
    this.blend = { dist: MODES.hip.dist, shoulder: MODES.hip.shoulder, lift: MODES.hip.lift, fov: MODES.hip.fov };
    this.climb = 1;
    this.kickA = 0; this.kickV = 0; this.shakeA = 0;
    this.sway = { x: 0, y: 0 };     // scope sway (rad), set by the client
    this.time = 0;
    this.onPosed = null;
  }
  kick(a = 0.03) { this.kickV += a * 9; }
  shake(a = 0.4) { this.shakeA = Math.min(1.2, this.shakeA + a); }

  _local(eye, target, rv = null) {
    const B = this.blend;
    const yaw = this.yaw, pitch = clamp(this.pitch + this.kickA + (this.mode === 'scope' ? this.sway.y : 0), PITCH_MIN - 0.1, PITCH_MAX + 0.1);
    const yw = yaw + (this.mode === 'scope' ? this.sway.x : 0);
    const cy = Math.cos(yw), sy = Math.sin(yw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const dx = sy * cp, dy = sp, dz = cy * cp, rx = -cy, rz = sy;   // forward + the right-hand side (−X at yaw 0)
    if (this.mode === 'scope' && B.dist < 0.05) {
      const M = ROOF_GEOM.muzzle;
      eye.set(M.x, M.y + 0.08, M.z);
    } else {
      eye.set(PIVOT.x - dx * B.dist + rx * B.shoulder, PIVOT.y - dy * B.dist + B.lift, PIVOT.z - dz * B.dist + rz * B.shoulder);
      eye.y = Math.max(eye.y, ROOF_GEOM.roofY + 0.9);
    }
    // climbing: from the cab window up to the shoulder pose
    const k = smooth(this.climb);
    if (k < 0.999) {
      eye.set(CAB_EYE.x + (eye.x - CAB_EYE.x) * k, CAB_EYE.y + (eye.y - CAB_EYE.y) * k, CAB_EYE.z + (eye.z - CAB_EYE.z) * k);
    }
    target.set(eye.x + dx * 20, eye.y + dy * 20, eye.z + dz * 20);
    if (k < 0.999) {
      // look toward the RV's front while still in the cab, turn to the aim as he comes up
      const fx = eye.x, fy = eye.y - 0.1, fz = eye.z + 20;
      target.set(fx + (target.x - fx) * k, fy + (target.y - fy) * k, fz + (target.z - fz) * k);
    }
    void rv;
  }

  /** World eye + unit direction of the crosshair ray (flat RV frame from the anchor). */
  eyeWorld() {
    const anchor = this.view.rvAnchor;
    if (!anchor) return null;
    anchor.updateWorldMatrix(true, false);
    this._local(_ce, _ct);
    _ce.applyMatrix4(anchor.matrixWorld); _ct.applyMatrix4(anchor.matrixWorld);
    const d = _ct.clone().sub(_ce).normalize();
    return { eye: { x: _ce.x, y: _ce.y, z: _ce.z }, dir: { x: d.x, y: d.y, z: d.z } };
  }

  update(dt, camera, snap) {
    const view = this.view;
    if (!view.rvAnchor) return;
    this.time += dt;
    // mode blend
    const M = MODES[this.mode] || MODES.hip, B = this.blend, k = 1 - Math.exp(-dt * (this.mode === 'scope' ? 30 : 12));
    for (const key of ['dist', 'shoulder', 'lift', 'fov']) B[key] += (M[key] - B[key]) * k;
    if (this.mode === 'scope') { B.dist = 0; B.shoulder = 0; B.lift = 0; }
    // recoil spring
    this.kickV += (-this.kickA * 90 - this.kickV * 14) * dt;
    this.kickA += this.kickV * dt;
    const anchor = view.rvAnchor;
    anchor.updateWorldMatrix(true, false);
    this._local(_eye, _tgt, snap && snap.rv);
    _eye.applyMatrix4(anchor.matrixWorld);
    _tgt.applyMatrix4(anchor.matrixWorld);
    _m.lookAt(_eye, _tgt, _up);
    _q.setFromRotationMatrix(_m);
    camera.position.copy(_eye);
    camera.quaternion.copy(_q);
    camera.up.set(0, 1, 0);
    // shake (hits, crashes)
    const rig = view.camRig;
    let sh = this.shakeA;
    if (rig && rig.shakeAmt > 0.001) { sh = Math.max(sh, rig.shakeAmt * 0.5); rig.shakeAmt = Math.max(0, rig.shakeAmt - dt * 2.2); }
    if (sh > 0.001) {
      const t = this.time * 41;
      camera.position.x += Math.sin(t * 1.1) * 0.05 * sh; camera.position.y += Math.sin(t * 1.7 + 1) * 0.045 * sh;
      this.shakeA = Math.max(0, this.shakeA - dt * 2.5);
    }
    const fov = B.fov, near = this.mode === 'scope' ? 0.3 : 0.1;
    if (Math.abs(camera.fov - fov) > 1e-3 || Math.abs(camera.near - near) > 1e-4) { camera.fov = fov; camera.near = near; camera.updateProjectionMatrix(); }
    camera.layers.enable(1);   // RV_LAYER: the RV body and Rook are drawn from up here
    camera.updateMatrixWorld();
    if (this.onPosed) { try { this.onPosed(camera, snap); } catch (e) { /* HUD layout is best-effort */ } }
  }
}
