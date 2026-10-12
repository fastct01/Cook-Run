// ─────────────────────────────────────────────────────────────────────────────
// crane — Round 3 first person. Rustbucket Junkyard. Doc walks to the magnet crane and climbs into its cab
// (look at the cab door + E). From the seat: A/D swing the boom (the whole turret — and Doc — turns with it),
// W/S run the trolley in/out, E drops the magnet (it grabs the TOPMOST thing under it) and E again releases;
// the mouse looks around the open cab (up at the magnet, down at the pile). The copper coil is buried under a car
// door in a pile of wrecks: fish the door off, grab the coil, drop it in the RV's scrap bin. The `guard_dog`
// barks the whole time. His gloved hands work the two joysticks (left: swing, right: trolley).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { createModel } from '../../assets/index.js';
import { FpShop, clamp, wrap } from './fpBase.js';
import { Kit, coil, textSign, glowSpot } from './build.js';
import { Avatar } from '../avatar.js';

const PILE = { x: -4.2, z: 6.4 };
const BIN = { x: 6.6, z: 4.4, w: 2.6, d: 1.8, h: 1.1 };
const DOOR = { x: 1.75, z: -1.15 };          // where Doc stands to climb in (beside the crawler)
const TOP = 5.4, BOOM_Y = 6.2;
const EYE_T = { x: 0.42, y: 2.32, z: 0.42 }; // Doc's eye in the cab, turret-local (+Z = along the boom)
const _p = new THREE.Vector3();

function pileH(x, z) { return Math.max(0, 1.7 - Math.hypot(x - PILE.x, z - PILE.z) * 0.42); }

export class CraneChallenge extends FpShop {
  controls() {
    return this.stage === 'crane'
      ? [['A D', 'swing'], ['W S', 'trolley'], ['E', 'magnet'], ['Mouse', 'look']]
      : [['Mouse', 'look'], ['W A S D', 'walk'], ['Shift', 'run'], ['E', 'climb in']];
  }

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
    // crane: crawler base (static) + a step up to the cab
    k.at([0, 0, 0], () => {
      for (const s of [1, -1]) { k.box('#2a2a2b', [0.7, 0.8, 4.2], [s * 1.25, 0, 0], { base: true, c: 0.2 }); k.box('#3a3b3d', [0.5, 0.1, 3.6], [s * 1.25, 0.8, 0], { base: true }); }
      k.box('#5f6468', [2.0, 0.5, 2.8], [0, 0.4, 0], { base: true });
      k.cyl('#3a3b3d', 1.05, 1.05, 0.25, [0, 0.9, 0], { base: true, seg: 12 });
    });
    k.box('#5f6468', [0.5, 0.06, 0.4], [DOOR.x - 0.1, 0.42, DOOR.z], { base: true });
    const yard = k.mesh('yard'); yard.receiveShadow = true; S.add(yard);

    // turret (counterweight + mast + lattice boom) and the open cab Doc sits in — all rotate with the swing
    const turret = this.turret = new THREE.Group(); S.add(turret);
    const tk = new Kit(1510);
    tk.box('#4c4f52', [2.0, 1.0, 1.0], [0, 1.15, -2.0], { base: true, c: 0.05 });                 // counterweight
    tk.rectZ('#2b2622', -2.51, [-0.9, 0.9], [1.3, 1.9], -1, { off: 0.003 });
    tk.box('#d9b13a', [2.2, 0.35, 2.6], [0, 1.0, -0.4], { base: true, c: 0.04 });                 // turret deck
    const L = 12.2;
    for (const [x, y] of [[-0.35, BOOM_Y - 0.35], [0.35, BOOM_Y - 0.35], [-0.35, BOOM_Y + 0.35], [0.35, BOOM_Y + 0.35]]) tk.box('#d9b13a', [0.09, 0.09, L], [x, y, L / 2 + 0.2], {});
    for (let z = 0.6; z < L; z += 0.8) for (const [a, b] of [[[-0.35, BOOM_Y - 0.35], [0.35, BOOM_Y + 0.35]], [[0.35, BOOM_Y - 0.35], [-0.35, BOOM_Y + 0.35]]]) {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      tk.box('#c9a33a', [0.04, Math.hypot(dx, dy), 0.04], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z], { rot: [0, 0, -Math.atan2(dx, dy)] });
    }
    tk.box('#d9b13a', [0.42, BOOM_Y - 1.35, 0.42], [-0.2, 1.35, -1.25], { base: true });           // mast (behind the cab)
    for (const x of [-0.32, 0.32]) tk.box('#c9a33a', [0.06, 0.06, 1.7], [x, BOOM_Y - 0.3, -0.45], { rot: [0.35, 0, 0] });   // stays to the boom root
    const tm = tk.mesh('turret'); tm.castShadow = true; turret.add(tm);
    turret.add(this._cab());

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
    // the spot under the magnet (so you can line it up from the cab)
    this.aimSpot = glowSpot('#F2B90F', 0.42, 0.7); S.add(this.aimSpot);

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
    W.box(-1.7, 1.55, -2.4, 2.4, 'crane');
    W.circle(PILE.x, PILE.z, 2.6, 'pile');
    W.box(BIN.x - BIN.w / 2, BIN.x + BIN.w / 2, BIN.z - BIN.d / 2, BIN.z + BIN.d / 2, 'bin');
    W.box(8.8, 11.4, -0.9, 7.7, 'rv');
    W.circle(-8, -4.5, 0.6, 'dog'); W.circle(-6.2, -5.6, 0.3, 'owner');

    // Doc starts by the yard office path, facing the crane
    Object.assign(this.P, { x: 4.4, z: -6.2, yaw: Math.atan2(DOOR.x - 4.4, DOOR.z + 6.2), pitch: 0.05 });
    this.C = { th: -0.25, r: 6, my: TOP, mode: 'idle', held: null, target: TOP, sw: 0, tr: 0 };
    this.stage = 'walk'; this.wasted = 0; this.barkT = 1.5;
    this.ring = glowSpot('#F2B90F', 0.5, 0.8); S.add(this.ring);
    this.extraKeys = [];
    this.doorT = this.addTarget({
      id: 'cab', pos: new THREE.Vector3(DOOR.x - 0.3, 1.5, DOOR.z), r: 0.7, reach: 2.6, label: 'Climb into the crane', los: false,
      when: () => this.stage === 'walk', use: () => this._climbIn(),
    });
    this.goal = new THREE.Vector3(DOOR.x - 0.3, 1.6, DOOR.z);
    this.hands.setPose('idle', 0.01);
    this._task();
  }

  /** The open cab, turret-local (+Z along the boom): floor, seat, dash, two joysticks, corner posts and a roof. */
  _cab() {
    const k = new Kit(1515);
    const Y = '#d9b13a', D = '#2b2c2e', G = '#4c4f52';
    k.box(D, [1.5, 0.05, 1.6], [0.35, 1.18, 0.1], { base: true });                          // cab floor
    k.box(Y, [1.55, 0.55, 0.12], [0.35, 1.2, 0.92], { base: true, c: 0.02 });                // front sill (low: the pile stays in view)
    k.box(D, [1.3, 0.05, 0.4], [0.35, 1.74, 0.8], { base: true, rot: [-0.25, 0, 0] });       // dash top
    k.box(D, [0.5, 0.12, 0.45], [0.42, 1.55, 0.05], { base: true, c: 0.03 });               // seat
    k.box(D, [0.5, 0.65, 0.1], [0.42, 1.62, -0.22], { base: true, c: 0.03, rot: [-0.12, 0, 0] });
    for (const [x, z] of [[1.1, 0.95], [-0.4, 0.95], [1.1, -0.7], [-0.4, -0.7]]) k.box(Y, [0.06, 1.55, 0.06], [x, 1.22, z], { base: true });
    k.box(Y, [1.62, 0.07, 1.78], [0.35, 2.78, 0.12], { base: true });                       // roof
    for (let i = 0; i < 3; i++) k.box(G, [1.5, 0.03, 0.04], [0.35, 2.74, -0.5 + i * 0.6], { base: true });
    // joysticks: left = swing (turret), right = trolley + magnet button
    for (const [x, col] of [[0.74, '#c4372b'], [0.12, '#2b2c2e']]) {
      k.box(G, [0.16, 0.18, 0.2], [x, 1.62, 0.36], { base: true, c: 0.02 });
      k.cyl('#5f6468', 0.014, 0.014, 0.22, [x, 1.8, 0.38], { base: true, seg: 6 });
      k.cyl(col, 0.035, 0.03, 0.08, [x, 2.02, 0.38], { base: true, seg: 8 });
    }
    // a little load gauge + a warning sticker on the sill
    k.cyl('#efe9dc', 0.06, 0.06, 0.02, [0.42, 1.86, 0.86], { base: true, seg: 12, rot: [Math.PI / 2 - 0.25, 0, 0] });
    k.box('#e5483a', [0.3, 0.08, 0.005], [0.05, 1.6, 0.985], { base: true });
    const m = k.mesh('crane_cab_fp');
    m.castShadow = true;
    return m;
  }

  _climbIn() {
    if (this.stage !== 'walk') return;
    this.stage = 'crane';
    this.P.seated = true;
    Object.assign(this.P, { yaw: 0, pitch: 0.18 });
    this.look.yawMin = -1.7; this.look.yawMax = 1.7; this.look.minPitch = -0.75; this.look.maxPitch = 1.05;
    this.ring.visible = false;
    this.hands.setPose('lever', 0.25);
    this.hud.setControls?.(this.controls());
    this.toast('In the cab — swing over the pile', 'info');
    this._task();
  }

  cameraPose() {
    if (this.stage !== 'crane') return null;
    const th = this.C.th, c = Math.cos(th), s = Math.sin(th);
    const busy = this.C.mode === 'down' || this.C.mode === 'up';
    return {
      x: EYE_T.x * c + EYE_T.z * s, y: EYE_T.y + (busy ? Math.sin(this.t * 31) * 0.003 : 0), z: -EYE_T.x * s + EYE_T.z * c,
      yaw: th + this.P.yaw, pitch: this.P.pitch, lookYaw: this.P.yaw,
    };
  }

  _task() {
    const coilIt = this.items[0], door = this.items[1];
    const inCab = this.stage === 'crane';
    const doorOff = door.state !== 'pile';
    const gotCoil = coilIt.state === 'held' || coilIt.state === 'falling' || coilIt.state === 'bin';
    const rows = [
      { text: 'Climb into the crane', icon: 'door', state: inCab ? 'done' : 'cur' },
      { text: 'Fish the car door off', icon: 'magnet', state: !inCab ? 'todo' : doorOff ? 'done' : 'cur' },
      { text: 'Grab the copper coil', icon: 'coil', state: gotCoil ? 'done' : inCab && doorOff ? 'cur' : 'todo' },
      { text: 'Drop it in the RV bin', icon: 'check', state: coilIt.state === 'bin' ? 'done' : gotCoil ? 'cur' : 'todo' },
    ];
    const n = rows.filter((r) => r.state === 'done').length;
    this.hud.setTask({ cap: 'Magnet crane', n: `${n}/4`, store: this.def.name, rows, foot: 'The coil glows orange under a blue car door.' });
  }

  _magXZ() { const C = this.C; return { x: Math.sin(C.th) * C.r, z: Math.cos(C.th) * C.r }; }
  _surface(x, z, exclude = null) {
    let y = pileH(x, z);
    if (Math.abs(x - BIN.x) < BIN.w / 2 && Math.abs(z - BIN.z) < BIN.d / 2) y = Math.max(y, 0.15);
    for (const it of this.items) if (it !== exclude && it.state !== 'held' && it.state !== 'bin' && Math.hypot(it.x - x, it.z - z) < it.r + 0.3) y = Math.max(y, it.y + it.h);
    return y;
  }

  step(h) {
    const C = this.C;
    this._dog(h);
    if (this.stage === 'walk') {
      this.walkStep(h);
      this.ring.visible = true; this.ring.position.set(DOOR.x, 0.01, DOOR.z);
      this.promptOverride = null;
      return;
    }
    // crane controls (A/D swing, W/S trolley) — locked while the magnet is moving down/up
    const busy = C.mode === 'down' || C.mode === 'up';
    const sw = (this.held('KeyA') || this.held('ArrowLeft') ? 1 : 0) - (this.held('KeyD') || this.held('ArrowRight') ? 1 : 0);
    const tr = (this.held('KeyW') || this.held('ArrowUp') ? 1 : 0) - (this.held('KeyS') || this.held('ArrowDown') ? 1 : 0);
    C.sw = busy ? 0 : sw; C.tr = busy ? 0 : tr;
    if (!busy) { C.th += sw * 0.75 * h; C.r = clamp(C.r + tr * 2.6 * h, 2.8, 11.6); }
    const m = this._magXZ();
    if (C.mode === 'idle' && this.actPressed) {
      this.consumeAct();
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
      if (it.y <= floor) {
        it.y = floor; it.vy = 0; it.state = it.dest === 'bin' ? 'bin' : 'ground'; this.shake = Math.max(this.shake, 0.35);
        this._task();
        if (it.id === 'coil' && it.state === 'bin') { this._finishOk(); return; }
      }
    }
    const coilIt = this.items[0], door = this.items[1];
    const overBin = Math.abs(m.x - BIN.x) < BIN.w / 2 && Math.abs(m.z - BIN.z) < BIN.d / 2;
    if (C.held) {
      this.promptOverride = overBin ? { key: 'E', text: 'Over the bin — release', sub: '' }
        : C.held.id === 'coil' ? { key: 'A', text: 'Swing it over the RV scrap bin', sub: 'A D swing · W S trolley' }
        : { key: 'E', text: `Just a ${C.held.id === 'door' ? 'car door' : 'hubcap'} — drop it anywhere`, sub: '' };
      this.goal = C.held.id === 'coil' ? new THREE.Vector3(BIN.x, BIN.h + 0.4, BIN.z) : null;
    } else {
      const tgt = door.state === 'pile' ? door : coilIt;
      const lined = Math.hypot(m.x - tgt.x, m.z - tgt.z) < 0.6;
      this.promptOverride = busy ? { key: '', text: C.mode === 'down' ? 'Magnet going down…' : 'Lifting…', sub: '' }
        : lined ? { key: 'E', text: tgt === door ? 'Over the car door — drop the magnet' : 'Over the coil — drop the magnet', sub: '' }
        : { key: 'A', text: tgt === door ? 'Line up over the blue car door on the pile' : 'Line up over the orange coil', sub: 'A D swing · W S trolley · watch the yellow spot' };
      this.goal = new THREE.Vector3(tgt.x, tgt.y + 0.4, tgt.z);
    }
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
      this.toast(best.id === 'coil' ? 'GOT THE COIL!' : best.id === 'door' ? 'Clang — a car door' : 'Just a hubcap…', best.id === 'coil' ? 'good' : 'info');
      if (best.id === 'hubcap') this.wasted++;
      this._task();
    } else { this.wasted++; this.toast('Nothing but rust', 'bad'); }
  }
  _release(m) {
    const C = this.C, it = C.held;
    C.held = null;
    const inBin = Math.abs(m.x - BIN.x) < BIN.w / 2 - 0.2 && Math.abs(m.z - BIN.z) < BIN.d / 2 - 0.2;
    it.state = 'falling'; it.dest = inBin ? 'bin' : 'ground'; it.vy = 0;
    if (inBin) this.toast(it.id === 'coil' ? 'IN THE BIN!' : 'Clunk.', 'good');
  }
  _dog(h) {
    this.barkT -= h;
    if (this.barkT <= 0) { this.barkT = 1.6 + (Math.sin(this.t * 3.1) + 1) * 0.9; this.barkPose = 0.35; }
    this.barkPose = Math.max(0, (this.barkPose || 0) - h);
  }

  _finishOk() {
    const tf = this.timeLeft / this.timeLimit;
    const score = clamp(0.3 + 0.6 * tf + 0.12 * Math.max(0, 1 - 0.34 * this.wasted), 0.05, 1);
    this.finish(score, [`Coil fished out in ${Math.round(this.t + this.penalty)}s`, this.wasted ? `Wasted grabs: ${this.wasted}` : 'Clean grabs only', 'The dog approves (probably)']);
  }
  timeUp() { return { score: this.C.held && this.C.held.id === 'coil' ? 0.2 : 0.05, lines: ['The coil stayed in the pile'] }; }
  progress() {
    const coilIt = this.items[0], door = this.items[1];
    if (this.stage === 'walk') return { label: 'To the crane', frac: 0.05 };
    if (coilIt.state === 'bin') return { label: 'In the bin', frac: 1 };
    if (coilIt.state === 'held' || coilIt.state === 'falling') return { label: 'Coil on the magnet', frac: 0.75 };
    if (door.state !== 'pile') return { label: 'Door off the pile', frac: 0.45 };
    return { label: 'Crane running', frac: 0.2 };
  }

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
    // the yellow spot under the magnet (only from the cab, while nothing hangs on it)
    const showSpot = this.stage === 'crane';
    this.aimSpot.visible = showSpot;
    if (showSpot) { this.aimSpot.position.set(m.x, this._surface(m.x, m.z, C.held) + 0.03, m.z); this.aimSpot.userData.set(0.45 + 0.25 * Math.sin(this.t * 6)); }
    if (this.dogHead) { this.dogHead.rotation.x = this.barkPose > 0 ? -0.5 + Math.sin(this.t * 40) * 0.2 : Math.sin(this.t * 2) * 0.1; }
    if (this.dogTail) this.dogTail.rotation.y = Math.sin(this.t * 16) * 0.6;
    this.dog.position.y = this.barkPose > 0 ? Math.abs(Math.sin(this.t * 20)) * 0.12 : 0;
    this.owner.s.lookY = Math.sin(this.t * 0.6) * 0.5; this.owner.update(dt);
    if (this.ring.visible) this.ring.userData.set(0.55 + 0.45 * Math.sin(this.t * 5));
    // hands on the joysticks: act = trolley push/pull, act2 = swing
    this.handAct = this.stage === 'crane' ? C.tr : 0;
    this.handAct2 = this.stage === 'crane' ? -C.sw : 0;
    this.alertInfo = this.stage === 'crane'
      ? { icon: 'magnet', text: C.held ? `Holding: ${C.held.id === 'coil' ? 'the coil' : C.held.id === 'door' ? 'a car door' : 'a hubcap'}` : 'Magnet empty', sub: `Reach ${C.r.toFixed(1)} m`, frac: (C.r - 2.8) / 8.8, tone: C.held && C.held.id === 'coil' ? 'green' : 'amber' }
      : null;
  }

  bot(h) {
    const C = this.C, P = this.P;
    if (this.stage === 'walk') return this.botUse(this.doorT, h, { stand: { x: DOOR.x + 0.15, z: DOOR.z - 0.55 } });
    // look at the magnet's target from the seat (turret-relative), like a player would
    const coilIt = this.items[0], door = this.items[1];
    let tgt, act = false;
    if (C.held) tgt = C.held.id === 'coil' ? { x: BIN.x, z: BIN.z } : { x: -6.5, z: 1.5 };
    else tgt = door.state === 'pile' ? { x: door.x, z: door.z } : { x: coilIt.x, z: coilIt.z };
    const pose = this.cameraPose();
    _p.set(tgt.x - pose.x, 0, tgt.z - pose.z);
    const lookYaw = clamp(wrap(Math.atan2(_p.x, _p.z) - C.th), -1.6, 1.6);
    const look = { yaw: lookYaw, pitch: clamp(Math.atan2(0.5 - pose.y, Math.hypot(_p.x, _p.z)), -0.7, 1.0) };
    if (C.mode !== 'idle') return look;
    const th = Math.atan2(tgt.x, tgt.z), r = Math.hypot(tgt.x, tgt.z);
    const dth = wrap(th - C.th), dr = r - C.r;
    const keys = [];
    if (Math.abs(dth) > 0.02) keys.push(dth > 0 ? 'KeyA' : 'KeyD');
    if (Math.abs(dr) > 0.08) keys.push(dr > 0 ? 'KeyW' : 'KeyS');
    if (!keys.length) { this._cd = (this._cd || 0) + h; if (this._cd > 0.2) { this._cd = 0; act = true; } }
    return { ...look, keys, act };
  }
  debugExtra() { return { stage: this.stage, mode: this.C.mode, held: this.C.held ? this.C.held.id : null, th: +this.C.th.toFixed(2), r: +this.C.r.toFixed(2), coil: this.items[0].state, door: this.items[1].state }; }
}
