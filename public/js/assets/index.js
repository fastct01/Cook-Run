// ─────────────────────────────────────────────────────────────────────────────
// Cook & Run — asset registry (Agent ART).
//
//   createModel(kind, variant = 0) → THREE.Object3D
//     origin at ground centre of the footprint, front faces +Z, metres, Y up.
//     Returns a cheap clone of a cached prototype: geometries + materials are
//     SHARED. Never dispose them on an instance; never mutate a shared
//     material — clone it first (see `userData.perInstanceMaterials` and
//     `cloneInstanceMaterials()`).
//   KINDS_3D, CATEGORIES, variantCount(kind), getFootprint(kind, variant),
//   preloadAssets(), configureAssets({ bridge }).
//
// Every model root has userData { kind, variant, size: {w,h,l} } (+ extras).
// Unknown kinds return a magenta box (console.warn once) — never throws.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { VEHICLE_BUILDERS } from './models/vehicles.js';
import { CHARACTER_BUILDERS } from './models/characters.js';
import { PROP_BUILDERS, buildMailbox } from './models/props.js';
import {
  buildBuilding, buildStreetlight, buildTrafficlight, buildTreeCity, buildBench, buildHouse, buildTreeRound, buildFence,
  buildBarn, buildSilo, buildFarmhouse, buildFenceWood, buildWindmill, buildPowerpole, buildCactus, buildRockBig, buildMesa,
  buildShack, buildBillboard, buildCanyonWall, buildWarningSign,
} from './models/scenery.js';
import { STORE_BUILDERS } from './models/stores.js';
import { buildBridgeRamp, buildBridgeLanding, DEFAULT_BRIDGE } from './models/bridge.js';
import { measure } from './models/kit.js';
import { PAL } from './palette.js';
import { X_BUILDERS, X_CATEGORIES, X_LABELS, X_NAMED_PARTS, CAT_NAMES as X_CAT_NAMES } from './expansion/index.js';

export { PAL } from './palette.js';

const SCENERY_BUILDERS = {
  building: { build: buildBuilding, variants: 6 },
  streetlight: { build: buildStreetlight, variants: 1 },
  trafficlight: { build: buildTrafficlight, variants: 1 },
  tree_city: { build: buildTreeCity, variants: 2 },
  bench: { build: buildBench, variants: 2 },
  house: { build: buildHouse, variants: 6 },
  tree_round: { build: buildTreeRound, variants: 3 },
  fence: { build: buildFence, variants: 3 },
  mailbox_deco: { build: (v) => buildMailbox(v, true), variants: 5 },
  barn: { build: buildBarn, variants: 2 },
  silo: { build: buildSilo, variants: 2 },
  farmhouse: { build: buildFarmhouse, variants: 2 },
  fence_wood: { build: buildFenceWood, variants: 2 },
  windmill: { build: buildWindmill, variants: 1 },
  powerpole: { build: buildPowerpole, variants: 2 },
  cactus: { build: buildCactus, variants: 3 },
  rock_big: { build: buildRockBig, variants: 3 },
  mesa: { build: buildMesa, variants: 3 },
  shack: { build: buildShack, variants: 1 },
  billboard: { build: buildBillboard, variants: 3 },
  canyon_wall: { build: buildCanyonWall, variants: 3 },
  warning_sign: { build: buildWarningSign, variants: 2 },
};

let bridgeCfg = { ...DEFAULT_BRIDGE };
const BRIDGE = {
  bridge_ramp: { build: () => buildBridgeRamp(bridgeCfg), variants: 1 },
  bridge_landing: { build: () => buildBridgeLanding(bridgeCfg), variants: 1 },
};

const REGISTRY = {
  ...VEHICLE_BUILDERS, ...CHARACTER_BUILDERS, ...PROP_BUILDERS, ...SCENERY_BUILDERS, ...STORE_BUILDERS, ...BRIDGE,
  ...X_BUILDERS,   // expansion packs (assets/expansion/*)
};
// R3-GARAGE: Rook is the young Rook everywhere — createModel('driver', v) builds `rook_young` v (v0 casual,
// v1 suited: yellow suit, hood down, nitrile gloves). Same rig (body/head/arm_*/leg_* pivots at the old
// driver's positions), so onfoot/avatar.js, van/interior.js poseSeated and every other consumer work as before.
// The kind stays 'driver' (userData.kind), only the builder is swapped.
if (X_BUILDERS.rook_young) REGISTRY.driver = { build: (v) => X_BUILDERS.rook_young.build(v), variants: X_BUILDERS.rook_young.variants || 2 };

export const CATEGORIES = Object.freeze({
  vehicles: ['rv', 'cop', 'cop_suv', 'heli', 'sedan', 'hatch', 'van', 'pickup', 'bus', 'truck', 'tractor', 'rival', 'train'],
  characters: ['driver', 'cook', 'ped', 'cow'],
  props: ['cone', 'trashcan', 'mailbox', 'hydrant', 'barrier', 'sprinkler', 'hay', 'tumbleweed', 'pothole', 'sanddrift',
    'rock_small', 'rock', 'cactus_road', 'spikes', 'falling_rock', 'smoke_cloud', 'oil_slick', 'crossing_gate', 'roadblock'],
  scenery: ['building', 'streetlight', 'trafficlight', 'tree_city', 'bench', 'house', 'tree_round', 'fence', 'mailbox_deco',
    'barn', 'silo', 'farmhouse', 'fence_wood', 'windmill', 'powerpole', 'cactus', 'rock_big', 'mesa', 'shack', 'billboard',
    'canyon_wall', 'warning_sign'],
  stores: ['store_hardware', 'store_gas', 'store_junkyard', 'store_farm', 'sell_point'],
  bridge: ['bridge_ramp', 'bridge_landing'],
  ...X_CATEGORIES,
});

/** Showroom tab names for every category (base + expansion). */
export const CATEGORY_NAMES = Object.freeze({ vehicles: 'Vehicles', characters: 'Characters', props: 'Props', scenery: 'Scenery', stores: 'Stores', bridge: 'Bridge', ...X_CAT_NAMES });

export const KINDS_3D = Object.freeze(Object.values(CATEGORIES).flat());

/** Named parts the renderer may rely on (also used by the self-check). */
export const NAMED_PARTS = Object.freeze({
  rv: ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr', 'vent', 'door', 'window_glow', 'exhaust', 'body', 'light_brake_l', 'light_brake_r'],
  cop: ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr', 'light_red', 'light_blue', 'body'],
  cop_suv: ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr', 'light_red', 'light_blue', 'body'],
  heli: ['rotor', 'tail_rotor', 'spot', 'body'],
  sedan: ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'],
  hatch: ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'],
  van: ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'],
  pickup: ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'],
  bus: ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'],
  truck: ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr', 'wheel_rl2', 'wheel_rr2', 'wheel_tl', 'wheel_tr', 'wheel_tl2', 'wheel_tr2'],
  tractor: ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'],
  rival: ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'],
  train: ['car_0', 'car_1', 'car_2', 'car_3'],
  ped: ['leg_l', 'leg_r', 'arm_l', 'arm_r', 'head', 'body'],
  driver: ['leg_l', 'leg_r', 'arm_l', 'arm_r', 'head', 'body'],
  cook: ['leg_l', 'leg_r', 'arm_l', 'arm_r', 'head', 'body'],
  cow: ['leg_fl', 'leg_fr', 'leg_rl', 'leg_rr', 'body'],
  crossing_gate: ['arm', 'lamp_l', 'lamp_r'],
  roadblock: ['lamp_0', 'lamp_1', 'lamp_2'],
  smoke_cloud: ['puff_0', 'puff_1', 'puff_2', 'puff_3', 'puff_4', 'puff_5'],
  windmill: ['blades'],
  tumbleweed: ['ball'],
  ...X_NAMED_PARTS,
});

const LABELS = {
  rv: 'The RV (hero)', cop: 'Patrol car', cop_suv: 'Police SUV', heli: 'Police helicopter', sedan: 'Sedan', hatch: 'Hatchback',
  van: 'Van', pickup: 'Pickup', bus: 'City bus', truck: 'Semi truck', tractor: 'Tractor', rival: 'Rival pickup', train: 'Freight train',
  driver: 'Rook (driver · young; v1 suited)', cook: 'Doc (cook)', ped: 'Pedestrian', cow: 'Cow',
  cone: 'Traffic cone', trashcan: 'Trash can', mailbox: 'Mailbox', hydrant: 'Hydrant', barrier: 'Barrier', sprinkler: 'Sprinkler',
  hay: 'Hay bale', tumbleweed: 'Tumbleweed', pothole: 'Pothole', sanddrift: 'Sand drift', rock_small: 'Small rock', rock: 'Rock',
  cactus_road: 'Road cactus', spikes: 'Spike strip', falling_rock: 'Falling rock', smoke_cloud: 'Smoke cloud', oil_slick: 'Oil slick',
  crossing_gate: 'Crossing gate', roadblock: 'Roadblock',
  building: 'City building', streetlight: 'Streetlight', trafficlight: 'Traffic light', tree_city: 'City tree', bench: 'Bench',
  house: 'House', tree_round: 'Tree', fence: 'Fence', mailbox_deco: 'Mailbox (deco)', barn: 'Barn', silo: 'Silo', farmhouse: 'Farmhouse',
  fence_wood: 'Ranch fence', windmill: 'Windpump', powerpole: 'Power pole', cactus: 'Saguaro', rock_big: 'Big rock', mesa: 'Mesa',
  shack: 'Shack', billboard: 'Billboard', canyon_wall: 'Canyon wall', warning_sign: 'Warning sign',
  store_hardware: 'Bolt & Barrel Hardware', store_gas: 'Gas station', store_junkyard: 'Rustbucket Junkyard', store_farm: "Prickly Pete's",
  sell_point: 'Abandoned Drive-In', bridge_ramp: 'Bridge ramp', bridge_landing: 'Bridge landing',
};
export function labelOf(kind) { return LABELS[kind] || X_LABELS[kind] || kind; }

// ── cache + clone ─────────────────────────────────────────────────────────────
const _proto = new Map();
const _warned = new Set();

function normVariant(kind, variant) {
  const n = variantCount(kind);
  const v = Number.isFinite(+variant) ? Math.floor(+variant) : 0;
  return ((v % n) + n) % n;
}

export function variantCount(kind) { return REGISTRY[kind]?.variants || 1; }

function prototype(kind, variant) {
  const key = kind + '#' + variant;
  let p = _proto.get(key);
  if (!p) {
    const def = REGISTRY[kind];
    p = def.build(variant);
    // Builders author animated models as one skinned mesh; the cached prototype is converted ONCE to a
    // rigid hierarchy (plain Mesh `<part>_mesh` under each named pivot) — what the renderer's rig baker,
    // GLTFExporter and Unity all expect. Clones then share these geometries.
    if (p.userData.skinned) p = toRigid(p, true);
    p.userData.kind = kind;
    p.userData.variant = variant;
    p.userData.size = p.userData.size || (() => { const m = measure(p); return { w: +m.w.toFixed(2), h: +m.h.toFixed(2), l: +m.l.toFixed(2) }; })();
    p.updateMatrixWorld(true);
    _proto.set(key, p);
  }
  return p;
}

function magenta(kind) {
  if (!_warned.has(kind)) { _warned.add(kind); console.warn(`[assets] unknown kind "${kind}" — using a placeholder box`); }
  const g = new THREE.Group();
  g.name = 'unknown_' + kind;
  const m = new THREE.Mesh(_magGeo || (_magGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), _magMat || (_magMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, name: 'CR_Missing' })));
  m.name = 'body';
  g.add(m);
  g.userData = { kind, variant: 0, size: { w: 1, h: 1, l: 1 }, missing: true };
  return g;
}
let _magGeo = null, _magMat = null;

/** Create an instance (cheap clone of a cached prototype). Never throws. */
export function createModel(kind, variant = 0) {
  if (!REGISTRY[kind]) return magenta(kind);
  try {
    const v = normVariant(kind, variant);
    const obj = prototype(kind, v).clone(true);
    return obj;
  } catch (err) {
    if (!_warned.has(kind + '!')) { _warned.add(kind + '!'); console.warn(`[assets] failed to build "${kind}"`, err); }
    return magenta(kind);
  }
}

/** Footprint {w, l, h} in metres (w along X, l along Z, h up). */
export function getFootprint(kind, variant = 0) {
  if (!REGISTRY[kind]) return { w: 1, l: 1, h: 1 };
  try {
    const s = prototype(kind, normVariant(kind, variant)).userData.size;
    return { w: s.w, l: s.l, h: s.h };
  } catch { return { w: 1, l: 1, h: 1 }; }
}

/**
 * Give an instance its own copies of the materials it is expected to animate
 * (cop lights, crossing lamps, roadblock lamps, RV window glow, smoke puffs).
 * Call once per instance that needs independent flashing/tinting. Returns the
 * map { childName: material }.
 */
export function cloneInstanceMaterials(obj) {
  const names = obj.userData.perInstanceMaterials || [];
  const out = {};
  const want = (n) => names.some((p) => (p.endsWith('*') ? n.startsWith(p.slice(0, -1)) : n === p));
  let shared = null;
  obj.traverse((o) => {
    if (!o.isMesh || !want(o.name)) return;
    if (o.name.startsWith('puff_')) { // smoke puffs share one cloned material per instance
      shared = shared || o.material.clone();
      o.material = shared;
    } else o.material = o.material.clone();
    out[o.name] = o.material;
  });
  obj.userData.flashMaterials = out;
  return out;
}

/** Override the bridge numbers (pass route.bridge). Rebuilds bridge prototypes on next use. */
export function configureAssets({ bridge } = {}) {
  if (bridge) {
    bridgeCfg = { ...DEFAULT_BRIDGE, ...bridge };
    for (const k of [..._proto.keys()]) if (k.startsWith('bridge_')) _proto.delete(k);
  }
}

/** Warm every prototype (spread over idle frames in the browser). Resolves when done. */
export function preloadAssets({ kinds = KINDS_3D, allVariants = true } = {}) {
  const jobs = [];
  for (const k of kinds) { const n = allVariants ? variantCount(k) : 1; for (let v = 0; v < n; v++) jobs.push([k, v]); }
  return new Promise((resolve) => {
    let i = 0;
    const step = () => {
      const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      while (i < jobs.length) {
        const [k, v] = jobs[i++];
        try { prototype(k, v); } catch (e) { console.warn('[assets] preload failed', k, v, e); }
        const t = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        if (t - t0 > 12) break;
      }
      if (i < jobs.length) (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (f) => setTimeout(f, 0))(step);
      else resolve({ count: jobs.length });
    };
    step();
  });
}

/**
 * Convert an instance to a RIGID hierarchy: every SkinnedMesh is split per bone into plain
 * Meshes named `<bone>_mesh`, parented to the bone (same names, same pivots). Use for glTF/Unity
 * export or if a renderer prefers no skinning. Geometry is new (not shared); materials are shared.
 */
export function toRigid(obj, inPlace = false) {
  const out = inPlace ? obj : obj.clone(true);
  out.updateMatrixWorld(true);
  const skinned = [];
  out.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
  const v = new THREE.Vector3();
  for (const sm of skinned) {
    const g = sm.geometry, pos = g.attributes.position, col = g.attributes.color, si = g.attributes.skinIndex;
    const buckets = new Map();
    for (let i = 0; i < pos.count; i += 3) {
      const b = si.getX(i);
      let d = buckets.get(b); if (!d) buckets.set(b, (d = { p: [], c: [] }));
      for (let j = i; j < i + 3; j++) { d.p.push(pos.getX(j), pos.getY(j), pos.getZ(j)); if (col) d.c.push(col.getX(j), col.getY(j), col.getZ(j)); }
    }
    for (const [b, d] of buckets) {
      const bone = sm.skeleton.bones[b];
      const m4 = new THREE.Matrix4().multiplyMatrices(sm.skeleton.boneInverses[b], sm.bindMatrix);
      for (let i = 0; i < d.p.length; i += 3) { v.set(d.p[i], d.p[i + 1], d.p[i + 2]).applyMatrix4(m4); d.p[i] = v.x; d.p[i + 1] = v.y; d.p[i + 2] = v.z; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(d.p, 3));
      if (d.c.length) geo.setAttribute('color', new THREE.Float32BufferAttribute(d.c, 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, sm.material);
      mesh.name = bone.name + '_mesh';
      mesh.castShadow = sm.castShadow; mesh.receiveShadow = sm.receiveShadow;
      bone.add(mesh);
    }
    sm.removeFromParent();
  }
  // Bones → plain Object3D pivots (same name / transform / rotation order), children moved across.
  const bones = [];
  out.traverse((o) => { if (o.isBone) bones.push(o); });
  for (const b of bones) {
    const o = new THREE.Object3D();
    o.name = b.name;
    o.rotation.order = b.rotation.order;
    o.position.copy(b.position); o.quaternion.copy(b.quaternion); o.scale.copy(b.scale);
    o.userData = b.userData;
    const parent = b.parent;
    parent.children[parent.children.indexOf(b)] = o;
    o.parent = parent; b.parent = null;
    o.children = b.children; b.children = [];
    for (const c of o.children) c.parent = o;
  }
  out.userData.skinned = false;
  out.updateMatrixWorld(true);
  return out;
}

/** Debug helper: triangle + draw-call count of an instance. */
export function statsOf(obj) {
  let tris = 0, meshes = 0;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return { tris: Math.round(tris), meshes };
}

void PAL;
