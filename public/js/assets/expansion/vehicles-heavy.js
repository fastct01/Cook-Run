// ─────────────────────────────────────────────────────────────────────────────
// Expansion pack VEHICLES: heavy / long vehicles
//   streetcar, car_carrier, wide_load (+ escort pickup), combine, logging_truck
// ─────────────────────────────────────────────────────────────────────────────
import {
  THREE, Kit, root, empty, PAL, mix, shade, addWheel, edgeQuad, sideBlob, arch, sideWindow, lerp,
  vrig, finish, beam, tube, polyBeam, frameBox, figure, lampMesh, textTex, addSign, sideSigns, addWheelGeo, railWheelGeo,
  longNoseCab, flatCab, miniCar, grimeBand, hazardStripes, rivets, offsetRig,
} from './vehicles-common.js';
import { buildPickup } from '../models/vehicles.js';

/** Paint a quad on the vertical face between plan points a=[x,z] → b=[x,z] (u along the edge, y absolute). */
function facePane(k, color, a, b, [u0, u1], [y0, y1], off = 0.012, center = [0, 0]) {
  const P = (u, y) => [lerp(a[0], b[0], u), y, lerp(a[1], b[1], u)];
  const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
  let n = [dz / l, 0, -dx / l];
  const mx = (a[0] + b[0]) / 2 - center[0], mz = (a[1] + b[1]) / 2 - center[1];
  if (n[0] * mx + n[2] * mz < 0) n = [-n[0], 0, -n[2]];
  k.poly(color, [P(u0, y0), P(u1, y0), P(u1, y1), P(u0, y1)], { facing: n, off });
}

/** Amber beacon lamp mesh (escort / wide-load trucks). */
function amberLamps(name, build) {
  return lampMesh(name, build, '#7a5420', '#ffb02e', 'CR_Lamp_Amber', 0.5);
}

/** Pair of named wheels at z (x = ±x). */
function axle(k, rig, l, r, pos, rad, w, style, xf) {
  addWheel(k, rig, l, [xf, pos[1] ?? rad, pos[0]], rad, w, 1, style);
  addWheel(k, rig, r, [-xf, pos[1] ?? rad, pos[0]], rad, w, -1, style);
}

// ═════════════════════════════════════════════════════════════════════════════
// STREETCAR — Old Town tram, cream + maroon, single-arm pantograph (~14 × 2.6 × 4.6)
// ═════════════════════════════════════════════════════════════════════════════
export function buildStreetcar(variant = 0) {
  const g = root('streetcar', variant, { w: 2.6, h: 4.6, l: 14 });
  const k = new Kit(4100 + variant);
  const rig = vrig();
  const cream = '#e6dcc0', maroon = variant === 1 ? '#3f5f4a' : '#7a2e2a', gold = PAL.rvMustard, frameC = '#4a3426';
  const hw = 1.3, zs = 5.7, ze = 6.98, y0 = 0.62, yb = 1.4, yt = 2.78;
  const plan = [[hw, zs], [1.05, 6.62], [0.55, ze], [-0.55, ze], [-1.05, 6.62], [-hw, zs], [-hw, -zs], [-1.05, -6.62], [-0.55, -ze], [0.55, -ze], [1.05, -6.62]];
  // body: maroon lower, cream upper, maroon roof edge, clerestory
  k.extrude(maroon, plan, yb - y0, { axis: 'y', pos: [0, y0, 0] });
  k.extrude(cream, plan, yt - yb, { axis: 'y', pos: [0, yb, 0] });
  k.extrude(shade(maroon, 0.8), plan.map(([x, z]) => [x * 1.02, z * 1.003]), 0.12, { axis: 'y', pos: [0, yt, 0] });
  k.box('#8c8478', [2.1, 0.12, 12.4], [0, yt + 0.18, 0], { taper: [0.9, 0.99] });
  k.box(cream, [1.3, 0.26, 9.0], [0, yt + 0.37, 0], { c: 0.04 });
  k.box('#77706a', [1.45, 0.06, 9.2], [0, yt + 0.53, 0]);
  for (let i = 0; i < 9; i++) for (const s of [1, -1]) k.rectX(PAL.glass, s * 0.65, [-4.0 + i * 1.0, -3.65 + i * 1.0], [yt + 0.29, yt + 0.44], s);
  // gold pinstripes + waist rail
  for (const y of [yb - 0.02, y0 + 0.12]) k.side(gold, hw, [[-zs, y], [zs, y], [zs, y + 0.035], [-zs, y + 0.035]], { off: 0.014 });
  k.side(shade(cream, 0.85), hw, [[-zs, yb], [zs, yb], [zs, yb + 0.06], [-zs, yb + 0.06]], { off: 0.014 });
  // side windows (8 per side; −X side has doors near both ends)
  const wy0 = 1.62, wy1 = 2.52;
  for (const s of [1, -1]) {
    for (let i = 0; i < 8; i++) {
      const zc = -4.55 + i * 1.3;
      if (s < 0 && (i === 0 || i === 7)) continue;
      k.side(frameC, hw, [[zc - 0.56, wy0 - 0.06], [zc + 0.56, wy0 - 0.06], [zc + 0.56, wy1 + 0.06], [zc - 0.56, wy1 + 0.06]], { side: s, off: 0.014 });
      k.side(PAL.glass, hw, [[zc - 0.5, wy0], [zc + 0.5, wy0], [zc + 0.5, wy1 - 0.24], [zc - 0.5, wy1 - 0.24]], { side: s, off: 0.02 });
      k.side(shade(PAL.glass, 1.15), hw, [[zc - 0.5, wy1 - 0.2], [zc + 0.5, wy1 - 0.2], [zc + 0.5, wy1], [zc - 0.5, wy1]], { side: s, off: 0.02 });
      k.side(PAL.glassHi, hw, [[zc + 0.05, wy0 + 0.05], [zc + 0.14, wy0 + 0.05], [zc + 0.28, wy1 - 0.3], [zc + 0.19, wy1 - 0.3]], { side: s, off: 0.024 });
    }
    sideBlob(k, mix(maroon, PAL.dirt, 0.4), hw, s * 3.0, 0.8, 0.5, 0.12, 410 + s, s, 0.02);
  }
  // folding doors on −X near both ends
  for (const zc of [-4.55, 4.55]) {
    k.side('#2a2522', hw, [[zc - 0.62, y0 + 0.02], [zc + 0.62, y0 + 0.02], [zc + 0.62, wy1 + 0.08], [zc - 0.62, wy1 + 0.08]], { side: -1, off: 0.016 });
    for (const dz of [-0.3, 0.3]) {
      k.side(maroon, hw, [[zc + dz - 0.27, y0 + 0.06], [zc + dz + 0.27, y0 + 0.06], [zc + dz + 0.27, wy1 + 0.04], [zc + dz - 0.27, wy1 + 0.04]], { side: -1, off: 0.02 });
      k.side(PAL.glass, hw, [[zc + dz - 0.2, 1.25], [zc + dz + 0.2, 1.25], [zc + dz + 0.2, wy1 - 0.04], [zc + dz - 0.2, wy1 - 0.04]], { side: -1, off: 0.024 });
    }
    k.box('#4b4c4e', [0.3, 0.06, 1.2], [-hw - 0.12, 0.42, zc]);
  }
  // ends: three-pane windshield, headlamp, destination box, bumper, lifeguard tray
  for (const e of [1, -1]) {
    const P = plan.slice(0, 6).map(([x, z]) => [x, z * e]);
    const faces = [[P[1], P[2]], [P[2], P[3]], [P[3], P[4]]];
    for (const [a, b] of faces) {
      facePane(k, frameC, a, b, [0.04, 0.96], [1.5, 2.56], 0.012);
      facePane(k, PAL.glass, a, b, [0.1, 0.9], [1.58, 2.48], 0.02);
    }
    facePane(k, PAL.glassHi, P[2], P[3], [0.62, 0.7], [1.65, 2.4], 0.026);
    k.cyl(PAL.chrome, 0.15, 0.15, 0.08, [0, 1.05, e * (ze + 0.02)], { axis: 'z', seg: 8 });
    k.cyl(PAL.headlight, 0.11, 0.11, 0.02, [0, 1.05, e * (ze + 0.07)], { axis: 'z', seg: 8 });
    k.box('#1f1f20', [1.1, 0.3, 0.12], [0, yt - 0.06, e * (ze - 0.02)]);
    k.box('#2b2b2c', [1.5, 0.16, 0.22], [0, y0 + 0.02, e * (ze + 0.02)], { c: 0.04 });
    for (let i = 0; i < 5; i++) k.box('#3a3a3c', [1.5, 0.04, 0.05], [0, 0.3, e * (ze + 0.1 + i * 0.09)]);
    for (const s of [1, -1]) {
      k.box(PAL.taillight, [0.12, 0.1, 0.04], [s * 0.42, y0 + 0.24, e * (ze + 0.01)]);
      k.box(gold, [0.04, 0.9, 0.04], [s * 0.6, 1.95, e * 6.92]);
    }
  }
  // bogies + under-frame
  k.box(PAL.under, [2.0, 0.22, 11.0], [0, 0.55, 0]);
  const bz = 4.35, ax = 0.78, wr = 0.34, gx = 0.72;
  for (const z of [bz, -bz]) {
    k.box('#2a2a2b', [1.9, 0.3, 2.3], [0, 0.45, z], { c: 0.04 });
    for (const s of [1, -1]) {
      k.box('#343436', [0.08, 0.3, 2.2], [s * 0.86, 0.36, z]);
      k.cyl('#4a4a4a', 0.07, 0.07, 0.24, [s * 0.86, 0.6, z], { seg: 6 });
    }
  }
  // pantograph (single arm) on a roof frame; pivot at the base hinge
  const py = yt + 0.56;
  for (const s of [1, -1]) for (const z of [-0.9, 0.5]) k.cyl('#d9d4c6', 0.05, 0.06, 0.16, [s * 0.4, py + 0.08, z], { seg: 6 });
  k.box('#3a3b3d', [0.95, 0.06, 1.6], [0, py + 0.18, -0.2]);
  const ph = [0, py + 0.24, -0.7];
  const pi = rig.add('pantograph', ph, 'body');
  k.withBone(pi, () => {
    const knee = [0, py + 0.95, 0.55], top = [0, py + 1.62, -0.2];
    for (const s of [1, -1]) beam(k, '#5a5c5f', [s * 0.28, ph[1], ph[2]], [s * 0.05, knee[1], knee[2]], 0.05, 0.05);
    beam(k, '#5a5c5f', [-0.28, ph[1], ph[2]], [0.28, ph[1], ph[2]], 0.05, 0.05);
    beam(k, '#5a5c5f', knee, top, 0.045, 0.045);
    beam(k, '#5a5c5f', [0, ph[1] + 0.1, ph[2] + 0.15], [0, knee[1] - 0.15, knee[2] - 0.1], 0.025, 0.025);
    beam(k, '#3e3f41', [-0.85, top[1], top[2]], [0.85, top[1], top[2]], 0.06, 0.05);
    for (const s of [1, -1]) beam(k, '#3e3f41', [s * 0.85, top[1], top[2]], [s * 1.0, top[1] - 0.14, top[2]], 0.05, 0.05);
    beam(k, '#b7b2a6', [-0.6, top[1] + 0.035, top[2]], [0.6, top[1] + 0.035, top[2]], 0.04, 0.025);
  });
  // wheels: two bogies × two axles
  const rw = railWheelGeo(wr, 0.12);
  const W = (n, x, z) => addWheelGeo(k, rig, n, [x, wr + 0.05, z], rw, x > 0 ? 1 : -1);
  W('wheel_fl', gx, bz + ax); W('wheel_fr', -gx, bz + ax); W('wheel_fl2', gx, bz - ax); W('wheel_fr2', -gx, bz - ax);
  W('wheel_rl', gx, -bz + ax); W('wheel_rr', -gx, -bz + ax); W('wheel_rl2', gx, -bz - ax); W('wheel_rr2', -gx, -bz - ax);
  const bones = finish(g, k, rig);
  const dest = textTex('tram_dest', 'OLD TOWN', { w: 512, h: 96, bg: '#151515', fg: '#f0b23a', size: 0.7, weather: false });
  addSign(bones.body, dest, 0.98, 0.22, [0, yt - 0.06, ze + 0.045], [0, 0, 0], 'sign_dest_f', '#1f1f20');
  addSign(bones.body, dest, 0.98, 0.22, [0, yt - 0.06, -ze - 0.045], [0, Math.PI, 0], 'sign_dest_r', '#1f1f20');
  const line = textTex('tram_line_' + variant, 'OLD TOWN LINE  · 7 ·', { w: 768, h: 96, bg: maroon, fg: gold, size: 0.62, maxW: 0.92 });
  sideSigns(bones.body, line, 3.4, 0.42, hw + 0.022, 1.0, 0, 'sign_line', maroon);
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// CAR CARRIER — cab-over tractor + two-deck trailer with 6 droppable cars (~17 × 2.6 × 4.3)
// ═════════════════════════════════════════════════════════════════════════════
export function buildCarCarrier(variant = 0) {
  const g = root('car_carrier', variant, { w: 2.6, h: 4.3, l: 17.0 });
  const k = new Kit(4200 + variant);
  const rig = vrig();
  const cabC = variant === 1 ? '#a8462f' : '#3f5f7f', steel = variant === 1 ? '#c9c5b6' : '#d6c08a', dark = '#2a2b2d';
  const cab = flatCab(k, { z0: 5.95, color: cabC, len: 2.3, H: 3.15 });
  k.box(shade(cabC, 0.9), [2.3, 0.4, 0.8], [0, 3.15, 6.45], { c: 0.1, base: true, taper: [0.92, 0.6], shear: [0, -0.15] });
  // tractor chassis, tanks, stacks, fifth wheel
  k.box(PAL.under, [1.1, 0.32, 5.4], [0, 0.62, 5.3]);
  for (const s of [1, -1]) {
    k.cyl(PAL.chrome, 0.27, 0.27, 1.1, [s * 1.05, 0.62, 5.2], { axis: 'z', seg: 9 });
    k.cyl(PAL.chrome, 0.08, 0.08, 2.6, [s * 1.12, 2.0, 5.8], { seg: 7 });
    k.cyl('#2b2a28', 0.085, 0.085, 0.1, [s * 1.12, 3.32, 5.8], { seg: 7 });
  }
  k.box('#1d1d1e', [1.2, 0.12, 1.1], [0, 1.18, 4.35]);
  // ── trailer frame ────────────────────────────────────────────────────────
  const zt0 = -8.5, zt1 = 3.0, yL = 1.2, yU = 2.85, hw = 1.22;
  for (const y of [yL, yU]) {
    for (const s of [1, -1]) {
      k.box(steel, [0.12, 0.22, zt1 - zt0], [s * hw, y - 0.06, (zt0 + zt1) / 2]);
      k.box(shade(steel, 0.75), [0.42, 0.06, zt1 - zt0], [s * 0.62, y, (zt0 + zt1) / 2]);       // wheel tracks
      for (let i = 0; i < 26; i++) k.rectY(shade(steel, 0.6), y + 0.03, [s * 0.62 - 0.21, s * 0.62 + 0.21], [zt0 + 0.18 + i * 0.44, zt0 + 0.23 + i * 0.44]);
    }
    for (let i = 0; i < 7; i++) k.box(dark, [2.3, 0.08, 0.1], [0, y - 0.1, zt0 + 0.3 + i * 1.85]);
  }
  // posts, diagonal rams, top rails
  const posts = [-8.4, -5.0, -1.3, 2.4];
  for (const z of posts) for (const s of [1, -1]) k.box(steel, [0.14, yU - yL + 0.5, 0.14], [s * hw, (yL + yU) / 2 + 0.05, z]);
  for (let i = 0; i < posts.length - 1; i++) for (const s of [1, -1]) {
    tube(k, PAL.chrome, [s * (hw + 0.02), yL + 0.15, posts[i] + 0.3], [s * (hw + 0.02), yU - 0.2, posts[i + 1] - 0.3], 0.05, 0.05, 6);
    beam(k, steel, [s * hw, yU + 0.32, posts[i]], [s * hw, yU + 0.32, posts[i + 1]], 0.07, 0.07);
  }
  // gooseneck to the fifth wheel, lower-deck nose
  for (const s of [1, -1]) {
    beam(k, steel, [s * 0.5, yL - 0.06, zt1], [s * 0.5, 1.35, 4.6], 0.18, 0.24);
    beam(k, steel, [s * hw, yU, zt1 - 0.6], [s * 0.6, yU - 0.4, 5.1], 0.14, 0.18);
  }
  k.box(steel, [1.4, 0.24, 1.0], [0, 1.35, 4.4]);
  // trailer bogie, mud flaps, lights, underride
  k.box(dark, [1.6, 0.3, 2.6], [0, 0.95, -6.7]);
  for (const s of [1, -1]) {
    k.box('#1a1a1a', [0.04, 0.45, 0.3], [s * 1.05, 0.45, -7.95]);
    k.box(PAL.taillight, [0.2, 0.1, 0.05], [s * 1.05, yL - 0.12, zt0 - 0.05]);
  }
  k.box('#c4402e', [2.2, 0.12, 0.08], [0, 0.55, zt0 + 0.05]);
  hazardStripes(k, zt0 - 0.002, -1.2, 1.2, yL - 0.18, yL - 0.08, -1, '#d8d6cc', PAL.red, 8);
  // ── ramp (stowed upright at the rear of the lower deck) ─────────────────
  const rIdx = rig.add('ramp', [0, yL, zt0 - 0.06], 'body');
  k.withBone(rIdx, () => {
    for (const s of [1, -1]) {
      k.box(steel, [0.42, 2.3, 0.06], [s * 0.62, yL + 1.15, zt0 - 0.06]);
      for (let i = 0; i < 9; i++) k.box(shade(steel, 0.6), [0.42, 0.04, 0.03], [s * 0.62, yL + 0.15 + i * 0.25, zt0 - 0.1]);
      k.box(shade(steel, 0.7), [0.06, 2.3, 0.1], [s * 0.86, yL + 1.15, zt0 - 0.06]);
    }
  });
  // ── cargo: six small cars, each its own pivot ───────────────────────────
  const cols = variant === 1
    ? [PAL.civ[1], '#e2dccb', PAL.civ[3], '#2a2c30', PAL.civ[0], PAL.civ[2]]
    : [PAL.civ[0], PAL.civ[4], '#e2dccb', PAL.civ[1], PAL.civ[5], PAL.civ[3]];
  const slots = [[yU, -6.55], [yU, -2.75], [yU, 1.05], [yL, -6.55], [yL, -2.75], [yL, 1.05]];
  slots.forEach(([y, z], i) => {
    const ci = rig.add(`cargo_${i}`, [0, y + 0.04, z], 'body');
    k.withBone(ci, () => k.at([0, y + 0.04, z], () => miniCar(k, cols[i], { hatch: i % 2 === 1, roof: i === 2 ? '#2a2c30' : undefined })));
  });
  // ── wheels ──────────────────────────────────────────────────────────────
  axle(k, rig, 'wheel_fl', 'wheel_fr', [cab.zw], 0.5, 0.3, 'chrome', 1.08);
  axle(k, rig, 'wheel_rl', 'wheel_rr', [4.75], 0.5, 0.36, 'steel', 1.12);
  axle(k, rig, 'wheel_rl2', 'wheel_rr2', [3.65], 0.5, 0.36, 'steel', 1.12);
  axle(k, rig, 'wheel_tl', 'wheel_tr', [-6.15], 0.48, 0.36, 'steel', 1.12);
  axle(k, rig, 'wheel_tl2', 'wheel_tr2', [-7.25], 0.48, 0.36, 'steel', 1.12);
  arch(k, 1.225, cab.zw, 0.5, 0.6, 0.75, '#1a1a1b');
  finish(g, k, rig);
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// WIDE LOAD — v0 flatbed hauling a whole one-storey house; v1 the escort pickup.
// ═════════════════════════════════════════════════════════════════════════════
function wideLoadTex() { return textTex('wide_load', 'WIDE LOAD', { w: 512, h: 112, bg: '#e8c23a', fg: '#151515', border: '#151515', bw: 8, inset: 4, size: 0.66 }); }
function oversizeTex() { return textTex('oversize_load', 'OVERSIZE LOAD', { w: 640, h: 128, bg: '#e8c23a', fg: '#151515', border: '#151515', bw: 9, inset: 5, size: 0.62 }); }

export function buildWideLoad(variant = 0) {
  return variant % 2 === 1 ? buildEscort() : buildHouseHauler();
}

function buildHouseHauler() {
  const g = root('wide_load', 0, { w: 4.5, h: 5.0, l: 16.8 });
  const k = new Kit(4300);
  const rig = vrig();
  const cabC = '#c9852f';
  const cab = longNoseCab(k, { z0: 3.6, color: cabC, bumper: '#2b2c2e' });
  // trailer deck + gooseneck
  const dy = 1.15, z0 = -8.4, z1 = 1.0;
  k.box('#3a3b3d', [2.6, 0.22, z1 - z0], [0, dy - 0.11, (z0 + z1) / 2]);
  k.box('#2c2d2f', [2.6, 0.3, 1.9], [0, 1.45, 2.0]);
  beam(k, '#3a3b3d', [0, dy, z1], [0, 1.45, 1.4], 2.6, 0.22, { hint: [0, 1, 0] });
  k.box(PAL.under, [1.1, 0.3, 2.6], [0, 0.65, 1.9]);
  for (const s of [1, -1]) {
    k.box('#c4402e', [0.06, 0.08, z1 - z0], [s * 1.31, dy - 0.05, (z0 + z1) / 2]);
    k.box(PAL.taillight, [0.2, 0.1, 0.05], [s * 1.1, dy - 0.1, z0 - 0.03]);
    k.box('#1a1a1a', [0.04, 0.42, 0.3], [s * 1.0, 0.45, -8.1]);
  }
  k.box('#2a2a2b', [1.6, 0.3, 2.6], [0, 0.85, -7.1]);
  // house on steel beams + cribbing
  const hz0 = -8.1, hz1 = 0.5, hwid = 4.4, hhw = hwid / 2, fy = 1.62, ey = 4.0, ry = 4.95;
  const hzc = (hz0 + hz1) / 2, hl = hz1 - hz0;
  for (const s of [1, -1]) k.box('#2b2c2e', [0.2, 0.3, hl + 0.6], [s * 0.85, dy + 0.15, hzc]);
  for (let i = 0; i < 6; i++) k.box(PAL.woodLight, [hwid + 0.2, 0.16, 0.22], [0, dy + 0.38, hz0 + 0.4 + i * 1.55]);
  const siding = '#8fa3ad', trim = '#e8e4d8', roofC = '#6b5a4c';
  k.box(siding, [hwid, ey - fy, hl], [0, (fy + ey) / 2, hzc]);
  for (let i = 0; i < 11; i++) k.side(shade(siding, 0.86), hhw, [[hz0, fy + 0.15 + i * 0.21], [hz1, fy + 0.15 + i * 0.21], [hz1, fy + 0.17 + i * 0.21], [hz0, fy + 0.17 + i * 0.21]], { off: 0.012 });
  for (const s of [1, -1]) for (const z of [hz0 + 0.06, hz1 - 0.06]) k.box(trim, [0.1, ey - fy, 0.1], [s * (hhw - 0.02), (fy + ey) / 2, z]);
  // gable roof (ridge along Z), eaves overhang
  k.extrude(roofC, [[-hhw - 0.35, ey - 0.08], [hhw + 0.35, ey - 0.08], [0.0, ry]], hl + 0.5, { axis: 'z', pos: [0, 0, hzc] });
  k.extrude(trim, [[-hhw, ey], [hhw, ey], [0, ry - 0.12]], 0.06, { axis: 'z', pos: [0, 0, hz1 + 0.02] });
  k.extrude(trim, [[-hhw, ey], [hhw, ey], [0, ry - 0.12]], 0.06, { axis: 'z', pos: [0, 0, hz0 - 0.02] });
  for (let i = 0; i < 4; i++) for (const s of [1, -1]) {
    const t = (i + 1) / 5;
    const y = lerp(ey - 0.08, ry, t), x = lerp(hhw + 0.35, 0, t);
    k.poly(shade(roofC, 0.82), [[s * x, y, hz0 - 0.24], [s * x, y, hz1 + 0.24], [s * (x - 0.08), y + 0.03, hz1 + 0.24], [s * (x - 0.08), y + 0.03, hz0 - 0.24]], { facing: [s * 0.6, 1, 0], off: 0.01 });
  }
  k.box(siding, [0.5, 0.5, 0.06], [0, ry - 0.55, hz1 + 0.06]);
  for (let i = 0; i < 4; i++) k.box(shade(siding, 0.7), [0.42, 0.03, 0.02], [0, ry - 0.72 + i * 0.1, hz1 + 0.1]);
  // windows + door (+X), windows (−X), plastic sheeting over the rear wall
  const win = (s, zc, w = 1.0) => {
    k.side(trim, hhw, [[zc - w / 2 - 0.08, 2.15], [zc + w / 2 + 0.08, 2.15], [zc + w / 2 + 0.08, 3.4], [zc - w / 2 - 0.08, 3.4]], { side: s, off: 0.014 });
    k.side(PAL.glass, hhw, [[zc - w / 2, 2.23], [zc + w / 2, 2.23], [zc + w / 2, 3.32], [zc - w / 2, 3.32]], { side: s, off: 0.02 });
    k.side(trim, hhw, [[zc - 0.025, 2.23], [zc + 0.025, 2.23], [zc + 0.025, 3.32], [zc - 0.025, 3.32]], { side: s, off: 0.024 });
    k.side('#3f5a48', hhw, [[zc - w / 2 - 0.4, 2.15], [zc - w / 2 - 0.1, 2.15], [zc - w / 2 - 0.1, 3.4], [zc - w / 2 - 0.4, 3.4]], { side: s, off: 0.016 });
    k.side('#3f5a48', hhw, [[zc + w / 2 + 0.1, 2.15], [zc + w / 2 + 0.4, 2.15], [zc + w / 2 + 0.4, 3.4], [zc + w / 2 + 0.1, 3.4]], { side: s, off: 0.016 });
  };
  win(1, -6.2); win(1, -0.9); win(-1, -5.6); win(-1, -2.6); win(-1, -0.4, 0.7);
  k.side(trim, hhw, [[-3.9, 1.7], [-2.9, 1.7], [-2.9, 3.6], [-3.9, 3.6]], { side: 1, off: 0.014 });
  k.side('#7a3a30', hhw, [[-3.82, 1.72], [-2.98, 1.72], [-2.98, 3.52], [-3.82, 3.52]], { side: 1, off: 0.02 });
  k.side(PAL.glass, hhw, [[-3.62, 3.0], [-3.18, 3.0], [-3.18, 3.36], [-3.62, 3.36]], { side: 1, off: 0.024 });
  k.box(PAL.chrome, [0.04, 0.05, 0.05], [hhw + 0.03, 2.6, -3.1]);
  k.front('#cfd3d2', hz0 - 0.002, [[-hhw, fy], [hhw, fy], [hhw, ey], [-hhw, ey]], -1, { off: 0.012 });
  for (let i = 0; i < 6; i++) k.front('#b9bdbd', hz0 - 0.002, [[-hhw + 0.2 + i * 0.75, fy], [-hhw + 0.32 + i * 0.75, fy], [-hhw + 0.45 + i * 0.75, ey], [-hhw + 0.33 + i * 0.75, ey]], -1, { off: 0.016 });
  k.front(trim, hz1 + 0.002, [[-hhw, fy], [hhw, fy], [hhw, fy + 0.12], [-hhw, fy + 0.12]], 1, { off: 0.012 });
  k.front(PAL.glass, hz1, [[-1.2, 2.3], [-0.3, 2.3], [-0.3, 3.3], [-1.2, 3.3]], 1, { off: 0.016 });
  // red corner flags on the overhang
  for (const s of [1, -1]) for (const z of [hz0 + 0.1, hz1 - 0.1]) {
    k.box('#2a2a2b', [0.03, 0.7, 0.03], [s * (hhw + 0.06), ey + 0.25, z]);
    k.box('#d0402e', [0.02, 0.32, 0.4], [s * (hhw + 0.06), ey + 0.42, z - 0.2]);
  }
  // wheels
  axle(k, rig, 'wheel_fl', 'wheel_fr', [cab.zw], 0.5, 0.3, 'chrome', 0.93);
  axle(k, rig, 'wheel_rl', 'wheel_rr', [2.45], 0.5, 0.36, 'steel', 1.08);
  axle(k, rig, 'wheel_rl2', 'wheel_rr2', [1.35], 0.5, 0.36, 'steel', 1.08);
  axle(k, rig, 'wheel_tl', 'wheel_tr', [-6.6], 0.48, 0.36, 'steel', 1.08);
  axle(k, rig, 'wheel_tl2', 'wheel_tr2', [-7.65], 0.48, 0.36, 'steel', 1.08);
  const bones = finish(g, k, rig);
  // amber beacons on the cab roof
  bones.body.add(amberLamps('light_amber', (lk) => { for (const s of [1, -1]) lk.cyl('#fff', 0.1, 0.11, 0.18, [s * 0.75, 3.19, 4.6], { seg: 8 }); }));
  g.userData.perInstanceMaterials = ['light_amber'];
  // WIDE LOAD banners: front bumper, rear of the house, rear of the trailer
  const t = wideLoadTex();
  addSign(bones.body, t, 1.7, 0.36, [0, 0.72, cab.zFront + 0.03], [0, 0, 0], 'sign_wide_front', '#e8c23a');
  addSign(bones.body, t, 2.8, 0.62, [0, 2.95, hz0 - 0.03], [0, Math.PI, 0], 'sign_wide_house', '#e8c23a');
  addSign(bones.body, t, 2.0, 0.42, [0, 0.82, z0 - 0.06], [0, Math.PI, 0], 'sign_wide_rear', '#e8c23a');
  return g;
}

function buildEscort() {
  const g = buildPickup(1);                     // the base kit's pickup, dusty mustard (v1)
  g.name = 'wide_load_1';
  g.userData.size = { w: 2.0, h: 2.45, l: 5.4 };
  const body = g.getObjectByName('body');
  const k = new Kit(4310);
  // roof rack + sign frame + bed-mounted flag poles
  const ry = 1.74;
  for (const s of [1, -1]) {
    k.box('#262729', [0.05, 0.06, 0.9], [s * 0.72, ry + 0.03, 0.05]);
    k.box('#262729', [0.04, 0.62, 0.04], [s * 0.78, ry + 0.34, -0.12]);
    k.box('#262729', [0.03, 1.2, 0.03], [s * 0.92, 1.6, -2.55]);
    k.box('#d0402e', [0.02, 0.3, 0.42], [s * 0.92, 2.05, -2.78]);
  }
  k.box('#262729', [1.62, 0.04, 0.04], [0, ry + 0.62, -0.12]);
  k.box('#262729', [1.62, 0.04, 0.04], [0, ry + 0.26, -0.12]);
  k.box('#1d1e21', [1.3, 0.08, 0.26], [0, ry + 0.09, 0.32], { c: 0.02 });
  const rack = k.mesh('escort_rack');
  body.add(rack);
  body.add(amberLamps('light_amber', (lk) => {
    for (const s of [1, -1]) lk.box('#fff', [0.5, 0.11, 0.24], [s * 0.36, ry + 0.18, 0.32]);
    lk.box('#fff', [0.18, 0.08, 0.05], [0, 0.98, 2.72]);
  }));
  g.userData.perInstanceMaterials = ['light_amber'];
  const t = oversizeTex();
  addSign(body, t, 1.6, 0.34, [0, ry + 0.44, -0.095], [0, 0, 0], 'sign_oversize_f', '#e8c23a');
  addSign(body, t, 1.6, 0.34, [0, ry + 0.44, -0.145], [0, Math.PI, 0], 'sign_oversize_r', '#e8c23a');
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// COMBINE HARVESTER — faded green (v0) / faded red (v1), reel spins (~9.4 × 5.6 × 4.0)
// ═════════════════════════════════════════════════════════════════════════════
export function buildCombine(variant = 0) {
  const g = root('combine', variant, { w: 5.6, h: 4.0, l: 9.4 });
  const k = new Kit(4400 + variant);
  const rig = vrig();
  const c = variant === 1 ? '#a84a35' : '#5f7f45', cHi = variant === 1 ? '#c25d45' : '#74935a', trim = variant === 1 ? '#d9cfb3' : '#d9a83a';
  const dust = '#b9a47a', dark = '#2b2b2c';
  const zo = -0.12; // shift so the footprint is centred
  // main body
  k.box(c, [2.4, 2.1, 5.2], [0, 1.85, -1.4 + zo], { c: 0.1 });
  k.box(shade(c, 0.85), [2.42, 0.18, 5.22], [0, 1.0, -1.4 + zo]);
  k.side(trim, 1.2, [[-3.9 + zo, 2.3], [1.1 + zo, 2.3], [1.1 + zo, 2.42], [-3.9 + zo, 2.42]], { off: 0.016 });
  for (let i = 0; i < 6; i++) k.side(shade(c, 0.7), 1.2, [[-3.7 + zo + i * 0.22, 1.3], [-3.6 + zo + i * 0.22, 1.3], [-3.6 + zo + i * 0.22, 2.1], [-3.7 + zo + i * 0.22, 2.1]], { off: 0.018 });
  k.side(mix(c, dust, 0.6), 1.2, [[-3.95 + zo, 0.85], [1.15 + zo, 0.85], [1.15 + zo, 1.25], [-3.95 + zo, 1.25]], { off: 0.016 });
  sideBlob(k, mix(c, dust, 0.5), 1.2, -2.3 + zo, 2.6, 0.6, 0.18, 441, 1);
  sideBlob(k, mix(c, PAL.rust, 0.6), 1.2, -0.5 + zo, 1.5, 0.15, 0.1, 442, -1);
  // engine deck + exhaust + rear spreader
  k.box(shade(c, 0.92), [2.0, 0.5, 1.6], [0, 3.15, -3.0 + zo], { c: 0.06 });
  for (let i = 0; i < 5; i++) k.box(dark, [1.7, 0.04, 0.08], [0, 3.42, -3.6 + zo + i * 0.28]);
  k.cyl('#3a3836', 0.09, 0.09, 0.9, [0.7, 3.8, -2.5 + zo], { seg: 7 });
  k.box(shade(c, 0.8), [2.2, 0.8, 0.6], [0, 1.2, -4.25 + zo], { c: 0.06, taper: [1, 0.7] });
  for (const s of [1, -1]) k.cyl(dark, 0.3, 0.3, 0.06, [s * 0.5, 0.9, -4.4 + zo], { seg: 8 });
  // grain tank (sloped sides) + folded unloading auger on +X
  k.box(cHi, [2.3, 0.85, 2.6], [0, 3.32, -0.8 + zo], { c: 0.08, taper: [1.12, 1.05], base: false });
  k.box(trim, [2.62, 0.08, 2.75], [0, 3.76, -0.8 + zo]);
  tube(k, cHi, [1.3, 3.0, -2.3 + zo], [1.35, 3.25, 1.8 + zo], 0.15, 0.15, 8);
  tube(k, dark, [1.35, 3.25, 1.8 + zo], [1.35, 3.0, 2.1 + zo], 0.13, 0.1, 8);
  k.box(dark, [0.12, 0.6, 0.12], [1.3, 2.75, 1.6 + zo]);
  // cab (glass box) on top front
  const cz = 1.45 + zo, cy0 = 2.35, cy1 = 3.75;
  k.box(c, [1.7, 0.35, 1.6], [0, cy0 + 0.05, cz], { c: 0.04 });
  for (const sx of [1, -1]) for (const z of [cz - 0.75, cz + 0.75]) k.box(dark, [0.07, cy1 - cy0 - 0.2, 0.07], [sx * 0.8, (cy0 + cy1) / 2 + 0.05, z]);
  const gl = '#3e4c54';
  k.box(gl, [1.55, 1.05, 0.02], [0, 3.1, cz + 0.76], { rot: [0.08, 0, 0] });
  k.box(gl, [1.55, 1.05, 0.02], [0, 3.1, cz - 0.76]);
  for (const sx of [1, -1]) k.box(gl, [0.02, 1.05, 1.45], [sx * 0.8, 3.1, cz]);
  k.box(PAL.glassHi, [0.2, 0.9, 0.02], [0.35, 3.1, cz + 0.79], { rot: [0.08, 0, 0] });
  k.box(shade(c, 1.05), [1.95, 0.14, 1.9], [0, cy1, cz], { c: 0.05 });
  k.box('#2b2b2c', [0.5, 0.5, 0.4], [0, 2.75, cz - 0.3]);   // seat silhouette
  for (const sx of [1, -1]) {
    k.box(PAL.amber, [0.12, 0.12, 0.12], [sx * 0.85, cy1 + 0.13, cz - 0.8]);
    k.box(PAL.headlight, [0.2, 0.1, 0.06], [sx * 0.5, cy1 + 0.0, cz + 0.97]);
    k.box('#2a2a2b', [0.4, 0.04, 0.04], [sx * 1.0, 3.2, cz + 0.7]);
    k.box('#2a2a2b', [0.05, 0.3, 0.18], [sx * 1.2, 3.2, cz + 0.7]);
  }
  // ladder (+X)
  for (const z of [cz - 0.9, cz - 0.55]) k.box(dark, [0.04, 1.8, 0.04], [1.32, 1.4, z]);
  for (let i = 0; i < 6; i++) k.box(dark, [0.04, 0.03, 0.38], [1.32, 0.6 + i * 0.3, cz - 0.72]);
  // feeder house down to the header
  beam(k, c, [0, 1.75, 0.9 + zo], [0, 0.95, 3.2 + zo], 1.3, 0.75, { hint: [0, 1, 0] });
  // header: back wall, floor, end panels, dividers, cutter bar, auger
  const hz = 3.65 + zo, hwid = 5.6, hh = hwid / 2;
  k.box(c, [hwid, 1.0, 0.12], [0, 0.85, hz - 0.55]);
  k.box(shade(c, 0.8), [hwid, 0.1, 1.2], [0, 0.32, hz], { rot: [0.08, 0, 0] });
  k.box('#262626', [hwid, 0.06, 0.12], [0, 0.28, hz + 0.62]);
  for (let i = 0; i < 40; i++) k.box('#8a8780', [0.04, 0.03, 0.12], [-hh + 0.07 + i * 0.14, 0.27, hz + 0.72]);
  for (const s of [1, -1]) {
    k.extrude(c, [[hz - 0.6, 0.3], [hz + 0.68, 0.24], [hz + 0.3, 0.9], [hz - 0.6, 1.35]], 0.08, { axis: 'x', pos: [s * (hh - 0.04), 0, 0] });
    k.cone(trim, 0.16, 0.7, [s * (hh - 0.1), 0.38, hz + 0.95], { rot: [Math.PI / 2, 0, 0], seg: 6 });
  }
  tube(k, shade(c, 1.1), [-hh + 0.15, 0.55, hz - 0.15], [hh - 0.15, 0.55, hz - 0.15], 0.22, 0.22, 8);
  for (let i = 0; i < 10; i++) k.box('#5a5a52', [0.06, 0.48, 0.06], [-hh + 0.4 + i * 0.53, 0.55, hz - 0.15], { rot: [i * 0.7, 0, 0] });
  k.top(mix(c, dust, 0.6), 0.39, [[-hh + 0.1, hz - 0.45], [hh - 0.1, hz - 0.45], [hh - 0.1, hz + 0.5], [-hh + 0.1, hz + 0.5]], { off: 0.01 });
  // reel arms from the header back up to the reel axle ends
  const rz = hz + 0.25, ryy = 1.5;
  for (const s of [1, -1]) beam(k, dark, [s * (hh - 0.3), 1.3, hz - 0.6], [s * (hh - 0.3), ryy, rz], 0.08, 0.08);
  const ri = rig.add('reel', [0, ryy, rz], 'body');
  k.withBone(ri, () => {
    tube(k, dark, [-hh + 0.2, ryy, rz], [hh - 0.2, ryy, rz], 0.06, 0.06, 6);
    for (const x of [-hh + 0.4, 0, hh - 0.4]) for (let j = 0; j < 6; j++) {
      const a = (j / 6) * Math.PI * 2;
      beam(k, '#4a4a46', [x, ryy, rz], [x, ryy + Math.sin(a) * 0.6, rz + Math.cos(a) * 0.6], 0.05, 0.05);
    }
    for (let j = 0; j < 6; j++) {
      const a = (j / 6) * Math.PI * 2 + 0.1;
      beam(k, trim, [-hh + 0.3, ryy + Math.sin(a) * 0.6, rz + Math.cos(a) * 0.6], [hh - 0.3, ryy + Math.sin(a) * 0.6, rz + Math.cos(a) * 0.6], 0.09, 0.05);
      for (const x of [-1.6, 0.8]) beam(k, '#77756e', [x, ryy + Math.sin(a) * 0.6, rz + Math.cos(a) * 0.6], [x, ryy + Math.sin(a) * 0.82 - 0.12, rz + Math.cos(a) * 0.72], 0.02, 0.02);
    }
  });
  // wheels: big drive wheels at the front, small steer wheels at the rear
  addWheel(k, rig, 'wheel_fl', [1.48, 0.85, 1.25 + zo], 0.85, 0.6, 1, 'tractor');
  addWheel(k, rig, 'wheel_fr', [-1.48, 0.85, 1.25 + zo], 0.85, 0.6, -1, 'tractor');
  addWheel(k, rig, 'wheel_rl', [1.1, 0.5, -3.3 + zo], 0.5, 0.34, 1, 'tractor');
  addWheel(k, rig, 'wheel_rr', [-1.1, 0.5, -3.3 + zo], 0.5, 0.34, -1, 'tractor');
  for (const s of [1, -1]) k.box(c, [0.7, 0.08, 1.7], [s * 1.45, 1.8, 1.25 + zo], { c: 0.03 });
  finish(g, k, rig);
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// LOGGING TRUCK — long-nose tractor + pole trailer, six loose logs + chains (~14.6 × 2.6 × 3.5)
// ═════════════════════════════════════════════════════════════════════════════
export function buildLoggingTruck(variant = 0) {
  const g = root('logging_truck', variant, { w: 2.6, h: 3.5, l: 14.6 });
  const k = new Kit(4500 + variant);
  const rig0 = vrig(), DZ = 0.95;            // authored with the cab at +Z; shifted to centre the footprint
  const rig = offsetRig(rig0, DZ);
  k.at([0, 0, DZ], () => logging(k, rig, variant));
  finish(g, k, rig0);
  return g;
}
function logging(k, rig, variant) {
  const cabC = variant === 1 ? '#d6c08a' : '#a8462f', steel = '#3a3b3d';
  const z0 = 1.5;
  const cab = longNoseCab(k, { z0, color: cabC, bumper: '#2b2c2e' });
  // headache rack behind the cab
  const hr = z0 - 0.3;
  for (const x of [-1.1, -0.37, 0.37, 1.1]) k.box(steel, [0.08, 2.6, 0.08], [x, 2.1, hr]);
  for (const y of [1.2, 2.0, 2.8, 3.38]) k.box(steel, [2.3, 0.08, 0.08], [0, y, hr]);
  // tractor bunk + reach pole + trailer bunk
  const by = 1.32;
  const bunks = [-0.2, -5.6];
  for (const bz of bunks) {
    k.box(steel, [2.5, 0.2, 0.3], [0, by - 0.1, bz]);
    for (const s of [1, -1]) {
      k.box(steel, [0.12, 1.5, 0.14], [s * 1.18, by + 0.75, bz]);
      k.box('#c4402e', [0.13, 0.06, 0.15], [s * 1.18, by + 1.45, bz]);
    }
  }
  k.box(PAL.under, [0.3, 0.26, 6.6], [0, 0.95, -2.9]);
  k.box(PAL.under, [1.0, 0.3, 3.0], [0, 0.72, -0.4]);
  k.box('#2a2a2b', [1.5, 0.3, 2.4], [0, 0.95, -5.6]);
  for (const s of [1, -1]) {
    k.box('#1a1a1a', [0.04, 0.42, 0.3], [s * 1.0, 0.45, -1.7]);
    k.box('#1a1a1a', [0.04, 0.42, 0.3], [s * 1.0, 0.45, -6.95]);
    k.box(PAL.taillight, [0.18, 0.1, 0.05], [s * 1.0, 1.05, -6.95]);
  }
  // logs: 3-2-1 stack, each its own pivot at its centre (axis along Z)
  const r = k.r;
  const bark = ['#6b5038', '#5e4632', '#735a40'], endC = '#c9a571', ring = '#a8834f';
  const rows = [[-0.74, 0], [0, 0], [0.74, 0], [-0.37, 1], [0.37, 1], [0, 2]];
  rows.forEach(([x, row], i) => {
    const rad = 0.34 + (r() - 0.5) * 0.06, len = 9.6 + (r() - 0.5) * 0.8, zc = -3.0 + (r() - 0.5) * 0.5;
    const y = by + 0.36 + row * 0.62;
    const li = rig.add(`log_${i}`, [x, y, zc], 'body');
    k.withBone(li, () => {
      k.cyl(bark[i % 3], rad, rad, len, [x, y, zc], { axis: 'z', seg: 8, thetaStart: (i * 0.3) % 1 });
      for (const e of [1, -1]) {
        const ze = zc + e * len / 2;
        const oct = (rr) => Array.from({ length: 8 }, (_, j) => { const a = (j / 8) * Math.PI * 2; return [x + Math.cos(a) * rr, y + Math.sin(a) * rr]; });
        k.front(endC, ze, oct(rad * 0.92), e, { off: 0.006 });
        k.front(ring, ze, oct(rad * 0.55), e, { off: 0.01 });
        k.front(endC, ze, oct(rad * 0.25), e, { off: 0.014 });
      }
      k.box(shade(bark[i % 3], 0.8), [0.1, 0.08, 0.14], [x + rad * 0.7, y + rad * 0.7, zc + 1.4]);
      if (i === 5) {  // red safety flag on the rear overhang
        k.box('#2a2a2b', [0.02, 0.4, 0.02], [x, y + rad + 0.2, zc - len / 2 + 0.3]);
        k.box('#d0402e', [0.02, 0.3, 0.38], [x, y + rad + 0.28, zc - len / 2 + 0.1]);
      }
    });
  });
  // binder chains over the stack (separate pivot so they can be hidden when the logs spill)
  const ci = rig.add('chains', [0, 3.3, -3.0], 'body');
  k.withBone(ci, () => {
    const chainPts = [[1.16, by + 0.05], [1.16, by + 0.65], [1.05, by + 1.15], [0.68, by + 1.6], [0.33, by + 2.0], [0, by + 2.12], [-0.33, by + 2.0], [-0.68, by + 1.6], [-1.05, by + 1.15], [-1.16, by + 0.65], [-1.16, by + 0.05]];
    for (const zc of [-1.0, -3.0, -5.0]) {
      polyBeam(k, '#1e1e1f', chainPts.map(([x, y]) => [x, y, zc]), 0.045);
      k.box('#5a5c5f', [0.06, 0.3, 0.08], [1.2, by + 0.45, zc], { rot: [0, 0, 0.3] });
    }
  });
  // wheels
  axle(k, rig, 'wheel_fl', 'wheel_fr', [cab.zw], 0.5, 0.3, 'chrome', 0.93);
  axle(k, rig, 'wheel_rl', 'wheel_rr', [0.35], 0.5, 0.36, 'steel', 1.08);
  axle(k, rig, 'wheel_rl2', 'wheel_rr2', [-0.75], 0.5, 0.36, 'steel', 1.08);
  axle(k, rig, 'wheel_tl', 'wheel_tr', [-5.05], 0.5, 0.36, 'steel', 1.08);
  axle(k, rig, 'wheel_tl2', 'wheel_tr2', [-6.15], 0.5, 0.36, 'steel', 1.08);
  grimeBand(k, 1.2, z0 + 0.05, z0 + 1.95, 0.75, mix(cabC, PAL.mud, 0.6), [], 451, 0.15);
}
