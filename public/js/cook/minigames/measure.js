// MEASURE — hold to pour into the beaker, release inside the target band.
// Lateral acceleration tilts the liquid surface and makes the stream wobble;
// a bump while pouring splashes a random extra amount in. Overfill (> 1.0) = spill.
import { Minigame, clamp, BENCH_Y } from './Minigame.js';
import { rr, ellipse, poly, benchShadow, pill, label, shade, rgba } from '../draw.js';

const BX = 0.5;      // beaker centre x
const BW = 0.25;     // beaker width (height units)
const BH = 0.42;     // beaker height
const SETTLE = 0.7;  // seconds after release before the level is judged

export class MeasureGame extends Minigame {
  constructor(params, ctx) {
    super(params, ctx);
    this.min = params.targetMin ?? 0.6;
    this.max = params.targetMax ?? 0.75;
    if (this.zoneScale !== 1) {
      // difficulty: the green band widens / narrows around its centre
      const c = (this.min + this.max) / 2, half = (this.max - this.min) / 2 * this.zoneScale;
      this.min = clamp(c - half, 0.08, c); this.max = clamp(c + half, c, 0.97);
    }
    this.rate = params.pourRate ?? 0.28;
    this.level = 0;
    this.pouring = false;
    this.poured = false;     // has poured at least once
    this.settle = 0;         // countdown after release
    this.tilt = 0;           // liquid surface tilt (-1..1)
    this.tiltVel = 0;
    this.wobble = 0;         // stream x offset
    this.splashes = [];
    this.drops = [];
    this.spilled = false;
    this.result = null;      // 'good' | 'low' | 'high' | 'spill'
    this._bumpCd = 0;
    this.holdT = 0;
  }

  get instructions() {
    if (this.result === 'spill') return 'Overflowed! Most of it is on the floor';
    if (this.done) return this.result === 'good' ? 'Right on the line' : this.result === 'low' ? 'A bit short' : 'A bit over';
    if (this.pouring) return 'Release inside the green band';
    if (this.settle > 0) return 'Letting it settle…';
    if (this.poured) return 'Top it up — or wait to lock it in';
    return 'Hold to pour, release in the band';
  }
  get cursor() { return 'pointer'; }

  pointerDown(nx, ny) {
    super.pointerDown(nx, ny);
    if (this.done || this.failed) return;
    this.pouring = true;
    this.poured = true;
    this.settle = 0;
  }
  pointerUp(nx, ny) {
    super.pointerUp(nx, ny);
    if (this.pouring) { this.pouring = false; this.settle = SETTLE; }
  }

  update(dt, feel = {}) {
    super.update(dt, feel);
    this._bumpCd -= dt;
    const lat = clamp((feel.latAcc || 0) / 6, -1.4, 1.4);
    // spring the surface tilt towards the lateral acceleration
    const target = lat * 0.9 + (feel.bump || 0) * Math.sin(this.t * 31) * 0.4;
    this.tiltVel += ((target - this.tilt) * 30 - this.tiltVel * 4.5) * dt;
    this.tilt = clamp(this.tilt + this.tiltVel * dt, -1.2, 1.2);
    this.wobble = lat * 0.05 + Math.sin(this.t * 7.3) * 0.006 + (feel.bump || 0) * Math.sin(this.t * 40) * 0.02;

    if (this.done || this.failed) { this._tickFx(dt); return; }

    if (this.pouring) {
      this.holdT += dt;
      // stream partially misses the beaker when wobbling hard
      const miss = clamp((Math.abs(this.wobble) - 0.06) * 8, 0, 0.6);
      this.level += this.rate * dt * (1 - miss);
      if (miss > 0 && this.rand() < 0.5) this._drop(0.5 + this.wobble * 2.2, 1);
      if (feel.bumpHit > this.bumpThreshold() * 0.6 && this._bumpCd <= 0) {
        this._bumpCd = 0.4;
        const extra = 0.03 + this.rand() * 0.07;
        this.level += extra;
        for (let i = 0; i < 10; i++) this._drop(BX + (this.rand() - 0.5) * 0.15, 1.6);
        this.toast('Bump! It splashed in', 'bad');
      }
    } else if (this.settle > 0) {
      this.settle -= dt;
      if (this.settle <= 0) this._judge();
    }

    // sloshing over the lip
    if (this.level > 0.88 && Math.abs(this.tilt) > 0.8) this.level -= dt * 0.04;

    if (this.level > 1.0) {
      this.level = 1.04;
      this.spilled = true;
      this.pouring = false;
      for (let i = 0; i < 22; i++) this._drop(BX + (this.rand() - 0.5) * 0.2, 2);
      this.result = 'spill';
      this._score = 0.2;
      this.toast('Overflowed!', 'bad');
      this._finish();
    }
    this._progress = clamp(this.level / ((this.min + this.max) / 2), 0, 1) * (this.settle > 0 ? 0.95 : 0.9);
    this._tickFx(dt);
  }

  _judge() {
    const c = (this.min + this.max) / 2;
    const half = (this.max - this.min) / 2;
    const d = Math.abs(this.level - c);
    if (this.level >= this.min && this.level <= this.max) {
      this.result = 'good';
      this._score = 1 - 0.25 * (d / half);
    } else {
      this.result = this.level < this.min ? 'low' : 'high';
      this._score = clamp(0.75 - (d - half) * 3.2, 0.2, 0.74);
    }
    this._finish();
  }

  _drop(x, power) {
    this.drops.push({ x, y: 0.35, vx: (this.rand() - 0.5) * 0.4 * power, vy: -0.3 * power * this.rand(), life: 1 });
  }

  _tickFx(dt) {
    for (const d of this.drops) {
      d.vy += 2.5 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.life -= dt * 0.9;
      if (d.y > BENCH_Y) { d.y = BENCH_Y; d.vy = 0; d.vx = 0; }
    }
    this.drops = this.drops.filter((d) => d.life > 0);
  }

  draw(g, w, h, T) {
    const U = h;
    const col = this.material.color || '#9fd3c7';
    const bench = BENCH_Y * h;
    const bw = BW * U, bh = BH * U;
    const bx = BX * w - bw / 2, by = bench - bh;
    const lvl = clamp(this.level, 0, 1.05);

    // bottle: stands on the bench beside the beaker; lifts and tips neck-down while pouring
    const kT = this.pouring ? 1 : 0;
    this._pourK = this._pourK === undefined ? kT : this._pourK + (kT - this._pourK) * 0.22;
    const k = this._pourK;
    const pourA = -2.05 * k;
    const restX = BX * w + 0.3 * U, restY = bench;                 // base centre at rest
    const pourX = BX * w + 0.28 * U, pourY = by - 0.08 * U;          // base centre while pouring
    const bottleX = restX + (pourX - restX) * k + this.wobble * U * 0.5 * k;
    const bottleY = restY + (pourY - restY) * k;
    const NECK = 0.27 * U;
    if (k < 0.5) benchShadow(g, restX, bench + 0.004 * U, 0.06 * U * (1 - k), 0.012 * U);
    g.save();
    g.translate(bottleX, bottleY);
    g.rotate(pourA);
    // body (flat facets: lit left half, shaded right half)
    rr(g, -0.05 * U, -0.2 * U, 0.1 * U, 0.2 * U, 0.022 * U);
    g.fillStyle = rgba(col, 0.82); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(0.012 * U, -0.19 * U, 0.034 * U, 0.18 * U);
    rr(g, -0.05 * U, -0.2 * U, 0.1 * U, 0.2 * U, 0.022 * U);
    g.strokeStyle = T.glassEdge; g.lineWidth = Math.max(1.5, U * 0.005); g.stroke();
    // shoulder + neck + cap
    poly(g, [[-0.05 * U, -0.19 * U], [0.05 * U, -0.19 * U], [0.018 * U, -0.235 * U], [-0.018 * U, -0.235 * U]], rgba(col, 0.9));
    g.fillStyle = rgba(col, 0.9); g.fillRect(-0.016 * U, -NECK, 0.032 * U, 0.04 * U);
    g.fillStyle = T.steelDark; g.fillRect(-0.019 * U, -NECK - 0.004 * U, 0.038 * U, 0.012 * U);
    // label
    g.fillStyle = T.cream; g.fillRect(-0.04 * U, -0.14 * U, 0.08 * U, 0.07 * U);
    g.fillStyle = T.rust; g.fillRect(-0.04 * U, -0.128 * U, 0.08 * U, 0.012 * U);
    g.fillStyle = 'rgba(34,38,42,0.5)'; g.fillRect(-0.028 * U, -0.104 * U, 0.056 * U, 0.008 * U); g.fillRect(-0.028 * U, -0.09 * U, 0.04 * U, 0.008 * U);
    g.restore();

    // pour stream from the neck tip down to the liquid surface
    const surfY = by + bh * (1 - Math.min(lvl, 1));
    if (this.pouring && k > 0.82) {
      // local (0, -NECK) rotated by pourA
      const tipX = bottleX + NECK * Math.sin(pourA);
      const tipY = bottleY - NECK * Math.cos(pourA);
      const ex = BX * w + this.wobble * U * 2.2;
      g.save();
      g.strokeStyle = rgba(col, 0.92); g.lineCap = 'round';
      g.lineWidth = 0.016 * U;
      g.beginPath(); g.moveTo(tipX, tipY);
      g.bezierCurveTo(tipX - 0.01 * U, tipY + 0.06 * U, ex + Math.sin(this.t * 20) * 0.004 * U, surfY - 0.1 * U, ex, surfY);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 0.005 * U;
      g.beginPath(); g.moveTo(tipX - 0.003 * U, tipY + 0.01 * U);
      g.bezierCurveTo(tipX - 0.013 * U, tipY + 0.06 * U, ex - 0.004 * U, surfY - 0.1 * U, ex - 0.004 * U, surfY);
      g.stroke();
      g.restore();
    }

    benchShadow(g, BX * w, bench + 0.004 * U, bw * 0.62, 0.025 * U);
    // beaker back wall
    rr(g, bx, by, bw, bh, 0.02 * U);
    g.fillStyle = T.glassFill; g.fill();

    // liquid with tilted surface
    if (lvl > 0.001) {
      g.save();
      rr(g, bx + 0.006 * U, by, bw - 0.012 * U, bh - 0.006 * U, 0.016 * U);
      g.clip();
      const tiltPx = this.tilt * 0.05 * U;
      const slosh = Math.sin(this.t * 6) * 0.004 * U * (0.3 + Math.abs(this.tilt));
      const yl = surfY + tiltPx + slosh, yr = surfY - tiltPx - slosh;
      poly(g, [[bx - 2, yl], [bx + bw + 2, yr], [bx + bw + 2, bench + 2], [bx - 2, bench + 2]], rgba(col, 0.82));
      poly(g, [[bx - 2, yl], [bx + bw + 2, yr], [bx + bw + 2, yr + 0.012 * U], [bx - 2, yl + 0.012 * U]], rgba('#ffffff', 0.35));
      // facet shading
      poly(g, [[bx + bw * 0.62, Math.min(yl, yr)], [bx + bw, Math.min(yl, yr)], [bx + bw, bench], [bx + bw * 0.62, bench]], rgba('#000000', 0.10));
      g.restore();
    }

    // target band on the glass
    const bandTop = by + bh * (1 - this.max), bandBot = by + bh * (1 - this.min);
    g.fillStyle = rgba(T.good, 0.28);
    g.fillRect(bx - 0.03 * U, bandTop, bw + 0.06 * U, bandBot - bandTop);
    g.strokeStyle = T.good; g.lineWidth = Math.max(2, U * 0.007);
    g.beginPath();
    g.moveTo(bx - 0.035 * U, bandTop); g.lineTo(bx + bw + 0.035 * U, bandTop);
    g.moveTo(bx - 0.035 * U, bandBot); g.lineTo(bx + bw + 0.035 * U, bandBot);
    g.stroke();
    // graduation marks
    g.strokeStyle = rgba(T.cream, 0.6); g.lineWidth = Math.max(1, U * 0.003);
    for (let i = 1; i < 10; i++) {
      const y = by + bh * (1 - i / 10);
      g.beginPath(); g.moveTo(bx + bw * 0.06, y); g.lineTo(bx + bw * (i % 5 === 0 ? 0.3 : 0.18), y); g.stroke();
    }
    // glass outline + shine
    rr(g, bx, by, bw, bh, 0.02 * U);
    g.strokeStyle = T.glassEdge; g.lineWidth = Math.max(2, U * 0.008); g.stroke();
    g.fillStyle = T.glassShine;
    g.fillRect(bx + bw * 0.78, by + bh * 0.08, bw * 0.06, bh * 0.75);
    ellipse(g, BX * w, by, bw / 2, 0.016 * U, null, T.glassEdge, Math.max(1.5, U * 0.005));

    // drops / splashes
    for (const d of this.drops) {
      g.globalAlpha = clamp(d.life, 0, 1);
      ellipse(g, d.x * w, d.y * h, 0.008 * U, 0.006 * U, col);
    }
    g.globalAlpha = 1;
    if (this.spilled) ellipse(g, BX * w, bench + 0.01 * U, bw * 1.1, 0.03 * U, rgba(col, 0.55));

    // level readout
    const pct = Math.round(lvl * 100);
    const inBand = lvl >= this.min && lvl <= this.max;
    const tagX = bx - 0.06 * U;
    pill(g, `${pct}%`, tagX, Math.max(by + 0.02 * U, surfY), 0.04 * U, inBand ? T.good : lvl > this.max ? T.rust : rgba(T.charcoal, 0.9), inBand ? T.charcoal : T.cream, 'right');
    label(g, `${Math.round(this.min * 100)}–${Math.round(this.max * 100)}%`, bx + bw + 0.05 * U, (bandTop + bandBot) / 2, 0.032 * U, T.good, 'left');

    if (this.settle > 0) {
      const f = 1 - this.settle / SETTLE;
      g.fillStyle = rgba(T.cream, 0.9);
      g.fillRect(BX * w - bw / 2, bench + 0.05 * U, bw * f, 0.012 * U);
    }
  }
}
