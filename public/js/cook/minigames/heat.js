// HEAT — set the burner dial (drag up/down on the knob or press −/+); temperature
// has inertia and drifts; bumps jolt it. Keep it inside [bandMin, bandMax] for
// `duration` cumulative seconds. Score = time-in-band / total time. Going above
// `fireAt` sets the lab on fire (ctx.startFire).
import { Minigame, clamp, lerp, BENCH_Y } from './Minigame.js';
import { rr, ellipse, poly, lathe, rim, benchShadow, flame, pill, label, shade, rgba } from '../draw.js';

const POT_X = 0.36;
const DIAL_X = 0.88, DIAL_Y = 0.46, DIAL_R = 0.085;
const THERMO_X = 0.58;
const BTN_Y = 0.70, BTN_DX = 0.07, BTN_R = 0.045;
export const HEAT_T_MIN = 20;

export class HeatGame extends Minigame {
  constructor(params, ctx) {
    super(params, ctx);
    this.bandMin = params.bandMin ?? 180;
    this.bandMax = params.bandMax ?? 220;
    this.duration = params.duration ?? 8;
    this.fireAt = params.fireAt ?? 260;
    if (this.zoneScale !== 1) {
      // difficulty: the band widens / narrows around its centre (never reaching the fire mark)
      const c = (this.bandMin + this.bandMax) / 2, half = (this.bandMax - this.bandMin) / 2 * this.zoneScale;
      this.bandMin = Math.round(Math.max(HEAT_T_MIN + 20, c - half));
      this.bandMax = Math.round(Math.min(this.fireAt - 8, c + half));
    }
    // difficulty: how readily an unwatched burner runs away (Hard 1 = drift only)
    this.burnerFireMult = Math.max(0, +(this.levers.burnerFireMult ?? 1) || 0);
    this.temp = params.startTemp ?? 70;
    this.tMax = Math.ceil((this.fireAt + 40) / 10) * 10;
    this.dial = 0;               // 0..1 burner setting
    this.inBand = 0;             // cumulative seconds in band
    this.total = 0;              // seconds since first reaching the band (score denominator)
    this.reached = false;
    this.drift = 0;              // slow random drift (°C/s)
    this.driftT = 0;
    this._drag = null;
    this._fireCd = 0;
    this.bubbles = [];
    this.history = [];
  }

  get instructions() {
    if (this.done) return 'Held it. Nice heat control';
    if (this.temp >= this.fireAt) return 'TOO HOT — turn the burner down!';
    if (this.temp > this.bandMax) return 'Too hot — ease the dial down';
    if (!this.reached) return 'Turn the burner up to reach the band';
    if (this.temp < this.bandMin) return 'Dropping — give it more gas';
    return 'Hold it in the band';
  }
  get cursor() { return 'ns-resize'; }
  get overheating() { return this.temp >= this.fireAt; }
  get fumesPerSec() { return (this.params.fumesPerSec || 0) * (0.4 + 0.6 * clamp((this.temp - 60) / (this.bandMax - 60), 0, 1.4)); }

  /** Equilibrium temperature for a dial setting — roughly linear, band centre ≈ 0.55. */
  _eq(d) {
    const mid = (this.bandMin + this.bandMax) / 2;
    return 40 + d * ((mid - 40) / 0.55);
  }

  setDial(v) { this.dial = clamp(v, 0, 1); }
  nudge(d) { this.setDial(this.dial + d); }

  pointerDown(nx, ny) {
    super.pointerDown(nx, ny);
    if (this.done || this.failed) return;
    const asp = 4 / 3;
    if (Math.hypot((nx - (DIAL_X - BTN_DX)) * asp, ny - BTN_Y) < BTN_R * 1.3) { this.nudge(-0.06); return; }
    if (Math.hypot((nx - (DIAL_X + BTN_DX)) * asp, ny - BTN_Y) < BTN_R * 1.3) { this.nudge(+0.06); return; }
    if (nx > 0.62) this._drag = { y: ny, d: this.dial };
  }
  pointerMove(nx, ny) {
    super.pointerMove(nx, ny);
    if (this._drag && this.pointer.down) this.setDial(this._drag.d + (this._drag.y - ny) * 1.6);
  }
  pointerUp(nx, ny) { super.pointerUp(nx, ny); this._drag = null; }
  key(code) {
    if (code === 'Equal' || code === 'NumpadAdd') { this.nudge(0.06); return true; }
    if (code === 'Minus' || code === 'NumpadSubtract') { this.nudge(-0.06); return true; }
    return false;
  }

  update(dt, feel = {}) {
    super.update(dt, feel);
    this._fireCd -= dt;
    if (this.done || this.failed) { this._fx(dt); return; }
    // slow drift
    this.driftT -= dt;
    if (this.driftT <= 0) { this.driftT = 1.5 + this.rand() * 2; this.drift = (this.rand() - 0.5) * 9; }
    // inertia: first-order lag towards the equilibrium of the dial
    const eq = this._eq(this.dial);
    const k = eq > this.temp ? 0.42 : 0.3;
    // unwatched (Doc away from the stove): the drift is × burnerFireMult and the flame creeps
    // (burnerFireMult − 1) × 30 °C/s — that shifts the pot's resting temperature by ≈ creep / 0.3:
    // Extreme +15 °C/s (≈ +50 °C: with the drift a burner left at the band reaches the fire mark), Easy −12 °C/s
    // (it cools out of the band instead), Hard 0 (today's drift only)
    const bfm = this.unwatched ? this.burnerFireMult : 1;
    const creep = this.unwatched ? (this.burnerFireMult - 1) * 30 : 0;
    this.temp += ((eq - this.temp) * k + this.drift * bfm + creep) * dt;
    if (feel.bumpHit > this.bumpThreshold() * 0.7) {
      const jolt = (this.rand() < 0.65 ? 1 : -1) * (8 + feel.bumpHit * 18);
      this.temp += jolt;
      this.toast(jolt > 0 ? 'Bump! Flame flared up' : 'Bump! Flame sputtered', 'bad');
    }
    this.temp = clamp(this.temp, HEAT_T_MIN, this.tMax);

    const inside = this.temp >= this.bandMin && this.temp <= this.bandMax;
    if (inside) this.reached = true;
    if (this.reached) {
      this.total += dt;
      if (inside) this.inBand += dt;
      else this.inBand += dt * 0.0; // out of band: no progress
    }
    if (this.temp >= this.fireAt && this._fireCd <= 0) {
      const m = Math.max(0.2, this.burnerFireMult);
      this._fireCd = 0.6 / m;
      this.ctx.startFire?.(0.12 * m);
    }
    this._progress = clamp(this.inBand / this.duration, 0, 1);
    this._score = this.total > 0 ? clamp(this.inBand / Math.max(this.duration, this.total), 0, 1) : 1;
    if (this.inBand >= this.duration) this._finish();

    if (this.history.length === 0 || this.t - this.history[this.history.length - 1].t > 0.1) {
      this.history.push({ t: this.t, v: this.temp });
      if (this.history.length > 60) this.history.shift();
    }
    this._fx(dt);
  }

  _fx(dt) {
    const boil = clamp((this.temp - 100) / (this.bandMax - 100), 0, 1.5);
    if (this.rand() < boil * dt * 18) this.bubbles.push({ x: (this.rand() - 0.5) * 0.8, y: 0, v: 0.04 + this.rand() * 0.05, life: 0.6 + this.rand() * 0.4 });
    for (const b of this.bubbles) { b.y += b.v * dt; b.life -= dt; }
    this.bubbles = this.bubbles.filter((b) => b.life > 0);
  }

  draw(g, w, h, T) {
    const U = h;
    const bench = BENCH_Y * h;
    const col = this.material.color || '#b4467a';
    const px = POT_X * w;

    // ── burner (dented steel ring + flame) ──
    const stoveTop = bench - 0.07 * U;
    benchShadow(g, px, bench + 0.004 * U, 0.2 * U, 0.03 * U);
    rr(g, px - 0.2 * U, stoveTop, 0.4 * U, 0.07 * U, 0.012 * U);
    g.fillStyle = T.steelDark; g.fill();
    g.fillStyle = T.steelDeep; g.fillRect(px - 0.2 * U, bench - 0.02 * U, 0.4 * U, 0.02 * U);
    g.fillStyle = T.steel; g.fillRect(px - 0.19 * U, stoveTop + 0.006 * U, 0.38 * U, 0.012 * U);
    const fl = this.dial;
    if (fl > 0.02) {
      for (let i = -2; i <= 2; i++) {
        const fh = (0.03 + fl * 0.07) * U * (1 - Math.abs(i) * 0.12);
        flame(g, px + i * 0.05 * U, stoveTop, 0.04 * U, fh, this.t, i * 3, fl > 0.75 ? T.flameHot : '#cfe7f5', fl > 0.75 ? T.flame : T.flameBlue);
      }
    }
    // ── pot ──
    const potBot = stoveTop - 0.01 * U;
    const R = 0.17 * U;
    const top = lathe(g, px, [
      [R, potBot - 0.22 * U],
      [R * 0.98, potBot - 0.12 * U],
      [R * 0.92, potBot],
    ], '#7d858b', { seg: 7, tilt: 0.26 });
    // handles
    g.fillStyle = T.steelDeep;
    rr(g, px - R - 0.05 * U, potBot - 0.19 * U, 0.06 * U, 0.025 * U, 0.01 * U); g.fill();
    rr(g, px + R - 0.01 * U, potBot - 0.19 * U, 0.06 * U, 0.025 * U, 0.01 * U); g.fill();
    rim(g, top, '#a6adb1', '#3f454a', 0.014 * U);
    // liquid colour shifts as it heats
    const heatF = clamp((this.temp - 60) / (this.bandMax - 60), 0, 1.3);
    const liq = shade(col, -0.25 + heatF * 0.2);
    ellipse(g, px, top.cy + 0.01 * U, top.rx - 0.02 * U, top.ry - 0.01 * U, liq);
    for (const b of this.bubbles) {
      g.globalAlpha = clamp(b.life * 2, 0, 1);
      ellipse(g, px + b.x * (top.rx - 0.03 * U), top.cy + 0.008 * U, 0.008 * U + b.y * 0.1 * U, 0.005 * U + b.y * 0.05 * U, null, rgba('#ffffff', 0.6), 1.5);
    }
    g.globalAlpha = 1;
    // steam
    if (heatF > 0.4) {
      for (let i = 0; i < 3; i++) {
        const st = (this.t * 0.6 + i / 3) % 1;
        g.globalAlpha = (1 - st) * 0.35 * Math.min(1, heatF);
        ellipse(g, px + Math.sin(st * 6 + i) * 0.04 * U, top.cy - st * 0.25 * U, 0.03 * U + st * 0.05 * U, 0.02 * U + st * 0.03 * U, T.cream);
      }
      g.globalAlpha = 1;
    }

    // ── thermometer gauge ──
    const tx = THERMO_X * w, tTop = 0.12 * h, tBot = bench - 0.04 * U, tw = 0.05 * U;
    const yOf = (v) => lerp(tBot, tTop, (v - HEAT_T_MIN) / (this.tMax - HEAT_T_MIN));
    rr(g, tx - tw / 2, tTop - 0.02 * U, tw, tBot - tTop + 0.04 * U, tw / 2);
    g.fillStyle = rgba(T.ink, 0.85); g.fill();
    // zones
    g.fillStyle = rgba(T.good, 0.85);
    g.fillRect(tx - tw / 2 + 2, yOf(this.bandMax), tw - 4, yOf(this.bandMin) - yOf(this.bandMax));
    g.fillStyle = rgba(T.bad, 0.85);
    g.fillRect(tx - tw / 2 + 2, tTop, tw - 4, yOf(this.fireAt) - tTop);
    // mercury
    const ty = yOf(this.temp);
    g.fillStyle = this.temp >= this.fireAt ? T.flameHot : T.cream;
    g.fillRect(tx - tw * 0.16, ty, tw * 0.32, tBot - ty);
    ellipse(g, tx, tBot + 0.01 * U, tw * 0.62, tw * 0.62, this.temp >= this.fireAt ? T.flameHot : T.cream);
    // pointer
    poly(g, [[tx + tw / 2 + 2, ty], [tx + tw / 2 + 0.03 * U, ty - 0.016 * U], [tx + tw / 2 + 0.03 * U, ty + 0.016 * U]], T.mustard);
    label(g, `${Math.round(this.temp)}°`, tx - tw / 2 - 0.012 * U, ty, 0.04 * U, this.temp > this.bandMax ? (this.temp >= this.fireAt ? T.flameHot : T.mustard) : T.cream, 'right');
    pill(g, `${this.bandMin}–${this.bandMax}°`, tx + tw / 2 + 0.04 * U, (yOf(this.bandMin) + yOf(this.bandMax)) / 2, 0.026 * U, T.good, T.charcoal, 'left');
    pill(g, `FIRE ${this.fireAt}°`, tx + tw / 2 + 0.04 * U, (tTop + yOf(this.fireAt)) / 2, 0.024 * U, T.rust, T.cream, 'left');

    // ── burner dial ──
    const dx = DIAL_X * w, dy = DIAL_Y * h, dr = DIAL_R * U;
    rr(g, dx - dr * 1.6, dy - dr * 1.55, dr * 3.2, (BTN_Y - DIAL_Y) * h + dr * 1.55 + BTN_R * U * 1.5, 0.02 * U);
    g.fillStyle = rgba(T.charcoal, 0.9); g.fill();
    // scale ticks
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
      const r0 = dr * 1.12, r1 = dr * (i % 5 === 0 ? 1.38 : 1.26);
      g.strokeStyle = i >= 8 ? T.bad : i >= 4 && i <= 6 ? T.good : rgba(T.cream, 0.6);
      g.lineWidth = Math.max(1.5, U * 0.005);
      g.beginPath(); g.moveTo(dx + Math.cos(a) * r0, dy + Math.sin(a) * r0); g.lineTo(dx + Math.cos(a) * r1, dy + Math.sin(a) * r1); g.stroke();
    }
    // knob (octagon)
    const ka = Math.PI * 0.75 + this.dial * Math.PI * 1.5;
    const oct = [];
    for (let i = 0; i < 8; i++) { const a = ka + i * Math.PI / 4 + Math.PI / 8; oct.push([dx + Math.cos(a) * dr, dy + Math.sin(a) * dr]); }
    poly(g, oct, '#3b4247', shade('#22262a', 0.25), 2);
    ellipse(g, dx, dy, dr * 0.72, dr * 0.72, '#4a5258');
    g.strokeStyle = T.mustard; g.lineWidth = Math.max(3, U * 0.012); g.lineCap = 'round';
    g.beginPath(); g.moveTo(dx + Math.cos(ka) * dr * 0.15, dy + Math.sin(ka) * dr * 0.15); g.lineTo(dx + Math.cos(ka) * dr * 0.85, dy + Math.sin(ka) * dr * 0.85); g.stroke();
    label(g, 'GAS', dx, dy - dr * 1.3, 0.026 * U, rgba(T.cream, 0.8), 'center', 800);
    // − / + buttons
    for (const [sx, sym] of [[-1, '−'], [1, '+']]) {
      const bx = (DIAL_X + sx * BTN_DX) * w, by = BTN_Y * h;
      ellipse(g, bx, by + 0.006 * U, BTN_R * U, BTN_R * U, T.ink);
      ellipse(g, bx, by, BTN_R * U, BTN_R * U, sx > 0 ? T.rust : T.teal);
      label(g, sym, bx, by + 0.002 * U, 0.06 * U, T.cream, 'center', 900);
    }

    // ── progress readout ──
    const left = Math.max(0, this.duration - this.inBand);
    pill(g, `Hold ${left.toFixed(1)}s`, px, (BENCH_Y + 0.085) * h, 0.034 * U,
      this.temp >= this.bandMin && this.temp <= this.bandMax ? T.good : rgba(T.charcoal, 0.88),
      this.temp >= this.bandMin && this.temp <= this.bandMax ? T.charcoal : T.cream);
  }
}
