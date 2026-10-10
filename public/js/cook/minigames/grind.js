// GRIND — drag in circles around the mortar to grind `turns` rotations.
// Big bumps knock powder out of the bowl (score = powder left).
import { Minigame, clamp, wrapAngle, ASPECT, BENCH_Y } from './Minigame.js';
import { ellipse, poly, lathe, rim, benchShadow, circleHint, pill, shade, rgba, label } from '../draw.js';

const CX = 0.5;     // mortar centre x (focus coords)
const CY = 0.58;    // centre of the grinding surface
const SQUASH = 0.42; // perspective squash of the bowl ellipse

export class GrindGame extends Minigame {
  constructor(params, ctx) {
    super(params, ctx);
    this.turns = Math.max(1, params.turns || 6);
    this.turnsDone = 0;
    this.powder = 1;
    this._lastA = null;
    this._omega = 0;          // smoothed signed angular speed (rad per sample)
    this._spin = 0;           // visual rotation of the contents
    this._spinVel = 0;
    this._bumpCd = 0;
    this.particles = [];
    this.chunks = [];
    for (let i = 0; i < 9; i++) {
      this.chunks.push({ a: this.rand() * Math.PI * 2, r: 0.25 + this.rand() * 0.6, s: 0.7 + this.rand() * 0.6, rot: this.rand() * 6 });
    }
    this.shakeT = 0;
  }

  get instructions() {
    if (this.done) return 'Ground fine';
    if (!this.turnsDone) return 'Drag in circles around the mortar';
    return 'Keep circling';
  }
  get cursor() { return 'grab'; }

  _angle(nx, ny) {
    return Math.atan2((ny - CY) / SQUASH, (nx - CX) * ASPECT);
  }

  pointerDown(nx, ny) {
    super.pointerDown(nx, ny);
    this._lastA = this._angle(nx, ny);
  }

  pointerMove(nx, ny) {
    super.pointerMove(nx, ny);
    if (!this.pointer.down || this.done || this.failed) { this._lastA = null; return; }
    const dx = (nx - CX) * ASPECT, dy = (ny - CY) / SQUASH;
    const r = Math.hypot(dx, dy);
    const a = this._angle(nx, ny);
    if (r < 0.035 || r > 0.75) { this._lastA = a; return; }
    if (this._lastA !== null) {
      let da = wrapAngle(a - this._lastA);
      if (Math.abs(da) > 1.4) da = 0; // ignore jumps across the centre
      this._omega = this._omega * 0.8 + da * 0.2;
      // only count motion that agrees with the recent direction (cheap anti-wiggle)
      if (Math.sign(da) === Math.sign(this._omega) || Math.abs(this._omega) < 1e-4) {
        this.turnsDone = Math.min(this.turns, this.turnsDone + Math.abs(da) / (Math.PI * 2));
        this._spinVel += da * 6;
      }
    }
    this._lastA = a;
  }

  pointerUp(nx, ny) { super.pointerUp(nx, ny); this._lastA = null; }

  update(dt, feel = {}) {
    super.update(dt, feel);
    this._spin += this._spinVel * dt;
    this._spinVel *= Math.exp(-dt * 3.5);
    this._bumpCd -= dt;
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (!this.done && !this.failed) {
      const thr = this.bumpThreshold();
      if (feel.bumpHit > thr && this._bumpCd <= 0) {
        this._bumpCd = 0.5;
        const lost = 0.06 + (feel.bumpHit - thr) * 0.35;
        this.powder = Math.max(0, this.powder - lost);
        this.shakeT = 0.35;
        for (let i = 0; i < 16; i++) {
          const side = this.rand() < 0.5 ? -1 : 1;
          this.particles.push({
            x: CX + side * (0.1 + this.rand() * 0.04), y: CY - 0.02,
            vx: side * (0.25 + this.rand() * 0.4), vy: -0.5 - this.rand() * 0.6,
            life: 0.9 + this.rand() * 0.5, s: 0.006 + this.rand() * 0.008,
          });
        }
        this.toast('Bump! Some powder flew out', 'bad');
        if (this.powder < 0.12) this._fail('The mortar got knocked over');
      }
      this._progress = this.turnsDone / this.turns;
      this._score = clamp(this.powder, 0.12, 1);
      if (this.turnsDone >= this.turns - 1e-6) this._finish();
    }
    for (const p of this.particles) {
      p.vy += 2.2 * dt; p.x += p.vx * dt / ASPECT; p.y += p.vy * dt; p.life -= dt;
      if (p.y > BENCH_Y && p.vy > 0) { p.y = BENCH_Y; p.vx *= 0.3; p.vy = 0; }
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  draw(g, w, h, T) {
    const U = h;
    const shake = this.shakeT > 0 ? Math.sin(this.t * 70) * this.shakeT * 0.02 * U : 0;
    const cx = CX * w + shake;
    const bench = BENCH_Y * h;
    const col = this.material.color || '#e8e1cf';
    const R = 0.21 * U;

    // guide ring behind
    if (!this.done && !this.pointer.down) circleHint(g, cx, CY * h, R * 1.25, this.t, rgba(T.mustard, 0.85), Math.max(2, U * 0.008));

    benchShadow(g, cx, bench + 0.004 * U, R * 1.05, R * 0.2);
    // mortar body (stone)
    const top = lathe(g, cx, [
      [R, (CY - 0.03) * h],
      [R * 1.02, (CY + 0.04) * h],
      [R * 0.86, (CY + 0.13) * h],
      [R * 0.56, bench - 0.025 * U],
      [R * 0.6, bench],
    ], '#9a958a', { seg: 8, tilt: SQUASH * 0.82 });
    rim(g, top, '#b6b0a2', '#5d5a53', 0.022 * U);

    // contents: powder heap grows, chunks shrink
    const fillRx = (top.rx - 0.03 * U) * (0.55 + 0.4 * this.powder);
    const fillRy = fillRx * SQUASH * 0.8;
    const fy = top.cy + 0.012 * U;
    const p = this._progress;
    ellipse(g, cx, fy, fillRx, fillRy, shade(col, -0.18));
    ellipse(g, cx, fy - 0.004 * U, fillRx * (0.5 + 0.45 * p) * this.powder, fillRy * (0.5 + 0.4 * p) * this.powder, shade(col, 0.05));
    const nChunks = Math.round(this.chunks.length * (1 - p) * Math.min(1, this.powder + 0.2));
    for (let i = 0; i < nChunks; i++) {
      const c = this.chunks[i];
      const a = c.a + this._spin * 0.4;
      const x = cx + Math.cos(a) * fillRx * c.r * 0.8;
      const y = fy + Math.sin(a) * fillRy * c.r * 0.8;
      const s = 0.022 * U * c.s * (1 - p * 0.6);
      const r0 = c.rot + this._spin * 0.3;
      const pts = [0, 1, 2, 3, 4].map((k) => [x + Math.cos(r0 + k * 1.3) * s * (k % 2 ? 0.7 : 1.1), y + Math.sin(r0 + k * 1.3) * s * 0.7]);
      poly(g, pts, shade(col, 0.12 - (i % 3) * 0.08), rgba('#000000', 0.12), 1);
    }

    // pestle follows the pointer while grinding
    let hx = cx + Math.cos(this._spin * 0.6) * fillRx * 0.4, hy = fy + Math.sin(this._spin * 0.6) * fillRy * 0.4;
    if (this.pointer.down && !this.done) {
      const px = this.pointer.x * w, py = this.pointer.y * h;
      const dx = px - cx, dy = (py - fy) / SQUASH;
      const d = Math.hypot(dx, dy) || 1;
      const lim = fillRx * 0.72;
      const k = Math.min(1, lim / d);
      hx = cx + dx * k; hy = fy + dy * k * SQUASH;
    } else if (this.done) {
      hx = cx + R * 1.5; hy = bench - 0.02 * U;
    }
    const lean = clamp((hx - cx) / R, -1, 1);
    const tx = hx + (0.1 + lean * 0.05) * U, ty = hy - 0.33 * U;
    g.save();
    g.lineCap = 'round';
    g.strokeStyle = '#6b665c'; g.lineWidth = 0.05 * U;
    g.beginPath(); g.moveTo(hx, hy); g.lineTo(tx, ty); g.stroke();
    g.strokeStyle = '#8c877b'; g.lineWidth = 0.032 * U;
    g.beginPath(); g.moveTo(hx - 0.006 * U, hy - 0.004 * U); g.lineTo(tx - 0.006 * U, ty); g.stroke();
    ellipse(g, hx, hy, 0.034 * U, 0.02 * U, '#5d5951');
    g.restore();

    // knocked powder
    for (const q of this.particles) {
      g.globalAlpha = Math.min(1, q.life * 1.5);
      ellipse(g, q.x * w, q.y * h, q.s * U, q.s * U * 0.8, col);
    }
    g.globalAlpha = 1;

    // readouts on the bench front
    pill(g, `${Math.min(this.turns, Math.floor(this.turnsDone))} / ${this.turns} turns`, cx, (BENCH_Y + 0.085) * h, 0.034 * U, rgba(T.charcoal, 0.88), T.cream);
    if (this.powder < 0.999) {
      label(g, `Powder left ${Math.round(this.powder * 100)}%`, cx, (BENCH_Y + 0.155) * h, 0.032 * U, this.powder > 0.6 ? T.cream : T.mustard);
    }
  }
}
