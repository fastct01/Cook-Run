// ─────────────────────────────────────────────────────────────────────────────
// Round 3 · R3-ROOK pack — the younger Rook (PROPOSED, not wired).
//   rook_young     v0 casual: oversized brick-red hoodie, teal beanie (his old cap's colours +
//                     the mustard diamond), headphones round the neck, baggy jeans, white high-tops
//                  v1 suited: the crew_suited yellow suit (hood down), respirator round the neck,
//                     blue nitrile gloves, beanie still on
//   rook_roof_aim  v0 revolver (two-handed) · v1 pump shotgun (shouldered) · v2 scoped rifle
//                  (shouldered, cheek on the stock) — the gun is a `gun` pivot under `arm_r`.
// A young ADULT (~20): smooth face, no stubble, narrow chin, slim neck, smirk + one raised brow,
// chin up, feet planted wide. Original design.
//
// RIG — identical to today's `driver` (characters.js buildHuman, build 1.06) so the model swaps in
// for walking / carrying / sitting (onfoot/avatar.js, van/interior.js poseSeated):
//   body  (0, 0.88, 0)  → head (0, 1.47, 0), arm_l (±0.2491, 1.36, 0), arm_r, leg_l (±0.1113, 0.88, 0), leg_r
//   plain Object3D pivots, each holding `<name>_mesh` (shared vertex-colour material), rotation 0
//   in the bind pose; poses are baked into the limb meshes. Hand centre = arm pivot + (0, −0.62, 0).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Kit, Rig, root, measure } from '../models/kit.js';
import { PAL, shade } from '../palette.js';
import { limbIK, bakeRigid, segBox, HIP_Y, HIP_X, SH_X, SH_Y, NECK_Y, UPPER, LOWER, THIGH, SHIN, SK } from './people-human.js';
import { GUN_PARTS } from './r3-rook-guns.js';

const BW = 1.06;   // the driver's build → identical pivot positions
export const ROOK_PIVOTS = Object.freeze({
  body: [0, HIP_Y, 0], head: [0, NECK_Y, 0],
  arm_l: [SH_X * BW, SH_Y - 0.03, 0], arm_r: [-SH_X * BW, SH_Y - 0.03, 0],
  leg_l: [HIP_X * BW, HIP_Y, 0], leg_r: [-HIP_X * BW, HIP_Y, 0],
});
export const HAND_OFFSET = [0, -(UPPER + LOWER + 0.05), 0];

export const ROOK_COL = Object.freeze({
  skin: SK[1], hair: '#4a3222', brow: '#3e2a1d',
  hoodie: '#a4473a', hoodieD: '#8c3b31', rib: '#7a332b', strings: '#ece6d6', tips: '#bdbbb1',
  jeans: '#5a76a0', jeansD: '#475f86',
  sneaker: '#ece8de', sole: '#cdb085', stripe: '#a4473a',
  beanie: '#3c5a58', beanieD: '#2f4846', emblem: PAL.rvMustard,
  phones: '#27282b', phonesL: '#45484d',
});
// = crew_suited (r3-garage-gear.js) so suited Rook matches suited Doc
export const SUIT = '#f2c230', SEAM = '#c99a1c', NITRILE = '#3f7fd0', ZIP = '#4d4b46';

const M4 = THREE.Matrix4, V3 = THREE.Vector3;
const T = (x, y, z) => new M4().makeTranslation(x, y, z);
const RX = (a) => new M4().makeRotationX(a);
const EUL = (r) => new M4().makeRotationFromEuler(new THREE.Euler(r[0] || 0, r[1] || 0, r[2] || 0, 'XYZ'));
const rect = (cx, cy, w, h) => [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];

/** Head dims (neck-pivot space): HW × HH × HD, centre height hy, face plane fz. */
export const HEAD = (() => { const hs = 1.06, HH = 0.29 * hs; return { HW: 0.25 * hs, HH, HD: 0.26 * hs, hy: HH / 2 + 0.02, fz: 0.13 * hs }; })();
/** Eye positions in neck-pivot space (before headRot): right (−X), left (+X), mid. */
export const EYES = { r: [-0.056, HEAD.hy + 0.012, HEAD.fz + 0.002], l: [0.056, HEAD.hy + 0.012, HEAD.fz + 0.002], mid: [0, HEAD.hy + 0.012, HEAD.fz + 0.002] };

/**
 * Build young Rook into a Kit + Rig (model space, metres, +Z front).
 * o: { outfit: 'casual'|'suit', phones, headRot:[x,y,z],
 *      arms: { l|r: { ik:[x,y,z] hand centre, pole } | { rot:[x,y,z], bend } },
 *      legs: { l|r: { ik:[x,y,z] ankle (sole + 0.04), pole } | { rot, knee } } }
 * Returns { hands: { l, r } (model space), eye(side) }.
 */
export function rookFigure(K, rig, o = {}) {
  const C = ROOK_COL, P = ROOK_PIVOTS;
  const suit = o.outfit === 'suit';
  const bBody = rig.add('body', P.body);
  const bHead = rig.add('head', P.head, 'body');

  // ── body: seat, torso, hem, dropped shoulders, collar, hood, neck ────────
  K.bone = bBody;
  const TD = 0.27, z = TD / 2;
  const top = suit ? SUIT : C.hoodie, topD = suit ? SUIT : C.hoodieD;
  K.box(suit ? SUIT : C.jeans, [0.36, 0.16, 0.235], [0, 0.77, 0], { base: true, noBottom: true });
  K.box(top, [0.47, 0.42, TD], [0, 0.92, 0], { c: 0.05, cv: true, base: true });
  K.box(top, [0.54, 0.13, TD - 0.01], [0, 1.27, 0], { c: 0.05, cv: true, base: true, taper: [0.8, 0.88] });
  K.box(topD, [0.25, 0.055, 0.17], [0, 1.39, -0.045], { base: true });                                        // hood collar (behind / beside the neck)
  K.box(topD, [0.32, 0.135, 0.15], [0, 1.345, -0.125], { c: 0.05, cv: true, base: true, taper: [0.86, 0.8] }); // hood lying on the back
  K.cyl(C.skin, 0.047, 0.052, 0.13, [0, NECK_Y - 0.04, 0], { seg: 6, open: true });
  if (!suit) {
    K.box(C.rib, [0.45, 0.06, TD - 0.012], [0, 0.865, 0], { base: true });                                    // ribbed hem
    // kangaroo pocket + its slanted openings, drawstrings, the mustard diamond on the chest
    K.front(C.hoodieD, z, [[-0.17, 0.95], [0.17, 0.95], [0.13, 1.1], [-0.13, 1.1]], 1, { off: 0.002 });
    for (const s of [1, -1]) K.front(C.rib, z, [[s * 0.13, 1.1], [s * 0.17, 0.95], [s * 0.152, 0.95], [s * 0.114, 1.1]], 1, { off: 0.003 });
    for (const x of [-0.045, 0.05]) {
      K.front(C.strings, z, [[x - 0.008, 1.255], [x + 0.008, 1.255], [x + 0.006, 1.4], [x - 0.006, 1.4]], 1, { off: 0.009 });
      K.front(C.tips, z, rect(x, 1.245, 0.014, 0.022), 1, { off: 0.01 });
    }
    K.front(C.emblem, z, [[0.105, 1.165], [0.14, 1.2], [0.105, 1.235], [0.07, 1.2]], 1, { off: 0.003 });
  } else {
    K.box(SEAM, [0.476, 0.045, TD + 0.008], [0, 0.93, 0], { c: 0.05, cv: true, base: true });                 // waist elastic
    K.front(ZIP, z, [[-0.009, 0.97], [0.009, 0.97], [0.009, 1.37], [-0.009, 1.37]], 1, { off: 0.002 });
    K.front('#c9c6bb', z, rect(0, 1.33, 0.026, 0.04), 1, { off: 0.004 });                                      // zip pull
    K.front('#f4f1e8', z, rect(0.12, 1.24, 0.07, 0.045), 1, { off: 0.002 });                                   // suit tag
    K.top(SEAM, 1.481, [[-0.1, -0.165], [0.1, -0.165], [0.08, -0.09], [-0.08, -0.09]], { off: 0 });           // hood elastic
    // respirator hanging round the neck (as crew_suited): mask, two filter cans, strap
    K.box('#2f3337', [0.14, 0.1, 0.08], [0, 1.33, z + 0.05]);
    for (const s of [1, -1]) K.cyl('#d06a3a', 0.05, 0.05, 0.05, [s * 0.095, 1.315, z + 0.065], { axis: 'z', seg: 6 });
    K.box('#2f3337', [0.3, 0.02, 0.02], [0, 1.4, z + 0.012]);
  }
  if (o.phones) {
    // over-ear headphones resting round the neck: two cups + a band behind the neck
    for (const s of [1, -1]) {
      K.cyl(C.phones, 0.043, 0.043, 0.034, [s * 0.122, 1.435, 0.03], { axis: 'x', seg: 6 });
      K.side(C.emblem, 0.139, [[0.03, 1.418], [0.047, 1.435], [0.03, 1.452], [0.013, 1.435]], { side: s, off: 0.001 });
      segBox(K, C.phonesL, [s * 0.118, 1.455, -0.0], [s * 0.05, 1.47, -0.115], 0.024, 0.02);
    }
    K.box(C.phonesL, [0.11, 0.02, 0.024], [0, 1.47, -0.118]);
  }

  // ── head (neck-pivot space) ──────────────────────────────────────────────
  K.bone = bHead;
  const headM = T(0, NECK_Y, 0).multiply(o.headRot ? EUL(o.headRot) : new M4());
  K.stack.push(K.M.clone().multiply(headM));
  const { HW, HH, HD, hy, fz } = HEAD, skin = C.skin;
  K.box(skin, [HW, HH, HD], [0, hy, 0], { c: 0.05 });
  K.box(skin, [HW * 0.7, 0.085, HD * 0.8], [0, hy - HH / 2 + 0.03, 0.026], { c: 0.035, cv: true });   // smooth, narrow young chin (flush with the face)
  for (const s of [1, -1]) K.box(shade(skin, 0.92), [0.028, 0.065, 0.05], [s * (HW / 2 + 0.008), hy - 0.005, -0.012]);
  K.box(shade(skin, 0.94), [0.04, 0.05, 0.04], [0, hy - 0.024, fz + 0.01], { rot: [-0.2, 0, 0] });                 // small nose
  for (const s of [1, -1]) {
    K.front(PAL.eye, fz, rect(s * 0.056, hy + 0.012, 0.034, 0.044), 1, { off: 0.002 });
    K.front('#f6f3ea', fz, rect(s * 0.056 + 0.009, hy + 0.024, 0.011, 0.012), 1, { off: 0.0035 });               // glint
  }
  K.front(C.brow, fz, [[-0.086, hy + 0.05], [-0.03, hy + 0.053], [-0.03, hy + 0.066], [-0.086, hy + 0.062]], 1, { off: 0.003 });
  K.front(C.brow, fz, [[0.03, hy + 0.058], [0.086, hy + 0.068], [0.086, hy + 0.081], [0.03, hy + 0.071]], 1, { off: 0.003 });  // raised: cocky
  K.front(shade(skin, 0.58), fz, [[-0.036, hy - 0.073], [0.02, hy - 0.071], [0.044, hy - 0.056], [0.03, hy - 0.063], [-0.036, hy - 0.065]], 1, { off: 0.002 });  // smirk
  K.front(shade(skin, 0.9), fz, [[-0.1, hy - 0.04], [-0.07, hy - 0.04], [-0.075, hy - 0.02], [-0.1, hy - 0.018]], 1, { off: 0.0015 });  // cheek shade
  // hair: messy fringe under the beanie, temple tufts, nape
  const hc = C.hair, yTop = hy + 0.112;
  const fringe = [[-HW / 2 + 0.01, yTop], [HW / 2 - 0.01, yTop], [HW / 2 - 0.012, hy + 0.092], [0.09, hy + 0.085], [0.062, hy + 0.094], [0.03, hy + 0.08],
    [0.0, hy + 0.092], [-0.025, hy + 0.077], [-0.055, hy + 0.089], [-0.085, hy + 0.075], [-HW / 2 + 0.012, hy + 0.09]];
  K.front(hc, fz, fringe, 1, { off: 0.004 });
  for (const s of [1, -1]) K.flat(hc, [[-0.02, yTop], [0.07, yTop], [0.05, hy + 0.04], [0.022, hy - 0.005], [-0.005, hy + 0.03]], (u, v) => [s * (HW / 2 + 0.003), v, u], { facing: [s, 0, 0], off: 0 });
  K.box(hc, [HW + 0.02, 0.075, 0.045], [0, hy + 0.085, -HD / 2 + 0.01], { taper: [1.0, 1.06] });
  // beanie: ribbed cuff (mustard diamond patch) + slouchy crown
  const cy = hy + 0.146, CW = HW + 0.045, CD = HD + 0.045;
  K.box(C.beanieD, [CW, 0.07, CD], [0, cy, -0.004], { c: 0.03, cv: true });
  K.box(C.beanie, [HW + 0.03, 0.105, HD + 0.03], [0, cy + 0.028, -0.01], { c: 0.045, cv: true, base: true, taper: [0.76, 0.78], shear: [0, -0.03] });
  for (const x of [-0.09, -0.06, 0.06, 0.09]) K.front(shade(C.beanieD, 0.8), CD / 2 - 0.004, rect(x, cy, 0.008, 0.06), 1, { off: 0.002 });
  K.front(C.emblem, CD / 2 - 0.004, [[0, cy - 0.027], [0.027, cy], [0, cy + 0.027], [-0.027, cy]], 1, { off: 0.003 });
  K.stack.pop();

  // ── arms ────────────────────────────────────────────────────────────────
  const hands = {};
  const sleeve = suit ? SUIT : C.hoodie, handC = suit ? NITRILE : skin;
  for (const s of [1, -1]) {
    const side = s > 0 ? 'l' : 'r', apos = P['arm_' + side];
    K.bone = rig.add('arm_' + side, apos, 'body');
    const pose = o.arms?.[side];
    let R = new M4().makeRotationZ(s * 0.07), bend = 0;
    if (pose?.ik) { const r = limbIK(apos, pose.ik, pose.pole || [s, -0.4, -0.4], UPPER, LOWER + 0.05, 1); R = r.m; bend = r.bend; }
    else if (pose) { R = EUL(pose.rot || [0, 0, s * 0.07]); bend = pose.bend || 0; }
    const shoulderM = T(...apos).multiply(R);
    K.stack.push(K.M.clone().multiply(shoulderM));
    const ax = s * 0.006;
    K.box(sleeve, [0.135, 0.34, 0.145], [ax, -0.14, 0], { c: 0.035, cv: true });
    if (bend > 0.45) K.box(sleeve, [0.125, 0.12, 0.135], [ax, -UPPER, 0]);
    const elbowM = bend ? T(0, -UPPER, 0).multiply(RX(-bend)).multiply(T(0, UPPER, 0)) : new M4();
    K.stack.push(K.M.clone().multiply(elbowM));
    K.box(sleeve, [0.128, 0.245, 0.138], [ax, -UPPER - 0.118, 0], { c: 0.035, cv: true, taper: [1.03, 1.03] });
    if (suit) K.box(NITRILE, [0.12, 0.075, 0.13], [ax, -0.548, 0]);                      // glove gauntlet over the sleeve
    else K.box(C.rib, [0.112, 0.045, 0.122], [ax, -0.556, 0]);                            // ribbed cuff
    K.box(handC, [0.092, 0.115, 0.105], [ax, -0.62, 0.008], { c: 0.025, cv: true });
    K.box(handC, [0.032, 0.055, 0.038], [ax - s * 0.042, -0.598, 0.045]);
    K.stack.pop(); K.stack.pop();
    hands[side] = new V3(ax, -0.62, 0.008).applyMatrix4(shoulderM.clone().multiply(elbowM)).toArray();
  }

  // ── legs ────────────────────────────────────────────────────────────────
  const pant = suit ? SUIT : C.jeans;
  for (const s of [1, -1]) {
    const side = s > 0 ? 'l' : 'r', lpos = P['leg_' + side];
    K.bone = rig.add('leg_' + side, lpos, 'body');
    const pose = o.legs?.[side];
    let R = null, knee = 0;
    if (pose?.ik) { const r = limbIK(lpos, pose.ik, pose.pole || [0, 0, 1], THIGH - 0.02, SHIN + 0.04, -1); R = r.m; knee = r.bend; }
    else if (pose) { R = EUL(pose.rot || [0, 0, 0]); knee = pose.knee || 0; }
    K.stack.push(K.M.clone().multiply(T(...lpos)).multiply(R || new M4()));
    K.box(pant, [0.17, 0.44, 0.19], [0, -0.2, 0], { c: 0.04, cv: true });
    if (knee > 0.45) K.box(pant, [0.16, 0.12, 0.175], [0, -THIGH + 0.02, 0]);
    const kneeM = knee ? T(0, -THIGH + 0.02, 0).multiply(RX(knee)).multiply(T(0, THIGH - 0.02, 0)) : null;
    if (kneeM) K.stack.push(K.M.clone().multiply(kneeM));
    K.box(pant, [0.165, 0.36, 0.18], [0, -0.58, 0.004], { c: 0.04, cv: true, taper: [0.9, 0.92] });
    if (suit) K.box(SEAM, [0.17, 0.04, 0.186], [0, -0.735, 0.006]);                       // ankle elastic
    else K.box(C.jeansD, [0.184, 0.07, 0.2], [0, -0.746, 0.012]);                          // stacked hem
    // white high-top: gum sole, upper with a sloped toe, brick stripe on the outer side, toe cap line
    K.box(C.sole, [0.152, 0.034, 0.292], [0, -HIP_Y + 0.017, 0.046], { noBottom: true });
    K.box(C.sneaker, [0.14, 0.11, 0.276], [0, -HIP_Y + 0.034, 0.042], { c: 0.03, cv: true, base: true, taper: [0.94, 0.72], shear: [0, -0.04] });
    K.flat(C.stripe, [[-0.06, -0.835], [0.06, -0.818], [0.1, -0.818], [-0.02, -0.835]], (u, v) => [s * 0.0705, v, u], { facing: [s, 0, 0], off: 0.001 });
    if (kneeM) K.stack.pop();
    K.stack.pop();
  }
  const eye = (which = 'r') => new V3(...EYES[which]).applyMatrix4(headM).toArray();
  return { hands, eye, headM };
}

/** Stand-alone young Rook: root + Kit + Rig + rookFigure + rigid bake. after(nodes, info) may add pivots. */
export function rookPerson(kind, variant, o, after) {
  const g = root(kind, variant, { w: 0.62, h: 1.9, l: 0.36 });
  const K = new Kit(4200 + variant);
  const rig = new Rig();
  const info = rookFigure(K, rig, o);
  const nodes = bakeRigid(g, K, rig);
  if (after) after(nodes, info, g);
  g.updateMatrixWorld(true);
  const m = measure(g);
  g.userData.size = { w: 0.62, h: +m.h.toFixed(2), l: 0.36 };
  g.userData.bounds = { w: +m.w.toFixed(2), h: +m.h.toFixed(2), l: +m.l.toFixed(2) };
  g.userData.rig = { hipY: HIP_Y, shoulderY: SH_Y, neckY: NECK_Y };
  g.userData.character = 'Rook';
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// rook_young — v0 casual, v1 suited. Bind pose: arms down (slightly out), feet wide + turned out,
// chin up / head cocked (baked into the head mesh — Avatar's head.rotation adds on top).
// ═════════════════════════════════════════════════════════════════════════════
export function buildRookYoung(variant = 0) {
  const suit = variant % 2 === 1;
  const g = rookPerson('rook_young', variant, {
    outfit: suit ? 'suit' : 'casual', phones: !suit,
    headRot: [-0.07, 0.1, -0.05],
    legs: { l: { rot: [0, 0.2, 0.035] }, r: { rot: [0, -0.12, -0.045] } },
  });
  g.userData.style = suit ? 'rook_young_suited' : 'rook_young';
  g.userData.swapFor = suit ? 'crew_suited#0' : 'driver';
  g.userData.note = 'Drop-in for createModel("driver") / crew_suited v0: same pivots (body → head, arm_l, arm_r, leg_l, leg_r) at the same positions. new Avatar(createModel("rook_young", v)).';
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// rook_roof_aim — young Rook (casual) aiming from the RV roof. The pose is solved per gun: the head
// is cocked onto the sight line, the gun is placed so its sight (scope eyepiece / rib / revolver
// rear sight) sits in front of the aiming eye, the right hand IKs to the gun's `grip` and the left
// hand to its `support` point; the feet IK onto the roof.
// Aim at runtime: model.rotation.y = yaw − userData.aim.yawOffset (long guns are held 0.4 rad across
// the body, bladed stance); arm_l.rotation.x = arm_r.rotation.x = −pitch;
// head.rotation.x = −0.9·pitch (both arm pivots share the shoulder axis, so the left hand stays on
// the gun). Shot origin/direction: getObjectByName('muzzle') world position / world +Z.
// ═════════════════════════════════════════════════════════════════════════════
export const AIM_TYPES = ['revolver', 'shotgun', 'rifle'];
const AIM = {
  revolver: {
    yaw: 0, headRot: [0.1, 0.03, 0.04], eye: 'mid', relief: 0.36, above: 0.03,
    poles: { r: [-0.55, -1, -0.15], l: [0.6, -1, -0.15] },
    legs: { l: { ik: [0.17, 0.04, 0.09], pole: [0.15, 0, 1] }, r: { ik: [-0.17, 0.04, -0.07], pole: [-0.15, 0, 1] } },
  },
  // long guns: bladed stance — the gun points `yaw` across the body (toward his left), the torso
  // stays square to the rig so both shoulder pivots keep one pitch axis; the integrator subtracts yaw.
  shotgun: {
    yaw: 0.4, headRot: [0.26, 0.3, 0.13], eye: 'r', relief: 0.09, above: 0.012,
    poles: { r: [-0.8, -0.65, -0.1], l: [0.25, -1, 0.1] },
    legs: { l: { ik: [0.24, 0.04, 0.2], pole: [0.45, 0, 1] }, r: { ik: [-0.16, 0.04, -0.15], pole: [0.1, 0, 1] } },
  },
  rifle: {
    yaw: 0.4, headRot: [0.29, 0.3, 0.14], eye: 'r', relief: 0.07, above: 0.0,
    poles: { r: [-0.8, -0.6, -0.15], l: [0.25, -1, 0.1] },
    legs: { l: { ik: [0.24, 0.04, 0.21], pole: [0.45, 0, 1] }, r: { ik: [-0.16, 0.04, -0.16], pole: [0.1, 0, 1] } },
  },
};
/** Solve the hold: gun origin (= grip, model space) + orientation from the aiming eye; hand IK targets. */
export function solveAim(type) {
  const A = AIM[type];
  const { gun, info } = GUN_PARTS[type]();
  const q = new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), A.yaw || 0);
  const dir = new V3(0, 0, 1).applyQuaternion(q);
  const headM = T(0, NECK_Y, 0).multiply(EUL(A.headRot));
  const eye = new V3(...EYES[A.eye]).applyMatrix4(headM);
  const sr = new V3(...info.sightRear).applyQuaternion(q);
  const gPos = eye.clone().addScaledVector(dir, A.relief).add(new V3(0, -A.above, 0)).sub(sr);
  const sup = gPos.clone().add(new V3(...info.support).applyQuaternion(q));
  return { A, gun, info, q, gPos, eye, arms: { r: { ik: gPos.toArray(), pole: A.poles.r }, l: { ik: sup.toArray(), pole: A.poles.l } } };
}
export function buildRookRoofAim(variant = 0) {
  const type = AIM_TYPES[((variant % 3) + 3) % 3];
  const S = solveAim(type);
  const g = rookPerson('rook_roof_aim', variant, {
    outfit: 'casual', phones: false, headRot: S.A.headRot, arms: S.arms, legs: S.A.legs,
  }, (nodes) => {
    // the gun hangs under arm_r (whose bind rotation is 0, so model offsets are local offsets)
    const ar = ROOK_PIVOTS.arm_r;
    S.gun.position.set(S.gPos.x - ar[0], S.gPos.y - ar[1], S.gPos.z - ar[2]);
    S.gun.quaternion.copy(S.q);
    nodes.arm_r.add(S.gun);
  });
  g.userData.style = 'rook_roof_' + type;
  g.userData.gun = { type, ...S.info };
  g.userData.aim = {
    eye: S.eye.toArray().map((v) => +v.toFixed(3)), shoulderY: ROOK_PIVOTS.arm_r[1], yawOffset: S.A.yaw,
    note: 'yaw: model.rotation.y = aimYaw − yawOffset · pitch: arm_l.rotation.x = arm_r.rotation.x = −pitch, head.rotation.x = −0.9·pitch · shot: muzzle world pos + world +Z · roof: model.position = (stance.x, roofY, stance.z) RV-local',
  };
  return g;
}
