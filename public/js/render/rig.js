// ─────────────────────────────────────────────────────────────────────────────
// Rig: bakes an animated model (named parts) into ONE geometry + a shader that
// moves each part around its pivot from per-instance uniforms. One draw call
// per entity instead of one per wheel/limb/light.
//
//   const proto = buildRigProto(root, opts?)  // { geometry, tlayers, parts: {name: idx}, pivots, parent, … }
//   const inst  = new RigInstance(proto)
//   inst.mesh                           // THREE.Mesh — add inst.root to the scene
//   inst.setRot(name, quaternion)       // part rotation around its pivot (model space at rest)
//   inst.setEuler(name, x, y, z)        // same, from Euler angles (order 'YXZ', like the assets)
//   inst.setOffset(name, x, y, z)       // part translation
//   inst.setScale(name, sx, sy, sz)     // part scale around its pivot (0 hides the part)
//   inst.setAlpha(name, a)              // per-part opacity (translucent layer only, e.g. steam puffs)
//   inst.setEmit(name, k)               // emissive multiplier for that part (light parts start at 0)
//   inst.tint(color)                    // diffuse multiplier
//   inst.commit()                       // compose parent→child transforms (also runs automatically
//                                       // before the frame is drawn; call it yourself before reading
//                                       // part positions with inst.partPoint()).
//
// Expansion upgrades (all backwards compatible with the base game's callers):
//  • Part hierarchy: a part whose ancestor is also a part inherits its transform
//    (gorilla arms on the wobbling body, stagecoach legs under each horse, the
//    Rhino's canister under the lobber). Repeated names under different parent
//    parts get qualified names: `horse_1.leg_fl` (the first one also keeps `leg_fl`).
//  • Up to MAX_PARTS_BIG (40) parts: protos with ≤ 16 parts keep the small program.
//  • Per-part scale + alpha (uRigS = xyz scale, w alpha).
//  • Translucent untextured materials (steam, dust, water jets, canopies) are baked
//    into a second rigged layer (`proto.tlayers`, normal / additive) — 1 extra draw
//    call instead of one per mesh.
//  • Opaque CanvasTexture signs/labels are packed into one per-proto atlas and baked
//    into the main geometry (uv attribute + map) — 0 extra draw calls for signs.
//  • Per-kind part / light regexes: buildRigProto(root, { partRe, lightRe }).
//  • Extras that cannot be baked follow their part's transform.
// Vertex attributes: aPart (part index), aPivot (vec3), aEmit (emissive rgb), aAlpha (translucent layers).
// Part 0 = static body.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { isBakeable } from './bake.js';

export const MAX_PARTS = 16;
export const MAX_PARTS_BIG = 40;
export const LIGHT_RE = /^(light_|window_glow)/;
export const RIG_RE = /^(wheel_[a-z]+\d*|leg_l|leg_r|leg_fl|leg_fr|leg_rl|leg_rr|ball|chunk|arm_l|arm_r|head|rotor|tail_rotor|arm|light_red\w*|light_blue\w*|light_brake\w*|window_glow|blades|door)$/;

const _rel = new THREE.Matrix4(), _nm = new THREE.Matrix3(), _inv = new THREE.Matrix4();
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _pv = new THREE.Vector3(), _c = new THREE.Color(), _e = new THREE.Color();
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _t = new THREE.Vector3();
const _eu = new THREE.Euler();

const isLit = (m) => m.isMeshLambertMaterial || m.isMeshStandardMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial || m.isMeshPhysicalMaterial;
// translucent, untextured, plain lit/basic material → bakeable into a translucent rig layer
const isTransBake = (m) => !!m && m.transparent && !m.map && !m.alphaMap && !m.wireframe && (isLit(m) || m.isMeshBasicMaterial) && !(m.userData && m.userData.noBake);
// opaque textured material whose texture can be packed into a sign atlas
function isAtlasable(m) {
  if (!m || !m.map || m.transparent || m.alphaTest > 0 || m.wireframe || !(isLit(m) || m.isMeshBasicMaterial)) return false;
  const t = m.map, img = t.image;
  if (!img || !(img.width > 0) || !(img.height > 0)) return false;
  if (typeof document === 'undefined') return false;
  if (t.wrapS !== THREE.ClampToEdgeWrapping && t.repeat.x !== 1) return false;
  if (t.wrapT !== THREE.ClampToEdgeWrapping && t.repeat.y !== 1) return false;
  if (t.repeat.x !== 1 || t.repeat.y !== 1 || t.offset.x !== 0 || t.offset.y !== 0 || t.rotation !== 0) return false;
  return true;
}

/**
 * @param {THREE.Object3D} root  model (createModel output)
 * @param {{partRe?: RegExp, lightRe?: RegExp, atlas?: boolean, max?: number}} [opts]
 */
export function buildRigProto(root, opts = {}) {
  const partRe = opts.partRe || RIG_RE;
  const lightRe = opts.lightRe || LIGHT_RE;
  const maxParts = Math.min(MAX_PARTS_BIG, opts.max || MAX_PARTS_BIG);
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const parts = {};
  const pivots = [new THREE.Vector3()];
  const names = ['_body'];
  const parent = [-1];
  const objPart = new Map();       // Object3D → part index
  const extras = [];
  const lightParts = new Set();
  const bbox = new THREE.Box3();

  const visible = (o) => { for (let p = o; p; p = p.parent) { if (!p.visible) return false; if (p === root) break; } return true; };
  const hasMesh = (o) => { let ok = false; o.traverse((c) => { if (!ok && c.isMesh && c.geometry && c.geometry.attributes.position) ok = true; }); return ok; };
  const nearestPart = (o) => { for (let p = o; p && p !== root; p = p.parent) { const i = objPart.get(p); if (i !== undefined) return i; } return 0; };

  // 1. allocate parts in pre-order (parents before children)
  root.traverse((o) => {
    if (o === root || !o.name || o.name.endsWith('_mesh') || !partRe.test(o.name)) return;
    if (!hasMesh(o)) return;
    const par = nearestPart(o.parent);
    if (names.length >= maxParts) { objPart.set(o, par); return; }
    let name = o.name;
    if (parts[name] !== undefined) {
      name = names[par] + '.' + o.name;             // qualified duplicate (horse_1.leg_fl)
      if (parts[name] !== undefined) { let k = 2; while (parts[name + '#' + k] !== undefined) k++; name = name + '#' + k; }
    }
    const idx = names.length;
    parts[name] = idx; names.push(name); parent.push(par);
    if (name === o.name && par) parts[names[par] + '.' + o.name] = idx;   // alias for the first of a repeated name
    _rel.multiplyMatrices(_inv, o.matrixWorld);
    pivots.push(new THREE.Vector3().setFromMatrixPosition(_rel));
    objPart.set(o, idx);
  });
  const partOf = (o) => nearestPart(o);

  // 2. gather meshes; atlas candidates first (we need the atlas layout before emitting uvs)
  const meshes = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    if (!visible(o)) {
      // hidden named meshes (e.g. ART's RV `window_glow`) are kept as toggleable extras
      if (o.name && /^(window_glow|light_)/.test(o.name)) extras.push({ mesh: o, part: partOf(o), material: Array.isArray(o.material) ? o.material[0] : o.material, name: o.name, hidden: true });
      return;
    }
    meshes.push(o);
  });
  const atlasMats = [];
  if (opts.atlas !== false) {
    for (const o of meshes) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (m && isAtlasable(m) && !atlasMats.includes(m.map)) atlasMats.push(m.map);
    }
  }
  const atlas = atlasMats.length ? buildAtlas(atlasMats) : null;

  const L0 = newLayer(!!atlas);                    // opaque (+ atlas uvs)
  const TL = new Map();                            // translucent layers by blending
  const getT = (m) => {
    const key = m.blending === THREE.AdditiveBlending ? 'add' : 'normal';
    let l = TL.get(key);
    if (!l) { l = newLayer(false); l.alpha = []; l.blending = key; l.side = THREE.FrontSide; TL.set(key, l); }
    if (m.side === THREE.DoubleSide) l.side = THREE.DoubleSide;
    return l;
  };

  for (const o of meshes) {
    const pi = partOf(o);
    const geo = o.geometry;
    const P = geo.attributes.position;
    let N = geo.attributes.normal;
    if (!N) { const g2 = geo.clone(); g2.computeVertexNormals(); N = g2.attributes.normal; }
    const C = geo.attributes.color;
    const UV = geo.attributes.uv;
    const idx = geo.index;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const groups = Array.isArray(o.material) && geo.groups.length ? geo.groups : [{ start: 0, count: idx ? idx.count : P.count, materialIndex: 0 }];
    _rel.multiplyMatrices(_inv, o.matrixWorld);
    _nm.getNormalMatrix(_rel);
    const flip = _rel.determinant() < 0;
    for (const gr of groups) {
      const m = mats[gr.materialIndex ?? 0] || mats[0];
      if (!m) continue;
      const emissiveOk = m.emissive && !m.map && !m.transparent && isLit(m);
      const cell = atlas && m.map ? atlas.cells.get(m.map) : null;
      let L = null;
      if (cell && UV) L = L0;
      else if (isBakeable(m) || emissiveOk || (m.isMeshBasicMaterial && !m.map && !m.transparent)) L = L0;
      else if (isTransBake(m)) L = getT(m);
      if (!L) { extras.push({ mesh: o, part: pi, material: m, name: o.name || '' }); continue; }
      const basic = m.isMeshBasicMaterial;
      const ek = m.emissive ? (m.emissiveIntensity ?? 1) : 0;
      if (cell) _e.setRGB(0, 0, 0);
      else if (basic) _e.copy(m.color); else if (m.emissive) _e.copy(m.emissive).multiplyScalar(ek); else _e.setRGB(0, 0, 0);
      if (pi && lightRe.test(names[pi].replace(/^.*\./, ''))) {
        // light parts: emission colour normalised; intensity fully driven by setEmit()
        if (_e.r + _e.g + _e.b < 0.05) _e.copy(m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.01 ? m.emissive : m.color);
        const mx = Math.max(_e.r, _e.g, _e.b, 1e-3); _e.multiplyScalar(1 / mx);
        lightParts.add(pi);
      }
      const pvt = pivots[pi];
      const end = Math.min(gr.start + gr.count, idx ? idx.count : P.count);
      const order = flip ? [0, 2, 1] : [0, 1, 2];
      for (let i = gr.start; i + 2 < end; i += 3) {
        for (const k of order) {
          const vi = idx ? idx.getX(i + k) : i + k;
          _v.fromBufferAttribute(P, vi).applyMatrix4(_rel);
          _n.fromBufferAttribute(N, vi).applyMatrix3(_nm).normalize();
          L.pos.push(_v.x, _v.y, _v.z); L.nrm.push(_n.x, _n.y, _n.z);
          if (L === L0) bbox.expandByPoint(_v);
          if (basic && !cell) _c.setRGB(0, 0, 0); else _c.copy(m.color);
          if (C && m.vertexColors) { _c.r *= C.getX(vi); _c.g *= C.getY(vi); _c.b *= C.getZ(vi); }
          L.col.push(_c.r, _c.g, _c.b);
          L.part.push(pi);
          L.piv.push(pvt.x, pvt.y, pvt.z);
          L.emit.push(_e.r, _e.g, _e.b);
          if (L.alpha) L.alpha.push(m.opacity ?? 1);
          if (L.uv) {
            if (cell) { const u = UV.getX(vi), w = UV.getY(vi); L.uv.push(cell.u0 + u * cell.du, cell.v0 + w * cell.dv); }
            else L.uv.push(atlas.white.u, atlas.white.v);
          }
        }
      }
    }
  }
  // named empties / anchors (vent, exhaust, spot, throw_point, nozzle_tip …) in model space at rest
  const anchors = {}, anchorPart = {}, anchorDir = {};
  root.traverse((o) => {
    if (o === root || !o.name || anchors[o.name]) return;
    _rel.multiplyMatrices(_inv, o.matrixWorld);
    anchors[o.name] = new THREE.Vector3().setFromMatrixPosition(_rel);
    anchorDir[o.name] = new THREE.Vector3(0, 0, 1).transformDirection(_rel);
    anchorPart[o.name] = objPart.has(o) ? objPart.get(o) : partOf(o.parent || o);
  });
  const geometry = toGeometry(L0);
  geometry.computeBoundingSphere();
  if (geometry.boundingSphere) geometry.boundingSphere.radius *= 1.6;
  const tlayers = [];
  for (const l of TL.values()) {
    if (!l.pos.length) continue;
    const g = toGeometry(l);
    g.computeBoundingSphere();
    if (g.boundingSphere) g.boundingSphere.radius *= 1.8;
    tlayers.push({ geometry: g, blending: l.blending, side: l.side });
    for (let i = 0; i < l.pos.length; i += 3) bbox.expandByPoint(_pv.set(l.pos[i], l.pos[i + 1], l.pos[i + 2]));
  }
  if (bbox.isEmpty()) bbox.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
  // part-local extents (useful for e.g. which way a gate arm points)
  const partBox = names.map(() => new THREE.Box3());
  for (const l of [L0, ...TL.values()]) for (let i = 0; i < l.part.length; i++) partBox[l.part[i]].expandByPoint(_pv.set(l.pos[i * 3], l.pos[i * 3 + 1], l.pos[i * 3 + 2]));
  const s = root.userData && root.userData.size;
  const size = s && s.w > 0 ? { w: s.w, h: s.h, l: s.l } : { w: bbox.max.x - bbox.min.x, h: bbox.max.y - bbox.min.y, l: bbox.max.z - bbox.min.z };
  const wheels = names.filter((n) => /^wheel_/.test(n));
  const hier = parent.some((p, i) => i > 0 && p > 0);
  const nParts = names.length;
  return {
    geometry, tlayers, parts, names, pivots, parent, hier, partBox, bbox, size, extras, lightParts, anchors, anchorPart, anchorDir, wheels,
    nParts, slots: nParts <= MAX_PARTS ? MAX_PARTS : MAX_PARTS_BIG, atlas: atlas ? atlas.texture : null,
    tris: L0.pos.length / 9 + tlayers.reduce((a, l) => a + l.geometry.attributes.position.count / 3, 0), userData: root.userData || {},
  };
}

function newLayer(uv) { return { pos: [], nrm: [], col: [], part: [], piv: [], emit: [], uv: uv ? [] : null, alpha: null }; }
function toGeometry(l) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(l.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(l.nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(l.col, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(l.part, 1));
  g.setAttribute('aPivot', new THREE.Float32BufferAttribute(l.piv, 3));
  g.setAttribute('aEmit', new THREE.Float32BufferAttribute(l.emit, 3));
  if (l.alpha) g.setAttribute('aAlpha', new THREE.Float32BufferAttribute(l.alpha, 1));
  if (l.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(l.uv, 2));
  return g;
}

// ── sign atlas: pack every opaque sign texture of a model into one canvas ───
function buildAtlas(textures) {
  const CW = 256, CH = 128, PAD = 3;
  const n = textures.length + 1;                   // +1 white cell
  const cols = Math.min(4, Math.ceil(Math.sqrt(n)));
  const rows = Math.ceil(n / cols);
  const W = cols * CW, H = rows * CH;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  const cells = new Map();
  textures.forEach((t, i) => {
    const cx = (i % cols) * CW, cy = Math.floor(i / cols) * CH;
    try { g.drawImage(t.image, cx, cy, CW, CH); } catch (e) { /* tainted/broken image → stays white */ }
    // uv (0,0) = bottom-left of the source image (flipY textures)
    cells.set(t, { u0: (cx + PAD) / W, du: (CW - PAD * 2) / W, v0: 1 - (cy + CH - PAD) / H, dv: (CH - PAD * 2) / H });
  });
  const wi = textures.length, wx = (wi % cols) * CW + CW / 2, wy = Math.floor(wi / cols) * CH + CH / 2;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = textures[0].colorSpace || THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { texture: tex, cells, white: { u: wx / W, v: 1 - wy / H } };
}

// ── shader patch ────────────────────────────────────────────────────────────
const head = (n, alpha) => /* glsl */`
attribute float aPart;
attribute vec3 aPivot;
attribute vec3 aEmit;
${alpha ? 'attribute float aAlpha;\nvarying float vRigA;' : ''}
uniform vec4 uRigQ[${n}];
uniform vec4 uRigO[${n}];
uniform vec4 uRigS[${n}];
varying vec3 vRigEmit;
vec3 rigRot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
`;
function makePatch(n, alpha) {
  return function patchRig(sh) {
    sh.uniforms.uRigQ = this.userData.uRigQ;
    sh.uniforms.uRigO = this.userData.uRigO;
    sh.uniforms.uRigS = this.userData.uRigS;
    sh.vertexShader = head(n, alpha) + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        int rigI = int(aPart + 0.5);
        vec4 rigQ = uRigQ[rigI];
        vec4 rigO = uRigO[rigI];
        vec4 rigS = uRigS[rigI];
        vec3 rigSs = sign(rigS.xyz) * max(abs(rigS.xyz), vec3(1e-4));
        objectNormal = rigRot(rigQ, objectNormal / rigSs);`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed = aPivot + rigRot(rigQ, (transformed - aPivot) * rigS.xyz) + rigO.xyz;
        vRigEmit = aEmit * rigO.w;${alpha ? '\n        vRigA = aAlpha * rigS.w;' : ''}`);
    let fs = 'varying vec3 vRigEmit;\n' + (alpha ? 'varying float vRigA;\n' : '') + sh.fragmentShader
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vRigEmit;');
    if (alpha) fs = fs.replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n diffuseColor.a *= vRigA;\n if (diffuseColor.a < 0.003) discard;');
    sh.fragmentShader = fs;
  };
}
// shadow depth material with the same rig (so lying peds / raised gates / hidden parts cast correct shadows)
function makeDepthPatch(n) {
  return function patchRigDepth(sh) {
    sh.uniforms.uRigQ = this.userData.uRigQ;
    sh.uniforms.uRigO = this.userData.uRigO;
    sh.uniforms.uRigS = this.userData.uRigS;
    sh.vertexShader = head(n, false) + sh.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        int rigI = int(aPart + 0.5);
        transformed = aPivot + rigRot(uRigQ[rigI], (transformed - aPivot) * uRigS[rigI].xyz) + uRigO[rigI].xyz;`);
  };
}

function makeUniforms(n = MAX_PARTS) {
  const q = [], o = [], s = [];
  for (let i = 0; i < n; i++) { q.push(new THREE.Vector4(0, 0, 0, 1)); o.push(new THREE.Vector4(0, 0, 0, 1)); s.push(new THREE.Vector4(1, 1, 1, 1)); }
  return { uRigQ: { value: q }, uRigO: { value: o }, uRigS: { value: s } };
}

export function createRigMaterial(uniforms = makeUniforms(), { slots = uniforms.uRigQ.value.length, map = null, translucent = false, blending = 'normal', side = THREE.FrontSide } = {}) {
  const m = translucent
    ? new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: false, transparent: true, depthWrite: false, side, blending: blending === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending })
    : new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, map });
  m.userData.uRigQ = uniforms.uRigQ; m.userData.uRigO = uniforms.uRigO; m.userData.uRigS = uniforms.uRigS;
  m.onBeforeCompile = makePatch(slots, translucent);
  const key = 'rig2_' + slots + (translucent ? '_t' : '');
  m.customProgramCacheKey = () => key;
  return m;
}
function createRigDepth(uniforms, slots) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.userData.uRigQ = uniforms.uRigQ; m.userData.uRigO = uniforms.uRigO; m.userData.uRigS = uniforms.uRigS;
  m.onBeforeCompile = makeDepthPatch(slots);
  const key = 'rigdepth2_' + slots;
  m.customProgramCacheKey = () => key;
  return m;
}

export class RigInstance {
  constructor(proto, { castShadow = true, receiveShadow = true, depthRig = false } = {}) {
    this.proto = proto;
    const slots = proto.slots || MAX_PARTS;
    this.u = makeUniforms(slots);
    this.material = createRigMaterial(this.u, { slots, map: proto.atlas || null });
    this.mesh = new THREE.Mesh(proto.geometry, this.material);
    this.mesh.castShadow = castShadow;
    this.mesh.receiveShadow = receiveShadow;
    if (depthRig) { this.depth = createRigDepth(this.u, slots); this.mesh.customDepthMaterial = this.depth; }
    for (const i of proto.lightParts) this.u.uRigO.value[i].w = 0;
    this.root = new THREE.Group();
    this.root.add(this.mesh);
    // local pose (only used for hierarchical composition)
    const n = proto.names.length;
    this.lq = []; this.lo = []; this.ls = [];
    for (let i = 0; i < n; i++) { this.lq.push(new THREE.Quaternion()); this.lo.push(new THREE.Vector3()); this.ls.push(new THREE.Vector3(1, 1, 1)); }
    this.dirty = false;
    this.partNodes = {};      // part idx → Group following the part (extras ride on these)
    this.partMat = null;      // composed matrices (lazy)
    // translucent layers
    this.tmeshes = [];
    for (const tl of proto.tlayers || []) {
      const mat = createRigMaterial(this.u, { slots, translucent: true, blending: tl.blending, side: tl.side });
      const tm = new THREE.Mesh(tl.geometry, mat);
      tm.castShadow = false; tm.receiveShadow = false; tm.renderOrder = tl.blending === 'add' ? 7 : 6;
      this.root.add(tm);
      this.tmeshes.push(tm);
    }
    // non-bakeable extras (textures / transparency / hidden named meshes): attached statically
    // (or to their part's follower node). Named ones get a per-instance material clone and are exposed as rig.named[name].
    this.named = {};
    for (const ex of proto.extras) {
      const mat = ex.name ? ex.material.clone() : ex.material;
      const m = new THREE.Mesh(ex.mesh.geometry, mat);
      const rel = new THREE.Matrix4();
      ex.mesh.updateMatrixWorld(true);
      let r = ex.mesh; while (r.parent) r = r.parent;
      rel.copy(r.matrixWorld).invert().multiply(ex.mesh.matrixWorld);
      rel.decompose(m.position, m.quaternion, m.scale);
      m.castShadow = castShadow && !mat.transparent && !ex.hidden;
      m.renderOrder = ex.mesh.renderOrder || 0;
      if (ex.hidden) m.visible = false;
      if (ex.name) { m.name = ex.name; if (!this.named[ex.name]) this.named[ex.name] = m; this._clones = (this._clones || []).concat(mat); }
      if (ex.part) this._node(ex.part).add(m); else this.root.add(m);
    }
    const commit = () => { if (this.dirty) this.commit(); };
    this.mesh.onBeforeRender = commit;
    this.mesh.onBeforeShadow = commit;
  }
  _node(i) {
    let g = this.partNodes[i];
    if (!g) { g = new THREE.Group(); g.matrixAutoUpdate = false; this.root.add(g); this.partNodes[i] = g; this.dirty = true; }
    return g;
  }
  idx(name) { return this.proto.parts[name]; }
  has(name) { return this.proto.parts[name] !== undefined; }
  get hierarchical() { return this.proto.hier || Object.keys(this.partNodes).length > 0; }
  // ── setters (fast path writes uniforms directly; hierarchical rigs compose in commit()) ──
  setRotIdx(i, q) {
    this.lq[i].copy(q);
    if (this.hierarchical) { this.dirty = true; return; }
    this.u.uRigQ.value[i].set(q.x, q.y, q.z, q.w);
  }
  setRot(name, q) { const i = this.proto.parts[name]; if (i !== undefined) this.setRotIdx(i, q); }
  setEuler(name, x, y, z, order = 'YXZ') { const i = this.proto.parts[name]; if (i === undefined) return; _q.setFromEuler(_eu.set(x, y, z, order)); this.setRotIdx(i, _q); }
  setOffsetIdx(i, x, y, z) {
    this.lo[i].set(x, y, z);
    if (this.hierarchical) { this.dirty = true; return; }
    const v = this.u.uRigO.value[i]; v.x = x; v.y = y; v.z = z;
  }
  setOffset(name, x, y, z) { const i = this.proto.parts[name]; if (i !== undefined) this.setOffsetIdx(i, x, y, z); }
  setScaleIdx(i, x, y = x, z = x) {
    this.ls[i].set(x, y, z);
    if (this.hierarchical) { this.dirty = true; return; }
    const v = this.u.uRigS.value[i]; v.x = x; v.y = y; v.z = z;
  }
  setScale(name, x, y = x, z = x) { const i = this.proto.parts[name]; if (i !== undefined) this.setScaleIdx(i, x, y, z); }
  setVisible(name, on) { const i = this.proto.parts[name]; if (i !== undefined) this.setScaleIdx(i, on ? 1 : 0, on ? 1 : 0, on ? 1 : 0); }
  setAlpha(name, a) { const i = this.proto.parts[name]; if (i !== undefined) this.u.uRigS.value[i].w = a; }
  setAlphaIdx(i, a) { this.u.uRigS.value[i].w = a; }
  setEmit(name, k) { const i = this.proto.parts[name]; if (i === undefined) return; this.u.uRigO.value[i].w = k; }
  setEmitIdx(i, k) { this.u.uRigO.value[i].w = k; }
  setEmitPrefix(prefix, k) { for (const [n, i] of Object.entries(this.proto.parts)) if (n.startsWith(prefix)) this.u.uRigO.value[i].w = k; }
  setEmitAll(k) { for (const v of this.u.uRigO.value) v.w = k; }
  tint(c) { this.material.color.copy(c); for (const t of this.tmeshes) t.material.color.copy(c); }
  /** Reset every part to its rest pose (rotation 0, offset 0, scale 1, alpha 1). Light parts go dark. */
  resetPose() {
    const n = this.proto.names.length;
    for (let i = 0; i < n; i++) {
      this.lq[i].identity(); this.lo[i].set(0, 0, 0); this.ls[i].set(1, 1, 1);
      this.u.uRigQ.value[i].set(0, 0, 0, 1);
      const o = this.u.uRigO.value[i]; o.x = o.y = o.z = 0; o.w = this.proto.lightParts.has(i) ? 0 : 1;
      this.u.uRigS.value[i].set(1, 1, 1, 1);
    }
    this.dirty = this.hierarchical;
  }
  /** Compose the hierarchy and write the uniforms (cheap; called automatically before drawing). */
  commit() {
    this.dirty = false;
    if (!this.hierarchical) return;
    const P = this.proto, n = P.names.length;
    if (!this.partMat) { this.partMat = []; for (let i = 0; i < n; i++) this.partMat.push(new THREE.Matrix4()); }
    const M = this.partMat;
    for (let i = 1; i < n; i++) {
      const piv = P.pivots[i];
      // local: T(piv + o) · R · S · T(−piv)
      _m1.compose(_t.copy(piv).add(this.lo[i]), this.lq[i], this.ls[i]);
      _m2.makeTranslation(-piv.x, -piv.y, -piv.z);
      _m1.multiply(_m2);
      const par = P.parent[i];
      if (par > 0) M[i].multiplyMatrices(M[par], _m1); else M[i].copy(_m1);
      // M = T(t)·R·S  → shader form: piv + R(S(v − piv)) + O  ⇒  O = t − piv + R·S·piv
      M[i].decompose(_t, _q, _s);
      this.u.uRigQ.value[i].set(_q.x, _q.y, _q.z, _q.w);
      const sv = this.u.uRigS.value[i]; sv.x = _s.x; sv.y = _s.y; sv.z = _s.z;
      _v.copy(piv).multiply(_s).applyQuaternion(_q);
      const ov = this.u.uRigO.value[i]; ov.x = _t.x - piv.x + _v.x; ov.y = _t.y - piv.y + _v.y; ov.z = _t.z - piv.z + _v.z;
      const node = this.partNodes[i];
      if (node) { node.matrix.copy(M[i]); node.matrixWorldNeedsUpdate = true; }
    }
  }
  /** Current model-space position of a rest-pose point that belongs to part `part` (name or index). */
  partPoint(part, local, out = new THREE.Vector3()) {
    const i = typeof part === 'number' ? part : this.proto.parts[part];
    out.copy(local);
    if (!i) return out;
    if (this.dirty) this.commit();
    const q = this.u.uRigQ.value[i], o = this.u.uRigO.value[i], s = this.u.uRigS.value[i];
    const piv = this.proto.pivots[i];
    _q.set(q.x, q.y, q.z, q.w);
    out.sub(piv).multiply(_s.set(s.x, s.y, s.z)).applyQuaternion(_q).add(piv);
    out.x += o.x; out.y += o.y; out.z += o.z;
    return out;
  }
  /** Current model-space direction of a rest-pose direction that belongs to part `part`. */
  partDir(part, local, out = new THREE.Vector3()) {
    const i = typeof part === 'number' ? part : this.proto.parts[part];
    out.copy(local);
    if (!i) return out;
    if (this.dirty) this.commit();
    const q = this.u.uRigQ.value[i];
    return out.applyQuaternion(_q.set(q.x, q.y, q.z, q.w));
  }
  /** Anchor (named empty, e.g. 'throw_point', 'nozzle_tip') at its current animated position, model space. */
  anchor(name, out = new THREE.Vector3()) {
    const a = this.proto.anchors[name];
    if (!a) return null;
    return this.partPoint(this.proto.anchorPart[name] || 0, a, out);
  }
  dispose() {
    this.material.dispose(); if (this.depth) this.depth.dispose();
    for (const t of this.tmeshes) t.material.dispose();
    if (this._clones) for (const m of this._clones) m.dispose();
  }
}
