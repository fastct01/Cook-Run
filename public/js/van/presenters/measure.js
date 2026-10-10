// MEASURE presenter — a labelled bottle over a graduated beaker. Press & hold the bottle or
// the beaker (or hold Space): the bottle lifts, tilts and pours a stream; the liquid rises;
// the target band glows on the beaker wall; the surface sloshes with the van's lateral g;
// bumps splash; overfill spills over the rim. Release to stop.
import * as THREE from 'three';
import { Presenter, damp, clamp } from './Presenter.js';
import { ParticlePool, rnd } from './fx.js';
import { LAYOUT, BEAKER, BOTTLE, VC, MAT, INGREDIENT_DEFAULTS, kitMesh, addBeakerSolid, makeBeakerGlass, makeBottle, contactShadows, LiquidPrism, hitProxy } from './props.js';
import { shade } from '../../assets/palette.js';

const POUR_ANGLE = 2.12;     // rad about Z (neck toward −X, into the beaker)
const LIFT = 0.07;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);

export class MeasurePresenter extends Presenter {
  constructor(ctx) {
    super('measure', ctx);
    const g = this.g;
    const mat = this.material;
    this.col = mat.color || '#9fd3c7';
    const B = LAYOUT.measure.beaker;
    this.bpos = new THREE.Vector3(B[0], B[1], B[2]);

    // static: beaker base/rim/graduations
    this.static = kitMesh('measure_static', (k) => addBeakerSolid(k, B), { shadows: false });   // the rim torus would cast a ring shadow
    this.body.add(this.static);

    // bottles on the rack — the step's material is the one that pours
    const labIng = this.lab?.ingredients || {};
    const ids = LAYOUT.measure.rackIds.slice();
    let slot = ids.indexOf(mat.id);
    if (slot < 0) { slot = 1; ids[1] = mat.id || 'solvent'; }
    this.bottles = ids.map((id, i) => {
      const info = id === mat.id ? mat : (labIng[id] || INGREDIENT_DEFAULTS[id] || { name: id, color: '#9fd3c7' });
      const b = makeBottle(id, info.name, info.color);
      const R = LAYOUT.measure.rack[i];
      b.group.position.set(R[0], R[1], R[2]);
      b.group.rotation.y = -0.25 + i * 0.12;
      this.body.add(b.group);
      return b;
    });
    this.bottle = this.bottles[slot];
    this.rest = this.bottle.group.position.clone();
    this.restYaw = this.bottle.group.rotation.y;
    this.pourK = 0;

    this.body.add(contactShadows([
      [B[0], B[2], 0.095, 0.085, 0.32],
      ...LAYOUT.measure.rack.map((R, i) => [R[0], R[2], 0.055, 0.05, i === slot ? 0 : 0.3]),
    ]));
    // the moving bottle gets its own little shadow so it can lift away
    this.bshadow = contactShadows([[0, 0, 0.055, 0.05, 0.3]], 0.0018, 'bottleShadow');
    this.body.add(this.bshadow);

    // liquid
    this.liqMat = this.own(new THREE.MeshLambertMaterial({ color: shade(this.col, 0.92), flatShading: true, name: 'VC_measureLiquid' }));
    this.liquid = new LiquidPrism({ r: BEAKER.innerR, seg: 14, name: 'beakerLiquid' }, this.liqMat);
    this.liquid.mesh.position.set(B[0], BEAKER.floor, B[2]);
    this.liquid.mesh.renderOrder = 2;
    this.own(this.liquid);
    this.body.add(this.liquid.mesh);
    this.glass = makeBeakerGlass();
    this.glass.position.set(B[0], 0, B[2]);
    this.body.add(this.glass);

    // target band (glowing ring band on the wall)
    const H = BEAKER.H - BEAKER.floor;
    const y0 = BEAKER.floor + g.min * H, y1 = BEAKER.floor + g.max * H;
    this.bandMat = this.own(new THREE.MeshBasicMaterial({ color: VC.good, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, name: 'VC_band' }));
    const bg = new THREE.CylinderGeometry(BEAKER.R + 0.004, BEAKER.R + 0.004, y1 - y0, 16, 1, true);
    bg.translate(0, (y0 + y1) / 2, 0);
    this.band = new THREE.Mesh(bg, this.bandMat);
    this.band.userData.ownGeometry = true;
    this.band.position.set(B[0], 0, B[2]);
    this.band.renderOrder = 7;
    this.band.name = 'targetBand';
    this.body.add(this.band);
    this.edgeMat = this.own(new THREE.MeshBasicMaterial({ color: '#d8f0a0', toneMapped: false, name: 'VC_bandEdge' }));
    const eg = new THREE.TorusGeometry(BEAKER.R + 0.005, 0.0022, 3, 18);
    eg.rotateX(Math.PI / 2);
    const eg2 = eg.clone();
    eg.translate(0, y0, 0); eg2.translate(0, y1, 0);
    const merged = mergeTwo(eg, eg2);
    eg.dispose(); eg2.dispose();
    this.edges = new THREE.Mesh(merged, this.edgeMat);
    this.edges.userData.ownGeometry = true;
    this.edges.position.set(B[0], 0, B[2]);
    this.edges.name = 'bandEdges';
    this.body.add(this.edges);

    // pour stream
    const sg = new THREE.CylinderGeometry(0.0042, 0.0062, 1, 6, 1, true);
    sg.translate(0, -0.5, 0);
    this.stream = new THREE.Mesh(sg, this.liqMat);
    this.stream.userData.ownGeometry = true;
    this.stream.name = 'stream';
    this.stream.visible = false;
    this.body.add(this.stream);

    // spill puddle
    this.puddle = contactShadows([[0, 0, 1, 1, 1]], 0.0025, 'puddle');
    this.puddle.material = this.own(new THREE.MeshBasicMaterial({ color: shade(this.col, 0.8), transparent: true, opacity: 0.85, depthWrite: false, name: 'VC_puddle' }));
    this.puddle.geometry.deleteAttribute('color');
    this.puddle.position.set(B[0] + 0.02, 0, B[2] + 0.03);
    this.puddle.scale.setScalar(0.0001);
    this.puddle.visible = false;
    this.body.add(this.puddle);
    this.puddleR = 0;

    this.drops = new ParticlePool(this.body, { cap: 60, geo: 'ico', mat: 'liquid', gravity: -3.2, drag: 0.4, floorY: 0.003, bounce: 0, name: 'drops' });
    this.own(this.drops);

    // input: bottle, glass and a generous proxy around both
    this.hit = hitProxy(new THREE.BoxGeometry(0.62, 0.34, 0.3).translate(0.1, 0.17, B[2] - 0.05), 'measureHit');
    this.body.add(this.hit);
    this._pick = [this.bottle.body, this.glass, this.hit];
    this._spaceHeld = false;
    this._lastDrops = g.drops?.length || 0;
    this._lastResult = g.result;
    this._update(0);
  }

  get hint() {
    const g = this.g;
    if (!g) return '';
    if (g.done) return g.result === 'good' ? 'Right on the line' : g.result === 'spill' ? 'Spilled it' : 'Close enough';
    if (g.pouring) return 'Release inside the green band';
    return 'Hold on the bottle to pour (or hold Space)';
  }

  pointerDown(hit) {
    if (!this.playable || !hit) return false;
    if (hit.object && !this._pick.includes(hit.object)) return false;
    this.dragging = true;
    this.g.pointerDown(0.5, 0.5);
    return true;
  }
  pointerUp() { this._endDrag(); }
  _endDrag() {
    this.dragging = false;
    if (!this._spaceHeld && this.g?.pointer?.down) this.g.pointerUp(0.5, 0.5);
  }
  _releaseKeys() {
    if (!this._spaceHeld) return;
    this._spaceHeld = false;
    if (!this.dragging && this.g?.pointer?.down) this.g.pointerUp(0.5, 0.5);
  }
  key(code, isDown) {
    if (!this._keyGate(code, isDown, code === 'Space')) return false;
    if (isDown) {
      if (this._spaceHeld) return true;
      this._spaceHeld = true;
      if (!this.g.pointer.down) this.g.pointerDown(0.5, 0.5);
    } else {
      this._spaceHeld = false;
      if (!this.dragging && this.g?.pointer?.down) this.g.pointerUp(0.5, 0.5);
    }
    return true;
  }

  _update(dt) {
    const g = this.g;
    const B = this.bpos;
    const H = BEAKER.H - BEAKER.floor;
    if (this._spaceHeld && !this.playable) { this._spaceHeld = false; if (!this.dragging && this.g?.pointer?.down) this.g.pointerUp(0.5, 0.5); }

    // bottle pose: lift → tip over the beaker
    const want = g.pouring ? 1 : 0;
    this.pourK = damp(this.pourK, want, want ? 7 : 5, dt);
    const k = this.pourK;
    const ease = k * k * (3 - 2 * k);
    const ang = POUR_ANGLE * ease;
    const tip = BOTTLE.neckTip;
    // base position that puts the neck tip just inside the beaker rim
    const tipTarget = _v.set(B.x + 0.03 + (g.wobble || 0) * 0.35, BEAKER.H + 0.045, B.z);
    const pourBase = _w.set(tipTarget.x + Math.sin(POUR_ANGLE) * tip, tipTarget.y - Math.cos(POUR_ANGLE) * tip, tipTarget.z);
    const bp = this.bottle.group.position;
    bp.set(
      this.rest.x + (pourBase.x - this.rest.x) * ease,
      this.rest.y + (pourBase.y - this.rest.y) * ease + Math.sin(Math.PI * Math.min(1, k * 1.2)) * LIFT * (1 - ease * 0.5),
      this.rest.z + (pourBase.z - this.rest.z) * ease,
    );
    this.bottle.group.rotation.set(0, this.restYaw * (1 - ease), ang);
    this.bshadow.position.set(bp.x, 0, bp.z);
    this.bshadow.scale.setScalar(Math.max(0.001, 1 - ease * 0.7));
    this.bshadow.visible = ease < 0.95;

    // liquid level + slosh
    const lvl = clamp(g.level, 0, 1.04);
    const h = Math.max(0.0012, lvl * H);
    const slope = (g.tilt || 0) * 0.32 + Math.sin(this.t * 6) * 0.03 * (0.3 + Math.abs(g.tilt || 0));
    this.liquid.setTop(h, slope, 0, H + 0.004);
    this.liquid.mesh.visible = lvl > 0.003;

    // stream
    const pouring = g.pouring && ease > 0.82;
    this.stream.visible = pouring;
    if (pouring) {
      const tipW = _v.set(-Math.sin(ang) * tip, Math.cos(ang) * tip, 0).add(bp);
      const end = _w.set(B.x + (g.wobble || 0) * 0.55 + Math.sin(this.t * 23) * 0.002, BEAKER.floor + h, B.z);
      const len = Math.max(0.01, tipW.distanceTo(end));
      this.stream.position.copy(tipW);
      _q.setFromUnitVectors(DOWN, end.clone().sub(tipW).normalize());
      this.stream.quaternion.copy(_q);
      this.stream.scale.set(1 + Math.sin(this.t * 40) * 0.15, len, 1);
      // little splash at the surface
      if (Math.random() < dt * 30) this.drops.emit({ x: end.x + rnd(-0.008, 0.008), y: end.y + 0.004, z: end.z + rnd(-0.008, 0.008), vx: rnd(-0.12, 0.12), vy: rnd(0.25, 0.45), vz: rnd(-0.12, 0.12), life: 0.28, size: 0.0035, color: this.col, gravity: -4 });
    }

    // band glow: brighter when the level sits in it, pulse while settling
    const inBand = lvl >= g.min && lvl <= g.max;
    const settle = g.settle > 0 ? 0.5 + 0.5 * Math.sin(this.t * 18) : 0;
    this.bandMat.opacity = (inBand ? 0.55 : 0.3) + 0.12 * Math.sin(this.t * 4) + settle * 0.25;
    this.bandMat.color.set(g.done && g.result !== 'good' ? VC.mustard : VC.good);
    this.edgeMat.color.set(inBand ? '#f2ffd0' : '#b9d98a');

    // drops: the logic pushes drops for misses / bumps / spill
    const nd = g.drops?.length || 0;
    const added = nd - this._lastDrops;
    this._lastDrops = nd;
    if (added > 0) {
      const big = added >= 8;
      const n = Math.min(big ? 26 : 3, added * (big ? 2 : 1));
      for (let i = 0; i < n; i++) {
        const a = rnd(0, Math.PI * 2);
        const fromSurface = big && g.result !== 'spill';
        this.drops.emit({
          x: B.x + Math.cos(a) * (fromSurface ? 0.03 : BEAKER.R), y: fromSurface ? BEAKER.floor + h + 0.01 : BEAKER.H, z: B.z - Math.sin(a) * (fromSurface ? 0.03 : BEAKER.R),
          vx: Math.cos(a) * rnd(0.15, 0.45), vy: rnd(0.4, 1.1), vz: -Math.sin(a) * rnd(0.15, 0.45), life: rnd(1.2, 2.2), size: rnd(0.004, 0.007), color: this.col,
        });
      }
    }
    // overflow: liquid runs down the outside and puddles
    if (g.spilled || g.result === 'spill') {
      this.puddle.visible = true;
      this.puddleR = damp(this.puddleR, 0.16, 1.6, dt);
      this.puddle.scale.set(this.puddleR, 1, this.puddleR * 0.8);
      if (Math.random() < dt * 25) {
        const a = rnd(-0.6, 3.8);
        this.drops.emit({ x: B.x + Math.cos(a) * (BEAKER.R + 0.004), y: BEAKER.H - 0.01, z: B.z - Math.sin(a) * (BEAKER.R + 0.004), vx: Math.cos(a) * 0.05, vy: -0.05, vz: -Math.sin(a) * 0.05, life: 0.8, size: 0.005, color: this.col });
      }
    }
    this.drops.update(dt);
  }

  camera() {
    const B = this.bpos;
    return { pos: new THREE.Vector3(B.x + 0.16, 0.5, 0.5), target: new THREE.Vector3(B.x + 0.1, 0.13, B.z - 0.02), fov: 42 };
  }
  debugTargets() {
    return { kind: 'hold', point: [this.rest.x, 0.1, this.rest.z], beaker: [this.bpos.x, 0.1, this.bpos.z], level: this.g?.level ?? 0, min: this.g?.min, max: this.g?.max, rate: this.g?.rate, done: !!this.g?.done };
  }
}

function mergeTwo(a, b) {
  const g = new THREE.BufferGeometry();
  const pa = a.index ? a.toNonIndexed() : a, pb = b.index ? b.toNonIndexed() : b;
  const arr = new Float32Array(pa.attributes.position.count * 3 + pb.attributes.position.count * 3);
  arr.set(pa.attributes.position.array, 0);
  arr.set(pb.attributes.position.array, pa.attributes.position.count * 3);
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  g.computeVertexNormals();
  if (pa !== a) pa.dispose();
  if (pb !== b) pb.dispose();
  return g;
}
