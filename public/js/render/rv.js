// ─────────────────────────────────────────────────────────────────────────────
// The hero RV: pose (x,y,z,yaw,pitch,roll), wheel spin + steer, suspension
// sway, lab vent smoke, fire glow, nitro flames, dust trail, brake lights,
// sparks on crashes. One rigged draw call + particles.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { ATLAS } from './textures.js';
import { buildRigProto, RigInstance } from './rig.js';
import { XATLAS } from './ents/atlas.js';

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _e = new THREE.Euler();
// roof geometry, RV-local (mirrors sim/roof.js ROOF_GEOM — kept local so the renderer never imports sim code)
const ROOF = { roofY: 3.11, hatch: { x: 0.15, z: -1.1 }, stance: { x: 0, z: -1.8 }, nozzle: { x: 0, y: 4.2, z: -1.8 }, hand: { x: 0, y: 4.55, z: -1.8 } };
const PAINT_HEX = ['#c94f6d', '#3e9e9a', '#d9b13a', '#7b62a8'];   // = assets paint_balloon variants
const PAINT = PAINT_HEX.map((h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; });
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);

export class RvView {
  constructor(scene, lib, particles, info) {
    this.lib = lib; this.particles = particles; this.info = info;
    const inst = lib.instance('rv', 0, { castShadow: true, receiveShadow: true });
    this.inst = inst;
    this.rig = inst.rig;
    this.outer = new THREE.Group();   // position + yaw
    this.tilt = new THREE.Group();    // pitch / roll / sway (around a mid-height pivot)
    this.outer.add(this.tilt); this.tilt.add(inst.root);
    scene.add(this.outer);
    // [van hook] RV-local frame (same transform as the RV model origin) for interior objects (VanLab3D)
    this.anchor = new THREE.Group();
    this.anchor.name = 'rvAnchor';
    this.tilt.add(this.anchor);
    this.ventOverride = null;        // [van hook] Vector3 in RV-local space: where vent smoke comes out
    this.suppressGlow = false;       // [van hook] skip the window fire-glow sprite (interior draws its own fire)
    this.roofDocOverride = null;     // [roof hook] true/false forces Doc-on-the-roof visuals; null = follow snap.rv.roofDoc
    const pb = inst.proto.partBox, parts = inst.proto.parts;
    if (inst.rig.named.window_glow && parts.window_glow === undefined) {
      inst.rig.named.window_glow.geometry.computeBoundingBox();
      const gb = inst.rig.named.window_glow.geometry.boundingBox;
      if (gb) this._glowFromNamed = gb.getCenter(new THREE.Vector3()).applyMatrix4(inst.rig.named.window_glow.matrix);
    }
    const wi = parts.wheel_fl ?? parts.wheel_rl;
    this.wheelR = wi !== undefined && !pb[wi].isEmpty() ? Math.max(0.25, (pb[wi].max.y - pb[wi].min.y) / 2) : 0.5;
    this.size = inst.size;
    this.anchor.position.y = -(this.size.h || 3.4) * 0.45;
    const a = inst.proto.anchors;
    const L = this.size.l || 8.6, H = this.size.h || 3.4;
    this.ventPos = a.vent ? a.vent.clone() : new THREE.Vector3(0.6, H + 0.4, -L * 0.3);
    this.exhaustPos = a.exhaust ? a.exhaust.clone() : new THREE.Vector3(0.7, 0.45, -L / 2);
    this.glowPos = parts.window_glow !== undefined && !pb[parts.window_glow].isEmpty() ? pb[parts.window_glow].getCenter(new THREE.Vector3()) : (this._glowFromNamed || new THREE.Vector3(-1.4, 2, -0.6));
    this.hasBrake = Object.keys(parts).some((n) => n.startsWith('light_brake'));
    this.brakeLights = [];
    for (const [n, i] of Object.entries(parts)) if (n.startsWith('light_brake') && !pb[i].isEmpty()) this.brakeLights.push(pb[i].getCenter(new THREE.Vector3()));
    if (!this.brakeLights.length) {
      const W = this.size.w || 2.6;
      this.brakeLights = [new THREE.Vector3(W / 2 - 0.3, 0.8, -L / 2 - 0.02), new THREE.Vector3(-W / 2 + 0.3, 0.8, -L / 2 - 0.02)];
    }
    this.wheelAng = 0; this.steerVis = 0;
    this.prevSpeed = 0; this.braking = 0;
    this.sway = 0; this.swayV = 0; this.pitchV = 0; this.pitchS = 0;
    this.time = 0;
    this.acc = { vent: 0, dust: 0, nitro: 0, fire: 0 };
    this.state = null;
    this.prevYaw = null;
    this.latAcc = 0;
  }

  get position() { return this.outer.position; }

  update(snap, dt) {
    const rv = snap.rv;
    if (!rv) return;
    // [expansion] share this frame's snapshot with the entity layer (set-piece states for the
    // tornado / car carrier) when WorldView doesn't pass it in the entities ctx
    const sc = this.outer.parent;
    if (sc) sc.userData.crSnap = snap;
    this.time += dt;
    const P = this.particles;
    this.outer.position.set(rv.x, rv.y, rv.z);
    this.outer.rotation.set(0, rv.yaw, 0);
    // yaw rate → lateral acceleration estimate for body roll sway (if sim doesn't give roll)
    let yawRate = 0;
    if (this.prevYaw != null && dt > 0) { let d = rv.yaw - this.prevYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yawRate = d / dt; }
    this.prevYaw = rv.yaw;
    const lat = snap.feel && typeof snap.feel.latAcc === 'number' ? snap.feel.latAcc : yawRate * rv.speed;
    this.latAcc = lat;
    // spring sway (visual only, small)
    const target = THREE.MathUtils.clamp(-lat * 0.006, -0.06, 0.06);
    this.swayV += ((target - this.sway) * 60 - this.swayV * 9) * dt;
    this.sway += this.swayV * dt;
    // accel/brake pitch
    const acc = dt > 0 ? (rv.speed - this.prevSpeed) / dt : 0;
    this.prevSpeed = rv.speed;
    const pt = THREE.MathUtils.clamp(acc * 0.004, -0.05, 0.035);
    this.pitchV += ((pt - this.pitchS) * 50 - this.pitchV * 8) * dt;
    this.pitchS += this.pitchV * dt;
    this.braking = acc < -3 && rv.speed > 0.5 ? 1 : Math.max(0, this.braking - dt * 4);
    const bump = (snap.feel && snap.feel.bump) || 0;
    const H = (this.size.h || 3.4) * 0.45;
    this.tilt.position.y = H; this.inst.root.position.y = -H; this.anchor.position.y = -H;
    const bob = bump * Math.sin(this.time * 31) * 0.03;
    this.tilt.rotation.set(-(rv.pitch || 0) - this.pitchS, 0, (rv.roll || 0) + this.sway, 'YXZ');
    this.tilt.position.y += bob;
    // wheels: spin + steer (front)
    this.wheelAng += (rv.speed * dt) / this.wheelR * (rv.airborne ? 0.98 : 1);
    this.steerVis += ((-(rv.steer || 0) * 0.45) - this.steerVis) * Math.min(1, dt * 10);
    _q.setFromAxisAngle(X, this.wheelAng);
    for (const w of this.inst.proto.wheels) this.rig.setRot(w, _q);
    _q2.setFromAxisAngle(Y, this.steerVis).multiply(_q);
    this.rig.setRot('wheel_fl', _q2); this.rig.setRot('wheel_fr', _q2);
    // tilt matrix for anchor → world
    this.outer.updateMatrixWorld(true);
    const M = this.inst.root.matrixWorld;
    const lab = snap.lab || {};
    // window glow when fire
    const fire = lab.fire || 0;
    const flick = fire > 0 ? (0.6 + 0.4 * Math.sin(this.time * 23) * Math.sin(this.time * 7.3)) : 0;
    this.rig.setEmit('window_glow', fire > 0 ? (0.8 + fire * 2.4) * flick + 0.3 : 0);
    const gm = this.rig.named.window_glow;      // ART's hidden transparent glow quads
    if (gm) {
      gm.visible = fire > 0.02;
      if (gm.visible) gm.material.opacity = Math.min(0.95, 0.35 + fire * 0.5) * (0.65 + 0.35 * flick);
    }
    const ventPos = this.ventOverride || this.ventPos;
    if (fire > 0.05) {
      if (!this.suppressGlow) {
        _v.copy(this.glowPos).applyMatrix4(M);
        P.once({ x: _v.x, y: _v.y, z: _v.z, cell: ATLAS.GLOW, size: 2.4 + fire * 2, r: 1, g: 0.5, b: 0.15, alpha: 0.55 * flick + 0.2, additive: true });
      }
      this.acc.fire += dt * (2 + fire * 10);
      while (this.acc.fire > 1) {
        this.acc.fire -= 1;
        _v.copy(ventPos).applyMatrix4(M);
        P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: (Math.random() - 0.5) * 0.6, vy: 1.6, vz: (Math.random() - 0.5) * 0.6, life: 2.4, size: 0.8, size1: 3.4, r: 0.22, g: 0.2, b: 0.2, alpha: 0.65, cell: ATLAS.PUFF, drag: 0.4 });
      }
    }
    // vent smoke (teal-tinted)
    if (lab.ventOpen && lab.cooking) {
      this.acc.vent += dt * (9 + (lab.fumes || 0) * 10);
      _v.copy(ventPos).applyMatrix4(M);
      const vx = -Math.sin(rv.yaw) * rv.speed * 0.55, vz = -Math.cos(rv.yaw) * rv.speed * 0.55;
      while (this.acc.vent > 1) {
        this.acc.vent -= 1;
        const g = 0.85 + Math.random() * 0.1;
        P.spawn({ x: _v.x + (Math.random() - 0.5) * 0.2, y: _v.y, z: _v.z + (Math.random() - 0.5) * 0.2, vx: vx + (Math.random() - 0.5), vy: 1.4 + Math.random() * 0.8, vz: vz + (Math.random() - 0.5), life: 2.6, size: 0.6, size1: 3.6, r: g * 0.8, g: g, b: g * 0.95, r1: 0.9, g1: 0.94, b1: 0.93, alpha: 0.55, cell: ATLAS.PUFF, drag: 1.1, spin: (Math.random() - 0.5) * 0.8 });
      }
    } else this.acc.vent = 0;
    // nitro flames
    if ((rv.nitro || 0) > 0) {
      this.acc.nitro += dt * 70;
      _v.copy(this.exhaustPos).applyMatrix4(M);
      const bx = -Math.sin(rv.yaw), bz = -Math.cos(rv.yaw);
      P.once({ x: _v.x + bx * 0.4, y: _v.y, z: _v.z + bz * 0.4, cell: ATLAS.GLOW, size: 2.0 + Math.random() * 0.4, r: 0.4, g: 0.7, b: 1, alpha: 0.9, additive: true });
      while (this.acc.nitro > 1) {
        this.acc.nitro -= 1;
        const sp = 6 + Math.random() * 5;
        P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: bx * sp + rv.speed * -bx * -0.9 + (Math.random() - 0.5), vy: (Math.random() - 0.3) * 0.8, vz: bz * sp + rv.speed * -bz * -0.9 + (Math.random() - 0.5), life: 0.28, size: 1.2, size1: 0.3, r: 1, g: 0.95, b: 0.75, r1: 1, g1: 0.35, b1: 0.08, alpha: 1, cell: ATLAS.FLAME, additive: true });
      }
    }
    // brake lights (model light_brake* parts if present; glow sprites either way)
    const brake = this.braking > 0.05 || (rv.speed < 0.6 && !rv.airborne && snap.phase === 'drive');
    this.rig.setEmitPrefix('light_brake', brake ? 3.0 : 0.25);
    if (brake && this.braking > 0.05) {
      for (const bl of this.brakeLights) {
        _v.copy(bl).applyMatrix4(M);
        P.once({ x: _v.x, y: _v.y, z: _v.z, cell: ATLAS.GLOW, size: 1.1, r: 1, g: 0.15, b: 0.08, alpha: 0.8, additive: true });
      }
    }
    // dust trail off-road / desert
    const z = rv.z;
    const sand = this.info.vis(z, 'sand') + this.info.vis(z, 'canyon') * 0.5;
    const off = rv.onRoad === false;
    const amount = rv.airborne ? 0 : (off ? 1 : sand * 0.35) * Math.min(1, rv.speed / 10);
    if (amount > 0.02) {
      this.acc.dust += dt * 26 * amount;
      const dc = this.info.color(z, 'roadside', new THREE.Color());
      while (this.acc.dust > 1) {
        this.acc.dust -= 1;
        const side = Math.random() < 0.5 ? -1 : 1;
        _v.set(side * (this.size.w || 2.6) * 0.45, 0.2, -(this.size.l || 8.6) * 0.38).applyMatrix4(M);
        P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: (Math.random() - 0.5) * 2, vy: 0.8 + Math.random(), vz: (Math.random() - 0.5) * 2, life: 1.8, size: 1.2, size1: 4.5, r: dc.r, g: dc.g * 0.95, b: dc.b * 0.85, alpha: 0.5 * (off ? 1 : 0.6), cell: ATLAS.PUFF, drag: 1.4 });
      }
    }
    // smoke when badly damaged
    if (rv.hp != null && rv.hp < 35) {
      if (Math.random() < dt * (35 - rv.hp) * 0.5) {
        _v.set(0, (this.size.h || 3.4) * 0.5, (this.size.l || 8.6) * 0.45).applyMatrix4(M);
        P.spawn({ x: _v.x, y: _v.y, z: _v.z, vy: 1.5, vx: -Math.sin(rv.yaw) * rv.speed * 0.4, vz: -Math.cos(rv.yaw) * rv.speed * 0.4, life: 2, size: 0.8, size1: 3, r: 0.3, g: 0.29, b: 0.28, alpha: 0.5, cell: ATLAS.PUFF, drag: 0.9 });
      }
    }
    // [expansion] Doc on the roof
    try { this._roofUpdate(snap, dt); } catch (e) { if (!this._roofWarned) { this._roofWarned = true; console.error('[rv] roof', e); } }
  }

  // ── [expansion] Doc on the roof, seen from outside (snap.rv.roofDoc) ─────
  // doc_roof stands behind the open roof_hatch, the water_hose reel and water_tank sit at their
  // rvMount spots (docs/assets-x/hazards.md). He turns to stop.roof.aimYaw, raises the nozzle to
  // aimPitch and, while `spray`, a water arc leaves the nozzle along its +Z.
  // `roofDocOverride` (true/false/null) lets another view force it (e.g. ROOF's own over-the-shoulder Doc).
  _roofProp(kind, partRe) {
    const root = this.lib.create(kind, 0);
    const proto = buildRigProto(root, partRe ? { partRe } : {});
    const rig = new RigInstance(proto, { castShadow: true, receiveShadow: true, depthRig: true });
    const mount = root.userData && root.userData.rvMount && root.userData.rvMount.pos;
    return { rig, proto, mount: mount ? new THREE.Vector3(...mount) : null };
  }
  _roofSetup() {
    const g = new THREE.Group(); g.name = 'roofProps';
    // under the RV model root: van mode (cook's cut-away) hides inst.root, and with it our roof Doc
    this.inst.root.add(g);
    const r = { group: g };
    r.hatch = this._roofProp('roof_hatch', /^(lid)$/);
    r.hose = this._roofProp('water_hose', /^(reel|nozzle)$/);
    r.tank = this._roofProp('water_tank', /^(valve)$/);
    r.doc = this._roofProp('doc_roof', /^(head|arm_l|arm_r|leg_l|leg_r)$/);
    r.hatch.rig.root.position.copy(r.hatch.mount || new THREE.Vector3(ROOF.hatch.x, ROOF.roofY, ROOF.hatch.z));
    r.hose.rig.root.position.copy(r.hose.mount || new THREE.Vector3(0.75, ROOF.roofY, -1.9));
    r.tank.rig.root.position.copy(r.tank.mount || new THREE.Vector3(0.55, ROOF.roofY, -3.1));
    r.docBase = new THREE.Vector3(ROOF.stance.x, ROOF.roofY, ROOF.stance.z);      // = sim/roof.js ROOF_GEOM.stance
    r.docPivot = new THREE.Group(); r.docPivot.add(r.doc.rig.root);
    g.add(r.hatch.rig.root, r.hose.rig.root, r.tank.rig.root, r.docPivot);
    r.up = 0; r.lid = 0; r.reel = 0; r.acc = 0;
    r.nozzleIdx = r.doc.proto.anchorPart.nozzle ?? r.doc.proto.parts.arm_r;
    r.fxSeen = new Map();
    this.roof = r;
    return r;
  }
  _roofUpdate(snap, dt) {
    const rv = snap.rv;
    const roof = (snap.stop && snap.stop.roof) || {};
    const want = this.roofDocOverride != null ? !!this.roofDocOverride : !!rv.roofDoc;
    const expansion = rv.roofDoc !== undefined || this.roofDocOverride != null;
    if (!expansion && !this.roof) return;
    const r = this.roof || this._roofSetup();
    r.group.visible = expansion;
    const mask = this.inst.rig.mesh.layers.mask;           // same layer as the RV body (hidden from cameras inside it)
    if (r.mask !== mask) { r.mask = mask; r.group.traverse((o) => { o.layers.mask = mask; }); }
    // climb: follow the sim's climb (0 inside … 1 standing) when given; else ease in/out on roofDoc
    const climb = typeof roof.climb === 'number' && this.roofDocOverride == null ? roof.climb : null;
    const target = climb != null ? (roof.active || want ? climb : 0) : want ? 1 : 0;
    r.up += (target - r.up) * Math.min(1, dt * (climb != null ? 12 : 1.6));
    r.lid += ((r.up > 0.02 || want || roof.active ? 1 : 0) - r.lid) * Math.min(1, dt * 5);
    r.hatch.rig.setRot('lid', _q.setFromEuler(_e.set(1.6 * r.lid, 0, 0, 'YXZ')));
    r.hatch.rig.root.visible = r.lid > 0.02;
    const up = THREE.MathUtils.smoothstep(r.up, 0.25, 1);
    r.docPivot.visible = up > 0.01;
    const yaw = roof.aimYaw ?? 0, pitch = roof.aimPitch ?? 0, spray = !!roof.spray && up > 0.95;
    r.yaw = r.yaw == null ? yaw : r.yaw + Math.atan2(Math.sin(yaw - r.yaw), Math.cos(yaw - r.yaw)) * Math.min(1, dt * 10);
    r.pitch = r.pitch == null ? pitch : r.pitch + (pitch - r.pitch) * Math.min(1, dt * 10);
    r.docPivot.position.set(r.docBase.x, r.docBase.y - 1.3 * (1 - up), r.docBase.z + 0.5 * (1 - up));   // rises out of the hatch
    r.docPivot.rotation.set(0, r.yaw, 0);
    const d = r.doc.rig;
    const brace = spray ? Math.sin(this.time * 30) * 0.015 : 0;
    const arm = -(r.pitch - 0.17) + brace;                  // the nozzle is held ~10° up at rest
    d.setRot('arm_r', _q.setFromEuler(_e.set(arm, 0, 0, 'YXZ')));
    d.setRot('arm_l', _q.setFromEuler(_e.set(arm * 0.95, 0, 0, 'YXZ')));
    d.setRot('head', _q.setFromEuler(_e.set(-r.pitch * 0.4, 0, 0, 'YXZ')));
    d.setRot('leg_l', _q.setFromEuler(_e.set(-0.18, 0, 0.06, 'YXZ')));      // braced stance
    d.setRot('leg_r', _q.setFromEuler(_e.set(0.22, 0, -0.06, 'YXZ')));
    d.commit();
    // hose reel unwinds while spraying; the reel's own nozzle is in Doc's hands
    if (spray) r.reel += dt * 2.5;
    r.hose.rig.setRot('reel', _q.setFromAxisAngle(X, r.reel));
    r.hose.rig.setScale('nozzle', up > 0.5 ? 0 : 1);
    r.tank.rig.setRot('valve', _q.setFromEuler(_e.set(0, 0, spray ? 1.57 : 0, 'YXZ')));
    for (const p of [r.hatch, r.hose, r.tank]) p.rig.commit();
    const van = this.suppressGlow || this.inst.root.visible === false;   // cook's cut-away draws its own
    if (expansion && !van) this._roofDevices(snap, roof, dt);
    if (!spray || van) { r.acc = 0; return; }
    // water jet: from the nozzle tip along the sim's aim (aimDirWorld: RV yaw + aimYaw, aimPitch), a near-straight
    // 20 m/s stream that droops at the end — what the hose cone test in sim/roof.js actually hits
    this.outer.updateMatrixWorld(true);
    const a = r.doc.proto.anchors.nozzle;
    if (a) { d.partPoint(r.nozzleIdx, a, _v); r.doc.rig.root.localToWorld(_v); }
    else { _v.set(ROOF.nozzle.x, ROOF.nozzle.y, ROOF.nozzle.z); this.inst.root.localToWorld(_v); }
    const ay = (rv.yaw || 0) + r.yaw, cp = Math.cos(r.pitch);
    _v2.set(Math.sin(ay) * cp, Math.sin(r.pitch), Math.cos(ay) * cp);
    const P = this.particles, sp = 20, G = 4.5;
    const vx = Math.sin(rv.yaw) * rv.speed, vz = Math.cos(rv.yaw) * rv.speed;
    const gy = (rv.y ?? 0) + 0.05;
    for (let i = 1; i <= 18; i++) {
      const t = i * 0.042;
      const px = _v.x + (_v2.x * sp + vx) * t, py = _v.y + _v2.y * sp * t - 0.5 * G * t * t, pz = _v.z + (_v2.z * sp + vz) * t;
      if (py < gy) break;
      P.once({ x: px, y: py, z: pz, cell: XATLAS.SOFT, size: 0.3 + t * 1.6, r: 0.92, g: 0.97, b: 1, alpha: 0.85 - t * 0.6 });
    }
    P.once({ x: _v.x + _v2.x * 0.3, y: _v.y + _v2.y * 0.3, z: _v.z + _v2.z * 0.3, cell: XATLAS.SPARK2, size: 0.7, rot: this.time * 9, r: 0.9, g: 0.97, b: 1, alpha: 0.9, additive: true });
    r.acc += dt * 110;
    while (r.acc > 1) {
      r.acc -= 1;
      const j = 0.05, s = sp * (0.9 + Math.random() * 0.15);
      P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: (_v2.x + (Math.random() - 0.5) * j) * s + vx, vy: (_v2.y + (Math.random() - 0.5) * j) * s, vz: (_v2.z + (Math.random() - 0.5) * j) * s + vz,
        gravity: G * 1.6, life: 1.1, size: 0.26, size1: 0.7, r: 0.9, g: 0.97, b: 1, alpha: 0.95, cell: Math.random() < 0.5 ? XATLAS.DROP : XATLAS.STREAK, floor: gy, drag: 0.5 });
      if (Math.random() < 0.25) P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: (_v2.x + (Math.random() - 0.5) * j) * s + vx, vy: (_v2.y + (Math.random() - 0.5) * j) * s, vz: (_v2.z + (Math.random() - 0.5) * j) * s + vz,
        gravity: G * 1.6, life: 0.9, size: 0.35, size1: 0.2, r: 0.7, g: 0.85, b: 1, alpha: 0.7, cell: XATLAS.SPARK2, additive: true, floor: gy, drag: 0.5 });
    }
  }

  // Thrown roof devices seen from outside (snap.stop.roof.fx, sim/roof.js):
  //   { id, device: 'firecracker'|'balloon'|'flare', phase: 'fly'|'land', x0, z0, x, z, t, T }
  _roofDevices(snap, roof, dt) {
    const list = roof.fx;
    if (!Array.isArray(list) || !list.length) return;
    const P = this.particles, rv = snap.rv, gy = (rv.y ?? 0);
    const seen = this.roof.fxSeen;
    const fx = this.outer.parent && this.outer.parent.userData.crFx;
    for (const f of list) {
      if (!f || typeof f.x !== 'number') continue;
      const key = f.id + ':' + f.phase;
      const first = !seen.has(key);
      seen.set(key, this.time);
      if (f.phase === 'fly') {
        const k = Math.max(0, Math.min(1, (f.t || 0) / Math.max(0.05, f.T || 1)));
        const x = f.x0 + (f.x - f.x0) * k, z = f.z0 + (f.z - f.z0) * k;
        const y = gy + ROOF.hand.y * (1 - k) + 0.2 * k + Math.sin(k * Math.PI) * (2 + 0.08 * Math.hypot(f.x - f.x0, f.z - f.z0));
        if (f.device === 'balloon') {
          const c = PAINT[(f.id >>> 0) % 4];
          P.once({ x, y, z, cell: ATLAS.GLOW, size: 0.75, r: c[0], g: c[1], b: c[2], alpha: 1 });
          P.once({ x, y, z, cell: ATLAS.GLOW, size: 0.45, r: Math.min(1, c[0] + 0.4), g: Math.min(1, c[1] + 0.4), b: Math.min(1, c[2] + 0.4), alpha: 0.9 });
        } else {
          const flare = f.device === 'flare';
          P.once({ x, y, z, cell: ATLAS.GLOW, size: flare ? 1.6 : 0.9, r: 1, g: flare ? 0.25 : 0.7, b: flare ? 0.15 : 0.3, alpha: 1, additive: true });
          if (Math.random() < 0.9) P.spawn({ x, y, z, vx: (Math.random() - 0.5) * 1.5, vy: Math.random(), vz: (Math.random() - 0.5) * 1.5, gravity: 5, life: 0.35, size: 0.2, size1: 0.06, r: 1, g: 0.8, b: 0.4, cell: ATLAS.GLOW, additive: true });
          if (flare) P.spawn({ x, y, z, vy: 0.5, life: 1.2, size: 0.5, size1: 1.8, r: 0.85, g: 0.55, b: 0.5, alpha: 0.5, cell: XATLAS.SOFT, drag: 1 });
        }
        continue;
      }
      // landed
      const age = f.t || 0, T = f.T || 1, live = Math.max(0, 1 - age / T);
      if (f.device === 'balloon') {
        const c = PAINT[(f.id >>> 0) % 4];
        P.once({ x: f.x, y: gy + 0.05, z: f.z, flat: true, cell: XATLAS.SPLAT, size: 2.8 * Math.min(1, 0.4 + age * 6), rot: (f.id % 7), r: c[0], g: c[1], b: c[2], alpha: 0.95 * Math.min(1, live * 4) });
        if (first) {
          for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 4; P.spawn({ x: f.x, y: gy + 0.3, z: f.z, vx: Math.cos(a) * s, vy: 1 + Math.random() * 3, vz: Math.sin(a) * s, gravity: 9.8, life: 0.7, size: 0.25, size1: 0.15, r: c[0], g: c[1], b: c[2], cell: XATLAS.DROP, floor: gy + 0.02 }); }
          if (fx) fx.popWord('SPLAT!', f.x, gy + 0.5, f.z, { fill: '#f1ead8', burst: PAINT_HEX[(f.id >>> 0) % 4], scale: 0.8 });
        }
      } else if (f.device === 'firecracker') {
        if (Math.random() < dt * 14 * live) {
          const ox = f.x + (Math.random() - 0.5) * 1.6, oz = f.z + (Math.random() - 0.5) * 1.6;
          P.spawn({ x: ox, y: gy + 0.3, z: oz, life: 0.12, size: 1.6, size1: 2.4, r: 1, g: 0.85, b: 0.5, alpha: 1, cell: XATLAS.FLASH, additive: true, fadeIn: 0 });
          for (let i = 0; i < 6; i++) { const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 5; P.spawn({ x: ox, y: gy + 0.3, z: oz, vx: Math.cos(a) * s, vy: 1 + Math.random() * 3, vz: Math.sin(a) * s, gravity: 12, life: 0.3, size: 0.2, size1: 0.06, r: 1, g: 0.9, b: 0.5, cell: ATLAS.GLOW, additive: true, floor: gy }); }
          P.spawn({ x: ox, y: gy + 0.4, z: oz, vy: 0.8, life: 1.2, size: 0.6, size1: 2, r: 0.8, g: 0.78, b: 0.75, alpha: 0.45, cell: XATLAS.SOFT, drag: 1 });
        }
        if (first && fx) fx.popWord('POP-POP!', f.x, gy + 0.5, f.z, { fill: '#ffd94a', burst: '#d8433a', scale: 0.8 });
      } else if (f.device === 'flare') {
        const fl = 0.75 + 0.25 * Math.sin(this.time * 31) * Math.sin(this.time * 7);
        P.once({ x: f.x, y: gy + 0.35, z: f.z, cell: ATLAS.GLOW, size: 3.2 * fl * Math.min(1, live * 3), r: 1, g: 0.25, b: 0.12, alpha: 1, additive: true });
        if (Math.random() < dt * 12 * Math.min(1, live * 2)) {
          const g = 0.82 + Math.random() * 0.1;
          P.spawn({ x: f.x + (Math.random() - 0.5) * 0.4, y: gy + 0.5, z: f.z + (Math.random() - 0.5) * 0.4, vx: (Math.random() - 0.5) * 1.2, vy: 1.4 + Math.random(), vz: (Math.random() - 0.5) * 1.2, life: 2.6, size: 0.8, size1: 4, r: g, g: g * 0.72, b: g * 0.7, alpha: 0.45, cell: ATLAS.PUFF, drag: 0.7, spin: (Math.random() - 0.5) * 0.5 });
        }
        if (first && fx) fx.popWord('FSSSH!', f.x, gy + 0.5, f.z, { fill: '#ffd94a', burst: '#9c4a32', scale: 0.8 });
      }
    }
    if (seen.size > 64) for (const [k, t] of seen) if (this.time - t > 3) seen.delete(k);
  }

  sparks(x, y, z, power = 1) {
    const P = this.particles;
    const n = Math.round(10 + power * 24);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 9 * (0.5 + power);
      P.spawn({ x, y: y + 0.8, z, vx: Math.cos(a) * s, vy: 2 + Math.random() * 6, vz: Math.sin(a) * s, gravity: 14, life: 0.45 + Math.random() * 0.3, size: 0.35, size1: 0.12, r: 1, g: 0.9, b: 0.55, r1: 1, g1: 0.45, b1: 0.1, cell: ATLAS.GLOW, additive: true, floor: 0.05 });
    }
    for (let i = 0; i < 6; i++) {
      P.spawn({ x: x + (Math.random() - 0.5) * 2, y: y + 0.5, z: z + (Math.random() - 0.5) * 2, vy: 1 + Math.random(), life: 1.4, size: 1.4, size1: 4, r: 0.55, g: 0.52, b: 0.5, alpha: 0.5, cell: ATLAS.PUFF, drag: 1.2 });
    }
  }

  dustBurst(x, y, z, n = 20) {
    const dc = this.info.color(z, 'roadside', new THREE.Color());
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 6;
      this.particles.spawn({ x: x + Math.cos(a) * 2, y: y + 0.3, z: z + Math.sin(a) * 3, vx: Math.cos(a) * s, vy: 0.5 + Math.random() * 1.5, vz: Math.sin(a) * s, life: 1.6, size: 1.6, size1: 5, r: dc.r, g: dc.g * 0.95, b: dc.b * 0.85, alpha: 0.55, cell: ATLAS.PUFF, drag: 2 });
    }
  }

  dispose() {
    this.outer.removeFromParent(); this.rig.dispose();
    if (this.roof) for (const p of [this.roof.hatch, this.roof.hose, this.roof.tank, this.roof.doc]) p.rig.dispose();
  }
}
