// ─────────────────────────────────────────────────────────────────────────────
// pump — Sunny Gas & Ice forecourt (`store_gas`). Hold E to pump: the meter speeds up as it fills;
// release on the line (2 tries, best counts). Then bag ice at the chest by the door: mash E to fill
// 3 bags before they melt.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { createModel } from '../../assets/index.js';
import { ShopBase, clamp, wrap } from './ShopBase.js';
import { Kit, glowSpot, textSign } from './build.js';
import { el } from '../hud.js';

const PUMP = { x: 7, z: 3.0 };
const PUMP_STAND = { x: 5.85, z: 3.0 };
const CHEST = { x: -9.8, z: -0.7 };
const CHEST_STAND = { x: -9.8, z: 0.55 };
const LINE = 0.82, TOL = 0.2, BAG_PRESSES = 7, BAGS = 3, MELT = 8;

export class PumpChallenge extends ShopBase {
  build() {
    const S = this.scene;
    S.background = new THREE.Color('#c9dde4');
    S.fog = new THREE.Fog('#c9dde4', 45, 130);
    S.add(new THREE.HemisphereLight('#e6eff4', '#8a7a62', 1.3));
    const sun = new THREE.DirectionalLight('#fff3dc', 2.3);
    sun.position.set(-14, 24, 12); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 14, bottom: -14, near: 1, far: 80 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
    S.add(sun);
    const k = new Kit(1300);
    k.box('#b9a98a', [80, 0.1, 60], [0, -0.06, 0]);                                // dusty verge
    k.box('#4a4b4f', [80, 0.02, 9], [0, 0, 13]);                                   // the road in front
    for (let x = -38; x < 40; x += 6) k.rectY('#e9e2cf', 0.011, [x, x + 3], [12.9, 13.1], { off: 0 });
    const ground = k.mesh('verge'); ground.castShadow = false; S.add(ground);
    const store = createModel('store_gas', this.def.variant || 0); S.add(store);
    const rv = createModel('rv'); rv.position.set(4, 0, 1.6); S.add(rv);
    const att = createModel('clerk', 3); att.position.set(-6.4, 0, -0.3); att.rotation.y = 0.4; S.add(att); this.att = att;
    const sign = textSign('icesign', 'ICE  $2', 1.2, 0.45, { bg: '#2f74ff', fg: '#efe9dc', px: 110 });
    sign.position.set(CHEST.x, 1.75, CHEST.z + 0.42); S.add(sign);
    // ice bags that appear on top of the chest as they fill
    this.bags = [0, 1, 2].map((i) => {
      const bk = new Kit(1310 + i);
      bk.box('#e8f2f6', [0.32, 0.36, 0.22], [0, 0, 0], { base: true, c: 0.06 });
      bk.rectZ('#2f74ff', 0.111, [-0.1, 0.1], [0.14, 0.24], 1);
      const m = bk.mesh('bag' + i); m.position.set(CHEST.x - 0.5 + i * 0.5, 1.12, CHEST.z + 0.05); m.visible = false; S.add(m);
      return m;
    });
    // nozzle in Rook's hand (shown while pumping)
    const nk = new Kit(1320);
    nk.box('#2a2a2b', [0.06, 0.14, 0.2], [0, 0, 0.04]); nk.cyl('#5f6468', 0.02, 0.02, 0.2, [0, -0.04, 0.2], { axis: 'z', seg: 5 });
    this.nozzle = nk.mesh('nozzle'); this.nozzle.visible = false; this.rookAv.handR.add(this.nozzle);

    const W = this.world;
    W.bounds = { x0: -16, x1: 16, z0: -7.5, z1: 10 };
    W.box(-15.2, -2.8, -8, -1.15, 'shop');
    W.box(-10.65, -8.95, -1.15, -0.25, 'chest');
    W.box(0.35, 1.65, -1.05, 4.25, 'island'); W.box(6.35, 7.65, -1.05, 4.25, 'island');
    W.box(2.65, 5.35, -2.75, 5.95, 'rv');
    for (const [x, z] of [[-1, -0.4], [9, -0.4], [-1, 3.6], [9, 3.6]]) W.circle(x, z, 0.28, 'pillar');
    W.circle(-6.4, -0.3, 0.3, 'attendant'); W.circle(-2.4, -1.0, 0.35, 'bin'); W.circle(13, -4, 0.4, 'air');

    Object.assign(this.rook, { x: 5.9, z: -3.6, yaw: 0 });
    // below the 5 m canopy, looking in from the road side
    this.cam = { ...this.cam, yaw: Math.PI * 0.96, dist: 6.6, h: 4.3, look: 1.0, fov: 54, lag: 4 };
    this.stage = 'toPump';
    this.tries = []; this.level = 0; this.pumping = false; this.bagP = 0; this.bagsDone = 0; this.melt = MELT;
    this.ring = glowSpot('#ffd36a', 0.5, 0.8); S.add(this.ring);
  }

  _gauge(cap, hint) {
    if (this.g) this.g.box.remove();
    const box = el('div', 'ofs-meter', this.hud.root);
    box.innerHTML = `<div class="ofs-gauge-cap"><span>${cap}</span><span>${hint}</span></div><div class="ofs-gauge"><div class="zone"></div><div class="fill"></div><div class="line"></div></div>`;
    this.g = { box, gauge: box.querySelector('.ofs-gauge'), fill: box.querySelector('.fill'), zone: box.querySelector('.zone'), line: box.querySelector('.line'), cap: box.querySelector('span') };
    return this.g;
  }

  step(h) {
    const R = this.rook;
    if (this.stage === 'pump') {
      R.vx = R.vz = R.speed = 0; R.carry = 'nozzle';
      R.yaw += wrap(Math.PI / 2 - R.yaw) * Math.min(1, h * 8);
      const holding = this.actHeld;
      if (holding && !this.pumping && this.level === 0) this.pumping = true;
      if (this.pumping) {
        if (holding) {
          this.level += (0.1 + 0.6 * this.level * this.level) * h;
          if (this.level >= 1) { this.level = 1; this._release(true); }
        } else this._release(false);
      }
      this.prompt = { text: this.pumping ? 'Let go on the line!' : `Hold [E] to pump — try ${this.tries.length + 1}/2`, near: true, sub: 'it speeds up as it fills' };
      return;
    }
    if (this.stage === 'ice') {
      R.vx = R.vz = R.speed = 0; R.carry = null;
      R.yaw += wrap(Math.PI - R.yaw) * Math.min(1, h * 8);
      this.melt -= h;
      if (this.actPressed) {
        this.bagP++; R.act = 0.25;
        if (this.bagP >= BAG_PRESSES) { this.bags[this.bagsDone].visible = true; this.bagsDone++; this.bagP = 0; this.popAt(`Bag ${this.bagsDone}!`, 'good', CHEST.x, 2.2, CHEST.z); }
      }
      const frac = (this.bagsDone + this.bagP / BAG_PRESSES) / BAGS;
      this.g.fill.style.width = `${frac * 100}%`;
      this.g.cap.innerHTML = `BAG THE ICE · <b>${this.bagsDone}/${BAGS}</b> · melting in ${Math.max(0, this.melt).toFixed(1)}s`;
      this.prompt = { text: 'Mash [E] to bag the ice!', near: true };
      if (this.bagsDone >= BAGS || this.melt <= 0) { this.g.box.remove(); this.g = null; this._finishOk(); }
      return;
    }
    this.walkRook(h);
    if (this.stage === 'toPump') {
      const at = this.near(PUMP_STAND, 1.15);
      this.prompt = { text: at ? 'Grab the nozzle [E]' : 'Walk to pump 4', near: at };
      this._ringAt(PUMP_STAND);
      if (at && this.actPressed) {
        this.stage = 'pump'; this.ring.visible = false;
        R.x += (PUMP_STAND.x - R.x) * 0.7; R.z += (PUMP_STAND.z - R.z) * 0.7;
        const g = this._gauge('FUEL · <b>try 1/2</b>', 'release on the line');
        g.zone.style.left = `${(LINE - 0.05) * 100}%`; g.zone.style.width = '10%'; g.line.style.left = `${LINE * 100}%`;
        this.nozzle.visible = true;
      }
    } else if (this.stage === 'toIce') {
      const at = this.near(CHEST_STAND, 1.2);
      this.prompt = { text: at ? 'Open the ice chest [E]' : 'Ice chest by the shop door', near: at };
      this._ringAt(CHEST_STAND);
      if (at && this.actPressed) {
        this.stage = 'ice'; this.ring.visible = false; this.melt = MELT;
        const g = this._gauge('BAG THE ICE', 'mash <kbd>E</kbd>');
        g.zone.style.display = 'none'; g.line.style.display = 'none';
      }
    }
  }
  _ringAt(p) { this.ring.visible = true; this.ring.position.set(p.x, 0, p.z); }

  _release(spill) {
    this.pumping = false;
    const acc = spill ? 0 : clamp(1 - Math.abs(this.level - LINE) / TOL, 0, 1);
    this.tries.push(acc);
    const txt = spill ? 'SPILL! Gas everywhere…' : acc > 0.9 ? 'Bang on the line!' : acc > 0.6 ? 'Close!' : this.level < LINE ? 'Too early' : 'Over!';
    this.popAt(txt, spill || acc < 0.6 ? 'bad' : 'good', PUMP.x, 2.4, PUMP.z);
    this.g.gauge.classList.remove('flash', 'miss'); void this.g.gauge.offsetWidth; this.g.gauge.classList.add(acc > 0.6 ? 'flash' : 'miss');
    if (spill) this.shake = 0.4;
    if (this.tries.length >= 2 || acc >= 0.8) {
      this.pumpAcc = Math.max(...this.tries);
      this.stage = 'toIce'; this.nozzle.visible = false; this.rook.carry = null;
      setTimeout(() => { if (this.g && this.stage !== 'ice') { this.g.box.remove(); this.g = null; } }, 700);
    } else {
      this.level = 0;
      this.g.cap.innerHTML = 'FUEL · <b>try 2/2</b>';
    }
  }

  _finishOk() {
    const tf = this.timeLeft / this.timeLimit;
    const bags = this.bagsDone / BAGS;
    const score = clamp(0.45 * (this.pumpAcc ?? 0) + 0.35 * bags + 0.3 * tf, 0.05, 1);
    this.finish(score, [`Pump: ${Math.round((this.pumpAcc ?? 0) * 100)}% on the line (${this.tries.length} ${this.tries.length > 1 ? 'tries' : 'try'})`, `Ice: ${this.bagsDone}/${BAGS} bags`, `${Math.round(this.t + this.penalty)}s on the forecourt`]);
  }
  timeUp() { return { score: clamp(0.25 * (this.pumpAcc ?? 0) + 0.1 * this.bagsDone / BAGS, 0, 0.35), lines: [] }; }

  visual(dt) {
    const R = this.rook;
    if (this.stage === 'pump') { this.cam.x = (R.x + PUMP.x) / 2; this.cam.z = R.z - 0.6; this.cam.dist = 5.4; this.cam.h = 3.6; }
    else { this.cam.x = R.x; this.cam.z = R.z - 0.5; this.cam.dist = 6.6; this.cam.h = 4.3; }
    if (this.g && this.stage === 'pump') this.g.fill.style.width = `${this.level * 100}%`;
    if (this.ring.visible) this.ring.userData.set(0.55 + 0.45 * Math.sin(this.t * 5));
  }

  bot(h) {
    const R = this.rook;
    if (this.stage === 'pump') {
      if (!this.pumping && this.level === 0) return { held: true };
      return { held: this.level < LINE - 0.012 };
    }
    if (this.stage === 'ice') { this._mash = (this._mash || 0) + h; if (this._mash > 0.11) { this._mash = 0; return { act: true }; } return {}; }
    const goal = this.stage === 'toPump' ? PUMP_STAND : CHEST_STAND;
    if (this.near(goal, 1.0)) return { act: true };
    if (!this._bp || this._bp.goal !== goal) this._bp = { goal, path: this.world.path(R.x, R.z, goal.x, goal.z, 0.34) };
    const P = this._bp.path;
    while (P.length > 1 && Math.hypot(P[0].x - R.x, P[0].z - R.z) < 0.45) P.shift();
    const w = P[0] || goal, dx = w.x - R.x, dz = w.z - R.z, l = Math.hypot(dx, dz) || 1;
    return { move: { x: dx / l, z: dz / l }, run: true };
  }
  debugExtra() { return { stage: this.stage, level: +this.level.toFixed(2), tries: this.tries, bags: this.bagsDone }; }
}
