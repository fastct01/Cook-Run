// ─────────────────────────────────────────────────────────────────────────────
// Expansion pack: HAZARDS, GEAR & INTERIORS (art agent "hazards"). Exports PACK.
// Builders live in hazards-*.js next to this file. See docs/assets-x/hazards.md.
//   x_hazards:   road hazards for the 40-minute run + roof-defence / stop gear for Doc
//                (gear is listed here too: there is no x_gear tab in expansion/index.js).
//   x_interiors: rv_cab_fp (Rook's first-person cab), garage_interior (tutorial), shop_hardware_interior.
// ─────────────────────────────────────────────────────────────────────────────
import {
  buildSteamLeak, buildWaterMain, buildTrenchPlates, buildManholeOpen, buildSinkhole, buildSpeedBump, buildBrokenCar,
  buildTrolley, buildPowerLineDown, buildLog, buildDustDevil, buildFloodWash, buildFlashbang, buildFoamPatch,
  buildStopArrow, buildCarWashSuds,
} from './hazards-road.js';
import { buildRoofHatch, buildWaterHose, buildFirecrackerString, buildPaintBalloon, buildWaterTank } from './hazards-gear.js';
import { buildRvCabFp } from './hazards-cab.js';
import { buildGarageInterior, buildShopHardwareInterior } from './hazards-rooms.js';

const B = (build, variants = 1) => ({ build, variants });

const builders = {
  steam_leak: B(buildSteamLeak, 2), water_main: B(buildWaterMain), trench_plates: B(buildTrenchPlates), manhole_open: B(buildManholeOpen),
  sinkhole: B(buildSinkhole), speed_bump: B(buildSpeedBump), broken_car: B(buildBrokenCar), trolley: B(buildTrolley, 2),
  power_line_down: B(buildPowerLineDown), log: B(buildLog), dust_devil: B(buildDustDevil), flood_wash: B(buildFloodWash),
  flashbang: B(buildFlashbang, 2), foam_patch: B(buildFoamPatch), stop_arrow: B(buildStopArrow), car_wash_suds: B(buildCarWashSuds),
  roof_hatch: B(buildRoofHatch), water_hose: B(buildWaterHose), firecracker_string: B(buildFirecrackerString),
  paint_balloon: B(buildPaintBalloon, 4), water_tank: B(buildWaterTank),
  rv_cab_fp: B(buildRvCabFp), garage_interior: B(buildGarageInterior), shop_hardware_interior: B(buildShopHardwareInterior),
};

const labels = {
  steam_leak: 'Steam leak (sewer)', water_main: 'Burst water main', trench_plates: 'Trench plates', manhole_open: 'Open manhole',
  sinkhole: 'Sinkhole', speed_bump: 'Speed bump', broken_car: 'Broken-down car', trolley: 'Shopping trolley',
  power_line_down: 'Downed power line', log: 'Rolling log', dust_devil: 'Dust devil', flood_wash: 'Flooded crossing',
  flashbang: 'Police canister', foam_patch: 'Sticky foam patch', stop_arrow: 'Stop-here arrow', car_wash_suds: 'Car-wash suds',
  roof_hatch: 'Roof hatch', water_hose: 'Hose reel + nozzle', firecracker_string: 'Firecracker string', paint_balloon: 'Paint balloon',
  water_tank: 'Roof water tank',
  rv_cab_fp: 'RV cab (first person)', garage_interior: "Rook's Garage", shop_hardware_interior: 'Bolt & Barrel (inside)',
};

const PUFFS = Array.from({ length: 14 }, (_, i) => `puff_${i}`);
const namedParts = {
  steam_leak: [...PUFFS, 'cover'],
  water_main: ['jet'],
  manhole_open: ['cover'],
  broken_car: ['hazard_l', 'hazard_r', 'hood'],
  power_line_down: ['spark', 'spark_1'],
  log: ['trunk'],
  dust_devil: ['ring_0', 'ring_1', 'ring_2', 'ring_3', 'ring_4', 'ring_5', 'debris'],
  flashbang: ['can'],
  stop_arrow: ['arrow', 'ring'],
  roof_hatch: ['lid'],
  water_hose: ['nozzle', 'reel'],
  firecracker_string: ['fuse'],
  paint_balloon: ['balloon'],
  water_tank: ['valve'],
  rv_cab_fp: ['needle_speed', 'needle_rpm', 'needle_temp', 'wheel', 'hand_l', 'hand_r', 'wiper_l', 'wiper_r', 'mirror_l_glass', 'mirror_r_glass', 'mirror_c_glass'],
  garage_interior: ['door', 'keys', 'notebook', 'crate', 'plug', 'marker_0', 'marker_1', 'marker_2', 'marker_3'],
  shop_hardware_interior: ['cam_0', 'cam_1', 'cam_0_view', 'cam_1_view', 'item_0', 'item_1', 'item_2', 'clerk_spot'],
};

const X_HAZARDS = [
  'steam_leak', 'water_main', 'trench_plates', 'manhole_open', 'sinkhole', 'speed_bump', 'broken_car', 'trolley', 'power_line_down',
  'log', 'dust_devil', 'flood_wash', 'flashbang', 'foam_patch', 'stop_arrow', 'car_wash_suds',
  'roof_hatch', 'water_hose', 'firecracker_string', 'paint_balloon', 'water_tank',
];
const X_INTERIORS = ['rv_cab_fp', 'garage_interior', 'shop_hardware_interior'];

export const PACK = { builders, categories: { x_hazards: X_HAZARDS, x_interiors: X_INTERIORS }, labels, namedParts };
