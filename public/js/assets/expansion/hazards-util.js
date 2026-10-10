// ─────────────────────────────────────────────────────────────────────────────
// Hazards pack helpers (art agent "hazards"). Shared by hazards-*.js.
// Materials here are cached and SHARED by every clone: never mutate them on an
// instance — call cloneInstanceMaterials(obj) (assets/index.js) first.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { rng, HAS_DOM } from '../models/kit.js';
import { linear, vcolMaterial } from '../palette.js';

/** Named pivot `name` at pos/rot holding `mesh` (renamed `<name>_mesh`). */
export function pivot(name, mesh, pos = [0, 0, 0], rot = [0, 0, 0], order = 'XYZ') {
  const p = new THREE.Object3D();
  p.name = name;
  p.rotation.order = order;
  p.position.set(pos[0], pos[1], pos[2]);
  p.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0, order);
  if (mesh) { mesh.name = name + '_mesh'; p.add(mesh); }
  return p;
}

/** Bake a Kit into a Mesh with an explicit material and shadow flags. */
export function kmesh(kit, name, material = vcolMaterial(), cast = true, receive = true) {
  const m = new THREE.Mesh(kit.geometry(), material);
  m.name = name;
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}

// ── materials (cached) ───────────────────────────────────────────────────────
const _m = new Map();
const cached = (key, make) => { let m = _m.get(key); if (!m) { m = make(); _m.set(key, m); } return m; };

/** Shared soft (smooth-shaded) translucent white material for steam / vapour puffs. */
export function steamMaterial() {
  return cached('steam', () => new THREE.MeshLambertMaterial({
    vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false, flatShading: false, emissive: '#7d8285', name: 'CR_Steam',
  }));
}
/** Translucent water (geysers, jets). Double-sided so the inner wall adds volume. */
export function jetMaterial() {
  return cached('jet', () => new THREE.MeshLambertMaterial({
    vertexColors: true, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide, name: 'CR_WaterJet',
  }));
}
/** Translucent dust (dust devil rings). */
export function dustMaterial() {
  return cached('dust', () => new THREE.MeshLambertMaterial({
    vertexColors: true, transparent: true, opacity: 0.46, depthWrite: false, side: THREE.DoubleSide, flatShading: true, name: 'CR_Dust',
  }));
}
/** Opaque smooth-shaded vertex-colour material (foam, suds). */
export function foamMaterial() {
  return cached('foam', () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: false, name: 'CR_Foam' }));
}
/** Unlit translucent glow (marker rings, pickup spots, beams). Clone per instance to pulse. */
export function glowMaterial(color = '#ffcf5a', opacity = 0.85, name = 'CR_Glow') {
  return cached('glow|' + color + '|' + opacity + '|' + name, () => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, name,
  }));
}
/** Unlit vertex-colour glow (marker discs with a colour gradient). */
export function glowVcol(opacity = 0.9, name = 'CR_GlowVCol') {
  return cached('glowv|' + opacity + '|' + name, () => new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, name,
  }));
}
/** Additive unlit vertex-colour glow (black = invisible): floor markers, pickup spots. Clone per instance to pulse. */
export function glowAdd(name = 'CR_GlowAdd') {
  return cached('glowadd|' + name, () => new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, name,
  }));
}
/** Emissive lamp lens (hazard lights). Shared — clone per instance (perInstanceMaterials) to blink. */
export function lampMat(off, on, intensity, name) {
  return cached('lamp|' + name, () => new THREE.MeshLambertMaterial({ color: off, emissive: on, emissiveIntensity: intensity, flatShading: true, name }));
}
/** Unlit vertex-colour material (gauge needles, sparks, mirror placeholders). */
export function unlitVcol(name = 'CR_UnlitVCol') {
  return cached('unlit|' + name, () => new THREE.MeshBasicMaterial({ vertexColors: true, name }));
}

// ── puffs ─────────────────────────────────────────────────────────────────────
/**
 * Soft puff: a jittered icosahedron (20 tris) with SMOOTH normals and a vertical
 * colour gradient (bottom → top) baked as per-vertex colour. Unit radius, centred.
 */
export function puffGeometry(seed, { jitter = 0.14, bottom = '#c9d0d4', top = '#f7f8f8', detail = 0 } = {}) {
  const src = new THREE.IcosahedronGeometry(1, detail);
  const g = src.index ? src.toNonIndexed() : src;
  const p = g.attributes.position;
  const n = new Float32Array(p.count * 3), c = new Float32Array(p.count * 3);
  const map = new Map();
  const cb = linear(bottom), ct = linear(top);
  const tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    let f = map.get(key);
    if (f === undefined) { const r = rng(seed * 131 + map.size * 17 + 3); r(); f = 1 + (r() - 0.5) * 2 * jitter; map.set(key, f); }
    const l = Math.hypot(x, y, z) || 1;
    n[i * 3] = x / l; n[i * 3 + 1] = y / l; n[i * 3 + 2] = z / l;
    p.setXYZ(i, x * f, y * f, z * f);
    const t = Math.min(1, Math.max(0, (y / l + 1) / 2));
    tmp.copy(cb).lerp(ct, t * t * (3 - 2 * t));
    c[i * 3] = tmp.r; c[i * 3 + 1] = tmp.g; c[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

/** Merge several (non-indexed) geometries with position/normal/color into one, each transformed by a Matrix4. */
export function mergeTransformed(parts, minY = -Infinity) {
  const P = [], N = [], C = [];
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const { geo, matrix } of parts) {
    nm.getNormalMatrix(matrix);
    const p = geo.attributes.position, n = geo.attributes.normal, c = geo.attributes.color;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix); P.push(v.x, Math.max(minY, v.y), v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); N.push(v.x, v.y, v.z);
      C.push(c.getX(i), c.getY(i), c.getZ(i));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

// ── texture atlas quads (posters, store signs, labels) ───────────────────────
const _atlas = new Map();
/**
 * One CanvasTexture holding several signs. spec: { key, w, h, bg, draw(ctx, w, h) }.
 * Returns the texture (or null without a DOM). Cached by key.
 */
export function atlasTexture(spec) {
  if (!HAS_DOM) return null;
  let t = _atlas.get(spec.key);
  if (t) return t;
  const cv = document.createElement('canvas');
  cv.width = spec.w; cv.height = spec.h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = spec.bg || '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
  spec.draw(ctx, cv.width, cv.height);
  t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.name = spec.key;
  _atlas.set(spec.key, t);
  return t;
}
/**
 * Mesh of textured quads. quads: [{ c: [bl, br, tr, tl] (3D corners, CCW seen from the front), uv: [u0, v0, u1, v1] }]
 * uv in canvas pixels' fraction with v = 0 at the canvas BOTTOM. One draw call.
 */
export function atlasMesh(tex, quads, name = 'signs', fallback = '#cfc6ae') {
  const P = [], U = [];
  for (const q of quads) {
    const [a, b, c, d] = q.c;
    const [u0, v0, u1, v1] = q.uv;
    P.push(...a, ...b, ...c, ...a, ...c, ...d);
    U.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.computeVertexNormals();
  g.computeBoundingBox(); g.computeBoundingSphere();
  const key = 'atlasmat|' + (tex ? tex.uuid : fallback);
  const mat = cached(key, () => (tex
    ? new THREE.MeshLambertMaterial({ map: tex, name: 'CR_Sign_' + tex.name })
    : new THREE.MeshLambertMaterial({ color: fallback, name: 'CR_Sign_fallback' })));
  const m = new THREE.Mesh(g, mat);
  m.name = name;
  m.receiveShadow = true;
  return m;
}
/** Quad corners for a sign on the plane z = Z facing dir (±1), centred at (x, y), size w × h. */
export function quadZ(x, y, z, w, h, dir = 1) {
  const s = dir;
  return [[x - s * w / 2, y - h / 2, z], [x + s * w / 2, y - h / 2, z], [x + s * w / 2, y + h / 2, z], [x - s * w / 2, y + h / 2, z]];
}
/** Quad corners on the plane x = X facing dir (±1). Width runs along Z. */
export function quadX(x, y, z, w, h, dir = 1) {
  const s = -dir; // facing +X: left→right runs toward −Z
  return [[x, y - h / 2, z - s * w / 2], [x, y - h / 2, z + s * w / 2], [x, y + h / 2, z + s * w / 2], [x, y + h / 2, z - s * w / 2]];
}
/** Canvas helper: pixel rect (x, y from TOP-left, w, h) → uv rect [u0, v0, u1, v1] for atlasMesh. */
export function uvRect(W, H, x, y, w, h) { return [x / W, 1 - (y + h) / H, (x + w) / W, 1 - y / H]; }

/** Thin "wire"/rod along a polyline: triangular prisms (6 tris per segment). */
export function rod(k, color, pts, r = 0.03, seg = 3) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = new THREE.Vector3(...pts[i]), b = new THREE.Vector3(...pts[i + 1]);
    const d = b.clone().sub(a), len = d.length();
    if (len < 1e-4) continue;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    const g = new THREE.CylinderGeometry(r, r, len * 1.02, seg, 1, true);
    k.geo(g, color, m);
    g.dispose();
  }
}

/** Box placed between two points (a beam/strut), cross-section w × h. */
export function beam(k, color, a, b, w = 0.05, h = w) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A), len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.clone().normalize());
  const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  const g = new THREE.BoxGeometry(w, h, len);
  k.geo(g, color, m);
  g.dispose();
}

/** Flat annulus (ring) in the XZ plane at height y: seg quads, faces up. */
export function ring(k, color, r0, r1, pos = [0, 0, 0], seg = 16, o = {}) {
  const [x, y, z] = pos;
  const a0 = o.a0 || 0, a1 = o.a1 ?? Math.PI * 2;
  for (let i = 0; i < seg; i++) {
    const t0 = a0 + (a1 - a0) * (i / seg), t1 = a0 + (a1 - a0) * ((i + 1) / seg);
    const c = typeof color === 'function' ? color(i) : color;
    if (!c) continue;
    k.poly(c, [[x + Math.cos(t0) * r0, y, z + Math.sin(t0) * r0], [x + Math.cos(t1) * r0, y, z + Math.sin(t1) * r0],
      [x + Math.cos(t1) * r1, y, z + Math.sin(t1) * r1], [x + Math.cos(t0) * r1, y, z + Math.sin(t0) * r1]], { facing: [0, 1, 0], off: 0 });
  }
}

/** Seed helper so every builder gets distinct deterministic streams. */
export const seedOf = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 100000; };
