// Merges the expansion packs (new mock assets proposed for the 40-minute version).
// Each pack file is owned by one agent; this file only merges them.
import { PACK as vehicles } from './vehicles.js';
import { PACK as people } from './people.js';
import { PACK as city } from './city.js';
import { PACK as country } from './country.js';
import { PACK as hazards } from './hazards.js';
import { PACK as r3cab } from './r3-cab.js';        // round 3 proposals (agent R3-CAB)
import { PACK as r3garage } from './r3-garage.js';  // round 3 proposals (agent R3-GARAGE)
import { PACK as r3rook } from './r3-rook.js';      // round 3 proposals (agent R3-ROOK)
import { PACK as r3start } from './r3-start.js';    // round 3 proposals (agent R3-START)

const PACKS = [vehicles, people, city, country, hazards, r3cab, r3garage, r3rook, r3start];

export const CAT_NAMES = {
  x_vehicles: 'New · Vehicles', x_people: 'New · People & animals', x_city: 'New · City areas',
  x_country: 'New · Country areas', x_terrain: 'New · Terrain', x_hazards: 'New · Hazards & gear', x_interiors: 'New · Interiors', x_round3: 'Round 3 · Proposed',
};
export const X_BUILDERS = Object.assign({}, ...PACKS.map((p) => p.builders || {}));
export const X_LABELS = Object.assign({}, ...PACKS.map((p) => p.labels || {}));
export const X_NAMED_PARTS = Object.assign({}, ...PACKS.map((p) => p.namedParts || {}));
export const X_CATEGORIES = {};
for (const p of PACKS) for (const [cat, kinds] of Object.entries(p.categories || {})) (X_CATEGORIES[cat] ||= []).push(...kinds);
