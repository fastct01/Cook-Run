// ─────────────────────────────────────────────────────────────────────────────
// Props / obstacles (Agent ART). Sizes follow rules.json `obstacles[kind].radius`.
// Origin = ground centre, front = +Z. Flat decals (pothole, oil_slick, sanddrift,
// spikes) sit a hair above y=0 so they never z-fight the road (road is y=0).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Kit, root, rng, empty } from './kit.js';
import { PAL, mix, shade, glossy } from '../palette.js';

// ── cone ─────────────────────────────────────────────────────────────────────
export function buildCone(variant = 0) {
  const g = root('cone', variant, { w: 0.5, h: 0.75, l: 0.5 });
  const k = new Kit(1); k.floor = 0;
  k.box('#2a2a2b', [0.5, 0.05, 0.5], [0, 0, 0], { base: true, c: 0.03 });
  k.lathe(PAL.orange, [[0.19, 0.05], [0.04, 0.74], [0.0, 0.75]], 8, [0, 0, 0]);
  // reflective bands (slightly larger lathe rings)
  k.lathe('#e8e6dc', [[0.152, 0.3], [0.118, 0.42]], 8, [0, 0, 0], { scale: [1.04, 1, 1.04] });
  k.lathe('#e8e6dc', [[0.098, 0.5], [0.072, 0.58]], 8, [0, 0, 0], { scale: [1.06, 1, 1.06] });
  k.lathe(mix(PAL.orange, PAL.dirt, 0.4), [[0.19, 0.05], [0.175, 0.1]], 8, [0, 0, 0], { scale: [1.03, 1, 1.03] });
  g.add(k.mesh('body'));
  return g;
}

// ── trashcan (city wheelie bin / metal can) ───────────────────────────────────
export function buildTrashcan(variant = 0) {
  const g = root('trashcan', variant, { w: 0.7, h: 1.1, l: 0.75 });
  const k = new Kit(2 + variant); k.floor = 0;
  const cols = ['#4f6b55', '#3e4a5a', '#5a5d60'];
  const c = cols[variant % 3];
  // tapered bin
  k.box(c, [0.6, 0.95, 0.66], [0, 0.04, 0], { base: true, c: 0.04, taper: [1.1, 1.08] });
  k.box(shade(c, 0.85), [0.7, 0.08, 0.76], [0, 0.99, -0.01], { base: true, c: 0.03 });
  k.box(shade(c, 0.7), [0.7, 0.05, 0.08], [0, 0.96, -0.38]);
  k.box('#2a2a2b', [0.4, 0.04, 0.04], [0, 1.0, -0.42]);
  // wheels + front ribs + a sticker
  for (const s of [1, -1]) k.cyl('#222', 0.08, 0.08, 0.06, [s * 0.3, 0.08, -0.3], { axis: 'x', seg: 6 });
  for (const x of [-0.18, 0, 0.18]) k.box(shade(c, 0.8), [0.04, 0.7, 0.02], [x, 0.5, 0.345], { rot: [-0.04, 0, 0] });
  k.box('#d9d1bd', [0.18, 0.12, 0.01], [0.12, 0.72, 0.352], { rot: [-0.04, 0, 0] });
  // overflowing bag
  k.ico('#2c2c2e', 0.2, [0.05, 1.08, 0.08], { scale: [1.2, 0.6, 1], jitter: 0.15, seed: 4 });
  g.add(k.mesh('body'));
  return g;
}

// ── mailbox (smashable kerbside, US-style on a post) ─────────────────────────
export function buildMailbox(variant = 0, deco = false) {
  const g = root(deco ? 'mailbox_deco' : 'mailbox', variant, { w: 0.4, h: 1.35, l: 0.6 });
  const k = new Kit(3 + variant); k.floor = 0;
  const cols = ['#3e5a7a', '#b85c3a', '#5a6a4a', '#d6d0c0', '#2a2c30'];
  const c = cols[variant % cols.length];
  k.box(PAL.woodDark, [0.1, 1.05, 0.1], [0, 0, 0], { base: true });
  k.box(PAL.woodDark, [0.12, 0.06, 0.5], [0, 1.0, 0], { base: true });
  // box body with a rounded (lathed half) top
  k.box(c, [0.28, 0.2, 0.52], [0, 1.06, 0], { base: true, c: 0.015 });
  k.cyl(c, 0.14, 0.14, 0.52, [0, 1.26, 0], { axis: 'z', seg: 8, thetaStart: 0, open: false });
  k.box(shade(c, 0.8), [0.29, 0.29, 0.02], [0, 1.2, 0.26]);
  // flag (up)
  k.box('#c43a2e', [0.02, 0.22, 0.03], [0.155, 1.3, -0.1]);
  k.box('#c43a2e', [0.02, 0.08, 0.12], [0.155, 1.38, -0.05]);
  k.box('#d9d1bd', [0.005, 0.06, 0.2], [0.141, 1.16, 0.02]);
  g.add(k.mesh('body'));
  return g;
}

// ── hydrant ──────────────────────────────────────────────────────────────────
export function buildHydrant(variant = 0) {
  const g = root('hydrant', variant, { w: 0.5, h: 0.85, l: 0.45 });
  const k = new Kit(4); k.floor = 0;
  const c = variant % 2 ? '#d6b03a' : '#b8392e';
  k.cyl(shade(c, 0.85), 0.2, 0.22, 0.08, [0, 0, 0], { base: true, seg: 8 });
  k.cyl(c, 0.15, 0.16, 0.56, [0, 0.08, 0], { base: true, seg: 8 });
  k.cyl(shade(c, 0.9), 0.18, 0.18, 0.06, [0, 0.62, 0], { base: true, seg: 8 });
  k.lathe(c, [[0.16, 0.68], [0.14, 0.76], [0.07, 0.82], [0.0, 0.83]], 8, [0, 0, 0]);
  k.cyl('#c9c6bb', 0.03, 0.03, 0.06, [0, 0.83, 0], { seg: 5, base: true });
  for (const s of [1, -1]) k.cyl(shade(c, 0.95), 0.06, 0.06, 0.12, [s * 0.18, 0.45, 0], { axis: 'x', seg: 6 });
  k.cyl(shade(c, 0.95), 0.08, 0.08, 0.12, [0, 0.42, 0.17], { axis: 'z', seg: 6 });
  k.cyl('#c9c6bb', 0.04, 0.04, 0.02, [0, 0.42, 0.24], { axis: 'z', seg: 6 });
  k.lathe(mix(c, PAL.rust, 0.6), [[0.162, 0.1], [0.152, 0.24]], 8, [0, 0, 0], { scale: [1.02, 1, 1.02] });
  g.add(k.mesh('body'));
  return g;
}

// ── barrier (orange/white striped construction barrier ~2.6 m) ──────────────
export function buildBarrier(variant = 0) {
  const g = root('barrier', variant, { w: 2.6, h: 1.2, l: 0.7 });
  const k = new Kit(5); k.floor = 0;
  const W = 2.6;
  // two A-frame legs
  for (const s of [1, -1]) {
    for (const t of [1, -1]) k.box('#d8d4c8', [0.06, 1.18, 0.06], [s * 1.1, 0.58, t * 0.17], { rot: [t * -0.26, 0, 0] });
    k.box('#2a2a2b', [0.14, 0.08, 0.7], [s * 1.1, 0.04, 0], { noBottom: true });
  }
  // two striped boards
  for (const y of [0.62, 0.98]) {
    k.box('#e8e4d8', [W, 0.2, 0.05], [0, y, 0.0]);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const x0 = -W / 2 + (i / n) * W, x1 = x0 + W / n / 2;
      for (const sz of [1, -1]) {
        const z = sz * 0.026;
        k.poly(PAL.orange, [[x0, y - 0.1, z], [x1, y - 0.1, z], [x1 + 0.18, y + 0.1, z], [x0 + 0.18, y + 0.1, z]].map(([a, b, c]) => [Math.min(W / 2, a), b, c]), { facing: [0, 0, sz], off: 0.003 });
      }
    }
  }
  // amber lamp on top
  k.box('#2a2a2b', [0.1, 0.1, 0.06], [1.0, 1.13, 0]);
  k.cyl(PAL.amber, 0.08, 0.08, 0.05, [1.0, 1.2, 0.0], { axis: 'z', seg: 6 });
  // mud on the boards
  k.rectZ(mix(PAL.orange, PAL.dirt, 0.6), 0.03, [-1.2, -0.6], [0.52, 0.58], 1);
  g.add(k.mesh('body'));
  return g;
}

// ── lawn sprinkler (smashable; geyser fx) ─────────────────────────────────────
export function buildSprinkler(variant = 0) {
  const g = root('sprinkler', variant, { w: 0.5, h: 0.4, l: 0.5 });
  const k = new Kit(6); k.floor = 0;
  k.blob('#6e8c4a', 0.32, [0, 0.01, 0], { seg: 9, seed: 6 });
  k.cyl('#2f5a3a', 0.12, 0.15, 0.1, [0, 0, 0], { base: true, seg: 8 });
  k.cyl('#a9a79e', 0.025, 0.025, 0.22, [0, 0.1, 0], { base: true, seg: 6 });
  k.box('#c9c6bb', [0.32, 0.04, 0.04], [0, 0.33, 0]);
  for (const s of [1, -1]) k.box('#c9c6bb', [0.04, 0.06, 0.04], [s * 0.16, 0.36, 0]);
  // green hose
  k.cyl('#3f7a3f', 0.025, 0.025, 0.5, [0.0, 0.03, -0.3], { axis: 'z', seg: 5 });
  g.add(k.mesh('body'));
  return g;
}

// ── round hay bale ───────────────────────────────────────────────────────────
export function buildHay(variant = 0) {
  const g = root('hay', variant, { w: 1.5, h: 1.5, l: 1.6 });
  const k = new Kit(7); k.floor = 0;
  const r = 0.75, w = 1.5;
  // lying on its side, axis along X
  k.cyl(PAL.hay, r, r, w, [0, r, 0], { axis: 'x', seg: 12 });
  // spiral face rings (flat discs painted on the end caps)
  const disc = (rad, n, x, s, c) => k.flat(c, Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * rad, Math.sin((i / n) * Math.PI * 2) * rad]), (u, v) => [x, r + v, u], { facing: [s, 0, 0], off: 0.006 });
  for (const s of [1, -1]) {
    disc(r * 0.7, 10, s * w / 2, s, PAL.hayDark);
    disc(r * 0.45, 8, s * (w / 2 + 0.006), s, PAL.hay);
    disc(r * 0.18, 6, s * (w / 2 + 0.012), s, PAL.hayDark);
  }
  // net wrap bands
  for (const x of [-0.45, 0.45]) k.cyl('#c9b896', r + 0.01, r + 0.01, 0.05, [x, r, 0], { axis: 'x', seg: 12, open: true });
  // loose straw on the ground
  k.blob(PAL.hayDark, 0.95, [0, 0.015, 0], { seg: 10, seed: 7, sx: 1.1 });
  g.add(k.mesh('body'));
  return g;
}

// ── tumbleweed (wiry ball from twisted tori) ─────────────────────────────────
export function buildTumbleweed(variant = 0) {
  const g = root('tumbleweed', variant, { w: 1.4, h: 1.4, l: 1.4 });
  const k = new Kit(8 + variant); k.floor = 0;
  const r = rng(80 + variant);
  const R = 0.62;
  const ball = new Kit(9);
  for (let i = 0; i < 5; i++) {
    const c = i % 2 ? '#a88a5a' : '#8e7248';
    ball.torus(c, R * (0.75 + r() * 0.3), 0.025, [0, 0, 0], { rot: [r() * Math.PI, r() * Math.PI, r() * Math.PI], rs: 3, ts: 7 });
  }
  ball.ico('#7a6040', R * 0.35, [0, 0, 0], { jitter: 0.3, seed: 9 });
  ball.torus('#b29462', R * 0.5, 0.02, [0, 0, 0], { rot: [0.4, 1.2, 0.2], rs: 3, ts: 7 });
  // the rolling part is its own child so the renderer can spin it: `ball`
  const mesh = ball.mesh('ball_mesh');
  const pivot = new THREE.Object3D();
  pivot.name = 'ball';
  pivot.position.set(0, R + 0.06, 0);
  pivot.add(mesh);
  g.add(pivot);
  return g;
}

// ── pothole (flat decal) ──────────────────────────────────────────────────────
export function buildPothole(variant = 0) {
  const g = root('pothole', variant, { w: 2.0, h: 0.04, l: 1.8 });
  const k = new Kit(10 + variant); k.floor = 0;
  k.blob('#5d5e60', 1.0, [0, 0.02, 0], { seg: 11, seed: 10 + variant, wobble: 0.3, sx: 1.0, sz: 0.85, off: 0 });
  k.blob('#2b2b2d', 0.8, [0, 0.026, 0], { seg: 10, seed: 12 + variant, wobble: 0.35, sz: 0.8, off: 0 });
  k.blob('#1d1d1f', 0.5, [0.05, 0.03, 0], { seg: 8, seed: 14 + variant, wobble: 0.4, sz: 0.7, off: 0 });
  // broken asphalt chunks around the rim
  const r = rng(15 + variant);
  for (let i = 0; i < 5; i++) {
    const a = r() * Math.PI * 2, d = 0.85 + r() * 0.2;
    k.box('#4a4b4e', [0.16 + r() * 0.1, 0.05, 0.12 + r() * 0.1], [Math.cos(a) * d, 0.025, Math.sin(a) * d * 0.85], { rot: [0, r() * 3, 0] });
  }
  // puddle sheen
  k.blob('#3c4a55', 0.24, [-0.12, 0.034, 0.06], { seg: 7, seed: 16, off: 0 });
  g.add(k.mesh('body', undefined, false));
  return g;
}

// ── sand drift (low flat mound, 6 m) ─────────────────────────────────────────
export function buildSandDrift(variant = 0) {
  const g = root('sanddrift', variant, { w: 6.2, h: 0.35, l: 3.6 });
  const k = new Kit(11); k.floor = 0;
  // a flattened jittered ico + decals
  k.ico(PAL.sand, 1, [0, 0, 0], { detail: 1, jitter: 0.18, seed: 11 + variant, scale: [3.0, 0.34, 1.7], flatBottom: 0, jit: 0.08 });
  k.blob(PAL.sandLight, 2.9, [0, 0.015, 0], { seg: 14, seed: 12 + variant, sz: 0.62, off: 0 });
  // ripple lines on top
  for (let i = -2; i <= 2; i++) k.box(PAL.sandDark, [2.4 - Math.abs(i) * 0.4, 0.02, 0.05], [i * 0.15, 0.31 - Math.abs(i) * 0.04, i * 0.38], { rot: [0, 0.15, 0] });
  g.add(k.mesh('body', undefined, false));
  return g;
}

// ── rocks (faceted boulders, 3 variants each) ─────────────────────────────────
function boulder(k, r, seed, color, sc = [1, 0.75, 1]) {
  k.ico(color, r, [0, r * sc[1] * 0.75, 0], { detail: 0, jitter: 0.22, seed, scale: sc, flatBottom: -r * 0.75, jit: 0.12, floor: 0 });
}
export function buildRockSmall(variant = 0) {
  const g = root('rock_small', variant, { w: 1.6, h: 0.9, l: 1.5 });
  const k = new Kit(12 + variant); k.floor = 0;
  const cols = [PAL.rock, PAL.rockGrey, PAL.rockRed];
  boulder(k, 0.75, 20 + variant * 7, cols[variant % 3], [1.0, 0.7 + variant * 0.06, 0.92]);
  k.ico(shade(cols[variant % 3], 0.9), 0.22, [0.6, 0.12, 0.35], { jitter: 0.2, seed: 21 + variant, floor: 0 });
  g.add(k.mesh('body'));
  return g;
}
export function buildRock(variant = 0) {
  const g = root('rock', variant, { w: 3.0, h: 1.9, l: 2.8 });
  const k = new Kit(13 + variant); k.floor = 0;
  const cols = [PAL.rock, PAL.rockRed, PAL.rockGrey];
  const c = cols[variant % 3];
  boulder(k, 1.4, 30 + variant * 5, c, [1.05, 0.8, 0.95]);
  k.ico(shade(c, 0.88), 0.7, [0.9, 0.35, -0.6], { jitter: 0.25, seed: 33 + variant, scale: [1, 0.7, 1], flatBottom: -0.5, floor: 0 });
  k.ico(shade(c, 1.08), 0.35, [-1.2, 0.15, 0.7], { jitter: 0.2, seed: 35 + variant, floor: 0 });
  // a sun-bleached top plane + dark crack
  k.ico(mix(c, '#e8d8b8', 0.25), 0.6, [-0.1, 1.55, 0.1], { scale: [1.3, 0.25, 1.1], seed: 36, jitter: 0.1 });
  g.add(k.mesh('body'));
  return g;
}
export function buildFallingRock(variant = 0) {
  const g = root('falling_rock', variant, { w: 3.2, h: 2.6, l: 3.0 });
  const k = new Kit(14); k.floor = 0;
  const c = PAL.rockRed;
  // a chunky, angular slab with fresh broken (lighter) faces
  k.ico(c, 1.5, [0, 1.3, 0], { detail: 0, jitter: 0.3, seed: 41 + variant, scale: [1.05, 0.85, 1.0], jit: 0.15 });
  k.ico(mix(c, '#e0a676', 0.5), 0.8, [0.6, 1.9, 0.5], { jitter: 0.25, seed: 43, scale: [1, 0.6, 1] });
  // dust ring under it
  k.blob('#c9a27a', 1.8, [0, 0.02, 0], { seg: 10, seed: 44, off: 0 });
  // the tumbling part is the whole mesh; pivot centred so renderer can spin it
  const mesh = k.mesh('rock_mesh');
  const p = new THREE.Object3D(); p.name = 'chunk';
  p.add(mesh);
  g.add(p);
  return g;
}

// ── small roadside cactus (smashable) ─────────────────────────────────────────
export function buildCactusRoad(variant = 0) {
  const g = root('cactus_road', variant, { w: 1.0, h: 1.4, l: 0.6 });
  const k = new Kit(15); k.floor = 0;
  const c = PAL.cactus;
  k.cyl(c, 0.16, 0.2, 1.3, [0, 0, 0], { base: true, seg: 7 });
  k.cone(c, 0.16, 0.1, [0, 1.35, 0], { seg: 7 });
  k.cyl(c, 0.1, 0.11, 0.35, [0.25, 0.55, 0], { axis: 'x', seg: 6 });
  k.cyl(c, 0.09, 0.11, 0.38, [0.36, 0.78, 0], { base: true, seg: 6 });
  k.cyl(c, 0.08, 0.1, 0.25, [-0.22, 0.75, 0], { axis: 'x', seg: 6 });
  k.cyl(c, 0.08, 0.09, 0.26, [-0.32, 0.92, 0], { base: true, seg: 6 });
  // ribs
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; k.box(PAL.cactusDark, [0.03, 1.2, 0.03], [Math.cos(a) * 0.18, 0.62, Math.sin(a) * 0.18]); }
  k.box('#e8b8c8', [0.08, 0.06, 0.08], [0, 1.43, 0], { c: 0.02 });
  k.blob(PAL.sandDark, 0.5, [0, 0.015, 0], { seg: 8, seed: 15, off: 0 });
  g.add(k.mesh('body'));
  return g;
}

// ── spike strip (~4 m across the road, along X) ──────────────────────────────
export function buildSpikes(variant = 0) {
  const g = root('spikes', variant, { w: 4.2, h: 0.12, l: 0.4 });
  const k = new Kit(16); k.floor = 0;
  const W = 4.0, n = 8;
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + (i + 0.5) * (W / n);
    // accordion links
    k.box('#2a2a2c', [W / n - 0.03, 0.04, 0.24], [x, 0.03, 0], { rot: [0, (i % 2 ? 1 : -1) * 0.25, 0], noBottom: true });
    for (const dz of [-0.07, 0.07]) k.cyl('#c9c6bb', 0, 0.028, 0.09, [x + dz * 0.6, 0.095, dz], { seg: 4, open: true });
  }
  for (const s of [1, -1]) k.box('#e0a22a', [0.12, 0.06, 0.3], [s * (W / 2 + 0.06), 0.03, 0], { c: 0.01 });
  g.add(k.mesh('body', undefined, false));
  return g;
}

// ── smoke cloud (6–8 grey puffs) ─────────────────────────────────────────────
export function buildSmokeCloud(variant = 0) {
  const g = root('smoke_cloud', variant, { w: 9, h: 5, l: 9 });
  const r = rng(17 + variant);
  // per-instance opacity is expected: the renderer should clone this material
  const mat = new THREE.MeshLambertMaterial({ color: '#b9b6ae', transparent: true, opacity: 0.85, flatShading: true, depthWrite: false, name: 'CR_Smoke' });
  const n = 8;
  for (let i = 0; i < n; i++) {
    const k = new Kit(170 + i);
    const s = 1.2 + r() * 1.3;
    const shadeC = i % 3 === 0 ? '#9d9a93' : i % 3 === 1 ? '#c9c6be' : '#b3b0a8';
    k.ico(shadeC, 1, [0, 0, 0], { detail: 1, jitter: 0.12, seed: 170 + i });
    const m = new THREE.Mesh(k.geometry(), mat);
    m.material = mat;
    m.name = `puff_${i}`;
    const a = (i / n) * Math.PI * 2 + r() * 0.5, d = i === 0 ? 0 : 1.5 + r() * 2.5;
    m.position.set(Math.cos(a) * d, s * 0.8 + r() * 1.2, Math.sin(a) * d);
    m.scale.setScalar(s);
    m.castShadow = false;
    g.add(m);
  }
  // vertex colours are baked into the geometry; enable them on the material
  mat.vertexColors = true;
  mat.color.set('#ffffff');
  g.userData.perInstanceMaterials = ['puff_*'];
  return g;
}

// ── oil slick (glossy black decal) ───────────────────────────────────────────
export function buildOilSlick(variant = 0) {
  const g = root('oil_slick', variant, { w: 7.5, h: 0.04, l: 7.5 });
  const k = new Kit(18); k.floor = 0;
  k.blob('#0f1012', 3.4, [0, 0.02, 0], { seg: 16, seed: 18 + variant, wobble: 0.45, off: 0 });
  k.blob('#16181c', 1.2, [2.6, 0.022, 1.4], { seg: 9, seed: 19, off: 0 });
  k.blob('#16181c', 0.9, [-2.4, 0.022, -1.8], { seg: 9, seed: 20, off: 0 });
  // iridescent sheen streaks
  k.blob('#2a2f45', 1.1, [-0.6, 0.026, 0.4], { seg: 9, seed: 21, sx: 1.4, sz: 0.5, off: 0 });
  k.blob('#3a2f45', 0.6, [0.9, 0.028, -0.7], { seg: 8, seed: 22, sx: 1.3, sz: 0.45, off: 0 });
  k.blob('#24393a', 0.5, [0.2, 0.03, 1.2], { seg: 8, seed: 23, sx: 1.2, sz: 0.5, off: 0 });
  const mesh = k.mesh('body', glossy(), false);
  g.add(mesh);
  return g;
}

// ── railroad crossing gate ───────────────────────────────────────────────────
// Post on the root origin; the arm extends along local −X from its pivot.
// arm.rotation.z:  0 = DOWN / closed (horizontal),  −1.45 = UP / raised (near vertical).
// i.e. lowering = rotation.z going from −1.45 → 0 (positive direction).
// Default pose is DOWN (state 1 look) so the showroom/thumbnails read clearly.
export function buildCrossingGate(variant = 0) {
  const g = root('crossing_gate', variant, { w: 8.0, h: 4.6, l: 0.8 });
  const k = new Kit(19); k.floor = 0;
  // post + base + crossbuck sign + bell
  k.box(PAL.concrete, [0.7, 0.3, 0.7], [0, 0, 0], { base: true, c: 0.06, cv: true });
  k.cyl('#d8d4c8', 0.08, 0.09, 4.0, [0, 0.3, 0], { base: true, seg: 8 });
  for (const s of [1, -1]) {
    k.box('#efece4', [1.3, 0.2, 0.04], [0, 3.85, 0.1], { rot: [0, 0, s * 0.62] });
    k.box('#2a2a2b', [1.3, 0.04, 0.045], [0, 3.85, 0.1], { rot: [0, 0, s * 0.62] });
  }
  k.cyl('#2a2a2b', 0.14, 0.18, 0.18, [0, 4.25, 0.0], { seg: 8 });
  // lamp head: crossbar with two black hoods (lamps are separate meshes)
  k.box('#2a2a2b', [1.2, 0.1, 0.1], [0, 3.05, 0.06]);
  for (const s of [1, -1]) {
    k.cyl('#1d1d1e', 0.2, 0.2, 0.08, [s * 0.45, 3.05, 0.1], { axis: 'z', seg: 10 });
    k.box('#1d1d1e', [0.4, 0.06, 0.18], [s * 0.45, 3.27, 0.17], { rot: [0.3, 0, 0] });
  }
  // mechanism housing
  k.box('#5a5d60', [0.4, 0.5, 0.5], [0, 1.0, -0.3]);
  g.add(k.mesh('body'));
  for (const [name, s] of [['lamp_l', 1], ['lamp_r', -1]]) {
    const mat = new THREE.MeshLambertMaterial({ color: '#5c1a17', emissive: '#ff3a2e', emissiveIntensity: 0, name: 'CR_Lamp_Crossing', flatShading: true });
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 10), mat);
    lamp.rotation.x = Math.PI / 2;
    lamp.name = name;
    lamp.position.set(s * 0.45, 3.05, 0.15);
    g.add(lamp);
  }
  // arm: pivot at the post; red/white stripes; counterweight on the short side
  const ka = new Kit(20);
  const L = 7.4;
  ka.box('#efece4', [L, 0.14, 0.08], [-L / 2 - 0.2, 0, 0]);
  const n = 9;
  for (let i = 0; i < n; i++) if (i % 2 === 0) {
    const x0 = -0.2 - (i / n) * L, x1 = -0.2 - ((i + 1) / n) * L;
    for (const s of [1, -1]) ka.rectZ('#c4372b', s * 0.04, [x1, x0], [-0.07, 0.07], s, { off: 0.004 });
    ka.rectY('#c4372b', 0.07, [x1, x0], [-0.04, 0.04], { off: 0.004 });
  }
  ka.box('#5a5d60', [0.7, 0.3, 0.2], [0.45, 0, 0]);
  ka.box('#2a2a2b', [0.12, 0.12, 0.3], [0, 0, 0]);
  for (const x of [-2.6, -5.0, -7.2]) ka.box('#c4372b', [0.08, 0.08, 0.1], [x, 0.11, 0]);
  const arm = new THREE.Object3D();
  arm.name = 'arm';
  arm.position.set(0, 1.0, 0.12);
  arm.rotation.z = 0; // default DOWN (closed). Raise with rotation.z = -1.45.
  arm.add(ka.mesh('arm_mesh'));
  g.add(arm);
  g.userData.arm = { axis: 'z', down: 0, up: -1.45, note: 'arm extends along local -X; rotation.z = 0 down, -1.45 up' };
  g.userData.perInstanceMaterials = ['lamp_l', 'lamp_r'];
  return g;
}

// ── roadblock (sawhorse barricades with amber lamps, ~7 m wide) ──────────────
export function buildRoadblock(variant = 0) {
  const g = root('roadblock', variant, { w: 7.2, h: 1.4, l: 1.4 });
  const k = new Kit(21); k.floor = 0;
  const xs = [-2.6, 0, 2.6];
  xs.forEach((x, i) => {
    const dz = i === 1 ? 0.3 : -0.1;
    const rot = i === 0 ? 0.06 : i === 2 ? -0.08 : 0;
    k.at([x, 0, dz], [0, rot, 0], () => {
      for (const s of [1, -1]) for (const t of [1, -1]) k.box('#d8d4c8', [0.07, 1.05, 0.07], [s * 1.0, 0.5, t * 0.14], { rot: [t * -0.28, 0, 0] });
      k.box('#efece4', [2.3, 0.26, 0.06], [0, 0.95, 0], { c: 0.01 });
      for (let j = 0; j < 5; j++) {
        const x0 = -1.15 + j * 0.46;
        for (const sz of [1, -1]) k.poly('#c4372b', [[x0, 0.82, sz * 0.031], [x0 + 0.23, 0.82, sz * 0.031], [x0 + 0.38, 1.08, sz * 0.031], [x0 + 0.15, 1.08, sz * 0.031]].map(([a, b, c]) => [Math.min(1.15, a), b, c]), { facing: [0, 0, sz], off: 0.004 });
      }
      k.box('#2a2a2b', [0.12, 0.12, 0.08], [0.9, 1.14, 0]);
      k.cyl(PAL.amber, 0.1, 0.1, 0.06, [0.9, 1.22, 0.0], { axis: 'z', seg: 8 });
      k.box('#efece4', [1.4, 0.04, 0.02], [0, 0.55, 0.0]);
    });
  });
  // POLICE text block colour stripes (no text needed at range)
  k.box('#1f2a44', [0.9, 0.12, 0.02], [0, 0.6, 0.34]);
  // a few cones
  for (const [x, z] of [[-3.8, 0.4], [3.8, 0.3], [1.3, 0.7]]) {
    k.lathe(PAL.orange, [[0.17, 0.0], [0.04, 0.6], [0.0, 0.61]], 7, [x, 0, z]);
    k.lathe('#e8e6dc', [[0.12, 0.24], [0.1, 0.34]], 7, [x, 0, z], { scale: [1.06, 1, 1.06] });
  }
  g.add(k.mesh('body'));
  // amber lamp meshes for blinking (shared material — clone per instance to blink independently)
  const lampMat = new THREE.MeshLambertMaterial({ color: '#6a4410', emissive: '#ffb02e', emissiveIntensity: 0.6, name: 'CR_Lamp_Amber', flatShading: true });
  xs.forEach((x, i) => {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 4), lampMat);
    lamp.name = `lamp_${i}`;
    const dz = i === 1 ? 0.3 : -0.1;
    lamp.position.set(x + 0.9, 1.22, dz + 0.04);
    g.add(lamp);
  });
  g.userData.perInstanceMaterials = ['lamp_0', 'lamp_1', 'lamp_2'];
  return g;
}

export const PROP_BUILDERS = {
  cone: { build: buildCone, variants: 1 },
  trashcan: { build: buildTrashcan, variants: 3 },
  mailbox: { build: (v) => buildMailbox(v), variants: 5 },
  hydrant: { build: buildHydrant, variants: 2 },
  barrier: { build: buildBarrier, variants: 1 },
  sprinkler: { build: buildSprinkler, variants: 1 },
  hay: { build: buildHay, variants: 1 },
  tumbleweed: { build: buildTumbleweed, variants: 3 },
  pothole: { build: buildPothole, variants: 3 },
  sanddrift: { build: buildSandDrift, variants: 2 },
  rock_small: { build: buildRockSmall, variants: 3 },
  rock: { build: buildRock, variants: 3 },
  cactus_road: { build: buildCactusRoad, variants: 1 },
  spikes: { build: buildSpikes, variants: 1 },
  falling_rock: { build: buildFallingRock, variants: 2 },
  smoke_cloud: { build: buildSmokeCloud, variants: 1 },
  oil_slick: { build: buildOilSlick, variants: 1 },
  crossing_gate: { build: buildCrossingGate, variants: 1 },
  roadblock: { build: buildRoadblock, variants: 1 },
};
