// ─────────────────────────────────────────────────────────────────────────────
// Round 3 · garage pack (agent R3-GARAGE) — Doc's home lab: chem_bench, fume_hood, chem_drums,
// gas_cylinders, reagent_shelf, recipe_whiteboard, element_poster, safety_station.
// PROPOSED, not wired into the game. Conventions: metres, origin at the ground centre of the
// footprint, front = +Z, back flat against a wall at z = −l/2 for wall props. One vertex-colour
// Kit per material (body / glass) + one atlas mesh for labels → 1–3 draw calls per prop.
// All labels are invented (lab.json ingredient names); the chemistry is set dressing only.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Kit, root, rng } from '../models/kit.js';
import { PAL, mix, shade } from '../palette.js';
import { kmesh, rod, beam } from './hazards-util.js';
import { Labels, glassMaterial } from './r3-garage-atlas.js';

const STEEL = '#8f969a', STEEL_D = '#5d6367', GALV = '#b4b7b2', PLY = '#c29a66', PLY_D = '#a87f4e';
const GLASS = '#cfe6ea';
const T8 = Math.PI / 8;

/** Bake body (+ optional glass and labels) into the root group. */
function bake(g, B, G, L) {
  g.add(kmesh(B, 'body'));
  if (G && G.p.length) { const gm = kmesh(G, 'glass', glassMaterial(), false, false); gm.renderOrder = 3; g.add(gm); }
  if (L && L.q.length) g.add(L.mesh('labels'));
  return g;
}
/** Round-bottom flask (glass) at pos = centre of the bulb; r bulb radius, neck radius nr, neck top above centre. */
function flask(k, [x, y, z], r, nr, top) {
  k.lathe(GLASS, [[0.001, -r], [r * 0.72, -r * 0.7], [r, 0], [r * 0.72, r * 0.7], [nr, r * 0.94], [nr, top]], 8, [x, y, z], { rot: [0, T8, 0] });
}
/** Liquid filling the lower part of a round-bottom flask (opaque). */
function flaskFill(k, color, [x, y, z], r, level = 0.2) {
  k.lathe(color, [[0.001, -r * 0.95], [r * 0.68, -r * 0.66], [r * 0.93, level * r], [0.001, level * r]], 8, [x, y, z], { rot: [0, T8, 0] });
}

// ═════════════════════════════════════════════════════════════════════════════
// chem_bench — 1.8 × 0.7 m steel-frame bench, dark epoxy top, distillation set-up on two retort
// stands (two round-bottom flasks in clamps, condenser + tubing), hot plate, beakers, graduated
// cylinders, digital scale, open notebook. Back edge at z = −0.35 (against the wall).
// ═════════════════════════════════════════════════════════════════════════════
export function buildChemBench() {
  const W = 1.8, D = 0.7, TOP = 0.92;
  const g = root('chem_bench', 0, { w: W, h: 1.82, l: D });
  const B = new Kit(9101); B.floor = 0;
  const G = new Kit(9102);
  const L = new Labels();
  const hw = W / 2, hd = D / 2;
  // frame: 4 square legs, lower stretchers, lower shelf (plywood) with a tub and a box
  for (const x of [-hw + 0.04, hw - 0.04]) for (const z of [-hd + 0.04, hd - 0.04]) B.box(STEEL_D, [0.05, TOP - 0.05, 0.05], [x, 0, z], { base: true });
  for (const z of [-hd + 0.04, hd - 0.04]) B.box(STEEL_D, [W - 0.06, 0.04, 0.04], [0, 0.16, z]);
  B.box('#8a6a4a', [W - 0.1, 0.025, D - 0.08], [0, 0.18, 0], { base: true });
  B.box('#dcd7cb', [0.5, 0.2, 0.36], [-0.45, 0.205, 0.02], { base: true, noBottom: true });           // grey tub
  B.box('#c9b98e', [0.4, 0.26, 0.34], [0.35, 0.205, -0.03], { base: true, noBottom: true, rot: [0, 0.12, 0] }); // carton
  B.box(shade('#c9b98e', 0.8), [0.42, 0.02, 0.1], [0.35, 0.47, 0.08], { rot: [0.5, 0.12, 0] });       // open flap
  // top: steel apron + dark epoxy slab with a lighter front edge + low back upstand
  B.box(STEEL, [W, 0.08, D], [0, TOP - 0.13, 0], { base: true, noBottom: true });
  B.box('#33373a', [W + 0.02, 0.05, D + 0.02], [0, TOP - 0.05, 0], { base: true });
  B.box('#4a4f52', [W + 0.02, 0.012, 0.012], [0, TOP - 0.005, hd + 0.005]);
  B.box('#33373a', [W + 0.02, 0.16, 0.03], [0, TOP, -hd + 0.005], { base: true });
  // ── hot plate (left) with flask A in a clamp ──
  const hpx = -0.46, hpz = 0.02;
  B.box('#e9e6dc', [0.26, 0.08, 0.28], [hpx, TOP, hpz], { base: true });
  B.cyl('#5a5d60', 0.1, 0.1, 0.012, [hpx, TOP + 0.08, hpz - 0.02], { base: true, seg: 10 });
  L.add('hotplate', [hpx, TOP + 0.04, hpz + 0.141], 0.24, 0.075);
  for (const s of [-1, 1]) B.cyl(s < 0 ? '#c0392b' : '#2f6db0', 0.016, 0.016, 0.014, [hpx + s * 0.075, TOP + 0.03, hpz + 0.146], { axis: 'z', seg: 6 });
  const fA = [hpx, TOP + 0.092 + 0.1, hpz - 0.02];
  flask(G, fA, 0.1, 0.022, 0.2);
  flaskFill(B, '#7fd6c2', fA, 0.1, 0.15);
  // still head (glass) + thermometer stub
  G.cyl(GLASS, 0.02, 0.02, 0.1, [fA[0], fA[1] + 0.24, fA[2]], { seg: 6, open: true });
  B.box('#c0392b', [0.006, 0.08, 0.006], [fA[0], fA[1] + 0.33, fA[2]]);
  // ── retort stand 1 (behind the hot plate) ──
  const stand = (x, z, h, clamps) => {
    B.box(STEEL_D, [0.2, 0.02, 0.18], [x, TOP, z + 0.03], { base: true });
    B.cyl(GALV, 0.011, 0.011, h, [x, TOP + 0.02, z], { base: true, seg: 5 });
    for (const [y, tx, tz] of clamps) {
      B.box('#3a3b3d', [0.04, 0.035, 0.04], [x, y, z]);                                  // boss head
      beam(B, GALV, [x, y, z], [tx, y, tz], 0.012);
      B.box('#b8392e', [0.05, 0.03, 0.03], [tx, y, tz]);                                 // jaw (rubber)
    }
  };
  stand(hpx - 0.06, -0.24, 0.86, [[fA[1] + 0.17, fA[0], fA[2] - 0.02], [fA[1] + 0.36, fA[0] + 0.12, fA[2] - 0.03]]);
  // ── condenser: still head → down-slope to flask B ──
  const c0 = new THREE.Vector3(fA[0] + 0.02, fA[1] + 0.27, fA[2]);
  const c1 = new THREE.Vector3(0.06, TOP + 0.3, fA[2] - 0.01);
  const dir = c1.clone().sub(c0), len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  const mid = c0.clone().add(c1).multiplyScalar(0.5);
  const cm = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
  G.geo(new THREE.CylinderGeometry(0.036, 0.036, len * 0.78, 8, 1, true), GLASS, cm);          // water jacket
  B.geo(new THREE.CylinderGeometry(0.009, 0.009, len, 5, 1, true), '#d9eef2', cm);              // inner tube
  for (const t of [-0.3, 0.3]) {                                                                 // hose nipples + tubing to taps on the upstand
    const p = c0.clone().addScaledVector(dir, 0.5 + t);
    B.cyl('#cfe0e4', 0.008, 0.008, 0.05, [p.x, p.y + 0.04, p.z], { seg: 4 });
    const tx = t < 0 ? -0.16 : 0.42, ty = TOP + 0.1;
    B.box('#9aa1a5', [0.05, 0.05, 0.04], [tx, ty, -0.31]);
    B.box(t < 0 ? '#2f6db0' : '#c0392b', [0.06, 0.012, 0.012], [tx, ty + 0.035, -0.31]);
    rod(B, '#6fa8c4', [[p.x, p.y + 0.06, p.z], [p.x + (t < 0 ? -0.02 : 0.05), p.y + 0.15, p.z - 0.1], [tx, ty + 0.12, -0.24], [tx, ty, -0.285]], 0.009, 3);
  }
  // ── flask B (receiver) in a clamp on stand 2 ──
  const fB = [c1.x + 0.03, TOP + 0.075, c1.z];
  B.cyl('#8a6a4a', 0.06, 0.07, 0.025, [fB[0], TOP, fB[2]], { base: true, seg: 8, open: true });  // cork ring
  flask(G, fB, 0.075, 0.018, 0.2);
  flaskFill(B, '#b8e8db', fB, 0.075, -0.25);
  stand(fB[0] + 0.2, -0.2, 0.62, [[fB[1] + 0.14, fB[0], fB[2] - 0.01], [c1.y + 0.03, c1.x + 0.02, c1.z]]);
  // ── beakers + graduated cylinders (right) ──
  const beaker = (x, z, r, h, fill, col) => {
    G.lathe(GLASS, [[0.001, 0], [r, 0], [r, h], [r * 1.08, h + 0.008]], 8, [x, TOP, z], { rot: [0, T8, 0] });
    if (fill) B.cyl(col, r * 0.92, r * 0.92, h * fill, [x, TOP + 0.003, z], { base: true, seg: 8, rot: [0, T8, 0] });
    B.box('#f1f4f4', [0.006, h * 0.6, 0.003], [x - r * 0.45, TOP + h * 0.5, z + r * 0.93], { noBottom: true });
  };
  beaker(0.43, 0.14, 0.055, 0.13, 0.6, '#b4467a');
  beaker(0.56, 0.2, 0.04, 0.09, 0.45, '#e2b93b');
  beaker(0.32, 0.22, 0.035, 0.08, 0, null);
  const gradCyl = (x, z, h, fill, col) => {
    B.cyl(GALV, 0.035, 0.04, 0.012, [x, TOP, z], { base: true, seg: 6 });
    G.cyl(GLASS, 0.02, 0.02, h, [x, TOP + 0.012, z], { base: true, seg: 6, open: true });
    B.cyl(col, 0.017, 0.017, h * fill, [x, TOP + 0.014, z], { base: true, seg: 6 });
  };
  gradCyl(0.52, -0.12, 0.28, 0.7, '#9fd3c7');
  gradCyl(0.62, -0.06, 0.22, 0.35, '#e07a3f');
  // ── digital scale (front right) ──
  const sx = 0.76, sz = 0.13;
  B.box('#2b2c2e', [0.2, 0.045, 0.24], [sx, TOP, sz], { base: true });
  B.cyl(GALV, 0.075, 0.075, 0.01, [sx, TOP + 0.045, sz - 0.03], { base: true, seg: 10 });
  const dsp = [sx, TOP + 0.04, sz + 0.105], dn = [0, Math.sin(0.6), Math.cos(0.6)];
  B.box('#1b1c1d', [0.16, 0.05, 0.02], dsp, { rot: [-0.6, 0, 0] });
  L.add('scale', [dsp[0], dsp[1] + dn[1] * 0.0105, dsp[2] + dn[2] * 0.0105], 0.13, 0.04, { rotX: -0.6 });
  B.box('#efe6c9', [0.05, 0.004, 0.05], [sx + 0.01, TOP + 0.057, sz - 0.03], { rot: [0, 0.4, 0] });      // weighing paper
  // ── open notebook + pencil, wash bottle ──
  const nx = 0.0, nz = 0.17;
  B.box('#7a5a3a', [0.33, 0.012, 0.22], [nx, TOP, nz], { base: true, rot: [0, -0.12, 0] });
  L.at([nx, TOP + 0.0135, nz], -0.12, 0, (l) => l.add('notebook', [0, 0, 0], 0.32, 0.2, { rotX: -Math.PI / 2 }));
  B.box('#d9b13a', [0.15, 0.008, 0.008], [nx + 0.2, TOP + 0.006, nz + 0.05], { rot: [0, 0.7, 0] });
  B.lathe('#f2f1ea', [[0.035, 0], [0.035, 0.13], [0.012, 0.16], [0.001, 0.16]], 6, [-0.82, TOP, 0.12]);
  beam(B, '#f2f1ea', [-0.82, TOP + 0.16, 0.12], [-0.78, TOP + 0.2, 0.17], 0.008);
  return bake(g, B, G, L);
}

// ═════════════════════════════════════════════════════════════════════════════
// fume_hood — homemade: plywood base cabinet + plywood box with a raised glass sash, sheet-metal
// funnel on top, flexible foil duct (S-bend) up to an exhaust fan screwed to the wall above.
// 1.2 × 0.75 m footprint, 3.3 m tall incl. the fan. Back at z = −0.375.
// ═════════════════════════════════════════════════════════════════════════════
export function buildFumeHood() {
  const W = 1.2, D = 0.75, hw = W / 2, hd = D / 2;
  const g = root('fume_hood', 0, { w: W, h: 3.3, l: D });
  const B = new Kit(9201); B.floor = 0;
  const G = new Kit(9202);
  const L = new Labels();
  // base cabinet (two doors) + galvanised worktop
  B.box(PLY, [W, 0.82, D - 0.05], [0, 0.03, -0.02], { base: true });
  B.box('#2a2a2b', [W - 0.04, 0.03, D - 0.1], [0, 0, -0.02], { base: true });
  for (const s of [-1, 1]) {
    B.rectZ(PLY_D, hd - 0.045 + 0.001, [s > 0 ? 0.01 : -hw + 0.03, s > 0 ? hw - 0.03 : -0.01], [0.08, 0.8], 1, { off: 0.002 });
    B.box(STEEL_D, [0.015, 0.12, 0.02], [s * 0.06, 0.6, hd - 0.03]);
  }
  B.box(GALV, [W + 0.02, 0.03, D], [0, 0.85, 0], { base: true });
  // enclosure: plywood back, sides and top; front header strip; inner lining
  const Y0 = 0.88, Y1 = 1.82;
  B.box(PLY, [W, Y1 - Y0, 0.03], [0, Y0, -hd + 0.015], { base: true });
  for (const s of [-1, 1]) B.box(PLY, [0.03, Y1 - Y0, D - 0.04], [s * (hw - 0.015), Y0, -0.02], { base: true, taper: [1, 0.75], shear: [0, -0.08] });
  B.box(PLY, [W, 0.03, 0.58], [0, Y1 - 0.03, -hd + 0.29], { base: true });
  B.box(PLY_D, [W, 0.16, 0.03], [0, Y1 - 0.18, hd - 0.17], { base: true });
  L.add('hood', [0, Y1 - 0.1, hd - 0.153], 0.36, 0.13);
  B.rectZ('#d9d6cc', -hd + 0.031, [-hw + 0.03, hw - 0.03], [Y0, Y1 - 0.03], 1, { off: 0.001 });
  B.box('#f6f3e4', [W - 0.12, 0.03, 0.05], [0, Y1 - 0.06, -0.1]);                          // light strip
  // sash: aluminium frame in side rails + glass, raised so the bottom edge is at 1.3 m
  const SB = 1.3, ST = Y1 - 0.2, sz = hd - 0.2;
  for (const s of [-1, 1]) B.box('#9aa1a5', [0.025, Y1 - Y0 - 0.1, 0.03], [s * (hw - 0.045), Y0, sz - 0.03], { base: true });
  B.box('#9aa1a5', [W - 0.06, 0.04, 0.035], [0, SB, sz], { base: true });
  B.box('#9aa1a5', [W - 0.06, 0.03, 0.03], [0, ST - 0.03, sz], { base: true });
  B.box('#2a2a2b', [0.18, 0.02, 0.025], [0, SB + 0.01, sz + 0.03]);                          // pull handle
  G.rectZ('#c9dde2', sz, [-hw + 0.06, hw - 0.06], [SB + 0.04, ST - 0.03], 1, { off: 0 });
  L.add('hoodWarn', [0.36, SB + 0.17, sz + 0.004], 0.24, 0.09);
  // inside: burner + steel pot, beaker, a clamp lamp
  B.box('#2b2c2e', [0.26, 0.07, 0.26], [-0.18, 0.88, -0.1], { base: true });
  B.cyl('#b8392e', 0.07, 0.07, 0.01, [-0.18, 0.95, -0.1], { base: true, seg: 8 });
  B.cyl('#a9aca7', 0.12, 0.11, 0.16, [-0.18, 0.96, -0.1], { base: true, seg: 10, open: true });
  B.cyl('#7fd6c2', 0.115, 0.115, 0.01, [-0.18, 1.08, -0.1], { base: true, seg: 10 });
  B.box('#2a2a2b', [0.2, 0.02, 0.02], [-0.02, 1.1, -0.1]);
  G.lathe(GLASS, [[0.001, 0], [0.05, 0], [0.05, 0.12], [0.055, 0.128]], 8, [0.26, 0.88, -0.05]);
  B.cyl('#e2b93b', 0.045, 0.045, 0.05, [0.26, 0.885, -0.05], { base: true, seg: 8 });
  // sheet-metal funnel + collar
  const FY = Y1;
  B.frustum({ default: GALV, front: shade(GALV, 0.92), left: shade(GALV, 0.86), right: shade(GALV, 0.86) }, { y0: FY, y1: FY + 0.24, zb: [-hd + 0.03, hd - 0.36], zt: [-0.22, 0.02], wb: hw - 0.08, wt: 0.14 });
  B.cyl(shade(GALV, 0.85), 0.13, 0.13, 0.08, [0, FY + 0.24, -0.1], { base: true, seg: 10 });
  // flexible foil duct: S-bend from the collar up into the fan box bottom (ribbed: alternating bands)
  const P0 = new THREE.Vector3(0, FY + 0.32, -0.1), P3 = new THREE.Vector3(0.2, 2.86, -0.255);
  const C1 = new THREE.Vector3(0, FY + 0.7, -0.08), C2 = new THREE.Vector3(0.2, 2.45, -0.25);
  const bez = (t) => P0.clone().multiplyScalar((1 - t) ** 3).addScaledVector(C1, 3 * (1 - t) ** 2 * t).addScaledVector(C2, 3 * (1 - t) * t * t).addScaledVector(P3, t ** 3);
  const N = 14;
  for (let i = 0; i < N; i++) {
    const a = bez(i / N), b = bez((i + 1) / N);
    const d = b.clone().sub(a), l = d.length();
    const qq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), qq, new THREE.Vector3(1, 1, 1));
    B.geo(new THREE.CylinderGeometry(0.115, 0.115, l * 1.04, 8, 1, true), i % 2 ? '#c9ccc7' : '#a7aaa5', m);
  }
  // exhaust fan box on the wall: housing, round grille ring, 4 blades, hub, warning sticker
  const fy = 3.0, fz = -hd + 0.09;
  B.box('#8d9295', [0.5, 0.48, 0.18], [0.2, fy, fz]);
  B.box('#5d6367', [0.06, 0.06, 0.03], [0.2, 2.73, fz]);                                     // duct spigot
  B.cyl('#2a2b2d', 0.19, 0.19, 0.02, [0.2, fy, fz + 0.09], { axis: 'z', seg: 12 });
  for (let i = 0; i < 4; i++) B.box('#c9ccc7', [0.07, 0.17, 0.01], [0.2, fy, fz + 0.105], { rot: [0.25, 0, i * Math.PI / 2 + 0.3] });
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; B.box('#b7bcbe', [0.4, 0.012, 0.012], [0.2, fy, fz + 0.115], { rot: [0, 0, a] }); }
  B.cyl('#5d6367', 0.035, 0.035, 0.03, [0.2, fy, fz + 0.11], { axis: 'z', seg: 6 });
  L.add('fan', [0.2 + 0.19, fy - 0.17, fz + 0.091], 0.08, 0.08);
  // power cable from the fan down the wall to the cabinet
  rod(B, '#1d1d1e', [[0.44, fy - 0.24, fz - 0.06], [0.63, 2.3, -hd + 0.015], [0.63, 0.9, -hd + 0.015]], 0.01, 3);
  return bake(g, B, G, L);
}

// ═════════════════════════════════════════════════════════════════════════════
// chem_drums — v0: two blue plastic drums (one with a hand pump, one with a funnel);
//              v1: a stack of white jerrycans. Invented hazard-diamond labels on each.
// ═════════════════════════════════════════════════════════════════════════════
export function buildChemDrums(variant = 0) {
  return variant % 2 ? jerrycans() : blueDrums();
}
function blueDrums() {
  const g = root('chem_drums', 0, { w: 1.24, h: 1.2, l: 0.62 });
  const B = new Kit(9301); B.floor = 0;
  const L = new Labels();
  const r = 0.29, h = 0.9, BLUE = '#2f6db0';
  for (const [x, rot, lab] of [[-0.31, 0.15, 'drum0'], [0.31, -0.1, 'drum1']]) {
    // body: 10-sided lathe with two rolling hoops and a rim; a flat facet faces the front
    B.lathe((cx, cy) => (cy < 0.02 || cy > h - 0.03 ? shade(BLUE, 0.82) : BLUE), [[r * 0.9, 0], [r, 0.03], [r, h - 0.04], [r * 0.92, h], [0.001, h]], 10, [x, 0, 0], { rot: [0, Math.PI / 10, 0] });
    for (const y of [0.3, 0.6]) B.cyl(shade(BLUE, 0.85), r + 0.012, r + 0.012, 0.04, [x, y, 0], { seg: 10, open: true, rot: [0, Math.PI / 10, 0] });
    B.cyl('#e9e6dc', 0.035, 0.035, 0.025, [x - 0.12, h, -0.05], { base: true, seg: 6 });     // bungs
    B.cyl('#e9e6dc', 0.025, 0.025, 0.02, [x + 0.13, h, -0.08], { base: true, seg: 6 });
    L.at([x, 0, 0], rot * 0, 0, (l) => l.add(lab, [0, 0.47, r * 0.951 + 0.004], 0.17, 0.25));
  }
  // drum pump on the left drum: tube + head + handle + spout
  B.cyl(STEEL_D, 0.02, 0.02, 0.32, [-0.43, 0.9, -0.05], { base: true, seg: 5 });
  B.box('#c0392b', [0.08, 0.08, 0.08], [-0.43, 1.22, -0.05], { base: true });
  beam(B, '#2a2a2b', [-0.43, 1.3, -0.05], [-0.25, 1.36, -0.05], 0.025);
  beam(B, STEEL_D, [-0.43, 1.25, -0.01], [-0.43, 1.22, 0.14], 0.02);
  // funnel on the right drum
  B.lathe('#e2b93b', [[0.012, 0], [0.02, 0.05], [0.09, 0.14], [0.095, 0.15]], 8, [0.31 + 0.12, 0.9, -0.05], { rot: [0.12, 0, 0] });
  // drip stain on the floor
  B.blob('#1f3a5a', 0.16, [-0.25, 0.003, 0.28], { seg: 7, seed: 9303, wobble: 0.4, off: 0 });
  g.add(kmesh(B, 'body'));
  g.add(L.mesh('labels'));
  return g;
}
function jerrycans() {
  const g = root('chem_drums', 1, { w: 0.92, h: 1.05, l: 0.6 });
  const B = new Kit(9311); B.floor = 0;
  const L = new Labels();
  const WH = '#e9e6dc', w = 0.28, h = 0.4, d = 0.18;
  const can = (x, y, z, ry, lab, col = WH) => {
    B.at([x, y, z], [0, ry, 0], () => {
      B.box(col, [w, h, d], [0, 0, 0], { base: true, c: 0.025 });
      B.box(shade(col, 0.9), [w * 0.62, 0.05, 0.05], [-0.03, h + 0.025, 0], { c: 0.01 });     // handle bar
      for (const s of [-1, 1]) B.box(shade(col, 0.9), [0.03, 0.05, 0.05], [-0.03 + s * 0.07, h, 0], { base: true });
      B.cyl(lab === 'jerry1' ? '#b4467a' : lab === 'jerry2' ? '#2f6db0' : '#c0392b', 0.03, 0.03, 0.045, [0.095, h, 0], { base: true, seg: 6 });
      B.box(shade(col, 0.92), [w + 0.004, 0.012, d + 0.004], [0, h * 0.5, 0]);                 // moulding line
    });
    if (lab) L.at([x, y, z], ry, 0, (l) => l.add(lab, [0, h * 0.48, d / 2 + 0.003], 0.16, 0.16));
  };
  can(-0.3, 0, -0.1, 0.03, 'jerry0'); can(0, 0, -0.1, -0.02, 'jerry1'); can(0.3, 0, -0.1, 0.04, 'jerry0');
  can(-0.15, 0.43, -0.12, -0.06, 'jerry2'); can(0.16, 0.43, -0.11, 0.05, 'jerry0');
  can(0.24, 0, 0.17, -0.35, 'jerry2', '#dcd7c6');
  B.blob('#c9c3b2', 0.12, [-0.3, 0.003, 0.2], { seg: 7, seed: 9313, wobble: 0.4, off: 0 });
  g.add(kmesh(B, 'body'));
  g.add(L.mesh('labels'));
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// gas_cylinders — wall rack (back channel + two bars) holding three cylinders with chains,
// coloured shoulders and valve caps. 0.86 × 0.36 m, 1.5 m tall. Back at z = −0.18.
// ═════════════════════════════════════════════════════════════════════════════
export function buildGasCylinders() {
  const g = root('gas_cylinders', 0, { w: 0.86, h: 1.52, l: 0.36 });
  const B = new Kit(9401); B.floor = 0;
  const L = new Labels();
  const R0 = 0.115, H = 1.28, Z = 0.0;
  const cyls = [[-0.27, '#8e2f26', '#c0392b', 'gas0'], [0, '#2f5f8a', '#d9d6cc', 'gas1'], [0.27, '#4f7a4a', '#e2b93b', 'gas2']];
  // rack: back channel on the wall, two front bars on brackets, floor kick plate
  B.box(STEEL_D, [0.84, 0.9, 0.025], [0, 0.3, -0.168], { base: true });
  for (const y of [0.55, 1.05]) {
    B.box('#c9a33a', [0.86, 0.05, 0.03], [0, y, -0.13]);
    for (const x of [-0.42, 0.42]) B.box('#c9a33a', [0.03, 0.05, 0.06], [x, y, -0.15]);
  }
  B.box(STEEL_D, [0.86, 0.03, 0.34], [0, 0, 0], { base: true });
  for (const [x, body, cap, lab] of cyls) {
    // cylinder: foot ring, body, domed shoulder in the cap colour band, neck, valve cap
    B.cyl('#3a3b3d', R0 * 0.92, R0 * 0.92, 0.05, [x, 0.03, Z], { base: true, seg: 8, open: true });
    B.lathe((cx, cy) => (cy > H - 0.02 ? cap : body), [[R0, 0.06], [R0, H - 0.1], [R0 * 0.82, H - 0.02], [R0 * 0.42, H + 0.05], [0.04, H + 0.08]], 8, [x, 0, Z], { rot: [0, T8, 0] });
    B.lathe(shade(cap, 0.9), [[0.06, H + 0.06], [0.062, H + 0.15], [0.045, H + 0.2], [0.001, H + 0.205]], 8, [x, 0, Z]);
    B.box('#2a2a2b', [0.03, 0.02, 0.02], [x + 0.065, H + 0.12, Z]);
    L.add(lab, [x, 0.8, Z + R0 * Math.cos(T8) + 0.004], 0.085, 0.26);
    // chain around the front at each bar: 5 links alternating flat/edge
    for (const y of [0.55, 1.05]) {
      for (let i = 0; i < 6; i++) {
        const a0 = Math.PI * (i / 6), a1 = Math.PI * ((i + 1) / 6);
        const p0 = [x + Math.cos(a0) * (R0 + 0.012), y, Z + Math.sin(a0) * (R0 + 0.012) - 0.0];
        const p1 = [x + Math.cos(a1) * (R0 + 0.012), y, Z + Math.sin(a1) * (R0 + 0.012)];
        beam(B, '#6f7378', p0, p1, i % 2 ? 0.012 : 0.03, i % 2 ? 0.03 : 0.012);
      }
      for (const s of [-1, 1]) beam(B, '#6f7378', [x + s * (R0 + 0.012), y, Z], [x + s * (R0 + 0.03), y, -0.13], 0.012, 0.03);
    }
  }
  // a valve key hanging on the rack + a chalk tick tally
  B.box('#c9a33a', [0.02, 0.16, 0.02], [0.4, 1.2, -0.14]);
  B.box('#c9a33a', [0.08, 0.02, 0.02], [0.4, 1.12, -0.14]);
  g.add(kmesh(B, 'body'));
  g.add(L.mesh('labels'));
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// reagent_shelf — 0.9 × 0.42 m metal shelf, 1.85 m tall, five levels of labelled jars, amber
// bottles and tubs (lab.json names on the labels). Back at z = −0.21.
// ═════════════════════════════════════════════════════════════════════════════
export function buildReagentShelf() {
  const W = 0.9, D = 0.42, H = 1.85, hw = W / 2, hd = D / 2;
  const g = root('reagent_shelf', 0, { w: W, h: H, l: D });
  const B = new Kit(9501); B.floor = 0;
  const L = new Labels();
  const SH = '#6f7a70';
  for (const x of [-hw + 0.02, hw - 0.02]) for (const z of [-hd + 0.02, hd - 0.02]) B.box(SH, [0.035, H, 0.035], [x, 0, z], { base: true });
  const levels = [0.08, 0.48, 0.88, 1.28, 1.68];
  for (const y of levels) {
    B.box(shade(SH, 1.12), [W, 0.025, D], [0, y, 0], { base: true });
    B.box(SH, [W, 0.04, 0.012], [0, y - 0.015, hd - 0.006], { base: true });               // front lip
  }
  for (const s of [-1, 1]) beam(B, SH, [s * (hw - 0.02), 0.1, -hd + 0.02], [-s * (hw - 0.02), 1.66, -hd + 0.02], 0.012);   // back X-brace
  let li = 0;
  const lab = (x, y, z, w, h) => { L.add('jar' + (li++ % 18), [x, y, z], w, h); };
  // jar: two-tone lathe (contents low, tinted glass above) + lid
  const jar = (x, y, z, r, h, fill, col, lid) => {
    const glassTint = mix(GLASS, col, 0.18);
    B.lathe((cx, cy) => (cy - y < h * fill ? col : glassTint), [[r, 0], [r, h * fill], [r, h], [0.001, h]], 8, [x, y, z], { rot: [0, T8, 0] });
    B.lathe(lid, [[r * 1.04, h], [r * 1.04, h + 0.03], [0.001, h + 0.03]], 8, [x, y, z], { rot: [0, T8, 0] });
    lab(x, y + h * 0.5, z + r * Math.cos(T8) + 0.003, r * 1.5, Math.min(h * 0.5, r * 0.8));
  };
  // amber bottle: body, shoulder, neck, cap (one lathe, colour by height)
  const bottle = (x, y, z, r, h, cap = '#2a2a2b', col = '#7a4a1e') => {
    B.lathe((cx, cy) => (cy - y > h * 0.86 ? cap : col), [[r, 0], [r, h * 0.62], [r * 0.42, h * 0.78], [r * 0.38, h], [0.001, h]], 6, [x, y, z], { rot: [0, Math.PI / 6, 0] });
    lab(x, y + h * 0.34, z + r * Math.cos(Math.PI / 6) + 0.003, r * 1.6, h * 0.3);
  };
  // L0 (floor): two tubs
  for (const [x, col] of [[-0.21, '#e8e1cf'], [0.21, '#9fd3c7']]) {
    B.lathe((cx, cy) => (cy > 0.28 ? '#2f6db0' : '#e9e6dc'), [[0.15, 0.105], [0.16, 0.3], [0.165, 0.33], [0.001, 0.33]], 8, [x, 0, 0.02], { rot: [0, T8, 0] });
    lab(x, 0.22, 0.02 + 0.155 * Math.cos(T8) + 0.004, 0.2, 0.1); void col;
  }
  // L1: big jars
  const y1 = levels[1] + 0.025;
  [[-0.32, '#e8e1cf', 0.8], [-0.12, '#9fd3c7', 0.55], [0.08, '#b4467a', 0.7], [0.28, '#c46b3c', 0.4]].forEach(([x, col, f], i) => jar(x, y1, 0.02 + (i % 2) * 0.03, 0.075, 0.22, f, col, ['#2a2a2b', '#c0392b', '#e9e6dc', '#2f6db0'][i]));
  // L2: amber bottles + a small jar
  const y2 = levels[2] + 0.025;
  [-0.34, -0.2, -0.06].forEach((x, i) => bottle(x, y2, 0.05 - i * 0.02, 0.05, 0.26 - i * 0.02));
  jar(0.12, y2, 0.04, 0.06, 0.16, 0.6, '#7fd6c2', '#2a2a2b');
  bottle(0.3, y2, 0.0, 0.045, 0.22, '#c0392b', '#3f5a6a');
  // L3: small jars in a row
  const y3 = levels[3] + 0.025;
  [[-0.33, '#e2b93b'], [-0.17, '#5c9f5a'], [-0.01, '#cfe9f5'], [0.15, '#b4467a'], [0.31, '#d9a83a']].forEach(([x, col], i) => jar(x, y3, 0.04 - (i % 2) * 0.04, 0.055, 0.15, 0.3 + (i % 3) * 0.2, col, i % 2 ? '#e9e6dc' : '#2a2a2b'));
  // L4 (top): carton, a jug, rolled paper
  const y4 = levels[4] + 0.025;
  B.box('#c9b98e', [0.32, 0.14, 0.26], [-0.22, y4, 0], { base: true, noBottom: true, rot: [0, 0.08, 0] });
  B.lathe((cx, cy) => (cy - y4 > 0.13 ? '#c0392b' : '#e9e6dc'), [[0.08, 0], [0.08, 0.12], [0.03, 0.14], [0.03, 0.16], [0.001, 0.16]], 6, [0.18, y4, 0.02]);
  lab(0.18, y4 + 0.06, 0.02 + 0.08 * Math.cos(Math.PI / 6) + 0.004, 0.11, 0.06);
  B.cyl('#efe9dc', 0.03, 0.03, 0.3, [0.02, y4 + 0.03, -0.05], { axis: 'x', seg: 5, rot: [0, 0.3, 0] });
  g.add(kmesh(B, 'body'));
  g.add(L.mesh('labels'));
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// recipe_whiteboard — mobile whiteboard (1.44 × 0.96 board) on two uprights with T-feet and
// casters, marker tray with markers + eraser. Drawing: hexagon doodles, arrows, a crossed-out
// list and "BATCH #1" (game-flavour only). Footprint 1.62 × 0.56 m.
// ═════════════════════════════════════════════════════════════════════════════
export function buildRecipeWhiteboard() {
  const g = root('recipe_whiteboard', 0, { w: 1.62, h: 1.86, l: 0.56 });
  const B = new Kit(9601); B.floor = 0;
  const L = new Labels();
  const AL = '#b8bdbf', BW = 1.44, BH = 0.96, BY = 0.84;
  for (const s of [-1, 1]) {
    const x = s * 0.78;
    B.box(AL, [0.045, BY + BH + 0.05, 0.045], [x, 0.08, 0], { base: true });
    B.box(STEEL_D, [0.05, 0.04, 0.52], [x, 0.06, 0], { base: true });
    for (const z of [-0.23, 0.23]) { B.cyl('#2a2a2b', 0.035, 0.035, 0.03, [x, 0.035, z], { axis: 'x', seg: 6 }); B.box(STEEL_D, [0.04, 0.03, 0.04], [x, 0.06, z], { base: true }); }
    B.box('#2a2a2b', [0.02, 0.05, 0.05], [x - s * 0.03, BY + BH / 2, 0]);                    // pivot knob
  }
  B.box('#e9ebe7', [BW, BH, 0.025], [0, BY, -0.003], { base: true });
  B.box(AL, [BW + 0.04, 0.03, 0.04], [0, BY + BH, 0], { base: true });
  B.box(AL, [BW + 0.04, 0.03, 0.04], [0, BY - 0.03, 0], { base: true });
  for (const s of [-1, 1]) B.box(AL, [0.025, BH, 0.04], [s * (BW / 2 + 0.008), BY, 0], { base: true });
  // tray + markers + eraser
  B.box(AL, [BW * 0.7, 0.02, 0.08], [0, BY - 0.05, 0.05], { base: true });
  B.box(AL, [BW * 0.7, 0.03, 0.01], [0, BY - 0.04, 0.09], { base: true });
  for (const [x, c] of [[-0.3, '#2c4f9a'], [-0.24, '#c0392b'], [-0.17, '#1f2a33'], [0.05, '#2f8a4a']]) { B.box('#e9e6dc', [0.12, 0.018, 0.018], [x, BY - 0.02, 0.05], { rot: [0, 0.1, 0] }); B.box(c, [0.03, 0.02, 0.02], [x + 0.06, BY - 0.02, 0.05], { rot: [0, 0.1, 0] }); }
  B.box('#2a2a2b', [0.12, 0.035, 0.05], [0.25, BY - 0.035, 0.05], { base: true });
  B.box('#d9d6cc', [0.12, 0.012, 0.05], [0.25, BY - 0.035, 0.05], { base: true });
  L.add('wb', [0, BY + BH / 2, 0.0115], BW - 0.02, BH - 0.02);
  // a sticky note + a magnet photo
  B.box('#f2e36a', [0.1, 0.1, 0.004], [0.62, BY + BH - 0.12, 0.012]);
  B.box('#cfc6ae', [0.13, 0.1, 0.004], [-0.6, BY + 0.14, 0.012], { rot: [0, 0, 0.08] });
  B.box('#7aa0b4', [0.11, 0.06, 0.004], [-0.6, BY + 0.15, 0.015], { rot: [0, 0, 0.08] });
  g.add(kmesh(B, 'body'));
  g.add(L.mesh('labels'));
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// element_poster — original periodic-table-style poster (1.2 × 0.8 m, taped to a backing board),
// Co (27) and Ru (44) tiles highlighted green and circled in red marker. Origin at the BOTTOM
// centre (asset rule: sits on y = 0); hang it with position.y = userData.mountY.
// ═════════════════════════════════════════════════════════════════════════════
export function buildElementPoster() {
  const g = root('element_poster', 0, { w: 1.24, h: 0.84, l: 0.03 });
  const B = new Kit(9701);
  const L = new Labels();
  B.box('#bfae8a', [1.24, 0.84, 0.012], [0, 0, -0.009], { base: true });
  for (const [x, y] of [[-0.58, 0.8], [0.58, 0.8], [-0.58, 0.04], [0.58, 0.04]]) B.cyl('#c0392b', 0.012, 0.012, 0.012, [x, y, 0.004], { axis: 'z', seg: 5 });
  L.add('poster', [0, 0.42, -0.002], 1.2, 0.8);
  g.add(kmesh(B, 'body', undefined, false, true));
  g.add(L.mesh('labels'));
  g.userData.mountY = 1.95;
  g.userData.note = 'Wall poster: origin at the bottom centre of the board. Hang with position.y = mountY (≈ 1.95) and its back against the wall plane.';
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// safety_station — green backboard on the wall: green-cross sign, first-aid box, eyewash bottle
// station + sign, fire extinguisher on a bracket; red sand bucket with scoop on the floor.
// 0.86 m wide, 0.36 m deep (bucket), 2.2 m tall. Back at z = −0.18.
// ═════════════════════════════════════════════════════════════════════════════
export function buildSafetyStation() {
  const g = root('safety_station', 0, { w: 0.86, h: 2.2, l: 0.36 });
  const B = new Kit(9801); B.floor = 0;
  const L = new Labels();
  const bz = -0.18 + 0.012, front = bz + 0.012;
  B.box('#3d6b4e', [0.84, 1.62, 0.024], [0, 0.56, bz], { base: true });
  B.box('#e9e6dc', [0.84, 0.03, 0.03], [0, 2.17, bz + 0.004], { base: true });
  L.add('cross', [0, 1.94, front + 0.002], 0.34, 0.34);
  // first-aid box (green, white cross face) — upper left
  B.box('#2f8a4a', [0.3, 0.24, 0.11], [-0.2, 1.42, front + 0.055], { c: 0.012 });
  L.add('aidbox', [-0.2, 1.42, front + 0.112], 0.13, 0.13);
  B.box('#e9e6dc', [0.06, 0.02, 0.02], [-0.2, 1.56, front + 0.08]);
  // eyewash station (upper right): sign, wall bracket, two bottles with green caps
  L.add('eyewash', [0.2, 1.66, front + 0.002], 0.3, 0.15);
  B.box('#e9e6dc', [0.3, 0.07, 0.12], [0.2, 1.17, front + 0.06]);
  B.box('#e9e6dc', [0.3, 0.3, 0.02], [0.2, 1.17, front + 0.01], { base: true });
  for (const x of [0.13, 0.27]) {
    B.lathe((cx, cy) => (cy > 1.5 ? '#2f8a4a' : '#dfe8ec'), [[0.05, 1.2], [0.05, 1.42], [0.03, 1.47], [0.02, 1.5], [0.012, 1.55], [0.001, 1.55]], 6, [x, 0, front + 0.065]);
  }
  // fire extinguisher on a bracket (lower left)
  const ex = -0.2, ez = front + 0.09;
  B.box(STEEL_D, [0.12, 0.05, 0.05], [ex, 0.92, front + 0.03]);
  B.lathe((cx, cy) => (cy > 1.0 ? '#2a2a2b' : cy < 0.55 ? '#8e2f26' : '#c0392b'), [[0.07, 0.52], [0.075, 0.55], [0.075, 0.94], [0.05, 1.0], [0.025, 1.02], [0.025, 1.06], [0.001, 1.06]], 8, [ex, 0, ez]);
  B.box('#2a2a2b', [0.14, 0.02, 0.03], [ex + 0.03, 1.08, ez], { rot: [0, 0, -0.15] });
  rod(B, '#1d1d1e', [[ex + 0.02, 1.03, ez + 0.02], [ex + 0.1, 0.98, ez + 0.06], [ex + 0.1, 0.7, ez + 0.07], [ex + 0.06, 0.62, ez + 0.06]], 0.012, 3);
  B.box('#e9e6dc', [0.07, 0.09, 0.004], [ex, 0.76, ez + 0.075]);
  // sand bucket + scoop on the floor (lower right)
  const sx = 0.2, sz = 0.02;
  B.lathe('#c0392b', [[0.12, 0], [0.15, 0.3], [0.155, 0.31]], 10, [sx, 0, sz]);
  B.cyl('#c0392b', 0.12, 0.12, 0.01, [sx, 0, sz], { base: true, seg: 10 });
  B.cyl('#d8b47c', 0.145, 0.145, 0.01, [sx, 0.27, sz], { base: true, seg: 10 });
  B.torus('#5d6367', 0.15, 0.006, [sx, 0.33, sz], { rs: 3, ts: 8, arc: Math.PI, rot: [0, 0, 0] });
  beam(B, '#8a6a4a', [sx + 0.05, 0.29, sz - 0.03], [sx + 0.13, 0.42, sz - 0.08], 0.02);
  B.box('#9aa1a5', [0.08, 0.02, 0.1], [sx + 0.03, 0.285, sz], { rot: [0, 0.4, 0] });
  L.at([sx, 0, sz], 0, 0, (l) => l.add('sand', [0, 0.17, 0.137], 0.16, 0.08, { rotX: -0.1 }));
  g.add(kmesh(B, 'body'));
  g.add(L.mesh('labels'));
  return g;
}
