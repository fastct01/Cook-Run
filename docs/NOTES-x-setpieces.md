# Agent SETPIECES: the 17 scripted set-pieces (simulation side)

Owner: `public/js/sim/setpieces/**`. That covers one plugin file per type, the `index.js` registry, `common.js` and `test/run.js`.
`host.js` and `base.js` are unchanged.

```
node public/js/sim/setpieces/test/run.js              # (a) mock sim, every set-piece, 4–5 drivers + (b) real GameSim + Autopilot
node public/js/sim/setpieces/test/run.js --only=tornado,parade --verbose
node public/js/sim/setpieces/test/run.js --no-real    # mock only (fast)
node public/js/sim/setpieces/test/run.js --full       # + a whole game from the start (Autopilot, shops auto-completed)
```

## How it fits together

- **`common.js`** provides three things:
  - `Scripted`, the base every plugin extends. It holds the bodies list, `setPhase()` (which emits `EV.SETPIECE` and the HUD caption), road `blocks`, colliders and `impact()`.
  - `Geo`, the road geometry over `sim.track`. It uses 1 m samples, interpolated exactly like `sim/road.js`.
  - `H`, wrappers around the GameSim helper API. They use `?.` with fallbacks for the optional helpers.
- **Road frame:**
  - `s` = z along the route.
  - `u` = lateral offset, with u > 0 = driver's right.
  - `x = centerX(s) − u` (the track.js convention).
  - Yaw follows the protocol: forward = (sin yaw, cos yaw).
  - A body moving toward +u has yaw = heading − π/2. Toward −u it is heading + π/2.
- **Determinism:** everything is driven by `this.rng` (seeded per set-piece id by base.js). There is no `Math.random`. The tests check it: the same seed gives identical entity streams, and different seeds give different layouts.
- **Events:**
  - Every phase change emits `{ type: 'setpiece', id, kind: <type>, phase, caption? }`.
  - One-off moments use `beat()`. Examples are `splash`, `smashed`, `grab`, `crash`, `core`, `tooFast`, `copWatching`, `approach`, `cameo` and `crashed`. They emit the same event with `beat: true` and do not change `phase`.
  - When there is a caption it is also sent as `sim.msg(caption, tone)`.
  - **HUD (VIEW-FP):** show `ev.caption` as the big set-piece caption. A `msg` event with the same text arrives in the same snapshot, so drop that duplicate toast.
- **`state()`:** every entry is `{ id, type, phase, t, …type fields }`. When something is blocked it also carries `blocks: [[z0, z1, u0, u1], …]`: road boxes blocked right now (the same data as `host.laneBlocked`).
- **Travelling set-pieces** call `extendRange(to)`, which replaces `this.def` with a frozen copy that has a later `to`. The host would otherwise retire them 450 m after `def.z` while they are still in front of the RV. The ones that do this are rattlers, wide_load, car_carrier and combine.

## What I rely on from GameSim (SIM-CORE implemented all of it; verified against the real sim)

| Helper | How the set-pieces use it |
|---|---|
| colliders `{x,z,r,solid,damage,kind,id,vx,vz,onHit}` | Every solid body is a row of circles (`boxCircles`) with `solid: true` and **the body's velocity** (vx, vz), so GameSim resolves moving bodies properly. **`damage` is 0 on purpose.** GameSim's solid damage has a 40 % floor that re-applies every 0.8 s while a moving body leans on the RV: a wagon dragging a stopped RV took 80+ hp. So `onHit(sim, {by, id, speed})` → `impact()` applies `base · clamp((speed − 2)/10, 0, 1.3)`, plus shove, speed loss and callbacks, when `by === 'rv'`. When `by === 'cop'` it calls `onOther` (car-carrier wrecks damage the cop). Soft things are detected inside the plugins and have no colliders: band members, gorilla, choppers, toll officers, the funnel. |
| `pushRv(dvx, dvz, speedLoss)` | A velocity kick in m/s. The tornado calls it every tick with a·dt, capped so suction never adds more than 6–12 m/s inward. |
| `trafficList()` / `applyTrafficEffect(id, {remove})` | The tornado takes over traffic cars that stray within 23 m of the funnel and throws them as its own entities. |
| `surfaceAt` / `road.overlay` | The drawbridge returns `null` for the gap. GameSim keeps null distinct from undefined. ✓ |
| `onFellGeneric` / `respawnRv` | GameSim handles the drawbridge splash itself (y < −5). The plugin only notices the respawn. |
| `redirectCops(fn, s)` | Midnight Comet. `fn` is a pure function of `sim.time`, so it keeps working after the set-piece retires. |
| `takeProduct`, `addPoints`, `heatStars`, `gadgetZones`, `setFx(fx, hold)`, `dropStars`, `applyCopEffect`, `copsList` | Rattlers, toll, choppers, car wash, tornado, etc. |
| read-only extras | `sim.structures.layout.carWashes` (car wash geometry; there is a fallback formula), `sim.events.trainInfo()` (freight wagons; there is a fallback formula), `sim.rv.horn`, `sim.addBump?.()`. |

## Requests / notes for the other agents

**SIM-CORE**
1. **Autopilot (important):** it only reads snapshot entities, and it doesn't know the set-piece kinds. It drives into the combine, wide load, floats and wagons, and brakes for cars orbiting the tornado at y = 30 m. Please:
   - (a) treat `snap.setpieces[i].blocks` boxes as stationary blockers, which is cheap and covers everything;
   - (b) ignore entities with `y > 2.5` (airborne);
   - (c) optionally add `freight_wagon` / `stagecoach` / `log` to `BLOCK` with their half-length along the motion: wagons 6, stagecoach 3.7, logs 3 along z. They move laterally.
   - Today it still gets past every set-piece in the real-sim test (b), but it takes avoidable damage. Examples: the combine about 28 hp, the parade knocks band members.
2. **Car-wash fallback** (structures.js `update`): it fires 0.4 s after the RV leaves the tunnel unless `carWashDropped` is set. The set-piece deliberately refuses the drop when the RV is **faster than 15 m/s** or a cop is within 40 m. Your fallback then drops the star anyway. Please skip the fallback when a `car_wash` set-piece is registered (`SETPIECE_TYPES.car_wash`). As an alternative, check `sim.setpieces.host?.carWashUsed` or the set-piece state `used`.
3. Drawbridge splash: the set-piece lowers the bridge 4 s after your respawn, so the player isn't stuck behind it. The respawn point (`from − 100`) is inside the operator-pity range (130 m).
4. Parade detour (side +1 sidewalk): this needs no off-road permission, because `sideRoom` 12 already allows it.
5. Status of `npm run test:sim` with all 17 set-pieces: **67/67**.
   - The full run wins in 38–40 min and sees 17/17 set-pieces.
   - The extra seeds 1, 2, 4 and 5 win with 17/17.
   - **Seed 3 loses at the level crossing at t≈108 s, and it does the same with every set-piece disabled.** When the train warn starts with the RV 19 m out at 22 m/s, the Autopilot's `sqrt(2·5·(dist − 12))` brakes it to a stop *on the rails*, and the train hits it twice. Fix: commit and cross when it can't stop before the line.
   - **The z≈18923 stall** isn't reproducible now, and no set-piece is active there: the wide load retires by z 16770 and the carrier activates at 21050.
6. Freight wagons now use a yard **siding at z = def.z + 24 = 1824**. Chunk props or patrols there would sit on the siding rails, so please extend the crossing exclusion zone to about 1835.

**VIEW-WORLD-A** (static structures driven by set-piece state)
- **drawbridge:**
  - `leaf_l.rotation.x = −state.angle`, `leaf_r.rotation.x = +state.angle`.
  - Ring the bell and light the lamps while `state.bell`.
  - Lower the barrier arms while `state.barriers`.
  - The leaves pivot at `state.pivots` = [zc − 24, zc + 24], which matches the model's trunnions.
- **toll_plaza:**
  - `state.gates[i]`: 0 up (arm_i.rotation.z = −1.45), 1 down (0), 2 smashed (hide or droop the arm and spawn a spinning arm piece).
  - Lane i is at u = −7.5 + 5i (u = model-local x, with the model rotated π).
- **car_wash:** spin `brush_*` while `state.washing`. The tunnel axis is `state.u`, with `state.halfWidth` and `state.z0`/`z1`.
- **rail_crossing:** add a yard **siding**, two rails across the road plus a short yard track, at `state.railZ` (= 1824, 24 m past the main line). The freight wagons roll on it. While `state.gatesDown` (rolling) you can flash the crossing lights and ring the bell.
- **wide_load:** the back-garden detour is on side −1 (biome `yards`). Its colliders are generic: only the convoy is solid.

**VIEW-WORLD-B:** per-entity animation contracts are in the table below. The kinds without models in `assets/` are:
- `freight_wagon`: 12 m × 3 m. Variant 0 boxcar, 1 tanker, 2 hopper. It rolls on the siding (z = railZ), along world X.
- `tornado`: one tuple. Size and spin come from `state()`. See "The tornado in detail" below.

**VIEW-FP / audio:**
- HUD captions come from `EV.setpiece.caption`.
- The `tornado` state has `pull` (0..1, suction felt at the RV) and `rvDist`, which can drive camera shake and the roar volume. The sim already sets windscreen dust (`fx.fog` ≈ 0.9·pull) and bumps.
- Drawbridge `bell`. Parade band. Stagecoach hooves. Choppers.

## The set-pieces

Kinds below are `KIND` names. "ped states" means 0 walk/idle, 1 run, 2 knocked (airborne), 3 down, 4 getting up. In every case **the entity yaw is its facing / direction of travel**.

| # | type (id, zone) | What happens | Entities (kind · variant · state) | state() fields | Colliders / blocks | Captions |
|---|---|---|---|---|---|---|
| 1 | **freight_wagons** (`freight`, z 1800, Ironworks crossing) | 3–4 runaway wagons roll across the road at 14 m/s on a yard **siding 24 m past the main line** (z = 1824, along world X like the train), starting 14 m beyond the shoulder (behind the yard sheds). They trigger when the RV is ~75 m (or 3 s) from the siding. **Train-aware:** if the train is warning or passing, or will start warning before the RV reaches the main line, they are held until the RV pulls away after the train. That way they are always a real obstacle, and an RV waiting for them waits *beyond* the train's rails. Cops in the way get 30 damage. | `freight_wagon` · 0 boxcar / 1 tanker / 2 hopper · 0 rolling | `railZ` (siding z), `wagons, dir` (+1 rolls toward +u), `speed, gatesDown` | solid 12×3 per wagon (impact dmg 14, shove 50 % of wagon velocity) · blocks the siding band where a wagon overlaps the road | `rolling` "RUNAWAY FREIGHT WAGONS!" |
| 2 | **midnight_comet** (`comet`, z 5600, downtown) | When the RV is within 100 m of z 5600, the Comet appears 80 m **behind** the RV, up to 17 m/s faster. His six cop cars are strung out behind him in his lane (11 m + 8.6 m apart, sirens on). His lane is the nearest other forward lane: a left-lane RV gets him on the right. Next choice is the right shoulder, and the oncoming lane only if there is nothing else. He eases onto a spot beside the cab and drives **parallel** for `def.alongSeconds` (5 s), matching the RV's speed and following it sideways. He keeps ≥ 1.5 m of gap. If the RV pins him against the edge he drops back and comes round the other side. Anything coming from behind waits short of the RV's tail until it is clear. About 1 s in he cracks the canopy and salutes. Then he boosts to 68 m/s; the cops follow at 42–45 m/s and `redirectCops(target, def.pullSeconds = 60)` runs. The target is a carrot 35 m ahead of each cop, in his lane and on his side of the RV, never past a virtual Comet doing 50 m/s. Your cops overtake and leave, and heat decays (SIM-CORE). Everything despawns ≥ 360 m ahead, beyond the 300 m fog. A stopped or reversing RV still gets the pull-alongside (he never reverses). | `comet_car` · 0 · 1 boosting in, 0 cruising, 2 salute (canopy cracked, visor glint), 3 afterburner (big flame, trail, "ZOOOM!"); `cop` ×6 · 0 · 1 (lights + siren) | `dir` (= `side`, +1 he is on the RV's right), `cometU, cometS, x, z` (null once gone), `redirected, pull` (s of redirect left), `cops: 6`, `ids` (live entity ids; the autopilot treats them as a taken lane, not as its tail) | **triggers only**: they ghost through traffic and cops. When the RV touches one it gets a sideways shove, plus ≤ 3 hp (≤ 8 hp in all) only if the RV slid into him. No lane blocks. | EV `alongside` "THE MIDNIGHT COMET!" + sub (good). The approach and boost phases change silently, with toasts: "Sirens coming up behind you…" and "ZOOOM! Your tail peels off after the Comet!" |
| 3 | **parade** (`parade`, 9900–10300, side 1) | A 37 m procession marches **toward the RV (−z) at 2 m/s** from z ≈ 10150. Formation: band row (4), band row (3), float A, band row (3), float B. It fills both lanes and the far (left) kerb. The free detour is the right sidewalk/alley: u ∈ [hw + 0.3, hw + sh + sideRoom − 1]. Band members scatter sideways from an RV coming at them (horn: from 28 m; otherwise from 9 m when faster than 6 m/s, or within 5.5 m), step around it when it's inside the procession, then fall back in. Hitting one is a slapstick knock plus `pedHit` heat and an `EV.pedHit`. If the RV sits in front of a float, the parade **halts**. After 10 s the marshal waves the floats into the left lane ("make way") so the right lane opens. At the first cross street ≥ def.from (z 9920) every unit turns off left and leaves. | `parade_float` · 0 prospector / 1 saguaro · 0 moving, 1 halted, 2 turning off (flap `flag_*`); `band_member` · 0 tuba / 1 bass drum / 2 trumpet · ped states (0 marching: legs only, bob the instrument) | `head, tail` (z), `detourSide, free:[u0,u1], halted, makeway` | floats solid 12.6×3 (dmg 5); band soft · blocks: floats, standing members, and the procession band except the free detour | `marching` "FOUNDERS' DAY PARADE — take the sidewalk!"; "The marshal waves you through!"; "Bandsman down! Oompah!" |
| 4 | **drawbridge** (`drawbridge`, 13180–13230) | See the drawbridge.js header for the leaf formula. Phases: bell 3 s → rising (14 s) to 0.55 rad → up 30 s → lowering → down. It starts at RV ≤ 250 m. At full angle the tips are 12.4 m up with an 8.1 m gap; ≥ ~8 m/s at the tip clears it. The operator lowers early once the RV has dawdled 8 s in front of it (pivotA − 130 m … pivotA, below 5 m/s: stopped, creeping or backing up). After a splash it comes down 4 s later. | none | `angle, gap, tipY, pivots, bell, barriers, mode` ('gap' \| 'safe'), `splashes` | `surfaceY(z)` = leaf deck / null gap · blocks the whole span (z from pivotA − 22) while not down | `bell` "DRAWBRIDGE RISING — jump it or wait!"; `lowering` "The bridge is coming down." / "The operator lowers the bridge for you."; beat `splash` |
| 5 | **wide_load** (`wideload`, z 15600, speed 6, length 700) | A house hauler on the road centre (collider 5 m wide) with escorts: one behind it in the forward lane and one ahead in the oncoming lane. It starts 100 m before def.z when activated (out of sight) and crawls at 6 m/s for 700 m. Then, **or after the RV has crawled within 30 m behind it for 20 s**, the convoy pulls onto the right verge and parks. Detours: the right shoulder/verge squeeze (3+ m) or the back gardens (side −1, biome `yards`). | `wide_load` · 0 house hauler / 1 escort pickup · 0 driving, 2 pulling over (indicator), 1 parked; amber beacons always on | `z, u` (house), `travelled, length, impatient` | solid (house 16.8×5 dmg 10, escorts 5.4×2 dmg 7) · blocks both lanes along the convoy | beat `approach` "WIDE LOAD! Crawl behind it or cut through the gardens."; `pullover` "The wide load pulls over to let you by." (when impatient) |
| 6 | **car_carrier** (`carrier`, z 21500) | It spawns 400 m ahead (in the fog) in the forward lane nearest the RV at 14 m/s. At RV ≤ 85 m behind (or carrier z > def.z + 250) the ramp drops (1.2 s), then one car rolls off every 1.5 s. Lower deck first (`cargo_3,4,5`), then the upper deck tumbles off (`cargo_0,1,2`). Cars roll back off the ramp at 6–11 m/s relative, bounce, spin and slide (7 m/s²) to a stop as solid wrecks. A car landing on the RV does 8 damage. Cops that hit a wreck take 12 + 1.5·v damage. Empty, the carrier pulls onto the shoulder and parks. It sheds everything by def.z + 450. | `car_carrier` · 0 blue / 1 red cab · 0 driving (ramp stowed), 1 ramp down + dropping, 2 empty/parked; `sedan`/`hatch` · 0–5 · 2 tumbling/sliding (roll it while y > 0), 1 wreck at rest. **Hide `cargo_i` when bit i of `state().cargo` is 0** and spawn the dropped car entity there. | `ramp` 0..1 (`ramp.rotation.x = −2.12·ramp`), `cargo` bitmask, `dropped, lane` | solid carrier 17×2.6 (dmg 9); wrecks 4.4×1.9 (dmg 7) when y < 1.2 | `dropping` "CAR CARRIER — INCOMING!" |
| 7 | **toll_plaza** (`toll`, z 24500) | The stars are checked once, 320 m out. **< 2★:** open-road tolling: the arm of whichever lane the RV heads for lifts within 60 m. **≥ 2★:** checkpoint. All 4 arms are down, 2 cop cars are parked angled across the outer lane exits (12–16 m past the arms), and 4 officers stand on the islands. Driving through a down arm smashes it: +0.5 heat (checkpoint; 0.15 otherwise), +250 points, slight slow, `EV.smash {kind:'toll_gate'}`. Officers dive aside from an RV faster than 6 m/s within 30 m. Arm z = def.z + 1.6, matching the model. | `cop` · 0 · 1 (parked, lights on, not moving); `cop_officer` · 0–2 · 0 standing (hand up), 1 diving, 3 down, 4 getting up | `gates:[4]` (0 up, 1 down, 2 smashed), `lanes:[−7.5,−2.5,2.5,7.5], gateZ, checkpoint` | parked cops solid (dmg 6) · blocks: the 2 cop cars (gates are smashable, not blocks) | `checkpoint` "POLICE CHECKPOINT AT THE TOLL!"; beat `smashed` "Smashed through the checkpoint!" / "Toll gate smashed!" |
| 8 | **inflatable_gorilla** (`gorilla`, z 27000) | Tethered on a car lot (u = ±(edge + 7)). At RV ≤ 170 m (or ETA < 7 s) it tears loose. It bounces down the road toward the RV at 8.5–10.5 m/s (gusting, hops ≤ 2.6 m, spinning), drifting into the RV's line. Touch (my own test, RV segment vs r 2.6, gorilla base y < 3) shoves the RV ~3.5 m/s sideways, costs 25 % speed and 2 damage, and launches the gorilla up and back over the RV (vy 9.5, 14 m/s backward relative to the RV). Where it comes down on cops it blinds them for 2.5 s, pushes them and does 6 damage. It deflates after 4 RV hits, 40 s loose, or 150 m behind. | `inflatable_gorilla` · 0 purple / 1 slate · 0 tethered (wobble), 1 loose (y = base height; flail the arms, wobble harder), 2 deflated (collapse over ~1.5 s) | `hits, airborne, copHits` | none (soft) · blocks around it while low | `loose` "THE GORILLA'S LOOSE!"; "BOING!"; "The gorilla smothers a cop car!"; "The gorilla deflates with a sad wheeze." |
| 9 | **car_wash** (`carwash`, z 28200, side 1) | The tunnel is SIM-CORE's structure over the right-hand lanes: axis u = side·hw/2 = 3.5, inside \|u − axis\| ≤ 2.9, z ± 9. Driving ≥ 75 % of it **slower than 15 m/s with no cop within 40 m** (states other than wrecked/gave-up) calls `dropStars(rules.heat.carWashDrop, 'car wash')`. That happens **once per run** (`host.carWashUsed`). Windscreen suds `setFx({fog:0.55}, 0.6)` while inside. | none | `progress` 0..1, `washing, u, halfWidth, z0, z1, used` | none | `clean` "SPARKLING CLEAN — 1 star lost" (or "SPARKLING CLEAN!" at 0★); beats `tooFast` "Too fast for the wash!", `copWatching` "Not with a cop watching!" |
| 10 | **cattle_drive** (`cattle`, z 30000) | 15–20 cows and 2 cowboys wait on one side, then cross at ~1.5 m/s (each 1.3–1.8) at RV ≤ 230 m (or ETA < 10 s), and graze 9–24 m beyond the far shoulder. After 26 s stragglers are hurried (×2.2). The road is clear in ~30 s. A horn within 40 m makes cows near the RV trot (×1.8). Cows blocked by the RV step round it along z (no deadlock). | `cow` · 0/1 · 0 standing, 1 walking; `cowboy_horse` · 0 bay / 1 chestnut · 1 riding (0 standing at the end) | `dir, cows, onRoad` | solid circles r 1.3 / 1.4 (dmg = rules.obstacles.cow.damage 10) · blocks every animal on or near the road | `crossing` "CATTLE DRIVE! Mind the herd."; "Mooo!" / "Yee-haw! Watch it!" |
| 11 | **combine** (`combine`, z 31200) | It drives the road centre at 4 m/s from def.z − 60 for 400 m (header 5.6 m; collider 9.4 × 5.8). Then, **or after the RV has crawled behind it for 15 s**, it turns into the field (14 m beyond the shoulder on a seeded side) and stops. Squeeze past on the shoulder/field edge. | `combine` · 0 green / 1 red · 0 driving (spin `reel`), 1 turning, 2 stopped (reel idle) | `z, u, travelled, impatient, fieldSide` | solid (dmg 9) · blocks the footprint (+5 m ahead while moving) | beat `approach` "COMBINE HARVESTER — squeeze past on the shoulder!"; "The farmer pulls into the field." |
| 12 | **log_spill** (`logs`, z 33000) | The logging truck is jackknifed on a hillside track (uphill side seeded, 13 m beyond the shoulder, z + 22). At RV ≤ 170 m (or ETA < 6.5 s) 6 logs roll across the road toward the downhill side in **3 waves of 2, 2.4 s apart**, at different z (def.z − 8 / + 5 / − 2, ± 2). They roll at 6.5 → 10 m/s, slow on the far verge and rest there. Cops hit by a rolling log take 35 damage. | `logging_truck` · 0 red / 1 cream · 0 jackknifed (hazards), 1 spilled (hide `chains`; hide `log_i` where `state().logs` bit i is 0); `log` · 0 · 0 rolling (`trunk.rotation.x += distance / 0.44`, local +Z = roll direction, axis along the road), 1 resting | `side` (uphill), `logs` bitmask, `wave, rolling` | rolling logs solid 6×1.2 (dmg = rules.obstacles.log.damage 14, shove 60 % of log velocity); resting logs 40 %; truck solid | `spilling` "LOG SPILL!" |
| 13 | **rattlers** (`rattlers`, z 35300) | From z 35000, 6–8 choppers come up from 65–100 m behind and ride in slots around the RV (both flanks, ahead, behind; weaving) for ≤ 50 s, or until the RV reaches 36050 (they bail when the tornado forms). **One at a time** a grabber takes the spot behind the rear door (4.2–8.5 m behind, \|lat\| < 1.7, RV faster than 3 m/s). After **3 s** there it grabs a bag (`sim.takeProduct(1)`) and rides off with it. Max 2 grabs. Knock them off by contact at > 4 m/s (sideswipe, ram, brake-check), by oil, or by smoke (`sim.gadgetZones()`): +100 points. Bikers never damage the RV. | `chopper` · 0–3 · 0 riding, 1 grabbing (rider reaches for the door), 2 crashed (bike slides then lies; rider tumbles), 3 leaving (rides off-road and despawns) | `active, grabs, grabber` (entity id), `grabT` (0..3), `crashed` | none (soft) | `riding` "THE RATTLERS! Don't let them grab the bags!"; beats `grab` "A Rattler grabbed a bag!", `crash` "Biker down!" / "…slicked!" / "…lost in the smoke!"; `leaving` "The Rattlers bail — they want no part of that twister!" / "The Rattlers peel off." |
| 14 | **tornado** (`tornado`, z 36300). **The user's request** | See **The tornado in detail** below. In short: the funnel forms on the horizon 140 m off the road and churns diagonally toward the RV. It **crosses the road ~50 m in front of the RV**. Its suction pulls the RV, 6–9 abandoned cars (plus stray traffic) are sucked up, orbit to 25–40 m and are flung at the road ahead, and chasing cops are dragged in and wrecked. | `tornado` (one tuple); `sedan`/`pickup`/`hatch`/`van` · 0–5 · 1 on the ground, 2 airborne | `x, z, radius, height, spin, intensity, side, crossed, rvDist, pull, flying, cars` | ground cars solid (impact dmg 7) · blocks wrecks on the road (not the funnel) | `forming` "TORNADO!"; beats `crossing`, `core`, `copSucked`, `carHit` |
| 15 | **stagecoach** (`stagecoach`, z 37200, inside the dust storm) | At RV ≤ 75 m (or ETA ≤ 3.4 s) a stagecoach bolts out of a side alley (beyond the building line) and gallops across the street (6 → 10 m/s), then vanishes down the opposite alley. | `stagecoach` · 0 red / 1 green · 1 galloping (horse legs + bob; hidden before/after) | `dir, u, speed` | solid 7.4×2 (dmg 10, shove 40 %) · blocks the coach plus 1 s of lead | `bolting` "RUNAWAY STAGECOACH!" |
| 16 | **pratt_jump** (`pratt`, z 38900 = the lip) | **≥ 1★ at z 38600:** Sgt. Pratt's slick-top interceptor appears 120 m behind and closes to ~14 m behind (never rams, no collider). Within 70 m of the lip, once the RV is past or airborne, she commits at **19 m/s** (≈ 25 needed), leaves the lip ballistically (ramp angle), drops below the deck and falls (hidden at −0.8·canyonDepth). If the RV itself falls and respawns, she parks before the ramp instead. **0★:** cameo. Her car is parked on the verge 90 m before the ramp, with Pratt beside it writing in her notebook. | `interceptor` · **1** (slick-top) · 1 chasing (lights), 0 parked, 5 gave up, 4 gone; `sgt_pratt` · 0 (cameo: notebook) | `car: 'interceptor', variant: 1, mode` ('chase' \| 'cameo'), `y, falling` | cameo car solid; chase car none | `chasing` "SGT. PRATT IS ON YOUR TAIL!"; `falling` "SGT. PRATT DIDN'T MAKE IT!" (good); beat `cameo` "Sgt. Pratt takes notes…" |
| 17 | **handover** (`handover`, z 39800, the drive-in) | Cosmetic, for the end cutscene. Kestrel's white car is parked at the back of the lot (sell point u + 8, z + 7), Kestrel by it and two of his men (generic `ped`). Phases: `waiting` → `arriving` (RV within 150 m: they turn to watch it) → `checking` (RV parked in the sell radius below 3.5 m/s, or `sim.phase === 'won'`): the men walk (1.4 m/s) to the RV's side door (driver's right, 1 m behind the middle) and Kestrel steps 2 m forward → `done` (3 s at the door). The targets are in `state()`, so the renderer can finish the walk if the sim stops updating set-pieces after the win (GameSim only updates them in 'drive'). | `kestrel_car` · 0 white · 0; `kestrel` · 0 · 0 idle (cane), 1 walking, 2 talking; `ped` ×2 · seeded variant · 0 (walk cycle only while moving) | `door:{x,z}`, `walkers:[{id,x,z,tx,tz}]`, `car:{x,z,yaw}`, `checkT` | car solid (dmg 4) | none (phases only) |

## The tornado in detail (`tornado.js`)

**Timeline**

| Time | What happens |
|---|---|
| RV at z 35850 (activation) | `forming` (3 s, intensity 0 → 1), caption **"TORNADO!"**. The funnel stands 140 m off one side (`state.side`) and 150 m ahead of def.z, well inside the salt-flat view (fog 520 m). The Rattlers, if still riding, bail at 36050 with "they want no part of that twister!". |
| `active` | The funnel drifts toward the RV at 5 m/s and moves across at an adaptive 3–12 m/s, timed so it **crosses the road centre when the RV is ~50 m from it**. A beat `crossing` "IT'S CROSSING THE ROAD!" fires and `state.crossed` becomes true. A human driver who keeps going passes 10–20 m behind it, through the pull and the falling cars (mock: closest 10 m, pull 0.8, 0 hp). If the RV is already too close when the funnel nears the road, the funnel hangs back (2 m/s) and lets it pass. If the RV stops, the funnel still crosses (≥ 3 m/s), then goes on across at 7 m/s. |
| `dissipating` | Starts 120 m past the road on the far side, after 75 s, or when the RV is 260 m past it. Intensity → 0 over 4 s and any orbiting cars are flung. |
| `gone` | Then `done` once the RV is 150 m past def.z. |

**Forces**

| Target | Effect |
|---|---|
| RV, within 60 m | `pushRv` toward the centre at a = 22·(1 − d/60)^1.6·intensity m/s², plus 30 % swirl (CCW from above when `spin` > 0). It is capped so suction never adds more than 6 + 6·(1 − d/60) m/s of inward speed, or 6 m/s of swirl: the RV gets dragged and slewed, never hurled. That is about the grip limit at ~16 m. Steer away or use nitro; the handbrake makes it worse. |
| RV, effects | `fx.fog` ≈ 0.9·pull (dust on the windscreen) and `addBump(0.45·pull)` (shake). |
| RV, in the core (9 m · intensity) | 7 hp/s (capped at 35 hp per tornado), speed loss, beat `core` "INSIDE THE TORNADO!". |
| Cops within 60 m | `applyCopEffect` push toward and around the centre every 0.25 s. In the core: stall + 6 dmg per 0.25 s, which wrecks them in about 2 s. Beat `copSucked` "The tornado swallows a cop car!". Real-sim runs at 2★ wreck 1–2 cops. |

**Flying cars (for VIEW-WORLD-B)**
- There are 6–9 abandoned cars. Some stand on the flats along the path; the last three are a cluster on both verges where it crosses, so it lifts cars right in front of the RV. On top of that, any traffic `sedan`/`hatch`/`pickup`/`van` that strays within 23 m is taken over: it is removed from traffic and re-created here with a new entity id. The total is capped at 12.
- **Pick-up:** within 23 m of the funnel (intensity > 0.6). The car then orbits at r 10–14 m, 2.2 rad/s (in the funnel's spin direction), rising 6 m/s to 25–40 m, with the yaw spinning.
- **Fling:** after 3.5–7.5 s, at > 15 m height, when its tangent faces the aim point 30–55 m ahead of the RV (± 6 m sideways). It is then thrown at 8–18 m/s toward that point, with vy 3. As a fallback it is flung after +6 s whatever the direction, and immediately while dissipating.
- **Landing:** it bounces once (crash event), slides at 7 m/s², and rests as a **solid wreck** (state 1). A car coming down within 3.2 m of the RV does 10 hp, with the beat `carHit` "A car fell on the RV!".
- **Entity tuples:** `[id, kind, x, y, z, yaw, variant 0–5, state]`.
  - state **2** = airborne (orbiting or flung): y is the real height. Roll and pitch it freely; a tumble of about (3 + id % 3) rad/s on two axes looks right. Add a dust trail.
  - state **1** = on the ground (parked/abandoned, or a landed wreck: smoke). It can go back to 2 if the funnel passes over it again.
- **The funnel tuple:** `[id, 'tornado', x, 0, z, spinAngle, 0, state]`. State 0 forming (rope funnel growing from the cloud base), 1 active, 2 dissipating. Scale the funnel with `state.radius` (core radius at the ground, 9 m at full strength; widen it with height) and `state.height` (60 m). Fade with `state.intensity`. Spin the debris ring by the yaw (it is accumulated: `spinRate` · intensity). `state.spin` is rad/s, sign = direction.
- **Audio / camera (VIEW-FP):** roar volume and camera shake from `state.pull` (0..1) or `state.rvDist`.

## Test output (summary)

`node public/js/sim/setpieces/test/run.js` gives **363/363 passed** on seed 1337, and also on seeds 1 and 2 with `--seed=N`.

**(a) Mock sim.** Each set-piece is run with 2–5 scripted drivers (patient, detour, reckless rammer, jumper, wash lane) and run twice to check determinism. Each run is checked for:
- no plugin errors;
- valid tuples, finite colliders and JSON-clean `state()`;
- longest stop < 60 s;
- `EV.setpiece` fired;
- the type-specific behaviour, for example:
  - the redirect is registered with 60 s;
  - all 6 carrier cars drop and fly;
  - the drawbridge opens a real gap, a 5 m/s RV splashes and respawns, and safe mode never opens a gap;
  - the car wash drops exactly one star when slow and none when fast or watched;
  - grabs are capped at 2 and oil knocks bikers off;
  - the tornado crosses in front of the RV, cars reach 15+ m, the pull is felt and the damage is survivable;
  - Pratt chases and falls at 1★, and is a cameo at 0★.

**(b) Real GameSim and Autopilot.** For each zone the RV is teleported 480 m before it, with stops pre-looted and heat set where it matters. Result: every set-piece is passed on seeds 1337, 1 and 2, with no plugin errors, and the events fire. The handover ends with `won`. The tornado's real-sim numbers on seeds 1337 and 1–4 at 2★:
- crossing beat at RV ≈ 50–65 m;
- pull ≤ 0.4, because the Autopilot brakes for the airborne cars;
- 0–21 hp taken;
- 0–2 cops wrecked;
- up to 6 cars flying at once.

**SIM-CORE `npm run test:sim`:** 67/67. The full run wins in 38–40 min with 17/17 set-pieces seen.
