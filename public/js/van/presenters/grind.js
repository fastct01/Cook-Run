// GRIND presenter — stone mortar & pestle. Drag in circles over the mortar; the pestle
// follows the pointer (raycast onto a horizontal plane at the rim). Crystals shrink into
// powder as rotations count up; a ring of ticks around the mortar lights up; bumps spill
// powder out of the bowl (the logic's score drop).
import * as THREE from 'three';
import { Presenter, damp, clamp } from './Presenter.js';
import { ParticlePool, fxGeometry, rnd } from './fx.js';
import { LAYOUT, MORTAR, VC, MAT, kitMesh, addMortar, addSaltJar, makeJarLabel, makePestle, pestleRestPose, contactShadows, dragPlaneY, hitProxy } from './props.js';
import { ASPECT } from '../../cook/minigames/Minigame.js';
import { mix, shade } from '../../assets/palette.js';

// must match grind.js (focus-area centre + perspective squash)
const CX = 0.5, CY = 0.58, SQUASH = 0.42;
const S = 3.0;               // focus "radius units" per metre on the drag plane
const TICKS_PER_TURN = 4;

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const C_DIM = new THREE.Color('#3a3f44'), C_LIT = new THREE.Color(VC.mustard), C_DONE = new THREE.Color(VC.good);

export class GrindPresenter extends Presenter {
  constructor(ctx) {
    super('grind', ctx);
    const P = LAYOUT.grind.mortar;
    this.center = new THREE.Vector3(P[0], P[1], P[2]);
    const g = this.g;
    const col = this.material.color || '#e8e1cf';
    this.col = col;

    // static: mortar + salt jar (jar matches the ingredient)
    this.static = kitMesh('grind_static', (k) => {
      addMortar(k, P);
      addSaltJar(k, LAYOUT.grind.jar, col);
    });
    this.body.add(this.static);
    const mat = this.material;
    this.body.add(makeJarLabel(LAYOUT.grind.jar, mat.id || 'salts', mat.name || 'Mesa Salts', col));
    this.body.add(contactShadows([[P[0], P[2], 0.13, 0.12, 0.34], [LAYOUT.grind.jar[0], LAYOUT.grind.jar[2], 0.055, 0.05, 0.3]]));

    // contents: powder mound + crystal chunks
    const mg = new THREE.ConeGeometry(0.072, 1, 9, 1, false);
    mg.translate(0, 0.5, 0);
    this.mound = new THREE.Mesh(mg, MAT.flat(shade(col, 0.97)));
    this.mound.name = 'powder';
    this.mound.userData.ownGeometry = true;
    this.mound.position.set(P[0], MORTAR.floorY - 0.004, P[2]);
    this.body.add(this.mound);
    const n = 18;
    this.chunks = [];
    for (let i = 0; i < n; i++) {
      const base = g.chunks?.[i % (g.chunks.length || 1)] || { a: rnd(0, 6.28), r: rnd(0.2, 0.9), s: rnd(0.7, 1.3), rot: rnd(0, 6) };
      this.chunks.push({ a: base.a + (i >= 9 ? 2.1 : 0), r: i >= 9 ? 0.15 + (i % 5) * 0.12 : base.r, s: base.s * (i >= 9 ? 0.75 : 1), rot: base.rot + i, h: (i % 3) * 0.006 });
    }
    this.crystals = new THREE.InstancedMesh(fxGeometry('octa'), MAT.flat(shade(col, 1.05)), n);
    this.crystals.name = 'crystals';
    this.crystals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < n; i++) this.crystals.setColorAt(i, _c.set(shade(col, 0.88 + (i % 4) * 0.06)));
    this.body.add(this.crystals);

    // pestle
    this.pestle = makePestle();
    this.body.add(this.pestle);
    pestleRestPose(this.pestle, P);
    this.head = this.pestle.position.clone();
    this.dir = new THREE.Vector3(0, 1, 0).applyQuaternion(this.pestle.quaternion);

    // tick ring on the counter
    const turns = g.turns || 6;
    this.nTicks = turns * TICKS_PER_TURN;
    const tg = new THREE.BoxGeometry(1, 1, 1);
    this.ticks = new THREE.InstancedMesh(tg, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, name: 'VC_ticks' }), this.nTicks);
    this.own(this.ticks.material);
    this.ticks.userData.ownGeometry = true;
    this.ticks.name = 'turnTicks';
    for (let i = 0; i < this.nTicks; i++) {
      const a = Math.PI / 2 + (i / this.nTicks) * Math.PI * 2;      // start at the back, clockwise seen from above
      const big = i % TICKS_PER_TURN === TICKS_PER_TURN - 1;
      const r = 0.15;
      _m.compose(_v.set(P[0] + Math.cos(a) * r, 0.002, P[2] - Math.sin(a) * r), _q.setFromAxisAngle(UP, a), _w.set(big ? 0.03 : 0.018, 0.003, big ? 0.012 : 0.008));
      this.ticks.setMatrixAt(i, _m);
      this.ticks.setColorAt(i, _c.set('#3a3f44'));
    }
    this.body.add(this.ticks);

    // fx
    this.dust = new ParticlePool(this.body, { cap: 70, geo: 'ico', mat: 'matte', gravity: -1.6, drag: 1.4, floorY: 0.003, bounce: 0.2, name: 'dust' });
    this.puffs = new ParticlePool(this.body, { cap: 30, geo: 'ico', mat: 'steam', gravity: 0.05, drag: 2.5, name: 'puffs', renderOrder: 9 });
    this.own(this.dust); this.own(this.puffs);

    // input
    this.hit = hitProxy(new THREE.CylinderGeometry(0.17, 0.17, 0.16, 12).translate(P[0], 0.08, P[2]), 'mortarHit');
    this.body.add(this.hit);
    this.plane = dragPlaneY(MORTAR.rimY, 3, P[0], P[2]);
    this.root.add(this.plane);
    this._pick = [this.static, this.pestle, this.hit];
    this._dragPick = [this.plane];

    this._pointer = new THREE.Vector3().copy(this.center);
    this._lastTurns = g.turnsDone || 0;
    this._lastShake = g.shakeT || 0;
    this._lastPowder = g.powder ?? 1;
    this._puffT = 0;
    this._wob = 0;
    this._update(0);
  }

  get hint() { return this.g?.done ? 'Ground fine' : 'Drag in circles over the mortar'; }

  _norm(local) {
    const dx = local.x - this.center.x, dz = local.z - this.center.z;
    return [CX + (dx * S) / ASPECT, CY + dz * S * SQUASH];
  }

  pointerDown(hit) {
    if (!hit || !this.playable) return false;
    const d = Math.hypot(hit.local.x - this.center.x, hit.local.z - this.center.z);
    if (d > 0.22) return false;
    this.dragging = true;
    this._pointer.copy(hit.local);
    const [nx, ny] = this._norm(hit.local);
    this.g.pointerDown(nx, ny);
    return true;
  }
  pointerMove(hit) {
    if (!this.dragging || !hit) return;
    this._pointer.copy(hit.local);
    if (!this.playable) return;
    const [nx, ny] = this._norm(hit.local);
    this.g.pointerMove(nx, ny);
  }
  _endDrag() {
    this.dragging = false;
    if (this.g?.pointer?.down) { const [nx, ny] = this._norm(this._pointer); this.g.pointerUp(nx, ny); }
  }

  _update(dt) {
    const g = this.g, P = this.center;
    const p = g.progress;
    const powder = g.powder ?? 1;

    // bump: shake + powder spill (logic lost some powder)
    if ((g.shakeT || 0) > this._lastShake + 0.2 || powder < this._lastPowder - 0.02) {
      this._wob = 1;
      const lost = Math.max(0.05, this._lastPowder - powder);
      const nn = Math.round(18 + lost * 110);
      for (let i = 0; i < 6; i++) this.puffs.emit({ x: P.x + rnd(-0.06, 0.06), y: MORTAR.rimY + 0.01, z: P.z + rnd(-0.06, 0.06), vx: rnd(-0.15, 0.15), vy: rnd(0.08, 0.2), vz: rnd(-0.15, 0.15), life: rnd(0.7, 1.1), size: 0.014, grow: 3, color: mix(this.col, '#ffffff', 0.5) });
      this.dust.burst(nn, () => {
        const a = rnd(0, Math.PI * 2), sp = rnd(0.35, 0.8);
        return { x: P.x + Math.cos(a) * 0.07, y: MORTAR.rimY + 0.01, z: P.z - Math.sin(a) * 0.07, vx: Math.cos(a) * sp, vy: rnd(0.4, 0.9), vz: -Math.sin(a) * sp, life: rnd(2.2, 3.4), size: rnd(0.0028, 0.005), color: shade(this.col, rnd(0.9, 1.05)), spin: 8 };
      });
    }
    this._lastShake = g.shakeT || 0;
    this._lastPowder = powder;
    this._wob = Math.max(0, this._wob - dt * 2.5);

    // mortar wobble on bumps
    const wob = this._wob * this._wob;
    this.static.rotation.set(Math.sin(this.t * 31) * wob * 0.04, 0, Math.cos(this.t * 27) * wob * 0.04);

    // grinding puffs while turns accumulate
    const turns = g.turnsDone || 0;
    const dTurn = turns - this._lastTurns;
    this._lastTurns = turns;
    this._puffT -= dt;
    if (dTurn > 0.001 && this._puffT <= 0) {
      this._puffT = 0.06;
      this.puffs.emit({ x: this.head.x + rnd(-0.012, 0.012), y: this.head.y + 0.018, z: this.head.z + rnd(-0.012, 0.012), vx: rnd(-0.1, 0.1), vy: rnd(0.06, 0.16), vz: rnd(-0.1, 0.1), life: rnd(0.45, 0.75), size: rnd(0.006, 0.009), grow: 2.6, color: mix(this.col, '#ffffff', 0.5) });
      if (Math.random() < 0.5) this.dust.emit({ x: this.head.x, y: this.head.y + 0.01, z: this.head.z, vx: rnd(-0.12, 0.12), vy: rnd(0.2, 0.4), vz: rnd(-0.12, 0.12), life: 0.5, size: 0.0025, color: this.col });
    }

    // contents: mound grows from crystals into powder
    const moundH = (0.016 + 0.026 * p) * (0.35 + 0.65 * powder);
    const moundS = (0.72 + 0.3 * p) * (0.6 + 0.4 * powder);
    this.mound.scale.set(moundS, moundH, moundS);
    this.mound.position.y = MORTAR.floorY - 0.004;
    const spin = (g._spin || 0) * 0.4;
    const visible = Math.round(this.chunks.length * (1 - p) * Math.min(1, powder + 0.2));
    for (let i = 0; i < this.chunks.length; i++) {
      const c = this.chunks[i];
      const s = i < visible ? 0.016 * c.s * (1 - p * 0.55) : 0;
      const a = c.a + spin;
      const R = 0.052 * c.r;
      const y = MORTAR.floorY + moundH * (0.85 - c.r * 0.5) + c.h + 0.006;
      _m.compose(_v.set(P.x + Math.cos(a) * R, y, P.z - Math.sin(a) * R), _q.setFromAxisAngle(_w.set(0.3, 1, 0.2).normalize(), c.rot + spin * 0.6), _w.set(s, s * 0.8, s));
      this.crystals.setMatrixAt(i, _m);
    }
    this.crystals.instanceMatrix.needsUpdate = true;

    // tick ring
    const lit = turns * TICKS_PER_TURN;
    for (let i = 0; i < this.nTicks; i++) {
      let col;
      if (g.done) col = C_DONE;
      else if (i < Math.floor(lit)) col = C_LIT;
      else if (i === Math.floor(lit)) col = _c.copy(C_DIM).lerp(C_LIT, (lit % 1) * 0.6 + 0.2 * (0.5 + 0.5 * Math.sin(this.t * 8)));
      else col = C_DIM;
      this.ticks.setColorAt(i, col);
    }
    if (this.ticks.instanceColor) this.ticks.instanceColor.needsUpdate = true;

    // pestle pose
    let headT, gripT;
    if (this.dragging && !g.done) {
      const dx = this._pointer.x - P.x, dz = this._pointer.z - P.z;
      const d = Math.hypot(dx, dz) || 1;
      const lim = MORTAR.innerR * 0.55;
      const k = Math.min(1, lim / d);
      const ox = dx * k, oz = dz * k;
      headT = _v.set(P.x + ox, MORTAR.floorY + 0.012 + moundH * 0.4, P.z + oz);
      gripT = _w.set(P.x + ox * 2.2, MORTAR.rimY + 0.2, P.z + oz * 2.2 + 0.05);
    } else {
      // idle: a lazy circle while the contents still spin, else lean on the rim
      headT = _v.set(P.x - 0.034, MORTAR.floorY + 0.006, P.z + 0.01);
      gripT = _w.set(P.x - 0.17, MORTAR.rimY + 0.13, P.z + 0.06);
    }
    const r = this.dragging ? 30 : 8;
    this.head.set(damp(this.head.x, headT.x, r, dt), damp(this.head.y, headT.y, r, dt), damp(this.head.z, headT.z, r, dt));
    const want = gripT.sub(headT).normalize();
    this.dir.lerp(want, 1 - Math.exp(-r * dt)).normalize();
    this.pestle.position.copy(this.head);
    this.pestle.quaternion.setFromUnitVectors(UP, this.dir);
    this.dust.update(dt);
    this.puffs.update(dt);
  }

  camera() {
    const P = this.center;
    return { pos: new THREE.Vector3(P.x + 0.05, 0.6, 0.36), target: new THREE.Vector3(P.x + 0.02, 0.06, P.z + 0.01), fov: 34 };
  }

  debugTargets() {
    return { kind: 'circle', center: [this.center.x, MORTAR.rimY, this.center.z], radius: 0.055, done: !!this.g?.done };
  }
}
