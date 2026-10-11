// ─────────────────────────────────────────────────────────────────────────────
// Round 3 · R3-ROOK pack — firearms for the roof defence (PROPOSED, not wired).
// Generic, unbranded, low-poly designs: gun_revolver (6-shot, double action), gun_shotgun (pump),
// gun_rifle (bolt-action hunting rifle + scope), ammo_box (0 revolver / 1 shotgun / 2 rifle),
// muzzle_flash (0 star / 1 wide), shell_casing (0 rifle brass / 1 shotgun hull / 2 revolver brass).
//
// GUN FRAME (shared by the standalone prop and the gun held by rook_roof_aim):
//   pivot `gun` → origin = `grip` = centre of the right hand, +Z = bore (barrel direction), +Y = up,
//   −X = the gun's right side (ejection port, bolt handle). Children (named, animated):
//     revolver: cylinder (rotation.z: +π/3 per shot), hammer (rotation.x: 0 down … −0.6 cocked)
//     shotgun:  pump (position.z: 0 … −0.09 racked)
//     rifle:    bolt (rotation.z: 0 … −1.05 lifted, then position.z: 0 … −0.09 pulled back)
//     all:      muzzle (at the barrel tip, local +Z = shot direction; carries the crown/bore mesh)
//               grip   (at the hand point, carries the grip panels)
//   userData.gun = { support (left-hand point), sightRear, sightHeight, muzzle, length, anim }
// Props sit on y = 0 with the gun's bounds centred (like every kit model); the standalone root
// only offsets the `gun` pivot, so `createModel('gun_rifle').getObjectByName('gun')` can be
// re-parented to a hand anchor as is.
// Guns are authored ~1.25× (revolver) / 1× (long guns) real size: the characters' hands are big.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Kit, root, measure } from '../models/kit.js';
import { mix, shade } from '../palette.js';
import { pivot, kmesh, glowAdd } from './hazards-util.js';

export const STEEL = '#30343a', STEEL_L = '#4a4f57', STEEL_D = '#212428', WOOD = '#7c5234', WOOD_D = '#5c3b24', WALNUT = '#8a5a36';
export const BRASS = '#c9a24a', BRASS_D = '#9c7a32', COPPER = '#b8673e', LEAD = '#8f9296', BORE = '#0d0e10';
const RUBBER = '#26272a';

const neg = (p) => [-p[0], -p[1], -p[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

/**
 * Gun assembly helper. Geometry is authored in an "authoring frame" (any origin); GRIP is the
 * hand point in that frame and S a uniform scale. Everything is emitted in the gun frame
 * (origin = grip, scaled by S): mesh vertices are local to their pivot.
 */
class GunKit {
  constructor(seed, grip, S = 1) {
    this.G = grip; this.S = S; this.seed = seed;
    this.parts = [];
    this.main = this.kit(null);
  }
  /** Gun-frame position of an authoring-frame point. */
  P(p) { return mul(add(p, neg(this.G)), this.S); }
  /** New Kit whose stack maps authoring coords → pivot-local (pivot at authoring point `at`, null = gun origin). */
  kit(at) {
    const k = new Kit(this.seed + this.parts.length * 7 + 1);
    const o = at || this.G;
    k.stack.push(k.M.clone().multiply(new THREE.Matrix4().makeScale(this.S, this.S, this.S)).multiply(new THREE.Matrix4().makeTranslation(-o[0], -o[1], -o[2])));
    return k;
  }
  /** Named child pivot at authoring point `at`; fn(k) authors its geometry. */
  part(name, at, fn) { const k = this.kit(at); fn(k); this.parts.push({ name, at, k }); return k; }
  /** Bake → Object3D `gun` (gun_mesh + named pivots). */
  build() {
    const g = new THREE.Object3D(); g.name = 'gun';
    g.add(kmesh(this.main, 'gun_mesh'));
    for (const { name, at, k } of this.parts) g.add(pivot(name, kmesh(k, name), this.P(at)));
    return g;
  }
}

/** Stand-alone prop root: the `gun` pivot offset so the gun sits on y = 0, centred in x/z. */
function propRoot(kind, gun, info) {
  const tmp = new THREE.Group(); tmp.add(gun); tmp.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(tmp);
  tmp.remove(gun);
  const g = root(kind, 0, { w: b.max.x - b.min.x, h: b.max.y - b.min.y, l: b.max.z - b.min.z });
  gun.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  g.add(gun);
  g.userData.gun = info;
  g.userData.attach = 'gun = model.getObjectByName("gun") — its origin is the grip (hand centre), +Z the bore. Re-parent it to a hand anchor and reset its position.';
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// gun_revolver — 6-shot double-action revolver, 5" barrel with a full under-lug, wood grip.
// ═════════════════════════════════════════════════════════════════════════════
const REV_S = 1.25;
export function revolverParts() {
  const yb = 0.066;                         // bore line (authoring frame: origin = hand centre)
  const GK = new GunKit(7100, [0, 0, 0], REV_S);
  const k = GK.main;
  // frame: recoil shield + top strap + lower frame + front post
  k.box(STEEL, [0.03, 0.052, 0.02], [0, 0.058, -0.004]);
  k.box(STEEL, [0.013, 0.009, 0.052], [0, 0.0875, 0.031]);
  k.box(STEEL_D, [0.004, 0.0025, 0.04], [0, 0.0925, 0.031]);                         // sight groove
  k.box(STEEL, [0.026, 0.028, 0.066], [0, 0.027, 0.03]);
  k.box(STEEL, [0.022, 0.05, 0.012], [0, 0.06, 0.058]);
  // barrel + rib + full under-lug (ejector shroud) + ramp front sight
  k.cyl(STEEL, 0.0078, 0.0078, 0.118, [0, yb, 0.122], { axis: 'z', seg: 6, open: true });
  k.box(STEEL_L, [0.0095, 0.006, 0.118], [0, yb + 0.0075, 0.122]);
  k.box(STEEL, [0.0135, 0.016, 0.104], [0, yb - 0.0135, 0.115]);
  k.box(STEEL_D, [0.0045, 0.012, 0.016], [0, yb + 0.0155, 0.17], { rot: [0.25, 0, 0] });
  // trigger guard (two bars) + trigger, backstrap + butt cap along the grip
  k.box(STEEL, [0.0065, 0.0055, 0.046], [0, -0.004, 0.034], { rot: [-0.12, 0, 0] });
  k.box(STEEL, [0.0065, 0.03, 0.0055], [0, 0.011, 0.058], { rot: [0.25, 0, 0] });
  k.box(STEEL_L, [0.005, 0.021, 0.006], [0, 0.009, 0.033], { rot: [0.3, 0, 0] });
  k.box(STEEL, [0.017, 0.098, 0.008], [0, -0.004, -0.036], { rot: [0.3, 0, 0] });
  k.box(STEEL, [0.032, 0.009, 0.042], [0, -0.05, -0.027], { rot: [0.3, 0, 0] });
  // cylinder (pivot on its axis, 6 loaded chambers seen from the front)
  const ycyl = yb - 0.0125;
  GK.part('cylinder', [0, ycyl, 0.032], (c) => {
    c.cyl(STEEL_L, 0.0195, 0.0195, 0.042, [0, ycyl, 0.032], { axis: 'z', seg: 6 });
    c.cyl(STEEL_D, 0.0205, 0.0205, 0.006, [0, ycyl, 0.032], { axis: 'z', seg: 6, open: true });   // flute band
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 3, x = Math.cos(a) * 0.0125, y = ycyl + Math.sin(a) * 0.0125, r = 0.0048;
      c.front(COPPER, 0.032 + 0.021, [[x - r, y], [x, y - r], [x + r, y], [x, y + r]], 1, { off: 0.0008 });
    }
  });
  // hammer: hinge behind the frame; spur up/back. rotation.x −0.6 = cocked
  GK.part('hammer', [0, 0.07, -0.016], (h) => {
    h.box(STEEL_L, [0.009, 0.026, 0.012], [0, 0.078, -0.016]);
    h.box(STEEL_L, [0.0085, 0.007, 0.02], [0, 0.092, -0.026], { rot: [-0.45, 0, 0] });
  });
  // muzzle: crown ring + dark bore (local +Z = shot direction)
  GK.part('muzzle', [0, yb, 0.181], (m) => {
    m.cyl(STEEL_L, 0.0085, 0.0085, 0.006, [0, yb, 0.178], { axis: 'z', seg: 6, open: true });
    m.front(BORE, 0.181, hexPts(0, yb, 0.0045), 1, { off: 0.0006 });
  });
  // grip: wood panels (hand point = origin)
  GK.part('grip', [0, 0, 0], (g) => {
    g.box(WOOD, [0.035, 0.094, 0.04], [0, -0.006, -0.013], { rot: [0.3, 0, 0], c: 0.008, cv: true });
    g.box(WOOD_D, [0.036, 0.006, 0.026], [0, 0.022, -0.004], { rot: [0.3, 0, 0] });
  });
  const gun = GK.build();
  const info = {
    type: 'revolver', rounds: 6, scale: REV_S,
    support: GK.P([0.032, -0.014, 0.006]), sightRear: GK.P([0, 0.093, -0.01]), sightHeight: +(0.093 * REV_S).toFixed(4),
    muzzle: GK.P([0, yb, 0.181]), length: +(0.235 * REV_S).toFixed(3),
    anim: { cylinder: { prop: 'rotation.z', perShot: Math.PI / 3 }, hammer: { prop: 'rotation.x', down: 0, cocked: -0.6 } },
  };
  gun.userData.gun = info;
  return { gun, info };
}
function hexPts(cx, cy, r, n = 6, a0 = 0) { const p = []; for (let i = 0; i < n; i++) { const a = a0 + (i / n) * Math.PI * 2; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p; }

// ═════════════════════════════════════════════════════════════════════════════
// gun_shotgun — pump-action, 20" barrel with vent rib + bead, tube magazine, ribbed wooden pump,
// straight wood stock with rubber butt pad. `pump` slides back 0.09 m to rack it.
// ═════════════════════════════════════════════════════════════════════════════
export function shotgunParts() {
  const yb = 0.075, ymag = 0.049, G = [0, 0.018, -0.045];
  const GK = new GunKit(7200, G, 1);
  const k = GK.main;
  // receiver (side profile extruded across X) + ejection port (right, −X) + loading-gate line
  k.extrude(STEEL, [[0.02, 0.026], [0.24, 0.026], [0.24, 0.1], [0.05, 0.1], [0.02, 0.086]], 0.046, { axis: 'x' });
  k.side(STEEL_D, 0.023, [[0.1, 0.062], [0.185, 0.062], [0.185, 0.09], [0.1, 0.09]], { side: -1, off: 0.0015 });
  k.side(STEEL_L, 0.023, [[0.04, 0.094], [0.23, 0.094], [0.23, 0.097], [0.04, 0.097]], { off: 0.0015 });
  // barrel + vent rib + magazine tube + cap + barrel clamp
  k.cyl(STEEL, 0.0115, 0.0115, 0.5, [0, yb, 0.49], { axis: 'z', seg: 8, open: true });
  k.box(STEEL_L, [0.008, 0.0045, 0.5], [0, yb + 0.0135, 0.49]);
  k.cyl(STEEL, 0.011, 0.011, 0.41, [0, ymag, 0.445], { axis: 'z', seg: 6, open: true });
  k.cyl(STEEL_L, 0.0128, 0.0128, 0.026, [0, ymag, 0.662], { axis: 'z', seg: 6 });
  k.box(STEEL, [0.026, 0.046, 0.016], [0, (yb + ymag) / 2, 0.625]);
  // trigger guard + trigger
  k.box(STEEL, [0.008, 0.006, 0.075], [0, 0.0, 0.075]);
  k.box(STEEL, [0.008, 0.03, 0.006], [0, 0.012, 0.111]);
  k.box(STEEL_L, [0.005, 0.022, 0.006], [0, 0.014, 0.07], { rot: [0.25, 0, 0] });
  // stock (side profile, walnut) + butt pad
  k.extrude(WOOD, [[0.022, 0.087], [-0.07, 0.07], [-0.17, 0.064], [-0.385, 0.05], [-0.385, -0.105], [-0.2, -0.052], [-0.075, -0.03], [-0.02, -0.03], [0.022, 0.026]], 0.042, { axis: 'x' });
  k.box(RUBBER, [0.044, 0.158, 0.02], [0, -0.028, -0.395], { rot: [0.04, 0, 0] });
  k.side(WOOD_D, 0.0212, [[-0.36, 0.035], [-0.2, 0.045], [-0.2, 0.05], [-0.36, 0.042]], { off: 0.001 });       // grain line
  // pump (ribbed fore-end around the mag tube); slides along −Z
  GK.part('pump', [0, ymag, 0.365], (p) => {
    p.box(WOOD, [0.054, 0.05, 0.175], [0, ymag - 0.002, 0.365], { c: 0.012, cv: true });
    for (let i = 0; i < 6; i++) p.side(WOOD_D, 0.0272, [[0.305 + i * 0.024, ymag - 0.019], [0.316 + i * 0.024, ymag - 0.019], [0.316 + i * 0.024, ymag + 0.017], [0.305 + i * 0.024, ymag + 0.017]], { off: 0.001 });
  });
  // muzzle: crown + bore + bead sight
  GK.part('muzzle', [0, yb, 0.74], (m) => {
    m.cyl(STEEL_L, 0.0125, 0.0125, 0.008, [0, yb, 0.736], { axis: 'z', seg: 8, open: true });
    m.front(BORE, 0.7405, hexPts(0, yb, 0.0085, 8), 1, { off: 0.0005 });
    m.box('#e9e2c8', [0.006, 0.006, 0.006], [0, yb + 0.0195, 0.728]);
  });
  // grip (wrist) checkering
  GK.part('grip', G, (g) => {
    g.side(WOOD_D, 0.0212, [[-0.085, -0.012], [-0.02, -0.008], [0.005, 0.045], [-0.07, 0.05]], { off: 0.0012 });
  });
  const gun = GK.build();
  const info = {
    type: 'shotgun', rounds: 5,
    support: GK.P([0, ymag - 0.014, 0.31]), sightRear: GK.P([0, 0.1, 0.03]), sightHeight: +(0.1 - G[1]).toFixed(4),
    muzzle: GK.P([0, yb, 0.74]), length: 1.14,
    anim: { pump: { prop: 'position.z', rest: 0, racked: -0.09 } },
  };
  gun.userData.gun = info;
  return { gun, info };
}

// ═════════════════════════════════════════════════════════════════════════════
// gun_rifle — bolt-action hunting rifle: walnut stock with pistol grip + cheek comb, round
// receiver, tapered 22" barrel, variable scope on two rings. `bolt` lifts (rotation.z −1.05)
// then pulls back (position.z −0.09).
// ═════════════════════════════════════════════════════════════════════════════
export function rifleParts() {
  const yb = 0.068, ys = yb + 0.054, G = [0, -0.045, -0.026];
  const GK = new GunKit(7300, G, 1);
  const k = GK.main;
  // stock: one side profile (fore-end → receiver → comb → butt → pistol grip → trigger area)
  k.extrude(WALNUT, [
    [0.52, 0.054], [0.02, 0.058], [-0.03, 0.066], [-0.14, 0.07], [-0.36, 0.057], [-0.372, -0.085], [-0.15, -0.032],
    [-0.065, -0.026], [-0.045, -0.088], [-0.004, -0.088], [0.022, -0.014], [0.12, 0.004], [0.32, 0.016], [0.5, 0.03],
  ], 0.044, { axis: 'x' });
  k.box(RUBBER, [0.046, 0.148, 0.018], [0, -0.014, -0.374], { rot: [0.075, 0, 0] });
  k.box(STEEL_D, [0.034, 0.008, 0.034], [0, -0.091, -0.024], { rot: [-0.05, 0, 0] });          // grip cap
  k.side(shade(WALNUT, 0.8), 0.0222, [[-0.34, 0.046], [-0.16, 0.058], [-0.16, 0.063], [-0.34, 0.052]], { off: 0.001 });
  // receiver + barrel (tapered)
  k.cyl(STEEL, 0.017, 0.017, 0.2, [0, yb, 0.1], { axis: 'z', seg: 6, open: true });      // ends hidden by the barrel / bolt
  k.cyl(STEEL, 0.0085, 0.012, 0.56, [0, yb, 0.48], { axis: 'z', seg: 6, open: true });
  // trigger guard + trigger, sling studs
  k.box(STEEL, [0.008, 0.005, 0.07], [0, -0.022, 0.06], { rot: [-0.06, 0, 0] });
  k.box(STEEL, [0.008, 0.026, 0.006], [0, -0.008, 0.094]);
  k.box(STEEL_L, [0.005, 0.022, 0.006], [0, -0.008, 0.05], { rot: [0.25, 0, 0] });
  // scope: one lathe from eyepiece to objective, lens colours by position; turrets; two rings
  const lens = (cx, cy, cz) => (cz > 0.357 ? '#2c4a62' : cz < -0.037 ? '#1d2b35' : cz > 0.25 || cz < 0.02 ? '#2b2e33' : '#33373d');
  k.lathe(lens, [[0, -0.04], [0.019, -0.04], [0.019, 0.016], [0.0125, 0.056], [0.0125, 0.255], [0.0225, 0.31], [0.0225, 0.36], [0, 0.36]], 7, [0, ys, 0], { axis: 'z' });
  k.front('#8fc0d6', 0.3605, [[0.004, ys + 0.006], [0.012, ys + 0.012], [0.01, ys + 0.015], [0.002, ys + 0.009]], 1, { off: 0.0006 });
  k.cyl(STEEL_L, 0.0105, 0.0105, 0.024, [0, ys + 0.022, 0.155], { seg: 5 });
  k.cyl(STEEL_L, 0.0095, 0.0095, 0.022, [-0.021, ys, 0.155], { axis: 'x', seg: 5 });
  for (const z of [0.07, 0.225]) k.box(STEEL_D, [0.03, ys - yb, 0.016], [0, (yb + ys) / 2 + 0.004, z]);
  // bolt: shroud + handle out to the right (−X), angled down, with a knob
  GK.part('bolt', [0, yb, 0.03], (b) => {
    b.cyl(STEEL_L, 0.0145, 0.0145, 0.045, [0, yb, 0.008], { axis: 'z', seg: 6 });
    b.box(STEEL_L, [0.052, 0.0085, 0.0085], [-0.033, yb - 0.012, 0.036], { rot: [0, 0.25, 0.42] });
    b.box(STEEL_D, [0.017, 0.017, 0.017], [-0.059, yb - 0.025, 0.029], { rot: [0.3, 0.4, 0] });
  });
  GK.part('muzzle', [0, yb, 0.76], (m) => {
    m.cyl(STEEL_L, 0.0095, 0.0095, 0.008, [0, yb, 0.756], { axis: 'z', seg: 6, open: true });
    m.front(BORE, 0.7605, hexPts(0, yb, 0.0048), 1, { off: 0.0005 });
  });
  GK.part('grip', G, (g) => {
    g.side(shade(WALNUT, 0.72), 0.0222, [[-0.058, -0.03], [-0.04, -0.078], [-0.012, -0.078], [-0.002, -0.025]], { off: 0.0012 });
  });
  const gun = GK.build();
  const info = {
    type: 'rifle', rounds: 4,
    support: GK.P([0, -0.022, 0.25]), sightRear: GK.P([0, ys, -0.04]), sightHeight: +(ys - G[1]).toFixed(4),
    muzzle: GK.P([0, yb, 0.76]), length: 1.15,
    anim: { bolt: { lift: { prop: 'rotation.z', to: -1.05 }, pull: { prop: 'position.z', to: -0.09 }, note: 'lift, pull, push, drop (≈0.5 s); a shell_casing v0 leaves the right side (−X) on the pull' } },
  };
  gun.userData.gun = info;
  return { gun, info };
}

export const GUN_PARTS = { revolver: revolverParts, shotgun: shotgunParts, rifle: rifleParts };
export function buildGun(type) {
  const { gun, info } = GUN_PARTS[type]();
  return propRoot('gun_' + type, gun, info);
}

// ═════════════════════════════════════════════════════════════════════════════
// ammo_box — open cardboard ammo box (lid pivot `lid`, hinged at the back, authored open) with the
// rounds standing head-up inside + a few loose rounds. v0 revolver rounds, v1 shotgun shells,
// v2 rifle rounds. Unbranded: colour band + a cartridge silhouette, no text. ~1.4× real size.
// ═════════════════════════════════════════════════════════════════════════════
const AMMO = [
  { name: 'revolver', box: '#4a6a8a', band: '#e8dfc8', w: 0.17, l: 0.12, h: 0.05, cols: 6, rows: 4, head: BRASS, r: 0.0095, loose: 'pistol' },
  { name: 'shotgun', box: '#b0362c', band: '#e2b93b', w: 0.17, l: 0.14, h: 0.1, cols: 5, rows: 4, head: BRASS, r: 0.0145, loose: 'shell' },
  { name: 'rifle', box: '#6b7046', band: '#e8dfc8', w: 0.2, l: 0.1, h: 0.1, cols: 5, rows: 3, head: BRASS, r: 0.0105, loose: 'rifle' },
];
export function buildAmmoBox(variant = 0) {
  const A = AMMO[((variant % 3) + 3) % 3];
  const g = root('ammo_box', variant, { w: 0.4, h: 0.2, l: 0.3 });
  const k = new Kit(7400 + variant); k.floor = 0;
  const { w, l, h } = A;
  const bx = -0.05, bz = -0.02;   // box centre (loose rounds lie to its right/front)
  const t = 0.004;   // open-top carton: four walls
  for (const s of [1, -1]) {
    k.box(A.box, [w, h, t], [bx, 0, bz + s * (l / 2 - t / 2)], { base: true, noBottom: true });
    k.box(shade(A.box, 0.94), [t, h, l - 2 * t], [bx + s * (w / 2 - t / 2), 0, bz], { base: true, noBottom: true });
  }
  k.rectY('#2a2622', h - 0.004, [bx - w / 2 + 0.006, bx + w / 2 - 0.006], [bz - l / 2 + 0.006, bz + l / 2 - 0.006], { off: 0 });
  // front band + cartridge silhouette (generic)
  k.rectZ(A.band, bz + l / 2, [bx - w / 2 + 0.004, bx + w / 2 - 0.004], [h * 0.3, h * 0.72], 1, { off: 0.0015 });
  const cy = h * 0.51, ch = h * 0.13;
  k.front(shade(A.box, 0.8), bz + l / 2 + 0.003, [[bx - 0.05, cy - ch], [bx + 0.02, cy - ch], [bx + 0.045, cy], [bx + 0.02, cy + ch], [bx - 0.05, cy + ch]], 1, { off: 0 });
  k.front(shade(A.box, 0.8), bz + l / 2 + 0.003, [[bx - 0.06, cy - ch], [bx - 0.054, cy - ch], [bx - 0.054, cy + ch], [bx - 0.06, cy + ch]], 1, { off: 0 });
  k.rectX(shade(A.box, 0.85), bx + w / 2, [bz - l / 2 + 0.01, bz + l / 2 - 0.01], [h * 0.4, h * 0.6], 1, { off: 0.0015 });
  // rounds head-up in a grid: brass head + primer
  const dx = (w - 0.03) / A.cols, dz = (l - 0.03) / A.rows;
  for (let i = 0; i < A.cols; i++) for (let j = 0; j < A.rows; j++) {
    if (variant % 3 === 0 && i === A.cols - 1 && j < 2) continue;             // a few already taken
    const x = bx - w / 2 + 0.015 + dx * (i + 0.5), z = bz - l / 2 + 0.015 + dz * (j + 0.5);
    k.top(A.head, h - 0.002, hexPts(x, z, A.r), { off: 0 });
    k.top(variant % 3 === 1 ? '#d9c79a' : '#b9bcbf', h - 0.001, hexPts(x, z, A.r * 0.38, 4), { off: 0 });
  }
  // loose rounds lying on the ground
  const loose = [[0.11, -0.06, 0.4], [0.14, 0.05, -0.5], [0.06, 0.1, 1.2]];
  for (const [x, z, a] of loose) k.at([x, 0, z], [0, a, 0], () => round(k, A.loose));
  g.add(k.mesh('body'));
  // lid: hinged on the back top edge, authored open (rotation.x −1.95)
  const lk = new Kit(7410 + variant);
  lk.box(A.box, [w + 0.006, 0.012, l + 0.006], [0, 0.006, l / 2]);
  lk.rectY(A.band, 0.0125, [-w / 2 + 0.012, w / 2 - 0.012], [0.03, l - 0.03], { off: 0.0008 });
  lk.rectY(shade(A.box, 0.75), 0.0125, [-w / 2 + 0.03, w / 2 - 0.03], [l * 0.45, l * 0.55], { off: 0.0016 });
  lk.box(shade(A.box, 0.9), [w + 0.006, 0.03, 0.012], [0, -0.015 + 0.006, l]);
  g.add(pivot('lid', lk.mesh('m'), [bx, h, bz - l / 2], [-1.95, 0, 0]));
  g.userData.style = A.name;
  g.userData.lid = { axis: 'x', closed: 0, open: -1.95 };
  return g;
}
/** One loose round lying on its side along X, on the ground (current kit frame). */
function round(k, type) {
  if (type === 'shell') {
    k.cyl('#b0362c', 0.0145, 0.0145, 0.068, [0, 0.0145, 0], { axis: 'x', seg: 6 });
    k.cyl(BRASS, 0.0152, 0.0152, 0.022, [-0.045, 0.0145, 0], { axis: 'x', seg: 6 });
  } else if (type === 'rifle') {
    k.cyl(BRASS, 0.0068, 0.0068, 0.062, [0, 0.0068, 0], { axis: 'x', seg: 6 });
    k.cyl(BRASS, 0.0048, 0.0068, 0.008, [0.035, 0.0068, 0], { axis: 'x', seg: 6, open: true, rot: [0, 0, Math.PI] });
    k.cyl(COPPER, 0.0005, 0.0048, 0.03, [0.054, 0.0068, 0], { axis: 'x', seg: 6, open: true, rot: [0, 0, Math.PI] });
  } else {
    k.cyl(BRASS, 0.0072, 0.0072, 0.03, [0, 0.0072, 0], { axis: 'x', seg: 6 });
    k.cyl(LEAD, 0.003, 0.0068, 0.016, [0.023, 0.0072, 0], { axis: 'x', seg: 6, open: true, rot: [0, 0, Math.PI] });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// muzzle_flash — star-shaped flash, unlit + additive (black = invisible). Pivot `flash` = the
// muzzle point; flame extends along local +Z. v0 'star' (revolver / rifle, ~0.3 m),
// v1 'wide' (shotgun, ~0.45 m, more prongs splaying out). Re-parent `flash` to a gun's `muzzle`
// (position 0) and show it for 1–2 frames with a random rotation.z and scale 0.8–1.2.
// perInstanceMaterials: ['flash_mesh'] (fade via material.opacity after cloneInstanceMaterials).
// ═════════════════════════════════════════════════════════════════════════════
const FLASH_C = { white: '#fff3c4', yellow: '#ffc23a', orange: '#ff7a1c', ember: '#a8360e' };
function flashMaterial() {
  const m = glowAdd('CR_MuzzleFlash');
  m.toneMapped = false;
  return m;
}
function starPts(n, r0, r1, rot = 0, jit = null) {
  const p = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2, r = (i % 2 ? r1 : r0) * (jit ? jit[i % jit.length] : 1);
    p.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return p;
}
export function buildMuzzleFlash(variant = 0) {
  const wide = variant % 2 === 1;
  const R = wide ? 0.2 : 0.14, L = wide ? 0.46 : 0.32;
  const g = root('muzzle_flash', variant, { w: 2 * R, h: 2 * R, l: L });
  const k = new Kit(7500 + variant);
  const jit = wide ? [1, 0.75, 0.9, 1.1, 0.8, 1.05, 0.7, 0.95] : [1, 0.8, 1.1, 0.85, 0.95];
  // star discs facing ±Z (layers add up: ember → orange → yellow → white core)
  const disc = (c, n, r0, r1, z, rot, j) => k.front(c, z, starPts(n, r0, r1, rot, j), 1, { off: 0 });
  disc(FLASH_C.ember, wide ? 8 : 6, R, R * 0.36, 0.0, 0.1, jit);
  disc(FLASH_C.orange, wide ? 8 : 6, R * 0.72, R * 0.3, 0.004, 0.32, jit);
  disc(FLASH_C.yellow, wide ? 6 : 5, R * 0.45, R * 0.22, 0.008, 0.6, null);
  disc(FLASH_C.white, 6, R * 0.22, R * 0.16, 0.012, 0, null);
  // flame petals along +Z: crossed planes (wide: splayed outward like a cone)
  const petals = wide ? 5 : 3;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI;
    k.at([0, 0, 0], [0, 0, a], () => {
      const flame = (s, len) => [[0, -R * 0.3 * s], [len * 0.35, -R * 0.42 * s], [len, 0], [len * 0.35, R * 0.42 * s], [0, R * 0.3 * s]];
      for (const [c, s, len] of [[FLASH_C.orange, 1, L], [FLASH_C.yellow, 0.62, L * 0.78], [FLASH_C.white, 0.3, L * 0.5]]) {
        // plane x = 0: u = z (along the shot), v = y
        k.flat(c, flame(s, len), (u, v) => [0, v, u], { facing: [1, 0, 0], off: 0 });
      }
    });
  }
  if (wide) {
    // side prongs: 6 short spikes splaying outward at 45°
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      k.at([Math.cos(a) * R * 0.25, Math.sin(a) * R * 0.25, 0.02], [0, 0, a], () => {
        k.at([0, 0, 0], [0, -0.75, 0], () => {
          const pts = [[0, -0.02], [0.2, 0], [0, 0.02]];
          k.flat(FLASH_C.orange, pts, (u, v) => [0, v, u], { facing: [1, 0, 0], off: 0 });
        });
      });
    }
  }
  const m = new THREE.Mesh(k.geometry(), flashMaterial());
  m.castShadow = false; m.receiveShadow = false; m.renderOrder = 8;
  g.add(pivot('flash', m, [0, R, -L / 2]));
  g.userData.perInstanceMaterials = ['flash_mesh'];
  g.userData.style = wide ? 'wide' : 'star';
  g.userData.flash = { length: L, radius: R, note: 'Parent `flash` to the gun\'s `muzzle` (position 0, rotation.z random). Visible 1–2 frames; additive, so black = transparent.' };
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// shell_casing — one spent case lying on its side (axis along Z, mouth +Z), pivot `casing` at its
// centre (spin it while it flies). v0 rifle brass (bottle-neck), v1 shotgun hull (red plastic +
// brass head), v2 revolver brass (only when the cylinder is emptied). 1.5× real size.
// ═════════════════════════════════════════════════════════════════════════════
export function buildShellCasing(variant = 0) {
  const v = ((variant % 3) + 3) % 3, S = 1.5;
  const k = new Kit(7600 + v);
  let r;
  k.at([0, 0, 0], [0, 0, 0], S, () => {
    if (v === 0) {
      r = 0.0062;
      k.cyl(BRASS, r, r, 0.046, [0, 0, -0.008], { axis: 'z', seg: 6 });
      k.cyl(BRASS_D, r * 0.92, r * 0.92, 0.003, [0, 0, -0.0325], { axis: 'z', seg: 6 });
      k.cyl(BRASS, 0.0044, r, 0.008, [0, 0, 0.019], { axis: 'z', seg: 6, open: true });
      k.cyl(BRASS, 0.0044, 0.0044, 0.011, [0, 0, 0.0285], { axis: 'z', seg: 6, open: true });
      k.front(BORE, 0.034, hexPts(0, 0, 0.0036), 1, { off: 0 });
      k.front('#b9bcbf', -0.0345, hexPts(0, 0, 0.002, 4), -1, { off: 0 });
    } else if (v === 1) {
      r = 0.0105;
      k.cyl('#b0362c', r, r, 0.05, [0, 0, 0.007], { axis: 'z', seg: 7, open: true });
      k.cyl(BRASS, r * 1.04, r * 1.04, 0.017, [0, 0, -0.025], { axis: 'z', seg: 7 });
      k.front('#4a1612', 0.032, hexPts(0, 0, r * 0.9, 7), 1, { off: 0 });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.front('#d9574a', 0.0322, [[0, 0], [Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85], [Math.cos(a + 0.35) * r * 0.85, Math.sin(a + 0.35) * r * 0.85]], 1, { off: 0 }); }
      k.front('#b9bcbf', -0.0337, hexPts(0, 0, 0.0035, 5), -1, { off: 0 });
    } else {
      r = 0.0058;
      k.cyl(BRASS, r, r, 0.03, [0, 0, 0], { axis: 'z', seg: 6 });
      k.cyl(BRASS_D, r * 1.18, r * 1.18, 0.0025, [0, 0, -0.0155], { axis: 'z', seg: 6 });
      k.front(BORE, 0.0151, hexPts(0, 0, 0.0045), 1, { off: 0 });
      k.front('#b9bcbf', -0.0169, hexPts(0, 0, 0.0018, 4), -1, { off: 0 });
    }
  });
  const g = root('shell_casing', v, { w: 0.04, h: 0.04, l: 0.1 });
  const m = k.mesh('m');
  g.add(pivot('casing', m, [0, (v === 1 ? 0.0105 * 1.04 : v === 2 ? 0.0058 * 1.18 : 0.0062) * S, 0]));
  g.userData.style = ['rifle', 'shotgun', 'revolver'][v];
  g.userData.scale = S;
  const mm = measure(g);
  g.userData.size = { w: +Math.max(0.01, mm.w).toFixed(2), h: +Math.max(0.01, mm.h).toFixed(2), l: +Math.max(0.01, mm.l).toFixed(2) };
  return g;
}

export { mix };
