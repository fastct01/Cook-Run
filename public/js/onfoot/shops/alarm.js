// ─────────────────────────────────────────────────────────────────────────────
// alarm — Round 3 first person (agent SHOPS). Last Chance Gas stockroom: dark, Doc's flashlight in his right
// hand is the only real light (it casts the shadows), a blinking red silent-alarm beacon and a countdown.
// Find the solvent on the back shelf by flashlight (look + E) before the silent alarm trips — it trips anyway
// once you grab it (strobes, the shutter rattles down): run back out of the door.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { FpShop, clamp } from './fpBase.js';
import { Kit, room, shelving, crate, glowSpot, textSign } from './build.js';

const JUG = { x: -6.9, z: -5.45 };
const JUG_STAND = { x: -6.6, z: -4.35 };
const DOOR = { x: 0, z: 5.25 };
const SHELVES = [
  [-6.6, -1.1, 2.3, 2.95], [1.1, 6.6, 2.3, 2.95],
  [-8.0, -3.3, -0.95, -0.3], [-1.3, 5.6, -0.95, -0.3],
  [-5.9, 8.0, -3.95, -3.3],
];

export class AlarmChallenge extends FpShop {
  controls() { return [['Mouse', 'aim the torch'], ['W A S D', 'walk'], ['Shift', 'run'], ['E', 'grab']]; }

  build() {
    const S = this.scene;
    S.background = new THREE.Color('#0d0f12');
    this.hemi = new THREE.HemisphereLight('#7a8cab', '#2a2622', 0.5); S.add(this.hemi);
    const moon = new THREE.DirectionalLight('#9fb4d8', 0.45); moon.position.set(-6, 14, 4); S.add(moon);
    this.bulb = new THREE.PointLight('#ffc070', 5, 8, 1.5); this.bulb.position.set(2.6, 3.1, 0.9); S.add(this.bulb);
    this.doorLight = new THREE.SpotLight('#cfe2ff', 26, 11, 0.6, 0.6, 1.2); this.doorLight.position.set(0, 2.6, 7.4); this.doorLight.target.position.set(0, 0, 3.4); S.add(this.doorLight, this.doorLight.target);
    this.redL = new THREE.PointLight('#ff2a1a', 0, 10, 1.4); this.redL.position.set(3.0, 2.8, -5.4); S.add(this.redL);

    const k = new Kit(1600);
    room(k, { x0: -8, x1: 8, z0: -6, z1: 6, h: 3.4, floor: '#4a4743', wall: '#6b6a62', low: '#4f554f', band: 1.0, skip: ['front'], tile: { size: 1, alt: '#43403c' }, ceiling: '#2a2b2c' });
    k.rectZ('#6b6a62', 6, [-8, -1.2], [0, 3.4], -1, { off: 0 }); k.rectZ('#6b6a62', 6, [1.2, 8], [0, 3.4], -1, { off: 0 }); k.rectZ('#6b6a62', 6, [-1.2, 1.2], [2.6, 3.4], -1, { off: 0 });
    k.rectZ('#9fb3c8', 6.05, [-1.2, 1.2], [0, 2.6], -1, { off: 0 });
    const fillBoxes = (kk, y, i, w, d) => { for (let j = 0; j < Math.floor(w / 0.55); j++) { const c = ['#a8875e', '#c9b98e', '#8e5030', '#6f8fb0', '#b98552'][(i * 3 + j) % 5]; kk.box(c, [0.45, 0.28 + ((i + j) % 3) * 0.06, d * 0.8], [-w / 2 + 0.3 + j * 0.55, y, 0], { base: true }); } };
    for (const b of SHELVES) shelving(k, (b[0] + b[1]) / 2, (b[2] + b[3]) / 2, b[1] - b[0] - 0.1, b[3] - b[2] - 0.05, 2.2, 4, fillBoxes, '#5a5d60');
    // the back-corner shelf with the solvent jugs (pale with green labels)
    shelving(k, JUG.x + 0.2, JUG.z - 0.2, 1.9, 0.55, 2.2, 4, (kk, y, i, w) => { for (let j = 0; j < 3; j++) { kk.box('#d8e2df', [0.26, 0.38, 0.26], [-w / 2 + 0.4 + j * 0.55, y, 0], { base: true, c: 0.04 }); kk.rectZ('#6fd6a0', 0.135, [-w / 2 + 0.3 + j * 0.55, -w / 2 + 0.5 + j * 0.55], [y + 0.12, y + 0.24], 1, { off: 0.002 }); } }, '#5a5d60');
    for (const [x, z, r] of [[3.2, 4.4, 0.3], [-3.0, 0.9, 0.8], [6.6, 1.0, -0.4], [-2.2, -2.2, 0.2], [0.6, -5.2, 0.5]]) crate(k, [x, 0, z], r, [0.8, 0.55, 0.6], '#8a6a4a');
    k.cyl('#d9b13a', 0.25, 0.22, 0.4, [-1.9, 0, 4.4], { base: true, seg: 8, open: true });
    k.box('#b98552', [1.2, 0.03, 0.8], [3.4, 0, 0.9], { base: true, rot: [0, 0.4, 0] });
    k.box('#2a2a2b', [0.4, 0.5, 0.08], [-1.8, 1.3, 5.92], { base: true });
    const room_ = k.mesh('stockroom'); room_.receiveShadow = true; room_.castShadow = true; S.add(room_);
    const bk = new Kit(1601); bk.cyl('#5c1a17', 0.13, 0.15, 0.2, [0, 0, 0], { base: true, seg: 10 }); bk.box('#2a2a2b', [0.3, 0.06, 0.3], [0, -0.06, 0], { base: true });
    this.beaconMat = new THREE.MeshLambertMaterial({ color: '#5c1a17', emissive: '#ff2a1a', emissiveIntensity: 0.2 });
    const beacon = new THREE.Mesh(bk.geometry(), this.beaconMat); beacon.position.set(3.0, 2.8, -5.9); beacon.rotation.x = Math.PI / 2; beacon.userData.ownGeo = true; S.add(beacon);
    const ledG = new THREE.SphereGeometry(0.035, 8, 6); this.ledMat = new THREE.MeshBasicMaterial({ color: '#ff3020' });
    const led = new THREE.Mesh(ledG, this.ledMat); led.position.set(-1.8, 1.6, 5.86); led.userData.ownGeo = true; S.add(led);
    const sk = new Kit(1602); sk.box('#7d8084', [2.5, 2.6, 0.06], [0, -1.3, 0], {}); for (let i = 0; i < 10; i++) sk.rectZ('#5f6468', -0.031, [-1.25, 1.25], [-2.6 + i * 0.26, -2.58 + i * 0.26], -1, { off: 0.001 });
    this.shutter = sk.mesh('shutter'); this.shutter.position.set(0, 5.2, 5.95); S.add(this.shutter);
    this.jugGlow = glowSpot('#6fd6a0', 0.5, 1.2); this.jugGlow.position.set(JUG.x, 0, JUG.z + 0.3); S.add(this.jugGlow);
    const jk = new Kit(1603); for (const x of [-0.12, 0.12]) { jk.box('#d8e2df', [0.2, 0.3, 0.2], [x, -0.15, 0], { base: true, c: 0.04 }); jk.rectZ('#6fd6a0', 0.105, [x - 0.07, x + 0.07], [-0.05, 0.05], 1, { off: 0.002 }); }
    this.jugs = jk.mesh('jugs'); this.jugs.castShadow = false;
    const exit = textSign('exitsign', 'EXIT', 0.6, 0.22, { bg: '#1f6a3a', fg: '#e8ffe8', px: 90 });
    exit.material = exit.material.clone(); exit.material.emissive = new THREE.Color('#2a8a4a'); exit.material.emissiveIntensity = 0.8;
    exit.position.set(0, 2.85, 5.95); exit.rotation.y = Math.PI; S.add(exit);

    // Doc's flashlight: a torch in the right hand, its spot light rides on the camera (beam along the view)
    const tk = new Kit(1604);
    tk.cyl('#2b2c2e', 0.021, 0.021, 0.17, [0, 0, 0.0], { axis: 'z', seg: 8 });
    tk.cyl('#3a3b3d', 0.032, 0.023, 0.06, [0, 0, -0.11], { axis: 'z', seg: 8 });
    tk.box('#d9b13a', [0.012, 0.02, 0.03], [0, 0.022, 0.02], {});
    const torch = tk.mesh('torch'); torch.castShadow = false;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.028, 12), new THREE.MeshBasicMaterial({ color: '#fff6d8' }));
    lens.position.set(0, 0, -0.142); lens.rotation.y = Math.PI; lens.userData.ownGeo = true; torch.add(lens);
    this.torch = torch;
    this.hands.setPose('torch', 0.01);
    this.hands.hold(torch, 'r', { pos: [0, 0.0, 0.0] });
    const fl = this.flash = new THREE.SpotLight('#fff4d6', 30, 14, 0.5, 0.5, 1.3);
    fl.castShadow = true; fl.shadow.mapSize.set(512, 512); fl.shadow.bias = -0.002; fl.shadow.camera.near = 0.2; fl.shadow.camera.far = 15;
    fl.position.set(0.1, -0.12, -0.56);                // ahead of the torch hand, so it does not light Doc's own glove
    fl.target.position.set(0.02, -0.12, -6);
    this.camera.add(fl, fl.target);

    const W = this.world;
    W.bounds = { x0: -8, x1: 8, z0: -6, z1: 6 };
    for (const b of SHELVES) W.box(b[0], b[1], b[2], b[3], 'shelf');
    W.box(JUG.x - 0.8, JUG.x + 1.2, JUG.z - 0.55, JUG.z + 0.12, 'shelf');
    for (const [x, z] of [[3.2, 4.4], [-3.0, 0.9], [6.6, 1.0], [-2.2, -2.2], [0.6, -5.2]]) W.circle(x, z, 0.48, 'crate');
    W.circle(-1.9, 4.4, 0.28, 'bucket');
    W.box(-8, -1.2, 5.8, 6, 'wall'); W.box(1.2, 8, 5.8, 6, 'wall');

    Object.assign(this.P, { x: 0, z: 5.0, yaw: Math.PI, pitch: -0.12 });
    this.alarmMax = clamp(Math.round(this.timeLimit * 0.45), 8, 20);
    this.alarmT = this.alarmMax; this.tripped = false; this.stage = 'sneak'; this.grabAt = null; this.knocks = 0;
    this.jugT = this.addTarget({ id: 'solvent', pos: new THREE.Vector3(JUG.x, 0.98, JUG.z - 0.1), r: 0.5, reach: 2.4, label: 'Grab the solvent', sub: 'green label, back shelf', when: () => this.stage === 'sneak', use: () => this._grab() });
    this._task();
  }

  _task() {
    const rows = [
      { text: 'Find the solvent', icon: 'jug', state: this.stage === 'sneak' ? 'cur' : 'done' },
      { text: 'Out the door', icon: 'door', state: this.stage === 'run' ? 'cur' : this.stage === 'out' ? 'done' : 'todo' },
    ];
    this.hud.setTask({ cap: 'Stockroom', n: `${this.stage === 'sneak' ? 0 : 1}/2`, store: this.def.name, rows, foot: this.stage === 'sneak' ? 'Use the torch — green labels, back left shelf.' : 'RUN! The shutter is coming down.' });
  }

  _grab() {
    this.grabAt = this.t; this.stage = 'run';
    this.jugGlow.visible = false;
    this.hands.hold(this.jugs, 'l', { pos: [0, -0.02, 0], rot: [0, 0, 0] });
    this.alarmLeft = Math.max(0, this.alarmT);
    this.toast('Got it!', 'good');
    if (!this.tripped) this._trip(true);
    this._task();
  }
  _trip(afterGrab) {
    this.tripped = true; this.tripT = this.t;
    this.toast(afterGrab ? 'ALARM! RUN!' : 'Too slow — ALARM!', 'bad');
    this.shake = 0.8; this.hud.flash('red');
  }

  step(h) {
    const hit = this.walkStep(h, { speedMul: this.stage === 'run' ? 1.05 : 1 });
    if (hit === 'crate' && this.B.speed > 3) this.knocks++;
    if (!this.tripped) { this.alarmT -= h; if (this.alarmT <= 0) this._trip(false); }
    if (this.stage === 'sneak') this.goal = this.jugT.pos;
    else if (this.stage === 'run') {
      this.goal = new THREE.Vector3(DOOR.x, 1.4, DOOR.z + 0.6);
      if (this.P.z > DOOR.z - 0.3 && Math.abs(this.P.x - DOOR.x) < 1.1) { this.stage = 'out'; this._finishOk(); }
    }
  }

  _finishOk() {
    const esc = this.t - (this.grabAt ?? this.t);
    const a = (this.alarmLeft ?? 0) / this.alarmMax;
    const e = clamp(1 - (esc - 2.5) / 6, 0, 1);
    const score = clamp(0.3 + 0.4 * a + 0.3 * e, 0.05, 1);
    this.finish(score, [`Solvent grabbed with ${(this.alarmLeft ?? 0).toFixed(1)}s on the silent alarm`, `Out the door in ${esc.toFixed(1)}s`, 'Sirens incoming — go go go!'], 'ESCAPED!');
  }
  timeUp() { return { score: this.stage === 'run' ? 0.2 : 0.03, lines: [this.stage === 'run' ? 'Stuck inside with the solvent' : 'Never found the solvent'] }; }
  progress() { return this.stage === 'sneak' ? { label: `Alarm ${Math.max(0, this.alarmT).toFixed(0)}s`, frac: 0.1 } : { label: 'Running out', frac: 0.7 }; }

  visual(dt) {
    const t = this.t;
    const blink = this.tripped ? (Math.sin(t * 18) > 0 ? 1 : 0.1) : Math.max(0, Math.sin(t * Math.PI * (1.2 + 3 * (1 - this.alarmT / this.alarmMax)))) ** 6;
    this.beaconMat.emissiveIntensity = 0.2 + blink * 3.2;
    this.redL.intensity = blink * (this.tripped ? 16 : 5);
    this.ledMat.color.setStyle(blink > 0.5 ? '#ff3020' : '#3a0a08');
    this.bulb.intensity = this.tripped ? 3.2 * (Math.sin(t * 31) > -0.6 ? 1 : 0.15) : 3.2;
    this.flash.intensity = 30 * (this.tripped && Math.sin(t * 23) > 0.92 ? 0.6 : 1);
    if (this.tripped) { const k = clamp((t - this.tripT) / 6, 0, 1); this.shutter.position.y = 5.2 - 2.6 * 0.6 * k; }
    if (this.jugGlow.visible) { const d = Math.hypot(this.P.x - JUG.x, this.P.z - JUG.z); const lit = d < 4.5 ? 1 : d < 8 ? 0.45 : 0.18; this.jugGlow.userData.set(lit * (0.6 + 0.4 * Math.sin(t * 4))); }
    const left = Math.max(0, this.alarmT);
    this.alertInfo = this.tripped
      ? { icon: 'alarm', text: 'Alarm tripped', sub: 'run!', frac: null, tone: 'red' }
      : { icon: 'alarm', text: 'Silent alarm', sub: `${left.toFixed(1)}s`, frac: left / this.alarmMax, tone: left < 4 ? 'red' : 'amber' };
    this.vigK = this.tripped ? 0.35 + 0.25 * Math.max(0, Math.sin(t * 18)) : 0;
    this.threatSide = 0;
  }

  bot(h) {
    if (this.stage === 'sneak') return this.botUse(this.jugT, h, { stand: JUG_STAND });
    const n = this.botNav({ x: DOOR.x, z: DOOR.z + 0.6 }, h, { arrive: 0.1 });
    return n.arrived ? { keys: ['KeyW'] } : n;
  }
  debugExtra() { return { stage: this.stage, alarmT: +this.alarmT.toFixed(2), tripped: this.tripped }; }
  dispose() { this.beaconMat.dispose(); this.ledMat.dispose(); }
}
