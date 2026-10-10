// ─────────────────────────────────────────────────────────────────────────────
// Round 3 · garage pack (agent R3-GARAGE) — shared helpers: ONE canvas atlas for every label,
// sign and drawing in the pack (jar labels, hazard diamonds, whiteboard, element poster, safety
// signs, notebook pages, scale display, "OUT"), textured-quad builders, and the pack materials.
// All text and marks are ORIGINAL and fictional; ingredient names come from data/lab.json.
// Without a DOM (node asset check) the atlas is null and the quads fall back to a flat colour.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { rng, fitText } from '../models/kit.js';
import { atlasTexture, atlasMesh, uvRect } from './hazards-util.js';

export const AW = 1024, AH = 1280;
// [x, y, w, h] canvas px, y from the top
export const R = {
  wb: [0, 0, 600, 400], poster: [0, 404, 600, 400],
  drum0: [604, 0, 136, 200], drum1: [744, 0, 136, 200], drum2: [884, 0, 136, 200],
  jerry0: [604, 204, 136, 136], jerry1: [744, 204, 136, 136], jerry2: [884, 204, 136, 136],
  gas0: [0, 808, 96, 280], gas1: [100, 808, 96, 280], gas2: [200, 808, 96, 280],
  cross: [300, 808, 220, 220], eyewash: [524, 808, 220, 108], aidbox: [524, 920, 108, 108], sand: [636, 920, 108, 60],
  notebook: [748, 808, 272, 176], scale: [748, 988, 120, 48], hotplate: [872, 988, 148, 48],
  out: [0, 1092, 400, 160], hood: [404, 1092, 240, 90], gloves: [648, 1092, 160, 90], suitTag: [812, 1092, 100, 60],
  fan: [916, 1092, 104, 104], hoodWarn: [404, 1186, 240, 90], suitup: [648, 1188, 264, 88],
};
// jar labels: 3 columns × 6 rows (136 × 72)
for (let r = 0; r < 6; r++) for (let c = 0; c < 3; c++) R['jar' + (r * 3 + c)] = [604 + c * 140, 344 + r * 76, 136, 72];

const FONT = '"Arial Black","Arial Bold",Arial,Helvetica,sans-serif';
const HAND = '"Comic Sans MS","Segoe Print","Bradley Hand","Marker Felt",cursive,sans-serif';
function txt(c, s, x, y, maxW, px, color, weight = '900', align = 'center', family = FONT) {
  c.fillStyle = color; c.textAlign = align; c.textBaseline = 'middle'; fitText(c, s, x, y, maxW, px, weight, family);
}
function wear(c, x, y, w, h, seed, k = 1) {
  const r = rng(seed);
  for (let i = 0; i < (w * h) / 900 * k; i++) { c.fillStyle = r() < 0.5 ? 'rgba(60,45,30,0.16)' : 'rgba(255,250,235,0.14)'; c.fillRect(x + r() * w, y + r() * h, 1 + r() * 2.5, 1 + r() * 2.5); }
}
/** Invented 4-quad hazard diamond centred (cx, cy), half-diagonal s. codes: [top, left, right, bottom]. */
function diamond(c, cx, cy, s, cols, codes) {
  const q = [[0, -1], [-1, 0], [1, 0], [0, 1]];
  for (let i = 0; i < 4; i++) {
    const [dx, dy] = q[i];
    c.fillStyle = cols[i]; c.beginPath();
    c.moveTo(cx + dx * s, cy + dy * s);
    c.lineTo(cx + (dx - dy) * s / 2, cy + (dy + dx) * s / 2);
    c.lineTo(cx, cy);
    c.lineTo(cx + (dx + dy) * s / 2, cy + (dy - dx) * s / 2);
    c.closePath(); c.fill();
    txt(c, codes[i], cx + dx * s * 0.48, cy + dy * s * 0.48, s * 0.55, s * 0.34, i === 3 && cols[3] === '#f4f1e8' ? '#222' : '#fff');
  }
  c.strokeStyle = '#1d1b19'; c.lineWidth = Math.max(2, s * 0.05);
  c.beginPath(); c.moveTo(cx, cy - s); c.lineTo(cx + s, cy); c.lineTo(cx, cy + s); c.lineTo(cx - s, cy); c.closePath(); c.stroke();
  c.beginPath(); c.moveTo(cx - s / 2, cy - s / 2); c.lineTo(cx + s / 2, cy + s / 2); c.moveTo(cx + s / 2, cy - s / 2); c.lineTo(cx - s / 2, cy + s / 2); c.stroke();
}
function hexRing(c, x, y, r, rot = 0) {
  c.beginPath();
  for (let i = 0; i <= 6; i++) { const a = rot + i * Math.PI / 3; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; i ? c.lineTo(px, py) : c.moveTo(px, py); }
  c.stroke();
}
function arrowLine(c, x0, y0, x1, y1, head = 12) {
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  const a = Math.atan2(y1 - y0, x1 - x0);
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 - Math.cos(a - 0.45) * head, y1 - Math.sin(a - 0.45) * head);
  c.moveTo(x1, y1); c.lineTo(x1 - Math.cos(a + 0.45) * head, y1 - Math.sin(a + 0.45) * head); c.stroke();
}
function wobble(c, pts, seed, amp = 1.5) {
  const r = rng(seed); c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x + (r() - 0.5) * amp, y + (r() - 0.5) * amp) : c.moveTo(x, y)));
  c.stroke();
}

// periodic-table layout: [symbol, Z, period(row), group(col)]; lanthanides/actinides in rows 9/10
const EL = 'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'.split(' ');
function cellOf(z) {
  if (z === 1) return [1, 1]; if (z === 2) return [1, 18];
  if (z <= 10) return [2, z <= 4 ? z - 2 : z + 8]; if (z <= 18) return [3, z <= 12 ? z - 10 : z];
  if (z <= 36) return [4, z - 18]; if (z <= 54) return [5, z - 36];
  if (z <= 56) return [6, z - 54]; if (z <= 71) return [9, z - 57 + 3]; if (z <= 86) return [6, z - 68];
  if (z <= 88) return [7, z - 86]; if (z <= 103) return [10, z - 89 + 3]; return [7, z - 100];
}
function famColor(z, row, col) {
  if (row >= 9) return row === 9 ? '#e9b8c9' : '#d9a6c6';
  if (z === 1) return '#cfd8e6';
  if (col === 1) return '#e8a07a'; if (col === 2) return '#ecc37a'; if (col === 18) return '#a9c9e4';
  if (col === 17) return '#b9dcae'; if (col >= 3 && col <= 12) return '#e7d79a';
  if ([5, 14, 32, 33, 51, 52].includes(z)) return '#a8d6c2';
  if ([6, 7, 8, 15, 16, 34].includes(z)) return '#c9e4a6';
  return '#c4c9cf';
}

export function garageAtlas() {
  return atlasTexture({
    key: 'r3_garage_atlas', w: AW, h: AH, bg: '#2a2622',
    draw: (c) => {
      let [x, y, w, h] = R.wb;
      // ── whiteboard: hexagon doodles, arrows, crossed-out list, BATCH #1 (nothing real) ──
      c.fillStyle = '#f3f4f1'; c.fillRect(x, y, w, h);
      c.fillStyle = 'rgba(160,170,175,0.18)'; for (const [gx, gy, gw] of [[40, 300, 180], [380, 60, 160], [250, 200, 120]]) c.fillRect(x + gx, y + gy, gw, 22);   // ghosted old marker
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = '#2c4f9a'; c.lineWidth = 4;
      txt(c, 'BATCH #1', x + 150, y + 46, 260, 48, '#c0392b', '900', 'center', HAND);
      c.strokeStyle = '#c0392b'; c.lineWidth = 3; wobble(c, [[x + 34, y + 76], [x + 266, y + 72]], 3);
      // hexagon-ring doodles joined by bonds
      c.strokeStyle = '#1f2a33'; c.lineWidth = 3.5;
      hexRing(c, x + 120, y + 170, 34, Math.PI / 6); hexRing(c, x + 179, y + 204, 34, Math.PI / 6);
      c.beginPath(); c.arc(x + 120, y + 170, 18, 0, 7); c.stroke();
      hexRing(c, x + 300, y + 255, 28, 0);
      c.strokeStyle = '#2c4f9a'; c.lineWidth = 4;
      arrowLine(c, x + 222, y + 174, x + 300, y + 160, 14);
      arrowLine(c, x + 332, y + 258, x + 392, y + 284, 14);
      txt(c, '+ heat', x + 262, y + 140, 90, 22, '#2c4f9a', '700', 'center', HAND);
      txt(c, 'cool?', x + 432, y + 292, 80, 22, '#2c4f9a', '700', 'center', HAND);
      // list (right column), some items crossed out
      const items = ['grind salts', 'syrup 0.64', 'hold 190-220', 'stir coil', 'ice bath', 'bag it'];
      items.forEach((s, i) => {
        const ly = y + 52 + i * 34;
        txt(c, `${i + 1}. ${s}`, x + 352, ly, 230, 25, '#1f2a33', '700', 'left', HAND);
        if (i === 1 || i === 3) { c.strokeStyle = '#c0392b'; c.lineWidth = 3; wobble(c, [[x + 346, ly + 2], [x + 572, ly - 4]], 10 + i); }
        if (i === 0) { c.strokeStyle = '#2f8a4a'; c.lineWidth = 4; wobble(c, [[x + 560, ly], [x + 568, ly + 8], [x + 584, ly - 12]], 20); }
      });
      c.strokeStyle = '#2f8a4a'; c.lineWidth = 3; c.beginPath(); c.ellipse(x + 470, y + 120, 132, 20, -0.04, 0, 7); c.stroke();
      // bottom: a crossed-out sketch and a tally
      c.strokeStyle = '#1f2a33'; c.lineWidth = 3; wobble(c, [[x + 40, y + 330], [x + 90, y + 300], [x + 140, y + 340], [x + 190, y + 310]], 30);
      c.strokeStyle = '#c0392b'; c.lineWidth = 4; wobble(c, [[x + 30, y + 296], [x + 200, y + 350]], 31); wobble(c, [[x + 30, y + 350], [x + 200, y + 296]], 32);
      c.strokeStyle = '#1f2a33'; c.lineWidth = 3; for (let i = 0; i < 4; i++) wobble(c, [[x + 470 + i * 14, y + 330], [x + 472 + i * 14, y + 370]], 40 + i);
      wobble(c, [[x + 462, y + 365], [x + 532, y + 336]], 45);
      txt(c, 'DON’T RUSH IT', x + 330, y + 372, 200, 22, '#2c4f9a', '700', 'center', HAND);
      c.fillStyle = 'rgba(0,0,0,0.05)'; c.fillRect(x, y + h - 10, w, 10);

      // ── element poster (original layout drawing; Co and Ru circled in red marker) ──
      [x, y, w, h] = R.poster;
      c.fillStyle = '#f1ead8'; c.fillRect(x, y, w, h);
      c.fillStyle = '#2b4a5a'; c.fillRect(x, y, w, 46);
      txt(c, 'THE ELEMENTS', x + w / 2, y + 24, w - 160, 30, '#f1ead8');
      txt(c, 'study hard · class of nobody', x + w / 2, y + h - 14, w - 200, 14, '#6b6253', '700');
      const tw = 31.5, th = 31, ox = x + 16, oy = y + 56;
      const cellXY = (row, col) => [ox + (col - 1) * tw, oy + (row <= 7 ? row - 1 : row - 1.6) * th];
      let co = null, ru = null;
      for (let z = 1; z <= 118; z++) {
        const [row, col] = cellOf(z);
        const [cx, cy] = cellXY(row, col);
        const hi = z === 27 || z === 44;
        c.fillStyle = hi ? '#5fae6a' : famColor(z, row, col);
        c.fillRect(cx + 1, cy + 1, tw - 2, th - 2);
        c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(cx + 1, cy + th - 4, tw - 2, 3);
        txt(c, String(z), cx + 4, cy + 7, tw - 6, 8, hi ? '#f6fff2' : '#4a4438', '700', 'left', 'Arial,Helvetica,sans-serif');
        txt(c, EL[z - 1], cx + tw / 2, cy + th / 2 + 4, tw - 5, hi ? 17 : 14, hi ? '#ffffff' : '#2b2622', '900');
        if (z === 27) co = [cx + tw / 2, cy + th / 2]; if (z === 44) ru = [cx + tw / 2, cy + th / 2];
      }
      // f-block marker lines
      c.strokeStyle = '#8a8170'; c.lineWidth = 1.5; c.setLineDash([3, 3]);
      const [lx, ly] = cellXY(6, 3); c.beginPath(); c.moveTo(lx + tw / 2, ly + th); c.lineTo(lx + tw / 2, cellXY(9, 3)[1]); c.stroke(); c.setLineDash([]);
      // red marker circles + a little arrow between them
      c.strokeStyle = '#d42a1e'; c.lineWidth = 4.5; c.lineCap = 'round';
      for (const [px, py] of [co, ru]) { c.beginPath(); c.ellipse(px, py + 1, 25, 22, 0.15, 0.2, Math.PI * 2 + 0.6); c.stroke(); }
      txt(c, '!!', co[0] + 36, co[1] - 26, 30, 22, '#d42a1e', '900', 'center', HAND);
      wear(c, x, y, w, h, 51, 0.6);
      // tape corners
      c.fillStyle = 'rgba(232,220,170,0.85)'; for (const [tx, ty] of [[x, y], [x + w - 46, y], [x, y + h - 20], [x + w - 46, y + h - 20]]) c.fillRect(tx, ty, 46, 20);

      // ── drum labels (portrait): name + invented hazard diamond ──
      const drumLab = (r, name, code, cols, codes, seed) => {
        [x, y, w, h] = r;
        c.fillStyle = '#f4f1e8'; c.fillRect(x, y, w, h);
        c.fillStyle = '#1f2022'; c.fillRect(x, y, w, 30);
        txt(c, name, x + w / 2, y + 16, w - 12, 18, '#f4f1e8');
        diamond(c, x + w / 2, y + 96, 50, cols, codes);
        txt(c, code, x + w / 2, y + 168, w - 16, 18, '#1f2022');
        txt(c, 'KEEP SEALED', x + w / 2, y + 188, w - 20, 11, '#6b6253', '800');
        wear(c, x, y, w, h, seed);
      };
      drumLab(R.drum0, 'CANYON SOLVENT', 'CS-40', ['#c0392b', '#2f6db0', '#e2b93b', '#f4f1e8'], ['3', '2', '1', '✕'], 61);
      drumLab(R.drum1, 'MESA SALTS', 'MS-12', ['#2f6db0', '#5c9f5a', '#e2b93b', '#f4f1e8'], ['1', '2', '0', 'W'], 62);
      drumLab(R.drum2, 'BURNER GAS', 'BG-7', ['#c0392b', '#e07a3f', '#e2b93b', '#f4f1e8'], ['4', '1', '2', '♨'], 63);
      const jerryLab = (r, name, cols, codes, seed) => {
        [x, y, w, h] = r;
        c.fillStyle = '#efe6c9'; c.fillRect(x, y, w, h);
        diamond(c, x + w / 2, y + 56, 44, cols, codes);
        c.fillStyle = '#1f2022'; c.fillRect(x, y + h - 30, w, 30);
        txt(c, name, x + w / 2, y + h - 15, w - 12, 16, '#efe6c9');
        wear(c, x, y, w, h, seed);
      };
      jerryLab(R.jerry0, 'CANYON SOLVENT', ['#c0392b', '#2f6db0', '#e2b93b', '#f4f1e8'], ['3', '2', '1', 'Q']);
      jerryLab(R.jerry1, 'PRICKLY SYRUP', ['#b4467a', '#2f6db0', '#e2b93b', '#f4f1e8'], ['1', '1', '0', '~']);
      jerryLab(R.jerry2, 'RINSE WATER', ['#2f6db0', '#5c9f5a', '#9fd3c7', '#f4f1e8'], ['0', '0', '0', 'OK']);

      // ── jar / bottle labels (lab.json names + hand-written extras) ──
      const jars = [
        ['MESA SALTS', '#e8e1cf', 'fine grade'], ['CANYON SOLVENT', '#9fd3c7', 'keep cool'], ['PRICKLY SYRUP', '#b4467a', 'sticky!'],
        ['COPPER COIL', '#c46b3c', 'shavings'], ['BURNER GAS', '#e07a3f', 'refill'], ['DESERT GLASS', '#7fd6c2', 'samples'],
        ['SCRAP METAL', '#8d8f93', 'filings'], ['MESA SALTS', '#e8e1cf', 'coarse'], ['CANYON SOLVENT', '#9fd3c7', 'batch 2'],
        ['ICE MELT', '#cfe9f5', '?'], ['PRICKLY SYRUP', '#b4467a', 'old'], ['NO. 7', '#d9a83a', 'ask Doc'],
        ['MESA SALTS', '#e8e1cf', 'spare'], ['COPPER COIL', '#c46b3c', 'wire'], ['DESERT GLASS', '#7fd6c2', 'reject'],
        ['TEST A', '#e2b93b', 'Mon'], ['TEST B', '#5c9f5a', 'Tue'], ['CANYON SOLVENT', '#9fd3c7', 'empty'],
      ];
      jars.forEach(([name, col, note], i) => {
        [x, y, w, h] = R['jar' + i];
        const hand = i >= 9;
        c.fillStyle = hand ? '#efe6c9' : '#f6f3ea'; c.fillRect(x, y, w, h);
        c.fillStyle = col; c.fillRect(x, y, w, 16); c.fillRect(x, y + h - 8, w, 8);
        txt(c, name, x + w / 2, y + 36, w - 10, hand ? 22 : 20, '#1f2022', hand ? '700' : '900', 'center', hand ? HAND : FONT);
        txt(c, note, x + w / 2, y + 55, w - 20, 13, '#6b6253', '700', 'center', HAND);
        wear(c, x, y, w, h, 70 + i, 0.6);
      });

      // ── gas cylinder labels (vertical band) ──
      const gasLab = (r, name, sub, col, seed) => {
        [x, y, w, h] = r;
        c.fillStyle = '#f2eee2'; c.fillRect(x, y, w, h);
        c.fillStyle = col; c.fillRect(x, y, w, 40); c.fillRect(x, y + h - 26, w, 26);
        c.save(); c.translate(x + w / 2, y + h / 2 + 6); c.rotate(-Math.PI / 2);
        txt(c, name, 0, -12, h - 90, 30, '#1f2022'); txt(c, sub, 0, 22, h - 110, 15, '#6b6253', '800');
        c.restore();
        diamond(c, x + w / 2, y + 20, 15, ['#c0392b', '#2f6db0', '#e2b93b', '#f4f1e8'], ['', '', '', '']);
        wear(c, x, y, w, h, seed);
      };
      gasLab(R.gas0, 'BURNER GAS', 'NO OPEN FLAME', '#c0392b', 81);
      gasLab(R.gas1, 'SHOP AIR', 'COMPRESSED', '#2f6db0', 82);
      gasLab(R.gas2, 'MIX-7', 'DO NOT DROP', '#5c9f5a', 83);

      // ── safety: green-cross sign, eyewash sign, first-aid face, sand ──
      [x, y, w, h] = R.cross;
      c.fillStyle = '#2f8a4a'; c.fillRect(x, y, w, h);
      c.fillStyle = '#f6f6f0'; c.fillRect(x + 12, y + 12, w - 24, h - 24);
      c.fillStyle = '#2f8a4a'; c.fillRect(x + 20, y + 20, w - 40, 128);
      c.fillStyle = '#f6f6f0'; c.fillRect(x + w / 2 - 18, y + 36, 36, 96); c.fillRect(x + w / 2 - 48, y + 66, 96, 36);
      txt(c, 'FIRST AID', x + w / 2, y + 168, w - 40, 30, '#2f8a4a');
      txt(c, 'EYE WASH ↓', x + w / 2, y + 196, w - 50, 18, '#1f2022', '800');
      [x, y, w, h] = R.eyewash;
      c.fillStyle = '#2f8a4a'; c.fillRect(x, y, w, h);
      txt(c, 'EYE WASH', x + w / 2, y + 40, w - 30, 40, '#f6f6f0');
      txt(c, 'flush 15 min', x + w / 2, y + 82, w - 40, 22, '#d9efdc', '800');
      [x, y, w, h] = R.aidbox;
      c.fillStyle = '#2f8a4a'; c.fillRect(x, y, w, h);
      c.fillStyle = '#f6f6f0'; c.fillRect(x + w / 2 - 12, y + 18, 24, h - 36); c.fillRect(x + 18, y + h / 2 - 12, w - 36, 24);
      [x, y, w, h] = R.sand;
      c.fillStyle = '#c0392b'; c.fillRect(x, y, w, h); txt(c, 'SAND', x + w / 2, y + h / 2 + 1, w - 16, 40, '#f6f6f0');

      // ── notebook: two pages, ruled, with a doodle + list ──
      [x, y, w, h] = R.notebook;
      c.fillStyle = '#f4efe0'; c.fillRect(x, y, w, h);
      c.fillStyle = '#b8c9d9'; for (let i = 0; i < 9; i++) { c.fillRect(x + 8, y + 22 + i * 17, w / 2 - 20, 1.5); c.fillRect(x + w / 2 + 12, y + 22 + i * 17, w / 2 - 20, 1.5); }
      c.fillStyle = '#d98a8a'; c.fillRect(x + 20, y, 1.5, h); c.fillRect(x + w / 2 + 24, y, 1.5, h);
      c.fillStyle = '#8a8378'; c.fillRect(x + w / 2 - 2, y, 4, h);
      c.strokeStyle = '#2c4f9a'; c.lineWidth = 2.5; hexRing(c, x + 70, y + 60, 20, Math.PI / 6); arrowLine(c, x + 94, y + 60, x + 124, y + 52, 8);
      txt(c, 'temp?', x + 72, y + 112, 90, 16, '#2c4f9a', '700', 'center', HAND);
      for (let i = 0; i < 5; i++) txt(c, ['salts', 'solvent', 'coil', 'ice', 'TIME'][i], x + w / 2 + 34, y + 30 + i * 22, 100, 15, i === 4 ? '#c0392b' : '#1f2a33', '700', 'left', HAND);
      c.strokeStyle = '#c0392b'; c.lineWidth = 2; wobble(c, [[x + w / 2 + 30, y + 52], [x + w / 2 + 100, y + 50]], 90);
      // ── small displays ──
      [x, y, w, h] = R.scale; c.fillStyle = '#20292a'; c.fillRect(x, y, w, h); c.fillStyle = '#152018'; c.fillRect(x + 6, y + 6, w - 12, h - 12);
      txt(c, '0.64 g', x + w / 2, y + h / 2 + 1, w - 20, 26, '#7fe39a', '700', 'center', 'Courier New,monospace');
      [x, y, w, h] = R.hotplate; c.fillStyle = '#e9e6dc'; c.fillRect(x, y, w, h);
      txt(c, 'HEAT', x + 30, y + 24, 50, 16, '#c0392b'); txt(c, 'STIR', x + w - 30, y + 24, 50, 16, '#2f6db0');
      // ── OUT (on the floating arrow's shaft): dark letters on mustard ──
      [x, y, w, h] = R.out;
      c.fillStyle = '#2a2116'; c.fillRect(x, y, w, h);
      c.fillStyle = '#F2B90F'; c.beginPath(); c.roundRect ? c.roundRect(x + 9, y + 9, w - 18, h - 18, 14) : c.rect(x + 9, y + 9, w - 18, h - 18); c.fill();
      c.fillStyle = '#ffd34a'; c.fillRect(x + 22, y + 15, w - 44, 5);
      txt(c, 'OUT', x + w / 2, y + h / 2 + 6, w - 60, 124, '#1f1a12');
      // ── hood stickers ──
      [x, y, w, h] = R.hood; c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
      c.fillStyle = '#e2b93b'; c.fillRect(x, y, w, h); c.fillStyle = '#1f2022'; for (let i = -2; i < 14; i++) { c.beginPath(); c.moveTo(x + i * 24, y + h); c.lineTo(x + i * 24 + 12, y + h); c.lineTo(x + i * 24 + 12 + h * 0.5, y); c.lineTo(x + i * 24 + h * 0.5, y); c.fill(); }
      c.restore();
      c.fillStyle = '#e2b93b'; c.fillRect(x + 12, y + 16, w - 24, h - 32); txt(c, 'FAN ON FIRST', x + w / 2, y + h / 2 + 1, w - 40, 30, '#1f2022');
      [x, y, w, h] = R.hoodWarn; c.fillStyle = '#f4f1e8'; c.fillRect(x, y, w, h); c.fillStyle = '#c0392b'; c.fillRect(x, y, w, 26);
      txt(c, 'SASH DOWN', x + w / 2, y + 14, w - 30, 20, '#f4f1e8'); txt(c, 'keep your face out', x + w / 2, y + 56, w - 30, 22, '#1f2022', '700', 'center', HAND);
      [x, y, w, h] = R.gloves; c.fillStyle = '#3f7fd0'; c.fillRect(x, y, w, h); c.fillStyle = '#f4f6f8'; c.fillRect(x, y + 52, w, 38);
      txt(c, 'NITRILE', x + w / 2, y + 28, w - 20, 30, '#f4f6f8'); txt(c, 'M · 100 pcs', x + w / 2, y + 71, w - 20, 18, '#2a4f86', '800');
      [x, y, w, h] = R.suitTag; c.fillStyle = '#f4f1e8'; c.fillRect(x, y, w, h); txt(c, 'TYPE 4', x + w / 2, y + 20, w - 10, 18, '#1f2022'); txt(c, 'one use', x + w / 2, y + 44, w - 10, 14, '#6b6253', '700');
      [x, y, w, h] = R.fan; c.fillStyle = '#e2b93b'; c.fillRect(x, y, w, h);
      c.fillStyle = '#1f2022'; c.beginPath(); c.moveTo(x + w / 2, y + 12); c.lineTo(x + w - 12, y + h - 14); c.lineTo(x + 12, y + h - 14); c.closePath(); c.fill();
      c.fillStyle = '#e2b93b'; c.beginPath(); c.moveTo(x + w / 2, y + 26); c.lineTo(x + w - 24, y + h - 22); c.lineTo(x + 24, y + h - 22); c.closePath(); c.fill();
      txt(c, '!', x + w / 2, y + h / 2 + 12, 30, 40, '#1f2022');
      // ── SUIT UP sign (yellow/black chevron border) ──
      [x, y, w, h] = R.suitup; c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.fillStyle = '#1f2022'; c.fillRect(x, y, w, h);
      c.fillStyle = '#F2B90F'; for (let i = -1; i < 12; i++) { c.beginPath(); c.moveTo(x + i * 24, y); c.lineTo(x + i * 24 + 12, y); c.lineTo(x + i * 24 + 24, y + 10); c.lineTo(x + i * 24 + 12, y + 10); c.fill(); c.beginPath(); c.moveTo(x + i * 24, y + h - 10); c.lineTo(x + i * 24 + 12, y + h - 10); c.lineTo(x + i * 24 + 24, y + h); c.lineTo(x + i * 24 + 12, y + h); c.fill(); }
      txt(c, 'SUIT UP', x + w / 2, y + 38, w - 30, 40, '#F2B90F');
      txt(c, 'suit \u00b7 gloves \u00b7 mask \u00b7 goggles', x + w / 2, y + 64, w - 30, 15, '#efe9dc', '800');
      c.restore();
    },
  });
}

/** Collects atlas quads for one prop; `mesh()` bakes them into one textured draw call. */
export class Labels {
  constructor() { this.q = []; this.stack = [new THREE.Matrix4()]; }
  get M() { return this.stack[this.stack.length - 1]; }
  /** Run fn with an extra transform (pos [x,y,z], rotY, rotX). */
  at(pos, rotY = 0, rotX = 0, fn) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
    this.stack.push(this.M.clone().multiply(m));
    try { fn(this); } finally { this.stack.pop(); }
    return this;
  }
  /** Quad facing local +Z (after the transform), centred at (x, y, z), size w × h; region key or [x,y,w,h]. o.rotY/o.rotX tilt it. o.flipU mirrors. */
  add(region, [x, y, z], w, h, o = {}) {
    const r = typeof region === 'string' ? R[region] : region;
    const m = this.M.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rotX || 0, o.rotY || 0, o.rotZ || 0, 'YXZ')), new THREE.Vector3(1, 1, 1)));
    const P = (u, v) => new THREE.Vector3(u, v, 0).applyMatrix4(m).toArray();
    let uv = uvRect(AW, AH, ...r);
    if (o.crop) { const [a, b, cc, d] = o.crop; uv = [uv[0] + (uv[2] - uv[0]) * a, uv[1] + (uv[3] - uv[1]) * b, uv[0] + (uv[2] - uv[0]) * cc, uv[1] + (uv[3] - uv[1]) * d]; }
    if (o.flipU) uv = [uv[2], uv[1], uv[0], uv[3]];
    this.q.push({ c: [P(-w / 2, -h / 2), P(w / 2, -h / 2), P(w / 2, h / 2), P(-w / 2, h / 2)], uv });
    return this;
  }
  /** Flat quad lying on a horizontal plane (facing up), long side along local X; `fwd` rotates about Y. */
  addFlat(region, [x, y, z], w, d, rotY = 0) { return this.add(region, [x, y, z], w, d, { rotX: -Math.PI / 2, rotY }); }
  mesh(name = 'labels', fallback = '#d8d2c2') {
    const m = atlasMesh(garageAtlas(), this.q, name, fallback);
    m.castShadow = false;
    return m;
  }
}

// ── pack materials (cached, shared by every clone — never mutate on an instance) ──
const _m = new Map();
const cached = (k, make) => { let m = _m.get(k); if (!m) { m = make(); _m.set(k, m); } return m; };
/** Clear lab glass (flasks, beakers, sash, jars): translucent, vertex-coloured, no depth write. */
export function glassMaterial() {
  return cached('glass', () => new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide, flatShading: true, name: 'CR_LabGlass' }));
}
/** Floor chevrons: unlit vertex colour. `color` is the brightness multiplier the chase-light animates
 *  (rest #a8a8a8, lit #ffffff) — multiplicative, so the dark edge stays dark. Clone per instance. */
export function chevronMaterial() {
  return cached('chev', () => new THREE.MeshBasicMaterial({ vertexColors: true, color: '#b4b4b4', name: 'CR_ExitChevron' }));
}
