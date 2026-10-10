// Country pack · G. Ghost town: saloon, sheriff_office, chapel, water_tower_wood, livery_stable, boardwalk.
// Weathered, sun-bleached timber; paint survives only in faded patches.
import * as THREE from 'three';
import { root } from '../models/kit.js';
import { walls, wr, band, gableRoof, planks } from '../models/scenery.js';
import { Kit, rng, PAL, mix, shade, vmod, pivot, signMesh, textTex, drawTex, fitText, beam, rod, ladder, railing, railingZ, stairs, barrel, recentre } from './country-common.js';

const TIMBER = '#8a7a64', TIMBER_D = '#6e604e', TIMBER_L = '#a8977a';

/** Raised plank boardwalk along X with optional posts + shed roof. */
function walkway(k, x0, x1, z0, z1, y = 0.45, o = {}) {
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  k.box(TIMBER_D, [w, y - 0.08, d - 0.2], [cx, 0, cz], { base: true });
  k.box(TIMBER_L, [w, 0.08, d], [cx, y - 0.08, cz], { base: true });
  for (let x = x0 + 0.3; x < x1; x += 0.3) k.rectY(shade(TIMBER_L, 0.82), y + 0.001, [x - 0.015, x + 0.015], [z0, z1], { off: 0.002 });
  if (o.roof) {
    const h = o.roof;
    for (let x = x0 + 0.15; x <= x1; x += Math.max(2.4, (x1 - x0) / Math.round((x1 - x0) / 3))) k.box(TIMBER_D, [0.18, h, 0.18], [x, y, z1 - 0.2], { base: true });
    k.box(TIMBER_D, [0.18, h, 0.18], [x1 - 0.15, y, z1 - 0.2], { base: true });
    k.box(TIMBER_D, [w, 0.2, 0.2], [cx, y + h, z1 - 0.2]);
    k.box(o.roofColor || '#7a6e60', [w + 0.4, 0.08, d + 0.6], [cx, y + h + 0.25, cz + 0.1], { rot: [0.14, 0, 0] });
  }
}
function hitchRail(k, x, z, len = 3.0) {
  for (const dx of [-len / 2, len / 2]) k.box(TIMBER_D, [0.15, 1.05, 0.15], [x + dx, 0, z], { base: true });
  k.cyl(TIMBER, 0.06, 0.06, len + 0.3, [x, 1.0, z], { axis: 'x', seg: 5 });
}
function trough(k, x, z, rotY = 0) {
  k.at([x, 0, z], [0, rotY, 0], () => {
    k.box(TIMBER_D, [1.8, 0.55, 0.6], [0, 0, 0], { base: true });
    k.box('#3c4a4a', [1.6, 0.02, 0.45], [0, 0.5, 0], { base: true });
  });
}
function falseFront(k, cx, z, w, h0, h1, color, steps = true) {
  // a tall flat facade above the roof line with a stepped or square top + cornice
  const pts = steps
    ? [[cx - w / 2, h0], [cx + w / 2, h0], [cx + w / 2, h1 - 0.8], [cx + w / 2 - 1.0, h1 - 0.8], [cx + w / 2 - 1.0, h1], [cx - w / 2 + 1.0, h1], [cx - w / 2 + 1.0, h1 - 0.8], [cx - w / 2, h1 - 0.8]]
    : [[cx - w / 2, h0], [cx + w / 2, h0], [cx + w / 2, h1], [cx - w / 2, h1]];
  k.extrude(color, pts, 0.25, { axis: 'z', pos: [0, 0, z] });
  k.box(TIMBER_D, [w + 0.3, 0.22, 0.4], [cx, steps ? h1 - 0.8 : h1, z + 0.05]);
  if (steps) k.box(TIMBER_D, [w - 1.7, 0.22, 0.4], [cx, h1, z + 0.05]);
}
function oldWindow(k, f, uc, y0, w, h, broken = false) {
  wr(k, f, [uc - w / 2 - 0.12, uc + w / 2 + 0.12], [y0 - 0.12, y0 + h + 0.12], TIMBER_D, 0.014);
  wr(k, f, [uc - w / 2, uc + w / 2], [y0, y0 + h], '#2a2826', 0.02);
  if (!broken) { wr(k, f, [uc - w / 2, uc + w / 2], [y0, y0 + h], '#4a5458', 0.022); wr(k, f, [uc - 0.03, uc + 0.03], [y0, y0 + h], TIMBER_D, 0.026); }
  else wr(k, f, [uc - w / 2, uc], [y0 + h * 0.4, y0 + h], '#4a5458', 0.022);
}

// ── 35. saloon (Golden Spur, swinging doors door_l / door_r) ─────────────────────
export function buildSaloon() {
  const k = new Kit(9101); k.floor = 0;
  const r = rng(9102);
  const W = 12, D = 14, h1 = 3.6, h2 = 7.0, ff = 9.6, paint = '#a8857a';
  k.box(TIMBER, [W, h2, D], [0, 0.45, 0], { base: true });
  const F = walls(W, D);
  for (const f of [F.left, F.right, F.back]) planks(k, f, 0.45, h2 + 0.45, TIMBER, 0.35, 9103);
  gableRoof(k, { w: W, d: D, y: h2 + 0.45, rh: 1.6, ridge: 'z', roof: '#6a5e50', wall: TIMBER, o: 0.3 });
  // facade: faded paint over planks, false front
  wr(k, F.front, [-W / 2, W / 2], [0.45, h2 + 0.45], paint, 0.012);
  for (let x = -W / 2 + 0.35; x < W / 2; x += 0.35) wr(k, F.front, [x - 0.02, x + 0.02], [0.45, h2 + 0.45], shade(paint, 0.82), 0.016);
  for (let i = 0; i < 6; i++) { const x = -W / 2 + r() * (W - 1.5); wr(k, F.front, [x, x + 0.6 + r()], [1 + r() * 5, 1.6 + r() * 5.4], TIMBER, 0.018); } // paint flaking
  falseFront(k, 0, D / 2 + 0.12, W, h2 + 0.45, ff + 0.45, paint, true);
  // ground floor: windows, door opening (doors are pivots)
  oldWindow(k, F.front, -3.8, 1.4, 2.2, 1.9); oldWindow(k, F.front, 3.8, 1.4, 2.2, 1.9, true);
  wr(k, F.front, [-1.15, 1.15], [0.45, 3.2], TIMBER_D, 0.014);
  wr(k, F.front, [-0.95, 0.95], [0.45, 3.05], '#1f1b18', 0.02);
  // balcony (porch roof = balcony floor) on posts, railing, upstairs doors + windows
  const bz = D / 2 + 1.25;
  walkway(k, -W / 2, W / 2, D / 2, D / 2 + 2.6, 0.45);
  for (let i = 0; i <= 4; i++) k.box(TIMBER_D, [0.22, h1 - 0.45, 0.22], [-W / 2 + 0.2 + i * (W - 0.4) / 4, 0.45, D / 2 + 2.4], { base: true });
  k.box(TIMBER_D, [W, 0.3, 2.6], [0, h1, bz], { base: true });
  k.box(TIMBER_L, [W, 0.06, 2.6], [0, h1 + 0.3, bz], { base: true });
  railing(k, TIMBER_L, -W / 2, W / 2, D / 2 + 2.5, h1 + 0.36, 0.95, 0.5, { t: 0.06, mid: true });
  for (const s of [1, -1]) railingZ(k, TIMBER_L, D / 2, D / 2 + 2.5, s * (W / 2 - 0.05), h1 + 0.36, 0.95, 0.6, { t: 0.06 });
  for (const x of [-3.8, 0, 3.8]) {
    if (x === 0) { wr(k, F.front, [-0.6, 0.6], [h1 + 0.36, h1 + 2.6], TIMBER_D, 0.014); wr(k, F.front, [-0.5, 0.5], [h1 + 0.36, h1 + 2.5], '#3a2e26', 0.02); }
    else oldWindow(k, F.front, x, h1 + 1.0, 1.1, 1.6, x > 0);
  }
  // hitching rail, trough, barrels, a lantern hook
  hitchRail(k, -3.5, D / 2 + 3.6); trough(k, 3.6, D / 2 + 3.6);
  barrel(k, W / 2 - 0.6, D / 2 + 0.6, 0.45); barrel(k, W / 2 - 1.3, D / 2 + 0.5, 0.45, '#7a5a3a');
  k.box('#3a3836', [0.05, 0.05, 0.5], [1.5, 3.0, D / 2 + 0.25]); k.box('#c9a24a', [0.18, 0.28, 0.18], [1.5, 2.75, D / 2 + 0.5]);
  const g = root('saloon', 0, { w: W + 0.4, h: ff + 0.7, l: D + 4.2 });
  g.add(k.mesh('body'));
  // batwing doors: door_l on +X (hinge at x = +0.92), door_r on −X (hinge at x = −0.92).
  //   door_l: rotation.y > 0 swings it out toward the street (+Z); door_r: rotation.y < 0 swings it out.
  const leaf = (kk, dir) => {
    const w = 0.88;
    const pts = [[0, 0], [dir * w, 0], [dir * w, 1.0], [dir * w * 0.5, 1.12], [0, 1.18]];
    kk.extrude('#9a6a4a', pts.map(([x, y]) => [x, y]), 0.05, { axis: 'z' });
    for (let i = 0; i < 4; i++) kk.box('#6e4a32', [w - 0.12, 0.04, 0.06], [dir * w / 2, 0.25 + i * 0.2, 0]);
    kk.box('#6e4a32', [0.06, 1.15, 0.07], [dir * 0.03, 0.0, 0], { base: true });
  };
  pivot(g, 'door_l', [0.92, 0.45 + 0.85, D / 2 + 0.05], (kk) => leaf(kk, -1), { seed: 9110 });
  pivot(g, 'door_r', [-0.92, 0.45 + 0.85, D / 2 + 0.05], (kk) => leaf(kk, 1), { seed: 9111 });
  const tex = drawTex('saloon', 1024, 256, '#3a2a22', (ctx, Wc, Hc) => {
    ctx.fillStyle = '#4a3428'; ctx.fillRect(0, 0, Wc, Hc);
    for (let y = 0; y < Hc; y += 32) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, y, Wc, 3); }
    ctx.strokeStyle = '#d9b45a'; ctx.lineWidth = 6; ctx.strokeRect(16, 16, Wc - 32, Hc - 32);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e8c86a'; fitText(ctx, 'GOLDEN SPUR', Wc / 2, Hc * 0.42, Wc * 0.72, 120, '900', 'Georgia, "Times New Roman", serif');
    ctx.fillStyle = '#efe2c4'; fitText(ctx, '~ SALOON ~', Wc / 2, Hc * 0.8, Wc * 0.4, 52, '700', 'Georgia, serif');
    // spur rowel icons
    for (const x of [80, Wc - 80]) { ctx.save(); ctx.translate(x, Hc * 0.48); ctx.fillStyle = '#d9b45a'; for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(0, -46); ctx.lineTo(8, 0); ctx.lineTo(-8, 0); ctx.closePath(); ctx.fill(); } ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fillStyle = '#4a3428'; ctx.fill(); ctx.restore(); }
  });
  g.add(signMesh(tex, [{ w: 8.4, h: 2.1, pos: [0, h2 + 0.45 + 1.15, D / 2 + 0.26] }], '#4a3428'));
  g.userData.doors = { left: 'door_l', right: 'door_r', note: 'door_l (+X) opens toward the street with rotation.y > 0; door_r (−X) with rotation.y < 0. Batwings swing both ways (±1.2).' };
  return g;
}

// ── 36. sheriff_office ───────────────────────────────────────────────────────────
export function buildSheriffOffice() {
  const k = new Kit(9201); k.floor = 0;
  const r = rng(9202);
  const W = 8, D = 9, H = 3.8, stone = '#a89a84';
  k.box(stone, [W, H, D], [0, 0.45, 0], { base: true, c: 0.05 });
  const F = walls(W, D);
  for (const f of Object.values(F)) for (let y = 0.85; y < H; y += 0.42) { wr(k, f, [f.u[0] + 0.05, f.u[1] - 0.05], [y, y + 0.03], shade(stone, 0.8), 0.01); }
  for (const f of Object.values(F)) for (let y = 0.45, row = 0; y < H; y += 0.42, row++) for (let u = f.u[0] + (row % 2) * 0.5 + 0.6; u < f.u[1] - 0.2; u += 1.0) wr(k, f, [u - 0.02, u + 0.02], [y + 0.42 > H + 0.45 ? y : y + 0.03, Math.min(H + 0.45, y + 0.42)], shade(stone, 0.82), 0.012);
  k.box(TIMBER_D, [W + 0.5, 0.2, D + 0.5], [0, H + 0.45, 0], { base: true });
  falseFront(k, 0, D / 2 + 0.12, W, H + 0.45, H + 2.6, '#9a8a6e', false);
  // door + windows + barred jail window on the side
  wr(k, F.front, [-0.6, 0.6], [0.45, 2.7], '#5a3a2a', 0.02); wr(k, F.front, [-0.45, 0.45], [1.7, 2.5], '#2a2826', 0.026);
  oldWindow(k, F.front, -2.6, 1.4, 1.3, 1.4); oldWindow(k, F.front, 2.6, 1.4, 1.3, 1.4);
  for (const z of [-2, 1]) {
    wr(k, F.left, [z - 0.5, z + 0.5], [2.0, 3.0], '#1f1b18', 0.02);
    for (let i = 0; i < 5; i++) k.box('#3a3b3d', [0.06, 1.05, 0.06], [W / 2 + 0.05, 2.0, z - 0.4 + i * 0.2], { base: true });
  }
  // porch roof on posts, bench, hitching post, wanted posters, lamp
  walkway(k, -W / 2 - 0.3, W / 2 + 0.3, D / 2, D / 2 + 2.4, 0.45, { roof: 2.9, roofColor: '#6a5e50' });
  k.box(TIMBER_L, [1.8, 0.08, 0.45], [2.5, 0.9, D / 2 + 0.4]); for (const s of [1, -1]) k.box(TIMBER_D, [0.08, 0.45, 0.4], [2.5 + s * 0.8, 0.45, D / 2 + 0.4], { base: true });
  for (let i = 0; i < 3; i++) { const x = -1.3 - i * 0.55; wr(k, F.front, [x - 0.22, x + 0.22], [1.6 + (i % 2) * 0.1, 2.15 + (i % 2) * 0.1], '#e6dcc0', 0.03); wr(k, F.front, [x - 0.1, x + 0.1], [1.8, 2.0], '#3a3026', 0.034); }
  hitchRail(k, -2.0, D / 2 + 3.4, 2.6); trough(k, 2.4, D / 2 + 3.4);
  void r;
  const g = root('sheriff_office', 0, { w: W + 0.8, h: H + 3.1, l: D + 4.0 });
  g.add(k.mesh('body'));
  const tex = drawTex('sheriff', 1024, 256, '#2a2622', (ctx, Wc, Hc) => {
    ctx.fillStyle = '#e9e0c8'; ctx.fillRect(0, 0, Wc, Hc);
    ctx.strokeStyle = '#2a2622'; ctx.lineWidth = 8; ctx.strokeRect(14, 14, Wc - 28, Hc - 28);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#2a2622';
    fitText(ctx, 'SHERIFF', Wc * 0.55, Hc * 0.42, Wc * 0.62, 140, '900', 'Georgia, "Times New Roman", serif');
    ctx.fillStyle = '#7a2e22'; fitText(ctx, 'COUNTY JAIL · EST. 1879', Wc * 0.55, Hc * 0.8, Wc * 0.6, 40, '700', 'Georgia, serif');
    // star badge
    ctx.save(); ctx.translate(Wc * 0.13, Hc / 2); ctx.fillStyle = '#c9a24a'; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 38 : 92; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill(); ctx.fillStyle = '#e9e0c8'; ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  });
  g.add(signMesh(tex, [{ w: 6.6, h: 1.65, pos: [0, H + 0.45 + 1.08, D / 2 + 0.26] }], '#e9e0c8'));
  return g;
}

// ── 37. chapel (small adobe mission chapel with a bell gable) ──────────────────
export function buildChapel() {
  const k = new Kit(9301); k.floor = 0;
  const r = rng(9302);
  const W = 7, D = 11, H = 4.4, adobe = '#c9a27a', adobeL = '#d8b48c', adobeD = '#a8825e';
  k.box(adobe, [W, H, D], [0, 0, 0], { base: true, c: 0.25, jit: 0.04 });
  const F = walls(W, D);
  // eroded base + plaster patches
  for (const f of Object.values(F)) band(k, f, 0, 0.5, adobeD, 0.03);
  for (let i = 0; i < 8; i++) { const f = [F.left, F.right, F.front][i % 3]; const u = f.u[0] + 0.5 + r() * (f.u[1] - f.u[0] - 1.5); wr(k, f, [u, u + 0.5 + r() * 0.8], [0.8 + r() * 2.5, 1.4 + r() * 2.5], i % 2 ? adobeL : adobeD, 0.035); }
  // parapet + vigas sticking out along both sides
  k.box(adobeL, [W + 0.1, 0.5, D + 0.1], [0, H, 0], { base: true, c: 0.15 });
  for (const s of [1, -1]) for (let i = 0; i < 6; i++) k.cyl('#7a5a3c', 0.13, 0.13, 0.6, [s * (W / 2 + 0.25), H - 0.35, -D / 2 + 1.2 + i * 1.7], { axis: 'x', seg: 5 });
  // bell gable (espadaña) rising from the front wall, arched opening, bell, wooden cross
  const fz = D / 2 - 0.3;
  const eg = [[-2.6, H], [2.6, H], [2.6, H + 1.4], [1.6, H + 2.4], [1.0, H + 3.4], [0, H + 3.8], [-1.0, H + 3.4], [-1.6, H + 2.4], [-2.6, H + 1.4]];
  k.extrude(adobeL, eg, 0.7, { axis: 'z', pos: [0, 0, fz], bevel: 0.08 });
  k.front('#1f1b18', fz + 0.36, [[-0.55, H + 1.2], [0.55, H + 1.2], [0.55, H + 2.3], [0.3, H + 2.65], [0, H + 2.75], [-0.3, H + 2.65], [-0.55, H + 2.3]], 1, { off: 0.01 });
  k.lathe('#8a6a3a', [[0, 0.62], [0.12, 0.58], [0.2, 0.3], [0.32, 0.02], [0, 0]], 8, [0, H + 1.55, fz + 0.15]);
  k.box('#5a4430', [1.1, 0.08, 0.08], [0, H + 2.2, fz + 0.15]);
  k.box('#6e5034', [0.12, 1.0, 0.12], [0, H + 3.75, fz], { base: true });
  k.box('#6e5034', [0.6, 0.12, 0.12], [0, H + 4.4, fz]);
  // doors with a heavy timber frame, a small round window, steps
  wr(k, F.front, [-1.1, 1.1], [0, 2.9], '#5a4430', 0.03);
  wr(k, F.front, [-0.95, 0.95], [0, 2.75], '#7a4a2e', 0.04);
  wr(k, F.front, [-0.03, 0.03], [0, 2.75], '#4a2e1e', 0.045);
  for (const y of [0.6, 1.4, 2.2]) wr(k, F.front, [-0.95, 0.95], [y, y + 0.06], '#4a2e1e', 0.045);
  k.cyl('#2a2826', 0.38, 0.38, 0.1, [0, 3.7, D / 2], { axis: 'z', seg: 8 });
  k.box(adobeD, [2.6, 0.2, 0.8], [0, 0, D / 2 + 0.4], { base: true });
  for (const f of [F.left, F.right]) for (const z of [-2.5, 1.5]) { wr(k, f, [z - 0.35, z + 0.35], [1.8, 3.0], '#2a2826', 0.03); wr(k, f, [z - 0.45, z + 0.45], [1.7, 1.8], adobeL, 0.035); }
  // buttresses at the front corners
  for (const s of [1, -1]) k.box(adobeD, [0.9, 3.2, 1.2], [s * (W / 2 + 0.3), 0, D / 2 - 0.8], { base: true, c: 0.2, taper: [0.6, 0.7] });
  // little graveyard on the +X side: low adobe wall, wooden crosses + stone markers
  const gx = W / 2 + 4.2;
  for (const [x0, z0, x1, z1] of [[gx - 2.6, -3, gx + 2.6, -3], [gx + 2.6, -3, gx + 2.6, 3], [gx - 2.6, 3, gx - 0.6, 3], [gx + 0.6, 3, gx + 2.6, 3]]) beam(k, adobeD, [x0, 0.4, z0], [x1, 0.4, z1], 0.8, { tz: 0.35 });
  for (let i = 0; i < 6; i++) {
    const x = gx - 1.6 + (i % 3) * 1.6, z = -1.6 + Math.floor(i / 3) * 2.4;
    if (i % 2) { k.box('#9a958a', [0.5, 0.7, 0.15], [x, 0, z], { base: true, c: 0.08, rot: [0, 0, (r() - 0.5) * 0.15] }); }
    else { k.box('#7a6a52', [0.1, 0.9, 0.08], [x, 0, z], { base: true, rot: [0, 0, (r() - 0.5) * 0.2] }); k.box('#7a6a52', [0.45, 0.08, 0.08], [x, 0.65, z]); }
    k.box('#8a7458', [0.6, 0.06, 1.3], [x, 0, z + 0.9], { base: true });
  }
  const g = root('chapel', 0, { w: 1, h: 1, l: 1 });
  g.add(k.mesh('body'));
  return recentre(g);
}

// ── 38. water_tower_wood (railroad-style timber tank on a trestle) ─────────────
export function buildWaterTowerWood() {
  const k = new Kit(9401); k.floor = 0;
  const R = 3.0, Ht = 4.2, py = 7.5;
  const legs = [[2.4, 2.4], [2.4, -2.4], [-2.4, 2.4], [-2.4, -2.4]];
  for (const [x, z] of legs) { beam(k, TIMBER_D, [x * 1.08, 0, z * 1.08], [x * 0.85, py, z * 0.85], 0.32); k.box('#8f8a7f', [0.8, 0.35, 0.8], [x * 1.08, 0, z * 1.08], { base: true }); }
  for (const y0 of [0.6, 3.9]) {
    const y1 = y0 + 3.3, s0 = 2.4 * (1.08 - 0.23 * (y0 / py)), s1 = 2.4 * (1.08 - 0.23 * (y1 / py));
    for (const s of [1, -1]) {
      beam(k, TIMBER, [-s0, y0, s * s0], [s1, y1, s * s1], 0.14); beam(k, TIMBER, [s0, y0, s * s0], [-s1, y1, s * s1], 0.14);
      beam(k, TIMBER, [s * s0, y0, -s0], [s * s1, y1, s1], 0.14); beam(k, TIMBER, [s * s0, y0, s0], [s * s1, y1, -s1], 0.14);
    }
  }
  // platform + tank (staves via colour stripes) + iron hoops + conical roof
  k.box(TIMBER_D, [6.6, 0.3, 6.6], [0, py, 0], { base: true });
  for (let i = 0; i < 10; i++) k.box(TIMBER_D, [6.6, 0.2, 0.25], [0, py - 0.2, -3 + i * 0.66], { base: true });
  const staves = (cx, cy, cz, nx, ny, nz) => (ny > 0.9 ? TIMBER_D : (Math.floor((Math.atan2(nz, nx) + Math.PI) / (Math.PI * 2) * 16) % 2 ? '#8a6e52' : '#7a604a'));
  k.cyl(staves, R, R * 1.04, Ht, [0, py + 0.3, 0], { base: true, seg: 16 });
  for (let i = 0; i < 5; i++) k.cyl('#3a3836', R * 1.04 - i * 0.008 + 0.02, R * 1.04 - i * 0.008 + 0.02, 0.08, [0, py + 0.6 + i * 0.85, 0], { seg: 16, open: true });
  k.cone('#6a5e50', R + 0.4, 1.8, [0, py + 0.3 + Ht, 0], { base: true, seg: 12 });
  k.cyl('#3a3836', 0.06, 0.06, 0.8, [0, py + Ht + 2.0, 0], { base: true, seg: 4 });
  k.ico('#3a3836', 0.15, [0, py + Ht + 2.9, 0]);
  // ladders: ground → platform, platform → roof
  ladder(k, TIMBER_L, [2.9, 0, 2.2], [2.6, py + 0.3, 2.2], 0.5);
  ladder(k, '#3a3836', [0, py + 0.3, R + 0.15], [0, py + Ht + 0.3, R + 0.15], 0.45);
  railing(k, TIMBER_L, -3.3, 3.3, 3.25, py + 0.3, 0.9, 1.1, { t: 0.06, mid: true });
  // spout: hinged pipe hanging down with a counterweight + chain
  k.cyl('#3a3836', 0.25, 0.25, 0.5, [-R - 0.2, py + 1.0, 0], { axis: 'x', seg: 8 });
  rod(k, '#3a3836', [-R - 0.4, py + 1.0, 0], [-R - 1.8, py - 2.6, 0], 0.18, 7);
  rod(k, '#3a3836', [-R - 0.4, py + 3.6, 0], [-R - 1.6, py - 1.2, 0], 0.012, 3);
  k.box('#3a3836', [0.4, 0.5, 0.4], [-R - 1.5, py + 3.4, 0]);
  const g = root('water_tower_wood', 0, { w: 1, h: 1, l: 1 });
  g.add(k.mesh('body'));
  return recentre(g);
}

// ── 39. livery_stable ─────────────────────────────────────────────────────────────
export function buildLiveryStable() {
  const k = new Kit(9501); k.floor = 0;
  const r = rng(9502);
  const W = 11, D = 15, H = 5.2;
  k.box(TIMBER, [W, H, D], [0, 0, 0], { base: true });
  const F = walls(W, D);
  for (const f of Object.values(F)) planks(k, f, 0, H, TIMBER, 0.4, 9503);
  gableRoof(k, { w: W, d: D, y: H, rh: 3.4, ridge: 'z', roof: '#6a5e50', wall: TIMBER, o: 0.5 });
  for (let x = -W / 2 + 0.4; x < W / 2; x += 0.4) wr(k, { axis: 'z', at: D / 2, dir: 1 }, [x - 0.02, x + 0.02], [H, H + 3.4 * (1 - Math.abs(x) / (W / 2))], shade(TIMBER, 0.82), 0.012);
  // big doors (one ajar), hayloft door + hoist beam with pulley
  wr(k, F.front, [-2.4, 2.4], [0, 3.8], TIMBER_D, 0.014);
  wr(k, F.front, [-2.2, 0], [0, 3.65], '#7a6650', 0.02);
  wr(k, F.front, [0, 2.2], [0, 3.65], '#1f1b18', 0.02);
  for (const s of [1, -1]) k.poly('#5e4e3e', [[-2.2, 0.1, D / 2 + 0.025], [-2.0, 0.1, D / 2 + 0.025], [-0.2 + 0 * s, 3.55, D / 2 + 0.025], [-0.4, 3.55, D / 2 + 0.025]].map(([x, y, z]) => [s > 0 ? x : -2.2 - x, y, z]), { facing: [0, 0, 1], off: 0.006 });
  k.box('#7a6650', [2.2, 3.65, 0.08], [1.6, 0, D / 2 + 1.0], { base: true, rot: [0, -1.1, 0] });    // open leaf
  wr(k, F.front, [-0.9, 0.9], [5.4, 6.8], TIMBER_D, 0.014); wr(k, F.front, [-0.75, 0.75], [5.5, 6.7], '#1f1b18', 0.02);
  k.box(TIMBER_D, [0.25, 0.25, 1.6], [0, 7.6, D / 2 + 0.6]); k.cyl('#3a3836', 0.15, 0.15, 0.1, [0, 7.35, D / 2 + 1.2], { axis: 'x', seg: 6 });
  rod(k, '#8a7a5a', [0, 7.3, D / 2 + 1.3], [0, 4.5, D / 2 + 1.3], 0.015, 3);
  // lean-to stalls on the −X side
  k.box(TIMBER_D, [3.4, 0.12, D - 2], [-W / 2 - 1.7, 3.0, 0], { rot: [0, 0, 0.25] });
  for (let i = 0; i < 4; i++) k.box(TIMBER_D, [0.18, 2.8, 0.18], [-W / 2 - 3.2, 0, -D / 2 + 1.5 + i * (D - 3) / 3], { base: true });
  for (let i = 0; i < 3; i++) k.box(TIMBER, [3.0, 1.4, 0.1], [-W / 2 - 1.6, 0, -D / 2 + 3.3 + i * 3.6], { base: true });
  // corral on the +X side
  const cx0 = W / 2 + 0.3, cx1 = W / 2 + 7.5, cz0 = -5, cz1 = 4;
  const rail = (a, b) => { for (const y of [0.55, 1.05, 1.5]) beam(k, TIMBER_L, [a[0], y, a[1]], [b[0], y, b[1]], 0.09); };
  for (const [a, b] of [[[cx0, cz0], [cx1, cz0]], [[cx1, cz0], [cx1, cz1]], [[cx1, cz1], [cx0 + 2.5, cz1]]]) {
    rail(a, b);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.round(L / 2.4);
    for (let i = 0; i <= n; i++) k.box(TIMBER_D, [0.16, 1.7, 0.16], [a[0] + (b[0] - a[0]) * i / n, 0, a[1] + (b[1] - a[1]) * i / n], { base: true });
  }
  k.blob('#8a7458', 5, [W / 2 + 3.9, 0.012, -0.5], { seg: 10, sx: 1.0, sz: 1.2, seed: 9504, off: 0 });
  trough(k, W / 2 + 5, -3.8);
  // hay pile, wagon wheel, a buckboard wagon
  k.ico(PAL.hay, 1.2, [-W / 2 - 1.6, 0.4, D / 2 + 1.4], { detail: 1, scale: [1.4, 0.6, 1], jitter: 0.15, seed: 9505 });
  k.torus('#5a4430', 0.6, 0.05, [W / 2 + 0.1, 0.62, D / 2 - 0.5], { rot: [0, Math.PI / 2, 0.2], rs: 3, ts: 12 });
  for (let i = 0; i < 6; i++) k.box('#5a4430', [0.04, 1.15, 0.04], [W / 2 + 0.1, 0.62, D / 2 - 0.5], { rot: [i * Math.PI / 6, 0, 0] });
  k.at([4.5, 0, D / 2 + 3.5], [0, 0.3, 0], () => {
    k.box('#7a6650', [1.6, 0.5, 3.2], [0, 0.8, 0], { base: true });
    k.box(TIMBER_L, [1.6, 0.6, 0.08], [0, 1.3, 1.0]);
    for (const [x, z, rr] of [[0.9, 1.1, 0.5], [-0.9, 1.1, 0.5], [0.9, -1.1, 0.6], [-0.9, -1.1, 0.6]]) k.cyl('#4a3a2c', rr, rr, 0.08, [x, rr, z], { axis: 'x', seg: 8 });
    rod(k, TIMBER_D, [0.3, 0.8, 1.6], [0.5, 0.25, 3.6], 0.05, 4); rod(k, TIMBER_D, [-0.3, 0.8, 1.6], [-0.5, 0.25, 3.6], 0.05, 4);
  });
  void r;
  const g = root('livery_stable', 0, { w: 1, h: 1, l: 1 });
  g.add(k.mesh('body'));
  const tex = textTex('livery', [
    { text: 'LIVERY & FEED', y: 0.45, px: 110, color: '#efe2c4', family: 'Georgia, "Times New Roman", serif' },
    { text: 'HORSES BOARDED · WAGONS FOR HIRE', y: 0.82, px: 38, color: '#d9b45a', weight: '700', family: 'Georgia, serif' },
  ], { bg: '#5a3a2a', w: 1024, h: 220, border: '#d9b45a', borderW: 5 });
  g.add(signMesh(tex, [{ w: 6.2, h: 1.3, pos: [0, 4.6, D / 2 + 0.04] }], '#5a3a2a'));
  return recentre(g);
}

// ── 40. boardwalk (10 m along X, covered, with hitching post + trough) ─────────
export function buildBoardwalk() {
  const k = new Kit(9601); k.floor = 0;
  const L = 10;
  walkway(k, -L / 2, L / 2, -1.2, 1.2, 0.45, { roof: 2.7 });
  for (const s of [1, -1]) { k.box(TIMBER_L, [0.9, 0.22, 2.2], [s * (L / 2 + 0.45), 0, 0], { base: true }); }
  hitchRail(k, -1.5, 2.3, 3.2);
  trough(k, 2.6, 2.3);
  barrel(k, 4.2, -0.7, 0.45); barrel(k, 3.6, -0.8, 0.45, '#7a5a3a');
  k.box(TIMBER_L, [1.6, 0.08, 0.45], [-3.2, 0.9, -0.8]); for (const s of [1, -1]) k.box(TIMBER_D, [0.08, 0.45, 0.4], [-3.2 + s * 0.7, 0.45, -0.8], { base: true });
  const g = root('boardwalk', 0, { w: L + 1.8, h: 3.5, l: 4.0 });
  g.add(k.mesh('body'));
  return recentre(g, true);
}
void THREE; void mix; void textTex; void vmod;
