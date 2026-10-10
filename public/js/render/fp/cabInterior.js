// ─────────────────────────────────────────────────────────────────────────────
// First-person cab dressing (runs on top of the rv_cab_fp asset, client only):
//   const ci = new CabInterior(cab);          // cab = createModel('rv_cab_fp') (rv_frame inside)
//   ci.update(dt, { snap, gearbox, light, tempT, bulb })
//   ci.dispose()
//
// • Worn materials: the asset's static body gets the object-space wear material (vinyl grain,
//   scuffs, dust on the dash top) + a cab fill term (cabMaterials.js); same for the new parts.
// • Extra static detail merged INTO the body mesh (no extra draw call): louvred dash vents, a
//   glovebox lid, dash-pad stitching + a sun crack, defrost grille, A-pillar grab handle, dome light,
//   headliner bows, door-card pleats, visor stitching, key + fob on the column, Rook's knees / legs.
// • Steering wheel: a new 3-spoke wheel (smooth rim with worn grip spots and finger ridges, drilled
//   aluminium spokes, horn pad) replaces the asset's wheel mesh under the same `wheel` pivot.
// • Instrument cluster: the asset's flat dial art is cut out of the body and replaced by one
//   canvas-textured face (numbered speedo / tach, temp + fuel combo gauge, odometer, PRNDL) with
//   chrome bezels, a fuel needle, and additive warning lamps (hazard arrows, brake, oil, battery,
//   check-engine, nitro, headlights) that light from the snapshot, plus a bulb check.
// Draw calls added: wheel (replaces the old one) + cluster face + fuel needle + lamps = +3.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Kit } from '../../assets/models/kit.js';
import { linear, shade, mix, PAL } from '../../assets/palette.js';
import { softDiscTexture } from '../textures.js';
import { cabWearMaterial, CAB_UNIFORMS } from './cabMaterials.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const FY = 0.72;
const HUB = [0.55, 1.56, 2.9], TILT = 0.6;              // asset CAB.hub / CAB.tilt (wheel mount)
export const RIM_R = 0.205;
export const RIM_TUBE = 0.0175;
const V3 = (a) => new THREE.Vector3(...a);
const M4 = (pos, rot = [0, 0, 0]) => new THREE.Matrix4().compose(V3(pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])), new THREE.Vector3(1, 1, 1));
const inFrame = (k, m, fn) => { k.stack.push(k.M.clone().multiply(m)); try { fn(k); } finally { k.stack.pop(); } };

// gauge-face layout (asset 'gauges' local space: +X = Rook's right, +Y up the face, +Z toward Rook)
const FACE_W = 0.636, FACE_H = 0.2;
const DIALS = {
  rpm: { x: -0.178, y: -0.004, r: 0.064 },
  speed: { x: 0, y: 0, r: 0.08 },
  combo: { x: 0.163, y: 0.012, r: 0.046 },
};
const LAMPS = [
  // id, x, y, colour (on)
  ['turnL', -0.287, 0.058, '#3cff6a'], ['brake', -0.287, 0.016, '#ff3b2b'], ['oil', -0.287, -0.026, '#ff3b2b'], ['batt', -0.287, -0.068, '#ff3b2b'],
  ['turnR', 0.272, 0.058, '#3cff6a'], ['check', 0.272, 0.016, '#ffa526'], ['nitro', 0.272, -0.026, '#3d8bff'], ['beam', 0.272, -0.068, '#3cff6a'],
];
const FUEL_A = [Math.PI - 0.85, Math.PI + 0.85];         // E … F (needle pointing down)

// ── helpers ────────────────────────────────────────────────────────────────
/** Flat bar from a to b (local), width w in the plane spanned with `side`, thickness t. */
function bar(k, color, a, b, w0, w1, t, side) {
  const A = V3(a), B = V3(b), d = B.clone().sub(A), len = d.length();
  const g = new THREE.BoxGeometry(len, 1, t);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const u = p.getX(i) / len + 0.5; p.setY(i, p.getY(i) * lerp(w0, w1, u)); }
  const x = d.normalize(), z = V3(side).addScaledVector(x, -V3(side).dot(x)).normalize(), y = z.clone().cross(x);
  const m = new THREE.Matrix4().makeBasis(x, y, z).setPosition(A.add(B).multiplyScalar(0.5));
  k.geo(g, color, m);
  g.dispose();
}
/** Disc facing −Z (toward Rook) in the current kit frame. */
/** Ring (annulus) in the local XY plane facing +Z, from z0 (inner lip) to z1. */
function bezel(k, color, cx, cy, r0, r1, z0, z1, seg = 28) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const P = (a, r, z) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z];
    k.poly(color, [P(a0, r0, z1), P(a1, r0, z1), P(a1, r1, z0), P(a0, r1, z0)], { facing: [0, 0, 1] });
    k.poly(shade(color, 0.6), [P(a0, r0, z0), P(a1, r0, z0), P(a1, r0, z1), P(a0, r0, z1)], { facing: [-Math.cos((a0 + a1) / 2), -Math.sin((a0 + a1) / 2), 0] });
  }
}
/** Geometry with only position / normal / color (non-indexed), for merging. */
function plain(g) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const key of Object.keys(n.attributes)) if (!['position', 'normal', 'color'].includes(key)) n.deleteAttribute(key);
  if (!n.attributes.normal) n.computeVertexNormals();
  return n;
}

// ── static dressing (rv_frame space, merged into the asset body) ──────────
function buildDressing() {
  const k = new Kit(907);
  const vinyl = '#3b3936', black = '#1b1b1c', chrome = PAL.chrome, stitch = '#8a8070';
  const dz = 2.925;
  // louvred vent bezels over the asset's flat vent slots
  for (const [x0, x1] of [[0.92, 1.04], [-0.14, 0.06], [-1.02, -0.9]]) {
    const cx = (x0 + x1) / 2, w = x1 - x0 + 0.03;
    k.box('#262524', [w, 0.1, 0.018], [cx, 1.335, dz - 0.004], { c: 0.006 });
    k.box('#0d0d0e', [w - 0.025, 0.074, 0.006], [cx, 1.335, dz - 0.0135]);
    for (let i = 0; i < 4; i++) k.box('#3c3b39', [w - 0.03, 0.006, 0.02], [cx, 1.31 + i * 0.017, dz - 0.016], { rot: [0.45, 0, 0] });
    k.box('#5a5853', [0.012, 0.03, 0.01], [cx, 1.335, dz - 0.025]);                   // louvre thumb tab
  }
  // glovebox lid (raised, rounded) + latch + keyhole
  k.box(shade(vinyl, 1.12), [0.54, 0.205, 0.022], [-0.58, 1.19, dz - 0.009], { c: 0.008 });
  k.box('#2a2927', [0.5, 0.004, 0.004], [-0.58, 1.288, dz - 0.021]);
  k.box(chrome, [0.07, 0.02, 0.012], [-0.58, 1.255, dz - 0.024], { c: 0.004 });
  k.box('#2b2b2c', [0.006, 0.01, 0.004], [-0.58, 1.255, dz - 0.031]);
  // dash-pad stitching along the front lip + a sun crack in the pad (passenger side)
  {
    // the pad lip runs (z 2.93, y 1.41) → (2.99, 1.485): stitch dashes 1 cm in from the edge, on its face
    const n = new THREE.Vector3(0, -0.06, -0.075).normalize().cross(new THREE.Vector3(1, 0, 0)).negate();
    const p0 = new THREE.Vector3(0, 1.432, 2.946).addScaledVector(n, 0.0015), up = new THREE.Vector3(0, 0.075, 0.06).normalize();
    for (let x = -1.04; x < 1.06; x += 0.026) {
      if (x > 0.2 && x < 0.9) continue;                                               // under the binnacle
      const q = (dx, dv) => [x + dx, p0.y + up.y * dv, p0.z + up.z * dv];
      k.poly(stitch, [q(-0.007, -0.0012), q(0.007, -0.0012), q(0.007, 0.0012), q(-0.007, 0.0012)], { facing: n.toArray() });
    }
  }
  const crack = [[-0.18, 3.03], [-0.25, 3.06], [-0.31, 3.05], [-0.4, 3.09], [-0.47, 3.08], [-0.55, 3.12]];
  for (let i = 0; i < crack.length - 1; i++) {
    const [xa, za] = crack[i], [xb, zb] = crack[i + 1];
    k.poly('#141312', [[xa, 1.4975, za - 0.002], [xb, 1.4975, zb - 0.002], [xb, 1.4975, zb + 0.002], [xa, 1.4975, za + 0.002]], { facing: [0, 1, 0], off: 0.003 });
  }
  // defrost grille along the windscreen base
  for (let x = -1.0; x <= 1.0; x += 0.045) {
    if (x > 0.18 && x < 0.92) continue;
    k.box('#141414', [0.03, 0.004, 0.012], [x, 1.468, 3.2], { rot: [-0.48, 0, 0] });
  }
  // A-pillar grab handle (driver side)
  {
    const a = V3([1.1, 1.38, 3.31]), b = V3([1.08, 2.13, 2.73]), d = b.clone().sub(a);
    const p0 = a.clone().addScaledVector(d, 0.3).add(V3([-0.07, 0, -0.045])), p1 = a.clone().addScaledVector(d, 0.62).add(V3([-0.07, 0, -0.045]));
    k.geo(new THREE.CylinderGeometry(0.014, 0.014, p0.distanceTo(p1), 8), '#1f1f20', new THREE.Matrix4().compose(p0.clone().add(p1).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize()), new THREE.Vector3(1, 1, 1)));
    for (const p of [p0, p1]) k.box('#1f1f20', [0.07, 0.03, 0.03], [p.x + 0.035, p.y, p.z + 0.02], { c: 0.006 });
  }
  // dome light + headliner bows + a seam
  k.box('#cfc8b6', [0.24, 0.016, 0.12], [0.0, 2.112, 2.38], { c: 0.005 });
  k.box('#f3eedc', [0.2, 0.006, 0.085], [0.0, 2.103, 2.38]);
  for (const z of [2.36, 2.62]) k.box('#bdb29c', [2.12, 0.012, 0.03], [0, 2.116, z], { c: 0.004 });
  // driver door card: pleated insert + window felt
  for (let i = 0; i < 5; i++) k.box(i % 2 ? '#6b5c4b' : '#76665a', [0.012, 0.075, 0.92], [1.046, 0.98 + i * 0.075, 2.55], { c: 0.004 });
  k.box('#1d1d1e', [0.02, 0.02, 1.2], [1.065, 1.47, 2.6]);
  // driver visor: stitched border (visor frame as in the asset)
  inFrame(k, M4([0.68, 2.098, 2.785], [0.72, 0, 0]), () => {
    const th = '#9d927d', z = -0.0112;
    const dash = (x0, y0, x1, y1) => k.poly(th, [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], { facing: [0, 0, -1] });
    for (let x = -0.166; x <= 0.167; x += 0.012) for (const y of [-0.0065, -0.0785]) dash(x - 0.003, y - 0.0006, x + 0.003, y + 0.0006);
    for (let y = -0.072; y < -0.012; y += 0.012) for (const x of [-0.174, 0.174]) dash(x - 0.0006, y - 0.003, x + 0.0006, y + 0.003);
  });
  // keys in the column lock: key head, ring, fob (wheel-mount space)
  inFrame(k, M4(HUB, [TILT, 0, 0]), () => {
    k.box('#c9c3b2', [0.022, 0.026, 0.004], [0.03, -0.094, 0.186], { c: 0.003 });
    k.torus('#b9b4a7', 0.012, 0.0016, [0.03, -0.12, 0.18], { rs: 3, ts: 10, rot: [0.3, 0, 0] });
    k.box(PAL.rvMustard, [0.026, 0.044, 0.006], [0.032, -0.155, 0.17], { c: 0.004, rot: [0.25, 0, 0.12] });
    k.box('#3a2e26', [0.03, 0.012, 0.007], [0.032, -0.137, 0.172], { rot: [0.25, 0, 0.12] });
  });
  // Rook's legs: jeans thighs, knees under the wheel, shins down to the pedals, sneakers
  const jeans = '#47587a', jeansD = '#3c4b69';
  for (const [s, x] of [[1, 0.68], [-1, 0.43]]) {
    const hip = V3([x - s * 0.02, 1.3, 2.42]), knee = V3([x, 1.305, 2.83]), ankle = V3([x + s * 0.01, 0.94, 2.99]);
    const cap = (a, b, r, col) => {
      const g = new THREE.CapsuleGeometry(r, a.distanceTo(b), 1, 7);
      k.geo(g, col, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()), new THREE.Vector3(1, 1, 1)));
      g.dispose();
    };
    cap(hip, knee, 0.078, jeans);
    cap(knee, ankle, 0.056, jeansD);
    k.box('#e3ded2', [0.1, 0.075, 0.24], [ankle.x, 0.86, 3.06], { c: 0.025, rot: [-0.35, 0, 0] });
  }
  return k.geometry();
}

// ── steering wheel (wheel-pivot space: X = Rook's left, Y up, Z into the dash) ──
function buildWheel() {
  const R = RIM_R, T = RIM_TUBE;
  // rim: smooth torus, worn at the 10-and-2 grip spots, finger ridges on the inner half
  const tor = new THREE.TorusGeometry(R, T, 8, 48);
  tor.rotateZ(Math.PI / 2);                                // seam at the top (hidden by the wrap)
  const p = tor.attributes.position, cols = [];
  const base = linear('#24201d'), worn = linear('#4a3e34'), ridge = linear('#171513'), wrap = linear('#5b4a3c');
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const phi = Math.atan2(x, y);                          // 0 = top, + toward Rook's left
    const rr = Math.hypot(x, y);
    const inner = rr < R - T * 0.35;
    const seg = Math.round(((phi + Math.PI) / (Math.PI * 2)) * 48);
    const wear = Math.max(Math.exp(-(((phi - 1.2) / 0.32) ** 2)), Math.exp(-(((phi + 1.2) / 0.32) ** 2))) * (z < 0.004 ? 1 : 0.5);
    c.copy(base).lerp(worn, wear * 0.85);
    if (inner && seg % 2 === 0 && Math.abs(Math.abs(phi) - Math.PI / 2) < 1.0) c.copy(ridge);
    if (Math.abs(phi) < 0.12) c.copy(wrap);                // tape / leather wrap at 12 o'clock
    cols.push(c.r, c.g, c.b);
  }
  tor.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  // spokes, hub, horn pad (flat)
  const k = new Kit(911);
  const spoke = '#2a2826', trim = '#8f8c84';
  for (const [ang, w0, w1] of [[Math.PI / 2, 0.04, 0.026], [-Math.PI / 2, 0.04, 0.026], [Math.PI, 0.046, 0.03]]) {
    const dx = Math.sin(ang), dy = Math.cos(ang);
    const a = [dx * 0.05, dy * 0.05, 0.03], b = [dx * (R - 0.008), dy * (R - 0.008), 0.002];
    bar(k, spoke, a, b, w0, w1, 0.011, [0, 0, 1]);                                      // moulded black spoke
    bar(k, trim, [a[0], a[1], a[2] - 0.006], [b[0] * 0.93, b[1] * 0.93, b[2] - 0.006], w0 * 0.22, w1 * 0.22, 0.002, [0, 0, 1]);   // brushed inlay
    // rubber boot where the spoke meets the rim
    k.geo(new THREE.CylinderGeometry(0.012, 0.016, 0.03, 8), '#1b1918', new THREE.Matrix4().compose(V3([dx * (R - 0.02), dy * (R - 0.02), 0.004]), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), V3([dx, dy, -0.12]).normalize()), new THREE.Vector3(1, 1, 1)));
  }
  k.cyl('#1d1d1e', 0.06, 0.062, 0.05, [0, 0, 0.055], { axis: 'z', seg: 14 });
  k.cyl('#252423', 0.062, 0.046, 0.04, [0, 0, 0.098], { axis: 'z', seg: 12 });
  // horn pad: rounded cushion with an emblem
  const pad = new THREE.SphereGeometry(1, 14, 8);
  const pp = pad.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const f = (v) => Math.sign(v) * Math.pow(Math.abs(v), 0.45);
    pp.setXYZ(i, f(pp.getX(i)) * 0.068, f(pp.getY(i)) * 0.052, pp.getZ(i) * 0.017);
  }
  k.geo(pad, '#252322', new THREE.Matrix4().makeTranslation(0, 0.004, 0.018));
  pad.dispose();
  k.poly(PAL.rvMustard, [[0, 0.02, -0.0005], [0.016, 0.004, -0.0005], [0, -0.012, -0.0005], [-0.016, 0.004, -0.0005]], { facing: [0, 0, -1] });
  k.poly('#121212', [[0, 0.012, -0.001], [0.008, 0.004, -0.001], [0, -0.004, -0.001], [-0.008, 0.004, -0.001]], { facing: [0, 0, -1] });
  const flat = k.geometry();
  const g = mergeGeometries([plain(tor), plain(flat)]);
  tor.dispose(); flat.dispose();
  return g;
}

// ── cluster face canvas ─────────────────────────────────────────────────────
const PX = 1024 / FACE_W;                                  // px per metre
const toPx = (x, y) => [(x + FACE_W / 2) * PX, (FACE_H / 2 - y) * PX];
function drawCluster(cv, { odo = 47312.4, gear = 1 } = {}) {
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  g.fillStyle = '#0c0d0e'; g.fillRect(0, 0, W, H);
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, 'rgba(255,255,255,0.04)'); bg.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const font = (px, w = 700) => `${w} ${px}px "Arial Narrow", Arial, Helvetica, sans-serif`;
  const at = (cx, cy, r, th) => [cx - Math.sin(th) * r, cy - Math.cos(th) * r];
  const dial = (d) => {
    const [cx, cy] = toPx(d.x, d.y), r = d.r * PX;
    const fg = g.createRadialGradient(cx, cy - r * 0.3, r * 0.1, cx, cy, r);
    fg.addColorStop(0, '#202225'); fg.addColorStop(1, '#0e0f10');
    g.fillStyle = fg; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    return [cx, cy, r];
  };
  const tickArc = (cx, cy, r, th, r0, r1, w, col) => {
    const [x0, y0] = at(cx, cy, r * r0, th), [x1, y1] = at(cx, cy, r * r1, th);
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'butt'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  };
  const label = (txt, x, y, px, col = '#e9e2cc', w = 700) => { g.fillStyle = col; g.font = font(px, w); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, x, y); };
  const ivory = '#eee6cf', red = '#e2412f';
  // speedometer: 0–100 mph
  {
    const [cx, cy, r] = dial(DIALS.speed);
    const th = (v) => lerp(2.36, -2.36, v / 100);
    for (let v = 0; v <= 100; v += 2.5) {
      const major = v % 10 === 0, mid = v % 5 === 0;
      tickArc(cx, cy, r, th(v), major ? 0.78 : mid ? 0.85 : 0.89, 0.95, major ? 4 : mid ? 2.4 : 1.4, ivory);
    }
    for (let v = 0; v <= 100; v += 20) { const [x, y] = at(cx, cy, r * 0.6, th(v)); label(String(v), x, y + 1, 21); }
    label('MPH', cx, cy - r * 0.34, 12, '#b9b19b');
    // odometer
    const s = Math.floor(odo * 10) % 1000000, digits = String(s).padStart(6, '0');
    const [ox, oy] = toPx(-0.026, -0.033), dw = 13, dh = 19;
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i === 5 ? '#e9e2cc' : '#050505'; g.fillRect(ox + i * (dw + 1.5), oy - dh / 2, dw, dh);
      label(digits[i], ox + i * (dw + 1.5) + dw / 2, oy + 1, 15, i === 5 ? '#111' : '#e9e2cc', 600);
    }
    g.strokeStyle = '#4a4740'; g.lineWidth = 1.5; g.strokeRect(ox - 2, oy - dh / 2 - 2, 6 * (dw + 1.5) + 2.5, dh + 4);
    // PRNDL
    const sel = gear < 0 ? 1 : gear === 0 ? 2 : 3;
    const [px, py] = toPx(-0.045, -0.06);
    'PRND21'.split('').forEach((ch, i) => {
      const x = px + i * 0.018 * PX;
      if (i === sel) { g.fillStyle = '#ff8a2a'; g.fillRect(x - 10, py - 11, 20, 22); label(ch, x, py + 1, 17, '#1a1008'); } else label(ch, x, py + 1, 16, '#7f7a6c');
    });
  }
  // tachometer: 0–6 ×1000 rpm, red from 5
  {
    const [cx, cy, r] = dial(DIALS.rpm);
    const th = (v) => lerp(2.1, -2.1, v / 6);
    g.strokeStyle = red; g.lineWidth = 7; g.beginPath();
    for (let v = 5; v <= 6.001; v += 0.05) { const [x, y] = at(cx, cy, r * 0.91, th(v)); if (v === 5) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
    for (let v = 0; v <= 6; v += 0.5) tickArc(cx, cy, r, th(v), v % 1 === 0 ? 0.76 : 0.85, 0.95, v % 1 === 0 ? 4 : 2, v >= 5 ? red : ivory);
    for (let v = 0; v <= 6; v++) { const [x, y] = at(cx, cy, r * 0.58, th(v)); label(String(v), x, y + 1, 19, v >= 5 ? red : ivory); }
    label('RPM', cx, cy + r * 0.42, 11, '#b9b19b'); label('×1000', cx, cy + r * 0.62, 10, '#8f8877', 600);
  }
  // combo: temperature (top, C … H) + fuel (bottom, E … F)
  {
    const [cx, cy, r] = dial(DIALS.combo);
    for (let i = 0; i <= 4; i++) {
      const tt = lerp(0.85, -0.85, i / 4); tickArc(cx, cy, r, tt, 0.72, 0.94, i === 4 ? 4 : 2.6, i === 4 ? red : ivory);
      const tf = lerp(FUEL_A[0], FUEL_A[1], i / 4); tickArc(cx, cy, r, tf, 0.72, 0.94, i === 0 ? 4 : 2.6, i === 0 ? red : ivory);
    }
    const lab = (th, txt, col) => { const [x, y] = at(cx, cy, r * 0.5, th); label(txt, x, y + 1, 13, col); };
    lab(0.95, 'C', '#7fb6e6'); lab(-0.95, 'H', red); lab(FUEL_A[0] - 0.1, 'E', red); lab(FUEL_A[1] + 0.1, 'F', ivory);
    g.fillStyle = '#a49c86'; g.font = font(9, 600); g.textAlign = 'center';
    g.fillText('TEMP', cx, cy - r * 0.2); g.fillText('FUEL', cx, cy + r * 0.24);
  }
  // warning-lamp icons (dim; the additive lamp quads light them)
  const icon = (id, x, y, on) => {
    const [cx, cy] = toPx(x, y), s = 0.0105 * PX;
    g.save(); g.translate(cx, cy);
    g.fillStyle = '#1c1d1f'; g.fillRect(-s, -s, s * 2, s * 2);
    g.fillStyle = g.strokeStyle = on; g.lineWidth = 2;
    if (id === 'turnL' || id === 'turnR') {
      g.scale(id === 'turnL' ? 1 : -1, 1);
      g.beginPath(); g.moveTo(-s * 0.75, 0); g.lineTo(-s * 0.05, -s * 0.6); g.lineTo(-s * 0.05, -s * 0.25); g.lineTo(s * 0.7, -s * 0.25); g.lineTo(s * 0.7, s * 0.25); g.lineTo(-s * 0.05, s * 0.25); g.lineTo(-s * 0.05, s * 0.6); g.closePath(); g.fill();
    } else if (id === 'brake') { g.beginPath(); g.arc(0, 0, s * 0.55, 0, Math.PI * 2); g.stroke(); g.font = font(14); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 0, 1); }
    else if (id === 'oil') { g.beginPath(); g.moveTo(-s * 0.7, s * 0.3); g.lineTo(-s * 0.5, -s * 0.15); g.lineTo(s * 0.35, -s * 0.15); g.lineTo(s * 0.75, -s * 0.4); g.lineTo(s * 0.35, s * 0.3); g.closePath(); g.fill(); }
    else if (id === 'batt') { g.strokeRect(-s * 0.7, -s * 0.35, s * 1.4, s * 0.8); g.fillRect(-s * 0.5, -s * 0.55, s * 0.25, s * 0.2); g.fillRect(s * 0.25, -s * 0.55, s * 0.25, s * 0.2); }
    else if (id === 'check') { g.fillRect(-s * 0.6, -s * 0.35, s * 1.1, s * 0.7); g.fillRect(-s * 0.85, -s * 0.15, s * 0.25, s * 0.3); g.fillRect(-s * 0.2, -s * 0.6, s * 0.4, s * 0.25); g.fillRect(s * 0.5, -s * 0.1, s * 0.3, s * 0.2); }
    else if (id === 'nitro') { g.font = font(12); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N₂O', 0, 1); }
    else if (id === 'beam') { g.beginPath(); g.arc(-s * 0.1, 0, s * 0.45, -Math.PI / 2, Math.PI / 2); g.closePath(); g.fill(); for (let i = -1; i <= 1; i++) g.fillRect(s * 0.42, i * s * 0.3 - 1, s * 0.4, 2); }
    g.restore();
  };
  for (const [id, x, y, col] of LAMPS) icon(id, x, y, mix(col, '#1c1d1f', 0.72));
  // glass glare (static, soft)
  for (const d of Object.values(DIALS)) {
    const [cx, cy] = toPx(d.x, d.y), r = d.r * PX;
    const gl = g.createLinearGradient(cx - r, cy - r, cx + r * 0.2, cy + r * 0.2);
    gl.addColorStop(0, 'rgba(255,255,255,0.11)'); gl.addColorStop(0.5, 'rgba(255,255,255,0.03)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gl; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  }
}

export class CabInterior {
  constructor(cab) {
    this.cab = cab;
    this.frame = cab.getObjectByName('rv_frame') || cab;
    this.gauges = cab.getObjectByName('gauges');
    this.wheel = cab.getObjectByName('wheel');
    this.mount = cab.getObjectByName('wheel_mount');
    this.disposables = [];
    this.time = 0;
    this.odo = 47312.4;
    this.gear = 1;
    this.lampState = Object.fromEntries(LAMPS.map(([id]) => [id, 0]));
    this.bulb = 0;
    this._buildBody();
    this._buildWheel();
    if (this.gauges && typeof document !== 'undefined') this._buildCluster();
  }

  // asset body → worn material, cluster art cut out, dressing merged in (still one draw call)
  _buildBody() {
    const body = this.frame.children.find((o) => o.isMesh && o.name === 'body');
    this.bodyMat = cabWearMaterial({ name: 'CR_CabBody' });
    this.disposables.push(this.bodyMat);
    if (!body) return;
    let src = body.geometry.index ? body.geometry.toNonIndexed() : body.geometry.clone();
    if (this.gauges) {
      this.gauges.updateMatrix();
      const inv = this.gauges.matrix.clone().invert();
      const pos = src.attributes.position, keep = [];
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      for (let i = 0; i < pos.count; i += 3) {
        a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
        const m = a.add(b).add(c).divideScalar(3).applyMatrix4(inv);
        const cut = Math.abs(m.x) < FACE_W / 2 + 0.002 && Math.abs(m.y) < FACE_H / 2 + 0.003 && m.z > -0.0035 && m.z < 0.02;
        if (!cut) keep.push(i);
      }
      if (keep.length * 3 < pos.count) {
        const out = new THREE.BufferGeometry();
        for (const key of ['position', 'normal', 'color']) {
          const at = src.attributes[key]; if (!at) continue;
          const arr = new Float32Array(keep.length * 9);
          keep.forEach((i, j) => { for (let v = 0; v < 3; v++) for (let q = 0; q < 3; q++) arr[j * 9 + v * 3 + q] = at.array[(i + v) * 3 + q]; });
          out.setAttribute(key, new THREE.BufferAttribute(arr, 3));
        }
        src.dispose(); src = out;
        this.cut = pos.count / 3 - keep.length;
      }
    }
    const dress = buildDressing();
    const merged = mergeGeometries([plain(src), plain(dress)]);
    src.dispose(); dress.dispose();
    merged.computeBoundingSphere();
    body.geometry = merged;
    body.material = this.bodyMat;
    this.body = body;
    this.disposables.push(merged);
  }

  _buildWheel() {
    if (!this.wheel) return;
    for (const n of ['wheel_mesh', 'hand_l', 'hand_r']) { const o = this.wheel.getObjectByName(n); if (o) o.visible = false; }
    const g = buildWheel();
    this.wheelToFrame = new THREE.Matrix4();
    this.wheelMat = cabWearMaterial({ flat: false, phong: true, shininess: 26, specular: '#2a2622', name: 'CR_CabWheel', scale: 9, toFrame: this.wheelToFrame });
    const m = new THREE.Mesh(g, this.wheelMat);
    m.name = 'fp_wheel';
    m.castShadow = false; m.receiveShadow = false;
    this.wheel.add(m);
    this.wheelMesh = m;
    this.disposables.push(g, this.wheelMat);
  }

  _buildCluster() {
    const gz = this.gauges;
    // face
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = Math.round(1024 * FACE_H / FACE_W);
    this.faceCanvas = cv;
    drawCluster(cv, { odo: this.odo, gear: this.gear });
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    this.faceTex = tex;
    this.faceMat = new THREE.MeshBasicMaterial({ map: tex, color: 0xd8d4cc, name: 'CR_GaugeFace' });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(FACE_W, FACE_H), this.faceMat);
    face.name = 'fp_gauge_face'; face.position.z = 0.0005;
    gz.add(face);
    // bezels (chrome rings standing proud of the face) + a hood lip, merged into one mesh
    const k = new Kit(913);
    for (const d of Object.values(DIALS)) bezel(k, '#a7a49b', d.x, d.y, d.r + 0.002, d.r + 0.011, 0.001, 0.0075, 32);
    k.box('#1a1a1a', [FACE_W + 0.02, 0.012, 0.02], [0, FACE_H / 2 + 0.004, 0.008]);
    k.box('#1a1a1a', [FACE_W + 0.02, 0.01, 0.014], [0, -FACE_H / 2 - 0.003, 0.006]);
    for (const s of [1, -1]) k.box('#1a1a1a', [0.01, FACE_H + 0.02, 0.016], [s * (FACE_W / 2 + 0.004), 0, 0.007]);
    // fuel needle hub pin + a shared needle look (match the asset's needles)
    gz.updateMatrix();
    const bez = new THREE.Mesh(k.geometry(), cabWearMaterial({ name: 'CR_GaugeBezel', scale: 6, toFrame: gz.matrix.clone() }));
    bez.name = 'fp_gauge_bezels'; bez.castShadow = false;
    gz.add(bez);
    this.disposables.push(bez.geometry, bez.material, face.geometry, this.faceMat, tex);
    // fuel needle (same hub as the temp needle, pointing down)
    const nk = new Kit(914);
    const r = DIALS.combo.r;
    nk.poly('#ff6a2a', [[-0.0035, -0.008, 0], [0.0035, -0.008, 0], [0.001, r * 0.86, 0], [-0.001, r * 0.86, 0]], { facing: [0, 0, 1] });
    const needle = new THREE.Mesh(nk.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, name: 'CR_FuelNeedle' }));
    const piv = new THREE.Object3D(); piv.name = 'needle_fuel';
    piv.position.set(DIALS.combo.x, DIALS.combo.y, 0.0085);
    piv.rotation.z = FUEL_A[1];
    piv.add(needle);
    gz.add(piv);
    this.fuelNeedle = piv;
    this.fuel = 0.9;
    this.disposables.push(needle.geometry, needle.material);
    // warning lamps: additive glow quads, colour per vertex (black = off)
    const pos = [], uv = [], idx = [];
    LAMPS.forEach(([, x, y], i) => {
      const s = 0.012;
      pos.push(x - s, y - s, 0.0012, x + s, y - s, 0.0012, x + s, y + s, 0.0012, x - s, y + s, 0.0012);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    lg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    this.lampCol = new THREE.BufferAttribute(new Float32Array(LAMPS.length * 12), 3).setUsage(THREE.DynamicDrawUsage);
    lg.setAttribute('color', this.lampCol);
    lg.setIndex(idx);
    this.lampMat = new THREE.MeshBasicMaterial({ map: softDiscTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, name: 'CR_DashLamps' });
    const lamps = new THREE.Mesh(lg, this.lampMat);
    lamps.name = 'fp_dash_lamps'; lamps.renderOrder = 4;
    gz.add(lamps);
    this.disposables.push(lg, this.lampMat);
    this.lampCols = LAMPS.map(([, , , col]) => linear(col).clone());
  }

  bulbCheck(seconds = 1.6) { this.bulb = seconds; }

  /**
   * @param o.snap      latest snapshot
   * @param o.gear      gearbox gear (-1 R, 0 N, 1..3)
   * @param o.light     0.4 … 1 daylight factor
   * @param o.running   engine running
   */
  update(dt, { snap = null, gear = 1, light = 1, running = true } = {}) {
    this.time += dt;
    const rv = (snap && snap.rv) || {};
    // cab fill: brighter interior in the day, a little backlight at night
    CAB_UNIFORMS.uFill.value = 0.1 + 0.05 * clamp(light, 0, 1);
    if (this.wheelToFrame && this.mount) { this.mount.updateMatrix(); this.wheel.updateMatrix(); this.wheelToFrame.multiplyMatrices(this.mount.matrix, this.wheel.matrix); }
    if (!this.faceCanvas) return;
    // odometer + PRNDL: redraw only when a shown digit / the selector changes
    this.odo += (Math.abs(rv.speed || 0) * dt) / 1609.34;
    const tenth = Math.floor(this.odo * 10), sel = gear < 0 ? -1 : gear === 0 ? 0 : 1;
    if (tenth !== this._tenth || sel !== this._sel) {
      this._tenth = tenth; this._sel = sel;
      drawCluster(this.faceCanvas, { odo: this.odo, gear: sel });
      this.faceTex.needsUpdate = true;
    }
    // night: backlit markings (warmer, brighter); day: a bit dimmer inside the cab
    const night = clamp((0.85 - light) / 0.45, 0, 1);
    this.faceMat.color.setRGB(lerp(0.78, 1.0, night), lerp(0.76, 0.9, night), lerp(0.72, 0.74, night));
    // fuel: cosmetic, drains along the route
    const prog = snap && snap.routeLength ? clamp((snap.dist || 0) / snap.routeLength, 0, 1) : 0;
    const fuelT = clamp(0.94 - prog * 0.78, 0.06, 1);
    this.fuel += (fuelT - this.fuel) * Math.min(1, dt * 0.8);
    const jig = ((snap && snap.feel && snap.feel.bump) || 0) * Math.sin(this.time * 31) * 0.05;
    if (this.fuelNeedle) this.fuelNeedle.rotation.z = lerp(FUEL_A[0], FUEL_A[1], this.fuel) + jig;
    // lamps
    this.bulb = Math.max(0, this.bulb - dt);
    const hp = rv.hp ?? 100, blink = (this.time * 1.5) % 1 < 0.5 ? 1 : 0;
    const L = this.lampState;
    const set = (id, on) => { L[id] = on ? 1 : 0; };
    const hazard = hp < 25 ? blink : 0;
    set('turnL', hazard); set('turnR', hazard);
    set('brake', rv.handbrake);
    set('oil', !running || (hp < 15 && blink));
    set('batt', !running);
    set('check', hp < 40);
    set('nitro', (rv.nitro || 0) > 0);
    set('beam', light < 0.8);
    if (this.bulb > 0) for (const id in L) L[id] = 1;
    const arr = this.lampCol.array;
    let changed = false;
    LAMPS.forEach(([id], i) => {
      const k = L[id] * (id === 'beam' ? 0.7 : 1);
      const c = this.lampCols[i];
      for (let v = 0; v < 4; v++) {
        const o = (i * 4 + v) * 3;
        const r = c.r * k * 1.3, g = c.g * k * 1.3, b = c.b * k * 1.3;
        if (arr[o] !== r || arr[o + 1] !== g || arr[o + 2] !== b) { arr[o] = r; arr[o + 1] = g; arr[o + 2] = b; changed = true; }
      }
    });
    if (changed) this.lampCol.needsUpdate = true;
  }

  get stats() {
    let tris = 0, meshes = 0;
    this.cab.traverse((o) => { if (o.isMesh && o.visible) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
    return { meshes, tris: Math.round(tris), cut: this.cut || 0 };
  }

  dispose() {
    for (const d of this.disposables) d.dispose && d.dispose();
    this.disposables.length = 0;
  }
}
