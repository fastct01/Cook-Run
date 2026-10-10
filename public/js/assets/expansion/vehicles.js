// ─────────────────────────────────────────────────────────────────────────────
// Expansion pack: VEHICLES (art agent "vehicles"). Must export PACK.
//   builders:   { kind: { build: (variant) => THREE.Object3D, variants: n } }
//   categories: { x_vehicles: [kind, ...] }
//   labels:     { kind: 'Human label' }
//   namedParts: { kind: ['part', ...] }          (checked by test/check-assets.js)
// Builders live in vehicles-*.js next to this file (shared helpers in vehicles-common.js).
// Animation contract per kind: docs/assets-x/vehicles.md.
// ─────────────────────────────────────────────────────────────────────────────
import { buildRhino, buildMotoCop, buildInterceptor } from './vehicles-police.js';
import { buildComet, buildKestrel, buildChopper } from './vehicles-hero.js';
import { buildStreetcar, buildCarCarrier, buildWideLoad, buildCombine, buildLoggingTruck } from './vehicles-heavy.js';
import { buildForklift, buildGarbageTruck, buildNewsVan, buildParadeFloat, buildStagecoach, buildGorilla } from './vehicles-civic.js';

const W4 = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'];
const TRUCK10 = [...W4, 'wheel_rl2', 'wheel_rr2', 'wheel_tl', 'wheel_tr', 'wheel_tl2', 'wheel_tr2'];
const seq = (p, n) => Array.from({ length: n }, (_, i) => `${p}${i}`);

// [kind, builder, variants, label, named parts]
const DEFS = [
  ['rhino_truck', buildRhino, 2, 'Rhino armoured truck', [...W4, 'rear_door_l', 'rear_door_r', 'lobber', 'throw_point', 'light_red', 'light_blue', 'body']],
  ['moto_cop', buildMotoCop, 1, 'Police motorbike', ['wheel_f', 'wheel_r', 'rider', 'light_red', 'light_blue', 'body']],
  ['interceptor', buildInterceptor, 2, 'Highway interceptor', [...W4, 'light_red', 'light_blue', 'body']],
  ['comet_car', buildComet, 1, 'The Midnight Comet', ['booster', ...W4, 'canopy', 'glow', 'body']],
  ['kestrel_car', buildKestrel, 2, "Kestrel's car", [...W4, 'body']],
  ['chopper', buildChopper, 5, 'Chopper', ['wheel_f', 'wheel_r', 'rider', 'body']],
  ['streetcar', buildStreetcar, 2, 'Old Town streetcar', ['pantograph', ...W4, 'wheel_fl2', 'wheel_fr2', 'wheel_rl2', 'wheel_rr2', 'body']],
  ['car_carrier', buildCarCarrier, 2, 'Car carrier', [...TRUCK10, ...seq('cargo_', 6), 'ramp', 'body']],
  ['wide_load', buildWideLoad, 2, 'Wide load', [...W4, 'light_amber', 'body']],
  ['logging_truck', buildLoggingTruck, 2, 'Logging truck', [...TRUCK10, ...seq('log_', 6), 'chains', 'body']],
  ['combine', buildCombine, 2, 'Combine harvester', ['reel', ...W4, 'body']],
  ['garbage_truck', buildGarbageTruck, 2, 'Garbage truck', [...W4, 'wheel_rl2', 'wheel_rr2', 'lifter', 'body']],
  ['forklift', buildForklift, 2, 'Dock forklift', ['forks', ...W4, 'body']],
  ['news_van', buildNewsVan, 1, 'KDST 7 news van', ['dish', 'mast', ...W4, 'body']],
  ['parade_float', buildParadeFloat, 2, "Founders' Day float", [...W4, ...seq('flag_', 4), 'body']],
  ['stagecoach', buildStagecoach, 2, 'Stagecoach', [...W4, 'horse_0', 'horse_1', 'leg_fl', 'leg_fr', 'leg_rl', 'leg_rr', 'body']],
  ['inflatable_gorilla', buildGorilla, 2, 'Inflatable gorilla', ['arm_l', 'arm_r', 'body']],
];

// Variant names (userData.style; the showroom shows them after the label).
const STYLES = {
  rhino_truck: ['marked', 'unmarked'], interceptor: ['slash livery', 'slick-top'], kestrel_car: ['white', 'black'],
  chopper: ['Rattlers', 'Rattlers', 'Rattlers', 'Rattlers', 'lone rider'], streetcar: ['maroon', 'green'], car_carrier: ['blue cab', 'red cab'],
  wide_load: ['house hauler', 'escort pickup'], logging_truck: ['red', 'cream'], combine: ['green', 'red'], garbage_truck: ['green', 'blue'],
  forklift: ['loaded', 'empty'], parade_float: ['prospector', 'saguaro'], stagecoach: ['red', 'green'], inflatable_gorilla: ['purple', 'slate'],
};
function styled(kind, fn) {
  return (v) => { const o = fn(v); const st = STYLES[kind]?.[v]; if (st) o.userData.style = st; return o; };
}

export const PACK = {
  builders: Object.fromEntries(DEFS.map(([kind, fn, n]) => [kind, { build: styled(kind, fn), variants: n }])),
  categories: { x_vehicles: DEFS.map(([kind]) => kind) },
  labels: Object.fromEntries(DEFS.map(([kind, , , label]) => [kind, label])),
  namedParts: Object.fromEntries(DEFS.map(([kind, , , , parts]) => [kind, parts])),
};
