# 3D van lab — notes for the integrator (Agent VANWORLD)

The cook now plays inside the RV: Doc walks around a cut-away "dollhouse" lab in the back of the
moving van and works physical stations. Presenters for each step (the 3D props you play with the
mouse) come from Agent VANCOOK (`public/js/van/presenters/**`). They are loaded dynamically, and a
placeholder is used if they are missing.

## Files (VANWORLD)
| File | Role | Unity analogue |
|---|---|---|
| `public/js/van/VanLab3D.js` | Orchestrator: builds everything, input, station logic, presenter lifecycle, extinguisher, HUD state | `LabController` MonoBehaviour on the RV prefab |
| `public/js/van/interior.js` | Cut-away shell, cab + Rook, furniture, decor, station anchors, named dynamic parts | the lab **prefab** (static MeshRenderers + empty anchor transforms) |
| `public/js/van/DocController.js` | Pure logic: walking, click-to-move pathing, collision, sway, stumble/hop, cook-down state | `CharacterController` script (`Move()` with the same velocity model) |
| `public/js/van/vanCamera.js` | Dollhouse camera (with zoom) plus station close-ups | **Cinemachine**: two virtual cams and a 0.5 s EaseInOut blend |
| `public/js/van/hazards3d.js` | Fire, fumes haze, vent fan/louvers, curtains, cop wash, extinguisher spray, explosion, stash bags, pantry jars, hull holes, stars | `LabHazards` (ParticleSystems in local space, one Light) |
| `public/js/van/VanHud.js`, `public/css/van.css` | DOM overlay: prompts, step panel, Recipe Board, pantry, meters, toasts, result card, cook-down banner | UI Toolkit document |
| `public/van-test.html` | Harness | — |

Hooks added to `render/WorldView.js` and `render/rv.js` (additive; behaviour is unchanged while unused):
- `view.rvAnchor`: a `THREE.Group` in the RV-local frame (the same transform as the RV model origin). It is a child of the RV's tilt group, so it inherits position, yaw, pitch, roll and sway. It is set once `view.ready` resolves.
- `view.setCameraController(ctrl|null)`: while it is set, `ctrl.update(dt, camera, snap)` replaces the built-in rig inside `render()` (called right after the RV pose update, before entities, fx and env). The cook's rear-window SVG overlay is hidden while a controller is active. Clearing it snaps the built-in rig back.
- `view.setVanMode(bool)`:
  - hides the baked RV body (`rv.inst.root.visible = false`), which removes it from the main camera **and** the sun shadow pass;
  - shrinks the shadow frustum to ±34 m for crisper interior shadows (restored to ±60);
  - centres the sun, shadow focus and fog 6 m behind the van and chunk streaming 30 m behind it, so chasing cops are lit and built;
  - suppresses the exterior window fire-glow sprite.
- `rv.ventOverride` (a Vector3 in RV-local space or null): where vent and fire smoke leave the van. In van mode this is the interior's extractor fan.
- `rv.suppressGlow` is used internally by `setVanMode`.

The driver's chase view is unchanged. `view-test.html?z=300` gives the same framing and draw calls as before (107 calls, see `docs/view-real-300.png`).

## VanLab3D API (as in VAN_CONTRACT.md)
```js
import { VanLab3D } from './van/VanLab3D.js';
const van = new VanLab3D(view, lab, data /* {route, lab, rules, van} */, { canvas, hudRoot, role: 'cook'|'solo' });
await van.ready;            // interior built; view.render() is safe before
van.setActive(true|false);  // dollhouse cam + interior + HUD + input  |  view's own camera, RV body back
van.update(dt, snap);       // every frame BEFORE view.render(dt); snap = latest snapshot or null
van.onKey(e, isDown) → bool // forward keydown/keyup while active; true = consumed (preventDefault it)
van.destroy();
van.docState                // 'idle'|'walking'|'working'|'stumbling'|'down'
```
Extras:
- `van.active`
- `van.built`
- `van.cam.zoomBy(±1)` / `setZoomIndex(i)`
- `van.reloadPresenters()`
- `van.doc` (the DocController)
- `van.it` (the interior: `anchors`, `parts`, `stationById`, `dims`)

### What main.js must do
1. Add `<link rel="stylesheet" href="css/van.css">`.
2. Create the lab and the van:
   ```js
   this.lab = new CookLab(...);
   this.van = new VanLab3D(this.view, this.lab, data, { canvas, hudRoot: $('hud'), role });
   ```
   Then call `this.van.setActive(true)` for the online cook. For solo, call it when the player switches to the lab (for example the existing Tab toggle), and `setActive(false)` when they go back to driving.
3. The `?lab2d=1` fallback keeps the old `CookUI` and doesn't create a `VanLab3D`.
4. Every frame:
   ```js
   lab.applySnapshot(snap)   // as now
   lab.update(dt)
   van.update(dt, lastSnap)
   view.render(dt)
   ```
   Keep the existing `getLabState()` / `setLabState()` / command plumbing exactly as it is.
5. Keyboard. While `van.active`:
   ```js
   addEventListener('keydown', e => { if (van.onKey(e, true)) e.preventDefault(); })
   ```
   Do the same for `keyup` with `false`. In **solo**, don't feed WASD to `DriverInput` while the lab is active: the autopilot (or a parked RV) drives meanwhile. Esc is consumed only when Doc is at a station or the board or pantry is open; otherwise it falls through to your pause menu.
6. Online cook: `role: 'cook'` WorldView as now. The rear camera mode stays set underneath, but the controller overrides it.
7. Set `role: 'solo'` for solo play (currently informational).
8. On session end, call `van.destroy()` before `view.destroy()`.

VanLab3D calls `lab.setPresenceMode('station')` for as long as it exists. While inactive in solo, Doc is at no station, so steps pause (the burner keeps going). It calls `lab.setPresence(id|null)` whenever Doc starts or stops working a step station. On `destroy()` it calls `lab.setPresenceMode('any')`. All of these calls are guarded with `typeof`.

## Controls
| Input | Action |
|---|---|
| **WASD / arrows** | Walk, relative to the screen. Moving also steps away from a station and closes the board/pantry |
| **E / Space** | Use the nearest station (step stations rank first, then the board when idle). Next to a fire: beat it with a towel. Carrying the extinguisher: hold to spray (one charge per press via `useExtinguisher()`, plus `extinguish()` every 0.4 s while held and near the fire); next to the bracket, E hangs it back |
| **Q / Esc** | Step away from a station, close the pantry, or put the extinguisher down |
| **1–7** | Recipe Board: pick a card (Products → Gadgets → Repairs). Esc closes; clicking the backdrop closes |
| **Mouse click** | On the floor: walk there (pathing along the aisle). On a station: walk there and use it |
| **Mouse drag** | While working: goes to the presenter (ray hits in anchor space; falls back to the work plane). With the extinguisher in hand: press on the fire or next to Doc to spray |
| **Wheel** | Zoom levels (`camera.zoomLevels`). Zoomed in, the look-at drifts toward Doc |
| Touch | Pointer events: tap = click, drag = drag |

Station behaviour:
- **Recipe Board**: overlay with have/need counts, Cook buttons and a two-click "Dump batch".
- **Pantry**: popover list, and the 3D jar fill shows the count (max 4).
- **Vent**: `toggleVent`. The fan spins up, the louvers open and smoke is pulled out through the fan.
- **Curtain cord**: `toggleCurtains`. Every curtain slides.
- **Extinguisher**: grab or hang back. A big bump while carrying drops it on the floor; E near it picks it up.
- **Stash**: toast with bags, the target and quality. Bags appear in the crate up to `inv.units`.
- **Step stations**: start working if the current step belongs there. Otherwise the prompt reads "Not needed · Next: Stove →".

The next station gets a pulsing mustard floor ring and a bouncing arrow (orange during a fire, pointing at the extinguisher or stove).

## Layout (van.json, RV-local; I tuned numbers but renamed no ids)
Measured from ART's `buildRV()`:
- coach box z −4.28..2.0
- body bottom y 0.6
- roof 3.11
- outer half-width 1.27
- cab z 1.7..4.3, windshield base (3.32, 1.38)

New and changed numbers:
- `rv.cabPartitionZ` 2.15
- `rv.ceilingY` 3.0
- `rv.cutHeight` 1.05
- `rv.counterDepth` 0.63
- cab seats and steering wheel moved behind the windshield
- recipe board z 2.11
- the pantry is a tall shelf against +X
- stash z −3.83
- `walkable` now describes the allowed positions of Doc's **centre** (aisle ±0.34, rear pockets, door pocket)
- dollhouse camera `pos (−6.0, 9.2, −0.7)`, `target (0.25, 0.4, −2.8)`, fov 50, zoom levels `[0.7, 0.85, 1.0, 1.3]`

The camera sits on the **−X (door) side, level with the middle of the van, looking back across it**. That way the road behind and the chasing cops are in frame, which they can't be from a camera behind the van. The near walls (−X and rear) and the cab partition are cut at 1.05 m with a dark cap, so the camera never clips geometry. The far +X wall is full height with curtained windows, the strip light, the fan, string lights and a calendar. There is no roof, only a rim.

Anchor frames follow VAN_CONTRACT exactly:
- origin at the front-centre edge of the work surface;
- counter top y = 0 (0.95 m above the floor);
- +Z toward Doc;
- wall stations sit 0.6 m off the wall, with the plane at z = −0.6.

The hull-patch station sits in a full-height wall section on the −X side, with a riveted panel and holes plus light shafts that appear as `rv.hp` drops (< 97 the panel, then holes at 90/75/60/45/30). The shafts are hidden during close-ups.

Doc: `createModel('cook')` × 0.92, with procedural limb swings:
- walk cycle
- reaching and working arm motion that varies by step type (stir circles, hammer swing)
- towel beating and curtain pulling
- stumble flail
- hop on small bumps
- lying on his back with circling stars while `lab.cookDown`

He is hidden while a close-up is in, because the camera sits about where his head is.

Rook: `createModel('driver')` posed seated, hands on a steering wheel that turns with `rv.steer`.

## How presenters plug in
- On `ready`, `import('./presenters/index.js')`. Each step station gets `buildIdleProps(stationId)` on its anchor.
- When Doc starts working a station that matches the current step: `createPresenter(step.type, { anchor, lab, game: lab.current, step, recipe })`. The idle props are hidden.
- The presenter stays alive while its minigame is `lab.current`. `update(dt, { feel, active })` gets `active = Doc is working there`, so the heat presenter keeps showing the burner when he walks off.
- It is disposed when the step changes, the batch ends or the lab goes idle. It is re-created when Doc comes back for the next step.
- Camera: `p.camera()` (anchor space) eases in over 0.5 s, and the close-up is then rigid with the van. With no presenter, `FALLBACK_CLOSEUP` is used.
- Pointer: rays hit `p.pick()`. A miss falls back to the counter plane y = 0, or the wall plane z = −0.6 for `hammer`, as `{ local, object: null, plane: true }`. `p.key(code, isDown)` gets first dibs on keys while working.
- The HUD shows `p.hint` under the minigame instructions.
- If the module is missing or `createPresenter` throws, a glowing placeholder box drives `lab.current.pointerDown/Up(0.5, 0.5)`.

Tested with VANCOOK's real presenters:
- measure: hold the bottle until in band (real mouse);
- hammer: click nails via `debugTargets()` (real mouse);
- stove (heat, then stir) / cool / break: work the station and finish the step.

## Harness: `public/van-test.html`
- `?z=300|2000|3550|5000|5400|6150|6305|6900|drive` runs FakeSnapshots with a moving van. `&cops=9,17` adds patrol cars N metres behind with lights on.
- `?sim=1[&skip=40]` runs the real GameSim and Autopilot (real latAcc, bumps and inventory; `startRecipe` goes through `sim.applyCookCommand`).
- Script flags:
  - `?fire=1|0.6`
  - `?fumes=1|0.9`
  - `?cop=1`
  - `?down=1`
  - `?hp=40`
  - `?at=stove[&work=1]`
  - `?run=street`
  - `?board=1`
  - `?carry=1`
  - `?vent=1`
  - `?curtains=1`
  - `?zoom=0..3`
  - `?sway=1` (strong ±6.5 m/s² cornering)
  - `?units=8`
  - `?role=driver` (Tab toggles `setActive`, like solo)
  - `?shot=1`
  - `?dt=`
- Keys: Tab toggles lab and driving, B bumps, P pauses. The debug bar has fire, bump, cop, KO, fumes and stock buttons.
- Globals:
  - `__van`, `__lab`, `__view`, `__host`, `__gen`, `__sim`
  - `__advance(sec)`, `__pause(bool)`, `__stats()`, `__settled()`
  - `__bump(power, sec)`
  - `__key(code, down)`

Fake host: `startRecipe` is approved in the next snapshot (`recipeOk`, ingredients deducted), as in `cook-test.html`. `recipeDone` adds units, gadgets or repairs; repairs also heal `?hp`.

## Verified (headless Chromium + SwiftShader, 1280×720, zero console errors)
- Keyboard walk; click-to-move to the stove; click the board, overlay, Digit1 starts a Street Batch.
- Walked to measure, stove (heat then stir without leaving), ice bath and bagging bench in order. Presence, presenters and close-ups followed each step; batch done with +2 units in the stash.
- Vent toggles (fan to about 19 rad/s, louvers open). Curtains close and the red/blue cop wash shows through the windows.
- Grab the extinguisher; click on a fire from across the van and Doc walks over; hold to spray puts out a 0.55 fire. Hang it back. Beat a fire with the towel (E ×3).
- Big bump (0.9): stumbling, the extinguisher drops, then idle. Small bump (0.45): hop. Pick it up off the floor.
- Fumes haze plus a screen tint above 0.6. Cook-down: Doc lies down with stars and recovers after 12 s. Hull holes at hp 30. Explosion flash.
- Real sim: the sim approves and deducts the batch; |latAcc| up to 7.6 m/s² pushes Doc toward the outside of the turn.
- Tab toggling restores the driver's chase view, RV body and roof-chimney smoke. destroy() then re-create is clean.

## Performance (draw calls, `view.stats.calls`, including shadow passes)
| scene | calls | tris |
|---|---|---|
| dollhouse, city z=300 + 2 cops | 98–109 | 105–125 k |
| dollhouse, desert z=5000 + cops | 104–107 | 126–137 k |
| dollhouse, canyon z=6150 | 98 | 98 k |
| station close-up (stove / measure / cool / hammer) | 52–70 | 105–128 k |
| driver chase z=300 (unchanged) | 107 | 194 k |

- Interior share: about 65 visible meshes (31 shadow casters), roughly 70 calls including Doc, Rook, idle props and shadows. That is within the ≤ 120 budget, and the cook view stays well under 300.
- Static furniture is 4 merged Kit meshes: shadow-casting low shell, non-casting tall shell, unlit glow, glass.
- Wheels, jar contents, stash bags, flames and burner flames are InstancedMeshes.
- Van particles are 2 draw calls (van-local billboards).
- Lights: one warm PointLight and one fx PointLight (fire, cop or explosion), both short range and always present, so switching between them never recompiles shaders.

## Known limits / ideas
- In the interior the side door is at z −0.55..0.35 (van.json's door pocket). On the exterior RV model it is at z 0.5..1.3; only the interior is visible in van mode.
- The cop wash only shows through the +X windows and the rear window; the −X wall is cut below window height.
- Doc's body push from cornering uses `snap.feel.latAcc` (= speed·yawRate from the sim). Positive latAcc (turning left) throws him toward −X.
