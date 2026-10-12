// ─────────────────────────────────────────────────────────────────────────────
// Cop status visuals for every police kind (cop, cop_suv, interceptor, moto_cop,
// rhino_truck). Lights + states:
//   0 parked · 1 chase (lights) · 2 smoke-blinded "?" · 3 spun out (wobble) · 4 wrecked (dark + smoke)
//   5 gave up (lights off) · 6 SOAKED by Doc's hose (blue wash, drips, wet windshield glint, lights sputter)
//   7 STALLED by firecrackers ("?!" bubble, smoke from the hood, engine shudder, lights off)
//   8 PAINT-BLIND (paint splat decal on the windshield in the balloon colour, drips, swerving wobble)
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { ATLAS } from '../textures.js';
import { XATLAS } from './atlas.js';
import { splatTexture, PAINT_COLORS } from './models.js';
import { copDamage, disposeCopDamage } from './copDamage.js';   // R3-DEFEND: gun damage, states 9/10

const _v = new THREE.Vector3();
const DARK = new THREE.Color(0.38, 0.36, 0.35), WHITE = new THREE.Color(1, 1, 1);
const WET = new THREE.Color(0.72, 0.84, 1.08);
const R = Math.random;
const splatMats = new Map();
let splatGeo = null;
function splatMat(color) {
  let m = splatMats.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ map: splatTexture(), color, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, emissive: new THREE.Color(color).multiplyScalar(0.25) });
    splatMats.set(color, m);
  }
  return m;
}

/**
 * Windshield placement in model space: [x, y, z, tiltX, width]. Probed once per model from the
 * baked geometry: the front-most surface near the centre line at ~78 % of the height (or at the
 * height given by ANIMS[kind].windshield), so the decal sits ON the glass rather than inside the cab.
 */
export function windshieldOf(inst, def) {
  const pr = inst.proto;
  if (pr._ws) return pr._ws;
  const b = inst.bbox;
  const h = b.max.y - b.min.y, w = b.max.x - b.min.x;
  const hint = def && def.windshield;
  const y0 = hint ? hint[1] : b.min.y + h * 0.78;
  const P = pr.geometry.attributes.position;
  let zf = -1e9;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i);
    if (Math.abs(x) < w * 0.2 && Math.abs(y - y0) < h * 0.07) zf = Math.max(zf, P.getZ(i));
  }
  if (zf < -1e8) zf = hint ? hint[2] : b.min.z + (b.max.z - b.min.z) * 0.62;
  pr._ws = [0, y0, zf + 0.05, hint ? hint[3] : -0.95, hint ? hint[4] : w * 0.62];
  return pr._ws;
}

/**
 * Apply lights + status overlays. Returns the body wobble amount (radians) for the caller.
 * E: EntityView, rec: entity record, def: ANIMS entry (may be undefined for the base cops)
 */
export function copStatus(E, rec, def, dt) {
  const inst = rec.inst, rig = inst.rig, o = inst.outer, P = E.P;
  const s = rec.state, t = E.time, age = t - rec.stateT;
  // lights
  const lightsOn = s === 1 || s === 2 || s === 3 || s === 8 || (s === 6 && Math.sin(t * 9 + rec.phase) > -0.2);
  const ph = (t * 3.2 + rec.phase) % 1;
  const redOn = ph < 0.5;
  const dim = s === 6 ? 0.55 : 1;
  rig.setEmitPrefix('light_red', lightsOn ? (redOn ? 3.2 : 0.15) * dim : 0);
  rig.setEmitPrefix('light_blue', lightsOn ? (redOn ? 0.15 : 3.2) * dim : 0);
  if (lightsOn && rec.dist < 260) {
    const fl = 1 + 0.15 * Math.sin(t * 40 + rec.phase);
    const big = rec.kind === 'rhino_truck' ? 1.3 : rec.kind === 'moto_cop' ? 0.75 : 1;
    for (const L of E.copLights(inst)) {
      if (L.red ? !redOn : redOn) continue;
      _v.copy(L.pos); inst.root.localToWorld(_v);
      P.once({ x: _v.x, y: _v.y, z: _v.z, cell: ATLAS.GLOW, size: 2.6 * fl * big * dim, r: L.red ? 1 : 0.25, g: L.red ? 0.18 : 0.42, b: L.red ? 0.12 : 1, alpha: 0.9, additive: true });
    }
  }
  let wob = 0;
  const top = inst.bbox.max.y;
  if (s === 2) {
    _v.set(0, top + 1.1 + Math.sin(t * 4 + rec.phase) * 0.15, 0); o.localToWorld(_v);
    P.once({ x: _v.x, y: _v.y, z: _v.z, cell: ATLAS.QUESTION, size: 1.3, alpha: 1 });
    wob = Math.sin(t * 9 + rec.phase) * 0.03;
  }
  if (s === 3) wob = Math.sin(age * 14) * 0.09 * Math.max(0, 1 - age / 2.5);
  if (s === 4) {
    rig.tint(DARK);
    if (R() < dt * 9) {
      _v.set((R() - 0.5) * 0.8, top * 0.7, inst.bbox.max.z * 0.6); o.localToWorld(_v);
      P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: (R() - 0.5) * 0.6, vy: 1.6 + R(), vz: (R() - 0.5) * 0.6, life: 2.2, size: 1.0, size1: 3.2, r: 0.28, g: 0.27, b: 0.27, alpha: 0.6, cell: ATLAS.PUFF, drag: 0.8 });
    }
  } else if (s === 6) rig.tint(WET);
  else rig.tint(WHITE);

  const ws = (s === 6 || s === 8) ? windshieldOf(inst, def) : null;
  if (s === 6 && rec.dist < 160) {
    // water dripping off every edge + a wet glint sweeping the windshield
    const b = inst.bbox;
    const n = E.rate(rec, 'drip', 26, dt);
    for (let k = 0; k < n; k++) {
      const side = R() < 0.5 ? 1 : -1;
      _v.set(R() < 0.6 ? side * (b.max.x - 0.05) : (R() - 0.5) * (b.max.x - b.min.x), b.min.y + (b.max.y - b.min.y) * (0.45 + R() * 0.5), b.min.z + R() * (b.max.z - b.min.z));
      inst.root.localToWorld(_v);
      P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: rec.vx * 0.9, vy: -0.5, vz: rec.vz * 0.9, gravity: 9.8, life: 0.7, size: 0.16, size1: 0.12, r: 0.8, g: 0.9, b: 1, alpha: 0.9, cell: XATLAS.DROP, floor: rec.y + 0.02 });
    }
    const sweep = ((t * 0.9 + rec.phase) % 1) - 0.5;
    _v.set(ws[0] + sweep * ws[4], ws[1], ws[2] + 0.05); inst.root.localToWorld(_v);
    P.once({ x: _v.x, y: _v.y, z: _v.z, cell: XATLAS.SPARK2, size: 0.9, rot: t, r: 0.85, g: 0.95, b: 1, alpha: 0.9, additive: true });
    _v.set(ws[0], ws[1], ws[2] + 0.04); inst.root.localToWorld(_v);
    P.once({ x: _v.x, y: _v.y, z: _v.z, cell: XATLAS.SOFT, size: ws[4] * 1.3, r: 0.55, g: 0.75, b: 1, alpha: 0.35, additive: true });
    if (age < 0.25 && !rec.saidSplash) { rec.saidSplash = true; E.word('SPLASH!', rec.x, rec.y + top * 0.5, rec.z, { fill: '#e8f6ff', burst: '#3a86c8', scale: 0.85 }); }
  }
  if (s !== 6) rec.saidSplash = false;
  if (s === 7) {
    _v.set(0, top + 1.2 + Math.abs(Math.sin(t * 3 + rec.phase)) * 0.25, 0); o.localToWorld(_v);
    P.once({ x: _v.x, y: _v.y, z: _v.z, cell: XATLAS.EXCL, size: 1.5, rot: Math.sin(t * 5) * 0.15, alpha: 1 });
    wob = Math.sin(t * 31) * 0.012 + Math.sin(age * 10) * 0.05 * Math.max(0, 1 - age / 1.5);
    if (rec.dist < 180 && E.rate(rec, 'stall', 5, dt)) {
      _v.set((R() - 0.5) * 0.6, top * 0.75, inst.bbox.max.z * 0.7); o.localToWorld(_v);
      P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: (R() - 0.5) * 0.6, vy: 1.4 + R(), vz: (R() - 0.5) * 0.6, life: 2, size: 0.8, size1: 3, r: 0.55, g: 0.54, b: 0.52, alpha: 0.55, cell: ATLAS.PUFF, drag: 0.8 });
    }
    if (age < 0.25 && !rec.saidPop) { rec.saidPop = true; E.word('POP-POP!', rec.x, rec.y + top * 0.5, rec.z, { fill: '#ffd94a', burst: '#d8433a', scale: 0.8 }); }
  }
  if (s !== 7) rec.saidPop = false;
  // paint splat decal on the windshield
  if (s === 8) {
    if (rec.splat && rec.splatGuess && age < 1) {
      // the balloon's paint_splat ent may show up a frame after the cop turns blind: adopt its colour
      const c2 = E.paintColorNear(rec);
      if (c2 && c2 !== rec.splatCol) { rec.splat.material = splatMat(c2); rec.splatCol = c2; rec.splatGuess = false; }
    }
    if (!rec.splat) {
      const near = E.paintColorNear(rec);
      const col = near || PAINT_COLORS[(rec.id >>> 0) % 4];
      rec.splatGuess = !near;
      if (!splatGeo) splatGeo = new THREE.PlaneGeometry(1, 1);
      const m = new THREE.Mesh(splatGeo, splatMat(col));
      m.renderOrder = 9;
      inst.root.add(m);
      rec.splat = m; rec.splatCol = col;
      E.word('SPLAT!', rec.x, rec.y + top * 0.5, rec.z, { fill: '#f1ead8', burst: col, scale: 0.85 });
    }
    const m = rec.splat;
    m.visible = true;
    const grow = Math.min(1, 0.25 + age * 5);
    m.position.set(ws[0], ws[1], ws[2]);
    m.rotation.set(ws[3], 0, rec.phase * 2);
    m.scale.set(ws[4] * 1.1 * grow, ws[4] * 0.85 * grow, 1);
    wob = Math.sin(t * 2.3 + rec.phase) * 0.025;
    if (rec.dist < 140 && E.rate(rec, 'pdrip', 6, dt)) {
      const c = E.color(rec.splatCol);
      _v.set(ws[0] + (R() - 0.5) * ws[4] * 0.8, ws[1] - 0.15, ws[2] + 0.1); inst.root.localToWorld(_v);
      P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: rec.vx, vy: -0.3, vz: rec.vz, gravity: 9.8, life: 0.6, size: 0.15, size1: 0.12, r: c.r, g: c.g, b: c.b, cell: XATLAS.DROP, floor: rec.y + 0.02 });
    }
  } else if (rec.splat) rec.splat.visible = false;
  try { wob += copDamage(E, rec, def, dt); } catch (e) { if (!E._r3dmgWarned) { E._r3dmgWarned = true; console.error('[ents] cop damage', e); } }   // R3-DEFEND
  return wob;
}

export function disposeCopFx(rec) {
  if (rec.splat) { rec.splat.removeFromParent(); rec.splat = null; }
  disposeCopDamage(rec);   // R3-DEFEND
}
