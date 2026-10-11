# Cook & Run — Round 3 build contract

Read `CONTRACT.md`, `VAN_CONTRACT.md` and `EXPANSION_CONTRACT.md` first. This file overrides them where they differ.
The user approved the **Round 3 plan** (all 16 decisions as written, plus three answers below). This contract turns it
into files, APIs and owners so eight agents can build in parallel without colliding. The integrator (lead) wires
`main.js` and checks everything at the end.

## What the user approved (the plan, in short)

**Roles at a stop swap.** Doc (player 2, the cook) jumps out of the side door and does the shop task **in first
person**. Rook (player 1, the driver) stays with the RV and **defends it from the roof with guns**.

**Stopping with stars never busts at once.** DEFEND belongs to the driver. It appears whenever the RV is stopped
(< 1.5 m/s) with ≥ 1★ and a chasing cop within 40 m, at a supply stop or anywhere else. Pressing it (or **F**) puts
Rook on the roof. The bust meter needs:
- an RV stopped for longer than the grace period (Hard 3 s);
- a running (not disabled) cop within the bust radius;
- then it fills over the bust time (Hard 4 s).

While Rook defends, only running police cars fill it. Tyre-out, stalled or blinded cars add nothing.

**Guns** replace the hose: a revolver, a pump shotgun and a scoped hunting rifle.
- Shots hit the **police cars, never people**: tyres burst, radiators steam, windscreens crack, cars stall.
- Officers duck and back off. No blood, no gore anywhere.
- Every shot adds heat, and a disabled car adds more.
- The firecracker, paint balloon and smoke flare stay as throwables.
- Ammo refills at supply stops only.

**User's answers to the open questions:**
1. *"He is defending against the cops anyways as the cops spawn automatically as Rook is doing illegal stuff."* There is
   no extra task for Rook. **Cops are dispatched to every supply stop**: when the RV parks, a police response is
   called in and arrives a few seconds later. DEFEND is always relevant at stops.
2. *"Yes do 8 bags."* Extreme needs 8 bags (Easy 4, Hard 6).
3. *"Cops should fire in all cases, it's how much they fire."* Cops fire back on **every** difficulty; the level changes
   how often and how hard.
   - **Return fire:** whenever Rook is on the roof, cops near the RV shoot at it. This damages the hull, and Rook
     while he is up there.
   - **Chase fire:** from high stars (Easy 5★, Hard 4★, Extreme 3★) they also shoot at the moving RV, rarely.
   - The amounts come from the difficulty block.

**Solo:** at a stop you play Doc's shop task while an **AI Rook** defends. Anywhere else, DEFEND puts you on the roof
yourself.

**Doc plays in first person** inside the RV by default:
- **Controls:** mouse-look with pointer lock, WASD relative to the view, look at a station + E. Working a step uses the
  existing close-up.
- **What he sees:** gloved hands are visible, and the van has full-height walls + a ceiling in FP mode.
- **Keys:** O toggles the old cut-away overview, V works the vent fan. Doc no longer climbs onto the roof.

**At a stop, Doc's shop run:**
1. The prompt reads "SHOP RUN — side door [E]".
2. Doc walks to the side door and presses E.
3. A short jump-out, then the shop in first person. The time limits are ~40% shorter (60 s → 35 s).
4. He runs back (2 s), the supplies load, and the RV can leave.

The shop runs on **Doc's computer** (cook client, or the solo player's). It reports with the new cook commands.

**All three health bars regenerate:** RV hull, Rook and Doc, at 0.3 HP/s after 10 s without damage to *that* bar
(Hard). Each bar keeps its own timer, regen never revives a bar at zero, and a small green "+" pulses while it heals.

**Garage:**
- New tutorial step **"Suit up"** after "Find your spot": 7 steps in all. Each player holds E for 1.5 s at the suit
  rack, and the avatar switches to the suited model.
- Chemistry gear and protective apparel dress the room.
- The way-out arrows appear once the engine catches: a line of floor chevrons plus a floating 3D arrow over the door.
  They fade once the RV is out.

**Hands on the wheel:** blue suit gloves with yellow cuffs after Suit up (`rv_cab_fp_r3` variant 0).

**Rook** is a young adult of about 20 (`rook_young`): beanie, oversized red hoodie, headphones. He replaces the old
`driver` model everywhere.

**Cab** (`rv_cab_fp_r3`):
- A realistic 1980s four-spoke wheel, with hands that grip it and re-grip hand-over-hand.
- PRNDL pointer and warning lamps.
- Hula girl, mint freshener, fuzzy dice, coffee and phone, all jiggling via a spring model.

**Start district:** tow yard, tyre shop, diner, tank farm, pumpjacks, utility poles and so on around the garage.

**Difficulty** Easy / Hard / Extreme:
- The host picks it in the lobby; solo picks it on the title screen. Hard is the default and equals today's balance.
- It is locked once the game starts.
- The end screen and the room show it as a coloured tile (sand / rust / red).

**Interface: "dark glass".**
- Near-black translucent panels, Archivo for text, Fraunces only for big moments, standard icons.
- A heat slider under the stars, map pins on the route strip, the DEFEND button with a cop-proximity ring, and a
  "Doc: 2/3 items · 0:21" chip for the driver.
- The old desert **title screen comes back, live**:
  - cars both ways, tumbleweeds, nodding pumpjacks by oil tanks, circling vultures;
  - every 18 s the RV wiggles down the road puffing smoke, and every other time a cop chases it;
  - a version with a loading bar doubles as the loading screen.

**Design references:**
- `docs/r3/ui/*.png`: the 13 approved UI screens, rendered.
- `docs/r3/ui/src/*.html`: their exact markup and inline CSS. Copy values from these.
- `public/css/tokens.css`: the shared tokens.
- `public/css/fonts.css`: Archivo + Fraunces, vendored at `public/vendor/fonts` by `npm install`.

All content stays original. There are no real brands, no film or TV characters or quotes, and no real chemistry.

## Owners (touch ONLY your files; shared files = additive edits marked `// R3-<AGENT>`)

| Agent | Owns |
|---|---|
| **SIM** | `public/js/sim/**` except `sim/roof.js`, `sim/garage.js`, `sim/setpieces/**` (and `sim/structures.js` start-district colliders, which GARAGE adds). `public/js/shared/difficulty.js` (new). `public/js/data/rules.json` (everything except `rules.defend`). `public/js/cook/**` logic only (`CookLab.js`, `minigames/**`, `cook/test/**`: difficulty levers). `scripts/test-e2e.mjs`. Tests `npm run test:sim`, `test:cook`, `test:e2e` |
| **DEFEND** | `public/js/sim/roof.js` (Rook's roof: climb, guns, throwables, AI Rook). `rules.defend` (new block in rules.json; add only that key). `public/js/defend/**` (new: the driver's roof client: camera, input, Rook + gun view model, muzzle flash, tracers, casings, impacts, scope, roof HUD). Additive in `render/rv.js` (Rook on the roof seen from outside), `render/entities.js` + `render/ents/**` (police-car damage: holes, cracked glass, flat tyre, radiator steam; states 9/10; cop muzzle flashes and tracers at the RV). `public/defend-test.html`. `sim/test/roof-*.js` (own tests, run by `test:sim` through an import SIM adds) |
| **DOCFP** | `public/js/van/**` (VanLab3D first-person mode, DocController, vanCamera, interior full walls + ceiling in FP, FP gloved hands, VanHud restyle, side-door jump-out flow; remove Doc's roof mode). `public/css/van.css`. `public/van-test.html` |
| **SHOPS** | `public/js/onfoot/shops/**` (first-person Doc shop runs, all 7 types / 8 stops). `public/css/onfoot.css` (shop parts). `route.json` → `stops[].shop.*` fields only (new faster timers). `public/onfoot-test.html` (shop part) or a new `public/shop-test.html` |
| **HUD** | `public/js/ui/hud.js`, `public/css/hud.css`, `public/css/style.css` (overlay, pills, touch, boot styles), `public/css/tokens.css` (seeded by the integrator; extend, never rename). `public/view-test.html` HUD harness or a new `public/hud-test.html` |
| **LOBBY** | `public/js/ui/lobby.js`, `public/css/lobby.css` (title, live scene, loading screen, room, difficulty picker, how-to). `server/rooms.js` + `server/index.js` (difficulty setting). `public/js/net/NetClient.js` (only if needed). `scripts/test-net.mjs`. The `#boot` markup in `public/index.html` (only that element) |
| **CAB** | `public/js/render/fp/**` (switch to `rv_cab_fp_r3`, trinkets, lamps, PRNDL, horn hand, re-grip, stalks, radio dial). `public/js/render/audio.js` (cab sounds + exported helpers others can use). `public/fp-test.html` |
| **GARAGE** | `public/js/sim/garage.js` (Suit up step), `public/js/onfoot/GarageView.js`, `onfoot/avatar.js`, `onfoot/hud.js`, `onfoot/test/**` (garage). Start district: `public/js/render/world/startDistrict.js` (new) + additive hooks in `render/world/**`, `render/chunks.js`, `render/WorldView.js`. `sim/structures.js` (additive start colliders). `public/js/assets/index.js` (additive alias: `driver` → `rook_young`). `public/js/assets/expansion/index.js` (move round-3 kinds from the `x_round3` proposal tab into real categories so they preload). `public/onfoot-test.html` garage part, `public/world-test.html` start part |
| **INTEGRATOR** | `public/js/main.js`, `public/index.html` (except `#boot`), `public/js/shared/protocol.js` (done), `ROUND3_CONTRACT.md`, `README.md`, docs |

**Assets are frozen:** `public/js/assets/models/**` and the `r3-*.js` builders. If a model has a real bug, report it in
your NOTES file; don't patch around it silently.

**Shared files you may touch additively** (re-read the file right before every edit; keep edits small; never
reformat):
- `render/WorldView.js`, `render/rv.js`, `render/entities.js`, `render/chunks.js`
- `data/route.json` (owner per field above)
- `data/rules.json` (DEFEND adds only `defend`; everyone else asks SIM)
- `assets/index.js`, `assets/expansion/index.js` (GARAGE)

## Data: difficulty (SIM)

`rules.json` gains:

```json
"difficulty": { "default": "hard", "order": ["easy","hard","extreme"],
  "labels": { "easy": "Easy", "hard": "Hard", "extreme": "Extreme" },
  "levels": { "easy": { …overrides… }, "hard": {}, "extreme": { …overrides… } } }
```

`public/js/shared/difficulty.js` (SIM, pure, no DOM):

```js
export const DIFFICULTIES = ['easy', 'hard', 'extreme'];
export function normDifficulty(x)            // → a valid id ('hard' for anything unknown)
export function withDifficulty(data, level)  // → NEW data object { ...data, rules, route, difficulty: level }; never mutates the input
export function difficultyInfo(level)        // → { id, label, color: '#D9C38A'|'#E07A3C'|'#E5483A' }
```

`main.js` calls `withDifficulty` once per session and passes the result everywhere (sim, view, HUD, lab, shops, FP,
roof). So every module just reads its normal keys, and `data.difficulty` says the level.

**Hard** is today's balance plus the Round 3 changes. Easy and Extreme scale the levers below. "×" multiplies Hard;
this is the plan's table and the user approved it.

| Lever | Key(s) consumers read | Easy | Hard | Extreme |
|---|---|---|---|---|
| Cop ram damage car / SUV | `heat.copRamDamage`, `heat.suvRamDamage` (+ moto/rhino ×) | 4 / 6 | 6 / 10 | 9 / 15 |
| Cop top speed | `heat.levels[].copTopSpeed` | −2 | as is | +2 |
| Most cops at once | `heat.levels[].maxCops` (≥ 1 from 1★) | −1 | as is | +1 |
| Spawn interval | `heat.levels[].spawnEvery` | ×1.3 | as is | ×0.75 |
| Heat gained per incident or shot | `heat.sources.*`, `defend.heatPerShot`, `defend.heatPerDisable` | ×0.7 | 1 | ×1.3 |
| Cool-down delay / rate | `heat.decayDelay`, `heat.decayPerSec` | 5 / 0.08 | 7 / 0.05 | 10 / 0.03 |
| Rhino appears at | `heat.levels[].rhino` | never | 5★ | 4★ |
| Cops fire: return-fire rate × damage × | `defend.copFire.*` | ×0.4 / ×0.5 | 1 | ×1.6 / ×1.5 |
| Cops fire: chase fire from | `defend.copFire.chaseStars` | 5★ | 4★ | 3★ |
| Bust grace after stopping | `heat.bust.grace` | 5 s | 3 s | 1.5 s |
| Time to bust | `heat.bust.seconds` | 6 s | 4 s | 2.5 s |
| Regen (all 3 bars) | `rv.regenPerSec`, `rv.regenDelay` | 0.45 / 6 s | 0.3 / 10 s | 0.15 / 15 s |
| Crash damage | `rv.crashDamagePerMps` | ×0.7 | 1 | ×1.3 |
| Fumes & fire damage to Doc | `cook.hurtMult` | 0.6 | 1 | 1.5 |
| Obstacle density | `sim.obstacles.densityMult` | 0.7 | 1 | 1.3 |
| Traffic density | `sim.traffic.densityMult` | 0.8 | 1 | 1.2 |
| Minigame target zones | `cook.zoneScale` | 1.3 | 1 | 0.7 |
| Unwatched burner catches fire | `cook.burnerFireMult` | 0.6 | 1 | 1.5 |
| Bumps make Doc spill | `cook.spillMult` | 0.35 | 1 | 1.8 |
| Shop timers | `shops.timeMult` | 1.25 | 1 | 0.75 |
| Hits to stall a car | `defend.hitsMult` (round up; min 1) | ×0.75 | revolver 3, shotgun 1 tyre, rifle 1 radiator | ×1.5 |
| Ammo per stop | `defend.ammoMult`, `defend.flare` | ×1.5 | revolver 18, shells 10, rifle 18; crackers 3, paint 4, flare 1 | ×0.7, no flare |
| Look-around cooldown | `driver.lookCooldown` | 20 s | 30 s | 45 s |
| Bags needed | `route.sellPoint.requiredUnits` | 4 | 6 | 8 |
| Gadgets at the start | `sim.startGadgets` | smoke 2, nitro 1 | smoke 1 | none |
| Missing the canyon jump | `bridge.missDamage`, `bridge.missBags` | −20, −1 | −30, −1 | −50, −2 |
| Points multiplier | `scoring.mult` | 0.75 | 1 | 1.5 |
| Cops sent to a stop | `stops.response.cops`, `.delay` | 1, 12 s | 2, 8 s | 3, 5 s |

Every key above must have a Hard default in `rules.json`, and every consumer must use `?? <hard default>`. That way
a module works even when it is given raw data.

## Snapshot additions (SIM produces; DEFEND fills `roof`)

See `shared/protocol.js` "Round 3 snapshot fields" (done):

- **`difficulty`.**
- **`rv`:**
  - `rv.roofRook`: Rook visible on the roof, i.e. climb > 0.5.
  - `rv.stopped`: seconds at |speed| < `heat.bust.maxRvSpeed`.
  - `rv.roofDoc` is now always false.
- **`crew.regen`:** `{ driver, cook }`.
- **`bustInfo`:** `{ grace, armed, defended }`.
- **`roof`:** Rook's roof state, from `sim.roof.state()`. Also in `stop.roof`.
- **`stop`:**
  - `stop.doc`: `'in'|'out'|'back'`.
  - `stop.docShop`: from the cook's LabState `shop`.
- **`copFx`:** police-car damage tuples. Cop entity states 9 (tyre out) and 10 (radiator, steaming, stalled) are
  added.
- **`EndResult`** gains `difficulty` and `scoreMult`.

`snap.roof` / `stop.roof` (DEFEND's `state()`):

```
{ active, climbing, climbDir: 'up'|'down'|null, climb: 0..1, onRoof, ai,
  available: bool, why: 'moving'|'noHeat'|'noCop'|'airborne'|'cookDown'|null,   // the DEFEND button's state
  nearCop: m,                                                                    // nearest running cop (ring on the button)
  gun: 'revolver'|'shotgun'|'rifle', slot: gun or throwable id, ads: bool, aimYaw, aimPitch,
  reloading: s left (0 = no), reloadT: s total, cooldown: s,
  mag: { revolver, shotgun, rifle }, reserve: { revolver, shotgun, rifle },
  throwables: { firecracker, balloon, flare },  fx: [ throws in flight / landed, as today ] }
```

`available` is computed by the sim:
- phase 'drive', not airborne, Rook not already up;
- and either:
  - the stop is parked/shopping/returning/loading, **or**
  - |speed| < 1.5 with ≥ 1★ and a chasing cop within 40 m.

When it is false, `why` says why.

## Stop flow (SIM)

```
parked ─0.6 s→ shopping ──CMD.shopEnter──▶ (doc 'out') ──CMD.shopDone / shopAbort / 90 s──▶ returning (doc 'back', 2 s) → loading → done
```

**Shopping before Doc jumps out** (`doc === 'in'`):
- The RV is NOT held, so the driver may still drive off. Leaving the lot cancels the stop: unlooted, can retry.
- The 90 s shop limit already counts.

**Once Doc is out** (`shopEnter`):
- `holdsRv()` is true until loading (Doc must get back in).
- The new `EV.DOC_OUT { out: true }` fires.

`CMD.shopEnter / shopDone / shopAbort` come from the cook client through `sim.applyCookCommand`. The old
`DCMD.shopDone / shopAbort` stay, for solo and bots: the solo player's shop runs on the host, and `autoShop` bots use
them. `shopDone` also counts as `shopEnter` if it was never sent.

`LabState.shop` (6 Hz from the cook while in a shop) → `stop.docShop`.

**Cops sent to every stop** (`stops.response`): on `stopParked`, if the heat is below `response.minStars` (1), set it to
1.2. Then within `delay` s spawn `cops` chasing police cars, from behind/ahead via the normal spawner (spread by 1–2 s),
and emit `EV.STOP_COPS { stopId, count, eta }` + a toast ("Someone called it in — cops on the way!"). The Last
Chance Gas alarm stays (extra heat).

Loading pauses while a **running** cop (state 1) is within `copBlockRadius`. Disabled states 2/3/6/7/8/9/10 don't count.

## Bust + defend (SIM: heat.js; DEFEND: roof.js)

**Bust:**
- `rv.stopped` accumulates while |speed| < `bust.maxRvSpeed` (4) and the RV is not airborne. Any faster frame resets it.
- The meter may fill only when `stopped ≥ bust.grace` (`bustInfo.armed`) **and** a cop in state 1 (not redirected) is
  within `bust.radius`.
- It fills over `bust.seconds`, and drains at `decayPerSec`.
- `bustInfo.defended = sim.roof.onRoof`. That is informational; the state-1 rule already makes disabled cars not count.

**DEFEND (`sim/roof.js`, DEFEND owns):**
- `DCMD.defend {on:true}` is accepted when `available`. Rook climbs `roof.climbSeconds` (1.6 s), and the RV is held
  (`sim.roof.holdsRv === true`) from the start of the climb until he is back in the seat.
- `{on:false}` (or W / F on the roof → the client sends it) climbs him down (1.6 s).
- Auto-down when the stop's loading finishes **and** no running cop is within 40 m. Also auto-down on phase ≠ drive.
- `ai:true` hands aiming/firing to the sim's AI Rook. In solo, the AI Rook climbs up automatically 0.8 s after a stop
  parks, and down when the stop is done.
- Human commands take over from the AI for 1.5 s.

**Guns** (`rules.defend`, Hard):

| Gun | Mag | Reserve/stop | Reload | Fire interval | Spread | Range | Effect |
|---|---|---|---|---|---|---|---|
| revolver | 6 | 18 | 2.0 s | 0.32 s | 1.2° | 45 m | hole (+ crack if glass); 3 hits on a car → stall 6 s (state 7) |
| shotgun | 5 | 10 | 0.55 s per shell | 0.85 s | 8 pellets in 5° | 22 m | a pellet on a tyre → tyre out (state 9: slews to a stop, out for 20 s, then gives up); body → holes |
| rifle | 5 | 18 | 2.6 s | 1.1 s (ADS 0.4°, hip 3°) | — | 90 m | radiator (front 1 m of the car) → state 10 steaming, stalled 15 s; glass → crack; body → hole |

- **Hit test** is pure and exported for the client's tracers: `rayCopHit(rv, aimYaw, aimPitch, cop) →
  { hit, dist, part, point }`. It uses an oriented box per cop kind with parts: wheels (4 boxes), radiator (front),
  glass (windscreen band), body. The **muzzle** is `ROOF_GEOM.muzzle` (RV-local).
- **Heat:** each trigger pull adds `heatPerShot` (0.04); each disabled car adds `heatPerDisable` (0.15), as witnessed.
- **Calls into the cops:** `sim.applyCopEffect(id, { hole: 1, crack: true, tyre: 'fl'|'fr'|'rl'|'rr', radiator: true,
  stall: s })`. SIM implements the new effect keys in `cops.js`:
  - tyre → state 9;
  - radiator → state 10;
  - holes / crack / tyre / steam → recorded in `copFx`.

  The "hits to stall" counter lives in roof.js.
- **Throwables:** firecracker (stall 3 s in r 6), paint balloon (blind 4 s in r 2.5), smoke flare (block view 6 s, r 9,
  uses one smoke charge). Same as today; 4/5/6 select, RMB or G throws.
- **Ammo** refills to the per-stop amounts at every new stop (`stopParked`). Between stops, it's what is left.

**Cops fire back** (SIM implements in `cops.js`, reading `rules.defend.copFire`, which DEFEND writes with the Hard
values):

```
copFire: { range: 35, returnEvery: 2.4, returnDamage: 2, rookShare: 0.5, accuracy: 0.45,
           chaseStars: 4, chaseEvery: 6, chaseDamage: 1.5, chaseRange: 30 }
```

- **Return fire:** while Rook is on the roof (climb ≥ 0.5), every running cop within `range` that has stopped or is
  slow shoots every `returnEvery` s (± jitter, seeded RNG).
- A hit (chance `accuracy`) deals `returnDamage` to the hull (`damageRv(…, 'gunfire', true)`) and
  `returnDamage * rookShare` to Rook (`hurtDriver`).
- **Chase fire:** from `chaseStars` up, a chasing cop within `chaseRange` shoots every `chaseEvery` s at the moving RV
  (hull only).
- **Event:** `EV.COP_SHOT {copId, x,y,z (cop window), tx,ty,tz, target, hit, damage}`.
- A disabled car never fires. Officers only ever shoot at the RV/Rook. Nothing is shown about anyone being hurt;
  Rook's bar just drops.

## Regeneration (SIM)

- **Hull:** `rv.hp`; damage is recorded in `damageRv`.
- **Rook:** `crew.driver`; damage is recorded in `hurtDriver`.
- **Doc:** `crew.cook`; damage is recorded in `labLink.hurtCook`. Not while `cookDown`.
- Each bar heals `rv.regenPerSec` once `rv.regenDelay` s have passed since its own last damage, and never from 0.
- **Snapshot:** `rv.regen` and `crew.regen.{driver,cook}`. `EV.REGEN {on, bar: 'rv'|'driver'|'cook'}`.

## Cook client: first person + shop run (DOCFP + SHOPS; main.js wires them)

**VanLab3D (DOCFP)** keeps its API. Additions:

```js
van.setViewMode('fp'|'overview')      // O toggles; default 'fp' (persist per browser in localStorage, try/catch)
van.viewMode
van.onShopRun = (stopDef) => {}       // set by main.js; called after Doc pressed E at the side door during stop.state 'shopping'
                                      // and the 0.8 s jump-out finished (the van view is then idle until returnFromShop)
van.returnFromShop()                  // the shop ended: Doc is back inside at the side door, the camera back in FP
van.shopPrompt                        // read-only: 'SHOP RUN — side door [E]' while a run is due (also shown by VanHud)
```

- **Pointer lock:** request it on a click on the canvas. Esc releases it and does not pause. The P key pauses (main.js
  handles P).
- **Comfort:** a damped camera sway, with a `localStorage` "comfort" toggle via the pause menu later.
- **Removed:** Doc's roof mode. VanLab3D no longer imports `van/roof/**` and R does nothing. Keep the files; the
  integrator deletes dead code.
- **Overview mode:** shows Rook on the roof from outside, via rv.js.

**ShopRun (SHOPS)**, the first-person replacement of ShopChallenge, with the same module path and class name so
`main.js` changes little:

```js
import { ShopChallenge } from './onfoot/shops/ShopChallenge.js';
const shop = new ShopChallenge(view, stopDef, data, {
  hudRoot, onDone(score), onAbort(), onProgress({ label, frac, tLeft }) /* ~4 Hz */, firstPerson: true });
shop.update(dt); shop.onKey(e, down) → bool; shop.onPointer(e) (mousemove/down/up while pointer-locked); shop.destroy();
shop.setBot(on); shop.fastForward(s); shop.debugState();
```

- **Rendering:** each run renders its own scene through `view.setSceneOverride`.
- **Camera and hands:** Doc's eye 1.62 m, pointer-lock mouse-look, WASD, Shift run, E/LMB interact, Esc abort (hold
  1 s). Doc's gloved hands (blue nitrile, yellow suit cuffs) are visible and do the action: grab, carry, pump nozzle,
  forklift levers, crane joystick, flashlight.
- **Time limits:** `stopDef.shop.timeLimit × rules.shops.timeMult`. The new route.json values are ~40% shorter.
- **The 8 runs (plan table):**
  - **Bolt & Barrel Hardware:** sprint the aisles, look at each listed item and grab it, and stay out of the camera
    cones.
  - **Old Town Market:** stop the haggle needle on green 3×, then carry two crates that block half the view.
  - **Harbour Chandlery:** forklift from its seat, forks up and down, drop the pallet on the RV's rack.
  - **Sunny Gas & Ice:** hold the pump nozzle and stop the meter on the line, then mash E at the ice chest.
  - **MegaMart:** push the trolley (handle in view) through the aisles, then beat the self-checkout beam.
  - **Prickly Pete's Farm Supply:** corner the goat in the barn and grab it, then carry the feed sacks.
  - **Rustbucket Junkyard:** work the magnet crane from its cab and fish out the copper coil.
  - **Last Chance Gas:** find the solvent by flashlight in a dark stockroom before the silent alarm trips.

**main.js (integrator) wiring:**
- **Online cook:** `van.onShopRun` → send `CMD.shopEnter` → create the ShopChallenge. `onProgress` goes into LabState
  `shop`. `onDone` → `CMD.shopDone`; `onAbort` → `CMD.shopAbort` → `van.returnFromShop()`.
- **Solo:** when `stop.state === 'shopping'` the shop starts at once on the host (no walk). It uses `DCMD.shopDone`,
  and the AI Rook defends.

## Driver client: DEFEND (DEFEND + HUD; main.js wires)

```js
import { DefendClient } from './defend/DefendClient.js';
const d = new DefendClient(view, data, { hudRoot, audio, sendDriverCommand: (c) => sim.applyDriverCommand(c) });
d.update(dt, snap)             // every frame; takes the camera (view.setCameraController) while snap.roof.active && !snap.roof.ai
d.active                       // true while it owns the camera / input
d.onKey(e, down) → bool        // 1–3 guns, 4–6 throwables, R reload, W or F climb down, G throw, Shift hold breath (rifle)
d.onPointer(e)                 // mousemove / mousedown / mouseup / contextmenu while active (pointer lock: click to lock)
d.destroy()
```

- **What it draws:**
  - over-the-shoulder Rook (`rook_roof_aim`, the gun pose for the current gun);
  - the gun view model when ADS (rifle scope overlay);
  - muzzle flash, casings, tracers from `EV.SHOT`, impact sparks;
  - a roof HUD built with `tokens.css`: ammo `4 / 18`, gun slots 1–6, reload ring, crosshair, bust ring and the
    "Doc: 2/3 · 0:21" chip.
- **Outside view** (rv.js / entities, both roles): Rook on the roof, gun aimed along `roof.aimYaw/aimPitch`; police-car
  damage from `copFx`; tyre-out / steaming states; cop muzzle flashes and tracers from `EV.COP_SHOT`; sparks on the RV
  when hit.
- **Audio:** gunshots (revolver crack, shotgun boom, rifle crack + echo), shell clink, reload clicks, cop return fire
  (further away, muffled). Synthesised with WebAudio through `audio.js` helpers. CAB exports a small
  `audio.sfx(name, opts)` hook, or DEFEND keeps its own module on `audio.ctx` (CAB exposes `audio.context()`).

**HUD:**
- The DEFEND button sits bottom-centre over the dash. It shows:
  - the shield icon, "DEFEND", the sub-line "Climb to the roof";
  - the F keycap and the gun silhouettes;
  - the ring = nearest cop / bust %.

  States: Ready (lit), Held (climbing), Locked ("Stop the RV first") when moving with cops near; hidden when no heat.
- `hud.onDefend = () => …`: a click on the button. main.js sends `DCMD.defend`; F does the same in main.js.

## HUD (HUD agent) — match `docs/r3/ui/Driver-HUD.png`, `Driver-Defend.png`, `Cook-Lab.png`, `Cook-Shop.png`, `End.png`, `HUD-Kit.png`

The public API stays (`update`, `toast`, `showEnd`, `caption`, `areaTitle`, `setFirstPerson`, `setLookCooldown`,
`reset`, `destroy`). New:

```js
hud.onDefend = null                        // click on DEFEND
hud.setMode('drive'|'roof'|'lab'|'shop'|'garage')   // which panels show (roof: DefendClient draws its own centre HUD)
hud.setDifficulty(level)                   // tile on the end screen + top strip chip
```

**Layout:**

| Where | What |
|---|---|
| Top-left | Wanted: stars + heat slider (fill = heat − stars; SEEN amber / COOLING blue / MAX red; words, not colour alone) |
| Top-centre | The 600 px route strip: 8 pins at their real km, visited dimmed with a tick, the next one amber with its distance; the RV marker, canyon bridge, chequered flag; area name · km |
| Top-right | Bags `n / need`, Score, Q% |
| Bottom-left | Three bars (RV hull, Rook rust, Doc teal) with a pulsing green "+" while healing |
| Bottom-right | Gadget keycaps (C look, Q smoke, E oil, Shift nitro) with standard icons (eye, cloud, droplet, bolt) and counts |

- **Also:** the STOP AT banner, toasts (one line; fade, never bounce), area titles in Fraunces, the end screen with the
  difficulty tile and its numbers.
- **Cook role:** the same top row. Bottom-left bars, the shop chip, a lab panel per Cook-Lab.png. VanHud
  (DOCFP) draws the station prompts.
- **Budget:** one DOM update per frame, with no layout thrash (write only when a value changes).

## Lobby + title (LOBBY) — match `Main.png`, `Main-phone.png`, `Title-Loading.png`, `Lobby.png`, `Difficulty.png`

- **Live title scene:** CSS/SVG/DOM, animating only transform and opacity. Phones halve the traffic.
  - Sunset desert, mesas, the road to the horizon, the COOK & RUN wordmark, the highway-sign menu in dark glass.
  - Cars both ways, tumbleweeds, pumpjacks by oil tanks, circling vultures.
  - Every 18 s the RV comes down the road wiggling and puffing roof-vent smoke; every other time a cop chases it.
- **Loading variant with a bar.** `index.html #boot` becomes the same scene (a static first frame from CSS) + a loading
  bar. main.js calls `window.__bootProgress?.(0..1)` while preloading.
- **Difficulty:**
  - Solo: a segmented control Easy | Hard | Extreme next to Play Solo, remembered in localStorage.
  - Online: the host picks in the room (`C2S.SETTINGS {difficulty}`); both players see it; it is locked after Start.
  - `onStart({ …, difficulty })`.
  - The server keeps `room.difficulty` (default 'hard'). It goes in the ROOM payload and the START payload, is
    validated, and only the creator can set it, and only before START. test-net covers it.
- **How-to text:** updated for Round 3 (Doc shops in FP, Rook defends with F, cops come to every stop, regen, difficulty).

## Cab (CAB)

- **Model swap.** FirstPersonDriver builds `createModel('rv_cab_fp_r3', variant)`. The variant is 0 (gloves) once the
  garage `suit` step has suited Rook, or when the tutorial was skipped. It is 1 (bare hands, hoodie cuffs) only if
  `snap.garage.rook.suited === false` at the end of the garage. Keep every existing feature: mirrors, gauges, wipers,
  windscreen FX, look-around, head-turn.
- **Trinkets** (`render/fp/trinkets.js`, already written): driven by the RV's longitudinal/lateral acceleration and
  bumps from the snapshot, settling in ~1.5 s.
- **Lamps and gauges:**
  - Warning lamps: check engine < 30% hull, oil lamp when the oil gadget fires, high-heat at ≥ 4★.
  - PRNDL pointer from `gearbox.js`.
  - Radio dial shows the area name.
- **Hands:** the right hand to the horn while H is held. Hand-over-hand re-grip past ~100° (see NOTES-r3-cab.md).
- **Look-around cooldown** = `rules.driver.lookCooldown ?? 30`.
- **While Rook is on the roof:** `fp.setActive(false)` (main.js); DefendClient owns the camera.

## Garage + start + young Rook (GARAGE)

- **Steps** (`sim/garage.js`): `STEPS = ['markers','suit','grab','load','door','board','crank']`.
  - **Suit:** each player at the rack holds E (`interactHeld` / Doc `avatarAct` repeated or a new `avatarHold`;
    choose and document) for 1.5 s.
  - `state().rook.suited` / `doc.suited`, and `items.suits: [bool, bool]` (on the rack).
  - The solo AI Doc suits too. `skip()` suits both.
  - The new props' colliders go into `LAYOUT` (see NOTES-r3-garage.md "Proposed positions" / "Colliders").
  - Existing tests keep passing, updated for 7 steps.
- **GarageView:**
  - Dresses the interior with the r3-garage props.
  - Avatars `rook_young` / `cook` swap to the suited models when suited.
  - The way-out chevrons + floating arrow appear from `items.engine === 'on'` (or the countdown) and fade once the RV
    is past the door.
  - The checklist HUD (onfoot/hud.js) is restyled with tokens.css and shows 7 steps (Suit up = "Both").
- **Young Rook everywhere:** alias `createModel('driver', v)` → `rook_young` in `assets/index.js` (v0 casual, v1
  suited if the builder has it; check NOTES-r3-rook.md). The rig names must keep working for avatar.js, the van
  interior's seated Rook and the outside RV view.
- **Start district:** `r3-start-layout.js` placements → static world (render/world) streamed in the first ~300 m, with
  sim colliders (`startColliders(track)` → `sim/structures.js`). Everything stays clear of the road, the apron and the
  RV's right turn.

## Testing rules (everyone)

- **Keep every file syntactically valid at every save.** Write a temp file, `node --check` it, then move it into place.
  Eight agents import shared code.
- **SIM** keeps `npm run test:sim`, `test:cook` and `test:e2e` green. Everyone else runs `npm run test:sim` and
  `npm run test:assets` before finishing.
- **Browser:** `cd public && python3 -m http.server <port> &` (note the PID; kill it with `kill <pid>`; **never
  `pkill -f`**). Use headless Chromium via Python Playwright with
  `args=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']`. Rendering is ~1–3 fps in software, so
  script interactions with waits. LOOK at the screenshots with Read. Zero console errors.
- **Ports:** SIM 8301 · DEFEND 8302 · DOCFP 8303 · SHOPS 8304 · HUD 8305 · LOBBY 8306 · CAB 8307 · GARAGE 8308.
- Before SIM lands new snapshot fields, test against your own fake snapshots. Near the end, test against the real sim.
- **Deliverables:**
  - save your best screenshots as `docs/r3/build-<agent>-*.png` (compress PNGs; < 400 KB each);
  - write `docs/NOTES-r3-build-<agent>.md` (API, decisions, what the integrator must do in main.js — be exact);
  - do NOT edit main.js — describe the wiring instead.
- **Do not commit or push.** The integrator commits.
