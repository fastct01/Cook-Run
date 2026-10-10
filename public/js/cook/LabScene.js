// LabScene — draws the back of the RV around the minigame focus area (Canvas2D).
// View-only: reads CookLab state, keeps its own animation state. Unity port: the lab
// diorama prefab (wall, window+curtains, vent, shelf, extinguisher, bench) + overlays.
import { THEME as T, font } from './theme.js';
import { rr, poly, ellipse, shade, rgba, flame, label, lathe, rim, benchShadow, bag } from './draw.js';
import { ASPECT, BENCH_Y } from './minigames/Minigame.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const WALL = '#474a43', WALL_SEAM = '#393b35', WALL_HI = '#51544c';
const CEIL = '#2c2e2b';

export class LabScene {
  constructor() {
    this.t = 0;
    this.curtain = 0;       // 0 open → 1 closed (animated)
    this.vent = 0;          // 0 closed → 1 open (animated)
    this.fan = 0;           // fan rotation
    this.scroll = 0;        // outside scenery scroll (px in window space)
    this.cop = 0;           // cop car slide-in 0..1
    this.puffs = [];        // fire smoke puffs
    this.haze = [];         // fumes blobs
    for (let i = 0; i < 7; i++) this.haze.push({ x: Math.random(), y: 0.2 + Math.random() * 0.6, r: 0.25 + Math.random() * 0.25, s: 0.3 + Math.random() * 0.6, p: Math.random() * 6 });
    this.vfx = [];          // vent suction streaks
    this.layout = null;
    this.hotspots = [];
  }

  update(dt, lab) {
    this.t += dt;
    const k = 1 - Math.exp(-dt * 7);
    this.curtain += ((lab.curtainsClosed ? 1 : 0) - this.curtain) * k;
    this.vent += ((lab.ventOpen ? 1 : 0) - this.vent) * k;
    this.fan += dt * (2 + this.vent * 16);
    this.scroll += dt * (6 + Math.abs(lab.feel.speed || 0) * 9);
    this.cop += ((lab.alert.copClose ? 1 : 0) - this.cop) * (1 - Math.exp(-dt * 2.5));
    if (lab.fire > 0 && Math.random() < dt * (6 + lab.fire * 14)) this.puffs.push({ x: (Math.random() - 0.5) * 0.15, y: 0, life: 1, s: 0.5 + Math.random() * 0.6 });
    for (const p of this.puffs) { p.y += dt * 0.22; p.x += dt * 0.03 * (this.vent ? 1.5 : 0.3); p.life -= dt * 0.7; }
    this.puffs = this.puffs.filter((p) => p.life > 0);
    for (const h of this.haze) { h.x += dt * 0.02 * h.s * (this.vent > 0.5 ? 2.5 : 1); if (h.x > 1.3) h.x = -0.3; }
  }

  /** Compute focus rect + prop placement for a canvas of W×H css px. */
  computeLayout(W, H) {
    const cH = clamp(H * 0.05, 12, 40);
    // leave a band of wall for the window/shelf/extinguisher on big canvases,
    // give the minigame nearly everything on small ones
    const small = Math.min(W, H) < 420;
    const fh = Math.max(40, Math.min((H - cH) * (small ? 0.93 : 0.84), (W * (small ? 0.86 : 0.8)) / ASPECT));
    const fw = fh * ASPECT;
    const fx = (W - fw) / 2;
    const fy = H - fh;
    const benchY = fy + BENCH_Y * fh;
    const topFree = fy - cH;
    const L = { W, H, cH, fx, fy, fw, fh, benchY, U: fh };

    // window: left margin → top band → top-left corner of the focus area
    let reg;
    if (fx >= 0.3 * fh) reg = { x: 0, y: cH, w: fx, h: Math.max(fh * 0.25, benchY - fh * 0.46 - cH) };
    else if (topFree >= 0.22 * fh) reg = { x: 0, y: cH, w: Math.min(W * 0.36, fx + fw * 0.34), h: topFree + fh * 0.05 };
    else reg = { x: 0, y: cH, w: fx + fw * 0.22, h: fy + fh * 0.34 - cH };
    const ww = Math.min(reg.w * 0.82, reg.h * 0.8 * 1.3, fh * 0.55);
    const wh = ww / 1.3;
    L.win = { x: reg.x + (reg.w - ww) / 2, y: reg.y + (reg.h - wh) / 2 + wh * 0.02, w: ww, h: wh };

    // extinguisher: left margin if there's room, else front-left corner of the focus area
    const eh = fh * 0.3, ew = eh * 0.32;
    if (fx >= 0.16 * fh) L.ext = { x: fx * 0.5 - ew / 2, y: benchY - eh - fh * 0.05, w: ew, h: eh };
    else L.ext = { x: fx + fw * 0.035, y: fy + fh * 0.44, w: ew * 0.85, h: eh * 0.85 };

    // shelf of ingredient jars: top band if tall, else right margin if wide, else none
    if (topFree >= 0.16 * fh) {
      const x0 = L.win.x + L.win.w + fh * 0.06, x1 = W - fh * 0.38;
      L.shelf = { x: x0, y: cH + topFree * 0.18, w: Math.max(0, x1 - x0), h: topFree * 0.72, rows: 1 };
    } else if (fx >= 0.28 * fh) {
      L.shelf = { x: fx + fw + fx * 0.06, y: cH + fh * 0.08, w: fx * 0.88, h: benchY - cH - fh * 0.2, rows: 2 };
    } else L.shelf = null;
    if (L.shelf && (L.shelf.w < fh * 0.3 || L.shelf.h < 18)) L.shelf = null;

    // roof vent: top-right corner
    const vw = clamp(fh * 0.24, 46, 170);
    L.vent = { x: W - vw - Math.max(8, fh * 0.03), y: cH - 2, w: vw, h: vw * 0.36 };

    this.layout = L;
    this.hotspots = [
      { id: 'curtains', ...L.win },
      { id: 'vent', x: L.vent.x, y: 0, w: L.vent.w, h: L.vent.y + L.vent.h },
      { id: 'extinguisher', ...L.ext },
    ];
    return L;
  }

  /** px → focus normalised coords. */
  toFocus(px, py) {
    const L = this.layout;
    return L ? { x: (px - L.fx) / L.fw, y: (py - L.fy) / L.fh } : { x: 0, y: 0 };
  }
  hitHotspot(px, py) {
    for (const h of this.hotspots) if (px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) return h.id;
    return null;
  }

  // ═══ background (wall, window, vent, shelf, extinguisher, bench) ═══════════
  drawBackground(g, lab) {
    const L = this.layout;
    const { W, H, cH, benchY, U } = L;
    // wall panels
    g.fillStyle = WALL; g.fillRect(0, 0, W, H);
    const pw = Math.max(40, U * 0.22);
    for (let x = -((this.t * 0) % pw), i = 0; x < W; x += pw, i++) {
      g.fillStyle = i % 2 ? WALL : shade(WALL, 0.03);
      g.fillRect(x, cH, pw, benchY - cH);
      g.fillStyle = WALL_SEAM; g.fillRect(x, cH, Math.max(1, U * 0.004), benchY - cH);
      g.fillStyle = WALL_HI;
      for (let y = cH + U * 0.05; y < benchY - U * 0.05; y += U * 0.12) ellipse(g, x + pw * 0.08, y, U * 0.004, U * 0.004, WALL_HI);
    }
    // warm lamp pool on the wall
    const lg = g.createRadialGradient(W * 0.5, cH, 0, W * 0.5, cH, Math.max(W, H) * 0.7);
    lg.addColorStop(0, 'rgba(241, 222, 180, 0.16)'); lg.addColorStop(1, 'rgba(241, 222, 180, 0)');
    g.fillStyle = lg; g.fillRect(0, 0, W, benchY);
    // ceiling + caged work lamp
    g.fillStyle = CEIL; g.fillRect(0, 0, W, cH);
    g.fillStyle = shade(CEIL, 0.12); g.fillRect(0, cH - Math.max(2, U * 0.008), W, Math.max(2, U * 0.008));
    const lx = W * 0.5, lw = Math.min(W * 0.2, U * 0.36), lh = Math.max(8, cH * 0.5);
    const flick = lab.fire > 0 ? 0.85 + 0.15 * Math.sin(this.t * 37) : 1;
    const beam = g.createLinearGradient(0, cH, 0, cH + U * 0.5);
    beam.addColorStop(0, `rgba(250, 232, 190, ${0.16 * flick})`); beam.addColorStop(1, 'rgba(250, 232, 190, 0)');
    poly(g, [[lx - lw * 0.5, cH], [lx + lw * 0.5, cH], [lx + lw * 1.4, cH + U * 0.5], [lx - lw * 1.4, cH + U * 0.5]], beam);
    rr(g, lx - lw / 2 - 3, cH * 0.5 - lh / 2 - 2, lw + 6, lh + 4, 4); g.fillStyle = '#1d1f1d'; g.fill();
    rr(g, lx - lw / 2, cH * 0.5 - lh / 2, lw, lh, 3); g.fillStyle = `rgba(246, 231, 192, ${flick})`; g.fill();
    g.fillStyle = 'rgba(29,31,29,0.75)';
    for (let i = 1; i < 6; i++) g.fillRect(lx - lw / 2 + (lw * i) / 6 - 1, cH * 0.5 - lh / 2, 2, lh);

    this._drawWindow(g, lab);
    this._drawVent(g, lab);
    if (L.shelf) this._drawShelf(g, lab);
    this._drawExtinguisher(g, lab);
    this._drawBench(g);
  }

  _drawWindow(g, lab) {
    const { x, y, w, h } = this.layout.win;
    const U = this.layout.U;
    const fr = Math.max(3, w * 0.05);
    // frame
    rr(g, x - fr, y - fr, w + fr * 2, h + fr * 2, fr * 1.4); g.fillStyle = '#d8d0bc'; g.fill();
    rr(g, x - fr, y - fr, w + fr * 2, h + fr * 2, fr * 1.4); g.strokeStyle = shade('#d8d0bc', -0.3); g.lineWidth = 1; g.stroke();
    g.save();
    rr(g, x, y, w, h, fr * 0.8); g.clip();
    // sky
    g.fillStyle = T.sky; g.fillRect(x, y, w, h);
    g.fillStyle = '#f0d6ac'; g.fillRect(x, y + h * 0.35, w, h * 0.2);
    // distant mesas (slow parallax)
    const far = (this.scroll * 0.05) % (w * 1.2);
    for (let k = -1; k < 3; k++) {
      const bx = x + k * w * 0.6 + far;
      poly(g, [[bx, y + h * 0.58], [bx + w * 0.08, y + h * 0.4], [bx + w * 0.3, y + h * 0.38], [bx + w * 0.36, y + h * 0.58]], '#c48a5c');
      poly(g, [[bx + w * 0.08, y + h * 0.4], [bx + w * 0.16, y + h * 0.4], [bx + w * 0.14, y + h * 0.58], [bx, y + h * 0.58]], '#a9714a');
    }
    // ground + road shoulder
    g.fillStyle = '#d6b98a'; g.fillRect(x, y + h * 0.56, w, h * 0.44);
    g.fillStyle = '#5b5750'; g.fillRect(x, y + h * 0.82, w, h * 0.18);
    g.fillStyle = '#e8dcb8';
    const dash = w * 0.22, off = (this.scroll * 0.9) % dash;
    for (let dx = -dash + off; dx < w; dx += dash) g.fillRect(x + dx, y + h * 0.9, dash * 0.5, Math.max(1.5, h * 0.025));
    // near posts / cacti (fast)
    const sp = w * 0.55, o2 = (this.scroll * 0.6) % sp;
    for (let dx = -sp + o2; dx < w + sp; dx += sp) {
      const px = x + dx;
      g.fillStyle = '#7e9b6e';
      rr(g, px, y + h * 0.5, w * 0.05, h * 0.3, w * 0.02); g.fill();
      rr(g, px - w * 0.04, y + h * 0.58, w * 0.04, w * 0.025, w * 0.01); g.fill();
      rr(g, px - w * 0.04, y + h * 0.53, w * 0.022, h * 0.08, w * 0.01); g.fill();
    }
    // cop car alongside
    if (this.cop > 0.01) {
      const cx = x + w * (1.25 - this.cop * 0.75);
      const cy = y + h * 0.84;
      const cw = w * 0.62, ch = h * 0.24;
      poly(g, [[cx - cw / 2, cy], [cx + cw / 2, cy], [cx + cw / 2, cy - ch * 0.55], [cx + cw * 0.22, cy - ch * 0.6], [cx + cw * 0.08, cy - ch], [cx - cw * 0.22, cy - ch], [cx - cw * 0.34, cy - ch * 0.6], [cx - cw / 2, cy - ch * 0.55]], '#1f2a44');
      g.fillStyle = '#f1f1ee'; g.fillRect(cx - cw * 0.2, cy - ch * 0.55, cw * 0.36, ch * 0.4);
      g.fillStyle = '#2e3a40'; poly(g, [[cx - cw * 0.2, cy - ch * 0.62], [cx + cw * 0.18, cy - ch * 0.62], [cx + cw * 0.05, cy - ch * 0.93], [cx - cw * 0.18, cy - ch * 0.93]], '#2e3a40');
      const flash = Math.floor(this.t * 6) % 2;
      g.fillStyle = flash ? '#e0453a' : '#3f6fd8'; g.fillRect(cx - cw * 0.14, cy - ch * 1.08, cw * 0.12, ch * 0.1);
      g.fillStyle = flash ? '#3f6fd8' : '#e0453a'; g.fillRect(cx - cw * 0.02, cy - ch * 1.08, cw * 0.12, ch * 0.1);
      ellipse(g, cx - cw * 0.3, cy, ch * 0.2, ch * 0.2, '#1a1c1e');
      ellipse(g, cx + cw * 0.3, cy, ch * 0.2, ch * 0.2, '#1a1c1e');
    }
    // glass sheen
    poly(g, [[x + w * 0.1, y], [x + w * 0.24, y], [x + w * 0.04, y + h], [x - w * 0.1, y + h]], 'rgba(255,255,255,0.10)');
    g.restore();

    // curtains (rod + two pleated panels)
    const c = this.curtain;
    const rodY = y - fr * 1.6;
    g.fillStyle = '#6b5a45'; g.fillRect(x - fr * 2.4, rodY - fr * 0.35, w + fr * 4.8, Math.max(2, fr * 0.7));
    const minW = w * 0.15, maxW = w * 0.5 + fr * 1.2;
    const panW = minW + (maxW - minW) * c;
    const drop = h + fr * 3.4;
    for (const side of [-1, 1]) {
      const px0 = side < 0 ? x - fr * 1.6 : x + w + fr * 1.6 - panW;
      const n = Math.max(3, Math.round(panW / Math.max(4, w * 0.045)));
      const sw = panW / n;
      for (let i = 0; i < n; i++) {
        const xx = px0 + i * sw;
        const sway = Math.sin(this.t * 1.7 + i * 0.6 + side) * (1 - c * 0.6) * w * 0.006;
        g.fillStyle = i % 2 ? T.curtain : T.curtainDark;
        g.beginPath();
        g.moveTo(xx, rodY);
        g.lineTo(xx + sw + 0.5, rodY);
        g.lineTo(xx + sw + 0.5 + sway, rodY + drop);
        g.lineTo(xx + sway, rodY + drop);
        g.closePath(); g.fill();
      }
      // tie-back when open
      if (c < 0.5) {
        g.fillStyle = T.mustard;
        g.fillRect(px0, rodY + drop * 0.55, panW, Math.max(2, h * 0.04));
      }
    }
    // cop light wash through the window
    if (this.cop > 0.05) {
      const flash = Math.floor(this.t * 6) % 2;
      const r = Math.max(w, h) * 1.4;
      const rg = g.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, r);
      const col = flash ? '224,69,58' : '63,111,216';
      rg.addColorStop(0, `rgba(${col}, ${0.32 * this.cop * (1 - c * 0.7)})`); rg.addColorStop(1, `rgba(${col}, 0)`);
      g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2 + w, r * 2 + h);
    }
    void U;
  }

  _drawVent(g, lab) {
    const { x, y, w, h } = this.layout.vent;
    // housing
    poly(g, [[x, y], [x + w, y], [x + w - h * 0.25, y + h], [x + h * 0.25, y + h]], '#5b6166', shade('#5b6166', -0.3), 1);
    const ix = x + h * 0.32, iw = w - h * 0.64, iy = y + h * 0.16, ih = h * 0.66;
    g.save(); rr(g, ix, iy, iw, ih, 2); g.clip();
    g.fillStyle = this.vent > 0.5 ? '#efe2c2' : '#1f2224'; g.fillRect(ix, iy, iw, ih);
    if (this.vent > 0.05) {
      // fan blades (seen through slats)
      const cx = ix + iw / 2, cy = iy + ih / 2, r = ih * 0.9;
      for (let i = 0; i < 4; i++) {
        const a = this.fan + i * Math.PI / 2;
        poly(g, [[cx, cy], [cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.5], [cx + Math.cos(a + 0.5) * r, cy + Math.sin(a + 0.5) * r * 0.5]], rgba('#3a3f43', 0.75 * this.vent));
      }
    }
    // slats: rotate from closed (solid) to open (thin)
    const n = 4;
    for (let i = 0; i < n; i++) {
      const sy = iy + (i + 0.5) * (ih / n);
      const th = (ih / n) * (1 - this.vent * 0.78);
      g.fillStyle = i % 2 ? '#8e959a' : '#7c8388';
      g.fillRect(ix, sy - th / 2, iw, th);
    }
    g.restore();
    // status lamp
    ellipse(g, x + w - h * 0.42, y + h * 0.5, h * 0.09, h * 0.09, this.vent > 0.5 ? T.good : T.rust);
    // daylight shaft + smoke pull when open
    if (this.vent > 0.05) {
      const sg = g.createLinearGradient(0, y + h, 0, y + h + this.layout.fh * 0.5);
      sg.addColorStop(0, `rgba(241, 230, 200, ${0.12 * this.vent})`); sg.addColorStop(1, 'rgba(241, 230, 200, 0)');
      g.fillStyle = sg;
      poly(g, [[ix, y + h], [ix + iw, y + h], [ix + iw + w * 0.3, y + h + this.layout.fh * 0.5], [ix - w * 0.3, y + h + this.layout.fh * 0.5]], sg);
      if (lab.fumes > 0.05 || lab.cooking) {
        for (let i = 0; i < 5; i++) {
          const f = (this.t * 0.7 + i / 5) % 1;
          g.globalAlpha = (1 - f) * 0.35 * this.vent * clamp(lab.fumes * 3 + 0.3, 0, 1);
          ellipse(g, ix + iw * (0.2 + 0.15 * i) + Math.sin(f * 5 + i) * 4, y + h + (1 - f) * h * 2.4, h * 0.25 * (1 - f * 0.5), h * 0.14, '#d7d2bf');
        }
        g.globalAlpha = 1;
      }
    }
  }

  _drawShelf(g, lab) {
    const S = this.layout.shelf;
    const ids = Object.keys(lab.ingredients);
    const rows = S.rows;
    const perRow = Math.ceil(ids.length / rows);
    const rowH = S.h / rows;
    const s = Math.min(rowH * 0.62, (S.w / perRow) * 0.66);
    if (s < 10) return;
    ids.forEach((id, i) => {
      const r = Math.floor(i / perRow), c = i % perRow;
      const plankY = S.y + rowH * (r + 1) - rowH * 0.1;
      if (c === 0) {
        g.fillStyle = T.woodDark; g.fillRect(S.x - s * 0.15, plankY, S.w + s * 0.3, Math.max(3, s * 0.14));
        g.fillStyle = T.woodLight; g.fillRect(S.x - s * 0.15, plankY, S.w + s * 0.3, Math.max(1, s * 0.04));
        // brackets
        g.fillStyle = '#2f3330';
        poly(g, [[S.x + s * 0.1, plankY + s * 0.14], [S.x + s * 0.25, plankY + s * 0.14], [S.x + s * 0.1, plankY + s * 0.5]], '#2f3330');
        poly(g, [[S.x + S.w - s * 0.1, plankY + s * 0.14], [S.x + S.w - s * 0.25, plankY + s * 0.14], [S.x + S.w - s * 0.1, plankY + s * 0.5]], '#2f3330');
      }
      const cx = S.x + (S.w / perRow) * (c + 0.5);
      const info = lab.ingredients[id];
      const have = lab.inv.mat?.[id] || 0;
      const fill = clamp(have / 3, 0, 1);
      const jw = s * 0.72, jh = s;
      const jx = cx - jw / 2, jy = plankY - jh;
      // jar glass
      rr(g, jx, jy + jh * 0.12, jw, jh * 0.88, jw * 0.16);
      g.fillStyle = 'rgba(214,236,230,0.16)'; g.fill();
      if (fill > 0) {
        g.save(); rr(g, jx + 1.5, jy + jh * 0.14, jw - 3, jh * 0.84, jw * 0.14); g.clip();
        const fy = jy + jh - jh * 0.8 * fill;
        g.fillStyle = info.color; g.fillRect(jx, fy, jw, jh);
        g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(jx + jw * 0.62, fy, jw * 0.38, jh);
        g.restore();
      }
      rr(g, jx, jy + jh * 0.12, jw, jh * 0.88, jw * 0.16);
      g.strokeStyle = 'rgba(241,234,216,0.7)'; g.lineWidth = Math.max(1, s * 0.05); g.stroke();
      // lid
      g.fillStyle = have ? T.rust : '#5f666c'; rr(g, jx - jw * 0.04, jy, jw * 1.08, jh * 0.16, jw * 0.06); g.fill();
      // count tag
      const tag = `${have}`;
      g.font = font(900, s * 0.36);
      const tw = Math.max(s * 0.42, g.measureText(tag).width + s * 0.2);
      rr(g, cx - tw / 2, jy + jh * 0.42, tw, s * 0.4, s * 0.1);
      g.fillStyle = have ? T.cream : rgba(T.cream, 0.45); g.fill();
      g.fillStyle = T.charcoal; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(tag, cx, jy + jh * 0.62 + 0.5);
    });
  }

  _drawExtinguisher(g, lab) {
    const { x, y, w, h } = this.layout.ext;
    // wall bracket
    g.fillStyle = '#2f3330'; g.fillRect(x - w * 0.15, y + h * 0.42, w * 1.3, h * 0.07);
    // body
    rr(g, x, y + h * 0.18, w, h * 0.82, w * 0.4); g.fillStyle = lab.extinguisher > 0 ? '#b8503a' : '#6d4a40'; g.fill();
    rr(g, x + w * 0.62, y + h * 0.22, w * 0.3, h * 0.72, w * 0.2); g.fillStyle = 'rgba(0,0,0,0.18)'; g.fill();
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + w * 0.16, y + h * 0.26, w * 0.14, h * 0.6);
    // label band
    g.fillStyle = T.cream; g.fillRect(x, y + h * 0.5, w, h * 0.16);
    // valve + hose
    g.fillStyle = '#2f3330'; g.fillRect(x + w * 0.3, y + h * 0.08, w * 0.4, h * 0.12);
    g.strokeStyle = '#2f3330'; g.lineWidth = Math.max(2, w * 0.14); g.lineCap = 'round';
    g.beginPath(); g.moveTo(x + w * 0.7, y + h * 0.12); g.quadraticCurveTo(x + w * 1.5, y + h * 0.2, x + w * 1.15, y + h * 0.6); g.stroke();
    // charges
    for (let i = 0; i < lab.extinguisherMax; i++) {
      ellipse(g, x + w * (0.22 + i * 0.28), y + h * 0.58, w * 0.09, w * 0.09, i < lab.extinguisher ? T.charcoal : rgba(T.charcoal, 0.25));
    }
    if (lab.fire > 0 && lab.extinguisher > 0) {
      g.strokeStyle = rgba(T.mustard, 0.5 + 0.5 * Math.abs(Math.sin(this.t * 8)));
      g.lineWidth = Math.max(2, w * 0.1);
      rr(g, x - w * 0.3, y, w * 1.6, h * 1.04, w * 0.3); g.stroke();
    }
  }

  _drawBench(g) {
    const { W, H, benchY, U } = this.layout;
    // back splash shadow on the wall
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, benchY - U * 0.075, W, U * 0.02);
    // top surface (seen from slightly above)
    g.fillStyle = T.wood; g.fillRect(0, benchY - U * 0.06, W, U * 0.07);
    g.fillStyle = shade(T.wood, 0.06);
    const plank = U * 0.5;
    for (let x = 0; x < W; x += plank) g.fillRect(x + plank * 0.02, benchY - U * 0.06, plank * 0.46, U * 0.07);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let x = plank * 0.5; x < W; x += plank) g.fillRect(x, benchY - U * 0.06, Math.max(1, U * 0.003), U * 0.07);
    // front lip
    g.fillStyle = T.woodLight; g.fillRect(0, benchY + U * 0.01, W, U * 0.012);
    g.fillStyle = T.woodDark; g.fillRect(0, benchY + U * 0.022, W, U * 0.03);
    // steel front panel with dents + rivets
    g.fillStyle = '#4d5459'; g.fillRect(0, benchY + U * 0.052, W, H - benchY);
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, benchY + U * 0.052, W, U * 0.012);
    const step = U * 0.34;
    for (let x = step * 0.5, i = 0; x < W; x += step, i++) {
      g.fillStyle = '#41474c'; g.fillRect(x, benchY + U * 0.064, Math.max(1, U * 0.004), H);
      ellipse(g, x - step * 0.42, benchY + U * 0.085, U * 0.005, U * 0.005, '#6a7177');
      if (i % 3 === 1) ellipse(g, x - step * 0.2, benchY + U * 0.14, U * 0.05, U * 0.018, 'rgba(0,0,0,0.12)');
      if (i % 4 === 2) ellipse(g, x - step * 0.7, benchY + U * 0.17, U * 0.03, U * 0.012, 'rgba(255,255,255,0.05)');
    }
  }

  // ═══ idle bench props (no batch running) ═════════════════════════════════════
  drawIdleProps(g, lab) {
    const { fx, fy, fw, fh, benchY } = this.layout;
    const U = fh;
    const X = (n) => fx + n * fw;
    // burner + pot
    const bx = X(0.3);
    benchShadow(g, bx, benchY + 0.004 * U, 0.15 * U, 0.025 * U);
    rr(g, bx - 0.15 * U, benchY - 0.06 * U, 0.3 * U, 0.06 * U, 0.01 * U); g.fillStyle = T.steelDark; g.fill();
    g.fillStyle = T.steel; g.fillRect(bx - 0.14 * U, benchY - 0.055 * U, 0.28 * U, 0.01 * U);
    const top = lathe(g, bx, [[0.12 * U, benchY - 0.22 * U], [0.12 * U, benchY - 0.14 * U], [0.11 * U, benchY - 0.065 * U]], '#7d858b', { seg: 7, tilt: 0.26 });
    rim(g, top, '#a6adb1', '#3f454a', 0.01 * U);
    // beaker
    const kx = X(0.55);
    benchShadow(g, kx, benchY + 0.004 * U, 0.06 * U, 0.015 * U);
    rr(g, kx - 0.05 * U, benchY - 0.2 * U, 0.1 * U, 0.2 * U, 0.012 * U);
    g.fillStyle = 'rgba(214,236,230,0.18)'; g.fill();
    g.fillStyle = rgba('#9fd3c7', 0.7); g.fillRect(kx - 0.046 * U, benchY - 0.08 * U, 0.092 * U, 0.078 * U);
    rr(g, kx - 0.05 * U, benchY - 0.2 * U, 0.1 * U, 0.2 * U, 0.012 * U);
    g.strokeStyle = T.glassEdge; g.lineWidth = Math.max(1.5, U * 0.005); g.stroke();
    // flask
    const qx = X(0.68);
    benchShadow(g, qx, benchY + 0.004 * U, 0.06 * U, 0.015 * U);
    poly(g, [[qx - 0.015 * U, benchY - 0.22 * U], [qx + 0.015 * U, benchY - 0.22 * U], [qx + 0.015 * U, benchY - 0.14 * U], [qx + 0.07 * U, benchY], [qx - 0.07 * U, benchY], [qx - 0.015 * U, benchY - 0.14 * U]], 'rgba(214,236,230,0.18)', T.glassEdge, Math.max(1.5, U * 0.005));
    poly(g, [[qx - 0.045 * U, benchY - 0.06 * U], [qx + 0.045 * U, benchY - 0.06 * U], [qx + 0.066 * U, benchY - 0.004 * U], [qx - 0.066 * U, benchY - 0.004 * U]], rgba('#b4467a', 0.7));
    // bags of product already made
    const units = lab.inv.units || 0;
    const n = Math.min(4, Math.ceil(units / 2));
    for (let i = 0; i < n; i++) bag(g, X(0.8) + i * 0.05 * U, benchY - 0.13 * U, 0.08 * U, 0.12 * U, 0.7, lab.product.color);
    void fy;
  }

  // ═══ overlays (drawn after the minigame) ═════════════════════════════════════
  drawOverlays(g, lab) {
    const L = this.layout;
    const { W, H, fx, fy, fw, fh } = L;
    const U = fh;

    // fire on the bench
    if (lab.fire > 0) {
      const a = lab.fireArea();
      const cx = fx + a.x * fw, by = fy + a.y * fh + 0.04 * U;
      const f = lab.fire;
      const glow = g.createRadialGradient(cx, by, 0, cx, by, U * (0.25 + f * 0.5));
      glow.addColorStop(0, `rgba(240,160,58,${0.45 + f * 0.3})`); glow.addColorStop(1, 'rgba(240,160,58,0)');
      g.fillStyle = glow; g.fillRect(0, 0, W, H);
      const n = 3 + Math.round(f * 5);
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * U * (0.035 + f * 0.02);
        const fh2 = U * (0.08 + f * 0.24) * (1 - Math.abs(i - (n - 1) / 2) / n * 0.8);
        flame(g, cx + off, by, U * (0.05 + f * 0.035), fh2, this.t, i * 2.3, T.flameHot, i % 2 ? '#e0773a' : T.flame);
      }
      for (const p of this.puffs) {
        g.globalAlpha = p.life * 0.45;
        ellipse(g, cx + p.x * U + p.y * U * 0.2, by - U * 0.15 - p.y * U, U * 0.05 * p.s * (1.5 - p.life), U * 0.035 * p.s * (1.5 - p.life), '#2b2b29');
      }
      g.globalAlpha = 1;
      const pulse = 0.75 + 0.25 * Math.sin(this.t * 10);
      label(g, 'Tap the flames!', cx, by - U * (0.18 + f * 0.26), U * 0.045 * pulse, T.flameHot, 'center', 900);
      // heat-red edge
      g.fillStyle = `rgba(156, 74, 50, ${0.12 + f * 0.25})`;
      g.fillRect(0, 0, W, H * 0.04); g.fillRect(0, H * 0.96, W, H * 0.04);
    }

    // fumes haze
    if (lab.fumes > 0.02) {
      const a = clamp(lab.fumes, 0, 1);
      for (const h of this.haze) {
        const hx = h.x * W, hy = h.y * H + Math.sin(this.t * h.s + h.p) * H * 0.03;
        const r = h.r * Math.max(W, H);
        const hg = g.createRadialGradient(hx, hy, 0, hx, hy, r);
        hg.addColorStop(0, `rgba(196, 190, 120, ${0.30 * a})`); hg.addColorStop(1, 'rgba(196, 190, 120, 0)');
        g.fillStyle = hg; g.fillRect(0, 0, W, H);
      }
      g.fillStyle = `rgba(160, 158, 100, ${0.12 * a})`; g.fillRect(0, 0, W, H);
      if (lab.fumes > (lab.hazards.fumesHurtAbove ?? 0.75)) {
        const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
        vg.addColorStop(0, 'rgba(120,130,60,0)'); vg.addColorStop(1, `rgba(90,100,40,${0.35 + 0.15 * Math.sin(this.t * 4)})`);
        g.fillStyle = vg; g.fillRect(0, 0, W, H);
      }
    }

    // curtains closed → darker lab
    if (this.curtain > 0.02) {
      const dg = g.createRadialGradient(W * 0.47, H * 0.1, Math.min(W, H) * 0.2, W * 0.5, H * 0.5, Math.max(W, H) * 0.85);
      dg.addColorStop(0, `rgba(10, 12, 18, ${0.12 * this.curtain})`); dg.addColorStop(1, `rgba(10, 12, 18, ${0.42 * this.curtain})`);
      g.fillStyle = dg; g.fillRect(0, 0, W, H);
    }

    // cop alongside → red/blue pulse across the room (stronger when curtains are open)
    if (this.cop > 0.05 && lab.cooking) {
      const flash = Math.floor(this.t * 6) % 2;
      const col = flash ? '224,69,58' : '63,111,216';
      g.fillStyle = `rgba(${col}, ${0.10 * this.cop * (1 - this.curtain * 0.8)})`;
      g.fillRect(0, 0, W, H);
    }

    // soft vignette pulls the eye to the bench
    const vg = g.createRadialGradient(fx + fw / 2, fy + fh * 0.62, Math.min(W, H) * 0.35, fx + fw / 2, fy + fh * 0.6, Math.max(W, H) * 0.78);
    vg.addColorStop(0, 'rgba(14, 12, 10, 0)'); vg.addColorStop(1, 'rgba(14, 12, 10, 0.32)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);

    // explosion flash
    if (lab.explodedFlash > 0) {
      g.fillStyle = `rgba(255, 214, 140, ${lab.explodedFlash * 0.85})`;
      g.fillRect(0, 0, W, H);
    }
  }

  /** In-canvas instruction banner at the top of the focus area. */
  drawBanner(g, text, tone = 'info', sub = null) {
    if (!text) return;
    const { fx, fy, fw, fh, W } = this.layout;
    const U = fh;
    const px = clamp(U * 0.045, 13, 26);
    g.font = font(800, px);
    const tw = g.measureText(text).width;
    let sw = 0;
    if (sub) { g.font = font(700, px * 0.72); sw = g.measureText(sub).width + px * 0.9; }
    const w = Math.min(W - 12, tw + sw + px * 1.6), h = px * 1.9;
    const x = fx + fw / 2 - w / 2, y = fy + U * 0.03;
    rr(g, x, y, w, h, h / 2);
    g.fillStyle = tone === 'bad' ? 'rgba(156, 74, 50, 0.94)' : tone === 'good' ? 'rgba(79, 143, 138, 0.94)' : 'rgba(26, 29, 32, 0.86)';
    g.fill();
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = T.cream; g.font = font(800, px);
    g.fillText(text, x + px * 0.8, y + h / 2 + 0.5, w - px * 1.6 - sw);
    if (sub) {
      g.font = font(700, px * 0.72); g.fillStyle = tone === 'info' ? T.mustard : T.cream;
      g.fillText(sub, x + px * 0.8 + tw + px * 0.9, y + h / 2 + 0.5);
    }
  }

  /** Step result tag between steps. */
  drawStamp(g, title, score, next) {
    const { fx, fy, fw, fh } = this.layout;
    const U = fh;
    const cx = fx + fw / 2, cy = fy + fh * 0.42;
    const grade = score >= 0.9 ? 'Perfect' : score >= 0.75 ? 'Clean' : score >= 0.5 ? 'Sloppy' : 'Rough';
    const col = score >= 0.75 ? T.teal : score >= 0.5 ? T.mustard : T.rust;
    const w = U * 0.62, h = U * 0.3;
    g.save();
    g.translate(cx, cy); g.rotate(-0.035);
    g.fillStyle = 'rgba(0,0,0,0.35)'; rr(g, -w / 2 + U * 0.01, -h / 2 + U * 0.014, w, h, U * 0.03); g.fill();
    rr(g, -w / 2, -h / 2, w, h, U * 0.03); g.fillStyle = T.cream; g.fill();
    g.fillStyle = col; g.fillRect(-w / 2, -h / 2, U * 0.025, h);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = T.charcoal; g.font = font(700, U * 0.032);
    g.fillText(title, -w / 2 + U * 0.06, -h / 2 + U * 0.065, w - U * 0.09);
    g.fillStyle = col; g.font = font(900, U * 0.085);
    g.fillText(grade, -w / 2 + U * 0.06, -h / 2 + U * 0.16);
    g.textAlign = 'right'; g.fillStyle = T.charcoal; g.font = font(900, U * 0.06);
    g.fillText(`${Math.round(score * 100)}%`, w / 2 - U * 0.04, -h / 2 + U * 0.155);
    if (next) {
      g.textAlign = 'left'; g.fillStyle = 'rgba(34,38,42,0.65)'; g.font = font(700, U * 0.028);
      g.fillText(`Next: ${next}`, -w / 2 + U * 0.06, h / 2 - U * 0.04, w - U * 0.09);
    }
    g.restore();
  }
}
