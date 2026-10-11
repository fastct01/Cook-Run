// ─────────────────────────────────────────────────────────────────────────────
// RoofDefence — Rook's roof defence with guns (Round 3, agent DEFEND). PURE LOGIC: no DOM, no
// three.js, no Math.random (own seeded RNG from sim.seed) → deterministic. ROUND3_CONTRACT.md
// "Bust + defend" is the spec; docs/NOTES-r3-build-defend.md the notes.
//
//   const roof = new RoofDefence(sim);  // GameSim builds it (optional plugin, see GameSim.js)
//   roof.command(cmd, src = 'driver')   // DCMD defend {on, ai?} · roofAim {yaw,pitch,ads} · roofFire ·
//                                       // roofReload · roofSelect {slot} · roofThrow {device,x,z}.
//                                       // src 'cook' is ignored (the roof belongs to Rook now).
//   roof.update(dt)                     // every tick (any phase is safe)
//   roof.state()                        // → snap.roof (and snap.stop.roof)
//   roof.active    Rook is up there, climbing, or climbing down
//   roof.onRoof    standing on the roof (guns + throws work)
//   roof.roofRook  visible on the roof from outside (climb > 0.5) → snap.rv.roofRook
//   roof.holdsRv   the RV is held: from the start of the climb until he is back in the seat
//   roof.roofDoc   always false (legacy: Doc never climbs up any more)
//
// Rules (rules.defend, Hard defaults below; every read is `?? default`, so raw data works):
//  • DEFEND is `available` in phase 'drive', not airborne, Rook not already up, and either the stop is
//    parked/shopping/returning/loading, or |speed| < availSpeed (1.5) with ≥ 1★ and a chasing
//    (state 1) cop within copNear (40 m). `why` says why not.
//  • defend {on:true} climbs climbSeconds (1.6 s); {on:false} climbs down. On while already up with
//    ai:false = a human takes over from the AI Rook. Auto-down: the stop he went up for has finished
//    loading (done / left) and no running cop is within 40 m; an AI Rook up without a stop goes down
//    after 2 s with no running cop within 40 m; phase ≠ drive.
//  • AI Rook: `ai:true`, or solo (sim.solo) 0.8 s after a stop parks. Any human roof command takes
//    over for humanTakeover (1.5 s).
//  • Guns (rules.defend.guns): hit-scan rays from the muzzle (ROOF_GEOM.muzzle, RV-local pivot +
//    `reach` along the aim) with seeded spread; rayCopHit() tests an oriented box per cop kind with
//    parts wheel (4) / radiator (front 1 m below the belt line) / glass (above the belt line) / body.
//    revolver: hole (+ crack on glass); hitsToStall hits on one car → stall (state 7) stallSeconds.
//    shotgun: 8 pellets; tyreHits pellets on a tyre → tyre out (state 9); other pellets → holes.
//    rifle:   radiatorHits on the radiator → state 10 (steaming, stalled); glass → crack; else hole.
//    Hits needed = ceil(base × hitsMult), min 1. Counters live here, per cop per gun.
//  • Effects → sim.applyCopEffect(id, { hole, crack, tyre: 'fl'|'fr'|'rl'|'rr', radiator, stall });
//    if a tyre/radiator effect did not put the car in state 9/10 (an older cops.js), a stall of the
//    same length is applied instead so the shot still counts.
//  • Heat: every trigger pull sim.addHeat(heatPerShot); every disabled car heatPerDisable. Points
//    (sim.addPoints) per disabled car: points.tyre / radiator / stall.
//  • Ammo: mags full + reserve per stop (× ammoMult) refilled at every NEW stop that parks; throwables
//    firecracker/balloon × ammoMult, flare = `flare` per stop (0 = none) and each flare also uses a
//    smoke-bomb charge (sim.useGadget('smoke', …) or inv.gadgets.smoke) when smokeFlare.usesSmokeCharge.
//  • Throwables (as the old hose version): the target is clamped to 3..25 m and lands after
//    throwFlightTime(dist); firecracker → stall in its radius, balloon → paint-blind, flare → red smoke
//    that re-blinds every cop inside 4×/s.
//  • Events: EV.DEFEND {on, ai}, EV.SHOT, EV.RELOAD, EV.COP_HIT, EV.COP_DISABLED, EV.ROOF_HIT (throws).
// Unity port: a RoofDefence MonoBehaviour on the RV; rayCopHit = Physics.Raycast against per-part
// BoxColliders on the cop prefab; System.Random(seed) for spread and the AI.
// ─────────────────────────────────────────────────────────────────────────────
import { EV } from '../shared/protocol.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const DEG = Math.PI / 180;

export const ROOF_ACTIVE_STATES = Object.freeze(['parked', 'shopping', 'returning', 'loading']);
const ACTIVE = new Set(ROOF_ACTIVE_STATES);
export const DEVICES = Object.freeze(['firecracker', 'balloon', 'flare']);
export const GUN_IDS = Object.freeze(['revolver', 'shotgun', 'rifle']);
export const SLOTS = Object.freeze([...GUN_IDS, ...DEVICES]);   // keys 1–6
export const COP_KINDS = Object.freeze(['cop', 'cop_suv', 'interceptor', 'moto_cop', 'rhino_truck']);
const COP_KIND_SET = new Set(COP_KINDS);
/** cop states that don't count as "running" (protocol): 2 smoke, 3 spun, 4 wrecked, 5 gave up, 6 soaked, 7 stalled, 8 paint, 9 tyre out, 10 radiator */
export const COP_OUT_STATES = Object.freeze([2, 3, 4, 5, 6, 7, 8, 9, 10]);
const OUT = new Set(COP_OUT_STATES);

/** Shared geometry (RV-local metres: +Z front, +X driver's left, y up). The client and rv.js use the same numbers. */
export const ROOF_GEOM = Object.freeze({
  roofY: 3.11,
  hatch: Object.freeze({ x: 0.15, z: -1.1 }),               // roof_hatch userData.rvMount (Rook climbs out of it)
  stance: Object.freeze({ x: 0.0, z: -1.8 }),               // where Rook stands
  rookScale: 0.92,                                           // rook_roof_aim is drawn at this scale on the roof
  // aim pivot: Rook's shooting shoulder / eye line (rook_roof_aim at 0.92: gun ≈ 1.37 m above the roof).
  // A shot starts `reach` m along the aim from the pivot (≈ the drawn muzzle).
  muzzle: Object.freeze({ x: 0.0, y: 4.48, z: -1.8, reach: 0.72 }),
  nozzle: Object.freeze({ x: 0.0, y: 4.48, z: -1.8 }),      // legacy alias of the aim pivot (old van/roof client)
  hand: Object.freeze({ x: 0.0, y: 4.55, z: -1.8 }),        // throw release point
  copAimY: 0.9,                                              // aim height on a police car (AI / aimAt default)
  copRadius: 1.1,
  throwMin: 3, throwMax: 25,
  pitchMin: -1.25, pitchMax: 0.6,
  autoDownSpeed: 3, enterMaxSpeed: 1.5,
});

/**
 * Police-car hit boxes (car-local: +Z front, +X left, y up from the ground), measured from the asset models.
 * Two boxes: the lower body (floor..belt, ±hw, ±hl) and the cabin/upper box (belt..h, ±cw, z in cab);
 * a hit on the cabin inside z `glass` is glass (else body); a lower-body hit within `front` m of the nose is
 * the radiator (grille + hood), else body. wheels [x, z] with radius wr, tyre width ww. moto_cop has no upper
 * box: the rider sits above the bike and can never be hit (shots only ever hit the vehicles).
 */
export const COP_BOXES = Object.freeze({
  cop:         Object.freeze({ hw: 0.98, hl: 2.5, floor: 0.25, belt: 0.98, h: 1.5, cw: 0.78, cab: [-1.55, 0.72], glass: [-1.55, 0.72], wr: 0.34, ww: 0.26, front: 1.0, wheels: [[0.85, 1.5], [-0.85, 1.5], [0.85, -1.42], [-0.85, -1.42]] }),
  cop_suv:     Object.freeze({ hw: 1.05, hl: 2.66, floor: 0.3, belt: 1.15, h: 2.05, cw: 0.95, cab: [-2.4, 1.1], glass: [-2.4, 1.1], wr: 0.4, ww: 0.28, front: 1.0, wheels: [[0.9, 1.62], [-0.9, 1.62], [0.9, -1.6], [-0.9, -1.6]] }),
  interceptor: Object.freeze({ hw: 1.0, hl: 2.6, floor: 0.25, belt: 0.95, h: 1.42, cw: 0.75, cab: [-1.75, 0.7], glass: [-1.75, 0.7], wr: 0.35, ww: 0.26, front: 1.0, wheels: [[0.86, 1.48], [-0.86, 1.48], [0.84, -1.45], [-0.84, -1.45]] }),
  moto_cop:    Object.freeze({ hw: 0.42, hl: 1.08, floor: 0.25, belt: 1.15, h: 1.15, cw: 0, cab: null, glass: null, wr: 0.33, ww: 0.16, front: 0.5, wheels: [[0, 0.8], [0, -0.74]] }),
  rhino_truck: Object.freeze({ hw: 1.4, hl: 3.45, floor: 0.35, belt: 1.6, h: 3.0, cw: 1.3, cab: [-3.3, 1.85], glass: [0.4, 1.85], wr: 0.56, ww: 0.36, front: 1.0, wheels: [[1.1, 2.05], [-1.1, 2.05], [1.1, -1.95], [-1.1, -1.95]] }),
});
const WHEEL_IDS = ['fl', 'fr', 'rl', 'rr'];   // order of COP_BOXES[].wheels (moto: f, r → 'fl', 'rl')

/** Hard defaults (= rules.defend). The client reads defendRules(data.rules) for the numbers it shows. */
export const GUNS = Object.freeze({
  revolver: Object.freeze({ mag: 6, reserve: 18, reload: 2.0, interval: 0.32, spread: 1.2, range: 45, hitsToStall: 3, stallSeconds: 6 }),
  shotgun: Object.freeze({ mag: 5, reserve: 10, reloadPerShell: 0.55, interval: 0.85, pellets: 8, spread: 5, range: 22, tyreHits: 1, tyreSeconds: 20 }),
  rifle: Object.freeze({ mag: 5, reserve: 18, reload: 2.6, interval: 1.1, spreadAds: 0.4, spreadHip: 3, range: 90, radiatorHits: 1, radiatorSeconds: 15 }),
});

/** Normalised rules.defend (Hard defaults; difficulty levers ammoMult / hitsMult / flare applied). */
export function defendRules(rules) {
  const D = rules?.defend ?? {};
  const G = D.guns ?? {};
  const g = (id) => ({ ...GUNS[id], ...(G[id] || {}) });
  const fc = D.firecracker ?? rules?.roof?.firecracker ?? {}, bl = D.balloon ?? rules?.roof?.balloon ?? {};
  const sf = D.smokeFlare ?? rules?.roof?.flare ?? {};
  const ammoMult = Math.max(0, D.ammoMult ?? 1), hitsMult = Math.max(0.01, D.hitsMult ?? 1);
  const per = (n) => Math.max(0, Math.round((n ?? 0) * ammoMult));
  const need = (n) => Math.max(1, Math.ceil((n ?? 1) * hitsMult - 1e-9));
  const guns = { revolver: g('revolver'), shotgun: g('shotgun'), rifle: g('rifle') };
  for (const id of GUN_IDS) guns[id].reservePerStop = per(guns[id].reserve);
  guns.revolver.need = need(guns.revolver.hitsToStall);
  guns.shotgun.need = need(guns.shotgun.tyreHits);
  guns.rifle.need = need(guns.rifle.radiatorHits);
  const ai = D.ai ?? {};
  return {
    climbSeconds: D.climbSeconds ?? rules?.roof?.climbSeconds ?? 1.6,
    availSpeed: D.availSpeed ?? 1.5,
    copNear: D.copNear ?? 40,
    autoDownRadius: D.autoDownRadius ?? 40,
    aiClimbDelay: D.aiClimbDelay ?? 0.8,
    humanTakeover: D.humanTakeover ?? 1.5,
    drawSeconds: D.drawSeconds ?? 0.35,
    heatPerShot: D.heatPerShot ?? 0.04,
    heatPerDisable: D.heatPerDisable ?? 0.15,
    ammoMult, hitsMult,
    points: { tyre: 150, radiator: 150, stall: 100, ...(D.points || {}) },
    guns,
    firecracker: { ammo: per(fc.ammo ?? 3), radius: fc.radius ?? 6, stallSeconds: fc.stallSeconds ?? 3 },
    balloon: { ammo: per(bl.ammo ?? 4), radius: bl.radius ?? 2.5, blindSeconds: bl.blindSeconds ?? 4 },
    flare: { ammo: Math.max(0, Math.round(D.flare ?? 1)), usesSmokeCharge: sf.usesSmokeCharge !== false, radius: sf.radius ?? 9, seconds: sf.seconds ?? 6 },
    ai: { accuracy: clamp(ai.accuracy ?? 0.8, 0, 1), react: ai.react ?? 0.35, range: ai.range ?? 70, shotgunRange: ai.shotgunRange ?? 16 },
    copFire: { range: 35, returnEvery: 2.4, returnDamage: 2, rookShare: 0.5, accuracy: 0.45, chaseStars: 4, chaseEvery: 6, chaseDamage: 1.5, chaseRange: 30, ...(D.copFire || {}) },
  };
}

// ── small pure helpers (exported for the client, rv.js mirrors the numbers) ──
export function rvToWorld(rv, lx, lz) {
  const c = Math.cos(rv.yaw || 0), s = Math.sin(rv.yaw || 0);
  return { x: rv.x + lx * c + lz * s, z: rv.z - lx * s + lz * c };
}
export function worldToRv(rv, x, z) {
  const c = Math.cos(rv.yaw || 0), s = Math.sin(rv.yaw || 0), dx = x - rv.x, dz = z - rv.z;
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}
/** World direction of an RV-local (yaw, pitch) aim. yaw 0 = RV forward. */
export function aimDirWorld(rv, yaw, pitch) {
  const a = (rv.yaw || 0) + yaw, cp = Math.cos(pitch);
  return { x: Math.sin(a) * cp, y: Math.sin(pitch), z: Math.cos(a) * cp };
}
/** World position of the aim pivot (Rook's shoulder line), before `reach`. */
export function pivotWorld(rv) {
  const M = ROOF_GEOM.muzzle, p = rvToWorld(rv, M.x, M.z);
  return { x: p.x, y: (rv.y || 0) + M.y, z: p.z };
}
/** legacy name (old van/roof client) */
export const nozzleWorld = pivotWorld;
/** Where a shot along (yaw, pitch) starts (pivot + reach along the aim). */
export function muzzleWorld(rv, yaw, pitch) {
  const p = pivotWorld(rv), d = aimDirWorld(rv, yaw, pitch), r = ROOF_GEOM.muzzle.reach;
  return { x: p.x + d.x * r, y: p.y + d.y * r, z: p.z + d.z * r };
}
/** RV-local { yaw, pitch } that points the aim pivot at world (x, y, z). */
export function aimAt(rv, x, z, y = ROOF_GEOM.copAimY + (rv.y || 0)) {
  const n = pivotWorld(rv), dx = x - n.x, dy = y - n.y, dz = z - n.z;
  return { yaw: wrap(Math.atan2(dx, dz) - (rv.yaw || 0)), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}
export function throwFlightTime(dist) { return 0.45 + 0.035 * Math.max(0, dist); }
/** Clamp a throw target to throwMin..throwMax metres from the RV centre. */
export function clampThrowTarget(rv, x, z) {
  const G = ROOF_GEOM;
  let dx = x - rv.x, dz = z - rv.z, d = Math.hypot(dx, dz);
  if (!(d > 1e-6)) { const f = rvToWorld(rv, 0, -1); dx = f.x - rv.x; dz = f.z - rv.z; d = 1; }
  const k = clamp(d, G.throwMin, G.throwMax) / d;
  const tx = rv.x + dx * k, tz = rv.z + dz * k;
  return { x: tx, z: tz, dist: Math.hypot(tx - rv.x, tz - rv.z) };
}
/** Legacy (the hose is gone): kept so the old van/roof client still imports. Never hits. */
export function hoseTest() { return { hit: false, dist: Infinity, ang: Math.PI, allow: 0 }; }

// slab test of a ray (o + d·t, t ∈ [0, tMax]) against an axis-aligned box → entry t or -1
function slab(ox, oy, oz, dx, dy, dz, x0, x1, y0, y1, z0, z1, tMax) {
  let t0 = 0, t1 = tMax;
  if (Math.abs(dx) < 1e-9) { if (ox < x0 || ox > x1) return -1; } else {
    let a = (x0 - ox) / dx, b = (x1 - ox) / dx; if (a > b) { const s = a; a = b; b = s; }
    if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return -1;
  }
  if (Math.abs(dy) < 1e-9) { if (oy < y0 || oy > y1) return -1; } else {
    let a = (y0 - oy) / dy, b = (y1 - oy) / dy; if (a > b) { const s = a; a = b; b = s; }
    if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return -1;
  }
  if (Math.abs(dz) < 1e-9) { if (oz < z0 || oz > z1) return -1; } else {
    let a = (z0 - oz) / dz, b = (z1 - oz) / dz; if (a > b) { const s = a; a = b; b = s; }
    if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return -1;
  }
  return t0;
}

/**
 * Ray (world origin o, unit direction d) vs one police car → { hit, dist, part, wheel, point, local }.
 * part: 'tyre' | 'radiator' | 'glass' | 'body'; wheel: 'fl'|'fr'|'rl'|'rr' for tyres.
 */
export function rayBoxCop(o, d, cop, maxDist = 200) {
  const B = COP_BOXES[cop.kind] || COP_BOXES.cop;
  const c = Math.cos(cop.yaw || 0), s = Math.sin(cop.yaw || 0);
  const rx = o.x - cop.x, ry = o.y - (cop.y || 0), rz = o.z - cop.z;
  // world → car-local (inverse of rvToWorld's rotation)
  const ox = rx * c - rz * s, oz = rx * s + rz * c, oy = ry;
  const dx = d.x * c - d.z * s, dz = d.x * s + d.z * c, dy = d.y;
  let best = -1, part = null, wheel = null, upper = false;
  const tl = slab(ox, oy, oz, dx, dy, dz, -B.hw, B.hw, B.floor, B.belt, -B.hl, B.hl, maxDist);
  if (tl >= 0) best = tl;
  if (B.cab) {
    const tu = slab(ox, oy, oz, dx, dy, dz, -B.cw, B.cw, B.belt, B.h, B.cab[0], B.cab[1], maxDist);
    if (tu >= 0 && (best < 0 || tu < best)) { best = tu; upper = true; }
  }
  const ext = B.ww / 2 + 0.03;
  for (let i = 0; i < B.wheels.length; i++) {
    const [wx, wz] = B.wheels[i];
    const xin = wx === 0 ? -ext : wx > 0 ? wx - ext - 0.12 : wx - ext;
    const xout = wx === 0 ? ext : wx > 0 ? wx + ext : wx + ext + 0.12;
    const tw = slab(ox, oy, oz, dx, dy, dz, xin, xout, 0, B.wr * 2 + 0.02, wz - B.wr - 0.04, wz + B.wr + 0.04, maxDist);
    // a tyre wins if it is in front of the body, or the body entry is right on top of the tyre (wheel arch)
    if (tw >= 0 && (best < 0 || tw <= best + 0.12) && (part !== 'tyre' || tw < best)) {
      best = tw; part = 'tyre'; upper = false;
      wheel = B.wheels.length === 2 ? (i === 0 ? 'fl' : 'rl') : WHEEL_IDS[i];
    }
  }
  if (best < 0) return { hit: false, dist: Infinity, part: null, wheel: null, point: null, local: null };
  const lx = ox + dx * best, ly = oy + dy * best, lz = oz + dz * best;
  if (part !== 'tyre' && !upper) {
    // a lower-body entry right next to a wheel, below the arch → still the tyre
    for (let i = 0; i < B.wheels.length; i++) {
      const [wx, wz] = B.wheels[i];
      const xok = wx === 0 || (Math.abs(Math.abs(lx) - Math.abs(wx)) < B.ww / 2 + 0.2 && Math.sign(lx || 1) === Math.sign(wx));   // bikes: any x
      if (Math.abs(lz - wz) < B.wr + 0.02 && ly < B.wr * 1.75 && xok) {
        part = 'tyre'; wheel = B.wheels.length === 2 ? (i === 0 ? 'fl' : 'rl') : WHEEL_IDS[i]; break;
      }
    }
  }
  if (part !== 'tyre') {
    if (upper) part = B.glass && lz >= B.glass[0] - 0.02 && lz <= B.glass[1] + 0.02 ? 'glass' : 'body';
    else part = lz >= B.hl - B.front ? 'radiator' : 'body';
  }
  const point = { x: o.x + d.x * best, y: o.y + d.y * best, z: o.z + d.z * best };
  return { hit: true, dist: best, part, wheel, point, local: { x: lx, y: ly, z: lz } };
}

/** Contract API: the shot along RV-local (aimYaw, aimPitch) from the muzzle vs one cop. */
export function rayCopHit(rv, aimYaw, aimPitch, cop, maxDist = 200) {
  const o = muzzleWorld(rv, aimYaw, aimPitch), d = aimDirWorld(rv, aimYaw, aimPitch);
  return rayBoxCop(o, d, cop, maxDist);
}

/** Nearest cop along a world ray → { hit, dist, part, wheel, point, cop } (cop = the list entry). */
export function rayCops(o, d, cops, maxDist = 200) {
  let best = null;
  for (const c of cops) {
    const dx = c.x - o.x, dz = c.z - o.z;
    if (dx * dx + dz * dz > (maxDist + 6) * (maxDist + 6)) continue;
    if (dx * d.x + dz * d.z < -6) continue;   // behind
    const r = rayBoxCop(o, d, c, best ? best.dist : maxDist);
    if (r.hit && (!best || r.dist < best.dist)) { best = r; best.cop = c; }
  }
  return best || { hit: false, dist: Infinity, part: null, wheel: null, point: null, cop: null };
}

/**
 * World point of a cop part (the AI's aim point, the client's labels). `from` (world {x, z}, optional) puts
 * body / glass points on the side of the car that faces the shooter instead of the centre line.
 */
export function copPartWorld(cop, part, wheel = 'fl', from = null) {
  const B = COP_BOXES[cop.kind] || COP_BOXES.cop;
  const c = Math.cos(cop.yaw || 0), s = Math.sin(cop.yaw || 0);
  let side = 0;
  if (from) { const fx = from.x - cop.x, fz = from.z - cop.z; side = Math.sign(fx * c - fz * s) || 1; }
  let lx = 0, ly = 0.7, lz = 0;
  if (part === 'tyre') {
    const i = Math.max(0, B.wheels.length === 2 ? (wheel && wheel[0] === 'r' ? 1 : 0) : WHEEL_IDS.indexOf(wheel));
    const w = B.wheels[i] || B.wheels[0];
    lx = w[0] + Math.sign(w[0]) * B.ww * 0.3; ly = B.wr * 0.9; lz = w[1];
  } else if (part === 'radiator') { lx = 0; ly = B.floor + (B.belt - B.floor) * 0.7; lz = B.hl - B.front * 0.3; }
  else if (part === 'glass' && B.cab) { const g = B.glass || B.cab; lx = side * B.cw * 0.85; ly = (B.belt + B.h) / 2; lz = (g[0] + g[1]) / 2; }
  else { lx = side * B.hw * 0.9; ly = (B.floor + B.belt) / 2; lz = -B.hl * 0.1; }
  return { x: cop.x + lx * c + lz * s, y: (cop.y || 0) + ly, z: cop.z - lx * s + lz * c };
}

/** A unit direction within a cone of HALF-angle `half` (rad) around d (uniform over the disc). u, v ∈ [0,1). */
export function spreadDir(d, half, u, v) {
  if (!(half > 0)) return { x: d.x, y: d.y, z: d.z };
  // orthonormal basis around d
  let ax = Math.abs(d.y) < 0.95 ? 0 : 1, ay = Math.abs(d.y) < 0.95 ? 1 : 0, az = 0;
  let bx = d.y * az - d.z * ay, by = d.z * ax - d.x * az, bz = d.x * ay - d.y * ax;
  const bl = Math.hypot(bx, by, bz) || 1; bx /= bl; by /= bl; bz /= bl;
  const cx = d.y * bz - d.z * by, cy = d.z * bx - d.x * bz, cz = d.x * by - d.y * bx;
  const r = Math.tan(half) * Math.sqrt(u), a = v * Math.PI * 2;
  const px = Math.cos(a) * r, py = Math.sin(a) * r;
  const x = d.x + bx * px + cx * py, y = d.y + by * px + cy * py, z = d.z + bz * px + cz * py;
  const l = Math.hypot(x, y, z) || 1;
  return { x: x / l, y: y / l, z: z / l };
}

function rng32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const isGun = (s) => GUN_IDS.includes(s);
const isDevice = (s) => DEVICES.includes(s);
const LAND_LIFE = { firecracker: 1.8, balloon: 6 };
const FLARE_PULSE = 0.25, FLARE_BLIND = 1.5;

export class RoofDefence {
  constructor(sim) {
    this.sim = sim;
    this.R = defendRules(sim?.rules ?? sim?.data?.rules);
    this.t = 0;
    this.active = false;          // up, climbing up or climbing down (the RV is held)
    this.climb = 0;               // 0 in the seat … 1 standing on the roof
    this.climbDir = 0;            // +1 up, −1 down, 0 steady
    this.aiMode = false;          // the sim's AI Rook aims and shoots
    this.humanT = -1e9;           // last human roof command
    this.stopId = null;           // stop he climbed up for (null = stationary RV, no stop)
    this.refilledFor = null;
    this.gun = 'revolver';        // last selected gun
    this.slot = 'revolver';       // current selection (gun or throwable)
    this.throwSel = 'firecracker';
    this.ads = false;
    this.aimYaw = Math.PI;        // RV-local; default: watching the road behind
    this.aimPitch = -0.15;
    this.cooldown = 0;            // s until the next shot
    this.reload = null;           // { gun, left, total, shell } shell = per-shell timer (shotgun)
    this.mag = { revolver: 0, shotgun: 0, rifle: 0 };
    this.reserve = { revolver: 0, shotgun: 0, rifle: 0 };
    this.ammo = { firecracker: 0, balloon: 0, flare: 0 };
    this.hits = new Map();        // copId → { revolver, shotgun, rifle } hits toward the gun's disable
    this.thrown = []; this.landed = [];
    this._nid = 1;
    this._outUntil = new Map();   // copId → time our last disable on it wears off
    this.rand = rng32(((sim?.seed ?? 1) ^ 0x5eed700f) >>> 0);
    this.ai = { enterT: 0, settle: 0, errYaw: 0, errPitch: 0, errT: 0, targetId: null, part: null, wheel: null, throwCd: 1, noCopT: 0, reloadIdle: 0, plan: null, planT: 0 };
    this.stats = { shots: 0, pellets: 0, hits: 0, disabled: { tyre: 0, radiator: 0, stall: 0 }, throws: 0, rejected: 0, dry: 0, roofHits: { firecracker: 0, balloon: 0, flare: 0 } };
    this._cache = { t: -1, cops: [], nearCop: 999, available: false, why: 'noHeat' };
    this._refill();
  }

  // ── getters (GameSim / snapshot) ─────────────────────────────────────────────
  get onRoof() { return this.active && this.climb >= 1 && this.climbDir === 0; }
  get roofRook() { return this.active && this.climb > 0.5; }
  get holdsRv() { return this.active; }
  get roofDoc() { return false; }
  get aiOn() { return this.active && this.aiMode && this.t - this.humanT >= this.R.humanTakeover; }

  // ── commands (driver-local DCMD) ─────────────────────────────────────────────
  command(cmd, src = 'driver') {
    if (!cmd || typeof cmd.type !== 'string' || src === 'cook') return false;
    const human = cmd.ai !== true && cmd.bot !== true;
    switch (cmd.type) {
      case 'defend': {
        if (cmd.on === false) { if (human) this.humanT = this.t; return this._leave('cmd'); }
        if (this.active && this.climbDir >= 0) {
          if (cmd.ai === true) this.aiMode = true;
          else if (cmd.ai === false || this.aiMode) { this.aiMode = false; this.humanT = this.t; }
          return true;
        }
        if (this.active && this.climbDir < 0) { this.climbDir = 1; this.aiMode = cmd.ai === true; return true; }   // turn around on the ladder
        return this._enter(cmd.ai === true ? 'ai' : 'human');
      }
      case 'roofAim':
        if (!this.active) return false;
        if (human) this.humanT = this.t;
        if (Number.isFinite(cmd.yaw)) this.aimYaw = wrap(cmd.yaw);
        if (Number.isFinite(cmd.pitch)) this.aimPitch = clamp(cmd.pitch, ROOF_GEOM.pitchMin, ROOF_GEOM.pitchMax);
        if (cmd.ads !== undefined) this.ads = !!cmd.ads;
        return true;
      case 'roofFire':
        if (human) this.humanT = this.t;
        return this._fire(human ? 'human' : 'ai');
      case 'roofReload':
        if (human) this.humanT = this.t;
        return this._startReload(this.gun, human ? 'human' : 'ai');
      case 'roofSelect':
        if (human) this.humanT = this.t;
        return this._select(cmd.slot);
      case 'roofThrow':
        if (human) this.humanT = this.t;
        return this._throw(cmd.device ?? this.throwSel, +cmd.x, +cmd.z, human ? 'human' : 'ai');
      default: return false;
    }
  }

  // ── availability (the DEFEND button) ─────────────────────────────────────────
  _scan() {
    if (this._cache.t === this.t) return this._cache;
    const sim = this.sim, rv = sim.rv || { x: 0, z: 0, speed: 0 };
    const cops = this._cops();
    let near = 999;
    for (const c of cops) {
      if (c.state !== 1) continue;
      const d = Math.hypot(c.x - rv.x, c.z - rv.z);
      if (d < near) near = d;
    }
    let available = false, why = null;
    const st = this._stop();
    const stars = typeof sim.heatStars === 'function' ? sim.heatStars() : (sim.heat?.stars ?? 0);
    if (sim.phase !== 'drive') why = 'noHeat';
    else if (this.active) why = null;
    else if (rv.airborne) why = 'airborne';
    else if (st && ACTIVE.has(st.state)) available = true;
    else if (!(stars >= 1)) why = 'noHeat';
    else if (near > this.R.copNear) why = 'noCop';
    else if (Math.abs(rv.speed || 0) >= this.R.availSpeed) why = 'moving';
    else available = true;
    this._cache = { t: this.t, cops, nearCop: near, available, why };
    return this._cache;
  }
  get available() { return this._scan().available; }

  _enter(who) {
    const sc = this._scan();
    if (!sc.available) {
      this.stats.rejected++;
      if (who === 'human' && this.sim.phase === 'drive') this._msg(sc.why === 'moving' ? 'Stop the RV first!' : sc.why === 'airborne' ? 'Not while we\'re in the air!' : 'Nothing to defend against right now.', 'bad');
      return false;
    }
    const st = this._stop();
    this.stopId = st && ACTIVE.has(st.state) ? st.id : null;
    this.active = true; this.climbDir = 1;
    this.aiMode = who === 'ai';
    if (who === 'human') this.humanT = this.t;
    this.ai.noCopT = 0;
    this._emit({ type: EV.DEFEND, on: true, ai: this.aiMode });
    this._msg(this.aiMode ? 'Rook climbs onto the roof with the guns!' : 'Rook\'s on the roof — hold them off!', 'info');
    return true;
  }
  _leave(why) {
    if (!this.active || this.climbDir < 0) return false;
    this.climbDir = -1; this.ads = false;
    this.reload = null;
    if (why === 'auto') this._msg('Rook climbs back into the cab.', 'info');
    return true;
  }

  // ── per tick ─────────────────────────────────────────────────────────────────
  update(dt) {
    if (!(dt > 0)) return;
    const sim = this.sim;
    if (!sim || !sim.rv) return;
    this.t += dt;
    const st = this._stop();
    const stopOn = !!(st && ACTIVE.has(st.state));
    if (stopOn && st.id !== this.refilledFor) { this.refilledFor = st.id; this._refill(); }
    if (this.active && stopOn && this.stopId == null) this.stopId = st.id;   // pulled into a lot while up there
    const drive = sim.phase === 'drive';
    const sc = this._scan();
    // solo: the AI Rook climbs up by itself at a stop
    if (!this.active) {
      this.ai.enterT = sim.solo && stopOn && drive ? this.ai.enterT + dt : 0;
      if (this.ai.enterT >= this.R.aiClimbDelay && sc.available) { this.ai.enterT = 0; this._enter('ai'); }
    }
    // timers
    this.cooldown = Math.max(0, this.cooldown - dt);
    this._updateReload(dt);
    if (drive && this.onRoof && this.aiOn) this._ai(dt, st, stopOn);
    // auto climb-down
    if (this.active && this.climbDir >= 0) {
      const clear = sc.nearCop > this.R.autoDownRadius;
      const stopOver = this.stopId != null && !(st && st.id === this.stopId && st.state !== 'done');
      this.ai.noCopT = clear ? this.ai.noCopT + dt : 0;
      // a human stays up until the lot is clear; the AI Rook (solo / bots) comes down when the stop is done
      if (!drive) this._leave('auto');
      else if (stopOver && (clear || this.aiOn)) this._leave('auto');
      else if (this.stopId == null && this.aiOn && this.ai.noCopT >= 2) this._leave('auto');
    }
    // climbing
    if (this.climbDir !== 0) {
      this.climb = clamp(this.climb + this.climbDir * dt / Math.max(0.05, this.R.climbSeconds), 0, 1);
      if (this.climbDir > 0 && this.climb >= 1) this.climbDir = 0;
      else if (this.climbDir < 0 && this.climb <= 0) {
        this.climbDir = 0; this.active = false; this.ads = false; this.stopId = null; this.reload = null;
        this._emit({ type: EV.DEFEND, on: false, ai: this.aiMode });
        this.aiMode = false;
      }
    }
    this._updateThrown(dt);
    if (this.hits.size > 64) { const live = new Set(sc.cops.map((c) => c.id)); for (const id of this.hits.keys()) if (!live.has(id)) this.hits.delete(id); }
  }

  // ── guns ─────────────────────────────────────────────────────────────────────
  _select(slot) {
    if (!SLOTS.includes(slot)) return false;
    if (isDevice(slot)) { this.slot = slot; this.throwSel = slot; return true; }
    if (slot === this.gun && this.slot === slot) return true;
    this.slot = slot;
    if (slot !== this.gun) {
      this.gun = slot; this.reload = null; this.ads = this.ads && slot === 'rifle';
      this.cooldown = Math.max(this.cooldown, this.R.drawSeconds);
      if (this.onRoof && this.mag[slot] <= 0 && this.reserve[slot] > 0) this._startReload(slot, 'auto');
    }
    return true;
  }

  _startReload(gun, who) {
    if (!isGun(gun) || !this.onRoof) return false;
    const G = this.R.guns[gun];
    if (this.reload && this.reload.gun === gun) return false;
    const missing = G.mag - this.mag[gun];
    if (missing <= 0 || this.reserve[gun] <= 0) return false;
    if (gun === 'shotgun') {
      const n = Math.min(missing, this.reserve[gun]);
      this.reload = { gun, left: n * G.reloadPerShell, total: n * G.reloadPerShell, shell: G.reloadPerShell };
    } else this.reload = { gun, left: G.reload, total: G.reload, shell: 0 };
    this._emit({ type: EV.RELOAD, gun, seconds: r2(this.reload.total) });
    return true;
  }
  _updateReload(dt) {
    const L = this.reload;
    if (!L) return;
    if (!this.onRoof || L.gun !== this.gun) { this.reload = null; return; }
    const G = this.R.guns[L.gun];
    L.left = Math.max(0, L.left - dt);
    if (L.gun === 'shotgun') {
      L.shell -= dt;
      while (L.shell <= 1e-9 && this.mag.shotgun < G.mag && this.reserve.shotgun > 0) {
        this.mag.shotgun++; this.reserve.shotgun--; L.shell += G.reloadPerShell;
      }
      if (this.mag.shotgun >= G.mag || this.reserve.shotgun <= 0) this.reload = null;
    } else if (L.left <= 0) {
      const n = Math.min(G.mag - this.mag[L.gun], this.reserve[L.gun]);
      this.mag[L.gun] += n; this.reserve[L.gun] -= n;
      this.reload = null;
    }
  }

  _fire(who) {
    const sim = this.sim;
    if (!this.onRoof || sim.phase !== 'drive' || !isGun(this.slot)) return false;
    const gun = this.gun, G = this.R.guns[gun];
    if (this.cooldown > 0) return false;
    if (this.reload) {
      if (gun === 'shotgun' && this.mag.shotgun > 0) this.reload = null;   // pump: firing interrupts the shell-by-shell reload
      else return false;
    }
    if (this.mag[gun] <= 0) {
      this.stats.dry++;
      if (!this._startReload(gun, who) && who === 'human' && this.reserve[gun] <= 0 && this.t - (this._dryMsgT ?? -9) > 3) { this._dryMsgT = this.t; this._msg(`Out of ${gun === 'shotgun' ? 'shells' : 'rounds'} — ammo refills at the next stop.`, 'bad'); }
      return false;
    }
    this.mag[gun]--;
    this.cooldown = G.interval;
    this.stats.shots++;
    if (this.R.heatPerShot > 0) sim.addHeat?.(this.R.heatPerShot, 'gunfire');
    const rv = sim.rv;
    const o = muzzleWorld(rv, this.aimYaw, this.aimPitch), d0 = aimDirWorld(rv, this.aimYaw, this.aimPitch);
    const half = (gun === 'rifle' ? (this.ads ? G.spreadAds : G.spreadHip) : G.spread / (gun === 'shotgun' ? 2 : 1)) * DEG;
    const n = gun === 'shotgun' ? Math.max(1, G.pellets | 0) : 1;
    const cops = this._scan().cops.filter((c) => c.kind !== 'heli');
    const gy = rv.y || 0;
    const pellets = [];
    const perCop = new Map();
    for (let i = 0; i < n; i++) {
      const d = spreadDir(d0, half, this.rand(), this.rand());
      const h = rayCops(o, d, cops, G.range);
      let tx, ty, tz;
      if (h.hit) { tx = h.point.x; ty = h.point.y; tz = h.point.z; }
      else {
        let t = G.range;
        if (d.y < -1e-4) t = Math.min(t, (o.y - gy) / -d.y);
        tx = o.x + d.x * t; ty = o.y + d.y * t; tz = o.z + d.z * t;
      }
      pellets.push([r2(tx), r2(ty), r2(tz), h.hit ? h.cop.id : null, h.hit ? h.part : null]);
      if (h.hit) {
        this.stats.hits++;
        let e = perCop.get(h.cop.id);
        if (!e) { e = { cop: h.cop, parts: [], point: h.point, wheel: null }; perCop.set(h.cop.id, e); }
        e.parts.push(h.part);
        if (h.part === 'tyre' && !e.wheel) { e.wheel = h.wheel; e.tyrePoint = h.point; }
        if (h.part === 'radiator' && !e.radPoint) e.radPoint = h.point;
      }
    }
    this.stats.pellets += n;
    const p0 = pellets.find((p) => p[3] != null) || pellets[0];
    const ev = { type: EV.SHOT, gun, x: r2(o.x), y: r2(o.y), z: r2(o.z), tx: p0[0], ty: p0[1], tz: p0[2], copId: p0[3], part: p0[4], ai: who === 'ai' };
    if (gun === 'shotgun') ev.pellets = pellets;
    this._emit(ev);
    for (const e of perCop.values()) this._applyHits(gun, G, e);
    // empty → start reloading by itself
    if (this.mag[gun] <= 0 && this.reserve[gun] > 0) this._startReload(gun, 'auto');
    return true;
  }

  _applyHits(gun, G, e) {
    const c = e.cop, id = c.id;
    const counts = this.hits.get(id) || { revolver: 0, shotgun: 0, rifle: 0 };
    this.hits.set(id, counts);
    const gaveUp = c.state === 4 || c.state === 5;
    const n = (p) => e.parts.filter((x) => x === p).length;
    const tyre = n('tyre'), rad = n('radiator'), glass = n('glass'), body = n('body');
    const eff = {};
    let effect = 'hole', how = null, secs = 0, part = e.parts[0];
    let pt = e.point;
    if (gun === 'revolver') {
      eff.hole = 1;
      if (glass) { eff.crack = true; effect = 'crack'; }
      if (!gaveUp && c.state !== 9 && c.state !== 10) {
        counts.revolver += 1;
        if (counts.revolver >= G.need) { counts.revolver = 0; eff.stall = G.stallSeconds; how = 'stall'; secs = G.stallSeconds; effect = 'stall'; }
      }
    } else if (gun === 'shotgun') {
      const holes = rad + glass + body;
      if (holes) eff.hole = holes;
      if (glass) eff.crack = true;
      if (tyre) {
        part = 'tyre'; pt = e.tyrePoint || pt;
        if (!gaveUp && c.state !== 9) {
          counts.shotgun += tyre;
          if (counts.shotgun >= G.need) { counts.shotgun = 0; eff.tyre = e.wheel || 'fl'; how = 'tyre'; secs = G.tyreSeconds; effect = 'tyre'; }
          else effect = 'hole';
        }
      } else effect = glass ? 'crack' : 'hole';
    } else {
      if (rad) {
        part = 'radiator'; pt = e.radPoint || pt;
        eff.hole = 1;
        if (!gaveUp && c.state === 10) { eff.radiator = true; secs = G.radiatorSeconds; effect = 'radiator'; }   // already steaming: keeps it stalled
        else if (!gaveUp) {
          counts.rifle += 1;
          if (counts.rifle >= G.need) { counts.rifle = 0; eff.radiator = true; how = 'radiator'; secs = G.radiatorSeconds; effect = 'radiator'; }
        }
      } else if (glass) { eff.crack = true; effect = 'crack'; }
      else eff.hole = 1;
    }
    this._effect(id, eff, how, secs);
    this._emit({ type: EV.COP_HIT, copId: id, gun, part, x: r2(pt.x), y: r2(pt.y), z: r2(pt.z), effect });
    if (how) {
      this.stats.disabled[how]++;
      this._emit({ type: EV.COP_DISABLED, copId: id, how, x: r2(c.x), z: r2(c.z) });
      if (this.R.heatPerDisable > 0) this.sim.addHeat?.(this.R.heatPerDisable, 'copDisabled');
      const pts = this.R.points[how] | 0;
      if (pts && typeof this.sim.addPoints === 'function') this.sim.addPoints(pts, 'copDisabled');
    }
  }

  // ── throwables ───────────────────────────────────────────────────────────────
  _smokeCharges() { return Math.max(0, this.sim?.inv?.gadgets?.smoke | 0); }
  _flareAmmo() { return this.R.flare.usesSmokeCharge ? Math.min(this.ammo.flare | 0, this._smokeCharges()) : this.ammo.flare | 0; }
  _refill() {
    const R = this.R;
    for (const id of GUN_IDS) { this.mag[id] = R.guns[id].mag; this.reserve[id] = R.guns[id].reservePerStop; }
    this.ammo.firecracker = R.firecracker.ammo;
    this.ammo.balloon = R.balloon.ammo;
    this.ammo.flare = R.flare.ammo;
    this.reload = null;
  }
  _useSmoke(x, z) {
    const sim = this.sim;
    if (typeof sim.useGadget === 'function') return !!sim.useGadget('smoke', { x, z, place: false, source: 'roof' });
    const g = sim.inv?.gadgets;
    if (g && g.smoke > 0) { g.smoke--; return true; }
    return false;
  }
  _throw(device, x, z, who = 'human') {
    if (!isDevice(device) || !Number.isFinite(x) || !Number.isFinite(z)) return false;
    if (!this.onRoof || this.sim.phase !== 'drive') { this.stats.rejected++; return false; }
    const rv = this.sim.rv, tgt = clampThrowTarget(rv, x, z);
    if (device === 'flare') {
      if ((this.ammo.flare | 0) <= 0) { this.stats.rejected++; if (who === 'human') this._msg('No flare left — the next stop has one.', 'bad'); return false; }
      if (this.R.flare.usesSmokeCharge && !this._useSmoke(tgt.x, tgt.z)) { this.stats.rejected++; if (who === 'human') this._msg('A flare needs a smoke bomb — cook one!', 'bad'); return false; }
      this.ammo.flare--;
    } else {
      if ((this.ammo[device] | 0) <= 0) { this.stats.rejected++; if (who === 'human') this._msg(device === 'firecracker' ? 'Out of firecrackers!' : 'Out of paint balloons!', 'bad'); return false; }
      this.ammo[device]--;
    }
    const h = rvToWorld(rv, ROOF_GEOM.hand.x, ROOF_GEOM.hand.z);
    this.thrown.push({ id: this._nid++, device, x0: h.x, z0: h.z, x: tgt.x, z: tgt.z, t: 0, T: throwFlightTime(tgt.dist) });
    this.stats.throws++;
    return true;
  }
  _updateThrown(dt) {
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const p = this.thrown[i];
      p.t += dt;
      if (p.t < p.T) continue;
      this.thrown.splice(i, 1);
      this._land(p);
    }
    for (let i = this.landed.length - 1; i >= 0; i--) {
      const e = this.landed[i];
      e.t += dt;
      if (e.device === 'flare' && e.t < e.life) {
        e.pulse -= dt;
        if (e.pulse <= 0) { e.pulse += FLARE_PULSE; this._radius(e, this.R.flare.radius, { blind: FLARE_BLIND }); }
      }
      if (e.t >= e.life) this.landed.splice(i, 1);
    }
  }
  _land(p) {
    const e = { id: p.id, device: p.device, x: p.x, z: p.z, t: 0, life: p.device === 'flare' ? this.R.flare.seconds : LAND_LIFE[p.device], hit: new Set(), pulse: 0 };
    if (p.device === 'firecracker') this._radius(e, this.R.firecracker.radius, { stall: this.R.firecracker.stallSeconds });
    else if (p.device === 'balloon') this._radius(e, this.R.balloon.radius, { blind: this.R.balloon.blindSeconds });
    else { e.pulse = FLARE_PULSE; this._radius(e, this.R.flare.radius, { blind: FLARE_BLIND }); }
    this.landed.push(e);
  }
  _radius(e, r, effect) {
    const rr = r * r;
    for (const c of this._cops()) {
      const dx = c.x - e.x, dz = c.z - e.z;
      if (dx * dx + dz * dz > rr || c.state === 5) continue;
      if (c.state === 9 || c.state === 10) continue;   // already out: don't shorten a tyre-out / radiator stall
      this._effect(c.id, { ...effect });
      if (!e.hit.has(c.id)) {
        e.hit.add(c.id);
        this.stats.roofHits[e.device]++;
        this._emit({ type: EV.ROOF_HIT, copId: c.id, device: e.device, x: r2(c.x), z: r2(c.z) });
      }
    }
  }

  // ── AI Rook ──────────────────────────────────────────────────────────────────
  // Threats: running cops in range, the ones already inside the bust ring first, then the closest /
  // fastest closing. Gun: shotgun at a tyre when one is close and side-on, rifle (scoped) at the
  // radiator when the nose shows, else the revolver (3 hits). Aim: tracks the part with an error that is
  // re-rolled every 0.45 s (on target with probability ai.accuracy) and fires once the error left is
  // inside a size-of-the-part tolerance. Reloads when idle; switches guns instead of waiting on a reload
  // while a cop is close.
  _ai(dt, st, stopOn) {
    const A = this.ai, sim = this.sim, rv = sim.rv, R = this.R, AI = R.ai;
    const cops = this._scan().cops;
    const bustR = (sim.rules?.heat?.bust?.radius ?? 7.5) + 3;
    let best = null, bs = Infinity;
    for (const c of cops) {
      if (c.kind === 'heli' || c.state === 4 || c.state === 5 || c.state === 9) continue;
      const d = Math.hypot(c.x - rv.x, c.z - rv.z);
      if (d > AI.range) continue;
      if (c.state !== 1) {
        // stalled / steaming / blinded / soaked: only worth a shot when it is ours and about to wear off
        const until = this._outUntil.get(c.id);
        if (until == null || until - this.t > (c.state === 10 ? 1.4 : 0.6) || !(c.state === 7 || c.state === 8 || c.state === 2 || c.state === 6 || c.state === 10)) continue;
      }
      const vx = Math.sin(c.yaw || 0) * (c.speed || 0), vz = Math.cos(c.yaw || 0) * (c.speed || 0);
      const close = -((c.x - rv.x) * vx + (c.z - rv.z) * vz) / Math.max(1, d);
      const score = (d < bustR ? -100 : 0) + d - 2.5 * Math.max(0, close) + (c.id === A.targetId ? -2 : 0);
      if (score < bs) { bs = score; best = c; }
    }
    if (!best) {
      A.targetId = null; A.settle = 0; this.ads = false;
      A.reloadIdle += dt;
      if (A.reloadIdle > 0.6 && !this.reload) {
        const g = [this.gun, ...GUN_IDS].find((id) => this.mag[id] < R.guns[id].mag && this.reserve[id] > 0);
        if (g) { if (this.gun !== g) this._select(g); else this._startReload(g, 'ai'); }
      }
      this._aiThrow(dt, cops, st);
      return;
    }
    A.reloadIdle = 0;
    const d = Math.hypot(best.x - rv.x, best.z - rv.z);
    // plan (re-evaluated every 0.25 s or on a new target): the first option whose part is actually in
    // view — a straight ray from the muzzle at that part hits that part of that car
    A.planT -= dt;
    if (!A.plan || A.plan.id !== best.id || A.planT <= 0) { A.plan = this._aiPlan(best, d, cops, A.plan && A.plan.id === best.id ? A.plan : null); A.planT = 0.25; }
    const plan = A.plan;
    if (!plan) { this._aiThrow(dt, cops, st, true); return; }
    const gun = plan.gun, part = plan.part, wheel = plan.wheel;
    if (this.gun !== gun || this.slot !== gun) this._select(gun);
    this.ads = gun === 'rifle';
    if (best.id !== A.targetId || part !== A.part) { A.targetId = best.id; A.part = part; A.settle = 0; A.errT = 0; }
    A.wheel = wheel;
    A.errT -= dt;
    if (A.errT <= 0) {
      A.errT = 0.45;
      const tol = gun === 'shotgun' ? 1.0 : gun === 'rifle' ? 0.3 : 0.6;   // degrees "on target"
      const miss = this.rand() >= AI.accuracy;
      const mag = (miss ? tol * (2.5 + this.rand() * 3) : tol * this.rand()) * DEG;
      const a = this.rand() * Math.PI * 2;
      A.errYaw = Math.cos(a) * mag; A.errPitch = Math.sin(a) * mag * 0.7;
    }
    const lead = 0.12;
    const vx = Math.sin(best.yaw || 0) * (best.speed || 0), vz = Math.cos(best.yaw || 0) * (best.speed || 0);
    const p = copPartWorld({ ...best, x: best.x + vx * lead, z: best.z + vz * lead }, part, wheel, rv);
    const want = aimAt(rv, p.x, p.z, p.y);
    const k = 1 - Math.exp(-dt * 16);
    const dy = wrap(want.yaw + A.errYaw - this.aimYaw), dp = want.pitch + A.errPitch - this.aimPitch;
    this.aimYaw = wrap(this.aimYaw + dy * k);
    this.aimPitch = clamp(this.aimPitch + dp * k, ROOF_GEOM.pitchMin, ROOF_GEOM.pitchMax);
    A.settle += dt;
    const tolR = clamp(0.3 / Math.max(1, d), 0.006, 0.05);
    if (A.settle >= AI.react && Math.abs(dy) < tolR && Math.abs(dp) < tolR && d <= R.guns[gun].range) this._fire('ai');
    this._aiThrow(dt, cops, st);
  }
  /** AI: pick { gun, part, wheel } for a target — the first option in priority order that is loaded and in view. */
  _aiPlan(c, d, cops, prev = null) {
    const rv = this.sim.rv, R = this.R, AI = R.ai;
    const loaded = (g) => this.mag[g] > 0 || (this.reserve[g] > 0 && d > 20);
    const ammo = (g) => this.mag[g] + this.reserve[g] > 0;
    // the gun in hand is reloading while a cop is close → prefer another loaded gun
    const ok = (g) => ammo(g) && (this.gun === g ? !(this.reload && d < 20 && GUN_IDS.some((o) => o !== g && this.mag[o] > 0)) : loaded(g));
    const sees = (part, wheel) => {
      const p = copPartWorld(c, part, wheel, rv), a = aimAt(rv, p.x, p.z, p.y);
      const h = rayCops(muzzleWorld(rv, a.yaw, a.pitch), aimDirWorld(rv, a.yaw, a.pitch), cops, 200);
      return h.hit && h.cop.id === c.id && h.part === part;
    };
    // wheels nearest first
    const wheels = (COP_BOXES[c.kind] || COP_BOXES.cop).wheels.length === 2 ? ['fl', 'rl'] : WHEEL_IDS.slice();
    wheels.sort((a, b) => { const pa = copPartWorld(c, 'tyre', a), pb = copPartWorld(c, 'tyre', b); return Math.hypot(pa.x - rv.x, pa.z - rv.z) - Math.hypot(pb.x - rv.x, pb.z - rv.z); });
    // keep the current plan while it still works (no gun juggling)
    if (prev && ok(prev.gun) && d <= R.guns[prev.gun].range && (c.state !== 10 || prev.part === 'radiator') && sees(prev.part, prev.wheel)) return prev;
    const opts = [];
    if (c.state === 10) opts.push(['rifle', 'radiator']);
    else {
      if (d <= AI.shotgunRange) for (const w of wheels) opts.push(['shotgun', 'tyre', w]);
      opts.push(['rifle', 'radiator']);
      for (const w of wheels) if (d <= R.guns.shotgun.range * 0.9) opts.push(['shotgun', 'tyre', w]);
      opts.push(['revolver', 'body'], ['revolver', 'glass'], ['rifle', 'body']);
    }
    for (const [gun, part, wheel] of opts) {
      if (!ok(gun) || d > R.guns[gun].range) continue;
      if (sees(part, wheel || 'fl')) return { id: c.id, gun, part, wheel: wheel || 'fl' };
    }
    // nothing clean in view: the revolver at whatever shows (any hit counts toward its stall)
    for (const gun of ['revolver', 'rifle', 'shotgun']) if (ok(gun) && d <= R.guns[gun].range) return { id: c.id, gun, part: 'body', wheel: 'fl' };
    return null;
  }
  _aiThrow(dt, cops, st, dry = false) {
    const A = this.ai, rv = this.sim.rv, R = this.R;
    A.throwCd -= dt;
    if (A.throwCd > 0 || (this.ammo.firecracker | 0) + (this.ammo.balloon | 0) <= 0) return;
    const P = [];
    for (const c of cops) {
      if (c.state !== 1 || c.kind === 'heli') continue;
      const d = Math.hypot(c.x - rv.x, c.z - rv.z);
      if (d > ROOF_GEOM.throwMax || d < ROOF_GEOM.throwMin) continue;
      const T = throwFlightTime(d), sp = c.speed || 0;
      P.push({ id: c.id, d, x: c.x + Math.sin(c.yaw || 0) * sp * T, z: c.z + Math.cos(c.yaw || 0) * sp * T });
    }
    if (!P.length) return;
    P.sort((a, b) => a.d - b.d || a.id - b.id);
    let dev = null, tx = 0, tz = 0;
    const fr = R.firecracker.radius;
    // a firecracker at 2+ running cops bunched together inside 20 m; anything once the guns are dry
    let cl = null;
    for (const p of P) {
      if (p.d > 20) continue;
      const m = P.filter((q) => Math.hypot(q.x - p.x, q.z - p.z) <= fr * 0.85);
      if (m.length >= 2 && (!cl || m.length > cl.length)) cl = m;
    }
    if (cl && this.ammo.firecracker > 0) { dev = 'firecracker'; tx = cl.reduce((a, q) => a + q.x, 0) / cl.length; tz = cl.reduce((a, q) => a + q.z, 0) / cl.length; }
    else if (dry) { dev = this.ammo.balloon > 0 ? 'balloon' : 'firecracker'; tx = P[0].x; tz = P[0].z; }
    if (!dev) return;
    const miss = () => (this.rand() < R.ai.accuracy ? 0.6 : 2.5) * (this.rand() - 0.5) * 2;
    A.throwCd = this._throw(dev, tx + miss(), tz + miss(), 'ai') ? 3 : 0.5;
  }

  // ── snapshot ─────────────────────────────────────────────────────────────────
  state() {
    const sc = this._scan();
    const fx = [];
    for (const p of this.thrown) fx.push({ id: p.id, device: p.device, phase: 'fly', x0: r2(p.x0), z0: r2(p.z0), x: r2(p.x), z: r2(p.z), t: r3(p.t), T: r3(p.T) });
    for (const e of this.landed) fx.push({ id: e.id, device: e.device, phase: 'land', x0: r2(e.x), z0: r2(e.z), x: r2(e.x), z: r2(e.z), t: r3(e.t), T: r3(e.life) });
    const throwables = { firecracker: this.ammo.firecracker | 0, balloon: this.ammo.balloon | 0, flare: this._flareAmmo() };
    return {
      active: this.active,
      climbing: this.climbDir !== 0,
      climbDir: this.climbDir > 0 ? 'up' : this.climbDir < 0 ? 'down' : null,
      climb: r3(this.climb),
      onRoof: this.onRoof,
      ai: this.aiOn,
      available: sc.available,
      why: sc.available ? null : sc.why,
      nearCop: Math.round(Math.min(999, sc.nearCop) * 10) / 10,
      gun: this.gun,
      slot: this.slot,
      ads: this.ads,
      aimYaw: r3(this.aimYaw),
      aimPitch: r3(this.aimPitch),
      reloading: this.reload ? r2(this.reload.left) : 0,
      reloadT: this.reload ? r2(this.reload.total) : 0,
      cooldown: r2(this.cooldown),
      mag: { ...this.mag },
      reserve: { ...this.reserve },
      throwables,
      fx,
      // legacy keys (old outside view / van roof client): no hose any more
      spray: false,
      ammo: throwables,
    };
  }

  // ── helper-API adapters ──────────────────────────────────────────────────────
  _stop() {
    const sim = this.sim;
    if (sim.stop !== undefined) {
      const s = sim.stop;
      if (!s) return null;
      return { id: s.id ?? s.def?.id ?? null, state: s.state };
    }
    const cur = sim.stops?.current;
    return cur ? { id: cur.def?.id ?? null, state: 'loading' } : null;
  }
  _cops() {
    const sim = this.sim;
    let list;
    if (typeof sim.copsList === 'function') list = sim.copsList() || [];
    else list = (sim.cops?.cops || []).filter((c) => !c.dead).map((c) => ({ id: c.id, kind: c.kind, x: c.x, y: c.y, z: c.z, yaw: c.yaw, speed: c.speed, state: c.state }));
    return list.filter((c) => c && c.kind !== 'heli' && (!c.kind || COP_KIND_SET.has(c.kind)) && c.state !== 4);
  }
  _copState(id) {
    const c = this._cops().find((k) => k.id === id);
    return c ? c.state : null;
  }
  _effect(id, e, how = null, secs = 0) {
    const sim = this.sim;
    const until = this.t + Math.max(e.stall || 0, e.blind || 0, e.soak || 0, secs || 0);
    if (until > (this._outUntil.get(id) ?? -1)) this._outUntil.set(id, until);
    this._cache.t = -1;   // cop states change → rescan
    if (typeof sim.applyCopEffect === 'function') {
      sim.applyCopEffect(id, e);
      // an older cops.js without states 9/10: fall back to a stall of the same length so the shot still counts
      if ((how === 'tyre' || how === 'radiator') && secs > 0) {
        const s = this._copState(id);
        if (s != null && s !== 9 && s !== 10) sim.applyCopEffect(id, { stall: secs });
      }
      return;
    }
    const c = sim.cops?.cops?.find((k) => k.id === id);
    const s = Math.max(e.stall || 0, e.blind || 0, secs || 0);
    if (c && s > 0 && typeof sim.cops.blind === 'function') sim.cops.blind(c, s);
  }
  _emit(ev) { if (typeof this.sim.emit === 'function') this.sim.emit(ev); }
  _msg(text, tone = 'info') {
    if (typeof this.sim.msg === 'function') this.sim.msg(text, tone);
    else this._emit({ type: EV.MSG, text, tone });
  }
}

export default RoofDefence;
