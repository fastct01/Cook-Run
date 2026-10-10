// STIR presenter — the same stove + pot as heat (shared builder), lid off, a wooden spoon.
// Drag circles over the pot: the spoon follows, the liquid swirls into a vortex, and a
// rhythm ring pulses around the pot at the target tempo — mustard when you're off,
// green when your speed is right, red when you're too fast.
import * as THREE from 'three';
import { Presenter, damp, clamp } from './Presenter.js';
import { ParticlePool, FlameRing, rnd } from './fx.js';
import { STOVE, VC, MAT, kitMesh, buildStoveSet, knobAngle, swirlTexture, dragPlaneY, hitProxy, LAYOUT, lidPose } from './props.js';
import { makeGauge, dialForTemp } from './heat.js';
import { HEAT_T_MIN } from '../../cook/minigames/heat.js';
import { ASPECT } from '../../cook/minigames/Minigame.js';
import { mix, shade } from '../../assets/palette.js';

// must match stir.js
const CX = 0.42, CY = 0.56, SQUASH = 0.4;
const S = 3.0;
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export function makeSpoon(name = 'spoon') {
  // origin at the bowl tip (in the liquid), handle along +Y
  return kitMesh(name, (k) => {
    k.ico(VC.woodLight, 0.026, [0, 0.018, 0], { scale: [1, 1.25, 0.45], detail: 0 });
    k.box(VC.woodLight, [0.014, 0.25, 0.009], [0, 0.16, 0], { c: 0.003, taper: [0.8, 1] });
    k.box(VC.woodDark, [0.016, 0.03, 0.011], [0, 0.27, 0], { c: 0.003 });
    k.box(shade(VC.woodLight, 0.75), [0.02, 0.005, 0.0025], [0, 0.045, 0.0045]);      // stain line
  }, { seed: 37 });
}

export class StirPresenter extends Presenter {
  constructor(ctx) {
    super('stir', ctx);
    const g = this.g;
    // pot contents: what came out of the heat step, mixing toward this step's material
    const heatStep = this.recipe?.steps?.find((s) => s.type === 'heat') || null;
    const prev = heatStep && this.lab?._materialFor ? this.lab._materialFor(heatStep, this.recipe) : null;
    this.colA = prev?.color || this.material.color || '#c46b3c';
    this.colB = this.material.color || this.colA;

    // same knob scale as the heat step of this batch (so heat → stir doesn't pop)
    let scale = null;
    if (heatStep) {
      const hp = { bandMin: heatStep.bandMin ?? 180, bandMax: heatStep.bandMax ?? 220 };
      scale = { band: [dialForTemp(hp, hp.bandMin), dialForTemp(hp, hp.bandMax)], fire: dialForTemp(hp, heatStep.fireAt ?? 260) };
    }
    this.set = buildStoveSet({ lid: 'off', scale });
    this.body.add(this.set.group);
    const pb = this.set.potBase;
    this.potBase = pb;
    // lid comes off: from ajar (after heat) or on (fresh) to leaning against the stove
    this.lidFrom = lidPose(heatStep ? 'ajar' : 'on', this.set.potTop);
    this.lidTo = lidPose('off', this.set.potTop);
    this.lidK = 0;
    this.surfY = pb.y + STOVE.liquidY;
    this.set.knob.rotation.z = knobAngle(0.25);

    // vortex liquid: an inverted shallow cone (depth follows the stir speed) + swirl overlay
    const R = STOVE.potInnerR - 0.002;
    const cg = new THREE.ConeGeometry(R, 1, 16, 1, true);
    cg.rotateX(Math.PI);           // apex down
    cg.translate(0, -0.5, 0);      // rim at y = 0, apex at y = -1
    this.liqMat = this.own(new THREE.MeshLambertMaterial({ color: this.colA, flatShading: true, side: THREE.DoubleSide, name: 'VC_stirLiquid' }));
    this.liquid = new THREE.Mesh(cg, this.liqMat);
    this.liquid.userData.ownGeometry = true;
    this.liquid.position.set(pb.x, this.surfY, pb.z);
    this.liquid.name = 'stirLiquid';
    this.body.add(this.liquid);
    const tex = swirlTexture();
    this.swirlMat = this.own(new THREE.MeshBasicMaterial({ color: '#ffffff', map: tex, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide, name: 'VC_swirl' }));
    const sg = cg.clone();
    // planar UVs from x/z so the spiral texture maps onto the cone from above
    const p = sg.attributes.position, uv = sg.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2 * R), 0.5 - p.getZ(i) / (2 * R));
    this.swirl = new THREE.Mesh(sg, this.swirlMat);
    this.swirl.userData.ownGeometry = true;
    this.swirl.position.set(pb.x, this.surfY + 0.0015, pb.z);
    this.swirl.renderOrder = 3;
    this.swirl.name = 'swirl';
    this.body.add(this.swirl);

    // rhythm ring on the pot rim + a dot running at the target tempo
    this.ringMat = this.own(new THREE.MeshBasicMaterial({ color: VC.mustard, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false, side: THREE.DoubleSide, name: 'VC_rhythm' }));
    const rg = new THREE.RingGeometry(0.135, 0.15, 40, 1);
    rg.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(rg, this.ringMat);
    this.ring.userData.ownGeometry = true;
    this.ring.position.set(pb.x, pb.y + STOVE.potRimY + 0.004, pb.z);
    this.ring.renderOrder = 4;
    this.ring.name = 'rhythmRing';
    this.body.add(this.ring);
    this.dotMat = this.own(new THREE.MeshBasicMaterial({ color: '#fff1c4', toneMapped: false, name: 'VC_rhythmDot' }));
    this.dot = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), this.dotMat);
    this.dot.userData.ownGeometry = true;
    this.dot.name = 'rhythmDot';
    this.body.add(this.dot);

    // low flame under the pot
    const bw = LAYOUT.stove.stove;
    this.flames = new FlameRing(this.body, { count: 12, x: bw[0] + STOVE.burner[0], y: bw[1] + STOVE.burner[1] + 0.012, z: bw[2] + STOVE.burner[2], name: 'burnerFlames', seed: 3 });
    this.own(this.flames);

    // thermometer stays clipped on if this batch was heated (shows the cooling lab temp)
    if (heatStep) {
      const tMax = Math.ceil(((heatStep.fireAt ?? 260) + 40) / 10) * 10;
      this.gauge = makeGauge({ tMin: HEAT_T_MIN, tMax, bandMin: heatStep.bandMin ?? 180, bandMax: heatStep.bandMax ?? 220, fireAt: heatStep.fireAt ?? 260 }, this);
      this.gauge.group.position.set(pb.x + 0.11, pb.y + STOVE.potRimY + 0.035, pb.z + 0.085);
      this.gauge.group.rotation.set(-0.62, 0.38, 0, 'YXZ');
      this.body.add(this.gauge.group);
      this.needleA = this.gauge.angleFor(this.lab?.temp ?? 24);
    }

    this.spoon = makeSpoon();
    this.body.add(this.spoon);
    this.head = new THREE.Vector3(pb.x + 0.06, this.surfY + 0.004, pb.z - 0.02);
    this.dir = new THREE.Vector3(0.45, 1, 0.15).normalize();
    this.drops = new ParticlePool(this.body, { cap: 40, geo: 'ico', mat: 'liquid', gravity: -3, drag: 0.5, floorY: 0.003, bounce: 0, name: 'drops' });
    this.own(this.drops);

    this.plane = dragPlaneY(this.surfY, 3, pb.x, pb.z);
    this.root.add(this.plane);
    this.hit = hitProxy(new THREE.CylinderGeometry(0.17, 0.17, 0.2, 12).translate(pb.x, pb.y + 0.08, pb.z), 'potHit');
    this.body.add(this.hit);
    this._pick = [this.hit, this.spoon];
    this._dragPick = [this.plane];
    this._pointer = new THREE.Vector3().copy(this.head);
    this._lastWeighted = g.weighted || 0;
    this._vortex = 0;
    this._swirlA = 0;
    this._update(0);
  }

  get hint() {
    const g = this.g;
    if (!g) return '';
    if (g.done) return 'Mixed smooth';
    const z = g.zone;
    if (g.rps < 0.15) return 'Drag circles in the pot — match the pulsing ring';
    if (z === 'slow') return 'Faster — match the pulse';
    if (z === 'fast') return 'Slow down — you’ll slop it';
    return 'Good tempo — keep it steady';
  }

  _norm(local) {
    const dx = local.x - this.potBase.x, dz = local.z - this.potBase.z;
    return [CX + (dx * S) / ASPECT, CY + dz * S * SQUASH];
  }
  pointerDown(hit) {
    if (!hit || !this.playable) return false;
    const d = Math.hypot(hit.local.x - this.potBase.x, hit.local.z - this.potBase.z);
    if (d > 0.24) return false;
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
    const g = this.g, pb = this.potBase;
    const rps = g.rps || 0;
    const z = g.zone;

    // colour: mixes toward the new ingredient as you stir
    this.liqMat.color.set(mix(this.colA, this.colB, clamp(0.15 + g.progress * 0.6, 0, 1)));
    // vortex depth + swirl spin
    this._vortex = damp(this._vortex, clamp(rps / 1.6, 0, 1), 4, dt);
    this.liquid.scale.set(1, 0.002 + this._vortex * 0.03, 1);
    this.swirl.scale.copy(this.liquid.scale);
    this._swirlA += rps * Math.PI * 2 * dt;
    this.swirl.rotation.y = -(g._phase ?? this._swirlA);
    this.swirlMat.opacity = clamp(0.12 + this._vortex * 0.7, 0, 0.75);

    // rhythm ring
    const beat = (this.t * g.target) % 1;
    const pulse = 1 - beat;
    const active = rps > 0.15 && !g.done;
    const col = g.done ? VC.good : !active ? VC.mustard : z === 'good' ? VC.good : z === 'fast' ? VC.bad : VC.mustard;
    this.ringMat.color.set(col);
    this.ringMat.opacity = 0.35 + 0.6 * pulse * pulse;
    const s = 1 + 0.06 * pulse * pulse;
    this.ring.scale.set(s, 1, s);
    const ta = this.t * g.target * Math.PI * 2;
    this.dot.position.set(pb.x + Math.cos(ta) * 0.1425 * s, pb.y + STOVE.potRimY + 0.008, pb.z - Math.sin(ta) * 0.1425 * s);
    this.dot.visible = !g.done;

    // lid lifts off and is propped against the stove
    if (this.lidK < 1) {
      this.lidK = Math.min(1, this.lidK + dt * 1.8);
      const lk = this.lidK * this.lidK * (3 - 2 * this.lidK);
      const lp = this.set.lidPivot;
      lp.position.lerpVectors(this.lidFrom.pos, this.lidTo.pos, lk);
      lp.position.y += Math.sin(lk * Math.PI) * 0.08;
      lp.quaternion.slerpQuaternions(this.lidFrom.quat, this.lidTo.quat, lk);
    }

    // flame (steady low blue)
    this.flames.set(this.t, { radius: 0.11, height: 0.03, width: 0.018, color: '#1d58c8', inner: '#5aa8ff', lean: 0.3, jitter: 0.18 });

    // gauge shows the lab temperature cooling off
    if (this.gauge) {
      this.needleA = damp(this.needleA, this.gauge.angleFor(this.lab?.temp ?? 24), 6, dt);
      this.gauge.needle.rotation.z = this.needleA;
    }

    // spoon
    let headT, gripT;
    const R = STOVE.potInnerR * 0.62;
    if (this.dragging && !g.done) {
      const dx = this._pointer.x - pb.x, dz = this._pointer.z - pb.z;
      const d = Math.hypot(dx, dz) || 1;
      const k = Math.min(1, R / d);
      const ox = dx * k, oz = dz * k;
      headT = _v.set(pb.x + ox, this.surfY - 0.012, pb.z + oz);
      gripT = _w.set(pb.x + ox * 1.8 + 0.1, this.surfY + 0.17, pb.z + oz * 1.8 + 0.12);
    } else if (rps > 0.1 && !g.done) {
      const a = g._phase || 0;
      headT = _v.set(pb.x + Math.cos(a) * R * 0.6, this.surfY - 0.012, pb.z + Math.sin(a) * R * 0.6);
      gripT = _w.set(headT.x + 0.1, this.surfY + 0.17, headT.z + 0.12);
    } else {
      headT = _v.set(pb.x + 0.055, this.surfY - 0.006, pb.z - 0.01);
      gripT = _w.set(pb.x + 0.22, this.surfY + 0.13, pb.z + 0.08);
    }
    const r = this.dragging ? 28 : 6;
    this.head.set(damp(this.head.x, headT.x, r, dt), damp(this.head.y, headT.y, r, dt), damp(this.head.z, headT.z, r, dt));
    this.dir.lerp(gripT.sub(headT).normalize(), 1 - Math.exp(-r * dt)).normalize();
    this.spoon.position.copy(this.head);
    this.spoon.quaternion.setFromUnitVectors(UP, this.dir);
    // keep the spoon's flat face turned toward its travel direction
    this.spoon.rotateY(Math.atan2(this.head.x - pb.x, this.head.z - pb.z));

    // slosh: the logic docks quality on bumps (weighted drops) → splash out of the pot
    const w = g.weighted || 0;
    if (w < this._lastWeighted - 0.05) this._splash(16);
    this._lastWeighted = w;
    if (active && z === 'fast' && Math.random() < dt * 10) this._splash(1);
    this.drops.update(dt);
  }

  _splash(n) {
    const pb = this.potBase;
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), sp = rnd(0.25, 0.6);
      this.drops.emit({ x: pb.x + Math.cos(a) * 0.09, y: this.surfY + 0.01, z: pb.z - Math.sin(a) * 0.09, vx: Math.cos(a) * sp, vy: rnd(0.5, 1.0), vz: -Math.sin(a) * sp, life: rnd(1, 1.8), size: rnd(0.004, 0.007), color: this.liqMat.color.getStyle() });
    }
  }

  camera() {
    const pb = this.potBase;
    return { pos: new THREE.Vector3(pb.x + 0.08, 0.66, 0.46), target: new THREE.Vector3(pb.x + 0.05, 0.11, pb.z + 0.04), fov: 42 };
  }
  debugTargets() {
    return { kind: 'circle', center: [this.potBase.x, this.surfY, this.potBase.z], radius: 0.055, target: this.g?.target ?? 1, rps: this.g?.rps ?? 0, done: !!this.g?.done };
  }
}
