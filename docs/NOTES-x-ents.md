# VIEW-WORLD-B — dynamic world (entities, hazards, set-piece visuals, tornado, Doc on the roof)

Owned files: `public/js/render/entities.js`, `rig.js`, `particles.js`, `fx.js`, `rv.js` (additive),
`public/js/render/ents/**`, `public/ents-test.html`.
Screenshots: `docs/x-ents-tornado.png`, `-tornado-close`, `-tornado-realsim`, `-rhino` (throw sequence),
`-steam`, `-roof` (Doc hosing a soaked cop, paint-blind SUV, stalled interceptor), `-cops` (states 6/7/8 on all
police kinds), `-zoo` (all 12 stations, every new kind), `-motion` (frames 0.35–0.5 s apart), `-scenes`
(comet, stagecoach/cowboys, combine/logs/sheep, car carrier shedding, parade).

## What the integrator / WORLD-A need to do (all optional — everything already works without them)
1. **Pass the snapshot to the entity layer** (set-piece states for the tornado, car carrier, log spill):
   `this.entities.update(snap.ents || [], dt, { rv, cam: this.camera.position, far: 420, snap });`
   Fallback today: `RvView.update()` publishes the frame's snapshot as `scene.userData.crSnap`.
2. **Forward expansion events to fx** (default branch of `WorldView._event`): `this.fx.event?.(ev, snap);`
   Handles `roofHit` flare words and `setpiece` starts. Fallback today: entity-state detection
   (canister bursts, cop states 6/7/8) and `snap.setpieces` phase changes do all of it.
3. **Storm light hook** (tornado): expose the environment as `scene.userData.env` with
   `env.setStorm(k 0..1, color)` that darkens/tints fog, sky, sun and hemi light. If present it is
   used and nothing else is touched. Fallback today (`ents/storm.js`): in `scene.onBeforeRender`
   (after `env.update`) fog/background/sun/hemi are darkened for the draw and restored in
   `scene.onAfterRender`; a translucent gradient dome around the camera darkens the sky.
   `scene.onBeforeRender/onAfterRender` are **chained**, not replaced — please chain too if you use them.
4. **Doc on the roof**: drawn from `snap.rv.roofDoc` + `snap.stop.roof` (sim/roof.js `state()`), parented under
   `rv.inst.root`, so **van mode (the cook's cut-away) hides it automatically** — ROOF's client draws its own there.
   `rv.roofDocOverride = true|false|null` forces it (null = follow the snapshot). The roof props also use the RV body's
   layer mask, so cameras that hide the RV body (cook rear view, FP cab) hide them too.
5. Protocol: no new constants were added.

## Architecture
```
entities.js  EntityView.update(ents, dt, ctx)  — pooling, lifetimes, velocity/yaw-rate estimates, LOD
  ├─ base-game kinds: the hand-written paths (unchanged behaviour; cops now go through copfx)
  └─ expansion kinds: ents/anims.js table → channels → ents/controllers.js (named) → group behaviour
       ents/copfx.js     cop lights + states 0–8 (soaked / stalled / paint-blind) for every police kind
       ents/tornado.js   TornadoView (funnel + skirt + wall cloud, debris, particles)
       ents/storm.js     StormLight (darkening near the funnel)
       ents/models.js    procedural freight_wagon (3 variants), splat texture, paint colours
       ents/atlas.js     particle atlas page 2 (cells 16–31)
       ents/testScenes.js scripted snapshots for ents-test.html
rig.js       one draw call per entity (+1 for translucent parts), hierarchy, scale/alpha, sign atlas
particles.js 2 billboard layers + 2 flat ground-decal layers (`flat: true`), shared 8×4 atlas
fx.js        comic words: popWord(text,x,y,z,{fill,burst,scale}), set-piece start words + bursts
rv.js        RV + Doc on the roof (doc_roof, roof_hatch, water_hose, water_tank) + hose arc
```

## rig.js upgrades (backwards compatible)
- `buildRigProto(root, { partRe, lightRe })` — per-kind part / light regexes (default `RIG_RE` unchanged).
  `*_mesh` nodes are never parts.
- **Hierarchy:** a part under another part inherits its transform (gorilla arms on the squashing body,
  stagecoach legs under each horse, the Rhino's canister under the lobber, cowboy rider on the horse).
  Repeated names get qualified names: `horse_1.leg_fl` (the first also keeps `leg_fl` and `horse_0.leg_fl`).
- **More parts:** ≤ 16 parts keep the small shader; up to `MAX_PARTS_BIG` = 40 (car carrier 18, logging truck 18).
- **Per-part scale + alpha:** `setScale(name, sx, sy, sz)` (0 hides: cargo cars, logs, canister in hand),
  `setAlpha(name, a)` (steam puffs), `setEuler(name, x, y, z)` (order YXZ like the assets), `resetPose()`.
- **Translucent layer:** untextured transparent materials (steam, dust rings, water jet, canopy glass) are
  baked into a second rigged mesh (normal / additive) → +1 draw call instead of one per mesh.
- **Sign atlas:** opaque CanvasTexture signs/labels of a model are packed into one per-proto atlas and baked
  into the main geometry (uv + map) → 0 extra draw calls for "POLICE", "WIDE LOAD", "FOUNDERS' DAY", canister labels.
- Extras that still can't be baked ride on per-part follower groups.
- `commit()` composes the hierarchy (also auto-run in `onBeforeRender/onBeforeShadow`);
  `partPoint(part, p)`, `partDir(part, d)`, `anchor(name)` return animated model-space positions (nozzle tip,
  throw point, booster).
- Shadow depth uses the rig for every expansion kind (hidden parts cast no shadow).

## The animation table (`ents/anims.js`) — Unity-portable
Each kind: `parts`, `lights`, `group` (`cop` | `vehicle` | `person` | `animal` | `hazard` | `prop` | `virtual`),
`wheels` (auto-roll every `wheel_*`), `channels`, `ctrl` (named procedural controller), `shadow`, `detach`, `windshield`.

A channel is `{ part, ch, fn, …params, when?: [states], moving?: true }`, summed per (part, channel):

| ch | meaning | Unity |
|---|---|---|
| `rx ry rz` | rotation (rad, Euler YXZ) | `localEulerAngles` curve |
| `px py pz` | offset (m) | `localPosition` curve |
| `sx sy sz s` | scale (multiplicative around 1) | `localScale` curve |
| `emit` | emission multiplier (light parts start dark) | material `_EmissionIntensity` |
| `alpha` | opacity (translucent parts) | material alpha |

| fn | params | value |
|---|---|---|
| `const` | v | v |
| `sine` | amp, hz, base, phase, phaseStep, ampStep | base + amp·sin(2π·hz·t + phase + i·phaseStep) |
| `abs` | same | base + amp·\|sin(…)\| (bob / hop) |
| `spin` | rate, rateStep, perSpeed | ∫ (rate + i·rateStep + perSpeed·speed) dt |
| `roll` | r | ∫ forwardSpeed / r dt |
| `gait` | amp, hz, perSpeed, ref, phase, abs | phase ∫ (hz + perSpeed·speed)·2π dt; amp × min(1, speed/ref) |
| `flash` | hz, on, off, duty, phase | square wave |
| `flicker` | min, max, hz | random hold per 1/hz s |
| `lean` | k, max | clamp(−yawRate·speed·k) |

`part` may be a glob (`flag_*`, `ring_*`, `puff_*`); `i` is the index in the glob. Animator inputs needed:
time (+ a per-entity phase), speed, forwardSpeed, yawRate, state.

**Controllers** (`ents/controllers.js`, one MonoBehaviour each in Unity): `steam` (the asset's 14-puff recipe +
soft vapour billboards along the plume + ground mist + cover burps), `waterMain` (spray drops, mist, ripples),
`brokenCar` (hazard glows, coolant steam), `trolley` (rattle), `powerLine` (arc sparks + flash), `dustDevil`
(sand swirl, orbiting grit), `flood` (ripples, sparkles), `foamPatch`, `animal` (graze / walk, BAA!/MEHHH!),
`cowboy` (hoof dust), `person` (breathing, bob), `band` (music notes), `moto` (bike lean + front-wheel steer),
`chopper` (Rattlers 0 ride, 1 grab lean, 2 crashed on its side + scrape sparks), `rhino` (throw sequence),
`canister` (flight / armed / burst), `paintSplat`, `comet` (booster flame + sparks + headlights), `streetcar`
(pantograph arcs), `carrier` (ramp + cargo bitmask), `logging` (logs bitmask, chains, hazard glows), `amber`,
`combine` (chaff + dust), `parade` (confetti), `stagecoach` (two horses galloping, coach sway, dust),
`gorilla` (0 tethered wobble, 1 loose tumble + flail, 2 deflate), `garbage` (bin lifter cycle), `freight` (wheel sparks).

### Per-kind contract (matches docs/NOTES-x-setpieces.md)
- **Cops** (`cop`, `cop_suv`, `interceptor`, `moto_cop`, `rhino_truck`): lights in 1/2/3/8 (dim, sputtering in 6),
  2 "?" + wobble, 3 spin wobble, 4 dark + smoke, 5 off,
  **6 soaked**: blue wet tint, drips off every edge, glint sweeping the windshield, wet sheen, SPLASH!;
  **7 stalled**: "?!" bubble, hood smoke, engine shudder, POP-POP!;
  **8 paint-blind**: paint splat decal on the windshield (surface probed from the mesh) in the colour of the
  nearest `paint_splat` ent (balloon variants 0–3 = magenta, teal, yellow, purple), paint drips, SPLAT!.
  Moto: whole bike leans into turns (yaw-rate), rider leans, front wheel steers.
- **Rhino throw:** a new `flashbang` ent spawning ≤ 14 m from a Rhino marks a throw. Doors open from 1.5 s
  before the cadence-predicted throw (`rules.heat.rhino.throwEvery`) and snap open on a detected throw if late;
  after two predicted throws that never came, prediction stops (doors stay shut) until the next real throw;
  the lobber winds up +0.3 in the last 0.7 s, releases −0.5, recovers; the canister in hand (`throw_point`) hides
  at release and reappears for the next wind-up; lobber hidden while the doors are shut. Only while chasing and
  with the RV behind the truck.
- **Canister** (`flashbang`): 0 flying — tumbling, fuse spark trail + smoke; 1 armed — lying, rocking, blinking
  faster as the fuse (0.9 s flash / 0.4 s foam) runs out, fizz sparks; 2 burst (or vanishing while armed):
  FLASH = bloom + flash rays + shockwave ring on the ground and in the air + sparks + debris + smoke + scorch + BANG!;
  FOAM = white-yellow foam burst + foam decals + FOOMP! (the sim's `foam_patch` takes over).
- **Car carrier:** `state().ramp` 0..1 → `ramp.rotation.x = −2.12·ramp`; `state().cargo` bitmask (or bool array)
  hides `cargo_i`; independently, a car ent appearing within 16 m hides the nearest cargo part (works without state).
  Dropped cars spawned in the air tumble until they land.
- **Logging truck:** `state().logs` bitmask hides `log_i`; state ≥ 1 hides `chains`; a `log` ent appearing near it
  hides the nearest log. Hazard glows while jackknifed.
- **Airborne vehicles** (tornado, falling cargo): y > 0.8 m above the road near a tornado (≤ 160 m), or spawned in
  the air, or > 6 m anywhere → tumble about a per-entity axis (rate × tornado spin), soft ground shadow that
  sharpens as it falls; settle upright after landing.
- **People** (`kestrel`, `sgt_pratt`, `cop_officer`, `swat_officer`, `comet_hero`, `band_member`): walk cycle from
  speed, idle head/breathing; ped states 2/3/4 (and cop_officer 1 = diving) reuse the ped knock/daze/get-up poses.
  cop_officer 0 = hand up ("STOP!"), sgt_pratt 0 = scribbling, kestrel 2 = talking, comet_hero scarf flutters,
  band_member marches in place with the instrument bobbing.
- **freight_wagon** has no asset: `ents/models.js` builds it (v0 rust boxcar, v1 tank car, v2 ore hopper).

## The tornado (`ents/tornado.js`)
- Drawn from the `tornado` ent (x, z) and the set-piece `state()` (radius = core radius → visual top radius ×3,
  height, spin ±2.4 → direction/speed, intensity → height/opacity), or from the state alone if no ent is sent.
- **1 draw call:** 4 nested funnel shells (opaque-ish striated core, texture shell, haze, wisps) + debris skirt +
  a lowered wall cloud, merged in one geometry. Shader: canvas fBm noise (3 channels, bands stretched around
  the funnel), per-layer spin/rise/twist, planar swirl noise for the cloud (no polar seam), cylindrical shading,
  soft outer silhouettes, bend/sway + "dancing" base in the vertex shader, fog, tone mapping.
- **1 draw call:** 56 instanced tumbling debris boards/sheets/crates orbiting and rising.
- Particles: billowing dust ring at the base, orbiting wisps and grit, a soft ground shadow.
- Storm light (see hook 3) within ~140–520 m.
- Cars orbiting it are the sim's ordinary car ents (y > 0) → tumbled by entities.js.

## Doc on the roof (`rv.js`) — matches ROOF's contract (docs/NOTES-x-roof.md)
- Visible when `snap.rv.roofDoc`; rises out of the hatch following `stop.roof.climb` (0 inside … 1 standing, eased);
  the `roof_hatch` lid opens first. Stands at `ROOF_GEOM.stance` (0, −1.8) RV-local; `water_hose` reel and
  `water_tank` at their `rvMount` spots (shown whenever the snapshot carries `roofDoc`, i.e. the expansion RV).
- Turns to `stop.roof.aimYaw` (RV-local, 0 = forward), raises both arms to `aimPitch` (the nozzle's built-in ~10° up
  is compensated), braced stance, head follows.
- `spray`: a coherent 20 m/s jet from the `nozzle` tip along **the sim's aim direction** (`aimDirWorld`: RV yaw + aimYaw,
  aimPitch) — the same line the hose cone test hits — drooping at the end, plus ~110 drops/s and glints that splash on
  the road; the reel unwinds and the tank valve opens.
- `stop.roof.fx` thrown devices for the driver's view: `fly` → balloon (paint-coloured blob), firecracker / flare
  (spark trail, flare smoke) on an arc from Doc's hand; `land` → balloon paint splat decal + droplets + SPLAT!,
  firecracker pops (flash, sparks, smoke) + POP-POP!, flare red glow + rising smoke + FSSSH!. Skipped in van mode.
- The renderer keeps its own copy of the roof geometry numbers (`ROOF` in rv.js) so it never imports sim code.

## FX words (`fx.js`)
New: `popWord()` (de-duplicated per spot within 0.3 s), word sets `canister`, `foam`, `splash`, `firecracker`,
`balloon`, `flare`, `moo`, `whoosh`. Set-piece start (idle → active, from `snap.setpieces` or `EV.setpiece`):
WHOOSH! (tornado, giant), MOO!, TA-DAA! + confetti, ZOOOM!, DING-DING!, CLANK!, KA-CHUNK!, BOING!, TIMBER!,
VROOM!, YEEHAW!, BEEP BEEP!, CHUGGA!, SPLOOSH!, NOOOO!. Entities pop BANG!/FOOMP!/SPLASH!/POP-POP!/SPLAT!/MOO!/BAA!.

## Particles
- Atlas page 2 (`ents/atlas.js`): EXCL "?!", DROP, SPLAT, CONFETTI, SHOCK, RIPPLE, FOAM, STREAK, SOFT, WISP,
  PLANK, SPARK2, FLASH, BURST, SWIRL, NOTE. Combined with page 1 in one 512×256 texture.
- `flat: true` → ground decal layers (ripples, shockwave ring, paint splats, foam, scorch, airborne shadows);
  `linearSize: true` → linear size growth (rings). Flat layers draw only when used.

## Performance (headless SwiftShader, 1280×720, real assets) — final code
| scene | base (`noents=1`) | with entities | Δ calls | entities visible |
|---|---|---|---|---|
| zoo overview (all 12 stations, every kind) | 50 | 99–101 | **+51** | 41 |
| zoo station 2 (hazards in front) | 50 | 103–104 | **+54** | 53 |
| tornado (6 flying cars) | 62 | 71–72 | **+9** | 9 (+ funnel, debris) |
| rhino chase (Rhino, moto, interceptor, canisters) | 54 | 62 | **+8** | 7 |
| real sim at the tornado (`?sim=1&z=36000`) | — | 73–78 | — | 13–14 |
| base `view-test.html?z=300` | 181 with the old rig → 181 with the new rig (identical) | | 0 | 28 |
Counts include shadow passes and particle layers. Target was +≤ 60 over the base scene with 40+ entities.
The tornado costs 2 calls (funnel + instanced debris) + the storm dome. Typical entity: 1 call (+1 if it has
translucent parts: steam, dust devil, water jet, broken car's steam, Comet canopy). Signs/labels cost 0 (atlas).
LOD: particles/details only within 160 m, channel animation at 1/3 rate beyond 220 m, culled at 420 m (tornado never).

## Real-sim verification
- `ents-test.html?sim=1&z=36000&cam=tornado`: SETPIECES' tornado forms 420 m out, crosses toward the road, sucks up
  and flings 3–6 cars (they tumble with ground shadows), one crashes next to the RV (CRASH!), RV hp 100 → 89–90.
  0 console errors. Screenshot `docs/x-ents-tornado-realsim.png`.
- `ents-test.html?sim=1&z=20200&stars=5&cam=rhino`: the real Rhino spawns, throws; doors open, canister in flight.
- `npm run test:sim`: 67/67 pass. `view-test.html`, `van-test.html`, `fp-test.html`: render, 0 console errors.

## Test harness — `public/ents-test.html`
`?scene=zoo|rhino|tornado|steam|roof|parade|comet|west|farm|highway` · `&station=0..11` (zoo) · `&cam=side|close`
· `&t=` · `&dt=` · `&noents=1` (draw-call baseline) · `&pause=1` · `&shot=1`.
`?sim=1&z=36200[&cam=tornado|rhino][&stars=5][&speed=20]` runs the **real GameSim** (+ autopilot) teleported to z
(`stars` holds the heat at that level).
Globals: `__ents`, `__view`, `__snap()`, `__stats()`, `__advance(sec, dt)`, `__look(kind|[x,y,z], dist, h)`,
`__camOverride`, `__ready`, `__settled()`.

## Known limits / ideas
- The windshield splat is a flat quad at the probed glass point; on very curved cabs it may clip slightly.
- Rhino throw timing is predicted from the cadence when the sim gives no wind-up signal; a `state` value or a
  `rhino.throwIn` field from SIM-CORE would make the door/lobber timing exact.
- Tornado colours follow the scene light; at sunset they stay neutral grey-brown (no orange rim light).
