// ─────────────────────────────────────────────────────────────────────────────
// Round 3 cab (agent R3-CAB) — Rook's hands gripping the steering rim.
//
// Built for the LEFT hand in a "grip frame" at the rim point (u = radially out of the wheel,
// t = along the rim toward 12 o'clock, w = wheel +Z, i.e. away from Rook), then baked in the
// hand pivot's frame (wheel frame translated to the grip point). The right hand is the exact
// mirror (x → −x in the wheel frame).
//   • palm: lofted rounded block behind the rim (Rook's side), back of the hand facing out/up
//   • four fingers × 3 phalanges wrapping ~190–210° around the rim tube (outer side → dash side →
//     inner side, fingertips showing on the hub side); the little finger is shorter and wraps less
//   • MCP knuckle bumps, thumb along the rim's back face lying on the upper spoke
//   • wrist, cuff and sleeve toward an IK'd elbow (2-bone IK from the shoulder)
// v0: blue nitrile glove + yellow protective-suit sleeve with an elastic cuff;
// v1: bare skin + flannel shirt cuff and sleeve.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Kit } from '../models/kit.js';
import { PAL, shade, mix } from '../palette.js';
import { V3, basis, limb, tri, quad, bake, mirrorX } from './r3-cab-geo.js';

export const HAND_STYLE = Object.freeze({
  0: {
    glove: true, base: '#3d7fd0', dorsal: '#4183d4', palm: '#3168ae', side: '#3170bf', knuckle: '#4b8ada', nail: null,
    gloveRim: '#5b95dc', cuffBand: ['#c08d17', '#d7a222'], sleeve: '#f2c230', sleeveD: '#d9aa1f', sleeveL: '#f7d257', seam: '#b98a14',
  },
  1: {
    glove: false, base: PAL.skin[1], dorsal: mix(PAL.skin[1], '#c98d64', 0.25), palm: mix(PAL.skin[1], '#f0c6a0', 0.45), side: shade(PAL.skin[1], 0.92),
    knuckle: mix(PAL.skin[1], '#b9785a', 0.4), nail: '#efd2bd',
    gloveRim: null, cuffBand: ['#7a322a', '#6a2a24'], sleeve: '#9a4034', sleeveD: '#6e2c26', sleeveL: '#a94a3c', seam: '#5e2420',
  },
});

// finger table: t offset along the rim, phalanx lengths, radii [width, thickness], MCP set-back toward the wrist
const FINGERS = [
  { t: 0.0262, len: [0.041, 0.025, 0.021], r: [0.0088, 0.0081], back: 0.002 },   // index
  { t: 0.0086, len: [0.045, 0.028, 0.022], r: [0.0092, 0.0084], back: -0.001 },  // middle
  { t: -0.0094, len: [0.042, 0.027, 0.021], r: [0.0087, 0.008], back: 0.003 },   // ring
  { t: -0.0262, len: [0.033, 0.020, 0.019], r: [0.0076, 0.0071], back: 0.011 },  // little
];

const polar = (p) => ({ rho: Math.hypot(p.x, p.z), psi: Math.atan2(p.z, p.x) });
const onTube = (rho, psi, t) => new V3(Math.cos(psi) * rho, t, Math.sin(psi) * rho);

/** 10-point superellipse ring (rounded box section): centre c, axes a (half-width hw) and n (half-thickness hn). */
const RR = Array.from({ length: 10 }, (_, i) => {
  const t = (i / 10) * Math.PI * 2 + Math.PI / 10, c = Math.cos(t), s = Math.sin(t);
  return [Math.sign(c) * Math.abs(c) ** 0.6, Math.sign(s) * Math.abs(s) ** 0.6];
});
function rrect(c, a, n, hw, hn) {
  return RR.map(([x, y]) => c.clone().addScaledVector(a, x * hw).addScaledVector(n, y * hn));
}
function loft(k, rings, colorOf, capStart = false, capEnd = false) {
  const n = rings[0].length;
  for (let r = 0; r < rings.length - 1; r++) {
    const A = rings[r], B = rings[r + 1];
    const ca = A.reduce((s, p) => s.add(p), new V3()).multiplyScalar(1 / n), cb = B.reduce((s, p) => s.add(p), new V3()).multiplyScalar(1 / n);
    const cen = ca.clone().add(cb).multiplyScalar(0.5);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const out = A[i].clone().add(A[j]).add(B[i]).add(B[j]).multiplyScalar(0.25).sub(cen);
      quad(k, colorOf(i, r), A[i], A[j], B[j], B[i], out);
    }
  }
  const cap = (R, dirSign) => {
    const c = R.reduce((s, p) => s.add(p), new V3()).multiplyScalar(1 / n);
    const other = rings[dirSign < 0 ? 1 : rings.length - 2].reduce((s, p) => s.add(p), new V3()).multiplyScalar(1 / n);
    const out = c.clone().sub(other);
    for (let i = 0; i < n; i++) tri(k, colorOf(i, -1), R[i], R[(i + 1) % n], c, out);
  };
  if (capStart) cap(rings[0], -1);
  if (capEnd) cap(rings[rings.length - 1], 1);
}

/**
 * Builds both hands. ctx: { R, rt, phi (grip angle from 12 o'clock), spokePhi (upper spoke angle),
 * spokeW(s) → spoke driver-side surface w at hub distance s, WM (wheel mount → RV-local Matrix4),
 * hub [x,y,z], variant, material } + optional pose knobs: scale (1.1), pronation (0.75 rad roll about
 * the rim), tilt (0.26 rad, wrist dropped), knuckle (0.95 rad, how far round the knuckle row sits),
 * pole ([0.32, −0.92, −0.2], elbow direction for the 2-bone arm IK).
 * Returns { left: { mesh, pos }, right: { mesh, pos } } — meshes in their pivot frames.
 */
export function buildHands(ctx) {
  const { R, rt, phi, spokePhi, WM, variant, material } = ctx;
  const st = HAND_STYLE[variant] || HAND_STYLE[0];
  const gl = st.glove ? 0.0007 : 0;
  const S = ctx.scale ?? 1.1;                                        // hand size (1 = average adult male; FP hands read better a bit big)
  const PRON = ctx.pronation ?? 0.75, TILT = ctx.tilt ?? 0.26;        // hand roll about the rim (back of the hand toward Rook), wrist dropped
  const U = new V3(Math.sin(phi), Math.cos(phi), 0), T = new V3(-Math.cos(phi), Math.sin(phi), 0), W = new V3(0, 0, 1);
  const Pg = U.clone().multiplyScalar(R);
  const G2RV = WM.clone().multiply(basis(Pg, U, T, W));
  const RV2G = G2RV.clone().invert();
  // canonical "fist on a bar" (bar = rim tube along +t) → grip frame: tilt about u, then roll about t
  const MH = new THREE.Matrix4().makeRotationY(PRON).multiply(new THREE.Matrix4().makeRotationX(-TILT));
  const H = (p) => p.clone().applyMatrix4(MH);

  // ── canonical layout: knuckle row on the outer/far side, palm tangent behind the rim ──
  const rhoK = rt + 0.0188 * S + gl, psiK = ctx.knuckle ?? 0.95, hp = 0.0118 * S + gl;
  const K = onTube(rhoK, psiK, 0.0035 * S);
  const Tg = onTube(rt + hp - 0.0012, psiK - Math.acos((rt + hp - 0.0012) / rhoK), 0.0035 * S);
  const D = Tg.clone().sub(K).setY(0).normalize();                   // knuckles → wrist (toward Rook)
  const N = new V3(-D.z, 0, D.x); if (N.dot(new V3(K.x, 0, K.z)) < 0) N.negate();   // back of the hand
  const across = new V3(0, 1, 0);                                    // + = index side
  const PALM = 0.083 * S;
  const wristC = K.clone().addScaledVector(D, PALM);
  const shoulder = new V3(ctx.hub[0] + 0.21, 1.745, 2.42);
  const wristG = H(wristC);
  const elbow = (() => {
    const Ww = wristG.clone().applyMatrix4(G2RV);
    const d = Ww.distanceTo(shoulder), a = 0.29, b = 0.27;
    const u = Ww.clone().sub(shoulder).normalize();
    const along = d >= a + b ? a : (a * a - b * b + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, a * a - along * along));
    const pole = new V3(ctx.pole?.[0] ?? 0.32, ctx.pole?.[1] ?? -0.92, ctx.pole?.[2] ?? -0.2); pole.addScaledVector(u, -pole.dot(u)).normalize();
    return shoulder.clone().addScaledVector(u, along).addScaledVector(pole, h).applyMatrix4(RV2G);
  })();
  const F = elbow.clone().sub(wristG).normalize();

  const k = new Kit(640 + variant);
  k.stack.push(basis(new V3(), U, T, W));            // grip frame → hand pivot frame (rotation only)

  // ── canonical hand (fingers, knuckles, palm) under MH ──
  k.stack.push(k.M.clone().multiply(MH));
  const mcps = [];
  FINGERS.forEach((fg, fi) => {
    const rw = fg.r[0] * S + gl, rh = fg.r[1] * S + gl;
    const mcp = onTube(rhoK, psiK + [0.02, 0, -0.04, -0.1][fi], fg.t * S).addScaledVector(D, fg.back * S);
    mcps.push(mcp);
    const pm = polar(mcp);
    const rj = rt + rh + 0.0031 * S, rtip = rt + rh * 0.9 + 0.0012;
    const [L1, L2, L3] = fg.len.map((x) => x * S);
    const ang = (r0, r1, L) => Math.acos(Math.max(-1, Math.min(1, (r0 * r0 + r1 * r1 - L * L) / (2 * r0 * r1))));
    const psiP = pm.psi + ang(pm.rho, rj, L1), psiD = psiP + ang(rj, rj, L2), psiT = psiD + ang(rj, rtip, L3);
    const J = [mcp, onTube(rj, psiP, fg.t), onTube(rj, psiD, fg.t), onTube(rtip, psiT, fg.t)];
    const radii = [[rw, rh], [rw * 0.95, rh * 0.94], [rw * 0.9, rh * 0.86], [rw * 0.8, rh * 0.74]];
    for (let s = 0; s < 3; s++) {
      const a = J[s], b = J[s + 1];
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const up = new V3(mid.x, 0, mid.z).normalize();
      const colFn = (i, part, th) => {
        const sd = Math.sin(th);
        if (part === 'capB' && st.nail && sd > 0.2) return st.nail;
        return sd > 0.35 ? st.dorsal : sd < -0.35 ? st.palm : st.side;
      };
      limb(k, colFn, a, b, radii[s], radii[s + 1], {
        seg: 6, up, extA: s === 0 ? 0.006 : radii[s][0] * 0.5, extB: s === 2 ? 0 : radii[s + 1][0] * 0.45, capB: s === 2 ? radii[3][1] * 0.9 : 0,
      });
      if (s === 2 && st.nail) {
        const dir = b.clone().sub(a).normalize();
        const c = a.clone().lerp(b, 0.72).addScaledVector(up, radii[3][1] * 1.0 + 0.0004);
        const side = new V3().crossVectors(up, dir).normalize();
        quad(k, st.nail, c.clone().addScaledVector(side, rw * 0.6).addScaledVector(dir, -0.004), c.clone().addScaledVector(side, -rw * 0.6).addScaledVector(dir, -0.004),
          c.clone().addScaledVector(side, -rw * 0.55).addScaledVector(dir, 0.004), c.clone().addScaledVector(side, rw * 0.55).addScaledVector(dir, 0.004), up);
      }
    }
    // low knuckle bump on the MCP (a touch lighter on the glove)
    const kn = new V3(mcp.x, 0, mcp.z).normalize();
    const kc = mcp.clone().addScaledVector(kn, rh * 0.55);
    limb(k, st.knuckle, kc.clone().addScaledVector(across, -rw * 0.55), kc.clone().addScaledVector(across, rw * 0.55), [0.0056 * S, 0.0026 * S], [0.0056 * S, 0.0026 * S], { seg: 6, up: kn, capA: 0.0014, capB: 0.0014 });
  });
  // palm: rounded block from the knuckle row to the wrist
  const rowC = mcps[0].clone().add(mcps[3]).multiplyScalar(0.5);
  const halfRow = mcps[0].distanceTo(mcps[3]) / 2;
  const palmCol = (i) => (i >= 1 && i <= 3 ? st.dorsal : i >= 6 && i <= 8 ? st.palm : st.side);
  const ringsPalm = [
    rrect(rowC.clone().addScaledVector(D, -0.003).addScaledVector(N, -0.001), across, N, halfRow + 0.0095 * S + gl, 0.0108 * S + gl),
    rrect(K.clone().lerp(wristC, 0.42).setY(rowC.y * 0.6), across, N, halfRow + 0.0105 * S + gl, 0.0142 * S + gl),
    rrect(wristC.clone().addScaledVector(D, -0.014 * S).setY(0), across, N, 0.0305 * S + gl, 0.0158 * S + gl),
  ];
  loft(k, ringsPalm, palmCol, true, false);
  k.stack.pop();

  // ── wrist + forearm in the grip frame (palm end → elbow) ──
  const NG = H(N), AG = H(across);
  const fUp = NG.clone().addScaledVector(F, -NG.dot(F)).normalize();
  const fAcross = new V3().crossVectors(F, fUp).normalize();
  const wr0 = H(wristC.clone().addScaledVector(D, -0.014 * S).setY(0));
  const P = (d) => wristG.clone().addScaledVector(F, d);
  const ringAt = (c, ax, nx, hw, hn) => rrect(c, ax, nx, hw, hn);
  const wristCol = (i) => (i >= 1 && i <= 3 ? st.dorsal : i >= 6 && i <= 8 ? st.palm : st.base);
  // blend the palm's end ring into the forearm direction (the wrist bend)
  const axMid = AG.clone().lerp(fAcross.dot(AG) < 0 ? fAcross.clone().negate() : fAcross, 0.5).normalize();
  const nMid = NG.clone().lerp(fUp, 0.5).normalize();
  const fa = fAcross.dot(AG) < 0 ? fAcross.clone().negate() : fAcross;
  loft(k, [
    ringAt(wr0, AG, NG, 0.0305 * S + gl, 0.0158 * S + gl),
    ringAt(wristG.clone().addScaledVector(F, 0.004), axMid, nMid, 0.0285 * S + gl, 0.0175 * S + gl),
    ringAt(P(0.03), fa, fUp, 0.0288 * S + gl, 0.0205 * S + gl),
  ], wristCol, false, false);

  // ── thumb: thenar pad from the palm, then along the rim's back face onto the upper spoke ──
  const dphi = spokePhi - phi;
  const spoke = (u) => { const s = R + u; return { t: -s * Math.sin(dphi), w: ctx.spokeW(s) }; };
  const tr = st.glove ? 0.0007 : 0;
  const thb = H(K.clone().lerp(wristC, 0.5).addScaledVector(across, halfRow * 0.55).addScaledVector(N, -0.004));
  const cmc = H(K.clone().lerp(wristC, 0.72).addScaledVector(across, halfRow * 0.75).addScaledVector(N, -0.007));
  const spokeSurf = (u) => spoke(u).w;
  const th1 = onTube(rt + 0.019 * S, (222 * Math.PI) / 180, 0.013 * S);
  const th2 = new V3(-0.04 * S, spoke(-0.04 * S).t + 0.0105 * S, spokeSurf(-0.04 * S) - 0.0092 * S - tr);
  const th3 = new V3(-0.06 * S, spoke(-0.06 * S).t + 0.0075 * S, spokeSurf(-0.06 * S) - 0.0078 * S - tr);
  const thumbCol = (i, part, th) => (part === 'capB' && st.nail && Math.sin(th) > 0.1 ? st.nail : Math.sin(th) > 0.3 ? st.dorsal : Math.sin(th) < -0.3 ? st.palm : st.side);
  const tUp = (a, b) => { const d = b.clone().sub(a).normalize(); return new V3(0, 0, -1).addScaledVector(d, d.z).normalize(); };
  const thC = cmc.clone().lerp(thb, 0.5);
  limb(k, (i, part, th) => (Math.sin(th) > 0.3 ? st.dorsal : st.side), thC, th1, [0.0172 * S + tr, 0.0138 * S + tr], [0.0128 * S + tr, 0.011 * S + tr], { seg: 7, up: tUp(thC, th1), extA: 0.008, extB: 0.004 });   // thenar + metacarpal
  limb(k, thumbCol, th1, th2, [0.0122 * S + tr, 0.0104 * S + tr], [0.0109 * S + tr, 0.0094 * S + tr], { seg: 6, up: tUp(th1, th2), extA: 0.004, extB: 0.004 });
  limb(k, thumbCol, th2, th3, [0.0106 * S + tr, 0.0092 * S + tr], [0.0092 * S + tr, 0.008 * S + tr], { seg: 6, up: tUp(th2, th3), extA: 0.003, capB: 0.0068 * S });
  if (st.nail) {
    const d = th3.clone().sub(th2).normalize(), up = tUp(th2, th3), side = new V3().crossVectors(up, d).normalize();
    const c = th2.clone().lerp(th3, 0.74).addScaledVector(up, 0.0073 * S);
    quad(k, st.nail, c.clone().addScaledVector(side, 0.0055).addScaledVector(d, -0.0045), c.clone().addScaledVector(side, -0.0055).addScaledVector(d, -0.0045),
      c.clone().addScaledVector(side, -0.005).addScaledVector(d, 0.0045), c.clone().addScaledVector(side, 0.005).addScaledVector(d, 0.0045), up);
  }

  // ── cuff and sleeve toward the elbow ──
  const sleeveLen = wristG.distanceTo(elbow);
  if (st.glove) {
    limb(k, st.gloveRim, P(0.028), P(0.037), [0.0302 * S, 0.0222 * S], [0.0302 * S, 0.0222 * S], { seg: 8, up: fUp });          // rolled glove edge
    for (let i = 0; i < 3; i++) {                                                                                 // elastic suit cuff
      const a = 0.034 + i * 0.0095;
      limb(k, st.cuffBand[i % 2], P(a), P(a + 0.0095), [0.0335 * S + (i % 2) * 0.0016, 0.027 * S + (i % 2) * 0.0016], [0.0345 * S - (i % 2) * 0.001, 0.0282 * S - (i % 2) * 0.001], { seg: 8, up: fUp });
    }
    const sl = (i, part, th) => (Math.sin(th) > 0.5 ? st.sleeveL : Math.sin(th) < -0.4 ? st.sleeveD : st.sleeve);
    limb(k, sl, P(0.062), P(0.09), [0.036 * S, 0.0295 * S], [0.047, 0.041], { seg: 10, up: fUp });
    limb(k, sl, P(0.09), P(0.15), [0.047, 0.041], [0.0505, 0.044], { seg: 10, up: fUp });
    limb(k, st.sleeveD, P(0.15), P(0.162), [0.0505, 0.044], [0.053, 0.0462], { seg: 10, up: fUp });
    limb(k, sl, P(0.162), P(sleeveLen + 0.02), [0.053, 0.0462], [0.058, 0.051], { seg: 10, up: fUp });
    const sa = P(0.095).addScaledVector(fUp, 0.0412), sb = P(sleeveLen).addScaledVector(fUp, 0.0505);
    const side = new V3().crossVectors(fUp, F).normalize();
    quad(k, st.seam, sa.clone().addScaledVector(side, -0.002), sa.clone().addScaledVector(side, 0.002), sb.clone().addScaledVector(side, 0.002), sb.clone().addScaledVector(side, -0.002), fUp);
  } else {
    limb(k, st.cuffBand[0], P(0.03), P(0.085), [0.0362 * S, 0.0305 * S], [0.0385 * S, 0.0328 * S], { seg: 10, up: fUp, capA: true });  // shirt cuff
    const bt = P(0.055).addScaledVector(fUp, 0.0325 * S);
    limb(k, '#e8e2cf', bt.clone().addScaledVector(fUp, -0.002), bt.clone().addScaledVector(fUp, 0.0022), [0.0042, 0.0042], [0.0042, 0.0042], { seg: 6, capB: 0.0006 });
    const fl = (i, part, th) => (Math.sin(th) < -0.4 ? shade(st.sleeve, 0.85) : st.sleeve);
    limb(k, fl, P(0.085), P(0.12), [0.0385 * S, 0.0328 * S], [0.047, 0.041], { seg: 10, up: fUp });
    limb(k, st.sleeveD, P(0.12), P(0.132), [0.047, 0.041], [0.0482, 0.0422], { seg: 10, up: fUp });
    limb(k, fl, P(0.132), P(0.19), [0.0482, 0.0422], [0.051, 0.0445], { seg: 10, up: fUp });
    limb(k, st.sleeveD, P(0.19), P(0.204), [0.051, 0.0445], [0.0518, 0.0452], { seg: 10, up: fUp });
    limb(k, fl, P(0.204), P(sleeveLen + 0.02), [0.0518, 0.0452], [0.056, 0.049], { seg: 10, up: fUp });
  }

  const mesh = bake(k, null, material, 'hand_l_mesh', { smooth: 66, cast: false });
  const meshR = new THREE.Mesh(mirrorX(mesh.geometry), material);
  meshR.name = 'hand_r_mesh'; meshR.castShadow = false; meshR.receiveShadow = true;
  return {
    left: { mesh, pos: [Pg.x, Pg.y, 0] },
    right: { mesh: meshR, pos: [-Pg.x, Pg.y, 0] },
    debug: { wrist: wristG, elbow, F },
  };
}
