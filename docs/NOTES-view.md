# Agent VIEW — notes for the integrator

Owned files: `public/js/render/**`, `public/js/ui/hud.js`, `public/css/hud.css`, `public/view-test.html`.

## Quick start
```js
import { WorldView } from './js/render/WorldView.js';
import { createAudio } from './js/render/audio.js';
import { Hud } from './js/ui/hud.js';

const audio = createAudio();                       // lazy: AudioContext made on first user gesture
const view  = new WorldView(canvas, data, { seed, role, audio });   // audio optional
const hud   = new Hud(hudRootEl, data, { role });
await view.ready;                                  // optional (models loaded); render() is safe before

// driver, every frame:   view.pushSnapshot(sim.snapshot(), { interpolate: false }); hud.update(snap); view.render(dt);
// cook, on SNAP arrival: view.pushSnapshot(msg.s, { interpolate: true }); hud.update(msg.s);  every frame: view.render(dt);
// key M:  audio.setMuted(!audio.muted)      horn key: audio.horn(true/false)  (or the sim's horn → nothing needed)
// end:    hud.showEnd(result, { onRestart, onMenu, canRestart: role === 'driver' }); hud.hideEnd(); hud.reset() on restart
```

## Canvas sizing
- Give the canvas a CSS size (e.g. `position:absolute; inset:0; width:100%; height:100%`). WorldView reads
  `clientWidth/clientHeight`, observes it with a ResizeObserver, and also exposes `view.resize()`.
- Pixel ratio is capped at 1.75. The canvas's parent becomes `position:relative` if it was static (the view
  adds one DOM overlay sibling for the fumes haze + rear-window frame, sized to the canvas).
- HUD root: any element covering the canvas; the HUD is `position:absolute; inset:0; pointer-events:none`
  (buttons on the end screen are clickable). Include `css/hud.css`.
- Cook layout: put the view in the top part of the screen (e.g. 55–60 %) and the CookUI below. The HUD's
  cook variant is a compact top strip.

## Cook rear camera
`setCamera('rear')` (default for role 'cook') puts the camera inside the RV, ~0.9 m from the rear wall at
window height, looking BACK down the road (70° FOV) with head-bob from `feel.bump` and roll from `rv.roll`/`feel.latAcc`.
The RV body is on a separate layer and hidden from this camera. The window frame is an SVG DOM overlay
(rounded window, centre mullion, rust curtains that slide shut when `snap.lab.curtains === true`, a swinging
teal air-freshener). Chunks stream around `rv.z − 60` in this mode.

## Snapshot fields used (beyond protocol.js)
All optional; sensible fallbacks:
- `snap.weather === 'dust'` → dust storm. Without it, RV z inside route `events[type=dustStorm]` (±45 m ramp) = dust.
- `rv.onRoad === false` → full dust trail (protocol has it). `rv.nitro > 0` → flames. `rv.steer` → front wheel yaw.
- `rv.pitch/roll` applied; visual sway/accel-pitch is added on top (small, spring-damped).
- `snap.lab.{ventOpen, cooking, fumes, fire, curtains}`, `snap.feel.{bump, latAcc}`, `snap.alert.copClose`.
- `snap.stop`, `snap.nearStop`, `snap.bridge.{dist, speedNeeded}`, `snap.heat`, `snap.bust`, `snap.score`, `snap.inv`.
- Looted stops are tracked from `stopDone` events (view + HUD). Restart → recreate the view or call `hud.reset()`.
- Event fields used: pedHit/crash/smash/copWreck `{x,z}`, crash `power`, landed `hard`, stopDone `{id,gives}`,
  stars `{stars}`, gadget `{gadget,x,z}`, train `{state}`, msg `{text,tone}`, biome `{name}`, end `{result}`.

## Entities
- Pooled per kind+variant, created on first sight; **hidden as soon as absent** (vehicles/peds linger 0.2 s to
  bridge a dropped snapshot), recycled after 1 s.
- Every animated model is baked into ONE geometry with a small rig shader (wheels / limbs / rotors / gate arm /
  lights rotate around their pivots via uniforms) ⇒ 1 draw call per entity. Named parts from ART are honoured:
  `wheel_fl/fr/rl/rr`, `leg_l/r`, `arm_l/r`, `head`, `rotor`, `tail_rotor`, `arm`, `light_red*`, `light_blue*`,
  `light_brake*`, `window_glow`, `blades`, `door`; empties `vent`, `exhaust`, `spot` are read as anchor points.
- Cop light bars flash via per-part emissive (no material cloning needed) + additive glow sprites.
- States per protocol.js: peds walk/panic(arms up)/airborne(tumble)/dazed(lying + 3 orbiting stars)/getting up;
  cops lights on in 1–3, "?" sprite in 2, wobble in 3, dark tint + smoke in 4, lights off in 5;
  heli rotor + transparent spotlight cone + ground disc aimed at the RV; smoke_cloud puffs grow/fade by age;
  oil_slick scales by age; falling_rock in the air draws a growing shadow on the road; tumbleweeds roll;
  knocked props tumble (hydrants/sprinklers spray).

## Models / ART integration
`render/models.js` dynamically imports `../assets/index.js` (`createModel`, optional `KINDS_3D`, optional
`preloadAssets()` awaited ≤ 4 s). Any kind missing from KINDS_3D, a builder that throws, or a failed import falls
back to `render/fallbackModels.js` (one console.warn per failing kind). Static scenery protos are baked into chunk
batches (opaque Lambert/Standard/Phong/Basic → vertex colour + per-vertex emission, one shared material; textured
or transparent materials keep their own material/draw call). Entities use the rig (see above); hidden named meshes
like ART's RV `window_glow` (transparent MeshBasic) are kept as per-instance toggleable extras.
Verified against ART's real `assets/models/vehicles.js` (via the test shim) — see `docs/view-art-vehicles-*.png`.
Test hooks: `view-test.html?assets=./test/artVehicles.js` (ART vehicles + fallbacks) or `./test/mockAssets.js`
(ART-style materials incl. a throwing builder) — both live in `render/test/` and are not used by the game.

## Performance (headless SwiftShader, 1280×720, fallback models)
| preset | draw calls | triangles |
|---|---|---|
| 300 city chase | 84–87 | 82 k |
| 2000 suburbs | 71 | 71 k |
| 3550 train | 56 | 60 k |
| 5000 desert | 68 | 64 k |
| 5400 dust | 65 | 64 k |
| 6150 canyon | 63–67 | 64 k |
| 6305 jump | 52 | 60 k |
| 6900 sell | 40 | 41 k |
| cook rear | 44–47 | 55–68 k |
| 300 with ART vehicles | 87 | 95 k |
Static scenery is merged per chunk (5 meshes/chunk: ground, decals, markings, props, near/far scenery);
particles are 2 instanced draw calls total. Full-route drive: geometry count flat (~65–75), no leaks.
Chunk build 5–35 ms in software GL, time-sliced (≤ ~7 ms budget/frame, nearest first).

## Test harness
`public/view-test.html?z=300|2000|3550|5000|5400|6150|6305|6900|drive|zoo[&role=cook][&cam=rear|chase|cinematic]`
Extra: `&hud=load|blocked|bust|countdown|fumes|fire`, `&end=win|lose`, `&toast=1`, `&start=<z>&speed=<m/s>`, `&free=1`.
Keys: C cycle camera, M mute, H horn, P pause, F unfreeze the preset, X end screen. `window.__view`, `__hud`,
`__stats()`, `__advance(sec)`, `__settled()`.
