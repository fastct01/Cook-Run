# Cook & Run — Expansion build contract (the 40-minute version)

Read `CONTRACT.md` and `VAN_CONTRACT.md` first; this file overrides them where they differ.
The design the user approved is in the plan doc. Its content is summarised here.

**What changes**
- The route grows from 7 km to 40 km: 13 areas, 8 supply stops and 17 scripted set-pieces. The data is final in `public/js/data/route.json`.
- The game starts **on foot in Rook's Garage** with a short two-player tutorial.
- The driver drives in **first person** (cab model `rv_cab_fp`). Pressing **C** gives a 3-second outside look-around, with a 30-second cooldown.
- The RV **slowly regenerates HP**.
- New road hazards: sewer steam leak, burst water main and more. **Motorbike cops** appear from 2 stars and the **Rhino armoured truck** at 5 stars; it throws flashbang and foam canisters ahead of the RV.
- Each **supply stop** is a two-player moment:
  - Rook leaves the RV and plays a **shop challenge** (driver side, local).
  - Doc climbs out through the roof vent and runs **roof defence** with a water hose, firecrackers, paint balloons and a smoke flare.
- **Time of day** runs from dawn to sunset.
- The heat-star underlines are removed.
- New **RV engine sound**.
- A **"STOP AT …" banner** appears for both players from 800 m. A **bouncing 3D arrow** shows over the next stop from 600 m.
- The user added a **tornado that throws cars** in the desert (the `tornado` set-piece on the salt flats).

All content stays original: no real brands, no film or TV characters. "The Midnight Comet" must not resemble Batman. Chemistry stays fictional, and there are no children. Police canisters are cartoon "FLASH"/"FOAM" props.

## Ownership (touch ONLY your files; additive edits where noted)
| Agent | Owns |
|---|---|
| SIM-CORE | `public/js/sim/**` (except `sim/setpieces/*` plugins, `sim/garage.js`, `sim/roof.js`); `sim/autopilot.js`; `sim/test/**`; may tune numbers or add keys in `data/route.json` and `data/rules.json` (never rename or remove) |
| SETPIECES | `public/js/sim/setpieces/**` (plugins + `index.js` registry + `setpieces/test/**`). `host.js` and `base.js` are frozen except for bug fixes |
| ONFOOT | `public/js/sim/garage.js`, `public/js/onfoot/**`, `public/css/onfoot.css`, `public/onfoot-test.html` |
| ROOF | `public/js/sim/roof.js`, `public/js/van/roof/**`, `public/roof-test.html`; additive hooks in `public/js/van/VanLab3D.js` |
| VIEW-FP | `public/js/render/fp/**`, `public/js/ui/hud.js`, `public/css/hud.css`, `public/js/render/audio.js`, `public/fp-test.html` |
| VIEW-WORLD-A | `public/js/render/env.js`, `chunks.js`, `roadBuilder.js`, `WorldView.js` (keep the public API and hooks), `public/js/render/world/**`, `public/js/render/fakeSnapshots.js` (extend), `public/world-test.html` |
| VIEW-WORLD-B | `public/js/render/entities.js`, `fx.js`, `particles.js`, `rig.js`, `rv.js` (additive), `public/js/render/ents/**`, `public/ents-test.html` |
| INTEGRATOR (lead) | `public/js/main.js`, `index.html`, `css/style.css`, `server/**`, `shared/protocol.js` (agents may ADD protocol constants and must report them) |

Assets are done and frozen: `public/js/assets/**`. `createModel(kind, variant)` returns every model; see `docs/assets-x/*.md` for each model's named parts and the axes they animate on. If a model has a real bug, report it to the integrator instead of editing the asset files.

## Data (`route.json`, final shape)
- `routeLength` is 40000. `start` = `{ z: 45, lane: 1, garage: true }`. `timeOfDay` holds `[z, hour]` keyframes from 6.6 to 19.8.
- `biomes[]`: 13 areas, keeping the old fields plus:
  - `road.type`: `city` | `cobble` (with `tramTracks`) | `freeway` (with `median`) | `rural` | `dirt`
  - `terrain[]`: terrain tile kinds placed beyond the scenery band
  - `water`: side of the sea, docks only
  - `yards`: suburbs back-garden detour
- `stops[]` (8): `{ id, name, model, variant, z, side, lotLength, lotDepth, loadTime, gives, shop: { type, title, goal, timeLimit, … }, alarm? }`. The shop types are `collect` (variant `trolley`), `haggle`, `forklift`, `pump`, `goat`, `crane` and `alarm`.
- `setpieces[]` (17): `{ id, type, area, z | from/to, … }`. The types are `freight_wagons`, `midnight_comet`, `parade`, `drawbridge`, `wide_load`, `car_carrier`, `toll_plaza`, `inflatable_gorilla`, `car_wash`, `cattle_drive`, `combine`, `log_spill`, `rattlers`, `tornado`, `stagecoach`, `pratt_jump` and `handover`.
- `structures[]`: static road structures that need special road handling:
  - `garage` (z 45, side +1)
  - `rail_crossing` (1800)
  - `drawbridge` (13180–13230)
  - `overpass` (20500, 23200)
  - `toll_plaza` (24500)
  - `car_wash` (28200, side +1)
  - `cattle_grid` (29500)
  - `river_bridge` (33585–33615, `covered_bridge`)
- `bridge` (the canyon jump) now has its lip at 38900. `sellPoint` is at z 39800.
- **Garage placement:** the garage centre is at `x = track.xAt(45, +18)`, z = 45, on the driver's right. The door faces the road, so model rotation.y = +π/2. The `rooks_garage` exterior and `garage_interior` share this transform. The RV starts parked inside, nose toward the road, and drives out onto the road.

`rules.json` adds:
- `rv.regenDelay`, `rv.regenPerSec`
- `heat.levels[].moto` / `.rhino`, `heat.moto`, `heat.rhino` (with `flash` / `foam`), `heat.carWashDrop`, `heat.comet`
- new `obstacles.*` (the hazards)
- `roof.*`, `stops.*`, `tutorial.*`

## Protocol additions (`shared/protocol.js`, done)
- `KIND`: 44 kinds appended, ending with `tornado` and `paint_splat`. Ids are indices, so never reorder them.
- `CMD` (cook → host):
  - `roofEnter`, `roofLeave`
  - `roofAim { yaw, pitch, spray }` (RV-local)
  - `roofThrow { device, x, z }`
  - `avatarMove { mx, mz, run }` (world space, garage)
  - `avatarAct {}`
- `DCMD` (driver-local, `sim.applyDriverCommand`): `shopDone { stopId, score }`, `shopAbort { stopId }`, `skipTutorial {}`.
- `EV`: `tutorial`, `stopParked`, `shopResult`, `roof`, `roofHit`, `canister`, `regen`, `setpiece`, `heatDrop`.
- `DriverInput` gains `moveX`, `moveZ` (world-space on-foot vector, −1..1) and `interact` (edge-triggered), used in the garage phase. Look-around is client-only and never reaches the sim.

## Snapshot additions (SIM-CORE produces them; everyone reads them)
```
phase: 'garage'|'countdown'|'drive'|'won'|'lost'
garage: null | { step, stepId, steps:[ids], rook:{x,z,yaw,speed,carry,inRv}, doc:{…}, items:{ keys:'hook'|'rook',
          notebook:'desk'|'doc', crate:'floor'|'doc'|'rv', plug:'in'|'out', door:0..1, engine:'off'|'cranking'|'on' },
          prompt:{ rook, doc } }                       ← produced by ONFOOT's sim/garage.js state()
stop: null | { id, name, shopType, state:'parked'|'shopping'|'returning'|'loading'|'done', shopT, loadT, progress,
          blocked, copDist, roof:{ active, aimYaw, aimPitch, spray, ammo:{firecracker,balloon,flare} } }  ← roof part from sim/roof.js
nearStop: null | { id, name, dist, side, z }            next un-looted stop within rules.stops.bannerDist (800 m)
timeOfDay: hour            area: { id, name }
rv: { …, regen: bool, roofDoc: bool }
fx: { fog: 0..1, flash: 0..1, shock: 0..1 }             windscreen fog (steam/flood), canister white-out, power-line shock
setpieces: [ host.state() … ]                            each { id, type, phase, t, …type-specific }
ents: set-piece entities and new hazard kinds use the same tuple format; cop states 6 soaked, 7 stalled, 8 paint-blind;
      flashbang state 0 flying (y>0), 1 armed on ground, 2 burst; variant 0 flash, 1 foam
```

## Sim hooks (SIM-CORE wires these into GameSim; the plugin owners implement them)
```js
import { SetPieceHost } from './setpieces/host.js';   // SETPIECES fills the registry
import { GarageTutorial } from './garage.js';         // ONFOOT
import { RoofDefence } from './roof.js';              // ROOF
// constructor
this.setpieces = new SetPieceHost(this);
if (route.start.garage) { this.phase = 'garage'; this.garage = new GarageTutorial(this); }
this.roof = new RoofDefence(this);
// step(input, dt)
if (phase === 'garage') { this.garage.update(dt, input); if (this.garage.done) → phase 'countdown' (1.5 s) ; RV is static meanwhile }
if (phase === 'drive') { …; this.setpieces.update(dt); this.roof.update(dt); }
// applyCookCommand: roof* → this.roof.command(cmd); avatar* → this.garage?.command(cmd)
// surface: this.surfaceAt(z) = this.setpieces.surfaceY(z) ?? track.surfaceY(z)    (drawbridge uses this)
// collisions: this.setpieces.colliders(arr) — circles {x,z,r,solid,damage,kind,onHit}
// snapshot: ents += setpieces.ents(); snap.setpieces = setpieces.state(); snap.garage = garage?.state() ?? null; snap.stop.roof = roof.state()
// if the module file is missing or throws on import, the sim must still run (the stubs are committed; keep them working)
```
**Helper API on GameSim** (SIM-CORE implements it; the plugins use only this):
- `sim.rv`: `{ x, y, z, yaw, speed, … }` (read only)
- `sim.track`, `sim.time`, `sim.data`, `sim.seed`, `sim.phase`
- `sim.newId()`: a unique entity id
- `sim.kindId(kind)`: kind name → `KIND_ID`
- `sim.emit(ev)`: pushes to both event queues
- `sim.msg(text, tone)`: HUD toast
- `sim.damageRv(amount, cause)`, `sim.pushRv(dx, dz, speedLoss = 0)`
- `sim.addHeat(amount, reason)`, `sim.dropStars(n, reason)`
- `sim.copsList()`: `[{ id, kind, x, z, yaw, speed, state }]`
- `sim.applyCopEffect(id, { push: {x,z}, soak: s, stall: s, blind: s, damage })`
- `sim.redirectCops(targetFn: (cop) => {x,z} | null, seconds)`: cops chase that target instead (the Comet)
- `sim.setFx({ fog, flash, shock })`: max-merged per frame
- `sim.spawnTrafficCar(kind, x, z, yaw, speed)`: optional; it returns an id

## Stop flow (SIM-CORE; ONFOOT does the driver-side shop UI; ROOF does the roof)
- From 800 m the next un-looted stop is reported in `nearStop`. The driver HUD shows a "STOP AT …" banner for both players, and the world shows the bouncing `stop_arrow` from 600 m.
- **Parking:** RV inside the lot at speed < 2.5 starts `stop = { state: 'parked' }` and emits `stopParked`. 0.6 s later the state becomes `'shopping'` and Rook leaves the seat; driving input is ignored.
- **Shopping:** the driver client shows the ShopChallenge for `stop.shopType`, then sends `shopDone { score }` or `shopAbort`. After that comes `'returning'` (2 s, Rook runs back), then `'loading'` (`loadTime` s). Loading pauses while any active cop is within `rules.stops.copBlockRadius`; soaked, stalled or blinded cops don't count. Then `'done'`: supplies are added (with a score ≥ 0.8, +1 of the first item) and the stop is looted. A stop is also left unlooted if the driver drives away.
- **Shop timeout:** `shopMaxSeconds` (90). The bust rule still applies while parked, so the roof defence matters.
- **Roof:** while a stop is `parked`/`shopping`/`returning`/`loading`, the cook may climb up (`roofEnter`). In solo, `sim/roof.js` runs an AI defender that is less accurate (`roof.aiAccuracy`).

## Garage tutorial (ONFOOT: `sim/garage.js` logic + client view)
**Steps:**
1. walk to the markers
2. Rook takes the keys, Doc takes the notebook
3. Doc carries the crate to the RV side door
4. Rook unplugs the charger and presses the door button (door opens)
5. both get in: Doc through the side door, Rook into the driver's seat
6. Rook holds E to crank the engine

When done, the phase goes to countdown and then drive.

**Inputs:** Rook uses `DriverInput.moveX`/`moveZ`/`interact`; Doc uses `CMD.avatarMove`/`avatarAct`.

**Solo:** Doc is AI and does his steps by himself. `DCMD.skipTutorial` skips it all.

**Client:** `onfoot/GarageView.js` adds the interior, the two avatars (`createModel('driver')` and `createModel('cook')`, walk cycles) and the prompts. It also adds a third-person camera behind your own avatar, through `view.setCameraController`. `GarageView.cameraYaw` lets main.js turn WASD into a world vector.

## Shop challenges (ONFOOT: `onfoot/shops/**`, driver side, local)
```js
const shop = new ShopChallenge(view, stopDef, data, { onDone(score), onAbort() });  // uses view.setSceneOverride for its own scene
shop.update(dt); shop.onKey(e, down) → bool; shop.destroy();
```
There are 7 types: collect (+ trolley), haggle, forklift, pump, goat, crane and alarm. Rook is on foot in third person, using WASD, E, the mouse and Esc to abort. Each type plays in 30–70 s and returns `score` 0..1. Use the expansion models: `shop_hardware_interior`, the clerks, `forklift`, `goat`, the store exteriors and so on. Each type gets its own HUD line with timer and goal.

## Roof defence (ROOF)
- **Cook client:**
  - In VanLab3D, a "Get on the roof [R]" prompt appears during stops.
  - Doc walks to the vent and the hatch flips open, with a climb animation (`roof_hatch` `lid`).
  - The camera moves to over-the-shoulder on the RV roof, with Doc shown as `doc_roof`.
  - Mouse aims (`roofAim` at about 10 Hz), and holding the left button sprays.
  - 1/2/3 pick firecracker, balloon or flare; right-click or E throws at the ground point under the cursor (`roofThrow`).
  - R or the stop ending climbs back down.
- **Sim (`sim/roof.js`):** handles ammo, the hose cone test against `sim.copsList()` → `applyCopEffect`, emits `roofHit`, provides `state()` for `snap.stop.roof`, and the solo AI.
- **Visuals seen from outside:** VIEW-WORLD-B draws Doc on the roof and the spray when `rv.roofDoc` is set.

## First person (VIEW-FP)
- **Camera:** a camera controller at `rv_cab_fp` `userData.eye`. The cab model is parented to `view.rvAnchor`, and the RV body layer is hidden from that camera.
- **Mouse head-turn:** about ±70° yaw and ±20° pitch, easing back to centre.
- **Mirrors:** live render-target mirrors (`mirror_l_glass` / `mirror_r_glass` / `mirror_c_glass`) via `view.addPreRender`, at reduced resolution and roughly 20 Hz.
- **Cab animation:** gauges driven from speed, rpm (a simulated 3-speed auto box) and temperature; the wheel follows `rv.steer`; wipers run on fog.
- **Windscreen effects:** fog from `snap.fx.fog`, white-out from `fx.flash`, and a shock jitter.
- **Look-around:** **C** gives a 3-second orbit camera outside the RV (the mouse swings it), then it snaps back. 30-second cooldown, with a ring on the HUD.
- **Garage phase:** FP is inactive while ONFOOT's camera controller runs.
- **HUD (`hud.js`):**
  - remove the star underlines
  - "STOP AT: <name> — 450 m on your right" banner with a missed-it warning
  - look-around ring
  - regen indicator on the RV HP bar
  - status lines "Rook is in the shop" and "Doc is on the roof"
  - set-piece captions on `EV.setpiece`
  - flash/fog overlays if not done in fp
- **Audio:**
  - V8 + 3-speed auto engine, gear-change clunks, rattles, brake squeal, two-tone truck horn, indicator tick, starter crank (garage `items.engine`), nitro backfire
  - plus SFX for steam hiss (proximity), flashbang, foam, tornado roar, crowd and band, drawbridge bell, hose spray, firecrackers

## World (VIEW-WORLD-A: static; VIEW-WORLD-B: dynamic)
**A:**
- the 13 biome looks
- road types: cobble with tram tracks; a 6-lane freeway with median barrier; rural; dirt
- terrain tiles (`docs/assets-x/country.md` has the tile convention)
- scenery placement using the expansion kinds
- docks sea plane
- structures: garage exterior, rail crossing, drawbridge (leaf angle from `snap.setpieces` drawbridge state), overpasses, toll plaza, car wash, cattle grid, covered bridge + river
- stop lots with the new store models, and `stop_arrow` bobbing over the next un-looted stop from 600 m
- canyon/bridge at its new z; sell point at 39800
- time-of-day lighting from `snap.timeOfDay`
- perf: ≤ 300 draw calls, fog hides streaming

**B:**
- rendering and animating every new entity kind: moto cops, the Rhino (doors and lobber animate before a throw), canisters (flight, burst flash, foam), hazards (steam puffs rise/fade, water jet, dust-devil rings, power-line sparks, rolling logs)
- sheep and goat, and every set-piece entity: comet car booster flame, streetcar, car-carrier cargo drop, wide load, combine reel, logging truck logs, choppers, parade float and band, stagecoach horses, gorilla wobble, cowboys, the tornado funnel with debris and flying cars, Kestrel and car, Pratt
- cop soak, paint-splat and stall visuals
- Doc on the roof with hose spray when `rv.roofDoc`
- `RIG_RE` / `MAX_PARTS` extensions as needed

## Testing rules (everyone)
- Keep every file syntactically valid at every save: write a temp file, run `node --check`, then move it into place. Six other agents import shared code.
- **SIM-CORE** keeps `npm run test:sim` green. The other agents must not break it, so run `npm run test:sim` before finishing.
- **Browser harness:** `cd public && python3 -m http.server <port> &`. Use Python Playwright headless Chromium with `args=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']`. The software GL runs at about 1–3 fps, so script interactions with waits. LOOK at the screenshots with Read and iterate. Zero console errors.
- **Ports:** SIM-CORE 8201, SETPIECES 8202, ONFOOT 8203, ROOF 8204, VIEW-FP 8205, WORLD-A 8206, WORLD-B 8207. Kill your servers when done.
- Before the real sim emits a new field, test against your own fake snapshot generator. Near the end, poll for SIM-CORE's integration (`npm run test:sim` output, `GameSim` hooks) and test against the real thing.
- Save your best screenshots as `docs/x-<agent>-*.png` and write `docs/NOTES-x-<agent>.md` (API, decisions, what the integrator must do).
