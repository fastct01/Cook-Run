// HAMMER presenter — a dented scrap patch over a hole in the hull wall (plane z = −0.6)
// with N nails sticking out (from the logic). Click a nail: the claw hammer winds up,
// swings and hits; the nail sinks a third per hit (3 hits), sparks fly. The van's motion
// shoves the patch around (the logic's offset), so the nails move under the cursor.
import * as THREE from 'three';
import { Presenter, damp } from './Presenter.js';
import { ParticlePool, rnd } from './fx.js';
import { LAYOUT, PATCH, VC, kitMesh, makePatchPlate, addHullHole, addToolBoard, makePegboardFace, makeClawHammer, hitProxy } from './props.js';
import { Kit } from '../../assets/models/kit.js';
import { vcolMaterial } from '../../assets/palette.js';

// must match hammer.js
const PATCH_X = 0.46, PATCH_Y = 0.56, PATCH_W = 0.62;
const HITS = 3;
const M = PATCH.W / PATCH_W;           // metres per focus "height unit"
const WALL_Z = -0.6;
const NAIL_LEN = 0.068;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const Z = new THREE.Vector3(0, 0, 1);
const PIP_ON = new THREE.Color(VC.mustard), PIP_OFF = new THREE.Color('#2a2e32');
const NAIL_NEW = new THREE.Color(1, 1, 1), NAIL_DONE = new THREE.Color(0.55, 0.57, 0.6);

function nailGeometry() {
  const k = new Kit(41);
  k.cyl(VC.steelLight, 0.0042, 0.0042, NAIL_LEN, [0, 0, NAIL_LEN / 2], { axis: 'z', seg: 6 });
  k.cyl('#e4e6e4', 0.013, 0.012, 0.005, [0, 0, NAIL_LEN + 0.0025], { axis: 'z', seg: 10 });
  k.cyl(VC.steelDark, 0.0125, 0.0125, 0.0015, [0, 0, NAIL_LEN - 0.0003], { axis: 'z', seg: 10 });
  return k.geometry();
}

export class HammerPresenter extends Presenter {
  constructor(ctx) {
    super('hammer', ctx);
    const g = this.g;
    const P = LAYOUT.hammer.patch;
    this.pc = new THREE.Vector3(P[0], P[1], WALL_Z);

    // static: hole in the hull peeking out from under the patch + the tool board (hammer's hook empty)
    this.static = kitMesh('hammer_static', (k) => {
      addHullHole(k, [P[0] + 0.02, P[1] - 0.01, WALL_Z + 0.002]);
      addToolBoard(k, LAYOUT.hammer.board, { sheet: false, hammerHook: true });
    });
    this.body.add(this.static);
    this.body.add(makePegboardFace(LAYOUT.hammer.board));

    // the patch (moves with the logic's offset)
    this.patchPivot = new THREE.Group();
    this.patchPivot.name = 'patchPivot';
    this.patchPivot.position.set(P[0], P[1], WALL_Z + 0.006);
    this.body.add(this.patchPivot);
    this.patch = makePatchPlate();
    this.patchPivot.add(this.patch);

    // nails, target rings, hit pips (instanced; children of the patch)
    const n = g.nails.length;
    this.nails = new THREE.InstancedMesh(nailGeometry(), vcolMaterial(), n);
    this.nails.userData.ownGeometry = true;
    this.nails.name = 'nails';
    this.nails.castShadow = true;
    this.nails.setColorAt(0, NAIL_NEW);
    this.patchPivot.add(this.nails);
    const rg = new THREE.RingGeometry(0.02, 0.026, 20);
    this.ringMat = this.own(new THREE.MeshBasicMaterial({ color: VC.mustard, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false, name: 'VC_nailRing' }));
    this.rings = new THREE.InstancedMesh(rg, this.ringMat, n);
    this.rings.userData.ownGeometry = true;
    this.rings.name = 'nailRings';
    this.rings.renderOrder = 4;
    this.patchPivot.add(this.rings);
    const pg = new THREE.CircleGeometry(0.0045, 8);
    this.pips = new THREE.InstancedMesh(pg, this.own(new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, name: 'VC_pips' })), n * HITS);
    this.pips.userData.ownGeometry = true;
    this.pips.name = 'hitPips';
    this.pips.setColorAt(0, PIP_OFF);
    this.patchPivot.add(this.pips);

    // claw hammer in Doc's hand
    this.hammer = makeClawHammer();
    this.body.add(this.hammer);
    this.restPose = this._pose(new THREE.Vector3(P[0] + 0.24, P[1] - 0.08, WALL_Z + 0.06), new THREE.Vector3(-0.35, 0.94, 0), 0.75);
    this.hammer.position.copy(this.restPose.pos);
    this.hammer.quaternion.copy(this.restPose.quat);
    this.swing = null;

    this.sparks = new ParticlePool(this.body, { cap: 70, geo: 'spark', mat: 'spark', gravity: -3.5, drag: 0.8, name: 'sparks', renderOrder: 9 });
    this.dust = new ParticlePool(this.body, { cap: 30, geo: 'ico', mat: 'matte', gravity: -1.2, drag: 2, name: 'dust' });
    this.own(this.sparks); this.own(this.dust);

    // input: the wall plane in front of the patch
    const wg = new THREE.PlaneGeometry(1.6, 1.4);
    wg.translate(P[0], P[1], WALL_Z + 0.03);
    this.wallHit = hitProxy(wg, 'wallHit');
    this.root.add(this.wallHit);
    this._pick = [this.wallHit];
    this._lastHits = g.hitsDone || 0;
    this._lastMiss = g.misses || 0;
    this._update(0);
  }

  get hint() {
    const g = this.g;
    if (!g) return '';
    if (g.done) return 'Solid. That’ll hold';
    return 'Click a nail to hammer it — 3 hits each';
  }

  /** Hammer pose that puts its striking face on `face` with the handle along `dirY`, wound up by `wind` rad. */
  _pose(face, dirY, wind) {
    const Y = dirY.clone().normalize();
    const Zw = Z.clone();
    const Xw = new THREE.Vector3().crossVectors(Y, Zw).normalize();
    const base = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(Xw, Y, Zw));
    const q = new THREE.Quaternion().setFromAxisAngle(Xw, wind).multiply(base);
    // grip so that local face point (0, 0.248, −0.061) lands on `face` (before wind-up)
    const facePt = new THREE.Vector3(0, 0.248, -0.061).applyQuaternion(base);
    const grip = face.clone().sub(facePt);
    // wind-up rotates around the grip
    return { pos: grip, quat: q };
  }

  /** Focus coords → 3D (anchor space) on the patch surface, including the logic's wobble offset. */
  _to3D(fx, fy, out = new THREE.Vector3()) {
    return out.set(this.pc.x + (fx - PATCH_X) * (4 / 3) * M, this.pc.y - (fy - PATCH_Y) * M, WALL_Z + 0.006);
  }
  _toFocus(local) {
    return [PATCH_X + (local.x - this.pc.x) / M / (4 / 3), PATCH_Y - (local.y - this.pc.y) / M];
  }

  pointerDown(hit) {
    if (!hit || !this.playable) return false;
    const g = this.g;
    const [nx, ny] = this._toFocus(hit.local);
    const before = g.hitsDone;
    // which nail will the logic pick? (closest shown nail) — aim the swing there
    let best = null, bd = 1e9;
    for (const n of g.nails) {
      if (!n.shown || n.hits >= HITS) continue;
      const p = g.nailPos(n);
      const d = Math.hypot((p.x - nx) * (4 / 3), p.y - ny);
      if (d < bd) { bd = d; best = n; }
    }
    g.pointerDown(nx, ny);
    g.pointerUp(nx, ny);
    const hitNail = g.hitsDone > before;
    let face;
    if (hitNail && best) {
      const p = g.nailPos(best);
      face = this._to3D(p.x, p.y);
      face.z = WALL_Z + 0.006 + (1 - (best.hits) / HITS) * NAIL_LEN + 0.006;
    } else {
      face = new THREE.Vector3(hit.local.x, hit.local.y, WALL_Z + 0.012);
    }
    this.swing = { face, t: 0, hit: hitNail, fx: false };
    return true;
  }
  pointerUp() {}

  _update(dt) {
    const g = this.g;
    // patch wobble = logic offset
    const o = g.off || { x: 0, y: 0 };
    this.patchPivot.position.set(this.pc.x + o.x * (4 / 3) * M, this.pc.y - o.y * M, WALL_Z + 0.006);
    this.patchPivot.rotation.z = (g.offV?.x || 0) * 0.04;

    // nails / rings / pips (patch-local)
    const pulse = 1 + 0.12 * Math.sin(this.t * 6);
    let pi = 0;
    g.nails.forEach((n, i) => {
      const p = g.nailPos(n);
      const lx = (p.x - PATCH_X - o.x) * (4 / 3) * M, ly = -(p.y - PATCH_Y - o.y) * M;
      const sink = Math.min(1, n.hits / HITS);
      const shown = n.shown;
      const pop = shown ? 1 - n.pop : 0;
      const bend = n.bend * (1 - sink) * 0.6;
      _q.setFromEuler(_e.set(bend * 0.4, bend, 0));
      const zz = -sink * (NAIL_LEN - 0.002);
      _m.compose(_v.set(lx, ly, zz), _q, _s.setScalar(shown ? Math.max(0.0001, pop) : 0.0001));
      this.nails.setMatrixAt(i, _m);
      this.nails.setColorAt(i, n.hits >= HITS ? NAIL_DONE : NAIL_NEW);
      const active = shown && n.hits < HITS && !g.done;
      const rs = active ? pulse * Math.max(0.001, pop) : 0.0001;
      _m.compose(_v.set(lx, ly, 0.012), _q.identity(), _s.set(rs, rs, 1));
      this.rings.setMatrixAt(i, _m);
      for (let k = 0; k < HITS; k++) {
        const vis = shown && !g.done && n.hits < HITS;
        _m.compose(_v.set(lx - 0.012 + k * 0.012, ly - 0.034, 0.012), _q.identity(), _s.setScalar(vis ? 1 : 0.0001));
        this.pips.setMatrixAt(pi, _m);
        this.pips.setColorAt(pi, k < n.hits ? PIP_ON : PIP_OFF);
        pi++;
      }
    });
    this.nails.instanceMatrix.needsUpdate = true;
    if (this.nails.instanceColor) this.nails.instanceColor.needsUpdate = true;
    this.rings.instanceMatrix.needsUpdate = true;
    this.pips.instanceMatrix.needsUpdate = true;
    if (this.pips.instanceColor) this.pips.instanceColor.needsUpdate = true;
    this.ringMat.opacity = 0.65 + 0.3 * Math.sin(this.t * 6);

    // hammer swing
    const r = 34;
    let want;
    if (this.swing) {
      const s = this.swing;
      s.t += dt;
      const t = s.t;
      let wind;
      if (t < 0.06) wind = 0.7 + (t / 0.06) * 0.45;
      else if (t < 0.11) wind = 1.15 * (1 - (t - 0.06) / 0.05);
      else if (t < 0.28) wind = ((t - 0.11) / 0.17) * 0.45;
      else wind = 0.45;
      if (t >= 0.105 && !s.fx) { s.fx = true; this._impact(s); }
      want = this._pose(s.face, new THREE.Vector3(-0.62, 0.78, 0), wind);
      if (t > 1.0 || g.done) this.swing = null;
    } else {
      want = this.restPose;
    }
    const rr = this.swing ? r : 4;
    const hp = this.hammer.position;
    hp.set(damp(hp.x, want.pos.x, rr, dt), damp(hp.y, want.pos.y, rr, dt), damp(hp.z, want.pos.z, rr, dt));
    this.hammer.quaternion.slerp(want.quat, 1 - Math.exp(-rr * dt));

    this.sparks.update(dt);
    this.dust.update(dt);
  }

  _impact(s) {
    const f = s.face;
    if (s.hit) {
      for (let i = 0; i < 16; i++) {
        const a = rnd(0, Math.PI * 2), sp = rnd(0.6, 1.6);
        this.sparks.emit({ x: f.x, y: f.y, z: f.z + 0.004, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 0.3, vz: rnd(0.2, 0.9), life: rnd(0.2, 0.4), size: rnd(0.0045, 0.007), color: i % 3 ? '#ff8a1c' : '#ffd23a', stretch: 0.09 });
      }
    } else {
      for (let i = 0; i < 6; i++) this.dust.emit({ x: f.x, y: f.y, z: f.z + 0.01, vx: rnd(-0.15, 0.15), vy: rnd(-0.05, 0.15), vz: rnd(0.05, 0.2), life: rnd(0.4, 0.7), size: rnd(0.004, 0.008), grow: 2, color: '#b8b2a4' });
    }
  }

  camera() {
    const P = LAYOUT.hammer.patch;
    return { pos: new THREE.Vector3(P[0] + 0.46, P[1] + 0.15, 0.2), target: new THREE.Vector3(P[0] + 0.07, P[1] - 0.03, WALL_Z), fov: 46 };
  }
  debugTargets() {
    const g = this.g;
    const pts = [];
    if (g) for (const p of g.targets()) { const v = this._to3D(p.x, p.y); v.z = WALL_Z + 0.03; pts.push(v.toArray()); }
    return { kind: 'click', points: pts, nailsDone: g?.nailsDone ?? 0, total: g?.total ?? 0, done: !!g?.done };
  }
}
