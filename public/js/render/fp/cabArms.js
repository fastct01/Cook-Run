// ─────────────────────────────────────────────────────────────────────────────
// Rook's first-person arms: flannel sleeves, cuffs, forearms and hands that GRIP the steering wheel.
//
//   const arms = new CabArms(frame, { mount, rimRadius, skin });   // frame = rv_frame, mount = wheel_mount
//   arms.update(dt, { wheel, eye, horn, gear, bump, time })        // every frame (cab visible)
//   arms.dispose()
//
// One mesh, one draw call, CPU-skinned every frame (≈1.4k vertices): eight rigid "pieces"
// (upper arm, forearm, hand, fingers × 2) whose faces stretch across the joints, so the wrist and
// the elbow bend smoothly without bones/skinning shaders.
// • Hands sit on the rim at ~9:30 / 2:30, fingers wrapped round the far side of the rim, thumbs on
//   the near face. Push-pull ("shuffle") steering: a gripping hand rides the rim with the wheel but
//   never leaves its own side (REACH_LIM: never over the top, never past the bottom), so a forearm
//   can't swing up across the windscreen. At its limit the rim slides through the hand, and a hand
//   that stays pinned lets go and re-grabs at home on its own side while the other keeps hold.
// • Two-bone IK from the shoulders (which follow the eye: lean, bob) to the wrists; elbows hang
//   down and out. The shoulder leans in when the reach is too long.
// • Horn (snap.rv.horn): the right hand slaps the horn pad. Drive ⇄ reverse: the right hand reaches
//   to the column shifter for a moment.
// Frames: everything is computed in rv_frame (RV-local) coordinates; the wheel mount's local +Z
// runs down the column into the dash (away from Rook), +X = Rook's left, +Y = up the wheel face.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { linear, shade } from '../../assets/palette.js';
import { plaidAtlasTexture } from '../textures.js';
import { patchFill } from './cabMaterials.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// ── proportions (metres) ───────────────────────────────────────────────────
const UPPER = 0.285, FORE = 0.255;
const HOME = 1.2;                           // grip angle from the top of the rim (rad): ~9:40 / 2:20
const REACH_LIM = [0.45, 2.45];             // LEFT hand's own side of the rim (mount angle, 0 = top); right = mirrored
const PIECES = 8;                           // L: 0 upper, 1 fore, 2 hand, 3 fingers · R: 4..7
// hand (canonical LEFT hand at 9 o'clock: rim tube along +Y, +X = outward, +Z = toward the dash)
const TUBE = 0.0175;
const HAND_C = new THREE.Vector3(0.027, 0.0, -0.046);
const HAND_A = new THREE.Vector3(0.2, 0, -0.98).normalize();            // knuckles → wrist
const HAND_N = new THREE.Vector3(0.98, 0, 0.2).normalize();             // back of the hand (outward)
const WRIST = HAND_C.clone().addScaledVector(HAND_A, 0.066);            // forearm starts here
const KNUCK = (() => { const p = 0.037, a = -0.32; return new THREE.Vector3(Math.cos(a) * p, 0, Math.sin(a) * p); })();

const C_SKIN = '#d9a77d';
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// ── geometry builder: vertices are stored in their piece's local space ────
class PieceBuilder {
  constructor() { this.piece = []; this.p = []; this.n = []; this.c = []; this.uv = []; this.idx = []; }
  get count() { return this.piece.length; }
  vert(piece, p, n, col, uv) {
    this.piece.push(piece); this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z);
    this.c.push(col.r, col.g, col.b); this.uv.push(uv[0], uv[1]);
    return this.piece.length - 1;
  }
  /** Indexed (smooth) geometry, placed by matrix m, one colour, all on one UV texel. */
  geo(piece, g, m, color, uv = SKIN_UV) {
    const col = typeof color === 'string' ? linear(color) : color;
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const pos = g.attributes.position, nor = g.attributes.normal;
    const base = this.count;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(m);
      _v2.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      this.vert(piece, _v, _v2, col, uv);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i));
    else for (let i = 0; i < pos.count; i++) this.idx.push(base + i);
    return this;
  }
  /** Capsule between two points (piece-local). */
  bone(piece, a, b, r, color, seg = 6) {
    const d = _v3.subVectors(b, a); const len = Math.max(0.001, d.length());
    const g = new THREE.CapsuleGeometry(r, len, 1, seg);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
    const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    this.geo(piece, g, m, color);
    g.dispose();
    return this;
  }
  /** Rounded box ("superellipsoid") with half sizes h, placed by matrix m. */
  pad(piece, h, m, color, k = 0.5) {
    const g = new THREE.SphereGeometry(1, 10, 7);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const f = (x) => Math.sign(x) * Math.pow(Math.abs(x), k);
      p.setXYZ(i, f(p.getX(i)) * h[0], f(p.getY(i)) * h[1], f(p.getZ(i)) * h[2]);
    }
    g.computeVertexNormals();
    this.geo(piece, g, m, color);
    g.dispose();
    return this;
  }
  /**
   * Tube through rings: [{ piece, c, ax, az, rx, rz, col, v, uv? }] (c / ax / az in the ring's
   * piece-local space). Plaid UV wraps u round the ring; rings flagged `skin` use the flat texel.
   */
  tube(rings, seg = 10) {
    let prev = null;
    for (const R of rings) {
      const col = linear(R.col);
      const row = [];
      for (let i = 0; i <= seg; i++) {
        const t = (i / seg) * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
        const p = R.c.clone().addScaledVector(R.ax, ct * R.rx).addScaledVector(R.az, st * R.rz);
        const n = R.ax.clone().multiplyScalar(ct / R.rx).addScaledVector(R.az, st / R.rz).normalize();
        const uv = R.plain ? SKIN_UV : [0.012 + (i / seg) * 0.72, R.v];
        row.push(this.vert(R.piece, p, n, col, uv));
      }
      if (prev && !R.restart) {
        for (let i = 0; i < seg; i++) {
          const a = prev[i], b = prev[i + 1], c = row[i + 1], d = row[i];
          this.idx.push(a, b, d, b, c, d);
        }
      }
      prev = row;
    }
    return this;
  }
  /** Append another builder mirrored in X (piece offset added), with the winding flipped. */
  mirrorFrom(src, pieceOffset) {
    const base = this.count;
    for (let i = 0; i < src.count; i++) {
      this.piece.push(src.piece[i] + pieceOffset);
      this.p.push(-src.p[i * 3], src.p[i * 3 + 1], src.p[i * 3 + 2]);
      this.n.push(-src.n[i * 3], src.n[i * 3 + 1], src.n[i * 3 + 2]);
      this.c.push(src.c[i * 3], src.c[i * 3 + 1], src.c[i * 3 + 2]);
      this.uv.push(src.uv[i * 2], src.uv[i * 2 + 1]);
    }
    for (let i = 0; i < src.idx.length; i += 3) this.idx.push(base + src.idx[i], base + src.idx[i + 2], base + src.idx[i + 1]);
  }
  append(src) {
    const base = this.count;
    for (let i = 0; i < src.count; i++) {
      this.piece.push(src.piece[i]);
      for (let k = 0; k < 3; k++) { this.p.push(src.p[i * 3 + k]); this.n.push(src.n[i * 3 + k]); this.c.push(src.c[i * 3 + k]); }
      this.uv.push(src.uv[i * 2], src.uv[i * 2 + 1]);
    }
    for (const i of src.idx) this.idx.push(base + i);
  }
}
const SKIN_UV = [0.875, 0.5];

/** LEFT arm in piece-local spaces (pieces 0 upper, 1 fore, 2 hand, 3 fingers). */
function buildLeftArm(skin) {
  const b = new PieceBuilder();
  const knuck = shade(skin, 0.92), nail = '#ecc9b0', palmD = shade(skin, 0.95);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // ── hand block (back of the hand + palm), rounded ──
  const hb = new THREE.Matrix4().makeBasis(HAND_N, UP, HAND_A.clone().negate()).setPosition(HAND_C);
  b.pad(2, [0.0135, 0.04, 0.044], hb, skin, 0.42);
  // heel of the palm / thenar pad (under the thumb, on the near face of the rim)
  b.pad(2, [0.012, 0.016, 0.026], new THREE.Matrix4().makeBasis(HAND_N, UP, HAND_A.clone().negate()).setPosition(V(0.012, 0.024, -0.058)), palmD, 0.6);
  // ── fingers wrapped round the rim (index at the top, +Y) ──
  const FING = [[0.028, 0.0094, 1.0], [0.0095, 0.0098, 1.07], [-0.0095, 0.0093, 1.0], [-0.0275, 0.0083, 0.86]];
  for (const [y, r, L] of FING) {
    const rho = TUBE + r + 0.0008;
    const P = (ang, rr) => V(Math.cos(ang) * rr, y, Math.sin(ang) * rr);
    const mcp = V(KNUCK.x, y, KNUCK.z);
    const pip = P(1.18, rho), dip = P(1.18 + 1.12 * L, rho), tip = P(1.18 + 1.12 * L + 0.86 * L, rho * 0.98);
    b.bone(3, mcp, pip, r * 1.04, knuck);
    b.bone(3, pip, dip, r * 0.98, skin);
    b.bone(3, dip, tip, r * 0.9, skin);
  }
  // knuckle ridge (the row the fingers hinge on)
  b.bone(2, V(KNUCK.x + 0.002, 0.032, KNUCK.z - 0.002), V(KNUCK.x + 0.002, -0.03, KNUCK.z - 0.002), 0.0105, knuck);
  // ── thumb: along the near face of the rim, pointing in toward the hub ──
  const cmc = V(0.02, 0.03, -0.068), tmcp = V(0.002, 0.042, -0.042), tip1 = V(-0.019, 0.045, -0.033), ttip = V(-0.04, 0.041, -0.03);
  b.bone(2, cmc, tmcp, 0.0128, skin);
  b.bone(2, tmcp, tip1, 0.0112, skin);
  b.bone(2, tip1, ttip, 0.0098, skin);
  b.pad(2, [0.0062, 0.0048, 0.0018], new THREE.Matrix4().makeBasis(V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)).setPosition(V(-0.034, 0.0415, -0.0392)), nail, 0.6);
  // ── wrist (hand piece) → forearm skin → cuff → sleeve → upper arm sleeve ──
  const wn = HAND_N, wa = HAND_A;
  const cuff = '#c8b4b0', sleeve = '#ffffff', fz = V(0, 0, -1);   // forearm local: +Y to the elbow, X = hand width, −Z = back of the hand
  // forearm-local ring axes: X = hand width, Z = thickness (see CabArms._pose)
  const rings = [
    { piece: 2, c: WRIST.clone().addScaledVector(wa, -0.02), ax: UP, az: wn, rx: 0.033, rz: 0.0145, col: skin, plain: true },
    { piece: 2, c: WRIST.clone(), ax: UP, az: wn, rx: 0.029, rz: 0.0165, col: skin, plain: true },
    { piece: 1, c: V(0, 0.018, 0), ax: V(1, 0, 0), az: fz, rx: 0.027, rz: 0.02, col: skin, plain: true },
    { piece: 1, c: V(0, 0.036, 0), ax: V(1, 0, 0), az: fz, rx: 0.0285, rz: 0.0225, col: skin, plain: true },
    // cuff: an annulus facing the hand, then the cuff band (plaid, darker), button-line seam
    { piece: 1, c: V(0, 0.034, 0), ax: V(1, 0, 0), az: fz, rx: 0.029, rz: 0.023, col: cuff, v: 0.0, restart: true },
    { piece: 1, c: V(0, 0.036, 0), ax: V(1, 0, 0), az: fz, rx: 0.041, rz: 0.035, col: cuff, v: 0.03 },
    { piece: 1, c: V(0, 0.088, 0), ax: V(1, 0, 0), az: fz, rx: 0.042, rz: 0.036, col: cuff, v: 0.36 },
    { piece: 1, c: V(0, 0.083, 0), ax: V(1, 0, 0), az: fz, rx: 0.0465, rz: 0.0405, col: sleeve, v: 0.35, restart: true },
    { piece: 1, c: V(0, 0.16, 0), ax: V(1, 0, 0), az: fz, rx: 0.05, rz: 0.045, col: sleeve, v: 0.82 },
    { piece: 1, c: V(0, 0.23, 0), ax: V(1, 0, 0), az: fz, rx: 0.052, rz: 0.049, col: sleeve, v: 1.25 },
    { piece: 1, c: V(0, FORE + 0.012, 0), ax: V(1, 0, 0), az: fz, rx: 0.052, rz: 0.052, col: sleeve, v: 1.42 },
    { piece: 0, c: V(0, 0.03, 0), ax: V(1, 0, 0), az: fz, rx: 0.054, rz: 0.053, col: sleeve, v: 1.62 },
    { piece: 0, c: V(0, 0.15, 0), ax: V(1, 0, 0), az: fz, rx: 0.058, rz: 0.056, col: sleeve, v: 2.35 },
    { piece: 0, c: V(0, UPPER + 0.02, 0), ax: V(1, 0, 0), az: fz, rx: 0.062, rz: 0.058, col: sleeve, v: 3.2 },
    { piece: 0, c: V(0, UPPER + 0.06, 0), ax: V(1, 0, 0), az: fz, rx: 0.04, rz: 0.036, col: sleeve, v: 3.4 },
    { piece: 0, c: V(0, UPPER + 0.075, 0), ax: V(1, 0, 0), az: fz, rx: 0.004, rz: 0.004, col: sleeve, v: 3.5 },
  ];
  b.tube(rings, 12);
  // cuff seam + button (on the thumb side of the cuff)
  b.pad(1, [0.0035, 0.0035, 0.0018], new THREE.Matrix4().makeBasis(V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)).setPosition(V(0.012, 0.06, -0.0355)), '#a99c86', 0.7);
  return b;
}

export class CabArms {
  constructor(frame, { mount, rimRadius = 0.205, skin = C_SKIN, shifter = null } = {}) {
    this.frame = frame;
    this.mount = mount;
    this.R = rimRadius;
    this.shifter = shifter ? new THREE.Vector3(...shifter) : new THREE.Vector3(-0.27, 0.08, 0.075);   // knob, mount-local
    const left = buildLeftArm(skin);
    const all = new PieceBuilder();
    all.append(left);
    all.mirrorFrom(left, 4);
    this.n = all.count;
    this.piece = Uint8Array.from(all.piece);
    this.lp = Float32Array.from(all.p);
    this.ln = Float32Array.from(all.n);
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(this.n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.nor = new THREE.BufferAttribute(new Float32Array(this.n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos);
    g.setAttribute('normal', this.nor);
    g.setAttribute('color', new THREE.Float32BufferAttribute(all.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(all.uv, 2));
    g.setIndex(all.idx);
    this.tris = all.idx.length / 3;
    const map = typeof document !== 'undefined' ? plaidAtlasTexture() : null;
    this.mat = patchFill(new THREE.MeshLambertMaterial({ vertexColors: true, map, name: 'CR_FpArms' }), 'arms');
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.name = 'fp_arms';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false; this.mesh.receiveShadow = false;
    frame.add(this.mesh);
    this.mats = Array.from({ length: PIECES }, () => new THREE.Matrix4());
    this.nmats = Array.from({ length: PIECES }, () => new THREE.Matrix3());
    // hand state: side +1 = left (Rook's left is +X), −1 = right
    this.hands = [1, -1].map((s) => ({
      s, home: s * HOME, g: s * HOME, mode: 'grip', regrip: false, t: 1, T: 0.3,
      from: { p: new THREE.Vector3(), q: new THREE.Quaternion(), open: 0 },
      cur: { p: new THREE.Vector3(), q: new THREE.Quaternion(), open: 0 },
      calm: 0, busy: 0,
    }));
    this.prevWheel = 0; this.wheelVel = 0; this.time = 0;
    this.prevGear = 1; this.shiftT = 0;
    this.elbow = [new THREE.Vector3(), new THREE.Vector3()];
    this.first = true;
  }

  // ── poses (rv_frame space) ───────────────────────────────────────────────
  /** Grip at mount angle a (0 = top of the rim, + toward Rook's left), rolled β about the rim. */
  _gripPose(h, a, out) {
    const s = h.s, R = this.R;
    _m.makeRotationZ(s > 0 ? Math.PI / 2 - a : -Math.PI / 2 - a);
    _m2.makeTranslation(s * R, 0, 0);
    _m.multiply(_m2);
    _m.premultiply(this.mount.matrix);
    _m.decompose(out.p, out.q, _v);
    out.open = 0;
    return out;
  }
  /** Flat right hand pressing the horn pad. */
  _hornPose(h, out) {
    // local +X (palm side of the mirrored right hand) → mount +Z, fingers (+Z after opening) → up-left
    _x.set(0, 0, 1); _z.set(0.42, 0.9, 0).normalize(); _y.crossVectors(_z, _x);
    _m.makeBasis(_x, _y, _z).setPosition(0.02, 0.035, -0.017);
    _m.premultiply(this.mount.matrix);
    _m.decompose(out.p, out.q, _v);
    out.open = 1.25;
    return out;
  }
  /** Right hand round the column-shift lever knob. */
  _shiftPose(h, out) {
    const k = this.shifter;
    _y.set(-0.2, 0.055, -0.085).normalize();                    // lever axis (column → knob), mount-local
    _x.set(0, -1, 0.15); _x.addScaledVector(_y, -_x.dot(_y)).normalize();   // palm (+X of the right hand) on top of it
    _z.crossVectors(_x, _y).normalize(); _x.crossVectors(_y, _z);
    _m.makeBasis(_x, _y, _z).setPosition(k.x + 0.01, k.y, k.z);
    _m.premultiply(this.mount.matrix);
    _m.decompose(out.p, out.q, _v);
    out.open = 0.15;
    return out;
  }
  _setMode(h, mode, T) {
    h.from.p.copy(h.cur.p); h.from.q.copy(h.cur.q); h.from.open = h.cur.open;
    h.mode = mode; h.t = 0; h.T = T;
    if (mode === 'grip') h.regrip = true;
  }
  _target(h, wheel, out) {
    if (h.mode === 'horn') return this._hornPose(h, out);
    if (h.mode === 'shift') return this._shiftPose(h, out);
    return this._gripPose(h, h.regrip ? h.home : h.g - wheel, out);
  }

  /**
   * @param wheel  steering wheel rotation.z (rad, + = turning right)
   * @param eye    RV-local eye point incl. lean / bob (Vector3)
   */
  update(dt, { wheel = 0, eye, horn = false, gear = 1, bump = 0 } = {}) {
    dt = clamp(dt || 0, 0, 0.1);
    this.time += dt;
    this.mount.updateMatrix();
    const wv = dt > 0 ? (wheel - this.prevWheel) / dt : 0;
    this.wheelVel += (wv - this.wheelVel) * Math.min(1, dt * 10);
    this.prevWheel = wheel;
    const [L, Rh] = this.hands;
    // ── right hand jobs: horn, shifter ──
    const gearSign = gear < 0 ? -1 : 1;
    if (gearSign !== this.prevGear && !this.first) this.shiftT = 0.85;
    this.prevGear = gearSign;
    this.shiftT = Math.max(0, this.shiftT - dt);
    const wantR = horn ? 'horn' : this.shiftT > 0 ? 'shift' : 'grip';
    if (wantR !== Rh.mode && !(wantR === 'grip' && Rh.mode === 'grip')) {
      if (wantR !== 'grip' && L.mode === 'grip' && L.t >= L.T) this._setMode(Rh, wantR, wantR === 'horn' ? 0.13 : 0.3);
      else if (wantR === 'grip') this._setMode(Rh, 'grip', 0.24);
    }
    // ── push-pull steering: hands stay on their own side; the rim slides at the limit, then re-grip ──
    const settled = (h) => h.mode === 'grip' && h.t >= h.T;
    for (const h of this.hands) {
      if (!settled(h)) { h.pinned = 0; continue; }
      const sa = (h.g - wheel) * h.s;                       // mirrored so both read like the left hand
      const ca = clamp(sa, REACH_LIM[0], REACH_LIM[1]);
      if (ca !== sa) { h.g = ca * h.s + wheel; h.pinned = (h.pinned || 0) + dt; } else h.pinned = 0;
    }
    for (const h of this.hands) {
      const other = h === L ? Rh : L;
      if (!settled(h) || !settled(other)) { h.calm = 0; continue; }
      const a = h.g - wheel;
      h.calm = Math.abs(this.wheelVel) < 0.45 ? h.calm + dt : 0;
      const pinned = h.pinned > 0.12 && Math.abs(a - h.home) > 0.35;                       // slid to its limit: re-grip
      const away = Math.abs(wheel) < 0.4 && Math.abs(a - h.home) > 0.5 && h.calm > 0.25;   // recentred: hands back home
      if (pinned || away) { this._setMode(h, 'grip', pinned ? 0.2 : 0.3); h.pinned = 0; break; }
    }
    // ── hand poses ──
    for (const h of this.hands) {
      const tgt = this._target(h, wheel, _pose);
      if (this.first) { h.t = h.T; }
      if (h.t < h.T) {
        h.t = Math.min(h.T, h.t + dt);
        const k = smooth(h.t / h.T), arc = Math.sin(Math.PI * (h.t / h.T));
        h.cur.p.lerpVectors(h.from.p, tgt.p, k);
        h.cur.q.slerpQuaternions(h.from.q, tgt.q, k);
        h.cur.open = Math.max(tgt.open * k + h.from.open * (1 - k), arc * (h.mode === 'grip' ? 0.95 : 0.5));
        // lift off the rim toward Rook while moving between grips
        if (h.mode === 'grip' || h.from.open > 0.5) { _v.set(0, 0.25, -1).transformDirection(this.mount.matrix); h.cur.p.addScaledVector(_v, arc * 0.045); }
        if (h.t >= h.T && h.mode === 'grip' && h.regrip) { h.regrip = false; h.g = h.home + wheel; }
      } else {
        h.cur.p.copy(tgt.p); h.cur.q.copy(tgt.q); h.cur.open = tgt.open;
      }
    }
    this.first = false;
    // ── bodies: shoulders → IK → piece matrices ──
    const jit = bump * 0.004;
    for (let i = 0; i < 2; i++) {
      const h = this.hands[i], s = h.s, base = i * 4;
      const Hm = this.mats[base + 2].compose(h.cur.p, h.cur.q, _one);
      if (jit) { Hm.elements[12] += Math.sin(this.time * 53 + i) * jit; Hm.elements[13] += Math.sin(this.time * 61 + i * 2) * jit; }
      // fingers hinge on the knuckle row
      _v.set(s * KNUCK.x, 0, KNUCK.z);
      this.mats[base + 3].copy(Hm).multiply(_m.makeTranslation(_v.x, _v.y, _v.z)).multiply(_m2.makeRotationY(s * h.cur.open)).multiply(_m.makeTranslation(-_v.x, -_v.y, -_v.z));
      // wrist (frame space) and the hand's width axis
      const W = _w.set(s * WRIST.x, WRIST.y, WRIST.z).applyMatrix4(Hm);
      const hy = _hy.setFromMatrixColumn(Hm, 1);
      const S = _s.set(eye.x + s * 0.2, eye.y - 0.3, eye.z - 0.05);
      let D = W.distanceTo(S);
      const maxR = UPPER + FORE - 0.004;
      if (D > maxR) { S.lerp(W, (D - maxR) / D); D = maxR; }
      D = Math.max(D, Math.abs(UPPER - FORE) + 0.02);
      const u = _v2.subVectors(W, S).normalize();
      const along = (UPPER * UPPER - FORE * FORE + D * D) / (2 * D);
      const hh = Math.sqrt(Math.max(0, UPPER * UPPER - along * along));
      const pole = _v3.set(s * 0.62, -1, -0.12);
      pole.addScaledVector(u, -pole.dot(u)).normalize();
      const E = this.elbow[i].copy(S).addScaledVector(u, along).addScaledVector(pole, hh);
      // forearm: origin at the wrist, +Y to the elbow, X ≈ hand width
      _y.subVectors(E, W).normalize();
      _x.copy(hy).addScaledVector(_y, -hy.dot(_y)).normalize();
      _z.crossVectors(_x, _y);
      this.mats[base + 1].makeBasis(_x, _y, _z).setPosition(W);
      // upper arm: origin at the elbow, +Y to the shoulder, twist carried over from the forearm
      const fx = _v.copy(_x);
      _y.subVectors(S, E).normalize();
      _x.copy(fx).addScaledVector(_y, -fx.dot(_y)).normalize();
      _z.crossVectors(_x, _y);
      this.mats[base].makeBasis(_x, _y, _z).setPosition(E);
    }
    // ── skin ──
    for (let k = 0; k < PIECES; k++) this.nmats[k].getNormalMatrix(this.mats[k]);
    const P = this.pos.array, N = this.nor.array, lp = this.lp, ln = this.ln, pc = this.piece;
    for (let i = 0, o = 0; i < this.n; i++, o += 3) {
      const e = this.mats[pc[i]].elements, ne = this.nmats[pc[i]].elements;
      const x = lp[o], y = lp[o + 1], z = lp[o + 2];
      P[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
      P[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      P[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const nx = ln[o], ny = ln[o + 1], nz = ln[o + 2];
      N[o] = ne[0] * nx + ne[3] * ny + ne[6] * nz;
      N[o + 1] = ne[1] * nx + ne[4] * ny + ne[7] * nz;
      N[o + 2] = ne[2] * nx + ne[5] * ny + ne[8] * nz;
    }
    this.pos.needsUpdate = true;
    this.nor.needsUpdate = true;
  }

  /** Where each hand is: 'grip' | 'horn' | 'shift' and its rim angle (debug / tests). */
  get state() { return this.hands.map((h) => ({ mode: h.mode, moving: h.t < h.T, angle: h.g - this.prevWheel })); }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
const _pose = { p: new THREE.Vector3(), q: new THREE.Quaternion(), open: 0 };
const _one = new THREE.Vector3(1, 1, 1);
const _w = new THREE.Vector3(), _hy = new THREE.Vector3(), _s = new THREE.Vector3();
