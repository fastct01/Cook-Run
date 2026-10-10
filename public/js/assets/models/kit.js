// ─────────────────────────────────────────────────────────────────────────────
// Kit — tiny procedural modelling toolkit (Agent ART).
//
// A Kit accumulates triangles with per-vertex colours from simple primitives
// (chamfered boxes, profile extrusions, frustums, cylinders, icos, flat quads),
// then bakes them into ONE non-indexed BufferGeometry that uses the shared
// vertex-colour material. One Kit = one draw call.
//
// All sizes in metres. Rotations in radians. Positions are [x, y, z].
// A transform stack (`kit.at(pos, rot, scale, fn)`) lets sub-assemblies be
// placed/rotated as a unit.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { vcolMaterial, linear } from '../palette.js';

// ── small deterministic RNG (same algorithm as sim/rng.js; art never uses Math.random) ──
export function rng(seed = 1) {
  let a = (seed * 2654435761) >>> 0;
  return function rand() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const lerp = (a, b, t) => a + (b - a) * t;
export const DEG = Math.PI / 180;

const _v = new THREE.Vector3();
const _c = new THREE.Color();
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();

/** Compose a Matrix4 from position / euler rotation / scale arrays. */
export function mat(pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1], order = 'XYZ') {
  const m = new THREE.Matrix4();
  _e.set(rot[0] || 0, rot[1] || 0, rot[2] || 0, order);
  _q.setFromEuler(_e);
  const s = typeof scl === 'number' ? [scl, scl, scl] : scl;
  m.compose(new THREE.Vector3(pos[0] || 0, pos[1] || 0, pos[2] || 0), _q, new THREE.Vector3(s[0], s[1], s[2]));
  return m;
}

// ── cached base geometries (unit-ish, reused while building) ────────────────
const _geoCache = new Map();
function cachedGeo(key, make) {
  let g = _geoCache.get(key);
  if (!g) { g = make(); _geoCache.set(key, g); }
  return g;
}

/** Box with every edge chamfered by c (≈60 tris). Centred on origin. */
export function chamferBoxGeometry(w, h, l, c) {
  c = Math.max(0.001, Math.min(c, w * 0.45, h * 0.45, l * 0.45));
  const key = `cb|${w.toFixed(3)}|${h.toFixed(3)}|${l.toFixed(3)}|${c.toFixed(3)}`;
  return cachedGeo(key, () => {
    const x = w / 2, y = h / 2;
    const s = new THREE.Shape();
    s.moveTo(-x + c, -y); s.lineTo(x - c, -y); s.lineTo(x, -y + c); s.lineTo(x, y - c);
    s.lineTo(x - c, y); s.lineTo(-x + c, y); s.lineTo(-x, y - c); s.lineTo(-x, -y + c); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, {
      depth: Math.max(0.0005, l - 2 * c), steps: 1, curveSegments: 1,
      bevelEnabled: true, bevelThickness: c, bevelSize: c, bevelOffset: -c, bevelSegments: 1,
    });
    g.translate(0, 0, -(l - 2 * c) / 2);
    return g;
  });
}

/** Box with only its 4 vertical edges chamfered (octagonal prism, 28 tris). */
export function vChamferBoxGeometry(w, h, l, c) {
  c = Math.max(0.001, Math.min(c, w * 0.45, l * 0.45));
  const key = `vcb|${w.toFixed(3)}|${h.toFixed(3)}|${l.toFixed(3)}|${c.toFixed(3)}`;
  return cachedGeo(key, () => {
    const x = w / 2, z = l / 2;
    const s = new THREE.Shape();
    s.moveTo(-x + c, -z); s.lineTo(x - c, -z); s.lineTo(x, -z + c); s.lineTo(x, z - c);
    s.lineTo(x - c, z); s.lineTo(-x + c, z); s.lineTo(-x, z - c); s.lineTo(-x, -z + c); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: h, steps: 1, curveSegments: 1, bevelEnabled: false });
    g.rotateX(-Math.PI / 2); // shape y → −z… flip so shape (x, y) → world (x, −z), extrusion → +y
    g.translate(0, -h / 2, 0);
    return g;
  });
}
/** Box without its bottom face (10 tris) — for things that sit on the ground or on other parts. */
function openBox(w, h, l) {
  const g = new THREE.BoxGeometry(w, h, l).toNonIndexed();
  const p = g.attributes.position, keep = [];
  for (let i = 0; i < p.count; i += 3) {
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    if (y > -h / 2 + 1e-6) for (let j = 0; j < 3; j++) keep.push(p.getX(i + j), p.getY(i + j), p.getZ(i + j));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  g.dispose();
  return out;
}

function shapeFrom(pts) {
  const s = new THREE.Shape();
  pts.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
  s.closePath();
  return s;
}

/**
 * Extrude a 2D polygon.
 *   axis 'x': pts are [z, y], extruded across X, centred on x=0  (vehicle side profiles)
 *   axis 'z': pts are [x, y], extruded along Z, centred on z=0   (gable roofs, fronts)
 *   axis 'y': pts are [x, z], extruded upward from y=0 to y=depth (floor plans, mesas)
 */
export function extrudeGeometry(pts, depth, axis = 'x', bevel = 0) {
  const b = Math.max(0, Math.min(bevel, depth * 0.45));
  const flip = axis === 'y';
  const shape = shapeFrom(flip ? pts.map(([a, c]) => [a, -c]) : pts);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.0005, depth - 2 * b), steps: 1, curveSegments: 1,
    bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 1,
  });
  // shape space: (sx, sy) in plane, extrusion along +sz from -b .. depth-b
  g.translate(0, 0, b);           // now 0 .. depth
  if (axis === 'x') { g.rotateY(-Math.PI / 2); g.translate(depth / 2, 0, 0); }
  else if (axis === 'z') { g.translate(0, 0, -depth / 2); }
  else { g.rotateX(-Math.PI / 2); }
  return g;
}

// ── the Kit ───────────────────────────────────────────────────────────────────
export class Kit {
  constructor(seed = 1) {
    this.p = [];         // positions (flat)
    this.c = [];         // colours (flat, linear)
    this.r = rng(seed);
    this.stack = [new THREE.Matrix4()];
    this.b = [];         // per-vertex bone index (skinned models)
    this.bone = 0;       // current bone index for new geometry
    this.floor = undefined; // if set, clamp every vertex to y >= floor (ground-sitting props)
  }
  /** Run fn with new geometry weighted to bone index i (see Rig). */
  withBone(i, fn) {
    const prev = this.bone;
    this.bone = i;
    try { fn(this); } finally { this.bone = prev; }
    return this;
  }
  get M() { return this.stack[this.stack.length - 1]; }
  get tris() { return this.p.length / 9; }

  /** Run fn with an extra local transform pushed on the stack. */
  at(pos, rot, scl, fn) {
    if (typeof rot === 'function') { fn = rot; rot = undefined; }
    if (typeof scl === 'function') { fn = scl; scl = undefined; }
    const m = this.M.clone().multiply(mat(pos, rot, scl));
    this.stack.push(m);
    try { fn(this); } finally { this.stack.pop(); }
    return this;
  }

  _col(color, jit) {
    _c.copy(linear(color));
    if (jit) { const f = 1 + (this.r() - 0.5) * jit; _c.r *= f; _c.g *= f; _c.b *= f; }
    return _c;
  }

  /**
   * Append a geometry. color: css colour OR fn(cx, cy, cz, nx, ny, nz) → css colour (per face,
   * evaluated in the kit's local space before the stack transform).
   */
  geo(geometry, color, matrix, opts = {}) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = g.attributes.position;
    const m = matrix ? this.M.clone().multiply(matrix) : this.M;
    const local = matrix || null;
    const fn = typeof color === 'function' ? color : null;
    const flat = fn ? null : this._col(color, opts.jit).clone();
    const floor = opts.floor ?? this.floor;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const n = new THREE.Vector3(), t = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
      if (local) { a.applyMatrix4(local); b.applyMatrix4(local); c.applyMatrix4(local); }
      // drop degenerate triangles (extrude caps sometimes produce them)
      n.subVectors(c, b); t.subVectors(a, b); n.cross(t);
      const area = n.length();
      if (area < 1e-9) continue;
      let col = flat;
      if (fn) {
        n.divideScalar(area);
        col = this._col(fn((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3, n.x, n.y, n.z), opts.jit);
      }
      for (const v of [a, b, c]) {
        if (local) v.applyMatrix4(this.M); else v.applyMatrix4(m);
        if (floor !== undefined && v.y < floor) v.y = floor;
        this.p.push(v.x, v.y, v.z);
        this.c.push(col.r, col.g, col.b);
        this.b.push(this.bone);
      }
    }
    if (g !== geometry) g.dispose();
    return this;
  }

  /** Append an already-coloured geometry (position + color attributes) e.g. from another Kit. */
  merge(geometry, matrix) {
    const m = matrix ? this.M.clone().multiply(matrix) : this.M;
    const pos = geometry.attributes.position, col = geometry.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(m);
      this.p.push(_v.x, _v.y, _v.z);
      this.c.push(col.getX(i), col.getY(i), col.getZ(i));
      this.b.push(this.bone);
    }
    return this;
  }

  // ── primitives ──────────────────────────────────────────────────────────────
  /**
   * Box centred at pos. o.c = chamfer, o.rot, o.taper=[sx, sz] scale of the top face,
   * o.shear=[dx, dz] offset of the top face, o.base=true → pos.y is the bottom.
   */
  box(color, [w, h, l], pos = [0, 0, 0], o = {}) {
    let g = o.c ? (o.cv ? vChamferBoxGeometry(w, h, l, o.c) : chamferBoxGeometry(w, h, l, o.c))
      : cachedGeo(`box|${w}|${h}|${l}|${o.noBottom ? 1 : 0}`, () => (o.noBottom ? openBox(w, h, l) : new THREE.BoxGeometry(w, h, l)));
    if (o.taper || o.shear) {
      g = g.clone();
      const p = g.attributes.position;
      const [tx, tz] = o.taper || [1, 1];
      const [sx, sz] = o.shear || [0, 0];
      for (let i = 0; i < p.count; i++) {
        const t = (p.getY(i) + h / 2) / h;
        p.setX(i, p.getX(i) * lerp(1, tx, t) + sx * t);
        p.setZ(i, p.getZ(i) * lerp(1, tz, t) + sz * t);
      }
    }
    const y = o.base ? pos[1] + h / 2 : pos[1];
    this.geo(g, color, mat([pos[0], y, pos[2]], o.rot), o);
    if (o.taper || o.shear) g.dispose();
    return this;
  }

  /** Cylinder. axis 'y' (default) | 'x' | 'z'. o.seg, o.open, o.rot, o.base */
  cyl(color, rTop, rBot, h, pos = [0, 0, 0], o = {}) {
    const seg = o.seg || 8;
    const g = cachedGeo(`cyl|${rTop}|${rBot}|${h}|${seg}|${!!o.open}|${o.thetaStart || 0}`,
      () => new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, !!o.open, o.thetaStart || 0));
    let rot = o.rot || [0, 0, 0];
    if (o.axis === 'x') rot = [rot[0], rot[1], (rot[2] || 0) + Math.PI / 2];
    else if (o.axis === 'z') rot = [(rot[0] || 0) + Math.PI / 2, rot[1], rot[2]];
    const y = o.base ? pos[1] + h / 2 : pos[1];
    return this.geo(g, color, mat([pos[0], y, pos[2]], rot, o.scale), o);
  }

  /** Cone (pointing +Y). */
  cone(color, r, h, pos = [0, 0, 0], o = {}) {
    const seg = o.seg || 8;
    const g = cachedGeo(`cone|${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg, 1));
    const y = o.base ? pos[1] + h / 2 : pos[1];
    return this.geo(g, color, mat([pos[0], y, pos[2]], o.rot, o.scale), o);
  }

  /** Low-poly icosahedron, optional deterministic vertex jitter (rocks, bushes). */
  ico(color, r, pos = [0, 0, 0], o = {}) {
    const detail = o.detail || 0;
    let g = new THREE.IcosahedronGeometry(r, detail);
    if (o.jitter) {
      const p = g.attributes.position;
      const seed = o.seed ?? 7;
      const map = new Map();
      for (let i = 0; i < p.count; i++) {
        const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
        let f = map.get(key);
        if (f === undefined) { const rr = rng(seed + map.size * 31 + 1); rr(); f = 1 + (rr() - 0.5) * 2 * o.jitter; map.set(key, f); }
        p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f);
      }
    }
    if (o.flatBottom !== undefined) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) < o.flatBottom) p.setY(i, o.flatBottom);
    }
    this.geo(g, color, mat(pos, o.rot, o.scale || [1, 1, 1]), o);
    g.dispose();
    return this;
  }

  /** Lathe around local Y: pts [[radius, y], ...]. */
  lathe(color, pts, seg, pos = [0, 0, 0], o = {}) {
    const key = `lathe|${seg}|${pts.map((p) => p.join(',')).join(';')}|${o.phiStart || 0}|${o.phiLength || 6.2832}`;
    const g = cachedGeo(key, () => new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg, o.phiStart || 0, o.phiLength || Math.PI * 2));
    let rot = o.rot || [0, 0, 0];
    if (o.axis === 'x') rot = [rot[0] || 0, rot[1] || 0, (rot[2] || 0) - Math.PI / 2];
    else if (o.axis === 'z') rot = [(rot[0] || 0) + Math.PI / 2, rot[1] || 0, rot[2] || 0];
    return this.geo(g, color, mat(pos, rot, o.scale), o);
  }

  /** Torus (ring in XY plane by default; use rot). */
  torus(color, R, tube, pos = [0, 0, 0], o = {}) {
    const g = cachedGeo(`tor|${R}|${tube}|${o.rs || 4}|${o.ts || 10}|${o.arc || 6.283}`,
      () => new THREE.TorusGeometry(R, tube, o.rs || 4, o.ts || 10, o.arc || Math.PI * 2));
    return this.geo(g, color, mat(pos, o.rot, o.scale), o);
  }

  /** Extruded polygon (see extrudeGeometry for axis conventions). pos offsets it. */
  extrude(color, pts, depth, o = {}) {
    const g = extrudeGeometry(pts, depth, o.axis || 'x', o.bevel || 0);
    this.geo(g, color, mat(o.pos || [0, 0, 0], o.rot, o.scale), o);
    g.dispose();
    return this;
  }

  /** Flat polygon from 3D points (convex, fan-triangulated). Faces the side the points wind CCW. */
  poly(color, pts, o = {}) {
    const off = o.off || 0;
    const n = normalOf(pts);
    if (o.facing) { const d = n[0] * o.facing[0] + n[1] * o.facing[1] + n[2] * o.facing[2]; if (d < 0) { pts = pts.slice().reverse(); n[0] = -n[0]; n[1] = -n[1]; n[2] = -n[2]; } }
    const P = pts.map((p) => [p[0] + n[0] * off, p[1] + n[1] * off, p[2] + n[2] * off]);
    const arr = [];
    for (let i = 1; i < P.length - 1; i++) arr.push(...P[0], ...P[i], ...P[i + 1]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    this.geo(g, color, null, o);
    g.dispose();
    return this;
  }
  /** Quad a,b,c,d (CCW from the visible side), pushed out along its normal by o.off. */
  quad(color, a, b, c, d, o = {}) { return this.poly(color, [a, b, c, d], o); }

  /**
   * Sub-rectangle (u0..u1, v0..v1) of a planar quad face [a,b,c,d] — windows, panels, stripes.
   * u runs a→b, v runs a→d. o.skew shifts the top edge along u (glass sheen streaks).
   */
  patch(color, face, [u0, u1], [v0, v1], o = {}) {
    const [a, b, c, d] = face;
    const P = (u, v) => {
      const lo = [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
      const hi = [lerp(d[0], c[0], u), lerp(d[1], c[1], u), lerp(d[2], c[2], u)];
      return [lerp(lo[0], hi[0], v), lerp(lo[1], hi[1], v), lerp(lo[2], hi[2], v)];
    };
    const s = o.skew || 0;
    return this.poly(color, [P(u0, v0), P(u1, v0), P(u1 + s, v1), P(u0 + s, v1)], { off: 0.012, facing: face.out, ...o });
  }

  /** Axis-aligned rectangles: on plane x=X facing ±X, z=Z facing ±Z, y=Y facing up. */
  rectX(color, x, [z0, z1], [y0, y1], side = 1, o = {}) {
    return this.poly(color, [[x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0]], { off: 0.012, facing: [side, 0, 0], ...o });
  }
  rectZ(color, z, [x0, x1], [y0, y1], side = 1, o = {}) {
    return this.poly(color, [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], { off: 0.012, facing: [0, 0, side], ...o });
  }
  rectY(color, y, [x0, x1], [z0, z1], o = {}) {
    return this.poly(color, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], { off: 0.012, facing: [0, 1, 0], ...o });
  }
  /** Same window on both sides (±X) of a body: mirrored rectX. */
  rectX2(color, halfW, zr, yr, o = {}) { this.rectX(color, halfW, zr, yr, 1, o); return this.rectX(color, -halfW, zr, yr, -1, o); }

  /**
   * Any simple (possibly concave) 2D polygon mapped into 3D: pts2d [[u,v]...], map(u,v) → [x,y,z].
   * Triangles are flipped to face o.facing and pushed out along it by o.off.
   */
  flat(color, pts2d, map, o = {}) {
    const facing = o.facing || [0, 1, 0];
    const off = o.off ?? 0.012;
    const contour = pts2d.map((p) => new THREE.Vector2(p[0], p[1]));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const P = pts2d.map((p) => { const q = map(p[0], p[1]); return [q[0] + facing[0] * off, q[1] + facing[1] * off, q[2] + facing[2] * off]; });
    const arr = [];
    for (const [i, j, k] of tris) {
      const a = P[i], b = P[j], c = P[k];
      const n = normalOf([a, b, c]);
      if (n[0] * facing[0] + n[1] * facing[1] + n[2] * facing[2] < 0) arr.push(...a, ...c, ...b);
      else arr.push(...a, ...b, ...c);
    }
    if (!arr.length) return this;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    this.geo(g, color, null, o);
    g.dispose();
    return this;
  }
  /** Polygon [[z,y]...] painted on the side plane(s) x = ±hw. o.side = 1 (+X only) | -1 (−X only). */
  side(color, hw, pts, o = {}) {
    const sides = o.side ? [o.side] : [1, -1];
    for (const s of sides) this.flat(color, pts, (z, y) => [s * hw, y, z], { ...o, facing: [s, 0, 0] });
    return this;
  }
  /** Polygon [[x,y]...] painted on the plane z = Z facing dir (+1 → +Z, −1 → −Z). */
  front(color, z, pts, dir = 1, o = {}) {
    return this.flat(color, pts, (x, y) => [x, y, z], { ...o, facing: [0, 0, dir] });
  }
  /** Polygon [[x,z]...] painted on the plane y = Y facing up. */
  top(color, y, pts, o = {}) {
    return this.flat(color, pts, (x, z) => [x, y, z], { ...o, facing: [0, 1, 0] });
  }

  /** Flat irregular ground decal (disc-ish polygon) at height y. */
  blob(color, r, pos = [0, 0, 0], o = {}) {
    const seg = o.seg || 10, rr = rng(o.seed || 3), wob = o.wobble ?? 0.25;
    const sx = o.sx || 1, sz = o.sz || 1;
    const pts = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const k = r * (1 - wob / 2 + rr() * wob);
      pts.push([pos[0] + Math.cos(a) * k * sx, pos[1], pos[2] - Math.sin(a) * k * sz]);
    }
    return this.poly(color, pts, { facing: [0, 1, 0], ...o });
  }

  /**
   * Hexahedron with a rectangular bottom and top (car cabins, roofs, hoppers).
   * {y0,y1, zb:[z0,z1], zt:[z0,z1], wb, wt (half widths), x=0}. Returns faces for patch():
   * { left(+X), right(-X), front(+Z), back(-Z), top }. o.skip = ['bottom', ...] faces to omit.
   */
  frustum(color, f, o = {}) {
    const { y0, y1, zb, zt, wb, wt } = f, x = f.x || 0;
    // B/T corners: 0 = +X rear, 1 = +X front, 2 = −X front, 3 = −X rear
    const B = [[x + wb, y0, zb[0]], [x + wb, y0, zb[1]], [x - wb, y0, zb[1]], [x - wb, y0, zb[0]]];
    const T = [[x + wt, y1, zt[0]], [x + wt, y1, zt[1]], [x - wt, y1, zt[1]], [x - wt, y1, zt[0]]];
    // every side face: a→b runs along the bottom edge (sides: rear→front), a→d runs upward
    const faces = {
      left: [B[0], B[1], T[1], T[0]],
      right: [B[3], B[2], T[2], T[3]],
      front: [B[1], B[2], T[2], T[1]],
      back: [B[3], B[0], T[0], T[3]],
      top: [T[0], T[1], T[2], T[3]],
      bottom: [B[0], B[1], B[2], B[3]],
    };
    const cen = [x, (y0 + y1) / 2, (zb[0] + zb[1] + zt[0] + zt[1]) / 4];
    const skip = o.skip || ['bottom'];
    const colors = typeof color === 'object' ? color : null;
    for (const [k, q] of Object.entries(faces)) {
      const fc = centroid(q), n = normalOf(q);
      const d = [fc[0] - cen[0], fc[1] - cen[1], fc[2] - cen[2]];
      // outward direction = face normal flipped to point away from the centre
      const s = n[0] * d[0] + n[1] * d[1] + n[2] * d[2] < 0 ? -1 : 1;
      q.out = [n[0] * s, n[1] * s, n[2] * s];
      if (skip.includes(k)) continue;
      this.poly(colors ? (colors[k] || colors.default) : color, q, { ...o, off: 0, facing: q.out });
    }
    return faces;
  }

  // ── bake ────────────────────────────────────────────────────────────────────
  geometry(skinned = false) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (skinned) {
      const n = this.b.length, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { si[i * 4] = this.b[i]; sw[i * 4] = 1; }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    }
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
  /** Bake to a Mesh using the shared vertex-colour material (or a supplied one). */
  mesh(name = 'body', material = vcolMaterial(), shadows = true) {
    const m = new THREE.Mesh(this.geometry(), material);
    m.name = name;
    m.castShadow = shadows; m.receiveShadow = true;
    return m;
  }
}

/**
 * Rig — bones for ONE rigidly-skinned mesh (one draw call per vehicle/character).
 * Bones are THREE.Bone (Object3D) carrying the animation names (wheel_fl, leg_l,
 * body, door, …). Bind pose = zero rotations; positions are given in MODEL space.
 *   const rig = new Rig();
 *   const w = rig.add('wheel_fl', [x, y, z], null, { order: 'YXZ' }); // null parent → child of the model root
 *   kit.withBone(w, () => …geometry…);
 *   const { mesh, bones } = rig.build(group, kit);   // SkinnedMesh named 'mesh'
 */
export class Rig {
  constructor() { this.defs = []; this.index = new Map(); }
  add(name, pos, parent = null, o = {}) {
    const i = this.defs.length;
    this.defs.push({ name, pos: [pos[0] || 0, pos[1] || 0, pos[2] || 0], parent, order: o.order });
    this.index.set(name, i);
    return i;
  }
  i(name) { return this.index.get(name); }
  pos(name) { return this.defs[this.index.get(name)].pos; }
  build(group, kit, meshName = 'mesh', material = vcolMaterial()) {
    const bones = this.defs.map((d) => { const b = new THREE.Bone(); b.name = d.name; if (d.order) b.rotation.order = d.order; return b; });
    this.defs.forEach((d, i) => {
      const b = bones[i];
      if (d.parent == null) { b.position.set(...d.pos); group.add(b); return; }
      const pi = this.index.get(d.parent), pp = this.defs[pi].pos;
      b.position.set(d.pos[0] - pp[0], d.pos[1] - pp[1], d.pos[2] - pp[2]);
      bones[pi].add(b);
    });
    const mesh = new THREE.SkinnedMesh(kit.geometry(true), material);
    mesh.name = meshName;
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    group.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    group.userData.skinned = true;
    const map = {};
    for (const b of bones) map[b.name] = b;
    return { mesh, bones: map };
  }
}

/**
 * Model root. clone() is skin-aware: cloned SkinnedMeshes are re-bound to the
 * CLONED bones (a plain Object3D.clone() would leave them driven by the
 * prototype's bones). Geometry + materials stay shared.
 */
export class ModelRoot extends THREE.Group {
  clone(recursive = true) {
    const c = new this.constructor().copy(this, recursive);
    if (recursive && this.userData.skinned) rebindSkins(this, c);
    return c;
  }
}
function rebindSkins(src, dst) {
  const map = new Map();
  (function walk(a, b) { map.set(a, b); for (let i = 0; i < a.children.length; i++) walk(a.children[i], b.children[i]); })(src, dst);
  for (const [a, b] of map) {
    if (!a.isSkinnedMesh) continue;
    const sk = new THREE.Skeleton(a.skeleton.bones.map((x) => map.get(x) || x), a.skeleton.boneInverses);
    b.bind(sk, a.bindMatrix);
  }
}

export function normalOf(pts) {
  // Newell's method
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}
export function centroid(pts) {
  const c = [0, 0, 0];
  for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  return c.map((v) => v / pts.length);
}

/** Empty named Object3D (attachment points: vent, exhaust, spot). */
export function empty(name, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const o = new THREE.Object3D();
  o.name = name; o.position.set(...pos); o.rotation.set(...rot);
  return o;
}

/** Root group with the userData every model carries. */
export function root(kind, variant, size, extra = {}) {
  const g = new ModelRoot();
  g.name = `${kind}${variant ? '_' + variant : ''}`;
  g.userData = { kind, variant, size: { w: +size.w.toFixed(2), h: +size.h.toFixed(2), l: +size.l.toFixed(2) }, ...extra };
  return g;
}

/** Measure an object's bounding box → {w,h,l}. */
export function measure(obj) {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj);
  if (b.isEmpty()) return { w: 0, h: 0, l: 0 };
  return { w: b.max.x - b.min.x, h: b.max.y - b.min.y, l: b.max.z - b.min.z };
}

// ── sign textures (CanvasTexture) ────────────────────────────────────────────
const _texCache = new Map();
export const HAS_DOM = typeof document !== 'undefined' && typeof document.createElement === 'function';

/**
 * Draws a sign into a canvas and returns a cached CanvasTexture (or null without a DOM).
 * spec: { key, w, h, bg, draw(ctx, w, h) }  — draw gets a 2D context already filled with bg.
 */
export function signTexture(spec) {
  if (!HAS_DOM) return null;
  let t = _texCache.get(spec.key);
  if (t) return t;
  const cv = document.createElement('canvas');
  cv.width = spec.w || 512; cv.height = spec.h || 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = spec.bg || '#efe6cf';
  ctx.fillRect(0, 0, cv.width, cv.height);
  spec.draw(ctx, cv.width, cv.height);
  if (spec.weather !== false) weather(ctx, cv.width, cv.height, spec.key);
  t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.name = spec.key;
  _texCache.set(spec.key, t);
  return t;
}

/** Sun-bleach + grime speckles so signs sit in the muted palette. */
function weather(ctx, w, h, key) {
  const r = rng(hashStr(key));
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  // faded wash
  ctx.fillStyle = 'rgba(240,226,200,0.10)';
  ctx.fillRect(0, 0, w, h);
  // grime gradient at the bottom
  const g = ctx.createLinearGradient(0, h * 0.6, 0, h);
  g.addColorStop(0, 'rgba(80,60,40,0)'); g.addColorStop(1, 'rgba(80,60,40,0.22)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // speckles / chips
  for (let i = 0; i < (w * h) / 900; i++) {
    const x = r() * w, y = r() * h, s = 1 + r() * 3;
    ctx.fillStyle = r() < 0.5 ? 'rgba(60,45,30,0.25)' : 'rgba(255,250,235,0.25)';
    ctx.fillRect(x, y, s, s);
  }
  ctx.restore();
}
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** Fit text into maxW by shrinking the font. */
export function fitText(ctx, text, x, y, maxW, px, font = '900', family = '"Arial Black","Arial Bold",Arial,Helvetica,sans-serif') {
  let size = px;
  do { ctx.font = `${font} ${size}px ${family}`; size -= 2; } while (ctx.measureText(text).width > maxW && size > 8);
  ctx.fillText(text, x, y);
}

/** Textured flat panel mesh (sign face). Falls back to a plain colour without a DOM. */
export function signPanel(tex, w, h, fallback = '#d9cfb3', name = 'sign') {
  const key = 'signmat|' + (tex ? tex.uuid : fallback);
  let m = _signMats.get(key);
  if (!m) {
    m = tex
      ? new THREE.MeshLambertMaterial({ map: tex, name: 'CR_Sign_' + tex.name })
      : new THREE.MeshLambertMaterial({ color: fallback, name: 'CR_Sign_fallback' });
    _signMats.set(key, m);
  }
  const gk = `plane|${w}|${h}`;
  const mesh = new THREE.Mesh(cachedGeo(gk, () => new THREE.PlaneGeometry(w, h)), m);
  mesh.name = name;
  mesh.receiveShadow = true;
  return mesh;
}
const _signMats = new Map();

/** Signed area of a 2D polygon (>0 = counter-clockwise). */
export function area2(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}
/** Offset a 2D polygon outward by d (negative = inset), miter joins clamped. */
export function offsetPoly(pts, d) {
  const ccw = area2(pts) > 0 ? 1 : -1;
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[(i + n - 1) % n], c = pts[i], q = pts[(i + 1) % n];
    const e1 = norm2([c[0] - p[0], c[1] - p[1]]), e2 = norm2([q[0] - c[0], q[1] - c[1]]);
    const n1 = [e1[1] * ccw, -e1[0] * ccw], n2 = [e2[1] * ccw, -e2[0] * ccw];
    let m = norm2([n1[0] + n2[0], n1[1] + n2[1]]);
    if (!isFinite(m[0])) m = n1;
    let s = d / Math.max(0.35, m[0] * n1[0] + m[1] * n1[1]);
    out.push([c[0] + m[0] * s, c[1] + m[1] * s]);
  }
  return out;
}
function norm2(v) { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }

/** Insert extra vertices where polygon edges cross the given horizontal levels (pts are [a, y]). */
export function insertLevels(pts, levels) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    out.push(p);
    const cross = levels.filter((y) => (y > Math.min(p[1], q[1]) + 1e-4) && (y < Math.max(p[1], q[1]) - 1e-4));
    cross.sort((a, b) => (q[1] > p[1] ? a - b : b - a));
    for (const y of cross) { const t = (y - p[1]) / (q[1] - p[1]); out.push([p[0] + (q[0] - p[0]) * t, y]); }
  }
  return out;
}

/** Clip a polygon [[a,b],...] to the rectangle a∈[a0,a1], b∈[b0,b1] (Sutherland–Hodgman). */
export function clipRect(pts, a0 = -Infinity, a1 = Infinity, b0 = -Infinity, b1 = Infinity) {
  const planes = [[0, a0, 1], [0, a1, -1], [1, b0, 1], [1, b1, -1]];
  let r = pts;
  for (const [ax, v, s] of planes) {
    if (!isFinite(v) || !r.length) continue;
    const out = [];
    for (let i = 0; i < r.length; i++) {
      const cur = r[i], prev = r[(i + r.length - 1) % r.length];
      const ci = (cur[ax] - v) * s >= 0, pi = (prev[ax] - v) * s >= 0;
      const inter = () => { const t = (v - prev[ax]) / (cur[ax] - prev[ax]); return [prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]; };
      if (ci) { if (!pi) out.push(inter()); out.push(cur); } else if (pi) out.push(inter());
    }
    r = out;
  }
  return r.filter((p, i) => { const q = r[(i + r.length - 1) % r.length]; return Math.abs(p[0] - q[0]) > 1e-5 || Math.abs(p[1] - q[1]) > 1e-5; });
}

/** Clip a polygon [[a,b],...] to the band lo <= b <= hi (Sutherland–Hodgman, two half-planes). */
export function clipBand(pts, lo = -Infinity, hi = Infinity) {
  const clip = (poly, keep, inter) => {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i], prev = poly[(i + poly.length - 1) % poly.length];
      const ci = keep(cur), pi = keep(prev);
      if (ci) { if (!pi) out.push(inter(prev, cur)); out.push(cur); }
      else if (pi) out.push(inter(prev, cur));
    }
    return out;
  };
  const at = (y) => (p, q) => { const t = (y - p[1]) / (q[1] - p[1]); return [p[0] + (q[0] - p[0]) * t, y]; };
  let r = pts;
  if (lo > -Infinity) r = clip(r, (p) => p[1] >= lo, at(lo));
  if (hi < Infinity && r.length) r = clip(r, (p) => p[1] <= hi, at(hi));
  // drop consecutive duplicates
  return r.filter((p, i) => { const q = r[(i + r.length - 1) % r.length]; return Math.abs(p[0] - q[0]) > 1e-5 || Math.abs(p[1] - q[1]) > 1e-5; });
}
