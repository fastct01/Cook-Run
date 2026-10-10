// Country pack · E. Pine Foothills & River: pine, log_cabin, lookout_tower, sawmill, covered_bridge, river_rocks.
import * as THREE from 'three';
import { root } from '../models/kit.js';
import { walls, wr, band, gableRoof, hipRoof, houseWindow, planks } from '../models/scenery.js';
import { Kit, rng, PAL, mix, shade, vmod, signMesh, textTex, drawTex, fitText, beam, rod, ladder, railing, railingZ, stairs, bush, reeds, barrel, recentre, sized } from './country-common.js';

// ── 25. pine (4 variants) ─────────────────────────────────────────────────────────
/** Jagged "skirt" cone: star-shaped base ring that droops, lit top faces, darker underside. */
export function skirt(k, x, y, z, R, h, n, seed, cols) {
  const r = rng(seed);
  const pts = [];
  for (let i = 0; i < 2 * n; i++) {
    const a = (i / (2 * n)) * Math.PI * 2 + r() * 0.15;
    const rr = R * (i % 2 ? 0.68 + r() * 0.08 : 0.95 + r() * 0.12);
    pts.push([x + Math.cos(a) * rr, y + (i % 2 ? 0.22 : -0.05 - r() * 0.2) * Math.min(1.2, R * 0.4), z + Math.sin(a) * rr]);
  }
  const apex = [x + (r() - 0.5) * 0.12, y + h, z + (r() - 0.5) * 0.12];
  const under = [x, y + h * 0.18, z];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    k.poly(i % 2 ? cols[0] : cols[1], [a, b, apex], { jit: 0.1 });
    k.poly(cols[2], [b, a, under], { jit: 0.06 });
  }
}
const PINE_SPECS = [
  { name: 'classic', H: 11, R: 3.0, tiers: 5, trunk: 0.14 },
  { name: 'spire', H: 17, R: 2.6, tiers: 7, trunk: 0.18 },
  { name: 'young', H: 6.5, R: 2.7, tiers: 4, trunk: 0.1 },
  { name: 'old-growth', H: 21, R: 3.6, tiers: 7, trunk: 0.32 },
];
export function buildPine(variant = 0) {
  const v = vmod(variant, 4), sp = PINE_SPECS[v];
  const k = new Kit(7100 + v); k.floor = 0;
  const r = rng(7110 + v);
  const greens = [['#4a6a46', '#3e5b3d', '#2c4230'], ['#45634a', '#3a5640', '#2a3f30'], ['#527047', '#456140', '#304632'], ['#3f5d40', '#344f38', '#253a2b']][v];
  const trunkH = sp.H * sp.trunk + 0.6;
  k.cyl('#5a4433', 0.06 + sp.H * 0.011, 0.12 + sp.H * 0.02, trunkH + sp.H * 0.25, [0, 0, 0], { base: true, seg: 6 });
  if (v === 3) for (let i = 0; i < 3; i++) { const a = i * 2.2 + 0.4, y = 2.5 + i * 1.8; rod(k, '#4a3a2c', [0, y, 0], [Math.cos(a) * 1.4, y + 0.6, Math.sin(a) * 1.4], 0.05, 3); } // dead lower branches
  for (let i = 0; i < sp.tiers; i++) {
    const t = i / sp.tiers;
    const rad = sp.R * (1 - t * 0.82) * (0.92 + r() * 0.14) * (v === 2 && i === 0 ? 1.1 : 1);
    const y = trunkH + t * (sp.H - trunkH) * 0.94;
    const h = (sp.H - trunkH) / sp.tiers * 1.9;
    skirt(k, (r() - 0.5) * 0.15, y, (r() - 0.5) * 0.15, rad, h, v === 1 ? 6 : 7, 7120 + v * 20 + i, greens);
  }
  k.cone(greens[0], 0.25, 1.2, [0, sp.H - 0.6, 0], { base: true, seg: 4 });
  k.blob('#4a3c2c', sp.R * 0.7, [0, 0.012, 0], { seg: 8, seed: 7130 + v, off: 0 });   // needle litter
  const g = root('pine', v, { w: 1, h: 1, l: 1 });
  g.add(k.mesh('body'));
  g.userData.style = sp.name;
  return sized(g);
}

// ── 26. log_cabin ─────────────────────────────────────────────────────────────────
export function buildLogCabin() {
  const k = new Kit(7201); k.floor = 0;
  const W = 7.5, D = 6, lr = 0.17, rows = 8, wallH = rows * 2 * lr * 0.92;
  const logC = (cx, cy, cz, nx, ny, nz) => (Math.abs(nx) > 0.9 || Math.abs(nz) > 0.9 ? '#c9a36a' : '#7a5a3c');
  k.box('#8a8478', [W + 0.4, 0.4, D + 0.4], [0, 0, 0], { base: true, c: 0.06 });     // stone footing
  for (let i = 0; i < rows; i++) {
    const y = 0.4 + lr + i * 2 * lr * 0.92;
    const tone = i % 2 ? '#7a5a3c' : '#6e5034';
    const col = (cx, cy, cz, nx, ny, nz) => (Math.abs(nx) > 0.95 || Math.abs(nz) > 0.95 ? '#c9a36a' : tone);
    for (const s of [1, -1]) k.cyl(col, lr, lr, W + 0.7, [0, y, s * (D / 2 - lr)], { axis: 'x', seg: 5 });
    for (const s of [1, -1]) k.cyl(col, lr, lr, D + 0.7, [s * (W / 2 - lr), y + lr * 0.92, 0], { axis: 'z', seg: 5 });
  }
  void logC;
  const top = 0.4 + wallH;
  const F = walls(W, D);
  // openings: door + windows painted over the logs (slightly proud)
  const opening = (f, u0, u1, y0, y1, glass) => { wr(k, f, [u0 - 0.1, u1 + 0.1], [y0 - 0.1, y1 + 0.1], '#5a4430', lr + 0.03); wr(k, f, [u0, u1], [y0, y1], glass, lr + 0.05); };
  opening(F.front, -0.5, 0.5, 0.42, 2.3, '#4a3424');
  wr(k, F.front, [0.25, 0.33], [1.25, 1.35], '#c9a24a', lr + 0.07);
  for (const x of [-2.4, 2.4]) { opening(F.front, x - 0.55, x + 0.55, 1.15, 2.1, '#36424a'); wr(k, F.front, [x - 0.03, x + 0.03], [1.15, 2.1], '#5a4430', lr + 0.07); }
  opening(F.left, -0.6, 0.6, 1.15, 2.0, '#36424a');
  // gable ends: board-and-batten triangles, roof with green metal
  gableRoof(k, { w: W, d: D, y: top, rh: 2.2, ridge: 'x', roof: '#4a6a4a', wall: '#7a5a3c', o: 0.7 });
  for (const s of [1, -1]) for (let z = -D / 2 + 0.4; z < D / 2; z += 0.45) k.rectX('#5e4632', s * W / 2, [z - 0.04, z + 0.04], [top, top + Math.max(0.1, 2.2 * (1 - Math.abs(z) / (D / 2)) - 0.1)], s, { off: 0.01 });
  // stone chimney on the −X end
  for (let i = 0; i < 7; i++) k.box(i % 2 ? '#8f8a7f' : '#9a948a', [1.1 - i * 0.04, 0.9, 0.95 - i * 0.03], [-W / 2 - 0.45 + (i % 2) * 0.03, i * 0.9, 0], { base: true });
  k.box('#6f6a62', [0.9, 0.25, 0.8], [-W / 2 - 0.45, 6.3, 0], { base: true });
  // porch: deck, posts, shed roof, rocking chair, woodpile, chopping block with axe
  const pz = D / 2 + 1.1;
  k.box('#7a6a52', [W, 0.35, 2.2], [0, 0, pz], { base: true });
  for (const x of [-W / 2 + 0.2, -1.2, 1.2, W / 2 - 0.2]) k.cyl('#6e5034', 0.11, 0.12, 2.2, [x, 0.35, pz + 0.95], { base: true, seg: 5 });
  k.box('#4a6a4a', [W + 0.4, 0.1, 2.6], [0, 2.5, pz + 0.1], { rot: [0.2, 0, 0] });
  stairs(k, '#7a6a52', 0, 0, pz + 1.1 + 0.6, 1.4, 0.35, 2, -1, 0.3);
  k.box(PAL.woodDark, [0.55, 0.06, 0.5], [2.4, 0.75, pz - 0.2]); k.box(PAL.woodDark, [0.55, 0.65, 0.06], [2.4, 1.05, pz - 0.48], { rot: [-0.15, 0, 0] });
  for (const s of [1, -1]) k.box(PAL.woodDark, [0.05, 0.08, 0.8], [2.4 + s * 0.26, 0.38, pz - 0.2], { rot: [0.2, 0, 0] });
  for (let i = 0; i < 8; i++) k.cyl((cx, cy, cz, nx) => (Math.abs(nx) > 0.9 ? '#c9a36a' : '#6e5034'), 0.14, 0.14, 0.7, [W / 2 + 0.6, 0.15 + Math.floor(i / 4) * 0.27, -2.0 + (i % 4) * 0.3 + (Math.floor(i / 4) % 2) * 0.15], { axis: 'x', seg: 5 });
  k.cyl('#7a5a3c', 0.3, 0.32, 0.5, [W / 2 + 1.5, 0, 1.4], { base: true, seg: 7 });
  k.cyl('#c9a36a', 0.29, 0.29, 0.02, [W / 2 + 1.5, 0.5, 1.4], { seg: 7 });
  k.box('#8a6a4a', [0.05, 0.7, 0.05], [W / 2 + 1.5, 0.75, 1.4], { rot: [0.3, 0, 0.2] }); k.box('#8f9496', [0.04, 0.12, 0.22], [W / 2 + 1.5, 0.5, 1.33], { rot: [0.3, 0, 0.2] });
  k.blob('#4a3c2c', 4.5, [0, 0.012, 0.6], { seg: 10, seed: 7202, off: 0, sx: 1.3 });
  const g = root('log_cabin', 0, { w: W + 3, h: 6.6, l: D + 3.4 });
  g.add(k.mesh('body'));
  return recentre(g, true);
}

// ── 27. lookout_tower (ranger fire lookout on stilts) ────────────────────────────
export function buildLookoutTower() {
  const k = new Kit(7301); k.floor = 0;
  const H = 14, b = 3.2, t = 2.0, timber = '#7a6a52', steel = '#6f6a62';
  const leg = (sx, sz) => [[sx * b, 0, sz * b], [sx * t, H, sz * t]];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const [p0, p1] = leg(sx, sz); beam(k, timber, p0, p1, 0.28); k.box('#9a958a', [0.8, 0.4, 0.8], [sx * b, 0, sz * b], { base: true }); }
  const at = (s, y) => b - (b - t) * (y / H);
  // X-braces per level on all four faces + horizontal girts
  for (let lv = 0; lv < 4; lv++) {
    const y0 = lv * 3.5, y1 = y0 + 3.5, a0 = at(0, y0), a1 = at(0, y1);
    for (const s of [1, -1]) {
      beam(k, timber, [-a0, y0, s * a0], [a1, y1, s * a1], 0.1); beam(k, timber, [a0, y0, s * a0], [-a1, y1, s * a1], 0.1);
      beam(k, timber, [s * a0, y0, -a0], [s * a1, y1, a1], 0.1); beam(k, timber, [s * a0, y0, a0], [s * a1, y1, -a1], 0.1);
      k.box(timber, [2 * a1, 0.14, 0.14], [0, y1, s * a1]); k.box(timber, [0.14, 0.14, 2 * a1], [s * a1, y1, 0]);
    }
  }
  // switchback stairs inside the frame (flights alternate direction)
  for (let lv = 0; lv < 4; lv++) {
    const y0 = lv * 3.5, dir = lv % 2 ? -1 : 1, x = lv % 2 ? 0.55 : -0.55;
    const z0 = -dir * 1.2, z1 = dir * 1.2;
    beam(k, steel, [x - 0.4, y0, z0], [x - 0.4, y0 + 3.5, z1], 0.08); beam(k, steel, [x + 0.4, y0, z0], [x + 0.4, y0 + 3.5, z1], 0.08);
    for (let i = 1; i < 10; i++) { const tt = i / 10; k.box('#8a7a62', [0.8, 0.05, 0.24], [x, y0 + 3.5 * tt, z0 + (z1 - z0) * tt]); }
    k.box('#8a7a62', [2.0, 0.1, 0.9], [0, y0 + 3.5, z1 + dir * 0.4]);
  }
  // cab + catwalk + pyramid roof
  const cw = 4.4, catw = 6.0, cy = H;
  k.box('#8a7a62', [catw, 0.25, catw], [0, cy, 0], { base: true });
  for (const s of [1, -1]) { railing(k, '#5e4a36', -catw / 2, catw / 2, s * catw / 2, cy + 0.25, 1.0, 1.0, { t: 0.06, mid: true }); railingZ(k, '#5e4a36', -catw / 2, catw / 2, s * catw / 2, cy + 0.25, 1.0, 1.0, { t: 0.06, mid: true }); }
  k.box('#c9b994', [cw, 1.0, cw], [0, cy + 0.25, 0], { base: true });
  k.box('#33404a', [cw - 0.1, 1.4, cw - 0.1], [0, cy + 1.25, 0], { base: true });
  for (const s of [1, -1]) for (let i = 0; i <= 4; i++) { k.box('#e9e2cf', [0.08, 1.4, 0.1], [-cw / 2 + i * cw / 4, cy + 1.25, s * cw / 2], { base: true }); k.box('#e9e2cf', [0.1, 1.4, 0.08], [s * cw / 2, cy + 1.25, -cw / 2 + i * cw / 4], { base: true }); }
  k.box('#c9b994', [cw, 0.25, cw], [0, cy + 2.65, 0], { base: true });
  k.cone('#4a5a4a', cw * 0.95, 1.6, [0, cy + 2.9, 0], { base: true, seg: 4, rot: [0, Math.PI / 4, 0] });
  k.cyl('#3a3b3d', 0.03, 0.03, 2.2, [0, cy + 4.3, 0], { base: true, seg: 3 });
  k.cyl('#3a3b3d', 0.02, 0.02, 1.6, [1.2, cy + 3.6, 1.2], { base: true, seg: 3 });
  for (let i = 0; i < 3; i++) { const a = i * 2.1; k.box('#3a3b3d', [0.5, 0.02, 0.02], [1.2 + Math.cos(a) * 0.25, cy + 5.1, 1.2 + Math.sin(a) * 0.25], { rot: [0, -a, 0] }); k.cone('#3a3b3d', 0.06, 0.1, [1.2 + Math.cos(a) * 0.5, cy + 5.1, 1.2 + Math.sin(a) * 0.5], { seg: 4, rot: [0, 0, Math.PI / 2] }); }
  // fire-danger sign board at the base + outhouse + a pickup's worth of tracks
  const sx = b + 2.6, sz = b + 1.0;
  for (const dx of [-1.0, 1.0]) k.box(PAL.woodDark, [0.15, 2.4, 0.15], [sx + dx, 0, sz], { base: true });
  k.box('#5a4430', [2.4, 0.25, 0.35], [sx, 2.4, sz], { base: true });
  k.box('#7a5a3c', [1.4, 2.2, 1.4], [-b - 2.2, 0, -b - 0.5], { base: true, c: 0.03 });
  k.box('#5a4430', [1.6, 0.12, 1.6], [-b - 2.2, 2.2, -b - 0.5], { base: true, rot: [0, 0, 0.1] });
  const g = root('lookout_tower', 0, { w: 2 * b + 6, h: cy + 6.5, l: 2 * b + 2.4 });
  g.add(k.mesh('body'));
  const tex = drawTex('firedanger', 512, 352, '#5a7a4a', (ctx, W, H2) => {
    ctx.fillStyle = '#e9e2cf'; ctx.fillRect(10, 10, W - 20, H2 - 20);
    ctx.fillStyle = '#3a4a2e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    fitText(ctx, 'FIRE DANGER', W / 2, 50, W * 0.85, 52); fitText(ctx, 'TODAY IS', W / 2, 100, W * 0.5, 30, '700');
    const cols = ['#3f8a4a', '#3f6fae', '#e2b93b', '#e0702a', '#c4372b'];
    const cx = W / 2, cyy = 300, R = 160;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(cx, cyy); ctx.arc(cx, cyy, R, Math.PI + (i / 5) * Math.PI, Math.PI + ((i + 1) / 5) * Math.PI); ctx.closePath(); ctx.fillStyle = cols[i]; ctx.fill(); }
    ctx.fillStyle = '#1f1e1c'; ctx.save(); ctx.translate(cx, cyy); ctx.rotate(-0.35); ctx.fillRect(-6, -R + 12, 12, R - 12); ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cyy, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1f1e1c'; ctx.font = '900 22px Arial, sans-serif'; ctx.fillText('HIGH', cx + 92, cyy - 150);
  });
  g.add(signMesh(tex, [{ w: 2.2, h: 1.5, pos: [sx, 1.6, sz + 0.1] }], '#e9e2cf'));
  return g;
}

// ── 28. sawmill (blade shed, log pile, lumber, wigwam burner) ───────────────────
export function buildSawmill() {
  const k = new Kit(7401); k.floor = 0;
  const r = rng(7402);
  const W = 36, D = 22;
  k.blob('#8a7458', 17, [0, 0.012, 0], { seg: 14, sx: 1.05, sz: 0.66, seed: 7403, wobble: 0.1, off: 0 });
  k.blob('#c9a873', 4.0, [5, 0.02, 4], { seg: 10, seed: 7404, off: 0, sx: 1.4 });           // sawdust spill
  // blade shed: open sides, corrugated roof on posts, carriage rails, the big circular saw
  const sx = 2, sz = -3, sw = 16, sd = 8, sh = 5.2;
  k.box('#8f8a7f', [sw, 0.25, sd], [sx, 0, sz], { base: true });
  for (let i = 0; i <= 4; i++) for (const s of [1, -1]) k.box(PAL.woodDark, [0.3, sh, 0.3], [sx - sw / 2 + i * sw / 4, 0.25, sz + s * (sd / 2 - 0.2)], { base: true });
  k.box('#9a9890', [sw + 1, 0.12, sd + 1.4], [sx, sh + 0.6, sz], { base: true, rot: [0.08, 0, 0] });
  for (let x = sx - sw / 2; x <= sx + sw / 2; x += 0.6) k.box('#868479', [0.06, 0.06, sd + 1.4], [x, sh + 0.72, sz], { rot: [0.08, 0, 0] });
  k.box(mix('#9a9890', PAL.rust, 0.6), [4, 0.05, 3], [sx + 4, sh + 0.78, sz - 1], { rot: [0.08, 0, 0] });
  k.box('#9c4434', [sw + 0.4, 1.1, 0.2], [sx, sh, sz + sd / 2 + 0.2], { base: true });       // fascia (sign goes here)
  for (const z of [-0.6, 0.6]) k.box('#5f6468', [sw - 1, 0.12, 0.12], [sx, 0.3, sz + z]);
  k.box('#7a6a52', [3.2, 0.5, 1.6], [sx - 3, 0.42, sz], { base: true });                      // carriage
  k.cyl((cx, cy, cz, nx) => (Math.abs(nx) > 0.9 ? '#c9a36a' : '#5a4433'), 0.55, 0.55, 5.0, [sx - 3, 1.5, sz], { axis: 'x', seg: 8 });
  const bx = sx + 2.5;
  k.box('#5f6468', [1.2, 1.8, 0.8], [bx, 0.25, sz - 0.9], { base: true });
  const bladePts = []; for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, rr = i % 2 ? 1.5 : 1.38; bladePts.push([Math.cos(a) * rr, 1.6 + Math.sin(a) * rr]); }
  k.extrude('#c9cccd', bladePts, 0.05, { axis: 'z', pos: [bx, 0, sz - 0.1] });
  k.cyl('#5f6468', 0.25, 0.25, 0.3, [bx, 1.6, sz - 0.1], { axis: 'z', seg: 8 });
  k.box('#e2b93b', [1.8, 0.8, 0.5], [bx, 2.6, sz - 0.1], { base: true });                   // blade guard
  // log deck: a pyramid of logs (end grain toward ±X)
  const logCol = (cx, cy, cz, nx) => (Math.abs(nx) > 0.9 ? '#c9a36a' : r() < 0.5 ? '#5a4433' : '#644b37');
  const lx = -12, lz = -3;
  for (let row = 0; row < 4; row++) for (let i = 0; i < 5 - row; i++) k.cyl(logCol, 0.5, 0.5, 9 - row * 0.4, [lx, 0.5 + row * 0.86, lz - (4 - row) * 0.5 + i * 1.0 + row * 0.0 - 1.5], { axis: 'x', seg: 7 });
  for (const z of [lz - 4.5, lz + 3.5]) k.box(PAL.woodDark, [0.3, 1.6, 0.3], [lx - 4, 0, z], { base: true });
  // lumber stacks with stickers
  for (const [x, z, n] of [[11, 4, 6], [14.5, 4, 5], [11, 7.5, 4]]) {
    for (let j = 0; j < n; j++) { k.box(j % 2 ? '#d9b98a' : '#cfa978', [3.2, 0.28, 2.2], [x, 0.1 + j * 0.34, z], { base: true }); k.box('#8a6a4a', [0.1, 0.06, 2.3], [x - 1.2, 0.38 + j * 0.34, z]); k.box('#8a6a4a', [0.1, 0.06, 2.3], [x + 1.2, 0.38 + j * 0.34, z]); }
    k.box('#6a5a46', [3.4, 0.1, 2.3], [x, 0, z], { base: true });
  }
  // sawdust cone + conveyor feeding it
  k.cone('#c9a873', 3.0, 3.4, [6, 0, 6.2], { base: true, seg: 9, jit: 0.06 });
  beam(k, '#5f6468', [sx + sw / 2 - 1, 2.2, sz + 1.5], [6, 4.2, 5.4], 0.5, { tz: 0.6 });
  for (const t of [0.3, 0.7]) k.box('#5f6468', [0.15, 3.0 * t + 1.2, 0.15], [sx + sw / 2 - 1 + (6 - sx - sw / 2 + 1) * t, 0, sz + 1.5 + (5.4 - sz - 1.5) * t], { base: true });
  // wigwam burner (rusty cone with a mesh dome)
  const wx = 13.5, wz = -6.5;
  k.cyl('#7a4a2a', 3.6, 4.0, 1.2, [wx, 0, wz], { base: true, seg: 12 });
  k.cyl(mix(PAL.rust, '#5f6064', 0.3), 2.0, 3.6, 8.5, [wx, 1.2, wz], { base: true, seg: 12, open: true, jit: 0.08 });
  for (let y = 2; y < 9; y += 1.6) k.cyl(PAL.rustDark, 3.6 - (y - 1.2) * 0.188 + 0.03, 3.6 - (y - 1.2) * 0.188 + 0.03, 0.1, [wx, y, wz], { seg: 12, open: true });
  k.lathe('#3a3836', [[2.05, 0], [1.6, 0.9], [0.8, 1.5], [0, 1.7]], 12, [wx, 9.7, wz]);
  k.box('#4a3a2e', [1.6, 1.8, 0.2], [wx, 1.2, wz + 3.4], { base: true, rot: [0.2, 0, 0] });
  // office shack + loader tyre marks
  k.box('#9a8a72', [4.5, 2.8, 3.5], [-12, 0, 7], { base: true, c: 0.03 });
  const O = walls(4.5, 3.5, -12, 7);
  planks(k, O.front, 0, 2.8, '#9a8a72', 0.3, 7405);
  wr(k, O.front, [-13.6, -12.6], [1.1, 2.0], '#2f3a42', 0.02); wr(k, O.front, [-11.6, -10.8], [0, 2.1], '#5e4632', 0.02);
  k.box('#7d8285', [5.0, 0.1, 4.2], [-12, 2.95, 7], { rot: [-0.12, 0, 0] });
  barrel(k, -9.2, 8.3); barrel(k, -8.6, 7.6, 0, '#5f6468');
  const g = root('sawmill', 0, { w: W, h: 11.6, l: D });
  g.add(k.mesh('body'));
  const tex = textTex('sawmill', [
    { text: 'TALL PINE LUMBER CO.', y: 0.42, px: 76, color: '#efe6cf' },
    { text: 'ROUGH CUT · CEDAR · FIREWOOD', y: 0.8, px: 34, color: '#e2b93b', weight: '700' },
  ], { bg: '#7a3328', w: 1024, h: 160 });
  g.add(signMesh(tex, [{ w: 9.0, h: 1.0, pos: [sx, sh + 0.55, sz + sd / 2 + 0.31] }], '#7a3328'));
  return g;
}

// ── 29. covered_bridge (≈ 30 m, road along Z, deck at y = 4 above the water line) ─
export const BRIDGE_DECK_Y = 4.0;
export function buildCoveredBridge() {
  const k = new Kit(7501); k.floor = 0;
  const r = rng(7502);
  const L = 30, Wi = 7.4, Wo = 8.2, Hw = 4.8, dy = BRIDGE_DECK_Y;
  const red = '#9c3f30', redD = '#7e3226', white = '#e9e2cf', roof = '#4f5256';
  // stone abutments (water line y = 0 up to the deck)
  for (const s of [1, -1]) {
    k.box('#8f8a7f', [Wo + 2.4, dy, 4.0], [0, 0, s * (L / 2 - 1.0)], { base: true, c: 0.1 });
    for (let row = 0; row < 5; row++) for (let i = 0; i < 6; i++) { const y = 0.3 + row * 0.75, x = -Wo / 2 - 0.9 + i * 1.8 + (row % 2) * 0.9; if (x > Wo / 2 + 1) continue; k.rectZ(r() < 0.5 ? '#9a948a' : '#827d73', s * (L / 2 - 3.0), [x, x + 1.6], [y, y + 0.62], -s, { off: 0.01 }); }
    for (const sx of [1, -1]) k.box('#8f8a7f', [0.8, 1.0, 3.0], [sx * (Wo / 2 + 1.6), dy, s * (L / 2 + 0.2)], { base: true, c: 0.06 }); // wing posts
  }
  // deck structure (floor beams under, plank deck on top)
  k.box('#4a3a2e', [Wo, 0.6, L], [0, dy - 0.6, 0], { base: true });
  for (let z = -L / 2 + 1; z < L / 2; z += 2) k.box('#3a2e24', [Wo + 0.3, 0.3, 0.3], [0, dy - 0.9, z], { base: true });
  k.box('#8a7458', [Wi, 0.08, L + 0.6], [0, dy, 0], { base: true });
  for (let z = -L / 2; z < L / 2; z += 0.8) k.rectY('#76624a', dy + 0.081, [-Wi / 2, Wi / 2], [z, z + 0.05], { off: 0.002 });
  for (const s of [1, -1]) k.rectY('#6a5a46', dy + 0.082, [s * 1.4 - 0.45, s * 1.4 + 0.45], [-L / 2, L / 2], { off: 0.002 }); // wheel runners
  // side walls: board-and-batten, dark interior face, a row of small windows
  for (const s of [1, -1]) {
    const x = s * (Wo / 2 - 0.2);
    k.box(red, [0.4, Hw, L], [x, dy, 0], { base: true });
    k.rectX('#3a2a22', x - s * 0.2, [-L / 2, L / 2], [dy, dy + Hw], -s, { off: 0.01 });           // interior
    for (let z = -L / 2 + 0.3; z < L / 2; z += 0.5) k.rectX(redD, x + s * 0.2, [z, z + 0.07], [dy, dy + Hw], s, { off: 0.01 });
    for (let i = 0; i < 6; i++) { const zc = -L / 2 + 3 + i * (L - 6) / 5; k.rectX('#1f1a18', x + s * 0.2, [zc - 0.55, zc + 0.55], [dy + 2.6, dy + 3.4], s, { off: 0.02 }); k.rectX(white, x + s * 0.2, [zc - 0.65, zc + 0.65], [dy + 2.5, dy + 2.6], s, { off: 0.016 }); }
    k.rectX(mix(red, PAL.dirt, 0.4), x + s * 0.2, [-L / 2, L / 2], [dy, dy + 0.6], s, { off: 0.018 });
  }
  // roof (ridge along Z) and portal ends with white trim + arched-look opening
  gableRoof(k, { w: Wo, d: L, y: dy + Hw, rh: 2.4, ridge: 'z', roof, wall: red, o: 0.7 });
  for (const s of [1, -1]) {
    const z = s * L / 2;
    k.front(white, z, [[-Wo / 2, dy + Hw - 0.1], [Wo / 2, dy + Hw - 0.1], [0, dy + Hw + 2.3]], s, { off: 0.02 });
    k.front(red, z, [[-Wo / 2 + 0.3, dy + Hw], [Wo / 2 - 0.3, dy + Hw], [0, dy + Hw + 2.1]], s, { off: 0.03 });
    k.front(red, z, [[-Wo / 2, dy + 4.3], [Wo / 2, dy + 4.3], [Wo / 2, dy + Hw], [-Wo / 2, dy + Hw]], s, { off: 0.02 });
    k.front(white, z, [[-Wi / 2, dy + 4.1], [Wi / 2, dy + 4.1], [Wi / 2 - 0.4, dy + 4.35], [-Wi / 2 + 0.4, dy + 4.35]], s, { off: 0.04 });
    for (const sx of [1, -1]) k.box(white, [0.25, Hw, 0.12], [sx * (Wi / 2 + 0.12), dy, z + s * 0.06], { base: true });
  }
  // approach rails off the ends
  for (const s of [1, -1]) for (const sx of [1, -1]) { k.box(white, [0.15, 0.15, 3.0], [sx * (Wo / 2 + 0.3), dy + 0.9, s * (L / 2 + 1.5)]); k.box(white, [0.2, 1.0, 0.2], [sx * (Wo / 2 + 0.3), dy, s * (L / 2 + 2.8)], { base: true }); }
  const g = root('covered_bridge', 0, { w: Wo + 2.6, h: dy + Hw + 2.6, l: L + 6 });
  g.add(k.mesh('body'));
  const tex = drawTex('covbridge', 1024, 256, '#e9e2cf', (ctx, W, H2) => {
    ctx.fillStyle = '#3a2a22'; ctx.fillRect(0, 0, 640, H2);
    ctx.fillStyle = '#e9e2cf'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    fitText(ctx, 'OLD HOLLOW BRIDGE', 320, 90, 580, 62, '900', 'Georgia, "Times New Roman", serif');
    fitText(ctx, 'BUILT 1891 · WALK YOUR HORSES', 320, 175, 560, 34, '700', 'Georgia, serif');
    ctx.fillStyle = '#e2b93b'; ctx.fillRect(660, 20, 344, 216); ctx.strokeStyle = '#1f1e1c'; ctx.lineWidth = 8; ctx.strokeRect(672, 32, 320, 192);
    ctx.fillStyle = '#1f1e1c'; fitText(ctx, 'CLEARANCE', 832, 90, 290, 50, '700', 'Arial, sans-serif'); fitText(ctx, "11'-6\"", 832, 170, 290, 80, '900', 'Arial, sans-serif');
  });
  const q = [];
  for (const s of [1, -1]) {
    q.push({ w: 4.4, h: 0.95, pos: [0, dy + Hw + 0.85, s * (L / 2 + 0.06)], rotY: s > 0 ? 0 : Math.PI, rect: [0, 0, 0.625, 1] });
    q.push({ w: 1.4, h: 0.9, pos: [-Wo / 2 + 1.0, dy + 4.65, s * (L / 2 + 0.07)], rotY: s > 0 ? 0 : Math.PI, rect: [0.645, 0.08, 0.98, 0.92] });
  }
  g.add(signMesh(tex, q, '#e9e2cf'));
  g.userData.deckY = dy;
  g.userData.note = 'road runs along local Z through the bridge; deck top at y = deckY (place at y = -deckY so the deck meets road level). Water line is y = 0.';
  return g;
}

// ── 30. river_rocks (boulders + reeds, 3 variants) ──────────────────────────────
export function buildRiverRocks(variant = 0) {
  const v = vmod(variant, 3);
  const k = new Kit(7600 + v); k.floor = 0;
  const r = rng(7610 + v);
  const rockC = (cx, cy, cz, nx, ny) => (cy < 0.22 ? '#5f5a52' : ny > 0.8 && cy > 0.9 && (Math.sin(cx * 7.1 + cz * 5.3) > 0.2) ? '#7a845a' : ny > 0.5 ? '#a39d90' : '#8d8679');
  let size;
  if (v === 0) { // three big boulders + small ones + reeds
    size = { w: 6, h: 2.2, l: 4.5 };
    for (const [x, z, rr] of [[-1.2, 0, 1.3], [0.9, -0.6, 1.0], [0.4, 1.0, 0.75]]) k.ico(rockC, rr, [x, rr * 0.45, z], { detail: 1, jitter: 0.18, seed: 7620 + x * 10, scale: [1.2, 0.8, 1], flatBottom: -rr * 0.55, jit: 0.08 });
    for (let i = 0; i < 6; i++) k.ico(rockC, 0.25 + r() * 0.25, [-2.6 + r() * 5, 0.12, -1.8 + r() * 3.6], { seed: 7630 + i, jitter: 0.2, flatBottom: -0.12 });
    reeds(k, 2.2, 0, 1.2, 1.6, 7640, 6); reeds(k, -2.5, 0, -1.3, 1.4, 7641, 5);
  } else if (v === 1) { // stepping stones in a line + reed clumps
    size = { w: 7, h: 1.6, l: 3 };
    for (let i = 0; i < 6; i++) k.ico(rockC, 0.45 + r() * 0.15, [-3 + i * 1.2, 0.18, (r() - 0.5) * 0.6], { detail: 0, jitter: 0.15, seed: 7650 + i, scale: [1.3, 0.45, 1.1], flatBottom: -0.1 });
    for (let i = 0; i < 4; i++) reeds(k, -3.2 + i * 2.1, 0, 1.1 + (r() - 0.5) * 0.4, 1.2 + r() * 0.5, 7660 + i, 5);
  } else { // mossy boulder pile + driftwood log
    size = { w: 6, h: 2.6, l: 5 };
    k.ico(rockC, 1.5, [0, 0.8, -0.4], { detail: 1, jitter: 0.2, seed: 7670, scale: [1.1, 0.95, 1], flatBottom: -0.8, jit: 0.08 });
    k.ico(rockC, 0.9, [1.4, 0.4, 0.6], { detail: 0, jitter: 0.2, seed: 7671, flatBottom: -0.4 });
    k.ico(rockC, 0.7, [-1.5, 0.3, 0.8], { detail: 0, jitter: 0.2, seed: 7672, flatBottom: -0.3 });
    k.cyl((cx, cy, cz, nx) => (Math.abs(nx) > 0.9 ? '#b9ad94' : '#a39880'), 0.22, 0.28, 4.6, [0.2, 0.25, 1.7], { axis: 'x', seg: 6, rot: [0, 0.35, 0.05] });
    rod(k, '#a39880', [-1.4, 0.3, 1.4], [-2.2, 0.9, 2.1], 0.07, 4);
    reeds(k, 2.4, 0, -1.4, 1.5, 7680, 6);
  }
  k.blob('#6a6a5c', Math.max(size.w, size.l) * 0.42, [0, 0.01, 0], { seg: 10, seed: 7690 + v, sx: 1, sz: size.l / size.w, off: 0 }); // wet gravel
  const g = root('river_rocks', v, size);
  g.add(k.mesh('body'));
  g.userData.style = ['boulders', 'stepping stones', 'mossy pile'][v];
  return g;
}
void THREE; void band; void hipRoof; void houseWindow; void ladder; void bush; void shade;
