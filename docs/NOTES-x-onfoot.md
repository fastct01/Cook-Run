# Agent ONFOOT — notes for the integrator

ONFOOT covers everything Rook and Doc do on foot: the opening **garage tutorial** (both players) and the driver's **shop challenges** at the 8 supply stops.

## Files (all owned by ONFOOT)

| Path | What |
|---|---|
| `public/js/sim/garage.js` | `GarageTutorial`: pure, deterministic logic (no DOM, no three). It also exports `LAYOUT`, `STEPS`, `EXT_OFFSET`, `garageFrame()`, `moveAvatar()`, `pushOut()` and `planPath()`. |
| `public/js/onfoot/GarageView.js` | The client view of the tutorial, for both roles. Also exports `worldMove()`. |
| `public/js/onfoot/avatar.js` | `Avatar`: walk, run, carry, push and reach poses on the `driver`/`cook`/`clerk` rigs. `PoseSmoother` smooths networked poses. |
| `public/js/onfoot/hud.js` | `OnfootHud`, the shared DOM overlay (instruction card, hold ring, pops, fade), plus `resultCard()`. |
| `public/js/onfoot/shops/ShopChallenge.js` | The facade main.js uses. It picks the type from `stopDef.shop.type`. |
| `public/js/onfoot/shops/ShopBase.js` | Shared shop machinery: its own scene, camera and lights; Rook in third person; input; timer; result card. |
| `public/js/onfoot/shops/{collect,haggle,forklift,pump,goat,crane,alarm}.js` | The 7 types. `collect` also handles `variant: 'trolley'`. |
| `public/js/onfoot/shops/{world2d,build}.js` | Flat collision world and path planner; Kit-based scene building blocks. |
| `public/js/onfoot/test/garage-headless.js` | Node test of `GarageTutorial`. Run it with `node public/js/onfoot/test/garage-headless.js`. |
| `public/js/onfoot/test/garageBot.js` | Scripted garage player, used by the harness. |
| `public/css/onfoot.css` | All the on-foot overlays. **Add `<link rel="stylesheet" href="css/onfoot.css">` to index.html.** |
| `public/onfoot-test.html` | Harness (see the end of this file). |

No protocol constants were added. The tutorial uses the existing `CMD.AVATAR_MOVE` / `CMD.AVATAR_ACT`, `DCMD.SKIP_TUTORIAL` / `SHOP_DONE` / `SHOP_ABORT` and `EV.TUTORIAL`.

---

## 1. Sim: `GarageTutorial` (`sim/garage.js`)

SIM-CORE has already wired this into `GameSim`. That integration was checked against the real GameSim: `sim.phase === 'garage'`, the RV is parked at `garage.rvPark`, and `snap.garage` is filled in.

```js
const g = new GarageTutorial(sim);  // reads sim.track, sim.route|sim.data.route, sim.rules, sim.solo, sim.emit
g.update(dt, driverInput);          // Rook. The fields used are listed below.
g.command(cmd);                     // Doc: CMD.avatarMove { mx, mz, run } (world space) · CMD.avatarAct {}
g.skip();                           // DCMD.skipTutorial. Everything completes, both are in the RV, engine on, done = true
g.state();                          // → snap.garage
g.done;                             // true about 0.6 s after the engine catches → phase 'countdown'
g.rook / g.doc;                     // world { x, z, yaw, speed, carry, inRv, act }
g.rvPark;                           // world { x, z, yaw }: the RV stays parked here during the tutorial
```

**DriverInput fields the garage reads.** All are optional.

| Field | Kind | Meaning |
|---|---|---|
| `moveX`, `moveZ` | −1..1 | World-space on-foot move vector |
| `run` | level | Shift held |
| `interact` | edge | E pressed. It must reach exactly one sim step. |
| `interactHeld` | level | E held, used for "hold E to crank" (SIM-CORE passes it through) |

If `interactHeld` is never sent, a single E press cranks the engine by itself.

There is also a fallback for an unchanged main.js: with no `moveX`/`moveZ`, `steer`/`throttle` move Rook in the default camera frame, and `oil` (the E key in main.js today) works as interact.

**Doc's input.** The last `avatarMove` is held for 0.5 s, then it times out and Doc stops. In solo (`sim.solo`) cook commands are ignored, because an AI Doc plays his part: he plans paths around the furniture, pauses at each spot, and gets out of Rook's way.

**Steps** (`STEPS`, in order):

| # | id | Who | What |
|---|---|---|---|
| 0 | `markers` | both | Each walks to their marker: Rook to the key rack, Doc to the desk |
| 1 | `grab` | both | Rook takes the keys, Doc takes the notebook (E) |
| 2 | `load` | Doc | Picks up the crate (slow, can't run), carries it to the RV's −X side door, E to load. E anywhere else puts it down. |
| 3 | `door` | Rook | Unplugs the charger plug, then presses the door button. The door opens 0 → 1 over 3 s. |
| 4 | `board` | both | Doc gets in at the side door (after `load`); Rook at the driver door (after `door`) |
| 5 | `crank` | Rook | Holds E for 1.5 s with the engine `'cranking'`. Releasing early stalls it back to `'off'`. `'on'` at 2.0 s, then `done`. |

Steps 2 and 3 run in parallel. `step` is the first unfinished step. Every completion emits `EV.TUTORIAL { type:'tutorial', step, stepId, done: <completed id> }`; a skip emits `stepId: 'skipped'`.

**`snap.garage`.** The contract fields, plus extras that GarageView uses:

```
{ step, stepId, steps, done, skipped,
  rook:{x,z,yaw,speed,carry,inRv,act}, doc:{…},                         (world space)
  items:{ keys:'hook'|'rook', notebook:'desk'|'doc', crate:'floor'|'doc'|'rv', plug:'in'|'out', door:0..1, engine:'off'|'cranking'|'on' },
  prompt:{ rook, doc },                                                 e.g. "Grab the keys from the hook [E]", "Wait for Doc…"
  crate:{x,z,yaw}, task:{rook,doc}, near:{rook,doc}, target:{rook:{x,z}|null, doc}, atMarker:{…}, complete:{…},
  hold: 0..1, solo, fb:[{who,what,n}], frame:{ox,oz,rot}, rvPark:{x,z,yaw} }
```

**Space.** Everything is simulated in `garage_interior`-local metres. The garage frame G is the `rooks_garage` exterior frame: centre `x = track.xAt(45, +18)`, z 45, `rotation.y = +π/2`. The interior sits in G at local offset `EXT_OFFSET = (−1.8, 0, −2.0)`. This lines its `rvPark` up exactly with the exterior's `bay`, and puts the two roll-up doors within 7 cm of each other.

Mapping: local (lx, lz) → world (ox + lz, oz − lx), and world yaw = local yaw + π/2. `garageFrame(track, route)` returns the converters.

**Deterministic.** The headless test runs the same inputs twice and gets identical state streams, for both two-player and solo runs.

---

## 2. Client: `GarageView` (both roles)

```js
import { GarageView } from './onfoot/GarageView.js';
const gv = new GarageView(view, data, { role, hudRoot: $('hud'), solo: mode === 'solo',
  onSkip: () => sim.applyDriverCommand({ type: DCMD.SKIP_TUTORIAL }) });   // host only; cook: omit onSkip (no button)
gv.update(dt, snap);   // every frame
gv.onKey(e, down);     // → true if it used the key (WASD/arrows, Shift, E/Space/Enter)
gv.consumeInput();     // driver: → { moveX, moveZ, run, interact, interactHeld }. Call once per sim step.
gv.pollCommands(dt);   // cook: → [CMD…]. avatarMove ≈15 Hz while moving (and once on stop); avatarAct per press.
gv.cameraYaw;          // world yaw the camera looks along; WASD is relative to it
gv.finished;          // true once snap.phase has left 'garage' and the fade is over → destroy()
gv.destroy();
```

What GarageView does:

- **Interior.** Adds `garage_interior` at the frame above, warm point lights, and both avatars with walk cycles, the carry pose, and the crate, notebook or keys in hand.
- **Items.** The roll-up door at `position.y`, the plug pulled out, and the crate on the floor, carried or slid into the RV.
- **Targets.** Tinted pulsing markers: `marker_1` is Rook's target (gold), `marker_0` is Doc's (orange). Your next target also gets a small bobbing `stop_arrow`.
- **HUD.**
  - title chip and a 6-step checklist
  - instruction card, with the keycap lit when you are in range
  - "Doc is hauling the crate" partner line
  - name tags and an `E` bubble over the target
  - Hold-E ring on the crank
  - pops ("Keys ✓", "ENGINE ON")
  - "Skip tutorial" for the host
- **Camera.** Third person behind and above your avatar, via `view.setCameraController`. It follows lazily (it swings behind you only while you walk away from it), and mouse-drag orbits and wheel zooms. It rises over the RV or the lift when they would hide you, stays inside the room (the walls are single-sided), and enables the RV layer (the cook's 'rear' mode hides it).
- **Prediction (cook).** Doc's own avatar is predicted locally with the sim's own `moveAvatar` + `pushOut`, and reconciled softly toward the host. The partner is smoothed by `PoseSmoother`.
- **Exterior.** While it runs, the `rooks_garage` exterior is hidden: any scene object with `userData.kind === 'rooks_garage'`, or via `view.setGarageExteriorVisible(false)` if WORLD-A adds that hook. The exterior's walls and props overlap the 18 × 14 interior. It is shown again on release.
- **Exit.** When `snap.phase` leaves `'garage'` it fades to black, releases the camera controller (`setCameraController(null)` → the built-in rig, or FP, takes over), hides itself, fades back in, and sets `finished`.

### What main.js must do

```js
// ── Session constructor, after this.view / this.hud ─────────────────────────
if (data.route.start.garage) {
  this.garage = new GarageView(this.view, data, { role: this.role, hudRoot: $('hud'), solo: this.mode === 'solo',
    onSkip: this.isHost ? () => this.sim.applyDriverCommand({ type: DCMD.SKIP_TUTORIAL }) : null });
}
// Cook (online): do NOT van.setActive(true) yet. VanLab3D also wants the camera controller and van mode.
// Activate the van when this.garage.finished (see cookFrame).
// Solo: ignore Tab (lab toggle) while this.garage exists. VIEW-FP: don't install the FP controller while snap.phase === 'garage'.

// ── keyboard (bindKeys → down/up), before KEYMAP/EDGEMAP and before the van ─
if (this.garage && !this.garage.finished && this.garage.onKey(e, true)) { e.preventDefault(); return; }   // in down()
if (this.garage && !this.garage.finished && this.garage.onKey(e, false)) { e.preventDefault(); return; }  // in up()
// on blur: this.garage?.clearKeys()

// ── host: driverInput(), once per sim step ──────────────────────────────────
driverInput() {
  if (this.garage && !this.garage.finished && this.sim.phase === 'garage') {
    return { throttle: 0, steer: 0, handbrake: false, horn: false, smoke: false, oil: false, nitro: false, reset: false,
             ...this.garage.consumeInput() };   // moveX/moveZ from cameraYaw, run, interact (edge, once), interactHeld
  }
  …existing…
}

// ── hostFrame(dt), after this.view.pushSnapshot(snap) ───────────────────────
if (this.garage) { this.garage.update(dt, snap); if (this.garage.finished) { this.garage.destroy(); this.garage = null; } }

// ── cookFrame(dt) ───────────────────────────────────────────────────────────
if (this.garage) {
  for (const c of this.garage.pollCommands(dt)) this.net?.sendGame({ k: GM.CMD, c });   // avatarMove ~15 Hz, avatarAct
  this.garage.update(dt, this.lastSnap);
  if (this.garage.finished) { this.garage.destroy(); this.garage = null; this.van?.setActive(true); }
}
```

**WASD mapping.** `consumeInput()` does this for the driver; `pollCommands()` does the same for the cook. With `yaw = gv.cameraYaw`, `f = W − S` and `r = D − A`:

```
moveX = sin(yaw)·f − cos(yaw)·r
moveZ = cos(yaw)·f + sin(yaw)·r      (normalised when |v| > 1)
```

`worldMove(f, r, yaw)` is exported if you'd rather do it yourself.

**Audio.** VIEW-FP's audio reads `snap.garage.items.engine` for the starter crank.

**Touch.** There is no on-screen joystick for the garage yet. Phones get the Skip button.

---

## 3. Shop challenges (driver only, local)

```js
import { ShopChallenge } from './onfoot/shops/ShopChallenge.js';
const shop = new ShopChallenge(view, stopDef, data, { hudRoot: $('hud'), onDone(score) {…}, onAbort() {…} });
shop.update(dt); shop.onKey(e, down) → bool; shop.destroy();
```

How a shop runs:

- **Rendering.** It draws its own `THREE.Scene` through `view.setSceneOverride`, and `destroy()` releases it. If you forget `update(dt)`, the override drives the logic itself.
- **Pointer.** Left click or tap on `view.renderer.domElement` works as E.
- **Keys.** WASD and arrows move, Shift runs, E/Space/Enter interacts, R/F (or Q/Z) move the forklift forks, and Esc calls `onAbort()`.
- **Score.** Every type has a goal line, a timer (`stopDef.shop.timeLimit`, with penalties shown as "−8s"), prompts, pops, and a result card (grade, stars, %, "+1 BONUS SUPPLY" when ≥ `rules.stops.bonusScore`). `onDone(score)` fires when the player continues (E, click, or automatically after 3.4 s).
- **Timeout.** If the timer runs out, the type gives a partial score (0 … 0.4) and still shows the card.

### What main.js must do (host)

```js
// hostFrame, after snap: start the challenge when the sim says Rook is shopping
const st = snap.stop;
if (st && st.state === 'shopping' && !this.shop && this._shopFor !== st.id) {
  const def = data.route.stops.find((s) => s.id === st.id);
  this._shopFor = st.id;
  this.input.clear();
  this.shop = new ShopChallenge(this.view, def, data, { hudRoot: $('hud'),
    onDone: (score) => { this.sim.applyDriverCommand({ type: DCMD.SHOP_DONE, stopId: def.id, score }); this.endShop(); },
    onAbort: () => { this.sim.applyDriverCommand({ type: DCMD.SHOP_ABORT, stopId: def.id }); this.endShop(); } });
}
if (this.shop) {
  this.shop.update(dt);
  if (!snap.stop || snap.stop.id !== this._shopFor || snap.stop.state !== 'shopping') this.endShop();   // timeout / drove off
}
endShop() { this.shop?.destroy(); this.shop = null; }
// keyboard: while this.shop exists, route keys to it FIRST (before Esc → pause):
if (this.shop && this.shop.onKey(e, true)) { e.preventDefault(); return; }    // and the same in up() with false
// driverInput(): while this.shop exists, return a neutral input (no throttle or gadgets). The sim ignores driving anyway.
```

- **Solo, Rook in the van.** A solo player who is cooking in the back (`inLab`) should be handed the wheel when `stopParked` arrives (`setInLab(false)`) before the shop starts. The Autopilot `labPilot` skips stops anyway.
- **HUD.** The world HUD stays visible under the shop overlay (z-index 7). Hiding `.crh` while shopping is optional.

### The 7 types

| stop | type | Gameplay | Score |
|---|---|---|---|
| hardware | `collect` | Inside `shop_hardware_interior` (walls cut at 3.4 m for the high camera). 3 glowing items on the list. Two sweeping security cones (`cam_*`, same geometry as the visible cones): 1.5 s in view gets a "HEY! YOU!" from the clerk (`clerk` v0, on the phone at `clerk_spot`), −8 s, red vignette. Finish by leaving the cash on the counter. | 0.5 + 0.62·timeLeft% − 0.18 per spot |
| megamart | `collect` / `trolley` | Same interior with a MEGAMART banner and no cones. Pushes a trolley (heavy turning, `trolley` v0 → v1 when loaded). Two `clerk` v4 staff walk loops ("Watch it!", −3 s). A wet-floor patch makes him slide and spin. Ends at the self-checkout: stop the scanner beam in the green 4 times ("Unexpected item in the bagging area!"). | time, bumps, scan accuracy |
| market | `haggle` | Cast-iron market hall with `market_stall` models, vendor `clerk` v1 and jars. A swinging needle: 3 rounds with the green zone shrinking and the needle speeding up. Then carry 2 crates out of the door (slow, no running). | 0.15 + 0.45·hits/3 + 0.42·time |
| chandlery | `forklift` | Dock yard (`store_chandlery`, `container_stack`, `bollard_crates`, harbour, `dock_worker`). Hop on the `forklift` (v1). Arcade rear-wheel steer, forks on R/F (`forks.position.y`). Slide under the pallet, lift, and set it on the yellow rear rack behind the parked `rv`. | time + alignment (cm and °) − bumps |
| gas_ice | `pump` | `store_gas` forecourt. Hold E: the meter accelerates; release on the line (2 tries, the best counts; overfill = spill). Then mash E at the ice chest for 3 bags before an 8 s melt timer runs out. | pump accuracy, bags, time |
| farm | `goat` | Barn (cut-away) with `hay` bales, `farmer`, and the `goat` with flee AI: open-space seeking, sideways dodges when you charge, stamina. Corner it and press E, then carry 3 feed sacks out. | time |
| junkyard | `crane` | `store_junkyard` yard. A pile of wrecks (`sedan`/`hatch`/`broken_car`) and a `guard_dog` barking. Climb into the magnet crane: A/D swing, W/S trolley, E drops the magnet, which grabs the TOPMOST thing. The coil is under a car door: fish the door off, grab the coil, drop it in the RV scrap bin. | time, wasted grabs |
| lastgas | `alarm` | Dark stockroom maze, lit by Rook's flashlight (spot shadow), with a blinking red beacon and a silent-alarm countdown (40 % of `timeLimit`). Grab the solvent; the alarm trips anyway (strobes, shutter rattling down); run out the door. | alarm time left + escape time |

**Draw calls** (SwiftShader, 1280×720): 11–56 per shop scene, well under 150. The busiest is MegaMart, with 2 staff and the trolley.

---

## 4. Status of the cross-agent requests

- **SIM-CORE (done).**
  - `GarageTutorial` is wired, with phases garage → countdown (1.5 s) → drive.
  - The RV is placed at and held on `garage.rvPark`; `skipTutorial` → `garage.skip()`; avatar commands are routed.
  - `interactHeld` is part of `DriverInput`, and sub-steps clear only `interact`.
  - Its garage walls and door in frame G match `EXT_OFFSET`.
- **VIEW-WORLD-A (requested through the lead).**
  - Keep `rooks_garage` as its own Object3D (it currently is: `StructuresView` → `lib.create`), or add `view.setGarageExteriorVisible(bool)`.
  - GarageView hides the exterior by `userData.kind` every frame (3 levels deep, plus a full traverse every 60 frames), so the lazily built structure is caught too. Without that, the exterior's inner walls (0.35 m in front of the interior's walls) cover the pegboard, key rack and posters.
- **VIEW-FP / main.js.**
  - Don't install the FP camera controller while `snap.phase === 'garage'`. GarageView releases its controller at the countdown.
  - Install FP right after. Otherwise the built-in chase rig sits behind the RV inside the garage exterior and shows its back wall for the 1.5 s countdown.

## 5. Tests

- **Node.** `node public/js/onfoot/test/garage-headless.js` gives ALL PASS.
  - a) Two players through the real input paths. The order is markers < grab < {load, door} < board < crank, the door animates over 3 s, and the engine goes off → cranking → on.
  - a2) Gating and prompts, the carry speed cap, putting the crate down.
  - b) Solo AI Doc does his whole part, and waits in the RV if Rook idles.
  - c) Releasing hold-E stalls the crank; holding starts it; edge-only input auto-cranks.
  - d) Skip.
  - e) Determinism, for two players and solo.
  - f) Fallback input.
  - g) Frame math: `rvPark` equals the exterior bay.
  - h) **End to end on the real `GameSim`.** Two players (DriverInput for Rook; `sim.applyCookCommand` at 15 Hz for Doc) and solo both go garage → countdown → drive, with all 6 `EV.TUTORIAL` in order, the RV still at `rvPark` the whole time, and throttle ignored. Also checked: `DCMD.skipTutorial` → countdown → drive, `netSnapshot().garage` (about 0.9 KB), and that solo ignores cook commands.
- **`npm run test:sim`.** 67/67 checks pass, including SIM-CORE's section h (stub, ONFOOT tutorial played by script, skip, door collider, drive out).
- **Browser.** `python3 public/js/onfoot/test/onfoot_browser_test.py [--shots DIR]` runs headless Chromium with SwiftShader and starts its own server on 8203 if none is running.
  - **Garage on the real GameSim, as driver, cook and solo.** Scripted players go through the real key path (GarageView `onKey` → `consumeInput` / `pollCommands`). The tutorial completes, the phase reaches countdown, and GarageView fades and releases the camera.
  - **All 8 stops (the 7 types).** The scripted player goes through ShopChallenge's key path, `onDone(score > 0)` fires, there are at most 150 draw calls, and the console shows zero errors.

**Screenshots** (`docs/x-onfoot-*.png`, 1280×720, SwiftShader):

| File | Shows |
|---|---|
| `garage-driver` | Rook at the key rack. The E bubble, the gold marker and a bobbing arrow show the target, and the step checklist and partner line are visible. |
| `garage-driver-crank` | Hold-E ring while cranking the engine. |
| `garage-cook` | The cook's camera with Doc hauling the crate (carry pose) while Rook unplugs the charger. |
| `garage-cook-sidedoor` | Doc at the RV side door with the load prompt. |
| `shop-hardware` | Shopping list sprint: the hardware shop with its camera cones and the spotted meter. |
| `shop-megamart` | Trolley run in progress. |
| `shop-megamart-result` | Trolley run result card. |
| `shop-market` | Haggle (market). |
| `shop-chandlery` | Forklift carrying the pallet. |
| `shop-chandlery-placed` | The pallet set on the RV rear rack. |
| `shop-gas` | Pumping fuel. |
| `shop-farm` | The goat in the barn. |
| `shop-junkyard` | The magnet crane. |
| `shop-lastgas` | Alarm tripped, running out. |
| `shop-result` | A result card with stars and "+1 BONUS SUPPLY". |

**Art iteration.** Each fix below came from looking at the screenshots:

- **Hardware and MegaMart.** The joists hid the aisles from the high camera. A clipping plane now cuts the shell at 3.4 m (dollhouse view).
- **Market.** The columns and beams hid Rook. They became wall pilasters, and the bunting moved to the walls.
- **Barn.** There was a black void past the cut-away walls. It now has an outside farmyard, and the walls are clipped at 3.0 m.
- **Crane.** The mast hid the boom. The camera is now a high three-quarter view from beside the cab.
- **Stockroom.** It was unreadably dark and too small. It is now a 16 × 12 shelf maze with moonlight fill and a brighter bulb.
- **Pump.** The camera sat inside the canopy. It now frames Rook and the pump from below the canopy.
- **Garage.**
  - The camera is clamped inside the walls.
  - The exterior is hidden every frame.
  - The arrow's ring and beam are hidden.
  - The E bubble is fixed: its CSS animation was overriding its transform.
  - The RV layer is enabled for the cook's camera.

## 6. Harness

| URL | What it runs |
|---|---|
| `onfoot-test.html?mode=garage&role=driver\|cook[&solo=1][&bot=partner\|me\|both][&local=1]` | The garage. It uses the real GameSim when the garage is wired (it is), else a local loop. `bot=me` drives YOUR avatar through GarageView's key path; `bot=partner` plays the other one. The cook gets 15 Hz snapshots with about 40 ms latency. |
| `onfoot-test.html?mode=shop&stop=hardware\|market\|chandlery\|gas_ice\|megamart\|farm\|junkyard\|lastgas[&bot=1]` | One shop challenge. |

`&shot=1` hides the debug bar.

`window.__onfoot` exposes `{ mode, view, gv, g, sim, shop, fast(sec), state(), key(code, down), done, score, aborted, calls }`.
