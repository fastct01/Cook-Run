// ─────────────────────────────────────────────────────────────────────────────
// CabR3 — drives the Round 3 first-person cab `rv_cab_fp_r3` (agent CAB, Round 3 build).
// FirstPersonDriver builds the model and calls this every frame; the model itself is frozen
// (public/js/assets/expansion/r3-cab*.js, docs/NOTES-r3-cab.md "Contract and named parts").
//
//   const rig = new CabR3(cab, { audio, maxHp, variant });
//   rig.update(dt, { snap, wheel, gear, running, engine, horn, wipers, tempT, light, visible })
//   rig.setVariant(0 | 1)        // 0 blue nitrile gloves + yellow suit cuffs · 1 bare hands + red hoodie cuffs
//   rig.bulbCheck(s) · rig.flashOil(s) · rig.kick(strength) · rig.resetTrinkets() · rig.dispose()
//   rig.state                    // debug: hands, lamps, gear, stalks, radio
//
// • Hands: rigid gripping hands (each with its sleeve to the elbow), so they never rotate far.
//   They ride the rim 1:1 for small angles and ease into a slide (RIDE·tanh(w/RIDE)): past ~30° the
//   rim slides through the gloves, the arms never cross. Past ~100° the hand pushed toward 12 o'clock
//   lets go and re-grips at its home spot (hand-over-hand beat, 0.26 s with a lift toward Rook) while the
//   other hand holds; back under ~66° it re-grips again so both ride from home. While the horn is held the right fist drops onto the horn
//   cushion (horn_pad presses 5 mm).
// • Dash: PRNDL pointer (P when the engine is off / parked at a stop / wrecked, R, N, D), warning lamps
//   (CHECK < 30 % hull, OIL flashes after the oil gadget, TEMP at ≥ 4★ or an overheating engine; a bulb
//   check at key-on), turn-signal arrows + stalk (pulling in to a stop; hazards < 25 % hull), wiper stalk
//   (clicks), key (off / start / run), the radio dial showing the area name (snap.area.name).
//   The three asset lamp meshes + the two turn arrows are drawn by ONE merged unlit mesh (vertex colours
//   carry off/on), so the lamps never add draw calls: cab total ≤ 25 (see stats).
// • Trinkets (render/fp/trinkets.js): hula dancer, mint freshener, fuzzy dice from the RV's longitudinal
//   acceleration (speed delta), snap.feel.latAcc and snap.feel.bump.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { createModel } from '../../assets/index.js';
import { WHITE_UV } from '../../assets/expansion/r3-cab-atlas.js';
import { Trinkets } from './trinkets.js';
import { indicatorWanted } from '../audio.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export const R3_KIND = 'rv_cab_fp_r3';
/** Hand rig tuning (radians / metres / seconds). */
export const HANDS = Object.freeze({
  ride: 0.5,          // the hands follow the rim up to ~±0.5 rad (tanh), then the rim slides through them
  hoh: 1.75,          // wheel past ~100° → hand-over-hand re-grip of the hand pushed toward the top
  hohBack: 1.15,      // back under ~66° → re-grip at home
  regrip: 0.26,       // re-grip move time
  lift: 0.034,        // lift toward Rook while moving between grips
  hornIn: 0.12, hornOut: 0.22,
  // right fist on the horn cushion: wheel-mount frame (X = Rook's left, Y up the wheel, Z away from Rook)
  horn: { x: -0.042, y: 0.04, z: -0.042, rot: 0.3 },
});
const GEAR_Z = { P: 0.24, R: 0.12, N: 0, D: -0.12, L: -0.24 };
const STRIP_Y = 0.084;                          // r3-cab-model.js: info strip row in `gauges` space
const LAMPS = [                                 // name, off colour (unlit legend), on colour
  ['lamp_check', '#3a2a12', '#ffae2a'], ['lamp_oil', '#3a1412', '#ff3a22'], ['lamp_heat', '#3a1412', '#ff3a22'],
];
const ARROWS = [                                // r3-cab-model.js turn arrows (gauges space, facing +Z)
  ['turnL', [[-0.19, STRIP_Y], [-0.172, STRIP_Y + 0.007], [-0.172, STRIP_Y - 0.007]]],
  ['turnR', [[0.19, STRIP_Y], [0.172, STRIP_Y - 0.007], [0.172, STRIP_Y + 0.007]]],
];
const ARROW_ON = '#46ff6a';
// AM/FM dial window (r3-cab-model.js dashboard(): radio at x −0.06, y 1.19; dial rect centre y + 0.022, z dz − 0.0125)
const RADIO = { x: -0.06, y: 1.212, z: 2.9125 - 0.0011, w: 0.13, h: 0.026 };
const RW = 512, RH = 102;
const FM0 = 88, FM1 = 108;

const _c = new THREE.Color();
function linearColor(hex) { return new THREE.Color(hex); }      // THREE.Color(hex) is linear in r152+ colour management

function freqFor(id) {
  let h = 2166136261;
  for (const ch of String(id || 'road')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return 88.1 + 0.2 * (h % 100);                // odd tenths 88.1 … 107.9
}

export class CabR3 {
  constructor(cab, { audio = null, maxHp = 100, variant = 0 } = {}) {
    this.cab = cab;
    this.audio = audio;
    this.maxHp = maxHp || 100;
    this.variant = variant === 1 ? 1 : 0;
    const g = (n) => cab.getObjectByName(n);
    this.frame = g('rv_frame') || cab;
    this.gauges = g('gauges');
    this.P = {
      wheel: g('wheel'), mount: g('wheel_mount'), horn: g('horn_pad'), handL: g('hand_l'), handR: g('hand_r'),
      stalkSignal: g('stalk_signal'), stalkWiper: g('stalk_wiper'), key: g('key'), gear: g('gear_pointer'),
    };
    const ud = cab.userData || {};
    this.R = ud.wheel?.radius ?? 0.21;
    this.grip = ud.wheel?.grip ?? 1.3;
    this.ctl = ud.controls || {};
    this.disposables = [];
    this.time = 0;
    // hands: s = +1 left (Rook's left is +X), −1 right
    this.hands = [1, -1].map((s) => ({
      s, a0: s * this.grip, off: 0, mode: 'grip', t: 1, T: 0, from: { x: 0, y: 0, z: 0, rot: 0 }, cur: { x: 0, y: 0, z: 0, rot: 0 }, first: true,
    }));
    this.beat = 0;                               // sign of the turn whose hand-over-hand beat is active
    this.hornPress = 0;
    // dash state
    this.gearZ = this.P.gear ? this.P.gear.rotation.z : GEAR_Z.P;
    this.keyZ = this.P.key ? this.P.key.rotation.z : 0.62;
    this.sigZ = 0; this.wipZ = 0;
    this.prevWipers = false; this.prevSignal = 0;
    this.bulb = 0; this.oilT = 0; this.blinkT = 0; this.blinkOn = false;
    this.lamp = { check: 0, oil: 0, heat: 0, turnL: 0, turnR: 0 };
    this._buildLamps();
    this._buildRadio();
    this.trinkets = new Trinkets(cab);            // (the cab was built with `variant`: no hand swap needed)
  }

  // ── merged warning lamps + turn arrows (one unlit draw call) ──────────────
  _buildLamps() {
    const gz = this.gauges;
    if (!gz) return;
    const pos = [], uv = [], col = [];
    this.lampSlots = [];
    let map = null;
    for (const [name, off, on] of LAMPS) {
      const m = gz.getObjectByName(name);
      if (!m || !m.isMesh) continue;
      map = map || m.material?.map || null;
      const p = m.geometry.attributes.position, t = m.geometry.attributes.uv;
      const start = pos.length / 3;
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i), p.getZ(i) + 0.0003);
        uv.push(t ? t.getX(i) : WHITE_UV[0], t ? t.getY(i) : WHITE_UV[1]);
        col.push(0, 0, 0);
      }
      this.lampSlots.push({ id: name.slice(5), start, count: p.count, off: linearColor(off).multiplyScalar(0.9), on: linearColor(on).multiplyScalar(1.6), k: -1 });
      m.visible = false;                         // drawn by the merged mesh below
    }
    this.arrowSlots = [];
    for (const [id, pts] of ARROWS) {
      const start = pos.length / 3;
      for (const [x, y] of pts) { pos.push(x, y, 0.0022); uv.push(WHITE_UV[0], WHITE_UV[1]); col.push(0, 0, 0); }
      this.arrowSlots.push({ id, start, count: 3, rest: pts.map(([x, y]) => [x, y, 0.0022]), on: linearColor(ARROW_ON).multiplyScalar(1.4), k: -1 });
    }
    if (!pos.length) return;
    const geo = new THREE.BufferGeometry();
    this.lampPos = new THREE.Float32BufferAttribute(pos, 3); this.lampPos.setUsage(THREE.DynamicDrawUsage);
    this.lampCol = new THREE.Float32BufferAttribute(col, 3); this.lampCol.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.lampPos);
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', this.lampCol);
    geo.computeBoundingSphere();
    this.lampMat = new THREE.MeshBasicMaterial({ map, vertexColors: true, side: THREE.DoubleSide, toneMapped: false, fog: false, name: 'CR_R3Cab_LampsMerged' });
    const mesh = new THREE.Mesh(geo, this.lampMat);
    mesh.name = 'fp_r3_lamps'; mesh.castShadow = false; mesh.receiveShadow = false;
    gz.add(mesh);
    this.lampMesh = mesh;
    this.disposables.push(geo, this.lampMat);
    this._writeLamps(true);
  }

  _writeLamps(force = false) {
    if (!this.lampMesh) return;
    const C = this.lampCol.array, Pp = this.lampPos.array;
    let dc = false, dp = false;
    for (const L of this.lampSlots) {
      const k = this.lamp[L.id] || 0;
      if (!force && k === L.k) continue;
      L.k = k; dc = true;
      _c.copy(L.off).lerp(L.on, k);
      for (let i = 0; i < L.count; i++) { const o = (L.start + i) * 3; C[o] = _c.r; C[o + 1] = _c.g; C[o + 2] = _c.b; }
    }
    for (const A of this.arrowSlots) {
      const k = this.lamp[A.id] || 0;
      if (!force && k === A.k) continue;
      A.k = k; dc = dp = true;
      // lit: a bright arrow over the asset's painted one · off: collapsed (the painted arrow shows)
      const cx = (A.rest[0][0] + A.rest[1][0] + A.rest[2][0]) / 3, cy = (A.rest[0][1] + A.rest[1][1] + A.rest[2][1]) / 3;
      for (let i = 0; i < 3; i++) {
        const o = (A.start + i) * 3;
        Pp[o] = k > 0 ? A.rest[i][0] : cx; Pp[o + 1] = k > 0 ? A.rest[i][1] : cy; Pp[o + 2] = A.rest[i][2];
        C[o] = A.on.r * k; C[o + 1] = A.on.g * k; C[o + 2] = A.on.b * k;
      }
    }
    if (dc) this.lampCol.needsUpdate = true;
    if (dp) this.lampPos.needsUpdate = true;
  }

  // ── radio dial: the area name on a small canvas over the AM/FM window ─────
  _buildRadio() {
    if (typeof document === 'undefined') return;
    const cv = document.createElement('canvas'); cv.width = RW; cv.height = RH;
    this.radioCanvas = cv;
    this.radioTex = new THREE.CanvasTexture(cv);
    this.radioTex.colorSpace = THREE.SRGBColorSpace;
    this.radioTex.anisotropy = 4;
    this.radioMat = new THREE.MeshBasicMaterial({ map: this.radioTex, toneMapped: false, fog: false, name: 'CR_R3Cab_RadioDial' });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(RADIO.w, RADIO.h), this.radioMat);
    mesh.name = 'fp_r3_radio'; mesh.position.set(RADIO.x, RADIO.y, RADIO.z); mesh.rotation.y = Math.PI;   // faces Rook (−Z), +u → Rook's right
    mesh.castShadow = false; mesh.receiveShadow = false;
    this.frame.add(mesh);
    this.radioMesh = mesh;
    this.disposables.push(mesh.geometry, this.radioMat, this.radioTex);
    this.radio = { name: '', shown: '', freq: 96.3, from: 96.3, to: 96.3, t: 1, redraw: 0, fade: 1 };
    this._drawRadio();
  }

  _drawRadio() {
    const cv = this.radioCanvas; if (!cv) return;
    const g = cv.getContext('2d'), r = this.radio;
    const bg = g.createLinearGradient(0, 0, 0, RH); bg.addColorStop(0, '#33280f'); bg.addColorStop(1, '#1a1308');
    g.fillStyle = bg; g.fillRect(0, 0, RW, RH);
    // backlight glow
    const gl = g.createRadialGradient(RW / 2, RH * 0.45, 10, RW / 2, RH * 0.45, RW * 0.55);
    gl.addColorStop(0, 'rgba(255,190,90,0.22)'); gl.addColorStop(1, 'rgba(255,190,90,0)');
    g.fillStyle = gl; g.fillRect(0, 0, RW, RH);
    // scale: 88 … 108 MHz
    const x0 = 34, x1 = RW - 70, ty = 70;
    const fx = (f) => x0 + ((f - FM0) / (FM1 - FM0)) * (x1 - x0);
    g.strokeStyle = 'rgba(240,226,190,0.75)'; g.lineWidth = 2;
    for (let f = FM0; f <= FM1 + 1e-6; f += 1) { const x = fx(f); g.beginPath(); g.moveTo(x, ty); g.lineTo(x, ty + (f % 4 === 0 ? 14 : 8)); g.stroke(); }
    g.fillStyle = 'rgba(240,226,190,0.8)'; g.font = '700 15px "Arial Narrow", Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    for (const f of [88, 92, 96, 100, 104, 108]) g.fillText(String(f), fx(f), RH - 3);
    g.textAlign = 'left'; g.fillStyle = '#ffcf6a'; g.font = '900 16px Arial, Helvetica, sans-serif'; g.fillText('FM', 6, RH - 4);
    // station read-out (right)
    g.textAlign = 'right'; g.fillStyle = '#ffd98a'; g.font = '700 22px "Arial Narrow", Arial, sans-serif';
    g.fillText(r.freq.toFixed(1), RW - 8, 82); g.font = '700 12px Arial, sans-serif'; g.fillStyle = 'rgba(255,217,138,0.75)'; g.fillText('MHz', RW - 10, 98);
    // area name (fades in once the needle settles)
    const name = (r.shown || '').toUpperCase();
    if (name && r.fade > 0) {
      g.save();
      g.globalAlpha = clamp(r.fade, 0, 1);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      let px = 46;
      g.font = `900 ${px}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
      const maxW = RW - 40;
      const w = g.measureText(name).width;
      if (w > maxW) { px = Math.max(20, Math.floor(px * maxW / w)); g.font = `900 ${px}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`; }
      g.shadowColor = 'rgba(255,170,60,0.85)'; g.shadowBlur = 10;
      g.fillStyle = '#ffe2a4';
      g.fillText(name, RW / 2, 33);
      g.restore();
    } else if (!name || r.t < 1) {
      g.fillStyle = 'rgba(255,217,138,0.55)'; g.font = '700 18px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('· · ·', RW / 2, 33);
    }
    // tuning pointer
    g.fillStyle = '#ff3b22'; g.fillRect(fx(r.freq) - 2, 50, 4, RH - 54);
    // glass sheen
    const sh = g.createLinearGradient(0, 0, 0, RH); sh.addColorStop(0, 'rgba(255,255,255,0.10)'); sh.addColorStop(0.4, 'rgba(255,255,255,0)');
    g.fillStyle = sh; g.fillRect(0, 0, RW, RH);
    this.radioTex.needsUpdate = true;
  }

  _updateRadio(dt, snap) {
    const r = this.radio; if (!r) return;
    const area = snap && snap.area;
    const name = (area && (area.name || area.id)) || '';
    let dirty = false;
    if (name !== r.name) {
      r.name = name; r.from = r.freq; r.to = name ? freqFor(area.id || name) : 96.3; r.t = 0; r.fade = 0; r.shown = '';
      if (!this._radioPrimed) { r.from = r.freq = r.to; r.t = 1; r.shown = name; r.fade = 1; r.redraw = 0; dirty = true; }   // first area: no seek
    }
    this._radioPrimed = true;
    if (r.t < 1) {
      r.t = Math.min(1, r.t + dt / 1.1);
      r.freq = lerp(r.from, r.to, smooth(r.t));
      if (r.t >= 1) { r.shown = r.name; r.fade = 0.01; }
      dirty = true;
    } else if (r.fade < 1) { r.fade = Math.min(1, r.fade + dt / 0.35); dirty = true; if (r.fade >= 1) r.redraw = 0; }
    if (!dirty) return;
    r.redraw -= dt;
    if (r.redraw > 0 && r.t < 1) return;
    r.redraw = 1 / 12;
    this._drawRadio();
  }

  // ── hands ────────────────────────────────────────────────────────────────
  /** Grip pose in the wheel-mount frame for a hand at rigid rotation `rot` (+ = clockwise as Rook sees it). */
  _gripPose(h, rot, out) {
    const a = h.a0 - rot;
    out.x = this.R * Math.sin(a); out.y = this.R * Math.cos(a); out.z = 0; out.rot = rot;
    return out;
  }
  _hornPose(out) { const H = HANDS.horn; out.x = H.x; out.y = H.y; out.z = H.z; out.rot = H.rot; return out; }
  _target(h, w, out) {
    if (h.mode === 'horn') return this._hornPose(out);
    const F = HANDS.ride * Math.tanh(w / HANDS.ride);
    return this._gripPose(h, F + h.off, out);
  }
  _startMove(h, mode, T) {
    h.from.x = h.cur.x; h.from.y = h.cur.y; h.from.z = h.cur.z; h.from.rot = h.cur.rot;
    h.mode = mode; h.t = 0; h.T = T;
  }
  _settled(h) { return h.t >= h.T; }

  _updateHands(dt, w, horn, bump) {
    const [L, Rh] = this.hands;
    // right hand: horn ⇄ wheel
    const wantR = horn ? 'horn' : 'grip';
    if (wantR !== Rh.mode) { this._startMove(Rh, wantR, wantR === 'horn' ? HANDS.hornIn : HANDS.hornOut); Rh.off = 0; }
    // hand-over-hand beat past ~100°: the hand pushed toward 12 o'clock re-grips low on its own side
    const sw = Math.sign(w);
    if (!this.beat && Math.abs(w) > HANDS.hoh) {
      const out = sw > 0 ? L : Rh, other = out === L ? Rh : L;
      if (out.mode === 'grip' && this._settled(out) && this._settled(other)) {
        out.off = -HANDS.ride * Math.tanh(w / HANDS.ride); this._startMove(out, 'grip', HANDS.regrip); this.beat = sw;   // back to its home spot
      }
    } else if (this.beat && (Math.abs(w) < HANDS.hohBack || sw !== this.beat)) {
      for (const h of this.hands) if (h.off !== 0 && h.mode === 'grip') { h.off = 0; this._startMove(h, 'grip', HANDS.regrip); }
      if (this.hands.every((h) => h.off === 0)) this.beat = 0;
    }
    const tgt = _pose;
    for (const h of this.hands) {
      this._target(h, w, tgt);
      if (h.first) { h.first = false; h.t = h.T = 0; }
      if (h.t < h.T) {
        h.t = Math.min(h.T, h.t + dt);
        const u = h.t / h.T, k = smooth(u), arc = Math.sin(Math.PI * u);
        h.cur.x = lerp(h.from.x, tgt.x, k); h.cur.y = lerp(h.from.y, tgt.y, k);
        h.cur.z = lerp(h.from.z, tgt.z, k) - arc * HANDS.lift;
        h.cur.rot = lerp(h.from.rot, tgt.rot, k);
        // a little outward (away from the hub) while lifting, so the fingers clear the rim
        const rr = Math.hypot(h.cur.x, h.cur.y) || 1;
        h.cur.x += (h.cur.x / rr) * arc * 0.012; h.cur.y += (h.cur.y / rr) * arc * 0.012;
      } else { h.cur.x = tgt.x; h.cur.y = tgt.y; h.cur.z = tgt.z; h.cur.rot = tgt.rot; }
    }
    // apply: mount frame → wheel-local (the hands are children of the wheel, rotation.z = w)
    const c = Math.cos(-w), s = Math.sin(-w), jit = bump * 0.004;
    for (let i = 0; i < 2; i++) {
      const h = this.hands[i], piv = i === 0 ? this.P.handL : this.P.handR;
      if (!piv) continue;
      const x = h.cur.x + (jit ? Math.sin(this.time * 53 + i) * jit : 0), y = h.cur.y + (jit ? Math.sin(this.time * 61 + i * 2) * jit : 0);
      piv.position.set(x * c - y * s, x * s + y * c, h.cur.z);
      piv.rotation.z = h.cur.rot - w;
    }
    // horn cushion presses once the fist is on it
    const onPad = Rh.mode === 'horn' && this._settled(Rh);
    this.hornPress = damp(this.hornPress, onPad ? 1 : 0, 30, this._dt);
    if (this.P.horn) this.P.horn.position.z = (this.ctl.horn_pad?.pressed ?? 0.005) * this.hornPress;
  }

  // ── variant (gloves / bare hands) ──────────────────────────────────────────
  /** Swap the hand meshes (geometry + material, shared with the asset prototypes) to variant v. */
  setVariant(v) {
    v = v === 1 ? 1 : 0;
    if (v === this.variant) return false;
    let src = null;
    try { src = createModel(R3_KIND, v); } catch (e) { src = null; }
    if (!src) return false;
    for (const n of ['hand_l_mesh', 'hand_r_mesh']) {
      const dst = this.cab.getObjectByName(n), from = src.getObjectByName(n);
      if (dst && from && dst.isMesh && from.isMesh) { dst.geometry = from.geometry; dst.material = from.material; }
    }
    this.variant = v;
    return true;
  }

  bulbCheck(seconds = 1.6) { this.bulb = Math.max(this.bulb, seconds); }
  flashOil(seconds = 3) { this.oilT = Math.max(this.oilT, seconds); }
  kick(strength = 1) { this.trinkets?.kick(strength); }
  resetTrinkets() { this.trinkets?.reset(); }

  /**
   * @param o.snap     latest snapshot      @param o.wheel  wheel rotation.z (rad, + = right)
   * @param o.gear     gearbox gear (−1 R, 0 N, 1..3)    @param o.running  engine running
   * @param o.engine   'off' | 'cranking' | 'on'         @param o.horn     horn held
   * @param o.wipers   wipers wanted                      @param o.tempT    0..1 engine temperature (FirstPersonDriver)
   * @param o.visible  cab drawn this frame (skips the hands + radio work when hidden; trinkets always run)
   */
  update(dt, { snap = null, wheel = 0, gear = 1, running = true, engine = 'on', horn = false, wipers = false, tempT = 0.5, visible = true } = {}) {
    dt = clamp(dt || 0, 0, 0.1);
    this._dt = dt;
    this.time += dt;
    const rv = (snap && snap.rv) || {};
    const feel = (snap && snap.feel) || {};
    // trinkets (cheap; keep them physical even while the cab is hidden)
    this.trinkets.update(dt, { speed: rv.speed || 0, latAcc: feel.latAcc || 0, bump: feel.bump || 0 });
    if (visible) this._updateHands(dt, wheel, horn, feel.bump || 0);
    // PRNDL
    const st = snap && snap.stop && snap.stop.state;
    const parked = (st === 'parked' || st === 'shopping' || st === 'returning' || st === 'loading') && Math.abs(rv.speed || 0) < 0.3;
    const sel = engine !== 'on' || !running || rv.wrecked || parked || snap?.phase === 'garage' ? 'P' : gear < 0 ? 'R' : gear === 0 ? 'N' : 'D';
    this.gearSel = sel;
    this.gearZ = damp(this.gearZ, GEAR_Z[sel], 14, dt);
    if (this.P.gear) this.P.gear.rotation.z = this.gearZ;
    // key: off 0 · cranking 1.05 (start) · run 0.62
    const kc = this.ctl.key || {};
    const keyT = engine === 'off' ? (kc.off ?? 0) : engine === 'cranking' ? (kc.start ?? 1.05) : (kc.run ?? 0.62);
    this.keyZ = damp(this.keyZ, keyT, 18, dt);
    if (this.P.key) this.P.key.rotation.z = this.keyZ;
    // turn signal: pulling in to a supply stop (same rule as the audio tick); hazards when the hull is low
    const hull = (rv.hp ?? this.maxHp) / this.maxHp;
    const ns = snap && snap.nearStop;
    const forced = this.audio && this.audio.indicatorForced;
    const indicating = forced != null ? !!forced : indicatorWanted(snap);
    const side = indicating ? ((ns && ns.side) < 0 ? -1 : 1) : 0;
    const hazard = hull < 0.25 && !rv.wrecked && snap?.phase === 'drive';
    if (side !== this.prevSignal) { if (this.audio && this.audio.play) this.audio.play('stalk', side !== 0); this.prevSignal = side; }
    const sc = this.ctl.stalk_signal || {};
    this.sigZ = damp(this.sigZ, side > 0 ? (sc.right ?? 0.2) : side < 0 ? (sc.left ?? -0.2) : 0, 22, dt);
    if (this.P.stalkSignal) this.P.stalkSignal.rotation.z = this.sigZ;
    if (side || hazard) { this.blinkT += dt; if (this.blinkT >= 0.36) { this.blinkT -= 0.36; this.blinkOn = !this.blinkOn; } } else { this.blinkT = 0.3; this.blinkOn = false; }
    // wiper stalk (clicks when the wipers start / stop)
    if (wipers !== this.prevWipers) { if (this.audio && this.audio.play) this.audio.play('stalk', !!wipers); this.prevWipers = !!wipers; }
    this.wipZ = damp(this.wipZ, wipers ? (this.ctl.stalk_wiper?.on ?? 0.18) : 0, 22, dt);
    if (this.P.stalkWiper) this.P.stalkWiper.rotation.z = this.wipZ;
    // warning lamps
    this.bulb = Math.max(0, this.bulb - dt);
    this.oilT = Math.max(0, this.oilT - dt);
    const stars = (snap && snap.heat && snap.heat.stars) || 0;
    const Lp = this.lamp;
    Lp.check = hull < 0.3 ? 1 : 0;
    Lp.oil = this.oilT > 0 ? ((this.oilT * 3.2) % 1 < 0.55 ? 1 : 0) : (!running && engine !== 'off' ? 1 : 0);
    Lp.heat = stars >= 4 || tempT > 0.86 ? 1 : 0;
    Lp.turnL = this.blinkOn && (side < 0 || hazard) ? 1 : 0;
    Lp.turnR = this.blinkOn && (side > 0 || hazard) ? 1 : 0;
    if (this.bulb > 0 || engine === 'cranking') { Lp.check = Lp.oil = Lp.heat = 1; }
    this._writeLamps();
    if (visible) this._updateRadio(dt, snap);
  }

  get state() {
    return {
      variant: this.variant,
      hands: this.hands.map((h) => ({ mode: h.mode, moving: h.t < h.T, rot: +h.cur.rot.toFixed(3), off: h.off, x: +h.cur.x.toFixed(3), y: +h.cur.y.toFixed(3) })),
      beat: this.beat, horn: +this.hornPress.toFixed(2), gear: this.gearSel, key: +this.keyZ.toFixed(2),
      signal: +this.sigZ.toFixed(2), wiperStalk: +this.wipZ.toFixed(2), lamps: { ...this.lamp }, radio: this.radio ? { name: this.radio.shown, freq: +this.radio.freq.toFixed(1) } : null,
      trinkets: this.trinkets ? {
        hula: this.trinkets.hula ? [+this.trinkets.hula.x.toFixed(3), +this.trinkets.hula.z.toFixed(3)] : null,
        fresh: this.trinkets.fresh ? [+this.trinkets.fresh.x.toFixed(3), +this.trinkets.fresh.z.toFixed(3)] : null,
        dice: this.trinkets.dice ? [+this.trinkets.dice.x.toFixed(3), +this.trinkets.dice.z.toFixed(3)] : null,
      } : null,
    };
  }

  get stats() {
    let meshes = 0, tris = 0;
    this.cab.traverse((o) => { if (o.isMesh && o.visible) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
    return { meshes, tris: Math.round(tris) };
  }

  dispose() {
    for (const d of this.disposables) d.dispose && d.dispose();
    this.disposables.length = 0;
    if (this.radioMesh) this.radioMesh.removeFromParent();
    if (this.lampMesh) this.lampMesh.removeFromParent();
  }
}
const _pose = { x: 0, y: 0, z: 0, rot: 0 };

export default CabR3;
