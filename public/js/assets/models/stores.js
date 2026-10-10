// ─────────────────────────────────────────────────────────────────────────────
// Stores / landmarks (Agent ART): store_hardware, store_gas (v0 Sunny Gas & Ice,
// v1 Last Chance Gas), store_junkyard, store_farm, sell_point.
//
// Each is a ~30–40 m wide lot. Local frame: origin = centre of the lot at ground
// level; +Z faces the ROAD (signs/entrances face +Z); the lot runs along X
// (parallel to the road). The band z ∈ [-1, +8] in front of the building is
// kept clear of solid props so the RV can pull in. Placement: rotate so local
// +Z points at the road — a lot on the driver's RIGHT (side=+1, x < road) uses
// rotation.y = +π/2; a lot on the LEFT (side=-1, x > road) uses −π/2.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Kit, root, rng, signTexture, fitText, mat } from './kit.js';
import { PAL, mix, shade } from '../palette.js';
import { walls, wr, band, parapet, planks, gambrel, mountSign, textSign } from './scenery.js';
import { buildMysteryCar } from './vehicles.js';

function lotSlab(k, w, d, color = '#7a7873', cz = 0) {
  k.box(color, [w, 0.04, d], [0, 0, cz], { base: true });
  // parking stripes + oil stains + cracks
  for (let i = -3; i <= 3; i++) k.rectY('#d9d4c4', 0.04, [i * 3.2 - 0.06, i * 3.2 + 0.06], [cz + d / 2 - 4.5, cz + d / 2 - 0.6], { off: 0.004 });
  const r = rng(Math.round(w * 13 + d));
  for (let i = 0; i < 6; i++) k.blob(shade(color, 0.78), 0.5 + r() * 0.6, [(r() - 0.5) * w * 0.8, 0.045, cz + (r() - 0.5) * d * 0.6], { seg: 7, seed: 300 + i, off: 0.002 });
}

function signPole(k, x, z, h, color = '#5f6468', w = 0.3) {
  k.box(color, [w, h, w], [x, 0, z], { base: true });
  k.box(PAL.concrete, [w * 2.4, 0.5, w * 2.4], [x, 0, z], { base: true, c: 0.04 });
}

// ── Bolt & Barrel Hardware ───────────────────────────────────────────────────
export function buildStoreHardware() {
  const W = 34, D = 16;
  const g = root('store_hardware', 0, { w: W, h: 9.5, l: D });
  const k = new Kit(1100); k.floor = 0;
  lotSlab(k, W, D);
  // building: z ∈ [-8, -1.5]
  const bw = 24, bd = 6.5, bh = 5.6, bz = -8 + bd / 2 + 0.2;
  const wall = '#b9a07a';
  k.box(wall, [bw, bh, bd], [-2, 0, bz], { base: true, c: 0.06 });
  // tall false-front facade
  k.box(shade(wall, 1.05), [bw + 0.4, 2.2, 0.4], [-2, bh, bz + bd / 2 - 0.2], { base: true, c: 0.04 });
  const F = walls(bw, bd, -2, bz);
  band(k, F.front, 0, 0.6, '#6a5a48', 0.012);
  for (const f of [F.left, F.right, F.back]) planks(k, f, 0.6, bh, wall, 0.5, 1101);
  // big windows + double doors + stacked lumber display
  wr(k, F.front, [-13, -6.5], [0.8, 3.4], '#2f3a42', 0.02);
  wr(k, F.front, [2.5, 9.0], [0.8, 3.4], '#2f3a42', 0.02);
  wr(k, F.front, [-4.6, 0.6], [0.6, 3.6], '#4a3a2c', 0.02);
  wr(k, F.front, [-4.3, -2.1], [0.6, 3.3], '#3a464c', 0.026);
  wr(k, F.front, [-1.7, 0.3], [0.6, 3.3], '#3a464c', 0.026);
  for (const [a, b] of [[-12.6, -7.0], [3.0, 8.6]]) {
    wr(k, F.front, [a + 0.3, a + 1.6], [1.0, 2.2], '#d9a83a', 0.026);
    wr(k, F.front, [a + 2.0, b - 0.3], [2.6, 3.2], '#efe6cf', 0.026);
    wr(k, F.front, [a + 2.4, a + 3.4], [1.0, 1.8], '#9c3a2e', 0.026);
  }
  // wooden porch canopy
  k.box(PAL.wood, [bw, 0.18, 2.6], [-2, 3.9, bz + bd / 2 + 1.3], { rot: [0.1, 0, 0] });
  for (let i = 0; i <= 6; i++) k.box(PAL.woodDark, [0.2, 3.85, 0.2], [-2 - bw / 2 + 0.4 + i * (bw - 0.8) / 6, 0.04, bz + bd / 2 + 2.4], { base: true });
  // outdoor display: lumber stacks, barrels (the "barrel" in the name), wheelbarrows
  const r = rng(1102);
  for (let i = 0; i < 3; i++) {
    const x = -14.5 + i * 2.2, z = bz + bd / 2 + 1.3;
    for (let j = 0; j < 4; j++) k.box(j % 2 ? PAL.woodLight : '#c9a87a', [1.6, 0.18, 0.9], [x, 0.04 + j * 0.2, z], { base: true });
  }
  for (let i = 0; i < 6; i++) {
    const x = 5.5 + (i % 3) * 1.0, z = bz + bd / 2 + 0.9 + Math.floor(i / 3) * 1.0;
    k.cyl(i % 2 ? '#8a5a3a' : '#9c6a42', 0.4, 0.4, 0.95, [x, 0.04, z], { base: true, seg: 9 });
    for (const y of [0.2, 0.75]) k.cyl('#3a3836', 0.415, 0.415, 0.06, [x, 0.04 + y, z], { seg: 9 });
  }
  k.box('#4f8f8a', [0.7, 0.4, 1.2], [9.6, 0.4, bz + bd / 2 + 1.3], { c: 0.08, taper: [1.2, 1.2] }); // wheelbarrow
  k.cyl('#222', 0.2, 0.2, 0.1, [9.6, 0.24, bz + bd / 2 + 2.0], { axis: 'x', seg: 8 });
  // side shed with roll door + propane cage
  k.box('#9a968c', [6, 3.6, 5.5], [13, 0.04, -5.4], { base: true, c: 0.05 });
  const S = walls(6, 5.5, 13, -5.4);
  wr(k, S.front, [10.8, 15.2], [0.1, 3.0], '#c9c5b8', 0.02);
  for (let i = 1; i < 8; i++) wr(k, S.front, [10.8, 15.2], [0.1 + i * 0.36, 0.13 + i * 0.36], '#a9a598', 0.026);
  k.box('#5f6468', [2.4, 1.8, 1.0], [5.0, 0.04, bz + bd / 2 + 0.4], { base: true });
  for (let i = 0; i < 4; i++) k.cyl('#e9e2cf', 0.18, 0.18, 0.75, [4.2 + i * 0.5, 0.1, bz + bd / 2 + 0.4], { base: true, seg: 7 });
  // roof AC + vent
  k.box('#a9a79e', [2.2, 1.0, 1.8], [-6, bh, bz - 1], { base: true, c: 0.05 });
  // sign: on the false front + a pole sign at the lot entrance
  g.add(k.mesh('body'));
  const tex = signTexture({
    key: 'sign_hardware', w: 1024, h: 200, bg: '#2f3d36',
    draw: (ctx, Wc, Hc) => {
      ctx.strokeStyle = '#d9a83a'; ctx.lineWidth = 8; ctx.strokeRect(10, 10, Wc - 20, Hc - 20);
      ctx.fillStyle = '#efe6cf'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      fitText(ctx, 'BOLT & BARREL', Wc * 0.42, Hc * 0.42, Wc * 0.66, 110);
      ctx.fillStyle = '#d9a83a'; fitText(ctx, 'HARDWARE · LUMBER · FEED', Wc * 0.42, Hc * 0.8, Wc * 0.6, 40, '700');
      // bolt icon
      ctx.fillStyle = '#d9a83a'; ctx.beginPath(); const x = Wc * 0.86, y = Hc * 0.5;
      ctx.moveTo(x - 22, y - 60); ctx.lineTo(x + 30, y - 60); ctx.lineTo(x + 4, y - 6); ctx.lineTo(x + 34, y - 6); ctx.lineTo(x - 26, y + 70); ctx.lineTo(x - 6, y + 10); ctx.lineTo(x - 34, y + 10); ctx.closePath(); ctx.fill();
    },
  });
  mountSign(g, tex, 13, 2.5, [-2, bh + 1.1, bz + bd / 2 + 0.02]);
  const k2 = new Kit(1103);
  signPole(k2, 15.5, 6.2, 6.5);
  k2.box('#2f3d36', [3.6, 1.6, 0.3], [15.5, 6.6, 6.2], { c: 0.04 });
  g.add(k2.mesh('pole'));
  const tex2 = textSign('sign_hardware_pole', [
    { text: 'SALE', y: 0.32, px: 130, color: '#d9a83a' },
    { text: 'NAILS BY THE POUND', y: 0.74, px: 52, color: '#efe6cf' },
  ], { bg: '#2f3d36', border: '#d9a83a', borderW: 8, h: 230 });
  mountSign(g, tex2, 3.4, 1.45, [15.5, 6.6, 6.36]);
  return g;
}

// ── Gas station (v0 Sunny Gas & Ice, v1 Last Chance Gas) ─────────────────────
export function buildStoreGas(variant = 0) {
  const v = ((variant % 2) + 2) % 2;
  const W = 34, D = 16;
  const g = root('store_gas', v, { w: W, h: 10, l: D });
  const k = new Kit(1200 + v); k.floor = 0;
  lotSlab(k, W, D, v ? '#8a8174' : '#7a7873');
  const brand = v ? { main: '#2f4a5a', acc: '#e9c45a', wall: '#c9b48a' } : { main: '#d9a83a', acc: '#b8452f', wall: '#e2dccb' };
  // shop at the back-left
  const sw = 12, sd = 6.5, sh = 4.2, sx = -9, sz = -8 + sd / 2 + 0.3;
  k.box(brand.wall, [sw, sh, sd], [sx, 0, sz], { base: true, c: 0.05 });
  const F = walls(sw, sd, sx, sz);
  band(k, F.front, 0, 0.5, '#6a5a48', 0.012);
  wr(k, F.front, [sx - 5.4, sx - 0.6], [0.7, 2.9], '#2f3a42', 0.02);
  wr(k, F.front, [sx + 0.2, sx + 2.0], [0.4, 2.7], '#3a464c', 0.02);
  wr(k, F.front, [sx + 2.6, sx + 5.4], [0.7, 2.9], '#2f3a42', 0.02);
  wr(k, F.front, [sx - 5.0, sx - 3.2], [1.6, 2.6], '#e9c45a', 0.026); // posters
  wr(k, F.front, [sx + 3.0, sx + 4.4], [1.6, 2.5], '#d8e2df', 0.026);
  band(k, F.front, sh - 1.0, sh, brand.main, 0.016);
  band(k, F.front, sh - 1.12, sh - 1.0, brand.acc, 0.016);
  k.box(shade(brand.wall, 0.9), [sw + 0.3, 0.3, sd + 0.3], [sx, sh, sz], { base: true });
  // ice chest by the door
  k.box('#e9ece8', [1.6, 1.1, 0.8], [sx - 0.8, 0.04, sz + sd / 2 + 0.5], { base: true, c: 0.04 });
  k.box('#6f8fb0', [1.62, 0.25, 0.82], [sx - 0.8, 0.85, sz + sd / 2 + 0.5], { base: true });
  // canopy over 2 pump islands, centred at x=+4, z≈+2
  const cx = 4, cz = 1.6, cw = 16, cd = 8, ch = 5.0;
  for (const [x, z] of [[cx - 5, cz - 2], [cx + 5, cz - 2], [cx - 5, cz + 2], [cx + 5, cz + 2]]) k.box('#d8d4c8', [0.4, ch, 0.4], [x, 0, z], { base: true });
  k.box('#efece4', [cw, 0.25, cd], [cx, ch, cz], { base: true });
  k.box(brand.main, [cw + 0.2, 0.8, cd + 0.2], [cx, ch + 0.25, cz], { base: true, c: 0.04 });
  const C = walls(cw + 0.2, cd + 0.2, cx, cz);
  for (const f of Object.values(C)) band(k, f, ch + 0.35, ch + 0.45, brand.acc, 0.012);
  k.rectY('#f6efd4', ch - 0.01, [cx - 6, cx - 4], [cz - 1, cz + 1], { off: -0.004, facing: [0, -1, 0] });
  // pump islands
  for (const x of [cx - 3, cx + 3]) {
    k.box(PAL.concreteLight, [1.2, 0.2, 5.2], [x, 0.04, cz], { base: true, c: 0.05 });
    for (const z of [cz - 1.4, cz + 1.4]) {
      k.box('#e9e4d8', [0.8, 1.8, 0.55], [x, 0.24, z], { base: true, c: 0.05 });
      k.box(brand.main, [0.82, 0.4, 0.57], [x, 1.7, z], { base: true });
      k.box('#2f3a42', [0.5, 0.35, 0.02], [x, 1.15, z + 0.285]);
      k.box('#2f3a42', [0.5, 0.35, 0.02], [x, 1.15, z - 0.285]);
      k.box('#2a2a2b', [0.12, 0.5, 0.12], [x + 0.45, 0.9, z], { rot: [0, 0, -0.3] });
      k.cyl('#2a2a2b', 0.02, 0.02, 1.2, [x + 0.5, 0.6, z], { seg: 4, rot: [0.3, 0, 0.2] });
    }
    k.box('#c4402e', [0.22, 0.9, 0.22], [x, 0.24, cz - 2.4], { base: true }); // bollards
    k.box('#c4402e', [0.22, 0.9, 0.22], [x, 0.24, cz + 2.4], { base: true });
  }
  // air/water post, trash, tyre stack, propane cage
  k.box('#b8452f', [0.5, 1.4, 0.4], [13, 0.04, -4], { base: true, c: 0.03 });
  k.cyl('#3e4a5a', 0.3, 0.3, 0.9, [-2.4, 0.04, -1.0], { base: true, seg: 8 });
  for (let i = 0; i < 4; i++) k.torus(PAL.tyre, 0.36, 0.14, [-15, 0.18 + i * 0.28, -2], { rot: [Math.PI / 2, 0, 0], rs: 4, ts: 9 });
  if (v === 1) {
    // Last Chance: weathered, sun-bleached, with a junked car and a dusty wind sock
    k.box(mix(brand.wall, PAL.dirt, 0.3), [sw, 1.2, sd], [sx, 0, sz], { base: true });
    k.cyl('#8f948f', 0.05, 0.05, 6, [-15.5, 0, 5], { base: true, seg: 4 });
    k.box('#d9702a', [0.6, 0.5, 1.4], [-15.5, 5.6, 5.6], { taper: [0.5, 0.5], rot: [Math.PI / 2 - 0.2, 0, 0] });
    for (let i = 0; i < 3; i++) k.ico(PAL.rockDark, 0.6, [15 + i * 0.8, 0.3, -6 + i], { seed: 1210 + i, jitter: 0.2 });
  } else {
    // Sunny: flower planters + newspaper box
    for (const x of [sx - 5.6, sx + 5.6]) { k.box('#9a5844', [1.0, 0.6, 0.8], [x, 0.04, sz + sd / 2 + 0.5], { base: true }); k.ico('#7e9b6e', 0.5, [x, 0.8, sz + sd / 2 + 0.5], { seed: 1220, jitter: 0.2 }); }
    k.box('#6f8fb0', [0.5, 1.0, 0.45], [sx + 3.3, 0.04, sz + sd / 2 + 0.4], { base: true });
  }
  // roadside price sign on a tall pole
  signPole(k, -15.5, 6.6, 8.5);
  k.box(brand.main, [3.8, 3.4, 0.4], [-15.5, 7.6, 6.6], { c: 0.06 });
  g.add(k.mesh('body'));
  // canopy fascia text + shop sign + price sign
  const name = v ? 'LAST CHANCE GAS' : 'SUNNY GAS & ICE';
  const fascia = signTexture({
    key: 'sign_gas_fascia_' + v, w: 1024, h: 128, bg: brand.main,
    draw: (ctx, Wc, Hc) => {
      ctx.fillStyle = v ? '#e9c45a' : '#2f2a26'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      fitText(ctx, name, Wc / 2, Hc * 0.55, Wc * 0.8, 96);
      if (!v) { ctx.fillStyle = '#b8452f'; for (const x of [0.06, 0.94]) { ctx.beginPath(); ctx.arc(Wc * x, Hc / 2, 36, 0, Math.PI * 2); ctx.fill(); } }
    },
  });
  mountSign(g, fascia, cw * 0.7, 0.7, [cx, ch + 0.65, cz + cd / 2 + 0.115]);
  const shop = textSign('sign_gas_shop_' + v, [
    { text: v ? 'FOOD · FUEL · LAST STOP' : 'COLD DRINKS · ICE · SNACKS', y: 0.55, px: 80, color: '#efe6cf' },
  ], { bg: brand.main, w: 1024, h: 128 });
  mountSign(g, shop, sw - 1.6, 0.9, [sx, sh - 0.5, sz + sd / 2 + 0.03]);
  const price = signTexture({
    key: 'sign_gas_price_' + v, w: 400, h: 360, bg: brand.main,
    draw: (ctx, Wc, Hc) => {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // logo: sun disc or arrow
      if (!v) {
        ctx.fillStyle = '#b8452f'; ctx.beginPath(); ctx.arc(Wc / 2, Hc * 0.24, 56, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#efe6cf'; ctx.fillRect(Wc * 0.18, Hc * 0.24 + 8, Wc * 0.64, 6); ctx.fillRect(Wc * 0.24, Hc * 0.24 + 24, Wc * 0.52, 6);
        ctx.fillStyle = '#2f2a26'; fitText(ctx, 'SUNNY', Wc / 2, Hc * 0.46, Wc * 0.85, 76);
      } else {
        ctx.fillStyle = '#e9c45a'; fitText(ctx, 'LAST', Wc / 2, Hc * 0.14, Wc * 0.8, 64);
        fitText(ctx, 'CHANCE', Wc / 2, Hc * 0.32, Wc * 0.85, 64);
      }
      ctx.fillStyle = '#efe6cf'; ctx.fillRect(Wc * 0.08, Hc * 0.56, Wc * 0.84, Hc * 0.38);
      ctx.fillStyle = '#2a2a2a';
      fitText(ctx, v ? 'REG 5.99' : 'REG 3.49', Wc / 2, Hc * 0.66, Wc * 0.8, 58);
      fitText(ctx, v ? 'DSL 6.49' : 'DSL 3.89', Wc / 2, Hc * 0.85, Wc * 0.8, 58);
    },
  });
  mountSign(g, price, 3.5, 3.15, [-15.5, 7.6, 6.81]);
  return g;
}

// ── Rustbucket Junkyard ──────────────────────────────────────────────────────
function crushedCar(k, x, z, y, color, seed, rotY = 0) {
  const r = rng(seed);
  k.at([x, y, z], [0, rotY, (r() - 0.5) * 0.1], () => {
    k.box(color, [1.8, 0.65, 4.0], [0, 0, 0], { base: true, c: 0.06, jit: 0.15 });
    k.box(mix(color, PAL.rust, 0.5), [1.82, 0.12, 4.02], [0, 0.2, 0], { base: true });
    k.box('#2a2a2b', [1.4, 0.2, 1.4], [0, 0.6, -0.2], { base: true, c: 0.04 });
    k.box(PAL.rust, [0.6, 0.02, 0.8], [0.3, 0.66, 1.1], { base: true });
  });
}
export function buildStoreJunkyard() {
  const W = 40, D = 18;
  const g = root('store_junkyard', 0, { w: W, h: 14, l: D });
  const k = new Kit(1300); k.floor = 0;
  lotSlab(k, W, D, '#8a7a64');
  const r = rng(1301);
  // corrugated fence around the back + sides, with a gap for the entrance (front open)
  const fenceH = 2.6, tin = PAL.corrugated;
  const panel = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L / 2.4);
    const ang = Math.atan2(z1 - z0, x1 - x0);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const c = [tin, shade(tin, 0.88), mix(tin, PAL.rust, 0.4), '#8a8f86', mix(tin, '#4f8f8a', 0.3)][Math.floor(r() * 5)];
      k.box(c, [L / n + 0.05, fenceH + r() * 0.3, 0.06], [x, 0, z], { base: true, rot: [0, -ang, (r() - 0.5) * 0.03] });
      for (let j = -3; j <= 3; j++) k.box(shade(c, 0.82), [0.05, fenceH - 0.1, 0.08], [x + Math.cos(ang) * j * 0.32, 0.05, z + Math.sin(ang) * j * 0.32], { base: true, rot: [0, -ang, 0] });
    }
  };
  panel(-W / 2, -D / 2, W / 2, -D / 2);
  panel(-W / 2, -D / 2, -W / 2, D / 2 - 6);
  panel(W / 2, -D / 2, W / 2, D / 2 - 6);
  // office trailer by the gate
  k.box('#c9c3b5', [7, 2.8, 2.8], [-14, 0.5, 2.2], { base: true, c: 0.08 });
  for (const x of [-16.5, -11.5]) k.box('#3a3836', [0.4, 0.5, 2.2], [x, 0, 2.2], { base: true });
  const T = walls(7, 2.8, -14, 2.2);
  wr(k, T.front, [-16.6, -15.2], [1.6, 2.6], '#2f3a42', 0.02);
  wr(k, T.front, [-13.4, -12.4], [0.6, 2.8], '#5e4632', 0.02);
  band(k, T.front, 1.2, 1.35, '#4f8f8a', 0.016);
  k.box('#8a7a64', [1.6, 0.5, 1.2], [-12.9, 0, 4.2], { base: true });
  // scrap piles (jagged lumps of mixed colour), tyre mountain, crushed car stacks
  for (const [x, z, s] of [[-4, -5, 3.2], [6, -6, 2.6], [14, -3.5, 2.2]]) {
    for (let i = 0; i < 7; i++) k.ico([PAL.rust, '#5f6468', '#8a8f86', PAL.rustDark, '#6f5a44'][i % 5], s * (0.4 + r() * 0.5), [x + (r() - 0.5) * s * 1.6, s * 0.3, z + (r() - 0.5) * s], { seed: 1310 + i + x, jitter: 0.35, flatBottom: -s * 0.3, jit: 0.15 });
    for (let i = 0; i < 4; i++) k.box('#5f6468', [0.1, 0.1, s * 1.4], [x + (r() - 0.5) * s, s * 0.7 + r(), z + (r() - 0.5) * s * 0.6], { rot: [r() - 0.5, r() * 3, r() - 0.5] });
  }
  for (let i = 0; i < 9; i++) k.torus(PAL.tyre, 0.38, 0.15, [17 - (i % 3) * 0.9, 0.18 + Math.floor(i / 3) * 0.3, 3 - (i % 2) * 0.4], { rot: [Math.PI / 2 + (r() - 0.5) * 0.4, 0, 0], rs: 4, ts: 9 });
  let cars = 0;
  for (const [x, z, n] of [[-10, -6.5, 3], [-6.8, -6.5, 2], [10, -6.8, 3]]) {
    for (let j = 0; j < n; j++) crushedCar(k, x, z, j * 0.66, PAL.civ[(cars++ * 2) % 6], 1320 + cars, Math.PI / 2 + (r() - 0.5) * 0.2);
  }
  // a whole wreck waiting its turn (low-detail, no wheels, on blocks)
  k.at([1, 0, 1.5], [0, 0.4, 0], () => {
    k.box('#7e9b6e', [1.9, 0.7, 4.4], [0, 0.4, 0], { base: true, c: 0.12 });
    k.box('#2f3a42', [1.6, 0.55, 2.0], [0, 1.1, -0.2], { base: true, c: 0.1 });
    k.box(PAL.rust, [1.92, 0.3, 1.2], [0, 0.5, 1.4], { base: true });
    for (const [x, z] of [[0.7, 1.4], [-0.7, 1.4], [0.7, -1.4], [-0.7, -1.4]]) k.box('#6a6a66', [0.3, 0.4, 0.3], [x, 0, z], { base: true });
  });
  // crane: tracked base + cab + boom + magnet
  k.box('#2a2a2b', [3.2, 0.8, 4.2], [4, 0, -1], { base: true, c: 0.1 });
  k.box('#d9a83a', [2.6, 2.0, 2.6], [4, 0.8, -1], { base: true, c: 0.08 });
  k.box('#2f3a42', [0.04, 1.0, 1.4], [5.31, 1.7, -0.6]);
  k.box('#d9a83a', [0.6, 0.6, 1.6], [4, 2.4, -2.6], { base: true });
  const boomLen = 11, boomA = 0.75;
  k.at([4, 2.6, -0.3], [-boomA, 0, 0], () => {
    k.box('#d9a83a', [0.5, 0.5, boomLen], [0, 0, boomLen / 2]);
    for (let i = 0; i < 8; i++) k.box('#b8892a', [0.52, 0.06, 0.06], [0, 0.26, 0.8 + i * 1.3]);
  });
  const tipY = 2.6 + Math.sin(boomA) * boomLen, tipZ = -0.3 + Math.cos(boomA) * boomLen;
  k.cyl('#2a2a2b', 0.02, 0.02, tipY - 4.2, [4, 4.2, tipZ], { base: true, seg: 3 });
  k.cyl('#3a3b3d', 0.8, 0.8, 0.3, [4, 4.0, tipZ], { seg: 10 });
  // dangling crushed car under the magnet
  crushedCar(k, 4, tipZ, 3.2, PAL.civ[1], 1340, 0.3);
  // gate posts + sign
  for (const x of [-9, 9]) k.box('#5f6468', [0.3, 4.6, 0.3], [x, 0, D / 2 - 6], { base: true });
  k.box('#5f6468', [18.6, 0.3, 0.3], [0, 4.6, D / 2 - 6]);
  // guard tyre stack + oil drums
  for (let i = 0; i < 4; i++) k.cyl(i % 2 ? '#3e5a7a' : PAL.rust, 0.32, 0.32, 0.9, [-18 + i * 0.7, 0, -1], { base: true, seg: 8 });
  g.add(k.mesh('body'));
  const tex = signTexture({
    key: 'sign_junkyard', w: 1024, h: 200, bg: '#5a4a3a',
    draw: (ctx, Wc, Hc) => {
      ctx.fillStyle = '#8e5030'; for (let i = 0; i < 30; i++) ctx.fillRect((i * 97) % Wc, (i * 53) % Hc, 40, 18);
      ctx.fillStyle = '#efe6cf'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      fitText(ctx, 'RUSTBUCKET JUNKYARD', Wc / 2, Hc * 0.42, Wc * 0.9, 100);
      ctx.fillStyle = '#d9a83a'; fitText(ctx, 'WE BUY ANYTHING THAT USED TO MOVE', Wc / 2, Hc * 0.8, Wc * 0.8, 42, '700');
    },
  });
  mountSign(g, tex, 10, 1.95, [0, 3.65, D / 2 - 5.82]);
  return g;
}

// ── Prickly Pete's Farm Supply ───────────────────────────────────────────────
export function buildStoreFarm() {
  const W = 36, D = 16;
  const g = root('store_farm', 0, { w: W, h: 12, l: D });
  const k = new Kit(1400); k.floor = 0;
  lotSlab(k, W, D, '#9a8a6a');
  const r = rng(1401);
  // barn-store (gambrel) facing +Z: wide, shallow
  const bw = 14, bd = 9, bh = 4.4;
  const red = '#9c4434', white = '#e9e2cf', roof = '#7d8285';
  k.at([-6, 0, -3.2], () => {
    k.box(red, [bw, bh, bd], [0, 0, 0], { base: true, c: 0.05 });
    gambrel(k, { w: bw, d: bd, y: bh, roof, wall: red });
    const F = walls(bw, bd);
    for (const f of Object.values(F)) planks(k, f, 0, bh, red, 0.4, 1402);
    // shop front: wide door + windows + white trim
    wr(k, F.front, [-2.2, 2.2], [0, 3.4], white, 0.014);
    wr(k, F.front, [-2.0, 2.0], [0, 3.25], '#3a2e24', 0.02);
    wr(k, F.front, [-1.9, -0.1], [0, 3.1], '#5e4632', 0.026);
    for (const x of [-5, 5]) { wr(k, F.front, [x - 1.2, x + 1.2], [1.2, 2.8], white, 0.014); wr(k, F.front, [x - 1.0, x + 1.0], [1.35, 2.65], '#2f3a42', 0.02); }
    for (const sx of [1, -1]) for (const sz of [1, -1]) k.box(white, [0.18, bh, 0.18], [sx * (bw / 2 - 0.02), 0, sz * (bd / 2 - 0.02)], { base: true });
    // lean-to porch on the front
    k.box(PAL.corrugated, [bw + 1, 0.1, 3], [0, 3.4, bd / 2 + 1.4], { rot: [0.18, 0, 0] });
    for (let i = 0; i <= 4; i++) k.box(PAL.woodDark, [0.18, 3.1, 0.18], [-bw / 2 + i * bw / 4, 0, bd / 2 + 2.7], { base: true });
  });
  // feed bags: stacked pallets (burlap colours) + loose bags
  const bag = (x, y, z, c, rot = 0) => k.box(c, [0.9, 0.26, 0.55], [x, y, z], { base: true, c: 0.1, rot: [0, rot, 0], jit: 0.1 });
  for (const [px, pz] of [[3.5, 2.6], [5.4, 2.6], [3.5, 4.0]]) {
    k.box(PAL.woodLight, [1.9, 0.15, 1.2], [px, 0.04, pz], { base: true });
    for (let l = 0; l < 4; l++) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) bag(px - 0.45 + i * 0.92, 0.19 + l * 0.27, pz - 0.28 + j * 0.57, ['#cdb489', '#bfa77c', '#d9c49a', '#a8946c'][(l + i + j) % 4], l % 2 ? Math.PI / 2 * 0 : 0);
  }
  for (let i = 0; i < 5; i++) bag(-12 + i * 0.95, 0.04, 2.4, i % 2 ? '#d9c49a' : '#9fb48a', (r() - 0.5) * 0.3);
  // print on some bags: a stripe
  for (let i = 0; i < 5; i++) k.box('#4f8f8a', [0.6, 0.02, 0.4], [-12 + i * 0.95, 0.31, 2.4], { base: true });
  // round bales, water troughs, potted cacti for sale (it's PRICKLY Pete's)
  for (const [x, z] of [[9, -4], [10.8, -4], [9.9, -2.6]]) k.cyl(PAL.hay, 0.75, 0.75, 1.4, [x, 0.75 + (z === -2.6 ? 1.3 : 0), z], { axis: 'x', seg: 12 });
  k.box('#8f948f', [3, 0.7, 1.0], [14, 0.04, 2], { base: true, c: 0.08 });
  k.box('#3c4a55', [2.8, 0.02, 0.8], [14, 0.72, 2], { base: true });
  for (let i = 0; i < 8; i++) {
    const x = -15 + (i % 4) * 0.9, z = -1.5 + Math.floor(i / 4) * 0.9;
    k.cyl('#9a5844', 0.25, 0.2, 0.35, [x, 0.04, z], { base: true, seg: 7 });
    k.cyl(PAL.cactus, 0.12, 0.14, 0.5 + (i % 3) * 0.2, [x, 0.39, z], { base: true, seg: 6 });
  }
  // grain bin behind
  k.cyl('#c9c9c4', 2.4, 2.4, 6, [13, 0, -5], { base: true, seg: 12 });
  k.lathe('#b9b9b2', [[2.5, 0], [1.2, 1.3], [0, 1.6]], 12, [13, 6, -5]);
  for (let y = 1; y < 6; y += 1) k.cyl(shade('#c9c9c4', 0.86), 2.42, 2.42, 0.06, [13, y, -5], { seg: 12 });
  // old pickup parked by the side, sign pole
  signPole(k, 16.5, 6.4, 6.0, PAL.woodDark, 0.35);
  k.box(PAL.woodDark, [4.6, 2.2, 0.3], [16.5, 6.6, 6.4], { c: 0.04 });
  g.add(k.mesh('body'));
  const tex = signTexture({
    key: 'sign_farm', w: 1024, h: 260, bg: '#e9dcc0',
    draw: (ctx, Wc, Hc) => {
      ctx.strokeStyle = '#4f6b3a'; ctx.lineWidth = 12; ctx.strokeRect(12, 12, Wc - 24, Hc - 24);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#4f6b3a'; fitText(ctx, "PRICKLY PETE'S", Wc * 0.46, Hc * 0.38, Wc * 0.7, 120);
      ctx.fillStyle = '#9c4434'; fitText(ctx, 'FARM SUPPLY · FEED · SEED', Wc * 0.46, Hc * 0.76, Wc * 0.7, 50, '700');
      // little cactus logo
      ctx.fillStyle = '#5f7d4a'; const x = Wc * 0.88, y = Hc * 0.55;
      ctx.fillRect(x - 16, y - 80, 32, 140); ctx.fillRect(x - 56, y - 30, 30, 18); ctx.fillRect(x - 56, y - 70, 18, 58); ctx.fillRect(x + 16, y - 10, 34, 18); ctx.fillRect(x + 34, y - 50, 18, 58);
    },
  });
  mountSign(g, tex, 4.4, 1.12, [16.5, 6.6, 6.56]);
  const tex2 = textSign('sign_farm_barn', [
    { text: "PRICKLY PETE'S", y: 0.55, px: 120, color: '#efe6cf' },
  ], { bg: '#7a3328', w: 1024, h: 160 });
  mountSign(g, tex2, 7, 1.1, [-6, bh + 1.6, -3.2 + bd / 2 + 0.03]);
  return g;
}

// ── Sell point: the Abandoned Drive-In ───────────────────────────────────────
export function buildSellPoint() {
  const W = 40, D = 40;
  const g = root('sell_point', 0, { w: W, h: 16, l: D });
  const k = new Kit(1500); k.floor = 0;
  const r = rng(1501);
  // cracked dirt lot with faded parking humps
  k.blob('#b98a5e', 19, [0, 0.02, 0], { seg: 16, seed: 1502, sz: 0.95, off: 0 });
  for (let row = 0; row < 4; row++) {
    const z = 6 - row * 5;
    k.box('#a77a52', [24 - row * 2, 0.15, 0.6], [0, 0.0, z], { base: true, c: 0.06 });
    for (let i = 0; i < 6 - row; i++) {
      const x = -10 + row + i * (20 - 2 * row) / Math.max(1, 5 - row);
      k.box('#6a6f73', [0.08, 1.2, 0.08], [x, 0, z + 0.4], { base: true, rot: [0, 0, (r() - 0.5) * 0.2] }); // speaker posts
      if (r() < 0.6) k.box('#5f6468', [0.3, 0.22, 0.12], [x + 0.12, 1.1, z + 0.45]);
    }
  }
  // the big blank screen at the back (faces +Z, i.e. the lot)
  const sz = -15, sw = 22, sh = 10, sy = 4;
  for (const x of [-9, -3, 3, 9]) {
    k.box(PAL.woodDark, [0.4, sy + sh, 0.4], [x, 0, sz - 0.6], { base: true });
    k.box(PAL.woodDark, [0.25, 7, 0.25], [x, 2.8, sz - 3.0], { rot: [0.6, 0, 0] });
  }
  k.box('#cfc8b6', [sw, sh, 0.3], [0, sy + sh / 2, sz], { c: 0.04 });
  // torn / missing panels on the screen
  k.rectZ('#8a8476', sz + 0.16, [5, 8.5], [sy + 6.5, sy + 9.2], 1, { off: 0.004 });
  k.rectZ('#3a3532', sz + 0.16, [7.0, 8.4], [sy + 7.8, sy + 9.0], 1, { off: 0.008 });
  k.rectZ('#b9b2a0', sz + 0.16, [-9, -5], [sy + 0.4, sy + 2.0], 1, { off: 0.004 });
  for (let i = 0; i < 6; i++) k.rectZ('#bdb6a3', sz + 0.16, [-sw / 2 + 0.3, sw / 2 - 0.3], [sy + 1.6 * i + 0.3, sy + 1.6 * i + 0.36], 1, { off: 0.004 });
  k.box(PAL.woodDark, [sw + 0.6, 0.4, 0.5], [0, sy - 0.2, sz]);
  // projection booth / snack shack in the middle of the lot
  k.at([-11, 0, -2], [0, 0.25, 0], () => {
    k.box('#b9a07a', [5, 3.2, 4], [0, 0, 0], { base: true, c: 0.05 });
    const F = walls(5, 4);
    planks(k, F.front, 0, 3.2, '#b9a07a', 0.4, 1503);
    planks(k, F.left, 0, 3.2, '#b9a07a', 0.4, 1504);
    wr(k, F.front, [-1.8, 0.6], [1.2, 2.2], '#262a2c', 0.02);
    for (const y of [1.45, 1.9]) k.box(PAL.woodLight, [2.6, 0.14, 0.05], [-0.6, y, 2.04], { rot: [0, 0, y > 1.6 ? 0.15 : -0.1] });
    wr(k, F.front, [1.0, 1.9], [0, 2.1], '#4a3a2c', 0.02);
    wr(k, F.back, [-0.6, 0.6], [2.2, 2.7], '#1d1d1e', 0.02); // projector port
    k.box(PAL.corrugated, [5.6, 0.1, 4.6], [0, 3.3, 0], { rot: [0.08, 0, 0] });
    k.box(mix(PAL.corrugated, PAL.rust, 0.6), [2, 0.04, 1.4], [1.2, 3.38, -0.8], { rot: [0.08, 0, 0] });
  });
  // broken "DRIVE-IN" marquee sign on a pole near the road (+Z)
  k.box('#5f6468', [0.45, 9, 0.45], [14, 0, 15], { base: true });
  k.box('#5f6468', [0.3, 5, 0.3], [13.2, 0, 15.6], { base: true, rot: [0, 0, 0.12] });
  k.box('#2f3a42', [6.6, 2.6, 0.4], [14, 8.3, 15], { c: 0.05, rot: [0, 0, -0.06] });
  // arrow (with a missing chunk) under the sign
  k.box('#9c4a32', [4.4, 0.6, 0.3], [13.4, 6.4, 15.1], { rot: [0, 0, -0.18] });
  k.box('#9c4a32', [0.8, 1.2, 0.3], [11.1, 6.8, 15.1], { rot: [0, 0, 0.6] });
  // tumble of junk + dead palm, a fence remnant
  for (let i = 0; i < 6; i++) k.box(PAL.woodGrey, [0.12, 1.6, 0.1], [-18 + i * 1.4, 0, 12 + (i % 2) * 0.2], { base: true, rot: [0, 0, (r() - 0.5) * 0.5] });
  k.box(PAL.woodGrey, [7, 0.1, 0.08], [-14.5, 1.1, 12.1], { rot: [0, 0, 0.05] });
  k.cyl('#8a6a4a', 0.2, 0.28, 7, [17, 0, -8], { base: true, seg: 6, rot: [0.08, 0, -0.1] });
  for (let i = 0; i < 5; i++) k.box('#8a7a4a', [0.3, 0.05, 2.4], [17.6, 7.0, -8], { rot: [0.5, (i / 5) * Math.PI * 2, 0.4] });
  // tyre tracks in the dirt leading to the car
  for (const x of [-1.0, 1.0]) k.rectY('#a87a50', 0.03, [x + 3 - 0.2, x + 3 + 0.2], [0, 14], { off: 0.004 });
  // the mysterious parked car: baked into the static lot mesh (no wheel_* parts leak into the landmark)
  const car = buildMysteryCar();
  let carMesh = null;
  car.traverse((o) => { if (o.isMesh && !carMesh) carMesh = o; });
  const carPos = [3, 0, 2], carRot = [0, Math.PI * 0.9, 0];
  if (carMesh) k.merge(carMesh.geometry, mat(carPos, carRot));
  g.add(k.mesh('body'));
  const tex = signTexture({
    key: 'sign_drivein', w: 1024, h: 400, bg: '#2f3a42',
    draw: (ctx, Wc, Hc) => {
      ctx.strokeStyle = '#d9a83a'; ctx.lineWidth = 14; ctx.strokeRect(14, 14, Wc - 28, Hc - 28);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // letters with one fallen ("DRIVE-IN" with the V knocked crooked)
      ctx.font = '900 180px "Arial Black", Arial, sans-serif';
      const letters = ['D', 'R', 'I', 'V', 'E', '-', 'I', 'N'];
      const total = ctx.measureText(letters.join('')).width;
      let x = (Wc - total) / 2;
      letters.forEach((L, i) => {
        const w = ctx.measureText(L).width;
        ctx.save(); ctx.translate(x + w / 2, Hc * 0.46);
        if (i === 3) { ctx.rotate(0.35); ctx.translate(0, 26); }
        ctx.fillStyle = i === 6 ? '#6a5a3a' : '#e9c45a';
        ctx.fillText(L, 0, 0); ctx.restore(); x += w;
      });
      ctx.fillStyle = '#c9b48a'; ctx.font = '700 46px Arial, sans-serif';
      ctx.fillText('TONIGHT: · · · CLOSED SINCE 1987', Wc / 2, Hc * 0.82);
      // missing bulbs row
      for (let i = 0; i < 24; i++) { ctx.fillStyle = i % 5 === 2 ? '#3a3a3a' : '#f6e7b0'; ctx.beginPath(); ctx.arc(40 + i * ((Wc - 80) / 23), 36, 8, 0, Math.PI * 2); ctx.fill(); }
    },
  });
  mountSign(g, tex, 6.3, 2.46, [14, 8.3, 15.21], 0, '#2f3a42', 'sign').rotation.z = -0.06;
  // anchors: the parked buyer car (empty, faces its +Z) and where the RV should stop
  const buyer = new THREE.Object3D();
  buyer.name = 'buyer_car';
  buyer.position.set(...carPos);
  buyer.rotation.set(...carRot);
  g.add(buyer);
  const handoff = new THREE.Object3D();
  handoff.name = 'handoff';
  handoff.position.set(3, 0, 8);
  g.add(handoff);
  return g;
}

export const STORE_BUILDERS = {
  store_hardware: { build: () => buildStoreHardware(), variants: 1 },
  store_gas: { build: (v) => buildStoreGas(v), variants: 2 },
  store_junkyard: { build: () => buildStoreJunkyard(), variants: 1 },
  store_farm: { build: () => buildStoreFarm(), variants: 1 },
  sell_point: { build: () => buildSellPoint(), variants: 1 },
};
