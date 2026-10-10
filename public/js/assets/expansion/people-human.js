// ─────────────────────────────────────────────────────────────────────────────
// people-human.js — shared human builder for the PEOPLE & ANIMALS expansion pack.
//
// `human()` is a faithful copy of models/characters.js `buildHuman` (which is not
// exported there): with no pose options it produces the SAME vertices as the base
// characters (the self-test in the pack checks our Doc copy against `cook`), so new
// people stand beside Rook, Doc and the peds seamlessly. Extensions (all optional):
//   arms: { l|r: { ik:[x,y,z] hand-centre target, pole:[x,y,z] elbow direction } | { rot:[rx,ry,rz], bend } }
//   legs: { l|r: { rot:[rx,ry,rz], knee } | { ik:[x,y,z] ankle target, pole:[x,y,z] knee direction } }
//   headRot, extrasFore(k, s, d) (forearm frame), held(k, s, handPos) (human space, weighted to the arm),
//   extra hair styles (bun, long, braid), beards, handlebar moustache and many more hats (HATS below).
// Poses are BAKED into the limb geometry; every pivot keeps rotation 0 in the bind pose, so the
// game's walk cycle (absolute rotation.x on leg_*/arm_*) still works.
//
// `bakeRigid()` turns the Kit + Rig into the rigid hierarchy every model must be: named
// Object3D pivots, each holding a plain Mesh `<name>_mesh` (one shared vertex-colour material).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Kit, Rig, root, measure } from '../models/kit.js';
import { PAL, mix, shade, vcolMaterial } from '../palette.js';

export const HIP_Y = 0.88, HIP_X = 0.105;
export const SH_Y = 1.39, SH_X = 0.235;
export const NECK_Y = 1.47;
export const UPPER = 0.3, LOWER = 0.27, THIGH = 0.42, SHIN = 0.4;
export const SK = PAL.skin, HR = PAL.hair;

const V3 = THREE.Vector3, M4 = THREE.Matrix4;
const T = (x, y, z) => new M4().makeTranslation(x, y, z);
const RX = (a) => new M4().makeRotationX(a);
const EUL = (r) => new M4().makeRotationFromEuler(new THREE.Euler(r[0] || 0, r[1] || 0, r[2] || 0, 'XYZ'));
const clamp1 = (v) => Math.max(-1, Math.min(1, v));

/**
 * Two-bone IK in human space. S = root joint, Tg = end target, pole = preferred direction of the
 * middle joint. Returns the limb basis (local −Y along the first bone, local +Z toward which the
 * second bone bends if bendSign > 0, away if < 0) and the bend angle.
 */
export function limbIK(S, Tg, pole, L1, L2, bendSign = 1) {
  const s = new V3(...S), t = new V3(...Tg);
  const d0 = t.clone().sub(s);
  const dir = d0.clone().normalize();
  const d = Math.min(Math.max(d0.length(), Math.abs(L1 - L2) + 1e-3), L1 + L2 - 1e-3);
  const A = Math.acos(clamp1((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
  const G = Math.acos(clamp1((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2)));
  const bend = Math.PI - G;
  const p = new V3(...pole);
  p.addScaledVector(dir, -p.dot(dir));
  if (p.lengthSq() < 1e-8) p.set(0, 0, -bendSign).addScaledVector(dir, -dir.z * -bendSign);
  p.normalize();
  const up = dir.clone().multiplyScalar(Math.cos(A)).addScaledVector(p, Math.sin(A)); // root → middle joint
  const mid = s.clone().addScaledVector(up, L1);
  const end = s.clone().addScaledVector(dir, d);
  const fore = end.sub(mid);
  const Y = up.clone().negate();
  const Z = fore.clone().addScaledVector(up, -fore.dot(up));
  if (Z.lengthSq() < 1e-8) Z.set(0, 0, 1).addScaledVector(Y, -Y.z);
  Z.normalize().multiplyScalar(bendSign);
  const X = new V3().crossVectors(Y, Z);
  return { m: new M4().makeBasis(X, Y, Z), bend };
}

// ── extra hats (names the base builder does not know) ───────────────────────
// each: (k, d = {HW, HH, HD, hy}, o) in head (neck-pivot) space
export const HATS = {
  // police peaked cap: crown flaring out, black band, angled visor, small badge
  peaked: (k, d, o) => {
    const c = o.hatColor || '#232e48', top = d.hy + d.HH / 2;
    k.box(c, [d.HW + 0.035, 0.085, d.HD + 0.03], [0, top + 0.012, -0.005], { cv: true, c: 0.035, taper: [1.14, 1.16] });
    k.box('#16181c', [d.HW + 0.04, 0.035, d.HD + 0.035], [0, top - 0.025, -0.005], { cv: true, c: 0.03 });
    k.box('#121316', [d.HW * 0.86, 0.018, 0.1], [0, top - 0.048, d.HD / 2 + 0.045], { rot: [0.28, 0, 0] });
    k.box(o.hatBadge || '#d2ad55', [0.05, 0.045, 0.012], [0, top + 0.004, d.HD / 2 + 0.024]);
  },
  // wide flat-brimmed hat (Kestrel): pinched crown, dark band, broad brim
  wide: (k, d, o) => {
    const c = o.hatColor, top = d.hy + d.HH / 2;
    k.box(c, [d.HW + 0.03, 0.15, d.HD + 0.03], [0, top + 0.055, 0], { cv: true, c: 0.035, taper: [0.86, 0.8] });
    k.box(shade(c, 0.86), [0.04, 0.015, d.HD * 0.6], [0, top + 0.128, 0]); // crown pinch
    k.box(o.hatBand || '#1d1c1e', [d.HW + 0.035, 0.035, d.HD + 0.035], [0, top + 0.0, 0], { cv: true, c: 0.03 });
    k.cyl(c, 0.32, 0.33, 0.02, [0, top - 0.018, 0.0], { seg: 10, rot: [0.06, 0, 0] });
  },
  // straw hat: round crown, frayed brim, coloured band
  straw: (k, d, o) => {
    const c = o.hatColor || '#cfb27a', top = d.hy + d.HH / 2;
    k.box(c, [d.HW + 0.03, 0.12, d.HD + 0.03], [0, top + 0.04, 0], { cv: true, c: 0.05, taper: [0.86, 0.86] });
    k.box(o.hatBand || '#7a4a32', [d.HW + 0.034, 0.03, d.HD + 0.034], [0, top + 0.0, 0]);
    k.cyl(c, 0.29, 0.31, 0.02, [0, top - 0.015, 0], { seg: 9 });
  },
  beanie: (k, d, o) => {
    const c = o.hatColor, top = d.hy + d.HH / 2;
    k.box(c, [d.HW + 0.035, 0.13, d.HD + 0.035], [0, top - 0.005, -0.005], { cv: true, c: 0.05, taper: [0.82, 0.82] });
    k.box(shade(c, 0.82), [d.HW + 0.045, 0.055, d.HD + 0.045], [0, top - 0.07, -0.005], { cv: true, c: 0.04 });
  },
  // park ranger campaign hat: flat brim + four-dent pinched crown (a 4-sided peak)
  campaign: (k, d, o) => {
    const c = o.hatColor, top = d.hy + d.HH / 2;
    k.cyl(c, 0.3, 0.3, 0.018, [0, top - 0.012, 0], { seg: 10 });
    k.box(c, [d.HW + 0.02, 0.07, d.HD + 0.02], [0, top + 0.03, 0], { cv: true, c: 0.04 });
    k.cone(c, 0.17, 0.12, [0, top + 0.12, 0], { seg: 4, rot: [0, Math.PI / 4, 0] });
    k.box(o.hatBand || '#5a3e28', [d.HW + 0.025, 0.025, d.HD + 0.025], [0, top + 0.005, 0], { cv: true, c: 0.04 });
  },
  // marching-band shako: tall flared drum, black visor, gold plate + chin strap, plume
  shako: (k, d, o) => {
    const c = o.hatColor || '#efe7d4', top = d.hy + d.HH / 2;
    k.cyl(c, 0.165, 0.15, 0.27, [0, top + 0.1, 0], { seg: 8 });
    k.cyl('#1b1b1d', 0.168, 0.168, 0.03, [0, top - 0.02, 0], { seg: 8, open: true });
    k.box('#1b1b1d', [0.2, 0.016, 0.09], [0, top - 0.035, d.HD / 2 + 0.03], { rot: [0.3, 0, 0] });
    k.box('#cfa24a', [0.11, 0.1, 0.02], [0, top + 0.11, 0.155], { rot: [-0.06, 0, 0] });
    k.cyl(o.hatTrim || '#9e3a30', 0.166, 0.166, 0.03, [0, top + 0.215, 0], { seg: 8, open: true });
    k.box('#cfa24a', [d.HW + 0.03, 0.02, 0.03], [0, d.hy - 0.12, 0.03]); // chin strap
    k.box(o.plume || '#f1ece0', [0.06, 0.22, 0.06], [0, top + 0.33, 0.02], { taper: [1.4, 1.4] });
    k.box(o.hatTrim || '#9e3a30', [0.085, 0.07, 0.085], [0, top + 0.47, 0.02], { taper: [0.5, 0.5] });
  },
  // biker bandana: wrapped skull cap with a knot and two tails at the back
  bandana: (k, d, o) => {
    const c = o.hatColor, top = d.hy + d.HH / 2;
    k.box(c, [d.HW + 0.022, 0.11, d.HD + 0.022], [0, top - 0.02, -0.004], { cv: true, c: 0.04, taper: [0.9, 0.86] });
    k.box(shade(c, 0.8), [0.06, 0.05, 0.04], [0, top - 0.07, -d.HD / 2 - 0.02]);
    for (const s of [1, -1]) k.box(c, [0.04, 0.12, 0.015], [s * 0.03, top - 0.13, -d.HD / 2 - 0.035], { rot: [0.25, 0, s * 0.3] });
    for (const [x, y] of [[-0.06, 0.02], [0.06, 0.0]]) k.box(o.hatDots || '#e8dcc6', [0.022, 0.018, 0.01], [x, top - 0.035 + y, d.HD / 2 + 0.015]);
  },
  // The Midnight Comet: silver flight helmet (open lower face), wraparound teal visor, swept crest, orange ear discs
  comet: (k, d) => {
    const c = '#c3c7cb', top = d.hy + d.HH / 2;
    k.box(c, [d.HW + 0.05, 0.2, d.HD + 0.05], [0, top - 0.06, -0.012], { c: 0.06 });
    k.box(c, [d.HW + 0.05, 0.17, 0.09], [0, d.hy - 0.05, -d.HD / 2 + 0.01]);
    for (const s of [1, -1]) k.box(c, [0.03, 0.17, d.HD * 0.72], [s * (d.HW / 2 + 0.02), d.hy - 0.035, -0.01]);
    k.box('#2a8f8b', [d.HW + 0.065, 0.075, 0.05], [0, d.hy + 0.028, d.HD / 2 + 0.006]);
    k.box('#86d3cb', [0.06, 0.02, 0.006], [0.055, d.hy + 0.045, d.HD / 2 + 0.033], { rot: [0, 0, 0.35] });
    k.box('#eef0f1', [0.04, 0.07, d.HD + 0.02], [0, top + 0.05, -0.04], { shear: [0, -0.07] });
    for (const s of [1, -1]) k.box('#e0702a', [0.02, 0.075, 0.075], [s * (d.HW / 2 + 0.04), d.hy - 0.005, -0.005], { rot: [Math.PI / 4, 0, 0] });
  },
  // SWAT helmet with the visor down (tinted) and a neck guard
  riot: (k, d, o) => {
    const c = o.hatColor || '#20252e', top = d.hy + d.HH / 2;
    k.box(c, [d.HW + 0.08, 0.2, d.HD + 0.07], [0, top - 0.04, -0.012], { c: 0.06 });
    k.box(shade(c, 0.85), [d.HW + 0.06, 0.1, 0.05], [0, d.hy - 0.03, -d.HD / 2 - 0.03], { rot: [-0.2, 0, 0] });
    k.box('#33454f', [d.HW + 0.07, 0.15, 0.03], [0, d.hy + 0.03, d.HD / 2 + 0.035], { rot: [-0.08, 0, 0] });
    k.box('#15181d', [d.HW + 0.09, 0.025, d.HD + 0.08], [0, d.hy + 0.11, -0.01]); // rim
  },
};

/**
 * Build one human into an existing Kit + Rig (faithful copy of characters.js buildHuman + pose hooks).
 * ctx: { names: {body, head, arm_l, arm_r, leg_l, leg_r}, offset: [x,y,z], parent: boneName,
 *        legsOnBody: true → no leg pivots (legs baked into the body pivot) }
 */
export function human(K, rig, o, ctx = {}) {
  const N = { body: 'body', head: 'head', arm_l: 'arm_l', arm_r: 'arm_r', leg_l: 'leg_l', leg_r: 'leg_r', ...(ctx.names || {}) };
  const off = ctx.offset || [0, 0, 0];
  const P = (p) => [p[0] + off[0], p[1] + off[1], p[2] + off[2]];
  K.stack.push(K.M.clone().multiply(T(off[0], off[1], off[2])));
  const bw = o.build || 1;
  const skin = o.skin;
  const top = o.top, bottom = o.bottom;
  const bBody = rig.add(N.body, P([0, HIP_Y, 0]), ctx.parent ?? null);
  const bHead = rig.add(N.head, P([0, NECK_Y, 0]), N.body);

  // ── body (torso + hips + neck) ────────────────────────────────────────────
  const kb = K;
  K.bone = bBody;
  const torsoW = 0.44 * bw, torsoD = 0.25 * bw;
  const waistY = 0.98;
  if (o.topStyle === 'dress') {
    kb.box(top, [0.42, 0.44, 0.28], [0, 0.42, 0], { c: 0.05, cv: true, base: true, taper: [0.8, 0.82] });
    kb.box(shade(top, 0.9), [0.43, 0.04, 0.29], [0, 0.42, 0], { base: true });
  } else {
    kb.box(bottom, [0.36 * bw, 0.2, 0.23 * bw], [0, HIP_Y - 0.06, 0], { c: 0.04, cv: true, base: true });
  }
  const tCol = top;
  kb.box(tCol, [torsoW, SH_Y - waistY + 0.06, torsoD], [0, waistY - 0.04, 0], { c: 0.06, base: true, taper: [1.0, 1.0] });
  kb.box(tCol, [torsoW * 0.86, 0.12, torsoD * 0.92], [0, waistY - 0.1, 0], { c: 0.04, cv: true, base: true });
  kb.box(tCol, [torsoW + 0.06, 0.13, torsoD * 0.9], [0, SH_Y - 0.06, 0], { c: 0.05 });
  kb.cyl(skin, 0.055, 0.06, 0.1, [0, NECK_Y - 0.06, 0], { seg: 6 });
  if (o.belt) kb.box(o.belt, [torsoW * 0.88, 0.05, torsoD * 0.94], [0, waistY - 0.07, 0]);
  if (o.topStyle === 'tank') {
    for (const s of [1, -1]) kb.box(skin, [0.1, 0.135, torsoD * 0.88], [s * (torsoW / 2 - 0.0), SH_Y - 0.05, 0]);
  }
  if (o.topStyle === 'hoodie') {
    kb.box(shade(top, 0.9), [0.3, 0.14, 0.14], [0, NECK_Y - 0.06, -0.12], { c: 0.04, cv: true });
    kb.box(shade(top, 0.86), [0.24, 0.1, 0.02], [0, 1.08, torsoD / 2 + 0.006]);
    for (const s of [1, -1]) kb.box('#e6e2d6', [0.015, 0.1, 0.015], [s * 0.05, 1.3, torsoD / 2 + 0.01]);
  }
  if (o.topStyle === 'cardigan') {
    kb.box(shade(top, 1.15), [0.1, 0.44, 0.02], [0, 1.18, torsoD / 2 + 0.002]);
    for (let i = 0; i < 4; i++) kb.box('#e8dcc0', [0.02, 0.02, 0.02], [0.06, 1.0 + i * 0.1, torsoD / 2 + 0.012]);
  }
  if (o.topStyle === 'shirt' && o.collar) {
    kb.box(o.collar, [0.18, 0.06, 0.1], [0, NECK_Y - 0.08, 0.06]);
  }
  const dBody = { torsoW, torsoD, waistY, bw };
  if (o.extrasBody) o.extrasBody(kb, dBody);

  // ── head (built in neck-pivot space) ─────────────────────────────────────
  const kh = K;
  K.bone = bHead;
  K.stack.push(K.M.clone().multiply(T(0, NECK_Y, 0)).multiply(o.headRot ? EUL(o.headRot) : new M4()));
  const hs = (o.headScale || 1) * 1.08;
  const HW = 0.25 * hs, HH = 0.29 * hs, HD = 0.26 * hs;
  const hy = HH / 2 + 0.02;
  kh.box(skin, [HW, HH, HD], [0, hy, 0], { c: 0.045 });
  kh.box(skin, [HW * 0.86, 0.08, HD * 0.84], [0, hy - HH / 2 + 0.02, 0.01], { c: 0.03, cv: true });
  for (const s of [1, -1]) kh.box(shade(skin, 0.92), [0.03, 0.07, 0.05], [s * (HW / 2 + 0.01), hy, -0.01]);
  kh.box(shade(skin, 0.93), [0.05, 0.07, 0.05], [0, hy - 0.015, HD / 2 + 0.012]);
  if (!o.noMouth) kh.box(shade(skin, 0.62), [0.07, 0.014, 0.01], [0, hy - 0.075, HD / 2 + 0.002]);
  kh.box(shade(skin, 0.86), [0.035, 0.08, HD * 0.7], [-HW / 2 + 0.012, hy - 0.04, 0.0]);
  for (const s of [1, -1]) {
    if (!o.glasses && !o.noEyes) kh.box(PAL.eye, [0.032, 0.042, 0.02], [s * 0.055, hy + 0.025, HD / 2 + 0.002]);
    if (!o.noBrows) kh.box(shade(o.hair, 0.9), [0.06, 0.016, 0.02], [s * 0.058, hy + 0.068, HD / 2 + 0.003]);
  }
  const hair = o.hair;
  const hairTop = (h = 0.06) => kh.box(hair, [HW + 0.02, h, HD + 0.02], [0, hy + HH / 2 - h / 2 + 0.03, -0.005], { c: 0.03, cv: true });
  switch (o.hairStyle) {
    case 'bald': kh.box(hair, [HW + 0.012, 0.06, HD * 0.6], [0, hy + 0.02, -0.06], { c: 0.02, cv: true }); break;
    case 'buzz': hairTop(0.04); break;
    case 'white': hairTop(0.05); kh.box(hair, [HW + 0.02, 0.12, 0.06], [0, hy + 0.04, -HD / 2 + 0.01], { c: 0.02, cv: true }); break;
    case 'bob': hairTop(0.08); kh.box(hair, [HW + 0.05, 0.22, HD * 0.7], [0, hy - 0.02, -0.05], { c: 0.04 }); break;
    case 'pony': hairTop(0.07); kh.box(hair, [HW + 0.03, 0.16, 0.08], [0, hy + 0.02, -HD / 2 - 0.01]); kh.box(hair, [0.07, 0.18, 0.07], [0, hy - 0.06, -HD / 2 - 0.07], { rot: [0.3, 0, 0] }); break;
    // ── expansion styles ──
    case 'bun': hairTop(0.07); kh.box(hair, [HW + 0.03, 0.17, 0.08], [0, hy + 0.0, -HD / 2 - 0.0]); kh.box(hair, [0.13, 0.1, 0.09], [0, hy + 0.02, -HD / 2 - 0.07], { c: 0.03, cv: true }); break;
    case 'long': hairTop(0.07); kh.box(hair, [HW + 0.04, 0.36, 0.09], [0, hy - 0.08, -HD / 2 - 0.0], { c: 0.025, cv: true, taper: [1.05, 1] }); for (const s of [1, -1]) kh.box(hair, [0.04, 0.24, HD * 0.55], [s * (HW / 2 + 0.012), hy - 0.02, -0.04]); break;
    case 'braid': hairTop(0.07); kh.box(hair, [HW + 0.03, 0.15, 0.08], [0, hy + 0.02, -HD / 2 - 0.0]); kh.box(hair, [0.07, 0.3, 0.06], [0, hy - 0.2, -HD / 2 - 0.03], { rot: [0.12, 0, 0], c: 0.02, cv: true, taper: [0.7, 0.7] }); break;
    case 'none': break;
    default: hairTop(0.07); kh.box(hair, [HW + 0.02, 0.1, 0.06], [0, hy + 0.06, -HD / 2 + 0.01]);
  }
  if (o.stubble) kh.box(mix(skin, o.hair, 0.45), [HW * 0.88, 0.07, 0.03], [0, hy - HH / 2 + 0.05, HD / 2 - 0.005]);
  if (o.moustache) kh.box(o.moustacheColor || o.hair, [0.11, 0.025, 0.02], [0, hy - 0.06, HD / 2 + 0.006]);
  // ── expansion facial hair ──
  if (o.beard) {
    const bc = o.beardColor || o.hair, st = o.beard;
    if (st === 'goatee') {
      kh.box(bc, [0.08, 0.08, 0.035], [0, hy - HH / 2 + 0.035, HD / 2 + 0.0]);
      kh.box(bc, [0.11, 0.024, 0.02], [0, hy - 0.06, HD / 2 + 0.006]);
    } else {
      const big = st === 'big';
      kh.box(bc, [HW * 0.94, big ? 0.2 : 0.12, 0.06], [0, hy - HH / 2 + (big ? 0.0 : 0.04), HD / 2 - 0.01], { c: 0.025, cv: true, taper: [big ? 0.7 : 0.9, 1] });
      for (const s of [1, -1]) kh.box(bc, [0.03, 0.15, HD * 0.55], [s * (HW / 2 + 0.002), hy - 0.04, 0.02]);
      kh.box(shade(bc, 0.9), [0.12, 0.03, 0.025], [0, hy - 0.058, HD / 2 + 0.01]);
      kh.box(shade(skin, 0.6), [0.06, 0.014, 0.012], [0, hy - 0.083, HD / 2 + 0.024]); // mouth through the beard
    }
  }
  if (o.handlebar) {
    const mc = o.handlebar;
    kh.box(mc, [0.13, 0.03, 0.025], [0, hy - 0.058, HD / 2 + 0.008]);
    for (const s of [1, -1]) kh.box(mc, [0.025, 0.06, 0.02], [s * 0.075, hy - 0.04, HD / 2 + 0.008], { rot: [0, 0, s * -0.5] });
  }
  if (o.glasses) {
    const gc = o.glasses;
    if (o.glassesStyle === 'round') {
      for (const s of [1, -1]) kh.cyl(gc, 0.036, 0.036, 0.02, [s * 0.058, hy + 0.022, HD / 2 + 0.012], { axis: 'z', seg: 6 });
      kh.box('#c9a54a', [0.24, 0.012, 0.012], [0, hy + 0.03, HD / 2 + 0.006]);
    } else if (o.glassesStyle === 'aviator') {
      for (const s of [1, -1]) kh.box(gc, [0.078, 0.052, 0.018], [s * 0.058, hy + 0.02, HD / 2 + 0.011], { taper: [1.12, 1], rot: [0, 0, s * 0.12] });
      kh.box(o.frame || '#c9a54a', [0.25, 0.012, 0.014], [0, hy + 0.048, HD / 2 + 0.01]);
    } else if (o.glassesStyle === 'wrap') {
      kh.box(gc, [HW + 0.02, 0.05, 0.02], [0, hy + 0.025, HD / 2 + 0.01]);
      kh.box('#5c6b70', [0.05, 0.012, 0.005], [0.05, hy + 0.035, HD / 2 + 0.022]);
    } else {
      for (const s of [1, -1]) kh.box(gc, [0.075, 0.05, 0.02], [s * 0.058, hy + 0.025, HD / 2 + 0.01]);
      kh.box(gc, [0.24, 0.015, 0.015], [0, hy + 0.04, HD / 2 + 0.008]);
    }
    if (o.clearLenses) for (const s of [1, -1]) { kh.box(o.clearLenses, [0.055, 0.032, 0.01], [s * 0.058, hy + 0.025, HD / 2 + 0.021]); kh.box(PAL.eye, [0.024, 0.026, 0.01], [s * 0.055, hy + 0.024, HD / 2 + 0.026]); }
  }
  const hc = o.hatColor;
  const dHead = { HW, HH, HD, hy };
  switch (o.hat) {
    case 'cap':
      kh.box(hc, [HW + 0.03, 0.09, HD + 0.03], [0, hy + HH / 2 + 0.01, -0.005], { cv: true, c: 0.03, taper: [0.92, 0.9] });
      kh.box(o.hatFront || hc, [HW * 0.86, 0.085, 0.02], [0, hy + HH / 2 + 0.01, HD / 2 + 0.012]);
      kh.box(shade(hc, 0.8), [HW * 0.9, 0.02, 0.13], [0, hy + HH / 2 - 0.03, HD / 2 + 0.06], { rot: [0.12, 0, 0] });
      break;
    case 'hard':
      kh.box(hc, [HW + 0.05, 0.1, HD + 0.05], [0, hy + HH / 2 + 0.02, 0], { cv: true, c: 0.04, taper: [0.8, 0.8] });
      kh.box(hc, [HW + 0.12, 0.02, HD + 0.12], [0, hy + HH / 2 - 0.025, 0.02], { c: 0.03, cv: true });
      kh.box(shade(hc, 0.85), [0.03, 0.03, HD + 0.06], [0, hy + HH / 2 + 0.07, 0]);
      break;
    case 'cowboy':
      kh.box(hc, [HW + 0.02, 0.14, HD + 0.02], [0, hy + HH / 2 + 0.05, 0], { cv: true, c: 0.03, taper: [0.85, 0.75] });
      kh.box(o.hatBand || shade(hc, 0.75), [HW + 0.03, 0.025, HD + 0.03], [0, hy + HH / 2 - 0.005, 0]);
      kh.box(hc, [HW + 0.26, 0.02, HD + 0.22], [0, hy + HH / 2 - 0.02, 0], { c: 0.05, cv: true });
      for (const s of [1, -1]) kh.box(hc, [0.05, 0.05, HD + 0.16], [s * (HW / 2 + 0.13), hy + HH / 2 + 0.005, 0], { rot: [0, 0, s * 0.5] });
      break;
    case 'bucket':
      kh.box(hc, [HW + 0.03, 0.1, HD + 0.03], [0, hy + HH / 2 + 0.03, 0], { cv: true, c: 0.03, taper: [0.88, 0.88] });
      kh.box(hc, [HW + 0.14, 0.04, HD + 0.14], [0, hy + HH / 2 - 0.02, 0], { taper: [0.8, 0.8] });
      break;
    case 'headband': kh.box(hc, [HW + 0.02, 0.035, HD + 0.02], [0, hy + 0.07, 0]); break;
    case 'flat':
      kh.box(hc, [HW + 0.03, 0.06, HD + 0.04], [0, hy + HH / 2 + 0.0, 0.0], { cv: true, c: 0.025, taper: [0.95, 0.7], shear: [0, 0.03] });
      kh.box(hc, [HW * 0.9, 0.015, 0.06], [0, hy + HH / 2 - 0.02, HD / 2 + 0.03]);
      break;
    case 'sunhat':
      kh.box(hc, [HW + 0.02, 0.09, HD + 0.02], [0, hy + HH / 2 + 0.03, 0], { cv: true, c: 0.03, taper: [0.85, 0.85] });
      kh.cyl(hc, 0.3, 0.32, 0.02, [0, hy + HH / 2 - 0.01, 0], { seg: 10 });
      kh.box(o.hatBand || '#b85c6a', [HW + 0.03, 0.025, HD + 0.03], [0, hy + HH / 2 + 0.005, 0]);
      break;
    default: if (HATS[o.hat]) HATS[o.hat](kh, dHead, o); break;
  }
  if (o.extrasHead) o.extrasHead(kh, dHead);
  K.stack.pop();

  // ── arms ────────────────────────────────────────────────────────────────
  const sleeve = o.sleeve || 'long';
  const armCol = o.armColor || top;
  const handCol = o.gloves || skin;
  const hands = {};
  for (const s of [1, -1]) {
    const side = s > 0 ? 'l' : 'r';
    const ka = K;
    const apos = [s * SH_X * bw, SH_Y - 0.03, 0];
    const bone = rig.add(N['arm_' + side], P(apos), N.body);
    K.bone = bone;
    const pose = o.arms?.[side];
    let R = new M4().makeRotationZ(s * 0.06), bend = 0;
    if (pose?.ik) { const r = limbIK(apos, pose.ik, pose.pole || [s, -0.4, -0.4], UPPER, LOWER + 0.05, 1); R = r.m; bend = r.bend; }
    else if (pose) { R = EUL(pose.rot || [0, 0, s * 0.06]); bend = pose.bend || 0; }
    const shoulderM = T(...apos).multiply(R);
    K.stack.push(K.M.clone().multiply(shoulderM));
    const upper = UPPER, lower = LOWER;
    const ax = s * 0.005;
    const dArm = { upper, lower, ax, hand: [ax, -upper - lower - 0.05, 0.01] };
    ka.box(sleeve === 'none' ? skin : armCol, [0.11, upper + 0.04, 0.12], [ax, -upper / 2 + 0.01, 0], { c: 0.025, cv: true });
    if (sleeve === 'short') ka.box(armCol, [0.12, 0.1, 0.13], [ax, -0.2, 0]);
    if (bend > 0.45) ka.box(sleeve === 'long' ? armCol : skin, [0.1, 0.1, 0.11], [ax, -upper, 0]); // elbow filler
    // forearm + hand in the elbow frame
    const elbowM = bend ? T(0, -upper, 0).multiply(RX(-bend)).multiply(T(0, upper, 0)) : new M4();
    K.stack.push(K.M.clone().multiply(elbowM));
    const fore = sleeve === 'long' ? armCol : skin;
    ka.box(fore, [0.1, lower, 0.11], [ax, -upper - lower / 2 + 0.01, 0.0], { c: 0.025, cv: true });
    if (o.cuff) ka.box(o.cuff, [0.105, 0.03, 0.115], [ax, -upper - lower + 0.03, 0]);
    if (!o.noHands?.[side]) {
      ka.box(handCol, [0.1, 0.13, 0.12], [ax, -upper - lower - 0.05, 0.01], { c: 0.03, cv: true });
      ka.box(handCol, [0.035, 0.06, 0.04], [ax + s * -0.045, -upper - lower - 0.02, 0.05]);
    }
    if (o.gloves && o.gloveCuff) ka.box(o.gloves, [0.12, 0.1, 0.13], [ax, -upper - lower + 0.02, 0]);
    if (o.extrasFore) o.extrasFore(ka, s, dArm);
    K.stack.pop();
    if (o.extrasArm) o.extrasArm(ka, s, dArm);
    K.stack.pop();
    // hand centre in human space (for held props)
    const hm = shoulderM.clone().multiply(elbowM);
    hands[side] = new V3(...dArm.hand).applyMatrix4(hm).toArray();
    if (o.held) o.held(K, s, hands[side]);
  }

  // ── legs ────────────────────────────────────────────────────────────────
  for (const s of [1, -1]) {
    const side = s > 0 ? 'l' : 'r';
    const kl = K;
    const lpos = [s * HIP_X * bw, HIP_Y, 0];
    K.bone = ctx.legsOnBody ? bBody : rig.add(N['leg_' + side], P(lpos), N.body);
    const pose = o.legs?.[side];
    let R = null, knee = 0;
    if (pose?.ik) { const r = limbIK(lpos, pose.ik, pose.pole || [0, 0, 1], THIGH - 0.02, SHIN + 0.04, -1); R = r.m; knee = r.bend; }
    else if (pose) { R = EUL(pose.rot || [0, 0, 0]); knee = pose.knee || 0; }
    K.stack.push(K.M.clone().multiply(T(...lpos)).multiply(R || new M4()));
    const thigh = THIGH, shin = SHIN;
    const bStyle = o.bottomStyle || 'trousers';
    const legTop = o.topStyle === 'dress' ? skin : bottom;
    const shinCol = bStyle === 'trousers' ? bottom : skin;
    if (!(o.topStyle === 'dress')) kl.box(legTop, [0.15, thigh, 0.17], [0, -thigh / 2 + 0.02, 0], { c: 0.03, cv: true });
    if (bStyle === 'shorts') kl.box(bottom, [0.16, 0.2, 0.18], [0, -0.1, 0], { c: 0.03, cv: true });
    if (o.topStyle === 'dress') kl.box(skin, [0.13, thigh, 0.14], [0, -thigh / 2, 0], { c: 0.03, cv: true });
    if (knee > 0.45) kl.box(shinCol, [0.135, 0.12, 0.15], [0, -thigh + 0.02, 0]); // knee filler
    const kneeM = knee ? T(0, -thigh + 0.02, 0).multiply(RX(knee)).multiply(T(0, thigh - 0.02, 0)) : null;
    if (kneeM) K.stack.push(K.M.clone().multiply(kneeM));
    kl.box(shinCol, [0.13, shin, 0.14], [0, -thigh - shin / 2 + 0.06, 0], { c: 0.03, cv: true });
    if (o.socks) kl.box(o.socks, [0.135, 0.08, 0.145], [0, -HIP_Y + 0.12, 0]);
    const sh = o.shoes;
    const boot = o.boots;
    if (boot) kl.box(sh, [0.15, 0.2, 0.17], [0, -HIP_Y + 0.12, 0.0]);
    kl.box(sh, [0.15, 0.09, 0.28], [0, -HIP_Y + 0.045, 0.05], { c: 0.03, cv: true });
    kl.box(shade(sh, 0.6), [0.155, 0.025, 0.285], [0, -HIP_Y + 0.012, 0.05]);
    if (o.extrasLeg) o.extrasLeg(kl, s);
    if (kneeM) K.stack.pop();
    if (o.extrasThigh) o.extrasThigh(kl, s);
    K.stack.pop();
  }
  K.stack.pop(); // offset
  return { hands, head: P([0, NECK_Y, 0]) };
}

/**
 * Rigid bake: Rig defs → Object3D pivots (positions relative to parent, rotation 0), Kit triangles
 * bucketed by bone → `<bone>_mesh` (pivot-local, shared vcol material). `rotate` = { pivotName: Quaternion }
 * pre-rotates a leaf pivot (its mesh is counter-rotated so the model looks the same) — used so an
 * attachment's local +Z points along a useful direction (e.g. the hose nozzle's spray).
 */
export function bakeRigid(g, K, rig, rotate = {}) {
  const defs = rig.defs;
  const nodes = defs.map((d) => { const n = new THREE.Object3D(); n.name = d.name; if (d.order) n.rotation.order = d.order; return n; });
  defs.forEach((d, i) => {
    if (d.parent == null) { nodes[i].position.set(...d.pos); g.add(nodes[i]); return; }
    const pi = rig.index.get(d.parent), pp = defs[pi].pos;
    nodes[i].position.set(d.pos[0] - pp[0], d.pos[1] - pp[1], d.pos[2] - pp[2]);
    nodes[pi].add(nodes[i]);
  });
  const buckets = new Map();
  for (let v = 0; v < K.b.length; v += 3) {
    const b = K.b[v];
    let B = buckets.get(b); if (!B) buckets.set(b, (B = { p: [], c: [] }));
    const o = defs[b].pos;
    for (let j = v; j < v + 3; j++) {
      B.p.push(K.p[j * 3] - o[0], K.p[j * 3 + 1] - o[1], K.p[j * 3 + 2] - o[2]);
      B.c.push(K.c[j * 3], K.c[j * 3 + 1], K.c[j * 3 + 2]);
    }
  }
  const mat = vcolMaterial();
  for (const [b, B] of buckets) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
    const q = rotate[defs[b].name];
    if (q) geo.applyQuaternion(q.clone().invert());
    geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat);
    m.name = defs[b].name + '_mesh';
    m.castShadow = true; m.receiveShadow = true;
    nodes[b].add(m);
  }
  for (const [name, q] of Object.entries(rotate)) { const i = rig.index.get(name); if (i != null) nodes[i].quaternion.copy(q); }
  g.updateMatrixWorld(true);
  return Object.fromEntries(defs.map((d, i) => [d.name, nodes[i]]));
}

/** Standalone person: root + Kit + Rig + human() + rigid bake. `after(K, rig, info)` adds extra pivots. */
export function person(kind, variant, o, after) {
  const g = root(kind, variant, { w: 0.62, h: 1.78, l: 0.36 });
  const K = new Kit(1);
  const rig = new Rig();
  const info = human(K, rig, o);
  const rot = after ? after(K, rig, info) || {} : {};
  bakeRigid(g, K, rig, rot);
  // footprint = the body, like ped / driver / cook (hoses, scarves, shields and instruments stick out of it);
  // userData.bounds = full visual bounds
  const m = measure(g);
  g.userData.size = { w: 0.62, h: +m.h.toFixed(2), l: 0.36 };
  g.userData.bounds = { w: +m.w.toFixed(2), h: +m.h.toFixed(2), l: +m.l.toFixed(2) };
  g.userData.rig = { hipY: HIP_Y, shoulderY: SH_Y, neckY: NECK_Y };
  if (o.style) g.userData.style = o.style;
  if (o.character) g.userData.character = o.character;
  return g;
}

/**
 * Box (or o.round = n-sided tube) running from a to b (hoses, canes, reins, scarf ribbons).
 * w = width across (local X, kept horizontal), h = thickness (local Y), o.extend lengthens both ends.
 */
export function segBox(k, color, a, b, w, h, o = {}) {
  const A = new V3(...a), B = new V3(...b);
  const dir = B.clone().sub(A); const len = dir.length(); dir.normalize();
  const ref = Math.abs(dir.y) > 0.95 ? new V3(1, 0, 0) : new V3(0, 1, 0);
  const X = new V3().crossVectors(ref, dir).normalize();
  const Y = new V3().crossVectors(dir, X);
  if (Math.abs(dir.y) > 0.95) { X.crossVectors(dir, new V3(0, 0, 1)).normalize(); Y.crossVectors(dir, X); }
  const m = new M4().makeBasis(X, Y, dir).setPosition(A.clone().add(B).multiplyScalar(0.5));
  if (o.roll) m.multiply(new M4().makeRotationZ(o.roll));
  k.stack.push(k.M.clone().multiply(m));
  const L = len + (o.extend || 0);
  if (o.round) k.cyl(color, (o.w2 ?? w) / 2, w / 2, L, [0, 0, 0], { axis: 'z', seg: o.round, open: o.open }); // w at a, w2 at b
  else k.box(color, [w, h, L], [0, 0, 0], o.taper ? { taper: o.taper } : {});
  k.stack.pop();
}
/** A chain of segBoxes through pts (colours may be an array, one per segment). */
export function chain(k, color, pts, w, h, o = {}) {
  for (let i = 0; i < pts.length - 1; i++) {
    const c = Array.isArray(color) ? color[Math.min(i, color.length - 1)] : color;
    const ww = Array.isArray(w) ? w[Math.min(i, w.length - 1)] : w;
    segBox(k, c, pts[i], pts[i + 1], ww, h, o);
  }
}

/** Five-point star (badge, tin star, emblem) painted on a z-plane facing dir. */
export function star(k, color, cx, cy, z, r, dir = 1, inner = 0.45, rot = 0) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + rot + (i * Math.PI) / 5, rr = i % 2 ? r * inner : r;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  k.front(color, z, pts, dir, { off: 0.004 });
}
