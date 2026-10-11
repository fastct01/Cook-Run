// ─────────────────────────────────────────────────────────────────────────────
// Round 3 · garage pack (agent R3-GARAGE) — protective gear, the suited crew and the way-out
// arrows: suit_rack, crew_suited (0 Rook, 1 Doc), exit_arrow (0 floor chevron path, 1 floating
// arrow sign). PROPOSED, not wired into the game.
//   suit_rack     pivots suit_0 / suit_1 (hide one when that player suits up)
//   crew_suited   SAME rig as `driver` / `cook` (body → head, arm_l, arm_r, leg_l, leg_r; plain
//                 Object3D pivots holding `<name>_mesh`) so onfoot/avatar.js Avatar drives it as is.
//   exit_arrow    pivots chev_0 … chev_7 + arrow in BOTH variants (namedParts are per kind):
//                 v0 = 8 floor chevrons along a 90° right-hand curve + a painted end arrow `arrow`;
//                 v1 = floating arrow sign `arrow` (bob) with 8 chevron lamps chev_i on its strip.
//                 Chase light: cloneInstanceMaterials(obj) then set each chev_i material.color.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Kit, root, offsetPoly } from '../models/kit.js';
import { PAL, mix, shade, vcolMaterial } from '../palette.js';
import { kmesh, pivot, beam, rod, ring, glowAdd } from './hazards-util.js';
import { person, SK, HR, NECK_Y, HIP_Y } from './people-human.js';
import { Labels, chevronMaterial } from './r3-garage-atlas.js';

export const SUIT = '#f2c230', SEAM = '#c99a1c', NITRILE = '#3f7fd0', ZIP = '#4d4b46';
const STEEL_D = '#5d6367', CHROME = PAL.chrome;

// ═════════════════════════════════════════════════════════════════════════════
// suit_rack — plywood wall board with a hanging rail: two yellow suits (pivots suit_0, suit_1 at
// their hanger hooks), two half-face respirators + goggles on hooks, a shelf with a box of blue
// nitrile gloves, a pair of rubber boots on the floor, two rubber aprons, a SUIT UP sign.
// 2.0 m wide, 0.5 m deep, 2.2 m tall. Back at z = −0.25.
// ═════════════════════════════════════════════════════════════════════════════
const RAIL_Y = 1.98, RAIL_Z = -0.07;
export const SUIT_HOOKS = [[-0.66, RAIL_Y, RAIL_Z], [-0.04, RAIL_Y, RAIL_Z + 0.02]];

/** One hanging suit in pivot space (origin = hook on the rail, hangs down −Y, front +Z). */
function hangingSuit(k, lean = 0) {
  // hanger
  k.box('#5d6367', [0.012, 0.07, 0.012], [0, -0.02, 0]);
  k.box('#5d6367', [0.02, 0.02, 0.012], [0.008, 0.02, 0], { rot: [0, 0, 0.8] });
  for (const s of [-1, 1]) beam(k, '#7a5c40', [0, -0.07, 0], [s * 0.21, -0.17, 0], 0.025, 0.012);
  k.at([0, 0, 0], [0, 0, lean], () => {
    // hood hung over the hanger (face opening dark-yellow), shoulders, torso, sleeves, legs
    k.box(SUIT, [0.26, 0.26, 0.2], [0, -0.13, -0.03], { c: 0.04, cv: true, taper: [0.9, 0.85] });
    k.box(SEAM, [0.16, 0.18, 0.01], [0, -0.15, 0.068]);
    k.box(shade(SUIT, 0.75), [0.13, 0.15, 0.006], [0, -0.15, 0.075]);
    k.box(SUIT, [0.52, 0.12, 0.14], [0, -0.26, 0], { c: 0.04, cv: true });
    k.box(SUIT, [0.44, 0.58, 0.13], [0, -0.82, 0], { base: true, taper: [1.04, 1] });
    k.box(SEAM, [0.45, 0.035, 0.135], [0, -0.66, 0]);                              // waist elastic
    k.box(ZIP, [0.016, 0.48, 0.004], [0, -0.54, 0.067]);
    k.box('#c9c6bb', [0.03, 0.045, 0.008], [0, -0.32, 0.07]);                       // zip pull
    k.box('#f4f1e8', [0.08, 0.05, 0.004], [0.11, -0.4, 0.067]);                     // tag
    for (const s of [-1, 1]) {
      k.box(SUIT, [0.11, 0.56, 0.11], [s * 0.27, -0.84, 0.0], { base: true, rot: [0, 0, s * 0.05] });
      k.box(SEAM, [0.115, 0.04, 0.115], [s * 0.285, -0.82, 0.0], { rot: [0, 0, s * 0.05] });
      k.box(SUIT, [0.19, 0.74, 0.12], [s * 0.105, -1.55, 0], { base: true });
      k.box(SEAM, [0.195, 0.04, 0.125], [s * 0.105, -1.53, 0]);
      k.box(shade(SUIT, 0.86), [0.012, 0.6, 0.004], [s * 0.012, -1.45, 0.061], { base: true });   // leg crease
    }
  });
}
/** Half-face respirator hanging from a hook by its head strap. */
function respirator(k, [x, y, z], cart = '#d06a3a') {
  for (const s of [-1, 1]) beam(k, '#2a2b2d', [x, y, z], [x + s * 0.07, y - 0.12, z + 0.02], 0.015, 0.006);
  k.box('#2f3337', [0.13, 0.11, 0.08], [x, y - 0.17, z + 0.03], { taper: [0.75, 0.8] });
  k.box('#3e4448', [0.06, 0.04, 0.03], [x, y - 0.2, z + 0.075]);
  for (const s of [-1, 1]) k.cyl(cart, 0.045, 0.045, 0.05, [x + s * 0.085, y - 0.18, z + 0.05], { axis: 'z', seg: 6, rot: [0, s * 0.35, 0] });
}
export function buildSuitRack() {
  const g = root('suit_rack', 0, { w: 2.0, h: 2.2, l: 0.5 });
  const B = new Kit(9901); B.floor = 0;
  const L = new Labels();
  const bz = -0.25 + 0.0125;
  // wall board + frame strips, rail on two brackets, hooks
  B.box('#b58f5e', [2.0, 1.24, 0.025], [0, 0.94, bz], { base: true });
  for (const y of [0.94, 2.16]) B.box('#8a6a4a', [2.0, 0.03, 0.035], [0, y, bz + 0.005], { base: true });
  L.add('suitup', [0.62, 2.0, bz + 0.0135], 0.62, 0.21);
  B.cyl(CHROME, 0.016, 0.016, 1.38, [-0.35, RAIL_Y, RAIL_Z], { axis: 'x', seg: 6 });
  for (const x of [-0.98, 0.3]) beam(B, STEEL_D, [x, RAIL_Y + 0.02, bz], [x, RAIL_Y, RAIL_Z], 0.03, 0.04);
  for (const [x, y] of [[0.36, 1.66], [0.58, 1.66], [0.47, 1.43], [0.74, 1.86], [0.8, 1.86]]) B.box(STEEL_D, [0.02, 0.02, 0.06], [x, y, bz + 0.04], { rot: [-0.3, 0, 0] });
  // respirators + goggles on hooks
  respirator(B, [0.36, 1.66, bz + 0.07], '#d06a3a');
  respirator(B, [0.58, 1.66, bz + 0.07], '#b4467a');
  beam(B, '#4f8f8a', [0.47, 1.43, bz + 0.07], [0.39, 1.33, bz + 0.06], 0.02, 0.006);
  beam(B, '#4f8f8a', [0.47, 1.43, bz + 0.07], [0.55, 1.33, bz + 0.06], 0.02, 0.006);
  B.box('#cfd6d0', [0.19, 0.075, 0.06], [0.47, 1.3, bz + 0.07], { c: 0.015 });
  for (const s of [-1, 1]) B.box('#8fc2c8', [0.07, 0.048, 0.01], [0.47 + s * 0.048, 1.3, bz + 0.1]);
  // small shelf with the glove box (+ two gloves poking out)
  B.box('#8a6a4a', [0.42, 0.025, 0.2], [0.5, 1.05, bz + 0.1], { base: true });
  for (const x of [0.33, 0.67]) B.box(STEEL_D, [0.02, 0.12, 0.12], [x, 0.94, bz + 0.07], { base: true, taper: [1, 0.2], shear: [0, -0.05] });
  B.box(NITRILE, [0.25, 0.12, 0.13], [0.48, 1.075, bz + 0.1], { base: true });
  L.add('gloves', [0.48, 1.135, bz + 0.1 + 0.066], 0.24, 0.115);
  B.box('#5b95dd', [0.06, 0.07, 0.03], [0.45, 1.215, bz + 0.1], { rot: [0.3, 0, 0.4] });
  B.box('#5b95dd', [0.05, 0.06, 0.03], [0.52, 1.21, bz + 0.09], { rot: [-0.2, 0, -0.3] });
  B.box('#5b95dd', [0.12, 0.09, 0.025], [0.67, 1.075, bz + 0.12], { base: true, rot: [0, 0.4, 0] });   // a glove lying on the shelf
  // two rubber aprons on hooks (green, black)
  for (const [x, dz, col] of [[0.74, 0.06, '#3f5a4a'], [0.8, 0.09, '#2b2c2e']]) {
    for (const s of [-1, 1]) beam(B, shade(col, 0.8), [x, 1.86, bz + 0.07], [x + s * 0.11, 1.72, bz + dz], 0.02, 0.006);
    B.box(col, [0.38, 0.86, 0.014], [x, 0.86, bz + dz], { base: true, taper: [0.55, 1] });
    for (const s of [-1, 1]) B.box(shade(col, 0.8), [0.025, 0.36, 0.006], [x + s * 0.2, 0.86, bz + dz + 0.009], { base: true, rot: [0, 0, s * 0.12] });
  }
  // rubber boots on the floor (under the shelf)
  for (const [x, z, a] of [[0.36, 0.05, 0.12], [0.55, 0.08, -0.08]]) {
    B.at([x, 0, z], [0, a, 0], () => {
      B.box('#38503e', [0.13, 0.36, 0.15], [0, 0.07, -0.03], { base: true, c: 0.02, cv: true });
      B.box('#38503e', [0.13, 0.1, 0.27], [0, 0.0, 0.03], { base: true, c: 0.03, cv: true });
      B.box('#e2b93b', [0.135, 0.025, 0.275], [0, 0.0, 0.03], { base: true });
      B.box(shade('#38503e', 0.75), [0.135, 0.04, 0.155], [0, 0.4, -0.03], { base: true });
    });
  }
  g.add(kmesh(B, 'body'));
  g.add(L.mesh('labels'));
  // the two suits (separately hideable pivots)
  SUIT_HOOKS.forEach((p, i) => {
    const k = new Kit(9910 + i);
    hangingSuit(k, i ? -0.02 : 0.015);
    g.add(pivot('suit_' + i, k.mesh('m'), p));
  });
  g.userData.suits = { hooks: SUIT_HOOKS, note: 'Hide suit_i (visible = false) when that player suits up. Use spots: in front of each suit, 0.75 m out from the wall.' };
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// crew_suited — v0 Rook, v1 Doc, as the garage avatars but in yellow protective suits (#f2c230,
// darker seams), hood up, respirator hanging round the neck, blue nitrile gloves.
// Same pivots / proportions as driver / cook (people-human.js `person`, a copy of buildHuman).
// ═════════════════════════════════════════════════════════════════════════════
function suitBody(k, d) {
  const z = d.torsoD / 2;
  k.box(SUIT, [0.21, 0.08, 0.2], [0, NECK_Y - 0.07, -0.005], { c: 0.03, cv: true });     // hood's neck skirt / collar
  k.box(SEAM, [d.torsoW * 0.88 + 0.012, 0.045, d.torsoD * 0.94 + 0.012], [0, 0.91, 0]); // waist elastic
  k.box(ZIP, [0.018, 0.5, 0.006], [0, 0.94, z + 0.003], { base: true });
  k.box('#f4f1e8', [0.08, 0.05, 0.006], [0.11 * d.bw, 1.25, z + 0.004]);                 // suit tag
  // respirator hanging round the neck (as Doc's): mask, two filter cans, strap
  k.box('#2f3337', [0.14, 0.1, 0.08], [0, 1.34, z + 0.06]);
  for (const s of [1, -1]) k.cyl('#d06a3a', 0.055, 0.055, 0.06, [s * 0.1, 1.32, z + 0.07], { axis: 'z', seg: 6 });
  k.box('#2f3337', [0.3, 0.02, 0.02], [0, 1.41, z + 0.02]);
}
function hood(k, d) {
  const { HW, HH, HD, hy } = d, zc = -0.02, dz = HD + 0.06;
  k.box(SUIT, [HW + 0.07, 0.05, dz], [0, hy + HH / 2 + 0.02, zc]);
  for (const s of [1, -1]) k.box(SUIT, [0.035, HH + 0.06, dz], [s * (HW / 2 + 0.022), hy - 0.01, zc]);
  k.box(SUIT, [HW + 0.07, HH + 0.06, 0.04], [0, hy - 0.01, -HD / 2 - 0.03]);
  k.box(SUIT, [HW + 0.07, 0.07, dz], [0, hy - HH / 2 - 0.03, zc]);
  // elastic face rim
  k.box(SEAM, [HW + 0.07, 0.03, 0.02], [0, hy + HH / 2 + 0.01, HD / 2 + 0.01]);
  for (const s of [1, -1]) k.box(SEAM, [0.03, HH + 0.02, 0.02], [s * (HW / 2 + 0.022), hy - 0.01, HD / 2 + 0.01]);
}
const ankle = (k) => k.box(SEAM, [0.158, 0.04, 0.178], [0, -HIP_Y + 0.24, 0]);

export function buildCrewSuited(variant = 0) {
  const doc = variant % 2 === 1;
  const common = { top: SUIT, topStyle: 'shirt', sleeve: 'long', armColor: SUIT, bottom: SUIT, boots: true, gloves: NITRILE, gloveCuff: true, hairStyle: 'none', extrasLeg: ankle };
  const g = doc
    ? person('crew_suited', 1, {
      ...common, character: 'Doc', style: 'doc_suited', skin: SK[0], hair: '#7a6a5a', shoes: '#2a2a2b', build: 1.0, headScale: 1.02,
      extrasBody: suitBody,
      extrasHead: (k, d) => {
        hood(k, d);
        // lab goggles pushed up onto the hood: teal strap round it + frame + lenses
        k.box('#4f8f8a', [d.HW + 0.1, 0.04, d.HD + 0.1], [0, d.hy + 0.115, -0.02]);
        k.box('#cfd6d0', [0.2, 0.075, 0.05], [0, d.hy + 0.125, d.HD / 2 + 0.04]);
        for (const s of [1, -1]) k.box('#8fc2c8', [0.075, 0.05, 0.01], [s * 0.05, d.hy + 0.125, d.HD / 2 + 0.067]);
        // small wire glasses + goatee
        for (const s of [1, -1]) k.box('#4a4038', [0.07, 0.05, 0.01], [s * 0.058, d.hy + 0.025, d.HD / 2 + 0.008]);
        for (const s of [1, -1]) k.box('#b9d0d2', [0.05, 0.032, 0.01], [s * 0.058, d.hy + 0.025, d.HD / 2 + 0.012]);
        k.box('#8a7d70', [0.07, 0.06, 0.03], [0, d.hy - d.HH / 2 + 0.04, d.HD / 2 + 0.002]);
      },
    })
    : person('crew_suited', 0, {
      ...common, character: 'Rook', style: 'rook_suited', skin: SK[1], hair: HR[1], shoes: '#5c4330', glasses: '#1b1c1e', stubble: true, build: 1.06,
      extrasBody: suitBody,
      extrasHead: (k, d) => {
        hood(k, d);
        // Rook keeps his teal trucker cap on, over the hood
        const top = d.hy + d.HH / 2;
        k.box('#3c5a58', [d.HW + 0.1, 0.08, d.HD + 0.1], [0, top + 0.07, -0.02], { cv: true, c: 0.03, taper: [0.9, 0.88] });
        k.box('#e2dccb', [d.HW * 0.86, 0.075, 0.02], [0, top + 0.07, d.HD / 2 + 0.035]);
        k.box(shade('#3c5a58', 0.8), [d.HW * 0.92, 0.02, 0.14], [0, top + 0.035, d.HD / 2 + 0.1], { rot: [0.12, 0, 0] });
        k.box(PAL.rvMustard, [0.05, 0.05, 0.01], [0, top + 0.075, d.HD / 2 + 0.047], { rot: [0, 0, Math.PI / 4] });
      },
    });
  g.userData.swapFor = doc ? 'cook' : 'driver';
  g.userData.note = 'Drop-in for createModel(swapFor): same pivots (body, head, arm_l, arm_r, leg_l, leg_r) and proportions — new Avatar(createModel("crew_suited", v)).';
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// exit_arrow
// ═════════════════════════════════════════════════════════════════════════════
export const EXIT = Object.freeze({ straight: 4.5, radius: 6.0, count: 8, first: 0.8, spacing: 1.72, arrowS: 14.7, color: '#F2B90F', edge: '#2a2116' });
const EXIT_LEN = EXIT.straight + EXIT.radius * Math.PI / 2;
/** Path point + heading at arc length s (path frame: start (0,0) heading +Z, turns right = toward −X). */
export function exitPath(s) {
  const { straight: L1, radius: R } = EXIT;
  if (s <= L1) return { x: 0, z: s, hx: 0, hz: 1 };
  if (s <= EXIT_LEN) { const t = (s - L1) / R; return { x: -R + R * Math.cos(t), z: L1 + R * Math.sin(t), hx: -Math.sin(t), hz: Math.cos(t) }; }
  return { x: -R - (s - EXIT_LEN), z: L1 + R, hx: -1, hz: 0 };
}
/** Chevron outline (u across, v along; tip at +v). */
function chevPts(W, Ln, t) {
  return [[0, Ln / 2], [W / 2, -Ln / 2 + t], [W / 2, -Ln / 2], [0, Ln / 2 - t], [-W / 2, -Ln / 2], [-W / 2, -Ln / 2 + t]];
}
/** Arrow outline (u across, v along; tip at +v), total length Ln, shaft half-width sw, head half-width hw, head length hl. */
function arrowPts(Ln, sw, hwid, hl) {
  const b = -Ln / 2, n = Ln / 2 - hl;
  return [[-sw, b], [sw, b], [sw, n], [hwid, n], [0, Ln / 2], [-hwid, n], [-sw, n]];
}
/** Flat floor decal geometry (dark edge + yellow face) from a 2D outline, lying on y ≈ 0.012…0.016. */
function floorDecal(pts, edge = 0.06) {
  const k = new Kit(9950);
  const map = (y) => (u, v) => [u, y, v];
  k.flat(EXIT.edge, offsetPoly(pts, edge), map(0.012), { facing: [0, 1, 0], off: 0 });
  k.flat(EXIT.color, pts, map(0.016), { facing: [0, 1, 0], off: 0 });
  k.flat(mix(EXIT.color, '#fff4c8', 0.2), offsetPoly(pts, -0.1), map(0.017), { facing: [0, 1, 0], off: 0 });
  return k.geometry();
}

export function buildExitArrow(variant = 0) {
  return variant % 2 ? floatingArrow() : chevronPath();
}

function chevronPath() {
  // chevron centres along the path, the end arrow just past the curve
  const S = Array.from({ length: EXIT.count }, (_, i) => EXIT.first + i * EXIT.spacing);
  const pts = [...S, EXIT.arrowS].map(exitPath);
  // footprint → centre the model on it (asset rule), remember where the path starts
  const xs = [], zs = [];
  for (const p of pts) for (const [du, dv] of [[-1.3, -1.3], [1.3, 1.3], [-1.3, 1.3], [1.3, -1.3]]) { xs.push(p.x + du); zs.push(p.z + dv); }
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const g = root('exit_arrow', 0, { w: +(Math.max(...xs) - Math.min(...xs)).toFixed(2), h: 0.02, l: +(Math.max(...zs) - Math.min(...zs)).toFixed(2) });
  const cg = floorDecal(chevPts(1.5, 0.95, 0.42));
  const mat = chevronMaterial();
  S.forEach((s, i) => {
    const p = exitPath(s);
    const m = new THREE.Mesh(cg, mat); m.castShadow = false; m.receiveShadow = false; m.renderOrder = 1;
    g.add(pivot('chev_' + i, m, [p.x - cx, 0, p.z - cz], [0, Math.atan2(p.hx, p.hz), 0]));
  });
  // end arrow: painted floor arrow (same chase material) + OUT lettering on its shaft
  const pa = exitPath(EXIT.arrowS);
  const am = new THREE.Mesh(floorDecal(arrowPts(2.2, 0.4, 0.85, 0.9)), mat); am.castShadow = false; am.renderOrder = 1;
  const ap = pivot('arrow', am, [pa.x - cx, 0, pa.z - cz], [0, Math.atan2(pa.hx, pa.hz), 0]);
  const L = new Labels();
  L.add('out', [0, 0.0185, -0.42], 0.62, 0.25, { rotX: -Math.PI / 2, rotY: Math.PI });
  const lm = L.mesh('arrow_text'); lm.renderOrder = 2; ap.add(lm);
  g.add(ap);
  g.userData.perInstanceMaterials = ['chev_*', 'arrow_mesh'];
  g.userData.path = {
    start: [+(-cx).toFixed(3), 0, +(-cz).toFixed(3)], startDir: [0, 0, 1], end: [+(exitPath(EXIT_LEN).x - cx).toFixed(3), 0, +(exitPath(EXIT_LEN).z - cz).toFixed(3)], endDir: [-1, 0, 0],
    length: +EXIT_LEN.toFixed(2), straight: EXIT.straight, radius: EXIT.radius, chevronS: S.map((s) => +s.toFixed(2)), arrowS: EXIT.arrowS,
    note: 'Place so `start` lands on the RV nose: obj.position = noseXZ − rotY(start). Turns RIGHT (toward −X) when the start heads +Z.',
  };
  g.userData.chase = { period: 1.2, rest: '#b4b4b4', lit: '#ffffff', note: 'cloneInstanceMaterials(obj); each frame k_i = max(0, 1 − |((t/period) mod 1)·9 − i|) for chev_i (i = 0..7) and arrow (i = 8); material.color.setScalar(0.62 + 0.38·k_i).' };
  return g;
}

function floatingArrow() {
  const restY = 2.4;
  const g = root('exit_arrow', 1, { w: 2.2, h: 3.4, l: 1.3 });
  // arrow body (pointing +X = the viewer's right when seen from the front), extruded 0.28 deep
  const k = new Kit(9960);
  const D = 0.28;
  const shape = [[-1.0, -0.3], [0.18, -0.3], [0.18, -0.64], [1.0, 0], [0.18, 0.64], [0.18, 0.3], [-1.0, 0.3]];
  k.extrude(EXIT.edge, shape, D, { axis: 'z', bevel: 0.04 });
  const inner = offsetPoly(shape, -0.07);
  for (const dir of [1, -1]) {
    k.front(EXIT.color, dir * D / 2, inner, dir, { off: 0.008 });
    k.front(shade(EXIT.color, 0.84), dir * D / 2, [[0.26, -0.5], [0.86, -0.03], [0.26, -0.2]], dir, { off: 0.014 });
  }
  // chase strip under the arrow: dark rounded bar on two short hangers
  k.box(EXIT.edge, [1.9, 0.3, 0.14], [-0.05, -0.72, 0], { c: 0.04 });
  for (const x of [-0.75, 0.6]) k.box('#3a3b3d', [0.04, 0.16, 0.04], [x, -0.48, 0]);
  const ap = pivot('arrow', k.mesh('m'), [0, restY, 0]);
  const L = new Labels();
  L.add('out', [-0.42, 0, D / 2 + 0.016], 1.06, 0.44);
  L.add('out', [-0.42, 0, -D / 2 - 0.016], 1.06, 0.44, { rotY: Math.PI, flipU: false });
  ap.add(L.mesh('arrow_text'));
  // 8 chevron lamps on the strip, pointing +X, both faces
  const ck = new Kit(9961);
  const cp = chevPts(0.2, 0.17, 0.085).map(([u, v]) => [v, u]);     // tip toward +X
  for (const dir of [1, -1]) {
    ck.front(EXIT.edge, dir * 0.075, offsetPoly(cp, 0.012), dir, { off: 0.001 });
    ck.front(EXIT.color, dir * 0.075, cp, dir, { off: 0.004 });
  }
  const cgeo = ck.geometry(), mat = chevronMaterial();
  for (let i = 0; i < EXIT.count; i++) {
    const m = new THREE.Mesh(cgeo, mat); m.castShadow = false;
    ap.add(pivot('chev_' + i, m, [-0.84 + i * 0.225, -0.72, 0]));
  }
  g.add(ap);
  // soft glow spot on the ground under it (additive; also anchors the model on y = 0)
  const rk = new Kit(9962);
  ring(rk, '#d9a43a', 0.62, 0.78, [0, 0, 0], 24);
  ring(rk, '#3a2806', 0.0, 0.62, [0, -0.001, 0], 16);
  ring(rk, (i) => (i % 2 ? null : '#8a6420'), 0.4, 0.48, [0, 0.001, 0], 16);
  const rm = new THREE.Mesh(rk.geometry(), glowAdd('CR_ExitSpot'));
  rm.renderOrder = 2; rm.castShadow = false; rm.receiveShadow = false;
  g.add(pivot('spot', rm, [0, 0.02, 0]));
  g.userData.perInstanceMaterials = ['chev_*'];
  g.userData.arrow = { restY, bob: 0.12, note: 'arrow.position.y = restY + bob·sin(2.4t). Points +X (the viewer’s right seen from the front). In the garage: rotation.y = π so it faces the parked RV and points to the driver’s right.' };
  g.userData.chase = { period: 1.0, note: 'cloneInstanceMaterials(obj); chev_i material.color.setScalar(0.62 + 0.38·k_i) as for variant 0 (i = 0..7, left → right).' };
  return g;
}
