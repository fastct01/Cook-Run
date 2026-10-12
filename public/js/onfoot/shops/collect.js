// ─────────────────────────────────────────────────────────────────────────────
// collect — Round 3 first person (agent SHOPS). Doc inside `shop_hardware_interior`.
//  • Bolt & Barrel Hardware ("Shopping list sprint"): sprint the aisles, LOOK at each listed item + E to grab
//    it, stay out of the two sweeping camera cones (1.5 s in view → "HEY!" from the clerk on the phone, −8 s),
//    then back out of the door to the RV.
//  • MegaMart (variant `trolley`): push the trolley (handle and hands in view, heavy turning), grab the items
//    into it, dodge the walking staff and the wet floor, then beat the self-checkout beam (stop it in the green
//    once per item).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { createModel, cloneInstanceMaterials } from '../../assets/index.js';
import { FpShop, clamp, wrap, EYE } from './fpBase.js';
import { Kit, textSign, glowSpot, wetSign } from './build.js';
import { Avatar } from '../avatar.js';

const LEV = [0.15, 0.62, 1.09, 1.56];
// glow position (on a shelf level) + the aisle point in front of it
const SPOTS = [
  { glow: [-1.5, LEV[2] + 0.005, -0.8], stand: [-0.95, -0.8], part: 'item_0' },
  { glow: [5.13, LEV[1] + 0.005, 0.82], stand: [4.55, 0.82], part: 'item_1' },
  { glow: [6.8, 0.012, -6.2], stand: [6.8, -5.5], part: 'item_2' },
  { glow: [-5.13, LEV[1] + 0.005, -2.6], stand: [-4.55, -2.6], part: null },
  { glow: [2.07, LEV[2] + 0.005, -3.1], stand: [2.62, -3.1], part: null },
];
const NAMES = {
  collect: [['Duct tape', 'tape'], ['Rubber gloves', 'hand'], ['Big funnel', 'funnel'], ['Hose clamps', 'box'], ['Zip ties', 'tag']],
  trolley: [['Bag of ice', 'snow'], ['Cooler box', 'box'], ['Paper towels', 'box'], ['Snack crate', 'box'], ['Dish soap', 'drop']],
};
const DOOR = { x: -3.0, z: 6.55 };           // entrance x −3.8..−2.2 in the front wall (z 7)
const KIOSK = { x: 1.6, z: 5.85, stand: { x: 1.6, z: 4.7 } };
const T_OFF = 0.62;                          // trolley centre ahead of Doc

export class CollectChallenge extends FpShop {
  controls() {
    return this.shop.variant === 'trolley'
      ? [['Mouse', 'steer'], ['W S', 'push'], ['A D', 'turn'], ['Shift', 'hurry'], ['E', 'grab']]
      : [['Mouse', 'look'], ['W A S D', 'walk'], ['Shift', 'run'], ['E', 'grab']];
  }

  build() {
    const trolley = this.trolleyMode = this.shop.variant === 'trolley';
    const S = this.scene;
    S.background = new THREE.Color(trolley ? '#30353b' : '#2b2826');
    S.add(new THREE.HemisphereLight('#eef3f6', '#7d7466', trolley ? 1.45 : 1.3));
    const sun = new THREE.DirectionalLight('#fff4e0', 1.1);
    sun.position.set(-6, 18, 9); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 11, bottom: -11, near: 1, far: 50 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    S.add(sun);
    for (const x of [-5.4, 0, 5.4]) { const L = new THREE.PointLight(trolley ? '#e8f2ff' : '#fff2da', 9, 12, 1.4); L.position.set(x, 3.9, -0.9); S.add(L); }

    const it = this.interior = createModel('shop_hardware_interior');
    this.mats = cloneInstanceMaterials(it);
    S.add(it);
    // first person: a dark ceiling deck over the open joists
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(20, 14), new THREE.MeshLambertMaterial({ color: '#3a3d40' }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 4.62, 0); ceil.userData.ownGeo = true; S.add(ceil);
    this.cams = (it.userData.cams || []).map((c, i) => ({ ...c, obj: it.getObjectByName(c.name), view: it.getObjectByName(c.name + '_view'), mat: this.mats[`cam_${i}_view_mesh`] }));
    if (trolley) {
      for (const c of this.cams) if (c.view) c.view.visible = false;
      const banner = textSign('megamart_in', 'MEGAMART', 4.6, 0.8, { bg: '#b8392e', fg: '#efe9dc', px: 110, border: '#e2b93b' });
      banner.position.set(0, 3.25, -6.95); S.add(banner);
      const slog = textSign('megamart_slogan', 'EVERYTHING · ALWAYS · ISH', 3.2, 0.36, { bg: '#2f5f8a', fg: '#efe9dc', px: 60 });
      slog.position.set(0, 2.62, -6.94); S.add(slog);
    }

    const W = this.world;
    W.bounds = { x0: -10, x1: 10, z0: -7, z1: 7 };
    for (const x of [-5.4, -1.8, 1.8, 5.4]) W.box(x - 0.47, x + 0.47, -4.65, 2.65, 'shelf');
    W.circle(-5.4, 3.0, 0.42, 'buckets'); W.box(4.9, 5.9, 2.75, 3.95, 'pallet');
    W.box(-6.1, 6.1, -7, -6.42, 'shelf');
    W.box(7.3, 8.75, -7, -6.15, 'ladder');
    W.circle(9.5, 0.2, 0.38, 'bin');
    W.box(-7.58, -6.82, 2.65, 5.35, 'counter'); W.box(-9.4, -7.55, 2.3, 3.08, 'counter');
    W.circle(-1.5, 6.1, 0.3, 'baskets');

    // clerk on the phone behind the counter
    const ck = this.clerk = new Avatar(createModel('clerk', 0), { name: 'clerk' });
    const spot = it.getObjectByName('clerk_spot');
    ck.set({ x: spot ? spot.position.x : -8.15, z: spot ? spot.position.z : 4.4, yaw: Math.PI / 2 });
    S.add(ck.root);
    W.circle(ck.s.x, ck.s.z, 0.3, 'clerk');

    // items: glow spot + a chunky prop + a floor ring in the aisle
    const N = clamp(this.shop.items || 3, 1, SPOTS.length);
    const order = trolley ? [0, 1, 3, 2, 4] : [0, 1, 2, 3, 4];
    const names = NAMES[trolley ? 'trolley' : 'collect'];
    this.items = [];
    const base = it.getObjectByName('item_0');
    for (let i = 0; i < SPOTS.length; i++) { const p = it.getObjectByName(`item_${i}`); if (p) p.visible = false; }
    for (let n = 0; n < N; n++) {
      const sp = SPOTS[order[n]];
      let glow;
      if (sp.part && it.getObjectByName(sp.part)) glow = it.getObjectByName(sp.part);
      else { glow = base.clone(); const m = glow.getObjectByName('item_0_mesh'); if (m) m.material = m.material.clone(); it.add(glow); }
      glow.position.set(...sp.glow); glow.visible = true;
      const gm = glow.children[0] && glow.children[0].material;
      const prop = this._itemProp(n, trolley); prop.position.set(sp.glow[0], sp.glow[1], sp.glow[2]); S.add(prop);
      const ring = glowSpot('#F2B90F', 0.36, 0.01); ring.position.set(sp.stand[0], 0, sp.stand[1]); S.add(ring);
      const item = { name: names[n][0], icon: names[n][1], glow, gm, prop, ring, stand: { x: sp.stand[0], z: sp.stand[1] }, got: false };
      item.target = this.addTarget({
        id: 'item' + n, pos: new THREE.Vector3(sp.glow[0], sp.glow[1] + 0.13, sp.glow[2]), r: 0.34, reach: trolley ? 2.9 : 2.5,
        label: `Grab ${item.name.toLowerCase()}`, when: () => !item.got && this.stage === 'shop',
        use: () => this._grab(item),
      });
      this.items.push(item);
    }

    // Doc at the entrance, looking down the store
    Object.assign(this.P, { x: -3.0, z: 6.0, yaw: Math.PI, pitch: -0.12 });
    this.seenT = 0; this.spotted = 0; this.graceT = 0; this.heyT = 0;
    this.bumps = 0; this.misses = 0; this.scanHits = 0;
    this.stage = 'shop';
    this.exitRing = glowSpot('#5BBF6A', 0.55, 1.2); this.exitRing.visible = false; S.add(this.exitRing);
    this.exitRing.position.set(trolley ? KIOSK.stand.x : DOOR.x, 0, trolley ? KIOSK.stand.z : DOOR.z);

    if (trolley) this._buildTrolley();
    else this.hands.setPose('walk', 0.01);
    this._task();
  }

  _itemProp(n, trolley) {
    const k = new Kit(900 + n);
    if (!trolley) {
      if (n === 0) { for (let j = 0; j < 2; j++) k.torus('#9aa0a6', 0.09, 0.045, [0, 0.045 + j * 0.095, 0], { rot: [Math.PI / 2, 0, 0], rs: 5, ts: 12 }); }
      else if (n === 1) { k.box('#e2b93b', [0.24, 0.06, 0.3], [0, 0, 0], { base: true, c: 0.02 }); k.box('#d4a62a', [0.22, 0.06, 0.28], [0.02, 0.06, 0.01], { base: true, c: 0.02 }); }
      else if (n === 2) { k.cone('#e0702a', 0.2, 0.3, [0, 0.19, 0], { seg: 10, rot: [Math.PI, 0, 0] }); k.cyl('#e0702a', 0.035, 0.035, 0.16, [0, -0.02, 0], { base: true, seg: 6 }); }
      else { k.box('#3e7fa0', [0.26, 0.16, 0.18], [0, 0, 0], { base: true }); }
    } else {
      if (n === 0) { k.box('#dfeef5', [0.34, 0.28, 0.24], [0, 0, 0], { base: true, c: 0.05 }); k.rectZ('#2f74ff', 0.125, [-0.12, 0.12], [0.1, 0.2], 1); }
      else if (n === 1) { k.box('#c4372b', [0.44, 0.3, 0.3], [0, 0, 0], { base: true, c: 0.02 }); k.box('#efe9dc', [0.46, 0.06, 0.32], [0, 0.3, 0], { base: true }); }
      else if (n === 2) { for (const x of [-0.08, 0.08]) k.cyl('#efe9dc', 0.075, 0.075, 0.26, [x, 0, 0], { base: true, seg: 8 }); }
      else { k.box('#a8875e', [0.36, 0.22, 0.28], [0, 0, 0], { base: true }); k.rectZ('#e2b93b', 0.141, [-0.1, 0.1], [0.06, 0.16], 1); }
    }
    const m = k.mesh('item_' + n);
    m.castShadow = true;
    return m;
  }

  _buildTrolley() {
    const S = this.scene, W = this.world;
    this.trolleyObj = createModel('trolley', 0); S.add(this.trolleyObj);
    this.trolleyFull = createModel('trolley', 1); this.trolleyFull.visible = false; S.add(this.trolleyFull);
    this.T = { v: 0, slip: 0, spin: 0 };
    this.wet = { x0: -4.6, x1: -2.6, z0: -2.6, z1: -0.4 };
    const wk = new Kit(950);
    wk.blob('#8fb3c4', 1.2, [-3.6, 0.006, -1.5], { seg: 14, seed: 951, sx: 0.9, sz: 1.05, wobble: 0.3, off: 0 });
    wk.blob('#a9cad8', 0.6, [-3.4, 0.008, -1.7], { seg: 10, seed: 952, wobble: 0.4, off: 0 });
    wetSign(wk, [-3.6, 0, 0.0], 0.4);
    const wm = wk.mesh('wet_floor'); wm.receiveShadow = true; S.add(wm);
    W.circle(-3.6, 0.0, 0.22, 'sign');
    const loops = [
      [[0, 3.5], [0, -5.6], [3.6, -5.6], [3.6, 3.5]],
      [[7.6, 3.6], [7.6, -5.4], [9.0, -5.4], [7.6, -0.5], [7.6, 3.6], [-1.0, 4.4]],
    ];
    this.staff = loops.map((pts, i) => {
      const av = new Avatar(createModel('clerk', 4), { name: 'staff' + i });
      S.add(av.root);
      const s = { av, pts, i: 1, x: pts[0][0], z: pts[0][1], yaw: 0, speed: 0, pause: 0, bumpCd: 0 };
      av.set({ x: s.x, z: s.z });
      return s;
    });
    // self-checkout kiosk
    const k = new Kit(960);
    k.at([KIOSK.x, 0, KIOSK.z], [0, Math.PI, 0], () => {
      k.box('#d9d6cf', [0.9, 0.95, 0.55], [0, 0, 0], { base: true, c: 0.03 });
      k.box('#3a3b3d', [0.6, 0.02, 0.36], [0, 0.95, 0.02], { base: true });
      k.box('#7fd6c2', [0.5, 0.012, 0.28], [0, 0.97, 0.02], { base: true });
      k.box('#2b2c2e', [0.08, 0.6, 0.08], [0.3, 0.95, -0.18], { base: true });
      k.box('#1f2022', [0.42, 0.32, 0.05], [0.3, 1.55, -0.12], { base: true, rot: [-0.3, 0, 0] });
      k.box('#4f8f8a', [0.36, 0.25, 0.01], [0.3, 1.565, -0.09], { base: true, rot: [-0.3, 0, 0] });
      k.box('#c4372b', [0.7, 0.04, 0.5], [-0.75, 0.78, 0.0], { base: true });
      k.box('#5f6468', [0.05, 0.78, 0.05], [-1.05, 0, 0.2], { base: true });
      k.box('#5f6468', [0.05, 0.78, 0.05], [-0.45, 0, 0.2], { base: true });
    });
    S.add(k.mesh('kiosk'));
    // the scanner beam (red line across the glass, sweeps while scanning)
    this.beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: '#ff3a2a' }));
    this.beam.userData.ownGeo = true; this.beam.position.set(KIOSK.x, 0.985, KIOSK.z); this.beam.visible = false; S.add(this.beam);
    const sign = textSign('selfcheck', 'SELF CHECKOUT', 1.3, 0.3, { bg: '#2f5f8a', fg: '#efe9dc', px: 80 });
    sign.position.set(KIOSK.x, 2.5, KIOSK.z + 0.05); sign.rotation.y = Math.PI; S.add(sign);
    W.box(KIOSK.x - 0.5, KIOSK.x + 1.1, KIOSK.z - 0.3, KIOSK.z + 0.3, 'kiosk');
    this.kioskT = this.addTarget({ id: 'kiosk', pos: new THREE.Vector3(KIOSK.x, 1.05, KIOSK.z - 0.1), r: 0.45, reach: 3.0, label: 'Scan your items', sub: 'self-checkout', when: () => this.stage === 'pay', use: () => this._startScan() });
    this.walkSpeed = 2.5; this.runSpeed = 3.6;
    this.hands.setPose('push', 0.01);
    this.P.pitch = -0.42;
    this.look.minPitch = -0.95; this.look.maxPitch = 0.12; this.look.maxYawRate = 1.9;
  }

  _task() {
    const tm = this.trolleyMode;
    const left = this.items.filter((i) => !i.got);
    const cur = this._nextItem();
    const rows = this.items.map((i) => ({ text: i.name, icon: i.icon, state: i.got ? 'done' : i === cur ? 'cur' : 'todo' }));
    const foot = this.stage === 'shop' ? (tm ? 'Then beat the self-checkout.' : 'Then back out the door to the RV.')
      : this.stage === 'pay' ? (tm ? 'Push it to the self-checkout.' : 'List done — out the door to the RV!') : 'Stop the beam in the green.';
    this.hud.setTask({ cap: tm ? 'MegaMart list' : 'Shopping list', n: `${this.items.length - left.length}/${this.items.length}`, store: this.def.name, rows, foot });
  }
  _nextItem() {
    const P = this.P;
    let best = null, bd = 1e9;
    for (const i of this.items) if (!i.got) { const d = Math.hypot(i.stand.x - P.x, i.stand.z - P.z); if (d < bd) { bd = d; best = i; } }
    return best;
  }

  // ── step ──────────────────────────────────────────────────────────────────
  step(h) {
    const tm = this.trolleyMode;
    if (this.stage === 'scan') { this._scanStep(h); return; }
    if (tm) this._trolleyStep(h); else this.walkStep(h);
    const tt = this.t;
    this.cams.forEach((c, i) => { if (c.obj) c.obj.rotation.y = c.baseYaw + c.sweep * Math.sin(tt * (0.55 + i * 0.12) + i * 1.9); });
    if (!tm) this._vision(h);
    else this._staffStep(h);
    if (this.stage === 'shop') {
      const nx = this._nextItem();
      this.goal = nx ? nx.target.pos : null;
    } else if (this.stage === 'pay') {
      if (tm) this.goal = this.kioskT.pos;
      else {
        this.goal = new THREE.Vector3(DOOR.x, 1.6, DOOR.z + 0.4);
        if (this.P.z > DOOR.z - 0.35 && Math.abs(this.P.x - DOOR.x) < 1.0) { this.toast('Out the door!', 'good'); this._finishOk(); }
      }
    }
    this.graceT = Math.max(0, this.graceT - h);
    this.heyT = Math.max(0, this.heyT - h);
  }

  _grab(item) {
    item.got = true;
    item.prop.visible = false; item.glow.visible = false; item.ring.visible = false;
    this.toast(`+ ${item.name}`, 'good');
    if (this.trolleyMode && this.items.filter((x) => x.got).length >= 2) { this.trolleyObj.visible = false; this.trolleyFull.visible = true; }
    if (!this.items.some((i) => !i.got)) {
      this.stage = 'pay';
      this.exitRing.visible = true;
      this.toast(this.trolleyMode ? 'List done — to the self-checkout!' : 'List done — out the door!', 'good');
    }
    this._task();
  }

  _vision(h) {
    const P = this.P;
    let seen = null;
    const lens = new THREE.Vector3(), fwd = new THREE.Vector3(), q = new THREE.Quaternion(), d = new THREE.Vector3();
    for (const c of this.cams) {
      if (!c.obj || !c.view) continue;
      c.view.updateWorldMatrix(true, false);
      lens.setFromMatrixPosition(c.view.matrixWorld);
      c.obj.getWorldQuaternion(q);
      fwd.set(0, -Math.sin(c.pitch), Math.cos(c.pitch)).applyQuaternion(q);
      d.set(P.x - lens.x, 0.05 - lens.y, P.z - lens.z).normalize();
      const inCone = d.dot(fwd) > Math.cos(c.halfAngle);
      c.seeing = inCone;
      if (inCone && !seen) seen = { c, x: lens.x, z: lens.z };
      if (c.mat) c.mat.opacity = inCone && this.graceT <= 0 ? 0.3 + 0.1 * Math.sin(this.t * 14) : this.graceT > 0 ? 0.05 : 0.13;
    }
    if (this.graceT > 0) seen = null;
    this.seenT = seen ? this.seenT + h : Math.max(0, this.seenT - h * 0.8);
    this._seenBy = seen;
    if (this.seenT >= 1.5) {
      this.seenT = 0; this.spotted++; this.graceT = 3; this.heyT = 2.2;
      this.timePenalty(8, 'HEY! YOU! — spotted, −8s');
    }
  }

  _trolleyStep(h) {
    const P = this.P, T = this.T;
    const { f, r } = this.axes();
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
    const cx = P.x + fx * T_OFF, cz = P.z + fz * T_OFF;
    const w = this.wet;
    const onWet = cx > w.x0 && cx < w.x1 && cz > w.z0 && cz < w.z1;
    if (onWet && T.slip <= 0 && Math.abs(T.v) > 0.6) { T.slip = 1.0; T.spin = (Math.sin(this.t * 7) > 0 ? 1.5 : -1.5); this.toast('Whoa — wet floor!', 'bad'); this.shake = 0.4; }
    const max = this.running ? this.runSpeed : this.walkSpeed;
    if (T.slip > 0) { T.slip -= h; P.yaw = wrap(P.yaw + T.spin * h); T.v *= Math.exp(-h * 0.5); }
    else {
      if (r) P.yaw = wrap(P.yaw - r * 1.6 * h);
      const target = f > 0 ? max : f < 0 ? -1.2 : 0;
      T.v += clamp(target - T.v, -5 * h, 3.0 * h);
    }
    const f2x = Math.sin(P.yaw), f2z = Math.cos(P.yaw);
    const U = { x: P.x + f2x * 0.3 + f2x * T.v * h, z: P.z + f2z * 0.3 + f2z * T.v * h };
    const hit = this.world.pushOut(U, 0.62, {});
    if (hit && Math.abs(T.v) > 1.2) { this.shake = Math.max(this.shake, 0.3); if (T.slip > 0) { T.slip = 0; this.toast('Clang!', 'info'); } T.v *= 0.35; }
    const nx = U.x - f2x * 0.3, nz = U.z - f2z * 0.3;
    this.B.speed = h > 0 ? Math.hypot(nx - P.x, nz - P.z) / h : 0;
    P.x = nx; P.z = nz;
    this.Tc = { x: P.x + f2x * T_OFF, z: P.z + f2z * T_OFF };
  }

  _staffStep(h) {
    for (const s of this.staff) {
      s.bumpCd = Math.max(0, s.bumpCd - h);
      if (s.pause > 0) { s.pause -= h; s.speed = 0; }
      else {
        const p = s.pts[s.i];
        const dx = p[0] - s.x, dz = p[1] - s.z, l = Math.hypot(dx, dz);
        if (l < 0.2) { s.i = (s.i + 1) % s.pts.length; s.pause = 0.6; }
        else { s.x += (dx / l) * 1.15 * h; s.z += (dz / l) * 1.15 * h; s.yaw += wrap(Math.atan2(dx, dz) - s.yaw) * Math.min(1, h * 6); s.speed = 1.15; }
      }
      s.av.set({ x: s.x, z: s.z, yaw: s.yaw, speed: s.speed });
      const dR = Math.hypot(this.P.x - s.x, this.P.z - s.z), dT = this.Tc ? Math.hypot(this.Tc.x - s.x, this.Tc.z - s.z) : 9;
      if ((dR < 0.6 || dT < 0.75) && s.bumpCd <= 0) {
        s.bumpCd = 2.0; s.pause = 1.2; this.bumps++;
        this.T.v = -0.6;
        this.timePenalty(3, ['"Watch it!" −3s', '"Oi! Trolley!" −3s', '"Excuse YOU." −3s'][this.bumps % 3]);
      }
    }
  }

  // ── self-checkout beam ────────────────────────────────────────────────────
  _startScan() {
    this.stage = 'scan'; this.scanI = 0; this.scanX = 0; this.scanDir = 1; this.scanCd = 0.3;
    this.T.v = 0; this.goal = null;
    this.hands.setPose('grab', 0.2);
    this.look.minPitch = -1.0; this.look.maxPitch = 0.6; this.look.maxYawRate = null;
    this.exitRing.visible = false;
    this.beam.visible = true;
    this._scanZone();
    this._task();
  }
  _scanZone() {
    const w = 0.2 - this.scanI * 0.022, c = 0.3 + ((this.scanI * 0.37) % 0.45);
    this.zone = [c - w / 2, c + w / 2];
  }
  _scanStep(h) {
    const sp = 0.85 + this.scanI * 0.16;
    this.scanX += this.scanDir * sp * h;
    if (this.scanX > 1) { this.scanX = 2 - this.scanX; this.scanDir = -1; } else if (this.scanX < 0) { this.scanX = -this.scanX; this.scanDir = 1; }
    this.scanCd = Math.max(0, this.scanCd - h);
    this.promptOverride = { key: 'E', text: 'Scan — stop the beam in the green', sub: `item ${this.scanI + 1} of ${this.items.length}` };
    if (this.actPressed && this.scanCd <= 0) {
      this.consumeAct();
      this.hands.reach('r', 0.3);
      if (this.scanX >= this.zone[0] && this.scanX <= this.zone[1]) {
        this.scanHits++; this.scanI++;
        this.hud.gaugeFlash(true); this.toast('BEEP!', 'good');
        if (this.scanI >= this.items.length) { this.promptOverride = null; this.hud.gauge(null); this.beam.visible = false; this._finishOk(); return; }
        this._scanZone();
      } else {
        this.misses++; this.scanCd = 0.6;
        this.hud.gaugeFlash(false);
        this.timePenalty(1.5, 'Unexpected item in the bagging area! −1.5s');
      }
    }
  }

  _finishOk() {
    const tf = this.timeLeft / this.timeLimit;
    const used = Math.round(this.t + this.penalty);
    if (this.trolleyMode) {
      const acc = this.scanHits / Math.max(1, this.scanHits + this.misses);
      const score = clamp(0.42 + 0.6 * tf + 0.12 * acc - 0.06 * this.bumps - 0.04 * this.misses, 0.05, 1);
      this.finish(score, [`All ${this.items.length} items in ${used}s`, `Staff bumped: ${this.bumps}`, `Scans: ${this.scanHits} clean, ${this.misses} fumbled`]);
    } else {
      const score = clamp(0.5 + 0.62 * tf - 0.18 * this.spotted, 0.05, 1);
      this.finish(score, [`All ${this.items.length} items in ${used}s`, this.spotted ? `Caught on camera ${this.spotted}×` : 'Never caught on camera', 'Out the door with the goods']);
    }
  }
  timeUp() {
    const got = this.items.filter((i) => i.got).length;
    return { score: 0.35 * got / this.items.length, lines: [`Grabbed ${got}/${this.items.length}`] };
  }
  progress() {
    const got = this.items.filter((i) => i.got).length, n = this.items.length;
    if (this.stage === 'scan') return { label: `Scanning ${this.scanI}/${n}`, frac: 0.8 + 0.2 * (this.scanI / n) };
    if (this.stage === 'pay') return { label: this.trolleyMode ? 'To the checkout' : 'Heading out', frac: 0.85 };
    return { label: `${got}/${n} items`, frac: 0.8 * got / n };
  }

  visual(dt) {
    const P = this.P;
    this.clerk.update(dt);
    if (this.heyT > 0) { this.clerk.s.wave = 1; this.clerk.s.yaw += wrap(Math.atan2(P.x - this.clerk.s.x, P.z - this.clerk.s.z) - this.clerk.s.yaw) * Math.min(1, dt * 8); }
    else { this.clerk.s.wave = 0; this.clerk.s.lookY = Math.sin(this.t * 0.9) * 0.35; this.clerk.s.yaw += wrap(Math.PI / 2 - this.clerk.s.yaw) * Math.min(1, dt * 2); }
    if (this.staff) for (const s of this.staff) s.av.update(dt);
    for (const i of this.items) if (!i.got) { const k = 0.65 + 0.35 * Math.sin(this.t * 4 + i.stand.x); if (i.gm && 'opacity' in i.gm) i.gm.opacity = k; i.ring.userData.set(0.5 + 0.4 * k); i.prop.rotation.y += dt * 0.8; }
    if (this.exitRing.visible) this.exitRing.userData.set(0.6 + 0.4 * Math.sin(this.t * 5));
    if (this.trolleyMode && this.T) {
      const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
      for (const o of [this.trolleyObj, this.trolleyFull]) { o.position.set(P.x + fx * T_OFF, 0, P.z + fz * T_OFF); o.rotation.y = P.yaw; }
    }
    // camera-cone feedback (alert pill, threat side, red side vignette)
    if (!this.trolleyMode) {
      const k = clamp(this.seenT / 1.5, 0, 1);
      if (k > 0.02 && this._seenBy) {
        const rel = wrap(Math.atan2(this._seenBy.x - P.x, this._seenBy.z - P.z) - P.yaw);
        this.threatSide = rel > 0 ? -1 : 1;            // yaw grows to the left
        this.vigK = 0.35 + 0.65 * k;
        this.alertInfo = { icon: 'cam', text: 'In the camera cone', sub: 'step out', frac: k, tone: 'red' };
      } else { this.threatSide = 0; this.vigK = 0; this.alertInfo = this.graceT > 0 ? { icon: 'cam', text: 'Spotted', sub: 'the clerk is watching', frac: null, tone: 'amber' } : null; }
    }
    if (this.stage === 'scan') {
      this.hud.gauge({ cap: `Scan item <b>${Math.min(this.scanI + 1, this.items.length)}/${this.items.length}</b>`, hint: 'stop the beam in the green [E]', zone: this.zone, needle: this.scanX });
      if (this.beam) { this.beam.position.x = KIOSK.x - 0.22 + this.scanX * 0.44; }
    }
    if (this.stage !== 'scan') this.promptOverride = null;
    if (this.stage === 'shop' || this.stage === 'pay') this._task();
  }

  // ── scripted player ───────────────────────────────────────────────────────
  bot(h) {
    if (this.stage === 'scan') {
      const mid = (this.zone[0] + this.zone[1]) / 2;
      const a = this.botAim(new THREE.Vector3(KIOSK.x, 1.0, KIOSK.z));
      return { ...a, act: Math.abs(this.scanX - mid) < (this.zone[1] - this.zone[0]) * 0.3 && this.scanCd <= 0 };
    }
    if (this.stage === 'shop') {
      const nx = this._nextItem();
      if (!nx) return {};
      const b = this.botUse(nx.target, h, { stand: nx.stand, radius: this.trolleyMode ? 0.62 : 0.32 });
      if (this.trolleyMode && b.yaw == null) b.pitch = -0.4;
      return this.trolleyMode ? this._botTrolley(b) : b;
    }
    if (this.stage === 'pay') {
      if (this.trolleyMode) return this._botTrolley(this.botUse(this.kioskT, h, { stand: KIOSK.stand, radius: 0.62 }));
      const n = this.botNav({ x: DOOR.x, z: DOOR.z + 0.6 }, h, { arrive: 0.1 });
      return n.arrived ? { keys: ['KeyW'] } : n;
    }
    return {};
  }
  /** Trolley: the view IS the trolley heading, so aim the trolley with the look and keep the pitch on the handle. */
  _botTrolley(b) {
    if (b.pitch != null && b.act == null && !b.held) b.pitch = clamp(b.pitch, -0.9, 0.1);
    if (b.pitch == null || (b.keys && b.keys.length && !b.act)) b.pitch = -0.42;
    return { ...b, turnRate: 1.9, run: false };
  }
  debugExtra() { return { stage: this.stage, got: this.items.filter((i) => i.got).length, spotted: this.spotted, bumps: this.bumps, seenT: +this.seenT.toFixed(2) }; }
}
