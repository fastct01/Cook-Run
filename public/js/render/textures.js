// Canvas-generated textures (no image files): particle atlas, text boards, comic words.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// ── particle atlas: 4×4 cells of 64 px ──────────────────────────────────────
export const ATLAS = { PUFF: 0, GLOW: 1, STAR: 2, QUESTION: 3, RING: 4, FLAME: 5, SPARK: 6, DUST: 7, CHUNK: 8 };
let atlasTex = null;
export function particleAtlas() {
  if (atlasTex) return atlasTex;
  const S = 64, c = canvas(S * 4, S * 4), g = c.getContext('2d');
  const cell = (i, fn) => { const x = (i % 4) * S, y = Math.floor(i / 4) * S; g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, S, S); g.clip(); fn(g); g.restore(); };
  // puff: lumpy soft cloud
  cell(ATLAS.PUFF, (g) => {
    const blobs = [[32, 34, 22], [22, 30, 14], [42, 28, 15], [30, 22, 13], [38, 40, 14], [24, 40, 12]];
    for (const [x, y, r] of blobs) {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  });
  cell(ATLAS.GLOW, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 31);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  });
  cell(ATLAS.STAR, (g) => {
    g.translate(32, 33); g.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 11 : 27, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath(); g.fillStyle = '#ffd94a'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#7a4a10'; g.stroke();
  });
  cell(ATLAS.QUESTION, (g) => {
    g.fillStyle = '#f1ead8'; g.beginPath(); g.arc(32, 32, 27, 0, Math.PI * 2); g.fill();
    g.lineWidth = 4; g.strokeStyle = '#22262a'; g.stroke();
    g.font = 'bold 40px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#22262a'; g.fillText('?', 32, 35);
  });
  cell(ATLAS.RING, (g) => {
    g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,1)'; g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 12; g.strokeStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke();
  });
  cell(ATLAS.FLAME, (g) => {
    const gr = g.createRadialGradient(32, 40, 0, 32, 34, 28);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,230,160,0.9)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(32, 34, 18, 28, 0, 0, Math.PI * 2); g.fill();
  });
  cell(ATLAS.SPARK, (g) => {
    const gr = g.createLinearGradient(0, 32, 64, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 28, 64, 8);
  });
  cell(ATLAS.DUST, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(32, 32, 30, 14, 0, 0, Math.PI * 2); g.fill();
  });
  cell(ATLAS.CHUNK, (g) => {
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(14, 18); g.lineTo(46, 10); g.lineTo(54, 40); g.lineTo(24, 54); g.closePath(); g.fill();
  });
  atlasTex = new THREE.CanvasTexture(c);
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  atlasTex.generateMipmaps = true;
  atlasTex.minFilter = THREE.LinearMipmapLinearFilter;
  return atlasTex;
}

// ── text boards (road signs, store pylons) ─────────────────────────────────
const boardCache = new Map();
export function textBoardMaterial(lines, { bg = '#e8a23a', fg = '#22262a', border = '#22262a', w = 512, h = 256, font = 'Impact, "Arial Black", "DejaVu Sans", sans-serif', sub = null, stripe = null, emissive = 0 } = {}) {
  const key = JSON.stringify([lines, bg, fg, border, w, h, sub, stripe, emissive]);
  let m = boardCache.get(key);
  if (m) return m;
  const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (stripe) { g.fillStyle = stripe; for (let x = -h; x < w; x += 48) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 24, h); g.lineTo(x + 24 + h * 0.25, h * 0.75); g.lineTo(x + h * 0.25, h * 0.75); g.fill(); } }
  g.lineWidth = Math.max(6, h * 0.05); g.strokeStyle = border; g.strokeRect(g.lineWidth, g.lineWidth, w - g.lineWidth * 2, h - g.lineWidth * 2);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const arr = Array.isArray(lines) ? lines : [lines];
  const area = stripe ? h * 0.72 : h;
  const lh = (area * 0.8) / arr.length;
  arr.forEach((line, i) => {
    let size = lh * 0.82;
    g.font = `bold ${size}px ${font}`;
    while (g.measureText(line).width > w * 0.88 && size > 8) { size -= 2; g.font = `bold ${size}px ${font}`; }
    g.fillText(line, w / 2, area * 0.1 + lh * (i + 0.5) + (stripe ? 0 : 0));
  });
  if (sub) { g.font = `bold ${h * 0.12}px ${font}`; g.fillText(sub, w / 2, h * 0.86); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  m = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
  if (emissive) { m.emissive = new THREE.Color('#ffffff'); m.emissiveMap = tex; m.emissiveIntensity = emissive; }
  m.userData.noBake = true;
  boardCache.set(key, m);
  return m;
}

// ── comic pop words ─────────────────────────────────────────────────────────
const wordCache = new Map();
export function comicWordTexture(word, { fill = '#ffd94a', stroke = '#22262a', burst = '#d8433a' } = {}) {
  const key = word + fill + burst;
  let t = wordCache.get(key);
  if (t) return t;
  const w = 512, h = 256, c = canvas(w, h), g = c.getContext('2d');
  // starburst
  g.save(); g.translate(w / 2, h / 2); g.beginPath();
  const n = 18;
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? 0.62 : 1.0;
    const jitter = 0.9 + ((i * 37) % 10) / 50;
    g.lineTo(Math.cos(a) * 240 * r * jitter, Math.sin(a) * 118 * r * jitter);
  }
  g.closePath(); g.fillStyle = burst; g.fill(); g.lineWidth = 8; g.strokeStyle = stroke; g.stroke();
  g.restore();
  let size = 120;
  const font = (s) => `bold ${s}px Impact, "Arial Black", "DejaVu Sans", sans-serif`;
  g.font = font(size);
  while (g.measureText(word).width > w * 0.7 && size > 30) { size -= 4; g.font = font(size); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.save(); g.translate(w / 2, h / 2 + 6); g.rotate(-0.08);
  g.lineJoin = 'round'; g.lineWidth = 18; g.strokeStyle = stroke; g.strokeText(word, 0, 0);
  g.fillStyle = fill; g.fillText(word, 0, 0);
  g.restore();
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  wordCache.set(key, t);
  return t;
}

// Vertical gradient for spotlight cones etc.
let coneTex = null;
export function coneGradient() {
  if (coneTex) return coneTex;
  const c = canvas(4, 64), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0.0)'); gr.addColorStop(0.15, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0.05)');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
  coneTex = new THREE.CanvasTexture(c);
  return coneTex;
}

let ringTex = null;
export function ringTexture() {
  if (ringTex) return ringTex;
  const S = 256, c = canvas(S, S), g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.15)');
  gr.addColorStop(0.8, 'rgba(255,255,255,1)'); gr.addColorStop(0.9, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  // chevrons pointing inward
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 4; i++) {
    g.save(); g.translate(S / 2, S / 2); g.rotate(i * Math.PI / 2);
    g.beginPath(); g.moveTo(-14, -S * 0.36); g.lineTo(0, -S * 0.3); g.lineTo(14, -S * 0.36); g.lineTo(14, -S * 0.33); g.lineTo(0, -S * 0.27); g.lineTo(-14, -S * 0.33); g.fill();
    g.restore();
  }
  ringTex = new THREE.CanvasTexture(c);
  ringTex.colorSpace = THREE.SRGBColorSpace;
  return ringTex;
}

let discTex = null;
export function softDiscTexture() {
  if (discTex) return discTex;
  const S = 128, c = canvas(S, S), g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  discTex = new THREE.CanvasTexture(c);
  return discTex;
}
