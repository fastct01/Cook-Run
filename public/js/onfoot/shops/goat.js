// ─────────────────────────────────────────────────────────────────────────────
// goat — Round 3 first person (agent SHOPS). Prickly Pete's barn: the `goat` ate the syrup label and won't hold
// still (open-space flee, sideways dodges when you charge, it tires). Corner it, look at it + E to grab it — it
// trots off to the farmer — then carry the two feed sacks out to the door (a sack in your arms).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { createModel } from '../../assets/index.js';
import { FpShop, clamp } from './fpBase.js';
import { Kit, room, sack, glowSpot } from './build.js';
import { Avatar } from '../avatar.js';
import { walk } from './world2d.js';

const PILE = { x: 4.6, z: 3.7 };
const DROP = { x: 0, z: 5.6 };
const SACKS = 2;
const BLEATS = ['"MEEEH!"', '"Mehh?"', '"BAAH!"', '"Meh-heh-heh"'];

export class GoatChallenge extends FpShop {
  controls() { return [['Mouse', 'look'], ['W A S D', 'walk'], ['Shift', 'run'], ['E', 'grab']]; }

  build() {
    const S = this.scene;
    S.background = new THREE.Color('#a9c2cc');
    S.add(new THREE.HemisphereLight('#f3e6c8', '#6a5238', 1.25));
    const sun = new THREE.DirectionalLight('#ffe0a8', 1.5);
    sun.position.set(6, 16, 10); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 9, bottom: -9, near: 1, far: 50 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    S.add(sun);
    const doorLight = new THREE.PointLight('#ffe7b8', 10, 9, 1.3); doorLight.position.set(0, 2.4, 5.6); S.add(doorLight);
    for (const x of [-4.5, 4.5]) { const L = new THREE.PointLight('#ffd9a0', 6, 9, 1.4); L.position.set(x, 3.6, -1); S.add(L); }

    // barn: plank walls, straw floor, posts, rafters + roof, stalls, open door with daylight
    const k = new Kit(1400);
    room(k, { x0: -9, x1: 9, z0: -6.5, z1: 6.5, h: 4.4, floor: '#b89b62', wall: '#8a5a3c', low: '#6e4630', band: 0.9, skip: ['front'], ceiling: '#5e3d29' });
    for (let x = -8.8; x < 9; x += 0.45) k.rectZ(x % 0.9 < 0.45 ? '#7a4f35' : '#93623f', -6.5, [x, x + 0.03], [0.9, 4.4], 1, { off: 0.003 });
    for (let z = -6.3; z < 6.5; z += 0.45) { k.rectX('#7a4f35', -9, [z, z + 0.03], [0.9, 4.4], 1, { off: 0.003 }); k.rectX('#7a4f35', 9, [z, z + 0.03], [0.9, 4.4], -1, { off: 0.003 }); }
    k.rectZ('#8a5a3c', 6.5, [-9, -1.8], [0, 4.4], -1, { off: 0 }); k.rectZ('#8a5a3c', 6.5, [1.8, 9], [0, 4.4], -1, { off: 0 });
    k.rectZ('#8a5a3c', 6.5, [-1.8, 1.8], [3.2, 4.4], -1, { off: 0 });
    k.rectZ('#f7e9c2', 6.55, [-1.8, 1.8], [0, 3.2], -1, { off: 0 });
    for (let i = 0; i < 40; i++) { const r = Math.sin(i * 12.9898) * 43758.5453; const fx = r - Math.floor(r), fz = (r * 7.3) - Math.floor(r * 7.3); k.blob(i % 2 ? '#c9ad6e' : '#a88b55', 0.35 + fx * 0.5, [-8 + fx * 16, 0.004, -5.8 + fz * 11.6], { seg: 7, seed: 1401 + i, off: 0 }); }
    for (const x of [-4.5, 0, 4.5]) for (const z of [-3, 1.5]) k.box('#6e4630', [0.22, 4.3, 0.22], [x, 0, z], { base: true });
    for (const z of [-3, 1.5]) k.box('#6e4630', [18, 0.22, 0.22], [0, 3.6, z], { base: true });
    for (const [x0, x1] of [[-9, -5.4], [-3.6, -1.8]]) { k.box('#93623f', [x1 - x0, 0.1, 0.08], [(x0 + x1) / 2, 0.55, -3.9], { base: true }); k.box('#93623f', [x1 - x0, 0.1, 0.08], [(x0 + x1) / 2, 0.95, -3.9], { base: true }); }
    for (const x of [-5.4, -3.6, -1.8]) k.box('#6e4630', [0.12, 1.1, 0.12], [x, 0, -3.9], { base: true });
    k.box('#5f6468', [1.8, 0.45, 0.55], [7.4, 0, -1.6], { base: true, c: 0.05 });
    k.box('#4f8f8a', [1.65, 0.05, 0.42], [7.4, 0.38, -1.6], { base: true });
    k.cyl('#9aa0a6', 0.18, 0.15, 0.35, [-7.6, 0, 4.6], { base: true, seg: 8, open: true });
    for (let i = 0; i < 4; i++) sack(k, [PILE.x - 0.4 + (i % 2) * 0.66, 0.0, PILE.z + 0.45 + Math.floor(i / 2) * 0.1], (i - 2) * 0.1, '#d6c08a');
    // a pallet by the door for the loaded sacks
    k.box('#8a6a4a', [1.6, 0.12, 0.9], [DROP.x, 0, DROP.z + 0.35], { base: true });
    const barn = k.mesh('barn'); barn.castShadow = false; S.add(barn);
    const ok = new Kit(1405);
    ok.box('#9c8c5c', [60, 0.1, 50], [0, -0.07, 0]);
    ok.box('#b39a62', [5, 0.02, 10], [0, -0.01, 11]);
    for (let x = -12; x <= 12; x += 2.4) ok.box('#93623f', [0.12, 1.1, 0.12], [x, 0, 13], { base: true });
    ok.box('#93623f', [24.2, 0.1, 0.06], [0, 0.9, 13], { base: true });
    S.add(ok.mesh('farmyard'));
    this.bales = [[-5.6, -0.6, 0.2], [-2.0, 3.6, 1.3], [3.4, -1.5, 0.9], [-6.6, 3.3, 1.6], [0.6, -4.8, 0.5]].map(([x, z, r]) => {
      const m = createModel('hay'); m.position.set(x, 0, z); m.rotation.y = r; m.scale.setScalar(0.8); S.add(m); return { x, z };
    });
    // the sacks to carry (on top of the pile)
    this.sacks = [0, 1].map((i) => { const sk = new Kit(1420 + i); sack(sk, [0, 0, 0], 0, '#cdb67c'); const m = sk.mesh('sack' + i); m.position.set(PILE.x - 0.3 + i * 0.6, 0.29, PILE.z + 0.5); S.add(m); return { m, state: 'pile' }; });
    this.farmer = new Avatar(createModel('farmer', 0), { name: 'farmer' }); this.farmer.set({ x: -2.6, z: 5.6, yaw: Math.PI * 0.85 }); S.add(this.farmer.root);
    this.goatObj = createModel('goat'); S.add(this.goatObj);
    const gj = (n) => this.goatObj.getObjectByName(n) || new THREE.Object3D();
    this.gj = { head: gj('head'), tail: gj('tail'), fl: gj('leg_fl'), fr: gj('leg_fr'), rl: gj('leg_rl'), rr: gj('leg_rr') };
    this.G = { x: 2.6, z: -3.4, yaw: 2.2, vx: 0, vz: 0, speed: 0, stamina: 1, dodgeCd: 0, dodgeT: 0, dx: 0, dz: 0, phase: 0, wanderT: 0, caught: false, bleatCd: 2 };

    const W = this.world;
    W.bounds = { x0: -9, x1: 9, z0: -6.5, z1: 6.5 };
    for (const b of this.bales) W.circle(b.x, b.z, 0.72, 'bale');
    for (const x of [-4.5, 0, 4.5]) for (const z of [-3, 1.5]) W.circle(x, z, 0.16, 'post');
    W.box(-9, -5.4, -4.0, -3.8, 'rail'); W.box(-3.6, -1.8, -4.0, -3.8, 'rail');
    W.box(6.45, 8.35, -1.9, -1.3, 'trough'); W.circle(-7.6, 4.6, 0.22, 'bucket');
    this.pileC = W.box(PILE.x - 0.85, PILE.x + 0.85, PILE.z + 0.15, PILE.z + 0.9, 'sacks');
    W.box(-9, -1.8, 6.3, 6.5, 'wall'); W.box(1.8, 9, 6.3, 6.5, 'wall');
    W.box(DROP.x - 0.8, DROP.x + 0.8, DROP.z - 0.1, DROP.z + 0.8, 'pallet');
    this.farmerC = W.circle(-2.6, 5.6, 0.3, 'farmer');

    Object.assign(this.P, { x: 0, z: 4.4, yaw: Math.PI, pitch: -0.18 });
    this.stage = 'chase'; this.lunges = 0; this.delivered = 0; this.carrying = null;
    this.ring = glowSpot('#F2B90F', 0.5, 0.8); this.ring.visible = false; S.add(this.ring);
    this.walkSpeed = 3.2; this.runSpeed = 5.0;
    this.hands.setPose('walk', 0.01);

    this.goatT = this.addTarget({ id: 'goat', pos: () => new THREE.Vector3(this.G.x, 0.62, this.G.z), r: 0.45, reach: 1.25, label: 'Grab the goat!', sub: 'hold on tight', los: false, when: () => this.stage === 'chase' && this.G.dodgeT <= 0, use: () => this._catch() });
    this.pileT = this.addTarget({ id: 'sacks', pos: () => { const s = this.sacks.find((x) => x.state === 'pile'); return s ? s.m.position.clone().setY(0.45) : null; }, r: 0.5, reach: 2.4, label: 'Pick up a feed sack', sub: 'heavy — no running', when: () => this.stage === 'carry' && !this.carrying, use: () => this._lift() });
    this.dropT = this.addTarget({ id: 'drop', pos: new THREE.Vector3(DROP.x, 0.4, DROP.z + 0.35), r: 0.9, reach: 2.6, label: 'Load it on the pallet', sub: 'the RV is right outside', los: false, when: () => this.stage === 'carry' && !!this.carrying, use: () => this._drop() });
    this._task();
  }

  _task() {
    const rows = [
      { text: 'Catch the goat', icon: 'goat', state: this.stage === 'chase' ? 'cur' : 'done' },
      ...Array.from({ length: SACKS }, (_, i) => ({ text: `Feed sack ${i + 1}`, icon: 'sack', state: this.delivered > i ? 'done' : this.stage === 'carry' && this.delivered === i ? 'cur' : 'todo' })),
    ];
    const foot = this.stage === 'chase' ? (this.G.stamina < 0.45 ? 'It\'s getting tired — corner it!' : 'It dodges when you charge — use the bales.') : 'Out the barn door to the pallet.';
    this.hud.setTask({ cap: 'Farm run', n: `${(this.stage === 'chase' ? 0 : 1) + this.delivered}/${SACKS + 1}`, store: this.def.name, rows, foot });
  }

  _catch() {
    this.stage = 'carry'; this.G.caught = true; this.G.speed = 0;
    this.toast('GOTCHA! Pete takes the goat', 'good');
    this.farmerCheer = 2;
    this._task();
  }
  _lift() {
    const s = this.sacks.find((x) => x.state === 'pile'); if (!s) return;
    s.state = 'held'; this.carrying = s;
    this.hands.setPose('carry', 0.22);
    this.hands.hold(s.m, 'both', { pos: [0, -0.24, -0.06], rot: [0.16, Math.PI / 2, 0] });
    s.m.scale.setScalar(0.85);
    this._task();
  }
  _drop() {
    const s = this.carrying; if (!s) return;
    this.hands.hold(null, 'both');
    s.m.scale.setScalar(1);
    s.m.position.set(DROP.x - 0.36 + this.delivered * 0.72, 0.12, DROP.z + 0.35); s.m.rotation.set(0, 0.2 * this.delivered, 0);
    this.scene.add(s.m);
    s.state = 'out'; this.carrying = null; this.delivered++;
    this.hands.setPose('walk', 0.25);
    this.toast(this.delivered >= SACKS ? 'All loaded!' : `${this.delivered}/${SACKS}`, 'good');
    this._task();
    if (this.delivered >= SACKS) this._finishOk();
  }

  // open-space seeking flee with dodges; tires over time
  _goat(h) {
    const G = this.G, P = this.P, B = this.B;
    G.dodgeCd = Math.max(0, G.dodgeCd - h); G.bleatCd -= h;
    const dx = G.x - P.x, dz = G.z - P.z, d = Math.hypot(dx, dz) || 1e-3;
    const closing = (B.vx * dx + B.vz * dz) / d;
    let mx = 0, mz = 0, max = 0;
    if (G.dodgeT > 0) { G.dodgeT -= h; mx = G.dx; mz = G.dz; max = 5.4; }
    else if (d < 1.5 && closing > 1.8 && G.dodgeCd <= 0 && G.stamina > 0.25) {
      const px = -dz / d, pz = dx / d;
      const room = (sx, sz) => { let s = 0; for (let t = 0.6; t <= 2.4; t += 0.6) if (!this.world.blockedAt(G.x + sx * t, G.z + sz * t, 0.32)) s += 1; return s; };
      const side = room(px, pz) >= room(-px, -pz) ? 1 : -1;
      G.dx = px * side * 0.85 + (dx / d) * 0.5; G.dz = pz * side * 0.85 + (dz / d) * 0.5;
      const l = Math.hypot(G.dx, G.dz); G.dx /= l; G.dz /= l;
      G.dodgeT = 0.36; G.dodgeCd = 1.4 + (1 - G.stamina) * 1.4; G.stamina = Math.max(0, G.stamina - 0.14);
      this.lunges++;
      if (G.bleatCd <= 0) { G.bleatCd = 1.2; this.toast(BLEATS[this.lunges % BLEATS.length], 'info'); }
      mx = G.dx; mz = G.dz; max = 5.4;
    } else if (d < 5.0) {
      let best = -1e9;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, cx = Math.sin(a), cz = Math.cos(a);
        let free = 0;
        for (let t = 0.5; t <= 3.0; t += 0.5) { if (this.world.blockedAt(G.x + cx * t, G.z + cz * t, 0.34)) break; free = t; }
        const away = (cx * dx + cz * dz) / d;
        const s = away * 2.0 + free * 0.9 - (free < 1 ? 3 : 0);
        if (s > best) { best = s; mx = cx; mz = cz; }
      }
      max = 2.0 + 1.4 * G.stamina;
      G.stamina = Math.max(0, G.stamina - h * 0.06);
    } else {
      G.wanderT -= h;
      if (G.wanderT <= 0) { G.wanderT = 2.5; G.wa = Math.sin(this.t * 3.7) * Math.PI; }
      if (G.wanderT > 1.2) { mx = Math.sin(G.wa); mz = Math.cos(G.wa); max = 0.8; }
      G.stamina = Math.min(1, G.stamina + h * 0.03);
    }
    walk(G, mx, mz, max, h, this.world, 0.32, { accel: 22, turn: 10 });
    G.phase += G.speed * h * 6;
  }
  _goatTied(h) {
    const G = this.G, tx = -1.6, tz = 5.0;
    const dx = tx - G.x, dz = tz - G.z, l = Math.hypot(dx, dz);
    walk(G, l > 0.3 ? dx / l : 0, l > 0.3 ? dz / l : 0, 1.6, h, this.world, 0.32);
    G.phase += G.speed * h * 6;
  }

  step(h) {
    this.walkStep(h, { speedMul: this.carrying ? 0.78 : 1, canRun: !this.carrying });
    if (this.stage === 'chase') {
      this._goat(h);
      this.goal = this.goatT.pos();
      const d = Math.hypot(this.G.x - this.P.x, this.G.z - this.P.z);
      if (this.actPressed && !this.focus && d < 2.4) { this.consumeAct(); this.hands.reach('r', 0.35); this.toast('Missed!', 'bad'); }
      if (this.t % 1 < h) this._task();
    } else {
      this._goatTied(h);
      this.goal = this.carrying ? this.dropT.pos : this.pileT.pos();
    }
  }

  _finishOk() {
    const tf = this.timeLeft / this.timeLimit;
    const score = clamp(0.3 + 0.75 * tf, 0.05, 1);
    this.finish(score, [`Goat caught after ${this.lunges} dodge${this.lunges === 1 ? '' : 's'}`, `${SACKS} sacks loaded in ${Math.round(this.t + this.penalty)}s`, 'Syrup label recovered (mostly)']);
  }
  timeUp() { return { score: this.stage === 'carry' ? 0.2 + 0.05 * this.delivered : 0.05, lines: [this.stage === 'carry' ? `Sacks loaded: ${this.delivered}/${SACKS}` : 'The goat won'] }; }
  progress() {
    if (this.stage === 'chase') return { label: 'Goat loose', frac: 0.1 + 0.25 * (1 - this.G.stamina) };
    return { label: `Sacks ${this.delivered}/${SACKS}`, frac: 0.45 + 0.55 * (this.delivered + (this.carrying ? 0.4 : 0)) / SACKS };
  }

  visual(dt) {
    const G = this.G, j = this.gj;
    this.goatObj.position.set(G.x, G.dodgeT > 0 ? Math.sin((G.dodgeT / 0.36) * Math.PI) * 0.35 : 0, G.z);
    this.goatObj.rotation.y = G.yaw;
    const A = Math.min(1, G.speed / 2.5) * 0.7;
    j.fl.rotation.x = Math.sin(G.phase) * A; j.rr.rotation.x = Math.sin(G.phase) * A;
    j.fr.rotation.x = -Math.sin(G.phase) * A; j.rl.rotation.x = -Math.sin(G.phase) * A;
    j.tail.rotation.y = Math.sin(this.t * 14) * 0.5;
    j.head.rotation.x = G.speed < 0.3 && !G.caught ? 0.5 + Math.sin(this.t * 6) * 0.15 : Math.sin(G.phase * 0.5) * 0.1;
    this.farmerCheer = Math.max(0, (this.farmerCheer || 0) - dt);
    this.farmer.s.cheer = this.farmerCheer > 0 ? 1 : 0;
    this.farmer.s.lookY = Math.sin(this.t * 0.8) * 0.4;
    this.farmer.update(dt);
    const rp = this.stage === 'carry' ? (this.carrying ? { x: DROP.x, z: DROP.z - 0.6 } : { x: PILE.x, z: PILE.z - 0.6 }) : null;
    this.ring.visible = !!rp;
    if (rp) { this.ring.position.set(rp.x, 0, rp.z); this.ring.userData.set(0.55 + 0.45 * Math.sin(this.t * 5)); }
    if (this.stage === 'chase') {
      const d = Math.hypot(G.x - this.P.x, G.z - this.P.z);
      this.alertInfo = { icon: 'goat', text: G.stamina < 0.45 ? 'The goat is tiring' : 'Goat on the loose', sub: d < 2 ? 'grab it!' : 'corner it', frac: 1 - G.stamina, tone: G.stamina < 0.45 ? 'green' : 'amber' };
    } else this.alertInfo = this.carrying ? { icon: 'sack', text: 'Heavy sack', sub: 'no running', frac: null, tone: 'amber' } : null;
  }

  bot(h) {
    if (this.stage === 'chase') {
      const G = this.G, P = this.P;
      const d = Math.hypot(G.x - P.x, G.z - P.z);
      const a = this.botAim(new THREE.Vector3(G.x, 0.62, G.z));
      if (this.focus === this.goatT) { this._botCd = Math.max(0, (this._botCd || 0) - h); if (this._botCd <= 0) { this._botCd = 0.25; return { ...a, act: true }; } return a; }
      if (d < 1.6) return { ...a, keys: ['KeyW'], run: G.stamina < 0.5 };
      if (!this._bp || this._bp.t > 0.5) this._bp = { path: this.world.path(P.x, P.z, G.x, G.z, 0.32), t: 0 };
      this._bp.t += h;
      const Pth = this._bp.path; while (Pth.length > 1 && Math.hypot(Pth[0].x - P.x, Pth[0].z - P.z) < 0.4) Pth.shift();
      const w = Pth[0] || G;
      return { yaw: Math.atan2(w.x - P.x, w.z - P.z), pitch: a.pitch, keys: ['KeyW'], run: d > 1.8 || G.stamina < 0.5 };
    }
    if (!this.carrying) return this.botUse(this.pileT, h, { stand: { x: PILE.x, z: PILE.z - 0.9 } });
    return this.botUse(this.dropT, h, { stand: { x: DROP.x, z: DROP.z - 0.9 }, run: false });
  }
  debugExtra() { return { stage: this.stage, goat: { x: +this.G.x.toFixed(2), z: +this.G.z.toFixed(2), stamina: +this.G.stamina.toFixed(2) }, lunges: this.lunges, delivered: this.delivered, carrying: !!this.carrying }; }
}
