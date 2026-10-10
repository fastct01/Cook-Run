// ─────────────────────────────────────────────────────────────────────────────
// alarm — Last Chance Gas stockroom. Dark room, Rook's flashlight, a blinking red silent-alarm light
// with a visible countdown. Grab the solvent jugs from the back shelf before it runs out — then it
// trips anyway (story): strobes, shutter rattling down — run back out the door. Scored by time.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { createModel } from '../../assets/index.js';
import { ShopBase, clamp, wrap } from './ShopBase.js';
import { Kit, room, shelving, crate, glowSpot, textSign } from './build.js';
import { el } from '../hud.js';

const JUG = { x: -6.9, z: -5.45 };
const JUG_STAND = { x: -6.9, z: -4.55 };
const DOOR = { x: 0, z: 5.25 };
// shelf rows (AABBs) forming a little maze between the door and the back-left corner
const SHELVES = [
  [-6.6, -1.1, 2.3, 2.95], [1.1, 6.6, 2.3, 2.95],
  [-8.0, -3.3, -0.95, -0.3], [-1.3, 5.6, -0.95, -0.3],
  [-5.9, 8.0, -3.95, -3.3],
];

export class AlarmChallenge extends ShopBase {
  build() {
    const S = this.scene;
    S.background = new THREE.Color('#0d0f12');
    this.hemi = new THREE.HemisphereLight('#7a8cab', '#2a2622', 0.62); S.add(this.hemi);
    const moon = new THREE.DirectionalLight('#9fb4d8', 0.55); moon.position.set(-6, 14, 4); S.add(moon);
    this.bulb = new THREE.PointLight('#ffc070', 6, 9, 1.5); this.bulb.position.set(2.6, 3.1, 0.9); S.add(this.bulb);
    this.doorLight = new THREE.SpotLight('#cfe2ff', 26, 11, 0.6, 0.6, 1.2); this.doorLight.position.set(0, 2.6, 7.4); this.doorLight.target.position.set(0, 0, 3.4); S.add(this.doorLight, this.doorLight.target);
    this.redL = new THREE.PointLight('#ff2a1a', 0, 10, 1.4); this.redL.position.set(3.0, 2.8, -5.4); S.add(this.redL);
    // Rook's flashlight (casts the only shadows)
    const fl = this.flash = new THREE.SpotLight('#fff4d6', 34, 13, 0.52, 0.45, 1.3);
    fl.castShadow = true; fl.shadow.mapSize.set(512, 512); fl.shadow.bias = -0.002; fl.shadow.camera.near = 0.3; fl.shadow.camera.far = 14;
    S.add(fl, fl.target);

    const k = new Kit(1600);
    room(k, { x0: -8, x1: 8, z0: -6, z1: 6, h: 3.4, floor: '#4a4743', wall: '#6b6a62', low: '#4f554f', band: 1.0, skip: ['front'], tile: { size: 1, alt: '#43403c' } });
    k.rectZ('#6b6a62', 6, [-8, -1.2], [0, 3.4], -1, { off: 0 }); k.rectZ('#6b6a62', 6, [1.2, 8], [0, 3.4], -1, { off: 0 }); k.rectZ('#6b6a62', 6, [-1.2, 1.2], [2.6, 3.4], -1, { off: 0 });
    k.rectZ('#9fb3c8', 6.05, [-1.2, 1.2], [0, 2.6], -1, { off: 0 });                 // night outside the door
    // shelving rows full of boxes and cans
    const fillBoxes = (kk, y, i, w, d) => { for (let j = 0; j < Math.floor(w / 0.55); j++) { const c = ['#a8875e', '#c9b98e', '#8e5030', '#6f8fb0', '#b98552'][(i * 3 + j) % 5]; kk.box(c, [0.45, 0.28 + ((i + j) % 3) * 0.06, d * 0.8], [-w / 2 + 0.3 + j * 0.55, y, 0], { base: true }); } };
    for (const b of SHELVES) shelving(k, (b[0] + b[1]) / 2, (b[2] + b[3]) / 2, b[1] - b[0] - 0.1, b[3] - b[2] - 0.05, 2.2, 4, fillBoxes, '#5a5d60');
    // back-corner shelf with the solvent jugs (green labels)
    shelving(k, JUG.x + 0.2, JUG.z - 0.2, 1.9, 0.55, 2.2, 4, (kk, y, i, w, d) => { for (let j = 0; j < 3; j++) { kk.box('#d8e2df', [0.26, 0.38, 0.26], [-w / 2 + 0.4 + j * 0.55, y, 0], { base: true, c: 0.04 }); kk.rectZ('#6fd6a0', 0.135, [-w / 2 + 0.3 + j * 0.55, -w / 2 + 0.5 + j * 0.55], [y + 0.12, y + 0.24], 1, { off: 0.002 }); } }, '#5a5d60');
    // floor clutter: crates, mop bucket, flattened boxes
    for (const [x, z, r] of [[3.2, 4.4, 0.3], [-3.0, 0.9, 0.8], [6.6, 1.0, -0.4], [-2.2, -2.2, 0.2], [0.6, -5.2, 0.5]]) crate(k, [x, 0, z], r, [0.8, 0.55, 0.6], '#8a6a4a');
    k.cyl('#d9b13a', 0.25, 0.22, 0.4, [-1.9, 0, 4.4], { base: true, seg: 8, open: true });
    k.box('#b98552', [1.2, 0.03, 0.8], [3.4, 0, 0.9], { base: true, rot: [0, 0.4, 0] });
    // the alarm panel by the door
    k.box('#2a2a2b', [0.4, 0.5, 0.08], [-1.8, 1.3, 5.92], { base: true });
    const room_ = k.mesh('stockroom'); room_.receiveShadow = true; room_.castShadow = true; S.add(room_);
    const bk = new Kit(1601); bk.cyl('#5c1a17', 0.13, 0.15, 0.2, [0, 0, 0], { base: true, seg: 10 }); bk.box('#2a2a2b', [0.3, 0.06, 0.3], [0, -0.06, 0], { base: true });
    this.beaconMat = new THREE.MeshLambertMaterial({ color: '#5c1a17', emissive: '#ff2a1a', emissiveIntensity: 0.2 });
    const beacon = new THREE.Mesh(bk.geometry(), this.beaconMat); beacon.position.set(3.0, 2.8, -5.9); beacon.rotation.x = Math.PI / 2; S.add(beacon);
    const ledG = new THREE.SphereGeometry(0.035, 8, 6); this.ledMat = new THREE.MeshBasicMaterial({ color: '#ff3020' });
    const led = new THREE.Mesh(ledG, this.ledMat); led.position.set(-1.8, 1.6, 5.86); led.userData.ownGeo = true; S.add(led);
    // roll-down shutter over the door (drops when the alarm trips)
    const sk = new Kit(1602); sk.box('#7d8084', [2.5, 2.6, 0.06], [0, -1.3, 0], {}); for (let i = 0; i < 10; i++) sk.rectZ('#5f6468', -0.031, [-1.25, 1.25], [-2.6 + i * 0.26, -2.58 + i * 0.26], -1, { off: 0.001 });
    this.shutter = sk.mesh('shutter'); this.shutter.position.set(0, 2.6 + 2.6, 5.95); S.add(this.shutter);
    this.jugGlow = glowSpot('#6fd6a0', 0.55, 1.4); this.jugGlow.position.set(JUG.x, 0, JUG.z + 0.25); S.add(this.jugGlow);
    const jk = new Kit(1603); for (const x of [-0.12, 0.12]) { jk.box('#d8e2df', [0.2, 0.32, 0.2], [x, 0, 0], { base: true, c: 0.04 }); jk.rectZ('#6fd6a0', 0.105, [x - 0.07, x + 0.07], [0.1, 0.2], 1, { off: 0.002 }); }
    this.jugs = jk.mesh('jugs'); this.jugs.visible = false; S.add(this.jugs);
    const exit = textSign('exitsign', 'EXIT', 0.6, 0.22, { bg: '#1f6a3a', fg: '#e8ffe8', px: 90 });
    exit.material = exit.material.clone(); exit.material.emissive = new THREE.Color('#2a8a4a'); exit.material.emissiveIntensity = 0.8;
    exit.position.set(0, 2.85, 5.95); exit.rotation.y = Math.PI; S.add(exit);

    const W = this.world;
    W.bounds = { x0: -8, x1: 8, z0: -6, z1: 6 };
    for (const b of SHELVES) W.box(b[0], b[1], b[2], b[3], 'shelf');
    W.box(JUG.x - 0.8, JUG.x + 1.2, JUG.z - 0.55, JUG.z + 0.12, 'shelf');
    for (const [x, z] of [[3.2, 4.4], [-3.0, 0.9], [6.6, 1.0], [-2.2, -2.2], [0.6, -5.2]]) W.circle(x, z, 0.48, 'crate');
    W.circle(-1.9, 4.4, 0.28, 'bucket');
    W.box(-8, -1.2, 5.8, 6, 'wall'); W.box(1.2, 8, 5.8, 6, 'wall');

    Object.assign(this.rook, { x: 0, z: 5.2, yaw: Math.PI });
    this.cam = { ...this.cam, yaw: Math.PI, dist: 5.4, h: 8.2, look: 0.6, fov: 54, lag: 4.5 };
    this.alarmMax = clamp(Math.round(this.timeLimit * 0.4), 10, 20);
    this.alarmT = this.alarmMax; this.tripped = false; this.stage = 'sneak'; this.grabAt = null; this.knocks = 0;
    this.meter = el('div', 'ofs-meter', this.hud.root);
    this.meter.innerHTML = `<div class="ofs-gauge-cap"><span>SILENT ALARM</span><span class="t"><b>${this.alarmT.toFixed(1)}</b>s</span></div><div class="ofs-gauge"><div class="fill"></div></div>`;
    this.meter.style.bottom = 'auto'; this.meter.style.top = '96px';
    this.mFill = this.meter.querySelector('.fill'); this.mT = this.meter.querySelector('.t b');
    this.mFill.style.background = 'linear-gradient(90deg,#d8433a,#ff8a5a)';
  }

  step(h) {
    const R = this.rook;
    const hit = this.walkRook(h, { speedMul: this.stage === 'run' ? 1.05 : 1 });
    if (hit === 'crate' && R.speed > 3) { this.knocks++; }
    if (!this.tripped) {
      this.alarmT -= h;
      if (this.alarmT <= 0) { this._trip(false); }
    }
    if (this.stage === 'sneak') {
      const at = this.near(JUG_STAND, 1.15);
      this.prompt = { text: at ? 'Grab the solvent [E]' : 'Find the solvent on the back shelf', near: at, sub: 'the red light is a silent alarm — be quick' };
      if (at && this.actPressed) {
        this.grabAt = this.t; this.stage = 'run'; R.act = 0.4; R.carry = 'box';
        this.jugGlow.visible = false; this.jugs.visible = true;
        this.alarmLeft = Math.max(0, this.alarmT);
        this.popRook('Got it!', 'good');
        if (!this.tripped) this._trip(true);
      }
    } else if (this.stage === 'run') {
      this.prompt = { text: 'RUN! Out the door!', near: true };
      if (R.z > DOOR.z - 0.25 && Math.abs(R.x - DOOR.x) < 1.2) this._finishOk();
    }
  }
  _trip(afterGrab) {
    this.tripped = true; this.tripT = this.t;
    this.hud.pop(afterGrab ? 'ALARM! RUN!' : 'TOO SLOW — ALARM!', 'big');
    this.shake = 0.8; this.flashAlert(1200);
    this.meter.querySelector('.ofs-gauge-cap span').textContent = 'ALARM TRIPPED';
  }

  _finishOk() {
    const esc = this.t - (this.grabAt ?? this.t);
    const a = (this.alarmLeft ?? 0) / this.alarmMax;
    const e = clamp(1 - (esc - 2.5) / 6, 0, 1);
    const score = clamp(0.3 + 0.4 * a + 0.3 * e, 0.05, 1);
    this.finish(score, [`Solvent grabbed with ${(this.alarmLeft ?? 0).toFixed(1)}s on the silent alarm`, `Out the door in ${esc.toFixed(1)}s`, 'Sirens incoming — go go go!'], 'ESCAPED!');
  }
  timeUp() { return { score: this.stage === 'run' ? 0.2 : 0.03, lines: [this.stage === 'run' ? 'Stuck inside with the solvent' : 'Never found the solvent'] }; }

  visual(dt) {
    const R = this.rook, t = this.t;
    this.cam.x = R.x; this.cam.z = R.z - 0.8;
    // flashlight from Rook's chest along his facing
    const fx = Math.sin(R.yaw), fz = Math.cos(R.yaw);
    this.flash.position.set(R.x + fx * 0.25, 1.35, R.z + fz * 0.25);
    this.flash.target.position.set(R.x + fx * 4, 0.1, R.z + fz * 4);
    // silent alarm blink → strobing once tripped
    const blink = this.tripped ? (Math.sin(t * 18) > 0 ? 1 : 0.1) : Math.max(0, Math.sin(t * Math.PI * (1.2 + 3 * (1 - this.alarmT / this.alarmMax)))) ** 6;
    this.beaconMat.emissiveIntensity = 0.2 + blink * 3.2;
    this.redL.intensity = blink * (this.tripped ? 16 : 5);
    this.ledMat.color.setStyle(blink > 0.5 ? '#ff3020' : '#3a0a08');
    this.bulb.intensity = this.tripped ? 3.2 * (Math.sin(t * 31) > -0.6 ? 1 : 0.15) : 3.2;
    if (this.tripped) { const k = clamp((t - this.tripT) / 5, 0, 1); this.shutter.position.y = 5.2 - 2.6 * 0.55 * k; }
    const left = Math.max(0, this.alarmT);
    this.mFill.style.width = `${(left / this.alarmMax) * 100}%`;
    this.mT.textContent = left.toFixed(1);
    // the jugs only really show up in the torch beam / up close: you have to look for them
    if (this.jugGlow.visible) { const d = Math.hypot(R.x - JUG.x, R.z - JUG.z); const lit = d < 4.5 ? 1 : d < 8 ? 0.45 : 0.18; this.jugGlow.userData.set(lit * (0.6 + 0.4 * Math.sin(t * 4))); }
    if (this.stage === 'run') { this.jugs.position.set(R.x + fx * 0.42, 0.8, R.z + fz * 0.42); this.jugs.rotation.y = R.yaw; }
  }

  bot(h) {
    const R = this.rook;
    const goal = this.stage === 'sneak' ? JUG_STAND : { x: DOOR.x, z: DOOR.z + 0.5 };
    if (this.stage === 'sneak' && this.near(JUG_STAND, 1.0)) return { act: true };
    if (!this._bp || this._bp.goal !== goal.z) this._bp = { goal: goal.z, path: this.world.path(R.x, R.z, goal.x, goal.z, 0.34) };
    const P = this._bp.path; while (P.length > 1 && Math.hypot(P[0].x - R.x, P[0].z - R.z) < 0.45) P.shift();
    const w = P[0] || goal, dx = w.x - R.x, dz = w.z - R.z, l = Math.hypot(dx, dz) || 1;
    return { move: { x: dx / l, z: dz / l }, run: true };
  }
  debugExtra() { return { stage: this.stage, alarmT: +this.alarmT.toFixed(2), tripped: this.tripped }; }
  dispose() { this.beaconMat.dispose(); this.ledMat.dispose(); }
}
