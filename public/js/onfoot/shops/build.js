// ─────────────────────────────────────────────────────────────────────────────
// Shop-scene building blocks (Agent ONFOOT). Everything is baked with the asset Kit into merged,
// vertex-coloured meshes sharing the one matte material (1 draw call per Kit), in the same grounded
// low-poly look and palette as the assets.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Kit, signTexture, signPanel, fitText } from '../../assets/models/kit.js';
import { PAL, shade, mix } from '../../assets/palette.js';

export { Kit, PAL, shade, mix };

/** Single-sided room shell facing inward (camera can sit outside a wall and see in). */
export function room(k, { x0, x1, z0, z1, h = 4, floor = '#8f8b82', wall = '#cfc6b0', low = null, band = 1.0, skip = [], tile = null, ceiling = null }) {
  k.box(floor, [x1 - x0, 0.04, z1 - z0], [(x0 + x1) / 2, -0.02, (z0 + z1) / 2]);
  if (tile) {
    for (let x = x0; x < x1 - 1e-6; x += tile.size) for (let z = z0; z < z1 - 1e-6; z += tile.size) {
      const i = Math.round((x - x0) / tile.size), j = Math.round((z - z0) / tile.size);
      if ((i + j) % 2) k.rectY(tile.alt, 0.0, [x, Math.min(x1, x + tile.size)], [z, Math.min(z1, z + tile.size)], { off: 0.002 });
    }
  }
  const lo = low || shade(wall, 0.78);
  const W = (side, fn) => { if (!skip.includes(side)) fn(); };
  W('back', () => { k.rectZ(lo, z0, [x0, x1], [0, band], 1, { off: 0 }); k.rectZ(wall, z0, [x0, x1], [band, h], 1, { off: 0 }); });
  W('front', () => { k.rectZ(lo, z1, [x0, x1], [0, band], -1, { off: 0 }); k.rectZ(wall, z1, [x0, x1], [band, h], -1, { off: 0 }); });
  W('left', () => { k.rectX(lo, x0, [z0, z1], [0, band], 1, { off: 0 }); k.rectX(wall, x0, [z0, z1], [band, h], 1, { off: 0 }); });
  W('right', () => { k.rectX(lo, x1, [z0, z1], [0, band], -1, { off: 0 }); k.rectX(wall, x1, [z0, z1], [band, h], -1, { off: 0 }); });
  if (ceiling) k.rectY(ceiling, h, [x0, x1], [z0, z1], { off: 0, facing: [0, -1, 0] });
}

export function crate(k, pos = [0, 0, 0], rot = 0, [w, h, d] = [0.8, 0.55, 0.6], col = '#a8875e') {
  k.at(pos, [0, rot, 0], () => {
    k.box(col, [w, h, d], [0, 0, 0], { base: true });
    const dark = shade(col, 0.78);
    for (const y of [h * 0.33, h * 0.66]) for (const s of [1, -1]) k.rectZ(dark, s * (d / 2 + 0.001), [-w / 2, w / 2], [y - 0.012, y + 0.012], s, { off: 0.001 });
    for (const x of [-w / 2 + 0.04, w / 2 - 0.04]) for (const s of [1, -1]) k.rectZ('#5f6468', s * (d / 2 + 0.002), [x - 0.03, x + 0.03], [0, h], s, { off: 0.002 });
    k.box(shade(col, 1.1), [w + 0.02, 0.04, d + 0.02], [0, h, 0], { base: true });
  });
}

export function pallet(k, pos = [0, 0, 0], rot = 0, w = 1.2, d = 1.0) {
  k.at(pos, [0, rot, 0], () => {
    for (const x of [-w / 2 + 0.08, 0, w / 2 - 0.08]) k.box('#8a6a4a', [0.14, 0.1, d], [x, 0.0, 0], { base: true });
    for (let i = 0; i < 5; i++) k.box(i % 2 ? '#b5976f' : '#a8875e', [w, 0.03, 0.16], [0, 0.1, -d / 2 + 0.08 + i * (d - 0.16) / 4], { base: true });
  });
}

export function sack(k, pos = [0, 0, 0], rot = 0, col = '#d6c08a', label = '#7a5c40') {
  k.at(pos, [0, rot, 0], () => {
    k.box(col, [0.62, 0.22, 0.42], [0, 0, 0], { base: true, c: 0.06 });
    k.box(shade(col, 0.95), [0.5, 0.06, 0.34], [0, 0.22, 0], { base: true, c: 0.03 });
    k.rectY(label, 0.281, [-0.15, 0.15], [-0.08, 0.08], { off: 0.001 });
  });
}

export function jar(k, pos = [0, 0, 0], col = '#c8732a') {
  k.cyl('#e9e2cf', 0.07, 0.075, 0.03, [pos[0], pos[1], pos[2]], { base: true, seg: 7 });
  k.cyl(col, 0.075, 0.075, 0.14, [pos[0], pos[1] + 0.03, pos[2]], { base: true, seg: 7 });
  k.cyl('#d9b13a', 0.06, 0.06, 0.03, [pos[0], pos[1] + 0.17, pos[2]], { base: true, seg: 7 });
}

/** Simple steel shelving unit along X (w) with `levels`, filled by fill(k, x, y, z) per slot. */
export function shelving(k, x, z, w, d, h, levels, fill = null, col = '#5f6468', rot = 0) {
  k.at([x, 0, z], [0, rot, 0], () => {
    for (const sx of [-w / 2, w / 2]) for (const sz of [-d / 2, d / 2]) k.box(col, [0.05, h, 0.05], [sx, 0, sz], { base: true });
    for (let i = 0; i < levels; i++) {
      const y = 0.12 + i * (h - 0.2) / Math.max(1, levels - 1);
      k.box(shade(col, 1.25), [w, 0.035, d], [0, y, 0], { base: true });
      if (fill) fill(k, y + 0.035, i, w, d);
    }
  });
}

/** Canvas text sign → Mesh (one draw call, Lambert). */
export function textSign(key, text, w, h, { bg = '#efe6cf', fg = '#2b2622', px = 120, sub = null, subFg = null, border = null } = {}) {
  const tex = signTexture({
    key: 'onfoot_' + key, w: 512, h: Math.max(64, Math.round(512 * h / w)), bg,
    draw(c, W, H) {
      if (border) { c.strokeStyle = border; c.lineWidth = 14; c.strokeRect(7, 7, W - 14, H - 14); }
      c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
      fitText(c, text, W / 2, sub ? H * 0.42 : H / 2, W - 40, Math.min(px, H * 0.8));
      if (sub) { c.fillStyle = subFg || fg; fitText(c, sub, W / 2, H * 0.78, W - 60, H * 0.2, '800'); }
    },
  });
  return signPanel(tex, w, h, bg, 'sign_' + key);
}

/** Additive glow ring + soft column (pickup / target spot); one draw call, own material. */
export function glowSpot(color = '#ffd36a', r = 0.32, h = 0.9) {
  const g = new THREE.Group();
  const ringGeo = new THREE.RingGeometry(r * 0.72, r, 24); ringGeo.rotateX(-Math.PI / 2);
  const colGeo = new THREE.CylinderGeometry(r * 0.8, r * 0.95, h, 16, 1, true); colGeo.translate(0, h / 2, 0);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const colMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { c: { value: new THREE.Color(color) }, a: { value: 0.55 }, h: { value: h } },
    vertexShader: 'varying float vy; void main(){ vy = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 c; uniform float a; uniform float h; varying float vy; void main(){ float k = 1.0 - clamp(vy / h, 0.0, 1.0); gl_FragColor = vec4(c * a * k * k, 1.0); }',
  });
  const ring = new THREE.Mesh(ringGeo, mat); ring.position.y = 0.012; ring.renderOrder = 3;
  const col = new THREE.Mesh(colGeo, colMat); col.renderOrder = 3;
  g.add(ring, col);
  g.userData.set = (op) => { mat.opacity = 0.85 * op; colMat.uniforms.a.value = 0.55 * op; };
  g.userData.dispose = () => { ringGeo.dispose(); colGeo.dispose(); mat.dispose(); colMat.dispose(); };
  return g;
}

/** Standard rig: hemisphere + one shadowed sun covering `size` metres around `center`. */
export function lights(scene, { sky = '#e3ecf2', ground = '#8a7a62', hemi = 1.15, sun = 2.1, sunColor = '#fff1d8', dir = [-0.5, 1, 0.35], size = 18, center = [0, 0, 0], shadowRes = 1024 } = {}) {
  const h = new THREE.HemisphereLight(sky, ground, hemi);
  scene.add(h);
  const s = new THREE.DirectionalLight(sunColor, sun);
  const d = new THREE.Vector3(...dir).normalize();
  s.position.set(center[0] + d.x * 30, center[1] + d.y * 30, center[2] + d.z * 30);
  s.target.position.set(...center);
  s.castShadow = true;
  s.shadow.mapSize.set(shadowRes, shadowRes);
  const c = s.shadow.camera; c.left = -size; c.right = size; c.top = size; c.bottom = -size; c.near = 1; c.far = 80;
  s.shadow.bias = -0.0006; s.shadow.normalBias = 0.03;
  scene.add(s, s.target);
  return { hemi: h, sun: s };
}

/** Copper coil (orange torus stack), the junkyard prize. */
export function coil(k, pos = [0, 0, 0]) {
  k.at(pos, () => {
    for (let i = 0; i < 4; i++) k.torus(i % 2 ? '#c8642a' : '#e07a3a', 0.32, 0.07, [0, 0.08 + i * 0.11, 0], { rot: [Math.PI / 2, 0, 0], rs: 5, ts: 14 });
    k.cyl('#5a3a22', 0.18, 0.18, 0.5, [0, 0, 0], { base: true, seg: 8, open: true });
  });
}

/** Little "WET FLOOR" A-frame sign. */
export function wetSign(k, pos = [0, 0, 0], rot = 0) {
  k.at(pos, [0, rot, 0], () => {
    for (const s of [1, -1]) k.box('#e2b93b', [0.36, 0.62, 0.02], [0, 0.3, s * 0.1], { rot: [s * 0.18, 0, 0] });
    for (const s of [1, -1]) k.rectZ('#1f2022', s * 0.16, [-0.1, 0.1], [0.32, 0.42], s, { off: 0.0, rot: [s * 0.18, 0, 0] });
  });
}
