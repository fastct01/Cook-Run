// ─────────────────────────────────────────────────────────────────────────────
// Broken Canyon Bridge (Agent ART).
//
// bridge_ramp: local origin = ramp START (world z = bridge.rampStart) at road
//   level, centred on the road. Extends toward +Z for L = lip − rampStart. The
//   TOP of the deck at local z is  y = rampHeight · z / L  (matches
//   Track.surfaceY exactly), so the renderer can place it at
//   (centerX(rampStart), 0, rampStart) with no rotation. The jagged broken end
//   with dangling rebar is at z = L. Pillars drop to y = −canyonDepth.
// bridge_landing: local origin = the far deck's broken edge (world gapEnd) at
//   y = landingHeight; extends toward +Z for (landingEnd − gapEnd).
//
// Both read the bridge config (route.json `bridge`) — pass it to
// buildBridgeRamp(cfg)/buildBridgeLanding(cfg); createModel uses the defaults.
// ─────────────────────────────────────────────────────────────────────────────
import { Kit, root, rng } from './kit.js';
import { PAL, mix, shade } from '../palette.js';

export const DEFAULT_BRIDGE = Object.freeze({
  rampStart: 6250, lip: 6300, rampHeight: 8.0, gapStart: 6300, gapEnd: 6342, landingEnd: 6370,
  landingHeight: 0.0, canyonDepth: 60, deckWidth: 8.6,
});

const DECK = '#5a5752', DECK_EDGE = '#8f8a80', CONC = '#a39e92', CONC_DARK = '#7f7a70', RAIL = '#8a8f92', REBAR = '#5a3a2a';

function guardRails(k, hw, z0, z1, yAt, seg = 10) {
  // concrete kerbs + steel posts + two rails, following the deck slope
  for (const s of [1, -1]) {
    for (let i = 0; i < seg; i++) {
      const za = z0 + (i / seg) * (z1 - z0), zb = z0 + ((i + 1) / seg) * (z1 - z0);
      const ya = yAt(za), yb = yAt(zb);
      const zm = (za + zb) / 2, ym = (ya + yb) / 2, len = Math.hypot(zb - za, yb - ya), ang = Math.atan2(yb - ya, zb - za);
      k.box(CONC, [0.45, 0.45, len + 0.02], [s * (hw - 0.22), ym + 0.22, zm], { rot: [-ang, 0, 0] });
      for (const dy of [0.95, 1.3]) k.box(RAIL, [0.08, 0.14, len + 0.02], [s * (hw - 0.2), ym + dy, zm], { rot: [-ang, 0, 0] });
      k.box(shade(RAIL, 0.8), [0.12, 1.0, 0.12], [s * (hw - 0.2), ya + 0.45 + 0.5, za], { rot: [0, 0, 0] });
    }
  }
}

function pillar(k, x, z, yTop, depth, w = 1.6, seed = 1) {
  const r = rng(seed);
  const h = yTop + depth;
  k.box(CONC, [w, h, w * 0.8], [x, -depth, z], { base: true, c: 0.12 });
  // weathering bands + cap
  for (let y = -depth + 6; y < yTop - 1; y += 7) k.box(CONC_DARK, [w + 0.04, 0.3, w * 0.8 + 0.04], [x, y, z]);
  k.box(shade(CONC, 0.95), [w + 0.5, 0.7, w * 0.8 + 0.4], [x, yTop - 0.7, z], { base: true, c: 0.08 });
  // water/rust stain
  k.box(mix(CONC, PAL.rust, 0.35), [w * 0.3, h * 0.4, 0.02], [x + (r() - 0.5) * w * 0.4, yTop - h * 0.25, z + w * 0.4 + 0.012]);
}

/** Jagged broken edge along X at local z = zEdge (deck top y = yTop, slab thickness th). dir +1 = deck lies at z < zEdge. */
function brokenEdge(k, hw, zEdge, yTop, th, dir, seed) {
  const r = rng(seed);
  const n = 9;
  // irregular teeth hanging off the slab edge
  for (let i = 0; i < n; i++) {
    const x = -hw + (i + 0.5) * (2 * hw / n);
    const len = 0.4 + r() * 1.3;
    const yy = yTop - th / 2 - r() * 0.2;
    k.box(i % 3 ? CONC : CONC_DARK, [2 * hw / n + 0.05, th * (0.5 + r() * 0.5), len], [x, yy, zEdge + dir * (len / 2 - 0.4)], { rot: [dir * (r() * 0.35), r() * 0.2 - 0.1, 0], jit: 0.12 });
  }
  // dangling / bent rebar
  for (let i = 0; i < 16; i++) {
    const x = -hw + 0.3 + r() * (2 * hw - 0.6);
    const len = 0.8 + r() * 2.4;
    const bend = 0.6 + r() * 1.0;
    k.at([x, yTop - th * 0.4, zEdge + dir * 0.2], [dir * bend, 0, (r() - 0.5) * 0.4], () => k.box(REBAR, [0.05, 0.05, len], [0, 0, dir * len / 2]));
  }
  // chunks hanging by rebar
  for (let i = 0; i < 3; i++) k.ico(CONC_DARK, 0.4 + r() * 0.3, [-hw + 1 + r() * (2 * hw - 2), yTop - 1.6 - r() * 1.6, zEdge + dir * (0.8 + r() * 0.6)], { seed: seed + 10 + i, jitter: 0.3 });
  // exposed broken face colour
  k.rectZ('#c4bdaf', zEdge + dir * 0.4, [-hw, hw], [yTop - th, yTop], dir, { off: 0.02 });
}

export function buildBridgeRamp(cfg = DEFAULT_BRIDGE) {
  const c = { ...DEFAULT_BRIDGE, ...cfg };
  const L = c.lip - c.rampStart, H = c.rampHeight, depth = c.canyonDepth, W = c.deckWidth || 8.6, hw = W / 2;
  const g = root('bridge_ramp', 0, { w: W + 1, h: H + 1.6 + depth, l: L + 2 });
  g.userData.bridge = { length: L, rampHeight: H, origin: 'rampStart', deckTop: 'y = rampHeight * z / length' };
  g.userData.viewBox = { min: [-hw - 0.5, -14, -2], max: [hw + 0.5, H + 1.6, L + 2] };
  const k = new Kit(1600);
  const yAt = (z) => (Math.max(0, Math.min(L, z)) / L) * H;
  const th = 1.1; // slab thickness
  // deck slab: side profile [z, y] — top follows the ramp exactly
  const prof = [[0, -th * 0.4], [L, H - th], [L, H], [0, 0]];
  k.extrude((cx, cy, cz, nx, ny) => (ny > 0.5 ? DECK : ny < -0.5 ? CONC_DARK : CONC), prof, W, { axis: 'x' });
  // girder underneath + diaphragms
  for (const s of [1, -1]) k.extrude(CONC_DARK, [[2, -th * 0.4 + 0.1], [L - 0.5, H - th - 0.1], [L - 0.5, H - th - 1.2], [2, -th * 0.4 - 0.6]], 0.6, { axis: 'x', pos: [s * (hw - 1.2), 0, 0] });
  // lane markings + cracks + patch on the deck (follow the slope)
  const ang = Math.atan2(H, L);
  const top = (color, x0, x1, z0, z1, off = 0.03) => k.poly(color, [[x0, yAt(z0), z0], [x1, yAt(z0), z0], [x1, yAt(z1), z1], [x0, yAt(z1), z1]], { facing: [0, Math.cos(ang), -Math.sin(ang)], off });
  for (let z = 1; z < L - 3; z += 6) top('#e9d47c', -0.08, 0.08, z, z + 3);
  for (const s of [1, -1]) top('#d9d4c4', s * (hw - 0.75) - 0.08, s * (hw - 0.75) + 0.08, 0.2, L - 1.5);
  const r = rng(1601);
  for (let i = 0; i < 8; i++) { const z = 4 + r() * (L - 10), x = (r() - 0.5) * (W - 2); top('#3e3c39', x - 0.5, x + 0.5 + r(), z, z + 0.15 + r() * 0.2, 0.034); }
  top('#6a6762', -2.5, 0.5, L * 0.55, L * 0.62, 0.032);
  // warning chevrons near the lip
  for (let i = 0; i < 4; i++) top(i % 2 ? '#e2b93b' : '#2a2a2b', -hw + 0.6, hw - 0.6, L - 6 + i * 0.9, L - 5.4 + i * 0.9, 0.036);
  guardRails(k, hw, 0, L - 1.0, yAt, 12);
  // a section of rail torn away and bent outward near the lip
  k.at([hw - 0.2, H + 1.0, L - 0.3], [0.2, 0.7, -0.4], () => k.box(RAIL, [0.08, 0.14, 2.6], [0, 0, 1.2]));
  brokenEdge(k, hw, L, H, th, 1, 1602);
  // abutment block at the start (road-level)
  k.box(CONC, [W + 2, 2.5, 1.2], [0, -2.5, -0.2], { base: true, c: 0.06 });
  // pillars down to the canyon floor
  const nP = Math.max(2, Math.round(L / 16));
  for (let i = 1; i <= nP; i++) {
    const z = (i / (nP + 0.35)) * L;
    for (const s of [1, -1]) pillar(k, s * (hw - 1.7), z, yAt(z) - th, depth, 2.2, 1610 + i * 2 + s);
    k.box(CONC, [W - 1.2, 1.0, 1.4], [0, yAt(z) - th - 1.0, z], { c: 0.06 });
  }
  // cross bracing between the last pair of pillars
  const zl = (nP / (nP + 0.35)) * L, ytop = yAt(zl) - th - 2;
  for (let y = ytop - 6; y > -depth + 6; y -= 12) {
    k.box(CONC_DARK, [W - 3.2, 0.5, 0.5], [0, y, zl], { rot: [0, 0, 0.55] });
    k.box(CONC_DARK, [W - 3.2, 0.5, 0.5], [0, y, zl], { rot: [0, 0, -0.55] });
  }
  // barricade remnants at the start of the ramp (knocked aside)
  for (const [x, rot] of [[-hw + 0.9, 0.5], [hw - 1.0, -0.9]]) k.at([x, 0, -1.5], [0, rot, 0], () => {
    k.box('#efece4', [1.8, 0.24, 0.06], [0, 0.95, 0]);
    for (let j = 0; j < 4; j++) k.box('#c4372b', [0.2, 0.24, 0.07], [-0.7 + j * 0.45, 0.95, 0]);
    for (const s of [1, -1]) k.box('#d8d4c8', [0.06, 1.0, 0.06], [s * 0.8, 0.5, 0], { rot: [0.25, 0, 0] });
  });
  g.add(k.mesh('body'));
  return g;
}

export function buildBridgeLanding(cfg = DEFAULT_BRIDGE) {
  const c = { ...DEFAULT_BRIDGE, ...cfg };
  const L = c.landingEnd - c.gapEnd, y0 = c.landingHeight || 0, depth = c.canyonDepth, W = c.deckWidth || 8.6, hw = W / 2;
  const g = root('bridge_landing', 0, { w: W + 1, h: 1.6 + depth, l: L + 2 });
  g.userData.bridge = { length: L, origin: 'gapEnd (broken edge)', deckTop: 'y = landingHeight' };
  g.userData.viewBox = { min: [-hw - 0.5, y0 - 12, -2], max: [hw + 0.5, y0 + 1.6, L + 1] };
  const k = new Kit(1700);
  const th = 1.1;
  // slab
  k.box(DECK, [W, th, L], [0, y0 - th / 2, L / 2]);
  k.box(CONC, [W + 0.02, th - 0.2, L + 0.02], [0, y0 - th / 2 - 0.1, L / 2]);
  k.rectY(DECK, y0, [-hw, hw], [0, L], { off: 0.006 });
  // markings, cracks, scorch skid marks from previous jumpers
  for (let z = 2; z < L - 2; z += 6) k.rectY('#e9d47c', y0, [-0.08, 0.08], [z, z + 3], { off: 0.02 });
  for (const s of [1, -1]) k.rectY('#d9d4c4', y0, [s * (hw - 0.75) - 0.08, s * (hw - 0.75) + 0.08], [1.5, L], { off: 0.02 });
  for (const x of [-1.6, 1.0]) k.rectY('#2f2d2b', y0, [x - 0.18, x + 0.18], [1.5, 9 + x], { off: 0.024 });
  k.rectY('#3e3c39', y0, [-2, 1.4], [5.2, 5.4], { off: 0.026 });
  guardRails(k, hw, 1.2, L, () => y0, 6);
  brokenEdge(k, hw, 0, y0, th, -1, 1702);
  // pillars
  for (const z of [3.5, L - 2]) {
    for (const s of [1, -1]) pillar(k, s * (hw - 1.7), z, y0 - th, depth, 2.2, 1710 + z);
    k.box(CONC, [W - 1.2, 1.0, 1.4], [0, y0 - th - 1.0, z], { c: 0.06 });
  }
  // abutment where it meets the road again
  k.box(CONC, [W + 2, 2.5, 1.2], [0, y0 - 2.5, L + 0.2], { base: true, c: 0.06 });
  g.add(k.mesh('body'));
  return g;
}

export const BRIDGE_BUILDERS = {
  bridge_ramp: { build: () => buildBridgeRamp(), variants: 1 },
  bridge_landing: { build: () => buildBridgeLanding(), variants: 1 },
};
