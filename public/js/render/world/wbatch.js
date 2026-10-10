// ─────────────────────────────────────────────────────────────────────────────
// WBatch: accumulates one chunk's static geometry per shared material and emits
// one Mesh per material (VIEW-WORLD-A). Same idea as render/bake.js Batch, plus:
//   • atlas groups (signs remapped into the runtime SignAtlas: uv + emission + emission-from-map flag)
//   • addProto(proto, matrix, tint) for WorldProtos protos (vc / atlas / raw groups)
//   • addProtoFn(proto, fn, yaw, tint): free-form vertex warp (terrain tiles bent along the road)
//   • `atlasTo`: route this batch's sign groups into another batch (far scenery signs → near atlas mesh)
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { worldMat, atlasMat } from './materials.js';

class Grow {
  constructor(n = 3072) { this.a = new Float32Array(n); this.n = 0; }
  reserve(k) {
    if (this.n + k <= this.a.length) return;
    let s = this.a.length * 2; while (s < this.n + k) s *= 2;
    const b = new Float32Array(s); b.set(this.a.subarray(0, this.n)); this.a = b;
  }
  push3(x, y, z) { this.reserve(3); const a = this.a; a[this.n++] = x; a[this.n++] = y; a[this.n++] = z; }
  push1(x) { this.reserve(1); this.a[this.n++] = x; }
  fill(v, k) { this.reserve(k); this.a.fill(v, this.n, this.n + k); this.n += k; }
  view() { return this.n * 2 < this.a.length ? this.a.slice(0, this.n) : this.a.subarray(0, this.n); }
}

export const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _fn = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _w = { x: 0, y: 0, z: 0 };

export class WBatch {
  constructor({ castShadow = false, receiveShadow = true, material = null, renderOrder = 0, name = '' } = {}) {
    this.cast = castShadow; this.receive = receiveShadow;
    this.defaultMat = material || worldMat('emit');
    this.emit = !!this.defaultMat.userData.emit;
    this.groups = new Map();
    this.renderOrder = renderOrder;
    this.name = name;
    this.atlasTo = null;
    this.tris = 0;
  }
  _group(key, material, kind, flags = {}) {
    let g = this.groups.get(key);
    if (!g) {
      const vc = kind === 'vc', at = kind === 'atlas';
      g = { key, material, kind, pos: new Grow(), nrm: new Grow(),
        col: vc || at || flags.col ? new Grow() : null,
        emit: (vc && this.emit) || at ? new Grow() : null,
        emap: at ? new Grow(1024) : null,
        uv: at || flags.uv ? new Grow() : null };
      this.groups.set(key, g);
    }
    return g;
  }
  get main() { return this._group('main', this.defaultMat, 'vc'); }

  tri(a, b, c, ca, cb, cc) {
    const g = this.main;
    _e1.subVectors(b, a); _e2.subVectors(c, a); _fn.crossVectors(_e1, _e2).normalize();
    g.pos.push3(a.x, a.y, a.z); g.pos.push3(b.x, b.y, b.z); g.pos.push3(c.x, c.y, c.z);
    for (let i = 0; i < 3; i++) g.nrm.push3(_fn.x, _fn.y, _fn.z);
    g.col.push3(ca.r, ca.g, ca.b); g.col.push3(cb.r, cb.g, cb.b); g.col.push3(cc.r, cc.g, cc.b);
    if (g.emit) g.emit.fill(0, 9);
    this.tris++;
  }
  quad(a, b, c, d, ca, cb, cc, cd, face) {
    if (face) {
      _e1.subVectors(b, a); _e2.subVectors(c, a); _fn.crossVectors(_e1, _e2);
      if (_fn.dot(face) < 0) { this.tri(a, c, b, ca, cc, cb); this.tri(a, d, c, ca, cd, cc); return; }
    }
    this.tri(a, b, c, ca, cb, cc); this.tri(a, c, d, ca, cc, cd);
  }
  quadXYZ(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, ca, cb = ca, cc = ca, cd = ca, face = UP) {
    this.quad(_a.set(ax, ay, az), _b.set(bx, by, bz), _d.set(cx, cy, cz), _v4.set(dx, dy, dz), ca, cb, cc, cd, face);
  }
  box(cx, cy, cz, w, h, l, yaw, color) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const P = (x, y, z) => new THREE.Vector3(cx + x * cs + z * sn, cy + y, cz - x * sn + z * cs);
    const hw = w / 2, hl = l / 2, hh = h / 2;
    const v = [P(-hw, -hh, -hl), P(hw, -hh, -hl), P(hw, hh, -hl), P(-hw, hh, -hl), P(-hw, -hh, hl), P(hw, -hh, hl), P(hw, hh, hl), P(-hw, hh, hl)];
    const faces = [[4, 5, 6, 7], [1, 0, 3, 2], [5, 1, 2, 6], [0, 4, 7, 3], [7, 6, 2, 3], [0, 1, 5, 4]];
    const ctr = new THREE.Vector3(cx, cy, cz);
    for (const f of faces) {
      const fc = new THREE.Vector3().add(v[f[0]]).add(v[f[2]]).multiplyScalar(0.5).sub(ctr);
      this.quad(v[f[0]], v[f[1]], v[f[2]], v[f[3]], color, color, color, color, fc);
    }
  }

  // target group for a proto group
  _target(src) {
    if (src.type === 'vc') return this.main;
    if (src.type === 'atlas') {
      const b = this.atlasTo || this;
      const key = `atlas:${src.page.id}:${src.cut ? 1 : 0}:${src.side}`;
      return b._group(key, atlasMat(src.page, src.cut, src.side), 'atlas');
    }
    return this._group('raw:' + src.material.uuid, src.material, 'raw', { col: !!src.col, uv: !!src.uv });
  }

  _append(g, src, n, tint) {
    // colours / emission / uvs (positions + normals written by the caller)
    if (g.col) {
      g.col.reserve(n);
      const ca = g.col.a; let ci = g.col.n;
      if (src.col) {
        const tr = tint ? tint.r : 1, tg = tint ? tint.g : 1, tb = tint ? tint.b : 1;
        for (let i = 0; i < n; i += 3) { ca[ci] = src.col[i] * tr; ca[ci + 1] = src.col[i + 1] * tg; ca[ci + 2] = src.col[i + 2] * tb; ci += 3; }
      } else { ca.fill(1, ci, ci + n); ci += n; }
      g.col.n = ci;
    }
    if (g.emit) {
      if (src.emit) { g.emit.reserve(n); g.emit.a.set(src.emit, g.emit.n); g.emit.n += n; } else g.emit.fill(0, n);
    }
    if (g.emap) {
      const k = n / 3;
      if (src.emap) { g.emap.reserve(k); g.emap.a.set(src.emap, g.emap.n); g.emap.n += k; } else g.emap.fill(0, k);
    }
    if (g.uv) {
      const k = (n / 3) * 2;
      if (src.uv) { g.uv.reserve(k); g.uv.a.set(src.uv, g.uv.n); g.uv.n += k; } else g.uv.fill(0, k);
    }
    this.tris += n / 9;
  }

  /** Append a WorldProtos proto with a Matrix4 (and optional tint colour). */
  addProto(proto, matrix, tint = null) {
    _nm.getNormalMatrix(matrix);
    const e = matrix.elements, m = _nm.elements;
    for (const src of proto.groups) {
      const g = this._target(src);
      const p = src.pos, nr = src.nrm, n = p.length;
      g.pos.reserve(n); g.nrm.reserve(n);
      const pa = g.pos.a, na = g.nrm.a;
      let pi = g.pos.n;
      for (let i = 0; i < n; i += 3) {
        const x = p[i], y = p[i + 1], z = p[i + 2];
        pa[pi] = e[0] * x + e[4] * y + e[8] * z + e[12];
        pa[pi + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        pa[pi + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        pi += 3;
      }
      g.pos.n = pi;
      let ni = g.nrm.n;
      for (let i = 0; i < n; i += 3) {
        const x = nr[i], y = nr[i + 1], z = nr[i + 2];
        const nx = m[0] * x + m[3] * y + m[6] * z, ny = m[1] * x + m[4] * y + m[7] * z, nz = m[2] * x + m[5] * y + m[8] * z;
        const l = Math.hypot(nx, ny, nz) || 1;
        na[ni] = nx / l; na[ni + 1] = ny / l; na[ni + 2] = nz / l; ni += 3;
      }
      g.nrm.n = ni;
      this._append(g, src, n, tint);
    }
  }

  /** Append a proto through a warp: fn(x, y, z, out) writes world out.x/y/z for a model-space vertex.
   *  Normals are rotated by `yaw` (flat-shaded materials recompute them anyway). */
  addProtoFn(proto, fn, yaw = 0, tint = null) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    for (const src of proto.groups) {
      const g = this._target(src);
      const p = src.pos, nr = src.nrm, n = p.length;
      g.pos.reserve(n); g.nrm.reserve(n);
      const pa = g.pos.a, na = g.nrm.a;
      let pi = g.pos.n, ni = g.nrm.n;
      for (let i = 0; i < n; i += 3) {
        fn(p[i], p[i + 1], p[i + 2], _w);
        pa[pi++] = _w.x; pa[pi++] = _w.y; pa[pi++] = _w.z;
        const x = nr[i], y = nr[i + 1], z = nr[i + 2];
        na[ni++] = x * cs + z * sn; na[ni++] = y; na[ni++] = -x * sn + z * cs;
      }
      g.pos.n = pi; g.nrm.n = ni;
      this._append(g, src, n, tint);
    }
  }

  get empty() { for (const g of this.groups.values()) if (g.pos.n) return false; return true; }

  toMeshes() {
    const out = [];
    for (const g of this.groups.values()) {
      if (!g.pos.n) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(g.pos.view(), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(g.nrm.view(), 3));
      if (g.col) geo.setAttribute('color', new THREE.BufferAttribute(g.col.view(), 3));
      if (g.emit) geo.setAttribute('aEmit', new THREE.BufferAttribute(g.emit.view(), 3));
      if (g.emap) geo.setAttribute('aEmitMap', new THREE.BufferAttribute(g.emap.view(), 1));
      if (g.uv) geo.setAttribute('uv', new THREE.BufferAttribute(g.uv.view(), 2));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, g.material);
      mesh.castShadow = this.cast && (g.kind !== 'raw' || !g.material.transparent);
      mesh.receiveShadow = this.receive;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.renderOrder = g.material.transparent ? Math.max(3, this.renderOrder) : this.renderOrder;
      mesh.name = this.name + (g.kind === 'vc' ? '' : ':' + g.kind);
      out.push(mesh);
    }
    return out;
  }
}
