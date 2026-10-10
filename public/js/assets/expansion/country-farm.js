// Country pack · D. Farmland: grain_elevator, greenhouse, scarecrow, crop_rows, pumpkin_patch, irrigation_pivot,
// cattle_grid.
import * as THREE from 'three';
import { root, mat } from '../models/kit.js';
import { walls, wr, band } from '../models/scenery.js';
import { Kit, rng, PAL, mix, shade, vmod, signMesh, textTex, drawTex, fitText, beam, rod, ladder, railing, bush, tuft, parkedCar } from './country-common.js';

// ── 18. grain_elevator (concrete co-op elevator) ────────────────────────────────
export function buildGrainElevator() {
  const k = new Kit(6101); k.floor = 0;
  const r = rng(6102);
  const con = '#cfc8b8', conD = '#a9a293', R = 3.1, H = 27, n = 4;
  const x0 = -((n - 1) * 2 * R) / 2 - 3;
  // silo row (touching cylinders) with form-line rings and rain streaks
  for (let i = 0; i < n; i++) {
    const x = x0 + i * 2 * R;
    k.cyl(i % 2 ? con : shade(con, 0.97), R, R, H, [x, 0, 0], { base: true, seg: 12, open: true });
    for (const y of [6, 13.5, 21]) k.cyl(shade(con, 0.9), R + 0.03, R + 0.03, 0.1, [x, y, 0], { seg: 12, open: true });
    for (let j = 0; j < 3; j++) { const a = 1.2 + r() * 0.8; k.box(mix(con, '#6a5a46', 0.35 + r() * 0.2), [0.35 + r() * 0.4, H * (0.3 + r() * 0.4), 0.03], [x + Math.cos(a) * (R + 0.02), H - 1 - H * 0.2, Math.sin(a) * (R + 0.02)], { rot: [0, Math.PI / 2 - a, 0] }); }
    k.cyl(shade(con, 0.92), R, R, 0.3, [x, H, 0], { base: true, seg: 12 });
  }
  // gallery along the silo tops + headhouse at the +X end
  const gx0 = x0, gx1 = x0 + (n - 1) * 2 * R;
  k.box(conD, [gx1 - gx0 + 2, 2.6, 3.2], [(gx0 + gx1) / 2, H + 0.3, 0], { base: true, c: 0.05 });
  for (let x = gx0; x < gx1; x += 2.2) k.box('#3a464c', [0.9, 0.7, 0.04], [x, H + 1.5, 1.62]);
  const hx = gx1 + R + 2.2, hw = 6.5, hd = 7, hh = 37;
  k.box(con, [hw, hh, hd], [hx, 0, 0], { base: true, c: 0.08 });
  const F = walls(hw, hd, hx, 0);
  for (let y = 4; y < hh - 2; y += 4.5) { for (const dx of [-2.2, 2.2]) wr(k, F.front, [hx + dx - 0.5, hx + dx + 0.5], [y, y + 1.3], '#3a464c', 0.02); wr(k, F.left, [-0.6, 0.6], [y, y + 1.3], '#3a464c', 0.02); }
  for (const f of Object.values(F)) band(k, f, 0, 1.2, mix(con, PAL.dirt, 0.35), 0.012);
  k.box(conD, [hw + 0.4, 3.0, hd + 0.4], [hx, hh, 0], { base: true });
  k.box(conD, [3, 2.0, 3], [hx, hh + 3.0, 0], { base: true });
  k.cyl('#7a7f83', 0.06, 0.06, 4, [hx + 1, hh + 5.0, 1], { base: true, seg: 4 });
  // spouts / leg pipes down the side
  rod(k, '#8a8f92', [hx - hw / 2, hh - 2, 2.5], [hx - hw / 2 - 6, 6, 4.5], 0.25, 6);
  rod(k, '#8a8f92', [hx + hw / 2, hh - 6, -1.5], [hx + hw / 2 + 4, 4.5, -2], 0.22, 6);
  // drive-through truck shed at the base + truck scale
  const sx = hx + 0.5, sz = 6.5;
  k.box('#9c4434', [8, 5.5, 6], [sx, 0, sz], { base: true, c: 0.05 });
  const S = walls(8, 6, sx, sz);
  wr(k, S.left, [sz - 2.2, sz + 2.2], [0, 4.6], '#2a2726', 0.02); wr(k, S.right, [sz - 2.2, sz + 2.2], [0, 4.6], '#2a2726', 0.02);
  k.box('#7d8285', [8.6, 0.25, 6.6], [sx, 5.5, sz], { base: true, taper: [1, 0.6] });
  k.box('#5f6064', [12, 0.08, 3.4], [sx + 10, 0, sz], { base: true });
  k.box('#e2b93b', [12, 0.02, 0.15], [sx + 10, 0.08, sz + 1.7], { base: true });
  // rail spur along the back + a hopper car silhouette
  for (const z of [-5.2, -6.6]) k.box('#5a4a3c', [44, 0.12, 0.1], [0, 0.1, z]);
  for (let x = -21; x <= 21; x += 1.2) k.box('#4a3a2e', [0.25, 0.1, 2.2], [x, 0, -5.9], { base: true });
  k.box('#8a8f86', [12, 3.0, 2.9], [-6, 0.9, -5.9], { base: true, taper: [1, 1] });
  k.box('#7a7f76', [12.4, 0.3, 3.1], [-6, 3.9, -5.9], { base: true });
  for (const x of [-11, -1]) k.box('#2a2a2b', [2.0, 0.9, 2.4], [x, 0, -5.9], { base: true });
  const g = root('grain_elevator', 0, { w: 1, h: 1, l: 1 });
  g.add(k.mesh('body'));
  const tex = drawTex('elevator', 256, 1536, con, (ctx, W, Hc) => {
    ctx.fillStyle = 'rgba(160,150,135,0.5)'; ctx.fillRect(0, 0, W, Hc);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#7a2e22';
    const word = 'PRAIRIE GOLD';
    for (let i = 0; i < word.length; i++) if (word[i] !== ' ') fitText(ctx, word[i], W / 2, 80 + i * 110, W * 0.8, 110);
    ctx.fillStyle = '#3a4a3a'; fitText(ctx, 'CO-OP', W / 2, Hc - 70, W * 0.9, 70);
  });
  g.add(signMesh(tex, [{ w: 2.2, h: 13.2, pos: [hx, 14, hd / 2 + 0.03] }], con));
  void band; void mat;
  return recentreSimple(g);
}
function recentreSimple(g) {
  g.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(g);
  const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
  for (const c of g.children) { c.position.x -= cx; c.position.z -= cz; }
  g.userData.size = { w: +(b.max.x - b.min.x).toFixed(2), h: +b.max.y.toFixed(2), l: +(b.max.z - b.min.z).toFixed(2) };
  return g;
}

// ── 19. greenhouse (row of 3 polytunnels running away from the road) ───────────
function halfTube(k, color, R, L, x, z) {
  // half-cylinder shell along Z (ends open), apex up
  const g = new THREE.CylinderGeometry(R, R, L, 9, 1, true, -Math.PI / 2, Math.PI);
  k.geo(g, (cx, cy, cz, nx, ny) => (ny > 0.75 ? shade(color, 1.04) : ny > 0.35 ? color : shade(color, 0.9)), mat([x, 0, z], [-Math.PI / 2, 0, 0]), { jit: 0.03 });
  g.dispose();
}
export function buildGreenhouse() {
  const k = new Kit(6201); k.floor = 0;
  const r = rng(6202);
  const R = 2.9, L = 22, pitch = 7.2, plastic = '#e2e6dc';
  k.box('#6e5a42', [3 * pitch + 2, 0.03, L + 4], [0, 0, 0], { base: true });
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * pitch;
    halfTube(k, i === 1 ? '#dde3d6' : plastic, R, L, x, 0);
    // hoops: flat strips riding on the shell
    for (let j = 0; j <= 5; j++) {
      const z = -L / 2 + j * L / 5;
      for (let s = 0; s < 9; s++) {
        const a0 = (s / 9) * Math.PI, a1 = ((s + 1) / 9) * Math.PI;
        const p = (a, rr) => [x + Math.cos(a) * rr, Math.sin(a) * rr, z];
        const A = p(a0, R + 0.03), B = p(a1, R + 0.03);
        k.poly('#9aa0a3', [[A[0], A[1], z - 0.06], [B[0], B[1], z - 0.06], [B[0], B[1], z + 0.06], [A[0], A[1], z + 0.06]], { facing: [Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2), 0] });
      }
    }
    // end walls: road end (+Z) has a door, back end solid
    for (const sz of [1, -1]) {
      const pts = []; for (let s = 0; s <= 9; s++) { const a = (s / 9) * Math.PI; pts.push([x + Math.cos(a) * R, Math.sin(a) * R]); }
      k.front(shade(plastic, 0.95), sz * L / 2, pts, sz, { off: 0 });
      if (sz > 0) { k.front('#2f3a33', L / 2, [[x - 0.9, 0], [x + 0.9, 0], [x + 0.9, 2.1], [x - 0.9, 2.1]], 1, { off: 0.02 }); k.box('#9aa0a3', [0.08, 2.2, 0.08], [x - 0.95, 0, L / 2 + 0.03], { base: true }); k.box('#9aa0a3', [0.08, 2.2, 0.08], [x + 0.95, 0, L / 2 + 0.03], { base: true }); }
    }
    // rows of seedlings visible through the door + patch repairs + sandbags along the skirts
    for (let row = -1; row <= 1; row++) k.box(row ? '#5f8a44' : '#6f9a4a', [0.5, 0.3, 4], [x + row * 0.9, 0, L / 2 - 2.4], { base: true });
    for (let j = 0; j < 2; j++) { const a = 0.6 + r() * 1.8, zz = -L / 2 + 2 + r() * (L - 4); k.poly('#c9cfc2', [[x + Math.cos(a) * (R + 0.04), Math.sin(a) * (R + 0.04), zz], [x + Math.cos(a + 0.3) * (R + 0.04), Math.sin(a + 0.3) * (R + 0.04), zz], [x + Math.cos(a + 0.3) * (R + 0.04), Math.sin(a + 0.3) * (R + 0.04), zz + 1.4], [x + Math.cos(a) * (R + 0.04), Math.sin(a) * (R + 0.04), zz + 1.4]], { facing: [Math.cos(a + 0.15), Math.sin(a + 0.15), 0] }); }
    for (const s of [1, -1]) for (let j = 0; j < 4; j++) k.box('#b8a684', [0.5, 0.25, 0.8], [x + s * (R + 0.15), 0, -L / 2 + 2 + j * 6], { base: true });
  }
  // water tank + hose reel + pallet of pots
  k.cyl('#3a4a3a', 1.0, 1.0, 2.2, [1.5 * pitch + 0.2, 0, -6], { base: true, seg: 9 });
  k.cyl('#5f6468', 0.35, 0.35, 0.3, [1.5 * pitch, 0.5, 4], { axis: 'z', seg: 8 });
  k.box(PAL.woodLight, [1.2, 0.15, 1.0], [-1.5 * pitch, 0, 7], { base: true });
  for (let i = 0; i < 6; i++) k.cyl('#a8542e', 0.15, 0.12, 0.25, [-1.5 * pitch - 0.4 + (i % 3) * 0.4, 0.15, 6.75 + Math.floor(i / 3) * 0.45], { base: true, seg: 5, open: true });
  const g = root('greenhouse', 0, { w: 3 * pitch + 2, h: R + 0.1, l: L + 4 });
  g.add(k.mesh('body'));
  return g;
}

// ── 20. scarecrow (v0 classic straw hat + plaid, v1 pumpkin-head in a tattered coat) ─
export function buildScarecrow(variant = 0) {
  const v = vmod(variant, 2);
  const k = new Kit(6300 + v); k.floor = 0;
  const straw = '#d4b266';
  k.at([0, 0, 0], [0, 0, v ? 0.06 : 0], () => {
    k.box(PAL.woodDark, [0.12, 2.6, 0.12], [0, 0, -0.08], { base: true });
    k.box(PAL.woodDark, [1.8, 0.1, 0.1], [0, 1.85, -0.08]);
    const shirt = v ? '#4a4a3e' : '#9c3a2e';
    // torso + sleeves along the crossbar
    k.box(shirt, [0.55, 0.75, 0.3], [0, 1.25, 0], { base: true, c: 0.04, taper: [1.1, 1.0] });
    if (!v) for (let i = 0; i < 3; i++) { k.rectZ('#2a2a2b', 0.15, [-0.29, 0.29], [1.35 + i * 0.22, 1.38 + i * 0.22], 1, { off: 0.006 }); k.rectZ('#2a2a2b', 0.15, [-0.195 + i * 0.18, -0.165 + i * 0.18], [1.25, 2.0], 1, { off: 0.008 }); }
    for (const s of [1, -1]) {
      k.box(shirt, [0.7, 0.24, 0.24], [s * 0.6, 1.83, -0.02], { rot: [0, 0, s * -0.05] });
      for (let j = 0; j < 3; j++) k.cone(straw, 0.06, 0.28, [s * (0.98 + j * 0.02), 1.8 + (j - 1) * 0.06, (j - 1) * 0.05], { seg: 3, rot: [0, 0, s * -(Math.PI / 2 + (j - 1) * 0.3)] });
    }
    // legs (jeans / overalls) hanging + straw at the ankles
    const pant = v ? '#5a6a7a' : '#3e5a7a';
    for (const s of [1, -1]) { k.box(pant, [0.2, 0.7, 0.2], [s * 0.13, 0.55, 0.02], { base: true, rot: [0.08 * s, 0, 0] }); k.cone(straw, 0.1, 0.3, [s * 0.13, 0.45, 0.02], { seg: 4, rot: [Math.PI, 0, 0] }); }
    k.cone(straw, 0.18, 0.25, [0, 1.98, 0], { seg: 5 });
    if (!v) {
      k.ico('#c9a87a', 0.26, [0, 2.25, 0], { detail: 1, scale: [1, 1.1, 0.95] });                 // burlap sack head
      for (const s of [1, -1]) k.box('#2a2a2b', [0.07, 0.07, 0.02], [s * 0.09, 2.3, 0.25]);
      k.box('#2a2a2b', [0.18, 0.03, 0.02], [0, 2.15, 0.25]);
      k.cyl('#c9a252', 0.55, 0.55, 0.04, [0, 2.45, 0], { seg: 8 });                               // straw hat
      k.cyl('#c9a252', 0.24, 0.28, 0.28, [0, 2.46, 0], { base: true, seg: 8 });
      k.cyl('#7a2e22', 0.285, 0.285, 0.06, [0, 2.5, 0], { base: true, seg: 8 });
      // a crow on the arm
      k.ico('#1f2022', 0.12, [0.75, 2.05, 0], { scale: [1.4, 1, 1] });
      k.ico('#1f2022', 0.07, [0.9, 2.12, 0]); k.cone('#3a3b3d', 0.03, 0.08, [0.98, 2.12, 0], { seg: 3, rot: [0, 0, -Math.PI / 2] });
      k.box('#1f2022', [0.18, 0.02, 0.12], [0.58, 2.05, 0], { rot: [0, 0, 0.3] });
    } else {
      k.lathe('#d9702a', [[0, -0.22], [0.2, -0.18], [0.28, 0], [0.2, 0.18], [0, 0.22]], 8, [0, 2.24, 0]); // pumpkin head
      k.cyl('#5a4a2a', 0.03, 0.04, 0.12, [0, 2.46, 0], { seg: 4 });
      for (const s of [1, -1]) k.cone('#2a1a10', 0.05, 0.08, [s * 0.1, 2.3, 0.255], { seg: 3, rot: [Math.PI / 2, 0, 0] });
      k.box('#2a1a10', [0.2, 0.04, 0.02], [0, 2.16, 0.26]);
      // tattered coat tails + patches, tin can wind chime
      for (let i = 0; i < 4; i++) k.box('#4a4a3e', [0.14, 0.4 + (i % 2) * 0.15, 0.03], [-0.21 + i * 0.14, 0.95, 0.14], { base: true, rot: [0.1, 0, (i - 1.5) * 0.06] });
      k.box('#8a6a4a', [0.15, 0.15, 0.01], [0.12, 1.45, 0.16]); k.box('#6f8fb0', [0.12, 0.12, 0.01], [-0.15, 1.65, 0.16]);
      rod(k, '#5a5852', [-0.8, 1.82, -0.08], [-0.8, 1.55, -0.08], 0.006, 3);
      k.cyl('#a9adb0', 0.05, 0.05, 0.12, [-0.8, 1.5, -0.08], { seg: 6 });
    }
  });
  k.blob(PAL.hayDark, 0.5, [0, 0.012, 0], { seg: 7, seed: 6310 + v, off: 0 });
  const g = root('scarecrow', v, { w: 2.0, h: 2.7, l: 0.6 });
  g.add(k.mesh('body'));
  g.userData.style = v ? 'pumpkin-head' : 'classic';
  return g;
}

// ── 21. crop_rows (20 × 20 m patch; v0 corn, v1 wheat) ──────────────────────────
export function buildCropRows(variant = 0) {
  const v = vmod(variant, 2);
  const k = new Kit(6400 + v); k.floor = 0;
  const r = rng(6410 + v);
  const S = 20;
  k.box('#6e5a42', [S + 0.6, 0.03, S + 0.6], [0, 0, 0], { base: true });
  if (v === 0) {
    // corn: 12 rows running along Z, each a jagged silhouette slab (cheap: ~110 tris a row)
    const rows = 12, teeth = 14;
    for (let i = 0; i < rows; i++) {
      const x = -S / 2 + 0.7 + i * (S - 1.4) / (rows - 1);
      const pts = [[-S / 2 + 0.2, 0]];
      for (let t = 0; t < teeth; t++) {
        const z0 = -S / 2 + 0.2 + (t / teeth) * (S - 0.4), z1 = -S / 2 + 0.2 + ((t + 0.5) / teeth) * (S - 0.4);
        pts.push([z0, 2.2 + r() * 0.12], [z1, 2.42 + r() * 0.22]);
      }
      pts.push([S / 2 - 0.2, 2.1], [S / 2 - 0.2, 0]);
      const top = mix('#8a9a4a', '#c9b45a', 0.3 + r() * 0.25);
      k.extrude((cx, cy, cz, nx, ny) => (cy > 2.15 ? top : cy > 1.0 ? '#6f8a44' : '#56693a'), pts.map(([z, y]) => [z, y]), 0.95 + r() * 0.1, { axis: 'x', pos: [x, 0, 0], jit: 0.06 });
    }
  } else {
    // wheat: a golden block with a wind-rippled top, two tramlines and a few poppies
    const n = 10, H = 0.95;
    const h = (x, z) => H + 0.12 * Math.sin(x * 0.7 + z * 0.35) + 0.06 * Math.sin(z * 1.3 - x * 0.4);
    const P = [];
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) P.push([-S / 2 + (i / n) * S, -S / 2 + (j / n) * S]);
    const at = (i, j) => { const [x, z] = P[i * (n + 1) + j]; return [x, h(x, z), z]; };
    const tram = (x) => Math.abs(x + 4) < 0.6 || Math.abs(x - 5) < 0.6;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      const col = (cx, cy) => mix('#c9a24a', '#e2c47a', clamp01((cy - H + 0.15) / 0.3));
      k.poly(col, [a, d, c], { facing: [0, 1, 0], jit: 0.05 }); k.poly(col, [a, c, b], { facing: [0, 1, 0], jit: 0.05 });
    }
    // skirts (the stalk walls) on all four sides
    for (let i = 0; i < n; i++) {
      for (const [p0, p1, f] of [[at(i, n), at(i + 1, n), [0, 0, 1]], [at(i + 1, 0), at(i, 0), [0, 0, -1]], [at(n, i), at(n, i + 1), [1, 0, 0]], [at(0, i + 1), at(0, i), [-1, 0, 0]]]) {
        k.poly('#b8913f', [[p0[0], 0, p0[2]], [p1[0], 0, p1[2]], p1, p0], { facing: f, jit: 0.05 });
      }
    }
    for (const x of [-4, 5]) k.top('#8a7a4a', 0.5, [[x - 0.35, -S / 2], [x + 0.35, -S / 2], [x + 0.35, S / 2], [x - 0.35, S / 2]], { off: 0 });
    for (let i = 0; i < 14; i++) { const x = -S / 2 + 1 + r() * (S - 2), z = -S / 2 + 1 + r() * (S - 2); if (!tram(x)) k.box('#c4372b', [0.14, 0.04, 0.14], [x, h(x, z) + 0.03, z]); }
  }
  const g = root('crop_rows', v, { w: S + 0.6, h: v ? 1.15 : 2.8, l: S + 0.6 });
  g.add(k.mesh('body'));
  g.userData.style = v ? 'wheat' : 'corn';
  return g;
}
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// ── 22. pumpkin_patch ─────────────────────────────────────────────────────────────
export function buildPumpkinPatch() {
  const k = new Kit(6501); k.floor = 0;
  const r = rng(6502);
  const W = 14, D = 10;
  k.blob('#5e4a36', 7.4, [0, 0.012, 0], { seg: 14, sx: 1, sz: 0.72, seed: 6503, wobble: 0.12, off: 0 });
  // vines + leaves
  for (let i = 0; i < 7; i++) {
    const z = -D / 2 + 1 + i * (D - 2) / 6;
    let px = -W / 2 + 1, pz = z;
    for (let s = 0; s < 6; s++) { const nx = px + 2.0, nz = z + Math.sin(s * 1.7 + i) * 0.4; rod(k, '#4f6b38', [px, 0.05, pz], [nx, 0.05, nz], 0.04, 3); px = nx; pz = nz; }
    for (let j = 0; j < 6; j++) k.blob(j % 2 ? '#5d7b41' : '#6f8c4a', 0.4, [-W / 2 + 1.5 + j * 2.0 + r() * 0.6, 0.06 + j * 0.003, z + (r() - 0.5) * 0.8], { seg: 5, seed: 6510 + i * 7 + j, off: 0 });
  }
  // pumpkins
  const pumpkin = (x, z, s, col) => {
    k.lathe(col, [[0, -0.5 * s], [0.66 * s, -0.3 * s], [0.66 * s, 0.22 * s], [0, 0.45 * s]], 7, [x, 0.46 * s, z], { rot: [0, r() * 3, 0] });
    k.cone('#5a5a2a', 0.06 * s + 0.02, 0.2 * s + 0.06, [x, 0.95 * s, z], { seg: 3, rot: [r() * 0.4, 0, r() * 0.4] });
  };
  for (let i = 0; i < 16; i++) {
    const x = -W / 2 + 1 + r() * (W - 2), z = -D / 2 + 1 + r() * (D - 2.5);
    pumpkin(x, z, 0.45 + r() * 0.45, ['#d9702a', '#e0822e', '#c9652a', '#e8a04a'][i % 4]);
  }
  pumpkin(2.5, -1.0, 1.4, '#d9702a'); pumpkin(-3.8, 1.8, 1.15, '#e0822e');
  // farm stand: plank table, roof, crates of small pumpkins, honour box
  const sx = 4.6, sz = D / 2 - 0.3;
  k.box(PAL.woodLight, [3.2, 0.1, 1.0], [sx, 0.85, sz]);
  for (const dx of [-1.5, 1.5]) for (const dz of [-0.4, 0.4]) k.box(PAL.woodDark, [0.1, 0.85, 0.1], [sx + dx, 0, sz + dz], { base: true });
  for (const dx of [-1.55, 1.55]) k.box(PAL.woodDark, [0.12, 2.3, 0.12], [sx + dx, 0, sz - 0.5], { base: true });
  k.box('#7d8285', [3.6, 0.08, 1.6], [sx, 2.3, sz - 0.1], { rot: [0.2, 0, 0] });
  for (let i = 0; i < 3; i++) { k.box('#8a6a4a', [0.8, 0.35, 0.6], [sx - 1 + i, 0.9, sz], { base: true }); k.ico('#e0822e', 0.19, [sx - 1 + i, 1.33, sz], { detail: 0, scale: [1, 0.75, 1] }); }
  k.box('#5a7a9a', [0.35, 0.3, 0.25], [sx + 1.3, 0.95, sz + 0.3], { base: true });
  // hay bales + wheelbarrow
  for (const [x, z] of [[-5.6, 3.6], [-4.3, 3.9]]) k.box(PAL.hay, [1.1, 0.5, 0.5], [x, 0, z], { base: true, c: 0.06, jit: 0.1 });
  k.box('#3f7a4a', [0.7, 0.35, 1.1], [0.2, 0.35, 3.9], { c: 0.06, taper: [1.2, 1.2] });
  k.cyl(PAL.tyre, 0.2, 0.2, 0.1, [0.2, 0.2, 4.55], { axis: 'x', seg: 8 });
  for (const s of [1, -1]) beam(k, '#5a4a3a', [0.2 + s * 0.25, 0.4, 4.4], [0.2 + s * 0.3, 0.55, 3.2], 0.05);
  const g = root('pumpkin_patch', 0, { w: W + 1, h: 2.6, l: D + 1 });
  g.add(k.mesh('body'));
  const tex = textTex('pumpkins', [
    { text: 'PUMPKINS', y: 0.36, px: 100, color: '#d9702a' },
    { text: '$3 · HONOR BOX', y: 0.76, px: 60, color: '#2a2a2a', weight: '700' },
  ], { bg: '#e9e0c8', border: '#5a4a3a', borderW: 10, w: 512, h: 256 });
  g.add(signMesh(tex, [{ w: 2.4, h: 0.9, pos: [sx, 1.85, sz - 0.42] }], '#e9e0c8'));
  void tuft;
  return g;
}

// ── 23. irrigation_pivot (centre pivot, 3 wheeled spans ≈ 54 m) ─────────────────
export function buildIrrigationPivot() {
  const k = new Kit(6601); k.floor = 0;
  const steel = '#a8adb0', galv = '#8f9496';
  const L = 52, x0 = L / 2, pipeY = 3.6, spans = 3;
  // centre tower (pyramid frame) at the +X end
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) beam(k, galv, [x0 + dx * 1.4, 0, dz * 1.4], [x0, pipeY + 0.6, 0], 0.12);
  k.box(CONC, [3.4, 0.3, 3.4], [x0, 0, 0], { base: true });
  k.cyl(galv, 0.18, 0.18, pipeY + 1.3, [x0, 0, 0], { base: true, seg: 6 });
  k.box('#5f6468', [0.7, 0.6, 0.5], [x0, pipeY + 1.0, 0], { base: true });
  k.box('#c4372b', [0.4, 0.5, 0.3], [x0 + 0.5, 1.4, 0.4], { base: true }); // control panel
  // spans: arched pipe + under-truss + drop hoses, wheeled A-frame towers at each joint
  const towerX = (i) => x0 - ((i + 1) / spans) * (L - 4);
  let xa = x0;
  for (let i = 0; i < spans; i++) {
    const xb = towerX(i), mid = (xa + xb) / 2, sag = 0.5;
    const segs = 4;
    for (let s = 0; s < segs; s++) {
      const t0 = s / segs, t1 = (s + 1) / segs;
      const p0 = [xa + (xb - xa) * t0, pipeY + Math.sin(t0 * Math.PI) * sag, 0], p1 = [xa + (xb - xa) * t1, pipeY + Math.sin(t1 * Math.PI) * sag, 0];
      rod(k, steel, p0, p1, 0.11, 6);
      // truss: V rods down to a lower chord (two tie rods)
      for (const sz of [1, -1]) rod(k, galv, [p0[0], p0[1], 0], [(p0[0] + p1[0]) / 2, pipeY - 1.3, sz * 0.5], 0.025, 3);
    }
    for (const sz of [1, -1]) rod(k, galv, [xa, pipeY - 0.2, 0], [xb, pipeY - 0.2, sz * 0.0 + 0], 0.02, 3);
    for (const sz of [1, -1]) rod(k, galv, [xa - 1, pipeY - 1.3, sz * 0.5], [xb + 1, pipeY - 1.3, sz * 0.5], 0.025, 3);
    for (let d = 1; d < 6; d++) { const x = xa + (xb - xa) * (d / 6); rod(k, '#3a3b3d', [x, pipeY + Math.sin((d / 6) * Math.PI) * sag, 0], [x, 1.2, 0], 0.015, 3); k.cone('#3a3b3d', 0.12, 0.15, [x, 1.15, 0], { seg: 5, rot: [Math.PI, 0, 0] }); }
    // tower at xb
    for (const sz of [1, -1]) beam(k, galv, [xb, pipeY, 0], [xb, 0.7, sz * 1.9], 0.12);
    k.box(galv, [0.2, 0.2, 3.9], [xb, 0.75, 0]);
    k.box('#5f6468', [0.5, 0.4, 0.5], [xb, 0.9, 0.8], { base: true });
    for (const sz of [1, -1]) { k.cyl('#2a2b2d', 0.62, 0.62, 0.45, [xb, 0.62, sz * 1.95], { axis: 'x', seg: 10 }); k.cyl('#c9c4b6', 0.32, 0.32, 0.47, [xb, 0.62, sz * 1.95], { axis: 'x', seg: 6 }); }
    xa = xb;
  }
  // end boom overhang + end gun
  rod(k, steel, [xa, pipeY, 0], [xa - 3.5, pipeY - 0.6, 0], 0.07, 5);
  rod(k, galv, [xa, pipeY + 1.0, 0], [xa - 3.5, pipeY - 0.6, 0], 0.02, 3);
  k.box(galv, [0.08, 1.0, 0.08], [xa, pipeY, 0], { base: true });
  k.cone('#3a3b3d', 0.1, 0.5, [xa - 3.7, pipeY - 0.5, 0], { seg: 5, rot: [0, 0, 1.2] });
  // wheel ruts circle hint: two dark tracks under the towers
  for (let i = 0; i < spans; i++) for (const sz of [1, -1]) k.rectY('#6a5a46', 0.015, [towerX(i) - 2.4, towerX(i) + 2.4], [sz * 1.95 - 0.25, sz * 1.95 + 0.25], { off: 0 });
  const g = root('irrigation_pivot', 0, { w: L + 3, h: pipeY + 1.9, l: 4.4 });
  g.add(k.mesh('body'));
  return recentreSimple(g);
}
const CONC = '#b3ada1';

// ── 24. cattle_grid (across a 2-lane road: 8 m along X) ─────────────────────────
export function buildCattleGrid() {
  const k = new Kit(6701); k.floor = 0;
  const W = 8.2, D = 2.6;
  k.box('#2a2826', [W, 0.02, D], [0, 0, 0], { base: true });                 // the pit (dark)
  for (const s of [1, -1]) k.box('#9a958a', [W + 0.4, 0.12, 0.3], [0, 0, s * (D / 2 + 0.15)], { base: true }); // concrete sills
  for (const s of [1, -1]) k.box('#9a958a', [0.3, 0.12, D + 0.6], [s * (W / 2 + 0.15), 0, 0], { base: true });
  for (let i = 0; i < 13; i++) k.cyl(i % 4 === 1 ? '#7a6a5a' : '#8a8f92', 0.045, 0.045, W, [0, 0.08, -D / 2 + 0.15 + i * (D - 0.3) / 12], { axis: 'x', seg: 5, open: true });
  for (const x of [-2.7, 0, 2.7]) k.box('#5f6468', [0.12, 0.06, D], [x, 0.0, 0], { base: true });
  // wing fences: posts + rails flaring away at both ends
  for (const s of [1, -1]) {
    const x = s * (W / 2 + 0.6);
    for (const dz of [-D / 2 - 0.3, D / 2 + 0.3]) k.box(PAL.woodDark, [0.2, 1.5, 0.2], [x, 0, dz], { base: true });
    for (const y of [0.5, 1.0, 1.35]) k.box(PAL.wood, [0.08, 0.1, D + 0.8], [x, y, 0]);
    for (const dz of [-1, 1]) for (const y of [0.55, 1.1]) beam(k, PAL.woodGrey, [x, y, dz * (D / 2 + 0.3)], [x + s * 3.5, y, dz * (D / 2 + 2.2)], 0.08);
    for (const dz of [-1, 1]) k.box(PAL.woodDark, [0.16, 1.3, 0.16], [x + s * 3.5, 0, dz * (D / 2 + 2.2)], { base: true });
  }
  // warning sign on the +X side
  k.box('#8f948f', [0.07, 2.2, 0.07], [W / 2 + 1.6, 0, D / 2 + 2.4], { base: true });
  const g = root('cattle_grid', 0, { w: W + 8.6, h: 2.6, l: D + 5 });
  g.add(k.mesh('body'));
  const tex = drawTex('cattlegrid', 256, 256, 'rgba(0,0,0,0)', (ctx, W2, H2) => {
    ctx.clearRect(0, 0, W2, H2);
    ctx.save(); ctx.translate(W2 / 2, H2 / 2); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#1f1e1c'; ctx.fillRect(-88, -88, 176, 176); ctx.fillStyle = '#e2b93b'; ctx.fillRect(-82, -82, 164, 164); ctx.restore();
    ctx.fillStyle = '#1f1e1c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    fitText(ctx, 'CATTLE', W2 / 2, H2 * 0.42, W2 * 0.46, 34); fitText(ctx, 'GRID', W2 / 2, H2 * 0.56, W2 * 0.4, 36);
    for (let i = 0; i < 4; i++) ctx.fillRect(W2 * 0.36, H2 * 0.64 + i * 7, W2 * 0.28, 3);
  });
  const sgn = signMesh(tex, [{ w: 1.1, h: 1.1, pos: [W / 2 + 1.6, 2.05, D / 2 + 2.45] }], '#e2b93b', 'sign', { double: false });
  if (tex) { sgn.material.transparent = true; sgn.material.alphaTest = 0.5; }
  g.add(sgn);
  return g;
}
void THREE; void railing; void bush; void parkedCar; void ladder; void Kit;
