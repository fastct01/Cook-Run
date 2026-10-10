// ─────────────────────────────────────────────────────────────────────────────
// Hazards pack — rv_cab_fp: Rook's FIRST-PERSON driver's cab (art agent "hazards").
//
// Built in exact RV-local coordinates (buildRV: cab z 1.7..4.3, half-width 1.15, windshield base
// z 3.32 / y 1.38 → top z 2.72 / y 2.14, floor y 0.72, roof y 2.14; van.json driverSeat x 0.55 z 2.5).
// Everything hangs under the child group `rv_frame`, whose frame IS RV-local. The model root is
// offset so the asset check sees it centred on its own footprint:
//     cab.position.set(...cab.userData.rvOffset); rv.add(cab);      // → rv_frame coincides with the RV
// userData.eye = Rook's eye point (RV-local). Camera: rv_frame.add(cam); cam.position.set(...eye);
// cam.rotation.set(userData.eyePitch, 0, 0, 'YXZ') with cam yaw π-flipped to look along +Z (see doc).
//
// Animated parts (each a pivot `<name>` holding `<name>_mesh`, identity rest rotation except the
// authored pose value on rotation.z): needle_speed / needle_rpm / needle_temp, wheel (+ hand_l,
// hand_r as its children), wiper_l / wiper_r. Mirror glass planes are plain meshes.
// Draw calls: body + wheel + 2 hands + 3 needles + 2 wipers + 3 mirror planes = 12.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Kit, root } from '../models/kit.js';
import { PAL, mix, shade, linear } from '../palette.js';
import { pivot, beam, rod, unlitVcol } from './hazards-util.js';

const FY = 0.72;
export const CAB = Object.freeze({
  eye: [0.55, 1.98, 2.5],            // Rook's eyes, RV-local (seat x 0.55; head against the headrest; 16 cm under the cab roof)
  eyePitch: -0.15,                   // rest look: ~8.6° down
  fov: 72,                           // suggested vertical FOV (deg)
  hub: [0.55, 1.56, 2.9],            // steering hub (van.json steeringWheel x/y; 3 cm back so the bigger rim clears the raked glass)
  tilt: 0.6,                         // wheel plane tilted 34° from vertical (top of the rim forward)
  rim: 0.21,
  rvOffset: [0, 0, 2.8],
});
const zWS = (y) => 3.32 - (y - 1.38) * (0.6 / 0.76);   // windshield plane: z at height y
const C = {
  dash: '#3b3936', pad: '#2c2a28', bin: '#33312e', face: '#141516', tick: '#ece4c8', red: '#e0412f',
  door: '#7a6a58', doorD: '#6a5b4b', doorLow: '#4a4038', arm: '#5e5245', head: '#cdc3ad', trim: '#4a4640', trimL: '#8f8576',
  seat: '#7a4a3a', seat2: '#6a3e30', stripe: '#e2d6b0', floor: '#2f3336', chrome: PAL.chrome,
  flannel: '#9a4034', check: '#6e2c26', cuff: '#7a322a', skin: PAL.skin[1], skinD: shade(PAL.skin[1], 0.86),
};
const M4 = (pos, rot = [0, 0, 0], order = 'XYZ') => new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], order)), new THREE.Vector3(1, 1, 1));
function inFrame(k, m, fn) { k.stack.push(k.M.clone().multiply(m)); try { fn(k); } finally { k.stack.pop(); } }
const V = (a) => new THREE.Vector3(...a);

/** Vertex-colour placeholder for mirror glass (sky over road) — the integrator swaps in a render target. */
let _mirrorMat = null;
function mirrorMaterial() { return _mirrorMat || (_mirrorMat = new THREE.MeshBasicMaterial({ vertexColors: true, name: 'CR_MirrorGlass' })); }
function mirrorGlass(name, w, h, pos, yaw, pitch = 0) {
  const geo = new THREE.PlaneGeometry(w, h);
  const p = geo.attributes.position, col = [];
  for (let i = 0; i < p.count; i++) { const c = linear(p.getY(i) > 0 ? '#b9d2dd' : '#5f5e5a'); col.push(c.r, c.g, c.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, mirrorMaterial());
  m.name = name;
  m.position.set(...pos);
  m.rotation.set(pitch, Math.PI + yaw, 0, 'YXZ');   // plane faces −Z (back toward Rook), turned `yaw` toward him
  m.castShadow = false;
  m.userData.mirror = { w, h, note: 'UV u runs left→right as seen by Rook, v bottom→top. Mirror-flip the rear camera image (map.repeat.x = −1, offset.x = 1).' };
  return m;
}

/** Flat ring in a local XY plane facing +Z (gauge bezels). */
function ringXY(k, color, cx, cy, z, r0, r1, seg = 16) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    k.poly(color, [[cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0, z], [cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0, z], [cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1, z], [cx + Math.cos(a0) * r1, cy + Math.sin(a0) * r1, z]], { facing: [0, 0, 1] });
  }
}
function discXY(k, color, cx, cy, z, r, seg = 14) {
  k.poly(color, Array.from({ length: seg }, (_, i) => [cx + Math.cos((i / seg) * Math.PI * 2) * r, cy + Math.sin((i / seg) * Math.PI * 2) * r, z]), { facing: [0, 0, 1] });
}
/** Gauge tick at needle angle θ (rotation.z convention: 0 = up, + = counter-clockwise as Rook sees it). */
function tick(k, color, cx, cy, z, r0, r1, th, w = 0.004) {
  const dx = -Math.sin(th), dy = Math.cos(th), px = -dy * w / 2, py = dx * w / 2;
  k.poly(color, [[cx + dx * r0 - px, cy + dy * r0 - py, z], [cx + dx * r1 - px, cy + dy * r1 - py, z], [cx + dx * r1 + px, cy + dy * r1 + py, z], [cx + dx * r0 + px, cy + dy * r0 + py, z]], { facing: [0, 0, 1] });
}

export const GAUGES = Object.freeze({
  needle_speed: { min: 2.36, max: -2.36, range: [0, 100], unit: 'mph', note: 'rotation.z = lerp(2.36, −2.36, mph/100)' },
  needle_rpm: { min: 2.1, max: -2.1, range: [0, 6000], unit: 'rpm', red: 5000, note: 'rotation.z = lerp(2.1, −2.1, rpm/6000)' },
  needle_temp: { min: 0.85, max: -0.85, range: ['C', 'H'], note: 'rotation.z = lerp(0.85, −0.85, t), t 0 cold … 1 hot (0.5 = normal)' },
});

export function buildRvCabFp(variant = 0) {
  const g = root('rv_cab_fp', variant, { w: 2.9, h: 1.7, l: 1.35 });
  const F = new THREE.Group(); F.name = 'rv_frame';
  F.position.set(-CAB.rvOffset[0], -CAB.rvOffset[1], -CAB.rvOffset[2]);
  g.add(F);
  const k = new Kit(600);

  // ── floor, engine doghouse, pedals ──────────────────────────────────────
  k.box(C.floor, [2.2, 0.04, 1.42], [0, FY - 0.02, 2.62]);
  k.box('#3d3a36', [0.52, 0.4, 0.8], [0, FY, 2.95], { base: true, c: 0.07 });
  k.box('#2c2a28', [0.4, 0.012, 0.5], [0, FY + 0.4, 2.85], { noBottom: true });
  for (const [x, w] of [[0.66, 0.07], [0.46, 0.14]]) k.box('#1f2022', [w, 0.13, 0.025], [x, FY + 0.16, 3.05], { rot: [-0.5, 0, 0] });

  // ── dashboard (matches interior.js's profile, a touch taller) ──────────
  const dashTop = (cx, cy, cz, nx, ny) => (ny > 0.55 ? C.pad : C.dash);
  k.extrude(dashTop, [[2.94, 1.0], [3.31, 1.0], [3.33, 1.4], [3.14, 1.5], [2.99, 1.485], [2.93, 1.41]], 2.18, { axis: 'x', bevel: 0.02 });
  const dz = 2.925;
  const fr = (c, x0, x1, y0, y1, off = 0.003) => k.front(c, dz, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], -1, { off });
  for (const [x0, x1] of [[0.92, 1.04], [-0.14, 0.06], [-1.02, -0.9]]) { fr('#1c1c1b', x0, x1, 1.3, 1.37); for (let i = 1; i < 3; i++) fr('#4a4844', x0, x1, 1.3 + i * 0.023, 1.3 + i * 0.023 + 0.005, 0.005); }
  fr(shade(C.dash, 1.15), -0.86, -0.3, 1.08, 1.3); fr(C.chrome, -0.62, -0.54, 1.25, 1.27, 0.006);                 // glovebox + latch
  fr('#1c1c1b', -0.12, 0.2, 1.12, 1.24); fr('#6a6862', -0.06, 0.14, 1.17, 1.185, 0.006);                          // radio + cassette slot
  for (const x of [-0.09, 0.17]) fr('#8d8a82', x - 0.012, x + 0.012, 1.15, 1.2, 0.006);
  k.front('#c4372b', dz, [[-0.025, 1.32], [0.025, 1.32], [0.0, 1.36]], -1, { off: 0.004 });                       // hazard switch
  // dash-top odds and ends: a folded map on the passenger side, a pen
  k.box('#d6c08a', [0.28, 0.012, 0.2], [-0.7, 1.5, 3.12], { rot: [0.05, 0.35, 0] });
  k.box('#2f5f8a', [0.012, 0.012, 0.14], [-0.35, 1.495, 3.1], { rot: [0, 0.9, 0] });

  // ── instrument binnacle in front of Rook (gauge face tilted toward his eyes) ──
  const bin = [[2.95, 1.43], [3.2, 1.47], [3.06, 1.685], [2.985, 1.72], [2.965, 1.7], [3.0, 1.675], [3.06, 1.62], [2.955, 1.455]];
  inFrame(k, M4([CAB.hub[0], 0, 0]), () => k.extrude((cx, cy, cz, nx, ny) => (ny > 0.6 ? C.pad : C.bin), bin, 0.66, { axis: 'x', bevel: 0.012 }));
  const G0 = bin[6], G1 = bin[7];                                   // gauge face edge [z, y] top → bottom
  const alpha = Math.atan2(G0[0] - G1[0], G0[1] - G1[1]);           // tilt from vertical (~32°)
  const gc = [CAB.hub[0], (G0[1] + G1[1]) / 2 + Math.sin(alpha) * 0.004, (G0[0] + G1[0]) / 2 - Math.cos(alpha) * 0.004];
  const gauges = new THREE.Object3D(); gauges.name = 'gauges';
  gauges.position.set(...gc); gauges.rotation.set(-alpha, Math.PI, 0, 'YXZ');   // local +X = Rook's right, +Y up the face, +Z toward Rook
  F.add(gauges);
  gauges.updateMatrix();
  const GM = gauges.matrix.clone();
  const G = [ // [name, x, y, r, minθ, maxθ, ticks, redFrom]
    ['needle_rpm', -0.178, -0.004, 0.064, 2.1, -2.1, 7, 5],
    ['needle_speed', 0, 0, 0.08, 2.36, -2.36, 11, 99],
    ['needle_temp', 0.163, 0.012, 0.046, 0.85, -0.85, 5, 99],
  ];
  inFrame(k, GM, () => {
    k.box('#1b1b1a', [0.63, 0.2, 0.012], [0, 0, -0.008]);
    for (const [name, x, y, r, a0, a1, n, red] of G) {
      ringXY(k, '#8d8a82', x, y, 0.004, r, r + 0.011, 16);
      discXY(k, C.face, x, y, 0.002, r, 14);
      for (let i = 0; i < n; i++) {
        const th = a0 + (a1 - a0) * (i / (n - 1));
        tick(k, i >= red ? C.red : C.tick, x, y, 0.005, r * 0.74, r * 0.92, th, name === 'needle_speed' ? 0.0045 : 0.004);
        if (name === 'needle_speed' && i < n - 1) tick(k, C.tick, x, y, 0.005, r * 0.83, r * 0.92, th + (a1 - a0) / (n - 1) / 2, 0.0025);
      }
      if (name === 'needle_temp') { tick(k, '#4a8fd0', x, y, 0.006, r * 0.55, r * 0.92, a0, 0.008); tick(k, C.red, x, y, 0.006, r * 0.55, r * 0.92, a1, 0.008); }
      if (name === 'needle_rpm') for (let j = 0; j < 4; j++) tick(k, C.red, x, y, 0.0055, r * 0.86, r * 0.92, a0 + (a1 - a0) * (0.84 + j * 0.05), 0.006);
    }
    // PRNDL strip under the speedo (D lit) + odometer + warning lamps
    k.box('#0f1011', [0.1, 0.022, 0.004], [0, -0.062, 0.006]);
    for (let i = 0; i < 5; i++) k.box(i === 3 ? '#ff8a2a' : '#8d8a82', [0.009, 0.012, 0.004], [-0.04 + i * 0.02, -0.062, 0.009]);
    k.box('#e8e2cf', [0.04, 0.01, 0.003], [0, -0.03, 0.006]);
    for (const [lx, c] of [[-0.098, '#d9a83a'], [0.098, '#5fbf6f'], [-0.27, '#c4372b'], [0.27, '#4a8fd0']]) k.box(c, [0.014, 0.01, 0.004], [lx, -0.075, 0.006]);
  });
  const needleMat = unlitVcol('CR_GaugeNeedle');
  for (const [name, x, y, r, a0] of G) {
    const nk = new Kit(601);
    nk.poly('#ff6a2a', [[-0.0045, -0.012, 0], [0.0045, -0.012, 0], [0.0012, r * 0.9, 0], [-0.0012, r * 0.9, 0]], { facing: [0, 0, 1] });
    discXY(nk, '#2a2a2b', 0, 0, 0.002, 0.009, 8);
    const pv = pivot(name, nk.mesh('m', needleMat, false), [x, y, 0.009]);
    pv.rotation.z = a0;
    gauges.add(pv);
  }

  // ── steering column (static) + column shifter + turn stalk ─────────────
  const WM = M4(CAB.hub, [CAB.tilt, 0, 0]);          // wheel mount: local +Z = column axis (down/forward into the dash)
  inFrame(k, WM, () => {
    k.cyl('#4a4844', 0.034, 0.042, 0.42, [0, 0, 0.24], { axis: 'z', seg: 8 });
    k.box('#2e2d2b', [0.13, 0.11, 0.17], [0, -0.012, 0.2], { c: 0.02 });
    beam(k, C.chrome, [-0.05, 0.02, 0.17], [-0.25, 0.075, 0.085], 0.014);
    k.box('#1d1d1e', [0.05, 0.03, 0.03], [-0.27, 0.08, 0.08], { c: 0.008 });
    beam(k, '#1d1d1e', [0.055, -0.005, 0.15], [0.19, 0.02, 0.1], 0.012);
    k.box('#8d8a82', [0.02, 0.02, 0.03], [0.03, -0.065, 0.2]);                                                    // ignition + key
    k.box(PAL.rvMustard, [0.015, 0.03, 0.004], [0.03, -0.088, 0.19]);
  });

  // ── steering wheel `wheel` (+ hands as children) ───────────────────────
  const wheelMount = new THREE.Object3D(); wheelMount.name = 'wheel_mount';
  wheelMount.position.set(...CAB.hub); wheelMount.rotation.set(CAB.tilt, 0, 0);
  F.add(wheelMount);
  const wk = new Kit(610);
  const R = CAB.rim;
  wk.torus('#3a2e26', R, 0.0135, [0, 0, 0], { rs: 5, ts: 26 });
  for (const s of [1, -1]) wk.box('#8d8a82', [R - 0.045, 0.03, 0.01], [s * (R / 2 + 0.018), 0, 0.008], { rot: [0, s * 0.12, 0] });
  wk.box('#8d8a82', [0.03, R - 0.045, 0.01], [0, -(R / 2 + 0.018), 0.008], { rot: [-0.12, 0, 0] });
  wk.cyl('#2a2a2b', 0.052, 0.056, 0.05, [0, 0, 0.022], { axis: 'z', seg: 10 });
  wk.cyl('#1d1d1e', 0.043, 0.043, 0.012, [0, 0, -0.008], { axis: 'z', seg: 10 });
  wk.poly(PAL.rvMustard, [[0, 0.016, -0.0145], [0.014, 0, -0.0145], [0, -0.016, -0.0145], [-0.014, 0, -0.0145]], { facing: [0, 0, -1] });
  wk.box('#5a4a3e', [0.05, 0.016, 0.03], [0, R, 0], { rot: [0, 0, 0] });                                       // worn wrap at the top
  const wheel = pivot('wheel', wk.mesh('m'), [0, 0, 0]);
  wheelMount.add(wheel);
  // hands at ~10 and 2 o'clock, forearms in flannel reaching back to Rook's elbows
  wheelMount.updateMatrixWorld(true);
  const HANDA = 1.08;                                     // grip angle from the top of the rim (rad)
  for (const [name, s] of [['hand_l', 1], ['hand_r', -1]]) {
    const grip = [s * R * Math.sin(HANDA), R * Math.cos(HANDA), 0];
    const Mh = WM.clone().multiply(M4(grip));            // hand pivot → rv_frame (authored pose)
    const inv = Mh.clone().invert();
    const hk = new Kit(620 + (s > 0 ? 0 : 1));
    const tang = -s * HANDA;                              // fist's long axis along the rim tangent
    hk.box(C.skin, [0.1, 0.08, 0.075], [0, 0, -0.012], { rot: [0, 0, tang], c: 0.022 });
    hk.box(C.skinD, [0.098, 0.016, 0.02], [s * 0.026 * Math.sin(HANDA), 0.026 * Math.cos(HANDA), -0.04], { rot: [0, 0, tang] });   // knuckle ridge
    hk.box(C.skin, [0.06, 0.028, 0.03], [-s * 0.038 * Math.sin(HANDA), -0.038 * Math.cos(HANDA), -0.03], { rot: [0, 0, tang + s * 0.5], c: 0.01 });  // thumb
    // forearm in RV-local space (IK from the shoulder), drawn through the inverse hand matrix
    const Gw = V(grip).applyMatrix4(WM);
    const S = V([CAB.hub[0] + s * 0.25, 1.72, 2.45]);
    const Wp = Gw.clone().add(new THREE.Vector3(s * 0.01, -0.035, -0.06));
    const d = Wp.distanceTo(S), a = 0.3, b = 0.29, u = Wp.clone().sub(S).normalize();
    const along = (a * a - b * b + d * d) / (2 * d), hgt = Math.sqrt(Math.max(0, a * a - along * along));
    const pole = new THREE.Vector3(s * 0.6, -0.8, 0); pole.sub(u.clone().multiplyScalar(pole.dot(u))).normalize();
    const E = S.clone().add(u.clone().multiplyScalar(along)).add(pole.multiplyScalar(hgt));
    const dir = E.clone().sub(Wp).normalize();
    const P = (t) => Wp.clone().lerp(E, t).toArray();
    hk.stack.push(hk.M.clone().multiply(inv));
    beam(hk, C.skin, Gw.clone().add(dir.clone().multiplyScalar(0.02)).toArray(), Wp.clone().add(dir.clone().multiplyScalar(0.03)).toArray(), 0.07, 0.062);
    beam(hk, C.cuff, Wp.clone().add(dir.clone().multiplyScalar(0.025)).toArray(), Wp.clone().add(dir.clone().multiplyScalar(0.085)).toArray(), 0.1, 0.094);
    beam(hk, C.flannel, Wp.clone().add(dir.clone().multiplyScalar(0.08)).toArray(), E.toArray(), 0.108, 0.1);
    beam(hk, C.check, P(0.38), P(0.46), 0.112, 0.104);
    beam(hk, C.check, P(0.72), P(0.8), 0.112, 0.104);
    hk.stack.pop();
    wheel.add(pivot(name, hk.mesh('m'), grip));
  }

  // ── windshield frame: A-pillars, header, cowl ─────────────────────────
  for (const s of [1, -1]) {
    beam(k, C.trim, [s * 1.1, 1.38, 3.31], [s * 1.08, 2.13, 2.73], 0.1, 0.09);
    beam(k, C.trim, [s * 1.12, 1.42, 3.22], [s * 1.12, 2.06, 2.76], 0.04, 0.05);                          // door-glass front run
  }
  k.box(C.trim, [2.2, 0.075, 0.1], [0, 2.115, 2.755]);
  k.box(C.pad, [2.12, 0.025, 0.06], [0, 1.395, 3.3], { rot: [-0.9, 0, 0] });

  // ── headliner, roof rails, B-pillars, rear wall stub ─────────────────
  k.box(C.head, [2.22, 0.03, 0.9], [0, 2.135, 2.27]);
  for (const [z, w] of [[2.55, 0.02], [2.1, 0.02]]) k.box(shade(C.head, 0.9), [2.1, 0.008, w], [0, 2.118, z]);
  for (const s of [1, -1]) {
    k.box(C.trimL, [0.08, 0.075, 0.86], [s * 1.1, 2.095, 2.33]);
    k.box(C.trimL, [0.09, 0.72, 0.09], [s * 1.1, 1.78, 1.94]);
  }
  k.box(C.trimL, [2.1, 1.0, 0.06], [0, FY + 0.5, 2.0]);                                                     // partition (low)

  // ── door panels (both sides, mirrored) ─────────────────────────────────
  for (const s of [1, -1]) {
    const x = s * 1.085, xi = s * 1.05;
    k.box((cx, cy) => (cy < 0.86 ? C.doorLow : C.door), [0.07, 0.93, 1.3], [x, 0.5, 2.6], { base: true });
    k.box(C.doorD, [0.08, 0.05, 1.3], [x, 1.44, 2.6]);                                                      // sill / window ledge
    k.box(PAL.rvBody, [0.03, 0.025, 1.24], [s * 1.12, 1.47, 2.6]);
    k.box(C.arm, [0.1, 0.07, 0.6], [xi - s * 0.02, 1.13, 2.45], { c: 0.02 });                              // armrest
    k.box(C.doorD, [0.03, 0.12, 0.2], [xi, 1.24, 2.95]);                                                    // pull cup
    k.box(C.chrome, [0.03, 0.03, 0.12], [xi, 1.3, 3.05], { c: 0.008 });                                     // handle
    k.cyl('#5a5650', 0.03, 0.03, 0.03, [xi, 1.2, 2.2], { axis: 'x', seg: 8 });                              // window crank
    beam(k, C.chrome, [xi - s * 0.02, 1.2, 2.2], [xi - s * 0.02, 1.14, 2.31], 0.014);
    k.box('#1d1d1e', [0.04, 0.03, 0.05], [xi - s * 0.03, 1.14, 2.32]);
    k.box(C.doorLow, [0.06, 0.18, 0.7], [xi, 0.72, 2.55]);                                                  // map pocket
    k.cyl('#252423', 0.07, 0.07, 0.02, [xi, 0.98, 3.05], { axis: 'x', seg: 10 });                           // speaker
    k.cyl('#c8c4b8', 0.012, 0.012, 0.05, [s * 1.07, 1.48, 1.98], { seg: 6 });                               // lock knob
    k.box(C.trim, [0.06, 0.06, 0.2], [s * 1.09, 0.62, 3.2]);                                                // kick panel
  }

  // ── seats (driver + passenger, as in interior.js) ───────────────────────
  for (const x of [0.55, -0.55]) {
    k.box('#4a4540', [0.5, 0.4, 0.5], [x, FY + 0.2, 2.55], { c: 0.03 });
    k.box(C.seat, [0.52, 0.1, 0.52], [x, FY + 0.45, 2.56], { c: 0.035 });
    k.box(C.seat, [0.52, 0.7, 0.12], [x, FY + 0.82, 2.3], { c: 0.035, rot: [-0.12, 0, 0] });
    k.box(C.seat2, [0.36, 0.18, 0.1], [x, FY + 1.27, 2.27], { c: 0.03, rot: [-0.12, 0, 0] });
    k.box(C.stripe, [0.12, 0.5, 0.01], [x + 0.12, FY + 0.82, 2.37], { rot: [-0.12, 0, 0] });
  }

  // ── side mirrors (housings enclose buildRV's own mirror boxes) + centre mirror ──
  const MIR = [['mirror_l_glass', 1, 0.3], ['mirror_r_glass', -1, -0.48]];
  const glass = [];
  for (const [name, s, yaw] of MIR) {
    const c = [s * 1.37, 1.6, 3.2];
    inFrame(k, M4(c, [0, yaw, 0]), () => {
      k.box('#1f2022', [0.2, 0.39, 0.24], [0, 0, 0], { c: 0.03 });
      k.box('#2c2d30', [0.19, 0.37, 0.01], [0, 0, -0.118]);
    });
    beam(k, '#2c2d30', [s * 1.15, 1.47, 3.06], [s * 1.28, 1.5, 3.17], 0.03);
    beam(k, '#2c2d30', [s * 1.15, 1.74, 3.0], [s * 1.28, 1.72, 3.17], 0.03);
    const off = new THREE.Vector3(0, 0, -0.125).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    glass.push(mirrorGlass(name, 0.17, 0.33, [c[0] + off.x, c[1], c[2] + off.z], yaw));
  }
  const cm = [0.22, 2.02, 2.8], cyaw = -0.42;
  inFrame(k, M4(cm, [0, cyaw, 0]), () => k.box('#2a2a2b', [0.3, 0.095, 0.035], [0, 0, 0], { c: 0.012 }));
  beam(k, '#2a2a2b', [0.22, 2.1, 2.77], [0.22, 2.05, 2.8], 0.02);
  { const off = new THREE.Vector3(0, 0, -0.02).applyAxisAngle(new THREE.Vector3(0, 1, 0), cyaw); glass.push(mirrorGlass('mirror_c_glass', 0.27, 0.075, [cm[0] + off.x, cm[1], cm[2] + off.z], cyaw)); }
  // pine air freshener hanging off the mirror stalk
  rod(k, '#d9d2bf', [[0.22, 2.0, 2.8], [0.22, 1.955, 2.8]], 0.002, 3);
  const pine = [[0.22, 1.955], [0.242, 1.912], [0.23, 1.912], [0.236, 1.894], [0.204, 1.894], [0.21, 1.912], [0.198, 1.912]];
  k.front(PAL.rvTeal, 2.8, pine, -1, { off: 0 }); k.front(PAL.rvTeal, 2.8, pine, 1, { off: 0 });

  // ── sun visor (driver's, lowered) with a tucked photo; passenger visor stowed ──
  inFrame(k, M4([0.68, 2.098, 2.785], [0.72, 0, 0]), () => {     // hangs down local −Y (bottom edge swung toward Rook); his side = local −Z
    k.box('#bfb39a', [0.36, 0.085, 0.022], [0, -0.0425, 0], { c: 0.008 });
    k.box('#6e6352', [0.36, 0.01, 0.024], [0, -0.05, -0.002]);                                             // elastic strap
    const pz = -0.0125;
    const q = (c, x0, x1, y0, y1, o = 0) => k.poly(c, [[x0, y0, pz - o], [x1, y0, pz - o], [x1, y1, pz - o], [x0, y1, pz - o]], { facing: [0, 0, -1] });
    q('#efe9dc', -0.04, 0.05, -0.078, -0.016);                   // photo border
    q('#9fc4d8', -0.033, 0.043, -0.045, -0.022, 0.001);          // sky
    q('#c98a52', -0.033, 0.043, -0.071, -0.045, 0.001);          // desert
    q('#7e4a32', -0.02, 0.0, -0.064, -0.038, 0.002);             // Rook + Doc in front of the RV, tiny
    q('#e9e2cf', 0.008, 0.038, -0.064, -0.044, 0.002);
    q(PAL.rvTeal, 0.008, 0.038, -0.064, -0.057, 0.003);
    q('#3b2a20', -0.013, -0.006, -0.038, -0.032, 0.002);
    k.box('#8d8a82', [0.03, 0.02, 0.03], [-0.16, 0.0, 0.0]);
  });
  k.box('#bfb39a', [0.46, 0.022, 0.16], [-0.56, 2.105, 2.66], { c: 0.008 });

  // ── CB radio on the dash top right of the binnacle; handset hangs off its hook on a coiled cord ──
  inFrame(k, M4([0.04, 1.49, 3.08], [-0.25, 0, 0]), () => {
    k.box('#2b2c2e', [0.2, 0.06, 0.16], [0, 0.03, 0], { c: 0.01 });
    k.box('#9a9890', [0.19, 0.052, 0.006], [0, 0.03, -0.081]);
    k.box('#ff3a2a', [0.04, 0.016, 0.004], [0.045, 0.04, -0.085]);
    k.box('#1d1d1e', [0.05, 0.012, 0.004], [-0.03, 0.045, -0.085]);
    for (const x of [-0.06, -0.02]) k.cyl('#1d1d1e', 0.011, 0.011, 0.016, [x, 0.018, -0.088], { axis: 'z', seg: 6 });
    k.box('#3a3b3d', [0.02, 0.03, 0.04], [0.11, 0.03, -0.06]);                                              // mic hook
  });
  k.box('#1f2022', [0.038, 0.1, 0.045], [0.165, 1.44, 2.905], { rot: [0.05, 0.25, -0.1], c: 0.012 });       // handset
  k.box('#4a4b4e', [0.022, 0.018, 0.008], [0.163, 1.47, 2.88], { rot: [0.05, 0.25, -0.1] });
  const coil = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; coil.push([0.16 - 0.12 * t + (i % 2 ? 0.012 : -0.012), 1.39 - 0.07 * Math.sin(t * Math.PI), 2.905 + 0.03 * t]); }
  rod(k, '#141414', coil, 0.005, 3);

  // ── hula dashboard figure (generic dancer on a spring), stuck to the binnacle brow ──
  k.at([0.3, 1.705, 3.0], () => {
    k.cyl('#2a2a2b', 0.035, 0.04, 0.012, [0, 0.006, 0], { seg: 8 });
    k.cyl('#9a9890', 0.008, 0.008, 0.03, [0, 0.027, 0], { seg: 5 });
    k.cone('#8aa64a', 0.045, 0.06, [0, 0.07, 0], { seg: 8, rot: [Math.PI, 0, 0] });                           // grass skirt
    k.cone('#c7b24a', 0.04, 0.035, [0, 0.062, 0], { seg: 8, rot: [Math.PI, 0.3, 0] });
    k.box('#b8835a', [0.04, 0.05, 0.028], [0, 0.123, 0], { c: 0.008 });                                     // torso
    k.torus('#e07a9a', 0.022, 0.006, [0, 0.14, 0], { rs: 3, ts: 8, rot: [Math.PI / 2, 0, 0] });             // lei
    k.box('#b8835a', [0.034, 0.036, 0.032], [0, 0.17, 0], { c: 0.01 });                                      // head
    k.box('#1f1a17', [0.038, 0.03, 0.036], [0, 0.18, -0.006], { c: 0.01 });                                  // hair
    k.box('#f0d24a', [0.012, 0.012, 0.012], [0.017, 0.185, 0.0]);                                            // flower
    for (const sx of [1, -1]) k.box('#b8835a', [0.01, 0.045, 0.01], [sx * 0.03, 0.15, 0.0], { rot: [0, 0, sx * -0.6] });
  });

  // ── clip-on cup holder with a coffee, on the dash face left of the wheel ──
  k.at([0.95, 1.44, 2.88], () => {
    k.box('#2a2a2b', [0.06, 0.05, 0.03], [0, 0.0, 0.03]);
    k.cyl('#2a2a2b', 0.047, 0.047, 0.035, [0, -0.01, -0.02], { seg: 8, open: true });
    k.lathe('#f1ece0', [[0.033, -0.06], [0.042, 0.05], [0.0, 0.05]], 8, [0, 0, -0.02]);
    k.cyl('#9a6a3e', 0.04, 0.038, 0.035, [0, 0.02, -0.02], { seg: 8, open: true });                           // sleeve
    k.cyl('#4a3426', 0.044, 0.044, 0.012, [0, 0.056, -0.02], { seg: 8 });                                    // lid
    k.box('#3a2a20', [0.012, 0.008, 0.016], [0, 0.064, -0.045]);
  });

  F.add(k.mesh('body'));

  // ── wipers (outside the glass at its base). Mount frames: local X = world X, local Y up the glass,
  //    local Z out of the glass. wiper_*.rotation.z: 0 = parked (arm along +X) … 1.75 = top of the sweep.
  const up = new THREE.Vector3(0, 0.76, -0.6).normalize(), out = new THREE.Vector3(0, 0.6, 0.76).normalize();
  const tiltW = Math.atan2(up.z, up.y);
  for (const [name, x] of [['wiper_l', 0.3], ['wiper_r', -0.72]]) {
    const p = new THREE.Vector3(x, 1.38, 3.32).add(up.clone().multiplyScalar(0.06)).add(out.clone().multiplyScalar(0.045));
    const mount = new THREE.Object3D(); mount.name = name + '_mount';
    mount.position.copy(p); mount.rotation.set(tiltW, 0, 0);
    const kk = new Kit(630);
    const L = 0.62;
    kk.box('#1f2022', [L, 0.018, 0.012], [L / 2, 0, 0.006]);
    kk.box('#2a2b2d', [L - 0.1, 0.012, 0.02], [L / 2 + 0.04, 0.0, -0.028]);
    kk.box('#1f2022', [0.02, 0.012, 0.03], [L / 2 + 0.04, 0, -0.012]);
    kk.cyl('#2a2b2d', 0.022, 0.022, 0.03, [0, 0, 0], { axis: 'z', seg: 6 });
    mount.add(pivot(name, kk.mesh('m'), [0, 0, 0]));
    F.add(mount);
  }
  for (const m of glass) F.add(m);

  const eye = CAB.eye;
  g.userData.eye = eye.slice();
  g.userData.eyeModel = [eye[0] - CAB.rvOffset[0], eye[1] - CAB.rvOffset[1], +(eye[2] - CAB.rvOffset[2]).toFixed(3)];
  g.userData.eyePitch = CAB.eyePitch;
  g.userData.fov = CAB.fov;
  g.userData.rvOffset = CAB.rvOffset.slice();
  g.userData.gauges = GAUGES;
  g.userData.wheel = { axis: 'z', hub: CAB.hub, tilt: CAB.tilt, radius: R, note: 'wheel.rotation.z > 0 turns RIGHT (clockwise as Rook sees it); suggested ±2.2 rad at full lock. Optional: hand_l/hand_r.rotation.z = −0.5·wheel.rotation.z keeps the sleeves from crossing.' };
  g.userData.wipers = { axis: 'z', parked: 0, sweep: 1.75 };
  g.userData.perInstanceMaterials = ['mirror_l_glass', 'mirror_r_glass', 'mirror_c_glass'];
  g.userData.viewBox = { min: [-1.5, -0.1 + 0.5, -0.65], max: [1.5, 2.2, 0.65] };
  return g;
}
