// ─────────────────────────────────────────────────────────────────────────────
// Expansion pack VEHICLES: story cars (comet_car, kestrel_car) and bikers (chopper).
// All designs original. The Midnight Comet is a 1950s "Googie" rocket car:
// round silver/midnight fuselage, side pods, bubble canopy, comet-trail fins
// (rounded, inlaid streaks) and a big rear booster. No bat/cape motifs.
// ─────────────────────────────────────────────────────────────────────────────
import {
  THREE, Kit, root, empty, PAL, mix, shade, arch, sideBlob, signTexture,
  vrig, finish, beam, tube, frameBox, figure, lampMaterial, addSign, addWheelGeo, whitewallWheelGeo, bikeWheelGeo,
  carShell, mirrors, doorSeams, handles, MIDNIGHT, lerp,
} from './vehicles-common.js';

const TEAL = '#3fb8b0', TEAL_HI = '#9fe7df';

/** Smooth tapered streak polygon [z,y] from (z0,y0) to (z1,y1), widths w0 → w1, rounded rear tip. */
function streak(z0, y0, z1, y1, w0, w1, curve = 1.5, n = 7) {
  const C = (t) => [lerp(z0, z1, t), y0 + (y1 - y0) * Math.pow(t, curve)];
  const top = [], bot = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = C(t), q = C(Math.min(1, t + 0.01)), pp = C(Math.max(0, t - 0.01));
    let tz = q[0] - pp[0], ty = q[1] - pp[1];
    const l = Math.hypot(tz, ty) || 1; tz /= l; ty /= l;
    const nz = -ty, ny = tz, w = lerp(w0, w1, t) / 2;
    top.push([p[0] + nz * w, p[1] + ny * w]); bot.push([p[0] - nz * w, p[1] - ny * w]);
  }
  const end = C(1), pe = C(0.97);
  const dz = end[0] - pe[0], dy = end[1] - pe[1], dl = Math.hypot(dz, dy) || 1;
  const tip = [end[0] + (dz / dl) * w1 * 0.45, end[1] + (dy / dl) * w1 * 0.45];
  return [...bot, tip, ...top.reverse()];
}

// ═════════════════════════════════════════════════════════════════════════════
// THE MIDNIGHT COMET — hero's rocket car (~6.1 × 2.1 × 1.85)
// ═════════════════════════════════════════════════════════════════════════════
export function buildComet(variant = 0) {
  const g = root('comet_car', variant, { w: 2.1, h: 1.85, l: 6.1 });
  const k = new Kit(3400 + variant);
  const gk = new Kit(3401);           // emissive teal glow parts
  const rig = vrig();
  const silver = PAL.silver, mid = MIDNIGHT, chrome = PAL.chrome, midLo = shade(MIDNIGHT, 0.75);
  const cy = 0.66, px = 0.84, wr = 0.34, zf = 1.62, zr = -1.55;

  // ── fuselage (lathe along Z, oval section): silver upper, midnight lower ──
  const fus = [[0.44, -2.55], [0.54, -2.25], [0.62, -1.5], [0.66, -0.4], [0.64, 0.7], [0.57, 1.5], [0.45, 2.1], [0.29, 2.55]];
  const two = (x, y, z, nx, ny) => (ny > 0.2 ? silver : ny > -0.45 ? mid : midLo);
  k.lathe(two, fus, 12, [0, cy, 0], { axis: 'z', scale: [0.98, 1, 0.84] });
  k.lathe(chrome, [[0.3, 2.54], [0.22, 2.74], [0.08, 2.9], [0.001, 2.95]], 12, [0, cy, 0], { axis: 'z', scale: [0.98, 1, 0.84] });
  k.lathe(chrome, [[0.462, 2.0], [0.47, 2.1], [0.462, 2.2]], 12, [0, cy, 0], { axis: 'z', scale: [0.98, 1, 0.84] });
  // ── side pods with skirted wheel notches ─────────────────────────────────
  const nr = 0.43, by = 0.24, pod = [[-2.3, 0.32]];
  for (const zc of [zr, zf]) {
    pod.push([zc - nr, by]);
    for (let i = 0; i <= 6; i++) { const a = Math.PI * (1 - i / 6); pod.push([zc + Math.cos(a) * nr, wr + Math.sin(a) * nr]); }
    pod.push([zc + nr, by]);
  }
  pod.push([2.22, 0.3], [2.44, 0.42], [2.52, 0.56], [2.46, 0.7], [2.26, 0.8], [1.2, 0.88], [0, 0.9], [-1.2, 0.9], [-2.0, 0.88], [-2.46, 0.8], [-2.64, 0.66], [-2.62, 0.48], [-2.5, 0.36]);
  for (const s of [1, -1]) {
    k.extrude(mid, pod, 0.42, { axis: 'x', pos: [s * px, 0, 0], bevel: 0.08 });
    const xo = s * (px + 0.212);
    beam(k, chrome, [xo, 0.64, -2.1], [xo, 0.64, 2.2], 0.03, 0.05);
    beam(k, chrome, [xo, 0.645, 2.2], [xo, 0.6, 2.42], 0.03, 0.04);
    // teal glow strip under the chrome spear + rocker glow
    gk.box('#fff', [0.02, 0.035, 4.1], [s * (px + 0.215), 0.58, 0.05]);
    gk.box('#fff', [0.02, 0.03, 1.6], [s * (px + 0.205), 0.31, 0.05]);
    // pod-nose headlamps + tail lamps
    k.cyl(chrome, 0.13, 0.13, 0.06, [s * px, 0.56, 2.5], { axis: 'z', seg: 10 });
    gk.cyl('#fff', 0.1, 0.1, 0.02, [s * px, 0.56, 2.535], { axis: 'z', seg: 10 });
    k.cyl(chrome, 0.1, 0.1, 0.05, [s * px, 0.58, -2.63], { axis: 'z', seg: 8 });
    k.cyl(PAL.taillight, 0.08, 0.08, 0.02, [s * px, 0.58, -2.665], { axis: 'z', seg: 8 });
    sideBlob(k, mix(mid, PAL.dirt, 0.35), px + 0.21, zr - 0.6, 0.38, 0.28, 0.07, 71 + s, s, 0.02);
  }
  // ── comet-trail fins: solid rounded fin, three inlaid streaks, comet-head orb ──
  const fin = [[-1.1, 0.86], [-2.35, 0.86], [-2.64, 1.1], [-2.82, 1.4], [-2.88, 1.62], [-2.8, 1.74], [-2.6, 1.72], [-2.2, 1.45], [-1.65, 1.1]];
  const streaks = [
    [streak(-1.42, 1.0, -2.74, 1.62, 0.07, 0.12, 1.3), mid],
    [streak(-1.62, 0.96, -2.76, 1.4, 0.06, 0.1, 1.3), TEAL],
    [streak(-1.86, 0.92, -2.72, 1.17, 0.05, 0.08, 1.3), mid],
  ];
  for (const s of [1, -1]) {
    const fx = s * (px + 0.02);
    k.extrude(silver, fin, 0.1, { axis: 'x', pos: [fx, 0, 0] });
    for (const [pts, c] of streaks) for (const f of [1, -1]) (c === TEAL ? gk : k).flat(c, pts, (z, y) => [fx + f * 0.05, y, z], { facing: [f, 0, 0], off: 0.006 });
    k.ico(chrome, 0.12, [fx, 0.97, -1.18], { detail: 0 });
    gk.ico('#fff', 0.08, [fx + s * 0.06, 0.98, -1.12], { detail: 0 });
  }
  // ── booster (big rear rocket nozzle) ─────────────────────────────────────
  k.lathe(chrome, [[0.52, -3.08], [0.48, -2.96], [0.42, -2.8], [0.41, -2.64], [0.46, -2.5]], 12, [0, cy, 0], { axis: 'z' });
  k.lathe('#4a4f57', [[0.5, -3.06], [0.36, -2.96]], 12, [0, cy, 0], { axis: 'z' });
  k.front('#1b1d22', -2.94, Array.from({ length: 12 }, (_, i) => [Math.cos((i / 12) * Math.PI * 2) * 0.37, cy + Math.sin((i / 12) * Math.PI * 2) * 0.37]), -1, { off: 0 });
  k.torus(mid, 0.47, 0.035, [0, cy, -2.62], { rs: 3, ts: 12 });
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
    k.at([0, cy, -2.72], [0, 0, a], () => k.box(silver, [0.04, 0.2, 0.36], [0, 0.5, 0]));
  }
  gk.torus('#fff', 0.3, 0.04, [0, cy, -2.955], { rs: 3, ts: 12 });
  // ── nose: comet hood ornament, bumper bar ────────────────────────────────
  k.ico(chrome, 0.075, [0, 1.13, 1.95], { detail: 0 });
  for (const [dx, dy, l] of [[0, 0.03, 0.42], [0.05, -0.02, 0.32], [-0.05, -0.02, 0.32]]) beam(k, TEAL, [dx * 0.5, 1.13 + dy * 0.4, 1.9], [dx, 1.12 + dy, 1.9 - l], 0.03, 0.02);
  beam(k, chrome, [-(px + 0.1), 0.34, 2.3], [px + 0.1, 0.34, 2.3], 0.07, 0.07);
  for (const s of [1, -1]) k.cone(chrome, 0.06, 0.18, [s * 0.32, 0.36, 2.34], { rot: [Math.PI / 2, 0, 0], seg: 7 });
  k.box(PAL.under, [1.3, 0.12, 4.2], [0, 0.22, 0]);
  // cockpit tub, dash + yoke
  k.box('#15192b', [0.82, 0.12, 1.5], [0, 1.12, 0.12]);
  k.box('#222839', [0.7, 0.18, 0.18], [0, 1.18, 0.62]);
  gk.box('#fff', [0.4, 0.03, 0.02], [0, 1.22, 0.53]);
  beam(k, '#2a2f3a', [0, 1.1, 0.62], [0, 1.2, 0.48], 0.05, 0.05);
  beam(k, chrome, [-0.2, 1.22, 0.47], [0.2, 1.22, 0.47], 0.04, 0.04);

  // ── the Midnight Comet (seated) ──────────────────────────────────────────
  const hero = figure(k, {
    hip: [0, 0.82, -0.12], lean: -0.18,
    // matches the people pack's comet_hero: off-white suit, silver yoke/gloves, teal visor, orange→gold comet scarf
    skin: PAL.skin[3], top: '#e8e7e1', sleeve: '#e8e7e1', bottom: '#e8e7e1', boots: '#a3a8ad', gloves: '#b7bbc0',
    head: { type: 'hero', color: '#c3c7cb', visor: '#2a8f8b', stripe: '#eef0f1' },
    hands: [[0.19, 1.24, 0.46], [-0.19, 1.24, 0.46]], feet: [[0.15, 0.5, 0.9], [-0.15, 0.5, 0.9]],
    armHint: [0.5, -0.6, -0.4], scarf: '#e0702a', scarfTip: '#f2c548',
  });
  // silver yoke + star-and-tail chest emblem (gold star, orange streak)
  frameBox(k, '#b7bbc0', hero.torso, [0, 0.21, 0], [0.49, 0.07, 0.24]);
  frameBox(k, '#e0702a', hero.torso, [0.05, 0.06, 0.13], [0.16, 0.035, 0.012]);
  frameBox(k, '#f6dc6a', hero.torso, [-0.04, 0.1, 0.132], [0.07, 0.07, 0.014]);

  // ── canopy: hinged at its rear base, glass bubble + chrome spine ─────────
  const cz = 0.12, cb = 1.12, rz = 0.92, ch = 0.66;
  const hinge = [0, cb, cz - rz];
  const cIdx = rig.add('canopy', hinge, 'body');
  k.withBone(cIdx, () => {
    k.torus(chrome, 1, 0.035, [0, cb, cz], { rot: [Math.PI / 2, 0, 0], rs: 3, ts: 14, scale: [0.5, rz, 1] });
    const sp = [];
    for (let i = 0; i <= 6; i++) { const t = (i / 6) * Math.PI; sp.push([0, cb + Math.sin(t) * ch, cz + Math.cos(t) * rz]); }
    for (let i = 0; i < 6; i++) beam(k, chrome, sp[i], sp[i + 1], 0.05, 0.03, { ext: 0.02 });
  });

  // ── wheels (white walls, chrome caps with teal centres) ──────────────────
  const wg = whitewallWheelGeo(wr, 0.24, { cap: chrome, center: TEAL });
  addWheelGeo(k, rig, 'wheel_fl', [px, wr, zf], wg, 1);
  addWheelGeo(k, rig, 'wheel_fr', [-px, wr, zf], wg, -1);
  addWheelGeo(k, rig, 'wheel_rl', [px, wr, zr], wg, 1);
  addWheelGeo(k, rig, 'wheel_rr', [-px, wr, zr], wg, -1);
  // booster pivot: at the nozzle exit; its mesh is the white-hot core disc (flame attaches at the origin, along −Z)
  const bz = -3.08;
  const bIdx = rig.add('booster', [0, cy, bz], 'body');
  k.withBone(bIdx, () => {
    k.front(TEAL_HI, -2.93, Array.from({ length: 10 }, (_, i) => [Math.cos((i / 10) * Math.PI * 2) * 0.2, cy + Math.sin((i / 10) * Math.PI * 2) * 0.2]), -1, { off: 0.03 });
    k.cyl('#e9fffb', 0.08, 0.12, 0.08, [0, cy, -2.96], { axis: 'z', seg: 8 });
  });

  const bones = finish(g, k, rig);
  // emissive teal glow (own material so the renderer can pulse it)
  const glow = new THREE.Mesh(gk.geometry(), lampMaterial(TEAL, TEAL, 'CR_Comet_Glow', 0.9));
  glow.name = 'glow';
  bones.body.add(glow);
  g.userData.perInstanceMaterials = ['glow'];
  // glass bubble (transparent) on the canopy pivot
  const bk = new Kit(3402);
  bk.lathe('#ffffff', [[0.5, 0], [0.49, 0.18], [0.44, 0.36], [0.33, 0.52], [0.18, 0.62], [0.001, 0.66]], 14, [0, cb, cz], { scale: [1, 1, rz / 0.5] });
  const glassMat = new THREE.MeshLambertMaterial({ color: '#9fd3d0', emissive: '#0d2a2c', transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide, name: 'CR_Comet_Canopy' });
  const bubble = new THREE.Mesh(bk.geometry(), glassMat);
  bubble.name = 'canopy_glass';
  bubble.position.set(-hinge[0], -hinge[1], -hinge[2]);
  bubble.renderOrder = 2;
  bubble.castShadow = false;
  bones.canopy.add(bubble);
  bones.body.add(empty('headlight_l', [px, 0.56, 2.55]), empty('headlight_r', [-px, 0.56, 2.55]));
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// KESTREL — the buyer's long white 1970s luxury sedan (~5.8 × 2.0 × 1.42)
// ═════════════════════════════════════════════════════════════════════════════
export function buildKestrel(variant = 0) {
  const W = 2.0, hw = W / 2;
  const white = variant === 1 ? '#2a2b2f' : '#ece8dc', gold = '#c9a24a', vinyl = variant === 1 ? '#1b1b1d' : '#d9cfb6';
  const tint = '#121416';
  const s = {
    W, color: white, cabinColor: white, roofColor: white, glass: tint, sheen: '#283037', frame: '#1a1b1d',
    profile: [[-2.86, 0.3], [2.82, 0.3], [2.9, 0.47], [2.88, 0.77], [2.74, 0.85], [1.05, 0.9], [-1.62, 0.92], [-2.72, 0.9], [-2.9, 0.7]],
    cabin: { y0: 0.88, y1: 1.4, zb: [-1.6, 0.98], zt: [-1.28, 0.12], wb: 0.95, wt: 0.83 },
    wheel: { r: 0.36, zf: 1.82, zr: -1.72 }, pillarSplit: [[0.44, 0.63], [0.67, 0.95]], noDirt: true,
    lights: { fz: 2.89, rz: -2.9, fy: 0.62, ry: 0.66 },
  };
  const g = root('kestrel_car', variant, { w: W, h: 1.42, l: 5.8 });
  const k = new Kit(3500 + variant);
  const rig = vrig();
  const faces = carShell(k, { ...s, noRearArch: true });   // rear wheel hidden by fender skirts (no rear arch)
  // landau vinyl roof (rear half + C pillars) with an opera window and gold edge
  k.patch(vinyl, faces.top, [0, 0.52], [0, 1], { off: 0.006 });
  k.patch(gold, faces.top, [0.52, 0.535], [0, 1], { off: 0.008 });
  for (const f of [faces.left, faces.right]) {
    k.patch(vinyl, f, [0, 0.41], [0.02, 1], { off: 0.016 });
    k.patch(gold, f, [0.06, 0.32], [0.35, 0.75], { off: 0.02 });
    k.patch(tint, f, [0.08, 0.3], [0.39, 0.71], { off: 0.024 });
  }
  // grime-free gold coachline, chrome sill, skirt edge
  k.side(gold, hw, [[-2.8, 0.74], [2.78, 0.74], [2.78, 0.765], [-2.8, 0.765]], { off: 0.018 });
  k.side(PAL.chrome, hw, [[-2.6, 0.34], [2.6, 0.34], [2.6, 0.39], [-2.6, 0.39]], { off: 0.018 });
  k.side(shade(white, 0.8), hw, [[-2.2, 0.3], [-1.24, 0.3], [-1.24, 0.33], [-2.2, 0.33]], { off: 0.02 });
  doorSeams(k, hw, [0.98, -0.42], 0.36, 0.88, shade(white, 0.78));
  handles(k, hw, [0.68, -0.68], 0.78, PAL.chrome);
  mirrors(k, W, 0.98, 0.86, PAL.chrome);
  // front: gold-tone upright grille, quad headlamps, big chrome bumpers
  k.box(gold, [0.86, 0.46, 0.08], [0, 0.6, 2.9], { c: 0.02 });
  k.box('#1d1d1f', [0.74, 0.36, 0.06], [0, 0.6, 2.92]);
  for (let i = 0; i < 9; i++) k.box(gold, [0.025, 0.36, 0.03], [-0.34 + i * 0.085, 0.6, 2.95]);
  k.box(gold, [0.1, 0.12, 0.08], [0, 0.88, 2.86]);
  for (const sd of [1, -1]) for (const x of [0.58, 0.82]) {
    k.box(PAL.chrome, [0.22, 0.17, 0.05], [sd * x, 0.63, 2.9], { c: 0.015 });
    k.box(PAL.headlight, [0.17, 0.12, 0.03], [sd * x, 0.63, 2.93]);
  }
  k.box(PAL.chrome, [W + 0.04, 0.2, 0.22], [0, 0.4, 2.92], { c: 0.05 });
  k.box(PAL.chrome, [W + 0.04, 0.2, 0.22], [0, 0.42, -2.92], { c: 0.05 });
  for (const sd of [1, -1]) k.box(PAL.taillight, [0.62, 0.13, 0.04], [sd * 0.55, 0.68, -2.91]);
  k.box(PAL.plate, [0.38, 0.13, 0.02], [0, 0.64, -2.91]);
  // continental trunk hump + hood ornament (small gold kestrel, original)
  k.box(white, [0.7, 0.08, 0.5], [0, 0.94, -2.55], { c: 0.03, taper: [0.9, 0.9] });
  k.cyl(gold, 0.06, 0.08, 0.04, [0, 0.92, 2.6], { seg: 6 });
  beam(k, gold, [0, 0.97, 2.66], [0, 1.0, 2.52], 0.035, 0.04);
  for (const sd of [1, -1]) beam(k, gold, [0, 0.99, 2.6], [sd * 0.1, 1.04, 2.48], 0.06, 0.012);
  // long antenna
  k.box('#111', [0.012, 0.8, 0.012], [-0.85, 1.28, -2.3]);
  // wheels: white walls, chrome + gold caps; rear pulled in under the skirts
  const wg = whitewallWheelGeo(0.36, 0.24, { cap: PAL.chrome, center: gold });
  addWheelGeo(k, rig, 'wheel_fl', [hw - 0.11, 0.36, s.wheel.zf], wg, 1);
  addWheelGeo(k, rig, 'wheel_fr', [-(hw - 0.11), 0.36, s.wheel.zf], wg, -1);
  addWheelGeo(k, rig, 'wheel_rl', [hw - 0.17, 0.36, s.wheel.zr], wg, 1);
  addWheelGeo(k, rig, 'wheel_rr', [-(hw - 0.17), 0.36, s.wheel.zr], wg, -1);
  // dark skirt line where the rear wheel tucks under
  k.side('#1a1a1b', hw, [[s.wheel.zr - 0.44, 0.3], [s.wheel.zr + 0.44, 0.3], [s.wheel.zr + 0.4, 0.34], [s.wheel.zr - 0.4, 0.34]], { off: 0.02 });
  finish(g, k, rig);
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// CHOPPER — biker + motorcycle. v0–3 the Rattlers (leather vests, coiled-snake
// back patch, bandanas); v4 a lone touring rider. Adults only. (~2.7 × 0.9 × 1.7)
// ═════════════════════════════════════════════════════════════════════════════
const VEST = '#2a2220';
const RIDERS = [
  { tank: '#7a2f2a', frame: '#1c1c1e', shirt: '#7e8790', sleeve: 'tee', head: { type: 'bandana', color: '#1f2a44', beard: PAL.hair[0], hair: PAL.hair[0] }, skin: PAL.skin[1], bars: 'ape', sissy: true, gang: true },
  { tank: '#b5652f', frame: PAL.chrome, shirt: '#e2dccb', sleeve: 'tee', head: { type: 'halfhelmet', color: '#1e1f21', goggles: '#c9a24a', beard: PAL.hair[3], hair: PAL.hair[3] }, skin: PAL.skin[3], bars: 'drag', sissy: false, gang: true },
  { tank: '#3e4a36', frame: '#1c1c1e', shirt: '#8a3a30', sleeve: 'tank', head: { type: 'bandana', color: '#2d2d2d', beard: PAL.hair[4], hair: PAL.hair[4] }, skin: PAL.skin[0], bars: 'ape', sissy: true, gang: true },
  { tank: '#4a3d5a', frame: PAL.chrome, shirt: '#55654f', sleeve: 'long', head: { type: 'bandana', color: '#7a2f2a', hair: PAL.hair[5], shades: true }, skin: PAL.skin[4], bars: 'tall', sissy: false, gang: true },
  { tank: '#6f8fb0', frame: '#2a2a2c', shirt: '#4a5f7a', sleeve: 'long', head: { type: 'halfhelmet', color: '#c8c9c4', goggles: '#3c4a52', beard: PAL.hair[3], hair: PAL.hair[3] }, skin: PAL.skin[1], bars: 'drag', sissy: false, gang: false, touring: true },
];

/** Original Rattlers back patch: coiled rattlesnake on a bone disc, top + bottom rockers. */
function rattlerPatchTex() {
  return signTexture({
    key: 'xveh_rattlers_patch', w: 256, h: 300, bg: VEST,
    draw(ctx, w) {
      const cx = w / 2, cyy = 152, bone = '#e2d8be', red = '#8e2a22';
      const band = (r0, r1, a0, a1, text, up) => {
        const n = 24, pts = [];
        for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); pts.push([cx + Math.cos(a) * r1, cyy + Math.sin(a) * r1]); }
        for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * (i / n); pts.push([cx + Math.cos(a) * r0, cyy + Math.sin(a) * r0]); }
        ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
        ctx.fillStyle = bone; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = red; ctx.stroke();
        ctx.fillStyle = red; ctx.font = '900 25px "Arial Black","Arial Bold",Arial,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const rm = (r0 + r1) / 2;
        for (let i = 0; i < text.length; i++) {
          const a = a0 + (a1 - a0) * ((i + 0.5) / text.length);
          ctx.save(); ctx.translate(cx + Math.cos(a) * rm, cyy + Math.sin(a) * rm); ctx.rotate(a + (up ? Math.PI / 2 : -Math.PI / 2)); ctx.fillText(text[i], 0, 1); ctx.restore();
        }
      };
      band(104, 140, Math.PI * 1.17, Math.PI * 1.83, 'RATTLERS', true);
      band(104, 136, Math.PI * 0.8, Math.PI * 0.2, 'DESERT', false);
      // centre disc
      ctx.beginPath(); ctx.arc(cx, cyy, 92, 0, Math.PI * 2); ctx.fillStyle = bone; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = red; ctx.stroke();
      // coiled snake: spiral body (tail outside, head in the middle)
      const N = 110, turns = 1.85, pts = [];
      for (let i = 0; i <= N; i++) { const t = i / N; const a = -Math.PI / 2 + 0.5 + t * turns * Math.PI * 2; const r = 66 - t * 44; pts.push([cx + Math.cos(a) * r, cyy + 8 + Math.sin(a) * r * 0.9]); }
      const path = () => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#2a1d14'; ctx.lineWidth = 21; path(); ctx.stroke();
      ctx.strokeStyle = '#b48d55'; ctx.lineWidth = 14; path(); ctx.stroke();
      for (let i = 3; i < N - 2; i += 5) { const [x, y] = pts[i]; ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#5b3a22'; ctx.fillRect(-3.6, -3.6, 7.2, 7.2); ctx.restore(); }
      // rattle at the outer (tail) end, pointing up-left
      const [tx, ty] = pts[0];
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(tx - 6 - i * 7, ty - 8 - i * 9, 7, 5.5, -0.9, 0, Math.PI * 2); ctx.fillStyle = i % 2 ? '#c9b07a' : '#9a7a4a'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#2a1d14'; ctx.stroke(); }
      // raised head at the centre, jaws open toward the upper right
      const [hx, hy] = pts[N];
      ctx.save(); ctx.translate(hx + 4, hy - 16); ctx.rotate(-0.5);
      ctx.beginPath(); ctx.moveTo(-10, 12); ctx.lineTo(-14, -8); ctx.lineTo(4, -16); ctx.lineTo(24, -12); ctx.lineTo(12, -4); ctx.lineTo(26, 4); ctx.lineTo(4, 8); ctx.closePath();
      ctx.fillStyle = '#b48d55'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#2a1d14'; ctx.stroke();
      ctx.fillStyle = '#f2ead6'; ctx.beginPath(); ctx.moveTo(18, -10); ctx.lineTo(16, -3); ctx.lineTo(14, -9); ctx.fill();
      ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(2, -8, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = red; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(26, -4); ctx.lineTo(36, -6); ctx.moveTo(32, -5); ctx.lineTo(37, -10); ctx.moveTo(32, -5); ctx.lineTo(37, -1); ctx.stroke();
      ctx.restore();
    },
  });
}

export function buildChopper(variant = 0) {
  const R = RIDERS[variant % RIDERS.length];
  const g = root('chopper', variant, { w: 0.9, h: 1.7, l: 2.7 });
  const k = new Kit(3600 + variant);
  const rig = vrig();
  const chrome = PAL.chrome, frame = R.frame, dark = '#1d1d1f';
  const zR = -0.82, zF = 1.18, rR = 0.34, rF = 0.36;
  const head = [0, 1.05, 0.56];
  // frame
  beam(k, frame, head, [0, 0.66, -0.36], 0.06, 0.06);
  beam(k, frame, head, [0, 0.3, 0.28], 0.06, 0.06);
  for (const s of [1, -1]) {
    beam(k, frame, [s * 0.09, 0.3, 0.28], [s * 0.1, rR, zR], 0.045, 0.045);
    beam(k, frame, [s * 0.09, 0.66, -0.36], [s * 0.1, rR, zR], 0.045, 0.045);
    // raked fork
    beam(k, chrome, [s * 0.08, head[1] + 0.05, head[2] - 0.03], [s * 0.08, rF, zF], 0.045, 0.045);
  }
  k.box(chrome, [0.24, 0.05, 0.12], [0, head[1] + 0.03, head[2]], { rot: [-0.9, 0, 0] });
  // V-twin
  k.box('#4a4c50', [0.26, 0.22, 0.42], [0, 0.4, 0.02], { c: 0.04 });
  tube(k, '#2c2d30', [0, 0.46, 0.06], [0, 0.82, 0.26], 0.09, 0.085, 8);
  tube(k, '#2c2d30', [0, 0.46, -0.02], [0, 0.82, -0.18], 0.09, 0.085, 8);
  k.box(chrome, [0.2, 0.08, 0.16], [0, 0.85, 0.27], { rot: [-0.5, 0, 0], c: 0.02 });
  k.box(chrome, [0.2, 0.08, 0.16], [0, 0.85, -0.19], { rot: [0.4, 0, 0], c: 0.02 });
  k.cyl(chrome, 0.12, 0.12, 0.06, [-0.15, 0.62, 0.05], { axis: 'x', seg: 10 });           // air cleaner (right)
  k.box(chrome, [0.05, 0.22, 0.42], [0.15, 0.36, -0.12], { c: 0.04 });                      // primary (left)
  // exhausts (right side, staggered)
  for (const [y, zz] of [[0.36, 0.12], [0.46, -0.04]]) {
    tube(k, chrome, [-0.1, 0.7, zz + 0.12], [-0.2, y, zz], 0.04, 0.04, 6);
    tube(k, chrome, [-0.2, y, zz], [-0.22, y + 0.06, -1.0], 0.04, 0.045, 6);
  }
  // tank, seat, fenders, headlight, pegs
  const tf = beam(k, R.tank, [0, 0.98, 0.5], [0, 0.88, -0.02], 0.3, 0.24, { c: 0 });
  frameBox(k, R.tank, tf, [0, 0, 0.03], [0.28, 0.42, 0.22], { c: 0.07 });
  frameBox(k, shade(R.tank, 1.25), tf, [0, 0.02, 0.12], [0.06, 0.4, 0.04]);
  beam(k, '#2b211c', [0, 0.72, -0.08], [0, 0.66, -0.6], 0.3, 0.09);
  k.box(R.tank, [0.24, 0.05, 0.5], [0, rR + 0.4, zR + 0.02], { rot: [-0.35, 0, 0] });
  k.box(PAL.taillight, [0.1, 0.05, 0.04], [0, rR + 0.34, zR - 0.26]);
  k.cyl(chrome, 0.1, 0.12, 0.12, [0, 0.98, 0.78], { axis: 'z', seg: 8 });
  k.cyl(PAL.headlight, 0.09, 0.09, 0.02, [0, 0.98, 0.85], { axis: 'z', seg: 8 });
  for (const s of [1, -1]) beam(k, dark, [s * 0.1, 0.42, 0.42], [s * 0.3, 0.42, 0.44], 0.04, 0.04);
  // bars
  const grips = R.bars === 'ape' ? [0.37, 1.4, 0.36] : R.bars === 'tall' ? [0.36, 1.24, 0.4] : [0.38, 1.1, 0.48];
  for (const s of [1, -1]) {
    const riser = [s * 0.1, head[1] + 0.06, head[2] - 0.05];
    const top = [s * 0.28, grips[1] + 0.04, grips[2] + 0.12];
    beam(k, chrome, riser, top, 0.035, 0.035, { ext: 0.02 });
    beam(k, chrome, top, [s * grips[0], grips[1], grips[2]], 0.035, 0.035, { ext: 0.02 });
    k.box('#141414', [0.12, 0.05, 0.05], [s * (grips[0] + 0.03), grips[1], grips[2] - 0.02]);
  }
  if (R.sissy) for (const s of [1, -1]) beam(k, chrome, [s * 0.11, 0.66, -0.6], [s * 0.11, 1.32, -0.7], 0.03, 0.03);
  if (R.sissy) beam(k, chrome, [0.11, 1.32, -0.7], [-0.11, 1.32, -0.7], 0.03, 0.03);
  if (R.touring) {
    beam(k, '#5f7079', [0, 1.16, 0.74], [0, 1.52, 0.62], 0.55, 0.02, { hint: [0, 0, 1] });
    for (const s of [1, -1]) k.box('#3a2a20', [0.18, 0.32, 0.46], [s * 0.3, 0.62, -0.68], { c: 0.05 });
  }
  // rider
  const hip = [0, 0.84, -0.3];
  const rb = rig.add('rider', hip, 'body');
  let fig;
  const tee = R.sleeve !== 'long';
  k.withBone(rb, () => {
    fig = figure(k, {
      hip, lean: -0.1,
      skin: R.skin, top: R.shirt, sleeve: R.sleeve === 'tank' ? R.skin : R.shirt, forearm: tee ? R.skin : R.shirt,
      bottom: '#3f4b62', boots: '#3a2a20', gloves: R.gang ? '#2a211b' : R.skin, bootShaft: true,
      head: R.head, vest: R.gang ? { color: VEST } : null,
      hands: [[grips[0], grips[1], grips[2]], [-grips[0], grips[1], grips[2]]], feet: [[0.28, 0.46, 0.46], [-0.28, 0.46, 0.46]],
      armHint: [0.6, -0.4, -0.5], legHint: [0.4, 0.7, 0.4],
    });
  });
  if (!R.gang) frameBox(k, shade(R.shirt, 0.8), fig.torso, [0, -0.2, 0], [0.44, 0.08, 0.27]);   // jacket hem
  addWheelGeo(k, rig, 'wheel_f', [0, rF, zF], bikeWheelGeo(rF, 0.1, { rim: chrome, spokes: 7 }), 1);
  addWheelGeo(k, rig, 'wheel_r', [0, rR, zR], bikeWheelGeo(rR, 0.24, { rim: R.frame === PAL.chrome ? chrome : '#8d8b84', spokes: 5 }), 1);
  const bones = finish(g, k, rig);
  if (R.gang) {
    // back patch on the vest: faces −Z along the (leaning) torso
    const f = fig.torso;
    const c = f.C.clone().addScaledVector(f.Y, 0.03).addScaledVector(f.Z, -0.148);
    const m = addSign(bones.rider, rattlerPatchTex(), 0.32, 0.375, [c.x - hip[0], c.y - hip[1], c.z - hip[2]], [0, 0, 0], 'patch', VEST);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.X.clone().negate(), f.Y, f.Z.clone().negate()));
  }
  return g;
}
