// ─────────────────────────────────────────────────────────────────────────────
// Scenery (Agent ART): every `biomes[].scenery` kind in route.json plus
// canyon_wall + warning_sign.
//
// Roadside rule: local +Z is the side that FACES THE ROAD (building facades,
// house front doors, billboard faces, streetlight arms, traffic-light arms).
// Things that run PARALLEL to the road (fences, power lines, canyon walls) run
// along local X. Origin = ground centre of the footprint.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Kit, root, rng, empty, signTexture, signPanel, fitText, insertLevels, offsetPoly } from './kit.js';
import { PAL, mix, shade } from '../palette.js';

// ── wall painting helpers ────────────────────────────────────────────────────
/** Wall descriptor helpers for an axis-aligned box centred on x=cx, z=cz. */
function walls(w, d, cx = 0, cz = 0) {
  return {
    front: { axis: 'z', at: cz + d / 2, dir: 1, u: [cx - w / 2, cx + w / 2] },
    back: { axis: 'z', at: cz - d / 2, dir: -1, u: [cx - w / 2, cx + w / 2] },
    left: { axis: 'x', at: cx + w / 2, dir: 1, u: [cz - d / 2, cz + d / 2] },
    right: { axis: 'x', at: cx - w / 2, dir: -1, u: [cz - d / 2, cz + d / 2] },
  };
}
function wr(k, f, ur, yr, color, off = 0.012) {
  if (f.axis === 'x') k.rectX(color, f.at, ur, yr, f.dir, { off });
  else k.rectZ(color, f.at, ur, yr, f.dir, { off });
}
const DARK_GLASS = ['#2f3a42', '#36424a', '#29333a', '#3b464c'];
/**
 * Grid of windows on a wall. rows: [[y0,y1],...]; cols: count; ww: window width.
 * o: { lit: prob, litColor, trim, sill, seed, blinds, margin }
 */
function windowGrid(k, f, rows, cols, ww, o = {}) {
  const r = rng(o.seed || 1);
  const [u0, u1] = f.u;
  const m = o.margin ?? 0.8;
  const span = (u1 - u0) - 2 * m;
  for (const [y0, y1] of rows) {
    for (let i = 0; i < cols; i++) {
      const uc = u0 + m + (i + 0.5) * (span / cols);
      const a = uc - ww / 2, b = uc + ww / 2;
      if (o.skip && o.skip(i, y0)) continue;
      if (o.trim) wr(k, f, [a - 0.12, b + 0.12], [y0 - 0.12, y1 + 0.1], o.trim, 0.01);
      const lit = r() < (o.lit ?? 0.15);
      const col = lit ? (o.litColor || (r() < 0.7 ? PAL.windowLit : '#d8e2df')) : (o.blinds && r() < o.blinds ? '#a9a493' : DARK_GLASS[Math.floor(r() * DARK_GLASS.length)]);
      wr(k, f, [a, b], [y0, y1], col, 0.02);
      // inset shadow along the top + one side
      wr(k, f, [a, b], [y1 - (y1 - y0) * 0.14, y1], lit ? shade(col, 0.78) : shade(col, 0.7), 0.026);
      if (o.sill) wr(k, f, [a - 0.08, b + 0.08], [y0 - 0.1, y0], o.sill, 0.03);
      if (o.mullion) wr(k, f, [uc - 0.03, uc + 0.03], [y0, y1], o.mullion, 0.03);
    }
  }
}
/** Horizontal band (spandrel, cornice line) across a wall. */
function band(k, f, y0, y1, color, off = 0.014, inset = 0) { wr(k, f, [f.u[0] + inset, f.u[1] - inset], [y0, y1], color, off); }

/** Parapet ring on a flat roof. */
function parapet(k, w, d, y, h, t, color, cx = 0, cz = 0) {
  k.box(color, [w, h, t], [cx, y + h / 2, cz + d / 2 - t / 2]);
  k.box(color, [w, h, t], [cx, y + h / 2, cz - d / 2 + t / 2]);
  k.box(color, [t, h, d - 2 * t], [cx + w / 2 - t / 2, y + h / 2, cz]);
  k.box(color, [t, h, d - 2 * t], [cx - w / 2 + t / 2, y + h / 2, cz]);
}
function roofUnits(k, w, d, y, seed, n = 3) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const uw = 1.2 + r() * 1.4, ud = 1.0 + r() * 1.2, uh = 0.7 + r() * 0.8;
    const x = (r() - 0.5) * (w - uw - 2), z = (r() - 0.5) * (d - ud - 2);
    k.box(r() < 0.5 ? '#a9a79e' : '#8f8d86', [uw, uh, ud], [x, y, z], { base: true, c: 0.06 });
    k.box('#5f6064', [uw * 0.6, 0.05, ud * 0.6], [x, y + uh, z], { base: true });
  }
}

// ── signs ────────────────────────────────────────────────────────────────────
function textSign(key, lines, o = {}) {
  return signTexture({
    key, w: o.w || 512, h: o.h || 256, bg: o.bg || '#e9e0c8',
    draw: (ctx, W, H) => {
      if (o.border) { ctx.strokeStyle = o.border; ctx.lineWidth = o.borderW || 14; ctx.strokeRect(10, 10, W - 20, H - 20); }
      if (o.drawBg) o.drawBg(ctx, W, H);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const L of lines) {
        ctx.fillStyle = L.color || '#2a2a2a';
        fitText(ctx, L.text, W * (L.x ?? 0.5), H * L.y, W * (L.maxW || 0.9), L.px, L.weight || '900', L.family);
      }
      if (o.draw) o.draw(ctx, W, H);
    },
  });
}
/** Mount a sign panel (with a backing board) as a child of g. pos = panel centre, faces +Z (rotY to turn). */
function mountSign(g, tex, w, h, pos, rotY = 0, fallback = '#d9cfb3', name = 'sign') {
  const p = signPanel(tex, w, h, fallback, name);
  p.position.set(pos[0], pos[1], pos[2]);
  p.rotation.y = rotY;
  g.add(p);
  return p;
}

// ═════════════════════════════════════════════════════════════════════════════
// CITY
// ═════════════════════════════════════════════════════════════════════════════
const BUILDING_STYLES = ['brick', 'concrete', 'glass', 'cornershop', 'garage', 'motel'];

export function buildBuilding(variant = 0) {
  const style = BUILDING_STYLES[((variant % 6) + 6) % 6];
  const k = new Kit(500 + variant); k.floor = 0;
  let g, size;
  const S = 600 + variant;
  if (style === 'brick') {
    const w = 14, d = 12, fh = 3.3, floors = 5, H = fh * floors;
    size = { w, h: H + 3.5, l: d };
    g = root('building', variant, size);
    const brick = mix(PAL.brick, '#a8664c', 0.3);
    k.box(brick, [w, H, d], [0, 0, 0], { base: true, c: 0.1 });
    const F = walls(w, d);
    // ground floor shopfront (front)
    k.box('#3a3b3d', [w + 0.04, 0.5, d + 0.04], [0, 0, 0], { base: true });
    band(k, F.front, 0.5, 3.0, '#5a4a3c', 0.014, 0.6);
    wr(k, F.front, [-5.6, -1.0], [0.6, 2.8], '#2f3a42', 0.02);
    wr(k, F.front, [1.8, 5.6], [0.6, 2.8], '#3a464c', 0.02);
    wr(k, F.front, [3.0, 4.2], [0.9, 1.6], PAL.windowLit, 0.026);
    wr(k, F.front, [-0.6, 1.4], [0.5, 2.6], '#4a3324', 0.02); // door
    wr(k, F.front, [-0.4, 1.2], [1.4, 2.4], '#2f3a42', 0.026);
    band(k, F.front, 3.0, 3.3, '#c9c0aa', 0.02);
    // awning over the shop
    k.box('#4f8f8a', [4.4, 0.08, 1.2], [3.7, 3.0, d / 2 + 0.6], { rot: [0.25, 0, 0] });
    k.box('#3f7470', [4.4, 0.35, 0.05], [3.7, 2.78, d / 2 + 1.18]);
    // upper floors
    const rows = []; for (let i = 1; i < floors; i++) rows.push([i * fh + 0.8, i * fh + 2.5]);
    for (const [f, cols] of [[F.front, 4], [F.left, 3], [F.right, 3], [F.back, 3]]) {
      windowGrid(k, f, rows, cols, 1.2, { trim: '#c9c0aa', sill: '#d8cfba', lit: 0.18, seed: S + cols, blinds: 0.3, margin: 1.2 });
    }
    // floor lines + cornice
    for (let i = 1; i < floors; i++) for (const f of Object.values(F)) band(k, f, i * fh + 0.05, i * fh + 0.18, shade(brick, 0.82), 0.012);
    k.box('#c9c0aa', [w + 0.4, 0.5, d + 0.4], [0, H, 0], { base: true, c: 0.05 });
    parapet(k, w, d, H + 0.5, 0.6, 0.3, brick);
    // fire escape on the left side
    for (let i = 1; i < floors; i++) {
      k.box('#2a2a2b', [0.9, 0.06, 3.2], [w / 2 + 0.45, i * fh, 0]);
      k.box('#2a2a2b', [0.04, 0.9, 3.2], [w / 2 + 0.88, i * fh + 0.45, 0]);
      k.box('#2a2a2b', [0.06, 3.4, 0.06], [w / 2 + 0.6, i * fh - 1.6, 0.6 * (i % 2 ? 1 : -1)], { rot: [i % 2 ? 0.75 : -0.75, 0, 0] });
    }
    // wooden water tower on the roof
    const ty = H + 0.5;
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box('#3a3836', [0.15, 2.2, 0.15], [-3 + x * 0.9, ty, -2 + z * 0.9], { base: true });
    k.cyl('#7a5a3f', 1.4, 1.4, 2.4, [-3, ty + 2.2, -2], { base: true, seg: 9 });
    k.cone('#4a4038', 1.55, 0.9, [-3, ty + 4.6, -2], { base: true, seg: 9 });
    for (const y of [0.5, 1.6]) k.cyl('#2f2c29', 1.42, 1.42, 0.1, [-3, ty + 2.2 + y, -2], { seg: 9 });
    roofUnits(k, w, d, H + 0.5, S, 2);
    // grime: dirt gradient along the base, a faded ghost ad on the right wall
    for (const f of [F.left, F.right, F.back]) band(k, f, 0.5, 1.2, mix(brick, PAL.dirt, 0.4), 0.014);
    wr(k, F.right, [-3.5, 3.5], [10.5, 13.5], mix(brick, '#d9cfb3', 0.35), 0.016);
    wr(k, F.right, [-3.0, 3.0], [11.3, 12.0], mix(brick, '#4f8f8a', 0.4), 0.02);
  } else if (style === 'concrete') {
    const w = 16, d = 14, fh = 3.3, floors = 8, H = fh * floors;
    size = { w, h: H + 2.5, l: d };
    g = root('building', variant, size);
    const con = PAL.concrete;
    k.box(con, [w, H, d], [0, 0, 0], { base: true, c: 0.12 });
    const F = walls(w, d);
    // ground floor: recessed lobby
    band(k, F.front, 0.0, 3.6, '#5d5f61', 0.014, 1.0);
    wr(k, F.front, [-6.5, 6.5], [0.3, 3.2], '#33404a', 0.02);
    for (let i = -3; i <= 3; i++) wr(k, F.front, [i * 2 - 0.06, i * 2 + 0.06], [0.3, 3.2], '#5d5f61', 0.026);
    wr(k, F.front, [-1.0, 1.0], [0.3, 2.6], '#d8e2df', 0.03);
    // ribbon windows
    for (let i = 1; i < floors; i++) {
      const y0 = i * fh + 0.9, y1 = i * fh + 2.5;
      for (const f of Object.values(F)) {
        band(k, f, y0, y1, '#2f3a42', 0.016, 0.7);
        band(k, f, y1 - 0.2, y1, '#262f36', 0.02, 0.7);
        const L = f.u[1] - f.u[0] - 1.4, n = Math.round(L / 2);
        for (let j = 0; j <= n; j++) { const u = f.u[0] + 0.7 + (j / n) * L; wr(k, f, [u - 0.05, u + 0.05], [y0, y1], '#8f8b82', 0.022); }
      }
    }
    // a few lit panes
    const r = rng(S);
    for (let i = 0; i < 14; i++) {
      const fl = 1 + Math.floor(r() * (floors - 1)), f = [F.front, F.left, F.right][i % 3];
      const L = f.u[1] - f.u[0] - 1.4, n = Math.round(L / 2), j = Math.floor(r() * n);
      const ua = f.u[0] + 0.7 + (j / n) * L;
      wr(k, f, [ua + 0.06, ua + L / n - 0.06], [fl * fh + 0.9, fl * fh + 2.3], r() < 0.5 ? PAL.windowLit : '#d8e2df', 0.019);
    }
    // weathering streaks under each ribbon (rain stains)
    for (let i = 0; i < 10; i++) { const f = [F.front, F.left, F.right][i % 3]; const u = f.u[0] + 1 + r() * (f.u[1] - f.u[0] - 2); const fl = 1 + Math.floor(r() * (floors - 1)); wr(k, f, [u - 0.12, u + 0.12], [fl * fh + 0.2, fl * fh + 0.9], shade(con, 0.85), 0.018); }
    parapet(k, w, d, H, 0.9, 0.3, shade(con, 0.95));
    k.box('#9a968c', [5, 2.4, 4], [2, H, -2], { base: true, c: 0.08 });
    roofUnits(k, w, d, H, S, 3);
    k.cyl('#3a3b3d', 0.04, 0.04, 4, [-5, H, 4], { base: true, seg: 4 });
  } else if (style === 'glass') {
    const w = 18, d = 16, fh = 3.3, floors = 9, H = 4 + fh * (floors - 1);
    size = { w, h: H + 1.5, l: d };
    g = root('building', variant, size);
    const gl = '#4a6270';
    // concrete base + glass tower
    k.box('#b9b4a8', [w + 0.6, 4, d + 0.6], [0, 0, 0], { base: true, c: 0.08 });
    k.box(gl, [w, H - 4, d], [0, 4, 0], { base: true, c: 0.08 });
    const F = walls(w + 0.6, d + 0.6), T = walls(w, d);
    wr(k, F.front, [-7, 7], [0.2, 3.4], '#33404a', 0.02);
    for (let i = -3; i <= 3; i++) wr(k, F.front, [i * 2.33 - 0.07, i * 2.33 + 0.07], [0.2, 3.4], '#8f8b82', 0.026);
    wr(k, F.front, [-1.2, 1.2], [0.2, 2.8], '#d8e2df', 0.03);
    k.box('#d9d3c4', [8, 0.25, 2.5], [0, 3.6, d / 2 + 1.5]); // entrance canopy
    // spandrels + mullions
    for (let i = 0; i < floors - 1; i++) {
      const y = 4 + i * fh;
      for (const f of Object.values(T)) band(k, f, y + fh - 0.5, y + fh - 0.05, '#7f8f96', 0.016);
    }
    for (const f of Object.values(T)) {
      const L = f.u[1] - f.u[0], n = Math.round(L / 3);
      for (let j = 1; j < n; j++) { const u = f.u[0] + (j / n) * L; wr(k, f, [u - 0.08, u + 0.08], [4, H], '#6f7f86', 0.02); }
      // sky reflection streaks
      wr(k, f, [f.u[0] + L * 0.15, f.u[0] + L * 0.32], [6, H - 6], '#5c7684', 0.014);
    }
    const r = rng(S);
    for (let i = 0; i < 18; i++) {
      const f = [T.front, T.left, T.right][i % 3], L = f.u[1] - f.u[0], n = Math.round(L / 3), j = Math.floor(r() * n);
      const fl = Math.floor(r() * (floors - 1)), y = 4 + fl * fh;
      wr(k, f, [f.u[0] + (j / n) * L + 0.1, f.u[0] + ((j + 1) / n) * L - 0.1], [y + 0.2, y + fh - 0.55], r() < 0.6 ? '#d8e2df' : PAL.windowLit, 0.018);
    }
    k.box('#5f6c72', [w - 2, 1.4, d - 2], [0, H, 0], { base: true, c: 0.05 });
    k.box('#8f8d86', [4, 1.0, 3], [-4, H + 1.4, 1], { base: true, c: 0.04 });
  } else if (style === 'cornershop') {
    const w = 12, d = 10, H = 7.2;
    size = { w, h: H + 1.4, l: d };
    g = root('building', variant, size);
    const st = '#d8c7a0';
    k.box(st, [w, H, d], [0, 0, 0], { base: true, c: 0.08 });
    const F = walls(w, d);
    k.box('#5a4a3c', [w + 0.05, 0.45, d + 0.05], [0, 0, 0], { base: true });
    // shop windows on the front and the +X (corner) side
    for (const f of [F.front, F.left]) {
      band(k, f, 0.45, 3.3, '#3d4f4b', 0.014, 0.4);
      const L = f.u[1] - f.u[0];
      for (let j = 0; j < 3; j++) {
        const a = f.u[0] + 0.7 + j * (L - 1.4) / 3, b = a + (L - 1.4) / 3 - 0.3;
        wr(k, f, [a, b], [0.7, 3.0], j === 1 && f === F.front ? '#4a3324' : '#33404a', 0.02);
        if (!(j === 1 && f === F.front)) {
          wr(k, f, [a + 0.3, a + 1.1], [1.6, 2.6], ['#d9a83a', '#b85c6a', '#6f8fb0'][j], 0.026); // posters
          wr(k, f, [a + 0.1, b - 0.1], [0.75, 1.1], '#7b8a5a', 0.026); // produce crates
        } else wr(k, f, [a + 0.25, b - 0.25], [1.5, 2.8], '#33404a', 0.026);
      }
    }
    // striped awning across the front and the corner
    const aw = (len, cx, cz, rotY) => {
      k.at([cx, 3.5, cz], [0, rotY, 0], () => {
        const n = Math.round(len / 0.6);
        for (let i = 0; i < n; i++) k.box(i % 2 ? '#e9e2cf' : '#3f7470', [len / n, 0.07, 1.5], [-len / 2 + (i + 0.5) * len / n, 0, 0.72], { rot: [0.32, 0, 0] });
        k.box('#3f7470', [len, 0.3, 0.05], [0, -0.38, 1.45]);
      });
    };
    aw(w - 0.6, 0, d / 2, 0);
    aw(d - 0.6, w / 2, 0, Math.PI / 2);
    // upper floor
    for (const [f, n] of [[F.front, 3], [F.left, 3], [F.right, 2], [F.back, 3]]) windowGrid(k, f, [[4.5, 6.3]], n, 1.2, { trim: '#efe6cf', sill: '#efe6cf', lit: 0.25, seed: S + n, margin: 1.4, blinds: 0.4 });
    k.box('#b8a684', [w + 0.3, 0.4, d + 0.3], [0, H, 0], { base: true, c: 0.04 });
    parapet(k, w, d, H + 0.4, 0.6, 0.25, st);
    k.box('#8f8d86', [1.6, 1.0, 1.4], [2, H + 0.4, -2], { base: true, c: 0.05 });
    for (const f of [F.right, F.back]) band(k, f, 0.45, 1.0, mix(st, PAL.dirt, 0.35), 0.014);
    const tex = textSign('sign_cornershop', [
      { text: "LUCKY'S", y: 0.36, px: 120, color: '#9c3a2e' },
      { text: 'CORNER MART · OPEN LATE', y: 0.78, px: 44, color: '#2a3a38' },
    ], { bg: '#efe6cf', border: '#3f7470' });
    g.add(k.mesh('body'));
    mountSign(g, tex, 6, 1.5, [0, 4.4, d / 2 + 0.08]);
    g.userData.style = style;
    return g;
  } else if (style === 'garage') {
    const w = 22, d = 18, lh = 3.0, levels = 4, H = lh * levels;
    size = { w, h: H + 1.2, l: d };
    g = root('building', variant, size);
    const con = '#b1ada3';
    // dark interior core + slabs + columns + parapets
    k.box('#2b2c2e', [w - 0.8, H, d - 0.8], [0, 0, 0], { base: true });
    for (let i = 0; i <= levels; i++) {
      k.box(con, [w, 0.35, d], [0, i * lh, 0], { base: true });
      if (i > 0) {
        for (const [x, z, ww, dd] of [[0, d / 2 - 0.1, w, 0.2], [0, -d / 2 + 0.1, w, 0.2], [w / 2 - 0.1, 0, 0.2, d], [-w / 2 + 0.1, 0, 0.2, d]]) {
          k.box(con, [ww, 1.0, dd], [x, i * lh - 0.65, z], { base: false });
        }
      }
    }
    for (const x of [-w / 2 + 0.3, -w / 6, w / 6, w / 2 - 0.3]) for (const z of [d / 2 - 0.3, -d / 2 + 0.3]) k.box(shade(con, 0.92), [0.5, H, 0.5], [x, 0, z], { base: true });
    for (const z of [-d / 6, d / 6]) for (const x of [w / 2 - 0.3, -w / 2 + 0.3]) k.box(shade(con, 0.92), [0.5, H, 0.5], [x, 0, z], { base: true });
    // parked car roofs peeking over the parapets
    const r = rng(S);
    for (let i = 1; i < levels; i++) {
      for (let j = 0; j < 5; j++) {
        if (r() < 0.35) continue;
        const x = -w / 2 + 2 + j * 4.2 + r() * 0.6;
        k.box(PAL.civ[Math.floor(r() * 6)], [1.8, 0.55, 3.6], [x, i * lh + 0.35, d / 2 - 2.6], { base: true, c: 0.12 });
        k.box('#2f3a42', [1.5, 0.35, 1.8], [x, i * lh + 0.9, d / 2 - 2.8], { base: true, c: 0.08 });
      }
    }
    // stained ramp stripe and a stair tower
    k.box(shade(con, 0.88), [3.4, H + 1.6, 3.4], [-w / 2 - 1.6, 0, -d / 2 + 2.2], { base: true, c: 0.06 });
    const ST = walls(3.4, 3.4, -w / 2 - 1.6, -d / 2 + 2.2);
    for (let i = 0; i < levels; i++) wr(k, ST.front, [-w / 2 - 2.4, -w / 2 - 0.8], [i * lh + 1.0, i * lh + 2.6], '#2f3a42', 0.02);
    k.box('#2a2a2b', [w, 0.4, 0.3], [0, 0, d / 2 + 0.2], { base: true });
    k.box('#e2b93b', [3, 0.2, 0.32], [w / 2 - 3, 2.2, d / 2 + 0.01]);
    const tex = signTexture({
      key: 'sign_parking', w: 256, h: 256, bg: '#2f5f8f',
      draw: (ctx, W, H2) => {
        ctx.fillStyle = '#f1f1ee'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '900 200px Arial, Helvetica, sans-serif'; ctx.fillText('P', W / 2, H2 / 2 + 10);
        ctx.strokeStyle = '#f1f1ee'; ctx.lineWidth = 10; ctx.strokeRect(14, 14, W - 28, H2 - 28);
      },
    });
    g.add(k.mesh('body'));
    mountSign(g, tex, 2.6, 2.6, [-w / 2 + 3, H - 1.1, d / 2 + 0.25]);
    g.userData.style = style;
    return g;
  } else { // motel
    const w = 26, d = 10, fh = 3.1, H = fh * 2;
    size = { w, h: 11, l: d + 2.5 };
    g = root('building', variant, size);
    const st = '#d9b8a0';
    k.box(st, [w, H, d], [0, 0, 0], { base: true, c: 0.08 });
    const F = walls(w, d);
    k.box('#7a6a5a', [w + 0.05, 0.4, d + 0.05], [0, 0, 0], { base: true });
    // walkway + balcony + railing + roof overhang
    k.box(PAL.concreteLight, [w, 0.25, 2.2], [0, fh - 0.25, d / 2 + 1.1], { base: true });
    k.box('#c9c3b5', [w + 0.6, 0.3, 2.8], [0, H, d / 2 + 0.8], { base: true });
    for (let i = 0; i <= 10; i++) { const x = -w / 2 + 0.2 + i * (w - 0.4) / 10; k.box('#e9e2cf', [0.18, H, 0.18], [x, 0, d / 2 + 2.05], { base: true }); }
    k.box('#4f8f8a', [w, 0.08, 0.06], [0, fh + 0.95, d / 2 + 2.15]);
    k.box('#4f8f8a', [w, 0.06, 0.05], [0, fh + 0.5, d / 2 + 2.15]);
    for (let i = 0; i < 40; i++) k.box('#4f8f8a', [0.04, 0.95, 0.04], [-w / 2 + 0.4 + i * (w - 0.8) / 39, fh, d / 2 + 2.15], { base: true });
    // doors + windows per room (8 rooms per floor)
    const r = rng(S);
    for (let fl = 0; fl < 2; fl++) {
      for (let i = 0; i < 8; i++) {
        const x0 = -w / 2 + 1 + i * (w - 2) / 8;
        const y = fl * fh + (fl ? 0 : 0.4);
        const dc = ['#4f8f8a', '#b85c6a', '#d9a83a'][(i + fl) % 3];
        wr(k, F.front, [x0 + 0.3, x0 + 1.2], [y, y + 2.2], dc, 0.02);
        wr(k, F.front, [x0 + 1.0, x0 + 1.1], [y + 1.0, y + 1.1], '#c9a24a', 0.026);
        const lit = r() < 0.3;
        wr(k, F.front, [x0 + 1.6, x0 + 2.7], [y + 1.0, y + 2.0], lit ? PAL.windowLit : '#3b464c', 0.02);
        wr(k, F.front, [x0 + 1.6, x0 + 1.9], [y + 1.0, y + 2.0], '#a8542e', 0.026); // curtain
        k.box('#9a968c', [0.6, 0.5, 0.25], [x0 + 2.2, y + 2.25, d / 2 + 0.12], { base: true }); // wall AC
      }
    }
    for (const f of [F.left, F.right, F.back]) band(k, f, 0.4, 1.0, mix(st, PAL.dirt, 0.35), 0.014);
    // stair at the +X end
    for (let i = 0; i < 9; i++) k.box(PAL.concreteLight, [1.4, 0.18, 0.32], [w / 2 + 0.8, 0.2 + i * 0.33, d / 2 + 1.6 - i * 0.32], { base: true });
    k.box(PAL.concreteLight, [1.4, fh, 0.3], [w / 2 + 0.8, 0, d / 2 - 1.5], { base: true });
    // tall sign pole
    k.box('#5f6468', [0.35, 10, 0.35], [-w / 2 - 1.5, 0, d / 2 + 1.5], { base: true });
    k.box('#2b2c2f', [3.6, 0.5, 0.5], [-w / 2 - 1.5, 9.0, d / 2 + 1.5], { base: true });
    const tex = textSign('sign_motel', [
      { text: 'STARLITE', y: 0.28, px: 96, color: '#b85c6a' },
      { text: 'MOTOR INN', y: 0.56, px: 64, color: '#2a3a38' },
      { text: 'VACANCY · COLOR TV', y: 0.84, px: 40, color: '#3f7470' },
    ], { bg: '#efe6cf', border: '#b85c6a', borderW: 10, h: 300 });
    g.add(k.mesh('body'));
    mountSign(g, tex, 4.2, 2.45, [-w / 2 - 1.5, 7.6, d / 2 + 1.72]);
    g.userData.style = style;
    return g;
  }
  g.add(k.mesh('body'));
  g.userData.style = style;
  return g;
}

export function buildStreetlight(variant = 0) {
  const g = root('streetlight', variant, { w: 0.6, h: 8.4, l: 3.2 });
  const k = new Kit(30); k.floor = 0;
  const pole = '#6a6f73';
  k.box(PAL.concrete, [0.6, 0.3, 0.6], [0, 0, 0], { base: true, c: 0.04 });
  k.cyl(pole, 0.1, 0.14, 8.0, [0, 0.3, 0], { base: true, seg: 7 });
  k.cyl(pole, 0.07, 0.07, 2.6, [0, 8.1, 1.25], { axis: 'z', seg: 6, rot: [-0.08, 0, 0] });
  // cobra head
  k.box('#7a7f83', [0.45, 0.22, 0.9], [0, 8.18, 2.6], { c: 0.08, taper: [0.8, 0.85] });
  k.box(PAL.lampWarm, [0.36, 0.04, 0.7], [0, 8.06, 2.6]);
  k.box('#4a4d50', [0.2, 0.5, 0.15], [0, 2.5, 0.12]); // utility box
  k.box(mix(pole, PAL.rust, 0.4), [0.3, 0.6, 0.3], [0, 0.3, 0], { base: true }); // grimy foot
  g.add(k.mesh('body'));
  g.add(empty('light', [0, 8.0, 2.6]));
  return g;
}

export function buildTrafficlight(variant = 0) {
  const g = root('trafficlight', variant, { w: 1.0, h: 7.0, l: 6.2 });
  const k = new Kit(31); k.floor = 0;
  const pole = '#4c5154';
  k.box(PAL.concrete, [0.7, 0.3, 0.7], [0, 0, 0], { base: true });
  k.cyl(pole, 0.13, 0.16, 6.5, [0, 0.3, 0], { base: true, seg: 7 });
  k.cyl(pole, 0.08, 0.1, 5.8, [0, 6.4, 2.9], { axis: 'z', seg: 6 });
  k.box(pole, [0.06, 1.2, 0.06], [0, 6.0, 0.55], { rot: [-0.8, 0, 0] });
  const head = (z, yTop, dirX) => {
    k.box('#2a2b2d', [0.32, 1.0, 0.36], [0, yTop - 0.5, z], { c: 0.03 });
    const lens = [['#c43a2e', 0.32], ['#6a5418', 0.0], ['#1f4a2c', -0.32]];
    for (const [c, dy] of lens) for (const s of [1, -1]) {
      k.cyl(c, 0.11, 0.11, 0.04, [s * 0.17, yTop - 0.5 + dy, z], { axis: 'x', seg: 8 });
      k.box('#1d1e20', [0.14, 0.04, 0.26], [s * 0.22, yTop - 0.5 + dy + 0.13, z]); // visor
    }
  };
  head(3.4, 6.35, 1); head(5.6, 6.35, 1);
  // pedestrian head + push button on the pole
  k.box('#2a2b2d', [0.3, 0.32, 0.25], [0.0, 2.9, 0.22], { c: 0.03 });
  k.box('#d9894a', [0.2, 0.2, 0.02], [0, 2.9, 0.35]);
  k.box('#e2b93b', [0.12, 0.18, 0.08], [0, 1.1, 0.17]);
  // street name blade
  k.box('#2f6a4a', [0.04, 0.25, 1.4], [0, 6.0, 1.8]);
  g.add(k.mesh('body'));
  g.add(empty('signals', [0, 5.85, 4.5]));
  return g;
}

function canopy(k, cols, pos, r, seed, squash = 0.85, n = 3) {
  const rr = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rr();
    const d = i === 0 ? 0 : r * 0.45;
    const rad = r * (i === 0 ? 1 : 0.72 + rr() * 0.2);
    k.ico(cols[i % cols.length], rad, [pos[0] + Math.cos(a) * d, pos[1] + (i === 0 ? 0 : -r * 0.15 + rr() * r * 0.3), pos[2] + Math.sin(a) * d], { detail: 1, jitter: 0.12, seed: seed + i, scale: [1, squash, 1], jit: 0.1 });
  }
}

export function buildTreeCity(variant = 0) {
  const g = root('tree_city', variant, { w: 4.4, h: 7.5, l: 4.4 });
  const k = new Kit(32 + variant); k.floor = 0;
  // tree grate in the sidewalk
  k.box('#4a4b4d', [1.4, 0.04, 1.4], [0, 0.0, 0], { base: true });
  k.box('#5a4a3c', [1.1, 0.05, 1.1], [0, 0.0, 0], { base: true });
  k.cyl(PAL.trunk, 0.14, 0.2, 3.4, [0, 0, 0], { base: true, seg: 6 });
  k.cyl(PAL.trunk, 0.07, 0.1, 1.6, [0.4, 2.8, 0.1], { base: true, seg: 5, rot: [0, 0, -0.5] });
  const cols = variant % 2 ? [PAL.leaf[3], PAL.leaf[0]] : [PAL.leaf[1], PAL.leaf[2]];
  canopy(k, cols, [0, 5.2, 0], 2.1, 40 + variant, 0.85, 3);
  g.add(k.mesh('body'));
  return g;
}

export function buildBench(variant = 0) {
  const g = root('bench', variant, { w: 1.9, h: 0.95, l: 0.7 });
  const k = new Kit(33); k.floor = 0;
  const wood = variant % 2 ? '#4f8f8a' : PAL.woodLight;
  for (const s of [1, -1]) {
    k.box('#2a2b2d', [0.06, 0.45, 0.5], [s * 0.82, 0, 0], { base: true });
    k.box('#2a2b2d', [0.06, 0.5, 0.06], [s * 0.82, 0.45, -0.24], { base: true, rot: [-0.18, 0, 0] });
    k.box('#2a2b2d', [0.06, 0.06, 0.5], [s * 0.82, 0.66, 0.0]);
  }
  for (let i = 0; i < 3; i++) k.box(i === 1 ? shade(wood, 0.92) : wood, [1.85, 0.05, 0.14], [0, 0.46, 0.16 - i * 0.16], { c: 0.01 });
  for (let i = 0; i < 2; i++) k.box(wood, [1.85, 0.12, 0.04], [0, 0.66 + i * 0.16, -0.28 - i * 0.03], { c: 0.01, rot: [-0.18, 0, 0] });
  g.add(k.mesh('body'));
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// SUBURBS
// ═════════════════════════════════════════════════════════════════════════════
/** Gable roof with eaves. ridge 'x' (ridge along X) or 'z'. Includes gable-end wall prism. */
function gableRoof(k, { w, d, y, rh, o = 0.45, t = 0.2, ridge = 'x', roof, wall, soffit, cx = 0, cz = 0 }) {
  const across = ridge === 'x' ? d : w, along = ridge === 'x' ? w : d;
  const half = across / 2, slope = rh / half, e = half + o, ye = y - o * slope;
  const prof = [[-e, ye], [0, y + rh], [e, ye], [e, ye + t], [0, y + rh + t * 1.15], [-e, ye + t]];
  const col = (cx_, cy, cz_, nx, ny) => (ny < -0.3 ? (soffit || shade(roof, 0.55)) : Math.abs(ny) < 0.3 ? shade(roof, 0.7) : roof);
  k.extrude(col, prof, along + 2 * o * 0.8, { axis: ridge === 'x' ? 'x' : 'z', pos: [cx, 0, cz] });
  k.extrude(wall, [[-half, y - 0.02], [half, y - 0.02], [0, y + rh - 0.04]], along, { axis: ridge === 'x' ? 'x' : 'z', pos: [cx, 0, cz] });
  // shingle lines
  const n = Math.max(2, Math.floor(rh / 0.5));
  for (let i = 1; i < n; i++) {
    const tt = i / n, yy = ye + t + (y + rh - ye) * tt, ee = e * (1 - tt);
    for (const s of [1, -1]) {
      const p0 = ridge === 'x' ? [cx - along / 2 - o * 0.8, yy, cz + s * ee] : [cx + s * ee, yy, cz - along / 2 - o * 0.8];
      const p1 = ridge === 'x' ? [cx + along / 2 + o * 0.8, yy, cz + s * ee] : [cx + s * ee, yy, cz + along / 2 + o * 0.8];
      const facing = ridge === 'x' ? [0, 1, s * slope] : [s * slope, 1, 0];
      const lift = ridge === 'x' ? [0, 0.06, 0] : [0, 0.06, 0];
      const dl = ridge === 'x' ? [0, -0.05 * slope, 0.05 * s] : [0.05 * s, -0.05 * slope, 0];
      k.poly(shade(roof, 0.82), [p0, p1, [p1[0] + dl[0], p1[1] + dl[1], p1[2] + dl[2]], [p0[0] + dl[0], p0[1] + dl[1], p0[2] + dl[2]]].map((p) => [p[0] + lift[0], p[1] + lift[1], p[2] + lift[2]]), { facing, off: 0.005 });
    }
  }
}
/** Hip roof (pyramid-ish) over a w×d box at height y. */
function hipRoof(k, { w, d, y, rh, o = 0.45, roof, soffit, cx = 0, cz = 0 }) {
  const ridgeX = w >= d;
  const wt = ridgeX ? Math.max(0.02, (w - d) / 2) : 0.02, dt = ridgeX ? 0.02 : Math.max(0.02, (d - w) / 2);
  k.frustum({ default: roof, bottom: soffit || shade(roof, 0.55) }, { x: cx, y0: y - 0.12, y1: y + rh, zb: [cz - d / 2 - o, cz + d / 2 + o], zt: [cz - dt, cz + dt], wb: w / 2 + o, wt }, { skip: [] });
}
function houseWindow(k, f, uc, y0, w, h, o = {}) {
  const trim = o.trim || '#efe9dc';
  wr(k, f, [uc - w / 2 - 0.1, uc + w / 2 + 0.1], [y0 - 0.1, y0 + h + 0.1], trim, 0.012);
  wr(k, f, [uc - w / 2, uc + w / 2], [y0, y0 + h], o.lit ? PAL.windowLit : '#36424a', 0.02);
  wr(k, f, [uc - w / 2, uc + w / 2], [y0 + h * 0.55, y0 + h], o.curtain || '#c9bfa8', 0.026);
  wr(k, f, [uc - 0.03, uc + 0.03], [y0, y0 + h], trim, 0.03);
  wr(k, f, [uc - w / 2, uc + w / 2], [y0 + h * 0.5 - 0.03, y0 + h * 0.5 + 0.03], trim, 0.03);
  if (o.shutters) for (const s of [-1, 1]) wr(k, f, [uc + s * (w / 2 + 0.12) - 0.18, uc + s * (w / 2 + 0.12) + 0.18], [y0 - 0.05, y0 + h + 0.05], o.shutters, 0.016);
}
function houseDoor(k, f, uc, w = 0.95, color = '#7a4a32') {
  wr(k, f, [uc - w / 2 - 0.12, uc + w / 2 + 0.12], [0.3, 2.45], '#efe9dc', 0.012);
  wr(k, f, [uc - w / 2, uc + w / 2], [0.3, 2.3], color, 0.02);
  wr(k, f, [uc - w / 2 + 0.15, uc + w / 2 - 0.15], [1.6, 2.1], '#36424a', 0.026);
  wr(k, f, [uc + w / 2 - 0.2, uc + w / 2 - 0.12], [1.2, 1.28], '#c9a24a', 0.03);
}
function siding(k, f, y0, y1, color, step = 0.32) {
  for (let y = y0 + step; y < y1 - 0.05; y += step) wr(k, f, [f.u[0] + 0.05, f.u[1] - 0.05], [y - 0.02, y], shade(color, 0.88), 0.008);
}
function garageDoor(k, f, uc, w, h, color = '#e9e4d6') {
  wr(k, f, [uc - w / 2 - 0.12, uc + w / 2 + 0.12], [0.25, h + 0.12], '#efe9dc', 0.012);
  wr(k, f, [uc - w / 2, uc + w / 2], [0.25, h], color, 0.02);
  for (let i = 1; i < 4; i++) wr(k, f, [uc - w / 2, uc + w / 2], [0.25 + i * (h - 0.25) / 4 - 0.025, 0.25 + i * (h - 0.25) / 4 + 0.025], shade(color, 0.85), 0.026);
  wr(k, f, [uc - w / 2 + 0.2, uc + w / 2 - 0.2], [h - 0.55, h - 0.25], '#36424a', 0.03);
}

const HOUSE = [
  { name: 'ranch', siding: '#d6c08a', roof: '#6b4a3a', door: '#4f6b55' },
  { name: 'twostorey', siding: '#9fb4c4', roof: '#4d5056', door: '#9c3a2e' },
  { name: 'garage', siding: '#e2dccb', roof: '#3d4046', door: '#3e5a7a' },
  { name: 'porch', siding: '#b8c6a4', roof: '#9a5a3c', door: '#e9e2cf' },
  { name: 'twostorey_garage', siding: '#d9b8a0', roof: '#5a6a5a', door: '#2f3d55' },
  { name: 'bungalow', siding: '#c9c0b0', roof: '#4f6b8a', door: '#b85c3a' },
];

export function buildHouse(variant = 0) {
  const v = ((variant % 6) + 6) % 6, spec = HOUSE[v];
  const k = new Kit(700 + v); k.floor = 0;
  const r = rng(710 + v);
  const sid = spec.siding, roof = spec.roof, trim = '#efe9dc';
  const found = '#a39e92';
  let size;
  const fnd = (w, d, cx = 0, cz = 0) => k.box(found, [w + 0.1, 0.3, d + 0.1], [cx, 0, cz], { base: true });
  const walk = (x, z0, z1) => k.top('#bdb7aa', 0.02, [[x - 0.6, z0], [x + 0.6, z0], [x + 0.6, z1], [x - 0.6, z1]], { off: 0 });
  const chimney = (x, z, y0, h) => { k.box(PAL.brick, [0.8, h, 0.8], [x, y0, z], { base: true }); k.box('#5a4a3c', [0.95, 0.15, 0.95], [x, y0 + h, z], { base: true }); };
  const lit = () => r() < 0.2;
  if (v === 0) { // ranch: long single storey + hip roof
    const w = 14, d = 9, h = 3.0;
    size = { w: w + 1, h: 5.4, l: d + 4 };
    fnd(w, d); k.box(sid, [w, h, d], [0, 0.3, 0], { base: true, c: 0.04 });
    const F = walls(w, d);
    for (const f of Object.values(F)) siding(k, f, 0.3, h + 0.3, sid);
    houseDoor(k, F.front, -1.5, 0.95, spec.door);
    for (const x of [-5, -3.4, 1.6, 4.6]) houseWindow(k, F.front, x, 1.2, 1.2, 1.2, { shutters: shade(spec.door, 0.9), lit: lit() });
    houseWindow(k, F.left, -1.5, 1.2, 1.2, 1.2); houseWindow(k, F.right, 1.5, 1.2, 1.2, 1.2); houseWindow(k, F.back, 0, 1.2, 2.2, 1.2);
    hipRoof(k, { w, d, y: h + 0.3, rh: 2.0, roof });
    chimney(4, -1.5, 3.0, 2.8);
    walk(-1.5, d / 2, d / 2 + 4);
    // bushes along the front
    for (const x of [-6, -4.2, 0.4, 3.0, 6.0]) k.ico(PAL.bush, 0.55 + r() * 0.2, [x, 0.45, d / 2 + 0.6], { jitter: 0.2, seed: 70 + x * 3, scale: [1.2, 0.8, 1], jit: 0.1 });
  } else if (v === 1) { // two-storey gable
    const w = 10, d = 9, h = 5.8;
    size = { w: w + 1, h: 9.6, l: d + 4 };
    fnd(w, d); k.box(sid, [w, h, d], [0, 0.3, 0], { base: true, c: 0.04 });
    const F = walls(w, d);
    for (const f of Object.values(F)) siding(k, f, 0.3, h + 0.3, sid);
    houseDoor(k, F.front, 0, 1.0, spec.door);
    for (const x of [-3, 3]) houseWindow(k, F.front, x, 1.1, 1.3, 1.4, { shutters: '#2f3d55', lit: lit() });
    for (const x of [-3, 0, 3]) houseWindow(k, F.front, x, 3.8, 1.2, 1.3, { shutters: '#2f3d55', lit: lit() });
    for (const f of [F.left, F.right]) { houseWindow(k, f, -2, 1.1, 1.1, 1.3); houseWindow(k, f, 2, 3.8, 1.1, 1.2); }
    houseWindow(k, F.back, -2, 3.8, 1.1, 1.2); houseWindow(k, F.back, 2, 1.1, 1.6, 1.3);
    gableRoof(k, { w, d, y: h + 0.3, rh: 2.6, ridge: 'x', roof, wall: sid });
    // small entry porch roof
    k.box(roof, [2.6, 0.12, 1.4], [0, 2.75, d / 2 + 0.7], { rot: [0.2, 0, 0] });
    for (const s of [1, -1]) k.box(trim, [0.12, 2.5, 0.12], [s * 1.15, 0.3, d / 2 + 1.25], { base: true });
    k.box('#bdb7aa', [2.6, 0.3, 1.5], [0, 0, d / 2 + 0.75], { base: true });
    chimney(-3.6, -1.2, 5.0, 4.6);
    walk(0, d / 2 + 1.5, d / 2 + 4);
  } else if (v === 2) { // single storey + attached garage
    const w = 9, d = 9, h = 3.0, gw = 5.6;
    size = { w: w + gw + 1, h: 6.2, l: d + 6 };
    const cx = -gw / 2;
    fnd(w, d, cx); k.box(sid, [w, h, d], [cx, 0.3, 0], { base: true, c: 0.04 });
    k.box(sid, [gw, h - 0.3, d - 1], [cx + w / 2 + gw / 2, 0.3, -0.5], { base: true, c: 0.04 });
    const F = walls(w, d, cx), G = walls(gw, d - 1, cx + w / 2 + gw / 2, -0.5);
    for (const f of [...Object.values(F), G.front, G.left]) siding(k, f, 0.3, h + 0.3, sid);
    houseDoor(k, F.front, cx + 1.8, 0.95, spec.door);
    houseWindow(k, F.front, cx - 2.2, 1.1, 2.0, 1.3, { lit: lit() });
    houseWindow(k, F.right, 0, 1.1, 1.2, 1.2);
    garageDoor(k, G.front, cx + w / 2 + gw / 2, 4.2, 2.3);
    gableRoof(k, { w, d, y: h + 0.3, rh: 2.4, ridge: 'z', roof, wall: sid, cx });
    gableRoof(k, { w: gw, d: d - 1, y: h, rh: 1.6, ridge: 'x', roof: shade(roof, 1.08), wall: sid, cx: cx + w / 2 + gw / 2, cz: -0.5, o: 0.35 });
    // driveway with an oil stain
    k.top('#b0aba0', 0.02, [[cx + w / 2 + 0.6, d / 2 - 1], [cx + w / 2 + gw - 0.6, d / 2 - 1], [cx + w / 2 + gw - 0.6, d / 2 + 5], [cx + w / 2 + 0.6, d / 2 + 5]], { off: 0 });
    k.blob('#8f8a7f', 0.6, [cx + w / 2 + gw / 2, 0.026, d / 2 + 1.5], { seg: 7, seed: 3, off: 0 });
    walk(cx + 1.8, d / 2, d / 2 + 5);
    // basketball hoop over the garage
    k.box('#efece4', [1.2, 0.8, 0.05], [cx + w / 2 + gw / 2, 3.9, d / 2 - 0.9]);
    k.torus('#d9702a', 0.22, 0.02, [cx + w / 2 + gw / 2, 3.6, d / 2 - 0.62], { rot: [Math.PI / 2, 0, 0], rs: 3, ts: 8 });
  } else if (v === 3) { // gable facing street + front porch
    const w = 9, d = 11, h = 3.2;
    size = { w: w + 1, h: 8.4, l: d + 5 };
    fnd(w, d); k.box(sid, [w, h, d], [0, 0.3, 0], { base: true, c: 0.04 });
    const F = walls(w, d);
    for (const f of Object.values(F)) siding(k, f, 0.3, h + 0.3, sid);
    gableRoof(k, { w, d, y: h + 0.3, rh: 3.6, ridge: 'z', roof, wall: sid });
    // gable attic window
    houseWindow(k, { axis: 'z', at: d / 2, dir: 1 }, 0, 4.4, 1.0, 1.1, { lit: lit() });
    houseDoor(k, F.front, -1.6, 0.95, spec.door);
    houseWindow(k, F.front, 1.9, 1.2, 1.8, 1.3, { lit: lit() });
    for (const f of [F.left, F.right]) for (const z of [-3, 1]) houseWindow(k, f, z, 1.2, 1.1, 1.3);
    // porch: deck, posts, railing, roof
    const pz = d / 2 + 1.4;
    k.box('#a8a092', [w + 0.4, 0.5, 2.8], [0, 0, pz], { base: true });
    for (const x of [-w / 2, -w / 2 + 3, w / 2 - 3, w / 2]) k.box(trim, [0.16, 2.6, 0.16], [x, 0.5, pz + 1.2], { base: true });
    k.box(roof, [w + 0.8, 0.14, 3.2], [0, 3.15, pz], { rot: [0.12, 0, 0] });
    k.box(trim, [w + 0.5, 0.2, 0.2], [0, 3.0, pz + 1.3]);
    for (const [x0, x1] of [[-w / 2, -2.6], [-0.6, w / 2]]) {
      k.box(trim, [x1 - x0, 0.08, 0.08], [(x0 + x1) / 2, 1.4, pz + 1.2]);
      for (let x = x0 + 0.25; x < x1; x += 0.3) k.box(trim, [0.05, 0.85, 0.05], [x, 0.5, pz + 1.2], { base: true });
    }
    k.box('#a8a092', [1.6, 0.25, 0.5], [-1.6, 0, pz + 1.65], { base: true }); // steps
    k.box('#8a6a4a', [1.4, 0.08, 0.5], [2.6, 0.95, pz - 0.6]); // porch swing / bench
    walk(-1.6, pz + 1.9, pz + 4);
  } else if (v === 4) { // two-storey + garage wing
    const w = 9, d = 9, h = 5.8, gw = 6;
    size = { w: w + gw + 1, h: 9.4, l: d + 5 };
    const cx = gw / 2;
    fnd(w, d, cx); k.box(sid, [w, h, d], [cx, 0.3, 0], { base: true, c: 0.04 });
    k.box(shade(sid, 0.95), [gw, 2.9, d], [cx - w / 2 - gw / 2, 0.3, 0], { base: true, c: 0.04 });
    const F = walls(w, d, cx), G = walls(gw, d, cx - w / 2 - gw / 2, 0);
    for (const f of [...Object.values(F), G.front, G.right]) siding(k, f, 0.3, f === G.front || f === G.right ? 3.2 : h + 0.3, sid);
    houseDoor(k, F.front, cx - 1.8, 1.0, spec.door);
    houseWindow(k, F.front, cx + 2, 1.1, 1.8, 1.3, { lit: lit() });
    for (const x of [-2.5, 0.5, 3]) houseWindow(k, F.front, cx + x, 3.8, 1.1, 1.2, { lit: lit() });
    for (const f of [F.left]) { houseWindow(k, f, -2, 1.1, 1.1, 1.3); houseWindow(k, f, 2, 3.8, 1.1, 1.2); }
    garageDoor(k, G.front, cx - w / 2 - gw / 2, 4.8, 2.3, '#dcd6c8');
    hipRoof(k, { w, d, y: h + 0.3, rh: 2.4, roof, cx });
    hipRoof(k, { w: gw, d, y: 3.2, rh: 1.3, roof: shade(roof, 1.08), cx: cx - w / 2 - gw / 2, o: 0.35 });
    k.top('#b0aba0', 0.02, [[cx - w / 2 - gw + 0.5, d / 2], [cx - w / 2 - 0.5, d / 2], [cx - w / 2 - 0.5, d / 2 + 5], [cx - w / 2 - gw + 0.5, d / 2 + 5]], { off: 0 });
    walk(cx - 1.8, d / 2, d / 2 + 5);
    // car in the driveway (simple boxy silhouette, shares the vertex material)
    const cc = PAL.civ[Math.floor(r() * 6)];
    k.box(cc, [1.8, 0.7, 4.2], [cx - w / 2 - gw / 2, 0.3, d / 2 + 2.6], { base: true, c: 0.12 });
    k.box('#36424a', [1.5, 0.5, 2.0], [cx - w / 2 - gw / 2, 1.0, d / 2 + 2.4], { base: true, c: 0.1 });
    for (const [x, z] of [[0.8, 1.4], [-0.8, 1.4], [0.8, -1.3], [-0.8, -1.3]]) k.cyl('#222', 0.32, 0.32, 0.22, [cx - w / 2 - gw / 2 + x, 0.32, d / 2 + 2.6 + z], { axis: 'x', seg: 8 });
  } else { // bungalow with bay window
    const w = 9, d = 8, h = 2.9;
    size = { w: w + 1, h: 6.0, l: d + 4 };
    fnd(w, d); k.box(sid, [w, h, d], [0, 0.3, 0], { base: true, c: 0.04 });
    const F = walls(w, d);
    for (const f of Object.values(F)) siding(k, f, 0.3, h + 0.3, sid, 0.26);
    gableRoof(k, { w, d, y: h + 0.3, rh: 2.4, ridge: 'x', roof, wall: sid, o: 0.55 });
    // bay window box
    k.box(sid, [2.8, 2.0, 0.8], [-2.0, 0.6, d / 2 + 0.4], { base: true, c: 0.04 });
    k.box(roof, [3.1, 0.3, 1.0], [-2.0, 2.6, d / 2 + 0.45], { base: true, taper: [0.9, 0.5] });
    houseWindow(k, { axis: 'z', at: d / 2 + 0.8, dir: 1 }, -2.0, 1.0, 2.2, 1.3, { lit: lit() });
    houseDoor(k, F.front, 1.8, 0.95, spec.door);
    houseWindow(k, F.left, 0, 1.1, 1.3, 1.2); houseWindow(k, F.right, -1, 1.1, 1.3, 1.2);
    // dormer
    k.box(sid, [1.6, 1.2, 1.6], [1.8, h + 0.6, 1.0], { base: true });
    gableRoof(k, { w: 1.6, d: 1.6, y: h + 1.8, rh: 0.7, ridge: 'z', roof, wall: sid, cx: 1.8, cz: 1.0, o: 0.15, t: 0.12 });
    houseWindow(k, { axis: 'z', at: 1.8, dir: 1 }, 1.8, h + 0.75, 0.8, 0.8);
    chimney(-3.5, -1.0, 3.0, 3.4);
    walk(1.8, d / 2, d / 2 + 4);
    // garden: flower bed
    k.top('#5a4a3c', 0.02, [[-4.4, d / 2 + 0.9], [-0.4, d / 2 + 0.9], [-0.4, d / 2 + 1.6], [-4.4, d / 2 + 1.6]], { off: 0 });
    for (let i = 0; i < 6; i++) k.ico(i % 2 ? '#c96f4a' : '#d9a83a', 0.16, [-4.0 + i * 0.65, 0.18, d / 2 + 1.25], { seed: 90 + i });
  }
  const g = root('house', v, size);
  g.add(k.mesh('body'));
  g.userData.style = spec.name;
  return g;
}

export function buildTreeRound(variant = 0) {
  const v = ((variant % 3) + 3) % 3;
  const g = root('tree_round', v, { w: 5, h: 7.5, l: 5 });
  const k = new Kit(34 + v); k.floor = 0;
  if (v === 2) { // conifer
    k.cyl(PAL.trunk, 0.16, 0.24, 1.6, [0, 0, 0], { base: true, seg: 6 });
    const c = ['#4e6b44', '#5a7a4a', '#4a6340'];
    for (let i = 0; i < 4; i++) k.cone(c[i % 3], 2.0 - i * 0.42, 2.2, [0, 1.3 + i * 1.35, 0], { base: true, seg: 7, rot: [0, i * 0.4, 0], jit: 0.1 });
  } else {
    k.cyl(PAL.trunk, 0.18, 0.28, 3.0, [0, 0, 0], { base: true, seg: 6 });
    k.cyl(PAL.trunk, 0.08, 0.12, 1.6, [-0.4, 2.4, 0.2], { base: true, seg: 5, rot: [0.2, 0, 0.6] });
    const cols = v === 0 ? [PAL.leaf[0], PAL.leaf[1], PAL.leaf[2]] : [PAL.leaf[3], PAL.leaf[0], PAL.leaf[1]];
    canopy(k, cols, [0, v === 0 ? 4.6 : 5.2, 0], v === 0 ? 2.3 : 1.9, 50 + v, v === 0 ? 0.85 : 1.15, 3);
  }
  k.blob('#5d7b41', 1.6, [0, 0.015, 0], { seg: 9, seed: 35 + v, off: 0 });
  g.add(k.mesh('body'));
  return g;
}

/** Suburban fence segment, 4 m along X. v0 white picket, v1 weathered board fence, v2 boxwood hedge. */
export function buildFence(variant = 0) {
  const v = ((variant % 3) + 3) % 3;
  const g = root('fence', v, { w: 4, h: v === 1 ? 1.8 : 1.1, l: 0.3 });
  const k = new Kit(36 + v); k.floor = 0;
  if (v === 0) {
    const c = '#efece4';
    for (const x of [-1.95, 0]) k.box(c, [0.1, 1.1, 0.1], [x, 0, 0], { base: true });
    for (const y of [0.3, 0.8]) k.box(shade(c, 0.95), [4, 0.08, 0.05], [0, y, -0.06]);
    for (let i = 0; i < 26; i++) {
      const x = -1.95 + 0.075 + i * 0.154;
      k.box(i % 9 === 4 ? shade(c, 0.9) : c, [0.09, 0.85, 0.025], [x, 0.12, -0.02], { base: true });
      k.cone(c, 0.064, 0.1, [x, 1.02, -0.02], { seg: 4, rot: [0, Math.PI / 4, 0] });
    }
    k.box(mix(c, PAL.dirt, 0.4), [4, 0.12, 0.03], [0, 0.12, 0.0], { base: true });
  } else if (v === 1) {
    const c = PAL.woodGrey;
    for (const x of [-1.95, 0]) k.box(PAL.woodDark, [0.12, 1.8, 0.12], [x, 0, -0.06], { base: true });
    for (let i = 0; i < 26; i++) {
      const x = -1.95 + 0.08 + i * 0.154;
      k.box(i % 7 === 3 ? shade(c, 0.85) : i % 5 === 1 ? shade(c, 1.08) : c, [0.14, 1.72 + (i % 3) * 0.03, 0.025], [x, 0.04, 0.0], { base: true });
    }
  } else {
    k.box(PAL.bush, [4, 1.0, 0.8], [0, 0, 0], { base: true, c: 0.18, jit: 0.1 });
    for (let i = 0; i < 4; i++) k.ico(PAL.leaf[i % 4], 0.45, [-1.5 + i, 0.95, 0], { jitter: 0.2, seed: 37 + i, scale: [1.2, 0.5, 1], jit: 0.1 });
  }
  g.add(k.mesh('body'));
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// FARMS / OUTSKIRTS
// ═════════════════════════════════════════════════════════════════════════════
function planks(k, f, y0, y1, color, step = 0.35, seed = 1) {
  const r = rng(seed);
  for (let u = f.u[0] + step; u < f.u[1] - 0.05; u += step) {
    wr(k, f, [u - 0.025, u + 0.025], [y0, y1], shade(color, 0.8), 0.008);
    if (r() < 0.12) wr(k, f, [u, u + step - 0.03], [y0 + r() * 2, y0 + 2.5 + r() * 2], shade(color, r() < 0.5 ? 0.88 : 1.1), 0.01);
  }
}
function gambrel(k, { w, d, y, roof, wall, o = 0.4 }) {
  // gambrel profile in [x, y], ridge along Z (gable faces ±Z)
  const hw = w / 2;
  const p = [[-hw - o, y - 0.3], [-hw * 0.62, y + 2.4], [0, y + 3.6], [hw * 0.62, y + 2.4], [hw + o, y - 0.3]];
  const t = 0.22;
  const prof = [...p, ...p.slice().reverse().map(([x, yy]) => [x, yy + t])];
  const col = (cx, cy, cz, nx, ny, nz) => (ny < -0.3 ? shade(roof, 0.5) : Math.abs(nz) > 0.8 ? shade(roof, 0.75) : roof);
  k.extrude(col, prof, d + 2 * o, { axis: 'z' });
  k.extrude(wall, [[-hw, y - 0.02], [hw, y - 0.02], [hw * 0.62, y + 2.38], [0, y + 3.56], [-hw * 0.62, y + 2.38]], d, { axis: 'z' });
}

export function buildBarn(variant = 0) {
  const g = root('barn', variant, { w: 13, h: 11.5, l: 19 });
  const k = new Kit(40); k.floor = 0;
  const red = variant % 2 ? '#8a7a64' : '#9c4434', white = '#e9e2cf', roof = variant % 2 ? '#6a4a3a' : '#7d8285';
  const w = 12, d = 18, h = 5.5;
  k.box('#8f8a7f', [w + 0.1, 0.4, d + 0.1], [0, 0, 0], { base: true });
  k.box(red, [w, h, d], [0, 0.4, 0], { base: true, c: 0.05 });
  gambrel(k, { w, d, y: h + 0.4, roof, wall: red });
  const F = walls(w, d);
  for (const f of Object.values(F)) planks(k, f, 0.4, h + 0.4, red, 0.4, 41);
  for (const f of [F.front, F.back]) for (let u = -w * 0.6 + 0.4; u < w * 0.6; u += 0.4) wr(k, f, [u - 0.025, u + 0.025], [h + 0.5, h + 0.4 + 3.4 * (1 - Math.abs(u) / (w * 0.62))], shade(red, 0.8), 0.008);
  // big sliding doors with white X bracing
  const door = (uc, dw) => {
    wr(k, F.front, [uc - dw / 2 - 0.15, uc + dw / 2 + 0.15], [0.4, 4.3], white, 0.014);
    wr(k, F.front, [uc - dw / 2, uc + dw / 2], [0.5, 4.15], shade(red, 0.9), 0.02);
    // X braces as thin quads
    const z = d / 2 + 0.03;
    for (const s of [1, -1]) k.poly(white, [[uc - dw / 2, 0.5, z], [uc - dw / 2 + 0.2, 0.5, z], [uc + dw / 2, 4.15, z], [uc + dw / 2 - 0.2, 4.15, z]].map(([x, y, zz]) => [uc + (x - uc) * s, y, zz]), { facing: [0, 0, 1], off: 0.004 });
  };
  door(-1.6, 3.0); door(1.6, 3.0);
  k.box('#4a4b4d', [7, 0.12, 0.12], [0, 4.4, d / 2 + 0.12]);
  // hay loft door + hoist beam
  wr(k, F.front, [-1.0, 1.0], [6.2, 8.0], white, 0.014);
  wr(k, F.front, [-0.85, 0.85], [6.35, 7.85], '#3a2e24', 0.02);
  k.box(PAL.woodDark, [0.2, 0.2, 1.4], [0, 8.6, d / 2 + 0.6]);
  // white corner trim + windows
  for (const sx of [1, -1]) for (const sz of [1, -1]) k.box(white, [0.18, h, 0.18], [sx * (w / 2 - 0.02), 0.4, sz * (d / 2 - 0.02)], { base: true });
  for (const f of [F.left, F.right]) for (const z of [-5, 0, 5]) { wr(k, f, [z - 0.6, z + 0.6], [2.4, 3.6], white, 0.014); wr(k, f, [z - 0.45, z + 0.45], [2.55, 3.45], '#2f3a42', 0.02); }
  // cupola on the ridge
  k.box(white, [1.2, 1.0, 1.2], [0, h + 0.4 + 3.5, 0], { base: true });
  k.cone(roof, 1.0, 0.9, [0, h + 0.4 + 4.5, 0], { base: true, seg: 4, rot: [0, Math.PI / 4, 0] });
  k.cyl('#3a3836', 0.03, 0.03, 1.0, [0, h + 0.4 + 5.4, 0], { base: true, seg: 4 });
  k.box('#3a3836', [0.6, 0.04, 0.04], [0, h + 0.4 + 6.1, 0]);
  // weathering + hay spill
  for (const f of Object.values(F)) band(k, f, 0.4, 1.1, mix(red, PAL.dirt, 0.45), 0.012);
  k.blob(PAL.hayDark, 2.4, [0, 0.02, d / 2 + 1.6], { seg: 10, seed: 42, sx: 1.3, off: 0 });
  k.cyl(PAL.hay, 0.7, 0.7, 1.4, [4.6, 0.7, d / 2 + 1.0], { axis: 'x', seg: 10 });
  g.add(k.mesh('body'));
  return g;
}

export function buildSilo(variant = 0) {
  const v = ((variant % 2) + 2) % 2;
  const g = root('silo', v, { w: v ? 11 : 5.6, h: v ? 13.5 : 17, l: 5.6 });
  const k = new Kit(43 + v); k.floor = 0;
  const one = (x, r, h, c) => {
    k.cyl(c, r, r, h, [x, 0, 0], { base: true, seg: 12, open: true });
    for (let y = 1.2; y < h; y += 1.4) k.cyl(shade(c, 0.86), r + 0.03, r + 0.03, 0.08, [x, y, 0], { seg: 12, open: true });
    k.lathe(v ? '#b9b8b0' : '#8f948f', [[r + 0.08, 0], [r * 0.85, r * 0.4], [r * 0.45, r * 0.75], [0.25, r * 0.85], [0, r * 0.88]], 12, [x, h, 0]);
    k.cyl('#5f6064', 0.25, 0.25, 0.4, [x, h + r * 0.85, 0], { base: true, seg: 6 });
    // ladder cage up the front
    for (const s of [1, -1]) k.box('#5f6064', [0.05, h - 1, 0.05], [x + s * 0.25, 1, r + 0.18], { base: true });
    for (let y = 1.5; y < h; y += 0.9) k.box('#5f6064', [0.55, 0.04, 0.04], [x, y, r + 0.18]);
    for (let y = 3; y < h; y += 2.2) k.torus('#5f6064', 0.42, 0.025, [x, y, r + 0.3], { rot: [Math.PI / 2, 0, 0], rs: 3, ts: 6, arc: Math.PI * 1.1 });
    // rust streaks
    k.box(mix(c, PAL.rust, 0.45), [0.4, h * 0.5, 0.02], [x - r * 0.5, h * 0.4, r * 0.86], { rot: [0, -0.52, 0] });
  };
  if (v === 0) { one(0, 2.6, 13.5, '#c9c3b5'); k.box('#8f8a7f', [6, 0.3, 6], [0, 0, 0], { base: true }); }
  else { one(-2.8, 2.4, 10.5, '#c9c9c4'); one(2.8, 2.4, 10.5, '#b9b9b2'); k.box('#5f6064', [3.2, 0.5, 0.5], [0, 10.0, 0]); k.box('#8f8a7f', [11, 0.3, 5.6], [0, 0, 0], { base: true }); }
  g.add(k.mesh('body'));
  return g;
}

export function buildFarmhouse(variant = 0) {
  const g = root('farmhouse', variant, { w: 13, h: 10, l: 14 });
  const k = new Kit(45); k.floor = 0;
  const sid = variant % 2 ? '#d9c9a8' : '#e9e4d8', roof = '#6f7f8a', trim = '#efe9dc';
  const w = 11, d = 9, h = 5.8;
  k.box('#a39e92', [w + 0.1, 0.5, d + 0.1], [0, 0, 0], { base: true });
  k.box(sid, [w, h, d], [0, 0.5, 0], { base: true, c: 0.04 });
  const F = walls(w, d);
  for (const f of Object.values(F)) siding(k, f, 0.5, h + 0.5, sid);
  gableRoof(k, { w, d, y: h + 0.5, rh: 3.0, ridge: 'x', roof, wall: sid });
  // metal roof ribs
  for (let x = -w / 2 - 0.3; x <= w / 2 + 0.3; x += 0.6) for (const s of [1, -1]) {
    const slope = 3.0 / (d / 2);
    k.poly(shade(roof, 0.85), [[x - 0.03, h + 0.5 - 0.45 * slope + 0.22, s * (d / 2 + 0.45)], [x + 0.03, h + 0.5 - 0.45 * slope + 0.22, s * (d / 2 + 0.45)], [x + 0.03, h + 0.5 + 3.0 + 0.24, 0], [x - 0.03, h + 0.5 + 3.0 + 0.24, 0]], { facing: [0, 1, s * slope], off: 0.012 });
  }
  houseDoor(k, F.front, 0, 1.0, '#6a4a32');
  for (const x of [-3.2, 3.2]) houseWindow(k, F.front, x, 1.4, 1.1, 1.5, { shutters: '#3f5a4a' });
  for (const x of [-3.2, 0, 3.2]) houseWindow(k, F.front, x, 4.0, 1.0, 1.3, { shutters: '#3f5a4a' });
  for (const f of [F.left, F.right]) { houseWindow(k, f, -1.8, 1.4, 1.0, 1.4); houseWindow(k, f, 1.8, 4.0, 1.0, 1.2); }
  // wraparound porch on the front
  const pz = d / 2 + 1.3;
  k.box('#a39e92', [w + 1.2, 0.55, 2.6], [0, 0, pz], { base: true });
  for (let i = 0; i <= 5; i++) k.box(trim, [0.16, 2.6, 0.16], [-w / 2 - 0.4 + i * (w + 0.8) / 5, 0.55, pz + 1.15], { base: true });
  k.box(roof, [w + 1.6, 0.14, 3.0], [0, 3.25, pz], { rot: [0.14, 0, 0] });
  k.box(trim, [w + 1.0, 0.08, 0.08], [0, 1.45, pz + 1.15]);
  k.box('#a39e92', [1.8, 0.3, 0.6], [0, 0, pz + 1.55], { base: true });
  // chimney + rocking chairs + a dog-free porch (just a bucket)
  k.box(PAL.brick, [0.9, 4, 0.9], [-w / 2 + 1.2, 6.0, -1.2], { base: true });
  for (const x of [2.6, 3.6]) { k.box('#6a4a32', [0.6, 0.08, 0.6], [x, 1.0, pz - 0.3]); k.box('#6a4a32', [0.6, 0.8, 0.06], [x, 1.4, pz - 0.6]); }
  k.cyl('#8f948f', 0.2, 0.17, 0.35, [-3.6, 0.55, pz], { base: true, seg: 7 });
  // windbreak bushes
  for (const x of [-6.5, 6.5]) k.ico(PAL.bush, 0.9, [x, 0.6, d / 2 - 0.4], { jitter: 0.2, seed: 46 + x, scale: [1, 0.8, 1], jit: 0.1 });
  g.add(k.mesh('body'));
  return g;
}

/** Rustic post-and-rail ranch fence, 4 m along X. */
export function buildFenceWood(variant = 0) {
  const v = ((variant % 2) + 2) % 2;
  const g = root('fence_wood', v, { w: 4, h: 1.3, l: 0.3 });
  const k = new Kit(47 + v); k.floor = 0;
  const r = rng(48 + v);
  for (const x of [-1.95, 0]) k.box(PAL.woodDark, [0.16, 1.3 + r() * 0.1, 0.16], [x, 0, 0], { base: true, rot: [0, r() * 0.3, (r() - 0.5) * 0.06] });
  for (const y of v ? [0.55, 1.1] : [0.4, 0.8, 1.15]) {
    const tilt = (r() - 0.5) * 0.05;
    k.box(r() < 0.3 ? PAL.woodGrey : PAL.wood, [4.05, 0.12, 0.07], [0, y, 0.1], { rot: [0, 0, tilt] });
  }
  if (v === 1) k.cyl('#5a5852', 0.008, 0.008, 4, [0, 0.82, 0.1], { axis: 'x', seg: 3 }); // barbed wire
  k.blob(PAL.hayDark, 0.4, [-1.95, 0.015, 0.1], { seg: 6, seed: 49, off: 0 });
  g.add(k.mesh('body'));
  return g;
}

/** Farm windpump. Wheel faces +Z; the `blades` child spins about its local Z axis (rotation.z). */
export function buildWindmill(variant = 0) {
  const g = root('windmill', variant, { w: 4, h: 12.5, l: 4 });
  const k = new Kit(50); k.floor = 0;
  const steel = '#8f948f', H = 10;
  const b = 1.6, t = 0.35;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const dx = (t - b) * sx, dz = (t - b) * sz;
    const len = Math.hypot(H, dx, dz);
    k.at([sx * (b + t) / 2, H / 2, sz * (b + t) / 2], [Math.atan2(-dz, H) * -1, 0, Math.atan2(dx, H) * -1], () => k.box(steel, [0.09, len, 0.09], [0, 0, 0]));
  }
  // cross braces: horizontal rings at a few heights
  for (const y of [2.5, 5, 7.5]) {
    const s = b - (b - t) * (y / H);
    for (const [ax, w_, x, z] of [['x', 2 * s, 0, s], ['x', 2 * s, 0, -s], ['z', 2 * s, s, 0], ['z', 2 * s, -s, 0]]) k.box(steel, ax === 'x' ? [w_, 0.06, 0.06] : [0.06, 0.06, w_], [x, y, z]);
  }
  k.box('#5f6064', [0.8, 0.5, 0.9], [0, H + 0.25, 0], { c: 0.05 });
  // tail vane (sticks out back, −Z)
  k.box(steel, [0.06, 0.06, 2.6], [0, H + 0.35, -1.5]);
  k.extrude('#c9c3b5', [[-3.4, H - 0.1], [-2.6, H + 0.1], [-2.6, H + 0.9], [-3.4, H + 1.2]], 0.04, { axis: 'x' });
  k.cyl('#5f6064', 0.03, 0.03, 10, [0.2, 0, 0], { base: true, seg: 4 }); // pump rod
  // stock tank + trough at the base
  k.cyl('#8f948f', 1.4, 1.4, 0.7, [2.2, 0, 1.5], { base: true, seg: 10 });
  k.cyl('#3c4a55', 1.32, 1.32, 0.02, [2.2, 0.62, 1.5], { seg: 10 });
  g.add(k.mesh('body'));
  // blades: wheel of 14 sail blades
  const bk = new Kit(51);
  bk.cyl('#3a3b3d', 0.15, 0.15, 0.3, [0, 0, 0], { axis: 'z', seg: 8 });
  bk.torus(steel, 1.65, 0.03, [0, 0, 0.05], { rs: 3, ts: 14 });
  bk.torus(steel, 0.75, 0.03, [0, 0, 0.05], { rs: 3, ts: 12 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    bk.at([0, 0, 0.05], [0, 0, a], () => bk.box(i % 2 ? '#c9c3b5' : '#b9b3a5', [0.32, 1.2, 0.02], [0, 1.15, 0], { rot: [0, 0.45, 0] }));
  }
  const blades = new THREE.Object3D();
  blades.name = 'blades';
  blades.position.set(0, H + 0.3, 0.6);
  blades.add(bk.mesh('blades_mesh'));
  g.add(blades);
  return g;
}

/** Wooden power pole. Wires run along local X; crossarm along Z. userData.wireAttach = local points. */
export function buildPowerpole(variant = 0) {
  const v = ((variant % 2) + 2) % 2;
  const g = root('powerpole', v, { w: 0.5, h: 9.6, l: 2.6 });
  const k = new Kit(52 + v); k.floor = 0;
  const wood = '#6f5a44';
  k.cyl(wood, 0.13, 0.17, 9.4, [0, 0, 0], { base: true, seg: 6, rot: [0, 0, v ? 0.02 : -0.015] });
  k.box(wood, [0.16, 0.16, 2.6], [0, 8.6, 0]);
  k.box(wood, [0.06, 0.06, 1.3], [0, 8.2, 0.45], { rot: [0.9, 0, 0] });
  k.box(wood, [0.06, 0.06, 1.3], [0, 8.2, -0.45], { rot: [-0.9, 0, 0] });
  const attach = [];
  for (const z of [-1.15, 0, 1.15]) {
    const y = z === 0 ? 9.45 : 8.68;
    if (z === 0) k.box(wood, [0.08, 0.6, 0.08], [0, 9.1, 0]);
    k.cyl('#7a8f86', 0.06, 0.08, 0.2, [0, y, z], { base: true, seg: 6 });
    attach.push([0, y + 0.2, z]);
  }
  if (v === 1) { // transformer can
    k.cyl('#8f948f', 0.3, 0.3, 0.9, [0.38, 6.6, 0], { base: true, seg: 8 });
    k.cyl('#6f746f', 0.32, 0.32, 0.06, [0.38, 7.5, 0], { base: true, seg: 8 });
  }
  for (let y = 2.5; y < 7; y += 0.45) k.box('#7a7f83', [0.06, 0.03, 0.24], [0.15, y, 0], { rot: [0, Math.PI / 2, 0] }); // climbing pegs
  k.box('#e2b93b', [0.02, 0.3, 0.16], [0.16, 1.6, 0]); // tag
  g.add(k.mesh('body'));
  g.userData.wireAttach = attach;
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// DESERT / CANYON
// ═════════════════════════════════════════════════════════════════════════════
export function buildCactus(variant = 0) {
  const v = ((variant % 3) + 3) % 3;
  const H = [6.0, 4.5, 7.2][v];
  const g = root('cactus', v, { w: 3, h: H + 0.3, l: 1.2 });
  const k = new Kit(60 + v); k.floor = 0;
  const c = [PAL.cactus, '#6a8550', '#587347'][v];
  const ribs = (x, y, z, r, h) => { for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; k.box(shade(c, i % 2 ? 0.85 : 1.08), [0.05, h * 0.92, 0.05], [x + Math.cos(a) * r, y + h * 0.5, z + Math.sin(a) * r]); } };
  const trunkR = [0.38, 0.33, 0.42][v];
  k.cyl(c, trunkR * 0.92, trunkR, H, [0, 0, 0], { base: true, seg: 8 });
  k.lathe(c, [[trunkR * 0.92, 0], [trunkR * 0.7, trunkR * 0.5], [0.0, trunkR * 0.75]], 8, [0, H, 0]);
  ribs(0, 0, 0, trunkR * 0.95, H);
  const arm = (side, y0, out, up, r) => {
    const x = side * (trunkR + out / 2);
    k.cyl(c, r, r, out + trunkR, [side * (trunkR + out) / 2, y0, 0], { axis: 'x', seg: 7 });
    k.cyl(c, r, r, up, [side * (trunkR + out), y0, 0], { base: true, seg: 7 });
    k.lathe(c, [[r, 0], [r * 0.6, r * 0.5], [0, r * 0.7]], 7, [side * (trunkR + out), y0 + up, 0]);
    k.ico(c, r, [side * (trunkR + out), y0, 0], { seed: 61 });
    void x;
  };
  if (v === 0) { arm(1, 2.4, 0.7, 2.0, 0.26); arm(-1, 3.2, 0.6, 1.6, 0.24); }
  if (v === 1) { arm(1, 1.8, 0.6, 1.4, 0.24); }
  if (v === 2) { arm(1, 3.0, 0.8, 2.6, 0.3); arm(-1, 2.2, 0.7, 2.4, 0.28); arm(-1, 4.4, 0.5, 1.2, 0.22); }
  // flowers + base scrub + a prickly pear pad cluster
  for (let i = 0; i < 3; i++) k.box(i % 2 ? '#e9e2cf' : '#e8b8c8', [0.12, 0.08, 0.12], [Math.cos(i * 2) * 0.15, H + trunkR * 0.7, Math.sin(i * 2) * 0.15], { c: 0.02 });
  k.blob(PAL.sandDark, 1.2, [0, 0.015, 0], { seg: 9, seed: 62 + v, off: 0 });
  if (v === 1) for (let i = 0; i < 4; i++) k.ico('#7a9858', 0.3, [0.9 + (i % 2) * 0.3, 0.3 + Math.floor(i / 2) * 0.45, 0.5], { scale: [1, 1.2, 0.35], rot: [0, 0.4, (i - 1.5) * 0.4], seed: 63 + i });
  g.add(k.mesh('body'));
  return g;
}

export function buildRockBig(variant = 0) {
  const v = ((variant % 3) + 3) % 3;
  const g = root('rock_big', v, { w: 9, h: 6, l: 8 });
  const k = new Kit(65 + v); k.floor = 0;
  const cols = [[PAL.rock, PAL.rockDark], [PAL.rockRed, '#8f4a2e'], [PAL.rockGrey, '#6f6a60']][v];
  const r = rng(66 + v);
  const n = 4;
  for (let i = 0; i < n; i++) {
    const rad = i === 0 ? 3.0 : 1.2 + r() * 1.4;
    const a = r() * Math.PI * 2, d = i === 0 ? 0 : 2.5 + r() * 1.2;
    k.ico(i % 2 ? cols[1] : cols[0], rad, [Math.cos(a) * d, rad * 0.55, Math.sin(a) * d], { detail: i === 0 ? 1 : 0, jitter: 0.2, seed: 67 + i + v * 10, scale: [1.1, i === 0 ? 0.8 + v * 0.15 : 0.75, 1], flatBottom: -rad * 0.5, jit: 0.12 });
  }
  // sun-bleached cap + desert varnish streak
  k.ico(mix(cols[0], '#efe0c0', 0.3), 1.6, [0.2, 2.9 + v * 0.4, 0.1], { scale: [1.3, 0.3, 1.1], seed: 68, jitter: 0.15 });
  k.blob(PAL.sandDark, 4.5, [0, 0.015, 0], { seg: 11, seed: 69 + v, off: 0 });
  g.add(k.mesh('body'));
  return g;
}

/** Loft stacked rings into a stepped mesa. rings: [{y, pts:[[x,z]...]}]. Colour by y band. */
function loft(k, rings, colorAt) {
  for (let j = 0; j < rings.length - 1; j++) {
    const A = rings[j], B = rings[j + 1], n = A.pts.length;
    const cxz = A.pts.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n], [0, 0]);
    for (let i = 0; i < n; i++) {
      const a = A.pts[i], b = A.pts[(i + 1) % n], c = B.pts[(i + 1) % n], d = B.pts[i];
      const q = [[a[0], A.y, a[1]], [b[0], A.y, b[1]], [c[0], B.y, c[1]], [d[0], B.y, d[1]]];
      const mx = (a[0] + b[0] + c[0] + d[0]) / 4 - cxz[0], mz = (a[1] + b[1] + c[1] + d[1]) / 4 - cxz[1];
      const ml = Math.hypot(mx, mz) || 1;
      k.poly(colorAt((A.y + B.y) / 2, A.y === B.y), q, { facing: [mx / ml, 0.5, mz / ml], jit: 0.06 });
    }
  }
}
function strata(y, ledge, palette = PAL.canyon) {
  if (ledge) return mix(palette[4], '#e8d0a8', 0.35);
  const i = Math.floor(y / 3.2);
  return palette[((i % palette.length) + palette.length) % palette.length];
}

export function buildMesa(variant = 0) {
  const v = ((variant % 3) + 3) % 3;
  const W = [60, 44, 78][v], D = W * 0.55, H = [26, 32, 22][v];
  const g = root('mesa', v, { w: W * 1.15, h: H, l: D * 1.2 });
  const k = new Kit(70 + v); k.floor = 0;
  const r = rng(71 + v);
  const n = 14;
  const base = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const f = 0.8 + r() * 0.3;
    base.push([Math.cos(a) * W / 2 * f, Math.sin(a) * D / 2 * f]);
  }
  const ring = (scale, jitter) => base.map(([x, z]) => [x * scale + (r() - 0.5) * jitter, z * scale + (r() - 0.5) * jitter]);
  const talus = ring(1.18, 2), foot = ring(1.0, 0), l1 = ring(0.97, 1), l2 = ring(0.9, 1), l3 = ring(0.84, 1), top = ring(0.8, 0.5);
  const h1 = H * 0.4, h2 = H * 0.72;
  const rings = [
    { y: 0, pts: talus }, { y: H * 0.12, pts: foot },
    { y: H * 0.25, pts: l1 }, { y: h1, pts: l1.map(([x, z]) => [x * 0.99, z * 0.99]) },
    { y: h1, pts: l2 }, { y: H * 0.56, pts: l2.map(([x, z]) => [x * 0.99, z * 0.99]) }, { y: h2, pts: l2.map(([x, z]) => [x * 0.98, z * 0.98]) },
    { y: h2, pts: l3 }, { y: H * 0.86, pts: l3.map(([x, z]) => [x * 0.99, z * 0.99]) }, { y: H, pts: top },
  ];
  const pal = v === 2 ? ['#c9875a', '#d9a476', '#b8704a', '#e0b68a', '#c27a50'] : PAL.canyon;
  loft(k, rings, (y, ledge) => (y < H * 0.12 ? mix(pal[3], PAL.sand, 0.4) : strata(y, ledge, pal)));
  k.top(mix(pal[4], '#e8d0a8', 0.4), H, top.map(([x, z]) => [x, z]), { off: 0, jit: 0.04 });
  // a few fallen boulders on the talus
  for (let i = 0; i < 6; i++) { const p = talus[Math.floor(r() * n)]; k.ico(pal[i % pal.length], 1.2 + r() * 1.8, [p[0] * 0.92, 0.6, p[1] * 0.92], { seed: 72 + i, jitter: 0.2, flatBottom: -0.4 }); }
  g.add(k.mesh('body', undefined, false));
  return g;
}

export function buildShack(variant = 0) {
  const g = root('shack', variant, { w: 6, h: 4.2, l: 6 });
  const k = new Kit(75); k.floor = 0;
  const wall = '#9a8a72', tin = PAL.corrugated;
  k.at([0, 0, 0], [0, 0, 0.015], () => {
    k.box(wall, [4.6, 2.8, 3.8], [0, 0, 0], { base: true, c: 0.03 });
    const F = walls(4.6, 3.8);
    for (const f of Object.values(F)) planks(k, f, 0.0, 2.8, wall, 0.3, 76);
    // corrugated lean-to roof (slopes to the back)
    k.box(tin, [5.4, 0.08, 4.8], [0, 3.0, 0.2], { rot: [-0.14, 0, 0] });
    for (let x = -2.6; x <= 2.6; x += 0.3) k.box(shade(tin, 0.85), [0.06, 0.04, 4.8], [x, 3.06, 0.2], { rot: [-0.14, 0, 0] });
    k.box(mix(tin, PAL.rust, 0.6), [1.6, 0.03, 1.6], [1.2, 3.1, -0.6], { rot: [-0.14, 0, 0] });
    // door + boarded window + broken window
    wr(k, F.front, [-1.6, -0.6], [0.0, 2.1], '#5e4632', 0.02);
    wr(k, F.front, [0.6, 1.7], [1.1, 1.9], '#262a2c', 0.02);
    for (const yy of [1.25, 1.55]) k.box(PAL.woodLight, [1.3, 0.12, 0.04], [1.15, yy, 1.94], { rot: [0, 0, yy > 1.4 ? 0.2 : -0.15] });
    wr(k, F.left, [-0.6, 0.6], [1.2, 1.9], '#2f3a42', 0.02);
    // porch with a bench
    k.box(PAL.woodGrey, [4.6, 0.15, 1.4], [0, 0.05, 2.6], { base: true });
    for (const x of [-2.2, 2.2]) k.box(PAL.woodDark, [0.12, 2.6, 0.12], [x, 0.2, 3.2], { base: true });
    k.box(tin, [5.0, 0.06, 1.8], [0, 2.75, 2.7], { rot: [0.2, 0, 0] });
    // stovepipe with a cap
    k.cyl('#4a4846', 0.1, 0.1, 1.4, [-1.4, 2.9, -0.8], { base: true, seg: 6, rot: [0, 0, 0.08] });
    k.cone('#4a4846', 0.2, 0.15, [-1.32, 4.35, -0.8], { seg: 6 });
  });
  // junk: barrel, tyre, old sign
  k.cyl('#8e5030', 0.32, 0.32, 0.9, [2.8, 0, 1.0], { base: true, seg: 8 });
  k.torus(PAL.tyre, 0.32, 0.12, [-2.8, 0.12, 1.6], { rot: [Math.PI / 2, 0, 0], rs: 4, ts: 8 });
  k.blob(PAL.sandDark, 3.5, [0, 0.015, 0.5], { seg: 10, seed: 77, off: 0 });
  g.add(k.mesh('body'));
  return g;
}

const ADS = [
  {
    key: 'ad_diner', bg: '#e9dcc0',
    draw: (ctx, W, H) => {
      ctx.fillStyle = '#b8452f'; ctx.fillRect(0, 0, W, H * 0.16); ctx.fillRect(0, H * 0.84, W, H * 0.16);
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#2f2a26'; fitText(ctx, "DUSTY'S DINER", W * 0.05, H * 0.36, W * 0.6, 120);
      ctx.fillStyle = '#b8452f'; fitText(ctx, 'PIE 99¢', W * 0.05, H * 0.64, W * 0.5, 130);
      ctx.fillStyle = '#efe6cf'; ctx.font = '700 40px Arial, sans-serif'; ctx.fillText('NEXT EXIT · OPEN 24 HRS · COFFEE THAT FIGHTS BACK', W * 0.05, H * 0.92);
      // the pie
      const cx = W * 0.82, cy = H * 0.5, r = H * 0.27;
      ctx.fillStyle = '#c98a3a'; ctx.beginPath(); ctx.arc(cx, cy, r, 0.5, Math.PI * 2 - 0.1); ctx.lineTo(cx, cy); ctx.fill();
      ctx.fillStyle = '#e2b25a'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.82, 0.5, Math.PI * 2 - 0.1); ctx.lineTo(cx, cy); ctx.fill();
      ctx.strokeStyle = '#9a6a2a'; ctx.lineWidth = 6; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(cx - r * 0.7, cy - r * 0.6 + i * r * 0.3); ctx.lineTo(cx + r * 0.7, cy - r * 0.6 + i * r * 0.3); ctx.stroke(); }
      ctx.fillStyle = '#c98a3a'; ctx.beginPath(); ctx.moveTo(cx + r * 0.25, cy + r * 0.05); ctx.arc(cx + r * 0.25, cy + r * 0.05, r * 0.9, 0.1, 0.45); ctx.fill();
      ctx.fillStyle = '#efe6cf'; ctx.font = '900 34px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('~ fresh-ish ~', cx, cy + r + 40);
    },
  },
  {
    key: 'ad_lastgas', bg: '#2f4a5a',
    draw: (ctx, W, H) => {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e9c45a'; fitText(ctx, 'LAST CHANCE GAS', W * 0.5, H * 0.3, W * 0.9, 140);
      ctx.fillStyle = '#efe6cf'; fitText(ctx, '40 MI', W * 0.36, H * 0.66, W * 0.4, 170);
      ctx.fillStyle = '#e9c45a'; ctx.beginPath(); ctx.moveTo(W * 0.66, H * 0.52); ctx.lineTo(W * 0.86, H * 0.66); ctx.lineTo(W * 0.66, H * 0.8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c9d6d9'; ctx.font = '700 40px Arial, sans-serif'; ctx.fillText('COLD DRINKS · ICE · BAIT · REGRETS', W * 0.5, H * 0.92);
    },
  },
  {
    key: 'ad_lizard', bg: '#d9c48a',
    draw: (ctx, W, H) => {
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#3a4a2a'; fitText(ctx, 'SEE THE GIANT LIZARD!', W * 0.04, H * 0.22, W * 0.92, 110);
      ctx.fillStyle = '#7a2e22'; fitText(ctx, "IT'S REAL*", W * 0.04, H * 0.5, W * 0.42, 120);
      ctx.fillStyle = '#3a3026'; ctx.font = '700 44px Arial, sans-serif'; ctx.fillText('12 MI · GIFT SHOP', W * 0.04, H * 0.72);
      ctx.font = 'italic 700 30px Arial, sans-serif'; ctx.fillText('*mostly fiberglass', W * 0.04, H * 0.88);
      // lizard silhouette
      ctx.fillStyle = '#4f7a3a';
      const cx = W * 0.74, cy = H * 0.6;
      ctx.beginPath(); ctx.ellipse(cx, cy, W * 0.13, H * 0.1, -0.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + W * 0.15, cy - H * 0.05, W * 0.05, H * 0.06, 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx - W * 0.12, cy); ctx.quadraticCurveTo(cx - W * 0.26, cy + H * 0.02, cx - W * 0.24, cy - H * 0.2); ctx.lineWidth = 22; ctx.strokeStyle = '#4f7a3a'; ctx.stroke();
      for (const [dx, dy] of [[-0.07, 0.1], [0.07, 0.1], [-0.05, -0.1], [0.08, -0.09]]) { ctx.beginPath(); ctx.ellipse(cx + W * dx, cy + H * dy, W * 0.018, H * 0.07, dx, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#1d1b1a'; ctx.beginPath(); ctx.arc(cx + W * 0.17, cy - H * 0.07, 7, 0, Math.PI * 2); ctx.fill();
    },
  },
];

export function buildBillboard(variant = 0) {
  const v = ((variant % ADS.length) + ADS.length) % ADS.length;
  const g = root('billboard', v, { w: 10.5, h: 8.5, l: 1.4 });
  const k = new Kit(80 + v); k.floor = 0;
  const W = 10, H = 4.4, y0 = 3.6;
  for (const x of [-3.2, 3.2]) {
    k.box(PAL.woodDark, [0.35, y0 + H, 0.35], [x, 0, -0.25], { base: true, rot: [0, 0, (v - 1) * 0.01] });
    k.box(PAL.woodDark, [0.2, 3.8, 0.2], [x, 1.6, -1.0], { rot: [0.5, 0, 0] });
  }
  k.box('#6a5a48', [W + 0.4, H + 0.4, 0.2], [0, y0 + H / 2, -0.1], { c: 0.03 });
  k.box('#4a4038', [W, 0.15, 0.9], [0, y0 - 0.1, 0.25]); // catwalk
  for (let i = 0; i < 3; i++) k.box('#3a3836', [0.12, 0.5, 0.12], [-3 + i * 3, y0 + H + 0.35, 0.4], { rot: [0.6, 0, 0] }); // lamps
  k.box('#3a3836', [0.06, 3.6, 0.06], [3.8, 0, -0.5], { base: true }); // ladder rail
  g.add(k.mesh('body'));
  const tex = signTexture({ ...ADS[v], w: 1024, h: 450 });
  mountSign(g, tex, W, H, [0, y0 + H / 2, 0.01], 0, '#d9cfb3', 'ad');
  return g;
}

/** Canyon wall segment ~40 m along X, cliff face toward +Z. */
export function buildCanyonWall(variant = 0) {
  const v = ((variant % 3) + 3) % 3;
  const Hmax = [32, 45, 25][v];
  const g = root('canyon_wall', v, { w: 42, h: Hmax, l: 22 });
  const k = new Kit(85 + v); k.floor = 0;
  const r = rng(86 + v);
  const L = 40, n = 5, cw = L / n;
  const levels = []; for (let y = 3.2; y < Hmax + 1; y += 3.2) levels.push(y);
  const colorFn = (cx, cy, cz, nx, ny) => (ny > 0.55 ? mix(PAL.canyon[4], '#e8d0a8', 0.3) : strata(cy, false));
  for (let i = 0; i < n; i++) {
    const H = Hmax * (0.72 + r() * 0.28);
    const f = (r() - 0.5) * 3; // front jag
    const D = 16 + r() * 4;
    const h1 = H * (0.35 + r() * 0.15), h2 = H * (0.68 + r() * 0.12);
    const s1 = 1.2 + r() * 1.6, s2 = 1.0 + r() * 1.4;
    const prof = [
      [-D, 0], [f + 1.5, 0], [f + 0.8, h1 * 0.5], [f, h1], [f - s1, h1 + 0.3], [f - s1 - 0.6, h2], [f - s1 - s2, h2 + 0.3], [f - s1 - s2 - 0.8, H], [-D, H - 0.5],
    ];
    const pts = insertLevels(prof, levels);
    const x = -L / 2 + (i + 0.5) * cw + (r() - 0.5) * 1.2;
    k.extrude(colorFn, pts, cw + 1.2, { axis: 'x', pos: [x, 0, 0], jit: 0.05 });
  }
  // talus boulders along the base
  for (let i = 0; i < 7; i++) k.ico(PAL.canyon[i % 6], 1.0 + r() * 1.6, [-L / 2 + 3 + i * 5.6 + r() * 2, 0.6, 2.2 + r() * 1.5], { seed: 87 + i, jitter: 0.22, flatBottom: -0.5, jit: 0.1 });
  k.blob(mix(PAL.canyon[3], PAL.sand, 0.4), 6, [0, 0.015, 3.5], { seg: 12, seed: 88, sx: 3.4, sz: 0.5, off: 0 });
  g.add(k.mesh('body', undefined, true));
  return g;
}

export function buildWarningSign(variant = 0) {
  const v = ((variant % 2) + 2) % 2;
  const g = root('warning_sign', v, { w: 1.8, h: 3.2, l: 0.3 });
  const k = new Kit(90); k.floor = 0;
  for (const x of v ? [-0.8, 0.8] : [0]) k.box('#8f948f', [0.08, 3.0, 0.08], [x, 0, -0.06], { base: true });
  k.blob(PAL.sandDark, 0.6, [0, 0.015, 0], { seg: 7, seed: 91, off: 0 });
  // back panel (steel) so the sign has thickness
  if (v === 0) k.box('#8f948f', [1.25, 1.25, 0.03], [0, 2.4, -0.035], { rot: [0, 0, Math.PI / 4] });
  else k.box('#8f948f', [2.0, 1.2, 0.03], [0, 2.3, -0.035]);
  g.add(k.mesh('body'));
  if (v === 0) {
    const tex = signTexture({
      key: 'sign_bridgeout', w: 512, h: 512, bg: 'rgba(0,0,0,0)', weather: true,
      draw: (ctx, W, H) => {
        ctx.clearRect(0, 0, W, H);
        ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#1f1e1c'; ctx.fillRect(-176, -176, 352, 352);
        ctx.fillStyle = '#e2b93b'; ctx.fillRect(-164, -164, 328, 328);
        ctx.restore();
        ctx.fillStyle = '#1f1e1c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        fitText(ctx, 'BRIDGE', W / 2, H * 0.44, W * 0.5, 90);
        fitText(ctx, 'OUT', W / 2, H * 0.6, W * 0.5, 100);
        // bullet dings
        ctx.fillStyle = '#5a5a58'; for (const [x, y] of [[0.62, 0.32], [0.38, 0.7]]) { ctx.beginPath(); ctx.arc(W * x, H * y, 7, 0, Math.PI * 2); ctx.fill(); }
      },
    });
    const p = signPanel(tex, 1.8, 1.8, '#e2b93b', 'sign');
    p.material.transparent = !!tex; p.material.alphaTest = tex ? 0.5 : 0;
    p.position.set(0, 2.4, 0.0);
    g.add(p);
  } else {
    const tex = textSign('sign_noreally', [
      { text: 'BRIDGE OUT', y: 0.33, px: 110, color: '#1f1e1c' },
      { text: 'NO, REALLY.', y: 0.72, px: 80, color: '#9c3a2e' },
    ], { bg: '#e2b93b', border: '#1f1e1c', borderW: 12 });
    mountSign(g, tex, 1.95, 1.15, [0, 2.3, 0.0]);
  }
  return g;
}

export { textSign, mountSign, walls, wr, windowGrid, band, parapet, gableRoof, hipRoof, houseWindow, houseDoor, planks, gambrel, siding, strata, loft };
