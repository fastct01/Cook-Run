// STIR — move the rod in circles inside the flask at about `targetRps`.
// A rhythm ring pulses at the target tempo; your speed needle must stay in the
// green. Progress runs while you're stirring; score = time at a good tempo.
import { Minigame, clamp, wrapAngle, ASPECT, BENCH_Y } from './Minigame.js';
import { ellipse, poly, lathe, rim, benchShadow, ring, pill, label, shade, rgba, circleHint, rr } from '../draw.js';

const CX = 0.42, CY = 0.56, SQUASH = 0.4;
const TOL = 0.35; // ±35% of target counts as "good"

export class StirGame extends Minigame {
  constructor(params, ctx) {
    super(params, ctx);
    this.duration = params.duration ?? 5;
    this.target = params.targetRps ?? 1.0;
    this.rps = 0;              // smoothed measured revolutions per second
    this.elapsed = 0;          // active stirring time (progress)
    this.good = 0;             // time at a good tempo
    this.weighted = 0;         // accumulated quality
    this._lastA = null;
    this._acc = 0;             // angle accumulated this frame
    this._phase = 0;           // visual swirl phase
    this.idle = 0;
  }

  get instructions() {
    if (this.done) return 'Mixed smooth';
    const z = this.zone;
    if (this.rps < 0.15) return 'Stir in circles to the beat';
    if (z === 'slow') return 'Faster — match the pulse';
    if (z === 'fast') return 'Slow down — you’ll slop it';
    return 'Good tempo — keep it steady';
  }
  get cursor() { return 'grab'; }
  get zone() {
    const r = this.rps / this.target;
    if (r < 1 - TOL) return 'slow';
    if (r > 1 + TOL) return 'fast';
    return 'good';
  }
  get fumesPerSec() { return (this.params.fumesPerSec || 0) * (this.rps > 0.15 ? 1 : 0.4); }

  _angle(nx, ny) { return Math.atan2((ny - CY) / SQUASH, (nx - CX) * ASPECT); }

  pointerDown(nx, ny) { super.pointerDown(nx, ny); this._lastA = this._angle(nx, ny); }
  pointerMove(nx, ny) {
    super.pointerMove(nx, ny);
    if (!this.pointer.down || this.done) { this._lastA = null; return; }
    const r = Math.hypot((nx - CX) * ASPECT, (ny - CY) / SQUASH);
    const a = this._angle(nx, ny);
    if (r < 0.03 || r > 0.8) { this._lastA = a; return; }
    if (this._lastA !== null) {
      let da = wrapAngle(a - this._lastA);
      if (Math.abs(da) > 1.6) da = 0;
      this._acc += da;
    }
    this._lastA = a;
  }
  pointerUp(nx, ny) { super.pointerUp(nx, ny); this._lastA = null; }

  update(dt, feel = {}) {
    super.update(dt, feel);
    // measured speed (abs, either direction)
    const inst = Math.abs(this._acc) / (Math.PI * 2) / Math.max(dt, 1e-3);
    this._acc = 0;
    const k = 1 - Math.exp(-dt * 5);
    this.rps += (inst - this.rps) * k;
    this._phase += this.rps * Math.PI * 2 * dt;
    if (this.done) return;
    if (feel.bumpHit > this.bumpThreshold()) {
      this.weighted = Math.max(0, this.weighted - 0.35);
      this.toast('Bump! It sloshed', 'bad');
    }
    if (this.rps > 0.15) {
      this.elapsed += dt;
      const r = this.rps / this.target;
      const q = clamp(1 - Math.max(0, Math.abs(r - 1) - 0.1) / (TOL + 0.25), 0, 1);
      this.weighted += q * dt;
      if (this.zone === 'good') this.good += dt;
      this.idle = 0;
    } else {
      this.idle += dt;
    }
    this._progress = clamp(this.elapsed / this.duration, 0, 1);
    this._score = this.elapsed > 0 ? clamp(this.weighted / this.elapsed, 0, 1) : 1;
    if (this.elapsed >= this.duration) this._finish();
  }

  draw(g, w, h, T) {
    const U = h;
    const bench = BENCH_Y * h;
    const col = this.material.color || '#c46b3c';
    const cx = CX * w;
    const R = 0.19 * U;
    const z = this.zone;

    // round-bottom flask on a ring stand → keep it a wide pot for readability
    benchShadow(g, cx, bench + 0.004 * U, R * 1.05, 0.03 * U);
    const top = lathe(g, cx, [
      [R * 0.95, (CY - 0.02) * h],
      [R * 1.05, (CY + 0.08) * h],
      [R * 0.9, bench - 0.05 * U],
      [R * 0.62, bench],
    ], '#6d757b', { seg: 8, tilt: SQUASH * 0.8 });
    rim(g, top, '#9aa2a7', '#30353a', 0.016 * U);
    // swirling liquid
    const lrx = top.rx - 0.024 * U, lry = top.ry - 0.012 * U, ly = top.cy + 0.01 * U;
    ellipse(g, cx, ly, lrx, lry, shade(col, -0.15));
    g.save();
    g.beginPath(); g.ellipse(cx, ly, lrx, lry, 0, 0, Math.PI * 2); g.clip();
    for (let i = 0; i < 3; i++) {
      g.strokeStyle = rgba('#ffffff', 0.18 + i * 0.05); g.lineWidth = Math.max(2, U * 0.008);
      g.beginPath();
      const r = lrx * (0.35 + i * 0.22);
      g.ellipse(cx, ly, r, r * SQUASH * 0.8, 0, this._phase + i * 1.9, this._phase + i * 1.9 + 1.6);
      g.stroke();
    }
    g.restore();

    // rhythm ring (pulses at target tempo) — sits around the pot
    const beat = (this.t * this.target) % 1;
    const pulse = 1 - beat;
    g.strokeStyle = rgba(T.mustard, 0.25 + 0.6 * pulse * pulse);
    g.lineWidth = Math.max(2, U * (0.004 + 0.01 * pulse));
    g.beginPath(); g.ellipse(cx, ly, R * (1.32 + 0.06 * pulse), R * (1.32 + 0.06 * pulse) * SQUASH, 0, 0, Math.PI * 2); g.stroke();
    // a dot travelling the ring at the target speed
    const ta = this.t * this.target * Math.PI * 2;
    ellipse(g, cx + Math.cos(ta) * R * 1.32, ly + Math.sin(ta) * R * 1.32 * SQUASH, 0.014 * U, 0.014 * U, T.mustard);
    if (!this.pointer.down && this.rps < 0.15 && !this.done) circleHint(g, cx, ly, R * 0.75, this.t, rgba(T.cream, 0.8), Math.max(2, U * 0.007));

    // stir rod
    let rx, ry;
    if (this.pointer.down && !this.done) {
      const px = this.pointer.x * w, py = this.pointer.y * h;
      const dx = px - cx, dy = (py - ly) / SQUASH;
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, (lrx * 0.7) / d);
      rx = cx + dx * k; ry = ly + dy * k * SQUASH;
    } else {
      rx = cx + Math.cos(this._phase) * lrx * 0.5; ry = ly + Math.sin(this._phase) * lry * 0.5;
    }
    g.save();
    g.lineCap = 'round';
    g.strokeStyle = T.woodDark; g.lineWidth = 0.022 * U;
    g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx + 0.05 * U, ry - 0.36 * U); g.stroke();
    g.strokeStyle = T.woodLight; g.lineWidth = 0.01 * U;
    g.beginPath(); g.moveTo(rx - 0.004 * U, ry - 0.02 * U); g.lineTo(rx + 0.044 * U, ry - 0.35 * U); g.stroke();
    g.restore();

    // tempo meter (right)
    const mx = 0.8 * w, my0 = 0.16 * h, my1 = bench - 0.04 * U, mw = 0.07 * U;
    rr(g, mx - mw / 2, my0, mw, my1 - my0, 0.02 * U); g.fillStyle = rgba(T.ink, 0.85); g.fill();
    const maxR = this.target * 2.2;
    const yOf = (r) => my1 - (clamp(r, 0, maxR) / maxR) * (my1 - my0);
    g.fillStyle = rgba(T.good, 0.85);
    g.fillRect(mx - mw / 2 + 3, yOf(this.target * (1 + TOL)), mw - 6, yOf(this.target * (1 - TOL)) - yOf(this.target * (1 + TOL)));
    g.fillStyle = rgba(T.bad, 0.7);
    g.fillRect(mx - mw / 2 + 3, my0 + 3, mw - 6, yOf(this.target * (1 + TOL)) - my0 - 3);
    const ny = yOf(this.rps);
    poly(g, [[mx - mw / 2 - 0.035 * U, ny - 0.018 * U], [mx - mw / 2 + 0.005 * U, ny], [mx - mw / 2 - 0.035 * U, ny + 0.018 * U]], z === 'good' ? T.good : T.mustard);
    g.fillStyle = T.cream; g.fillRect(mx - mw / 2, ny - 2, mw, 4);
    label(g, 'TEMPO', mx, my0 - 0.03 * U, 0.026 * U, rgba(T.cream, 0.8), 'center', 800);
    label(g, z === 'good' ? 'GOOD' : z === 'fast' ? 'FAST' : 'SLOW', mx, my1 + 0.04 * U, 0.03 * U, z === 'good' ? T.good : T.mustard, 'center', 900);

    // progress ring + time left
    const left = Math.max(0, this.duration - this.elapsed);
    ring(g, 0.64 * w, 0.22 * h, 0.05 * U, this._progress, T.teal, rgba(T.ink, 0.6), Math.max(4, U * 0.014));
    label(g, `${left.toFixed(1)}s`, 0.64 * w, 0.22 * h, 0.03 * U, T.cream, 'center', 900);
    pill(g, `${this.rps.toFixed(1)} / ${this.target.toFixed(1)} rps`, cx, (BENCH_Y + 0.085) * h, 0.032 * U, rgba(T.charcoal, 0.88), T.cream);
  }
}
