// ─────────────────────────────────────────────────────────────────────────────
// Round 3 cab (agent R3-CAB) — rv_cab_fp_r3: PROPOSED redesign of Rook's first-person cab.
//
// Same contract as hazards-cab.js `rv_cab_fp` (drop-in: change the kind string):
//   root offset by userData.rvOffset, everything under `rv_frame` (RV-local), userData eye/eyePitch/
//   fov/rvOffset/gauges/wheel/wipers/perInstanceMaterials/viewBox, pivots needle_speed / needle_rpm /
//   needle_temp (under `gauges`), wheel (under `wheel_mount`) with hand_l / hand_r as its children,
//   wiper_l / wiper_r (under wiper_*_mount), mirror planes mirror_l_glass / mirror_r_glass / mirror_c_glass.
// New:
//   horn_pad      child of wheel        position.z 0 → +0.005 while honking
//   stalk_signal  child of wheel_mount  rotation.z +0.2 right turn (lever up) · −0.2 left turn
//   stalk_wiper   child of wheel_mount  rotation.z 0 off → +0.18 wipers on (lever down)
//   key           child of key_mount    rotation.z 0 off · 0.62 run (authored) · 1.05 start (spring back to run)
//   gear_pointer  child of gauges       rotation.z P 0.24 (authored) · R 0.12 · N 0 · D −0.12 · L −0.24 (CCW = +, like the needles)
//   lamp_check, lamp_oil, lamp_heat  meshes under gauges with their own emissive lamp materials
//                 (perInstanceMaterials → cloneInstanceMaterials(cab).lamp_oil.emissiveIntensity = 1.3)
//   R3-CAB2 (r3-cab-trinkets.js): hula (anchor; base baked into the body) → hula_spring → hula_hips / hula_arms,
//                 freshener, dice — spring / pendulum pivots driven by render/fp/trinkets.js (userData.trinkets)
// Draw calls: body + wheel + horn_pad + 2 hands + 3 needles + gear_pointer + 3 lamps + 2 stalks + key
//             + 2 wipers + 3 mirror planes = 20, + hula_spring, hula_hips, hula_arms, freshener, dice = 25 (rv_cab_fp: 12).
//             ~6.6k tris per variant. userData.controls lists all of this.
// Printed details (gauge faces, PRNDL, radio dial, lamp legends, badge, fob, stitching, tapes, CB, map) come from
// one CanvasTexture atlas (r3-cab-atlas.js) multiplied with vertex colours, so they cost no extra draw calls.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Kit, root } from '../models/kit.js';
import { PAL, shade, linear } from '../palette.js';
import { pivot, beam, rod, unlitVcol } from './hazards-util.js';
import { CAB, GAUGES } from './hazards-cab.js';
import { V, V3, M4, inFrame, basis, frameAB, quad, bar, limb, torus, Decals, bake } from './r3-cab-geo.js';
import { cabAtlas, uvOf, WHITE_UV } from './r3-cab-atlas.js';
import { buildHands } from './r3-cab-hands.js';
import { addTrinkets, dashLife, visorSlips, TRINKETS } from './r3-cab-trinkets.js';

const FY = 0.72;
const R = CAB.rim;             // 0.21 → 42 cm wheel
const RT = 0.0152;             // rim tube radius (leather-wrapped, ~3 cm thick)
export const R3 = Object.freeze({
  handA: 1.3,                  // grip angle from 12 o'clock (rad): "9-and-3, thumbs on the spokes", raised just enough to stay on screen
  spokeA: 1.37,                // upper spokes (thumbs rest on them)
  lowSpokeA: 2.6,              // lower spokes (~5 and 7 o'clock)
  dish: 0.036,                 // hub sits 3.6 cm further from Rook than the rim
  gearStep: 0.12,              // gear_pointer detent (rad)
  lockA: 2.05,                 // ignition lock position on the column head (rad clockwise from the top, as Rook sees it)
  lockZ: 0.07,                 // … and its depth along the column
  keyRun: 0.62,                // key.rotation.z authored pose (RUN)
});
const C = {
  dash: '#5e5044', dashL: '#6c5d4f', pad: '#3a312b', bin: '#2a2623', plate: '#161616', face: '#141516', tick: '#f2ecd8', red: '#e0412f',
  chrome: '#d2d0c6', chromeD: '#8e8c85', blackP: '#1d1d1e', blackP2: '#262628',
  door: '#7a6a58', doorD: '#6a5b4b', doorLow: '#4a4038', arm: '#5e5245', head: '#cdc3ad', trim: '#4a4640', trimL: '#8f8576',
  seat: '#7a4a3a', seat2: '#6a3e30', stripe: '#e2d6b0', floor: '#2f3336',
  leather: '#2b231e', leather2: '#2f2621', leatherD: '#211a16', metal: '#b8b9b4', metalD: '#7c7d79', cover: '#1f1f20', coverL: '#2a2a2b',
  pad1: '#2b2724', pad2: '#221f1c', needle: '#ff6a2a',
};

// ── materials (cached) ───────────────────────────────────────────────────────
const _mats = new Map();
const cached = (key, make) => { let m = _mats.get(key); if (!m) { m = make(); _mats.set(key, m); } return m; };
function materials() {
  const map = cabAtlas();
  return {
    map,
    body: cached('body', () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, map, name: 'CR_R3Cab_Body' })),
    smooth: cached('smooth', () => new THREE.MeshPhongMaterial({ vertexColors: true, map, shininess: 26, specular: new THREE.Color('#2a2a2a'), name: 'CR_R3Cab_Smooth' })),
    glove: cached('glove', () => new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 38, specular: new THREE.Color('#3c4248'), name: 'CR_R3Cab_Glove' })),
    skin: cached('skin', () => new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 12, specular: new THREE.Color('#161412'), name: 'CR_R3Cab_Skin' })),
    needle: unlitVcol('CR_R3Cab_Needle'),
    lamp: (id, off, on) => cached('lamp|' + id, () => {
      const m = new THREE.MeshLambertMaterial({ color: off, emissive: on, emissiveIntensity: 0, map, emissiveMap: map, name: 'CR_R3Cab_' + id });
      m.userData.lamp = true;
      return m;
    }),
  };
}

// ── small flat helpers in a local XY plane facing +Z ─────────────────────────
function ringXY(k, color, cx, cy, z, r0, r1, seg = 16, a0 = 0, a1 = Math.PI * 2) {
  for (let i = 0; i < seg; i++) {
    const t0 = a0 + (a1 - a0) * (i / seg), t1 = a0 + (a1 - a0) * ((i + 1) / seg);
    k.poly(typeof color === 'function' ? color(i) : color, [[cx + Math.cos(t0) * r0, cy + Math.sin(t0) * r0, z], [cx + Math.cos(t1) * r0, cy + Math.sin(t1) * r0, z],
      [cx + Math.cos(t1) * r1, cy + Math.sin(t1) * r1, z], [cx + Math.cos(t0) * r1, cy + Math.sin(t0) * r1, z]], { facing: [0, 0, 1] });
  }
}
function discXY(k, color, cx, cy, z, r, seg = 14) {
  k.poly(color, Array.from({ length: seg }, (_, i) => [cx + Math.cos((i / seg) * Math.PI * 2) * r, cy + Math.sin((i / seg) * Math.PI * 2) * r, z]), { facing: [0, 0, 1] });
}
/** Tick at needle angle θ (0 = up, + = CCW as Rook sees it). */
function tick(k, color, cx, cy, z, r0, r1, th, w = 0.004) {
  const dx = -Math.sin(th), dy = Math.cos(th), px = -dy * w / 2, py = dx * w / 2;
  k.poly(color, [[cx + dx * r0 - px, cy + dy * r0 - py, z], [cx + dx * r1 - px, cy + dy * r1 - py, z], [cx + dx * r1 + px, cy + dy * r1 + py, z], [cx + dx * r0 + px, cy + dy * r0 + py, z]], { facing: [0, 0, 1] });
}
/** Lathe around the local Z axis at (cx, cy): profile [[r, z], ...]; each band coloured by cols[i]. */
function latheZ(k, cols, cx, cy, prof, seg = 18) {
  for (let b = 0; b < prof.length - 1; b++) {
    const [r0, z0] = prof[b], [r1, z1] = prof[b + 1];
    const nr = z1 - z0, nz = -(r1 - r0);
    for (let i = 0; i < seg; i++) {
      const t0 = (i / seg) * Math.PI * 2, t1 = ((i + 1) / seg) * Math.PI * 2, tm = (t0 + t1) / 2;
      const P = (r, z, t) => new V3(cx + Math.cos(t) * r, cy + Math.sin(t) * r, z);
      const out = new V3(Math.cos(tm) * nr, Math.sin(tm) * nr, nz);
      quad(k, Array.isArray(cols) ? cols[b] : cols, P(r0, z0, t0), P(r0, z0, t1), P(r1, z1, t1), P(r1, z1, t0), out);
    }
  }
}

/** Vertex-colour placeholder for mirror glass (sky over road) — mirrors.js swaps in a render target. */
let _mirrorMat = null;
function mirrorGlass(name, w, h, pos, yaw, pitch = 0) {
  const geo = new THREE.PlaneGeometry(w, h);
  const p = geo.attributes.position, col = [];
  for (let i = 0; i < p.count; i++) { const c = linear(p.getY(i) > 0 ? '#b9d2dd' : '#5f5e5a'); col.push(c.r, c.g, c.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, _mirrorMat || (_mirrorMat = new THREE.MeshBasicMaterial({ vertexColors: true, name: 'CR_MirrorGlass' })));
  m.name = name;
  m.position.set(...pos);
  m.rotation.set(pitch, Math.PI + yaw, 0, 'YXZ');
  m.castShadow = false;
  m.userData.mirror = { w, h, note: 'UV u runs left→right as seen by Rook, v bottom→top. Mirror-flip the rear camera image (map.repeat.x = −1, offset.x = 1).' };
  return m;
}

/** Quad-mesh with its own material and atlas UVs (warning lamps). */
function lampMesh(name, material, c, ax, ay, uv) {
  const [u0, v0, u1, v1] = uv;
  const P = [c.clone().sub(ax).sub(ay), c.clone().add(ax).sub(ay), c.clone().add(ax).add(ay), c.clone().sub(ax).add(ay)];
  const U = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  const pos = [], uvs = [];
  for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(P[i].x, P[i].y, P[i].z); uvs.push(U[i][0], U[i][1]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
  const m = new THREE.Mesh(g, material);
  m.name = name; m.castShadow = false; m.receiveShadow = false;
  return m;
}

// ═════════════════════════════════════════════════════════════════════════════
export function buildRvCabFpR3(variant = 0) {
  const g = root('rv_cab_fp_r3', variant, { w: 2.9, h: 1.7, l: 1.35 });
  const F = new THREE.Group(); F.name = 'rv_frame';
  F.position.set(-CAB.rvOffset[0], -CAB.rvOffset[1], -CAB.rvOffset[2]);
  g.add(F);
  const M = materials();
  const k = new Kit(700);
  const dk = new Decals(k);
  const U = (name, pad) => uvOf(name, pad);

  shell(k);
  dashboard(k, dk, U);

  // ── instrument binnacle: two chrome-ringed pods + info strip (lamps, PRNDL) ──
  const bin = [[2.94, 1.43], [2.99, 1.47], [3.2, 1.49], [3.21, 1.5], [3.145, 1.58], [3.064, 1.68], [3.05, 1.691], [3.037, 1.686], [2.95, 1.498]];
  inFrame(k, M4([CAB.hub[0], 0, 0]), () => k.extrude((cx, cy, cz, nx, ny) => (ny > 0.6 ? C.pad : C.bin), bin, 0.48, { axis: 'x', bevel: 0.012 }));
  const G0 = [3.037, 1.686], G1 = [2.95, 1.498];                   // gauge face edge [z, y] top → bottom
  const alpha = Math.atan2(G0[0] - G1[0], G0[1] - G1[1]);
  const gc = [CAB.hub[0], (G0[1] + G1[1]) / 2 + Math.sin(alpha) * 0.004, (G0[0] + G1[0]) / 2 - Math.cos(alpha) * 0.004];
  const gauges = new THREE.Object3D(); gauges.name = 'gauges';
  gauges.position.set(...gc); gauges.rotation.set(-alpha, Math.PI, 0, 'YXZ');   // +X Rook's right, +Y up the face, +Z toward Rook
  F.add(gauges);
  gauges.updateMatrix();
  const GM = gauges.matrix.clone();
  const POD = {
    speed: { x: -0.086, y: -0.012, r: 0.07, rect: 'speedo', a0: 2.36, a1: -2.36, major: 11 },
    rpm: { x: 0.086, y: -0.012, r: 0.064, rect: 'tach', a0: 2.1, a1: -2.1, major: 7, red: 5 / 6 },
  };
  const sub = (p, side) => ({ x: p.x + side * Math.sin(0.44) * 0.04, y: p.y - Math.cos(0.44) * 0.04, r: 0.0195 });
  const TEMP = sub(POD.rpm, 1), FUEL = sub(POD.speed, -1);
  const STRIP_Y = 0.084;
  const GEAR_C = { x: POD.rpm.x, y: POD.rpm.y, r: STRIP_Y - POD.rpm.y };
  inFrame(k, GM, () => {
    k.box(C.plate, [0.46, 0.2, 0.01], [0, 0, -0.006]);
    for (const p of [POD.speed, POD.rpm]) {
      const ro = p.r + 0.011;
      latheZ(k, [C.bin, C.chrome, '#101010'], p.x, p.y, [[ro, -0.001], [ro, 0.019], [p.r + 0.0012, 0.0155], [p.r + 0.0012, 0.0008]], 18);
      dk.disc([p.x, p.y, 0.0012], [1, 0, 0], [0, 1, 0], p.r + 0.0012, U(p.rect, 0), 24, C.face);
      for (let i = 0; i < p.major; i++) tick(k, C.tick, p.x, p.y, 0.0021, p.r * 0.74, p.r * 0.93, p.a0 + (p.a1 - p.a0) * (i / (p.major - 1)), 0.0032);
      if (p.red) for (let i = 0; i < 6; i++) {           // red line arc (5000–6000 rpm)
        const t0 = p.a0 + (p.a1 - p.a0) * (p.red + (1 - p.red) * (i / 6)), t1 = p.a0 + (p.a1 - p.a0) * (p.red + (1 - p.red) * ((i + 1) / 6));
        const P = (th, r) => [p.x - Math.sin(th) * r, p.y + Math.cos(th) * r, 0.0019];
        k.poly(C.red, [P(t0, p.r * 0.8), P(t1, p.r * 0.8), P(t1, p.r * 0.9), P(t0, p.r * 0.9)], { facing: [0, 0, 1] });
      }
    }
    for (const [s, rect] of [[TEMP, 'temp'], [FUEL, 'fuel']]) {
      ringXY(k, C.chromeD, s.x, s.y, 0.0026, s.r, s.r + 0.0026, 14);
      dk.disc([s.x, s.y, 0.0024], [1, 0, 0], [0, 1, 0], s.r, U(rect, 0), 16, C.face);
    }
    // static fuel needle (¾ tank) + its hub
    { const th = 0.85 - 1.7 * 0.75, dx = -Math.sin(th), dy = Math.cos(th);
      k.poly(C.needle, [[FUEL.x - dy * 0.0015, FUEL.y + dx * 0.0015, 0.0032], [FUEL.x + dy * 0.0015, FUEL.y - dx * 0.0015, 0.0032], [FUEL.x + dx * FUEL.r * 0.82, FUEL.y + dy * FUEL.r * 0.82, 0.0032]], { facing: [0, 0, 1] });
      discXY(k, '#2a2a2b', FUEL.x, FUEL.y, 0.0036, 0.0035, 6); }
    // info strip: lamp bezels (left), PRNDL arc (right), turn arrows, high beam
    k.box('#0c0c0c', [0.44, 0.024, 0.003], [0, STRIP_Y, -0.0005]);
    for (const x of [-0.128, -0.092, -0.056]) k.box('#3a3836', [0.034, 0.018, 0.004], [x, STRIP_Y, 0.0005]);
    const arc = (r, a) => [GEAR_C.x - Math.sin(a) * r, GEAR_C.y + Math.cos(a) * r];
    const [pu0, pv0, pu1, pv1] = U('prndl', 1);
    for (let i = 0; i < 4; i++) {
      const a0 = 0.3 - 0.6 * (i / 4), a1 = 0.3 - 0.6 * ((i + 1) / 4);
      const [x0, y0] = arc(GEAR_C.r - 0.0062, a0), [x1, y1] = arc(GEAR_C.r - 0.0062, a1), [x2, y2] = arc(GEAR_C.r + 0.0062, a1), [x3, y3] = arc(GEAR_C.r + 0.0062, a0);
      const ua = pu0 + (pu1 - pu0) * (i / 4), ub = pu0 + (pu1 - pu0) * ((i + 1) / 4);
      dk.poly([[x0, y0, 0.0016], [x1, y1, 0.0016], [x2, y2, 0.0016], [x3, y3, 0.0016]], [[ua, pv0], [ub, pv0], [ub, pv1], [ua, pv1]], '#2a2a2a', [0, 0, 1]);
    }
    k.front('#2f7a3a', 0.0012, [[-0.19, STRIP_Y], [-0.172, STRIP_Y + 0.007], [-0.172, STRIP_Y - 0.007]], 1, { off: 0 });       // ◄
    k.front('#2f7a3a', 0.0012, [[0.19, STRIP_Y], [0.172, STRIP_Y - 0.007], [0.172, STRIP_Y + 0.007]], 1, { off: 0 });         // ►
    k.front('#1f3f7a', 0.0012, [[0.14, STRIP_Y - 0.005], [0.156, STRIP_Y - 0.005], [0.156, STRIP_Y + 0.005], [0.14, STRIP_Y + 0.005]], 1, { off: 0 }); // high beam
    k.front('#7a2a22', 0.0012, [[-0.035, STRIP_Y - 0.005], [-0.015, STRIP_Y - 0.005], [-0.015, STRIP_Y + 0.005], [-0.035, STRIP_Y + 0.005]], 1, { off: 0 }); // brake (unlit)
  });
  // needles (unlit, animated)
  const needles = [['needle_speed', POD.speed, POD.speed.r * 0.9, 0.0045, 0.0085], ['needle_rpm', POD.rpm, POD.rpm.r * 0.9, 0.0045, 0.0085], ['needle_temp', TEMP, TEMP.r * 0.82, 0.003, 0.0045]];
  for (const [name, p, len, w, hub] of needles) {
    const nk = new Kit(701);
    nk.poly(C.needle, [[-w / 2, -len * 0.18, 0], [w / 2, -len * 0.18, 0], [w * 0.14, len, 0], [-w * 0.14, len, 0]], { facing: [0, 0, 1] });
    discXY(nk, '#2a2a2b', 0, 0, 0.0016, hub, 8);
    const pv = pivot(name, nk.mesh('m', M.needle, false), [p.x, p.y, 0.0058]);
    pv.rotation.z = GAUGES[name].min;
    gauges.add(pv);
  }
  // gear_pointer: red index under the PRNDL arc, pivoting about the tach centre (authored at P)
  {
    const pk = new Kit(702);
    const r0 = GEAR_C.r - 0.0105, r1 = GEAR_C.r - 0.0055;
    pk.poly('#ff3a22', [[-0.003, r0, 0], [0.003, r0, 0], [0, r1, 0]], { facing: [0, 0, 1] });
    pk.poly('#ff3a22', [[-0.0012, r1 - 0.0005, 0], [0.0012, r1 - 0.0005, 0], [0.0012, GEAR_C.r + 0.0058, 0], [-0.0012, GEAR_C.r + 0.0058, 0]], { facing: [0, 0, 1] });
    const pv = pivot('gear_pointer', pk.mesh('m', M.needle, false), [GEAR_C.x, GEAR_C.y, 0.0034]);
    pv.rotation.z = 2 * R3.gearStep;
    gauges.add(pv);
  }
  // warning lamps (own emissive materials)
  const LAMPS = [['lamp_check', -0.128, '#3a2a12', '#ffae2a'], ['lamp_oil', -0.092, '#3a1412', '#ff3a22'], ['lamp_heat', -0.056, '#3a1412', '#ff3a22']];
  for (const [name, x, off, on] of LAMPS) {
    gauges.add(lampMesh(name, M.lamp(name, off, on), new V3(x, STRIP_Y, 0.003), new V3(0.0155, 0, 0), new V3(0, 0.0078, 0), M.map ? U(name, 2) : [0, 0, 1, 1]));
  }

  // ── steering column (static): tilt head, shroud into the dash, shift bowl + column shifter (in D) ──
  const WM = M4(CAB.hub, [CAB.tilt, 0, 0]);        // wheel mount: local +Z = column axis (down/forward into the dash)
  inFrame(k, WM, () => {
    limb(k, (i, part, th) => (Math.sin(th) > 0.4 ? '#34322f' : C.blackP2), [0, 0, 0.056], [0, 0, 0.14], [0.06, 0.06], [0.057, 0.055], { seg: 12, rot: Math.PI / 12, capA: 0.004 });
    limb(k, '#2a2927', [0, 0, 0.14], [0, -0.004, 0.3], [0.05, 0.05], [0.046, 0.046], { seg: 10 });
    limb(k, '#1a1a1a', [0, -0.004, 0.13], [0, -0.006, 0.16], [0.064, 0.064], [0.064, 0.064], { seg: 12, capA: true });    // dash boot
    limb(k, C.chromeD, [0, 0, 0.074], [0, 0, 0.09], [0.0625, 0.0625], [0.0625, 0.0625], { seg: 12, rot: Math.PI / 12 });   // shift bowl ring
    // column shifter in D: socket on the bowl, chrome lever, black knob
    const lev = M4([0, 0, 0.082], [0, 0, R3.gearStep * 3 + 0.05]);
    inFrame(k, lev, () => {
      bar(k, C.blackP2, [-0.058, 0.012, 0], [-0.085, 0.022, -0.006], 0.024, 0.018, [0, 1, 0], 0.005);
      limb(k, C.chrome, [-0.08, 0.02, -0.005], [-0.215, 0.062, -0.042], [0.0062, 0.0055], [0.0052, 0.0048], { seg: 6 });
      limb(k, C.blackP, [-0.212, 0.061, -0.041], [-0.262, 0.074, -0.054], [0.0105, 0.0105], [0.0125, 0.012], { seg: 8, capB: 0.007 });
    });
    // ignition lock (right side of the head, ~2 o'clock on the column)
    const lk = M4([0, 0, R3.lockZ], [0, 0, R3.lockA]);
    inFrame(k, lk, () => {
      limb(k, C.chrome, [0, 0.058, 0], [0, 0.066, 0], [0.0105, 0.0105], [0.0105, 0.0105], { seg: 10, capB: true });
      k.box('#151515', [0.0024, 0.002, 0.009], [0, 0.0665, 0]);
    });
  });

  // ── R3-CAB2 trinkets: hula dancer on the dash (base baked into the body), mint freshener + fuzzy dice on the mirror ──
  addTrinkets(F, k, M);

  F.add(bake(k, dk, M.body, 'body', { whiteUV: WHITE_UV, cast: false }));

  // ── steering wheel `wheel` (+ horn_pad, hands) ─────────────────────────
  const wheelMount = new THREE.Object3D(); wheelMount.name = 'wheel_mount';
  wheelMount.position.set(...CAB.hub); wheelMount.rotation.set(CAB.tilt, 0, 0);
  F.add(wheelMount);
  const spokeR0 = 0.05, spokeR1 = R - 0.006;
  const spokeCW = (s) => R3.dish + (0.003 - R3.dish) * Math.min(1, Math.max(0, (s - spokeR0) / (spokeR1 - spokeR0)));
  const wk = new Kit(710); const wd = new Decals(wk);
  {
    const bump = (i, psi) => RT * (1 + (i % 2 ? 0.22 * Math.max(0, Math.sin(psi)) ** 2 : 0));
    torus(wk, (i, j, psi) => (Math.sin(psi) > 0.6 ? C.leatherD : i % 2 ? C.leather : C.leather2), R, RT, { N: 48, M: 6, phase: Math.PI / 6, radius: bump });
    // stitched seam on the inner (hub) side, facing Rook: follows the facets either side of the ψ = 210° ridge
    const N = 48, tp = (i, psi) => { const a = (i / N) * Math.PI * 2, rr = bump(i % N, psi), rad = R + Math.cos(psi) * rr; return new V3(Math.cos(a) * rad, Math.sin(a) * rad, Math.sin(psi) * rr); };
    const cen = (i) => { const a = (i / N) * Math.PI * 2; return new V3(Math.cos(a) * R, Math.sin(a) * R, 0); };
    const ps = (7 * Math.PI) / 6, pb = (3 * Math.PI) / 2;
    const [su0, sv0, su1, sv1] = uvOf('stitch', 1);
    for (let i = 0; i < N; i++) {
      const lift = (p, c) => p.clone().add(p.clone().sub(c).normalize().multiplyScalar(0.00035));
      const c0 = tp(i, ps), c1 = tp(i + 1, ps);
      const f0 = tp(i, pb), f1 = tp(i + 1, pb);
      const A = [c0.clone().lerp(f0, 0.12), c0.clone().lerp(f0, 0.42)].map((p) => lift(p, cen(i))), B = [c1.clone().lerp(f1, 0.12), c1.clone().lerp(f1, 0.42)].map((p) => lift(p, cen(i + 1)));
      wd.poly([A[0], A[1], B[1], B[0]], [[su0, sv1], [su0, sv0], [su1, sv0], [su1, sv1]], '#8a7a62', A[0].clone().add(A[1]).multiplyScalar(0.5).sub(cen(i)));
    }
    // 4 spokes: brushed-metal flats with black plastic covers toward the hub
    for (const a of [R3.spokeA, -R3.spokeA, R3.lowSpokeA, -R3.lowSpokeA]) {
      const dir = new V3(Math.sin(a), Math.cos(a), 0);
      const p0 = dir.clone().multiplyScalar(spokeR0).setZ(spokeCW(spokeR0)), p1 = dir.clone().multiplyScalar(spokeR1).setZ(spokeCW(spokeR1));
      const f = frameAB(p0, p1, [0, 0, -1]);
      const gb = new THREE.BoxGeometry(0.03, 0.0056, f.len);
      wk.geo(gb, (cx, cy, cz, nx, ny, nz) => (nz < -0.5 ? C.metal : C.metalD), f.m); gb.dispose();
      const pc = p0.clone().lerp(p1, 0.56);
      limb(wk, (i, part, th) => (Math.sin(th) > 0.5 ? C.coverL : C.cover), p0.clone().addScaledVector(dir, -0.006), pc, [0.0225, 0.0082], [0.0165, 0.0062], { seg: 8, up: [0, 0, -1], capB: 0.004 });
    }
    wk.cyl('#1b1b1c', 0.052, 0.056, 0.042, [0, 0, 0.056], { axis: 'z', seg: 12 });             // hub boss
  }
  const wheel = pivot('wheel', bake(wk, wd, M.smooth, 'wheel_mesh', { whiteUV: WHITE_UV, smooth: 62, cast: false }), [0, 0, 0]);
  wheel.children[0].name = 'wheel_mesh';
  wheelMount.add(wheel);

  // horn cushion with an embossed "C&R" medallion
  {
    const hk = new Kit(711); const hd = new Decals(hk);
    hk.box((cx, cy, cz, nx, ny, nz) => (nz < -0.6 ? C.pad1 : C.pad2), [0.128, 0.098, 0.04], [0, -0.006, 0.0125], { c: 0.0145, taper: [1.18, 1] });
    for (const y of [0.026, -0.036]) hk.box('#171513', [0.07, 0.0022, 0.002], [0, y, -0.0072]);
    limb(hk, (i, part) => (part === 'capB' ? '#9a988f' : C.chrome), [0, -0.004, -0.006], [0, -0.004, -0.0098], [0.031, 0.0186], [0.0298, 0.0176], { seg: 16, capB: true });
    const [bu0, bv0, bu1, bv1] = uvOf('badge', 1), pts = [], uvs = [];
    for (let i = 0; i < 18; i++) {
      const t = (i / 18) * Math.PI * 2, cx = Math.cos(t), cy = Math.sin(t);
      pts.push([-cx * 0.0296, -0.004 + cy * 0.0176, -0.01]);                 // −x: the pad faces −Z (Rook), so mirror u
      uvs.push([bu0 + (bu1 - bu0) * (0.5 + cx / 2), bv0 + (bv1 - bv0) * (0.5 + cy / 2)]);
    }
    hd.poly(pts, uvs, '#b3271d', [0, 0, -1]);
    wheel.add(pivot('horn_pad', bake(hk, hd, M.smooth, 'horn_pad_mesh', { whiteUV: WHITE_UV, smooth: 50, cast: false }), [0, 0, 0]));
  }

  // hands (children of the wheel)
  const hands = buildHands({
    R, rt: RT, phi: R3.handA, spokePhi: R3.spokeA, spokeW: (s) => spokeCW(s) - 0.0028, WM, hub: CAB.hub, variant,
    material: variant === 1 ? M.skin : M.glove,
  });
  wheel.add(pivot('hand_l', hands.left.mesh, hands.left.pos));
  wheel.add(pivot('hand_r', hands.right.mesh, hands.right.pos));

  // ── column stalks (rotate about the column axis direction at their roots) ──
  {
    const sk = new Kit(712);
    limb(sk, C.blackP, [0, 0, 0], [0.008, 0, 0], [0.011, 0.011], [0.009, 0.009], { seg: 8, up: [0, 1, 0] });
    limb(sk, C.blackP2, [0.004, 0, 0], [0.148, -0.01, -0.03], [0.0066, 0.006], [0.0052, 0.005], { seg: 6, up: [0, 1, 0] });
    limb(sk, C.chrome, [0.146, -0.01, -0.03], [0.156, -0.011, -0.032], [0.0068, 0.0068], [0.0068, 0.0068], { seg: 8 });
    limb(sk, C.blackP, [0.155, -0.011, -0.032], [0.176, -0.013, -0.036], [0.0068, 0.0068], [0.0062, 0.0062], { seg: 8, capB: 0.003 });
    wheelMount.add(pivot('stalk_signal', sk.mesh('m', M.body, false), [0.06, -0.006, 0.094]));
  }
  {
    const sk = new Kit(713);
    limb(sk, C.blackP, [0, 0, 0], [-0.008, 0, 0], [0.01, 0.01], [0.0085, 0.0085], { seg: 8, up: [0, 1, 0] });
    limb(sk, C.blackP2, [-0.004, 0, 0], [-0.118, -0.016, -0.026], [0.006, 0.0055], [0.005, 0.0046], { seg: 6, up: [0, 1, 0] });
    for (let i = 0; i < 3; i++) limb(sk, i % 2 ? '#3a3a3c' : C.blackP, [-0.118 - i * 0.012, -0.016 - i * 0.0017, -0.026 - i * 0.0026], [-0.13 - i * 0.012, -0.0177 - i * 0.0017, -0.0286 - i * 0.0026], [0.0072, 0.0072], [0.0072, 0.0072], { seg: 8, capB: i === 2 ? 0.003 : 0 });
    wheelMount.add(pivot('stalk_wiper', sk.mesh('m', M.body, false), [-0.058, -0.03, 0.1]));
  }

  // ── ignition key + key ring + "Co" fob (key_mount: local +Z = into the lock; ring and fob hang plumb in the RUN pose) ──
  {
    const keyMount = new THREE.Object3D(); keyMount.name = 'key_mount';
    const lockDir = new V3(-Math.sin(R3.lockA), Math.cos(R3.lockA), 0);
    const lockPos = lockDir.clone().multiplyScalar(0.066).setZ(R3.lockZ);
    const zA = lockDir.clone().negate(), yA = new V3(0, 0, 1), xA = new V3().crossVectors(yA, zA).normalize();
    keyMount.matrix.copy(basis(lockPos, xA, yA, zA)); keyMount.matrix.decompose(keyMount.position, keyMount.quaternion, keyMount.scale);
    wheelMount.add(keyMount);
    // world "down" and "toward Rook / the right-hand close-up" expressed in the key pivot frame at RUN
    const toKey = (v) => new V3(v.dot(xA), v.dot(yA), v.dot(zA)).applyAxisAngle(new V3(0, 0, 1), -R3.keyRun).normalize();
    const down = toKey(new V3(0, -Math.cos(CAB.tilt), Math.sin(CAB.tilt)));
    let face = toKey(new V3(-0.35, 0.2, -0.92)); face.addScaledVector(down, -face.dot(down)).normalize();
    const side = new V3().crossVectors(face, down.clone().negate()).normalize();
    const kk = new Kit(714); const kd = new Decals(kk);
    kk.box('#b9b7ad', [0.0028, 0.007, 0.016], [0, 0, -0.006]);                                     // blade stub + shoulder
    kk.box('#1e1e1f', [0.0058, 0.026, 0.024], [0, 0.0, -0.025], { c: 0.0026 });                   // key head (black)
    kk.box('#b9b7ad', [0.0062, 0.008, 0.006], [0, 0.0, -0.0385]);                                 // ring eyelet
    const eye = new V3(0, 0, -0.0405);
    inFrame(kk, basis(eye.clone().addScaledVector(down, 0.0105), face, down.clone().negate(), side), () => {
      kk.torus('#c8c6bc', 0.0105, 0.0011, [0, 0, 0], { rs: 3, ts: 10, rot: [0, Math.PI / 2, 0] });
      kk.box('#c9a54a', [0.002, 0.034, 0.009], [-0.002, -0.022, 0.006], { rot: [0, 0, 0.18] });   // brass house key
    });
    inFrame(kk, basis(eye.clone().addScaledVector(down, 0.0345), face, down.clone().negate(), side), () => {
      kk.box('#2a8a4c', [0.004, 0.026, 0.026], [0, 0, 0]);
      kk.box('#c8c6bc', [0.0045, 0.005, 0.003], [0, 0.0145, 0]);                                     // chain loop
      kd.rect([0.00215, 0, 0], [0, 0, -0.0122], [0, 0.0122, 0], uvOf('fob', 2), '#2e9d55', [1, 0, 0]);
    });
    keyMount.add(pivot('key', bake(kk, kd, M.body, 'key_mesh', { whiteUV: WHITE_UV, cast: false }), [0, 0, 0]));
    keyMount.getObjectByName('key').rotation.z = R3.keyRun;   // RUN (authored pose)
  }

  // ── wipers (as rv_cab_fp) ───────────────────────────────────────────────
  const up = new V3(0, 0.76, -0.6).normalize(), out = new V3(0, 0.6, 0.76).normalize();
  const tiltW = Math.atan2(up.z, up.y);
  for (const [name, x] of [['wiper_l', 0.3], ['wiper_r', -0.72]]) {
    const p = new V3(x, 1.38, 3.32).add(up.clone().multiplyScalar(0.06)).add(out.clone().multiplyScalar(0.045));
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
  for (const m of mirrorPlanes()) F.add(m);

  const eye = CAB.eye;
  g.userData.eye = eye.slice();
  g.userData.eyeModel = [eye[0] - CAB.rvOffset[0], eye[1] - CAB.rvOffset[1], +(eye[2] - CAB.rvOffset[2]).toFixed(3)];
  g.userData.eyePitch = CAB.eyePitch;
  g.userData.fov = CAB.fov;
  g.userData.rvOffset = CAB.rvOffset.slice();
  g.userData.gauges = GAUGES;
  g.userData.wheel = {
    axis: 'z', hub: CAB.hub, tilt: CAB.tilt, radius: R, grip: R3.handA,
    note: 'wheel.rotation.z > 0 turns RIGHT (clockwise as Rook sees it); suggested ±2.2 rad at full lock. Works with FirstPersonDriver\'s hand_*.rotation.z = −0.5·wheel. ' +
      'Better ("slide"): ride = clamp(w, ±0.45), slip = w − ride; hand_l.position = rim point at (grip + slip), hand_r at (−grip + slip), both rotation.z = −slip (rim point at angle a = [R·sin a, R·cos a, 0]).',
  };
  g.userData.wipers = { axis: 'z', parked: 0, sweep: 1.75 };
  g.userData.controls = {
    horn_pad: { prop: 'position.z', rest: 0, pressed: 0.005 },
    stalk_signal: { prop: 'rotation.z', off: 0, right: 0.2, left: -0.2 },
    stalk_wiper: { prop: 'rotation.z', off: 0, on: 0.18 },
    key: { prop: 'rotation.z', off: 0, run: R3.keyRun, start: 1.05, note: 'ring + fob hang plumb at run' },
    gear_pointer: { prop: 'rotation.z', P: 2 * R3.gearStep, R: R3.gearStep, N: 0, D: -R3.gearStep, L: -2 * R3.gearStep },
    lamps: { names: ['lamp_check', 'lamp_oil', 'lamp_heat'], prop: 'material.emissiveIntensity', off: 0, on: 1.3, note: 'cloneInstanceMaterials(cab) first' },
    trinkets: { driver: 'render/fp/trinkets.js (new Trinkets(cab).update(dt, { speed, latAcc, bump }))', pivots: ['hula', 'hula_spring', 'hula_hips', 'hula_arms', 'freshener', 'dice'] },
  };
  // spring / pendulum data for render/fp/trinkets.js (all pivots rest at identity rotation except hula.rotation.y = facing)
  const S = TRINKETS.hula.scale;
  g.userData.trinkets = {
    hula: { anchor: 'hula', spring: 'hula_spring', hips: 'hula_hips', arms: 'hula_arms', height: +(0.085 * S).toFixed(3), axes: 'rotation.x > 0 leans forward (+Z), rotation.z > 0 leans to Rook\'s right (−X); order XZY' },
    freshener: { pivot: 'freshener', length: +(TRINKETS.freshener.string + TRINKETS.freshener.h * 0.45).toFixed(3), axes: 'pendulum: rotation.x > 0 swings toward Rook (−Z), rotation.z > 0 toward +X; rotation.y twists about the string; order XZY' },
    dice: { pivot: 'dice', length: +(TRINKETS.dice.knot + 0.045).toFixed(3), axes: 'as freshener' },
  };
  g.userData.perInstanceMaterials = ['mirror_l_glass', 'mirror_r_glass', 'mirror_c_glass', 'lamp_check', 'lamp_oil', 'lamp_heat'];
  g.userData.viewBox = { min: [-1.5, -0.1 + 0.5, -0.65], max: [1.5, 2.2, 0.65] };
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// static shell: floor, doghouse, pedals, pillars, headliner, doors, seats, mirror housings, visor + map
function shell(k) {
  k.box(C.floor, [2.2, 0.04, 1.42], [0, FY - 0.02, 2.62]);
  k.box('#3d3a36', [0.52, 0.4, 0.8], [0, FY, 2.95], { base: true });
  k.box('#2c2a28', [0.4, 0.012, 0.5], [0, FY + 0.4, 2.85], { noBottom: true });
  for (const [x, w] of [[0.66, 0.07], [0.46, 0.14]]) k.box('#1f2022', [w, 0.13, 0.025], [x, FY + 0.16, 3.05], { rot: [-0.5, 0, 0] });
  k.box('#262624', [2.16, 0.3, 0.02], [0, FY + 0.14, 3.31]);                                            // toe board / firewall under the dash

  // windshield frame: A-pillars, header, cowl
  for (const s of [1, -1]) {
    beam(k, C.trim, [s * 1.1, 1.38, 3.31], [s * 1.08, 2.13, 2.73], 0.1, 0.09);
    beam(k, C.trim, [s * 1.12, 1.42, 3.22], [s * 1.12, 2.06, 2.76], 0.04, 0.05);
  }
  k.box(C.trim, [2.2, 0.075, 0.1], [0, 2.115, 2.755]);
  k.box(C.pad, [2.12, 0.025, 0.06], [0, 1.395, 3.3], { rot: [-0.9, 0, 0] });
  // headliner, roof rails, B-pillars, partition
  k.box(C.head, [2.22, 0.03, 0.9], [0, 2.135, 2.27]);
  for (const z of [2.55, 2.1]) k.box(shade(C.head, 0.9), [2.1, 0.008, 0.02], [0, 2.118, z]);
  for (const s of [1, -1]) {
    k.box(C.trimL, [0.08, 0.075, 0.86], [s * 1.1, 2.095, 2.33]);
    k.box(C.trimL, [0.09, 0.72, 0.09], [s * 1.1, 1.78, 1.94]);
  }
  k.box(C.trimL, [2.1, 1.0, 0.06], [0, FY + 0.5, 2.0]);
  // door panels
  for (const s of [1, -1]) {
    const x = s * 1.085, xi = s * 1.05;
    k.box((cx, cy) => (cy < 0.86 ? C.doorLow : C.door), [0.07, 0.93, 1.3], [x, 0.5, 2.6], { base: true });
    k.box(C.doorD, [0.08, 0.05, 1.3], [x, 1.44, 2.6]);
    k.box(PAL.rvBody, [0.03, 0.025, 1.24], [s * 1.12, 1.47, 2.6]);
    k.box(C.arm, [0.1, 0.07, 0.6], [xi - s * 0.02, 1.13, 2.45]);
    k.box(C.doorD, [0.03, 0.12, 0.2], [xi, 1.24, 2.95]);
    k.box(C.chrome, [0.03, 0.03, 0.12], [xi, 1.3, 3.05]);
    k.cyl('#5a5650', 0.03, 0.03, 0.03, [xi, 1.2, 2.2], { axis: 'x', seg: 6 });
    beam(k, C.chrome, [xi - s * 0.02, 1.2, 2.2], [xi - s * 0.02, 1.14, 2.31], 0.014);
    k.box('#1d1d1e', [0.04, 0.03, 0.05], [xi - s * 0.03, 1.14, 2.32]);
    k.box(C.doorLow, [0.06, 0.18, 0.7], [xi, 0.72, 2.55]);
    k.cyl('#252423', 0.07, 0.07, 0.02, [xi, 0.98, 3.05], { axis: 'x', seg: 8 });
    k.cyl('#c8c4b8', 0.012, 0.012, 0.05, [s * 1.07, 1.48, 1.98], { seg: 6 });
    k.box(C.trim, [0.06, 0.06, 0.2], [s * 1.09, 0.62, 3.2]);
  }
  // seats: the passenger seat in full; Rook's own seat is behind/under the camera (cushion front only)
  k.box(C.seat, [0.52, 0.1, 0.3], [0.55, FY + 0.45, 2.67]);
  { const x = -0.55;
    k.box('#4a4540', [0.5, 0.4, 0.5], [x, FY + 0.2, 2.55]);
    k.box(C.seat, [0.52, 0.1, 0.52], [x, FY + 0.45, 2.56]);
    k.box(C.seat, [0.52, 0.7, 0.12], [x, FY + 0.82, 2.3], { rot: [-0.12, 0, 0] });
    k.box(C.seat2, [0.36, 0.18, 0.1], [x, FY + 1.27, 2.27], { rot: [-0.12, 0, 0] });
    k.box(C.stripe, [0.12, 0.5, 0.01], [x + 0.12, FY + 0.82, 2.37], { rot: [-0.12, 0, 0] }); }
  // side mirror housings + arms, centre mirror body
  for (const [s, yaw] of [[1, 0.3], [-1, -0.48]]) {
    inFrame(k, M4([s * 1.37, 1.6, 3.2], [0, yaw, 0]), () => {
      k.box('#1f2022', [0.2, 0.39, 0.24], [0, 0, 0], { c: 0.03 });
      k.box('#2c2d30', [0.19, 0.37, 0.01], [0, 0, -0.118]);
    });
    beam(k, '#2c2d30', [s * 1.15, 1.47, 3.06], [s * 1.28, 1.5, 3.17], 0.03);
    beam(k, '#2c2d30', [s * 1.15, 1.74, 3.0], [s * 1.28, 1.72, 3.17], 0.03);
  }
  inFrame(k, M4([0.22, 2.02, 2.8], [0, -0.42, 0]), () => k.box('#2a2a2b', [0.3, 0.095, 0.035], [0, 0, 0], { c: 0.012 }));
  beam(k, '#2a2a2b', [0.22, 2.1, 2.77], [0.22, 2.05, 2.8], 0.02);
  // (the mint pine freshener + fuzzy dice now hang from this mirror as animated pivots: r3-cab-trinkets.js)
  // passenger visor stowed
  k.box('#bfb39a', [0.46, 0.022, 0.16], [-0.56, 2.105, 2.66], { c: 0.008 });
}

function mirrorPlanes() {
  const out = [];
  for (const [name, s, yaw] of [['mirror_l_glass', 1, 0.3], ['mirror_r_glass', -1, -0.48]]) {
    const c = [s * 1.37, 1.6, 3.2];
    const off = new V3(0, 0, -0.125).applyAxisAngle(new V3(0, 1, 0), yaw);
    out.push(mirrorGlass(name, 0.17, 0.33, [c[0] + off.x, c[1], c[2] + off.z], yaw));
  }
  const cm = [0.22, 2.02, 2.8], cyaw = -0.42;
  const off = new V3(0, 0, -0.02).applyAxisAngle(new V3(0, 1, 0), cyaw);
  out.push(mirrorGlass('mirror_c_glass', 0.27, 0.075, [cm[0] + off.x, cm[1], cm[2] + off.z], cyaw));
  return out;
}

// ═════════════════════════════════════════════════════════════════════════════
// dashboard: profile, defrost grilles, vents, HVAC, AM/FM radio, glovebox, CB under the dash,
// visor + folded map, dash life (r3-cab-trinkets.js dashLife)
function dashboard(k, dk, U) {
  const dashTop = (cx, cy, cz, nx, ny) => (ny > 0.55 ? C.pad : cy < 1.2 ? C.dash : C.dashL);
  k.extrude(dashTop, [[2.94, 1.0], [3.31, 1.0], [3.33, 1.4], [3.14, 1.5], [2.99, 1.485], [2.93, 1.41]], 2.18, { axis: 'x', bevel: 0.02 });
  const dz = 2.925;
  const fr = (c, x0, x1, y0, y1, off = 0.003) => k.front(c, dz, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], -1, { off });

  // defroster grilles on the dash-top slope by the glass (visible from the eye)
  {
    const n = new V3(0, 0.885, 0.466), d = new V3(0, -0.466, 0.885);   // slope normal / down-slope direction
    const base = (x, t) => new V3(x, 1.5 - 0.1 * t, 3.14 + 0.19 * t).addScaledVector(n, 0.002);
    for (const [x0, x1] of [[0.18, 0.98], [-0.98, -0.18]]) {
      quad(k, '#1b1918', base(x0, 0.32), base(x1, 0.32), base(x1, 0.58), base(x0, 0.58), n);
      for (let i = 0; i < 6; i++) {
        const t = 0.36 + i * 0.037;
        quad(k, '#3d3631', base(x0 + 0.01, t).addScaledVector(n, 0.001), base(x1 - 0.01, t).addScaledVector(n, 0.001), base(x1 - 0.01, t + 0.012).addScaledVector(n, 0.001), base(x0 + 0.01, t + 0.012).addScaledVector(n, 0.001), n);
      }
    }
  }
  // round eyeball vents at both ends
  for (const x of [0.93, -0.93]) {
    k.cyl('#2a2724', 0.044, 0.046, 0.014, [x, 1.33, dz - 0.004], { axis: 'z', seg: 10 });
    k.cyl('#1a1918', 0.033, 0.033, 0.016, [x + 0.004, 1.334, dz - 0.012], { axis: 'z', seg: 8, rot: [0.15, 0.2, 0], open: true });
    for (const dy of [-0.011, 0.011]) k.box('#3a3633', [0.05, 0.003, 0.004], [x + 0.004, 1.334 + dy, dz - 0.021]);
  }
  // centre louvred vents
  for (const [x0, x1] of [[0.06, 0.25], [-0.19, 0.0]]) {
    fr('#151413', x0, x1, 1.34, 1.392);
    for (let i = 0; i < 4; i++) { const y = 1.348 + i * 0.012; quad(k, '#38332e', [x0 + 0.005, y - 0.004, dz - 0.012], [x1 - 0.005, y - 0.004, dz - 0.012], [x1 - 0.005, y + 0.003, dz - 0.004], [x0 + 0.005, y + 0.003, dz - 0.004], [0, 0.6, -0.8]); }
  }
  // HVAC slider panel
  k.box('#232326', [0.2, 0.068, 0.01], [0.155, 1.29, dz - 0.004]);
  dk.rect([0.155, 1.29, dz - 0.0095], [-0.094, 0, 0], [0, 0.031, 0], U('hvac', 1), '#2c2c30', [0, 0, -1]);
  for (const [x, y] of [[0.17, 1.307], [0.115, 1.283], [0.205, 1.259]]) k.box(C.chrome, [0.008, 0.012, 0.012], [x, y - 0.003, dz - 0.012]);
  k.front('#c4372b', dz, [[0.272, 1.272], [0.292, 1.272], [0.282, 1.29]], -1, { off: 0.005 });                 // hazard switch
  // AM/FM radio
  {
    const x = -0.06, y = 1.19;
    k.box('#1b1b1c', [0.25, 0.1, 0.014], [x, y, dz - 0.005]);
    k.box(C.chrome, [0.25, 0.006, 0.016], [x, y + 0.047, dz - 0.006]);
    dk.rect([x, y + 0.022, dz - 0.0125], [-0.066, 0, 0], [0, 0.0135, 0], U('radio', 1), '#2c2414', [0, 0, -1]);
    for (const kx of [x - 0.105, x + 0.105]) {
      k.cyl(C.chrome, 0.0125, 0.0135, 0.022, [kx, y + 0.012, dz - 0.023], { axis: 'z', seg: 8 });
    }
    for (let i = 0; i < 5; i++) k.box(i === 2 ? '#e8e2cf' : C.chrome, [0.019, 0.011, 0.012], [x - 0.052 + i * 0.026, y - 0.016, dz - 0.016]);
    fr('#070707', x - 0.05, x + 0.05, y - 0.04, y - 0.031, 0.013);                                               // cassette slot
  }
  // glovebox (passenger) with a chrome push latch
  fr(shade(C.dashL, 1.08), -0.86, -0.32, 1.08, 1.3);
  fr(shade(C.dashL, 0.85), -0.86, -0.32, 1.296, 1.302, 0.004);
  fr(C.chrome, -0.62, -0.54, 1.255, 1.272, 0.006);
  fr('#2a2622', -0.6, -0.56, 1.259, 1.268, 0.008);

  // ── CB radio under the dash, right of the column, mic on a hook, coiled cord ──
  {
    const cx = 0.375, cy = 0.958, cz = 2.95;
    for (const s of [1, -1]) k.box('#3a3b3d', [0.006, 0.07, 0.06], [cx + s * 0.092, cy + 0.025, cz + 0.02]);             // U-bracket
    k.box('#3a3b3d', [0.19, 0.006, 0.06], [cx, 0.997, cz + 0.02]);
    k.box('#28292b', [0.17, 0.052, 0.16], [cx, cy, cz + 0.02]);
    k.box('#1d1e20', [0.172, 0.056, 0.006], [cx, cy, cz - 0.061]);
    dk.rect([cx, cy, cz - 0.0645], [-0.079, 0, 0], [0, 0.0255, 0], U('cb', 1), '#2b2c2e', [0, 0, -1]);
    for (const u of [0.73, 0.83, 0.93]) k.cyl('#111111', 0.0072, 0.0072, 0.01, [cx + 0.079 - u * 0.158, cy - 0.006, cz - 0.069], { axis: 'z', seg: 8 });
    // mic hook on the bracket's right end + the hand mic hanging from it
    k.box('#3a3b3d', [0.012, 0.02, 0.026], [cx - 0.104, cy + 0.03, cz - 0.04]);
    const micC = new V3(cx - 0.11, 0.9, cz - 0.06);
    inFrame(k, M4(micC, [0.12, 0.2, 0.08]), () => {
      k.box('#1d1e20', [0.042, 0.082, 0.03], [0, 0, 0], { c: 0.01 });
      k.box('#3a3b3d', [0.03, 0.03, 0.004], [0, 0.012, -0.016]);                                                     // grille
      k.box('#5a5b5e', [0.008, 0.022, 0.008], [0.023, 0.0, -0.002]);                                                 // PTT key
    });
    // coiled cord: a helix along a sagging path from the mic bottom to the CB's front right corner
    const A = micC.clone().add(new V3(0.004, -0.044, 0.004)), B = new V3(cx - 0.05, 0.84, cz - 0.07), Cc = new V3(cx - 0.06, cy - 0.022, cz - 0.06);
    const path = (t) => A.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(B, 2 * t * (1 - t)).addScaledVector(Cc, t * t);
    const pts = [], turns = 9, per = 5;
    for (let i = 0; i <= turns * per; i++) {
      const t = i / (turns * per), p = path(t), d = path(Math.min(1, t + 0.01)).sub(path(Math.max(0, t - 0.01))).normalize();
      const s1 = new V3(1, 0, 0).addScaledVector(d, -d.x).normalize(), s2 = new V3().crossVectors(d, s1);
      const a = (i / per) * Math.PI * 2;
      pts.push(p.addScaledVector(s1, Math.cos(a) * 0.0065).addScaledVector(s2, Math.sin(a) * 0.0065).toArray());
    }
    for (let i = 0; i < pts.length - 1; i++) {                       // ribbon coil: each turn faces out of the helix
      const a = V(pts[i]), b = V(pts[i + 1]), t = (i + 0.5) / (pts.length - 1), d = path(Math.min(1, t + 0.01)).sub(path(Math.max(0, t - 0.01))).normalize();
      const o = a.clone().add(b).multiplyScalar(0.5).sub(path(t));
      quad(k, '#141414', a.clone().addScaledVector(d, -0.0018), b.clone().addScaledVector(d, -0.0018), b.clone().addScaledVector(d, 0.0018), a.clone().addScaledVector(d, 0.0018), o);
    }
  }

  // ── driver's sun visor (lowered) with a folded road map tucked under its strap ──
  inFrame(k, M4([0.68, 2.098, 2.785], [0.72, 0, 0]), () => {   // hangs down local −Y; Rook's side = local −Z
    k.box('#bfb39a', [0.36, 0.092, 0.022], [0, -0.046, 0], { c: 0.008 });
    k.box('#8d8a82', [0.03, 0.02, 0.03], [-0.16, 0.0, 0.0]);
    // the map: three accordion panels sticking out below and left of the visor
    const [mu0, mv0, mu1, mv1] = U('map', 1);
    const xs = [0.165, 0.098, 0.031, -0.036], zs = [-0.0135, -0.0215, -0.0135, -0.0205];
    for (let i = 0; i < 3; i++) {
      const y0 = -0.112, y1 = -0.012;
      const a = [xs[i], y0, zs[i]], b = [xs[i + 1], y0, zs[i + 1]], c = [xs[i + 1], y1, zs[i + 1]], d = [xs[i], y1, zs[i]];
      const ua = mu0 + (mu1 - mu0) * (i / 3), ub = mu0 + (mu1 - mu0) * ((i + 1) / 3);
      dk.poly([a, b, c, d], [[ua, mv0], [ub, mv0], [ub, mv1], [ua, mv1]], '#e2d6b4', [0, 0, -1]);
      quad(k, '#cfc3a2', a, b, c, d, [0, 0, 1]);                                            // paper back
    }
    k.box('#4a4238', [0.37, 0.011, 0.004], [0, -0.06, -0.0245]);                               // elastic strap over the map
    visorSlips(k, dk);                                                                          // toll ticket + parking stub
  });

  // ── dash life: caddy with the coffee + phone clip, sunglasses, gum, receipt, toll slips, cassettes, polaroid ──
  dashLife(k, dk);
}
