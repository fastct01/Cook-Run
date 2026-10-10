// ─────────────────────────────────────────────────────────────────────────────
// City Areas expansion — shared modelling helpers (art agent: city).
// Thin layer over models/kit.js + the wall painters exported by models/scenery.js:
// face-aligned boxes, beams/trusses, corrugation, roll doors, industrial windows,
// fire escapes, rooftop clutter, and the CanvasTexture painters (hand-painted
// signs, neon, murals, chain-link). Deterministic: every random draw uses rng().
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Kit, root, rng, empty, signTexture, signPanel, fitText, hashStr, HAS_DOM, mat } from '../models/kit.js';
import { PAL, mix, shade, vcolMaterial } from '../palette.js';
import { walls, wr, windowGrid, band, parapet, textSign, mountSign, planks } from '../models/scenery.js';

export { THREE, Kit, root, rng, empty, signTexture, signPanel, fitText, hashStr, HAS_DOM, mat, PAL, mix, shade, vcolMaterial, walls, wr, windowGrid, band, parapet, textSign, mountSign, planks };

export const TAU = Math.PI * 2;
export const vwrap = (v, n) => ((Math.floor(+v || 0) % n) + n) % n;

// ── muted, sun-bleached city palette ─────────────────────────────────────────
export const C = Object.freeze({
  brick: '#9a5844', brickRed: '#a25a44', brickDark: '#76402f', brickTan: '#b98d66', brickBuff: '#c7aa80', brickBrown: '#7e5240',
  brickPaint: '#d9c9a6', mortar: '#c9bfa8', lintel: '#cfc5ae', stone: '#c3b89f', stoneDark: '#9d927c',
  concrete: '#aaa69c', concreteDark: '#85827a', concreteLight: '#c4c0b5', asphalt: '#4a4b4e',
  iron: '#2a2b2d', ironLight: '#3c3e41', steel: '#8f969a', steelDark: '#5d6367', galv: '#a9aca7', rust: '#8e5030', rustDark: '#6a3820',
  tin: '#a9a79c', glass: '#2f3a42', glassB: '#36424a', glassBlue: '#41606c', glassTeal: '#4a6b6b', lit: '#efcd7e', litCool: '#d8e2df',
  teal: '#4f8f8a', tealDeep: '#3b6f6b', mustard: '#d9a83a', rustRed: '#9c4a32', cream: '#e9e2cf', offWhite: '#e2dccb',
  safety: '#d7a93a', navy: '#2c3a52', green: '#4f6b4a', patina: '#6f9a8a', copper: '#a86a42', wood: '#8a6a4a', woodLight: '#b5976f', woodDark: '#5e4632',
  dirt: '#6e5c46', soot: '#2b2826', grime: '#5b4f43', water: '#3c5560',
  civ: PAL.civ,
});

// ── face helpers (faces come from scenery `walls()`: {axis, at, dir, u:[u0,u1]}) ─
/** Point on face f at (u along the face, y), pushed `out` metres along its outward normal. */
export function fp(f, u, y, out = 0) { return f.axis === 'z' ? [u, y, f.at + f.dir * out] : [f.at + f.dir * out, y, u]; }
/** Box aligned with face f: du along the face, dy tall, dOut deep, centred `out` metres in front of the wall. */
export function fbox(k, color, f, u, y, du, dy, dOut, out, o = {}) {
  const p = fp(f, u, y, out);
  return k.box(color, f.axis === 'z' ? [du, dy, dOut] : [dOut, dy, du], p, o);
}
/** Arbitrary 2D polygon [[u, y], …] painted on face f. */
export function wpoly(k, f, pts, color, off = 0.02) {
  const map = f.axis === 'z' ? (u, y) => [u, y, f.at] : (u, y) => [f.at, y, u];
  return k.flat(color, pts, map, { facing: f.axis === 'z' ? [0, 0, f.dir] : [f.dir, 0, 0], off });
}
/** Polygon for an arch-topped opening (segmental when rise < half width). */
export function archPts(u0, u1, y0, y1, rise, seg = 6) {
  const pts = [[u0, y0], [u1, y0], [u1, y1]];
  const cu = (u0 + u1) / 2, hw = (u1 - u0) / 2;
  for (let i = 1; i < seg; i++) {
    const t = i / seg, a = Math.PI * t;
    pts.push([cu + Math.cos(a) * hw, y1 + Math.sin(a) * rise]);
  }
  pts.push([u0, y1]);
  return pts;
}

// ── structural helpers ───────────────────────────────────────────────────────
const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
/** Square-section member from a to b (t = size or [tw, td]). */
export function beam(k, color, a, b, t = 0.2, o = {}) {
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const L = _d.length();
  if (L < 1e-4) return k;
  _d.divideScalar(L);
  _q.setFromUnitVectors(_up, _d);
  _e.setFromQuaternion(_q, 'XYZ');
  const tw = Array.isArray(t) ? t[0] : t, td = Array.isArray(t) ? t[1] : t;
  const rot = [_e.x, _e.y, _e.z];
  k.at([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rot, () => k.box(color, [tw, L, td], [0, 0, 0], o));
  return k;
}
/** Round member (pipe, cable, tie rod) from a to b. */
export function rod(k, color, a, b, r = 0.05, seg = 5) {
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const L = _d.length();
  if (L < 1e-4) return k;
  _d.divideScalar(L);
  _q.setFromUnitVectors(_up, _d);
  _e.setFromQuaternion(_q, 'XYZ');
  const rot = [_e.x, _e.y, _e.z];
  k.at([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rot, () => k.cyl(color, r, r, L, [0, 0, 0], { seg, open: true }));
  return k;
}
/**
 * Lattice box-truss along local +X from x=0 to L (section w across Z, h tall, centred on y=0, z=0).
 * Warren diagonals on both vertical faces (+ top face unless o.noTop). Build inside k.at() to orient it.
 */
export function trussX(k, color, L, w, h, n, t = 0.25, o = {}) {
  const ch = o.chord || t;
  for (const y of [-h / 2, h / 2]) for (const z of [-w / 2, w / 2]) k.box(color, [L, ch, ch], [L / 2, y, z]);
  const s = L / n, d = t * 0.55;
  for (let i = 0; i < n; i++) {
    const x0 = i * s, xm = x0 + s / 2, x1 = x0 + s;
    for (const z of [-w / 2, w / 2]) {
      beam(k, color, [x0, -h / 2, z], [xm, h / 2, z], d);
      beam(k, color, [xm, h / 2, z], [x1, -h / 2, z], d);
    }
    if (!o.noTop) beam(k, color, [x0, h / 2, -w / 2], [x1, h / 2, w / 2], d);
  }
  if (o.ends !== false) for (const x of [0, L]) { k.box(color, [ch, h, ch], [x, 0, -w / 2]); k.box(color, [ch, h, ch], [x, 0, w / 2]); }
  return k;
}
/** Railing from a to b (posts every ~1.6 m, top + mid rail). */
export function railing(k, color, a, b, h = 1.05, o = {}) {
  const t = o.t || 0.05;
  const top = (p) => [p[0], p[1] + h, p[2]], mid = (p) => [p[0], p[1] + h * 0.5, p[2]];
  beam(k, color, top(a), top(b), t);
  if (!o.noMid) beam(k, color, mid(a), mid(b), t * 0.8);
  const L = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(1, Math.round(L / (o.step || 1.6)));
  for (let i = 0; i <= n; i++) {
    const tt = i / n, p = [a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt, a[2] + (b[2] - a[2]) * tt];
    k.box(color, [t, h, t], [p[0], p[1] + h / 2, p[2]]);
  }
  return k;
}
/** Vertical ladder on face f at u from y0..y1. */
export function ladder(k, color, f, u, y0, y1, out = 0.2, w = 0.5) {
  for (const s of [-1, 1]) fbox(k, color, f, u + s * w / 2, (y0 + y1) / 2, 0.05, y1 - y0, 0.05, out);
  const n = f.axis === 'z' ? [0, 0, f.dir] : [f.dir, 0, 0];
  for (let y = y0 + 0.3; y < y1; y += 0.4) k.poly(color, [fp(f, u - w / 2, y - 0.025, out), fp(f, u + w / 2, y - 0.025, out), fp(f, u + w / 2, y + 0.025, out), fp(f, u - w / 2, y + 0.025, out)], { facing: n });
  return k;
}
/** Free ladder between two foot points a→b (rails offset by ±side), rungs as quads facing `n`. */
export function ladderAB(k, color, a, b, side, n, step = 0.4) {
  const P = (p, s) => [p[0] + side[0] * s, p[1] + side[1] * s, p[2] + side[2] * s];
  for (const s of [-1, 1]) beam(k, color, P(a, s), P(b, s), 0.05);
  const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), m = Math.floor(L / step);
  for (let i = 1; i < m; i++) {
    const t = i / m, c = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const l = P(c, -1), r = P(c, 1);
    k.poly(color, [[l[0], l[1] - 0.025, l[2]], [r[0], r[1] - 0.025, r[2]], [r[0], r[1] + 0.025, r[2]], [l[0], l[1] + 0.025, l[2]]], { facing: n });
  }
  return k;
}

// ── wall treatments ──────────────────────────────────────────────────────────
/** Vertical corrugation ribs (darker strips) on face f. */
export function ribs(k, f, y0, y1, color, step = 0.6, w = 0.12, f2 = 0.84) {
  const c = shade(color, f2);
  for (let u = f.u[0] + step / 2; u < f.u[1] - 0.05; u += step) wr(k, f, [u - w / 2, u + w / 2], [y0, y1], c, 0.008);
  return k;
}
/** Random drip / rain streaks running down from y1. */
export function streaks(k, f, n, y0, y1, color, seed = 1, w = 0.25) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const u = f.u[0] + 0.5 + r() * (f.u[1] - f.u[0] - 1), top = y1 - r() * (y1 - y0) * 0.3, len = 0.8 + r() * (y1 - y0) * 0.5;
    wr(k, f, [u - w * (0.5 + r()), u + w * (0.5 + r())], [Math.max(y0, top - len), top], color, 0.009);
  }
  return k;
}
/** Patched / repointed brickwork: a few slightly off-colour rectangles. */
export function patches(k, f, n, y0, y1, color, seed = 1) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const w = 0.8 + r() * 2.2, h = 0.5 + r() * 1.4, u = f.u[0] + 0.4 + r() * (f.u[1] - f.u[0] - w - 0.8), y = y0 + r() * (y1 - y0 - h);
    wr(k, f, [u, u + w], [y, y + h], shade(color, r() < 0.5 ? 0.9 : 1.08), 0.008);
  }
  return k;
}
/** Roll-up door painted on face f (frame, slats, bottom bar). */
export function rollDoor(k, f, uc, w, h, color, o = {}) {
  const y0 = o.y0 || 0;
  wr(k, f, [uc - w / 2 - 0.18, uc + w / 2 + 0.18], [y0, y0 + h + 0.25], o.frame || '#3a3b3d', 0.012);
  wr(k, f, [uc - w / 2, uc + w / 2], [y0, y0 + h], color, 0.02);
  const n = Math.round(h / (o.slat || 0.32));
  for (let i = 1; i < n; i++) { const y = y0 + (i / n) * h; wr(k, f, [uc - w / 2, uc + w / 2], [y - 0.025, y + 0.02], shade(color, 0.82), 0.026); }
  wr(k, f, [uc - w / 2, uc + w / 2], [y0, y0 + 0.14], shade(color, 0.6), 0.03);
  if (o.dirt !== false) wr(k, f, [uc - w / 2, uc + w / 2], [y0 + 0.14, y0 + 0.9], mix(color, C.dirt, 0.25), 0.024);
  return k;
}
/** Steel multi-pane industrial window (optionally arch-topped) on face f. */
export function steelWindow(k, f, uc, y0, w, h, o = {}) {
  const aseg = o.archSeg || 6;
  const r = rng(o.seed || 7);
  const cols = o.cols || Math.max(2, Math.round(w / 0.55)), rows = o.rows || Math.max(2, Math.round(h / 0.6));
  if (o.arch) {
    wpoly(k, f, archPts(uc - w / 2 - 0.22, uc + w / 2 + 0.22, y0 - 0.15, y0 + h, o.arch + 0.22, aseg), o.lintel || C.lintel, 0.012);
    wpoly(k, f, archPts(uc - w / 2, uc + w / 2, y0, y0 + h, o.arch, aseg), o.glass || C.glass, 0.02);
  } else {
    if (o.lintel !== false) wr(k, f, [uc - w / 2 - 0.2, uc + w / 2 + 0.2], [y0 + h, y0 + h + 0.3], o.lintel || C.lintel, 0.012);
    if (o.sill !== false) wr(k, f, [uc - w / 2 - 0.12, uc + w / 2 + 0.12], [y0 - 0.14, y0], o.sillColor || C.lintel, 0.014);
    wr(k, f, [uc - w / 2, uc + w / 2], [y0, y0 + h], o.glass || C.glass, 0.02);
  }
  // odd panes: lit, cloudy, or broken/boarded
  for (let i = 0; i < Math.max(1, Math.round(cols * rows * (o.odd ?? 0.12))); i++) {
    const cx = Math.floor(r() * cols), cy = Math.floor(r() * rows);
    const a = uc - w / 2 + cx * w / cols, b = a + w / cols, ya = y0 + cy * h / rows;
    const col = r() < (o.lit ?? 0.35) ? (o.litColor || C.lit) : r() < 0.5 ? '#6d7a7c' : '#4d585c';
    wr(k, f, [a, b], [ya, ya + h / rows], col, 0.024);
  }
  const bar = o.bar || '#25282a';
  for (let i = 1; i < cols; i++) { const u = uc - w / 2 + (i / cols) * w; wr(k, f, [u - 0.035, u + 0.035], [y0, y0 + h], bar, 0.03); }
  for (let j = 1; j < rows; j++) { const y = y0 + (j / rows) * h; wr(k, f, [uc - w / 2, uc + w / 2], [y - 0.03, y + 0.03], bar, 0.03); }
  return k;
}
/** Black steel fire escape on face f centred at u: landings per floor, stair runs, drop ladder. */
export function fireEscape(k, f, u, floors, fh, o = {}) {
  const col = o.color || C.iron, w = o.width || 3.4, dep = o.depth || 1.1, y0 = o.y0 ?? fh;
  for (let i = 0; i < floors; i++) {
    const y = y0 + i * fh;
    fbox(k, col, f, u, y, w, 0.07, dep, dep / 2);
    // railing: front rail + a see-through panel suggestion + end frames
    fbox(k, col, f, u, y + 0.95, w, 0.05, 0.05, dep);
    const n = f.axis === 'z' ? [0, 0, f.dir] : [f.dir, 0, 0];
    k.poly(col, [fp(f, u - w / 2, y + 0.45, dep), fp(f, u + w / 2, y + 0.45, dep), fp(f, u + w / 2, y + 0.5, dep), fp(f, u - w / 2, y + 0.5, dep)], { facing: n });
    for (let j = 1; j < 6; j++) k.poly(col, [fp(f, u - w / 2 + j * w / 6 - 0.02, y, dep), fp(f, u - w / 2 + j * w / 6 + 0.02, y, dep), fp(f, u - w / 2 + j * w / 6 + 0.02, y + 0.95, dep), fp(f, u - w / 2 + j * w / 6 - 0.02, y + 0.95, dep)], { facing: n });
    for (const s of [-1, 1]) fbox(k, col, f, u + s * w / 2, y + 0.48, 0.05, 0.95, 0.05, dep);
    // stair run down to the landing below (alternating direction)
    if (i > 0 || o.ground) {
      const s = i % 2 ? 1 : -1, yb = i > 0 ? y - fh : 0;
      const a = fp(f, u + s * (w / 2 - 0.35), y, dep * 0.5), b = fp(f, u - s * (w / 2 - 0.5), yb + 0.1, dep * 0.5);
      beam(k, col, a, b, [0.5, 0.06]);
      beam(k, col, [a[0], a[1] + 0.9, a[2]], [b[0], b[1] + 0.9, b[2]], 0.04);
    }
  }
  if (!o.ground) { // drop ladder hanging below the first landing (o.drop = length, default 2.6)
    const dl = o.drop ?? 2.6;
    for (const s of [-1, 1]) fbox(k, col, f, u + w / 2 - 0.5 + s * 0.22, y0 - dl / 2, 0.04, dl, 0.04, dep - 0.2);
    for (let y = y0 - dl + 0.2; y < y0; y += 0.4) fbox(k, col, f, u + w / 2 - 0.5, y, 0.44, 0.03, 0.03, dep - 0.2);
  }
  return k;
}

// ── roof clutter ─────────────────────────────────────────────────────────────
export function acUnit(k, x, y, z, s = 1, rotY = 0, color = '#a9a79e') {
  k.at([x, y, z], [0, rotY, 0], () => {
    k.box(color, [1.6 * s, 0.9 * s, 1.1 * s], [0, 0, 0], { base: true });
    k.cyl('#4c4e50', 0.36 * s, 0.36 * s, 0.05, [0.3 * s, 0.9 * s, 0], { seg: 8 });
    k.box(shade(color, 0.8), [1.62 * s, 0.08, 1.12 * s], [0, 0.55 * s, 0]);
    k.box('#5f6064', [0.12, 0.12, 1.0 * s], [-0.85 * s, 0.25 * s, 0.6 * s], { rot: [0.6, 0, 0] });
  });
  return k;
}
/** Wooden rooftop water tank on a steel stand (the classic city roof silhouette). */
export function roofTank(k, x, y, z, r = 1.4, h = 2.4, legs = 2.0) {
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box('#3a3836', [0.15, legs, 0.15], [x + a * r * 0.62, y, z + b * r * 0.62], { base: true });
  k.box('#3a3836', [r * 1.5, 0.12, r * 1.5], [x, y + legs - 0.1, z], { base: true });
  k.cyl('#7a5a3f', r, r * 1.02, h, [x, y + legs, z], { base: true, seg: 9 });
  for (const t of [0.25, 0.7]) k.cyl('#2f2c29', r * 1.03, r * 1.03, 0.08, [x, y + legs + h * t, z], { seg: 9, open: true });
  k.cone('#4a4038', r * 1.1, r * 0.65, [x, y + legs + h, z], { base: true, seg: 9 });
  k.box('#2f2c29', [0.05, h + legs, 0.05], [x + r + 0.1, y, z], { base: true });
  return k;
}
export function vent(k, x, y, z, h = 1.2, r = 0.22) {
  k.cyl('#7d7f80', r, r, h, [x, y, z], { base: true, seg: 6 });
  k.cone('#5f6064', r * 1.7, r * 1.1, [x, y + h, z], { base: true, seg: 6 });
  return k;
}
export function drum(k, x, z, color, y = 0, o = {}) {
  const r = 0.3, h = 0.88;
  if (o.lying) { k.cyl(color, r, r, h, [x, y + r, z], { axis: o.lying === 'z' ? 'z' : 'x', seg: 8 }); return k; }
  k.cyl(color, r, r, h, [x, y, z], { base: true, seg: 8 });
  k.cyl(shade(color, 0.72), r + 0.012, r + 0.012, 0.05, [x, y + h * 0.33, z], { seg: 8, open: true });
  k.cyl(shade(color, 0.72), r + 0.012, r + 0.012, 0.05, [x, y + h * 0.66, z], { seg: 8, open: true });
  k.cyl(mix(color, C.rust, 0.5), r * 0.98, r * 0.98, 0.012, [x, y + h, z], { seg: 8 });
  return k;
}
export function crate(k, x, y, z, s = 1, color = '#a8865e', rotY = 0) {
  k.at([x, y, z], [0, rotY, 0], () => {
    k.box(color, [1.1 * s, 0.8 * s, 0.8 * s], [0, 0, 0], { base: true, noBottom: true });
    for (const sz of [-1, 1]) {
      k.rectZ(shade(color, 0.78), sz * 0.4 * s, [-0.55 * s, 0.55 * s], [0.36 * s, 0.46 * s], sz, { off: 0.006 });
      for (const sx of [-1, 1]) k.rectZ(shade(color, 0.85), sz * 0.4 * s, [sx * 0.5 * s - 0.05 * s, sx * 0.5 * s + 0.05 * s], [0, 0.8 * s], sz, { off: 0.008 });
    }
  });
  return k;
}
export function pallet(k, x, y, z, rotY = 0, color = '#b49a74') {
  k.at([x, y, z], [0, rotY, 0], () => {
    k.box(color, [1.2, 0.04, 1.0], [0, 0.11, 0], { base: true });
    for (const s of [-1, 0, 1]) k.box(shade(color, 0.85), [1.2, 0.1, 0.12], [0, 0.01, s * 0.42], { base: true });
  });
  return k;
}
export function tyres(k, x, z, n = 4, y = 0) {
  for (let i = 0; i < n; i++) k.torus(PAL.tyre, 0.36, 0.14, [x + (i % 2) * 0.04, y + 0.14 + i * 0.27, z], { rot: [Math.PI / 2, 0, 0], rs: 4, ts: 8 });
  return k;
}
export function lotSlab(k, w, d, color = '#7a7873', cz = 0, o = {}) {
  k.box(color, [w, 0.04, d], [0, 0, cz], { base: true });
  if (o.stripes !== false) for (let i = -3; i <= 3; i++) k.rectY('#d9d4c4', 0.04, [i * 3.2 - 0.06, i * 3.2 + 0.06], [cz + d / 2 - 4.5, cz + d / 2 - 0.6], { off: 0.004 });
  const r = rng(Math.round(w * 13 + d));
  for (let i = 0; i < (o.stains ?? 6); i++) k.blob(shade(color, 0.8), 0.5 + r() * 0.6, [(r() - 0.5) * w * 0.8, 0.045, cz + (r() - 0.5) * d * 0.6], { seg: 7, seed: 300 + i, off: 0.002 });
  return k;
}
export function signPole(k, x, z, h, color = '#5f6468', w = 0.3) {
  k.box(color, [w, h, w], [x, 0, z], { base: true });
  k.box(PAL.concrete, [w * 2.4, 0.5, w * 2.4], [x, 0, z], { base: true, c: 0.04 });
  return k;
}

// ── materials: lamps + textured panels ──────────────────────────────────────
const _mats = new Map();
/** Emissive lamp material (cached; clone per instance before animating). */
export function lampMaterial(name, color, emissive, intensity = 0.8) {
  const key = `lamp|${name}`;
  let m = _mats.get(key);
  if (!m) { m = new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: intensity, flatShading: true, name }); _mats.set(key, m); }
  return m;
}
/**
 * Textured plane (sign / mural / neon / mesh fence). o: { glow (emissive strength), cut (alphaTest), double,
 * repeat:[u,v], fallback, name, transparent }. Falls back to a flat colour without a DOM.
 */
export function panel(tex, w, h, o = {}) {
  const key = 'cpanel|' + (tex ? tex.uuid : o.fallback || '#d9cfb3') + '|' + JSON.stringify([o.glow || 0, o.cut || 0, !!o.double, o.repeat || 0, o.opacity || 1, !!o.blend]);
  let m = _mats.get(key);
  if (!m) {
    if (tex) {
      if (o.repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(o.repeat[0], o.repeat[1]); tex.needsUpdate = true; }
      m = new THREE.MeshLambertMaterial({ map: tex, name: 'CR_Sign_' + tex.name });
      if (o.glow) { m.emissive = new THREE.Color('#ffffff'); m.emissiveMap = tex; m.emissiveIntensity = o.glow; }
      if (o.cut) m.alphaTest = o.cut;
      if (o.blend) { m.transparent = true; m.alphaTest = 0.02; }
    } else {
      m = new THREE.MeshLambertMaterial({ color: o.fallback || '#d9cfb3', name: 'CR_Sign_fallback' });
      if (o.opacity && o.opacity < 1) { m.transparent = true; m.opacity = o.opacity; }
    }
    if (o.double) m.side = THREE.DoubleSide;
    _mats.set(key, m);
  }
  const gk = `cplane|${w}|${h}`;
  let geo = _mats.get(gk);
  if (!geo) { geo = new THREE.PlaneGeometry(w, h); _mats.set(gk, geo); }
  const mesh = new THREE.Mesh(geo, m);
  mesh.name = o.name || 'sign';
  mesh.receiveShadow = true;
  return mesh;
}
/** Add a panel to g at pos facing rotY (+Z when 0). Returns the mesh. */
export function addPanel(g, tex, w, h, pos, rotY = 0, o = {}) {
  const p = panel(tex, w, h, o);
  p.position.set(pos[0], pos[1], pos[2]);
  p.rotation.y = rotY;
  if (o.rotZ) p.rotation.z = o.rotZ;
  g.add(p);
  return p;
}
/** Curved textured band around a cylinder (painted water-tower lettering, lighthouse bands…). */
export function arcPanel(g, tex, r, h, y, thetaStart, thetaLen, o = {}) {
  const key = `carc|${r}|${h}|${thetaStart}|${thetaLen}`;
  let geo = _mats.get(key);
  if (!geo) { geo = new THREE.CylinderGeometry(r, r, h, 16, 1, true, thetaStart, thetaLen); _mats.set(key, geo); }
  const p = panel(tex, 1, 1, o);
  const mesh = new THREE.Mesh(geo, p.material);
  mesh.name = o.name || 'sign';
  mesh.position.set(o.x || 0, y, o.z || 0);
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

// ── sign painters (CanvasTexture) ────────────────────────────────────────────
const SANS = '"Arial Black","Arial Bold",Arial,Helvetica,sans-serif';
const SERIF = 'Georgia,"DejaVu Serif","Times New Roman",serif';
const COND = '"Arial Narrow","DejaVu Sans Condensed",Arial,sans-serif';
export const FONTS = { SANS, SERIF, COND };

/** Brush-painted lettering on brick: slightly wobbly, with chipped paint. */
export function paintedWallSign(key, lines, o = {}) {
  return signTexture({
    key, w: o.w || 1024, h: o.h || 256, bg: o.bg || '#8a4a38',
    draw: (ctx, W, H) => {
      const r = rngFor(key);
      if (o.brick !== false) { // brick courses under the paint
        ctx.fillStyle = 'rgba(40,20,10,0.18)';
        for (let y = 0; y < H; y += 16) { ctx.fillRect(0, y, W, 2); for (let x = (y / 16) % 2 ? 0 : 24; x < W; x += 48) ctx.fillRect(x, y, 2, 16); }
      }
      if (o.panel) { ctx.fillStyle = o.panel; ctx.fillRect(W * 0.03, H * 0.08, W * 0.94, H * 0.84); }
      if (o.border) { ctx.strokeStyle = o.border; ctx.lineWidth = 8; ctx.strokeRect(W * 0.04, H * 0.11, W * 0.92, H * 0.78); }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const L of lines) {
        ctx.save();
        ctx.translate(W * (L.x ?? 0.5), H * L.y);
        ctx.rotate((r() - 0.5) * 0.01);
        if (L.shadow) { ctx.fillStyle = L.shadow; fitText(ctx, L.text, 5, 5, W * (L.maxW || 0.9), L.px, L.weight || '900', L.family || SANS); }
        ctx.fillStyle = L.color || '#efe6cf';
        fitText(ctx, L.text, 0, 0, W * (L.maxW || 0.9), L.px, L.weight || '900', L.family || SANS);
        ctx.restore();
      }
      if (o.draw) o.draw(ctx, W, H, r);
      // paint loss: brick showing through
      ctx.fillStyle = o.chip || 'rgba(130,70,50,0.55)';
      for (let i = 0; i < (o.chips ?? 40); i++) { const x = r() * W, y = r() * H; ctx.fillRect(x, y, 4 + r() * 18, 2 + r() * 8); }
    },
  });
}
function rngFor(key) { return rng(hashStr(key)); }

/** Neon tubes: glowing letters (transparent background unless o.bg). Use with panel({glow, cut}). */
export function neonSign(key, lines, o = {}) {
  return signTexture({
    key, w: o.w || 1024, h: o.h || 256, bg: o.bg || 'rgba(0,0,0,0)', weather: !!o.bg,
    draw: (ctx, W, H) => {
      if (o.drawBg) o.drawBg(ctx, W, H);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const L of lines) {
        const fam = L.family || '"Trebuchet MS","DejaVu Sans",Arial,sans-serif';
        ctx.save();
        if (L.backer) { // painted letter backers (sheet-metal channel letters)
          ctx.strokeStyle = L.backer; ctx.lineWidth = L.px * 0.22; ctx.lineJoin = 'round';
          ctx.font = `${L.weight || '900'} ${L.px}px ${fam}`;
          let s = L.px; while (ctx.measureText(L.text).width > W * (L.maxW || 0.9) && s > 10) { s -= 2; ctx.font = `${L.weight || '900'} ${s}px ${fam}`; }
          ctx.strokeText(L.text, W * (L.x ?? 0.5), H * L.y);
          ctx.fillStyle = L.backer; ctx.fillText(L.text, W * (L.x ?? 0.5), H * L.y);
        }
        ctx.shadowColor = L.color; ctx.shadowBlur = L.px * 0.3;
        ctx.fillStyle = L.color;
        fitText(ctx, L.text, W * (L.x ?? 0.5), H * L.y, W * (L.maxW || 0.9), L.px * (L.backer ? 0.86 : 1), L.weight || '700', fam);
        ctx.shadowBlur = 0; ctx.fillStyle = L.core || 'rgba(255,250,235,0.55)';
        fitText(ctx, L.text, W * (L.x ?? 0.5), H * L.y, W * (L.maxW || 0.9), L.px * (L.backer ? 0.86 : 1), L.weight || '700', fam);
        ctx.restore();
      }
      if (o.draw) o.draw(ctx, W, H);
    },
  });
}

/** Bulb row helper for marquees. */
export function bulbs(ctx, x0, y0, x1, y1, n, r, on = '#f6e7b0', off = '#5a5246', skip = 7) {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    ctx.fillStyle = i % skip === 3 ? off : on;
    ctx.beginPath(); ctx.arc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, 0, TAU); ctx.fill();
  }
}

/** Original abstract desert murals (four compositions). */
export function muralTexture(style, key = 'mural_' + style) {
  return signTexture({
    key, w: 512, h: 640, bg: '#d9b98a',
    draw: (ctx, W, H) => {
      const r = rngFor(key);
      const poly = (pts, col) => { ctx.fillStyle = col; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H))); ctx.closePath(); ctx.fill(); };
      const disc = (x, y, rr, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x * W, y * H, rr * W, 0, TAU); ctx.fill(); };
      const saguaro = (x, y, s, col) => {
        ctx.fillStyle = col; const u = W * s;
        const rr = (a, b, w, h) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(a, b, w, h, w / 2) : ctx.rect(a, b, w, h); ctx.fill(); };
        rr(x * W - u * 0.12, y * H - u, u * 0.24, u);
        rr(x * W - u * 0.45, y * H - u * 0.72, u * 0.16, u * 0.38); rr(x * W - u * 0.45, y * H - u * 0.42, u * 0.36, u * 0.13);
        rr(x * W + u * 0.29, y * H - u * 0.85, u * 0.16, u * 0.45); rr(x * W + u * 0.09, y * H - u * 0.5, u * 0.36, u * 0.13);
      };
      if (style === 0) { // sun over layered mesas
        const g = ctx.createLinearGradient(0, 0, 0, H * 0.62);
        g.addColorStop(0, '#e9c79a'); g.addColorStop(0.55, '#e3a36c'); g.addColorStop(1, '#cf7f55');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        disc(0.5, 0.36, 0.3, '#f0d48a');
        ctx.fillStyle = '#cf7f55'; for (let i = 0; i < 5; i++) ctx.fillRect(0, H * (0.4 + i * 0.045), W, H * (0.008 + i * 0.006));
        poly([[0, 0.62], [0.08, 0.5], [0.3, 0.49], [0.36, 0.56], [0.55, 0.55], [0.6, 0.47], [0.86, 0.46], [0.92, 0.55], [1, 0.56], [1, 0.75], [0, 0.75]], '#a8573c');
        poly([[0, 0.7], [0.18, 0.62], [0.42, 0.63], [0.5, 0.68], [0.78, 0.66], [1, 0.62], [1, 1], [0, 1]], '#7d4a48');
        ctx.fillStyle = '#c98a5c'; for (let i = 0; i < 4; i++) ctx.fillRect(0, H * (0.8 + i * 0.05), W, H * 0.018);
        saguaro(0.18, 0.9, 0.26, '#3f6b5c'); saguaro(0.82, 0.86, 0.18, '#3f6b5c');
      } else if (style === 1) { // geometric cactus on teal
        ctx.fillStyle = '#5a8f86'; ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 6; i++) disc(0.7, 0.24, 0.3 - i * 0.05, i % 2 ? '#e3a36c' : '#efd29a');
        ctx.fillStyle = '#d9b98a'; ctx.fillRect(0, H * 0.78, W, H * 0.22);
        for (let x = 0; x < W; x += W / 8) poly([[x / W, 0.78], [(x + W / 16) / W, 0.72], [(x + W / 8) / W, 0.78]], '#d9b98a');
        saguaro(0.38, 0.86, 0.62, '#2f5a4c');
        ctx.fillStyle = '#b8543a'; for (let x = 0; x < W; x += 32) poly([[x / W, 1], [(x + 16) / W, 0.95], [(x + 32) / W, 1]], '#b8543a');
        for (let x = 0; x < W; x += 32) poly([[x / W, 0], [(x + 16) / W, 0.04], [(x + 32) / W, 0]], '#e9c79a');
      } else if (style === 2) { // mountains + sun rays
        ctx.fillStyle = '#efd8a8'; ctx.fillRect(0, 0, W, H);
        ctx.save(); ctx.translate(W * 0.5, H * 0.52);
        for (let i = 0; i < 14; i++) { ctx.rotate(Math.PI / 14); ctx.fillStyle = i % 2 ? '#ebc184' : '#efd8a8'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-W, -W * 0.12); ctx.lineTo(-W, W * 0.12); ctx.fill(); }
        ctx.restore();
        disc(0.5, 0.52, 0.16, '#d9783f');
        const cols = ['#8a6b8c', '#a7576a', '#c86f4c', '#d99a5a'];
        for (let i = 0; i < 4; i++) {
          const y = 0.5 + i * 0.1, pts = [[0, 1], [0, y + 0.08]];
          for (let x = 0; x <= 1.0001; x += 0.2) pts.push([x, y + ((Math.floor(x * 5) + i) % 2 ? 0.08 : -0.02) + (r() - 0.5) * 0.03]);
          pts.push([1, 1]); poly(pts, cols[i]);
        }
        poly([[0.42, 1], [0.48, 0.86], [0.52, 0.86], [0.66, 1]], '#3d3a3a');
        ctx.fillStyle = '#e9c45a'; for (let i = 0; i < 4; i++) ctx.fillRect(W * (0.5 + i * 0.02), H * (0.89 + i * 0.03), W * 0.012, H * 0.018);
      } else { // night desert, crescent moon, agave
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#2f3d5a'); g.addColorStop(0.6, '#7a4f66'); g.addColorStop(1, '#c87a58');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        disc(0.68, 0.2, 0.11, '#efe2b8'); disc(0.72, 0.18, 0.1, '#344262');
        ctx.fillStyle = '#efe2b8'; for (let i = 0; i < 40; i++) ctx.fillRect(r() * W, r() * H * 0.5, 3, 3);
        poly([[0, 0.7], [0.2, 0.58], [0.26, 0.6], [0.5, 0.6], [0.56, 0.66], [1, 0.64], [1, 1], [0, 1]], '#3a2f40');
        for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i - 4) * 0.28; poly([[0.3, 0.95], [0.3 + Math.cos(a - 0.06) * 0.06, 0.95], [0.3 + Math.cos(a) * 0.3, 0.95 + Math.sin(a) * 0.3], [0.3 + Math.cos(a + 0.06) * 0.06, 0.95]], '#4f7a62'); }
        saguaro(0.82, 0.92, 0.3, '#22303a');
      }
      // signature frame + sun-bleach + flaked paint showing brick
      ctx.strokeStyle = 'rgba(40,30,25,0.6)'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, W - 6, H - 6);
      ctx.fillStyle = 'rgba(245,235,215,0.16)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(150,80,60,0.6)';
      for (let i = 0; i < 70; i++) { const x = r() * W, y = H * (0.75 + r() * 0.25); ctx.fillRect(x, y, 3 + r() * 14, 2 + r() * 6); }
    },
  });
}

/** Chain-link mesh tile (alpha-cut, repeat it). */
export function chainlinkTexture() {
  return signTexture({
    key: 'chainlink_tile', w: 128, h: 128, bg: 'rgba(0,0,0,0)', weather: false,
    draw: (ctx, W, H) => {
      ctx.strokeStyle = '#b9bcb6'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      for (const [a, b, c, d] of [[0, 0, W, H], [W, 0, 0, H], [-W, 0, W, 2 * H], [0, -H, 2 * W, H]]) { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); }
      ctx.strokeStyle = '#8d918b'; ctx.lineWidth = 2;
      for (const [a, b, c, d] of [[0, 0, W, H], [W, 0, 0, H]]) { ctx.beginPath(); ctx.moveTo(a + 2, b); ctx.lineTo(c + 2, d); ctx.stroke(); }
    },
  });
}

/** Clock dial (Roman numerals). */
export function clockDial(key = 'clock_dial') {
  return signTexture({
    key, w: 512, h: 512, bg: 'rgba(0,0,0,0)', weather: false,
    draw: (ctx, W, H) => {
      const cx = W / 2, cy = H / 2;
      ctx.fillStyle = '#2b2a28'; ctx.beginPath(); ctx.arc(cx, cy, W * 0.495, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ece4cc'; ctx.beginPath(); ctx.arc(cx, cy, W * 0.46, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#2b2a28'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, W * 0.33, 0, TAU); ctx.stroke();
      const N = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
      ctx.fillStyle = '#2b2a28'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU - Math.PI / 2;
        ctx.save(); ctx.translate(cx + Math.cos(a) * W * 0.39, cy + Math.sin(a) * W * 0.39); ctx.rotate(a + Math.PI / 2);
        ctx.font = `700 ${W * 0.075}px ${SERIF}`; ctx.fillText(N[i], 0, 0); ctx.restore();
      }
      for (let i = 0; i < 60; i++) { const a = (i / 60) * TAU; ctx.fillRect(cx + Math.cos(a) * W * 0.45 - 2, cy + Math.sin(a) * W * 0.45 - 2, i % 5 ? 3 : 7, i % 5 ? 3 : 7); }
      ctx.fillStyle = 'rgba(120,100,70,0.18)'; ctx.beginPath(); ctx.arc(cx + W * 0.1, cy + H * 0.12, W * 0.25, 0, TAU); ctx.fill();
    },
  });
}

/** UV sub-rect of a canvas atlas region given in canvas pixels (top-down). */
export function atlasUV(x0, y0, x1, y1, W, H) { return [x0 / W, 1 - y1 / H, x1 / W, 1 - y0 / H]; }
/**
 * Several textured quads sharing one material (and one draw call): quads [{ p:[x,y,z], w, h, rotY, rotX, uv:[u0,v0,u1,v1] }].
 * Each quad faces its local +Z (rotY turns it). Returns the mesh (added to g).
 */
export function multiPanel(g, tex, quads, o = {}) {
  const mat = panel(tex, 1, 1, o).material;
  const pos = [], uv = [], nor = [], idx = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), n = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  quads.forEach((Q, i) => {
    e.set(Q.rotX || 0, Q.rotY || 0, Q.rotZ || 0, 'YXZ'); q.setFromEuler(e);
    m.compose(new THREE.Vector3(Q.p[0], Q.p[1], Q.p[2]), q, one);
    const hw = Q.w / 2, hh = Q.h / 2, U = Q.uv || [0, 0, 1, 1];
    for (const [x, y] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) { v.set(x, y, 0).applyMatrix4(m); pos.push(v.x, v.y, v.z); }
    uv.push(U[0], U[1], U[2], U[1], U[2], U[3], U[0], U[3]);
    n.set(0, 0, 1).applyQuaternion(q); for (let j = 0; j < 4; j++) nor.push(n.x, n.y, n.z);
    const b = i * 4; idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = o.name || 'sign';
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
/** Tier painter for towers: dark glazing, vertical piers, floor spandrels, scattered lit panes. */
export function towerFace(k, f, y0, y1, o = {}) {
  const r = rng(o.seed || 1), m = o.margin ?? 0.4, fh = o.fh || 3.6;
  const u0 = f.u[0] + m, u1 = f.u[1] - m;
  wr(k, f, [u0, u1], [y0 + (o.gap ?? 0.3), y1 - (o.gap ?? 0.3)], o.glass || C.glass, 0.014);
  const ps = o.pier || 2.5, n = Math.max(1, Math.round((u1 - u0) / ps));
  const lit = [];
  for (let fl = Math.floor(y0 / fh); fl * fh < y1 - fh * 0.5; fl++) {
    const ya = Math.max(y0, fl * fh) + 0.9, yb = Math.min(y1, (fl + 1) * fh) - 0.05;
    if (yb - ya < 0.8) continue;
    if (o.spandrel !== false) wr(k, f, [u0, u1], [Math.max(y0, fl * fh), Math.max(y0, fl * fh) + 0.9], o.spandrel || shade(o.glass || C.glass, 0.8), 0.018);
    for (let j = 0; j < n; j++) if (r() < (o.lit ?? 0.12)) lit.push([u0 + (j / n) * (u1 - u0), u0 + ((j + 1) / n) * (u1 - u0), ya, yb]);
  }
  for (const [a, b, ya, yb] of lit) wr(k, f, [a + 0.12, b - 0.12], [ya, yb], r() < 0.6 ? C.lit : C.litCool, 0.02);
  if (o.pierColor !== false) for (let j = 0; j <= n; j++) { const u = u0 + (j / n) * (u1 - u0); wr(k, f, [u - (o.pierW || 0.18), u + (o.pierW || 0.18)], [y0, y1], o.pierColor || C.stone, 0.024); }
  if (o.streak) { const L = u1 - u0; wr(k, f, [u0 + L * 0.12, u0 + L * 0.3], [y0 + 2, y1 - 2], o.streak, 0.016); }
  return k;
}
