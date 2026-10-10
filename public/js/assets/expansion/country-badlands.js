// Country pack · F. Salt flats & badlands: hoodoo, weather_balloon, motel_ruin, plane_wreck.
import * as THREE from 'three';
import { root, mat } from '../models/kit.js';
import { walls, wr } from '../models/scenery.js';
import { Kit, rng, PAL, mix, shade, vmod, signMesh, drawTex, fitText, beam, rod, recentre, sized } from './country-common.js';

/** Lathe with deterministic radial jitter (shared seam vertices get the same offset). */
function rockLathe(k, color, pts, seg, pos, jitter, seed, o = {}) {
  const g = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg);
  const p = g.attributes.position;
  const cache = new Map();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    let f = cache.get(key);
    if (!f) { const r = rng(seed + cache.size * 17 + 3); r(); f = [1 + (r() - 0.5) * 2 * jitter, (r() - 0.5) * jitter * 0.6]; cache.set(key, f); }
    p.setXYZ(i, x * f[0], y + f[1], z * f[0]);
  }
  k.geo(g, color, mat(pos, o.rot || [0, 0, 0], o.scale || [1, 1, 1]), { jit: o.jit ?? 0.05 });
  g.dispose();
}
const BANDS = ['#ead6b6', '#dba57c', '#c97f52', '#b5683e', '#e6c9a0', '#d18d62', '#c0704a'];
const banded = (base = 0) => (cx, cy, cz, nx, ny) => (ny > 0.75 ? '#e2c8a2' : BANDS[(Math.floor(cy / 1.05) + base) % BANDS.length]);

// ── 31. hoodoo (3 variants) ──────────────────────────────────────────────────────
function spire(k, x, z, H, seed, wide = 1) {
  const r = rng(seed);
  // talus skirt (sandy debris cone) the column rises out of
  rockLathe(k, (cx, cy, cz, nx, ny) => (ny > 0.5 ? '#d9b48a' : '#c99a70'), [[3.1 * wide, 0], [2.3 * wide, 0.45], [1.5 * wide, H * 0.16], [0, H * 0.16 + 0.05]], 8, [x, 0, z], 0.16, seed + 5);
  // column: a ring every ~0.85 m with irregular bulges and a pinched neck under the cap
  const pts = [[0, 0], [1.5 * wide, 0]];
  const n = Math.ceil(H / 0.85), f = 2 + r() * 2, ph = r() * 6;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    let rad = wide * (1.4 - 0.5 * t) * (1 + 0.16 * Math.sin(t * Math.PI * f + ph) + (r() - 0.5) * 0.24);
    if (t > 0.8) rad *= 0.72;
    pts.push([Math.max(0.3, rad), t * H]);
  }
  pts.push([0, H + 0.05]);
  rockLathe(k, banded(Math.floor(r() * 7)), pts, 8, [x, 0, z], 0.13, seed + 1);
  // cap rock: darker, harder layer that overhangs the neck
  k.ico((cx, cy, cz, nx, ny) => (ny > 0.4 ? '#9a7a5e' : '#6e5040'), 1, [x + (r() - 0.5) * 0.3, H + 0.3, z], { detail: 0, jitter: 0.15, seed: seed + 2, scale: [1.5 * wide + 0.45, 0.6, 1.35 * wide + 0.45], jit: 0.06 });
  k.cyl('#b9946e', 0.95 * wide, 1.1 * wide, 0.25, [x, H - 0.05, z], { seg: 7 });
  // fallen chunks
  for (let i = 0; i < 4; i++) { const a = r() * Math.PI * 2, d = 2.4 * wide + r() * 1.0; k.ico(BANDS[i % 7], 0.3 + r() * 0.4, [x + Math.cos(a) * d, 0.15, z + Math.sin(a) * d], { seed: seed + 10 + i, jitter: 0.2, flatBottom: -0.15 }); }
}
export function buildHoodoo(variant = 0) {
  const v = vmod(variant, 3);
  const k = new Kit(8100 + v); k.floor = 0;
  if (v === 0) spire(k, 0, 0, 8, 8110, 1);
  else if (v === 1) spire(k, 0, 0, 13, 8120, 0.85);
  else { spire(k, -1.8, 0.4, 9, 8130, 0.9); spire(k, 1.9, -0.6, 6, 8140, 0.8); spire(k, 0.4, 2.1, 4.5, 8150, 0.7); }
  k.blob(mix(PAL.sand, '#d9a57c', 0.4), v === 2 ? 5.5 : 3.6, [0, 0.012, 0], { seg: 11, seed: 8160 + v, off: 0 });
  const g = root('hoodoo', v, { w: 1, h: 1, l: 1 });
  g.add(k.mesh('body'));
  g.userData.style = ['single', 'tall', 'cluster'][v];
  return sized(g);
}

// ── 32. weather_balloon (crashed: deflated silver envelope + instrument box) ────
function crumple(k, cx, cz, R, rings, segs, hmax, seed, colors, sx = 1, sz = 1) {
  const r = rng(seed);
  const P = [];
  for (let i = 0; i <= rings; i++) {
    const row = [];
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2, rr = (i / rings) * R * (i === rings ? 0.9 + r() * 0.25 : 1);
      const h = i === rings ? 0.02 : hmax * (1 - i / rings) * (0.35 + r() * 0.8);
      row.push([cx + Math.cos(a) * rr * sx, h, cz + Math.sin(a) * rr * sz]);
    }
    P.push(row);
  }
  const col = (x, y, z, nx, ny) => (ny > 0.85 ? colors[0] : ny > 0.55 ? colors[1] : colors[2]);
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = P[i][j], b = P[i][(j + 1) % segs], c = P[i + 1][(j + 1) % segs], d = P[i + 1][j];
    if (i === 0) { k.poly(col, [a, d, c], { facing: [0, 1, 0], jit: 0.04 }); continue; }
    k.poly(col, [a, d, c], { facing: [0, 1, 0], jit: 0.04 }); k.poly(col, [a, c, b], { facing: [0, 1, 0], jit: 0.04 });
  }
}
export function buildWeatherBalloon() {
  const k = new Kit(8201); k.floor = 0;
  const silver = ['#e6e8e8', '#aab0b4', '#767d82'];
  k.blob(shade(PAL.sand, 0.86), 4.2, [0.4, 0.008, 0], { seg: 12, seed: 8202, sx: 1.4, sz: 0.9, off: 0 });  // scuffed ground
  for (const z of [-0.5, 0.5]) k.rectY(shade(PAL.sand, 0.8), 0.012, [3.0, 9.5], [z - 0.12, z + 0.12], { off: 0 }); // drag marks
  crumple(k, -1.0, 0, 3.2, 5, 16, 1.25, 8203, silver, 1.2, 0.9);
  crumple(k, 2.2, -0.4, 1.6, 3, 11, 0.7, 8204, silver, 1.4, 0.7);
  crumple(k, -3.9, 1.2, 1.0, 2, 9, 0.45, 8205, silver, 1.0, 0.8);
  // fold ridges (sharp creases) + the envelope's neck tube trailing toward the payload
  const fr = rng(8207);
  for (let i = 0; i < 7; i++) { const a = fr() * Math.PI * 2, L = 1.4 + fr() * 1.8, x0 = -1.0 + Math.cos(a) * 0.6, z0 = Math.sin(a) * 0.5; k.poly(i % 2 ? '#f2f4f4' : '#9aa1a6', [[x0, 0.25, z0], [x0 + Math.cos(a) * L, 0.05, z0 + Math.sin(a) * L * 0.8], [x0 + Math.cos(a + 0.25) * L * 0.6, 0.55 + fr() * 0.3, z0 + Math.sin(a + 0.25) * L * 0.5]], { facing: [0, 1, 0] }); }
  rod(k, '#c8cccd', [2.0, 0.25, -0.3], [3.4, 0.12, -0.9], 0.12, 6, 0.06);
  // parachute (orange / white gores) lying crumpled
  const pr = rng(8206);
  const pc = [5.0, 1.6];
  for (let j = 0; j < 8; j++) {
    const a0 = (j / 8) * Math.PI * 2, a1 = ((j + 1) / 8) * Math.PI * 2, R = 1.1 + pr() * 0.3;
    k.poly(j % 2 ? '#e8e2d6' : '#e0702a', [[pc[0], 0.25, pc[1]], [pc[0] + Math.cos(a0) * R, 0.03 + pr() * 0.15, pc[1] + Math.sin(a0) * R * 0.8], [pc[0] + Math.cos(a1) * R, 0.03 + pr() * 0.15, pc[1] + Math.sin(a1) * R * 0.8]], { facing: [0, 1, 0] });
  }
  // instrument package (radiosonde): white foam box, label, antenna, lines to the chute + envelope neck
  const bx = 4.0, bz = -1.3;
  k.box('#efece4', [0.42, 0.28, 0.3], [bx, 0, bz], { base: true, c: 0.03, rot: [0, 0.5, 0.25] });
  k.box('#c4372b', [0.43, 0.06, 0.31], [bx, 0.17, bz], { rot: [0, 0.5, 0.25] });
  rod(k, '#3a3b3d', [bx + 0.1, 0.2, bz], [bx + 0.9, 0.05, bz + 0.6], 0.01, 3);
  rod(k, '#e9e2cf', [bx, 0.25, bz], [pc[0], 0.25, pc[1]], 0.008, 3);
  rod(k, '#e9e2cf', [bx, 0.25, bz], [2.0, 0.3, -0.3], 0.008, 3);
  rod(k, '#e9e2cf', [pc[0], 0.25, pc[1]], [2.8, 0.3, 0.2], 0.008, 3);
  // radar reflector: three intersecting foil squares, half buried
  k.at([-2.2, 0.35, -2.0], [0.5, 0.6, 0.3], () => {
    k.box('#c8cacb', [0.9, 0.9, 0.02], [0, 0, 0]); k.box('#b0b4b6', [0.02, 0.9, 0.9], [0, 0, 0]); k.box('#dcdedd', [0.9, 0.02, 0.9], [0, 0, 0]);
  });
  // scattered bits: a snapped balsa spar, a tag
  k.box('#d9c49a', [0.9, 0.04, 0.04], [1.2, 0.05, 1.8], { rot: [0, 0.8, 0] });
  k.box('#e2b93b', [0.18, 0.02, 0.12], [3.4, 0.03, 0.6], { rot: [0, 0.3, 0] });
  const g = root('weather_balloon', 0, { w: 1, h: 1, l: 1 });
  g.add(k.mesh('body'));
  return recentre(g);
}

// ── 33. motel_ruin (abandoned "OASIS MOTEL" arrow sign + crumbling office) ─────
export function buildMotelRuin() {
  const k = new Kit(8301); k.floor = 0;
  const r = rng(8302);
  const st = '#c9b49a', stD = mix('#c9b49a', PAL.dirt, 0.35);
  k.blob(shade(PAL.sand, 0.95), 9, [0, 0.01, 0], { seg: 12, seed: 8303, sx: 1.3, sz: 0.8, off: 0 });
  // cracked slab of the old forecourt
  k.box('#8f8a80', [16, 0.06, 7], [-1, 0, 4.5], { base: true });
  for (let i = 0; i < 6; i++) { const x = -8 + r() * 14; k.rectY('#5f5a52', 0.065, [x, x + 0.08], [1.2, 7.8], { off: 0.002, rot: [0, r(), 0] }); }
  for (let i = 0; i < 5; i++) k.ico(PAL.cactus, 0.25 + r() * 0.2, [-8 + r() * 14, 0.1, 1.5 + r() * 6], { seed: 8304 + i, jitter: 0.3, scale: [1.2, 0.6, 1] }); // weeds
  // office walls with jagged broken tops (each wall = a few panels of different heights)
  const ox = -2.5, oz = -2.5, ow = 8, od = 6;
  const wallRun = (x0, z0, x1, z1, hs, col) => {
    const n = hs.length, L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(z1 - z0, x1 - x0);
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; k.box(col, [L / n + 0.02, hs[i], 0.3], [x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t], { base: true, rot: [0, -a, 0] }); }
  };
  wallRun(ox - ow / 2, oz + od / 2, ox - 1.2, oz + od / 2, [3.2, 3.0, 2.6], st);
  wallRun(ox + 0.6, oz + od / 2, ox + ow / 2, oz + od / 2, [1.4, 2.2, 3.1], st);
  wallRun(ox - ow / 2, oz - od / 2, ox + ow / 2, oz - od / 2, [3.2, 3.2, 2.9, 1.8, 1.0], stD);
  wallRun(ox - ow / 2, oz - od / 2, ox - ow / 2, oz + od / 2, [3.2, 3.1, 3.2], stD);
  wallRun(ox + ow / 2, oz - od / 2, ox + ow / 2, oz + od / 2, [0.8, 1.5, 1.2], st);
  // window holes + boarded window + door gap
  k.rectZ('#2a2624', oz + od / 2 + 0.15, [ox - 3.3, ox - 1.9], [1.0, 2.1], 1, { off: 0.01 });
  for (let i = 0; i < 3; i++) k.box(PAL.woodGrey, [1.6, 0.18, 0.05], [ox - 2.6, 1.2 + i * 0.35, oz + od / 2 + 0.2], { rot: [0, 0, (r() - 0.5) * 0.4] });
  k.rectZ('#2a2624', oz + od / 2 + 0.15, [ox + 1.8, ox + 3.0], [1.0, 1.9], 1, { off: 0.01 });
  // half-collapsed roof slab sagging into the room + rubble
  k.box('#8a7a64', [5.2, 0.2, 6.4], [ox - 1.4, 2.0, oz], { rot: [0, 0, 0.42] });
  k.box('#6f6656', [5.4, 0.06, 6.5], [ox - 1.3, 2.12, oz], { rot: [0, 0, 0.42] });
  for (let i = 0; i < 4; i++) k.box(PAL.woodDark, [0.15, 0.2, 6.4], [ox - 3 + i * 1.1, 2.4 + i * 0.45 - 0.9, oz], { rot: [0, 0, 0.42] });
  for (let i = 0; i < 9; i++) k.ico(i % 2 ? st : '#8a8478', 0.25 + r() * 0.35, [ox + 1 + r() * 3, 0.15, oz - 2 + r() * 4], { seed: 8310 + i, jitter: 0.3, flatBottom: -0.1 });
  // rusted ice machine + dead palm
  k.box(mix('#c9cccd', PAL.rust, 0.5), [1.0, 1.6, 0.8], [ox + ow / 2 + 1.0, 0, oz + od / 2 - 0.2], { base: true, rot: [0, 0, 0.12] });
  for (let i = 0; i < 6; i++) k.cyl('#7a6a54', 0.22 - i * 0.015, 0.24 - i * 0.015, 1.2, [-9.6 + i * 0.12, 0.6 + i * 1.15, -3.0], { seg: 6, rot: [0, 0, -0.1] });
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.box('#8a7a5a', [2.2, 0.04, 0.35], [-9.0 + Math.cos(a) * 0.9, 6.6 - 0.5, -3.0 + Math.sin(a) * 0.9], { rot: [0, -a, -0.75] }); }
  // the arrow sign: two rusty poles + arrow box + bulb sockets (many missing)
  const sx = 6.5, sz = 5.5;
  for (const dx of [-1.6, 1.6]) k.box(mix('#5f6468', PAL.rust, 0.6), [0.3, 9.5, 0.3], [sx + dx, 0, sz - 0.4], { base: true });
  const arrow = [[-3.2, 0], [2.2, 0], [2.2, -0.6], [3.8, 1.0], [2.2, 2.6], [2.2, 2.0], [-3.2, 2.0]];
  k.extrude((cx, cy, cz, nx, ny, nz) => (Math.abs(nz) > 0.9 ? '#7a8a7a' : PAL.rustDark), arrow, 0.35, { axis: 'z', pos: [sx, 6.4, sz] });
  const bulbs = [];
  for (let i = 0; i < arrow.length; i++) { const a = arrow[i], b = arrow[(i + 1) % arrow.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let t = 0; t < L; t += 0.55) bulbs.push([a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L]); }
  bulbs.forEach(([bx2, by], i) => { if (r() < 0.55) k.box(r() < 0.3 ? '#efe6c8' : '#4a4038', [0.1, 0.1, 0.08], [sx + bx2 * 0.92, 6.4 + 0.08 + by * 0.92, sz + 0.2]); void i; });
  // a dangling broken panel
  k.box('#7a8a7a', [1.6, 0.9, 0.06], [sx - 0.4, 5.6, sz + 0.1], { rot: [0.1, 0, 0.6] });
  const g = root('motel_ruin', 0, { w: 1, h: 1, l: 1 });
  g.add(k.mesh('body'));
  const tex = drawTex('oasis', 1024, 384, '#7a8a7a', (ctx, W, H) => {
    ctx.fillStyle = '#6a7a6a'; ctx.fillRect(0, 0, W, H);
    const rr = rng(8320);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(${120 + rr() * 30},${70 + rr() * 20},${40},${0.25 + rr() * 0.35})`; ctx.fillRect(rr() * W, rr() * H, 20 + rr() * 90, 8 + rr() * 30); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#e8dcc0';
    ctx.font = '900 150px Georgia, "Times New Roman", serif';
    const word = 'OASIS', missing = [2];
    for (let i = 0; i < word.length; i++) if (!missing.includes(i)) ctx.fillText(word[i], 150 + i * 150, 120);
    ctx.fillStyle = '#c4572b'; ctx.font = '900 110px Arial, sans-serif';
    const w2 = 'MOTEL', miss2 = [1, 4];
    for (let i = 0; i < w2.length; i++) if (!miss2.includes(i)) ctx.fillText(w2[i], 210 + i * 110, 280);
    ctx.save(); ctx.translate(780, 280); ctx.rotate(0.5); ctx.fillStyle = '#d9c9a0'; ctx.fillRect(-40, -12, 80, 24); ctx.restore();
  });
  // face of the arrow (front panel only): arrow spans x -3.2..3.8 (×0.92), y 0..2.6 at sz + 0.18
  g.add(signMesh(tex, [{ w: 5.0 * 0.92, h: 1.9 * 0.92, pos: [sx - 0.5 * 0.92, 6.4 + 1.0 * 0.92, sz + 0.19] }], '#7a8a7a'));
  return recentre(g);
}

// ── 34. plane_wreck (rusty high-wing taildragger, nose in the sand) ───────────
export function buildPlaneWreck() {
  const k = new Kit(8401); k.floor = 0;
  const r = rng(8402);
  const cream = '#d6c9ae', stripe = '#a8564a', rust = PAL.rust;
  const body = (cx, cy, cz, nx, ny, nz) => (ny < -0.6 ? mix(cream, rust, 0.5) : cream);
  k.blob(shade(PAL.sand, 0.9), 5, [0, 0.008, 0.6], { seg: 12, seed: 8403, sx: 1.2, sz: 1.5, off: 0 });
  k.at([0, 1.05, 0], [0.13, 0.35, 0.16], () => {
    // cabin section + tail cone
    k.box(body, [1.3, 1.45, 3.0], [0, 0, 0.6], { c: 0.12 });
    k.at([0, 0.0, -0.9], [-Math.PI / 2, 0, 0], () => k.box(body, [1.25, 4.6, 1.35], [0, 2.3, 0], { taper: [0.28, 0.3], shear: [0, 0.35], c: 0.05 }));
    // paint: stripe + rust patches + windows (one broken)
    for (const s of [1, -1]) {
      k.rectX(stripe, s * 0.65, [-4.5, 2.1], [-0.15, 0.05], s, { off: 0.02 });
      k.rectX('#2f3a42', s * 0.65, [0.6, 1.9], [0.2, 0.62], s, { off: 0.02 });
      k.rectX('#2f3a42', s * 0.65, [-0.6, 0.4], [0.2, 0.6], s, { off: 0.02 });
      for (let i = 0; i < 3; i++) { const z = -3 + r() * 4.5; k.rectX(r() < 0.5 ? rust : PAL.rustDark, s * 0.65, [z, z + 0.4 + r() * 0.7], [-0.6 + r() * 0.3, -0.2 + r() * 0.5], s, { off: 0.025 }); }
    }
    k.rectX('#8a9aa0', 0.65, [1.0, 1.5], [0.25, 0.55], 1, { off: 0.03 });
    k.box('#3a464c', [1.1, 0.5, 0.6], [0, 0.45, 2.0], { rot: [-0.7, 0, 0] });              // windscreen
    // engine cowl + spinner + bent prop
    k.cyl(mix(cream, rust, 0.35), 0.62, 0.68, 1.0, [0, -0.05, 2.55], { axis: 'z', seg: 9 });
    k.cyl('#2a2b2d', 0.45, 0.45, 0.02, [0, -0.05, 3.06], { axis: 'z', seg: 9 });
    k.cone('#8a8f92', 0.22, 0.4, [0, -0.05, 3.25], { seg: 7, rot: [Math.PI / 2, 0, 0] });
    k.box('#5f6064', [0.12, 1.0, 0.04], [0, 0.42, 3.15], { rot: [0.5, 0, 0.1] });
    k.box('#5f6064', [0.12, 1.0, 0.04], [0, -0.55, 3.25], { rot: [-0.2, 0, 0] });
    // high wing: right wing attached, left wing snapped off near the root
    k.box(cream, [5.2, 0.16, 1.5], [3.25, 0.8, 0.9], { c: 0.04, rot: [0, 0, -0.05] });
    k.rectY(stripe, 0.89, [5.0, 5.8], [0.15, 1.65], { off: 0.01 });
    k.box(cream, [1.1, 0.16, 1.5], [-1.2, 0.8, 0.9], { c: 0.04 });
    k.box(rust, [0.25, 0.17, 1.4], [-1.8, 0.8, 0.9], { rot: [0, 0.3, 0.2] });
    beam(k, '#8a8f92', [0.65, -0.65, 0.9], [2.8, 0.72, 1.1], 0.07);
    beam(k, '#8a8f92', [0.65, -0.65, 0.4], [2.8, 0.72, 0.5], 0.07);
    // tail feathers: fin + rudder + stabilisers (one bent down)
    k.extrude(cream, [[0, 0], [1.3, 0], [0.9, 1.25], [0.35, 1.3]].map(([z, y]) => [-z - 4.0, y + 0.55]), 0.08, { axis: 'x' });
    k.extrude(stripe, [[-5.15, 0.6], [-4.85, 0.6], [-4.95, 1.75], [-5.25, 1.7]], 0.09, { axis: 'x' });
    k.box(cream, [1.6, 0.06, 0.8], [0.85, 0.62, -4.75], { rot: [0, 0, 0.04] });
    k.box(cream, [1.6, 0.06, 0.8], [-0.75, 0.48, -4.75], { rot: [0.1, 0, 0.35] });
    // gear: right leg + wheel, left leg collapsed
    beam(k, '#5f6064', [0.5, -0.7, 1.1], [1.3, -1.35, 1.1], 0.08);
    k.cyl('#262729', 0.3, 0.3, 0.16, [1.35, -1.3, 1.1], { axis: 'x', seg: 8 });
    beam(k, '#5f6064', [-0.5, -0.7, 1.1], [-1.4, -0.95, 1.6], 0.08);
  });
  // detached left wing lying in the sand + debris + sand drifted against the nose
  k.at([-5.2, 0.25, 0.6], [0.06, -0.5, -0.12], () => {
    k.box(cream, [4.2, 0.16, 1.5], [0, 0, 0], { c: 0.04 });
    k.rectY(stripe, 0.09, [-2.0, -1.2], [-0.75, 0.75], { off: 0.01 });
    for (let i = 0; i < 3; i++) k.rectY(rust, 0.09, [-1 + i * 1.1, -0.4 + i * 1.1], [-0.6, 0.2], { off: 0.015 });
    k.box(rust, [0.2, 0.17, 1.3], [2.15, 0, 0], { rot: [0, 0.4, 0] });
  });
  k.ico(PAL.sand, 1.4, [1.0, 0.1, 3.3], { detail: 1, scale: [1.6, 0.45, 1.3], jitter: 0.15, seed: 8404 });
  for (let i = 0; i < 6; i++) k.box(i % 2 ? cream : rust, [0.2 + r() * 0.5, 0.04, 0.15 + r() * 0.4], [-3 + r() * 6, 0.03, -3.5 + r() * 2.5], { rot: [0, r() * 3, 0] });
  const g = root('plane_wreck', 0, { w: 1, h: 1, l: 1 });
  g.add(k.mesh('body'));
  return recentre(g);
}
void walls; void wr; void fitText;
