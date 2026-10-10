// Country pack · C. Strip-mall outskirts: store_megamart, car_wash, motel_2storey, drive_thru, minigolf_dino,
// donut_shop, tube_man.
import * as THREE from 'three';
import { root } from '../models/kit.js';
import { walls, wr, band, gableRoof, houseWindow } from '../models/scenery.js';
import { Kit, rng, PAL, mix, shade, vmod, pivot, signMesh, textTex, drawTex, fitText, beam, rod, railing, railingZ, stairs, bush, parkedCar, bin, recentre } from './country-common.js';

function lot(k, w, d, cz = 0, color = '#606165') {
  k.box(color, [w, 0.04, d], [0, 0, cz], { base: true });
  const r = rng(Math.round(w * 7 + d * 3));
  for (let i = 0; i < 5; i++) k.blob(shade(color, 0.8), 0.5 + r() * 0.7, [(r() - 0.5) * w * 0.8, 0.045, cz + (r() - 0.5) * d * 0.7], { seg: 7, seed: 5000 + i + w, off: 0.002 });
}
function stalls(k, x0, x1, z0, z1, step = 2.8) {
  for (let x = x0; x <= x1 + 1e-3; x += step) k.rectY('#e9e4cf', 0.045, [x - 0.06, x + 0.06], [z0, z1], { off: 0.002 });
}
function lightPole(k, x, z, h = 8) {
  k.box(PAL.concrete, [0.6, 0.5, 0.6], [x, 0, z], { base: true });
  k.cyl('#7a7f83', 0.09, 0.12, h, [x, 0.5, z], { base: true, seg: 6 });
  for (const s of [1, -1]) { k.box('#8a8f92', [1.2, 0.12, 0.12], [x + s * 0.6, h + 0.4, z]); k.box('#9a9fa2', [0.5, 0.18, 0.35], [x + s * 1.1, h + 0.3, z]); k.box(PAL.lampWarm, [0.4, 0.03, 0.28], [x + s * 1.1, h + 0.2, z]); }
}

// ── 11. store_megamart (big box, 40 × 18 m building on a 46 × 40 m lot) ────────
export function buildMegamart() {
  const k = new Kit(5101); k.floor = 0;
  const r = rng(5102);
  const W = 46, D = 40, bw = 40, bd = 18, bh = 8, bz = -10;
  const wall = '#cdbfa6', base = '#8f8577', portal = '#a5523a', cream = '#efe6cf';
  lot(k, W, D);
  // fire lane band (kept clear) + parking rows + islands
  k.rectY('#e2b93b', 0.045, [-bw / 2, bw / 2], [-0.6, -0.45], { off: 0.002 });
  stalls(k, -19.6, 19.6, 9, 14);
  stalls(k, -19.6, 19.6, 14.2, 19.2);
  k.rectY('#e9e4cf', 0.045, [-19.6, 19.6], [14.05, 14.15], { off: 0.002 });
  for (const x of [-21.5, 21.5]) { k.box('#a8a294', [2.0, 0.18, 10.5], [x, 0, 14.1], { base: true, c: 0.05 }); bush(k, x, 0.18, 12, 0.7, PAL.bush, 5103 + x); bush(k, x, 0.18, 16.5, 0.6, PAL.leaf[3], 5104 + x); }
  // the box
  k.box(wall, [bw, bh, bd], [0, 0, bz], { base: true, c: 0.08 });
  const F = walls(bw, bd, 0, bz);
  for (const f of Object.values(F)) { band(k, f, 0, 0.9, base, 0.012); band(k, f, bh - 0.6, bh - 0.4, shade(wall, 0.85), 0.012); }
  for (const f of [F.front, F.left, F.right]) for (let u = f.u[0] + 5; u < f.u[1] - 1; u += 5) wr(k, f, [u - 0.25, u + 0.25], [0.9, bh - 0.6], shade(wall, 0.92), 0.016); // pilasters
  k.box(shade(wall, 0.9), [bw + 0.4, 0.5, bd + 0.4], [0, bh, bz], { base: true });
  // roof gear
  for (const [x, z] of [[-12, -14], [-4, -8], [6, -15], [14, -9]]) { k.box('#a9a79e', [2.6, 1.2, 2.0], [x, bh + 0.5, z], { base: true, c: 0.08, cv: true }); k.box('#5f6064', [1.6, 0.06, 1.2], [x, bh + 1.7, z], { base: true }); }
  // entrance portal (taller, terracotta) with canopy, glass doors, cart bay
  const pz = bz + bd / 2;
  k.box(portal, [14, 11, 1.4], [0, 0, pz + 0.5], { base: true, c: 0.08 });
  k.box(shade(portal, 0.85), [14.4, 0.4, 1.8], [0, 11, pz + 0.5], { base: true });
  const P = walls(14, 1.4, 0, pz + 0.5);
  wr(k, P.front, [-6.2, 6.2], [0, 3.6], '#3a3632', 0.012);
  for (const x of [-3.2, 3.2]) { wr(k, P.front, [x - 2.2, x + 2.2], [0.05, 3.0], '#33404a', 0.02); wr(k, P.front, [x - 0.03, x + 0.03], [0.05, 3.0], '#8f8b82', 0.026); wr(k, P.front, [x - 2.2, x + 2.2], [2.6, 2.7], '#8f8b82', 0.026); }
  wr(k, P.front, [-1.0, 1.0], [0.5, 3.3], '#d9cfb3', 0.02); // "everything" poster column
  k.box(cream, [15, 0.35, 4.5], [0, 4.0, pz + 2.4], { base: true });
  for (const x of [-7, 7]) k.box(portal, [0.4, 4.0, 0.4], [x, 0, pz + 4.4], { base: true });
  for (let i = 0; i < 6; i++) k.cyl('#c4372b', 0.16, 0.16, 0.9, [-6 + i * 2.4, 0, pz + 4.9], { base: true, seg: 5, open: true });
  // side shopfronts: pharmacy + garden centre fence on the +X end
  wr(k, F.front, [-17, -9], [0.9, 3.4], '#33404a', 0.02);
  wr(k, F.front, [9, 17], [0.9, 3.4], '#33404a', 0.02);
  for (let i = 0; i < 4; i++) wr(k, F.front, [-16.6 + i * 2, -15.4 + i * 2], [1.3, 2.6], ['#d9a83a', '#6f8fb0', '#b85c6a', '#7e9b6e'][i], 0.026);
  const gx0 = bw / 2, gx1 = W / 2 - 0.3;
  for (const z of [bz - 6, bz + bd / 2 + 0.5]) k.box('#2f3a2f', [gx1 - gx0, 2.4, 0.06], [(gx0 + gx1) / 2, 0, z], { base: true });
  k.box('#2f3a2f', [0.06, 2.4, bd - 6 + 6.5], [gx1, 0, bz + 3.25 - 0.0], { base: true });
  for (let i = 0; i < 6; i++) k.box(['#cdb489', '#8a6a4a', '#7e9b6e'][i % 3], [0.9, 0.4, 0.6], [gx0 + 0.8 + (i % 2) * 1.1, 0.04 + Math.floor(i / 2) * 0.42, bz + 6], { base: true, c: 0.08 });
  // cart corrals in the car park + a few trolleys at the door
  const corral = (x, z) => {
    for (const s of [-1, 1]) { k.box('#9aa0a3', [0.06, 1.0, 4.2], [x + s * 0.8, 0, z], { base: true }); k.box('#9aa0a3', [0.06, 0.06, 4.2], [x + s * 0.8, 1.0, z]); }
    k.box('#c4372b', [1.66, 0.4, 0.08], [x, 0.7, z - 2.1], { base: true });
    for (let i = 0; i < 4; i++) { k.box('#b9bec0', [0.6, 0.55, 0.9], [x, 0.35, z - 1.2 + i * 0.6], { base: true, taper: [1.1, 1.0] }); k.box('#c4372b', [0.6, 0.05, 0.05], [x, 1.0, z - 1.65 + i * 0.6]); }
  };
  corral(11.5, 14.1); corral(-11.5, 14.1);
  for (let i = 0; i < 4; i++) k.box('#b9bec0', [0.6, 0.55, 0.9], [-5.6 + i * 0.62, 0.35, pz + 2.2], { base: true, taper: [1.1, 1.0] });
  // propane cage + ice chest + parked cars + light poles
  k.box('#5f6468', [2.4, 1.8, 0.9], [-12.0, 0, pz + 0.5], { base: true });
  for (let i = 0; i < 4; i++) k.cyl('#e9e2cf', 0.18, 0.18, 0.75, [-12.9 + i * 0.6, 0.1, pz + 0.5], { base: true, seg: 5, open: true });
  k.box('#e9ece8', [2.0, 1.2, 0.9], [12.0, 0, pz + 0.5], { base: true, c: 0.04 }); k.box('#6f8fb0', [2.02, 0.3, 0.92], [12.0, 0.9, pz + 0.5], { base: true });
  parkedCar(k, -14.0, 11.6, 0, PAL.civ[0]); parkedCar(k, -2.8, 16.8, Math.PI, PAL.civ[4]); parkedCar(k, 16.8, 16.8, Math.PI, PAL.civ[2]);
  lightPole(k, -6, 14.1); lightPole(k, 6, 14.1, 8);
  void r;
  const g = root('store_megamart', 0, { w: W, h: 12.5, l: D });
  g.add(k.mesh('body'));
  // one sign texture: portal letters (top) + slogan strip (bottom)
  // pylon sign at the lot's +X front corner (static, merged into a second small mesh)
  const k2 = new Kit(5105); k2.floor = 0;
  const pyx = W / 2 - 3.3, pyz = D / 2 - 1.6;
  k2.box(PAL.concrete, [1.6, 0.6, 1.0], [pyx, 0, pyz], { base: true });
  for (const dx of [-1.4, 1.4]) k2.box('#5f6468', [0.35, 9.5, 0.35], [pyx + dx, 0, pyz], { base: true });
  k2.box(portal, [6.4, 3.4, 0.5], [pyx, 9.0, pyz], { base: true, c: 0.08 });
  k2.box('#2f3d36', [5.2, 1.1, 0.4], [pyx, 7.6, pyz], { base: true });
  g.add(k2.mesh('pole'));
  const tex = drawTex('megamart', 2048, 1024, portal, (ctx, Wc) => {
    const big = (y, h, px) => {
      ctx.fillStyle = shade(portal, 0.9); ctx.fillRect(0, y, Wc, h);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${px}px "Arial Black", Arial, sans-serif`;
      ctx.lineWidth = px * 0.07; ctx.strokeStyle = '#4a2418'; ctx.strokeText('MEGAMART', Wc / 2, y + h * 0.48);
      ctx.fillStyle = cream; fitText(ctx, 'MEGAMART', Wc / 2, y + h * 0.48, Wc * 0.94, px);
      ctx.fillStyle = '#e2b93b'; ctx.fillRect(Wc * 0.08, y + h - 34, Wc * 0.84, 12);
    };
    big(0, 440, 330);                                       // portal letters (13.4 × 2.9 m)
    ctx.fillStyle = '#2f3d36'; ctx.fillRect(0, 450, Wc, 190);  // slogan strip under the canopy
    ctx.fillStyle = cream; fitText(ctx, 'EVERYTHING · ALWAYS · ISH', Wc / 2, 510, Wc * 0.9, 80, '700');
    ctx.fillStyle = '#e2b93b'; fitText(ctx, 'GROCERY · GARDEN · PHARMACY · AUTO · CAMPING', Wc / 2, 592, Wc * 0.9, 50, '700');
    big(650, 260, 230);                                     // pylon face (6.1 × 2.6 m … squashed is fine for letters)
    ctx.fillStyle = '#2f3d36'; ctx.fillRect(0, 920, Wc, 104);
    ctx.fillStyle = '#e2b93b'; fitText(ctx, 'OPEN 24 HRS · NEXT RIGHT', Wc / 2, 972, Wc * 0.8, 74, '700');
  });
  g.add(signMesh(tex, [
    { w: 13.4, h: 2.9, pos: [0, 8.35, pz + 1.22], rect: [0, 0, 1, 440 / 1024] },
    { w: 13.4, h: 1.25, pos: [0, 4.92, pz + 4.66], rect: [0, 450 / 1024, 1, 640 / 1024] },
    { w: 6.1, h: 2.9, pos: [pyx, 10.7, pyz + 0.26], rect: [0, 650 / 1024, 1, 910 / 1024] },
    { w: 6.1, h: 2.9, pos: [pyx, 10.7, pyz - 0.26], rotY: Math.PI, rect: [0, 650 / 1024, 1, 910 / 1024] },
    { w: 5.0, h: 1.0, pos: [pyx, 8.15, pyz + 0.21], rect: [0, 920 / 1024, 1, 1] },
  ], portal));
  return g;
}

// ── 12. car_wash (drive-through tunnel along X, brushes brush_0…brush_2 spin on Y) ─
export function buildCarWash() {
  const k = new Kit(5201); k.floor = 0;
  const W = 32, D = 16, tl = 18, tw = 6.4, th = 4.8, tz = -2.5;
  const wall = '#e8e2d2', blue = '#3f7fae', aqua = '#7fc4d4';
  lot(k, W, D, 0, '#66676b');
  // wash bay floor (wet, darker) + guide rail
  k.box('#4a4c50', [tl, 0.05, tw - 0.6], [0, 0, tz], { base: true });
  k.box('#9aa0a3', [tl, 0.15, 0.3], [0, 0.05, tz - 0.9], { base: true });
  // walls: back wall solid, front wall with a long window band so the brushes show
  k.box(wall, [tl, th, 0.3], [0, 0, tz - tw / 2], { base: true });
  k.box(wall, [tl, 1.0, 0.3], [0, 0, tz + tw / 2], { base: true });
  k.box(wall, [tl, 1.0, 0.3], [0, th - 1.0, tz + tw / 2], { base: true });
  for (let i = 0; i <= 6; i++) k.box(wall, [0.35, th, 0.3], [-tl / 2 + i * tl / 6, 0, tz + tw / 2], { base: true });
  // roof with a blue wave fascia, end frames, strip curtains at the exit
  k.box('#c9c4b6', [tl + 0.6, 0.3, tw + 0.6], [0, th, tz], { base: true });
  k.box(blue, [tl + 0.8, 1.0, 0.25], [0, th - 0.2, tz + tw / 2 + 0.35], { base: true });
  for (let i = 0; i < 9; i++) k.box(aqua, [1.2, 0.2, 0.1], [-tl / 2 + 1 + i * 2, th + 0.2 + (i % 2) * 0.25, tz + tw / 2 + 0.48], { rot: [0, 0, (i % 2 ? -0.25 : 0.25)] });
  for (const sx of [1, -1]) {
    k.box(blue, [0.5, th + 0.4, 0.5], [sx * tl / 2, 0, tz - tw / 2], { base: true });
    k.box(blue, [0.5, th + 0.4, 0.5], [sx * tl / 2, 0, tz + tw / 2], { base: true });
    k.box(blue, [0.5, 0.6, tw + 0.5], [sx * tl / 2, th - 0.2, tz], { base: true });
  }
  for (let i = 0; i < 12; i++) k.box(i % 2 ? '#9fc8d6' : '#c8dde4', [0.04, th - 1.0, 0.45], [-tl / 2 + 0.2, 0.05 + 0.6, tz - tw / 2 + 0.5 + i * 0.47], { base: true });
  // overhead sprayer arches inside
  for (const x of [5.5, -7.5]) { k.box('#9aa0a3', [0.15, th - 0.4, 0.15], [x, 0, tz - tw / 2 + 0.4], { base: true }); k.box('#9aa0a3', [0.15, th - 0.4, 0.15], [x, 0, tz + tw / 2 - 0.4], { base: true }); k.box('#9aa0a3', [0.15, 0.15, tw - 0.8], [x, th - 0.6, tz]); }
  // entrance lane (+X end) with arrows, pay kiosk under a little canopy, vacuum posts
  for (let i = 0; i < 3; i++) { const x = tl / 2 + 2 + i * 2.6; k.poly('#e9e4cf', [[x + 0.9, 0.05, tz], [x, 0.05, tz + 0.45], [x, 0.05, tz - 0.45]], { facing: [0, 1, 0] }); k.rectY('#e9e4cf', 0.05, [x, x + 1.2], [tz - 0.12, tz + 0.12], { off: 0.002 }); }
  k.box('#b9bec0', [0.7, 1.5, 0.6], [tl / 2 + 5, 0, tz + 2.0], { base: true, c: 0.04 });
  k.box('#2f3a42', [0.5, 0.4, 0.02], [tl / 2 + 5, 1.0, tz + 1.69], { base: true });
  k.box(blue, [2.0, 0.15, 1.6], [tl / 2 + 5, 2.6, tz + 2.0], { base: true });
  k.box('#9aa0a3', [0.1, 2.6, 0.1], [tl / 2 + 5.8, 0, tz + 2.6], { base: true });
  for (let i = 0; i < 3; i++) {
    const x = -tl / 2 - 3 + i * 5.5 - 0, z = 5.4;
    k.box('#e2b93b', [0.5, 1.4, 0.5], [x, 0, z], { base: true, c: 0.05 });
    k.box('#2a2a2b', [0.12, 2.6, 0.12], [x, 0, z - 0.35], { base: true });
    k.box('#2a2a2b', [1.2, 0.1, 0.1], [x + 0.5, 2.6, z - 0.35]);
    rod(k, '#3a3b3d', [x + 1.0, 2.55, z - 0.35], [x + 1.4, 0.6, z + 0.4], 0.04, 4);
    k.rectY('#e9e4cf', 0.045, [x + 1.8, x + 1.9], [z - 1.8, z + 2.2], { off: 0.002 });
  }
  // tall sign: pole + bubble cluster backing
  k.box('#5f6468', [0.35, 8.5, 0.35], [-W / 2 + 2, 0, D / 2 - 1.2], { base: true });
  k.box(PAL.concrete, [0.9, 0.5, 0.9], [-W / 2 + 2, 0, D / 2 - 1.2], { base: true });
  k.box(blue, [5.2, 2.6, 0.4], [-W / 2 + 2, 8.0, D / 2 - 1.2], { c: 0.12 });
  for (const [dx, dy, rr] of [[-2.4, 1.4, 0.7], [-1.2, 1.8, 0.5], [2.2, 1.5, 0.8], [1.0, 1.9, 0.45], [2.8, -0.9, 0.5]]) k.ico('#d8eef4', rr, [-W / 2 + 2 + dx, 8.0 + dy, D / 2 - 1.3], { detail: 1, scale: [1, 1, 0.5] });
  const g = root('car_wash', 0, { w: W, h: 10.6, l: D });
  g.add(k.mesh('body'));
  // brushes: vertical foam rollers (two sides of the first station, one at the second)
  const brush = (name, x, z, cols) => pivot(g, name, [x, 0, tz + z], (kb) => {
    kb.cyl('#5f6468', 0.12, 0.12, 4.0, [0, 0.2, 0], { base: true, seg: 6 });
    kb.box('#5f6468', [0.4, 0.2, 0.4], [0, 4.2, 0], { base: true });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      kb.box(cols[i % cols.length], [0.12, 3.2, 0.8], [Math.cos(a) * 0.5, 0.6, Math.sin(a) * 0.5], { base: true, rot: [0, -a, 0] });
    }
  }, { seed: 5210 + x });
  brush('brush_0', 3.2, 1.7, ['#3f7fae', '#5aa0c8', '#e8b8c8']);
  brush('brush_1', 3.2, -1.7, ['#3f7fae', '#5aa0c8', '#e8b8c8']);
  brush('brush_2', -2.6, 1.7, ['#d9a83a', '#e9c45a', '#3f7fae']);
  const tex = drawTex('carwash', 1024, 512, blue, (ctx, Wc, Hc) => {
    const grd = ctx.createLinearGradient(0, 0, 0, Hc); grd.addColorStop(0, '#4f8fbe'); grd.addColorStop(1, '#2f6f9e'); ctx.fillStyle = grd; ctx.fillRect(0, 0, Wc, Hc);
    ctx.fillStyle = 'rgba(230,245,250,0.85)';
    for (const [x, y, rr] of [[90, 90, 40], [150, 60, 22], [930, 110, 46], [870, 70, 20], [960, 420, 30], [70, 420, 26]]) { ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill(); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff'; ctx.lineWidth = 12; ctx.strokeStyle = '#1f4a6e'; ctx.font = '900 150px "Arial Black", Arial, sans-serif';
    ctx.strokeText('SUDS CITY', Wc / 2, 190); fitText(ctx, 'SUDS CITY', Wc / 2, 190, Wc * 0.86, 150);
    ctx.fillStyle = '#e9c45a'; fitText(ctx, 'CAR WASH', Wc / 2, 340, Wc * 0.7, 110);
    ctx.fillStyle = '#e6f2f6'; fitText(ctx, 'SOFT-TOUCH · OPEN 7 DAYS · RVs WELCOME', Wc / 2, 450, Wc * 0.86, 40, '700');
  });
  g.add(signMesh(tex, [
    { w: 5.0, h: 2.5, pos: [-W / 2 + 2, 9.3, D / 2 - 0.98] },
    { w: 7.0, h: 1.0, pos: [0, th - 0.2 + 0.5, tz + tw / 2 + 0.49], rect: [0, 0.2, 1, 0.5] },
  ], blue));
  return g;
}

// ── 13. motel_2storey (Sleepy Cactus Motel, outside walkway, neon VACANCY) ─────
export function buildMotel2() {
  const k = new Kit(5301); k.floor = 0;
  const r = rng(5302);
  const w = 30, d = 9, fh = 3.1, H = fh * 2, bz = -4;
  const st = '#e3c9a4', trim = '#7a9a7e', rail = '#e9e2cf';
  k.box('#7a6a5a', [w + 0.1, 0.35, d + 0.1], [0, 0, bz], { base: true });
  k.box(st, [w, H, d], [0, 0.35, bz], { base: true, c: 0.06 });
  const F = walls(w, d, 0, bz);
  // walkway slab, posts, railing, roof overhang
  const wz = bz + d / 2 + 1.2;
  k.box(PAL.concreteLight, [w + 0.4, 0.25, 2.4], [0, fh + 0.1, wz], { base: true });
  k.box('#c9b190', [w + 1.2, 0.3, 3.2], [0, H + 0.35, bz + d / 2 + 1.3], { base: true });
  k.box(trim, [w + 1.2, 0.5, 0.15], [0, H + 0.2, bz + d / 2 + 2.9], { base: true });
  for (let i = 0; i <= 10; i++) k.box(rail, [0.22, H + 0.35, 0.22], [-w / 2 + i * w / 10, 0, wz + 1.1], { base: true });
  railing(k, trim, -w / 2, w / 2, wz + 1.15, fh + 0.35, 0.95, 1.0, { t: 0.05, mid: true });
  // rooms: 8 per floor
  for (let fl = 0; fl < 2; fl++) for (let i = 0; i < 8; i++) {
    const x0 = -w / 2 + 0.8 + i * (w - 1.6) / 8, y = 0.35 + fl * fh;
    const dc = ['#4f8f8a', '#c9704a', '#d9a83a', '#7a9a7e'][(i + fl) % 4];
    wr(k, F.front, [x0 + 0.3, x0 + 1.2], [y, y + 2.15], dc, 0.02);
    wr(k, F.front, [x0 + 1.0, x0 + 1.1], [y + 1.0, y + 1.1], '#c9a24a', 0.026);
    const lit = r() < 0.3;
    wr(k, F.front, [x0 + 1.6, x0 + 2.8], [y + 1.0, y + 2.0], lit ? PAL.windowLit : '#3b464c', 0.02);
    wr(k, F.front, [x0 + 1.6, x0 + 1.95], [y + 1.0, y + 2.0], ['#a8542e', '#4f6b8a', '#8a7a3a'][i % 3], 0.026);
    k.box('#9a968c', [0.6, 0.45, 0.25], [x0 + 2.25, y + 2.2, bz + d / 2 + 0.12], { base: true });
  }
  for (const f of [F.left, F.right, F.back]) band(k, f, 0.35, 1.0, mix(st, PAL.dirt, 0.35), 0.014);
  band(k, F.front, fh + 0.35, fh + 0.5, trim, 0.016);
  // stairs at both ends
  for (const sx of [1, -1]) {
    for (let i = 0; i < 9; i++) k.box(PAL.concreteLight, [1.3, 0.16, 0.34], [sx * (w / 2 + 0.8), 0.18 + i * 0.335, wz + 1.6 - i * 0.33], { base: true });
    beam(k, rail, [sx * (w / 2 + 1.42), 1.0, wz + 1.6], [sx * (w / 2 + 1.42), fh + 1.2, wz - 1.4], 0.06);
    k.box(PAL.concreteLight, [1.3, fh + 0.35, 0.3], [sx * (w / 2 + 0.8), 0, wz - 1.6], { base: true });
  }
  // office at the +X end with a porte-cochère
  const ox = w / 2 + 5.2, oz = bz + 1.5;
  k.box('#efe2c8', [6, 3.6, 7], [ox, 0, oz], { base: true, c: 0.05 });
  const O = walls(6, 7, ox, oz);
  wr(k, O.front, [ox - 2.5, ox + 0.6], [0.8, 2.8], '#33404a', 0.02);
  wr(k, O.front, [ox + 1.0, ox + 2.2], [0, 2.4], '#4f8f8a', 0.02);
  k.box(trim, [6.6, 0.5, 7.6], [ox, 3.6, oz], { base: true });
  k.box('#c9b190', [6, 0.35, 5], [ox, 3.4, oz + 6.0], { base: true });
  for (const sx of [1, -1]) k.box(rail, [0.3, 3.4, 0.3], [ox + sx * 2.7, 0, oz + 8.2], { base: true });
  // pool (fenced) in front of the −X end
  const px = -9, pzz = bz + d / 2 + 7.5;
  k.box(PAL.concreteLight, [10, 0.15, 6], [px, 0, pzz], { base: true });
  k.box('#3f8fae', [7, 0.02, 3.6], [px, 0.15, pzz], { base: true });
  k.rectY('#7fc4d8', 0.18, [px - 3.2, px - 0.5], [pzz - 1.5, pzz + 1.4], { off: 0.002 });
  for (const s of [1, -1]) railing(k, '#e9e2cf', px - 5, px + 5, pzz + s * 3, 0.15, 1.1, 1.0, { t: 0.04, mid: true });
  for (const s of [1, -1]) railingZ(k, '#e9e2cf', pzz - 3, pzz + 3, px + s * 5, 0.15, 1.1, 1.0, { t: 0.04, mid: true });
  for (let i = 0; i < 3; i++) { k.box('#efece4', [0.7, 0.12, 1.8], [px - 3 + i * 2.2, 0.45, pzz + 2.3], { rot: [0, 0, 0] }); k.box('#efece4', [0.7, 0.6, 0.08], [px - 3 + i * 2.2, 0.75, pzz + 1.5], { rot: [-0.6, 0, 0] }); }
  k.cyl('#5f6468', 0.04, 0.04, 2.4, [px + 3.5, 0.15, pzz + 2.0], { base: true, seg: 4 });
  k.cone('#c9704a', 1.3, 0.6, [px + 3.5, 2.5, pzz + 2.0], { seg: 8 });
  // parked car + potted cactus
  parkedCar(k, 6, bz + d / 2 + 6.0, Math.PI, PAL.civ[3], { dusty: true });
  for (const x of [-3, 3]) { k.cyl('#9a5844', 0.3, 0.24, 0.45, [x, 0, wz + 1.6], { base: true, seg: 7 }); k.cyl(PAL.cactus, 0.14, 0.16, 0.9, [x, 0.45, wz + 1.6], { base: true, seg: 6 }); }
  // tall sign pole at the +X front corner
  const sx = w / 2 + 9.2, sz = bz + d / 2 + 6.5;
  k.box('#5f6468', [0.4, 11, 0.4], [sx, 0, sz], { base: true });
  k.box(PAL.concrete, [1.0, 0.5, 1.0], [sx, 0, sz], { base: true });
  k.box('#2f4a3e', [5.6, 3.4, 0.45], [sx, 8.9, sz], { base: true, c: 0.1 });
  k.box('#1f2022', [3.8, 1.0, 0.3], [sx, 7.4, sz + 0.32], { base: true, c: 0.05 });
  // a 3D cactus on top of the sign
  k.cyl(PAL.cactus, 0.32, 0.36, 2.2, [sx + 1.6, 12.3, sz], { base: true, seg: 7 });
  k.cyl(PAL.cactus, 0.2, 0.22, 0.9, [sx + 2.2, 13.0, sz], { base: true, seg: 6 });
  k.cyl(PAL.cactus, 0.2, 0.22, 0.6, [sx + 1.6 + 0.0, 13.0, sz], { axis: 'x', seg: 6, rot: [0, 0, 0] });
  const g = root('motel_2storey', 0, { w: 1, h: 1, l: 1 });
  g.add(k.mesh('body'));
  const tex = drawTex('motel', 1024, 640, '#2f4a3e', (ctx, Wc, Hc) => {
    ctx.strokeStyle = '#e9c45a'; ctx.lineWidth = 10; ctx.strokeRect(14, 14, Wc - 28, Hc - 28);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e9c45a'; fitText(ctx, 'SLEEPY', Wc / 2, Hc * 0.22, Wc * 0.8, 150, '900', 'Georgia, "Times New Roman", serif');
    ctx.fillStyle = '#efe6cf'; fitText(ctx, 'CACTUS', Wc / 2, Hc * 0.48, Wc * 0.86, 170, '900', 'Georgia, "Times New Roman", serif');
    ctx.fillStyle = '#c9704a'; fitText(ctx, 'MOTEL', Wc / 2, Hc * 0.7, Wc * 0.5, 90);
    ctx.fillStyle = '#c9d6c9'; fitText(ctx, 'POOL · COLOR TV · NO QUESTIONS', Wc / 2, Hc * 0.87, Wc * 0.86, 42, '700');
  });
  g.add(signMesh(tex, [{ w: 5.3, h: 3.2, pos: [sx, 10.6, sz + 0.24] }], '#2f4a3e', 'sign'));
  const neon = drawTex('vacancy', 512, 128, '#140f12', (ctx, Wc, Hc) => {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ff4f8a'; ctx.shadowBlur = 22; ctx.fillStyle = '#ff9ec0';
    fitText(ctx, 'VACANCY', Wc / 2, Hc / 2 + 4, Wc * 0.85, 96, '700', 'Arial, Helvetica, sans-serif');
    ctx.shadowBlur = 0; ctx.strokeStyle = '#ff6fa0'; ctx.lineWidth = 4; ctx.strokeRect(10, 10, Wc - 20, Hc - 20);
  }, false);
  g.add(signMesh(neon, [{ w: 3.6, h: 0.9, pos: [sx, 7.9, sz + 0.48] }], '#ff6fa0', 'vacancy', { glow: true }));
  g.userData.neon = ['vacancy'];
  return recentre(g);
}

// ── 14. drive_thru (Big Bunky's, rotating burger sign `sign`) ─────────────────────
export function buildDriveThru() {
  const k = new Kit(5401); k.floor = 0;
  const W = 30, D = 18, bw = 12, bd = 8, bh = 4.0, bz = -3.5;
  const red = '#b8452f', cream = '#efe2c4', mustard = '#d9a83a';
  lot(k, W, D, 0, '#626367');
  k.box(cream, [bw, bh, bd], [0, 0, bz], { base: true, c: 0.06 });
  const F = walls(bw, bd, 0, bz);
  band(k, F.front, 0, 0.7, '#7a4a32', 0.012);
  wr(k, F.front, [-5.2, 1.6], [0.9, 2.9], '#33404a', 0.02);
  for (let x = -4.0; x < 1.6; x += 1.4) wr(k, F.front, [x - 0.04, x + 0.04], [0.9, 2.9], '#8f8b82', 0.026);
  wr(k, F.front, [2.4, 4.4], [0, 2.6], '#33404a', 0.02);
  wr(k, F.front, [3.38, 3.42], [0, 2.6], '#8f8b82', 0.026);
  // checker band + slanted red roof fascia
  for (let i = 0; i < 24; i++) wr(k, F.front, [-6 + i * 0.5, -5.5 + i * 0.5], [3.0, 3.25], i % 2 ? '#1f2022' : cream, 0.016);
  k.box(red, [bw + 0.8, 1.2, bd + 0.8], [0, bh, bz], { base: true, taper: [1.06, 1.06], c: 0.05 });
  k.box(mustard, [bw + 1.3, 0.2, bd + 1.3], [0, bh + 1.2, bz], { base: true });
  k.box('#a9a79e', [2.2, 1.0, 1.8], [-3, bh + 1.4, bz - 1], { base: true, c: 0.05 });
  // drive-thru window on −X with a little canopy, lane curb, menu board + speaker
  wr(k, F.right, [bz - 1.2, bz + 0.4], [1.0, 2.2], '#3a464c', 0.02);
  k.box(red, [1.4, 0.15, 2.2], [-bw / 2 - 0.7, 2.7, bz - 0.4], { base: true });
  k.box('#a8a294', [0.3, 0.2, 14], [-bw / 2 - 3.6, 0, bz + 1.0], { base: true });
  for (let i = 0; i < 3; i++) k.poly('#e9e4cf', [[-bw / 2 - 1.8, 0.05, bz + 4 - i * 3.5 - 0.8], [-bw / 2 - 1.4, 0.05, bz + 4 - i * 3.5], [-bw / 2 - 2.2, 0.05, bz + 4 - i * 3.5]], { facing: [0, 1, 0] });
  k.box('#2a2b2d', [0.3, 2.2, 2.6], [-bw / 2 - 4.2, 0, bz + 4.5], { base: true, c: 0.03 });
  for (let i = 0; i < 4; i++) k.box(['#d9a83a', '#efe2c4', '#b8452f', '#efe2c4'][i], [0.02, 0.38, 2.2], [-bw / 2 - 4.04, 0.6 + i * 0.42, bz + 4.5], { base: true });
  k.box('#5f6468', [0.25, 1.2, 0.25], [-bw / 2 - 3.9, 0, bz + 2.4], { base: true }); k.box(red, [0.35, 0.5, 0.35], [-bw / 2 - 3.9, 1.0, bz + 2.4], { base: true });
  // patio: two tables with umbrellas
  for (const x of [5.5, 9.5]) {
    k.cyl('#e9e2cf', 0.5, 0.5, 0.06, [x, 0.75, 2.4], { seg: 8 }); k.cyl('#5f6468', 0.05, 0.05, 2.4, [x, 0, 2.4], { base: true, seg: 4 });
    k.cone(x > 7 ? mustard : red, 1.4, 0.6, [x, 2.4, 2.4], { base: true, seg: 8 });
    for (const s of [1, -1]) k.box('#e9e2cf', [1.2, 0.06, 0.35], [x, 0.45, 2.4 + s * 0.8]);
  }
  bin(k, 3.6, 1.0, red);
  parkedCar(k, -bw / 2 - 1.8, bz + 6.5, 0, PAL.civ[2]);
  // pole for the rotating sign (static part)
  const px = W / 2 - 3, pz = D / 2 - 2, poleH = 9;
  k.box(PAL.concrete, [1.0, 0.5, 1.0], [px, 0, pz], { base: true });
  k.cyl('#c4372b', 0.22, 0.26, poleH, [px, 0, pz], { base: true, seg: 8 });
  k.cyl('#5f6468', 0.35, 0.35, 0.3, [px, poleH - 0.1, pz], { base: true, seg: 8 });
  const g = root('drive_thru', 0, { w: W, h: poleH + 6.2, l: D });
  g.add(k.mesh('body'));
  // `sign`: spins on Y at the pole top — giant burger + two-sided name board
  const sg = pivot(g, 'sign', [px, poleH + 0.2, pz], (kb) => {
    const by = 2.2;
    kb.box('#5f6468', [0.3, by - 1.2, 0.3], [0, 0, 0], { base: true });
    kb.box('#1f2022', [4.6, 1.5, 0.3], [0, 0.0 + 0.3, 0], { base: true, c: 0.08 });
    kb.lathe('#c98a3e', [[0, 0], [1.7, 0.02], [1.85, 0.25], [1.75, 0.55], [0, 0.58]], 12, [0, by, 0]);                     // bottom bun
    kb.cyl('#5a3220', 1.95, 1.95, 0.42, [0, by + 0.58, 0], { base: true, seg: 12 });                                         // patty
    kb.box('#e9b83a', [3.5, 0.08, 3.5], [0, by + 1.0, 0], { base: true, rot: [0, 0.4, 0] });                                 // cheese
    for (const a of [0.4, 0.4 + Math.PI / 2, 0.4 + Math.PI, 0.4 + 1.5 * Math.PI]) kb.cone('#e9b83a', 0.2, 0.5, [Math.cos(a) * 1.75 + Math.sin(a) * 0.9, by + 0.82, Math.sin(a) * 1.75 - Math.cos(a) * 0.9], { seg: 4, rot: [Math.PI, 0, 0] });
    kb.torus('#6f9a3e', 1.9, 0.14, [0, by + 1.12, 0], { rot: [Math.PI / 2, 0, 0], rs: 4, ts: 14 });                           // lettuce
    kb.cyl('#c4372b', 1.8, 1.8, 0.16, [0, by + 1.14, 0], { base: true, seg: 12 });                                           // tomato
    kb.lathe('#d39a4a', [[1.9, 0], [2.0, 0.3], [1.8, 0.9], [1.2, 1.35], [0.5, 1.55], [0, 1.6]], 12, [0, by + 1.3, 0]);       // top bun
    const rr = rng(5410);
    for (let i = 0; i < 18; i++) { const a = rr() * Math.PI * 2, t = 0.3 + rr() * 0.6; const rad = 1.9 * (1 - t * 0.7), y = by + 1.3 + 0.3 + t * 1.2; kb.box('#f3ead2', [0.16, 0.06, 0.09], [Math.cos(a) * rad, y, Math.sin(a) * rad], { rot: [0, -a, 0.5] }); }
  }, { seed: 5411 });
  const tex = drawTex('bunkys', 1024, 320, '#1f2022', (ctx, Wc, Hc) => {
    ctx.fillStyle = red; ctx.fillRect(10, 10, Wc - 20, Hc - 20);
    ctx.fillStyle = mustard; ctx.fillRect(10, Hc - 70, Wc - 20, 60);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 12; ctx.strokeStyle = '#5a1a12'; ctx.font = '900 150px "Arial Black", Arial, sans-serif'; ctx.strokeText("BIG BUNKY'S", Wc / 2, 115);
    ctx.fillStyle = cream; fitText(ctx, "BIG BUNKY'S", Wc / 2, 115, Wc * 0.9, 150);
    ctx.fillStyle = '#2a1a12'; fitText(ctx, 'BURGERS · SHAKES · DRIVE-THRU', Wc / 2, Hc - 40, Wc * 0.85, 40, '700');
  });
  sg.add(signMesh(tex, [{ w: 4.4, h: 1.38, pos: [0, 1.05, 0.16], double: true }], red, 'sign_face'));
  g.userData.spin = { part: 'sign', axis: 'y', note: 'rotation.y spins the burger + name board (≈0.6 rad/s)' };
  return g;
}

// ── 15. minigolf_dino (Dino-Mite Mini Golf: big fibreglass sauropod) ────────────
export function buildMinigolfDino() {
  const k = new Kit(5501); k.floor = 0;
  const r = rng(5502);
  const W = 28, D = 20;
  const felt = '#4f8a4a', felt2 = '#5f9a52', border = '#8a6a4a';
  k.blob('#7f9a58', 13.5, [0, 0.012, 0], { seg: 14, sx: 1.0, sz: 0.72, seed: 5503, wobble: 0.1, off: 0 });
  // fairways: flat felt polygons with timber borders
  const fair = (pts, col) => {
    k.top(col, 0.06, pts, { off: 0 });
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; beam(k, border, [a[0], 0.1, a[1]], [b[0], 0.1, b[1]], 0.18, { tz: 0.18 }); }
  };
  fair([[-12, 6], [-4, 6], [-4, 8], [-12, 8]], felt);
  fair([[-2, 7.5], [8, 7.5], [10, 4.5], [8, 3], [6, 5], [-2, 5.5]], felt2);
  fair([[-12, -1], [-9.5, -1], [-9.5, 4], [-12, 4]], felt2);
  fair([[0.5, -8.5], [11, -8.5], [11, -6], [0.5, -6]], felt);
  fair([[-11, -8], [-7, -8], [-5, -3], [-7, -2], [-11, -4]], felt);
  for (const [x, z] of [[-11.2, 7], [9.0, 4.4], [-10.7, 3.2], [10.2, -7.2], [-9.8, -6.6]]) {
    k.cyl('#1f2022', 0.12, 0.12, 0.02, [x, 0.07, z], { seg: 8 });
    k.cyl('#e9e2cf', 0.02, 0.02, 1.1, [x, 0.07, z], { base: true, seg: 3 });
    k.box('#c4372b', [0.35, 0.22, 0.02], [x + 0.18, 1.0, z]);
  }
  // little volcano obstacle + a log bridge
  k.lathe('#7a5a42', [[1.6, 0], [1.1, 0.9], [0.5, 1.6], [0.35, 1.7], [0, 1.4]], 9, [-10.7, 0, 1.4]);
  k.cyl('#c4572b', 0.4, 0.34, 0.1, [-10.7, 1.62, 1.4], { seg: 9 });
  k.cyl(PAL.wood, 0.25, 0.25, 3.0, [6.0, 0.2, -7.2], { axis: 'x', seg: 6 });
  // THE DINOSAUR: sauropod (long neck over hole 2, tail curling down over hole 4)
  const dc = '#6f9a7a', belly = '#a9c49a', dk = shade(dc, 0.82);
  const dx = 2.5, dz = 0.5;
  k.ico(dc, 1, [dx, 3.6, dz], { detail: 1, scale: [4.2, 2.4, 2.4], jit: 0.05 });
  k.ico(belly, 1, [dx, 2.8, dz], { detail: 1, scale: [3.4, 1.4, 1.9] });
  for (const [lx, lz] of [[-2.4, -1.2], [-2.4, 1.2], [2.6, -1.2], [2.6, 1.2]]) {
    k.cyl(dc, 0.55, 0.65, 3.0, [dx + lx, 0, dz + lz], { base: true, seg: 7 });
    k.cyl(dk, 0.7, 0.7, 0.25, [dx + lx, 0, dz + lz], { base: true, seg: 7 });
  }
  // neck: chain of segments curving up and forward (+X, slightly toward +Z/the road)
  let p = [dx + 3.4, 4.6, dz], ang = 0.75;
  for (let i = 0; i < 6; i++) {
    const len = 1.5, rad = 0.95 - i * 0.1;
    const q = [p[0] + Math.cos(ang) * len, p[1] + Math.sin(ang) * len, p[2] + 0.15];
    k.cyl(i % 2 ? dc : shade(dc, 1.05), rad * 0.9, rad, len + 0.4, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], { seg: 7, rot: [0, 0, ang - Math.PI / 2] });
    p = q; ang -= 0.1;
  }
  k.ico(dc, 1, [p[0] + 0.5, p[1] + 0.2, p[2]], { detail: 0, scale: [1.2, 0.75, 0.75] });
  k.box(dc, [1.1, 0.5, 0.9], [p[0] + 1.3, p[1] - 0.05, p[2]], { c: 0.18 });
  for (const s of [1, -1]) { k.ico('#f3ead2', 0.18, [p[0] + 0.9, p[1] + 0.5, p[2] + s * 0.42]); k.ico('#1f2022', 0.09, [p[0] + 0.98, p[1] + 0.52, p[2] + s * 0.52]); }
  k.box('#5a2a24', [0.6, 0.06, 0.6], [p[0] + 1.5, p[1] - 0.22, p[2]]);
  // tail: tapering chain sweeping back (−X) and down to the ground
  let t = [dx - 3.8, 3.8, dz], ta = Math.PI + 0.35;
  for (let i = 0; i < 6; i++) {
    const len = 1.6, rad = 0.85 - i * 0.13;
    const q = [t[0] + Math.cos(ta) * len, Math.max(0.25, t[1] + Math.sin(ta) * len), t[2] - 0.35 * i * 0.3];
    k.cyl(i % 2 ? dc : dk, Math.max(0.1, rad - 0.12), rad, len + 0.3, [(t[0] + q[0]) / 2, (t[1] + q[1]) / 2, (t[2] + q[2]) / 2], { seg: 6, rot: [0, 0, ta - Math.PI / 2] });
    t = q; ta += 0.08;
  }
  // back plates + peeling paint patches
  for (let i = 0; i < 6; i++) k.cone('#c9704a', 0.35, 0.7, [dx - 2.5 + i, 5.85 - Math.abs(i - 2.5) * 0.15, dz], { seg: 4, scale: [1, 1, 0.3] });
  for (let i = 0; i < 5; i++) k.ico(mix(dc, '#d9d3c4', 0.6), 0.45, [dx - 2 + r() * 4, 3.8 + r(), dz + 2.2], { detail: 0, scale: [1, 0.6, 0.15] });
  // kiosk hut with putter rack
  const hx = -6.5, hz = -9.0;
  k.box('#e9e2cf', [4, 2.8, 2.6], [hx, 0, hz], { base: true, c: 0.04 });
  const Hk = walls(4, 2.6, hx, hz);
  wr(k, Hk.front, [hx - 1.4, hx + 1.4], [1.0, 2.2], '#33404a', 0.02);
  k.box('#c9704a', [4.6, 0.25, 3.2], [hx, 2.8, hz], { base: true, taper: [0.9, 0.9] });
  for (let i = 0; i < 6; i++) k.box(['#c4372b', '#2f6aa0', '#e2b93b'][i % 3], [0.04, 1.0, 0.04], [hx + 2.2, 0.1, hz - 0.8 + i * 0.3], { base: true, rot: [0, 0, 0.1] });
  // sign arch over the entrance path
  for (const x of [-1.6, 1.6]) k.box(PAL.woodDark, [0.3, 4.2, 0.3], [-3 + x, 0, D / 2 - 1.2], { base: true });
  k.box(PAL.woodDark, [4.2, 1.6, 0.25], [-3, 3.6, D / 2 - 1.2], { base: true });
  for (let i = 0; i < 5; i++) k.box('#d9a83a', [0.3, 0.6, 0.12], [-4.8 + i * 0.9, 5.2 + (i % 2) * 0.15, D / 2 - 1.2], { base: true, rot: [0, 0, (i - 2) * 0.12] }); // bone-shaped spikes
  const g = root('minigolf_dino', 0, { w: W, h: 11.5, l: D });
  g.add(k.mesh('body'));
  const tex = textTex('dinogolf', [
    { text: 'DINO-MITE', y: 0.38, px: 120, color: '#e9c45a' },
    { text: 'MINI GOLF · 18 HOLES OF PREHISTORY', y: 0.78, px: 40, color: '#efe6cf', weight: '700' },
  ], { bg: '#3f6f4a', border: '#e9c45a', borderW: 8, w: 1024, h: 384 });
  g.add(signMesh(tex, [{ w: 4.0, h: 1.5, pos: [-3, 4.4, D / 2 - 1.06] }], '#3f6f4a'));
  return g;
}

// ── 16. donut_shop (Hole Lotta Donuts, giant donut on the roof) ─────────────────
export function buildDonutShop() {
  const k = new Kit(5601); k.floor = 0;
  const W = 18, D = 14, bw = 10, bd = 7, bh = 3.8, bz = -2.5;
  const wall = '#f0d9c8', pink = '#e58aa8', brown = '#7a4a2a';
  lot(k, W, D, 0, '#66676b');
  k.box(wall, [bw, bh, bd], [0, 0, bz], { base: true, c: 0.05 });
  const F = walls(bw, bd, 0, bz);
  band(k, F.front, 0, 0.6, '#8a5a4a', 0.012);
  wr(k, F.front, [-4.4, 1.6], [0.8, 2.9], '#33404a', 0.02);
  for (let x = -3.0; x < 1.6; x += 1.5) wr(k, F.front, [x - 0.04, x + 0.04], [0.8, 2.9], '#efe6d4', 0.026);
  wr(k, F.front, [-4.2, -2.4], [1.0, 1.6], '#d9a83a', 0.03); // trays of donuts in the window
  wr(k, F.front, [-2.2, -0.4], [1.0, 1.6], '#e58aa8', 0.03);
  wr(k, F.front, [2.4, 4.0], [0, 2.5], '#5a3a2a', 0.02); wr(k, F.front, [2.6, 3.8], [1.2, 2.3], '#3a464c', 0.026);
  // striped awning + flat roof with parapet
  k.at([0, 3.15, bz + bd / 2 + 0.7], [0.35, 0, 0], () => {
    k.box('#efe6d4', [bw - 0.4, 0.06, 1.4], [0, 0, 0]);
    for (let i = 0; i < 12; i += 2) { const x0 = -(bw - 0.4) / 2 + i * (bw - 0.4) / 12; k.rectY(pink, 0.03, [x0, x0 + (bw - 0.4) / 12], [-0.7, 0.7], { off: 0.002 }); }
  });
  k.box(shade(wall, 0.9), [bw + 0.3, 0.6, bd + 0.3], [0, bh, bz], { base: true });
  k.box(brown, [bw + 0.35, 0.12, bd + 0.35], [0, bh + 0.6, bz], { base: true });
  // giant donut on a steel frame (stands on edge, facing the road)
  const R = 2.6, tube = 1.05, cy = bh + 0.6 + 0.5 + R + tube, cz = bz + 0.5;
  for (const s of [1, -1]) beam(k, '#5f6468', [s * 1.2, bh + 0.7, cz - 0.6], [s * 0.6, cy - R - tube + 0.3, cz], 0.18);
  for (const s of [1, -1]) beam(k, '#5f6468', [s * 1.2, bh + 0.7, cz + 0.6], [s * 0.6, cy - R - tube + 0.3, cz], 0.18);
  k.torus('#c98a4a', R, tube, [0, cy, cz], { rs: 8, ts: 18 });
  // frosting: lathe of the FRONT half of the tube cross-section around the donut axis (local Y → world +Z).
  // Profile runs outer edge → front → inner edge so the lathe faces point outward.
  const pts = []; for (let i = 0; i <= 6; i++) { const th = (i / 6) * Math.PI; pts.push([R + (tube + 0.06) * Math.cos(th), (tube + 0.06) * Math.sin(th)]); }
  k.lathe(pink, pts, 18, [0, cy, cz], { rot: [Math.PI / 2, 0, 0] });
  const rr = rng(5602);
  for (let i = 0; i < 22; i++) {
    const a = rr() * Math.PI * 2, b = (rr() - 0.5) * 2.0;
    const rad = R + (tube + 0.08) * Math.sin(b), off = (tube + 0.08) * Math.cos(b);
    k.box(['#f3ead2', '#7fc4d8', '#e2b93b', '#7a9a5a', '#c4372b'][i % 5], [0.28, 0.08, 0.08], [Math.cos(a) * rad, cy + Math.sin(a) * rad, cz + off], { rot: [0, 0, rr() * 3] });
  }
  // benches + planter + newspaper box
  for (const x of [5.6, 7.6]) { k.box(PAL.woodLight, [1.4, 0.06, 0.45], [x, 0.45, 3.2]); for (const s of [1, -1]) k.box('#2a2b2d', [0.06, 0.45, 0.4], [x + s * 0.6, 0, 3.2], { base: true }); }
  k.box('#9a5844', [1.2, 0.5, 0.6], [-6.4, 0, bz + bd / 2 + 0.5], { base: true }); bush(k, -6.4, 0.5, bz + bd / 2 + 0.5, 0.45, PAL.leaf[1], 5603);
  parkedCar(k, -5.5, 4.8, 0, PAL.civ[5]);
  const g = root('donut_shop', 0, { w: W, h: cy + R + tube + 0.2, l: D });
  g.add(k.mesh('body'));
  const tex = textTex('donuts', [
    { text: 'HOLE LOTTA', y: 0.34, px: 110, color: brown },
    { text: 'DONUTS', y: 0.72, px: 130, color: '#c4507a' },
  ], { bg: '#f6ead8', border: pink, borderW: 12, w: 1024, h: 320 });
  g.add(signMesh(tex, [{ w: 5.6, h: 1.75, pos: [-1.0, bh + 0.25, bz + bd / 2 + 0.17] }], '#f6ead8'));
  return g;
}

// ── 17. tube_man (inflatable air dancer; seg_0…seg_3 wiggle) ────────────────────
const TUBE_COLS = [['#d9402e', '#e9c43a'], ['#2f6fbe', '#efece4'], ['#3f9a4a', '#e8873a']];
export function buildTubeMan(variant = 0) {
  const v = vmod(variant, 3);
  const [c1, c2] = TUBE_COLS[v];
  const k = new Kit(5700 + v); k.floor = 0;
  // blower box
  k.box('#3a3b3d', [0.8, 0.55, 0.8], [0, 0, 0], { base: true, c: 0.05 });
  k.cyl('#2a2b2d', 0.3, 0.32, 0.12, [0, 0.55, 0], { base: true, seg: 8 });
  k.cyl('#5f6468', 0.26, 0.26, 0.02, [0, 0.0, 0.41], { axis: 'z', seg: 8 });
  const g = root('tube_man', v, { w: 1.8, h: 6.4, l: 0.9 });
  g.add(k.mesh('body'));
  const segH = 1.4;
  const ring = (kk, y, col, rad) => kk.cyl(col, rad + 0.01, rad + 0.01, 0.12, [0, y, 0], { seg: 8, open: true });
  let parent = g, y0 = 0.67;
  for (let i = 0; i < 4; i++) {
    const rad = 0.3 - i * 0.02;
    const p = pivot(parent, 'seg_' + i, [0, i === 0 ? y0 : segH, 0], (kk) => {
      kk.cyl(i % 2 ? c2 : c1, rad, rad + 0.02, segH + 0.05, [0, 0, 0], { base: true, seg: 8, open: true });
      ring(kk, segH * 0.5, i % 2 ? c1 : c2, rad);
      if (i === 2) for (const s of [1, -1]) {                         // flailing arms
        kk.cyl(c2, 0.11, 0.14, 1.2, [s * 0.75, segH * 0.75, 0], { seg: 6, rot: [0, 0, s * (Math.PI / 2 - 0.5)] });
        kk.cone(c1, 0.12, 0.25, [s * 1.3, segH * 0.75 + 0.33, 0], { seg: 5, rot: [0, 0, -s * 0.6] });
      }
      if (i === 3) {                                                   // face + spiky hair
        kk.cyl(c1, rad, rad, 0.3, [0, segH + 0.1, 0], { seg: 8 });
        for (const s of [1, -1]) { kk.box('#f6f2e8', [0.16, 0.2, 0.03], [s * 0.1, segH * 0.6, rad + 0.01]); kk.box('#1f2022', [0.07, 0.1, 0.03], [s * 0.1, segH * 0.58, rad + 0.02]); }
        kk.box('#1f2022', [0.26, 0.05, 0.03], [0, segH * 0.36, rad + 0.01], { rot: [0, 0, 0] });
        kk.box('#1f2022', [0.06, 0.06, 0.03], [0.14, segH * 0.39, rad + 0.01]); kk.box('#1f2022', [0.06, 0.06, 0.03], [-0.14, segH * 0.39, rad + 0.01]);
        for (let j = 0; j < 7; j++) { const a = (j / 7) * Math.PI * 2; kk.cone(c2, 0.08, 0.5, [Math.cos(a) * 0.15, segH + 0.45, Math.sin(a) * 0.15], { seg: 4, rot: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5] }); }
      }
    }, { seed: 5710 + v * 10 + i });
    parent = p;
  }
  g.userData.style = ['red', 'blue', 'green'][v];
  g.userData.wiggle = { parts: ['seg_0', 'seg_1', 'seg_2', 'seg_3'], note: 'chain: each seg_N is a child of seg_N-1; rotate x/z by small phase-shifted sines' };
  return g;
}
void THREE; void gableRoof; void houseWindow; void stairs; void Kit; void mix;
