// Country pack · A. Maple Heights (suburbs): church, house_2storey, shop_row, yard_props.
import * as THREE from 'three';
import { root } from '../models/kit.js';
import { walls, wr, band, gableRoof, hipRoof, houseWindow, houseDoor, siding, parapet } from '../models/scenery.js';
import { Kit, rng, PAL, mix, shade, vmod, pivot, signMesh, textTex, drawTex, fitText, beam, rod, railing, bush, parkedCar, stairs } from './country-common.js';

/** Paint any 2D polygon [[u, y]...] onto a wall descriptor (from walls()). */
export function paint(k, f, pts, color, off = 0.014) {
  if (f.axis === 'z') return k.flat(color, pts, (u, y) => [u, y, f.at], { facing: [0, 0, f.dir], off });
  return k.flat(color, pts, (u, y) => [f.at, y, u], { facing: [f.dir, 0, 0], off });
}
/** Pointed (gothic) window with a white frame. */
function archWindow(k, f, uc, y0, w, h, glass = '#36424a', frame = '#efe9dc') {
  const a = w * 0.7;
  const P = (ww, hh, yy, aa) => [[uc - ww / 2, yy], [uc + ww / 2, yy], [uc + ww / 2, yy + hh], [uc, yy + hh + aa], [uc - ww / 2, yy + hh]];
  paint(k, f, P(w + 0.24, h + 0.12, y0 - 0.12, a + 0.1), frame, 0.012);
  paint(k, f, P(w, h, y0, a), glass, 0.02);
  wr(k, f, [uc - 0.035, uc + 0.035], [y0, y0 + h + a * 0.8], frame, 0.026);
  wr(k, f, [uc - w / 2, uc + w / 2], [y0 + h * 0.48, y0 + h * 0.48 + 0.06], frame, 0.026);
  // a hint of stained glass in the arch head
  paint(k, f, [[uc - w / 2 + 0.06, y0 + h + 0.04], [uc + w / 2 - 0.06, y0 + h + 0.04], [uc, y0 + h + a - 0.12]], '#7a5a3a', 0.024);
}

// ── 1. church ────────────────────────────────────────────────────────────────
export function buildChurch() {
  const k = new Kit(3101); k.floor = 0;
  const w = 9, d = 16, fh = 0.6, h = 6.0, rh = 4.6;
  const white = '#ece7da', trim = '#f6f2e8', roof = '#4b4d52', stone = '#a49d8e';
  // foundation + nave
  k.box(stone, [w + 0.3, fh, d + 0.3], [0, 0, 0], { base: true, c: 0.04 });
  k.box(white, [w, h, d], [0, fh, 0], { base: true, c: 0.04 });
  const F = walls(w, d);
  for (const f of Object.values(F)) siding(k, f, fh, fh + h, white, 0.3);
  gableRoof(k, { w, d, y: fh + h, rh, ridge: 'z', roof, wall: white, o: 0.5 });
  for (const s of [1, -1]) for (const z of [-5.4, -1.8, 1.8, 5.4]) archWindow(k, s > 0 ? F.left : F.right, z, fh + 1.6, 1.2, 2.6);
  for (const x of [-3.1, 3.1]) archWindow(k, F.front, x, fh + 1.8, 0.9, 2.2);
  archWindow(k, F.back, 0, fh + 2.0, 1.6, 2.4);
  // corner boards
  for (const sx of [1, -1]) for (const sz of [1, -1]) k.box(trim, [0.2, h, 0.2], [sx * (w / 2 - 0.02), fh, sz * (d / 2 - 0.02)], { base: true });
  // tower (projects forward from the front gable)
  const tw = 3.6, tz = d / 2 + 1.0, tH = 11.8;
  k.box(stone, [tw + 0.3, fh, tw + 0.3], [0, 0, tz], { base: true });
  k.box(white, [tw, tH - fh, tw], [0, fh, tz], { base: true, c: 0.03 });
  const T = walls(tw, tw, 0, tz);
  for (const f of [T.front, T.left, T.right]) siding(k, f, fh, tH, white, 0.3);
  for (const sx of [1, -1]) for (const sz of [1, -1]) k.box(trim, [0.18, tH - fh, 0.18], [sx * (tw / 2 - 0.02), fh, tz + sz * (tw / 2 - 0.02)], { base: true });
  // double doors with an arched transom, steps
  paint(k, T.front, [[-1.05, fh], [1.05, fh], [1.05, fh + 2.5], [0, fh + 3.25], [-1.05, fh + 2.5]], trim, 0.012);
  paint(k, T.front, [[-0.9, fh], [0.9, fh], [0.9, fh + 2.45], [0, fh + 3.1], [-0.9, fh + 2.45]], '#6e3f2c', 0.02);
  wr(k, T.front, [-0.03, 0.03], [fh, fh + 2.45], '#4a2a1e', 0.026);
  paint(k, T.front, [[-0.8, fh + 2.55], [0.8, fh + 2.55], [0, fh + 3.0]], '#36424a', 0.026);
  for (const x of [-0.35, 0.35]) wr(k, T.front, [x - 0.04, x + 0.04], [fh + 1.15, fh + 1.35], '#c9a24a', 0.03);
  stairs(k, stone, 0, 0, tz + tw / 2 + 0.95, 2.6, fh, 3, -1, 0.32);
  // round window + clock-ish rondel on the tower
  k.cyl(trim, 0.62, 0.62, 0.06, [0, 7.4, tz + tw / 2 + 0.03], { axis: 'z', seg: 12 });
  k.cyl('#36424a', 0.5, 0.5, 0.06, [0, 7.4, tz + tw / 2 + 0.05], { axis: 'z', seg: 12 });
  for (let i = 0; i < 4; i++) k.box(trim, [0.05, 1.0, 0.02], [0, 7.4, tz + tw / 2 + 0.09], { rot: [0, 0, i * Math.PI / 4] });
  for (const f of [T.left, T.right]) archWindow(k, f, tz, 4.2, 0.7, 1.8);
  // belfry: cornice, open louvred stage, second cornice, octagonal spire
  k.box(trim, [tw + 0.5, 0.35, tw + 0.5], [0, tH, tz], { base: true, c: 0.05 });
  const by = tH + 0.35, bH = 2.7, bw = 3.0;
  k.box(white, [bw, bH, bw], [0, by, tz], { base: true });
  const B = walls(bw, bw, 0, tz);
  for (const f of Object.values(B)) {
    const uc = (f.u[0] + f.u[1]) / 2;
    paint(k, f, [[uc - 0.85, by + 0.3], [uc + 0.85, by + 0.3], [uc + 0.85, by + 1.8], [uc, by + 2.45], [uc - 0.85, by + 1.8]], '#2a2c2e', 0.016);
    for (let i = 0; i < 5; i++) wr(k, f, [uc - 0.8, uc + 0.8], [by + 0.45 + i * 0.32, by + 0.53 + i * 0.32], '#d9d3c4', 0.024);
  }
  for (const sx of [1, -1]) for (const sz of [1, -1]) k.box(trim, [0.22, bH, 0.22], [sx * (bw / 2), by, tz + sz * (bw / 2)], { base: true });
  k.box(trim, [bw + 0.5, 0.3, bw + 0.5], [0, by + bH, tz], { base: true, c: 0.05 });
  // little corner pinnacles + spire
  for (const sx of [1, -1]) for (const sz of [1, -1]) k.cone(trim, 0.16, 0.9, [sx * (bw / 2 + 0.05), by + bH + 0.3, tz + sz * (bw / 2 + 0.05)], { base: true, seg: 4 });
  k.cyl(white, 1.25, 1.35, 0.8, [0, by + bH + 0.3, tz], { base: true, seg: 8 });
  k.cone(roof, 1.32, 8.2, [0, by + bH + 1.1, tz], { base: true, seg: 8, rot: [0, Math.PI / 8, 0] });
  const topY = by + bH + 9.3;
  k.cyl('#7a6a4a', 0.03, 0.03, 1.4, [0, topY - 0.1, tz], { base: true, seg: 4 });
  k.ico('#9a8a5a', 0.1, [0, topY + 0.3, tz]);
  k.box('#5a5040', [1.0, 0.04, 0.04], [0, topY + 0.9, tz]);                         // weathervane arrow
  k.extrude('#5a5040', [[0.5, topY + 0.82], [0.75, topY + 0.9], [0.5, topY + 0.98]], 0.03, { axis: 'z', pos: [0, 0, tz] });
  k.box('#5a5040', [0.03, 0.03, 0.6], [0, topY + 0.65, tz]);
  // small rear vestry wing + chimney
  k.box(white, [4, 3.2, 3.5], [w / 2 - 2.0, fh, -d / 2 - 1.6], { base: true, c: 0.04 });
  gableRoof(k, { w: 4, d: 3.5, y: fh + 3.2, rh: 1.4, ridge: 'x', roof, wall: white, cx: w / 2 - 2.0, cz: -d / 2 - 1.6, o: 0.3 });
  k.box(PAL.brick, [0.7, 2.6, 0.7], [w / 2 - 0.8, fh + 3.4, -d / 2 - 2.4], { base: true });
  // grounds: path, lawn sign, shrubs, bench
  k.top('#bdb7aa', 0.02, [[-1.1, tz + tw / 2 + 1.0], [1.1, tz + tw / 2 + 1.0], [1.1, tz + tw / 2 + 6.5], [-1.1, tz + tw / 2 + 6.5]], { off: 0 });
  for (const x of [-4.2, -2.6, 2.6, 4.2]) bush(k, x, 0, d / 2 + 0.7, 0.6, PAL.bush, 3100 + x * 10);
  const sx = 4.6, sz = tz + tw / 2 + 5.0;
  for (const x of [sx - 1.25, sx + 1.25]) k.box(trim, [0.16, 1.9, 0.16], [x, 0, sz], { base: true });
  k.box(trim, [2.8, 0.18, 0.22], [sx, 1.95, sz], { base: true });
  k.box('#2f3d36', [2.5, 1.2, 0.08], [sx, 1.25, sz - 0.02]);
  k.box(PAL.woodLight, [1.8, 0.06, 0.45], [-4.4, 0.45, d / 2 + 2.2]);
  for (const x of [-5.1, -3.7]) k.box('#3a3836', [0.06, 0.45, 0.4], [x, 0, d / 2 + 2.2], { base: true });
  const g = root('church', 0, { w: w + 1, h: topY + 1.0, l: d + tw + 7 });
  g.add(k.mesh('body'));
  const tex = textTex('church_board', [
    { text: 'MAPLE HEIGHTS', y: 0.2, px: 64, color: '#efe6cf' },
    { text: 'COMMUNITY CHURCH', y: 0.42, px: 48, color: '#efe6cf' },
    { text: 'BAKE SALE SATURDAY', y: 0.68, px: 44, color: '#d9a83a', weight: '700' },
    { text: 'ALL WELCOME · EVEN YOU', y: 0.86, px: 34, color: '#c9d6c9', weight: '700' },
  ], { bg: '#2f3d36', border: '#efe6cf', borderW: 6, h: 256 });
  g.add(signMesh(tex, [{ w: 2.4, h: 1.12, pos: [sx, 1.25, sz + 0.03] }], '#2f3d36'));
  return g;
}

// ── 2. house_2storey ───────────────────────────────────────────────────────────
export function buildHouse2(variant = 0) {
  const v = vmod(variant, 2);
  const k = new Kit(3200 + v); k.floor = 0;
  const r = rng(3210 + v);
  const trim = '#efe9dc';
  let size;
  if (v === 0) {
    // two-storey with a forward double garage wing (gable to the street), brick lower front, portico
    const sid = '#c4b59a', roof = '#47494e', brick = '#9a6450';
    const w = 10, d = 9, h = 5.8, cx = 2.6;
    const gw = 6.6, gd = 7.2, gx = cx - w / 2 - gw / 2 + 0.6, gz = 1.6;
    size = { w: w + gw, h: 9.8, l: d + 7 };
    k.box('#a39e92', [w + 0.1, 0.3, d + 0.1], [cx, 0, 0], { base: true });
    k.box(sid, [w, h, d], [cx, 0.3, 0], { base: true, c: 0.04 });
    const F = walls(w, d, cx, 0);
    for (const f of Object.values(F)) siding(k, f, 3.2, h + 0.3, sid);
    band(k, F.front, 0.3, 3.1, brick, 0.012);                    // brick veneer on the ground floor
    for (let y = 0.5; y < 3.1; y += 0.24) wr(k, F.front, [F.front.u[0] + 0.05, F.front.u[1] - 0.05], [y, y + 0.02], shade(brick, 0.82), 0.016);
    band(k, F.front, 3.05, 3.2, trim, 0.02);
    houseDoor(k, F.front, cx + 1.2, 1.0, '#2f3d55');
    // bay window on the ground floor
    k.box(sid, [2.6, 2.0, 0.7], [cx + 3.4, 0.5, d / 2 + 0.35], { base: true, c: 0.03 });
    k.box(roof, [2.9, 0.25, 0.9], [cx + 3.4, 2.5, d / 2 + 0.4], { base: true, taper: [0.92, 0.4] });
    houseWindow(k, { axis: 'z', at: d / 2 + 0.7, dir: 1 }, cx + 3.4, 0.95, 2.0, 1.3, { lit: r() < 0.3 });
    for (const x of [-2.6, 0.4, 3.4]) houseWindow(k, F.front, cx + x, 3.8, 1.2, 1.3, { shutters: '#3f4a3e', lit: r() < 0.2 });
    for (const f of [F.left, F.right]) { houseWindow(k, f, -1.8, 1.1, 1.1, 1.3); houseWindow(k, f, 1.8, 3.8, 1.1, 1.2); }
    houseWindow(k, F.back, cx, 3.8, 1.6, 1.2); houseWindow(k, F.back, cx - 2, 1.1, 1.6, 1.3);
    hipRoof(k, { w, d, y: h + 0.3, rh: 2.6, roof, cx });
    // portico over the door
    k.box(trim, [2.2, 0.25, 1.4], [cx + 1.2, 2.75, d / 2 + 0.7], { base: true });
    gableRoof(k, { w: 2.2, d: 1.4, y: 3.0, rh: 0.6, ridge: 'z', roof, wall: trim, cx: cx + 1.2, cz: d / 2 + 0.7, o: 0.12, t: 0.1 });
    for (const s of [1, -1]) k.cyl(trim, 0.1, 0.1, 2.45, [cx + 1.2 + s * 0.9, 0.3, d / 2 + 1.25], { base: true, seg: 6 });
    k.box('#bdb7aa', [2.2, 0.3, 1.6], [cx + 1.2, 0, d / 2 + 0.8], { base: true });
    // garage wing
    k.box('#a39e92', [gw + 0.1, 0.25, gd + 0.1], [gx, 0, gz], { base: true });
    k.box(sid, [gw, 2.9, gd], [gx, 0.25, gz], { base: true, c: 0.04 });
    const G = walls(gw, gd, gx, gz);
    for (const f of [G.front, G.right]) siding(k, f, 0.25, 3.15, sid);
    gableRoof(k, { w: gw, d: gd, y: 3.15, rh: 2.0, ridge: 'z', roof: shade(roof, 1.06), wall: sid, cx: gx, cz: gz, o: 0.35 });
    wr(k, G.front, [gx - 2.95, gx + 2.95], [0.25, 2.55], trim, 0.012);
    for (const x of [gx - 1.45, gx + 1.45]) {
      wr(k, G.front, [x - 1.3, x + 1.3], [0.25, 2.4], '#e4dfd2', 0.02);
      for (let i = 1; i < 4; i++) wr(k, G.front, [x - 1.3, x + 1.3], [0.25 + i * 0.54 - 0.02, 0.25 + i * 0.54 + 0.02], '#c9c4b6', 0.026);
      for (let j = 0; j < 4; j++) wr(k, G.front, [x - 1.2 + j * 0.62, x - 0.7 + j * 0.62], [1.95, 2.25], '#36424a', 0.03);
    }
    houseWindow(k, { axis: 'z', at: gz + gd / 2, dir: 1 }, gx, 3.6, 0.9, 0.7);  // gable vent window
    k.cyl('#3a3b3d', 0.06, 0.06, 0.3, [gx, 2.75, gz + gd / 2 + 0.12], { axis: 'z', seg: 5 });
    // driveway, path, lamp post, shrubs, trash cans
    k.top('#b0aba0', 0.02, [[gx - 3.0, gz + gd / 2], [gx + 3.0, gz + gd / 2], [gx + 3.0, d / 2 + 6.5], [gx - 3.0, d / 2 + 6.5]], { off: 0 });
    k.blob('#8f8a7f', 0.7, [gx + 1.2, 0.026, gz + gd / 2 + 1.4], { seg: 7, seed: 3, off: 0 });
    k.top('#bdb7aa', 0.02, [[cx + 0.6, d / 2 + 1.6], [cx + 1.8, d / 2 + 1.6], [cx + 1.8, d / 2 + 6.5], [cx + 0.6, d / 2 + 6.5]], { off: 0 });
    k.cyl('#2a2b2d', 0.05, 0.06, 1.8, [cx + 2.4, 0, d / 2 + 5.2], { base: true, seg: 5 });
    k.box(PAL.lampWarm, [0.24, 0.32, 0.24], [cx + 2.4, 1.95, d / 2 + 5.2], { c: 0.03 });
    k.box('#2a2b2d', [0.32, 0.06, 0.32], [cx + 2.4, 2.12, d / 2 + 5.2]);
    for (const x of [cx - 2.8, cx - 1.4, cx + 4.6]) bush(k, x, 0, d / 2 + 0.6, 0.55, PAL.bush, 3220 + x * 7);
    for (const z of [0.0, 0.8]) { k.box(z ? '#3e5a7a' : '#4f6b55', [0.6, 1.0, 0.65], [gx - gw / 2 - 0.5, 0, gz + z - 1.6], { base: true, c: 0.05 }); }
  } else {
    // two-storey farmhouse-style with a full-width front porch, twin dormers and a porch swing
    const sid = '#a9b8b0', roof = '#7a4e3c';
    const w = 11, d = 9, h = 5.8;
    size = { w: w + 1.2, h: 10.4, l: d + 6 };
    k.box('#a39e92', [w + 0.1, 0.45, d + 0.1], [0, 0, 0], { base: true });
    k.box(sid, [w, h, d], [0, 0.45, 0], { base: true, c: 0.04 });
    const F = walls(w, d);
    for (const f of Object.values(F)) siding(k, f, 0.45, h + 0.45, sid, 0.28);
    gableRoof(k, { w, d, y: h + 0.45, rh: 3.2, ridge: 'x', roof, wall: sid, o: 0.5 });
    houseDoor(k, F.front, 0, 1.05, '#7a2e22');
    for (const x of [-3.4, -1.7, 1.7, 3.4]) houseWindow(k, F.front, x, 1.3, 1.0, 1.6, { shutters: '#3a4a52', lit: r() < 0.2 });
    for (const x of [-3.4, 0, 3.4]) houseWindow(k, F.front, x, 4.0, 1.0, 1.4, { shutters: '#3a4a52', lit: r() < 0.2 });
    for (const f of [F.left, F.right]) { houseWindow(k, f, -2, 1.3, 1.0, 1.5); houseWindow(k, f, 2, 4.0, 1.0, 1.3); }
    houseWindow(k, F.back, -2.5, 1.3, 1.6, 1.4); houseWindow(k, F.back, 2.5, 4.0, 1.0, 1.3);
    // dormers on the front slope
    const slope = 3.2 / (d / 2);
    for (const x of [-2.6, 2.6]) {
      const dz = d / 2 - 1.6, dy = h + 0.45 + (d / 2 - dz) * slope * 0.0 + 0.9;
      k.box(sid, [1.6, 1.5, 1.8], [x, dy - 0.2, dz], { base: true });
      gableRoof(k, { w: 1.6, d: 1.8, y: dy + 1.3, rh: 0.8, ridge: 'z', roof, wall: sid, cx: x, cz: dz, o: 0.18, t: 0.12 });
      houseWindow(k, { axis: 'z', at: dz + 0.9, dir: 1 }, x, dy, 0.8, 0.9);
    }
    k.box(PAL.brick, [0.9, 3.6, 0.9], [w / 2 - 1.0, h + 1.5, -1.5], { base: true });
    k.box('#5a4a3c', [1.05, 0.15, 1.05], [w / 2 - 1.0, h + 5.1, -1.5], { base: true });
    // porch: deck, posts, rail, hip roof, swing, ferns, steps
    const pz = d / 2 + 1.5;
    k.box('#9a9284', [w + 1.0, 0.5, 3.0], [0, 0, pz], { base: true });
    k.box('#b8b0a0', [w + 0.9, 0.06, 2.9], [0, 0.5, pz], { base: true });
    for (let i = 0; i <= 5; i++) { const x = -w / 2 + i * w / 5; k.box(trim, [0.18, 2.55, 0.18], [x, 0.5, pz + 1.3], { base: true }); }
    k.box(trim, [w + 0.4, 0.22, 0.2], [0, 3.0, pz + 1.3]);
    hipRoof(k, { w: w + 0.6, d: 3.0, y: 3.15, rh: 0.7, roof, cz: pz, o: 0.25 });
    for (const [x0, x1] of [[-w / 2, -0.9], [0.9, w / 2]]) railing(k, trim, x0, x1, pz + 1.3, 0.5, 0.85, 0.3, { t: 0.05 });
    stairs(k, '#9a9284', 0, 0, pz + 1.5 + 0.9, 1.8, 0.5, 3, -1, 0.3);
    // porch swing hanging from the ceiling (static)
    k.box(PAL.woodLight, [1.5, 0.08, 0.5], [-3.2, 1.0, pz - 0.6]);
    k.box(PAL.woodLight, [1.5, 0.45, 0.06], [-3.2, 1.25, pz - 0.85], { rot: [-0.15, 0, 0] });
    for (const x of [-3.9, -2.5]) rod(k, '#3a3836', [x, 1.0, pz - 0.6], [x, 3.0, pz - 0.6], 0.012, 3);
    for (const x of [-1.8, 1.8]) { k.cyl('#7a6a5a', 0.16, 0.12, 0.25, [x, 2.45, pz + 1.15], { seg: 6 }); k.ico('#5d7b41', 0.3, [x, 2.2, pz + 1.15], { jitter: 0.3, seed: 3230 + x, scale: [1, 0.7, 1] }); }
    k.top('#bdb7aa', 0.02, [[-0.7, pz + 2.4], [0.7, pz + 2.4], [0.7, pz + 4.6], [-0.7, pz + 4.6]], { off: 0 });
    for (const x of [-4.5, 4.5]) bush(k, x, 0, pz + 1.9, 0.5, PAL.leaf[2], 3240 + x);
    // side picket fence stub + mailbox post
    for (let i = 0; i < 9; i++) k.box('#efece4', [0.08, 0.9, 0.025], [w / 2 + 0.6, 0, -3 + i * 0.4], { base: true });
    k.box('#efece4', [0.04, 0.06, 3.4], [w / 2 + 0.6, 0.65, -1.4]);
  }
  const g = root('house_2storey', v, size);
  g.add(k.mesh('body'));
  g.userData.style = v ? 'porch' : 'garage';
  return g;
}

// ── 3. shop_row ────────────────────────────────────────────────────────────────
export function buildShopRow() {
  const k = new Kit(3301); k.floor = 0;
  const W = 24, D = 10, H = 6.0;
  const shops = [
    { x: -8, wall: '#9a5c48', awn: ['#3f6f6b', '#e6dfcc'], door: '#2f3d36' },
    { x: 0, wall: '#d4c4a2', awn: ['#7a3b32', '#e6dfcc'], door: '#5a3a2a' },
    { x: 8, wall: '#b9c2b4', awn: ['#c08a3e', '#ece6d4'], door: '#3e4a5a' },
  ];
  // sidewalk + building block
  k.box('#b6b1a6', [W + 2, 0.15, 4.0], [0, 0, D / 2 + 2.0], { base: true });
  k.box('#8e8a80', [W + 2, 0.16, 0.25], [0, 0, D / 2 + 4.0], { base: true });
  for (const s of shops) {
    k.box(s.wall, [8, H, D], [s.x, 0.15, 0], { base: true, c: 0.03 });
    const F = walls(8, D, s.x, 0);
    if (s.wall === '#9a5c48') for (let y = 0.4; y < H; y += 0.26) wr(k, F.front, [s.x - 3.95, s.x + 3.95], [y, y + 0.025], shade(s.wall, 0.82), 0.012);
    // shopfront: bulkhead, glass, door, transom, sign band
    wr(k, F.front, [s.x - 3.6, s.x + 3.6], [0.15, 3.35], '#4a4038', 0.012);
    wr(k, F.front, [s.x - 3.4, s.x + 0.6], [0.75, 3.1], '#33404a', 0.02);
    wr(k, F.front, [s.x + 2.0, s.x + 3.4], [0.75, 3.1], '#33404a', 0.02);
    wr(k, F.front, [s.x + 0.85, s.x + 1.85], [0.15, 2.7], s.door, 0.02);
    wr(k, F.front, [s.x + 1.0, s.x + 1.7], [1.4, 2.5], '#3a464c', 0.026);
    wr(k, F.front, [s.x - 3.2, s.x - 1.8], [1.0, 1.9], ['#d9a83a', '#c96f4a', '#e8b8c8'][shops.indexOf(s)], 0.026); // window display
    wr(k, F.front, [s.x - 1.4, s.x + 0.3], [0.8, 1.4], '#8a6a4a', 0.026);
    // fabric awning (striped) — sloped
    k.at([s.x, 3.15, D / 2 + 0.75], [0.36, 0, 0], () => {
      k.box(s.awn[1], [7.2, 0.06, 1.6], [0, 0, 0]);
      for (let i = 0; i < 10; i += 2) { const x0 = -3.6 + i * 0.72; k.rectY(s.awn[0], 0.03, [x0, x0 + 0.72], [-0.8, 0.8], { off: 0.002 }); k.rectZ(s.awn[0], 0.8, [x0, x0 + 0.72], [-0.03, 0.03], 1, { off: 0.002 }); }
    });
    k.box(s.awn[0], [7.2, 0.28, 0.04], [s.x, 2.75, D / 2 + 1.5]);
    // upper storey windows
    for (const x of [-2.4, 0, 2.4]) houseWindow(k, F.front, s.x + x, 4.45, 0.9, 1.0, { trim: '#e9e2cf', lit: false });
    wr(k, F.front, [s.x - 3.5, s.x + 3.5], [3.42, 4.12], '#3a3632', 0.012); // fascia backing
    // parapet with stepped centre
    k.box(shade(s.wall, 0.92), [8, 0.6, 0.35], [s.x, H + 0.15, D / 2 - 0.17], { base: true });
    k.box(shade(s.wall, 0.92), [3, 0.5, 0.35], [s.x, H + 0.75, D / 2 - 0.17], { base: true });
    k.box('#d8d0bc', [8.1, 0.12, 0.42], [s.x, H + 0.15, D / 2 - 0.12], { base: true });
    // side + back grime
    for (const f of [F.back]) band(k, f, 0.15, 0.8, mix(s.wall, PAL.dirt, 0.4), 0.012);
  }
  k.box('#8a857c', [W, 0.25, D], [0, H + 0.15, 0], { base: true });
  roofUnitsSimple(k, [[-8, -2], [6, -1]], H + 0.4);
  // pilasters between shops
  for (const x of [-12, -4, 4, 12]) k.box('#cfc6b2', [0.4, H + 0.2, 0.3], [x, 0.15, D / 2 + 0.05], { base: true });
  // barber pole (Maple Cuts), bench, planters, newspaper box, bike rack
  k.cyl('#e9e2cf', 0.12, 0.12, 1.2, [-11.2, 1.2, D / 2 + 0.3], { base: true, seg: 8 });
  for (let i = 0; i < 4; i++) k.cyl(i % 2 ? '#2f4f7a' : '#b8392e', 0.125, 0.125, 0.12, [-11.2, 1.35 + i * 0.27, D / 2 + 0.3], { base: true, seg: 8, rot: [0.25, 0, 0] });
  k.ico('#e9e2cf', 0.14, [-11.2, 2.45, D / 2 + 0.3]);
  k.box(PAL.woodLight, [1.6, 0.06, 0.45], [-4.0, 0.62, D / 2 + 3.0]);
  for (const x of [-4.7, -3.3]) k.box('#2a2b2d', [0.06, 0.47, 0.4], [-4 + (x + 4), 0.15, D / 2 + 3.0], { base: true });
  for (const x of [-12.6, 12.6]) { k.box('#9a5844', [0.9, 0.55, 0.9], [x, 0.15, D / 2 + 3.2], { base: true }); bush(k, x, 0.7, D / 2 + 3.2, 0.45, PAL.leaf[0], 3310 + x); }
  k.box('#6f8fb0', [0.5, 1.0, 0.45], [5.0, 0.15, D / 2 + 3.4], { base: true, c: 0.03 });
  for (let i = 0; i < 3; i++) k.torus('#3a3b3d', 0.35, 0.03, [9 + i * 0.6, 0.5, D / 2 + 3.3], { rot: [0, Math.PI / 2, 0], rs: 3, ts: 8, arc: Math.PI });
  // ice-cream cone sculpture on the last shop's parapet
  k.cone('#c9944a', 0.35, 1.0, [8, H + 1.8, D / 2 - 0.2], { seg: 7, rot: [Math.PI, 0, 0] });
  k.ico('#f0c8d0', 0.42, [8, H + 2.4, D / 2 - 0.2], { detail: 1 });
  const g = root('shop_row', 0, { w: W + 2, h: H + 3.0, l: D + 4.2 });
  g.add(k.mesh('body'));
  // one texture, three fascia panels (one draw call)
  const tex = drawTex('shoprow', 1536, 128, '#2a2a28', (ctx, Wc, Hc) => {
    const cells = [
      { bg: '#2f3d36', fg: '#efe6cf', acc: '#d9a83a', a: 'MAPLE CUTS', b: 'BARBER · WALK-INS' },
      { bg: '#efe6cf', fg: '#5a2e24', acc: '#7a3b32', a: 'PAGE & PEAR', b: 'USED BOOKS · TEA' },
      { bg: '#f0d9c8', fg: '#7a3f2a', acc: '#c08a3e', a: 'SECOND SCOOP', b: 'ICE CREAM · 2ND CONE ½ OFF' },
    ];
    cells.forEach((c, i) => {
      const x0 = i * 512;
      ctx.fillStyle = c.bg; ctx.fillRect(x0 + 4, 4, 504, Hc - 8);
      ctx.strokeStyle = c.acc; ctx.lineWidth = 5; ctx.strokeRect(x0 + 12, 12, 488, Hc - 24);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = c.fg;
      fitText(ctx, c.a, x0 + 256, Hc * 0.42, 440, 56);
      ctx.fillStyle = c.acc; fitText(ctx, c.b, x0 + 256, Hc * 0.78, 400, 20, '700');
    });
  });
  g.add(signMesh(tex, shops.map((s, i) => ({ w: 6.6, h: 0.62, pos: [s.x, 3.77, D / 2 + 0.04], rect: [i / 3, 0, (i + 1) / 3, 1] })), '#2f3d36'));
  return g;
}
function roofUnitsSimple(k, spots, y) {
  for (const [x, z] of spots) {
    k.box('#a9a79e', [1.8, 0.9, 1.4], [x, y, z], { base: true, c: 0.06 });
    k.box('#5f6064', [1.1, 0.05, 0.8], [x, y + 0.9, z], { base: true });
  }
}

// ── 4. yard_props (back-garden detour clutter, smashable pivots) ───────────────
function gnome(parent, name, pos, rotY, hat = '#b8392e', coat = '#3f6f8a', seed = 1) {
  const p = pivot(parent, name, pos, (k) => {
    k.at([0, 0, 0], [0, rotY, 0], () => {
      k.box('#5a3a2a', [0.22, 0.08, 0.14], [0, 0, 0.02], { base: true, c: 0.02 });
      k.cyl(coat, 0.1, 0.17, 0.3, [0, 0.08, 0], { base: true, seg: 6, open: true });
      k.box('#3a2a20', [0.3, 0.04, 0.24], [0, 0.22, 0], { base: true });
      k.ico('#efc8a2', 0.1, [0, 0.47, 0.01], { detail: 0 });
      k.cone('#efece4', 0.11, 0.2, [0, 0.36, 0.06], { seg: 6, rot: [Math.PI + 0.25, 0, 0] });
      k.cone(hat, 0.12, 0.34, [0, 0.52, -0.02], { base: true, seg: 6, rot: [-0.25, 0, 0] });
      for (const s of [1, -1]) k.box(coat, [0.06, 0.18, 0.06], [s * 0.15, 0.25, 0.04], { rot: [0.6, 0, s * 0.4] });
    });
  }, { seed });
  return p;
}
export function buildYardProps(variant = 0) {
  const v = vmod(variant, 4);
  const g0 = new THREE.Group();
  const k = new Kit(3400 + v); k.floor = 0;
  const r = rng(3410 + v);
  const smash = [];
  let size;
  const lawn = (w, l, cx = 0, cz = 0) => k.blob('#6f8f4c', Math.max(w, l) / 2, [cx, 0.012, cz], { seg: 12, seed: 3420 + v, sx: w / Math.max(w, l), sz: l / Math.max(w, l), wobble: 0.15, off: 0 });
  if (v === 0) { // garden gnome group around a toadstool and a little wishing well
    size = { w: 4.6, h: 1.4, l: 3.6 };
    lawn(4.6, 3.6);
    for (let i = 0; i < 4; i++) k.blob('#a8a294', 0.28, [-1.7 + i * 0.75, 0.03, 1.2 - i * 0.2], { seg: 6, seed: 3421 + i, off: 0 });
    // toadstool + wishing well
    k.cyl('#efe6d4', 0.08, 0.1, 0.3, [0.5, 0, -0.2], { base: true, seg: 6 });
    k.lathe('#b8392e', [[0.28, 0], [0.22, 0.1], [0.0, 0.16]], 8, [0.5, 0.28, -0.2]);
    for (let i = 0; i < 4; i++) k.ico('#efe6d4', 0.035, [0.5 + Math.cos(i * 1.7) * 0.15, 0.4, -0.2 + Math.sin(i * 1.7) * 0.15]);
    k.cyl('#9a948a', 0.42, 0.45, 0.5, [-1.2, 0, -0.9], { base: true, seg: 8 });
    k.cyl('#3c4a55', 0.36, 0.36, 0.02, [-1.2, 0.48, -0.9], { seg: 8 });
    for (const s of [1, -1]) k.box(PAL.woodDark, [0.07, 0.8, 0.07], [-1.2 + s * 0.4, 0.5, -0.9], { base: true });
    k.extrude('#8a4a3a', [[-0.6, 1.25], [0, 1.6], [0.6, 1.25], [0.6, 1.32], [0, 1.68], [-0.6, 1.32]], 0.7, { axis: 'z', pos: [-1.2, 0, -0.9] });
    const cols = [['#b8392e', '#3f6f8a'], ['#3f7a4a', '#b8392e'], ['#b8392e', '#7a5a3a'], ['#d9a83a', '#4f6b55'], ['#2f4f7a', '#b8392e']];
    const spots = [[-0.4, 0.5, 0.3], [0.9, 0.6, -0.4], [1.6, -0.3, -0.9], [0.0, -0.8, 0.5], [1.9, 0.9, -0.2]];
    spots.forEach(([x, z, ry], i) => { gnome(g0, 'gnome_' + i, [x, 0, z], ry, cols[i][0], cols[i][1], 3430 + i); smash.push('gnome_' + i); });
  } else if (v === 1) { // inflatable paddling pool, beach ball, duck float, sun-lounging gnome
    size = { w: 4.4, h: 0.8, l: 4.0 };
    lawn(4.4, 4.0);
    pivot(g0, 'pool', [0, 0, 0], (kp) => {
      for (let i = 0; i < 3; i++) kp.torus(['#5aa0c8', '#f0e8d8', '#5aa0c8'][i], 1.25, 0.12, [0, 0.12 + i * 0.2, 0], { rot: [Math.PI / 2, 0, 0], rs: 5, ts: 16 });
      kp.cyl('#5aa0c8', 1.3, 1.3, 0.02, [0, 0.01, 0], { seg: 16 });
      kp.cyl('#7fc0dc', 1.18, 1.18, 0.02, [0, 0.4, 0], { seg: 16 });
      kp.cyl('#9fd2e4', 0.5, 0.5, 0.02, [0.3, 0.41, -0.2], { seg: 8 });
    }, { seed: 3441 });
    pivot(g0, 'duck', [0.4, 0.42, 0.35], (kp) => {
      kp.torus('#e9c43a', 0.22, 0.09, [0, 0.0, 0], { rot: [Math.PI / 2, 0, 0], rs: 4, ts: 10 });
      kp.ico('#e9c43a', 0.12, [0, 0.16, 0.24]);
      kp.cone('#d9702a', 0.05, 0.1, [0, 0.16, 0.38], { seg: 4, rot: [Math.PI / 2, 0, 0] });
    }, { seed: 3442 });
    pivot(g0, 'ball', [1.65, 0.28, 1.2], (kp) => {
      const c = ['#e6dfcc', '#c4372b', '#2f6aa0', '#e9c43a'];
      kp.geo(new THREE.IcosahedronGeometry(0.28, 1), (cx, cy, cz) => c[Math.floor(((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * 6) % 4]);
    }, { seed: 3443 });
    // hose snaking in + a little side table with a lemonade jug
    for (let i = 0; i < 6; i++) k.cyl('#3f7a4a', 0.03, 0.03, 0.6, [-1.6 + i * 0.12, 0.03, 1.6 - i * 0.5], { axis: 'z', seg: 4, rot: [0, Math.sin(i) * 0.6, 0] });
    gnome(g0, 'gnome_0', [-1.7, 0, -1.1], 0.6, '#b8392e', '#3f6f8a', 3444);
    smash.push('pool', 'duck', 'ball', 'gnome_0');
  } else if (v === 2) { // picket-fence section with a gate (panels + gate are smashable)
    size = { w: 8.4, h: 1.25, l: 1.4 };
    lawn(8.4, 1.4);
    const panel = (kp, len) => {
      kp.box('#efece4', [len, 0.07, 0.045], [len / 2, 0.3, -0.04]);
      kp.box('#efece4', [len, 0.07, 0.045], [len / 2, 0.8, -0.04]);
      const n = Math.round(len / 0.155);
      for (let i = 0; i < n; i++) {
        const x = 0.08 + i * (len - 0.16) / (n - 1);
        kp.box(i % 7 === 3 ? '#dcd6c8' : '#efece4', [0.085, 0.86, 0.024], [x, 0.12, 0], { base: true });
        kp.cone('#efece4', 0.06, 0.1, [x, 1.03, 0], { seg: 4, rot: [0, Math.PI / 4, 0] });
      }
    };
    // posts (static) + 3 panels + gate
    for (const x of [-4.1, -2.1, -0.6, 0.6, 2.1, 4.1]) k.box('#e6e2d8', [0.12, 1.2, 0.12], [x, 0, 0], { base: true });
    for (const x of [-0.6, 0.6]) k.cone('#e6e2d8', 0.1, 0.16, [x, 1.28, 0], { seg: 4, rot: [0, Math.PI / 4, 0] });
    pivot(g0, 'picket_0', [-4.05, 0, 0.0], (kp) => panel(kp, 1.9), { seed: 3451 });
    pivot(g0, 'picket_1', [-2.05, 0, 0.0], (kp) => panel(kp, 1.4), { seed: 3452 });
    pivot(g0, 'picket_2', [2.15, 0, 0.0], (kp) => panel(kp, 1.9), { seed: 3453 });
    // gate hinged at x = -0.55; leaf extends +X; rotation.y < 0 swings it toward +Z
    pivot(g0, 'gate', [-0.54, 0, 0.04], (kp) => {
      panel(kp, 1.08);
      beam(kp, '#e6e2d8', [0.05, 0.3, -0.07], [1.0, 0.8, -0.07], 0.06);
      kp.box('#3a3836', [0.04, 0.12, 0.06], [1.0, 0.62, 0.02]);
    }, { seed: 3454 });
    k.box('#3a3836', [0.06, 0.06, 0.08], [0.55, 0.62, 0.06]);
    // flower bed along the fence
    k.top('#5a4a3c', 0.015, [[-4.1, -0.25], [4.1, -0.25], [4.1, -0.6], [-4.1, -0.6]], { off: 0 });
    for (let i = 0; i < 9; i++) if (Math.abs(-3.8 + i * 0.95) > 0.8) k.ico(['#c96f4a', '#d9a83a', '#b85c6a'][i % 3], 0.13, [-3.8 + i * 0.95, 0.18, -0.42], { seed: 3460 + i });
    gnome(g0, 'gnome_0', [1.1, 0, 0.45], 0.2, '#3f7a4a', '#b8392e', 3455);
    smash.push('picket_0', 'picket_1', 'picket_2', 'gate', 'gnome_0');
  } else { // barbecue + lawn chairs + cooler
    size = { w: 4.6, h: 1.2, l: 3.6 };
    lawn(4.6, 3.6);
    k.top('#a8a294', 0.02, [[-1.4, -1.4], [1.0, -1.4], [1.0, 0.4], [-1.4, 0.4]], { off: 0 }); // patio slabs
    for (let i = 0; i < 3; i++) k.rectY('#8f897c', 0.026, [-1.4 + i * 0.8 - 0.01, -1.4 + i * 0.8 + 0.01], [-1.4, 0.4], { off: 0.002 });
    pivot(g0, 'bbq', [-0.6, 0, -0.6], (kp) => {
      for (let i = 0; i < 3; i++) { const a = i * 2.094; rod(kp, '#3a3b3d', [Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3], [Math.cos(a) * 0.15, 0.6, Math.sin(a) * 0.15], 0.02, 4); }
      kp.lathe('#2a2b2d', [[0.05, 0.55], [0.3, 0.62], [0.34, 0.8]], 10, [0, 0, 0]);
      kp.lathe('#2a2b2d', [[0.34, 0.82], [0.3, 0.98], [0.15, 1.06], [0.0, 1.08]], 10, [0, 0, 0], { rot: [-0.9, 0, 0] });
      kp.cyl('#8a8f92', 0.33, 0.33, 0.02, [0, 0.8, 0], { seg: 10 });
      for (let i = 0; i < 3; i++) kp.box(i === 1 ? '#7a3a2a' : '#8a4a32', [0.1, 0.04, 0.2], [-0.12 + i * 0.12, 0.83, 0.02], { c: 0.01 });
      kp.cyl('#8a8f92', 0.15, 0.15, 0.02, [0, 0.15, 0], { seg: 8 });
    }, { seed: 3471 });
    const chair = (name, x, z, ry, col) => pivot(g0, name, [x, 0, z], (kp) => {
      kp.at([0, 0, 0], [0, ry, 0], () => {
        for (const s of [1, -1]) {
          rod(kp, '#c9c9c4', [s * 0.27, 0, 0.3], [s * 0.27, 0.45, -0.3], 0.018, 4);
          rod(kp, '#c9c9c4', [s * 0.27, 0, -0.3], [s * 0.27, 0.9, -0.42], 0.018, 4);
          kp.box('#c9c9c4', [0.04, 0.04, 0.5], [s * 0.27, 0.58, 0.02]);
        }
        for (let i = 0; i < 5; i++) kp.box(i % 2 ? '#efe6d4' : col, [0.52, 0.02, 0.1], [0, 0.4, 0.22 - i * 0.11]);
        for (let i = 0; i < 5; i++) kp.box(i % 2 ? '#efe6d4' : col, [0.52, 0.1, 0.02], [0, 0.48 + i * 0.09, -0.35 - i * 0.012], { rot: [-0.15, 0, 0] });
      });
    }, { seed: 3472 + x * 10 });
    chair('chair_0', 0.8, 0.3, -0.5, '#3f8f8a'); chair('chair_1', 1.6, -0.4, -1.1, '#d9a83a');
    pivot(g0, 'cooler', [0.2, 0, 1.0], (kp) => {
      kp.box('#2f6aa0', [0.6, 0.38, 0.4], [0, 0, 0], { base: true, c: 0.04 });
      kp.box('#efece4', [0.62, 0.08, 0.42], [0, 0.38, 0], { base: true, c: 0.02 });
      kp.box('#efece4', [0.4, 0.04, 0.04], [0, 0.5, 0], { base: true });
    }, { seed: 3473 });
    gnome(g0, 'gnome_0', [-1.6, 0, 0.6], 0.5, '#b8392e', '#7a5a3a', 3474);
    smash.push('bbq', 'chair_0', 'chair_1', 'cooler', 'gnome_0');
  }
  const g = root('yard_props', v, size);
  g.add(k.mesh('body'));
  for (const c of [...g0.children]) g.add(c);
  g.userData.style = ['gnomes', 'pool', 'fence', 'bbq'][v];
  g.userData.smashable = smash;
  return g;
}
void parkedCar; void parapet; void Kit;
