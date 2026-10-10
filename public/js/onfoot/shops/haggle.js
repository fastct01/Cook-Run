// ─────────────────────────────────────────────────────────────────────────────
// haggle — Old Town Market. Inside a cast-iron market hall: talk to the vendor (clerk v1) at the jam
// stall, stop the swinging price needle in the green (3 rounds, shrinking zone, faster needle), then
// carry the 2 crates out to the door where the RV waits.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { createModel } from '../../assets/index.js';
import { ShopBase, clamp, wrap } from './ShopBase.js';
import { Kit, room, crate, jar, textSign, glowSpot, shade } from './build.js';
import { el } from '../hud.js';
import { Avatar } from '../avatar.js';
import { walk } from './world2d.js';

const VENDOR_STAND = { x: 0, z: -0.55 };
const DROP = { x: 0, z: 5.6 };
const PILE = { x: 3.1, z: -1.2 };
const LINES_HIT = ['Argh — fine, fine!', 'You drive a hard bargain…', 'Two for one. Don\'t tell my wife.'];
const LINES_MISS = ['Ha! Nice try, cowboy.', 'Full price, friend.', 'No no no no.'];

export class HaggleChallenge extends ShopBase {
  build() {
    const S = this.scene;
    S.background = new THREE.Color('#2b2622');
    S.add(new THREE.HemisphereLight('#f3ead6', '#6e5a44', 1.2));
    const sun = new THREE.DirectionalLight('#ffe2b0', 1.6);
    sun.position.set(-5, 16, 8); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 10, bottom: -10, near: 1, far: 50 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    S.add(sun);
    for (const [x, z] of [[-5, -1], [5, -1], [0, 3.5]]) { const L = new THREE.PointLight('#ffcf8a', 7, 10, 1.4); L.position.set(x, 3.6, z); S.add(L); }

    // hall shell: brick dado, cream upper walls, cobble-ish tile floor, cast-iron columns + arches
    const k = new Kit(1100);
    room(k, { x0: -10, x1: 10, z0: -7, z1: 7, h: 4.2, floor: '#8a7f70', wall: '#d9cdb2', low: '#9a5844', band: 1.2, tile: { size: 1, alt: '#7d7264' }, skip: ['front'] });
    // front wall with the open double door
    k.rectZ('#9a5844', 7, [-10, -1.6], [0, 1.2], -1, { off: 0 }); k.rectZ('#d9cdb2', 7, [-10, -1.6], [1.2, 4.2], -1, { off: 0 });
    k.rectZ('#9a5844', 7, [1.6, 10], [0, 1.2], -1, { off: 0 }); k.rectZ('#d9cdb2', 7, [1.6, 10], [1.2, 4.2], -1, { off: 0 });
    k.rectZ('#d9cdb2', 7, [-1.6, 1.6], [3.0, 4.2], -1, { off: 0 });
    k.rectZ('#f6e7c0', 7.02, [-1.6, 1.6], [0, 3.0], -1, { off: 0 });          // daylight in the doorway
    // cast-iron wall pilasters
    for (const x of [-9.85, 9.85]) for (const z of [-4.5, 0, 4.5]) k.box('#3e4a4a', [0.3, 4.2, 0.4], [x, 0, z], { base: true });
    // bunting along the side walls
    for (const s of [-1, 1]) for (let i = 0; i < 12; i++) { const z = -5.5 + i; k.poly(['#c4372b', '#e2b93b', '#4f8f8a', '#efe9dc'][i % 4], [[s * 9.95, 3.3, z - 0.22], [s * 9.95, 3.3, z + 0.22], [s * 9.95, 2.95 + 0.04 * Math.sin(i), z]], { facing: [-s, 0, 0] }); }
    // produce on the side stalls' fronts + sacks + baskets
    for (let i = 0; i < 7; i++) k.box(['#c96f4a', '#7e9b6e', '#d6c08a'][i % 3], [0.5, 0.32, 0.4], [-8.6 + i * 0.55, 0, 5.8], { base: true, c: 0.05 });
    const hall = k.mesh('hall'); hall.castShadow = false; S.add(hall);
    // stalls (market_stall models): the jam stall centre-back, others around
    const st = [[0, -3.6, 0, 0], [-6.4, -3.6, 0, 1], [6.4, -3.6, 0, 2], [-7.4, 2.4, Math.PI / 2, 3], [7.4, 2.4, -Math.PI / 2, 1]];
    this.stalls = st.map(([x, z, r, v]) => { const m = createModel('market_stall', v); m.position.set(x, 0, z); m.rotation.y = r; S.add(m); return m; });
    // jars on the vendor's counter + the crates to carry
    const jk = new Kit(1110);
    for (let i = 0; i < 9; i++) jar(jk, [-1.2 + (i % 5) * 0.32 + (i > 4 ? 0.16 : 0), 0.95 + (i > 4 ? 0.0 : 0), -2.05 - (i > 4 ? 0.28 : 0)], ['#c8732a', '#b8392e', '#d9a83a'][i % 3]);
    const jars = jk.mesh('jars'); S.add(jars);
    this.crates = [0, 1].map((i) => {
      const ck = new Kit(1120 + i);
      crate(ck, [0, 0, 0], 0, [0.7, 0.45, 0.5], '#a8875e');
      for (let j = 0; j < 6; j++) jar(ck, [-0.22 + (j % 3) * 0.22, 0.45, -0.1 + Math.floor(j / 3) * 0.2], ['#c8732a', '#b8392e'][j % 2]);
      const m = ck.mesh('crate' + i); m.position.set(PILE.x + i * 0.05, i * 0.62, PILE.z); m.rotation.y = 0.1 * i; S.add(m);
      return { m, state: 'pile' };
    });
    const sign = textSign('jamstall', "MA BELL'S PRESERVES", 2.6, 0.5, { bg: '#4f8f8a', fg: '#efe9dc', px: 90 });
    sign.position.set(0, 2.85, -1.75); S.add(sign);
    const price = this.priceSign = textSign('jamprice', '2 JARS $40', 1.0, 0.42, { bg: '#2b2622', fg: '#efe9dc', px: 90 });
    price.position.set(1.4, 1.35, -1.68); S.add(price);

    // vendor + browsing customers
    this.vendor = new Avatar(createModel('clerk', 1), { name: 'vendor' });
    this.vendor.set({ x: 0, z: -2.75, yaw: 0 }); S.add(this.vendor.root);
    this.customers = [[-5.5, 0.6, 2], [5.0, 1.2, 5], [-2.8, 4.2, 7]].map(([x, z, v], i) => {
      const a = new Avatar(createModel('ped', v), { name: 'cust' + i }); a.set({ x, z, yaw: Math.PI }); S.add(a.root);
      return { a, x, z, yaw: Math.PI, vx: 0, vz: 0, speed: 0, home: { x, z }, t: i * 2.3 };
    });

    // colliders
    const W = this.world;
    W.bounds = { x0: -10, x1: 10, z0: -7, z1: 7 };
    W.box(-2.2, 2.2, -5.5, -1.75, 'stall'); W.box(-8.6, -4.2, -5.5, -1.75, 'stall'); W.box(4.2, 8.6, -5.5, -1.75, 'stall');
    W.box(-10, -5.5, 0.2, 4.6, 'stall'); W.box(5.5, 10, 0.2, 4.6, 'stall');
    W.box(-8.9, -4.9, 5.55, 6.3, 'produce');
    this.custC = this.customers.map((c) => W.circle(c.x, c.z, 0.3, 'customer'));
    this.pileC = W.circle(PILE.x, PILE.z, 0.4, 'crates');

    Object.assign(this.rook, { x: 0, z: 5.8, yaw: Math.PI });
    this.cam = { ...this.cam, yaw: Math.PI, dist: 6.8, h: 7.4, look: 0.9, fov: 50, lag: 4 };
    this.stage = 'go';
    this.round = 0; this.hits = 0; this.needle = 0; this.needlePh = 0; this.cd = 0;
    this.delivered = 0;
    this.ring = glowSpot('#ffd36a', 0.45, 0.8); S.add(this.ring);
    this.walkSpeed = 2.6;
  }

  _gauge() {
    const box = this.gBox = el('div', 'ofs-meter', this.hud.root);
    box.innerHTML = `<div class="ofs-gauge-cap"><span>HAGGLE · ROUND <b class="n">1/3</b></span><span>stop the needle in the green <kbd>E</kbd></span></div><div class="ofs-gauge"><div class="zone"></div><div class="needle"></div></div>`;
    this.g = { box, gauge: box.querySelector('.ofs-gauge'), zone: box.querySelector('.zone'), needle: box.querySelector('.needle'), n: box.querySelector('.n') };
    this._round();
  }
  _round() {
    const rounds = this.shop.rounds || 3;
    const w = [0.24, 0.17, 0.11, 0.08][Math.min(3, this.round)];
    const c = [0.62, 0.34, 0.71, 0.5][this.round % 4];
    this.zone = [c - w / 2, c + w / 2];
    this.g.zone.style.left = `${this.zone[0] * 100}%`; this.g.zone.style.width = `${w * 100}%`;
    this.g.n.textContent = `${this.round + 1}/${rounds}`;
  }

  step(h) {
    const R = this.rook, rounds = this.shop.rounds || 3;
    this.cd = Math.max(0, this.cd - h);
    if (this.stage === 'haggle') {
      R.vx = R.vz = R.speed = 0;
      R.yaw += wrap(Math.PI - R.yaw) * Math.min(1, h * 8);
      const sp = [2.3, 3.1, 4.0, 4.6][Math.min(3, this.round)];
      this.needlePh += sp * h;
      this.needle = 0.5 + 0.5 * Math.sin(this.needlePh);
      this.g.needle.style.left = `${this.needle * 100}%`;
      this.prompt = { text: 'Haggle! [E] when the needle is in the green', near: true, sub: `round ${this.round + 1} of ${rounds}` };
      if (this.actPressed && this.cd <= 0) {
        const hit = this.needle >= this.zone[0] && this.needle <= this.zone[1];
        this.cd = 0.7; R.act = 0.4;
        if (hit) { this.hits++; this.g.gauge.classList.remove('flash'); void this.g.gauge.offsetWidth; this.g.gauge.classList.add('flash'); this.popAt(LINES_HIT[this.round % 3], 'good', 0, 2.5, -2.75); this.vendorMood = -1; }
        else { this.g.gauge.classList.remove('miss'); void this.g.gauge.offsetWidth; this.g.gauge.classList.add('miss'); this.popAt(LINES_MISS[this.round % 3], 'bad', 0, 2.5, -2.75); this.vendorMood = 1; this.shake = 0.3; }
        this.vendorT = 1.2;
        this.round++;
        if (this.round >= rounds) {
          this.g.box.remove();
          const price = [40, 32, 24, 20][Math.min(3, this.hits)];
          this.hud.pop(this.hits >= 2 ? `Two jars for one! $${price}` : `Deal — $${price}`, 'big');
          this.stage = 'carry';
        } else this._round();
      }
      return;
    }
    this.walkRook(h, { speedMul: R.carry ? 0.78 : 1, canRun: !R.carry });
    this._customers(h);
    if (this.stage === 'go') {
      const at = this.near(VENDOR_STAND, 1.2);
      this.prompt = { text: at ? 'Talk prices with Ma Bell [E]' : 'Find the jam stall at the back', near: at };
      this._ringAt(VENDOR_STAND);
      if (at && this.actPressed) { this.stage = 'haggle'; this.cd = 0.4; this._gauge(); R.x += (VENDOR_STAND.x - R.x) * 0.5; R.z += (VENDOR_STAND.z - R.z) * 0.5; }
    } else if (this.stage === 'carry') {
      const left = 2 - this.delivered;
      if (!R.carry) {
        const at = this.near(PILE, 1.25);
        this.prompt = { text: at ? 'Pick up a crate [E]' : `Carry the crates to the door — ${this.delivered}/2`, near: at };
        this._ringAt(PILE);
        if (at && this.actPressed) {
          const c = this.crates.find((x) => x.state === 'pile' && x.m.position.y > 0.1) || this.crates.find((x) => x.state === 'pile');
          c.state = 'held'; R.carry = 'crate'; R.act = 0.3; this.heldCrate = c;
          if (!this.crates.some((x) => x.state === 'pile')) this.pileC.on = false;
        }
      } else {
        const at = this.near(DROP, 1.3);
        this.prompt = { text: at ? 'Set it down by the door [E]' : 'Out the door to the RV', near: at, sub: 'heavy — no running' };
        this._ringAt(DROP);
        if (at && this.actPressed) {
          const c = this.heldCrate; c.state = 'out'; R.carry = null; this.heldCrate = null;
          c.m.position.set(DROP.x - 0.8 + this.delivered * 0.85, 0, DROP.z + 0.6); c.m.rotation.y = 0;
          this.delivered++;
          this.popRook(left === 1 ? 'Loaded!' : 'One more', 'good');
          if (this.delivered >= 2) this._finishOk();
        }
      }
    }
  }
  _ringAt(p) { this.ring.visible = true; this.ring.position.set(p.x, 0, p.z); }

  _customers(h) {
    this.customers.forEach((c, i) => {
      c.t += h;
      const tx = c.home.x + Math.sin(c.t * 0.25 + i) * 1.6, tz = c.home.z + Math.cos(c.t * 0.19 + i * 2) * 0.9;
      const dx = tx - c.x, dz = tz - c.z, l = Math.hypot(dx, dz);
      const go = l > 0.3 && Math.sin(c.t * 0.6 + i) > -0.2;
      walk(c, go ? dx / l : 0, go ? dz / l : 0, 0.9, h, this.world, 0.3, { ignore: (o) => o === this.custC[i] });
      this.custC[i].x = c.x; this.custC[i].z = c.z;
      c.a.set({ x: c.x, z: c.z, yaw: c.yaw, speed: c.speed });
    });
  }

  _finishOk() {
    const rounds = this.shop.rounds || 3;
    const tf = this.timeLeft / this.timeLimit;
    const score = clamp(0.15 + 0.45 * this.hits / rounds + 0.42 * tf, 0.05, 1);
    this.finish(score, [`Haggled ${this.hits}/${rounds} rounds${this.hits >= 2 ? ' — two jars for one' : ''}`, `Both crates out in ${Math.round(this.t + this.penalty)}s`]);
  }
  timeUp() {
    const rounds = this.shop.rounds || 3;
    return { score: clamp(0.15 * this.hits / rounds + 0.1 * this.delivered, 0, 0.4), lines: [`Crates out: ${this.delivered}/2`] };
  }

  visual(dt) {
    const R = this.rook;
    this.cam.x = R.x; this.cam.z = R.z - 1.0;
    if (this.heldCrate) { this.heldCrate.m.position.set(R.x + Math.sin(R.yaw) * 0.45, 0.62 + Math.abs(Math.sin(this.rookAv.phase)) * 0.03, R.z + Math.cos(R.yaw) * 0.45); this.heldCrate.m.rotation.y = R.yaw; }
    this.vendorT = Math.max(0, (this.vendorT || 0) - dt);
    const v = this.vendor;
    v.s.cheer = this.vendorT > 0 && this.vendorMood > 0 ? 1 : 0;
    v.s.wave = this.vendorT > 0 && this.vendorMood < 0 ? 1 : 0;
    v.s.lookY = this.stage === 'haggle' ? 0 : Math.sin(this.t * 0.7) * 0.4;
    v.update(dt);
    for (const c of this.customers) c.a.update(dt);
    if (this.ring.visible) this.ring.userData.set(0.6 + 0.4 * Math.sin(this.t * 5));
    if (this.stage === 'haggle' || this.stage === 'done') this.ring.visible = false;
  }

  bot(h) {
    const R = this.rook;
    if (this.stage === 'haggle') {
      const mid = (this.zone[0] + this.zone[1]) / 2, w = this.zone[1] - this.zone[0];
      return { act: Math.abs(this.needle - mid) < w * 0.3 && this.cd <= 0 };
    }
    const goal = this.stage === 'go' ? VENDOR_STAND : R.carry ? DROP : PILE;
    if (this.near(goal, 1.0)) return { act: true };
    if (!this._bp || this._bp.goal !== goal || this._bp.t > 2) this._bp = { goal, path: this.world.path(R.x, R.z, goal.x, goal.z, 0.34), t: 0 };
    this._bp.t += h;
    const P = this._bp.path;
    while (P.length > 1 && Math.hypot(P[0].x - R.x, P[0].z - R.z) < 0.45) P.shift();
    const w = P[0] || goal, dx = w.x - R.x, dz = w.z - R.z, l = Math.hypot(dx, dz) || 1;
    return { move: { x: dx / l, z: dz / l }, run: !R.carry };
  }
  debugExtra() { return { stage: this.stage, hits: this.hits, round: this.round, delivered: this.delivered }; }
}
