// ─────────────────────────────────────────────────────────────────────────────
// Procedural models for entity kinds the asset packs don't provide yet
// (`freight_wagon`), plus small canvas textures for entity decals
// (windshield paint splat, wet-glass sheen). Built in the base kit's style:
// flat-shaded Lambert, chunky boxes, rust and grime. Same conventions as
// createModel: origin at the ground centre, front +Z, wheels named wheel_*.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const MATS = new Map();
const mat = (c, extra) => { const k = c + JSON.stringify(extra || 0); let m = MATS.get(k); if (!m) { m = new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...(extra || {}) }); MATS.set(k, m); } return m; };
const GEO = new Map();
const geo = (k, f) => { let g = GEO.get(k); if (!g) { g = f(); GEO.set(k, g); } return g; };
function box(parent, w, h, l, color, x, y, z, ry = 0) {
  const m = new THREE.Mesh(geo('b' + w + h + l, () => new THREE.BoxGeometry(w, h, l)), mat(color));
  m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m;
}
function wheel(parent, name, x, y, z, r = 0.42) {
  const piv = new THREE.Object3D(); piv.name = name; piv.position.set(x, y, z); parent.add(piv);
  const m = new THREE.Mesh(geo('w' + r, () => new THREE.CylinderGeometry(r, r, 0.16, 12).rotateZ(Math.PI / 2)), mat('#2a2826'));
  m.name = name + '_mesh'; piv.add(m);
  const hub = new THREE.Mesh(geo('h' + r, () => new THREE.CylinderGeometry(r * 0.45, r * 0.45, 0.18, 8).rotateZ(Math.PI / 2)), mat('#8a8f99'));
  piv.add(hub);
  return piv;
}

/** Runaway freight wagon (v0 rust boxcar, v1 grey tank car, v2 open hopper). ~12 × 2.9 × 3.9 m. */
export function buildFreightWagon(variant = 0) {
  const g = new THREE.Group();
  const L = 12, W = 2.9;
  const body = new THREE.Group(); body.name = 'body'; g.add(body);
  // underframe + bogies
  box(body, W * 0.86, 0.35, L, '#2f2c29', 0, 1.05, 0);
  for (const z of [-L / 2 + 0.25, L / 2 - 0.25]) box(body, W * 0.9, 0.5, 0.35, '#3a3632', 0, 1.0, z);   // headstocks
  for (const s of [1, -1]) {
    box(body, 0.25, 0.25, 0.35, '#c9b062', 0, 1.0, s * (L / 2 + 0.15));                                // couplers
    for (const zz of [s * 3.9]) {
      box(body, W * 0.78, 0.38, 2.4, '#26231f', 0, 0.62, zz);                                           // bogie frame
      for (const dz of [-0.75, 0.75]) for (const side of [1, -1]) {
        const nm = 'wheel_' + (s > 0 ? 'f' : 'r') + (side > 0 ? 'l' : 'r') + (dz > 0 ? '' : '2');
        wheel(g, nm, side * 0.72, 0.42, zz + dz);
      }
    }
  }
  const v = ((variant | 0) % 3 + 3) % 3;
  if (v === 2) {
    // open-top hopper: slanted bays, ribbed sides, a heap of ore on top
    const c = '#5c5f63', dk = '#46494d';
    box(body, W, 1.9, L - 0.6, c, 0, 2.35, 0);
    for (let i = -5; i <= 5; i++) for (const s of [1, -1]) box(body, 0.08, 1.85, 0.14, dk, s * (W / 2 + 0.04), 2.35, i * 1.0);
    for (const z of [-3.6, 0, 3.6]) {
      const m = new THREE.Mesh(geo('hop', () => new THREE.ConeGeometry(1.3, 1.1, 4).rotateY(Math.PI / 4)), mat('#4b4e52'));
      m.position.set(0, 1.0, z); m.rotation.x = Math.PI; m.scale.set(1.3, 1, 1.2); body.add(m);
    }
    for (const z of [-3.6, 0, 3.6]) box(body, 2.3, 0.45, 3.2, '#7a5a3a', 0, 3.4, z);        // ore heaps
    box(body, 0.1, 0.4, 2.6, '#c9b062', 1.47, 2.9, -3.8); box(body, 0.1, 0.4, 2.6, '#c9b062', -1.47, 2.9, -3.8);
  } else if (v === 0) {
    // boxcar
    const c = '#8e3d2a', dk = '#6f2f21', rust = '#a2582f';
    box(body, W, 2.6, L, c, 0, 2.55, 0);
    box(body, W + 0.12, 0.22, L + 0.1, dk, 0, 3.92, 0);                       // roof
    box(body, 0.6, 0.06, L - 0.4, '#5a5048', 0, 4.06, 0);                    // running board
    for (let i = -5; i <= 5; i++) for (const s of [1, -1]) box(body, 0.06, 2.5, 0.12, dk, s * (W / 2 + 0.03), 2.55, i * 1.05);   // ribs
    for (const s of [1, -1]) {
      box(body, 0.08, 2.3, 2.2, '#7a3424', s * (W / 2 + 0.07), 2.5, 0.2);    // sliding door
      box(body, 0.1, 0.1, 2.6, '#3a3632', s * (W / 2 + 0.1), 3.7, 0.2);       // door rail
      box(body, 0.09, 0.5, 1.4, rust, s * (W / 2 + 0.05), 1.65, -3.6);         // rust patch
      box(body, 0.09, 0.32, 1.8, '#d9cfb3', s * (W / 2 + 0.05), 3.35, -3.4);   // faded reporting mark panel
      box(body, 0.1, 0.12, 1.5, '#22262a', s * (W / 2 + 0.07), 3.35, -3.4);
    }
    for (const s of [1, -1]) { box(body, 0.5, 2.2, 0.06, '#3a3632', 0.95, 2.5, s * (L / 2 + 0.04)); for (let k = 0; k < 6; k++) box(body, 0.45, 0.05, 0.12, '#5a5048', 0.95, 1.6 + k * 0.38, s * (L / 2 + 0.1)); }
  } else {
    // tank car
    const tank = new THREE.Mesh(geo('tank', () => new THREE.CylinderGeometry(1.35, 1.35, L - 1.2, 14).rotateX(Math.PI / 2)), mat('#3b3d40'));
    tank.position.set(0, 2.6, 0); body.add(tank);
    for (const s of [1, -1]) {
      const cap = new THREE.Mesh(geo('cap', () => new THREE.SphereGeometry(1.35, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2)), mat('#3b3d40'));
      cap.position.set(0, 2.6, s * (L / 2 - 0.6)); cap.scale.set(1, 1, 0.35); if (s < 0) cap.rotation.y = Math.PI; body.add(cap);
    }
    box(body, 1.0, 0.5, 1.0, '#2f3134', 0, 4.1, 0);                          // dome
    box(body, 2.0, 0.08, 1.6, '#5a5048', 0, 3.95, 0);                        // platform
    for (const z of [-3.5, 0, 3.5]) box(body, 2.85, 0.12, 0.1, '#26231f', 0, 2.6, z);  // bands
    box(body, 0.1, 0.4, 3.2, '#e8a23a', 1.37, 2.4, 2.2);                     // hazard stripe
    box(body, 0.1, 0.4, 3.2, '#e8a23a', -1.37, 2.4, 2.2);
    box(body, 0.1, 0.9, 2.2, '#5c4f42', 1.36, 1.95, -2.8);                   // grime
  }
  g.userData.size = { w: W, h: 4.1, l: L + 0.5 };
  g.userData.kind = 'freight_wagon';
  return g;
}

export const CUSTOM_BUILDERS = { freight_wagon: buildFreightWagon };

// ── decal textures ──────────────────────────────────────────────────────────
let _splatTex = null;
/** White paint-splat silhouette with a glossy highlight (tint with the material colour). */
export function splatTexture() {
  if (_splatTex) return _splatTex;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  let s = 99; const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s >>> 8) / 16777216; };
  g.fillStyle = '#ffffff'; g.beginPath();
  for (let i = 0; i <= 26; i++) { const a = (i / 26) * Math.PI * 2, r = 30 + rnd() * 16 + (i % 4 === 0 ? 14 : 0); g.lineTo(64 + Math.cos(a) * r, 60 + Math.sin(a) * r * 0.85); }
  g.fill();
  for (let i = 0; i < 12; i++) { const a = rnd() * Math.PI * 2, d = 48 + rnd() * 12; g.beginPath(); g.arc(64 + Math.cos(a) * d, 60 + Math.sin(a) * d * 0.85, 3 + rnd() * 5, 0, Math.PI * 2); g.fill(); }
  // drips running down
  for (let i = 0; i < 5; i++) { const x = 40 + rnd() * 48; g.fillRect(x - 3, 70, 6, 30 + rnd() * 26); g.beginPath(); g.arc(x, 100 + rnd() * 20, 5, 0, Math.PI * 2); g.fill(); }
  // subtle shading so it reads as wet paint
  const gr = g.createRadialGradient(54, 48, 2, 64, 60, 60);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(200,200,200,1)');
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = gr; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'source-over';
  _splatTex = new THREE.CanvasTexture(c); _splatTex.colorSpace = THREE.SRGBColorSpace;
  return _splatTex;
}

export const PAINT_COLORS = ['#c94f6d', '#3e9e9a', '#d9b13a', '#7b62a8'];   // = assets paint_balloon variants (magenta, teal, yellow, purple)
