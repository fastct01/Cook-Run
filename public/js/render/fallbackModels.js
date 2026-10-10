// ─────────────────────────────────────────────────────────────────────────────
// Fallback low-poly models (used when assets/index.js is missing a kind or fails
// to load). Same conventions as ART's createModel: metres, origin at ground
// centre, front faces +Z, named children for animation, userData.size {w,h,l}.
// Deliberately simple; the renderer bakes them so draw calls stay low.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const MATS = new Map();
function mat(hex, opts = {}) {
  const key = hex + JSON.stringify(opts);
  let m = MATS.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: hex, flatShading: true, ...opts });
    MATS.set(key, m);
  }
  return m;
}
function emissive(hex, intensity = 1) { return mat(hex, { emissive: hex, emissiveIntensity: intensity }); }

const GEO = new Map();
function geo(key, make) { let g = GEO.get(key); if (!g) { g = make(); GEO.set(key, g); } return g; }
const boxG = (w, h, l) => geo(`b${w}|${h}|${l}`, () => new THREE.BoxGeometry(w, h, l));
const cylG = (rt, rb, h, s = 8) => geo(`c${rt}|${rb}|${h}|${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
const coneG = (r, h, s = 8) => geo(`k${r}|${h}|${s}`, () => new THREE.ConeGeometry(r, h, s));
const icoG = (r, d = 0) => geo(`i${r}|${d}`, () => new THREE.IcosahedronGeometry(r, d));
const dodG = (r) => geo(`d${r}`, () => new THREE.DodecahedronGeometry(r, 0));

function box(parent, w, h, l, color, x = 0, y = 0, z = 0, m = null) {
  const mesh = new THREE.Mesh(boxG(w, h, l), m || mat(color));
  mesh.position.set(x, y + h / 2, z);
  parent.add(mesh);
  return mesh;
}
function cyl(parent, r, h, color, x = 0, y = 0, z = 0, seg = 8, rt = null, m = null) {
  const mesh = new THREE.Mesh(cylG(rt ?? r, r, h, seg), m || mat(color));
  mesh.position.set(x, y + h / 2, z);
  parent.add(mesh);
  return mesh;
}
function finish(g, w, h, l) {
  g.userData.size = { w, h, l };
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
const pick = (arr, v) => arr[((v % arr.length) + arr.length) % arr.length];
const CIV = ['#c96f4a', '#6f8fb0', '#d6c08a', '#7e9b6e', '#b85c6a', '#8a8f99'];

// ── vehicles ───────────────────────────────────────────────────────────────
function wheel(g, name, x, z, r, w) {
  const p = new THREE.Group();
  p.name = name; p.position.set(x, r, z); p.rotation.order = 'YXZ';
  const t = new THREE.Mesh(cylG(r, r, w, 10), mat('#24262a'));
  t.rotation.z = Math.PI / 2; p.add(t);
  const hub = new THREE.Mesh(cylG(r * 0.5, r * 0.5, w + 0.02, 6), mat('#9a9c9e'));
  hub.rotation.z = Math.PI / 2; p.add(hub);
  g.add(p);
  return p;
}
function car({ w = 1.9, l = 4.5, h = 1.45, color = '#c96f4a', cabinL = 0.55, cabinOff = -0.05, cabinH = 0.55, r = 0.36, bed = false }) {
  const g = new THREE.Group();
  const bodyH = h - cabinH;
  box(g, w, bodyH - r * 0.6, l, color, 0, r * 0.6, 0);
  const cl = l * cabinL;
  box(g, w * 0.9, cabinH, cl, color, 0, bodyH, cabinOff * l);
  box(g, w * 0.92, cabinH * 0.7, cl * 0.92, '#2e3a40', 0, bodyH + cabinH * 0.12, cabinOff * l); // glass band
  box(g, w * 1.02, 0.18, 0.2, '#3a3d40', 0, r * 0.5, l / 2 - 0.05);   // bumpers
  box(g, w * 1.02, 0.18, 0.2, '#3a3d40', 0, r * 0.5, -l / 2 + 0.05);
  box(g, 0.35, 0.14, 0.05, '#f4ecd0', w / 2 - 0.3, bodyH - 0.35, l / 2 + 0.01, emissive('#f4ecd0', 0.4));
  box(g, 0.35, 0.14, 0.05, '#f4ecd0', -w / 2 + 0.3, bodyH - 0.35, l / 2 + 0.01, emissive('#f4ecd0', 0.4));
  box(g, 0.3, 0.12, 0.05, '#c23a2e', w / 2 - 0.25, bodyH - 0.35, -l / 2 - 0.01);
  box(g, 0.3, 0.12, 0.05, '#c23a2e', -w / 2 + 0.25, bodyH - 0.35, -l / 2 - 0.01);
  if (bed) box(g, w * 0.9, 0.12, l * 0.36, '#2b2c2e', 0, bodyH - 0.02, -l * 0.3);
  const ax = l * 0.34;
  wheel(g, 'wheel_fl', -w / 2 + 0.1, ax, r, 0.28);
  wheel(g, 'wheel_fr', w / 2 - 0.1, ax, r, 0.28);
  wheel(g, 'wheel_rl', -w / 2 + 0.1, -ax, r, 0.28);
  wheel(g, 'wheel_rr', w / 2 - 0.1, -ax, r, 0.28);
  return finish(g, w, h, l);
}
function cop(suv) {
  const g = suv
    ? car({ w: 2.05, l: 4.9, h: 1.85, color: '#1a2338', cabinL: 0.62, cabinOff: -0.08, cabinH: 0.7, r: 0.42 })
    : car({ w: 1.95, l: 4.8, h: 1.5, color: '#1f2a44', cabinL: 0.5, cabinOff: -0.05, cabinH: 0.52, r: 0.36 });
  const top = g.userData.size.h;
  box(g, 1.96, 0.5, 1.4, '#f1f1ee', 0, 0.5, 0.15); // white doors
  box(g, 1.2, 0.1, 0.32, '#2a2d30', 0, top, -0.1);
  const red = box(g, 0.5, 0.14, 0.3, '#d8433a', 0.32, top + 0.06, -0.1, new THREE.MeshLambertMaterial({ color: '#7a1d18', emissive: '#d8433a', emissiveIntensity: 0.25, flatShading: true }));
  red.name = 'light_red';
  const blue = box(g, 0.5, 0.14, 0.3, '#3a6fd8', -0.32, top + 0.06, -0.1, new THREE.MeshLambertMaterial({ color: '#1a2f6a', emissive: '#3a6fd8', emissiveIntensity: 0.25, flatShading: true }));
  blue.name = 'light_blue';
  g.userData.size.h = top + 0.2;
  return g;
}
function bigVehicle({ w, l, h, color, cab = '#c96f4a', bus = false }) {
  const g = new THREE.Group();
  const r = 0.5;
  if (bus) {
    box(g, w, h - r, l, color, 0, r * 0.6, 0);
    for (let i = 0; i < 5; i++) box(g, w + 0.02, 0.8, 1.6, '#2e3a40', 0, h - 1.4, -l / 2 + 1.6 + i * 1.9);
    box(g, w * 0.9, 0.9, 0.05, '#2e3a40', 0, h - 1.5, l / 2 + 0.01);
  } else {
    box(g, w, h * 0.55, 2.6, cab, 0, r, l / 2 - 1.3);
    box(g, w * 0.9, 0.7, 0.05, '#2e3a40', 0, r + h * 0.3, l / 2 + 0.01);
    box(g, w, h - r * 0.8, l - 3.0, color, 0, r * 0.8, -1.4);
  }
  wheel(g, 'wheel_fl', -w / 2 + 0.15, l / 2 - 1.6, r, 0.35);
  wheel(g, 'wheel_fr', w / 2 - 0.15, l / 2 - 1.6, r, 0.35);
  wheel(g, 'wheel_rl', -w / 2 + 0.15, -l / 2 + 1.8, r, 0.35);
  wheel(g, 'wheel_rr', w / 2 - 0.15, -l / 2 + 1.8, r, 0.35);
  return finish(g, w, h, l);
}
function tractor(v) {
  const g = new THREE.Group();
  box(g, 1.4, 1.0, 2.6, pick(['#b8432f', '#5f8a3a'], v), 0, 0.6, 0.4);
  box(g, 1.5, 1.2, 1.3, '#2e3a40', 0, 1.6, -0.5);
  box(g, 1.6, 0.08, 1.4, pick(['#b8432f', '#5f8a3a'], v), 0, 2.8, -0.5);
  cyl(g, 0.07, 0.8, '#333', 0.4, 1.6, 1.2);
  const fl = wheel(g, 'wheel_fl', -0.8, 1.1, 0.45, 0.3); const fr = wheel(g, 'wheel_fr', 0.8, 1.1, 0.45, 0.3);
  wheel(g, 'wheel_rl', -0.95, -0.7, 0.8, 0.5); wheel(g, 'wheel_rr', 0.95, -0.7, 0.8, 0.5);
  void fl; void fr;
  return finish(g, 2.2, 2.9, 4.2);
}

function rv() {
  const g = new THREE.Group();
  const W = 2.7, L = 8.6, H = 3.4, r = 0.5;
  const body = '#e9e2cf';
  box(g, W, 0.9, L, '#4f8f8a', 0, r * 0.7, 0);                 // teal lower band
  box(g, W, H - 1.25 - r * 0.7, L - 0.4, body, 0, 0.9 + r * 0.7, -0.2);
  box(g, W + 0.02, 0.1, L - 0.4, '#d9a83a', 0, 1.62, -0.2);      // pinstripe
  box(g, W * 0.98, 1.0, 1.6, body, 0, 0.9 + r * 0.7, L / 2 - 0.8); // cab nose
  box(g, W * 0.9, 0.75, 0.06, '#2e3a40', 0, 1.75, L / 2 + 0.01);  // windscreen
  box(g, W * 0.92, 0.9, 0.06, '#2e3a40', 0, 1.85, L / 2 - 1.6);
  box(g, 0.06, 0.9, 1.1, '#9c4a32', -W / 2 - 0.01, 0.9, 1.4).name = 'door';
  for (const s of [-1, 1]) {
    box(g, 0.05, 0.7, 1.4, '#2e3a40', s * (W / 2 + 0.01), 1.95, -0.6);
    box(g, 0.05, 0.7, 1.0, '#2e3a40', s * (W / 2 + 0.01), 1.95, -2.8);
  }
  const glow = box(g, 0.04, 0.6, 1.3, '#f08a3a', -(W / 2 + 0.035), 2.0, -0.6,
    new THREE.MeshLambertMaterial({ color: '#2e3a40', emissive: '#f08a3a', emissiveIntensity: 0.0, flatShading: true }));
  glow.name = 'window_glow';
  box(g, 1.2, 0.45, 1.2, '#d9d4c4', 0, H - 0.45, 0.6);            // AC box
  cyl(g, 0.12, 0.9, '#6b6f72', 0.7, H - 0.35, -2.4, 6);           // chimney
  const vent = new THREE.Object3D(); vent.name = 'vent'; vent.position.set(0.7, H + 0.6, -2.4); g.add(vent);
  box(g, 0.08, 2.4, 0.08, '#8a8f99', 0.9, 0.6, -L / 2 - 0.05);    // ladder rails
  box(g, 0.08, 2.4, 0.08, '#8a8f99', 0.5, 0.6, -L / 2 - 0.05);
  const tyre = new THREE.Mesh(cylG(0.45, 0.45, 0.25, 10), mat('#24262a'));
  tyre.rotation.x = Math.PI / 2; tyre.position.set(-0.5, 1.6, -L / 2 - 0.15); g.add(tyre);
  for (const s of [-1, 1]) {
    const bl = box(g, 0.3, 0.25, 0.05, '#7a1d18', s * (W / 2 - 0.3), 0.75, -L / 2 + 0.17,
      new THREE.MeshLambertMaterial({ color: '#7a1d18', emissive: '#e0352a', emissiveIntensity: 0.1, flatShading: true }));
    bl.name = s < 0 ? 'light_brake_l' : 'light_brake_r';
  }
  const ex = new THREE.Object3D(); ex.name = 'exhaust'; ex.position.set(0.8, 0.4, -L / 2 + 0.1); g.add(ex);
  wheel(g, 'wheel_fl', -W / 2 + 0.2, L / 2 - 1.5, r, 0.4);
  wheel(g, 'wheel_fr', W / 2 - 0.2, L / 2 - 1.5, r, 0.4);
  wheel(g, 'wheel_rl', -W / 2 + 0.2, -L / 2 + 1.6, r, 0.4);
  wheel(g, 'wheel_rr', W / 2 - 0.2, -L / 2 + 1.6, r, 0.4);
  return finish(g, W, H, L);
}

function heli() {
  const g = new THREE.Group();
  box(g, 1.8, 1.6, 3.6, '#1f2a44', 0, 0.6, 0);
  box(g, 1.6, 0.9, 1.2, '#2e3a40', 0, 1.0, 1.4);
  box(g, 0.4, 0.4, 4.2, '#1f2a44', 0, 1.5, -3.6);
  box(g, 0.1, 1.0, 0.6, '#f1f1ee', 0, 1.5, -5.6);
  box(g, 0.1, 0.1, 3.0, '#333', -0.7, 0, 0); box(g, 0.1, 0.1, 3.0, '#333', 0.7, 0, 0);
  const rotor = new THREE.Group(); rotor.name = 'rotor'; rotor.position.set(0, 2.35, 0);
  box(rotor, 0.3, 0.06, 10, '#2a2d30'); box(rotor, 10, 0.06, 0.3, '#2a2d30');
  g.add(rotor);
  const tr = new THREE.Group(); tr.name = 'tail_rotor'; tr.position.set(0.15, 1.7, -5.6);
  box(tr, 0.05, 1.6, 0.18, '#2a2d30', 0, -0.8); g.add(tr);
  const spot = new THREE.Object3D(); spot.name = 'spot'; spot.position.set(0, 0.4, 1.6); g.add(spot);
  return finish(g, 1.8, 2.4, 9);
}

function train() {
  const g = new THREE.Group();
  const loco = new THREE.Group(); loco.name = 'car_0';
  box(loco, 3.0, 3.6, 16, '#d9a83a', 0, 0.9, 0); box(loco, 3.05, 0.5, 16, '#9c4a32', 0, 2.2, 0);
  box(loco, 2.6, 0.8, 0.1, '#2e3a40', 0, 3.2, 8.01); g.add(loco);
  for (let i = 1; i <= 4; i++) {
    const c = new THREE.Group(); c.name = 'car_' + i; c.position.z = -i * 17;
    box(c, 3.0, 3.2, 16, pick(['#6f8fb0', '#8a8f99', '#9c4a32', '#7e9b6e'], i), 0, 0.9, 0);
    box(c, 2.8, 0.7, 16, '#3a3d40', 0, 0.3, 0); g.add(c);
  }
  return finish(g, 3, 4.5, 84);
}

// ── characters ───────────────────────────────────────────────────────────────
function person(shirt, pants, skin = '#d9a27c', extra) {
  const g = new THREE.Group();
  const body = new THREE.Group(); body.name = 'body'; g.add(body);
  for (const [name, x] of [['leg_l', 0.13], ['leg_r', -0.13]]) {
    const p = new THREE.Group(); p.name = name; p.position.set(x, 0.92, 0);
    box(p, 0.2, 0.9, 0.24, pants, 0, -0.9); box(p, 0.22, 0.12, 0.34, '#3a2f28', 0, -0.92, 0.04); g.add(p);
  }
  box(body, 0.56, 0.68, 0.32, shirt, 0, 0.9);
  for (const [name, x] of [['arm_l', 0.36], ['arm_r', -0.36]]) {
    const p = new THREE.Group(); p.name = name; p.position.set(x, 1.52, 0);
    box(p, 0.16, 0.62, 0.18, shirt, 0, -0.62); box(p, 0.16, 0.16, 0.16, skin, 0, -0.76); g.add(p);
  }
  const head = new THREE.Group(); head.name = 'head'; head.position.set(0, 1.6, 0);
  box(head, 0.4, 0.42, 0.4, skin, 0, 0); box(head, 0.42, 0.12, 0.42, '#3b2e25', 0, 0.36);
  g.add(head);
  if (extra) extra(g, head);
  return finish(g, 0.7, 2.05, 0.4);
}
function ped(v) {
  const shirts = ['#3a4a5e', '#d9a83a', '#c96f4a', '#e3e0d6', '#7e9b6e', '#e8c33a', '#b85c6a', '#6f8fb0'];
  const pants = ['#2b2f38', '#4a5a6e', '#8a7a5e', '#2b2f38', '#5a4a3e', '#3a3f48'];
  const skins = ['#d9a27c', '#b07a52', '#8a5a3a', '#e8bc96'];
  return person(pick(shirts, v), pick(pants, v * 7 + 1), pick(skins, v * 3 + 2));
}

// ── props & obstacles ─────────────────────────────────────────────────────────
function simple(fn, w, h, l) { const g = new THREE.Group(); fn(g); return finish(g, w, h, l); }
function cow() {
  return simple((g) => {
    box(g, 0.9, 0.85, 1.9, '#efe9df', 0, 0.75, 0);
    box(g, 0.92, 0.5, 0.6, '#2b2a28', 0, 0.95, -0.3); box(g, 0.6, 0.55, 0.6, '#efe9df', 0, 1.1, 1.1);
    box(g, 0.4, 0.25, 0.3, '#d9a0a0', 0, 1.05, 1.42);
    for (const [x, z] of [[0.3, 0.7], [-0.3, 0.7], [0.3, -0.7], [-0.3, -0.7]]) box(g, 0.18, 0.75, 0.18, '#2b2a28', x, 0, z);
  }, 0.9, 1.65, 2.0);
}
function treeRound(v) {
  return simple((g) => {
    cyl(g, 0.22, 2.0, '#6b4a33', 0, 0, 0, 6, 0.16);
    const c = new THREE.Mesh(icoG(1.9 + (v % 3) * 0.3, 0), mat(pick(['#6f8f4e', '#5f7f45', '#7f9a55'], v)));
    c.position.y = 3.4; c.scale.y = 0.9; g.add(c);
  }, 3.8, 5.2, 3.8);
}
function treeCity(v) {
  return simple((g) => {
    cyl(g, 0.15, 2.4, '#6b4a33', 0, 0, 0, 6);
    const c = new THREE.Mesh(icoG(1.3, 0), mat(pick(['#6d8a4a', '#5e7d48'], v))); c.position.y = 3.2; g.add(c);
    box(g, 1.2, 0.08, 1.2, '#5a5550', 0, 0, 0);
  }, 2.6, 4.5, 2.6);
}
function cactus(v, s = 1) {
  return simple((g) => {
    const c = pick(['#5f7f45', '#6d8a4a', '#567a4a'], v);
    cyl(g, 0.28 * s, 3.2 * s, c, 0, 0, 0, 7);
    if (v % 2 === 0) { box(g, 0.7 * s, 0.3 * s, 0.3 * s, c, 0.4 * s, 1.3 * s); cyl(g, 0.18 * s, 1.0 * s, c, 0.72 * s, 1.3 * s, 0, 6); }
    box(g, 0.6 * s, 0.26 * s, 0.26 * s, c, -0.35 * s, 1.9 * s); cyl(g, 0.16 * s, 0.8 * s, c, -0.62 * s, 1.9 * s, 0, 6);
  }, 1.6 * s, 3.2 * s, 0.6 * s);
}
function rockModel(r, color, v = 0) {
  return simple((g) => {
    const m = new THREE.Mesh(dodG(r), mat(color)); m.position.y = r * 0.6; m.scale.set(1.1, 0.75, 0.95);
    m.rotation.y = v; g.add(m);
  }, r * 2.2, r * 1.4, r * 1.9);
}
function building(v) {
  const hs = [12, 18, 9, 24, 14, 30];
  const ws = [12, 10, 14, 11, 16, 12];
  const cols = ['#b3a089', '#9a8b7a', '#c2b59e', '#8e8a84', '#a77f68', '#b9b2a2'];
  const h = pick(hs, v), w = pick(ws, v + 2), l = 12;
  return simple((g) => {
    const c = pick(cols, v);
    box(g, w, h, l, c, 0, 0, 0);
    box(g, w + 0.3, 0.5, l + 0.3, '#6e6a64', 0, h, 0);
    for (let f = 4; f < h - 1; f += 3.2) box(g, w * 0.86, 1.4, 0.06, '#3a4650', 0, f, l / 2 + 0.01);
    box(g, w * 0.9, 3.0, 0.08, pick(['#3a4650', '#6a4a3a', '#2e3a40'], v), 0, 0, l / 2 + 0.02);
    box(g, w + 0.2, 0.5, 1.2, pick(['#9c4a32', '#4f8f8a', '#d9a83a'], v), 0, 3.1, l / 2 + 0.6);
  }, w, h + 0.5, l);
}
function house(v) {
  const cols = ['#d8cbb0', '#b9c8c4', '#d6b9a0', '#c9c2a8', '#a9b8a0'];
  return simple((g) => {
    const c = pick(cols, v);
    box(g, 9, 3.4, 8, c, 0, 0, 0);
    const roof = new THREE.Mesh(geo('roof', () => { const s = new THREE.CylinderGeometry(1, 1, 1, 3); s.rotateZ(Math.PI / 2); return s; }), mat(pick(['#7a4a3a', '#5a5d62', '#8a5a40'], v)));
    roof.scale.set(9.6, 2.4, 5.0); roof.position.y = 4.4; roof.rotation.x = 0; g.add(roof);
    box(g, 1.1, 2.1, 0.1, '#6b4a33', 0, 0, 4.01);
    box(g, 1.6, 1.1, 0.08, '#3a4650', -2.8, 1.2, 4.01); box(g, 1.6, 1.1, 0.08, '#3a4650', 2.8, 1.2, 4.01);
    if (v % 2) box(g, 3.4, 2.6, 5, '#e3ddcf', 6, 0, 1.0);
  }, 12, 6, 8);
}
function fence(wood) {
  return simple((g) => {
    const c = wood ? '#8a6a4a' : '#ece9df';
    if (wood) { box(g, 6, 0.12, 0.1, c, 0, 0.5); box(g, 6, 0.12, 0.1, c, 0, 1.0); for (let i = -3; i <= 3; i += 3) box(g, 0.16, 1.2, 0.16, c, i, 0); }
    else { box(g, 6, 0.1, 0.06, c, 0, 0.6); for (let i = -2.85; i <= 2.9; i += 0.5) box(g, 0.1, 1.0, 0.05, c, i, 0); }
  }, 6, 1.2, 0.2);
}
function streetlight() {
  return simple((g) => {
    cyl(g, 0.1, 7, '#5a5d62', 0, 0, 0, 6);
    box(g, 0.12, 0.12, 2.2, '#5a5d62', 0, 6.9, 1.0);
    box(g, 0.5, 0.15, 0.8, '#f6e7b8', 0, 6.75, 2.0, emissive('#f6e7b8', 0.6));
  }, 0.5, 7.1, 2.4);
}
function trafficlight() {
  return simple((g) => {
    cyl(g, 0.12, 5.5, '#3b3f44', 0, 0, 0, 6);
    box(g, 0.12, 0.12, 4.0, '#3b3f44', 0, 5.4, 2.0);
    box(g, 0.45, 1.3, 0.4, '#2a2d30', 0, 4.3, 3.8);
    box(g, 0.3, 0.3, 0.05, '#d8433a', 0, 5.2, 4.01, emissive('#d8433a', 0.9));
    box(g, 0.3, 0.3, 0.05, '#e8b93a', 0, 4.8, 4.01, mat('#4a4030'));
    box(g, 0.3, 0.3, 0.05, '#4aa86a', 0, 4.4, 4.01, mat('#30443a'));
  }, 0.5, 5.6, 4.2);
}
function bench() {
  return simple((g) => { box(g, 1.8, 0.08, 0.5, '#8a6a4a', 0, 0.45); box(g, 1.8, 0.4, 0.06, '#8a6a4a', 0, 0.55, -0.22); box(g, 0.08, 0.45, 0.45, '#3a3d40', 0.8, 0); box(g, 0.08, 0.45, 0.45, '#3a3d40', -0.8, 0); }, 1.8, 1, 0.5);
}
function mailbox() { return simple((g) => { box(g, 0.1, 1.0, 0.1, '#6b4a33', 0, 0); box(g, 0.3, 0.3, 0.5, pick(['#3a6fd8', '#5a5d62', '#9c4a32'], 1), 0, 1.0); }, 0.3, 1.3, 0.5); }
function barn(v) {
  return simple((g) => {
    box(g, 12, 6, 16, pick(['#a8432f', '#9c4a32'], v), 0, 0, 0);
    const roof = new THREE.Mesh(geo('roof', () => { const s = new THREE.CylinderGeometry(1, 1, 1, 3); s.rotateZ(Math.PI / 2); return s; }), mat('#5a5d62'));
    roof.scale.set(17, 3.8, 7.4); roof.rotation.y = Math.PI / 2; roof.position.y = 7.6; g.add(roof);
    box(g, 4, 4.4, 0.1, '#ece9df', 0, 0, 8.01); box(g, 3.6, 4.0, 0.12, '#7a3020', 0, 0, 8.02);
  }, 12, 9.5, 16);
}
function silo() { return simple((g) => { cyl(g, 2.4, 12, '#c9c4b8', 0, 0, 0, 10); const d = new THREE.Mesh(geo('dome', () => new THREE.SphereGeometry(2.4, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2)), mat('#9a9c9e')); d.position.y = 12; g.add(d); }, 4.8, 14.4, 4.8); }
function windmill() {
  const g = new THREE.Group();
  for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) { const p = box(g, 0.12, 9, 0.12, '#8a8f99', x * 0.6, 0, z * 0.6); void p; }
  box(g, 0.4, 0.4, 1.0, '#8a8f99', 0, 9, 0);
  const b = new THREE.Group(); b.name = 'blades'; b.position.set(0, 9.2, 0.6);
  for (let i = 0; i < 8; i++) { const bl = new THREE.Mesh(boxG(0.35, 1.8, 0.04), mat('#d9d4c4')); bl.position.set(Math.sin(i * Math.PI / 4) * 1.1, Math.cos(i * Math.PI / 4) * 1.1, 0); bl.rotation.z = -i * Math.PI / 4; b.add(bl); }
  g.add(b);
  box(g, 0.05, 0.8, 1.6, '#9c4a32', 0, 8.8, -1.0);
  return finish(g, 3, 11.5, 2);
}
function powerpole() { return simple((g) => { cyl(g, 0.16, 9, '#6b4a33', 0, 0, 0, 6); box(g, 0.14, 0.14, 2.6, '#6b4a33', 0, 8.3); }, 0.4, 9, 2.6); }
function mesa(v) {
  return simple((g) => {
    const bands = ['#c4774a', '#b8704a', '#d29a68', '#a8603c'];
    let y = 0, r = 30 + (v % 3) * 8;
    for (let i = 0; i < 4; i++) {
      const h = 6 + (i % 2) * 3;
      const m = new THREE.Mesh(cylG(r * 0.96, r, h, 7), mat(pick(bands, i + v)));
      m.position.y = y + h / 2; m.rotation.y = v + i * 0.3; g.add(m);
      y += h; r *= 0.93;
    }
  }, 70, 30, 70);
}
function shack(v) { return simple((g) => { box(g, 4, 2.6, 3.4, pick(['#8a6a4a', '#9a8b7a'], v), 0, 0); box(g, 4.6, 0.15, 4.0, '#7a7d80', 0, 2.65); box(g, 0.9, 1.9, 0.06, '#4a3a2e', 0.6, 0, 1.71); }, 4.6, 2.8, 4); }
function billboard(v) {
  return simple((g) => {
    box(g, 0.25, 5, 0.25, '#5a5d62', -3, 0); box(g, 0.25, 5, 0.25, '#5a5d62', 3, 0);
    box(g, 8, 3.6, 0.2, pick(['#d9a83a', '#4f8f8a', '#9c4a32'], v), 0, 4.2);
    box(g, 7.0, 1.0, 0.05, '#f1ead8', 0, 5.4, 0.11); box(g, 4.2, 0.6, 0.05, '#22262a', -1.0, 4.5, 0.11);
  }, 8, 7.8, 0.4);
}
function canyonWall(v) {
  return simple((g) => {
    const cols = ['#b8603c', '#a8553a', '#c4774a', '#9c4a32'];
    for (let i = 0; i < 4; i++) {
      const h = 18 + ((v * 7 + i * 5) % 13);
      const m = new THREE.Mesh(boxG(6.5, 1, 9), mat(pick(cols, i + v)));
      m.scale.y = h; m.position.set(-9 + i * 6, h / 2, (i % 2) * 1.5); m.rotation.y = (i - 1.5) * 0.12; g.add(m);
    }
    box(g, 26, 2.5, 9, '#a8603c', 0, 0, -1);
  }, 26, 30, 10);
}
function warningSign() {
  return simple((g) => {
    box(g, 0.12, 2.2, 0.12, '#8a8f99', 0, 0);
    const d = new THREE.Mesh(boxG(1.2, 1.2, 0.06), mat('#e8a23a')); d.position.y = 2.4; d.rotation.z = Math.PI / 4; g.add(d);
  }, 1.7, 3.3, 0.2);
}
function store(kind) {
  return simple((g) => {
    if (kind === 'store_gas') {
      box(g, 12, 4, 7, '#e3ddcf', 0, 0, -4); box(g, 12.2, 0.8, 7.2, '#d9a83a', 0, 4, -4);
      box(g, 14, 0.6, 9, '#f1ead8', 0, 5, 5); box(g, 14.1, 0.25, 9.1, '#9c4a32', 0, 4.8, 5);
      for (const x of [-5, 5]) box(g, 0.4, 5, 0.4, '#d9d4c4', x, 0, 5);
      for (const x of [-2.5, 2.5]) box(g, 0.8, 1.6, 0.6, '#9c4a32', x, 0, 5);
      box(g, 10, 2.2, 0.08, '#3a4650', 0, 0.4, -0.45);
    } else if (kind === 'store_junkyard') {
      box(g, 8, 4, 6, '#8a8f99', 0, 0, -3);
      for (let i = -3; i <= 3; i++) box(g, 4.4, 2.6, 0.12, i % 2 ? '#7a6a5a' : '#6b6f72', i * 4.3, 0, 6);
      for (const [x, z, c] of [[-9, 0, '#c96f4a'], [9, -2, '#6f8fb0'], [6, 2, '#7e9b6e']]) { box(g, 4, 1.2, 1.9, c, x, 0, z); box(g, 3.6, 1.1, 1.8, '#9c4a32', x, 1.2, z); }
      box(g, 2, 7, 2, '#d9a83a', -5, 0, -5);
    } else if (kind === 'store_farm') {
      box(g, 16, 5, 9, '#b8804a', 0, 0, -2); box(g, 17, 0.5, 10, '#7a7d80', 0, 5, -2);
      box(g, 6, 3.6, 0.1, '#6b4a33', 0, 0, 2.55);
      for (const x of [-6, 6]) cyl(g, 0.8, 1.2, '#e1c46a', x, 0, 4, 8);
    } else if (kind === 'sell_point') {
      box(g, 18, 9, 0.6, '#ece9df', 0, 4, -6); for (const x of [-7, 7]) box(g, 0.6, 13, 0.6, '#6b6f72', x, 0, -6.4);
      box(g, 5, 3, 4, '#9c4a32', 0, 0, 6); box(g, 5.4, 0.3, 4.4, '#d9a83a', 0, 3, 6);
      for (let i = -3; i <= 3; i++) box(g, 0.1, 1.6, 0.1, '#5a5d62', i * 3, 0, 1);
    } else { // hardware
      box(g, 16, 5.5, 10, '#c2b59e', 0, 0, -1); box(g, 16.4, 1.6, 0.4, '#9c4a32', 0, 4.5, 4.2);
      box(g, 10, 2.6, 0.1, '#3a4650', 0, 0.3, 4.01); box(g, 2.4, 2.6, 0.12, '#6b4a33', 5.5, 0, 4.02);
    }
  }, 16, 8, 12);
}

const BUILDERS = {
  rv: () => rv(),
  cop: () => cop(false), cop_suv: () => cop(true), heli: () => heli(),
  sedan: (v) => car({ color: pick(CIV, v) }),
  hatch: (v) => car({ w: 1.8, l: 3.9, h: 1.5, color: pick(CIV, v + 2), cabinL: 0.6, cabinOff: -0.1, r: 0.34 }),
  van: (v) => car({ w: 2.0, l: 5.0, h: 2.2, color: pick(['#e3e0d6', '#8a8f99', '#6f8fb0'], v), cabinL: 0.82, cabinOff: -0.06, cabinH: 1.0, r: 0.38 }),
  pickup: (v) => car({ w: 2.0, l: 5.4, h: 1.8, color: pick(CIV, v + 4), cabinL: 0.34, cabinOff: 0.05, cabinH: 0.7, r: 0.42, bed: true }),
  rival: () => { const g = car({ w: 2.05, l: 5.4, h: 1.9, color: '#2b2c2e', cabinL: 0.34, cabinOff: 0.05, cabinH: 0.72, r: 0.45, bed: true }); box(g, 2.1, 0.12, 5.42, '#d8433a', 0, 0.95); return g; },
  bus: () => bigVehicle({ w: 2.6, l: 11, h: 3.2, color: '#d9a83a', bus: true }),
  truck: (v) => bigVehicle({ w: 2.6, l: 12, h: 3.8, color: pick(['#e3e0d6', '#8a8f99', '#9c4a32'], v), cab: pick(CIV, v) }),
  tractor: (v) => tractor(v),
  ped: (v) => ped(v),
  driver: () => person('#9c4a32', '#3a4a5e', '#d9a27c', (g, head) => { box(head, 0.46, 0.14, 0.5, '#4f8f8a', 0, 0.3, 0.04); box(head, 0.38, 0.08, 0.04, '#111', 0, 0.04, 0.21); }),
  cook: () => person('#e3e0d6', '#4a5a6e', '#e8bc96', (g, head) => { box(g, 0.5, 0.9, 0.06, '#e07a2a', 0, 0.75, 0.18); box(head, 0.36, 0.1, 0.04, '#9fd3c7', 0, 0.08, 0.21); }),
  cow: () => cow(),
  cone: () => simple((g) => { const c = new THREE.Mesh(coneG(0.25, 0.7, 8), mat('#e8742a')); c.position.y = 0.4; g.add(c); box(g, 0.5, 0.06, 0.5, '#e8742a', 0, 0); box(g, 0.0, 0, 0, '#fff'); }, 0.5, 0.75, 0.5),
  trashcan: () => simple((g) => { cyl(g, 0.38, 1.0, '#5a6a5a', 0, 0, 0, 8); cyl(g, 0.42, 0.08, '#4a5a4a', 0, 1.0, 0, 8); }, 0.8, 1.1, 0.8),
  mailbox: () => mailbox(), mailbox_deco: () => mailbox(),
  hydrant: () => simple((g) => { cyl(g, 0.2, 0.75, '#c23a2e', 0, 0, 0, 8); cyl(g, 0.12, 0.15, '#c23a2e', 0, 0.75, 0, 6); box(g, 0.55, 0.12, 0.12, '#c23a2e', 0, 0.45); }, 0.55, 0.9, 0.4),
  barrier: () => simple((g) => { box(g, 2.6, 0.35, 0.12, '#e8742a', 0, 0.75); box(g, 2.6, 0.12, 0.13, '#f1f1ee', 0, 0.85); box(g, 0.1, 0.9, 0.5, '#5a5d62', -1.1, 0); box(g, 0.1, 0.9, 0.5, '#5a5d62', 1.1, 0); }, 2.6, 1.1, 0.5),
  sprinkler: () => simple((g) => { cyl(g, 0.06, 0.3, '#5a5d62', 0, 0, 0, 6); cyl(g, 0.15, 0.06, '#2e6a3a', 0, 0.3, 0, 6); }, 0.3, 0.4, 0.3),
  hay: () => simple((g) => { const c = new THREE.Mesh(cylG(0.8, 0.8, 1.4, 10), mat('#d6b45a')); c.rotation.z = Math.PI / 2; c.position.y = 0.8; g.add(c); }, 1.4, 1.6, 1.6),
  tumbleweed: () => simple((g) => { const m = new THREE.Mesh(icoG(0.7, 1), mat('#a8875a', { wireframe: false })); m.position.y = 0.7; g.add(m); const m2 = new THREE.Mesh(icoG(0.55, 0), mat('#8a6a44')); m2.position.y = 0.7; m2.rotation.set(0.5, 0.3, 0.2); g.add(m2); }, 1.4, 1.4, 1.4),
  pothole: () => simple((g) => { const m = new THREE.Mesh(geo('ph', () => new THREE.CircleGeometry(0.9, 9).rotateX(-Math.PI / 2)), mat('#24262a')); m.position.y = 0.03; g.add(m); }, 1.8, 0.05, 1.8),
  sanddrift: () => simple((g) => { const m = new THREE.Mesh(geo('sd', () => new THREE.SphereGeometry(3, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2)), mat('#dcc095')); m.scale.set(1, 0.12, 0.7); g.add(m); }, 6, 0.4, 4.2),
  rock_small: (v) => rockModel(0.7, '#8a7e72', v),
  rock: (v) => rockModel(1.4, '#9a7e68', v),
  falling_rock: (v) => rockModel(1.5, '#a8603c', v),
  rock_big: (v) => rockModel(3.5 + (v % 3), pick(['#b07a58', '#a8603c', '#9a8b7a'], v), v),
  cactus_road: (v) => cactus(v, 0.55),
  cactus: (v) => cactus(v, 1 + (v % 3) * 0.25),
  spikes: () => simple((g) => { box(g, 5, 0.06, 0.4, '#2a2d30', 0, 0); for (let i = -2.3; i <= 2.3; i += 0.4) { const c = new THREE.Mesh(coneG(0.06, 0.18, 4), mat('#c9cbcc')); c.position.set(i, 0.15, 0); g.add(c); } }, 5, 0.2, 0.4),
  train: () => train(),
  crossing_gate: () => {
    const g = new THREE.Group();
    box(g, 0.25, 3.2, 0.25, '#e9e2cf', 0, 0); box(g, 0.6, 0.6, 0.4, '#2a2d30', 0, 0.6);
    const xs = new THREE.Mesh(boxG(1.4, 0.18, 0.04), mat('#f1f1ee')); xs.position.y = 3.0; xs.rotation.z = 0.6; g.add(xs);
    const xs2 = xs.clone(); xs2.rotation.z = -0.6; g.add(xs2);
    const arm = new THREE.Group(); arm.name = 'arm'; arm.position.set(0, 1.1, 0.3);
    for (let i = 0; i < 6; i++) box(arm, 1.0, 0.16, 0.12, i % 2 ? '#d8433a' : '#f1f1ee', 0.5 + i * 1.0, -0.08);
    g.add(arm);
    return finish(g, 6.5, 3.4, 0.6);
  },
  roadblock: () => simple((g) => { for (const x of [-3, 0, 3]) { box(g, 2.8, 0.3, 0.15, '#f1f1ee', x, 0.8); box(g, 2.8, 0.15, 0.16, '#d8433a', x, 0.85); box(g, 0.1, 1.0, 0.6, '#5a5d62', x - 1.2, 0); box(g, 0.1, 1.0, 0.6, '#5a5d62', x + 1.2, 0); } }, 9, 1.2, 0.6),
  smoke_cloud: () => simple((g) => { const m = new THREE.Mesh(icoG(2, 1), mat('#cfd2d0')); m.position.y = 1.5; g.add(m); }, 4, 3, 4),
  oil_slick: () => simple((g) => { const m = new THREE.Mesh(geo('oil', () => new THREE.CircleGeometry(2, 10).rotateX(-Math.PI / 2)), mat('#111')); m.position.y = 0.03; g.add(m); }, 4, 0.05, 4),
  building: (v) => building(v),
  streetlight: () => streetlight(),
  trafficlight: () => trafficlight(),
  tree_city: (v) => treeCity(v),
  bench: () => bench(),
  house: (v) => house(v),
  tree_round: (v) => treeRound(v),
  fence: () => fence(false), fence_wood: () => fence(true),
  barn: (v) => barn(v), silo: () => silo(),
  farmhouse: (v) => house(v + 1),
  windmill: () => windmill(), powerpole: () => powerpole(),
  mesa: (v) => mesa(v), shack: (v) => shack(v), billboard: (v) => billboard(v),
  canyon_wall: (v) => canyonWall(v), warning_sign: () => warningSign(),
  store_hardware: () => store('store_hardware'), store_gas: () => store('store_gas'),
  store_junkyard: () => store('store_junkyard'), store_farm: () => store('store_farm'),
  sell_point: () => store('sell_point'),
  bridge_ramp: () => simple((g) => { box(g, 8, 1, 50, '#8a8f99', 0, 0, 25); }, 8, 8, 50),
  bridge_landing: () => simple((g) => { box(g, 8, 1, 28, '#8a8f99', 0, -1, 14); }, 8, 1, 28),
};

export const FALLBACK_KINDS = Object.keys(BUILDERS);
export function hasFallback(kind) { return kind in BUILDERS; }
export function createFallbackModel(kind, variant = 0) {
  const b = BUILDERS[kind];
  if (b) return b(variant | 0);
  // unknown kind: magenta-ish crate so it is obvious but not broken
  return simple((g) => box(g, 1, 1, 1, '#b85c6a'), 1, 1, 1);
}
