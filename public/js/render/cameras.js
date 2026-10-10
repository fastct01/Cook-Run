// ─────────────────────────────────────────────────────────────────────────────
// Cameras.
//  'chase'     – smooth follow ~13 m behind / ~6 m above, looks ahead along the
//                road, leans into turns, FOV widens with speed, screen shake;
//                while airborne it blends into a three-quarter side angle.
//  'rear'      – cook's view: inside the RV at the rear window looking BACK down
//                the road (window-frame overlay is a DOM element, see WorldView).
//  'cinematic' – manual: setCinematic({ pos, target, fov }) or a slow orbit.
//  'wreck'     – the RV blew up: setWreck({ x, y, z, yaw }) — starts close behind-left, pulls back
//                and up over ~3 s while slowly orbiting, framing the wreck and its smoke column.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3();
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const dampV = (v, t, k, dt) => v.lerp(t, 1 - Math.exp(-k * dt));
const smooth = (t) => t * t * (3 - 2 * t);

export class CameraRig {
  constructor(camera, track) {
    this.camera = camera;
    this.track = track;
    this.mode = 'chase';
    this.pos = new THREE.Vector3(0, 6, -13);
    this.look = new THREE.Vector3(0, 1.5, 10);
    this.fov = 62;
    this.baseFov = 62;
    this.shakeAmt = 0;
    this.shakeT = 0;
    this.lean = 0;
    this.air = 0;          // 0..1 blend into the airborne cinematic angle
    this.airSide = 1;
    this.camYaw = null;
    this.cin = { pos: new THREE.Vector3(20, 8, 0), target: new THREE.Vector3(), fov: 50, orbit: true, t: 0 };
    this.first = true;
    this.bob = 0; this.bobV = 0;
    this.time = 0;
    this.rearRoll = 0;
  }

  setMode(m) {
    if (m === this.mode) return;
    this.mode = m;
    this.first = true;
  }
  shake(amount) { this.shakeAmt = Math.min(1.6, Math.max(this.shakeAmt, amount)); }
  setWreck({ x = 0, y = 0, z = 0, yaw = 0 } = {}) {
    this.wreck = { x, y, z, yaw, t: 0 };
    this.mode = 'wreck';
    this.first = true;
  }
  setCinematic({ pos, target, fov, orbit } = {}) {
    if (pos) this.cin.pos.copy(pos);
    if (target) this.cin.target.copy(target);
    if (fov) this.cin.fov = fov;
    this.cin.orbit = orbit ?? (!pos);
  }

  // rv: {x,y,z,yaw,pitch,roll,speed,airborne,nitro}; feel: {bump, latAcc}
  update(dt, rv, feel = {}) {
    this.time += dt;
    const cam = this.camera;
    if (!rv) return;
    const fwdX = Math.sin(rv.yaw), fwdZ = Math.cos(rv.yaw);
    if (this.mode === 'rear') return this._rear(dt, rv, feel);
    if (this.mode === 'cinematic') return this._cinematic(dt, rv);
    if (this.mode === 'wreck' && this.wreck) return this._wreckCam(dt, rv);

    // ── chase ──
    const sp = Math.max(0, rv.speed || 0);
    if (this.camYaw == null || this.first) this.camYaw = rv.yaw;
    // camera heading lags the RV heading (smooth) and is biased toward the road heading
    const roadYaw = this.track.headingAt(rv.z + 20);
    let target = rv.yaw * 0.75 + roadYaw * 0.25;
    if (sp < 1) target = rv.yaw;
    let d = target - this.camYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.camYaw += d * (1 - Math.exp(-dt * 3.2));
    const cy = this.camYaw;
    const back = 13 + Math.min(3.5, sp * 0.08);
    const up = 6.0 - Math.min(1.2, sp * 0.03);
    const cf = _f.set(Math.sin(cy), 0, Math.cos(cy));
    const desired = _v.set(rv.x - cf.x * back, (rv.y || 0) * 0.85 + up, rv.z - cf.z * back);
    const lookAhead = 9 + sp * 0.35;
    const ax = this.track.centerX(rv.z + lookAhead);
    const lookT = _v2.set(rv.x + fwdX * lookAhead * 0.6 + (ax - rv.x) * 0.15, (rv.y || 0) + 0.9, rv.z + fwdZ * lookAhead);

    // airborne cinematic blend
    const airT = rv.airborne ? 1 : 0;
    this.air = damp(this.air, airT, rv.airborne ? 2.0 : 1.4, dt);
    if (this.air > 0.01) {
      const a = smooth(this.air);
      // three-quarter side view: to the driver's left (−u), slightly ahead, low
      const sideX = -Math.cos(rv.yaw) * this.airSide, sideZ = Math.sin(rv.yaw) * this.airSide; // left of heading (+X when yaw=0)
      const side = new THREE.Vector3(rv.x + sideX * 15 + fwdX * 5, (rv.y || 0) + 3.2, rv.z + sideZ * 15 + fwdZ * 5);
      desired.lerp(side, a);
      lookT.lerp(new THREE.Vector3(rv.x + fwdX * 3, (rv.y || 0) + 0.8, rv.z + fwdZ * 3), a);
    }

    if (this.first) { this.pos.copy(desired); this.look.copy(lookT); this.first = false; }
    const kPos = this.air > 0.05 ? 3.2 : 7;
    dampV(this.pos, desired, kPos, dt);
    dampV(this.look, lookT, 9, dt);
    // never dip under the ground/terrain behind
    const gy = this.track.surfaceY(this.pos.z);
    const minY = (gy == null ? (rv.y || 0) : Math.max(gy, 0)) + 1.6;
    if (this.pos.y < minY) this.pos.y = minY;

    // lean into turns
    const lat = feel.latAcc ?? 0;
    this.lean = damp(this.lean, THREE.MathUtils.clamp(-lat * 0.004, -0.05, 0.05), 4, dt);
    // FOV with speed + nitro
    const fovT = this.baseFov + Math.min(14, sp * 0.32) + ((rv.nitro || 0) > 0 ? 7 : 0) - this.air * 8;
    this.fov = damp(this.fov, fovT, 3, dt);

    cam.position.copy(this.pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look);
    cam.rotateZ(this.lean * (1 - this.air));
    this._applyShake(dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }

  _applyShake(dt, gain = 1) {
    if (this.shakeAmt <= 0.001) return;
    this.shakeT += dt;
    const a = this.shakeAmt * gain;
    const t = this.shakeT * 38;
    this.camera.position.x += (Math.sin(t * 1.1) + Math.sin(t * 2.3) * 0.5) * 0.16 * a;
    this.camera.position.y += (Math.sin(t * 1.7 + 1) + Math.sin(t * 3.1) * 0.4) * 0.12 * a;
    this.camera.rotateZ(Math.sin(t * 1.3) * 0.02 * a);
    if (gain > 1) this.camera.rotateX(Math.sin(t * 0.9 + 2) * 0.012 * a);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.2);
  }

  _rear(dt, rv, feel) {
    const cam = this.camera;
    const L = this.rvLen || 8.6, H = this.rvH || 3.4;
    const fx = Math.sin(rv.yaw), fz = Math.cos(rv.yaw);
    // eye: inside, just in front of the rear wall, roughly window height
    const pitch = rv.pitch || 0, roll = rv.roll || 0;
    const back = -L / 2 + 0.9;
    const eyeH = 2.05 + (H - 3.4) * 0.5;
    // bump head-bob (spring)
    const bump = feel.bump || 0;
    this.bobV += (-this.bob * 120 - this.bobV * 10) * dt + bump * (Math.random() - 0.5) * 3.2 * dt * 60 * 0.05;
    this.bob += this.bobV * dt;
    const bob = THREE.MathUtils.clamp(this.bob, -0.12, 0.12);
    const ex = rv.x + fx * back, ez = rv.z + fz * back;
    const ey = (rv.y || 0) + eyeH + Math.sin(pitch) * back * -1 + bob;
    cam.position.set(ex, ey, ez);
    // look backward down the road, slightly down
    const look = _v.set(ex - fx * 30, (rv.y || 0) + 0.9 - Math.sin(pitch) * 30 * 0.2, ez - fz * 30);
    cam.up.set(0, 1, 0);
    cam.lookAt(look);
    this.rearRoll = damp(this.rearRoll, -roll + THREE.MathUtils.clamp((feel.latAcc || 0) * 0.004, -0.04, 0.04), 6, dt);
    cam.rotateZ(this.rearRoll);
    this._applyShake(dt);
    const fovT = 70;
    if (Math.abs(cam.fov - fovT) > 0.01) { cam.fov = fovT; cam.updateProjectionMatrix(); }
  }

  _wreckCam(dt, rv) {
    const cam = this.camera, w = this.wreck;
    w.t += dt;
    const k = smooth(Math.min(1, w.t / 3.2));
    const cx = rv.x, cy = rv.y || 0, cz = rv.z;
    // behind, swung out toward the road's centre line (open road, not the sidewalk / buildings),
    // pulling back and up; it slowly swings in behind the wreck
    if (w.side == null) {
      const lx = Math.cos(w.yaw), lz = -Math.sin(w.yaw);         // left of the heading
      const ccx = this.track.centerX(w.z);
      w.side = (ccx - w.x) * lx >= 0 ? 1 : -1;
      if (Math.abs(ccx - w.x) < 1.5) w.side = 1;
    }
    const a = Math.max(0.15, 0.42 - w.t * 0.02) * w.side;
    const dist = 13 + 8 * k, up = 3.6 + 4.6 * k;
    const fx = Math.sin(w.yaw), fz = Math.cos(w.yaw), lx = Math.cos(w.yaw), lz = -Math.sin(w.yaw);
    const back = Math.cos(a) * dist, lat = Math.sin(a) * dist;
    const desired = _v.set(cx - fx * back + lx * lat, cy + up, cz - fz * back + lz * lat);
    const lookT = _v2.set(cx, cy + 1.2 + 2.2 * k, cz);
    if (this.first) { this.pos.copy(desired); this.look.copy(lookT); this.first = false; }
    dampV(this.pos, desired, 5, dt);
    dampV(this.look, lookT, 5, dt);
    const gy = this.track.surfaceY(this.pos.z);
    const minY = (gy == null ? cy : Math.max(gy, 0)) + 1.6;
    if (this.pos.y < minY) this.pos.y = minY;
    cam.position.copy(this.pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look);
    this._applyShake(dt, 2.4);   // the blast: much harder than a crash
    const fovT = 60;
    this.fov = fovT;
    if (Math.abs(cam.fov - fovT) > 0.01) { cam.fov = fovT; cam.updateProjectionMatrix(); }
  }

  _cinematic(dt, rv) {
    const cam = this.camera;
    const c = this.cin;
    c.t += dt;
    if (c.orbit) {
      const a = c.t * 0.12;
      cam.position.set(rv.x + Math.sin(a) * 22, (rv.y || 0) + 7, rv.z + Math.cos(a) * 22);
      cam.lookAt(rv.x, (rv.y || 0) + 1.5, rv.z);
    } else {
      cam.position.copy(c.pos);
      cam.lookAt(c.target);
    }
    this._applyShake(dt);
    if (Math.abs(cam.fov - c.fov) > 0.01) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
  }
}
