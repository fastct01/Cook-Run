// ─────────────────────────────────────────────────────────────────────────────
// Country pack: shared helpers (art agent "country"). Only country-*.js files use these.
//   pivot()      named animated pivot holding `<name>_mesh` (rigid hierarchy)
//   signMesh()   several textured quads sharing ONE CanvasTexture (one draw call per sign texture)
//   beam()/rod() a box / cylinder between two points (trusses, bracing, rails)
//   misc props   picnic tables, parked cars, railings, stairs, ladders, bushes
// Every sign key starts with "xc_" so it never collides with another pack's texture cache.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Kit, rng, signTexture, fitText, hashStr } from '../models/kit.js';
import { PAL, mix, shade } from '../palette.js';

export { Kit, rng, signTexture, fitText, hashStr };
export { PAL, mix, shade };

/** Clamp variant into [0, n). */
export const vmod = (v, n) => ((Math.floor(+v || 0) % n) + n) % n;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/**
 * Named animated pivot. The pivot sits at `pos` (in parent space) and its geometry is authored around the
 * pivot origin inside `build(kit)`. Adds a Mesh `<name>_mesh` under it. Returns the pivot.
 */
export function pivot(parent, name, pos, build, o = {}) {
  const p = new THREE.Object3D();
  p.name = name;
  p.position.set(pos[0], pos[1], pos[2]);
  if (o.order) p.rotation.order = o.order;
  const k = new Kit(o.seed ?? (hashStr(name) % 9973));
  if (o.floor !== undefined) k.floor = o.floor;
  build(k);
  p.add(k.mesh(name + '_mesh'));
  parent.add(p);
  return p;
}

// ── signs ────────────────────────────────────────────────────────────────────
const _signMats = new Map();
function signMat(tex, fallback, glow) {
  const key = (glow ? 'g|' : 'l|') + (tex ? tex.uuid : fallback);
  let m = _signMats.get(key);
  if (!m) {
    if (glow) m = tex ? new THREE.MeshBasicMaterial({ map: tex, name: 'CR_Neon_' + tex.name }) : new THREE.MeshBasicMaterial({ color: fallback, name: 'CR_Neon_fallback' });
    else m = tex ? new THREE.MeshLambertMaterial({ map: tex, name: 'CR_Sign_' + tex.name }) : new THREE.MeshLambertMaterial({ color: fallback, name: 'CR_Sign_fallback' });
    _signMats.set(key, m);
  }
  return m;
}

/**
 * Textured quads sharing one texture. quads: [{ w, h, pos:[x,y,z], rotY?, rotX?, rect?:[x0,y0,x1,y1] }]
 * rect = region of the canvas in 0..1 fractions, y measured from the TOP of the canvas.
 * Each quad faces +Z before rotY. o.glow → unlit (neon / backlit) material. o.double → also emit the back face.
 */
export function signMesh(tex, quads, fallback = '#d9cfb3', name = 'sign', o = {}) {
  const P = [], N = [], U = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), t = new THREE.Vector3();
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  for (const Q of quads) {
    const hw = Q.w / 2, hh = Q.h / 2;
    const [x0, y0, x1, y1] = Q.rect || [0, 0, 1, 1];
    const uv = [[x0, 1 - y1], [x1, 1 - y1], [x1, 1 - y0], [x0, 1 - y0]];
    const cs = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    e.set(Q.rotX || 0, Q.rotY || 0, 0, 'YXZ'); q.setFromEuler(e); t.set(Q.pos[0], Q.pos[1], Q.pos[2]);
    m4.compose(t, q, s);
    n.set(0, 0, 1).applyQuaternion(q);
    const pts = cs.map(([x, y]) => v.set(x, y, 0).applyMatrix4(m4).toArray());
    for (const i of [0, 1, 2, 0, 2, 3]) { P.push(...pts[i]); N.push(n.x, n.y, n.z); U.push(...uv[i]); }
    if (Q.double || o.double) {
      // back face: corners reversed (faces −n) with the same UV list, so the text reads correctly from behind
      const back = [1, 0, 3, 2].map((i) => pts[i]);
      for (const i of [0, 1, 2, 0, 2, 3]) {
        const p = back[i];
        P.push(p[0] - n.x * 0.004, p[1] - n.y * 0.004, p[2] - n.z * 0.004); N.push(-n.x, -n.y, -n.z); U.push(...uv[i]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.computeBoundingBox(); g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, signMat(tex, fallback, o.glow));
  mesh.name = name;
  mesh.receiveShadow = !o.glow;
  return mesh;
}

/** Simple centred text-lines canvas sign. lines: [{ text, y, px, color?, weight?, maxW?, x? }]. */
export function textTex(key, lines, o = {}) {
  return signTexture({
    key: 'xc_' + key, w: o.w || 512, h: o.h || 256, bg: o.bg || '#e9e0c8', weather: o.weather,
    draw: (ctx, W, H) => {
      if (o.drawBg) o.drawBg(ctx, W, H);
      if (o.border) { ctx.strokeStyle = o.border; ctx.lineWidth = o.borderW || 12; ctx.strokeRect(o.borderInset ?? 10, o.borderInset ?? 10, W - 2 * (o.borderInset ?? 10), H - 2 * (o.borderInset ?? 10)); }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const L of lines) {
        ctx.save();
        if (L.glow) { ctx.shadowColor = L.glow; ctx.shadowBlur = L.blur || 18; }
        ctx.fillStyle = L.color || '#2a2a2a';
        if (L.align) ctx.textAlign = L.align;
        fitText(ctx, L.text, W * (L.x ?? 0.5), H * L.y, W * (L.maxW || 0.9), L.px, L.weight || '900', L.family);
        ctx.restore();
      }
      if (o.draw) o.draw(ctx, W, H);
    },
  });
}
/** Custom-drawn canvas sign (key gets the pack prefix). */
export function drawTex(key, w, h, bg, draw, weather) { return signTexture({ key: 'xc_' + key, w, h, bg, draw, weather }); }

// ── geometry helpers ─────────────────────────────────────────────────────────
const _Y = new THREE.Vector3(0, 1, 0);
const _qq = new THREE.Quaternion();
const _ee = new THREE.Euler();
function rotTo(dx, dy, dz) {
  const d = new THREE.Vector3(dx, dy, dz).normalize();
  _qq.setFromUnitVectors(_Y, d);
  _ee.setFromQuaternion(_qq, 'XYZ');
  return [_ee.x, _ee.y, _ee.z];
}
/** Square-section beam from a to b (thickness t). */
export function beam(k, color, a, b, t = 0.12, o = {}) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L = Math.hypot(dx, dy, dz);
  if (L < 1e-4) return k;
  const tz = o.tz ?? t;
  return k.box(color, [t, L, tz], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], { rot: rotTo(dx, dy, dz), c: o.c, jit: o.jit });
}
/** Round rod from a to b (radius r). */
export function rod(k, color, a, b, r = 0.05, seg = 5, r2) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L = Math.hypot(dx, dy, dz);
  if (L < 1e-4) return k;
  return k.cyl(color, r2 ?? r, r, L, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], { seg, open: true, rot: rotTo(dx, dy, dz) });
}

/** Railing along X from x0..x1 at z, top at y + h. */
export function railing(k, color, x0, x1, z, y, h = 1.0, spacing = 0.25, o = {}) {
  const t = o.t || 0.05;
  k.box(color, [x1 - x0, t * 1.4, t * 1.4], [(x0 + x1) / 2, y + h, z]);
  if (o.mid) k.box(color, [x1 - x0, t, t], [(x0 + x1) / 2, y + h * 0.5, z]);
  const n = Math.max(1, Math.round((x1 - x0) / spacing));
  for (let i = 0; i <= n; i++) k.box(color, [t, h, t], [x0 + (i / n) * (x1 - x0), y, z], { base: true });
  return k;
}
/** Railing along Z. */
export function railingZ(k, color, z0, z1, x, y, h = 1.0, spacing = 0.25, o = {}) {
  const t = o.t || 0.05;
  k.box(color, [t * 1.4, t * 1.4, z1 - z0], [x, y + h, (z0 + z1) / 2]);
  if (o.mid) k.box(color, [t, t, z1 - z0], [x, y + h * 0.5, (z0 + z1) / 2]);
  const n = Math.max(1, Math.round((z1 - z0) / spacing));
  for (let i = 0; i <= n; i++) k.box(color, [t, h, t], [x, y, z0 + (i / n) * (z1 - z0)], { base: true });
  return k;
}
/** Straight stair: n steps rising from (x, y0, z0) toward dir (+1 = +Z, -1 = -Z), total rise h, run per step d. */
export function stairs(k, color, x, y0, z0, w, h, n, dir = 1, d = 0.28) {
  for (let i = 0; i < n; i++) k.box(color, [w, ((i + 1) * h) / n, d], [x, y0, z0 + dir * (i + 0.5) * d], { base: true });
}
/** Ladder from a (bottom) to b (top), rails along local X ± w/2. */
export function ladder(k, color, a, b, w = 0.45) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  for (const s of [-1, 1]) rod(k, color, [a[0] + s * w / 2, a[1], a[2]], [b[0] + s * w / 2, b[1], b[2]], 0.03, 4);
  const n = Math.floor(L / 0.32);
  for (let i = 1; i < n; i++) { const t = i / n; k.box(color, [w, 0.03, 0.03], [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
}
/** Picnic table centred at (x, z), long axis along X rotated by rotY. */
export function picnicTable(k, x, z, rotY = 0, wood = PAL.woodLight) {
  k.at([x, 0, z], [0, rotY, 0], () => {
    k.box(wood, [2.0, 0.07, 0.8], [0, 0.74, 0], { c: 0.01 });
    for (const s of [1, -1]) {
      k.box(shade(wood, 0.92), [2.0, 0.06, 0.28], [0, 0.44, s * 0.62], { c: 0.01 });
      k.box(PAL.woodDark, [0.08, 0.06, 1.5], [s * 0.75, 0.41, 0]);
      for (const t of [1, -1]) beam(k, PAL.woodDark, [s * 0.75, 0, t * 0.6], [s * 0.75, 0.74, 0], 0.07);
    }
  });
}
/** Simple low-poly parked car (shares the vertex material). Long axis along Z before rotY. */
export function parkedCar(k, x, z, rotY, color, o = {}) {
  k.at([x, 0, z], [0, rotY, 0], () => {
    k.box(color, [1.8, 0.62, 4.3], [0, 0.32, 0], { base: true, c: 0.14 });
    k.box(color, [1.6, 0.48, 2.1], [0, 0.94, -0.25], { base: true, c: 0.14, taper: [0.88, 0.8] });
    k.box('#33404a', [1.62, 0.34, 1.6], [0, 1.0, -0.25], { base: true, c: 0.06, taper: [0.88, 0.75] });
    k.box(shade(color, 0.7), [1.82, 0.08, 4.32], [0, 0.4, 0], { base: true });
    for (const [wx, wz] of [[0.8, 1.35], [-0.8, 1.35], [0.8, -1.35], [-0.8, -1.35]]) k.cyl(PAL.tyre, 0.33, 0.33, 0.24, [wx, 0.33, wz], { axis: 'x', seg: 7 });
    if (o.dusty) k.box(mix(color, PAL.dirt, 0.5), [1.84, 0.18, 4.34], [0, 0.32, 0], { base: true });
  });
}
/** Round low bush cluster. */
export function bush(k, x, y, z, r, color = PAL.bush, seed = 1) {
  k.ico(color, r, [x, y + r * 0.55, z], { jitter: 0.22, seed, scale: [1.15, 0.8, 1.05], jit: 0.12, flatBottom: -r * 0.6 });
}
/** Trash can (municipal steel drum). */
export function bin(k, x, z, color = '#4f6b55') {
  k.cyl(color, 0.32, 0.3, 0.95, [x, 0, z], { base: true, seg: 8 });
  k.cyl(shade(color, 0.8), 0.34, 0.34, 0.06, [x, 0.95, z], { base: true, seg: 8 });
}
/** Wooden barrel. */
export function barrel(k, x, z, y = 0, c = '#8a5a3a') {
  k.lathe(c, [[0.28, 0], [0.34, 0.45], [0.28, 0.9]], 8, [x, y, z]);
  k.cyl(c, 0.27, 0.27, 0.02, [x, y + 0.9, z], { seg: 8 });
  for (const yy of [0.15, 0.75]) k.cyl('#3a3836', 0.325, 0.325, 0.05, [x, y + yy, z], { seg: 8, open: true });
}
/** Grass tuft (3 thin blades). */
export function tuft(k, x, y, z, h = 0.5, color = '#8a9a55', seed = 1) {
  const r = rng(seed);
  for (let i = 0; i < 3; i++) {
    const a = r() * Math.PI * 2;
    k.cone(shade(color, 0.85 + r() * 0.3), 0.06, h * (0.7 + r() * 0.5), [x + Math.cos(a) * 0.08, y + h * 0.35, z + Math.sin(a) * 0.08], { seg: 3, rot: [Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35] });
  }
}
/** Reed clump: tall thin blades with a few brown cattail heads. */
export function reeds(k, x, y, z, h = 1.6, seed = 1, n = 5) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = r() * 0.35;
    const hh = h * (0.6 + r() * 0.5);
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    const lean = [(r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3];
    k.cone(r() < 0.5 ? '#7d8c4a' : '#6f7d42', 0.05, hh, [px, y + hh / 2, pz], { seg: 3, rot: lean });
    if (i < 2) k.cyl('#6a4a30', 0.045, 0.045, 0.28, [px + lean[2] * -hh * 0.45, y + hh * 0.86, pz + lean[0] * hh * 0.45], { seg: 4, rot: lean });
  }
}
/** Pine tree builder shared by `pine` and scene filler: stacked jagged cones. */
export function pineInto(k, x, z, H, o = {}) {
  const r = rng(o.seed || 1);
  const greens = o.greens || ['#3e5a3c', '#35513a', '#466243', '#3a5540'];
  const trunkH = H * (o.trunk ?? 0.18);
  const R = o.radius ?? H * 0.22;
  k.cyl(o.bark || '#5a4433', 0.06 + H * 0.012, 0.1 + H * 0.02, trunkH + H * 0.1, [x, 0, z], { base: true, seg: 5 });
  const tiers = o.tiers || Math.max(3, Math.round(H / 3.2));
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const rad = R * (1 - t * 0.78) * (0.92 + r() * 0.16);
    const th = (H - trunkH) / tiers * 1.75;
    const y = trunkH + t * (H - trunkH) * 0.92 - th * 0.12;
    k.cone(greens[i % greens.length], rad, th, [x + (r() - 0.5) * 0.15, y, z + (r() - 0.5) * 0.15], { base: true, seg: o.seg || 7, rot: [0, r() * 3, 0], jit: 0.12 });
  }
}

/**
 * Shift every direct child so the model's bounding box is centred on x = z = 0 (origin = ground centre),
 * then store the measured footprint in userData.size. Use when a layout is easier to author off-centre.
 */
export function recentre(g, keepSize = false) {
  g.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(g);
  const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
  for (const c of g.children) { c.position.x -= cx; c.position.z -= cz; }
  if (!keepSize) g.userData.size = { w: +(b.max.x - b.min.x).toFixed(2), h: +(b.max.y - Math.max(0, b.min.y)).toFixed(2), l: +(b.max.z - b.min.z).toFixed(2) };
  g.updateMatrixWorld(true);
  return g;
}
/** Store the measured bounds in userData.size without moving anything (trees: the trunk stays on the origin). */
export function sized(g) {
  g.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(g);
  g.userData.size = { w: +(b.max.x - b.min.x).toFixed(2), h: +(b.max.y - Math.max(0, b.min.y)).toFixed(2), l: +(b.max.z - b.min.z).toFixed(2) };
  return g;
}
