// ─────────────────────────────────────────────────────────────────────────────
// Round 3 (agent R3-START) — the businesses around Rook's Garage.
//   diner_24h     stainless roadside diner, lit window band, roof sign "DINER · OPEN 24 HRS"
//   tyre_shop     cinder-block tyre & wheel shop, two lit bays, tyre racks, giant roof tyre
//   corner_shop   two-storey brick corner mart: lit shopfront, awning, neon OPEN, roof tank
//   pole_sign (3) tall roadside pole sign, double-sided, lit (0 diner · 1 tyres · 2 mart)
// Fronts face local +Z; origin = ground centre of the footprint. Lit parts are emissive
// Lambert (baked as vertex colour + emission) and signs go through the runtime sign atlas.
// ─────────────────────────────────────────────────────────────────────────────
import {
  THREE, Kit, root, rng, PAL, mix, shade, walls, wr, C, vwrap, beam, rod, acUnit, drum, crate, pallet, roofTank,
  addPanel, plateSign, glowSign, signTexture, fitText, FONTS, paintedWallSign, addLit, fitSize, tyre, tyreStack, S,
} from './r3-start-kit.js';

const PI = Math.PI;

// ═════════════════════════════════════════════════════════════════════════════
// 24h diner
// ═════════════════════════════════════════════════════════════════════════════
export function buildDiner24h() {
  const W = 18, D = 8.4, zc = -1.2, fz = zc + D / 2;
  const g = root('diner_24h', 0, { w: W + 2, h: 7.6, l: 12 });
  const k = new Kit(5600); k.floor = 0;
  const lk = new Kit(5601), nk = new Kit(5602);
  const steel = S.chrome, F = walls(W, D, 0, zc);
  // brick skirt + stainless body
  k.box('#7e4a3a', [W, 0.75, D], [0, 0, zc], { base: true });
  k.box((cx, cy, cz, nx, ny) => (ny > 0.5 ? '#8f9491' : steel), [W, 3.35, D], [0, 0.75, zc], { base: true });
  // barrel roof (extruded across X) with eaves
  const pts = [], n = 8, e = D / 2 + 0.35, y0 = 4.05, rise = 0.75;
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push([-e + 2 * e * t, y0 + rise * Math.sin(PI * t)]); }
  for (let i = n; i >= 0; i--) { const t = i / n; pts.push([-e + 2 * e * t, y0 + 0.16 + rise * Math.sin(PI * t)]); }
  k.extrude((cx, cy, cz, nx, ny) => (ny < -0.2 ? '#4a4c4e' : '#9da3a1'), pts, W + 0.5, { axis: 'x', pos: [0, 0, zc] });
  k.extrude('#b9bdb9', [[-D / 2, 4.08], [D / 2, 4.08], ...pts.slice(1, n).map(([z, y]) => [z * (D / 2) / e, y - 0.02]).reverse()].reverse(), W - 0.05, { axis: 'x', pos: [0, 0, zc] });
  // front: flutes, trim bands, the lit window band with mullions + counter line
  for (const y of [0.95, 1.1, 1.25]) wr(k, F.front, [-W / 2, W / 2], [y, y + 0.05], '#8f9491', 0.012);
  wr(k, F.front, [-W / 2, W / 2], [0.75, 0.88], S.teal, 0.014);
  wr(k, F.front, [-W / 2, W / 2], [3.38, 3.72], S.redTrim, 0.014);
  wr(k, F.front, [-W / 2, W / 2], [3.72, 3.8], '#e9e2cf', 0.016);
  for (const [a, b] of [[-8.4, -1.6], [1.6, 8.4]]) {
    lk.rectZ('#fff', fz, [a, b], [1.55, 3.1], 1, { off: 0.02 });
    wr(k, F.front, [a - 0.12, b + 0.12], [1.45, 1.55], '#e9e2cf', 0.024);
    wr(k, F.front, [a, b], [1.55, 1.95], '#3a3430', 0.034);                    // counter + stools seen through the glass
    for (let x = a; x <= b + 0.01; x += (b - a) / 6) wr(k, F.front, [x - 0.05, x + 0.05], [1.55, 3.1], '#5d6367', 0.038);
    wr(k, F.front, [a, b], [3.02, 3.1], '#5d6367', 0.038);
  }
  // vestibule with glass door + steps
  const vz = fz + 0.9;
  k.box(steel, [3.0, 3.0, 1.8], [0, 0.75, vz], { base: true });
  k.box('#9da3a1', [3.4, 0.2, 2.1], [0, 3.75, vz + 0.1], { base: true });
  k.box(S.redTrim, [3.42, 0.18, 2.12], [0, 3.6, vz + 0.1], { base: true });
  lk.rectZ('#fff', vz + 0.9, [-0.9, 0.9], [0.8, 3.0], 1, { off: 0.02 });
  k.rectZ('#5d6367', vz + 0.9, [-0.05, 0.05], [0.8, 3.0], 1, { off: 0.03 });
  for (const s of [-1, 1]) lk.rectX('#fff', s * 1.5, [vz - 0.6, vz + 0.6], [1.6, 3.0], s, { off: 0.02 });
  for (let i = 0; i < 3; i++) k.box('#a39e93', [2.6 - i * 0.2, 0.25, 0.5], [0, i * 0.25, vz + 1.15 + (2 - i) * 0.35], { base: true });
  // ends: lit windows + flutes
  for (const f of [F.left, F.right]) {
    lk[f.axis === 'x' ? 'rectX' : 'rectZ']('#fff', f.at, [zc - 2.6, zc + 2.6], [1.55, 3.1], f.dir, { off: 0.02 });
    for (const z of [zc - 1.3, zc, zc + 1.3]) wr(k, f, [z - 0.05, z + 0.05], [1.55, 3.1], '#5d6367', 0.03);
    wr(k, f, f.u, [3.38, 3.72], S.redTrim, 0.014);
  }
  // kitchen annex, hood + stack, AC units, propane bottles
  k.box('#c9bfa6', [6.2, 3.5, 4.2], [W / 2 - 3.6, 0, zc - D / 2 - 2.0], { base: true });
  k.box('#8f8a80', [6.6, 0.2, 4.6], [W / 2 - 3.6, 3.5, zc - D / 2 - 2.0], { base: true });
  k.box('#9da3a1', [1.4, 0.8, 1.4], [W / 2 - 2.6, 3.7, zc - D / 2 - 2.2], { base: true, taper: [0.6, 0.6] });
  k.cyl('#7d7f80', 0.25, 0.25, 1.4, [W / 2 - 2.6, 4.5, zc - D / 2 - 2.2], { base: true, seg: 6 });
  k.rectX('#5f7f72', W / 2 + 0.01, [zc - D / 2 - 3.2, zc - D / 2 - 2.2], [0, 2.2], 1, { off: 0.01 });
  acUnit(k, -4.5, 4.75, zc - 1.0, 1.0); acUnit(k, 3.0, 4.75, zc - 1.6, 0.9, 0.3);
  for (const x of [-W / 2 + 0.6, -W / 2 + 1.2]) k.cyl('#d9d4c4', 0.22, 0.22, 1.2, [x, 0, zc - D / 2 - 0.5], { base: true, seg: 6 });
  // roof sign frame
  for (const x of [-3.2, 3.2]) { k.box(C.iron, [0.16, 2.4, 0.16], [x, 4.6, zc + 0.1], { base: true }); beam(k, C.iron, [x, 4.7, zc - 1.2], [x, 6.4, zc + 0.05], 0.1); }
  k.box('#3a3836', [8.6, 2.0, 0.2], [0, 6.75, zc + 0.3]);
  for (let i = 0; i < 18; i++) { const x = -4.1 + i * (8.2 / 17); for (const y of [5.82, 7.68]) nk.box('#fff', [0.12, 0.12, 0.08], [x, y, zc + 0.44]); }
  for (let i = 1; i < 6; i++) for (const x of [-4.22, 4.22]) nk.box('#fff', [0.12, 0.12, 0.08], [x, 5.82 + i * 0.31, zc + 0.44]);
  g.add(k.mesh('body'));
  addLit(g, lk, 'warm', 'lit');
  addLit(g, nk, 'bulb', 'bulbs');
  const sign = glowSign('r3s_diner_roof', [
    { text: 'DINER', y: 0.42, px: 150, color: '#ff5a44', core: 'rgba(255,236,220,0.35)' },
    { text: 'OPEN 24 HRS', y: 0.82, px: 54, color: '#58e6c8', core: 'rgba(230,255,248,0.3)' },
  ], { w: 768, h: 192, bg: '#2a2622', frame: '#b23a2c', weather: true });
  const sp = addPanel(g, sign, 8.0, 2.0, [0, 6.75, zc + 0.41], 0, { glow: 0.6 });
  sp.castShadow = false;
  const back = plateSign('r3s_diner_back', "LOU'S", 'EAT · COFFEE · PIE', { bg: '#e9e2cf', fg: '#b23a2c', border: '#3a3836', w: 512, h: 128 });
  addPanel(g, back, 8.0, 2.0, [0, 6.75, zc + 0.19], PI);
  const op = glowSign('r3s_open_neon', [{ text: 'OPEN', y: 0.55, px: 120, color: '#ff4a3a' }], { w: 256, h: 128, bg: '#2a2222', frame: '#58e6c8', frameW: 6 });
  addPanel(g, op, 1.2, 0.6, [5.2, 2.45, fz + 0.05], 0, { glow: 0.9 });
  const menu = plateSign('r3s_diner_menu', 'BREAKFAST ALL DAY', 'PANCAKES · EGGS · HASH', { bg: '#e9e2cf', fg: '#2a2622', border: S.redTrim, w: 512, h: 160 });
  addPanel(g, menu, 2.2, 0.69, [-5.0, 2.55, fz + 0.05], 0);
  return fitSize(g);
}

// ═════════════════════════════════════════════════════════════════════════════
// Tyre shop
// ═════════════════════════════════════════════════════════════════════════════
export function buildTyreShop() {
  const W = 17, D = 11, H = 5.4, zc = -0.6, fz = zc + D / 2;
  const g = root('tyre_shop', 0, { w: W + 1, h: 8.6, l: D + 3 });
  const k = new Kit(5700); k.floor = 0;
  const lk = new Kit(5701), ck = new Kit(5702), wk = new Kit(5703);
  const blk = S.block, F = walls(W, D, 0, zc);
  k.box((cx, cy, cz, nx, ny) => (ny > 0.5 ? '#8f8a80' : blk), [W, H, D], [0, 0, zc], { base: true });
  k.box(S.blockDark, [W + 0.3, 0.45, D + 0.3], [0, H, zc], { base: true });
  for (const f of Object.values(F)) {
    for (let y = 0.6; y < H - 0.3; y += 0.6) wr(k, f, f.u, [y, y + 0.03], shade(blk, 0.88), 0.008);
    wr(k, f, f.u, [0, 0.55], mix(blk, S.dirt, 0.45), 0.01);
  }
  wr(k, F.front, [-W / 2, W / 2], [4.05, 5.0], '#b23a2c', 0.014);
  // two service bays (roll doors up, lit tubes inside, a car on the lift in bay 1)
  for (const [i, x] of [[0, -5.0], [1, -0.4]].map((a) => a)) {
    wr(k, F.front, [x - 2.05, x + 2.05], [0, 3.75], '#3a3b3d', 0.014);
    wr(k, F.front, [x - 1.9, x + 1.9], [0, 3.6], '#1e1d1c', 0.02);
    wr(k, F.front, [x - 1.9, x + 1.9], [3.15, 3.6], shade(S.cream, 0.75), 0.026);           // rolled-up door drum
    lk.rectZ('#fff', fz, [x - 1.5, x + 1.5], [2.85, 3.0], 1, { off: 0.03 });
    wr(k, F.front, [x - 1.9, x + 1.9], [0, 0.12], C.safety, 0.026);
    if (i === 0) { // car on a lift: lifted body silhouette + posts
      wr(k, F.front, [x - 1.2, x + 1.2], [1.35, 2.3], '#6f8fb0', 0.03);
      wr(k, F.front, [x - 0.9, x + 0.9], [2.3, 2.75], '#4f6a85', 0.03);
      for (const s of [-1, 1]) wr(k, F.front, [x + s * 1.55 - 0.1, x + s * 1.55 + 0.1], [0, 2.7], '#d7a93a', 0.032);
      wr(k, F.front, [x - 1.6, x + 1.6], [1.2, 1.35], '#3a3b3d', 0.034);
    } else {
      wr(k, F.front, [x - 1.6, x - 0.4], [0, 1.6], '#2a2b2d', 0.03);                         // tyre machine
      wr(k, F.front, [x + 0.6, x + 1.6], [0, 0.9], '#9c3a2e', 0.03);                         // tool chest
    }
  }
  // office: lit window + door
  wk.rectZ('#fff', fz, [3.4, 6.6], [1.1, 2.6], 1, { off: 0.02 });
  wr(k, F.front, [3.3, 6.7], [1.0, 1.1], S.cream, 0.024);
  for (const x of [4.45, 5.55]) wr(k, F.front, [x - 0.04, x + 0.04], [1.1, 2.6], '#3a3b3d', 0.03);
  wr(k, F.front, [7.0, 8.0], [0, 2.3], '#5f7f72', 0.02);
  // front racks of tyres + stacks, compressor, hose reel
  const r = rng(5703);
  for (let i = 0; i < 6; i++) tyre(k, -8.0 + i * 0.62, 0.35, fz + 1.2, 0.36, 0.22, { axis: 'x' });
  k.box('#5f6468', [3.9, 0.35, 0.8], [-6.45, 0, fz + 1.2], { base: true });
  for (let i = 0; i < 5; i++) tyreStack(k, 3.0 + (i % 3) * 0.85, fz + 1.0 + Math.floor(i / 3) * 0.85, 3 + Math.floor(r() * 3));
  tyreStack(k, 8.0, fz + 0.8, 5);
  k.box('#9c3a2e', [0.8, 0.9, 0.6], [W / 2 - 0.6, 0, fz + 0.5], { base: true });
  k.cyl('#5f6468', 0.25, 0.25, 0.8, [W / 2 - 0.6, 0.9, fz + 0.5], { axis: 'x', seg: 6 });
  // roof: giant standing tyre + sign board, AC unit, vents
  ck.at([-W / 2 + 2.6, H + 0.45, zc + 1.0], [0, 0, 0], () => {
    ck.cyl(S.tyre, 1.7, 1.7, 0.75, [0, 1.7, 0], { axis: 'z', seg: 12 });
    ck.cyl('#d9d4c4', 0.85, 0.85, 0.8, [0, 1.7, 0], { axis: 'z', seg: 10 });
    ck.cyl('#9da3a1', 0.4, 0.4, 0.84, [0, 1.7, 0], { axis: 'z', seg: 6 });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; ck.box('#161616', [0.18, 0.5, 0.78], [Math.cos(a) * 1.55, 1.7 + Math.sin(a) * 1.55, 0], { rot: [0, 0, a] }); }
    ck.box(C.iron, [0.25, 0.4, 0.9], [0, 0.05, 0], { base: true });
  });
  for (const x of [1.0, 6.0]) k.box(C.iron, [0.14, 2.6, 0.14], [x, H + 0.45, zc - 1.0], { base: true });
  k.box('#2a2622', [6.4, 1.7, 0.16], [3.5, H + 2.2, zc - 0.95]);
  acUnit(k, -1.5, H + 0.45, zc - 3.0, 1.0, 0.4);
  g.add(k.mesh('body'));
  g.add(ck.mesh('tyre_sign'));
  addLit(g, lk, 'cool', 'lit');
  addLit(g, wk, 'warm', 'lit_office');
  const band = paintedWallSign('r3s_tyre_band', [{ text: 'DRY CREEK TIRE & WHEEL', y: 0.55, px: 92, color: '#f1ead8' }], { w: 1024, h: 110, bg: '#b23a2c', brick: false, chips: 50 });
  addPanel(g, band, 15.5, 15.5 * 110 / 1024, [0, 4.53, fz + 0.02], 0);
  const roof = glowSign('r3s_tyre_roof', [{ text: 'TIRES', y: 0.42, px: 120, color: '#ffd24a' }, { text: 'NEW · USED · FLATS FIXED', y: 0.82, px: 40, color: '#f1ead8' }], { w: 512, h: 136, bg: '#2a2622', frame: '#d7a93a' });
  addPanel(g, roof, 6.2, 1.65, [3.5, H + 2.2, zc - 0.86], 0, { glow: 0.45 });
  const side = paintedWallSign('r3s_tyre_side', [{ text: 'ALIGNMENT · BRAKES', y: 0.35, px: 80, color: '#2a2622' }, { text: 'FLATS FIXED WHILE U WAIT', y: 0.75, px: 56, color: '#b23a2c' }], { w: 1024, h: 220, bg: '#e2d3a8', brick: false, chips: 70, chip: 'rgba(150,130,90,0.5)' });
  addPanel(g, side, 8.0, 1.72, [-W / 2 - 0.02, 3.0, zc], -PI / 2);
  const off = plateSign('r3s_tyre_office', 'OFFICE', null, { bg: '#e9e2cf', fg: '#2a2622', w: 256, h: 96 });
  addPanel(g, off, 1.0, 0.38, [5.0, 2.9, fz + 0.03], 0);
  return fitSize(g);
}

// ═════════════════════════════════════════════════════════════════════════════
// Corner shop
// ═════════════════════════════════════════════════════════════════════════════
export function buildCornerShop() {
  const W = 13, D = 11, H = 7.6, zc = -0.4, fz = zc + D / 2;
  const g = root('corner_shop', 0, { w: W + 1, h: 11, l: D + 2 });
  const k = new Kit(5800); k.floor = 0;
  const lk = new Kit(5801);
  const brick = '#a25a44', F = walls(W, D, 0, zc);
  k.box((cx, cy, cz, nx, ny) => (ny > 0.5 ? '#6a6762' : brick), [W, H, D], [0, 0, zc], { base: true });
  // parapet + cornice
  for (const [w, d, x, z] of [[W, 0.3, 0, fz - 0.15], [W, 0.3, 0, zc - D / 2 + 0.15], [0.3, D, W / 2 - 0.15, zc], [0.3, D, -W / 2 + 0.15, zc]]) k.box(brick, [w, 0.7, d], [x, H, z], { base: true });
  k.box('#cfc5ae', [W + 0.3, 0.25, 0.45], [0, H - 0.1, fz + 0.05], { base: true });
  for (const f of [F.front, F.left, F.right, F.back]) { wr(k, f, f.u, [0, 0.5], mix(brick, S.dirt, 0.4), 0.008); wr(k, f, f.u, [3.75, 3.95], '#cfc5ae', 0.012); }
  // shopfront: pilasters, lit windows with posters, door
  wr(k, F.front, [-W / 2, W / 2], [0, 3.75], '#2f3a42', 0.006);
  for (const [a, b] of [[-5.9, -1.2], [1.6, 5.9]]) {
    lk.rectZ('#fff', fz, [a, b], [0.75, 2.75], 1, { off: 0.016 });
    wr(k, F.front, [a - 0.1, b + 0.1], [0.55, 0.75], '#5d6367', 0.02);
    const r = rng(5802 + a * 10);
    for (let i = 0; i < 4; i++) { const x = a + 0.2 + r() * (b - a - 1.2); const y = 0.95 + r() * 1.0; wr(k, F.front, [x, x + 0.5 + r() * 0.5], [y, y + 0.5 + r() * 0.4], ['#d9a83a', '#b23a2c', '#e9e2cf', '#4f8f8a'][i], 0.03); }
    for (let x = a; x <= b + 0.01; x += (b - a) / 3) wr(k, F.front, [x - 0.05, x + 0.05], [0.75, 2.75], '#3a3b3d', 0.034);
  }
  lk.rectZ('#fff', fz, [-0.6, 0.9], [0.05, 2.6], 1, { off: 0.016 });
  wr(k, F.front, [0.1, 0.2], [0.05, 2.6], '#3a3b3d', 0.03);
  for (const x of [-W / 2 + 0.25, -0.85, 1.25, W / 2 - 0.25]) fpil(k, x, fz, brick);
  // awning: striped, sloped
  const n = 7, aw = (W - 0.4) / n;
  for (let i = 0; i < n; i++) k.box(i % 2 ? '#e9e2cf' : S.teal, [aw, 0.07, 1.5], [-W / 2 + 0.2 + aw * (i + 0.5), 3.15, fz + 0.65], { rot: [0.32, 0, 0] });
  k.box(S.tealDeep || '#3b6f6b', [W - 0.4, 0.28, 0.05], [0, 2.82, fz + 1.4]);
  // upper floor windows (apartment): some lit
  const r = rng(5810);
  for (const x of [-4.6, -1.6, 1.6, 4.6]) {
    wr(k, F.front, [x - 0.75, x + 0.75], [4.75, 6.65], '#cfc5ae', 0.012);
    if (r() < 0.45) lk.rectZ('#fff', fz, [x - 0.6, x + 0.6], [4.85, 6.55], 1, { off: 0.02 });
    else wr(k, F.front, [x - 0.6, x + 0.6], [4.85, 6.55], r() < 0.5 ? '#36424a' : '#a9a493', 0.02);
    wr(k, F.front, [x - 0.04, x + 0.04], [4.85, 6.55], '#cfc5ae', 0.028);
  }
  for (const z of [zc - 3, zc, zc + 3]) for (const f of [F.left, F.right]) { wr(k, f, [z - 0.6, z + 0.6], [4.85, 6.55], r() < 0.3 ? PAL.windowLit : '#36424a', 0.02); wr(k, f, [z - 0.75, z + 0.75], [4.75, 4.85], '#cfc5ae', 0.024); }
  // roof: water tank, AC, vent; fire-escape ladder at the back
  roofTank(k, -3.2, H, zc - 2.0, 1.2, 2.0, 1.6);
  acUnit(k, 3.0, H, zc - 1.0, 1.0);
  // ice chest + payphone + newspaper box at the front
  k.box('#e9e4d4', [1.6, 1.1, 0.8], [3.4, 0, fz + 0.5], { base: true, c: 0.04 });
  k.box('#3e5a7a', [1.62, 0.3, 0.82], [3.4, 0.8, fz + 0.5], { base: true });
  k.box('#5f6468', [0.12, 1.9, 0.12], [-6.1, 0, fz + 0.8], { base: true });
  k.box('#7a7f83', [0.6, 0.8, 0.35], [-6.1, 1.3, fz + 0.75], { base: true });
  k.box('#2c5e8a', [0.5, 1.0, 0.45], [5.2, 0, fz + 0.5], { base: true });
  g.add(k.mesh('body'));
  addLit(g, lk, 'warm', 'lit');
  const name = glowSign('r3s_mart_band', [{ text: 'DRY CREEK MART', y: 0.56, px: 92, color: '#ffe08a', core: 'rgba(255,250,230,0.6)' }], { w: 1024, h: 120, bg: '#2a3a3a', frame: '#d7a93a', frameW: 6 });
  addPanel(g, name, 9.0, 9.0 * 120 / 1024, [0, 4.35, fz + 0.03], 0, { glow: 0.5 });
  const neon = glowSign('r3s_mart_open', [{ text: 'OPEN', y: 0.55, px: 110, color: '#ff4a3a' }], { w: 256, h: 128, bg: '#1e1e22', frame: '#4fe0c4', frameW: 6 });
  addPanel(g, neon, 1.1, 0.55, [-2.0, 2.2, fz + 0.04], 0, { glow: 0.9 });
  const ice = plateSign('r3s_ice', 'ICE', null, { bg: '#e9e4d4', fg: '#2c5e8a', border: false, w: 256, h: 96, px: 80 });
  addPanel(g, ice, 1.2, 0.45, [3.4, 0.62, fz + 0.91], 0);
  const mural = paintedWallSign('r3s_mart_side', [{ text: 'ICE COLD BEER', y: 0.3, px: 120, color: '#f1ead8' }, { text: 'LOTTO · ATM · SMOKES', y: 0.72, px: 70, color: '#e2b54a' }], { w: 1024, h: 300, bg: '#8a4a38' });
  addPanel(g, mural, 8.4, 2.46, [W / 2 + 0.02, 2.2, zc], PI / 2);
  return fitSize(g);
}
function fpil(k, x, fz, brick) { k.box(shade(brick, 1.06), [0.4, 3.75, 0.2], [x, 0, fz + 0.1], { base: true }); }

// ═════════════════════════════════════════════════════════════════════════════
// Pole sign — tall double-sided roadside sign, lit.  0 diner · 1 tyres · 2 mart
// ═════════════════════════════════════════════════════════════════════════════
const POLE = [
  { key: 'diner', bg: '#e9e2cf', glow: 0.12, lines: [{ text: 'EAT', y: 0.42, px: 170, color: '#c8321f', core: 'rgba(0,0,0,0)', blur: 0.05 }, { text: "LOU'S DINER", y: 0.84, px: 52, color: '#23705f', core: 'rgba(0,0,0,0)', blur: 0 }], frame: '#b23a2c', sub: 'OPEN 24 HRS', subBg: '#2a2622', subFg: '#58e6c8', bulbs: true },
  { key: 'tyres', bg: '#d7a93a', glow: 0.12, lines: [{ text: 'TIRES', y: 0.46, px: 150, color: '#22262a', core: 'rgba(0,0,0,0)', blur: 0 }, { text: 'NEW & USED', y: 0.84, px: 52, color: '#22262a', core: 'rgba(0,0,0,0)', blur: 0 }], frame: '#22262a', sub: 'FLATS FIXED', subBg: '#e9e2cf', subFg: '#b23a2c' },
  { key: 'mart', bg: '#2a3a3a', lines: [{ text: 'MART', y: 0.44, px: 150, color: '#ffe08a', core: 'rgba(255,250,230,0.6)' }, { text: 'ICE · BEER · LOTTO', y: 0.84, px: 46, color: '#58e6c8' }], frame: '#d7a93a', sub: 'OPEN 6AM–2AM', subBg: '#e9e2cf', subFg: '#2a3a3a' },
];
export function buildPoleSign(variant = 0) {
  const v = vwrap(variant, 3), P = POLE[v];
  const H = 8.2, BW = 4.2, BH = 2.5;
  const g = root('pole_sign', v, { w: BW + 0.3, h: H + BH + 0.4, l: 0.6 }, { style: P.key });
  const k = new Kit(5900 + v); k.floor = 0;
  const lk = new Kit(5910 + v);
  k.cyl('#5f6468', 0.18, 0.22, H + 0.2, [0, 0, 0], { base: true, seg: 8 });
  k.box(C.concrete, [0.9, 0.5, 0.9], [0, 0, 0], { base: true, c: 0.05 });
  k.box(C.safety, [0.46, 0.9, 0.46], [0, 0.5, 0], { base: true });
  k.box('#3a3836', [BW + 0.25, BH + 0.25, 0.42], [0, H + BH / 2, 0]);
  k.box('#5f6468', [3.5, 0.9, 0.52], [0, H - 0.95, 0]);
  k.box('#3a3b3d', [0.1, 0.5, 0.1], [-1.2, H - 0.25, 0]); k.box('#3a3b3d', [0.1, 0.5, 0.1], [1.2, H - 0.25, 0]);
  if (P.bulbs) for (let i = 0; i < 14; i++) { const x = -BW / 2 + 0.1 + i * (BW - 0.2) / 13; for (const z of [0.23, -0.23]) { lk.box('#fff', [0.12, 0.12, 0.06], [x, H + BH + 0.06, z]); lk.box('#fff', [0.12, 0.12, 0.06], [x, H - 0.06, z]); } }
  g.add(k.mesh('body'));
  addLit(g, lk, 'bulb', 'bulbs');
  const face = glowSign('r3s_pole_' + P.key, P.lines, { w: 512, h: 300, bg: P.bg, frame: P.frame, frameW: 12 });
  addPanel(g, face, BW, BH, [0, H + BH / 2, 0.22], 0, { glow: P.glow ?? 0.45 });
  addPanel(g, face, BW, BH, [0, H + BH / 2, -0.22], PI, { glow: P.glow ?? 0.45 });
  const sub = plateSign('r3s_pole_sub_' + P.key, P.sub, null, { bg: P.subBg, fg: P.subFg, border: false, w: 512, h: 128, px: 84 });
  addPanel(g, sub, 3.3, 0.82, [0, H - 0.95, 0.27], 0, { glow: v === 0 ? 0.5 : 0 });
  addPanel(g, sub, 3.3, 0.82, [0, H - 0.95, -0.27], PI, { glow: v === 0 ? 0.5 : 0 });
  g.userData.collider = { r: 0.45 };
  return fitSize(g);
}

export const BUILDERS = {
  diner_24h: { build: () => buildDiner24h(), variants: 1 },
  tyre_shop: { build: () => buildTyreShop(), variants: 1 },
  corner_shop: { build: () => buildCornerShop(), variants: 1 },
  pole_sign: { build: (v) => buildPoleSign(v), variants: 3 },
};
