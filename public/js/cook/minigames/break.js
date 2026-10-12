// BREAK — a slab of crystal on the bench; click shards to snap them off and they
// drop into the bags. Bumps can knock a loose shard off the bench (lost). Faster =
// small time bonus. Score = shards bagged / total, × time factor.
import { Minigame, clamp, hDist, BENCH_Y } from './Minigame.js';
import { poly, ellipse, rr, benchShadow, bag, pill, label, shade, rgba } from '../draw.js';

const SLAB_X = 0.4, SLAB_Y = 0.66, SLAB_W = 0.5, SLAB_H = 0.2;
const BAG_X = 0.86;

export class BreakGame extends Minigame {
  constructor(params, ctx) {
    super(params, ctx);
    this.total = Math.max(1, params.shards ?? 6);
    this.parTime = params.parTime ?? (2.2 + this.total * 0.9);
    this.shards = this._makeShards(this.total);
    this.bagged = 0;
    this.lost = 0;
    this.flying = [];
    this.crumbs = [];
    this._bumpCd = 0;
    this.hover = -1;
    this.flashBag = 0;
  }

  _makeShards(n) {
    // split the slab into n columns-ish polygons with jagged vertical cuts
    const cols = n;
    const xs = [0];
    for (let i = 1; i < cols; i++) xs.push(i / cols + (this.rand() - 0.5) * 0.4 / cols);
    xs.push(1);
    const cutTop = xs.map((x, i) => (i === 0 || i === cols) ? x : x + (this.rand() - 0.5) * 0.3 / cols);
    const cutMid = xs.map((x, i) => (i === 0 || i === cols) ? x : x + (this.rand() - 0.5) * 0.5 / cols);
    const out = [];
    for (let i = 0; i < cols; i++) {
      const pts = [
        [cutTop[i], 0], [cutTop[i + 1], 0],
        [cutMid[i + 1], 0.5], [xs[i + 1], 1],
        [xs[i], 1], [cutMid[i], 0.5],
      ];
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      out.push({ pts, cx, cy: 0.5, state: 'on', tone: (this.rand() - 0.5) * 0.18, hp: 1, wob: 0 });
    }
    return out;
  }

  get instructions() {
    if (this.done) return `Bagged ${this.bagged} of ${this.total}`;
    if (this.bagged === 0) return 'Tap the crystal slab to break off shards';
    return 'Keep breaking — fill the bags';
  }
  get cursor() { return 'pointer'; }
  get remaining() { return this.shards.filter((s) => s.state === 'on').length; }

  _shardScreen(s) {
    // shard centre in focus coords
    return { x: SLAB_X - SLAB_W / 2 / (4 / 3) + s.cx * SLAB_W / (4 / 3), y: SLAB_Y - SLAB_H / 2 + s.cy * SLAB_H };
  }

  _pick(nx, ny) {
    let best = -1, bd = 1e9;
    this.shards.forEach((s, i) => {
      if (s.state !== 'on') return;
      const p = this._shardScreen(s);
      const d = hDist(nx, ny, p.x, p.y);
      if (d < bd) { bd = d; best = i; }
    });
    const zs = this.zoneScale;   // difficulty: how forgiving a tap near the slab is
    const inSlab = Math.abs(ny - SLAB_Y) < SLAB_H * 0.75 * zs && Math.abs((nx - SLAB_X) * 4 / 3) < SLAB_W * 0.62 * Math.max(1, zs);
    return inSlab ? best : -1;
  }

  pointerMove(nx, ny) { super.pointerMove(nx, ny); this.hover = this.done ? -1 : this._pick(nx, ny); }

  pointerDown(nx, ny) {
    super.pointerDown(nx, ny);
    if (this.done || this.failed) return;
    const i = this._pick(nx, ny);
    if (i < 0) return;
    this.snap(i);
  }

  /** Break off shard i (also used by automation). */
  snap(i) {
    const s = this.shards[i];
    if (!s || s.state !== 'on') return false;
    s.state = 'fly';
    const p = this._shardScreen(s);
    this.flying.push({ s, x: p.x, y: p.y, t: 0, dur: 0.55, sx: p.x, sy: p.y, rot: 0, lost: false });
    for (let k = 0; k < 6; k++) this.crumbs.push({ x: p.x, y: p.y, vx: (this.rand() - 0.5) * 0.5, vy: -0.4 - this.rand() * 0.4, life: 0.6 });
    return true;
  }

  update(dt, feel = {}) {
    super.update(dt, feel);
    this._bumpCd -= dt;
    this.flashBag = Math.max(0, this.flashBag - dt * 3);
    for (const s of this.shards) s.wob = Math.max(0, s.wob - dt * 3);
    if (!this.done && feel.bumpHit > this.bumpThreshold() && this._bumpCd <= 0) {
      this._bumpCd = 0.6;
      const on = this.shards.filter((s) => s.state === 'on');
      // the outermost shards are the ones that fall
      const edge = on.length ? (this.rand() < 0.5 ? on[0] : on[on.length - 1]) : null;
      on.forEach((s) => { s.wob = 1; });
      if (edge && on.length > 1) {
        edge.state = 'fly';
        const p = this._shardScreen(edge);
        this.flying.push({ s: edge, x: p.x, y: p.y, t: 0, dur: 0.8, sx: p.x, sy: p.y, rot: 0, lost: true, vx: (p.x < SLAB_X ? -0.4 : 0.4), vy: -0.6 });
        this.toast('Bump! A shard fell on the floor', 'bad');
      }
    }
    for (const f of this.flying) {
      f.t += dt;
      const k = clamp(f.t / f.dur, 0, 1);
      if (f.lost) {
        f.vy += 2.6 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += dt * 8;
      } else {
        // arc into the bag mouth
        const ex = BAG_X, ey = 0.5;
        f.x = f.sx + (ex - f.sx) * k;
        f.y = f.sy + (ey - f.sy) * k - Math.sin(k * Math.PI) * 0.22;
        f.rot = k * 4;
      }
      if (k >= 1 && !f.landed) {
        f.landed = true;
        if (f.lost) { this.lost++; f.s.state = 'lost'; }
        else { this.bagged++; f.s.state = 'bag'; this.flashBag = 1; }
      }
    }
    this.flying = this.flying.filter((f) => !f.landed || (f.lost && f.y < 1.2 && f.t < 1.5));
    for (const c of this.crumbs) { c.vy += 2.4 * dt; c.x += c.vx * dt * 0.75; c.y += c.vy * dt; c.life -= dt; }
    this.crumbs = this.crumbs.filter((c) => c.life > 0);

    if (this.done || this.failed) return;
    const settled = this.bagged + this.lost;
    this._progress = settled / this.total;
    const timeF = this.t <= this.parTime ? 1 : clamp(1 - (this.t - this.parTime) / (this.parTime * 3), 0.8, 1);
    this._score = clamp((this.bagged / this.total) * timeF + (this.t <= this.parTime ? 0 : 0), 0, 1);
    if (settled >= this.total) {
      if (this.t < this.parTime * 0.7) this.toast('Fast hands! Speed bonus', 'good');
      this._finish();
    }
  }

  draw(g, w, h, T) {
    const U = h;
    const bench = BENCH_Y * h;
    const col = this.ctx.product?.color || '#7fd6c2';
    const sw = SLAB_W * U, sh = SLAB_H * U;
    const sx = SLAB_X * w - sw / 2, sy = SLAB_Y * h - sh / 2;

    // baking tray under the slab
    benchShadow(g, SLAB_X * w, bench + 0.004 * U, sw * 0.6, 0.03 * U);
    poly(g, [[sx - 0.04 * U, bench - 0.02 * U], [sx + sw + 0.04 * U, bench - 0.02 * U], [sx + sw + 0.02 * U, bench], [sx - 0.02 * U, bench]], T.steelDark);
    poly(g, [[sx - 0.04 * U, bench - 0.025 * U], [sx + sw + 0.04 * U, bench - 0.025 * U], [sx + sw + 0.04 * U, bench - 0.018 * U], [sx - 0.04 * U, bench - 0.018 * U]], T.steelLight);

    // slab shards: top faces first (pseudo-3D thickness), then the fronts
    const depth = 0.045 * U;
    this.shards.forEach((s, i) => {
      if (s.state !== 'on') return;
      const wob = s.wob ? Math.sin(this.t * 50 + i) * s.wob * 0.006 * U : 0;
      const a = [sx + s.pts[0][0] * sw + wob, sy], b = [sx + s.pts[1][0] * sw + wob, sy];
      const hov = i === this.hover;
      poly(g, [a, b, [b[0] + depth * 0.7, b[1] - depth], [a[0] + depth * 0.7, a[1] - depth]], shade(col, 0.25 + s.tone * 0.5 + (hov ? 0.15 : 0)), rgba('#0f2a26', 0.25), 1);
    });
    // right side face of the last remaining shard
    const lastOn = [...this.shards].reverse().find((s) => s.state === 'on');
    if (lastOn) {
      const r0 = [sx + lastOn.pts[1][0] * sw, sy], r1 = [sx + lastOn.pts[3][0] * sw, sy + sh];
      poly(g, [r0, [r0[0] + depth * 0.7, r0[1] - depth], [r1[0] + depth * 0.7, r1[1] - depth], r1], shade(col, -0.32));
    }
    this.shards.forEach((s, i) => {
      if (s.state !== 'on') return;
      const wob = s.wob ? Math.sin(this.t * 50 + i) * s.wob * 0.006 * U : 0;
      const pts = s.pts.map(([x, y]) => [sx + x * sw + wob, sy + y * sh]);
      const hov = i === this.hover;
      const base = shade(col, s.tone + (hov ? 0.22 : 0));
      poly(g, pts, base, rgba('#0f2a26', 0.35), Math.max(1, U * 0.003));
      // facet highlight
      const [a, b, c] = [pts[0], pts[1], pts[2]];
      poly(g, [a, b, [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2]], rgba('#ffffff', 0.22));
      // inner sparkle
      const mx = (pts[0][0] + pts[3][0]) / 2, my = (pts[0][1] + pts[3][1]) / 2;
      poly(g, [[mx, my - 0.02 * U], [mx + 0.008 * U, my], [mx, my + 0.02 * U], [mx - 0.008 * U, my]], rgba('#ffffff', 0.35));
    });

    // bags on the right
    const bw = 0.13 * U, bh = 0.17 * U;
    const bx = BAG_X * w - bw / 2, by = bench - bh;
    const perBag = Math.ceil(this.total / 2);
    const fill1 = Math.min(1, this.bagged / perBag), fill2 = clamp((this.bagged - perBag) / perBag, 0, 1);
    benchShadow(g, BAG_X * w, bench + 0.004 * U, bw * 0.8, 0.02 * U);
    bag(g, bx - bw * 0.35, by + bh * 0.06, bw * 0.92, bh * 0.94, fill2, col);
    g.save();
    if (this.flashBag > 0) { g.translate(BAG_X * w, bench); g.scale(1 + this.flashBag * 0.06, 1 - this.flashBag * 0.04); g.translate(-BAG_X * w, -bench); }
    bag(g, bx + bw * 0.15, by, bw, bh, fill1, col);
    g.restore();

    // flying shards
    for (const f of this.flying) {
      if (f.landed && !f.lost) continue;
      const s = f.s;
      const cx = s.pts.reduce((a, p) => a + p[0], 0) / s.pts.length;
      const pts = s.pts.map(([x, y]) => [(x - cx) * sw * 0.7, (y - 0.5) * sh * 0.7]);
      g.save(); g.translate(f.x * w, f.y * h); g.rotate(f.rot);
      poly(g, pts, shade(col, s.tone), rgba('#0f2a26', 0.35), 1);
      g.restore();
    }
    for (const c of this.crumbs) { g.globalAlpha = clamp(c.life * 2, 0, 1); ellipse(g, c.x * w, c.y * h, 0.006 * U, 0.005 * U, col); }
    g.globalAlpha = 1;

    // readouts
    label(g, `${this.bagged}`, BAG_X * w, by - 0.105 * U, 0.065 * U, T.cream, 'center', 900);
    label(g, `of ${this.total} bagged`, BAG_X * w, by - 0.05 * U, 0.028 * U, rgba(T.cream, 0.85), 'center', 700);
    const tLeft = Math.max(0, this.parTime - this.t);
    pill(g, tLeft > 0 ? `Speed bonus ${tLeft.toFixed(1)}s` : 'No bonus — just bag it', SLAB_X * w, (BENCH_Y + 0.085) * h, 0.032 * U, tLeft > 0 ? T.teal : rgba(T.charcoal, 0.88), T.cream);
    if (this.lost) label(g, `${this.lost} lost on the floor`, SLAB_X * w, (BENCH_Y + 0.155) * h, 0.03 * U, T.mustard);
    void rr;
  }
}
