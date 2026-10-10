// ─────────────────────────────────────────────────────────────────────────────
// Vehicles (Agent ART): rv, cop, cop_suv, heli, sedan, hatch, van, pickup, bus,
// truck, tractor, rival, train.
//
// Conventions: metres, Y up, origin = ground centre of footprint, FRONT = +Z.
// Wheels: Object3D pivots named wheel_* at the axle centre, rotation.order 'YXZ'
// so the renderer can set rotation.y (steer) and rotation.x (spin; +x = rolling
// forward). Each pivot holds one mesh `<name>_mesh` (wheels are shared geometry).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Kit, Rig, empty, root, rng, clipBand, mat } from './kit.js';
import { PAL, mix, shade, vcolMaterial } from '../palette.js';

// ── wheels ───────────────────────────────────────────────────────────────────
const _wheelGeo = new Map();
/** Shared, vertex-coloured wheel geometry: axle along X, outer face toward +X (~70–100 tris). */
function wheelGeometry(r, w, style = 'steel') {
  const key = `${r}|${w}|${style}`;
  let g = _wheelGeo.get(key);
  if (g) return g;
  const k = new Kit(3);
  const seg = style === 'tractor' ? 12 : r > 0.45 ? 10 : 10;
  const hw = w / 2;
  const tyre = style === 'tractor' ? '#2b2b2a' : PAL.tyre;
  // tyre: open lathe band with chamfered shoulders
  const rt = style === 'tractor' ? r - 0.05 : r;
  k.lathe(tyre, [[r * 0.7, -hw], [rt, -hw * 0.6], [rt, hw * 0.6], [r * 0.7, hw]], seg, [0, 0, 0], { axis: 'x' });
  const rimC = style === 'chrome' ? PAL.chrome : style === 'black' ? '#3a3b3d' : style === 'tractor' ? '#c7a24a' : style === 'dark' ? PAL.rimDark : PAL.rim;
  // outer rim disc + hub, inner dark disc
  k.lathe(rimC, [[r * 0.7, hw - 0.025], [0.0, hw - 0.05]], seg, [0, 0, 0], { axis: 'x' });
  k.lathe(shade(rimC, 0.72), [[r * 0.24, hw - 0.03], [r * 0.2, hw], [0, hw]], 6, [0, 0, 0], { axis: 'x' });
  k.lathe('#1c1c1d', [[0, -hw + 0.03], [r * 0.7, -hw + 0.03]], seg, [0, 0, 0], { axis: 'x' });
  if (style === 'tractor' && r > 0.6) {
    // chevron tread lugs: local Z of each lug frame points radially outward
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      k.at([0, Math.sin(a) * (r - 0.045), Math.cos(a) * (r - 0.045)], [-a, 0, 0], () => {
        for (const s of [1, -1]) k.box('#2f2f2e', [w * 0.5, 0.11, 0.09], [s * w * 0.22, 0, 0], { rot: [0, 0, s * 0.45], noBottom: true });
      });
    }
  }
  g = k.geometry();
  _wheelGeo.set(key, g);
  return g;
}

/** New vehicle rig: bone 0 = `body` at the origin (suspension pivot). */
function vrig() { const rig = new Rig(); rig.add('body', [0, 0, 0]); return rig; }

/** Add wheel bone `name` at pos (axle centre) and its geometry. side: +1 = left (+X), -1 = right (−X). */
function addWheel(k, rig, name, pos, r, w, side, style) {
  const i = rig.add(name, pos, null, { order: 'YXZ' });
  k.withBone(i, () => k.merge(wheelGeometry(r, w, style), mat(pos, [0, side < 0 ? Math.PI : 0, 0])));
  return i;
}

/** Four wheels named wheel_fl/fr/rl/rr. */
function fourWheels(k, rig, { zf, zr, x, xf, r, w, style, y }) {
  const yy = y ?? r, fx = xf ?? x;
  addWheel(k, rig, 'wheel_fl', [fx, yy, zf], r, w, 1, style);
  addWheel(k, rig, 'wheel_fr', [-fx, yy, zf], r, w, -1, style);
  addWheel(k, rig, 'wheel_rl', [x, yy, zr], r, w, 1, style);
  addWheel(k, rig, 'wheel_rr', [-x, yy, zr], r, w, -1, style);
}

/** Bake kit + rig into the model root; returns the bone map. */
function finish(g, k, rig) {
  const { bones } = rig.build(g, k, 'mesh');
  g.userData.parts = Object.keys(bones);
  return bones;
}

// ── painting helpers ─────────────────────────────────────────────────────────
/** Dark wheel-arch decal on both sides around (zc, yc). */
function arch(k, hw, zc, yc, r, yb, color = '#1e1d1c', o = {}) {
  const lo = Math.min(yb, yc);
  const pts = [[zc + r, lo], [zc + r, yc]];
  for (let i = 1; i < 8; i++) { const a = (i / 8) * Math.PI; pts.push([zc + Math.cos(a) * r, yc + Math.sin(a) * r * 0.95]); }
  pts.push([zc - r, yc], [zc - r, lo]);
  const clipped = clipBand(pts, yb + 0.005);
  if (clipped.length >= 3) k.side(color, hw, clipped, { off: 0.02, ...o });
  // a little fender lip / flare
  if (o.lip) {
    const lip = [];
    for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; lip.push([zc + Math.cos(a) * (r + 0.09), yc + Math.sin(a) * (r + 0.09) * 0.95]); }
    for (let i = 8; i >= 0; i--) { const a = (i / 8) * Math.PI; lip.push([zc + Math.cos(a) * r, yc + Math.sin(a) * r * 0.95]); }
    const lc = clipBand(lip, yb + 0.005);
    if (lc.length >= 3) k.side(o.lip, hw, lc, { off: 0.03, side: o.side });
  }
}

/** Paint a strip on the face between profile points a and b ([z,y]) across x ∈ xr, fraction t ∈ tr along the edge. */
function edgeQuad(k, color, a, b, xr, tr = [0, 1], off = 0.014) {
  const dz = b[0] - a[0], dy = b[1] - a[1];
  const l = Math.hypot(dz, dy) || 1;
  const facing = [0, -dz / l, dy / l];
  const P = (t) => [a[0] + dz * t, a[1] + dy * t];
  const p0 = P(tr[0]), p1 = P(tr[1]);
  k.poly(color, [[xr[0], p0[1], p0[0]], [xr[1], p0[1], p0[0]], [xr[1], p1[1], p1[0]], [xr[0], p1[1], p1[0]]], { facing, off });
}

/** Irregular blob painted on the side plane x = s*hw (rust patches, mud). */
function sideBlob(k, color, hw, zc, yc, rz, ry, seed, s, off = 0.022) {
  const r = rng(seed), pts = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, f = 0.7 + r() * 0.5;
    pts.push([zc + Math.cos(a) * rz * f, yc + Math.sin(a) * ry * f]);
  }
  k.side(color, hw, pts, { side: s, off });
}

/** Glass window with frame + optional curtain slices, on side plane(s). */
function sideWindow(k, hw, z0, z1, y0, y1, o = {}) {
  const fr = o.frame ?? 0.05;
  if (o.frameColor !== null) k.side(o.frameColor || '#cfc8b4', hw, [[z0 - fr, y0 - fr], [z1 + fr, y0 - fr], [z1 + fr, y1 + fr], [z0 - fr, y1 + fr]], { side: o.side, off: o.offBase ?? 0.018 });
  k.side(PAL.glass, hw, [[z0, y0], [z1, y0], [z1, y1], [z0, y1]], { side: o.side, off: (o.offBase ?? 0.018) + 0.006 });
  const off = (o.offBase ?? 0.018) + 0.011;
  if (o.curtain) {
    const c = o.curtain, w = z1 - z0, h = y1 - y0;
    const [l, rr, top] = o.curtainSplit || [0.28, 0.18, 0.14];
    if (l > 0) k.side(c, hw, [[z0, y0], [z0 + w * l, y0], [z0 + w * l * 0.8, y1], [z0, y1]], { side: o.side, off });
    if (rr > 0) k.side(c, hw, [[z1 - w * rr, y0], [z1, y0], [z1, y1], [z1 - w * rr * 0.8, y1]], { side: o.side, off });
    if (top > 0) k.side(shade(c, 0.85), hw, [[z0, y1 - h * top], [z1, y1 - h * top], [z1, y1], [z0, y1]], { side: o.side, off: off + 0.003 });
  }
  if (o.sheen !== false) {
    const w = z1 - z0, h = y1 - y0;
    k.side(PAL.glassHi, hw, [[z0 + w * 0.55, y0 + h * 0.15], [z0 + w * 0.64, y0 + h * 0.15], [z0 + w * 0.8, y1 - h * 0.1], [z0 + w * 0.71, y1 - h * 0.1]], { side: o.side, off: off + 0.004 });
  }
}

// lamp material helper: per-instance-clonable emissive lamp
function lampMaterial(off, on, name) {
  const m = new THREE.MeshLambertMaterial({ color: off, emissive: on, emissiveIntensity: 0, name, flatShading: true });
  m.userData.lamp = true;
  return m;
}

// ═════════════════════════════════════════════════════════════════════════════
// RV — the hero. Original design: 1980s class-C style motorhome.
// ═════════════════════════════════════════════════════════════════════════════
export function buildRV() {
  const g = root('rv', 0, { w: 2.6, h: 3.4, l: 8.6 });
  const k = new Kit(11);
  const rig = vrig();
  const body = PAL.rvBody, teal = PAL.rvTeal, mustard = PAL.rvMustard;
  const W = 2.54, hw = W / 2;
  const cabW = 2.3, chw = cabW / 2;
  const wr = 0.46, ww = 0.3;
  const zf = 3.12, zr = -1.75;

  // ── coach box (incl. cab-over bunk) — side profile [z, y], CCW ────────────
  const box = [[-4.28, 0.6], [2.0, 0.6], [2.0, 2.12], [3.0, 2.16], [3.32, 2.42], [3.36, 2.84], [3.08, 3.1], [-4.1, 3.12], [-4.28, 2.96]];
  k.extrude(body, box, W, { axis: 'x', bevel: 0.07 });
  // underside / chassis rails
  k.box(PAL.under, [1.6, 0.28, 7.6], [0, 0.45, -0.4]);
  k.box(PAL.under, [2.0, 0.18, 2.4], [0, 0.42, 3.0]);
  // ── cab ────────────────────────────────────────────────────────────────────
  const cab = [[1.7, 0.5], [4.2, 0.5], [4.3, 0.82], [4.26, 1.18], [4.0, 1.3], [3.32, 1.38], [2.72, 2.14], [1.7, 2.14]];
  k.extrude(body, cab, cabW, { axis: 'x', bevel: 0.06 });

  // ── lower teal band, pinstripe, upper accent ─────────────────────────────
  k.side(teal, hw, [[-4.2, 0.64], [1.99, 0.64], [1.99, 1.22], [-4.2, 1.22]]);
  k.side(teal, chw, [[1.72, 0.56], [4.18, 0.56], [4.24, 1.16], [4.0, 1.22], [1.72, 1.22]]);
  k.side(mustard, hw, [[-4.2, 1.28], [1.99, 1.28], [1.99, 1.34], [-4.2, 1.34]]);
  k.side(mustard, chw, [[1.72, 1.28], [3.95, 1.28], [3.9, 1.34], [1.72, 1.34]]);
  // upper accent stripe that kicks up into the bunk nose
  k.side(teal, hw, [[-4.15, 2.86], [2.2, 2.86], [3.05, 2.96], [3.2, 3.02], [3.0, 3.03], [2.2, 2.93], [-4.15, 2.93]], { off: 0.014 });
  k.side(mustard, hw, [[-4.15, 2.78], [2.2, 2.78], [3.1, 2.87], [3.25, 2.92], [3.08, 2.93], [2.2, 2.82], [-4.15, 2.82]], { off: 0.014 });
  // front band across the cab nose
  k.front(teal, 4.3, [[-1.08, 0.56], [1.08, 0.56], [1.08, 0.74], [-1.08, 0.74]], 1, { off: 0.012 });

  // ── dirt band near the wheels + mud splashes ─────────────────────────────
  const dirt1 = mix(teal, PAL.mud, 0.55), dirt2 = mix(teal, PAL.dirt, 0.28);
  k.side(dirt2, hw, [[-4.2, 0.64], [1.99, 0.64], [1.99, 0.84], [-4.2, 0.84]], { off: 0.016 });
  k.side(dirt1, hw, [[-4.2, 0.64], [1.99, 0.64], [1.99, 0.72], [-4.2, 0.72]], { off: 0.02 });
  k.side(dirt2, chw, [[1.72, 0.56], [4.18, 0.56], [4.2, 0.78], [1.72, 0.78]], { off: 0.016 });
  for (const s of [1, -1]) {
    sideBlob(k, mix(teal, PAL.mud, 0.45), hw, zr - 0.75, 0.95, 0.35, 0.22, 21 + s, s, 0.021);
    sideBlob(k, mix(teal, PAL.mud, 0.4), hw, zr + 0.85, 0.9, 0.3, 0.18, 25 + s, s, 0.021);
  }
  // wheel arches
  arch(k, hw, zr, wr, wr + 0.1, 0.6, '#1d1c1b');
  arch(k, chw, zf, wr, wr + 0.1, 0.5, '#1d1c1b');

  // ── rust patches (grime) ─────────────────────────────────────────────────
  sideBlob(k, PAL.rust, hw, zr + 0.62, 1.12, 0.16, 0.1, 3, 1);
  sideBlob(k, PAL.rustDark, hw, zr + 0.62, 1.12, 0.08, 0.05, 4, 1, 0.026);
  sideBlob(k, PAL.rust, hw, -4.0, 0.95, 0.14, 0.12, 5, -1);
  sideBlob(k, PAL.rust, hw, -3.1, 1.95, 0.09, 0.07, 6, 1);
  sideBlob(k, mix(body, PAL.rust, 0.35), hw, -1.0, 2.75, 0.22, 0.05, 7, -1);
  sideBlob(k, PAL.rust, chw, 3.9, 0.98, 0.1, 0.08, 8, -1);
  // faded primer panel patch (mismatched repair) on +X side
  k.side(mix(body, PAL.primer, 0.55), hw, [[-2.15, 1.42], [-1.35, 1.42], [-1.35, 1.88], [-2.15, 1.88]], { side: 1, off: 0.013 });

  // ── windows: coach (curtained), bunk, cab ────────────────────────────────
  const cur = PAL.curtain, cur2 = PAL.curtain2;
  // +X (driver's left)
  sideWindow(k, hw, -3.45, -2.55, 1.62, 2.3, { side: 1, curtain: cur2, curtainSplit: [0.44, 0.4, 0.16] }); // lab — curtains mostly drawn
  sideWindow(k, hw, -0.75, 0.55, 1.62, 2.3, { side: 1, curtain: cur });
  sideWindow(k, hw, 1.05, 1.7, 1.7, 2.25, { side: 1, curtain: cur, curtainSplit: [0.3, 0, 0.18] });
  // −X (driver's right) — door sits at z 0.5..1.3
  sideWindow(k, hw, -3.2, -2.3, 1.62, 2.3, { side: -1, curtain: cur2, curtainSplit: [0.4, 0.45, 0.16] });
  sideWindow(k, hw, -1.4, -0.4, 1.62, 2.3, { side: -1, curtain: cur });
  // bunk windows
  sideWindow(k, hw, 2.25, 2.85, 2.38, 2.7, { curtain: cur, curtainSplit: [0.25, 0.25, 0], frame: 0.04 });
  // bunk front window on the nose
  edgeQuad(k, '#cfc8b4', [3.32, 2.42], [3.36, 2.84], [-0.78, 0.78], [0.16, 0.86], 0.016);
  edgeQuad(k, PAL.glass, [3.32, 2.42], [3.36, 2.84], [-0.72, 0.72], [0.24, 0.8], 0.024);
  edgeQuad(k, cur, [3.32, 2.42], [3.36, 2.84], [-0.72, -0.4], [0.24, 0.8], 0.03);
  edgeQuad(k, cur, [3.32, 2.42], [3.36, 2.84], [0.42, 0.72], [0.24, 0.8], 0.03);
  // windshield
  edgeQuad(k, '#2b2c2e', [3.32, 1.38], [2.72, 2.14], [-1.06, 1.06], [0.02, 0.98], 0.012);
  edgeQuad(k, PAL.glass, [3.32, 1.38], [2.72, 2.14], [-1.0, 1.0], [0.07, 0.93], 0.02);
  edgeQuad(k, PAL.glassHi, [3.32, 1.38], [2.72, 2.14], [0.25, 0.42], [0.12, 0.88], 0.026);
  edgeQuad(k, PAL.glassHi, [3.32, 1.38], [2.72, 2.14], [-0.6, -0.52], [0.12, 0.88], 0.026);
  edgeQuad(k, '#202123', [3.32, 1.38], [2.72, 2.14], [-0.9, -0.1], [0.07, 0.1], 0.03); // wiper
  edgeQuad(k, '#202123', [3.32, 1.38], [2.72, 2.14], [0.05, 0.85], [0.07, 0.1], 0.03);
  // cab door windows (both sides)
  k.side('#2b2c2e', chw, [[1.92, 1.42], [3.22, 1.42], [2.76, 2.06], [1.92, 2.06]], { off: 0.016 });
  k.side(PAL.glass, chw, [[1.97, 1.47], [3.12, 1.47], [2.72, 2.01], [1.97, 2.01]], { off: 0.022 });
  k.side(PAL.glassHi, chw, [[2.45, 1.52], [2.55, 1.52], [2.66, 1.96], [2.56, 1.96]], { off: 0.026 });
  // cab door seams + handles
  for (const s of [1, -1]) {
    k.side('#8f8a7c', chw, [[1.86, 0.62], [1.89, 0.62], [1.89, 2.08], [1.86, 2.08]], { side: s, off: 0.02 });
    k.side('#8f8a7c', chw, [[3.3, 0.62], [3.33, 0.62], [3.33, 1.36], [3.3, 1.36]], { side: s, off: 0.02 });
    k.box(PAL.chrome, [0.04, 0.04, 0.16], [s * (chw + 0.02), 1.38, 2.2]);
  }

  // ── cab front: grille, round headlights, bumper ──────────────────────────
  k.box(PAL.chrome, [1.26, 0.42, 0.06], [0, 0.98, 4.27]);
  k.box(PAL.grille, [1.12, 0.32, 0.06], [0, 0.98, 4.3]);
  for (let i = 0; i < 4; i++) k.front('#4a4b4e', 4.33, [[-0.54, 0.875 + i * 0.065], [0.54, 0.875 + i * 0.065], [0.54, 0.9 + i * 0.065], [-0.54, 0.9 + i * 0.065]], 1, { off: 0.004 });
  for (const s of [1, -1]) {
    k.front(PAL.chrome, 4.29, Array.from({ length: 8 }, (_, i) => [s * 0.86 + Math.cos(i * Math.PI / 4) * 0.155, 0.98 + Math.sin(i * Math.PI / 4) * 0.155]), 1, { off: 0.0 });
    k.front(PAL.headlight, 4.29, Array.from({ length: 8 }, (_, i) => [s * 0.86 + Math.cos(i * Math.PI / 4) * 0.115, 0.98 + Math.sin(i * Math.PI / 4) * 0.115]), 1, { off: 0.004 });
    k.box(PAL.amber, [0.2, 0.08, 0.04], [s * 0.86, 0.76, 4.3]);
    // mirrors on arms
    k.box(PAL.trim, [0.18, 0.04, 0.04], [s * (chw + 0.08), 1.62, 3.2]);
    k.box(PAL.trim, [0.06, 0.32, 0.18], [s * (chw + 0.18), 1.6, 3.2]);
  }
  k.box('#9d9b93', [2.36, 0.22, 0.26], [0, 0.56, 4.3], { c: 0.05, cv: true });
  k.box(PAL.plate, [0.42, 0.16, 0.02], [0, 0.56, 4.44]);
  // hood seam
  edgeQuad(k, '#bdb7a6', [4.0, 1.3], [3.32, 1.38], [-0.02, 0.02], [0.05, 0.95], 0.012);

  // ── rear: bumper, lights, window, ladder, spare tyre, exhaust ────────────
  const zb = -4.28;
  k.box(PAL.trim, [2.5, 0.24, 0.26], [0, 0.56, zb - 0.06], { c: 0.05, cv: true });
  k.box(PAL.plate, [0.42, 0.18, 0.02], [0.55, 0.76, zb - 0.01]);
  for (const s of [1, -1]) {
    // tail-light housings (the red lenses are the separate `light_brake_*` meshes below)
    k.front('#2a2a2b', zb - 0.005, [[s * 1.06 - 0.1, 0.82], [s * 1.06 + 0.1, 0.82], [s * 1.06 + 0.1, 1.38], [s * 1.06 - 0.1, 1.38]], -1, { off: 0.012 });
    k.box(PAL.amber, [0.16, 0.12, 0.05], [s * 1.06, 0.78, zb]);
    // roof clearance lights on the rear corners
    k.front(PAL.amber, zb - 0.005, [[s * 1.0 - 0.06, 2.97], [s * 1.0 + 0.06, 2.97], [s * 1.0 + 0.06, 3.03], [s * 1.0 - 0.06, 3.03]], -1, { off: 0.016 });
    // rust streaks running down from the rear corners + mud spray at the bottom
    k.front(PAL.rust, zb - 0.005, [[s * 1.14, 1.9], [s * 1.2, 1.9], [s * 1.2, 2.5], [s * 1.17, 2.62]].map(([x, y]) => [x, y]), -1, { off: 0.016 });
    k.front(mix(PAL.rust, PAL.rvBody, 0.5), zb - 0.005, [[s * 1.1, 1.5], [s * 1.2, 1.5], [s * 1.2, 1.95], [s * 1.12, 1.95]], -1, { off: 0.014 });
  }
  k.front(mix(teal, PAL.mud, 0.5), zb - 0.005, [[-1.2, 0.64], [-0.4, 0.64], [-0.6, 0.92], [-0.95, 1.0], [-1.2, 0.86]], -1, { off: 0.018 });
  k.front(mix(teal, PAL.mud, 0.45), zb - 0.005, [[0.5, 0.64], [1.2, 0.64], [1.2, 0.9], [0.9, 0.96], [0.62, 0.84]], -1, { off: 0.018 });
  // faded bumper stickers (original, wordless: a mustard sun and a teal wave)
  k.front('#e2d6b0', zb - 0.005, [[-0.5, 0.86], [-0.08, 0.86], [-0.08, 1.06], [-0.5, 1.06]], -1, { off: 0.02 });
  k.front(mustard, zb - 0.005, Array.from({ length: 8 }, (_, i) => [-0.29 + Math.cos(i * Math.PI / 4) * 0.06, 0.96 + Math.sin(i * Math.PI / 4) * 0.06]), -1, { off: 0.024 });
  k.front('#b85c6a', zb - 0.005, [[0.02, 0.88], [0.34, 0.88], [0.34, 1.04], [0.02, 1.04]], -1, { off: 0.02 });
  k.front('#cfc8b4', zb - 0.005, [[-0.62, 2.18], [0.62, 2.18], [0.62, 2.72], [-0.62, 2.72]], -1, { off: 0.012 });
  k.front(PAL.glass, zb - 0.005, [[-0.56, 2.23], [0.56, 2.23], [0.56, 2.67], [-0.56, 2.67]], -1, { off: 0.02 });
  k.front(cur, zb - 0.005, [[0.2, 2.23], [0.56, 2.23], [0.56, 2.67], [0.28, 2.67]], -1, { off: 0.026 });
  // rear teal band + pinstripe wrap around
  k.front(teal, zb - 0.005, [[-1.2, 0.64], [1.2, 0.64], [1.2, 1.22], [-1.2, 1.22]], -1, { off: 0.01 });
  k.front(mustard, zb - 0.005, [[-1.2, 1.28], [1.2, 1.28], [1.2, 1.34], [-1.2, 1.34]], -1, { off: 0.01 });
  k.front(dirt1, zb - 0.005, [[-1.2, 0.64], [1.2, 0.64], [1.2, 0.8], [-1.2, 0.8]], -1, { off: 0.015 });
  // ladder (−X side of the rear, i.e. on the right as seen from the chase cam)
  const lx0 = -0.68, lx1 = -1.06, lz = zb - 0.12;
  for (const x of [lx0, lx1]) {
    k.box(PAL.metal, [0.04, 2.5, 0.04], [x, 1.95, lz]);
    k.box(PAL.metal, [0.04, 0.04, 0.16], [x, 0.72, lz + 0.07]);
    k.box(PAL.metal, [0.04, 0.04, 0.16], [x, 3.18, lz + 0.07]);
    k.box(PAL.metal, [0.04, 0.04, 0.36], [x, 3.2, zb + 0.1]);
  }
  for (let i = 0; i < 7; i++) k.box(PAL.metal, [0.38, 0.03, 0.03], [(lx0 + lx1) / 2, 0.95 + i * 0.34, lz], { noBottom: true });
  // spare tyre with a teal cover
  k.at([0.2, 1.66, zb - 0.2], [0, 0, 0], () => {
    k.cyl(PAL.tyre, 0.44, 0.44, 0.26, [0, 0, 0], { axis: 'z', seg: 10, open: true });
    k.front(teal, -0.13, Array.from({ length: 10 }, (_, i) => [Math.cos(-i * Math.PI / 5) * 0.44, Math.sin(-i * Math.PI / 5) * 0.44]), -1, { off: 0.004 });
    k.front(mustard, -0.13, Array.from({ length: 8 }, (_, i) => [Math.cos(-i * Math.PI / 4) * 0.2, Math.sin(-i * Math.PI / 4) * 0.2]), -1, { off: 0.01 });
    k.box(PAL.metalDark, [0.12, 0.12, 0.24], [0, 0, 0.17]);
  });
  // exhaust pipe (soot tip)
  k.cyl('#5a5753', 0.05, 0.05, 0.5, [0.78, 0.36, zb + 0.1], { axis: 'z', seg: 6, open: true });
  k.cyl('#1f1e1c', 0.055, 0.055, 0.05, [0.78, 0.36, zb - 0.16], { axis: 'z', seg: 6 });

  // ── side kit: awning, hatches, marker lights, steps, mud flaps ──────────
  k.cyl('#d2cbb6', 0.08, 0.08, 4.6, [-hw - 0.08, 2.98, -0.6], { axis: 'z', seg: 6 });
  k.cyl(teal, 0.082, 0.082, 4.2, [-hw - 0.08, 2.98, -0.6], { axis: 'z', seg: 6 });
  for (const z of [-2.6, 1.4]) k.box(PAL.metal, [0.06, 0.6, 0.05], [-hw - 0.04, 2.62, z]);
  k.side(shade(body, 0.86), hw, [[-1.6, 0.74], [-0.9, 0.74], [-0.9, 1.12], [-1.6, 1.12]], { side: 1, off: 0.024 });
  k.side(shade(body, 0.86), hw, [[0.3, 0.74], [0.8, 0.74], [0.8, 1.08], [0.3, 1.08]], { side: 1, off: 0.024 });
  k.side(shade(teal, 0.7), hw, [[-1.55, 0.79], [-0.95, 0.79], [-0.95, 0.82], [-1.55, 0.82]], { side: 1, off: 0.028 });
  k.side(shade(body, 0.86), hw, [[-3.9, 0.74], [-3.2, 0.74], [-3.2, 1.1], [-3.9, 1.1]], { side: -1, off: 0.024 });
  for (const s of [1, -1]) {
    for (const z of [-4.0, -1.0, 1.8]) k.side(PAL.amber, hw, [[z - 0.05, 2.95], [z + 0.05, 2.95], [z + 0.05, 3.01], [z - 0.05, 3.01]], { side: s, off: 0.02 });
    k.box('#262624', [0.04, 0.34, 0.3], [s * (hw - 0.12), 0.4, zr - 0.62]);
    k.box('#262624', [0.04, 0.3, 0.26], [s * (chw - 0.12), 0.36, zf - 0.6]);
    // roof gutter line
    k.side('#bfb8a5', hw, [[-4.15, 3.02], [2.95, 3.02], [2.95, 3.05], [-4.15, 3.05]], { side: s, off: 0.012 });
  }
  // entry step under the door (door at z 0.5..1.3 on −X)
  k.box('#5d5f61', [0.3, 0.06, 0.82], [-hw - 0.12, 0.42, 0.9]);
  k.box('#4b4c4e', [0.04, 0.2, 0.82], [-hw - 0.26, 0.34, 0.9]);

  // ── roof: AC box, vents, lab chimney ─────────────────────────────────────
  const roofY = 3.11;
  k.box('#ddd5c1', [0.92, 0.3, 1.1], [0.0, roofY, 0.35], { c: 0.06, base: true, taper: [0.94, 0.95] });
  for (let i = 0; i < 5; i++) for (const s of [1, -1]) k.rectX('#8b8678', s * 0.46, [-0.12 + i * 0.14, -0.08 + i * 0.14], [roofY + 0.06, roofY + 0.24], s, { off: 0.004 });
  k.box(shade(body, 0.9), [0.55, 0.1, 0.55], [0.15, roofY, -1.1], { base: true, taper: [0.8, 0.8], noBottom: true });
  k.box(shade(body, 0.9), [0.5, 0.1, 0.5], [0.3, roofY, 2.4], { base: true, taper: [0.8, 0.8], noBottom: true });
  k.box(PAL.glass, [0.36, 0.02, 0.36], [0.3, roofY + 0.1, 2.4], { base: true });
  // lab vent base + crooked chimney with rain cap
  const vx = -0.55, vz = -2.5;
  k.box('#8e8b84', [0.52, 0.1, 0.52], [vx, roofY, vz], { base: true, noBottom: true });
  const pipe = '#9b9890', pipeDark = '#6d6a64';
  let px = vx, py = roofY + 0.1, pz = vz;
  const segs = [[0.26, 0, 0], [0.22, 0.42, 0.25], [0.16, -0.2, -0.12]]; // [len, tiltZ, tiltX]
  for (const [len, tz, tx] of segs) {
    k.at([px, py, pz], [tx, 0, tz], () => {
      k.cyl(pipe, 0.085, 0.09, len, [0, len / 2, 0], { seg: 7, open: true });
      k.cyl(pipeDark, 0.1, 0.1, 0.04, [0, 0, 0], { seg: 7, open: true });
    });
    // advance along the tilted axis
    const dir = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(tx, 0, tz));
    px += dir.x * len; py += dir.y * len; pz += dir.z * len;
  }
  const ventPos = [px, py, pz];
  k.cyl('#2f2c29', 0.088, 0.088, 0.05, [px, py - 0.02, pz], { seg: 7, open: true }); // soot ring
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; k.box(pipeDark, [0.015, 0.12, 0.015], [px + Math.cos(a) * 0.08, py + 0.05, pz + Math.sin(a) * 0.08]); }
  k.cone('#85827b', 0.2, 0.1, [px, py + 0.15, pz], { seg: 7 });
  k.cyl('#3a3633', 0.2, 0.2, 0.012, [px, py + 0.1, pz], { seg: 7 });
  // soot stain on the roof around the vent
  k.top('#8a857a', roofY + 0.005, [[vx - 0.45, vz - 0.3], [vx + 0.4, vz - 0.4], [vx + 0.5, vz + 0.35], [vx - 0.35, vz + 0.45]], { off: 0.01 });
  // roof rack strip with a tarp bundle near the front
  k.box('#6f7378', [0.04, 0.05, 1.6], [0.9, roofY + 0.02, 1.35]);
  k.box('#6f7378', [0.04, 0.05, 1.6], [0.35, roofY + 0.02, 1.35]);
  k.box('#6f6a4f', [0.6, 0.24, 0.9], [0.62, roofY + 0.05, 1.4], { c: 0.08, cv: true, base: true });
  k.box('#3d3b33', [0.62, 0.03, 0.04], [0.62, roofY + 0.2, 1.2]);
  k.box('#3d3b33', [0.62, 0.03, 0.04], [0.62, roofY + 0.2, 1.62]);

  // ── door (rust-red replacement): bone `door` at its FRONT hinge on −X ────
  // rotation.y on `door` swings it open: POSITIVE = opens outward (rear edge swings out to −X), ~1.3 rad fully open.
  const dz0 = 0.5, dz1 = 1.3, dy0 = 0.66, dy1 = 2.52, dl = dz1 - dz0;
  const hinge = [-hw - 0.004, 0, dz1];
  const doorBone = rig.add('door', hinge, 'body');
  const dk = k;
  k.withBone(doorBone, () => k.at(hinge, () => {
  dk.box(PAL.rvDoor, [0.05, dy1 - dy0, dl], [-0.025, (dy0 + dy1) / 2, -dl / 2]);
  const dh = -0.054;
  dk.rectX('#2b2c2e', dh, [-dl + 0.12, -0.12], [1.72, 2.3], -1);
  dk.rectX(PAL.glass, dh - 0.004, [-dl + 0.16, -0.16], [1.76, 2.26], -1);
  dk.rectX(PAL.curtain, dh - 0.008, [-dl + 0.16, -dl + 0.32], [1.76, 2.26], -1);
  dk.rectX(shade(PAL.rvDoor, 0.82), dh, [-dl + 0.1, -0.1], [0.82, 1.5], -1);
  dk.rectX(shade(PAL.rvDoor, 1.08), dh - 0.004, [-dl + 0.14, -0.14], [0.86, 1.46], -1);
  dk.rectX(PAL.rustDark, dh - 0.008, [-0.55, -0.32], [0.7, 0.82], -1);
  dk.rectX(PAL.rust, dh - 0.01, [-0.3, -0.18], [1.9, 1.98], -1);
  dk.rectX(mix(PAL.rvDoor, PAL.mud, 0.4), dh - 0.004, [-dl + 0.02, -0.02], [0.68, 0.78], -1);
  dk.box(PAL.chrome, [0.05, 0.05, 0.14], [-0.07, 1.48, -dl + 0.14]);
  dk.box('#4a4b4d', [0.03, 0.06, 0.04], [-0.06, 0.95, -0.02]);
  dk.box('#4a4b4d', [0.03, 0.06, 0.04], [-0.06, 2.2, -0.02]);
  }));
  void dz0;

  // ── window_glow: quads over every coach window; renderer tints for fire ──
  const gk = new Kit(13);
  const glowRects = [
    [1, -3.45, -2.55], [1, -0.75, 0.55], [1, 1.05, 1.7], [-1, -3.2, -2.3], [-1, -1.4, -0.4],
  ];
  for (const [s, z0, z1] of glowRects) gk.side('#ff8a3a', hw, [[z0, 1.62], [z1, 1.62], [z1, 2.3], [z0, 2.3]], { side: s, off: 0.045 });
  gk.front('#ff8a3a', zb - 0.005, [[-0.56, 2.23], [0.56, 2.23], [0.56, 2.67], [-0.56, 2.67]], -1, { off: 0.04 });
  const glowMat = new THREE.MeshBasicMaterial({ color: '#ff7a2a', transparent: true, opacity: 0.85, name: 'CR_RV_WindowGlow', vertexColors: false, depthWrite: false });
  const glow = new THREE.Mesh(gk.geometry(), glowMat);
  glow.name = 'window_glow';
  glow.visible = false;
  glow.userData.hiddenByDefault = true;
  glow.castShadow = false;
  glow.renderOrder = 2;

  // ── wheels + attachment empties ─────────────────────────────────────────
  fourWheels(k, rig, { zf, zr, x: hw - ww / 2 + 0.03, xf: chw - ww / 2 + 0.03, r: wr, w: ww, style: 'steel' });
  const bones = finish(g, k, rig);
  bones.body.add(glow);
  // brake / tail lenses: own meshes + emissive material so the renderer can light them (rig 'light_brake*')
  const brakeMat = lampMaterial(PAL.taillight, '#ff3524', 'CR_Lamp_Brake');
  brakeMat.emissiveIntensity = 0.15;
  const brakeGeo = new THREE.BoxGeometry(0.16, 0.5, 0.05);
  for (const [name, s] of [['light_brake_l', 1], ['light_brake_r', -1]]) {
    const m = new THREE.Mesh(brakeGeo, brakeMat);
    m.name = name;
    m.position.set(s * 1.06, 1.1, zb - 0.02);
    bones.body.add(m);
  }
  g.userData.perInstanceMaterials = ['window_glow', 'light_brake_l', 'light_brake_r'];
  bones.body.add(empty('vent', ventPos));
  bones.body.add(empty('exhaust', [0.78, 0.36, zb - 0.2]));
  bones.body.add(empty('headlight_l', [0.86, 0.98, 4.33]));
  bones.body.add(empty('headlight_r', [-0.86, 0.98, 4.33]));
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// Generic car: lower-body side profile + tapered cabin ("greenhouse").
// ═════════════════════════════════════════════════════════════════════════════
/**
 * spec: { L, W, profile:[[z,y]..], bevel, cabin:{y0,y1,zb,zt,wb,wt}, wheel:{r,w,zf,zr,style},
 *         color, roofColor, glass, pillarSplit:[..], lights:{fz, rz, fy, ry}, grimeSeed, ...}
 */
function carBody(k, s) {
  const hw = s.W / 2;
  const col = s.color;
  k.extrude(col, s.profile, s.W, { axis: 'x', bevel: s.bevel ?? 0.07 });
  k.box(PAL.under, [s.W * 0.8, 0.16, s.L * 0.86], [0, s.wheel.r * 0.75, 0]);
  // cabin
  const c = s.cabin;
  const faces = k.frustum({ default: s.cabinColor || col, top: s.roofColor || s.cabinColor || col }, c);
  // windows on the cabin
  const glassFrame = s.frame || '#262729';
  k.patch(glassFrame, faces.front, [0.03, 0.97], [0.04, 0.95], { off: 0.008 });
  k.patch(PAL.glass, faces.front, [0.07, 0.93], [0.09, 0.9], { off: 0.014 });
  k.patch(PAL.glassHi, faces.front, [0.62, 0.7], [0.14, 0.85], { off: 0.018, skew: -0.08 });
  k.patch(glassFrame, faces.back, [0.05, 0.95], [0.06, 0.94], { off: 0.008 });
  k.patch(PAL.glass, faces.back, [0.09, 0.91], [0.12, 0.9], { off: 0.014 });
  const split = s.pillarSplit || [[0.05, 0.47], [0.53, 0.93]];
  for (const f of [faces.left, faces.right]) {
    k.patch(glassFrame, f, [0.02, 0.98], [0.06, 0.94], { off: 0.008 });
    for (const [u0, u1] of split) k.patch(PAL.glass, f, [u0, u1], [0.12, 0.88], { off: 0.014 });
  }
  // wheel arches
  const { r, zf, zr } = s.wheel;
  const yb = s.profile[0][1];
  arch(k, hw, zf, r, r + 0.08, yb, '#1a1a1b');
  arch(k, hw, zr, r, r + 0.08, yb, '#1a1a1b');
  // dirt band
  const dz0 = s.profile[0][0] + 0.12, dz1 = s.profile[1][0] - 0.12;
  k.side(mix(col, PAL.dirt, 0.4), hw, [[dz0, yb + 0.02], [dz1, yb + 0.02], [dz1, yb + 0.14], [dz0, yb + 0.14]], { off: 0.016 });
  return faces;
}

function carLights(k, s) {
  const { fz, rz, fy, ry, fx = s.W / 2 - 0.3, rx = s.W / 2 - 0.26 } = s.lights;
  for (const sd of [1, -1]) {
    k.box(PAL.headlight, [0.3, 0.12, 0.06], [sd * fx, fy, fz], { c: 0.02 });
    k.box(PAL.amber, [0.1, 0.08, 0.05], [sd * (fx + 0.22), fy - 0.02, fz - 0.02]);
    k.box(PAL.taillight, [0.3, 0.14, 0.06], [sd * rx, ry, rz], { c: 0.02 });
  }
  k.box(PAL.grille, [s.W * 0.42, 0.12, 0.05], [0, fy - 0.04, fz]);
  // bumpers
  const bc = s.bumper || '#3a3b3e';
  k.box(bc, [s.W * 0.98, 0.17, 0.2], [0, s.bumperY ?? 0.42, fz - 0.02], { c: 0.04 });
  k.box(bc, [s.W * 0.98, 0.17, 0.2], [0, s.bumperY ?? 0.42, rz + 0.02], { c: 0.04 });
  k.box(PAL.plate, [0.36, 0.12, 0.02], [0, (s.bumperY ?? 0.42) + 0.02, rz - 0.09]);
}

function mirrors(k, W, y, z, color) {
  for (const s of [1, -1]) k.box(color, [0.16, 0.12, 0.08], [s * (W / 2 + 0.06), y, z], { c: 0.02 });
}

function doorSeams(k, hw, zs, y0, y1, color) {
  for (const z of zs) k.side(color, hw, [[z - 0.012, y0], [z + 0.012, y0], [z + 0.012, y1], [z - 0.012, y1]], { off: 0.018 });
}
function handles(k, hw, zs, y) { for (const z of zs) for (const s of [1, -1]) k.box('#2b2b2c', [0.03, 0.03, 0.12], [s * (hw + 0.012), y, z]); }

// ── sedan ────────────────────────────────────────────────────────────────────
const SEDAN = {
  L: 4.6, W: 1.9,
  profile: [[-2.28, 0.26], [2.25, 0.26], [2.32, 0.5], [2.27, 0.7], [2.08, 0.8], [0.86, 0.9], [-1.28, 0.92], [-2.2, 0.88], [-2.32, 0.64]],
  cabin: { y0: 0.86, y1: 1.38, zb: [-1.32, 0.92], zt: [-0.92, 0.18], wb: 0.89, wt: 0.72 },
  wheel: { r: 0.34, w: 0.24, zf: 1.42, zr: -1.38 },
  lights: { fz: 2.27, rz: -2.29, fy: 0.64, ry: 0.74 },
};

function grime(k, s, variant, hw) {
  // grounded wear: some variants get a rust patch or a mismatched panel
  const col = s.color;
  if (variant % 3 === 2) { sideBlob(k, PAL.rust, hw, s.wheel.zr - 0.45, 0.5, 0.12, 0.07, 40 + variant, 1); sideBlob(k, PAL.rustDark, hw, s.wheel.zr - 0.45, 0.5, 0.05, 0.03, 41 + variant, 1, 0.026); }
  if (variant % 6 === 3) {
    // primer-grey replacement front fender (−X side)
    const zf = s.wheel.zf;
    k.side(PAL.primer, hw, [[zf - 0.48, s.profile[0][1] + 0.05], [s.profile[2][0] - 0.12, s.profile[0][1] + 0.05], [s.profile[2][0] - 0.2, s.cabin.y0 - 0.03], [zf - 0.5, s.cabin.y0 - 0.02]], { side: -1, off: 0.014 });
    arch(k, hw, zf, s.wheel.r, s.wheel.r + 0.08, s.profile[0][1], '#1a1a1b', { side: -1 });
  }
  if (variant % 4 === 1) sideBlob(k, shade(col, 0.82), hw, 0.2, 0.62, 0.18, 0.06, 50 + variant, -1); // dent shadow
}

export function buildSedan(variant = 0, override = {}) {
  const s = { ...SEDAN, color: PAL.civ[variant % 6], ...override };
  const g = root(override.kind || 'sedan', variant, { w: s.W, h: 1.4, l: s.L });
  const k = new Kit(100 + variant);
  const rig = vrig();
  const hw = s.W / 2;
  carBody(k, s);
  carLights(k, s);
  doorSeams(k, hw, [0.86, -0.22, -1.25], 0.34, 0.88, shade(s.color, 0.7));
  handles(k, hw, [0.6, -0.48], 0.8);
  mirrors(k, s.W, 0.96, 0.78, s.mirror || s.color);
  if (!override.noGrime) grime(k, s, variant, hw);
  if (override.decorate) override.decorate(k, s);
  fourWheels(k, rig, { zf: s.wheel.zf, zr: s.wheel.zr, x: hw - s.wheel.w / 2 + 0.02, r: s.wheel.r, w: s.wheel.w, style: s.wheelStyle || 'steel' });
  finish(g, k, rig);
  return g;
}

// ── hatchback ────────────────────────────────────────────────────────────────
export function buildHatch(variant = 0) {
  const s = {
    L: 3.9, W: 1.8, color: PAL.civ[(variant + 2) % 6],
    profile: [[-1.92, 0.26], [1.9, 0.26], [1.96, 0.5], [1.92, 0.68], [1.74, 0.78], [0.78, 0.88], [-1.86, 0.92], [-1.96, 0.64]],
    cabin: { y0: 0.86, y1: 1.44, zb: [-1.86, 0.82], zt: [-1.62, 0.02], wb: 0.84, wt: 0.68 },
    wheel: { r: 0.32, w: 0.22, zf: 1.22, zr: -1.22 },
    lights: { fz: 1.93, rz: -1.95, fy: 0.64, ry: 0.86, rx: 0.68 },
    pillarSplit: [[0.05, 0.5], [0.56, 0.86]],
  };
  const g = root('hatch', variant, { w: s.W, h: 1.45, l: s.L });
  const k = new Kit(200 + variant);
  const rig = vrig();
  const hw = s.W / 2;
  carBody(k, s);
  carLights(k, s);
  doorSeams(k, hw, [0.8, -0.42], 0.34, 0.88, shade(s.color, 0.7));
  handles(k, hw, [0.5], 0.8);
  mirrors(k, s.W, 0.96, 0.7, s.color);
  // roof spoiler + wiper
  k.box(shade(s.color, 0.9), [1.3, 0.05, 0.22], [0, 1.45, -1.58], { c: 0.02 });
  if (variant % 2 === 1) { // roof rails
    for (const sd of [1, -1]) k.box('#2f3033', [0.04, 0.05, 1.3], [sd * 0.6, 1.47, -0.75]);
  }
  grime(k, s, variant, hw);
  fourWheels(k, rig, { zf: s.wheel.zf, zr: s.wheel.zr, x: hw - s.wheel.w / 2 + 0.02, r: s.wheel.r, w: s.wheel.w, style: variant % 2 ? 'dark' : 'steel' });
  finish(g, k, rig);
  return g;
}

// ── van (panel van / window van) ─────────────────────────────────────────────
export function buildVan(variant = 0) {
  const L = 5.0, W = 2.0, hw = W / 2;
  const color = PAL.civ[(variant + 4) % 6];
  const g = root('van', variant, { w: W, h: 2.1, l: L });
  const k = new Kit(300 + variant);
  const rig = vrig();
  const prof = [[-2.48, 0.32], [2.42, 0.32], [2.5, 0.56], [2.46, 0.86], [2.2, 1.04], [1.62, 1.16], [0.98, 1.98], [-2.38, 2.04], [-2.5, 1.9]];
  k.extrude(color, prof, W, { axis: 'x', bevel: 0.1 });
  k.box(PAL.under, [W * 0.8, 0.16, L * 0.86], [0, 0.3, 0]);
  const wr = 0.36, zf = 1.62, zr = -1.62;
  arch(k, hw, zf, wr, wr + 0.08, 0.32, '#1a1a1b');
  arch(k, hw, zr, wr, wr + 0.08, 0.32, '#1a1a1b');
  // windshield on the slope
  edgeQuad(k, '#262729', [1.62, 1.16], [0.98, 1.98], [-0.86, 0.86], [0.04, 0.96]);
  edgeQuad(k, PAL.glass, [1.62, 1.16], [0.98, 1.98], [-0.8, 0.8], [0.09, 0.91], 0.02);
  edgeQuad(k, PAL.glassHi, [1.62, 1.16], [0.98, 1.98], [0.2, 0.32], [0.15, 0.85], 0.024);
  // front door windows
  k.side('#262729', hw, [[0.42, 1.2], [1.5, 1.2], [0.98, 1.88], [0.42, 1.88]], { off: 0.016 });
  k.side(PAL.glass, hw, [[0.47, 1.25], [1.42, 1.25], [0.96, 1.83], [0.47, 1.83]], { off: 0.022 });
  const windowVan = variant % 2 === 1;
  if (windowVan) {
    for (const [z0, z1] of [[-0.9, 0.3], [-2.2, -1.05]]) sideWindow(k, hw, z0, z1, 1.25, 1.83, { frameColor: '#262729', frame: 0.04 });
  } else {
    // panel van: a faded business stripe
    k.side(shade(color, 0.78), hw, [[-2.3, 1.05], [0.3, 1.05], [0.3, 1.15], [-2.3, 1.15]], { off: 0.016 });
    k.side(PAL.white, hw, [[-2.0, 1.32], [-0.3, 1.32], [-0.3, 1.72], [-2.0, 1.72]], { off: 0.016 });
    k.side(shade(color, 0.6), hw, [[-1.85, 1.42], [-0.45, 1.42], [-0.45, 1.5], [-1.85, 1.5]], { off: 0.022 });
    k.side(shade(color, 0.6), hw, [[-1.85, 1.56], [-0.9, 1.56], [-0.9, 1.62], [-1.85, 1.62]], { off: 0.022 });
  }
  // sliding door seam + rear doors
  doorSeams(k, hw, [0.4, -1.0], 0.38, 1.94, shade(color, 0.7));
  k.front(shade(color, 0.7), -2.5, [[-0.012, 0.4], [0.012, 0.4], [0.012, 1.9], [-0.012, 1.9]], -1, { off: 0.012 });
  k.front('#262729', -2.5, [[-0.8, 1.3], [-0.06, 1.3], [-0.06, 1.8], [-0.8, 1.8]], -1, { off: 0.012 });
  k.front('#262729', -2.5, [[0.06, 1.3], [0.8, 1.3], [0.8, 1.8], [0.06, 1.8]], -1, { off: 0.012 });
  k.front(PAL.glass, -2.5, [[-0.76, 1.34], [-0.1, 1.34], [-0.1, 1.76], [-0.76, 1.76]], -1, { off: 0.018 });
  k.front(PAL.glass, -2.5, [[0.1, 1.34], [0.76, 1.34], [0.76, 1.76], [0.1, 1.76]], -1, { off: 0.018 });
  k.side(mix(color, PAL.dirt, 0.4), hw, [[-2.36, 0.34], [2.3, 0.34], [2.3, 0.5], [-2.36, 0.5]], { off: 0.016 });
  carLights(k, { W, lights: { fz: 2.45, rz: -2.5, fy: 0.78, ry: 0.9, rx: 0.82 }, bumperY: 0.44 });
  mirrors(k, W, 1.25, 1.45, '#2a2a2b');
  handles(k, hw, [0.6, 0.2], 1.0);
  if (variant % 2 === 0) { // ladder rack
    for (const z of [-1.9, -0.4, 0.8]) k.box('#3a3b3d', [1.8, 0.05, 0.05], [0, 2.12, z]);
    for (const sd of [1, -1]) k.box('#3a3b3d', [0.05, 0.05, 2.8], [sd * 0.86, 2.15, -0.55]);
    k.box('#c7c3b8', [0.38, 0.06, 2.9], [0.3, 2.2, -0.5]);
  }
  grime(k, { color, wheel: { zr, zf, r: wr }, profile: prof, cabin: { y0: 1.16 } }, variant, hw);
  fourWheels(k, rig, { zf, zr, x: hw - 0.12 + 0.02, r: wr, w: 0.24, style: 'steel' });
  finish(g, k, rig);
  return g;
}

// ── pickup (also base for rival) ─────────────────────────────────────────────
function pickupKit(k, color, o = {}) {
  const W = 2.0, hw = W / 2, lift = o.lift || 0;
  const L2 = 2.7;
  const prof = [[-L2, 0.36], [2.62, 0.36], [2.7, 0.58], [2.66, 0.82], [2.48, 0.98], [1.18, 1.06], [-0.42, 1.08], [-0.42, 0.74], [-2.66, 0.74], [-2.72, 0.6]]
    .map(([z, y]) => [z, y + lift]);
  k.extrude(color, prof, W, { axis: 'x', bevel: 0.07 });
  k.box(PAL.under, [W * 0.75, 0.2 + lift * 0.4, 5.0], [0, 0.34 + lift * 0.6, 0]);
  const cab = { y0: 1.02 + lift, y1: 1.74 + lift, zb: [-0.42, 1.22], zt: [-0.38, 0.5], wb: 0.95, wt: 0.82 };
  const faces = k.frustum({ default: color, top: o.roof || color }, cab);
  k.patch('#262729', faces.front, [0.03, 0.97], [0.04, 0.95], { off: 0.008 });
  k.patch(PAL.glass, faces.front, [0.07, 0.93], [0.09, 0.9], { off: 0.014 });
  k.patch(PAL.glassHi, faces.front, [0.62, 0.7], [0.14, 0.85], { off: 0.018, skew: -0.08 });
  k.patch('#262729', faces.back, [0.15, 0.85], [0.25, 0.85], { off: 0.01 });
  k.patch(PAL.glass, faces.back, [0.18, 0.82], [0.3, 0.8], { off: 0.016 });
  for (const f of [faces.left, faces.right]) {
    k.patch('#262729', f, [0.04, 0.9], [0.08, 0.92], { off: 0.008 });
    k.patch(PAL.glass, f, [0.08, 0.6], [0.14, 0.86], { off: 0.014 });
    k.patch(PAL.glass, f, [0.64, 0.86], [0.14, 0.86], { off: 0.014 });
  }
  // bed walls + tailgate + liner
  const by0 = 0.74 + lift, by1 = 1.12 + lift;
  for (const s of [1, -1]) k.box(color, [0.08, by1 - by0, 2.24], [s * (hw - 0.04), (by0 + by1) / 2, -1.55], { c: 0.02 });
  k.box(color, [W, by1 - by0, 0.08], [0, (by0 + by1) / 2, -2.66], { c: 0.02 });
  k.top('#2c2b2a', by0, [[-hw + 0.08, -2.62], [hw - 0.08, -2.62], [hw - 0.08, -0.46], [-hw + 0.08, -0.46]], { off: 0.01 });
  for (let i = 0; i < 5; i++) k.top('#363533', by0, [[-hw + 0.1 + i * 0.38, -2.6], [-hw + 0.16 + i * 0.38, -2.6], [-hw + 0.16 + i * 0.38, -0.5], [-hw + 0.1 + i * 0.38, -0.5]], { off: 0.016 });
  k.box(shade(color, 0.8), [0.6, 0.06, 0.04], [0, by1 - 0.12, -2.71]);
  // arches + details
  const wr = o.wr || 0.37, zf = 1.72, zr = -1.62;
  arch(k, hw, zf, wr + lift, wr + 0.08, 0.36 + lift, '#1a1a1b', { lip: o.flares });
  arch(k, hw, zr, wr + lift, wr + 0.08, 0.36 + lift, '#1a1a1b', { lip: o.flares });
  k.side(mix(color, PAL.dirt, 0.4), hw, [[-2.6, 0.38 + lift], [2.55, 0.38 + lift], [2.55, 0.52 + lift], [-2.6, 0.52 + lift]], { off: 0.016 });
  doorSeams(k, hw, [1.2, -0.36], 0.42 + lift, 1.04 + lift, shade(color, 0.68));
  handles(k, hw, [-0.1], 0.98 + lift);
  mirrors(k, W, 1.18 + lift, 1.1, '#2a2a2b');
  carLights(k, { W, lights: { fz: 2.68, rz: -2.7, fy: 0.78 + lift, ry: 0.95 + lift, rx: 0.86 }, bumperY: 0.46 + lift, bumper: o.bumper || PAL.chrome });
  return { W, hw, wr, zf, zr, lift, prof };
}

export function buildPickup(variant = 0) {
  const color = PAL.civ[(variant + 1) % 6];
  const g = root('pickup', variant, { w: 2.0, h: 1.75, l: 5.4 });
  const k = new Kit(400 + variant);
  const rig = vrig();
  const p = pickupKit(k, color, { roof: variant % 3 === 1 ? PAL.offWhite : color });
  if (variant % 2 === 0) { // load in the bed: tarp bundle / toolbox
    k.box('#3c3d3f', [1.7, 0.3, 0.4], [0, 1.12 + 0.15, -0.72], { c: 0.03 });
    k.box('#7b7a5a', [1.1, 0.34, 0.9], [0.2, 0.74, -1.9], { c: 0.08, base: true });
  }
  grime(k, { color, wheel: { zr: p.zr, zf: p.zf, r: p.wr }, profile: p.prof, cabin: { y0: 1.02 } }, variant, p.hw);
  fourWheels(k, rig, { zf: p.zf, zr: p.zr, x: p.hw - 0.13 + 0.02, r: p.wr, w: 0.26, style: variant % 2 ? 'chrome' : 'steel' });
  finish(g, k, rig);
  return g;
}

// ── rival: lifted black pickup, bull bar, original flame decal ───────────────
export function buildRival() {
  const color = '#1c1d1f';
  const g = root('rival', 0, { w: 2.1, h: 2.2, l: 5.4 });
  const k = new Kit(450);
  const rig = vrig();
  const lift = 0.32;
  const p = pickupKit(k, color, { lift, wr: 0.5, flares: '#121213', bumper: '#262729' });
  const hw = p.hw;
  // flames: orange outer, mustard inner, swept back from the front fender
  const fl = (sc, dz) => {
    const base = 0.72 + lift, pts = [[2.5, base], [2.5, base + 0.32]];
    const tongues = [[1.9, 0.3, 1.5], [1.3, 0.24, 0.85], [0.7, 0.2, 0.05], [0.15, 0.16, -0.5], [-0.4, 0.1, -0.85]];
    for (const [zz, hh, tip] of tongues) { pts.push([zz + dz, base + hh * sc + 0.06]); pts.push([tip, base + (hh * 0.55) * sc]); }
    pts.push([-0.85, base + 0.04], [0.4, base - 0.04], [1.6, base - 0.06]);
    return pts;
  };
  k.side('#c8622c', hw, fl(1.0, 0), { off: 0.02 });
  k.side('#d9a83a', hw, fl(0.6, 0.15).map(([z, y]) => [z * 0.92 + 0.2, y + 0.04]), { off: 0.026 });
  // bull bar
  const bz = 2.86, by = 0.62 + lift;
  for (const s of [1, -1]) {
    k.box('#2a2a2c', [0.07, 0.75, 0.07], [s * 0.55, by + 0.2, bz]);
    k.box('#2a2a2c', [0.07, 0.07, 0.3], [s * 0.55, by - 0.1, bz - 0.14]);
  }
  k.box('#2a2a2c', [1.4, 0.07, 0.07], [0, by + 0.56, bz]);
  k.box('#2a2a2c', [1.9, 0.12, 0.12], [0, by - 0.1, bz - 0.04]);
  k.box('#2a2a2c', [1.1, 0.06, 0.06], [0, by + 0.25, bz + 0.02]);
  // roof light bar (amber off-road lamps), exhaust stack, step bars
  k.box('#1b1b1c', [1.5, 0.1, 0.16], [0, 1.82 + lift, 0.42]);
  for (let i = 0; i < 4; i++) k.box('#e8d9a6', [0.24, 0.08, 0.03], [-0.54 + i * 0.36, 1.82 + lift, 0.51]);
  for (const s of [1, -1]) k.box('#2f2f31', [0.16, 0.06, 1.6], [s * (hw + 0.06), 0.62, 0.1]);
  k.cyl('#6e6c66', 0.06, 0.06, 0.9, [-0.85, 1.55 + lift, -0.55], { seg: 6 });
  // mud spatter
  for (const s of [1, -1]) {
    sideBlob(k, '#4a3c2e', hw, -2.3, 0.62 + lift, 0.3, 0.12, 60 + s, s, 0.03);
    sideBlob(k, '#4a3c2e', hw, 0.95, 0.55 + lift, 0.28, 0.1, 64 + s, s, 0.03);
  }
  fourWheels(k, rig, { zf: p.zf, zr: p.zr, x: hw - 0.08, r: p.wr, w: 0.36, style: 'black' });
  finish(g, k, rig);
  return g;
}

// ── police sedan ─────────────────────────────────────────────────────────────
const _lampGeo = new Map();
function addLightBar(g, k, y, z, width, depth) {
  k.box('#1d1e21', [width + 0.08, 0.08, depth + 0.06], [0, y + 0.04, z], { c: 0.02 });
  k.box('#2a2b2f', [0.24, 0.12, depth], [0, y + 0.14, z]);
  const geo = _lampGeo.get(width) || _lampGeo.set(width, new THREE.BoxGeometry(width / 2 - 0.14, 0.13, depth)).get(width);
  const red = new THREE.Mesh(geo, lampMaterial(PAL.lightRedOff, PAL.lightRedOn, 'CR_Lamp_Red'));
  red.name = 'light_red'; red.position.set(width / 4 + 0.07, y + 0.145, z);
  const blue = new THREE.Mesh(geo, lampMaterial(PAL.lightBlueOff, PAL.lightBlueOn, 'CR_Lamp_Blue'));
  blue.name = 'light_blue'; blue.position.set(-(width / 4 + 0.07), y + 0.145, z);
  g.userData.perInstanceMaterials = ['light_red', 'light_blue'];
  return [red, blue];
}

function pushBar(k, W, fz, y0) {
  const c = '#18191b';
  for (const s of [1, -1]) {
    k.box(c, [0.07, 0.62, 0.07], [s * 0.42, y0 + 0.31, fz + 0.18]);
    k.box(c, [0.06, 0.06, 0.22], [s * 0.42, y0 + 0.1, fz + 0.08]);
  }
  k.box(c, [1.0, 0.07, 0.07], [0, y0 + 0.6, fz + 0.18]);
  k.box(c, [1.0, 0.06, 0.06], [0, y0 + 0.36, fz + 0.2]);
  k.box(c, [1.2, 0.14, 0.12], [0, y0 + 0.08, fz + 0.12], { c: 0.02 });
}

function badge(k, hw, zc, yc, r, color, side) {
  const pts = [];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + Math.PI / 2; const rr = i % 2 ? r * 0.5 : r; pts.push([zc + Math.cos(a) * rr, yc + Math.sin(a) * rr]); }
  k.side(color, hw, pts, { side, off: 0.024 });
}

export function buildCop() {
  const navy = PAL.copNavy, white = PAL.copWhite;
  const s = { ...SEDAN, L: 4.8, color: navy, roofColor: white, cabinColor: navy, mirror: navy,
    profile: SEDAN.profile.map(([z, y]) => [z * 1.04, y]),
    cabin: { ...SEDAN.cabin, zb: [-1.36, 0.94], zt: [-0.96, 0.18] },
    wheel: { ...SEDAN.wheel, zf: 1.5, zr: -1.42 },
    lights: { ...SEDAN.lights, fz: 2.36, rz: -2.38 }, wheelStyle: 'dark',
  };
  const g = root('cop', 0, { w: 1.95, h: 1.6, l: 4.95 });
  const k = new Kit(500);
  const rig = vrig();
  const hw = s.W / 2;
  carBody(k, s);
  carLights(k, s);
  // white doors (both sides): from front door edge to rear door edge, sill to beltline
  for (const sd of [1, -1]) {
    k.side(white, hw, [[0.9, 0.34], [-1.3, 0.34], [-1.3, 0.9], [0.9, 0.9]], { side: sd, off: 0.016 });
    badge(k, hw, 0.35, 0.66, 0.13, '#c9a24a', sd);
    k.side(navy, hw, [[-1.25, 0.46], [0.85, 0.46], [0.85, 0.5], [-1.25, 0.5]], { side: sd, off: 0.022 });
  }
  doorSeams(k, hw, [0.9, -0.22, -1.3], 0.34, 0.9, '#9a9a96');
  handles(k, hw, [0.62, -0.5], 0.8);
  mirrors(k, s.W, 0.96, 0.8, navy);
  pushBar(k, s.W, 2.38, 0.28);
  // A-pillar spotlight + antenna
  k.cyl(PAL.chrome, 0.06, 0.06, 0.12, [0.92, 1.0, 0.74], { axis: 'z', seg: 6 });
  k.box('#111', [0.02, 0.5, 0.02], [-0.5, 1.6, -1.6]);
  // hood number box / unit number block on the roof (white roof already)
  k.rectY(navy, 1.385, [-0.2, 0.2], [-0.75, -0.45], { off: 0.006 });
  fourWheels(k, rig, { zf: s.wheel.zf, zr: s.wheel.zr, x: hw - s.wheel.w / 2 + 0.02, r: s.wheel.r, w: s.wheel.w, style: 'dark' });
  const lights = addLightBar(g, k, 1.38, -0.3, 1.24, 0.3);
  const bones = finish(g, k, rig);
  for (const l of lights) bones.body.add(l);
  return g;
}

// ── police SUV ───────────────────────────────────────────────────────────────
export function buildCopSUV() {
  const dark = PAL.copSuv, white = PAL.copWhite;
  const W = 2.05, hw = W / 2;
  const s = {
    L: 5.1, W, color: dark, roofColor: '#1a2133',
    profile: [[-2.5, 0.42], [2.45, 0.42], [2.54, 0.68], [2.5, 0.98], [2.26, 1.12], [1.22, 1.22], [-2.45, 1.24], [-2.55, 1.0]],
    cabin: { y0: 1.18, y1: 1.9, zb: [-2.45, 1.26], zt: [-2.36, 0.46], wb: 0.98, wt: 0.88 },
    wheel: { r: 0.4, w: 0.28, zf: 1.62, zr: -1.6 },
    lights: { fz: 2.5, rz: -2.53, fy: 0.9, ry: 1.0, rx: 0.86 },
    pillarSplit: [[0.04, 0.32], [0.36, 0.62], [0.66, 0.94]], bumperY: 0.5,
  };
  const g = root('cop_suv', 0, { w: 2.1, h: 2.15, l: 5.3 });
  const k = new Kit(520);
  const rig = vrig();
  carBody(k, s);
  carLights(k, s);
  for (const sd of [1, -1]) {
    k.side(white, hw, [[1.18, 0.75], [-1.3, 0.75], [-1.3, 0.95], [1.18, 0.95]], { side: sd, off: 0.016 });
    k.side('#5f6c86', hw, [[1.18, 0.7], [-1.3, 0.7], [-1.3, 0.73], [1.18, 0.73]], { side: sd, off: 0.016 });
    badge(k, hw, 0.55, 1.05, 0.1, '#c9a24a', sd);
  }
  doorSeams(k, hw, [1.2, -0.08, -1.3], 0.46, 1.2, '#0b0e16');
  handles(k, hw, [0.9, -0.36], 1.1);
  mirrors(k, W, 1.28, 1.05, dark);
  pushBar(k, W, 2.52, 0.32);
  for (const sd of [1, -1]) k.box('#2a2b2f', [0.05, 0.06, 2.6], [sd * 0.8, 1.94, -0.9]);
  k.box('#2b2c2f', [0.08, 0.6, 0.08], [-0.6, 2.2, -2.1]);
  fourWheels(k, rig, { zf: s.wheel.zf, zr: s.wheel.zr, x: hw - s.wheel.w / 2 + 0.02, r: s.wheel.r, w: s.wheel.w, style: 'black' });
  const lights = addLightBar(g, k, 1.92, -0.25, 1.4, 0.32);
  const bones = finish(g, k, rig);
  for (const l of lights) bones.body.add(l);
  return g;
}

// ── bus ──────────────────────────────────────────────────────────────────────
export function buildBus(variant = 0) {
  const L = 11, W = 2.6, hw = W / 2, H = 3.1;
  const liveries = [['#d6c08a', '#4f8f8a'], ['#e2dccb', '#b85c6a'], ['#c9c5b6', '#6f8fb0']];
  const [cBody, cBand] = liveries[variant % 3];
  const g = root('bus', variant, { w: W, h: H, l: L });
  const k = new Kit(600 + variant);
  const rig = vrig();
  const prof = [[-5.5, 0.38], [5.42, 0.38], [5.52, 0.7], [5.5, 2.6], [5.35, 3.0], [-5.35, 3.04], [-5.5, 2.85]];
  k.extrude(cBody, prof, W, { axis: 'x', bevel: 0.12 });
  k.box(PAL.under, [W * 0.85, 0.2, L * 0.9], [0, 0.4, 0]);
  // livery band + bottom skirt
  k.side(cBand, hw, [[-5.4, 0.42], [5.42, 0.42], [5.42, 1.0], [-5.4, 1.0]]);
  k.side(shade(cBand, 0.8), hw, [[-5.4, 1.0], [5.42, 1.0], [5.42, 1.06], [-5.4, 1.06]], { off: 0.016 });
  k.side(mix(cBand, PAL.dirt, 0.45), hw, [[-5.4, 0.42], [5.42, 0.42], [5.42, 0.58], [-5.4, 0.58]], { off: 0.018 });
  // window row (both sides) with pillars
  k.side('#232426', hw, [[-4.9, 1.38], [4.3, 1.38], [4.3, 2.48], [-4.9, 2.48]], { off: 0.016 });
  const n = 7, z0 = -4.84, z1 = 4.24, pw = (z1 - z0) / n;
  for (let i = 0; i < n; i++) {
    const a = z0 + i * pw + 0.06, b = z0 + (i + 1) * pw - 0.06;
    k.side(PAL.glass, hw, [[a, 1.44], [b, 1.44], [b, 2.42], [a, 2.42]], { off: 0.022 });
    k.side(PAL.glassHi, hw, [[a + 0.3, 1.5], [a + 0.42, 1.5], [a + 0.62, 2.36], [a + 0.5, 2.36]], { off: 0.026 });
  }
  // doors on the −X (kerb) side: front + middle
  for (const [za, zb2] of [[3.95, 5.0], [-0.6, 0.55]]) {
    k.side('#232426', hw, [[za, 0.45], [zb2, 0.45], [zb2, 2.5], [za, 2.5]], { side: -1, off: 0.03 });
    k.side(PAL.glass, hw, [[za + 0.06, 0.55], [(za + zb2) / 2 - 0.03, 0.55], [(za + zb2) / 2 - 0.03, 2.42], [za + 0.06, 2.42]], { side: -1, off: 0.036 });
    k.side(PAL.glass, hw, [[(za + zb2) / 2 + 0.03, 0.55], [zb2 - 0.06, 0.55], [zb2 - 0.06, 2.42], [(za + zb2) / 2 + 0.03, 2.42]], { side: -1, off: 0.036 });
  }
  // windshield + destination sign
  k.front('#232426', 5.52, [[-1.2, 1.15], [1.2, 1.15], [1.2, 2.65], [-1.2, 2.65]], 1, { off: 0.012 });
  k.front(PAL.glass, 5.52, [[-1.14, 1.2], [1.14, 1.2], [1.14, 2.4], [-1.14, 2.4]], 1, { off: 0.018 });
  k.front(PAL.glassHi, 5.52, [[0.3, 1.25], [0.45, 1.25], [0.75, 2.35], [0.6, 2.35]], 1, { off: 0.022 });
  k.front('#1a1a1a', 5.52, [[-0.9, 2.46], [0.9, 2.46], [0.9, 2.62], [-0.9, 2.62]], 1, { off: 0.02 });
  k.front('#e2b93b', 5.52, [[-0.8, 2.5], [0.3, 2.5], [0.3, 2.58], [-0.8, 2.58]], 1, { off: 0.026 });
  k.front(cBand, 5.52, [[-1.25, 0.42], [1.25, 0.42], [1.25, 1.0], [-1.25, 1.0]], 1, { off: 0.012 });
  // rear: engine grille + window
  k.front('#232426', -5.52, [[-0.9, 2.0], [0.9, 2.0], [0.9, 2.6], [-0.9, 2.6]], -1, { off: 0.012 });
  k.front(PAL.glass, -5.52, [[-0.84, 2.05], [0.84, 2.05], [0.84, 2.55], [-0.84, 2.55]], -1, { off: 0.018 });
  for (let i = 0; i < 5; i++) k.front('#2a2a2a', -5.52, [[-0.8, 0.8 + i * 0.12], [0.8, 0.8 + i * 0.12], [0.8, 0.86 + i * 0.12], [-0.8, 0.86 + i * 0.12]], -1, { off: 0.014 });
  // roof AC pods
  k.box(shade(cBody, 0.9), [1.6, 0.3, 2.2], [0, 3.02, -1.5], { c: 0.08, base: true });
  k.box(shade(cBody, 0.9), [1.2, 0.2, 1.2], [0, 3.02, 2.4], { c: 0.06, base: true });
  carLights(k, { W, lights: { fz: 5.5, rz: -5.52, fy: 0.85, ry: 1.25, fx: 0.95, rx: 1.0 }, bumperY: 0.48 });
  mirrors(k, W, 2.3, 5.2, '#262729');
  const wr = 0.5, zf = 3.6, zr = -2.9;
  arch(k, hw, zf, wr, wr + 0.1, 0.38, '#1a1a1b');
  arch(k, hw, zr, wr, wr + 0.1, 0.38, '#1a1a1b');
  sideBlob(k, mix(cBody, PAL.dirt, 0.5), hw, -5.0, 1.3, 0.3, 0.2, 70, 1);
  fourWheels(k, rig, { zf, zr, x: hw - 0.15 + 0.02, r: wr, w: 0.3, style: 'steel' });
  finish(g, k, rig);
  return g;
}

// ── semi truck: cab + trailer, 12 m ──────────────────────────────────────────
export function buildTruck(variant = 0) {
  const L = 12, W = 2.6, hw = W / 2;
  const cabCols = ['#a8462f', '#3f5f7f', '#d6c08a', '#e2dccb'];
  const cc = cabCols[variant % cabCols.length];
  const g = root('truck', variant, { w: W, h: 4.0, l: L });
  const k = new Kit(700 + variant);
  const rig = vrig();
  // cab (front 3.4 m): z 2.6..6
  const cab = [[2.75, 0.62], [5.88, 0.62], [6.0, 0.95], [5.96, 1.65], [5.75, 1.78], [5.45, 3.0], [5.2, 3.2], [3.2, 3.24], [2.75, 3.1]];
  k.extrude(cc, cab, 2.45, { axis: 'x', bevel: 0.1 });
  const chw = 1.225;
  // windshield + side windows
  edgeQuad(k, '#252628', [5.75, 1.78], [5.45, 3.0], [-1.06, 1.06], [0.05, 0.94]);
  edgeQuad(k, PAL.glass, [5.75, 1.78], [5.45, 3.0], [-1.0, 1.0], [0.1, 0.9], 0.02);
  edgeQuad(k, PAL.glassHi, [5.75, 1.78], [5.45, 3.0], [0.3, 0.42], [0.15, 0.85], 0.024);
  k.side('#252628', chw, [[4.35, 1.85], [5.5, 1.85], [5.3, 2.85], [4.35, 2.85]], { off: 0.016 });
  k.side(PAL.glass, chw, [[4.4, 1.9], [5.42, 1.9], [5.25, 2.8], [4.4, 2.8]], { off: 0.022 });
  k.side(shade(cc, 0.75), chw, [[4.25, 0.75], [4.29, 0.75], [4.29, 2.95], [4.25, 2.95]], { off: 0.016 });
  k.side(shade(cc, 0.75), chw, [[5.6, 0.75], [5.64, 0.75], [5.64, 1.7], [5.6, 1.7]], { off: 0.016 });
  k.side(mix(cc, PAL.dirt, 0.45), chw, [[2.8, 0.64], [5.85, 0.64], [5.85, 0.84], [2.8, 0.84]], { off: 0.018 });
  // big grille + bumper + lamps
  k.front(PAL.chrome, 6.0, [[-0.8, 0.95], [0.8, 0.95], [0.8, 1.68], [-0.8, 1.68]], 1, { off: 0.012 });
  k.front('#2a2b2d', 6.0, [[-0.7, 1.0], [0.7, 1.0], [0.7, 1.62], [-0.7, 1.62]], 1, { off: 0.018 });
  for (let i = 0; i < 6; i++) k.front('#8f8e88', 6.0, [[-0.7, 1.05 + i * 0.1], [0.7, 1.05 + i * 0.1], [0.7, 1.08 + i * 0.1], [-0.7, 1.08 + i * 0.1]], 1, { off: 0.022 });
  k.box(PAL.chrome, [2.5, 0.32, 0.3], [0, 0.72, 6.02], { c: 0.05 });
  for (const s of [1, -1]) {
    k.box(PAL.headlight, [0.3, 0.16, 0.06], [s * 0.98, 1.32, 5.98], { c: 0.02 });
    k.box(PAL.amber, [0.1, 0.06, 0.04], [s * 0.7, 3.24, 5.15]);
    // exhaust stacks behind the cab
    k.cyl(PAL.chrome, 0.09, 0.09, 2.8, [s * 1.1, 2.3, 2.6], { seg: 8 });
    k.cyl('#2b2a28', 0.095, 0.095, 0.1, [s * 1.1, 3.72, 2.6], { seg: 8 });
    // fuel tanks + steps
    k.cyl(PAL.chrome, 0.3, 0.3, 1.2, [s * 1.05, 0.72, 3.4], { axis: 'z', seg: 10 });
    k.box('#3a3b3d', [0.16, 0.5, 0.5], [s * 1.2, 0.85, 4.5]);
    // mirrors
    k.box('#2a2a2b', [0.06, 0.5, 0.16], [s * 1.42, 2.3, 5.35], { c: 0.02 });
    k.box('#2a2a2b', [0.2, 0.04, 0.04], [s * 1.32, 2.5, 5.35]);
  }
  // sleeper fairing on top
  k.box(shade(cc, 0.92), [2.3, 0.5, 1.8], [0, 3.15, 3.7], { c: 0.12, base: true, taper: [0.92, 0.7], shear: [0, -0.35] });
  // chassis + fifth wheel
  k.box(PAL.under, [1.1, 0.35, 5.0], [0, 0.6, 2.4]);
  // trailer (z −6.0 .. 2.4), floor at 1.2
  const tz0 = -6.0, tz1 = 2.4, ty0 = 1.2, ty1 = 4.0;
  const trailerCol = ['#d9d4c6', '#c9c5b6', '#bfb8a5', '#d6c08a'][variant % 4];
  k.box(trailerCol, [W, ty1 - ty0, tz1 - tz0], [0, (ty0 + ty1) / 2, (tz0 + tz1) / 2], { c: 0.06 });
  k.box(PAL.under, [W * 0.96, 0.18, tz1 - tz0 - 0.2], [0, ty0 - 0.06, (tz0 + tz1) / 2]);
  // trailer ribs + faded stripe + grime
  for (let i = 0; i <= 10; i++) { const z = tz0 + 0.2 + i * ((tz1 - tz0 - 0.4) / 10); k.side(shade(trailerCol, 0.88), hw, [[z - 0.03, ty0 + 0.05], [z + 0.03, ty0 + 0.05], [z + 0.03, ty1 - 0.05], [z - 0.03, ty1 - 0.05]], { off: 0.014 }); }
  const stripe = ['#4f8f8a', '#b85c6a', '#6f8fb0', '#a8462f'][variant % 4];
  k.side(stripe, hw, [[tz0 + 0.3, 1.9], [tz1 - 0.6, 1.9], [tz1 - 0.6, 2.15], [tz0 + 0.3, 2.15]], { off: 0.018 });
  k.side(shade(stripe, 0.8), hw, [[tz0 + 0.3, 2.22], [tz1 - 1.8, 2.22], [tz1 - 1.8, 2.3], [tz0 + 0.3, 2.3]], { off: 0.018 });
  k.side(mix(trailerCol, PAL.dirt, 0.4), hw, [[tz0 + 0.1, 1.25], [tz1 - 0.1, 1.25], [tz1 - 0.1, 1.55], [tz0 + 0.1, 1.55]], { off: 0.016 });
  // rear doors + lights + underride bar
  k.front(shade(trailerCol, 0.85), tz0, [[-0.02, 1.3], [0.02, 1.3], [0.02, 3.9], [-0.02, 3.9]], -1, { off: 0.012 });
  for (const s of [1, -1]) { k.front('#7a7a77', tz0, [[s * 0.55 - 0.03, 1.3], [s * 0.55 + 0.03, 1.3], [s * 0.55 + 0.03, 3.9], [s * 0.55 - 0.03, 3.9]], -1, { off: 0.014 }); k.box(PAL.taillight, [0.24, 0.12, 0.05], [s * 1.0, 1.3, tz0 - 0.04]); }
  k.box('#c4402e', [2.3, 0.14, 0.1], [0, 0.6, tz0 + 0.1]);
  k.box('#3a3b3d', [0.1, 0.5, 0.1], [0.9, 0.85, tz0 + 0.1]); k.box('#3a3b3d', [0.1, 0.5, 0.1], [-0.9, 0.85, tz0 + 0.1]);
  // landing gear
  for (const s of [1, -1]) k.box('#3a3b3d', [0.08, 0.7, 0.08], [s * 0.8, 0.82, 0.8]);
  // wheel arches (cab)
  arch(k, chw, 5.0, 0.5, 0.6, 0.62, '#1a1a1b');
  const wr = 0.5, x = hw - 0.17;
  addWheel(k, rig, 'wheel_fl', [chw - 0.15, wr, 5.0], wr, 0.3, 1, 'chrome');
  addWheel(k, rig, 'wheel_fr', [-(chw - 0.15), wr, 5.0], wr, 0.3, -1, 'chrome');
  addWheel(k, rig, 'wheel_rl', [x, wr, 1.8], wr, 0.34, 1, 'steel');
  addWheel(k, rig, 'wheel_rr', [-x, wr, 1.8], wr, 0.34, -1, 'steel');
  addWheel(k, rig, 'wheel_rl2', [x, wr, 0.7], wr, 0.34, 1, 'steel');
  addWheel(k, rig, 'wheel_rr2', [-x, wr, 0.7], wr, 0.34, -1, 'steel');
  addWheel(k, rig, 'wheel_tl', [x, wr, -4.0], wr, 0.34, 1, 'steel');
  addWheel(k, rig, 'wheel_tr', [-x, wr, -4.0], wr, 0.34, -1, 'steel');
  addWheel(k, rig, 'wheel_tl2', [x, wr, -5.1], wr, 0.34, 1, 'steel');
  addWheel(k, rig, 'wheel_tr2', [-x, wr, -5.1], wr, 0.34, -1, 'steel');
  finish(g, k, rig);
  return g;
}

// ── tractor ──────────────────────────────────────────────────────────────────
export function buildTractor(variant = 0) {
  const cols = ['#b5452f', '#c9852f', '#6f7f4f'];
  const c = cols[variant % 3];
  const g = root('tractor', variant, { w: 2.2, h: 2.9, l: 4.2 });
  const k = new Kit(800 + variant);
  const rig = vrig();
  // hood/engine (front), z 0.0 .. 2.0
  k.box(c, [0.9, 0.9, 2.0], [0, 1.2, 1.05], { c: 0.08, taper: [0.92, 0.95] });
  k.box('#2b2b2c', [0.8, 0.6, 0.06], [0, 1.15, 2.08]);
  for (let i = 0; i < 5; i++) k.box('#5a5a58', [0.74, 0.03, 0.03], [0, 0.92 + i * 0.12, 2.12]);
  k.box(PAL.headlight, [0.14, 0.1, 0.05], [0.28, 1.55, 2.06]); k.box(PAL.headlight, [0.14, 0.1, 0.05], [-0.28, 1.55, 2.06]);
  k.side(shade(c, 0.7), 0.45, [[0.2, 0.95], [1.9, 0.95], [1.9, 1.0], [0.2, 1.0]], { off: 0.03 });
  for (let i = 0; i < 4; i++) k.side('#2b2b2c', 0.45, [[1.2 + i * 0.16, 1.15], [1.28 + i * 0.16, 1.15], [1.28 + i * 0.16, 1.45], [1.2 + i * 0.16, 1.45]], { off: 0.035 });
  // front axle + chassis
  k.box('#2a2a2b', [1.5, 0.16, 0.2], [0, 0.45, 1.4]);
  k.box('#333334', [0.7, 0.4, 3.0], [0, 0.65, 0.4]);
  // exhaust stack
  k.cyl('#3a3836', 0.06, 0.06, 1.3, [0.3, 2.1, 1.6], { seg: 6 });
  k.cyl('#1f1e1d', 0.07, 0.07, 0.1, [0.3, 2.78, 1.6], { seg: 6 });
  // cab: z -1.6 .. 0.0
  const cy0 = 1.1, cy1 = 2.85;
  k.box(c, [1.4, 0.5, 1.6], [0, cy0 + 0.25, -0.75], { c: 0.06 });
  // cab frame posts + roof + glass
  for (const sx of [1, -1]) for (const z of [-1.5, 0.0]) k.box('#2a2a2b', [0.07, cy1 - cy0 - 0.5, 0.07], [sx * 0.68, (cy0 + 0.5 + cy1) / 2, z]);
  k.box(c, [1.6, 0.14, 1.8], [0, cy1, -0.75], { c: 0.05 });
  k.box(shade(c, 0.85), [1.5, 0.05, 1.7], [0, cy1 - 0.09, -0.75]);
  // glass panes (dark, slightly see-through look by being darker blue-grey)
  const gl = '#3e4c54';
  k.box(gl, [1.3, 1.1, 0.02], [0, 2.15, 0.0]);
  k.box(gl, [1.3, 1.1, 0.02], [0, 2.15, -1.5]);
  for (const sx of [1, -1]) k.box(gl, [0.02, 1.1, 1.4], [sx * 0.68, 2.15, -0.75]);
  // seat + steering wheel silhouette inside
  k.box('#2b2b2c', [0.5, 0.5, 0.4], [0, 1.85, -1.0]);
  k.cyl('#1d1d1d', 0.18, 0.18, 0.03, [0, 2.15, -0.3], { rot: [-0.6, 0, 0], seg: 8 });
  // rear fenders over the big wheels
  for (const sx of [1, -1]) {
    k.box(c, [0.6, 0.08, 1.7], [sx * 0.92, 1.85, -0.85], { c: 0.03 });
    k.box(c, [0.6, 0.55, 0.08], [sx * 0.92, 1.6, -0.0]);
    k.box(c, [0.6, 0.55, 0.08], [sx * 0.92, 1.6, -1.7]);
  }
  // three-point hitch
  k.box('#2a2a2b', [0.9, 0.12, 0.5], [0, 0.7, -1.9]);
  // grime
  k.side(mix(c, PAL.mud, 0.5), 0.45, [[0.1, 0.75], [2.0, 0.75], [2.0, 0.9], [0.1, 0.9]], { off: 0.03 });
  addWheel(k, rig, 'wheel_fl', [0.82, 0.45, 1.4], 0.45, 0.26, 1, 'tractor');
  addWheel(k, rig, 'wheel_fr', [-0.82, 0.45, 1.4], 0.45, 0.26, -1, 'tractor');
  addWheel(k, rig, 'wheel_rl', [0.9, 0.82, -0.85], 0.82, 0.46, 1, 'tractor');
  addWheel(k, rig, 'wheel_rr', [-0.9, 0.82, -0.85], 0.82, 0.46, -1, 'tractor');
  finish(g, k, rig);
  return g;
}

// ── police helicopter ────────────────────────────────────────────────────────
export function buildHeli() {
  const navy = PAL.copNavy, white = PAL.copWhite;
  const g = root('heli', 0, { w: 2.6, h: 3.4, l: 12 });
  const k = new Kit(900);
  const rig = vrig();
  const sy = 0.55; // skid height offset (fuselage bottom)
  // fuselage: tapered nose + main cabin + rear taper
  const fus = [[-1.6, sy + 0.25], [1.4, sy + 0.1], [2.3, sy + 0.45], [2.55, sy + 0.95], [2.2, sy + 1.55], [1.2, sy + 1.95], [-0.9, sy + 2.0], [-1.9, sy + 1.6], [-2.6, sy + 1.1]];
  k.extrude(white, fus, 1.8, { axis: 'x', bevel: 0.22 });
  // lower navy half
  k.side(navy, 0.9, [[-2.3, sy + 0.4], [1.6, sy + 0.24], [2.3, sy + 0.56], [2.4, sy + 0.95], [-2.45, sy + 1.12]], { off: 0.02 });
  k.side(PAL.rvMustard, 0.9, [[-2.45, sy + 1.12], [2.4, sy + 0.95], [2.39, sy + 1.02], [-2.43, sy + 1.2]], { off: 0.024 });
  // canopy glass (bubble)
  edgeQuad(k, PAL.glass, [2.55, sy + 0.95], [2.2, sy + 1.55], [-0.68, 0.68], [0.0, 1.0], 0.02);
  edgeQuad(k, PAL.glass, [2.2, sy + 1.55], [1.2, sy + 1.95], [-0.62, 0.62], [0.0, 0.7], 0.02);
  edgeQuad(k, PAL.glass, [2.3, sy + 0.45], [2.55, sy + 0.95], [-0.5, 0.5], [0.3, 1.0], 0.02);
  edgeQuad(k, PAL.glassHi, [2.55, sy + 0.95], [2.2, sy + 1.55], [0.2, 0.32], [0.1, 0.9], 0.026);
  k.side(PAL.glass, 0.9, [[0.3, sy + 1.15], [1.85, sy + 1.05], [1.6, sy + 1.75], [0.3, sy + 1.8]], { off: 0.03 });
  k.side(PAL.glass, 0.9, [[-1.2, sy + 1.2], [0.15, sy + 1.15], [0.15, sy + 1.8], [-1.2, sy + 1.82]], { off: 0.03 });
  // engine housing + mast
  k.box('#c9c9c4', [1.0, 0.45, 1.8], [0, sy + 2.0, -0.6], { c: 0.12, base: true, taper: [0.8, 0.85] });
  k.box('#2b2c2f', [0.3, 0.12, 0.6], [0, sy + 2.2, -1.4]);
  k.cyl('#3a3b3d', 0.08, 0.1, 0.45, [0, sy + 2.45, -0.3], { seg: 6, base: true });
  // tail boom
  // (axis 'z' maps the cylinder's top radius to +Z = toward the fuselage)
  k.cyl(white, 0.38, 0.16, 4.6, [0, sy + 1.45, -4.6], { axis: 'z', seg: 8 });
  k.cyl(navy, 0.228, 0.168, 1.2, [0, sy + 1.45, -6.25], { axis: 'z', seg: 8 });
  // tail fin + stabiliser
  k.extrude(navy, [[-7.2, sy + 1.3], [-6.5, sy + 1.4], [-6.75, sy + 2.5], [-7.25, sy + 2.6]], 0.08, { axis: 'x' });
  k.extrude(navy, [[-7.2, sy + 1.4], [-6.8, sy + 1.4], [-6.95, sy + 0.9], [-7.2, sy + 0.95]], 0.07, { axis: 'x' });
  k.box(white, [1.6, 0.05, 0.4], [0, sy + 1.5, -5.9], { c: 0.02 });
  // skids
  for (const s of [1, -1]) {
    k.cyl('#2a2b2d', 0.05, 0.05, 3.4, [s * 1.05, 0.06, 0.2], { axis: 'z', seg: 6 });
    k.cyl('#2a2b2d', 0.05, 0.05, 0.35, [s * 1.05, 0.12, 1.98], { axis: 'z', seg: 6, rot: [-0.5, 0, 0] });
    for (const z of [-0.8, 1.0]) k.box('#2a2b2d', [0.06, 0.6, 0.06], [s * 0.85, 0.36, z], { rot: [0, 0, s * 0.45] });
  }
  // spotlight housing under the nose
  k.cyl('#2b2c2f', 0.12, 0.14, 0.2, [0.45, sy + 0.05, 1.9], { seg: 8 });
  k.cyl('#e9e2bf', 0.11, 0.11, 0.02, [0.45, sy - 0.06, 1.9], { seg: 8 });
  // nav light + badge
  badge(k, 0.9, -0.5, sy + 0.75, 0.16, '#c9a24a', 1);
  badge(k, 0.9, -0.5, sy + 0.75, 0.16, '#c9a24a', -1);
  // main rotor (bone `rotor`, spins about local Y)
  const rp = [0, sy + 2.95, -0.3];
  k.withBone(rig.add('rotor', rp, 'body'), () => k.at(rp, () => {
    k.cyl('#3a3b3d', 0.16, 0.16, 0.14, [0, 0, 0], { seg: 8 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      k.at([0, 0.02, 0], [0, a, 0], () => k.box('#2a2b2e', [0.28, 0.04, 5.1], [0, 0, 2.6], { rot: [0, 0, 0.06] }));
    }
  }));
  // tail rotor (bone `tail_rotor`, spins about local X, on the +X side of the fin)
  const tp = [0.16, sy + 2.0, -7.0];
  k.withBone(rig.add('tail_rotor', tp, 'body'), () => k.at(tp, () => {
    k.cyl('#3a3b3d', 0.07, 0.07, 0.12, [0, 0, 0], { axis: 'x', seg: 6 });
    for (let i = 0; i < 2; i++) k.box('#2a2b2e', [0.03, 1.3, 0.13], [0.03, 0, 0], { rot: [i * Math.PI / 2, 0, 0] });
  }));
  const bones = finish(g, k, rig);
  // spotlight attach point: beam along local −Y
  bones.body.add(empty('spot', [0.45, sy - 0.08, 1.9]));
  return g;
}

// ── train: locomotive + 3 freight cars along +Z, ~60 m ───────────────────────
function bogie(k, z, gauge = 1.45) {
  k.box('#2a2a2b', [2.2, 0.5, 2.6], [0, 0.65, z], { c: 0.05 });
  for (const zz of [z - 0.8, z + 0.8]) for (const s of [1, -1]) k.cyl('#3a3a3a', 0.45, 0.45, 0.15, [s * gauge / 2 + s * 0.05, 0.45, zz], { axis: 'x', seg: 10 });
}
function trainCar(type, len, seed) {
  const k = new Kit(seed);
  const W = 3.1, hw = W / 2, h0 = 1.2, zh = len / 2;
  // frame
  k.box('#2e2f31', [W * 0.94, 0.3, len], [0, h0 - 0.1, 0]);
  bogie(k, zh - 2.2); bogie(k, -zh + 2.2);
  k.box('#3a3a3a', [0.4, 0.3, 0.6], [0, h0 - 0.15, zh + 0.2]); k.box('#3a3a3a', [0.4, 0.3, 0.6], [0, h0 - 0.15, -zh - 0.2]);
  if (type === 'loco') {
    const body = '#c9a13b', dark = '#3a3d40', stripe = '#e9e2cf';
    // walkway deck
    k.box(dark, [W, 0.12, len], [0, h0 + 0.06, 0]);
    // long hood (rear), cab, short hood (front)
    k.box(body, [2.3, 2.6, len - 6.2], [0, h0 + 0.12 + 1.3, -2.4], { c: 0.08 });
    k.box(body, [W - 0.1, 3.2, 2.6], [0, h0 + 0.12 + 1.6, zh - 3.8], { c: 0.08 });
    k.box(body, [2.3, 1.7, 2.2], [0, h0 + 0.12 + 0.85, zh - 1.35], { c: 0.08, taper: [0.95, 0.9] });
    // cab windows
    for (const s of [1, -1]) {
      k.rectX(PAL.glass, s * (hw - 0.05), [zh - 4.6, zh - 3.0], [h0 + 2.2, h0 + 3.0], s);
    }
    k.rectZ(PAL.glass, zh - 2.5, [-1.3, -0.15], [h0 + 2.1, h0 + 2.9], 1);
    k.rectZ(PAL.glass, zh - 2.5, [0.15, 1.3], [h0 + 2.1, h0 + 2.9], 1);
    // stripes + number board + headlight
    for (const s of [1, -1]) {
      k.rectX(stripe, s * 1.15, [-zh + 0.5, zh - 5.1], [h0 + 0.5, h0 + 0.7], s);
      k.rectX(dark, s * 1.15, [-zh + 0.5, zh - 5.1], [h0 + 0.3, h0 + 0.5], s);
      for (let i = 0; i < 6; i++) k.rectX(shade(body, 0.75), s * 1.15, [-zh + 1.2 + i * 1.6, -zh + 1.9 + i * 1.6], [h0 + 1.2, h0 + 2.4], s);
      // handrails
      k.box('#e9e2cf', [0.04, 0.04, len - 1.0], [s * (hw - 0.05), h0 + 1.05, 0]);
    }
    k.rectZ(stripe, zh - 0.25, [-1.15, 1.15], [h0 + 0.4, h0 + 0.6], 1);
    k.cyl(PAL.headlight, 0.18, 0.18, 0.08, [0, h0 + 1.55, zh - 0.22], { axis: 'z', seg: 8 });
    k.box('#2a2a2a', [3.0, 0.6, 0.3], [0, h0 - 0.2, zh - 0.1]);
    // fuel tank
    k.box('#2b2c2e', [2.4, 0.8, 5.0], [0, h0 - 0.55, -1.0], { c: 0.15 });
    // exhaust + horns on top
    k.box('#2a2a2a', [0.5, 0.25, 0.7], [0, h0 + 2.78, -1.0]);
    k.cyl('#5a5a58', 0.08, 0.08, 0.4, [0.3, h0 + 3.4 + 0.2, zh - 3.8], { axis: 'z', seg: 6 });
    // grime
    for (const s of [1, -1]) k.rectX(mix(body, PAL.dirt, 0.5), s * 1.15, [-zh + 0.5, zh - 5.1], [h0 + 0.7, h0 + 1.0], s, { off: 0.02 });
  } else if (type === 'boxcar') {
    const c = ['#8a4a32', '#7a5a3f', '#6f6a5f'][seed % 3];
    k.box(c, [W, 3.0, len], [0, h0 + 1.6, 0], { c: 0.06 });
    for (const s of [1, -1]) {
      for (let i = 0; i <= 12; i++) { const z = -zh + 0.3 + i * ((len - 0.6) / 12); k.rectX(shade(c, 0.82), s * hw, [z - 0.04, z + 0.04], [h0 + 0.15, h0 + 3.05], s); }
      k.rectX(shade(c, 0.7), s * hw, [-1.2, 1.2], [h0 + 0.2, h0 + 2.9], s, { off: 0.02 });
      k.rectX('#2b2b2b', s * hw, [-0.03, 0.03], [h0 + 0.2, h0 + 2.9], s, { off: 0.026 });
      k.rectX('#d9d1bd', s * hw, [-zh + 0.8, -zh + 3.6], [h0 + 2.2, h0 + 2.6], s, { off: 0.02 });
      k.rectX(mix(c, PAL.rust, 0.6), s * hw, [2.5, 4.0], [h0 + 0.2, h0 + 0.7], s, { off: 0.02 });
    }
    k.box(shade(c, 0.9), [W - 0.2, 0.12, len - 0.2], [0, h0 + 3.15, 0]);
  } else if (type === 'tank') {
    const c = '#2d2e30';
    k.cyl(c, 1.45, 1.45, len - 1.4, [0, h0 + 1.55, 0], { axis: 'z', seg: 12 });
    k.cyl(shade(c, 1.2), 1.2, 1.45, 0.6, [0, h0 + 1.55, zh - 0.4], { axis: 'z', seg: 12 });
    k.cyl(shade(c, 1.2), 1.45, 1.2, 0.6, [0, h0 + 1.55, -zh + 0.4], { axis: 'z', seg: 12 });
    k.cyl('#3e3f41', 0.5, 0.5, 0.35, [0, h0 + 3.0, 0], { seg: 8 });
    k.box('#c7c3b8', [3.04, 0.3, 4.0], [0, h0 + 1.55, 0]);
    k.box('#2b2b2b', [0.7, 0.2, 10.5], [0, h0 + 0.2, 0]);
  } else {
    // covered hopper
    const c = '#a7a49b';
    const prof = [[-zh + 0.2, h0 + 0.2], [zh - 0.2, h0 + 0.2], [zh - 0.2, h0 + 3.2], [-zh + 0.2, h0 + 3.2]];
    k.extrude(c, prof, W, { axis: 'x', bevel: 0.15 });
    for (const z of [-3.5, 0, 3.5]) k.box(shade(c, 0.85), [2.6, 0.9, 2.0], [0, h0 - 0.2, z], { taper: [1.15, 1.6] });
    for (const s of [1, -1]) {
      for (let i = 0; i < 9; i++) { const z = -zh + 0.8 + i * ((len - 1.6) / 8); k.rectX(shade(c, 0.85), s * hw, [z - 0.06, z + 0.06], [h0 + 0.3, h0 + 3.1], s); }
      k.rectX('#5a5852', s * hw, [-zh + 1.2, -zh + 3.4], [h0 + 2.4, h0 + 2.8], s, { off: 0.02 });
      k.rectX(mix(c, PAL.rust, 0.5), s * hw, [1.8, 3.4], [h0 + 0.3, h0 + 0.8], s, { off: 0.02 });
    }
    k.box(shade(c, 0.95), [1.0, 0.12, len - 1.0], [0, h0 + 3.26, 0]);
  }
  return k.mesh(type + '_mesh');
}

export function buildTrain() {
  const g = root('train', 0, { w: 3.1, h: 4.6, l: 60 });
  const cars = [['loco', 18, 12], ['boxcar', 13, -1], ['tank', 13, -15], ['hopper', 13, -29]];
  // centre the train: loco spans 30..12, then 1 m gaps
  let zFront = 30;
  cars.forEach(([type, len], i) => {
    const o = new THREE.Object3D();
    o.name = `car_${i}`;
    o.position.set(0, 0, zFront - len / 2);
    o.add(trainCar(type, len, 1000 + i));
    g.add(o);
    zFront -= len + 1;
  });
  g.userData.cars = cars.length;
  return g;
}

export const VEHICLE_BUILDERS = {
  rv: { build: () => buildRV(), variants: 1 },
  cop: { build: () => buildCop(), variants: 1 },
  cop_suv: { build: () => buildCopSUV(), variants: 1 },
  heli: { build: () => buildHeli(), variants: 1 },
  sedan: { build: (v) => buildSedan(v), variants: 6 },
  hatch: { build: (v) => buildHatch(v), variants: 6 },
  van: { build: (v) => buildVan(v), variants: 6 },
  pickup: { build: (v) => buildPickup(v), variants: 6 },
  bus: { build: (v) => buildBus(v), variants: 3 },
  truck: { build: (v) => buildTruck(v), variants: 4 },
  tractor: { build: (v) => buildTractor(v), variants: 3 },
  rival: { build: () => buildRival(), variants: 1 },
  train: { build: () => buildTrain(), variants: 1 },
};
// a dark, mysterious parked car for the sell point (re-uses the sedan builder)
export function buildMysteryCar() {
  return buildSedan(0, { kind: 'mystery_car', color: '#2a2c30', noGrime: true, wheelStyle: 'chrome', mirror: '#2a2c30' });
}
export { addWheel, wheelGeometry, sideWindow, edgeQuad, sideBlob, arch };
