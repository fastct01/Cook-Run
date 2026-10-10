# VIEW-FP — first-person cab, HUD expansion, RV sound

Owned files: `public/js/render/fp/**`, `public/js/ui/hud.js`, `public/css/hud.css`, `public/js/render/audio.js`,
`public/fp-test.html`. Nothing outside these was edited. WorldView is used only through its hooks
(`rvAnchor`, `setCameraController`, `addPreRender`, `onEvent`, `_sceneOverride` read-only).

## Modules

| File | What |
|---|---|
| `render/fp/FirstPersonDriver.js` | The cab view: camera controller, head look, motion, gauges, wheel, wipers, look-around, glue. |
| `render/fp/gearbox.js` | Simulated 3-speed automatic (rpm, gear, throttle, load). Shared by the cab's rpm needle and the engine sound. |
| `render/fp/mirrors.js` | Live render-target mirrors (`mirror_l/r/c_glass`), round-robin through `view.addPreRender`. |
| `render/fp/windscreen.js` | On-glass condensation (fog + droplets) in the windshield plane, wiped by the real wiper sweep. |
| `render/fp/overlay.js` | DOM overlay over the canvas: vignette, flash white-out with afterimage, shock edge glow + sparks. |
| `ui/hud.js`, `css/hud.css` | HUD, same API plus the expansion widgets (below). |
| `render/audio.js` | All sound, synthesized. Same API plus `setDriveState`, `indicator`, `inspect`, and the offline test helper. |

## What main.js must do (integrator)

```js
import { FirstPersonDriver } from './render/fp/FirstPersonDriver.js';

// module level: give audio the route so it knows where the car wash / drawbridge are (optional)
const audio = createAudio({ route: data.route });

// startGame(): after `this.view` and `this.hud` exist, for the driver role (online driver AND solo)
if (this.role === 'driver') {
  this.fp = new FirstPersonDriver(this.view, data, { hudRoot: $('hud'), audio });  // audio → it calls audio.setDriveState itself
  this.fp.setActive(true);          // "wanted"; it takes the camera as soon as nobody else holds it
  this.hud.setFirstPerson(true);    // compact HUD speedo (the cab has a real one)
}

// hostFrame(dt): remember the input that was fed to the sim this frame
//   const inp = this.driverInput(); this._lastInput = inp; sim.step(inp, STEP);
// … then, after hud.update(snap) and van.update(…), BEFORE view.render:
this.fp?.update(this.paused ? 0 : dt, snap, this._lastInput);     // input is optional (throttle for the gearbox)
this.hud.setLookCooldown(this.fp?.active ? this.fp.cooldown : null); // ring hidden while not in the cab

// keys (bindKeys, driver, not paused, not in the van):  C → look-around (client-only, never sent to the sim)
if (code === 'KeyC' && !e.repeat && this.fp) { this.fp.lookAround(); return; }

// mouse: head turn (and swinging the look-around orbit)
window.addEventListener('mousemove', (e) => this.fp?.onPointer(e));   // remove it in destroy()

// solo seat swap (setInLab): call van.setActive(on) FIRST, then
this.fp?.setActive(!on); this.hud.setFirstPerson(!on);

// destroy(): this.fp?.destroy();
```

- **Garage phase:** nothing to do. While `snap.phase === 'garage'` the FP view stays inactive and never touches the
  camera, so ONFOOT's GarageView controller runs. At `countdown` it takes the camera (if GarageView has released it).
- **Other camera controllers win.** FP never replaces a controller someone else set (VanLab3D, GarageView). When they
  set `null`, FP re-claims it on its next `update()`. (VanLab3D calls `setCameraController(null)` when it goes
  inactive, even at start-up; that is fine.)
- **Shop challenges** (`view.setSceneOverride`): the FP overlay hides itself while an override is set, and the camera
  controller isn't called. Nothing to do.
- **Pointer lock:** a click on the canvas while in the cab requests pointer lock (option `pointerLock: true`); the
  browser releases it on Esc. Without lock, the cursor position relative to the screen centre turns the head (with a
  14 % dead zone). The head eases back to centre after 1.5 s without mouse movement.
- **Touch:** nothing extra. Without a mouse the head stays centred. `fp.setHead(yaw, pitch)` exists for a stick or gyro.
- **The cook** uses the existing rear camera / VanLab3D. Don't create an FP for the cook. Audio still runs the engine
  from its own built-in gearbox (from the snapshot), so the cook hears the same V8.
- **Audio** keeps its old API. `view.update`/`event` forwarding is unchanged (WorldView already calls
  `audio.update(snap, dt)` and `audio.event(ev, snap)`). If you don't pass `{ audio }` to the FP, call
  `audio.setDriveState(fp.driveState)` every frame instead.

## FirstPersonDriver API

`new FirstPersonDriver(view, data, opts)`, where `opts` is
`{ hudRoot, audio, pointerLock = true, mirrors = true, mirrorHz = 20, mirrorScale = 1, mirrorFar = 150, fov = 76, pitch = -0.16 }`.

| Member | |
|---|---|
| `setActive(bool)` | Wanted on or off. Off releases the camera, restores the near plane and RV layer, and exits pointer lock. |
| `update(dt, snap, input?)` | Every frame before `view.render`. Runs the gearbox, gauges, wheel, wipers, fog, overlay, look-around timers and camera claiming. |
| `onPointer(e)` | `mousemove` handler. |
| `lookAround() → bool` | Starts the 3 s orbit. Returns false on cooldown (30 s) or when not in the cab. |
| `cooldown` | Remaining look-around cooldown: 0 = ready, 1 = just used. |
| `active` / `mode` | Holds the camera / `'off'`, `'fp'` or `'look'`. |
| `gear`, `rpm`, `throttle`, `driveState` | From the gearbox: `{ rpm, gear (-1 R, 1..3), throttle, load, running }`. |
| `setHead(yaw, pitch)` | Direct head pose in radians (+yaw = left). |
| `shake(amount)` | Add camera shake. Crash, landing, ped, smash, cop wreck, canister and nitro events already shake through `view.onEvent`. |
| `forceWipers` | Bool, for tests. |
| `stats` | `{ mirrorCalls, mirrorRenders }`. |
| `ready` | Promise: the cab is built once `view.ready` resolves. |

How it works:

- **Cab placement.** `createModel('rv_cab_fp')` goes under `view.rvAnchor` at `userData.rvOffset`, so its `rv_frame` coincides with the RV frame and follows RV pitch, roll and sway.
- **Layers and shadows.** The main camera disables layer 1 (the baked RV body), but the sun's shadow camera keeps layer 1, so the RV shadow stays. The cab meshes cast no shadows.
- **Eye and FOV.** The eye is at `userData.eye` (0.55, 1.98, 2.50). The tuned look is pitch −0.16 at a 76° vertical FOV. It widens on portrait screens (keeping ≈90° horizontal, capped at 104°) and looks 0.12 rad lower there. The near plane is 0.08 while in the cab and restored on release.
- **Motion.**
  - Bob is a spring kicked by the rising edges of `feel.bump`.
  - The head leans and rolls against `feel.latAcc`, and counter-rolls 45 % of the body roll.
  - At idle, the old V8 shakes the cab with a small engine buzz.
  - Nitro adds a +9° FOV kick, and speed adds up to +3°.
  - Shock (`fx.shock`) adds shake.
- **Gauges.**
  - Speed: `lerp(2.36, −2.36, mph/100)`.
  - rpm: `lerp(2.1, −2.1, rpm/6000)`, from the gearbox.
  - Temperature: warms from cold to normal (0.5). It climbs toward hot when hp < 40 or `lab.fire > 0.3`.
  - The needles lag slightly and jitter on bumps.
- **Wheel.** The wheel turns `rv.steer × 1.7` rad, and the hands counter-rotate by `−0.5 × wheel` (the asset's recipe).
- **Wipers.** They run while `fx.fog > 0.1`, `weather === 'dust'` or `forceWipers` is set. One 1.15 s cycle sweeps 0 → 1.75 → 0. When they stop, they finish the stroke and park.
- **Look-around.** It eases out over 0.6 s. Then it orbits at 14 m radius and about 4.6 m height, sweeping 1.5 rad around the back of the RV over 3 s. The mouse swings it (±2.2 rad). It eases back over 0.6 s. During the orbit the RV body shows and the cab, overlay and mirrors are off.

## HUD additions (`ui/hud.js`)

The API is unchanged: `update`, `toast`, `showEnd`, `hideEnd`, `reset`, `destroy`. New:

- `setFirstPerson(bool)`: shrinks the speedo into the bottom-right corner, out of the cab's real gauges.
- `setLookCooldown(v | null)`: the look-around ring next to the gadgets. It fills as the cooldown runs out and glows when ready. `null` hides it.
- `caption(title, sub)`: the comic set-piece caption. It is fired automatically on `EV.setpiece`, once per set-piece id (phases like `done`/`idle` are ignored). `ev.caption`/`ev.sub` override the text. The built-in captions are in the exported `SETPIECE_CAPTIONS` table.
- `areaTitle(name, hour)`: the "NOW ENTERING / OLD TOWN / 10:12 AM" intro. It fires automatically when `snap.area` changes during `drive`, and falls back to `EV.biome` on older sims.

Automatic, for both roles (the cook gets them under the compact strip):

- **STOP AT banner.** Shows when `snap.nearStop` is within `rules.stops.bannerDist`. It reads "STOP AT / Bolt & Barrel Hardware / 450 m / on your right", with a store icon, a live distance and an animated chevron pointing to the side. Under 90 m it turns green and reads "PULL IN".
- **"Missed it — no supplies here".** Shows for 3.4 s when a stop is passed unlooted (it drops out of `nearStop` behind the RV) or when the sim lists it in `snap.closed` (abandoned or failed).
- **Status chips.**
  - "Parked — Rook heads in"
  - "Rook is in the shop 0:42" (`shopMax − shopT`)
  - "Rook is running back"
  - "Loading supplies 45%" (with a progress underline)
  - "COPS AT THE LOT" (from `stop.blocked`)
  - "Doc is on the roof" (from `rv.roofDoc` or `stop.roof.active`)
- **Loading bar.** The centre loading bar runs only in the `loading` state, and old sims without a `state` still work. While blocked it reads "COPS AT THE LOT — LOADING PAUSED".
- **Regen.** A pulsing green plus on the RV hull bar while `rv.regen`.
- **Clock chip.** The time of day from `snap.timeOfDay`, with a sun icon by day and a dusk icon from 17:36.
- **Canister warning.** "FLASH CANISTER! 22 m — swerve!" (or FOAM) for the nearest flashbang entity (state 0 or 1) within 40 m ahead of the RV. A toast follows on `EV.canister` with `hitRv`.
- **Removed:** the progress lines under the wanted stars, and the old side "next stop" chip (the banner replaces it).
- **Garage phase:** the driving widgets hide (class `crh--garage`). Toasts, titles and the end screen stay.
- **Responsive:** tested at 1280×720 and 390×844. A ≤ 420 px layer compacts the banner and chips. At ≤ 600 px the look ring stacks above the gadgets and the speedo sits above both.

## Audio additions (`render/audio.js`)

New calls: `createAudio({ volume, route })`, `audio.setDriveState({ rpm, gear, throttle, load, running })`,
`audio.indicator(true | false | null)` (null = automatic: it ticks while pulling in to a stop under 150 m),
`audio.inspect()` (live parameter values) and `renderEngineOffline({ rpm, throttle })` (exported, for tests).

**Engine.** A big-block V8 with a 3-speed automatic.

- **Firing pulse.** Each bank is one `PeriodicWave` oscillator at the engine-cycle frequency (rpm/120). Its 96 harmonics encode 8 uneven cross-plane firing pulses (L R L L R L R R order, bank imbalance and jittered spacing). At a 650 rpm idle this gives about 43 Hz firing with 5.4 / 10.8 / 21.7 Hz lope.
- **Shaping.** A waveshaper adds drive with throttle, a lowpass opens with rpm and throttle, and an exhaust peaking filter adds resonance. A crank-rate sub adds thump.
- **Intake and whine.** Intake roar is band noise scaled by throttle × rpm. A torque-converter pump whine runs at 13 × rpm/60.
- **Gears and lift-off.** A gear change plays a clunk while the gearbox drops the rpm. Lifting off above 1700 rpm gives overrun burble pops, and nitro adds pops and backfires.
- **Starter.** The garage `items.engine` drives it: `cranking` plays the starter motor, and `on` plays the catch (a rev flare and a cough).
- **Source of rpm.** Uses `setDriveState` while it is fresh (< 0.5 s). Otherwise it runs its own Gearbox from the snapshot, which is what the cook hears.

**Road and body.** Tyre roar and wind rise with speed. Gravel crunch plays off-road (a sparse-click buffer looped at a speed-scaled rate). Bumps trigger rattles, creaks and lab glassware clinks. Brakes squeal on hard deceleration below 9 m/s.

**World.**

- **Sirens.** Car sirens play for cop, cop_suv, interceptor and rhino. Motorbike cops get a yelp variant plus a bike buzz.
- **Proximity loops.** Heli rotor, steam hiss (`steam_leak`, plus `fx.fog`), water gush (`water_main`), tornado roar by distance, parade crowd with marching drums at 112 bpm and a brass pad, car-wash brushes and spray, and gentle cattle moos every 3.5–8 s.
- **Bells.** The crossing bell and the drawbridge bell (a drawbridge set-piece active within 320 m).
- **Hose.** Hose spray plays while `stop.roof.spray`.
- **Event sounds.**
  - `EV.canister` flash: a bang, ringing, and a 1 s muffle that lowpasses the whole mix.
  - `EV.canister` foam: a splat with fizz.
  - `EV.roofHit`: firecracker crackle, a balloon or hose splash, or a flare whoosh.
  - `EV.stopParked`: a clunk.
  - Horn: a two-tone air horn with an attack "blat".

**CPU.** The mix uses one shared looping noise source and about 45 native nodes. Idle loops sit at gain 0.

## Snapshot fields read

- `phase`, `garage.items.engine`
- `rv.{x,y,z,yaw,pitch,roll,speed,steer,hp,airborne,nitro,onRoad,zone,regen,roofDoc}`
- `feel.{bump,latAcc}`, `fx.{fog,flash,shock}`, `weather`, `lab.fire`
- `stop.{id,name,state,shopT,shopMax,progress,blocked,roof.{active,spray}}`
- `nearStop.{id,name,dist,side,z}`, `looted`, `closed`
- `timeOfDay`, `area.{id,name}`, `setpieces[].{type,phase,inside}`
- `ents` (cop kinds, moto_cop, heli, crossing_gate, steam_leak, water_main, tornado, parade_float, band_member, cow, flashbang)

Events read: `setpiece`, `canister`, `roofHit`, `stopParked`, `shopResult`, `heatDrop`, `regen` (state comes from `rv.regen`) and all the old ones.

## Performance (headless SwiftShader, 1280×720; `view.stats.calls` = the main pass only)

| Scene | Main view draw calls | One mirror pass | Triangles (main) |
|---|---|---|---|
| Downtown 3.6 km | 91 | 33–34 | 201 k |
| Downtown, real steam leak (7.7 km) | 107 | 45 | 245 k |
| Old Town 9 km | 104 | 41 | 283 k |
| Supply stop lot (loading, chips) | 91 | 41 | 191 k |
| Interstate 21 km (cop in the mirror) | 69 | 32 | 173 k |
| Interstate, head turned left | 48 | 33 | 162 k |
| Salt flats with tornado (36.3 km) | 82 | 44 | 196 k |
| Phone 390×844 portrait | 62 | 0 (no mirror on screen → skipped) | 172 k |
| Cook rear camera (no FP) | 41 | — | 126 k |

- **Cab cost.** The cab adds 12 draw calls and 4.2 k tris, plus 1 for the fog quad when it is visible.
- **Mirror rate.** At most one mirror pass runs per frame (round-robin, budgeted at 20 Hz per visible mirror). A frame costs at most main + 30–45 calls, and on average about two-thirds of that at rest.
- **Mirror savings.** Mirror passes skip the shadow-map refresh (`shadowMap.autoUpdate = false` for the pass) and the cab itself. They use a 150 m far plane; 190 m measured the same 31–34 calls downtown, because nearby chunks dominate and the far plane is only a cap. They are skipped while the glass is outside the driver's view frustum and during the look-around. At rest the passenger mirror sits just outside the 76° view, so only the driver's and centre mirrors render. The pass budget scales with the number of visible mirrors, so each stays at about 20 Hz and only about 40 passes run per second. Turning the head right brings the passenger mirror in, and on portrait screens no mirror is on screen.
- **Render targets.** Side mirrors are 132×256 and the centre mirror 320×89.
- **Budget levers.** If a budget is tighter, use `new FirstPersonDriver(view, data, { mirrorHz: 12, mirrorFar: 110, mirrorScale: 0.75 })`.

## Tests

- `fp-test.html` runs WorldView, FirstPersonDriver, Hud and audio on a real GameSim with the Autopilot. The Autopilot's `autoShop` stands in for the ShopChallenge. If the sim fails to start, a scripted drive takes over.
- **Query parameters:**

  | Parameter | Effect |
  |---|---|
  | `?z=` | Start position |
  | `?fx=fog\|flash\|shock` | Windscreen effects |
  | `?look=1` | Start a look-around |
  | `?head=left\|right\|up` | Turn the head |
  | `?cop=1\|left\|right` | A chasing cop glued behind the RV |
  | `?can=flash\|foam` | A canister ahead |
  | `?banner=1` | Force the STOP AT banner |
  | `?caption=<kind>` | Fire a set-piece caption |
  | `?stop=parked\|shopping\|returning\|loading\|blocked`, `?roof=1`, `?regen=1` | Fake stop and RV states |
  | `?tod=` | Time of day |
  | `?end=win\|lose` | End screen |
  | `?role=cook` | The cook strip on the rear camera |
  | `?garage=1` | Stay in the tutorial, so FP must be off |
  | `?stopin=1&shopwait=s` | Real stop flow |
  | `?fov=`, `?pitch=` | View tuning |
  | `?nofp`, `?fake=1`, `?manual=1`, `?shot=1` | No FP, scripted drive, manual frames, hide the debug bar |

- **`window.__fp`:** `advance(sec, fdt, draw)`, `frame()`, `settled()`, `stats()` (draw calls, mirror calls, mode, gearbox), `setFx()`, `head()`, `look()` and `event()`.
- **Results:** zero console errors in every scenario. `npm run test:sim` was untouched by this agent.
- **Audio:** the full graph builds after `unlock()` in a live context, and every SFX path runs without errors. `renderEngineOffline` shows the pitch tracking rpm exactly: 650 rpm → 43.5 Hz (firing); 2000 / 3000 / 4000 / 5200 rpm → 16.7 / 25.1 / 33.4 / 43.4 Hz (the rpm/120 cycle lope). RMS rises with throttle and rpm: 0.087 at idle with the throttle closed, 0.22 at idle with full throttle, and 0.31 at 5200 rpm. The live sweep reads cycleHz 5.45 → 37.5 for 650 → 4500 rpm, with the lowpass going 1.1 k → 2.6 k and the whine 154 → 970 Hz. After a flashbang the muffle is at 320 Hz.
- **Screenshots:** `docs/x-fp-*.png`.

## Unity notes
- **Cab and camera.** The cab is a child of the RV transform. The camera is a child at the eye, with yaw π + head yaw and pitch −0.16 + head pitch.
- **Gauges and wheel.** Drive `localRotation = Euler(0, 0, angle)` on the needle, wheel and wiper nodes. Check the sign once, because handedness flips Z.
- **Mirrors.** Three cameras feed RenderTextures (tiling X −1, offset 1) and render round-robin. The centre one is a rear-roof camera.
- **Gearbox.** Port `gearbox.js` 1:1 into a MonoBehaviour; both the needle and the engine AudioSource pitch read it.
- **Engine sound.** Bake the PeriodicWave into a one-cycle AudioClip, loop it, set `pitch = (rpm/120) / clipFreq`, and use a low-pass filter for throttle.
- **Windscreen.** The fog is a material on a quad in the windshield plane with a runtime Texture2D. Wipers clear it in UV space.
