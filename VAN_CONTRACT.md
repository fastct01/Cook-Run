# Cook & Run — 3D Van Lab contract (read CONTRACT.md first, then this)

**Change of design:** the Cook no longer plays a flat 2D panel. Cooking happens **in 3D inside the RV**:
Doc (the cook character) walks around the lab in the back of the moving van and cooks at physical
stations. The camera is a cut-away "dollhouse" view over the van (roof removed, near walls cut low)
so you see the interior *and* the road, traffic and chasing cops around the van. When Doc works a
station, the camera eases into a close-up of that station and the step is played with the mouse on
3D props (stir the pot, turn the gas knob, pour from the bottle, tilt the ice tray, snap crystal
shards, hammer nails). All chemistry stays fictional (lab.json).

The existing logic is reused unchanged in spirit: `CookLab` (state machine, hazards, protocol) and the
minigame classes in `public/js/cook/minigames/*` (step logic, scoring). The 2D `CookUI` stays as a
fallback (`?lab2d=1`) — don't delete it.

## Coordinates
`public/js/data/van.json` holds the layout in **RV-local metres**: origin = RV model origin (ground centre),
+Z = front, +Y up, **+X = driver's LEFT** (the rust-red side door is on −X). In the world the interior is
parented to the RV's tilt group, so it inherits position/yaw/pitch/roll/sway automatically.

## Module layout (owners)
```
public/js/data/van.json                     layout (INTEGRATOR; agents may tune numbers, never rename ids)
public/js/van/VanLab3D.js                   Agent VANWORLD — orchestrator (see API)
public/js/van/interior.js                   Agent VANWORLD — cut-away shell, cab, furniture, station bodies, decor
public/js/van/DocController.js              Agent VANWORLD — pure logic: walking, collisions, sway/stumble, interact
public/js/van/vanCamera.js                  Agent VANWORLD — dollhouse + close-up camera
public/js/van/hazards3d.js                  Agent VANWORLD — fire, fumes haze, vent fan, curtains, extinguisher, hull holes, stash, pantry jars
public/js/van/VanHud.js, public/css/van.css Agent VANWORLD — DOM prompts, step panel, recipe board overlay
public/van-test.html                        Agent VANWORLD — harness (WorldView + fake snapshots + VanLab3D)
public/js/render/WorldView.js, rv.js        Agent VANWORLD may ADD small hooks (below); don't change existing behaviour
public/js/van/presenters/**                 Agent VANCOOK — one 3D presenter per step type + idle props
public/js/cook/CookLab.js, minigames/**     Agent VANCOOK may extend (station presence); keep 2D CookUI working
public/van-presenters-test.html             Agent VANCOOK — bench harness for presenters
docs/GAME_DESIGN.md, docs/UNITY_PORT.md     Agent DOCS — update for the 3D van lab
```

## VanLab3D API (Agent VANWORLD) — used by main.js
```js
import { VanLab3D } from './van/VanLab3D.js';
const van = new VanLab3D(view, lab, data, { canvas, hudRoot, role: 'cook'|'solo' });
await van.ready;                 // interior built (render is safe before)
van.setActive(true|false);       // true: dollhouse cam, interior visible, Doc takes WASD/mouse input.
                                 // false: interior hidden, view's normal camera (chase) restored.
van.update(dt, snap);            // every frame BEFORE view.render(dt) (snap = latest snapshot or null)
van.onKey(e, isDown) → bool      // main.js forwards keydown/keyup while active; return true if consumed
van.destroy();
van.docState                     // 'idle'|'walking'|'working'|'stumbling'|'down'
```
- `data` = `{ route, lab, rules, van }` (main.js adds `van.json` to the data object).
- Input while active: **WASD / arrows** walk, **E or Space** interact / work, **Esc or Q** step away
  from a station, mouse **click on floor** = walk there, **click a station** = walk there and use it,
  mouse drag during work = played by the presenter, **mouse wheel** = zoom levels. Touch = tap/drag.
- Station behaviour: `recipe` opens the recipe board overlay (choose a batch → `lab.requestRecipe(id)`);
  `pantry` shows the ingredient counts (3D jars whose fill = count; tooltip/overlay list);
  step stations (`grind measure stove cool break hammer`) start working the current step if it belongs
  there (otherwise prompt "Not needed right now" / "Next step: Stove"); `vent` → `lab.toggleVent()` and
  the extractor fan spins / smoke out; `curtains` → `lab.toggleCurtains()` and every window's curtain
  slides; `extinguisher` → Doc grabs it (carried in hand), then holding E / mouse near the fire sprays
  (`lab.useExtinguisher()` once per press, plus `lab.extinguish()` while held); without the extinguisher,
  pressing E next to the fire beats it with a towel (`lab.extinguish()`); `stash` shows bags carried.
- The **next station** is highlighted (floor ring + bouncing arrow). Doc can't work while `lab.cookDown`
  (he lies on the floor for the countdown) — show it in 3D.
- Van motion (`snap.feel`): lateral acceleration pushes Doc across the aisle, big bumps make him hop or
  stumble (drops the extinguisher). While working he holds the counter (less push).
- Driver seat: Rook (createModel('driver')) sits in the cab, hands on a steering wheel that turns with `rv.steer`.

## Presenter API (Agent VANCOOK) — consumed by VanLab3D
```js
import { createPresenter, buildIdleProps, STEP_STATION } from './van/presenters/index.js';
STEP_STATION  // { grind:'grind', measure:'measure', heat:'stove', stir:'stove', cool:'cool', break:'break', hammer:'hammer' }
const idle = buildIdleProps(stationId);         // THREE.Object3D resting props for that station (or null)
const p = createPresenter(stepType, { anchor, lab, game, step, recipe });   // game = lab.current
p.update(dt, { feel, active })     // active = Doc is working at this station right now
p.pick() → Object3D[]              // meshes to raycast
p.pointerDown(hit) / p.pointerMove(hit) / p.pointerUp(hit)   // hit = { local: Vector3 (anchor space), object } | null
p.key(code, isDown) → bool         // optional keyboard play (e.g. heat: A/D or ←/→ turn the knob; stir: hold E…)
p.camera() → { pos, target, fov }  // close-up pose in ANCHOR space
p.hint                              // short control hint for the HUD ("Drag in circles over the pot")
p.dispose()
```
**Anchor frame** (an Object3D VanLab3D creates per station and passes in): origin at the front-centre edge of
the work surface; +Y up; **+Z points from the counter toward Doc** (into the aisle); +X = Doc's right when he
faces the counter. Counter top is y = 0, usable area x ∈ [−0.45, 0.45], z ∈ [−0.6, 0]. For the wall station
`hammer`, the patch is on the vertical plane z = −0.6 (y from 0 to 0.9 above the anchor). Doc stands at
about (0, −0.95, +0.4) facing −Z. While idle (no step there), VanLab3D shows `buildIdleProps(stationId)`;
while a presenter is alive, VanLab3D hides the idle props of that station.

## CookLab extension (Agent VANCOOK)
Add station presence without breaking the 2D UI:
- `lab.setPresenceMode('any'|'station')` (default `'any'` = old behaviour, 2D UI).
- `lab.setPresence(stationId|null)`; `lab.stationForStep(type)`; `lab.awayFromStation` (bool).
- In `'station'` mode: pointer input only reaches the minigame when Doc is at the step's station; while away,
  the `heat` step keeps simulating (the burner stays on — temperature drifts, fire can start), all other step
  types pause. Fumes/fire hazards always run.

## Style
Same as CONTRACT.md: stylised low-poly, grounded, muted palette (reuse `public/js/assets/palette.js` and the
`models/kit.js` helpers). Interior palette: worn wood-veneer cabinets `#8a6a4a`, stained cream walls `#e2d8bf`,
teal vinyl floor `#3f6f6b` with a checker, steel `#9aa3a8`, rust `#9c4a32`, mustard accents `#d9a83a`,
product teal `#7fd6c2`. Warm interior lights (a strip light + point light), readable from the dollhouse cam.
Performance: interior ≤ 120 draw calls (merge static furniture), WorldView total for the cook ≤ 300.

## Testing tools
Static server: `cd public && python3 -m http.server <port> &`. Headless Chromium via Python Playwright with
`args=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']` — rendering is ~1–3 fps in software,
so script interactions with small waits and look at screenshots with the Read tool. Zero console errors.
