// ─────────────────────────────────────────────────────────────────────────────
// R3-DEFEND · Rook on the RV roof with his guns, seen from outside (both roles) and from over his
// shoulder (the driver's DefendClient camera sits behind this same figure).
//   const rook = new RookRoofView(rvView, lib, particles)    // RvView builds it (rv.js, R3-DEFEND)
//   rook.update(snap, roof, dt, parent)   roof = snap.roof (sim/roof.js state()); parent = RV-local group
//   rook.event(ev)                        EV.SHOT (flash, recoil, action, casing, tracers, impacts) · EV.RELOAD
//   rook.aimOverride = { yaw, pitch } | null   the local driver's aim (no network lag); null = snapshot
//   rook.hidden = bool                    hide the figure (rifle scope view)
//   rook.muzzleWorld(out) → Vector3 | null   the drawn muzzle (tracer start)
//   rook.visible                          true while he is out of the hatch
// Model: rook_roof_aim v0 revolver · v1 shotgun · v2 rifle (docs/NOTES-r3-rook.md), drawn at
// ROOF.rookScale on the stance; yaw: rotation.y = aimYaw − yawOffset; pitch: arms + head.
// Climb: he rises out of the roof hatch with the sim's climb (0..1), gun lowered.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { GunFx, dirOf } from './gunfx.js';

// RV-local geometry (mirrors sim/roof.js ROOF_GEOM; kept local so the renderer never imports sim code)
export const ROOF_R3 = Object.freeze({ roofY: 3.11, stance: { x: 0, z: -1.8 }, hatch: { x: 0.15, z: -1.1 }, rookScale: 0.92, pivotY: 4.48 });
const GUN_V = { revolver: 0, shotgun: 1, rifle: 2 };
const CASE_V = { revolver: 2, shotgun: 1, rifle: 0 };
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
const R = Math.random;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t, a, b) => { const k = clamp((t - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class RookRoofView {
  constructor(rvView, lib, particles) {
    this.rv = rvView; this.lib = lib; this.P = particles;
    this.group = new THREE.Group(); this.group.name = 'rookRoof';
    this.models = {};          // gun → { root, parts, flash, flashT }
    this.gun = 'revolver';
    this.up = 0; this.yaw = null; this.pitch = null;
    this.kick = 0;             // recoil (rad, decays)
    this.action = null;        // { gun, t } cycling animation
    this.reloadT = 0; this.reloadTotal = 0;
    this.throwT = -1;
    this.aimOverride = null;
    this.hidden = false;
    this.visible = false;
    this.time = 0;
    this.fxSeen = new Set();
    this.layerMask = null;
    this.casingProto = {};
  }

  get fx() { return GunFx.of(this.rv.outer.parent || this.rv.outer, this.P); }

  _model(gun) {
    let m = this.models[gun];
    if (m) return m;
    const root = this.lib.create('rook_roof_aim', GUN_V[gun] ?? 0);
    root.scale.setScalar(ROOF_R3.rookScale);
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const get = (n) => root.getObjectByName(n);
    const parts = { arm_l: get('arm_l'), arm_r: get('arm_r'), head: get('head'), muzzle: get('muzzle'), gun: get('gun'), cylinder: get('cylinder'), hammer: get('hammer'), pump: get('pump'), bolt: get('bolt'), body: get('body') };
    const rest = {};
    for (const k of ['pump', 'bolt']) if (parts[k]) rest[k] = { pz: parts[k].position.z, rz: parts[k].rotation.z };
    // muzzle flash (unlit additive, its own material per instance)
    let flash = null;
    try {
      const f = this.lib.create('muzzle_flash', gun === 'shotgun' ? 1 : 0);
      flash = f.getObjectByName('flash') || f;
      flash.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.castShadow = false; o.receiveShadow = false; o.renderOrder = 9; } });
      if (parts.muzzle) { parts.muzzle.add(flash); flash.position.set(0, 0, 0); }
      flash.visible = false;
    } catch (e) { flash = null; }
    const yawOffset = root.userData?.aim?.yawOffset || 0;
    m = { root, parts, flash, flashT: 0, yawOffset, rest };
    root.visible = false;
    this.group.add(root);
    this.models[gun] = m;
    return m;
  }

  _casingMesh(gun) {
    const v = CASE_V[gun] ?? 0;
    let p = this.casingProto[v];
    if (!p) {
      try { p = this.lib.create('shell_casing', v); } catch (e) { p = null; }
      if (!p) return null;
      p.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
      this.casingProto[v] = p;
    }
    const c = p.clone();
    c.scale.setScalar(gun === 'revolver' ? 1.2 : 1);
    return c;
  }

  /** parent: the RV-local group (rv.js roof props group, under inst.root). */
  update(snap, roof, dt, parent) {
    this.time += dt;
    if (parent && this.group.parent !== parent) parent.add(this.group);
    const mask = this.rv.inst.rig.mesh.layers.mask;
    if (this.layerMask !== mask) { this.layerMask = mask; this.group.traverse((o) => { o.layers.mask = mask; }); }
    roof = roof || {};
    const rv = snap.rv || {};
    const climb = typeof roof.climb === 'number' ? roof.climb : (rv.roofRook ? 1 : 0);
    const target = roof.active || rv.roofRook ? climb : 0;
    this.up += (target - this.up) * Math.min(1, dt * 12);
    const up = smooth(this.up, 0.3, 1);
    const gun = roof.gun && GUN_V[roof.gun] != null ? roof.gun : this.gun;
    if (gun !== this.gun) { this.gun = gun; this.action = null; }
    for (const g of Object.keys(this.models)) this.models[g].root.visible = false;
    this.visible = up > 0.01;
    if (!this.visible) { this.kick = 0; return; }
    const m = this._model(gun);
    if (m.root.layers.mask !== mask) m.root.traverse((o) => { o.layers.mask = mask; });
    m.root.visible = !this.hidden;
    // aim (local override for the shooter; the snapshot, smoothed, for everyone else)
    const ov = this.aimOverride;
    const ty = ov ? ov.yaw : (roof.aimYaw ?? Math.PI), tp = ov ? ov.pitch : (roof.aimPitch ?? -0.1);
    if (this.yaw == null || ov) { this.yaw = ty; this.pitch = tp; }
    else { this.yaw = wrap(this.yaw + wrap(ty - this.yaw) * Math.min(1, dt * 12)); this.pitch += (tp - this.pitch) * Math.min(1, dt * 12); }
    // pose: out of the hatch while climbing, gun lowered until he stands
    const S = ROOF_R3;
    m.root.position.set(S.stance.x, S.roofY - 1.35 * (1 - up), S.stance.z + 0.55 * (1 - up));
    m.root.rotation.set(0, this.yaw - m.yawOffset, 0);
    this.kick = Math.max(0, this.kick - dt * 6 * Math.max(0.3, this.kick * 4));
    // reload: gun dipped; throwing: right arm swings
    const reloading = (roof.reloading || 0) > 0;
    this.reloadT = reloading ? this.reloadT + dt : 0;
    const dip = (1 - up) * 0.9 + (reloading ? 0.45 : 0) + (roof.slot && GUN_V[roof.slot] == null ? 0.35 : 0);
    const pitch = clamp(this.pitch, -1.2, 0.7) - dip;
    const P = m.parts;
    if (P.arm_l) P.arm_l.rotation.x = -pitch - this.kick;
    if (P.arm_r) P.arm_r.rotation.x = -pitch - this.kick;
    if (P.head) P.head.rotation.x = -0.9 * clamp(this.pitch, -1.2, 0.7) * up;
    if (this.throwT >= 0) {
      this.throwT += dt;
      const k = this.throwT / 0.45;
      if (k >= 1) this.throwT = -1;
      else if (P.arm_r) P.arm_r.rotation.x = -pitch + (k < 0.4 ? -2.2 * (k / 0.4) : -2.2 + 3.0 * ((k - 0.4) / 0.6));
    }
    // gun action
    this._animateAction(m, dt, reloading);
    if (m.flash) {
      m.flashT -= dt;
      m.flash.visible = m.flashT > 0 && !this.hidden;
    }
    // throws seen first in the snapshot (AI / remote): swing the arm
    const fx = Array.isArray(roof.fx) ? roof.fx : null;
    if (fx) for (const f of fx) {
      if (f.phase !== 'fly' || this.fxSeen.has(f.id)) continue;
      this.fxSeen.add(f.id);
      if ((f.t || 0) < 0.3) this.throwT = 0;
    }
    if (this.fxSeen.size > 64) this.fxSeen.clear();
  }

  _animateAction(m, dt, reloading) {
    const P = m.parts, a = this.action;
    const gun = this.gun;
    if (gun === 'revolver') {
      if (P.hammer) P.hammer.rotation.x = a && a.t < 0.12 ? -0.6 * (1 - a.t / 0.12) : 0;
      if (P.cylinder && reloading) P.cylinder.rotation.z += dt * 2;
    } else if (gun === 'shotgun' && P.pump) {
      const r = m.rest.pump || { pz: 0 };
      let k = 0;
      if (a && a.t > 0.12 && a.t < 0.5) k = Math.sin(((a.t - 0.12) / 0.38) * Math.PI);
      if (reloading) k = 0.15 * Math.abs(Math.sin(this.reloadT * 6));
      P.pump.position.z = r.pz - 0.09 * k;
      if (a && !a.ejected && a.t > 0.3) { a.ejected = true; this._eject(m, 'shotgun'); }
    } else if (gun === 'rifle' && P.bolt) {
      const r = m.rest.bolt || { pz: 0, rz: 0 };
      let lift = 0, pull = 0;
      if (a && a.t > 0.25 && a.t < 0.85) {
        const k = (a.t - 0.25) / 0.6;
        lift = k < 0.2 ? k / 0.2 : k > 0.8 ? (1 - k) / 0.2 : 1;
        pull = k < 0.2 ? 0 : k < 0.45 ? (k - 0.2) / 0.25 : k < 0.6 ? 1 : k < 0.8 ? 1 - (k - 0.6) / 0.2 : 0;
        if (!a.ejected && k > 0.45) { a.ejected = true; this._eject(m, 'rifle'); }
      }
      P.bolt.rotation.z = r.rz - 1.05 * lift;
      P.bolt.position.z = r.pz - 0.09 * pull;
    }
    if (a) { a.t += dt; if (a.t > 1) this.action = null; }
  }

  _eject(m, gun) {
    const mesh = this._casingMesh(gun);
    if (!mesh) return;
    const parent = this.group.parent || this.group;
    const src = gun === 'shotgun' ? (m.parts.pump || m.parts.gun) : (m.parts.bolt || m.parts.gun);
    if (!src) return;
    // eject point in the RV-local frame (the parent), out of the gun's right side (−X)
    src.updateWorldMatrix(true, false);
    src.getWorldPosition(_v);
    parent.updateWorldMatrix(true, false);
    parent.worldToLocal(_v);
    const yaw = this.yaw - (m.yawOffset || 0) + (gun === 'revolver' ? 0 : 0);
    const rx = -Math.cos(yaw), rz = Math.sin(yaw);   // the gun's −X (right) in RV-local
    const vel = _v2.set(rx * (1.6 + R()), 2.2 + R() * 1.2, rz * (1.6 + R()) - Math.cos(yaw) * 0.4);
    mesh.traverse((o) => { o.layers.mask = this.layerMask ?? o.layers.mask; });
    const c = this.fx.casing(parent, mesh, _v.clone(), vel.clone(), ROOF_R3.roofY);
    if (c) c.onBounce = (cc) => { if (cc.bounced === 1 && this.onCasing) { try { this.onCasing(gun); } catch (e) { /* audio is best-effort */ } } };
  }

  /** World position of the drawn muzzle (null while hidden down the hatch). */
  muzzleWorld(out = new THREE.Vector3()) {
    const m = this.models[this.gun];
    if (!m || !this.visible || !m.parts.muzzle) return null;
    m.root.updateWorldMatrix(true, true);
    return m.parts.muzzle.getWorldPosition(out);
  }

  /** EV.SHOT / EV.RELOAD from the sim (both roles). */
  event(ev) {
    if (!ev) return;
    if (ev.type === 'reload') { this.reloadTotal = ev.seconds || 0; return; }
    if (ev.type !== 'shot') return;
    const gun = GUN_V[ev.gun] != null ? ev.gun : this.gun;
    const m = this._model(gun);
    // flash + recoil + action
    if (m.flash) {
      m.flashT = 0.055;
      m.flash.rotation.z = R() * Math.PI * 2;
      m.flash.scale.setScalar((gun === 'shotgun' ? 1.25 : gun === 'rifle' ? 1.1 : 0.9) * (0.85 + R() * 0.3));
    }
    this.kick = gun === 'shotgun' ? 0.34 : gun === 'rifle' ? 0.26 : 0.2;
    this.action = { gun, t: 0, ejected: gun === 'revolver' };
    if (gun === 'revolver' && m.parts.cylinder) m.parts.cylinder.rotation.z += Math.PI / 3;
    // tracers from the drawn muzzle (else the sim's muzzle) to every pellet's end
    const fx = this.fx;
    const mw = this.muzzleWorld(_v) || _v.set(ev.x, ev.y, ev.z);
    const sx = mw.x, sy = mw.y, sz = mw.z;
    const ends = Array.isArray(ev.pellets) && ev.pellets.length ? ev.pellets : [[ev.tx, ev.ty, ev.tz, ev.copId, ev.part]];
    const d = dirOf(ev.x, ev.y, ev.z, ev.tx, ev.ty, ev.tz);
    fx.muzzleSmoke(sx, sy, sz, d, gun !== 'revolver');
    ends.forEach((p, i) => {
      if (!Array.isArray(p) || !Number.isFinite(p[0])) return;
      if (gun !== 'shotgun' || i % 2 === 0) fx.tracer(sx, sy, sz, p[0], p[1], p[2], { width: gun === 'rifle' ? 1.3 : gun === 'shotgun' ? 0.7 : 1 });
      const kind = p[3] != null ? (p[4] || 'body') : 'ground';
      fx.impact(p[0], p[1], p[2], kind, { dir: dirOf(sx, sy, sz, p[0], p[1], p[2]) });
    });
  }

  dispose() {
    this.group.removeFromParent();
    for (const m of Object.values(this.models)) m.root.traverse((o) => { if (o.isMesh && o.material && o.material.name === 'CR_MuzzleFlash') o.material.dispose(); });
  }
}
void _q;
