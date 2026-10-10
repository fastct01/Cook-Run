// ─────────────────────────────────────────────────────────────────────────────
// Second page of the particle atlas (cells 16–31) for the expansion effects.
// The particle system (render/particles.js) draws page 0 (textures.js ATLAS,
// cells 0–15) and this page side by side in one 8×4 texture, so every particle
// in the game still costs at most one draw call per layer.
// All cells are white/grey silhouettes so particles can tint them.
// ─────────────────────────────────────────────────────────────────────────────
export const XATLAS = Object.freeze({
  EXCL: 16,      // "?!" speech bubble (stalled cop)
  DROP: 17,      // water drop
  SPLAT: 18,     // paint splat silhouette
  CONFETTI: 19,  // small paper rectangle
  SHOCK: 20,     // shockwave ring (thin bright edge, soft inside)
  RIPPLE: 21,    // thin soft water ring
  FOAM: 22,      // bubbly foam blob
  STREAK: 23,    // soft streak (spray, rain-like drops)
  SOFT: 24,      // very soft round vapour puff
  WISP: 25,      // stretched wispy cloud
  PLANK: 26,     // debris board
  SPARK2: 27,    // 4-point sparkle
  FLASH: 28,     // bloom with rays (canister flash)
  BURST: 29,     // starburst silhouette
  SWIRL: 30,     // curved swirl stroke
  NOTE: 31,      // music note (marching band)
});

const S = 64;
function cell(g, i, fn) {
  const c = i - 16;
  const x = (c % 4) * S, y = Math.floor(c / 4) * S;
  g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, S, S); g.clip(); fn(g); g.restore();
}
function radial(g, x, y, r, stops) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}
// tiny deterministic rng so the atlas is identical every load
let _s = 1234567;
const rnd = () => { _s = (Math.imul(_s, 1103515245) + 12345) >>> 0; return (_s >>> 8) / 16777216; };

/** Draws page 1 into a 256×256 canvas context (origin = page top-left). */
export function drawExtraPage(g) {
  _s = 1234567;
  cell(g, XATLAS.EXCL, (g) => {
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(32, 29, 28, 24, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(22, 46); g.lineTo(14, 61); g.lineTo(34, 50); g.fill();
    g.lineWidth = 3.5; g.strokeStyle = '#22262a'; g.beginPath(); g.ellipse(32, 29, 27, 23, 0, 0, Math.PI * 2); g.stroke();
    g.font = 'bold 30px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#d8433a'; g.fillText('?!', 32, 31);
  });
  cell(g, XATLAS.DROP, (g) => {
    const gr = g.createRadialGradient(28, 38, 2, 32, 36, 18);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(32, 8); g.bezierCurveTo(44, 26, 50, 34, 48, 42); g.arc(32, 42, 16, 0, Math.PI); g.bezierCurveTo(14, 34, 20, 26, 32, 8); g.fill();
  });
  cell(g, XATLAS.SPLAT, (g) => {
    g.fillStyle = '#ffffff'; g.beginPath();
    const n = 22;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2, r = 15 + rnd() * 9 + (i % 3 === 0 ? 7 : 0);
      g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    g.fill();
    for (let i = 0; i < 9; i++) { const a = rnd() * Math.PI * 2, d = 24 + rnd() * 6, r = 2 + rnd() * 3.5; g.beginPath(); g.arc(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, r, 0, Math.PI * 2); g.fill(); }
  });
  cell(g, XATLAS.CONFETTI, (g) => { g.fillStyle = '#ffffff'; g.fillRect(20, 26, 24, 12); });
  cell(g, XATLAS.SHOCK, (g) => {
    radial(g, 32, 32, 31, [[0, 'rgba(255,255,255,0)'], [0.62, 'rgba(255,255,255,0.08)'], [0.84, 'rgba(255,255,255,0.95)'], [0.9, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
  });
  cell(g, XATLAS.RIPPLE, (g) => {
    g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(32, 32, 27, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(32, 32, 22, 0, Math.PI * 2); g.stroke();
  });
  cell(g, XATLAS.FOAM, (g) => {
    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * 16, r = 6 + rnd() * 9;
      const x = 32 + Math.cos(a) * d, y = 32 + Math.sin(a) * d;
      radial(g, x, y, r, [[0, 'rgba(255,255,255,1)'], [0.75, 'rgba(240,240,240,0.95)'], [0.9, 'rgba(200,200,200,0.9)'], [1, 'rgba(255,255,255,0)']]);
    }
  });
  cell(g, XATLAS.STREAK, (g) => {
    const gr = g.createLinearGradient(0, 4, 0, 60);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(32, 32, 5, 28, 0, 0, Math.PI * 2); g.fill();
  });
  cell(g, XATLAS.SOFT, (g) => {
    radial(g, 32, 32, 31, [[0, 'rgba(255,255,255,0.85)'], [0.35, 'rgba(255,255,255,0.6)'], [0.7, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']]);
  });
  cell(g, XATLAS.WISP, (g) => {
    for (let i = 0; i < 7; i++) {
      const x = 10 + i * 7 + rnd() * 4, y = 32 + (rnd() - 0.5) * 10;
      g.save(); g.translate(x, y); g.scale(2.2, 0.8);
      radial(g, 0, 0, 9 + rnd() * 4, [[0, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]);
      g.restore();
    }
  });
  cell(g, XATLAS.PLANK, (g) => {
    g.save(); g.translate(32, 32); g.rotate(0.35);
    g.fillStyle = '#ffffff'; g.fillRect(-24, -6, 48, 12);
    g.fillStyle = 'rgba(160,160,160,1)'; g.fillRect(-24, -1, 48, 2); g.fillRect(14, -6, 2, 12);
    g.restore();
  });
  cell(g, XATLAS.SPARK2, (g) => {
    g.translate(32, 32);
    for (const [w, l] of [[5, 30], [3, 18]]) {
      for (let k = 0; k < (l === 30 ? 2 : 2); k++) {
        g.save(); g.rotate(k * Math.PI / 2 + (l === 18 ? Math.PI / 4 : 0));
        const gr = g.createLinearGradient(-l, 0, l, 0);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, l, w / 2, 0, 0, Math.PI * 2); g.fill();
        g.restore();
      }
    }
    radial(g, 0, 0, 9, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
  });
  cell(g, XATLAS.FLASH, (g) => {
    g.translate(32, 32);
    for (let i = 0; i < 12; i++) {
      g.save(); g.rotate((i / 12) * Math.PI * 2 + rnd() * 0.2);
      const l = 20 + rnd() * 11;
      const gr = g.createLinearGradient(0, 0, l, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, -2.5); g.lineTo(l, 0); g.lineTo(0, 2.5); g.fill();
      g.restore();
    }
    radial(g, 0, 0, 22, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.85)'], [1, 'rgba(255,255,255,0)']]);
  });
  cell(g, XATLAS.BURST, (g) => {
    g.translate(32, 32); g.beginPath();
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, r = i % 2 ? 14 : 29 - rnd() * 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath(); g.fillStyle = '#ffffff'; g.fill();
  });
  cell(g, XATLAS.SWIRL, (g) => {
    g.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      g.lineWidth = 5 - k * 1.2; g.strokeStyle = `rgba(255,255,255,${0.75 - k * 0.2})`;
      g.beginPath(); g.arc(32, 32, 24 - k * 6, -0.3 + k * 0.6, 2.4 + k * 0.6); g.stroke();
    }
  });
  cell(g, XATLAS.NOTE, (g) => {
    g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff'; g.lineWidth = 4;
    g.beginPath(); g.ellipse(22, 46, 9, 6.5, -0.4, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(46, 40, 9, 6.5, -0.4, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(30, 45); g.lineTo(30, 12); g.lineTo(54, 6); g.lineTo(54, 39); g.stroke();
    g.lineWidth = 6; g.beginPath(); g.moveTo(30, 14); g.lineTo(54, 8); g.stroke();
  });
}
