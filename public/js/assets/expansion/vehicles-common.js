// ─────────────────────────────────────────────────────────────────────────────
// Expansion pack VEHICLES: shared helpers (art agent "vehicles").
//
// Everything here builds into the base Kit (one vertex-coloured draw call per
// model) and the base Rig (named pivots → rigid hierarchy via toRigid). Extra
// helpers on top of models/kit.js + models/vehicles.js:
//   beam / tube / frameBox   oriented boxes and cylinders between two points
//   figure                   posed human (riders, drivers, the Rhino's lobber)
//   lampMesh                 emissive lamp meshes (light_red / light_blue / light_amber)
//   textTex / addSign        CanvasTexture signs (one extra draw call per sign texture)
//   *WheelGeo / addWheelGeo  spoked, bike, rail and white-wall wheels (axle = local X)
//   carShell / carLamps      generic car body (profile extrusion + glass cabin)
//   longNoseCab / flatCab    truck cabs (rear of cab at z0, front toward +Z)
// Conventions: metres, Y up, front +Z, the model's right side is −X.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Kit, Rig, empty, root, rng, mat, chamferBoxGeometry, signTexture, signPanel, fitText, clipBand, lerp } from '../models/kit.js';
import { addWheel, wheelGeometry, sideWindow, edgeQuad, sideBlob, arch } from '../models/vehicles.js';
import { PAL, mix, shade, vcolMaterial } from '../palette.js';

export { THREE, Kit, Rig, empty, root, rng, mat, PAL, mix, shade, vcolMaterial, addWheel, wheelGeometry, sideWindow, edgeQuad, sideBlob, arch, clipBand, lerp, signPanel, signTexture, fitText };

export const MIDNIGHT = '#1d2b5a';
export const CHARCOAL = '#34373c';

// ── rig ──────────────────────────────────────────────────────────────────────
/** New vehicle rig: bone 0 = `body` at the origin. */
export function vrig() { const rig = new Rig(); rig.add('body', [0, 0, 0]); return rig; }
/** Bake kit + rig into the root; returns the bone map (bones become plain Object3D pivots in createModel). */
export function finish(g, k, rig) {
  const { bones } = rig.build(g, k, 'mesh');
  g.userData.parts = [...new Set(rig.defs.map((d) => d.name))];
  return bones;
}
/** Find a bone/pivot by name (first match) on a freshly built root. */
export const pivot = (g, name) => g.getObjectByName(name);

// ── cached unit geometries ───────────────────────────────────────────────────
const _g = new Map();
const cg = (key, make) => { let g = _g.get(key); if (!g) { g = make(); _g.set(key, g); } return g; };
const unitBox = () => cg('ubox', () => new THREE.BoxGeometry(1, 1, 1));
const unitCyl = (rt, rb, seg) => cg(`ucyl|${rt}|${rb}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, 1, seg, 1, false));

const V = (p) => (p && p.isVector3 ? p.clone() : new THREE.Vector3(p[0], p[1], p[2]));
export const arr = (v) => [v.x, v.y, v.z];
const UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(0, 0, 1);

/**
 * Orthonormal frame for a segment a→b: Y along the segment, X = Y × hint, Z = X × Y.
 * Default hint: world +Z for steep segments (so X stays lateral), world +Y otherwise (Z points up).
 */
export function frameFrom(a, b, hint) {
  const A = V(a), B = V(b);
  const Y = B.clone().sub(A);
  const len = Y.length();
  Y.divideScalar(len || 1);
  const H = hint ? V(hint) : (Math.abs(Y.y) > 0.7 ? FWD.clone() : UP.clone());
  let X = new THREE.Vector3().crossVectors(Y, H);
  if (X.lengthSq() < 1e-8) X = new THREE.Vector3().crossVectors(Y, new THREE.Vector3(1, 0, 0));
  X.normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
  return { A, B, len, X, Y, Z, C: A.clone().add(B).multiplyScalar(0.5) };
}
/** Box spanning a→b (w across X of the frame, d across Z). o.ext lengthens both ends, o.hint orients. */
export function beam(k, color, a, b, w, d = w, o = {}) {
  const f = frameFrom(a, b, o.hint);
  if (f.len < 1e-4) return f;
  const L = f.len + 2 * (o.ext || 0);
  const m = new THREE.Matrix4().makeBasis(f.X.clone().multiplyScalar(w), f.Y.clone().multiplyScalar(L), f.Z.clone().multiplyScalar(d)).setPosition(f.C);
  k.geo(unitBox(), color, m, o);
  return f;
}
/** Cylinder from a (radius ra) to b (radius rb). */
export function tube(k, color, a, b, ra, rb = ra, seg = 6, o = {}) {
  const f = frameFrom(a, b, o.hint);
  if (f.len < 1e-4) return f;
  const L = f.len + 2 * (o.ext || 0);
  const m = new THREE.Matrix4().makeBasis(f.X, f.Y.clone().multiplyScalar(L), f.Z).setPosition(f.C);
  k.geo(unitCyl(rb, ra, seg), color, m, o);
  return f;
}
/** Box placed in a frame (from frameFrom / figure): local offset [x,y,z] along X/Y/Z, size [w,h,d]. */
export function frameBox(k, color, f, off, size, o = {}) {
  const c = f.C.clone().addScaledVector(f.X, off[0]).addScaledVector(f.Y, off[1]).addScaledVector(f.Z, off[2]);
  if (o.c) {   // chamfer in metres (like Kit.box)
    const m = new THREE.Matrix4().makeBasis(f.X, f.Y, f.Z).setPosition(c);
    k.geo(chamferBoxGeometry(size[0], size[1], size[2], o.c), color, m, o);
    return;
  }
  const m = new THREE.Matrix4().makeBasis(f.X.clone().multiplyScalar(size[0]), f.Y.clone().multiplyScalar(size[1]), f.Z.clone().multiplyScalar(size[2])).setPosition(c);
  k.geo(unitBox(), color, m, o);
}
/** Polyline of beams through pts (chains, cables, rails). */
export function polyBeam(k, color, pts, w, d = w, o = {}) {
  for (let i = 0; i < pts.length - 1; i++) beam(k, color, pts[i], pts[i + 1], w, d, { ext: o.ext ?? w * 0.4, ...o });
}

/**
 * Rig proxy that shifts every new pivot by dz along Z (use with k.at([0,0,dz]) around the build
 * so a model can be authored in convenient coordinates and still be centred on its footprint).
 */
export function offsetRig(rig, dz) {
  return { add: (n, p, par, o) => rig.add(n, [p[0], p[1], p[2] + dz], par, o), defs: rig.defs, index: rig.index, i: (n) => rig.i(n) };
}

// ── 2-bone IK + posed human ──────────────────────────────────────────────────
/** Joint position for a two-bone limb from root a toward target c, bending toward hint. */
export function ik(a, c, l1, l2, hint) {
  const A = V(a), C = V(c);
  const d = C.clone().sub(A);
  let dist = d.length();
  const dir = d.divideScalar(dist || 1);
  dist = Math.min(Math.max(dist, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
  const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const H = V(hint);
  const perp = H.sub(dir.clone().multiplyScalar(H.dot(dir)));
  if (perp.lengthSq() < 1e-8) perp.set(0, 1, 0);
  perp.normalize();
  return A.add(dir.multiplyScalar(x)).add(perp.multiplyScalar(h));
}
/** Where the hand actually ends up (target clamped to the arm's reach). */
function reach(a, c, l) { const A = V(a), C = V(c); const d = C.clone().sub(A); const n = d.length(); return n > l ? A.add(d.multiplyScalar(l / n)) : C; }

/**
 * Posed adult human made of chunky boxes, in MODEL space (matches the base characters' proportions:
 * ~1.75 m, slightly big head and hands). Returns the torso frame + key points.
 *   o.hip [x,y,z] pelvis centre · o.yaw (0 = faces +Z) · o.lean torso tilt forward (rad)
 *   o.hands [[l],[r]] / o.feet [[l],[r]] model-space targets (l = figure's left)
 *   o.armHint / o.legHint local bend hints (x mirrored per side)
 *   colours: skin, top, sleeve, bottom, boots, gloves · o.head = { type, color, visor, hair, beard, ... }
 *   o.vest { color, open } · o.armour colour · o.scarf colour · o.legsBone / o.armBones [l, r] (bone indices)
 */
export function figure(k, o) {
  const yaw = o.yaw || 0, cy = Math.cos(yaw), sy = Math.sin(yaw);
  const hip = V(o.hip);
  const L = (x, y, z) => new THREE.Vector3(hip.x + x * cy + z * sy, hip.y + y, hip.z - x * sy + z * cy);
  const dirL = (x, y, z) => new THREE.Vector3(x * cy + z * sy, y, -x * sy + z * cy);
  const fwd = dirL(0, 0, 1);
  const skin = o.skin || PAL.skin[1], top = o.top || '#6f8fb0', bottom = o.bottom || '#3b4250';
  const sleeve = o.sleeve || top, boots = o.boots || '#2a2522', gloves = o.gloves || skin;
  const T = 0.5 * (o.scale || 1), lean = o.lean || 0;
  // pelvis
  frameBox(k, bottom, frameFrom(L(0, -0.1, 0), L(0, 0.1, 0), fwd), [0, 0, 0], [0.36, 0.2, 0.25]);
  // torso
  const neck = L(0, 0.06 + T * Math.cos(lean), T * Math.sin(lean));
  const tf = frameFrom(L(0, 0.04, 0), neck, fwd);
  frameBox(k, top, tf, [0, 0, 0], [0.42, T + 0.04, 0.25], { c: 0.05 });
  frameBox(k, top, tf, [0, T / 2 - 0.05, 0], [0.5, 0.13, 0.24]);
  if (o.armour) {
    frameBox(k, o.armour, tf, [0, 0.03, 0], [0.46, T * 0.8, 0.31]);
    for (const s of [1, -1]) frameBox(k, shade(o.armour, 0.85), tf, [s * 0.24, T / 2 - 0.05, 0], [0.14, 0.12, 0.27]);
  }
  if (o.vest) {
    const vc = o.vest.color;
    frameBox(k, vc, tf, [0, 0.0, -0.115], [0.46, T * 0.95, 0.05]);
    for (const s of [1, -1]) {
      frameBox(k, vc, tf, [s * 0.15, 0.0, 0.11], [0.15, T * 0.95, 0.05]);
      frameBox(k, vc, tf, [s * 0.18, T / 2 - 0.04, 0], [0.13, 0.12, 0.27]);
    }
  }
  // neck + head (head stays nearly upright)
  tube(k, skin, neck.clone().addScaledVector(tf.Y, -0.04), neck.clone().addScaledVector(tf.Y, 0.08), 0.06, 0.055, 6);
  const hUp = tf.Y.clone().multiplyScalar(0.35).add(UP.clone().multiplyScalar(0.65)).normalize();
  const hc = neck.clone().addScaledVector(hUp, 0.2);
  const hf = frameFrom(hc.clone().addScaledVector(hUp, -0.1), hc.clone().addScaledVector(hUp, 0.1), fwd);
  hf.C.copy(hc);
  head(k, hf, { skin, ...(o.head || {}) });
  if (o.scarf) {
    // comet-tail scarf: knot at the neck, two tails streaming back and down
    const sc = o.scarf;
    frameBox(k, sc, tf, [0, T / 2 + 0.02, 0], [0.3, 0.09, 0.3]);
    const n0 = neck.clone().addScaledVector(tf.Z, -0.14);
    const tail = [n0, n0.clone().add(dirL(0.08, -0.06, -0.3)), n0.clone().add(dirL(0.16, -0.2, -0.55)), n0.clone().add(dirL(0.2, -0.42, -0.72))];
    const widths = [0.16, 0.13, 0.09];
    for (let i = 0; i < 3; i++) beam(k, i === 2 ? (o.scarfTip || sc) : sc, tail[i], tail[i + 1], widths[i], 0.035, { hint: [0, 1, 0], ext: 0.03 });
  }
  // arms
  const out = { torso: tf, neck, head: hc, hands: [], shoulders: [] };
  const sides = [1, -1];
  sides.forEach((s, i) => {
    const sh = neck.clone().addScaledVector(tf.X, s * 0.25).addScaledVector(tf.Y, -0.08);
    const ah = o.armHint || [0.6, -0.5, -0.5];
    const target = reach(sh, o.hands ? o.hands[i] : sh.clone().add(dirL(s * 0.08, -0.55, 0.05)), 0.6);
    const el = ik(sh, target, 0.3, 0.3, dirL(s * ah[0], ah[1], ah[2]));
    const doArm = () => {
      beam(k, sleeve, sh, el, 0.12, 0.12, { ext: 0.04 });
      beam(k, o.forearm || sleeve, el, target, 0.11, 0.11, { ext: 0.03 });
      const hfr = frameFrom(el, target);
      hfr.C.copy(target).addScaledVector(hfr.Y, 0.04);
      frameBox(k, gloves, hfr, [0, 0, 0], [0.11, 0.13, 0.12]);
    };
    if (o.armBones && o.armBones[i] !== undefined) k.withBone(o.armBones[i], doArm); else doArm();
    out.hands.push(target); out.shoulders.push(sh);
  });
  // legs
  const doLegs = () => sides.forEach((s, i) => {
    const hj = L(s * 0.11, -0.04, 0);
    const lh = o.legHint || [0.25, 0.6, 0.8];
    const foot = reach(hj, o.feet ? o.feet[i] : L(s * 0.12, -0.84, 0), 0.86);
    const kn = ik(hj, foot, 0.44, 0.42, dirL(s * lh[0], lh[1], lh[2]));
    beam(k, bottom, hj, kn, 0.16, 0.16, { ext: 0.04 });
    beam(k, bottom, kn, foot, 0.14, 0.14, { ext: 0.03 });
    const bf = frameFrom(foot.clone().addScaledVector(fwd, -0.08), foot.clone().addScaledVector(fwd, 0.18), [0, 1, 0]);
    frameBox(k, boots, bf, [0, 0, 0], [0.13, 0.28, 0.13]);
    if (o.bootShaft) beam(k, boots, foot, foot.clone().lerp(kn, 0.4), 0.15, 0.15);
  });
  if (o.legsBone !== undefined) k.withBone(o.legsBone, doLegs); else doLegs();
  return out;
}

/** Head + headgear in head frame hf (Y up the neck axis, Z forward). */
function head(k, hf, h) {
  const skin = h.skin;
  const HW = 0.27, HH = 0.31, HD = 0.28;
  const fb = (c, off, size, o) => frameBox(k, c, hf, off, size, o);
  fb(skin, [0, 0, 0], [HW, HH, HD], { c: 0.045 });
  fb(shade(skin, 0.93), [0, -0.01, HD / 2 + 0.012], [0.05, 0.07, 0.05]);
  const eyes = () => { for (const s of [1, -1]) fb(PAL.eye, [s * 0.058, 0.03, HD / 2 + 0.003], [0.034, 0.044, 0.02]); };
  const hair = h.hair || PAL.hair[0];
  const beard = () => { if (h.beard) { fb(h.beard, [0, -0.1, HD / 2 - 0.02], [HW * 0.92, 0.14, 0.08]); fb(h.beard, [0, -0.06, 0.03], [HW + 0.02, 0.12, HD * 0.7]); fb(h.beard, [0, -0.02, HD / 2 + 0.008], [0.12, 0.03, 0.02]); } };
  const shades = (c = '#151617') => { for (const s of [1, -1]) fb(c, [s * 0.06, 0.03, HD / 2 + 0.012], [0.085, 0.055, 0.02]); fb(c, [0, 0.045, HD / 2 + 0.01], [0.26, 0.016, 0.016]); };
  switch (h.type) {
    case 'moto': { // full-face patrol helmet, dark visor
      const c = h.color || PAL.copWhite;
      fb(c, [0, 0.03, -0.01], [HW + 0.07, HH + 0.08, HD + 0.08], { c: 0.1 });
      fb(h.visor || '#20262c', [0, 0.04, HD / 2 + 0.03], [HW - 0.01, 0.12, 0.05], { c: 0.025 });
      fb(shade(c, 0.85), [0, -0.1, HD / 2 + 0.02], [HW - 0.06, 0.08, 0.05], { c: 0.02 });
      if (h.stripe) fb(h.stripe, [0, 0.185, 0], [0.07, 0.03, HD + 0.02]);
      break;
    }
    case 'hero': { // silver dome helmet, teal visor, comet stripe
      const c = h.color || '#c8c9c4';
      fb(c, [0, 0.035, -0.01], [HW + 0.09, HH + 0.1, HD + 0.1], { c: 0.12 });
      fb(shade(c, 1.12), [0, 0.19, 0], [HW * 0.5, 0.05, HD + 0.06], { c: 0.02 });
      fb(h.visor || '#2a7f86', [0, 0.02, HD / 2 + 0.045], [HW + 0.04, 0.16, 0.04], { c: 0.02 });
      fb(h.stripe || MIDNIGHT, [0, 0.2, 0], [0.04, 0.03, HD + 0.1]);
      for (const s of [1, -1]) fb(shade(c, 0.8), [s * (HW / 2 + 0.06), 0.0, 0], [0.04, 0.1, 0.1], { c: 0.01 });
      break;
    }
    case 'riot': {
      const c = h.color || '#1b2232';
      fb(c, [0, 0.05, -0.01], [HW + 0.08, HH * 0.75, HD + 0.08], { c: 0.07 });
      fb(c, [0, -0.08, -HD / 2 - 0.02], [HW + 0.06, 0.12, 0.05]);
      fb(h.visor || '#3c4a55', [0, -0.01, HD / 2 + 0.05], [HW + 0.04, 0.2, 0.025]);
      eyes();
      break;
    }
    case 'bandana': {
      eyes(); beard();
      fb(hair, [0, -0.05, -HD / 2 + 0.02], [HW + 0.02, 0.18, 0.06]);
      fb(h.color || '#8f2f2a', [0, HH / 2 - 0.02, -0.01], [HW + 0.03, 0.08, HD + 0.03], { c: 0.03 });
      fb(h.color || '#8f2f2a', [0, 0.06, -HD / 2 - 0.04], [0.08, 0.08, 0.06]);
      beam(k, h.color || '#8f2f2a', hf.C.clone().addScaledVector(hf.Y, 0.06).addScaledVector(hf.Z, -HD / 2 - 0.05), hf.C.clone().addScaledVector(hf.Y, -0.04).addScaledVector(hf.Z, -HD / 2 - 0.16), 0.07, 0.02);
      if (h.shades !== false) shades();
      break;
    }
    case 'halfhelmet': {
      eyes(); beard();
      fb(h.color || '#1e1f21', [0, HH / 2 - 0.035, -0.01], [HW + 0.06, 0.13, HD + 0.06], { c: 0.05 });
      fb(shade(h.color || '#1e1f21', 1.3), [0, HH / 2 - 0.1, 0], [HW + 0.065, 0.025, HD + 0.065]);
      if (h.goggles) { fb('#3a2f25', [0, 0.04, 0], [HW + 0.03, 0.03, HD + 0.03]); for (const s of [1, -1]) fb(h.goggles, [s * 0.06, 0.035, HD / 2 + 0.02], [0.09, 0.06, 0.03]); } else shades();
      break;
    }
    case 'cowboy': {
      eyes(); beard();
      fb(hair, [0, 0.04, -HD / 2 + 0.03], [HW + 0.02, 0.16, 0.06]);
      const c = h.color || '#6d5238';
      fb(c, [0, HH / 2 + 0.05, 0], [HW + 0.02, 0.14, HD + 0.02], { c: 0.03, taper: [0.85, 0.75] });
      fb(shade(c, 0.75), [0, HH / 2 - 0.005, 0], [HW + 0.03, 0.025, HD + 0.03]);
      fb(c, [0, HH / 2 - 0.02, 0], [HW + 0.26, 0.02, HD + 0.22], { c: 0.05 });
      break;
    }
    case 'cap': {
      eyes(); beard();
      const c = h.color || '#3a4a5a';
      fb(c, [0, HH / 2 + 0.01, -0.005], [HW + 0.03, 0.09, HD + 0.03], { c: 0.03 });
      fb(shade(c, 0.8), [0, HH / 2 - 0.03, HD / 2 + 0.06], [HW * 0.9, 0.02, 0.13]);
      fb(hair, [0, -0.02, -HD / 2 + 0.01], [HW + 0.01, 0.14, 0.04]);
      if (h.shades) shades();
      break;
    }
    default: {
      eyes(); beard();
      fb(hair, [0, HH / 2 - 0.02, -0.005], [HW + 0.02, 0.07, HD + 0.02], { c: 0.03 });
      fb(hair, [0, 0.04, -HD / 2 + 0.01], [HW + 0.02, 0.14, 0.06]);
    }
  }
}

// ── lamps ────────────────────────────────────────────────────────────────────
/** Emissive lamp material (clone per instance via cloneInstanceMaterials to flash it). */
export function lampMaterial(off, on, name, intensity = 0) {
  const m = new THREE.MeshLambertMaterial({ color: off, emissive: on, emissiveIntensity: intensity, name, flatShading: true });
  m.userData.lamp = true;
  return m;
}
/** Mesh named `name` built with a throwaway Kit (geometry in the parent's local space). */
export function lampMesh(name, build, off, on, matName, intensity = 0) {
  const k = new Kit(1);
  build(k);
  const m = new THREE.Mesh(k.geometry(), lampMaterial(off, on, matName, intensity));
  m.name = name;
  return m;
}
/** Red + blue police lamp meshes from two builder callbacks; registers them as per-instance materials. */
export function policeLamps(g, buildRed, buildBlue) {
  const red = lampMesh('light_red', buildRed, PAL.lightRedOff, PAL.lightRedOn, 'CR_Lamp_Red');
  const blue = lampMesh('light_blue', buildBlue, PAL.lightBlueOff, PAL.lightBlueOn, 'CR_Lamp_Blue');
  g.userData.perInstanceMaterials = [...(g.userData.perInstanceMaterials || []), 'light_red', 'light_blue'];
  return [red, blue];
}

// ── signs (CanvasTexture; plain colour fallback without a DOM) ───────────────
/**
 * Text sign texture. o: { w, h, bg, fg, border, stroke, weight, sub (second line), draw(ctx,w,h), size }
 * Cached by key. Returns null in Node (signPanel then uses a plain colour).
 */
export function textTex(key, text, o = {}) {
  return signTexture({
    key: 'xveh_' + key, w: o.w || 512, h: o.h || 128, bg: o.bg || '#e2b93b', weather: o.weather,
    draw(ctx, w, h) {
      if (o.drawBg) o.drawBg(ctx, w, h);
      if (o.border) { ctx.strokeStyle = o.border; ctx.lineWidth = o.bw || h * 0.07; const p = ctx.lineWidth / 2 + (o.inset || 0); ctx.strokeRect(p, p, w - 2 * p, h - 2 * p); }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lines = Array.isArray(text) ? text : [text];
      const n = lines.length;
      lines.forEach((t, i) => {
        const y = h * ((i + 0.5) / n) + h * 0.03;
        const px = Math.floor((h / n) * (o.size || 0.72) * (i === 0 ? 1 : (o.subScale || 0.8)));
        ctx.fillStyle = (Array.isArray(o.fg) ? o.fg[i] : o.fg) || '#1f2022';
        if (o.stroke) { ctx.lineWidth = px * 0.12; ctx.strokeStyle = o.stroke; ctx.lineJoin = 'round'; let s = px; do { ctx.font = `${o.weight || '900'} ${s}px "Arial Black","Arial Bold",Arial,Helvetica,sans-serif`; s -= 2; } while (ctx.measureText(t).width > w * (o.maxW || 0.9) && s > 8); ctx.strokeText(t, w / 2, y); ctx.fillText(t, w / 2, y); }
        else fitText(ctx, t, w / 2, y, w * (o.maxW || 0.9), px, o.weight || '900');
      });
      if (o.draw) o.draw(ctx, w, h);
    },
  });
}
/** Attach a sign plane (faces local +Z before rot) to a pivot. */
export function addSign(parent, tex, w, h, pos, rot = [0, 0, 0], name = 'sign', fallback = '#d9cfb3') {
  const m = signPanel(tex, w, h, fallback, name);
  m.position.set(pos[0], pos[1], pos[2]);
  m.rotation.set(rot[0], rot[1], rot[2]);
  parent.add(m);
  return m;
}
/** Same sign on both flanks (x = ±x) reading front-to-back on each side. */
export function sideSigns(parent, tex, w, h, x, y, z, name, fallback) {
  addSign(parent, tex, w, h, [x, y, z], [0, Math.PI / 2, 0], name + '_l', fallback);
  addSign(parent, tex, w, h, [-x, y, z], [0, -Math.PI / 2, 0], name + '_r', fallback);
}

// ── wheels (shared, vertex-coloured; axle = local X, outer face toward +X) ───
const _wg = new Map();
function wheelCache(key, make) { let g = _wg.get(key); if (!g) { g = make(); _wg.set(key, g); } return g; }

/** Add a wheel pivot (rotation.order YXZ) with a prebuilt geometry. side −1 mirrors (outer face → −X). */
export function addWheelGeo(k, rig, name, pos, geo, side = 1, parent = null) {
  const i = rig.add(name, pos, parent, { order: 'YXZ' });
  k.withBone(i, () => k.merge(geo, mat(pos, [0, side < 0 ? Math.PI : 0, 0])));
  return i;
}

/** Wooden spoked wagon wheel with an iron tyre. */
export function spokedWheelGeo(r, w, spokes = 12, o = {}) {
  return wheelCache(`spk|${r}|${w}|${spokes}|${o.wood}|${o.hub}`, () => {
    const k = new Kit(5);
    const wood = o.wood || '#b8873a', iron = o.iron || '#2c2a28', hub = o.hub || shade(wood, 0.8);
    k.torus(iron, r - 0.025, 0.035, [0, 0, 0], { rot: [0, Math.PI / 2, 0], rs: 4, ts: 14, scale: [1, 1, w / 0.07] });
    k.torus(wood, r - 0.085, 0.04, [0, 0, 0], { rot: [0, Math.PI / 2, 0], rs: 3, ts: 12, scale: [1, 1, (w * 0.8) / 0.08] });
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      k.at([0, 0, 0], [a, 0, 0], () => k.box(wood, [w * 0.35, r - 0.12, 0.045], [0, (r - 0.12) / 2 + 0.06, 0], { noBottom: true }));
    }
    k.cyl(hub, r * 0.16, r * 0.16, w * 1.3, [0, 0, 0], { axis: 'x', seg: 8 });
    k.cyl(iron, r * 0.08, r * 0.08, w * 1.5, [0, 0, 0], { axis: 'x', seg: 6 });
    return k.geometry();
  });
}
/** Motorbike wheel: fat tyre band, dark disc, cast spokes, hub. */
export function bikeWheelGeo(r, w, o = {}) {
  return wheelCache(`bike|${r}|${w}|${o.rim}|${o.spokes}|${o.disc}`, () => {
    const k = new Kit(6);
    const hw = w / 2, rim = o.rim || PAL.chrome, disc = o.disc || '#202123';
    k.lathe(PAL.tyre, [[r * 0.74, -hw], [r, -hw * 0.55], [r, hw * 0.55], [r * 0.74, hw]], 14, [0, 0, 0], { axis: 'x' });
    for (const s of [1, -1]) {
      k.lathe(rim, s > 0 ? [[r * 0.76, hw * 0.6], [r * 0.66, hw * 0.5]] : [[r * 0.66, -hw * 0.5], [r * 0.76, -hw * 0.6]], 14, [0, 0, 0], { axis: 'x' });
      k.lathe(disc, s > 0 ? [[r * 0.66, hw * 0.3], [0, hw * 0.3]] : [[0, -hw * 0.3], [r * 0.66, -hw * 0.3]], 10, [0, 0, 0], { axis: 'x' });
    }
    const n = o.spokes || 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      k.at([0, 0, 0], [a, 0, 0], () => k.box(rim, [w * 0.75, r * 0.6, 0.05], [0, r * 0.36, 0]));
    }
    k.cyl(shade(rim, 0.8), r * 0.18, r * 0.18, w * 0.95, [0, 0, 0], { axis: 'x', seg: 8 });
    if (o.brake) k.cyl('#7d7f80', r * 0.5, r * 0.5, 0.02, [hw * 0.45, 0, 0], { axis: 'x', seg: 10 });
    return k.geometry();
  });
}
/** Steel railway wheel with a flange on the inner side. */
export function railWheelGeo(r, w) {
  return wheelCache(`rail|${r}|${w}`, () => {
    const k = new Kit(7);
    const hw = w / 2;
    k.lathe('#3a3836', [[r * 0.3, hw], [r * 0.92, hw], [r, hw * 0.6], [r, -hw * 0.4], [r + 0.05, -hw * 0.6], [r + 0.05, -hw], [r * 0.3, -hw]], 12, [0, 0, 0], { axis: 'x' });
    k.cyl('#585552', r * 0.3, r * 0.3, w + 0.06, [0, 0, 0], { axis: 'x', seg: 8 });
    return k.geometry();
  });
}
/** Car wheel with a white sidewall ring and a domed hubcap (1950s/70s). */
export function whitewallWheelGeo(r, w, o = {}) {
  return wheelCache(`ww|${r}|${w}|${o.cap}|${o.center}`, () => {
    const k = new Kit(8);
    const hw = w / 2, cap = o.cap || PAL.chrome;
    k.lathe(PAL.tyre, [[r * 0.7, -hw], [r, -hw * 0.6], [r, hw * 0.6], [r * 0.7, hw]], 10, [0, 0, 0], { axis: 'x' });
    k.lathe('#e8e3d4', [[r * 0.93, hw * 0.75 + 0.004], [r * 0.74, hw + 0.006]], 10, [0, 0, 0], { axis: 'x' });
    k.lathe(cap, [[r * 0.72, hw - 0.01], [r * 0.42, hw + 0.025], [0, hw + 0.045]], 10, [0, 0, 0], { axis: 'x' });
    k.cyl(o.center || shade(cap, 0.8), r * 0.12, r * 0.12, 0.03, [hw + 0.05, 0, 0], { axis: 'x', seg: 6 });
    k.lathe('#1c1c1d', [[0, -hw + 0.03], [r * 0.7, -hw + 0.03]], 10, [0, 0, 0], { axis: 'x' });
    return k.geometry();
  });
}
/** Four named wheels using the base wheelGeometry styles. */
export function fourWheels(k, rig, { zf, zr, x, xf, r, w, style, y }) {
  const yy = y ?? r, fx = xf ?? x;
  addWheel(k, rig, 'wheel_fl', [fx, yy, zf], r, w, 1, style);
  addWheel(k, rig, 'wheel_fr', [-fx, yy, zf], r, w, -1, style);
  addWheel(k, rig, 'wheel_rl', [x, yy, zr], r, w, 1, style);
  addWheel(k, rig, 'wheel_rr', [-x, yy, zr], r, w, -1, style);
}

// ── painting helpers ─────────────────────────────────────────────────────────
/** Mud / dust band low on both flanks, plus splashes behind each wheel. */
export function grimeBand(k, hw, z0, z1, y0, color, wheels = [], seed = 1, h = 0.18) {
  k.side(color, hw, [[z0, y0], [z1, y0], [z1, y0 + h], [z0, y0 + h]], { off: 0.017 });
  wheels.forEach(([zc, r], i) => {
    for (const s of [1, -1]) sideBlob(k, color, hw, zc - r * 1.25, y0 + h * 1.1, r * 0.45, h * 0.9, seed + i * 7 + s, s, 0.021);
  });
}
/** Painted rivets: small dark squares along a line on a side plane. */
export function rivets(k, hw, z0, z1, y, n, color = '#151a26', s = 0.035, side) {
  for (let i = 0; i < n; i++) {
    const z = lerp(z0, z1, n > 1 ? i / (n - 1) : 0.5);
    k.side(color, hw, [[z - s / 2, y - s / 2], [z + s / 2, y - s / 2], [z + s / 2, y + s / 2], [z - s / 2, y + s / 2]], { off: 0.022, side });
  }
}
/** Diagonal hazard stripes on a front/back plane (z = Z, facing dir) across x0..x1, y0..y1. */
export function hazardStripes(k, z, x0, x1, y0, y1, dir = -1, a = PAL.yellow, b = '#1f2022', n = 6) {
  k.front(a, z, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], dir, { off: 0.012 });
  const w = (x1 - x0) / n, h = y1 - y0;
  for (let i = 0; i < n; i++) {
    const xa = x0 + i * w, pts = clipRectX([[xa, y0], [xa + w * 0.5, y0], [xa + w * 0.5 + h * 0.6, y1], [xa + h * 0.6, y1]], x0, x1);
    if (pts.length >= 3) k.front(b, z, pts, dir, { off: 0.016 });
  }
}
function clipRectX(pts, x0, x1) {
  const clip = (poly, keep, at) => { const out = []; for (let i = 0; i < poly.length; i++) { const c = poly[i], p = poly[(i + poly.length - 1) % poly.length]; const ci = keep(c), pi = keep(p); if (ci) { if (!pi) out.push(at(p, c)); out.push(c); } else if (pi) out.push(at(p, c)); } return out; };
  const atX = (X) => (p, q) => { const t = (X - p[0]) / (q[0] - p[0]); return [X, p[1] + (q[1] - p[1]) * t]; };
  return clip(clip(pts, (p) => p[0] >= x0, atX(x0)), (p) => p[0] <= x1, atX(x1));
}

// ── generic car shell (like the base carBody) ────────────────────────────────
/**
 * s: { W, profile [[z,y]..] (CCW, first = rear bottom), bevel, cabin {y0,y1,zb,zt,wb,wt}, color, cabinColor, roofColor,
 *      glass, frame, pillarSplit, wheel {r, zf, zr}, archColor, noDirt }
 */
export function carShell(k, s) {
  const hw = s.W / 2, col = s.color;
  k.extrude(col, s.profile, s.W, { axis: 'x', bevel: s.bevel ?? 0.07 });
  k.box(PAL.under, [s.W * 0.8, 0.16, Math.abs(s.profile[1][0] - s.profile[0][0]) * 0.86], [0, s.wheel.r * 0.75, (s.profile[1][0] + s.profile[0][0]) / 2]);
  const faces = k.frustum({ default: s.cabinColor || col, top: s.roofColor || s.cabinColor || col }, s.cabin);
  const glass = s.glass || PAL.glass, fr = s.frame || '#262729';
  k.patch(fr, faces.front, [0.03, 0.97], [0.04, 0.95], { off: 0.008 });
  k.patch(glass, faces.front, [0.07, 0.93], [0.09, 0.9], { off: 0.014 });
  k.patch(s.sheen || PAL.glassHi, faces.front, [0.62, 0.7], [0.14, 0.85], { off: 0.018, skew: -0.08 });
  k.patch(fr, faces.back, [0.05, 0.95], [0.06, 0.94], { off: 0.008 });
  k.patch(glass, faces.back, [0.09, 0.91], [0.12, 0.9], { off: 0.014 });
  const split = s.pillarSplit || [[0.05, 0.47], [0.53, 0.93]];
  for (const f of [faces.left, faces.right]) {
    k.patch(fr, f, [0.02, 0.98], [0.06, 0.94], { off: 0.008 });
    for (const [u0, u1] of split) k.patch(glass, f, [u0, u1], [0.12, 0.88], { off: 0.014 });
  }
  const { r, zf, zr } = s.wheel;
  const yb = s.profile[0][1];
  arch(k, hw, zf, r, r + 0.08, yb, s.archColor || '#1a1a1b', s.archLip ? { lip: s.archLip } : {});
  if (!s.noRearArch) arch(k, hw, zr, r, r + (s.rearArchGrow || 0.08), yb, s.archColor || '#1a1a1b', s.archLip ? { lip: s.archLip } : {});
  if (!s.noDirt) {
    const dz0 = s.profile[0][0] + 0.12, dz1 = s.profile[1][0] - 0.12;
    k.side(mix(col, PAL.dirt, 0.4), hw, [[dz0, yb + 0.02], [dz1, yb + 0.02], [dz1, yb + 0.14], [dz0, yb + 0.14]], { off: 0.016 });
  }
  return faces;
}
/** Head/tail lamps, grille and bumpers (like the base carLights). */
export function carLamps(k, s) {
  const { fz, rz, fy, ry, fx = s.W / 2 - 0.3, rx = s.W / 2 - 0.26 } = s.lights;
  for (const sd of [1, -1]) {
    k.box(PAL.headlight, [s.headW || 0.3, 0.12, 0.06], [sd * fx, fy, fz], { c: 0.02 });
    k.box(PAL.amber, [0.1, 0.08, 0.05], [sd * (fx + 0.22), fy - 0.02, fz - 0.02]);
    k.box(PAL.taillight, [s.tailW || 0.3, 0.14, 0.06], [sd * rx, ry, rz], { c: 0.02 });
  }
  k.box(s.grille || PAL.grille, [s.W * 0.42, 0.12, 0.05], [0, fy - 0.04, fz]);
  const bc = s.bumper || '#3a3b3e';
  k.box(bc, [s.W * 0.98, 0.17, 0.2], [0, s.bumperY ?? 0.42, fz - 0.02], { c: 0.04 });
  k.box(s.rearBumper || bc, [s.W * 0.98, 0.17, 0.2], [0, s.bumperY ?? 0.42, rz + 0.02], { c: 0.04 });
  k.box(PAL.plate, [0.36, 0.12, 0.02], [0, (s.bumperY ?? 0.42) + 0.02, rz - 0.09]);
}
export function mirrors(k, W, y, z, color) { for (const s of [1, -1]) k.box(color, [0.16, 0.12, 0.08], [s * (W / 2 + 0.06), y, z], { c: 0.02 }); }
export function doorSeams(k, hw, zs, y0, y1, color) { for (const z of zs) k.side(color, hw, [[z - 0.012, y0], [z + 0.012, y0], [z + 0.012, y1], [z - 0.012, y1]], { off: 0.018 }); }
export function handles(k, hw, zs, y, c = '#2b2b2c') { for (const z of zs) for (const s of [1, -1]) k.box(c, [0.03, 0.03, 0.12], [s * (hw + 0.012), y, z]); }
/** Five-point star badge on a side plane. */
export function badge(k, hw, zc, yc, r, color, side) {
  const pts = [];
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2; const rr = i % 2 ? r * 0.45 : r; pts.push([zc + Math.cos(a) * rr, yc + Math.sin(a) * rr]); }
  k.side(color, hw, pts, { side, off: 0.024 });
}
/** Heavy black police push bar at the front (fz = bumper z). */
export function pushBar(k, fz, y0, wide = 1.0, c = '#18191b') {
  for (const s of [1, -1]) {
    k.box(c, [0.07, 0.62, 0.07], [s * wide * 0.42, y0 + 0.31, fz + 0.18]);
    k.box(c, [0.06, 0.06, 0.22], [s * wide * 0.42, y0 + 0.1, fz + 0.08]);
  }
  k.box(c, [wide, 0.07, 0.07], [0, y0 + 0.6, fz + 0.18]);
  k.box(c, [wide, 0.06, 0.06], [0, y0 + 0.36, fz + 0.2]);
  k.box(c, [wide * 1.2, 0.14, 0.12], [0, y0 + 0.08, fz + 0.12], { c: 0.02 });
}

// ── truck cabs ───────────────────────────────────────────────────────────────
/**
 * Long-nose conventional cab (log haulers, flatbeds, float base). Rear of cab at z0; front wheels at z0 + 3.25.
 * Returns { zFront, zw (front axle), hw (cab half width) }.
 */
export function longNoseCab(k, o) {
  const z0 = o.z0, c = o.color, W = o.W || 2.4, chw = W / 2, hoodW = o.hoodW || 1.42, wr = o.wr || 0.5;
  const dirt = mix(c, PAL.dirt, 0.45);
  // cab block (with a rear sleeper bulge option)
  const cab = [[z0, 0.72], [z0 + 2.0, 0.72], [z0 + 2.02, 1.98], [z0 + 1.78, 2.98], [z0 + 1.6, 3.08], [z0 + 0.14, 3.1], [z0, 2.98]];
  k.extrude(c, cab, W, { axis: 'x', bevel: 0.08 });
  // hood
  const zh = z0 + 4.35;
  const hood = [[z0 + 1.9, 0.92], [zh - 0.1, 0.92], [zh, 1.18], [zh - 0.02, 1.82], [zh - 0.2, 1.97], [z0 + 1.9, 2.02]];
  k.extrude(c, hood, hoodW, { axis: 'x', bevel: 0.07 });
  // fenders
  const zw = z0 + 3.25, yc = wr;
  const fender = [];
  for (let i = 0; i <= 8; i++) { const a = Math.PI * (0.96 - 0.92 * i / 8); fender.push([zw + Math.cos(a) * (wr + 0.2), yc + Math.sin(a) * (wr + 0.2)]); }
  fender.push([zh - 0.02, yc + 0.18]);
  for (let i = 8; i >= 0; i--) { const a = Math.PI * (0.96 - 0.92 * i / 8); fender.push([zw + Math.cos(a) * (wr + 0.08), yc + Math.sin(a) * (wr + 0.08)]); }
  for (const s of [1, -1]) k.extrude(o.fender || c, fender, 0.46, { axis: 'x', pos: [s * (hoodW / 2 + 0.22), 0, 0], bevel: 0.04 });
  // grille + bumper + lamps
  k.front(PAL.chrome, zh, [[-0.6, 0.98], [0.6, 0.98], [0.6, 1.86], [-0.6, 1.86]], 1, { off: 0.012 });
  k.front('#2a2b2d', zh, [[-0.52, 1.04], [0.52, 1.04], [0.52, 1.8], [-0.52, 1.8]], 1, { off: 0.018 });
  for (let i = 0; i < 7; i++) k.front('#8f8e88', zh, [[-0.5 + i * 0.165, 1.04], [-0.47 + i * 0.165, 1.04], [-0.47 + i * 0.165, 1.8], [-0.5 + i * 0.165, 1.8]], 1, { off: 0.022 });
  k.box(o.bumper || PAL.chrome, [2.4, 0.28, 0.26], [0, 0.72, zh + 0.12], { c: 0.05 });
  for (const s of [1, -1]) {
    k.cyl(PAL.chrome, 0.15, 0.15, 0.08, [s * (hoodW / 2 + 0.22), 1.12, zh - 0.32], { axis: 'z', seg: 8 });
    k.cyl(PAL.headlight, 0.11, 0.11, 0.02, [s * (hoodW / 2 + 0.22), 1.12, zh - 0.27], { axis: 'z', seg: 8 });
    k.box(PAL.amber, [0.1, 0.06, 0.04], [s * 0.7, 3.1, z0 + 1.62]);
    // stacks behind the cab
    if (o.stacks !== false) {
      k.cyl(PAL.chrome, 0.08, 0.08, 2.9, [s * (chw - 0.08), 2.25, z0 - 0.15], { seg: 7 });
      k.cyl('#2b2a28', 0.085, 0.085, 0.1, [s * (chw - 0.08), 3.72, z0 - 0.15], { seg: 7 });
    }
    // fuel tank + step
    k.cyl(PAL.chrome, 0.28, 0.28, 1.0, [s * (chw - 0.1), 0.62, z0 + 0.7], { axis: 'z', seg: 9 });
    k.box('#3a3b3d', [0.18, 0.08, 0.5], [s * (chw + 0.02), 0.95, z0 + 1.6]);
    // mirrors
    k.box('#2a2a2b', [0.06, 0.5, 0.16], [s * (chw + 0.25), 2.25, z0 + 2.0], { c: 0.02 });
    k.box('#2a2a2b', [0.26, 0.04, 0.04], [s * (chw + 0.12), 2.45, z0 + 2.0]);
  }
  // glass
  edgeQuad(k, '#252628', [z0 + 2.02, 1.98], [z0 + 1.78, 2.98], [-chw + 0.1, chw - 0.1], [0.05, 0.94]);
  edgeQuad(k, PAL.glass, [z0 + 2.02, 1.98], [z0 + 1.78, 2.98], [-chw + 0.16, -0.05], [0.1, 0.9], 0.02);
  edgeQuad(k, PAL.glass, [z0 + 2.02, 1.98], [z0 + 1.78, 2.98], [0.05, chw - 0.16], [0.1, 0.9], 0.02);
  edgeQuad(k, PAL.glassHi, [z0 + 2.02, 1.98], [z0 + 1.78, 2.98], [0.4, 0.52], [0.15, 0.85], 0.024);
  k.side('#252628', chw, [[z0 + 0.95, 2.0], [z0 + 1.92, 2.0], [z0 + 1.72, 2.88], [z0 + 0.95, 2.88]], { off: 0.016 });
  k.side(PAL.glass, chw, [[z0 + 1.0, 2.05], [z0 + 1.85, 2.05], [z0 + 1.68, 2.82], [z0 + 1.0, 2.82]], { off: 0.022 });
  k.side(shade(c, 0.72), chw, [[z0 + 0.82, 0.8], [z0 + 0.86, 0.8], [z0 + 0.86, 2.92], [z0 + 0.82, 2.92]], { off: 0.016 });
  k.side(dirt, chw, [[z0 + 0.05, 0.74], [z0 + 1.98, 0.74], [z0 + 1.98, 0.95], [z0 + 0.05, 0.95]], { off: 0.018 });
  k.side(shade(c, 0.78), hoodW / 2, [[z0 + 2.4, 1.3], [zh - 0.4, 1.3], [zh - 0.4, 1.7], [z0 + 2.4, 1.7]], { off: 0.014 });
  for (let i = 0; i < 5; i++) k.side('#3a3a3a', hoodW / 2, [[z0 + 2.6 + i * 0.12, 1.36], [z0 + 2.66 + i * 0.12, 1.36], [z0 + 2.66 + i * 0.12, 1.64], [z0 + 2.6 + i * 0.12, 1.64]], { off: 0.02 });
  // chassis rails forward
  k.box(PAL.under, [1.1, 0.32, 4.4], [0, 0.62, z0 + 2.2]);
  return { zFront: zh + 0.25, zw, hw: chw };
}

/** Flat-fronted cab-over cab (car carrier, garbage truck). Rear at z0, length ~2.3 m; returns { zFront, zw }. */
export function flatCab(k, o) {
  const z0 = o.z0, c = o.color, W = o.W || 2.45, chw = W / 2, H = o.H || 3.15, len = o.len || 2.3, y0 = o.y0 || 0.75;
  const zf = z0 + len;
  const prof = [[z0, y0], [zf - 0.05, y0], [zf + 0.05, y0 + 0.25], [zf + 0.05, y0 + 1.0], [zf - 0.08, H - 0.15], [zf - 0.3, H], [z0 + 0.1, H], [z0, H - 0.12]];
  k.extrude(c, prof, W, { axis: 'x', bevel: 0.1 });
  // windshield (big) + side windows
  edgeQuad(k, '#232426', [zf + 0.05, y0 + 1.0], [zf - 0.08, H - 0.15], [-chw + 0.08, chw - 0.08], [0.02, 0.96]);
  edgeQuad(k, PAL.glass, [zf + 0.05, y0 + 1.0], [zf - 0.08, H - 0.15], [-chw + 0.14, -0.04], [0.06, 0.92], 0.02);
  edgeQuad(k, PAL.glass, [zf + 0.05, y0 + 1.0], [zf - 0.08, H - 0.15], [0.04, chw - 0.14], [0.06, 0.92], 0.02);
  edgeQuad(k, PAL.glassHi, [zf + 0.05, y0 + 1.0], [zf - 0.08, H - 0.15], [0.35, 0.48], [0.1, 0.88], 0.024);
  k.side('#232426', chw, [[zf - 1.15, y0 + 1.05], [zf - 0.12, y0 + 1.05], [zf - 0.2, H - 0.2], [zf - 1.15, H - 0.2]], { off: 0.016 });
  k.side(PAL.glass, chw, [[zf - 1.1, y0 + 1.1], [zf - 0.18, y0 + 1.1], [zf - 0.25, H - 0.25], [zf - 1.1, H - 0.25]], { off: 0.022 });
  k.side(shade(c, 0.74), chw, [[zf - 1.22, y0 + 0.1], [zf - 1.19, y0 + 0.1], [zf - 1.19, H - 0.12], [zf - 1.22, H - 0.12]], { off: 0.016 });
  // grille, lamps, bumper
  k.front('#2a2b2d', zf + 0.05, [[-0.8, y0 + 0.35], [0.8, y0 + 0.35], [0.8, y0 + 0.9], [-0.8, y0 + 0.9]], 1, { off: 0.014 });
  for (let i = 0; i < 4; i++) k.front('#77766f', zf + 0.05, [[-0.78, y0 + 0.42 + i * 0.12], [0.78, y0 + 0.42 + i * 0.12], [0.78, y0 + 0.46 + i * 0.12], [-0.78, y0 + 0.46 + i * 0.12]], 1, { off: 0.02 });
  for (const s of [1, -1]) {
    k.box(PAL.headlight, [0.3, 0.16, 0.06], [s * (chw - 0.3), y0 + 0.62, zf + 0.06], { c: 0.02 });
    k.box(PAL.amber, [0.12, 0.08, 0.05], [s * (chw - 0.1), y0 + 0.62, zf + 0.05]);
    k.box(PAL.amber, [0.1, 0.06, 0.04], [s * 0.7, H, zf - 0.32]);
    k.box('#2a2a2b', [0.06, 0.55, 0.16], [s * (chw + 0.24), y0 + 1.6, zf - 0.2], { c: 0.02 });
    k.box('#2a2a2b', [0.26, 0.04, 0.04], [s * (chw + 0.12), y0 + 1.82, zf - 0.2]);
    k.box('#3a3b3d', [0.16, 0.07, 0.42], [s * (chw + 0.02), y0 + 0.1, zf - 0.7]);
  }
  k.box(o.bumper || '#3a3b3d', [W + 0.02, 0.3, 0.24], [0, y0 + 0.02, zf + 0.1], { c: 0.05 });
  k.side(mix(c, PAL.dirt, 0.45), chw, [[z0 + 0.05, y0 + 0.02], [zf - 0.05, y0 + 0.02], [zf - 0.05, y0 + 0.24], [z0 + 0.05, y0 + 0.24]], { off: 0.018 });
  k.box(PAL.under, [1.1, 0.32, len], [0, 0.62, z0 + len / 2]);
  return { zFront: zf + 0.25, zw: zf - 0.85 };
}

/** Compact parked car (car-carrier cargo, parade decorations): ~3.6 × 1.7 × 1.4, wheels baked in, centred on the origin. */
export function miniCar(k, color, o = {}) {
  const W = 1.7, hw = W / 2, r = 0.3;
  const prof = [[-1.78, 0.22], [1.76, 0.22], [1.82, 0.46], [1.76, 0.64], [1.5, 0.74], [0.7, 0.8], [-1.6, 0.84], [-1.82, 0.62]];
  k.extrude(color, prof, W, { axis: 'x', bevel: 0.06 });
  const cab = o.hatch
    ? { y0: 0.8, y1: 1.32, zb: [-1.66, 0.7], zt: [-1.42, 0.0], wb: 0.8, wt: 0.66 }
    : { y0: 0.8, y1: 1.3, zb: [-1.2, 0.72], zt: [-0.86, 0.05], wb: 0.8, wt: 0.66 };
  const f = k.frustum({ default: color, top: o.roof || color }, cab);
  k.patch(PAL.glass, f.front, [0.06, 0.94], [0.08, 0.9], { off: 0.01 });
  k.patch(PAL.glassHi, f.front, [0.6, 0.7], [0.14, 0.85], { off: 0.014, skew: -0.08 });
  k.patch(PAL.glass, f.back, [0.08, 0.92], [0.1, 0.9], { off: 0.01 });
  for (const fc of [f.left, f.right]) { k.patch(PAL.glass, fc, [0.06, 0.47], [0.12, 0.88], { off: 0.01 }); k.patch(PAL.glass, fc, [0.53, 0.94], [0.12, 0.88], { off: 0.01 }); }
  for (const s of [1, -1]) {
    k.front(PAL.headlight, 1.79, [[s * 0.43, 0.53], [s * 0.69, 0.53], [s * 0.69, 0.63], [s * 0.43, 0.63]], 1, { off: 0.012 });
    k.front(PAL.taillight, -1.81, [[s * 0.47, 0.6], [s * 0.73, 0.6], [s * 0.73, 0.72], [s * 0.47, 0.72]], -1, { off: 0.012 });
  }
  k.box('#3a3b3e', [W * 0.98, 0.14, 0.14], [0, 0.36, 1.78]);
  k.box('#3a3b3e', [W * 0.98, 0.14, 0.14], [0, 0.36, -1.8]);
  for (const zc of [1.15, -1.15]) {
    arch(k, hw, zc, r, r + 0.06, 0.22, '#1a1a1b');
    for (const s of [1, -1]) {
      k.cyl(PAL.tyre, r, r, 0.2, [s * (hw - 0.1), r, zc], { axis: 'x', seg: 7 });
      k.box(PAL.rim, [0.02, r * 0.9, r * 0.9], [s * (hw + 0.005), r, zc]);
    }
  }
  k.side(mix(color, PAL.dirt, 0.35), hw, [[-1.7, 0.24], [1.7, 0.24], [1.7, 0.34], [-1.7, 0.34]], { off: 0.016 });
}
