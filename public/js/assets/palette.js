// ─────────────────────────────────────────────────────────────────────────────
// Cook & Run — palette tokens + shared material factory (Agent ART).
//
// Almost every model is ONE merged, vertex-coloured mesh per moving part, all
// sharing the single material returned by `vcolMaterial()`. That keeps draw
// calls tiny and lets the renderer merge any number of static scenery
// instances into one draw call per chunk (same material = mergeable).
// Separate materials exist only where the renderer must change them at runtime
// (cop lights, crossing lamps, RV window glow, smoke puffs) or where a
// CanvasTexture is needed (signs).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

export const PAL = Object.freeze({
  // hero RV (original design)
  rvBody: '#e9e2cf', rvTeal: '#4f8f8a', rvMustard: '#d9a83a', rvDoor: '#9c4a32',
  glass: '#2e3a40', glassHi: '#56666d', curtain: '#b98552', curtain2: '#97493c',
  // police
  copNavy: '#1f2a44', copWhite: '#f1f1ee', copSuv: '#141a29',
  lightRedOn: '#ff3a2e', lightRedOff: '#5c1a17', lightBlueOn: '#2f74ff', lightBlueOff: '#172a55',
  // civilian paint — dusty pastels
  civ: Object.freeze(['#c96f4a', '#6f8fb0', '#d6c08a', '#7e9b6e', '#b85c6a', '#8a8f99']),
  // vehicle bits
  tyre: '#262729', rim: '#a9a79e', rimDark: '#4d4f52', trim: '#2d2e31', chrome: '#bdbbb1', grille: '#38393c',
  headlight: '#f6efd4', taillight: '#a8302a', amber: '#dc8c2c', plate: '#e3dec6', under: '#2a2826',
  rust: '#8e5030', rustDark: '#6a3820', primer: '#9c9a90', dirt: '#6e5c46', mud: '#57493a',
  // characters
  skin: Object.freeze(['#efc8a2', '#d9a77d', '#bb8459', '#8f603e', '#694530']),
  hair: Object.freeze(['#2a221c', '#5a3d26', '#9a7448', '#bdb6aa', '#a8542e', '#1b1a1a']),
  eye: '#1d1b1a',
  // world
  asphalt: '#46474b', asphaltDark: '#333438', concrete: '#aaa69c', concreteDark: '#807d76', concreteLight: '#c4c0b5',
  brick: '#9a5844', brickDark: '#77432f', stone: '#b9b09c',
  wood: '#8a6a4a', woodLight: '#b5976f', woodDark: '#5e4632', woodGrey: '#958c7e',
  metal: '#a0a5a8', metalDark: '#5f6468', corrugated: '#a9a79c',
  leaf: Object.freeze(['#6f8c4a', '#7f9b53', '#5d7b41', '#9a974c']), trunk: '#6a5038',
  grass: '#7c9a58', bush: '#5f7f45',
  sand: '#d8b47c', sandDark: '#c49a62', sandLight: '#e6c896',
  rock: '#a58266', rockRed: '#b45d38', rockDark: '#7c5a45', rockGrey: '#8d8679',
  canyon: Object.freeze(['#9c4a2c', '#b5562f', '#c46a3c', '#d48a55', '#e0a676', '#a9502e']),
  cactus: '#5f7d4a', cactusDark: '#4b663a', cactusLight: '#7a9858',
  hay: '#d4b266', hayDark: '#b8924a',
  orange: '#e0702a', white: '#efece4', offWhite: '#e2dccb', black: '#1f2022', red: '#ad3a2e',
  yellow: '#e2b93b', hivis: '#cfdc3a', silver: '#c8c9c4',
  lampWarm: '#ffd98a', windowLit: '#efcd7e', windowDark: '#2f3a42',
});

// ── colour helpers ───────────────────────────────────────────────────────────
const _colors = new Map();
/** sRGB hex/string → THREE.Color in the linear working space (cached, do not mutate). */
export function linear(c) {
  if (c && c.isColor) return c;
  const key = String(c);
  let col = _colors.get(key);
  if (!col) { col = new THREE.Color(c); _colors.set(key, col); }
  return col;
}
/** Mix two sRGB colours (in sRGB space) → hex string. t=0 → a, t=1 → b. */
export function mix(a, b, t) {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return '#' + ca.lerp(cb, t).getHexString();
}
/** Multiply brightness of an sRGB colour → hex string. */
export function shade(a, f) {
  const c = new THREE.Color(a); c.multiplyScalar(f);
  c.r = Math.min(1, c.r); c.g = Math.min(1, c.g); c.b = Math.min(1, c.b);
  return '#' + c.getHexString();
}

// ── materials (cached; NEVER dispose these — they are shared by every clone) ─
const _mats = new Map();
function cached(key, make) {
  let m = _mats.get(key);
  if (!m) { m = make(); _mats.set(key, m); }
  return m;
}

/** The one shared matte vertex-colour material used by (almost) every mesh. */
export function vcolMaterial() {
  return cached('vcol', () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, name: 'CR_Matte_VCol' }));
}
/** Matte flat-colour material, cached by colour + options. */
export function lambert(color, opts = {}) {
  const key = 'lam|' + color + '|' + JSON.stringify(opts);
  return cached(key, () => new THREE.MeshLambertMaterial({ color, flatShading: true, name: 'CR_Matte_' + String(color).replace('#', ''), ...opts }));
}
/** Unlit colour material (lamps). Cached — callers that animate it must clone. */
export function basic(color, opts = {}) {
  const key = 'bas|' + color + '|' + JSON.stringify(opts);
  return cached(key, () => new THREE.MeshBasicMaterial({ color, name: 'CR_Unlit_' + String(color).replace('#', ''), ...opts }));
}
/** Matte textured material for CanvasTexture signs. */
export function signMaterial(texture, opts = {}) {
  const key = 'sign|' + texture.uuid + '|' + JSON.stringify(opts);
  return cached(key, () => new THREE.MeshLambertMaterial({ map: texture, name: 'CR_Sign_' + (texture.name || 'tex'), ...opts }));
}
/** Slightly glossy material (oil slick only). */
export function glossy(opts = {}) {
  const key = 'gloss|' + JSON.stringify(opts);
  return cached(key, () => new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 90, specular: 0x777777, flatShading: true, name: 'CR_Gloss_VCol', ...opts }));
}
