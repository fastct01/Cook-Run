// ─────────────────────────────────────────────────────────────────────────────
// Round 3 · R3-ROOK pack — cop-car hit decals for the effects layer (PROPOSED, not wired).
// Shots hit the police CARS — tyres burst, windscreens crack, bodywork gets holed. No blood, no gore.
//   bullet_hole       v0 in painted steel (bare-metal chip ring), v1 in glass (frosted + star cracks)
//   windshield_crack  v0 one spider-web impact, v1 heavy (two impacts + a long run crack)
//   flat_tyre         v0 deflated (squashed, bulging sidewall), v1 shredded (tread flap torn off)
// Decals lie FLAT on y ≈ 0 facing +Y (pivot `decal` at the impact point, lifted 3 mm) and use one
// shared polygon-offset vertex-colour material: align +Y with the hit normal
// (decal.quaternion.setFromUnitVectors(UP, n)), random rotation about it, ~0.02 m off the surface.
// windshield_crack carries userData.mount = { cop, cop_suv }: RV-free placement on the windscreen
// (`car.getObjectByName('body').add(decal)` → position/rotation from the mount).
// flat_tyre: pivot `wheel` = axle (rim centre), sized for the cop / sedan wheel (r 0.34, w 0.24);
// fitFlatTyre(car, 'wheel_fl', model) swaps it in.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Kit, root, rng } from '../models/kit.js';
import { PAL, shade } from '../palette.js';
import { pivot } from './hazards-util.js';

const _mats = new Map();
/** Shared decal material: matte vertex colour + polygon offset (draws over the car surface). */
export function decalMaterial() {
  let m = _mats.get('decal');
  if (!m) {
    m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, name: 'CR_Decal_VCol' });
    _mats.set('decal', m);
  }
  return m;
}

const TAU = Math.PI * 2;
function jagged(cx, cz, r, n, jit, rand, a0 = 0) {
  const p = [];
  for (let i = 0; i < n; i++) { const a = a0 + (i / n) * TAU, rr = r * (1 - jit / 2 + rand() * jit); p.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]); }
  return p;
}
/** Tapered strip along a 2D polyline (x, z) on the plane y: crack lines. */
function strip(k, color, pts, w0, w1, y) {
  const n = pts.length;
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[Math.min(i + 1, n - 1)], o = pts[Math.max(i - 1, 0)];
    let dx = q[0] - o[0], dz = q[1] - o[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const w = (w0 + (w1 - w0) * (i / (n - 1))) / 2;
    L.push([p[0] - dz * w, p[1] + dx * w]); R.push([p[0] + dz * w, p[1] - dx * w]);
  }
  for (let i = 0; i < n - 1; i++) k.top(color, y, [L[i], L[i + 1], R[i + 1], R[i]], { off: 0 });
}
function decalRoot(kind, variant, k, size) {
  const g = root(kind, variant, size);
  const m = new THREE.Mesh(k.geometry(), decalMaterial());
  m.castShadow = false; m.receiveShadow = true; m.renderOrder = 2;
  g.add(pivot('decal', m, [0, 0.003, 0]));
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// bullet_hole — ~0.1 m across (stylised: readable at chase-cam range).
// ═════════════════════════════════════════════════════════════════════════════
export function buildBulletHole(variant = 0) {
  const glass = variant % 2 === 1;
  const k = new Kit(7700 + variant);
  const R = rng(91 + variant);
  if (!glass) {
    k.top('#b9bdc1', 0, jagged(0, 0, 0.046, 12, 0.5, R), { off: 0 });          // paint chipped to bare steel
    k.top('#878c92', 0.0004, jagged(0, 0, 0.029, 9, 0.25, R, 0.3), { off: 0 }); // dented rim
    k.top('#3a3b3e', 0.0008, jagged(0, 0, 0.019, 7, 0.2, R), { off: 0 });     // burnt edge
    k.top('#0a0a0b', 0.0012, jagged(0, 0, 0.012, 6, 0.15, R), { off: 0 });    // hole
    for (let i = 0; i < 4; i++) { const a = R() * TAU, d = 0.055 + R() * 0.02; k.top('#aeb2b6', 0, jagged(Math.cos(a) * d, Math.sin(a) * d, 0.008, 4, 0.5, R), { off: 0 }); }
  } else {
    k.top('#dfe9ee', 0, jagged(0, 0, 0.03, 10, 0.45, R), { off: 0 });
    k.top('#a7bcc5', 0.0004, jagged(0, 0, 0.017, 7, 0.3, R), { off: 0 });
    k.top('#0e1214', 0.0008, jagged(0, 0, 0.0085, 6, 0.2, R), { off: 0 });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + R() * 0.5, L = 0.06 + R() * 0.06, kink = (R() - 0.5) * 0.4;
      const p0 = [Math.cos(a) * 0.022, Math.sin(a) * 0.022], p1 = [Math.cos(a + kink) * L * 0.55, Math.sin(a + kink) * L * 0.55], p2 = [Math.cos(a - kink * 0.5) * L, Math.sin(a - kink * 0.5) * L];
      strip(k, '#e6eff2', [p0, p1, p2], 0.005, 0.0015, 0.0002);
    }
  }
  const g = decalRoot('bullet_hole', variant, k, { w: 0.2, h: 0.01, l: 0.2 });
  g.userData.style = glass ? 'glass' : 'metal';
  g.userData.decal = { facing: '+Y', note: 'Align +Y with the hit normal; place 0.01–0.02 m off the surface; random rotation.y.' };
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// windshield_crack — spider-web impacts: frosted centre, radial cracks with kinks, concentric
// ring cracks between the radials (some missing). v0 ~0.6 m, v1 ~1 m (two impacts + a run crack).
// ═════════════════════════════════════════════════════════════════════════════
/** Windscreen frames (car-local) for the cop sedan / police SUV: centre, outward normal, half extents. */
export const WINDSCREEN = Object.freeze({
  // vehicles.js buildCop: cabin front face (0.89, 0.86, 0.94) … (0.72, 1.38, 0.18); glass patch u 0.07–0.93, v 0.09–0.9, off 0.014
  cop: { centre: [0, 1.117, 0.564], normal: [0, 0.825, 0.565], halfW: 0.68, halfH: 0.37 },
});
function mountOn(name, dx = 0, dv = 0, lift = 0.016) {
  const W = WINDSCREEN[name];
  const n = new THREE.Vector3(...W.normal).normalize();
  const up = new THREE.Vector3(0, n.z, -n.y);           // in-plane "up the glass" (toward the roof)
  const p = new THREE.Vector3(...W.centre).addScaledVector(n, lift).addScaledVector(up, dv);
  p.x += dx;
  const rx = Math.atan2(n.z, n.y);                       // rotate +Y onto n about X
  return { pos: p.toArray().map((v) => +v.toFixed(3)), rot: [+rx.toFixed(4), 0, 0], parent: 'body' };
}

export function buildWindshieldCrack(variant = 0) {
  const heavy = variant % 2 === 1;
  const k = new Kit(7800 + variant);
  const R = rng(57 + variant * 13);
  const LINE = '#e9f1f3', LINE2 = '#c9d6db';
  const impacts = heavy ? [[0.06, -0.02, 1.0, 10], [-0.34, 0.12, 0.72, 8]] : [[0, 0, 1.0, 9]];
  let y = 0;
  for (const [cx, cz, s, n] of impacts) {
    k.top('#d5e2e7', y, jagged(cx, cz, 0.04 * s, 9, 0.5, R), { off: 0 });
    k.top('#f2f7f8', y + 0.0003, jagged(cx, cz, 0.022 * s, 7, 0.35, R), { off: 0 });
    k.top('#0f1416', y + 0.0006, jagged(cx, cz, 0.009 * s, 6, 0.2, R), { off: 0 });
    // radials
    const ang = [], len = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (R() - 0.5) * 0.45, L = (0.2 + R() * 0.13) * s;
      ang.push(a); len.push(L);
      const pts = [[cx + Math.cos(a) * 0.03 * s, cz + Math.sin(a) * 0.03 * s]];
      let aa = a;
      for (const f of [0.38, 0.7, 1.0]) { aa += (R() - 0.5) * 0.28; pts.push([cx + Math.cos(aa) * L * f, cz + Math.sin(aa) * L * f]); }
      strip(k, LINE, pts, 0.0075, 0.002, y + 0.0002);
    }
    // ring cracks between neighbouring radials (two radii, a few gaps)
    for (const [rr, w, skip] of [[0.075, 0.005, 0.15], [0.145, 0.004, 0.35]]) {
      for (let i = 0; i < n; i++) {
        if (R() < skip) continue;
        const a0 = ang[i], a1 = ang[(i + 1) % n] + (i === n - 1 ? TAU : 0);
        const r0 = rr * s * (0.9 + R() * 0.2), r1 = rr * s * (0.9 + R() * 0.2), am = (a0 + a1) / 2, rm = (r0 + r1) / 2 * 0.97;
        strip(k, LINE2, [[cx + Math.cos(a0) * r0, cz + Math.sin(a0) * r0], [cx + Math.cos(am) * rm, cz + Math.sin(am) * rm], [cx + Math.cos(a1) * r1, cz + Math.sin(a1) * r1]], w * s, w * s, y + 0.0001);
      }
    }
    y += 0.0008;
  }
  if (heavy) {
    // long run crack from the second impact out to the edge, and a branch
    const run = [[-0.34, 0.12], [-0.12, 0.16], [0.1, 0.13], [0.28, 0.2], [0.48, 0.17]];
    strip(k, LINE, run, 0.006, 0.0025, 0.0004);
    strip(k, LINE2, [[0.1, 0.13], [0.16, 0.27], [0.2, 0.33]], 0.004, 0.0015, 0.0004);
    strip(k, LINE2, [[0.06, -0.02], [0.2, -0.16], [0.36, -0.22]], 0.005, 0.002, 0.0004);
  }
  const g = decalRoot('windshield_crack', variant, k, heavy ? { w: 1.0, h: 0.01, l: 0.75 } : { w: 0.66, h: 0.01, l: 0.66 });
  g.userData.style = heavy ? 'heavy' : 'single';
  // driver's side (+X) impact for v0; v1 centred
  g.userData.mount = { cop: mountOn('cop', heavy ? 0.05 : 0.26, heavy ? 0.0 : 0.04) };
  g.userData.decal = { facing: '+Y', note: 'stick on a cop: car.getObjectByName(mount.cop.parent).add(d); d.position.set(...mount.cop.pos); d.rotation.set(...mount.cop.rot) — or align +Y with any glass normal.' };
  return g;
}

/** Place a windshield_crack model on a car (cop). Returns the decal root (now a child of car `body`). */
export function stickOnWindscreen(car, crack, kind = 'cop') {
  const M = crack.userData.mount?.[kind]; if (!M) return null;
  const parent = car.getObjectByName(M.parent) || car;
  parent.add(crack);
  crack.position.set(...M.pos); crack.rotation.set(...M.rot);
  return crack;
}

// ═════════════════════════════════════════════════════════════════════════════
// flat_tyre — cop/sedan wheel (r 0.34, w 0.24, dark steel rim). The tyre lathe is deformed: the
// bottom third squashes (sag) into a flat contact patch and the sidewalls bulge out. The rim
// stays centred on `wheel` (the axle), so the model's pivot is sag lower than an inflated
// wheel's: swap it in with fitFlatTyre (rim drops into the arch; stop spinning that wheel).
// ═════════════════════════════════════════════════════════════════════════════
export const COP_WHEEL = Object.freeze({ r: 0.34, w: 0.24 });
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function tyreGeometry(r, w, sag, bulge, seg = 18) {
  const hw = w / 2, rim = r * 0.7;
  const prof = [[rim, -hw], [r * 0.86, -hw * 1.02], [r * 0.97, -hw * 0.8], [r, -hw * 0.45], [r, hw * 0.45], [r * 0.97, hw * 0.8], [r * 0.86, hw * 1.02], [rim, hw]];
  const g = new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), seg).toNonIndexed();
  g.rotateZ(-Math.PI / 2);                         // axle → X; wheel plane YZ
  const p = g.attributes.position;
  const k = sag / (r - rim);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const rho = Math.hypot(y, z) || 1e-6, c = -y / rho;
    const wgt = smooth(0.25, 1.0, c);
    const t = Math.max(0, (rho - rim) / (r - rim));
    const rho2 = rim + (rho - rim) * (1 - k * wgt * (0.6 + 0.4 * t));
    y = (y / rho) * rho2; z = (z / rho) * rho2;
    y = Math.max(y, -(r - sag));                     // flat contact patch
    x *= 1 + bulge * wgt * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, t * 1.1)));
    p.setXYZ(i, x, y, z);
  }
  return g;
}

export function buildFlatTyre(variant = 0) {
  const shred = variant % 2 === 1;
  const { r, w } = COP_WHEEL, hw = w / 2, rim = r * 0.7;
  const sag = shred ? 0.085 : 0.07;
  const k = new Kit(7900 + variant);
  // tyre (sheen on the bulge + dust on the lower sidewall)
  const tyreCol = (cx, cy, cz, nx) => (cy < -0.18 && Math.abs(nx) > 0.45 ? '#3a3a3c' : cy < -0.24 ? '#2f2f31' : PAL.tyre);
  k.geo(tyreGeometry(r, w, sag, shred ? 0.42 : 0.34), tyreCol);
  // rim (dark steel, as vehicles.js 'dark'): outer disc, hub, inner dark disc, 5 lug nuts, scraped lip at the bottom
  const rimC = PAL.rimDark;
  k.lathe(rimC, [[rim, hw - 0.025], [0.0, hw - 0.05]], 12, [0, 0, 0], { axis: 'x' });
  k.lathe(shade(rimC, 0.72), [[r * 0.24, hw - 0.03], [r * 0.2, hw], [0, hw]], 6, [0, 0, 0], { axis: 'x' });
  k.lathe('#1c1c1d', [[0, -hw + 0.03], [rim, -hw + 0.03]], 12, [0, 0, 0], { axis: 'x' });
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; k.box('#8a8d90', [0.012, 0.016, 0.016], [hw - 0.012, Math.sin(a) * 0.05, Math.cos(a) * 0.05]); }
  const lip = [];
  for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 - 0.7 + (i / 6) * 1.4; lip.push([Math.cos(a) * (rim + 0.004), Math.sin(a) * (rim + 0.004)]); }
  for (let i = 6; i >= 0; i--) { const a = -Math.PI / 2 - 0.7 + (i / 6) * 1.4; lip.push([Math.cos(a) * (rim - 0.02), Math.sin(a) * (rim - 0.02)]); }
  k.flat('#a3a6aa', lip, (u, v) => [hw - 0.023, v, u], { facing: [1, 0, 0], off: 0.002 });
  // sidewall fold lines on the bulge (outer side)
  for (const [a, l] of [[-0.35, 0.07], [0.0, 0.08], [0.35, 0.07]]) {
    const ca = Math.sin(a), sa = -Math.cos(a), r0 = rim + 0.012;
    k.flat('#1b1b1c', [[ca * r0 - 0.004, Math.max(sa * r0, -(r - sag) + 0.01)], [ca * r0 + 0.004, Math.max(sa * r0, -(r - sag) + 0.01)], [ca * (r0 + l) + 0.004, Math.max(sa * (r0 + l), -(r - sag) + 0.004)], [ca * (r0 + l) - 0.004, Math.max(sa * (r0 + l), -(r - sag) + 0.004)]],
      (u, v) => [hw * (1 + (shred ? 0.42 : 0.34) * 0.9) + 0.004, v, u], { facing: [1, 0, 0], off: 0 });
  }
  if (shred) {
    // a strip of tread peeled off the back of the tyre, trailing on the ground; cords showing
    const y0 = -(r - sag);
    const flap = [[0, -0.12, -0.31], [0, y0 + 0.03, -0.37], [0, y0 + 0.008, -0.5], [0, y0 + 0.004, -0.68], [0.03, y0 + 0.004, -0.8]];
    for (let i = 0; i < flap.length - 1; i++) {
      const a = new THREE.Vector3(...flap[i]), b = new THREE.Vector3(...flap[i + 1]);
      const d = b.clone().sub(a), len = d.length();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize());
      const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
      k.geo(new THREE.BoxGeometry(0.15 - i * 0.012, 0.014, len + 0.01), PAL.tyre, m);
    }
    for (let i = 0; i < 4; i++) {
      const a = -2.5 + i * 0.12;
      k.box('#9a9488', [0.13, 0.004, 0.006], [0, Math.cos(a) * (r - 0.003), Math.sin(a) * (r - 0.003)], { rot: [-a, 0, 0] });
    }
  }
  const g = root('flat_tyre', variant, { w: +(w * 1.4).toFixed(2), h: +(2 * r - sag).toFixed(2), l: shred ? 1.2 : 0.68 });
  const m = k.mesh('m');
  g.add(pivot('wheel', m, [0, r - sag, shred ? 0.2 : 0]));
  g.userData.style = shred ? 'shredded' : 'flat';
  g.userData.flat = { sag, r, w, outer: '+X', note: 'Replaces a cop/sedan wheel: fitFlatTyre(car, "wheel_fl", createModel("flat_tyre", v)). The rim stays centred on `wheel`; the pivot sits sag lower than the original axle. fitFlatTyre also rolls the car `body` toward that corner (rotation.z ∓ sag/2.2, rotation.x ± sag/4.5).' };
  return g;
}

/**
 * Swap a car wheel for a flat tyre: hides `<wheel>_mesh`, adds the flat tyre's `wheel` pivot as a
 * SIBLING of the car's wheel pivot (so it doesn't inherit spin), sag lower, outer face out.
 * Returns the flat wheel pivot. Optional roll: body.rotation.z / x toward that corner.
 */
export function fitFlatTyre(car, wheelName, flatModel, { roll = true } = {}) {
  const piv = car.getObjectByName(wheelName); if (!piv) return null;
  const mesh = piv.getObjectByName(wheelName + '_mesh'); if (mesh) mesh.visible = false;
  const w = flatModel.getObjectByName('wheel');
  const { sag } = flatModel.userData.flat;
  w.position.set(piv.position.x, piv.position.y - sag, piv.position.z);
  w.rotation.set(0, piv.position.x < 0 ? Math.PI : 0, 0);
  piv.parent.add(w);
  w.name = wheelName + '_flat';
  if (roll) {
    const body = car.getObjectByName('body');
    if (body) { body.rotation.z += Math.sign(piv.position.x) * -sag / 2.2; body.rotation.x += Math.sign(piv.position.z) * sag / 4.5; }
  }
  return w;
}
