// ─────────────────────────────────────────────────────────────────────────────
// Round 3 (agent R3-START) — PROPOSED placement of the start district around Rook's Garage
// (z ≈ −200 … 160, both sides of the road). Plain data + pure resolvers; NOT wired into the game.
//
// Coordinates are relative to the route's centre line, like the rest of the world code:
//   u  lateral offset (+ = driver's right = −X side, the garage side), world x = track.xAt(z, u)
//   z  world z (metres along the route; the route starts at 0, the garage is at 45)
//   rot  'face'  front (local +Z) faces the road  → yaw = side·π/2 + heading(z)
//        'road'  local +Z points down the road     → yaw = heading(z)
//        number  extra yaw on top of the heading   → yaw = rot + heading(z)
//        'chord' utility poles: local X along the line of poles, +Z toward the road
//   batch 'far' = backdrop silhouettes (no shadows, weaker fog), default 'near'
//   live  animated (pumpjacks): a StructuresView-style live object, NOT baked into the chunk
//   col   sim collider in the model's LOCAL frame (see startColliders): rect | line | circle | capsule
//
// Everything stays clear of: the road + sidewalks (|u| ≤ 9.5), the garage block and its apron
// (z 29…61, u 0…36: only the parked tow truck sits there, at z 26…35, behind the RV's exit), the
// RV's way out (door z 40.3…45.3 → right turn toward +Z, swept area u −1…14, z 38…62), the
// on-foot tutorial (inside the garage), the gen streetlights (|u| 6.8) and the generated Ironworks
// rows beyond z 96 (right) / 100 (left).
// ─────────────────────────────────────────────────────────────────────────────

const HALF_PI = Math.PI / 2;

/** Scenery reservations (RoadInfo.res format) so the seeded Ironworks generator leaves the district alone. */
export const R3_START_RESERVATIONS = Object.freeze([
  { z0: -300, z1: 96, side: 1, u0: 10.5, u1: 100, tag: 'start' },
  { z0: -300, z1: 100, side: -1, u0: 10.5, u1: 100, tag: 'start' },
]);

/** The road + ground must exist back to here (chunks.js streams ci ≥ −2 today, i.e. z ≥ −100). */
export const R3_START_MIN_Z = -200;

// ── placements ────────────────────────────────────────────────────────────────
const P = [];
const add = (o) => { P.push(Object.freeze(o)); };

// RIGHT side (u > 0, −X): Rook's lot, the tyre shop next door, warehouses + factory behind the start
add({ id: 'tow_yard', kind: 'tow_yard', variant: 0, u: 23.2, z: 11, rot: 'face', col: { type: 'rect', x0: -14, x1: 14, z0: -11, z1: 11 } });
add({ id: 'tow_truck', kind: 'tow_truck', variant: 0, u: 13.0, z: 31, rot: 'road', col: { type: 'capsule', z0: -3.5, z1: 3.1, r: 1.3 } });
add({ id: 'tyre_shop', kind: 'tyre_shop', variant: 0, u: 28.6, z: 75, rot: 'face', col: { type: 'line', a: [-8.6, 6.9], b: [8.6, 6.9] } });
add({ id: 'tyre_sign', kind: 'pole_sign', variant: 1, u: 12.2, z: 64, rot: 'road', col: { type: 'circle', r: 0.5 } });
add({ id: 'tyre_pickup', kind: 'pickup', variant: 3, u: 16.0, z: 79.5, rot: -HALF_PI, col: { type: 'capsule', z0: -2.3, z1: 2.3, r: 1.05 } });
add({ id: 'alley_tyre', kind: 'dumpster_alley', variant: 0, u: 25.8, z: 90, rot: 'face' });
add({ id: 'tanks_behind_garage', kind: 'tank_farm', variant: 1, u: 54, z: 42, rot: 'face' });
add({ id: 'billboard_back', kind: 'billboard', variant: 0, u: 15.5, z: -6.2, rot: 0.3, col: { type: 'circle', at: [[-3.2, -0.25], [3.2, -0.25]], r: 0.35 } });
add({ id: 'warehouse_halberg', kind: 'warehouse', variant: 1, u: 34.45, z: -24, rot: 'face' });
add({ id: 'van_dock', kind: 'van', variant: 3, u: 17.5, z: -28, rot: 'face', col: { type: 'capsule', z0: -2.1, z1: 2.1, r: 1.1 } });
add({ id: 'alley_back', kind: 'dumpster_alley', variant: 1, u: 25.8, z: -47, rot: 'face' });
add({ id: 'scrub_r1', kind: 'scrub_patch', variant: 1, u: 16, z: -52, rot: 0.4 });
add({ id: 'factory_back_r', kind: 'factory', variant: 0, u: 34.1, z: -68, rot: 'face' });
add({ id: 'scrub_r2', kind: 'scrub_patch', variant: 2, u: 15, z: -78, rot: 1.9 });
add({ id: 'warehouse_cold', kind: 'warehouse', variant: 2, u: 32.45, z: -104, rot: 'face' });
add({ id: 'tanks_refinery_r', kind: 'tank_farm', variant: 1, u: 46, z: -150, rot: 'face' });
add({ id: 'far_r_ware', kind: 'warehouse', variant: 0, u: 78, z: 80, rot: 'face', batch: 'far' });
add({ id: 'far_r_factory', kind: 'factory', variant: 1, u: 84, z: 8, rot: 'face', batch: 'far' });
add({ id: 'far_r_ware2', kind: 'warehouse', variant: 1, u: 80, z: -45, rot: 'face', batch: 'far' });
add({ id: 'far_r_factory2', kind: 'factory', variant: 0, u: 84, z: -110, rot: 'face', batch: 'far' });

// LEFT side (u < 0, +X): pumpjack lot, Lou's 24h diner across from the garage door, the corner mart,
// water tower + fuel depot behind, a second pumpjack, warehouse + factory behind the start
for (const z of [3, 13.5, 24]) add({ id: 'pump_fence_' + z, kind: 'chainlink_fence', variant: 1, u: -12.8, z, rot: 'face', col: { type: 'line', a: [-5.25, 0], b: [5.25, 0] } });
add({ id: 'pumpjack_lot', kind: 'pumpjack', variant: 0, u: -24, z: 12, rot: 'road', live: true });
add({ id: 'pumpjack_idle', kind: 'pumpjack', variant: 1, u: -38, z: 22, rot: 'road' });   // baked = standing still (an idle well)
add({ id: 'scrub_l1', kind: 'scrub_patch', variant: 2, u: -17.5, z: 21, rot: 0.8 });
add({ id: 'scrub_l2', kind: 'scrub_patch', variant: 0, u: -33, z: 2, rot: 2.2 });
add({ id: 'diner', kind: 'diner_24h', variant: 0, u: -28, z: 42, rot: 'face', col: { type: 'line', a: [-9.2, 5.9], b: [9.2, 5.9] } });
add({ id: 'diner_car1', kind: 'sedan', variant: 2, u: -18.8, z: 36.35, rot: HALF_PI, col: { type: 'capsule', z0: -2.0, z1: 2.0, r: 1.05 } });
add({ id: 'diner_car2', kind: 'pickup', variant: 1, u: -18.8, z: 45.05, rot: HALF_PI, col: { type: 'capsule', z0: -2.3, z1: 2.3, r: 1.05 } });
add({ id: 'diner_car3', kind: 'hatch', variant: 4, u: -18.8, z: 50.85, rot: HALF_PI, col: { type: 'capsule', z0: -1.7, z1: 1.7, r: 1.0 } });
add({ id: 'diner_sign', kind: 'pole_sign', variant: 0, u: -16, z: 57.5, rot: 'road', col: { type: 'circle', r: 0.5 } });
add({ id: 'scrub_l3', kind: 'scrub_patch', variant: 0, u: -16.5, z: 62.5, rot: 1.3 });
add({ id: 'mart', kind: 'corner_shop', variant: 0, u: -28.53, z: 76, rot: 'face', col: { type: 'line', a: [-6.6, 6.4], b: [6.6, 6.4] } });
add({ id: 'warehouse_backlot', kind: 'warehouse', variant: 0, u: -50, z: 64, rot: 'face' });
add({ id: 'mart_car1', kind: 'van', variant: 1, u: -18.8, z: 72.35, rot: HALF_PI, col: { type: 'capsule', z0: -2.1, z1: 2.1, r: 1.1 } });
add({ id: 'mart_car2', kind: 'sedan', variant: 4, u: -18.8, z: 81.05, rot: HALF_PI, col: { type: 'capsule', z0: -2.0, z1: 2.0, r: 1.05 } });
add({ id: 'mart_sign', kind: 'pole_sign', variant: 2, u: -16, z: 89, rot: 'road', col: { type: 'circle', r: 0.5 } });
add({ id: 'alley_mart', kind: 'dumpster_alley', variant: 1, u: -25.8, z: 91.5, rot: 'face' });
add({ id: 'billboard_turn', kind: 'billboard', variant: 1, u: -19, z: 106, rot: Math.PI + 0.3, col: { type: 'circle', at: [[-3.2, -0.25], [3.2, -0.25]], r: 0.35 } });
add({ id: 'water_tower', kind: 'water_tower_city', variant: 0, u: -62, z: 30, rot: 'face' });
add({ id: 'tanks_depot', kind: 'tank_farm', variant: 0, u: -62, z: -12, rot: 'face' });
add({ id: 'pumpjack_back', kind: 'pumpjack', variant: 1, u: -30, z: -34, rot: HALF_PI, live: true });
add({ id: 'scrub_l4', kind: 'scrub_patch', variant: 1, u: -40, z: -44, rot: 0.2 });
add({ id: 'scrub_l5', kind: 'scrub_patch', variant: 2, u: -16, z: -18, rot: 2.6 });
add({ id: 'warehouse_mesa', kind: 'warehouse', variant: 2, u: -32.45, z: -68, rot: 'face' });
add({ id: 'factory_back_l', kind: 'factory', variant: 1, u: -35.1, z: -112, rot: 'face' });
add({ id: 'tanks_refinery_l', kind: 'tank_farm', variant: 0, u: -50, z: -165, rot: 'face' });
add({ id: 'far_l_factory', kind: 'factory', variant: 0, u: -86, z: 72, rot: 'face', batch: 'far' });
add({ id: 'far_l_ware', kind: 'warehouse', variant: 1, u: -84, z: -62, rot: 'face', batch: 'far' });
add({ id: 'far_l_factory2', kind: 'factory', variant: 1, u: -88, z: -150, rot: 'face', batch: 'far' });

// ON THE ROAD AXIS behind the start: the pipe bridge, the closed refinery gate, the refinery itself
add({ id: 'pipe_bridge', kind: 'pipe_bridge', variant: 0, u: 0, z: -88, rot: 0, col: { type: 'circle', at: [[-13.5, 0], [13.5, 0]], r: 1.2 } });
add({ id: 'refinery_gate', kind: 'refinery_gate', variant: 0, u: 0, z: -100, rot: 0, col: [{ type: 'line', a: [-17, -1.0], b: [17, -1.0] }, { type: 'rect', x0: 5.4, x1: 7.8, z0: -0.2, z1: 2.2 }] });
add({ id: 'refinery', kind: 'factory', variant: 1, u: 0, z: -140, rot: 0 });

// Streetlights continue the generator's rhythm (every 34 m, |u| 6.8, alternating sides) back to the gate;
// like the generated ones they stand on the sidewalk without a collider.
for (const z of [-28, -62, -96]) add({ id: 'lamp_r' + z, kind: 'streetlight', variant: 0, u: 6.8, z, rot: 'face' });
for (const z of [-11, -45, -79]) add({ id: 'lamp_l' + z, kind: 'streetlight', variant: 0, u: -6.8, z, rot: 'face' });

// Utility poles with sagging wires along the left verge, one every 32 m (= the pole's wire span)
const POLE_V = [0, 2, 2, 1, 2, 0, 1, 0];
for (let i = 0; i < 8; i++) add({ id: 'pole_' + i, kind: 'utility_pole', variant: POLE_V[i], u: -11.6, z: -64 + 32 * i, rot: 'chord', col: { type: 'circle', r: 0.3 } });

export const R3_START_PLACEMENTS = Object.freeze(P);

/** Ground decals (chunks.js `_decal` format): parking lots / aprons in front of the businesses. */
export const R3_START_DECALS = Object.freeze([
  { decal: 'lot', side: -1, u0: 9.4, u1: 22.0, z0: 30.5, z1: 54, stalls: true, note: 'diner' },
  { decal: 'lot', side: -1, u0: 9.4, u1: 22.0, z0: 66, z1: 86, stalls: true, note: 'mart' },
  { decal: 'lot', side: 1, u0: 9.4, u1: 21.5, z0: 64.5, z1: 85.5, stalls: false, note: 'tyre forecourt' },
  { decal: 'lot', side: 1, u0: 9.4, u1: 22.5, z0: -40, z1: -8, stalls: false, note: 'warehouse apron' },
  { decal: 'lot', side: -1, u0: 9.4, u1: 22.5, z0: -78, z1: -58, stalls: false, note: 'warehouse apron' },
].map((d) => Object.freeze({ ...d, z: (d.z0 + d.z1) / 2 })));

// ── resolvers (pure) ──────────────────────────────────────────────────────────
const sideOf = (u) => (u >= 0 ? 1 : -1);
function poleYaw(track, p) {
  const z0 = p.z - 16, z1 = p.z + 16;
  const dx = track.xAt(z1, p.u) - track.xAt(z0, p.u), dz = z1 - z0;
  return Math.atan2(-dz, dx);                 // local +X along the chord (toward +z), local +Z toward the road
}
/** World yaw of a placement. */
export function yawOf(track, p) {
  const h = track.headingAt(p.z);
  if (p.rot === 'face') return sideOf(p.u) * HALF_PI + h;
  if (p.rot === 'road') return h;
  if (p.rot === 'chord') return poleYaw(track, p) + (sideOf(p.u) > 0 ? Math.PI : 0);
  return (p.rot || 0) + h;
}
/** Placements resolved to world space: [{ id, kind, variant, x, z, yaw, u, batch, live }] */
export function startWorld(track) {
  return R3_START_PLACEMENTS.map((p) => ({ id: p.id, kind: p.kind, variant: p.variant, u: p.u, x: track.xAt(p.z, p.u), z: p.z, yaw: yawOf(track, p), batch: p.batch || 'near', live: !!p.live }));
}
/** Static items in world/layout.js Layout format (+ the decals): what Layout.itemsIn() would add. */
export function startLayoutItems(track) {
  const out = [];
  for (const p of R3_START_PLACEMENTS) {
    if (p.live) continue;
    out.push({ kind: p.kind, v: p.variant, u: p.u, z: p.z, yaw: yawOf(track, p), s: 1, sy: 1, tint: p.kind.startsWith('scrub') ? 0.08 : 0.03, batch: p.batch || 'near', sink: 0.03, start: p.id });
  }
  for (const d of R3_START_DECALS) out.push({ ...d });
  return out.sort((a, b) => a.z - b.z);
}
/** Animated placements (StructuresView live items): [{ id, kind, variant, x, z, yaw }] */
export function startLive(track) { return startWorld(track).filter((p) => p.live); }

/** Local (lx, lz) of a placement → world {x, z}. Same convention as THREE (rotation.y = yaw). */
function toWorld(px, pz, yaw, lx, lz) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: px + lx * c + lz * s, z: pz - lx * s + lz * c };
}
/**
 * Sim colliders (sim/structures.js segment format) for the placements the RV can reach
 * (|u| ≤ halfWidth + shoulder + sideRoom = 22.1 m here; garage side 29.5 m at z 33…57):
 *   [{ ax, az, bx, bz, r, kind: 'start_<id>', damage }] — push into structureLayout().segs.
 * Edges wholly beyond `reach` (default 23.5 m) are dropped (unreachable, cost nothing).
 */
export function startColliders(track, { reach = 23.5 } = {}) {
  const segs = [];
  for (const p of R3_START_PLACEMENTS) {
    if (!p.col) continue;
    const yaw = yawOf(track, p), X = track.xAt(p.z, p.u), Z = p.z;
    const W = (lx, lz) => toWorld(X, Z, yaw, lx, lz);
    const dmg = /car|pickup|van|truck|sedan|hatch/.test(p.id) ? 3 : p.kind === 'chainlink_fence' || p.kind === 'tow_yard' ? 1 : 2;
    const push = (a, b, r) => {
      const ua = track.uAt(a.x, a.z), ub = track.uAt(b.x, b.z);
      if (Math.min(Math.abs(ua), Math.abs(ub)) > reach && Math.sign(ua) === Math.sign(ub)) return;
      segs.push({ ax: +a.x.toFixed(3), az: +a.z.toFixed(3), bx: +b.x.toFixed(3), bz: +b.z.toFixed(3), r, kind: 'start_' + p.id, damage: dmg });
    };
    for (const c of Array.isArray(p.col) ? p.col : [p.col]) {
      if (c.type === 'rect') {
        const q = [W(c.x0, c.z0), W(c.x1, c.z0), W(c.x1, c.z1), W(c.x0, c.z1)];
        for (let i = 0; i < 4; i++) push(q[i], q[(i + 1) % 4], c.r ?? 0.3);
      } else if (c.type === 'line') push(W(c.a[0], c.a[1]), W(c.b[0], c.b[1]), c.r ?? 0.3);
      else if (c.type === 'capsule') push(W(0, c.z0), W(0, c.z1), c.r);
      else if (c.type === 'circle') for (const at of c.at || [[0, 0]]) { const q = W(at[0], at[1]); push(q, q, c.r); }
    }
  }
  return segs;
}
/** The RoadInfo.res entries to add before the Layout generates the Ironworks biome. */
export function startReservations() { return R3_START_RESERVATIONS.map((r) => ({ ...r })); }
