// ─────────────────────────────────────────────────────────────────────────────
// GarageTutorial — the on-foot opening in Rook's Garage (Agent ONFOOT). PURE LOGIC:
// no DOM, no three.js, no Math.random. Deterministic given the inputs.
//
//   const g = new GarageTutorial(sim);     // sim: { track, route|data, solo, emit(ev) } (GameSim helper API)
//   g.update(dt, driverInput);             // Rook: input.moveX/moveZ (world, −1..1), input.run,
//                                          //       input.interact (edge), input.interactHeld (level, optional), input.jump (edge)
//   g.command(cmd);                        // Doc:  CMD.avatarMove { mx, mz, run, hold } (world; hold = E held, 0|1)
//                                          //       · CMD.avatarAct {} · CMD.avatarJump {}
//   g.skip();                              // DCMD.skipTutorial → everything done, both suited + in the RV, engine on
//   g.state();                             // → snapshot.garage (EXPANSION_CONTRACT.md "Snapshot additions")
//   g.done                                 // true once the engine is running (SIM-CORE → phase 'countdown')
//   g.rook / g.doc                         // world {x, z, yaw, speed, carry, inRv}
//   g.rvPark                               // world {x, z, yaw}: where the RV sits (static) during the tutorial
//
// Space: everything is simulated in GARAGE-INTERIOR-LOCAL coordinates (the `garage_interior` model's
// own frame: origin floor centre, roll-up door on +Z, RV bay at x≈4) and converted at the edges.
// The interior frame sits inside the `rooks_garage` exterior frame G (centre x = track.xAt(45,+18),
// z = 45, rotation.y = +π/2) at local offset EXT_OFFSET, so its rvPark lands on the exterior's `bay`
// and the two roll-up doors line up. local (lx, lz) → world (ox + lz, oz − lx); world yaw = local + π/2.
//
// Steps (ids in STEPS): 0 markers · 1 suit · 2 grab · 3 load (Doc) · 4 door (Rook) · 5 board · 6 crank.
// 3 and 4 run in parallel (different players); `step` is the first unfinished step.
// R3-GARAGE "Suit up": each player walks to the suit rack on the back wall and holds E for 1.5 s
// (Rook: input.interactHeld · Doc: avatarMove.hold, re-sent at ~15 Hz while held). A tap of E counts
// as `tapHold` (0.7 s) of holding, so tapping/mashing E works too (and bots/old clients that only
// send edges); with no held field at all a single press suits up by itself (like the crank).
//
// Unity port: one MonoBehaviour (GarageTutorial) + a static GarageLayout; avatars are kinematic
// CharacterControllers fed by the same velocity model (moveAvatar), colliders are the BOXES/CIRCLES below.
// ─────────────────────────────────────────────────────────────────────────────

import { JUMP, tryJump, stepJump, resetJump } from '../shared/jump.js';
// R3-GARAGE: the lab dressing + suit rack placements (pure data, no three.js) — colliders and the Suit up spots
import { R3_GARAGE_BOXES, R3_SUIT_UP } from '../assets/expansion/r3-garage-layout.js';

export const STEPS = Object.freeze(['markers', 'suit', 'grab', 'load', 'door', 'board', 'crank']);

/** Interior-local offset of `garage_interior` inside the `rooks_garage` exterior frame. */
export const EXT_OFFSET = Object.freeze({ x: -1.8, z: -2.0 });

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const r3 = (v) => Math.round(v * 1000) / 1000;

/** Static layout (interior-local metres). Shared by the sim and the client view (GarageView). */
export const LAYOUT = Object.freeze({
  room: { minX: -9, maxX: 9, minZ: -7, maxZ: 7 },
  door: { x0: 1.5, x1: 6.5, z: 7.07, open: 4.6 },
  rvPark: { x: 4.0, z: -0.2, yaw: 0, w: 2.6, l: 8.6 },
  // static colliders: AABBs [minX, maxX, minZ, maxZ] and circles [x, z, r]
  boxes: [
    [-8.65, -4.55, -7.0, -6.15],   // workbench + pegboard
    [-4.05, -1.85, -7.0, -6.3],    // red tool chests
    [-9.0, -8.1, -3.5, -1.8],      // desk
    [-9.0, -8.2, -1.15, -0.35],    // fridge
    [-9.0, -8.0, 1.05, 3.45],      // sofa
    // two-post lift: the car body (underside 1.47 m, Doc is 1.81 m) + each post with its arms (1.48 m).
    // The bay beside the car's ends is open floor below 1.4 m, so it is not walled off.
    [-5.1, -3.3, 1.3, 5.9],        // project car on the lift
    [-6.45, -5.1, 2.7, 4.5],       // lift post (x -5.9) + arms + control box
    [-3.3, -2.2, 2.7, 4.5],        // lift post (x -2.5) + arms
    [-2.2, -1.75, 1.95, 5.25],     // leaning tyres on the lift-bay line (one flat face: no notch to snag on)
    [8.2, 9.0, 2.1, 5.7],          // shelving rack + compressor
    [2.65, 5.35, -4.55, 4.15],     // the parked RV (8.6 × 2.6 + mirrors)
    // R3-GARAGE lab dressing along the walls (r3-garage-layout.js; clear of every walk path):
    // chem bench, fume hood, reagent shelf, suit rack, safety station (back wall), recipe whiteboard
    // (left wall), drums, gas cylinders, jerrycans (right wall)
    ...R3_GARAGE_BOXES.map((b) => b.slice()),
  ],
  circles: [
    [-7.6, -2.6, 0.32],            // desk chair
    [-7.15, 2.25, 0.55],           // cable-spool table
    [-1.4, 5.9, 0.38],             // tyre stack
    [8.3, -6.3, 0.32], [7.6, -6.4, 0.32], [8.35, -5.6, 0.32], [7.3, -5.3, 0.5],   // oil drums
    [-0.4, 6.5, 0.3],              // trash barrel
  ],
  // where things are / where you stand to use them
  markers: { rook: { x: -4.25, z: -6.0 }, doc: { x: -7.05, z: -2.65 } },   // marker_1 (key rack), marker_0 (desk)
  use: {
    keys: { x: -4.25, z: -6.0 },
    notebook: { x: -7.05, z: -2.65 },
    plug: { x: 6.75, z: -1.6 },
    button: { x: 0.9, z: 6.35 },
    sideDoor: { x: 2.05, z: 0.7 },
    driverDoor: { x: 5.95, z: 2.35 },
    // R3-GARAGE: Suit up — one spot per suit, 0.68 m in front of the rack, 1.25 m clear of the RV's tail
    suit: { rook: { x: R3_SUIT_UP.use.rook.x, z: R3_SUIT_UP.use.rook.z }, doc: { x: R3_SUIT_UP.use.doc.x, z: R3_SUIT_UP.use.doc.z } },
  },
  suitRack: { x: 5.31, z: -6.73, glow: { x: R3_SUIT_UP.marker.x, z: R3_SUIT_UP.marker.z } },   // R3-GARAGE
  items: {
    keys: { x: -4.25, y: 1.52, z: -6.925 },
    notebook: { x: -8.5, y: 0.76, z: -2.8 },
    plug: { x: 6.05, y: 0, z: -2.2 },
    button: { x: 0.9, y: 1.4, z: 6.96 },
  },
  crateStart: { x: -0.9, z: -5.45, yaw: 0.25 },
  start: { rook: { x: 0.7, z: 3.4, yaw: Math.PI }, doc: { x: -0.7, z: 3.9, yaw: Math.PI } },
});

const DEF = Object.freeze({
  walk: 2.6, run: 4.2, carry: 1.9, accel: 16, radius: 0.3, interact: 1.2, markerRadius: 0.9,
  crateRadius: 0.42, doorSeconds: 3, holdSeconds: 1.5, crankSeconds: 2.0, onToDone: 0.6, cmdTimeout: 0.5,
  suitSeconds: R3_SUIT_UP.holdSeconds ?? 1.5, tapHold: 0.7,   // R3-GARAGE: Suit up hold; one E tap = 0.7 s of holding
});

/**
 * Garage frame from the track (pure). Returns converters between interior-local and world space.
 * G = rooks_garage frame (centre x = track.xAt(z, +18), z, rotation.y = +π/2); interior = G ∘ EXT_OFFSET.
 */
export function garageFrame(track, route) {
  const st = (route?.structures || []).find((s) => s.type === 'garage') || {};
  const z = st.z ?? route?.start?.z ?? 45;
  const side = st.side ?? 1;
  let gx = 0;
  try { gx = track && typeof track.xAt === 'function' ? track.xAt(z, side * 18) : 0; } catch (e) { gx = 0; }
  const rot = side >= 0 ? Math.PI / 2 : -Math.PI / 2;
  const c = Math.cos(rot), s = Math.sin(rot);
  // interior origin in world = G · offset
  const ox = gx + EXT_OFFSET.x * c + EXT_OFFSET.z * s;
  const oz = z - EXT_OFFSET.x * s + EXT_OFFSET.z * c;
  return {
    gx, gz: z, rot, ox, oz,
    /** interior-local point → world */
    toWorld(lx, lz) { return { x: ox + lx * c + lz * s, z: oz - lx * s + lz * c }; },
    /** world point → interior-local */
    toLocal(wx, wz) { const dx = wx - ox, dz = wz - oz; return { x: dx * c - dz * s, z: dx * s + dz * c }; },
    /** world direction → local direction */
    dirToLocal(dx, dz) { return { x: dx * c - dz * s, z: dx * s + dz * c }; },
    dirToWorld(lx, lz) { return { x: lx * c + lz * s, z: -lx * s + lz * c }; },
    yawToWorld(y) { return y + rot; },
    yawToLocal(y) { return y - rot; },
  };
}

// ── shared avatar motion (also used by GarageView for the cook's client-side prediction) ──
/** Push a circle (x, z, r) out of the static colliders + extra circles. Mutates p. */
export function pushOut(p, r, extra = null) {
  const L = LAYOUT;
  for (let it = 0; it < 3; it++) {
    let moved = false;
    for (const b of L.boxes) {
      const cx = clamp(p.x, b[0], b[1]), cz = clamp(p.z, b[2], b[3]);
      let dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-10) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
      else { // centre inside the box: leave by the nearest face
        const opts = [[b[0] - r - p.x, 0], [b[1] + r - p.x, 0], [0, b[2] - r - p.z], [0, b[3] + r - p.z]];
        opts.sort((u, v) => Math.abs(u[0] + u[1]) - Math.abs(v[0] + v[1]));
        p.x += opts[0][0]; p.z += opts[0][1];
      }
      moved = true;
    }
    const circ = extra ? L.circles.concat(extra) : L.circles;
    for (const c of circ) {
      const dx = p.x - c[0], dz = p.z - c[1], rr = r + c[2];
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 1e-6;
      const nx = d2 > 1e-12 ? dx / d : 1, nz = d2 > 1e-12 ? dz / d : 0;
      p.x = c[0] + nx * rr; p.z = c[1] + nz * rr;
      moved = true;
    }
    p.x = clamp(p.x, L.room.minX + r, L.room.maxX - r);
    p.z = clamp(p.z, L.room.minZ + r, L.room.maxZ - r);
    if (!moved) break;
  }
  return p;
}

/**
 * One step of the avatar velocity model (local space). av: {x,z,yaw,vx,vz,speed,walkPhase,carry}.
 * mx/mz: desired LOCAL direction (−1..1, length ≤ 1). extra: dynamic circles [[x,z,r],…].
 */
export function moveAvatar(av, mx, mz, run, dt, extra = null, cfg = DEF) {
  let l = Math.hypot(mx, mz);
  if (l > 1) { mx /= l; mz /= l; l = 1; }
  const max = av.carry ? cfg.carry : run ? cfg.run : cfg.walk;
  const tvx = mx * max, tvz = mz * max;
  const ax = tvx - av.vx, az = tvz - av.vz, al = Math.hypot(ax, az), step = cfg.accel * dt * (av.jt >= 0 ? JUMP.airControl : 1);
  if (al > step) { av.vx += (ax / al) * step; av.vz += (az / al) * step; } else { av.vx = tvx; av.vz = tvz; }
  const px = av.x, pz = av.z;
  const p = { x: av.x + av.vx * dt, z: av.z + av.vz * dt };
  pushOut(p, cfg.radius, extra);
  av.x = p.x; av.z = p.z;
  // velocity after collision (sliding) → speed for the walk cycle
  const rvx = dt > 0 ? (av.x - px) / dt : 0, rvz = dt > 0 ? (av.z - pz) / dt : 0;
  if (Math.abs(rvx) < Math.abs(av.vx)) av.vx = rvx;
  if (Math.abs(rvz) < Math.abs(av.vz)) av.vz = rvz;
  av.speed = Math.hypot(rvx, rvz);
  if (l > 0.1 && av.speed > 0.05) {
    const want = Math.atan2(mx, mz);
    av.yaw = av.yaw + wrap(want - av.yaw) * Math.min(1, dt * 12);
  }
  av.walkPhase = (av.walkPhase || 0) + av.speed * dt * (av.carry ? 4.6 : 4.2);
  return av;
}

// ── tiny visibility-graph path planner (solo AI Doc) ─────────────────────────
function segHitsBox(ax, az, bx, bz, b, m) {
  const x0 = b[0] - m, x1 = b[1] + m, z0 = b[2] - m, z1 = b[3] + m;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dz, az - z0], [dz, z1 - az]]) {
    if (Math.abs(p) < 1e-12) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t0 < t1 - 1e-9;
}
function segHitsCircle(ax, az, bx, bz, c, m) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? clamp(((c[0] - ax) * dx + (c[1] - az) * dz) / l2, 0, 1) : 0;
  const px = ax + dx * t - c[0], pz = az + dz * t - c[1];
  return px * px + pz * pz < (c[2] + m) * (c[2] + m);
}
const dBox = (x, z, b) => Math.hypot(x - clamp(x, b[0], b[1]), z - clamp(z, b[2], b[3]));
const dCircle = (x, z, c) => Math.hypot(x - c[0], z - c[1]) - c[2];
// An endpoint closer to an obstacle than the margin shrinks that obstacle's margin for the segment
// (targets such as the notebook spot sit right next to furniture; pushOut handles the last cm).
function segClear(ax, az, bx, bz, m) {
  for (const b of LAYOUT.boxes) { const mm = Math.min(m, dBox(ax, az, b) - 0.02, dBox(bx, bz, b) - 0.02); if (mm >= 0 && segHitsBox(ax, az, bx, bz, b, mm)) return false; }
  for (const c of LAYOUT.circles) { const mm = Math.min(m, dCircle(ax, az, c) - 0.02, dCircle(bx, bz, c) - 0.02); if (mm >= 0 && segHitsCircle(ax, az, bx, bz, c, mm)) return false; }
  return true;
}
let _nodes = null, _vis = null;
function navNodes() {
  if (_nodes) return _nodes;
  const m = DEF.radius + 0.22, R = LAYOUT.room, pts = [];
  const ok = (x, z) => x > R.minX + 0.35 && x < R.maxX - 0.35 && z > R.minZ + 0.35 && z < R.maxZ - 0.35;
  for (const b of LAYOUT.boxes) for (const [x, z] of [[b[0] - m, b[2] - m], [b[1] + m, b[2] - m], [b[0] - m, b[3] + m], [b[1] + m, b[3] + m]]) if (ok(x, z)) pts.push({ x, z });
  for (const c of LAYOUT.circles) for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const d = (c[2] + m) * 1.05; const x = c[0] + sx * d, z = c[1] + sz * d; if (ok(x, z)) pts.push({ x, z }); }
  _nodes = pts.filter((p) => { const q = { x: p.x, z: p.z }; pushOut(q, DEF.radius); return Math.hypot(q.x - p.x, q.z - p.z) < 1e-6; });
  const n = _nodes.length, mm = DEF.radius + 0.05;
  _vis = Array.from({ length: n }, () => new Array(n).fill(false));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const v = segClear(_nodes[i].x, _nodes[i].z, _nodes[j].x, _nodes[j].z, mm); _vis[i][j] = _vis[j][i] = v; }
  return _nodes;
}
/** Waypoints (local) from (ax, az) to (bx, bz) around the static colliders. */
export function planPath(ax, az, bx, bz) {
  const mm = DEF.radius + 0.05;
  if (segClear(ax, az, bx, bz, mm)) return [{ x: bx, z: bz }];
  const N = navNodes(), n = N.length;
  const S = n, G = n + 1;
  const P = N.concat([{ x: ax, z: az }, { x: bx, z: bz }]);
  const vis = (i, j) => (i < n && j < n ? _vis[i][j] : segClear(P[i].x, P[i].z, P[j].x, P[j].z, mm));
  const dist = new Array(n + 2).fill(Infinity), prev = new Array(n + 2).fill(-1), done = new Array(n + 2).fill(false);
  dist[S] = 0;
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < n + 2; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0 || u === G) break;
    done[u] = true;
    for (let v = 0; v < n + 2; v++) {
      if (done[v] || v === u || v === S) continue;
      if (!vis(u, v)) continue;
      const d = best + Math.hypot(P[u].x - P[v].x, P[u].z - P[v].z);
      if (d < dist[v]) { dist[v] = d; prev[v] = u; }
    }
  }
  if (!Number.isFinite(dist[G])) return [{ x: bx, z: bz }];
  const out = [];
  for (let i = G; i !== S && i >= 0; i = prev[i]) out.unshift({ x: P[i].x, z: P[i].z });
  return out;
}

// ── the tutorial ─────────────────────────────────────────────────────────────
const PROMPTS = {
  rook: {
    markers: 'Walk to the key rack — follow the glow',
    suit: 'Suit up at the rack: hold [E]',
    suiting: 'Keep holding [E]…',
    keys: 'Grab the keys from the hook [E]',
    plug: 'Unplug the shore-power cable [E]',
    button: 'Open the garage door — hit the button [E]',
    board: 'Get in the driver\'s seat [E]',
    crank: 'Hold [E] to crank the engine',
    cranking: 'Keep holding [E]…',
    started: 'She\'s running. Let\'s roll!',
  },
  doc: {
    markers: 'Walk to your desk — follow the glow',
    suit: 'Suit up at the rack: hold [E]',
    suiting: 'Keep holding [E]…',
    notebook: 'Take the notebook [E]',
    crate: 'Pick up the supply crate [E]',
    carry: 'Carry the crate to the RV side door — [E] to load it',
    board: 'Climb in through the side door [E]',
    crank: 'Hold on — Rook is starting her up',
    started: 'Engine\'s running. Here we go!',
  },
};

function newAvatar(s) {
  return { x: s.x, z: s.z, yaw: s.yaw, vx: 0, vz: 0, speed: 0, walkPhase: 0, carry: null, inRv: false, act: 0,
    atMarker: false, jt: -1, jumpBuf: 0, y: 0, suited: false };
}

export class GarageTutorial {
  constructor(sim = {}) {
    this.sim = sim;
    const route = sim.route || sim.data?.route || null;
    const rules = sim.rules || sim.data?.rules || {};
    this.cfg = { ...DEF, ...(rules.tutorial || {}) };
    this.frame = garageFrame(sim.track, route);
    this.solo = !!sim.solo;
    this.t = 0;
    this.done = false;
    this.skipped = false;
    this.steps = STEPS;
    this.complete = { markers: false, suit: false, grab: false, load: false, door: false, board: false, crank: false };
    this.R = newAvatar(LAYOUT.start.rook);
    this.D = newAvatar(LAYOUT.start.doc);
    this.items = { keys: 'hook', notebook: 'desk', crate: 'floor', plug: 'in', door: 0, engine: 'off' };
    this.crate = { x: LAYOUT.crateStart.x, z: LAYOUT.crateStart.z, yaw: LAYOUT.crateStart.yaw };
    this.doorOpening = false;
    this.hold = 0;                 // crank hold progress (s)
    this.autoCrank = false;        // edge-only input: one press cranks by itself
    this.sawHeldField = false;
    this.crankT = 0; this.caught = false; this.onT = 0;
    this.docIn = { mx: 0, mz: 0, run: false, hold: false, t: -1e9 };   // last CMD.avatarMove (local dir)
    // R3-GARAGE Suit up: hold progress (s), last E press (sim t), single-press fallback, Doc sent a `hold` field
    this.suitHold = { rook: 0, doc: 0 };
    this.lastPress = { rook: -1e9, doc: -1e9 };
    this.autoSuit = { rook: false, doc: false };
    this.sawDocHold = false;
    this.docAct = false;
    this.docJump = false;
    this.feedback = [];            // short-lived per-action markers for the view: {who, what, t}
    this.seq = 0;
    // solo AI
    this.ai = this.solo ? { task: 'marker', path: null, wait: 0, goal: null, stuckT: 0, lastX: this.D.x, lastZ: this.D.z, side: 0, sideT: 0 } : null;
    const p = this.frame.toWorld(LAYOUT.rvPark.x, LAYOUT.rvPark.z);
    this.rvPark = { x: p.x, z: p.z, yaw: this.frame.yawToWorld(LAYOUT.rvPark.yaw) };
  }

  get step() { for (let i = 0; i < STEPS.length; i++) if (!this.complete[STEPS[i]]) return i; return STEPS.length; }
  get stepId() { const s = this.step; return STEPS[s] || 'done'; }
  get rook() { return this._worldAv(this.R); }
  get doc() { return this._worldAv(this.D); }

  // ── inputs ────────────────────────────────────────────────────────────────
  command(cmd) {
    if (!cmd || this.done) return;
    if (cmd.type === 'avatarMove') {
      if (this.solo) return;
      const d = this.frame.dirToLocal(+cmd.mx || 0, +cmd.mz || 0);
      if (cmd.hold != null) this.sawDocHold = true;
      this.docIn = { mx: clamp(d.x, -1, 1), mz: clamp(d.z, -1, 1), run: !!cmd.run, hold: !!cmd.hold, t: this.t };
    } else if (cmd.type === 'avatarAct') {
      if (this.solo) return;
      this.docAct = true;
    } else if (cmd.type === 'avatarJump') {
      if (this.solo) return;
      this.docJump = true;
    }
  }

  skip() {
    if (this.done) return;
    this.skipped = true;
    for (const k of STEPS) this.complete[k] = true;
    Object.assign(this.items, { keys: 'rook', notebook: 'doc', crate: 'rv', plug: 'out', door: 1, engine: 'on' });
    for (const a of [this.R, this.D]) { a.inRv = true; a.suited = true; a.carry = null; a.vx = a.vz = a.speed = 0; resetJump(a); }
    Object.assign(this.R, LAYOUT.use.driverDoor); Object.assign(this.D, LAYOUT.use.sideDoor);
    this.done = true;
    this._emit({ type: 'tutorial', step: STEPS.length, stepId: 'skipped', done: 'skipped' });
  }

  // ── step ──────────────────────────────────────────────────────────────────
  update(dt, input = {}) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    this.t += dt;
    if (this.done) return;
    input = input || {};
    const R = this.R, D = this.D;
    R.act = Math.max(0, R.act - dt); D.act = Math.max(0, D.act - dt);
    this.feedback = this.feedback.filter((f) => this.t - f.t < 1.2);

    // Rook's input (world → local). Fallback for an un-updated main.js: steer/throttle in the
    // default camera frame (looking at the back wall), E = `oil` edge.
    let rmx = 0, rmz = 0;
    if (input.moveX != null || input.moveZ != null) {
      const d = this.frame.dirToLocal(+input.moveX || 0, +input.moveZ || 0); rmx = d.x; rmz = d.z;
    } else if (input.throttle || input.steer) { rmx = +input.steer || 0; rmz = -(+input.throttle || 0); }
    const rRun = !!(input.run ?? input.handbrake);
    const rAct = !!(input.interact || input.oil);
    if (input.interactHeld != null) this.sawHeldField = true;
    const rHeld = !!input.interactHeld;

    // Doc's input
    let dmx = 0, dmz = 0, dRun = false, dAct = false, dJump = false, dHeld = false;
    if (this.ai) ({ mx: dmx, mz: dmz, run: dRun, act: dAct, hold: dHeld } = this._aiStep(dt));
    else {
      if (this.t - this.docIn.t <= this.cfg.cmdTimeout) { dmx = this.docIn.mx; dmz = this.docIn.mz; dRun = this.docIn.run; dHeld = this.docIn.hold; }
      dAct = this.docAct;
      dJump = this.docJump;
    }
    this.docAct = false; this.docJump = false;

    // jump (an edge; buffered if pressed just before landing)
    if (input.jump && !R.inRv) tryJump(R);
    if (dJump && !D.inRv) tryJump(D);

    // move (each sees the other + the crate on the floor as circles)
    const crateC = this.items.crate === 'floor' ? [[this.crate.x, this.crate.z, this.cfg.crateRadius]] : [];
    if (!R.inRv) moveAvatar(R, rmx, rmz, rRun, dt, D.inRv ? crateC : crateC.concat([[D.x, D.z, this.cfg.radius]]), this.cfg);
    else { R.vx = R.vz = R.speed = 0; }
    if (!D.inRv) moveAvatar(D, dmx, dmz, dRun, dt, R.inRv ? crateC : crateC.concat([[R.x, R.z, this.cfg.radius]]), this.cfg);
    else { D.vx = D.vz = D.speed = 0; }
    for (const a of [R, D]) { if (a.inRv) resetJump(a); else stepJump(a, dt); }

    // step 0: markers (sticky once reached)
    const M = LAYOUT.markers;
    if (!R.atMarker && Math.hypot(R.x - M.rook.x, R.z - M.rook.z) <= this.cfg.markerRadius) { R.atMarker = true; this._fb('rook', 'marker'); }
    if (!D.atMarker && Math.hypot(D.x - M.doc.x, D.z - M.doc.z) <= this.cfg.markerRadius) { D.atMarker = true; this._fb('doc', 'marker'); }
    if (!this.complete.markers && R.atMarker && D.atMarker) this._complete('markers');

    if (rAct) this._rookAct();
    if (dAct) this._docAct();

    // step 1: suit up (R3-GARAGE) — hold E at the rack
    this._suitStep('rook', R, dt, this.sawHeldField ? rHeld : false);
    this._suitStep('doc', D, dt, this.ai ? !!dHeld : this.sawDocHold ? dHeld : false);

    // door animation
    if (this.doorOpening && this.items.door < 1) this.items.door = Math.min(1, this.items.door + dt / this.cfg.doorSeconds);

    // step 5: crank
    if (this.complete.board && !this.complete.crank) {
      const holding = this.sawHeldField ? rHeld : this.autoCrank;
      if (!this.caught) {
        if (holding) { this.hold += dt; this.crankT += dt; this.items.engine = 'cranking'; }
        else { this.hold = Math.max(0, this.hold - dt * 2); if (this.hold === 0) { this.items.engine = 'off'; this.crankT = 0; } }
        if (this.hold >= this.cfg.holdSeconds) { this.caught = true; this.hold = this.cfg.holdSeconds; this._fb('rook', 'caught'); }
      } else if (this.items.engine !== 'on') {
        this.crankT += dt;
        if (this.crankT >= this.cfg.crankSeconds) { this.items.engine = 'on'; this.onT = 0; this._fb('rook', 'engine'); }
      } else {
        this.onT += dt;
        if (this.onT >= this.cfg.onToDone) { this._complete('crank'); this.done = true; }
      }
    }
  }

  // ── actions ───────────────────────────────────────────────────────────────
  _near(av, p, r = this.cfg.interact) { return Math.hypot(av.x - p.x, av.z - p.z) <= r; }
  _rookTask() {
    const c = this.complete;
    if (this.R.inRv) return c.board ? (c.crank ? null : 'crank') : 'waitIn';
    if (!c.markers) return this.R.atMarker ? 'wait' : 'markers';
    if (!this.R.suited) return 'suit';
    if (!c.suit) return 'wait';
    if (this.items.keys !== 'rook') return 'keys';
    if (!c.grab) return 'wait';
    if (this.items.plug !== 'out') return 'plug';
    if (!this.doorOpening) return 'button';
    return 'board';
  }
  _docTask() {
    const c = this.complete;
    if (this.D.inRv) return c.board ? (c.crank ? null : 'crank') : 'waitIn';
    if (!c.markers) return this.D.atMarker ? 'wait' : 'markers';
    if (!this.D.suited) return 'suit';
    if (!c.suit) return 'wait';
    if (this.items.notebook !== 'doc') return 'notebook';
    if (!c.grab) return 'wait';
    if (this.items.crate === 'floor') return 'crate';
    if (this.items.crate === 'doc') return 'carry';
    return 'board';
  }
  _rookAct() {
    const R = this.R, U = LAYOUT.use, task = this._rookTask();
    R.act = 0.4;
    this.lastPress.rook = this.t;
    if (task === 'suit') { if (!this.sawHeldField && this._near(R, U.suit.rook)) this.autoSuit.rook = true; }
    else if (task === 'keys' && this.complete.markers && this._near(R, U.keys)) { this.items.keys = 'rook'; this._fb('rook', 'keys'); this._checkGrab(); }
    else if (task === 'plug' && this._near(R, U.plug)) { this.items.plug = 'out'; this._fb('rook', 'plug'); }
    else if (task === 'button' && this._near(R, U.button)) { this.doorOpening = true; this._fb('rook', 'button'); this._complete('door'); }
    else if (task === 'board' && this._near(R, U.driverDoor)) { R.inRv = true; R.x = U.driverDoor.x; R.z = U.driverDoor.z; R.carry = null; this._fb('rook', 'board'); this._checkBoard(); }
    else if (task === 'crank') { if (!this.sawHeldField) this.autoCrank = true; }
  }
  _docAct() {
    const D = this.D, U = LAYOUT.use, task = this._docTask();
    D.act = 0.4;
    this.lastPress.doc = this.t;
    if (task === 'suit') { if (!this.sawDocHold && this._near(D, U.suit.doc)) this.autoSuit.doc = true; }
    else if (task === 'notebook' && this.complete.markers && this._near(D, U.notebook)) { this.items.notebook = 'doc'; this._fb('doc', 'notebook'); this._checkGrab(); }
    else if (task === 'crate' && Math.hypot(D.x - this.crate.x, D.z - this.crate.z) <= this.cfg.interact + 0.15) { this.items.crate = 'doc'; D.carry = 'crate'; this._fb('doc', 'pickup'); }
    else if (task === 'carry') {
      if (this._near(D, U.sideDoor)) { this.items.crate = 'rv'; D.carry = null; this._fb('doc', 'load'); this._complete('load'); }
      else { // put it down in front of him
        const p = { x: D.x + Math.sin(D.yaw) * 0.75, z: D.z + Math.cos(D.yaw) * 0.75 };
        pushOut(p, this.cfg.crateRadius, [[this.R.x, this.R.z, this.cfg.radius]]);
        this.crate = { x: p.x, z: p.z, yaw: D.yaw };
        this.items.crate = 'floor'; D.carry = null; this._fb('doc', 'drop');
      }
    } else if (task === 'board' && this._near(D, U.sideDoor)) { D.inRv = true; D.x = U.sideDoor.x; D.z = U.sideDoor.z; this._fb('doc', 'board'); this._checkBoard(); }
  }
  /** R3-GARAGE Suit up: hold E (or keep tapping it) within reach of your suit for cfg.suitSeconds. */
  _suitStep(who, a, dt, held) {
    if (a.suited || a.inRv) return;
    const task = who === 'rook' ? this._rookTask() : this._docTask();
    const near = task === 'suit' && this._near(a, LAYOUT.use.suit[who]);
    if (!near) this.autoSuit[who] = false;
    const tap = this.t - this.lastPress[who] < this.cfg.tapHold;
    if (near && (held || tap || this.autoSuit[who])) {
      this.suitHold[who] += dt;
      a.act = Math.max(a.act, 0.2);
    } else this.suitHold[who] = Math.max(0, this.suitHold[who] - dt * 2);
    if (this.suitHold[who] >= this.cfg.suitSeconds) {
      a.suited = true; this.suitHold[who] = this.cfg.suitSeconds; this.autoSuit[who] = false;
      this._fb(who, 'suit');
      if (this.R.suited && this.D.suited) this._complete('suit');
    }
  }
  _checkGrab() { if (!this.complete.grab && this.items.keys === 'rook' && this.items.notebook === 'doc') this._complete('grab'); }
  _checkBoard() { if (!this.complete.board && this.R.inRv && this.D.inRv) this._complete('board'); }
  _complete(id) {
    if (this.complete[id]) return;
    this.complete[id] = true;
    this._emit({ type: 'tutorial', step: this.step, stepId: this.stepId, done: id });
  }
  _fb(who, what) { this.feedback.push({ who, what, t: this.t, n: ++this.seq }); }
  _emit(ev) { try { if (this.sim && typeof this.sim.emit === 'function') this.sim.emit(ev); } catch (e) { /* sim optional */ } }

  // ── solo AI Doc ───────────────────────────────────────────────────────────
  _aiGoal(task) {
    const U = LAYOUT.use;
    if (task === 'suit') return U.suit.doc;
    if (task === 'markers' || task === 'notebook' || task === 'wait') return this.complete.markers ? U.notebook : LAYOUT.markers.doc;
    if (task === 'crate') {
      // stand on the side of the crate that faces Doc's approach (towards the room centre)
      const c = this.crate, dx = 0.6 - c.x, dz = -2.2 - c.z, l = Math.hypot(dx, dz) || 1;
      return { x: c.x + (dx / l) * 0.85, z: c.z + (dz / l) * 0.85 };
    }
    if (task === 'carry' || task === 'board') return U.sideDoor;
    return null;
  }
  _aiStep(dt) {
    const ai = this.ai, D = this.D;
    const out = { mx: 0, mz: 0, run: false, act: false, hold: false };
    const task = this._docTask();
    if (task === 'waitIn' || task === 'crank' || task == null) return out;
    const goal = this._aiGoal(task);
    if (!goal) return out;
    if (ai.task !== task || !ai.goal || Math.hypot(ai.goal.x - goal.x, ai.goal.z - goal.z) > 0.3) {
      ai.task = task; ai.goal = { x: goal.x, z: goal.z };
      ai.path = planPath(D.x, D.z, goal.x, goal.z);
      ai.wait = task === 'markers' ? 0 : task === 'notebook' ? 0.45 : task === 'board' ? 0.5 : task === 'suit' ? 0.3 : 0.35;
    }
    const dGoal = Math.hypot(D.x - goal.x, D.z - goal.z);
    const arrive = task === 'markers' ? 0.4 : task === 'crate' ? 0.35 : task === 'suit' ? 0.35 : 0.5;
    if (dGoal > arrive + 0.25 && (!ai.path || !ai.path.length)) ai.path = planPath(D.x, D.z, goal.x, goal.z);
    if (dGoal > arrive && ai.path && ai.path.length) {
      let w = ai.path[0];
      if (ai.path.length > 1 && Math.hypot(D.x - w.x, D.z - w.z) < 0.35) { ai.path.shift(); w = ai.path[0]; }
      let dx = w.x - D.x, dz = w.z - D.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      const last = ai.path.length === 1;
      const k = last ? clamp(dGoal / 0.9, 0.35, 1) : 1;
      // stuck (Rook in the way): sidestep for a moment
      ai.stuckT += dt;
      if (ai.stuckT > 0.8) {
        const prog = Math.hypot(D.x - ai.lastX, D.z - ai.lastZ);
        if (prog < 0.25) { ai.side = ai.side >= 0 ? -1 : 1; ai.sideT = 0.6; ai.path = planPath(D.x, D.z, goal.x, goal.z); }
        ai.stuckT = 0; ai.lastX = D.x; ai.lastZ = D.z;
      }
      if (ai.sideT > 0) { ai.sideT -= dt; const sx = -dz * ai.side, sz = dx * ai.side; dx = dx * 0.4 + sx; dz = dz * 0.4 + sz; const l2 = Math.hypot(dx, dz) || 1; dx /= l2; dz /= l2; }
      out.mx = dx * k; out.mz = dz * k;
      return out;
    }
    // arrived: face the thing, wait a believable beat, then act
    ai.path = null;
    const face = task === 'crate' ? this.crate : task === 'carry' || task === 'board' ? { x: LAYOUT.rvPark.x - 1.3, z: LAYOUT.use.sideDoor.z }
      : task === 'suit' ? { x: LAYOUT.use.suit.doc.x, z: LAYOUT.room.minZ }
      : task === 'wait' || task === 'markers' ? { x: this.R.x, z: this.R.z } : LAYOUT.items.notebook;
    D.yaw += wrap(Math.atan2(face.x - D.x, face.z - D.z) - D.yaw) * Math.min(1, dt * 6);
    if (task === 'markers' || task === 'wait') return out;
    ai.wait -= dt;
    if (task === 'suit') { out.hold = ai.wait <= 0; return out; }   // face the rack, a beat, then hold E
    if (ai.wait <= 0) { out.act = true; ai.wait = 0.8; }
    return out;
  }

  // ── output ────────────────────────────────────────────────────────────────
  _worldAv(a) {
    const p = this.frame.toWorld(a.x, a.z);
    return { x: r3(p.x), z: r3(p.z), yaw: r3(this.frame.yawToWorld(a.yaw)), speed: r3(a.speed), carry: a.carry, inRv: a.inRv, act: r3(a.act), y: r3(a.y), jt: r3(a.jt), suited: !!a.suited };
  }
  _target(who) {
    const U = LAYOUT.use;
    const task = who === 'rook' ? this._rookTask() : this._docTask();
    let p = null;
    switch (task) {
      case 'markers': p = LAYOUT.markers[who]; break;
      case 'suit': p = U.suit[who]; break;
      case 'keys': p = U.keys; break;
      case 'notebook': p = U.notebook; break;
      case 'plug': p = U.plug; break;
      case 'button': p = U.button; break;
      case 'board': p = who === 'rook' ? U.driverDoor : U.sideDoor; break;
      case 'crate': p = this.crate; break;
      case 'carry': p = U.sideDoor; break;
      default: p = null;
    }
    return p ? this.frame.toWorld(p.x, p.z) : null;
  }
  _prompt(who) {
    const P = PROMPTS[who], task = who === 'rook' ? this._rookTask() : this._docTask();
    const other = who === 'rook' ? 'Doc' : 'Rook';
    if (this.done || this.items.engine === 'on') return P.started;
    switch (task) {
      case 'markers': return P.markers;
      case 'suit': return this.suitHold[who] > 0 ? P.suiting : P.suit;
      case 'wait': return `Wait for ${other}…`;
      case 'waitIn': return `In the RV — waiting for ${other}…`;
      case 'crank': return who === 'rook' ? (this.items.engine === 'cranking' ? P.cranking : P.crank) : P.crank;
      default: return P[task] || '';
    }
  }
  _isNear(who) {
    const a = who === 'rook' ? this.R : this.D, U = LAYOUT.use;
    const task = who === 'rook' ? this._rookTask() : this._docTask();
    switch (task) {
      case 'suit': return this._near(a, U.suit[who]);
      case 'keys': return this.complete.markers && this._near(a, U.keys);
      case 'notebook': return this.complete.markers && this._near(a, U.notebook);
      case 'plug': return this._near(a, U.plug);
      case 'button': return this._near(a, U.button);
      case 'board': return this._near(a, who === 'rook' ? U.driverDoor : U.sideDoor);
      case 'crate': return Math.hypot(a.x - this.crate.x, a.z - this.crate.z) <= this.cfg.interact + 0.15;
      case 'carry': return this._near(a, U.sideDoor);
      case 'crank': return who === 'rook';
      default: return false;
    }
  }

  /** snapshot.garage */
  state() {
    const cw = this.frame.toWorld(this.crate.x, this.crate.z);
    return {
      step: this.step,
      stepId: this.stepId,
      steps: STEPS.slice(),
      done: this.done,
      skipped: this.skipped,
      rook: this._worldAv(this.R),
      doc: this._worldAv(this.D),
      items: { ...this.items, door: r3(this.items.door), suits: [!this.R.suited, !this.D.suited] },   // suits: still on the rack [Rook's suit_0, Doc's suit_1]
      crate: { x: r3(cw.x), z: r3(cw.z), yaw: r3(this.frame.yawToWorld(this.crate.yaw)) },
      prompt: { rook: this._prompt('rook'), doc: this._prompt('doc') },
      task: { rook: this._rookTask(), doc: this._docTask() },
      near: { rook: this._isNear('rook'), doc: this._isNear('doc') },
      target: { rook: this._target('rook'), doc: this._target('doc') },
      atMarker: { rook: this.R.atMarker, doc: this.D.atMarker },
      complete: { ...this.complete },
      hold: r3(this.caught ? 1 : this.hold / this.cfg.holdSeconds),
      suitHold: { rook: r3(this.R.suited ? 1 : this.suitHold.rook / this.cfg.suitSeconds), doc: r3(this.D.suited ? 1 : this.suitHold.doc / this.cfg.suitSeconds) },
      solo: this.solo,
      fb: this.feedback.map((f) => ({ who: f.who, what: f.what, n: f.n })),
      frame: { ox: r3(this.frame.ox), oz: r3(this.frame.oz), rot: r3(this.frame.rot) },
      rvPark: { ...this.rvPark },
    };
  }
}
