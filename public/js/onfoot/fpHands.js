// ─────────────────────────────────────────────────────────────────────────────
// Round 3 (agent SHOPS) — Doc's first-person hands. Shared by the shop runs and the van lab (DOCFP).
//
//   import { createFpHands } from '../onfoot/fpHands.js';
//   const hands = createFpHands({ gloves: true });
//   camera.add(hands.root); scene.add(camera);        // the camera MUST be in the scene graph
//   hands.setPose('carry', 0.25);                      // blend time in seconds (default 0.2)
//   hands.update(dt, { walk: 0..1, sway: { x: yawRate, y: pitchRate } | number, act, act2, pitch, yaw });
//   hands.hold(crate, 'both');  hands.hold(null, 'both');
//   hands.reach('r');                                  // one-shot grab reach (E feedback)
//   hands.dispose();
//
// • ONE SkinnedMesh for both hands (1 draw call) with rigid finger bones: 4 fingers × 2 + thumb × 2 + wrist + forearm.
//   Blue nitrile gloves with a rolled rim, the yellow protective suit's elastic cuff and sleeve (HAND_STYLE of
//   r3-cab-hands.js). gloves:false → bare hands with the same suit sleeve.
// • Overlay: the hands (and anything they hold) draw last, after a depth clear, so they never clip into walls.
//   They are flagged transparent (opacity 1) to land at the end of three's transparent pass. Pass { overlay:false }
//   to render them as ordinary scene meshes.
// • Poses (camera space, metres, camera looks down −Z): idle walk grab carry push pump lever torch pour grind spray.
//   update(…, { act }) drives each pose's live motion: grab → fingers close 0..1, pump/spray → trigger squeeze 0..1,
//   lever → right lever −1..1 (act2 = left hand −1..1), pour → tilt 0..1, grind → speed 0..1.
//   update(…, { pitch, yaw }) (the camera pitch, and for a seated view the look's yaw offset from the seat, rad) keeps
//   "body-locked" poses (push, lever) fixed to the body while the camera looks around, so the hands stay on a trolley
//   handle / cab levers placed in the world.
// • Sockets: hands.sockets.r / .l (in the fist), .both (between the hands; carry). hold(obj, side, { pos, rot })
//   parents obj to the socket (local pose = pos/rot, default 0). A held object's −Z is its "forward" (torch beam,
//   nozzle); the torch/pump/spray poses aim the right socket along the view.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Kit, Rig } from '../assets/models/kit.js';
import { limb, smoothNormals } from '../assets/expansion/r3-cab-geo.js';
import { HAND_STYLE } from '../assets/expansion/r3-cab-hands.js';

const V3 = THREE.Vector3;
const SIDES = ['r', 'l'];
const SGN = { r: 1, l: -1 };
const BIND_X = 0.2;            // bind-pose wrist x (model space) per side
const OVERLAY_ORDER = 1e6;

// finger table (right hand; thumb on −X): knuckle x, z, splay, proximal + distal length, radii
const FINGERS = [
  { x: -0.0255, z: -0.088, sp: -0.035, l1: 0.043, l2: 0.045, r: [0.0098, 0.0088] },  // index
  { x: -0.0085, z: -0.091, sp: -0.01, l1: 0.047, l2: 0.049, r: [0.0102, 0.0091] },   // middle
  { x: 0.0088, z: -0.089, sp: 0.015, l1: 0.044, l2: 0.046, r: [0.0097, 0.0087] },    // ring
  { x: 0.0255, z: -0.082, sp: 0.045, l1: 0.035, l2: 0.037, r: [0.0086, 0.0077] },    // little
];
const THUMB0 = [-0.029, -0.007, -0.024];
const THUMB_DIR = new V3(-0.62, -0.28, -0.74).normalize();
const GRIP_LOCAL = new V3(0.0, -0.03, -0.074);    // centre of a closed fist (right hand; x mirrored)

// ── poses ────────────────────────────────────────────────────────────────────
// per hand: p wrist position, r [pitch, yaw, roll] forearm (Euler YXZ), w [x, y, z] wrist bend, c 4 finger curls,
// t thumb curl. Values are for the RIGHT hand; the left mirrors them unless given. lock: body-lock 0..1.
// aim: right socket orientation [pitch, yaw, roll] in camera space (held tools point along the view), aimW weight.
const H = (p, r, w, c, t) => ({ p, r, w, c, t });
export const POSES = {
  idle: { r: H([0.2, -0.235, -0.37], [0.2, 0.1, -0.95], [0.1, 0, 0.0], [0.2, 0.24, 0.29, 0.34], 0.2) },
  walk: { r: H([0.205, -0.245, -0.36], [0.16, 0.1, -1.0], [0.06, 0, 0.0], [0.3, 0.34, 0.4, 0.46], 0.3) },
  grab: {
    r: H([0.12, -0.17, -0.42], [0.2, 0.18, -0.55], [0.12, 0, 0], [0.18, 0.15, 0.18, 0.22], 0.15),
    l: H([-0.19, -0.3, -0.31], [0.26, -0.3, 0.6], [0, 0, -0.05], [0.5, 0.56, 0.62, 0.68], 0.4),
  },
  carry: {
    r: H([0.275, -0.33, -0.44], [0.55, -0.06, -1.45], [0.1, 0.0, 0.0], [0.45, 0.5, 0.55, 0.6], 0.25),
    both: [0, -0.2, -0.58],
  },
  push: {
    r: H([0.2, -0.47, -0.43], [0.1, 0.06, -0.12], [-0.25, 0, 0], [0.92, 0.95, 0.95, 0.95], 0.75),
    lock: 1,
  },
  pump: {
    r: H([0.11, -0.2, -0.4], [0.5, 0.2, -1.45], [-0.15, 0, 0], [0.35, 0.92, 0.95, 0.95], 0.8),
    l: H([-0.2, -0.31, -0.31], [0.26, -0.3, 0.6], [0, 0, -0.05], [0.5, 0.56, 0.62, 0.68], 0.4),
    aim: [-0.08, 0.02, 0], aimW: 1,
  },
  lever: {
    r: H([0.17, -0.44, -0.4], [0.75, 0.15, -1.45], [-0.35, 0, 0], [0.9, 0.95, 0.95, 0.95], 0.85),
    l: H([-0.19, -0.44, -0.42], [0.75, -0.15, 1.45], [-0.35, 0, 0], [0.9, 0.95, 0.95, 0.95], 0.85),
    lock: 1,
  },
  torch: {
    r: H([0.15, -0.19, -0.37], [0.62, 0.24, -1.4], [-0.2, 0, 0], [0.9, 0.95, 0.95, 0.95], 0.85),
    l: H([-0.2, -0.31, -0.31], [0.26, -0.3, 0.6], [0, 0, -0.05], [0.5, 0.56, 0.62, 0.68], 0.4),
    aim: [0.0, 0.0, 0], aimW: 1,
  },
  pour: {
    r: H([0.08, -0.17, -0.42], [0.45, 0.12, -1.4], [0, 0, 0], [0.88, 0.92, 0.94, 0.95], 0.8),
    l: H([-0.17, -0.29, -0.36], [0.26, -0.3, 0.6], [0, 0, -0.05], [0.5, 0.56, 0.62, 0.68], 0.4),
  },
  grind: {
    r: H([0.06, -0.2, -0.43], [1.05, 0.1, -1.3], [-0.2, 0, 0], [0.9, 0.95, 0.95, 0.95], 0.85),
    l: H([-0.07, -0.33, -0.44], [0.25, -0.2, 2.7], [0.0, 0, 0], [0.55, 0.55, 0.55, 0.55], 0.25),
    both: [0, -0.34, -0.46],
  },
  spray: {
    r: H([0.15, -0.3, -0.38], [0.22, 0.12, -0.25], [-0.1, 0, 0], [0.82, 0.88, 0.9, 0.9], 0.6),
    l: H([-0.06, -0.2, -0.5], [0.45, -0.05, 1.45], [-0.15, 0, 0], [0.88, 0.92, 0.94, 0.95], 0.8),
    aim: [-0.12, 0.0, 0], aimW: 1, aimSide: 'l',
  },
};
for (const k of Object.keys(POSES)) {
  const P = POSES[k];
  if (!P.l) {
    const r = P.r;
    P.l = H([-r.p[0], r.p[1], r.p[2]], [r.r[0], -r.r[1], -r.r[2]], [r.w[0], -r.w[1], -r.w[2]], r.c.slice(), r.t);
  }
  P.lock = P.lock || 0;
  P.both = P.both || [0, -0.22, -0.52];
}
export const POSE_NAMES = Object.keys(POSES);

// flattened pose vector: per hand 3 p + 3 r + 3 w + 4 c + 1 t = 14; ×2 + 3 both + 1 lock = 32
const HAND_N = 14;
function flatten(P) {
  const v = new Float32Array(32);
  SIDES.forEach((s, i) => {
    const h = P[s], o = i * HAND_N;
    v.set(h.p, o); v.set(h.r, o + 3); v.set(h.w, o + 6); v.set(h.c, o + 9); v[o + 13] = h.t;
  });
  v.set(P.both, 28); v[31] = P.lock;
  return v;
}
const FLAT = Object.fromEntries(POSE_NAMES.map((n) => [n, flatten(POSES[n])]));

// ── geometry ─────────────────────────────────────────────────────────────────
function buildHandsMesh(gloves) {
  const G = HAND_STYLE[0], B = HAND_STYLE[1];
  const st = gloves ? G : { ...G, base: B.base, dorsal: B.dorsal, palm: B.palm, side: B.side, knuckle: B.knuckle, nail: B.nail, gloveRim: null };
  const S = 1.08;                                  // hand size (FP hands read better a bit big)
  const gl = gloves ? 0.0008 : 0;
  const k = new Kit(907);
  const rig = new Rig();
  const tone = (th) => { const s = Math.sin(th); return s > 0.35 ? st.dorsal : s < -0.35 ? st.palm : st.side; };
  const handCol = (i, part, th) => (part === 'capB' && st.nail && Math.sin(th) > 0.2 ? st.nail : tone(th));

  for (const side of SIDES) {
    const s = SGN[side];
    const W = [s * BIND_X, 0, 0];
    const P = (x, y, z) => new V3(W[0] + s * x * S, W[1] + y * S, W[2] + z * S);
    const fore = rig.add('fore_' + side, W);
    const hand = rig.add('hand_' + side, W, 'fore_' + side);

    // ── forearm: wrist of the glove, rolled rim, elastic suit cuff, sleeve (bone fore) ──
    k.withBone(fore, () => {
      const sl = (i, part, th) => (Math.sin(th) > 0.5 ? st.sleeveL : Math.sin(th) < -0.4 ? st.sleeveD : st.sleeve);
      const wristCol = (i, part, th) => (Math.sin(th) > 0.35 ? st.dorsal : Math.sin(th) < -0.35 ? st.palm : st.base);
      limb(k, wristCol, P(0, 0.001, -0.008), P(0, 0.002, 0.058), [0.0292 * S + gl, 0.0172 * S + gl], [0.0305 * S + gl, 0.0212 * S + gl], { seg: 8, rot: Math.PI / 8 });
      if (st.gloveRim) limb(k, st.gloveRim, P(0, 0.002, 0.052), P(0, 0.002, 0.064), [0.0335 * S, 0.0245 * S], [0.0335 * S, 0.0245 * S], { seg: 8, rot: Math.PI / 8 });
      for (let i = 0; i < 3; i++) {
        const a = 0.063 + i * 0.011;
        limb(k, st.cuffBand[i % 2], P(0, 0.002, a), P(0, 0.002, a + 0.011), [0.0352 * S + (i % 2) * 0.0016, 0.0282 * S + (i % 2) * 0.0016], [0.0362 * S - (i % 2) * 0.001, 0.0292 * S - (i % 2) * 0.001], { seg: 8, rot: Math.PI / 8 });
      }
      limb(k, sl, P(0, 0.002, 0.096), P(0, 0.003, 0.2), [0.04 * S, 0.034 * S], [0.047 * S, 0.041 * S], { seg: 10 });
      limb(k, st.sleeveD, P(0, 0.003, 0.2), P(0, 0.003, 0.214), [0.047 * S, 0.041 * S], [0.049 * S, 0.0428 * S], { seg: 10 });
      limb(k, sl, P(0, 0.003, 0.214), P(0, 0.004, 0.46), [0.049 * S, 0.0428 * S], [0.056 * S, 0.05 * S], { seg: 10 });
      // seam stripe along the top of the sleeve
      limb(k, st.seam, P(0, 0.04, 0.11), P(0, 0.05, 0.44), [0.003, 0.0016], [0.003, 0.0016], { seg: 4 });
    });

    // ── palm + thenar (bone hand) ──
    k.withBone(hand, () => {
      limb(k, handCol, P(0, 0.0, -0.002), P(0, 0.001, -0.05), [0.03 * S + gl, 0.0155 * S + gl], [0.039 * S + gl, 0.0148 * S + gl], { seg: 8, rot: Math.PI / 8, extA: 0.006 });
      limb(k, handCol, P(0, 0.001, -0.05), P(0.0005, 0.002, -0.088), [0.039 * S + gl, 0.0148 * S + gl], [0.0405 * S + gl, 0.0122 * S + gl], { seg: 8, rot: Math.PI / 8, capB: 0.004 });
      // knuckle ridge on the back of the hand
      for (const f of FINGERS) {
        const c = P(f.x, 0.0105, f.z + 0.006);
        limb(k, st.knuckle, c.clone().add(new V3(-0.0055 * S, 0, 0)), c.clone().add(new V3(0.0055 * S, 0, 0)), [0.0035 * S, 0.003 * S], [0.0035 * S, 0.003 * S], { seg: 5, capA: 0.002, capB: 0.002 });
      }
      // thenar pad (the thumb's fleshy base under the palm)
      limb(k, handCol, P(-0.012, -0.004, -0.008), P(THUMB0[0], THUMB0[1], THUMB0[2] - 0.004), [0.019 * S + gl, 0.0125 * S + gl], [0.0145 * S + gl, 0.0118 * S + gl], { seg: 7, extA: 0.004, extB: 0.004, up: [0, 1, 0] });
    });

    // ── fingers: 2 bones each (proximal, then middle+distal) ──
    FINGERS.forEach((f, fi) => {
      const dir = new V3(f.sp, -0.02, -1).normalize();
      const kn = P(f.x, 0.001, f.z);
      const j1 = P(f.x + f.sp * f.l1, 0.001 - 0.02 * f.l1, f.z - f.l1);
      const tip = P(f.x + f.sp * (f.l1 + f.l2), 0.001 - 0.02 * (f.l1 + f.l2), f.z - f.l1 - f.l2);
      const b1 = rig.add(`f${fi}a_${side}`, kn.toArray(), 'hand_' + side);
      const b2 = rig.add(`f${fi}b_${side}`, j1.toArray(), `f${fi}a_${side}`);
      const rw = f.r[0] * S * 1.16 + gl, rh = f.r[1] * S * 1.2 + gl;
      k.withBone(b1, () => limb(k, handCol, kn, j1, [rw, rh], [rw * 0.95, rh * 0.94], { seg: 6, rot: Math.PI / 6, extA: 0.008, extB: rw * 0.55, up: [0, 1, 0] }));
      k.withBone(b2, () => limb(k, handCol, j1, tip, [rw * 0.94, rh * 0.93], [rw * 0.8, rh * 0.76], { seg: 6, rot: Math.PI / 6, extA: rw * 0.35, capB: rh * 0.85, up: [0, 1, 0] }));
      void dir;
    });

    // ── thumb: 2 bones ──
    const t0p = P(THUMB0[0], THUMB0[1], THUMB0[2]);
    const td = new V3(s * THUMB_DIR.x, THUMB_DIR.y, THUMB_DIR.z);
    const t1p = t0p.clone().addScaledVector(td, 0.042 * S);
    const ttip = t1p.clone().addScaledVector(td, 0.034 * S);
    const t0 = rig.add('t0_' + side, t0p.toArray(), 'hand_' + side);
    const t1 = rig.add('t1_' + side, t1p.toArray(), 't0_' + side);
    k.withBone(t0, () => limb(k, handCol, t0p, t1p, [0.0128 * S + gl, 0.0112 * S + gl], [0.0112 * S + gl, 0.0098 * S + gl], { seg: 6, extA: 0.006, extB: 0.005, up: [0, 1, 0] }));
    k.withBone(t1, () => limb(k, handCol, t1p, ttip, [0.0108 * S + gl, 0.0095 * S + gl], [0.0092 * S + gl, 0.008 * S + gl], { seg: 6, extA: 0.003, capB: 0.007 * S, up: [0, 1, 0] }));
  }
  return { k, rig };
}

function makeMaterial(gloves, overlay) {
  const m = new THREE.MeshPhongMaterial({
    vertexColors: true, shininess: gloves ? 34 : 10, specular: gloves ? 0x2b3a52 : 0x161616, emissive: 0x0c1018, name: 'CR_FpHands',
  });
  if (overlay) { m.transparent = true; m.opacity = 1; m.depthWrite = true; }
  return m;
}

// ── helpers ──────────────────────────────────────────────────────────────────
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _v = new V3();
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (t) => t * t * (3 - 2 * t);

/**
 * @param {{ gloves?: boolean, overlay?: boolean }} o
 */
export function createFpHands({ gloves = true, overlay = true } = {}) {
  const root = new THREE.Group();
  root.name = 'fp_hands';
  const inner = new THREE.Group();           // body-lock + sway/bob offsets live here
  inner.name = 'fp_hands_inner';
  inner.rotation.order = 'XYZ';              // = inverse of the camera's YXZ (yaw, then pitch)
  root.add(inner);

  const { k, rig } = buildHandsMesh(gloves);
  const material = makeMaterial(gloves, overlay);
  const holder = new THREE.Group();
  inner.add(holder);
  const { mesh, bones } = rig.build(holder, k, 'fp_hands_mesh', material);
  // rig.build baked flat normals; smooth them (glove sheen) with a crease
  smoothNormals(mesh.geometry, 58);
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  if (overlay) {
    mesh.renderOrder = OVERLAY_ORDER;
    mesh.onBeforeRender = (renderer) => { renderer.clearDepth(); };
  }

  // per-side bone sets, bind positions (relative to their parent)
  const B = {};
  for (const s of SIDES) {
    B[s] = {
      fore: bones['fore_' + s], hand: bones['hand_' + s],
      fa: [0, 1, 2, 3].map((i) => bones[`f${i}a_${s}`]), fb: [0, 1, 2, 3].map((i) => bones[`f${i}b_${s}`]),
      t0: bones['t0_' + s], t1: bones['t1_' + s],
    };
    for (const b of [B[s].fore, B[s].hand]) b.rotation.order = 'YXZ';
  }

  // sockets (children of inner; placed every frame)
  const sockets = { r: new THREE.Group(), l: new THREE.Group(), both: new THREE.Group() };
  for (const [n, g] of Object.entries(sockets)) { g.name = 'fp_socket_' + n; inner.add(g); }

  // pose state
  let poseName = 'idle';
  const cur = FLAT.idle.slice();
  let from = cur.slice(), to = FLAT.idle, bt = 1, bdur = 0.2;
  const live = new Float32Array(32);
  let time = 0, walkPhase = 0, walkAmt = 0;
  const swayS = { x: 0, y: 0, vx: 0, vy: 0 };
  let grindPhase = 0;
  const reachT = { r: -1, l: -1 }, reachDur = { r: 0.42, l: 0.42 };
  let actS = 0, act2S = 0;
  const held = { r: null, l: null, both: null };
  const overlayMats = new Map();

  function setPose(name, blend = 0.2) {
    if (!FLAT[name]) { console.warn('[fpHands] unknown pose', name); return; }
    if (name === poseName && bt >= 1) return;
    poseName = name;
    from = cur.slice(); to = FLAT[name]; bt = 0; bdur = Math.max(0.001, blend);
  }

  function reach(side = 'r', dur = 0.42) { reachT[side] = 0; reachDur[side] = dur; }

  function applyHand(side, v, o) {
    const b = B[side], s = SGN[side];
    b.fore.position.set(v[o], v[o + 1], v[o + 2]);
    b.fore.rotation.set(v[o + 3], v[o + 4], v[o + 5], 'YXZ');
    b.hand.position.set(0, 0, 0);
    b.hand.rotation.set(v[o + 6], v[o + 7], v[o + 8], 'YXZ');
    for (let i = 0; i < 4; i++) {
      const c = clamp(v[o + 9 + i], -0.2, 1.1);
      b.fa[i].rotation.set(-c * 1.42, 0, 0);
      b.fb[i].rotation.set(-Math.min(1, c * 1.25) * 1.62, 0, 0);
    }
    const t = clamp(v[o + 13], 0, 1.1);
    b.t0.rotation.set(-0.22 * t, -s * 0.62 * t, s * 0.18 * t);
    b.t1.rotation.set(-0.15 * t, -s * 0.85 * t, 0);
  }

  // the fore bone was bound at (±BIND_X, 0, 0): pose positions are absolute wrist positions, so offset the
  // bone by its bind position (bones are children of `holder`, which sits at the origin).
  function wristFix() { /* positions set absolutely in applyHand; bind offset handled by the skeleton */ }
  void wristFix;

  function overlayize(obj, on) {
    obj.traverse((o) => {
      if (!o.isMesh && !o.isLine && !o.isPoints) return;
      if (on) {
        if (!overlay) return;
        if (o.userData._fpOrigMat === undefined) o.userData._fpOrigMat = o.material;
        o.userData._fpOrigOrder = o.renderOrder; o.userData._fpOrigCull = o.frustumCulled;
        const conv = (m) => {
          let c = overlayMats.get(m);
          if (!c) { c = m.clone(); c.transparent = true; c.depthWrite = true; c.depthTest = true; if (c.opacity === undefined) c.opacity = 1; overlayMats.set(m, c); }
          return c;
        };
        o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
        o.renderOrder = OVERLAY_ORDER + 1; o.frustumCulled = false;
      } else if (o.userData._fpOrigMat !== undefined) {
        o.material = o.userData._fpOrigMat; o.renderOrder = o.userData._fpOrigOrder ?? 0; o.frustumCulled = o.userData._fpOrigCull ?? true;
        delete o.userData._fpOrigMat; delete o.userData._fpOrigOrder; delete o.userData._fpOrigCull;
      }
    });
  }

  /** Put obj in a socket ('r' | 'l' | 'both'); null releases what that socket held (it is detached, materials restored). */
  function hold(obj, side = 'r', place = {}) {
    if (side !== 'l' && side !== 'both') side = 'r';
    const prev = held[side];
    if (prev && prev !== obj) { overlayize(prev, false); prev.parent === sockets[side] && sockets[side].remove(prev); }
    held[side] = obj || null;
    if (!obj) return;
    sockets[side].add(obj);
    const p = place.pos || [0, 0, 0], r = place.rot || [0, 0, 0];
    obj.position.set(p[0], p[1], p[2]); obj.rotation.set(r[0], r[1], r[2]);
    overlayize(obj, true);
  }

  const _gq = new THREE.Quaternion(), _aq = new THREE.Quaternion();
  function placeSockets(v) {
    holder.updateMatrix();
    for (const side of SIDES) {
      const b = B[side], s = SGN[side];
      b.fore.updateMatrix(); b.hand.updateMatrix();
      _m.multiplyMatrices(b.fore.matrix, b.hand.matrix);
      _v.set(s * GRIP_LOCAL.x, GRIP_LOCAL.y, GRIP_LOCAL.z).applyMatrix4(_m);
      // the skeleton positions are absolute (bind offset cancels): wrist pose p == bone position
      sockets[side].position.copy(_v);
      _gq.setFromRotationMatrix(_m);
      const P = POSES[poseName];
      const aimSide = P.aimSide || 'r';
      if (P.aim && side === aimSide) {
        _e.set(P.aim[0], P.aim[1], P.aim[2], 'YXZ'); _aq.setFromEuler(_e);
        _gq.slerp(_aq, P.aimW ?? 1);
      }
      sockets[side].quaternion.copy(_gq);
    }
    sockets.both.position.set(v[28], v[29], v[30]);
    sockets.both.quaternion.identity();
  }

  /**
   * @param {number} dt
   * @param {{ walk?: number, sway?: number|{x:number,y:number}, act?: number, act2?: number, pitch?: number, yaw?: number }} o
   *   pitch: camera pitch (rad); yaw: the look's yaw offset from the body/seat (rad) — both cancelled for body-locked poses
   */
  function update(dt, o = {}) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    time += dt;
    // blend
    if (bt < 1) {
      bt = Math.min(1, bt + dt / bdur);
      const kq = smooth(bt);
      for (let i = 0; i < 32; i++) cur[i] = from[i] + (to[i] - from[i]) * kq;
    } else cur.set(to);
    live.set(cur);

    const act = o.act ?? 0, act2 = o.act2 ?? 0;
    actS += (act - actS) * Math.min(1, dt * 14);
    act2S += (act2 - act2S) * Math.min(1, dt * 14);
    const R = 0, L = HAND_N;

    // pose-specific live motion
    switch (poseName) {
      case 'grab': {
        const c = actS;
        for (let i = 0; i < 4; i++) live[R + 9 + i] += (0.95 - live[R + 9 + i]) * c;
        live[R + 13] += (0.85 - live[R + 13]) * c;
        break;
      }
      case 'pump': live[R + 9] = 0.35 + 0.6 * clamp(actS, 0, 1); break;     // trigger finger
      case 'spray': { const sq = clamp(actS, 0, 1); for (let i = 0; i < 4; i++) live[R + 9 + i] += 0.12 * sq; live[R + 6] -= 0.06 * sq; live[L + 0] += Math.sin(time * 31) * 0.002 * sq; live[L + 1] += Math.sin(time * 27) * 0.002 * sq; break; }
      case 'lever': {
        const a = clamp(actS, -1, 1), b2 = clamp(act2S, -1, 1);
        live[R + 2] -= a * 0.055; live[R + 1] += Math.abs(a) * 0.006; live[R + 3] += a * 0.32;
        live[L + 2] -= b2 * 0.055; live[L + 1] += Math.abs(b2) * 0.006; live[L + 3] += b2 * 0.32;
        break;
      }
      case 'pour': { const a = clamp(actS, 0, 1); live[R + 5] -= a * 1.05; live[R + 1] += a * 0.035; live[R + 0] -= a * 0.03; break; }
      case 'grind': {
        grindPhase += dt * (2.5 + 7 * clamp(actS, 0, 1));
        live[R + 0] += Math.cos(grindPhase) * 0.022; live[R + 2] += Math.sin(grindPhase) * 0.016;
        live[R + 4] += Math.cos(grindPhase) * 0.08;
        break;
      }
      case 'torch': live[R + 1] += Math.sin(time * 1.7) * 0.002; break;
      default: break;
    }

    // one-shot reach (forward, open, close)
    for (const side of SIDES) {
      if (reachT[side] < 0) continue;
      reachT[side] += dt;
      const u = reachT[side] / reachDur[side];
      if (u >= 1) { reachT[side] = -1; continue; }
      const kk = Math.sin(Math.PI * u), o2 = side === 'r' ? R : L, s = SGN[side];
      live[o2 + 2] -= 0.12 * kk; live[o2 + 1] += 0.06 * kk; live[o2 + 0] -= s * 0.04 * kk; live[o2 + 3] -= 0.15 * kk;
      const close = u < 0.5 ? -0.6 * Math.sin(Math.PI * u * 2) * 0.5 : 0.5 * Math.sin(Math.PI * (u - 0.5) * 2);
      for (let i = 0; i < 4; i++) live[o2 + 9 + i] = clamp(live[o2 + 9 + i] + close, 0, 1);
    }

    // walk bob (carry bobs harder, levers barely)
    const w = clamp(o.walk ?? 0, 0, 1.6);
    walkAmt += (w - walkAmt) * Math.min(1, dt * 6);
    walkPhase += dt * (5.5 + 4.5 * walkAmt) * (walkAmt > 0.02 ? 1 : 0);
    const bobK = poseName === 'carry' ? 1.6 : poseName === 'lever' ? 0.15 : poseName === 'push' ? 0.5 : 1;
    const bx = Math.sin(walkPhase) * 0.009 * walkAmt * bobK;
    const by = -Math.abs(Math.cos(walkPhase)) * 0.013 * walkAmt * bobK + Math.sin(time * 1.6) * 0.0018;
    for (const o2 of [R, L]) { live[o2] += bx; live[o2 + 1] += by; }
    live[28] += bx; live[29] += by;

    // sway: hands lag behind the look (spring)
    const sw = o.sway ?? 0;
    const sx = typeof sw === 'number' ? sw : (sw.x ?? 0), sy = typeof sw === 'number' ? 0 : (sw.y ?? 0);
    const tx = clamp(-sx * 0.012, -0.035, 0.035), ty = clamp(sy * 0.01, -0.03, 0.03);
    swayS.vx += ((tx - swayS.x) * 90 - swayS.vx * 14) * dt; swayS.x += swayS.vx * dt;
    swayS.vy += ((ty - swayS.y) * 90 - swayS.vy * 14) * dt; swayS.y += swayS.vy * dt;
    inner.position.set(swayS.x, swayS.y, 0);
    inner.rotation.z = -swayS.x * 1.2;

    // body lock: counter-rotate the camera pitch (and a seated look yaw) for push / lever poses
    const lock = live[31];
    inner.rotation.x = -(o.pitch ?? 0) * lock;
    inner.rotation.y = -(o.yaw ?? 0) * lock;

    applyHand('r', live, R);
    applyHand('l', live, L);
    placeSockets(live);
  }

  function dispose() {
    for (const s of ['r', 'l', 'both']) if (held[s]) hold(null, s);
    root.parent?.remove(root);
    mesh.geometry.dispose(); material.dispose();
    for (const m of overlayMats.values()) m.dispose();
    overlayMats.clear();
  }

  // the Rig positions bones relative to their parents from bind (model-space) positions; fore bones were bound at
  // (±BIND_X, 0, 0) so setting fore.position = wrist pose p places the wrist exactly at p.
  update(0, {});

  return {
    root, mesh, bones, sockets, material,
    setPose, update, hold, reach, dispose,
    get pose() { return poseName; },
    get held() { return { ...held }; },
    /** world-space position of a hand's grip point (e.g. to test what the hand touches) */
    gripWorld(side = 'r', out = new V3()) { root.updateWorldMatrix(true, true); return sockets[side === 'l' ? 'l' : side === 'both' ? 'both' : 'r'].getWorldPosition(out); },
  };
}
