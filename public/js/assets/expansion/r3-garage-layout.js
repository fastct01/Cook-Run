// ─────────────────────────────────────────────────────────────────────────────
// Round 3 · garage pack (agent R3-GARAGE) — PROPOSED placements in Rook's Garage. PURE DATA (no
// three.js), so sim/garage.js could import it later; today only public/r3-garage-preview.html does.
// Frame: garage_interior-local (origin floor centre, roll-up door on +Z, RV bay at x ≈ 4), as in
// sim/garage.js LAYOUT. rotY 0 = back against the back wall (z = −7); −π/2 = back against the right
// wall (x = +9); +π/2 = back against the left wall (x = −9). Verified: no overlap with LAYOUT boxes /
// circles, the building's wall columns, use-spots, or each other; every tutorial route keeps its
// length (grid search with the 0.3 m avatar radius) — see docs/NOTES-r3-garage.md.
// ─────────────────────────────────────────────────────────────────────────────
const PI = Math.PI;

export const R3_GARAGE_PLACEMENTS = Object.freeze([
  // back wall, left → right (the wall column at x ≈ 0 stays clear)
  { kind: 'chem_bench',        variant: 0, pos: [1.08, 0, -6.62],  rotY: 0 },
  { kind: 'element_poster',    variant: 0, pos: [1.08, 1.95, -6.99], rotY: 0 },   // hung above the bench (origin = board bottom)
  { kind: 'fume_hood',         variant: 0, pos: [2.66, 0, -6.605], rotY: 0 },
  { kind: 'reagent_shelf',     variant: 0, pos: [3.78, 0, -6.77],  rotY: 0 },
  { kind: 'suit_rack',         variant: 0, pos: [5.31, 0, -6.73],  rotY: 0 },     // behind the parked RV (1.9 m clear to its tail)
  { kind: 'safety_station',    variant: 0, pos: [6.82, 0, -6.80],  rotY: 0 },
  // left wall, beside Doc's desk
  { kind: 'recipe_whiteboard', variant: 0, pos: [-8.715, 0, -4.85], rotY: PI / 2 },
  // right wall, between the oil drums and the shelving rack
  { kind: 'chem_drums',        variant: 0, pos: [8.69, 0, -4.0],   rotY: -PI / 2 },
  { kind: 'gas_cylinders',     variant: 0, pos: [8.80, 0, -2.85],  rotY: -PI / 2 },
  { kind: 'chem_drums',        variant: 1, pos: [8.76, 0, -0.75],  rotY: -PI / 2 },
]);

/** Static colliders the sim would ADD to LAYOUT.boxes ([minX, maxX, minZ, maxZ], the props' measured footprints). */
export const R3_GARAGE_BOXES = Object.freeze([
  [0.17, 1.99, -7.0, -6.26],     // chem_bench
  [2.05, 3.30, -7.0, -6.23],     // fume_hood
  [3.33, 4.23, -7.0, -6.56],     // reagent_shelf
  [4.27, 6.34, -7.0, -6.48],     // suit_rack (+ boots)
  [6.40, 7.24, -7.0, -6.63],     // safety_station (+ sand bucket)
  [-9.0, -8.45, -5.66, -4.04],   // recipe_whiteboard
  [8.27, 9.0, -4.61, -3.39],     // chem_drums v0 (blue drums + pump)
  [8.63, 9.0, -3.29, -2.41],     // gas_cylinders
  [8.45, 9.0, -1.19, -0.30],     // chem_drums v1 (jerrycans)
]);

/** Proposed "Suit up" step: one use spot per suit (0.68 m in front of the rack, 1.25 m clear of the RV tail). */
export const R3_SUIT_UP = Object.freeze({
  rack: 'suit_rack',
  use: { rook: { x: 4.65, z: -5.8, suit: 'suit_0' }, doc: { x: 5.27, z: -5.8, suit: 'suit_1' } },
  marker: { x: 4.96, z: -5.8 },   // one shared glow between the two spots (both within the 1.2 m interact radius)
  holdSeconds: 1.5,
  model: { rook: ['crew_suited', 0], doc: ['crew_suited', 1] },
});

/** Way-out arrows (shown once the door is up / the engine runs). v0 start lands 0.8 m past the RV's front bumper. */
export const R3_EXIT_ARROWS = Object.freeze({
  path: { kind: 'exit_arrow', variant: 0, pos: [0.612, 0, 10.55], rotY: 0, startsAt: [4.0, 0, 4.9] },
  float: { kind: 'exit_arrow', variant: 1, pos: [0.9, 0, 12.2], rotY: PI },
});
