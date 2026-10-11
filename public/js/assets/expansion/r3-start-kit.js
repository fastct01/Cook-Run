// ─────────────────────────────────────────────────────────────────────────────
// Round 3 (agent R3-START) — shared helpers for the start-district pack.
// Thin layer over city-kit.js: lit (emissive) kits that bake into the chunk's
// vertex-colour batch (zero extra draw calls), cheap tyres / junk-car hulks,
// chain-link runs that SHARE the existing chainlink_fence material, and the
// sign painters for this pack (all signs go through the runtime sign atlas).
// Deterministic: every random draw uses rng().
// ─────────────────────────────────────────────────────────────────────────────
import {
  THREE, Kit, root, rng, empty, PAL, mix, shade, walls, wr, C, vwrap, fp, fbox, wpoly, beam, rod, railing, ladder,
  ribs, streaks, patches, rollDoor, steelWindow, acUnit, vent, drum, crate, pallet, addPanel, panel, multiPanel,
  signTexture, fitText, FONTS, chainlinkTexture, lampMaterial, textSign, paintedWallSign, neonSign, roofTank,
} from './city-kit.js';
import { measure } from '../models/kit.js';

export {
  THREE, Kit, root, rng, empty, PAL, mix, shade, walls, wr, C, vwrap, fp, fbox, wpoly, beam, rod, railing, ladder,
  ribs, streaks, patches, rollDoor, steelWindow, acUnit, vent, drum, crate, pallet, addPanel, panel, multiPanel,
  signTexture, fitText, FONTS, chainlinkTexture, lampMaterial, textSign, paintedWallSign, neonSign, roofTank, measure,
};

export const TAU = Math.PI * 2;

// ── palette for the start district (sun-bleached industrial edge of town) ────
export const S = Object.freeze({
  gravel: '#8d877b', gravelDark: '#77716a', dirt: '#8a7a64', dirtDark: '#6e604e', slab: '#a8a397', slabDark: '#8e8a80',
  crack: '#5d5a54', weed: '#7d8a4a', weedDry: '#a99a5c', bush: '#6c7a46', bushDark: '#55633a',
  tank: '#d9d4c4', tankShade: '#bdb7a6', tankRust: '#a4704c', steel: '#7f878b', steelDark: '#565d61', iron: C.iron,
  yellow: '#d7a93a', yellowDark: '#a98227', oxblood: '#8e3a2c', teal: '#4f8f8a', cream: '#e9e2cf',
  block: '#cbbd98', blockDark: '#a99c7c', chrome: '#c3c6c2', chromeDark: '#8f9491', redTrim: '#b23a2c', glass: '#2f3a42',
  tyre: '#242527', tyreHi: '#3a3b3d', wood: '#8a6a4a', woodDark: '#5e4632', concrete: '#aaa69c',
});

// ── lit parts: emissive Lambert (no map) → baked as vertex colour + per-vertex emission ──
const LIT = {
  warm: ['r3s_lit_warm', '#f6dc98', '#ffcf72', 0.95],     // shop / diner windows
  cool: ['r3s_lit_cool', '#e3efe9', '#cfe6dc', 0.85],     // fluorescent bays
  amber: ['r3s_lit_amber', '#f0a63a', '#ff9a24', 0.9],    // beacons, tail lights
  red: ['r3s_lit_red', '#ff6a50', '#ff3a26', 1.0],        // neon red
  teal: ['r3s_lit_teal', '#9ff2e0', '#4fe0c4', 1.0],      // neon teal
  bulb: ['r3s_lit_bulb', '#fff2c4', '#ffe2a0', 1.1],      // marquee bulbs / lamp heads
};
export function litMat(kind = 'warm') { const d = LIT[kind] || LIT.warm; return lampMaterial(d[0], d[1], d[2], d[3]); }
/** Bake a Kit with a lit material and add it to g (skipped when empty). */
export function addLit(g, k, kind = 'warm', name = 'lit') {
  if (!k.p.length) return null;
  const m = k.mesh(name, litMat(kind), false);
  g.add(m);
  return m;
}

/** Measured userData.size so getFootprint() / the chunk layout get honest bounds. */
export function fitSize(g) {
  const m = measure(g);
  g.userData.size = { w: +m.w.toFixed(2), h: +Math.max(0.01, m.h).toFixed(2), l: +m.l.toFixed(2) };
  return g;
}

// ── cheap round things ────────────────────────────────────────────────────────
/** One tyre lying flat (axis Y) or standing (axis 'x'|'z'): 8-sided band + dark hub (≈28 tris). */
export function tyre(k, x, y, z, r = 0.36, w = 0.24, o = {}) {
  const axis = o.axis || 'y', col = o.color || S.tyre;
  if (axis === 'y') {
    k.cyl(col, r, r, w, [x, y, z], { base: true, seg: 8, open: true });
    k.cyl(S.tyreHi, r * 0.98, r * 0.98, 0.01, [x, y + w, z], { seg: 8 });
    k.cyl('#141414', r * 0.5, r * 0.5, 0.012, [x, y + w + 0.004, z], { seg: 6 });
  } else {
    const rot = o.rot || [0, 0, 0];
    k.at([x, y + r, z], rot, () => {
      k.cyl(col, r, r, w, [0, 0, 0], { axis, seg: 7 });
      k.cyl(o.rim || '#6f716f', r * 0.48, r * 0.48, w + 0.02, [0, 0, 0], { axis, seg: 5 });
    });
  }
  return k;
}
/** Stack of n flat tyres as ONE banded cylinder (≈40 tris whatever n). */
export function tyreStack(k, x, z, n = 4, r = 0.36, w = 0.24, y = 0) {
  const h = n * w;
  k.cyl(S.tyre, r, r, h, [x, y, z], { base: true, seg: 8, open: true });
  for (let i = 1; i < Math.min(n, 3); i++) k.cyl('#161616', r + 0.004, r + 0.004, 0.025, [x, y + i * w * (n - 1) / 2, z], { seg: 8, open: true });
  k.cyl(S.tyreHi, r * 0.98, r * 0.98, 0.01, [x, y + h, z], { seg: 8 });
  k.cyl('#121212', r * 0.5, r * 0.5, 0.012, [x, y + h + 0.004, z], { seg: 6 });
  return k;
}

/**
 * Junk car hulk (≈70–110 tris): body, cabin, wheels (some missing), rust + primer patches.
 * Faces local +Z. o: { stripped (no wheels), flat (crushed), hood (open), glass }
 */
export function junkCar(k, x, y, z, rotY, color, seed = 1, o = {}) {
  const r = rng(seed);
  const L = o.L || 4.4, W = o.W || 1.75, hb = o.flat ? 0.55 : 0.75, y0 = o.stripped ? 0.18 : 0.32;
  k.at([x, y, z], [0, rotY, o.tilt || 0], () => {
    const body = (cx, cy, cz, nx, ny, nz) => (ny > 0.6 ? shade(color, 1.05) : Math.abs(nz) > 0.6 ? shade(color, 0.85) : color);
    k.box(body, [W, hb, L], [0, y0, 0], { base: true });
    if (!o.flat) {
      const f = k.frustum({ default: shade(color, 0.95), front: o.glass || '#3a444a', back: o.glass || '#3a444a' },
        { y0: y0 + hb, y1: y0 + hb + 0.55, zb: [-L * 0.28, L * 0.18], zt: [-L * 0.2, L * 0.05], wb: W / 2 - 0.05, wt: W / 2 - 0.2 });
      for (const fc of [f.left, f.right]) k.patch('#353d42', fc, [0.12, 0.88], [0.15, 0.85]);   // side windows
    } else {
      k.box(shade(color, 0.8), [W - 0.2, 0.18, L * 0.45], [0, y0 + hb, -L * 0.05], { base: true });
    }
    // rust + primer patches
    for (let i = 0; i < 3; i++) {
      const s = r() < 0.5 ? -1 : 1, za = -L / 2 + 0.3 + r() * (L - 1.4);
      k.rectX(r() < 0.6 ? C.rust : PAL.primer, s * W / 2, [za, za + 0.5 + r() * 0.8], [y0 + 0.08, y0 + hb - 0.08], s, { off: 0.012 });
    }
    k.rectZ('#2c2d2f', L / 2, [-W / 2 + 0.2, W / 2 - 0.2], [y0 + 0.15, y0 + 0.4], 1, { off: 0.012 });     // grille
    if (o.hood) k.box(shade(color, 0.9), [W - 0.2, 0.06, 1.2], [0, y0 + hb + 0.45, L / 2 - 0.8], { rot: [-0.9, 0, 0] });
    if (!o.stripped) {
      for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        if (r() < (o.missing ?? 0.25)) { k.box('#3a3b3d', [0.18, 0.3, 0.18], [sx * (W / 2 - 0.25), 0, sz * (L / 2 - 0.85)], { base: true }); continue; }
        k.cyl(S.tyre, 0.32, 0.32, 0.22, [sx * (W / 2 - 0.08), 0.32, sz * (L / 2 - 0.85)], { axis: 'x', seg: 6 });
      }
    } else {
      for (const sz of [1, -1]) k.box('#3a3b3d', [W - 0.3, 0.18, 0.3], [0, 0, sz * (L / 2 - 0.85)], { base: true });
    }
  });
  return k;
}

// ── chain-link runs that share the existing chainlink_fence material ───────────
// chainlink_fence (city-ironworks) builds its mesh with panel(chainlinkTexture(), 10, 2, {repeat: [31.25, 6.25], …}).
// Using the SAME options returns the SAME cached material, so these panels merge with every fence in a chunk
// (and never mutate the shared texture's repeat). UV 1.0 = 10 m along × 2.0 m up.
const LINK_OPTS = Object.freeze({ blend: true, double: true, repeat: [10 / 0.32, (2.1 - 0.1) / 0.32], fallback: '#a3a6a1', opacity: 0.3, name: 'mesh' });
/**
 * Chain-link fence along a polyline of [x, z] points at height h: posts, top rail, bottom wire (vertex colour)
 * + mesh quads collected into `quads` (draw them with linkMesh(g, quads)). o: { gaps: [[i, t0, t1]] , barbed }
 */
export function linkRun(k, quads, pts, h = 2.1, o = {}) {
  const gal = '#a3a6a1', step = o.step || 3.2;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az); if (L < 0.05) continue;
    const dx = (bx - ax) / L, dz = (bz - az) / L;
    const gap = (o.gaps || []).find((g) => g[0] === i);
    const seg = (t0, t1) => {
      const a = [ax + dx * t0, az + dz * t0], b = [ax + dx * t1, az + dz * t1], l = t1 - t0;
      if (l < 0.1) return;
      rod(k, gal, [a[0], h - 0.03, a[1]], [b[0], h - 0.03, b[1]], 0.035, 4);
      if (o.barbed) for (const yy of [h + 0.18, h + 0.36]) rod(k, '#5d605c', [a[0], yy, a[1]], [b[0], yy, b[1]], 0.012, 3);
      const n = Math.max(1, Math.round(l / step));
      for (let j = 0; j <= n; j++) {
        const t = t0 + (j / n) * l, px = ax + dx * t, pz = az + dz * t;
        k.cyl(gal, 0.05, 0.05, h + (o.barbed ? 0.45 : 0.05), [px, 0, pz], { base: true, seg: 5, open: true });
      }
      const yaw = Math.atan2(dx, dz) - Math.PI / 2;     // quad faces its local +Z → normal ⟂ the run
      quads.push({ p: [(a[0] + b[0]) / 2, (h - 0.1) / 2 + 0.06, (a[1] + b[1]) / 2], w: l, h: h - 0.1, rotY: yaw, uv: [0, 0, l / 10, (h - 0.1) / 2] });
    };
    if (gap) { seg(0, gap[1]); seg(gap[2], L); } else seg(0, L);
  }
  return k;
}
export function linkMesh(g, quads) {
  if (!quads.length) return null;
  const m = multiPanel(g, chainlinkTexture(), quads, LINK_OPTS);
  m.castShadow = true;
  return m;
}

// ── signs (CanvasTexture → runtime atlas; null without a DOM → fallback colour) ──
/** Two-tone plate sign: big word + small sub line. */
export function plateSign(key, big, sub, o = {}) {
  return signTexture({
    key, w: o.w || 512, h: o.h || 256, bg: o.bg || '#e9e2cf',
    draw: (ctx, W, H) => {
      if (o.border !== false) { ctx.strokeStyle = o.border || '#2a2622'; ctx.lineWidth = o.borderW || 12; ctx.strokeRect(9, 9, W - 18, H - 18); }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = o.fg || '#2a2622';
      fitText(ctx, big, W / 2, H * (sub ? 0.4 : 0.52), W * 0.86, o.px || Math.round(H * 0.5), '900', o.family || FONTS.SANS);
      if (sub) { ctx.fillStyle = o.subColor || o.fg || '#2a2622'; fitText(ctx, sub, W / 2, H * 0.78, W * 0.86, o.subPx || Math.round(H * 0.17), '800', o.family || FONTS.SANS); }
      if (o.draw) o.draw(ctx, W, H);
    },
  });
}
/** Neon-on-dark sign face (use with panel {glow}). lines: [{text, y, px, color}] */
export function glowSign(key, lines, o = {}) {
  return signTexture({
    key, w: o.w || 512, h: o.h || 256, bg: o.bg || '#1f2326', weather: o.weather ?? true,
    draw: (ctx, W, H) => {
      if (o.frame) { ctx.strokeStyle = o.frame; ctx.lineWidth = o.frameW || 10; ctx.strokeRect(8, 8, W - 16, H - 16); }
      if (o.drawBg) o.drawBg(ctx, W, H);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const L of lines) {
        ctx.save();
        ctx.shadowColor = L.color; ctx.shadowBlur = (L.px || 60) * (L.blur ?? 0.22);
        ctx.fillStyle = L.color;
        fitText(ctx, L.text, W * (L.x ?? 0.5), H * L.y, W * (L.maxW || 0.88), L.px || 60, L.weight || '900', L.family || FONTS.SANS);
        ctx.shadowBlur = 0; ctx.fillStyle = L.core || 'rgba(255,250,235,0.28)';
        fitText(ctx, L.text, W * (L.x ?? 0.5), H * L.y, W * (L.maxW || 0.88), L.px || 60, L.weight || '900', L.family || FONTS.SANS);
        ctx.restore();
      }
      if (o.draw) o.draw(ctx, W, H);
    },
  });
}
