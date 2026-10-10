// ─────────────────────────────────────────────────────────────────────────────
// vanCamera — the cook's "dollhouse" camera over the cut-away van + station close-ups.
// Plugged into WorldView via view.setCameraController(cam): cam.update(dt, camera, snap)
// is called inside view.render() right after the RV pose is updated.
//
//  • Dollhouse: van.json camera.dollhouse {pos, target, fov} in VAN-LOCAL space, carried by
//    the van's position exactly, its yaw lightly damped and only ~30 % of its pitch/roll
//    (damped) so bumps don't shake the picture. Mouse-wheel zoom levels (camera.zoomLevels).
//    The framing sits on the −X side looking back across the van, so the road behind (chasing
//    cops) stays in view; the near walls are cut low so the camera never clips geometry.
//  • Close-up: setFocus(anchor, pose) with pose {pos, target, fov} in ANCHOR space (from the
//    presenter's camera()); eases in over ~0.5 s and becomes rigid with the van (the work
//    surface stays still on screen). setFocus(null) eases back out.
// Unity: a Cinemachine brain with two virtual cameras (dollhouse: Transposer on the RV with
// damping; close-up: hard-locked to the station anchor) and a 0.5 s EaseInOut blend.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Cutaway } from './cutaway.js';

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qI = new THREE.Quaternion();
const _e = new THREE.Euler(), _v = new THREE.Vector3(), _p = new THREE.Vector3(), _t = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const NEAR_MIN = 0.25, NEAR_MAX = 14;   // near-plane cut-away range (m)
const smooth = (t) => t * t * (3 - 2 * t);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export const FALLBACK_CLOSEUP = Object.freeze({ pos: { x: 0.34, y: 0.86, z: 0.95 }, target: { x: 0.0, y: -0.04, z: -0.3 }, fov: 46 });

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
    // current pose in van-local space (what we blend from on focus changes)
    this.cur = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: this.doll.fov, rigid: 0 };
    this.from = null;            // { pos, target, fov, rigid } van-local, at the start of a transition
    this.blend = 1;              // 0..1 progress of the current transition
    this.focus = null;           // { anchor, pose } or null
    this.dur = 0.5;
    this.first = true;
    this.shake = 0;
    this.time = 0;
    this.follow = null;          // { x, z } van-local point to drift toward when zoomed in (Doc)
  }

  // ── controls ───────────────────────────────────────────────────────────────
  zoomBy(dir) {
    this.zoomIdx = Math.max(0, Math.min(this.zoomLevels.length - 1, this.zoomIdx + (dir > 0 ? 1 : -1)));
    return this.zoomLevels[this.zoomIdx];
  }
  setZoomIndex(i) { this.zoomIdx = Math.max(0, Math.min(this.zoomLevels.length - 1, i | 0)); }
  /** anchor: Object3D (child of the interior root); pose {pos, target, fov} in anchor space, or null to go back to the dollhouse. */
  setFocus(anchor, pose) {
    const next = anchor ? { anchor, pose: pose || FALLBACK_CLOSEUP } : null;
    const same = (this.focus && next && this.focus.anchor === next.anchor) || (!this.focus && !next);
    if (same) { if (next) this.focus.pose = next.pose; return; }
    this.from = { pos: this.cur.pos.clone(), target: this.cur.target.clone(), fov: this.cur.fov, rigid: this.cur.rigid };
    this.blend = 0;
    this.focus = next;
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
    out.rigid = 0;
    return out;
  }
  _closePose(out) {
    const a = this.focus.anchor, p = this.focus.pose;
    a.updateMatrix();
    out.pos.set(p.pos.x, p.pos.y, p.pos.z).applyMatrix4(a.matrix);
    out.target.set(p.target.x, p.target.y, p.target.z).applyMatrix4(a.matrix);
    out.fov = p.fov || 46;
    out.rigid = 1;
    return out;
  }

  // ── per frame (called by WorldView.render) ────────────────────────────────
  update(dt, camera, snap) {
    const rv = this.view.rv;
    if (!rv) return;
    this.time += dt;
    // where we're heading (van-local)
    const goal = this._goal || (this._goal = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50, rigid: 0 });
    if (this.focus) this._closePose(goal); else this._dollPose(goal);
    if (this.first) { this.from = null; this.blend = 1; }
    // smooth zoom changes too
    if (this.blend < 1) this.blend = Math.min(1, this.blend + dt / this.dur);
    const e = smooth(this.blend);
    if (this.from && e < 1) {
      this.cur.pos.copy(this.from.pos).lerp(goal.pos, e);
      this.cur.target.copy(this.from.target).lerp(goal.target, e);
      this.cur.fov = this.from.fov + (goal.fov - this.from.fov) * e;
      this.cur.rigid = this.from.rigid + (goal.rigid - this.from.rigid) * e;
    } else {
      if (!this.focus && !this.first) {
        // zoom eases on its own
        const k = 1 - Math.exp(-dt * 6);
        this.cur.pos.lerp(goal.pos, k); this.cur.target.lerp(goal.target, k);
        this.cur.fov += (goal.fov - this.cur.fov) * k; this.cur.rigid = goal.rigid;
      } else {
        this.cur.pos.copy(goal.pos); this.cur.target.copy(goal.target); this.cur.fov = goal.fov; this.cur.rigid = goal.rigid;
      }
      this.from = null;
    }
    const rigid = this.cur.rigid;
    // carrier frame: exact position, damped yaw, partial damped tilt
    const yawNow = rv.outer.rotation.y;
    if (this.yaw == null || this.first) this.yaw = yawNow;
    this.yaw += wrap(yawNow - this.yaw) * (1 - Math.exp(-dt * 7));
    const yaw = this.yaw + wrap(yawNow - this.yaw) * rigid;
    _e.set(rv.tilt.rotation.x, 0, rv.tilt.rotation.z, 'YXZ');
    _q.setFromEuler(_e);
    const amt = 0.3 + 0.7 * rigid;
    _qI.identity().slerp(_q, amt);
    if (this.first) this.tilt.copy(_qI); else this.tilt.slerp(_qI, Math.min(1, dt * (3 + 20 * rigid)));
    const H = -rv.anchor.position.y;
    // M = T(outer.pos) · Ry(yaw) · T(0, tiltY, 0) · R(tilt) · T(0, −H, 0)
    _m.makeRotationY(yaw).setPosition(rv.outer.position);
    _m2.makeTranslation(0, rv.tilt.position.y, 0); _m.multiply(_m2);
    _m2.makeRotationFromQuaternion(this.tilt); _m.multiply(_m2);
    _m2.makeTranslation(0, -H, 0); _m.multiply(_m2);
    _p.copy(this.cur.pos).applyMatrix4(_m);
    _t.copy(this.cur.target).applyMatrix4(_m);
    camera.position.copy(_p);
    camera.up.set(0, 1, 0);
    camera.lookAt(_t);
    // shake from world events (crash/landing), reduced; none in close-ups
    const rig = this.view.camRig;
    if (rig && rig.shakeAmt > 0.001) {
      const a = rig.shakeAmt * (1 - rigid) * 0.6;
      const t = this.time * 38;
      camera.position.x += (Math.sin(t * 1.1) + Math.sin(t * 2.3) * 0.5) * 0.12 * a;
      camera.position.y += (Math.sin(t * 1.7 + 1) + Math.sin(t * 3.1) * 0.4) * 0.1 * a;
      camera.rotateZ(Math.sin(t * 1.3) * 0.012 * a);
      rig.shakeAmt = Math.max(0, rig.shakeAmt - dt * 2.2);
    }
    // cut-away: anything between the camera and the van (the garage roof, a shop wall beside a supply-stop
    // lot, a tight city street) is clipped by pulling the near plane up to just in front of the van's box.
    camera.getWorldDirection(_dir);
    let dMin = Infinity;
    for (let i = 0; i < 8; i++) {
      _v.set(i & 1 ? 1.45 : -1.45, i & 2 ? 3.3 : 0.1, i & 4 ? 4.5 : -4.5).applyMatrix4(_m);
      const d = _v.sub(camera.position).dot(_dir);
      if (d < dMin) dMin = d;
    }
    const near = Math.max(NEAR_MIN, Math.min(NEAR_MAX, dMin - 0.9));
    const nearChanged = Math.abs(camera.near - near) > 0.02;
    if (nearChanged) camera.near = near;
    if (nearChanged || Math.abs(camera.fov - this.cur.fov) > 0.001) { camera.fov = this.cur.fov; camera.updateProjectionMatrix(); }
    // …and the roof / walls beyond that (garage roof, a shop's overhang at a supply stop)
    if (!this.cut) { this.cut = new Cutaway(this.view); this.cut.setOwner(this); }
    this.cut.update(_m, this.cur.pos, dt);
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
