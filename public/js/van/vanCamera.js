// ─────────────────────────────────────────────────────────────────────────────
// vanCamera — the cook's camera in the van: first person (Round 3 default), the "dollhouse" overview over the
// cut-away van, and station close-ups. Plugged into WorldView via view.setCameraController(cam):
// cam.update(dt, camera, snap) is called inside view.render() right after the RV pose is updated.
//
//  • First person ('fp', [R3-DOCFP]): VanLab3D sets cam.fp = { pos (van-local eye), yaw, pitch, roll, fov } every
//    frame (Doc's head + mouse look + his damped sway). The camera is rigid with the van (the interior stays put
//    on screen, the road moves through the windows); world shake is scaled by cam.comfort. Near plane 0.06 m
//    (the gloved hands sit ~0.35 m in front of the eye). The cut-away clip is off.
//  • Overview ('overview'): van.json camera.dollhouse {pos, target, fov} in VAN-LOCAL space, carried by the van's
//    position exactly, its yaw lightly damped and only ~30 % of its pitch/roll (damped) so bumps don't shake the
//    picture. Mouse-wheel zoom levels (camera.zoomLevels). The near walls are cut low; Cutaway clips roofs.
//  • Close-up: setFocus(anchor, pose) with pose {pos, target, fov} in ANCHOR space (from the presenter's
//    camera()); eases in over ~0.5 s and becomes rigid with the van. setFocus(null) eases back out to the mode.
// Unity: a Cinemachine brain with three virtual cameras (FP: hard-locked to Doc's head bone with POV aim;
// overview: Transposer on the RV with damping; close-up: hard-locked to the station anchor), 0.5 s blends.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Cutaway } from './cutaway.js';

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qI = new THREE.Quaternion();
const _e = new THREE.Euler(), _v = new THREE.Vector3(), _p = new THREE.Vector3(), _t = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3(), _up = new THREE.Vector3(), _vu = new THREE.Vector3();
const NEAR_MIN = 0.25, NEAR_MAX = 14;   // near-plane cut-away range (m)
export const NEAR_FP = 0.06;
const smooth = (t) => t * t * (3 - 2 * t);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export const FALLBACK_CLOSEUP = Object.freeze({ pos: { x: 0.34, y: 0.86, z: 0.95 }, target: { x: 0.0, y: -0.04, z: -0.3 }, fov: 46 });

/** Van-local unit view direction for a first-person yaw/pitch (yaw 0 = +Z front, forward = (sin yaw, ·, cos yaw)). */
export function fpDir(yaw, pitch, out = new THREE.Vector3()) {
  const c = Math.cos(pitch);
  return out.set(Math.sin(yaw) * c, Math.sin(pitch), Math.cos(yaw) * c);
}

export class VanCamera {
  constructor(view, interior, van) {
    this.view = view;
    this.it = interior;
    const c = van.camera || {};
    const d = c.dollhouse || { pos: { x: -6.0, y: 9.2, z: -0.7 }, target: { x: 0.25, y: 0.4, z: -2.8 }, fov: 50 };
    this.doll = { pos: new THREE.Vector3(d.pos.x, d.pos.y, d.pos.z), target: new THREE.Vector3(d.target.x, d.target.y, d.target.z), fov: d.fov || 50 };
    this.zoomLevels = c.zoomLevels && c.zoomLevels.length ? c.zoomLevels.slice() : [0.75, 1, 1.35];
    this.zoomIdx = Math.max(0, this.zoomLevels.indexOf(1));
    this.zoom = this.zoomLevels[this.zoomIdx];
    this.yaw = null;
    this.tilt = new THREE.Quaternion();
    // current pose in van-local space (what we blend from on focus / mode changes)
    this.cur = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: this.doll.fov, rigid: 0, upMix: 0, roll: 0 };
    this.from = null;            // { pos, target, fov, rigid, upMix, roll } van-local, at the start of a transition
    this.blend = 1;              // 0..1 progress of the current transition
    this.focus = null;           // { anchor, pose } or null
    this.dur = 0.5;
    this.first = true;
    this.shake = 0;
    this.time = 0;
    this.follow = null;          // { x, z } van-local point to drift toward when zoomed in (Doc)
    // [R3-DOCFP] first person
    this.mode = 'overview';
    this.fp = { pos: new THREE.Vector3(0, 2.34, 0), yaw: Math.PI, pitch: -0.1, roll: 0, fov: 72 };
    this.comfort = 0.5;          // 0..1 scale on world shake in first person (VanLab3D sets it from the comfort flag)
  }

  // ── controls ───────────────────────────────────────────────────────────────
  zoomBy(dir) {
    this.zoomIdx = Math.max(0, Math.min(this.zoomLevels.length - 1, this.zoomIdx + (dir > 0 ? 1 : -1)));
    return this.zoomLevels[this.zoomIdx];
  }
  setZoomIndex(i) { this.zoomIdx = Math.max(0, Math.min(this.zoomLevels.length - 1, i | 0)); }
  _startBlend(dur = 0.5) {
    this.from = { pos: this.cur.pos.clone(), target: this.cur.target.clone(), fov: this.cur.fov, rigid: this.cur.rigid, upMix: this.cur.upMix, roll: this.cur.roll };
    this.blend = 0;
    this.dur = dur;
  }
  /** anchor: Object3D (child of the interior root); pose {pos, target, fov} in anchor space, or null to go back to the mode's view. */
  setFocus(anchor, pose) {
    const next = anchor ? { anchor, pose: pose || FALLBACK_CLOSEUP } : null;
    const same = (this.focus && next && this.focus.anchor === next.anchor) || (!this.focus && !next);
    if (same) { if (next) this.focus.pose = next.pose; return; }
    this._startBlend(0.5);
    this.focus = next;
  }
  /** [R3-DOCFP] 'fp' | 'overview'. snap → no blend (e.g. at activation). */
  setMode(mode, { snap = false } = {}) {
    mode = mode === 'fp' ? 'fp' : 'overview';
    if (mode === this.mode) return;
    this.mode = mode;
    if (snap || this.first) this.first = true;
    else if (!this.focus) this._startBlend(0.6);
    if (mode === 'fp') this.cut?.disable();
  }
  get inCloseUp() { return !!this.focus && this.blend > 0.6; }
  snap() { this.first = true; }

  // van-local pose of the dollhouse view (zoom scales the offset from the target)
  _dollPose(out) {
    const z = this.zoom = this.zoomLevels[this.zoomIdx] ?? 1;
    out.target.copy(this.doll.target);
    // zoomed in: drift the look-at toward Doc (follow point, van-local) so he stays in frame
    if (this.follow && z < 0.999) {
      const k = Math.min(1, (1 - z) / 0.3) * 0.75;
      out.target.x += (this.follow.x * 0.5 - out.target.x) * k;
      out.target.z += (this.follow.z - out.target.z) * k;
    }
    out.pos.copy(this.doll.pos).sub(this.doll.target).multiplyScalar(z).add(out.target);
    out.fov = this.doll.fov;
    out.rigid = 0; out.upMix = 0; out.roll = 0;
    return out;
  }
  _fpPose(out) {
    const f = this.fp;
    out.pos.copy(f.pos);
    out.target.copy(fpDir(f.yaw, f.pitch, _v)).add(f.pos);
    out.fov = f.fov || 72;
    out.rigid = 1; out.upMix = 1; out.roll = f.roll || 0;
    return out;
  }
  _closePose(out) {
    const a = this.focus.anchor, p = this.focus.pose;
    a.updateMatrix();
    out.pos.set(p.pos.x, p.pos.y, p.pos.z).applyMatrix4(a.matrix);
    out.target.set(p.target.x, p.target.y, p.target.z).applyMatrix4(a.matrix);
    out.fov = p.fov || 46;
    out.rigid = 1; out.upMix = this.mode === 'fp' ? 1 : 0; out.roll = 0;
    return out;
  }

  // ── per frame (called by WorldView.render) ────────────────────────────────
  update(dt, camera, snap) {
    const rv = this.view.rv;
    if (!rv) return;
    this.time += dt;
    const fpMode = this.mode === 'fp';
    // where we're heading (van-local)
    const goal = this._goal || (this._goal = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50, rigid: 0, upMix: 0, roll: 0 });
    if (this.focus) this._closePose(goal); else if (fpMode) this._fpPose(goal); else this._dollPose(goal);
    if (this.first) { this.from = null; this.blend = 1; }
    if (this.blend < 1) this.blend = Math.min(1, this.blend + dt / this.dur);
    const e = smooth(this.blend);
    const C = this.cur;
    if (this.from && e < 1) {
      C.pos.copy(this.from.pos).lerp(goal.pos, e);
      C.target.copy(this.from.target).lerp(goal.target, e);
      C.fov = this.from.fov + (goal.fov - this.from.fov) * e;
      C.rigid = this.from.rigid + (goal.rigid - this.from.rigid) * e;
      C.upMix = this.from.upMix + (goal.upMix - this.from.upMix) * e;
      C.roll = this.from.roll + (goal.roll - this.from.roll) * e;
    } else {
      if (!this.focus && !fpMode && !this.first) {
        // zoom eases on its own
        const k = 1 - Math.exp(-dt * 6);
        C.pos.lerp(goal.pos, k); C.target.lerp(goal.target, k);
        C.fov += (goal.fov - C.fov) * k; C.rigid = goal.rigid; C.upMix = goal.upMix; C.roll = goal.roll;
      } else {
        C.pos.copy(goal.pos); C.target.copy(goal.target); C.fov = goal.fov; C.rigid = goal.rigid; C.upMix = goal.upMix; C.roll = goal.roll;
      }
      this.from = null;
    }
    const rigid = C.rigid;
    // carrier frame: exact position, damped yaw, partial damped tilt (fully rigid in first person / close-ups)
    const yawNow = rv.outer.rotation.y;
    if (this.yaw == null || this.first) this.yaw = yawNow;
    this.yaw += wrap(yawNow - this.yaw) * (1 - Math.exp(-dt * 7));
    const yaw = this.yaw + wrap(yawNow - this.yaw) * rigid;
    _e.set(rv.tilt.rotation.x, 0, rv.tilt.rotation.z, 'YXZ');
    _q.setFromEuler(_e);
    const amt = 0.3 + 0.7 * rigid;
    _qI.identity().slerp(_q, amt);
    if (this.first || rigid >= 0.999) this.tilt.copy(_qI); else this.tilt.slerp(_qI, Math.min(1, dt * (3 + 20 * rigid)));
    const H = -rv.anchor.position.y;
    // M = T(outer.pos) · Ry(yaw) · T(0, tiltY, 0) · R(tilt) · T(0, −H, 0)
    _m.makeRotationY(yaw).setPosition(rv.outer.position);
    _m2.makeTranslation(0, rv.tilt.position.y, 0); _m.multiply(_m2);
    _m2.makeRotationFromQuaternion(this.tilt); _m.multiply(_m2);
    _m2.makeTranslation(0, -H, 0); _m.multiply(_m2);
    _p.copy(C.pos).applyMatrix4(_m);
    _t.copy(C.target).applyMatrix4(_m);
    camera.position.copy(_p);
    // up: world up for the overview; the van's own up (+ Doc's sway roll) in first person
    _vu.set(0, 1, 0).transformDirection(_m);
    _up.set(0, 1, 0).lerp(_vu, C.upMix).normalize();
    camera.up.copy(_up);
    camera.lookAt(_t);
    if (Math.abs(C.roll) > 1e-5) camera.rotateZ(C.roll);
    // shake from world events (crash/landing): reduced in the overview, comfort-scaled in first person, none in close-ups
    const rig = this.view.camRig;
    if (rig && rig.shakeAmt > 0.001) {
      const closeK = this.focus ? 1 - smooth(this.blend) : 1;
      const a = rig.shakeAmt * (fpMode ? 0.35 * this.comfort * closeK : (1 - rigid) * 0.6);
      const t = this.time * 38;
      camera.position.x += (Math.sin(t * 1.1) + Math.sin(t * 2.3) * 0.5) * 0.12 * a;
      camera.position.y += (Math.sin(t * 1.7 + 1) + Math.sin(t * 3.1) * 0.4) * 0.1 * a;
      camera.rotateZ(Math.sin(t * 1.3) * 0.012 * a);
      rig.shakeAmt = Math.max(0, rig.shakeAmt - dt * 2.2);
    }
    let near;
    if (fpMode) near = NEAR_FP;
    else {
      // cut-away: anything between the camera and the van (the garage roof, a shop wall beside a supply-stop
      // lot, a tight city street) is clipped by pulling the near plane up to just in front of the van's box.
      camera.getWorldDirection(_dir);
      let dMin = Infinity;
      for (let i = 0; i < 8; i++) {
        _v.set(i & 1 ? 1.45 : -1.45, i & 2 ? 3.3 : 0.1, i & 4 ? 4.5 : -4.5).applyMatrix4(_m);
        const d = _v.sub(camera.position).dot(_dir);
        if (d < dMin) dMin = d;
      }
      near = Math.max(NEAR_MIN, Math.min(NEAR_MAX, dMin - 0.9));
    }
    const nearChanged = Math.abs(camera.near - near) > 0.005;
    if (nearChanged) camera.near = near;
    if (nearChanged || Math.abs(camera.fov - C.fov) > 0.001) { camera.fov = C.fov; camera.updateProjectionMatrix(); }
    // …and the roof / walls beyond that (garage roof, a shop's overhang at a supply stop) — overview only
    if (fpMode) { if (this.cut) this.cut.disable(); }
    else {
      if (!this.cut) { this.cut = new Cutaway(this.view); this.cut.setOwner(this); }
      this.cut.update(_m, C.pos, dt);
    }
    this.first = false;
    this.worldMatrix = _m;
  }

  /** Camera screen axes projected on the van floor, in van-local XZ: { rx, rz, fx, fz }. */
  floorBasis(camera) {
    const rv = this.view.rv;
    if (!rv) return { rx: 1, rz: 0, fx: 0, fz: 1 };
    rv.anchor.updateWorldMatrix(true, false);
    _m.copy(rv.anchor.matrixWorld).invert();
    _v.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const r = _v.clone().transformDirection(_m);
    _v.set(0, 1, 0).applyQuaternion(camera.quaternion);           // screen up
    const u = _v.clone().transformDirection(_m);
    _v.set(0, 0, -1).applyQuaternion(camera.quaternion);          // view dir
    const f = _v.clone().transformDirection(_m);
    // "up on screen" on the floor = the view direction flattened (or screen-up when looking straight down)
    let fx = f.x, fz = f.z;
    if (Math.hypot(fx, fz) < 0.2) { fx = u.x; fz = u.z; }
    void _Y;
    return { rx: r.x, rz: r.z, fx, fz };
  }
}
