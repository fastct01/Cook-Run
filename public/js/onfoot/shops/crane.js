// ─────────────────────────────────────────────────────────────────────────────
// crane — Rustbucket Junkyard. Climb into the magnet crane; A/D swing the boom, W/S run the trolley
// in/out, E drops the magnet (it grabs the TOPMOST thing under it) and E again releases. The copper
// coil is buried under a car door in a pile of wrecks: fish the door off, grab the coil, drop it in the
// RV's scrap bin. The `guard_dog` barks the whole time.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { createModel } from '../../assets/index.js';
import { ShopBase, clamp, wrap } from './ShopBase.js';
import { Kit, coil, textSign, glowSpot } from './build.js';
import { Avatar } from '../avatar.js';

const PILE = { x: -4.2, z: 6.4 };
const BIN = { x: 6.6, z: 4.4, w: 2.6, d: 1.8, h: 1.1 };
const CAB = { x: 1.5, z: -1.3 };
const TOP = 5.4, BOOM_Y = 6.2;

function pileH(x, z) { return Math.max(0, 1.7 - Math.hypot(x - PILE.x, z - PILE.z) * 0.42); }

export class CraneChallenge extends ShopBase {
  build() {
    const S = this.scene;
    S.background = new THREE.Color('#cdbfa6');
    S.fog = new THREE.Fog('#cdbfa6', 40, 110);
    S.add(new THREE.HemisphereLight('#efe3c8', '#7a6248', 1.25));
    const sun = new THREE.DirectionalLight('#ffe7c0', 2.3);
    sun.position.set(-10, 24, 14); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 80 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
    S.add(sun);

    // dirt yard + oil stains + tyre tracks
    const k = new Kit(1500);
    k.box('#8f7a5c', [70, 0.1, 60], [0, -0.05, 0]);
    for (let i = 0; i < 14; i++) { const a = i * 2.39, r = 3 + (i * 1.7) % 12; k.blob(i % 3 ? '#7d6a4e' : '#4a3f33', 0.6 + (i % 4) * 0.35, [Math.cos(a) * r, 0.003, Math.sin(a) * r], { seg: 8, seed: 1501 + i, off: 0 }); }
    // the scrap bin (open skip) by the RV
    k.at([BIN.x, 0, BIN.z], () => {
      const c = '#4f6a4a', t = 0.08;
      k.box(c, [BIN.w, 0.1, BIN.d], [0, 0, 0], { base: true });
      k.box(c, [BIN.w, BIN.h, t], [0, 0, BIN.d / 2], { base: true }); k.box(c, [BIN.w, BIN.h, t], [0, 0, -BIN.d / 2], { base: true });
      k.box(c, [t, BIN.h, BIN.d], [BIN.w / 2, 0, 0], { base: true }); k.box(c, [t, BIN.h, BIN.d], [-BIN.w / 2, 0, 0], { base: true });
      k.box('#d9b13a', [BIN.w + 0.04, 0.12, 0.1], [0, BIN.h - 0.12, BIN.d / 2], { base: true });
      k.box('#3a4a38', [BIN.w - 0.2, 0.02, BIN.d - 0.2], [0, 0.1, 0], { base: true });
    });
    // junk heaps around the yard edge (tyres, panels, drums)
    for (let i = 0; i < 10; i++) {
      const a = -0.6 + i * 0.5, x = Math.cos(a) * 14, z = Math.sin(a) * 11 - 2;
      for (let j = 0; j < 4; j++) k.torus('#262729', 0.36, 0.14, [x + (j % 2) * 0.7, 0.14 + Math.floor(j / 2) * 0.28, z], { rot: [Math.PI / 2, 0, 0], rs: 4, ts: 9 });
      k.box(['#8e5030', '#6f8fb0', '#7e9b6e'][i % 3], [1.6, 0.06, 1.0], [x - 1.2, 0.35, z + 0.4], { rot: [0.3, i, 0.2] });
      k.cyl('#9c4a32', 0.3, 0.3, 0.9, [x + 1.2, 0, z - 0.6], { base: true, seg: 8 });
    }
    // crane: crawler base (static)
    k.at([0, 0, 0], () => {
      for (const s of [1, -1]) { k.box('#2a2a2b', [0.7, 0.8, 4.2], [s * 1.25, 0, 0], { base: true, c: 0.2 }); k.box('#3a3b3d', [0.5, 0.1, 3.6], [s * 1.25, 0.8, 0], { base: true }); }
      k.box('#5f6468', [2.0, 0.5, 2.8], [0, 0.4, 0], { base: true });
      k.cyl('#3a3b3d', 1.05, 1.05, 0.25, [0, 0.9, 0], { base: true, seg: 12 });
    });
    const yard = k.mesh('yard'); yard.receiveShadow = true; S.add(yard);
    // turret (cab + counterweight + boom) — rotates
    const tk = new Kit(1510);
    tk.box('#d9b13a', [2.2, 1.6, 2.6], [0, 1.15, -0.4], { base: true, c: 0.08 });
    tk.box('#2e3a40', [1.0, 0.7, 0.05], [0.55, 1.9, 0.9], { base: true });
    tk.box('#2e3a40', [0.05, 0.7, 1.2], [1.11, 1.9, 0.0], { base: true });
    tk.box('#4c4f52', [2.0, 1.0, 1.0], [0, 1.15, -2.0], { base: true, c: 0.05 });
    tk.rectZ('#2b2622', -2.51, [-0.9, 0.9], [1.3, 1.9], -1, { off: 0.003 });
    // lattice boom: from the cab top to 12 m, along +Z
    const L = 12.2;
    for (const [x, y] of [[-0.35, BOOM_Y - 0.35], [0.35, BOOM_Y - 0.35], [-0.35, BOOM_Y + 0.35], [0.35, BOOM_Y + 0.35]]) tk.box('#d9b13a', [0.09, 0.09, L], [x, y, L / 2 + 0.2], {});
    for (let z = 0.6; z < L; z += 0.8) for (const [a, b] of [[[-0.35, BOOM_Y - 0.35], [0.35, BOOM_Y + 0.35]], [[0.35, BOOM_Y - 0.35], [-0.35, BOOM_Y + 0.35]]]) {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      tk.box('#c9a33a', [0.04, Math.hypot(dx, dy), 0.04], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z], { rot: [0, 0, -Math.atan2(dx, dy)] });
    }
    // mast from the cab to the boom root + stay
    tk.box('#d9b13a', [0.5, BOOM_Y - 2.6, 0.5], [0, 2.6, 0.2], { base: true });
    const turret = this.turret = tk.mesh('turret'); S.add(turret);
    const trk = new Kit(1511);
    trk.box('#3a3b3d', [0.9, 0.3, 0.7], [0, BOOM_Y - 0.6, 0], { base: true });
    trk.cyl('#5f6468', 0.12, 0.12, 0.9, [0, BOOM_Y - 0.65, 0], { axis: 'x', seg: 6 });
    this.trolley = trk.mesh('trolley'); S.add(this.trolley);
    const cable = this.cable = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 5).translate(0, -0.5, 0), new THREE.MeshLambertMaterial({ color: '#1f2022' }));
    cable.userData.ownGeo = true; S.add(cable);
    const mk = new Kit(1512);
    mk.cyl('#3a3b3d', 0.62, 0.62, 0.32, [0, -0.32, 0], { base: true, seg: 14 });
    mk.cyl('#c4372b', 0.5, 0.5, 0.06, [0, -0.36, 0], { base: true, seg: 14 });
    for (let i = 0; i < 3; i++) mk.box('#2a2a2b', [0.04, 0.5, 0.04], [Math.cos(i * 2.09) * 0.3, 0, Math.sin(i * 2.09) * 0.3], { base: true, rot: [Math.sin(i * 2.09) * 0.5, 0, -Math.cos(i * 2.09) * 0.5] });
    this.magnet = mk.mesh('magnet'); S.add(this.magnet);
    this.magGlow = glowSpot('#7fd6ff', 0.55, 0.25); this.magGlow.visible = false; this.magnet.add(this.magGlow); this.magGlow.position.y = -0.4;

    // the scrap pile of wrecks + the coil buried under a car door
    const wrecks = [['sedan', 2, -5.6, 6.8, 0.6, 0, 0.12], ['hatch', 3, -3.0, 7.4, 2.4, 0.15, -0.1], ['broken_car', 0, -4.6, 4.6, -0.9, 0, 0], ['sedan', 4, -4.0, 6.6, 1.3, 1.35, 0.35]];
    for (const [kind, v, x, z, r, y, roll] of wrecks) { const m = createModel(kind, v); m.position.set(x, y, z); m.rotation.set(roll * 0.4, r, roll); S.add(m); }
    const jk = new Kit(1520);
    for (let i = 0; i < 16; i++) { const a = i * 1.3, rr = 0.6 + (i % 5) * 0.55, x = PILE.x + Math.cos(a) * rr * 1.4, z = PILE.z + Math.sin(a) * rr; jk.box(['#8e5030', '#6a3820', '#7d8084', '#5f6468'][i % 4], [0.9, 0.08, 0.6], [x, pileH(x, z) * 0.7, z], { rot: [a, a * 2, a * 0.5] }); }
    for (let i = 0; i < 5; i++) jk.torus('#262729', 0.34, 0.13, [PILE.x + 2 - i * 0.9, 0.2 + (i % 2) * 0.4, PILE.z - 1.7], { rot: [1.2, i, 0], rs: 4, ts: 9 });
    S.add(jk.mesh('junk'));
    const COILP = { x: -3.7, z: 5.2 };
    const ck = new Kit(1530); coil(ck, [0, 0, 0]);
    const coilM = ck.mesh('coil');
    const dk = new Kit(1531);
    dk.box('#6f8fb0', [1.1, 0.07, 0.9], [0, 0, 0], { base: true, c: 0.02 });
    dk.box('#2e3a40', [0.6, 0.075, 0.4], [0.1, 0.0, 0.15], { base: true });
    dk.box('#bdbbb1', [0.16, 0.08, 0.04], [-0.35, 0.02, -0.2], { base: true });
    const doorM = dk.mesh('cardoor');
    const hk = new Kit(1532);
    hk.cyl('#bdbbb1', 0.24, 0.24, 0.05, [0, 0, 0], { base: true, seg: 12 }); hk.cyl('#7d8084', 0.1, 0.1, 0.06, [0, 0.0, 0], { base: true, seg: 8 });
    const capM = hk.mesh('hubcap');
    this.items = [
      { id: 'coil', m: coilM, x: COILP.x, z: COILP.z, y: pileH(COILP.x, COILP.z) * 0.8, h: 0.5, r: 0.5, state: 'pile' },
      { id: 'door', m: doorM, x: COILP.x + 0.1, z: COILP.z + 0.05, y: pileH(COILP.x, COILP.z) * 0.8 + 0.5, h: 0.08, r: 0.6, state: 'pile', rot: 0.4 },
      { id: 'hubcap', m: capM, x: -5.2, z: 6.0, y: pileH(-5.2, 6.0) + 0.1, h: 0.05, r: 0.3, state: 'pile' },
    ];
    for (const it of this.items) { it.m.position.set(it.x, it.y, it.z); it.m.rotation.y = it.rot || 0; S.add(it.m); }
    this.coilGlint = glowSpot('#ff9a4a', 0.55, 0.6); S.add(this.coilGlint);

    // set dressing: the yard office (store_junkyard) behind, RV, dog, owner
    const store = createModel('store_junkyard'); store.position.set(-2, 0, -20); S.add(store);
    const rv = createModel('rv'); rv.position.set(10.1, 0, 3.4); S.add(rv);
    const sign = textSign('rvbin', 'RV SCRAP BIN', 1.6, 0.36, { bg: '#d9b13a', fg: '#2b2622', px: 80 });
    sign.position.set(BIN.x, 1.45, BIN.z - BIN.d / 2 - 0.06); sign.rotation.y = Math.PI; S.add(sign);
    this.dog = createModel('guard_dog', 0); this.dog.position.set(-8, 0, -4.5); this.dog.rotation.y = 0.6; S.add(this.dog);
    this.dogHead = this.dog.getObjectByName('head'); this.dogTail = this.dog.getObjectByName('tail');
    const owner = new Avatar(createModel('clerk', 5), { name: 'owner' }); owner.set({ x: -6.2, z: -5.6, yaw: 0.5 }); S.add(owner.root); this.owner = owner;
    const ck2 = new Kit(1540); ck2.cyl('#5f6468', 0.08, 0.1, 0.5, [-8.6, 0, -5.2], { base: true, seg: 6 }); S.add(ck2.mesh('stake'));

    const W = this.world;
    W.bounds = { x0: -14, x1: 14, z0: -12, z1: 12 };
    W.box(-1.7, 1.7, -2.4, 2.4, 'crane');
    W.circle(PILE.x, PILE.z, 2.6, 'pile');
    W.box(BIN.x - BIN.w / 2, BIN.x + BIN.w / 2, BIN.z - BIN.d / 2, BIN.z + BIN.d / 2, 'bin');
    W.box(8.8, 11.4, -0.9, 7.7, 'rv');
    W.circle(-8, -4.5, 0.6, 'dog'); W.circle(-6.2, -5.6, 0.3, 'owner');

    Object.assign(this.rook, { x: 4.2, z: -5.5, yaw: -0.6 });
    this.cam = { ...this.cam, yaw: 0.35, dist: 8, h: 7, look: 1, fov: 54, lag: 3 };
    this.C = { th: -0.25, r: 6, my: TOP, mode: 'idle', held: null, target: TOP };
    this.stage = 'walk'; this.wasted = 0; this.barkT = 1.5;
    this.ring = glowSpot('#ffd36a', 0.5, 0.8); S.add(this.ring);
    this.extraKeys = [];
  }

  _magXZ() { const C = this.C; return { x: Math.sin(C.th) * C.r, z: Math.cos(C.th) * C.r }; }
  _surface(x, z, exclude = null) {
    let y = pileH(x, z);
    if (Math.abs(x - BIN.x) < BIN.w / 2 && Math.abs(z - BIN.z) < BIN.d / 2) y = Math.max(y, 0.15);
    for (const it of this.items) if (it !== exclude && it.state !== 'held' && it.state !== 'bin' && Math.hypot(it.x - x, it.z - z) < it.r + 0.3) y = Math.max(y, it.y + it.h);
    return y;
  }

  step(h) {
    const R = this.rook, C = this.C;
    this._dog(h);
    if (this.stage === 'walk') {
      this.walkRook(h);
      const at = this.near(CAB, 1.3);
      this.prompt = { text: at ? 'Climb into the crane [E]' : 'Get in the magnet crane', near: at };
      this.ring.visible = true; this.ring.position.set(CAB.x, 0, CAB.z);
      if (at && this.actPressed) { this.stage = 'crane'; this.rookAv.setVisible(false); this.ring.visible = false; }
      return;
    }
    // crane controls (A/D swing, W/S trolley) — disabled while the magnet is moving down/up
    const busy = C.mode === 'down' || C.mode === 'up';
    const sw = (this.held('KeyA') || this.held('ArrowLeft') ? 1 : 0) - (this.held('KeyD') || this.held('ArrowRight') ? 1 : 0);
    const tr = (this.held('KeyW') || this.held('ArrowUp') ? 1 : 0) - (this.held('KeyS') || this.held('ArrowDown') ? 1 : 0);
    if (!busy) { C.th += sw * 0.75 * h; C.r = clamp(C.r + tr * 2.6 * h, 2.8, 11.6); }
    const m = this._magXZ();
    if (C.mode === 'idle' && this.actPressed) {
      if (C.held) this._release(m);
      else { C.mode = 'down'; C.target = this._surface(m.x, m.z) + 0.05; }
    }
    if (C.mode === 'down') {
      C.my -= 4.2 * h;
      if (C.my <= C.target) { C.my = C.target; this._grab(m); C.mode = 'up'; }
    } else if (C.mode === 'up') {
      C.my += 3.2 * h;
      if (C.my >= TOP) { C.my = TOP; C.mode = 'idle'; }
    }
    if (C.held) { C.held.x = m.x; C.held.z = m.z; C.held.y = C.my - 0.36 - C.held.h; }
    // falling items
    for (const it of this.items) if (it.state === 'falling') {
      it.vy = (it.vy || 0) - 9.8 * h; it.y += it.vy * h;
      const floor = it.dest === 'bin' ? 0.15 : this._surface(it.x, it.z, it);
      if (it.y <= floor) { it.y = floor; it.vy = 0; it.state = it.dest === 'bin' ? 'bin' : 'ground'; this.shake = 0.35; if (it.id === 'coil' && it.state === 'bin') { this._finishOk(); return; } }
    }
    const coilIt = this.items[0];
    const overBin = Math.abs(m.x - BIN.x) < BIN.w / 2 && Math.abs(m.z - BIN.z) < BIN.d / 2;
    if (C.held) this.prompt = { text: overBin ? 'Over the bin — release [E]' : C.held.id === 'coil' ? 'Swing it over the RV scrap bin' : `Just a ${C.held.id === 'door' ? 'car door' : 'hubcap'} — drop it anywhere [E]`, near: overBin || C.held.id !== 'coil', sub: '[A][D] swing · [W][S] trolley' };
    else this.prompt = { text: busy ? (C.mode === 'down' ? 'Magnet going down…' : 'Lifting…') : 'Line up over the orange coil, then drop the magnet [E]', near: !busy && Math.hypot(m.x - coilIt.x, m.z - coilIt.z) < 0.8, sub: '[A][D] swing the boom · [W][S] trolley in/out' };
  }
  _grab(m) {
    const C = this.C;
    let best = null;
    for (const it of this.items) {
      if (it.state === 'held' || it.state === 'bin' || it.state === 'falling') continue;
      if (Math.hypot(it.x - m.x, it.z - m.z) > it.r + 0.35) continue;
      if (!best || it.y > best.y) best = it;
    }
    if (best) {
      C.held = best; best.state = 'held';
      this.popAt(best.id === 'coil' ? 'GOT THE COIL!' : best.id === 'door' ? 'Clang — a car door' : 'Just a hubcap…', best.id === 'coil' ? 'good' : 'info', m.x, C.my + 1.0, m.z);
      if (best.id === 'hubcap') this.wasted++;
    } else { this.wasted++; this.popAt('Nothing but rust', 'bad', m.x, C.my + 1.0, m.z); }
  }
  _release(m) {
    const C = this.C, it = C.held;
    C.held = null;
    const inBin = Math.abs(m.x - BIN.x) < BIN.w / 2 - 0.2 && Math.abs(m.z - BIN.z) < BIN.d / 2 - 0.2;
    it.state = 'falling'; it.dest = inBin ? 'bin' : 'ground'; it.vy = 0;
    if (inBin) this.popAt(it.id === 'coil' ? 'IN THE BIN!' : 'Clunk.', 'good', m.x, 2.5, m.z);
  }
  _dog(h) {
    this.barkT -= h;
    if (this.barkT <= 0) { this.barkT = 1.6 + (Math.sin(this.t * 3.1) + 1) * 0.9; this.barkPose = 0.35; this.popAt(['WOOF!', 'WOOF WOOF!', 'Arf!'][Math.floor(this.t) % 3], 'info', -8, 1.8, -4.5); }
    this.barkPose = Math.max(0, (this.barkPose || 0) - h);
  }

  _finishOk() {
    const tf = this.timeLeft / this.timeLimit;
    const score = clamp(0.3 + 0.6 * tf + 0.12 * Math.max(0, 1 - 0.34 * this.wasted), 0.05, 1);
    this.finish(score, [`Coil fished out in ${Math.round(this.t + this.penalty)}s`, this.wasted ? `Wasted grabs: ${this.wasted}` : 'Clean grabs only', 'The dog approves (probably)']);
  }
  timeUp() { return { score: this.C.held && this.C.held.id === 'coil' ? 0.2 : 0.05, lines: ['The coil stayed in the pile'] }; }

  visual(dt) {
    const C = this.C, m = this._magXZ();
    this.turret.rotation.y = C.th;
    this.trolley.position.set(m.x, 0, m.z); this.trolley.rotation.y = C.th;
    this.magnet.position.set(m.x, C.my, m.z);
    const len = BOOM_Y - 0.65 - C.my;
    this.cable.position.set(m.x, BOOM_Y - 0.65, m.z); this.cable.scale.set(1, Math.max(0.05, len), 1);
    this.magGlow.visible = C.mode === 'down' || !!C.held; if (this.magGlow.visible) this.magGlow.userData.set(0.5 + 0.5 * Math.sin(this.t * 12));
    for (const it of this.items) { it.m.position.set(it.x, it.y, it.z); if (it.state === 'held') it.m.rotation.y += dt * 0.6; }
    const coilIt = this.items[0];
    this.coilGlint.visible = coilIt.state !== 'bin'; this.coilGlint.position.set(coilIt.x, coilIt.y - 0.05, coilIt.z); this.coilGlint.userData.set(0.35 + 0.25 * Math.sin(this.t * 4));
    if (this.dogHead) { this.dogHead.rotation.x = this.barkPose > 0 ? -0.5 + Math.sin(this.t * 40) * 0.2 : Math.sin(this.t * 2) * 0.1; }
    if (this.dogTail) this.dogTail.rotation.y = Math.sin(this.t * 16) * 0.6;
    this.dog.position.y = this.barkPose > 0 ? Math.abs(Math.sin(this.t * 20)) * 0.12 : 0;
    this.owner.s.lookY = Math.sin(this.t * 0.6) * 0.5; this.owner.update(dt);
    if (this.ring.visible) this.ring.userData.set(0.55 + 0.45 * Math.sin(this.t * 5));
    if (this.stage === 'walk') { this.cam.x = this.rook.x; this.cam.z = this.rook.z; }
    else {
      // high three-quarter view from beside the cab, centred between the cab and the magnet
      const fx = m.x * 0.75, fz = m.z * 0.75;
      this.cam.x = fx; this.cam.z = fz;
      this.cam.yaw += wrap(C.th + 0.75 - this.cam.yaw) * Math.min(1, dt * 1.2);
      this.cam.dist = 9.5; this.cam.h = 13.5; this.cam.look = 0.8;
    }
  }

  bot(h) {
    const R = this.rook, C = this.C;
    if (this.stage === 'walk') {
      if (this.near(CAB, 1.1)) return { act: true };
      const P = this._bp || (this._bp = this.world.path(R.x, R.z, CAB.x, CAB.z, 0.34));
      while (P.length > 1 && Math.hypot(P[0].x - R.x, P[0].z - R.z) < 0.45) P.shift();
      const w = P[0] || CAB, dx = w.x - R.x, dz = w.z - R.z, l = Math.hypot(dx, dz) || 1;
      return { move: { x: dx / l, z: dz / l }, run: true };
    }
    if (C.mode !== 'idle') return {};
    const coilIt = this.items[0], door = this.items[1];
    let tgt, act = false;
    if (C.held) tgt = C.held.id === 'coil' ? { x: BIN.x, z: BIN.z } : { x: -6.5, z: 1.5 };
    else tgt = door.state === 'pile' ? { x: door.x, z: door.z } : { x: coilIt.x, z: coilIt.z };
    const th = Math.atan2(tgt.x, tgt.z), r = Math.hypot(tgt.x, tgt.z);
    const dth = wrap(th - C.th), dr = r - C.r;
    const keys = [];
    if (Math.abs(dth) > 0.02) keys.push(dth > 0 ? 'KeyA' : 'KeyD');
    if (Math.abs(dr) > 0.08) keys.push(dr > 0 ? 'KeyW' : 'KeyS');
    if (!keys.length) { this._cd = (this._cd || 0) + h; if (this._cd > 0.2) { this._cd = 0; act = true; } }
    return { keys, act };
  }
  debugExtra() { return { stage: this.stage, mode: this.C.mode, held: this.C.held ? this.C.held.id : null, th: +this.C.th.toFixed(2), r: +this.C.r.toFixed(2), coil: this.items[0].state, door: this.items[1].state }; }
}
