// ─────────────────────────────────────────────────────────────────────────────
// Trinkets — springs and pendulums for the dash toys of the first-person cab (agent R3-CAB2).
// PROPOSED, not wired into the game yet. Self-contained: no imports, no allocation per frame, deterministic.
//
//   const trinkets = new Trinkets(cab);                 // cab = createModel('rv_cab_fp_r3', v)
//   trinkets.update(dt, { speed, accel, latAcc, bump }) // once per frame (FirstPersonDriver._animateCab)
//   trinkets.kick(strength)                             // crashes / landings (0..1.5)
//   trinkets.reset()                                    // back to rest (teleports, garage exit)
//
// Inputs, all in the RV frame (any missing input counts as 0):
//   speed   m/s along the RV's nose (snap.rv.speed). Used for road buzz, and for the acceleration when
//           `accel` is not given (the derivative of speed, lightly smoothed).
//   accel   m/s², + = speeding up. Braking hard is about −8.
//   latAcc  m/s², snap.feel.latAcc (= speed × yaw rate): + = the RV accelerates toward its left (+X), i.e. a
//           left turn. Things in the cab swing to the outside of the turn.
//   bump    snap.feel.bump (0..1, jumps up on a hit and decays). Its rising edge kicks everything.
//
// What it drives (pivots of rv_cab_fp_r3; missing pivots are skipped, so rv_cab_fp is a no-op):
//   hula_spring  damped spring (≈2.2 Hz, ζ≈0.14): leans away from the acceleration and wobbles back,
//                settling in about 1.5 s. rotation.x > 0 leans forward (+Z), rotation.z > 0 leans to −X.
//   hula_hips    follows −0.9 × the torso tilt through a stiffer spring (sways opposite, a little late),
//                plus a hip swivel (rotation.y) fed by the side-to-side wobble.
//   hula_arms    follows −0.45 × the torso tilt through a soft spring (lags, then overshoots).
//   freshener, dice  2-axis pendulums (length from cab.userData.trinkets, ≈1.6 Hz) with air damping, plus a
//                twist about the string. Braking swings them toward the windscreen; a right turn swings them
//                left (+X). The forward swing is limited so they never pass through the glass.
// Each pivot's parent may be rotated (the hula anchor faces Rook): the acceleration is turned into the
// parent's frame once at construction, so authoring is free.
// ─────────────────────────────────────────────────────────────────────────────

const G = 9.81;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** Deterministic hash noise in [−1, 1]. */
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
/** Same sign, magnitude pushed into [0.5, 1] (a kick is never a dud). */
const firm = (v) => (v < 0 ? -1 : 1) * (0.5 + 0.5 * Math.abs(v));

export const TRINKET_TUNING = Object.freeze({
  hula: { f: 2.2, zeta: 0.14, gain: 8.5, max: 0.62, bumpKick: 15, buzz: 0.55 },
  hips: { f: 3.1, zeta: 0.2, follow: -0.9, max: 0.75, swivelF: 2.0, swivelZeta: 0.22, swivelGain: 1.1 },
  arms: { f: 1.6, zeta: 0.22, follow: -0.45, max: 0.6 },
  freshener: { zeta: 0.14, twistF: 0.9, twistZeta: 0.28, maxFwd: 0.95, max: 1.1, bumpKick: 6 },
  dice: { zeta: 0.13, twistF: 0.75, twistZeta: 0.25, maxFwd: 0.9, max: 1.1, bumpKick: 7 },
  maxStep: 1 / 120,
});

export class Trinkets {
  /** cab: the rv_cab_fp_r3 model (or anything with those pivot names). opts: { tuning } to override TRINKET_TUNING. */
  constructor(cab, opts = {}) {
    const T = this.T = { ...TRINKET_TUNING, ...(opts.tuning || {}) };
    const ud = (cab && cab.userData && cab.userData.trinkets) || {};
    const get = (n) => (cab && cab.getObjectByName ? cab.getObjectByName(n) : null);
    const frame = cab && cab.getObjectByName ? (cab.getObjectByName('rv_frame') || cab) : null;
    const w = (f) => 2 * Math.PI * f;
    // parent-frame basis (rotation only) relative to rv_frame: RV-frame vector → parent-local vector
    const basisOf = (o) => {
      const m = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      if (!o || !o.parent || !frame) return m;
      // accumulate the parent chain's rotations up to (not including) rv_frame
      let q = [0, 0, 0, 1];
      for (let p = o.parent; p && p !== frame; p = p.parent) q = qmul([p.quaternion.x, p.quaternion.y, p.quaternion.z, p.quaternion.w], q);
      // rows of R^T (R maps parent-local → rv_frame)
      const [x, y, z, ww] = q;
      const R = [1 - 2 * (y * y + z * z), 2 * (x * y - z * ww), 2 * (x * z + y * ww),
        2 * (x * y + z * ww), 1 - 2 * (x * x + z * z), 2 * (y * z - x * ww),
        2 * (x * z - y * ww), 2 * (y * z + x * ww), 1 - 2 * (x * x + y * y)];
      return [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
    };
    const mk = (name) => { const o = get(name); return o ? { o, B: basisOf(o), x: 0, vx: 0, z: 0, vz: 0, y: 0, vy: 0, rx: o.rotation.x, ry: o.rotation.y, rz: o.rotation.z } : null; };
    this.hula = mk('hula_spring');
    this.hips = mk('hula_hips');
    this.arms = mk('hula_arms');
    this.fresh = mk('freshener');
    this.dice = mk('dice');
    if (this.hula) { this.hula.w = w(T.hula.f); this.hula.gain = (T.hula.gain * 0.1) / Math.max(0.03, ud.hula?.height || 0.1); }
    if (this.hips) this.hips.w = w(T.hips.f);
    if (this.arms) this.arms.w = w(T.arms.f);
    if (this.fresh) this.fresh.L = ud.freshener?.length || 0.086;
    if (this.dice) this.dice.L = ud.dice?.length || 0.077;
    this.active = !!(this.hula || this.fresh || this.dice);
    this.time = 0; this.prevSpeed = null; this.acc = 0; this.prevBump = 0; this.kicks = 0;
  }

  reset() {
    for (const s of [this.hula, this.hips, this.arms, this.fresh, this.dice]) if (s) { s.x = s.vx = s.z = s.vz = s.y = s.vy = 0; this._apply(s); }
    this.prevSpeed = null; this.acc = 0; this.prevBump = 0;
  }

  /** Impulse for crashes / hard landings (strength ≈ 0.3 … 1.5). Direction varies deterministically. */
  kick(strength = 1) {
    const n = ++this.kicks, a = hash(n), b = firm(hash(n + 17.3)), c = firm(hash(n + 41.9));
    const s = clamp(strength, 0, 2);
    if (this.hula) { this.hula.vx += s * this.T.hula.bumpKick * (0.7 + 0.3 * a); this.hula.vz += s * this.T.hula.bumpKick * 0.8 * b; }
    for (const [p, t] of [[this.fresh, this.T.freshener], [this.dice, this.T.dice]]) if (p) { p.vx += s * t.bumpKick * 0.6 * b; p.vz += s * t.bumpKick * 0.6 * c; p.vy += s * 6 * a; }
  }

  update(dt, inp = {}) {
    if (!this.active || !(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    const speed = inp.speed || 0;
    // longitudinal acceleration: given, or d(speed)/dt (lightly smoothed against snapshot jitter)
    let accel = inp.accel;
    if (accel == null) {
      const raw = this.prevSpeed == null ? 0 : (speed - this.prevSpeed) / dt;
      this.acc += (clamp(raw, -25, 25) - this.acc) * Math.min(1, dt / 0.06);
      accel = this.acc;
    }
    this.prevSpeed = speed;
    const lat = clamp(inp.latAcc || 0, -25, 25);
    // bump: rising edge → kick (scaled by how hard)
    const bump = inp.bump || 0;
    if (bump > this.prevBump + 0.02) this.kick((bump - this.prevBump) * 1.15);
    this.prevBump = bump;
    // integrate in small fixed sub-steps
    const n = Math.max(1, Math.ceil(dt / this.T.maxStep)), h = dt / n;
    const ax = lat, az = clamp(accel, -25, 25);
    const buzzK = this.T.hula.buzz * Math.min(1, Math.abs(speed) / 14);
    for (let i = 0; i < n; i++) {
      this.time += h;
      const t = this.time;
      // road buzz: tiny incommensurate wiggle that keeps the dancer alive at speed
      const bx = buzzK * (Math.sin(t * 23.1) + 0.6 * Math.sin(t * 37.7 + 1.3)), bz = buzzK * (Math.sin(t * 19.3 + 0.7) + 0.5 * Math.sin(t * 41.9));
      this._hula(h, ax + bx, az + bz);
      this._pend(this.fresh, this.T.freshener, h, ax, az);
      this._pend(this.dice, this.T.dice, h, ax, az);
    }
    for (const s of [this.hula, this.hips, this.arms, this.fresh, this.dice]) if (s) this._apply(s);
  }

  // RV-frame vector (ax, 0, az) → pivot parent frame [x, z]
  _local(s, ax, az) { const B = s.B; return [B[0] * ax + B[2] * az, B[6] * ax + B[8] * az]; }

  _hula(h, ax, az) {
    const s = this.hula; if (!s) return;
    const T = this.T.hula, [lx, lz] = this._local(s, ax, az);
    const w = s.w, c = 2 * T.zeta * w;
    // spring-mounted figure (mass above the pivot): inertia leans it away from the acceleration
    s.vx += (-w * w * s.x - c * s.vx - lz * s.gain) * h;
    s.vz += (-w * w * s.z - c * s.vz + lx * s.gain) * h;
    s.x = clamp(s.x + s.vx * h, -T.max, T.max); s.z = clamp(s.z + s.vz * h, -T.max, T.max);
    if (Math.abs(s.x) >= T.max) s.vx *= -0.3;
    if (Math.abs(s.z) >= T.max) s.vz *= -0.3;
    const follow = (p, P) => {
      if (!p) return;
      const ww = p.w, cc = 2 * P.zeta * ww;
      p.vx += (-ww * ww * (p.x - P.follow * s.x) - cc * p.vx) * h;
      p.vz += (-ww * ww * (p.z - P.follow * s.z) - cc * p.vz) * h;
      p.x = clamp(p.x + p.vx * h, -P.max, P.max); p.z = clamp(p.z + p.vz * h, -P.max, P.max);
    };
    follow(this.hips, this.T.hips);
    follow(this.arms, this.T.arms);
    if (this.hips) {   // hip swivel driven by the side-to-side wobble
      const P = this.T.hips, ws = 2 * Math.PI * P.swivelF, p = this.hips;
      p.vy += (-ws * ws * p.y - 2 * P.swivelZeta * ws * p.vy + (s.vz + 0.5 * s.vx) * P.swivelGain * ws) * h;
      p.y = clamp(p.y + p.vy * h, -0.6, 0.6);
    }
  }

  _pend(p, T, h, ax, az) {
    if (!p) return;
    const [lx, lz] = this._local(p, ax, az);
    const L = p.L, w0 = Math.sqrt(G / L), c = 2 * T.zeta * w0;
    // θx: rotation.x > 0 swings the bob toward −Z; θz: rotation.z > 0 swings it toward +X
    p.vx += ((-G * Math.sin(p.x) + lz * Math.cos(p.x)) / L - c * p.vx) * h;
    p.vz += ((-G * Math.sin(p.z) - lx * Math.cos(p.z)) / L - c * p.vz) * h;
    p.x += p.vx * h; p.z += p.vz * h;
    if (p.x < -T.maxFwd) { p.x = -T.maxFwd; if (p.vx < 0) p.vx *= -0.35; }   // the windscreen
    if (p.x > T.max) { p.x = T.max; if (p.vx > 0) p.vx *= -0.3; }
    if (Math.abs(p.z) > T.max) { p.z = Math.sign(p.z) * T.max; p.vz *= -0.3; }
    // twist about the string: a soft torsion spring, nudged by sideways swinging
    const wt = 2 * Math.PI * T.twistF;
    p.vy += (-wt * wt * p.y - 2 * T.twistZeta * wt * p.vy + p.vz * 0.6) * h;
    p.y = clamp(p.y + p.vy * h, -2.5, 2.5);
  }

  _apply(s) { s.o.rotation.x = s.rx + s.x; s.o.rotation.y = s.ry + s.y; s.o.rotation.z = s.rz + s.z; }
}

function qmul(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}

export default Trinkets;
