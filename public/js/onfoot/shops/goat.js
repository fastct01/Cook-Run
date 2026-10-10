// ─────────────────────────────────────────────────────────────────────────────
// goat — Prickly Pete's Farm Supply barn. The `goat` ate the syrup label and won't hold still:
// it flees (open-space seeking), dodges when you lunge, and tires out. Corner it and press E.
// Then load the 3 feed sacks out to the barn door.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { createModel } from '../../assets/index.js';
import { ShopBase, clamp, wrap } from './ShopBase.js';
import { Kit, room, sack, glowSpot } from './build.js';
import { Avatar } from '../avatar.js';
import { walk } from './world2d.js';

const PILE = { x: 6.6, z: -4.4 };
const DROP = { x: 0, z: 5.7 };
const BLEATS = ['MEEEH!', 'Mehh?', 'BAAH!', 'Meh-heh-heh'];

export class GoatChallenge extends ShopBase {
  build() {
    const S = this.scene;
    S.background = new THREE.Color('#2a2420');
    S.add(new THREE.HemisphereLight('#f3e6c8', '#6a5238', 1.15));
    const sun = new THREE.DirectionalLight('#ffe0a8', 1.7);
    sun.position.set(6, 16, 10); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 9, bottom: -9, near: 1, far: 50 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    S.add(sun);
    const doorLight = new THREE.PointLight('#ffe7b8', 10, 9, 1.3); doorLight.position.set(0, 2.4, 5.6); S.add(doorLight);

    // barn: plank walls, straw floor, posts + rails, stalls, open door with daylight
    const k = new Kit(1400);
    room(k, { x0: -9, x1: 9, z0: -6.5, z1: 6.5, h: 4.4, floor: '#b89b62', wall: '#8a5a3c', low: '#6e4630', band: 0.9, skip: ['front'] });
    for (let x = -8.8; x < 9; x += 0.45) for (const [z, s] of [[-6.5, 1]]) k.rectZ(x % 0.9 < 0.45 ? '#7a4f35' : '#93623f', z, [x, x + 0.03], [0.9, 4.4], s, { off: 0.003 });
    for (let z = -6.3; z < 6.5; z += 0.45) { k.rectX('#7a4f35', -9, [z, z + 0.03], [0.9, 4.4], 1, { off: 0.003 }); k.rectX('#7a4f35', 9, [z, z + 0.03], [0.9, 4.4], -1, { off: 0.003 }); }
    k.rectZ('#8a5a3c', 6.5, [-9, -1.8], [0, 4.4], -1, { off: 0 }); k.rectZ('#8a5a3c', 6.5, [1.8, 9], [0, 4.4], -1, { off: 0 });
    k.rectZ('#8a5a3c', 6.5, [-1.8, 1.8], [3.2, 4.4], -1, { off: 0 });
    k.rectZ('#f7e9c2', 6.55, [-1.8, 1.8], [0, 3.2], -1, { off: 0 });                 // daylight
    for (let i = 0; i < 40; i++) { const r = Math.sin(i * 12.9898) * 43758.5453; const fx = r - Math.floor(r), fz = (r * 7.3) - Math.floor(r * 7.3); k.blob(i % 2 ? '#c9ad6e' : '#a88b55', 0.35 + fx * 0.5, [-8 + fx * 16, 0.004, -5.8 + fz * 11.6], { seg: 7, seed: 1401 + i, off: 0 }); }
    for (const x of [-4.5, 0, 4.5]) for (const z of [-3, 1.5]) k.box('#6e4630', [0.22, 4.3, 0.22], [x, 0, z], { base: true });
    // stall rails along the back (low fences the goat hops past but you can't)
    for (const [x0, x1] of [[-9, -5.4], [-3.6, -1.8]]) { k.box('#93623f', [x1 - x0, 0.1, 0.08], [(x0 + x1) / 2, 0.55, -3.9], { base: true }); k.box('#93623f', [x1 - x0, 0.1, 0.08], [(x0 + x1) / 2, 0.95, -3.9], { base: true }); }
    for (const x of [-5.4, -3.6, -1.8]) k.box('#6e4630', [0.12, 1.1, 0.12], [x, 0, -3.9], { base: true });
    // trough + bucket + pitchfork against the wall
    k.box('#5f6468', [1.8, 0.45, 0.55], [7.4, 0, 1.6], { base: true, c: 0.05 });
    k.box('#4f8f8a', [1.65, 0.05, 0.42], [7.4, 0.38, 1.6], { base: true });
    k.cyl('#9aa0a6', 0.18, 0.15, 0.35, [-7.6, 0, 4.6], { base: true, seg: 8, open: true });
    // the feed sack pile
    for (let i = 0; i < 5; i++) sack(k, [PILE.x - 0.7 + (i % 3) * 0.66, 0.0 + Math.floor(i / 3) * 0.28, PILE.z - 0.5 + (i % 2) * 0.1], (i - 2) * 0.1, '#d6c08a');
    const barn = k.mesh('barn'); barn.castShadow = false; S.add(barn);
    barn.material = barn.material.clone(); barn.material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 3.0)]; this.clipping = true;
    // the farmyard outside (seen past the cut-away walls)
    const ok = new Kit(1405);
    ok.box('#9c8c5c', [60, 0.1, 50], [0, -0.07, 0]);
    ok.box('#b39a62', [5, 0.02, 10], [0, -0.01, 11]);
    for (let i = 0; i < 9; i++) ok.blob(i % 2 ? '#8a7c50' : '#7f9b53', 0.8 + (i % 3) * 0.5, [-14 + i * 3.5, -0.005, 9 + (i % 3) * 2], { seg: 8, seed: 1406 + i, off: 0 });
    for (let x = -12; x <= 12; x += 2.4) { ok.box('#93623f', [0.12, 1.1, 0.12], [x, 0, 13], { base: true }); }
    ok.box('#93623f', [24.2, 0.1, 0.06], [0, 0.9, 13], { base: true }); ok.box('#93623f', [24.2, 0.1, 0.06], [0, 0.5, 13], { base: true });
    const yard = ok.mesh('farmyard'); yard.castShadow = false; S.add(yard);
    S.background = new THREE.Color('#a9c2cc');
    // hay bales (props) as cover / obstacles
    this.bales = [[-5.6, -0.6, 0.2], [-2.0, 3.6, 1.3], [3.4, -1.5, 0.9], [4.6, 3.4, 0.1], [-6.6, 3.3, 1.6], [0.6, -4.8, 0.5]].map(([x, z, r]) => {
      const m = createModel('hay'); m.position.set(x, 0, z); m.rotation.y = r; m.scale.setScalar(0.8); S.add(m); return { x, z };
    });
    // carried sacks (3, separate so they can move)
    this.sacks = [0, 1, 2].map((i) => { const sk = new Kit(1420 + i); sack(sk, [0, 0, 0], 0, '#cdb67c'); const m = sk.mesh('sack' + i); m.position.set(PILE.x - 0.4 + i * 0.5, 0.56, PILE.z + 0.15); S.add(m); return { m, state: 'pile' }; });
    // the farmer at the door, the goat
    this.farmer = new Avatar(createModel('farmer', 0), { name: 'farmer' }); this.farmer.set({ x: -2.6, z: 5.6, yaw: Math.PI * 0.85 }); S.add(this.farmer.root);
    this.goatObj = createModel('goat'); S.add(this.goatObj);
    const gj = (n) => this.goatObj.getObjectByName(n) || new THREE.Object3D();
    this.gj = { body: gj('body'), head: gj('head'), tail: gj('tail'), fl: gj('leg_fl'), fr: gj('leg_fr'), rl: gj('leg_rl'), rr: gj('leg_rr') };
    this.G = { x: 1.5, z: 0.5, yaw: 2.2, vx: 0, vz: 0, speed: 0, stamina: 1, dodgeCd: 0, dodgeT: 0, dx: 0, dz: 0, phase: 0, wanderT: 0, caught: false, bleatCd: 2 };

    const W = this.world;
    W.bounds = { x0: -9, x1: 9, z0: -6.5, z1: 6.5 };
    for (const b of this.bales) W.circle(b.x, b.z, 0.72, 'bale');
    for (const x of [-4.5, 0, 4.5]) for (const z of [-3, 1.5]) W.circle(x, z, 0.16, 'post');
    W.box(-9, -5.4, -4.0, -3.8, 'rail'); W.box(-3.6, -1.8, -4.0, -3.8, 'rail');
    W.box(6.45, 8.35, 1.3, 1.9, 'trough'); W.circle(-7.6, 4.6, 0.22, 'bucket');
    this.pileC = W.box(PILE.x - 1.15, PILE.x + 0.9, PILE.z - 0.85, PILE.z + 0.5, 'sacks');
    W.box(-9, -1.8, 6.3, 6.5, 'wall'); W.box(1.8, 9, 6.3, 6.5, 'wall');
    this.farmerC = W.circle(-2.6, 5.6, 0.3, 'farmer');

    Object.assign(this.rook, { x: 0, z: 5.2, yaw: Math.PI });
    this.cam = { ...this.cam, yaw: Math.PI, dist: 6.6, h: 8.6, look: 0.6, fov: 52, lag: 4.5 };
    this.stage = 'chase'; this.lunges = 0; this.delivered = 0;
    this.ring = glowSpot('#ffd36a', 0.5, 0.8); this.ring.visible = false; S.add(this.ring);
  }

  // open-space seeking flee with dodges; tires over time
  _goat(h) {
    const G = this.G, R = this.rook;
    G.dodgeCd = Math.max(0, G.dodgeCd - h); G.bleatCd -= h;
    const dx = G.x - R.x, dz = G.z - R.z, d = Math.hypot(dx, dz) || 1e-3;
    const closing = (R.vx * dx + R.vz * dz) / d;
    let mx = 0, mz = 0, max = 0;
    if (G.dodgeT > 0) {
      G.dodgeT -= h; mx = G.dx; mz = G.dz; max = 5.6;
    } else if (d < 1.5 && closing > 1.6 && G.dodgeCd <= 0 && G.stamina > 0.2) {
      // dodge sideways (the side with more room)
      const px = -dz / d, pz = dx / d;
      const room = (sx, sz) => { let s = 0; for (let t = 0.6; t <= 2.4; t += 0.6) if (!this.world.blockedAt(G.x + sx * t, G.z + sz * t, 0.32)) s += 1; return s; };
      const side = room(px, pz) >= room(-px, -pz) ? 1 : -1;
      G.dx = px * side * 0.85 + (dx / d) * 0.5; G.dz = pz * side * 0.85 + (dz / d) * 0.5;
      const l = Math.hypot(G.dx, G.dz); G.dx /= l; G.dz /= l;
      G.dodgeT = 0.38; G.dodgeCd = 1.5 + (1 - G.stamina) * 1.4; G.stamina = Math.max(0, G.stamina - 0.12);
      this.lunges++;
      if (G.bleatCd <= 0) { G.bleatCd = 1.2; this.popAt(BLEATS[this.lunges % BLEATS.length], 'info', G.x, 1.9, G.z); }
      mx = G.dx; mz = G.dz; max = 5.6;
    } else if (d < 5.2) {
      // flee: best of 16 directions = away from Rook + open space ahead − corners
      let best = -1e9;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, cx = Math.sin(a), cz = Math.cos(a);
        let free = 0;
        for (let t = 0.5; t <= 3.0; t += 0.5) { if (this.world.blockedAt(G.x + cx * t, G.z + cz * t, 0.34)) break; free = t; }
        const away = (cx * dx + cz * dz) / d;
        const s = away * 2.0 + free * 0.9 - (free < 1 ? 3 : 0);
        if (s > best) { best = s; mx = cx; mz = cz; }
      }
      max = 2.2 + 1.5 * G.stamina;
      G.stamina = Math.max(0, G.stamina - h * 0.05);
    } else {
      // wander / nibble
      G.wanderT -= h;
      if (G.wanderT <= 0) { G.wanderT = 2.5; G.wa = Math.sin(this.t * 3.7) * Math.PI; }
      if (G.wanderT > 1.2) { mx = Math.sin(G.wa); mz = Math.cos(G.wa); max = 0.8; }
      G.stamina = Math.min(1, G.stamina + h * 0.03);
    }
    walk(G, mx, mz, max, h, this.world, 0.32, { accel: 22, turn: 10 });
    G.phase += G.speed * h * 6;
  }

  step(h) {
    const R = this.rook, G = this.G;
    this.walkRook(h, { speedMul: R.carry ? 0.8 : 1, canRun: !R.carry });
    if (this.stage === 'chase') {
      this._goat(h);
      const d = Math.hypot(G.x - R.x, G.z - R.z);
      const can = d < 1.25 && G.dodgeT <= 0;
      this.prompt = { text: can ? 'GRAB IT! [E]' : 'Corner the goat', near: can, sub: G.stamina < 0.45 ? 'it\'s getting tired…' : 'it dodges when you charge — use the hay bales' };
      if (this.actPressed) {
        R.act = 0.4;
        if (can) {
          this.stage = 'carry'; G.caught = true; G.speed = 0;
          this.hud.pop('GOTCHA!', 'big');
          this.farmerCheer = 2;
        } else if (d < 2.2) { this.popRook('Missed!', 'bad'); }
      }
    } else {
      this._goatTied(h);
      if (!R.carry) {
        const at = this.near(PILE, 1.5);
        this.prompt = { text: at ? 'Grab a feed sack [E]' : `Load the feed sacks — ${this.delivered}/3`, near: at };
        this._ringAt({ x: PILE.x - 0.3, z: PILE.z + 0.9 });
        if (at && this.actPressed) { const s = this.sacks.find((x) => x.state === 'pile'); if (s) { s.state = 'held'; this.heldSack = s; R.carry = 'sack'; R.act = 0.3; } }
      } else {
        const at = this.near(DROP, 1.3);
        this.prompt = { text: at ? 'Load it [E]' : 'Out the barn door', near: at, sub: 'heavy — no running' };
        this._ringAt(DROP);
        if (at && this.actPressed) {
          const s = this.heldSack; s.state = 'out'; this.heldSack = null; R.carry = null;
          s.m.position.set(DROP.x - 0.7 + this.delivered * 0.7, 0, DROP.z + 0.55); s.m.rotation.y = 0.2 * this.delivered;
          this.delivered++;
          this.popRook(this.delivered >= 3 ? 'All loaded!' : `${this.delivered}/3`, 'good');
          if (this.delivered >= 3) this._finishOk();
        }
      }
    }
  }
  _goatTied(h) {
    // the caught goat trots to the farmer and stays put
    const G = this.G, tx = -1.6, tz = 5.0;
    const dx = tx - G.x, dz = tz - G.z, l = Math.hypot(dx, dz);
    walk(G, l > 0.3 ? dx / l : 0, l > 0.3 ? dz / l : 0, 1.6, h, this.world, 0.32);
    G.phase += G.speed * h * 6;
  }
  _ringAt(p) { this.ring.visible = true; this.ring.position.set(p.x, 0, p.z); }

  _finishOk() {
    const tf = this.timeLeft / this.timeLimit;
    const score = clamp(0.3 + 0.75 * tf, 0.05, 1);
    this.finish(score, [`Goat caught after ${this.lunges} dodge${this.lunges === 1 ? '' : 's'}`, `3 sacks loaded in ${Math.round(this.t + this.penalty)}s`, 'Syrup label recovered (mostly)']);
  }
  timeUp() { return { score: this.stage === 'carry' ? 0.2 + 0.05 * this.delivered : 0.05, lines: [this.stage === 'carry' ? `Sacks loaded: ${this.delivered}/3` : 'The goat won'] }; }

  visual(dt) {
    const R = this.rook, G = this.G, j = this.gj;
    this.cam.x = (R.x * 2 + (this.stage === 'chase' ? G.x : R.x)) / 3; this.cam.z = (R.z * 2 + (this.stage === 'chase' ? G.z : R.z)) / 3 - 0.8;
    this.goatObj.position.set(G.x, G.dodgeT > 0 ? Math.sin((G.dodgeT / 0.38) * Math.PI) * 0.35 : 0, G.z);
    this.goatObj.rotation.y = G.yaw;
    const A = Math.min(1, G.speed / 2.5) * 0.7;
    j.fl.rotation.x = Math.sin(G.phase) * A; j.rr.rotation.x = Math.sin(G.phase) * A;
    j.fr.rotation.x = -Math.sin(G.phase) * A; j.rl.rotation.x = -Math.sin(G.phase) * A;
    j.tail.rotation.y = Math.sin(this.t * 14) * 0.5;
    j.head.rotation.x = G.speed < 0.3 && !G.caught ? 0.5 + Math.sin(this.t * 6) * 0.15 : Math.sin(G.phase * 0.5) * 0.1;
    if (this.heldSack) { this.heldSack.m.position.set(R.x + Math.sin(R.yaw) * 0.42, 0.68, R.z + Math.cos(R.yaw) * 0.42); this.heldSack.m.rotation.y = R.yaw + Math.PI / 2; }
    this.farmerCheer = Math.max(0, (this.farmerCheer || 0) - dt);
    this.farmer.s.cheer = this.farmerCheer > 0 ? 1 : 0;
    this.farmer.s.lookY = Math.sin(this.t * 0.8) * 0.4;
    this.farmer.update(dt);
    if (this.ring.visible) this.ring.userData.set(0.55 + 0.45 * Math.sin(this.t * 5));
  }

  bot(h) {
    const R = this.rook, G = this.G;
    if (this.stage === 'chase') {
      const d = Math.hypot(G.x - R.x, G.z - R.z);
      if (d < 1.0 && G.dodgeT <= 0) return { act: true };
      // aim a little past the goat toward the wall it's nearest to (herding)
      const dx = G.x - R.x, dz = G.z - R.z;
      const l = Math.hypot(dx, dz) || 1;
      if (!this._bp || this._bp.t > 0.5) this._bp = { path: this.world.path(R.x, R.z, G.x, G.z, 0.32), t: 0 };
      this._bp.t += h;
      const P = this._bp.path; while (P.length > 1 && Math.hypot(P[0].x - R.x, P[0].z - R.z) < 0.4) P.shift();
      const w = P[0] || G; const wx = w.x - R.x, wz = w.z - R.z, wl = Math.hypot(wx, wz) || 1;
      return { move: { x: wx / wl, z: wz / wl }, run: d > 1.8 || G.stamina < 0.5 };
    }
    const goal = R.carry ? DROP : { x: PILE.x - 0.3, z: PILE.z + 0.9 };
    if (this.near(R.carry ? DROP : PILE, R.carry ? 1.0 : 1.3)) return { act: true };
    if (!this._bq || this._bq.goal !== goal.x + ',' + goal.z) this._bq = { goal: goal.x + ',' + goal.z, path: this.world.path(R.x, R.z, goal.x, goal.z, 0.34) };
    const P = this._bq.path; while (P.length > 1 && Math.hypot(P[0].x - R.x, P[0].z - R.z) < 0.45) P.shift();
    const w = P[0] || goal, dx = w.x - R.x, dz = w.z - R.z, l = Math.hypot(dx, dz) || 1;
    return { move: { x: dx / l, z: dz / l }, run: !R.carry };
  }
  debugExtra() { return { stage: this.stage, goat: { x: +this.G.x.toFixed(2), z: +this.G.z.toFixed(2), stamina: +this.G.stamina.toFixed(2) }, lunges: this.lunges, delivered: this.delivered }; }
}

