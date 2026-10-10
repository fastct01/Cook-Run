// ─────────────────────────────────────────────────────────────────────────────
// City Areas expansion — E. Harbour Docks (art agent: city).
//   dock_warehouse, container_stack (4), gantry_crane, lighthouse, fishing_boat (2),
//   cargo_ship, drawbridge, bollard_crates (3), store_chandlery
// Buildings face local +Z (the road / land side). Boats and the ship: bow toward +Z,
// keel bottom at y = 0 (sink them by userData.draft). The drawbridge carries its road
// along local Z with the water surface at y = 0 and the deck at userData.deckY.
// ─────────────────────────────────────────────────────────────────────────────
import {
  THREE, Kit, root, rng, empty, PAL, mix, shade, walls, wr, windowGrid, band, parapet, C, vwrap, TAU,
  fp, fbox, wpoly, archPts, beam, rod, railing, ladder, ribs, patches, streaks, rollDoor, steelWindow,
  acUnit, vent, drum, crate, pallet, lotSlab, signPole, addPanel, multiPanel, atlasUV, lampMaterial,
  paintedWallSign, textSign, signTexture, fitText, FONTS,
} from './city-kit.js';

// ── hull lofting: stations from stern to bow, each { z, w (half beam), keel, deck, sheer } ──
function hullStations(defs, wl, boot) {
  return defs.map(([z, w, keel, deck, sheer]) => {
    const raw = [[0.02, keel], [0.55 * w, keel + 0.12 * (wl - keel)], [0.9 * w, keel + 0.55 * (wl - keel)], [0.98 * w, wl], [w, wl + boot], [w * 1.02, deck], [w * 1.02, sheer]];
    for (let i = 1; i < raw.length; i++) raw[i][1] = Math.max(raw[i][1], raw[i - 1][1] + 0.02);
    return { z, pts: raw, deck: Math.max(deck, raw[5][1]) };
  });
}
/** Builds the hull skin (both sides), inner bulwark faces, deck and transom. cols: { bottom, boot, hull, inner, deck } */
function hullLoft(k, st, cols) {
  const rowCol = [cols.bottom, cols.bottom, cols.bottom, cols.boot, cols.hull, cols.hull];
  for (let i = 0; i < st.length - 1; i++) {
    const A = st[i], B = st[i + 1], zc = (A.z + B.z) / 2;
    for (let j = 0; j < A.pts.length - 1; j++) for (const s of [1, -1]) {
      const q = [[s * A.pts[j][0], A.pts[j][1], A.z], [s * B.pts[j][0], B.pts[j][1], B.z], [s * B.pts[j + 1][0], B.pts[j + 1][1], B.z], [s * A.pts[j + 1][0], A.pts[j + 1][1], A.z]];
      const cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4, cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, hc = (A.pts[6][1] + A.pts[0][1]) / 2;
      k.poly(rowCol[j], q, { facing: [cx, cy - hc, 0] });
      if (j === 5) k.poly(cols.inner, q.map((p) => [p[0] * 0.995, p[1], p[2]]), { facing: [-s, 0, 0] });
    }
    // deck strip
    k.poly(cols.deck, [[A.pts[5][0], A.deck, A.z], [-A.pts[5][0], A.deck, A.z], [-B.pts[5][0], B.deck, B.z], [B.pts[5][0], B.deck, B.z]], { facing: [0, 1, 0] });
    // gunwale cap
    for (const s of [1, -1]) k.poly(cols.cap || cols.inner, [[s * A.pts[6][0], A.pts[6][1], A.z], [s * B.pts[6][0], B.pts[6][1], B.z], [s * B.pts[6][0] * 0.96, B.pts[6][1], B.z], [s * A.pts[6][0] * 0.96, A.pts[6][1], A.z]], { facing: [0, 1, 0], off: 0.01 });
    void zc;
  }
  // transom (flat stern) — concave outline, so use the triangulating painter
  const T = st[0], out = [...T.pts.map(([x, y]) => [x, y]), ...T.pts.slice().reverse().map(([x, y]) => [-x, y])];
  k.flat(cols.hull, out, (x, y) => [x, y, T.z], { facing: [0, 0, -1], off: 0 });
  k.flat(cols.bottom, T.pts.slice(0, 4).map(([x, y]) => [x, y]).concat(T.pts.slice(0, 4).reverse().map(([x, y]) => [-x, y])), (x, y) => [x, y, T.z], { facing: [0, 0, -1], off: 0.01 });
}
/** Interpolated hull half-width at z (for placing name boards). */
function hullW(defs, z) {
  for (let i = 0; i < defs.length - 1; i++) { const [z0, w0] = defs[i], [z1, w1] = defs[i + 1]; if (z >= z0 && z <= z1) return w0 + (w1 - w0) * (z - z0) / (z1 - z0); }
  return defs[defs.length - 1][1];
}

// ═════════════════════════════════════════════════════════════════════════════
// E21. Dock warehouse — long brick warehouse, numbered loading doors, hoist beams.
// ═════════════════════════════════════════════════════════════════════════════
function dockAtlas() {
  return signTexture({
    key: 'atlas_dockwarehouse', w: 1024, h: 256, bg: 'rgba(0,0,0,0)', weather: true,
    draw: (ctx) => {
      // A: six numbered roundels (0,0)-(1024,128) laid out to match the bays
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < 6; i++) {
        const x = (i + 0.5) * 1024 / 6;
        ctx.fillStyle = '#e9e2cf'; ctx.beginPath(); ctx.arc(x, 64, 54, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#2f4a3f'; ctx.lineWidth = 8; ctx.stroke();
        ctx.fillStyle = '#2f4a3f'; fitText(ctx, String(i + 1), x, 68, 80, 78, '900', FONTS.SANS);
      }
      // B: painted name band (0,140)-(1024,256)
      ctx.fillStyle = '#7d4536'; ctx.fillRect(0, 140, 1024, 116);
      ctx.fillStyle = 'rgba(236,228,206,0.9)'; fitText(ctx, 'PIER 9 · BONDED STORES', 512, 190, 960, 74, '900', FONTS.SANS);
      ctx.fillStyle = 'rgba(226,190,110,0.85)'; fitText(ctx, 'HALVORSEN & DAUGHTERS SHIPPING · 1899', 512, 236, 760, 26, '700', FONTS.SANS);
    },
  });
}
export function buildDockWarehouse() {
  const W = 44, D = 16, H = 9.6, zc = -0.4, fz = zc + D / 2;
  const g = root('dock_warehouse', 0, { w: W + 1, h: H + 4.6, l: D + 2 });
  const k = new Kit(6000); k.floor = 0;
  const brick = '#8a4e3c', trim = '#c9bfa8', door = '#3f5a4a';
  k.box(brick, [W, H, D], [0, 0, zc], { base: true });
  k.box(shade(brick, 0.72), [W + 0.1, 0.7, D + 0.1], [0, 0, zc], { base: true });
  const F = walls(W, D, 0, zc);
  // gable roof (ridge along X), slate, skylights, vents, gable ends with round windows
  const rh = 4.2, o = 0.5, e = D / 2 + o, sl = rh / (D / 2), ye = H - o * sl;
  k.extrude((cx, cy, cz, nx, ny) => (ny < -0.3 ? '#3a3b3c' : Math.abs(ny) < 0.3 ? '#45494c' : '#5a5f63'), [[-e, ye], [0, H + rh], [e, ye], [e, ye + 0.18], [0, H + rh + 0.2], [-e, ye + 0.18]], W + 0.6, { axis: 'x', pos: [0, 0, zc] });
  k.extrude(brick, [[-D / 2, H - 0.02], [D / 2, H - 0.02], [0, H + rh - 0.05]], W, { axis: 'x', pos: [0, 0, zc] });
  for (let x = -W / 2 + 4; x < W / 2 - 3; x += 7.3) for (const s of [1, -1]) {
    const t0 = 0.35, t1 = 0.7, y0 = ye + 0.2 + (H + rh - ye) * t0, y1 = ye + 0.2 + (H + rh - ye) * t1;
    k.poly('#8fa0a4', [[x, y0, zc + s * e * (1 - t0)], [x + 2.4, y0, zc + s * e * (1 - t0)], [x + 2.4, y1, zc + s * e * (1 - t1)], [x, y1, zc + s * e * (1 - t1)]], { facing: [0, 1, s * sl], off: 0.03 });
  }
  for (const s of [-1, 1]) { k.cyl(trim, 1.0, 1.0, 0.1, [s * (W / 2 + 0.03), H + 1.4, zc], { axis: 'x', seg: 10 }); k.cyl(C.glass, 0.78, 0.78, 0.14, [s * (W / 2 + 0.03), H + 1.4, zc], { axis: 'x', seg: 10 }); }
  // six bays: timber sliding doors, loophole doors above, hoist beams, wall lamps, piers
  const bw = W / 6;
  for (let i = 0; i < 6; i++) {
    const uc = -W / 2 + (i + 0.5) * bw;
    wr(k, F.front, [uc - 2.0, uc + 2.0], [0.7, 4.6], trim, 0.012);
    wr(k, F.front, [uc - 1.8, uc + 1.8], [0.7, 4.4], door, 0.02);
    wr(k, F.front, [uc - 0.03, uc + 0.03], [0.7, 4.4], shade(door, 0.7), 0.026);
    for (const sx of [-1, 1]) k.poly(shade(door, 0.8), [[uc + sx * 1.7, 0.9, fz + 0.026], [uc + sx * 1.5, 0.9, fz + 0.026], [uc + sx * 0.15, 4.2, fz + 0.026], [uc + sx * 0.35, 4.2, fz + 0.026]], { facing: [0, 0, 1] });
    wr(k, F.front, [uc - 2.1, uc + 2.1], [4.6, 4.9], '#3a3836', 0.02);
    // upper floor: loophole door + two arched windows
    wr(k, F.front, [uc - 0.85, uc + 0.85], [5.6, 7.8], trim, 0.012);
    wr(k, F.front, [uc - 0.7, uc + 0.7], [5.6, 7.65], shade(door, 0.95), 0.02);
    for (const sx of [-1, 1]) steelWindow(k, F.front, uc + sx * 2.3, 5.9, 1.0, 1.5, { arch: 0.35, archSeg: 3, seed: 6010 + i * 3 + sx, cols: 2, rows: 3, lit: 0.3 });
    if (i !== 2 && i !== 3) { // hoist beams on the outer bays (the painted name sits over the middle two)
      k.box('#3a3836', [0.3, 0.3, 1.6], [uc, 8.7, fz + 0.8]);
      k.box('#3a3836', [0.12, 0.6, 0.12], [uc, 8.1, fz + 1.5], { base: true });
      k.torus('#3a3836', 0.12, 0.04, [uc, 7.95, fz + 1.5], { rot: [0, Math.PI / 2, 0], rs: 3, ts: 6, arc: Math.PI * 1.5 });
    }
    fbox(k, shade(brick, 1.06), F.front, -W / 2 + i * bw, H / 2, 0.6, H, 0.25, 0.12);
  }
  fbox(k, shade(brick, 1.06), F.front, W / 2, H / 2, 0.6, H, 0.25, 0.12);
  band(k, F.front, H - 0.5, H - 0.2, trim, 0.03);
  // sides/back: windows, wear
  for (const f of [F.left, F.right]) { for (const u of [-4.5, 0, 4.5]) steelWindow(k, { ...f, u: [f.u[0], f.u[1]] }, zc + u, 5.8, 1.2, 2.2, { arch: 0.5, archSeg: 3, seed: 6030 + u + f.at, cols: 2, rows: 3 }); wr(k, f, [zc - 1.6, zc + 1.6], [0.7, 4.0], door, 0.02); }
  windowGrid(k, F.back, [[5.8, 8.0]], 10, 1.2, { sill: trim, lit: 0.15, seed: 6040, margin: 1.5 });
  for (const f of Object.values(F)) { patches(k, f, 5, 1, H - 1, brick, 6050 + f.at); streaks(k, f, 6, 1, H, mix(brick, '#3a4a4a', 0.35), 6060 + f.at, 0.22); band(k, f, 0.7, 1.4, mix(brick, '#4a5a58', 0.35), 0.006); }
  for (let i = 0; i < 4; i++) vent(k, -W / 2 + 6 + i * 11, H + rh - 0.6, zc - 1.2, 1.0, 0.25);
  g.add(k.mesh('body'));
  const A = (a, b, c, d) => atlasUV(a, b, c, d, 1024, 256);
  const quads = [];
  for (let i = 0; i < 6; i++) quads.push({ p: [-W / 2 + (i + 0.5) * bw, 5.25, fz + 0.03], w: 0.9, h: 0.9, uv: A(i * 1024 / 6 + 25, 4, (i + 1) * 1024 / 6 - 25, 124) });
  quads.push({ p: [0, 8.65, fz + 0.03], w: 9.6, h: 1.09, uv: A(0, 140, 1024, 256) });
  multiPanel(g, dockAtlas(), quads, { cut: 0.3, fallback: '#e9e2cf' });
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// E22. Container stacks — 12.2 × 2.44 × 2.59 m boxes (long axis along X). 4 layouts.
// ═════════════════════════════════════════════════════════════════════════════
const BOXCOLS = ['#9c4a32', '#3f7470', '#4f6f8f', '#d9cdb0', '#5f7a4a', '#c9703a', '#8a8f86', '#7a3a3a', '#2f4a6a'];
export function container(k, x, y, z, rotY, col, o = {}) {
  const L = o.short ? 6.06 : 12.19, Wc = 2.44, Hc = 2.59, r = rng(o.seed || 1);
  k.at([x, y, z], [0, rotY, 0], () => {
    k.box((cx, cy, cz, nx, ny) => (ny > 0.5 ? shade(col, 1.08) : col), [L, Hc, Wc], [0, 0, 0], { base: true, noBottom: y < 0.1 });
    for (const sz of [1, -1]) {
      for (let u = -L / 2 + 0.3; u < L / 2 - 0.25; u += 0.6) k.rectZ(shade(col, 0.82), sz * Wc / 2, [u, u + 0.16], [0.14, Hc - 0.12], sz, { off: 0.006 });
      k.rectZ(shade(col, 0.7), sz * Wc / 2, [-L / 2, L / 2], [0, 0.14], sz, { off: 0.009 });
      k.rectZ(shade(col, 0.76), sz * Wc / 2, [-L / 2, L / 2], [Hc - 0.12, Hc], sz, { off: 0.009 });
      if (r() < 0.25) k.rectZ(mix(col, C.rust, 0.6), sz * Wc / 2, [(r() - 0.5) * L * 0.8, (r() - 0.5) * L * 0.8 + 0.8], [0.14, 0.4 + r() * 1.5], sz, { off: 0.012 });
    }
    if (!o.noLogo) { // fictional line livery: pale panel + diamond
      k.rectZ(shade(col, 1.25), Wc / 2, [-L / 2 + 1.0, -L / 2 + 3.6], [Hc - 1.0, Hc - 0.35], 1, { off: 0.012 });
      k.poly(o.logo || '#2a2622', [[-L / 2 + 1.4, Hc - 0.675, Wc / 2 + 0.016], [-L / 2 + 1.7, Hc - 0.9, Wc / 2 + 0.016], [-L / 2 + 2.0, Hc - 0.675, Wc / 2 + 0.016], [-L / 2 + 1.7, Hc - 0.45, Wc / 2 + 0.016]], { facing: [0, 0, 1] });
    }
    // door end (+X): split, lock bars, end frame; blank end (−X): frame
    k.rectX(shade(col, 0.72), L / 2, [-0.03, 0.03], [0.14, Hc - 0.12], 1, { off: 0.008 });
    for (const zz of [-0.95, -0.5, 0.5, 0.95]) k.rectX('#4a4b4d', L / 2, [zz - 0.025, zz + 0.025], [0.2, Hc - 0.18], 1, { off: 0.012 });
    for (const sx of [1, -1]) { k.rectX(shade(col, 0.7), sx * L / 2, [-Wc / 2, -Wc / 2 + 0.12], [0, Hc], sx, { off: 0.006 }); k.rectX(shade(col, 0.7), sx * L / 2, [Wc / 2 - 0.12, Wc / 2], [0, Hc], sx, { off: 0.006 }); }
  });
  return k;
}
const STACKS = [
  { style: '2×2 block', boxes: [[0, 0, -2.0, 0], [0, 0, 0.5, 1], [0, 1, -2.0, 2], [0, 1, 0.5, 3], [-2.2, 0, 3.7, 5, 0.12]] },
  { style: 'stepped', boxes: [[0, 0, -2.5, 7], [0, 1, -2.5, 1], [0, 2, -2.5, 3], [0, 0, 0, 2], [0, 1, 0, 0], [0, 0, 2.5, 4]] },
  { style: 'row + short boxes', boxes: [[0, 0, -3.75, 6], [0, 0, -1.25, 0], [0, 0, 1.25, 8], [0, 0, 3.75, 3], [0, 1, -1.25, 5], [0, 1, 1.25, 1], [-3.05, 1, -3.75, 4, 0, 1], [3.05, 1, -3.75, 7, 0, 1]] },
  { style: 'jumbled', boxes: [[0, 0, -2.65, 2], [0, 0, -0.15, 7], [0, 1, -2.65, 3], [1.4, 1, -0.15, 5, -0.06], [-1.2, 2, -2.0, 0, 0.18, 1], [-4.2, 0, 3.5, 4, 1.45, 1]] },
];
export function buildContainerStack(variant = 0) {
  const v = vwrap(variant, 4), s = STACKS[v];
  const g = root('container_stack', v, { w: 13, h: 8, l: 10 }, { style: s.style });
  const k = new Kit(6100 + v); k.floor = 0;
  let i = 0;
  for (const [x, tier, z, ci, rot = 0, short = 0] of s.boxes) container(k, x, tier * 2.59, z, rot, BOXCOLS[ci], { short: !!short, seed: 6110 + v * 10 + i++, logo: ['#2a2622', '#e9e2cf', '#c9703a'][(ci + v) % 3], noLogo: i % 3 === 2 });
  k.blob('#6e6a62', 6.5, [0, 0.012, 0], { seg: 10, seed: 6120 + v, sx: 1.2, sz: 0.9, off: 0 });
  g.add(k.mesh('body'));
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// E23. Ship-to-shore gantry crane (~45 m). Rails along X at z = ±8; boom reaches over the water (−Z).
//   `trolley` (cab + spreader + hanging container) slides along the boom on position.z (−18 … +14 from its rest).
// ═════════════════════════════════════════════════════════════════════════════
export function buildGantryCrane() {
  const g = root('gantry_crane', 0, { w: 26, h: 47, l: 64 });
  const k = new Kit(6200); k.floor = 0;
  const red = '#b85a3a', redD = shade(red, 0.8), cream = '#ddd3bb', yb = 31, lx = 8, lz = 8;
  // rails + bogies + legs
  for (const z of [-lz, lz]) { k.box('#5a4a3c', [26, 0.12, 1.4], [0, 0, z], { base: true }); k.box('#6a6a66', [26, 0.18, 0.18], [0, 0.12, z], { base: true }); }
  for (const x of [-lx, lx]) for (const z of [-lz, lz]) {
    k.box(redD, [4.0, 1.1, 1.3], [x, 0.3, z], { base: true });
    for (const dx of [-1.4, -0.45, 0.45, 1.4]) k.cyl('#2a2b2d', 0.38, 0.38, 1.0, [x + dx, 0.45, z], { axis: 'z', seg: 7 });
    for (let i = 0; i < 4; i++) k.rectZ(i % 2 ? C.iron : C.safety, z + 0.66, [x - 2.0 + i, x - 1.0 + i], [0.35, 1.35], 1, { off: 0.004 });
    k.box(red, [1.5, 13.8, 1.5], [x, 1.4, z], { base: true });
  }
  // portal sills + cross beams, upper columns with X-bracing, boom support beams
  for (const z of [-lz, lz]) k.box(red, [lx * 2 + 1.5, 1.8, 1.6], [0, 15.2, z], { base: true });
  for (const x of [-lx, lx]) k.box(red, [1.6, 1.8, lz * 2 + 1.5], [x, 15.2, 0], { base: true });
  for (const x of [-lx, lx]) for (const z of [-lz, lz]) k.box(red, [1.1, yb - 17, 1.1], [x, 17, z], { base: true });
  for (const x of [-lx, lx]) { beam(k, redD, [x, 17.2, -lz], [x, yb - 0.2, lz], 0.45); beam(k, redD, [x, 17.2, lz], [x, yb - 0.2, -lz], 0.45); }
  for (const z of [-lz, lz]) { beam(k, redD, [-lx, 17.2, z], [lx, yb - 0.5, z], 0.4); k.box(red, [lx * 2 + 1.2, 1.4, 1.3], [0, yb - 1.4, z], { base: true }); }
  // boom: two box girders from the backreach (+Z) to the tip over the water (−Z)
  const zb0 = 20, zb1 = -42, bl = zb0 - zb1, bc = (zb0 + zb1) / 2;
  for (const x of [-2.6, 2.6]) {
    k.box(cream, [1.1, 2.8, bl], [x, yb, bc], { base: true });
    for (let z = zb1 + 2; z < zb0; z += 4) k.rectX(shade(cream, 0.86), x + Math.sign(x) * 0.551, [z, z + 0.2], [yb + 0.15, yb + 2.65], Math.sign(x), { off: 0.004 });
    k.box('#5d6367', [0.2, 0.2, bl], [x - Math.sign(x) * 0.65, yb + 2.8, bc], { base: true });
  }
  for (let z = zb1 + 1; z < zb0; z += 6) k.box(cream, [4.2, 0.5, 0.5], [0, yb + 2.3, z], { base: true });
  railing(k, '#e9e2cf', [-3.4, yb + 2.8, zb1 + 1], [-3.4, yb + 2.8, zb0 - 1], 1.0, { step: 3 });
  k.box('#5f6064', [0.9, 0.06, bl - 2], [-3.3, yb + 2.8, bc], { base: true });
  // A-frames (apex) + forestays/backstays
  const ya = 45, za = -3, ax = 4;
  for (const s of [-1, 1]) {
    beam(k, red, [s * lx, yb, -lz], [s * ax, ya, za], 1.0);
    beam(k, red, [s * lx, yb, lz], [s * ax, ya, za], 1.0);
    rod(k, '#3a3b3d', [s * ax, ya, za], [s * 2.6, yb + 2.8, -24], 0.18, 5);
    rod(k, '#3a3b3d', [s * ax, ya, za], [s * 2.6, yb + 2.8, zb1 + 1], 0.18, 5);
    rod(k, '#3a3b3d', [s * ax, ya, za], [s * 2.6, yb + 2.8, zb0 - 1], 0.18, 5);
  }
  k.box(red, [ax * 2 + 1, 1.0, 1.0], [0, ya - 0.5, za], { base: true });
  k.box('#5f6064', [3.0, 1.2, 2.2], [0, ya + 0.5, za], { base: true });
  k.ico('#c43a2e', 0.25, [0, ya + 1.9, za]);
  // machinery house on the backreach + stair tower on one leg
  k.box(cream, [7.6, 4.4, 9.5], [0, yb + 2.8, 13.5], { base: true });
  k.box(red, [7.7, 0.6, 9.6], [0, yb + 5.4, 13.5], { base: true });
  for (const s of [-1, 1]) for (let z = 9.6; z < 17.5; z += 1.3) k.rectX('#5d6367', s * 3.81, [z, z + 0.8], [yb + 3.5, yb + 4.9], s, { off: 0.01 });
  k.box(cream, [1.2, 0.8, 1.2], [2, yb + 7.2, 15], { base: true });
  ladder(k, C.iron, { axis: 'x', at: lx + 0.75, dir: 1, u: [-30, 30] }, lz, 1.4, 15.2, 0.25, 0.5);
  // flood lights under the boom
  for (const z of [-36, -24, -12, 4]) for (const x of [-3.2, 3.2]) { k.box('#3a3b3d', [0.5, 0.4, 0.5], [x, yb - 0.4, z], { base: true }); k.rectY(PAL.lampWarm, yb - 0.41, [x - 0.2, x + 0.2], [z - 0.2, z + 0.2], { facing: [0, -1, 0], off: 0.002 }); }
  g.add(k.mesh('body'));
  // trolley pivot (rest position over the quay edge at z = −20)
  const kt = new Kit(6210);
  kt.box('#e2b34a', [6.2, 1.4, 4.2], [0, -1.55, 0], { base: true });
  for (const x of [-2.6, 2.6]) for (const z of [-1.5, 1.5]) kt.cyl('#2a2b2d', 0.25, 0.25, 0.3, [x, -0.15, z], { axis: 'x', seg: 6 });
  kt.box('#e2b34a', [2.4, 0.8, 2.4], [2.2, -2.35, 1.2], { base: true });
  kt.box('#e9e2cf', [2.5, 2.4, 2.7], [2.2, -4.75, 1.2], { base: true });
  for (const s of [-1, 1]) kt.rectZ(C.glassB, 1.2 + s * 1.36, [1.1, 3.3], [-4.15, -2.75], s, { off: 0.01 });
  kt.rectY(C.glassB, -4.76, [1.2, 3.2], [0.2, 2.2], { facing: [0, -1, 0], off: 0.002 });
  const sy = 12 - yb;
  for (const x of [-1.6, 1.6]) for (const z of [-0.8, 0.8]) rod(kt, '#2a2a2a', [x * 0.6, -1.55, z * 0.6], [x * 2.2, sy + 0.5, z], 0.03, 3);
  kt.box('#e2b34a', [12.4, 0.45, 2.6], [0, sy, 0], { base: true });
  for (const x of [-6.0, 6.0]) kt.box('#e2b34a', [0.3, 0.3, 2.8], [x, sy - 0.2, 0], { base: true });
  container(kt, 0, sy - 2.6, 0, 0, '#4f6f8f', { seed: 6211, logo: '#e9e2cf' });
  const trolley = new THREE.Object3D();
  trolley.name = 'trolley';
  trolley.position.set(0, yb, -20);
  trolley.add(kt.mesh('trolley_mesh'));
  g.add(trolley);
  g.userData.rails = { z: [-lz, lz], gauge: lz * 2, note: 'rails run along X; boom points to −Z (water)' };
  g.userData.trolley = { axis: 'z', rest: -20, min: zb1 + 4, max: 6 };
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// E24. Lighthouse — pier-end tower; `lamp` (emissive lens) rotates on y.
// ═════════════════════════════════════════════════════════════════════════════
export function buildLighthouse() {
  const g = root('lighthouse', 0, { w: 12, h: 19.5, l: 12 });
  const k = new Kit(6300); k.floor = 0;
  const white = '#e9e4d6', red = '#a8382e', stone = '#9d9585';
  // pier-end platform with rocks
  k.cyl(stone, 5.4, 5.8, 1.6, [0, 0, 0], { base: true, seg: 12 });
  k.cyl(shade(stone, 0.8), 5.82, 5.82, 0.5, [0, 0, 0], { base: true, seg: 12, open: true });
  k.cyl('#a9a59a', 5.2, 5.2, 0.05, [0, 1.6, 0], { base: true, seg: 12 });
  const r = rng(6301);
  for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + r() * 0.4; k.ico(i % 2 ? '#7d776c' : '#8f897d', 0.8 + r() * 0.6, [Math.sin(a) * 6.0, 0.4, Math.cos(a) * 6.0], { seed: 6302 + i, jitter: 0.25, flatBottom: -0.5 }); }
  railing(k, '#3a3b3d', [-4.8, 1.6, 2.6], [-2.6, 1.6, 4.8], 1.0, { step: 1.2 });
  railing(k, '#3a3b3d', [2.6, 1.6, -4.8], [4.8, 1.6, -2.6], 1.0, { step: 1.2 });
  // tower: tapered white with two red bands, door, small windows
  const y0 = 1.6, y1 = 13.6, rb = 2.0, rt = 1.45, rAt = (y) => rb + (rt - rb) * (y - y0) / (y1 - y0);
  k.cyl(white, rt, rb, y1 - y0, [0, y0, 0], { base: true, seg: 12, open: true });
  for (const [a, b] of [[5.2, 7.2], [10.0, 12.0]]) k.cyl(red, rAt(b) + 0.015, rAt(a) + 0.015, b - a, [0, a, 0], { base: true, seg: 12, open: true });
  k.box(white, [1.4, 2.6, 1.2], [0, y0, rb - 0.1], { base: true });
  k.box(red, [1.6, 0.15, 1.4], [0, y0 + 2.6, rb - 0.1], { base: true, rot: [0.1, 0, 0] });
  k.rectZ('#4a3a2c', rb + 0.505, [-0.45, 0.45], [y0, y0 + 2.1], 1, { off: 0.004 });
  for (const [y, a] of [[4.4, 0.3], [8.6, 2.6], [11.0, -1.2]]) k.at([Math.sin(a) * rAt(y), y, Math.cos(a) * rAt(y)], [0, a, 0], () => k.box('#2f3a42', [0.4, 0.7, 0.1], [0, 0, 0]));
  // gallery + railing, lantern room glazing bars, roof, vent ball, rod
  k.cyl('#3a3b3d', 2.4, 1.6, 0.6, [0, y1, 0], { base: true, seg: 12 });
  k.cyl('#5a5c5e', 2.45, 2.45, 0.12, [0, y1 + 0.6, 0], { base: true, seg: 12 });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; k.box('#3a3b3d', [0.05, 0.95, 0.05], [Math.sin(a) * 2.35, y1 + 0.72, Math.cos(a) * 2.35], { base: true }); }
  k.torus('#3a3b3d', 2.35, 0.04, [0, y1 + 1.67, 0], { rot: [Math.PI / 2, 0, 0], rs: 3, ts: 12 });
  k.cyl(red, 1.25, 1.25, 0.7, [0, y1 + 0.72, 0], { base: true, seg: 10 });
  const ly0 = y1 + 1.42, ly1 = ly0 + 1.7;
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; k.box('#2a2b2d', [0.07, ly1 - ly0, 0.07], [Math.sin(a) * 1.2, ly0, Math.cos(a) * 1.2], { base: true }); }
  k.torus('#2a2b2d', 1.2, 0.05, [0, ly0 + 0.85, 0], { rot: [Math.PI / 2, 0, 0], rs: 3, ts: 8 });
  k.cyl(red, 1.35, 1.35, 0.15, [0, ly1, 0], { base: true, seg: 10 });
  k.cone(red, 1.45, 1.1, [0, ly1 + 0.15, 0], { base: true, seg: 10 });
  k.ico('#3a3b3d', 0.22, [0, ly1 + 1.35, 0]);
  k.cyl('#3a3b3d', 0.03, 0.03, 1.0, [0, ly1 + 1.5, 0], { base: true, seg: 4 });
  // keeper's store shed
  k.box('#d9cfb3', [2.6, 2.2, 2.0], [2.7, y0, -2.4], { base: true, rot: [0, 0.6, 0] });
  k.at([2.7, y0 + 2.2, -2.4], [0, 0.6, 0], () => k.extrude(red, [[-1.2, -0.05], [1.2, -0.05], [0, 0.9]], 2.8, { axis: 'x' }));
  k.box('#c8b88a', [0.6, 0.08, 0.6], [-3.5, y0, -1.5], { base: true });
  g.add(k.mesh('body'));
  // lamp (lens assembly) — own emissive material, clone per instance to pulse
  const kl = new Kit(6310);
  kl.cyl('#fff3c4', 0.5, 0.5, 1.2, [0, 0, 0], { seg: 8 });
  for (const s of [-1, 1]) kl.box('#fffbe6', [0.8, 0.8, 0.08], [0, 0, s * 0.52]);
  const lamp = new THREE.Object3D();
  lamp.name = 'lamp';
  lamp.position.set(0, ly0 + 0.85, 0);
  const lm = new THREE.Mesh(kl.geometry(), lampMaterial('CR_Lamp_Lighthouse', '#fff1c0', '#ffd98a', 0.9));
  lm.name = 'lamp_mesh';
  lamp.add(lm);
  g.add(lamp);
  g.userData.perInstanceMaterials = ['lamp_mesh'];
  g.userData.lamp = { axis: 'y', note: 'spin lamp.rotation.y; beams point along its local ±Z' };
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// E25. Fishing boat — moored trawler (v0) / crabber (v1), ~16 m, bow +Z, keel at y = 0.
// ═════════════════════════════════════════════════════════════════════════════
const BOAT_DEFS = [[-8, 2.0, 0.9, 2.4, 3.25], [-6, 2.35, 0.3, 2.3, 3.15], [-3, 2.5, 0, 2.25, 3.1], [0, 2.5, 0, 2.25, 3.1], [3, 2.35, 0, 2.35, 3.25], [5.5, 1.75, 0.05, 2.6, 3.5], [7.2, 0.85, 0.6, 2.9, 3.8], [8.0, 0.06, 1.6, 3.1, 3.95]];
const BOATS = [
  { name: 'LUCKY PELICAN', hull: '#3f5f7a', house: '#e9e4d6', trim: '#c9703a', style: 'trawler' },
  { name: 'MARGARET ANN', hull: '#3f5a48', house: '#d9cfb3', trim: '#a8382e', style: 'crabber' },
];
export function buildFishingBoat(variant = 0) {
  const v = vwrap(variant, 2), s = BOATS[v];
  const g = root('fishing_boat', v, { w: 5.4, h: 11, l: 16.4 }, { style: s.style, draft: 1.45 });
  const k = new Kit(6400 + v); k.floor = 0;
  const st = hullStations(BOAT_DEFS, 1.45, 0.16);
  hullLoft(k, st, { bottom: '#8f3b30', boot: '#e9e2cf', hull: s.hull, inner: shade(s.house, 0.9), deck: '#8a7a64', cap: s.trim });
  // rub rail + tyre fenders + streaks
  const r = rng(6410 + v);
  for (const sd of [1, -1]) {
    for (const z of [-4.5, -1.5, 1.5]) k.torus(PAL.tyre, 0.3, 0.11, [sd * (hullW(BOAT_DEFS, z) + 0.12), 2.2, z], { rot: [0, Math.PI / 2, 0], rs: 4, ts: 7 });
    for (let i = 0; i < 4; i++) { const z = -6 + r() * 11, w = hullW(BOAT_DEFS, z); k.at([sd * (w + 0.03), 2.4, z], [0, sd * Math.PI / 2, 0], () => k.box(mix(s.hull, C.rust, 0.55), [0.18, 0.9 + r() * 0.6, 0.02], [0, 0, 0])); }
  }
  const deckY = 2.3;
  if (v === 0) {
    // wheelhouse forward, mast + outriggers, stern gantry + net drum, nets + floats
    k.box(s.house, [3.0, 2.3, 3.2], [0, deckY, 2.6], { base: true });
    k.box(s.house, [3.3, 0.15, 3.6], [0, deckY + 2.3, 2.6], { base: true });
    k.rectZ(C.glassB, 4.21, [-1.3, 1.3], [deckY + 1.3, deckY + 2.05], 1, { off: 0.01 });
    for (const sd of [1, -1]) k.rectX(C.glassB, sd * 1.5, [2.0, 3.6], [deckY + 1.3, deckY + 2.05], sd, { off: 0.01 });
    k.rectZ('#5e4632', 1.0, [-0.4, 0.4], [deckY, deckY + 1.9], -1, { off: 0.01 });
    k.torus('#e9e2cf', 0.35, 0.07, [1.51, deckY + 1.0, 1.6], { rot: [0, Math.PI / 2, 0], rs: 4, ts: 8 });
    k.cyl('#5d6367', 0.08, 0.1, 6.5, [0, deckY + 2.45, 1.8], { base: true, seg: 5 });
    k.box('#3a3b3d', [1.2, 0.1, 0.25], [0, deckY + 7.4, 1.8]);
    k.box('#e9e2cf', [0.5, 0.25, 0.5], [0, deckY + 3.3, 2.0], { base: true });
    for (const sd of [1, -1]) beam(k, '#5d6367', [0, deckY + 2.6, 1.6], [sd * 4.6, deckY + 7.4, 0.6], 0.09);
    for (const sd of [1, -1]) rod(k, '#2a2a2a', [sd * 4.6, deckY + 7.4, 0.6], [sd * 3.2, deckY + 2.0, -2], 0.015, 3);
    for (const sd of [1, -1]) beam(k, s.trim, [sd * 1.7, deckY, -7.4], [sd * 1.3, deckY + 4.2, -7.0], 0.2);
    k.box(s.trim, [2.8, 0.25, 0.25], [0, deckY + 4.2, -7.0]);
    k.cyl('#4f6b4a', 0.6, 0.6, 2.4, [0, deckY + 0.8, -6.2], { axis: 'x', seg: 8 });
    k.cyl(s.trim, 0.66, 0.66, 0.08, [1.2, deckY + 0.8, -6.2], { axis: 'x', seg: 8 });
    k.cyl(s.trim, 0.66, 0.66, 0.08, [-1.2, deckY + 0.8, -6.2], { axis: 'x', seg: 8 });
    k.ico('#5c6a52', 1.0, [0.4, deckY + 0.25, -3.6], { detail: 1, jitter: 0.25, seed: 6420, scale: [1.3, 0.5, 1.6], jit: 0.12 });
    for (let i = 0; i < 6; i++) k.ico(i % 2 ? '#d9822b' : '#e2b93b', 0.17, [-0.8 + r() * 2, deckY + 0.6, -4.5 + r() * 2], { detail: 0 });
    k.box('#8a7a64', [1.4, 0.4, 1.4], [0, deckY, -1.0], { base: true });
  } else {
    // wheelhouse aft, tall mast + boom forward, crab pots stacked, buoys
    k.box(s.house, [3.2, 2.5, 3.6], [0, deckY + 0.1, -4.6], { base: true });
    k.box(s.house, [2.6, 1.4, 2.6], [0, deckY + 2.6, -5.0], { base: true });
    k.box(s.trim, [3.0, 0.15, 3.0], [0, deckY + 4.0, -5.0], { base: true });
    k.rectZ(C.glassB, -3.69, [-1.1, 1.1], [deckY + 2.9, deckY + 3.7], 1, { off: 0.01 });
    k.rectZ(C.glassB, -2.79, [-1.4, 1.4], [deckY + 1.4, deckY + 2.2], 1, { off: 0.01 });
    for (const sd of [1, -1]) k.rectX(C.glassB, sd * 1.6, [-5.6, -3.4], [deckY + 1.4, deckY + 2.2], sd, { off: 0.01 });
    k.torus('#e9e2cf', 0.35, 0.07, [-1.61, deckY + 1.2, -4.6], { rot: [0, Math.PI / 2, 0], rs: 4, ts: 8 });
    k.cyl('#5d6367', 0.09, 0.12, 7.5, [0, deckY + 0.1, -2.2], { base: true, seg: 5 });
    beam(k, '#5d6367', [0, deckY + 1.6, -2.1], [0, deckY + 5.0, 3.8], 0.16);
    rod(k, '#2a2a2a', [0, deckY + 7.5, -2.2], [0, deckY + 5.0, 3.8], 0.015, 3);
    rod(k, '#2a2a2a', [0, deckY + 5.0, 3.8], [0, deckY + 1.8, 3.8], 0.015, 3);
    k.torus('#e2b93b', 0.15, 0.04, [0, deckY + 1.6, 3.8], { rot: [0, 0, 0], rs: 3, ts: 6 });
    k.box('#e2b93b', [0.4, 0.3, 0.4], [0, deckY + 7.2, -2.2], { base: true });
    for (let i = 0; i < 6; i++) { // crab pots: wire boxes with dark mesh
      const x = (i % 3 - 1) * 1.15, z = 0.4 + Math.floor(i / 3) * 1.3, y = deckY;
      k.box('#6d7a72', [1.0, 0.7, 1.1], [x, y, z], { base: true });
      for (const sd of [1, -1]) k.rectX('#3a3f3c', x + sd * 0.5, [z - 0.45, z + 0.45], [y + 0.08, y + 0.62], sd, { off: 0.006 });
      k.rectZ('#3a3f3c', z + 0.55, [x - 0.4, x + 0.4], [y + 0.08, y + 0.62], 1, { off: 0.006 });
    }
    for (let i = 0; i < 2; i++) k.box('#6d7a72', [1.0, 0.7, 1.1], [-0.6 + i * 1.2, deckY + 0.7, 1.05], { base: true });
    for (let i = 0; i < 5; i++) k.ico(i % 2 ? '#c9703a' : '#e9e2cf', 0.22, [-1.5 + i * 0.75, deckY + 0.9, -1.8], { detail: 0 });
  }
  // nav lights (red/green) + anchor + bow fairlead
  k.box('#c43a2e', [0.12, 0.12, 0.2], [-1.65, deckY + 2.5, v ? -4.0 : 3.0]);
  k.box('#3a8a4a', [0.12, 0.12, 0.2], [1.65, deckY + 2.5, v ? -4.0 : 3.0]);
  for (const sd of [1, -1]) k.box('#2a2b2d', [0.1, 0.5, 0.3], [sd * (hullW(BOAT_DEFS, 6.6) + 0.04), 2.6, 6.6], { rot: [0, sd * 0.45, 0] });
  g.add(k.mesh('body'));
  // name boards on both bows (one draw call)
  const tex = textSign('sign_boat_' + v, [{ text: s.name, y: 0.55, px: 80, color: '#efe9dc', family: FONTS.SERIF, weight: '700' }], { bg: s.hull, w: 512, h: 80 });
  const z = 4.0, w = hullW(BOAT_DEFS, z) * 1.02 + 0.04, a = Math.atan2(hullW(BOAT_DEFS, 3) - hullW(BOAT_DEFS, 5.5), 2.5);
  multiPanel(g, tex, [
    { p: [w, 2.8, z], w: 2.3, h: 0.36, rotY: Math.PI / 2 - a },
    { p: [-w, 2.8, z], w: 2.3, h: 0.36, rotY: -Math.PI / 2 + a },
  ], { fallback: s.hull });
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// E26. Cargo ship — ~124 m container ship (background set piece). Bow +Z, keel y = 0, draft 7.
// ═════════════════════════════════════════════════════════════════════════════
const SHIP_DEFS = [[-60, 8.4, 2.4, 11, 11.2], [-56, 9.6, 0.8, 11, 11.2], [-48, 10, 0, 11, 11.2], [40, 10, 0, 11, 11.2], [48, 9.5, 0, 11.2, 11.5], [54, 7.6, 0.3, 11.8, 12.2], [58, 4.8, 1.5, 12.6, 13.0], [61, 1.8, 4.0, 13.0, 13.5], [62.6, 0.1, 6.4, 13.2, 13.8]];
export function buildCargoShip() {
  const g = root('cargo_ship', 0, { w: 22, h: 40, l: 124 }, { draft: 7.0 });
  const k = new Kit(6500); k.floor = 0;
  const hullC = '#2f4458', white = '#e2dccb';
  hullLoft(k, hullStations(SHIP_DEFS, 7.0, 0.6), { bottom: '#8f3b30', boot: '#2b2a28', hull: hullC, inner: '#7a7c76', deck: '#6b6e66', cap: '#d9d4c4' });
  // sheer stripe + hawse pipes + draft marks
  for (const sd of [1, -1]) {
    k.rectX('#d9d4c4', sd * 10.21, [-48, 40], [10.4, 10.7], sd, { off: 0.02 });
    k.cyl('#1f2a33', 0.6, 0.6, 0.1, [sd * (hullW(SHIP_DEFS, 56) + 0.05), 10.2, 56], { axis: 'x', seg: 8 });
    for (let i = 0; i < 5; i++) k.rectX('#e9e2cf', sd * 10.22, [-46.3, -46.0], [3 + i, 3.2 + i], sd, { off: 0.02 });
  }
  // superstructure (accommodation + bridge) aft, funnel, lifeboat, masts
  const sz0 = -52, sz1 = -43, sh = 14;
  k.box(white, [16, sh, sz1 - sz0], [0, 11.2, (sz0 + sz1) / 2], { base: true });
  const S = walls(16, sz1 - sz0, 0, (sz0 + sz1) / 2);
  for (let d = 0; d < 5; d++) for (const f of [S.front, S.left, S.right, S.back]) wr(k, f, [f.u[0] + 0.6, f.u[1] - 0.6], [11.2 + 1.2 + d * 2.6, 11.2 + 2.1 + d * 2.6], '#2f3a42', 0.02);
  k.box(white, [23, 0.6, 3.2], [0, 11.2 + sh - 0.6, sz1 - 1.6], { base: true });
  k.box(white, [12, 2.4, 6], [0, 11.2 + sh, (sz0 + sz1) / 2 + 1], { base: true });
  k.rectZ('#2f3a42', (sz0 + sz1) / 2 + 4.01, [-5.6, 5.6], [11.2 + sh + 0.6, 11.2 + sh + 1.8], 1, { off: 0.01 });
  k.box('#e9e2cf', [0.3, 6, 0.3], [0, 11.2 + sh + 2.4, (sz0 + sz1) / 2], { base: true });
  k.box('#e9e2cf', [3.2, 0.2, 0.4], [0, 11.2 + sh + 7.2, (sz0 + sz1) / 2]);
  k.box('#e9e2cf', [2.0, 0.15, 0.6], [0, 11.2 + sh + 5.6, (sz0 + sz1) / 2 + 0.3], { rot: [0, 0.4, 0] });
  k.box(white, [5, 11, 5.5], [0, 14, -56.5], { base: true, taper: [0.9, 0.85] });
  k.box('#c9963a', [4.6, 1.6, 4.9], [0, 21.5, -56.5], { base: true });
  k.box('#22252a', [4.3, 1.2, 4.6], [0, 23.6, -56.5], { base: true });
  for (const sd of [1, -1]) { k.cyl('#3f7470', 0.75, 0.75, 0.05, [sd * 2.32, 22.3, -56.5], { axis: 'x', seg: 8 }); k.box('#d9822b', [1.6, 1.6, 6.5], [sd * 8.9, 15.5, -47.5], { base: true, c: 0.5 }); k.box('#d9d4c4', [0.2, 2.2, 0.2], [sd * 8.0, 15.0, -45], { base: true }); }
  // deck cargo: bays of containers (box per container, colour-jittered), lashing bridges
  const r = rng(6501);
  const bays = [-37, -24.5, -12, 0.5, 13, 25.5, 38];
  const rows = 7;
  for (let b = 0; b < bays.length; b++) {
    const zc = bays[b], maxT = b === bays.length - 1 ? 2 : b === 0 ? 4 : 3 + (b % 2);
    k.box('#4a4d4f', [19.6, 1.0, 12.4], [0, 11.2, zc], { base: true });
    for (let i = 0; i < rows; i++) {
      const x = -7.9 + i * (15.8 / (rows - 1)), t = Math.max(1, maxT - (i === 0 || i === rows - 1 ? 1 : 0) - (r() < 0.2 ? 1 : 0));
      for (let j = 0; j < t; j++) k.box((cx, cy, cz, nx, ny, nz) => { const c = BOXCOLS[(b * 5 + i * 3 + j * 7) % BOXCOLS.length]; return ny > 0.5 ? shade(c, 1.1) : Math.abs(nz) > 0.5 ? shade(c, 0.8) : c; }, [2.44, 2.59, 12.19], [x, 12.2 + j * 2.59, zc], { base: true, noBottom: true, jit: 0.1 });
      if (i === 0 || i === rows - 1) for (let j = 0; j < t; j++) for (let u = -5.4; u < 6; u += 1.8) k.rectX('#1f2226', x + (i === 0 ? -1.221 : 1.221), [zc + u, zc + u + 0.12], [12.3 + j * 2.59, 14.7 + j * 2.59], i === 0 ? -1 : 1, { off: 0.004 });
    }
    if (b < bays.length - 1) for (const x of [-9.4, 9.4]) k.box('#5d6367', [0.3, 7.5, 0.3], [x, 11.2, zc + 6.25], { base: true });
  }
  // forecastle: bulwark, mast with light, winches
  k.box(hullC, [14, 1.4, 0.3], [0, 12.6, 49.5], { base: true });
  k.box('#d9d4c4', [0.3, 9, 0.3], [0, 13.0, 52], { base: true });
  k.box('#d9d4c4', [3.0, 0.2, 0.3], [0, 20, 52]);
  for (const x of [-3.2, 3.2]) { k.cyl('#5f6064', 0.7, 0.7, 1.6, [x, 13.9, 55], { axis: 'x', seg: 8 }); k.box('#3a3b3d', [1.4, 0.6, 1.4], [x, 12.8, 55], { base: true }); }
  g.add(k.mesh('body', undefined, true));
  // names: both bows + stern (one draw call)
  const tex = textSign('sign_ship_name', [{ text: 'MARISOL DAWN', y: 0.5, px: 110, color: '#efe9dc' }], { bg: hullC, w: 1024, h: 140 });
  const zb = 52, wb = hullW(SHIP_DEFS, zb) + 0.03, a = Math.atan2(hullW(SHIP_DEFS, 48) - hullW(SHIP_DEFS, 56), 8);
  multiPanel(g, tex, [
    { p: [wb, 11.6, zb], w: 9, h: 1.23, rotY: Math.PI / 2 - a },
    { p: [-wb, 11.6, zb], w: 9, h: 1.23, rotY: -Math.PI / 2 + a },
    { p: [0, 9.0, -60.04], w: 9, h: 1.23, rotY: Math.PI },
  ], { fallback: hullC });
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// E27. Bascule drawbridge — 2-lane road along Z, 48 m opening, two leaves.
//   Water at y = 0, road deck at userData.deckY (6). `leaf_l` (pivot z = −24) rises with rotation.x < 0,
//   `leaf_r` (pivot z = +24) with rotation.x > 0 (≈ ∓1.25 fully open). Counterweights swing into the piers.
// ═════════════════════════════════════════════════════════════════════════════
function leafKit(sgn, seed) {
  const k = new Kit(seed);
  const L = 23.96, steel = '#3f6f6b', steelD = shade(steel, 0.8);
  const Z = (t) => sgn * t;
  // deck plate (top at local y = 1.0 → world deckY), grating stripes, markings, sidewalks, hazard tip
  k.box('#5d6164', [10.6, 0.4, L], [0, 0.6, Z(L / 2)], { base: true });
  for (let t = 0.6; t < L; t += 0.8) k.rectY('#4a4d50', 1.0, [-3.5, 3.5], [Z(t) - 0.05, Z(t) + 0.05].sort((a, b) => a - b), { off: 0.004 });
  for (const x of [-0.12, 0.12]) k.rectY('#d9b23a', 1.0, [x - 0.06, x + 0.06], [Z(0), Z(L)].sort((a, b) => a - b), { off: 0.008 });
  for (const x of [-3.4, 3.4]) k.rectY('#e9e2cf', 1.0, [x - 0.07, x + 0.07], [Z(0), Z(L)].sort((a, b) => a - b), { off: 0.008 });
  for (const sx of [-1, 1]) k.box('#8f8b82', [1.5, 0.2, L], [sx * 4.3, 1.0, Z(L / 2)], { base: true });
  for (let i = 0; i < 6; i++) k.rectY(i % 2 ? '#2a2b2d' : C.safety, 1.0, [-3.5 + i * 7 / 6, -3.5 + (i + 1) * 7 / 6], [Z(L - 0.5), Z(L)].sort((a, b) => a - b), { off: 0.012 });
  // plate girders (deep at the pivot, shallow at the tip) with stiffeners, railings on top
  for (const sx of [-1, 1]) {
    k.extrude(steel, [[0, -1.8], [Z(L), 0.2], [Z(L), 1.5], [0, 1.5]], 0.45, { axis: 'x', pos: [sx * 5.5, 0, 0] });
    for (let t = 1.5; t < L - 0.5; t += 2.2) { const yb = -1.8 + 2.0 * (t / L); k.rectX(steelD, sx * 5.5 + sx * 0.226, [Z(t) - 0.08, Z(t) + 0.08].sort((a, b) => a - b), [yb, 1.5], sx, { off: 0.004 }); }
    k.box(steelD, [0.08, 0.08, L], [sx * 5.5, 2.5, Z(L / 2)]);
    k.box(steelD, [0.06, 0.06, L], [sx * 5.5, 2.0, Z(L / 2)]);
    for (let t = 0.4; t < L; t += 2.0) k.box(steelD, [0.07, 1.0, 0.07], [sx * 5.5, 1.5, Z(t)], { base: true });
  }
  // under-deck cross girders, trunnion, counterweight tail
  for (let t = 2; t < L; t += 5.5) k.box(steelD, [10.6, 0.6, 0.3], [0, 0.0, Z(t)], { base: true });
  k.cyl('#5d6367', 0.65, 0.65, 11.6, [0, 0, 0], { axis: 'x', seg: 8 });
  k.box('#8f8b82', [9.8, 3.8, 5.6], [0, -3.1, Z(-3.6)], { base: true });
  k.box(steelD, [10.6, 1.2, 1.2], [0, -0.6, Z(-0.6)], { base: true });
  return k;
}
export function buildDrawbridge() {
  const deckY = 6, piv = 24, pierL = 12, appL = 6, pw = 15;
  const g = root('drawbridge', 0, { w: 22, h: deckY + 6.2, l: 2 * (piv + pierL + appL) }, { deckY });
  const k = new Kit(6600); k.floor = 0;
  const conc = '#a39e92', concD = shade(conc, 0.82), steel = '#3f6f6b';
  for (const s of [-1, 1]) {
    const z0 = s * piv, z1 = s * (piv + pierL), zc = (z0 + z1) / 2, zA = s * (piv + pierL + appL / 2);
    // pier + fenders + waterline grime
    k.box(conc, [pw, deckY - 0.4, pierL], [0, 0, zc], { base: true });
    const P = walls(pw, pierL, 0, zc), face = s < 0 ? P.front : P.back;
    band(k, face, 0, 0.9, '#5d6a62', 0.01);
    for (let x = -6.5; x <= 6.5; x += 1.3) wr(k, face, [x - 0.15, x + 0.15], [0.2, deckY - 0.6], '#5e4632', 0.06);
    for (const f of [P.left, P.right]) { band(k, f, 0, 0.9, '#5d6a62', 0.01); streaks(k, f, 4, 1, deckY - 0.4, concD, 6610 + f.at + s, 0.3); }
    // fixed road deck on the pier + approach abutment
    k.box('#4a4b4e', [10.6, 0.4, pierL], [0, deckY - 0.4, zc], { base: true });
    k.box(conc, [11.6, deckY - 0.4, appL], [0, 0, zA], { base: true });
    k.box('#4a4b4e', [10.6, 0.4, appL], [0, deckY - 0.4, zA], { base: true });
    for (const sx of [-1, 1]) {
      k.box('#8f8b82', [1.5, 0.2, pierL + appL], [sx * 4.3, deckY, s * (piv + (pierL + appL) / 2)], { base: true });
      railing(k, '#3a3b3d', [sx * 5.4, deckY + 0.2, z1], [sx * 5.4, deckY + 0.2, s * (piv + pierL + appL)], 1.0, { step: 2 });
    }
    k.rectY('#d9b23a', deckY + 0.002, [-0.18, 0.18], [Math.min(z0, s * (piv + pierL + appL)), Math.max(z0, s * (piv + pierL + appL))], { off: 0.006 });
    // counterweight housings either side of the roadway, with lamps
    for (const sx of [-1, 1]) {
      k.box(conc, [1.9, 3.4, pierL - 1], [sx * 6.5, deckY, zc], { base: true });
      k.box(shade(conc, 1.06), [2.2, 0.35, pierL - 0.6], [sx * 6.5, deckY + 3.4, zc], { base: true });
      const H = walls(1.9, pierL - 1, sx * 6.5, zc);
      for (const f of [H.left, H.right]) for (let i = 0; i < 3; i++) wr(k, f, [zc - 4.5 + i * 3.2, zc - 2.3 + i * 3.2], [deckY + 0.6, deckY + 2.8], concD, 0.01);
      for (const zz of [z0 + s * 0.8, z1 - s * 0.8]) { k.cyl('#2f3a3a', 0.1, 0.12, 2.0, [sx * 6.5, deckY + 3.75, zz], { base: true, seg: 5 }); k.box('#2f3a3a', [0.5, 0.5, 0.5], [sx * 6.5, deckY + 5.75, zz], { base: true }); k.box(PAL.lampWarm, [0.4, 0.3, 0.4], [sx * 6.5, deckY + 5.85, zz], { base: true }); }
    }
    // operator house on opposite sides of the two piers
    const ox = -s * 10.2, oz = zc;
    k.box(conc, [4.6, deckY - 0.4, 6.4], [ox, 0, oz], { base: true });
    k.box('#d9cfb3', [4.0, 2.8, 5.4], [ox, deckY - 0.4, oz], { base: true });
    k.box('#d9cfb3', [4.6, 2.6, 6.0], [ox, deckY + 2.4, oz], { base: true });
    const O = walls(4.6, 6.0, ox, oz);
    for (const f of Object.values(O)) wr(k, f, [f.u[0] + 0.3, f.u[1] - 0.3], [deckY + 3.1, deckY + 4.6], '#2f3a42', 0.02);
    for (const f of Object.values(O)) for (let u = f.u[0] + 1.1; u < f.u[1] - 0.6; u += 1.1) wr(k, f, [u - 0.04, u + 0.04], [deckY + 3.1, deckY + 4.6], '#d9cfb3', 0.03);
    k.box(steel, [5.2, 0.25, 6.6], [ox, deckY + 5.0, oz], { base: true });
    k.cone(steel, 4.2, 1.6, [ox, deckY + 5.25, oz], { base: true, seg: 4, rot: [0, Math.PI / 4, 0] });
    wr(k, walls(4.0, 5.4, ox, oz).front, [ox - 0.5, ox + 0.5], [deckY - 0.4, deckY + 1.8], '#5e4632', 0.02);
    // traffic barrier arms (raised) + signal at the land end of each pier
    for (const sx of [-1, 1]) {
      const bz = z1 - s * 1.0;
      k.box('#e9e2cf', [0.35, 1.1, 0.35], [sx * 3.0, deckY, bz], { base: true });
      k.box('#e9e2cf', [0.12, 3.6, 0.12], [sx * 3.0, deckY + 1.0, bz], { base: true });
      for (let i = 0; i < 4; i++) k.box('#b8402e', [0.13, 0.4, 0.13], [sx * 3.0, deckY + 1.4 + i * 0.85, bz], { base: true });
      k.box('#2a2b2d', [0.5, 0.9, 0.3], [sx * 4.9, deckY + 1.5, bz], { base: true });
      k.cyl('#c43a2e', 0.15, 0.15, 0.05, [sx * 4.9, deckY + 2.1, bz + s * 0.17], { axis: 'z', seg: 6 });
    }
  }
  g.add(k.mesh('body'));
  for (const [name, sgn, z] of [['leaf_l', 1, -piv], ['leaf_r', -1, piv]]) {
    const p = new THREE.Object3D();
    p.name = name;
    p.position.set(0, deckY - 1.0, z);
    p.add(leafKit(sgn, name === 'leaf_l' ? 6620 : 6621).mesh(name + '_mesh'));
    g.add(p);
  }
  g.userData.leaves = { axis: 'x', closed: 0, open: { leaf_l: -1.25, leaf_r: 1.25 }, pivotY: deckY - 1.0, pivotZ: [-piv, piv] };
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// E28. Dock clutter — v0 bitts + rope + crates, v1 fishing gear, v2 cargo + navigation buoy.
// ═════════════════════════════════════════════════════════════════════════════
function bitts(k, x, z, rotY = 0) {
  k.at([x, 0, z], [0, rotY, 0], () => {
    k.box('#2a2b2d', [1.3, 0.14, 0.62], [0, 0, 0], { base: true });
    for (const s of [-1, 1]) { k.cyl('#2f3032', 0.17, 0.2, 0.62, [s * 0.38, 0.14, 0], { base: true, seg: 7 }); k.cyl('#2f3032', 0.25, 0.25, 0.08, [s * 0.38, 0.76, 0], { base: true, seg: 7 }); }
  });
}
function bollard(k, x, z) {
  k.cyl('#2f3032', 0.26, 0.3, 0.6, [x, 0, z], { base: true, seg: 8 });
  k.lathe('#2f3032', [[0.24, 0], [0.38, 0.12], [0.36, 0.2], [0, 0.24]], 8, [x, 0.6, z]);
  k.cyl(mix('#2f3032', C.rust, 0.5), 0.3, 0.3, 0.12, [x, 0, z], { base: true, seg: 8, open: true });
}
function ropeCoil(k, x, z, s = 1, col = '#c9b48a') {
  for (let i = 0; i < 3; i++) k.torus(shade(col, 1 - i * 0.06), (0.45 - i * 0.08) * s, 0.07 * s, [x, 0.07 * s + i * 0.11 * s, z], { rot: [Math.PI / 2, 0, 0], rs: 4, ts: 10 });
}
function buoy(k, x, y, z, col, r = 0.35) {
  k.ico(col, r, [x, y + r, z], { detail: 1 });
  k.cyl('#e9e2cf', r * 1.01, r * 1.01, r * 0.35, [x, y + r, z], { seg: 10, open: true });
}
export function buildBollardCrates(variant = 0) {
  const v = vwrap(variant, 3);
  const g = root('bollard_crates', v, { w: 6, h: 2.4, l: 4 }, { style: ['bitts & crates', 'fishing gear', 'cargo & buoy'][v] });
  const k = new Kit(6700 + v); k.floor = 0;
  const r = rng(6710 + v);
  if (v === 0) {
    bitts(k, -1.8, 0.6, 0.1);
    ropeCoil(k, -1.6, -0.9);
    rod(k, '#c9b48a', [-2.15, 0.6, 0.6], [-2.6, 0.05, 1.8], 0.05, 4);
    pallet(k, 1.2, 0, -0.2, 0.15);
    crate(k, 0.9, 0.15, -0.3, 1.0, '#a8865e', 0.15); crate(k, 1.9, 0.15, 0.1, 0.9, '#8a7a5a', 0.1); crate(k, 1.3, 0.95, -0.15, 0.85, '#b49a74', -0.05);
    buoy(k, 0.0, 0, 1.4, '#b8402e');
    drum(k, 2.7, 1.3, '#3e5a7a');
  } else if (v === 1) {
    k.ico('#56634e', 1.0, [-1.3, 0.3, 0], { detail: 1, jitter: 0.3, seed: 6720, scale: [1.5, 0.45, 1.2], jit: 0.12, flatBottom: -0.6 });
    for (let i = 0; i < 7; i++) k.box('#e2b93b', [0.18, 0.1, 0.12], [-2.4 + r() * 2.2, 0.62 + r() * 0.1, -0.8 + r() * 1.6], { rot: [0, r() * 3, 0] });
    for (let i = 0; i < 4; i++) {
      const x = 0.9 + (i % 2) * 1.05, y = Math.floor(i / 2) * 0.62, z = -0.6;
      k.box('#6d7a72', [0.95, 0.6, 0.8], [x, y, z], { base: true });
      for (const sx of [-1, 1]) k.rectX('#3a3f3c', x + sx * 0.475, [z - 0.32, z + 0.32], [y + 0.06, y + 0.54], sx, { off: 0.006 });
      k.rectZ('#3a3f3c', z + 0.4, [x - 0.38, x + 0.38], [y + 0.06, y + 0.54], 1, { off: 0.006 });
    }
    for (let i = 0; i < 3; i++) k.box('#3e6f9a', [0.8, 0.3, 0.55], [1.4, i * 0.3, 0.75], { base: true, rot: [0, (r() - 0.5) * 0.2, 0] });
    k.rectY('#c0c8c4', 0.9, [1.05, 1.75], [0.52, 0.98], { off: 0.002 });
    buoy(k, -0.2, 0, 1.3, '#d9822b', 0.3); buoy(k, 0.5, 0, 1.6, '#d9822b', 0.25);
    bollard(k, -2.6, 1.3);
    k.torus('#c9b48a', 0.35, 0.05, [-2.6, 0.5, 1.3], { rot: [Math.PI / 2, 0, 0], rs: 3, ts: 8 });
  } else {
    crate(k, -1.6, 0, -0.4, 1.4, '#a8865e', 0.05); crate(k, -0.2, 0, -0.6, 1.1, '#8a7a5a', -0.1); crate(k, -1.5, 1.12, -0.4, 1.0, '#b49a74', 0.2);
    drum(k, 0.9, 0.5, '#9c4a32'); drum(k, 1.5, 0.6, '#3e5a7a'); drum(k, 1.2, 1.1, '#5f6468');
    // navigation buoy: float + cone top + cage + lamp
    k.cyl('#b8402e', 0.6, 0.7, 0.8, [2.3, 0, -0.6], { base: true, seg: 9 });
    k.cyl('#e9e2cf', 0.61, 0.61, 0.18, [2.3, 0.55, -0.6], { seg: 9, open: true });
    k.cone('#b8402e', 0.45, 1.0, [2.3, 0.8, -0.6], { base: true, seg: 6 });
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; beam(k, '#3a3b3d', [2.3 + Math.cos(a) * 0.3, 1.2, -0.6 + Math.sin(a) * 0.3], [2.3 + Math.cos(a) * 0.15, 2.0, -0.6 + Math.sin(a) * 0.15], 0.04); }
    k.box('#e2b93b', [0.2, 0.25, 0.2], [2.3, 2.0, -0.6], { base: true });
    for (let i = 0; i < 9; i++) k.torus('#3a3b3d', 0.16, 0.05, [0.3 + (r() - 0.5) * 0.9, 0.05 + Math.floor(i / 4) * 0.08, 1.2 + (r() - 0.5) * 0.6], { rot: [Math.PI / 2 + (r() - 0.5), r() * 3, 0], rs: 3, ts: 6 });
    bollard(k, -2.6, 1.2); bollard(k, 2.8, 1.2);
  }
  k.blob('#6e6a62', 2.6, [0, 0.012, 0], { seg: 9, seed: 6730 + v, sx: 1.2, sz: 0.8, off: 0 });
  g.add(k.mesh('body'));
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// E29. HARBOUR CHANDLERY — SHIP SUPPLY. Ship-supply store lot (34 × 16), RV band z ∈ [−1, 8] kept clear.
// ═════════════════════════════════════════════════════════════════════════════
function chandleryAtlas() {
  return signTexture({
    key: 'atlas_chandlery', w: 1024, h: 512, bg: '#2f3d4a',
    draw: (ctx) => {
      const anchor = (x, y, s, col) => {
        ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 9 * s; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(x, y - 52 * s, 12 * s, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y - 40 * s); ctx.lineTo(x, y + 44 * s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 26 * s, y - 24 * s); ctx.lineTo(x + 26 * s, y - 24 * s); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y + 6 * s, 40 * s, 0.25, Math.PI - 0.25); ctx.stroke();
        for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + sx * 44 * s, y + 10 * s); ctx.lineTo(x + sx * 30 * s, y + 2 * s); ctx.lineTo(x + sx * 44 * s, y - 6 * s); ctx.fill(); }
      };
      // A: fascia (0,0)-(1024,160)
      ctx.fillStyle = '#e9e2cf'; ctx.fillRect(0, 0, 1024, 160);
      ctx.strokeStyle = '#2f3d4a'; ctx.lineWidth = 10; ctx.strokeRect(8, 8, 1008, 144);
      ctx.fillStyle = '#2f3d4a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      fitText(ctx, 'HARBOUR CHANDLERY', 512, 64, 760, 84, '900', FONTS.SERIF);
      ctx.fillStyle = '#a8382e'; fitText(ctx, '— SHIP SUPPLY —', 512, 126, 600, 40, '900', FONTS.SANS);
      anchor(80, 86, 0.9, '#2f3d4a'); anchor(944, 86, 0.9, '#2f3d4a');
      // B: pole sign (0,180)-(420,512)
      ctx.fillStyle = '#2f3d4a'; ctx.fillRect(0, 180, 420, 332);
      ctx.strokeStyle = '#e9e2cf'; ctx.lineWidth = 8; ctx.strokeRect(10, 190, 400, 312);
      anchor(210, 290, 1.1, '#e2b93b');
      ctx.fillStyle = '#e9e2cf'; fitText(ctx, 'HARBOUR', 210, 400, 360, 56, '900', FONTS.SERIF); fitText(ctx, 'CHANDLERY', 210, 456, 380, 52, '900', FONTS.SERIF);
      ctx.fillStyle = '#e2b93b'; fitText(ctx, 'ROPE · CHAIN · BAIT', 210, 494, 340, 22, '700', FONTS.SANS);
    },
  });
}
function anchorProp(k, x, z, s = 1, rotY = 0, col = '#3a3b3d') {
  k.at([x, 0, z], [0, rotY, 0], () => {
    k.box('#8f8b82', [1.4 * s, 0.3, 0.8 * s], [0, 0, 0], { base: true });
    k.box(col, [0.18 * s, 2.8 * s, 0.18 * s], [0, 0.3 + 0.3 * s, 0], { base: true });
    k.box(col, [1.4 * s, 0.14 * s, 0.14 * s], [0, 0.3 + 2.6 * s, 0]);
    k.torus(col, 0.22 * s, 0.05 * s, [0, 0.3 + 3.2 * s, 0], { rs: 3, ts: 8 });
    k.torus(col, 0.9 * s, 0.09 * s, [0, 0.3 + 1.2 * s, 0], { rs: 4, ts: 10, arc: Math.PI, rot: [0, 0, Math.PI] });
    for (const sx of [-1, 1]) k.cone(col, 0.22 * s, 0.6 * s, [sx * 0.86 * s, 0.3 + 1.4 * s, 0], { seg: 4, rot: [0, 0, -sx * 0.5] });
  });
}
export function buildStoreChandlery() {
  const W = 34, D = 16;
  const g = root('store_chandlery', 0, { w: W, h: 10, l: D });
  const k = new Kit(6800); k.floor = 0;
  lotSlab(k, W, D, '#7d786e');
  const bw = 20, bd = 6.5, bh = 6.0, bx = -2, bz = -8 + bd / 2 + 0.2, fz = bz + bd / 2;
  const boards = '#6f8494', trim = '#e9e4d6', roof = '#4f5458';
  k.box(boards, [bw, bh, bd], [bx, 0, bz], { base: true });
  const F = walls(bw, bd, bx, bz);
  for (const f of Object.values(F)) { for (let y = 0.7; y < bh - 0.1; y += 0.3) wr(k, f, [f.u[0] + 0.05, f.u[1] - 0.05], [y - 0.025, y], shade(boards, 0.86), 0.008); band(k, f, 0, 0.5, '#5a5a56', 0.012); }
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) k.box(trim, [0.18, bh, 0.18], [bx + sx * (bw / 2 - 0.02), 0, bz + sz * (bd / 2 - 0.02)], { base: true });
  // gable roof (ridge along X) + front cross-gable dormer with a ship's wheel
  const rh = 2.6, o = 0.5, e = bd / 2 + o, sl = rh / (bd / 2), ye = bh - o * sl;
  k.extrude((cx, cy, cz, nx, ny) => (ny < -0.3 ? '#3a3b3c' : roof), [[-e, ye], [0, bh + rh], [e, ye], [e, ye + 0.16], [0, bh + rh + 0.18], [-e, ye + 0.16]], bw + 0.8, { axis: 'x', pos: [bx, 0, bz] });
  k.extrude(boards, [[-bd / 2, bh - 0.02], [bd / 2, bh - 0.02], [0, bh + rh - 0.05]], bw, { axis: 'x', pos: [bx, 0, bz] });
  k.box(boards, [5, 2.2, 2.2], [bx, bh - 0.4, fz - 1.0], { base: true });
  k.extrude(boards, [[-2.5, bh + 1.78], [2.5, bh + 1.78], [0, bh + 3.2]], 2.2, { axis: 'z', pos: [bx, 0, fz - 1.0] });
  k.extrude(roof, [[-2.9, bh + 1.6], [0, bh + 3.45], [2.9, bh + 1.6], [2.9, bh + 1.78], [0, bh + 3.65], [-2.9, bh + 1.78]], 2.6, { axis: 'z', pos: [bx, 0, fz - 1.0] });
  k.rectZ(C.glassB, fz + 0.11, [bx - 1.6, bx + 1.6], [bh + 0.1, bh + 1.4], 1, { off: 0.01 });
  k.torus('#8a6a4a', 0.55, 0.06, [bx, bh + 2.3, fz + 0.12], { rs: 3, ts: 10 });
  for (let i = 0; i < 4; i++) k.box('#8a6a4a', [0.06, 1.4, 0.06], [bx, bh + 2.3, fz + 0.14], { rot: [0, 0, i * Math.PI / 4] });
  // shopfront: display windows, red double doors, lifebuoys, oars, porch + lean-to roof
  for (const u of [bx - 6.5, bx - 3.6, bx + 3.6, bx + 6.5]) { wr(k, F.front, [u - 1.2, u + 1.2], [0.8, 2.8], trim, 0.012); wr(k, F.front, [u - 1.05, u + 1.05], [0.95, 2.65], u > bx ? '#41505a' : C.lit, 0.02); wr(k, F.front, [u - 0.03, u + 0.03], [0.95, 2.65], trim, 0.026); }
  wr(k, F.front, [bx - 1.1, bx + 1.1], [0.3, 2.8], trim, 0.012);
  wr(k, F.front, [bx - 0.95, bx + 0.95], [0.3, 2.65], '#9c3a2e', 0.02);
  wr(k, F.front, [bx - 0.03, bx + 0.03], [0.3, 2.65], '#6a2a22', 0.026);
  const ring = (x, y, z, rotY = 0) => k.at([x, y, z], [0, rotY, 0], () => k.torus((cx, cy) => (Math.atan2(cy, cx) + Math.PI) % (Math.PI / 2) < Math.PI / 4 ? '#c4402e' : '#efe9dc', 0.36, 0.09, [0, 0, 0], { rs: 4, ts: 12 }));
  ring(bx - 8.7, 2.0, fz + 0.1); ring(bx + 8.7, 2.0, fz + 0.1);
  for (const s of [-1, 1]) k.box('#b5976f', [0.1, 2.6, 0.05], [bx + 5.05, 3.0, fz + 0.06], { rot: [0, 0, s * 0.5] });
  k.box('#8a7a64', [bw + 0.6, 0.3, 2.4], [bx, 0, fz + 1.2], { base: true });
  for (let i = 0; i <= 6; i++) k.box(trim, [0.16, 3.0, 0.16], [bx - bw / 2 + 0.2 + i * (bw - 0.4) / 6, 0.3, fz + 2.25], { base: true });
  k.box(shade(roof, 1.1), [bw + 0.8, 0.12, 2.8], [bx, 3.45, fz + 1.3], { rot: [0.18, 0, 0] });
  for (let i = 0; i < 5; i++) k.ico(['#c9703a', '#e2b93b', '#3f7470', '#b8402e', '#e9e2cf'][i], 0.16, [bx - bw / 2 + 0.2 + (i + 1) * (bw - 0.4) / 6, 2.6, fz + 2.35], { detail: 0 });
  ropeCoil(k, bx - 4.6, fz + 1.3, 1.0); ropeCoil(k, bx - 3.4, fz + 1.5, 0.8, '#b8a47a'); ropeCoil(k, bx + 4.8, fz + 1.4, 0.9);
  // storage shed (+X) with roll door
  const sx = 13, sz = -5;
  k.box(PAL.corrugated, [7, 4.2, 6], [sx, 0, sz], { base: true });
  const S = walls(7, 6, sx, sz);
  for (const f of [S.front, S.left]) ribs(k, f, 0, 4.2, PAL.corrugated, 0.5);
  rollDoor(k, S.front, sx, 4.0, 3.2, '#9a968c');
  k.box(shade(PAL.corrugated, 0.85), [7.6, 0.12, 6.6], [sx, 4.3, sz], { rot: [0.08, 0, 0] });
  // forecourt display at the lot edges: anchors, cable drums, traps, chain, dinghy
  anchorProp(k, -15.2, 2.6, 1.0, 0.3); anchorProp(k, 15.4, 2.0, 0.8, -0.4, '#5a4a3c');
  for (let i = 0; i < 2; i++) { const x = -15.4, z = 5.4 + i * 1.6; k.cyl('#8a6a4a', 0.75, 0.75, 0.08, [x - 0.5, 0.75, z], { axis: 'x', seg: 10 }); k.cyl('#8a6a4a', 0.75, 0.75, 0.08, [x + 0.5, 0.75, z], { axis: 'x', seg: 10 }); k.cyl(i ? '#c9b48a' : '#4f6b4a', 0.5, 0.5, 0.95, [x, 0.75, z], { axis: 'x', seg: 10 }); }
  for (let i = 0; i < 3; i++) { k.box('#6d7a72', [0.95, 0.6, 0.8], [-14.6, i * 0.6, -3.0], { base: true }); k.rectZ('#3a3f3c', -2.59, [-15.0, -14.2], [i * 0.6 + 0.06, i * 0.6 + 0.54], 1, { off: 0.006 }); }
  for (let i = 0; i < 8; i++) k.torus('#3a3b3d', 0.18, 0.06, [-12.8 + (i % 4) * 0.25, 0.06 + Math.floor(i / 4) * 0.1, -2.2], { rot: [Math.PI / 2, 0, i * 0.4], rs: 3, ts: 6 });
  // dinghy on blocks
  k.at([14.6, 0.35, 5.6], [0, 0.15, 0], () => {
    const defs = [[-1.8, 0.65, 0.1, 0.5, 0.75], [-0.6, 0.78, 0, 0.45, 0.7], [0.6, 0.72, 0, 0.45, 0.72], [1.5, 0.45, 0.1, 0.5, 0.8], [2.0, 0.04, 0.35, 0.6, 0.9]];
    hullLoft(k, hullStations(defs, 0.22, 0.05), { bottom: '#e9e2cf', boot: '#3f7470', hull: '#e9e2cf', inner: '#b5976f', deck: '#8a6a4a', cap: '#3f7470' });
    for (const z of [-0.9, 0.9]) k.box('#5e4632', [0.3, 0.35, 0.3], [0, -0.35, z], { base: true });
    k.box('#b5976f', [1.3, 0.05, 0.3], [0, 0.45, 0.3]);
  });
  // roadside pole sign at the −X front corner
  signPole(k, -15.6, 7.2, 6.4, '#3a3b3d', 0.3);
  k.box('#2f3d4a', [3.2, 2.6, 0.3], [-15.6, 6.0, 7.2], { base: true });
  g.add(k.mesh('body'));
  const A = (a, b, c, d) => atlasUV(a, b, c, d, 1024, 512);
  multiPanel(g, chandleryAtlas(), [
    { p: [bx, 4.55, fz + 0.03], w: 13.6, h: 2.12, uv: A(0, 0, 1024, 160) },
    { p: [-15.6, 7.3, 7.37], w: 3.0, h: 2.37, uv: A(0, 180, 420, 512) },
  ], { fallback: '#e9e2cf' });
  return g;
}

export const BUILDERS = {
  dock_warehouse: { build: () => buildDockWarehouse(), variants: 1 },
  container_stack: { build: (v) => buildContainerStack(v), variants: 4 },
  gantry_crane: { build: () => buildGantryCrane(), variants: 1 },
  lighthouse: { build: () => buildLighthouse(), variants: 1 },
  fishing_boat: { build: (v) => buildFishingBoat(v), variants: 2 },
  cargo_ship: { build: () => buildCargoShip(), variants: 1 },
  drawbridge: { build: () => buildDrawbridge(), variants: 1 },
  bollard_crates: { build: (v) => buildBollardCrates(v), variants: 3 },
  store_chandlery: { build: () => buildStoreChandlery(), variants: 1 },
};
