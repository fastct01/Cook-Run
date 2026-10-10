// ─────────────────────────────────────────────────────────────────────────────
// Round 3 cab (agent R3-CAB) — geometry helpers for r3-cab-*.js.
//   • direct triangle emitters into a Kit (outward-facing winding fixed automatically)
//   • oriented bars, tapered elliptical limbs (fingers, wrists, sleeves), a bumpy torus rim
//   • "decals": UV-mapped polygons collected next to a Kit, baked into the SAME mesh with a
//     vertex-colour × atlas material (untextured triangles sample a white texel) → 1 draw call
//   • smooth normals with a crease angle (padded horn cushion, leather rim, gloves)
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { chamferBoxGeometry } from '../models/kit.js';
import { linear } from '../palette.js';

export const V3 = THREE.Vector3;
export const V = (a) => (a && a.isVector3 ? a.clone() : new V3(a[0], a[1], a[2]));
export const M4 = (pos = [0, 0, 0], rot = [0, 0, 0], order = 'XYZ', scl = null) => new THREE.Matrix4().compose(
  V(pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0] || 0, rot[1] || 0, rot[2] || 0, order)), scl ? V(scl) : new V3(1, 1, 1));
/** Push matrix m on the kit's stack while fn runs. */
export function inFrame(k, m, fn) { k.stack.push(k.M.clone().multiply(m)); try { fn(k); } finally { k.stack.pop(); } }
/** Matrix with basis columns x, y, z and origin o. */
export function basis(o, x, y, z) { return new THREE.Matrix4().makeBasis(x, y, z).setPosition(o); }

/** Frame whose +Z runs a→b, +Y leaning toward `up`. m is centred at the midpoint. */
export function frameAB(a, b, up = [0, 1, 0]) {
  const A = V(a), B = V(b);
  const z = B.clone().sub(A); const len = z.length() || 1e-6; z.divideScalar(len);
  let y = V(up); y.addScaledVector(z, -y.dot(z));
  if (y.lengthSq() < 1e-10) { y = Math.abs(z.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0); y.addScaledVector(z, -y.dot(z)); }
  y.normalize();
  const x = new V3().crossVectors(y, z);
  return { m: basis(A.clone().add(B).multiplyScalar(0.5), x, y, z), len, x, y, z, A, B };
}

const _a = new V3(), _b = new V3(), _c = new V3(), _n = new V3(), _t = new V3();
/** One triangle (kit-local points), flipped so its normal agrees with `out` (if given). */
export function tri(k, color, a, b, c, out = null) {
  if (a.isVector3) _a.copy(a); else _a.fromArray(a);
  if (b.isVector3) _b.copy(b); else _b.fromArray(b);
  if (c.isVector3) _c.copy(c); else _c.fromArray(c);
  if (out && !out.isVector3) out = V(out);
  _n.subVectors(_c, _b); _t.subVectors(_a, _b); _n.cross(_t);
  if (_n.lengthSq() < 1e-16) return;
  if (out && _n.dot(out) < 0) { const s = _b.clone(); _b.copy(_c); _c.copy(s); }
  const M = k.M, col = linear(color);
  for (const v of [_a, _b, _c]) { v.applyMatrix4(M); k.p.push(v.x, v.y, v.z); k.c.push(col.r, col.g, col.b); k.b.push(k.bone); }
}
/** Quad a,b,c,d (any winding) facing `out`. */
export function quad(k, color, a, b, c, d, out) { tri(k, color, a, b, c, out); tri(k, color, a, c, d, out); }

/** Oriented box from a to b, cross-section w (x) × h (y, toward `up`), optional chamfer. */
export function bar(k, color, a, b, w, h, up = [0, 1, 0], c = 0, ext = 0) {
  const f = frameAB(a, b, up);
  const L = f.len + ext * 2;
  const g = c > 0 ? chamferBoxGeometry(w, h, L, c) : new THREE.BoxGeometry(w, h, L);
  k.geo(g, color, f.m);
  if (!(c > 0)) g.dispose();
}

/**
 * Tapered prism a→b with elliptical rings ra=[rx, ry], rb (x across, y toward `up`).
 * o: seg, up, extA/extB (extend past the ends), capA/capB (true | dome height), col(i, part) → colour,
 *    rot (ring phase), squash: per-vertex radius fn(angle) multiplier.
 */
export function limb(k, color, a, b, ra, rb, o = {}) {
  const seg = o.seg || 6;
  const f = frameAB(a, b, o.up || [0, 1, 0]);
  const A = f.A.clone().addScaledVector(f.z, -(o.extA || 0)), B = f.B.clone().addScaledVector(f.z, o.extB || 0);
  const ph = o.rot ?? 0;
  const ring = (C, r) => Array.from({ length: seg }, (_, i) => {
    const t = ph + (i / seg) * Math.PI * 2, s = o.squash ? o.squash(t) : 1;
    return C.clone().addScaledVector(f.x, Math.cos(t) * r[0] * s).addScaledVector(f.y, Math.sin(t) * r[1] * s);
  });
  const RA = ring(A, ra), RB = ring(B, rb);
  const colAt = (i, part) => (typeof color === 'function' ? color(i, part, (ph + ((i + 0.5) / seg) * Math.PI * 2)) : color);
  const mid = A.clone().add(B).multiplyScalar(0.5);
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    const out = RA[i].clone().add(RA[j]).add(RB[i]).add(RB[j]).multiplyScalar(0.25).sub(mid);
    out.addScaledVector(f.z, -out.dot(f.z));
    quad(k, colAt(i, 'side'), RA[i], RA[j], RB[j], RB[i], out);
  }
  const cap = (R, C, dir, h, part) => {
    const tip = C.clone().addScaledVector(dir, typeof h === 'number' ? h : 0);
    for (let i = 0; i < seg; i++) tri(k, colAt(i, part), R[i], R[(i + 1) % seg], tip, dir);
  };
  if (o.capA) cap(RA, A, f.z.clone().negate(), o.capA, 'capA');
  if (o.capB) cap(RB, B, f.z, o.capB, 'capB');
  return { A, B, f };
}

/** Chain of limb segments through points P[i] with radii R[i] ([rx, ry]); shared rings per joint. */
export function tube(k, color, P, R, o = {}) {
  for (let i = 0; i < P.length - 1; i++) {
    limb(k, color, P[i], P[i + 1], R[i], R[i + 1], { ...o, capA: i === 0 ? o.capA : 0, capB: i === P.length - 2 ? o.capB : 0, extA: i === 0 ? 0 : (o.joint || 0), extB: i === P.length - 2 ? 0 : (o.joint || 0) });
  }
}

/**
 * Torus in the XY plane (around +Z), tube angle ψ: 0 = outward, +90° = +Z ("back" of a steering rim).
 * o: N, M, phase (ψ offset), radius(i, ψ) → tube radius, col(i, j, ψ) → colour, arc.
 */
export function torus(k, color, R, r, o = {}) {
  const N = o.N || 32, Mr = o.M || 6, ph = o.phase ?? 0, arc = o.arc ?? Math.PI * 2;
  const P = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * arc, ca = Math.cos(a), sa = Math.sin(a);
    const row = [];
    for (let j = 0; j < Mr; j++) {
      const psi = ph + (j / Mr) * Math.PI * 2;
      const rr = o.radius ? o.radius(i % N, psi) : r;
      const radial = R + Math.cos(psi) * rr;
      row.push(new V3(ca * radial, sa * radial, Math.sin(psi) * rr));
    }
    P.push(row);
  }
  for (let i = 0; i < N; i++) {
    const a = ((i + 0.5) / N) * arc, cen = new V3(Math.cos(a) * R, Math.sin(a) * R, 0);
    for (let j = 0; j < Mr; j++) {
      const jj = (j + 1) % Mr;
      const q = [P[i][j], P[i + 1][j], P[i + 1][jj], P[i][jj]];
      const out = q[0].clone().add(q[1]).add(q[2]).add(q[3]).multiplyScalar(0.25).sub(cen);
      const c = typeof color === 'function' ? color(i, j, ph + ((j + 0.5) / Mr) * Math.PI * 2) : color;
      quad(k, c, q[0], q[1], q[2], q[3], out);
    }
  }
}

// ── decals (UV-mapped polygons baked into the same mesh) ─────────────────────
export class Decals {
  constructor(k) { this.k = k; this.p = []; this.uv = []; this.c = []; }
  /** Convex polygon pts (kit-local) with uvs [[u,v]...] (atlas 0..1), facing `out` (optional), fallback colour. */
  poly(pts, uvs, color = '#ffffff', out = null) {
    const P = pts.map(V); let U = uvs;
    if (out) {
      const n = new V3().subVectors(P[2], P[1]).cross(new V3().subVectors(P[0], P[1]));
      if (n.dot(V(out)) < 0) { P.reverse(); U = uvs.slice().reverse(); }
    }
    const M = this.k.M, col = linear(color);
    const W = P.map((p) => p.clone().applyMatrix4(M));
    for (let i = 1; i < W.length - 1; i++) {
      for (const j of [0, i, i + 1]) { this.p.push(W[j].x, W[j].y, W[j].z); this.uv.push(U[j][0], U[j][1]); this.c.push(col.r, col.g, col.b); }
    }
  }
  /** Rectangle in a local plane: centre c, axis vectors ax (half width), ay (half height), uv rect [u0,v0,u1,v1]. */
  rect(c, ax, ay, uv, color = '#ffffff', out = null) {
    const C = V(c), X = V(ax), Y = V(ay);
    const [u0, v0, u1, v1] = uv;
    this.poly([C.clone().sub(X).sub(Y), C.clone().add(X).sub(Y), C.clone().add(X).add(Y), C.clone().sub(X).add(Y)],
      [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], color, out || new V3().crossVectors(X, Y));
  }
  /** Disc (n-gon) centre c radius r in the plane (ax, ay unit axes), uv rect mapped to its bounding square. */
  disc(c, ax, ay, r, uv, n = 20, color = '#ffffff') {
    const C = V(c), X = V(ax).normalize(), Y = V(ay).normalize();
    const [u0, v0, u1, v1] = uv;
    const pts = [], uvs = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2, cx = Math.cos(t), cy = Math.sin(t);
      pts.push(C.clone().addScaledVector(X, cx * r).addScaledVector(Y, cy * r));
      uvs.push([u0 + (u1 - u0) * (0.5 + cx / 2), v0 + (v1 - v0) * (0.5 + cy / 2)]);
    }
    this.poly(pts, uvs, color, new V3().crossVectors(X, Y));
  }
}

/**
 * Bake a Kit (+ optional decals) into a Mesh. Untextured triangles get `whiteUV`; with a mapped material
 * decal vertices are white (the texture shows its own colours), otherwise they keep their fallback colour.
 * o.smooth = crease angle in degrees (0 → flat normals).
 */
export function bake(k, decals, material, name, o = {}) {
  const n0 = k.p.length / 3, n1 = decals ? decals.p.length / 3 : 0;
  const P = new Float32Array((n0 + n1) * 3), C = new Float32Array((n0 + n1) * 3), U = new Float32Array((n0 + n1) * 2);
  P.set(k.p); C.set(k.c);
  const wu = o.whiteUV || [0.5, 0.5];
  for (let i = 0; i < n0; i++) { U[i * 2] = wu[0]; U[i * 2 + 1] = wu[1]; }
  if (n1) {
    P.set(decals.p, n0 * 3); U.set(decals.uv, n0 * 2);
    const mapped = !!(material && material.map);
    if (mapped) C.fill(1, n0 * 3); else C.set(decals.c, n0 * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  if (material && (material.map || material.emissiveMap)) g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  if (o.smooth) smoothNormals(g, o.smooth); else g.computeVertexNormals();
  g.computeBoundingBox(); g.computeBoundingSphere();
  const m = new THREE.Mesh(g, material);
  m.name = name;
  m.castShadow = o.cast ?? true; m.receiveShadow = true;
  return m;
}

/** Area-weighted vertex normals over coincident positions whose faces are within `creaseDeg`. */
export function smoothNormals(g, creaseDeg = 60) {
  const pos = g.attributes.position, n = pos.count, nf = n / 3;
  const fn = new Float32Array(nf * 3), fu = new Float32Array(nf * 3);
  const a = new V3(), b = new V3(), c = new V3(), e1 = new V3(), e2 = new V3();
  for (let f = 0; f < nf; f++) {
    a.fromBufferAttribute(pos, f * 3); b.fromBufferAttribute(pos, f * 3 + 1); c.fromBufferAttribute(pos, f * 3 + 2);
    e1.subVectors(c, b); e2.subVectors(a, b); e1.cross(e2);
    fn[f * 3] = e1.x; fn[f * 3 + 1] = e1.y; fn[f * 3 + 2] = e1.z;
    const l = e1.length() || 1; fu[f * 3] = e1.x / l; fu[f * 3 + 1] = e1.y / l; fu[f * 3 + 2] = e1.z / l;
  }
  const groups = new Map();
  const key = (i) => `${Math.round(pos.getX(i) * 4000)},${Math.round(pos.getY(i) * 4000)},${Math.round(pos.getZ(i) * 4000)}`;
  const keys = new Array(n);
  for (let i = 0; i < n; i++) { const kk = key(i); keys[i] = kk; let l = groups.get(kk); if (!l) groups.set(kk, (l = [])); l.push(i); }
  const cos = Math.cos((creaseDeg * Math.PI) / 180);
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const f = (i / 3) | 0;
    let x = 0, y = 0, z = 0;
    for (const j of groups.get(keys[i])) {
      const h = (j / 3) | 0;
      if (fu[f * 3] * fu[h * 3] + fu[f * 3 + 1] * fu[h * 3 + 1] + fu[f * 3 + 2] * fu[h * 3 + 2] < cos) continue;
      x += fn[h * 3]; y += fn[h * 3 + 1]; z += fn[h * 3 + 2];
    }
    const l = Math.hypot(x, y, z) || 1;
    out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return g;
}

/** Mirror a baked non-indexed geometry across local X (positions + normals), fixing the winding. */
export function mirrorX(g) {
  const out = g.clone();
  for (const name of ['position', 'normal']) {
    const at = out.attributes[name]; if (!at) continue;
    for (let i = 0; i < at.count; i++) at.setX(i, -at.getX(i));
  }
  // swap vertices 1 and 2 of every triangle in every attribute
  for (const name of Object.keys(out.attributes)) {
    const at = out.attributes[name], s = at.itemSize, arr = at.array;
    for (let t = 0; t < at.count; t += 3) {
      for (let q = 0; q < s; q++) { const i1 = (t + 1) * s + q, i2 = (t + 2) * s + q; const tmp = arr[i1]; arr[i1] = arr[i2]; arr[i2] = tmp; }
    }
    at.needsUpdate = true;
  }
  out.computeBoundingBox(); out.computeBoundingSphere();
  return out;
}
