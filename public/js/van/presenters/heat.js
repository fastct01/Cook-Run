// HEAT presenter — camp stove + dented pot (lid ajar) + a chunky gas knob on the stove's
// sloped front panel + a dial thermometer clipped to the pot. Drag the knob (up/right =
// more gas) or hold A/D (←/→) to turn it → game.setDial(). Flame ring size/colour follows
// the dial; the needle follows the temperature; steam/bubbles scale with heat; the lid
// rattles when it's too hot; a local fire blooms around the pot when the lab is on fire.
import * as THREE from 'three';
import { Presenter, damp, clamp } from './Presenter.js';
import { ParticlePool, FlameRing, rnd } from './fx.js';
import { STOVE, VC, MAT, kitMesh, buildStoveSet, knobPose, knobAngle, addGaugeBody, gaugeTexture, GAUGE, hitProxy, LAYOUT, lidPose } from './props.js';
import { HEAT_T_MIN } from '../../cook/minigames/heat.js';
import { mix, shade } from '../../assets/palette.js';

const PER_DIAL = 0.13;        // metres of drag (along the panel's up+right) for the full dial range
const KEY_RATE = 0.42;        // dial units per second while A/D is held
const _v = new THREE.Vector3();
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
const BLUE = new THREE.Color('#1d58c8'), BLUE_IN = new THREE.Color('#5aa8ff');
const ORANGE = new THREE.Color('#f07a1c'), ORANGE_IN = new THREE.Color('#ffd36b');

/** Dial value whose equilibrium temperature is T (mirrors HeatGame._eq). */
export function dialForTemp(g, T) {
  const mid = (g.bandMin + g.bandMax) / 2;
  return clamp(((T - 40) * 0.55) / (mid - 40), 0, 1);
}

/** Dial thermometer group (body + textured face + needle). Shared with the stir presenter. */
export function makeGauge(params, owner) {
  const grp = new THREE.Group();
  grp.name = 'gauge';
  const body = kitMesh('gauge_body', (k) => addGaugeBody(k), { seed: 31 });
  grp.add(body);
  const tex = gaugeTexture(params);
  const fg = new THREE.CircleGeometry(GAUGE.R, 24);
  const face = new THREE.Mesh(fg, tex ? new THREE.MeshLambertMaterial({ map: tex, name: 'VC_gaugeFace' }) : MAT.flat('#efe7d2'));
  if (tex) owner.own(face.material);
  face.position.z = 0.0035;
  face.name = 'gauge_face';
  face.userData.ownGeometry = true;
  grp.add(face);
  const needle = kitMesh('gauge_needle', (k) => {
    k.box(VC.bad, [0.005, GAUGE.R * 0.86, 0.002], [0, GAUGE.R * 0.36, 0.006]);
    k.box(VC.bad, [0.008, 0.016, 0.002], [0, -0.008, 0.006]);
    k.cyl(VC.ink, 0.007, 0.007, 0.006, [0, 0, 0.007], { axis: 'z', seg: 8 });
  }, { seed: 33, shadows: false });
  grp.add(needle);
  // glass (catches a highlight)
  const gl = new THREE.Mesh(new THREE.CircleGeometry(GAUGE.R, 16), MAT.glassEdge());
  gl.material = MAT.glass();
  gl.position.z = 0.0105;
  gl.userData.ownGeometry = true;
  gl.renderOrder = 8;
  grp.add(gl);
  const angleFor = (temp) => {
    const f = clamp((temp - params.tMin) / (params.tMax - params.tMin), -0.02, 1.02);
    return (225 - 270 * f) * Math.PI / 180 - Math.PI / 2;     // needle built along +Y
  };
  return { group: grp, needle, angleFor };
}

export class HeatPresenter extends Presenter {
  constructor(ctx) {
    super('heat', ctx);
    const g = this.g;
    this.col = this.material.color || '#b4467a';
    const scale = { band: [dialForTemp(g, g.bandMin), dialForTemp(g, g.bandMax)], fire: dialForTemp(g, g.fireAt) };
    this.set = buildStoveSet({ lid: 'ajar', scale });
    this.body.add(this.set.group);
    const pb = this.set.potBase;
    this.potBase = pb;
    // the lid slides from 'on' (idle stove) to 'ajar' as the step starts
    this.lidFrom = lidPose('on', this.set.potTop);
    this.lidTo = lidPose('ajar', this.set.potTop);
    this.lidK = 0;

    // liquid surface (colour shifts with heat)
    this.liqMat = this.own(new THREE.MeshLambertMaterial({ color: this.col, flatShading: true, emissive: new THREE.Color(0, 0, 0), name: 'VC_potLiquid' }));
    const lg = new THREE.CircleGeometry(STOVE.potInnerR - 0.002, 14);
    lg.rotateX(-Math.PI / 2);
    this.liquid = new THREE.Mesh(lg, this.liqMat);
    this.liquid.userData.ownGeometry = true;
    this.liquid.position.set(pb.x, pb.y + STOVE.liquidY, pb.z);
    this.liquid.name = 'potLiquid';
    this.body.add(this.liquid);

    // burner flames (peek out around the pot base) + local fire
    const bw = LAYOUT.stove.stove;
    this.flames = new FlameRing(this.body, { count: 14, x: bw[0] + STOVE.burner[0], y: bw[1] + STOVE.burner[1] + 0.012, z: bw[2] + STOVE.burner[2], name: 'burnerFlames', seed: 2 });
    this.own(this.flames);
    this.fire = new FlameRing(this.body, { count: 9, x: pb.x, y: pb.y + 0.02, z: pb.z, name: 'potFire', seed: 5 });
    this.own(this.fire);

    // thermometer clipped to the pot's front-right, tilted toward Doc
    this.gauge = makeGauge({ tMin: HEAT_T_MIN, tMax: g.tMax, bandMin: g.bandMin, bandMax: g.bandMax, fireAt: g.fireAt }, this);
    this.gauge.group.position.set(pb.x + 0.11, pb.y + STOVE.potRimY + 0.035, pb.z + 0.085);
    this.gauge.group.rotation.set(-0.62, 0.38, 0, 'YXZ');
    this.body.add(this.gauge.group);
    this.needleA = this.gauge.angleFor(g.temp);

    // steam + bubbles
    this.steam = new ParticlePool(this.body, { cap: 40, geo: 'ico', mat: 'steam', gravity: 0.22, drag: 1.2, name: 'steam', renderOrder: 9 });
    this.bubbles = new ParticlePool(this.body, { cap: 30, geo: 'ico', mat: 'matte', gravity: 0.15, drag: 3, name: 'bubbles' });
    this.own(this.steam); this.own(this.bubbles);

    // knob input
    const kp = knobPose();
    this.kpos = kp.pos.clone().add(new THREE.Vector3(...bw));       // anchor space
    this.kUp = kp.up.clone();
    this.kRight = kp.right.clone();
    this.kNormal = kp.normal.clone();
    const kh = new THREE.CylinderGeometry(0.055, 0.055, 0.07, 10);
    kh.rotateX(Math.PI / 2);
    this.knobHit = hitProxy(kh, 'knobHit');
    this.knobHit.position.copy(this.kpos);
    this.knobHit.quaternion.copy(kp.quat);
    this.body.add(this.knobHit);
    const pg = new THREE.PlaneGeometry(3, 3);
    this.dragPlane = hitProxy(pg, 'knobPlane');
    this.dragPlane.position.copy(this.kpos).addScaledVector(this.kNormal, 0.03);
    this.dragPlane.quaternion.copy(kp.quat);
    this.root.add(this.dragPlane);
    this._pick = [this.set.knob, this.knobHit, this.set.body];
    this._dragPick = [this.dragPlane];
    this.dial = g.dial;
    this._drag = null;
    this._keys = { up: false, down: false };
    this._lidJig = 0;
    this._update(0);
  }

  get hint() {
    const g = this.g;
    if (!g) return '';
    if (g.done) return 'Held it — nice heat control';
    if (g.temp >= g.fireAt) return 'TOO HOT — turn the knob down!';
    return 'Drag the gas knob up/down (or A / D) — keep the needle in the green';
  }

  pointerDown(hit) {
    if (!hit || !this.playable) return false;
    const onKnob = hit.object === this.set.knob || hit.object === this.knobHit || hit.local.distanceTo(this.kpos) < 0.07;
    if (!onKnob) return false;
    this.dragging = true;
    this._drag = { p0: hit.local.clone(), d0: this.g.dial };
    return true;
  }
  pointerMove(hit) {
    if (!this.dragging || !this._drag || !hit) return;
    if (!this.playable) return;
    const d = _v.copy(hit.local).sub(this._drag.p0);
    const delta = (d.dot(this.kUp) + d.dot(this.kRight)) / PER_DIAL;
    this.g.setDial(this._drag.d0 + delta);
  }
  _endDrag() { this.dragging = false; this._drag = null; }
  _releaseKeys() { this._keys.up = this._keys.down = false; }
  key(code, isDown) {
    const up = code === 'KeyD' || code === 'ArrowRight' || code === 'ArrowUp' || code === 'Equal' || code === 'NumpadAdd';
    const down = code === 'KeyA' || code === 'ArrowLeft' || code === 'ArrowDown' || code === 'Minus' || code === 'NumpadSubtract';
    const wasHeld = this._keysHeld?.has(code);
    if (!this._keyGate(code, isDown, up || down)) return false;
    const k = up ? 'up' : 'down';
    if (isDown && !wasHeld) this.g.setDial(this.g.dial + (up ? 0.03 : -0.03));
    this._keys[k] = isDown;
    return true;
  }

  _update(dt) {
    const g = this.g;
    const pb = this.potBase;
    // held keys turn the knob continuously
    if (this.playable) {
      const dir = (this._keys.up ? 1 : 0) - (this._keys.down ? 1 : 0);
      if (dir) g.setDial(g.dial + dir * KEY_RATE * dt);
    }

    // knob follows the dial (slight lag = weight)
    this.dial = damp(this.dial, g.dial, 18, dt);
    this.set.knob.rotation.z = knobAngle(this.dial);

    // flames
    const d = this.dial;
    const hot = clamp((d - 0.55) / 0.35, 0, 1);
    const over = g.temp >= g.fireAt * 0.96 ? 1 : 0;
    _c1.copy(BLUE).lerp(ORANGE, Math.max(hot, over));
    _c2.copy(BLUE_IN).lerp(ORANGE_IN, Math.max(hot, over));
    this.flames.set(this.t, {
      radius: 0.108 + d * 0.006, height: d > 0.02 ? 0.02 + d * 0.055 : 0, width: 0.017 + d * 0.008,
      color: _c1, inner: _c2, lean: 0.28 + d * 0.15, jitter: 0.18 + hot * 0.25 + over * 0.4,
    });

    // local fire around the pot when the lab burns
    const fire = this.lab?.fire || 0;
    this.fire.set(this.t, fire > 0 ? {
      radius: 0.13, height: 0.06 + fire * 0.22, width: 0.07 + fire * 0.05, color: '#c8401a', inner: '#ff9a2a', lean: 0.15, jitter: 0.45,
    } : { height: 0 });

    // liquid colour: darker cold → brighter/greasier hot; overheating glows
    const heatF = clamp((g.temp - 60) / (g.bandMax - 60), 0, 1.4);
    this.liqMat.color.set(shade(this.col, 0.62 + heatF * 0.35));
    this.liqMat.emissive.setRGB(0.25 * over + 0.05 * Math.max(0, heatF - 1), 0.08 * over, 0);
    this.liquid.position.y = pb.y + STOVE.liquidY + Math.sin(this.t * 9) * 0.001 * heatF;

    // needle
    this.needleA = damp(this.needleA, this.gauge.angleFor(g.temp), 10, dt);
    this.gauge.needle.rotation.z = this.needleA + (over ? Math.sin(this.t * 60) * 0.03 : 0);

    // lid rattles when it's above the band
    const rattle = clamp((g.temp - g.bandMax) / Math.max(10, g.fireAt - g.bandMax), 0, 1.2);
    this._lidJig = damp(this._lidJig, rattle, 6, dt);
    const lp = this.set.lidPivot;
    this.lidK = Math.min(1, this.lidK + dt * 2.2);
    const lk = this.lidK * this.lidK * (3 - 2 * this.lidK);
    lp.position.lerpVectors(this.lidFrom.pos, this.lidTo.pos, lk);
    lp.quaternion.slerpQuaternions(this.lidFrom.quat, this.lidTo.quat, lk);
    lp.rotation.x += Math.sin(this.t * 37) * 0.025 * this._lidJig;
    lp.rotation.z += Math.abs(Math.sin(this.t * 23)) * 0.06 * this._lidJig;

    // steam from the lid gap (right side), bubbles in the visible liquid
    const gapX = pb.x + 0.075, gapZ = pb.z + 0.02;
    if (Math.random() < dt * (1.5 + Math.min(heatF, 1.1) * 10)) {
      this.steam.emit({ x: gapX + rnd(-0.03, 0.03), y: pb.y + STOVE.potRimY + 0.02, z: gapZ + rnd(-0.04, 0.04), vx: rnd(-0.03, 0.06), vy: rnd(0.04, 0.09) * (0.6 + Math.min(heatF, 1.1)), vz: rnd(-0.02, 0.04), life: rnd(0.8, 1.2), size: 0.006 + Math.min(heatF, 1.1) * 0.004, grow: 2.8, color: '#fbf8f2' });
    }
    const boil = clamp((g.temp - 100) / Math.max(10, g.bandMax - 100), 0, 1.5);
    if (Math.random() < dt * boil * 40) {
      const a = rnd(-1.2, 1.2), r = rnd(0.02, 0.09);
      this.bubbles.emit({ x: pb.x + Math.cos(a) * r, y: pb.y + STOVE.liquidY + 0.002, z: pb.z - Math.sin(a) * r * 0.6 + 0.02, vy: 0.01, life: rnd(0.25, 0.5), size: rnd(0.004, 0.008), grow: 1.6, color: mix(this.col, '#ffffff', 0.45) });
    }
    this.steam.update(dt);
    this.bubbles.update(dt);
  }

  camera() {
    const pb = this.potBase;
    return { pos: new THREE.Vector3(pb.x + 0.1, 0.66, 0.5), target: new THREE.Vector3(pb.x + 0.07, 0.11, pb.z + 0.05), fov: 44 };
  }
  debugTargets() {
    const tip = this.kpos.clone().addScaledVector(this.kNormal, 0.03);
    return {
      kind: 'knob', point: tip.toArray(), up: this.kUp.toArray(), right: this.kRight.toArray(), perDial: PER_DIAL,
      dial: this.g?.dial ?? 0, temp: this.g?.temp ?? 0, bandMin: this.g?.bandMin, bandMax: this.g?.bandMax, done: !!this.g?.done,
    };
  }
}
