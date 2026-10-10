// ─────────────────────────────────────────────────────────────────────────────
// Expansion pack: CITY AREAS (art agent: city). Must export PACK.
//   builders:   { kind: { build: (variant) => THREE.Object3D, variants: n } }
//   categories: { x_city: [kind, ...] }
//   labels:     { kind: 'Human label' }
//   namedParts: { kind: ['part', ...] }          (checked by test/check-assets.js)
// Builders live in city-ironworks.js, city-downtown.js, city-oldtown.js and city-docks.js;
// shared modelling helpers + sign painters in city-kit.js.
// See docs/assets-x/city.md for sizes, named parts and placement notes.
// ─────────────────────────────────────────────────────────────────────────────
import { measure } from '../models/kit.js';
import { BUILDERS as IRONWORKS } from './city-ironworks.js';
import { BUILDERS as DOWNTOWN } from './city-downtown.js';
import { BUILDERS as OLDTOWN } from './city-oldtown.js';
import { BUILDERS as DOCKS } from './city-docks.js';

const LABELS = {
  // A. the start + B. Ironworks District
  rooks_garage: "Rook's Garage", factory: 'Factory', warehouse: 'Warehouse', rail_shed: 'Engine shed', water_tower_city: 'Water tower (steel)',
  overhead_crane: 'Yard gantry crane', chainlink_fence: 'Chain-link fence', rail_track: 'Rail track',
  // C. Downtown
  skyscraper: 'Skyscraper', cinema: 'Starlite cinema', police_station: '11th Precinct', hotel: 'Hotel Meridian', fire_station: 'Fire station',
  // D. Old Town
  loft: 'Brick loft', market_stall: 'Market stall', clock_tower: 'Clock tower', diner: "Rosie's Diner", streetcar_stop: 'Streetcar stop',
  bunting: 'Festival bunting', store_market: 'Old Town Market',
  // E. Harbour Docks
  dock_warehouse: 'Dock warehouse', container_stack: 'Container stack', gantry_crane: 'Ship-to-shore crane', lighthouse: 'Lighthouse',
  fishing_boat: 'Fishing boat', cargo_ship: 'Cargo ship', drawbridge: 'Bascule drawbridge', bollard_crates: 'Dock clutter', store_chandlery: 'Harbour Chandlery',
};

const NAMED_PARTS = {
  rooks_garage: ['door'],            // slides up: position.y 0 → userData.door.open (4.4)
  factory: ['smoke'],                // chimney mouth (smoke_mesh is the sooty mouth disc) — emit smoke here
  clock_tower: ['hand_h', 'hand_m'], // rotation.z, clockwise = negative, 0 = 12 o'clock
  gantry_crane: ['trolley'],         // slides along the boom on position.z
  lighthouse: ['lamp'],              // rotation.y; lamp_mesh has its own emissive material
  drawbridge: ['leaf_l', 'leaf_r'],  // rotation.x: leaf_l < 0 / leaf_r > 0 raises (±1.25 fully open)
};

// userData.size = measured visual bounds of the default pose (w along X, l along Z, h up)
function fitted(build) {
  return (v) => {
    const g = build(v);
    const m = measure(g);
    g.userData.size = { w: +m.w.toFixed(2), h: +m.h.toFixed(2), l: +m.l.toFixed(2) };
    return g;
  };
}
const ALL = { ...IRONWORKS, ...DOWNTOWN, ...OLDTOWN, ...DOCKS };
const BUILDERS = {};
for (const [kind, def] of Object.entries(ALL)) BUILDERS[kind] = { build: fitted(def.build), variants: def.variants };

const ORDER = Object.keys(LABELS).filter((k) => BUILDERS[k]);

export const PACK = {
  builders: BUILDERS,
  categories: { x_city: ORDER },
  labels: LABELS,
  namedParts: NAMED_PARTS,
};
