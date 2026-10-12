// ─────────────────────────────────────────────────────────────────────────────
// haggle — Round 3 first person (agent SHOPS). Old Town Market hall: walk to Ma Bell's jam stall, look at her
// + E, stop the swinging price needle in the green 3× (shrinking zone, faster needle), then carry the two
// crates out to the door — a crate in both hands blocks the lower half of the view.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { createModel } from '../../assets/index.js';
import { FpShop, clamp } from './fpBase.js';
import { Kit, room, crate, jar, textSign, glowSpot } from './build.js';
import { Avatar } from '../avatar.js';
import { walk } from './world2d.js';

const VENDOR = { x: 0, z: -2.75 };
const VENDOR_STAND = { x: 0, z: -0.9 };
const DROP = { x: 0, z: 5.5 };
const PILE = { x: 3.2, z: 2.4 };
const LINES_HIT = ['"Argh — fine, fine!"', '"You drive a hard bargain…"', '"Two for one. Don\'t tell my wife."'];
const LINES_MISS = ['"Ha! Nice try, cowboy."', '"Full price, friend."', '"No no no no."'];

export class HaggleChallenge extends FpShop {
  controls() { return [['Mouse', 'look'], ['W A S D', 'walk'], ['Shift', 'run'], ['E', 'haggle / lift']]; }

  build() {
    const S = this.scene;
    S.background = new THREE.Color('#3a332c');
    S.add(new THREE.HemisphereLight('#f3ead6', '#6e5a44', 1.3));
    const sun = new THREE.DirectionalLight('#ffe2b0', 1.4);
    sun.position.set(-5, 16, 8); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 10, bottom: -10, near: 1, far: 50 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    S.add(sun);
    for (const [x, z] of [[-5, -1], [5, -1], [0, 3.5]]) { const L = new THREE.PointLight('#ffcf8a', 8, 11, 1.4); L.position.set(x, 3.6, z); S.add(L); }

    // hall shell: brick dado, cream upper walls, tiled floor, cast-iron pilasters, a ceiling with beams
    const k = new Kit(1100);
    room(k, { x0: -10, x1: 10, z0: -7, z1: 7, h: 4.6, floor: '#8a7f70', wall: '#d9cdb2', low: '#9a5844', band: 1.2, tile: { size: 1, alt: '#7d7264' }, skip: ['front'], ceiling: '#5a4c3e' });
    k.rectZ('#9a5844', 7, [-10, -1.6], [0, 1.2], -1, { off: 0 }); k.rectZ('#d9cdb2', 7, [-10, -1.6], [1.2, 4.6], -1, { off: 0 });
    k.rectZ('#9a5844', 7, [1.6, 10], [0, 1.2], -1, { off: 0 }); k.rectZ('#d9cdb2', 7, [1.6, 10], [1.2, 4.6], -1, { off: 0 });
    k.rectZ('#d9cdb2', 7, [-1.6, 1.6], [3.0, 4.6], -1, { off: 0 });
    k.rectZ('#f6e7c0', 7.02, [-1.6, 1.6], [0, 3.0], -1, { off: 0 });          // daylight in the doorway
    for (const x of [-9.85, 9.85]) for (const z of [-4.5, 0, 4.5]) k.box('#3e4a4a', [0.3, 4.6, 0.4], [x, 0, z], { base: true });
    for (const z of [-4.5, 0, 4.5]) k.box('#3e4a4a', [20, 0.24, 0.3], [0, 4.36, z], { base: true });
    for (const s of [-1, 1]) for (let i = 0; i < 12; i++) { const z = -5.5 + i; k.poly(['#c4372b', '#e2b93b', '#4f8f8a', '#efe9dc'][i % 4], [[s * 9.95, 3.3, z - 0.22], [s * 9.95, 3.3, z + 0.22], [s * 9.95, 2.95 + 0.04 * Math.sin(i), z]], { facing: [-s, 0, 0] }); }
    for (let i = 0; i < 12; i++) { const x = -5.5 + i; k.poly(['#c4372b', '#e2b93b', '#4f8f8a', '#efe9dc'][i % 4], [[x - 0.22, 3.6, -6.95], [x + 0.22, 3.6, -6.95], [x, 3.25 + 0.04 * Math.sin(i), -6.95]], { facing: [0, 0, 1] }); }
    for (let i = 0; i < 7; i++) k.box(['#c96f4a', '#7e9b6e', '#d6c08a'][i % 3], [0.5, 0.32, 0.4], [-8.6 + i * 0.55, 0, 5.8], { base: true, c: 0.05 });
    // the crate drop: a pallet by the door
    k.box('#8a6a4a', [1.9, 0.12, 1.0], [DROP.x, 0, DROP.z + 0.75], { base: true });
    const hall = k.mesh('hall'); hall.castShadow = false; S.add(hall);
    const st = [[0, -3.6, 0, 1], [-6.4, -3.6, 0, 0], [6.4, -3.6, 0, 2], [-7.4, 2.4, Math.PI / 2, 3], [7.4, -0.4, -Math.PI / 2, 0]];
    this.stalls = st.map(([x, z, r, v]) => { const m = createModel('market_stall', v); m.position.set(x, 0, z); m.rotation.y = r; S.add(m); return m; });
    const jk = new Kit(1110);
    for (let i = 0; i < 9; i++) jar(jk, [-1.2 + (i % 5) * 0.32 + (i > 4 ? 0.16 : 0), 0.95, -2.05 - (i > 4 ? 0.28 : 0)], ['#c8732a', '#b8392e', '#d9a83a'][i % 3]);
    S.add(jk.mesh('jars'));
    // the two crates of jars on a little stack
    this.crates = [0, 1].map((i) => {
      const ck = new Kit(1120 + i);
      crate(ck, [0, 0, 0], 0, [0.7, 0.45, 0.5], '#a8875e');
      for (let j = 0; j < 6; j++) jar(ck, [-0.22 + (j % 3) * 0.22, 0.45, -0.1 + Math.floor(j / 3) * 0.2], ['#c8732a', '#b8392e'][j % 2]);
      const m = ck.mesh('crate' + i); m.position.set(PILE.x + i * 0.05, i * 0.62, PILE.z); m.rotation.y = 0.1 * i; S.add(m);
      return { m, state: 'pile' };
    });
    const sign = textSign('jamstall', "MA BELL'S PRESERVES", 2.6, 0.5, { bg: '#4f8f8a', fg: '#efe9dc', px: 90 });
    sign.position.set(0, 2.85, -1.75); S.add(sign);
    this.priceSign = textSign('jamprice', '2 JARS $40', 1.0, 0.42, { bg: '#2b2622', fg: '#efe9dc', px: 90 });
    this.priceSign.position.set(1.4, 1.35, -1.68); S.add(this.priceSign);
    const dsign = textSign('marketdoor', 'TO THE RV →', 1.2, 0.3, { bg: '#e2b93b', fg: '#2b2622', px: 80 });
    dsign.position.set(1.0, 3.25, 6.9); dsign.rotation.y = Math.PI; S.add(dsign);

    this.vendor = new Avatar(createModel('clerk', 1), { name: 'vendor' });
    this.vendor.set({ x: VENDOR.x, z: VENDOR.z, yaw: 0 }); S.add(this.vendor.root);
    this.customers = [[-5.5, 0.6, 2], [5.6, -0.6, 5], [-2.8, 4.2, 7]].map(([x, z, v], i) => {
      const a = new Avatar(createModel('ped', v), { name: 'cust' + i }); a.set({ x, z, yaw: Math.PI }); S.add(a.root);
      return { a, x, z, yaw: Math.PI, vx: 0, vz: 0, speed: 0, home: { x, z }, t: i * 2.3 };
    });

    const W = this.world;
    W.bounds = { x0: -10, x1: 10, z0: -7, z1: 7 };
    W.box(-1.65, 1.65, -4.8, -2.8, 'stall'); W.box(-8.05, -4.75, -4.8, -2.8, 'stall'); W.box(4.75, 8.05, -4.8, -2.48, 'stall');
    W.box(-10, -5.7, 0.75, 4.05, 'stall'); W.box(6.55, 10, -2.05, 1.25, 'stall');
    W.circle(VENDOR.x, VENDOR.z, 0.3, 'vendor');
    W.box(-8.9, -4.9, 5.55, 6.3, 'produce');
    W.box(DROP.x - 0.95, DROP.x + 0.95, DROP.z + 0.25, DROP.z + 1.25, 'pallet');
    this.custC = this.customers.map((c) => W.circle(c.x, c.z, 0.3, 'customer'));
    this.pileC = W.circle(PILE.x, PILE.z, 0.42, 'crates');

    Object.assign(this.P, { x: 0, z: 5.6, yaw: Math.PI, pitch: -0.05 });
    this.stage = 'go';
    this.round = 0; this.hits = 0; this.needle = 0; this.needlePh = 0; this.cd = 0;
    this.delivered = 0; this.carrying = null;
    this.ring = glowSpot('#F2B90F', 0.45, 0.9); S.add(this.ring);
    this.walkSpeed = 3.0;

    this.vendorT = this.addTarget({ id: 'vendor', pos: new THREE.Vector3(VENDOR.x, 1.45, VENDOR.z), r: 0.45, reach: 3.2, label: 'Haggle with Ma Bell', sub: '2 jars, $40 — let\'s talk', los: false, when: () => this.stage === 'go', use: () => this._startHaggle() });
    this.pileT = this.addTarget({ id: 'crates', pos: () => { const c = this._topCrate(); return c ? new THREE.Vector3(c.m.position.x, c.m.position.y + 0.3, c.m.position.z) : null; }, r: 0.5, reach: 2.4, label: 'Lift a crate', sub: 'heavy — no running', when: () => this.stage === 'carry' && !this.carrying && !!this._topCrate(), use: () => this._lift() });
    this.dropT = this.addTarget({ id: 'drop', pos: new THREE.Vector3(DROP.x, 0.5, DROP.z + 0.75), r: 1.0, reach: 2.6, label: 'Set it on the pallet', sub: 'by the door — the RV is right outside', los: false, when: () => this.stage === 'carry' && !!this.carrying, use: () => this._drop() });
    this._task();
  }

  _topCrate() { return this.crates.filter((c) => c.state === 'pile').sort((a, b) => b.m.position.y - a.m.position.y)[0] || null; }

  _task() {
    const rows = [
      { text: 'Haggle 3 rounds', icon: 'tag', state: this.stage === 'go' || this.stage === 'haggle' ? 'cur' : 'done' },
      { text: `Crate of jars 1`, icon: 'box', state: this.delivered >= 1 ? 'done' : this.stage === 'carry' ? 'cur' : 'todo' },
      { text: `Crate of jars 2`, icon: 'box', state: this.delivered >= 2 ? 'done' : this.stage === 'carry' && this.delivered === 1 ? 'cur' : 'todo' },
    ];
    const foot = this.stage === 'haggle' ? `Round ${Math.min(this.round + 1, 3)} of 3 — stop the needle on green.` : this.stage === 'carry' ? 'Out the door — the RV is waiting.' : 'Ma Bell\'s jam stall, at the back.';
    this.hud.setTask({ cap: 'Market run', n: this.stage === 'haggle' || this.stage === 'go' ? `${this.hits}/3` : `${this.delivered}/2`, store: this.def.name, rows, foot });
  }

  _startHaggle() {
    this.stage = 'haggle'; this.cd = 0.35; this.needlePh = 0;
    this._round();
    this.hands.setPose('idle', 0.25);
    this._task();
  }
  _round() {
    const w = [0.24, 0.17, 0.12, 0.08][Math.min(3, this.round)];
    const c = [0.62, 0.34, 0.71, 0.5][this.round % 4];
    this.zone = [c - w / 2, c + w / 2];
  }
  _lift() {
    const c = this._topCrate(); if (!c) return;
    c.state = 'held'; this.carrying = c;
    this.hands.setPose('carry', 0.22);
    this.hands.hold(c.m, 'both', { pos: [0, -0.36, -0.06], rot: [0.1, 0, 0] });
    c.m.scale.setScalar(0.74);
    if (!this.crates.some((x) => x.state === 'pile')) this.pileC.on = false;
    this._task();
  }
  _drop() {
    const c = this.carrying; if (!c) return;
    this.hands.hold(null, 'both');
    c.m.scale.setScalar(1);
    c.m.position.set(DROP.x - 0.42 + this.delivered * 0.85, 0.12, DROP.z + 0.75); c.m.rotation.set(0, 0, 0);
    this.scene.add(c.m);
    c.state = 'out'; this.carrying = null; this.delivered++;
    this.hands.setPose('walk', 0.25);
    this.toast(this.delivered >= 2 ? 'Loaded!' : 'One more crate', 'good');
    this._task();
    if (this.delivered >= 2) this._finishOk();
  }

  step(h) {
    this.cd = Math.max(0, this.cd - h);
    this._customers(h);
    if (this.stage === 'haggle') {
      this.B.speed = 0;
      const sp = [2.3, 3.1, 4.0, 4.6][Math.min(3, this.round)];
      this.needlePh += sp * h;
      this.needle = 0.5 + 0.5 * Math.sin(this.needlePh);
      this.promptOverride = { key: 'E', text: 'Haggle! Stop the needle in the green', sub: `round ${this.round + 1} of 3` };
      if (this.actPressed && this.cd <= 0) {
        this.consumeAct();
        const hit = this.needle >= this.zone[0] && this.needle <= this.zone[1];
        this.cd = 0.6; this.hands.reach('r', 0.3);
        if (hit) { this.hits++; this.hud.gaugeFlash(true); this.toast(LINES_HIT[this.round % 3], 'good'); this.vendorMood = -1; }
        else { this.hud.gaugeFlash(false); this.toast(LINES_MISS[this.round % 3], 'bad'); this.vendorMood = 1; this.shake = 0.3; }
        this.vendorTalk = 1.2;
        this.round++;
        if (this.round >= 3) {
          const price = [40, 32, 24, 20][Math.min(3, this.hits)];
          this.toast(this.hits >= 2 ? `Two jars for one! $${price}` : `Deal — $${price}`, 'good');
          this.stage = 'carry'; this.promptOverride = null; this.hud.gauge(null);
          this.hands.setPose('walk', 0.25);
        } else this._round();
        this._task();
      }
      return;
    }
    this.walkStep(h, { speedMul: this.carrying ? 0.78 : 1, canRun: !this.carrying });
    this.goal = this.stage === 'go' ? this.vendorT.pos : this.carrying ? this.dropT.pos : this.pileT.pos();
  }

  _customers(h) {
    this.customers.forEach((c, i) => {
      c.t += h;
      const tx = c.home.x + Math.sin(c.t * 0.25 + i) * 1.4, tz = c.home.z + Math.cos(c.t * 0.19 + i * 2) * 0.8;
      const dx = tx - c.x, dz = tz - c.z, l = Math.hypot(dx, dz);
      const go = l > 0.3 && Math.sin(c.t * 0.6 + i) > -0.2;
      walk(c, go ? dx / l : 0, go ? dz / l : 0, 0.9, h, this.world, 0.3, { ignore: (o) => o === this.custC[i] });
      this.custC[i].x = c.x; this.custC[i].z = c.z;
      c.a.set({ x: c.x, z: c.z, yaw: c.yaw, speed: c.speed });
    });
  }

  _finishOk() {
    const tf = this.timeLeft / this.timeLimit;
    const score = clamp(0.15 + 0.45 * this.hits / 3 + 0.42 * tf, 0.05, 1);
    this.finish(score, [`Haggled ${this.hits}/3 rounds${this.hits >= 2 ? ' — two jars for one' : ''}`, `Both crates out in ${Math.round(this.t + this.penalty)}s`]);
  }
  timeUp() { return { score: clamp(0.15 * this.hits / 3 + 0.1 * this.delivered, 0, 0.4), lines: [`Crates out: ${this.delivered}/2`] }; }
  progress() {
    if (this.stage === 'go') return { label: 'To the stall', frac: 0.05 };
    if (this.stage === 'haggle') return { label: `Haggle ${this.round}/3`, frac: 0.1 + 0.4 * this.round / 3 };
    return { label: `Crates ${this.delivered}/2`, frac: 0.5 + 0.25 * this.delivered + (this.carrying ? 0.12 : 0) };
  }

  visual(dt) {
    this.vendorTalk = Math.max(0, (this.vendorTalk || 0) - dt);
    const v = this.vendor;
    v.s.cheer = this.vendorTalk > 0 && this.vendorMood > 0 ? 1 : 0;
    v.s.wave = this.vendorTalk > 0 && this.vendorMood < 0 ? 1 : 0;
    v.s.lookY = this.stage === 'haggle' ? 0 : Math.sin(this.t * 0.7) * 0.4;
    v.update(dt);
    for (const c of this.customers) c.a.update(dt);
    const rp = this.stage === 'go' ? VENDOR_STAND : this.stage === 'carry' ? (this.carrying ? DROP : PILE) : null;
    this.ring.visible = !!rp;
    if (rp) { this.ring.position.set(rp.x, 0, rp.z + (rp === PILE ? -0.75 : 0)); this.ring.userData.set(0.6 + 0.4 * Math.sin(this.t * 5)); }
    if (this.stage === 'haggle') this.hud.gauge({ cap: `Haggle · round <b>${Math.min(this.round + 1, 3)}/3</b>`, hint: 'stop the needle in the green [E]', zone: this.zone, needle: this.needle });
    this.alertInfo = this.carrying ? { icon: 'box', text: 'Heavy crate', sub: 'no running', frac: null, tone: 'amber' } : null;
  }

  bot(h) {
    if (this.stage === 'haggle') {
      const mid = (this.zone[0] + this.zone[1]) / 2, w = this.zone[1] - this.zone[0];
      return { ...this.botAim(this.vendorT.pos), act: Math.abs(this.needle - mid) < w * 0.3 && this.cd <= 0 };
    }
    if (this.stage === 'go') return this.botUse(this.vendorT, h, { stand: VENDOR_STAND });
    if (!this.carrying) return this.botUse(this.pileT, h, { stand: { x: PILE.x, z: PILE.z - 1.0 } });
    return this.botUse(this.dropT, h, { stand: { x: DROP.x, z: DROP.z - 0.7 }, run: false });
  }
  debugExtra() { return { stage: this.stage, hits: this.hits, round: this.round, delivered: this.delivered, carrying: !!this.carrying }; }
}
