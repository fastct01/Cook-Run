# Roof defence — notes (Agent ROOF)

While Rook is in a shop at a supply stop, the cook makes Doc climb out of the lab's roof hatch and hold the cops off from the RV roof with a water hose, firecrackers, paint balloons and a red smoke flare. In solo, an AI Doc does it.

## Files

| File | Role | Unity |
|---|---|---|
| `public/js/sim/roof.js` | `RoofDefence`: sim logic (pure, deterministic). Enter/leave/climb, hose cone, throws, ammo, solo AI, `state()` | `RoofDefence` MonoBehaviour on the RV (host) |
| `public/js/van/roof/RoofDefence.js` | `RoofClient`: the cook's roof mode inside `VanLab3D` (state machine, input, aim maths, network commands, HUD feed) | `RoofDefenceClient` on the lab prefab |
| `public/js/van/roof/roofScene.js` | RV-local props: hatch (lid), ceiling beams, fold-down ladder, stop highlight, roof rack, `water_hose`, `water_tank`, `doc_roof`, range rings, throw preview, hose stream | RoofRig prefab |
| `public/js/van/roof/roofCamera.js` | Over-the-shoulder camera with blends to and from the dollhouse `VanCamera` | Cinemachine 3rd-person vcam |
| `public/js/van/roof/roofFx.js` | World-space FX: projectiles, firecracker sparks + "BANG!", paint splat decal + droplets, red flare smoke, hose splashes | pooled prefabs + ParticleSystems + decal |
| `public/js/van/roof/RoofHud.js` | DOM: stop banner, crosshair, device bar, stop status/loading bar, cop markers, hit pops, legend, touch buttons. It injects its own CSS (`.rf`) | UI Toolkit |
| `public/js/van/roof/mockStopSim.js` | Mock of the GameSim helper API around one stop. Used by the tests and the harness | — |
| `public/js/van/roof/test/roof-headless.js` | Node unit tests | — |
| `public/roof-test.html` | Browser harness | — |
| `public/js/van/VanLab3D.js` | **Additive** `[roof hook]` lines only (see below) | — |

## Sim API (`sim/roof.js`)

```js
import { RoofDefence } from './roof.js';
const roof = new RoofDefence(sim);
roof.command(cmd);   // CMD.ROOF_ENTER / ROOF_LEAVE / ROOF_AIM {yaw,pitch,spray} / ROOF_THROW {device,x,z}
roof.update(dt);     // every tick of phase 'drive' (it is safe in any phase)
roof.state();        // → snap.stop.roof
roof.active;         // Doc is up there or climbing
roof.roofDoc;        // Doc is visible on the roof from outside (climb > 0.5)
```

`state()` is plain JSON:

```
{ active, climbing, climbDir: 'up'|'down'|null, climb: 0..1, onRoof, aimYaw, aimPitch, spray,
  ammo: { firecracker, balloon, flare }, ai: bool,
  fx: [ { id, device, phase: 'fly'|'land', x0, z0, x, z, t, T } ] }
```

- For `fx`, `phase: 'fly'` means a projectile flying from (x0, z0) to (x, z), with `t` of `T` seconds elapsed. `phase: 'land'` means a landed effect at (x, z), `t` seconds since landing, lasting `T` seconds. A firecracker lasts 1.8 s, a balloon splat 6 s, and the flare burns for `flare.seconds`.
- `climbing`, `climbDir`, `climb`, `onRoof`, `ai` and `fx` are additive keys on top of the contract shape.

Exported helpers, shared with the client so both sides use the same maths:

- `ROOF_GEOM`: hatch (0.15, −1.1), stance (0, −1.8), nozzle pivot (0, 4.2, −1.8), hand, `copAimY` 0.9, throw range 3–25 m, auto-down 3 m/s, enter < 1 m/s
- `rvToWorld` / `worldToRv`
- `nozzleWorld`
- `aimDirWorld`
- `aimAt(rv, x, z)`
- `hoseTest(rv, yaw, pitch, cop, hose)`
- `clampThrowTarget`
- `throwFlightTime(d) = 0.45 + 0.035·d`
- `ROOF_ACTIVE_STATES`, `COP_KINDS`, `DEVICES`

### Rules and decisions

- **Climbing up.** `roofEnter` is accepted in phase `drive` when the stop is `parked`, `shopping`, `returning` or `loading`. **Decision:** it is also accepted whenever the RV is (nearly) standing still (|speed| < 1 m/s and not airborne), for example stuck at a roadblock, the drawbridge or the toll plaza. Climbing takes `climbSeconds` each way, and the hose and throws only work once Doc is fully up. A `roofEnter` while he is climbing down turns him around.
- **Auto climb-down.** Doc climbs down when the stop he climbed up for ends (it becomes done or null, or the RV leaves), when |RV speed| > 3 m/s, or when the phase leaves `drive`. If he went up without a stop and the RV then pulls into a lot, he adopts that stop.
- **Hose.**
  - The cone test runs from the nozzle pivot along (aimYaw, aimPitch), both RV-local with yaw 0 = forward, against `sim.copsList()` (heli and wrecked cops excluded).
  - It hits when the horizontal distance is ≤ `hose.range` and the angle to the cop's body centre (y 0.9) is ≤ `hose.coneDeg`, read as a **half-angle**, + atan(1.1 m / dist).
  - Each cop gets one pulse every 0.25 s: `applyCopEffect(id, { soak: soakSeconds, push: {x,z} })`. **`push` is a velocity impulse in m/s** (world XZ, pointing from the RV centre to the cop) of 0.5 × `hose.push` × (1 − 0.6·dist/range) per pulse.
  - `roofHit {copId, device:'hose', x, z}` is emitted at most once per cop every 1.2 s.
- **Throws.**
  - The target is clamped to 3–25 m from the RV centre and lands after `throwFlightTime(dist)`.
  - Firecracker: `stall: stallSeconds` within `radius`.
  - Balloon: `blind: blindSeconds` (paint) within `radius`.
  - Flare: a red smoke zone of `flare.radius` for `flare.seconds` that re-applies `blind: 1.5` to every cop inside, 4 times a second.
  - `roofHit` is emitted once per cop per device.
- **Ammo.** Firecrackers and balloons are refilled to the rules ammo at every **new** stop id.
  - **Crafted-gadget bonus (keep-it-simple decision):** each oil-slick charge in `inv.gadgets` adds +1 paint balloon at refill, up to +2. The oil is not consumed.
  - The flare (`usesSmokeCharge`) consumes one smoke-bomb charge through `sim.useGadget('smoke', { x, z, place: false, source: 'roof' })`. Without that helper it decrements `sim.inv.gadgets.smoke`. `ammo.flare` in `state()` is the current smoke count.
- **Solo AI (`sim.solo`).**
  - Doc climbs up 0.8 s after the stop parks.
  - He sprays the nearest active cop, or a cop parked close by whose soak, stall or paint is about to wear off. Every 0.35 s he re-rolls his aim: with probability `rules.roof.aiAccuracy` he is inside the cone, otherwise 1.6–3 cones off.
  - He throws a firecracker when 2+ active cops are within 20 m, at the tightest cluster, or else at the cop the hose isn't on.
  - He throws a paint balloon at a lone cop inside 11 m, during the return and loading run, or at a second cop while he has more than 3 throws left.
  - Any human roof command takes over for 1.5 s, so a solo player in the van lab can grab the hose.
- **Determinism.** The AI uses its own mulberry32 RNG seeded from `sim.seed` and never calls `Math.random`. The tests check this.

## Sim hooks (SIM-CORE): already wired, verified against the real GameSim

`GameSim` imports `roof.js` and constructs it. It routes `roof*` commands to `roof.command`, calls `roof.update(dt)` in `drive`, sets `rv.roofDoc = roof.active` and puts `roof.state()` in `snap.stop.roof`.

A headless run (Autopilot to Bolt & Barrel, heat added after parking, AI on) gave this sequence:

1. The AI climbed up 0.8 s after `stopParked`.
2. It soaked both chasing cops: 24 hose hits, and both stayed in state 6.
3. The stop loaded with bonus and no bust.
4. "Doc climbs back inside" when the stop was done.

Requests for SIM-CORE (their files; none are blocking):

1. **Soaked cops should back off.** With the current `applyCopEffect`, soaked cops park 4–7 m from the RV and only stop counting for bust and block. The contract says "soaked cops stop approaching the lot and back off". Reversing away at about cop speed for the soak time would make the hose read better, and the roof AI already handles either behaviour.
2. **`snap.roof = roof.state()` at the top level, always.** `snap.stop.roof` doesn't exist when Doc went up without a stop (the stationary-RV rule). The client copes: it trusts its local state and mirrors the auto-down rules. A top-level field would make it exact. The client reads `snap.roof ?? snap.stop?.roof`.
3. **Optional:** `rv.roofDoc = roof.roofDoc` (true once Doc is half out of the hatch) instead of `roof.active` (true from the first rung).

## Client (`van/roof/RoofDefence.js` in `VanLab3D`)

### VanLab3D hooks (additive, all marked `[roof hook]`)

- **New constructor options:**
  - `sendCommand(cmd)`: cook → host. It defaults to the CookLab's own sender `lab._send`, so main.js works unchanged.
  - `roof: false` disables the roof mode.
  - `roofSpectate: true` makes the roof camera follow the solo AI defender (used by the harness).
- **Loading:** `./roof/RoofDefence.js` is imported dynamically, guarded like the presenters. If it fails, the lab works without the roof.
- **Forwarding:**
  - `update` calls `roof.update(dt, snap)`. While `roof.ownsDoc`, `_updateRoofOwned()` skips Doc's movement and stations, but the hazards, presenters (`active: false`), board texture and HUD keep running, so the lab can still catch fire under him.
  - `onKey`, the pointer handlers and the wheel go to the roof first.
  - `_applyActive` calls `roof.setActive`, and `destroy` calls `roof.destroy`.
- `docState` returns `'roof'` while the roof owns Doc. This is additive to the contract list.
- **One behaviour-preserving tweak:** Doc is hidden in close-ups only when the focus came from a station or board (`_focusKind`). The roof's ladder close-up keeps him visible.

### Modes

1. `off`: during a stop the banner reads "Rook's in the shop — get on the roof! [R]" (clickable). The hatch pulses (floor ring, bouncing arrow, glowing frame).
2. `walk`: Doc walks to the foot of the ladder. The dollhouse camera eases into a close-up of the hatch.
3. `up` (`climbSeconds`): `CMD.ROOF_ENTER` is sent. The lid flips open, the ladder unfolds and the `cook` model climbs. At about 74 % he becomes `doc_roof`, steps to the stance and turns to the nearest cop. The camera holds the close-up for the first ~42 % and then swoops to over-the-shoulder.
4. `roof`: aiming, hose and throws. `roofAim` is sent at 10 Hz and immediately when spray toggles, and `roofThrow` on each throw.
5. `down`: the reverse. `CMD.ROOF_LEAVE` is sent only when the player asked; the sim's auto-down (`climbDir 'down'`) is simply followed.
6. `ai`: the solo AI is up (`snap roof.ai`). The roof is drawn from the snapshot (climb, aim, spray, throws), with the dollhouse camera, or the roof camera with `roofSpectate`. **R** takes over.

The client trusts the sim. It aborts a climb that the snapshot shows wasn't accepted, follows sim auto-downs, and goes down on a cook-down.

### Controls (on the roof)

| Input | Action |
|---|---|
| Mouse | Aim. Free cursor = crosshair; the screen edges pan the view |
| **M** | Toggle pointer lock (mouse-look, centre crosshair). Esc leaves lock (browser) |
| Hold **LMB** / **Space** | Hose. Dragging with LMB held sweeps the stream (drag-to-aim) |
| **RMB** click / **E** | Throw the selected device at the ground under the crosshair, clamped to 25 m. An arc preview and a radius ring are always shown |
| **RMB** drag | Turn the view |
| **1 / 2 / 3** | Firecracker / paint balloon / smoke flare. The HUD buttons are clickable |
| **A D** / ← → | Turn. **W S** / ↑ ↓ pitch. **Wheel** sets camera distance |
| **R** / **Q** | Climb down. **R** again while climbing down goes back up |
| Touch | Tap or hold to spray at that point, drag to sweep. Buttons: device bar, THROW, DOWN, ◀ ▶ turn. They are shown when a touch is seen or `(pointer: coarse)` matches |

Lab view: **R**, or clicking the hatch or the banner, starts the climb. **R** while walking cancels.

### HUD (`RoofHud`)

- crosshair with a distance or "ON TARGET" label, and a water-blue ring while spraying
- device bar with ammo; client-side prediction while a throw is in flight to the host
- stop status: shopping time, "Rook is running back", "Loading N %" with a bar, and "BLOCKED — cops inside 25 m!"
- cop markers: on-screen brackets with distance and state (soaked / stalled / blind), off-screen edge arrows
- hit pops: SOAKED!, STALLED!, PAINTED!, LOST IN SMOKE!
- legend

In roof mode the van HUD's prompt, legend, step panel and pantry are hidden, and its meters move up. That is CSS in `RoofHud`, scoped to `.vh.vh-roofmode`.

### Camera

Over the right shoulder, 3.6 m behind a pivot 1.75 m above the roof, with yaw and pitch RV-local, pitch −0.95…+0.32. The hose aim is the ray through the crosshair hitting the plane y = 0.9 (car body height). The aim yaw and pitch sent to the host are measured from the same nozzle pivot the sim uses. Throws use the ray's hit on the ground y = 0. The camera is posed before the ray is cast, so there is no frame lag.

### FX

- **Stream:** 56 instanced drops on a quadratic arc from the `doc_roof` `nozzle` to the cop under the cone (client-side `hoseTest` on interpolated ents). Otherwise the stream falls short on the ground at hose range.
- **Splash:** particles at the end of the stream, and a burst on `roofHit`.
- **Throws:** the projectile models fly the same parabola as the preview.
  - firecracker: sparks, flashes, smoke and a comic "BANG!" sprite for 1.5 s
  - paint balloon: a canvas-texture splat decal in the balloon's paint colour, plus droplets, fading over 8 s
  - flare: a glowing stick, then red smoke growing to the flare radius for `flare.seconds`
- Local throws spawn immediately, and the sim's `fx` id adopts them.

Performance: the roof adds about 20–25 draw calls. Measured whole-view numbers at 1280×720 are 79–110 calls and 120–130 k triangles, within the 300 budget.

## What the integrator (main.js) must do

Nothing is required:

- `VanLab3D` loads the roof itself.
- Roof commands go out through the CookLab's sender (`onCookCommand`), so online and solo both reach `sim.applyCookCommand`.
- **R**, **E**, **1–3**, **Space**, **M** and **Q** reach it through the existing `van.onKey` forwarding.

Optional:

- Pass `sendCommand: (c) => this.onCookCommand(c)` to `new VanLab3D(...)` explicitly.
- Esc is not consumed on the roof, so it falls through to the pause menu, and the browser also uses it to leave pointer lock.

In solo the AI defends by itself while the player is in the shop. If the solo player switches to the lab during a stop, the lab shows the AI Doc on the roof, and **R** takes the hose.

## For VIEW-WORLD-B (outside view)

- Draw Doc on the roof when `snap.rv.roofDoc` is set.
- Use `snap.stop.roof.aimYaw` / `aimPitch` (RV-local, from the nozzle pivot `ROOF_GEOM.nozzle`) and `spray` for the hose stream.
- `snap.stop.roof.fx` gives the thrown devices and the flare smoke if you want the driver to see them.
- In the cook's cut-away (`view.vanMode`), the roof client draws its own `doc_roof`, rack and stream, so hide your roof Doc in van mode. Parenting it under `rv.inst.root`, which van mode hides, does that automatically.
- Cop states 6/7/8 (soaked / stalled / paint-blind) come from the entity tuples as usual. The current SPLASH!, POP-POP!, ?! and paint visuals already show in the harness alongside the roof FX.

## Tests

`node public/js/van/roof/test/roof-headless.js` (MockStopSim; real `rules.json`) passes **55/55**:

- **Frames:** the frame helpers are inverses, and throws are clamped to 3–25 m.
- **Hose cone:**
  - in-cone hit, off-cone (40°) miss, beyond-range miss
  - state 6 and exactly one `roofHit`
  - the push points away from the RV
  - the soak wears off
- **Enter rules:**
  - rejected at 12 m/s, accepted when stationary
  - climb time 1.6 s
  - auto-down at > 3 m/s and when the stop is done
  - `roofLeave`, and turning around on the ladder
  - `EV.ROOF` on/off
  - ignored while Doc is out cold
- **Ammo:** refill per stop, oil bonus, empty → rejected with a toast, the flare uses a smoke charge, unknown devices are rejected.
- **Throw effects:** nothing happens in flight; firecracker stall radius, balloon paint radius, and the flare blinds for its duration.
- **Solo AI scenario:** 30 s of shopping, then return and load; 3 cops at 6 m/s from behind, ahead and across the lot, and they keep coming back.
  - The AI climbs up by itself.
  - No bust.
  - Every cop that enters the 25 m lot ring is neutralised within 4 s (worst 2.2 s).
  - Loading finishes.
  - The undefended control is busted 20 times and never loads.
  - Over 12 seeds: 0 busts, all loaded, and no cop goes more than 3.2 s inside the ring unanswered.
  - "Keeping cops out of 25 m" is measured this way because the hose reaches only 15 m. Cops entering the ring are neutralised, which is what unblocks loading (`copBlockRadius` ignores soaked, stalled and blinded cops).
- **Determinism:** same seed → identical state and event log; a different seed gives different output; no `Math.random`.
- **Robustness:** it works on a bare sim without the helper API, and `state()` is plain JSON.

The browser harness is `public/roof-test.html` (port 8204, headless Chromium + SwiftShader, 1280×720), and the run had **zero console errors**:

- **Flow:** stop → R → walk → climb → aim → spray a cop (soaked) → firecracker (stalled) → balloon (paint) → flare (blinded) → R → climb down → back in the lab.
- **Real input:** a mouse click on the hatch starts the climb; holding LMB on a cop soaks it; **2** + **E** and an RMB click each throw a balloon (ammo 5 → 4 → 3); **R** climbs down.
- **Solo:** `?solo=1` showed the AI defender.
- **Real GameSim:** `?sim=1&solo=1&skip=600` drives the Autopilot to Bolt & Barrel, and the AI Doc climbs up (`docs/x-roof-realsim.png`).
- **Flags:**
  - `?solo=1` · `?sim=1` (real GameSim + Autopilot; with `&skip=N` it drives headless to the first stop)
  - `?shop=40` · `?cops=3` · `?copSpeed=6` · `?auto=0` · `?up=1`
  - `?stop=<id>` · `?smoke=` · `?oil=` · `?manual=1` (no real-time loop) · `?shot=1` · `?dt=`
- **`window.__roof` API:**
  - `advance(sec)`, `tick(sec)` (no draw), `key(code, down)`
  - `aimAt(x, z)`, `aimCop(i)`, `throwAtCop(i, device)`, `spray(on)`, `throw(device)`
  - `climb()`, `down()`, `startStop()`, `finishShop()`, `addCops(n)`
  - `stats()`, `settled()`, `pause()`

Screenshots are saved as `docs/x-roof-*.png`.

Also checked:

- `cook-test.html` and `van-test.html` still load and run with zero console errors.
- `npm run test:sim` still has the same pre-existing SIM-CORE failures as before these changes, with no roof errors in its output.

## Known limits / ideas

- The mock's cop AI is a stand-in; the real behaviour of soaked cops is SIM-CORE's (see request 1).
- The roof rack is a see-through slatted deck behind the hatch, because the cut-away van has no roof.
- The climb close-up camera looks from above the cab end, back down at the ladder. In very cramped lots, a shop canopy can still cross the swoop for a moment.
- The flare's smoke is cook-side FX plus blind pulses in the sim. `useGadget(..., { place: true })` could drop a real `smoke_cloud` entity instead, if the driver should see it without reading `roof.fx`.
- Pointer lock is opt-in (**M**) so the free-cursor aim works everywhere, including headless tests.
