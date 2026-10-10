// COOL — an ice-bath tray that tilts with the van's lateral acceleration and bumps.
// Move the pointer left/right to counter-tilt ("chase the bubble") and keep the
// level bubble centred for `duration` seconds. If the tray sits at full tilt for
// more than 1 s it slops over (lose a third of the bath; three spills = ruined).
import { Minigame, clamp, BENCH_Y } from './Minigame.js';
import { rr, ellipse, poly, benchShadow, pill, label, shade, rgba, ring } from '../draw.js';

const MAX_TILT = 1;
const CENTRE = 0.22;   // |tilt| below this counts as "centred"
const SPILL_AFTER = 1.0;

export class CoolGame extends Minigame {
  constructor(params, ctx) {
    super(params, ctx);
    this.duration = params.duration ?? 6;
    this.elapsed = 0;
    this.centred = 0;
    this.quality = 0;
    this.d = 0; this.dv = 0;          // disturbance (spring-damper)
    this.wander = 0; this.wanderT = 0;
    this.hand = 0;                    // player's counter-tilt (-1..1), from pointer x
    this._handTarget = 0;
    this.tilt = 0;
    this.maxedFor = 0;
    this.bath = 1;                    // how much of the bath is left
    this.spills = 0;
    this.started = false;
    this.cubes = [];
    for (let i = 0; i < 9; i++) this.cubes.push({ x: (i / 8 - 0.5) * 0.8 + (this.rand() - 0.5) * 0.06, v: 0, s: 0.75 + this.rand() * 0.4, r: this.rand() * 0.6 - 0.3, row: i % 2 });
    this.splash = [];
  }

  get instructions() {
    if (this.done) return 'Cooled and set';
    if (this.maxedFor > 0.2) return 'It’s tipping — move toward the bubble!';
    if (!this.started) return 'Move left/right to keep the bubble centred';
    return Math.abs(this.tilt) < CENTRE ? 'Steady… keep it level' : 'Chase the bubble back to the middle';
  }
  get cursor() { return 'ew-resize'; }

  pointerDown(nx, ny) { super.pointerDown(nx, ny); this._setHand(nx); }
  pointerMove(nx, ny) { super.pointerMove(nx, ny); this._setHand(nx); }
  _setHand(nx) { this._handTarget = clamp((nx - 0.5) * 2.4, -1.2, 1.2); this.started = true; }

  update(dt, feel = {}) {
    super.update(dt, feel);
    // drive: lateral g + slow wander; bumps kick the spring
    this.wanderT -= dt;
    if (this.wanderT <= 0) { this.wanderT = 1.2 + this.rand() * 1.6; this.wander = (this.rand() - 0.5) * 0.9; }
    const drive = clamp((feel.latAcc || 0) / 4.5, -1.3, 1.3) + this.wander;
    this.dv += ((drive - this.d) * 7 - this.dv * 2.6) * dt;
    if (feel.bumpHit > this.bumpThreshold() * 0.6) {
      this.dv += (this.rand() < 0.5 ? -1 : 1) * (1.4 + feel.bumpHit * 2.2);
      this.toast('Bump! Hold the tray', 'bad');
    }
    this.d += this.dv * dt;
    // player's hand follows the pointer quickly but not instantly
    this.hand += (this._handTarget - this.hand) * (1 - Math.exp(-dt * 12));
    // positive tilt = right side down; pointer on the left pushes the left side down
    this.tilt = clamp(this.d + this.hand, -MAX_TILT, MAX_TILT);

    for (const c of this.cubes) {
      c.v += (this.tilt * 0.9 - c.v * 2.2) * dt;
      c.x = clamp(c.x + c.v * dt * 0.6, -0.42, 0.42);
    }
    for (const s of this.splash) { s.vy += 2.4 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; }
    this.splash = this.splash.filter((s) => s.life > 0);

    if (this.done || this.failed) return;
    this.elapsed += dt;
    const ab = Math.abs(this.tilt);
    const q = clamp(1 - Math.max(0, ab - CENTRE * 0.5) / (MAX_TILT - CENTRE * 0.5), 0, 1);
    this.quality += q * dt;
    if (ab < CENTRE) this.centred += dt;
    if (ab >= MAX_TILT * 0.98) this.maxedFor += dt; else this.maxedFor = Math.max(0, this.maxedFor - dt * 2);
    if (this.maxedFor > SPILL_AFTER) {
      this.maxedFor = 0;
      this.spills++;
      this.bath = Math.max(0, this.bath - 0.34);
      this.d *= 0.2; this.dv = 0;
      const side = Math.sign(this.tilt) || 1;
      for (let i = 0; i < 18; i++) this.splash.push({ x: 0.5 + side * 0.3, y: 0.66, vx: side * (0.1 + this.rand() * 0.25), vy: -0.4 - this.rand() * 0.4, life: 0.9 });
      this.toast('Slopped over the side!', 'bad');
      if (this.spills >= 3) { this._fail('Dumped the ice bath'); return; }
    }
    this._progress = clamp(this.elapsed / this.duration, 0, 1);
    const base = this.elapsed > 0 ? this.quality / this.elapsed : 1;
    this._score = clamp(base * (0.4 + 0.6 * this.bath), 0, 1);
    if (this.elapsed >= this.duration) this._finish();
  }

  draw(g, w, h, T) {
    const U = h;
    const bench = BENCH_Y * h;
    const col = this.material.color || '#cfe9f5';
    const cx = 0.5 * w;
    const tw = 0.8 * U, th = 0.17 * U;
    const ang = this.tilt * 0.26;

    benchShadow(g, cx, bench + 0.004 * U, tw * 0.55, 0.03 * U);
    // hands/pivot block
    poly(g, [[cx - 0.05 * U, bench], [cx + 0.05 * U, bench], [cx + 0.03 * U, bench - 0.05 * U], [cx - 0.03 * U, bench - 0.05 * U]], T.steelDeep);

    g.save();
    g.translate(cx, bench - 0.05 * U);
    g.rotate(ang);
    // tray body (flat facets)
    const y0 = -th;
    poly(g, [[-tw / 2, y0], [tw / 2, y0], [tw / 2 - 0.03 * U, 0], [-tw / 2 + 0.03 * U, 0]], '#7f878c');
    poly(g, [[-tw / 2, y0], [-tw / 2 + 0.03 * U, 0], [-tw / 2 + 0.06 * U, 0], [-tw / 2 + 0.02 * U, y0]], '#6a7277');
    poly(g, [[tw / 2, y0], [tw / 2 - 0.03 * U, 0], [tw / 2 - 0.06 * U, 0], [tw / 2 - 0.02 * U, y0]], '#959ca0');
    // water (stays level in world space → counter-rotate the surface)
    g.save();
    g.beginPath(); g.rect(-tw / 2 + 0.02 * U, y0 + 0.01 * U, tw - 0.04 * U, th - 0.012 * U); g.clip();
    const wl = y0 + th * (0.32 + (1 - this.bath) * 0.5);
    const tanA = Math.tan(-ang);
    poly(g, [[-tw, wl - tanA * -tw], [tw, wl - tanA * tw], [tw, 0.1 * U], [-tw, 0.1 * U]], rgba('#9fc9d8', 0.85));
    poly(g, [[-tw, wl - tanA * -tw], [tw, wl - tanA * tw], [tw, wl - tanA * tw + 0.008 * U], [-tw, wl - tanA * -tw + 0.008 * U]], rgba('#ffffff', 0.5));
    g.restore();
    // ice cubes bobbing
    for (const c of this.cubes) {
      const x = c.x * tw;
      const s = 0.055 * U * c.s;
      const y = y0 + th * 0.36 + c.row * 0.012 * U - tanA * x + (1 - this.bath) * th * 0.5;
      g.save(); g.translate(x, y); g.rotate(c.r - ang * 0.5);
      poly(g, [[-s / 2, -s / 2], [s / 2, -s / 2], [s / 2, s / 2], [-s / 2, s / 2]], shade(col, -0.02));
      poly(g, [[-s / 2, -s / 2], [s / 2, -s / 2], [s * 0.2, -s * 0.1], [-s / 2, -s * 0.1]], rgba('#ffffff', 0.55));
      g.restore();
    }
    // the dish of product in the middle
    const dw = 0.26 * U;
    poly(g, [[-dw / 2, y0 + 0.02 * U], [dw / 2, y0 + 0.02 * U], [dw / 2 - 0.02 * U, y0 + 0.07 * U], [-dw / 2 + 0.02 * U, y0 + 0.07 * U]], rgba('#e7f1ee', 0.65), T.glassEdge, 2);
    poly(g, [[-dw / 2 + 0.012 * U, y0 + 0.03 * U], [dw / 2 - 0.012 * U, y0 + 0.03 * U], [dw / 2 - 0.026 * U, y0 + 0.062 * U], [-dw / 2 + 0.026 * U, y0 + 0.062 * U]], rgba(this.ctx.product?.color || '#7fd6c2', 0.85));
    // rim
    g.fillStyle = '#a8aeb1'; g.fillRect(-tw / 2 - 0.01 * U, y0 - 0.012 * U, tw + 0.02 * U, 0.014 * U);
    g.restore();

    // splashes
    for (const s of this.splash) { g.globalAlpha = clamp(s.life, 0, 1); ellipse(g, s.x * w, s.y * h, 0.01 * U, 0.008 * U, '#9fc9d8'); }
    g.globalAlpha = 1;

    // spirit level (big, above the tray)
    const lx = cx, ly = 0.3 * h, lw = 0.56 * U, lh = 0.075 * U;
    rr(g, lx - lw / 2 - 0.02 * U, ly - lh / 2 - 0.016 * U, lw + 0.04 * U, lh + 0.032 * U, 0.03 * U);
    g.fillStyle = T.mustard; g.fill();
    rr(g, lx - lw / 2, ly - lh / 2, lw, lh, lh / 2);
    g.fillStyle = '#c9dfa0'; g.fill();
    g.fillStyle = rgba(T.good, 0.55);
    g.fillRect(lx - lw * CENTRE * 0.5, ly - lh / 2, lw * CENTRE, lh);
    g.strokeStyle = T.charcoal; g.lineWidth = Math.max(2, U * 0.005);
    g.beginPath();
    g.moveTo(lx - lw * CENTRE * 0.5, ly - lh / 2); g.lineTo(lx - lw * CENTRE * 0.5, ly + lh / 2);
    g.moveTo(lx + lw * CENTRE * 0.5, ly - lh / 2); g.lineTo(lx + lw * CENTRE * 0.5, ly + lh / 2);
    g.stroke();
    // bubble goes to the high side: right side down (tilt > 0) → bubble left
    const bxp = lx - this.tilt * (lw / 2 - lh * 0.55);
    ellipse(g, bxp, ly, lh * 0.55, lh * 0.36, rgba('#ffffff', 0.92), rgba(T.charcoal, 0.5), 1.5);
    ellipse(g, bxp - lh * 0.15, ly - lh * 0.1, lh * 0.16, lh * 0.08, '#ffffff');
    if (this.maxedFor > 0.15) {
      const f = this.maxedFor / SPILL_AFTER;
      g.strokeStyle = T.bad; g.lineWidth = Math.max(3, U * 0.01);
      rr(g, lx - lw / 2 - 0.02 * U, ly - lh / 2 - 0.016 * U, lw + 0.04 * U, lh + 0.032 * U, 0.03 * U);
      g.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(this.t * 14)); g.stroke(); g.globalAlpha = 1;
      void f;
    }
    // arrows hinting the move direction
    if (!this.done && Math.abs(this.tilt) > CENTRE) {
      const dir = -Math.sign(this.tilt); // move toward the bubble
      const ax = lx + dir * (lw / 2 + 0.07 * U);
      poly(g, [[ax + dir * 0.03 * U, ly], [ax - dir * 0.01 * U, ly - 0.03 * U], [ax - dir * 0.01 * U, ly + 0.03 * U]], T.mustard);
    }

    ring(g, 0.86 * w, 0.3 * h, 0.045 * U, this._progress, T.teal, rgba(T.ink, 0.6), Math.max(4, U * 0.013));
    label(g, `${Math.max(0, this.duration - this.elapsed).toFixed(1)}s`, 0.86 * w, 0.3 * h, 0.027 * U, T.cream, 'center', 900);
    const msg = this.spills ? `Bath ${Math.round(this.bath * 100)}% · ${this.spills} spill${this.spills > 1 ? 's' : ''}` : `Level ${Math.round((1 - Math.abs(this.tilt)) * 100)}%`;
    pill(g, msg, cx, (BENCH_Y + 0.085) * h, 0.032 * U, this.spills ? T.rust : rgba(T.charcoal, 0.88), T.cream);
  }
}
