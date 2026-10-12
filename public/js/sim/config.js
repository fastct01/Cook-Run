// ─────────────────────────────────────────────────────────────────────────────
// SimConfig: code defaults for every Agent-SIM tuning knob, deep-merged with
// `rules.sim` from rules.json (the JSON wins). Keeps the sim robust if a key is
// missing and documents every knob in one place. Unity port: a ScriptableObject.
// ─────────────────────────────────────────────────────────────────────────────
export const SIM_DEFAULTS = {
  countdownSeconds: 3,
  garageCountdownSeconds: 1.5,  // garage phase → countdown → drive (expansion)
  rv: {
    mass: 3.0,              // relative to a sedan (1.0) for collision impulses
    steerFollow: 6.0,       // how fast the steering wheel follows input (1/s)
    steerFullAt: 5.0,       // speed (m/s) where full yaw rate is reached
    steerFalloff: 18.0,     // yaw rate /= 1 + (v - steerFullAt) / steerFalloff
    gripScale: 1.5,         // max lateral accel = grip * g * gripScale
    handbrakeGrip: 0.35,    // grip multiplier with handbrake → drift
    handbrakeDecel: 6,
    handbrakeYaw: 1.3,
    rollDecel: 0.5,         // coasting decel (m/s²)
    dragScale: 0.25,        // coasting decel += rules.rv.drag * dragScale * v
    overspeedDecel: 5,      // decel when above the current top speed (after nitro, off-road)
    shoulderSlow: 0.85,     // top speed factor on the paved shoulder
    flatTopFactor: 0.7,     // top speed factor with a flat tyre
    flatWobble: 0.18,       // steering wobble amplitude with a flat tyre
    railMargin: 0.8,        // bridge deck rails: |u| <= halfWidth + railMargin
    railScrapeDamagePerMps: 0.35,
    wallBounce: 0.25,
    hardLandingVy: -9,
    hardLandingDamagePerMps: 1.5,
    hardLandingBase: 4,
    jumpLandMargin: 1.0,    // the RV centre must reach gapEnd - margin above the deck edge
    respawnGrace: 2.0,
    resetCooldown: 3,
    oilGrip: 0.3,
    sandBiomes: ['ghosttown', 'hideout'], // off-road is sand here (rules.rv.sandSlow)
    foamDecel: 14,          // foam patch: decel (m/s²) down to the foam speed cap
    waterFallDamage: 15,    // falling into the water (drawbridge gap) before the respawn
  },
  startGadgets: { smoke: 1, oil: 0, nitro: 0 },
  traffic: {
    windowBehind: 70, windowAhead: 400, spawnAhead: [240, 330], oncomingShare: 0.45,
    maxCars: 16, laneChangeRate: 1.4, followGap: 7, lookAhead: 38, crashFriction: 7,
    spinFriction: 5, restitution: 0.25,
    densityMult: 1,         // difficulty lever: × biome.trafficPer100m and maxCars (Easy 0.8, Extreme 1.2)
  },
  rival: {
    spawnAt: [4550, 5320], hp: 60, topSpeed: 33, spawnBehind: 110, ramCooldown: 4,
    sideOffset: 3.4, ramSeconds: 0.8, giveUpAfterGadget: true, maxRams: 4, maxChaseSeconds: 45,
    biomes: ['saltflats'],  // biomes the rival chases in (it gives up elsewhere)
  },
  peds: {
    windowBehind: 50, windowAhead: 300, spawnAhead: [150, 280], maxPeds: 34,
    jaywalkChance: 0.12, crossGroupChance: 0.75, crossGroupSize: [2, 4], crossTriggerAhead: [100, 150],
    // runners: share of spawned peds that sprint across when the RV is reactSeconds away (≥ minRange m)
    runners: { chance: 0.22, reactSeconds: [2.2, 3.5], runSpeed: [3.4, 4.6], minRange: 30, hornCancelRange: 50 },
    panicSeconds: 3, getUpSeconds: 1.2, groundFriction: 6,
  },
  obstacles: {
    chunk: 50, windowBehind: 80, windowAhead: 320, excludeStart: 90, hitCooldown: 0.8, flyingSeconds: 1.4,
    densityMult: 1,         // difficulty lever: × biome.obstaclePer100m (Easy 0.7, Extreme 1.3)
  },
  cops: {
    hp: 45, suvHp: 80, mass: 1.2, suvMass: 1.8, length: 4.8, width: 1.95, suvLength: 5.2, suvWidth: 2.1,
    accel: 9, brake: 14, grip: 13, maxYawRate: 1.7, rubberBand: 5, rubberBandFrom: 90,
    loseRange: 230, spawnBehind: [90, 130], spawnAhead: [170, 220], spawnAheadChance: 0.3,
    followDist: 6, ramRange: 26, ramCooldown: 7, ramSeconds: 0.7, aiCrashDamageScale: 0.25, copRamHeatMinSpeed: 4, copRamHeatCooldown: 4, sideOffset: 3.3,
    heliHeight: 24, heliSpeed: 45, roadblockAhead: 220, spikesAhead: [140, 175],
    stopBeforeRamp: 12, comicFlyRange: 15, damageMult: 2.2, firstRoadblockDelay: 6,
    firstSpawnDelay: 1.5, parkedActivateRange: 35, ramGlobalCooldown: 8, rubberBandMinStars: 3, alarmSpawnDelay: 2,
    motoLength: 2.3, motoWidth: 0.95, motoMass: 0.45,             // moto_cop (hp/topSpeed: rules.heat.moto)
    rhinoLength: 6.6, rhinoWidth: 2.7, rhinoMass: 4.5,            // rhino_truck (rules.heat.rhino)
    interceptorLength: 4.95, interceptorWidth: 1.98, interceptorMass: 1.3, interceptorHp: 50,
  },
  heatExtra: { spawnNeedsRecent: true, calmDelay: 12, calmDecayPerSec: 0.025 },
  patrol: {
    enabled: true, biomes: ['ironworks', 'downtown', 'oldtown', 'docks', 'suburbs', 'stripmall'], chance: 0.5, minZ: 150, zOffset: 5, offset: 3.0, spawnAhead: 320,
    watchRadius: 45, speedLimit: { city: 17, suburbs: 20, ironworks: 17, downtown: 17, oldtown: 15, docks: 17, stripmall: 20 }, speedingHeat: 0.35, witnessHeat: 0.25,
    ticketCooldown: 30,     // s between two speeding tickets (any patrol)
  },
  lab: { spottedRange: 18, spottedCooldown: 6, copCloseRange: 18, cookReviveSeconds: 12, cookReviveHp: 25, ventSmokeWitnessed: false, hostCookDamage: false },
  stops: { maxLoadSpeed: 2.5, blockRadius: 25, nearRange: 250 },
  sell: { maxSpeed: 3 },
  rockfall: { spawnAhead: [30, 120], leadSeconds: [0.8, 1.8], minSpacing: 14, height: 25, maxRocks: 14, startBefore: 60 },
  train: { length: 60, width: 3.4, damage: 40, gateOffset: 5, announceRange: 500 },
  scoring: { smoothLatAcc: 2.0, smoothMaxBump: 0.08, smoothMinSpeed: 5 }, // star thresholds: rules.scoring.stars
  feel: { bumpDecay: 3, latAccSmooth: 0.12 },
};

function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

export function deepMerge(base, over) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (!isObj(over)) return out;
  for (const k of Object.keys(over)) {
    if (k.startsWith('_')) continue;
    const b = base ? base[k] : undefined, o = over[k];
    out[k] = isObj(b) && isObj(o) ? deepMerge(b, o) : (Array.isArray(o) ? o.slice() : o);
  }
  return out;
}

export function buildSimConfig(rules) {
  return deepMerge(SIM_DEFAULTS, (rules && rules.sim) || {});
}
