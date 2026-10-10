// ─────────────────────────────────────────────────────────────────────────────
// Geometry baking: turns arbitrary model hierarchies (ART's createModel output or
// our fallbacks) into a handful of merged meshes so draw calls stay low.
//
//  • extractGroups(root) → triangle soup grouped by material. Plain opaque lit
//    materials (Lambert/Standard/Phong/Toon, emissive or not, no texture) become
//    vertex colours + per-vertex emission and share ONE material; textured /
//    transparent ones keep their own material.
//  • Batch → accumulates many transformed protos + raw quads (road, ground,
//    walls) and emits one Mesh per material group.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const _rel = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();
const _ec = new THREE.Color();

// ── shared vertex-colour materials ──────────────────────────────────────────
// variants: 'emit' (props: colour + aEmit), 'ground', 'decal', 'marks', 'far'
const VC = new Map();
export function vcMaterial(side = THREE.FrontSide, variant = 'emit') {
  const key = side + ':' + variant;
  let m = VC.get(key);
  if (m) return m;
  m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: variant !== 'marks' && variant !== 'decal', side });
  m.name = 'vc_' + key;
  const emit = variant === 'emit' || variant === 'far';
  m.userData.emit = emit;
  if (variant === 'marks') { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -8; }
  if (variant === 'decal') { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -3; }
  if (emit) {
    const far = variant === 'far';
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute vec3 aEmit;\nvarying vec3 vEmitV;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vEmitV = aEmit;');
      let fs = 'varying vec3 vEmitV;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vEmitV;');
      if (far) {
        // distant silhouettes (mesas): weaker fog so they read against the sky
        fs = fs.replace('#include <fog_fragment>',
          '#ifdef USE_FOG\n float fogFactor = smoothstep( fogNear, fogFar * 2.4, vFogDepth ) * 0.8;\n gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );\n#endif');
      }
      sh.fragmentShader = fs;
    };
    m.customProgramCacheKey = () => 'vc_' + variant;
  }
  VC.set(key, m);
  return m;
}

const litOk = (m) => m.isMeshLambertMaterial || m.isMeshStandardMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial || m.isMeshPhysicalMaterial;
export function isBakeable(m) {
  if (!m || m.map || m.transparent || m.alphaTest > 0 || m.opacity < 1 || m.wireframe) return false;
  if (m.userData && m.userData.noBake) return false;
  return litOk(m) || m.isMeshBasicMaterial;
}

function chainVisible(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

// Extract triangles of `meshes` into groups, positions relative to `baseInv`.
function extractMeshes(meshes, baseInv, out) {
  for (const mesh of meshes) {
    const geo = mesh.geometry;
    if (!geo || !geo.attributes || !geo.attributes.position) continue;
    const pos = geo.attributes.position;
    let nrm = geo.attributes.normal;
    if (!nrm) { const g2 = geo.clone(); g2.computeVertexNormals(); nrm = g2.attributes.normal; }
    const uv = geo.attributes.uv;
    const col = geo.attributes.color;
    const idx = geo.index;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const groups = Array.isArray(mesh.material) && geo.groups.length
      ? geo.groups
      : [{ start: 0, count: idx ? idx.count : pos.count, materialIndex: 0 }];
    const instCount = mesh.isInstancedMesh ? mesh.count : 1;
    const im = new THREE.Matrix4();
    for (let inst = 0; inst < instCount; inst++) {
      _rel.multiplyMatrices(baseInv, mesh.matrixWorld);
      if (mesh.isInstancedMesh) { mesh.getMatrixAt(inst, im); _rel.multiply(im); }
      _nm.getNormalMatrix(_rel);
      const flip = _rel.determinant() < 0;
      for (const gr of groups) {
        const m = mats[gr.materialIndex ?? 0] || mats[0];
        if (!m) continue;
        const bake = isBakeable(m);
        const key = bake ? 'vc:' + (m.side ?? 0) : m.uuid;
        let g = out.get(key);
        if (!g) {
          g = { key, vc: bake, material: bake ? vcMaterial(m.side ?? 0) : m,
                pos: [], nrm: [], col: [], emit: [], uv: [], hasUv: !bake && !!uv, hasCol: bake || (!!col && !!m.vertexColors),
                castShadow: bake ? mesh.castShadow !== false : (!m.transparent && mesh.castShadow !== false) };
          out.set(key, g);
        }
        const end = Math.min(gr.start + gr.count, idx ? idx.count : pos.count);
        const basic = !!m.isMeshBasicMaterial;
        if (bake) {
          if (basic) _ec.copy(m.color);
          else if (m.emissive) _ec.copy(m.emissive).multiplyScalar(m.emissiveIntensity ?? 1);
          else _ec.setRGB(0, 0, 0);
        }
        const order = flip ? [0, 2, 1] : [0, 1, 2];
        for (let i = gr.start; i < end; i += 3) {
          for (const k of order) {
            const vi = idx ? idx.getX(i + k) : i + k;
            _v.fromBufferAttribute(pos, vi).applyMatrix4(_rel);
            _n.fromBufferAttribute(nrm, vi).applyMatrix3(_nm).normalize();
            g.pos.push(_v.x, _v.y, _v.z); g.nrm.push(_n.x, _n.y, _n.z);
            if (g.hasCol) {
              if (bake) {
                if (basic) _c.setRGB(0, 0, 0); else _c.copy(m.color);
                if (col && m.vertexColors) { _c.r *= col.getX(vi); _c.g *= col.getY(vi); _c.b *= col.getZ(vi); }
                g.col.push(_c.r, _c.g, _c.b);
                g.emit.push(_ec.r, _ec.g, _ec.b);
              } else g.col.push(col.getX(vi), col.getY(vi), col.getZ(vi));
            }
            if (g.hasUv) g.uv.push(uv.getX(vi), uv.getY(vi));
          }
        }
      }
    }
  }
  return out;
}

function finalizeGroups(map) {
  const arr = [];
  for (const g of map.values()) {
    if (!g.pos.length) continue;
    arr.push({
      key: g.key, vc: g.vc, material: g.material, castShadow: g.castShadow,
      pos: new Float32Array(g.pos), nrm: new Float32Array(g.nrm),
      col: g.hasCol ? new Float32Array(g.col) : null, uv: g.hasUv ? new Float32Array(g.uv) : null,
      emit: g.vc ? new Float32Array(g.emit) : null,
    });
  }
  return arr;
}

function bboxOf(groups) {
  const b = new THREE.Box3();
  for (const g of groups) for (let i = 0; i < g.pos.length; i += 3) b.expandByPoint(_v.set(g.pos[i], g.pos[i + 1], g.pos[i + 2]));
  if (b.isEmpty()) b.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
  return b;
}

// Whole model → groups in world space of the (parentless) root, i.e. model space
// with the root's own transform applied.
export function extractGroups(root) {
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && chainVisible(o)) meshes.push(o); });
  const groups = finalizeGroups(extractMeshes(meshes, new THREE.Matrix4(), new Map()));
  return { groups, bbox: bboxOf(groups) };
}

// ── Batch: accumulate geometry for one chunk ────────────────────────────────
class Grow {
  constructor(n = 3072) { this.a = new Float32Array(n); this.n = 0; }
  reserve(k) {
    if (this.n + k <= this.a.length) return;
    let s = this.a.length * 2; while (s < this.n + k) s *= 2;
    const b = new Float32Array(s); b.set(this.a.subarray(0, this.n)); this.a = b;
  }
  push3(x, y, z) { this.reserve(3); const a = this.a; a[this.n++] = x; a[this.n++] = y; a[this.n++] = z; }
  zeros(k) { this.reserve(k); this.a.fill(0, this.n, this.n + k); this.n += k; }
  view() { return this.a.slice(0, this.n); }
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _fn = new THREE.Vector3();
export const UP = new THREE.Vector3(0, 1, 0);

export class Batch {
  constructor({ castShadow = false, receiveShadow = true, material = null } = {}) {
    this.cast = castShadow; this.receive = receiveShadow;
    this.defaultMat = material || vcMaterial();
    this.emit = !!this.defaultMat.userData.emit;
    this.groups = new Map();
    this.tris = 0;
  }
  _group(key, material, vc, hasUv, hasCol) {
    let g = this.groups.get(key);
    if (!g) {
      g = { key, material, vc, pos: new Grow(), nrm: new Grow(), col: (vc || hasCol) ? new Grow() : null,
            emit: vc && this.emit ? new Grow() : null, uv: hasUv ? new Grow() : null };
      this.groups.set(key, g);
    }
    return g;
  }
  get main() { return this._group('main', this.defaultMat, true, false); }

  // Triangle with per-vertex colours; flat normal.
  tri(a, b, c, ca, cb, cc) {
    const g = this.main;
    _e1.subVectors(b, a); _e2.subVectors(c, a); _fn.crossVectors(_e1, _e2).normalize();
    g.pos.push3(a.x, a.y, a.z); g.pos.push3(b.x, b.y, b.z); g.pos.push3(c.x, c.y, c.z);
    for (let i = 0; i < 3; i++) g.nrm.push3(_fn.x, _fn.y, _fn.z);
    g.col.push3(ca.r, ca.g, ca.b); g.col.push3(cb.r, cb.g, cb.b); g.col.push3(cc.r, cc.g, cc.b);
    if (g.emit) g.emit.zeros(9);
    this.tris++;
  }
  // Quad a,b,c,d; `face` = direction the front should face (auto-flip winding).
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
  // Box given centre, size and yaw; flat colour.
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
  // Append a baked proto (groups from extractGroups) with matrix + optional tint.
  addProto(groups, matrix, tint) {
    _nm.getNormalMatrix(matrix);
    const e = matrix.elements, m = _nm.elements;
    for (const src of groups) {
      const g = src.vc ? this.main : this._group(src.key, src.material, false, !!src.uv, !!src.col);
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
        if (src.emit) { g.emit.reserve(n); g.emit.a.set(src.emit, g.emit.n); g.emit.n += n; } else g.emit.zeros(n);
      }
      if (g.uv && src.uv) { g.uv.reserve(src.uv.length); g.uv.a.set(src.uv, g.uv.n); g.uv.n += src.uv.length; }
      this.tris += n / 9;
    }
  }
  toMeshes() {
    const out = [];
    for (const g of this.groups.values()) {
      if (!g.pos.n) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(g.pos.view(), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(g.nrm.view(), 3));
      if (g.col) geo.setAttribute('color', new THREE.BufferAttribute(g.col.view(), 3));
      if (g.emit) geo.setAttribute('aEmit', new THREE.BufferAttribute(g.emit.view(), 3));
      if (g.uv) geo.setAttribute('uv', new THREE.BufferAttribute(g.uv.view(), 2));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, g.material);
      mesh.castShadow = this.cast && (g.vc || !g.material.transparent);
      mesh.receiveShadow = this.receive;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      out.push(mesh);
    }
    return out;
  }
}
