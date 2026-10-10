// Small Canvas2D helpers for the flat-shaded "low-poly" lab look.
// No gradients for objects (flat facets), only for light/atmosphere overlays.
import { THEME, font } from './theme.js';

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Lighten (amt > 0) or darken (amt < 0) a hex colour; returns rgb() string. */
export function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const f = (c) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function rr(g, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + rad, y);
  g.lineTo(x + w - rad, y);
  g.quadraticCurveTo(x + w, y, x + w, y + rad);
  g.lineTo(x + w, y + h - rad);
  g.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  g.lineTo(x + rad, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - rad);
  g.lineTo(x, y + rad);
  g.quadraticCurveTo(x, y, x + rad, y);
  g.closePath();
}

export function poly(g, pts, fill, stroke, lw = 1) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}

export function ellipse(g, cx, cy, rx, ry, fill, stroke, lw = 1) {
  g.beginPath();
  g.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}

/** Soft contact shadow on the bench. */
export function benchShadow(g, cx, cy, rx, ry, a = 0.28) {
  ellipse(g, cx, cy, rx, ry, `rgba(20, 14, 8, ${a})`);
}

/** Text with a dark drop for readability on busy art. */
export function label(g, text, x, y, px, color = THEME.cream, align = 'center', weight = 800, base = 'middle') {
  g.font = font(weight, px);
  g.textAlign = align;
  g.textBaseline = base;
  g.fillStyle = 'rgba(10, 12, 14, 0.55)';
  g.fillText(text, x + Math.max(1, px * 0.06), y + Math.max(1, px * 0.08));
  g.fillStyle = color;
  g.fillText(text, x, y);
}

/** A pill-shaped tag (used for in-canvas readouts). */
export function pill(g, text, x, y, px, bg, fg = THEME.cream, align = 'center') {
  g.font = font(800, px);
  const w = g.measureText(text).width + px * 1.1;
  const h = px * 1.7;
  const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  rr(g, left, y - h / 2, w, h, h / 2);
  g.fillStyle = bg; g.fill();
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, left + w / 2, y + px * 0.04);
  return { x: left, y: y - h / 2, w, h };
}

/** Circular arrows hint (for grind/stir). */
export function circleHint(g, cx, cy, r, t, color, lw) {
  g.save();
  g.strokeStyle = color; g.lineWidth = lw; g.lineCap = 'round';
  g.setLineDash([lw * 1.2, lw * 2.2]);
  g.lineDashOffset = -t * lw * 8;
  g.beginPath(); g.ellipse(cx, cy, r, r * 0.42, 0, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  // arrow head at the front of the ellipse, travelling clockwise on screen
  const a = (t * 2.2) % (Math.PI * 2);
  const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r * 0.42;
  const tx = -Math.sin(a) * r, ty = Math.cos(a) * r * 0.42;
  const tl = Math.hypot(tx, ty) || 1;
  const ux = tx / tl, uy = ty / tl;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(px + ux * lw * 2.6, py + uy * lw * 2.6);
  g.lineTo(px - uy * lw * 1.8 - ux * lw, py + ux * lw * 1.8 - uy * lw);
  g.lineTo(px + uy * lw * 1.8 - ux * lw, py - ux * lw * 1.8 - uy * lw);
  g.closePath(); g.fill();
  g.restore();
}

/** Progress ring around a point. */
export function ring(g, cx, cy, r, frac, color, bg, lw) {
  g.save();
  g.lineCap = 'round';
  g.lineWidth = lw;
  g.strokeStyle = bg;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = color;
  g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, frac))); g.stroke();
  g.restore();
}

/** Flat-faceted flame (fire hazard + burner). */
export function flame(g, cx, by, w, h, t, seed = 0, hot = THEME.flameHot, base = THEME.flame) {
  const n = 5;
  const pts = [[cx - w / 2, by]];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const x = cx - w / 2 + w * f;
    const peak = i % 2 === 1;
    const wob = Math.sin(t * 9 + seed + i * 1.7) * 0.18 + Math.sin(t * 13.3 + seed * 2 + i) * 0.1;
    const env = Math.sin(f * Math.PI);
    const y = by - h * env * (peak ? 1 + wob : 0.55 + wob * 0.6);
    pts.push([x, y]);
  }
  pts.push([cx + w / 2, by]);
  poly(g, pts, base);
  const inner = pts.map(([x, y]) => [cx + (x - cx) * 0.55, by + (y - by) * 0.6]);
  poly(g, inner, hot);
}

/**
 * Flat-faceted body of revolution, front half only (low-poly look).
 * profile: [[radius, y], ...] from top to bottom in px. Returns the top ring info.
 * opts: { seg=7, tilt=0.3, alpha=1, stroke, lw, lightBias }
 */
export function lathe(g, cx, profile, base, opts = {}) {
  const seg = opts.seg || 7;
  const tilt = opts.tilt ?? 0.3;
  const alpha = opts.alpha ?? 1;
  g.save();
  g.globalAlpha *= alpha;
  for (let k = 0; k < profile.length - 1; k++) {
    const [r0, y0] = profile[k];
    const [r1, y1] = profile[k + 1];
    // row slope shading: faces that point up (r grows going down) catch more light
    const slope = (r1 - r0) / Math.max(1, Math.abs(y1 - y0));
    for (let j = 0; j < seg; j++) {
      const a0 = Math.PI - (j / seg) * Math.PI;
      const a1 = Math.PI - ((j + 1) / seg) * Math.PI;
      const am = (a0 + a1) / 2;
      const lightness = -Math.cos(am) * 0.16 + Math.sin(am) * 0.04 - slope * 0.08 + (opts.lightBias || 0) - 0.04;
      const p = [
        [cx + r0 * Math.cos(a0), y0 + r0 * tilt * Math.sin(a0)],
        [cx + r0 * Math.cos(a1), y0 + r0 * tilt * Math.sin(a1)],
        [cx + r1 * Math.cos(a1), y1 + r1 * tilt * Math.sin(a1)],
        [cx + r1 * Math.cos(a0), y1 + r1 * tilt * Math.sin(a0)],
      ];
      const col = shade(base, Math.max(-0.6, Math.min(0.5, lightness)));
      poly(g, p, col, col, 0.6);
    }
  }
  if (opts.stroke) {
    g.strokeStyle = opts.stroke; g.lineWidth = opts.lw || 1;
    g.beginPath();
    const [rt, yt] = profile[0];
    g.moveTo(cx - rt, yt);
    for (let k = 1; k < profile.length; k++) g.lineTo(cx - profile[k][0], profile[k][1]);
    const [rb, yb] = profile[profile.length - 1];
    g.ellipse(cx, yb, Math.max(0.1, rb), Math.max(0.1, rb * tilt), 0, Math.PI, 0, true);
    for (let k = profile.length - 1; k >= 0; k--) g.lineTo(cx + profile[k][0], profile[k][1]);
    g.stroke();
  }
  g.restore();
  const [rt, yt] = profile[0];
  return { cx, cy: yt, rx: rt, ry: rt * tilt };
}

/** The open top of a vessel: rim ring + darker inside. */
export function rim(g, top, outer, inner, rimW) {
  ellipse(g, top.cx, top.cy, top.rx, top.ry, outer);
  ellipse(g, top.cx, top.cy + rimW * 0.2, top.rx - rimW, Math.max(0.5, top.ry - rimW * 0.6), inner);
}

/** Simple zip bag (product bags in break step + HUD). */
export function bag(g, x, y, w, h, fillFrac, color) {
  // body
  rr(g, x, y, w, h, w * 0.08);
  g.fillStyle = 'rgba(232, 240, 236, 0.30)'; g.fill();
  g.strokeStyle = 'rgba(241, 234, 216, 0.85)'; g.lineWidth = Math.max(1, w * 0.04); g.stroke();
  // contents
  if (fillFrac > 0) {
    const fh = (h * 0.78) * Math.min(1, fillFrac);
    g.save(); rr(g, x + w * 0.08, y + h - fh - h * 0.06, w * 0.84, fh, w * 0.05); g.clip();
    g.fillStyle = color; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,0.22)';
    for (let i = 0; i < 4; i++) {
      const px = x + w * (0.18 + i * 0.2), py = y + h - fh * (0.3 + (i % 2) * 0.35) - h * 0.06;
      poly(g, [[px, py], [px + w * 0.09, py - h * 0.06], [px + w * 0.14, py + h * 0.03]], 'rgba(255,255,255,0.28)');
    }
    g.restore();
  }
  // zip strip
  g.fillStyle = THEME.rust;
  g.fillRect(x + w * 0.06, y + h * 0.08, w * 0.88, Math.max(1.5, h * 0.05));
}
