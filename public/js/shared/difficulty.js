// ─────────────────────────────────────────────────────────────────────────────
// Difficulty (ROUND3_CONTRACT.md §Data: difficulty) — pure, no DOM, no clocks.
//
//   import { DIFFICULTIES, normDifficulty, withDifficulty, difficultyInfo } from './shared/difficulty.js';
//   const d = withDifficulty(data, 'extreme');   // NEW data object; the input is never mutated
//   d.difficulty === 'extreme'; d.rules / d.route carry the scaled values, so every module just
//   reads its normal keys (sim, view, HUD, lab, shops, FP, roof) and never needs to know the level.
//
// Hard is today's balance + the Round 3 changes: `levels.hard` is empty. Easy / Extreme are small
// op lists applied to a deep copy of { rules, route } (paths without a `route.` prefix are in rules):
//   set  { path: value }      absolute value (creates missing objects on the way)
//   mul  { path: factor }     × the Hard value
//   add  { path: delta }      + the Hard value
//   min  { path: floor }      clamp from below (applied last), e.g. maxCops ≥ 1 from 1★
// Path syntax: dotted keys; `*` = every key of an object; `name[]` = every element of an array,
// `name[i]`, `name[i:]`, `name[i:j]` = index / slice. Ops on a missing key use HARD_DEFAULTS below
// as the base when the key has one (e.g. rules.defend is DEFEND's block), otherwise they are skipped.
// The levels come from rules.difficulty.levels; BUILTIN_LEVELS (the same table) is the fallback for
// raw data without the block. Re-applying to an already-scaled object starts from its originals.
// Unity port: a DifficultyProfile ScriptableObject per level + the same path walker.
// ─────────────────────────────────────────────────────────────────────────────

export const DIFFICULTIES = Object.freeze(['easy', 'hard', 'extreme']);
export const DEFAULT_DIFFICULTY = 'hard';

const INFO = Object.freeze({
  easy: Object.freeze({ id: 'easy', label: 'Easy', color: '#D9C38A' }),
  hard: Object.freeze({ id: 'hard', label: 'Hard', color: '#E07A3C' }),
  extreme: Object.freeze({ id: 'extreme', label: 'Extreme', color: '#E5483A' }),
});

/** Hard values of every key a difficulty lever touches (consumers use the same numbers as `?? default`). */
export const HARD_DEFAULTS = Object.freeze({
  'heat.bust.grace': 3, 'heat.bust.seconds': 4,
  'rv.regenPerSec': 0.3, 'rv.regenDelay': 10,
  'cook.hurtMult': 1, 'cook.zoneScale': 1, 'cook.burnerFireMult': 1, 'cook.spillMult': 1,
  'sim.obstacles.densityMult': 1, 'sim.traffic.densityMult': 1,
  'sim.startGadgets.smoke': 1, 'sim.startGadgets.oil': 0, 'sim.startGadgets.nitro': 0,
  'shops.timeMult': 1, 'driver.lookCooldown': 30,
  'bridge.missDamage': 30, 'bridge.missBags': 1, 'scoring.mult': 1,
  'stops.response.cops': 2, 'stops.response.delay': 8, 'stops.response.minStars': 1, 'stops.response.heat': 1.2,
  // rules.defend is DEFEND's block — these are the contract's Hard values, used only when it is missing
  'defend.heatPerShot': 0.04, 'defend.heatPerDisable': 0.15, 'defend.hitsMult': 1, 'defend.ammoMult': 1, 'defend.flare': 1,
  'defend.copFire.range': 35, 'defend.copFire.returnEvery': 2.4, 'defend.copFire.returnDamage': 2,
  'defend.copFire.rookShare': 0.5, 'defend.copFire.accuracy': 0.45, 'defend.copFire.chaseStars': 4,
  'defend.copFire.chaseEvery': 6, 'defend.copFire.chaseDamage': 1.5, 'defend.copFire.chaseRange': 30,
  'route.sellPoint.requiredUnits': 6,
});

// The plan's table (ROUND3_CONTRACT.md) — rules.json `difficulty.levels` carries the same ops.
export const BUILTIN_LEVELS = Object.freeze({
  easy: {
    set: {
      'heat.copRamDamage': 4, 'heat.suvRamDamage': 6, 'heat.decayDelay': 5, 'heat.decayPerSec': 0.08,
      'heat.levels[].rhino': false, 'heat.bust.grace': 5, 'heat.bust.seconds': 6,
      'rv.regenPerSec': 0.45, 'rv.regenDelay': 6,
      'cook.hurtMult': 0.6, 'cook.zoneScale': 1.3, 'cook.burnerFireMult': 0.6, 'cook.spillMult': 0.35,
      'sim.obstacles.densityMult': 0.7, 'sim.traffic.densityMult': 0.8, 'shops.timeMult': 1.25,
      'defend.hitsMult': 0.75, 'defend.ammoMult': 1.5, 'defend.copFire.chaseStars': 5,
      'driver.lookCooldown': 20, 'route.sellPoint.requiredUnits': 4,
      'sim.startGadgets.smoke': 2, 'sim.startGadgets.nitro': 1,
      'bridge.missDamage': 20, 'bridge.missBags': 1, 'scoring.mult': 0.75,
      'stops.response.cops': 1, 'stops.response.delay': 12,
    },
    mul: {
      'heat.moto.ramDamage': 0.667, 'heat.rhino.ramDamage': 0.667, 'heat.levels[1:].spawnEvery': 1.3,
      'heat.sources.*': 0.7, 'defend.heatPerShot': 0.7, 'defend.heatPerDisable': 0.7,
      'sim.patrol.speedingHeat': 0.7, 'sim.patrol.witnessHeat': 0.7,
      'defend.copFire.returnEvery': 2.5, 'defend.copFire.chaseEvery': 2.5,
      'defend.copFire.returnDamage': 0.5, 'defend.copFire.chaseDamage': 0.5,
      'rv.crashDamagePerMps': 0.7,
    },
    add: { 'heat.levels[1:].copTopSpeed': -2, 'heat.moto.topSpeed': -2, 'heat.rhino.topSpeed': -2, 'heat.levels[1:].maxCops': -1 },
    min: { 'heat.levels[1:].maxCops': 1 },
  },
  hard: {},
  extreme: {
    set: {
      'heat.copRamDamage': 9, 'heat.suvRamDamage': 15, 'heat.decayDelay': 10, 'heat.decayPerSec': 0.03,
      'heat.levels[4:].rhino': true, 'heat.bust.grace': 1.5, 'heat.bust.seconds': 2.5,
      'rv.regenPerSec': 0.15, 'rv.regenDelay': 15,
      'cook.hurtMult': 1.5, 'cook.zoneScale': 0.7, 'cook.burnerFireMult': 1.5, 'cook.spillMult': 1.8,
      'sim.obstacles.densityMult': 1.3, 'sim.traffic.densityMult': 1.2, 'shops.timeMult': 0.75,
      'defend.hitsMult': 1.5, 'defend.ammoMult': 0.7, 'defend.flare': 0, 'defend.copFire.chaseStars': 3,
      'driver.lookCooldown': 45, 'route.sellPoint.requiredUnits': 8,
      'sim.startGadgets.smoke': 0, 'sim.startGadgets.oil': 0, 'sim.startGadgets.nitro': 0,
      'bridge.missDamage': 50, 'bridge.missBags': 2, 'scoring.mult': 1.5,
      'stops.response.cops': 3, 'stops.response.delay': 5,
    },
    mul: {
      'heat.moto.ramDamage': 1.5, 'heat.rhino.ramDamage': 1.5, 'heat.levels[1:].spawnEvery': 0.75,
      'heat.sources.*': 1.3, 'defend.heatPerShot': 1.3, 'defend.heatPerDisable': 1.3,
      'sim.patrol.speedingHeat': 1.3, 'sim.patrol.witnessHeat': 1.3,
      'defend.copFire.returnEvery': 0.625, 'defend.copFire.chaseEvery': 0.625,
      'defend.copFire.returnDamage': 1.5, 'defend.copFire.chaseDamage': 1.5,
      'rv.crashDamagePerMps': 1.3,
    },
    add: { 'heat.levels[1:].copTopSpeed': 2, 'heat.moto.topSpeed': 2, 'heat.rhino.topSpeed': 2, 'heat.levels[1:].maxCops': 1 },
  },
});

const OPS = ['set', 'mul', 'add', 'min'];
const BASE = Symbol.for('cookrun.difficulty.base');

/** → a valid difficulty id ('hard' for anything unknown). */
export function normDifficulty(x) {
  const s = typeof x === 'string' ? x.trim().toLowerCase() : '';
  return DIFFICULTIES.includes(s) ? s : DEFAULT_DIFFICULTY;
}

/** → { id, label, color } (sand / rust / red tile). Labels can be overridden by rules.difficulty.labels. */
export function difficultyInfo(level, rules = null) {
  const id = normDifficulty(level);
  const lab = rules?.difficulty?.labels?.[id];
  return { ...INFO[id], ...(typeof lab === 'string' && lab ? { label: lab } : null) };
}

/** The op list of a level: rules.difficulty.levels[id] if present, else the built-in table. */
export function difficultyOps(rules, level) {
  const id = normDifficulty(level);
  const fromRules = rules?.difficulty?.levels?.[id];
  return fromRules && typeof fromRules === 'object' ? fromRules : BUILTIN_LEVELS[id];
}

/**
 * → NEW data object { ...data, rules, route, difficulty: id }; never mutates `data`.
 * rules and route are deep copies with the level's ops applied (Hard: unchanged copies).
 */
export function withDifficulty(data, level) {
  if (!data || typeof data !== 'object') return data;
  const base = data[BASE] || { rules: data.rules, route: data.route };
  const id = normDifficulty(level ?? base.rules?.difficulty?.default);
  const root = { rules: clone(base.rules ?? {}), route: base.route ? clone(base.route) : base.route };
  applyOps(root, difficultyOps(base.rules, id));
  const out = { ...data, rules: root.rules, route: root.route, difficulty: id };
  Object.defineProperty(out, BASE, { value: base, enumerable: false });
  return out;
}

/** Apply one op list ({ set, mul, add, min }) in place to root = { rules, route }. Exported for tests/tools. */
export function applyOps(root, ops) {
  if (!ops || typeof ops !== 'object') return root;
  for (const op of OPS) {
    const m = ops[op];
    if (!m || typeof m !== 'object') continue;
    for (const [path, v] of Object.entries(m)) {
      const full = path.startsWith('route.') ? path : `rules.${path}`;
      if (op !== 'set' && HARD_DEFAULTS[path] !== undefined && getPath(root, full) === undefined) setPath(root, full, HARD_DEFAULTS[path]);
      for (const [obj, key] of walk(root, full, op === 'set')) {
        const cur = obj[key];
        if (op === 'set') obj[key] = clone(v);
        else if (typeof cur !== 'number' || typeof v !== 'number') continue;
        else if (op === 'mul') obj[key] = round6(cur * v);
        else if (op === 'add') obj[key] = round6(cur + v);
        else if (op === 'min') obj[key] = Math.max(cur, v);
      }
    }
  }
  return root;
}

// ── path helpers ──────────────────────────────────────────────────────────────
const SEG = /^(\*|[A-Za-z0-9_$-]+)(?:\[(\d*)(:?)(\d*)\])?$/;

// → [[parentObject, key], …] for every terminal the path names. create: make missing plain objects.
function walk(root, path, create) {
  const segs = path.split('.');
  let cur = [root];
  for (let i = 0; i < segs.length; i++) {
    const m = SEG.exec(segs[i]);
    if (!m) return [];
    const [, name, a, colon, b] = m;
    const last = i === segs.length - 1;
    const hasIdx = segs[i].includes('[');
    const next = [];
    for (const o of cur) {
      if (!o || typeof o !== 'object') continue;
      const names = name === '*' ? Object.keys(o) : [name];
      for (const n of names) {
        if (!hasIdx) {
          if (last) { if (create || o[n] !== undefined) next.push([o, n]); continue; }
          if ((o[n] == null || typeof o[n] !== 'object') && create && name !== '*') o[n] = {};
          if (o[n] && typeof o[n] === 'object') next.push(o[n]);
          continue;
        }
        const arr = o[n];
        if (!Array.isArray(arr)) continue;
        let i0 = 0, i1 = arr.length;
        if (a !== '' && !colon) { i0 = +a; i1 = +a + 1; }
        else { if (a !== '') i0 = +a; if (b !== '') i1 = Math.min(arr.length, +b); }
        for (let k = i0; k < i1 && k < arr.length; k++) {
          if (last) next.push([arr, k]);
          else if (arr[k] && typeof arr[k] === 'object') next.push(arr[k]);
        }
      }
    }
    cur = next;
    if (!cur.length) return [];
  }
  return cur;
}
function getPath(root, path) {
  let o = root;
  for (const k of path.split('.')) { if (!o || typeof o !== 'object') return undefined; o = o[k]; }
  return o;
}
function setPath(root, path, v) {
  const ks = path.split('.');
  let o = root;
  for (let i = 0; i < ks.length - 1; i++) {
    if (o[ks[i]] == null || typeof o[ks[i]] !== 'object') o[ks[i]] = {};
    o = o[ks[i]];
  }
  o[ks[ks.length - 1]] = v;
}
function clone(v) {
  if (v == null || typeof v !== 'object') return v;
  if (typeof structuredClone === 'function') { try { return structuredClone(v); } catch (e) { /* fall through */ } }
  return JSON.parse(JSON.stringify(v));
}
function round6(x) { return Math.round(x * 1e6) / 1e6; }

export default { DIFFICULTIES, normDifficulty, withDifficulty, difficultyInfo };
