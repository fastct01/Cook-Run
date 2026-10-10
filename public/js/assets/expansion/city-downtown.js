// ─────────────────────────────────────────────────────────────────────────────
// City Areas expansion — C. Downtown additions (art agent: city).
//   skyscraper (3), cinema, police_station, hotel, fire_station
// Facades face local +Z (the road). Origin = ground centre of the footprint.
// ─────────────────────────────────────────────────────────────────────────────
import {
  THREE, Kit, root, rng, empty, PAL, mix, shade, walls, wr, windowGrid, band, parapet, C, vwrap, TAU,
  fp, fbox, wpoly, archPts, beam, rod, railing, ladder, patches, streaks, rollDoor, steelWindow, fireEscape,
  acUnit, roofTank, vent, addPanel, multiPanel, atlasUV, towerFace, paintedWallSign, neonSign, textSign, signTexture, fitText, bulbs, FONTS, lampMaterial,
} from './city-kit.js';

// ═════════════════════════════════════════════════════════════════════════════
// C9. Skyscraper — v0 deco setback tower (74 m), v1 slanted glass slab (60 m), v2 bronze tower + lattice crown (62 m)
// ═════════════════════════════════════════════════════════════════════════════
export function buildSkyscraper(variant = 0) {
  const v = vwrap(variant, 3);
  const k = new Kit(4000 + v); k.floor = 0;
  let g;
  if (v === 0) {
    g = root('skyscraper', v, { w: 26, h: 75, l: 26 }, { style: 'deco' });
    const stone = '#cbbfa5', gold = '#c2a055', glass = '#2f3a42';
    // podium
    k.box(shade(stone, 0.92), [26, 12, 24], [0, 0, 0], { base: true });
    const P = walls(26, 24);
    for (const f of Object.values(P)) {
      towerFace(k, f, 4.5, 11.4, { seed: 4001 + f.at, pier: 3.2, glass, pierColor: shade(stone, 0.92), lit: 0.3, fh: 3.6, spandrel: false });
      band(k, f, 0, 0.8, shade(stone, 0.7), 0.012);
      band(k, f, 11.4, 12, gold, 0.02);
    }
    wpoly(k, P.front, archPts(-3.4, 3.4, 0, 6.5, 3.0), gold, 0.03);
    wpoly(k, P.front, archPts(-2.9, 2.9, 0, 6.5, 2.6), '#3a3020', 0.035);
    for (let i = 0; i < 4; i++) wr(k, P.front, [-2.6 + i * 1.35, -1.6 + i * 1.35], [0, 3.2], i % 3 ? '#2a2620' : C.lit, 0.04);
    for (const x of [-9, -6, 6, 9]) wr(k, P.front, [x - 1.2, x + 1.2], [0.6, 3.6], C.lit, 0.03);
    k.box(gold, [8, 0.3, 2.4], [0, 4.0, 13.2], { base: true });
    // shaft tiers
    const tiers = [[20, 20, 12, 42], [16, 16, 42, 54], [11, 11, 54, 62]];
    tiers.forEach(([w, d, y0, y1], i) => {
      k.box(stone, [w, y1 - y0, d], [0, y0, 0], { base: true });
      const T = walls(w, d);
      for (const f of Object.values(T)) towerFace(k, f, y0, y1, { seed: 4010 + i * 7 + f.at, pier: 2.4, glass, pierColor: mix(stone, '#fff4dc', 0.25), pierW: 0.22, lit: 0.1, spandrel: '#6a5f50' });
      k.box(gold, [w + 0.3, 0.35, d + 0.3], [0, y1 - 0.35, 0], { base: true });
      parapet(k, w, d, y1, 0.9, 0.3, shade(stone, 0.95));
    });
    // stepped crown with fins + spire + aviation light
    [[9, 3], [7, 3], [5, 3]].forEach(([s, h], i) => {
      const y = 62 + i * 3;
      k.box(i % 2 ? gold : stone, [s, h, s], [0, y, 0], { base: true });
      for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) k.box(gold, [0.4, h + 1.2, 0.4], [a * s / 2, y, b * s / 2], { base: true });
      for (const f of Object.values(walls(s, s))) wr(k, f, [-s / 2 + 0.8, s / 2 - 0.8], [y + 0.6, y + h - 0.6], i === 2 ? C.lit : '#3a3020', 0.02);
    });
    k.cone(gold, 1.3, 7, [0, 71, 0], { base: true, seg: 8 });
    k.cyl('#5d6367', 0.08, 0.12, 4, [0, 77, 0], { base: true, seg: 5 });
    k.ico('#c43a2e', 0.18, [0, 81.1, 0]);
    acUnit(k, 6, 42, 6, 1.2); acUnit(k, -6, 42, -5, 1.2); roofTank(k, 4.5, 54, -4.5, 1.2, 2, 1.6);
    g.userData.size.h = 81.3;
  } else if (v === 1) {
    g = root('skyscraper', v, { w: 26, h: 66, l: 22 }, { style: 'glass slab' });
    const W = 24, D = 18, Hf = 52, Hb = 60, gl = '#4a6b70', mul = '#8a9a9c';
    // lobby + slab with a sloped roof (low at the road, high at the back)
    k.box('#33404a', [W - 2, 6, D - 2], [0, 0, 0], { base: true });
    for (let x = -W / 2 + 1; x <= W / 2 - 1; x += 3.6) k.box('#c9c5b8', [0.6, 6, 0.6], [x, 0, D / 2 - 0.6], { base: true });
    k.box('#d9d3c4', [10, 0.35, 3.2], [0, 4.6, D / 2 + 0.6], { base: true });
    k.extrude((cx, cy, cz, nx, ny) => (ny > 0.4 ? '#5e6a6e' : ny < -0.5 ? '#3a4448' : gl), [[-D / 2, 6], [D / 2, 6], [D / 2, Hf], [-D / 2, Hb]], W, { axis: 'x' });
    const T = walls(W, D);
    const r = rng(4101);
    for (const f of Object.values(T)) {
      const L = f.u[1] - f.u[0], nV = Math.round(L / 1.6), top = (u) => (f.axis === 'z' ? (f.dir > 0 ? Hf : Hb) : Hf + (Hb - Hf) * ((D / 2 - u) / D));
      for (let i = 1; i < nV; i++) { const u = f.u[0] + (i / nV) * L; wr(k, f, [u - 0.06, u + 0.06], [6, top(u)], mul, 0.016); }
      for (let y = 9.6; y < Hf; y += 3.6) wr(k, f, [f.u[0], f.u[1]], [y - 0.12, y + 0.12], mul, 0.018);
      wr(k, f, [f.u[0] + L * 0.18, f.u[0] + L * 0.34], [8, Hf - 6], '#5f8288', 0.012);
      for (let i = 0; i < 12; i++) { const j = Math.floor(r() * nV), fl = Math.floor(r() * 12); const a = f.u[0] + (j / nV) * L; wr(k, f, [a + 0.08, a + L / nV - 0.08], [6 + fl * 3.6 + 0.2, 6 + fl * 3.6 + 3.3], r() < 0.6 ? C.litCool : C.lit, 0.014); }
    }
    // sky-garden band, corner fin, masts + window-cleaning crane
    for (const f of Object.values(T)) wr(k, f, [f.u[0], f.u[1]], [30.6, 33.6], '#3c4a40', 0.022);
    for (const f of Object.values(T)) for (let u = f.u[0] + 1; u < f.u[1] - 1; u += 1.4) wr(k, f, [u, u + 0.8], [30.7, 31.4], '#5f7f4f', 0.026);
    k.box('#c9c5b8', [0.8, Hb - 4, 0.8], [W / 2 + 0.2, 4, -D / 2 + 1], { base: true });
    for (const [x, h] of [[-6, 6], [-3.5, 4]]) { k.cyl('#8f969a', 0.12, 0.2, h, [x, Hb - 1, -D / 2 + 2], { base: true, seg: 5 }); k.ico('#c43a2e', 0.15, [x, Hb - 1 + h, -D / 2 + 2]); }
    k.box('#8f969a', [6, 0.6, 1.2], [3, Hb - 2.4, -D / 2 + 2.2], { base: true });
    k.box('#8f969a', [0.4, 2.6, 0.4], [5, Hb - 4.8, -D / 2 + 2.2], { base: true });
  } else {
    g = root('skyscraper', v, { w: 24, h: 63, l: 24 }, { style: 'bronze' });
    const bz = '#6b5a4a', gold = '#b39a6a', S = 18, H = 44;
    k.box('#b9b2a2', [24, 7, 24], [0, 0, 0], { base: true });
    const P = walls(24, 24);
    for (const f of Object.values(P)) { towerFace(k, f, 0.6, 6.4, { seed: 4201 + f.at, pier: 4, glass: '#3a3428', pierColor: '#d9d1bf', lit: 0.35, spandrel: false }); band(k, f, 6.4, 7, '#d9d1bf', 0.02); }
    for (const x of [-9, -3, 3, 9]) k.box('#d9d1bf', [0.5, 4.6, 0.5], [x, 0, 13.6], { base: true });
    k.box('#d9d1bf', [20, 0.3, 2.6], [0, 4.6, 13.4], { base: true });
    k.box((cx, cy, cz, nx, ny, nz) => (Math.abs(nx) > 0.4 && Math.abs(nz) > 0.4 ? '#8a7560' : ny > 0.5 ? '#4f4a44' : bz), [S, H - 7, S], [0, 7, 0], { base: true, c: 2.4, cv: true });
    const T = walls(S, S);
    const tw = S - 2 * 2.4;
    for (const f of Object.values(T)) {
      const ff = { ...f, u: [-tw / 2, tw / 2] };
      towerFace(k, ff, 7, H, { seed: 4210 + f.at, pier: 1.8, glass: bz, pierColor: gold, pierW: 0.07, lit: 0.08, spandrel: shade(bz, 0.75), margin: 0.1, gap: 0, streak: '#857058' });
    }
    // lattice crown + spire
    const cb = 7, ct = 2.2, y0 = H, y1 = H + 9;
    k.box('#4f4a44', [S - 1, 0.6, S - 1], [0, H, 0], { base: true });
    for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) beam(k, gold, [a * cb, y0, b * cb], [a * ct, y1, b * ct], 0.35);
    for (const [yy, s] of [[y0 + 3, cb - (cb - ct) / 3], [y0 + 6, cb - 2 * (cb - ct) / 3], [y1, ct]]) for (const f of Object.values(walls(2 * s, 2 * s))) beam(k, gold, fp(f, f.u[0], yy), fp(f, f.u[1], yy), 0.22);
    for (const f of Object.values(walls(2 * cb, 2 * cb))) { const s1 = cb - (cb - ct) / 3; beam(k, gold, fp(f, -cb, y0), fp({ ...f, at: f.at * s1 / cb }, s1, y0 + 3), 0.14); beam(k, gold, fp(f, cb, y0), fp({ ...f, at: f.at * s1 / cb }, -s1, y0 + 3), 0.14); }
    k.cone(gold, 0.9, 6, [0, y1, 0], { base: true, seg: 6 });
    k.cyl('#5d6367', 0.06, 0.1, 3, [0, y1 + 5.6, 0], { base: true, seg: 5 });
    k.ico('#c43a2e', 0.15, [0, y1 + 8.7, 0]);
    k.box('#8f8d86', [4, 2.4, 3], [0, H + 0.6, 0], { base: true });
  }
  g.add(k.mesh('body'));
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// C10. Cinema — old movie palace. Blade sign "STARLITE", marquee with invented titles.
//   One atlas texture carries the blade, the marquee front and both marquee sides.
// ═════════════════════════════════════════════════════════════════════════════
function cinemaAtlas() {
  return signTexture({
    key: 'atlas_cinema', w: 1024, h: 1024, bg: '#2a2622',
    draw: (ctx) => {
      // A: blade (0,0)-(256,1024): vertical STARLITE on deep teal with bulb border
      ctx.fillStyle = '#2f5552'; ctx.fillRect(0, 0, 256, 1024);
      ctx.fillStyle = '#d9a83a'; ctx.fillRect(10, 10, 236, 1004); ctx.fillStyle = '#2f5552'; ctx.fillRect(22, 22, 212, 980);
      bulbs(ctx, 16, 16, 16, 1008, 40, 5); bulbs(ctx, 240, 16, 240, 1008, 40, 5);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      'STARLITE'.split('').forEach((ch, i) => {
        const y = 80 + i * 121;
        ctx.shadowColor = '#ffd98a'; ctx.shadowBlur = 18; ctx.fillStyle = '#f4dfa0';
        ctx.font = `900 112px ${FONTS.SANS}`; ctx.fillText(ch, 128, y);
        ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,248,225,0.6)'; ctx.font = `900 96px ${FONTS.SANS}`; ctx.fillText(ch, 128, y);
      });
      // B: marquee front (256,0)-(1024,160): letter board, three lines
      ctx.fillStyle = '#efe6cf'; ctx.fillRect(256, 0, 768, 160);
      ctx.fillStyle = '#9c3a2e'; ctx.fillRect(256, 0, 768, 14); ctx.fillRect(256, 146, 768, 14);
      bulbs(ctx, 266, 7, 1014, 7, 46, 4); bulbs(ctx, 266, 153, 1014, 153, 46, 4);
      ctx.fillStyle = '#1f1e1c';
      fitText(ctx, 'NOW SHOWING: DUST & THUNDER', 640, 46, 720, 40, '900', FONTS.COND);
      ctx.fillStyle = '#9c3a2e'; fitText(ctx, 'LATE SHOW · THE LAST MESA', 640, 88, 700, 34, '900', FONTS.COND);
      ctx.fillStyle = '#1f1e1c'; fitText(ctx, 'COMING SOON: CHROME COYOTE', 640, 126, 700, 30, '900', FONTS.COND);
      // C: marquee sides (256,170)-(640,440): STARLITE + showtimes
      ctx.fillStyle = '#efe6cf'; ctx.fillRect(256, 170, 384, 270);
      ctx.fillStyle = '#2f5552'; ctx.fillRect(256, 170, 384, 96);
      ctx.fillStyle = '#f4dfa0'; fitText(ctx, 'STARLITE', 448, 220, 360, 72, '900', FONTS.SANS);
      ctx.fillStyle = '#1f1e1c'; fitText(ctx, 'DUST & THUNDER', 448, 300, 360, 40, '900', FONTS.COND);
      ctx.fillStyle = '#9c3a2e'; fitText(ctx, 'TONIGHT 7 & 9', 448, 350, 360, 40, '900', FONTS.COND);
      ctx.fillStyle = '#1f1e1c'; fitText(ctx, 'AIR COOLED', 448, 404, 300, 32, '700', FONTS.COND);
      // D: four posters (640,170)-(1024,440)
      const P = [['#c9703a', '#2f3d55', 'DUST &', 'THUNDER'], ['#2f3d55', '#d9a83a', 'THE LAST', 'MESA'], ['#7a3a3a', '#efe6cf', 'CHROME', 'COYOTE'], ['#4f6b4a', '#efe6cf', 'NIGHT', 'TRAIN']];
      P.forEach(([bg, fg, t1, t2], i) => {
        const x = 640 + i * 96;
        ctx.fillStyle = bg; ctx.fillRect(x + 4, 174, 88, 262);
        ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(x + 48, 260, 30, 0, TAU); ctx.fill();
        ctx.fillRect(x + 14, 300, 68, 6);
        fitText(ctx, t1, x + 48, 340, 80, 20, '900', FONTS.COND); fitText(ctx, t2, x + 48, 366, 80, 24, '900', FONTS.COND);
      });
    },
  });
}
export function buildCinema() {
  const W = 20, D = 30, zc = -2.5, fz = zc + D / 2;
  const g = root('cinema', 0, { w: W + 2, h: 23, l: D + 4 });
  const k = new Kit(4300); k.floor = 0;
  const tile = '#d9c7a2', teal = '#3f6f6b', terra = '#b8643f', gold = '#c9a24a', stucco = '#c9b590';
  // auditorium + front block (taller false front)
  k.box(stucco, [W - 1, 13, D - 4], [0, 0, zc - 2], { base: true });
  k.box(tile, [W, 16, 4], [0, 0, fz - 2], { base: true });
  const F = walls(W, 4, 0, fz - 2), A = walls(W - 1, D - 4, 0, zc - 2);
  // central pylon with stepped top
  k.box(shade(tile, 1.04), [3.4, 19.5, 1.4], [0, 0, fz + 0.4], { base: true });
  k.box(teal, [2.6, 1.5, 1.2], [0, 19.5, fz + 0.4], { base: true });
  k.box(gold, [1.8, 1.2, 1.0], [0, 21.0, fz + 0.4], { base: true });
  k.cone(gold, 0.5, 1.2, [0, 22.2, fz + 0.4], { base: true, seg: 6 });
  for (const x of [-1.3, 1.3]) wr(k, { axis: 'z', at: fz + 1.1, dir: 1, u: [-2, 2] }, [x - 0.12, x + 0.12], [7, 19], terra, 0.01);
  // facade: stepped zig-zag parapet, coloured bands, tall deco windows, fluted pilasters
  for (const [x, w_, h] of [[-8.5, 3, 16.6], [8.5, 3, 16.6], [-5.5, 3, 17.2], [5.5, 3, 17.2]]) k.box(tile, [w_, h - 16, 4], [x, 16, fz - 2], { base: true });
  for (const x of [-8.5, -5.5, 5.5, 8.5]) k.box(teal, [3.1, 0.3, 4.1], [x, x === -8.5 || x === 8.5 ? 16.6 : 17.2, fz - 2], { base: true });
  band(k, F.front, 7.4, 7.9, teal, 0.02); band(k, F.front, 15.2, 15.6, terra, 0.02); band(k, F.front, 7.9, 8.1, gold, 0.024);
  for (let i = 0, x = -W / 2 + 0.6; x < W / 2 - 0.9; i++, x += 0.9) wpoly(k, F.front, [[x, 14.5], [x + 0.9, 14.5], [x + 0.45, 15.1]], i % 2 ? terra : teal, 0.026);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const u = s * (3.4 + i * 2.2);
      wpoly(k, F.front, archPts(u - 0.75, u + 0.75, 8.8, 13.2, 0.75), gold, 0.02);
      wpoly(k, F.front, archPts(u - 0.6, u + 0.6, 8.9, 13.2, 0.6), i === 1 ? C.lit : '#3a464c', 0.026);
      wr(k, F.front, [u - 0.6, u + 0.6], [11.0, 11.1], gold, 0.03);
    }
    fbox(k, shade(tile, 0.95), F.front, s * (W / 2 - 0.4), 8, 0.8, 16, 0.3, 0.15);
    for (let j = 0; j < 3; j++) wr(k, { ...F.front, at: F.front.at + 0.3 }, [s * (W / 2 - 0.4) - 0.3 + j * 0.25, s * (W / 2 - 0.4) - 0.2 + j * 0.25], [0.4, 15.5], shade(tile, 0.85), 0.01);
  }
  // ground floor: doors, ticket booth, poster cases
  band(k, F.front, 0, 0.6, '#5a4a3c', 0.012);
  wr(k, F.front, [-4.6, 4.6], [0, 3.6], gold, 0.014);
  for (let i = 0; i < 4; i++) { const u = -3.3 + i * 2.2; wr(k, F.front, [u - 0.95, u + 0.95], [0, 3.3], '#2b2a26', 0.02); wr(k, F.front, [u - 0.75, u + 0.75], [0.4, 3.0], '#4a5658', 0.026); }
  k.box('#9c3a2e', [2.2, 1.0, 1.6], [0, 0, fz + 1.4], { base: true, c: 0.3, cv: true });
  k.box(gold, [2.0, 1.2, 1.4], [0, 1.0, fz + 1.4], { base: true, c: 0.3, cv: true });
  k.box('#4a5658', [2.05, 0.9, 1.45], [0, 1.15, fz + 1.4], { base: true, c: 0.3, cv: true });
  k.lathe('#9c3a2e', [[1.2, 0], [0.9, 0.35], [0.2, 0.55], [0, 0.56]], 8, [0, 2.2, fz + 1.4], { scale: [1, 1, 0.75] });
  for (const u of [-8.4, -6.0, 6.0, 8.4]) { wr(k, F.front, [u - 0.85, u + 0.85], [0.7, 3.3], gold, 0.02); wr(k, F.front, [u - 0.7, u + 0.7], [0.85, 3.15], '#f3e2b0', 0.024); }
  // marquee box (letter boards are in the atlas)
  const my0 = 4.3, mh = 2.8, md = 3.6, mw = 12;
  k.box('#2b2a26', [mw, mh, md], [0, my0, fz + md / 2], { base: true });
  k.box(gold, [mw + 0.3, 0.25, md + 0.15], [0, my0 + mh, fz + md / 2], { base: true });
  k.box('#9c3a2e', [mw + 0.1, 0.2, md + 0.05], [0, my0 - 0.2, fz + md / 2], { base: true });
  k.rectY('#f3dfa6', my0 - 0.21, [-mw / 2 + 0.2, mw / 2 - 0.2], [fz + 0.2, fz + md - 0.2], { facing: [0, -1, 0], off: 0.004 });
  for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) k.rectY('#fff6d6', my0 - 0.215, [-5.2 + i * 1.3 - 0.07, -5.2 + i * 1.3 + 0.07], [fz + 0.8 + j * 1.0 - 0.07, fz + 0.8 + j * 1.0 + 0.07], { facing: [0, -1, 0], off: 0.006 });
  for (const s of [-1, 1]) rod(k, '#2a2a2a', [s * 5.5, my0 + mh, fz + md - 0.2], [s * 4.5, 9.5, fz + 0.1], 0.04, 4);
  // blade sign housing on the pylon
  const bh = 9.6, by = 7.6, bd = 2.4;
  k.box('#2b2a26', [0.4, bh + 0.4, bd + 0.2], [0, by - 0.2, fz + 1.1 + bd / 2], { base: true });
  k.box(gold, [0.5, 0.3, bd + 0.3], [0, by + bh + 0.2, fz + 1.1 + bd / 2], { base: true });
  // sides of the auditorium: pilasters, exit doors + escape stair, wear
  for (const f of [A.left, A.right]) {
    for (let i = 0; i < 6; i++) fbox(k, shade(stucco, 0.93), f, f.u[0] + 2 + i * 5, 6.5, 0.7, 13, 0.25, 0.12);
    wr(k, f, [f.u[0] + 3.6, f.u[0] + 5.2], [0, 2.4], '#5e4632', 0.02);
    band(k, f, 0, 1.0, mix(stucco, C.dirt, 0.35), 0.008);
    streaks(k, f, 5, 2, 13, shade(stucco, 0.85), 4310 + f.at, 0.3);
    wr(k, f, [f.u[0] + 8, f.u[0] + 20], [8.2, 11.4], shade(stucco, 0.9), 0.012);
  }
  wr(k, A.left, [-1, 0.6], [4.2, 6.6], '#5e4632', 0.02);
  fireEscape(k, A.left, -0.2, 1, 4.2, { width: 3.2, y0: 4.2, ground: true });
  acUnit(k, 4, 13, -8, 1.4); acUnit(k, -5, 13, -14, 1.4); vent(k, 0, 13, -4, 1.4, 0.4);
  k.box(shade(stucco, 0.9), [5, 2.2, 4], [0, 13, fz - 6], { base: true });
  g.add(k.mesh('body'));
  // signs (one atlas, one draw call): blade both faces, marquee front + both sides, poster cases
  const tex = cinemaAtlas(), A4 = (a, b, c, d) => atlasUV(a, b, c, d, 1024, 1024);
  const quads = [
    { p: [0.21, by + bh / 2, fz + 1.1 + bd / 2], w: bd, h: bh, rotY: Math.PI / 2, uv: A4(0, 0, 256, 1024) },
    { p: [-0.21, by + bh / 2, fz + 1.1 + bd / 2], w: bd, h: bh, rotY: -Math.PI / 2, uv: A4(0, 0, 256, 1024) },
    { p: [0, my0 + mh / 2, fz + md + 0.012], w: mw - 0.4, h: mh - 0.4, uv: A4(256, 0, 1024, 160) },
    { p: [mw / 2 + 0.012, my0 + mh / 2, fz + md / 2], w: md - 0.3, h: mh - 0.4, rotY: Math.PI / 2, uv: A4(256, 170, 640, 440) },
    { p: [-mw / 2 - 0.012, my0 + mh / 2, fz + md / 2], w: md - 0.3, h: mh - 0.4, rotY: -Math.PI / 2, uv: A4(256, 170, 640, 440) },
  ];
  [-8.4, -6.0, 6.0, 8.4].forEach((u, i) => quads.push({ p: [u, 2.0, fz + 0.03], w: 1.3, h: 2.2, uv: A4(640 + i * 96 + 4, 174, 640 + i * 96 + 92, 436) }));
  multiPanel(g, tex, quads, { glow: 0.35, fallback: '#d9c7a2' });
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// C11. Police station — "11TH PRECINCT": stone base, brick upper floors, steps, two flagpoles.
// ═════════════════════════════════════════════════════════════════════════════
function flag(k, x, y, z, design, s = 1) {
  // three-panel waving flag along +X from the pole (both faces)
  const segs = [[0, 0], [0.8, 0.12], [1.6, -0.05], [2.4, 0.1]];
  const h = 1.5 * s;
  const quad = (a, b, y0, y1, col) => {
    const A = segs[a], B = segs[b];
    const P = [[x + A[0] * s, y + y0, z + A[1]], [x + B[0] * s, y + y0, z + B[1]], [x + B[0] * s, y + y1, z + B[1]], [x + A[0] * s, y + y1, z + A[1]]];
    k.poly(col, P, {}); k.poly(col, P.slice().reverse(), {});
  };
  for (let i = 0; i < 3; i++) for (const [y0, y1, col] of design(i, h)) quad(i, i + 1, y0, y1, col);
}
export function buildPoliceStation() {
  const W = 28, D = 18, zc = -2, fz = zc + D / 2;
  const g = root('police_station', 0, { w: W, h: 16, l: D + 4 });
  const k = new Kit(4400); k.floor = 0;
  const stone = '#bfb49b', brick = '#8a5a44', fh = 3.8, H = 4.4 + fh * 2;
  k.box(stone, [W, 4.4, D], [0, 0, zc], { base: true });
  k.box(brick, [W - 0.3, H - 4.4, D - 0.3], [0, 4.4, zc], { base: true });
  const F = walls(W, D, 0, zc), U = walls(W - 0.3, D - 0.3, 0, zc);
  for (const f of Object.values(F)) { for (let y = 0.9; y < 4.4; y += 0.55) band(k, f, y - 0.04, y, shade(stone, 0.78), 0.012); band(k, f, 0, 0.5, shade(stone, 0.8), 0.016); }
  k.box(shade(stone, 1.04), [W + 0.3, 0.45, D + 0.3], [0, 4.4, zc], { base: true });
  k.box(shade(stone, 1.04), [W + 0.6, 0.7, D + 0.6], [0, H, zc], { base: true });
  parapet(k, W, D, H + 0.7, 0.8, 0.35, stone, 0, zc);
  // upper windows + ground-floor barred windows
  for (const [f, n] of [[U.front, 7], [U.left, 4], [U.right, 4], [U.back, 7]]) windowGrid(k, f, [[5.6, 7.6], [5.6 + fh, 7.6 + fh]], n, 1.3, { trim: stone, sill: stone, lit: 0.25, seed: 4401 + n + f.at, margin: 1.4, blinds: 0.4, skip: f === U.front ? (i) => i >= 2 && i <= 4 : null });
  for (const [f, n] of [[F.front, 7], [F.left, 4], [F.right, 4]]) {
    const L = f.u[1] - f.u[0];
    for (let i = 0; i < n; i++) {
      if (f === F.front && i >= 2 && i <= 4) continue;
      const u = f.u[0] + 1.4 + (i + 0.5) * (L - 2.8) / n;
      wr(k, f, [u - 0.7, u + 0.7], [1.2, 3.4], '#36424a', 0.02);
      for (let j = 0; j < 4; j++) wr(k, f, [u - 0.55 + j * 0.36, u - 0.5 + j * 0.36], [1.2, 3.4], '#2a2b2d', 0.026);
    }
  }
  // entrance bay: projecting, pilasters, raised parapet, frieze, doors
  const bw = 10, bz = fz + 0.6;
  k.box(stone, [bw, H + 1.6, 1.2], [0, 0, bz], { base: true });
  const B = { axis: 'z', at: bz + 0.6, dir: 1, u: [-bw / 2, bw / 2] };
  for (const x of [-4.4, -1.6, 1.6, 4.4]) { fbox(k, shade(stone, 1.06), B, x, (H + 1.2) / 2 + 0.2, 0.8, H + 0.8, 0.3, 0.15); k.box(shade(stone, 0.9), [1.0, 0.4, 0.5], [x, 0, bz + 0.75], { base: true }); }
  k.box(shade(stone, 1.06), [bw + 0.4, 0.5, 1.5], [0, H + 1.4, bz], { base: true });
  wpoly(k, B, [[-3, H + 1.6], [3, H + 1.6], [0, H + 2.8]], stone, 0);
  k.box(shade(stone, 1.03), [bw + 0.2, 1.3, 0.4], [0, 4.3, bz + 0.75], { base: true });
  k.extrude(stone, [[-3.2, H + 1.9], [3.2, H + 1.9], [0, H + 3.0]], 1.2, { axis: 'z', pos: [0, 0, bz] });
  wpoly(k, B, archPts(-1.1, 1.1, 1.0, 3.4, 0.9), shade(stone, 0.8), 0.02);
  wpoly(k, B, archPts(-0.9, 0.9, 1.0, 3.4, 0.75), '#3a4a3a', 0.026);
  wr(k, B, [-0.04, 0.04], [1.0, 3.4], '#2a2b2d', 0.03);
  for (const y of [7.6, 7.6 + fh]) for (const u of [-3, 0, 3]) { wr(k, B, [u - 0.6, u + 0.6], [y - 2.0, y], '#36424a', 0.02); wr(k, B, [u - 0.75, u + 0.75], [y - 2.15, y - 2.0], shade(stone, 0.85), 0.024); }
  // steps + cheek walls + globe lamps
  for (let i = 0; i < 6; i++) k.box(shade(stone, 0.95 - i * 0.01), [7.2, 1.0 - i * 0.17, 0.36], [0, 0, bz + 0.6 + 0.18 + i * 0.36], { base: true });
  for (const s of [-1, 1]) {
    k.box(stone, [0.6, 1.1, 2.6], [s * 3.9, 0, bz + 1.6], { base: true });
    k.cyl('#2f3a2f', 0.07, 0.09, 1.5, [s * 3.9, 1.1, bz + 2.5], { base: true, seg: 6 });
    k.ico('#a8d0a0', 0.28, [s * 3.9, 2.85, bz + 2.5], { detail: 1 });
    k.cyl('#2f3a2f', 0.2, 0.14, 0.12, [s * 3.9, 3.12, bz + 2.5], { base: true, seg: 6 });
  }
  // flagpoles + fictional flags (state-ish: blue/star; city: terracotta/sun)
  const fzp = bz + 3.2;
  for (const s of [-1, 1]) {
    const x = s * 7.5;
    k.box(stone, [1.2, 0.4, 1.2], [x, 0, fzp], { base: true });
    k.cyl('#c9c9c4', 0.06, 0.09, 11, [x, 0.4, fzp], { base: true, seg: 6 });
    k.ico(C.mustard, 0.14, [x, 11.5, fzp]);
    flag(k, x + 0.08, 9.6, fzp, s < 0
      ? (i, h) => (i === 0 ? [[0, h * 0.25, '#c9a24a'], [h * 0.25, h, '#3e5a7a']] : [[0, h * 0.25, '#c9a24a'], [h * 0.25, h, i === 1 ? '#efe6cf' : '#3e5a7a']])
      : (i, h) => [[0, h, i === 1 ? '#e8c47a' : '#a8553a']]);
  }
  // side sally-port garage door + roof antenna mast, AC, rain stains
  rollDoor(k, F.left, zc - 3, 3.6, 3.2, '#7a8a8c', { y0: 0 });
  for (const f of Object.values(U)) streaks(k, f, 6, 4.4, H, shade(brick, 0.82), 4410 + f.at, 0.2);
  const ax = -9, az = zc - 4;
  for (let i = 0; i < 4; i++) { const y = H + 0.7 + i * 2.2, s = 0.6 - i * 0.1; for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) k.box('#8f969a', [0.06, 2.2, 0.06], [ax + a * s, y, az + b * s], { base: true }); k.box('#8f969a', [s * 2, 0.06, s * 2], [ax, y + 2.2, az], { base: true }); }
  k.cyl('#8f969a', 0.03, 0.03, 3, [ax, H + 9.5, az], { base: true, seg: 4 });
  k.cyl('#d9d4c4', 0.5, 0.5, 0.12, [ax + 0.5, H + 6, az], { axis: 'z', seg: 8 });
  acUnit(k, 5, H + 0.7, zc - 3, 1.3); acUnit(k, 9, H + 0.7, zc + 1, 1.3);
  g.add(k.mesh('body'));
  const tex = textSign('sign_precinct', [{ text: '11TH PRECINCT', y: 0.55, px: 130, color: '#2f2a24', family: FONTS.SERIF, weight: '700' }], { bg: '#cfc4a8', w: 1024, h: 140 });
  addPanel(g, tex, 7.6, 1.04, [0, 4.95, bz + 0.97]);
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// C12. Hotel — tall brick hotel with a rooftop neon "HOTEL MERIDIAN" on a steel frame.
// ═════════════════════════════════════════════════════════════════════════════
export function buildHotel() {
  const W = 18, D = 14, zc = -0.5, fz = zc + D / 2, fh = 3.2, base = 5.4, floors = 10, H = base + fh * floors;
  const g = root('hotel', 0, { w: W + 2, h: H + 7, l: D + 3 });
  const k = new Kit(4500); k.floor = 0;
  const brick = '#a0664a', stone = '#cfc4a8';
  k.box(stone, [W, base, D], [0, 0, zc], { base: true });
  k.box(brick, [W - 0.2, H - base, D - 0.2], [0, base, zc], { base: true });
  const F = walls(W, D, 0, zc), U = walls(W - 0.2, D - 0.2, 0, zc);
  // base: arched windows, entrance, canopy
  for (const [f, n] of [[F.front, 5], [F.left, 4], [F.right, 4]]) {
    const L = f.u[1] - f.u[0];
    for (let i = 0; i < n; i++) {
      if (f === F.front && i === 2) continue;
      const u = f.u[0] + (i + 0.5) * L / n;
      wpoly(k, f, archPts(u - 1.1, u + 1.1, 0.6, 3.6, 1.1), shade(stone, 0.85), 0.012);
      wpoly(k, f, archPts(u - 0.95, u + 0.95, 0.7, 3.6, 0.95), f === F.front ? C.lit : '#3a464c', 0.02);
    }
  }
  wpoly(k, F.front, archPts(-1.5, 1.5, 0, 3.8, 1.4), '#7a5a3a', 0.016);
  wpoly(k, F.front, archPts(-1.2, 1.2, 0, 3.8, 1.15), '#2b2a26', 0.022);
  wr(k, F.front, [-0.9, 0.9], [0, 3.0], '#4a5658', 0.03);
  k.box('#2b2a26', [5.2, 0.5, 4.2], [0, 4.0, fz + 2.1], { base: true });
  for (const s of [-1, 1]) { rod(k, '#c9a24a', [s * 2.5, 4.0, fz + 4.1], [s * 2.5, 0, fz + 4.1], 0.06, 5); }
  band(k, F.front, base - 0.6, base, shade(stone, 0.9), 0.02);
  // tower: piers between window columns, belt courses, window grid, window ACs
  const rows = []; for (let i = 0; i < floors; i++) rows.push([base + i * fh + 0.8, base + i * fh + 2.5]);
  for (const [f, n] of [[U.front, 5], [U.left, 4], [U.right, 4], [U.back, 5]]) {
    windowGrid(k, f, rows, n, 1.25, { sill: stone, lit: 0.22, seed: 4501 + n + f.at, margin: 1.2, blinds: 0.35 });
    const L = f.u[1] - f.u[0] - 2.4;
    for (let i = 0; i <= n; i++) { const u = f.u[0] + 1.2 + (i / n) * L; wr(k, f, [u - 0.25, u + 0.25], [base, H], shade(brick, 1.08), 0.016); }
    for (const y of [base + fh * 3, base + fh * 7]) band(k, f, y - 0.1, y + 0.2, stone, 0.022);
    streaks(k, f, 5, base, H, shade(brick, 0.85), 4510 + f.at, 0.18);
  }
  const r = rng(4520);
  for (let i = 0; i < 9; i++) { const fl = 1 + Math.floor(r() * (floors - 1)), j = Math.floor(r() * 5); const u = -W / 2 + 1.2 + (j + 0.5) * (W - 2.4) / 5; k.box('#a9a79e', [0.7, 0.5, 0.5], [u, base + fl * fh + 0.85, fz + 0.15], { base: true }); }
  // cornice + parapet
  k.box(stone, [W + 0.8, 0.9, D + 0.8], [0, H, zc], { base: true });
  k.box(shade(stone, 0.85), [W + 0.5, 0.3, D + 0.5], [0, H - 0.3, zc], { base: true });
  parapet(k, W, D, H + 0.9, 0.7, 0.3, brick, 0, zc);
  fireEscape(k, U.right, zc, floors - 1, fh, { y0: base + fh, width: 3.6 });
  // roof: penthouse, tank, AC, sign frame
  k.box(shade(brick, 0.95), [5, 3, 4], [-4.5, H + 0.9, zc - 3], { base: true });
  roofTank(k, 4.5, H + 0.9, zc - 3.5, 1.4, 2.4, 2.0);
  acUnit(k, -1, H + 0.9, zc - 4.5, 1.1);
  const sw = 15, sh = 3.4, sy = H + 2.4, sz = zc + 2.6;
  for (let i = 0; i <= 4; i++) { const x = -sw / 2 + i * sw / 4; k.box(C.iron, [0.16, sy + sh - H - 0.9, 0.16], [x, H + 0.9, sz - 0.3], { base: true }); beam(k, C.iron, [x, H + 0.9, sz - 2.2], [x, sy + sh * 0.7, sz - 0.3], 0.12); }
  for (const y of [sy + 0.2, sy + sh - 0.2]) k.box(C.iron, [sw + 0.4, 0.14, 0.14], [0, y, sz - 0.3]);
  for (let i = 0; i < 6; i++) beam(k, C.iron, [-sw / 2 + i * sw / 6, sy + 0.2, sz - 0.3], [-sw / 2 + (i + 1) * sw / 6, sy + sh - 0.2, sz - 0.3], 0.08);
  k.box('#5f6064', [sw, 0.08, 0.9], [0, sy - 0.1, sz - 0.1], { base: true });
  g.add(k.mesh('body'));
  const tex = neonSign('neon_meridian', [
    { text: 'HOTEL', y: 0.24, px: 64, color: '#ffd27a', backer: '#5a2a24', x: 0.5, maxW: 0.3 },
    { text: 'MERIDIAN', y: 0.66, px: 150, color: '#ff6a5a', backer: '#4a2622', maxW: 0.96 },
  ], { w: 1024, h: 240 });
  addPanel(g, tex, sw, sh, [0, sy + sh / 2, sz - 0.2], 0, { glow: 0.85, cut: 0.4, fallback: '#c86a5a' });
  const tex2 = neonSign('neon_meridian_canopy', [{ text: 'HOTEL MERIDIAN', y: 0.55, px: 80, color: '#ffd27a' }], { w: 1024, h: 110, bg: '#2b2a26' });
  addPanel(g, tex2, 5.0, 0.5, [0, 4.25, fz + 4.21], 0, { glow: 0.6, fallback: '#2b2a26' });
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// C13. Fire station — two engine bays, hose tower, "ENGINE CO. 7".
// ═════════════════════════════════════════════════════════════════════════════
export function buildFireStation() {
  const W = 16, D = 16, zc = -1.5, fz = zc + D / 2, H = 9.6;
  const g = root('fire_station', 0, { w: W + 1, h: 19, l: D + 3 });
  const k = new Kit(4600); k.floor = 0;
  const brick = '#9a4a3a', stone = '#d9cfba', red = '#a8382e';
  k.box(brick, [W, H, D], [0, 0, zc], { base: true });
  const F = walls(W, D, 0, zc);
  k.box(stone, [W + 0.3, 0.3, D + 0.3], [0, 6.05, zc], { base: true });
  k.box(stone, [W + 0.5, 0.6, D + 0.5], [0, H, zc], { base: true });
  parapet(k, W, D, H + 0.6, 0.6, 0.3, brick, 0, zc);
  // raised centre pediment with round crest
  k.box(brick, [6, 1.6, 0.4], [0, H + 0.6, fz - 0.2], { base: true });
  k.box(stone, [6.4, 0.25, 0.6], [0, H + 2.2, fz - 0.2], { base: true });
  k.cyl(stone, 0.75, 0.75, 0.12, [0, H + 1.4, fz + 0.04], { axis: 'z', seg: 10 });
  k.cyl(red, 0.6, 0.6, 0.12, [0, H + 1.4, fz + 0.08], { axis: 'z', seg: 10 });
  // bays: sectional doors with glass rows, stone surrounds
  for (const x of [-3.6, 3.6]) {
    wr(k, F.front, [x - 2.5, x + 2.5], [0, 4.9], stone, 0.012);
    wr(k, F.front, [x - 2.2, x + 2.2], [0, 4.6], '#e9e4d6', 0.02);
    for (let i = 1; i < 5; i++) wr(k, F.front, [x - 2.2, x + 2.2], [i * 0.92 - 0.03, i * 0.92 + 0.03], '#b9b4a6', 0.026);
    for (let j = 0; j < 4; j++) wr(k, F.front, [x - 2.0 + j * 1.05, x - 1.15 + j * 1.05], [2.9, 3.5], '#36424a', 0.03);
    k.box(C.safety, [0.25, 1.0, 0.25], [x - 2.7, 0, fz + 0.3], { base: true });
    k.box(C.safety, [0.25, 1.0, 0.25], [x + 2.7, 0, fz + 0.3], { base: true });
  }
  // upper floor windows + arched heads, side door, bell
  windowGrid(k, F.front, [[6.7, 8.5]], 4, 1.3, { trim: stone, sill: stone, lit: 0.4, seed: 4601, margin: 1.2 });
  for (const [f, n] of [[F.left, 4], [F.right, 4]]) windowGrid(k, f, [[1.4, 3.4], [6.7, 8.5]], n, 1.2, { trim: stone, sill: stone, lit: 0.3, seed: 4602 + f.at, margin: 1.4 });
  wr(k, F.right, [fz - 3, fz - 1.9], [0, 2.3], red, 0.024);
  k.box(C.iron, [0.1, 0.1, 0.8], [0, 5.9, fz + 0.4]);
  k.lathe('#b8892a', [[0.4, 0], [0.32, 0.2], [0.26, 0.55], [0, 0.6]], 8, [0, 5.0, fz + 0.75]);
  for (const f of Object.values(F)) { band(k, f, 0, 0.6, mix(brick, C.dirt, 0.35), 0.01); patches(k, f, 3, 1, H - 1, brick, 4610 + f.at); }
  // hose-drying tower at the back-left
  const tx = -W / 2 + 2.2, tz = zc - D / 2 + 2.2, TH = 17;
  k.box(brick, [4.4, TH, 4.4], [tx, 0, tz], { base: true });
  const T = walls(4.4, 4.4, tx, tz);
  for (const f of Object.values(T)) {
    for (const y of [11, 14]) { wr(k, f, [f.u[0] + 1.6, f.u[1] - 1.6], [y, y + 2.0], '#1f1e1c', 0.02); for (let i = 0; i < 4; i++) wr(k, f, [f.u[0] + 1.6, f.u[1] - 1.6], [y + 0.25 + i * 0.45, y + 0.4 + i * 0.45], shade(brick, 0.8), 0.026); }
    band(k, f, 10.4, 10.7, stone, 0.02);
  }
  k.box(stone, [4.8, 0.4, 4.8], [tx, TH, tz], { base: true });
  k.cone('#5a5f63', 3.4, 2.4, [tx, TH + 0.4, tz], { base: true, seg: 4, rot: [0, Math.PI / 4, 0] });
  k.cyl('#5d6367', 0.04, 0.04, 2.2, [tx, TH + 2.6, tz], { base: true, seg: 4 });
  // apron: keep-clear hatching in front of each bay
  k.box('#9a968c', [W + 1, 0.04, 3], [0, 0, fz + 1.5], { base: true });
  for (const x of [-3.6, 3.6]) for (let i = 0; i < 6; i++) k.poly('#b84a3a', [[x - 2.0 + i * 0.75, 0.05, fz + 2.8], [x - 1.7 + i * 0.75, 0.05, fz + 2.8], [x - 1.3 + i * 0.75, 0.05, fz + 0.3], [x - 1.6 + i * 0.75, 0.05, fz + 0.3]], { facing: [0, 1, 0] });
  acUnit(k, 3, H + 0.6, zc - 3, 1.2);
  g.add(k.mesh('body'));
  const tex = textSign('sign_engine7', [{ text: 'ENGINE CO. 7', y: 0.55, px: 120, color: '#efe6cf', family: FONTS.SERIF, weight: '700' }], { bg: '#7a2e26', w: 1024, h: 120 });
  addPanel(g, tex, 8.6, 1.0, [0, 5.45, fz + 0.03]);
  return g;
}

export const BUILDERS = {
  skyscraper: { build: (v) => buildSkyscraper(v), variants: 3 },
  cinema: { build: () => buildCinema(), variants: 1 },
  police_station: { build: () => buildPoliceStation(), variants: 1 },
  hotel: { build: () => buildHotel(), variants: 1 },
  fire_station: { build: () => buildFireStation(), variants: 1 },
};
