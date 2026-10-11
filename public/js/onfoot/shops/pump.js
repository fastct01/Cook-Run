// ─────────────────────────────────────────────────────────────────────────────
// pump — Round 3 first person (agent SHOPS). Sunny Gas & Ice forecourt (`store_gas`): take the nozzle from
// pump 4 (Doc holds it in his right hand), aim at the RV's filler and HOLD E — the meter speeds up as it fills;
// let go on the line (2 tries, the best counts; overfill = spill). Then the ice chest by the shop door: mash E
// to bag 3 bags before they melt.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { createModel } from '../../assets/index.js';
import { FpShop, clamp } from './fpBase.js';
import { Kit, glowSpot, textSign } from './build.js';

const PUMP = { x: 7, z: 3.0 };
const PUMP_STAND = { x: 5.9, z: 3.0 };
const FILLER = new THREE.Vector3(5.37, 1.05, 3.9);
const CHEST = { x: -9.8, z: -0.7 };
const CHEST_STAND = { x: -9.8, z: 0.55 };
const LINE = 0.82, TOL = 0.2, BAG_PRESSES = 6, BAGS = 3, MELT = 8;

export class PumpChallenge extends FpShop {
  controls() { return [['Mouse', 'look'], ['W A S D', 'walk'], ['Shift', 'run'], ['E', 'hold: pump · tap: bag']]; }

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
    k.box('#b9a98a', [80, 0.1, 60], [0, -0.06, 0]);
    k.box('#4a4b4f', [80, 0.02, 9], [0, 0, 13]);
    for (let x = -38; x < 40; x += 6) k.rectY('#e9e2cf', 0.011, [x, x + 3], [12.9, 13.1], { off: 0 });
    // the RV's filler cap + a "DIESEL" sticker on the RV's +X flank
    k.box('#2a2a2b', [0.04, 0.2, 0.2], [FILLER.x - 0.01, FILLER.y, FILLER.z], { c: 0.02 });
    k.box('#d9b13a', [0.02, 0.16, 0.16], [FILLER.x + 0.02, FILLER.y, FILLER.z], {});
    S.add(k.mesh('verge'));
    const store = createModel('store_gas', this.def.variant || 0); S.add(store);
    const rv = createModel('rv'); rv.position.set(4, 0, 1.6); S.add(rv);
    const att = createModel('clerk', 3); att.position.set(-6.4, 0, -0.3); att.rotation.y = 0.4; S.add(att);
    const sign = textSign('icesign', 'ICE  $2', 1.2, 0.45, { bg: '#2f74ff', fg: '#efe9dc', px: 110 });
    sign.position.set(CHEST.x, 1.75, CHEST.z + 0.42); S.add(sign);
    const p4 = textSign('pump4', 'PUMP 4', 0.7, 0.24, { bg: '#e2b93b', fg: '#2b2622', px: 90 });
    p4.position.set(PUMP.x - 0.42, 2.05, PUMP.z); p4.rotation.y = -Math.PI / 2; S.add(p4);
    this.bags = [0, 1, 2].map((i) => {
      const bk = new Kit(1310 + i);
      bk.box('#e8f2f6', [0.32, 0.36, 0.22], [0, 0, 0], { base: true, c: 0.06 });
      bk.rectZ('#2f74ff', 0.111, [-0.1, 0.1], [0.14, 0.24], 1);
      const m = bk.mesh('bag' + i); m.position.set(CHEST.x - 0.5 + i * 0.5, 1.12, CHEST.z + 0.05); m.visible = false; S.add(m);
      return m;
    });
    // the nozzle Doc holds (forward = −Z): pistol grip, trigger guard, spout, a stub of hose
    const nk = new Kit(1320);
    nk.box('#2a2a2b', [0.05, 0.12, 0.16], [0, -0.01, 0.0], { c: 0.01 });
    nk.box('#3a3b3d', [0.045, 0.03, 0.13], [0, -0.075, -0.01], {});
    nk.cyl('#5f6468', 0.016, 0.02, 0.2, [0, 0.035, -0.16], { axis: 'z', seg: 7 });
    nk.cyl('#1f2022', 0.022, 0.022, 0.24, [0, -0.06, 0.16], { axis: 'z', seg: 6, rot: [0.6, 0, 0] });
    nk.box('#e2b93b', [0.052, 0.035, 0.05], [0, 0.04, 0.03], {});
    this.nozzle = nk.mesh('nozzle'); this.nozzle.castShadow = false;
    // a matching nozzle in the pump holster (hidden while Doc holds it)
    this.holster = nk.mesh('nozzle_holster'); this.holster.position.set(PUMP.x - 0.38, 1.15, PUMP.z + 0.25); this.holster.rotation.set(0.9, Math.PI / 2, 0); S.add(this.holster);

    const W = this.world;
    W.bounds = { x0: -16, x1: 16, z0: -7.5, z1: 10 };
    W.box(-15.2, -2.8, -8, -1.15, 'shop');
    W.box(-10.65, -8.95, -1.15, -0.25, 'chest');
    W.box(0.35, 1.65, -1.05, 4.25, 'island'); W.box(6.35, 7.65, -1.05, 4.25, 'island');
    W.box(2.65, 5.35, -2.75, 5.95, 'rv');
    for (const [x, z] of [[-1, -0.4], [9, -0.4], [-1, 3.6], [9, 3.6]]) W.circle(x, z, 0.28, 'pillar');
    W.circle(-6.4, -0.3, 0.3, 'attendant'); W.circle(-2.4, -1.0, 0.35, 'bin'); W.circle(13, -4, 0.4, 'air');

    Object.assign(this.P, { x: 5.9, z: -3.4, yaw: 0, pitch: -0.08 });
    this.stage = 'toPump';
    this.tries = []; this.level = 0; this.pumping = false; this.bagP = 0; this.bagsDone = 0; this.melt = MELT;
    this.ring = glowSpot('#F2B90F', 0.45, 0.8); S.add(this.ring);
    this.hands.setPose('walk', 0.01);

    this.nozzleT = this.addTarget({ id: 'nozzle', pos: new THREE.Vector3(PUMP.x - 0.38, 1.15, PUMP.z + 0.25), r: 0.3, reach: 2.4, label: 'Take the nozzle', sub: 'pump 4', when: () => this.stage === 'toPump', use: () => this._takeNozzle() });
    this.fillerT = this.addTarget({ id: 'filler', pos: FILLER, r: 0.3, reach: 2.6, key: 'E', label: 'Hold to fill the tank', sub: 'let go on the line', los: false, when: () => this.stage === 'pump' && !this.pumping, use: () => {} });
    this.chestT = this.addTarget({ id: 'chest', pos: new THREE.Vector3(CHEST.x, 0.95, CHEST.z), r: 0.55, reach: 2.4, label: 'Open the ice chest', sub: 'then mash [E] to bag it', when: () => this.stage === 'toIce', use: () => this._openChest() });
    this._task();
  }

  _task() {
    const st = this.stage;
    const pumpDone = st === 'toIce' || st === 'ice';
    const rows = [
      { text: 'Take the nozzle', icon: 'gauge', state: st === 'toPump' ? 'cur' : 'done' },
      { text: `Fill on the line${this.tries.length ? ` (${this.tries.length}/2)` : ''}`, icon: 'drop', state: st === 'pump' ? 'cur' : pumpDone ? 'done' : 'todo' },
      { text: `Bag the ice ${this.bagsDone}/${BAGS}`, icon: 'snow', state: pumpDone ? (this.bagsDone >= BAGS ? 'done' : 'cur') : 'todo' },
    ];
    const foot = st === 'pump' ? 'Aim at the filler, hold E, let go on the line.' : st === 'toIce' ? 'Ice chest by the shop door.' : st === 'ice' ? 'Mash E before it melts!' : 'Pump 4, by the RV.';
    this.hud.setTask({ cap: 'Pump & ice', n: `${(st === 'toPump' ? 0 : pumpDone ? 2 : 1) + (this.bagsDone >= BAGS ? 1 : 0)}/3`, store: this.def.name, rows, foot });
  }

  _takeNozzle() {
    this.stage = 'pump'; this.level = 0;
    this.holster.visible = false;
    this.hands.setPose('pump', 0.22);
    this.hands.hold(this.nozzle, 'r', { pos: [0, 0.01, 0.02] });
    this._task();
  }
  _openChest() {
    this.stage = 'ice'; this.melt = MELT; this.ring.visible = false;
    this.hands.setPose('grab', 0.2);
    this._task();
  }

  step(h) {
    if (this.stage === 'pump') {
      this.consumeAct();                       // E here is the pump trigger, not a target "use"
      this.walkStep(h, { speedMul: 0.6, canRun: false });
      const aiming = this.focus === this.fillerT || this.pumping;
      const holding = this.actHeld && aiming;
      if (holding && !this.pumping && this.level === 0) this.pumping = true;
      if (this.pumping) {
        if (holding) {
          this.level += (0.1 + 0.6 * this.level * this.level) * h;
          if (this.level >= 1) { this.level = 1; this._release(true); }
        } else this._release(false);
      }
      this.handAct = this.pumping ? 1 : 0;
      this.promptOverride = this.pumping ? { key: 'E', text: 'Let go on the line!', sub: `${Math.round(this.level * 100)}% · line at ${Math.round(LINE * 100)}%` } : null;
      this.goal = this.pumping ? null : FILLER;
      return;
    }
    if (this.stage === 'ice') {
      this.B.speed = 0;
      this.melt -= h;
      if (this.actPressed) {
        this.consumeAct();
        this.bagP++; this.hands.reach(this.bagP % 2 ? 'r' : 'l', 0.22);
        if (this.bagP >= BAG_PRESSES) { this.bags[this.bagsDone].visible = true; this.bagsDone++; this.bagP = 0; this.toast(`Bag ${this.bagsDone}!`, 'good'); this._task(); }
      }
      this.promptOverride = { key: 'E', text: 'Mash to bag the ice!', sub: `bag ${Math.min(this.bagsDone + 1, BAGS)} of ${BAGS}` };
      if (this.bagsDone >= BAGS || this.melt <= 0) { this.promptOverride = null; this.hud.gauge(null); this._finishOk(); }
      return;
    }
    this.handAct = 0;
    this.walkStep(h);
    if (this.stage === 'toPump') { this.goal = this.nozzleT.pos; this._ringAt(PUMP_STAND); }
    else if (this.stage === 'toIce') { this.goal = this.chestT.pos; this._ringAt(CHEST_STAND); }
  }
  _ringAt(p) { this.ring.visible = true; this.ring.position.set(p.x, 0, p.z); }

  _release(spill) {
    this.pumping = false;
    const acc = spill ? 0 : clamp(1 - Math.abs(this.level - LINE) / TOL, 0, 1);
    this.tries.push(acc);
    const txt = spill ? 'SPILL! Diesel everywhere…' : acc > 0.9 ? 'Bang on the line!' : acc > 0.6 ? 'Close!' : this.level < LINE ? 'Too early' : 'Over!';
    this.toast(txt, spill || acc < 0.6 ? 'bad' : 'good');
    this.hud.gaugeFlash(acc > 0.6);
    if (spill) this.shake = 0.4;
    if (this.tries.length >= 2 || acc >= 0.8) {
      this.pumpAcc = Math.max(...this.tries);
      this.stage = 'toIce';
      this.hands.hold(null, 'r'); this.holster.visible = true;
      this.hands.setPose('walk', 0.25);
      this.handAct = 0; this.promptOverride = null;
      this._gaugeHold = 0.7;
    } else this.level = 0;
    this._task();
  }

  _finishOk() {
    const tf = this.timeLeft / this.timeLimit;
    const bags = this.bagsDone / BAGS;
    const score = clamp(0.45 * (this.pumpAcc ?? 0) + 0.35 * bags + 0.3 * tf, 0.05, 1);
    this.finish(score, [`Pump: ${Math.round((this.pumpAcc ?? 0) * 100)}% on the line (${this.tries.length} ${this.tries.length > 1 ? 'tries' : 'try'})`, `Ice: ${this.bagsDone}/${BAGS} bags`, `${Math.round(this.t + this.penalty)}s on the forecourt`]);
  }
  timeUp() { return { score: clamp(0.25 * (this.pumpAcc ?? 0) + 0.1 * this.bagsDone / BAGS, 0, 0.35), lines: [] }; }
  progress() {
    if (this.stage === 'toPump') return { label: 'To pump 4', frac: 0.05 };
    if (this.stage === 'pump') return { label: `Pumping ${this.tries.length + 1}/2`, frac: 0.15 + 0.3 * this.level };
    if (this.stage === 'toIce') return { label: 'To the ice', frac: 0.5 };
    return { label: `Ice ${this.bagsDone}/${BAGS}`, frac: 0.6 + 0.4 * (this.bagsDone + this.bagP / BAG_PRESSES) / BAGS };
  }

  visual(dt) {
    if (this.ring.visible) this.ring.userData.set(0.55 + 0.45 * Math.sin(this.t * 5));
    if (this.stage === 'pump') this.hud.gauge({ cap: `Fuel · try <b>${Math.min(this.tries.length + 1, 2)}/2</b>`, hint: 'hold [E] · let go on the line', zone: [LINE - 0.05, LINE + 0.05], line: LINE, fill: this.level });
    else if (this.stage === 'ice') this.hud.gauge({ cap: `Bag the ice · <b>${this.bagsDone}/${BAGS}</b>`, hint: 'mash [E]', fill: (this.bagsDone + this.bagP / BAG_PRESSES) / BAGS });
    else if (this._gaugeHold > 0) this._gaugeHold -= dt;
    else this.hud.gauge(null);
    this.alertInfo = this.stage === 'ice' ? { icon: 'snow', text: 'Melting', sub: `${Math.max(0, this.melt).toFixed(1)}s`, frac: Math.max(0, this.melt) / MELT, tone: this.melt < 3 ? 'red' : 'amber' } : null;
  }

  bot(h) {
    if (this.stage === 'pump') {
      const a = this.botAim(FILLER);
      if (!this.pumping && this.level === 0) return { ...a, held: this.focus === this.fillerT };
      return { ...a, held: this.level < LINE - 0.012 };
    }
    if (this.stage === 'ice') { this._mash = (this._mash || 0) + h; const a = this.botAim(this.chestT.pos); if (this._mash > 0.11) { this._mash = 0; return { ...a, act: true }; } return a; }
    if (this.stage === 'toPump') return this.botUse(this.nozzleT, h, { stand: PUMP_STAND });
    return this.botUse(this.chestT, h, { stand: CHEST_STAND });
  }
  debugExtra() { return { stage: this.stage, level: +this.level.toFixed(2), tries: this.tries, bags: this.bagsDone }; }
}
