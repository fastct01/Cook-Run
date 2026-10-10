// ─────────────────────────────────────────────────────────────────────────────
// Avatar — an on-foot character (Rook = createModel('driver'), Doc = createModel('cook'), clerks …)
// with a procedural walk/run cycle, carry / push / reach poses and hand + carry anchors.
// Same rig conventions as the van's DocAvatar (rotation.x < 0 swings a limb FORWARD).
//
//   const a = new Avatar(createModel('driver'));  parent.add(a.root);
//   a.set({ x, z, y, yaw, speed, carry: null|'crate'|'box'|'sack'|'push'|'notebook'|'keys'|'phone'|'wheel', act: 0..0.4, run })
//   a.update(dt)                       // advances the cycle from `speed`
//   a.carryAnchor (in front of the belly, moves with the body) · a.handR (right hand)
// Unity: an Animator with a 1D blend tree (idle → walk → run on speed) + carry/push layers.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Avatar {
  constructor(model, { scale = 1, name = 'avatar', shadows = true } = {}) {
    this.root = new THREE.Group();
    this.root.name = name;
    this.model = model;
    model.rotation.order = 'YXZ';
    model.scale.setScalar(scale);
    this.root.add(model);
    if (shadows) model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const g = (n) => model.getObjectByName(n) || new THREE.Object3D();
    this.j = { body: g('body'), head: g('head'), al: g('arm_l'), ar: g('arm_r'), ll: g('leg_l'), lr: g('leg_r') };
    this.handR = new THREE.Object3D(); this.handR.name = name + '_hand_r'; this.handR.position.set(0, -0.62, 0.05); this.j.ar.add(this.handR);
    this.handL = new THREE.Object3D(); this.handL.name = name + '_hand_l'; this.handL.position.set(0, -0.62, 0.05); this.j.al.add(this.handL);
    this.carryAnchor = new THREE.Object3D(); this.carryAnchor.name = name + '_carry';
    this.carryAnchor.position.set(0, 1.0, 0.36);
    model.add(this.carryAnchor);
    this.s = { x: 0, z: 0, y: 0, yaw: 0, speed: 0, carry: null, act: 0, run: false, crouch: 0, lookY: 0, wave: 0, cheer: 0, slip: 0 };
    this.phase = 0; this.t = 0; this.bob = 0;
    this.visible = true;
  }

  set(p) { Object.assign(this.s, p); return this; }
  setVisible(v) { this.visible = v; this.root.visible = v; }

  update(dt) {
    this.t += dt;
    const s = this.s, j = this.j, t = this.t;
    const sp = s.speed || 0;
    const running = s.run || sp > 3.3;
    this.phase += sp * dt * (running ? 3.6 : 4.4);
    const A = clamp(sp / 2.6, 0, 1) * (running ? 1.25 : 1);
    const ph = this.phase;
    let ll = Math.sin(ph) * 0.62 * A, lr = -ll;
    let al = -Math.sin(ph) * 0.5 * A, ar = -al, alz = 0, arz = 0;
    let bodyX = (running ? 0.18 : 0.06) * clamp(sp / 2.6, 0, 1), bodyZ = 0, headX = 0, headY = s.lookY || 0;
    let y = Math.abs(Math.cos(ph)) * (running ? 0.07 : 0.035) * clamp(sp / 2.6, 0, 1);
    if (sp < 0.15) { // idle breathing + glance
      al = 0.05 + Math.sin(t * 1.6) * 0.03; ar = 0.05 - Math.sin(t * 1.6) * 0.03;
      headY += Math.sin(t * 0.5) * 0.12;
      bodyX = Math.sin(t * 1.6) * 0.01;
    }
    const c = s.carry;
    if (c === 'crate' || c === 'box' || c === 'sack' || c === 'coil' || c === 'jar') {
      al = ar = -1.05 + Math.sin(ph) * 0.05 * A; alz = -0.32; arz = 0.32;
      bodyX = -0.06; y *= 0.8;
    } else if (c === 'push' || c === 'wheel') {
      al = ar = -1.25; alz = -0.12; arz = 0.12; bodyX = 0.16;
    } else if (c === 'notebook' || c === 'keys' || c === 'phone' || c === 'nozzle') {
      ar = c === 'phone' ? -2.5 : -0.75 + Math.sin(ph) * 0.1 * A; arz = c === 'phone' ? 0.5 : 0.15;
      if (c === 'phone') headY += 0.25;
    }
    if (s.act > 0) { // quick reach
      const k = Math.sin(clamp(s.act / 0.4, 0, 1) * Math.PI);
      ar = ar * (1 - k) + -1.45 * k; arz += 0.1 * k; bodyX += 0.15 * k; headX += 0.2 * k;
    }
    if (s.crouch > 0) { const k = s.crouch; bodyX += 0.5 * k; ll -= 0.6 * k; lr -= 0.6 * k; y -= 0.18 * k; headX -= 0.3 * k; }
    if (s.wave > 0) { al = -2.7 + Math.sin(t * 14) * 0.35; alz = 0.3; }
    if (s.cheer > 0) { const k = clamp(s.cheer, 0, 1); al = al * (1 - k) - 2.9 * k; ar = ar * (1 - k) - 2.9 * k; alz = 0.25 * k; arz = -0.25 * k; y += Math.abs(Math.sin(t * 9)) * 0.12 * k; }
    if ((s.y || 0) > 0.02) { // airborne: legs tucked, arms out (unless the hands are full), no walk bob
      const k = clamp(s.y / 0.2, 0, 1);
      ll = ll * (1 - k) - 0.9 * k; lr = lr * (1 - k) + 0.25 * k;
      if (!c) { al = al * (1 - k) - 1.1 * k; ar = ar * (1 - k) - 1.1 * k; alz = -0.35 * k; arz = 0.35 * k; }
      bodyX = bodyX * (1 - k) + 0.1 * k; y = 0;
    }
    if (s.slip > 0) { const k = clamp(s.slip, 0, 1); al = -2.2 * k + al * (1 - k); ar = -1.8 * k + ar * (1 - k); alz = 0.9 * k; arz = -0.9 * k; bodyZ = Math.sin(t * 16) * 0.25 * k; }
    this.root.position.set(s.x, (s.y || 0) + y, s.z);
    this.root.rotation.set(0, s.yaw, 0);
    j.body.rotation.set(bodyX, 0, bodyZ);
    j.head.rotation.set(headX, headY, 0);
    j.al.rotation.set(al, 0, alz); j.ar.rotation.set(ar, 0, arz);
    j.ll.rotation.set(ll, 0, 0.04); j.lr.rotation.set(lr, 0, -0.04);
  }

  /** World position of the head (for name tags). */
  headWorld(out) { this.j.head.updateWorldMatrix(true, false); return out.setFromMatrixPosition(this.j.head.matrixWorld); }
  dispose() { this.root.removeFromParent(); }
}

/** Smoothly follow a networked pose (remote avatars): extrapolates from the last two samples. */
export class PoseSmoother {
  constructor() { this.a = null; this.b = null; this.cur = null; }
  push(x, z, yaw, now) {
    if (this.b && Math.abs(this.b.x - x) < 1e-6 && Math.abs(this.b.z - z) < 1e-6 && Math.abs(this.b.yaw - yaw) < 1e-6) { this.b.t = Math.max(this.b.t, now - 0.05); return; }
    this.a = this.b; this.b = { x, z, yaw, t: now };
    if (!this.cur) this.cur = { x, z, yaw };
  }
  snap(x, z, yaw) { this.cur = { x, z, yaw }; this.a = null; this.b = { x, z, yaw, t: 0 }; }
  update(dt, now, rate = 14) {
    if (!this.b) return this.cur;
    let tx = this.b.x, tz = this.b.z;
    if (this.a && this.b.t > this.a.t) {
      const k = clamp(now - this.b.t, 0, 0.12) / (this.b.t - this.a.t);
      tx += (this.b.x - this.a.x) * k; tz += (this.b.z - this.a.z) * k;
    }
    const f = 1 - Math.exp(-dt * rate);
    const c = this.cur;
    if (Math.hypot(tx - c.x, tz - c.z) > 3) { c.x = tx; c.z = tz; }
    c.x += (tx - c.x) * f; c.z += (tz - c.z) * f;
    c.yaw += wrap(this.b.yaw - c.yaw) * Math.min(1, dt * 12);
    return c;
  }
}
