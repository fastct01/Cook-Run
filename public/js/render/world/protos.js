// ─────────────────────────────────────────────────────────────────────────────
// WorldProtos (VIEW-WORLD-A): baked static prototypes for chunk scenery.
//   protos.get(kind, variant) → { kind, variant, groups, size:{w,h,l}, bbox, ud, tris }
// groups (model space, triangle soup):
//   { type:'vc',    pos, nrm, col, emit }                      → shared emit material
//   { type:'atlas', page, cut, side, pos, nrm, col, emit, emap, uv } → shared atlas material
//   { type:'raw',   material, pos, nrm, col?, uv? }            → own material (tiling / blended)
// `ud` keeps the model's userData (tile, treeSpots, deckY, tracks …).
// protos.heightAt(proto, x, z) → top surface height of a terrain tile at local (x, z).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { extractGroups } from '../bake.js';

const _c = new THREE.Color();

export class WorldProtos {
  constructor(lib, atlas) {
    this.lib = lib; this.atlas = atlas;
    this.map = new Map();
  }

  /** number of variants ART has for a kind (1 when unknown) */
  variants(kind) {
    const a = this.lib.assets;
    try { return Math.max(1, (a && typeof a.variantCount === 'function' && (!this.lib.kindList || this.lib.kindList.has(kind))) ? a.variantCount(kind) : 1); } catch (e) { return 1; }
  }

  get(kind, variant = 0, { split = null } = {}) {
    const nv = this.variants(kind);
    variant = (((variant | 0) % nv) + nv) % nv;
    const key = kind + '|' + variant;
    let p = this.map.get(key);
    if (p) return p;
    const root = this.lib.create(kind, variant);
    const ud = { ...(root.userData || {}) };
    let sub = null;
    if (split) {
      // pull named meshes (e.g. a tile's `water`) out into their own sub-protos
      for (const name of split) {
        const m = root.getObjectByName(name);
        if (!m) continue;
        const holder = new THREE.Group();
        root.updateMatrixWorld(true);
        const c = m.clone(); c.matrixAutoUpdate = false; c.matrix.copy(m.matrixWorld); holder.add(c);
        const g2 = extractGroups(holder);
        (sub ||= {})[name] = { kind: kind + ':' + name, variant, groups: g2.groups.map((g) => (g.vc ? { type: 'vc', pos: g.pos, nrm: g.nrm, col: g.col, emit: g.emit } : (this._toAtlas(g) || { type: 'raw', material: g.material, pos: g.pos, nrm: g.nrm, col: g.col, uv: g.uv }))), size: { w: 1, h: 1, l: 1 }, ud: {} };
        m.visible = false;
      }
    }
    const { groups, bbox } = extractGroups(root);
    const out = [];
    for (const g of groups) {
      if (g.vc) { out.push({ type: 'vc', pos: g.pos, nrm: g.nrm, col: g.col, emit: g.emit }); continue; }
      const conv = this._toAtlas(g);
      out.push(conv || { type: 'raw', material: g.material, pos: g.pos, nrm: g.nrm, col: g.col, uv: g.uv });
    }
    const size = this.lib.sizeOf(root, bbox);
    p = { kind, variant, groups: out, size, bbox, ud, sub, tris: out.reduce((a, g) => a + g.pos.length / 9, 0) };
    this.map.set(key, p);
    return p;
  }

  /** Convert an arbitrary (parentless) Object3D into a one-off proto (signs built in code). */
  fromObject(root) {
    const { groups, bbox } = extractGroups(root);
    const out = groups.map((g) => (g.vc ? { type: 'vc', pos: g.pos, nrm: g.nrm, col: g.col, emit: g.emit } : (this._toAtlas(g) || { type: 'raw', material: g.material, pos: g.pos, nrm: g.nrm, col: g.col, uv: g.uv })));
    return { kind: '_obj', variant: 0, groups: out, size: { w: 1, h: 1, l: 1 }, bbox, ud: {} };
  }

  _toAtlas(g) {
    const m = g.material;
    if (!this.atlas || !m || !m.map || !g.uv) return null;
    if (m.transparent && !(m.alphaTest > 0)) return null;
    if ((m.opacity ?? 1) < 1 && !(m.alphaTest > 0)) return null;
    if (m.emissiveMap && m.emissiveMap !== m.map) return null;
    const slot = this.atlas.slotFor(m.map);
    if (!slot) return null;
    const uv = this.atlas.remap(slot, m.map, g.uv);
    if (!uv) return null;
    const n = g.pos.length, nv = n / 3;
    const col = new Float32Array(n), emit = new Float32Array(n), emap = new Float32Array(nv);
    const basic = !!m.isMeshBasicMaterial;
    const mc = m.color || _c.setRGB(1, 1, 1);
    let er = 0, eg = 0, eb = 0, em = 0;
    if (basic) { er = mc.r; eg = mc.g; eb = mc.b; em = 1; }
    else if (m.emissive) {
      const k = m.emissiveIntensity ?? 1;
      er = m.emissive.r * k; eg = m.emissive.g * k; eb = m.emissive.b * k; em = m.emissiveMap ? 1 : 0;
    }
    for (let i = 0, vi = 0; i < n; i += 3, vi++) {
      if (basic) { col[i] = col[i + 1] = col[i + 2] = 0; }
      else if (g.col && m.vertexColors) { col[i] = g.col[i] * mc.r; col[i + 1] = g.col[i + 1] * mc.g; col[i + 2] = g.col[i + 2] * mc.b; }
      else { col[i] = mc.r; col[i + 1] = mc.g; col[i + 2] = mc.b; }
      emit[i] = er; emit[i + 1] = eg; emit[i + 2] = eb;
      emap[vi] = em;
    }
    return { type: 'atlas', page: slot.page, cut: m.alphaTest > 0, side: m.side ?? THREE.FrontSide, pos: g.pos, nrm: g.nrm, col, emit, emap, uv };
  }

  // ── terrain tile height lookup (lowest surface under a point = ground, ignoring rocks/flares above) ──
  heightAt(p, x, z) {
    if (!p._hgrid) p._hgrid = buildGrid(p);
    const G = p._hgrid;
    const ix = Math.floor((x - G.x0) / G.cell), iz = Math.floor((z - G.z0) / G.cell);
    const list = G.cells.get(ix * 4096 + iz);
    if (!list) return 0;
    let best = Infinity;
    const P = G.pos;
    for (const t of list) {
      const a = t * 9;
      const ax = P[a], az = P[a + 2], bx = P[a + 3], bz = P[a + 5], cx = P[a + 6], cz = P[a + 8];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-9) continue;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
      const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
      const y = l1 * P[a + 1] + l2 * P[a + 4] + l3 * P[a + 7];
      if (y < best) best = y;
    }
    return best === Infinity ? 0 : best;
  }

  /** Average colour of a tile's vertices near its far edge (local x < −30) – used to tint the ground beyond. */
  edgeColor(p, out = new THREE.Color()) {
    if (p._edgeCol) return out.copy(p._edgeCol);
    let r = 0, g = 0, b = 0, n = 0;
    for (const grp of p.groups) {
      if (grp.type !== 'vc' || !grp.col) continue;
      const P = grp.pos, C = grp.col;
      for (let i = 0; i < P.length; i += 3) {
        if (P[i] > -28 || P[i + 1] > 1.5) continue;
        r += C[i]; g += C[i + 1]; b += C[i + 2]; n++;
      }
    }
    p._edgeCol = n ? new THREE.Color(r / n, g / n, b / n) : new THREE.Color(0.5, 0.5, 0.45);
    return out.copy(p._edgeCol);
  }

  /** Average colour of the whole top surface (for ground blending). */
  meanColor(p, out = new THREE.Color()) {
    if (p._meanCol) return out.copy(p._meanCol);
    let r = 0, g = 0, b = 0, n = 0;
    for (const grp of p.groups) {
      if (grp.type !== 'vc' || !grp.col) continue;
      const C = grp.col, N = grp.nrm;
      for (let i = 0; i < C.length; i += 9) { if (N[i + 1] < 0.6) continue; r += C[i]; g += C[i + 1]; b += C[i + 2]; n++; }
    }
    p._meanCol = n ? new THREE.Color(r / n, g / n, b / n) : new THREE.Color(0.5, 0.5, 0.45);
    return out.copy(p._meanCol);
  }
}

function buildGrid(p) {
  // largest vc group = the heightfield body
  let body = null;
  for (const g of p.groups) if (g.type === 'vc' && (!body || g.pos.length > body.pos.length)) body = g;
  const cell = 4, x0 = -42, z0 = -32;
  const cells = new Map();
  if (!body) return { cell, x0, z0, cells, pos: new Float32Array(0) };
  const P = body.pos, N = body.nrm;
  for (let t = 0; t < P.length / 9; t++) {
    const a = t * 9;
    // upward facing triangles only (skip skirts / cliff undersides)
    const ny = (N[a + 1] + N[a + 4] + N[a + 7]) / 3;
    if (ny < 0.05) continue;
    const xs = [P[a], P[a + 3], P[a + 6]], zs = [P[a + 2], P[a + 5], P[a + 8]];
    const ix0 = Math.floor((Math.min(...xs) - x0) / cell), ix1 = Math.floor((Math.max(...xs) - x0) / cell);
    const iz0 = Math.floor((Math.min(...zs) - z0) / cell), iz1 = Math.floor((Math.max(...zs) - z0) / cell);
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const k = ix * 4096 + iz;
      let l = cells.get(k); if (!l) cells.set(k, (l = [])); l.push(t);
    }
  }
  return { cell, x0, z0, cells, pos: P };
}
