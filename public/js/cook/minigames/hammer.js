// HAMMER — nails pop up on a scrap patch; hit each one 3 times to drive it home.
// The van's wobble slides the patch around a little. Score = accuracy × speed.
import { Minigame, clamp, hDist, BENCH_Y } from './Minigame.js';
import { poly, ellipse, rr, benchShadow, pill, label, shade, rgba } from '../draw.js';

const PATCH_X = 0.46, PATCH_Y = 0.56, PATCH_W = 0.62, PATCH_H = 0.36;
const HITS = 3;
const HIT_R = 0.055;  // hit radius (height units)

export class HammerGame extends Minigame {
  constructor(params, ctx) {
    super(params, ctx);
    this.total = Math.max(1, params.nails ?? 4);
    this.parTime = params.parTime ?? (1.2 + this.total * 1.4);
    this.nails = [];
    // scatter nail spots around the patch edge-ish, deterministic via ctx.rand
    const slots = [];
    const cols = Math.ceil(Math.sqrt(this.total * 1.6));
    const rows = Math.ceil(this.total / cols);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) slots.push([(c + 0.5) / cols, (r + 0.5) / rows]);
    for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
    for (let i = 0; i < this.total; i++) {
      const [u, v] = slots[i];
      this.nails.push({ u: 0.12 + u * 0.76 + (this.rand() - 0.5) * 0.06, v: 0.18 + v * 0.64 + (this.rand() - 0.5) * 0.06, hits: 0, shown: false, pop: 0, bend: (this.rand() - 0.5) * 0.3 });
    }
    this.activeMax = Math.min(2, this.total);
    this.hitsDone = 0;
    this.misses = 0;
    this.off = { x: 0, y: 0 };
    this.offV = { x: 0, y: 0 };
    this.swing = 0;          // hammer animation 1 → 0
    this.swingAt = { x: 0.5, y: 0.5 };
    this.sparks = [];
    this._reveal();
  }

  _reveal() {
    let shown = this.nails.filter((n) => n.shown && n.hits < HITS).length;
    for (const n of this.nails) {
      if (shown >= this.activeMax) break;
      if (!n.shown) { n.shown = true; n.pop = 1; shown++; }
    }
  }

  get instructions() {
    if (this.done) return 'Solid. That’ll hold';
    if (this.hitsDone === 0) return 'Tap each nail 3 times to drive it in';
    return 'Keep hammering';
  }
  get cursor() { return 'crosshair'; }
  get nailsDone() { return this.nails.filter((n) => n.hits >= HITS).length; }

  nailPos(n) {
    return {
      x: PATCH_X + this.off.x + (n.u - 0.5) * PATCH_W / (4 / 3),
      y: PATCH_Y + this.off.y + (n.v - 0.5) * PATCH_H,
    };
  }
  /** Active nail positions (focus coords) — handy for automation/tests. */
  targets() { return this.nails.filter((n) => n.shown && n.hits < HITS).map((n) => this.nailPos(n)); }

  pointerDown(nx, ny) {
    super.pointerDown(nx, ny);
    if (this.done || this.failed) return;
    this.swing = 1; this.swingAt = { x: nx, y: ny };
    let best = null, bd = 1e9;
    for (const n of this.nails) {
      if (!n.shown || n.hits >= HITS) continue;
      const p = this.nailPos(n);
      const d = hDist(nx, ny, p.x, p.y);
      if (d < bd) { bd = d; best = n; }
    }
    if (best && bd < HIT_R) {
      best.hits++;
      this.hitsDone++;
      const p = this.nailPos(best);
      for (let k = 0; k < 7; k++) this.sparks.push({ x: p.x, y: p.y, vx: (this.rand() - 0.5) * 0.9, vy: -0.3 - this.rand() * 0.5, life: 0.35 });
      if (best.hits >= HITS) this._reveal();
      this.emit('hammerHit', {});
    } else {
      this.misses++;
      this.emit('hammerMiss', {});
    }
  }

  update(dt, feel = {}) {
    super.update(dt, feel);
    // wobble: lateral acceleration and bumps shove the patch, a spring re-centres it
    const lat = clamp((feel.latAcc || 0) / 5, -1.2, 1.2);
    const tx = lat * 0.035, ty = 0;
    this.offV.x += ((tx - this.off.x) * 26 - this.offV.x * 5) * dt;
    this.offV.y += ((ty - this.off.y) * 26 - this.offV.y * 5) * dt;
    if (feel.bumpHit > this.bumpThreshold() * 0.6) { this.offV.y -= 0.35 * feel.bumpHit; this.offV.x += (this.rand() - 0.5) * 0.5; }
    this.off.x = clamp(this.off.x + this.offV.x * dt, -0.06, 0.06);
    this.off.y = clamp(this.off.y + this.offV.y * dt, -0.05, 0.05);
    this.swing = Math.max(0, this.swing - dt * 7);
    for (const n of this.nails) n.pop = Math.max(0, n.pop - dt * 4);
    for (const s of this.sparks) { s.vy += 2.5 * dt; s.x += s.vx * dt * 0.75; s.y += s.vy * dt; s.life -= dt; }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    if (this.done) return;
    const need = this.total * HITS;
    this._progress = this.hitsDone / need;
    const acc = this.hitsDone / Math.max(1, this.hitsDone + this.misses * 0.6);
    const speed = this.t <= this.parTime ? 1 : clamp(1 - (this.t - this.parTime) / (this.parTime * 2.5), 0.5, 1);
    this._score = clamp(acc * 0.65 + speed * 0.35, 0, 1);
    if (this.hitsDone >= need) this._finish();
  }

  draw(g, w, h, T) {
    const U = h;
    const bench = BENCH_Y * h;
    const pw = PATCH_W * U, ph = PATCH_H * U;
    const cx = (PATCH_X + this.off.x) * w, cy = (PATCH_Y + this.off.y) * h;

    // the "hull" panel the patch is going onto (dented steel section on the bench)
    benchShadow(g, PATCH_X * w, bench + 0.004 * U, pw * 0.62, 0.03 * U);
    poly(g, [[PATCH_X * w - pw * 0.62, bench], [PATCH_X * w + pw * 0.62, bench], [PATCH_X * w + pw * 0.58, bench - 0.04 * U], [PATCH_X * w - pw * 0.58, bench - 0.04 * U]], T.steelDeep);
    // scrap patch: irregular plate, flat facets
    const P = [
      [-0.5, -0.46], [-0.12, -0.52], [0.3, -0.47], [0.52, -0.38], [0.5, 0.1], [0.47, 0.5], [0.05, 0.46], [-0.38, 0.52], [-0.52, 0.2],
    ].map(([x, y]) => [cx + x * pw, cy + y * ph]);
    poly(g, P.map(([x, y]) => [x + 0.008 * U, y + 0.014 * U]), rgba('#000000', 0.3));
    poly(g, P, '#8d8f93', shade('#8d8f93', -0.35), Math.max(1.5, U * 0.004));
    poly(g, [P[0], P[1], P[2], [cx, cy]], shade('#8d8f93', 0.12));
    poly(g, [P[4], P[5], P[6], [cx, cy]], shade('#8d8f93', -0.12));
    poly(g, [P[7], P[8], P[0], [cx, cy]], shade('#8d8f93', -0.05));
    // rust spots
    ellipse(g, cx - pw * 0.28, cy + ph * 0.22, pw * 0.07, ph * 0.05, rgba(T.rust, 0.55));
    ellipse(g, cx + pw * 0.3, cy - ph * 0.25, pw * 0.05, ph * 0.035, rgba(T.rust, 0.45));

    // nails
    for (const n of this.nails) {
      if (!n.shown) continue;
      const p = this.nailPos(n);
      const x = p.x * w, y = p.y * h;
      const sink = n.hits / HITS;
      const pop = 1 - n.pop;
      if (n.hits >= HITS) {
        ellipse(g, x, y, 0.016 * U, 0.01 * U, '#4c5054');
        ellipse(g, x - 0.003 * U, y - 0.002 * U, 0.008 * U, 0.005 * U, '#a0a4a6');
        continue;
      }
      // target ring
      const pr = (0.058 + 0.01 * Math.sin(this.t * 6)) * U * pop;
      g.strokeStyle = rgba(T.mustard, 0.9); g.lineWidth = Math.max(2, U * 0.006);
      g.beginPath(); g.ellipse(x, y, pr, pr * 0.62, 0, 0, Math.PI * 2); g.stroke();
      const shaft = (1 - sink) * 0.095 * U * pop;
      g.strokeStyle = '#b9bdbf'; g.lineWidth = Math.max(2, 0.012 * U); g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + n.bend * 0.02 * U * (1 - sink), y - shaft); g.stroke();
      ellipse(g, x + n.bend * 0.02 * U * (1 - sink), y - shaft, 0.026 * U, 0.011 * U, '#d4d7d6', '#6c7073', 1.5);
      // hit pips
      for (let k = 0; k < HITS; k++) {
        ellipse(g, x - 0.028 * U + k * 0.028 * U, y + 0.055 * U, 0.01 * U, 0.01 * U, k < n.hits ? T.mustard : rgba(T.ink, 0.7));
      }
    }

    // hammer swing at the click point
    if (this.swing > 0) {
      const hx = this.swingAt.x * w, hy = this.swingAt.y * h;
      const a = -0.9 * this.swing;
      g.save(); g.translate(hx, hy); g.rotate(a);
      g.fillStyle = T.woodDark; g.fillRect(0.02 * U, -0.03 * U, 0.3 * U, 0.036 * U);
      g.fillStyle = T.woodLight; g.fillRect(0.02 * U, -0.03 * U, 0.3 * U, 0.01 * U);
      rr(g, -0.05 * U, -0.08 * U, 0.085 * U, 0.135 * U, 0.01 * U); g.fillStyle = '#5c6166'; g.fill();
      g.fillStyle = '#7b8186'; g.fillRect(-0.05 * U, -0.08 * U, 0.085 * U, 0.03 * U);
      g.fillStyle = '#454a4f'; g.fillRect(0.012 * U, -0.08 * U, 0.023 * U, 0.135 * U);
      g.restore();
    }
    for (const s of this.sparks) { g.globalAlpha = clamp(s.life * 3, 0, 1); ellipse(g, s.x * w, s.y * h, 0.006 * U, 0.006 * U, T.flameHot); }
    g.globalAlpha = 1;

    pill(g, `${this.nailsDone} / ${this.total} nails`, PATCH_X * w, (BENCH_Y + 0.085) * h, 0.034 * U, rgba(T.charcoal, 0.88), T.cream);
    if (this.misses) label(g, `${this.misses} miss${this.misses > 1 ? 'es' : ''}`, PATCH_X * w, (BENCH_Y + 0.155) * h, 0.03 * U, T.mustard);
  }
}
