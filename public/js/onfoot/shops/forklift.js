// ─────────────────────────────────────────────────────────────────────────────
// forklift — Round 3 first person (agent SHOPS). Harbour Chandlery dock yard. Doc drives the `forklift` from its
// seat: W/S drive, A/D steer (rear-wheel steer), R/F (or Q/Z) forks up/down, mouse looks around the cab.
// Slide the forks under the pallet, lift it, and set it down on the marked rear rack behind the parked RV.
// His hands work the controls: left on the steering knob, right on the lift lever.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { createModel } from '../../assets/index.js';
import { FpShop, clamp, wrap } from './fpBase.js';
import { Kit, pallet, sack, crate, textSign, glowSpot } from './build.js';

const PALLET0 = { x: -5, z: -5, yaw: 0 };
const RACK = { x: 5, z: 1.45, y: 0.8, w: 1.5, d: 1.3, yaw: 0 };
const FORK_REACH = 1.1;          // fork centre ahead of the forklift origin
const FL0 = { x: -5, z: 1.6, yaw: Math.PI };
const SEAT = { y: 1.95, z: -0.55 };   // the eye, forklift-local

export class ForkliftChallenge extends FpShop {
  controls() { return [['W S', 'drive'], ['A D', 'steer'], ['R F', 'forks'], ['Mouse', 'look']]; }

  build() {
    this.extraKeys = ['KeyR', 'KeyF', 'KeyQ', 'KeyZ'];
    const S = this.scene;
    S.background = new THREE.Color('#b9cdd6');
    S.fog = new THREE.Fog('#b9cdd6', 40, 120);
    S.add(new THREE.HemisphereLight('#dfe9f0', '#7f7566', 1.3));
    const sun = new THREE.DirectionalLight('#fff1d8', 2.2);
    sun.position.set(-12, 22, 10); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 16, bottom: -16, near: 1, far: 70 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
    S.add(sun);

    const k = new Kit(1200);
    k.box('#9a968c', [30, 0.2, 26], [-1, -0.1, 0]);
    for (let x = -15; x < 14; x += 3) k.rectY('#8f8b82', 0, [x, x + 0.04], [-13, 13], { off: 0.003 });
    k.rectY('#d9b13a', 0, [-9.5, -9.3], [-12, 12], { off: 0.004 });
    for (let z = -11; z < 12; z += 2.4) k.rectY('#d9b13a', 0, [-0.1, 0.1], [z, z + 1.2], { off: 0.004 });
    k.box('#5f6468', [0.6, 0.35, 26], [14.2, 0, 0], { base: true });
    for (let z = -10; z <= 10; z += 5) { k.cyl('#2a2a2b', 0.22, 0.26, 0.55, [13.9, 0.35, z], { base: true, seg: 8 }); k.cyl('#2a2a2b', 0.3, 0.3, 0.08, [13.9, 0.9, z], { base: true, seg: 8 }); }
    k.box('#3d6f86', [60, 0.1, 80], [45, -1.2, 0], { base: true });
    k.box('#6f6a60', [1, 1.2, 26], [14.6, -1.2, 0], { base: true });
    k.at([RACK.x, 0, RACK.z], () => {
      k.box('#5f6468', [RACK.w, 0.08, RACK.d], [0, RACK.y - 0.08, 0], { base: true });
      for (const sx of [-0.6, 0.6]) { k.box('#4c4f52', [0.1, 0.1, 1.0], [sx, RACK.y - 0.2, RACK.d / 2 + 0.3], { base: true }); k.box('#4c4f52', [0.08, RACK.y - 0.08, 0.08], [sx, 0, -RACK.d / 2 + 0.1], { base: true }); }
      const t = 0.07, y = RACK.y + 0.002, w = RACK.w / 2 - 0.06, d = RACK.d / 2 - 0.06;
      k.rectY('#e2b93b', y, [-w, w], [-d, -d + t], { off: 0 }); k.rectY('#e2b93b', y, [-w, w], [d - t, d], { off: 0 });
      k.rectY('#e2b93b', y, [-w, -w + t], [-d, d], { off: 0 }); k.rectY('#e2b93b', y, [w - t, w], [-d, d], { off: 0 });
      k.rectY('#2b2622', y, [-0.25, 0.25], [-0.02, 0.02], { off: 0 }); k.rectY('#2b2622', y, [-0.02, 0.02], [-0.25, 0.25], { off: 0 });
    });
    k.rectY('#efe9dc', 0, [PALLET0.x - 0.8, PALLET0.x + 0.8], [PALLET0.z - 0.7, PALLET0.z - 0.64], { off: 0.004 });
    k.rectY('#efe9dc', 0, [PALLET0.x - 0.8, PALLET0.x + 0.8], [PALLET0.z + 0.64, PALLET0.z + 0.7], { off: 0.004 });
    const ground = k.mesh('yard'); ground.castShadow = false; S.add(ground);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(60, 80), new THREE.MeshLambertMaterial({ color: '#4d8aa3', transparent: true, opacity: 0.85 }));
    water.rotation.x = -Math.PI / 2; water.position.set(45, -0.55, 0); water.userData.ownGeo = true; S.add(water);
    this.water = water;

    const store = createModel('store_chandlery'); store.position.set(-1, 0, -21); S.add(store);
    const c1 = createModel('container_stack', 1); c1.position.set(-17.5, 0, 3); c1.rotation.y = Math.PI / 2; S.add(c1);
    const c2 = createModel('container_stack', 2); c2.position.set(4, 0, -16); S.add(c2);
    const bc = createModel('bollard_crates', 0); bc.position.set(10.5, 0, -7); bc.rotation.y = -Math.PI / 2; S.add(bc);
    const bc2 = createModel('bollard_crates', 2); bc2.position.set(-11, 0, 10); S.add(bc2);
    const rv = createModel('rv'); rv.position.set(5, 0, 6.5); S.add(rv);
    const sign = textSign('rackzone', 'REAR RACK', 1.2, 0.3, { bg: '#e2b93b', fg: '#2b2622', px: 90 });
    sign.position.set(5, 2.0, 2.18); sign.rotation.y = Math.PI; S.add(sign);
    this.dock = createModel('dock_worker', 0); this.dock.position.set(11.2, 0, 1.5); this.dock.rotation.y = -Math.PI / 2; S.add(this.dock);

    // the forklift: keep its forks + wheels, hide its body (the camera sits inside it) and build the cab around Doc
    const fl = this.fl = createModel('forklift', 1); S.add(fl);
    this.forks = fl.getObjectByName('forks');
    const body = fl.getObjectByName('body_mesh'); if (body) body.visible = false;
    this.wheels = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].map((n) => fl.getObjectByName(n));
    fl.add(this._cab());
    this.F = { x: FL0.x, z: FL0.z, yaw: FL0.yaw, v: 0, steer: 0, fy: 0.0, wheel: 0 };
    const pk = new Kit(1210);
    pallet(pk, [0, 0, 0], 0, 1.2, 1.0);
    for (const [x, z, r] of [[-0.3, -0.24, 0.1], [0.3, -0.24, -0.08], [-0.3, 0.24, 0.05], [0.3, 0.24, 0]]) sack(pk, [x, 0.13, z], r, '#d6c08a');
    crate(pk, [0, 0.36, 0], 0.2, [0.6, 0.38, 0.45], '#a8875e');
    this.pal = pk.mesh('pallet'); S.add(this.pal);
    this.P2 = { x: PALLET0.x, z: PALLET0.z, yaw: PALLET0.yaw, y: 0, state: 'ground' };
    this.ring = glowSpot('#F2B90F', 0.6, 0.9); S.add(this.ring);

    const W = this.world;
    W.bounds = { x0: -15.8, x1: 13.9, z0: -12, z1: 12 };
    W.box(3.65, 6.35, 2.15, 10.85, 'rv');
    W.box(-18, -13.75, -3.1, 9.1, 'containers'); W.box(-2.1, 10.1, -22, -11.0, 'containers');
    W.box(8.6, 11.4, -9.7, -3.95, 'crates'); W.box(11.4, 11.95, -9.7, -8.0, 'crates'); W.box(-14, -7.8, 8.8, 12, 'crates');
    this.rackBox = W.box(RACK.x - RACK.w / 2, RACK.x + RACK.w / 2, RACK.z - RACK.d / 2, RACK.z + RACK.d / 2, 'rack');
    this.dockC = W.circle(11.2, 1.5, 0.3, 'worker');

    this.P.seated = true;
    Object.assign(this.P, { yaw: 0, pitch: -0.3 });
    this.look.yawMin = -1.9; this.look.yawMax = 1.9; this.look.minPitch = -1.0; this.look.maxPitch = 0.5;
    this.stage = 'drive';
    this.bumps = 0;
    this.hands.setPose('lever', 0.01);
    this._task();
  }

  /** First-person cab, forklift-local (+Z forward): mast, overhead guard, dash, seat, levers, steering knob. */
  _cab() {
    const k = new Kit(1220);
    const Y = '#e2b93b', D = '#2b2c2e', G = '#4c4f52';
    k.box(Y, [1.12, 0.62, 2.3], [0, 0.32, -0.85], { base: true, c: 0.04 });            // chassis + counterweight
    k.box(D, [0.9, 0.04, 1.0], [0, 0.94, -0.5], { base: true });                        // floor plate
    k.box(Y, [1.1, 0.7, 0.55], [0, 0.94, -1.75], { base: true, c: 0.05 });             // engine hood behind the seat
    k.box(D, [0.5, 0.12, 0.45], [0, 1.0, -0.62], { base: true, c: 0.03 });             // seat
    k.box(D, [0.5, 0.6, 0.1], [0, 1.1, -0.9], { base: true, c: 0.03, rot: [-0.15, 0, 0] });   // seat back
    k.box(Y, [1.0, 0.24, 0.3], [0, 0.94, 0.22], { base: true, c: 0.03 });              // dash / cowl (low: the forks stay in view)
    k.box(D, [0.86, 0.03, 0.26], [0, 1.18, 0.22], { base: true });
    // overhead guard: 4 posts + a slatted roof
    for (const [x, z] of [[0.55, 0.32], [-0.55, 0.32], [0.55, -1.2], [-0.55, -1.2]]) k.box(D, [0.045, 1.3, 0.045], [x, 1.0, z], { base: true, rot: [z > 0 ? -0.12 : 0, 0, 0] });
    for (let i = 0; i < 6; i++) k.box(D, [1.1, 0.05, 0.06], [0, 2.28, 0.25 - i * 0.29], { base: true });
    for (const x of [-0.52, 0.52]) k.box(D, [0.07, 0.07, 1.6], [x, 2.27, -0.45], { base: true });
    // mast uprights (the carriage + forks slide on them)
    for (const x of [-0.4, 0.4]) { k.box(G, [0.08, 2.45, 0.12], [x, 0.1, 0.5], { base: true }); k.box(G, [0.05, 2.3, 0.08], [x * 0.86, 0.2, 0.47], { base: true }); }
    k.box(G, [0.86, 0.1, 0.12], [0, 2.5, 0.5], { base: true });
    // controls: the lift lever (right of Doc = local −X), the steering wheel + knob (left = +X)
    k.cyl('#5f6468', 0.012, 0.012, 0.32, [-0.17, 1.17, -0.08], { base: true, seg: 6, rot: [0.25, 0, 0] });
    k.cyl('#c4372b', 0.03, 0.03, 0.07, [-0.17, 1.48, -0.01], { base: true, seg: 8 });
    k.cyl('#5f6468', 0.012, 0.012, 0.25, [-0.27, 1.21, -0.06], { base: true, seg: 6, rot: [0.25, 0, 0] });
    k.cyl(D, 0.03, 0.03, 0.06, [-0.27, 1.45, -0.01], { base: true, seg: 8 });
    k.torus(D, 0.17, 0.018, [0.12, 1.42, 0.06], { rot: [Math.PI / 2 - 0.5, 0, 0], rs: 5, ts: 16 });
    k.cyl(D, 0.025, 0.025, 0.36, [0.12, 1.12, 0.17], { base: true, seg: 6, rot: [-0.5, 0, 0] });
    k.cyl('#c4372b', 0.022, 0.022, 0.06, [0.2, 1.47, -0.03], { base: true, seg: 8 });
    const m = k.mesh('forklift_cab_fp');
    m.castShadow = true;
    return m;
  }

  cameraPose() {
    const F = this.F;
    return {
      x: F.x + Math.sin(F.yaw) * SEAT.z, y: SEAT.y + Math.sin(this.t * 9) * 0.004 * Math.min(1, Math.abs(F.v) / 2), z: F.z + Math.cos(F.yaw) * SEAT.z,
      yaw: F.yaw + this.P.yaw, pitch: this.P.pitch, lookYaw: this.P.yaw,
    };
  }

  _task() {
    const st = this.P2.state;
    const rows = [
      { text: 'Forks under the pallet', icon: 'pallet', state: st === 'ground' ? 'cur' : 'done' },
      { text: 'Lift it over the rack', icon: 'rack', state: st === 'forks' ? 'cur' : st === 'rack' ? 'done' : 'todo' },
      { text: 'Set it down', icon: 'check', state: st === 'rack' ? 'done' : 'todo' },
    ];
    this.hud.setTask({ cap: 'Forklift run', n: `${st === 'ground' ? 0 : st === 'forks' ? 1 : 3}/3`, store: this.def.name, rows, foot: 'Rear rack: the yellow box behind the RV.' });
  }

  _drive(h) {
    const F = this.F;
    const { f } = this.axes();
    const st = (this.held('KeyA') ? 1 : 0) - (this.held('KeyD') ? 1 : 0);
    const max = f >= 0 ? 4.0 : 2.5;
    if (f) F.v += clamp(f * max - F.v, -6 * h, 3.0 * h);
    else F.v += clamp(-F.v, -5 * h, 5 * h);
    F.steer += clamp(st - F.steer, -h * 4, h * 4);
    F.yaw += F.steer * F.v * 0.62 * h;
    const up = this.held('KeyR') || this.held('KeyQ'), down = this.held('KeyF') || this.held('KeyZ');
    this.forkDir = (up ? 1 : 0) - (down ? 1 : 0);
    F.fy = clamp(F.fy + this.forkDir * 0.75 * h, 0, 1.6);
    const fx = Math.sin(F.yaw), fz = Math.cos(F.yaw);
    F.x += fx * F.v * h; F.z += fz * F.v * h;
    const carrying = this.P2.state === 'forks';
    const body = { x: F.x - fx * 0.55, z: F.z - fz * 0.55 }, tip = { x: F.x + fx * FORK_REACH, z: F.z + fz * FORK_REACH };
    const b0 = { ...body }, t0 = { ...tip };
    const hitB = this.world.pushOut(body, 0.85);
    const hitT = this.world.pushOut(tip, carrying ? 0.62 : 0.3, { ignore: (o) => o === this.rackBox && (!carrying || this.P2.y > RACK.y - 0.02) || o === this.palletC });
    const cx = (body.x - b0.x) + (tip.x - t0.x), cz = (body.z - b0.z) + (tip.z - t0.z);
    if (hitB || hitT) {
      F.x += cx; F.z += cz;
      if (Math.abs(F.v) > 1.6) { this.shake = 0.5; this.bumps++; this.toast(this.P2.state === 'forks' && this.P2.y < RACK.y && hitT ? 'Clunk! Lift higher' : 'Bonk!', 'bad'); }
      F.v *= 0.3;
    }
    F.wheel += F.v * h / 0.3;
  }

  step(h) {
    const F = this.F, P = this.P2;
    this._drive(h);
    this.B.speed = Math.abs(F.v);
    const fx = Math.sin(F.yaw), fz = Math.cos(F.yaw);
    const tipX = F.x + fx * FORK_REACH, tipZ = F.z + fz * FORK_REACH;
    if (P.state === 'ground' || P.state === 'rack0') {
      const d = Math.hypot(tipX - P.x, tipZ - P.z);
      const ang = Math.abs(wrap(2 * (F.yaw - P.yaw))) / 2;
      const lowOK = F.fy <= P.y + 0.12 && F.fy >= P.y - 0.2;
      this.engage = d < 0.42 && ang < 0.38 && lowOK;
      if (this.engage && F.fy > P.y + 0.03) {
        P.state = 'forks';
        const lx = (P.x - F.x) * Math.cos(F.yaw) - (P.z - F.z) * Math.sin(F.yaw);
        P.off = { lx, lz: (P.x - F.x) * Math.sin(F.yaw) + (P.z - F.z) * Math.cos(F.yaw), dyaw: wrap(P.yaw - F.yaw) };
        this.toast('Got it!', 'good'); this._task();
      }
      this.promptOverride = this.engage ? { key: 'R', text: 'Forks in — lift it', sub: '' } : d < 3 ? { key: 'F', text: F.fy > 0.1 ? 'Forks down, then slide under' : 'Slide the forks under the pallet', sub: 'line up straight' } : null;
      this.goal = new THREE.Vector3(P.x, 0.6, P.z);
    }
    if (P.state === 'forks') {
      const s = Math.sin(F.yaw), c = Math.cos(F.yaw);
      P.x = F.x + P.off.lx * c + P.off.lz * s; P.z = F.z - P.off.lx * s + P.off.lz * c;
      P.yaw = F.yaw + P.off.dyaw; P.y = F.fy;
      const overRack = Math.abs(P.x - RACK.x) < 0.6 && Math.abs(P.z - RACK.z) < 0.6;
      if (overRack && P.y <= RACK.y + 0.01 && P.y >= RACK.y - 0.12) { P.state = 'rack'; P.y = RACK.y; this.promptOverride = null; this._placed(); return; }
      if (P.y <= 0.0005 && !overRack) { P.state = 'ground'; this.toast('Set down', 'info'); this._task(); }
      const high = P.y > RACK.y + 0.05;
      this.promptOverride = overRack
        ? (high ? { key: 'F', text: 'Over the rack — lower it', sub: '' } : { key: 'R', text: 'Too low! Lift over the rack edge', sub: '' })
        : (high ? { key: 'W', text: 'Drive it over the RV\'s rear rack', sub: 'the yellow box behind the RV' } : { key: 'R', text: 'Lift it above the rack (≈1 m)', sub: '' });
      this.goal = new THREE.Vector3(RACK.x, RACK.y + 0.3, RACK.z);
    }
    if (this.palletC) { this.palletC.x = P.x; this.palletC.z = P.z; this.palletC.on = P.state === 'ground'; }
    else this.palletC = this.world.circle(P.x, P.z, 0.55, 'pallet');
  }

  _placed() {
    const P = this.P2;
    const pos = Math.hypot(P.x - RACK.x, P.z - RACK.z);
    const ang = Math.abs(wrap(2 * (P.yaw - RACK.yaw))) / 2;
    const align = clamp(1 - (pos / 0.6) * 0.6 - (ang / 0.4) * 0.4, 0, 1);
    this.F.fy = Math.max(0, this.F.fy - 0.1);
    const tf = this.timeLeft / this.timeLimit;
    const score = clamp(0.25 + 0.5 * tf + 0.3 * align - 0.03 * this.bumps, 0.05, 1);
    this.toast(align > 0.8 ? 'Perfect fit!' : align > 0.5 ? 'Close enough' : 'Wonky… it holds', 'good');
    this._task();
    this.finish(score, [`On the rack in ${Math.round(this.t + this.penalty)}s`, `Alignment ${Math.round(align * 100)}% (${(pos * 100).toFixed(0)} cm off, ${(ang * 57.3).toFixed(0)}°)`, this.bumps ? `Bumps: ${this.bumps}` : 'Not a scratch']);
  }
  timeUp() { return { score: this.P2.state === 'forks' ? 0.2 : 0.08, lines: [this.P2.state === 'forks' ? 'Pallet still on the forks' : 'Pallet never left the ground'] }; }
  progress() {
    const P = this.P2;
    if (P.state === 'ground') return { label: 'To the pallet', frac: 0.1 };
    if (P.state === 'forks') return { label: 'Pallet up', frac: 0.5 + 0.3 * clamp(1 - Math.hypot(P.x - RACK.x, P.z - RACK.z) / 12, 0, 1) };
    return { label: 'On the rack', frac: 1 };
  }

  visual(dt) {
    const F = this.F, P = this.P2;
    this.fl.position.set(F.x, 0, F.z); this.fl.rotation.y = F.yaw;
    if (this.forks) this.forks.position.y = F.fy;
    for (const w of this.wheels) if (w) w.rotation.x = F.wheel;
    const rl = this.fl.getObjectByName('wheel_rl'), rr = this.fl.getObjectByName('wheel_rr');
    for (const w of [rl, rr]) if (w) w.rotation.y = F.steer * -0.5;
    this.pal.position.set(P.x, P.y, P.z); this.pal.rotation.y = P.yaw;
    const rp = P.state === 'ground' ? P : P.state === 'forks' ? RACK : null;
    this.ring.visible = !!rp;
    if (rp) { this.ring.position.set(rp.x, rp === RACK ? RACK.y + 0.01 : 0, rp.z); this.ring.userData.set(0.55 + 0.45 * Math.sin(this.t * 5)); }
    if (this.water) this.water.position.y = -0.55 + Math.sin(this.t * 0.8) * 0.04;
    this.handAct = this.forkDir || 0;
    this.handAct2 = F.steer;
    this.alertInfo = { icon: 'pallet', text: `Forks ${F.fy.toFixed(2)} m`, sub: P.state === 'forks' ? `rack at ${RACK.y.toFixed(1)} m` : 'R up · F down', frac: F.fy / 1.6, tone: P.state === 'forks' && F.fy > RACK.y + 0.05 ? 'green' : 'amber' };
  }

  // ── scripted driver (same keys) ───────────────────────────────────────────
  bot(h) {
    const F = this.F, P = this.P2;
    const keys = [];
    const look = { yaw: 0, pitch: -0.3 };
    const tipX = F.x + Math.sin(F.yaw) * FORK_REACH, tipZ = F.z + Math.cos(F.yaw) * FORK_REACH;
    const steerTo = (tx, tz, slow = false) => {
      const want = Math.atan2(tx - F.x, tz - F.z);
      const d = wrap(want - F.yaw);
      if (Math.abs(d) > 0.06) keys.push(d > 0 ? 'KeyA' : 'KeyD');
      if (Math.abs(d) < 1.3) { if (!slow || F.v < 1.2) keys.push('KeyW'); } else if (F.v < 0.8) keys.push('KeyW');
    };
    if (P.state === 'ground') {
      if (this.engage) return { ...look, keys: ['KeyR'] };
      if (F.fy > 0.02) keys.push('KeyF');
      const ax = P.x, az = P.z + 2.6;
      const lined = Math.abs(F.x - P.x) < 0.25 && Math.abs(wrap(F.yaw - Math.PI)) < 0.2 && F.z > P.z;
      if (lined) steerTo(P.x, P.z - 2, true);
      else steerTo(ax, az);
    } else if (P.state === 'forks') {
      if (F.fy < RACK.y + 0.25) { keys.push('KeyR'); if (Math.hypot(tipX - P.x, tipZ - P.z) < 2 && F.z < -3) return { ...look, keys }; }
      const over = Math.abs(P.x - RACK.x) < 0.5 && Math.abs(P.z - RACK.z) < 0.3;
      if (over) { if (F.v > 0.05) keys.push('KeyS'); keys.push('KeyF'); return { ...look, keys: keys.filter((x) => x !== 'KeyR') }; }
      const wp = { x: RACK.x - 0.2, z: RACK.z - 7.0 };
      if (!this._wp && Math.hypot(F.x - wp.x, F.z - wp.z) < 1.2) this._wp = true;
      if (!this._wp) steerTo(wp.x, wp.z);
      else steerTo(RACK.x, RACK.z + 2.5, Math.hypot(P.x - RACK.x, P.z - RACK.z) < 3);
    }
    return { ...look, keys };
  }
  debugExtra() { return { stage: this.stage, pallet: this.P2.state, fy: +this.F.fy.toFixed(2), fl: { x: +this.F.x.toFixed(2), z: +this.F.z.toFixed(2), yaw: +this.F.yaw.toFixed(2) } }; }
}
