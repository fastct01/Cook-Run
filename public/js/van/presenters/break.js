// BREAK presenter — a slab of teal crystal on a baking tray, built from break.js's shard
// layout (faceted prisms). Click a shard: the little hammer taps it, the shard pops off and
// arcs into the open bag beside the tray; bags fill. Bumps can knock an edge shard off the
// bench (it slides off the counter and is lost, matching the logic).
import * as THREE from 'three';
import { Presenter, damp, clamp } from './Presenter.js';
import { ParticlePool, rnd } from './fx.js';
import { LAYOUT, BREAK, VC, MAT, kitMesh, addBreakTray, makeBag, makeSmallHammer, contactShadows, hitProxy } from './props.js';
import { mix, shade } from '../../assets/palette.js';

const STRIKE_DELAY = 0.08;    // shard leaves once the hammer lands
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);

/** Faceted crystal prism from a 2D polygon (x,z around its centroid), height h. */
function shardGeometry(poly, h, seed) {
  const n = poly.length;
  const r = (i) => { const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return x - Math.floor(x); };
  const top = poly.map(([x, z], i) => [x * 0.96, h * (0.92 + r(i) * 0.16), z * 0.96]);
  const bot = poly.map(([x, z]) => [x, 0, z]);
  const apex = [r(99) * 0.006 - 0.003, h + 0.01 + r(7) * 0.006, r(98) * 0.006 - 0.003];
  const out = [];
  const tri = (a, b, c, want) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * want[0] + ny * want[1] + nz * want[2] < 0) out.push(...a, ...c, ...b); else out.push(...a, ...b, ...c);
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tri(apex, top[i], top[j], [0, 1, 0]);
    const mx = (poly[i][0] + poly[j][0]) / 2, mz = (poly[i][1] + poly[j][1]) / 2;
    const w = [mx, 0, mz];
    tri(bot[i], bot[j], top[j], w);
    tri(bot[i], top[j], top[i], w);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  g.computeVertexNormals();
  return g;
}

export class BreakPresenter extends Presenter {
  constructor(ctx) {
    super('break', ctx);
    const g = this.g;
    const T = LAYOUT.break.tray;
    this.tray = new THREE.Vector3(...T);
    this.pcol = this.productColor;
    this.static = kitMesh('break_static', (k) => addBreakTray(k, T));
    this.body.add(this.static);
    const BG = LAYOUT.break.bags;
    this.bagPos = [new THREE.Vector3(BG[0] - 0.03, 0, BG[2] + 0.07), new THREE.Vector3(BG[0] + 0.07, 0, BG[2] - 0.07)];
    this.body.add(contactShadows([[T[0], T[2], 0.21, 0.2, 0.3], ...this.bagPos.map((b) => [b.x, b.z, 0.075, 0.05, 0.3])]));

    // slab → shard meshes: the logic's columns become wedges of a round crystal "pie"
    const R = BREAK.slabR, R0 = BREAK.slabR0;
    const polar = ([px, py]) => { const a = Math.PI / 2 + px * Math.PI * 2; const r = R - py * (R - R0); return [T[0] + Math.cos(a) * r, T[2] - Math.sin(a) * r]; };
    this.matA = MAT.crystal(this.pcol);
    this.matHot = MAT.crystalHot(this.pcol);
    this.shards = g.shards.map((s, i) => {
      // round off the outer edge (pts[0] → pts[1] both sit on y = 0)
      const pts = s.pts.slice();
      const a0 = pts[0], a1 = pts[1];
      const outer = [1, 2, 3].map((k) => [a0[0] + (a1[0] - a0[0]) * k / 4, 0]);
      const ring = [a0, ...outer, ...pts.slice(1)];
      const P = ring.map(polar);
      const cx = P.reduce((a, p) => a + p[0], 0) / P.length, cz = P.reduce((a, p) => a + p[1], 0) / P.length;
      const h = BREAK.slabH * (0.85 + (s.tone + 0.09) * 1.6);
      const geo = shardGeometry(P.map(([x, z]) => [x - cx, z - cz]), h, i + 1);
      const tint = [0.9, 1.0, 1.07, 0.95, 1.03][i % 5];
      const matA = MAT.crystal(shade(this.pcol, tint));
      const mesh = new THREE.Mesh(geo, matA);
      mesh.name = `shard_${i}`;
      mesh.userData.ownGeometry = true;
      mesh.userData.shardIndex = i;
      mesh.castShadow = true; mesh.receiveShadow = true;
      const rest = new THREE.Vector3(cx, BREAK.slabY, cz);
      mesh.position.copy(rest);
      this.body.add(mesh);
      return { mesh, rest, h, phys: null, gone: false, mat: matA };
    });

    // bags
    this.bags = this.bagPos.map((p, i) => {
      const b = makeBag(`bag${i + 1}`, this.pcol);
      b.group.position.copy(p);
      b.group.rotation.y = i ? 0.35 : -0.2;
      this.body.add(b.group);
      return b;
    });
    this.flash = 0;

    // tap hammer
    this.hammer = makeSmallHammer();
    this.body.add(this.hammer);
    const H = LAYOUT.break.hammer;
    this.hRest = { pos: new THREE.Vector3(H[0] - 0.08, 0.013, H[2]), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.35, -Math.PI / 2, 'YXZ')) };
    this.hYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.64);   // handle comes in from Doc's right
    this.hammer.position.copy(this.hRest.pos);
    this.hammer.quaternion.copy(this.hRest.quat);
    this.tap = null;          // { at: Vector3 (shard top), t }
    this.sinceTap = 99;

    this.crumbs = new ParticlePool(this.body, { cap: 80, geo: 'octa', mat: 'matte', gravity: -3, drag: 0.6, floorY: 0.011, bounce: 0.25, name: 'crumbs' });
    this.own(this.crumbs);

    this.hit = hitProxy(new THREE.CylinderGeometry(BREAK.panR + 0.02, BREAK.panR + 0.02, 0.08, 16).translate(T[0], 0.04, T[2]), 'slabHit');
    this.body.add(this.hit);
    this._pick = [...this.shards.map((s) => s.mesh), this.hit];
    this.hover = -1;
    this._lastBagged = g.bagged || 0;
    this._update(0);
  }

  get hint() {
    const g = this.g;
    if (!g) return '';
    if (g.done) return `Bagged ${g.bagged} of ${g.total}`;
    return 'Click the crystal to snap off shards — they go in the bag';
  }

  _pickShard(hit) {
    if (!hit) return -1;
    const k = hit.object?.userData?.shardIndex;
    if (k !== undefined && this.g.shards[k]?.state === 'on') return k;
    let best = -1, bd = 0.075;
    this.g.shards.forEach((s, i) => {
      if (s.state !== 'on') return;
      const r = this.shards[i].rest;
      const d = Math.hypot(hit.local.x - r.x, hit.local.z - r.z);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  pointerMove(hit) { this.hover = this.playable ? this._pickShard(hit) : -1; }
  pointerDown(hit) {
    if (!hit || !this.playable) return false;
    const i = this._pickShard(hit);
    if (i < 0) return false;
    if (this.g.snap(i)) {
      const s = this.shards[i];
      this.tap = { at: s.rest.clone().setY(s.rest.y + s.h), t: 0 };
      this.sinceTap = 0;
    }
    return true;
  }
  pointerUp() {}

  _update(dt) {
    const g = this.g;
    this.sinceTap += dt;
    const perBag = Math.ceil(g.total / 2);
    let inFlight = 0;
    g.shards.forEach((s, i) => {
      const V = this.shards[i];
      const m = V.mesh;
      m.material = i === this.hover && s.state === 'on' && !g.done ? this.matHot : V.mat;
      if (s.state === 'on') {
        const wob = s.wob ? Math.sin(this.t * 50 + i) * s.wob * 0.004 : 0;
        m.visible = true;
        m.position.set(V.rest.x + wob, V.rest.y + Math.abs(wob) * 0.5, V.rest.z);
        m.rotation.set(0, 0, wob * 2);
        m.scale.setScalar(1);
        return;
      }
      const f = g.flying.find((x) => x.s === s);
      if (!V.gone) { V.gone = true; this._crumbs(V); }
      if (s.state === 'fly' && f && !f.lost) {
        // arc into the bag mouth
        const target = this.bags[Math.min(1, Math.floor((g.bagged + inFlight) / perBag))];
        inFlight++;
        const k = clamp((f.t - STRIKE_DELAY) / Math.max(0.05, f.dur - STRIKE_DELAY), 0, 1);
        const mouth = _v.copy(target.group.position).setY(target.h + 0.02);
        m.visible = true;
        m.position.lerpVectors(V.rest, mouth, k);
        m.position.y += Math.sin(k * Math.PI) * 0.17;
        m.rotation.set(k * 5, k * 3, k * 4);
        m.scale.setScalar(1 - Math.min(1, k * 1.6) * 0.55);
        return;
      }
      if (s.state === 'fly' && f && f.lost) {
        // knocked off: hop, slide off the front edge, fall to the floor
        if (!V.phys) V.phys = { p: V.rest.clone(), v: new THREE.Vector3((V.rest.x < this.tray.x ? -1 : 1) * 0.22, 0.55, 0.85), r: 0 };
        const P = V.phys;
        P.v.y -= (P.p.z < 0 ? 4 : 9.8) * dt;
        P.p.addScaledVector(P.v, dt);
        if (P.p.z < 0 && P.p.y < 0.004) { P.p.y = 0.004; P.v.y = Math.abs(P.v.y) * 0.25; }
        P.r += dt * 9;
        m.visible = P.p.y > -0.9;
        m.position.copy(P.p);
        m.rotation.set(P.r, P.r * 0.6, P.r * 0.3);
        return;
      }
      m.visible = false;      // bagged or lost
    });

    // bag fill + landing pulse
    if (g.bagged > this._lastBagged) this.flash = 1;
    this._lastBagged = g.bagged;
    this.flash = Math.max(0, this.flash - dt * 3.5);
    const fills = [Math.min(1, g.bagged / perBag), clamp((g.bagged - perBag) / perBag, 0, 1)];
    this.bags.forEach((b, i) => {
      const f = fills[i];
      b.fill.visible = f > 0.001;
      const pulse = (i === (g.bagged > perBag ? 1 : 0)) ? this.flash : 0;
      b.fill.scale.set(1 + pulse * 0.08, Math.max(0.0001, f * (b.h - 0.04)), 1 + pulse * 0.08);
      b.group.scale.set(1 + pulse * 0.05, 1 - pulse * 0.03, 1 + pulse * 0.05);
    });

    // tap hammer
    if (this.tap) {
      this.tap.t += dt;
      const t = this.tap.t;
      let lift;
      if (t < 0.05) lift = 0.75 + t / 0.05 * 0.25;
      else if (t < STRIKE_DELAY) lift = 1 - (t - 0.05) / (STRIKE_DELAY - 0.05);
      else if (t < 0.3) lift = (t - STRIKE_DELAY) / (0.3 - STRIKE_DELAY) * 0.45;
      else lift = 0.45;
      const at = this.tap.at;
      // grip so the striking face (local 0, 0.17, −0.044) lands on the shard at lift 0
      _q.setFromAxisAngle(X, -Math.PI / 2).premultiply(this.hYaw);
      const face = _v.set(0, 0.17, -0.044).applyQuaternion(_q);
      const want = face.negate().add(at);
      const r = 40;
      this.hammer.position.set(damp(this.hammer.position.x, want.x, r, dt), damp(this.hammer.position.y, want.y, r, dt), damp(this.hammer.position.z, want.z, r, dt));
      _q.setFromAxisAngle(X, -Math.PI / 2 + lift * 0.9).premultiply(this.hYaw);
      this.hammer.quaternion.slerp(_q, 1 - Math.exp(-r * dt));
      if (this.sinceTap > 1.1 || g.done) this.tap = null;
    } else {
      const r = 5;
      const P = this.hRest.pos;
      this.hammer.position.set(damp(this.hammer.position.x, P.x, r, dt), damp(this.hammer.position.y, P.y, r, dt), damp(this.hammer.position.z, P.z, r, dt));
      this.hammer.quaternion.slerp(this.hRest.quat, 1 - Math.exp(-r * dt));
    }
    this.crumbs.update(dt);
  }

  _crumbs(V) {
    const c = this.pcol;
    for (let i = 0; i < 10; i++) {
      const a = rnd(0, Math.PI * 2), sp = rnd(0.1, 0.35);
      this.crumbs.emit({ x: V.rest.x, y: V.rest.y + V.h, z: V.rest.z, vx: Math.cos(a) * sp, vy: rnd(0.4, 0.9), vz: Math.sin(a) * sp, life: rnd(1.4, 2.4), size: rnd(0.003, 0.006), color: shade(c, rnd(0.9, 1.25)), spin: 10 });
    }
    // a little sparkle
    for (let i = 0; i < 4; i++) this.crumbs.emit({ x: V.rest.x, y: V.rest.y + V.h + 0.01, z: V.rest.z, vx: rnd(-0.2, 0.2), vy: rnd(0.6, 1.0), vz: rnd(-0.2, 0.2), life: 0.35, size: 0.005, color: mix(c, '#ffffff', 0.7), gravity: -1 });
  }

  camera() {
    const T = this.tray;
    return { pos: new THREE.Vector3(T.x + 0.16, 0.62, 0.4), target: new THREE.Vector3(T.x + 0.14, 0.03, T.z + 0.02), fov: 44 };
  }
  debugTargets() {
    const pts = [];
    (this.g?.shards || []).forEach((s, i) => { if (s.state === 'on') { const V = this.shards[i]; pts.push([V.rest.x, V.rest.y + V.h * 0.9, V.rest.z]); } });
    return { kind: 'click', points: pts, bagged: this.g?.bagged ?? 0, total: this.g?.total ?? 0, done: !!this.g?.done };
  }
}
