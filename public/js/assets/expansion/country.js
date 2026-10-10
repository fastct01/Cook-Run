// ─────────────────────────────────────────────────────────────────────────────
// Expansion pack: COUNTRY AREAS + TERRAIN (art agent "country"). Exports PACK.
// Builders live in country-*.js next to this file. See docs/assets-x/country.md.
//   x_country: buildings + props for Maple Heights, Interstate 9, strip-mall outskirts, farmland,
//              pine foothills & river, salt flats & badlands, ghost town.
//   x_terrain: 80 × 60 m heightfield tiles that line the road edge (see the tile convention in the doc).
// ─────────────────────────────────────────────────────────────────────────────
import { buildChurch, buildHouse2, buildShopRow, buildYardProps } from './country-suburb.js';
import { buildOverpass, buildSoundWall, buildGantrySign, buildTollPlaza, buildJerseyBarrier, buildRestStop } from './country-interstate.js';
import { buildMegamart, buildCarWash, buildMotel2, buildDriveThru, buildMinigolfDino, buildDonutShop, buildTubeMan } from './country-strip.js';
import { buildGrainElevator, buildGreenhouse, buildScarecrow, buildCropRows, buildPumpkinPatch, buildIrrigationPivot, buildCattleGrid } from './country-farm.js';
import { buildPine, buildLogCabin, buildLookoutTower, buildSawmill, buildCoveredBridge, buildRiverRocks } from './country-forest.js';
import { buildHoodoo, buildWeatherBalloon, buildMotelRuin, buildPlaneWreck } from './country-badlands.js';
import { buildSaloon, buildSheriffOffice, buildChapel, buildWaterTowerWood, buildLiveryStable, buildBoardwalk } from './country-ghost.js';
import {
  buildTerrainHills, buildTerrainCliff, buildTerrainLake, buildTerrainRiver, buildTerrainDunes, buildTerrainSalt,
  buildTerrainForestFloor, buildTerrainField, buildTerrainScree,
} from './country-terrain.js';

const B = (build, variants = 1) => ({ build, variants });

const builders = {
  church: B(buildChurch), house_2storey: B(buildHouse2, 2), shop_row: B(buildShopRow), yard_props: B(buildYardProps, 4),
  overpass: B(buildOverpass, 2), sound_wall: B(buildSoundWall), gantry_sign: B(buildGantrySign), toll_plaza: B(buildTollPlaza),
  jersey_barrier: B(buildJerseyBarrier), rest_stop: B(buildRestStop),
  store_megamart: B(buildMegamart), car_wash: B(buildCarWash), motel_2storey: B(buildMotel2), drive_thru: B(buildDriveThru),
  minigolf_dino: B(buildMinigolfDino), donut_shop: B(buildDonutShop), tube_man: B(buildTubeMan, 3),
  grain_elevator: B(buildGrainElevator), greenhouse: B(buildGreenhouse), scarecrow: B(buildScarecrow, 2), crop_rows: B(buildCropRows, 2),
  pumpkin_patch: B(buildPumpkinPatch), irrigation_pivot: B(buildIrrigationPivot), cattle_grid: B(buildCattleGrid),
  pine: B(buildPine, 4), log_cabin: B(buildLogCabin), lookout_tower: B(buildLookoutTower), sawmill: B(buildSawmill),
  covered_bridge: B(buildCoveredBridge), river_rocks: B(buildRiverRocks, 3),
  hoodoo: B(buildHoodoo, 3), weather_balloon: B(buildWeatherBalloon), motel_ruin: B(buildMotelRuin), plane_wreck: B(buildPlaneWreck),
  saloon: B(buildSaloon), sheriff_office: B(buildSheriffOffice), chapel: B(buildChapel), water_tower_wood: B(buildWaterTowerWood),
  livery_stable: B(buildLiveryStable), boardwalk: B(buildBoardwalk),
  terrain_hills: B(buildTerrainHills, 3), terrain_cliff: B(buildTerrainCliff, 2), terrain_lake: B(buildTerrainLake),
  terrain_river: B(buildTerrainRiver), terrain_dunes: B(buildTerrainDunes, 2), terrain_salt: B(buildTerrainSalt),
  terrain_forest_floor: B(buildTerrainForestFloor), terrain_field: B(buildTerrainField), terrain_scree: B(buildTerrainScree),
};

const labels = {
  church: 'Maple Heights church', house_2storey: 'Two-storey house', shop_row: 'Shop row', yard_props: 'Back-yard clutter',
  overpass: 'I-9 overpass', sound_wall: 'Sound wall', gantry_sign: 'Sign gantry', toll_plaza: 'Toll plaza', jersey_barrier: 'Jersey barrier',
  rest_stop: 'Rest stop', store_megamart: 'MEGAMART', car_wash: 'Suds City Car Wash', motel_2storey: 'Sleepy Cactus Motel',
  drive_thru: "Big Bunky's drive-thru", minigolf_dino: 'Dino-Mite Mini Golf', donut_shop: 'Hole Lotta Donuts', tube_man: 'Tube man',
  grain_elevator: 'Grain elevator', greenhouse: 'Polytunnels', scarecrow: 'Scarecrow', crop_rows: 'Crop rows', pumpkin_patch: 'Pumpkin patch',
  irrigation_pivot: 'Irrigation pivot', cattle_grid: 'Cattle grid',
  pine: 'Pine', log_cabin: 'Log cabin', lookout_tower: 'Fire lookout tower', sawmill: 'Tall Pine sawmill', covered_bridge: 'Covered bridge',
  river_rocks: 'River rocks',
  hoodoo: 'Hoodoo', weather_balloon: 'Crashed weather balloon', motel_ruin: 'Oasis Motel ruin', plane_wreck: 'Plane wreck',
  saloon: 'Golden Spur Saloon', sheriff_office: "Sheriff's office", chapel: 'Adobe chapel', water_tower_wood: 'Wooden water tower',
  livery_stable: 'Livery stable', boardwalk: 'Boardwalk',
  terrain_hills: 'Rolling hills', terrain_cliff: 'Bluff / cliff', terrain_lake: 'Lake', terrain_river: 'River crossing', terrain_dunes: 'Sand dunes',
  terrain_salt: 'Salt crust', terrain_forest_floor: 'Forest floor', terrain_field: 'Ploughed field', terrain_scree: 'Scree slope',
};

const namedParts = {
  yard_props: ['gnome_0'],
  toll_plaza: ['arm_0', 'arm_1', 'arm_2', 'arm_3'],
  car_wash: ['brush_0', 'brush_1', 'brush_2'],
  drive_thru: ['sign'],
  tube_man: ['seg_0', 'seg_1', 'seg_2', 'seg_3'],
  saloon: ['door_l', 'door_r'],
};

const X_COUNTRY = [
  'church', 'house_2storey', 'shop_row', 'yard_props',
  'overpass', 'sound_wall', 'gantry_sign', 'toll_plaza', 'jersey_barrier', 'rest_stop',
  'store_megamart', 'car_wash', 'motel_2storey', 'drive_thru', 'minigolf_dino', 'donut_shop', 'tube_man',
  'grain_elevator', 'greenhouse', 'scarecrow', 'crop_rows', 'pumpkin_patch', 'irrigation_pivot', 'cattle_grid',
  'pine', 'log_cabin', 'lookout_tower', 'sawmill', 'covered_bridge', 'river_rocks',
  'hoodoo', 'weather_balloon', 'motel_ruin', 'plane_wreck',
  'saloon', 'sheriff_office', 'chapel', 'water_tower_wood', 'livery_stable', 'boardwalk',
];
const X_TERRAIN = [
  'terrain_hills', 'terrain_cliff', 'terrain_lake', 'terrain_river', 'terrain_dunes', 'terrain_salt',
  'terrain_forest_floor', 'terrain_field', 'terrain_scree',
];

export const PACK = {
  builders,
  categories: Object.fromEntries([['x_country', X_COUNTRY], ['x_terrain', X_TERRAIN]].map(([c, l]) => [c, l.filter((k) => builders[k])]).filter(([, l]) => l.length)),
  labels,
  namedParts,
};
