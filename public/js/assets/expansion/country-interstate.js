// Country pack · B. Interstate 9: overpass, sound_wall, gantry_sign, toll_plaza, jersey_barrier, rest_stop.
import * as THREE from 'three';
import { root } from '../models/kit.js';
import { walls, wr, band, hipRoof, gableRoof } from '../models/scenery.js';
import { Kit, rng, PAL, mix, shade, vmod, pivot, signMesh, textTex, drawTex, fitText, beam, rod, railing, bush, parkedCar, picnicTable, bin } from './country-common.js';

const CON = '#b3ada1', CON_D = '#8c877d', CON_L = '#c9c4b8', ASPH = '#4a4b4f';

/** New-Jersey barrier profile [z, y] (0.61 wide, 0.81 tall). */
const JERSEY = [[-0.305, 0], [0.305, 0], [0.305, 0.075], [0.19, 0.33], [0.075, 0.81], [-0.075, 0.81], [-0.19, 0.33], [-0.305, 0.075]];
function jerseyRun(k, x0, x1, z, y = 0, color = CON, rotY = 0) {
  k.at([0, y, z], [0, rotY, 0], () => k.extrude(color, JERSEY, x1 - x0, { axis: 'x', pos: [(x0 + x1) / 2, 0, 0] }));
}
/** Steel W-beam guard rail along X on posts. */
function guardRail(k, x0, x1, z, y = 0, side = 1) {
  const n = Math.max(1, Math.round((x1 - x0) / 2));
  for (let i = 0; i <= n; i++) k.box('#7a7d80', [0.12, 0.75, 0.12], [x0 + (i / n) * (x1 - x0), y, z - side * 0.08], { base: true });
  k.box('#a9adb0', [x1 - x0, 0.3, 0.05], [(x0 + x1) / 2, y + 0.55, z]);
  k.box('#8c9093', [x1 - x0, 0.06, 0.07], [(x0 + x1) / 2, y + 0.55, z]);
}

// ── 5. overpass (v0 centre pier in the median, v1 single clear span) ────────────
export function buildOverpass(variant = 0) {
  const v = vmod(variant, 2);
  const k = new Kit(3500 + v); k.floor = 0;
  const r = rng(3510 + v);
  const half = 17, deckY = 7.0, gird = 1.5, dw = 12, ramp = 18, abut = 4;
  const end = half + abut + ramp;
  // girders + deck slab + asphalt
  k.box(CON, [2 * (half + abut) + 0.4, 0.45, dw], [0, deckY - 0.45, 0], { base: true });
  k.box(ASPH, [2 * (half + abut) + 0.4, 0.06, dw - 1.4], [0, deckY, 0], { base: true });
  const girderC = v ? '#5f7466' : CON_D;
  for (const z of [-4.5, -1.5, 1.5, 4.5]) {
    k.box(girderC, [2 * half + 1.0, gird, 0.5], [0, deckY - 0.45 - gird, z], { base: true });
    k.box(shade(girderC, 1.08), [2 * half + 1.0, 0.12, 0.9], [0, deckY - 0.45 - gird, z], { base: true });
  }
  // fascia beams on both faces with rust/water stains
  for (const s of [1, -1]) {
    k.box(CON_L, [2 * (half + abut) + 0.4, 1.0, 0.3], [0, deckY - 1.0, s * (dw / 2 + 0.1)], { base: true });
    for (let i = 0; i < 9; i++) { const x = -half - 2 + i * 4.6 + r() * 2; k.rectZ(shade(CON_D, 0.85), s * (dw / 2 + 0.25), [x, x + 0.3 + r() * 0.5], [deckY - 1.0, deckY - 0.4 - r() * 0.3], s, { off: 0.004 }); }
    // parapet (jersey) + rail + chain-link fence over the freeway
    jerseyRun(k, -(half + abut), half + abut, s * (dw / 2 - 0.3), deckY);
    k.box('#7a7d80', [2 * (half + abut), 0.08, 0.08], [0, deckY + 1.1, s * (dw / 2 - 0.3)]);
    for (let i = 0; i <= 14; i++) k.box('#6f7275', [0.07, 2.2, 0.07], [-half + i * (2 * half / 14), deckY + 0.8, s * (dw / 2 - 0.22)], { base: true });
    k.box(mix('#8a8f92', '#2f3a42', 0.15), [2 * half, 1.9, 0.03], [0, deckY + 0.85, s * (dw / 2 - 0.2)], { base: true });
    k.box('#6f7275', [2 * half, 0.07, 0.09], [0, deckY + 3.0, s * (dw / 2 - 0.22)]);
  }
  // lane lines on the deck
  for (let i = -6; i <= 6; i++) k.rectY('#e9e4cf', deckY + 0.06, [i * 3 - 0.9, i * 3 + 0.9], [-0.06, 0.06], { off: 0.004 });
  for (const s of [1, -1]) k.rectY('#e9e4cf', deckY + 0.06, [-(half + abut), half + abut], [s * 4.6 - 0.06, s * 4.6 + 0.06], { off: 0.004 });
  // abutments with slope paving down to the freeway shoulders
  for (const sx of [1, -1]) {
    k.box(CON, [abut, deckY - 0.45, dw + 1.2], [sx * (half + abut / 2), 0, 0], { base: true });
    for (let i = 0; i < 7; i++) k.rectX(shade(CON, 0.93), sx * half, [-dw / 2 + i * 2, -dw / 2 + i * 2 + 0.06], [0, deckY - 0.5], -sx, { off: 0.01 });
    // slope paving (cobble-coloured wedge)
    k.extrude((cx, cy, cz, nx, ny) => (ny > 0.3 ? '#a59d8c' : CON_D), [[0, 0], [sx * -4.2, 0], [0, 3.6]].map(([x, y]) => [x, y]), dw + 1.2, { axis: 'z', pos: [sx * half, 0, 0] });
    // wing walls
    for (const sz of [1, -1]) k.box(CON_L, [abut + 2, deckY + 0.6, 0.5], [sx * (half + abut / 2 + 1), 0, sz * (dw / 2 + 0.85)], { base: true });
    // approach ramp: road on an embankment, sloping down to the ground
    const x0 = sx * (half + abut), x1 = sx * end;
    k.extrude((cx, cy, cz, nx, ny) => (ny > 0.95 ? ASPH : ny > 0.2 ? mix('#7f9a58', '#a8a070', 0.4) : '#6a5a46'),
      [[x0, 0], [x1, 0], [x0, deckY]].map(([x, y]) => [x, y]), dw - 1.0, { axis: 'z' });
    for (const sz of [1, -1]) {
      // grassy side slopes of the embankment
      const zz = sz * (dw / 2 - 0.5), zo = sz * (dw / 2 + 4.5);
      k.poly(mix('#7f9a58', '#a8a070', 0.35), [[x0, 0, zo], [x1, 0, zo], [x1, 0, zz], [x0, deckY, zz]], { facing: [0, 1, sz], jit: 0.05 });
      // guard rail following the ramp slope
      const zr = sz * (dw / 2 - 0.55);
      for (let i = 0; i <= 9; i++) { const t = i / 9; k.box('#7a7d80', [0.12, 0.75, 0.12], [x0 + (x1 - x0) * t, deckY * (1 - t), zr - sz * 0.08], { base: true }); }
      beam(k, '#a9adb0', [x0, deckY + 0.55, zr], [x1, 0.55, zr], 0.3, { tz: 0.05 });
    }
  }
  if (!v) {
    // centre pier in the median: footing, 3 columns, cap beam, median barrier stub
    k.box(CON_D, [3.0, 0.4, dw - 1], [0, 0, 0], { base: true });
    for (const z of [-4, 0, 4]) k.cyl(CON, 0.55, 0.6, deckY - 0.45 - gird - 1.0, [0, 0.4, z], { base: true, seg: 9 });
    k.box(CON, [1.6, 1.0, dw - 0.6], [0, deckY - 0.45 - gird - 1.0, 0], { base: true, c: 0.08 });
    for (const z of [-2.2, 2.2]) k.rectX('#7a5a3a', 0.81, [z - 0.3, z + 0.1], [deckY - 2.95, deckY - 2.2], 1, { off: 0.01 });
    jerseyRun(k, -10, 10, 0, 0, CON, Math.PI / 2);
  } else {
    // steel girders painted green get stiffener ribs
    for (const z of [-4.5, -1.5, 1.5, 4.5]) for (let i = -8; i <= 8; i++) k.box(shade(girderC, 0.85), [0.06, gird, 0.6], [i * 2, deckY - 0.45 - gird, z], { base: true });
  }
  // deck light poles
  for (const sx of [-1, 1]) {
    k.cyl('#7a7f83', 0.08, 0.1, 6, [sx * 8, deckY + 0.81, dw / 2 - 0.3], { base: true, seg: 6 });
    k.box('#8a8f92', [0.25, 0.15, 1.4], [sx * 8, deckY + 6.7, dw / 2 - 1.0]);
    k.box(PAL.lampWarm, [0.2, 0.03, 0.5], [sx * 8, deckY + 6.62, dw / 2 - 1.4]);
  }
  const g = root('overpass', v, { w: 2 * end, h: deckY + 7.6, l: dw + 9 });
  g.add(k.mesh('body'));
  g.userData.style = v ? 'clear span' : 'centre pier';
  g.userData.clearance = +(deckY - 0.45 - gird).toFixed(2);
  return g;
}

// ── 6. sound_wall (20 m along X, panels face +Z) ─────────────────────────────────
export function buildSoundWall() {
  const k = new Kit(3601); k.floor = 0;
  const r = rng(3602);
  const L = 20, H = 5.0, t = 0.25;
  k.box(CON_D, [L, 0.5, 0.9], [0, 0, 0], { base: true });
  const panelC = ['#bdb5a4', '#b5ad9b', '#c3bcab', '#b0a896', '#bab3a2'];
  for (let i = 0; i < 5; i++) {
    const x0 = -L / 2 + i * 4, xc = x0 + 2;
    const c = panelC[i];
    k.box(c, [3.8, H - 0.5, t], [xc, 0.5, 0], { base: true });
    // ashlar relief: courses of offset blocks on the road face
    for (let row = 0; row < 6; row++) {
      const y0 = 0.6 + row * 0.72, off = row % 2 ? 0.6 : 0;
      k.rectZ(shade(c, 0.86), t / 2, [xc - 1.9, xc + 1.9], [y0 - 0.03, y0], 1, { off: 0.006 });
      for (let x = xc - 1.9 + off + 1.2; x < xc + 1.9; x += 1.2) k.rectZ(shade(c, 0.86), t / 2, [x - 0.03, x], [y0, y0 + 0.72], 1, { off: 0.006 });
    }
    // grime and water streaks
    k.rectZ(mix(c, PAL.dirt, 0.35), t / 2, [xc - 1.9, xc + 1.9], [0.5, 1.0], 1, { off: 0.01 });
    for (let j = 0; j < 2; j++) { const x = xc - 1.6 + r() * 3.2; k.rectZ(shade(c, 0.8), t / 2, [x, x + 0.15 + r() * 0.2], [H - 1.8 - r(), H - 0.2], 1, { off: 0.012 }); }
  }
  // H-posts + cap
  for (let i = 0; i <= 5; i++) {
    const x = -L / 2 + i * 4;
    k.box('#8f8a80', [0.4, H + 0.2, 0.45], [x, 0, 0], { base: true });
    k.box('#7a7570', [0.5, 0.15, 0.55], [x, H + 0.2, 0], { base: true });
  }
  k.box('#a39d92', [L, 0.18, 0.38], [0, H, 0], { base: true });
  // ivy creeping up one end + weeds at the foot
  for (let i = 0; i < 7; i++) k.ico(i % 2 ? '#56703f' : '#4a6338', 0.5 + r() * 0.4, [-L / 2 + 0.4 + r() * 3.0, 0.4 + i * 0.55, 0.22], { jitter: 0.25, seed: 3610 + i, scale: [1.3, 1, 0.35] });
  for (let i = 0; i < 10; i++) k.ico(mix(PAL.bush, '#a8a070', r() * 0.6), 0.3, [-L / 2 + r() * L, 0.15, 0.6], { seed: 3620 + i, jitter: 0.2, scale: [1.4, 0.8, 1] });
  const g = root('sound_wall', 0, { w: L + 0.5, h: H + 0.35, l: 1.2 });
  g.add(k.mesh('body'));
  return g;
}

// ── 7. gantry_sign (spans X ≈ 36 m; signs face +Z) ───────────────────────────────
export function buildGantrySign() {
  const k = new Kit(3701); k.floor = 0;
  const half = 18, y0 = 6.6, y1 = 8.2, depth = 1.2, steel = '#8f9496';
  // truss columns on footings
  for (const sx of [1, -1]) {
    const x = sx * half;
    k.box(CON, [1.6, 0.6, 2.4], [x, 0, 0], { base: true, c: 0.05 });
    for (const dz of [-0.5, 0.5]) for (const dx of [-0.35, 0.35]) k.box(steel, [0.14, y1 + 0.3, 0.14], [x + dx, 0.6, dz], { base: true });
    for (let y = 1.4; y < y1; y += 1.3) {
      beam(k, steel, [x - 0.35, y, -0.5], [x - 0.35, y + 1.3, 0.5], 0.07);
      beam(k, steel, [x + 0.35, y, 0.5], [x + 0.35, y + 1.3, -0.5], 0.07);
      k.box(steel, [0.8, 0.07, 0.07], [x, y, 0.5]); k.box(steel, [0.8, 0.07, 0.07], [x, y, -0.5]);
    }
    k.box('#ffd400', [0.5, 1.4, 0.1], [x, 0.6, 1.0], { base: true }); // reflective post marker
    k.box('#1f2022', [0.5, 0.25, 0.11], [x, 1.0, 1.0], { base: true });
  }
  // box truss: 4 chords + diagonals on front/back faces
  for (const y of [y0, y1]) for (const z of [-depth / 2, depth / 2]) k.box(steel, [2 * half + 1, 0.14, 0.14], [0, y, z]);
  for (let i = 0; i < 18; i++) {
    const xa = -half + i * 2, xb = xa + 2;
    for (const z of [-depth / 2, depth / 2]) beam(k, steel, [xa, y0, z], [xb, y1, z], 0.06);
    beam(k, steel, [xa, y1, -depth / 2], [xb, y1, depth / 2], 0.05);
    k.box(steel, [0.06, y1 - y0, 0.06], [xa, y0, depth / 2], { base: true });
  }
  // catwalk + rail in front of the signs
  k.box('#6f7275', [24, 0.06, 0.9], [-1.5, y0 - 0.9, 1.25]);
  railing(k, '#7a7d80', -13.5, 10.5, 1.68, y0 - 0.9, 0.9, 2.0, { t: 0.04, mid: true });
  for (let i = 0; i < 7; i++) beam(k, steel, [-13 + i * 4, y0 - 0.9, 0.8], [-13 + i * 4, y0, depth / 2], 0.06);
  // sign backs (aluminium) + sign lights
  const S1 = { x: -6.5, w: 11.5, h: 4.2 }, S2 = { x: 7.0, w: 8.5, h: 4.2 };
  for (const s of [S1, S2]) {
    k.box('#9a9d9f', [s.w, s.h, 0.12], [s.x, y0 + 0.6, 0.95], { base: true });
    for (let x = s.x - s.w / 2 + 1; x < s.x + s.w / 2; x += 2.5) {
      beam(k, '#5f6468', [x, y0 - 0.85, 1.25], [x, y0 - 0.55, 1.6], 0.05);
      k.box('#3a3b3d', [0.5, 0.2, 0.3], [x, y0 - 0.55, 1.7]);
    }
  }
  const g = root('gantry_sign', 0, { w: 2 * half + 2, h: y0 + 0.6 + 4.2 + 0.3, l: 2.6 });
  g.add(k.mesh('body'));
  const shield = (ctx, cx, cy, s) => {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
    ctx.beginPath(); ctx.moveTo(-50, -48); ctx.quadraticCurveTo(0, -62, 50, -48); ctx.lineTo(50, 0); ctx.quadraticCurveTo(48, 40, 0, 60); ctx.quadraticCurveTo(-48, 40, -50, 0); ctx.closePath();
    ctx.fillStyle = '#f1f0ea'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-42, -40); ctx.quadraticCurveTo(0, -52, 42, -40); ctx.lineTo(42, -18); ctx.lineTo(-42, -18); ctx.closePath(); ctx.fillStyle = '#a8322a'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-42, -14); ctx.lineTo(42, -14); ctx.lineTo(42, 0); ctx.quadraticCurveTo(40, 34, 0, 51); ctx.quadraticCurveTo(-40, 34, -42, 0); ctx.closePath(); ctx.fillStyle = '#21407a'; ctx.fill();
    ctx.fillStyle = '#f1f0ea'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 16px Arial, sans-serif'; ctx.fillText('INTERSTATE', 0, -29);
    ctx.font = '900 54px Arial, sans-serif'; ctx.fillText('9', 0, 18);
    ctx.restore();
  };
  const tex = drawTex('gantry', 2048, 430, '#1f5a3e', (ctx, W, H) => {
    // left half: I-9 WEST / DESERT CITIES (11.5 × 4.2 → 1152 × 420 of the 1024-wide half, scaled)
    const pane = (x0, w) => { ctx.strokeStyle = '#efefe8'; ctx.lineWidth = 10; ctx.beginPath(); ctx.roundRect(x0 + 14, 14, w - 28, H - 28, 26); ctx.stroke(); };
    pane(0, 1178); pane(1178, 870);
    shield(ctx, 200, 128, 1.35);
    ctx.fillStyle = '#efefe8'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    fitText(ctx, 'WEST', 310, 128, 520, 110, '700', 'Arial, Helvetica, sans-serif');
    ctx.textAlign = 'center';
    fitText(ctx, 'DESERT CITIES', 589, 278, 1000, 112, '700', 'Arial, Helvetica, sans-serif');
    // two down arrows (lane assignment)
    for (const ax of [360, 820]) { ctx.beginPath(); ctx.moveTo(ax - 12, 338); ctx.lineTo(ax + 12, 338); ctx.lineTo(ax + 12, 362); ctx.lineTo(ax + 34, 362); ctx.lineTo(ax, 402); ctx.lineTo(ax - 34, 362); ctx.lineTo(ax - 12, 362); ctx.closePath(); ctx.fill(); }
    // right part: EXIT 42 tab + SALT FLATS + 1/2 MILE
    const x0 = 1178;
    ctx.fillStyle = '#efefe8'; ctx.beginPath(); ctx.roundRect(x0 + 500, 34, 330, 100, 14); ctx.fill();
    ctx.fillStyle = '#1f5a3e'; fitText(ctx, 'EXIT 42', x0 + 665, 86, 300, 80, '700', 'Arial, Helvetica, sans-serif');
    ctx.fillStyle = '#efefe8';
    fitText(ctx, 'SALT FLATS', x0 + 435, 228, 780, 124, '700', 'Arial, Helvetica, sans-serif');
    fitText(ctx, '1/2 MILE', x0 + 435, 350, 600, 84, '700', 'Arial, Helvetica, sans-serif');
  });
  g.add(signMesh(tex, [
    { w: S1.w, h: S1.h, pos: [S1.x, y0 + 0.6 + S1.h / 2, 1.02], rect: [0, 0, 1178 / 2048, 1] },
    { w: S2.w, h: S2.h, pos: [S2.x, y0 + 0.6 + S2.h / 2, 1.02], rect: [1178 / 2048, 0, 1, 1] },
  ], '#1f5a3e'));
  return g;
}

// ── 8. toll_plaza (4 booths, canopy, barrier arms arm_0…arm_3) ───────────────────
export function buildTollPlaza() {
  const k = new Kit(3801); k.floor = 0;
  const lanes = [-7.5, -2.5, 2.5, 7.5], islands = [-10, -5, 0, 5, 10];
  const D = 14, ch = 5.6;
  // pavement + lane markings
  k.box('#56575b', [26, 0.03, D + 8], [0, 0, 0], { base: true });
  for (const x of lanes) for (let z = -D / 2 - 3; z < D / 2 + 3; z += 3) k.rectY('#e9e4cf', 0.035, [x + 2.35, x + 2.45], [z, z + 1.6], { off: 0.002 });
  for (const x of lanes) k.rectY('#e9e4cf', 0.035, [x - 1.6, x + 1.6], [-D / 2 - 0.6, -D / 2 - 0.3], { off: 0.002 });
  // islands with bumpers; booths on the four islands at x = −5…10 (driver's left when travelling −Z)
  for (const x of islands) {
    k.box(CON_L, [1.8, 0.2, 10], [x, 0, 0], { base: true, c: 0.05 });
    k.box('#e2b93b', [1.0, 1.0, 0.8], [x, 0, 5.2], { base: true, c: 0.2 });
    for (let i = 0; i < 3; i++) k.box('#1f2022', [1.02, 0.12, 0.82], [x, 0.18 + i * 0.3, 5.2], { base: true });
    if (x !== -10) {
      k.box('#e6e1d4', [1.5, 2.6, 2.6], [x, 0.2, 0.5], { base: true, c: 0.05 });
      const Bw = walls(1.5, 2.6, x, 0.5);
      for (const f of [Bw.left, Bw.right]) wr(k, f, [-0.4, 1.4], [1.2, 2.4], '#36424a', 0.02);
      wr(k, Bw.front, [x - 0.55, x + 0.55], [1.2, 2.4], '#36424a', 0.02);
      wr(k, Bw.right, [-0.9, -0.2], [0.2, 2.2], '#4f6b8a', 0.025);
      k.box('#3f6f8a', [1.7, 0.25, 2.8], [x, 2.8, 0.5], { base: true });
      k.box('#5f6468', [0.3, 0.9, 0.3], [x - 0.7, 0.2, -1.6], { base: true }); // arm mechanism
      k.box('#3a3b3d', [0.35, 0.35, 0.2], [x - 0.7, 1.2, 2.2], { base: true }); // card reader
    }
    // canopy columns
    k.box(CON_L, [0.5, ch, 0.5], [x, 0.2, -3.5], { base: true }); k.box(CON_L, [0.5, ch, 0.5], [x, 0.2, 3.8], { base: true });
  }
  // canopy: roof slab + deep fascia + lane signals above each lane
  k.box('#d8d3c6', [25, 0.4, D - 2], [0, ch + 0.2, 0], { base: true });
  k.box('#3f6f8a', [25.4, 1.4, 0.4], [0, ch, D / 2 - 1], { base: true, c: 0.05 });
  k.box('#3f6f8a', [25.4, 1.4, 0.4], [0, ch, -D / 2 + 1], { base: true, c: 0.05 });
  for (const s of [1, -1]) k.box('#3f6f8a', [0.4, 1.4, D - 2], [s * 12.7, ch, 0], { base: true });
  k.rectY('#f6efd4', ch + 0.19, [-9, 9], [-1, 1], { off: -0.004, facing: [0, -1, 0] });
  lanes.forEach((x, i) => {
    k.box('#1f2022', [1.0, 0.6, 0.2], [x, ch - 0.7, D / 2 - 1.0], { base: true });
    if (i === 1) { k.box('#c4372b', [0.5, 0.08, 0.04], [x, ch - 0.4, D / 2 - 0.88], { rot: [0, 0, 0.7] }); k.box('#c4372b', [0.5, 0.08, 0.04], [x, ch - 0.4, D / 2 - 0.88], { rot: [0, 0, -0.7] }); }
    else k.cone('#3fbf6a', 0.18, 0.4, [x, ch - 0.42, D / 2 - 0.88], { seg: 3, rot: [0, 0, Math.PI] });
  });
  const g = root('toll_plaza', 0, { w: 26, h: ch + 0.8, l: D + 8 });
  g.add(k.mesh('body'));
  // arms: pivot on the booth island (+X side of the lane), extending along local −X across the lane.
  // rotation.z = 0 → down/closed, −1.45 → raised (same convention as crossing_gate).
  lanes.forEach((x, i) => {
    pivot(g, 'arm_' + i, [x + 2.0, 1.05, -1.6], (ka) => {
      const L = 3.5;
      ka.box('#efece4', [L, 0.1, 0.07], [-L / 2 - 0.15, 0, 0]);
      for (let j = 0; j < 7; j += 2) ka.box('#c4372b', [L / 7, 0.105, 0.075], [-0.15 - (j + 0.5) * L / 7, 0, 0]);
      ka.box('#2a2a2b', [0.3, 0.2, 0.2], [0.05, 0, 0]);
    }, { seed: 3810 + i });
  });
  const tex = drawTex('toll', 1024, 128, '#3f6f8a', (ctx, W, H) => {
    ctx.fillStyle = '#efe6cf'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    fitText(ctx, 'I-9 TOLL PLAZA', W * 0.33, H * 0.52, W * 0.5, 84);
    ctx.fillStyle = '#e2b93b'; fitText(ctx, 'CASH · TAG · EXACT CHANGE', W * 0.76, H * 0.52, W * 0.4, 46, '700');
  });
  g.add(signMesh(tex, [{ w: 14, h: 1.1, pos: [0, ch + 0.7, D / 2 - 0.79] }], '#3f6f8a'));
  g.userData.arm = { axis: 'z', down: 0, up: -1.45, note: 'arm_N extends along local −X across lane N; rotation.z = 0 down, −1.45 up' };
  g.userData.lanes = lanes;
  return g;
}

// ── 9. jersey_barrier (6 m along X) ──────────────────────────────────────────────
export function buildJerseyBarrier() {
  const k = new Kit(3901); k.floor = 0;
  const r = rng(3902);
  k.extrude((cx, cy, cz, nx, ny) => (ny > 0.9 ? CON_L : Math.abs(nx) > 0.9 ? CON_D : cy < 0.2 ? mix(CON, PAL.dirt, 0.3) : CON), JERSEY, 5.96, { axis: 'x', jit: 0.03 });
  for (const s of [1, -1]) {
    for (const x of [-1.8, 1.8]) k.rectZ('#3a3a38', s * 0.305, [x - 0.25, x + 0.25], [0.0, 0.07], s, { off: 0.004 });
    for (let i = 0; i < 3; i++) { const x = -2.6 + r() * 5.2; k.poly(shade(CON, 0.78), [[x, 0.36, s * 0.18], [x + 0.6 + r(), 0.4, s * 0.17], [x + 0.5 + r(), 0.5, s * 0.15], [x + 0.1, 0.47, s * 0.155]], { facing: [0, 0.25, s], off: 0.006 }); }
  }
  for (const x of [-2.2, 0, 2.2]) k.box(x === 0 ? '#e9e4cf' : '#e2a33b', [0.1, 0.06, 0.12], [x, 0.81, 0], { base: true });
  const g = root('jersey_barrier', 0, { w: 6, h: 0.87, l: 0.61 });
  g.add(k.mesh('body'));
  return g;
}

// ── 10. rest_stop (restrooms, picnic shelter, vending machines) ─────────────────
export function buildRestStop() {
  const k = new Kit(4001); k.floor = 0;
  const r = rng(4002);
  const W = 34, D = 20;
  // lot: car park (front) + walkways + lawn
  k.box('#5c5d60', [W, 0.03, 8], [0, 0, D / 2 - 4], { base: true });
  for (let i = -5; i <= 5; i++) k.rectY('#e9e4cf', 0.035, [i * 3 - 0.06, i * 3 + 0.06], [D / 2 - 7.5, D / 2 - 3.5], { off: 0.002 });
  k.box('#c2bcb0', [W, 0.12, 2.0], [0, 0, D / 2 - 9], { base: true });
  k.blob('#7f9a58', 13, [0, 0.015, -4], { seg: 14, sx: 1.25, sz: 0.55, seed: 4003, wobble: 0.12, off: 0 });
  // restroom block (split-face block, gable roof), doors with pictograms, drinking fountain
  const bx = -8, bz = -4.5, bw = 9, bd = 5.5, bh = 3.2, block = '#c9b89a';
  k.box(block, [bw, bh, bd], [bx, 0, bz], { base: true, c: 0.05 });
  const F = walls(bw, bd, bx, bz);
  for (const f of Object.values(F)) for (let y = 0.4; y < bh; y += 0.4) wr(k, f, [f.u[0] + 0.05, f.u[1] - 0.05], [y - 0.02, y], shade(block, 0.86), 0.008);
  gableRoof(k, { w: bw, d: bd, y: bh, rh: 1.6, ridge: 'x', roof: '#5a6a5a', wall: block, cx: bx, cz: bz, o: 0.6 });
  for (const [dx, man] of [[-2.0, true], [2.0, false]]) {
    const x = bx + dx;
    wr(k, F.front, [x - 0.5, x + 0.5], [0, 2.2], '#4f6b8a', 0.02);
    wr(k, F.front, [x + 0.65, x + 1.15], [1.6, 2.1], '#efece4', 0.02);
    k.ico('#2a3a5a', 0.06, [x + 0.9, 2.0, bz + bd / 2 + 0.04]);
    if (man) k.box('#2a3a5a', [0.14, 0.24, 0.02], [x + 0.9, 1.8, bz + bd / 2 + 0.04]);
    else k.cone('#2a3a5a', 0.1, 0.26, [x + 0.9, 1.8, bz + bd / 2 + 0.04], { seg: 3 });
    wr(k, F.front, [x - 0.5, x + 0.5], [2.4, 2.8], '#36424a', 0.02);
  }
  k.box('#9a9894', [0.5, 0.9, 0.4], [bx, 0, bz + bd / 2 + 0.25], { base: true, c: 0.04 });
  for (const f of [F.left, F.back]) band(k, f, 0, 0.6, mix(block, PAL.dirt, 0.4), 0.012);
  // picnic shelter: hip roof on 4 posts, 2 tables
  const sx = 6.5, sz = -4.0;
  k.box(CON_L, [7, 0.15, 6], [sx, 0, sz], { base: true });
  for (const [dx, dz] of [[-3, -2.5], [3, -2.5], [-3, 2.5], [3, 2.5]]) k.box(PAL.woodDark, [0.25, 2.8, 0.25], [sx + dx, 0.15, sz + dz], { base: true });
  hipRoof(k, { w: 7, d: 6, y: 2.95, rh: 1.5, roof: '#7a4e3c', cx: sx, cz: sz, o: 0.5 });
  picnicTable(k, sx - 1.5, sz, Math.PI / 2); picnicTable(k, sx + 1.5, sz, Math.PI / 2);
  bin(k, sx + 3.6, sz + 3.2);
  // vending alcove: 3 machines under a small flat canopy
  const vx = 14.0, vz = -6.0;
  k.box('#a8a294', [5.4, 3.0, 2.0], [vx, 0, vz - 0.6], { base: true, c: 0.04 });
  k.box('#d8d3c6', [6.0, 0.25, 3.2], [vx, 3.0, vz], { base: true });
  const vend = [['#a8322a', '#f0d9a0'], ['#2f5a8a', '#d8e8f0'], ['#e9e4d6', '#e2b93b']];
  vend.forEach(([c, lit], i) => {
    const x = vx - 1.7 + i * 1.7;
    k.box(c, [1.3, 2.0, 0.8], [x, 0, vz + 0.6], { base: true, c: 0.03 });
    k.box(lit, [0.85, 1.2, 0.02], [x - 0.15, 0.6, vz + 1.0], { base: true });
    for (let j = 0; j < 4; j++) k.box(shade(c, 0.7), [0.8, 0.04, 0.025], [x - 0.15, 0.85 + j * 0.25, vz + 1.0], { base: true });
    k.box('#1f2022', [0.2, 0.35, 0.03], [x + 0.45, 1.0, vz + 1.0], { base: true });
    k.box('#2a2a2b', [0.9, 0.2, 0.03], [x - 0.15, 0.2, vz + 1.0], { base: true });
  });
  // info kiosk / map board, dog walk sign, trees, trash, a parked car
  k.box(PAL.woodDark, [0.15, 2.2, 0.15], [-1.0, 0, 0.5], { base: true }); k.box(PAL.woodDark, [0.15, 2.2, 0.15], [1.0, 0, 0.5], { base: true });
  k.box('#7a4e3c', [2.6, 0.2, 0.8], [0, 2.2, 0.5], { base: true, taper: [0.8, 0.4] });
  k.box('#e6dfc8', [1.9, 1.2, 0.06], [0, 0.9, 0.5], { base: true });
  for (let i = 0; i < 5; i++) k.rectZ(['#7a9a6a', '#c9b47a', '#6f8fb0'][i % 3], 0.53, [-0.8 + i * 0.35, -0.55 + i * 0.35], [1.1, 1.9], 1, { off: 0.004 });
  k.box('#8a8f92', [0.06, 1.4, 0.06], [-13, 0, 2], { base: true }); k.box('#3f6f5a', [0.6, 0.45, 0.03], [-13, 1.2, 2.03], { base: true });
  for (const [x, z, s] of [[-15, -8, 1.0], [0, -8.5, 1.2], [15.5, 1.5, 0.9]]) {
    k.cyl(PAL.trunk, 0.16, 0.22, 2.6 * s, [x, 0, z], { base: true, seg: 6 });
    for (let i = 0; i < 3; i++) k.ico(PAL.leaf[i], 1.6 * s * (i ? 0.75 : 1), [x + (i - 1) * 0.9 * s, 3.4 * s + (i ? -0.3 : 0.3), z + (i === 2 ? 0.6 : -0.3)], { detail: 1, jitter: 0.12, seed: 4010 + i + x, scale: [1, 0.85, 1], jit: 0.08 });
  }
  bin(k, -3.4, 0.4); bin(k, 3.6, -1.2, '#3e5a7a');
  parkedCar(k, 9, D / 2 - 5.5, Math.PI, PAL.civ[1]);
  const g = root('rest_stop', 0, { w: W, h: 6.6, l: D });
  g.add(k.mesh('body'));
  // tall roadside sign on two posts (front-left of the lot)
  const k2 = new Kit(4004); k2.floor = 0;
  for (const x of [-15.6, -12.4]) k2.box('#8a8f92', [0.15, 4.2, 0.15], [x, 0, D / 2 - 0.6], { base: true });
  k2.box('#8a8f92', [3.8, 2.2, 0.08], [-14, 3.0, D / 2 - 0.66], { base: true });
  g.add(k2.mesh('pole'));
  const tex = textTex('reststop', [
    { text: 'REST AREA', y: 0.3, px: 120, color: '#efefe8', weight: '700', family: 'Arial, Helvetica, sans-serif' },
    { text: 'I-9 · NEXT REST 86 MI', y: 0.62, px: 54, color: '#efefe8', weight: '700', family: 'Arial, Helvetica, sans-serif' },
    { text: 'PETS ON LEASH · NO CAMPING', y: 0.84, px: 36, color: '#c9d8ea', weight: '700', family: 'Arial, Helvetica, sans-serif' },
  ], { bg: '#21407a', border: '#efefe8', borderW: 8, h: 256 });
  g.add(signMesh(tex, [{ w: 3.7, h: 2.1, pos: [-14, 4.1, D / 2 - 0.6] }], '#21407a'));
  return g;
}
void THREE; void bush; void rod; void Kit; void shade;
