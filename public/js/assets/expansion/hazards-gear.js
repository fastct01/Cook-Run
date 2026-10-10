// ─────────────────────────────────────────────────────────────────────────────
// Hazards pack — roof-defence & stop gear for Doc on the RV roof (art agent "hazards").
// Each model's origin is its own base centre. Roof-mounted pieces carry
// userData.rvMount = { pos: [x, y, z] } in RV-local metres (buildRV roof top y = 3.11),
// so `rv.add(m); m.position.set(...m.userData.rvMount.pos)` seats them on the roof.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Kit, root, rng } from '../models/kit.js';
import { PAL, mix, shade, glossy } from '../palette.js';
import { pivot, rod, beam } from './hazards-util.js';

const NOFLOOR = { floor: -0.045 };

// ═════════════════════════════════════════════════════════════════════════════
// 17. roof_hatch — the lab roof hatch Doc climbs through. Lid hinged on its FRONT edge (+Z):
//     lid.rotation.x = 0 closed … 1.6 open (stands up as a windbreak). Authored half-open (0.9).
// ═════════════════════════════════════════════════════════════════════════════
export function buildRoofHatch(variant = 0) {
  const g = root('roof_hatch', variant, { w: 0.76, h: 0.66, l: 0.76 });
  const k = new Kit(500); k.floor = 0;
  const body = shade(PAL.rvBody, 0.9);
  const S = 0.68, I = 0.52, Hc = 0.1, t = (S - I) / 2;
  k.rectY('#d9d1bd', 0.003, [-0.38, 0.38], [-0.38, 0.38], { off: 0 });                 // roof skin patch
  k.rectY('#8f8878', 0.005, [-S / 2 - 0.025, S / 2 + 0.025], [-S / 2 - 0.025, S / 2 + 0.025], { off: 0 });   // sealant bead
  k.box(body, [S, Hc, t], [0, 0, (S - t) / 2], { base: true, noBottom: true });
  k.box(body, [S, Hc, t], [0, 0, -(S - t) / 2], { base: true, noBottom: true });
  k.box(shade(body, 0.95), [t, Hc, I], [(S - t) / 2, 0, 0], { base: true, noBottom: true });
  k.box(shade(body, 0.95), [t, Hc, I], [-(S - t) / 2, 0, 0], { base: true, noBottom: true });
  k.rectY('#e8e1cf', Hc + 0.001, [-S / 2 + 0.01, S / 2 - 0.01], [S / 2 - 0.03, S / 2 - 0.01], { off: 0.002 });   // gasket line
  // dark shaft (inward walls) + ladder tops + soot streak (it's the lab)
  k.rectY('#121110', -0.044, [-I / 2, I / 2], [-I / 2, I / 2], { off: 0, ...NOFLOOR });
  k.rectZ('#2a2724', -I / 2, [-I / 2, I / 2], [-0.044, Hc], 1, { off: 0.001, ...NOFLOOR });
  k.rectZ('#33302c', I / 2, [-I / 2, I / 2], [-0.044, Hc], -1, { off: 0.001, ...NOFLOOR });
  k.rectX('#2e2b28', -I / 2, [-I / 2, I / 2], [-0.044, Hc], 1, { off: 0.001, ...NOFLOOR });
  k.rectX('#2e2b28', I / 2, [-I / 2, I / 2], [-0.044, Hc], -1, { off: 0.001, ...NOFLOOR });
  for (const s of [1, -1]) {
    beam(k, PAL.metal, [s * 0.16, -0.04, -0.2], [s * 0.16, Hc + 0.14, -0.2], 0.025);
    beam(k, PAL.metal, [s * 0.16, Hc + 0.14, -0.2], [s * 0.16, Hc + 0.14, -0.08], 0.025);
  }
  k.box('#8b8578', [0.36, 0.006, 0.12], [-0.05, Hc + 0.004, -(S - t) / 2], { noBottom: true });
  g.add(k.mesh('body'));
  // lid: smoked off-white dome with ribs, dark underside, hinge barrel at the pivot
  const lk = new Kit(501);
  const L = S - 0.02;
  lk.box((cx, cy, cz, nx, ny) => (ny < -0.5 ? '#4b4740' : '#d8d2c2'), [L, 0.035, L], [0, 0.0175, -L / 2], { c: 0.01 });
  lk.box('#c9c2b0', [0.46, 0.04, 0.46], [0, 0.05, -L / 2], { c: 0.015, taper: [0.82, 0.82] });
  for (const x of [-0.12, 0, 0.12]) lk.box('#bdb6a4', [0.03, 0.012, 0.4], [x, 0.074, -L / 2]);
  lk.cyl('#8a857b', 0.018, 0.018, L - 0.06, [0, 0.0, 0.0], { axis: 'x', seg: 6 });
  lk.box('#5f6468', [0.02, 0.02, 0.22], [0.2, -0.01, -0.12], { rot: [0.5, 0, 0] });                 // stay arm
  g.add(pivot('lid', lk.mesh('m'), [0, Hc + 0.004, S / 2 - 0.01], [0.9, 0, 0]));
  g.userData.rvMount = { pos: [0.15, 3.11, -1.1], note: 'RV-local; sits over buildRV\'s lab-roof vent (0.55 m box at 0.15, roofY, −1.1).' };
  g.userData.lid = { axis: 'x', closed: 0, open: 1.6 };
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// 18. water_hose — hose reel (drum `reel` spins on rotation.x) + brass nozzle `nozzle` (spray along local +Z)
// ═════════════════════════════════════════════════════════════════════════════
export function buildWaterHose(variant = 0) {
  const g = root('water_hose', variant, { w: 0.72, h: 0.78, l: 0.62 });
  const k = new Kit(510); k.floor = 0;
  const frame = '#4f8f8a', frameD = '#3b6f6b';        // RV teal so it reads as "our" gear
  const AY = 0.44;
  k.box('#5d5f61', [0.66, 0.03, 0.5], [0, 0, 0], { base: true, noBottom: true });
  for (const s of [1, -1]) {
    beam(k, frame, [s * 0.31, 0.03, -0.2], [s * 0.31, AY, 0], 0.04);
    beam(k, frame, [s * 0.31, 0.03, 0.2], [s * 0.31, AY, 0], 0.04);
    k.box(frameD, [0.05, 0.06, 0.08], [s * 0.31, AY, 0]);
  }
  beam(k, frameD, [-0.31, 0.12, 0.16], [0.31, 0.12, 0.16], 0.03);
  k.cyl('#8a8d90', 0.022, 0.022, 0.68, [0, AY, 0], { axis: 'x', seg: 6 });
  // nozzle holster hook on the front of the +X frame
  k.box('#2a2a2b', [0.05, 0.08, 0.05], [0.31, 0.52, 0.12]);
  g.add(k.mesh('body'));
  // reel drum with coiled green hose
  const rk = new Kit(511);
  const hose = '#3f7a3f', hoseD = '#2f5f30';
  rk.cyl(hose, 0.235, 0.235, 0.46, [0, 0, 0], { axis: 'x', seg: 12, open: true });
  for (const x of [-0.1, 0.1]) rk.cyl(hoseD, 0.238, 0.238, 0.018, [x, 0, 0], { axis: 'x', seg: 12, open: true });
  for (const s of [1, -1]) {
    rk.cyl('#c9c3b2', 0.3, 0.3, 0.02, [s * 0.24, 0, 0], { axis: 'x', seg: 10 });
    rk.cyl('#8a8d90', 0.06, 0.06, 0.03, [s * 0.255, 0, 0], { axis: 'x', seg: 6 });
  }
  rk.box('#c9c3b2', [0.03, 0.2, 0.03], [0.27, 0.12, 0.12], { rot: [0.6, 0, 0] });                     // crank
  rk.cyl('#2a2a2b', 0.02, 0.02, 0.08, [0.3, 0.2, 0.17], { axis: 'x', seg: 5 });
  g.add(pivot('reel', rk.mesh('m'), [0, AY, 0]));
  // nozzle: brass pistol nozzle resting in the holster, spray direction = local +Z
  const nk = new Kit(512);
  const brass = '#c9a24a', brassD = '#9c7a32';
  nk.lathe(brass, [[0.026, -0.04], [0.03, 0.0], [0.03, 0.05], [0.024, 0.12], [0.018, 0.19], [0.024, 0.205], [0.016, 0.215]], 6, [0, 0, 0], { axis: 'z' });
  nk.cyl(brassD, 0.034, 0.034, 0.03, [0, 0, -0.03], { axis: 'z', seg: 8 });
  nk.box('#2a2a2b', [0.04, 0.13, 0.05], [0, -0.07, 0.0], { rot: [-0.35, 0, 0], c: 0.01 });             // grip
  nk.box(brassD, [0.012, 0.07, 0.02], [0, -0.05, 0.05], { rot: [0.35, 0, 0] });                        // trigger
  const nz = pivot('nozzle', nk.mesh('m'), [0.34, 0.56, 0.14], [0.35, 0.25, 0]);
  const tip = new THREE.Object3D(); tip.name = 'nozzle_tip'; tip.position.set(0, 0, 0.215); nz.add(tip);
  g.add(nz);
  // hose run from the drum to the nozzle's coupling (static mesh: re-draw it as a rope if the nozzle moves)
  const hk = new Kit(513);
  rod(hk, hose, [[0.0, AY - 0.235, 0.05], [0.04, 0.08, 0.2], [0.14, 0.05, 0.3], [0.3, 0.1, 0.32], [0.36, 0.3, 0.24], [0.35, 0.5, 0.15], [0.34, 0.55, 0.12]], 0.022, 4);
  g.add(hk.mesh('hose_run'));
  g.userData.rvMount = { pos: [0.75, 3.11, -1.9], note: 'RV-local, roof behind the lab hatch on the +X side.' };
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// 19. firecracker_string — generic red firecracker string lying on the ground; `fuse` = light point
// ═════════════════════════════════════════════════════════════════════════════
export function buildFirecrackerString(variant = 0) {
  const g = root('firecracker_string', variant, { w: 1.3, h: 0.05, l: 0.42 });
  const k = new Kit(520); k.floor = 0;
  const N = 14, X0 = -0.55, X1 = 0.5;
  const P = (t) => [X0 + (X1 - X0) * t, 0.024, 0.09 * Math.sin(t * Math.PI * 2 * 0.85)];
  const braid = Array.from({ length: 9 }, (_, i) => P(i / 8));
  rod(k, '#5a2a22', braid, 0.012, 3);
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N, p = P(t), q = P(Math.min(1, t + 0.01));
    const ang = Math.atan2(q[2] - p[2], q[0] - p[0]);
    const side = i % 2 ? 1 : -1;
    const a = ang + side * 1.05;
    const L = 0.12, cx = p[0] + Math.cos(a) * L * 0.55, cz = p[2] + Math.sin(a) * L * 0.55;
    // cylinder axis along local Y → lay it down along direction a
    k.at([cx, 0.023, cz], [0, -a, Math.PI / 2], () => {
      k.cyl(i % 4 === 1 ? '#c43a2e' : '#b0302a', 0.022, 0.022, L, [0, 0, 0], { seg: 5 });
      k.cyl('#d9b13a', 0.0235, 0.0235, 0.022, [0, 0.02, 0], { seg: 5, open: true });
    });
  }
  // paper header at the top end + fuse tail
  k.box('#c43a2e', [0.08, 0.04, 0.06], [X1 + 0.05, 0.02, P(1)[2]], { noBottom: true });
  k.box('#d9b13a', [0.082, 0.012, 0.062], [X1 + 0.05, 0.03, P(1)[2]], { noBottom: true });
  const fz = P(1)[2];
  rod(k, '#3a3228', [[X1 + 0.09, 0.02, fz], [X1 + 0.16, 0.015, fz + 0.05], [X1 + 0.22, 0.012, fz + 0.03]], 0.006, 3);
  g.add(k.mesh('body'));
  const fk = new Kit(521);
  fk.box('#2a2622', [0.02, 0.012, 0.012], [0, 0, 0]);
  fk.geo(new THREE.OctahedronGeometry(0.012), '#ff8a3a', new THREE.Matrix4().makeTranslation(0.012, 0.004, 0));
  g.add(pivot('fuse', fk.mesh('m'), [X1 + 0.22, 0.012, fz + 0.03]));
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// 20. paint_balloon — glossy latex balloon, 4 colours; `balloon` pivot at its centre (wobble / throw)
// ═════════════════════════════════════════════════════════════════════════════
const BALLOON = ['#c94f6d', '#3e9e9a', '#d9b13a', '#7b62a8'];
export function buildPaintBalloon(variant = 0) {
  const g = root('paint_balloon', variant, { w: 0.31, h: 0.34, l: 0.31 });
  const c = BALLOON[variant % 4];
  const k = new Kit(530 + variant);
  const CY = 0.15;
  const prof = [[0.0, 0.0], [0.07, 0.006], [0.12, 0.035], [0.148, 0.08], [0.153, 0.13], [0.142, 0.18], [0.112, 0.226], [0.072, 0.258], [0.032, 0.276], [0.012, 0.283]];
  k.lathe((cx, cy) => (cy < 0.05 ? shade(c, 0.78) : cy > 0.2 ? mix(c, '#ffffff', 0.12) : c), prof.map(([r, y]) => [r, y - CY]), 10, [0, 0, 0]);
  k.lathe(shade(c, 0.82), [[0.012, 0.281], [0.022, 0.296], [0.009, 0.31], [0.026, 0.326], [0.0, 0.332]].map(([r, y]) => [r, y - CY]), 6, [0, 0, 0]);
  k.poly(mix(c, '#ffffff', 0.55), [[-0.05, 0.19 - CY, 0.115], [0.0, 0.205 - CY, 0.108], [0.02, 0.15 - CY, 0.146], [-0.03, 0.135 - CY, 0.148]], { facing: [0, 0.4, 1], off: 0.006 });
  g.add(pivot('balloon', k.mesh('m', glossy()), [0, CY, 0]));
  g.userData.paint = c;
  g.userData.style = ['magenta', 'teal', 'yellow', 'purple'][variant % 4];
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// 21. water_tank — poly water tank strapped to the RV roof; `valve` lever turns on rotation.z
// ═════════════════════════════════════════════════════════════════════════════
export function buildWaterTank(variant = 0) {
  const g = root('water_tank', variant, { w: 0.82, h: 0.8, l: 1.5 });
  const k = new Kit(540); k.floor = 0;
  const poly = '#dcd6c4', R = 0.33, L = 1.2, CY = 0.12 + R;
  const tint = (cx, cy) => (cy < CY - R * 0.55 ? mix(poly, '#8e8a6a', 0.35) : cy < CY - R * 0.1 ? mix(poly, '#a9a48a', 0.15) : poly);
  k.cyl(tint, R, R, L, [0, CY, 0], { axis: 'z', seg: 10, open: true });
  for (const s of [1, -1]) k.lathe(tint, [[R, 0], [R * 0.82, 0.06], [R * 0.4, 0.1], [0, 0.11]].map(([r, y]) => [r, y]), 10, [0, CY, s * L / 2], { rot: s > 0 ? [0, 0, 0] : [Math.PI, 0, 0], axis: 'z' });
  for (const z of [-0.3, 0.3]) k.cyl(shade(poly, 0.9), R * 1.01, R * 1.01, 0.05, [0, CY, z * 1.5], { axis: 'z', seg: 10, open: true });
  // straps + saddles + roof rails
  for (const z of [-0.36, 0.36]) {
    k.cyl('#3a3b3d', R * 1.025, R * 1.025, 0.05, [0, CY, z], { axis: 'z', seg: 10, open: true });
    k.box('#5a5d60', [0.62, 0.13, 0.12], [0, 0.04, z], { base: true });
    for (const s of [1, -1]) k.box('#3a3b3d', [0.04, 0.06, 0.07], [s * 0.33, 0.07, z]);
  }
  for (const s of [1, -1]) k.box('#6f7378', [0.05, 0.04, 1.36], [s * 0.26, 0, 0], { base: true });
  // filler cap on top, sight gauge on the front, outlet + valve at the rear bottom
  k.cyl('#3a6e8a', 0.075, 0.075, 0.05, [0.0, CY + R - 0.01, 0.15], { base: true, seg: 8 });
  k.cyl('#2d5a72', 0.06, 0.06, 0.015, [0.0, CY + R + 0.04, 0.15], { base: true, seg: 8 });
  k.box('#a7c4cc', [0.04, 0.4, 0.03], [0.18, CY, L / 2 + 0.07]);
  k.box('#4b7f92', [0.042, 0.22, 0.032], [0.18, CY - 0.09, L / 2 + 0.07]);
  rod(k, '#8a8d90', [[0.0, CY - R + 0.06, -L / 2 - 0.05], [0.0, 0.1, -L / 2 - 0.12], [0.0, 0.08, -L / 2 - 0.2]], 0.025, 6);
  k.box('#8a8d90', [0.08, 0.08, 0.08], [0, 0.08, -L / 2 - 0.2]);
  g.add(k.mesh('body'));
  const vk = new Kit(541);
  vk.box('#b8392e', [0.16, 0.025, 0.025], [0.07, 0, 0]);
  vk.cyl('#5a5d60', 0.02, 0.02, 0.03, [0, 0, 0], { axis: 'z', seg: 6 });
  g.add(pivot('valve', vk.mesh('m'), [0, 0.14, -L / 2 - 0.24]));
  g.userData.rvMount = { pos: [0.55, 3.11, -3.1], note: 'RV-local, rear roof on the +X side (clear of the chimney, ladder and vents).' };
  g.userData.valve = { axis: 'z', closed: 0, open: 1.57 };
  return g;
}
