// ─────────────────────────────────────────────────────────────────────────────
// Country pack · H. Terrain tiles (x_terrain). Big, cheap, vertex-coloured heightfield tiles that line the road.
//
// TILE CONVENTION (every terrain_* kind):
//   • 80 m wide (local X) × 60 m long (local Z). Origin = ground centre of the tile (x = z = 0), Y up.
//   • The ROAD EDGE is the tile's +X edge (local x = +40). The road runs along local Z; the tile spreads to −X.
//     userData.tile = { roadEdgeX: 40, width: 80, length: 60, edgeY }.
//   • Placement on the driver's right (world −X of the road): rotation.y = 0,
//       position = (roadEdgeX_world − 40, roadY − edgeY, zCentre).
//     On the left (world +X): rotation.y = π, position = (roadEdgeX_world + 40, roadY − edgeY, zCentre).
//   • Seams: every tile is exactly at local y = edgeY along both Z-ends (z = ±30) and along a 4 m verge at the
//     road edge (x ∈ [36, 40]), blending into its relief over ~10 m. So ANY tile can follow ANY tile in a row,
//     and the road shoulder always meets flat ground. The far edge (x = −40) has a skirt down to y = 0.
//   • edgeY is 0 for every tile except the two "sunken" ones: terrain_lake (0.8) and terrain_river (4.0), whose
//     water sits at local y ≈ 0.1–0.35. Lower those tiles by edgeY so their banks meet road level.
//   • terrain_river: the channel crosses the road edge at z ∈ [−8, 8] (banks top out at |z| ≈ 14), sized for
//     `covered_bridge` (30 m, deck at y = 4 = edgeY). terrain_forest_floor lists pine spots in userData.treeSpots.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { root, clipRect } from '../models/kit.js';
import { Kit, rng, PAL, mix, shade, vmod, smooth, reeds, tuft, bush, beam, rod } from './country-common.js';
import { skirt } from './country-forest.js';

export const TILE = Object.freeze({ width: 80, length: 60, roadEdgeX: 40, verge: 4 });
const RX = 40, HZ = 30;

// ── deterministic value noise ────────────────────────────────────────────────
function hash2(i, j, seed) {
  let n = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1442695041)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
function noise(seed) {
  return (x, z) => {
    const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const a = hash2(i, j, seed), b = hash2(i + 1, j, seed), c = hash2(i, j + 1, seed), d = hash2(i + 1, j + 1, seed);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
  };
}
function fbm(n, x, z, oct = 3) { let s = 0, a = 1, f = 1, t = 0; for (let i = 0; i < oct; i++) { s += a * n(x * f, z * f); t += a; a *= 0.5; f *= 2.03; } return s / t; }

/**
 * 1 inside the tile, easing to 0 over `seam` m before the Z-ends, and to 0 inside the flat `apron` next to the road
 * (relief starts `apron` m from the road edge and is full `blend` m further out).
 */
function mask(x, z, seam = 10, blend = 8, apron = TILE.verge) {
  const mr = smooth(RX - apron, RX - apron - blend, x);
  const ms = smooth(HZ, HZ - seam, Math.abs(z));
  return mr * ms;
}
/** Grid coordinates from a to b with step s (exact ends). */
function steps(a, b, s) { const n = Math.max(1, Math.round((b - a) / s)); return Array.from({ length: n + 1 }, (_, i) => a + (i / n) * (b - a)); }

/**
 * Heightfield into kit k. xs/zs: node coordinates (ascending, spanning the tile). h(x, z) → y.
 * color(cx, cy, cz, nx, ny, nz) per face. Interior nodes get a little XZ jitter (hand-made low-poly look).
 * Skirts drop every raised border edge to y = 0 so no gaps show from any side.
 */
function heightfield(k, xs, zs, h, color, o = {}) {
  const seed = o.seed || 1, jit = o.jitter ?? 0.28;
  const P = xs.map((x, i) => zs.map((z, j) => {
    let px = x, pz = z;
    if (i > 0 && i < xs.length - 1 && j > 0 && j < zs.length - 1) {
      const dx = (xs[i + 1] - xs[i - 1]) / 2, dz = (zs[j + 1] - zs[j - 1]) / 2;
      px += (hash2(i, j, seed) - 0.5) * 2 * jit * dx; pz += (hash2(j, i, seed + 7) - 0.5) * 2 * jit * dz;
    }
    return [px, h(px, pz), pz];
  }));
  const pos = [];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
    const a = P[i][j], b = P[i + 1][j], c = P[i + 1][j + 1], d = P[i][j + 1];
    if ((i + j) % 2) { tri(a, d, c); tri(a, c, b); } else { tri(a, d, b); tri(b, d, c); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  k.geo(g, color, null, { jit: o.jit ?? 0.05 });
  g.dispose();
  // skirts
  const sk = o.skirt || '#6a5a46';
  const edge = (pts, facing) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (a[1] < 0.02 && b[1] < 0.02) continue;
      k.poly(sk, [[a[0], 0, a[2]], [b[0], 0, b[2]], b, a], { facing, off: 0 });
    }
  };
  edge(P[0], [-1, 0, 0]);
  edge(P[xs.length - 1], [1, 0, 0]);
  edge(P.map((c) => c[0]), [0, 0, -1]);
  edge(P.map((c) => c[zs.length - 1]), [0, 0, 1]);
  return P;
}
function tileRoot(kind, v, k, hMax, edgeY = 0, extra = {}, apron = TILE.verge) {
  const g = root(kind, v, { w: 80, h: Math.max(0.1, hMax), l: 60 }, { tile: { roadEdgeX: RX, width: 80, length: 60, edgeY, apron }, ...extra });
  g.add(k.mesh('body', undefined, true));
  const m = g.children[0].geometry; m.computeBoundingBox();
  g.userData.size.h = +m.boundingBox.max.y.toFixed(2);
  return g;
}
const pick = (arr, t) => arr[Math.max(0, Math.min(arr.length - 1, Math.floor(t * arr.length)))];

// ── 41. terrain_hills (v0 green meadow, v1 rocky knoll, v2 golden dry hills) ────
export function buildTerrainHills(variant = 0) {
  const v = vmod(variant, 3);
  const k = new Kit(9700 + v); k.floor = 0;
  const n1 = noise(9710 + v), n2 = noise(9720 + v);
  const r = rng(9730 + v);
  const h = (x, z) => {
    const d = RX - x, m = mask(x, z, 12, 10, 16);
    let y;
    if (v === 0) y = 3.0 * smooth(6, 50, d) + 3.2 * (fbm(n1, x / 26, z / 26) + 0.45);
    else if (v === 1) { const kn = Math.exp(-(((x + 12) / 17) ** 2 + ((z - 3) / 13) ** 2)); y = 12 * kn + 2.2 * (fbm(n1, x / 18, z / 18) + 0.4); }
    else y = 4.5 * smooth(4, 55, d) + 4.0 * (fbm(n1, x / 32, z / 22) + 0.5);
    return Math.max(0, y * m);
  };
  const G = [['#7a9652', '#7f9a55', '#84a058', '#789350'], ['#76914f', '#7b9652', '#819b56', '#8a9c5c'], ['#c2a967', '#c8af6c', '#bca363', '#ceb573']][v];
  const dry = ['#97a061', '#9aa064', '#9aa25e'][v];
  const color = (cx, cy, cz, nx, ny) => {
    const p = fbm(n2, cx / 14, cz / 14);
    if (ny < 0.8) return v === 1 && cy > 6 ? '#8d8679' : mix(G[0], '#8a7a58', 0.35);
    if (p > 0.45) return dry;
    return pick(G, (p + 1) / 2);
  };
  heightfield(k, steps(-40, 40, 2.5), steps(-30, 30, 2.5), h, color, { seed: 9740 + v, skirt: '#6a5a46' });
  // dressing: boulders, shrubs, grass tufts, a fence line (v0), rock crown (v1), lone shade oaks (v2)
  for (let i = 0; i < 7; i++) { const x = -36 + r() * 60, z = -24 + r() * 48; k.ico(i % 2 ? '#9a948a' : '#8a8478', 0.5 + r() * 0.9, [x, h(x, z) - 0.1, z], { seed: 9750 + i, jitter: 0.25, flatBottom: -0.3, jit: 0.08 }); }
  for (let i = 0; i < 16; i++) { const x = -38 + r() * 64, z = -27 + r() * 54; bush(k, x, h(x, z) - 0.15, z, 0.5 + r() * 0.6, v === 2 ? '#7d8a4a' : PAL.bush, 9760 + i); }
  for (let i = 0; i < 18; i++) { const x = -38 + r() * 70, z = -28 + r() * 56; tuft(k, x, h(x, z), z, 0.5, v === 2 ? '#c9b47a' : '#8fa35c', 9780 + i); }
  if (v === 0) for (let i = 0; i < 12; i++) { const z = -27 + i * 5, x = -20; k.box(PAL.woodDark, [0.15, 1.3, 0.15], [x, h(x, z) - 0.2, z], { base: true }); if (i < 11) beam(k, PAL.wood, [x, h(x, z) + 0.9, z], [x, h(x, z + 5) + 0.9, z + 5], 0.08); }
  if (v === 1) for (let i = 0; i < 6; i++) { const a = i * 1.1, x = -12 + Math.cos(a) * 3, z = 3 + Math.sin(a) * 2.5; k.ico('#8d8679', 1.2 + r() * 0.9, [x, h(x, z) - 0.3, z], { detail: 0, jitter: 0.25, seed: 9800 + i, flatBottom: -0.6, scale: [1, 1.3, 1] }); }
  if (v === 2) for (const [x, z] of [[-14, -8], [-26, 12], [-4, 16]]) { const y = h(x, z); k.cyl(PAL.trunk, 0.25, 0.35, 2.6, [x, y - 0.2, z], { base: true, seg: 6 }); for (let i = 0; i < 3; i++) k.ico(['#6f7d42', '#7a864a', '#646f3c'][i], 2.4 - i * 0.4, [x + (i - 1) * 1.4, y + 3.6 + (i % 2) * 0.4, z + (i === 1 ? 0.8 : -0.4)], { detail: 1, jitter: 0.12, seed: 9810 + i + x, scale: [1.2, 0.7, 1.1], jit: 0.08 }); }
  let hMax = 0; for (let x = -40; x <= 40; x += 2) for (let z = -30; z <= 30; z += 2) hMax = Math.max(hMax, h(x, z));
  const g = tileRoot('terrain_hills', v, k, hMax + 1, 0, {}, 16);
  g.userData.style = ['meadow', 'knoll', 'golden'][v];
  return g;
}

// ── 42. terrain_cliff (v0 granite bluff with pines, v1 red sandstone bluff) ─────
export function buildTerrainCliff(variant = 0) {
  const v = vmod(variant, 2);
  const k = new Kit(9900 + v); k.floor = 0;
  const n1 = noise(9910 + v), n2 = noise(9920 + v);
  const r = rng(9930 + v);
  const Hc = v ? 22 : 17;
  const face = (z) => 17 + 4 * n1(z / 11, 3.3);
  const h = (x, z) => {
    const d = RX - x, t = d - face(z), m = mask(x, z, 14, 8);
    let y;
    if (t < 0) y = 1.6 * Math.exp(t / 2.5);
    else y = Hc * (0.55 * smooth(0, 2.4, t) + 0.45 * smooth(5.5, 7.8, t)) + 1.6 + 1.4 * fbm(n2, x / 10, z / 10) * smooth(0, 10, t);
    return Math.max(0, y * m);
  };
  const strataG = ['#8d8679', '#9a9488', '#7d776c', '#a8a296', '#857f73'];
  const strataR = PAL.canyon;
  const color = (cx, cy, cz, nx, ny) => {
    if (ny > 0.86) return cy > 4 ? (v ? mix('#c9a27a', '#d8b47c', 0.4) : (fbm(n2, cx / 7, cz / 7) > 0.1 ? '#6f7d4a' : '#7d8a55')) : (v ? '#c9a27a' : '#7f9a58');
    if (ny > 0.6) return v ? '#c48a5a' : '#a39c8c';
    const band = Math.floor(cy / (v ? 2.6 : 2.1));
    return v ? strataR[((band % 6) + 6) % 6] : strataG[((band % 5) + 5) % 5];
  };
  heightfield(k, steps(-40, 40, 1.6), steps(-30, 30, 2.5), h, color, { seed: 9940 + v, skirt: v ? '#9c4a2c' : '#7d776c', jitter: 0.18 });
  // talus boulders at the foot, rubble on the ledge
  for (let i = 0; i < 16; i++) { const z = -24 + r() * 48, x = RX - face(z) + 1 + r() * 4; k.ico(v ? strataR[i % 6] : strataG[i % 5], 0.6 + r() * 1.3, [x, h(x, z) - 0.2, z], { seed: 9950 + i, jitter: 0.25, flatBottom: -0.4, jit: 0.1 }); }
  if (!v) for (let i = 0; i < 6; i++) { const z = -20 + i * 8 + r() * 3, x = RX - face(z) - 12 - r() * 14, y = h(x, z); for (let tt = 0; tt < 3; tt++) skirt(k, x, y + 0.6 + tt * 1.5, z, 1.7 - tt * 0.45, 2.6, 6, 9960 + i * 3 + tt, ['#4a6a46', '#3e5b3d', '#2c4230']); k.cyl('#5a4433', 0.1, 0.16, 1.2, [x, y - 0.1, z], { base: true, seg: 4 }); }
  else for (let i = 0; i < 10; i++) { const z = -26 + r() * 52, x = 30 - r() * 8; k.ico(PAL.cactus, 0.35, [x, h(x, z) + 0.2, z], { seed: 9970 + i, jitter: 0.3, scale: [1.3, 0.7, 1.3] }); }
  const g = tileRoot('terrain_cliff', v, k, Hc + 5, 0, {}, 12);
  g.userData.style = v ? 'sandstone' : 'granite';
  return g;
}

// ── 43. terrain_lake (sunken: edgeY 0.8, water at y 0.12) ────────────────────────
export function buildTerrainLake() {
  const k = new Kit(10001); k.floor = 0;
  const n1 = noise(10010), n2 = noise(10020);
  const r = rng(10030);
  const E = 0.8, WL = 0.12, cx = -7, cz = 1, rx = 24, rz = 19;
  const sAt = (x, z) => { const a = Math.atan2((z - cz) / rz, (x - cx) / rx); return Math.hypot((x - cx) / rx, (z - cz) / rz) * (1 + 0.09 * n1(Math.cos(a) * 2 + 5, Math.sin(a) * 2 + 5)); };
  const ground = (x, z) => E + 0.9 * mask(x, z, 10, 8) * (fbm(n2, x / 14, z / 14) + 0.35);
  const h = (x, z) => { const s = sAt(x, z); return Math.max(0, ground(x, z) * smooth(0.86, 1.08, s)); };
  const color = (fx, fy, fz, nx, ny) => {
    if (fy < WL + 0.04) return '#6a6252';
    if (fy < 0.55) return '#b5a98a';
    if (fy < 0.8) return '#8f9a5c';
    return fbm(n2, fx / 8, fz / 8) > 0.3 ? '#9aa262' : (ny < 0.85 ? '#76884a' : '#7f9a55');
  };
  heightfield(k, steps(-40, 40, 2.5), steps(-30, 30, 2.5), h, color, { seed: 10040, skirt: '#6a5a46' });
  // shoreline dressing: reeds in clumps, pebbles, a jetty, lily pads
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + r() * 0.2;
    let s = 1.0; const ex = Math.cos(a), ez = Math.sin(a);
    // walk inward until the ground is near the waterline
    for (let t = 1.1; t > 0.7; t -= 0.02) { const x = cx + ex * rx * t, z = cz + ez * rz * t; if (h(x, z) < WL + 0.25) { s = t; break; } }
    const x = cx + ex * rx * s, z = cz + ez * rz * s;
    if (i % 5 === 2) continue;
    reeds(k, x, Math.max(WL, h(x, z)) - 0.05, z, 1.4 + r() * 0.6, 10050 + i, 5);
  }
  for (let i = 0; i < 10; i++) { const a = r() * Math.PI * 2, x = cx + Math.cos(a) * rx * 1.02, z = cz + Math.sin(a) * rz * 1.02; k.ico('#9a948a', 0.3 + r() * 0.4, [x, h(x, z) - 0.05, z], { seed: 10080 + i, jitter: 0.25, flatBottom: -0.15 }); }
  // jetty on the road side of the lake
  const jx = cx + rx * 0.84, jz = cz - 5;
  for (let i = 0; i < 4; i++) for (const s of [-0.7, 0.7]) k.cyl('#5e4632', 0.1, 0.1, 1.5, [jx - i * 2.2, -0.2, jz + s], { base: true, seg: 5 });
  k.box('#8a7458', [8.8, 0.12, 1.8], [jx - 3.0, E + 0.15, jz], { base: true });
  for (let x = jx - 7.4; x < jx + 1.4; x += 0.4) k.rectY('#76624a', E + 0.271, [x - 0.02, x + 0.02], [jz - 0.9, jz + 0.9], { off: 0.002 });
  k.box('#5e8a8a', [0.9, 0.35, 2.6], [jx - 6.5, WL + 0.05, jz + 1.9], { base: true, taper: [0.7, 0.85] }); // little rowboat
  const g = tileRoot('terrain_lake', 0, k, 4, E, {}, 12);
  // water: separate mesh (swap its material for a shader); bluish gradient, darker toward the middle
  const kw = new Kit(10002);
  const ring = (t) => { const pts = []; for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2; pts.push([cx + Math.cos(a) * rx * t * (1 + 0.09 * n1(Math.cos(a) * 2 + 5, Math.sin(a) * 2 + 5)), WL, cz + Math.sin(a) * rz * t * (1 + 0.09 * n1(Math.cos(a) * 2 + 5, Math.sin(a) * 2 + 5))]); } return pts; };
  const R0 = ring(0.4), R1 = ring(0.72), R2 = ring(1.0);
  const wc = ['#3f6a80', '#527d92', '#6e98a8'];
  for (let i = 0; i < 32; i++) {
    const j = (i + 1) % 32;
    kw.poly(wc[0], [[cx, WL, cz], R0[j], R0[i]], { facing: [0, 1, 0] });
    kw.poly(wc[1], [R0[i], R0[j], R1[j], R1[i]], { facing: [0, 1, 0], jit: 0.03 });
    kw.poly(wc[2], [R1[i], R1[j], R2[j], R2[i]], { facing: [0, 1, 0], jit: 0.03 });
  }
  for (let i = 0; i < 9; i++) { const a = r() * Math.PI * 2, t = 0.75 + r() * 0.15; kw.blob('#5f8a4a', 0.5 + r() * 0.3, [cx + Math.cos(a) * rx * t, WL + 0.012, cz + Math.sin(a) * rz * t], { seg: 6, seed: 10090 + i, off: 0 }); }
  for (let i = 0; i < 4; i++) { const z0 = cz - 8 + i * 4.5; kw.rectY('#8fb4c0', WL + 0.01, [cx - 10 + i * 2, cx - 2 + i * 2], [z0, z0 + 0.25], { off: 0.002 }); }
  g.add(kw.mesh('water', undefined, false));
  g.userData.water = { mesh: 'water', y: WL };
  return g;
}

// ── 44. terrain_river (sunken: edgeY 4.0; channel along X at z≈0 under the bridge) ─
export function buildTerrainRiver() {
  const k = new Kit(10101); k.floor = 0;
  const n1 = noise(10110), n2 = noise(10120);
  const r = rng(10130);
  const E = 4.0, WL = 0.35;
  const zc = (x) => 6.5 * Math.sin((26 - x) / 15) * smooth(26, 12, x);
  const hw = (x) => 8 + 1.6 * n1(x / 11, 1.7) * smooth(26, 14, x);
  const h = (x, z) => {
    const s = Math.abs(z - zc(x)), w = hw(x);
    const bank = E * smooth(w, w + 6, s);
    const top = 0.6 * mask(x, z, 10, 8) * smooth(w + 6, w + 10, s) * (fbm(n2, x / 12, z / 12) + 0.4);
    return Math.max(0, bank + Math.max(0, top));
  };
  const color = (fx, fy, fz, nx, ny) => {
    if (fy < WL + 0.05) return '#5e5a4e';
    if (fy < 1.1) return fbm(n2, fx / 3, fz / 3) > 0 ? '#a8a08a' : '#948d7a';
    if (ny < 0.75) return fy > 3 ? '#7a6a50' : '#8a7c62';
    return fbm(n2, fx / 8, fz / 8) > 0.35 ? '#93a062' : '#748c4a';
  };
  heightfield(k, steps(-40, 40, 2.5), steps(-30, 30, 2.0), h, color, { seed: 10140, skirt: '#6a5a46', jitter: 0.2 });
  // rocks in and beside the water, reeds on the banks, a fallen log
  for (let i = 0; i < 14; i++) { const x = -38 + r() * 74, z = zc(x) + (r() - 0.5) * 2 * (hw(x) + 2); k.ico(i % 3 ? '#8d8679' : '#7a756b', 0.4 + r() * 1.0, [x, h(x, z) + 0.1, z], { seed: 10150 + i, jitter: 0.22, flatBottom: -0.2, jit: 0.08 }); }
  for (let i = 0; i < 22; i++) { const x = -38 + r() * 70, side = i % 2 ? 1 : -1, z = zc(x) + side * (hw(x) + 0.6 + r() * 1.2); reeds(k, x, h(x, z) - 0.05, z, 1.3 + r() * 0.5, 10170 + i, 4); }
  k.cyl((cx, cy, cz, nx) => (Math.abs(nx) > 0.8 ? '#b9ad94' : '#8a7c62'), 0.3, 0.35, 7, [-16, 0.7, zc(-16) + hw(-16) - 1.5], { axis: 'x', seg: 6, rot: [0, 0.6, 0.12] });
  const g = tileRoot('terrain_river', 0, k, E + 1.5, E);
  // water ribbon (separate mesh), lighter at the edges, foam streaks past the rocks
  const kw = new Kit(10102);
  const xs = steps(-40, 40, 2.0);
  const across = [-1.25, -0.55, 0.55, 1.25];
  const wc = ['#7aa0ac', '#4f7a8c', '#7aa0ac'];
  for (let i = 0; i < xs.length - 1; i++) {
    const xa = xs[i], xb = xs[i + 1];
    for (let j = 0; j < 3; j++) {
      const za0 = zc(xa) + across[j] * (hw(xa) * (j === 0 || j === 2 ? 1 : 0.9)), za1 = zc(xa) + across[j + 1] * hw(xa);
      const zb0 = zc(xb) + across[j] * hw(xb), zb1 = zc(xb) + across[j + 1] * hw(xb);
      kw.poly(wc[j], [[xa, WL, za0], [xb, WL, zb0], [xb, WL, zb1], [xa, WL, za1]], { facing: [0, 1, 0], jit: 0.04 });
    }
  }
  for (let i = 0; i < 10; i++) { const x = -36 + i * 7.5 + r() * 2, z = zc(x) + (r() - 0.5) * hw(x); kw.rectY('#c9dce0', WL + 0.01, [x, x + 2.5 + r() * 2], [z, z + 0.18], { off: 0.002 }); }
  g.add(kw.mesh('water', undefined, false));
  g.userData.water = { mesh: 'water', y: WL, flow: '−X → +X' };
  g.userData.bridge = { kind: 'covered_bridge', channel: [-hw(40), hw(40)], note: 'channel at the road edge spans z ∈ ±8 (banks reach edgeY at |z| ≈ 14)' };
  return g;
}

// ── 45. terrain_dunes (v0 tall crescent dunes, v1 low dunes with scrub) ─────────
export function buildTerrainDunes(variant = 0) {
  const v = vmod(variant, 2);
  const k = new Kit(10200 + v); k.floor = 0;
  const n1 = noise(10210 + v), n2 = noise(10220 + v);
  const r = rng(10230 + v);
  const P = v ? 14 : 21;
  const dune = (x, z) => {
    const d = RX - x;
    const u = d + 5 * n1(z / 16, 0.5) + 2 * n1(z / 6, 4.1);
    const ph = u / P - Math.floor(u / P);
    const prof = ph < 0.8 ? Math.pow(ph / 0.8, 1.6) : 1 - smooth(0, 1, (ph - 0.8) / 0.2);
    const A = (v ? 2.6 : 9.0) * (0.8 + 0.35 * n2(Math.floor(u / P) * 1.7, z / 25)) * smooth(3, 18, d);
    return A * prof;
  };
  const h = (x, z) => Math.max(0, dune(x, z) * mask(x, z, 11, 8, 10) + 0.15 * (n2(x / 3, z / 3) + 1) * mask(x, z, 4, 4));
  const color = (cx, cy, cz, nx, ny) => {
    const rip = Math.sin((RX - cx) * 2.4 + cz * 0.4) > 0.6;
    if (nx > 0.3) return ny < 0.75 ? '#b98c58' : '#c9a06a';            // slip faces (lee side, toward the road)
    if (nx < -0.2) return rip ? '#e6c995' : '#eed4a2';                  // sunlit windward slopes
    return rip ? '#d9b884' : '#e0c18c';
  };
  heightfield(k, steps(-40, 40, 1.6), steps(-30, 30, 2.5), h, color, { seed: 10240 + v, skirt: '#c49a62', jitter: 0.15 });
  if (v) {
    for (let i = 0; i < 26; i++) { const x = -38 + r() * 72, z = -28 + r() * 56; bush(k, x, h(x, z) - 0.1, z, 0.35 + r() * 0.35, i % 3 ? '#8a8a55' : '#7a7a4a', 10250 + i); }
    for (let i = 0; i < 20; i++) { const x = -38 + r() * 72, z = -28 + r() * 56; tuft(k, x, h(x, z), z, 0.6, '#c9b47a', 10280 + i); }
  } else {
    for (let i = 0; i < 6; i++) { const x = -30 + r() * 60, z = -24 + r() * 48; k.ico('#a58266', 0.4 + r() * 0.5, [x, h(x, z) - 0.1, z], { seed: 10300 + i, jitter: 0.3, flatBottom: -0.2 }); }
    for (let i = 0; i < 3; i++) { const x = -20 + i * 14, z = -18 + r() * 30; k.cyl('#d9cdb4', 0.03, 0.03, 0.4, [x, h(x, z) - 0.05, z], { axis: 'x', seg: 3, rot: [0, r() * 3, 0.3] }); } // bleached bones/sticks
  }
  let hMax = 0; for (let x = -40; x <= 40; x += 2) for (let z = -30; z <= 30; z += 2) hMax = Math.max(hMax, h(x, z));
  const g = tileRoot('terrain_dunes', v, k, hMax + 0.5, 0, {}, 10);
  g.userData.style = v ? 'low scrub' : 'tall';
  return g;
}

// ── 46. terrain_salt (cracked salt-crust plates) ────────────────────────────────
export function buildTerrainSalt() {
  const k = new Kit(10401); k.floor = 0;
  const r = rng(10402);
  k.box('#bdb5a6', [80, 0.02, 60], [0, 0, 0], { base: true });                  // the cracks (seen between plates)
  k.box('#b8ad98', [4, 0.05, 60], [38, 0, 0], { base: true });                  // gravel verge at the road
  const R = 1.85, wHex = Math.sqrt(3) * R, rowH = 1.5 * R;
  const tones = ['#ebe7de', '#e4dfd3', '#efebe4', '#dfd9cd', '#e8e3d9'];
  // corners are displaced by a hash of their (rounded) position, so neighbouring plates share them → irregular cells
  const corner = (x, z) => { const ix = Math.round(x * 8), iz = Math.round(z * 8); return [x + (hash2(ix, iz, 11) - 0.5) * 1.15, z + (hash2(iz, ix, 13) - 0.5) * 1.15]; };
  for (let row = 0; row * rowH < 62; row++) {
    const zc = -30 + row * rowH;
    for (let col = -1; col * wHex < 78; col++) {
      const xc = -40 + col * wHex + (row % 2 ? wHex / 2 : 0);
      const raw = [];
      for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i / 6) * Math.PI * 2; raw.push(corner(xc + Math.cos(a) * R, zc + Math.sin(a) * R)); }
      const mx = raw.reduce((s2, p) => s2 + p[0], 0) / 6, mz = raw.reduce((s2, p) => s2 + p[1], 0) / 6;
      const pts = raw.map(([x, z]) => { const dx = x - mx, dz = z - mz, L = Math.hypot(dx, dz) || 1; return [x - (dx / L) * 0.05, z - (dz / L) * 0.05]; });
      const poly = clipRect(pts, -40, 36, -30, 30);
      if (poly.length < 3) continue;
      const ccx = poly.reduce((s2, p) => s2 + p[0], 0) / poly.length, ccz = poly.reduce((s2, p) => s2 + p[1], 0) / poly.length;
      const tone = tones[Math.floor(r() * tones.length)];
      const yc = 0.03 + r() * 0.02, yr = 0.07 + r() * 0.05;               // dished plates with raised ridges along the cracks
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b2 = poly[(i + 1) % poly.length];
        k.poly(tone, [[ccx, yc, ccz], [a[0], yr, a[1]], [b2[0], yr, b2[1]]], { facing: [0, 1, 0], jit: 0.035 });
      }
    }
  }
  // tyre tracks swinging across the flat + a few salt mounds + a marker stake
  for (const off of [0, 1.7]) {
    let px = 36, pz = -20 + off;
    for (let i = 0; i < 16; i++) { const nx = px - 4.6, nz = -20 + off + 14 * Math.sin(i * 0.22) ** 2; k.poly('#c9c2b4', [[px, 0.13, pz - 0.18], [nx, 0.13, nz - 0.18], [nx, 0.13, nz + 0.18], [px, 0.13, pz + 0.18]], { facing: [0, 1, 0] }); px = nx; pz = nz; }
  }
  for (let i = 0; i < 6; i++) { const x = -34 + r() * 60, z = -26 + r() * 52; k.cone('#f3f0ea', 0.6 + r() * 0.6, 0.4 + r() * 0.4, [x, 0.04, z], { base: true, seg: 6, jit: 0.05 }); }
  k.box('#c4572b', [0.06, 1.2, 0.06], [22, 0, 8], { base: true }); k.box('#e9e2cf', [0.3, 0.2, 0.02], [22.15, 1.0, 8]);
  return tileRoot('terrain_salt', 0, k, 1.3, 0, {}, 80);
}

// ── 47. terrain_forest_floor (needles, roots, ferns; userData.treeSpots for pines) ─
export function buildTerrainForestFloor() {
  const k = new Kit(10501); k.floor = 0;
  const n1 = noise(10510), n2 = noise(10520);
  const r = rng(10530);
  const h = (x, z) => Math.max(0, 0.9 * mask(x, z, 8, 6) * (fbm(n1, x / 11, z / 11) + 0.55));
  // tree spots: jittered grid, kept off the verge
  const spots = [];
  for (let gx = -36; gx < 28; gx += 9) for (let gz = -24; gz <= 24; gz += 9.5) { const x = gx + (r() - 0.5) * 5, z = gz + (r() - 0.5) * 5; if (r() < 0.82) spots.push([+x.toFixed(2), +z.toFixed(2)]); }
  const nearTree = (x, z) => spots.some(([sx, sz]) => (sx - x) ** 2 + (sz - z) ** 2 < 6);
  const color = (cx, cy, cz, nx, ny) => {
    const p = fbm(n2, cx / 7, cz / 7);
    if (cx > RX - TILE.verge - 1) return '#857456';
    if (nearTree(cx, cz)) return '#6e5a40';
    if (p > 0.38) return p > 0.55 ? '#6e7a44' : '#767c48';
    return p < -0.35 ? '#776043' : (ny < 0.9 ? '#7c6647' : '#836b4a');
  };
  heightfield(k, steps(-40, 40, 4), steps(-30, 30, 4), h, color, { seed: 10540, skirt: '#4e3e2c', jitter: 0.3 });
  // roots radiating from every tree spot
  for (const [x, z] of spots) {
    const y = h(x, z);
    for (let i = 0; i < 4; i++) { const a = i * 1.57 + r() * 0.6, L = 1.4 + r() * 0.8; rod(k, '#5a4433', [x, y + 0.12, z], [x + Math.cos(a) * L, y - 0.1, z + Math.sin(a) * L], 0.14, 4, 0.04); }
  }
  // ferns: fans of drooping fronds
  for (let i = 0; i < 30; i++) {
    const x = -38 + r() * 70, z = -28 + r() * 56; if (nearTree(x, z)) continue;
    const y = h(x, z);
    for (let f = 0; f < 6; f++) { const a = (f / 6) * Math.PI * 2 + r(); k.poly(f % 2 ? '#5d7b41' : '#6f8c4a', [[x, y + 0.05, z], [x + Math.cos(a + 0.18) * 0.5, y + 0.45, z + Math.sin(a + 0.18) * 0.5], [x + Math.cos(a) * 1.0, y + 0.2, z + Math.sin(a) * 1.0], [x + Math.cos(a - 0.18) * 0.5, y + 0.45, z + Math.sin(a - 0.18) * 0.5]], { facing: [0, 1, 0] }); }
  }
  // fallen log, stumps, mossy rocks, a mushroom ring
  k.cyl((cx, cy, cz, nx) => (Math.abs(nx) > 0.8 ? '#b99a6a' : '#5a4433'), 0.45, 0.5, 11, [-12, h(-12, 6) + 0.3, 6], { axis: 'x', seg: 7, rot: [0, 0.5, 0] });
  for (let i = 0; i < 5; i++) { const a = r() * 6, x = -12 + Math.cos(0.5) * (i * 2 - 4), z = 6 - Math.sin(0.5) * (i * 2 - 4); k.ico('#5f6e3a', 0.3, [x, h(x, z) + 0.7, z], { scale: [1.4, 0.4, 1], seed: 10550 + i, rot: [0, a, 0] }); }
  for (let i = 0; i < 4; i++) { const x = -34 + r() * 56, z = -26 + r() * 52, y = h(x, z); k.cyl('#5a4433', 0.42, 0.5, 0.6, [x, y - 0.1, z], { base: true, seg: 7 }); k.cyl('#c9a36a', 0.4, 0.4, 0.02, [x, y + 0.5, z], { seg: 7 }); }
  for (let i = 0; i < 8; i++) { const x = -36 + r() * 64, z = -27 + r() * 54; k.ico((cx, cy, cz, nx, ny) => (ny > 0.5 ? '#5f6e3a' : '#7d776c'), 0.5 + r() * 0.7, [x, h(x, z) - 0.1, z], { seed: 10560 + i, jitter: 0.25, flatBottom: -0.3, jit: 0.08 }); }
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2, x = 6 + Math.cos(a) * 1.4, z = -14 + Math.sin(a) * 1.4, y = h(x, z); k.cyl('#e9e2cf', 0.04, 0.05, 0.16, [x, y, z], { base: true, seg: 4 }); k.cone('#b8452f', 0.12, 0.1, [x, y + 0.16, z], { base: true, seg: 5 }); }
  const g = tileRoot('terrain_forest_floor', 0, k, 2.2, 0, {}, 4);
  g.userData.treeSpots = spots;
  return g;
}

// ── 48. terrain_field (ploughed furrows across the tile, grass verge at the road) ─
export function buildTerrainField() {
  const k = new Kit(10601); k.floor = 0;
  const r = rng(10602);
  const xEnd = 31, H = 0.34, pitch = 1.0;
  // furrows run along X (perpendicular to the road): z nodes alternate trough / crest
  const zs = steps(-30, 30, pitch / 2), xs = [-40, -16, 8, xEnd];
  const hf = (x, z) => { const j = Math.round((z + 30) / (pitch / 2)); return j % 2 ? H * (0.85 + 0.3 * hash2(j, Math.round(x), 5)) : 0; };
  const P = xs.map((x) => zs.map((z) => [x, hf(x, z), z]));
  const soil = (cx, cy, cz, nx, ny, nz) => (nz > 0.2 ? '#8a7354' : nz < -0.2 ? '#54432f' : '#6e5a42');
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
    const a = P[i][j], b = P[i + 1][j], c = P[i + 1][j + 1], d = P[i][j + 1];
    k.poly(soil, [a, d, c], { facing: [0, 1, 0], jit: 0.05 }); k.poly(soil, [a, c, b], { facing: [0, 1, 0], jit: 0.05 });
  }
  // furrow ends at the far edge get a skirt
  for (let j = 0; j < zs.length - 1; j++) { const a = P[0][j], b = P[0][j + 1]; if (a[1] + b[1] > 0.02) k.poly('#5c4a38', [[a[0], 0, a[2]], [b[0], 0, b[2]], b, a], { facing: [-1, 0, 0], off: 0 }); }
  // headland + grass verge at the road side, fence line, stone pile, puddles, a few crows
  k.box('#8a7a5a', [2.0, 0.04, 60], [xEnd + 1.0, 0, 0], { base: true });
  k.box('#7f9a58', [7.0, 0.05, 60], [36.5, 0, 0], { base: true });
  for (let z = -28; z <= 28; z += 4) { k.box(PAL.woodDark, [0.14, 1.2, 0.14], [34.5, 0, z], { base: true }); if (z < 28) for (const y of [0.55, 1.0]) k.box(PAL.wood, [0.05, 0.08, 4.0], [34.5, y, z + 2]); }
  for (let i = 0; i < 12; i++) k.ico('#9a948a', 0.3 + r() * 0.25, [-36 + r() * 3, 0.2, 26 + r() * 3], { seed: 10610 + i, jitter: 0.3, flatBottom: -0.1 });
  for (const [x, z] of [[-6, 8], [14, -14]]) k.blob('#6f8a96', 1.2, [x, 0.14, z], { seg: 7, seed: 10620 + x, sx: 1.6, off: 0 });
  for (let i = 0; i < 5; i++) { const x = -20 + r() * 40, z = -20 + r() * 40; k.ico('#1f2022', 0.16, [x, 0.4, z], { scale: [1.4, 0.9, 0.9], seed: 10630 + i }); k.cone('#2a2b2d', 0.05, 0.12, [x + 0.22, 0.44, z], { seg: 3, rot: [0, 0, -1.4] }); }
  for (let i = 0; i < 24; i++) { const z = -29 + r() * 58; tuft(k, 32.6 + r() * 6, 0.05, z, 0.45, '#8fa35c', 10640 + i); }
  return tileRoot('terrain_field', 0, k, 1.3, 0, {}, 9);
}

// ── 49. terrain_scree (rocky scree / talus fan below a rock band) ───────────────
export function buildTerrainScree() {
  const k = new Kit(10701); k.floor = 0;
  const n1 = noise(10710), n2 = noise(10720);
  const r = rng(10730);
  const h = (x, z) => {
    const d = RX - x, m = mask(x, z, 18, 8);
    const fan = 20 * Math.pow(smooth(6, 72, d), 1.15) * (1 - 0.35 * (Math.abs(z) / 30) ** 2);
    const band = 7 * smooth(64, 70, d);
    const rough = 0.7 * fbm(n1, x / 4, z / 4) + 1.4 * fbm(n2, x / 15, z / 15);
    return Math.max(0, (fan + band + rough) * m);
  };
  const greys = ['#8d8679', '#9a9488', '#7d776c', '#a39d90', '#857f73'];
  const color = (cx, cy, cz, nx, ny) => {
    if (cy < 1.0) return ny > 0.9 ? '#8a9258' : '#7f8452';
    if (ny < 0.6) return cy > 20 ? '#6f6a60' : '#77726a';
    return greys[Math.floor((fbm(n2, cx / 3, cz / 3) + 1) * 2.5) % 5];
  };
  heightfield(k, steps(-40, 40, 2.5), steps(-30, 30, 2.5), h, color, { seed: 10740, skirt: '#6f6a60', jitter: 0.25, jit: 0.12 });
  for (let i = 0; i < 95; i++) {
    const x = -38 + r() * 70, z = -27 + r() * 54, y = h(x, z);
    if (y < 0.4 && r() < 0.6) continue;
    const s = 0.25 + r() * (y > 12 ? 1.2 : 0.6);
    k.ico(greys[i % 5], s, [x, y + s * 0.1, z], { detail: 0, jitter: 0.3, seed: 10750 + i, flatBottom: -s * 0.4, scale: [1.2, 0.7, 1], jit: 0.12 });
  }
  for (let i = 0; i < 8; i++) { const x = 28 - r() * 8, z = -24 + r() * 48; bush(k, x, h(x, z) - 0.1, z, 0.4 + r() * 0.3, '#7d8a4a', 10860 + i); }
  let hMax = 0; for (let x = -40; x <= 40; x += 2) for (let z = -30; z <= 30; z += 2) hMax = Math.max(hMax, h(x, z));
  return tileRoot('terrain_scree', 0, k, hMax + 1.5, 0, {}, 6);
}
void mix; void shade; void tuft;
