// ─────────────────────────────────────────────────────────────────────────────
// collect — "Shopping list sprint" (Bolt & Barrel) and its `trolley` variant (MegaMart).
// Inside `shop_hardware_interior`: grab the N glowing items on the list.
//  • collect: stay out of the sweeping camera cones (cam_0/cam_1) — 1.5 s in view → "HEY!" from the clerk
//    on the phone (clerk v0), −8 s and a score hit. Finish by leaving the cash on the counter.
//  • trolley: push a trolley (heavier turning), dodge the walking staff (clerk v4), a wet-floor patch
//    makes you slide, and finish at the self-checkout: stop the scanner sweep in the green for each item.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { createModel, cloneInstanceMaterials } from '../../assets/index.js';
import { ShopBase, clamp, wrap } from './ShopBase.js';
import { Kit, PAL, textSign, glowSpot, wetSign, shade } from './build.js';
import { el } from '../hud.js';
import { Avatar } from '../avatar.js';
import { walk } from './world2d.js';

const LEV = [0.15, 0.62, 1.09, 1.56];
// glow position + where Rook stands to grab it
const SPOTS = [
  { glow: [-1.5, LEV[2] + 0.005, -0.8], stand: [-0.95, -0.8], part: 'item_0' },
  { glow: [5.13, LEV[0] + 0.005, 0.82], stand: [4.55, 0.82], part: 'item_1' },
  { glow: [6.8, 0.012, -6.2], stand: [6.8, -5.5], part: 'item_2' },
  { glow: [-5.13, LEV[1] + 0.005, -2.6], stand: [-4.55, -2.6], part: null },
  { glow: [2.07, LEV[2] + 0.005, -3.1], stand: [2.62, -3.1], part: null },
];
const NAMES = {
  collect: ['Duct tape', 'Rubber gloves', 'Big funnel', 'Hose clamps', 'Zip ties'],
  trolley: ['Bag of ice', 'Cooler box', 'Paper towels', 'Snack crate', 'Dish soap'],
};
const COUNTER = { x: -6.25, z: 4.0 };       // "leave the cash" spot (right of the checkout counter)
const KIOSK = { x: 1.6, z: 5.85, stand: { x: 1.6, z: 4.85 } };

export class CollectChallenge extends ShopBase {
  build() {
    const trolley = this.trolleyMode = this.shop.variant === 'trolley';
    const S = this.scene;
    S.background = new THREE.Color(trolley ? '#2b3036' : '#2a2725');
    // lights: soft sky + a high key light through the open joists + cool tubes over the aisles
    S.add(new THREE.HemisphereLight('#e8eef2', '#7d7466', 1.25));
    const sun = new THREE.DirectionalLight('#fff4e0', 1.5);
    sun.position.set(-6, 18, 9); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 11, bottom: -11, near: 1, far: 50 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    S.add(sun);
    for (const x of [-5.4, 0, 5.4]) { const L = new THREE.PointLight(trolley ? '#e8f2ff' : '#fff2da', 8, 11, 1.4); L.position.set(x, 3.9, -0.9); S.add(L); }

    const it = this.interior = createModel('shop_hardware_interior');
    this.mats = cloneInstanceMaterials(it);
    S.add(it);
    // dollhouse cut: walls, joists and tube lights above 3.4 m are clipped so the high camera sees in
    const shell = it.getObjectByName('shell');
    if (shell) { shell.material = shell.material.clone(); shell.material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 3.4)]; this.clipping = true; }
    this.cams = (it.userData.cams || []).map((c, i) => ({ ...c, obj: it.getObjectByName(c.name), view: it.getObjectByName(c.name + '_view'), mat: this.mats[`cam_${i}_view_mesh`] }));
    if (trolley) {
      for (const c of this.cams) if (c.view) c.view.visible = false;
      const banner = textSign('megamart_in', 'MEGAMART', 4.6, 0.8, { bg: '#b8392e', fg: '#efe9dc', px: 110, border: '#e2b93b' });
      banner.position.set(0, 3.25, -6.95); S.add(banner);
      const slog = textSign('megamart_slogan', 'EVERYTHING · ALWAYS · ISH', 3.2, 0.36, { bg: '#2f5f8a', fg: '#efe9dc', px: 60 });
      slog.position.set(0, 2.62, -6.94); S.add(slog);
    }

    // colliders (interior-local = world here)
    const W = this.world;
    W.bounds = { x0: -10, x1: 10, z0: -7, z1: 7 };
    for (const x of [-5.4, -1.8, 1.8, 5.4]) W.box(x - 0.47, x + 0.47, -4.65, 2.65, 'shelf');
    W.circle(-5.4, 3.0, 0.42, 'buckets'); W.box(4.9, 5.9, 2.75, 3.95, 'pallet');
    W.box(-6.1, 6.1, -7, -6.42, 'shelf');                       // plumbing wall
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

    // items
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
      const floorRing = glowSpot('#ffd36a', 0.42, 0.01); floorRing.position.set(sp.stand[0], 0, sp.stand[1]); S.add(floorRing);
      this.items.push({ name: names[n], glow, gm, prop, ring: floorRing, stand: { x: sp.stand[0], z: sp.stand[1] }, got: false });
    }
    // list
    this.listEl = el('div', 'ofs-list', this.hud.root, `<b>${trolley ? 'MEGAMART LIST' : 'SHOPPING LIST'}</b><ul>${this.items.map((i) => `<li>${i.name}</li>`).join('')}</ul>`);
    this.listLis = [...this.listEl.querySelectorAll('li')];
    this.seenEl = el('div', 'ofs-seen', this.hud.root, '<i></i>'); this.seenI = this.seenEl.querySelector('i');

    // Rook at the entrance
    Object.assign(this.rook, { x: -3.0, z: 6.0, yaw: Math.PI });
    this.cam = { ...this.cam, yaw: Math.PI, dist: 6.2, h: 9.6, look: 0.6, fov: 50, x: -3, z: 4, lag: 4 };
    this.seenT = 0; this.spotted = 0; this.graceT = 0; this.heyT = 0;
    this.bumps = 0; this.misses = 0; this.scanHits = 0;
    this.stage = 'shop';
    this.counterRing = glowSpot('#7fd6c2', 0.5, 0.8); this.counterRing.visible = false; S.add(this.counterRing);

    if (trolley) this._buildTrolley();
  }

  _itemProp(n, trolley) {
    const k = new Kit(900 + n);
    if (!trolley) {
      if (n === 0) { for (let j = 0; j < 2; j++) k.torus('#9aa0a6', 0.075, 0.035, [0, 0.035 + j * 0.075, 0], { rot: [Math.PI / 2, 0, 0], rs: 4, ts: 12 }); }
      else if (n === 1) { k.box('#e2b93b', [0.2, 0.05, 0.26], [0, 0, 0], { base: true, c: 0.02 }); k.box('#d4a62a', [0.18, 0.05, 0.24], [0.02, 0.05, 0.01], { base: true, c: 0.02 }); }
      else if (n === 2) { k.cone('#e0702a', 0.17, 0.26, [0, 0.16, 0], { seg: 10, rot: [Math.PI, 0, 0] }); k.cyl('#e0702a', 0.03, 0.03, 0.14, [0, -0.02, 0], { base: true, seg: 6 }); }
      else { k.box('#3e7fa0', [0.22, 0.14, 0.16], [0, 0, 0], { base: true }); }
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
    // wet floor patch between aisles 1 and 2 + sign
    this.wet = { x0: -4.6, x1: -2.6, z0: -2.6, z1: -0.4 };
    const wk = new Kit(950);
    wk.blob('#8fb3c4', 1.2, [-3.6, 0.006, -1.5], { seg: 14, seed: 951, sx: 0.9, sz: 1.05, wobble: 0.3, off: 0 });
    wk.blob('#a9cad8', 0.6, [-3.4, 0.008, -1.7], { seg: 10, seed: 952, wobble: 0.4, off: 0 });
    wetSign(wk, [-3.6, 0, 0.0], 0.4);
    const wm = wk.mesh('wet_floor'); wm.receiveShadow = true; S.add(wm);
    W.circle(-3.6, 0.0, 0.22, 'sign');
    // staff walking loops (MegaMart workers, clerk v4)
    const loops = [
      [[0, 3.5], [0, -5.6], [3.6, -5.6], [3.6, 3.5]],
      [[7.6, 3.6], [7.6, -5.4], [9.0, -5.4], [7.6, -0.5], [7.6, 3.6], [-1.0, 4.4]],
    ];
    this.staff = loops.map((pts, i) => {
      const av = new Avatar(createModel('clerk', 4), { name: 'staff' + i });
      S.add(av.root);
      const s = { av, pts, i: 1, x: pts[0][0], z: pts[0][1], yaw: 0, vx: 0, vz: 0, speed: 0, pause: 0, bumpCd: 0 };
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
    const km = k.mesh('kiosk'); S.add(km);
    const sign = textSign('selfcheck', 'SELF CHECKOUT', 1.3, 0.3, { bg: '#2f5f8a', fg: '#efe9dc', px: 80 });
    sign.position.set(KIOSK.x, 2.5, KIOSK.z + 0.05); sign.rotation.y = Math.PI; S.add(sign);
    W.box(KIOSK.x - 0.5, KIOSK.x + 1.1, KIOSK.z - 0.3, KIOSK.z + 0.3, 'kiosk');   // built under a π turn: the bagging shelf is at +x
    this.walkSpeed = 2.4; this.runSpeed = 3.4;
  }

  // ── step ──────────────────────────────────────────────────────────────────
  step(h) {
    const R = this.rook;
    const tm = this.trolleyMode;
    if (this.stage === 'scan') { this._scanStep(h); return; }
    if (tm) this._trolleyStep(h); else this.walkRook(h);
    // cameras sweep
    const tt = this.t;
    this.cams.forEach((c, i) => { if (c.obj) c.obj.rotation.y = c.baseYaw + c.sweep * Math.sin(tt * (0.55 + i * 0.12) + i * 1.9); });
    if (!tm) this._vision(h);
    if (tm) this._staffStep(h);
    // pickups
    const left = this.items.filter((i) => !i.got);
    let nearItem = null;
    for (const item of left) if (this._near(item.stand, tm ? 1.35 : 1.15)) { nearItem = item; break; }
    if (this.stage === 'shop') {
      if (nearItem && this.actPressed) this._grab(nearItem);
      else if (left.length) this.prompt = nearItem ? { text: `Grab the ${nearItem.name.toLowerCase()} [E]`, near: true } : { text: `Find the glowing items — ${this.items.length - left.length}/${this.items.length}`, sub: tm ? 'heavy trolley: turn early · watch the wet floor' : 'stay out of the red camera cones' };
      if (!this.items.some((i) => !i.got)) {
        this.stage = 'pay';
        this.counterRing.visible = true;
        const p = tm ? KIOSK.stand : COUNTER;
        this.counterRing.position.set(p.x, 0, p.z);
        this.popRook('List done!', 'good');
      }
    } else if (this.stage === 'pay') {
      const p = tm ? KIOSK.stand : COUNTER;
      const at = this._near(p, tm ? 1.4 : 1.2);
      this.prompt = tm ? { text: at ? 'Scan your items [E]' : 'Head to the self-checkout', near: at } : { text: at ? 'Leave the cash on the counter [E]' : 'Pay at the counter — leave the cash', near: at, sub: 'the clerk is still on the phone' };
      if (at && this.actPressed) {
        if (tm) this._startScan();
        else { this.rook.act = 0.4; this.popRook('Cash left — keep the change!', 'good'); this._finishOk(); }
      }
    }
    this.graceT = Math.max(0, this.graceT - h);
    this.heyT = Math.max(0, this.heyT - h);
  }
  _near(p, r) { return Math.hypot(this.rook.x - p.x, this.rook.z - p.z) <= r || (this.trolleyMode && this.Tc && Math.hypot(this.Tc.x - p.x, this.Tc.z - p.z) <= r); }

  _grab(item) {
    item.got = true;
    item.prop.visible = false; item.glow.visible = false; item.ring.visible = false;
    this.rook.act = 0.4;
    const i = this.items.indexOf(item);
    this.listLis[i].classList.add('done');
    this.popAt(`+ ${item.name}`, 'good', item.prop.position.x, item.prop.position.y + 0.6, item.prop.position.z);
    if (this.trolleyMode && this.items.filter((x) => x.got).length >= 2) { this.trolleyObj.visible = false; this.trolleyFull.visible = true; }
  }

  _vision(h) {
    const R = this.rook;
    let seen = false;
    const lens = new THREE.Vector3(), fwd = new THREE.Vector3(), q = new THREE.Quaternion(), d = new THREE.Vector3();
    for (const c of this.cams) {
      if (!c.obj || !c.view) continue;
      c.view.updateWorldMatrix(true, false);
      lens.setFromMatrixPosition(c.view.matrixWorld);
      c.obj.getWorldQuaternion(q);
      fwd.set(0, -Math.sin(c.pitch), Math.cos(c.pitch)).applyQuaternion(q);
      d.set(R.x - lens.x, 0.05 - lens.y, R.z - lens.z).normalize();
      const inCone = d.dot(fwd) > Math.cos(c.halfAngle);
      c.seeing = inCone;
      if (inCone) seen = true;
      if (c.mat) c.mat.opacity = inCone && this.graceT <= 0 ? 0.32 + 0.12 * Math.sin(this.t * 20) : this.graceT > 0 ? 0.05 : 0.12;
    }
    if (this.graceT > 0) seen = false;
    this.seenT = seen ? this.seenT + h : Math.max(0, this.seenT - h * 0.8);
    if (this.seenT >= 1.5) {
      this.seenT = 0; this.spotted++; this.graceT = 3; this.heyT = 2.2;
      this.popAt('HEY! YOU!', 'bad', this.clerk.s.x, 2.4, this.clerk.s.z);
      this.timePenalty(8, 'Spotted! −8s');
      this.flashAlert(900);
    }
  }

  _trolleyStep(h) {
    const R = this.rook, T = this.T;
    const m = this.moveInput();
    const fwd = { x: Math.sin(R.yaw), z: Math.cos(R.yaw) };
    // on the wet patch? (trolley centre)
    const cx = R.x + fwd.x * 0.85, cz = R.z + fwd.z * 0.85;
    const w = this.wet;
    const onWet = cx > w.x0 && cx < w.x1 && cz > w.z0 && cz < w.z1;
    if (onWet && T.slip <= 0 && Math.abs(T.v) > 0.6) { T.slip = 1.1; T.spin = (T.v > 0 ? 1 : -1) * (Math.sin(this.t * 7) > 0 ? 1.6 : -1.6); this.popRook('Whoa—!', 'bad'); }
    const max = this.running ? this.runSpeed : this.walkSpeed;
    if (T.slip > 0) {
      T.slip -= h;
      R.yaw += T.spin * h;
      T.v *= Math.exp(-h * 0.5);
    } else if (Math.hypot(m.x, m.z) > 0.1) {
      const want = Math.atan2(m.x, m.z);
      const dy = wrap(want - R.yaw);
      R.yaw += clamp(dy, -1.8 * h, 1.8 * h);
      const align = Math.cos(dy);
      const target = align > 0 ? max * align : -0.8 * Math.min(1, -align);
      T.v += clamp(target - T.v, -5 * h, 3.2 * h);
    } else T.v += clamp(-T.v, -4 * h, 4 * h);
    // move the unit (one collider circle at the trolley/Rook midpoint)
    const f2 = { x: Math.sin(R.yaw), z: Math.cos(R.yaw) };
    const U = { x: R.x + f2.x * 0.45 + f2.x * T.v * h, z: R.z + f2.z * 0.45 + f2.z * T.v * h };
    const o = {};
    const hit = this.world.pushOut(U, 0.62, o);
    if (hit && Math.abs(T.v) > 1.2) { this.shake = Math.max(this.shake || 0, 0.25); if (T.slip > 0) { T.slip = 0; this.popRook('Clang!', 'info'); } T.v *= 0.35; }
    R.x = U.x - f2.x * 0.45; R.z = U.z - f2.z * 0.45;
    R.speed = Math.abs(T.v);
    R.carry = 'push';
    this.Tc = { x: R.x + f2.x * 0.85, z: R.z + f2.z * 0.85 };
    for (const o2 of [this.trolleyObj, this.trolleyFull]) { o2.position.set(this.Tc.x, 0, this.Tc.z); o2.rotation.y = R.yaw; }
    this.rookAv.s.slip = T.slip > 0 ? 1 : 0;
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
      // bump with Rook or the trolley
      const dR = Math.hypot(this.rook.x - s.x, this.rook.z - s.z), dT = this.Tc ? Math.hypot(this.Tc.x - s.x, this.Tc.z - s.z) : 9;
      if ((dR < 0.62 || dT < 0.8) && s.bumpCd <= 0) {
        s.bumpCd = 2.0; s.pause = 1.2; this.bumps++;
        this.T.v = -0.6;
        this.popAt(['Watch it!', 'Oi! Trolley!', 'Excuse YOU.'][this.bumps % 3], 'bad', s.x, 2.3, s.z);
        this.timePenalty(3);
      }
    }
  }

  // ── self-checkout scan minigame ───────────────────────────────────────────
  _startScan() {
    this.stage = 'scan'; this.scanI = 0; this.scanX = 0; this.scanDir = 1; this.scanCd = 0;
    this.rook.carry = null; this.T.v = 0;
    const box = this.scanBox = el('div', 'ofs-meter', this.hud.root);
    box.innerHTML = `<div class="ofs-gauge-cap"><span>SCAN ITEM <b class="n">1/${this.items.length}</b></span><span>stop the beam in the green <kbd>E</kbd></span></div><div class="ofs-gauge"><div class="zone"></div><div class="needle"></div></div>`;
    this.scanGauge = box.querySelector('.ofs-gauge'); this.scanZone = box.querySelector('.zone'); this.scanNeedle = box.querySelector('.needle'); this.scanN = box.querySelector('.n');
    this._scanZone();
  }
  _scanZone() {
    const w = 0.2 - this.scanI * 0.025, c = 0.3 + ((this.scanI * 0.37) % 0.45);
    this.zone = [c - w / 2, c + w / 2];
    this.scanZone.style.left = `${this.zone[0] * 100}%`; this.scanZone.style.width = `${w * 100}%`;
    this.scanN.textContent = `${this.scanI + 1}/${this.items.length}`;
  }
  _scanStep(h) {
    const sp = 0.85 + this.scanI * 0.18;
    this.scanX += this.scanDir * sp * h;
    if (this.scanX > 1) { this.scanX = 2 - this.scanX; this.scanDir = -1; } else if (this.scanX < 0) { this.scanX = -this.scanX; this.scanDir = 1; }
    this.scanNeedle.style.left = `${this.scanX * 100}%`;
    this.scanCd = Math.max(0, this.scanCd - h);
    this.prompt = { text: 'Beep it through — [E] when the beam is in the green', near: true };
    if (this.actPressed && this.scanCd <= 0) {
      this.rook.act = 0.4;
      if (this.scanX >= this.zone[0] && this.scanX <= this.zone[1]) {
        this.scanHits++; this.scanI++;
        this.scanGauge.classList.remove('flash'); void this.scanGauge.offsetWidth; this.scanGauge.classList.add('flash');
        this.popAt('BEEP!', 'good', KIOSK.x, 1.8, KIOSK.z);
        if (this.scanI >= this.items.length) { this.scanBox.remove(); this._finishOk(); return; }
        this._scanZone();
      } else {
        this.misses++; this.scanCd = 0.6;
        this.scanGauge.classList.remove('miss'); void this.scanGauge.offsetWidth; this.scanGauge.classList.add('miss');
        this.popAt('Unexpected item in the bagging area!', 'bad', KIOSK.x, 2.2, KIOSK.z);
        this.timePenalty(1.5, '−1.5s');
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
      this.finish(score, [`All ${this.items.length} items in ${used}s`, this.spotted ? `Caught on camera ${this.spotted}×` : 'Never caught on camera', 'Cash left on the counter']);
    }
  }
  timeUp() {
    const got = this.items.filter((i) => i.got).length;
    return { score: 0.35 * got / this.items.length, lines: [`Grabbed ${got}/${this.items.length}`] };
  }

  visual(dt) {
    const R = this.rook;
    this.cam.x = R.x; this.cam.z = R.z - 1.2;
    this.clerk.update(dt);
    if (this.heyT > 0) { this.clerk.s.wave = 1; this.clerk.s.yaw += wrap(Math.atan2(R.x - this.clerk.s.x, R.z - this.clerk.s.z) - this.clerk.s.yaw) * Math.min(1, dt * 8); }
    else { this.clerk.s.wave = 0; this.clerk.s.lookY = Math.sin(this.t * 0.9) * 0.35; this.clerk.s.yaw += wrap(Math.PI / 2 - this.clerk.s.yaw) * Math.min(1, dt * 2); }
    if (this.staff) for (const s of this.staff) s.av.update(dt);
    for (const i of this.items) if (!i.got) { const k = 0.65 + 0.35 * Math.sin(this.t * 4 + i.stand.x); if (i.gm && 'opacity' in i.gm) i.gm.opacity = k; i.ring.userData.set(0.6 + 0.4 * k); i.prop.rotation.y += dt * 0.8; }
    if (this.counterRing.visible) this.counterRing.userData.set(0.6 + 0.4 * Math.sin(this.t * 5));
    if (this.seenEl) {
      const on = this.seenT > 0.05;
      this.seenEl.classList.toggle('on', on);
      this.seenI.style.width = `${clamp(this.seenT / 1.5, 0, 1) * 100}%`;
    }
  }

  // ── scripted test player ──────────────────────────────────────────────────
  bot(h) {
    const R = this.rook;
    if (this.stage === 'scan') {
      const mid = (this.zone[0] + this.zone[1]) / 2;
      return { act: Math.abs(this.scanX - mid) < (this.zone[1] - this.zone[0]) * 0.3 && this.scanCd <= 0 };
    }
    let goal = null;
    if (this.stage === 'shop') {
      const left = this.items.filter((i) => !i.got);
      left.sort((a, b) => Math.hypot(a.stand.x - R.x, a.stand.z - R.z) - Math.hypot(b.stand.x - R.x, b.stand.z - R.z));
      goal = left[0] && left[0].stand;
      if (goal && this._near(goal, this.trolleyMode ? 1.2 : 1.0)) return { act: true };
    } else if (this.stage === 'pay') {
      goal = this.trolleyMode ? KIOSK.stand : COUNTER;
      if (this._near(goal, 1.0)) return { act: true };
    }
    if (!goal) return null;
    const key = `${goal.x},${goal.z}`;
    this._bp = this._bp || {};
    if (this._bp.key !== key || !this._bp.path || this._bp.t > 2.5) {
      this._bp = { key, path: this.world.path(R.x, R.z, goal.x, goal.z, this.trolleyMode ? 0.65 : 0.34), t: 0 };
    }
    this._bp.t += h;
    // stuck (trolley wedged on a shelf end): back up and swing round for a moment
    const bp = this._bp;
    bp.st = (bp.st || 0) + h;
    if (bp.st > 0.9) { if (Math.hypot(R.x - (bp.lx ?? 1e9), R.z - (bp.lz ?? 1e9)) < 0.25) bp.back = 0.7; bp.st = 0; bp.lx = R.x; bp.lz = R.z; }
    if (bp.back > 0) { bp.back -= h; if (bp.back <= 0) bp.path = null; return { keys: ['KeyS', bp.t % 2 > 1 ? 'KeyA' : 'KeyD'] }; }
    if (!bp.path) bp.path = this.world.path(R.x, R.z, goal.x, goal.z, this.trolleyMode ? 0.65 : 0.34);
    const P = this._bp.path;
    while (P.length > 1 && Math.hypot(P[0].x - R.x, P[0].z - R.z) < 0.5) P.shift();
    const w = P[0] || goal;
    const dx = w.x - R.x, dz = w.z - R.z, l = Math.hypot(dx, dz) || 1;
    return { move: { x: dx / l, z: dz / l }, run: !this.trolleyMode || l > 2, fine: this.trolleyMode };
  }
  debugExtra() { return { stage: this.stage, got: this.items.filter((i) => i.got).length, spotted: this.spotted, bumps: this.bumps }; }
}
