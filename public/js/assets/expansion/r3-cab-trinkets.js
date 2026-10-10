// ─────────────────────────────────────────────────────────────────────────────
// Round 3 cab (agent R3-CAB2) — dash life for `rv_cab_fp_r3`.
//
// Animated (one merged mesh per pivot, rest rotation = identity unless noted; render/fp/trinkets.js drives them):
//   hula          anchor on the dash top, right of the binnacle (rotation.y = facing, fixed). Its wooden base is
//                 baked into the body mesh, so the anchor itself costs no draw call.
//   └ hula_spring the coil spring + the dancer (legs, torso, coconut top, lei, head, hair, hibiscus). Pivot at the
//                 top of the base: rotation.x > 0 leans her forward (+Z), rotation.z > 0 leans her to Rook's right (−X)
//     ├ hula_hips  grass skirt, pivot at the waist: sways opposite the torso (rotation.x / .z) and swivels (.y)
//     └ hula_arms  both raised arms, pivot at the shoulders: lags the torso (rotation.x / .z)
//   freshener     mint pine-tree card on a string under the rear-view mirror: pendulum (rotation.x / .z swing,
//                 .y twist about the string, Euler order 'XZY'). rotation.x > 0 swings it toward Rook (−Z).
//   dice          a pair of fuzzy dice on one loop next to it: same pendulum convention.
// Static (baked into the body mesh, no extra draw calls): dash caddy with the to-go coffee and a phone in a spring-
// clip holder (nav screen), folded aviator sunglasses, a pack of mint gum, a crumpled receipt, a toll ticket and a
// parking stub tucked against the bottom of the windscreen, a loose cassette, a polaroid tucked into the binnacle.
// All printed details come from r3-cab-atlas.js (no real brands).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Kit, chamferBoxGeometry } from '../models/kit.js';
import { pivot, rod } from './hazards-util.js';
import { V, V3, M4, inFrame, quad, tri, limb, tube, torus, Decals, bake } from './r3-cab-geo.js';
import { uvOf, WHITE_UV, TREE } from './r3-cab-atlas.js';

const EYE = new V3(0.55, 1.98, 2.5);   // = hazards-cab.js CAB.eye (Rook's eye, RV-local)

/** Placements (RV-local) and pendulum lengths; mirrored into userData.trinkets for render/fp/trinkets.js. */
export const TRINKETS = Object.freeze({
  hula: { pos: [0.182, 1.497, 3.095], yaw: -0.3, scale: 1.3 },          // dash top, right of the binnacle, against the glass
  mirror: { pos: [0.22, 2.02, 2.8], yaw: -0.42, w: 0.3, h: 0.095, d: 0.035 },   // = r3-cab-model.js shell() centre mirror
  freshener: { lx: -0.022, string: 0.05, w: 0.047, h: 0.072 },            // lx: hanging point along the mirror (− = Rook's right)
  dice: { lx: 0.058, knot: 0.032, size: 0.031 },
});

// hula dancer proportions (unscaled metres, hula-local: +Y up, she faces −Z = toward Rook once the anchor yaw is applied)
const H = { baseTop: 0.013, springTop: 0.052, puck: 0.0035, waist: 0.1, shoulder: 0.1335 };
const SKIN = '#c98b5a', SKIN_L = '#d99b6a', HAIR = '#18110e', WOOD = '#5c3b22', WOOD_L = '#7d5434';

// ── small helpers ────────────────────────────────────────────────────────────
/** Seamless swept tube through pts (V3[]) with radius r and `seg` sides; side(i) gives the ring's reference "out" vector. */
function sweep(k, color, pts, r, seg, side) {
  const rings = pts.map((p, i) => {
    const t = pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
    const o = side(i).clone().addScaledVector(t, -side(i).dot(t)).normalize();
    const b = new V3().crossVectors(t, o);
    return Array.from({ length: seg }, (_, j) => { const a = (j / seg) * Math.PI * 2; return p.clone().addScaledVector(o, Math.cos(a) * r).addScaledVector(b, Math.sin(a) * r); });
  });
  for (let i = 0; i < rings.length - 1; i++) {
    const c = pts[i].clone().add(pts[i + 1]).multiplyScalar(0.5);
    for (let j = 0; j < seg; j++) {
      const jj = (j + 1) % seg, q = [rings[i][j], rings[i][jj], rings[i + 1][jj], rings[i + 1][j]];
      quad(k, typeof color === 'function' ? color(i, j) : color, q[0], q[1], q[2], q[3], q[0].clone().add(q[2]).multiplyScalar(0.5).sub(c));
    }
  }
}
/** Concave polygon (kit-local points, planar in XY) as decal triangles with per-point uvs. */
function decalShape(dk, pts, uvs, color, out) {
  const flat = pts.map((p) => new THREE.Vector2(p.x, p.y));
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(flat, [])) dk.poly([pts[a], pts[b], pts[c]], [uvs[a], uvs[b], uvs[c]], color, out);
}
const yawToward = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));   // yaw that turns local −Z toward `to`
/** Mirror-local point (x along the mirror, y up, z toward the glass) → RV-local. */
function mirrorPt(lx, ly, lz) { const m = TRINKETS.mirror; return new V3(lx, ly, lz).applyMatrix4(M4(m.pos, [0, m.yaw, 0])); }

// ═════════════════════════════════════════════════════════════════════════════
/**
 * Builds the animated trinkets under rv_frame `F`. The hula's wooden base is added to the body kit `k`.
 * M = r3-cab-model.js materials(). Returns { hula, freshener, dice } pivots.
 */
export function addTrinkets(F, k, M) {
  const hula = buildHula(F, k, M);
  const freshener = buildFreshener(F, M);
  const dice = buildDice(F, M);
  return { hula, freshener, dice };
}

// ── the hula dancer ──────────────────────────────────────────────────────────
function buildHula(F, k, M) {
  const T = TRINKETS.hula, S = T.scale;
  // anchor (fixed): position on the dash, yaw = facing
  const anchor = new THREE.Object3D(); anchor.name = 'hula';
  anchor.position.set(...T.pos); anchor.rotation.set(0, T.yaw, 0);
  F.add(anchor);
  // wooden base → body kit (no draw call): lathe disc with a lighter top + a felt foot
  inFrame(k, M4(T.pos, [0, T.yaw, 0], 'XYZ', [S, S, S]), () => {
    k.lathe((cx, cy, cz, nx, ny) => (ny > 0.9 ? WOOD_L : WOOD), [[0.03, 0.0], [0.0325, 0.006], [0.0265, H.baseTop], [0.0, H.baseTop]], 10, [0, 0, 0]);
  });
  const frame = (y0) => M4([0, 0, 0], [0, 0, 0], 'XYZ', [S, S, S]).multiply(M4([0, -y0, 0]));

  // hula_spring: coil + puck + legs + torso + top + lei + neck + head/hair + hibiscus
  const sk = new Kit(760);
  inFrame(sk, frame(H.baseTop), () => {
    const turns = 3.5, per = 6, n = turns * per, r = 0.0066, pts = [];
    for (let i = 0; i <= n; i++) { const a = (i / per) * Math.PI * 2; pts.push(new V3(Math.cos(a) * r, H.baseTop + 0.0012 + (H.springTop - H.baseTop - 0.0024) * (i / n), Math.sin(a) * r)); }
    sweep(sk, (i) => (i % 2 ? '#b8bcc2' : '#9ea3aa'), pts, 0.00135, 3, (i) => new V3(pts[i].x, 0, pts[i].z));
    sk.cyl(WOOD_L, 0.0095, 0.0095, H.puck, [0, H.springTop + H.puck / 2, 0], { seg: 8 });
    const fy = H.springTop + H.puck;
    // legs + feet (only the shins show under the skirt)
    for (const s of [1, -1]) {
      limb(sk, SKIN, [s * 0.0052, fy + 0.002, -0.001], [s * 0.0058, H.waist - 0.006, 0], [0.0036, 0.0038], [0.0062, 0.006], { seg: 6, capA: 0.001 });
      sk.box(SKIN_L, [0.0052, 0.0035, 0.011], [s * 0.0052, fy + 0.00175, -0.0035]);
    }
    // torso: hips → waist → ribs → chest → shoulders (elliptical, front = −Z)
    tube(sk, (i, part, th) => (Math.sin(th) > 0.55 ? SKIN_L : SKIN), [[0, H.waist - 0.008, 0], [0, H.waist, 0], [0, 0.112, -0.0005], [0, 0.124, -0.001], [0, H.shoulder + 0.0015, 0]],
      [[0.0112, 0.0085], [0.0098, 0.0074], [0.0108, 0.008], [0.0128, 0.0088], [0.0138, 0.0075]], { seg: 8, up: [0, 0, -1], joint: 0.0006, capA: true });
    // coconut-shell top + a strap
    for (const s of [1, -1]) {
      sk.ico((cx, cy, cz, nx, ny, nz) => (nz < -0.75 ? '#7a4c2c' : '#5c3820'), 0.0056, [s * 0.0058, 0.1205, -0.0068], { detail: 0, scale: [1, 0.95, 0.7] });
    }
    limb(sk, '#4a2c18', [0, 0.1205, -0.0088], [0, 0.1205, 0.0], [0.0124, 0.0013], [0.0124, 0.0013], { seg: 8, up: [0, 1, 0], extA: 0.001 });
    // lei: lumpy flower ring around the neck, lower in front
    inFrame(sk, M4([0, 0.1305, -0.0012], [Math.PI / 2 - 0.42, 0, 0]), () => {
      const cols = ['#f06292', '#ffd54f', '#ffffff', '#ff8a65', '#ec407a', '#fff176'];
      torus(sk, (i) => cols[i % cols.length], 0.0118, 0.0042, { N: 10, M: 3, phase: Math.PI / 6, radius: (i) => 0.0042 * (i % 2 ? 1.22 : 0.88) });
    });
    limb(sk, SKIN, [0, H.shoulder, 0], [0, 0.146, 0], [0.0047, 0.0045], [0.0044, 0.0044], { seg: 6 });
    // head: one ico, faces coloured skin (face) or hair (crown, sides, back)
    const hc = [0, 0.1575, -0.0008];
    sk.ico((cx, cy, cz, nx, ny, nz) => ((ny > 0.5 || (nz > -0.32 && ny > -0.3)) ? HAIR : SKIN), 0.0128, hc, { detail: 1, scale: [0.96, 1.08, 1] });
    // long hair down the back + two locks over the shoulders
    limb(sk, HAIR, [0, 0.158, 0.0072], [0, 0.117, 0.0115], [0.0118, 0.0052], [0.0128, 0.0032], { seg: 6, up: [0, 0, 1], capB: 0.002 });
    for (const s of [1, -1]) limb(sk, HAIR, [s * 0.0105, 0.156, 0.0015], [s * 0.0128, 0.1305, 0.0005], [0.0032, 0.0034], [0.0026, 0.0022], { seg: 5, capB: 0.0015 });
    // face: eyes, brows, smile (on the sphere's front)
    const onHead = (x, y, lift) => { const d = new V3(x / 0.96, (y - hc[1]) / 1.08, 0); d.z = -Math.sqrt(Math.max(0, 1 - d.x * d.x - d.y * d.y)); return { p: new V3(hc[0] + d.x * 0.96 * (0.0128 + lift), hc[1] + d.y * 1.08 * (0.0128 + lift), hc[2] + d.z * (0.0128 + lift)), n: new V3(d.x, d.y, d.z).normalize() }; };
    const dot = (color, x, y, w, h, lift = 0.0004) => {
      const { p, n } = onHead(x / 0.0128, y, lift);
      const ax = new V3(1, 0, 0).addScaledVector(n, -n.x).normalize().multiplyScalar(w / 2), ay = new V3().crossVectors(n, ax).normalize().multiplyScalar(-h / 2);
      quad(sk, color, p.clone().sub(ax).sub(ay), p.clone().add(ax).sub(ay), p.clone().add(ax).add(ay), p.clone().sub(ax).add(ay), n);
    };
    for (const s of [1, -1]) { dot('#1a1110', s * 0.0045, 0.1592, 0.0026, 0.0033); dot('#1a1110', s * 0.0046, 0.1632, 0.0036, 0.0008); }
    dot('#b8323e', 0, 0.1515, 0.0046, 0.0014);
    dot('#e58a78', 0.0076, 0.1545, 0.0028, 0.0018, 0.0002); dot('#e58a78', -0.0076, 0.1545, 0.0028, 0.0018, 0.0002);
    // hibiscus over her right ear (+X): five cupped petals + yellow heart
    {
      const c = new V3(0.0118, 0.1645, -0.0005), n = new V3(0.82, 0.3, -0.48).normalize();
      const u = new V3(0, 1, 0).addScaledVector(n, -n.y).normalize(), w = new V3().crossVectors(n, u);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3, d = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a)), p = new V3().crossVectors(n, d);
        const tip = c.clone().addScaledVector(d, 0.0098).addScaledVector(n, 0.0018);
        const s0 = c.clone().addScaledVector(d, 0.0042).addScaledVector(p, 0.0042).addScaledVector(n, 0.0006), s1 = c.clone().addScaledVector(d, 0.0042).addScaledVector(p, -0.0042).addScaledVector(n, 0.0006);
        quad(sk, i % 2 ? '#e8344a' : '#f2475c', c, s0, tip, s1, n);
      }
      const hp = Array.from({ length: 5 }, (_, i) => { const a = (i / 5) * Math.PI * 2; return c.clone().addScaledVector(u, Math.cos(a) * 0.0022).addScaledVector(w, Math.sin(a) * 0.0022).addScaledVector(n, 0.001); });
      for (let i = 1; i < 4; i++) tri(sk, '#ffd23f', hp[0], hp[i], hp[i + 1], n);
      limb(sk, '#ffe066', c.clone().addScaledVector(n, 0.001), c.clone().addScaledVector(n, 0.0045).addScaledVector(u, -0.001), [0.0006, 0.0006], [0.0006, 0.0006], { seg: 3 });
    }
  });
  const spring = pivot('hula_spring', bake(sk, null, M.smooth, 'hula_spring_mesh', { whiteUV: WHITE_UV, smooth: 52, cast: false }), [0, H.baseTop * S, 0], [0, 0, 0], 'XZY');
  anchor.add(spring);

  // hula_hips: grass skirt (inner cone + 18 layered blades with a ragged hem) + straw waistband
  const hk = new Kit(761);
  inFrame(hk, frame(H.waist), () => {
    const hem = H.springTop + H.puck + 0.0105, rw = 0.0112, N = 18;
    const cone = 12;
    for (let i = 0; i < cone; i++) {
      const a0 = (i / cone) * Math.PI * 2, a1 = ((i + 1) / cone) * Math.PI * 2;
      const P = (a, r, y) => new V3(Math.sin(a) * r, y, Math.cos(a) * r);
      quad(hk, '#6d8834', P(a0, rw - 0.0004, H.waist + 0.001), P(a1, rw - 0.0004, H.waist + 0.001), P(a1, 0.0225, hem + 0.003), P(a0, 0.0225, hem + 0.003), P((a0 + a1) / 2, 1, 0));
    }
    const cols = ['#a9b84c', '#c8c35e', '#86a03e', '#b9ae52', '#9cb446', '#d0c66a'];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + (i % 2) * 0.09, out = new V3(Math.sin(a), 0, Math.cos(a)), tg = new V3(Math.cos(a), 0, -Math.sin(a));
      const lay = (i % 2) * 0.0009, rh = 0.0255 + lay + ((i * 5) % 3) * 0.0012, yh = hem - ((i * 7) % 3) * 0.0028;
      const top = out.clone().multiplyScalar(rw + lay * 0.5).setY(H.waist), bot = out.clone().multiplyScalar(rh).setY(yh);
      quad(hk, cols[i % cols.length], top.clone().addScaledVector(tg, -0.0024), top.clone().addScaledVector(tg, 0.0024), bot.clone().addScaledVector(tg, 0.0044), bot.clone().addScaledVector(tg, -0.0044), out);
    }
    limb(hk, (i) => (i % 2 ? '#e6c25a' : '#d4ad46'), [0, H.waist - 0.0035, 0], [0, H.waist + 0.0035, 0], [0.0119, 0.0119], [0.0112, 0.0112], { seg: 10 });
  });
  spring.add(pivot('hula_hips', bake(hk, null, M.smooth, 'hula_hips_mesh', { whiteUV: WHITE_UV, smooth: 40, cast: false }), [0, (H.waist - H.baseTop) * S, 0], [0, 0, 0], 'XZY'));

  // hula_arms: both arms raised — her right curls up beside the hibiscus, her left waves out to the side
  const ak = new Kit(762);
  inFrame(ak, frame(H.shoulder), () => {
    const arm = (pts, hand) => {
      tube(ak, SKIN, pts, [[0.0042, 0.0042], [0.0034, 0.0034], [0.0027, 0.0027]], { seg: 6, joint: 0.0012 });
      const a = V(pts[2]), b = V(hand);
      limb(ak, SKIN_L, a, b, [0.0034, 0.0016], [0.0024, 0.0012], { seg: 6, up: [0, 0, -1], extA: 0.001, capB: 0.0018 });
    };
    arm([[0.0128, H.shoulder - 0.0005, 0.0005], [0.0285, 0.1505, -0.003], [0.0245, 0.1725, -0.0055]], [0.0165, 0.1815, -0.0065]);
    arm([[-0.0128, H.shoulder - 0.0005, 0.0005], [-0.0315, 0.1435, -0.005], [-0.0405, 0.1645, -0.0085]], [-0.0385, 0.1765, -0.0105]);
  });
  spring.add(pivot('hula_arms', bake(ak, null, M.smooth, 'hula_arms_mesh', { whiteUV: WHITE_UV, smooth: 52, cast: false }), [0, (H.shoulder - H.baseTop) * S, 0], [0, 0, 0], 'XZY'));
  return anchor;
}

// ── mint pine-tree freshener on its string ─────────────────────────────────────
function buildFreshener(F, M) {
  const T = TRINKETS.freshener, mh = TRINKETS.mirror.h;
  const hang = mirrorPt(T.lx, -mh / 2 + 0.002, -0.006);
  const k = new Kit(763); const dk = new Decals(k);
  rod(k, '#e9e4d6', [[0, 0, 0], [0, -T.string - 0.004, 0]], 0.00065, 3);
  const yaw = yawToward(hang.clone().setY(EYE.y), EYE) + 0.25;   // the card faces Rook, a touch turned
  inFrame(k, M4([0, -T.string, 0], [0, yaw, 0]), () => {
    const [u0, v0, u1, v1] = uvOf('fresh', 2);
    const uvs = TREE.map(([u, v]) => [u0 + (u1 - u0) * u, v0 + (v1 - v0) * v]);
    // seen from −Z the viewer's right is −X, so the face toward Rook runs u along −X (the print reads right way round)
    decalShape(dk, TREE.map(([u, v]) => new V3(-(u - 0.5) * T.w, -(1 - v) * T.h, -0.0006)), uvs, '#8ee6bd', [0, 0, -1]);
    decalShape(dk, TREE.map(([u, v]) => new V3((u - 0.5) * T.w, -(1 - v) * T.h, 0.0006)), uvs, '#8ee6bd', [0, 0, 1]);   // back (same print)
    rod(k, '#e9e4d6', [[0, 0.002, 0], [0, -0.006, 0]], 0.0009, 3);                         // knot through the punched hole
  });
  const p = pivot('freshener', bake(k, dk, M.body, 'freshener_mesh', { whiteUV: WHITE_UV, cast: false }), hang.toArray(), [0, 0, 0], 'XZY');
  F.add(p);
  return p;
}

// ── fuzzy dice (two on one loop) ────────────────────────────────────────────────
function buildDice(F, M) {
  const T = TRINKETS.dice, mh = TRINKETS.mirror.h, D = T.size, c = 0.0046;
  const hang = mirrorPt(T.lx, -mh / 2 + 0.002, -0.006);
  const k = new Kit(764); const dk = new Decals(k);
  const knot = new V3(0, -T.knot, 0);
  rod(k, '#f2efe8', [[0, 0, 0], knot.toArray()], 0.0007, 3);
  // [centre, rotation, faces +X −X +Y −Y +Z −Z]
  const DICE = [
    [new V3(-0.0125, -0.0815, 0.002), [0.22, 0.62, -0.16], [3, 4, 1, 6, 2, 5]],
    [new V3(0.0145, -0.066, -0.003), [-0.14, -0.42, 0.24], [5, 2, 6, 1, 4, 3]],
  ];
  const core = chamferBoxGeometry(D, D, D, c);
  for (const [cen, rot, faces] of DICE) {
    const m = M4(cen.toArray(), rot);
    const top = new V3(0, D / 2, 0).applyMatrix4(m);
    rod(k, '#f2efe8', [knot.toArray(), top.toArray()], 0.0007, 3);
    k.geo(core, '#cf3a5f', m);
    inFrame(k, m, () => {
      const h = D / 2 - c + 0.0006, o = D / 2 + 0.00025;
      const F6 = [[[o, 0, 0], [0, 0, -h], [0, h, 0]], [[-o, 0, 0], [0, 0, h], [0, h, 0]], [[0, o, 0], [h, 0, 0], [0, 0, -h]],
        [[0, -o, 0], [h, 0, 0], [0, 0, h]], [[0, 0, o], [h, 0, 0], [0, h, 0]], [[0, 0, -o], [-h, 0, 0], [0, h, 0]]];
      F6.forEach(([cc, ax, ay], i) => dk.rect(cc, ax, ay, uvOf('die' + faces[i], 2), '#cf3a5f', cc));
    });
  }
  const p = pivot('dice', bake(k, dk, M.smooth, 'dice_mesh', { whiteUV: WHITE_UV, smooth: 50, cast: false }), hang.toArray(), [0, 0, 0], 'XZY');
  F.add(p);
  return p;
}

// ═════════════════════════════════════════════════════════════════════════════
/**
 * Static dash clutter, baked into the body (kit k + decals dk, RV-local).
 * Replaces the original caddy block of r3-cab-model.js dashboard().
 */
export function dashLife(k, dk) {
  const y0 = 1.497;
  // ── dash caddy: to-go coffee in the cup ring (right) + phone in a spring-clip holder (left) ──
  k.at([-0.085, y0, 3.07], [0, 0.1, 0], () => {
    k.box('#2a2826', [0.24, 0.026, 0.1], [0, 0, 0], { base: true });
    k.cyl('#2a2826', 0.047, 0.047, 0.035, [-0.078, 0.017, 0], { seg: 10, open: true });
    k.lathe('#f1ece0', [[0.031, 0.0], [0.04, 0.115], [0.0, 0.115]], 10, [-0.078, 0.006, 0]);
    k.cyl('#9a6a3e', 0.0395, 0.0365, 0.042, [-0.078, 0.07, 0], { seg: 10, open: true });
    k.cyl('#4a3426', 0.0425, 0.0425, 0.012, [-0.078, 0.126, 0], { seg: 10 });
    k.cyl('#3e2c20', 0.03, 0.036, 0.006, [-0.078, 0.134, 0], { seg: 10 });
    k.box('#1a120d', [0.012, 0.002, 0.005], [-0.078, 0.1375, -0.02]);
    // phone holder: post + ball joint, cradle tilted back toward the glass, facing Rook
    k.cyl('#1d1d1e', 0.0062, 0.0075, 0.026, [0.062, 0.026, 0.005], { seg: 6, base: true });
    k.ico('#2a2a2b', 0.0085, [0.062, 0.054, 0.005], { detail: 0 });
  });
  {
    const cp = new V3(-0.085, y0, 3.07).add(new V3(0.062, 0.054, 0.005).applyAxisAngle(new V3(0, 1, 0), 0.1));
    const yaw = yawToward(cp, EYE) - 0.18;
    const m = M4(cp.clone().add(new V3(0, 0.03, 0.006)).toArray(), [-0.34, yaw, 0], 'YXZ');   // tilt the top toward the glass
    inFrame(k, m, () => {
      for (const s of [1, -1]) k.box('#262628', [0.008, 0.05, 0.016], [s * 0.0745, 0, 0.002]);   // spring jaws
      k.box('#202124', [0.144, 0.07, 0.0085], [0, 0, 0], { c: 0.0035 });                         // the phone (landscape)
      dk.rect([0, 0, -0.0044], [-0.0655, 0, 0], [0, 0.031, 0], uvOf('phone', 1), '#2c3a4e', [0, 0, -1]);
    });
  }
  // ── folded aviator sunglasses on the dash, near the glass ──
  inFrame(k, M4([0.072, y0 + 0.002, 3.13], [0, 0.42, 0]), () => {
    const lensPts = (s) => {   // teardrop, wider at the top-outer corner
      const P = [[0.0, 0.019], [0.02, 0.017], [0.025, 0.006], [0.021, -0.008], [0.01, -0.016], [-0.004, -0.014], [-0.012, -0.004], [-0.014, 0.01], [-0.008, 0.018]];
      return P.map(([x, y]) => [s * x, y]);
    };
    inFrame(k, M4([0, 0.012, 0.006], [1.1, 0, 0]), () => {   // lenses lie back ~30° from flat, resting on the folded temples
      for (const s of [1, -1]) {
        const cx = s * 0.031;
        const P = lensPts(s);
        k.poly('#c9a24a', P.map(([x, y]) => [cx + x * 1.12, y * 1.12, 0.0006]), { facing: [0, 0, -1] });       // gold rim
        k.poly('#24302c', P.map(([x, y]) => [cx + x, y, -0.0002]), { facing: [0, 0, -1] });                    // smoked green lens
        k.poly('#6a7c76', [[cx - s * 0.006, 0.016, -0.0006], [cx + s * 0.004, 0.016, -0.0006], [cx + s * 0.016, -0.004, -0.0006], [cx + s * 0.009, -0.006, -0.0006]], { facing: [0, 0, -1] });   // sheen
      }
      k.box('#c9a24a', [0.022, 0.0016, 0.0016], [0, 0.016, 0.0008]);     // double bridge
      k.box('#c9a24a', [0.018, 0.0014, 0.0014], [0, 0.0105, 0.0008]);
    });
    for (const s of [1, -1]) k.box(s > 0 ? '#c9a24a' : '#2a2622', [0.062, 0.0018, 0.0022], [s * 0.01, 0.002, 0.014 + s * 0.003], { rot: [0, s * 0.08, 0] });   // folded temples
  });
  // ── pack of mint gum, one stick sliding out; a crumpled receipt ──
  inFrame(k, M4([0.035, y0, 3.005], [0, -0.35, 0]), () => {
    k.box('#e9eee8', [0.078, 0.012, 0.022], [0, 0.006, 0]);
    dk.rect([0, 0.0122, 0], [-0.038, 0, 0], [0, 0, 0.0105], uvOf('gum', 1), '#e9eee8', [0, 1, 0]);
    k.box('#cfd6d2', [0.064, 0.0022, 0.017], [-0.026, 0.0075, 0.0]);
  });
  k.ico('#efece4', 0.0135, [-0.06, y0 + 0.011, 3.0], { detail: 0, jitter: 0.32, seed: 17, scale: [1.15, 0.8, 1] });
  // ── loose cassettes (Road Mix '86, Desert Radio in its clear case) ──
  k.at([0.165, y0, 3.0], [0, -0.5, 0], () => {
    k.box('#1b1b1c', [0.1, 0.012, 0.064], [0, 0, 0], { base: true });
    dk.rect([0, 0.0122, 0], [-0.049, 0, 0], [0, 0, 0.0315], uvOf('cassA', 1), '#efe7d2', [0, 1, 0]);
  });
  k.at([-0.33, y0, 3.11], [0, -0.28, 0], () => {
    k.box('#a9b1b5', [0.11, 0.017, 0.071], [0, 0, 0], { base: true });
    dk.rect([0, 0.0172, 0], [-0.052, 0, 0], [0, 0, 0.033], uvOf('cassB', 1), '#e9d6c0', [0, 1, 0]);
  });
  // ── polaroid tucked into the top-left corner of the binnacle hood ──
  {
    const m = M4([0.735, 1.692, 3.052], [-0.32, -0.38, -0.16], 'YXZ');   // leans back, turned toward Rook, tilted
    inFrame(k, m, () => {
      dk.rect([0, 0.027, -0.0006], [-0.0255, 0, 0], [0, 0.032, 0], uvOf('photo', 1), '#f2efe6', [0, 0, -1]);
      quad(k, '#e6e2d6', [0.0255, -0.005, 0.0006], [-0.0255, -0.005, 0.0006], [-0.0255, 0.059, 0.0006], [0.0255, 0.059, 0.0006], [0, 0, 1]);
    });
  }
}
/**
 * A toll ticket and a parking stub tucked under the driver's visor strap, poking out below its edge.
 * Call inside r3-cab-model.js' visor frame (local −Y hangs down, Rook's side = −Z, the strap at z −0.0245).
 */
export function visorSlips(k, dk) {
  for (const [x, y, roll, rect, col] of [[-0.088, -0.081, 0.07, 'ticket', '#f3efe3'], [-0.128, -0.085, -0.1, 'ticket2', '#f2e39a']]) {
    const c = new V3(x, y, rect === 'ticket' ? -0.0135 : -0.0128);
    const ax = new V3(-0.0185, 0, 0).applyAxisAngle(new V3(0, 0, 1), roll), ay = new V3(0, 0.03, 0).applyAxisAngle(new V3(0, 0, 1), roll);
    dk.rect(c, ax, ay, uvOf(rect, 1), col, [0, 0, -1]);
  }
}
