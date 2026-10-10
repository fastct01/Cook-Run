// ─────────────────────────────────────────────────────────────────────────────
// Characters (Agent ART): ped (8 adult variants), driver "Rook", cook "Doc", cow.
//
// Rig (all humans): ONE SkinnedMesh `mesh` (1 draw call) driven by bones
// (THREE.Bone = Object3D, so rotation.x etc. work as on any pivot):
//   body   Bone at the pelvis (0, 0.88, 0) — parent of all others; rotate it to
//          tumble/lean the whole figure about the hips
//   head   Bone at the neck top (face on +Z)
//   arm_l  Bone at the LEFT shoulder (+X); arm hangs along −Y
//   arm_r  Bone at the RIGHT shoulder (−X)
//   leg_l  Bone at the LEFT hip (+X); leg hangs along −Y
//   leg_r  Bone at the RIGHT hip (−X)
// rotation.x on a limb pivot swings it: positive = limb swings BACKWARD
// (foot/hand toward −Z), negative = forward. A walk cycle is
//   leg_l.rotation.x = A*sin(t), leg_r.rotation.x = −A*sin(t), arms opposite.
// Human height ≈ 1.75 m, slightly big heads/hands. Adults only.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Kit, Rig, root } from './kit.js';
import { PAL, mix, shade } from '../palette.js';

const HIP_Y = 0.88, HIP_X = 0.105;
const SH_Y = 1.39, SH_X = 0.235;
const NECK_Y = 1.47;


/**
 * Generic outfit spec:
 *  skin, hair, hairStyle ('short'|'bald'|'bob'|'pony'|'white'|'buzz'), top, topStyle ('shirt'|'tee'|'tank'|'hoodie'|'dress'|'cardigan'),
 *  bottom, bottomStyle ('trousers'|'shorts'|'skirt'), shoes, hat ('none'|'cap'|'hard'|'cowboy'|'bucket'|'headband'|'flat'|'sunhat'),
 *  hatColor, extras: fn(kitBody, kitHead, kits) for accessories, sleeve ('long'|'short'|'none'), build (1 = normal, >1 broader)
 */
function buildHuman(kind, variant, o) {
  const g = root(kind, variant, { w: 0.62, h: 1.78, l: 0.36 });
  const bw = o.build || 1;
  const skin = o.skin;
  const top = o.top, bottom = o.bottom;
  const K = new Kit(1);
  const rig = new Rig();
  const bBody = rig.add('body', [0, HIP_Y, 0]);
  const bHead = rig.add('head', [0, NECK_Y, 0], 'body');

  // ── body (torso + hips + neck) ────────────────────────────────────────────
  const kb = K;
  K.bone = bBody;
  const torsoW = 0.44 * bw, torsoD = 0.25 * bw;
  const waistY = 0.98;
  // hips / pelvis (bottom colour)
  if (o.topStyle === 'dress') {
    // dress: flared skirt from waist to knee
    kb.box(top, [0.42, 0.44, 0.28], [0, 0.42, 0], { c: 0.05, cv: true, base: true, taper: [0.8, 0.82] });
    kb.box(shade(top, 0.9), [0.43, 0.04, 0.29], [0, 0.42, 0], { base: true });
  } else {
    kb.box(bottom, [0.36 * bw, 0.2, 0.23 * bw], [0, HIP_Y - 0.06, 0], { c: 0.04, cv: true, base: true });
  }
  // torso: slightly tapered toward the waist
  const tCol = o.topStyle === 'dress' ? top : top;
  kb.box(tCol, [torsoW, SH_Y - waistY + 0.06, torsoD], [0, waistY - 0.04, 0], { c: 0.06, base: true, taper: [1.0, 1.0] });
  kb.box(tCol, [torsoW * 0.86, 0.12, torsoD * 0.92], [0, waistY - 0.1, 0], { c: 0.04, cv: true, base: true });
  // shoulders cap
  kb.box(tCol, [torsoW + 0.06, 0.13, torsoD * 0.9], [0, SH_Y - 0.06, 0], { c: 0.05 });
  // neck
  kb.cyl(skin, 0.055, 0.06, 0.1, [0, NECK_Y - 0.06, 0], { seg: 6 });
  // belt
  if (o.belt) kb.box(o.belt, [torsoW * 0.88, 0.05, torsoD * 0.94], [0, waistY - 0.07, 0]);
  // top style details
  if (o.topStyle === 'tank') {
    // skin on the shoulders: paint skin quads on top of the shoulder caps
    for (const s of [1, -1]) kb.box(skin, [0.1, 0.135, torsoD * 0.88], [s * (torsoW / 2 - 0.0), SH_Y - 0.05, 0]);
  }
  if (o.topStyle === 'hoodie') {
    kb.box(shade(top, 0.9), [0.3, 0.14, 0.14], [0, NECK_Y - 0.06, -0.12], { c: 0.04, cv: true }); // bunched hood
    kb.box(shade(top, 0.86), [0.24, 0.1, 0.02], [0, 1.08, torsoD / 2 + 0.006]); // pouch pocket
    for (const s of [1, -1]) kb.box('#e6e2d6', [0.015, 0.1, 0.015], [s * 0.05, 1.3, torsoD / 2 + 0.01]);
  }
  if (o.topStyle === 'cardigan') {
    kb.box(shade(top, 1.15), [0.1, 0.44, 0.02], [0, 1.18, torsoD / 2 + 0.002]); // shirt showing
    for (let i = 0; i < 4; i++) kb.box('#e8dcc0', [0.02, 0.02, 0.02], [0.06, 1.0 + i * 0.1, torsoD / 2 + 0.012]);
  }
  if (o.topStyle === 'shirt' && o.collar) {
    kb.box(o.collar, [0.18, 0.06, 0.1], [0, NECK_Y - 0.08, 0.06]);
  }
  if (o.extrasBody) o.extrasBody(kb, { torsoW, torsoD, waistY });

  // ── head (built in neck-pivot space) ─────────────────────────────────────
  const kh = K;
  K.bone = bHead;
  K.stack.push(K.M.clone().multiply(new THREE.Matrix4().makeTranslation(0, NECK_Y, 0)));
  const hs = (o.headScale || 1) * 1.08; // slightly big heads (readability at chase-cam range)
  const HW = 0.25 * hs, HH = 0.29 * hs, HD = 0.26 * hs;
  const hy = HH / 2 + 0.02; // head centre above the neck pivot
  kh.box(skin, [HW, HH, HD], [0, hy, 0], { c: 0.045 });
  // jaw slightly narrower
  kh.box(skin, [HW * 0.86, 0.08, HD * 0.84], [0, hy - HH / 2 + 0.02, 0.01], { c: 0.03, cv: true });
  // ears
  for (const s of [1, -1]) kh.box(shade(skin, 0.92), [0.03, 0.07, 0.05], [s * (HW / 2 + 0.01), hy, -0.01]);
  // nose
  kh.box(shade(skin, 0.93), [0.05, 0.07, 0.05], [0, hy - 0.015, HD / 2 + 0.012]);
  kh.box(shade(skin, 0.62), [0.07, 0.014, 0.01], [0, hy - 0.075, HD / 2 + 0.002]); // mouth
  kh.box(shade(skin, 0.86), [0.035, 0.08, HD * 0.7], [-HW / 2 + 0.012, hy - 0.04, 0.0]); // cheek shading (right side)
  // eyes (two dark eyes) + brows
  for (const s of [1, -1]) {
    if (!o.glasses) kh.box(PAL.eye, [0.032, 0.042, 0.02], [s * 0.055, hy + 0.025, HD / 2 + 0.002]);
    kh.box(shade(o.hair, 0.9), [0.06, 0.016, 0.02], [s * 0.058, hy + 0.068, HD / 2 + 0.003]);
  }
  // hair
  const hair = o.hair;
  const hairTop = (h = 0.06) => kh.box(hair, [HW + 0.02, h, HD + 0.02], [0, hy + HH / 2 - h / 2 + 0.03, -0.005], { c: 0.03, cv: true });
  switch (o.hairStyle) {
    case 'bald': kh.box(hair, [HW + 0.012, 0.06, HD * 0.6], [0, hy + 0.02, -0.06], { c: 0.02, cv: true }); break;
    case 'buzz': hairTop(0.04); break;
    case 'white': hairTop(0.05); kh.box(hair, [HW + 0.02, 0.12, 0.06], [0, hy + 0.04, -HD / 2 + 0.01], { c: 0.02, cv: true }); break;
    case 'bob': hairTop(0.08); kh.box(hair, [HW + 0.05, 0.22, HD * 0.7], [0, hy - 0.02, -0.05], { c: 0.04 }); break;
    case 'pony': hairTop(0.07); kh.box(hair, [HW + 0.03, 0.16, 0.08], [0, hy + 0.02, -HD / 2 - 0.01]); kh.box(hair, [0.07, 0.18, 0.07], [0, hy - 0.06, -HD / 2 - 0.07], { rot: [0.3, 0, 0] }); break;
    case 'none': break;
    default: hairTop(0.07); kh.box(hair, [HW + 0.02, 0.1, 0.06], [0, hy + 0.06, -HD / 2 + 0.01]);
  }
  // facial hair
  if (o.stubble) kh.box(mix(skin, o.hair, 0.45), [HW * 0.88, 0.07, 0.03], [0, hy - HH / 2 + 0.05, HD / 2 - 0.005]);
  if (o.moustache) kh.box(o.hair, [0.11, 0.025, 0.02], [0, hy - 0.06, HD / 2 + 0.006]);
  // glasses / sunglasses
  if (o.glasses) {
    const gc = o.glasses;
    for (const s of [1, -1]) kh.box(gc, [0.075, 0.05, 0.02], [s * 0.058, hy + 0.025, HD / 2 + 0.01]);
    kh.box(gc, [0.24, 0.015, 0.015], [0, hy + 0.04, HD / 2 + 0.008]);
    if (o.clearLenses) for (const s of [1, -1]) { kh.box(o.clearLenses, [0.055, 0.032, 0.01], [s * 0.058, hy + 0.025, HD / 2 + 0.021]); kh.box(PAL.eye, [0.024, 0.026, 0.01], [s * 0.055, hy + 0.024, HD / 2 + 0.026]); }
  }
  // hats
  const hc = o.hatColor;
  switch (o.hat) {
    case 'cap': // trucker cap: front panel lighter, brim forward
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
      kh.box(shade(hc, 0.75), [HW + 0.03, 0.025, HD + 0.03], [0, hy + HH / 2 - 0.005, 0]);
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
    default: break;
  }
  if (o.extrasHead) o.extrasHead(kh, { HW, HH, HD, hy });
  K.stack.pop();

  // ── arms ────────────────────────────────────────────────────────────────
  const sleeve = o.sleeve || 'long';
  const armCol = o.armColor || top;
  const handCol = o.gloves || skin;
  for (const s of [1, -1]) {
    const ka = K;
    const apos = [s * SH_X * bw, SH_Y - 0.03, 0];
    K.bone = rig.add(s > 0 ? 'arm_l' : 'arm_r', apos, 'body');
    K.stack.push(K.M.clone().multiply(new THREE.Matrix4().makeTranslation(...apos)).multiply(new THREE.Matrix4().makeRotationZ(s * 0.06)));
    const upper = 0.3, lower = 0.27;
    const ax = s * 0.005;
    // upper arm
    ka.box(sleeve === 'none' ? skin : armCol, [0.11, upper + 0.04, 0.12], [ax, -upper / 2 + 0.01, 0], { c: 0.025, cv: true });
    // forearm
    const fore = sleeve === 'long' ? armCol : skin;
    ka.box(fore, [0.1, lower, 0.11], [ax, -upper - lower / 2 + 0.01, 0.0], { c: 0.025, cv: true });
    if (sleeve === 'short') ka.box(armCol, [0.12, 0.1, 0.13], [ax, -0.2, 0]);
    if (o.cuff) ka.box(o.cuff, [0.105, 0.03, 0.115], [ax, -upper - lower + 0.03, 0]);
    // big hand
    ka.box(handCol, [0.1, 0.13, 0.12], [ax, -upper - lower - 0.05, 0.01], { c: 0.03, cv: true });
    ka.box(handCol, [0.035, 0.06, 0.04], [ax + s * -0.045, -upper - lower - 0.02, 0.05]); // thumb
    if (o.gloves && o.gloveCuff) ka.box(o.gloves, [0.12, 0.1, 0.13], [ax, -upper - lower + 0.02, 0]);
    if (o.extrasArm) o.extrasArm(ka, s, { upper, lower });
    K.stack.pop();
  }

  // ── legs ────────────────────────────────────────────────────────────────
  for (const s of [1, -1]) {
    const kl = K;
    const lpos = [s * HIP_X * bw, HIP_Y, 0];
    K.bone = rig.add(s > 0 ? 'leg_l' : 'leg_r', lpos, 'body');
    K.stack.push(K.M.clone().multiply(new THREE.Matrix4().makeTranslation(...lpos)));
    const thigh = 0.42, shin = 0.4;
    const bStyle = o.bottomStyle || 'trousers';
    const legTop = o.topStyle === 'dress' ? skin : bottom;
    const shinCol = bStyle === 'trousers' ? bottom : skin;
    if (!(o.topStyle === 'dress')) kl.box(legTop, [0.15, thigh, 0.17], [0, -thigh / 2 + 0.02, 0], { c: 0.03, cv: true });
    kl.box(shinCol, [0.13, shin, 0.14], [0, -thigh - shin / 2 + 0.06, 0], { c: 0.03, cv: true });
    if (bStyle === 'shorts') kl.box(bottom, [0.16, 0.2, 0.18], [0, -0.1, 0], { c: 0.03, cv: true });
    if (o.topStyle === 'dress') kl.box(skin, [0.13, thigh, 0.14], [0, -thigh / 2, 0], { c: 0.03, cv: true });
    if (o.socks) kl.box(o.socks, [0.135, 0.08, 0.145], [0, -HIP_Y + 0.12, 0]);
    // shoe: forward-pointing
    const sh = o.shoes;
    const boot = o.boots;
    if (boot) kl.box(sh, [0.15, 0.2, 0.17], [0, -HIP_Y + 0.12, 0.0]);
    kl.box(sh, [0.15, 0.09, 0.28], [0, -HIP_Y + 0.045, 0.05], { c: 0.03, cv: true });
    kl.box(shade(sh, 0.6), [0.155, 0.025, 0.285], [0, -HIP_Y + 0.012, 0.05]);
    if (o.extrasLeg) o.extrasLeg(kl, s);
    K.stack.pop();
  }
  rig.build(g, K, 'mesh');
  g.userData.rig = { hipY: HIP_Y, shoulderY: SH_Y, neckY: NECK_Y };
  return g;
}

// ── pedestrian variants ──────────────────────────────────────────────────────
const SK = PAL.skin, HR = PAL.hair;
const PEDS = [
  // 0 businessman: grey suit, red tie, briefcase
  {
    name: 'businessman', skin: SK[1], hair: HR[0], hairStyle: 'short', top: '#5b6068', topStyle: 'shirt', collar: '#e9e6dd',
    bottom: '#4b4f56', shoes: '#1f1e1e', cuff: '#e9e6dd',
    extrasBody: (k, d) => {
      k.box('#e9e6dd', [0.12, 0.3, 0.02], [0, 1.24, d.torsoD / 2 + 0.002]);
      k.box('#9c3a32', [0.05, 0.28, 0.02], [0, 1.22, d.torsoD / 2 + 0.012], { taper: [0.6, 1] });
      for (const s of [1, -1]) k.box(shade('#5b6068', 0.82), [0.03, 0.3, 0.02], [s * 0.075, 1.25, d.torsoD / 2 + 0.008], { rot: [0, 0, s * 0.25] });
    },
    extrasArm: (k, s) => { if (s < 0) { k.box('#4a3324', [0.09, 0.28, 0.38], [0, -0.78, 0.02]); k.box('#2a2a2a', [0.03, 0.05, 0.12], [0, -0.62, 0.02]); } },
  },
  // 1 jogger: coral tank, navy shorts, white sneakers, headband
  {
    name: 'jogger', skin: SK[3], hair: HR[5], hairStyle: 'buzz', top: '#d06a50', topStyle: 'tank', sleeve: 'none',
    bottom: '#2f3d55', bottomStyle: 'shorts', shoes: '#e9e6dd', socks: '#efefea', hat: 'headband', hatColor: '#efefea',
    extrasBody: (k, d) => { k.box('#efefea', [0.36, 0.03, d.torsoD + 0.01], [0, 1.18, 0]); },
    extrasArm: (k, s) => { if (s > 0) k.box('#2a2a2a', [0.115, 0.04, 0.125], [0, -0.52, 0]); },
  },
  // 2 tourist: teal print shirt, khaki shorts, backpack, bucket hat, camera
  {
    name: 'tourist', skin: SK[0], hair: HR[2], hairStyle: 'short', top: '#4f9a96', topStyle: 'shirt', sleeve: 'short',
    bottom: '#c2ae84', bottomStyle: 'shorts', shoes: '#7a5a3f', socks: '#efefea', hat: 'bucket', hatColor: '#d8cfb4', belt: '#5a4632',
    extrasBody: (k, d) => {
      // print: a few blossoms
      for (const [x, y] of [[-0.12, 1.25], [0.1, 1.1], [0.02, 1.32], [-0.06, 1.02], [0.14, 1.3]]) k.box('#e9d7a0', [0.05, 0.05, 0.01], [x, y, d.torsoD / 2 + 0.004]);
      // backpack
      k.box('#b0593b', [0.36, 0.44, 0.18], [0, 1.12, -d.torsoD / 2 - 0.08], { c: 0.05 });
      k.box('#8f4730', [0.28, 0.16, 0.06], [0, 1.0, -d.torsoD / 2 - 0.19]);
      for (const s of [1, -1]) k.box('#3a3a3a', [0.04, 0.46, 0.02], [s * 0.12, 1.16, d.torsoD / 2 + 0.006]);
      // camera
      k.box('#2a2a2c', [0.14, 0.09, 0.06], [0.04, 1.06, d.torsoD / 2 + 0.035]);
      k.cyl('#4a4a4c', 0.03, 0.03, 0.04, [0.06, 1.06, d.torsoD / 2 + 0.08], { axis: 'z', seg: 6 });
    },
  },
  // 3 hi-vis road worker: hard hat, vest, jeans, boots
  {
    name: 'roadworker', skin: SK[2], hair: HR[1], hairStyle: 'short', top: '#6a6f75', topStyle: 'shirt', sleeve: 'long',
    bottom: '#4a5b78', shoes: '#5a4030', boots: true, hat: 'hard', hatColor: '#e0702a', stubble: true,
    gloves: '#c9b58a',
    extrasBody: (k, d) => {
      k.box(PAL.hivis, [0.46, 0.44, 0.27], [0, 0.97, 0], { c: 0.05, base: true });
      for (const y of [1.05, 1.2]) k.box('#d9dcd4', [0.47, 0.035, 0.275], [0, y, 0]);
    },
  },
  // 4 older man in a cardigan: white hair, glasses, flat cap
  {
    name: 'oldman', skin: SK[0], hair: HR[3], hairStyle: 'white', top: '#8a6a4a', topStyle: 'cardigan', bottom: '#77736b',
    shoes: '#4a3a2c', glasses: '#3a3430', clearLenses: '#c9d6d6', hat: 'flat', hatColor: '#6b6458', moustache: true, build: 1.04,
    extrasArm: (k, s) => { if (s < 0) k.cyl('#5a4030', 0.018, 0.018, 0.86, [0, -0.62, 0.12], { seg: 5 }); },
  },
  // 5 woman in a summer dress: bob hair, sun hat, sandals
  {
    name: 'summerdress', skin: SK[1], hair: HR[4], hairStyle: 'bob', top: '#d9a8a0', topStyle: 'dress', sleeve: 'none',
    bottom: '#d9a8a0', shoes: '#b0865a', hat: 'sunhat', hatColor: '#e3d6b0', hatBand: '#4f8f8a', build: 0.92, headScale: 0.97,
    extrasBody: (k, d) => {
      for (const [x, y] of [[-0.1, 1.2], [0.08, 1.05], [0.12, 1.3], [-0.04, 0.85], [0.1, 0.8], [-0.14, 0.95]]) k.box('#f0e6d0', [0.045, 0.045, 0.01], [x, y, d.torsoD / 2 + 0.012]);
      k.box('#e9b9a8', [0.3, 0.03, 0.26], [0, 0.98, 0]);
      k.box('#6f4a3a', [0.12, 0.16, 0.05], [0.24, 1.0, 0.05]); // purse
    },
  },
  // 6 guy in a hoodie: grey hoodie, jeans, sneakers
  {
    name: 'hoodie', skin: SK[4], hair: HR[0], hairStyle: 'buzz', top: '#5f6a73', topStyle: 'hoodie', bottom: '#3d4c66',
    shoes: '#d9d4c8', cuff: shade('#5f6a73', 0.85),
  },
  // 7 cowboy-hat local: plaid-ish shirt, jeans, boots, buckle, moustache
  {
    name: 'cowboy', skin: SK[2], hair: HR[1], hairStyle: 'short', top: '#a65a40', topStyle: 'shirt', bottom: '#46597a',
    shoes: '#6a4630', boots: true, hat: 'cowboy', hatColor: '#9c7a52', moustache: true, belt: '#4a3324', build: 1.06,
    extrasBody: (k, d) => {
      k.box('#d9b45a', [0.08, 0.06, 0.02], [0, 0.91, d.torsoD / 2 + 0.03]);
      for (let i = 0; i < 3; i++) k.box(shade('#a65a40', 0.75), [0.45, 0.025, d.torsoD + 0.005], [0, 1.02 + i * 0.13, 0]);
      for (const x of [-0.12, 0.12]) k.box(shade('#a65a40', 0.75), [0.025, 0.42, d.torsoD + 0.005], [x, 1.18, 0]);
    },
  },
];

export function buildPed(variant = 0) {
  const spec = PEDS[((variant % PEDS.length) + PEDS.length) % PEDS.length];
  const g = buildHuman('ped', variant, spec);
  g.userData.style = spec.name;
  return g;
}

// ── Driver "Rook": trucker cap, flannel, sunglasses, stubble ─────────────────
export function buildDriver() {
  const flannel = '#9a4034', check = '#6e2c26';
  const g = buildHuman('driver', 0, {
    skin: SK[1], hair: HR[1], hairStyle: 'short', top: flannel, topStyle: 'shirt', sleeve: 'long', armColor: flannel,
    bottom: '#47587a', shoes: '#5c4330', boots: true, belt: '#3b2a1e', hat: 'cap', hatColor: '#3c5a58', hatFront: '#e2dccb',
    glasses: '#1b1c1e', stubble: true, build: 1.06,
    extrasBody: (k, d) => {
      // flannel checks: dark bands both ways
      for (let i = 0; i < 3; i++) k.box(check, [d.torsoW + 0.006, 0.05, d.torsoD + 0.006], [0, 1.04 + i * 0.12, 0]);
      for (const x of [-0.12, 0.12]) k.box(check, [0.05, 0.4, d.torsoD + 0.004], [x, 1.16, 0]);
      // pocket flaps
      for (const x of [-0.1, 0.1]) k.box('#7a322a', [0.1, 0.04, 0.01], [x, 1.27, d.torsoD / 2 + 0.008]);
      // open collar + white tee showing
      k.box('#e6e1d4', [0.14, 0.1, 0.02], [0, 1.36, d.torsoD / 2 + 0.006]);
      k.box(shade(flannel, 0.8), [0.24, 0.05, 0.12], [0, NECK_Y - 0.07, 0.03]);
    },
    extrasArm: (k) => { for (let i = 0; i < 2; i++) k.box(check, [0.114, 0.045, 0.124], [0, -0.12 - i * 0.2, 0]); k.box('#7a322a', [0.112, 0.06, 0.122], [0, -0.53, 0]); },
    extrasHead: (k, d) => {
      // cap logo dot: a tiny mustard diamond
      k.box(PAL.rvMustard, [0.05, 0.05, 0.01], [0, d.hy + d.HH / 2 + 0.015, d.HD / 2 + 0.025], { rot: [0, 0, Math.PI / 4] });
    },
  });
  g.userData.character = 'Rook';
  return g;
}

// ── Cook "Doc": orange apron, goggles on forehead, respirator at neck, gloves ─
export function buildCook() {
  const apron = '#e07a3f';
  const g = buildHuman('cook', 0, {
    skin: SK[0], hair: '#7a6a5a', hairStyle: 'bald', top: '#6b7f8c', topStyle: 'shirt', sleeve: 'long',
    bottom: '#3f4246', shoes: '#2a2a2b', boots: true, gloves: '#d9c24a', gloveCuff: true, build: 1.0, headScale: 1.02,
    extrasBody: (k, d) => {
      // apron bib + skirt (front), straps
      k.box(apron, [0.38, 0.34, 0.02], [0, 1.18, d.torsoD / 2 + 0.008]);
      k.box(apron, [0.44, 0.5, 0.05], [0, 0.6, d.torsoD / 2 - 0.0], { c: 0.01, base: true, taper: [0.92, 1] });
      k.box(apron, [0.42, 0.06, d.torsoD + 0.02], [0, 0.99, 0]);
      for (const s of [1, -1]) k.box(apron, [0.04, 0.2, d.torsoD + 0.03], [s * 0.16, 1.32, 0], { rot: [0, 0, s * 0.2] });
      k.box(shade(apron, 0.8), [0.2, 0.08, 0.02], [0, 1.08, d.torsoD / 2 + 0.022]); // pocket
      k.box('#cfd4d6', [0.02, 0.1, 0.02], [0.05, 1.1, d.torsoD / 2 + 0.035], { noBottom: true }); // pen
      // stains/wear on the apron
      k.box(shade(apron, 0.75), [0.08, 0.06, 0.01], [-0.12, 0.78, d.torsoD / 2 + 0.03], { noBottom: true });
      // respirator hanging at the neck: mask + two round filter cans
      k.box('#2f3337', [0.14, 0.1, 0.08], [0, 1.36, d.torsoD / 2 + 0.06]);
      for (const s of [1, -1]) k.cyl('#d06a3a', 0.055, 0.055, 0.06, [s * 0.1, 1.34, d.torsoD / 2 + 0.07], { axis: 'z', seg: 6 });
      k.box('#2f3337', [0.3, 0.02, 0.02], [0, 1.42, d.torsoD / 2 + 0.02]);
    },
    extrasHead: (k, d) => {
      // lab goggles pushed up onto the forehead: strap + two clear-ish lenses
      k.box('#4f8f8a', [d.HW + 0.03, 0.04, d.HD + 0.03], [0, d.hy + 0.115, 0]); // teal elastic strap
      k.box('#cfd6d0', [0.2, 0.075, 0.05], [0, d.hy + 0.125, d.HD / 2 + 0.025]); // frame
      for (const s of [1, -1]) k.box('#8fc2c8', [0.075, 0.05, 0.01], [s * 0.05, d.hy + 0.125, d.HD / 2 + 0.052]); // lenses
      // small round wire glasses on the eyes
      for (const s of [1, -1]) k.box('#4a4038', [0.07, 0.05, 0.01], [s * 0.058, d.hy + 0.025, d.HD / 2 + 0.008]);
      for (const s of [1, -1]) k.box('#b9d0d2', [0.05, 0.032, 0.01], [s * 0.058, d.hy + 0.025, d.HD / 2 + 0.012]);
      // grey side hair + goatee
      for (const s of [1, -1]) k.box('#8a7d70', [0.03, 0.1, 0.16], [s * (d.HW / 2 + 0.005), d.hy + 0.01, -0.04]);
      k.box('#8a7d70', [0.07, 0.06, 0.03], [0, d.hy - d.HH / 2 + 0.04, d.HD / 2 + 0.002]);
    },
  });
  g.userData.character = 'Doc';
  return g;
}

// ── Cow (blocky dairy cow, ~2.3 m) ───────────────────────────────────────────
export function buildCow(variant = 0) {
  const g = root('cow', variant, { w: 0.85, h: 1.55, l: 2.3 });
  const brown = variant % 2 === 1;
  const base = brown ? '#8a5a3c' : '#e9e4d8', patch = brown ? '#e9e4d8' : '#2a2726';
  const k = new Kit(30 + variant);
  const rig = new Rig();
  k.bone = rig.add('body', [0, 0.8, 0]);
  // barrel body
  k.box(base, [0.72, 0.68, 1.5], [0, 1.08, -0.05], { c: 0.12, cv: true });
  // patches (vertex-coloured decals on the sides / top)
  const P = (s, z, y, rz, ry) => {
    const pts = [];
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const f = 0.75 + ((i * 37 + z * 13) % 5) / 10; pts.push([z + Math.cos(a) * rz * f, y + Math.sin(a) * ry * f]); }
    k.side(patch, 0.36, pts, { side: s, off: 0.012 });
  };
  P(1, 0.25, 1.15, 0.28, 0.2); P(1, -0.45, 0.98, 0.22, 0.16); P(-1, -0.2, 1.18, 0.3, 0.18); P(-1, 0.45, 0.95, 0.15, 0.12);
  k.top(patch, 1.42, [[-0.2, -0.3], [0.25, -0.4], [0.3, 0.05], [-0.1, 0.12]], { off: 0.005 });
  // neck + head (head forward +Z, slightly lowered)
  k.box(base, [0.4, 0.42, 0.4], [0, 1.15, 0.75], { c: 0.08, cv: true, rot: [-0.3, 0, 0] });
  k.box(base, [0.36, 0.4, 0.46], [0, 1.08, 1.02], { c: 0.06 });
  k.box(patch, [0.37, 0.18, 0.2], [0.0, 1.18, 0.98]);
  k.box('#d9a39a', [0.32, 0.2, 0.14], [0, 0.96, 1.28], { c: 0.04, cv: true }); // muzzle
  for (const s of [1, -1]) {
    k.box('#2a2120', [0.04, 0.03, 0.02], [s * 0.07, 0.98, 1.355]); // nostrils
    k.box(PAL.eye, [0.03, 0.05, 0.05], [s * 0.18, 1.16, 1.1]); // eyes
    k.box(base, [0.16, 0.06, 0.08], [s * 0.24, 1.2, 0.92], { rot: [0, 0, s * -0.3] }); // ears
    k.box('#d8cfb9', [0.04, 0.1, 0.04], [s * 0.12, 1.32, 0.94], { rot: [0, 0, s * -0.4] }); // horns
  }
  // udder + tail
  k.box('#d9a39a', [0.3, 0.14, 0.32], [0, 0.72, -0.35], { c: 0.05, cv: true });
  k.box(base, [0.05, 0.6, 0.05], [0, 1.0, -0.82], { rot: [0.15, 0, 0] });
  k.box(patch, [0.08, 0.12, 0.08], [0, 0.68, -0.86]);
  // bell
  k.box(PAL.rvMustard, [0.1, 0.12, 0.08], [0, 0.86, 0.92]);
  // legs: bones at the shoulder/hip so rotation.x swings them like the humans
  for (const [name, x, z] of [['leg_fl', 0.22, 0.48], ['leg_fr', -0.22, 0.48], ['leg_rl', 0.22, -0.55], ['leg_rr', -0.22, -0.55]]) {
    k.withBone(rig.add(name, [x, 0.8, z], 'body'), () => k.at([x, 0.8, z], () => {
      k.box(base, [0.16, 0.7, 0.18], [0, -0.35, 0], { c: 0.03, cv: true, taper: [1.1, 1.1] });
      k.box('#2a2726', [0.165, 0.1, 0.185], [0, -0.75, 0.0]); // hoof
    }));
  }
  rig.build(g, k, 'mesh');
  return g;
}

export const CHARACTER_BUILDERS = {
  ped: { build: (v) => buildPed(v), variants: PEDS.length },
  driver: { build: () => buildDriver(), variants: 1 },
  cook: { build: () => buildCook(), variants: 1 },
  cow: { build: (v) => buildCow(v), variants: 2 },
};
export const PED_STYLES = PEDS.map((p) => p.name);
