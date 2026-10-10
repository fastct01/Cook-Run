# Agent SIM notes — `public/js/sim/**`

Authoritative, deterministic game simulation for Cook & Run. Pure logic (no DOM / three.js /
`Math.random` / clocks), fixed `dt = 1/60` (a bigger `dt` is sub-stepped, max 8 sub-steps).
Runs unchanged in the browser (checked in headless Chromium) and in Node.

```
npm run test:sim                                   # a)–g), PASS/FAIL report (+4 informational seeds)
node public/js/sim/test/run-headless.js --seed=42 --seeds=1,2,3 --strict --verbose
node public/js/sim/test/run-headless.js --seeds=none   # skip the extra seeds
```

## API (as in CONTRACT.md)

```js
import { GameSim } from './sim/GameSim.js';
import { Autopilot } from './sim/autopilot.js';
const sim = new GameSim(data, { seed, solo });
sim.step(input, 1/60);         // DriverInput (gadget booleans edge-triggered by the caller)
sim.snapshot();                // full Snapshot, drains the LOCAL event queue
sim.netSnapshot();             // compact Snapshot (2 dp, ents within rules.net radii, ≤ maxEntitiesInSnapshot)
                               //   + events drained from the NET queue
sim.drainNetEvents();          // drain the NET queue only
sim.applyCookCommand(cmd);     // CMD.*
sim.setLabState(lab);          // LabState
sim.phase; sim.result;         // 'countdown'|'drive'|'won'|'lost'; EndResult once over
const ap = new Autopilot(data, { seed });  ap.update(snapshot) → DriverInput
//   options: cruise, maxSpeed, useNitro (default true), brakeForPeds (default false), biomeCruise
```
Every `emit()` goes to both queues; each is capped at 256 (oldest dropped). If you send net
snapshots at 15 Hz, call `netSnapshot()` only when sending: events in between accumulate.

## Files → Unity systems

| file | system | Unity |
|---|---|---|
| `GameSim.js` | orchestrator, phases, damage, vehicle-vehicle collisions, snapshots | `GameSimulation` |
| `vehicle.js` | RV arcade physics, ramp/air/landing, lateral limits; `aiDrive` motor for AI cars | `RvController`, `AiCarMotor` |
| `traffic.js` | civilian traffic (follow, overtake, swerve) + desert rival | `TrafficManager`, `AiCar` |
| `peds.js` | pedestrians (walk / cross in groups / jaywalk / panic / knocked) | `PedManager`, `Ped` |
| `obstacles.js` | per-chunk props + dynamic hazards (roadwork, roadblocks, spikes, rocks) | `ObstacleSpawner`, `Obstacle` |
| `cops.js` | patrols, pursuit, rams, roadblocks, spikes, heli, bridge give-up | `PoliceManager`, `CopCar`, `CopHeli` |
| `heat.js` | wanted level, sight, decay, calm decay, bust meter | `HeatManager` |
| `stops.js` | supply stops (+ alarm), sell point | `SupplyStop`, `SellPoint` |
| `events.js` | roadwork, train crossing, dust storm, rockfall | `RouteEventDirector` |
| `bridge.js` | canyon jump: `speedNeeded`, launch/land/fall, checkpoint | `CanyonJump` |
| `gadgets.js` | nitro / smoke / oil | `GadgetLauncher` |
| `lab.js` | LabState hazards + CookCommands + cook-down | `LabLink` |
| `scoring.js` | points, smooth bonus, EndResult, rating | `ScoreKeeper` |
| `collisions.js` | capsule/circle tests + impulses | (Unity physics) |
| `road.js` | 1 m sampled cache of `Track` | baked arrays |
| `config.js` | code defaults for `rules.sim` | ScriptableObject |
| `autopilot.js` | bot driver (attract mode / tests) | `AutopilotDriver` |

Each system has its own `Rng` stream (`hashSeed(seed, 101…606)`), so a change in how often one
system rolls dice never shifts another. Obstacles use `Rng(hashSeed(seed, chunkIndex))` per 50 m
chunk: the same props come back every time a chunk is (re)loaded; smashed ones stay smashed.

## Snapshot fields added on top of protocol.js
```
rv.zone       'road'|'shoulder'|'dirt'|'lot'     surface under the RV
rv.drift      m/s lateral slip (tyre smoke/screech when |drift| > ~2)
rv.handbrake  bool       rv.horn bool       rv.grace  s of respawn invulnerability left
crew.cookDown bool       Doc is out cold: cook commands are ignored; back after 12 s with 25 hp
heat.unseen   s since a cop last saw the RV (normal decay starts at rules.heat.decayDelay)
inv.value     running payout value of the product carried
bridge.lip, bridge.launchSpeed, bridge.cleared (bool), bridge.falls
weather       'clear'|'dust'
train         null | { z, state: 'clear'|'warn'|'pass', dist }   nearest crossing
sell          { x, z, dist, radius }   the drive-in (Track.sellPointPos())
looted        [stopId...]
nearStop      also has { side, z }
maxStars      highest wanted level this run
```
EndResult extras: `breakdown {base, payoutPts, timeBonus, noKnockBonus, smooth}`, `smashed`,
`copsWrecked`, `maxStars`, `stopsLooted`, `rvHp`.

Entities: `falling_rock` y > 0 while falling (draw a shadow on the road), state 0 once landed
(solid). `roadblock` = smashable barricade (0/1/2). `crossing_gate` variant 0 = near (−z) side,
1 = far side; state 1 = down/flashing. `train` yaw = road heading + π/2 (it runs across the
road); only present while passing. `smoke_cloud`/`oil_slick` state = age × 10. Heli: 1 chasing,
0 leaving. Patrol cops are `cop` with variant 1, state 0 (parked, lights off) until they join in.

Events: `msg {text, tone}` is used for toasts (stop loaded, "Speeding past a patrol car!",
"The clerk called the cops!", roadblock, rival, dust storm, "No smoke bombs — ask the cook!",
"Doc: …", "Doc finished a Street Batch — 92%! (+2 bags)", …). `end {result}` once.

## Track helpers added (append-only, `track.js`)
`sideRoom(z)`, `driveLimitU(z)`, `intersectionZs()` (crosswalk z list; peds cross there,
patrols park there, the renderer can draw crossings), `sellPointPos()`, `roadworks()`.

## Data keys added / changed
- route.json: `biomes[].sideRoom` (14 city/suburbs, 30 outskirts/desert/hideout, 3 canyon),
  `sellPoint.offset` (10 m beyond the shoulder), `events[roadwork].closedSide` (+1 = forward
  lane), `stops[lastgas].alarm: 2.6` (heat when looted → the finale chase).
- rules.json: `obstacles.roadblock`, `scoring.stars: [0, 2500, 4000]` (points for 1/2/3★),
  the whole `sim` block. Tuned values: `heat.sources.ventSmokePerSec` 0.05→0.02,
  `heat.decayPerSec` 0.03→0.05, `heat.decayDelay` 8→7.
- lab.json: `startInventory` → `{ salts: 1, solvent: 2, fuel: 2 }` (Doc can cook a second street
  batch right after the hardware stop instead of idling until Sunny Gas & Ice).

## Cook coupling (matches CookLab)
- `LabState.cookHurt` (hp lost since the last LabState) is subtracted from `crew.cook`. CookLab
  computes the cook's fume/fire damage itself, so the host does NOT also apply
  `fumesCookDamagePerSec` / `fireCookDamagePerSec` (only as a fallback for a lab client that
  never sends `cookHurt`, or with `rules.sim.lab.hostCookDamage = true`). Host-side: fumes hurt
  the driver, fire hurts the RV, explosions hurt RV + cook (+heat).
- Cook at 0 hp → `crew.cookDown = true`; all cook commands are ignored (a `startRecipe` gets
  `recipeDenied 'Doc is out cold'` so the UI doesn't hang); after 12 s Doc is back at 25 hp.
- `LabState.curtains === true` means CLOSED. Spotted = cooking && !curtains && a cop within 18 m.
- `recipeDone` pays out only for an accepted `reqId`, once (duplicates are ignored).
- Driver hp 0 → lost 'crewDown'. RV hp 0 → lost 'wrecked'. 8% of RV impact damage also hurts
  each crew member (`rules.sim.rv.crewCrashShare`, code default).

## Heat & chase design
- Heat sources: peds hit, cars crashed into (only when the RV is the aggressor), ramming a cop
  (only when the RV drives into it — being rammed or boxed in adds nothing), smashed props, vent
  smoke while cooking (not "witnessed": it doesn't stop heat decaying), lab spotted, explosions,
  **patrol tickets**, and the **Last Chance Gas alarm**.
- Patrols (baseline): in city/suburbs ~50% of intersections have a parked patrol car on the
  cross street. Passing it above the speed limit (17 m/s city, 20 suburbs) at 0 stars costs
  `speedingHeat` 0.35; incidents in its sight add `witnessHeat`. With ≥ 1 star it pulls out and
  joins the chase.
- Decay: normal decay after `decayDelay` s unseen (dust storm = unseen); calm decay
  (`heatExtra.calmDecayPerSec` 0.025) while seen but nothing happened for 12 s.
- Cops: 1★ cops (28 m/s) can be outrun at full speed; rubber-banding (+5 m/s beyond 90 m) only
  from 3★ (`cops.rubberBandMinStars`). From 3★ cops (32–36) outrun the RV, but bust still needs
  the RV under `bust.maxRvSpeed` (4 m/s) with a chasing cop within 7.5 m for 2.5 s — a moving RV
  only takes ram damage. Rams share a global cooldown (`cops.ramGlobalCooldown` 8 s).
- Finale: looting Last Chance Gas trips an alarm (2★), the chase runs through the desert
  (dust storm, rival) and canyon (rockfall) to the bridge; at the lip all cops give up.

## Tuning knobs (`rules.sim`, defaults in `sim/config.js`)
- **rv**: `mass` (3 = 3 sedans), `steerFollow`, `steerFullAt`/`steerFalloff` (speed-sensitive yaw
  rate: full at 5 m/s, ÷(1+(v−5)/18) above), `gripScale` (lat. accel = grip·g·scale),
  `handbrakeGrip`/`handbrakeYaw`/`handbrakeDecel` (drift), `shoulderSlow`, `flatTopFactor`,
  `flatWobble`, `railMargin` (bridge deck |u| ≤ halfWidth+0.8), `railScrapeDamagePerMps`,
  `hardLandingVy` (−9), `hardLandingDamagePerMps`, `jumpLandMargin` (1 m, used by
  `speedNeeded`), `respawnGrace`, `oilGrip` (own slick).
- **traffic**: spawn window, `oncomingShare`, `maxCars`, `followGap`(+`headway`), `lookAhead`,
  `recoverSeconds`. Cars overtake through a clear oncoming lane on two-lane roads.
- **rival**: `spawnAt` z list, `hp`, `topSpeed`, `ramCooldown`, `maxRams`, `maxChaseSeconds`.
- **peds**: `jaywalkChance`, `crossGroupChance`, `crossGroupSize`, `crossTriggerAhead`,
  `panicSeconds`, `getUpSeconds`.
- **cops**: `hp`/`suvHp`, `damageMult`, `aiCrashDamageScale`, `rubberBand`/`rubberBandMinStars`,
  `spawnBehind`/`spawnAhead`, `ramCooldown`/`ramGlobalCooldown`, `roadblockAhead` (220),
  `spikesAhead`, `stopBeforeRamp`, `comicFlyRange` (a cop ≤ 15 m behind at the lip sails off
  the ramp and falls), `copRamHeat*`, `alarmSpawnDelay`.
- **patrol**: `enabled`, `biomes`, `chance`, `speedLimit`, `speedingHeat`, `witnessHeat`,
  `watchRadius`.
- **heatExtra**: `spawnNeedsRecent`, `calmDelay`, `calmDecayPerSec`.
- **lab**: `spottedRange`, `spottedCooldown`, `copCloseRange`, `cookReviveSeconds` (12),
  `cookReviveHp` (25), `ventSmokeWitnessed`, `hostCookDamage`.
- **rockfall**: `leadSeconds` (rocks land ~0.8–1.8 s before the RV arrives), `minSpacing`.
- **scoring** (sim): `smoothLatAcc`, `smoothMaxBump`, `smoothMinSpeed`; rating thresholds live in
  `rules.scoring.stars`.

## Bridge
`speedNeeded` ≈ 25.0 m/s with the shipped data (ramp 9.1°, 8 m high, 42 m gap, 1 m margin),
solved by bisection on the ballistic range — reachable at top speed (30) without nitro; nitro
(40) makes it comfortable. Over the gap without enough speed the RV falls; at
y < −canyonDepth·0.4 → `fell`, respawn at `checkpointZ` (forward lane, 0 speed), −30 hp, −1 bag,
cops cleared, 2 s grace.

## Known limits
- The Autopilot can't U-turn: if a chasing cop blocks a supply stop it skips it (≈1 in 13
  seeds then ends 'noProduct'). Good enough for attract mode; the default seed always wins.
- Collisions are capsules in XZ; vehicles never flip (roll is cosmetic).
