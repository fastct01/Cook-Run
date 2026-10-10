// ─────────────────────────────────────────────────────────────────────────────
// Shared 3D props for the van cook stations (Agent VANCOOK).
//
// Everything is built in ANCHOR space (see VAN_CONTRACT.md): origin at the front-centre
// edge of the counter top, +Y up, +Z toward Doc, +X = Doc's right. Counter top y = 0,
// usable x ∈ [−0.45, 0.45], z ∈ [−0.6, 0]; the hammer station's wall is the plane z = −0.6.
//
// Static parts go through the art kit (`Kit` → one merged vertex-coloured mesh with the
// shared matte material = one draw call). Moving parts are separate small meshes.
// The idle props (index.js buildIdleProps) and the presenters use the SAME builders and
// the SAME LAYOUT numbers, so swapping idle ↔ active is seamless.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Kit, HAS_DOM, hashStr, rng } from '../../assets/models/kit.js';
import { vcolMaterial, mix, shade } from '../../assets/palette.js';

// ── palette (VAN_CONTRACT interior palette + a few prop tones) ─────────────────
export const VC = Object.freeze({
  wood: '#8a6a4a', woodDark: '#5e4632', woodLight: '#b5976f', woodPale: '#c9ab80',
  cream: '#e2d8bf', creamDark: '#c9bd9f', paper: '#efe6cf',
  floor: '#3f6f6b',
  steel: '#9aa3a8', steelDark: '#5f666c', steelDeep: '#454c52', steelLight: '#c3c8c6',
  rust: '#9c4a32', rustDark: '#6a3820', mustard: '#d9a83a', teal: '#4f8f8a', tealDark: '#3a6e6a',
  product: '#7fd6c2',
  stone: '#a29c8f', stoneDark: '#7a756b', stoneLight: '#c2bcae',
  charcoal: '#2b2f33', ink: '#1d2023',
  glass: '#dcefea', rubber: '#e0702a', rubberDark: '#b4561d',
  good: '#8fb36a', bad: '#c7583e', ice: '#dff1f7', iceDark: '#b9dcea', water: '#9fc9d8',
});

/** Default ingredient colours/names (lab.json is the source of truth; these are fallbacks for idle props). */
export const INGREDIENT_DEFAULTS = Object.freeze({
  syrup: { name: 'Prickly Syrup', color: '#b4467a' },
  solvent: { name: 'Canyon Solvent', color: '#9fd3c7' },
  fuel: { name: 'Burner Gas', color: '#e07a3f' },
  salts: { name: 'Mesa Salts', color: '#e8e1cf' },
  ice: { name: 'Bag of Ice', color: '#cfe9f5' },
  catalyst: { name: 'Copper Coil', color: '#c46b3c' },
  scrap: { name: 'Scrap Metal', color: '#8d8f93' },
});

// ── layout (anchor space) — shared by idle props and presenters ────────────────
export const LAYOUT = Object.freeze({
  grind: { mortar: [0, 0, -0.3], jar: [0.27, 0, -0.44] },
  measure: {
    beaker: [-0.08, 0, -0.3],
    rack: [[0.15, 0, -0.47], [0.27, 0, -0.45], [0.38, 0, -0.38]],
    rackIds: ['syrup', 'solvent', 'fuel'],
  },
  stove: { stove: [-0.02, 0, -0.34] },
  cool: { sink: [0, 0, -0.31] },
  break: { tray: [-0.1, 0, -0.31], bags: [0.31, 0, -0.33], hammer: [-0.05, 0, -0.08] },
  hammer: { patch: [-0.08, 0.45, -0.6], board: [0.33, 0.47, -0.6] },
});

// ── shared materials (cached, never disposed, never mutated) ───────────────────
const _mats = new Map();
function cachedMat(key, make) { let m = _mats.get(key); if (!m) { m = make(); _mats.set(key, m); } return m; }
export const MAT = {
  vcol: () => vcolMaterial(),
  glass: () => cachedMat('glass', () => new THREE.MeshLambertMaterial({ color: VC.glass, transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide, name: 'VC_glass' })),
  glassEdge: () => cachedMat('glassEdge', () => new THREE.MeshLambertMaterial({ color: '#f4fbf8', transparent: true, opacity: 0.7, depthWrite: false, name: 'VC_glassEdge' })),
  shadow: () => cachedMat('shadow', () => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, name: 'VC_contactShadow' })),
  plastic: () => cachedMat('plastic', () => new THREE.MeshLambertMaterial({ color: '#eef6f3', transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, name: 'VC_bagPlastic' })),
  water: () => cachedMat('water', () => new THREE.MeshLambertMaterial({ color: VC.water, transparent: true, opacity: 0.55, depthWrite: false, flatShading: true, name: 'VC_iceWater' })),
  crystal: (color = VC.product) => cachedMat('crystal|' + color, () => new THREE.MeshStandardMaterial({
    color, roughness: 0.82, metalness: 0.05, flatShading: true, emissive: new THREE.Color(color).multiplyScalar(0.16), name: 'VC_crystal',
  })),
  crystalHot: (color = VC.product) => cachedMat('crystalHot|' + color, () => new THREE.MeshStandardMaterial({
    color: mix(color, '#ffffff', 0.25), roughness: 0.8, metalness: 0.05, flatShading: true, emissive: new THREE.Color(color).multiplyScalar(0.55), name: 'VC_crystalHot',
  })),
  glow: (color) => cachedMat('glow|' + color, () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, name: 'VC_glow' })),
  flat: (color) => cachedMat('flat|' + color, () => new THREE.MeshLambertMaterial({ color, flatShading: true, name: 'VC_flat' })),
  hitProxy: () => cachedMat('hit', () => new THREE.MeshBasicMaterial({ color: 0xff00ff, side: THREE.DoubleSide, name: 'VC_hitProxy' })),
};

/** Build one merged vertex-colour mesh from a Kit callback. */
export function kitMesh(name, build, { seed = 7, material, shadows = true } = {}) {
  const k = new Kit(seed);
  build(k);
  const m = k.mesh(name, material || vcolMaterial(), shadows);
  m.userData.ownGeometry = true;
  return m;
}

/** Invisible mesh that only exists for raycasts (drag planes, generous hit areas). */
export function hitProxy(geometry, name = 'hit') {
  const m = new THREE.Mesh(geometry, MAT.hitProxy());
  m.name = name;
  m.visible = false;          // three's Raycaster ignores visibility, so it still gets hit
  m.userData.hitProxy = true;
  m.userData.ownGeometry = true;
  return m;
}
/** Horizontal drag plane at height y (big, so drags never fall off it). */
export function dragPlaneY(y, size = 3, cx = 0, cz = 0) {
  const g = new THREE.PlaneGeometry(size, size); g.rotateX(-Math.PI / 2); g.translate(cx, y, cz);
  return hitProxy(g, 'dragPlane');
}

/** Soft contact shadows on the counter: list of [x, z, rx, rz, strength=0.3]. One draw call. */
export function contactShadows(list, y = 0.0015, name = 'contactShadow') {
  const pos = [], col = [];
  const seg = 14;
  for (const [x, z, rx, rz, a = 0.3] of list) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const ring = (ang, k) => [x + Math.cos(ang) * rx * k, y, z - Math.sin(ang) * rz * k];
      // inner disc (solid) + outer feather ring
      const c = [x, y, z], i0 = ring(a0, 0.6), i1 = ring(a1, 0.6), o0 = ring(a0, 1), o1 = ring(a1, 1);
      pos.push(...c, ...i0, ...i1); col.push(0, 0, 0, a, 0, 0, 0, a * 0.8, 0, 0, 0, a * 0.8);
      pos.push(...i0, ...o0, ...o1); col.push(0, 0, 0, a * 0.8, 0, 0, 0, 0, 0, 0, 0, 0);
      pos.push(...i0, ...o1, ...i1); col.push(0, 0, 0, a * 0.8, 0, 0, 0, 0, 0, 0, 0, a * 0.8);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, MAT.shadow());
  m.name = name;
  m.renderOrder = -1;
  m.userData.ownGeometry = true;
  return m;
}

/** Lathe geometry (not cached) with an optional per-vertex deform(x, y, z) → [x, y, z] (dents). */
export function latheGeometry(pts, seg, deform, phiStart = 0) {
  const g = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg, phiStart);
  if (deform) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const [x, y, z] = deform(p.getX(i), p.getY(i), p.getZ(i));
      p.setXYZ(i, x, y, z);
    }
  }
  return g;
}

/** Inward dents around a lathe: list of { a (rad around Y, 0 = +Z), y, r (radius of influence, m), d (depth, m) }. */
export function dents(list) {
  return (x, y, z) => {
    const rad = Math.hypot(x, z);
    if (rad < 1e-5) return [x, y, z];
    const ang = Math.atan2(x, z);
    let push = 0;
    for (const D of list) {
      let da = ang - D.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      const dist = Math.hypot(da * rad, y - D.y);
      if (dist < D.r) push += D.d * (1 - dist / D.r);
    }
    const k = Math.max(0.2, (rad - push) / rad);
    return [x * k, y, z * k];
  };
}

// ── dynamic liquid with a tilting top (beaker, ice tray) ───────────────────────
/**
 * Prism whose top face can tilt: footprint = circle (r, seg) or rect (w, d).
 * setTop(level, slopeX, slopeZ, maxY) sets top vertex heights = level + slopeX·x + slopeZ·z,
 * clamped to [0.0008, maxY]. Bottom at y = 0. One mesh, flat shaded.
 */
export class LiquidPrism {
  constructor(o, material) {
    this.foot = [];
    if (o.shape === 'rect') {
      const w = o.w / 2, d = o.d / 2;
      this.foot = [[-w, d], [w, d], [w, -d], [-w, -d]];
    } else {
      const seg = o.seg || 12;
      for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2 + (o.phi || 0); this.foot.push([Math.sin(a) * o.r, Math.cos(a) * o.r]); }
    }
    const n = this.foot.length;
    this.tris = (n - 2) + n * 2;            // top fan + side quads (bottom never visible)
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.tris * 9);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.name = o.name || 'liquid';
    this.mesh.userData.ownGeometry = true;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this._last = '';
    this.setTop(0.01, 0, 0, 1);
  }
  setTop(level, slopeX = 0, slopeZ = 0, maxY = 1) {
    const key = `${level.toFixed(4)}|${slopeX.toFixed(4)}|${slopeZ.toFixed(4)}|${maxY.toFixed(4)}`;
    if (key === this._last) return;
    this._last = key;
    const F = this.foot, n = F.length, P = this.pos;
    const top = F.map(([x, z]) => Math.min(maxY, Math.max(0.0008, level + slopeX * x + slopeZ * z)));
    let o = 0;
    const put = (x, y, z) => { P[o++] = x; P[o++] = y; P[o++] = z; };
    for (let i = 1; i < n - 1; i++) {        // top fan (CCW seen from above)
      put(F[0][0], top[0], F[0][1]); put(F[i + 1][0], top[i + 1], F[i + 1][1]); put(F[i][0], top[i], F[i][1]);
    }
    for (let i = 0; i < n; i++) {            // sides (outward)
      const j = (i + 1) % n;
      const [ax, az] = F[i], [bx, bz] = F[j];
      put(ax, 0, az); put(ax, top[i], az); put(bx, top[j], bz);
      put(ax, 0, az); put(bx, top[j], bz); put(bx, 0, bz);
    }
    // make sure every triangle faces outward/up (footprint winding can be either way)
    this._fixWinding();
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }
  _fixWinding() {
    const P = this.pos;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();
    for (let i = 0; i < P.length; i += 9) {
      a.fromArray(P, i); b.fromArray(P, i + 3); c.fromArray(P, i + 6);
      n.subVectors(b, a).cross(m.subVectors(c, a));
      const cx = (a.x + b.x + c.x) / 3, cz = (a.z + b.z + c.z) / 3;
      const top = Math.abs(a.y - b.y) + Math.abs(b.y - c.y) < 1e-6 ? true : (a.y > 0.0009 && b.y > 0.0009 && c.y > 0.0009);
      const out = top ? n.y : (n.x * cx + n.z * cz);
      if (out < 0) { for (let k = 0; k < 3; k++) { const t = P[i + 3 + k]; P[i + 3 + k] = P[i + 6 + k]; P[i + 6 + k] = t; } }
    }
  }
  dispose() { this.geo.dispose(); }
}

// ── canvas textures (cached per key; shared) ───────────────────────────────────
const _tex = new Map();
function canvasTex(key, w, h, draw) {
  if (!HAS_DOM) return null;
  let t = _tex.get(key);
  if (t) return t;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  draw(g, w, h);
  t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.name = key;
  _tex.set(key, t);
  return t;
}

const FONT = '"Arial Black","Arial Bold",Arial,Helvetica,sans-serif';

/** Bottle label (fictional names from lab.json). */
export function labelTexture(id, name, color) {
  return canvasTex(`label|${id}|${name}|${color}`, 384, 192, (g, w, h) => {
    const r = rng(hashStr(id));
    g.fillStyle = VC.paper; g.fillRect(0, 0, w, h);
    g.fillStyle = shade(color, 0.85); g.fillRect(0, 0, w, 34);
    g.fillStyle = VC.rust; g.fillRect(0, h - 26, w, 26);
    // icon
    g.save(); g.translate(58, 104);
    g.fillStyle = shade(color, 0.7);
    if (id === 'syrup') {         // little cactus
      g.fillRect(-9, -40, 18, 70); g.fillRect(-30, -16, 12, 26); g.fillRect(-30, -2, 22, 10); g.fillRect(18, -26, 12, 24); g.fillRect(8, -10, 22, 10);
    } else if (id === 'fuel') {   // flame
      g.beginPath(); g.moveTo(0, -42); g.bezierCurveTo(30, -10, 26, 34, 0, 36); g.bezierCurveTo(-26, 34, -30, -6, 0, -42); g.fill();
      g.fillStyle = VC.paper; g.beginPath(); g.moveTo(0, -6); g.bezierCurveTo(12, 8, 10, 28, 0, 28); g.bezierCurveTo(-10, 28, -12, 10, 0, -6); g.fill();
    } else {                      // drop
      g.beginPath(); g.moveTo(0, -42); g.bezierCurveTo(30, 0, 28, 36, 0, 36); g.bezierCurveTo(-28, 36, -30, 0, 0, -42); g.fill();
    }
    g.restore();
    // name (two lines)
    const words = String(name || id).toUpperCase().split(/\s+/);
    g.fillStyle = VC.ink; g.textAlign = 'left'; g.textBaseline = 'middle';
    const lines = words.length > 1 ? [words.slice(0, -1).join(' '), words[words.length - 1]] : [words[0]];
    lines.forEach((ln, i) => {
      let px = 40; do { g.font = `900 ${px}px ${FONT}`; px -= 2; } while (g.measureText(ln).width > w - 130 && px > 12);
      g.fillText(ln, 112, (lines.length === 1 ? 100 : 78 + i * 44));
    });
    g.font = `700 16px ${FONT}`; g.fillStyle = VC.paper;
    g.fillText(`No.${1 + Math.floor(r() * 9)}  •  DESERT SUPPLY CO.`, 14, h - 13);
    // grime
    for (let i = 0; i < 220; i++) { g.fillStyle = r() < 0.5 ? 'rgba(80,60,40,0.16)' : 'rgba(255,250,235,0.18)'; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
  });
}

/** Dial thermometer face: band + fire zone drawn from the heat step's numbers. */
export function gaugeTexture(p) {
  const { tMin, tMax, bandMin, bandMax, fireAt } = p;
  return canvasTex(`gauge|${tMin}|${tMax}|${bandMin}|${bandMax}|${fireAt}`, 256, 256, (g, w, h) => {
    const cx = w / 2, cy = h / 2, R = w * 0.47;
    g.fillStyle = '#efe7d2'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    const ang = (v) => (-225 + 270 * (v - tMin) / (tMax - tMin)) * Math.PI / 180;   // canvas angle (0 = +x, clockwise)
    const arc = (v0, v1, col, r0, r1) => {
      g.beginPath(); g.arc(cx, cy, R * r1, ang(v0), ang(v1)); g.arc(cx, cy, R * r0, ang(v1), ang(v0), true); g.closePath();
      g.fillStyle = col; g.fill();
    };
    arc(fireAt, tMax, '#c7583e', 0.62, 0.92);
    arc(bandMin, bandMax, '#6fa24a', 0.56, 0.92);
    // ticks
    g.strokeStyle = '#22262a'; g.lineCap = 'round';
    const step = (tMax - tMin) > 200 ? 20 : 10;
    for (let v = Math.ceil(tMin / step) * step; v <= tMax; v += step) {
      const a = ang(v), big = v % (step * 5) === 0;
      g.lineWidth = big ? 6 : 3;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * R * (big ? 0.66 : 0.76), cy + Math.sin(a) * R * (big ? 0.66 : 0.76)); g.lineTo(cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9); g.stroke();
      if (big) {
        g.fillStyle = '#22262a'; g.font = `900 22px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(v), cx + Math.cos(a) * R * 0.46, cy + Math.sin(a) * R * 0.46);
      }
    }
    g.fillStyle = '#9c4a32'; g.font = `900 20px ${FONT}`; g.textAlign = 'center';
    g.fillText('HEAT', cx, cy + R * 0.42);
    g.strokeStyle = '#3a3f44'; g.lineWidth = 8; g.beginPath(); g.arc(cx, cy, R - 4, 0, Math.PI * 2); g.stroke();
  });
}

/** Swirl texture for the stirred pot surface (alpha streaks). */
export function swirlTexture() {
  return canvasTex('swirl', 256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    g.lineCap = 'round';
    for (let arm = 0; arm < 3; arm++) {
      for (let i = 0; i < 60; i++) {
        const t = i / 60;
        const a = arm * (Math.PI * 2 / 3) + t * Math.PI * 2.2;
        const r = 10 + t * 112;
        const a2 = a + 0.12;
        g.strokeStyle = `rgba(255,255,255,${0.55 * (1 - t * 0.7)})`;
        g.lineWidth = 3 + t * 9;
        g.beginPath(); g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.lineTo(cx + Math.cos(a2) * (r + 2), cy + Math.sin(a2) * (r + 2)); g.stroke();
      }
    }
  });
}

/** Pegboard dots. */
export function pegboardTexture() {
  return canvasTex('pegboard', 128, 128, (g, w, h) => {
    g.fillStyle = '#b08a5c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#6e5133';
    for (let y = 8; y < h; y += 16) for (let x = 8; x < w; x += 16) { g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill(); }
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Station props
// ═════════════════════════════════════════════════════════════════════════════

// ── grind: stone mortar + pestle ──────────────────────────────────────────────
export const MORTAR = Object.freeze({ rimY: 0.112, innerR: 0.084, floorY: 0.036, outerR: 0.108 });
export function addMortar(k, [x, y, z]) {
  const prof = [[0, 0], [0.076, 0], [0.085, 0.012], [0.079, 0.024], [0.1, 0.052], [0.108, 0.088], [0.103, 0.11], [0.088, 0.114], [0.076, 0.084], [0.052, 0.05], [0.022, 0.037], [0, 0.035]];
  const g = latheGeometry(prof, 10, dents([{ a: 0.9, y: 0.07, r: 0.03, d: 0.004 }]));
  k.at([x, y, z], (kk) => {
    kk.geo(g, (cx, cy, cz, nx, ny, nz) => {
      const inner = nx * cx + nz * cz < 0;
      if (cy > 0.106 && ny > 0.3) return VC.stoneLight;
      if (inner) return cy < 0.06 ? shade(VC.stoneDark, 0.85) : VC.stoneDark;
      return cy < 0.03 ? VC.stoneDark : VC.stone;
    }, null, { jit: 0.1 });
    // chip in the rim + a band
    kk.cyl(shade(VC.stone, 0.92), 0.1, 0.101, 0.008, [0, 0.03, 0], { seg: 10 });
  });
  g.dispose();
}
export function makePestle(name = 'pestle') {
  return kitMesh(name, (k) => {
    const prof = [[0, 0], [0.019, 0.002], [0.026, 0.02], [0.024, 0.046], [0.015, 0.068], [0.012, 0.186], [0.015, 0.2], [0.012, 0.212], [0, 0.215]];
    k.lathe((cx, cy) => (cy < 0.07 ? (cy < 0.012 ? VC.stoneLight : VC.stone) : (cy > 0.19 ? VC.woodDark : VC.woodLight)), prof, 8, [0, 0, 0], { jit: 0.06 });
  }, { seed: 3 });
}
/** Resting pose of the pestle (leaning in the bowl) relative to the mortar origin. */
export function pestleRestPose(pestle, mortarPos) {
  pestle.position.set(mortarPos[0] - 0.035, mortarPos[1] + MORTAR.floorY + 0.006, mortarPos[2] + 0.01);
  pestle.quaternion.setFromAxisAngle(new THREE.Vector3(0.25, 0, 1).normalize(), -0.62);
}
export function addSaltJar(k, [x, y, z], color = INGREDIENT_DEFAULTS.salts.color) {
  k.at([x, y, z], (kk) => {
    kk.cyl(mix(VC.glass, color, 0.4), 0.038, 0.04, 0.09, [0, 0, 0], { base: true, seg: 8 });
    kk.cyl(shade(color, 0.92), 0.035, 0.037, 0.055, [0, 0.004, 0], { base: true, seg: 8 });
    kk.cyl(VC.rust, 0.04, 0.04, 0.022, [0, 0.09, 0], { base: true, seg: 8 });
  });
}
/** Label band for the salts jar (separate mesh: it carries a CanvasTexture). */
export function makeJarLabel([x, y, z], id = 'salts', name = INGREDIENT_DEFAULTS.salts.name, color = INGREDIENT_DEFAULTS.salts.color) {
  const tex = labelTexture(id, name, color);
  const g = new THREE.CylinderGeometry(0.0405, 0.0405, 0.042, 4, 1, true, -Math.PI / 2, Math.PI);
  g.translate(x, y + 0.052, z);
  const m = new THREE.Mesh(g, tex ? cachedMat('labelmat|' + tex.name, () => new THREE.MeshLambertMaterial({ map: tex, name: 'VC_label' })) : MAT.flat(VC.paper));
  m.name = 'jarLabel';
  m.userData.ownGeometry = true;
  return m;
}

// ── measure: graduated beaker + bottles ───────────────────────────────────────
export const BEAKER = Object.freeze({ R: 0.068, H: 0.2, innerR: 0.062, floor: 0.008 });
export function addBeakerSolid(k, [x, y, z]) {
  const { R, H } = BEAKER;
  k.at([x, y, z], (kk) => {
    kk.cyl(VC.steelLight, R + 0.004, R + 0.006, 0.008, [0, 0, 0], { base: true, seg: 12 });   // base ring
    kk.torus('#eef6f3', R + 0.002, 0.004, [0, H, 0], { rot: [Math.PI / 2, 0, 0], rs: 3, ts: 12 });  // rim
    // spout
    kk.box('#eef6f3', [0.02, 0.008, 0.016], [-R - 0.004, H + 0.002, 0], { rot: [0, 0, 0.3] });
    // graduations on the front (toward +Z), every 10 %
    for (let i = 1; i < 10; i++) {
      const yy = BEAKER.floor + (H - BEAKER.floor) * (i / 10);
      const big = i % 5 === 0;
      const w = big ? 0.034 : 0.018;
      const a = -0.55;                 // a bit to the left of centre so the pour doesn't hide it
      kk.box(big ? VC.ink : '#3a4247', [w, 0.0035, 0.002], [Math.sin(a) * (R + 0.001) + w / 2, yy, Math.cos(a) * (R + 0.001)], { rot: [0, a, 0] });
    }
  });
}
export function makeBeakerGlass() {
  const { R, H } = BEAKER;
  const g = new THREE.CylinderGeometry(R, R - 0.002, H, 14, 1, true);
  g.translate(0, H / 2, 0);
  const m = new THREE.Mesh(g, MAT.glass());
  m.name = 'beaker_glass';
  m.renderOrder = 6;
  m.userData.ownGeometry = true;
  return m;
}
export const BOTTLE = Object.freeze({ R: 0.04, neckTip: 0.232, H: 0.24 });
/** Bottle (origin at its base centre). Returns { group, body, label }. */
export function makeBottle(id, name, color) {
  const grp = new THREE.Group();
  grp.name = `bottle_${id}`;
  const R = BOTTLE.R;
  const tint = mix(color, '#2e3a40', 0.18);
  const body = kitMesh(`bottle_${id}_body`, (k) => {
    const prof = [[0, 0], [R * 0.9, 0], [R, 0.01], [R, 0.15], [R * 0.82, 0.175], [0.015, 0.195], [0.0135, 0.222], [0, 0.222]];
    k.lathe((cx, cy, cz, nx) => (cy > 0.15 && cy < 0.2 ? shade(tint, 1.08) : nx > 0.5 ? shade(tint, 1.05) : tint), prof, 8, [0, 0, 0], { phiStart: -Math.PI / 8 });
    k.cyl(VC.charcoal, 0.017, 0.017, 0.022, [0, 0.214, 0], { base: true, seg: 8 });            // cap
    k.cyl(VC.mustard, 0.0175, 0.0175, 0.005, [0, 0.214, 0], { base: true, seg: 8 });
  }, { seed: hashStr(id) % 97 });
  grp.add(body);
  let label = null;
  const tex = labelTexture(id, name, color);
  if (tex) {
    const lg = new THREE.CylinderGeometry(R * 1.012, R * 1.012, 0.072, 3, 1, true, -Math.PI * 3 / 8, Math.PI * 3 / 4);
    lg.translate(0, 0.085, 0);
    label = new THREE.Mesh(lg, cachedMat('labelmat|' + tex.name, () => new THREE.MeshLambertMaterial({ map: tex, name: 'VC_label' })));
    label.name = `bottle_${id}_label`;
    label.userData.ownGeometry = true;
    grp.add(label);
  }
  return { group: grp, body, label };
}

// ── stove + pot (heat / stir) ─────────────────────────────────────────────────
// Stove-local coords (origin = stove footprint centre on the counter).
export const STOVE = Object.freeze({
  w: 0.44, d: 0.34, h: 0.078,
  burner: [-0.06, 0.078, -0.005],
  potBase: [-0.06, 0.098, -0.005],
  panel: { x0: 0.06, x1: 0.21, zBack: 0.17, zFront: 0.255, yBack: 0.078, yFront: 0.022 },
  potR: 0.118, potRimY: 0.143, potInnerR: 0.106, liquidY: 0.092,
});
/** Knob pose in stove space: { pos: Vector3, quat: Quaternion } (local +Z = out of the sloped panel). */
export function knobPose() {
  const P = STOVE.panel;
  const dz = P.zBack - P.zFront, dy = P.yBack - P.yFront;
  const len = Math.hypot(dz, dy);
  const n = new THREE.Vector3(0, -dz / len, dy / len);         // (0, 0.83, 0.55)
  const X = new THREE.Vector3(1, 0, 0);
  const Y = new THREE.Vector3().crossVectors(n, X);              // up the slope
  const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, n));
  const pos = new THREE.Vector3((P.x0 + P.x1) / 2 + 0.002, (P.yBack + P.yFront) / 2, (P.zBack + P.zFront) / 2);
  return { pos, quat, normal: n, up: Y, right: X };
}
/** Knob angle (rad, about its local +Z) for a dial setting 0..1: 7:30 → 4:30 clockwise. */
export function knobAngle(d) { return (135 - 270 * d) * Math.PI / 180; }

export function addStove(k, [x, y, z], scale = null) {
  const S = STOVE, P = S.panel;
  k.at([x, y, z], (kk) => {
    // feet
    for (const [fx, fz] of [[-0.19, -0.14], [0.19, -0.14], [-0.19, 0.14], [0.19, 0.14]]) kk.box(VC.ink, [0.03, 0.008, 0.03], [fx, 0, fz], { base: true });
    // enamel body (teal camp stove) + dark top plate
    kk.box(VC.teal, [S.w, S.h - 0.02, S.d], [0, 0.008, 0], { base: true, c: 0.01 });
    kk.box(VC.charcoal, [S.w - 0.012, 0.014, S.d - 0.012], [0, S.h - 0.016, 0], { base: true, c: 0.004 });
    kk.box(shade(VC.teal, 1.12), [S.w + 0.004, 0.006, S.d + 0.004], [0, S.h - 0.024, 0], { base: true });   // lip
    // rust chips + dents (grime)
    kk.box(VC.rust, [0.03, 0.012, 0.002], [-0.15, 0.035, S.d / 2 + 0.001]);
    kk.box(VC.rustDark, [0.012, 0.008, 0.002], [-0.12, 0.024, S.d / 2 + 0.001]);
    kk.box(shade(VC.teal, 0.8), [0.05, 0.02, 0.002], [-0.02, 0.04, S.d / 2 + 0.001]);
    // burner + pot supports
    const [bx, by, bz] = S.burner;
    kk.cyl(VC.steelDeep, 0.058, 0.062, 0.012, [bx, by - 0.004, bz], { base: true, seg: 12 });
    kk.cyl(VC.steelDark, 0.04, 0.046, 0.01, [bx, by + 0.006, bz], { base: true, seg: 12 });
    kk.cyl(VC.ink, 0.022, 0.022, 0.004, [bx, by + 0.014, bz], { base: true, seg: 8 });
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      kk.box(VC.steelDeep, [0.012, 0.022, 0.08], [bx + Math.sin(a) * 0.1, by, bz + Math.cos(a) * 0.1], { base: true, rot: [0, a, 0] });
    }
    // sloped control panel at the front right
    const prof = [[P.zBack, 0.008], [P.zFront, 0.008], [P.zFront, P.yFront], [P.zBack, P.yBack]];
    kk.extrude(VC.charcoal, prof, P.x1 - P.x0, { axis: 'x', pos: [(P.x0 + P.x1) / 2, 0, 0] });
    kk.extrude(VC.teal, [[P.zBack - 0.002, 0.008], [P.zFront + 0.004, 0.008], [P.zFront + 0.004, 0.016], [P.zBack - 0.002, 0.016]], P.x1 - P.x0 + 0.01, { axis: 'x', pos: [(P.x0 + P.x1) / 2, 0, 0] });
    // knob scale ticks on the panel
    const kp = knobPose();
    for (let i = 0; i <= 10; i++) {
      const d = i / 10;
      const a = knobAngle(d) + Math.PI / 2;      // angle in the panel plane from +X
      let col = VC.cream;
      if (scale) { if (d >= scale.fire - 1e-6) col = VC.bad; else if (d >= scale.band[0] - 0.02 && d <= scale.band[1] + 0.02) col = VC.good; }
      const r0 = 0.035, r1 = i % 5 === 0 ? 0.047 : 0.043;
      const mid = (r0 + r1) / 2;
      const local = new THREE.Vector3(Math.cos(a) * mid, Math.sin(a) * mid, 0.0015).applyQuaternion(kp.quat).add(kp.pos);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a).premultiply(kp.quat);
      const e = new THREE.Euler().setFromQuaternion(q);
      kk.box(col, [r1 - r0, i % 5 === 0 ? 0.006 : 0.004, 0.003], [local.x, local.y, local.z], { rot: [e.x, e.y, e.z] });
    }
    // "GAS" plate
    const lp = new THREE.Vector3(-0.058, 0.0, 0.002).applyQuaternion(kp.quat).add(kp.pos);
    const le = new THREE.Euler().setFromQuaternion(kp.quat);
    kk.box(VC.mustard, [0.022, 0.05, 0.003], [lp.x, lp.y, lp.z], { rot: [le.x, le.y, le.z] });
    // gas hose to a little canister at the back left
    kk.cyl(VC.ink, 0.006, 0.006, 0.12, [-S.w / 2 - 0.05, 0.03, -0.08], { axis: 'x', seg: 6 });
    kk.cyl(VC.rubber, 0.045, 0.045, 0.14, [-S.w / 2 - 0.11 + 0.05, 0, -0.12], { base: true, seg: 10 });
    kk.cyl(VC.steelLight, 0.03, 0.045, 0.02, [-S.w / 2 - 0.11 + 0.05, 0.14, -0.12], { base: true, seg: 10 });
    kk.cyl(VC.steelDark, 0.012, 0.012, 0.02, [-S.w / 2 - 0.11 + 0.05, 0.16, -0.12], { base: true, seg: 6 });
    kk.box(VC.cream, [0.05, 0.05, 0.003], [-S.w / 2 - 0.06, 0.07, -0.12 + 0.045], { rot: [0, 0, 0] });
  });
}

/** The dented pot (static part). pos = pot base centre (anchor space). */
export function addPot(k, [x, y, z]) {
  const prof = [[0, 0], [0.1, 0], [0.112, 0.01], [0.116, 0.125], [0.121, 0.138], [0.123, 0.145], [0.116, 0.145], [0.109, 0.132], [0.105, 0.014], [0, 0.014]];
  const g = latheGeometry(prof, 12, dents([{ a: 0.5, y: 0.07, r: 0.04, d: 0.009 }, { a: -2.2, y: 0.1, r: 0.035, d: 0.007 }, { a: 2.6, y: 0.04, r: 0.03, d: 0.006 }]));
  k.at([x, y, z], (kk) => {
    kk.geo(g, (cx, cy, cz, nx, ny, nz) => {
      const inner = nx * cx + nz * cz < -1e-4;
      if (cy > 0.136) return VC.steelLight;
      if (inner) return cy < 0.03 ? VC.steelDeep : VC.steelDark;
      if (cy < 0.012) return VC.steelDeep;
      // scorch toward the bottom
      return cy < 0.035 ? shade(VC.steel, 0.72) : VC.steel;
    }, null, { jit: 0.07 });
    // side handles
    for (const s of [-1, 1]) {
      kk.box(VC.ink, [0.05, 0.014, 0.034], [s * 0.138, 0.112, 0], { c: 0.004 });
      kk.box(VC.steelDeep, [0.012, 0.03, 0.03], [s * 0.118, 0.105, 0]);
    }
  });
  g.dispose();
}
export function makeLid(name = 'lid') {
  return kitMesh(name, (k) => {
    k.lathe((cx, cy) => (cy > 0.02 ? VC.steelLight : VC.steel), [[0, 0.032], [0.03, 0.03], [0.09, 0.016], [0.126, 0.005], [0.127, 0], [0, 0]], 12, [0, 0, 0], {});
    k.cyl(VC.ink, 0.016, 0.02, 0.012, [0, 0.03, 0], { base: true, seg: 8 });
    k.box(VC.ink, [0.05, 0.012, 0.018], [0, 0.046, 0], { c: 0.004 });
  }, { seed: 11 });
}
export function makeKnob(name = 'knob') {
  return kitMesh(name, (k) => {
    // built along +Z (out of the panel): base disc, chunky body, grip ridge with a mustard pointer at +Y
    k.cyl(VC.steelDark, 0.033, 0.033, 0.006, [0, 0, 0.003], { axis: 'z', seg: 12 });
    k.cyl('#3a4045', 0.026, 0.03, 0.022, [0, 0, 0.017], { axis: 'z', seg: 10 });
    k.box('#2a2f33', [0.016, 0.054, 0.022], [0, 0, 0.034], { c: 0.004 });
    k.box(VC.mustard, [0.008, 0.02, 0.004], [0, 0.016, 0.0455]);
    k.box(VC.mustard, [0.005, 0.01, 0.003], [0, 0.029, 0.036]);
  }, { seed: 5 });
}
/** Dial thermometer (local +Z = face normal; origin at the face centre). */
export const GAUGE = Object.freeze({ R: 0.05 });
export function addGaugeBody(k) {
  k.cyl(VC.steelLight, GAUGE.R + 0.006, GAUGE.R + 0.006, 0.016, [0, 0, -0.006], { axis: 'z', seg: 14 });
  k.torus(VC.steelLight, GAUGE.R + 0.003, 0.004, [0, 0, 0.003], { rs: 3, ts: 14 });
  k.cyl(VC.steelDark, 0.008, 0.008, 0.03, [0, -0.045, -0.02], { rot: [0.5, 0, 0], seg: 6 });    // clip arm
}

/** Full stove assembly in anchor space. o = { lid: 'on'|'ajar'|'off', scale: {band:[d0,d1], fire}|null }. */
export function buildStoveSet(o = {}) {
  const grp = new THREE.Group();
  grp.name = 'stoveSet';
  const L = LAYOUT.stove.stove;
  const potBase = [L[0] + STOVE.potBase[0], L[1] + STOVE.potBase[1], L[2] + STOVE.potBase[2]];
  const lidMode = o.lid || 'on';
  const body = kitMesh('stove_static', (k) => {
    addStove(k, L, o.scale || null);
    addPot(k, potBase);
  }, { seed: 21 });
  grp.add(body);
  const kp = knobPose();
  const knobPivot = new THREE.Group();
  knobPivot.name = 'knobPivot';
  knobPivot.position.copy(kp.pos).add(new THREE.Vector3(...L));
  knobPivot.quaternion.copy(kp.quat);
  const knob = makeKnob();
  knob.rotation.z = knobAngle(0);
  knobPivot.add(knob);
  grp.add(knobPivot);
  const lid = makeLid();
  const lidPivot = new THREE.Group();
  lidPivot.name = 'lidPivot';
  lidPivot.add(lid);
  grp.add(lidPivot);
  const potTop = new THREE.Vector3(potBase[0], potBase[1] + STOVE.potRimY, potBase[2]);
  setLidMode(lidPivot, lidMode, potTop);
  const shadows = contactShadows([
    [L[0], L[2], 0.26, 0.21, 0.32],
    [L[0] - STOVE.w / 2 - 0.06, L[2] - 0.12, 0.06, 0.06, 0.3],
    ...(lidMode === 'off' ? [[L[0] - STOVE.w / 2 - 0.04, L[2] + 0.02, 0.05, 0.11, 0.25]] : []),
  ]);
  grp.add(shadows);
  return { group: grp, body, knob, knobPivot, lid, lidPivot, potBase: new THREE.Vector3(...potBase), potTop, shadows };
}
/** Lid pose for a mode without touching the pivot: { pos: Vector3, quat: Quaternion }. */
export function lidPose(mode, potTop) {
  const o = new THREE.Object3D();
  setLidMode(o, mode, potTop);
  return { pos: o.position.clone(), quat: o.quaternion.clone() };
}
export function setLidMode(lidPivot, mode, potTop) {
  lidPivot.rotation.set(0, 0, 0);
  if (mode === 'off') {
    // standing on the counter, leaning against the stove's left side, dome turned a bit toward Doc
    const L = LAYOUT.stove.stove;
    lidPivot.position.set(L[0] - STOVE.w / 2 - 0.04, 0.118, L[2] + 0.03);
    lidPivot.rotation.set(0, 0.45, 1.15);
  } else if (mode === 'ajar') {
    lidPivot.position.set(potTop.x - 0.045, potTop.y + 0.012, potTop.z - 0.02);
    lidPivot.rotation.set(-0.06, 0, 0.16);
  } else {
    lidPivot.position.copy(potTop);
  }
}

// ── cool: ice tub + tray ──────────────────────────────────────────────────────
export const SINK = Object.freeze({ w: 0.66, d: 0.4, h: 0.105, wall: 0.018, waterY: 0.078, trayY: 0.068, trayW: 0.36, trayD: 0.22, trayH: 0.042 });
export function addSink(k, [x, y, z], { ice = true } = {}) {
  const S = SINK;
  k.at([x, y, z], (kk) => {
    const w = S.w, d = S.d, h = S.h, t = S.wall;
    kk.box(VC.steelDark, [w, 0.012, d], [0, 0, 0], { base: true });                          // floor
    kk.box(VC.steel, [w, h, t], [0, 0, -d / 2 + t / 2], { base: true });                      // back
    kk.box(VC.steel, [w, h, t], [0, 0, d / 2 - t / 2], { base: true });                       // front
    kk.box(shade(VC.steel, 0.92), [t, h, d - 2 * t], [-w / 2 + t / 2, 0, 0], { base: true });  // left
    kk.box(shade(VC.steel, 1.06), [t, h, d - 2 * t], [w / 2 - t / 2, 0, 0], { base: true });   // right
    // rolled rim
    kk.box(VC.steelLight, [w + 0.012, 0.01, 0.014], [0, h, -d / 2 + 0.004], { base: true });
    kk.box(VC.steelLight, [w + 0.012, 0.01, 0.014], [0, h, d / 2 - 0.004], { base: true });
    kk.box(VC.steelLight, [0.014, 0.01, d], [-w / 2 + 0.004, h, 0], { base: true });
    kk.box(VC.steelLight, [0.014, 0.01, d], [w / 2 - 0.004, h, 0], { base: true });
    // inner darker walls
    kk.box(VC.steelDeep, [w - 2 * t, 0.002, d - 2 * t], [0, 0.012, 0], { base: true });
    // dents / drain plug / handles
    kk.box(VC.ink, [0.07, 0.016, 0.02], [-w / 2 - 0.012, h - 0.03, 0], { rot: [0, Math.PI / 2, 0], c: 0.004 });
    kk.box(VC.ink, [0.07, 0.016, 0.02], [w / 2 + 0.012, h - 0.03, 0], { rot: [0, Math.PI / 2, 0], c: 0.004 });
    kk.box(shade(VC.steel, 0.85), [0.09, 0.03, 0.002], [0.2, 0.05, d / 2 + 0.001], { rot: [0, 0, 0.1] });   // dent shadow
    if (ice) {
      // heaped ice around the tray well (cubes jittered), leaving the centre free
      const r = rng(41);
      const cubes = [];
      for (let i = 0; i < 70; i++) {
        let cx = (r() - 0.5) * (w - 0.07), cz = (r() - 0.5) * (d - 0.07);
        if (Math.abs(cx) < S.trayW / 2 + 0.01 && Math.abs(cz) < S.trayD / 2 + 0.01) { if (r() < 0.75) continue; cx = Math.sign(cx || 1) * (S.trayW / 2 + 0.03 + r() * 0.05); }
        cubes.push([cx, cz]);
      }
      cubes.forEach(([cx, cz], i) => {
        const s = 0.032 + r() * 0.02;
        const cy = 0.03 + r() * 0.05 + (Math.abs(cx) > w / 2 - 0.08 ? 0.012 : 0);
        kk.box(i % 3 === 0 ? VC.iceDark : VC.ice, [s, s * 0.9, s], [cx, cy, cz], { rot: [r() * 1.2, r() * 3, r() * 1.2], c: s * 0.18 });
      });
    }
  });
}
/** Tray (pivot origin = tray bottom centre). Moving part. */
export function makeTray(name = 'tray') {
  const S = SINK;
  return kitMesh(name, (k) => {
    const w = S.trayW, d = S.trayD, h = S.trayH, t = 0.008;
    k.box(VC.steelDark, [w, 0.006, d], [0, 0, 0], { base: true });
    k.box(VC.steel, [w, h, t], [0, 0, -d / 2 + t / 2], { base: true });
    k.box(VC.steel, [w, h, t], [0, 0, d / 2 - t / 2], { base: true });
    k.box(shade(VC.steel, 0.9), [t, h, d], [-w / 2 + t / 2, 0, 0], { base: true });
    k.box(shade(VC.steel, 1.08), [t, h, d], [w / 2 - t / 2, 0, 0], { base: true });
    k.box(VC.steelLight, [w + 0.01, 0.006, 0.012], [0, h, -d / 2], { base: true });
    k.box(VC.steelLight, [w + 0.01, 0.006, 0.012], [0, h, d / 2], { base: true });
    k.box(VC.steelLight, [0.012, 0.006, d + 0.01], [-w / 2, h, 0], { base: true });
    k.box(VC.steelLight, [0.012, 0.006, d + 0.01], [w / 2, h, 0], { base: true });
    // spirit level clamped on the BACK rim, vial facing Doc (body; vial + bubble are separate)
    const zl = -d / 2 + 0.002;
    k.box(VC.mustard, [0.25, 0.034, 0.03], [0, h + 0.002, zl], { base: true, c: 0.005 });
    k.box(shade(VC.mustard, 0.8), [0.03, 0.04, 0.016], [-0.09, h - 0.03, zl - 0.012], { base: true });
    k.box(shade(VC.mustard, 0.8), [0.03, 0.04, 0.016], [0.09, h - 0.03, zl - 0.012], { base: true });
    k.box('#c9dfa0', [0.17, 0.02, 0.004], [0, h + 0.019, zl + 0.0155]);                       // vial window
    k.box(VC.good, [0.034, 0.0215, 0.0045], [0, h + 0.019, zl + 0.0157]);                     // centre zone
    k.box(VC.ink, [0.0025, 0.0225, 0.005], [-0.017, h + 0.019, zl + 0.016]);
    k.box(VC.ink, [0.0025, 0.0225, 0.005], [0.017, h + 0.019, zl + 0.016]);
    k.box(VC.ink, [0.005, 0.022, 0.005], [-0.087, h + 0.019, zl + 0.016]);
    k.box(VC.ink, [0.005, 0.022, 0.005], [0.087, h + 0.019, zl + 0.016]);
  }, { seed: 9 });
}
/** Chunky orange rubber glove pressing down, seen from above: palm flat (origin at the palm centre),
 *  fingers spread toward −Z resting on the edge, short flared cuff toward +Z (Doc's wrist). */
export function makeGlove(name = 'glove') {
  return kitMesh(name, (k) => {
    k.box(VC.rubber, [0.072, 0.022, 0.058], [0, 0, 0], { c: 0.009 });
    k.box(shade(VC.rubber, 1.08), [0.06, 0.006, 0.03], [0, 0.011, -0.006], { c: 0.002 });           // knuckle ridge
    const fingers = [[-0.026, 0.036, 0.16], [-0.009, 0.044, 0.05], [0.009, 0.042, -0.04], [0.026, 0.034, -0.14]];
    for (const [x, len, yaw] of fingers) {
      const a = -0.28;                                    // tips dip onto the rim
      const cz = -0.027 - Math.cos(a) * len / 2, cy = Math.sin(a) * len / 2;
      k.box(VC.rubber, [0.015, 0.016, len], [x + Math.sin(yaw) * -len / 2, cy, cz], { c: 0.005, rot: [a, yaw, 0] });
    }
    k.box(VC.rubber, [0.017, 0.016, 0.036], [-0.044, -0.003, -0.012], { c: 0.005, rot: [-0.2, 0.75, 0] });    // thumb
    k.box(VC.rubber, [0.058, 0.024, 0.034], [0, 0.002, 0.04], { c: 0.008 });                                   // wrist
    k.cyl(VC.rubberDark, 0.034, 0.03, 0.022, [0, 0.006, 0.066], { axis: 'z', seg: 10 });                     // flared cuff
  }, { seed: 13 });
}

// ── break: tray + bags + small hammer ─────────────────────────────────────────
// Round baking pan; the slab is a crystal "pie" whose wedges are break.js's shard columns
// (shard x → angle around the pie, shard y → radius: y = 0 outer rim, y = 1 near the centre).
export const BREAK = Object.freeze({ panR: 0.18, slabR: 0.152, slabR0: 0.018, slabH: 0.034, slabY: 0.011 });
export function addBreakTray(k, [x, y, z]) {
  k.at([x, y, z], (kk) => {
    const prof = [[0, 0], [0.168, 0], [0.174, 0.004], [0.186, 0.024], [0.181, 0.026], [0.168, 0.01], [0, 0.009]];
    kk.lathe((cx, cy, cz, nx, ny) => (ny > 0.8 && cy < 0.012 ? VC.steelDark : cy > 0.022 ? VC.steelLight : VC.steel), prof, 16, [0, 0, 0], {});
    kk.cyl(VC.paper, 0.162, 0.162, 0.002, [0.004, 0.009, -0.003], { base: true, seg: 9, rot: [0, 0.2, 0] });     // parchment
    kk.box(shade(VC.steelDark, 0.8), [0.05, 0.002, 0.03], [0.12, 0.0095, 0.07], { base: true, rot: [0, 0.6, 0] });   // scorch
    // handles
    kk.box(VC.steelDeep, [0.05, 0.01, 0.03], [-0.205, 0.016, 0], { c: 0.003 });
    kk.box(VC.steelDeep, [0.05, 0.01, 0.03], [0.205, 0.016, 0], { c: 0.003 });
  });
}
/** Open zip pouch (origin at the bottom centre; mouth up). Returns { group, fill, plastic, shell, h } — fill is scaled in y. */
export function makeBag(name, color = VC.product) {
  const grp = new THREE.Group();
  grp.name = name;
  const w = 0.11, d = 0.055, h = 0.15;
  const shell = kitMesh(`${name}_trim`, (k) => {
    for (const sz of [-1, 1]) {
      k.box('#f4f1e8', [w + 0.004, 0.012, 0.004], [0, h - 0.012, sz * (d / 2 + 0.001)], { base: true });   // zip strips (open)
      k.box(VC.bad, [w + 0.004, 0.003, 0.005], [0, h - 0.016, sz * (d / 2 + 0.001)], { base: true });
    }
    k.box('#e6e1d4', [w + 0.002, 0.008, d * 0.6], [0, 0, 0], { base: true });                            // gusset base
    k.box('#4a4f55', [0.056, 0.005, 0.002], [-0.006, 0.08, d / 2 + 0.005], { rot: [0, 0, 0.06] });        // marker scrawl
    k.box('#4a4f55', [0.032, 0.004, 0.002], [0.004, 0.068, d / 2 + 0.005], { rot: [0, 0, -0.04] });
  }, { seed: 17 });
  grp.add(shell);
  // plastic: a box without its top face, pinched toward the bottom
  const pg = new THREE.BoxGeometry(w, h - 0.008, d, 1, 4, 1).toNonIndexed();
  const pos = pg.attributes.position;
  const keep = [];
  for (let i = 0; i < pos.count; i += 3) {
    const ys = [pos.getY(i), pos.getY(i + 1), pos.getY(i + 2)];
    if (ys.every((yy) => yy > (h - 0.008) / 2 - 1e-5)) continue;      // drop the top face → open mouth
    for (let j = 0; j < 3; j++) {
      const yy = pos.getY(i + j) + (h - 0.008) / 2;
      const t = yy / (h - 0.008);
      const zs = t < 0.12 ? 0.6 + t * 3.3 : 1 + Math.sin(t * Math.PI) * 0.12;
      keep.push(pos.getX(i + j) * (1 + Math.sin(t * Math.PI) * 0.04), yy + 0.004, pos.getZ(i + j) * zs);
    }
  }
  pg.dispose();
  const pg2 = new THREE.BufferGeometry();
  pg2.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  pg2.computeVertexNormals();
  const plastic = new THREE.Mesh(pg2, MAT.plastic());
  plastic.name = `${name}_plastic`;
  plastic.renderOrder = 7;
  plastic.userData.ownGeometry = true;
  grp.add(plastic);
  const fg = new THREE.BoxGeometry(w - 0.014, 1, d - 0.012); fg.translate(0, 0.5, 0);
  const fill = new THREE.Mesh(fg, MAT.crystal(color));
  fill.name = `${name}_fill`;
  fill.position.y = 0.006;
  fill.scale.y = 0.0001;
  fill.visible = false;
  fill.userData.ownGeometry = true;
  grp.add(fill);
  return { group: grp, fill, plastic, shell, h };
}
export function addRolledBags(k, [x, y, z]) {
  k.at([x, y, z], (kk) => {
    for (let i = 0; i < 3; i++) {
      kk.cyl('#ece7da', 0.018, 0.018, 0.1, [-0.02 + i * 0.012, 0.018 + i * 0.03, -0.02 + i * 0.015], { axis: 'x', seg: 7, rot: [0, 0.2 * i, 0] });
      kk.box(VC.bad, [0.004, 0.038, 0.038], [0.035 + i * 0.012, 0.018 + i * 0.03, -0.02 + i * 0.015], { rot: [0, 0.2 * i, 0] });
    }
  });
}
/** Small hammer for tapping crystal (origin at the grip end, head at +Y end, striking face −Z). */
export function makeSmallHammer(name = 'tapHammer') {
  return kitMesh(name, (k) => {
    k.box(VC.woodLight, [0.016, 0.17, 0.016], [0, 0.085, 0], { c: 0.004 });
    k.box(VC.woodDark, [0.018, 0.05, 0.018], [0, 0.02, 0], { c: 0.004 });
    k.box(VC.steelDeep, [0.026, 0.026, 0.07], [0, 0.17, -0.008], { c: 0.005 });
    k.box(VC.steelLight, [0.022, 0.022, 0.004], [0, 0.17, -0.044]);
  }, { seed: 19 });
}

// ── hammer: wall patch + tool board + claw hammer ─────────────────────────────
export const PATCH = Object.freeze({ W: 0.56, H: 0.325 });
export const PATCH_OUTLINE = Object.freeze([[-0.5, -0.46], [-0.12, -0.52], [0.3, -0.47], [0.52, -0.38], [0.5, 0.1], [0.47, 0.5], [0.05, 0.46], [-0.38, 0.52], [-0.52, 0.2]]);
/** Dented scrap patch plate, local XY plane facing +Z (origin = plate centre). */
export function makePatchPlate(name = 'patch') {
  const W = PATCH.W, H = PATCH.H;
  // grid inside the outline → dented surface
  const pts = [];
  for (const [u, v] of PATCH_OUTLINE) pts.push([u * W, -v * H]);
  const contour = pts.map((p) => new THREE.Vector2(p[0], p[1]));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const P = [];
  const dentZ = (x, y) => {
    let zz = 0;
    for (const [dx, dy, rr, dd] of [[-0.12, 0.04, 0.1, -0.007], [0.14, -0.06, 0.08, -0.006], [0.02, 0.08, 0.06, 0.004], [-0.2, -0.09, 0.07, -0.005], [0.18, 0.09, 0.05, -0.004]]) {
      const d = Math.hypot(x - dx, y - dy); if (d < rr) zz += dd * (1 - d / rr);
    }
    return zz;
  };
  // subdivide each triangle twice so dents show up in the flat shading
  const sub = (a, b, c, lvl) => {
    if (lvl === 0) { P.push(a, b, c); return; }
    const ab = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], bc = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2], ca = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2];
    sub(a, ab, ca, lvl - 1); sub(ab, b, bc, lvl - 1); sub(ca, bc, c, lvl - 1); sub(ab, bc, ca, lvl - 1);
  };
  for (const [i, j, kk] of tris) sub(pts[i], pts[j], pts[kk], 2);
  const k = new Kit(23);
  const arr = [];
  for (let i = 0; i < P.length; i += 3) {
    const tri = [P[i], P[i + 1], P[i + 2]].map(([x, y]) => [x, y, 0.004 + dentZ(x, y)]);
    // ensure +Z facing
    const ux = tri[1][0] - tri[0][0], uy = tri[1][1] - tri[0][1], vx = tri[2][0] - tri[0][0], vy = tri[2][1] - tri[0][1];
    if (ux * vy - uy * vx < 0) { const t = tri[1]; tri[1] = tri[2]; tri[2] = t; }
    arr.push(...tri[0], ...tri[1], ...tri[2]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  const rust = [[-0.17, -0.09, 0.08], [0.19, 0.1, 0.06], [0.23, -0.12, 0.045], [-0.24, 0.12, 0.035]];
  k.geo(g, (cx, cy) => {
    let f = 0;
    for (const [rx, ry, rr] of rust) f = Math.max(f, 1 - Math.hypot(cx - rx, cy - ry) / rr);
    // brushed scrap: two greys by height band, rust bleeding in near the spots
    const base = (Math.floor((cy + 0.3) * 18) % 2) ? '#8f9396' : '#878b8f';
    return f > 0 ? mix(base, f > 0.6 ? '#7a4a36' : '#94664f', Math.min(0.7, f * 1.3)) : base;
  }, null, { jit: 0.025 });
  g.dispose();
  // thick edge (rim) so it reads as a plate
  const ccx = pts.reduce((s2, p2) => s2 + p2[0], 0) / pts.length, ccy = pts.reduce((s2, p2) => s2 + p2[1], 0) / pts.length;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const mx = (a[0] + b[0]) / 2 - ccx, my = (a[1] + b[1]) / 2 - ccy;
    k.quad('#5c5f63', [a[0], a[1], -0.004], [b[0], b[1], -0.004], [b[0], b[1], 0.006 + dentZ(b[0], b[1])], [a[0], a[1], 0.006 + dentZ(a[0], a[1])], { off: 0, facing: [mx, my, 0] });
  }
  const m = k.mesh(name, vcolMaterial(), true);
  m.userData.ownGeometry = true;
  return m;
}
/** Hole in the hull peeking out from under the patch (dark jagged), local XY facing +Z. */
export function addHullHole(k, [x, y, z]) {
  // jagged hole, a bit bigger than the patch only at its lower-left and upper-right corners
  const r = rng(5);
  const pts = [];
  const N = 16;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const corner = Math.max(0, Math.cos(a - 3.75)) + Math.max(0, Math.cos(a - 0.6)) * 0.8;   // lower-left, upper-right
    const rr = (i % 2 ? 0.86 : 1) * (0.9 + r() * 0.15) * (1 + corner * 0.22);
    pts.push([x + Math.cos(a) * rr * 0.26, y + Math.sin(a) * rr * 0.15]);
  }
  k.front('#16181a', z, pts, 1, { off: 0 });
  // torn, bent-out lips at the corners that peek out
  for (const [a, len] of [[3.75, 0.05], [3.4, 0.035], [0.6, 0.045], [0.95, 0.03]]) {
    const px = x + Math.cos(a) * 0.3, py = y + Math.sin(a) * 0.18;
    k.poly(shade(VC.cream, 0.82), [[px - Math.sin(a) * 0.02, py + Math.cos(a) * 0.02, z + 0.001], [px + Math.sin(a) * 0.02, py - Math.cos(a) * 0.02, z + 0.001], [px + Math.cos(a) * len, py + Math.sin(a) * len, z + 0.018]], { facing: [0, 0, 1] });
  }
}
/** Pegboard + nail tin + scrap-sheet bracket. Wall station props (anchor space). */
export function addToolBoard(k, [x, y, z], { sheet = true, hammerHook = true } = {}) {
  k.at([x, y, z], (kk) => {
    kk.box(VC.woodDark, [0.17, 0.26, 0.012], [0, 0, 0.006]);                                   // board frame (pegboard face separate)
    // hooks
    for (const [hx, hy] of [[-0.05, 0.08], [0.05, 0.08], [0.0, -0.06]]) kk.cyl(VC.steelDark, 0.004, 0.004, 0.03, [hx, hy, 0.027], { axis: 'z', seg: 5 });
    // shelf + nail tin
    kk.box(VC.woodLight, [0.16, 0.012, 0.06], [0, -0.12, 0.035]);
    kk.cyl(VC.steel, 0.026, 0.026, 0.045, [0.04, -0.124, 0.04], { base: true, seg: 9 });
    kk.cyl(VC.steelDark, 0.022, 0.022, 0.004, [0.04, -0.08, 0.04], { base: true, seg: 9 });
    for (let i = 0; i < 5; i++) kk.cyl(VC.steelLight, 0.0018, 0.0018, 0.03, [0.03 + (i % 3) * 0.008, -0.07, 0.035 + (i % 2) * 0.01], { base: true, seg: 4, rot: [0.2 * (i - 2), 0, 0.15 * (i - 2)] });
    kk.box(VC.mustard, [0.03, 0.03, 0.03], [-0.045, -0.109, 0.04], { c: 0.004 });               // tape roll-ish block
    if (hammerHook) kk.box(VC.ink, [0.01, 0.01, 0.01], [-0.05, 0.08, 0.04]);
    if (sheet) {
      // spare scrap sheet held in a bracket under the board
      kk.box('#8d8f93', [0.17, 0.12, 0.006], [0, -0.26, 0.03], { rot: [0.08, 0, 0.04] });
      kk.box(VC.rust, [0.05, 0.03, 0.002], [0.04, -0.24, 0.035], { rot: [0.08, 0, 0.04] });
      kk.box(VC.steelDeep, [0.2, 0.02, 0.03], [0, -0.325, 0.03]);
    }
  });
}
export function makePegboardFace([x, y, z]) {
  const tex = pegboardTexture();
  const g = new THREE.PlaneGeometry(0.15, 0.24);
  if (tex) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.4, uv.getY(i) * 2.2); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; }
  const m = new THREE.Mesh(g, tex ? cachedMat('pegboard', () => new THREE.MeshLambertMaterial({ map: tex, name: 'VC_pegboard' })) : MAT.flat('#b08a5c'));
  m.position.set(x, y, z + 0.0125);
  m.name = 'pegboard';
  m.userData.ownGeometry = true;
  return m;
}
/** Claw hammer (origin at the grip end; handle along +Y; head at the top, striking face toward −Z). */
export function makeClawHammer(name = 'clawHammer') {
  return kitMesh(name, (k) => {
    k.box(VC.woodLight, [0.022, 0.24, 0.018], [0, 0.12, 0], { c: 0.005, taper: [0.85, 0.9] });
    k.box(VC.ink, [0.026, 0.07, 0.022], [0, 0.035, 0], { c: 0.005 });                           // rubber grip
    k.box(VC.steelDeep, [0.028, 0.03, 0.05], [0, 0.248, -0.02], { c: 0.005 });                  // head body
    k.cyl(VC.steelLight, 0.017, 0.017, 0.022, [0, 0.248, -0.05], { axis: 'z', seg: 8 });       // striking face
    k.box(VC.steelDeep, [0.022, 0.02, 0.06], [0, 0.252, 0.03], { rot: [-0.45, 0, 0], taper: [0.6, 0.8] });   // claw
  }, { seed: 29 });
}
