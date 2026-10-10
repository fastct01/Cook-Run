// ─────────────────────────────────────────────────────────────────────────────
// Expansion pack VEHICLES: town + oddballs
//   forklift, garbage_truck, news_van, parade_float, stagecoach, inflatable_gorilla
// ─────────────────────────────────────────────────────────────────────────────
import {
  THREE, Kit, Rig, root, empty, PAL, mix, shade, addWheel, edgeQuad, sideBlob, arch, lerp, signTexture,
  vrig, finish, beam, tube, polyBeam, frameBox, figure, lampMesh, textTex, addSign, sideSigns, addWheelGeo, spokedWheelGeo,
  longNoseCab, flatCab, grimeBand, hazardStripes, fourWheels, carShell, carLamps, mirrors, doorSeams, handles,
} from './vehicles-common.js';

// ═════════════════════════════════════════════════════════════════════════════
// FORKLIFT — dock forklift; `forks` raises via position.y (0 … 1.6) (~3.3 × 1.2 × 2.2)
// ═════════════════════════════════════════════════════════════════════════════
export function buildForklift(variant = 0) {
  const g = root('forklift', variant, { w: 1.2, h: 2.2, l: 3.3 });
  const k = new Kit(5100 + variant);
  const rig = vrig();
  const c = variant === 1 ? '#c96f3a' : '#d6a83a', dark = '#2b2b2c', cw = '#3a3b3e';
  const zo = -0.45;   // centre the footprint (fork tips → counterweight)
  // chassis + counterweight
  k.box(c, [1.1, 0.7, 1.6], [0, 0.55, 0.0 + zo], { c: 0.06 });
  k.box(cw, [1.14, 0.95, 0.55], [0, 0.65, -0.9 + zo], { c: 0.1 });
  k.cyl(cw, 0.48, 0.48, 1.14, [0, 0.62, -1.05 + zo], { axis: 'x', seg: 10 });
  hazardStripes(k, -1.53 + zo, -0.5, 0.5, 0.8, 1.0, -1, PAL.yellow, '#1f2022', 6);
  k.box(PAL.taillight, [0.12, 0.08, 0.04], [0.42, 1.0, -1.18 + zo]);
  k.box(PAL.taillight, [0.12, 0.08, 0.04], [-0.42, 1.0, -1.18 + zo]);
  k.side(mix(c, PAL.dirt, 0.5), 0.55, [[-0.8 + zo, 0.22], [0.8 + zo, 0.22], [0.8 + zo, 0.38], [-0.8 + zo, 0.38]], { off: 0.016 });
  sideBlob(k, PAL.rust, 0.55, 0.3 + zo, 0.7, 0.08, 0.05, 511, 1);
  // seat, controls, LPG bottle
  k.box('#1b1c1e', [0.5, 0.1, 0.45], [0, 0.95, -0.35 + zo], { c: 0.03 });
  k.box('#1b1c1e', [0.5, 0.45, 0.1], [0, 1.18, -0.6 + zo], { c: 0.03, rot: [-0.12, 0, 0] });
  beam(k, dark, [0, 0.9, 0.45 + zo], [0, 1.35, 0.25 + zo], 0.06, 0.06);
  k.cyl('#1d1d1d', 0.16, 0.16, 0.03, [0, 1.37, 0.23 + zo], { rot: [-0.9, 0, 0], seg: 8 });
  for (let i = 0; i < 3; i++) k.box(dark, [0.025, 0.25, 0.025], [0.12 + i * 0.07, 1.05, 0.58 + zo], { rot: [0.3, 0, 0] });
  k.cyl('#d9d6cc', 0.17, 0.17, 0.8, [0, 1.38, -0.95 + zo], { axis: 'x', seg: 8 });
  k.cyl('#a3a097', 0.06, 0.06, 0.1, [0.42, 1.38, -0.95 + zo], { axis: 'x', seg: 6 });
  // overhead guard
  for (const s of [1, -1]) {
    beam(k, dark, [s * 0.5, 0.9, -0.62 + zo], [s * 0.5, 2.1, -0.62 + zo], 0.07, 0.07);
    beam(k, dark, [s * 0.5, 0.9, 0.62 + zo], [s * 0.48, 2.1, 0.35 + zo], 0.07, 0.07);
  }
  k.box(dark, [1.06, 0.06, 1.1], [0, 2.12, -0.13 + zo]);
  for (let i = 0; i < 5; i++) k.box('#3c3d40', [0.04, 0.03, 1.06], [-0.4 + i * 0.2, 2.17, -0.13 + zo]);
  k.box(PAL.amber, [0.14, 0.12, 0.14], [0.36, 2.22, -0.6 + zo]);
  // mast (fixed uprights)
  const mz = 0.92 + zo;
  for (const s of [1, -1]) {
    k.box('#3e3f42', [0.09, 2.15, 0.14], [s * 0.36, 1.18, mz]);
    beam(k, PAL.chrome, [s * 0.25, 0.6, 0.5 + zo], [s * 0.3, 0.95, mz - 0.06], 0.06, 0.06);
  }
  for (const y of [0.3, 1.25, 2.2]) k.box('#3e3f42', [0.8, 0.08, 0.1], [0, y, mz]);
  tube(k, PAL.chrome, [0, 0.35, mz - 0.1], [0, 1.9, mz - 0.1], 0.05, 0.05, 6);
  // forks (carriage + tines + optional pallet load) — pivot at the carriage base
  const fi = rig.add('forks', [0, 0.1, mz + 0.1], 'body');
  k.withBone(fi, () => {
    k.box('#3b3c3f', [0.9, 0.42, 0.08], [0, 0.35, mz + 0.12]);
    for (let i = 0; i < 4; i++) k.box('#3b3c3f', [0.03, 0.55, 0.03], [-0.36 + i * 0.24, 0.85, mz + 0.12]);
    k.box('#3b3c3f', [0.9, 0.04, 0.04], [0, 1.12, mz + 0.12]);
    for (const s of [1, -1]) {
      k.box('#2f3033', [0.11, 0.42, 0.05], [s * 0.28, 0.32, mz + 0.18]);
      k.box('#2f3033', [0.11, 0.05, 1.05], [s * 0.28, 0.1, mz + 0.7]);
    }
    if (variant === 0) {
      const pz = mz + 0.72;
      for (const y of [0.15, 0.27]) for (let i = 0; i < 5; i++) k.box(PAL.woodLight, [1.0, 0.025, 0.12], [0, y, pz - 0.48 + i * 0.24]);
      for (const x of [-0.42, 0, 0.42]) k.box(PAL.wood, [0.1, 0.1, 1.0], [x, 0.21, pz]);
      const box = '#b38a5a';
      for (const [x, z, h] of [[-0.25, -0.24, 0.42], [0.25, -0.24, 0.42], [-0.25, 0.24, 0.42], [0.25, 0.24, 0.36], [0, 0, 0.32]]) {
        const yb = h === 0.32 ? 0.71 : 0.29;
        k.box(box, [0.46, h, 0.46], [x, yb + h / 2, pz + z], { c: 0.02 });
        k.box(shade(box, 0.8), [0.47, 0.04, 0.47], [x, yb + h * 0.7, pz + z]);
      }
      k.box('#c9d2d0', [1.0, 0.03, 1.0], [0, 0.72, pz]);
    }
  });
  // driver (hi-vis), part of the body
  figure(k, {
    hip: [0, 1.08, -0.3 + zo], lean: 0.05, skin: PAL.skin[2], top: PAL.hivis, sleeve: '#3c4a5a', bottom: '#3c4a5a', boots: '#3a2a20',
    head: { type: 'cap', color: '#d0402e', beard: PAL.hair[1] }, hands: [[0.14, 1.36, 0.18 + zo], [-0.12, 1.36, 0.25 + zo]],
    feet: [[0.15, 0.62, 0.3 + zo], [-0.15, 0.62, 0.3 + zo]], legHint: [0.2, 0.6, 0.8],
  });
  // wheels: front drive (bigger), rear steer
  addWheel(k, rig, 'wheel_fl', [0.43, 0.3, 0.52 + zo], 0.3, 0.26, 1, 'black');
  addWheel(k, rig, 'wheel_fr', [-0.43, 0.3, 0.52 + zo], 0.3, 0.26, -1, 'black');
  addWheel(k, rig, 'wheel_rl', [0.38, 0.24, -0.82 + zo], 0.24, 0.2, 1, 'black');
  addWheel(k, rig, 'wheel_rr', [-0.38, 0.24, -0.82 + zo], 0.24, 0.2, -1, 'black');
  finish(g, k, rig);
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// GARBAGE TRUCK — side loader; `lifter` arm on the kerb side (−X) (~9.2 × 3.0 × 3.4)
// ═════════════════════════════════════════════════════════════════════════════
export function buildGarbageTruck(variant = 0) {
  const g = root('garbage_truck', variant, { w: 3.0, h: 3.4, l: 9.2 });
  const k = new Kit(5200 + variant);
  const rig = vrig();
  const cabC = '#e2dccb', body = variant === 1 ? '#3f5f7f' : '#5d7b41', dark = '#2a2b2d';
  const cab = flatCab(k, { z0: 2.45, color: cabC, len: 2.05, H: 2.95, y0: 0.62, W: 2.45 });
  // municipal livery on the cab: body-colour lower band + pinstripe, sun visor, amber bar
  k.side(body, 1.225, [[2.5, 0.68], [4.45, 0.68], [4.45, 1.12], [2.5, 1.12]], { off: 0.02 });
  k.side(PAL.yellow, 1.225, [[2.5, 1.16], [4.45, 1.16], [4.45, 1.2], [2.5, 1.2]], { off: 0.02 });
  k.front(body, 4.55, [[-1.2, 0.68], [1.2, 0.68], [1.2, 0.95], [-1.2, 0.95]], 1, { off: 0.03 });
  k.box('#2a2b2d', [2.3, 0.06, 0.32], [0, 2.86, 4.42]);
  k.box('#1d1e21', [1.3, 0.1, 0.24], [0, 3.0, 3.6], { c: 0.02 });
  for (const s of [1, -1]) k.box(PAL.amber, [0.5, 0.11, 0.2], [s * 0.36, 3.08, 3.6]);
  // body box with rounded rear, ribs, hopper at the front
  const bz0 = -4.25, bz1 = 2.3, hw = 1.24, yb = 0.95, yt = 3.3;
  const prof = [[bz0, yb], [bz1 - 1.3, yb], [bz1 - 1.3, 1.6], [bz1, 1.6], [bz1, yt - 0.2], [bz1 - 0.2, yt], [bz0 + 0.5, yt], [bz0, yt - 0.4]];
  k.extrude(body, prof, hw * 2, { axis: 'x', bevel: 0.08 });
  k.box(dark, [2.2, 0.08, 1.1], [0, yt - 0.02, bz1 - 0.7]);            // hopper opening
  k.box('#1a1a1b', [2.0, 0.5, 1.0], [0, yt - 0.3, bz1 - 0.7]);
  for (let i = 0; i < 6; i++) k.side(shade(body, 0.8), hw, [[bz0 + 0.6 + i * 0.85, yb + 0.05], [bz0 + 0.68 + i * 0.85, yb + 0.05], [bz0 + 0.68 + i * 0.85, yt - 0.1], [bz0 + 0.6 + i * 0.85, yt - 0.1]], { off: 0.014 });
  k.side(PAL.white, hw, [[bz0 + 0.3, 2.0], [bz1 - 1.5, 2.0], [bz1 - 1.5, 2.12], [bz0 + 0.3, 2.12]], { off: 0.016 });
  for (const s of [1, -1]) {
    sideBlob(k, mix(body, PAL.dirt, 0.55), hw, -2.0, 1.25, 0.7, 0.2, 521 + s, s, 0.02);
    sideBlob(k, mix(body, '#3a3226', 0.5), hw, 0.2, 2.9, 0.12, 0.35, 523 + s, s, 0.022);
    sideBlob(k, PAL.rust, hw, bz0 + 0.3, 1.2, 0.1, 0.14, 525 + s, s, 0.024);
  }
  // tailgate (rear), hazard stripes, lights, steps
  k.box(shade(body, 0.92), [2.5, 2.2, 0.35], [0, 2.1, bz0 - 0.12], { c: 0.08 });
  hazardStripes(k, bz0 - 0.3, -1.2, 1.2, 1.05, 1.35, -1, PAL.yellow, '#1f2022', 8);
  for (const s of [1, -1]) {
    k.box(PAL.taillight, [0.18, 0.28, 0.05], [s * 1.08, 1.6, bz0 - 0.31]);
    k.box(PAL.amber, [0.14, 0.14, 0.14], [s * 1.1, yt + 0.07, bz0 + 0.25]);
    k.box('#4b4c4e', [0.5, 0.05, 0.3], [s * 0.85, 0.62, bz0 - 0.35]);
    beam(k, PAL.metal, [s * 1.18, 1.0, bz0 - 0.32], [s * 1.18, 2.6, bz0 - 0.32], 0.04, 0.04);
  }
  k.box(dark, [2.2, 0.2, 0.2], [0, 0.6, bz0 - 0.25]);
  k.box(PAL.under, [1.1, 0.32, 8.0], [0, 0.7, -0.5]);
  // lifter arm + gripper + bin (kerb side, −X); pivot near the top of the side
  const piv = [-hw - 0.08, 2.35, 1.55];
  const li = rig.add('lifter', piv, 'body');
  k.withBone(li, () => {
    k.box(dark, [0.2, 0.3, 0.3], [piv[0], piv[1], piv[2]], { c: 0.03 });
    beam(k, '#d9a83a', piv, [-hw - 0.2, 1.05, piv[2]], 0.16, 0.2);
    tube(k, PAL.chrome, [-hw - 0.06, 2.1, piv[2] + 0.18], [-hw - 0.16, 1.3, piv[2] + 0.18], 0.04, 0.04, 6);
    k.box(dark, [0.12, 0.2, 0.9], [-hw - 0.25, 0.95, piv[2]]);
    for (const s of [1, -1]) beam(k, dark, [-hw - 0.25, 0.95, piv[2] + s * 0.42], [-hw - 0.62, 0.9, piv[2] + s * 0.36], 0.06, 0.08);
    // green wheelie bin held in the claws
    const bx = -hw - 0.62, bc = '#3f6a3a';
    k.box(bc, [0.6, 0.95, 0.66], [bx, 0.55, piv[2]], { c: 0.03, taper: [1.08, 1.06] });
    k.box(shade(bc, 0.85), [0.68, 0.06, 0.72], [bx, 1.05, piv[2]]);
    k.cyl('#1d1d1d', 0.08, 0.08, 0.06, [bx - 0.28, 0.1, piv[2] + 0.22], { axis: 'x', seg: 6 });
    k.cyl('#1d1d1d', 0.08, 0.08, 0.06, [bx - 0.28, 0.1, piv[2] - 0.22], { axis: 'x', seg: 6 });
  });
  // wheels
  addWheel(k, rig, 'wheel_fl', [1.05, 0.5, cab.zw], 0.5, 0.3, 1, 'steel');
  addWheel(k, rig, 'wheel_fr', [-1.05, 0.5, cab.zw], 0.5, 0.3, -1, 'steel');
  addWheel(k, rig, 'wheel_rl', [1.08, 0.5, -1.95], 0.5, 0.36, 1, 'steel');
  addWheel(k, rig, 'wheel_rr', [-1.08, 0.5, -1.95], 0.5, 0.36, -1, 'steel');
  addWheel(k, rig, 'wheel_rl2', [1.08, 0.5, -3.05], 0.5, 0.36, 1, 'steel');
  addWheel(k, rig, 'wheel_rr2', [-1.08, 0.5, -3.05], 0.5, 0.36, -1, 'steel');
  for (const s of [1, -1]) k.box(dark, [0.4, 0.06, 2.4], [s * 1.08, 1.04, -2.5]);
  finish(g, k, rig);
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// NEWS VAN — "KDST 7 NEWS" (fictional station), raised mast + roof dish (~6.3 × 2.2 × 6.4)
// ═════════════════════════════════════════════════════════════════════════════
function newsTex() {
  return signTexture({
    key: 'xveh_kdst_side', w: 768, h: 192, bg: '#efece4',
    draw(ctx, w, h) {
      // red disc with a white 7, then KDST and NEWS
      ctx.fillStyle = '#b8352a'; ctx.beginPath(); ctx.arc(h * 0.52, h / 2, h * 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = h * 0.05; ctx.strokeStyle = '#1f3c6e'; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.floor(h * 0.62)}px "Arial Black","Arial Bold",Arial,sans-serif`; ctx.fillText('7', h * 0.52, h * 0.54);
      ctx.textAlign = 'left'; ctx.fillStyle = '#1f3c6e';
      ctx.font = `900 ${Math.floor(h * 0.5)}px "Arial Black","Arial Bold",Arial,sans-serif`; ctx.fillText('KDST', h * 1.08, h * 0.38);
      ctx.fillStyle = '#b8352a';
      ctx.font = `800 ${Math.floor(h * 0.34)}px "Arial Black","Arial Bold",Arial,sans-serif`; ctx.fillText('NEWS', h * 1.1, h * 0.78);
      ctx.fillStyle = '#1f3c6e'; ctx.font = `700 ${Math.floor(h * 0.17)}px Arial,Helvetica,sans-serif`; ctx.fillText('ON YOUR SIDE · LIVE', h * 2.45, h * 0.78);
    },
  });
}
export function buildNewsVan(variant = 0) {
  const g = root('news_van', variant, { w: 2.2, h: 6.4, l: 6.3 });
  const k = new Kit(5300 + variant);
  const rig = vrig();
  const white = '#efece4', blue = '#1f3c6e', red = '#b8352a', dark = '#2a2b2d';
  const W = 2.1, hw = W / 2;
  const prof = [[-3.05, 0.42], [2.95, 0.42], [3.08, 0.66], [3.05, 1.02], [2.78, 1.2], [2.15, 1.32], [1.58, 2.08], [1.66, 2.22], [1.5, 2.78], [-2.95, 2.8], [-3.08, 2.62]];
  k.extrude(white, prof, W, { axis: 'x', bevel: 0.09 });
  k.box(PAL.under, [W * 0.8, 0.18, 5.4], [0, 0.4, 0]);
  const wr = 0.4, zf = 2.05, zr = -1.85;
  arch(k, hw, zf, wr, wr + 0.09, 0.42, '#1a1a1b');
  arch(k, hw, zr, wr, wr + 0.09, 0.42, '#1a1a1b');
  // windshield + cab windows
  edgeQuad(k, '#262729', [2.15, 1.32], [1.58, 2.08], [-0.95, 0.95], [0.04, 0.96]);
  edgeQuad(k, PAL.glass, [2.15, 1.32], [1.58, 2.08], [-0.88, 0.88], [0.09, 0.91], 0.02);
  edgeQuad(k, PAL.glassHi, [2.15, 1.32], [1.58, 2.08], [0.25, 0.37], [0.15, 0.85], 0.024);
  k.side('#262729', hw, [[0.9, 1.28], [2.02, 1.28], [1.52, 2.0], [0.9, 2.0]], { off: 0.016 });
  k.side(PAL.glass, hw, [[0.95, 1.33], [1.94, 1.33], [1.48, 1.95], [0.95, 1.95]], { off: 0.022 });
  // livery: blue + red swoosh low on the flanks
  for (const s of [1, -1]) {
    k.side(blue, hw, [[-3.0, 0.48], [2.9, 0.48], [2.9, 0.78], [1.2, 0.86], [-0.5, 1.12], [-3.0, 1.5]], { side: s, off: 0.016 });
    k.side(red, hw, [[-3.0, 1.55], [-0.5, 1.17], [1.2, 0.91], [2.9, 0.83], [2.9, 0.9], [1.2, 0.99], [-0.5, 1.26], [-3.0, 1.66]], { side: s, off: 0.016 });
    k.side(mix(blue, PAL.dirt, 0.4), hw, [[-3.0, 0.48], [2.9, 0.48], [2.9, 0.6], [-3.0, 0.6]], { side: s, off: 0.02 });
    // generator vent + side door seam
    for (let i = 0; i < 5; i++) k.side('#3a3b3d', hw, [[-2.6, 2.1 + i * 0.08], [-1.9, 2.1 + i * 0.08], [-1.9, 2.13 + i * 0.08], [-2.6, 2.13 + i * 0.08]], { side: s, off: 0.02 });
  }
  k.side(shade(white, 0.75), hw, [[0.75, 0.5], [0.78, 0.5], [0.78, 2.6], [0.75, 2.6]], { off: 0.02 });
  k.side(shade(white, 0.75), hw, [[-0.6, 0.5], [-0.57, 0.5], [-0.57, 2.6], [-0.6, 2.6]], { side: -1, off: 0.02 });
  carLamps(k, { W, lights: { fz: 3.07, rz: -3.08, fy: 0.84, ry: 1.0, rx: 0.88 }, bumperY: 0.46 });
  mirrors(k, W, 1.6, 1.85, dark);
  // rear doors, ladder, cable reel
  k.front(shade(white, 0.75), -3.08, [[-0.012, 0.5], [0.012, 0.5], [0.012, 2.6], [-0.012, 2.6]], -1, { off: 0.012 });
  for (const x of [-0.85, -0.55]) k.box(PAL.metal, [0.04, 2.3, 0.04], [x, 1.7, -3.18]);
  for (let i = 0; i < 6; i++) k.box(PAL.metal, [0.3, 0.03, 0.03], [-0.7, 0.8 + i * 0.36, -3.18]);
  k.cyl('#3a3b3d', 0.3, 0.3, 0.22, [0.55, 1.2, -3.2], { axis: 'z', seg: 9 });
  k.cyl('#1d1d1e', 0.2, 0.2, 0.24, [0.55, 1.2, -3.2], { axis: 'z', seg: 9 });
  // roof: rails, equipment boxes, light cases
  for (const s of [1, -1]) k.box(PAL.metal, [0.05, 0.06, 4.0], [s * 0.95, 2.86, -0.8]);
  k.box('#c7c3b8', [0.9, 0.3, 0.7], [0.45, 2.95, 0.6], { c: 0.04 });
  k.box('#3a3b3d', [0.5, 0.2, 0.5], [-0.5, 2.92, 0.9], { c: 0.03 });
  // mast (telescoping, raised) at the rear-left
  const mx = 0.58, mzz = -2.35;
  const mi = rig.add('mast', [mx, 2.8, mzz], 'body');
  k.withBone(mi, () => {
    tube(k, '#d9d6cc', [mx, 2.8, mzz], [mx, 4.0, mzz], 0.11, 0.11, 8);
    tube(k, '#cfccc2', [mx, 4.0, mzz], [mx, 5.1, mzz], 0.085, 0.085, 8);
    tube(k, '#c5c2b8', [mx, 5.1, mzz], [mx, 6.0, mzz], 0.065, 0.065, 8);
    for (const y of [4.0, 5.1]) k.cyl(dark, 0.13, 0.13, 0.06, [mx, y, mzz], { seg: 8 });
    k.box(dark, [0.36, 0.22, 0.26], [mx, 6.08, mzz], { c: 0.03 });
    k.cyl('#e8e4d8', 0.26, 0.26, 0.1, [mx, 6.2, mzz + 0.2], { axis: 'z', seg: 10 });
    k.cyl(red, 0.27, 0.27, 0.02, [mx, 6.2, mzz + 0.26], { axis: 'z', seg: 10 });
    k.box('#e8d9a6', [0.16, 0.12, 0.08], [mx, 6.3, mzz - 0.12]);
  });
  // satellite dish on a turntable mount (raised, aimed up-left); `dish` pans with rotation.y
  const dp = [-0.25, 2.92, -1.4];
  const di = rig.add('dish', dp, 'body');
  k.withBone(di, () => {
    k.cyl(dark, 0.3, 0.34, 0.14, [dp[0], dp[1] + 0.07, dp[2]], { seg: 10 });
    beam(k, '#5a5c5f', [dp[0], dp[1] + 0.12, dp[2]], [dp[0] + 0.18, dp[1] + 0.55, dp[2]], 0.12, 0.12);
    const c = new THREE.Vector3(dp[0] + 0.25, dp[1] + 0.85, dp[2]);
    k.at([c.x, c.y, c.z], [0, 0, -0.75], () => {
      const bowl = [[0.001, 0], [0.3, 0.035], [0.55, 0.11], [0.78, 0.22]];
      k.lathe('#9a9a94', bowl, 14, [0, -0.03, 0]);                               // back
      k.lathe('#e8e4d8', bowl.slice().reverse(), 14, [0, -0.025, 0]);            // dish face
      k.cyl('#5a5c5f', 0.79, 0.79, 0.04, [0, 0.2, 0], { seg: 14, open: true });
      for (let j = 0; j < 3; j++) { const a = (j / 3) * Math.PI * 2; beam(k, '#5a5c5f', [Math.cos(a) * 0.7, 0.2, Math.sin(a) * 0.7], [0, 0.62, 0], 0.025, 0.025); }
      k.box('#3a3b3d', [0.12, 0.16, 0.12], [0, 0.66, 0]);
    });
  });
  addWheel(k, rig, 'wheel_fl', [hw - 0.12, wr, zf], wr, 0.26, 1, 'steel');
  addWheel(k, rig, 'wheel_fr', [-(hw - 0.12), wr, zf], wr, 0.26, -1, 'steel');
  addWheel(k, rig, 'wheel_rl', [hw - 0.12, wr, zr], wr, 0.26, 1, 'steel');
  addWheel(k, rig, 'wheel_rr', [-(hw - 0.12), wr, zr], wr, 0.26, -1, 'steel');
  const bones = finish(g, k, rig);
  sideSigns(bones.body, newsTex(), 2.9, 0.72, hw + 0.03, 2.1, -1.0, 'sign_kdst', white);
  addSign(bones.body, newsTex(), 1.3, 0.32, [0.35, 2.15, -3.09], [0, Math.PI, 0], 'sign_kdst_rear', white);
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// PARADE FLOAT — Founders' Day float on a flatbed truck. v0 papier-mâché prospector
// with mule; v1 giant papier-mâché saguaro. Flags flutter (`flag_*` rotation.y). (~12.6 × 3.0 × 6.4)
// ═════════════════════════════════════════════════════════════════════════════
function foundersTex() {
  return textTex('founders_day', ["FOUNDERS' DAY", 'EST. 1887 · PARADE'], { w: 768, h: 192, bg: '#efe2c4', fg: ['#9c3a2e', '#2f5f5a'], border: '#d9a83a', bw: 12, inset: 6, size: 0.82, subScale: 0.62 });
}
export function buildParadeFloat(variant = 0) {
  const g = root('parade_float', variant, { w: 3.0, h: 6.4, l: 12.6 });
  const k = new Kit(5400 + variant);
  const rig = vrig();
  const cab = longNoseCab(k, { z0: 1.6, color: '#2f5f5a', bumper: PAL.chrome, stacks: false });
  // platform deck + pleated skirt
  const dy = 1.3, z0 = -6.2, z1 = 1.5, hw = 1.5;
  k.box('#7a6a52', [hw * 2, 0.16, z1 - z0], [0, dy, (z0 + z1) / 2]);
  k.top('#8fa86a', dy + 0.08, [[-hw, z0], [hw, z0], [hw, z1], [-hw, z1]], { off: 0.004 });   // astroturf
  const pleat = ['#2f5f5a', '#d9a83a'];
  const nP = 26;
  for (const s of [1, -1]) for (let i = 0; i < nP; i++) {
    const za = lerp(z0, z1, i / nP), zb = lerp(z0, z1, (i + 1) / nP);
    k.poly(pleat[i % 2], [[s * hw, 0.25, za], [s * hw, 0.25, zb], [s * hw, dy + 0.06, zb], [s * hw, dy + 0.06, za]], { facing: [s, 0, 0], off: 0.01 + (i % 2) * 0.03 });
  }
  for (let i = 0; i < 10; i++) {
    const xa = lerp(-hw, hw, i / 10), xb = lerp(-hw, hw, (i + 1) / 10);
    k.poly(pleat[i % 2], [[xa, 0.25, z0], [xb, 0.25, z0], [xb, dy + 0.06, z0], [xa, dy + 0.06, z0]], { facing: [0, 0, -1], off: 0.01 + (i % 2) * 0.03 });
  }
  // bunting: scalloped triangles along the deck edge
  const bunt = ['#c8432e', '#efe2c4', '#d9a83a', '#2f5f5a'];
  for (const s of [1, -1]) for (let i = 0; i < 16; i++) {
    const za = lerp(z0, z1, i / 16) + 0.05, zb = lerp(z0, z1, (i + 1) / 16) - 0.05;
    k.poly(bunt[i % 4], [[s * hw, dy + 0.05, za], [s * hw, dy + 0.05, zb], [s * hw, dy - 0.28, (za + zb) / 2]], { facing: [s, 0, 0], off: 0.05 });
  }
  // corner poles + flags (flag_0..3 pivot at the pole top; rotation.y flaps)
  const poles = [[hw - 0.1, z1 - 0.1], [-hw + 0.1, z1 - 0.1], [hw - 0.1, z0 + 0.1], [-hw + 0.1, z0 + 0.1]];
  poles.forEach(([x, z], i) => {
    k.cyl('#d9d6cc', 0.035, 0.035, 2.6, [x, dy + 1.3, z], { seg: 6 });
    k.ico(PAL.rvMustard, 0.07, [x, dy + 2.63, z], { detail: 0 });
    const fi = rig.add(`flag_${i}`, [x, dy + 2.4, z], 'body');
    k.withBone(fi, () => {
      const fx = x, fy = dy + 2.4;
      k.box('#2f5f5a', [0.025, 0.5, 0.78], [fx, fy - 0.22, z - 0.4]);
      k.box(PAL.rvMustard, [0.03, 0.1, 0.78], [fx, fy - 0.22, z - 0.4]);
      k.cyl('#efe2c4', 0.11, 0.11, 0.035, [fx, fy - 0.22, z - 0.4], { axis: 'x', seg: 8 });
    });
  });
  // bunting strings from the centrepiece to the corner poles
  const top = [0, variant === 1 ? 5.2 : 5.3, -2.2];
  for (const [x, z] of poles) {
    const a = [x, dy + 2.5, z];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const p0 = [lerp(a[0], top[0], t0), lerp(a[1], top[1], t0) - Math.sin(t0 * Math.PI) * 0.4, lerp(a[2], top[2], t0)];
      const p1 = [lerp(a[0], top[0], t1), lerp(a[1], top[1], t1) - Math.sin(t1 * Math.PI) * 0.4, lerp(a[2], top[2], t1)];
      beam(k, '#3a3530', p0, p1, 0.015, 0.015);
      const m = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
      k.poly(bunt[(i + 1) % 4], [[p0[0], p0[1], p0[2]], [p1[0], p1[1], p1[2]], [m[0], m[1] - 0.26, m[2]]], { off: 0 });
      k.poly(bunt[(i + 1) % 4], [[p1[0], p1[1], p1[2]], [p0[0], p0[1], p0[2]], [m[0], m[1] - 0.26, m[2]]], { off: 0 });
    }
  }
  // centrepiece
  const cz = -2.2;
  if (variant === 1) cactusPiece(k, dy, cz); else prospectorPiece(k, dy, cz);
  // banner frame over the cab front
  for (const s of [1, -1]) k.cyl('#d9d6cc', 0.04, 0.04, 2.7, [s * 1.25, dy + 1.35, z1 - 0.05], { seg: 6 });
  // wheels (mostly behind the skirt)
  axle(k, rig, 'wheel_fl', 'wheel_fr', cab.zw, 0.5, 0.3, 'chrome', 0.93);
  axle(k, rig, 'wheel_rl', 'wheel_rr', -3.6, 0.5, 0.38, 'steel', 1.05);
  const bones = finish(g, k, rig);
  const t = foundersTex();
  sideSigns(bones.body, t, 4.4, 1.1, hw + 0.07, 0.78, -2.3, 'sign_founders', '#efe2c4');
  addSign(bones.body, t, 2.5, 0.62, [0, dy + 2.25, z1 - 0.03], [0, 0, 0], 'sign_founders_front', '#efe2c4');
  addSign(bones.body, t, 2.5, 0.62, [0, dy + 2.25, z1 - 0.08], [0, Math.PI, 0], 'sign_founders_front_b', '#efe2c4');
  addSign(bones.body, t, 2.6, 0.65, [0, 0.82, z0 - 0.06], [0, Math.PI, 0], 'sign_founders_rear', '#efe2c4');
  return g;
}
function axle(k, rig, l, r, z, rad, w, style, x) {
  addWheel(k, rig, l, [x, rad, z], rad, w, 1, style);
  addWheel(k, rig, r, [-x, rad, z], rad, w, -1, style);
}
/** Papier-mâché prospector (×2.1 scale) with a pack mule on a rock plinth. */
function prospectorPiece(k, dy, cz) {
  const rock = '#b39a78';
  k.ico(rock, 1.0, [0, dy + 0.15, cz], { detail: 1, jitter: 0.12, seed: 541, scale: [1.35, 0.42, 2.4], flatBottom: -0.2 });
  k.ico(shade(rock, 0.9), 0.5, [1.0, dy + 0.3, cz + 1.4], { detail: 0, jitter: 0.15, seed: 542 });
  const S = 2.55, base = dy + 0.45;
  // prospector: scaled figure (built in its own local frame)
  k.at([0.5, base, cz + 0.75], [0, -0.35, 0], [S, S, S], () => {
    const f = figure(k, {
      hip: [0, 0.9, 0], lean: 0.05, skin: '#e0b48c', top: '#b0473a', sleeve: '#b0473a', bottom: '#4d5f82', boots: '#5b3b26', gloves: '#e0b48c',
      head: { type: 'cowboy', color: '#8a6a44', beard: '#d8d2c4', hair: '#d8d2c4' },
      hands: [[0.28, 1.62, 0.05], [-0.3, 0.95, 0.18]], feet: [[0.14, 0.06, 0.08], [-0.14, 0.06, -0.04]], armHint: [0.6, -0.6, -0.3],
    });
    // suspenders, plaid lines, pickaxe over the right shoulder, gold pan in the left hand
    for (const s of [1, -1]) frameBox(k, '#3a2a20', f.torso, [s * 0.1, 0, 0.13], [0.04, 0.5, 0.02]);
    for (const y of [-0.12, 0.05]) frameBox(k, shade('#b0473a', 0.7), f.torso, [0, y, 0.128], [0.4, 0.025, 0.01]);
    const h = f.hands[0];
    beam(k, '#8a6a44', [h.x - 0.05, h.y - 0.35, h.z + 0.2], [h.x + 0.05, h.y + 0.35, h.z - 0.25], 0.05, 0.05);
    beam(k, '#7d7f80', [h.x + 0.12, h.y + 0.42, h.z - 0.05], [h.x - 0.02, h.y + 0.28, h.z - 0.5], 0.04, 0.06);
    const h2 = f.hands[1];
    k.cyl('#c9a24a', 0.17, 0.12, 0.05, [h2.x - 0.05, h2.y + 0.02, h2.z + 0.12], { seg: 8, rot: [0.5, 0, 0.3] });
    k.ico('#e8c23a', 0.03, [h2.x - 0.05, h2.y + 0.06, h2.z + 0.12], { detail: 0 });
  });
  // mule (papier-mâché, lumpy)
  k.at([-0.62, base, cz - 0.7], [0, 0.25, 0], [1.3, 1.3, 1.3], () => mule(k));
}
function mule(k) {
  const mx = 0, mz = 0, my = 0;
  const coat = '#8b7a66', light = '#c9b8a0', dark = '#3e342b';
  k.ico(coat, 0.62, [mx, my + 1.55, mz], { detail: 1, jitter: 0.06, seed: 551, scale: [0.75, 0.8, 1.55] });
  k.ico(coat, 0.32, [mx, my + 2.05, mz + 1.05], { detail: 1, jitter: 0.05, seed: 552, scale: [0.8, 1.1, 1.0] });
  beam(k, coat, [mx, my + 1.75, mz + 0.85], [mx, my + 2.35, mz + 1.35], 0.34, 0.34);
  k.ico(coat, 0.28, [mx, my + 2.3, mz + 1.55], { detail: 1, jitter: 0.05, seed: 553, scale: [0.75, 0.85, 1.5] });
  k.ico(light, 0.18, [mx, my + 2.22, mz + 1.92], { detail: 0, scale: [1, 0.9, 1.1] });
  for (const s of [1, -1]) {
    beam(k, coat, [mx + s * 0.1, my + 2.5, mz + 1.45], [mx + s * 0.22, my + 3.05, mz + 1.35], 0.1, 0.05);
    k.box(dark, [0.035, 0.035, 0.02], [mx + s * 0.12, my + 2.38, mz + 1.86]);
  }
  for (const [lx, lz] of [[0.25, 0.65], [-0.25, 0.65], [0.25, -0.75], [-0.25, -0.75]]) {
    beam(k, coat, [mx + lx, my + 1.3, mz + lz], [mx + lx, my + 0.15, mz + lz + 0.05], 0.16, 0.16);
    k.box(dark, [0.18, 0.12, 0.2], [mx + lx, my + 0.08, mz + lz + 0.05]);
  }
  beam(k, dark, [mx, my + 1.7, mz - 0.92], [mx, my + 1.1, mz - 1.05], 0.06, 0.06);
  beam(k, dark, [mx, my + 2.2, mz + 1.2], [mx, my + 1.85, mz + 0.4], 0.08, 0.04);       // mane
  // packs: saddle bags, bedroll, shovel
  for (const s of [1, -1]) k.box('#8f6a3a', [0.22, 0.5, 0.6], [mx + s * 0.5, my + 1.5, mz - 0.05], { c: 0.06 });
  k.cyl('#5d6b4a', 0.2, 0.2, 1.0, [mx, my + 2.08, mz - 0.1], { axis: 'x', seg: 8 });
  beam(k, '#7d7f80', [mx + 0.55, my + 1.4, mz - 0.6], [mx + 0.62, my + 2.3, mz + 0.3], 0.04, 0.04);
}
/** Giant papier-mâché saguaro with gold nuggets and a sun cut-out. */
function cactusPiece(k, dy, cz) {
  const green = '#6f8f4f', dark = '#4b663a', flower = '#e07a9a';
  k.ico('#b39a78', 1.0, [0, dy + 0.15, cz], { detail: 1, jitter: 0.12, seed: 561, scale: [1.3, 0.42, 2.4], flatBottom: -0.2 });
  const trunk = (a, b, r) => { tube(k, green, a, b, r, r * 0.95, 9); for (let i = 0; i < 9; i++) { const ang = (i / 9) * Math.PI * 2; beam(k, dark, [a[0] + Math.cos(ang) * r * 0.98, a[1], a[2] + Math.sin(ang) * r * 0.98], [b[0] + Math.cos(ang) * r * 0.93, b[1], b[2] + Math.sin(ang) * r * 0.93], 0.04, 0.04); } };
  const base = dy + 0.45;
  trunk([0, base, cz], [0, base + 4.2, cz], 0.6);
  k.ico(green, 0.6, [0, base + 4.2, cz], { detail: 1, scale: [1, 0.7, 1] });
  // arms
  trunk([0.5, base + 1.9, cz], [1.25, base + 1.9, cz], 0.36);
  trunk([1.25, base + 1.9, cz], [1.25, base + 3.3, cz], 0.36);
  k.ico(green, 0.36, [1.25, base + 3.3, cz], { detail: 0, scale: [1, 0.7, 1] });
  trunk([-0.5, base + 2.5, cz], [-1.1, base + 2.5, cz], 0.32);
  trunk([-1.1, base + 2.5, cz], [-1.1, base + 3.6, cz], 0.32);
  k.ico(green, 0.32, [-1.1, base + 3.6, cz], { detail: 0, scale: [1, 0.7, 1] });
  for (const [x, y, z] of [[0, 4.75, 0], [0.2, 4.6, 0.3], [-0.25, 4.62, -0.2], [1.25, 3.55, 0], [-1.1, 3.82, 0.1]]) k.ico(flower, 0.13, [x, base + y - 0.4, cz + z], { detail: 0 });
  // friendly painted face (papier-mâché mascot)
  for (const s of [1, -1]) { k.ico('#f2ead6', 0.13, [s * 0.2, base + 3.4, cz + 0.55], { detail: 0 }); k.ico('#1d1b1a', 0.06, [s * 0.2, base + 3.4, cz + 0.67], { detail: 0 }); }
  beam(k, '#7a2f2a', [-0.22, base + 3.05, cz + 0.58], [0.22, base + 3.05, cz + 0.58], 0.06, 0.04);
  // gold nuggets + sun cut-out at the back
  for (const [x, z, r] of [[1.0, 1.5, 0.35], [-0.9, 1.2, 0.3], [0.8, -1.6, 0.28], [-0.7, -1.8, 0.4]]) k.ico('#d9a83a', r, [x, base + r * 0.6, cz + z], { detail: 0, jitter: 0.15, seed: 570 + x * 10 });
  k.cyl('#e8c23a', 0.8, 0.8, 0.08, [0, base + 2.4, cz - 1.6], { axis: 'z', seg: 12 });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; k.at([0, base + 2.4, cz - 1.62], [0, 0, a], () => k.box('#d9a83a', [0.14, 0.4, 0.06], [0, 1.0, 0])); }
}

// ═════════════════════════════════════════════════════════════════════════════
// STAGECOACH — red Concord-style coach, driver, two horses (horse_0 = +X, horse_1 = −X)
// with leg_fl/fr/rl/rr pivots each. (~7.4 × 2.0 × 2.9)
// ═════════════════════════════════════════════════════════════════════════════
export function buildStagecoach(variant = 0) {
  const g = root('stagecoach', variant, { w: 2.0, h: 2.9, l: 7.4 });
  const k = new Kit(5500 + variant);
  const rig = vrig();
  const red = variant === 1 ? '#3f5f4a' : '#8e2f28', gold = '#d9a83a', wood = '#c99a3a', leather = '#3e2a1e', dark = '#2a2422';
  const zo = -1.55;  // coach centre (footprint centred on the whole rig)
  // coach body: boat-shaped side profile
  const prof = [[-1.2, 1.2], [-0.6, 0.98], [0.6, 0.98], [1.15, 1.25], [1.25, 1.6], [1.12, 2.3], [-1.15, 2.3], [-1.3, 1.65]].map(([z, y]) => [z + zo, y]);
  k.extrude(red, prof, 1.45, { axis: 'x', bevel: 0.05 });
  for (const s of [1, -1]) {
    k.side(gold, 0.725, [[-1.12 + zo, 1.62], [1.18 + zo, 1.62], [1.18 + zo, 1.66], [-1.12 + zo, 1.66]], { side: s, off: 0.014 });
    k.side(gold, 0.725, prof.map(([z, y]) => [zo + (z - zo) * 0.9, 1.0 + (y - 1.0) * 0.92]).filter((p) => p[1] < 1.6), { side: s, off: 0.012 });
    k.side(red, 0.725, prof.map(([z, y]) => [zo + (z - zo) * 0.86, 1.04 + (y - 1.04) * 0.88]).filter((p) => p[1] < 1.58), { side: s, off: 0.016 });
    // door window + curtains + small side windows
    k.side(dark, 0.725, [[-0.32 + zo, 1.7], [0.32 + zo, 1.7], [0.32 + zo, 2.2], [-0.32 + zo, 2.2]], { side: s, off: 0.016 });
    k.side('#b98552', 0.725, [[-0.32 + zo, 2.05], [0.32 + zo, 2.05], [0.32 + zo, 2.2], [-0.32 + zo, 2.2]], { side: s, off: 0.02 });
    for (const z of [-0.85, 0.85]) k.side(dark, 0.725, [[z - 0.18 + zo, 1.75], [z + 0.18 + zo, 1.75], [z + 0.18 + zo, 2.15], [z - 0.18 + zo, 2.15]], { side: s, off: 0.016 });
    k.side(gold, 0.725, [[-0.36 + zo, 1.68], [-0.33 + zo, 1.68], [-0.33 + zo, 2.22], [-0.36 + zo, 2.22]], { side: s, off: 0.02 });
    k.box(gold, [0.04, 0.04, 0.1], [s * 0.75, 1.85, 0.25 + zo]);
    sideBlob(k, mix(red, PAL.dirt, 0.5), 0.725, -0.6 + zo, 1.1, 0.4, 0.08, 551 + s, s, 0.02);
  }
  // roof + luggage rail + bags
  k.box(dark, [1.6, 0.08, 2.5], [0, 2.34, zo], { c: 0.03 });
  for (const s of [1, -1]) k.box(PAL.metal, [0.03, 0.18, 1.8], [s * 0.72, 2.47, zo - 0.2]);
  k.box('#8f6a3a', [0.6, 0.35, 0.5], [0.3, 2.56, zo - 0.6], { c: 0.04 });
  k.box('#6f7a5a', [0.5, 0.28, 0.6], [-0.3, 2.52, zo - 0.1], { c: 0.06 });
  k.box('#5b3b26', [0.8, 0.3, 0.4], [0.05, 2.53, zo + 0.5], { c: 0.04 });
  // rear boot (leather) + driver's box + footboard
  k.box(leather, [1.3, 0.6, 0.5], [0, 1.45, zo - 1.5], { c: 0.08, taper: [1, 0.9] });
  k.box(red, [1.3, 0.12, 0.6], [0, 2.38, zo + 1.25]);
  k.box(leather, [1.2, 0.18, 0.5], [0, 2.47, zo + 1.25], { c: 0.04 });
  k.box(leather, [1.2, 0.4, 0.08], [0, 2.7, zo + 1.0]);
  beam(k, red, [0, 2.05, zo + 1.55], [0, 1.6, zo + 2.0], 1.2, 0.06, { hint: [0, 1, 0] });
  // undercarriage: thoroughbraces, perch, axles
  for (const s of [1, -1]) {
    beam(k, leather, [s * 0.5, 1.05, zo - 1.3], [s * 0.5, 0.92, zo + 1.2], 0.1, 0.06);
    beam(k, dark, [s * 0.4, 0.8, zo - 1.25], [s * 0.4, 0.75, zo + 1.25], 0.08, 0.08);
  }
  k.box(dark, [1.8, 0.1, 0.12], [0, 0.78, zo - 1.25]);
  k.box(dark, [1.6, 0.1, 0.12], [0, 0.56, zo + 1.25]);
  // tongue + doubletree to the horses
  const hz = 2.6;  // horse centre z
  beam(k, wood, [0, 0.6, zo + 1.25], [0, 1.05, hz + 0.9], 0.1, 0.1);
  k.box(wood, [1.4, 0.08, 0.08], [0, 0.72, zo + 1.9]);
  // driver
  figure(k, {
    hip: [0.25, 2.62, zo + 1.25], lean: 0.12, skin: PAL.skin[1], top: '#8a7a5a', sleeve: '#8a7a5a', bottom: '#4a3f33', boots: '#3a2a20', gloves: '#6b4a2e',
    head: { type: 'cowboy', color: '#5b4632', beard: PAL.hair[1], hair: PAL.hair[1] },
    hands: [[0.38, 2.5, zo + 1.72], [0.08, 2.5, zo + 1.72]], feet: [[0.4, 2.1, zo + 1.72], [0.1, 2.1, zo + 1.72]], legHint: [0.1, 0.6, 0.8],
  });
  // horses
  const coats = variant === 1 ? [['#a8a49a', '#4a4844'], ['#6b4a34', '#1f1a17']] : [['#7a4a2c', '#1f1a17'], ['#9a5a33', '#4a2e1c']];
  const reinEnds = [];
  [[0.5, 0], [-0.5, 1]].forEach(([x, i]) => {
    const [coat, mane] = coats[i];
    const hi = rig.add(`horse_${i}`, [x, 0, hz], 'body');
    k.withBone(hi, () => {
      k.box(coat, [0.5, 0.58, 1.5], [x, 1.32, hz], { c: 0.16 });
      k.box(coat, [0.54, 0.62, 0.55], [x, 1.36, hz - 0.62], { c: 0.18 });
      k.box(coat, [0.5, 0.56, 0.5], [x, 1.38, hz + 0.6], { c: 0.16 });
      beam(k, coat, [x, 1.45, hz + 0.68], [x, 1.98, hz + 1.12], 0.3, 0.36, { c: 0.08 });
      beam(k, coat, [x, 2.1, hz + 1.12], [x, 1.78, hz + 1.55], 0.24, 0.26, { c: 0.06 });
      k.box(shade(coat, 0.8), [0.2, 0.18, 0.18], [x, 1.76, hz + 1.56], { c: 0.04 });
      for (const s of [1, -1]) {
        k.box(coat, [0.06, 0.16, 0.06], [x + s * 0.08, 2.2, hz + 1.1], { rot: [-0.3, 0, 0] });
        k.box('#111', [0.03, 0.04, 0.04], [x + s * 0.125, 2.0, hz + 1.3]);
      }
      beam(k, mane, [x, 2.15, hz + 1.06], [x, 1.62, hz + 0.6], 0.1, 0.12);
      beam(k, mane, [x, 1.5, hz - 0.85], [x, 0.95, hz - 1.05], 0.12, 0.14);
      // harness: collar, back strap, traces back to the doubletree
      k.box(leather, [0.56, 0.52, 0.14], [x, 1.6, hz + 0.8], { c: 0.05, rot: [0.6, 0, 0] });
      k.box(leather, [0.54, 0.1, 0.3], [x, 1.62, hz - 0.05]);
      for (const s of [1, -1]) beam(k, leather, [x + s * 0.27, 1.45, hz + 0.75], [x + s * 0.3, 0.75, zo + 1.95], 0.04, 0.03);
      reinEnds.push([x, 1.85, hz + 1.45]);
      // legs
      for (const [name, lx, lz] of [['leg_fl', 0.15, 0.62], ['leg_fr', -0.15, 0.62], ['leg_rl', 0.15, -0.6], ['leg_rr', -0.15, -0.6]]) {
        const jp = [x + lx, 1.12, hz + lz];
        const li = rig.add(name, jp, `horse_${i}`);
        k.withBone(li, () => {
          beam(k, coat, jp, [jp[0], 0.62, jp[2] + (lz < 0 ? -0.06 : 0.02)], 0.16, 0.18);
          beam(k, shade(coat, 0.8), [jp[0], 0.64, jp[2] + (lz < 0 ? -0.06 : 0.02)], [jp[0], 0.1, jp[2]], 0.09, 0.09);
          k.box(dark, [0.13, 0.1, 0.15], [jp[0], 0.05, jp[2] + 0.01]);
        });
      }
    });
  });
  // reins (static, from the driver's hands to the bits)
  for (const [x, y, z] of reinEnds) beam(k, leather, [x * 0.3 + 0.2, 2.5, zo + 1.75], [x, y, z], 0.02, 0.02);
  // wheels: spoked, front smaller
  const fw = spokedWheelGeo(0.55, 0.09, 12, { wood }), rw = spokedWheelGeo(0.78, 0.1, 14, { wood });
  addWheelGeo(k, rig, 'wheel_fl', [0.88, 0.55, zo + 1.25], fw, 1);
  addWheelGeo(k, rig, 'wheel_fr', [-0.88, 0.55, zo + 1.25], fw, -1);
  addWheelGeo(k, rig, 'wheel_rl', [0.9, 0.78, zo - 1.25], rw, 1);
  addWheelGeo(k, rig, 'wheel_rr', [-0.9, 0.78, zo - 1.25], rw, -1);
  finish(g, k, rig);
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// INFLATABLE GORILLA — ~9 m promo mascot, purple-brown vinyl, "SALE" sash.
// `body` wobbles about its base; arms swing (arm_l.rotation.z > 0 lifts it out). (~5.6 × 9.2 × 3.4)
// ═════════════════════════════════════════════════════════════════════════════
export function buildGorilla(variant = 0) {
  const g = root('inflatable_gorilla', variant, { w: 6.2, h: 9.1, l: 3.6 });
  const k = new Kit(5600 + variant);
  const rig = new Rig();
  const fur = variant === 1 ? '#4e4a5e' : '#5e4352', face = variant === 1 ? '#b8aea0' : '#c2a08c', seam = shade(fur, 0.72), dark = '#1d1b1e';
  // static base: blower pad + tethers (bone `base`)
  rig.add('base', [0, 0, 0]);
  k.withBone(0, () => {
    k.box('#2b2c2e', [2.6, 0.3, 2.4], [0, 0.15, 0], { c: 0.06 });
    k.box('#3a3b3e', [0.8, 0.5, 0.6], [1.6, 0.25, -0.8], { c: 0.05 });
    tube(k, '#4a4b4e', [1.25, 0.35, -0.8], [0.6, 0.6, -0.5], 0.18, 0.2, 8);
    for (const [x, z] of [[2.4, 1.4], [-2.4, 1.4], [2.2, -1.5], [-2.2, -1.5]]) {
      beam(k, '#d9d6cc', [x, 0.05, z], [x * 0.35, 2.0, z * 0.35], 0.025, 0.025);
      k.box('#5a5c5f', [0.06, 0.15, 0.06], [x, 0.07, z]);
    }
  });
  const S = 1.13;   // authored at ~8 m, scaled to ~9 m
  const bi = rig.add('body', [0, 0.3, 0]);
  const blob = (c, r, pos, scale, seed, detail = 1, jit = 0.04) => k.ico(c, r, pos, { detail, jitter: jit, seed, scale });
  k.withBone(bi, () => k.at([0, 0.3, 0], [0, 0, 0], [S, S, S], () => k.at([0, -0.3, 0], () => {
    // legs + feet
    for (const s of [1, -1]) {
      blob(fur, 0.75, [s * 0.75, 1.15, 0.05], [1, 1.25, 1], 601 + s);
      blob(face, 0.55, [s * 0.85, 0.5, 0.5], [1.1, 0.55, 1.5], 603 + s);
    }
    // belly / torso + lighter chest
    blob(fur, 1.85, [0, 3.45, 0], [1.05, 1.15, 0.82], 605, 2, 0.03);
    blob(face, 1.25, [0, 3.35, 0.6], [1.0, 1.25, 0.6], 606, 1, 0.03);
    k.torus(seam, 1.55, 0.06, [0, 2.15, 0], { rot: [Math.PI / 2, 0, 0], rs: 3, ts: 14, scale: [1.05, 0.8, 1] });
    // shoulders hump + head
    blob(fur, 1.35, [0, 5.45, -0.1], [1.35, 0.7, 0.85], 607);
    k.torus(seam, 0.85, 0.07, [0, 5.95, 0.05], { rot: [Math.PI / 2, 0, 0], rs: 3, ts: 12, scale: [1, 0.85, 1] });
    blob(fur, 1.05, [0, 6.75, 0.05], [1, 1.02, 0.95], 608, 2, 0.025);
    blob(fur, 0.55, [0, 7.65, -0.15], [1.1, 0.7, 1], 609);                       // crest
    blob(face, 0.72, [0, 6.42, 0.72], [1.15, 0.8, 0.75], 610);                  // muzzle
    k.box(shade(fur, 0.85), [1.4, 0.26, 0.45], [0, 7.05, 0.75], { c: 0.12 });   // brow
    for (const s of [1, -1]) {
      k.ico('#f2ead6', 0.18, [s * 0.36, 6.82, 0.92], { detail: 1, scale: [1, 1, 0.6] });
      k.ico(dark, 0.09, [s * 0.34, 6.8, 1.02], { detail: 0 });
      k.ico(dark, 0.07, [s * 0.15, 6.55, 1.25], { detail: 0 });
      blob(face, 0.26, [s * 1.0, 6.85, 0.0], [0.6, 1, 0.9], 611 + s, 0);
    }
    beam(k, dark, [-0.35, 6.12, 1.17], [0.35, 6.12, 1.17], 0.05, 0.05, { hint: [0, 1, 0] });
    beam(k, dark, [0.35, 6.12, 1.17], [0.45, 6.2, 1.1], 0.05, 0.05);
    beam(k, dark, [-0.35, 6.12, 1.17], [-0.45, 6.2, 1.1], 0.05, 0.05);
    // sash (right shoulder → left hip) hugging the belly
    const sashC = '#e2b93b';
    const path = [[-1.3, 5.6, 0.55], [-0.85, 4.95, 1.25], [-0.2, 4.15, 1.52], [0.5, 3.3, 1.5], [1.15, 2.5, 1.1], [1.55, 1.95, 0.4]];
    for (let i = 0; i < path.length - 1; i++) beam(k, sashC, path[i], path[i + 1], 0.75, 0.08, { ext: 0.05, hint: [0, 0, 1] });
    const back = [[-1.3, 5.6, 0.55], [-1.2, 5.2, -0.9], [0, 3.8, -1.45], [1.2, 2.6, -1.1], [1.55, 1.95, 0.4]];
    for (let i = 0; i < back.length - 1; i++) beam(k, shade(sashC, 0.9), back[i], back[i + 1], 0.7, 0.08, { ext: 0.05, hint: [0, 0, -1] });
  })));
  // arms (pivots at the shoulders; hang slightly outward and forward, saggy)
  for (const [name, s] of [['arm_l', 1], ['arm_r', -1]]) {
    const sp0 = [s * 1.75, 5.55, 0.0], sp = [sp0[0] * S, 0.3 + (sp0[1] - 0.3) * S, 0];
    const ai = rig.add(name, sp, 'body');
    k.withBone(ai, () => k.at([0, 0.3, 0], [0, 0, 0], [S, S, S], () => k.at([0, -0.3, 0], () => {
      const sp = sp0;
      const el = [s * 2.35, 3.95, 0.25], wr = [s * 2.45, 2.35, 0.55];
      blob(fur, 0.62, [(sp[0] + el[0]) / 2, (sp[1] + el[1]) / 2, (sp[2] + el[2]) / 2], [0.85, 1.55, 0.85], 620 + s);
      blob(fur, 0.55, [(el[0] + wr[0]) / 2, (el[1] + wr[1]) / 2, (el[2] + wr[2]) / 2], [0.85, 1.6, 0.85], 622 + s);
      k.torus(seam, 0.5, 0.05, el, { rot: [Math.PI / 2, 0, 0], rs: 3, ts: 10 });
      blob(face, 0.58, [wr[0], wr[1] - 0.35, wr[2] + 0.1], [1, 0.85, 1.05], 624 + s);
    })));
  }
  const bones = (() => { const { bones } = rig.build(g, k, 'mesh'); g.userData.parts = Object.keys(bones); return bones; })();
  const sale = textTex('gorilla_sale', 'SALE', { w: 512, h: 192, bg: '#e2b93b', fg: '#b8352a', size: 0.86, stroke: '#f6efd4' });
  // on the sash, following its slope (model-space point → body-local)
  const sp = [0.12 * S, 0.3 + (3.78 - 0.3) * S, 1.66 * S];
  const m = addSign(bones.body, sale, 1.35, 0.5, [sp[0], sp[1] - 0.3, sp[2]], [0, 0, 0], 'sign_sale', '#e2b93b');
  m.rotation.set(-0.22, 0.12, -0.86);
  return g;
}
