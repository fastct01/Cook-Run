// ─────────────────────────────────────────────────────────────────────────────
// Round 3 (agent R3-START) — yards, vehicles and clutter around Rook's Garage.
//   tow_yard (2)        chain-link lot: 0 ROOK'S TOW YARD (impound office, junk cars, tyres) · 1 scrap yard
//   tow_truck           Rook's wrecker: boom, wheel-lift, light bar, door signs (parked prop)
//   dumpster_alley (2)  dumpsters, crates, pallets, bags against a screen wall · 1 recycling cage
//   scrub_patch (3)     cracked concrete with weeds / scrub bushes / rubble (flat-ish filler)
// Fronts face local +Z; origin = ground centre.
// ─────────────────────────────────────────────────────────────────────────────
import {
  THREE, Kit, root, rng, PAL, mix, shade, C, vwrap, beam, rod, drum, crate, pallet, acUnit,
  addPanel, plateSign, signTexture, fitText, FONTS, addLit, fitSize, tyre, tyreStack, junkCar, linkRun, linkMesh, S,
} from './r3-start-kit.js';

const PI = Math.PI;

// ═════════════════════════════════════════════════════════════════════════════
// Tow yard / scrap yard
// ═════════════════════════════════════════════════════════════════════════════
function container(k, x, z, rotY, color, L = 6.1) {
  k.at([x, 0, z], [0, rotY, 0], () => {
    k.box(color, [2.44, 2.6, L], [0, 0, 0], { base: true });
    for (let i = -L / 2 + 0.3; i < L / 2 - 0.2; i += 0.32) for (const s of [-1, 1]) k.rectX(shade(color, 0.85), s * 1.22, [i, i + 0.12], [0.15, 2.45], s, { off: 0.008 });
    k.rectZ(shade(color, 0.8), L / 2, [-1.15, 1.15], [0.1, 2.5], 1, { off: 0.01 });
    k.rectZ('#3a3b3d', L / 2, [-0.03, 0.03], [0.1, 2.5], 1, { off: 0.02 });
    k.rectX(C.rust, 1.22, [-L / 2 + 0.6, -L / 2 + 1.8], [0.2, 1.1], 1, { off: 0.012 });
  });
}
function cabin(k, lk, x, z, rotY) {
  lk.at([x, 0, z], [0, rotY, 0], () => {
    lk.rectZ('#fff', 1.4, [-2.4, -0.6], [1.4, 2.4], 1, { off: 0.02 });
    lk.rectZ('#fff', 1.4, [1.6, 2.6], [1.4, 2.4], 1, { off: 0.02 });
  });
  k.at([x, 0, z], [0, rotY, 0], () => {
    k.box('#d9d0bc', [6.0, 2.6, 2.8], [0, 0.35, 0], { base: true });
    k.box('#5f6468', [6.2, 0.35, 3.0], [0, 0, 0], { base: true });
    k.box('#c9c0a8', [6.3, 0.15, 3.1], [0, 2.95, 0], { base: true });
    for (let x2 = -2.8; x2 < 3; x2 += 0.5) k.rectZ(shade('#d9d0bc', 0.9), 1.41, [x2, x2 + 0.06], [0.4, 2.9], 1, { off: 0.008 });
    k.rectZ('#5f7f72', 1.4, [0.0, 1.0], [0.4, 2.6], 1, { off: 0.02 });
    for (let i = 0; i < 3; i++) k.box('#7a7f83', [1.3, 0.12, 0.35], [0.5, 0.1 + i * 0.12, 1.6 + (2 - i) * 0.3], { base: true });
    acUnit(k, 3.15, 1.0, 0.0, 0.7, PI / 2);
  });
}
function floodPole(k, lk, x, z, h, rotY) {
  k.cyl('#6f7478', 0.1, 0.14, h, [x, 0, z], { base: true, seg: 6 });
  k.at([x, h, z], [0, rotY, 0], () => k.box('#3a3b3d', [0.6, 0.4, 0.35], [0, -0.1, 0.25], { rot: [0.5, 0, 0] }));
  lk.at([x, h, z], [0, rotY, 0], () => lk.box('#fff', [0.5, 0.04, 0.28], [0, -0.3, 0.38], { rot: [0.5, 0, 0] }));
}
const CAR_COLS = ['#6f8fb0', '#b85c6a', '#d6c08a', '#7e9b6e', '#c96f4a', '#8a8f99', '#9c4a32', '#d9d4c4'];
export function buildTowYard(variant = 0) {
  const v = vwrap(variant, 2);
  const W = v ? 24 : 28, D = v ? 20 : 22;
  const g = root('tow_yard', v, { w: W, h: 9, l: D }, { style: v ? 'scrap' : 'impound' });
  const k = new Kit(6000 + v); k.floor = 0;
  const lk = new Kit(6010 + v);
  const quads = [];
  const r = rng(6020 + v);
  k.box(S.gravel, [W, 0.05, D], [0, 0, 0], { base: true });
  for (let i = 0; i < 7; i++) k.blob(r() < 0.5 ? S.gravelDark : '#5f5a52', 0.8 + r() * 1.6, [(r() - 0.5) * W * 0.8, 0.055, (r() - 0.5) * D * 0.8], { seg: 7, seed: 6030 + i, off: 0.002 });
  const hx = W / 2 - 0.3, hz = D / 2 - 0.3;
  const gate0 = v ? 6 : 5, gate1 = v ? 12 : 11;                    // gap along the front run (measured from +X)
  linkRun(k, quads, [[-hx, hz], [-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]], 2.1, { barbed: true, gaps: [[3, gate0, gate1]] });
  // gate leaf: open (slid behind the fence) on the impound, closed on the scrap yard
  const gx0 = hx - gate0, gx1 = hx - gate1;
  if (v === 0) {
    linkRun(k, quads, [[gx1 - 0.2, hz - 0.45], [gx1 - 0.2 - (gate1 - gate0), hz - 0.45]], 2.0, { step: 2.0 });
    k.box('#a3a6a1', [gate1 - gate0, 0.07, 0.07], [gx1 - 0.2 - (gate1 - gate0) / 2, 1.0, hz - 0.45]);
  } else {
    linkRun(k, quads, [[gx0, hz + 0.25], [gx1, hz + 0.25]], 2.0, { step: 2.0 });
    k.box('#a3a6a1', [gate1 - gate0, 0.07, 0.07], [(gx0 + gx1) / 2, 1.0, hz + 0.25]);
  }
  for (const xx of [gx0, gx1]) k.cyl('#7f878b', 0.09, 0.09, 2.7, [xx, 0, hz], { base: true, seg: 6 });
  if (v === 0) {
    cabin(k, lk, -W / 2 + 4.0, D / 2 - 3.3, 0);
    // junk cars along the back + a stacked pair + two by the side
    junkCar(k, -9.0, 0, -7.4, 0.08, CAR_COLS[0], 6101, { hood: true });
    junkCar(k, -4.0, 0, -7.6, -0.05, CAR_COLS[1], 6102, { stripped: true });
    junkCar(k, -4.0, 0.95, -7.5, 0.12, CAR_COLS[2], 6103, { flat: true, stripped: true });
    junkCar(k, 1.2, 0, -7.2, 0.04, CAR_COLS[3], 6104, {});
    junkCar(k, 6.4, 0, -7.5, -0.1, CAR_COLS[5], 6105, { missing: 0.6 });
    junkCar(k, 10.4, 0, -1.0, PI / 2 + 0.06, CAR_COLS[4], 6106, { hood: true });
    junkCar(k, 4.6, 0, 1.8, PI / 2 - 0.12, CAR_COLS[6], 6107, {});
    container(k, -11.6, -2.5, 0, '#4f6b6b');
    for (const [x, z, n] of [[-7.0, 2.6, 5], [-6.2, 3.3, 3], [-7.4, 3.6, 4], [8.6, 6.8, 6], [9.4, 7.4, 4]]) tyreStack(k, x, z, n);
    for (let i = 0; i < 3; i++) tyre(k, -5.4 + i * 0.55, 0, 4.4 + (i % 2) * 0.1, 0.36, 0.22, { axis: 'x', rot: [0, 0.2 * (i - 1), 0] });
    pallet(k, 1.0, 0, 6.0, 0.2); k.box('#5f6468', [0.8, 0.6, 0.6], [1.0, 0.15, 6.0], { base: true });
    pallet(k, -1.0, 0, 6.6, -0.4); drum(k, -1.0, 6.6, '#9c4a32', 0.15);
    floodPole(k, lk, W / 2 - 1.2, -D / 2 + 1.2, 7.5, -PI * 0.75);
    floodPole(k, lk, -W / 2 + 1.2, -D / 2 + 1.2, 7.5, PI * 0.75);
  } else {
    // scrap: stacks of crushed cars, scrap pile, tyre mountain
    for (let i = 0; i < 3; i++) junkCar(k, -7.5, i * 0.62, -6.0, 0.05 * (i - 1), CAR_COLS[(i + 2) % 8], 6201 + i, { flat: true, stripped: true });
    for (let i = 0; i < 2; i++) junkCar(k, -2.6, i * 0.62, -6.3, 0.06 * i, CAR_COLS[(i + 5) % 8], 6211 + i, { flat: true, stripped: true });
    junkCar(k, 3.0, 0, -6.0, 0.15, CAR_COLS[0], 6221, { hood: true });
    junkCar(k, 7.2, 0, 1.0, PI / 2, CAR_COLS[7], 6222, { missing: 0.7 });
    for (let i = 0; i < 6; i++) k.ico(i % 2 ? C.rust : '#7f878b', 0.9 + r() * 0.7, [-5 + r() * 4, 0.3, 1.5 + r() * 3], { jitter: 0.35, seed: 6230 + i, scale: [1.4, 0.7, 1.2], flatBottom: -0.4 });
    for (const [x, z, n] of [[6.5, -5.0, 6], [7.3, -5.6, 5], [6.8, -6.4, 4], [-9.5, 5.8, 3]]) tyreStack(k, x, z, n);
    container(k, 9.6, 3.5, 0, '#9c4a32');
    floodPole(k, lk, -W / 2 + 1.2, D / 2 - 1.2, 7.5, PI * 0.25);
  }
  g.add(k.mesh('body'));
  addLit(g, lk, v ? 'bulb' : 'warm');
  linkMesh(g, quads);
  if (v === 0) {
    const s = plateSign('r3s_towyard', "ROOK'S TOW YARD", 'IMPOUND · 24 HR · NO TRESPASSING', { bg: '#d9a83a', fg: '#2a2622', border: '#2a2622', w: 640, h: 220 });
    addPanel(g, s, 3.6, 1.24, [-6.5, 1.25, hz + 0.08], 0);
    const roof = plateSign('r3s_towyard_office', 'OFFICE', 'PAY HERE · CASH ONLY', { bg: '#e9e2cf', fg: '#9c3a2e', border: '#2a2622', w: 384, h: 160 });
    addPanel(g, roof, 2.2, 0.92, [-W / 2 + 4.0, 3.55, D / 2 - 3.3 + 1.2], 0);
    const dog = plateSign('r3s_dog', 'BEWARE OF DOG', null, { bg: '#e9e2cf', fg: '#b23a2c', w: 384, h: 128, px: 64 });
    addPanel(g, dog, 1.0, 0.33, [gx0 + 0.8, 1.5, hz + 0.08], 0);
  } else {
    const s = plateSign('r3s_scrap', 'SCRAP METAL', 'WE BUY JUNK CARS · CASH', { bg: '#e9e2cf', fg: '#2a2622', border: '#9c3a2e', w: 640, h: 220 });
    addPanel(g, s, 3.6, 1.24, [-5.0, 1.25, hz + 0.08], 0);
  }
  g.userData.collider = { note: 'fence = closed polyline around the lot (local ±W/2, ±D/2); front gate gap on the impound' };
  return fitSize(g);
}

// ═════════════════════════════════════════════════════════════════════════════
// Tow truck (parked)
// ═════════════════════════════════════════════════════════════════════════════
export function buildTowTruck() {
  const g = root('tow_truck', 0, { w: 2.5, h: 3.9, l: 8.4 });
  const k = new Kit(6300);
  const lk = new Kit(6301);
  const paint = '#d9a83a', trim = PAL.trim, Wb = 2.3;
  // chassis + wheels (front axle + rear tandem)
  for (const s of [-1, 1]) k.box('#2a2a2a', [0.14, 0.28, 7.8], [s * 0.5, 0.6, -0.3]);
  for (const z of [2.65, -1.75, -2.95]) for (const s of [-1, 1]) {
    k.cyl(PAL.tyre, 0.52, 0.52, 0.36, [s * 0.98, 0.52, z], { axis: 'x', seg: 10 });
    k.cyl(PAL.rim, 0.26, 0.26, 0.38, [s * 0.98, 0.52, z], { axis: 'x', seg: 6 });
  }
  // hood, fenders, grille, bumper, cab
  k.box(paint, [1.9, 0.95, 1.35], [0, 0.95, 3.35], { base: true, c: 0.08 });
  for (const s of [-1, 1]) k.box(shade(paint, 0.9), [0.4, 0.5, 1.5], [s * 0.98, 0.9, 2.75], { base: true, c: 0.06 });
  k.rectZ('#2c2d2f', 4.03, [-0.75, 0.75], [1.05, 1.8], 1, { off: 0.01 });
  for (let x = -0.6; x <= 0.61; x += 0.2) k.rectZ('#5f6468', 4.03, [x - 0.03, x + 0.03], [1.08, 1.77], 1, { off: 0.02 });
  k.box(PAL.chrome, [2.3, 0.28, 0.25], [0, 0.6, 4.1], { base: true });
  k.box(paint, [Wb, 1.95, 1.75], [0, 0.95, 1.85], { base: true, c: 0.08 });
  k.box(shade(paint, 0.85), [Wb + 0.02, 0.12, 1.77], [0, 1.85, 1.85], { base: true });
  k.rectZ(PAL.glass, 2.735, [-1.0, 1.0], [2.0, 2.75], 1, { off: 0.01 });
  for (const s of [-1, 1]) {
    k.rectX(PAL.glass, s * Wb / 2, [1.4, 2.5], [2.0, 2.72], s, { off: 0.01 });
    k.box('#2a2a2a', [0.08, 0.45, 0.25], [s * 1.35, 2.2, 2.7]);
    k.rectX(trim, s * Wb / 2, [1.0, 2.7], [0.95, 1.08], s, { off: 0.012 });
  }
  // light bar (amber), headlights, tail + work lights
  k.box('#2a2a2a', [1.8, 0.1, 0.3], [0, 2.92, 1.85], { base: true });
  lk.box('#fff', [1.6, 0.16, 0.24], [0, 3.02, 1.85], { base: true });
  // wrecker body: toolboxes, deck, boom, hydraulic ram, cable + hook, wheel-lift
  for (const s of [-1, 1]) {
    k.box(paint, [0.6, 1.05, 4.0], [s * 0.88, 0.8, -1.3], { base: true, c: 0.05 });
    for (const z of [-2.6, -1.3, 0.0]) k.rectX(shade(paint, 0.82), s * 1.18, [z - 0.55, z + 0.55], [0.95, 1.7], s, { off: 0.01 });
    k.rectX(trim, s * 1.18, [-3.3, 0.7], [0.82, 0.92], s, { off: 0.012 });
  }
  k.box('#5f6468', [1.2, 0.12, 4.0], [0, 0.85, -1.3], { base: true });
  k.box('#3a3b3d', [0.7, 0.9, 0.7], [0, 0.95, 0.35], { base: true });
  beam(k, shade(paint, 0.9), [0, 1.75, 0.35], [0, 3.55, -3.0], [0.36, 0.42]);
  beam(k, PAL.chrome, [0, 1.1, -0.4], [0, 2.55, -1.6], 0.12);
  k.box('#3a3b3d', [0.3, 0.3, 0.3], [0, 3.55, -3.1]);
  rod(k, '#2a2a2a', [0, 3.45, -3.15], [0, 1.6, -3.3], 0.02, 3);
  k.torus('#3a3b3d', 0.14, 0.04, [0, 1.42, -3.3], { rot: [0, PI / 2, 0], rs: 3, ts: 6, arc: PI * 1.4 });
  k.box('#3a3b3d', [0.3, 0.22, 1.4], [0, 0.42, -3.85]);
  k.box(paint, [1.9, 0.18, 0.28], [0, 0.42, -4.6]);
  for (const s of [-1, 1]) k.box('#3a3b3d', [0.18, 0.18, 0.5], [s * 0.85, 0.42, -4.35]);
  for (const s of [-1, 1]) { lk.box('#fff', [0.2, 0.2, 0.06], [s * 0.88, 1.65, -3.32]); }
  g.add(k.mesh('body'));
  addLit(g, lk, 'amber');
  const hk = new Kit(6302);
  for (const s of [-1, 1]) hk.box('#fff', [0.3, 0.2, 0.06], [s * 0.72, 1.4, 4.04]);
  addLit(g, hk, 'bulb', 'headlights');
  const door = plateSign('r3s_tow_door', "ROOK'S", 'TOWING · 24 HR', { bg: paint, fg: '#2a2622', border: false, w: 256, h: 160 });
  addPanel(g, door, 1.1, 0.69, [Wb / 2 + 0.012, 1.45, 1.75], PI / 2);
  addPanel(g, door, 1.1, 0.69, [-Wb / 2 - 0.012, 1.45, 1.75], -PI / 2);
  g.userData.collider = { r: 1.25, half: 3.8, note: 'capsule along local Z' };
  return fitSize(g);
}

// ═════════════════════════════════════════════════════════════════════════════
// Dumpster alley
// ═════════════════════════════════════════════════════════════════════════════
function dumpster(k, x, z, rotY, color, open = false) {
  k.at([x, 0, z], [0, rotY, 0], () => {
    k.frustum((cx, cy, cz, nx, ny) => (ny > 0.5 ? shade(color, 0.85) : color), { y0: 0.18, y1: 1.3, zb: [-0.55, 0.5], zt: [-0.62, 0.66], wb: 0.95, wt: 0.97 });
    k.rectZ(mix(color, C.rust, 0.5), 0.55, [-0.9, -0.3], [0.25, 0.6], 1, { off: 0.02 });
    for (const s of [-1, 1]) k.box(shade(color, 0.8), [0.12, 0.25, 0.9], [s * 1.03, 0.9, 0]);
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) k.box('#2a2a2a', [0.14, 0.18, 0.14], [sx * 0.8, 0, sz * 0.4], { base: true });
    if (open) {
      k.box('#2f3133', [0.95, 0.05, 1.3], [-0.48, 1.32, 0.02], { base: true, rot: [0, 0, 0.04] });
      k.box('#2f3133', [0.95, 0.05, 1.25], [0.48, 1.65, -0.85], { base: true, rot: [-1.15, 0, 0] });
      k.box('#2a2b2d', [1.6, 0.25, 1.0], [0, 1.15, 0], { base: true });
      k.ico('#1f2022', 0.32, [0.4, 1.4, 0.1], { jitter: 0.25, seed: 41 });
    } else {
      k.box('#2f3133', [1.9, 0.06, 1.33], [0, 1.31, 0.02], { base: true, rot: [0.05, 0, 0] });
    }
  });
}
function bag(k, x, z, s = 1, seed = 1) { k.ico('#24262a', 0.34 * s, [x, 0.26 * s, z], { jitter: 0.25, seed, scale: [1, 0.8, 1], flatBottom: -0.3 * s }); k.box('#24262a', [0.08, 0.14, 0.08], [x, 0.52 * s, z]); }
export function buildDumpsterAlley(variant = 0) {
  const v = vwrap(variant, 2);
  const g = root('dumpster_alley', v, { w: 7.6, h: 2.3, l: 3.6 });
  const k = new Kit(6400 + v); k.floor = 0;
  const r = rng(6410 + v);
  // screen wall at the back (cinder block, painted)
  k.box((cx, cy, cz, nx, ny) => (ny > 0.5 ? '#8f8a80' : '#b9ad92'), [7.6, 2.2, 0.25], [0, 0, -1.6], { base: true });
  for (let y = 0.4; y < 2.2; y += 0.4) k.rectZ(shade('#b9ad92', 0.9), -1.475, [-3.8, 3.8], [y, y + 0.03], 1, { off: 0.006 });
  k.rectZ(mix('#b9ad92', S.dirt, 0.45), -1.475, [-3.8, 3.8], [0, 0.5], 1, { off: 0.008 });
  k.box(S.slabDark, [7.6, 0.04, 3.4], [0, 0, 0.1], { base: true });
  k.blob('#4f4c47', 0.9, [-0.6, 0.05, 0.6], { seg: 7, seed: 6420 + v, off: 0.002 });
  if (v === 0) {
    dumpster(k, -2.3, -0.75, 0.05, '#4f6b4a', true);
    dumpster(k, 0.0, -0.8, -0.04, '#3e5a7a', false);
    crate(k, 2.4, 0, -1.0, 1, '#a8865e', 0.1); crate(k, 2.5, 0.8, -1.05, 0.9, '#b49a74', -0.15); crate(k, 3.2, 0, -0.3, 0.8, '#8f7350', 0.5);
    pallet(k, 2.0, 0, 0.6, 0.3); pallet(k, 2.0, 0.15, 0.6, 0.25); pallet(k, 2.05, 0.3, 0.62, 0.35);
    k.at([-3.55, 0, -1.2], [-0.15, 0, 0], () => { pallet(k, 0, 0.6, 0, PI / 2); });
    for (let i = 0; i < 5; i++) bag(k, -1.4 + r() * 2.2, 0.15 + r() * 0.5, 0.8 + r() * 0.4, 6430 + i);
    for (let i = 0; i < 3; i++) k.box('#b08a5c', [0.5 + r() * 0.3, 0.35 + r() * 0.2, 0.5], [-3.2 + i * 0.4, 0, 0.6 + r() * 0.4], { base: true, rot: [0, r(), 0] });
  } else {
    dumpster(k, -2.2, -0.8, 0.0, '#9c4a32', false);
    // recycling cage: frame + bars + cardboard bales
    const cx = 1.6, cz = -0.75;
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) k.box('#5d6367', [0.08, 2.0, 0.08], [cx + sx * 1.2, 0, cz + sz * 0.7], { base: true });
    for (const y of [0.05, 1.0, 1.98]) for (const sz of [-1, 1]) k.box('#5d6367', [2.4, 0.05, 0.05], [cx, y, cz + sz * 0.7]);
    for (let i = 0; i < 9; i++) k.box('#7f878b', [0.03, 1.95, 0.03], [cx - 1.05 + i * 0.26, 0.03, cz + 0.7], { base: true });
    for (let i = 0; i < 4; i++) k.box(i % 2 ? '#b08a5c' : '#a07d52', [1.0, 0.45, 1.0], [cx - 0.55 + (i % 2) * 1.1, 0.05 + Math.floor(i / 2) * 0.47, cz], { base: true, rot: [0, (r() - 0.5) * 0.2, 0] });
    drum(k, -0.2, 0.4, '#3e5a7a'); drum(k, 0.45, 0.6, '#5f6468'); drum(k, 0.1, 1.1, '#9c4a32', 0, { lying: 'x' });
    tyreStack(k, -3.3, 0.4, 3);
    k.at([3.55, 0, 0.6], [0, 0, -0.25], () => { k.at([0, 0, 0], [0, PI / 2, 1.3], () => pallet(k, 0, 0, 0, 0)); });
    for (let i = 0; i < 3; i++) bag(k, -0.9 + i * 0.5, 0.95 + r() * 0.3, 0.9, 6440 + i);
  }
  g.add(k.mesh('body'));
  return fitSize(g);
}

// ═════════════════════════════════════════════════════════════════════════════
// Scrub patch — cracked concrete / dirt with weeds, scrub bushes, rubble (≤ 1 m tall)
// ═════════════════════════════════════════════════════════════════════════════
function blade(k, x, z, h, lean, yaw, col) {
  const dx = Math.sin(yaw) * lean, dz = Math.cos(yaw) * lean, px = Math.cos(yaw) * 0.07, pz = -Math.sin(yaw) * 0.07;
  const a = [x - px, 0.02, z - pz], b = [x + px, 0.02, z + pz], t = [x + dx, h, z + dz];
  k.poly(col, [a, b, t]); k.poly(col, [b, a, t]);
}
function tuft(k, x, z, s, r, dry) {
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) blade(k, x + (r() - 0.5) * 0.2, z + (r() - 0.5) * 0.2, (0.35 + r() * 0.5) * s, 0.15 + r() * 0.25, r() * PI * 2, dry || r() < 0.3 ? mix(S.weedDry, S.weed, r() * 0.4) : mix(S.weed, S.bushDark, r() * 0.4));
}
function crack(k, pts, w = 0.05, y = 0.045) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], l = Math.hypot(bx - ax, bz - az) || 1;
    const nx = -(bz - az) / l * w, nz = (bx - ax) / l * w;
    k.poly(S.crack, [[ax - nx, y, az - nz], [bx - nx, y, bz - nz], [bx + nx, y, bz + nz], [ax + nx, y, az + nz]], { facing: [0, 1, 0] });
  }
}
export function buildScrubPatch(variant = 0) {
  const v = vwrap(variant, 3);
  const g = root('scrub_patch', v, { w: 7, h: 1, l: 6 });
  const k = new Kit(6500 + v); k.floor = 0;
  const r = rng(6510 + v * 7);
  const RX = [3.2, 4.2, 3.4][v], RZ = [2.6, 3.2, 2.8][v];
  const outline = [];
  for (let i = 0; i < 11; i++) { const a = (i / 11) * PI * 2; const f = 0.78 + r() * 0.3; outline.push([Math.cos(a) * RX * f, -Math.sin(a) * RZ * f]); }
  if (v < 2) {
    k.top(v ? S.slabDark : S.slab, 0.03, outline, { off: 0 });
    for (let i = 0; i < 6; i++) {
      const a0 = r() * PI * 2, rr = 0.4 + r() * 0.6, pts = [[Math.cos(a0) * rr, Math.sin(a0) * rr]];
      for (let j = 0; j < 3; j++) { const p = pts[pts.length - 1], a = a0 + (r() - 0.5) * 1.2; pts.push([p[0] + Math.cos(a) * (0.6 + r() * 0.7), p[1] + Math.sin(a) * (0.6 + r() * 0.7)]); }
      crack(k, pts.map(([x, z]) => [Math.max(-RX * 0.8, Math.min(RX * 0.8, x)), Math.max(-RZ * 0.8, Math.min(RZ * 0.8, z))]), 0.04 + r() * 0.03);
    }
    for (let i = 0; i < 2 + v; i++) k.box(S.slab, [0.9 + r() * 0.8, 0.12, 0.7 + r() * 0.6], [(r() - 0.5) * RX, 0.0, (r() - 0.5) * RZ], { base: true, rot: [(r() - 0.5) * 0.3, r() * 3, (r() - 0.5) * 0.3] });
  } else {
    k.top(S.dirt, 0.025, outline, { off: 0 });
    k.blob(S.dirtDark, 1.4, [0.6, 0.035, -0.4], { seg: 8, seed: 6530, off: 0, sx: 1.4 });
    tyre(k, -1.4, -0.05, 0.8, 0.38, 0.2, { axis: 'x', rot: [0, 0.6, 0.35] });
  }
  for (let i = 0; i < [11, 14, 8][v]; i++) { const a = r() * PI * 2, d = Math.sqrt(r()); tuft(k, Math.cos(a) * RX * 0.85 * d, Math.sin(a) * RZ * 0.85 * d, 0.8 + r() * 0.6, r, v === 2 && r() < 0.6); }
  const nb = [2, 3, 4][v];
  for (let i = 0; i < nb; i++) {
    const a = r() * PI * 2, d = 0.3 + r() * 0.55, s = 0.45 + r() * 0.35;
    k.ico(r() < 0.5 ? S.bush : S.bushDark, s, [Math.cos(a) * RX * d, s * 0.45, Math.sin(a) * RZ * d], { jitter: 0.3, seed: 6540 + i + v * 10, scale: [1.2, 0.75, 1.1], flatBottom: -s * 0.55 });
  }
  for (let i = 0; i < 4; i++) k.ico(r() < 0.5 ? '#8d8679' : '#a39b8f', 0.12 + r() * 0.18, [(r() - 0.5) * RX * 1.4, 0.06, (r() - 0.5) * RZ * 1.4], { jitter: 0.3, seed: 6550 + i + v * 10, flatBottom: -0.05 });
  if (v === 1) { pallet(k, 1.6, 0.0, -1.0, 0.7, '#9a8466'); k.box('#9a8466', [1.2, 0.04, 0.12], [1.2, 0.2, -0.3], { rot: [0, 1.1, 0.15] }); }
  g.add(k.mesh('body'));
  return fitSize(g);
}

export const BUILDERS = {
  tow_yard: { build: (v) => buildTowYard(v), variants: 2 },
  tow_truck: { build: () => buildTowTruck(), variants: 1 },
  dumpster_alley: { build: (v) => buildDumpsterAlley(v), variants: 2 },
  scrub_patch: { build: (v) => buildScrubPatch(v), variants: 3 },
};
