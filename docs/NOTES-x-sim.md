# SIM-CORE notes: the 40-minute expansion (`public/js/sim/**`)

This builds on `docs/NOTES-sim.md` (the 7 km sim). Everything there still holds unless this file says otherwise.

```
npm run test:sim                                           # a)–k), 72 checks
node public/js/sim/test/run-headless.js --only=cruise      # just the solo-cook cruise run (a'')
node public/js/sim/test/run-headless.js --only=a --seeds=1,2,3   # extra full + cruise runs per seed (informational)
node public/js/sim/test/run-headless.js --only=a --trace=36000   # dump autopilot state once z > 36000
node scripts/test-e2e.mjs [--url ws://127.0.0.1:8201/ws]   # the whole game online through the real server
```

## What changed

| File | Change |
|---|---|
| `GameSim.js` | Phases `garage → countdown (1.5 s) → drive → won/lost`. It wires the plugins `SetPieceHost`, `GarageTutorial` and `RoofDefence`. The full helper API is implemented. Other additions: `applyDriverCommand`, fx, HP regen, time of day, area, set-piece colliders, and generic falls/respawn. Resets (`_clearSpot`) never place the RV within ~4 m of a rail line, and check set-piece blocks across the RV's whole width. A reset repeated at the same spot hops 16, 32, 48 … m further ahead. |
| `structures.js` (new) | `structureLayout(track, route)` is pure and shared by the sim and the autopilot. It covers garage walls and door, toll-plaza islands, car-wash tunnel walls, the cattle-grid rattle and bridge rails. It also exports `railLines` (main line + freight siding) and extends the rail-crossing zone past the siding. The car-wash fallback star drop lives here too, and runs only when the `car_wash` set-piece is missing or crashed. |
| `road.js` | `lanesPerDir()` counts only the lanes that physically fit, so biome blends widen gradually. Adds `median(z)` and the set-piece `overlay` for `surfaceY` (`undefined` means no opinion, `null` means a gap). |
| `vehicle.js` | Lateral limits are per side: the freeway median wall at u≈0, the garage side, and structure rails. Hazard effects added: slip, foam speed cap, shock. Drawbridge gaps work like canyon jumps; a fall below −5 m respawns. Drag patches can no longer trap a slow RV. |
| `traffic.js` | Kinds come from `biome.traffic`; the sizes of the 7 new kinds are in `rules.traffic`. Wide loads hug the kerb. Streetcars stay on their rails (lane rank 0 in Old Town, `biome.streetcarPer100m`). Traffic changes lanes on multi-lane roads, merges into toll booths at 8 m/s, and honours `laneBlocked()` and raised road ahead. Wrecks are pushed onto the verge. Long and slow vehicles never overtake. Adds `spawnAt` and `applyEffect`. |
| `cops.js` | No parked patrols and no spawns in structure zones, including the rail crossing and yard siding (1775–1835). Adds `moto_cop` (from 2★; a ram knocks the rider over), `interceptor` (freeway, ≥3★) and the Rhino (5★). The Rhino overtakes, holds `aheadDist` and lobs flash/foam `flashbang` canisters; a `rhinoLob` event fires 0.6 s before each throw. New cop states 6/7/8, `applyEffect`, `setRedirect` (the Comet), median-aware spawning, and roadblocks that keep a forward lane open. Soaked cops back off from the RV. |
| `obstacles.js` | All 13 new hazards, with placement and effects (see below). Fixed two bugs: a rolling tumbleweed was treated as "knocked flying", and wandering cows didn't collide. |
| `stops.js` | The two-player stop flow (see below). |
| `heat.js` | Redirected and disabled cops neither see nor bust. |
| `gadgets.js`, `peds.js`, `bridge.js`, `config.js` | `zones()` and `use()` for plugins. No peds at the garage exit. `resetBehind` on a canyon respawn. New code defaults. |
| `autopilot.js` | Rewritten for 40 km (see below). Rail crossings follow the stop / commit / keep-clear rules below. Stationary blockers and squeeze lines are described below. Entities above 2.5 m are ignored. Structure walls never earn the set-piece wait. |
| `test/run-headless.js` | Rewritten: sections a)–k). a'') covers cruise mode (main.js's labPilot). k2–k4 cover the car-wash fallback, the rail zone and reset placement. It exports `runCruise`, `runFull`, `FakeCook` and `FakeShop`, and runs `main()` only when executed directly. |
| `scripts/test-e2e.mjs` | 2 lines: the host autopilot gets `onDriverCommand` + `autoShop: 25` (skip the tutorial, play the shops), and the game-time cap goes from 15 to 55 min. |

## Helper API for plugins

This is documented in the `GameSim.js` header.

**Read-only state:** `sim.rv`, `track`, `time`, `data`, `seed`, `phase`, `rules`, `road`.

**Core helpers:**
- `newId()`
- `kindId(kind)` returns −1 if the kind is unknown.
- `emit(ev)` and `msg(text, tone)`
- `damageRv(amount, cause)`
- `pushRv(dx, dz, speedLoss)`: a one-off Δv in m/s, where `speedLoss` (0..1) is the fraction of the current velocity removed first.
- `addHeat(±amount, reason)`
- `dropStars(n, reason)` emits `heatDrop`.
- `copsList()`
- `applyCopEffect(id, {push, soak, stall, blind, damage})` sets cop state 6, 7 or 8 for that many seconds. Disabled cops don't see, bust or block loading.
- `redirectCops(fn, seconds)`
- `setFx({fog, flash, shock}, holdSeconds)`: values are max-merged and decay after the hold, so call it every step to keep an effect up.
- `spawnTrafficCar(kind, x, z, yaw, speed)`

**Optional helpers** (the plugins probe for these):
- `respawnRv(z, reason)`: forward lane at that z, 0 speed, grace, `setpieces.resetBehind`. It does not go to the canyon checkpoint.
- `takeProduct(n)`, `addPoints(n)`, `heatStars()`
- `gadgetZones()` and `useGadget(kind, {x, z, place})`
- `trafficList()` and `applyTrafficEffect(id, {push, crash, launch, remove})`
- `surfaceAt(z)` and `laneBlocked(z, u)`
- `sim.stop` returns `{id, name, state, shopType}` or `null`.

**Set-piece colliders:**
- Circles: `{x, z, r, solid, damage, kind, onHit, vx, vz, id}`.
- Only `solid === true` blocks vehicles. The RV is resolved out of the circle, using the collider's velocity.
- Solid colliders get `onHit(sim, {by, id, speed})` on every frame of contact. Triggers get it once per contact, with a 0.8 s cooldown.
- `damage` is applied once per 0.8 s. The SETPIECES plugins pass `damage: 0` and handle damage in `onHit`.

**Plugin safety:**
- Plugin modules are loaded with a dynamic `import()`. A missing or throwing module falls back to a stub.
- A plugin that throws 30 times is swapped for its stub (garage → done, roof → idle, set-pieces → none).
- `setpieces.update` runs in 'drive' and in 'won' (the handover cutscene).

## DriverInput and DCMD

**DriverInput:** `moveX`, `moveZ`, `interact` (edge-triggered) and `interactHeld` (level, for the crank) are passed as-is to `garage.update(dt, input)` during 'garage'. The RV is held at `garage.rvPark` the whole time.

**`sim.applyDriverCommand(cmd)`:**
- `skipTutorial`: calls `garage.skip()`, then goes to countdown.
- `shopDone {stopId, score}`
- `shopAbort {stopId}`

## Stop flow

`parked` → (0.6 s) `shopping` → `returning` (2 s) → `loading` (`loadTime`) → `done`

**parked:** begins when the RV is inside the lot below 2.5 m/s. Emits `stopParked`. Driving off cancels.

**shopping:** driving input is ignored and the RV is held.
- It ends on `shopDone` or `shopAbort`, or times out after `shopMaxSeconds`, which counts as an abort.
- Emits `shopResult {id, score, ok}`.

**returning:** the RV is still held.

**loading:**
- Pauses while a state-1 cop is within `copBlockRadius`.
- Leaving the lot abandons the stop: it is closed and left unlooted.
- After an abort there is no loading: the flow goes straight to done, unlooted.

**done:**
- `gives` is added, with +1 of the first item when `score ≥ bonusScore`, and `stopDone` is emitted.
- The `alarm` adds heat (Last Chance Gas).

The bust rule still applies while parked.

`nearStop` is reported within `rules.stops.bannerDist` (800 m) and skips looted or closed stops.

## Snapshot fields added

**Top-level fields:**
- `phase`
- `garage`: `garage.state()` during garage/countdown.
- `stop`: `{id, name, shopType, state, shopT, shopMax, loadT, loadTime, progress, blocked, copDist, score, ok, bonus, side, roof}`
- `roof`: `roof.state()`, also at the top level.
- `nearStop`: `{id, name, dist, side, z, shopType}`
- `timeOfDay`: interpolated from `route.timeOfDay` by `rv.z`.
- `area`: `{id, name}`
- `fx`: `{fog, flash, shock}`
- `setpieces`
- `closed`: stops left unlooted.
- `redirect`: seconds left.

**`rv` gains:** `regen`, `roofDoc` (`roof.roofDoc ?? roof.active`), `slip`, `foam`, `shock`.

**Events:**
- `stopParked`, `shopResult`, `regen {on}`, `heatDrop`
- `canister {kind, x, z, hitRv}`
- `rhinoLob {id}`
- `jump {at: 'canyon'|'gap'}`
- `fell {at}`
- `copWreck {kind}`

**Entities:**
- Cops: state 6 soaked, 7 stalled, 8 paint-blind.
- `flashbang`: state 0 flying (y>0), 1 armed, 2 burst; variant 0 flash, 1 foam.
- Hazard states: smashables 0/1/2. Cow, sheep and log use 0 idle, 1 moving. `dust_devil` is 1.

## Layout the renderer must match

You can import `structureLayout` from `sim/structures.js`.

- **Garage:** frame G is the `rooks_garage` model at `x = track.xAt(45, 18)`, z 45, rotation.y = +π/2. The door is at G x −0.3…4.7 on the z = 5 wall. The RV park is G (2.2, −2.2), which matches ONFOOT's `EXT_OFFSET`. The door collider is closed until `items.door ≥ 0.9`, or until 2.5 s into the drive phase.
- **Freeway median:** a solid wall at |u| ≤ 0.3, from `biome.from + 50` to `biome.to − 50`. Optional overrides are `biome.road.medianHalf` and `medianInset`.
- **Toll plaza** (model at the road centre): islands at u = 0, ±5, ±10, 10 m long, collider r 0.75. Booth lanes are at ±2.5 and ±7.5. Guard walls run from the outer islands out past the verge.
- **Car wash:** tunnel axis at `axisU = side·hw/2`, walls at axisU ± 3.2 over z ± 9, entered from −z. To match, place the model with rotation.y = +π/2 at `x = track.xAt(z, axisU) + 2.5`; its local tunnel sits at z −2.5.
- **Covered bridge:** rails at |u| ≤ 3.6.
- **Drawbridge:** deck rails at hw + 0.8 over `from − 30 … to + 30`. The surface comes from the set-piece.
- **Streetcars:** run at lane rank 0 centres (u = ±laneWidth/2) in Old Town. Lay the tram tracks there.
- **Rail lines** (`layout.railLines`): `{z: 1800, kind: 'main'}` (the train) and `{z: def.z + 24 = 1824, kind: 'siding'}` (freight wagons). The `rail_crossing` zone runs from 1775 to 1835: no props, no patrols, no cop spawns.

## Hazards

| Hazard | Effect |
|---|---|
| `steam_leak` | slip (grip × 0.55) + fog for 2.2 s |
| `water_main` | slip, speed-scaled drag, fog |
| `trench_plates`, `manhole_open` | bump (+ small damage) |
| `sinkhole` | solid, at the lane edge (u = ±(hw + 0.6)) |
| `broken_car` | solid capsule along the road at ±(hw − 0.3) |
| `speed_bump` | across the lanes in 7 m pieces; bump scales with speed |
| `trolley` | rolls across, smashable |
| `power_line_down` | 1 s of lost steering + 6 hp + fx.shock |
| `log` | rolls across the road when the RV is near; solid |
| `dust_devil` | wanders; a 6 m/s sideways gust plus grip loss |
| `flood_wash` | across the road; drag + fog |
| `sheep` | small wandering flocks; solid |
| `foam_patch` | RV capped at `rhino.foam.slowTo` for `foam` s |

Placement is per chunk and deterministic. Hazards never appear in stop lots, structure zones or set-piece zones. Solid blockers keep 7 m from chunk edges and never sit on both sides within 14 m, so a lane is always open. Test j14 checks this over the whole 40 km.

## Autopilot

`new Autopilot(data, {seed, sim?, onDriverCommand?, tutorial: 'skip'|'play', autoShop?, stops, maxSpeed, useNitro, …})`. `ap.skipped` is still a `Set`.

**Garage:**
- With a DCMD sink it sends `skipTutorial`.
- Otherwise it plays Rook from `snapshot.garage` (`target`, `near`, `task`, ONFOOT's `planPath`) and holds E for the crank.
- It then drives straight out of the door and turns onto the road.

**Driving:**
- **Lanes:** multi-lane aware, never crosses the median, and takes surface speed caps into account.
- **Oncoming lane:** used only with 150 m clear. Lane choices are committed for 1.2 s.
- **Detour candidates:** the centre line, lane boundaries, set-piece `free` bands (the parade alley) and toll booth lanes.
- **Blockers:** orientation-aware, with lateral motion swept over the time to arrival.
  - They include `setpieces[].blocks` (stationary), structure walls, falling rocks (where they will land), the tornado and armed canisters.
  - Entities more than 2.5 m up (tornado-lifted cars, flying cones) are ignored.
  - Lateral safety margin: 0.35 m to moving things, 0.2 m to stationary ones (parked, dropped or wrecked cars, blocks, walls).
  - "Squeeze lines" just beside the nearest stationary obstacles get the RV past a car that half-blocks the only lane.
- **Rail lines** (`layout.railLines`). Danger means a train warning or passing, or the yard wagons rolling (`setpieces[].gatesDown` + `railZ`).
  - Stop 12 m short. If that's too late, brake hard to stop ≥ 4 m clear of the band (keep = RV half-length + 4 m).
  - If even that's impossible, it commits and crosses only while the train is just warning (or the nose is already over the rails). For a passing train or the wagons it brakes fully.
  - Rails closer than 30 m form one crossing: wagons on the siding stop the RV before the main line.
  - Keep clear: it never drives into a band when the predicted stop is short of the band's far end. The predicted stop comes from its own stop line or the queue forming at a closed crossing.
  - While committed over the main line, it crosses at ≤ 14 m/s and yields to the siding's stop line once clear.
  - While the siding's wagons haven't run yet (`freight` set-piece phase `idle`), it approaches the main line at ≤ 14 m/s. The set-piece may hold the wagons for the train and release them the moment the RV is over.
  - No oncoming-lane queue-jumping within 120 m of a rail line. No forward bust-getaway in front of a train, and no reversing onto a rail line behind it.
- **Gates without a rail line:** any other set-piece with `gatesDown` gets a stop line 12 m before its z.
- **Pedestrians:** on the carriageway they are blockers; on the sidewalk they normally just get the horn. On a set-piece detour or the sidewalk (the parade's market alley), it caps speed at 10 m/s. If anyone is within 4 m sideways and 24 m ahead, it crawls at 2.5 m/s, below `peds.knockMinSpeed` (3), so contact is a nudge with no knock and no heat.
- **Unwanted stops:** if a crash leaves the RV crawling in a lot it skipped (or in cruise mode), it drives on while the stop is only `parked`, which cancels it. If the stop has reached `shopping` and a DCMD sink exists, it sends `shopAbort`.
- **Stops:** parks at stops and holds still through the whole stop. With `autoShop` it sends `shopDone`. It skips a stop when chased, or when the lot can't be reached.

**Recovery:** a progress watchdog resets after 20 s without progress, or 30 s at a set-piece block (`HARD_WAIT`). The block-wait timer decays slowly rather than restarting after a back-off, and structure walls never count as a block worth waiting for. A wrong-way reset triggers after 4 s. Reset spots avoid vehicles 14 m ahead, set-piece solids and blocks (across the RV's width), toll booths, the car wash and rail lines.

**For main.js (integrator):** the demo autopilot should get `{ seed, sim, onDriverCommand: (c) => sim.applyDriverCommand(c), autoShop: 25 }`. Without a sink it plays the tutorial itself and then waits at each stop until the 90 s shop timeout.

**Cruise mode (`labPilot`):** the setup `{ seed, maxSpeed: 19, useNitro: false }` with all stops in `skipped` is unchanged, and needs no `sim` handle. Test a'') runs exactly this setup with a fake cook and checks that it reaches 38 km without being wrecked, busted or stuck, is never hit by the train, and never stands within 4 m of a rail line.

## Tuning knobs and data changes (keys added or values tuned; nothing renamed or removed)

**rules.json:**
- Added traffic sizes: `traffic.{garbage_truck, news_van, forklift, car_carrier, logging_truck, combine, streetcar}`.
- `sim.garageCountdownSeconds` is 1.5.
- `sim.patrol`:
  - `biomes` now uses the new ids.
  - `speedLimit` gains keys for the new ids.
  - `chance` 0.5 → 0.35.
  - `ticketCooldown` is 30 s.
- `sim.rival.spawnAt` is `[]` (the Rattlers set-piece replaces the rival). `sim.rival.biomes` is added.
- Added `heat.moto.share` (0.35) and `heat.rhino.{spawnDelay, respawnEvery}`.
- Added `heat.rhino.foam.patchSeconds`, `heat.carWashCopRange` and `stops.parkSeconds`.
- `scoring.parTimeSeconds` 420 → 2700.

**route.json:** Old Town gains `streetcarPer100m` (0.12), and its `trafficPer100m` drops 1.4 → 1.1.

**Code defaults (`config.js` and inline):**
- RV: `rv.sandBiomes`, `rv.foamDecel`, `rv.waterFallDamage`.
- Cops: `cops.moto*`, `cops.rhino*`, `cops.interceptor*`, `cops.soakBackOff` (14 m).
- Traffic: `traffic.wreckClearSeconds` (9).

## Test output (seed 1337)

```
npm run test:sim → 72/72 checks passed, ALL PASS
a) full 40 km run: WON (delivered) in 40m21s (drive 40m19s). 8/8 stops looted (all with the +1 bonus),
   17/17 set-pieces, canyon jump at 38900 (lip speed 40 m/s with nitro, 0 falls), cops gave up at the lip.
   Max 2★, 10 cops seen (1 moto), regen on ×54 (+159 hp), RV hp 94.7 at the end (min 80).
   $12320, 3816 points.
   per area: ironworks 3m05 · downtown 4m43 · oldtown 4m26 · docks 3m06 · suburbs 6m10 ·
   interstate 4m27 · stripmall 2m58 · farmland 3m46 · foothills 3m33 · saltflats 1m30 ·
   ghosttown 1m20 · canyon 0m52 · hideout 0m25
a'') cruise mode (labPilot, maxSpeed 19, no stops, fake cook): 0 → 38 km in 39m04s, hp min 79, ≤1★,
    max stall 25 s (the drawbridge), train hits 0, standstills within 4 m of a rail 0
a') forced 5★: Rhino after 5.5 s, max lead 90.8 m, 10 canisters (4 flash, 6 foam), states 0/1/2,
    fx.flash 1.0, foam patch; ramming it costs the RV 32.3 hp and the Rhino 17 (160→143).
e) netSnapshot avg 2.18 KB, p95 2.67 KB, max 3.22 KB      f) ~13 000–16 000 steps/s with autopilot
h) ONFOOT tutorial played by script: done in 20.4 s, drive at 21.9 s
k2) car wash: plugin + slow → 1 drop · plugin + too fast (refused) → 0 · no plugin + fast → 1 (fallback)
k3) rail lines main@1800, siding@1824 · zone 1775…1835 · props 0 · patrols 0 · cop spawns blocked
k4) resets from the rails land 10–21 m clear · repeated resets hop 0, 16, 32, 48 m

--only=a --seeds=1..8 (informational):
  full:   8/8 WIN, 39m08s–41m44s, every run 8/8 stops and 17/17 set-pieces
  cruise: 8/8 reach 38 km, ≤1★, max stall 15–29 s, train hits 0, rail standstills 0
rail stress (scratch script: seeds 1–8 × maxSpeed 19/22 × the 24 arrival phases of the train cycle,
  0 → 1900 m): 384 runs, train hits 0, wagon damage 0; 8 runs had a brief standstill inside the 4 m
  band (mostly at its edge, ≥ 3 m from the rail line, after traffic interactions); 1 bust at the crossing.
e2e (real server on :8201, ×6, random seed): won in 40m09s game time, 36 140 snapshots avg 2.17 KB
  (max 3.31 KB), 14 bags, ALL PASS
```

## Known limits

- The autopilot is a test/demo bot.
- **Freight wagons:** `freight_wagons` holds its wagons while the train is due, then releases them as soon as the RV is 2 m past the main line, only ~22 m from the siding. The autopilot copes: it approaches at ≤ 14 m/s while the set-piece is `idle`, and crosses committed at ≤ 14 m/s. A human driver at full speed will still meet the wagons. A rule like "release only when the RV can stop: d > v²/16 + 15" in the set-piece would remove the squeeze (SETPIECES' call).
- **Rail edge cases:** in about 2% of the stress runs the bot still pauses briefly inside the 4 m band, mostly at its edge after tangling with traffic around the crossing. It has not been hit by the train in any run.
- **Permanent drops:** dropped cars (car carrier, tornado) are permanent `blocks`. When one plus stopped traffic boxes the RV in, the autopilot waits 30 s for the block, then resets past it (≤ ~45 s stall).
- Wrecked civilian cars are pushed to the verge after 9 s rather than towed away.
- `sim.road.lanesPerDir()` (physical fit) can differ from SETPIECES' `Geo.lanesPerDir()` (biome lanes) inside a 120 m biome blend.
