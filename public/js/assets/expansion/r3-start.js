// ─────────────────────────────────────────────────────────────────────────────
// Round 3 pack (PROPOSED, not wired into the game yet): the start district around
// Rook's Garage — an industrial edge-of-town block of the Ironworks District.
// Owned by agent R3-START. Exports PACK.
// Builders: r3-start-industry.js (tank farm, pumpjack, pipe bridge, refinery gate, utility pole),
// r3-start-shops.js (24h diner, tyre shop, corner shop, pole signs), r3-start-yard.js (tow yard,
// tow truck, dumpster alley, scrub patch); helpers in r3-start-kit.js.
// Placement proposal: r3-start-layout.js · preview: public/r3-start-preview.html · notes: docs/NOTES-r3-start.md
// ─────────────────────────────────────────────────────────────────────────────
import { BUILDERS as INDUSTRY } from './r3-start-industry.js';
import { BUILDERS as SHOPS } from './r3-start-shops.js';
import { BUILDERS as YARD } from './r3-start-yard.js';

const builders = { ...INDUSTRY, ...SHOPS, ...YARD };

const labels = {
  tank_farm: 'Tank farm (fuel depot / refinery)',
  pumpjack: 'Pumpjack (nodding donkey)',
  pipe_bridge: 'Pipe bridge over the road',
  refinery_gate: 'Refinery gate (road closed)',
  utility_pole: 'Utility pole + sagging wires',
  diner_24h: "24h diner (Lou's)",
  tyre_shop: 'Tyre & wheel shop',
  corner_shop: 'Corner mart',
  pole_sign: 'Roadside pole sign',
  tow_yard: 'Tow yard / scrap yard',
  tow_truck: "Rook's tow truck (parked)",
  dumpster_alley: 'Dumpster alley',
  scrub_patch: 'Scrub & weeds in cracked concrete',
};

const namedParts = {
  pumpjack: ['head', 'crank'],   // head.rotation.x = ±0.22·sin(2πt/6.5) about the saddle bearing; crank.rotation.x = −2πt/6.5
};

export const R3_START_KINDS = Object.keys(builders);
export const PACK = { builders, categories: { x_round3: R3_START_KINDS.slice() }, labels, namedParts };
