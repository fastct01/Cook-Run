// Merges the expansion packs (new mock assets proposed for the 40-minute version).
// Each pack file is owned by one agent; this file only merges them.
import { PACK as vehicles } from './vehicles.js';
import { PACK as people } from './people.js';
import { PACK as city } from './city.js';
import { PACK as country } from './country.js';
import { PACK as hazards } from './hazards.js';

const PACKS = [vehicles, people, city, country, hazards];

export const CAT_NAMES = {
  x_vehicles: 'New · Vehicles', x_people: 'New · People & animals', x_city: 'New · City areas',
  x_country: 'New · Country areas', x_terrain: 'New · Terrain', x_hazards: 'New · Hazards & gear', x_interiors: 'New · Interiors',
};
export const X_BUILDERS = Object.assign({}, ...PACKS.map((p) => p.builders || {}));
export const X_LABELS = Object.assign({}, ...PACKS.map((p) => p.labels || {}));
export const X_NAMED_PARTS = Object.assign({}, ...PACKS.map((p) => p.namedParts || {}));
export const X_CATEGORIES = {};
for (const p of PACKS) for (const [cat, kinds] of Object.entries(p.categories || {})) (X_CATEGORIES[cat] ||= []).push(...kinds);
