// ─────────────────────────────────────────────────────────────────────────────
// Round 3 (agent R3-START) — industrial edge of the Ironworks District.
//   tank_farm (2)     bunded fuel tank farm: round tanks, ladders, catwalks, pipes, pump house
//   pumpjack (2)      nodding donkey; named parts `head` (walking beam, rotation.x) + `crank` (rotation.x)
//   pipe_bridge       steel pipe rack spanning the road (towers at local x = ±13.5, 6.8 m clearance)
//   refinery_gate     closed refinery gate across the road: arch sign, booth, boom, sliding gates
//   utility_pole (3)  wooden pole + crossarm, three sagging wires to the next pole (span 32 m, both sides)
// Roadside fronts face local +Z; road-spanning kinds span local X (place with yaw = road heading).
// Origin = ground centre. Budgets: props ≤ 1 500 tris, buildings ≤ 2 600.
// ─────────────────────────────────────────────────────────────────────────────
import {
  THREE, Kit, root, rng, empty, PAL, mix, shade, wr, C, vwrap, beam, rod, railing, ladder, drum,
  addPanel, plateSign, glowSign, signTexture, fitText, FONTS, addLit, fitSize, linkRun, linkMesh, S,
} from './r3-start-kit.js';
import { trussX, arcPanel } from './city-kit.js';

const PI = Math.PI;

// ═════════════════════════════════════════════════════════════════════════════
// Tank farm
// ═════════════════════════════════════════════════════════════════════════════
function bund(k, W, D, gap = 6) {
  const h = 0.9, t = 0.3, col = (cx, cy, cz, nx, ny) => (ny > 0.5 ? '#b9b4a8' : S.concrete);
  k.box(S.gravel, [W + 1.2, 0.05, D + 1.2], [0, 0, 0], { base: true });
  k.box(col, [W, h, t], [0, 0, -D / 2 + t / 2], { base: true });
  for (const s of [-1, 1]) k.box(col, [t, h, D - 2 * t], [s * (W / 2 - t / 2), 0, 0], { base: true });
  const half = (W - gap) / 2;
  for (const s of [-1, 1]) k.box(col, [half, h, t], [s * (gap / 2 + half / 2), 0, D / 2 - t / 2], { base: true });
  // grime line along the foot of the walls
  for (const s of [-1, 1]) k.rectZ(mix(S.concrete, S.dirt, 0.45), s * (D / 2), [-W / 2, W / 2], [0, 0.25], s, { off: 0.01 });
  // ramps over the wall at the gate (vehicles) — two kerbs
  for (const s of [-1, 1]) k.box('#9d998f', [0.25, 0.25, 1.4], [s * gap / 2, 0, D / 2 + 0.4], { base: true });
}
/** Vertical cylindrical tank at (x, z): shell, bands, grime, roof, top rail on the front half, cage ladder at angle a. */
function tank(k, x, z, R, H, o = {}) {
  const col = o.color || S.tank, seg = o.seg || 16;
  k.cyl(col, R, R, H, [x, 0, z], { base: true, seg, open: true });
  k.cyl(mix(col, S.dirt, 0.4), R + 0.012, R + 0.012, 0.9, [x, 0, z], { base: true, seg, open: true });
  for (const t of o.bands || [0.45, 0.85]) k.cyl(shade(col, 0.86), R + 0.03, R + 0.03, 0.14, [x, H * t, z], { seg, open: true });
  // rust weeping from the top seam (a few streaks)
  const r = rng(o.seed || 11);
  for (let i = 0; i < (o.streaks ?? 3); i++) {
    const a = r() * PI * 2, len = 1.2 + r() * 2.6;
    k.box(mix(col, S.tankRust, 0.55), [0.3, len, 0.04], [x + Math.sin(a) * (R + 0.02), H - len / 2 - 0.2, z + Math.cos(a) * (R + 0.02)], { rot: [0, a, 0] });
  }
  // shallow cone roof + vent
  k.lathe(o.roof || shade(col, 0.92), [[R + 0.12, 0], [0, R * 0.16]], seg, [x, H, z]);
  k.cyl('#7a7f80', 0.3, 0.3, 0.6, [x + R * 0.35, H + R * 0.1, z - R * 0.2], { base: true, seg: 6 });
  // top handrail on the front half (posts + arc rail)
  const a0 = o.railA ?? -PI / 2, n = 4;
  for (let i = 0; i <= n; i++) {
    const a = a0 + (i / n) * PI;
    k.box('#e2dccb', [0.06, 1.0, 0.06], [x + Math.sin(a) * (R - 0.15), H + 0.02, z + Math.cos(a) * (R - 0.15)], { base: true });
  }
  k.at([x, H + 1.02, z], [0, a0 + PI / 2, 0], () => k.torus('#e2dccb', R - 0.15, 0.035, [0, 0, 0], { rot: [PI / 2, 0, 0], rs: 3, ts: 10, arc: PI }));
  // cage ladder at angle la (default: facing +Z)
  const la = o.ladderA ?? 0;
  k.at([x, 0, z], [0, la, 0], () => {
    ladder(k, '#3a3b3d', { axis: 'z', at: R, dir: 1, u: [-1, 1] }, 0, 0.3, H + 0.9, 0.22, 0.48);
    k.torus('#3a3b3d', 0.42, 0.025, [0, H * 0.75, R + 0.45], { rot: [PI / 2, 0, 0], rs: 3, ts: 6, arc: PI });
  });
  return { x, z, R, H };
}
/** Point on a tank's top edge toward (tx, tz). */
function edgeToward(t, tx, tz, inset = 0) {
  const dx = tx - t.x, dz = tz - t.z, l = Math.hypot(dx, dz) || 1;
  return [t.x + dx / l * (t.R - inset), t.z + dz / l * (t.R - inset)];
}
function catwalk(k, a, ay, b, by) {
  const g = '#5d6367';
  beam(k, g, [a[0], ay, a[1]], [b[0], by, b[1]], [0.9, 0.08]);
  const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
  const nx = -dz / l * 0.45, nz = dx / l * 0.45;
  for (const s of [-1, 1]) railing(k, '#e2dccb', [a[0] + s * nx, ay, a[1] + s * nz], [b[0] + s * nx, by, b[1] + s * nz], 1.0, { step: 2.2, noMid: true });
}
/** Pipe polyline [[x,y,z]…] with a flange at every joint. */
function pipe(k, col, pts, r = 0.18, seg = 6) {
  for (let i = 0; i < pts.length - 1; i++) rod(k, col, pts[i], pts[i + 1], r, seg);
  for (let i = 1; i < pts.length - 1; i++) k.cyl(shade(col, 0.8), r * 1.35, r * 1.35, r * 1.2, pts[i], { seg, rot: [0, 0, 0] });
}
function valve(k, x, y, z, axis = 'z') {
  k.cyl('#5f6468', 0.22, 0.22, 0.4, [x, y, z], { axis, seg: 6 });
  k.cyl('#5f6468', 0.04, 0.04, 0.45, [x, y + 0.2, z], { base: true, seg: 4 });
  k.box('#9c3a2e', [0.42, 0.05, 0.06], [x, y + 0.66, z]); k.box('#9c3a2e', [0.06, 0.05, 0.42], [x, y + 0.66, z]);
}
function pumpHouse(k, lk, x, z, rotY = 0) {
  k.at([x, 0, z], [0, rotY, 0], () => {
    k.box('#c9c0a8', [3.6, 2.5, 2.6], [0, 0, 0], { base: true });
    k.box('#8f8a80', [4.0, 0.15, 3.0], [0, 2.5, 0], { base: true });
    k.rectZ('#5f7f72', 1.31, [-1.4, -0.4], [0, 2.0], 1, { off: 0.01 });
    k.rectZ('#3a464c', 1.31, [0.4, 1.4], [1.2, 1.9], 1, { off: 0.01 });
    k.rectZ(mix('#c9c0a8', S.dirt, 0.4), 1.31, [-1.8, 1.8], [0, 0.4], 1, { off: 0.008 });
    vent(k, 1.0, 2.65, -0.6);
  });
  lk.at([x, 0, z], [0, rotY, 0], () => lk.box('#fff', [0.35, 0.18, 0.12], [-0.9, 2.2, 1.38]));
}
function vent(k, x, y, z) { k.cyl('#7d7f80', 0.18, 0.18, 0.6, [x, y, z], { base: true, seg: 5 }); k.cone('#5f6064', 0.3, 0.2, [x, y + 0.6, z], { base: true, seg: 5 }); }
/** Floodlight mast with two lamp heads (lit). */
function floodMast(k, lk, x, z, h = 9, rotY = 0) {
  k.cyl('#6f7478', 0.12, 0.16, h, [x, 0, z], { base: true, seg: 6 });
  k.box(C.concrete, [0.7, 0.4, 0.7], [x, 0, z], { base: true });
  k.at([x, h, z], [0, rotY, 0], () => {
    k.box('#5d6367', [1.4, 0.1, 0.1], [0, 0, 0]);
    for (const s of [-1, 1]) k.box('#3a3b3d', [0.5, 0.35, 0.3], [s * 0.55, -0.15, 0.12], { rot: [0.5, 0, 0] });
  });
  lk.at([x, h, z], [0, rotY, 0], () => { for (const s of [-1, 1]) lk.box('#fff', [0.42, 0.04, 0.24], [s * 0.55, -0.32, 0.22], { rot: [0.5, 0, 0] }); });
}

export function buildTankFarm(variant = 0) {
  const v = vwrap(variant, 2);
  const g = root('tank_farm', v, { w: v ? 30 : 34, h: v ? 16 : 13, l: v ? 24 : 26 }, { style: v ? 'refinery' : 'fuel depot' });
  const k = new Kit(5100 + v); k.floor = 0;
  const lk = new Kit(5110 + v);
  if (v === 0) {
    const W = 34, D = 26;
    bund(k, W - 1, D - 1, 6);
    const T1 = tank(k, -7.5, -3.5, 7, 10.5, { seed: 5101, ladderA: -1.1 });
    const T2 = tank(k, 8.5, -6.2, 4.6, 8.2, { seed: 5102, ladderA: PI / 2, color: '#cfc9b6' });
    const T3 = tank(k, 9.0, 5.0, 4.6, 8.2, { seed: 5103, ladderA: PI / 2 + 0.2, railA: 0 });
    // catwalks: T1 → T2 (sloped), T2 → T3 (flat)
    catwalk(k, edgeToward(T1, T2.x, T2.z, 0.3), T1.H + 0.25, edgeToward(T2, T1.x, T1.z, 0.3), T2.H + 0.2);
    catwalk(k, edgeToward(T2, T3.x, T3.z, 0.3), T2.H + 0.2, edgeToward(T3, T2.x, T2.z, 0.3), T3.H + 0.2);
    // outlet pipes → front header → pump outlet through the gate
    const pc = '#8f969a', y = 0.55;
    pipe(k, pc, [[-7.5, y, 3.4], [-7.5, y, 10.6]], 0.2);
    pipe(k, pc, [[9.0, y, 9.5], [9.0, y, 10.6]], 0.18);
    pipe(k, pc, [[13.0, y, -6.2], [14.8, y, -6.2], [14.8, y, 10.6]], 0.18);
    pipe(k, '#a3a19a', [[-10, y + 0.1, 10.6], [14.8, y + 0.1, 10.6]], 0.26);
    pipe(k, '#9c4a32', [[0.5, y + 0.1, 10.6], [0.5, y + 0.1, 12.0], [0.5, 2.6, 12.0], [0.5, 2.6, 14.0]], 0.16);
    for (let xx = -9; xx < 15; xx += 4) k.box(S.concrete, [0.5, 0.4, 0.5], [xx, 0, 10.6], { base: true });
    for (const xx of [-7.5, 9.0, 14.8]) valve(k, xx, y, 9.7, 'z');
    pumpHouse(k, lk, -11.5, 8.6, PI);
    floodMast(k, lk, 15.2, 11.6, 9, PI + 0.6);
    floodMast(k, lk, -15.2, -11.2, 9, 0.6);
    // drums by the pump house
    drum(k, -14.2, 10.4, '#3e5a7a'); drum(k, -13.5, 11.0, '#9c4a32');
    g.add(k.mesh('body'));
    addLit(g, lk, 'bulb');
    // lettering on the big tank + numbers + bund warning plates
    const tex = signTexture({
      key: 'r3s_tank_letters', w: 1024, h: 180, bg: S.tank,
      draw: (ctx, Wc, Hc) => {
        ctx.fillStyle = '#9c3a2e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        fitText(ctx, 'DRY CREEK FUEL CO.', Wc / 2, Hc * 0.52, Wc * 0.92, 130, '900', FONTS.SANS);
        const r = rng(5104); ctx.fillStyle = 'rgba(217,212,196,0.55)';
        for (let i = 0; i < 160; i++) ctx.fillRect(r() * Wc, r() * Hc, 5 + r() * 26, 3 + r() * 6);
      },
    });
    arcPanel(g, tex, 7.04, 1.5, 7.2, -0.75, 1.5, { fallback: S.tank, x: -7.5, z: -3.5 });
    const n2 = plateSign('r3s_tank_no2', '2', null, { bg: S.tank, fg: '#3b4a52', border: false, w: 128, h: 128, px: 110 });
    const n3 = plateSign('r3s_tank_no3', '3', null, { bg: S.tank, fg: '#3b4a52', border: false, w: 128, h: 128, px: 110 });
    addPanel(g, n2, 1.3, 1.3, [8.5 + Math.sin(-0.9) * 4.68, 5.4, -6.2 + Math.cos(-0.9) * 4.68], -0.9);
    addPanel(g, n3, 1.3, 1.3, [9.0 + Math.sin(-0.5) * 4.68, 5.4, 5.0 + Math.cos(-0.5) * 4.68], -0.5);
    const warn = plateSign('r3s_flammable', 'FLAMMABLE', 'NO SMOKING · NO OPEN FLAME', { bg: '#d7a93a', fg: '#22262a', w: 512, h: 220 });
    for (const xx of [-9, 7]) addPanel(g, warn, 1.6, 0.69, [xx, 0.47, D / 2 - 0.48], 0);
    const name = plateSign('r3s_depot', 'DRY CREEK FUEL CO.', 'TANK FARM · AUTHORIZED VEHICLES ONLY', { bg: '#e9e2cf', fg: '#2a2622', border: '#9c3a2e', w: 640, h: 220 });
    addPanel(g, name, 3.6, 1.24, [-4.2, 1.7, D / 2 + 0.05], 0);
    const kk = new Kit(5105); kk.floor = 0;
    for (const xx of [-5.7, -2.7]) kk.box('#5f6468', [0.12, 2.4, 0.12], [xx, 0, D / 2], { base: true });
    g.add(kk.mesh('posts'));
  } else {
    const W = 30, D = 24;
    bund(k, W - 1, D - 1, 5);
    const T1 = tank(k, -8.2, -4.2, 5.2, 14, { seed: 5121, bands: [0.3, 0.6, 0.88], ladderA: -1.3, color: '#d4cdb8' });
    const T2 = tank(k, 5.0, -5.4, 5.2, 14, { seed: 5122, bands: [0.3, 0.6, 0.88], ladderA: -0.4, color: '#ddd8c8' });
    catwalk(k, edgeToward(T1, T2.x, T2.z, 0.3), T1.H + 0.2, edgeToward(T2, T1.x, T1.z, 0.3), T2.H + 0.2);
    // LPG bullet on saddles
    const bx = 3.0, bz = 6.6, br = 1.55, bl = 8.0;
    k.cyl('#e6e2d6', br, br, bl, [bx, br + 0.7, bz], { axis: 'x', seg: 10, open: true });
    for (const s of [-1, 1]) k.lathe('#e6e2d6', [[br, 0], [br * 0.7, 0.55], [0, 0.8]], 10, [bx + s * bl / 2, br + 0.7, bz], { rot: [0, 0, -s * PI / 2] });
    for (const s of [-1, 1]) { k.box(S.concrete, [0.6, 1.2, 2.6], [bx + s * 2.6, 0, bz], { base: true }); }
    ladder(k, '#3a3b3d', { axis: 'z', at: bz + br, dir: 1, u: [bx - 1, bx + 1] }, bx - 1.6, 0.2, br * 2 + 0.7, 0.15, 0.44);
    k.box('#5d6367', [1.4, 0.08, 1.0], [bx - 1.6, br * 2 + 0.75, bz], { base: true });
    // pipe rack along the front (3 portals, 3 pipes)
    const rz = 10.4;
    for (const xx of [-12, -2, 8]) { for (const s of [-1, 1]) k.box('#5d6367', [0.25, 3.6, 0.25], [xx, 0, rz + s * 0.6], { base: true }); k.box('#5d6367', [0.3, 0.25, 1.6], [xx, 3.5, rz], { base: true }); }
    const pcs = ['#a3a19a', '#9c4a32', '#c9c2ad'];
    [-0.45, 0.05, 0.5].forEach((dz, i) => pipe(k, pcs[i], [[-14, 3.95 + i * 0.05, rz + dz], [12, 3.95 + i * 0.05, rz + dz]], 0.2 - i * 0.03));
    pipe(k, '#a3a19a', [[-8.2, 0.6, 1.0], [-8.2, 0.6, rz - 0.45], [-8.2, 3.95, rz - 0.45]], 0.2);
    pipe(k, '#9c4a32', [[5.0, 0.6, -0.2], [5.0, 0.6, 3.6], [-0.6, 0.6, 3.6], [-0.6, 4.0, 3.6], [-0.6, 4.0, rz + 0.05]], 0.17);
    valve(k, -8.2, 0.6, 3.0); valve(k, 5.0, 0.6, 1.6);
    pumpHouse(k, lk, -11.0, 7.0, PI / 2);
    floodMast(k, lk, 13.6, 10.6, 10, PI + 0.6);
    g.add(k.mesh('body'));
    addLit(g, lk, 'bulb');
    const tex = signTexture({
      key: 'r3s_refinery_letters', w: 1024, h: 160, bg: '#d4cdb8',
      draw: (ctx, Wc, Hc) => {
        ctx.fillStyle = '#3b4a52'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        fitText(ctx, 'DRY CREEK REFINERY', Wc / 2, Hc * 0.52, Wc * 0.92, 120, '900', FONTS.SANS);
        const r = rng(5123); ctx.fillStyle = 'rgba(212,205,184,0.55)';
        for (let i = 0; i < 140; i++) ctx.fillRect(r() * Wc, r() * Hc, 5 + r() * 26, 3 + r() * 6);
      },
    });
    arcPanel(g, tex, 5.24, 1.3, 10.2, -0.85, 1.7, { fallback: '#d4cdb8', x: -8.2, z: -4.2 });
    const warn = plateSign('r3s_lpg', 'PROPANE', 'FLAMMABLE GAS · NO SMOKING', { bg: '#d7a93a', fg: '#22262a', w: 512, h: 220 });
    addPanel(g, warn, 2.0, 0.86, [bx, br + 0.7, bz + br + 0.03], 0);
  }
  return fitSize(g);
}

// ═════════════════════════════════════════════════════════════════════════════
// Pumpjack — `head` (walking beam + horsehead + bridle + pitman arms) rocks about the
// saddle bearing (rotation.x, ±0.22 rad); `crank` (arms + counterweights) turns (rotation.x).
// The horsehead (+Z) hangs over the wellhead. userData.anim = { period, headAmp }.
// ═════════════════════════════════════════════════════════════════════════════
const PJ = [
  { beam: '#c9a246', post: '#7f878b', box: '#5f6468', weight: '#3a3b3d', motor: '#4f6b6b' },
  { beam: '#8e3a2c', post: '#4f6b6b', box: '#5d6367', weight: '#2f3133', motor: '#3e5a7a' },
];
export function buildPumpjack(variant = 0) {
  const v = vwrap(variant, 2), P = PJ[v];
  const g = root('pumpjack', v, { w: 2.4, h: 6.2, l: 9.4 });
  const k = new Kit(5200 + v); k.floor = 0;
  const PY = 5.4, PZ = 0.6;           // saddle bearing (head pivot)
  const CY = 1.55, CZ = -2.4;         // crank shaft
  // pad, skid, cross members
  k.box('#a39e93', [2.6, 0.2, 9.4], [0, 0, -0.1], { base: true, c: 0.05 });
  for (const s of [-1, 1]) k.box(P.post, [0.22, 0.36, 8.2], [s * 0.62, 0.2, -0.2], { base: true });
  for (const z of [-3.6, -1.2, 1.4, 3.3]) k.box(shade(P.post, 0.85), [1.46, 0.2, 0.22], [0, 0.3, z], { base: true });
  // Samson post (A-frame) + braces + saddle
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(k, P.post, [sx * 0.62, 0.5, PZ + sz * 1.1], [sx * 0.2, PY - 0.25, PZ], 0.2);
  for (const sx of [-1, 1]) beam(k, shade(P.post, 0.85), [sx * 0.5, 2.3, PZ - 0.62], [sx * 0.5, 2.3, PZ + 0.62], 0.1);
  k.box('#4a4c4e', [0.6, 0.32, 0.55], [0, PY - 0.42, PZ], { base: true });
  // ladder up the post
  for (const s of [-1, 1]) beam(k, '#3a3b3d', [s * 0.22, 0.5, PZ + 1.35], [s * 0.22, PY - 0.6, PZ + 0.35], 0.05);
  for (let i = 1; i < 10; i++) { const t = i / 10; k.box('#3a3b3d', [0.44, 0.04, 0.04], [0, 0.5 + t * (PY - 1.1), PZ + 1.35 - t * 1.0]); }
  // gearbox + shaft + motor + belt guard
  k.box(P.box, [1.0, 1.15, 1.25], [0, 0.5, CZ], { base: true, c: 0.06 });
  k.cyl('#3a3b3d', 0.12, 0.12, 2.1, [0, CY, CZ], { axis: 'x', seg: 6 });
  k.box(shade(P.box, 0.8), [1.3, 0.25, 1.5], [0, 0.4, CZ], { base: true });
  k.cyl(P.motor, 0.36, 0.36, 0.95, [0, 0.95, -4.05], { axis: 'z', seg: 8 });
  k.box(shade(P.motor, 0.8), [0.8, 0.12, 1.1], [0, 0.5, -4.05], { base: true });
  k.box(P.beam, [0.16, 1.15, 1.6], [0.62, 0.5, -3.3], { base: true, rot: [0.3, 0, 0] });
  // wellhead, stuffing box, polished rod, flowline
  const WZ = 4.05;
  k.box('#5f6468', [0.9, 0.12, 0.9], [0, 0.02, WZ], { base: true });
  k.cyl('#7f878b', 0.16, 0.16, 1.1, [0, 0.1, WZ], { base: true, seg: 6 });
  k.cyl('#7f878b', 0.11, 0.11, 0.9, [0, 0.7, WZ], { axis: 'x', seg: 6 });
  k.cyl('#9c3a2e', 0.12, 0.12, 0.1, [0.48, 0.7, WZ], { axis: 'x', seg: 6 });
  k.cyl('#5f6468', 0.12, 0.12, 0.35, [0, 1.2, WZ], { base: true, seg: 6 });
  rod(k, '#d9d4c4', [0, 1.5, WZ], [0, 2.15, WZ], 0.035, 4);
  rod(k, '#5f6468', [-0.45, 0.7, WZ], [-0.45, 0.2, WZ], 0.08, 5);
  rod(k, '#5f6468', [-0.45, 0.2, WZ], [-0.45, 0.2, WZ + 2.2], 0.08, 5);
  k.box('#e9e2cf', [0.03, 0.32, 0.6], [0.66, 1.0, CZ]);   // well plate (vertex colour: a live pumpjack stays at 3 meshes)
  g.add(k.mesh('body'));

  // ── head (pivot at the saddle bearing) ──
  const kh = new Kit(5210 + v);
  const BL0 = -3.1, BL1 = 3.35;      // beam ends (relative to the pivot)
  kh.box((cx, cy, cz, nx, ny) => (ny > 0.5 ? shade(P.beam, 1.08) : P.beam), [0.34, 0.55, BL1 - BL0], [0, 0.05, (BL0 + BL1) / 2], { c: 0.03 });
  kh.box(shade(P.beam, 0.82), [0.38, 0.1, BL1 - BL0 - 0.4], [0, 0.34, (BL0 + BL1) / 2]);
  // horsehead: arc centred on the pivot (radius R) so the bridle stays plumb
  const R = WZ - PZ, pts = [];
  for (let i = 0; i <= 6; i++) { const a = 0.22 - (i / 6) * 0.95; pts.push([Math.cos(a) * R, Math.sin(a) * R]); }
  for (let i = 6; i >= 0; i--) { const a = 0.22 - (i / 6) * 0.95; pts.push([Math.cos(a) * (R - 0.75), Math.sin(a) * (R - 0.75) + (i === 0 ? 0 : 0)]); }
  kh.extrude((cx, cy, cz, nx, ny, nz) => (nz > 0.5 ? shade(P.beam, 0.9) : P.beam), pts, 0.62, { axis: 'x' });
  // bridle (two wire ropes) + carrier bar, hanging from the horsehead face to the polished rod top
  const by0 = Math.sin(-0.73) * R, bz = R;
  for (const s of [-1, 1]) rod(kh, '#2a2a2a', [s * 0.13, by0 + 0.4, bz + 0.03], [s * 0.13, 2.25 - PY, bz], 0.025, 3);
  kh.box('#3a3b3d', [0.5, 0.1, 0.14], [0, 2.2 - PY, bz]);
  // equalizer + pitman arms down toward the crank pins
  kh.box('#3a3b3d', [2.0, 0.26, 0.45], [0, -0.32, CZ - PZ]);
  for (const s of [-1, 1]) beam(kh, '#4a4c4e', [s * 0.92, -0.3, CZ - PZ], [s * 0.92, CY + 0.95 - PY, CZ - PZ + 0.15], [0.14, 0.2]);
  // walkway handrail stub at the front + painted bands
  for (const z of [-2.6, -1.0, 0.8, 2.4]) kh.rectX(shade(P.beam, 0.75), 0.172, [z - 0.06, z + 0.06], [-0.2, 0.3], 1, { off: 0.004 });
  for (const z of [-2.6, -1.0, 0.8, 2.4]) kh.rectX(shade(P.beam, 0.75), -0.172, [z - 0.06, z + 0.06], [-0.2, 0.3], -1, { off: 0.004 });
  const head = new THREE.Object3D(); head.name = 'head'; head.position.set(0, PY, PZ);
  head.add(kh.mesh('head_mesh'));
  g.add(head);

  // ── crank (arms + counterweights) ──
  const kc = new Kit(5220 + v);
  for (const s of [-1, 1]) {
    kc.box(shade(P.box, 0.9), [0.16, 2.0, 0.42], [s * 0.82, -0.25, 0]);
    kc.box(P.weight, [0.3, 0.8, 1.3], [s * 0.88, -0.95, 0], { c: 0.05 });
    kc.rectX(P.beam, s * 1.035, [-0.6, 0.6], [-1.0, -0.85], s, { off: 0.004 });
    kc.cyl('#2a2a2a', 0.1, 0.1, 0.16, [s * 0.95, 0.65, 0], { axis: 'x', seg: 6 });
  }
  const crank = new THREE.Object3D(); crank.name = 'crank'; crank.position.set(0, CY, CZ);
  crank.add(kc.mesh('crank_mesh'));
  g.add(crank);

  g.userData.anim = { period: 6.5, headAmp: 0.22, note: 'head.rotation.x = headAmp·sin(2πt/period); crank.rotation.x = −2πt/period (same phase)' };
  g.userData.live = true;
  return fitSize(g);
}

// ═════════════════════════════════════════════════════════════════════════════
// Pipe bridge — spans local X across the road; towers at x = ±13.5; truss underside 6.8 m.
// ═════════════════════════════════════════════════════════════════════════════
export function buildPipeBridge() {
  const g = root('pipe_bridge', 0, { w: 43, h: 9.2, l: 3.4 });
  const k = new Kit(5300); k.floor = 0;
  const st = '#7f878b', TX = 13.5, TY = 7.4;
  for (const s of [-1, 1]) {
    const x = s * TX;
    for (const dx of [-0.8, 0.8]) for (const dz of [-0.8, 0.8]) {
      beam(k, st, [x + dx, 0.3, dz], [x + dx * 0.8, TY - 0.6, dz * 0.8], 0.24);
      k.box(C.concrete, [0.7, 0.45, 0.7], [x + dx, 0, dz], { base: true });
      k.box(C.safety, [0.27, 0.9, 0.27], [x + dx, 0.45, dz], { base: true });
      k.box('#22262a', [0.28, 0.16, 0.28], [x + dx, 0.75, dz], { base: true });
    }
    for (const dz of [-0.7, 0.7]) {
      rod(k, '#5d6367', [x - 0.75, 0.6, dz], [x + 0.7, TY - 0.8, dz], 0.04, 3);
      rod(k, '#5d6367', [x + 0.75, 0.6, dz], [x - 0.7, TY - 0.8, dz], 0.04, 3);
    }
    for (const y of [2.6, 4.9]) for (const dz of [-0.75, 0.75]) k.box(st, [1.5, 0.14, 0.14], [x, y, dz]);
    // ladder up the outer face
    for (const dz of [-0.22, 0.22]) k.box('#3a3b3d', [0.05, TY - 0.6, 0.05], [x + s * 0.95, 0.3, dz], { base: true });
    for (let y = 0.7; y < TY - 0.4; y += 0.45) k.box('#3a3b3d', [0.04, 0.04, 0.44], [x + s * 0.95, y, 0]);
  }
  // truss across (chords at y = TY ± 0.6)
  k.at([-TX - 1.2, TY, 0], () => trussX(k, st, 2 * TX + 2.4, 1.6, 1.2, 9, 0.17, { noTop: true }));
  k.box('#5d6367', [2 * TX + 2.4, 0.06, 1.7], [0, TY + 0.6, 0], { base: true });
  // pipes on top, dropping down outside the towers and running off along the ground
  const PIPES = [{ r: 0.42, z: -0.42, c: '#c9c2ad' }, { r: 0.3, z: 0.24, c: '#8e3a2c' }, { r: 0.22, z: 0.66, c: '#4f6b6b' }];
  const XE = TX + 2.6, XO = TX + 7.5;
  for (const p of PIPES) {
    const y = TY + 0.66 + p.r;
    for (const s of [-1, 1]) {
      rod(k, p.c, [0, y, p.z], [s * XE, y, p.z], p.r, 8);
      rod(k, p.c, [s * XE, y, p.z], [s * XE, 0.45 + p.r, p.z], p.r, 8);
      rod(k, p.c, [s * XE, 0.45 + p.r, p.z], [s * XO, 0.45 + p.r, p.z], p.r, 8);
      for (const xx of [s * 6.5, s * XE]) k.cyl(shade(p.c, 0.78), p.r * 1.3, p.r * 1.3, 0.14, [xx, y, p.z], { axis: 'x', seg: 8 });
      k.box(C.concrete, [0.5, 0.45, 0.5], [s * (XE + 2.6), 0, p.z], { base: true });
    }
    k.cyl(shade(p.c, 0.78), p.r * 1.3, p.r * 1.3, 0.14, [0, y, p.z], { axis: 'x', seg: 8 });
  }
  // walkway grating under the pipes: handrail on the +Z side
  railing(k, C.safety, [-TX, TY + 0.62, 0.95], [TX, TY + 0.62, 0.95], 1.0, { step: 3.4, noMid: true });
  g.add(k.mesh('body'));
  const tex = plateSign('r3s_pipe_clear', 'CAUTION · OVERHEAD PIPES', 'CLEARANCE 6.8 m', { bg: '#d7a93a', fg: '#22262a', w: 768, h: 200 });
  addPanel(g, tex, 4.6, 1.2, [0, TY, 0.9], 0);
  addPanel(g, tex, 4.6, 1.2, [0, TY, -0.9], PI);
  g.userData.towers = { x: [-TX, TX], r: 1.2, clearance: 6.8, note: 'colliders: circles r 1.2 at local x = ±13.5' };
  return fitSize(g);
}

// ═════════════════════════════════════════════════════════════════════════════
// Refinery gate — closed gate across the road (local X across, front +Z): arch sign,
// guard booth (local +X), boom, chain-link sliding gates + fence wings to x = ±17.
// ═════════════════════════════════════════════════════════════════════════════
export function buildRefineryGate() {
  const g = root('refinery_gate', 0, { w: 34, h: 7.6, l: 4 });
  const k = new Kit(5400); k.floor = 0;
  const lk = new Kit(5401);
  const quads = [];
  const PX = 10.2, PH = 6.6;
  // arch posts + top beam
  for (const s of [-1, 1]) {
    k.box('#5d6367', [0.55, PH, 0.55], [s * PX, 0, -0.6], { base: true });
    k.box(C.concrete, [1.1, 0.5, 1.1], [s * PX, 0, -0.6], { base: true });
    for (let i = 0; i < 4; i++) k.box(i % 2 ? C.iron : C.safety, [0.57, 0.3, 0.57], [s * PX, 0.5 + i * 0.3, -0.6], { base: true });
  }
  k.box('#5d6367', [2 * PX + 0.9, 0.5, 0.5], [0, PH - 0.5, -0.6], { base: true });
  k.box('#3a3836', [13.4, 1.9, 0.18], [0, PH - 1.55, -0.45]);
  for (const s of [-1, 1]) lk.box('#fff', [0.5, 0.16, 0.3], [s * 4.5, PH + 0.15, -0.25]);
  for (const s of [-1, 1]) k.box('#3a3b3d', [0.1, 0.5, 0.5], [s * 4.5, PH, -0.35], { base: true });
  // sliding gates (closed, meeting at x = 0) + fence wings, barbed top
  linkRun(k, quads, [[-17, -1.2], [-PX, -1.2]], 2.1, { barbed: true });
  linkRun(k, quads, [[PX, -1.2], [17, -1.2]], 2.1, { barbed: true });
  for (const s of [-1, 1]) {
    const x0 = s * 0.05, x1 = s * (PX - 0.3);
    linkRun(k, quads, [[x0, -0.9], [x1, -0.9]], 2.1, { step: 2.4 });
    k.box('#a3a6a1', [Math.abs(x1 - x0), 0.08, 0.08], [(x0 + x1) / 2, 1.05, -0.9]);
    beam(k, '#a3a6a1', [x0, 0.1, -0.9], [x1, 2.0, -0.9], 0.05);
    for (const xx of [x1 - s * 0.4, x0 + s * 0.4]) k.cyl('#3a3b3d', 0.12, 0.12, 0.08, [xx, 0.12, -0.9], { axis: 'z', seg: 6 });
  }
  k.box('#5f6468', [2 * PX, 0.08, 0.3], [0, 0.0, -0.9], { base: true });            // gate track
  // guard booth (+X side, outside the left lane) with lit windows
  const BX = 6.6, BZ = 1.0;
  k.box('#d9d0bc', [2.4, 2.6, 2.4], [BX, 0, BZ], { base: true });
  k.box('#9c3a2e', [2.9, 0.22, 2.9], [BX, 2.6, BZ], { base: true });
  k.box('#c9c0a8', [2.6, 0.25, 2.6], [BX, 0, BZ], { base: true });
  for (const [x0, x1] of [[BX - 1.0, BX + 1.0]]) lk.rectZ('#fff', BZ + 1.2, [x0, x1], [1.15, 2.2], 1, { off: 0.012 });
  lk.rectX('#fff', BX - 1.2, [BZ - 0.9, BZ + 0.9], [1.15, 2.2], -1, { off: 0.012 });
  k.rectX('#5f7f72', BX + 1.2, [BZ - 0.5, BZ + 0.5], [0.25, 2.2], 1, { off: 0.012 });
  k.box('#3a3b3d', [0.3, 0.45, 0.2], [BX - 1.25, 1.2, BZ + 1.0]);
  // boom barrier (closed) in front of the gate
  k.box('#5f6468', [0.5, 1.15, 0.5], [4.9, 0, 1.4], { base: true });
  k.box('#d9d0bc', [0.6, 0.3, 0.5], [4.9, 1.15, 1.4], { base: true });
  const arm = 9.4;
  for (let i = 0; i < 9; i++) k.box(i % 2 ? '#e9e4d4' : '#b23a2c', [arm / 9, 0.13, 0.13], [4.9 - arm / 18 - i * arm / 9, 1.08, 1.4]);
  k.box('#5f6468', [0.15, 1.0, 0.15], [4.9 - arm + 0.2, 0, 1.4], { base: true });
  lk.box('#fff', [0.18, 0.12, 0.16], [4.9 - arm + 0.25, 1.22, 1.4]);
  // jersey barriers on the outer lane edges + STOP post
  for (const xx of [-8.4, -5.6]) k.box(C.concrete, [2.6, 0.85, 0.62], [xx, 0, 1.9], { base: true, taper: [1, 0.45] });
  k.box('#5f6468', [0.08, 2.2, 0.08], [3.9, 0, 2.4], { base: true });
  g.add(k.mesh('body'));
  addLit(g, lk, 'warm');
  linkMesh(g, quads);
  const sign = signTexture({
    key: 'r3s_refinery_gate', w: 1024, h: 150, bg: '#e9e2cf',
    draw: (ctx, Wc, Hc) => {
      ctx.strokeStyle = '#9c3a2e'; ctx.lineWidth = 10; ctx.strokeRect(8, 8, Wc - 16, Hc - 16);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#2a2622';
      fitText(ctx, 'DRY CREEK REFINERY', Wc / 2, Hc * 0.4, Wc * 0.9, 70, '900', FONTS.SANS);
      ctx.fillStyle = '#9c3a2e';
      fitText(ctx, 'NO THROUGH ROAD · AUTHORIZED VEHICLES ONLY', Wc / 2, Hc * 0.75, Wc * 0.86, 32, '800', FONTS.SANS);
    },
  });
  addPanel(g, sign, 13.0, 1.9, [0, PH - 1.55, -0.35], 0);
  addPanel(g, sign, 13.0, 1.9, [0, PH - 1.55, -0.55], PI);
  const stop = signTexture({
    key: 'r3s_stop', w: 256, h: 256, bg: '#3a3b3d', weather: false,
    draw: (ctx, W, H) => {
      ctx.fillStyle = '#b23a2c'; ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = (i + 0.5) * PI / 4; ctx.lineTo(W / 2 + Math.cos(a) * W * 0.48, H / 2 + Math.sin(a) * H * 0.48); }
      ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#f1ead8'; ctx.lineWidth = 8; ctx.stroke();
      ctx.fillStyle = '#f1ead8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; fitText(ctx, 'STOP', W / 2, H / 2 + 4, W * 0.75, 96, '900', FONTS.SANS);
    },
  });
  addPanel(g, stop, 0.8, 0.8, [3.9, 2.0, 2.46], 0);
  const nt = plateSign('r3s_gate_plate', 'GATE CLOSED', 'REPORT TO GUARD HOUSE', { bg: '#d7a93a', fg: '#22262a', w: 512, h: 220 });
  addPanel(g, nt, 1.8, 0.77, [-3.0, 1.3, -0.84], 0);
  g.userData.collider = { note: 'segment across local x −17…17 at z −1 (gates + wings), booth box at x 6.6' };
  return fitSize(g);
}

// ═════════════════════════════════════════════════════════════════════════════
// Utility pole — wooden pole, crossarm (along Z), three wires that sag halfway to the next
// pole on BOTH sides (local ±X, span userData.span = 32 m) so a row of poles spaced 32 m apart
// along X reads as continuous wires. v0 plain · v1 transformer + service drop · v2 cobra-head lamp (+Z).
// ═════════════════════════════════════════════════════════════════════════════
export const POLE_SPAN = 32;
export function buildUtilityPole(variant = 0) {
  const v = vwrap(variant, 3);
  const g = root('utility_pole', v, { w: POLE_SPAN, h: 9.8, l: 2.6 });
  const k = new Kit(5500 + v); k.floor = 0;
  const lk = new Kit(5510 + v);
  const wood = '#6f5a44', H = 9.4;
  k.cyl(wood, 0.13, 0.17, H, [0, 0, 0], { base: true, seg: 6 });
  k.box(wood, [0.16, 0.16, 2.6], [0, 8.6, 0]);
  for (const s of [-1, 1]) beam(k, wood, [0, 7.9, 0], [0, 8.55, s * 0.75], 0.06);
  k.box(wood, [0.08, 0.55, 0.08], [0, 9.4, 0], { base: true });
  const attach = [[0, 9.95, 0], [0, 8.85, -1.15], [0, 8.85, 1.15]];
  for (const [, y, z] of attach) k.cyl('#7a8f86', 0.06, 0.08, 0.2, [0, y - 0.2, z], { base: true, seg: 5 });
  for (let y = 2.4; y < 7.2; y += 0.5) k.box('#7a7f83', [0.24, 0.03, 0.05], [0, y, 0.15]);
  k.box('#e2b93b', [0.02, 0.3, 0.16], [0.17, 1.6, 0]);
  // wires: parabolic sag, low point (sag m below the insulators) at ±span/2
  const sag = 1.1, n = 6, half = POLE_SPAN / 2;
  for (const [, y, z] of attach) for (const s of [-1, 1]) {
    let prev = [0, y, z];
    for (let i = 1; i <= n; i++) {
      const t = (i / n) * 0.5;                      // 0 → 0.5 of the full span
      const p = [s * half * (i / n), y - 4 * sag * t * (1 - t), z];
      rod(k, '#2a2a2a', prev, p, 0.022, 3);
      prev = p;
    }
  }
  if (v === 1) {
    k.cyl('#8f948f', 0.32, 0.32, 0.95, [0.42, 6.4, 0], { base: true, seg: 8 });
    k.cyl('#6f746f', 0.34, 0.34, 0.06, [0.42, 7.35, 0], { base: true, seg: 8 });
    k.box('#5f6468', [0.1, 0.5, 0.1], [0.22, 6.8, 0]);
    for (const z of [-0.2, 0.2]) k.cyl('#7a8f86', 0.04, 0.05, 0.25, [0.42, 7.4, z], { base: true, seg: 4 });
    // service drop toward the back (−Z), sagging to a building 9 m away
    let prev = [0.42, 7.1, -0.2];
    for (let i = 1; i <= 3; i++) { const t = i / 3, p = [0.42, 7.1 - 1.0 * t + 0.8 * t * t, -0.2 - 2.1 * t]; rod(k, '#2a2a2a', prev, p, 0.018, 3); prev = p; }
  }
  if (v === 2) {
    beam(k, '#7f878b', [0, 7.0, 0.1], [0, 7.6, 2.2], 0.07);
    k.box('#5f6468', [0.36, 0.16, 0.7], [0, 7.55, 2.45], { rot: [-0.08, 0, 0] });
    lk.box('#fff', [0.28, 0.04, 0.5], [0, 7.46, 2.45]);
  }
  g.add(k.mesh('body'));
  addLit(g, lk, 'bulb');
  g.userData.span = POLE_SPAN;
  g.userData.wireAttach = attach;
  g.userData.collider = { r: 0.25, note: 'pole only (wires are 8.8 m up)' };
  return fitSize(g);
}

export const BUILDERS = {
  tank_farm: { build: (v) => buildTankFarm(v), variants: 2 },
  pumpjack: { build: (v) => buildPumpjack(v), variants: 2 },
  pipe_bridge: { build: () => buildPipeBridge(), variants: 1 },
  refinery_gate: { build: () => buildRefineryGate(), variants: 1 },
  utility_pole: { build: (v) => buildUtilityPole(v), variants: 3 },
};
