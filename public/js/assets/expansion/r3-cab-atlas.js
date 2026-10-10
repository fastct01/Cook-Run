// ─────────────────────────────────────────────────────────────────────────────
// Round 3 cab (agent R3-CAB) — one 1024×512 CanvasTexture for every printed detail of the
// redesigned cab: gauge faces (numerals, minor ticks, red zone), PRNDL strip, radio dial, warning
// lamp legends, horn badge, key fob, rim stitching, cassette labels, CB faceplate, HVAC panel and the
// folded road map. All text and marks are original (no real brands). Without a DOM (node asset
// check) cabAtlas() returns null and the meshes fall back to plain vertex colours.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { HAS_DOM } from '../models/kit.js';

export const AW = 1024, AH = 512;
/** Pixel rects [x, y, w, h] (top-left origin). */
export const RECT = Object.freeze({
  speedo: [0, 0, 256, 256], tach: [256, 0, 256, 256], temp: [512, 0, 128, 128], fuel: [512, 128, 128, 128],
  lamp_check: [640, 0, 128, 64], lamp_oil: [768, 0, 128, 64], lamp_heat: [896, 0, 128, 64],
  fob: [640, 64, 96, 96], badge: [736, 64, 160, 96], stitch: [896, 64, 128, 16],
  prndl: [640, 160, 256, 48], radio: [640, 208, 384, 80],
  cassA: [0, 256, 192, 120], cassB: [192, 256, 192, 120], cb: [384, 256, 256, 96], hvac: [384, 352, 256, 96],
  map: [640, 288, 320, 224], white: [960, 448, 64, 64],
});
/** uv rect [u0, v0, u1, v1] (v = 0 at the canvas bottom), inset by `pad` px. */
export function uvOf(name, pad = 1) {
  const [x, y, w, h] = RECT[name];
  return [(x + pad) / AW, 1 - (y + h - pad) / AH, (x + w - pad) / AW, 1 - (y + pad) / AH];
}
export const WHITE_UV = (() => { const [x, y, w, h] = RECT.white; return [(x + w / 2) / AW, 1 - (y + h / 2) / AH]; })();

/** Gauge sweeps shared with the geometry: θ (rotation.z convention: 0 = up, + = CCW as Rook sees it). */
export const SWEEP = Object.freeze({
  speed: { a0: 2.36, a1: -2.36, max: 100 },
  rpm: { a0: 2.1, a1: -2.1, max: 6000, red: 5000 },
  temp: { a0: 0.85, a1: -0.85 },
  fuel: { a0: 0.85, a1: -0.85 },
});

let _tex;
export function cabAtlas() {
  if (!HAS_DOM) return null;
  if (_tex !== undefined) return _tex;
  const cv = document.createElement('canvas');
  cv.width = AW; cv.height = AH;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, AW, AH);
  draw(ctx);
  _tex = new THREE.CanvasTexture(cv);
  _tex.colorSpace = THREE.SRGBColorSpace;
  _tex.anisotropy = 8;
  _tex.name = 'r3cab_atlas';
  return _tex;
}

const SANS = '"Helvetica Neue", Arial, Helvetica, sans-serif';
const COND = '"Arial Narrow", "Helvetica Neue", Arial, sans-serif';
function clip(ctx, [x, y, w, h], fn) { ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.translate(x, y); fn(w, h); ctx.restore(); }
const dirOf = (th) => [-Math.sin(th), -Math.cos(th)];   // canvas: y down

function dialBase(ctx, w, h) {
  const g = ctx.createRadialGradient(w / 2, h / 2 - h * 0.1, 4, w / 2, h / 2, w / 2);
  g.addColorStop(0, '#202224'); g.addColorStop(1, '#0d0e0f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}
function ticks(ctx, cx, cy, R, a0, a1, n, r0, r1, width, color, skip = () => false) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'butt';
  for (let i = 0; i < n; i++) {
    if (skip(i)) continue;
    const th = a0 + (a1 - a0) * (i / (n - 1)), [dx, dy] = dirOf(th);
    ctx.beginPath(); ctx.moveTo(cx + dx * R * r0, cy + dy * R * r0); ctx.lineTo(cx + dx * R * r1, cy + dy * R * r1); ctx.stroke();
  }
}
function label(ctx, txt, x, y, px, color = '#ece4c8', weight = '700', fam = SANS) {
  ctx.fillStyle = color; ctx.font = `${weight} ${px}px ${fam}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(txt, x, y);
}

function draw(ctx) {
  // white texel block (untextured triangles sample its centre)
  clip(ctx, RECT.white, (w, h) => { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); });

  // ── speedometer: 0–100 mph outer, km/h inner (orange), odometer, MPH ──
  clip(ctx, RECT.speedo, (w, h) => {
    const cx = w / 2, cy = h / 2, R = w / 2;
    dialBase(ctx, w, h);
    const S = SWEEP.speed;
    ticks(ctx, cx, cy, R, S.a0, S.a1, 41, 0.86, 0.93, 1.6, '#cfc7ae', (i) => i % 2 === 0);  // 2.5 mph
    ticks(ctx, cx, cy, R, S.a0, S.a1, 21, 0.8, 0.93, 2.6, '#ece4c8', (i) => i % 2 === 0);   // 5 mph
    ticks(ctx, cx, cy, R, S.a0, S.a1, 11, 0.74, 0.93, 4.2, '#f4eedb');                     // 10 mph
    for (let i = 0; i <= 10; i++) {
      const th = S.a0 + (S.a1 - S.a0) * (i / 10), [dx, dy] = dirOf(th);
      label(ctx, String(i * 10), cx + dx * R * 0.6, cy + dy * R * 0.6, i % 2 ? 17 : 21, '#f4eedb', '800', COND);
    }
    // km/h inner scale (every 20 km/h up to 160)
    for (let kmh = 0; kmh <= 160; kmh += 20) {
      const th = S.a0 + (S.a1 - S.a0) * (kmh / 160.934), [dx, dy] = dirOf(th);
      ctx.strokeStyle = '#e09a4a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(cx + dx * R * 0.44, cy + dy * R * 0.44); ctx.lineTo(cx + dx * R * 0.49, cy + dy * R * 0.49); ctx.stroke();
      label(ctx, String(kmh), cx + dx * R * 0.36, cy + dy * R * 0.36, 9, '#e09a4a', '700', COND);
    }
    label(ctx, 'MPH', cx, cy - R * 0.2, 14, '#ece4c8', '800');
    label(ctx, 'km/h', cx, cy - R * 0.09, 9, '#e09a4a', '700');
    // odometer window
    ctx.fillStyle = '#060606'; ctx.fillRect(cx - 36, cy + R * 0.16, 72, 17);
    const dig = ['0', '8', '6', '4', '3', '1'];
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i === 5 ? '#e8e2cf' : '#151515'; ctx.fillRect(cx - 35 + i * 12, cy + R * 0.16 + 1, 11, 15);
      label(ctx, dig[i], cx - 29.5 + i * 12, cy + R * 0.16 + 9, 13, i === 5 ? '#151515' : '#e8e2cf', '700', 'monospace');
    }
  });

  // ── tachometer: 0–6 ×1000 rpm, red from 5000 ──
  clip(ctx, RECT.tach, (w, h) => {
    const cx = w / 2, cy = h / 2, R = w / 2;
    dialBase(ctx, w, h);
    const S = SWEEP.rpm, tRed = S.red / S.max;
    // red zone band
    const thR = S.a0 + (S.a1 - S.a0) * tRed;
    ctx.strokeStyle = '#d63a2a'; ctx.lineWidth = R * 0.1;
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.85, -Math.PI / 2 - thR, -Math.PI / 2 - S.a1, false); ctx.stroke();
    ticks(ctx, cx, cy, R, S.a0, S.a1, 25, 0.84, 0.93, 1.6, '#cfc7ae', (i) => i % 2 === 0);
    ticks(ctx, cx, cy, R, S.a0, S.a1, 13, 0.78, 0.93, 2.6, '#ece4c8', (i) => i % 2 === 0);
    ticks(ctx, cx, cy, R, S.a0, S.a1, 7, 0.72, 0.93, 4.2, '#f4eedb');
    for (let i = 0; i <= 6; i++) {
      const th = S.a0 + (S.a1 - S.a0) * (i / 6), [dx, dy] = dirOf(th);
      label(ctx, String(i), cx + dx * R * 0.58, cy + dy * R * 0.58, 22, i >= 5 ? '#ff6a4a' : '#f4eedb', '800', COND);
    }
    label(ctx, 'RPM', cx, cy - R * 0.3, 14, '#ece4c8', '800');
    label(ctx, '×1000', cx, cy - R * 0.19, 10, '#cfc7ae', '700');
  });

  // ── small dials: temperature (C…H) and fuel (E…F) ──
  const small = (rect, lo, hi, loCol, hiCol, title) => clip(ctx, rect, (w, h) => {
    const cx = w / 2, cy = h / 2, R = w / 2;
    dialBase(ctx, w, h);
    const a0 = 0.85, a1 = -0.85;
    ticks(ctx, cx, cy, R, a0, a1, 5, 0.66, 0.9, 3, '#ece4c8');
    ctx.lineWidth = 7;
    ctx.strokeStyle = loCol; ctx.beginPath(); ctx.arc(cx, cy, R * 0.78, -Math.PI / 2 - a0, -Math.PI / 2 - a0 + 0.3); ctx.stroke();
    ctx.strokeStyle = hiCol; ctx.beginPath(); ctx.arc(cx, cy, R * 0.78, -Math.PI / 2 - a1 - 0.3, -Math.PI / 2 - a1); ctx.stroke();
    const [lx, ly] = dirOf(a0 + 0.15), [hx, hy] = dirOf(a1 - 0.15);
    label(ctx, lo, cx + lx * R * 0.5, cy + ly * R * 0.5 + 6, 20, '#ece4c8', '800');
    label(ctx, hi, cx + hx * R * 0.5, cy + hy * R * 0.5 + 6, 20, '#ece4c8', '800');
    label(ctx, title, cx, cy + R * 0.42, 15, '#cfc7ae', '700');
  });
  small(RECT.temp, 'C', 'H', '#4a8fd0', '#e0412f', 'TEMP');
  small(RECT.fuel, 'E', 'F', '#e0412f', '#ece4c8', 'FUEL');

  // ── warning lamp legends: white on black (the lamp material lights the white) ──
  const lamp = (rect, lines, icon) => clip(ctx, rect, (w, h) => {
    ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#ffffff';
    icon(w, h);
    lines.forEach((t, i) => label(ctx, t, w * 0.62, h / 2 + (i - (lines.length - 1) / 2) * 20, lines.length > 1 ? 17 : 24, '#ffffff', '900', COND));
  });
  lamp(RECT.lamp_check, ['CHECK', 'ENGINE'], (w, h) => {   // engine block outline
    ctx.lineWidth = 3; ctx.strokeRect(10, 20, 26, 22); ctx.strokeRect(16, 14, 12, 6); ctx.beginPath(); ctx.moveTo(36, 26); ctx.lineTo(42, 26); ctx.lineTo(42, 36); ctx.lineTo(36, 36); ctx.stroke();
  });
  lamp(RECT.lamp_oil, ['OIL'], (w, h) => {                 // oil can with a drip
    ctx.beginPath(); ctx.moveTo(8, 40); ctx.lineTo(34, 40); ctx.lineTo(46, 28); ctx.lineTo(52, 30); ctx.lineTo(36, 46); ctx.lineTo(8, 46); ctx.closePath(); ctx.fill();
    ctx.fillRect(14, 32, 16, 8); ctx.beginPath(); ctx.arc(54, 40, 3, 0, Math.PI * 2); ctx.fill();
  });
  lamp(RECT.lamp_heat, ['TEMP'], (w, h) => {               // thermometer over waves
    ctx.fillRect(24, 10, 6, 26); ctx.beginPath(); ctx.arc(27, 40, 7, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2.5; for (const y of [50, 56]) { ctx.beginPath(); for (let x = 8; x <= 46; x += 2) ctx.lineTo(x, y + Math.sin(x * 0.45) * 2); ctx.stroke(); }
  });

  // ── key fob: periodic-table-style tile, element 27 ──
  clip(ctx, RECT.fob, (w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#46b56a'); g.addColorStop(1, '#2a8a4c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#1d5e35'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, w - 6, h - 6);
    ctx.fillStyle = '#f2f5ef'; ctx.font = `800 15px ${SANS}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('27', 10, 9);
    ctx.textAlign = 'right'; ctx.font = `700 11px ${SANS}`; ctx.fillText('58.93', w - 9, 11);
    label(ctx, 'Co', w / 2, h / 2 + 3, 44, '#ffffff', '900');
    label(ctx, 'Cobalt', w / 2, h - 15, 12, '#e8f2e6', '700');
  });

  // ── horn badge: chrome oval, red enamel, "C&R" ──
  clip(ctx, RECT.badge, (w, h) => {
    ctx.fillStyle = '#3a3b3d'; ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#f4f4f0'); g.addColorStop(0.5, '#8d8f90'); g.addColorStop(1, '#e4e4de');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w / 2 - 2, h / 2 - 2, 0, 0, Math.PI * 2); ctx.fill();
    const r = ctx.createLinearGradient(0, 0, 0, h); r.addColorStop(0, '#b3271d'); r.addColorStop(1, '#6e130e');
    ctx.fillStyle = r; ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w / 2 - 12, h / 2 - 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(w / 2, h / 2 + 3); ctx.transform(1, 0, -0.18, 1, 0, 0);
    ctx.font = `900 italic 46px Georgia, "Times New Roman", serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#4a1a14'; ctx.fillText('C&R', 2, 2);
    const t = ctx.createLinearGradient(0, -20, 0, 20); t.addColorStop(0, '#ffffff'); t.addColorStop(0.55, '#c9c9c4'); t.addColorStop(1, '#f2f2ec');
    ctx.fillStyle = t; ctx.fillText('C&R', 0, 0);
    ctx.restore();
  });

  // ── leather wrap stitching (5 cross stitches) ──
  clip(ctx, RECT.stitch, (w, h) => {
    ctx.fillStyle = '#2a211c'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1a1411'; ctx.fillRect(0, h / 2 - 1, w, 2);
    ctx.strokeStyle = '#c4b08a'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) { const x = 6 + i * (w / 5); ctx.beginPath(); ctx.moveTo(x, 3); ctx.lineTo(x + 12, h - 3); ctx.stroke(); }
  });

  // ── PRNDL strip (5 equal steps, matches gear_pointer detents) ──
  clip(ctx, RECT.prndl, (w, h) => {
    ctx.fillStyle = '#0b0b0c'; ctx.fillRect(0, 0, w, h);
    ['P', 'R', 'N', 'D', 'L'].forEach((c, i) => label(ctx, c, w * (0.1 + 0.2 * i), h / 2 + 1, 30, c === 'D' ? '#ffd27a' : '#efe9d6', '900'));
    ctx.fillStyle = '#5a5a58'; for (let i = 0; i < 4; i++) ctx.fillRect(w * (0.2 + 0.2 * i) - 1, 10, 2, h - 20);
  });

  // ── AM/FM dial window ──
  clip(ctx, RECT.radio, (w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2c2414'); g.addColorStop(1, '#17130b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#e8d9b0'; ctx.fillStyle = '#e8d9b0';
    label(ctx, 'FM', 16, 20, 13, '#ffcf6a', '900'); label(ctx, 'AM', 16, 58, 13, '#ffcf6a', '900');
    const fm = [88, 92, 96, 100, 104, 108], am = [54, 60, 70, 80, 100, 120, 140, 160];
    fm.forEach((f, i) => { const x = 40 + (i / (fm.length - 1)) * (w - 70); label(ctx, String(f), x, 20, 13, '#efe6c9', '700', COND); });
    am.forEach((f, i) => { const x = 40 + (i / (am.length - 1)) * (w - 70); label(ctx, String(f), x, 58, 13, '#efe6c9', '700', COND); });
    ctx.lineWidth = 1.2;
    for (let i = 0; i <= 40; i++) { const x = 40 + (i / 40) * (w - 70); ctx.beginPath(); ctx.moveTo(x, 34); ctx.lineTo(x, i % 5 ? 39 : 44); ctx.stroke(); }
    label(ctx, 'MHz', w - 14, 20, 9, '#bfb18a', '700'); label(ctx, 'kHz', w - 14, 58, 9, '#bfb18a', '700');
    ctx.fillStyle = '#ff3b22'; ctx.fillRect(40 + 0.62 * (w - 70), 4, 3, h - 8);       // tuning pointer
  });

  // ── cassette tapes ──
  const cassette = (rect, title, sub, labelCol, stripe) => clip(ctx, rect, (w, h) => {
    ctx.fillStyle = '#1b1b1c'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = labelCol; ctx.fillRect(10, 8, w - 20, h - 40);
    ctx.fillStyle = stripe; ctx.fillRect(10, 30, w - 20, 8);
    ctx.fillStyle = '#2a2622'; ctx.font = `italic 700 17px "Comic Sans MS", "Segoe Print", cursive`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(title, 18, 20); ctx.font = `700 10px ${SANS}`; ctx.fillText(sub, 18, 46);
    ctx.fillStyle = '#0d0d0d'; ctx.fillRect(w / 2 - 40, 52, 80, 22);                       // tape window
    for (const x of [w / 2 - 28, w / 2 + 28]) {
      ctx.fillStyle = '#3b2a1e'; ctx.beginPath(); ctx.arc(x, 63, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e9e4d8'; ctx.beginPath(); ctx.arc(x, 63, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1b1b1c'; ctx.beginPath(); ctx.arc(x, 63, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#2e2e30'; ctx.beginPath(); ctx.moveTo(30, h); ctx.lineTo(44, h - 22); ctx.lineTo(w - 44, h - 22); ctx.lineTo(w - 30, h); ctx.fill();
  });
  cassette(RECT.cassA, "Road Mix '86", 'SIDE A   C-90', '#efe7d2', '#d9a83a');
  cassette(RECT.cassB, 'Desert Radio', 'SIDE B   live', '#e9d6c0', '#4f8f8a');

  // ── CB radio faceplate: red channel digits, S/RF meter, knob legends ──
  clip(ctx, RECT.cb, (w, h) => {
    ctx.fillStyle = '#2b2c2e'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(12, 12, 58, 40);
    label(ctx, '19', 41, 33, 34, '#ff3a22', '900', 'monospace');
    label(ctx, 'CH', 41, 62, 10, '#cfcac0', '700');
    ctx.fillStyle = '#e8dfc6'; ctx.fillRect(84, 12, 76, 40);
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1.2;
    for (let i = 0; i <= 10; i++) { const a = Math.PI * (1.15 + i * 0.07); ctx.beginPath(); ctx.moveTo(122 + Math.cos(a) * 30, 52 + Math.sin(a) * 30); ctx.lineTo(122 + Math.cos(a) * (i % 5 ? 26 : 23), 52 + Math.sin(a) * (i % 5 ? 26 : 23)); ctx.stroke(); }
    ctx.strokeStyle = '#c4372b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(122, 52); ctx.lineTo(122 + Math.cos(Math.PI * 1.42) * 32, 52 + Math.sin(Math.PI * 1.42) * 32); ctx.stroke();
    label(ctx, 'S / RF', 122, 46, 8, '#2a2a2a', '800');
    ['VOL', 'SQ', 'CH'].forEach((t, i) => label(ctx, t, 186 + i * 26, 78, 9, '#cfcac0', '800'));
    label(ctx, 'CITIZENS BAND · 40 CH', 74, 80, 9, '#9a978f', '700');
  });

  // ── HVAC slider panel ──
  clip(ctx, RECT.hvac, (w, h) => {
    ctx.fillStyle = '#26262a'; ctx.fillRect(0, 0, w, h);
    const rows = [['OFF', 'VENT', 'BI-LEV', 'FLOOR', 'DEF'], ['COLD', '', '', '', 'WARM'], ['FAN', '1', '2', '3', '4']];
    rows.forEach((r, j) => {
      const y = 16 + j * 30;
      ctx.fillStyle = '#0c0c0d'; ctx.fillRect(18, y + 6, w - 36, 5);
      r.forEach((t, i) => t && label(ctx, t, 26 + i * ((w - 52) / 4), y - 2, 9, '#d8d2c2', '800'));
    });
  });

  // ── folded road map (three panels, fold creases) ──
  clip(ctx, RECT.map, (w, h) => {
    ctx.fillStyle = '#ece2c6'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c9dba4'; ctx.beginPath(); ctx.ellipse(70, 150, 60, 40, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(250, 60, 50, 28, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e3c79a'; ctx.beginPath(); ctx.ellipse(210, 170, 70, 36, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7fb0d6'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 40); ctx.bezierCurveTo(80, 70, 120, 20, 200, 90); ctx.bezierCurveTo(260, 140, 300, 110, w, 150); ctx.stroke();
    ctx.fillStyle = '#9cc4e2'; ctx.beginPath(); ctx.ellipse(150, 120, 22, 12, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d24a3a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(10, h - 20); ctx.lineTo(120, 130); ctx.lineTo(220, 110); ctx.lineTo(w - 10, 20); ctx.stroke();
    ctx.strokeStyle = '#e6b23c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(40, 10); ctx.lineTo(90, 100); ctx.lineTo(160, 200); ctx.lineTo(260, h - 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(180, 10); ctx.lineTo(230, 120); ctx.lineTo(w - 20, 200); ctx.stroke();
    ctx.strokeStyle = '#6b6457'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(0, 110); ctx.lineTo(w, 95); ctx.moveTo(140, 0); ctx.lineTo(170, h); ctx.stroke(); ctx.setLineDash([]);
    for (const [x, y, n] of [[120, 130, '9'], [222, 110, '41'], [92, 100, '7']]) {
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1.5; ctx.stroke();
      label(ctx, n, x, y + 1, 10, '#1a1a1a', '900');
    }
    for (const [x, y] of [[60, 180], [190, 40], [270, 180], [120, 70]]) { ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(70,60,40,.25)'; ctx.fillRect(w / 3 - 1, 0, 2, h); ctx.fillRect((2 * w) / 3 - 1, 0, 2, h);
    ctx.fillStyle = '#2f5f8a'; ctx.fillRect(0, 0, w, 22);
    label(ctx, 'HIGH DESERT  ·  ROAD MAP', w / 2, 12, 13, '#f2ead6', '900');
    ctx.strokeStyle = '#c4372b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(222, 110, 15, 0, Math.PI * 2); ctx.stroke();   // circled stop
  });

}
