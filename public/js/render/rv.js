// ─────────────────────────────────────────────────────────────────────────────
// The hero RV: pose (x,y,z,yaw,pitch,roll), wheel spin + steer, suspension
// sway, lab vent smoke, fire glow, nitro flames, dust trail, brake lights,
// sparks on crashes. One rigged draw call + particles.
// [wreck] explode(ev) / snap.rv.wrecked: the body chars black, two wheels and the roof vent, AC box,
// door and side panels fly off as debris meshes, secondary explosions (via scene.userData.crFx), and
// the wreck keeps burning: flames through the windows, a thick black smoke column, embers, scorch.
// onBoom(x, y, z, power) lets the owner (WorldView) add camera shake / audio to each blast.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { ATLAS } from './textures.js';
import { buildRigProto, RigInstance } from './rig.js';
import { XATLAS } from './ents/atlas.js';
import { RookRoofView } from './ents/rookRoof.js';   // R3-DEFEND: Rook + guns on the roof
import { GunFx, dirOf } from './ents/gunfx.js';       // R3-DEFEND: tracers, sparks, casings

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
    this.wreck = null;               // [wreck] state once the RV has blown up
    this.onBoom = null;              // [wreck] (x, y, z, power) → camera shake / audio for each blast
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
    if (this.wreck) {
      // blown tyres (front left, rear right gone): the body slumps onto that diagonal
      const t = this.wreck.t, k = Math.min(1, t / 0.7);
      // the blast pops the body up ~0.9 m (one little bounce), then it settles
      const hop = t < 0.85 ? 4.2 * t - 4.9 * t * t : t < 1.15 ? 0.6 * (t - 0.85) - 2 * (t - 0.85) * (t - 0.85) : 0;
      this.tilt.rotation.x += 0.035 * k + (t < 0.85 ? 0.12 * Math.sin(t / 0.85 * Math.PI) : 0);
      this.tilt.rotation.z += 0.075 * k;
      this.tilt.position.y += Math.max(0, hop) - 0.22 * k;
    }
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
    const fire = this.wreck ? 1 : lab.fire || 0;
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
    if (lab.ventOpen && lab.cooking && !this.wreck) {
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
    const brake = !this.wreck && (this.braking > 0.05 || (rv.speed < 0.6 && !rv.airborne && snap.phase === 'drive'));
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
    // [wreck] blown up: char, debris, secondaries, the burning wreck
    if (rv.wrecked && !this.wreck) this.explode({ x: rv.x, y: rv.y, z: rv.z, yaw: rv.yaw });
    if (this.wreck) { try { this._wreckUpdate(snap, dt, M); } catch (e) { if (!this._wreckWarned) { this._wreckWarned = true; console.error('[rv] wreck', e); } } }
    // smoke when badly damaged
    else if (rv.hp != null && rv.hp < 35) {
      if (Math.random() < dt * (35 - rv.hp) * 0.5) {
        _v.set(0, (this.size.h || 3.4) * 0.5, (this.size.l || 8.6) * 0.45).applyMatrix4(M);
        P.spawn({ x: _v.x, y: _v.y, z: _v.z, vy: 1.5, vx: -Math.sin(rv.yaw) * rv.speed * 0.4, vz: -Math.cos(rv.yaw) * rv.speed * 0.4, life: 2, size: 0.8, size1: 3, r: 0.3, g: 0.29, b: 0.28, alpha: 0.5, cell: ATLAS.PUFF, drag: 0.9 });
      }
    }
    // [expansion] Doc on the roof
    try { this._roofUpdate(snap, dt); } catch (e) { if (!this._roofWarned) { this._roofWarned = true; console.error('[rv] roof', e); } }
    try { if (this.outer.parent) GunFx.of(this.outer.parent, this.particles).update(dt); } catch (e) { if (!this._gfxWarned) { this._gfxWarned = true; console.error('[rv] gun fx', e); } }   // R3-DEFEND
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
    if (rv.roofRook !== undefined || (snap.roof && 'gun' in snap.roof)) { this._rookRoofUpdate(snap, dt); return; }   // R3-DEFEND: Rook + guns replace Doc + hose
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

  // ── R3-DEFEND: Rook on the roof (snap.rv.roofRook / snap.roof = sim/roof.js state()) ─────────────
  // The roof props stay (hatch, hose reel, tank); Doc never climbs up. The hatch lid opens while Rook is
  // up or climbing; RookRoofView (ents/rookRoof.js) draws him with the gun of snap.roof.gun aimed along
  // aimYaw/aimPitch, and the thrown devices from snap.roof.fx still draw here.
  _rookRoofUpdate(snap, dt) {
    const rv = snap.rv, roof = snap.roof || (snap.stop && snap.stop.roof) || {};
    const r = this.roof || this._roofSetup();
    r.group.visible = true;
    const mask = this.inst.rig.mesh.layers.mask;
    if (r.mask !== mask) { r.mask = mask; r.group.traverse((o) => { o.layers.mask = mask; }); }
    const want = !!(roof.active || rv.roofRook);
    r.lid += ((want ? 1 : 0) - r.lid) * Math.min(1, dt * 5);
    r.hatch.rig.setRot('lid', _q.setFromEuler(_e.set(1.6 * r.lid, 0, 0, 'YXZ')));
    r.hatch.rig.root.visible = r.lid > 0.02;
    r.docPivot.visible = false;
    r.hose.rig.setScale('nozzle', 1);
    for (const p of [r.hatch, r.hose, r.tank]) p.rig.commit();
    if (!this.rook) this.rook = new RookRoofView(this, this.lib, this.particles);
    this.rook.update(snap, roof, dt, r.group);
    const van = this.suppressGlow || this.inst.root.visible === false;
    if (!van) this._roofDevices(snap, roof, dt);
  }
  /** R3-DEFEND: snapshot events forwarded by WorldView._event (both roles). */
  event(ev, snap) {
    if (!ev || !ev.type) return;
    if (ev.type === 'shot' || ev.type === 'reload') {
      if (!this.rook) this.rook = new RookRoofView(this, this.lib, this.particles);
      this.rook.event(ev);
    } else if (ev.type === 'copShot' && ev.hit && Number.isFinite(ev.tx) && this.outer.parent) {
      // a cop's round hits the RV / the roof next to Rook: sparks (never anything on a person)
      GunFx.of(this.outer.parent, this.particles).impact(ev.tx, ev.ty, ev.tz, 'rv', { dir: dirOf(ev.x, ev.y, ev.z, ev.tx, ev.ty, ev.tz) });
    }
    void snap;
  }

  // ── [wreck] the RV blows up ─────────────────────────────────────────────
  /** Start the wreck (idempotent): ev = { x, y, z, yaw } (EV.RV_EXPLODE or the snapshot's RV pose). */
  explode(ev = {}) {
    if (this.wreck) return false;
    const rv = { x: ev.x ?? this.outer.position.x, y: ev.y ?? this.outer.position.y, z: ev.z ?? this.outer.position.z, yaw: ev.yaw ?? this.outer.rotation.y };
    const scene = this.outer.parent;
    const W = this.wreck = {
      t: 0, x: rv.x, y: rv.y, z: rv.z, yaw: rv.yaw, debris: [], acc: { fire: 0, smoke: 0, ember: 0, lick: 0 },
      booms: [[0.22, 0.5, [0.9, 2.2, 2.6]], [0.55, 0.55, [-1.0, 2.6, -2.8]], [1.05, 0.65, [0.2, 3.0, -0.6]], [1.7, 0.42, [-0.8, 1.4, 3.4]], [2.6, 0.5, [0.7, 2.4, -3.9]], [4.2, 0.35, [-0.4, 2.8, 0.9]]],
      color: new THREE.Color(1, 1, 1),
    };
    // wheels blown off (they fly away as debris below)
    for (const w of ['wheel_fl', 'wheel_rr']) this.rig.setScale(w, 0);
    if (scene) {
      W.group = new THREE.Group(); W.group.name = 'rvWreckDebris';
      scene.add(W.group);
      this._spawnDebris(W);
    }
    const fx = scene && scene.userData.crFx;
    if (fx) {
      _v.set(rv.x, rv.y + 0.4, rv.z);
      fx.explosion(_v.x, _v.y, _v.z, 1.25);
      fx.scorch(rv.x, rv.y, rv.z, 6.5);
    }
    if (this.onBoom) { try { this.onBoom(rv.x, rv.y, rv.z, 1); } catch (e) { /* best effort */ } }
    return true;
  }

  _spawnDebris(W) {
    const L = this.size.l || 8.6, Wd = this.size.w || 2.6, H = this.size.h || 3.4;
    const c = Math.cos(W.yaw), s = Math.sin(W.yaw);
    const mat = (hex) => new THREE.MeshLambertMaterial({ color: new THREE.Color(hex).lerp(new THREE.Color('#1a1714'), 0.35), flatShading: true });
    const mats = {
      body: mat('#e9e2cf'), teal: mat('#4f8f8a'), door: mat('#9c4a32'), tyre: mat('#1d1c1b'), hub: mat('#8f8a7c'),
      pipe: mat('#9b9890'), ac: mat('#ddd5c1'), char: new THREE.MeshLambertMaterial({ color: '#1b1816', flatShading: true }),
    };
    W.mats = Object.values(mats);
    W.geos = [];
    const geo = (g) => { W.geos.push(g); return g; };
    const wheel = () => {
      const g = new THREE.Group();
      const t = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.46, 0.46, 0.3, 12).rotateZ(Math.PI / 2)), mats.tyre);
      const h = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.24, 0.24, 0.32, 8).rotateZ(Math.PI / 2)), mats.hub);
      g.add(t, h); return g;
    };
    const panel = (w, h, d, stripe) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(geo(new THREE.BoxGeometry(w, h, d)), stripe === 'door' ? mats.door : mats.body));
      if (stripe === true) { const st = new THREE.Mesh(geo(new THREE.BoxGeometry(w + 0.02, h * 0.3, d * 1.01)), mats.teal); st.position.y = -h * 0.3; g.add(st); }
      const burnt = new THREE.Mesh(geo(new THREE.BoxGeometry(w + 0.03, h * 0.35, d * 0.5)), mats.char); burnt.position.set(0, h * 0.32, d * 0.2); g.add(burnt);
      return g;
    };
    const vent = () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(geo(new THREE.CylinderGeometry(0.09, 0.09, 0.7, 7)), mats.pipe));
      const cap = new THREE.Mesh(geo(new THREE.ConeGeometry(0.2, 0.12, 7)), mats.char); cap.position.y = 0.42; g.add(cap);
      const base = new THREE.Mesh(geo(new THREE.BoxGeometry(0.52, 0.1, 0.52)), mats.hub); base.position.y = -0.36; g.add(base);
      return g;
    };
    // [mesh, local pos (x right, y up, z forward), local velocity, spin rate, size (bounce radius), trails fire]
    const R = Math.random;
    const list = [
      [wheel(), [-Wd / 2, 0.46, 3.12], [-7, 9, 5], 9, 0.46, true],
      [wheel(), [Wd / 2, 0.46, -1.75], [8, 11, -1.5], 11, 0.46, true],
      [vent(), [-0.55, H, -2.4], [-1.5, 19, -2.5], 7, 0.35, true],
      [panel(0.92, 0.3, 1.1, false), [0, H, 0.35], [2.5, 14, 3], 5, 0.3, true],
      [panel(0.08, 1.7, 0.75, 'door'), [-Wd / 2 - 0.05, 1.5, 0.9], [-12, 7, 1.5], 6, 0.5, false],
      [panel(0.07, 1.1, 1.9, true), [Wd / 2 + 0.05, 1.6, -2.6], [11, 8, 0], 5, 0.5, true],
      [panel(0.07, 1.0, 1.5, true), [-Wd / 2 - 0.05, 1.7, -1.2], [-10, 10, -1], 6, 0.5, false],
      [panel(1.6, 0.06, 1.4, false), [0.3, H + 0.05, -3.4], [3, 15, -1.5], 4, 0.4, true],
      [panel(0.07, 0.8, 1.2, true), [Wd / 2 + 0.05, 1.4, 1.9], [9, 6, 4], 7, 0.4, false],
    ];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(geo(new THREE.BoxGeometry(0.15 + R() * 0.35, 0.05 + R() * 0.12, 0.2 + R() * 0.4)), R() < 0.5 ? mats.char : mats.body);
      const a = R() * Math.PI * 2;
      list.push([m, [(R() - 0.5) * Wd, 1 + R() * 2, (R() - 0.5) * L * 0.8], [Math.cos(a) * (6 + R() * 8), 6 + R() * 10, Math.max(-3, Math.sin(a) * (6 + R() * 8))], 10, 0.12, false]);
    }
    for (const [mesh, lp, lv, spin, rad, trail] of list) {
      mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      // RV-local → world (yaw only; forward = (sin yaw, cos yaw))
      const wx = W.x + lp[0] * c + lp[2] * s, wz = W.z - lp[0] * s + lp[2] * c;
      mesh.position.set(wx, W.y + lp[1], wz);
      mesh.rotation.set(0, W.yaw, 0);
      const vx = lv[0] * c + lv[2] * s, vz = -lv[0] * s + lv[2] * c;
      const k = 0.85 + R() * 0.3;
      W.group.add(mesh);
      W.debris.push({
        mesh, vx: vx * k, vy: lv[1] * k, vz: vz * k, rad, trail, rest: false, acc: 0,
        wx: (R() - 0.5) * spin, wy: (R() - 0.5) * spin, wz: (R() - 0.5) * spin, burnT: trail ? 5 + R() * 6 : 1.5 + R() * 2,
      });
    }
  }

  _wreckUpdate(snap, dt, M) {
    const W = this.wreck, P = this.particles, R = Math.random;
    W.t += dt;
    const t = W.t;
    const scene = this.outer.parent, fx = scene && scene.userData.crFx;
    // charring: the body goes black over ~0.6 s (a faint warm undertone)
    const ck = Math.min(1, t / 0.6);
    W.color.setRGB(1 - 0.84 * ck, 1 - 0.855 * ck, 1 - 0.865 * ck);
    this.rig.tint(W.color);
    for (const w of ['wheel_fl', 'wheel_rr']) this.rig.setScale(w, 0);
    // secondary explosions
    for (const b of W.booms) {
      if (b.done || t < b[0]) continue;
      b.done = true;
      _v.set(b[2][0], b[2][1], b[2][2]).applyMatrix4(M);
      if (fx) fx.explosion(_v.x, _v.y - 0.8, _v.z, b[1]);
      if (this.onBoom) { try { this.onBoom(_v.x, _v.y, _v.z, b[1]); } catch (e) { /* */ } }
    }
    // the fire: strong for ~15 s, then a steady blaze
    const blaze = t < 15 ? 1 : Math.max(0.55, 1 - (t - 15) / 40);
    const L = this.size.l || 8.6, Wd = this.size.w || 2.6, H = this.size.h || 3.4;
    const wind = 0.9;
    W.acc.fire += dt * 55 * blaze;
    while (W.acc.fire > 1) {
      W.acc.fire -= 1;
      // licks out of the windows / roof, biased to the coach box
      const top = R() < 0.55;
      const lx = top ? (R() - 0.5) * Wd * 0.8 : (R() < 0.5 ? -1 : 1) * (Wd / 2 + 0.05);
      const ly = top ? H - 0.1 + R() * 0.2 : 1.5 + R() * 1.2;
      const lz = -L * 0.45 + R() * L * 0.75;
      _v.set(lx, ly, lz).applyMatrix4(M);
      const out = top ? 0 : Math.sign(lx) * 1.2;
      _v2.set(out, 0, 0).transformDirection(M);
      // mostly solid orange flame bodies (normal blend keeps the colour), some additive hot spots
      const hot = R() < 0.35;
      P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: _v2.x * 1.4 + (R() - 0.5) * 0.8 + wind * 0.3, vy: 2.4 + R() * 2.2, vz: _v2.z * 1.4 + (R() - 0.5) * 0.8,
        life: 0.55 + R() * 0.55, size: 1.1 + R() * 0.9, size1: 2.6 + R() * 1.8,
        r: 1, g: hot ? 0.7 : 0.55, b: hot ? 0.3 : 0.12, r1: hot ? 0.7 : 0.3, g1: hot ? 0.14 : 0.08, b1: 0.03, alpha: hot ? 0.6 : 0.95,
        cell: hot ? ATLAS.FLAME : ATLAS.PUFF, additive: hot, drag: 0.8, gravity: -1.2, spin: (R() - 0.5) * 2, fadeIn: 0.05 });
    }
    // inner glow (big soft orange billboards through the body)
    const fl = 0.75 + 0.25 * Math.sin(t * 17) * Math.sin(t * 6.1 + 0.7);
    for (const zz of [-2.6, 0, 2.4]) {
      _v.set(0, H * 0.75, zz).applyMatrix4(M);
      P.once({ x: _v.x, y: _v.y, z: _v.z, cell: ATLAS.GLOW, size: 6 * fl * blaze, r: 1, g: 0.4, b: 0.1, alpha: 0.4, additive: true });
    }
    // thick black smoke column
    W.acc.smoke += dt * 16 * (0.6 + 0.4 * blaze);
    while (W.acc.smoke > 1) {
      W.acc.smoke -= 1;
      _v.set((R() - 0.5) * Wd * 0.8, H + 0.4, -L * 0.4 + R() * L * 0.7).applyMatrix4(M);
      const d = 0.05 + R() * 0.07;
      P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: wind + (R() - 0.5) * 1.2, vy: 3.6 + R() * 2.4, vz: (R() - 0.5) * 1.2,
        life: 6.5 + R() * 3, size: 2.2 + R() * 1.5, size1: 11 + R() * 7, r: d, g: d * 0.96, b: d * 0.92, alpha: 1,
        cell: ATLAS.PUFF, drag: 0.12, gravity: -0.15, spin: (R() - 0.5) * 0.4, fadeIn: 0.4 });
    }
    // embers drifting up
    W.acc.ember += dt * 14;
    while (W.acc.ember > 1) {
      W.acc.ember -= 1;
      _v.set((R() - 0.5) * Wd, H * 0.6 + R() * H * 0.5, (R() - 0.5) * L * 0.8).applyMatrix4(M);
      P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: wind * 1.5 + (R() - 0.5) * 2, vy: 3 + R() * 4, vz: (R() - 0.5) * 2, life: 1.5 + R() * 1.5, size: 0.22, size1: 0.06,
        r: 1, g: 0.8, b: 0.35, r1: 1, g1: 0.3, b1: 0.05, cell: ATLAS.GLOW, additive: true, drag: 0.5, spin: 3 });
    }
    // ground fire patches around the wreck
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + 0.4;
      _v.set(Math.cos(a) * (Wd * 0.7 + 0.5), 0.15, Math.sin(a) * L * 0.42).applyMatrix4(M);
      const f2 = 0.7 + 0.3 * Math.sin(t * 13 + i * 2.1);
      P.once({ x: _v.x, y: W.y + 0.6, z: _v.z, cell: ATLAS.FLAME, size: 1.6 * f2 * blaze, r: 1, g: 0.6, b: 0.2, alpha: 0.85, additive: true });
    }
    if (fx) { _v.set(0, H + 3.5, 0).applyMatrix4(M); fx.burn = { x: _v.x, y: _v.y, z: _v.z, k: blaze }; }
    // debris: ballistic, spin, bounce, then smoulder
    const gy = (z) => { const s = fx && fx.track ? fx.track.surfaceY(z) : null; return s == null || !Number.isFinite(s) || Math.abs(s - W.y) > 3 ? W.y : s; };
    for (const d of W.debris) {
      const m = d.mesh;
      d.burnT -= dt;
      if (!d.rest) {
        d.vy -= 9.81 * dt;
        m.position.x += d.vx * dt; m.position.y += d.vy * dt; m.position.z += d.vz * dt;
        m.rotation.x += d.wx * dt; m.rotation.y += d.wy * dt; m.rotation.z += d.wz * dt;
        const g = gy(m.position.z) + d.rad * 0.5;
        if (m.position.y < g) {
          m.position.y = g;
          if (Math.abs(d.vy) < 2.2) { d.rest = true; m.rotation.x = Math.round(m.rotation.x / Math.PI) * Math.PI; m.rotation.z = Math.round(m.rotation.z / (Math.PI / 2)) * (Math.PI / 2); m.position.y = gy(m.position.z) + d.rad * (d.rad > 0.4 ? 0.35 : 0.3); }
          else { d.vy = -d.vy * 0.32; d.vx *= 0.55; d.vz *= 0.55; d.wx *= 0.5; d.wy *= 0.5; d.wz *= 0.5; if (P && d.rad > 0.25) this.dustBurst(m.position.x, g - 0.3, m.position.z, 5); }
        }
      }
      // trails: fire + smoke while flying, smoulder after landing
      const burning = d.burnT > 0;
      d.acc += dt * (d.rest ? (burning ? 6 : 1.2) : 34);
      while (d.acc > 1) {
        d.acc -= 1;
        const p = m.position;
        if (burning && (d.trail || !d.rest)) P.spawn({ x: p.x, y: p.y + 0.1, z: p.z, vx: (R() - 0.5) * 0.6, vy: 1 + R(), vz: (R() - 0.5) * 0.6, life: 0.35 + R() * 0.3, size: d.rest ? 0.6 : 0.8, size1: 0.2, r: 1, g: 0.8, b: 0.35, r1: 1, g1: 0.3, b1: 0.05, cell: ATLAS.FLAME, additive: true });
        const dd = 0.08 + R() * 0.08;
        P.spawn({ x: p.x, y: p.y + 0.2, z: p.z, vx: wind * 0.6 + (R() - 0.5) * 0.4, vy: 1.2 + R(), vz: (R() - 0.5) * 0.4, life: d.rest ? 2.6 : 1.4, size: 0.5, size1: d.rest ? 2.6 : 1.8, r: dd, g: dd, b: dd * 0.95, alpha: d.rest ? 0.45 : 0.7, cell: ATLAS.PUFF, drag: 0.5 });
      }
    }
  }

  _wreckDispose() {
    const W = this.wreck;
    if (!W) return;
    if (W.group) W.group.removeFromParent();
    for (const g of W.geos || []) g.dispose();
    for (const m of W.mats || []) m.dispose();
    const fx = this.outer.parent && this.outer.parent.userData.crFx;
    if (fx) fx.burn = null;
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
    this._wreckDispose();
    this.outer.removeFromParent(); this.rig.dispose();
    if (this.roof) for (const p of [this.roof.hatch, this.roof.hose, this.roof.tank, this.roof.doc]) p.rig.dispose();
    if (this.rook) this.rook.dispose();   // R3-DEFEND
  }
}
