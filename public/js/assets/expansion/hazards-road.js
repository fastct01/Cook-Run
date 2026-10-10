// ─────────────────────────────────────────────────────────────────────────────
// Hazards pack — road hazards (art agent "hazards").
// Metres, Y up, origin = ground centre, front = +Z, model's right = −X.
// The RV drives toward +Z, so warning faces that must be read by the driver face −Z.
// Flat decals sit at y ≈ 0.01–0.03 (the road is y = 0). Budget: ≤ 600 tris each.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Kit, root, rng, lerp, offsetPoly, signTexture, fitText } from '../models/kit.js';
import { PAL, mix, shade, glossy } from '../palette.js';
import {
  pivot, kmesh, steamMaterial, jetMaterial, dustMaterial, foamMaterial, glowMaterial, glowVcol, lampMat, unlitVcol,
  puffGeometry, mergeTransformed, rod, beam, ring,
} from './hazards-util.js';

const ASPH = '#3d3e42', GRAVEL = '#77716a', SOIL = '#6b5541', SOIL_D = '#3b2f25';
const IRON = '#45413c', IRON_L = '#5e5952', IRON_RUST = '#6e4a33';
const ORANGE = PAL.orange, STRIPE_W = '#e8e4d8';
const NOFLOOR = { floor: -0.045 };

// ── shared bits ──────────────────────────────────────────────────────────────
/** Branching hairline cracks radiating from (cx, cz). */
function cracks(k, rr, cx, cz, n, r0, r1, y = 0.017, color = '#222326') {
  for (let i = 0; i < n; i++) {
    let ang = (i / n) * Math.PI * 2 + rr() * 0.7;
    let x = cx + Math.cos(ang) * r0, z = cz + Math.sin(ang) * r0;
    let w = 0.05 + rr() * 0.02;
    const steps = 2 + (rr() < 0.4 ? 1 : 0);
    for (let s = 0; s < steps; s++) {
      const len = ((r1 - r0) / steps) * (0.7 + rr() * 0.6);
      ang += (rr() - 0.5) * 0.9;
      const nx = x + Math.cos(ang) * len, nz = z + Math.sin(ang) * len;
      const w2 = w * 0.55;
      const px = -Math.sin(ang) * w / 2, pz = Math.cos(ang) * w / 2, qx = -Math.sin(ang) * w2 / 2, qz = Math.cos(ang) * w2 / 2;
      k.poly(color, [[x - px, y, z - pz], [nx - qx, y, nz - qz], [nx + qx, y, nz + qz], [x + px, y, z + pz]], { facing: [0, 1, 0] });
      x = nx; z = nz; w = w2;
    }
  }
}
/** Loose broken-asphalt chunks scattered around (cx, cz). */
function chunks(k, rr, cx, cz, n, rad, color = ASPH, spread = 0.4) {
  for (let i = 0; i < n; i++) {
    const a = rr() * Math.PI * 2, d = rad * (0.85 + rr() * spread);
    k.box(i % 3 ? color : shade(color, 1.18), [0.16 + rr() * 0.2, 0.06, 0.12 + rr() * 0.14], [cx + Math.cos(a) * d, 0.03, cz + Math.sin(a) * d],
      { rot: [(rr() - 0.5) * 0.5, rr() * 3, (rr() - 0.5) * 0.5], noBottom: true });
  }
}
/** Round manhole shaft: iron frame ring, inward-facing shaft wall, black bottom (never below y = −0.05). */
function roundHole(k, x, z, r) {
  ring(k, IRON, r, r + 0.085, [x, 0.022, z], 10);
  k.cyl((cx, cy) => (cy > 0.0 ? '#2b2826' : '#141312'), r, r, 0.066, [x, -0.012, z], { seg: 10, open: true, scale: [-1, 1, 1], ...NOFLOOR });
  k.blob('#050506', r, [x, -0.044, z], { seg: 10, wobble: 0.0, off: 0, ...NOFLOOR });
}
/** A cast-iron manhole cover mesh standing on its edge: bottom edge at the local origin, patterned face toward −X. */
function coverKit(seed, r = 0.36, t = 0.065, flat = false) {
  const k = new Kit(seed);
  const body = () => {
    k.cyl((cx, cy, cz, nx, ny) => (Math.abs(ny) > 0.9 ? IRON : IRON_RUST), r, r, t, [0, 0, 0], { seg: 10 });
    ring(k, IRON_L, r * 0.66, r * 0.8, [0, t / 2 + 0.004, 0], 12);
    ring(k, IRON_L, r * 0.12, r * 0.24, [0, t / 2 + 0.004, 0], 6);
    k.box(IRON_L, [r * 1.3, 0.012, 0.035], [0, t / 2 + 0.004, 0], { noBottom: true });
    k.box(IRON_L, [0.035, 0.012, r * 1.3], [0, t / 2 + 0.004, 0], { noBottom: true });
    k.top(IRON_RUST, t / 2 + 0.003, [[-r * 0.5, r * 0.3], [-r * 0.2, r * 0.55], [-r * 0.05, r * 0.4], [-r * 0.3, r * 0.15]], { off: 0.002 });
  };
  if (flat) k.at([0, t / 2, 0], body);
  else k.at([0, r, 0], [0, 0, Math.PI / 2], body);
  return k;
}
/** Two-legged A-frame road barrier (orange/white board), length L along local X. */
function miniBarrier(k, L = 2.0, lamp = true) {
  for (const s of [1, -1]) {
    for (const t of [1, -1]) k.box('#d8d4c8', [0.05, 1.0, 0.05], [s * (L / 2 - 0.12), 0.49, t * 0.14], { rot: [t * -0.27, 0, 0] });
    k.box('#2a2a2b', [0.12, 0.07, 0.6], [s * (L / 2 - 0.12), 0.035, 0], { noBottom: true });
  }
  k.box(STRIPE_W, [L, 0.24, 0.05], [0, 0.86, 0]);
  const n = 4;
  for (let i = 0; i < n; i++) {
    const x0 = -L / 2 + (i / n) * L + 0.02, x1 = x0 + L / n / 2;
    for (const sz of [1, -1]) {
      k.poly(ORANGE, [[x0, 0.74, sz * 0.026], [x1, 0.74, sz * 0.026], [Math.min(L / 2, x1 + 0.2), 0.98, sz * 0.026], [Math.min(L / 2, x0 + 0.2), 0.98, sz * 0.026]], { facing: [0, 0, sz], off: 0.003 });
    }
  }
  if (lamp) {
    k.box('#2a2a2b', [0.09, 0.09, 0.06], [L / 2 - 0.2, 1.02, 0]);
    k.cyl(PAL.amber, 0.07, 0.07, 0.05, [L / 2 - 0.2, 1.09, 0], { axis: 'z', seg: 6 });
  }
}
/** Small traffic cone (≈ 40 tris). */
function cone(k, x, z, s = 1) {
  k.box('#2a2a2b', [0.42 * s, 0.04, 0.42 * s], [x, 0, z], { base: true, noBottom: true });
  k.lathe(ORANGE, [[0.16 * s, 0.04], [0.035 * s, 0.68 * s], [0, 0.69 * s]], 6, [x, 0, z]);
  k.lathe('#e8e6dc', [[0.125 * s, 0.24 * s], [0.095 * s, 0.36 * s]], 6, [x, 0, z], { scale: [1.07, 1, 1.07] });
}
/** Yellow/black hazard tape strip between a and b (double-sided), height h. */
function tape(k, a, b, y, n = 6, h = 0.07) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
  const nx = -dz / L, nz = dx / L;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const sag = (t) => -0.06 * 4 * t * (1 - t);
    const P = (t, yy) => [a[0] + dx * t, y + yy + sag(t), a[1] + dz * t];
    const c = i % 2 ? '#1f2022' : '#e2b93b';
    const q = [P(t0, -h / 2), P(t1, -h / 2), P(t1, h / 2), P(t0, h / 2)];
    k.poly(c, q, { facing: [nx, 0, nz] });
    k.poly(c, q, { facing: [-nx, 0, -nz] });
  }
}
/** Plume radius at phase t (0 = at the hole, 1 = top): widens fast, then thins as it dissipates. */
export function plumeRadius(t, r0 = 0.4, r1 = 1.75) { return t < 0.78 ? lerp(r0, r1, Math.pow(t / 0.78, 0.7)) : lerp(r1, r1 * 0.72, (t - 0.78) / 0.22); }
/** Puff plume: n pivots `puff_i` each holding `puff_i_mesh` (unit puff geometry scaled on the MESH, pivot scale = 1). */
function plume(g, o) {
  const { x, z, seed, n = 14, base = 0.46, top = 5.75, r0 = 0.4, r1 = 1.75, lean = [1.1, -0.25] } = o;
  const rr = rng(seed);
  const mat = steamMaterial();
  const info = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = plumeRadius(t, r0, r1);
    const y = base + (top - base) * Math.pow(t, 1.12);
    const wob = 0.42 * t + 0.05;
    const px = x + lean[0] * Math.pow(t, 1.6) + (i % 2 ? 1 : -1) * wob * (0.5 + rr() * 0.5);
    const pz = z + lean[1] * Math.pow(t, 1.6) + (rr() - 0.5) * wob * 2.2;
    const bottom = mix('#c4cbcf', '#dde2e4', Math.min(1, t * 1.4));
    const geo = puffGeometry(seed * 7 + i, { jitter: 0.07, bottom, top: '#ffffff' });
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(r, r * (0.88 + 0.08 * t), r);
    m.rotation.set(0, rr() * 6.28, 0);
    m.castShadow = false; m.receiveShadow = false; m.renderOrder = 3;
    g.add(pivot(`puff_${i}`, m, [px, y, pz]));
    info.push(+r.toFixed(3));
  }
  return info;
}
/** Static ground mist: flattened puffs merged into one mesh (same shared steam material). */
function mist(defs, seed) {
  const parts = defs.map(([x, y, z, sx, sy, sz], i) => ({ geo: puffGeometry(seed + i, { jitter: 0.06, bottom: '#cfd5d8', top: '#ffffff' }), matrix: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, i * 1.3, 0)), new THREE.Vector3(sx, sy, sz)) }));
  const m = new THREE.Mesh(mergeTransformed(parts, 0.01), steamMaterial());
  m.name = 'steam_mist'; m.castShadow = false; m.renderOrder = 2;
  return m;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. steam_leak — broken sewer/water main venting a 7 m column of white vapour.
//    v0: in the lane (round manhole, cover flipped and leaning).  v1: storm drain in the gutter at the kerb.
// ═════════════════════════════════════════════════════════════════════════════
export function buildSteamLeak(variant = 0) {
  const gutter = variant % 2 === 1;
  const g = root('steam_leak', variant, gutter ? { w: 4.4, h: 7.2, l: 4.4 } : { w: 4.4, h: 7.2, l: 4.2 });
  const k = new Kit(300 + variant); k.floor = 0;
  const rr = rng(310 + variant);
  const wet = new Kit(305 + variant); wet.floor = 0;   // glossy wet sheen (own mesh, shared glossy material)
  let hx = 0, hz = 0, coverPivot;
  if (!gutter) {
    k.blob('#38393d', 1.95, [0.1, 0.008, 0.05], { seg: 12, seed: 301, wobble: 0.35, sz: 0.9 });   // damp, cracked area
    k.blob(GRAVEL, 0.66, [hx, 0.015, hz], { seg: 10, seed: 303, wobble: 0.4 });                   // torn-up sub-base
    k.blob('#5b564f', 0.5, [hx, 0.018, hz], { seg: 9, seed: 304, wobble: 0.3 });
    cracks(k, rr, hx, hz, 6, 0.52, 1.9);
    chunks(k, rr, hx, hz, 3, 0.62);
    // a heaved slab the cover leans on (its −X edge is raised against the cover's back)
    k.at([-1.08, 0.16, 0.42], [0, Math.PI - 0.35, 0], () => k.box(shade(ASPH, 1.1), [0.45, 0.08, 0.55], [0, 0, 0], { rot: [0, 0, -0.9] }));
    roundHole(k, hx, hz, 0.36);
    // wet sheen puddle drifting down-camber (glossy)
    wet.blob('#25292e', 1.05, [0.75, 0.012, 0.7], { seg: 12, seed: 306, wobble: 0.45, sx: 1.3, sz: 0.9 });
    wet.blob('#4c5862', 0.55, [0.9, 0.016, 0.85], { seg: 8, seed: 307, wobble: 0.4, sx: 1.6, sz: 0.35 });
    wet.blob('#2b3035', 0.5, [0.25, 0.012, -0.85], { seg: 8, seed: 308, wobble: 0.4, sx: 1.2, sz: 0.7 });
    // cover: flipped and leaning against the heaved slab (+X side), patterned face toward the hole
    const ck = coverKit(309);
    coverPivot = pivot('cover', ck.mesh('m'), [-0.75, 0, 0.3], [0, Math.PI - 0.35, -0.42]);
  } else {
    // kerb (z −1.6..−1.4), sidewalk behind it, concrete gutter strip, storm drain grate opening at the kerb
    hz = -1.12;
    const KZ = -1.4;
    k.box('#a8a49a', [4.4, 0.15, 0.2], [0, 0, KZ - 0.1], { base: true, noBottom: true });
    k.box('#b9b5aa', [4.4, 0.15, 0.7], [0, 0, KZ - 0.55], { base: true, noBottom: true });
    for (const x of [-1.5, 0.0, 1.5]) k.rectY('#8e8a80', 0.151, [x - 0.015, x + 0.015], [KZ - 0.9, KZ - 0.2], { off: 0.001 });
    k.rectY('#8f8c84', 0.004, [-2.2, 2.2], [KZ, KZ + 0.42], { off: 0.002 });
    // kerb inlet: dark slot in the kerb face above the drain
    k.rectZ('#0c0c0d', KZ + 0.002, [-0.5, 0.5], [0.03, 0.12], 1, { off: 0.004 });
    // damp cracked road beside the drain
    k.blob('#38393d', 1.5, [0.2, 0.008, -0.2], { seg: 11, seed: 311, wobble: 0.35, sx: 1.25, sz: 0.75 });
    cracks(k, rr, hx, hz + 0.3, 5, 0.45, 1.6);
    chunks(k, rr, hx, hz + 0.25, 3, 0.65, ASPH, 0.3);
    // drain opening (rectangular shaft, inward walls, black bottom)
    const w = 0.5, d = 0.21;
    k.rectY(IRON, 0.02, [-w - 0.06, w + 0.06], [hz - d - 0.06, hz + d + 0.06], { off: 0.002 });
    k.rectY('#050506', -0.044, [-w, w], [hz - d, hz + d], { off: 0, ...NOFLOOR });
    k.rectZ('#1b1a19', hz - d, [-w, w], [-0.044, 0.024], 1, { off: 0, ...NOFLOOR });
    k.rectZ('#2a2826', hz + d, [-w, w], [-0.044, 0.024], -1, { off: 0, ...NOFLOOR });
    k.rectX('#222120', -w, [hz - d, hz + d], [-0.044, 0.024], 1, { off: 0, ...NOFLOOR });
    k.rectX('#222120', w, [hz - d, hz + d], [-0.044, 0.024], -1, { off: 0, ...NOFLOOR });
    // wet run-off along the gutter (glossy)
    wet.blob('#25292e', 1.0, [-1.0, 0.012, KZ + 0.3], { seg: 12, seed: 312, wobble: 0.3, sx: 1.9, sz: 0.32 });
    wet.blob('#4c5862', 0.5, [-1.4, 0.016, KZ + 0.28], { seg: 8, seed: 313, wobble: 0.3, sx: 2.2, sz: 0.18 });
    wet.blob('#2b3035', 0.7, [0.5, 0.012, hz + 0.55], { seg: 9, seed: 314, wobble: 0.4, sx: 1.3, sz: 0.7 });
    // cover: the lifted grate, leaning back against the kerb
    // grate local frame: lies flat from its bottom edge (z = 0) toward +Z. The pivot stands it up at 62°
    // against the kerb lip beside the drain (order YXZ: yaw π, then tilt).
    const gk = new Kit(315);
    for (const zz of [0.025, 0.445]) gk.box(IRON, [1.04, 0.045, 0.05], [0, 0.0225, zz]);
    for (const xx of [-0.495, 0.495]) gk.box(IRON, [0.05, 0.045, 0.42], [xx, 0.0225, 0.235]);
    for (let i = 0; i < 5; i++) gk.box(i % 2 ? IRON_L : IRON, [0.05, 0.04, 0.42], [-0.32 + i * 0.16, 0.02, 0.235]);
    gk.box(IRON_RUST, [0.3, 0.047, 0.052], [0.25, 0.0235, 0.445]);
    coverPivot = pivot('cover', gk.mesh('m'), [1.1, 0, KZ + 0.08], [-1.083, Math.PI, 0], 'YXZ');
  }
  g.add(k.mesh('body'));
  const wm = wet.mesh('puddle', glossy(), false);
  g.add(wm);
  g.add(coverPivot);
  // vapour: ground mist + the rising column
  const lean = gutter ? [0.7, 0.55] : [0.9, -0.2];
  g.add(mist(gutter
    ? [[hx + 0.9, 0.2, hz + 0.45, 1.0, 0.28, 0.7], [hx + 1.6, 0.14, hz + 0.75, 0.75, 0.2, 0.5]]
    : [[hx + 1.0, 0.2, hz - 0.15, 0.95, 0.3, 0.8], [hx + 1.7, 0.14, hz - 0.45, 0.7, 0.2, 0.6]], 330 + variant));
  const radii = plume(g, { x: hx, z: hz + (gutter ? 0.05 : 0), seed: 340 + variant, lean });
  g.userData.style = gutter ? 'gutter' : 'lane';
  g.userData.perInstanceMaterials = ['puff_*', 'steam_mist'];
  g.userData.plume = {
    count: 14, origin: [hx, 0, hz], baseY: 0.46, topY: 5.75, lean: [lean[0], 0, lean[1]], radii,
    note: 'puff_i sits at phase i/13 of a rise from baseY to topY (y = base + (top-base)*p^1.12, radius = plumeRadius(p): 0.4 → 1.75 at p 0.78 → 1.26 at the top). Animate p += dt*0.18, wrap to 0; scale the pivot from ~0.4 (p=0) to 1 (authored) to 1.25 (top); fade opacity in over p 0–0.1 and out over p 0.75–1.',
  };
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. water_main — burst main: heaved asphalt, exposed pipe, geyser `jet`, flooded lane
// ═════════════════════════════════════════════════════════════════════════════
export function buildWaterMain(variant = 0) {
  const g = root('water_main', variant, { w: 4.6, h: 6.4, l: 7.4 });
  const k = new Kit(320); k.floor = 0;
  const rr = rng(321);
  const wk = new Kit(322); wk.floor = 0;
  // flooded lane (glossy): water spreading down the lane, lighter ripples
  wk.blob('#3a454b', 2.3, [0.1, 0.01, 0.4], { seg: 16, seed: 323, wobble: 0.28, sx: 0.95, sz: 1.55 });
  wk.blob('#4a5961', 1.3, [0.5, 0.013, 1.9], { seg: 10, seed: 324, wobble: 0.35, sx: 1.1, sz: 1.4 });
  ring(wk, '#8ea2a9', 0.95, 1.03, [0, 0.017, 0], 12);
  ring(wk, '#7d9199', 1.55, 1.62, [0, 0.016, 0], 12, { a0: 0.3, a1: 4.2 });
  ring(wk, '#8ea2a9', 2.1, 2.16, [0.1, 0.015, 0.5], 10, { a0: 1.0, a1: 2.6 });
  wk.blob('#5b4c3b', 0.6, [-0.9, 0.012, -0.9], { seg: 8, seed: 325, sx: 1.4, sz: 0.6 });                          // muddy wash
  // crater + heaved slabs + exposed pipe
  k.blob('#191512', 0.62, [0, 0.02, 0], { seg: 10, seed: 326, wobble: 0.3 });
  k.blob(SOIL, 0.85, [0, 0.016, 0], { seg: 10, seed: 327, wobble: 0.35 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rr() * 0.4, d = 0.95 + rr() * 0.15, l = 0.62 + rr() * 0.2;
    // local X = radial (inner edge at −X lifted by the water pressure), local Z = tangent
    k.at([Math.cos(a) * d, 0.08, Math.sin(a) * d], [0, -a, 0], () => k.box(i % 2 ? ASPH : shade(ASPH, 1.12), [0.42, 0.08, l], [0, 0, 0], { rot: [0, 0, -0.35], noBottom: true }));
  }
  k.cyl((cx, cy, cz, nx) => (Math.abs(nx) > 0.9 ? '#22201e' : '#4e5c66'), 0.18, 0.18, 1.5, [0, 0.06, 0], { axis: 'x', seg: 8 });
  k.box('#2c2a28', [0.12, 0.2, 0.22], [0.12, 0.13, 0.02], { rot: [0, 0, 0.5] });                                    // split
  chunks(k, rr, 0, 0, 4, 1.7, ASPH, 0.8);
  g.add(k.mesh('body'));
  g.add(wk.mesh('puddle', glossy(), false));
  // the geyser: stretched translucent cone stack + inner core + crown spray + base splash
  const jk = new Kit(328);
  const jc = (cx, cy) => (cy < 0.5 ? '#f2f7f7' : cy > 5.0 ? '#f6f9f9' : cy > 3.6 ? '#d8e9ee' : '#c2dde5');
  const jc2 = (cx, cy) => (cy < 0.6 ? '#f4f8f8' : cy > 4.6 ? '#f2f7f8' : cy > 3.4 ? '#d9eaef' : '#c4dfe7');
  jk.lathe(jc2, [[0.55, 0], [0.42, 0.35], [0.3, 1.1], [0.26, 2.3], [0.3, 3.5], [0.48, 4.4], [0.85, 5.05], [1.3, 5.35], [1.55, 5.15], [1.45, 4.7], [1.2, 4.35]], 8, [0, 0, 0]);
  jk.lathe('#eef6f7', [[0.22, 0], [0.15, 1.5], [0.14, 3.5], [0.22, 4.6], [0.0, 5.3]], 6, [0, 0, 0], { phiStart: 0.4 });
  jk.lathe('#f4f8f8', [[1.25, 0.02], [0.8, 0.28], [0.45, 0.38]], 8, [0, 0, 0]);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.3, d = 1.3 + (i % 3) * 0.22, y = 4.2 - (i % 4) * 1.0;
    jk.geo(new THREE.OctahedronGeometry(0.09 + (i % 2) * 0.05), '#f2f7f8', new THREE.Matrix4().makeScale(0.8, 1.6, 0.8).setPosition(Math.cos(a) * d, y, Math.sin(a) * d));
  }
  const jm = new THREE.Mesh(jk.geometry(), jetMaterial());
  jm.castShadow = false; jm.renderOrder = 3;
  g.add(pivot('jet', jm, [0, 0, 0]));
  g.userData.perInstanceMaterials = ['jet_mesh'];
  g.userData.jet = { height: 5.4, note: 'Pulse jet.scale.y 0.85–1.1 (pivot at the crater, y = 0) and wobble rotation.x/z ±0.05.' };
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. trench_plates — roadworks trench across the lane under 2 steel plates
// ═════════════════════════════════════════════════════════════════════════════
export function buildTrenchPlates(variant = 0) {
  const g = root('trench_plates', variant, { w: 8.4, h: 1.2, l: 2.6 });
  const k = new Kit(330); k.floor = 0;
  // cold-patch asphalt band + exposed trench at the +X end + spoil heap
  k.top('#2c2d31', 0.008, [[-2.85, -1.05], [2.7, -1.12], [2.9, 1.05], [-2.75, 1.1]], { off: 0 });
  k.top('#120f0c', 0.012, [[2.52, -0.5], [2.98, -0.52], [3.0, 0.5], [2.52, 0.49]], { off: 0 });
  k.top(SOIL, 0.011, [[2.4, -0.62], [3.12, -0.62], [3.14, 0.62], [2.4, 0.62]], { off: 0 });
  k.ico(SOIL, 0.42, [3.25, 0.02, 0.78], { scale: [1.2, 0.55, 0.85], jitter: 0.25, seed: 331, flatBottom: -0.2 });
  k.ico(shade(SOIL, 0.85), 0.28, [2.85, 0.02, 0.95], { scale: [1.1, 0.5, 0.9], jitter: 0.25, seed: 332, flatBottom: -0.2 });
  // two steel plates, slightly misaligned, with polished tyre tracks, rust edges and lifting holes
  for (const [x, rot, c] of [[-1.24, 0.025, '#6a6e72'], [1.2, -0.035, '#63676b']]) {
    k.box(c, [2.5, 0.035, 1.7], [x, 0.01, 0], { base: true, c: 0.012, rot: [0, rot, 0] });
    k.at([x, 0.046, 0], [0, rot, 0], () => {
      k.rectY('#868b8f', 0, [-1.22, 1.22], [-0.6, -0.32], { off: 0.002 });
      k.rectY('#868b8f', 0, [-1.22, 1.22], [0.3, 0.58], { off: 0.002 });
      k.rectY(IRON_RUST, 0, [-1.25, -1.08], [-0.84, 0.84], { off: 0.002 });
      k.rectY(mix(c, IRON_RUST, 0.5), 0, [0.6, 1.1], [0.62, 0.84], { off: 0.002 });
      for (const [hx, hz] of [[-1.0, -0.66], [1.0, 0.66]]) k.rectY('#18191b', 0, [hx - 0.06, hx + 0.06], [hz - 0.04, hz + 0.04], { off: 0.003 });
    });
  }
  // barriers flank both ends (running along Z), cones in front
  for (const s of [1, -1]) k.at([s * 3.75, 0, 0], [0, Math.PI / 2, 0], () => miniBarrier(k, 2.1, s > 0));
  cone(k, -3.3, -1.25); cone(k, 3.35, -1.2); cone(k, -3.3, 1.25);
  g.add(k.mesh('body'));
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. manhole_open — open shaft, cover slid aside, warning tripod
// ═════════════════════════════════════════════════════════════════════════════
export function buildManholeOpen(variant = 0) {
  const g = root('manhole_open', variant, { w: 2.0, h: 1.1, l: 2.0 });
  const k = new Kit(340); k.floor = 0;
  k.blob('#3a3b3f', 0.75, [0, 0.008, 0], { seg: 10, seed: 341, wobble: 0.2 });
  roundHole(k, 0, 0, 0.36);
  // ladder: top rung + stiles just inside the shaft
  k.box('#7c7f82', [0.32, 0.024, 0.024], [0, -0.028, -0.29], NOFLOOR);
  for (const s of [1, -1]) k.box('#7c7f82', [0.024, 0.07, 0.024], [s * 0.15, -0.012, -0.3], NOFLOOR);
  // warning tripod on the approach side (−Z) with a double-sided "!" triangle
  const ax = 0, az = -0.78, ay = 1.0;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    beam(k, i ? '#d8d4c8' : '#c4372b', [ax + Math.cos(a) * 0.42, 0, az + Math.sin(a) * 0.42], [ax, ay, az], 0.035);
  }
  k.box('#2a2a2b', [0.08, 0.08, 0.08], [ax, ay, az]);
  for (const dir of [-1, 1]) {
    const z = az + dir * 0.05;
    const tri = (r) => [[0, ay - 0.06 + r], [-r * 0.87, ay - 0.06 - r * 0.5], [r * 0.87, ay - 0.06 - r * 0.5]].map(([x, y]) => [ax + x, y]);
    k.front('#c4372b', z, tri(0.24), dir, { off: 0.0 });
    k.front('#f1ede2', z, tri(0.15), dir, { off: 0.004 });
    k.front('#1f2022', z, [[-0.018, ay - 0.04], [0.018, ay - 0.04], [0.014, ay + 0.06], [-0.014, ay + 0.06]].map(([x, y]) => [ax + x, y]), dir, { off: 0.008 });
    k.front('#1f2022', z, [[-0.016, ay - 0.1], [0.016, ay - 0.1], [0.016, ay - 0.07], [-0.016, ay - 0.07]].map(([x, y]) => [ax + x, y]), dir, { off: 0.008 });
  }
  cone(k, 0.7, -0.55, 0.85); cone(k, -0.65, -0.6, 0.85);
  g.add(k.mesh('body'));
  // cover slid off to +X, lying flat
  const ck = coverKit(342, 0.36, 0.06, true);
  g.add(pivot('cover', ck.mesh('m'), [0.62, 0, 0.34], [0, 0.4, 0]));
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. sinkhole — collapsed road, broken edges, barriers + tape
// ═════════════════════════════════════════════════════════════════════════════
export function buildSinkhole(variant = 0) {
  const g = root('sinkhole', variant, { w: 5.6, h: 1.2, l: 6.2 });
  const k = new Kit(350); k.floor = 0;
  const rr = rng(351);
  k.blob('#38393d', 2.35, [0, 0.008, 0], { seg: 12, seed: 352, wobble: 0.25 });
  cracks(k, rr, 0, 0, 6, 1.7, 2.6);
  // exposed cross-section bands sloping into the pit
  const R0 = 1.0, R1 = 1.25, R2 = 1.52, seg = 10;
  for (let i = 0; i < seg; i++) {
    const t0 = (i / seg) * Math.PI * 2, t1 = ((i + 1) / seg) * Math.PI * 2;
    const j0 = 1 + (rng(353 + i)() - 0.5) * 0.18, j1 = 1 + (rng(353 + ((i + 1) % seg))() - 0.5) * 0.18;
    const P = (t, r, y, j) => [Math.cos(t) * r * j, y, Math.sin(t) * r * j];
    k.poly(GRAVEL, [P(t0, R2, 0.012, j0), P(t1, R2, 0.012, j1), P(t1, R1, -0.01, j1), P(t0, R1, -0.01, j0)], { facing: [0, 1, 0], ...NOFLOOR });
    k.poly(i % 2 ? SOIL : shade(SOIL, 0.88), [P(t0, R1, -0.01, j0), P(t1, R1, -0.01, j1), P(t1, R0, -0.042, j1), P(t0, R0, -0.042, j0)], { facing: [0, 1, 0], ...NOFLOOR });
  }
  k.blob('#060505', R0 * 1.02, [0, -0.044, 0], { seg: 10, seed: 354, wobble: 0.15, off: 0, ...NOFLOOR });
  // broken slab rim, tilted toward the pit
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rr() * 0.3, d = 1.62 + rr() * 0.2;
    // local X = radial; the inner edge sags into the pit
    k.at([Math.cos(a) * d, 0.04, Math.sin(a) * d], [0, -a, 0], () => k.box(i % 3 ? ASPH : shade(ASPH, 1.15), [0.42, 0.08, 0.7], [0, 0, 0], { rot: [0, 0, 0.3], noBottom: true }));
  }
  k.box(shade(ASPH, 0.8), [0.6, 0.07, 0.4], [0.25, -0.02, 0.2], { rot: [0.5, 0.6, 0.2], ...NOFLOOR });            // slab fallen in
  // barriers front & back, posts + tape round the sides
  for (const s of [1, -1]) k.at([0, 0, s * 2.85], [0, s > 0 ? Math.PI : 0, 0], () => miniBarrier(k, 2.6, s < 0));
  const P = [[-2.55, -2.6], [2.55, -2.6], [2.55, 2.6], [-2.55, 2.6]];
  for (const [x, z] of P) k.cyl('#d8d4c8', 0.03, 0.035, 1.0, [x, 0, z], { base: true, seg: 5, open: true });
  tape(k, P[0], P[3], 0.88, 6); tape(k, P[1], P[2], 0.88, 6);
  tape(k, P[0], [-1.3, -2.85], 0.88, 2); tape(k, P[1], [1.3, -2.85], 0.88, 2);
  tape(k, P[3], [-1.3, 2.85], 0.88, 2); tape(k, P[2], [1.3, 2.85], 0.88, 2);
  g.add(k.mesh('body'));
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. speed_bump — 7 m yellow/black hump across the lane (along X)
// ═════════════════════════════════════════════════════════════════════════════
export function buildSpeedBump(variant = 0) {
  const g = root('speed_bump', variant, { w: 7.2, h: 0.09, l: 0.95 });
  const k = new Kit(360); k.floor = 0;
  const prof = [[-0.46, 0], [0.46, 0], [0.32, 0.05], [0.13, 0.08], [-0.13, 0.08], [-0.32, 0.05]];
  const n = 14, W = 7.0;
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + (i + 0.5) * (W / n);
    const worn = i === 5 || i === 6 || i === 9;
    const c = i % 2 ? '#26272a' : (worn ? '#b49a4e' : '#d9b13a');
    k.extrude(c, prof, W / n, { axis: 'x', pos: [x, 0, 0] });
  }
  // rounded end caps + bolt heads + tyre scuffs
  for (const s of [1, -1]) k.extrude('#26272a', prof.map(([z, y]) => [z * 0.8, y * 0.75]), 0.12, { axis: 'x', pos: [s * (W / 2 + 0.06), 0, 0] });
  for (let i = 0; i < 7; i++) k.box('#4a4b4e', [0.05, 0.012, 0.05], [-W / 2 + 0.5 + i, 0.083, 0], { noBottom: true });
  for (const x of [-1.6, 1.4]) k.rectY('#1e1f21', 0.083, [x - 0.3, x + 0.3], [-0.1, 0.1], { off: 0.003 });
  g.add(k.mesh('body'));
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. broken_car — stalled 80s sedan, hood up, hazards blinking, warning triangle behind
// ═════════════════════════════════════════════════════════════════════════════
export function buildBrokenCar(variant = 0) {
  const g = root('broken_car', variant, { w: 1.9, h: 1.75, l: 6.7 });
  const k = new Kit(370); k.floor = 0;
  const Z = 0.85;                 // car centre z (the triangle sits behind at −Z)
  const body = '#cdb98a', primer = PAL.primer, W = 1.78, hw = W / 2;
  k.at([0, 0, Z], () => {
    const prof = [[-2.3, 0.3], [2.3, 0.3], [2.34, 0.5], [2.28, 0.76], [2.2, 0.82], [1.0, 0.85], [-1.45, 0.87], [-2.25, 0.85], [-2.32, 0.72], [-2.34, 0.5]];
    k.extrude((cx, cy, cz, nx) => (cx > 0.2 && cz > 1.05 && nx > 0.5 ? primer : body), prof, W, { axis: 'x', bevel: 0.05 });
    k.side(shade(body, 0.72), hw, [[-2.28, 0.36], [2.28, 0.36], [2.3, 0.46], [-2.3, 0.46]], { off: 0.014 });             // dark sill/trim line
    k.side(PAL.rust, hw, [[-2.1, 0.5], [-1.7, 0.46], [-1.6, 0.66], [-1.95, 0.7]], { side: 1, off: 0.016 });
    const f = k.frustum(body, { y0: 0.86, y1: 1.36, zb: [-1.42, 1.0], zt: [-1.05, 0.38], wb: hw - 0.04, wt: hw - 0.16 });
    k.patch(PAL.glass, f.front, [0.05, 0.95], [0.08, 0.9]);
    k.patch(PAL.glass, f.back, [0.07, 0.93], [0.1, 0.88]);
    k.patch(PAL.glassHi, f.front, [0.25, 0.33], [0.12, 0.85], { off: 0.016, skew: 0.06 });
    for (const face of [f.left, f.right]) { k.patch(PAL.glass, face, [0.06, 0.47], [0.1, 0.88]); k.patch(PAL.glass, face, [0.53, 0.93], [0.1, 0.88]); }
    // engine bay (hood is up) — dark recess, block, rusty valve cover, air cleaner, battery, radiator
    k.top('#1c1b1a', 0.85, [[-hw + 0.08, 1.04], [hw - 0.08, 1.04], [hw - 0.1, 2.16], [-hw + 0.1, 2.16]], { off: 0.006 });
    k.box('#4c4b48', [0.66, 0.16, 0.62], [0.0, 0.85, 1.52], { base: true, noBottom: true });
    k.box('#8a3b2c', [0.48, 0.06, 0.5], [0.0, 1.01, 1.52], { base: true, noBottom: true });
    k.cyl('#9c9a93', 0.19, 0.19, 0.08, [0, 1.07, 1.5], { base: true, seg: 8 });
    k.box('#1f2022', [0.24, 0.17, 0.2], [0.55, 0.85, 1.95], { base: true, noBottom: true });
    k.box('#b8392e', [0.05, 0.04, 0.05], [0.5, 1.03, 1.97]);
    k.box('#2c2c2a', [1.2, 0.3, 0.06], [0, 0.72, 2.12]);
    beam(k, '#9c9a93', [0.6, 0.86, 2.02], [0.6, 1.66, 1.56], 0.02);                                         // hood prop rod
    // bumpers, lights, plate, grille
    k.box(PAL.chrome, [W + 0.04, 0.12, 0.12], [0, 0.42, 2.34]);
    k.box(PAL.chrome, [W + 0.04, 0.12, 0.12], [0, 0.42, -2.34]);
    k.front('#2c2c2a', 2.34, [[-0.45, 0.52], [0.45, 0.52], [0.45, 0.7], [-0.45, 0.7]], 1, { off: 0.004 });
    for (const s of [1, -1]) {
      k.front(PAL.headlight, 2.33, [[s * 0.48, 0.54], [s * 0.72, 0.54], [s * 0.72, 0.68], [s * 0.48, 0.68]], 1, { off: 0.012 });
      k.front(PAL.taillight, -2.34, [[s * 0.34, 0.6], [s * 0.6, 0.6], [s * 0.6, 0.76], [s * 0.34, 0.76]], -1, { off: 0.008 });
    }
    k.front(PAL.plate, -2.41, [[-0.22, 0.38], [0.22, 0.38], [0.22, 0.48], [-0.22, 0.48]], -1, { off: 0.01 });
    // wheels (static) + hubcaps
    for (const [x, z] of [[hw - 0.07, 1.45], [-hw + 0.07, 1.45], [hw - 0.07, -1.45], [-hw + 0.07, -1.45]]) {
      k.cyl(PAL.tyre, 0.32, 0.32, 0.2, [x, 0.32, z], { axis: 'x', seg: 8, open: true });
      const sx = Math.sign(x);
      k.flat(PAL.tyre, Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4) * 0.32, Math.sin(i * Math.PI / 4) * 0.32]), (u, v) => [x + sx * 0.1, 0.32 + v, z + u], { facing: [sx, 0, 0], off: 0 });
      k.flat(PAL.rim, Array.from({ length: 6 }, (_, i) => [Math.cos(i * Math.PI / 3) * 0.17, Math.sin(i * Math.PI / 3) * 0.17]), (u, v) => [x + sx * 0.1, 0.32 + v, z + u], { facing: [sx, 0, 0], off: 0.008 });
    }
  });
  // warning triangle on a stand, 2.5 m behind the car, facing the approaching driver (−Z)
  const tz = Z - 4.05;
  const T = [[0, 0.52], [-0.24, 0.1], [0.24, 0.1]];
  for (let i = 0; i < 3; i++) beam(k, '#c4372b', [T[i][0], T[i][1], tz], [T[(i + 1) % 3][0], T[(i + 1) % 3][1], tz], 0.05, 0.03);
  beam(k, '#2a2a2b', [-0.2, 0.0, tz - 0.12], [0.0, 0.1, tz], 0.025); beam(k, '#2a2a2b', [0.2, 0.0, tz - 0.12], [0.0, 0.1, tz], 0.025);
  g.add(k.mesh('body'));
  // hood (pivot at the rear hinge, rotation.x < 0 = up). Authored open at −1.05.
  const hk = new Kit(371);
  hk.box((cx, cy, cz, nx, ny) => (ny < -0.5 ? '#5a503f' : body), [W - 0.06, 0.04, 1.18], [0, 0.02, 0.6]);
  g.add(pivot('hood', hk.mesh('m'), [0, 0.86, Z + 1.02], [-1.05, 0, 0]));
  // hazard lights: one pivot per side holding the front + rear amber lens (own emissive material)
  const amber = lampMat('#6a4410', '#ffa21f', 1.4, 'CR_Lamp_Hazard');
  for (const [name, s] of [['hazard_l', 1], ['hazard_r', -1]]) {
    const lk = new Kit(372);
    lk.box('#ffb347', [0.12, 0.08, 0.05], [-s * 0.02, -0.02, 2.345]);
    lk.box('#ffb347', [0.12, 0.12, 0.05], [-s * 0.12, 0.06, -2.355]);
    lk.box('#ffb347', [0.04, 0.07, 0.14], [s * 0.105, -0.02, 2.12]);
    g.add(pivot(name, lk.mesh('m', amber), [s * 0.8, 0.62, Z]));
  }
  // a little coolant steam over the engine bay
  const sm = new THREE.Mesh(mergeTransformed([
    { geo: puffGeometry(373, { bottom: '#b4b9bb', top: '#eef0f0' }), matrix: new THREE.Matrix4().compose(new THREE.Vector3(0.1, 1.35, Z + 1.55), new THREE.Quaternion(), new THREE.Vector3(0.32, 0.26, 0.3)) },
    { geo: puffGeometry(374, { bottom: '#b4b9bb', top: '#eef0f0' }), matrix: new THREE.Matrix4().compose(new THREE.Vector3(0.28, 1.72, Z + 1.35), new THREE.Quaternion(), new THREE.Vector3(0.42, 0.34, 0.4)) },
  ]), steamMaterial());
  sm.name = 'engine_steam'; sm.castShadow = false; sm.renderOrder = 3;
  g.add(sm);
  g.userData.perInstanceMaterials = ['hazard_l_mesh', 'hazard_r_mesh'];
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// 8. trolley — shopping trolley (v0 empty, v1 loaded with bags). Nose toward +Z, handle at −Z.
// ═════════════════════════════════════════════════════════════════════════════
export function buildTrolley(variant = 0) {
  const full = variant % 2 === 1;
  const g = root('trolley', variant, { w: 0.62, h: 1.08, l: 1.0 }, { style: full ? 'loaded' : 'empty' });
  const k = new Kit(380 + variant); k.floor = 0;
  const wire = '#a6aaad', wireD = '#8a8e91', red = '#b8392e';
  const top = { y: 0.98, rx: 0.28, rz: -0.42, fx: 0.22, fz: 0.48 };
  const bot = { y: 0.5, rx: 0.26, rz: -0.36, fx: 0.2, fz: 0.34 };
  const C = (o) => [[o.rx, o.y, o.rz], [o.fx, o.y, o.fz], [-o.fx, o.y, o.fz], [-o.rx, o.y, o.rz]];
  const T = C(top), B = C(bot);
  const r = 0.012;
  for (let i = 0; i < 4; i++) { beam(k, wire, T[i], T[(i + 1) % 4], r * 2); beam(k, wireD, B[i], B[(i + 1) % 4], r * 2); beam(k, wire, B[i], T[i], r * 2); }
  const L = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  for (const t of [0.34, 0.67]) for (const [i, j] of [[0, 1], [3, 2]]) beam(k, wireD, L(B[i], B[j], t), L(T[i], T[j], t), r * 1.6);
  beam(k, wireD, L(B[1], B[2], 0.5), L(T[1], T[2], 0.5), r * 1.6);                                     // nose
  // handle + red grip, child-seat flap
  for (const s of [1, -1]) beam(k, wire, [s * 0.28, 0.98, -0.42], [s * 0.29, 1.04, -0.53], r * 2);
  k.box(red, [0.6, 0.05, 0.05], [0, 1.045, -0.535]);
  k.box('#9e3328', [0.46, 0.02, 0.2], [0, 0.94, -0.3], { rot: [0.25, 0, 0] });
  // chassis rails, legs, lower tray, casters
  for (const s of [1, -1]) {
    beam(k, wireD, [s * 0.22, 0.13, -0.44], [s * 0.17, 0.13, 0.44], 0.025);
    beam(k, wireD, [s * 0.26, 0.5, -0.36], [s * 0.22, 0.13, -0.44], 0.022);
    beam(k, wireD, [s * 0.2, 0.5, 0.34], [s * 0.17, 0.13, 0.42], 0.022);
  }
  k.box('#7d8184', [0.38, 0.015, 0.62], [0, 0.2, 0.0]);
  for (const [x, z] of [[0.22, -0.44], [-0.22, -0.44], [0.17, 0.42], [-0.17, 0.42]]) {
    k.box('#5a5d60', [0.02, 0.07, 0.05], [x, 0.09, z]);
    k.cyl('#2a2a2b', 0.055, 0.055, 0.035, [x, 0.055, z + 0.02], { axis: 'x', seg: 4 });
  }
  if (full) {
    const bag = (x, z, h, ry, c) => { k.box(c, [0.22, h, 0.17], [x, 0.53, z], { base: true, rot: [0, ry, 0], noBottom: true }); k.box(shade(c, 0.86), [0.226, 0.04, 0.176], [x, 0.5 + h, z], { base: true, rot: [0, ry, 0], noBottom: true }); };
    bag(0.1, -0.2, 0.36, 0.1, '#c79e6a'); bag(-0.12, -0.12, 0.4, -0.15, '#b98d5a'); bag(0.08, 0.15, 0.32, 0.25, '#d1aa74');
    k.box('#e7e1d2', [0.18, 0.28, 0.16], [-0.1, 0.53, 0.2], { base: true, rot: [0, -0.3, 0.06], noBottom: true });  // white plastic bag
    k.cyl('#d1a35a', 0.03, 0.035, 0.42, [0.12, 0.95, -0.16], { seg: 5, rot: [0.4, 0, 0.35] });                   // baguette
    k.ico('#6f8c4a', 0.09, [-0.14, 0.97, -0.06], { jitter: 0.25, seed: 384 });                                     // greens
    k.box('#c43a2e', [0.1, 0.12, 0.1], [0.12, 0.9, 0.18], { rot: [0, 0.4, 0.2] });                                // cereal box
  }
  g.add(k.mesh('body'));
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// 9. power_line_down — snapped pole leaning over the road; wires down across the lane, sparking
// ═════════════════════════════════════════════════════════════════════════════
export function buildPowerLineDown(variant = 0) {
  const g = root('power_line_down', variant, { w: 8.0, h: 5.6, l: 6.0 });
  const k = new Kit(390); k.floor = 0;
  const wood = '#7d6a55', woodD = '#5e4f3f', splint = '#c2a57a';
  const px = 4.0, pz = 0.3, snapY = 1.35;
  // stump + splinters
  k.cyl((cx, cy, cz, nx, ny) => (ny > 0.5 ? splint : wood), 0.15, 0.17, snapY, [px, 0, pz], { base: true, seg: 7, jit: 0.1 });
  for (let i = 0; i < 4; i++) { const a = i * 1.6; k.box(i % 2 ? splint : woodD, [0.05, 0.32, 0.04], [px + Math.cos(a) * 0.09, snapY + 0.1, pz + Math.sin(a) * 0.09], { rot: [Math.sin(a) * 0.3, a, -Math.cos(a) * 0.3] }); }
  // upper pole leaning 50° toward −X, held by the wires; crossarm, insulators
  const tilt = 50 * Math.PI / 180, len = 6.2;
  k.at([px - 0.08, snapY + 0.12, pz], [0, 0, tilt], () => {
    k.cyl(wood, 0.135, 0.15, len, [0, 0, 0], { base: true, seg: 7, jit: 0.1 });
    for (let i = 0; i < 3; i++) { const a = i * 2.1; k.box(i % 2 ? splint : woodD, [0.05, 0.3, 0.04], [Math.cos(a) * 0.08, -0.06, Math.sin(a) * 0.08], { rot: [Math.sin(a) * 0.35, a, -Math.cos(a) * 0.35] }); }
    k.box(woodD, [0.12, 0.12, 2.1], [0, len - 0.45, 0]);
    k.box(woodD, [0.05, 0.6, 0.05], [0.08, len - 0.7, 0.4], { rot: [0.9, 0, 0] });
    for (const z of [-0.95, 0, 0.95]) k.cyl('#7f9a8c', 0.05, 0.065, 0.16, [0, len - 0.32 + (z === 0 ? 0.25 : 0), z], { seg: 5 });
    for (let i = 0; i < 4; i++) k.box('#4d4f52', [0.03, 0.03, 0.18], [0.14, 1.2 + i * 0.6, 0]);            // climbing steps
  });
  // the wire ends: insulator tops in world space
  const pole = (s, zOff) => { const v = new THREE.Vector3(0, s, zOff).applyEuler(new THREE.Euler(0, 0, tilt)); return [px - 0.08 + v.x, snapY + 0.12 + v.y, pz + v.z]; };
  const E1 = pole(len - 0.22, 0.95), E2 = pole(len - 0.22, -0.95);
  const wireA = [E1, [-1.0, 4.3, 1.3], [-1.6, 3.1, 1.45], [-2.2, 2.0, 1.62], [-2.75, 1.05, 1.82], [-3.15, 0.35, 2.0], [-3.3, 0.04, 2.12], [-3.55, 0.035, 2.4], [-3.35, 0.035, 2.75], [-2.95, 0.035, 2.7], [-2.85, 0.04, 2.42]];
  const wireB = [E2, [-0.25, 4.35, -0.9], [0.3, 3.1, -1.35], [0.95, 1.95, -1.9], [1.6, 1.0, -2.4], [2.1, 0.3, -2.75], [2.35, 0.04, -2.9], [2.75, 0.035, -2.95], [2.85, 0.035, -2.55], [2.55, 0.04, -2.45]];
  rod(k, '#1d1d1f', wireA, 0.042);
  rod(k, '#1d1d1f', wireB, 0.042);
  // scorch marks + scattered splinters
  k.blob('#1a1a1b', 0.55, [-2.9, 0.012, 2.5], { seg: 9, seed: 391, wobble: 0.5 });
  k.blob('#1a1a1b', 0.45, [2.6, 0.012, -2.65], { seg: 8, seed: 392, wobble: 0.5 });
  for (const [x, z, ry] of [[3.3, 0.9, 0.4], [3.6, -0.4, 1.9], [2.9, 0.2, 2.6]]) k.box(splint, [0.4, 0.04, 0.05], [x, 0.02, z], { rot: [0, ry, 0], noBottom: true });
  g.add(k.mesh('body'));
  // sparks: tiny unlit stars at the live ends (scale-flicker them)
  const sparkGeo = () => {
    const sk = new Kit(393);
    for (let i = 0; i < 3; i++) sk.box('#fff4b0', [0.34, 0.025, 0.025], [0, 0, 0], { rot: [i * 1.1, i * 0.9, i * 0.7] });
    sk.geo(new THREE.OctahedronGeometry(0.07), '#ffffff', new THREE.Matrix4());
    return sk;
  };
  const wl = wireA[wireA.length - 1], wl2 = wireB[wireB.length - 1];
  g.add(pivot('spark', sparkGeo().mesh('m', unlitVcol('CR_Spark'), false), [wl[0], 0.22, wl[2]]));
  g.add(pivot('spark_1', sparkGeo().mesh('m', unlitVcol('CR_Spark'), false), [wl2[0], 0.22, wl2[2]]));
  g.userData.wires = { a: wireA.map((p) => p.map((v) => +v.toFixed(2))), b: wireB.map((p) => p.map((v) => +v.toFixed(2))) };
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// 10. log — single heavy 6 m log (along X); pivot `trunk` at its axis rolls with rotation.x
// ═════════════════════════════════════════════════════════════════════════════
export function buildLog(variant = 0) {
  const R = 0.44;
  const g = root('log', variant, { w: 6.0, h: 0.9, l: 0.92 });
  const k = new Kit(400);
  const bark = '#5e4a36';
  k.cyl(bark, R * 0.92, R, 6.0, [0, 0, 0], { axis: 'x', seg: 10, open: true, jit: 0.22 });
  for (let i = 0; i < 5; i++) {
    const a = i * 1.27 + 0.3;
    k.box(i % 2 ? '#4a3a2a' : '#6e5841', [5.4 - i * 0.4, 0.05, 0.07], [0.1 * i, Math.sin(a) * (R * 0.95), Math.cos(a) * (R * 0.95)], { rot: [Math.PI / 2 - a, 0, 0] });
  }
  for (const s of [1, -1]) {
    const x = s * 3.0, r = s > 0 ? R : R * 0.92;   // the cylinder's top (thin) end is at −X
    const disc = (rad, n, c, off) => k.flat(c, Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * rad, Math.sin((i / n) * Math.PI * 2) * rad]), (u, v) => [x, v, u], { facing: [s, 0, 0], off });
    disc(r, 10, '#b89a6e', 0.0); disc(r * 0.72, 8, '#a5865c', 0.004); disc(r * 0.45, 7, '#c2a57a', 0.008); disc(r * 0.16, 6, '#8a6a46', 0.012);
  }
  for (const [x, a, l] of [[-1.4, 0.9, 0.5], [0.8, 2.3, 0.38], [2.0, 0.15, 0.3]]) k.cyl(bark, 0.07, 0.1, l, [x, Math.sin(a) * (R + l / 2 - 0.06), Math.cos(a) * (R + l / 2 - 0.06)], { seg: 5, rot: [-a + Math.PI / 2, 0, 0] });
  k.poly('#6f7a45', [[-2.4, R * 0.98, -0.12], [-1.2, R * 0.98, -0.14], [-1.3, R * 0.96, 0.15], [-2.3, R * 0.95, 0.12]], { facing: [0, 1, 0], off: 0.02 });
  k.poly('#c2a57a', [[0.6, R * 0.6, R * 0.82], [1.3, R * 0.62, R * 0.82], [1.25, R * 0.25, R * 0.98], [0.65, R * 0.22, R * 0.98]], { facing: [0, 0.4, 1], off: 0.02 });
  g.add(pivot('trunk', k.mesh('m'), [0, R, 0]));
  g.userData.roll = { axis: 'x', radius: R, note: 'trunk.rotation.x += distance / radius (rolling toward +Z = positive).' };
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// 11. dust_devil — six stacked translucent swirl rings + orbiting debris
// ═════════════════════════════════════════════════════════════════════════════
export function buildDustDevil(variant = 0) {
  const g = root('dust_devil', variant, { w: 5.6, h: 8.6, l: 5.6 });
  const mat = dustMaterial();
  const ys = [0, 1.2, 2.5, 3.9, 5.35, 6.8], hs = [1.4, 1.5, 1.6, 1.7, 1.75, 1.8], lean = [0, 0.08, 0.22, 0.42, 0.66, 0.95];
  for (let i = 0; i < 6; i++) {
    const k = new Kit(410 + i);
    const ra = 0.42 + 0.33 * i, rc = 0.6 + 0.38 * i, rb = (ra + rc) / 2 + 0.12 + i * 0.03, h = hs[i];
    const seg = 10, twist = 0.55;
    const cols = [mix('#8f7352', '#b99a72', i / 5), mix('#a88a64', '#d2b48c', i / 5), mix('#7e6448', '#a88a64', i / 5)];
    const P = (a, r, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
    for (let j = 0; j < seg; j++) {
      const a0 = (j / seg) * Math.PI * 2, a1 = ((j + 1) / seg) * Math.PI * 2;
      const c = cols[j % 3];
      k.poly(c, [P(a0, ra, 0), P(a1, ra, 0), P(a1 + twist / 2, rb, h / 2), P(a0 + twist / 2, rb, h / 2)], { facing: [Math.cos(a0 + 0.3), 0, Math.sin(a0 + 0.3)] });
      k.poly(cols[(j + 1) % 3], [P(a0 + twist / 2, rb, h / 2), P(a1 + twist / 2, rb, h / 2), P(a1 + twist, rc, h), P(a0 + twist, rc, h)], { facing: [Math.cos(a0 + 0.6), 0, Math.sin(a0 + 0.6)] });
    }
    const m = new THREE.Mesh(k.geometry(), mat);
    m.castShadow = false; m.renderOrder = 3 + i;
    g.add(pivot(`ring_${i}`, m, [lean[i], ys[i], lean[i] * -0.3], [0, i * 0.7, 0]));
  }
  // dust skirt: flattened translucent puffs at the base (same dust material)
  const parts = [[0.2, 0.25, 0.1, 1.9, 0.38, 1.6], [-0.8, 0.18, -0.6, 1.2, 0.3, 1.0], [0.9, 0.16, -0.7, 1.0, 0.26, 0.9]].map(([x, y, z, sx, sy, sz], i) => ({ geo: puffGeometry(420 + i, { bottom: '#9b7f5c', top: '#cdb08a', jitter: 0.18 }), matrix: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)) }));
  const skirt = new THREE.Mesh(mergeTransformed(parts, 0.01), mat);
  skirt.name = 'dust_skirt'; skirt.castShadow = false; skirt.renderOrder = 2;
  g.add(skirt);
  // ground scar + debris that orbits (pivot `debris`, spin rotation.y)
  const gk = new Kit(425); gk.floor = 0;
  gk.blob('#c9a77a', 2.6, [0, 0.01, 0], { seg: 12, seed: 426, wobble: 0.35 });
  g.add(gk.mesh('body', undefined, false));
  const dk = new Kit(427);
  const rr = rng(428);
  for (let i = 0; i < 18; i++) {
    const y = 0.2 + Math.pow(rr(), 1.4) * 6.5, ri = Math.min(5, Math.floor(y / 1.35));
    const rad = (0.5 + 0.36 * ri) * (0.9 + rr() * 0.5), a = rr() * Math.PI * 2;
    const x = Math.cos(a) * rad + lean[ri], z = Math.sin(a) * rad;
    const kind = i % 3;
    if (kind === 0) dk.geo(new THREE.TetrahedronGeometry(0.07 + rr() * 0.08), rr() < 0.5 ? '#6e5a42' : '#8a7a5a', new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rr() * 3, rr() * 3, 0)).setPosition(x, y, z));
    else if (kind === 1) dk.box(rr() < 0.5 ? '#5e4a36' : '#7a6a48', [0.35, 0.025, 0.025], [x, y, z], { rot: [rr() * 3, rr() * 3, rr() * 3] });
    else for (const f of [1, -1]) dk.poly(rr() < 0.6 ? '#e6dfcc' : '#9aa36a', [[x - 0.1, y - 0.06, z], [x + 0.1, y - 0.07, z + 0.02], [x + 0.09, y + 0.07, z], [x - 0.08, y + 0.06, z - 0.02]], { facing: [0, 0, f] });
  }
  g.add(pivot('debris', dk.mesh('m'), [0, 0, 0]));
  g.userData.perInstanceMaterials = ['ring_*'];
  g.userData.swirl = { note: 'Spin ring_i.rotation.y at (2.4 − 0.25·i) rad/s, debris at 1.6 rad/s; sway ring_i.position.x by 0.15·sin(t·1.3 + i·0.6)·i/5.' };
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// 12. flood_wash — shallow brown water across the road + depth marker post
// ═════════════════════════════════════════════════════════════════════════════
export function buildFloodWash(variant = 0) {
  const g = root('flood_wash', variant, { w: 9.4, h: 2.3, l: 5.4 });
  const k = new Kit(430); k.floor = 0;
  const wk = new Kit(431); wk.floor = 0;
  const rr = rng(432);
  // silt fringe (matte) + water (glossy)
  k.blob('#8a7556', 4.6, [0, 0.008, 0], { seg: 16, seed: 433, wobble: 0.18, sx: 1.0, sz: 0.56 });
  wk.blob('#6e5c43', 4.25, [0, 0.012, 0], { seg: 16, seed: 434, wobble: 0.16, sx: 1.0, sz: 0.52 });
  wk.blob('#5c4c37', 2.6, [0.4, 0.015, 0.1], { seg: 12, seed: 435, wobble: 0.25, sx: 1.25, sz: 0.55 });
  // current streaks (flowing toward −X) and ripple rings
  for (let i = 0; i < 6; i++) { const x = -3 + rr() * 6, z = -1.6 + rr() * 3.2, l = 0.6 + rr() * 0.9; wk.poly('#9a8664', [[x - l, 0.019, z - 0.03], [x + l, 0.019, z - 0.05], [x + l, 0.019, z + 0.02], [x - l, 0.019, z + 0.04]], { facing: [0, 1, 0] }); }
  ring(wk, '#9c8a68', 0.42, 0.48, [1.6, 0.02, -0.5], 10);
  ring(wk, '#9c8a68', 0.8, 0.85, [1.6, 0.02, -0.5], 12, { a0: 0.5, a1: 4.5 });
  ring(wk, '#9c8a68', 0.35, 0.4, [-2.1, 0.02, 0.8], 8);
  // floating twigs + a bottle; mud banks at the road edges
  for (let i = 0; i < 3; i++) wk.box('#4e3e2c', [0.5, 0.03, 0.04], [-1 + i * 1.3, 0.025, 0.6 - i * 0.7], { rot: [0, rr() * 3, 0], noBottom: true });
  wk.cyl('#5d7a5a', 0.04, 0.04, 0.22, [0.7, 0.04, 1.1], { axis: 'x', seg: 5, rot: [0, 0.6, 0] });
  for (const s of [1, -1]) k.ico('#6b5841', 0.6, [s * 4.35, 0.0, s * 0.3], { scale: [1.0, 0.25, 2.2], jitter: 0.25, seed: 436 + s, flatBottom: 0 });
  // depth marker post at the +X roadside (white, black graduations, red top) facing the approach (−Z)
  const mx = 4.15, mz = -1.2;
  k.box('#e9e5da', [0.14, 2.1, 0.06], [mx, 0, mz], { base: true });
  k.box('#b8392e', [0.145, 0.3, 0.065], [mx, 1.8, mz], { base: true });
  for (let i = 1; i < 8; i++) {
    const y = i * 0.22, w = i % 2 ? 0.07 : 0.12;
    for (const dir of [-1, 1]) k.front('#1f2022', mz + dir * 0.031, [[mx - 0.07, y - 0.012], [mx - 0.07 + w, y - 0.012], [mx - 0.07 + w, y + 0.012], [mx - 0.07, y + 0.012]], dir, { off: 0.002 });
  }
  k.box('#e2b93b', [0.36, 0.36, 0.02], [mx, 2.05, mz - 0.04], { rot: [0, 0, Math.PI / 4] });
  k.front('#1f2022', mz - 0.052, [[mx - 0.02, 1.98], [mx + 0.02, 1.98], [mx + 0.016, 2.12], [mx - 0.016, 2.12]], -1, { off: 0.002 });
  k.front('#1f2022', mz - 0.052, [[mx - 0.02, 1.92], [mx + 0.02, 1.92], [mx + 0.02, 1.95], [mx - 0.02, 1.95]], -1, { off: 0.002 });
  g.add(k.mesh('body'));
  g.add(wk.mesh('water', glossy(), false));
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// 13. flashbang — cartoon-simple police canister. v0 "FLASH" (navy/yellow), v1 "FOAM" (white/blue).
//     Plain cylinder, stripes, a pull ring on the cap — no real-device detail.
// ═════════════════════════════════════════════════════════════════════════════
const _labelMats = new Map();
function labelBand(text, fg, bg, r, h) {
  const key = 'canlabel|' + text;
  let mat = _labelMats.get(key);
  if (!mat) {
    const tex = signTexture({
      key, w: 512, h: 96, bg, weather: false,
      // u = 0.5 faces +Z (front, seam at the back): one word centred in front, a second split across the back seam
      draw: (ctx, w, hh) => { ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; for (const x of [0, w * 0.5, w]) fitText(ctx, text, x, hh / 2 + 4, w * 0.4, 64); },
    });
    mat = tex ? new THREE.MeshLambertMaterial({ map: tex, name: 'CR_Label_' + text }) : new THREE.MeshLambertMaterial({ color: bg, name: 'CR_Label_' + text });
    _labelMats.set(key, mat);
  }
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14, 1, true, Math.PI), mat);
  m.name = 'label';
  return m;
}
export function buildFlashbang(variant = 0) {
  const foam = variant % 2 === 1;
  const g = root('flashbang', variant, { w: 0.17, h: 0.33, l: 0.17 }, { style: foam ? 'FOAM' : 'FLASH' });
  const k = new Kit(440 + variant);
  const body = foam ? '#e2dccb' : '#1f2a44', stripe = foam ? '#3e7fa0' : '#e2b93b';
  const R = 0.075, H = 0.24;
  k.cyl(body, R, R, H, [0, 0, 0], { seg: 12 });
  for (const y of [-0.085, 0.085]) k.cyl(stripe, R * 1.02, R * 1.02, 0.025, [0, y, 0], { seg: 12, open: true });
  k.lathe('#9a9c9e', [[R * 0.98, H / 2], [R * 0.8, H / 2 + 0.025], [0.03, H / 2 + 0.035], [0, H / 2 + 0.036]], 10, [0, 0, 0]);
  k.box('#9a9c9e', [0.014, 0.03, 0.014], [0, H / 2 + 0.05, 0]);
  k.torus(stripe, 0.032, 0.007, [0, H / 2 + 0.085, 0], { rs: 4, ts: 10, rot: [0, Math.PI / 2, 0] });
  const can = pivot('can', k.mesh('m'), [0, H / 2, 0]);
  const lb = labelBand(foam ? 'FOAM' : 'FLASH', foam ? '#2e6f92' : '#f0c53c', body, R * 1.015, 0.12);
  can.add(lb);
  g.add(can);
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// 14. foam_patch — sticky white-yellow police foam splattered on the road
// ═════════════════════════════════════════════════════════════════════════════
export function buildFoamPatch(variant = 0) {
  const g = root('foam_patch', variant, { w: 3.4, h: 0.5, l: 3.0 });
  const k = new Kit(450); k.floor = 0;
  const rr = rng(451);
  k.blob('#d9d0ac', 1.7, [0, 0.01, 0], { seg: 14, seed: 452, wobble: 0.5, sz: 0.85 });
  k.blob('#e9e2c4', 1.25, [0.1, 0.014, 0.05], { seg: 12, seed: 453, wobble: 0.45 });
  for (let i = 0; i < 6; i++) { const a = rr() * Math.PI * 2, d = 1.4 + rr() * 0.6; k.blob('#ddd5b2', 0.18 + rr() * 0.15, [Math.cos(a) * d, 0.012, Math.sin(a) * d * 0.85], { seg: 7, seed: 454 + i }); }
  // spent FOAM canister lying in it (no text at this size)
  k.at([0.85, 0.075, -0.45], [0, 0.7, Math.PI / 2], () => {
    k.cyl('#e2dccb', 0.075, 0.075, 0.24, [0, 0, 0], { seg: 8 });
    for (const y of [-0.085, 0.085]) k.cyl('#3e7fa0', 0.077, 0.077, 0.025, [0, y, 0], { seg: 8, open: true });
  });
  g.add(k.mesh('body', undefined, false));
  // lumpy foam (smooth, opaque)
  const defs = [[0, 0.12, 0, 0.75, 0.28, 0.6], [-0.65, 0.1, 0.35, 0.5, 0.22, 0.45], [0.55, 0.1, 0.45, 0.45, 0.2, 0.4], [0.3, 0.2, -0.25, 0.4, 0.22, 0.35], [-0.4, 0.08, -0.55, 0.42, 0.16, 0.38], [-0.15, 0.3, 0.1, 0.32, 0.18, 0.3]];
  const parts = defs.map(([x, y, z, sx, sy, sz], i) => ({ geo: puffGeometry(455 + i, { bottom: '#d2c693', top: '#fbf8ea', jitter: 0.16 }), matrix: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, i, 0)), new THREE.Vector3(sx, sy, sz)) }));
  for (let i = 0; i < 6; i++) { const a = rr() * Math.PI * 2, d = 0.5 + rr() * 0.6; parts.push({ geo: puffGeometry(465 + i, { bottom: '#e0d6a8', top: '#ffffff', jitter: 0.05 }), matrix: new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * d, 0.08 + rr() * 0.2, Math.sin(a) * d), new THREE.Quaternion(), new THREE.Vector3(0.08, 0.08, 0.08).multiplyScalar(0.7 + rr())) }); }
  const fm = new THREE.Mesh(mergeTransformed(parts, 0.012), foamMaterial());
  fm.name = 'foam'; fm.castShadow = true; fm.receiveShadow = true;
  g.add(fm);
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// 15. stop_arrow — chunky mustard "stop here" arrow over a glowing ground ring
//     `arrow` pivot at the arrow's centre (bob position.y ±0.25, spin rotation.y); `ring` pulses.
// ═════════════════════════════════════════════════════════════════════════════
export function buildStopArrow(variant = 0) {
  const g = root('stop_arrow', variant, { w: 7.6, h: 7.7, l: 7.6 });
  const mustard = PAL.rvMustard, dark = '#2a2420';
  const k = new Kit(460);
  // 2D arrow (tip down) centred on its own middle: total 3.0 tall, head 1.3, shaft 0.95 wide
  const H = 3.0, cy = H / 2;
  const shape = [[0, 0], [1.05, 1.3], [0.48, 1.3], [0.48, 3.0], [-0.48, 3.0], [-0.48, 1.3], [-1.05, 1.3]].map(([x, y]) => [x, y - cy]);
  const D = 0.62;
  k.extrude(dark, shape, D, { axis: 'z', bevel: 0.05 });
  const inner = offsetPoly(shape, -0.12);
  for (const dir of [1, -1]) {
    k.front(mustard, dir * D / 2, inner, dir, { off: 0.012 });
    // chunky shading: a lit strip down the shaft's upper-left edge, a shaded lower head
    k.front('#ecc260', dir * D / 2, [[-0.36, -0.15], [-0.22, -0.15], [-0.22, 1.38], [-0.36, 1.38]].map(([x, y]) => [x * dir, y]), dir, { off: 0.02 });
    k.front(shade(mustard, 0.84), dir * D / 2, [[-0.5, -0.5], [0.5, -0.5], [0.0, -1.12]], dir, { off: 0.02 });
  }
  const ARROW_Y = 6.1;
  g.add(pivot('arrow', k.mesh('m'), [0, ARROW_Y, 0]));
  // glowing ground ring (unlit) + dashed inner ring + faint fill
  const rk = new Kit(461);
  ring(rk, '#ffd36a', 3.25, 3.65, [0, 0, 0], 32);
  ring(rk, (i) => (i % 2 ? null : '#ffc847'), 2.7, 2.9, [0, 0, 0], 24);
  const rm = new THREE.Mesh(rk.geometry(), glowVcol(0.85, 'CR_StopRing'));
  rm.renderOrder = 2; rm.castShadow = false;
  g.add(pivot('ring', rm, [0, 0.03, 0]));
  // faint light column from the ring up toward the arrow tip + faint fill inside the ring (same faint material)
  const bk = new Kit(462);
  bk.cyl('#ffd36a', 0.55, 2.4, ARROW_Y - H / 2 - 0.2, [0, (ARROW_Y - H / 2 - 0.2) / 2 + 0.05, 0], { seg: 16, open: true });
  bk.blob('#ffd36a', 3.2, [0, 0.025, 0], { seg: 20, wobble: 0, off: 0 });
  const bm = new THREE.Mesh(bk.geometry(), glowVcol(0.14, 'CR_StopBeam'));
  bm.name = 'beam'; bm.renderOrder = 1; bm.castShadow = false;
  g.add(bm);
  g.userData.perInstanceMaterials = ['ring_mesh', 'beam'];
  g.userData.arrow = { restY: ARROW_Y, bob: 0.25, tipY: ARROW_Y - H / 2, note: 'arrow.position.y = restY + 0.25·sin(2t); arrow.rotation.y += 0.8·dt (or billboard it toward the camera).' };
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// 16. car_wash_suds — heap of soap foam with a soapy puddle
// ═════════════════════════════════════════════════════════════════════════════
export function buildCarWashSuds(variant = 0) {
  const g = root('car_wash_suds', variant, { w: 3.0, h: 1.5, l: 2.6 });
  const rr = rng(470);
  const pk = new Kit(471); pk.floor = 0;
  pk.blob('#b9c6cf', 1.5, [0, 0.01, 0], { seg: 14, seed: 472, wobble: 0.4, sz: 0.85 });
  pk.blob('#d9e2e8', 0.9, [0.6, 0.014, 0.5], { seg: 10, seed: 473, wobble: 0.4 });
  g.add(pk.mesh('puddle', glossy(), false));
  const tints = [['#d6dfe6', '#ffffff'], ['#e3d3dc', '#fdf6fa'], ['#cfdbe6', '#f6fafd']];
  const defs = [[0, 0.5, 0, 0.82, 0.62, 0.72], [-0.7, 0.32, 0.3, 0.55, 0.42, 0.5], [0.65, 0.3, 0.35, 0.52, 0.38, 0.48], [0.4, 0.35, -0.55, 0.5, 0.4, 0.45],
    [-0.45, 0.3, -0.5, 0.48, 0.36, 0.44], [0.15, 0.95, 0.1, 0.5, 0.42, 0.45], [-0.25, 1.2, -0.05, 0.32, 0.28, 0.3], [1.05, 0.15, -0.1, 0.32, 0.2, 0.3], [-1.1, 0.14, -0.15, 0.3, 0.18, 0.3]];
  const parts = defs.map(([x, y, z, sx, sy, sz], i) => { const [b, t] = tints[i % 3]; return { geo: puffGeometry(474 + i, { bottom: b, top: t, jitter: 0.12 }), matrix: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rr(), rr() * 3, rr())), new THREE.Vector3(sx, sy, sz)) }; });
  for (let i = 0; i < 9; i++) { const a = rr() * Math.PI * 2, d = 0.9 + rr() * 0.6; parts.push({ geo: puffGeometry(490 + i, { bottom: '#dfe8ee', top: '#ffffff', jitter: 0.04 }), matrix: new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * d, 0.06 + rr() * 0.5, Math.sin(a) * d * 0.8), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1).multiplyScalar(0.06 + rr() * 0.08)) }); }
  const fm = new THREE.Mesh(mergeTransformed(parts, 0.012), foamMaterial());
  fm.name = 'body'; fm.castShadow = true; fm.receiveShadow = true;
  g.add(fm);
  return g;
}
