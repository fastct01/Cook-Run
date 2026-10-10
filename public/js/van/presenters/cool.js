// COOL presenter — a steel tub full of ice with a tray of product sitting in it. The tray
// tilts with the logic's tilt (van lateral g + wander + bumps); a spirit level on the tray
// shows the bubble. Move the pointer left/right over the counter (or hold A/D, ←/→): the
// orange rubber glove presses that side of the tray down to bring it back level.
import * as THREE from 'three';
import { Presenter, damp, clamp } from './Presenter.js';
import { ParticlePool, fxGeometry, fxMaterial, rnd } from './fx.js';
import { LAYOUT, SINK, VC, MAT, kitMesh, addSink, makeTray, makeGlove, contactShadows, LiquidPrism, hitProxy } from './props.js';
import { mix, shade } from '../../assets/palette.js';

const TILT_RAD = 0.26;        // logic tilt 1 → this many radians (matches the 2D view)
const PER_HAND = 0.25;        // glove x (m) per unit of logic hand
const CENTRE = 0.22;          // cool.js |tilt| considered centred
const KEY_SPEED = 0.5;        // m/s glove travel with A/D
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const ICE_A = new THREE.Color(VC.ice), ICE_B = new THREE.Color(VC.iceDark);

export class CoolPresenter extends Presenter {
  constructor(ctx) {
    super('cool', ctx);
    const g = this.g;
    const P = LAYOUT.cool.sink;
    this.sink = new THREE.Vector3(...P);
    this.pcol = this.productColor;
    this.static = kitMesh('cool_static', (k) => addSink(k, P, { ice: true }));
    this.body.add(this.static);
    this.body.add(contactShadows([[P[0], P[2], 0.38, 0.25, 0.34]]));

    // ice water around the tray (frame with a hole where the tray sits)
    const iw = SINK.w / 2 - SINK.wall, id = SINK.d / 2 - SINK.wall;
    const shape = new THREE.Shape([new THREE.Vector2(-iw, -id), new THREE.Vector2(iw, -id), new THREE.Vector2(iw, id), new THREE.Vector2(-iw, id)]);
    const hw = SINK.trayW / 2 + 0.01, hd = SINK.trayD / 2 + 0.01;
    shape.holes.push(new THREE.Path([new THREE.Vector2(-hw, -hd), new THREE.Vector2(-hw, hd), new THREE.Vector2(hw, hd), new THREE.Vector2(hw, -hd)]));
    const wg = new THREE.ShapeGeometry(shape);
    wg.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(wg, MAT.water());
    this.water.userData.ownGeometry = true;
    this.water.position.set(P[0], SINK.waterY, P[2]);
    this.water.renderOrder = 5;
    this.water.name = 'iceWater';
    this.body.add(this.water);

    // floating cubes (logic cubes slide with the tilt)
    const nc = g.cubes?.length || 9;
    this.cubes = new THREE.InstancedMesh(fxGeometry('box'), fxMaterial('matte'), nc);
    this.cubes.name = 'floatingIce';
    for (let i = 0; i < nc; i++) this.cubes.setColorAt(i, _c.copy(ICE_A).lerp(ICE_B, (i % 3) / 3));
    this.body.add(this.cubes);

    // the tray (pivot at its bottom centre) with liquid, level vial, bubble, glove
    this.pivot = new THREE.Group();
    this.pivot.name = 'trayPivot';
    this.pivot.position.set(P[0], SINK.trayY, P[2]);
    this.body.add(this.pivot);
    this.tray = makeTray();
    this.pivot.add(this.tray);
    this.liqMat = this.own(new THREE.MeshLambertMaterial({ color: this.pcol, flatShading: true, name: 'VC_trayLiquid' }));
    this.liquid = new LiquidPrism({ shape: 'rect', w: SINK.trayW - 0.018, d: SINK.trayD - 0.018, name: 'trayLiquid' }, this.liqMat);
    this.liquid.mesh.position.y = 0.006;
    this.own(this.liquid);
    this.pivot.add(this.liquid.mesh);
    // frost crystals forming on the surface as it sets
    this.frost = new THREE.InstancedMesh(fxGeometry('octa'), MAT.crystal(this.pcol), 16);
    this.frost.name = 'frost';
    this.frostPts = [];
    for (let i = 0; i < 16; i++) this.frostPts.push([rnd(-0.15, 0.15), rnd(-0.085, 0.085), rnd(0, 6), rnd(0.6, 1.2), i / 16]);
    this.pivot.add(this.frost);
    // bubble in the vial
    const bubG = new THREE.SphereGeometry(0.011, 10, 6);
    bubG.scale(1.25, 0.6, 0.5);
    this.bubble = new THREE.Mesh(bubG, this.own(new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, name: 'VC_bubble' })));
    this.bubble.userData.ownGeometry = true;
    this.bubble.name = 'bubble';
    this.pivot.add(this.bubble);
    // warning glow behind the vial + direction chevron
    this.warnMat = this.own(new THREE.MeshBasicMaterial({ color: VC.bad, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, name: 'VC_warn' }));
    this.warn = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.044, 0.004), this.warnMat);
    this.warn.userData.ownGeometry = true;
    this.warn.position.set(0, SINK.trayH + 0.019, -SINK.trayD / 2 + 0.0175);
    this.warn.name = 'levelWarn';
    this.pivot.add(this.warn);
    const chev = new THREE.ConeGeometry(0.014, 0.03, 3);
    chev.rotateZ(-Math.PI / 2);            // points +X
    this.chevron = new THREE.Mesh(chev, MAT.flat(VC.mustard));
    this.chevron.userData.ownGeometry = true;
    this.chevron.name = 'chevron';
    this.pivot.add(this.chevron);

    this.glove = makeGlove();
    this.glove.scale.setScalar(1.1);
    this.pivot.add(this.glove);
    this.handX = 0;

    this.drops = new ParticlePool(this.body, { cap: 60, geo: 'ico', mat: 'liquid', gravity: -3, drag: 0.4, floorY: SINK.waterY, bounce: 0, killY: -1, name: 'drops' });
    this.own(this.drops);

    // input: a big horizontal plane at the tray rim (hover is enough to steer)
    const pg = new THREE.PlaneGeometry(3, 3);
    pg.rotateX(-Math.PI / 2);
    pg.translate(P[0], SINK.trayY + SINK.trayH, P[2]);
    this.plane = hitProxy(pg, 'coolPlane');
    this.root.add(this.plane);
    this._pick = [this.plane];
    this._dragPick = [this.plane];
    this.keyX = 0;
    this._keys = { l: false, r: false };
    this._lastSpills = g.spills || 0;
    this._update(0);
  }

  get hint() {
    const g = this.g;
    if (!g) return '';
    if (g.done) return 'Cooled and set';
    if (g.maxedFor > 0.2) return 'It’s tipping — move toward the bubble!';
    return 'Move left/right (or A / D) to press the tray level — keep the bubble centred';
  }

  _nx(x) { return 0.5 + (x / PER_HAND) / 2.4; }
  _steer(x) {
    if (!this.playable) return;
    this.keyX = clamp(x, -0.3, 0.3);
    this.g.pointerMove(this._nx(this.keyX), 0.6);
  }
  pointerDown(hit) {
    if (!hit || !this.playable) return false;
    this.dragging = true;
    this.keyX = clamp(hit.local.x - this.sink.x, -0.3, 0.3);
    this.g.pointerDown(this._nx(this.keyX), 0.6);
    return true;
  }
  pointerMove(hit) { if (hit) this._steer(hit.local.x - this.sink.x); }
  pointerUp() { if (this.dragging) { this.dragging = false; if (this.g?.pointer?.down) this.g.pointerUp(this._nx(this.keyX), 0.6); } }
  _releaseKeys() { this._keys.l = this._keys.r = false; }
  key(code, isDown) {
    const l = code === 'KeyA' || code === 'ArrowLeft', r = code === 'KeyD' || code === 'ArrowRight';
    if (!this._keyGate(code, isDown, l || r)) return false;
    this._keys[l ? 'l' : 'r'] = isDown;
    return true;
  }

  _update(dt) {
    const g = this.g;
    const dir = (this._keys.r ? 1 : 0) - (this._keys.l ? 1 : 0);
    if (dir && this.playable) this._steer(this.keyX + dir * KEY_SPEED * dt);

    const tilt = g.tilt || 0;
    const ang = -tilt * TILT_RAD;
    this.pivot.rotation.z = ang;

    // liquid stays level in the world: slope in tray space = −tan(angle)
    const lvl = 0.024 * (0.35 + 0.65 * (g.bath ?? 1));
    this.liquid.setTop(lvl, -Math.tan(ang), 0, SINK.trayH - 0.002);
    const k = clamp(g.progress, 0, 1);
    this.liqMat.color.set(mix('#8f6a3e', shade(this.pcol, 0.9), k));
    // frost
    for (let i = 0; i < this.frostPts.length; i++) {
      const [fx, fz, rot, sc, th] = this.frostPts[i];
      const on = clamp((k - th * 0.8) * 4, 0, 1);
      const yy = 0.006 + lvl - Math.tan(ang) * fx;
      _m.compose(_v.set(fx, Math.min(yy, SINK.trayH - 0.002) + 0.002, fz), _q.setFromAxisAngle(_s.set(0.2, 1, 0.1).normalize(), rot), _s.set(0.008 * sc * on, 0.004 * sc * on, 0.008 * sc * on));
      this.frost.setMatrixAt(i, _m);
    }
    this.frost.instanceMatrix.needsUpdate = true;

    // bubble (goes to the high side: right side down (tilt>0) → bubble left)
    this.bubble.position.set(-clamp(tilt, -1, 1) * 0.07, SINK.trayH + 0.019, -SINK.trayD / 2 + 0.0195);
    // warning + chevron
    const maxed = (g.maxedFor || 0) > 0.15;
    this.warnMat.opacity = maxed ? 0.45 + 0.45 * Math.abs(Math.sin(this.t * 14)) : 0;
    const needs = !g.done && Math.abs(tilt) > CENTRE;
    this.chevron.visible = needs;
    if (needs) {
      const d = -Math.sign(tilt);
      this.chevron.position.set(d * (0.155 + 0.008 * Math.sin(this.t * 10)), SINK.trayH + 0.019, -SINK.trayD / 2 + 0.018);
      this.chevron.rotation.set(0, 0, d > 0 ? 0 : Math.PI);
    }

    // glove: presses the side the player pushes (logic hand → x)
    this.handX = damp(this.handX, clamp((g.hand || 0) * PER_HAND, -0.16, 0.16), 14, dt);
    const press = this.dragging || Math.abs(g.hand || 0) > 0.05 ? 0.004 : 0;
    this.glove.position.set(this.handX, SINK.trayH + 0.02 - press, SINK.trayD / 2 + 0.016);
    this.glove.rotation.set(0.06, 0.25, 0);

    // floating cubes in the ice water (front and back strips)
    const W = SINK.w / 2 - 0.06;
    (g.cubes || []).forEach((c, i) => {
      const z = (c.row ? 1 : -1) * (SINK.trayD / 2 + 0.05) + (i % 3 - 1) * 0.01;
      const x = (c.x / 0.42) * W;
      const s = 0.03 * (c.s || 1);
      _m.compose(_v.set(this.sink.x + x, SINK.waterY + 0.006 + Math.sin(this.t * 2.2 + i) * 0.003, this.sink.z + z), _q.setFromAxisAngle(_s.set(0.3, 1, 0.2).normalize(), (c.r || 0) * 3 + c.x * 2), _s.set(s, s * 0.85, s));
      this.cubes.setMatrixAt(i, _m);
    });
    this.cubes.instanceMatrix.needsUpdate = true;

    // spills: slop over the low side
    const sp = g.spills || 0;
    if (sp > this._lastSpills) this._slop(26);
    this._lastSpills = sp;
    if ((g.maxedFor || 0) > 0.35 && Math.random() < dt * 20) this._slop(1);
    this.drops.update(dt);
  }

  _slop(n) {
    const side = Math.sign(this.g.tilt || 1);         // tilt > 0 → right side (+X) is down
    const ang = this.pivot.rotation.z;
    const x = side * (SINK.trayW / 2);
    const y = SINK.trayY + SINK.trayH + x * Math.sin(ang);
    for (let i = 0; i < n; i++) {
      this.drops.emit({ x: this.sink.x + x, y, z: this.sink.z + rnd(-0.09, 0.09), vx: side * rnd(0.15, 0.5), vy: rnd(0.2, 0.7), vz: rnd(-0.1, 0.1), life: rnd(0.8, 1.4), size: rnd(0.004, 0.008), color: this.liqMat.color.getStyle() });
    }
  }

  camera() {
    const S = this.sink;
    return { pos: new THREE.Vector3(S.x + 0.02, 0.6, 0.5), target: new THREE.Vector3(S.x, 0.06, S.z + 0.02), fov: 44 };
  }
  debugTargets() {
    return { kind: 'slide', point: [this.sink.x, SINK.trayY + SINK.trayH, this.sink.z], axis: [1, 0, 0], perHand: PER_HAND, d: this.g?.d ?? 0, tilt: this.g?.tilt ?? 0, done: !!this.g?.done };
  }
}
