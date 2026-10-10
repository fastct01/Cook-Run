// ─────────────────────────────────────────────────────────────────────────────
// City Areas expansion — D. Old Town (art agent: city).
//   loft (4), market_stall (4), clock_tower, diner, streetcar_stop, bunting, store_market
// Facades face local +Z (the road). Origin = ground centre of the footprint.
// ─────────────────────────────────────────────────────────────────────────────
import {
  THREE, Kit, root, rng, empty, PAL, mix, shade, walls, wr, windowGrid, band, parapet, C, vwrap, TAU,
  fp, fbox, wpoly, archPts, beam, rod, railing, patches, streaks, rollDoor, steelWindow, fireEscape,
  acUnit, roofTank, vent, drum, crate, pallet, lotSlab, signPole, addPanel, multiPanel, atlasUV, panel,
  paintedWallSign, neonSign, textSign, signTexture, fitText, muralTexture, clockDial, FONTS,
} from './city-kit.js';

// ── shared: fabric awning (sloped, striped, with a valance), built against a +Z face ──
function awning(k, x, y, z, w, depth, cols, o = {}) {
  const drop = o.drop ?? 0.7, n = Math.max(2, Math.round(w / 0.55)), a = Math.atan2(drop, depth);
  const L = Math.hypot(drop, depth);
  k.at([x, y, z], [a, 0, 0], () => {
    k.box(cols[0], [w, 0.05, L], [0, 0, L / 2]);
    for (let i = 0; i < n; i += 2) k.rectY(cols[1], 0.026, [-w / 2 + (i / n) * w, -w / 2 + ((i + 1) / n) * w], [0, L], { off: 0.002 });
  });
  const fz = z + depth, fy = y - drop;
  k.box(cols[0], [w, 0.32, 0.04], [x, fy - 0.16, fz]);
  for (let i = 0; i < n; i++) { // scalloped valance points
    const x0 = x - w / 2 + (i / n) * w, x1 = x0 + w / n;
    k.poly(i % 2 ? cols[1] : cols[0], [[x0, fy - 0.32, fz + 0.025], [x1, fy - 0.32, fz + 0.025], [(x0 + x1) / 2, fy - 0.48, fz + 0.025]], { facing: [0, 0, 1] });
  }
  if (o.arms !== false) for (const s of [-1, 1]) beam(k, C.iron, [x + s * (w / 2 - 0.1), y - 0.9, z + 0.02], [x + s * (w / 2 - 0.1), fy, fz - 0.05], 0.03);
  return k;
}

// ═════════════════════════════════════════════════════════════════════════════
// D14. Loft — 3–5 storey brick loft, mural on the +X side wall, black fire escape, two shopfronts.
// ═════════════════════════════════════════════════════════════════════════════
const LOFT = [
  { W: 14, floors: 4, brick: '#9a5844', mural: 0, aw: [['#3f7470', '#e9e2cf'], ['#d9a83a', '#efe6cf']], shops: ['SAGEBRUSH RECORDS', 'MESA TAILORS'], tank: true, style: 'red brick' },
  { W: 12, floors: 3, brick: '#b98d66', mural: 1, aw: [['#9c4a32', '#e9e2cf'], ['#4f6b4a', '#e2d3b0']], shops: ['TERRA COTTA CAFE', 'PINTO PAWN & LOAN'], tank: false, style: 'tan brick' },
  { W: 16, floors: 5, cols: 4, ww: 1.9, brick: '#7a4434', mural: 2, aw: [['#2c3a52', '#d9cfb3'], ['#a8382e', '#efe6cf']], shops: ['HOLLIS HARDWARE', 'OLD TOWN BARBER'], tank: true, style: 'dark brick' },
  { W: 13, floors: 4, brick: '#d2c09a', mural: 3, aw: [['#c9963a', '#efe6cf'], ['#3f7470', '#d9cfb3']], shops: ['DUSTBOWL BOOKS', 'PALO VERDE BAKERY'], tank: false, style: 'painted brick' },
];
export function buildLoft(variant = 0) {
  const v = vwrap(variant, 4), s = LOFT[v];
  const W = s.W, D = 14, gf = 4.4, fh = 3.6, H = gf + fh * (s.floors - 1), zc = -0.8, fz = zc + D / 2;
  const g = root('loft', v, { w: W + 1.4, h: H + 4, l: D + 2.4 }, { style: s.style });
  const k = new Kit(5000 + v); k.floor = 0;
  const brick = s.brick, trim = v === 3 ? '#8a6a4a' : C.lintel;
  k.box(brick, [W, H, D], [0, 0, zc], { base: true });
  const F = walls(W, D, 0, zc);
  // ground floor: two shopfronts with display windows, transoms, recessed doors, fascia + awnings
  const sw = W / 2;
  wr(k, F.front, [-W / 2, W / 2], [0, gf - 0.2], '#3a3632', 0.008);
  for (let i = 0; i < 2; i++) {
    const cx = -W / 2 + sw * (i + 0.5);
    wr(k, F.front, [cx - sw / 2 + 0.35, cx + sw / 2 - 0.35], [0, 0.5], shade(s.aw[i][0], 0.7), 0.014);
    wr(k, F.front, [cx - sw / 2 + 0.35, cx + sw / 2 - 0.35], [0.5, 2.9], i === 0 ? C.lit : '#41505a', 0.018);
    wr(k, F.front, [cx - sw / 2 + 0.35, cx + sw / 2 - 0.35], [2.95, 3.35], '#6d7a7c', 0.018);
    const du = i === 0 ? cx + sw / 2 - 1.35 : cx - sw / 2 + 1.35;
    wr(k, F.front, [du - 0.6, du + 0.6], [0, 2.9], '#2b2622', 0.024);
    wr(k, F.front, [du - 0.45, du + 0.45], [0.2, 2.75], shade(s.aw[i][0], 0.8), 0.03);
    wr(k, F.front, [du - 0.3, du + 0.3], [1.3, 2.5], '#3a464c', 0.034);
    // goods silhouettes in the window
    const r = rng(5010 + v * 3 + i);
    for (let j = 0; j < 4; j++) { const x = cx - sw / 2 + 0.7 + j * 0.8; if (Math.abs(x - du) < 0.9) continue; wr(k, F.front, [x, x + 0.4 + r() * 0.3], [0.55, 0.9 + r() * 1.0], ['#6a4a3a', '#2f3d55', '#8a7a4a', '#9c3a2e'][j], 0.024); }
    awning(k, cx, 3.45, fz, sw - 0.8, 1.6, s.aw[i], { drop: 0.75 });
  }
  for (const x of [-W / 2 + 0.15, 0, W / 2 - 0.15]) fbox(k, '#3a3632', F.front, x, gf / 2 - 0.1, 0.4, gf - 0.2, 0.12, 0.06);
  band(k, F.front, gf - 0.2, gf + 0.15, trim, 0.03);
  // upper floors: tall steel windows with segmental heads, brick piers, cornice
  const n = s.cols || Math.max(3, Math.round(W / 3.3)), L = W - 1.6;
  for (let f = 0; f < s.floors - 1; f++) {
    const y = gf + f * fh + 0.75;
    for (let i = 0; i < n; i++) { const u = -W / 2 + 0.8 + (i + 0.5) * L / n; steelWindow(k, F.front, u, y, s.ww || 1.5, 2.3, { arch: 0.25, archSeg: 3, seed: 5020 + v * 31 + f * 7 + i, cols: 2, rows: 3, lit: 0.45, odd: 0.15, lintel: trim }); }
  }
  for (let i = 1; i < n; i++) fbox(k, shade(brick, 1.06), F.front, -W / 2 + 0.8 + (i / n) * L, (gf + H) / 2, 0.35, H - gf, 0.14, 0.07);
  k.box(trim, [W + 0.5, 0.35, D + 0.3], [0, H - 0.9, zc], { base: true });
  k.box(shade(brick, 0.9), [W + 0.2, 0.55, D + 0.1], [0, H - 0.55, zc], { base: true });
  k.box(v === 2 ? '#3a3b3d' : trim, [W + 0.7, 0.3, D + 0.5], [0, H, zc], { base: true });
  if (v === 2) for (let i = 0; i <= 5; i++) k.box('#3a3b3d', [0.15, 0.5, 0.35], [-W / 2 + 0.2 + i * (W - 0.4) / 5, H - 0.5, fz + 0.2], { base: true });
  parapet(k, W, D, H + 0.3, 0.5, 0.25, brick, 0, zc);
  // back + −X side windows (plain), grime, patches, ghost ad
  windowGrid(k, F.back, Array.from({ length: s.floors - 1 }, (_, f) => [gf + f * fh + 0.8, gf + f * fh + 2.8]), n, 1.3, { lit: 0.2, seed: 5040 + v, margin: 1 });
  windowGrid(k, F.right, Array.from({ length: s.floors - 1 }, (_, f) => [gf + f * fh + 0.8, gf + f * fh + 2.8]), 3, 1.2, { sill: trim, lit: 0.25, seed: 5041 + v, margin: 1.4, skip: (i) => i === 2 });
  // faded ghost advertisement on the blind bay of the −X wall
  const gu0 = zc + 1.6, gu1 = zc + D / 2 - 0.8, gy0 = H - 1.2 - Math.min(6, (s.floors - 1) * fh - 1), gy1 = H - 1.2;
  wr(k, F.right, [gu0, gu1], [gy0, gy1], mix(brick, '#e2d3b0', 0.32), 0.012);
  wr(k, F.right, [gu0 + 0.3, gu1 - 0.3], [gy1 - 1.4, gy1 - 0.4], mix(brick, '#3f6f6b', 0.45), 0.016);
  for (let i = 0; i < 3; i++) wr(k, F.right, [gu0 + 0.5, gu1 - 0.5 - i * 0.8], [gy0 + 0.6 + i * 0.75, gy0 + 1.0 + i * 0.75], mix(brick, '#9c3a2e', 0.4), 0.016);
  band(k, F.right, gf - 0.2, gf + 0.15, trim, 0.02);
  for (const f of [F.left, F.right, F.back]) { band(k, f, 0, 0.9, mix(brick, C.dirt, 0.35), 0.008); patches(k, f, 4, 1, H - 1, brick, 5050 + v + f.at); streaks(k, f, 4, 1, H, shade(brick, 0.85), 5060 + v + f.at, 0.2); }
  // fire escape on the front
  fireEscape(k, F.front, W / 2 - 3.3 - (v === 1 ? 0.3 : 0), s.floors - 1, fh, { y0: gf, width: 3.0, depth: 1.0, drop: 0.9 });
  // roof: tank / AC / skylight / chimney
  if (s.tank) roofTank(k, -W / 2 + 3, H + 0.3, zc - 3, 1.3, 2.2, 1.8);
  acUnit(k, W / 2 - 2.5, H + 0.3, zc - 2, 1.0);
  k.box('#5f7078', [2.2, 0.6, 1.6], [0.5, H + 0.3, zc + 2.5], { base: true });
  k.box(shade(brick, 0.85), [0.8, 1.6, 0.8], [W / 2 - 1.2, H + 0.3, zc - D / 2 + 1.5], { base: true });
  g.add(k.mesh('body'));
  // mural on the +X side wall + fascia sign (two shop names)
  const mh = Math.min(H - gf - 1.4, (D - 1.6) / 0.8), mw = mh * 0.8;
  addPanel(g, muralTexture(s.mural), mw, mh, [W / 2 + 0.02, gf + 0.6 + mh / 2, zc - 0.2], Math.PI / 2, { fallback: '#c98a5c' });
  const tex = signTexture({
    key: 'sign_loft_' + v, w: 1024, h: 80, bg: '#2a2622',
    draw: (ctx, Wc, Hc) => {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      s.shops.forEach((t, i) => { ctx.fillStyle = i ? '#e2c47a' : '#efe6cf'; fitText(ctx, t, Wc * (0.25 + i * 0.5), Hc * 0.56, Wc * 0.44, 48, '900', i ? FONTS.SERIF : FONTS.SANS); });
      ctx.fillStyle = '#6a5a48'; ctx.fillRect(Wc / 2 - 3, 6, 6, Hc - 12);
    },
  });
  addPanel(g, tex, W - 0.6, (W - 0.6) * 80 / 1024, [0, 3.85, fz + 0.04]);
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// D15. Market stall — awning stall. v0 produce, v1 jars & honey, v2 rugs, v3 chilies & pottery.
// ═════════════════════════════════════════════════════════════════════════════
const STALL = [
  { aw: ['#a8382e', '#e9e2cf'], style: 'produce' },
  { aw: ['#3f7470', '#e9e2cf'], style: 'jars & honey' },
  { aw: ['#c9963a', '#efe6cf'], style: 'rugs' },
  { aw: ['#4f6b4a', '#e2d3b0'], style: 'chilies & pottery' },
];
/** Adds one stall (≈3.2 × 2.2 m, front +Z) into kit k at (x, z) turned rotY. lod 1 = simplified (for store lots). */
export function stallInto(k, x, z, rotY, v, lod = 0) {
  const s = STALL[vwrap(v, 4)], r = rng(5100 + v * 13 + lod);
  const wood = '#8a6a4a', w = 3.2, d = 2.0;
  k.at([x, 0, z], [0, rotY, 0], () => {
    for (const [a, b, h] of [[-1, -1, 2.55], [1, -1, 2.55], [-1, 1, 2.25], [1, 1, 2.25]]) k.box(wood, [0.08, h, 0.08], [a * (w / 2 - 0.05), 0, b * (d / 2 - 0.05)], { base: true });
    k.box(shade(wood, 1.1), [w, 0.08, 1.0], [0, 0.82, d / 2 - 0.55], { base: true });
    k.box(s.aw[1], [w - 0.1, 0.6, 0.03], [0, 0.22, d / 2 - 0.06], { base: true });
    for (let i = 0; i < 6; i += 2) k.rectZ(s.aw[0], d / 2 - 0.045, [-w / 2 + 0.05 + i * (w - 0.1) / 6, -w / 2 + 0.05 + (i + 1) * (w - 0.1) / 6], [0.22, 0.82], 1, { off: 0.004 });
    k.box(shade(wood, 0.9), [w, 0.06, 0.6], [0, 1.25, -d / 2 + 0.35], { base: true });
    awning(k, 0, 2.6, -d / 2, w + 0.3, d + 0.45, s.aw, { drop: 0.45, arms: false });
    const cy = 0.9, cz = d / 2 - 0.55;
    if (s.style === 'produce') {
      const fills = ['#d9822b', '#b8402e', '#c9a02a', '#6f8c4a', '#5a3a5a', '#e0c45a'];
      for (let i = 0; i < 6; i++) {
        const cx = -w / 2 + 0.3 + i * 0.52;
        k.at([cx, cy, cz], [-0.25, 0, 0], () => {
          k.box('#b49a74', [0.48, 0.2, 0.7], [0, 0, 0], { base: true });
          k.rectY(fills[i], 0.2, [-0.21, 0.21], [-0.32, 0.32], { off: 0.002 });
          if (!lod) for (let j = 0; j < 2; j++) k.ico(fills[i], 0.09, [(j - 0.5) * 0.18, 0.24, (r() - 0.5) * 0.4], { detail: 0, jit: 0.15 });
        });
      }
      for (let i = 0; i < (lod ? 2 : 3); i++) crate(k, -0.9 + i * 0.95, 0, -0.35, 0.75, '#a8865e', (r() - 0.5) * 0.2);
      k.box('#2a2b2d', [0.5, 0.7, 0.03], [w / 2 + 0.35, 0, d / 2 + 0.2], { base: true, rot: [-0.25, 0.3, 0] });
    } else if (s.style === 'jars & honey') {
      const jc = ['#c98a2a', '#a8382e', '#d9a83a', '#6f8c4a', '#b8642e'];
      for (let t = 0; t < (lod ? 1 : 2); t++) {
        const y = cy + 0.08 + t * 0.32, zz = cz - 0.15 - t * 0.3;
        if (t) k.box(shade(wood, 1.1), [w - 0.4, 0.04, 0.3], [0, y - 0.04, zz], { base: true });
        for (let i = 0; i < 9; i++) { const col = jc[(i + t) % 5]; k.cyl((cx, cy2, cz2, nx, ny) => (ny > 0.5 ? '#d9cfb3' : col), 0.08, 0.08, 0.2, [-w / 2 + 0.35 + i * 0.32, y, zz + (i % 2) * 0.12], { base: true, seg: 6 }); }
      }
      for (let i = 0; i < 4; i++) k.box('#b49a74', [0.5, 0.3, 0.35], [-1.2 + i * 0.8, 0, -0.3], { base: true });
      k.lathe('#c98a2a', [[0.0, 0], [0.22, 0.05], [0.26, 0.25], [0.15, 0.42], [0.0, 0.44]], 7, [w / 2 - 0.4, cy + 0.08, cz]);
    } else if (s.style === 'rugs') {
      const rc = [['#9c3a2e', '#d9a83a'], ['#2f3d55', '#c9b48a'], ['#3f7470', '#e2d3b0'], ['#7a3a3a', '#e9c47a']];
      for (let i = 0; i < (lod ? 2 : 4); i++) {
        const [a, b] = rc[i], rx = -w / 2 + 0.45 + i * 0.78;
        k.box(a, [0.68, 1.22, 0.03], [rx, 0.85, d / 2 + 0.28], { base: true });
        for (let j = 0; j < 4; j++) k.rectZ(b, d / 2 + 0.296, [rx - 0.34, rx + 0.34], [1.0 + j * 0.32, 1.08 + j * 0.32], 1, { off: 0.002 });
      }
      k.box('#2a2b2d', [w + 0.1, 0.04, 0.04], [0, 2.08, d / 2 + 0.28]);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) k.box(rc[(i + j) % 4][j % 2], [0.6, 0.09, 0.45], [-w / 2 + 0.45 + i * 0.75, cy + 0.08 + j * 0.09, cz - 0.1], { base: true });
    } else {
      for (let i = 0; i < (lod ? 2 : 4); i++) { // hanging chili ristras
        const rx = -w / 2 + 0.5 + i * 0.73;
        k.cyl('#7a5a3a', 0.008, 0.008, 1.0, [rx, 1.1, d / 2 + 0.15], { base: true, seg: 3 });
        for (let j = 0; j < (lod ? 4 : 6); j++) k.cone(j % 3 ? '#a8302a' : '#8a2422', 0.07, 0.18, [rx + (j % 2 ? 0.05 : -0.05), 1.15 + j * 0.15, d / 2 + 0.15], { seg: 4, rot: [Math.PI, 0, 0] });
      }
      const pot = (px, py, pz, sc, col) => k.lathe(col, [[0, 0], [0.18 * sc, 0.02], [0.26 * sc, 0.2 * sc], [0.17 * sc, 0.4 * sc], [0.12 * sc, 0.46 * sc]], 7, [px, py, pz]);
      for (let i = 0; i < 5; i++) pot(-w / 2 + 0.4 + i * 0.6, cy + 0.08, cz, 0.7 + (i % 2) * 0.3, ['#b8643f', '#9a5844', '#c98a5c', '#3f7470', '#d9b98a'][i]);
      if (!lod) for (let i = 0; i < 3; i++) pot(-1.0 + i * 1.0, 0, d / 2 + 0.45, 1.6, ['#b8643f', '#9a5844', '#c98a5c'][i]);
    }
  });
  return k;
}
export function buildMarketStall(variant = 0) {
  const v = vwrap(variant, 4);
  const g = root('market_stall', v, { w: 3.6, h: 2.75, l: 3.0 }, { style: STALL[v].style });
  const k = new Kit(5100 + v); k.floor = 0;
  stallInto(k, 0, -0.2, 0, v);
  k.blob('#8f8a7f', 1.9, [0, 0.012, 0], { seg: 9, seed: 5110 + v, sx: 1.1, off: 0 });
  g.add(k.mesh('body'));
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// D16. Clock tower — town-hall tower, ~26 m. `hand_h` / `hand_m` rotate on z (front dial, +Z).
//   rotation.z = −2π·(minutes/60) for hand_m, −2π·((hours % 12) + minutes/60)/12 for hand_h (clockwise seen from +Z).
// ═════════════════════════════════════════════════════════════════════════════
export function buildClockTower() {
  const S = 6.4, brick = '#a8664c', stone = '#cbbfa5', patina = '#6f9a8a';
  const g = root('clock_tower', 0, { w: 8.4, h: 25.8, l: 8.4 });
  const k = new Kit(5200); k.floor = 0;
  k.box(stone, [8.2, 1.2, 8.2], [0, 0, 0], { base: true });
  k.box(shade(stone, 0.9), [8.4, 0.3, 8.4], [0, 0, 0], { base: true });
  k.box(brick, [S, 11.3, S], [0, 1.2, 0], { base: true });
  const F = walls(S, S);
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) k.box(stone, [0.7, 11.3, 0.7], [a * (S / 2 - 0.2), 1.2, b * (S / 2 - 0.2)], { base: true });
  for (const f of Object.values(F)) {
    for (const y of [5.0, 8.8]) { wpoly(k, f, archPts(-0.45, 0.45, y, y + 1.8, 0.45), stone, 0.012); wpoly(k, f, archPts(-0.32, 0.32, y + 0.08, y + 1.8, 0.32), '#2f3a42', 0.02); }
    band(k, f, 4.4, 4.7, stone, 0.02);
    patches(k, f, 3, 2, 11.5, brick, 5201 + f.at);
    band(k, f, 1.2, 2.0, mix(brick, C.dirt, 0.3), 0.008);
  }
  // door + plaque
  wpoly(k, F.front, archPts(-1.1, 1.1, 1.2, 3.4, 1.0), stone, 0.024);
  wpoly(k, F.front, archPts(-0.85, 0.85, 1.2, 3.4, 0.8), '#5e4632', 0.03);
  wr(k, F.front, [-0.03, 0.03], [1.2, 3.9], '#3a2e24', 0.034);
  for (let i = 0; i < 3; i++) k.box(shade(stone, 0.95 - i * 0.03), [3.2, 1.2 - i * 0.4, 0.4], [0, 0, S / 2 + 0.5 + i * 0.4], { base: true });
  // clock stage (stone) with corner pilasters, front dial, oculi on the other sides
  const cy0 = 12.5, cy1 = 16.2;
  k.box(stone, [S + 0.6, 0.5, S + 0.6], [0, cy0, 0], { base: true });
  k.box(stone, [S + 0.2, cy1 - cy0, S + 0.2], [0, cy0, 0], { base: true });
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) k.box(shade(stone, 1.05), [0.8, cy1 - cy0 + 0.3, 0.8], [a * (S / 2), cy0, b * (S / 2)], { base: true });
  const dialY = 14.35;
  k.cyl(shade(stone, 0.85), 1.75, 1.75, 0.2, [0, dialY, S / 2 + 0.12], { axis: 'z', seg: 16 });
  for (const [ax, sgn] of [['x', 1], ['x', -1], ['z', -1]]) {
    const pos = ax === 'x' ? [sgn * (S / 2 + 0.12), dialY, 0] : [0, dialY, sgn * (S / 2 + 0.12)];
    k.cyl(shade(stone, 0.85), 1.4, 1.4, 0.2, pos, { axis: ax, seg: 12 });
    k.cyl('#2f3a42', 1.1, 1.1, 0.24, pos, { axis: ax, seg: 12 });
  }
  k.box(shade(stone, 1.05), [S + 0.8, 0.45, S + 0.8], [0, cy1, 0], { base: true });
  // belfry with arched openings + bell, small balustrade, pyramid spire, finial, weathervane
  const by0 = cy1 + 0.45, by1 = by0 + 3.1, bs = S - 0.4;
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) k.box(brick, [1.3, by1 - by0, 1.3], [a * (bs / 2 - 0.65), by0, b * (bs / 2 - 0.65)], { base: true });
  k.box(stone, [bs, 0.6, bs], [0, by1 - 0.6, 0], { base: true });
  for (const f of Object.values(walls(bs, bs))) wpoly(k, f, [[-bs / 2 + 1.3, by1 - 0.6], [bs / 2 - 1.3, by1 - 0.6], [bs / 2 - 1.3, by1 - 1.0], [0, by1 - 1.5], [-bs / 2 + 1.3, by1 - 1.0]], stone, 0.001);
  k.box('#4a4038', [0.15, 0.6, 0.15], [0, by1 - 1.2, 0], { base: true });
  k.lathe('#9a7a3a', [[0, 0], [0.75, 0.05], [0.6, 0.6], [0.35, 1.1], [0, 1.2]], 8, [0, by1 - 2.45, 0]);
  railing(k, stone, [-S / 2 - 0.3, by0, S / 2 + 0.3], [S / 2 + 0.3, by0, S / 2 + 0.3], 0.7, { step: 1.1, t: 0.12, noMid: true });
  railing(k, stone, [-S / 2 - 0.3, by0, -S / 2 - 0.3], [S / 2 + 0.3, by0, -S / 2 - 0.3], 0.7, { step: 1.1, t: 0.12, noMid: true });
  k.box(shade(stone, 1.05), [bs + 0.5, 0.35, bs + 0.5], [0, by1, 0], { base: true });
  k.cone(patina, bs * 0.74, 4.4, [0, by1 + 0.35, 0], { base: true, seg: 4, rot: [0, Math.PI / 4, 0] });
  for (const [ax, sgn] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]]) { // dormers on the spire
    const p = ax === 'x' ? [sgn * 1.5, by1 + 1.2, 0] : [0, by1 + 1.2, sgn * 1.5];
    k.box(patina, ax === 'x' ? [0.9, 1.1, 0.8] : [0.8, 1.1, 0.9], p, { base: true });
    k.box('#2f3a42', ax === 'x' ? [0.92, 0.6, 0.5] : [0.5, 0.6, 0.92], [p[0], p[1] + 0.25, p[2]], { base: true });
  }
  k.cyl('#5d6367', 0.05, 0.08, 1.6, [0, by1 + 4.5, 0], { base: true, seg: 5 });
  k.ico('#b39a6a', 0.2, [0, by1 + 5.0, 0]);
  k.box('#3a3b3d', [1.2, 0.05, 0.05], [0, by1 + 5.6, 0]);
  k.cone('#3a3b3d', 0.1, 0.25, [0.6, by1 + 5.6, 0], { seg: 3, rot: [0, 0, -Math.PI / 2] });
  k.box('#3a3b3d', [0.04, 0.3, 0.3], [-0.6, by1 + 5.6, 0]);
  g.add(k.mesh('body'));
  // dial (texture) + hands (named pivots, rotate on z; default 10:10)
  addPanel(g, clockDial(), 3.1, 3.1, [0, dialY, S / 2 + 0.235], 0, { cut: 0.5, fallback: '#ece4cc' });
  const hand = (name, len, wid, ang) => {
    const kh = new Kit(5210 + len * 10);
    kh.box('#1f1e1c', [wid, len, 0.04], [0, len / 2 - 0.15, 0]);
    kh.cone('#1f1e1c', wid * 1.3, 0.25, [0, len - 0.03, 0], { seg: 4 });
    kh.cyl('#1f1e1c', 0.1, 0.1, 0.05, [0, 0, 0], { axis: 'z', seg: 8 });
    const p = new THREE.Object3D();
    p.name = name; p.position.set(0, dialY, S / 2 + 0.29 + (name === 'hand_m' ? 0.05 : 0));
    p.rotation.z = ang;
    p.add(kh.mesh(name + '_mesh'));
    g.add(p);
  };
  hand('hand_h', 0.85, 0.11, -TAU * (10 + 10 / 60) / 12);
  hand('hand_m', 1.25, 0.07, -TAU * 10 / 60);
  g.userData.clock = { axis: 'z', centre: [0, dialY, S / 2 + 0.3], note: 'rotation.z = -2π·m/60 (hand_m), -2π·(h%12 + m/60)/12 (hand_h); 0 = 12 o\'clock' };
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// D17. Diner — chrome railcar diner with a roof-mounted neon "ROSIE'S DINER".
// ═════════════════════════════════════════════════════════════════════════════
export function buildDiner() {
  const L = 16, Dp = 6.2, y0 = 0.75, yw = 3.1, ytop = 4.25;
  const g = root('diner', 0, { w: L + 2, h: 6.6, l: Dp + 4 });
  const k = new Kit(5300); k.floor = 0;
  const chrome = '#c4c4bd', roofC = '#9fa09a', red = '#a8382e', teal = '#3f7470';
  // brick skirt + body (extruded barrel-roof profile along X)
  k.box('#8a5a44', [L - 0.4, y0, Dp - 0.4], [0, 0, 0], { base: true });
  const prof = [[-Dp / 2, y0], [Dp / 2, y0], [Dp / 2, yw]];
  for (let i = 1; i < 6; i++) { const a = (i / 6) * Math.PI; prof.push([Math.cos(a) * Dp / 2, yw + Math.sin(a) * (ytop - yw)]); }
  prof.push([-Dp / 2, yw]);
  k.extrude((cx, cy, cz, nx, ny) => (Math.abs(nx) > 0.7 ? shade(chrome, 0.92) : ny > 0.35 ? roofC : chrome), prof, L, { axis: 'x' });
  k.extrude(roofC, [[-Dp / 2 - 0.15, yw - 0.05], [Dp / 2 + 0.15, yw - 0.05], [Dp / 2 + 0.15, yw + 0.12], [-Dp / 2 - 0.15, yw + 0.12]], L + 0.3, { axis: 'x' });
  // fluting, enamel bands, window strip with lit interior + counter silhouettes
  for (const sd of [1, -1]) {
    const f = { axis: 'z', at: sd * Dp / 2, dir: sd, u: [-L / 2, L / 2] };
    for (let y = y0 + 0.12; y < 1.3; y += 0.13) wr(k, f, [-L / 2 + 0.2, L / 2 - 0.2], [y, y + 0.04], shade(chrome, 0.8), 0.01);
    wr(k, f, [-L / 2 + 0.1, L / 2 - 0.1], [1.3, 1.62], teal, 0.014);
    wr(k, f, [-L / 2 + 0.1, L / 2 - 0.1], [2.78, 3.1], red, 0.014);
    wr(k, f, [-L / 2 + 0.5, L / 2 - 0.5], [1.65, 2.75], '#f0d79a', 0.016);
    wr(k, f, [-L / 2 + 0.5, L / 2 - 0.5], [1.65, 1.85], '#6a4a3a', 0.02);
    for (let x = -L / 2 + 1; x < L / 2 - 0.6; x += 1.3) wr(k, f, [x, x + 0.35], [1.85, 2.25], '#3a3632', 0.02);
    for (let x = -L / 2 + 0.5; x <= L / 2 - 0.4; x += 0.9) wr(k, f, [x - 0.05, x + 0.05], [1.65, 2.75], '#9a9a94', 0.024);
  }
  for (const sx of [1, -1]) { const f = { axis: 'x', at: sx * L / 2, dir: sx, u: [-Dp / 2, Dp / 2] }; wr(k, f, [-1.6, 1.6], [1.65, 2.75], '#f0d79a', 0.016); for (let y = y0 + 0.12; y < 1.45; y += 0.13) wr(k, f, [-Dp / 2 + 0.2, Dp / 2 - 0.2], [y, y + 0.04], shade(chrome, 0.78), 0.01); }
  // entrance vestibule with glass-block corners, door, steps, flat canopy
  const vx = 2.8, vz = Dp / 2 + 0.75;
  k.box(chrome, [2.8, 3.0, 1.5], [vx, 0, vz], { base: true });
  const V = walls(2.8, 1.5, vx, vz);
  for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) { const u = vx + sx * 1.0 + (j - 1) * 0.27; wr(k, V.front, [u, u + 0.24], [0.9 + i * 0.32, 1.18 + i * 0.32], '#cfe0dc', 0.016); }
  wr(k, V.front, [vx - 0.55, vx + 0.55], [0.5, 2.6], '#4a5658', 0.016);
  wr(k, V.front, [vx - 0.45, vx + 0.45], [0.65, 2.45], '#f0d79a', 0.02);
  k.box(roofC, [3.4, 0.15, 2.2], [vx, 3.0, vz + 0.3], { base: true });
  for (let i = 0; i < 2; i++) k.box(C.concreteLight, [2.0, 0.5 - i * 0.25, 0.4], [vx, 0, vz + 0.95 + i * 0.4], { base: true });
  // roof: neon sign box on posts, exhaust hood, AC
  const sw = 7.4, sy = ytop + 0.5, sz = 0.6;
  for (const x of [-sw / 2 + 0.6, sw / 2 - 0.6]) { k.box('#3a3b3d', [0.16, sy - yw, 0.16], [x - 1, yw + 0.5, sz], { base: true }); }
  k.box('#2b2a26', [sw, 1.7, 0.35], [-1, sy, sz - 0.25], { base: true });
  k.box(red, [sw + 0.1, 0.15, 0.4], [-1, sy + 1.7, sz - 0.25], { base: true });
  k.box('#8f948f', [1.2, 0.7, 1.2], [5, ytop - 0.45, -1.2], { base: true });
  k.cyl('#7d8285', 0.25, 0.25, 0.8, [5, ytop + 0.2, -1.2], { base: true, seg: 6 });
  acUnit(k, -5.5, ytop - 0.4, -0.8, 0.9);
  // newspaper box, trash can, planters
  k.box('#2f5f8f', [0.5, 1.0, 0.45], [vx + 2.2, 0, Dp / 2 + 0.6], { base: true });
  k.cyl('#3e4a5a', 0.3, 0.3, 0.9, [vx - 2.2, 0, Dp / 2 + 0.6], { base: true, seg: 8 });
  for (const x of [-6, -3]) { k.box('#9a5844', [1.2, 0.5, 0.5], [x, 0, Dp / 2 + 0.4], { base: true }); k.ico('#6f8c4a', 0.4, [x, 0.7, Dp / 2 + 0.4], { detail: 0, scale: [1.4, 0.7, 0.8] }); }
  g.add(k.mesh('body'));
  const tex = neonSign('neon_rosies', [
    { text: "ROSIE'S", y: 0.4, px: 120, color: '#ff7a8a', family: 'Georgia,"DejaVu Serif",serif', weight: '700', maxW: 0.62 },
    { text: 'DINER', y: 0.8, px: 64, color: '#7ff0e0', maxW: 0.4 },
  ], { w: 1024, h: 240, bg: '#2b2a26', draw: (ctx, W, H) => { ctx.strokeStyle = '#ffd27a'; ctx.shadowColor = '#ffd27a'; ctx.shadowBlur = 10; ctx.lineWidth = 6; ctx.strokeRect(14, 14, W - 28, H - 28); } });
  addPanel(g, tex, sw - 0.2, 1.62, [-1, sy + 0.85, sz - 0.07], 0, { glow: 0.9, fallback: '#2b2a26' });
  const tex2 = neonSign('neon_open24', [{ text: 'OPEN 24 HRS', y: 0.55, px: 70, color: '#ff6a5a' }], { w: 512, h: 110, bg: '#2b2a26' });
  addPanel(g, tex2, 2.2, 0.47, [vx, 2.75, vz + 0.77], 0, { glow: 0.9, fallback: '#2b2a26' });
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// D18. Streetcar stop — shelter, bench, route map, stop pole, platform kerb.
// ═════════════════════════════════════════════════════════════════════════════
function streetcarAtlas() {
  return signTexture({
    key: 'atlas_streetcar', w: 512, h: 512, bg: '#e9e2cf',
    draw: (ctx) => {
      // A route map (0,0)-(384,512)
      ctx.fillStyle = '#2f4a3f'; ctx.fillRect(0, 0, 384, 70);
      ctx.fillStyle = '#efe6cf'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      fitText(ctx, 'STREETCAR LINES', 18, 36, 350, 36, '900', FONTS.SANS);
      const lines = [['#a8382e', [[40, 420], [120, 330], [200, 330], [280, 220], [340, 120]]], ['#d9a83a', [[40, 150], [140, 200], [200, 330], [300, 420]]], ['#3f7470', [[60, 260], [200, 330], [340, 300]]]];
      for (const [col, pts] of lines) { ctx.strokeStyle = col; ctx.lineWidth = 12; ctx.lineJoin = 'round'; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); for (const [x, y] of pts) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 3; ctx.stroke(); } }
      ctx.fillStyle = '#2a2622'; ctx.font = '700 18px Arial, sans-serif';
      for (const [t, x, y] of [['OLD TOWN', 210, 352], ['DOCKS', 290, 444], ['IRONWORKS', 30, 128], ['DOWNTOWN', 250, 100], ['MARKET', 60, 286]]) ctx.fillText(t, x, y);
      ctx.fillStyle = '#a8382e'; ctx.beginPath(); ctx.arc(200, 330, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a2622'; ctx.font = '700 16px Arial, sans-serif'; ctx.fillText('YOU ARE HERE', 150, 486);
      // B stop sign (384,0)-(512,256)
      ctx.fillStyle = '#2f4a3f'; ctx.fillRect(384, 0, 128, 256);
      ctx.fillStyle = '#d9a83a'; ctx.beginPath(); ctx.arc(448, 64, 44, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2f4a3f'; ctx.textAlign = 'center'; fitText(ctx, '2', 448, 68, 60, 64, '900', FONTS.SANS);
      ctx.fillStyle = '#efe6cf'; fitText(ctx, 'STREET', 448, 144, 110, 24, '900', FONTS.SANS); fitText(ctx, 'CAR', 448, 172, 110, 24, '900', FONTS.SANS);
      ctx.fillStyle = '#d9cfb3'; fitText(ctx, 'OLD TOWN', 448, 222, 110, 18, '700', FONTS.SANS);
    },
  });
}
export function buildStreetcarStop() {
  const g = root('streetcar_stop', 0, { w: 7.4, h: 3.4, l: 2.8 });
  const k = new Kit(5400); k.floor = 0;
  const green = '#2f4a3f', glass = '#a9bcbc';
  k.box(C.concreteLight, [7.2, 0.25, 2.6], [0, 0, 0], { base: true });
  k.rectY('#d9b23a', 0.25, [-3.6, 3.6], [0.95, 1.25], { off: 0.004 });
  k.rectY(C.concrete, 0.25, [-3.6, 3.6], [1.25, 1.3], { off: 0.006 });
  const sx0 = -0.6, sw = 4.6;
  for (const x of [sx0 - sw / 2 + 0.1, sx0 + sw / 2 - 0.1]) for (const z of [-0.85, 0.5]) k.box(green, [0.09, 2.5, 0.09], [x, 0.25, z], { base: true });
  k.extrude(green, [[-1.0, 2.72], [0.9, 2.86], [0.9, 2.96], [-1.0, 2.84]], sw + 0.2, { axis: 'x', pos: [sx0, 0, 0] });
  k.box('#5f7f72', [sw + 0.2, 0.18, 0.08], [sx0, 2.76, 0.9]);
  k.box(glass, [sw - 0.3, 1.9, 0.03], [sx0, 0.55, -0.85], { base: true });
  k.box(glass, [0.03, 1.9, 1.2], [sx0 - sw / 2 + 0.1, 0.55, -0.2], { base: true });
  k.box(green, [sw - 0.2, 0.06, 0.06], [sx0, 2.45, -0.85]); k.box(green, [sw - 0.2, 0.06, 0.06], [sx0, 0.55, -0.85]);
  // bench
  for (const x of [sx0 - 1.3, sx0 + 1.3]) k.box('#3a3b3d', [0.06, 0.45, 0.4], [x, 0.25, -0.5], { base: true });
  for (let i = 0; i < 3; i++) k.box('#a8865e', [3.0, 0.04, 0.12], [sx0, 0.72, -0.62 + i * 0.14]);
  k.box('#a8865e', [3.0, 0.3, 0.04], [sx0, 0.82, -0.78], { base: true, rot: [-0.15, 0, 0] });
  // stop pole + bin + ticket machine
  k.cyl('#5d6367', 0.05, 0.05, 3.1, [3.0, 0.25, 0.85], { base: true, seg: 6 });
  k.box(green, [0.06, 1.1, 0.6], [3.0, 2.2, 0.85], { base: true });
  k.cyl('#3e4a5a', 0.25, 0.22, 0.8, [2.2, 0.25, -0.6], { base: true, seg: 7 });
  k.box('#8f948f', [0.5, 1.4, 0.35], [-3.4, 0.25, -0.6], { base: true });
  k.box('#2f3a42', [0.3, 0.25, 0.02], [-3.4, 1.35, -0.42]);
  g.add(k.mesh('body'));
  const A = (a, b, c, d) => atlasUV(a, b, c, d, 512, 512);
  multiPanel(g, streetcarAtlas(), [
    { p: [sx0 + 1.4, 1.5, -0.83], w: 1.2, h: 1.6, uv: A(0, 0, 384, 512) },
    { p: [3.035, 2.75, 0.85], w: 0.56, h: 1.04, rotY: Math.PI / 2, uv: A(384, 0, 512, 256) },
    { p: [2.965, 2.75, 0.85], w: 0.56, h: 1.04, rotY: -Math.PI / 2, uv: A(384, 0, 512, 256) },
  ], { fallback: '#e9e2cf' });
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// D19. Bunting — festival flags strung 16 m across a street (spans local X, poles at x = ±8).
// ═════════════════════════════════════════════════════════════════════════════
export function buildBunting() {
  const S = 16, H = 6.4;
  const g = root('bunting', 0, { w: S + 0.4, h: H + 0.3, l: 0.8 });
  const k = new Kit(5500); k.floor = 0;
  const cols = ['#d9a83a', '#3f7470', '#a8382e', '#e9e2cf', '#7e9b6e', '#c9703a'];
  for (const s of [-1, 1]) {
    k.cyl('#3a3b3d', 0.07, 0.09, H + 0.2, [s * S / 2, 0, 0], { base: true, seg: 6 });
    k.box('#3a3b3d', [0.3, 0.3, 0.3], [s * S / 2, 0, 0], { base: true });
    k.ico('#3a3b3d', 0.1, [s * S / 2, H + 0.25, 0]);
  }
  const string = (yEnd, sag, z, off) => {
    const P = (x) => [x, yEnd - sag * (1 - (x / (S / 2)) ** 2), z];
    const segs = 12;
    for (let i = 0; i < segs; i++) rod(k, '#2a2a2a', P(-S / 2 + (i / segs) * S), P(-S / 2 + ((i + 1) / segs) * S), 0.012, 3);
    let j = off;
    for (let x = -S / 2 + 0.45; x < S / 2 - 0.3; x += 0.5, j++) {
      const a = P(x - 0.17), b = P(x + 0.17), c = P(x);
      const tri = [[a[0], a[1], a[2]], [b[0], b[1], b[2]], [c[0], c[1] - 0.42, c[2] + 0.03]];
      const col = cols[j % cols.length];
      k.poly(col, tri, {}); k.poly(shade(col, 0.85), tri.slice().reverse(), {});
    }
  };
  string(H, 1.3, 0.12, 0);
  string(H - 0.6, 0.9, -0.12, 3);
  g.add(k.mesh('body'));
  g.userData.span = { axis: 'x', length: S, note: 'spans local X; place across a street running along local Z' };
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// D20. OLD TOWN MARKET — supply stop. Covered market hall (34 × 16 m lot), stalls, loading area.
//   Band z ∈ [−1, 8] in front of the hall is kept clear for the RV; stalls sit at the lot's −X edge.
// ═════════════════════════════════════════════════════════════════════════════
function marketAtlas() {
  return signTexture({
    key: 'atlas_market', w: 1024, h: 512, bg: '#2f4a3f',
    draw: (ctx) => {
      // A: gable sign (0,0)-(1024,200)
      ctx.fillStyle = '#e9dcc0'; ctx.fillRect(0, 0, 1024, 200);
      ctx.strokeStyle = '#2f4a3f'; ctx.lineWidth = 14; ctx.strokeRect(10, 10, 1004, 180);
      ctx.fillStyle = '#2f4a3f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      fitText(ctx, 'OLD TOWN MARKET', 512, 92, 900, 120, '900', FONTS.SERIF);
      ctx.fillStyle = '#a8382e'; fitText(ctx, 'EST. 1902 · PRODUCE · GOODS · SUPPLIES', 512, 160, 760, 34, '700', FONTS.SANS);
      // B: pole sign (0,220)-(400,512)
      ctx.fillStyle = '#2f4a3f'; ctx.fillRect(0, 220, 400, 292);
      ctx.strokeStyle = '#d9a83a'; ctx.lineWidth = 10; ctx.strokeRect(10, 230, 380, 272);
      ctx.fillStyle = '#efe6cf'; fitText(ctx, 'OLD TOWN', 200, 290, 340, 64, '900', FONTS.SERIF); fitText(ctx, 'MARKET', 200, 360, 340, 70, '900', FONTS.SERIF);
      ctx.fillStyle = '#d9a83a'; fitText(ctx, 'FRESH · LOCAL · DAILY', 200, 440, 330, 30, '700', FONTS.SANS);
      // C: chalk price boards (420,220)-(1024,512)
      ctx.fillStyle = '#2a2b2d'; ctx.fillRect(420, 220, 604, 292);
      ctx.fillStyle = '#e9e6dc'; ctx.textAlign = 'left';
      ['PEACHES  2/$1', 'CHILIES  BY THE LB', 'HONEY  $6', 'EGGS  DOZ $3'].forEach((t, i) => fitText(ctx, t, 450, 270 + i * 64, 540, 40, '700', '"Comic Sans MS","DejaVu Sans",sans-serif'));
    },
  });
}
export function buildStoreMarket() {
  const W = 34, D = 16;
  const g = root('store_market', 0, { w: W, h: 11, l: D });
  const k = new Kit(5600); k.floor = 0;
  lotSlab(k, W, D, '#8c857a', 0, { stripes: false, stains: 4 });
  for (let x = -W / 2 + 3; x < W / 2; x += 3) k.rectY(shade('#8c857a', 0.92), 0.045, [x - 0.03, x + 0.03], [-D / 2, D / 2], { off: 0.002 });
  // hall: z ∈ [-8, -1.6], x ∈ [-13, 13]
  const hw = 26, hz0 = -8, hz1 = -1.6, hzc = (hz0 + hz1) / 2, hd = hz1 - hz0, eave = 5.2, ridge = 7.6;
  const brick = '#a25a44', iron = '#3f5a4a', roof = '#7d8285';
  k.box('#9a958a', [hw, 0.15, hd], [0, 0, hzc], { base: true });
  k.box(brick, [hw, eave, 0.4], [0, 0, hz0 + 0.2], { base: true });
  for (const s of [-1, 1]) k.box(brick, [0.5, eave, hd], [s * (hw / 2 - 0.25), 0, hzc], { base: true });
  const E = walls(hw, hd, 0, hzc);
  for (const f of [E.left, E.right]) { for (const u of [hzc - 1.6, hzc + 1.6]) steelWindow(k, f, u, 1.4, 1.5, 2.6, { arch: 0.75, seed: 5601 + u + f.at, cols: 2, rows: 3, lit: 0.4 }); band(k, f, 0, 0.7, mix(brick, C.dirt, 0.35), 0.008); }
  k.extrude(brick, [[hz0, eave - 0.02], [hz1, eave - 0.02], [hzc, ridge - 0.05]], hw, { axis: 'x' });
  // roof (gable along X) + clerestory monitor
  const e = hd / 2 + 0.6, sl = (ridge - eave) / (hd / 2), ye = eave - 0.6 * sl;
  k.extrude((cx, cy, cz, nx, ny) => (ny < -0.3 ? '#4a4c4e' : Math.abs(ny) < 0.3 ? shade(roof, 0.7) : roof), [[-e, ye], [0, ridge], [e, ye], [e, ye + 0.16], [0, ridge + 0.18], [-e, ye + 0.16]], hw + 0.8, { axis: 'x', pos: [0, 0, hzc] });
  k.box('#5a5f63', [hw - 4, 0.9, 1.8], [0, ridge, hzc], { base: true });
  for (let x = -hw / 2 + 2.6; x < hw / 2 - 2; x += 1.1) for (const s of [-1, 1]) k.rectZ('#2a2b2c', hzc + s * 0.91, [x, x + 0.6], [ridge + 0.2, ridge + 0.75], s, { off: 0.01 });
  k.box(roof, [hw - 3.4, 0.12, 2.4], [0, ridge + 0.9, hzc], { base: true });
  // cast-iron arcade along the front with brackets
  for (let i = 0; i <= 8; i++) {
    const x = -hw / 2 + 0.5 + i * (hw - 1) / 8;
    k.cyl(iron, 0.14, 0.18, eave - 0.3, [x, 0.15, hz1], { base: true, seg: 5, open: true });
    k.box(iron, [0.5, 0.3, 0.5], [x, 0, hz1], { base: true, noBottom: true });
    if (i > 0 && i < 8) for (const s of [-1, 1]) k.poly(iron, [[x, eave - 1.3, hz1 + 0.02], [x + s * 0.9, eave - 0.35, hz1 + 0.02], [x, eave - 0.35, hz1 + 0.02]], { facing: [0, 0, 1] });
  }
  k.box(iron, [hw, 0.35, 0.3], [0, eave - 0.35, hz1], { base: true });
  // front gable (false front) carrying the big sign
  const gz = hz1 + 0.15;
  k.box(brick, [11, 2.0, 0.5], [0, eave, gz], { base: true });
  k.extrude(brick, [[-5.5, eave + 2.0], [5.5, eave + 2.0], [0, eave + 4.4]], 0.5, { axis: 'z', pos: [0, 0, gz] });
  for (const s2 of [-1, 1]) beam(k, C.lintel, [s2 * 5.9, eave + 1.9, gz + 0.05], [0, eave + 4.6, gz + 0.05], [0.32, 0.7]);
  k.box(C.lintel, [11.4, 0.25, 0.7], [0, eave + 1.8, gz + 0.05], { base: true });
  k.cyl(C.lintel, 0.75, 0.75, 0.1, [0, eave + 3.0, gz + 0.27], { axis: 'z', seg: 10 });
  k.cyl('#2f3a42', 0.55, 0.55, 0.12, [0, eave + 3.0, gz + 0.3], { axis: 'z', seg: 10 });
  // stalls under the arcade + hanging lamps
  for (let i = 0; i < 4; i++) {
    const x = -9 + i * 6;
    k.box('#8a6a4a', [3.6, 0.85, 1.2], [x, 0.15, hzc - 0.6], { base: true });
    const fills = ['#d9822b', '#6f8c4a', '#b8402e', '#c9a02a', '#e0c45a', '#5a3a5a'];
    for (let j = 0; j < 4; j++) { k.box('#b49a74', [0.8, 0.22, 0.9], [x - 1.3 + j * 0.86, 1.0, hzc - 0.6], { base: true }); k.rectY(fills[(i + j) % 6], 1.22, [x - 1.65 + j * 0.86, x - 0.95 + j * 0.86], [hzc - 1.0, hzc - 0.2], { off: 0.004 }); }
    rod(k, '#2a2a2a', [x, ridge - 0.3, hzc], [x, 3.6, hzc], 0.015, 3);
    k.cone('#3f5a4a', 0.35, 0.3, [x, 3.3, hzc], { base: true, seg: 6 });
    k.cyl(PAL.lampWarm, 0.28, 0.28, 0.02, [x, 3.3, hzc], { seg: 6 });
  }
  // front stalls at the lot's −X edge (outside the RV band)
  stallInto(k, -15.2, 1.6, Math.PI / 2, 0, 1);
  stallInto(k, -15.2, 5.4, Math.PI / 2, 3, 1);
  stallInto(k, 14.6, 2.0, -Math.PI / 2, 1, 1);
  // loading area at the +X end: dock, roll door, pallets, crates, hand truck, dumpster
  k.box('#9a968c', [2.4, 1.0, 4.0], [14.2, 0, hzc + 0.2], { base: true });
  k.box(C.safety, [0.08, 0.1, 4.0], [15.4, 0.92, hzc + 0.2], { base: true });
  rollDoor(k, E.left, hzc + 0.2, 3.0, 3.0, '#9a968c', { y0: 1.0 });
  pallet(k, 14.1, 1.0, hzc + 1.2); crate(k, 14.1, 1.15, hzc + 1.2, 0.9);
  pallet(k, 16.2, 0, -3.6, Math.PI / 2);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) crate(k, 16.2, 0.15 + i * 0.6, -3.9 + j * 0.62, 0.75, ['#a8865e', '#8a7a5a', '#b49a74'][(i + j) % 3], Math.PI / 2 + j * 0.2);
  k.box('#3f6b4f', [2.0, 1.3, 1.2], [15.9, 0, -7.1], { base: true });
  k.box(shade('#3f6b4f', 0.85), [2.05, 0.1, 1.25], [15.9, 1.3, -7.1], { base: true, rot: [0.08, 0, 0] });
  k.box('#5d6367', [0.06, 1.2, 0.06], [16.0, 0, -1.7], { base: true, rot: [0.2, 0, 0] });
  k.box('#5d6367', [0.5, 0.06, 0.4], [16.0, 0.03, -1.55], { base: true });
  // pole sign at the +X front corner + chalkboard A-frames by the stalls
  signPole(k, 15.6, 6.6, 6.2, iron, 0.3);
  k.box(iron, [3.4, 2.6, 0.3], [15.6, 6.3, 6.6], { base: true });
  for (const x of [-13.2, -12.2]) k.box('#5e4632', [0.72, 1.0, 0.05], [x, 0, 7.4], { base: true, rot: [-0.2, 0, 0] });
  g.add(k.mesh('body'));
  const A = (a, b, c, d) => atlasUV(a, b, c, d, 1024, 512);
  multiPanel(g, marketAtlas(), [
    { p: [0, eave + 1.0, gz + 0.27], w: 10.4, h: 2.03, uv: A(0, 0, 1024, 200) },
    { p: [15.6, 7.6, 6.77], w: 3.2, h: 2.34, uv: A(0, 220, 400, 512) },
    { p: [-13.2, 0.52, 7.39 + 0.035], w: 0.62, h: 0.8, rotX: -0.2, uv: A(420, 220, 1024, 512) },
    { p: [-12.2, 0.52, 7.39 + 0.035], w: 0.62, h: 0.8, rotX: -0.2, uv: A(420, 220, 1024, 512) },
  ], { fallback: '#e9dcc0' });
  return g;
}

export const BUILDERS = {
  loft: { build: (v) => buildLoft(v), variants: 4 },
  market_stall: { build: (v) => buildMarketStall(v), variants: 4 },
  clock_tower: { build: () => buildClockTower(), variants: 1 },
  diner: { build: () => buildDiner(), variants: 1 },
  streetcar_stop: { build: () => buildStreetcarStop(), variants: 1 },
  bunting: { build: () => buildBunting(), variants: 1 },
  store_market: { build: () => buildStoreMarket(), variants: 1 },
};
