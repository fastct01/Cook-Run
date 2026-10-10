// ─────────────────────────────────────────────────────────────────────────────
// City Areas expansion — A. the start + B. Ironworks District (art agent: city).
//   rooks_garage, factory, warehouse, rail_shed, water_tower_city, overhead_crane,
//   chainlink_fence, rail_track
// Roadside buildings face local +Z; origin = ground centre of the footprint.
// ─────────────────────────────────────────────────────────────────────────────
import {
  THREE, Kit, root, rng, empty, PAL, mix, shade, walls, wr, windowGrid, band, parapet, C, vwrap,
  fp, fbox, wpoly, archPts, beam, rod, trussX, railing, ladder, ribs, streaks, patches, rollDoor, steelWindow, fireEscape,
  acUnit, vent, drum, ladderAB, crate, pallet, tyres, addPanel, arcPanel, panel, paintedWallSign, textSign, chainlinkTexture, signTexture, fitText, FONTS,
} from './city-kit.js';

// ═════════════════════════════════════════════════════════════════════════════
// A1. Rook's Garage — the start. Brick workshop with a roll-up door big enough for the RV.
//   `door` slides UP via position.y: 0 = closed, userData.door.open (4.4) = fully open
//   (the panel disappears into the thick header + stepped false front).
// ═════════════════════════════════════════════════════════════════════════════
export function buildRooksGarage() {
  const W = 18, D = 14, H = 7.2, zc = -2, fz = zc + D / 2; // building z ∈ [-9, 5], apron to +9
  const g = root('rooks_garage', 0, { w: W, h: 11.6, l: 18 });
  const k = new Kit(3001); k.floor = 0;
  const brick = C.brickRed, inner = '#8f887b', ceil = '#3f3d3a';
  const dx = 2.2, dw = 5.0, dh = 4.4, t = 0.6, wt = 0.35;
  const inside = (col) => (cx, cy, cz, nx, ny, nz) => (ny < -0.5 ? ceil : col);
  // apron + interior floor
  k.box('#8a867d', [W + 4, 0.04, 4], [0, 0, fz + 2], { base: true });
  k.box('#7d7a72', [W - 0.6, 0.03, D - 0.6], [0, 0, zc], { base: true });
  k.blob('#5f5c57', 1.6, [dx - 0.4, 0.05, -2.5], { seg: 9, seed: 3002, sx: 1.4, off: 0.002 });
  k.blob('#66625b', 1.2, [dx + 1.2, 0.06, fz + 1.4], { seg: 8, seed: 3003, off: 0.002 });
  // shell: back + side walls (whitewashed inside), front wall in thick pieces around the door
  const wallCol = (cx, cy, cz, nx, ny, nz) => (ny > 0.5 ? shade(brick, 0.9) : (nz > 0.5 && cz < zc) || (nx > 0.5 && cx < 0) || (nx < -0.5 && cx > 0) ? inner : brick);
  k.box(wallCol, [W, H, wt], [0, 0, zc - D / 2 + wt / 2], { base: true });
  k.box(wallCol, [wt, H, D - wt], [-W / 2 + wt / 2, 0, zc + wt / 2], { base: true });
  k.box(wallCol, [wt, H, D - wt], [W / 2 - wt / 2, 0, zc + wt / 2], { base: true });
  const frontCol = (cx, cy, cz, nx, ny, nz) => (nz < -0.5 ? inner : ny > 0.5 ? shade(brick, 0.9) : brick);
  const xl = dx - dw / 2, xr = dx + dw / 2;
  k.box(frontCol, [xl + W / 2, H, t], [(-W / 2 + xl) / 2, 0, fz - t / 2], { base: true });
  k.box(frontCol, [W / 2 - xr, H, t], [(xr + W / 2) / 2, 0, fz - t / 2], { base: true });
  k.box(frontCol, [dw, H - dh, t], [dx, dh, fz - t / 2], { base: true });
  // stepped false front (encloses the raised door panel)
  const steps = [[W, H, H + 0.7], [9.2, H + 0.7, H + 1.6], [5.6, H + 1.6, H + 2.2]];
  for (const [w_, y0, y1] of steps) {
    const cx = w_ === W ? 0 : dx;
    k.box(brick, [w_, y1 - y0, t], [cx, y0, fz - t / 2], { base: true });
    k.box(C.lintel, [w_ + 0.2, 0.18, t + 0.16], [cx, y1, fz - t / 2], { base: true });
  }
  // roof slab (dark tar on top, dark ceiling below), low side/back parapet
  k.box(inside('#5b5a57'), [W - 0.1, 0.3, D - t], [0, H - 0.3, zc - t / 2], { base: true });
  k.box(brick, [W, 0.5, wt], [0, H, zc - D / 2 + wt / 2], { base: true });
  for (const s of [-1, 1]) k.box(brick, [wt, 0.5, D - t], [s * (W / 2 - wt / 2), H, zc - t / 2], { base: true });
  const F = walls(W, D, 0, zc);
  // facade: lintel over the door, jamb guards, steel corner guards
  wr(k, F.front, [xl - 0.25, xr + 0.25], [dh, dh + 0.45], '#3a3836', 0.02);
  for (const x of [xl - 0.35, xr + 0.35]) {
    k.box(C.safety, [0.32, 1.1, 0.32], [x, 0, fz + 0.25], { base: true });
    for (let i = 0; i < 3; i++) k.box(C.iron, [0.34, 0.12, 0.34], [x, 0.2 + i * 0.35, fz + 0.25], { base: true });
  }
  wr(k, F.front, [xl - 0.12, xl], [0, dh], '#2f2f30', 0.02);
  wr(k, F.front, [xr, xr + 0.12], [0, dh], '#2f2f30', 0.02);
  // office: window with blinds + "OPEN" + door
  const ow = [-7.8, -3.9];
  wr(k, F.front, [ow[0] - 0.2, ow[1] + 0.2], [0.85, 3.05], C.lintel, 0.012);
  wr(k, F.front, ow, [1.0, 2.9], '#3a464c', 0.02);
  wr(k, F.front, [ow[0] + 0.1, ow[1] - 0.1], [1.05, 1.9], C.lit, 0.024);
  for (let y = 2.0; y < 2.85; y += 0.17) wr(k, F.front, [ow[0] + 0.1, ow[1] - 1.2], [y, y + 0.09], '#b8b09a', 0.026);
  wr(k, F.front, [ow[1] - 1.05, ow[1] - 0.25], [2.1, 2.6], '#d9583e', 0.03);
  wr(k, F.front, [ow[0] + 0.1, ow[1] - 0.1], [1.92, 1.98], '#2a2a2a', 0.03);
  wr(k, F.front, [-2.75, -1.65], [0, 2.4], C.lintel, 0.012);
  wr(k, F.front, [-2.65, -1.75], [0, 2.3], '#3e5a54', 0.02);
  wr(k, F.front, [-2.5, -1.9], [1.3, 2.1], '#3a464c', 0.026);
  // gooseneck lamps over the door + downpipes
  for (const x of [xl + 0.6, xr - 0.6]) {
    k.box(C.iron, [0.06, 0.06, 0.6], [x, dh + 0.5, fz + 0.3]);
    k.cone('#3f5a54', 0.25, 0.22, [x, dh + 0.3, fz + 0.6], { base: true, seg: 6 });
    k.cyl(PAL.lampWarm, 0.18, 0.18, 0.02, [x, dh + 0.3, fz + 0.6], { seg: 6 });
  }
  for (const x of [-W / 2 + 0.2, W / 2 - 0.2]) k.cyl('#5f6468', 0.07, 0.07, H, [x, 0, fz + 0.12], { base: true, seg: 5 });
  // brick wear
  for (const f of [F.front, F.left, F.right, F.back]) {
    band(k, f, 0, 0.7, mix(brick, C.dirt, 0.35), 0.008);
    patches(k, f, 4, 1, H - 1, brick, 3010 + f.at);
  }
  streaks(k, F.front, 6, 0.8, H, shade(brick, 0.82), 3011, 0.18);
  // side office window (−X) + high windows on the right side and back
  steelWindow(k, F.right, 2.5, 1.1, 2.4, 1.6, { seed: 3012, rows: 2, cols: 4, lit: 0.6, odd: 0.25 });
  for (const z of [-6, -2]) steelWindow(k, F.left, z, 4.2, 2.6, 1.6, { seed: 3013 + z, rows: 2, cols: 4 });
  for (const x of [-5, 5]) steelWindow(k, F.back, x, 4.0, 3.0, 1.8, { seed: 3016 + x, rows: 2, cols: 5 });
  // interior (seen through the open door): pegboard + bench + lift + lights + tyres
  const zb = zc - D / 2 + wt + 0.02;
  k.rectZ('#8a6f50', zb, [dx - 2.6, dx + 2.6], [1.2, 2.8], 1, { off: 0.01 });
  const r = rng(3020);
  for (let i = 0; i < 16; i++) { const x = dx - 2.4 + (i % 8) * 0.62, y = 1.4 + Math.floor(i / 8) * 0.7; k.rectZ(r() < 0.3 ? '#9c3a2e' : '#2a2b2d', zb + 0.01, [x, x + 0.14 + r() * 0.2], [y, y + 0.35 + r() * 0.2], 1, { off: 0.012 }); }
  k.box('#6a5038', [5.2, 0.9, 0.8], [dx, 0, zb + 0.4], { base: true });
  k.box('#9c3a2e', [1.0, 1.0, 0.6], [dx - 3.6, 0, zb + 0.32], { base: true }); // tool chest
  for (const x of [dx - 3.0, dx + 3.0]) k.box('#3f6f6b', [0.4, 3.6, 0.4], [x, 0, -3.5], { base: true });
  for (const x of [dx - 3.0, dx + 3.0]) for (const s of [-1, 1]) k.box('#3a3b3d', [1.6, 0.12, 0.2], [x - Math.sign(x - dx) * 0.8, 0.5, -3.5 + s * 0.6], { rot: [0, s * 0.25, 0] });
  for (const z of [-1.5, -5.5]) { k.box('#3a3b3d', [3.0, 0.08, 0.3], [dx, 6.3, z]); k.box('#f4ecd0', [2.8, 0.03, 0.18], [dx, 6.25, z]); }
  tyres(k, -6.8, -7.8, 4); tyres(k, -6.0, -7.9, 3);
  k.box('#5f6064', [0.8, 0.6, 0.6], [6.6, 0.6, -7.6], { base: true }); // engine block on a stand
  k.box('#3a3b3d', [0.2, 0.6, 0.2], [6.6, 0, -7.6], { base: true });
  // tow hook: wall jib on the right of the door with chain + hook
  const jx = 8.05;
  k.box(C.iron, [0.25, 0.25, 2.4], [jx, 5.6, fz + 1.2]);
  beam(k, C.iron, [jx, 4.3, fz + 0.1], [jx, 5.5, fz + 1.6], 0.14);
  k.box(C.iron, [0.4, 1.6, 0.15], [jx, 4.3, fz + 0.08], { base: true });
  k.box('#5f6064', [0.3, 0.2, 0.3], [jx, 5.38, fz + 2.2]);
  rod(k, '#3a3b3d', [jx, 5.3, fz + 2.2], [jx, 2.4, fz + 2.2], 0.03, 4);
  k.torus(C.safety, 0.22, 0.06, [jx, 2.2, fz + 2.2], { rot: [0, Math.PI / 2, 0], rs: 4, ts: 8, arc: Math.PI * 1.5 });
  k.box(C.safety, [0.08, 0.3, 0.08], [jx, 2.45, fz + 2.2]);
  for (let i = 0; i < 5; i++) k.torus('#3a3b3d', 0.35 - i * 0.04, 0.04, [jx - 0.8, 0.06 + i * 0.05, fz + 2.6], { rot: [Math.PI / 2, 0, 0], rs: 3, ts: 8 });
  // oil drums, a lying drum, tyre stack by the office, cylinder cage
  const dc = ['#3e5a7a', '#9c4a32', '#3f6f6b', '#5f6468'];
  [[7.3, fz + 0.6], [8.0, fz + 0.9], [7.6, fz + 1.4], [-8.4, fz + 0.6]].forEach(([x, z], i) => drum(k, x, z, dc[i]));
  drum(k, 6.5, fz + 1.8, '#9c4a32', 0, { lying: 'x' });
  tyres(k, -8.4, fz + 1.7, 3);
  k.box('#5f6468', [1.2, 1.6, 0.7], [-5.0, 0, fz + 0.4], { base: true }); // gas-cylinder cage
  for (let i = 0; i < 3; i++) k.cyl(i % 2 ? '#d9cfb3' : '#4f6b4a', 0.13, 0.13, 1.3, [-5.4 + i * 0.4, 0.05, fz + 0.4], { base: true, seg: 6 });
  // roof: AC, vents, skylights, rooftop sign frame
  acUnit(k, 4.5, H, -6.5, 1.1);
  vent(k, -2, H, -6, 1.0); vent(k, 6.5, H, -2.5, 0.8);
  for (const z of [-3.5, -0.5]) k.box('#41505a', [2.4, 0.5, 1.6], [-4.5, H, z], { base: true, c: 0.05 });
  const sx = -3.6, sz = -6.2, sy = H + 1.4;
  for (const x of [sx - 2.6, sx + 2.6]) { k.box(C.iron, [0.18, 4.4, 0.18], [x, H, sz], { base: true }); beam(k, C.iron, [x, H, sz - 1.6], [x, H + 2.6, sz], 0.12); }
  k.box('#3a3836', [6.4, 2.5, 0.2], [sx, sy + 1.25, sz - 0.12]);
  k.box(C.iron, [6.6, 0.1, 0.8], [sx, sy - 0.15, sz + 0.2]);
  g.add(k.mesh('body'));
  // the roll-up door (named pivot, slides up)
  const kd = new Kit(3030);
  const dcol = '#5f7f72', pw = dw + 0.12;
  kd.box(dcol, [pw, dh, 0.06], [0, dh / 2, 0]);
  const n = 14;
  for (let i = 1; i < n; i++) { const y = (i / n) * dh; kd.rectZ(shade(dcol, 0.8), 0.03, [-pw / 2, pw / 2], [y - 0.025, y + 0.02], 1, { off: 0.004 }); }
  kd.rectZ(mix(dcol, C.rust, 0.25), 0.03, [-pw / 2, pw / 2], [0.12, 1.2], 1, { off: 0.003 });
  kd.rectZ(mix(dcol, C.rust, 0.5), 0.03, [-pw / 2, pw / 2], [0.12, 0.5], 1, { off: 0.0035 });
  kd.rectZ('#3a3b3d', 0.03, [-pw / 2, pw / 2], [0, 0.14], 1, { off: 0.006 });
  for (const [x, y] of [[-1.4, 1.5], [1.1, 0.9], [1.8, 2.6]]) kd.rectZ(shade(dcol, 0.72), 0.03, [x - 0.3, x + 0.25], [y - 0.12, y + 0.14], 1, { off: 0.005 });
  for (let i = 0; i < 4; i++) kd.rectZ('#3a464c', 0.03, [-1.9 + i * 1.05, -1.2 + i * 1.05], [3.1, 3.45], 1, { off: 0.005 });
  kd.box('#2a2a2b', [0.4, 0.06, 0.08], [0, 0.6, 0.06]); // handle
  const door = new THREE.Object3D();
  door.name = 'door';
  door.position.set(dx, 0, fz - t / 2);
  door.add(kd.mesh('door_mesh'));
  g.add(door);
  // signs: hand-painted facade band + rooftop board
  const tex = paintedWallSign('sign_rooks_wall', [], {
    w: 1024, h: 128, bg: '#8a4a38',
    draw: (ctx, Wc, Hc) => {
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(30,15,10,0.45)'; fitText(ctx, "ROOK'S GARAGE", Wc * 0.03 + 4, Hc * 0.55 + 4, Wc * 0.5, 96, '900', FONTS.SANS);
      ctx.fillStyle = '#efe6cf'; fitText(ctx, "ROOK'S GARAGE", Wc * 0.03, Hc * 0.55, Wc * 0.5, 96, '900', FONTS.SANS);
      ctx.fillStyle = '#e2b54a'; fitText(ctx, '— REPAIRS & TOWING', Wc * 0.56, Hc * 0.56, Wc * 0.42, 62, '900', FONTS.SANS);
    },
  });
  addPanel(g, tex, 15.2, 1.9, [-0.55, 5.95, fz + 0.015]);
  const tex2 = signTexture({
    key: 'sign_rooks_roof', w: 512, h: 200, bg: '#d9a83a',
    draw: (ctx, Wc, Hc) => {
      ctx.strokeStyle = '#2a2622'; ctx.lineWidth = 10; ctx.strokeRect(8, 8, Wc - 16, Hc - 16);
      ctx.fillStyle = '#2a2622'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      fitText(ctx, "ROOK'S", Wc * 0.07, Hc * 0.4, Wc * 0.62, 110, '900', FONTS.SANS);
      fitText(ctx, 'TOWING · 24 HR', Wc * 0.07, Hc * 0.78, Wc * 0.6, 40, '900', FONTS.SANS);
      // wrench glyph
      ctx.save(); ctx.translate(Wc * 0.84, Hc * 0.5); ctx.rotate(-0.75);
      ctx.fillStyle = '#9c3a2e'; ctx.fillRect(-11, -10, 22, 92);
      ctx.beginPath(); ctx.arc(0, -30, 34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d9a83a'; ctx.fillRect(-12, -70, 24, 44);
      ctx.restore();
    },
  });
  addPanel(g, tex2, 6.2, 2.4, [sx, sy + 1.25, sz - 0.01]);
  g.add(empty('bay', [dx, 0, -2.2]));
  g.userData.door = { axis: 'y', closed: 0, open: dh, width: dw, height: dh };
  g.userData.bay = { x: dx, z: -2.2, note: 'RV parks here facing +Z (drives out through the door)' };
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// B2. Factory — brick, sawtooth north-light roof, tall chimney (`smoke` at the mouth).
// ═════════════════════════════════════════════════════════════════════════════
const FACTORY = [
  { W: 32, D: 20, H: 9, teeth: 4, brick: C.brickRed, roof: '#a19d93', chim: [-11.5, -5.5], chimH: 30, name: 'DRY CREEK IRONWORKS', sub: 'EST. 1911 · CASTINGS · FORGINGS', style: 'red brick' },
  { W: 28, D: 22, H: 9.5, teeth: 5, brick: C.brickBuff, roof: '#9a958a', chim: [9.5, -6.5], chimH: 26, name: 'COPPERLINE CASTINGS CO.', sub: 'BRASS · BRONZE · IRON', style: 'buff brick' },
];
export function buildFactory(variant = 0) {
  const v = vwrap(variant, 2), s = FACTORY[v];
  const { W, D, H } = s;
  const g = root('factory', v, { w: W + 4, h: s.chimH + 1, l: D + 2 }, { style: s.style });
  const k = new Kit(3100 + v); k.floor = 0;
  const brick = s.brick, F = walls(W, D);
  k.box(brick, [W, H, D], [0, 0, 0], { base: true });
  k.box(shade(brick, 0.72), [W + 0.1, 0.6, D + 0.1], [0, 0, 0], { base: true });
  // sawtooth roof: glazed vertical faces look toward +Z (the road), slopes clad in roofing
  const n = s.teeth, sp = D / n, th = 2.6;
  const prof = [[-D / 2 - 0.02, H - 0.05], [-D / 2 - 0.02, H]];
  for (let i = 0; i < n; i++) { const z1 = -D / 2 + (i + 1) * sp + (i === n - 1 ? 0.02 : 0); prof.push([z1, H + th]); prof.push([z1, i === n - 1 ? H - 0.05 : H]); }
  const glassC = '#7d9096';
  k.extrude((cx, cy, cz, nx, ny, nz) => (nz > 0.7 ? glassC : Math.abs(nx) > 0.7 ? brick : ny < -0.5 ? '#333' : s.roof), prof, W + 0.3, { axis: 'x' });
  for (let i = 0; i < n; i++) {
    const z1 = -D / 2 + (i + 1) * sp, f = { axis: 'z', at: z1, dir: 1, u: [-W / 2, W / 2] };
    for (let u = -W / 2 + 1.6; u < W / 2 - 0.5; u += 1.6) wr(k, f, [u - 0.06, u + 0.06], [H, H + th], '#3a3c3d', 0.012);
    wr(k, f, [-W / 2, W / 2], [H + th - 0.25, H + th], shade(s.roof, 0.8), 0.014);
    wr(k, f, [-W / 2, W / 2], [H + th * 0.48, H + th * 0.52], '#2a2d2f', 0.012);
    const r = rng(3110 + i + v * 10);
    for (let j = 0; j < 6; j++) { const u = -W / 2 + 1.6 * Math.floor(1 + r() * (W / 1.6 - 2)); const lo = r() < 0.5; wr(k, f, [u + 0.06, u + 1.54], [H + (lo ? 0.05 : th / 2 + 0.05), H + (lo ? th / 2 - 0.05 : th - 0.3)], r() < 0.35 ? C.lit : r() < 0.5 ? '#4d5a5e' : '#a3b2b4', 0.015); }
    // roof slope seams (run down the slope)
    for (let x = -W / 2 + 1.2; x < W / 2; x += 2.4) {
      const z0 = z1 - sp;
      k.poly(shade(s.roof, 0.85), [[x - 0.05, H + 0.02, z0 + 0.02], [x + 0.05, H + 0.02, z0 + 0.02], [x + 0.05, H + th + 0.02, z1 - 0.02], [x - 0.05, H + th + 0.02, z1 - 0.02]], { facing: [0, 1, -0.4], off: 0.01 });
    }
  }
  // facade: brick piers + tall arched steel windows + loading door + corbelled cornice
  const bays = v ? 6 : 7, bw = W / bays;
  for (let i = 0; i <= bays; i++) fbox(k, shade(brick, 1.05), F.front, -W / 2 + i * bw, H / 2, 0.6, H, 0.3, 0.15);
  for (let i = 0; i < bays; i++) {
    const uc = -W / 2 + (i + 0.5) * bw;
    if (i === (v ? 4 : 1)) { rollDoor(k, F.front, uc, bw - 1.4, 4.4, v ? '#7d8a8c' : '#5f7f72', { slat: 0.4 }); wr(k, F.front, [uc - bw / 2 + 0.6, uc + bw / 2 - 0.6], [4.75, 5.05], '#3a3836', 0.02); continue; }
    steelWindow(k, F.front, uc, 1.2, bw - 1.6, 3.8, { arch: 0.6, seed: 3120 + i + v * 10, cols: 4, rows: 5, lit: 0.45, odd: 0.1 });
  }
  band(k, F.front, H - 1.1, H - 0.8, shade(brick, 0.85), 0.03);
  band(k, F.front, H - 0.5, H, C.lintel, 0.03);
  // sides + back: windows, wear, pipes
  for (const f of [F.left, F.right]) {
    const nb = Math.round(D / 5);
    for (let i = 0; i < nb; i++) steelWindow(k, f, f.u[0] + (i + 0.5) * D / nb, 2.2, 2.4, 3.2, { arch: 0.5, seed: 3130 + i + v, cols: 4, rows: 5, lit: 0.3 });
  }
  for (const f of [F.front, F.left, F.right, F.back]) {
    band(k, f, 0.6, 1.4, mix(brick, C.dirt, 0.3), 0.006);
    patches(k, f, 5, 1.5, H - 1, brick, 3140 + v + f.at);
    streaks(k, f, 5, 1, H, mix(brick, C.soot, 0.25), 3141 + f.at + v, 0.2);
  }
  // chimney (round, tapered, banded, sooty) — `smoke` pivot at the mouth
  const [cx, cz] = s.chim, cH = s.chimH, rB = 1.9, rT = 1.15;
  k.box(shade(brick, 0.92), [4.2, H + 1.5, 4.2], [cx, 0, cz], { base: true });
  k.box(C.lintel, [4.4, 0.3, 4.4], [cx, H + 1.5, cz], { base: true });
  k.cyl(brick, rT, rB, cH - H - 1.8, [cx, H + 1.8, cz], { base: true, seg: 10, open: true });
  const rAt = (y) => rB + (rT - rB) * (y - H - 1.8) / (cH - H - 1.8);
  for (const y of [H + 6, H + 12, cH - 6]) k.cyl(shade(brick, 0.78), rAt(y) + 0.06, rAt(y) + 0.06, 0.35, [cx, y, cz], { seg: 10, open: true });
  k.cyl(C.soot, rT + 0.02, rT + 0.02, 2.4, [cx, cH - 2.4, cz], { base: true, seg: 10, open: true });
  k.cyl(shade(brick, 0.55), rT + 0.3, rT + 0.12, 0.9, [cx, cH - 0.9, cz], { base: true, seg: 10 });
  const ly0 = H + 2, ly1 = cH - 3;
  for (const sx of [-0.22, 0.22]) beam(k, '#3a3b3d', [cx + sx, ly0, cz + rAt(ly0) + 0.2], [cx + sx, ly1, cz + rAt(ly1) + 0.2], 0.05);
  for (let y = ly0 + 0.4; y < ly1; y += 0.5) k.box('#3a3b3d', [0.44, 0.03, 0.03], [cx, y, cz + rAt(y) + 0.2]);
  // extras: dust cyclone + ducting (v0) / rusted tank + lean-to (v1), pipe runs, roof vents
  if (v === 0) {
    const x = W / 2 + 2.2, z = -4;
    k.cyl('#8f948f', 1.1, 1.1, 2.6, [x, 5.2, z], { base: true, seg: 8 });
    k.cone('#8f948f', 1.1, 2.4, [x, 2.8, z], { base: true, seg: 8, rot: [Math.PI, 0, 0] });
    for (const [a, b] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) k.box(C.ironLight, [0.14, 5.2, 0.14], [x + a, 0, z + b], { base: true });
    rod(k, '#7d8285', [x, 7.8, z], [x - 2.5, H + 1.2, z], 0.35, 6);
    rod(k, '#7d8285', [x, 7.8, z], [x, 9.6, z], 0.3, 6);
  } else {
    const x = -W / 2 - 3, z = 2;
    k.box(C.tin, [5, 4.2, 9], [x + 0.5, 0, z], { base: true });
    ribs(k, walls(5, 9, x + 0.5, z).front, 0, 4.2, C.tin, 0.5);
    ribs(k, walls(5, 9, x + 0.5, z).right, 0, 4.2, C.tin, 0.5);
    k.box(shade(C.tin, 0.85), [5.6, 0.12, 9.6], [x + 0.5, 4.3, z], { rot: [0, 0, 0.12] });
    rollDoor(k, walls(5, 9, x + 0.5, z).front, x + 0.5, 3.2, 3.2, '#9a968c');
    k.cyl(mix('#8f948f', C.rust, 0.5), 1.4, 1.4, 4.5, [W / 2 + 2.2, 1.4, -6], { axis: 'z', seg: 9 });
    for (const zz of [-8, -4]) k.box(C.ironLight, [2.4, 1.4, 0.3], [W / 2 + 2.2, 0, zz], { base: true });
  }
  rod(k, '#6f7478', [-W / 2 + 1, H - 0.6, D / 2 + 0.35], [W / 2 - 1, H - 0.6, D / 2 + 0.35], 0.16, 6);
  for (const x of [-W / 2 + 1, W / 2 - 1]) rod(k, '#6f7478', [x, 0, D / 2 + 0.35], [x, H - 0.6, D / 2 + 0.35], 0.16, 6);
  for (let i = 0; i < 3; i++) vent(k, -W / 2 + 6 + i * 8, H + th, -D / 2 + (i + 1) * sp - 0.8, 1.2, 0.3);
  drum(k, W / 2 - 3, D / 2 + 1.0, '#9c4a32'); drum(k, W / 2 - 2.3, D / 2 + 1.2, '#3e5a7a'); pallet(k, W / 2 - 5, 0, D / 2 + 1.1);
  g.add(k.mesh('body'));
  // smoke pivot: its mesh is the sooty mouth disc (emit particles at its world position)
  const ks = new Kit(3150);
  ks.cyl('#1d1b1a', rT * 0.9, rT * 0.9, 0.06, [0, -0.25, 0], { seg: 10 });
  const smoke = new THREE.Object3D();
  smoke.name = 'smoke'; smoke.position.set(cx, cH, cz);
  smoke.add(ks.mesh('smoke_mesh', undefined, false));
  g.add(smoke);
  const tex = paintedWallSign('sign_factory_' + v, [
    { text: s.name, y: 0.42, px: 92, color: 'rgba(236,228,206,0.82)' },
    { text: s.sub, y: 0.82, px: 40, color: 'rgba(226,190,110,0.8)' },
  ], { w: 1024, h: 150, bg: shade(brick, 0.96), chips: 120, chip: 'rgba(120,70,50,0.6)' });
  addPanel(g, tex, 13.6, 13.6 * 150 / 1024, [0, H - 2.05, D / 2 + 0.32]);
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// B3. Warehouse — corrugated shed, loading dock, roll doors. 3 colour/size variants.
// ═════════════════════════════════════════════════════════════════════════════
const WAREHOUSE = [
  { W: 26, D: 16, H: 7.5, bays: 3, wall: '#7f9a96', roof: '#9d9f9a', door: '#d9d4c4', name: 'SUNDOWN STORAGE & FREIGHT', canopy: true, style: 'teal' },
  { W: 32, D: 18, H: 8.5, bays: 4, wall: '#cdbb9a', roof: '#8f8a80', door: '#7a8a8c', name: 'HALBERG BROS. FREIGHT', canopy: true, office: true, style: 'cream' },
  { W: 20, D: 14, H: 6.5, bays: 2, wall: '#7d93ad', roof: '#a7a59b', door: '#e2dccb', name: 'MESA COLD STORAGE', canopy: false, style: 'blue' },
];
export function buildWarehouse(variant = 0) {
  const v = vwrap(variant, 3), s = WAREHOUSE[v];
  const { W, D, H } = s;
  const g = root('warehouse', v, { w: W, h: H + 3, l: D + 4 }, { style: s.style });
  const k = new Kit(3200 + v); k.floor = 0;
  const zc = -1.5, F = walls(W, D, 0, zc);
  k.box(s.wall, [W, H, D], [0, 0, zc], { base: true });
  k.box('#8f8b82', [W + 0.1, 0.5, D + 0.1], [0, 0, zc], { base: true });
  // low-pitch gable roof (ridge along X) + gable-end triangles
  const rh = 2.2, o = 0.5, e = D / 2 + o, slope = rh / (D / 2), ye = H - o * slope;
  k.extrude((cx, cy, cz, nx, ny) => (ny < -0.3 ? shade(s.roof, 0.55) : Math.abs(ny) < 0.3 ? shade(s.roof, 0.7) : s.roof), [[-e, ye], [0, H + rh], [e, ye], [e, ye + 0.15], [0, H + rh + 0.17], [-e, ye + 0.15]], W + 0.6, { axis: 'x', pos: [0, 0, zc] });
  k.extrude(s.wall, [[-D / 2, H - 0.02], [D / 2, H - 0.02], [0, H + rh - 0.04]], W, { axis: 'x', pos: [0, 0, zc] });
  for (let x = -W / 2; x <= W / 2; x += 1.1) for (const sd of [1, -1]) {
    k.poly(shade(s.roof, 0.86), [[x - 0.05, ye + 0.16, zc + sd * e], [x + 0.05, ye + 0.16, zc + sd * e], [x + 0.05, H + rh + 0.18, zc], [x - 0.05, H + rh + 0.18, zc]], { facing: [0, 1, sd * slope], off: 0.012 });
  }
  for (let x = -W / 2 + 3; x < W / 2 - 2; x += 6) for (const sd of [1, -1]) {
    const t0 = 0.3, t1 = 0.65, y0 = ye + 0.16 + (H + rh - ye) * t0, y1 = ye + 0.16 + (H + rh - ye) * t1;
    k.poly('#c9cfc9', [[x, y0 + 0.02, zc + sd * e * (1 - t0)], [x + 2.2, y0 + 0.02, zc + sd * e * (1 - t0)], [x + 2.2, y1 + 0.02, zc + sd * e * (1 - t1)], [x, y1 + 0.02, zc + sd * e * (1 - t1)]], { facing: [0, 1, sd * slope], off: 0.016 });
  }
  k.box(shade(s.roof, 0.8), [W + 0.6, 0.12, 0.5], [0, H + rh + 0.12, zc], { base: true });
  for (const f of Object.values(F)) { ribs(k, f, 0.5, H, s.wall, 0.6, 0.14); band(k, f, 0.5, 1.2, mix(s.wall, C.dirt, 0.35), 0.014); streaks(k, f, 5, 1, H, mix(s.wall, C.rust, 0.45), 3210 + v + f.at, 0.12); }
  // loading dock along the front, roll doors, bumpers, dock lamps
  const dockH = 1.2, dd = 2.6, fz = zc + D / 2;
  const span = W - (s.office ? 8 : 3), x0 = -W / 2 + 1.5;
  k.box('#9a968c', [span, dockH, dd], [x0 + span / 2, 0, fz + dd / 2], { base: true });
  k.box(C.safety, [span, 0.12, 0.08], [x0 + span / 2, dockH - 0.12, fz + dd + 0.02], { base: true });
  for (let i = 0; i < 4; i++) k.box('#9a968c', [1.4, (i + 1) * 0.3, 0.34], [x0 - 0.7, 0, fz + dd - 0.2 - i * 0.34], { base: true });
  const bw = span / s.bays;
  for (let i = 0; i < s.bays; i++) {
    const uc = x0 + (i + 0.5) * bw;
    const dw2 = Math.min(3.6, bw - 1.8);
    rollDoor(k, F.front, uc, dw2, 3.2, s.door, { y0: dockH });
    for (const sx of [-1, 1]) k.box('#1f2022', [0.3, 0.5, 0.25], [uc + sx * 1.3, dockH - 0.65, fz + dd + 0.12], { base: true });
    k.box('#4a4b4d', [0.12, 0.12, 0.7], [uc + dw2 / 2 + 0.55, dockH + 3.5, fz + 0.35]);
    k.box(PAL.lampWarm, [0.3, 0.08, 0.3], [uc + dw2 / 2 + 0.55, dockH + 3.4, fz + 0.7]);
    // painted bay number plate (tally marks) beside the door
    const pu = uc + dw2 / 2 + 0.6;
    wr(k, F.front, [pu - 0.4, pu + 0.4], [dockH + 1.8, dockH + 2.4], '#e9e2cf', 0.024);
    for (let j = 0; j <= i; j++) wr(k, F.front, [pu - 0.27 + j * 0.16, pu - 0.19 + j * 0.16], [dockH + 1.9, dockH + 2.3], '#2a2a2a', 0.03);
  }
  if (s.canopy) {
    k.box(shade(s.roof, 0.95), [span + 0.6, 0.12, 3.0], [x0 + span / 2, dockH + 4.0, fz + 1.5], { rot: [0.1, 0, 0] });
    for (let i = 0; i <= s.bays; i++) beam(k, C.ironLight, [x0 + i * bw, dockH + 3.5, fz], [x0 + i * bw, dockH + 3.85, fz + 2.8], 0.12);
  }
  if (s.office) { // office block with windows + man door at +X
    const ox = W / 2 - 3.5;
    k.box('#d9d0bc', [6, 3.4, 0.4], [ox, 0, fz + 0.2], { base: true });
    const of = { axis: 'z', at: fz + 0.4, dir: 1, u: [ox - 3, ox + 3] };
    windowGrid(k, of, [[1.0, 2.6]], 2, 1.6, { trim: '#efe6cf', lit: 0.5, seed: 3220, margin: 1.4, blinds: 0.5 });
    wr(k, of, [ox - 0.5, ox + 0.5], [0, 2.2], '#3e5a7a', 0.02);
    k.box('#5f6468', [3, 0.1, 1.2], [ox, 2.6, fz + 0.9]);
  } else {
    wr(k, F.front, [W / 2 - 1.2, W / 2 - 0.2], [0.5, 2.6], '#5e4632', 0.024);
  }
  // side door, downpipes, roof turbines, pallets + crates
  wr(k, F.left, [zc - 1, zc + 0.2], [0.5, 2.6], s.door, 0.024);
  for (const x of [-W / 2 + 0.25, W / 2 - 0.25]) k.cyl('#5f6468', 0.08, 0.08, H, [x, 0, fz + 0.12], { base: true, seg: 5 });
  for (let i = 0; i < Math.round(W / 9); i++) { const x = -W / 2 + 4 + i * 9; k.cyl('#a9aca7', 0.32, 0.32, 0.6, [x, H + rh - 0.3, zc], { base: true, seg: 8 }); k.lathe('#c4c6c0', [[0.42, 0], [0.36, 0.3], [0, 0.42]], 8, [x, H + rh + 0.3, zc]); }
  pallet(k, -W / 2 + 0.8, 0, fz + dd + 1.2, 0.3); crate(k, -W / 2 + 0.8, 0.15, fz + dd + 1.2, 1, '#a8865e', 0.3);
  pallet(k, W / 2 - 1.2, 0, fz + 1.4, -0.2);
  g.add(k.mesh('body'));
  const tex = paintedWallSign('sign_warehouse_' + v, [{ text: s.name, y: 0.55, px: 96, color: '#efe9dc' }], { w: 1024, h: 120, bg: shade(s.wall, 0.82), brick: false, chips: 60, chip: 'rgba(90,90,90,0.45)' });
  addPanel(g, tex, 11.2, 11.2 * 120 / 1024, [s.office ? -3.5 : -1.0, H - 0.85, fz + 0.03]);
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// B4. Rail shed — brick engine house, two arched track doorways (+Z), monitor roof.
// ═════════════════════════════════════════════════════════════════════════════
export function buildRailShed() {
  const W = 18, D = 32, H = 8.5;
  const g = root('rail_shed', 0, { w: W, h: H + 6, l: D + 6 });
  const k = new Kit(3300); k.floor = 0;
  const brick = '#7e4a3a', roof = '#5a5f63', zc = -3, fz = zc + D / 2;
  const F = walls(W, D, 0, zc);
  k.box(brick, [W, H, D], [0, 0, zc], { base: true });
  k.box(shade(brick, 0.75), [W + 0.1, 0.7, D + 0.1], [0, 0, zc], { base: true });
  // gable roof with ridge along Z (gables face the tracks) + clerestory smoke vent
  const rh = 4.2, o = 0.5, e = W / 2 + o, ye = H - o * rh / (W / 2);
  k.extrude((cx, cy, cz, nx, ny) => (ny < -0.3 ? '#3a3b3c' : Math.abs(ny) < 0.3 ? shade(roof, 0.7) : roof), [[-e, ye], [0, H + rh], [e, ye], [e, ye + 0.2], [0, H + rh + 0.22], [-e, ye + 0.2]], D + 0.8, { axis: 'z', pos: [0, 0, zc] });
  k.extrude(brick, [[-W / 2, H - 0.02], [W / 2, H - 0.02], [0, H + rh - 0.05]], D, { axis: 'z', pos: [0, 0, zc] });
  k.box('#4a4c4e', [2.4, 1.3, D - 4], [0, H + rh, zc], { base: true });
  for (let z = zc - D / 2 + 3; z < zc + D / 2 - 2; z += 1.6) for (const s of [-1, 1]) k.rectX('#2a2b2c', s * 1.21, [z, z + 0.9], [H + rh + 0.25, H + rh + 1.05], s, { off: 0.01 });
  k.box(roof, [3.2, 0.15, D - 3.6], [0, H + rh + 1.3, zc], { base: true });
  for (const z of [zc - 8, zc + 2]) { k.box('#3a3b3c', [0.9, 2.2, 0.9], [-4, H + 1.6, z], { base: true }); k.box('#2a2a2a', [1.2, 0.2, 1.2], [-4, H + 3.8, z], { base: true }); }
  // slate courses
  const yTop = H + rh + 0.22, yEave = ye + 0.2, sl = (yTop - yEave) / e;
  for (let i = 1; i < 7; i++) {
    const x = e * (1 - i / 7.5);
    for (const s of [1, -1]) {
      const y0 = yTop - x * sl + 0.02, y1 = yTop - (x - 0.1) * sl + 0.02;
      k.poly(shade(roof, 0.82), [[s * x, y0, zc - D / 2 - 0.4], [s * x, y0, zc + D / 2 + 0.4], [s * (x - 0.1), y1, zc + D / 2 + 0.4], [s * (x - 0.1), y1, zc - D / 2 - 0.4]], { facing: [s * sl, 1, 0], off: 0.005 });
    }
  }
  // front: two arched doorways with open doors, pilasters, round window in the gable
  const doors = [-4.3, 4.3];
  for (const x of doors) {
    wpoly(k, F.front, archPts(x - 2.6, x + 2.6, 0, 5.4, 1.6), C.lintel, 0.012);
    wpoly(k, F.front, archPts(x - 2.3, x + 2.3, 0, 5.4, 1.4), '#1f1d1c', 0.02);
    for (const s of [-1, 1]) { // open timber doors folded back
      k.box('#6a4a32', [0.12, 6.2, 2.3], [x + s * 2.45, 0, fz + 1.2], { base: true, rot: [0, s * 0.25, 0] });
      k.box('#4f3826', [0.13, 0.2, 2.3], [x + s * 2.45, 3.0, fz + 1.2], { rot: [0, s * 0.25, 0] });
    }
  }
  for (const x of [-W / 2 + 0.35, 0, W / 2 - 0.35]) fbox(k, shade(brick, 1.06), F.front, x, H / 2, 0.7, H, 0.3, 0.15);
  k.cyl(C.lintel, 1.2, 1.2, 0.1, [0, H + 1.6, fz + 0.03], { axis: 'z', seg: 10 });
  k.cyl(C.glass, 0.95, 0.95, 0.1, [0, H + 1.6, fz + 0.08], { axis: 'z', seg: 10 });
  // sides: tall arched windows, buttress piers, wear
  for (const f of [F.left, F.right]) {
    for (let i = 0; i < 5; i++) {
      const u = f.u[0] + 3.2 + i * 6.4;
      steelWindow(k, f, u, 2.2, 2.6, 4.0, { arch: 0.9, archSeg: 4, seed: 3310 + i + f.at, cols: 4, rows: 5, lit: 0.25 });
      if (i < 4) fbox(k, shade(brick, 1.05), f, u + 3.2, H / 2, 0.6, H, 0.4, 0.2);
    }
    band(k, f, 0.7, 1.6, mix(brick, C.soot, 0.35), 0.006);
    streaks(k, f, 8, 1.5, H, mix(brick, C.soot, 0.4), 3320 + f.at, 0.25);
  }
  band(k, F.front, H - 0.4, H, C.lintel, 0.02);
  streaks(k, F.front, 4, 6, H + 3, mix(brick, C.soot, 0.45), 3321, 0.3);
  // tracks into the shed (rails, sleepers, ballast) + a buffer stop beside
  for (const x of doors) {
    k.box('#8d877c', [3.6, 0.22, 10], [x, 0, fz + 2], { base: true });
    for (let z = fz + 0.35; z < fz + 7; z += 0.75) k.box('#5a4a3c', [2.5, 0.12, 0.24], [x, 0.22, z], { base: true, noBottom: true });
    for (const s of [-1, 1]) { k.box('#6a4a3a', [0.08, 0.16, 10], [x + s * 0.72, 0.34, fz + 2], { base: true }); k.rectY('#b9b6ae', 0.5, [x + s * 0.72 - 0.035, x + s * 0.72 + 0.035], [fz - 3, fz + 7], { off: 0.002 }); }
  }
  k.box('#9c3a2e', [2.2, 1.1, 0.5], [W / 2 + 2.2, 0, fz + 4], { base: true, c: 0.05 });
  k.box(C.safety, [2.2, 0.15, 0.52], [W / 2 + 2.2, 0.75, fz + 4], { base: true });
  for (let i = 0; i < 3; i++) k.box('#5a4a3c', [0.24, 0.14, 2.6], [W / 2 + 1.2 + i * 0.4, i * 0.14, fz + 1.5], { base: true }); // stacked sleepers
  drum(k, -W / 2 - 1.1, fz - 1, '#3a3b3d'); drum(k, -W / 2 - 1.2, fz - 0.2, '#9c4a32');
  g.add(k.mesh('body'));
  const tex = paintedWallSign('sign_railshed', [{ text: 'DRY CREEK & WESTERN', y: 0.42, px: 84, color: 'rgba(236,228,206,0.85)' }, { text: 'ENGINE HOUSE No. 2', y: 0.8, px: 46, color: 'rgba(226,190,110,0.85)' }], { w: 1024, h: 200, bg: shade(brick, 0.96), chips: 110 });
  addPanel(g, tex, 10, 1.95, [0, 6.75, fz + 0.32]);
  g.userData.tracks = { x: doors, railTop: 0.5, gauge: 1.435 };
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// B5. Water tower — steel tank on four legs, faded painted lettering.
// ═════════════════════════════════════════════════════════════════════════════
export function buildWaterTowerCity() {
  const g = root('water_tower_city', 0, { w: 11, h: 28.5, l: 11 });
  const k = new Kit(3400); k.floor = 0;
  const paint = '#9fb0b4', steel = '#7f8a8e', Ht = 18, R = 4.2, Th = 6.2;
  const b = 4.2, t = 2.6; // half-spread of legs at ground / at the tank
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    beam(k, steel, [sx * b, 0, sz * b], [sx * t, Ht, sz * t], 0.42);
    k.box(C.concrete, [1.4, 0.6, 1.4], [sx * b, 0, sz * b], { base: true });
  }
  // X-bracing (tie rods) + horizontal struts on 3 levels
  const lv = [0.5, 6.4, 12.3, Ht];
  const at = (y) => b + (t - b) * (y / Ht);
  for (let i = 0; i < 3; i++) {
    const y0 = lv[i], y1 = lv[i + 1], a0 = at(y0), a1 = at(y1);
    for (const [ax, s] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]]) {
      const P = (a, y, side) => (ax === 'x' ? [side * a, y, s * a] : [s * a, y, side * a]);
      rod(k, '#5d6367', P(a0, y0, -1), P(a1, y1, 1), 0.045, 4);
      rod(k, '#5d6367', P(a0, y0, 1), P(a1, y1, -1), 0.045, 4);
      if (i > 0) beam(k, steel, P(a0, y0, -1), P(a0, y0, 1), 0.2);
    }
  }
  k.cyl('#6f787c', 0.55, 0.55, Ht, [0, 0, 0], { base: true, seg: 8 }); // riser pipe
  // tank: bowl bottom, shell with seams + rust streaks, catwalk + railing, cone roof + finial
  k.lathe(paint, [[0.6, 0], [R * 0.75, 0.9], [R, 1.6]], 12, [0, Ht - 1.6, 0]);
  k.cyl(paint, R, R, Th, [0, Ht, 0], { base: true, seg: 12, open: true });
  for (const y of [Ht + 2.1, Ht + 4.2]) k.cyl(shade(paint, 0.88), R + 0.02, R + 0.02, 0.08, [0, y, 0], { seg: 12, open: true });
  const r = rng(3401);
  for (let i = 0; i < 6; i++) { const a = r() * Math.PI * 2; k.box(mix(paint, C.rust, 0.55), [0.35, 1.5 + r() * 2.5, 0.05], [Math.sin(a) * (R + 0.02), Ht + 1.2 + r(), Math.cos(a) * (R + 0.02)], { rot: [0, a, 0] }); }
  k.lathe('#5d6367', [[R + 1.0, 0], [R - 0.1, 0]], 12, [0, Ht + 0.06, 0]);
  k.lathe('#4d5357', [[R - 0.1, 0], [R + 1.0, 0]], 12, [0, Ht - 0.02, 0]);
  k.cyl('#5d6367', R + 1.0, R + 1.0, 0.1, [0, Ht + 0.02, 0], { seg: 12, open: true });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; k.box('#5d6367', [0.05, 1.05, 0.05], [Math.sin(a) * (R + 0.95), Ht + 0.12, Math.cos(a) * (R + 0.95)], { base: true }); }
  k.torus('#5d6367', R + 0.95, 0.04, [0, Ht + 1.15, 0], { rot: [Math.PI / 2, 0, 0], rs: 3, ts: 16 });
  k.lathe(shade(paint, 0.85), [[R + 0.25, 0], [R * 0.3, 2.4], [0.3, 2.65], [0, 2.7]], 12, [0, Ht + Th, 0]);
  k.cyl('#5d6367', 0.06, 0.06, 1.6, [0, Ht + Th + 2.6, 0], { base: true, seg: 4 });
  k.ico(C.rustRed, 0.22, [0, Ht + Th + 4.2, 0], { detail: 0 });
  // ladder up a leg to the catwalk, then up the tank to the roof
  ladderAB(k, '#3a3b3d', [at(0.6) + 0.42, 0.6, at(0.6) + 0.42], [at(Ht) + 0.42, Ht, at(Ht) + 0.42], [0.156, 0, -0.156], [0.7, 0, 0.7], 0.5);
  ladder(k, '#3a3b3d', { axis: 'z', at: R, dir: 1, u: [-1, 1] }, 0, Ht + 0.2, Ht + Th + 2, 0.18, 0.44);
  k.blob('#8a8478', 6.5, [0, 0.02, 0], { seg: 10, seed: 3402, off: 0 });
  g.add(k.mesh('body'));
  const tex = signTexture({
    key: 'sign_watertower', w: 1024, h: 200, bg: paint,
    draw: (ctx, Wc, Hc) => {
      ctx.fillStyle = '#4f6470'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      fitText(ctx, 'DRY CREEK', Wc / 2, Hc * 0.5, Wc * 0.8, 150, '900', FONTS.SANS);
      ctx.fillStyle = 'rgba(159,176,180,0.55)'; const rr = rng(3403);
      for (let i = 0; i < 260; i++) ctx.fillRect(rr() * Wc, rr() * Hc, 6 + rr() * 30, 3 + rr() * 8);
    },
  });
  arcPanel(g, tex, R + 0.03, 1.5, Ht + 3.15, -0.85, 1.7, { fallback: paint });
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// B6. Overhead (yard gantry) crane — spans tracks along Z; legs run on their own rails.
// ═════════════════════════════════════════════════════════════════════════════
export function buildOverheadCrane() {
  const S = 24, Hg = 12;
  const g = root('overhead_crane', 0, { w: S + 2, h: Hg + 3, l: 14 });
  const k = new Kit(3500); k.floor = 0;
  const yel = '#c9a246', yelD = shade(yel, 0.8), r = rng(3501);
  for (const sx of [-1, 1]) {
    const x = sx * S / 2;
    // crane rail + bogie + A-frame leg
    k.box('#6a4a3a', [0.6, 0.2, 14], [x, 0, 0], { base: true });
    k.box('#5a4a3c', [1.6, 0.12, 14], [x, 0, 0], { base: true });
    k.box(yelD, [1.0, 1.0, 7.2], [x, 0.25, 0], { base: true });
    for (const z of [-3, -1.2, 1.2, 3]) k.cyl('#2a2b2d', 0.42, 0.42, 0.3, [x, 0.65, z], { axis: 'x', seg: 8 });
    for (const z of [-3.6, 3.6]) { k.box(C.iron, [1.02, 1.02, 0.12], [x, 0.25, z], { base: true }); for (let i = 0; i < 4; i++) k.box(i % 2 ? C.iron : C.safety, [1.04, 0.2, 0.14], [x, 0.3 + i * 0.2, z], { base: true }); }
    for (const sz of [-1, 1]) beam(k, yel, [x, 1.2, sz * 3.2], [x, Hg - 0.6, sz * 0.8], 0.6);
    beam(k, yelD, [x, 4.5, -2.3], [x, 4.5, 2.3], 0.3);
    beam(k, yelD, [x, 4.5, -2.3], [x, 8.5, 1.4], 0.18);
    k.box(yel, [1.4, 1.2, 2.8], [x, Hg - 0.8, 0], { base: true });
  }
  // twin box girders + walkway + rails for the trolley
  for (const z of [-0.95, 0.95]) {
    k.box(yel, [S + 1.4, 1.6, 0.7], [0, Hg, z], { base: true });
    k.box(yelD, [S + 1.4, 0.08, 0.72], [0, Hg + 0.75, z], { base: true });
    for (let x = -S / 2 + 1.5; x < S / 2; x += 3) k.rectZ(mix(yel, C.rust, 0.25), z + Math.sign(z) * 0.36, [x - 0.08, x + 0.08], [Hg + 0.1, Hg + 1.5], Math.sign(z), { off: 0.004 });
  }
  for (let x = -S / 2; x <= S / 2; x += 4) k.box(yelD, [0.3, 0.3, 1.2], [x, Hg + 0.6, 0]);
  railing(k, '#e2dccb', [-S / 2, Hg + 1.6, 1.32], [S / 2, Hg + 1.6, 1.32], 1.0, { step: 2 });
  k.box('#5f6064', [S + 1, 0.06, 0.7], [0, Hg + 1.6, 1.0], { base: true });
  for (let i = 0; i < 6; i++) k.rectZ(r() < 0.5 ? mix(yel, C.rust, 0.5) : shade(yel, 0.9), 1.31, [-S / 2 + r() * S, -S / 2 + r() * S + 0.8], [Hg + 0.2, Hg + 0.4 + r()], 1, { off: 0.005 });
  // trolley + hoist + hook block
  const tx = 3.5;
  k.box('#8f948f', [3.2, 1.3, 2.6], [tx, Hg + 1.6, 0], { base: true });
  k.cyl('#5f6064', 0.5, 0.5, 2.2, [tx - 0.4, Hg + 2.0, 0], { axis: 'z', seg: 8 });
  k.box('#3a3b3d', [0.9, 0.8, 0.9], [tx + 1.0, Hg + 2.9, 0.6], { base: true });
  for (const [dx, dz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) rod(k, '#2a2a2a', [tx + dx, Hg, dz], [tx + dx * 0.6, 6.4, dz * 0.6], 0.025, 3);
  k.box(C.safety, [0.8, 0.9, 0.6], [tx, 5.6, 0], { base: true });
  k.torus('#3a3b3d', 0.3, 0.09, [tx, 5.2, 0], { rot: [0, Math.PI / 2, 0], rs: 4, ts: 8, arc: Math.PI * 1.4 });
  // operator cab under the girder by the −X leg + ladder
  const cxp = -S / 2 + 2.6;
  k.box('#e2dccb', [2.0, 2.2, 1.9], [cxp, Hg - 2.3, 0], { base: true });
  for (const s of [-1, 1]) k.rectZ(C.glassB, s * 0.96, [cxp - 0.8, cxp + 0.8], [Hg - 1.5, Hg - 0.5], s, { off: 0.01 });
  k.rectX(C.glassB, cxp + 1.01, [-0.8, 0.8], [Hg - 1.5, Hg - 0.5], 1, { off: 0.01 });
  ladder(k, C.iron, { axis: 'z', at: 1.7, dir: 1, u: [-S, 0] }, -S / 2 + 0.9, 1.2, Hg - 0.4, 0.2, 0.44);
  g.add(k.mesh('body'));
  const tex = textSign('sign_crane_swl', [{ text: 'SWL 40 T', y: 0.55, px: 120, color: '#2a2622' }], { bg: '#e9e2cf', border: '#2a2622', borderW: 8, w: 512, h: 160 });
  addPanel(g, tex, 2.6, 0.8, [-4, Hg + 0.8, 1.31]);
  g.userData.rails = { x: [-S / 2, S / 2], note: 'crane rails run along Z; the gantry straddles tracks laid along Z' };
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// B7. Chain-link fence — 10 m along X. v0 plain, v1 barbed-wire top + warning sign.
// ═════════════════════════════════════════════════════════════════════════════
export function buildChainlinkFence(variant = 0) {
  const v = vwrap(variant, 2), L = 10, H = 2.1;
  const g = root('chainlink_fence', v, { w: L, h: v ? 2.75 : H + 0.05, l: v ? 0.8 : 0.2 }, { style: v ? 'barbed' : 'plain' });
  const k = new Kit(3600 + v); k.floor = 0;
  const gal = '#a3a6a1';
  for (let i = 0; i <= 4; i++) {
    const x = -L / 2 + i * L / 4, end = i === 0 || i === 4;
    k.cyl(gal, end ? 0.06 : 0.045, end ? 0.06 : 0.045, H + (v ? 0.1 : 0.05), [x, 0, 0], { base: true, seg: 6 });
    k.cyl('#7a7c78', 0.07, 0.07, 0.05, [x, H + 0.05, 0], { seg: 6 });
    k.blob('#8f8a7f', 0.25, [x, 0.012, 0], { seg: 6, seed: 3601 + i, off: 0 });
    if (v) {
      beam(k, gal, [x, H, 0], [x, H + 0.55, 0.42], 0.05);
      for (const [y, z] of [[H + 0.18, 0.13], [H + 0.36, 0.27], [H + 0.52, 0.4]]) k.box('#5d605c', [0.03, 0.03, 0.03], [x, y, z]);
    }
  }
  k.cyl(gal, 0.035, 0.035, L, [0, H - 0.02, 0], { axis: 'x', seg: 5 });
  k.cyl('#7a7c78', 0.012, 0.012, L, [0, 0.08, 0], { axis: 'x', seg: 3 });
  if (v) for (const [y, z] of [[H + 0.18, 0.13], [H + 0.36, 0.27], [H + 0.52, 0.4]]) {
    k.cyl('#5d605c', 0.012, 0.012, L, [0, y, z], { axis: 'x', seg: 3 });
    for (let x = -L / 2 + 0.15; x < L / 2; x += 0.3) k.poly('#5d605c', [[x - 0.05, y - 0.04, z], [x + 0.05, y + 0.04, z], [x, y + 0.01, z + 0.05]], { facing: [0, 0.3, 1] });
  }
  if (v) { k.box('#c9c3b5', [0.9, 0.6, 0.02], [1.25, 1.3, 0.05]); }
  g.add(k.mesh('body'));
  const mesh = addPanel(g, chainlinkTexture(), L, H - 0.1, [0, (H - 0.1) / 2 + 0.06, 0], 0, { blend: true, double: true, repeat: [L / 0.32, (H - 0.1) / 0.32], fallback: '#a3a6a1', opacity: 0.3, name: 'mesh' });
  mesh.castShadow = true;
  if (v) {
    const tex = textSign('sign_keepout', [
      { text: 'KEEP OUT', y: 0.32, px: 110, color: '#9c3a2e' },
      { text: 'DRY CREEK RAIL YARD', y: 0.7, px: 46, color: '#2a2622' },
    ], { bg: '#e9e2cf', border: '#9c3a2e', borderW: 10, w: 512, h: 320 });
    addPanel(g, tex, 0.86, 0.56, [1.25, 1.3, 0.065]);
  }
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// B8. Rail track — 20 m straight along Z. Rail tops at userData.railTop (place the train there).
// ═════════════════════════════════════════════════════════════════════════════
export function buildRailTrack() {
  const L = 20, railTop = 0.55, gauge = 1.435;
  const g = root('rail_track', 0, { w: 3.8, h: railTop, l: L }, { railTop, gauge });
  const k = new Kit(3700); k.floor = 0;
  k.extrude('#8d877c', [[-1.9, 0], [1.9, 0], [1.35, 0.26], [-1.35, 0.26]], L, { axis: 'z', jit: 0.08 });
  const r = rng(3701);
  for (let z = -L / 2 + 0.33; z < L / 2; z += 0.65) {
    const c = r() < 0.15 ? '#4a3e34' : r() < 0.3 ? '#6a5848' : '#5a4a3c';
    k.box(c, [2.6, 0.15, 0.24], [(r() - 0.5) * 0.06, 0.25, z], { base: true, noBottom: true, rot: [0, (r() - 0.5) * 0.04, 0] });
  }
  for (const s of [-1, 1]) {
    const x = s * gauge / 2;
    k.box('#4a3a30', [0.22, 0.02, L], [x, 0.4, 0], { base: true });
    k.box('#6a4a3a', [0.07, 0.13, L], [x, 0.42, 0], { base: true, noBottom: true });
    k.rectY('#b9b6ae', railTop, [x - 0.035, x + 0.035], [-L / 2, L / 2], { off: 0.001 });
  }
  for (let i = 0; i < 5; i++) k.blob(r() < 0.5 ? '#6e675c' : '#7d6a52', 0.4 + r() * 0.5, [(r() - 0.5) * 2, 0.27, -L / 2 + r() * L], { seg: 6, seed: 3702 + i, off: 0.002 });
  g.add(k.mesh('body'));
  return g;
}

export const BUILDERS = {
  rooks_garage: { build: () => buildRooksGarage(), variants: 1 },
  factory: { build: (v) => buildFactory(v), variants: 2 },
  warehouse: { build: (v) => buildWarehouse(v), variants: 3 },
  rail_shed: { build: () => buildRailShed(), variants: 1 },
  water_tower_city: { build: () => buildWaterTowerCity(), variants: 1 },
  overhead_crane: { build: () => buildOverheadCrane(), variants: 1 },
  chainlink_fence: { build: (v) => buildChainlinkFence(v), variants: 2 },
  rail_track: { build: () => buildRailTrack(), variants: 1 },
};
