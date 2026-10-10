// ─────────────────────────────────────────────────────────────────────────────
// Hazards pack — interiors: garage_interior (Rook's Garage, tutorial) and
// shop_hardware_interior (first shop challenge). Art agent "hazards".
//
// Walls and ceilings are SINGLE-SIDED and face inward, so a camera anywhere outside sees straight
// in (the near walls vanish), while a camera inside sees a closed room. A solid skirting, corner
// columns and a top ring beam outline the building from outside. Shell meshes do not cast shadows
// (so the sun still lights the room in the showroom / game); furniture does.
// Draw calls: garage 12, shop 11. Budget ≤ 6000 tris each (asset check).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Kit, root, rng, fitText } from '../models/kit.js';
import { PAL, mix, shade } from '../palette.js';
import { pivot, kmesh, beam, rod, ring, glowAdd, glowMaterial, atlasTexture, atlasMesh, quadZ, quadX, uvRect } from './hazards-util.js';

const F = (c) => c;   // readability marker for colours

// ── shell helpers ─────────────────────────────────────────────────────────────
/** Inward wall on the plane z = Z (facing dir), with a lower band, block lines and corrugation stripes. */
function wallZ(k, z, x0, x1, H, dir, o = {}) {
  const low = o.low || '#76817c', up = o.up || '#b5ae9e', band = o.band ?? 1.2;
  k.rectZ(low, z, [x0, x1], [0, band], dir, { off: 0 });
  k.rectZ(up, z, [x0, x1], [band, H], dir, { off: 0 });
  for (const y of [0.4, 0.8]) k.rectZ(shade(low, 0.85), z, [x0, x1], [y - 0.012, y + 0.012], dir, { off: 0.003 });
  k.rectZ(shade(up, 0.8), z, [x0, x1], [band, band + 0.06], dir, { off: 0.003 });
  if (o.stripes !== false) for (let x = x0 + 0.3; x < x1 - 0.2; x += 0.6) k.rectZ(shade(up, 0.92), z, [x, Math.min(x1, x + 0.28)], [band + 0.06, H], dir, { off: 0.002 });
}
function wallX(k, x, z0, z1, H, dir, o = {}) {
  const low = o.low || '#76817c', up = o.up || '#b5ae9e', band = o.band ?? 1.2;
  k.rectX(low, x, [z0, z1], [0, band], dir, { off: 0 });
  k.rectX(up, x, [z0, z1], [band, H], dir, { off: 0 });
  for (const y of [0.4, 0.8]) k.rectX(shade(low, 0.85), x, [z0, z1], [y - 0.012, y + 0.012], dir, { off: 0.003 });
  k.rectX(shade(up, 0.8), x, [z0, z1], [band, band + 0.06], dir, { off: 0.003 });
  if (o.stripes !== false) for (let z = z0 + 0.3; z < z1 - 0.2; z += 0.6) k.rectX(shade(up, 0.92), x, [z, Math.min(z1, z + 0.28)], [band + 0.06, H], dir, { off: 0.002 });
}
/** Building outline visible from outside: skirting, corner/mid columns, ring beam. */
function frame(k, W, D, H, color = '#5d6266', posts = [], gap = null) {
  const hw = W / 2, hd = D / 2;
  for (const s of [1, -1]) {
    if (s > 0 && gap) {
      k.box('#4c4f52', [gap[0] + hw, 0.14, 0.08], [(-hw + gap[0]) / 2, 0, hd - 0.04], { base: true });
      k.box('#4c4f52', [hw - gap[1], 0.14, 0.08], [(hw + gap[1]) / 2, 0, hd - 0.04], { base: true });
    } else k.box('#4c4f52', [W, 0.14, 0.08], [0, 0, s * (hd - 0.04)], { base: true });
    k.box('#4c4f52', [0.08, 0.14, D], [s * (hw - 0.04), 0, 0], { base: true });
    k.box(color, [W, 0.22, 0.2], [0, H - 0.11, s * (hd - 0.1)]);
    k.box(color, [0.2, 0.22, D], [s * (hw - 0.1), H - 0.11, 0]);
  }
  for (const [x, z] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], ...posts]) k.box(color, [0.26, H, 0.26], [x - Math.sign(x) * 0.13, 0, z - Math.sign(z) * 0.13], { base: true });
}
/** Fluorescent strip fixture hanging from height `top` (housing + 2 tubes + 2 chains). */
function tubeLight(k, x, y, z, len, top, alongX = false) {
  const L = (a, b, c) => (alongX ? [c, b, a] : [a, b, c]);   // [w, h, l] swizzle
  k.box('#d8d6cf', L(0.3, 0.07, len), [x, y + 0.035, z]);
  for (const o of [-0.07, 0.07]) k.box('#f6fbf4', L(0.045, 0.045, len - 0.1), alongX ? [x, y - 0.02, z + o] : [x + o, y - 0.02, z]);
  for (const t of [-0.35, 0.35]) k.box('#8a8d90', [0.015, top - y, 0.015], alongX ? [x + t * len, y + (top - y) / 2, z] : [x, y + (top - y) / 2, z + t * len]);
}
/** Glowing tutorial floor disc (additive: ring + soft fill + centre pip). */
function markerMesh(seed) {
  const k = new Kit(seed);
  ring(k, '#ffd36a', 0.5, 0.62, [0, 0, 0], 24);
  ring(k, '#5a3e0e', 0.0, 0.5, [0, -0.001, 0], 16);
  ring(k, '#a8782a', 0.08, 0.16, [0, 0.001, 0], 12);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    const P = (r, da) => [Math.cos(a + da) * r, 0.002, Math.sin(a + da) * r];
    k.poly('#ffcf5a', [P(0.3, -0.12), P(0.3, 0.12), P(0.42, 0)], { facing: [0, 1, 0] });
  }
  const m = new THREE.Mesh(k.geometry(), glowAdd('CR_FloorMarker'));
  m.renderOrder = 2; m.castShadow = false; m.receiveShadow = false;
  return m;
}

// ── poster atlas (original, fictional) ───────────────────────────────────────
const ARIAL = '"Arial Black","Arial Bold",Arial,Helvetica,sans-serif';
function txt(c, s, x, y, maxW, px, color, weight = '900', align = 'center') { c.fillStyle = color; c.textAlign = align; c.textBaseline = 'middle'; fitText(c, s, x, y, maxW, px, weight, ARIAL); }
function grime(c, x, y, w, h, seed) {
  const r = rng(seed);
  c.fillStyle = 'rgba(240,226,200,0.12)'; c.fillRect(x, y, w, h);
  for (let i = 0; i < (w * h) / 700; i++) { c.fillStyle = r() < 0.5 ? 'rgba(60,45,30,0.22)' : 'rgba(255,250,235,0.18)'; c.fillRect(x + r() * w, y + r() * h, 1 + r() * 3, 1 + r() * 3); }
  const g = c.createLinearGradient(0, y + h * 0.6, 0, y + h); g.addColorStop(0, 'rgba(80,60,40,0)'); g.addColorStop(1, 'rgba(80,60,40,0.25)'); c.fillStyle = g; c.fillRect(x, y, w, h);
}
const GA = { W: 1024, H: 1024 };
const GR = {   // garage atlas rects [x, y, w, h] in canvas px (y from the top)
  sign: [0, 0, 1024, 256], rally: [0, 262, 366, 506], oil: [374, 262, 380, 506], cal: [762, 262, 262, 300], flam: [762, 570, 262, 198],
  map: [0, 776, 400, 248], days: [408, 776, 372, 248], rv: [788, 776, 236, 248],
};
function garageAtlas() {
  return atlasTexture({
    key: 'hz_garage_atlas', w: GA.W, h: GA.H, bg: '#2a2622',
    draw: (c) => {
      // ROOK'S GARAGE — painted in the RV's livery
      let [x, y, w, h] = GR.sign;
      c.fillStyle = '#e9e2cf'; c.fillRect(x + 6, y + 6, w - 12, h - 12);
      c.fillStyle = '#4f8f8a'; c.fillRect(x + 6, y + 168, w - 12, 46); c.fillStyle = '#d9a83a'; c.fillRect(x + 6, y + 220, w - 12, 10);
      txt(c, "ROOK'S GARAGE", x + w / 2, y + 92, 900, 128, '#2b2622');
      txt(c, 'REPAIRS  ·  TOWING  ·  NO QUESTIONS', x + w / 2, y + 192, 760, 34, '#efe9dc', '800');
      grime(c, x, y, w, h, 11);
      // rally poster
      [x, y, w, h] = GR.rally;
      let gr = c.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#d8643a'); gr.addColorStop(0.55, '#e9a85a'); gr.addColorStop(1, '#6a3a2a');
      c.fillStyle = gr; c.fillRect(x, y, w, h);
      c.fillStyle = '#f6d27a'; c.beginPath(); c.arc(x + w / 2, y + 250, 92, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#5a2e22'; c.beginPath(); c.moveTo(x, y + 360); c.lineTo(x + 60, y + 300); c.lineTo(x + 150, y + 300); c.lineTo(x + 180, y + 330); c.lineTo(x + 260, y + 280); c.lineTo(x + w, y + 290); c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.fill();
      c.fillStyle = '#1f2022'; c.fillRect(x + 110, y + 352, 150, 30); c.fillRect(x + 140, y + 334, 80, 22); c.beginPath(); c.arc(x + 140, y + 384, 14, 0, 7); c.arc(x + 232, y + 384, 14, 0, 7); c.fill();
      c.fillStyle = 'rgba(240,210,160,0.6)'; for (let i = 0; i < 5; i++) c.fillRect(x + 20 + i * 18, y + 372 - i * 4, 14, 6);
      txt(c, 'CACTUS CUP', x + w / 2, y + 70, w - 40, 64, '#fbeed2');
      txt(c, 'RALLY  ·  1986', x + w / 2, y + 130, w - 60, 36, '#3a1e16', '800');
      txt(c, '500 MILES OF NOTHING', x + w / 2, y + h - 50, w - 50, 26, '#f2d9a8', '800');
      grime(c, x, y, w, h, 12);
      // motor oil poster
      [x, y, w, h] = GR.oil;
      c.fillStyle = '#23443f'; c.fillRect(x, y, w, h);
      c.fillStyle = '#d9a83a'; c.fillRect(x + 20, y + 20, w - 40, 8); c.fillRect(x + 20, y + h - 28, w - 40, 8);
      c.fillStyle = '#c9c3b2'; c.fillRect(x + 110, y + 170, 160, 200); c.fillRect(x + 150, y + 140, 40, 34); c.fillStyle = '#b8392e'; c.fillRect(x + 110, y + 220, 160, 70);
      txt(c, 'DUSTLINE', x + 190, y + 255, 150, 34, '#efe9dc');
      txt(c, 'DUSTLINE', x + w / 2, y + 70, w - 50, 70, '#efe9dc');
      txt(c, 'MOTOR OIL', x + w / 2, y + 120, w - 90, 34, '#d9a83a', '800');
      txt(c, 'Runs hot. Runs long.', x + w / 2, y + 420, w - 60, 32, '#efe9dc', '700');
      grime(c, x, y, w, h, 13);
      // calendar
      [x, y, w, h] = GR.cal;
      c.fillStyle = '#efe9dc'; c.fillRect(x, y, w, h);
      gr = c.createLinearGradient(0, y, 0, y + 120); gr.addColorStop(0, '#8fbad0'); gr.addColorStop(1, '#e8c890'); c.fillStyle = gr; c.fillRect(x + 10, y + 10, w - 20, 110);
      c.fillStyle = '#b45d38'; c.fillRect(x + 30, y + 80, 70, 40); c.fillRect(x + 150, y + 90, 90, 30);
      txt(c, 'OCTOBER', x + w / 2, y + 142, w - 30, 28, '#2b2622');
      c.fillStyle = '#8a8378';
      for (let r = 0; r < 5; r++) for (let q = 0; q < 7; q++) { const cx = x + 18 + q * 33, cy = y + 165 + r * 25; c.fillRect(cx, cy, 26, 18); if (r * 7 + q < 9) { c.strokeStyle = '#b8392e'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + 26, cy + 18); c.moveTo(cx + 26, cy); c.lineTo(cx, cy + 18); c.stroke(); } }
      // flammable
      [x, y, w, h] = GR.flam;
      c.fillStyle = '#e2b93b'; c.fillRect(x, y, w, h); c.fillStyle = '#b8392e'; c.fillRect(x + 10, y + 10, w - 20, 64);
      txt(c, 'FLAMMABLE', x + w / 2, y + 44, w - 40, 40, '#fbeed2');
      txt(c, 'KEEP IT COOL', x + w / 2, y + 120, w - 40, 36, '#2b2622');
      txt(c, 'no smoking near the drums', x + w / 2, y + 166, w - 30, 20, '#2b2622', '700');
      grime(c, x, y, w, h, 14);
      // road map
      [x, y, w, h] = GR.map;
      c.fillStyle = '#e6dcc0'; c.fillRect(x, y, w, h);
      c.strokeStyle = '#c9b98e'; c.lineWidth = 2; for (let i = 1; i < 6; i++) { c.beginPath(); c.moveTo(x + i * 66, y); c.lineTo(x + i * 66, y + h); c.stroke(); }
      c.fillStyle = '#9cc0a0'; c.fillRect(x + 20, y + 140, 120, 80); c.fillStyle = '#e0b07a'; c.fillRect(x + 200, y + 60, 180, 160);
      c.strokeStyle = '#b8392e'; c.lineWidth = 6; c.setLineDash([14, 10]); c.beginPath(); c.moveTo(x + 40, y + 200); c.bezierCurveTo(x + 140, y + 120, x + 220, y + 210, x + 360, y + 90); c.stroke(); c.setLineDash([]);
      for (const [px, py] of [[40, 200], [150, 160], [260, 175], [360, 90]]) { c.fillStyle = '#2b2622'; c.beginPath(); c.arc(x + px, y + py, 9, 0, 7); c.fill(); }
      txt(c, 'THE LONG ROAD', x + w / 2, y + 30, w - 40, 34, '#2b2622');
      grime(c, x, y, w, h, 15);
      // safety board
      [x, y, w, h] = GR.days;
      c.fillStyle = '#2f6a4a'; c.fillRect(x, y, w, h); c.fillStyle = '#efe9dc'; c.fillRect(x + 12, y + 12, w - 24, 70);
      txt(c, 'DAYS WITHOUT', x + w / 2, y + 47, w - 50, 40, '#2f6a4a');
      txt(c, 'AN INCIDENT', x + w / 2, y + 118, w - 50, 40, '#efe9dc');
      c.fillStyle = '#efe9dc'; c.fillRect(x + w / 2 - 50, y + 150, 100, 86);
      txt(c, '0', x + w / 2, y + 196, 90, 80, '#b8392e');
      grime(c, x, y, w, h, 16);
      // RV parts sign
      [x, y, w, h] = GR.rv;
      c.fillStyle = '#4f8f8a'; c.fillRect(x, y, w, h); c.fillStyle = '#d9a83a'; c.fillRect(x, y + h - 40, w, 12);
      txt(c, 'RV PARTS', x + w / 2, y + 70, w - 30, 44, '#efe9dc');
      txt(c, 'ask Rook', x + w / 2, y + 130, w - 40, 34, '#2b2622', '800');
      grime(c, x, y, w, h, 17);
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 23. garage_interior — Rook's Garage, 18 × 14 × 7 m. Origin = floor centre. Roll-up `door` in the
//     front wall (+Z) at x 1.5..6.5; the RV bay (yellow lines) is x 2.2..5.8, RV centre (4.0, 0, −0.2)
//     facing +Z (userData.rvPark). Tutorial markers marker_0..3; door opens with door.position.y 0 → 4.6.
// ═════════════════════════════════════════════════════════════════════════════
export function buildGarageInterior(variant = 0) {
  const W = 18, D = 14, H = 7, hw = 9, hd = 7;
  const g = root('garage_interior', variant, { w: W, h: H, l: D });
  const S = new Kit(700);              // shell: no shadows
  const B = new Kit(701); B.floor = 0; // furniture: casts shadows
  const rr = rng(702);
  // floor: concrete with joints, patches, oil stains, painted bay + lift lines, drain
  S.box('#8f8b82', [W, 0.04, D], [0, -0.02, 0]);
  S.rectY('#9a968c', 0.0, [-hw, hw], [-hd, hd], { off: 0.001 });
  for (const x of [-6, -3, 0, 3, 6]) S.rectY('#7a766e', 0.0, [x - 0.012, x + 0.012], [-hd, hd], { off: 0.003 });
  for (const z of [-3.5, 0, 3.5]) S.rectY('#7a766e', 0.0, [-hw, hw], [z - 0.012, z + 0.012], { off: 0.003 });
  for (const [x, z, r, c] of [[-5, -4, 2.2, '#a19d93'], [2, 3.5, 2.6, '#928e85'], [6, -5, 1.8, '#a3a096']]) S.blob(c, r, [x, 0.002, z], { seg: 10, seed: 703 + x, wobble: 0.4, off: 0 });
  for (const [x, z, r] of [[4.0, 2.3, 0.7], [3.6, -2.0, 0.45], [4.4, -3.4, 0.35], [-4.2, 3.6, 0.8], [-3.0, 2.2, 0.35], [7.8, -5.6, 0.6], [1.0, -1.0, 0.25]]) {
    S.blob('#3d3a35', r, [x, 0.004, z], { seg: 9, seed: 710 + Math.round(x * 10), wobble: 0.5, off: 0 });
    S.blob('#2c2a27', r * 0.55, [x + 0.05, 0.005, z], { seg: 7, seed: 720 + Math.round(z * 10), wobble: 0.5, off: 0 });
  }
  const yl = (x0, x1, z0, z1) => S.rectY('#d9b13a', 0.006, [x0, x1], [z0, z1], { off: 0 });
  yl(2.1, 2.22, -5.0, 4.6); yl(5.78, 5.9, -5.0, 4.6); yl(2.1, 5.9, -5.0, -4.88);
  yl(-6.6, -1.8, 1.0, 1.1); yl(-6.6, -1.8, 6.1, 6.2); yl(-6.6, -6.5, 1.0, 6.2); yl(-1.9, -1.8, 1.0, 6.2);
  S.rectY('#2a2a2b', 0.006, [-0.3, 0.3], [-0.3, 0.3], { off: 0.001 });
  for (let i = 0; i < 4; i++) S.rectY('#5a5d60', 0.007, [-0.28, 0.28], [-0.24 + i * 0.16, -0.21 + i * 0.16], { off: 0.001 });
  // walls (inward), front wall around the roll-up opening, clerestory windows on the back wall
  const DX0 = 1.5, DX1 = 6.5, DH = 4.6;
  wallZ(S, -hd, -hw, hw, H, 1);
  wallX(S, -hw, -hd, hd, H, 1);
  wallX(S, hw, -hd, hd, H, -1);
  wallZ(S, hd, -hw, DX0, H, -1); wallZ(S, hd, DX1, hw, H, -1);
  S.rectZ('#b5ae9e', hd, [DX0, DX1], [DH, H], -1, { off: 0 });                 // header above the opening
  for (let x = DX0 + 0.3; x < DX1 - 0.2; x += 0.6) S.rectZ(shade('#b5ae9e', 0.92), hd, [x, x + 0.28], [DH, H], -1, { off: 0.002 });
  for (const x of [-6.5, -2.5, 1.5, 5.5]) {
    S.rectZ('#5d6266', -hd, [x - 1.5, x + 1.5], [4.5, 5.7], 1, { off: 0.004 });
    S.rectZ('#a9c3cb', -hd, [x - 1.42, x + 1.42], [4.58, 5.62], 1, { off: 0.008 });
    for (const t of [-0.5, 0.5]) S.rectZ('#5d6266', -hd, [x + t - 0.03, x + t + 0.03], [4.58, 5.62], 1, { off: 0.012 });
  }
  // ceiling (faces down) + I-beam joists + purlins + building frame
  S.rectY('#8c887e', H, [-hw, hw], [-hd, hd], { off: 0, facing: [0, -1, 0] });
  for (const z of [-5.6, -2.8, 0, 2.8, 5.6]) S.box('#5d6266', [W, 0.3, 0.14], [0, H - 0.3, z]);
  for (const x of [-4.5, 4.5]) S.box('#6a6f73', [0.12, 0.16, D], [x, H - 0.55, 0]);
  frame(S, W, D, H, '#5d6266', [[-hw, 0], [hw, 0], [0, -hd]], [DX0, DX1]);
  for (const [x, z] of [[-4.5, -4.2], [-4.5, 0], [-4.5, 4.2], [4.0, -3.8], [4.0, 0.2], [4.0, 4.2]]) tubeLight(S, x, 5.1, z, 2.6, H - 0.55);
  // roll-up door guides + motor + control box (inside)
  for (const x of [DX0 - 0.06, DX1 + 0.06]) B.box('#6a6f73', [0.1, DH + 0.3, 0.12], [x, 0, hd - 0.08], { base: true });
  B.box('#4c4f52', [5.3, 0.4, 0.3], [(DX0 + DX1) / 2, DH + 0.25, hd - 0.2]);
  B.box('#3a3b3d', [0.5, 0.3, 0.35], [DX1 - 0.4, DH + 0.7, hd - 0.4]);
  B.box('#d9d3c0', [0.16, 0.26, 0.08], [DX0 - 0.6, 1.4, hd - 0.04]);
  B.box('#5fbf6f', [0.06, 0.05, 0.02], [DX0 - 0.6, 1.47, hd - 0.085]);
  B.box('#c4372b', [0.06, 0.05, 0.02], [DX0 - 0.6, 1.36, hd - 0.085]);

  // ── back wall: workbench + pegboard (shadow board) + key rack + tool chests ──
  const bz = -hd + 0.42, bx0 = -8.6, bx1 = -4.6, bxm = (bx0 + bx1) / 2;
  B.box('#8a6a4a', [bx1 - bx0, 0.07, 0.8], [bxm, 0.88, bz], { base: true });
  B.box('#6e5238', [bx1 - bx0, 0.02, 0.8], [bxm, 0.88, bz], { base: true });
  for (const x of [bx0 + 0.08, bx1 - 0.08]) for (const z of [bz - 0.32, bz + 0.32]) B.box('#5f6468', [0.07, 0.88, 0.07], [x, 0, z], { base: true });
  B.box('#7a5c40', [bx1 - bx0 - 0.1, 0.04, 0.7], [bxm, 0.22, bz], { base: true });
  B.box('#9a3b2e', [0.6, 0.28, 0.35], [bx0 + 0.6, 0.26, bz], { base: true, noBottom: true });
  B.box('#c9b98e', [0.5, 0.3, 0.4], [bx0 + 1.4, 0.26, bz - 0.1], { base: true, noBottom: true });
  B.box('#c9b98e', [0.45, 0.22, 0.38], [bx0 + 1.45, 0.56, bz - 0.12], { base: true, noBottom: true, rot: [0, 0.2, 0] });
  // vise, engine part, coffee can of screwdrivers, rag
  B.box('#3e5f7a', [0.22, 0.12, 0.3], [bx1 - 0.5, 0.95, bz + 0.18], { base: true });
  B.box('#3e5f7a', [0.24, 0.12, 0.06], [bx1 - 0.5, 1.07, bz + 0.28], { base: true });
  B.cyl('#8d8a82', 0.02, 0.02, 0.36, [bx1 - 0.5, 1.13, bz + 0.2], { axis: 'x', seg: 5 });
  B.cyl('#5a5d60', 0.18, 0.2, 0.28, [bxm, 0.95, bz], { base: true, seg: 8 });
  B.cyl('#7f9a8c', 0.07, 0.07, 0.1, [bxm, 1.23, bz], { base: true, seg: 8 });
  B.cyl('#b8392e', 0.07, 0.07, 0.15, [bx0 + 0.6, 0.95, bz + 0.15], { base: true, seg: 6, open: true });
  for (let i = 0; i < 3; i++) B.box(['#c4372b', '#d9b13a', '#2f5f8a'][i], [0.025, 0.2, 0.025], [bx0 + 0.58 + i * 0.03, 1.08, bz + 0.15], { rot: [0.1 * (i - 1), 0, 0.12 * (i - 1)] });
  B.box('#c94f6d', [0.3, 0.02, 0.2], [bx0 + 1.3, 0.96, bz + 0.15], { rot: [0, 0.4, 0], noBottom: true });
  // pegboard with painted tool outlines + tools hung on it
  const pz = -hd + 0.03;
  B.box('#a8875e', [3.7, 1.3, 0.02], [bxm, 1.15, pz], { base: true });
  for (let i = 0; i < 6; i++) B.rectZ('#8e6f48', pz + 0.011, [bx0 + 0.2, bx1 - 0.2], [1.25 + i * 0.2, 1.262 + i * 0.2], 1, { off: 0.001 });
  const tool = (x, y, w, h, c, rot = 0) => { B.box('#1f2022', [w + 0.03, h + 0.03, 0.004], [x, y, pz + 0.013], { rot: [0, 0, rot] }); B.box(c, [w, h, 0.025], [x, y, pz + 0.03], { rot: [0, 0, rot] }); };
  tool(bx0 + 0.4, 1.8, 0.05, 0.36, '#6e5238'); tool(bx0 + 0.4, 1.99, 0.18, 0.06, '#5f6468');                      // hammer
  for (let i = 0; i < 4; i++) tool(bx0 + 0.8 + i * 0.16, 1.75 - i * 0.04, 0.04, 0.24 + i * 0.06, '#a9a79e');      // wrenches
  for (let i = 0; i < 3; i++) { tool(bx0 + 1.6 + i * 0.12, 1.85, 0.03, 0.2, '#a9a79e'); tool(bx0 + 1.6 + i * 0.12, 1.66, 0.045, 0.12, ['#c4372b', '#d9b13a', '#2f5f8a'][i]); }
  tool(bx0 + 2.5, 1.75, 0.5, 0.16, '#a9a79e', 0.05); tool(bx0 + 2.2, 1.75, 0.12, 0.1, '#7a4a3a');               // saw
  tool(bx0 + 3.1, 1.85, 0.04, 0.26, '#c4372b', 0.25); tool(bx0 + 3.18, 1.85, 0.04, 0.26, '#c4372b', -0.25);    // pliers
  B.torus('#b5562f', 0.12, 0.018, [bx0 + 3.35, 1.45, pz + 0.04], { rs: 3, ts: 10 });                            // wire coil
  B.box('#e2b93b', [0.1, 0.1, 0.05], [bx0 + 2.9, 1.45, pz + 0.035]);                                             // tape measure
  // key rack beside the bench (`keys` hang from its middle hook)
  const kx = -4.25, ky = 1.55;
  B.box('#6e5238', [0.32, 0.12, 0.025], [kx, ky, -hd + 0.03]);
  for (const t of [-0.1, 0, 0.1]) B.box('#c9a24a', [0.012, 0.012, 0.04], [kx + t, ky - 0.03, -hd + 0.06]);
  // tool chests (red, rolling)
  for (const [x, w] of [[-3.5, 1.1], [-2.3, 0.9]]) {
    B.box('#2a2a2b', [w, 0.12, 0.55], [x, 0, -hd + 0.4], { base: true });
    B.box('#a8382e', [w, 0.95, 0.55], [x, 0.12, -hd + 0.4], { base: true, c: 0.02 });
    for (let i = 0; i < 5; i++) B.rectZ(i % 2 ? '#8e2f26' : '#b9463a', -hd + 0.678, [x - w / 2 + 0.05, x + w / 2 - 0.05], [0.2 + i * 0.17, 0.33 + i * 0.17], 1, { off: 0.001 });
    B.box(PAL.chrome, [w * 0.7, 0.025, 0.03], [x, 1.0, -hd + 0.69]);
  }
  B.box('#a8382e', [1.1, 0.5, 0.5], [-3.5, 1.07, -hd + 0.38], { base: true, c: 0.02 });
  B.box('#8e2f26', [1.1, 0.03, 0.5], [-3.5, 1.57, -hd + 0.38], { base: true });

  // ── left wall: desk (scanner, lamp, notebook), chair, fridge, sofa + spool table ──
  const dx = -hw + 0.45, dz = -2.65;
  B.box('#6f7d74', [0.8, 0.06, 1.6], [dx, 0.7, dz], { base: true });
  B.box('#5f6c64', [0.75, 0.68, 0.45], [dx, 0.02, dz - 0.55], { base: true });
  B.box('#5f6c64', [0.75, 0.68, 0.45], [dx, 0.02, dz + 0.55], { base: true });
  for (const z of [dz - 0.55, dz + 0.55]) for (let i = 0; i < 3; i++) B.rectX('#53605a', dx + 0.376, [z - 0.18, z + 0.18], [0.1 + i * 0.21, 0.27 + i * 0.21], 1, { off: 0.001 });
  // desk lamp
  B.cyl('#2a2a2b', 0.07, 0.08, 0.03, [dx - 0.15, 0.76, dz - 0.6], { base: true, seg: 8 });
  beam(B, '#2a2a2b', [dx - 0.15, 0.78, dz - 0.6], [dx - 0.05, 1.12, dz - 0.5], 0.02);
  beam(B, '#2a2a2b', [dx - 0.05, 1.12, dz - 0.5], [dx + 0.12, 1.08, dz - 0.35], 0.02);
  B.cone('#3e7a6a', 0.09, 0.14, [dx + 0.15, 1.03, dz - 0.32], { seg: 8, rot: [0.4, 0, 0.6] });
  // police scanner radio (antenna, green LCD, speaker grille, red LED)
  B.box('#2b2c2e', [0.26, 0.12, 0.2], [dx - 0.1, 0.76, dz + 0.45], { base: true, c: 0.01, rot: [0, -0.3, 0] });
  B.at([dx - 0.1, 0.82, dz + 0.45], [0, -0.3, 0], () => {
    B.box('#7fd6a0', [0.012, 0.04, 0.1], [0.131, 0.02, -0.03]);
    B.box('#1d1d1e', [0.012, 0.06, 0.07], [0.131, -0.005, 0.06]);
    B.box('#ff3a2a', [0.012, 0.015, 0.015], [0.131, 0.045, 0.06]);
    beam(B, '#8d8a82', [-0.06, 0.06, -0.06], [-0.1, 0.45, -0.1], 0.008);
  });
  B.cyl('#e9e2cf', 0.04, 0.037, 0.1, [dx + 0.1, 0.76, dz + 0.72], { base: true, seg: 8 });
  B.box('#efe9dc', [0.3, 0.03, 0.22], [dx - 0.05, 0.76, dz + 0.05], { base: true, rot: [0, 0.2, 0] });
  // rolling chair facing the desk
  const chx = dx + 0.95, chz = dz + 0.05;
  B.box('#2a2a2b', [0.5, 0.04, 0.06], [chx, 0.06, chz], { rot: [0, 0.3, 0] }); B.box('#2a2a2b', [0.06, 0.04, 0.5], [chx, 0.06, chz], { rot: [0, 0.3, 0] });
  B.cyl('#5a5d60', 0.025, 0.025, 0.38, [chx, 0.06, chz], { base: true, seg: 6 });
  B.box('#3e5f7a', [0.48, 0.09, 0.46], [chx, 0.44, chz], { base: true, c: 0.03 });
  B.box('#3e5f7a', [0.08, 0.5, 0.44], [chx + 0.24, 0.55, chz], { base: true, c: 0.03, rot: [0, 0, -0.12] });
  // fridge
  B.box('#d9d3c0', [0.72, 1.7, 0.72], [-hw + 0.42, 0, -0.75], { base: true, c: 0.06 });
  B.rectX('#bdb6a3', -hw + 0.785, [-1.08, -0.42], [1.13, 1.15], 1, { off: 0.001 });
  B.box(PAL.chrome, [0.04, 0.3, 0.04], [-hw + 0.8, 1.3, -0.45]);
  for (const [z, y, c] of [[-0.9, 1.45, '#c4372b'], [-0.7, 1.55, '#4f8f8a'], [-0.8, 0.9, '#d9b13a']]) B.rectX(c, -hw + 0.785, [z - 0.04, z + 0.04], [y - 0.04, y + 0.04], 1, { off: 0.004 });
  // sofa (worn, facing +X) + cable-spool coffee table with a pizza box
  const sz0 = 1.1, sz1 = 3.4, sx = -hw + 0.5;
  B.box('#6e4a36', [0.9, 0.42, sz1 - sz0], [sx, 0.04, (sz0 + sz1) / 2], { base: true, c: 0.05, cv: true });
  B.box('#634230', [0.28, 0.55, sz1 - sz0], [sx - 0.32, 0.46, (sz0 + sz1) / 2], { base: true, c: 0.06, cv: true });
  for (const z of [sz0 + 0.1, sz1 - 0.1]) B.box('#5a3b2b', [0.9, 0.62, 0.2], [sx, 0.04, z], { base: true, c: 0.06, cv: true });
  for (let i = 0; i < 3; i++) B.box(i === 1 ? '#7a5240' : '#73503c', [0.62, 0.12, 0.66], [sx + 0.08, 0.46, sz0 + 0.42 + i * 0.73], { base: true, c: 0.04 });
  B.box(PAL.rvTeal, [0.7, 0.02, 0.6], [sx + 0.12, 0.6, sz1 - 0.6], { rot: [0, 0.2, 0.1], noBottom: true });
  B.box('#b98552', [0.18, 0.3, 0.32], [sx - 0.1, 0.62, sz0 + 0.45], { rot: [0, 0, 0.3], c: 0.04 });
  const tx = sx + 1.35, tz = (sz0 + sz1) / 2;
  B.cyl('#8a6a4a', 0.5, 0.5, 0.06, [tx, 0.5, tz], { base: true, seg: 10 });
  B.cyl('#6e5238', 0.2, 0.2, 0.5, [tx, 0, tz], { base: true, seg: 8, open: true });
  B.cyl('#8a6a4a', 0.45, 0.45, 0.05, [tx, 0, tz], { base: true, seg: 10 });
  B.box('#e6dcc0', [0.4, 0.04, 0.4], [tx - 0.05, 0.56, tz + 0.1], { base: true, rot: [0, 0.3, 0] });
  B.cyl('#e9e2cf', 0.04, 0.037, 0.1, [tx + 0.25, 0.56, tz - 0.2], { base: true, seg: 6 });

  // ── front-left: two-post lift with Rook's project car (wheels off), tyres ──
  const lx0 = -5.9, lx1 = -2.5, lz = 3.6;
  for (const x of [lx0, lx1]) {
    B.box('#5a5d60', [0.6, 0.03, 0.6], [x, 0, lz], { base: true });
    B.box('#c9a33a', [0.34, 3.9, 0.34], [x, 0.03, lz], { base: true });
    B.box('#9a7a2a', [0.12, 3.6, 0.04], [x - Math.sign(x - (lx0 + lx1) / 2) * 0.17, 0.2, lz], { base: true });
    for (const s of [1, -1]) beam(B, '#c9a33a', [x, 1.5, lz], [x + (x < (lx0 + lx1) / 2 ? 1 : -1) * 1.0, 1.48, lz + s * 1.05], 0.1, 0.07);
  }
  B.box('#c9a33a', [lx1 - lx0 + 0.34, 0.24, 0.3], [(lx0 + lx1) / 2, 3.93, lz], { base: true });
  rod(B, '#1f2022', [[lx0, 3.8, lz - 0.2], [(lx0 + lx1) / 2, 4.05, lz - 0.2], [lx1, 3.8, lz - 0.2]], 0.02, 3);
  B.box('#2a2a2b', [0.3, 0.45, 0.25], [lx0 - 0.4, 1.2, lz + 0.3]);
  B.at([(lx0 + lx1) / 2, 1.22, lz], () => {
    const car = '#9a4a3e';
    B.extrude((cx, cy, cz, nx) => (cz > 1.1 && nx > 0.5 ? PAL.primer : car), [[-2.25, 0.3], [2.25, 0.3], [2.3, 0.5], [2.22, 0.74], [1.0, 0.8], [-1.4, 0.82], [-2.2, 0.8], [-2.3, 0.62]], 1.76, { axis: 'x', bevel: 0.05 });
    const f = B.frustum(car, { y0: 0.81, y1: 1.3, zb: [-1.35, 1.0], zt: [-1.0, 0.4], wb: 0.82, wt: 0.7 });
    for (const face of [f.front, f.back, f.left, f.right]) B.patch(PAL.glass, face, [0.08, 0.92], [0.1, 0.88]);
    for (const [x, z] of [[0.82, 1.4], [-0.82, 1.4], [0.82, -1.4], [-0.82, -1.4]]) { B.cyl('#3a3b3d', 0.12, 0.12, 0.12, [x, 0.32, z], { axis: 'x', seg: 6 }); B.box('#1f1e1c', [0.3, 0.42, 0.62], [x * 0.92, 0.46, z], { noBottom: true }); }
  });
  // tyres: stack + two leaning on the lift post + oil drain pan
  const TYRE = [[0.17, -0.11], [0.29, -0.11], [0.34, -0.065], [0.34, 0.065], [0.29, 0.11], [0.17, 0.11]];
  const tyreCol = (cx, cy, cz, nx, ny, nz) => (Math.abs(ny) > 0.8 || Math.abs(nx) > 0.8 ? '#36373a' : '#232426');
  for (let i = 0; i < 4; i++) B.lathe(tyreCol, TYRE, 8, [-1.4, 0.11 + i * 0.22, 5.9]);
  for (const [z, a] of [[2.3, 0.25], [4.9, -0.25]]) {
    B.lathe(tyreCol, TYRE, 8, [-1.95, 0.34, z], { axis: 'x', rot: [0, 0, a] });
    for (const sx of [1, -1]) B.flat('#7d8084', Array.from({ length: 6 }, (_, i) => [Math.cos(i * Math.PI / 3) * 0.17, Math.sin(i * Math.PI / 3) * 0.17]), (u, v) => [-1.95 + sx * 0.06 - Math.sin(a) * v, 0.34 + v * Math.cos(a), z + u], { facing: [sx, 0, 0], off: 0 });
  }
  B.cyl('#2f3336', 0.45, 0.4, 0.08, [-4.2, 0, 3.4], { base: true, seg: 10, open: true });

  // ── right side: shelving rack, oil drums, compressor, charger + cable, extinguisher ──
  const rx = hw - 0.45;
  for (const z of [2.2, 5.6]) for (const x of [rx - 0.25, rx + 0.25]) B.box('#4f8f8a', [0.05, 2.4, 0.05], [x, 0, z], { base: true });
  for (const y of [0.15, 0.95, 1.75, 2.35]) B.box('#6f7378', [0.6, 0.04, 3.5], [rx, y, 3.9], { base: true });
  for (let i = 0; i < 9; i++) { const y = [0.19, 0.99, 1.79][i % 3], z = 2.5 + Math.floor(i / 3) * 1.1 + rr() * 0.2; B.box(['#c9b98e', '#b98552', '#a9a79c', '#c94f6d'][i % 4], [0.45, 0.3 + rr() * 0.3, 0.5 + rr() * 0.3], [rx, y, z], { base: true, noBottom: true }); }
  for (const [x, z, c] of [[8.3, -6.3, '#3e5f7a'], [7.6, -6.4, '#9a3b2e'], [8.35, -5.6, '#6e5a3e']]) {
    B.cyl(c, 0.29, 0.29, 0.88, [x, 0, z], { base: true, seg: 8 });
    for (const y of [0.3, 0.6]) B.cyl(shade(c, 0.8), 0.295, 0.295, 0.03, [x, y, z], { seg: 8, open: true });
  }
  B.cyl('#4f6a4a', 0.29, 0.29, 0.88, [7.3, 0.29, -5.3], { axis: 'x', seg: 8, rot: [0, 0.7, 0] });
  B.blob('#1f1e1c', 0.8, [6.7, 0.006, -4.7], { seg: 9, seed: 760, off: 0 });
  B.cyl('#b8392e', 0.25, 0.25, 0.9, [8.2, 0.3, 4.9], { axis: 'z', seg: 8 });
  B.box('#2a2a2b', [0.4, 0.3, 0.4], [8.2, 0.55, 4.4], { base: true });
  for (const [x, z] of [[8.0, 4.6], [8.4, 4.6], [8.0, 5.2], [8.4, 5.2]]) B.box('#2a2a2b', [0.06, 0.1, 0.06], [x, 0, z], { base: true });
  // wall charger (shore power) + conduit + heavy cable to the plug on the floor beside the RV
  const cz = -2.0;
  B.box('#3a3b3d', [0.14, 0.46, 0.36], [hw - 0.09, 1.25, cz], { base: true, c: 0.015 });
  B.box('#5fbf6f', [0.012, 0.04, 0.06], [hw - 0.165, 1.6, cz - 0.08]);
  B.box('#d9a83a', [0.012, 0.1, 0.24], [hw - 0.165, 1.42, cz]);
  rod(B, '#8d8a82', [[hw - 0.05, 1.71, cz + 0.1], [hw - 0.05, 6.6, cz + 0.1]], 0.025, 5);
  rod(B, '#1d1d1e', [[hw - 0.12, 1.27, cz], [hw - 0.3, 0.6, cz], [hw - 0.55, 0.05, cz - 0.05], [7.6, 0.04, cz - 0.45], [6.8, 0.04, cz - 0.25], [6.17, 0.045, cz - 0.2]], 0.028, 5);
  B.cyl('#b8392e', 0.08, 0.08, 0.4, [DX0 - 1.1, 0.95, hd - 0.12], { base: true, seg: 8 });
  B.cyl('#2a2a2b', 0.03, 0.03, 0.06, [DX0 - 1.1, 1.35, hd - 0.12], { base: true, seg: 6 });
  B.box('#1f2022', [0.24, 0.24, 0.02], [DX0 - 1.1, 1.75, hd - 0.02]);
  // broom + trash barrel near the door
  beam(B, '#b5976f', [0.6, 0.0, 6.6], [0.75, 1.4, 6.85], 0.03);
  B.box('#c4a43a', [0.3, 0.1, 0.06], [0.6, 0.05, 6.6], { rot: [0, 0, 0.1] });
  B.cyl('#5f6c64', 0.28, 0.25, 0.75, [-0.4, 0, 6.5], { base: true, seg: 8, open: true });

  g.add(kmesh(S, 'shell', undefined, false, true));
  g.add(kmesh(B, 'body', undefined, true, true));

  // ── posters / signs (one atlas, one draw call) ─────────────────────────
  const tex = garageAtlas();
  const U = (r) => uvRect(GA.W, GA.H, ...r);
  g.add(atlasMesh(tex, [
    { c: quadZ(bxm, 3.35, -hd + 0.02, 3.2, 0.8, 1), uv: U(GR.sign) },
    { c: quadX(-hw + 0.02, 2.4, 2.25, 1.0, 1.38, 1), uv: U(GR.rally) },
    { c: quadZ(-1.0, 2.4, -hd + 0.02, 0.9, 1.2, 1), uv: U(GR.oil) },
    { c: quadX(-hw + 0.02, 1.62, -1.45, 0.42, 0.48, 1), uv: U(GR.cal) },
    { c: quadZ(7.7, 1.9, -hd + 0.02, 0.84, 0.64, 1), uv: U(GR.flam) },
    { c: quadX(-hw + 0.02, 1.85, dz, 1.45, 0.9, 1), uv: U(GR.map) },
    { c: quadX(hw - 0.02, 2.3, -4.3, 1.2, 0.8, -1), uv: U(GR.days) },
    { c: quadX(hw - 0.02, 3.0, 3.9, 0.8, 0.84, -1), uv: U(GR.rv) },
  ], 'posters', '#cfc6ae'));

  // ── named parts ─────────────────────────────────────────────────────────
  // roll-up door (outside the wall plane so it slides up behind the header): position.y 0 closed … 4.6 open
  const dk = new Kit(730);
  const dw = DX1 - DX0 + 0.2;
  dk.box('#a7aaa4', [dw, DH, 0.05], [0, DH / 2, 0]);
  for (let i = 1; i < 16; i++) for (const s of [1, -1]) dk.rectZ(i % 2 ? '#8f928c' : '#b8bbb5', s * 0.026, [-dw / 2, dw / 2], [i * 0.29 - 0.012, i * 0.29 + 0.012], s, { off: 0.001 });
  dk.box('#1f2022', [dw, 0.08, 0.08], [0, 0.04, 0]);
  dk.box('#5a5d60', [0.4, 0.05, 0.06], [0.8, 0.9, -0.05]);
  for (const s of [1, -1]) dk.rectZ(PAL.rust, s * 0.027, [-1.6, -1.1], [0.1, 0.35], s, { off: 0.002 });
  g.add(pivot('door', dk.mesh('m'), [(DX0 + DX1) / 2, 0, hd + 0.07]));
  // keys hanging on the rack's middle hook: ring + two keys + an RV-livery fob
  const kk = new Kit(731);
  kk.torus('#c9c6bb', 0.022, 0.004, [0, -0.025, 0], { rs: 3, ts: 8 });
  kk.box('#c9a24a', [0.014, 0.06, 0.004], [-0.01, -0.07, 0.004], { rot: [0, 0, 0.15] });
  kk.box('#c9a24a', [0.026, 0.022, 0.005], [-0.006, -0.042, 0.004]);
  kk.box('#a9a79e', [0.012, 0.055, 0.004], [0.012, -0.068, 0.006], { rot: [0, 0, -0.2] });
  kk.box(PAL.rvTeal, [0.04, 0.06, 0.008], [0.004, -0.085, 0.01], { c: 0.004 });
  kk.box(PAL.rvMustard, [0.042, 0.01, 0.009], [0.004, -0.075, 0.011]);
  g.add(pivot('keys', kk.mesh('m'), [kx, ky - 0.03, -hd + 0.075]));
  // notebook: open spiral notebook on the desk, route sketch on the right page
  const nk = new Kit(732);
  for (const s of [1, -1]) nk.box('#efe9dc', [0.15, 0.012, 0.21], [s * 0.078, 0.006, 0], { rot: [0, 0, s * -0.05] });
  for (let i = 0; i < 6; i++) for (const s of [1, -1]) nk.rectY('#9fb8cf', 0.013, [s * 0.02, s * 0.14].sort((a, b) => a - b), [-0.08 + i * 0.032, -0.077 + i * 0.032], { off: 0.001 });
  nk.rectY('#b8392e', 0.0135, [-0.13, -0.03], [0.02, 0.026], { off: 0.002, rot: undefined });
  nk.rectY('#2b2622', 0.0135, [0.03, 0.12], [-0.05, 0.05], { off: 0.0015 });
  nk.rectY('#efe9dc', 0.014, [0.04, 0.11], [-0.04, 0.04], { off: 0.002 });
  nk.box('#3a3b3d', [0.012, 0.018, 0.21], [0, 0.009, 0]);
  nk.box('#d9b13a', [0.01, 0.01, 0.17], [0.2, 0.006, 0.02], { rot: [0, 0.6, 0] });
  g.add(pivot('notebook', nk.mesh('m'), [dx + 0.05, 0.76, dz - 0.15], [0, Math.PI / 2 + 0.15, 0]));
  // starter crate beside the RV's side door
  const ck = new Kit(733); ck.floor = 0;
  ck.box('#a8875e', [0.9, 0.56, 0.62], [0, 0, 0], { base: true });
  for (const y of [0.18, 0.37]) for (const s of [1, -1]) ck.rectZ('#8a6a4a', s * 0.311, [-0.45, 0.45], [y - 0.008, y + 0.008], s, { off: 0.001 });
  for (const x of [-0.42, 0.42]) for (const s of [1, -1]) ck.rectZ('#5f6468', s * 0.312, [x - 0.03, x + 0.03], [0, 0.56], s, { off: 0.002 });
  ck.box('#b5976f', [0.92, 0.05, 0.64], [0.03, 0.56, -0.02], { base: true, rot: [0, 0.06, 0.04] });
  ck.rectZ(PAL.rvMustard, 0.312, [-0.12, 0.12], [0.2, 0.36], 1, { off: 0.003 });
  ck.rectZ('#2b2622', 0.312, [-0.05, 0.05], [0.24, 0.32], 1, { off: 0.004 });
  g.add(pivot('crate', ck.mesh('m'), [1.55, 0, 0.8], [0, -0.15, 0]));
  // plug at the end of the charger cable (lying on the floor, pins toward the RV at −X)
  const pk = new Kit(734);
  pk.box('#d9a83a', [0.16, 0.08, 0.09], [0, 0.045, 0], { c: 0.012 });
  pk.cyl('#1d1d1e', 0.03, 0.04, 0.08, [0.11, 0.045, 0], { axis: 'x', seg: 6 });
  for (const t of [-0.025, 0, 0.025]) pk.box('#c9c6bb', [0.04, 0.01, 0.008], [-0.1, 0.045 + (t === 0 ? 0.02 : 0), t]);
  g.add(pivot('plug', pk.mesh('m'), [6.05, 0, cz - 0.2]));
  // tutorial floor markers (desk/notebook, key rack, crate, charger plug)
  const MK = [[dx + 0.95 + 0.55, -2.65], [kx, -hd + 1.0], [1.55, 1.75], [6.9, cz + 0.6]];
  MK.forEach(([x, z], i) => g.add(pivot(`marker_${i}`, markerMesh(740 + i), [x, 0.012, z])));
  g.userData.perInstanceMaterials = ['marker_*'];
  g.userData.rvPark = { pos: [4.0, 0, -0.2], rotY: 0, note: 'RV origin when parked in the bay, nose toward the roll-up door (+Z).' };
  g.userData.door = { axis: 'y', closed: 0, open: 4.6, opening: { x: [DX0, DX1], h: DH } };
  g.userData.markers = { marker_0: 'notebook (desk)', marker_1: 'keys (rack)', marker_2: 'crate', marker_3: 'plug (charger)' };
  return g;
}

// ── hardware store atlas ─────────────────────────────────────────────────────
const SA = { W: 1024, H: 512 };
const SR = {
  banner: [0, 0, 1024, 170], a1: [0, 178, 250, 136], a2: [256, 178, 250, 136], a3: [512, 178, 250, 136], a4: [768, 178, 256, 136],
  checkout: [0, 322, 360, 104], sale: [368, 322, 200, 136], open: [576, 322, 200, 84], plumb: [784, 322, 240, 64], keys: [576, 414, 448, 98],
};
function shopAtlas() {
  return atlasTexture({
    key: 'hz_shop_atlas', w: SA.W, h: SA.H, bg: '#2a2622',
    draw: (c) => {
      let [x, y, w, h] = SR.banner;
      c.fillStyle = '#9c4a32'; c.fillRect(x, y, w, h); c.fillStyle = '#e9e2cf'; c.fillRect(x + 8, y + 8, w - 16, h - 16);
      c.fillStyle = '#9c4a32'; c.fillRect(x + 8, y + 120, w - 16, 10);
      txt(c, 'BOLT & BARREL', x + w / 2, y + 66, 900, 96, '#2b2622');
      txt(c, 'HARDWARE  ·  SINCE WHENEVER', x + w / 2, y + 148, 700, 24, '#9c4a32', '800');
      grime(c, x, y, w, h, 31);
      const aisle = (r, n, label, col) => { [x, y, w, h] = r; c.fillStyle = col; c.fillRect(x + 4, y + 4, w - 8, h - 8); c.fillStyle = '#efe9dc'; c.beginPath(); c.arc(x + 46, y + h / 2, 32, 0, 7); c.fill(); txt(c, String(n), x + 46, y + h / 2 + 2, 50, 44, col); txt(c, label, x + 150, y + h / 2, w - 110, 38, '#efe9dc'); grime(c, x, y, w, h, 32 + n); };
      aisle(SR.a1, 1, 'PAINT', '#4f8f8a'); aisle(SR.a2, 2, 'TOOLS', '#9c4a32'); aisle(SR.a3, 3, 'HARDWARE', '#5a6a7a'); aisle(SR.a4, 4, 'GARDEN', '#6a7f45');
      [x, y, w, h] = SR.checkout; c.fillStyle = '#2b2622'; c.fillRect(x, y, w, h); txt(c, 'CHECKOUT', x + w / 2, y + h / 2, w - 40, 56, '#d9a83a');
      [x, y, w, h] = SR.sale; c.fillStyle = '#e2b93b'; c.fillRect(x, y, w, h); txt(c, 'SALE', x + w / 2, y + 54, w - 30, 64, '#b8392e'); txt(c, 'buckets 2 for 1', x + w / 2, y + 108, w - 24, 22, '#2b2622', '800');
      [x, y, w, h] = SR.open; c.fillStyle = '#1f2022'; c.fillRect(x, y, w, h); txt(c, 'OPEN', x + w / 2, y + h / 2, w - 40, 56, '#ff6a4a');
      [x, y, w, h] = SR.plumb; c.fillStyle = '#5a6a7a'; c.fillRect(x, y, w, h); txt(c, 'PLUMBING', x + w / 2, y + h / 2, w - 30, 40, '#efe9dc');
      [x, y, w, h] = SR.keys; c.fillStyle = '#efe9dc'; c.fillRect(x, y, w, h); txt(c, 'KEYS CUT WHILE U WAIT', x + w / 2, y + 36, w - 30, 36, '#2b2622'); txt(c, 'ask at the counter', x + w / 2, y + 74, w - 60, 24, '#9c4a32', '800');
      grime(c, 0, 322, 1024, 190, 39);
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 24. shop_hardware_interior — Bolt & Barrel, 20 × 14 m. Entrance in the front wall (+Z) at x −3.8..−2.2.
//     Four double-sided aisles along Z (1 paint, 2 tools, 3 hardware, 4 garden & sacks), checkout front-left.
//     cam_0 / cam_1 rotate on Y (sweep around userData.cams[i].baseYaw); `cam_i_view` (child) holds a
//     translucent vision cone that meets the floor. item_0..2 glow where the challenge items sit.
// ═════════════════════════════════════════════════════════════════════════════
export function buildShopHardwareInterior(variant = 0) {
  const W = 20, D = 14, H = 4.6, hw = 10, hd = 7;
  const g = root('shop_hardware_interior', variant, { w: W, h: H, l: D });
  const S = new Kit(800);
  const B = new Kit(801); B.floor = 0;
  const rr = rng(802);
  // floor tiles (2 m checker), entrance mat, scuffs
  S.box('#a39d8f', [W, 0.04, D], [0, -0.02, 0]);
  for (let i = 0; i < 10; i++) for (let j = 0; j < 7; j++) S.rectY((i + j) % 2 ? '#cfc8b6' : '#bdb6a3', 0, [-hw + i * 2, -hw + i * 2 + 2], [-hd + j * 2, -hd + j * 2 + 2], { off: 0.001 });
  S.rectY('#3a3633', 0.002, [-3.9, -2.1], [5.6, 6.9], { off: 0.002 });
  // walls: back + right full; left + front (storefront) — all single-sided
  const wo = { low: '#7d8f86', up: '#d8d0bd', band: 1.1, stripes: false };
  wallZ(S, -hd, -hw, hw, H, 1, wo);
  wallX(S, hw, -hd, hd, H, -1, wo);
  wallX(S, -hw, -hd, hd, H, 1, wo);
  // storefront: low panel + glazing + mullions, entrance door (glass + frame + push bar)
  S.rectZ('#7d8f86', hd, [-hw, hw], [0, 0.8], -1, { off: 0 });
  S.rectZ('#d8d0bd', hd, [-hw, hw], [3.3, H], -1, { off: 0 });
  S.rectZ('#d8d0bd', hd, [-hw, -3.9], [0.8, 3.3], -1, { off: 0 });
  S.rectZ('#a9c3cb', hd, [-2.1, hw], [0.8, 3.3], -1, { off: 0 });
  for (let x = -2.1; x <= hw; x += 2.42) S.rectZ('#4c4f52', hd, [x - 0.05, x + 0.05], [0.8, 3.3], -1, { off: 0.004 });
  S.rectZ('#4c4f52', hd, [-2.1, hw], [3.25, 3.32], -1, { off: 0.004 });
  S.rectZ('#4c4f52', hd, [-3.9, -2.1], [0, 2.6], -1, { off: 0.002 });
  S.rectZ('#a9c3cb', hd, [-3.8, -2.2], [0.1, 2.5], -1, { off: 0.004 });
  S.rectZ('#a9c3cb', hd, [-3.9, -2.1], [2.6, 3.3], -1, { off: 0.002 });
  S.rectZ(PAL.chrome, hd, [-3.6, -2.4], [1.0, 1.08], -1, { off: 0.008 });
  // open-joist ceiling (no deck: the camera sees in from above), frame, strip lights over the aisles
  for (const z of [-5.25, -1.75, 1.75, 5.25]) S.box('#8d9296', [W, 0.16, 0.1], [0, H - 0.2, z]);
  frame(S, W, D, H, '#5d6266', [[0, -hd], [-hw, 0], [hw, 0]]);
  const AX = [-5.4, -1.8, 1.8, 5.4];
  for (const x of AX) tubeLight(S, x + 1.8 - 0.0, 3.7, -0.9, 6.2, H - 0.34);
  tubeLight(S, -7.6, 3.7, 4.1, 2.4, H - 0.34);

  // ── gondolas (double-sided, 7.2 m along Z, 4 shelf levels) ──────────────
  const Z0 = -4.6, Z1 = 2.6, ZL = Z1 - Z0, ZC = (Z0 + Z1) / 2, LEV = [0.15, 0.62, 1.09, 1.56];
  const gondola = (x, spine) => {
    B.box('#3a3b3d', [0.9, 0.15, ZL], [x, 0, ZC], { base: true });
    B.box(spine, [0.05, 1.9, ZL], [x, 0.15, ZC], { base: true });
    for (const y of LEV.slice(1)) for (const s of [1, -1]) B.box('#a9adb0', [0.42, 0.03, ZL], [x + s * 0.235, y - 0.03, ZC], { base: true });
    B.box('#5d6266', [0.92, 0.05, ZL], [x, 2.05, ZC], { base: true });
    for (const z of [Z0, Z1]) for (const s2 of [1, -1]) B.box('#5d6266', [0.04, 2.08, 0.04], [x + s2 * 0.44, 0, z], { base: true });
  };
  const PAINTS = ['#c94f6d', '#3e7fa0', '#e2b93b', '#efe9dc', '#4f8f8a', '#9c4a32', '#7b62a8', '#6f8c4a'];
  // aisle 1 — paint
  {
    const x = AX[0]; gondola(x, '#7d8f86');
    for (const s of [1, -1]) {
      const sx = x + s * 0.27;
      for (let i = 0; i < 3; i++) { B.cyl('#d9d3c0', 0.17, 0.17, 0.38, [sx, LEV[0], Z0 + 0.9 + i * 2.4], { base: true, seg: 8, open: true }); B.blob('#c9c3b2', 0.17, [sx, LEV[0] + 0.38, Z0 + 0.9 + i * 2.4], { seg: 8, wobble: 0, off: 0 }); }
      for (const [lv, n] of [[1, 6], [2, 6]]) for (let i = 0; i < n; i++) {
        const z = Z0 + 0.5 + i * 1.18 + (lv === 2 ? 0.4 : 0), c = PAINTS[(i + lv * 3 + (s > 0 ? 0 : 1)) % PAINTS.length];
        B.cyl(c, 0.1, 0.1, 0.2, [sx, LEV[lv], z], { base: true, seg: 6, open: true });
        B.blob('#a9adb0', 0.1, [sx, LEV[lv] + 0.2, z], { seg: 6, wobble: 0, off: 0 });
      }
      for (let i = 0; i < 3; i++) B.box('#d9d3c0', [0.3, 0.12, 0.5], [sx, LEV[3], Z0 + 1.2 + i * 2.3], { base: true, noBottom: true });
    }
    // sale end cap: bucket pyramid
    for (const [dx2, dy, dz2] of [[-0.2, 0, 0], [0.2, 0, 0], [0, 0.36, 0]]) { B.cyl('#e2b93b', 0.17, 0.15, 0.36, [x + dx2, dy, Z1 + 0.35 + dz2], { base: true, seg: 8, open: true }); B.blob('#c9a032', 0.17, [x + dx2, dy + 0.36, Z1 + 0.35 + dz2], { seg: 8, wobble: 0, off: 0 }); }
  }
  // aisle 2 — tools: pegboard spine with carded tools + boxed power tools
  {
    const x = AX[1]; gondola(x, '#a8875e');
    for (const s of [1, -1]) {
      const fx = x + s * 0.03;
      for (let r = 0; r < 2; r++) for (let i = 0; i < 12; i++) {
        const z = Z0 + 0.35 + i * 0.58, y = 1.3 + r * 0.32;
        B.rectX(['#c4372b', '#e2b93b', '#3e7fa0', '#efe9dc'][(i + r) % 4], fx, [z - 0.09, z + 0.09], [y - 0.12, y + 0.12], s, { off: 0.03 });
        B.rectX('#5a5d60', fx, [z - 0.05, z + 0.05], [y - 0.07, y + 0.06], s, { off: 0.034 });
      }
      for (const lv of [0, 1]) for (let i = 0; i < 5; i++) B.box(['#2f5f8a', '#c4372b', '#e2b93b', '#3a3b3d'][(i + lv) % 4], [0.34, 0.3 + (i % 2) * 0.06, 0.5], [x + s * 0.27, LEV[lv], Z0 + 0.6 + i * 1.5], { base: true, noBottom: true });
    }
  }
  // aisle 3 — hardware: bins of fasteners + boxes
  {
    const x = AX[2]; gondola(x, '#7d8f86');
    for (const s of [1, -1]) {
      const sx = x + s * 0.27;
      for (const lv of [1, 2, 3]) {
        B.box('#3a3b3d', [0.36, 0.16, ZL - 0.2], [sx, LEV[lv], ZC], { base: true, noBottom: true });
        for (let i = 0; i < 9; i++) B.rectX(['#e2b93b', '#efe9dc', '#c4372b', '#3e7fa0', '#a9adb0'][(i + lv) % 5], sx + s * 0.18, [Z0 + 0.25 + i * 0.78, Z0 + 0.85 + i * 0.78], [LEV[lv] + 0.03, LEV[lv] + 0.13], s, { off: 0.003 });
      }
      for (let i = 0; i < 4; i++) B.box(['#c9b98e', '#b98552'][i % 2], [0.38, 0.36, 0.7], [sx, LEV[0], Z0 + 0.8 + i * 1.8], { base: true, noBottom: true });
    }
  }
  // aisle 4 — garden & sacks: sacks below, hoses + boxes above, pallet of sacks on the end cap
  {
    const x = AX[3]; gondola(x, '#6a7f45');
    for (const s of [1, -1]) {
      const sx = x + s * 0.27;
      for (const lv of [0, 1]) for (let i = 0; i < 4; i++) {
        const c = ['#d6c08a', '#b9a77a', '#8a9a6a', '#c9b98e'][(i + lv) % 4];
        B.box(c, [0.38, 0.3, 0.75], [sx, LEV[lv], Z0 + 0.8 + i * 1.85], { base: true, noBottom: true, taper: [0.9, 0.85] });
        B.rectX(shade(c, 0.75), sx + s * 0.19, [Z0 + 0.6 + i * 1.85, Z0 + 1.0 + i * 1.85], [LEV[lv] + 0.1, LEV[lv] + 0.2], s, { off: 0.004 });
      }
      for (let i = 0; i < 4; i++) B.cyl('#3f7a3f', 0.18, 0.18, 0.12, [sx, LEV[2] + 0.18, Z0 + 1.0 + i * 1.7], { axis: 'x', seg: 8, open: true });
      for (let i = 0; i < 3; i++) B.box(['#6f8c4a', '#e2b93b'][i % 2], [0.3, 0.32, 0.45], [sx, LEV[3], Z0 + 1.2 + i * 2.4], { base: true, noBottom: true });
    }
    B.box('#8a6a4a', [1.0, 0.14, 1.2], [x, 0, Z1 + 0.75], { base: true, noBottom: true });
    for (let i = 0; i < 5; i++) B.box(['#d6c08a', '#b9a77a'][i % 2], [0.45, 0.2, 0.6], [x + (i % 2 ? 0.24 : -0.24), 0.14 + Math.floor(i / 2) * 0.2, Z1 + 0.75 + (i % 3 - 1) * 0.1], { base: true, noBottom: true, rot: [0, (i - 2) * 0.08, 0] });
  }

  // ── back wall: plumbing pipes on brackets + boxed fittings; ladders ────
  const wz = -hd + 0.3;
  for (const y of [0.4, 1.2, 2.0]) B.box('#6f7378', [12, 0.04, 0.5], [0, y, wz], { base: true });
  for (const x of [-6, -2, 2, 6]) B.box('#4c4f52', [0.05, 2.4, 0.05], [x, 0, wz + 0.22], { base: true });
  for (let i = 0; i < 10; i++) B.cyl(['#d9d3c0', '#b5562f', '#5a5d60'][i % 3], 0.04, 0.04, 2.8 + (i % 3) * 0.6, [-4 + (i % 5) * 2.0, 0.48 + Math.floor(i / 5) * 0.8 + (i % 2) * 0.09, wz - 0.05 + (i % 2) * 0.12], { axis: 'x', seg: 5, open: true });
  for (let i = 0; i < 8; i++) B.box(['#c9b98e', '#3e7fa0', '#b98552'][i % 3], [0.6 + rr() * 0.4, 0.3, 0.4], [-5.5 + i * 1.55, 2.04, wz], { base: true, noBottom: true });
  for (const x of [7.6, 8.4]) {
    const a = x > 8 ? 0.12 : -0.08;
    beam(B, '#c4a43a', [x - 0.25, 0, wz + 0.4], [x - 0.2, 2.3, wz + 0.05 + a], 0.05);
    beam(B, '#c4a43a', [x + 0.25, 0, wz + 0.4], [x + 0.2, 2.3, wz + 0.05 + a], 0.05);
    for (let i = 1; i < 6; i++) B.box('#9a8030', [0.46, 0.03, 0.08], [x, i * 0.38, wz + 0.4 - i * 0.055], { noBottom: true });
  }
  // right wall: garden tools in a bin (shovels/rakes)
  B.cyl('#5a5d60', 0.35, 0.35, 0.6, [hw - 0.5, 0, 0.2], { base: true, seg: 8, open: true });
  for (let i = 0; i < 6; i++) { const z = 0.2 + (i - 2.5) * 0.12, tilt = (i - 2.5) * 0.06; beam(B, '#b5976f', [hw - 0.5, 0.1, z], [hw - 0.5 + tilt, 1.5, z + tilt], 0.035); B.box(i % 2 ? '#7a7f84' : '#5a5d60', [0.03, 0.22, 0.2], [hw - 0.5 + tilt * 1.07, 1.62, z + tilt * 1.07]); }
  // basket stack at the entrance
  for (let i = 0; i < 4; i++) B.box('#c4372b', [0.42, 0.06, 0.32], [-1.5, 0.05 + i * 0.07, 6.1], { base: true, taper: [1.05, 1.05] });

  // ── checkout (front-left): counter, till, impulse rack, bag stand, stool ──
  const cx = -7.2, cz0 = 2.7, cz1 = 5.3, czm = (cz0 + cz1) / 2;
  B.box('#9c4a32', [0.7, 0.92, cz1 - cz0], [cx, 0, czm], { base: true });
  B.box('#efe9dc', [0.78, 0.05, cz1 - cz0 + 0.06], [cx, 0.92, czm], { base: true });
  B.box('#9c4a32', [1.8, 0.92, 0.7], [cx - 1.25, 0, cz0 + 0.0], { base: true });
  B.box('#efe9dc', [1.86, 0.05, 0.78], [cx - 1.25, 0.92, cz0], { base: true });
  B.box('#1f2022', [0.42, 0.012, 1.2], [cx, 0.97, cz1 - 0.75], { base: true });
  B.box('#2b2c2e', [0.4, 0.14, 0.42], [cx - 0.05, 0.97, cz0 + 0.55], { base: true, c: 0.015 });            // till: drawer base
  B.box('#3a3b3d', [0.32, 0.08, 0.26], [cx + 0.0, 1.11, cz0 + 0.55], { base: true, rot: [0, 0, 0.35] });  // keyboard
  B.box('#2b2c2e', [0.05, 0.22, 0.05], [cx - 0.15, 1.11, cz0 + 0.55], { base: true });
  B.box('#1f2022', [0.06, 0.12, 0.24], [cx - 0.15, 1.33, cz0 + 0.55], { base: true });
  B.box('#7fd6a0', [0.012, 0.06, 0.18], [cx - 0.115, 1.36, cz0 + 0.55]);
  B.box('#efe9dc', [0.12, 0.08, 0.12], [cx, 0.97, cz0 + 0.95], { base: true });                             // receipt printer
  for (let i = 0; i < 3; i++) B.box(['#c4372b', '#e2b93b', '#3e7fa0'][i], [0.24, 0.12, 0.6], [cx + 0.5 - i * 0.02, 0.2 + i * 0.32, czm + 0.2], { base: true });
  beam(B, '#8d8a82', [cx + 0.42, 0, czm + 0.55], [cx + 0.42, 1.2, czm + 0.55], 0.03);
  B.box('#e6dcc0', [0.3, 0.4, 0.2], [cx - 0.2, 0.97, cz1 - 0.15], { base: true, noBottom: true });          // paper bags
  B.cyl('#5a5d60', 0.03, 0.03, 0.6, [cx - 1.0, 0, czm], { base: true, seg: 6 });
  B.cyl('#2a2a2b', 0.18, 0.18, 0.06, [cx - 1.0, 0.6, czm], { base: true, seg: 8 });
  B.box('#efe9dc', [0.03, 0.4, 0.6], [cx - 0.6, 1.4, cz0 - 0.3], { base: true });                           // keys-cut board backing

  // sign hangers (merged into the shell)
  for (const x of AX) for (const t of [-0.35, 0.35]) S.box('#5d6266', [0.015, H - 0.34 - 3.26, 0.015], [x + t, 3.26 + (H - 0.34 - 3.26) / 2, 1.75]);
  for (const t of [-0.5, 0.5]) S.box('#5d6266', [0.015, H - 0.34 - 3.08, 0.015], [-7.2 + t, 3.08 + (H - 0.34 - 3.08) / 2, 4.0]);
  g.add(kmesh(S, 'shell', undefined, false, true));
  g.add(kmesh(B, 'body', undefined, true, true));

  // ── signs atlas: banner, 4 hanging aisle signs (double-sided), checkout, sale, open, plumbing, keys ──
  const tex = shopAtlas();
  const U = (r) => uvRect(SA.W, SA.H, ...r);
  const quads = [
    { c: quadZ(0, 3.25, -hd + 0.02, 4.4, 0.73, 1), uv: U(SR.banner) },
    { c: quadZ(-7.2, 2.9, 4.012, 1.25, 0.36, 1), uv: U(SR.checkout) },
    { c: quadZ(-7.2, 2.9, 3.988, 1.25, 0.36, -1), uv: U(SR.checkout) },
    { c: quadZ(AX[0], 0.24, Z1 + 0.56, 0.45, 0.3, 1), uv: U(SR.sale) },
    { c: quadZ(-3.0, 2.9, hd - 0.03, 0.6, 0.25, -1), uv: U(SR.open) },
    { c: quadZ(0, 2.62, -hd + 0.02, 1.4, 0.36, 1), uv: U(SR.plumb) },
    { c: quadX(cx - 0.58, 1.6, cz0 - 0.3, 0.56, 0.12, 1), uv: U(SR.keys) },
  ];
  [SR.a1, SR.a2, SR.a3, SR.a4].forEach((r, i) => { for (const dir of [1, -1]) quads.push({ c: quadZ(AX[i], 3.0, 1.75 + dir * 0.012, 0.95, 0.52, dir), uv: U(r) }); });
  g.add(atlasMesh(tex, quads, 'signs', '#cfc6ae'));

  // ── security cameras: pivot at the ceiling mount, rotation.y sweeps; child `cam_i_view` cone meets the floor ──
  const coneMat = glowMaterial('#ff5a3a', 0.12, 'CR_CamCone');
  const CAMS = [{ pos: [8.6, H - 0.35, -5.6], yaw: -0.85, sweep: 0.6 }, { pos: [-5.6, H - 0.35, 5.7], yaw: 2.45, sweep: 0.7 }];
  const pitch = 0.75, half = 0.34;
  CAMS.forEach((c, i) => {
    const ck = new Kit(810 + i);
    ck.box('#d9d6cf', [0.14, 0.04, 0.14], [0, 0.0, 0]);
    ck.cyl('#d9d6cf', 0.02, 0.02, 0.16, [0, -0.08, 0], { seg: 5 });
    ck.at([0, -0.18, 0], [pitch, 0, 0], () => {
      ck.box('#e6e2d6', [0.13, 0.12, 0.3], [0, 0, 0.0], { c: 0.02 });
      ck.box('#c9c5b8', [0.16, 0.025, 0.34], [0, 0.07, 0.02]);
      ck.cyl('#1d1d1e', 0.035, 0.035, 0.02, [0, 0, 0.155], { axis: 'z', seg: 8 });
      ck.box('#ff3a2a', [0.015, 0.015, 0.01], [0.045, 0.035, 0.152]);
    });
    const cam = pivot(`cam_${i}`, ck.mesh('m'), c.pos, [0, c.yaw, 0]);
    // vision cone in the cam's local frame: apex at the lens, rays pitched down, clipped by the floor (y = 0)
    const lens = new THREE.Vector3(0, -0.18, 0).add(new THREE.Vector3(0, 0, 0.165).applyAxisAngle(new THREE.Vector3(1, 0, 0), pitch));
    const fwd = new THREE.Vector3(0, -Math.sin(pitch), Math.cos(pitch)), upv = new THREE.Vector3(0, Math.cos(pitch), Math.sin(pitch)), rt = new THREE.Vector3(1, 0, 0);
    const hLens = c.pos[1] + lens.y;
    const base = [];
    const N = 10;
    for (let j = 0; j < N; j++) {
      const a = (j / N) * Math.PI * 2;
      const d = fwd.clone().multiplyScalar(Math.cos(half)).add(rt.clone().multiplyScalar(Math.cos(a) * Math.sin(half))).add(upv.clone().multiplyScalar(Math.sin(a) * Math.sin(half))).normalize();
      const t = Math.min(hLens / Math.max(0.05, -d.y), 20);
      const p = d.multiplyScalar(t);
      p.y = -hLens + 0.02;
      base.push(p);
    }
    const vk = new Kit(820 + i);
    for (let j = 0; j < N; j++) vk.poly('#ff5a3a', [[0, 0, 0], base[j].toArray(), base[(j + 1) % N].toArray()], { facing: [0, -1, 0] });
    vk.poly('#ff5a3a', base.map((p) => [p.x, -hLens + 0.02, p.z]), { facing: [0, 1, 0] });
    const vm = new THREE.Mesh(vk.geometry(), coneMat); vm.castShadow = false; vm.renderOrder = 4;
    cam.add(pivot(`cam_${i}_view`, vm, lens.toArray()));
    g.add(cam);
  });
  // pickup glow spots (additive pad + soft column)
  const ITEMS = [[AX[1] + 0.3, LEV[2] + 0.005, -0.8], [AX[3] - 0.27, LEV[0] + 0.005, 0.82], [6.8, 0.012, -6.2]];
  ITEMS.forEach(([x, y, z], i) => {
    const ik = new Kit(830 + i);
    ring(ik, '#ffd36a', 0.0, 0.22, [0, 0, 0], 12);
    ring(ik, '#fff0b0', 0.22, 0.27, [0, 0.001, 0], 12);
    ik.cyl((cx2, cy) => (cy > 0.4 ? '#140e02' : cy > 0.15 ? '#5a4210' : '#a87a22'), 0.2, 0.24, 0.7, [0, 0.35, 0], { seg: 10, open: true });
    const m = new THREE.Mesh(ik.geometry(), glowAdd('CR_ItemGlow')); m.castShadow = false; m.renderOrder = 3;
    g.add(pivot(`item_${i}`, m, [x, y, z]));
  });
  // clerk spot: behind the counter on an anti-fatigue mat, facing the counter (+X)
  const mk = new Kit(840);
  mk.box('#242423', [0.9, 0.015, 0.6], [0, 0.0075, 0]);
  mk.rectY('#4a4844', 0.016, [-0.42, 0.42], [-0.27, -0.24], { off: 0.001 });
  g.add(pivot('clerk_spot', mk.mesh('m'), [cx - 0.95, 0, czm + 0.4], [0, Math.PI / 2, 0]));
  g.userData.cams = CAMS.map((c, i) => ({ name: `cam_${i}`, baseYaw: c.yaw, sweep: c.sweep, pitch, halfAngle: half }));
  g.userData.perInstanceMaterials = ['cam_0_view_mesh', 'cam_1_view_mesh', 'item_*'];
  g.userData.entrance = { x: [-3.8, -2.2], z: hd };
  return g;
}
