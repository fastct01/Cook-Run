// ─────────────────────────────────────────────────────────────────────────────
// Render-only look of each of the 13 areas (VIEW-WORLD-A). Keyed by biome id;
// numbers blend across borders through RoadInfo.vis(z, key).
//   hills / hillsFrom   relief amplitude of the cheap far ground, and its start (m beyond the corridor)
//   canyon, sand, salt, fields  ground looks (see RoadInfo.groundColor / groundY)
//   tiles               terrain tile rows: { band (m from corridor to the tile's road edge),
//                       kinds: [[kind, variant, weight]…], sides:[±1] }
//   lamp                street lights: 'city' | 'docks' | null
// Road surfaces come from route.json biome.road.type.
// ─────────────────────────────────────────────────────────────────────────────

export const VIS_DEFAULT = { hills: 8, hillsFrom: 40, canyon: 0, fields: 0, sand: 0, salt: 0, dirt: 0, haze: 0 };

export const AREAS = {
  ironworks: { vis: { hills: 0, hillsFrom: 120, sand: 0.15 } },
  downtown: { vis: { hills: 0, hillsFrom: 200 } },
  oldtown: { vis: { hills: 0, hillsFrom: 200 } },
  docks: { vis: { hills: 0, hillsFrom: 200 } },
  suburbs: { vis: { hills: 14, hillsFrom: 70 } },
  interstate: {
    vis: { hills: 18, hillsFrom: 100 },
    tiles: { band: 15, kinds: [['terrain_hills', 0, 3], ['terrain_hills', 2, 3], ['terrain_hills', 1, 1]] },
  },
  stripmall: { vis: { hills: 10, hillsFrom: 110, sand: 0.1 } },
  farmland: {
    vis: { hills: 7, hillsFrom: 130, fields: 0.6, sand: 0.25 },
    tiles: { band: 46, kinds: [['terrain_field', 0, 1]] },
  },
  foothills: {
    vis: { hills: 34, hillsFrom: 95 },
    tiles: { band: 1.5, kinds: [['terrain_forest_floor', 0, 5], ['terrain_hills', 1, 1], ['terrain_cliff', 0, 2], ['terrain_hills', 0, 1]] },
  },
  saltflats: {
    vis: { hills: 0, hillsFrom: 200, salt: 1, sand: 0.6 },
    tiles: { band: 1.5, kinds: [['terrain_salt', 0, 1]] },
  },
  ghosttown: {
    vis: { hills: 10, hillsFrom: 115, sand: 1, dirt: 1 },
    tiles: { band: 30, kinds: [['terrain_dunes', 0, 2], ['terrain_dunes', 1, 2]] },
  },
  canyon: {
    vis: { hills: 10, hillsFrom: 40, canyon: 1, sand: 0.4 },
  },
  hideout: {
    vis: { hills: 26, hillsFrom: 110, sand: 0.7 },
    tiles: { band: 34, kinds: [['terrain_dunes', 1, 2], ['terrain_dunes', 0, 1]] },
  },
};

/** Road surface colours by type (mixed with the biome's own road colour). */
export const ROAD_LOOK = {
  city: { mix: 0, worn: 0 },
  cobble: { mix: 0.0, worn: 0 },
  freeway: { mix: 0, worn: 0 },
  rural: { mix: 0, worn: 1 },
  dirt: { mix: 1, worn: 1, color: '#a88763' },
};
