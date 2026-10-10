# R3-CAB — redesigned first-person cab (`rv_cab_fp_r3`, PROPOSED)

This is a proposed replacement for Rook's first-person cab (`rv_cab_fp`). It has a realistic 1980s motorhome steering wheel, hands that properly grip it, and a richer dashboard. It is **not wired into the game**. It keeps the `rv_cab_fp` contract, so FirstPersonDriver can switch to it by changing one string:

```js
const cab = createModel('rv_cab_fp_r3', wearingSuit ? 0 : 1);   // instead of createModel('rv_cab_fp')
```

| Variant | Hands |
|---|---|
| v0 | Blue nitrile gloves (lighter knuckles), yellow protective-suit sleeves with an elastic cuff |
| v1 | Bare hands with fingernails, the ribbed cuffs and baggy sleeves of young Rook's oversized brick-red hoodie (was flannel) |

> **Revision R3-CAB2** (after the user's feedback: *"add the haiwan girl on front window that jiggles as car goes and also the mint refresheer and the coffee and some other elements"*): a new spring-mounted hula dancer on the dash, a mint pine-tree freshener and fuzzy dice on the rear-view mirror, all animated by a small spring/pendulum helper (`render/fp/trinkets.js`), a more lived-in dash, and hoodie cuffs on v1. See [R3-CAB2: dash trinkets](#r3-cab2-dash-trinkets) below.

## Files (owned by R3-CAB, revised by R3-CAB2)

| File | What |
|---|---|
| `public/js/assets/expansion/r3-cab.js` | `PACK`: builder (2 variants), category `x_round3`, label, named parts (now including the six trinket pivots). |
| `public/js/assets/expansion/r3-cab-model.js` | The builder: shell, dashboard, binnacle, column, wheel, horn pad, stalks, key, wipers, mirrors, userData. Calls the trinket builders. |
| `public/js/assets/expansion/r3-cab-hands.js` | The hands: fingers that wrap the rim, palm, thumb, wrist, cuff, sleeve, and the arm IK. v1 now has hoodie cuffs. |
| `public/js/assets/expansion/r3-cab-trinkets.js` | **R3-CAB2, new.** The hula dancer, the mint freshener and the fuzzy dice (animated pivots), plus the static dash clutter baked into the body (`dashLife`, `visorSlips`). Placements live in `TRINKETS`. |
| `public/js/assets/expansion/r3-cab-geo.js` | Geometry helpers: oriented limbs, a bumpy torus, textured decals baked into the same mesh, and smooth normals with a crease angle. |
| `public/js/assets/expansion/r3-cab-atlas.js` | One 1024×512 CanvasTexture holding every printed detail (R3-CAB2 added the freshener print, dice faces, toll ticket, parking stub, phone screen, gum wrapper and polaroid in free cells). In node (no DOM) the meshes fall back to plain vertex colours. |
| `public/js/render/fp/trinkets.js` | **R3-CAB2, new, not wired.** `Trinkets`: damped springs and pendulums that animate the trinket pivots from acceleration, lateral acceleration and bumps. |
| `public/js/assets/test/check-assets.js` | One line: `rv_cab_fp_r3: 7000` in `BUDGET_OVERRIDE` (the x_ default is 6000). |
| `public/r3-cab-preview.html` | The proof page that produced the renders (R3-CAB2 added the scripted drive, the garage scene, traffic and close-up presets). |
| `docs/r3/cab-*.png`, `docs/r3/cab2-*`, `docs/r3/bg-cab-*.png` | The renders. |

Nothing else was modified. `hazards-cab.js` is only imported, for `CAB` and `GAUGES`. Game wiring (`main.js`, `FirstPersonDriver.js`, `sim/*`) and today's `rv_cab_fp` are untouched.

## What changed compared with `rv_cab_fp`

**Steering wheel.** The hub position, the 0.6 rad tilt and the 0.21 m rim radius are unchanged, so the wheel is still 42 cm across.
- **Rim:** 48×6 leather-wrapped torus in dark brown-black. Finger-grip ridges sit on the back (dash side). A lighter cross-stitched seam (an atlas strip) runs along the inner face, the side Rook sees.
- **Spokes:** four spokes. The upper pair sits just under 9 and 3, where the thumbs rest; the lower pair sits at about 5 and 7. They are brushed-metal flats with black plastic covers toward the hub. The hub is dished 3.6 cm away from Rook.
- **Horn cushion:** a padded, tapered cushion (chamfered box with smooth normals) with two seam lines and a raised chrome oval medallion. The medallion carries an original "C&R" badge in red enamel.

**Hands** (the user's main complaint):
- Each hand has a lofted rounded palm and four fingers, each in three tapered phalanges. The joints are solved on circles around the rim tube, so the fingers wrap 190–215° around it. The index finger wraps the most and the little finger is shorter.
- There are low knuckle bumps, and a thumb with a thenar mass that lies across the rim's back face onto the upper spoke.
- The wrist blends into the forearm direction. The cuff and sleeve run to an elbow placed by 2-bone IK from the shoulder. The elbows hang low, so the forearms come up from below.
- The hands are built as a canonical "fist on a bar", then rolled 0.75 rad about the rim and tilted 0.26 rad. Seen from Rook's eye, the knuckle row is outboard and the fingertips curl round the hub side of the rim, under the thumb.
- They are scaled 1.1×, because first-person hands read better a little big.
- The right hand is the exact mirror of the left.

**Grip position.** The grip is at 1.3 rad from 12 o'clock (about 9:30 and 2:30) instead of today's 10 and 2 (1.08).
- True 9 and 3 (1.571) puts the fists' centres about 10 px from the bottom edge at FirstPersonDriver's −0.16 pitch and 76° FOV, so most of each hand is off screen.
- At 1.3 the fists sit about 75 px up and read clearly, with the thumbs still on the spokes. `R3.handA` changes this.

**Instrument binnacle.**
- **Pods:** a two-pod cluster with chrome bezel rings and recessed dials. The speedometer reads 0–100 mph with an inner km/h scale and an odometer. The tachometer reads 0–6 ×1000 rpm with a red line from 5000.
- **Small dials:** a temperature sub-dial sits in the tach pod (the `needle_temp` pivot) and a fuel sub-dial in the speedo pod (static at ¾).
- **Ticks:** major ticks and the red-line arc are geometry; minor ticks and numerals come from the atlas.
- **Info strip:** above the pods. On the left are the three warning lamps (CHECK ENGINE, OIL, TEMP legends). On the right is a PRNDL arc with the `gear_pointer` index. There are also turn arrows, high-beam and brake tell-tales.
- **Shape:** the binnacle was re-profiled so the whole face sits inside the upper half of the wheel and in front of the raked glass.

**Column.**
- A tilt-column head with a plastic shroud, a rubber dash boot and a shift bowl.
- A chrome column shifter (static, posed in D).
- The turn-signal stalk is on the left and the wiper stalk (ribbed twist end) on the right.
- The ignition lock is on the head at about 4 o'clock. Its key has a ring, a brass house key and a green periodic-table tile fob reading **27 / Co / Cobalt / 58.93**. The ring and fob hang plumb in the authored RUN pose.

**Dashboard:**
- two-tone vinyl dash with defroster grilles on the slope by the glass (visible from the eye)
- round eyeball vents at both ends and two louvred centre vents
- HVAC slider panel with a hazard switch
- AM/FM push-button radio: lit dial window with FM and AM scales, chrome knobs, five presets and a tape slot
- passenger glovebox with a chrome push latch
- CB radio under the dash right of the column: channel "19", S/RF meter, knobs, a hand mic on its hook and a coiled cord (a helix ribbon)
- dash caddy on the dash top with a to-go coffee in a cup ring and a cassette standing in a slot
- a loose "Road Mix '86" cassette and a "Desert Radio" tape in its clear case
- the driver's visor, lowered, with a folded three-panel road map tucked under its strap (visible top-left)
- a toe board under the dash, so no daylight shows through when you look down

**Kept as today:** the side and centre mirrors (same planes, positions and placeholder material), the wipers and their mounts, the A-pillars, header, headliner, doors and passenger seat. (R3-CAB2 replaced the static pine freshener with the animated mint one, and brought the hula figure back as a new, animated design.)

**Removed:**
- the visor photo (a polaroid now sits on the binnacle instead)
- Rook's own seat back, because it is behind the camera (only the cushion front remains)
- some invisible chamfers, to stay within the triangle budget

## R3-CAB2: dash trinkets

Everything below is in `r3-cab-trinkets.js`. All marks are original (no real brands).

**Hula dancer** on the dash top, right of the binnacle, standing against the windscreen (`TRINKETS.hula`: RV-local [0.182, 1.497, 3.095], turned 0.3 rad toward Rook, built 1.3× life size so she reads from the eye, about 22 cm tall). She is a chain of four pivots:

| Pivot | Parent | Mesh | Motion |
|---|---|---|---|
| `hula` | `rv_frame` | none (its wooden base is baked into the body mesh) | fixed anchor; `rotation.y` = facing |
| `hula_spring` | `hula` | the coil spring, a wooden puck, legs and feet, torso, coconut-shell top, flower lei, head with hair and face, long hair and two side locks, a red hibiscus over her right ear | tilts: `rotation.x > 0` leans forward (+Z), `rotation.z > 0` leans to Rook's right (−X) |
| `hula_hips` | `hula_spring` (at the waist) | the grass skirt: an inner cone, 18 layered blades with a ragged hem, a straw waistband | sways opposite the torso (`.x`, `.z`) and swivels (`.y`) |
| `hula_arms` | `hula_spring` (at the shoulders) | both arms raised: her right curls up beside the flower, her left waves out to the side | lags the torso (`.x`, `.z`) |

All four use Euler order `XZY` and rest at identity rotation (except the anchor's facing yaw).

**Mint pine-tree freshener** (`freshener`): a cut-out card printed on both sides (mint gradient, needle chevrons, "FRESH MINT" label band), hanging on a 5 cm string from the bottom edge of the rear-view mirror, turned to face Rook. It is a pendulum about the hanging point: `rotation.x > 0` swings it toward Rook (−Z), `rotation.z > 0` toward +X, and `rotation.y` twists it about the string (order `XZY`).

**Fuzzy dice** (`dice`): a pair of plush pink dice (chamfered cores with smooth normals, speckled fuzz and white pips from the atlas) on one loop next to the freshener. Same pendulum convention.

**More dash life** (static, baked into the body mesh, no extra draw calls):
- the dash caddy, moved right, now holds the to-go coffee (kept) and a phone in a spring-clip holder showing a nav screen ("0.3 mi Main St")
- folded aviator sunglasses, lying by the glass next to the dancer
- a pack of "COOL MINT GUM" with one stick sliding out
- a crumpled receipt
- a toll ticket and a parking stub tucked under the visor strap, next to the folded map
- the "Road Mix '86" cassette, now loose at the front edge (the second cassette stays in its clear case further right)
- a polaroid (the RV at sunset) tucked into the top-left corner of the binnacle hood

The centre of the windscreen stays clear: the dancer and the caddy sit below the road on the right, and the dice and freshener hang in the top-right corner under the mirror, where the old pine tree was.

**v1 hoodie cuffs.** v1's flannel became young Rook's oversized hoodie: a 12-rib knit cuff that creeps over the wrist, a slack puff above it, then a baggy sleeve with a soft fold toward the elbow. The colours match `rook_young` (`r3-rook-body.js` `ROOK_COL`): hoodie `#a4473a`, the darker shade `#8c3b31` and rib `#7a332b`. They are copied into `HAND_STYLE[1]` in `r3-cab-hands.js`, not imported, so the cab does not depend on R3-ROOK's file. Update both together if the character's colour changes. v0 (nitrile gloves and yellow suit cuffs) is unchanged.

### Trinkets: the jiggle (`render/fp/trinkets.js`)

`Trinkets` is self-contained (no imports, deterministic, no per-frame allocation). It finds the pivots by name and skips any that are missing, so it is a no-op on `rv_cab_fp`.

- **Inputs, per frame, in the RV frame:** `speed` (m/s), `accel` (optional, m/s²), `latAcc`, and `bump`.
  - **`accel`:** + = speeding up. Without it, `Trinkets` uses the derivative of `speed`, smoothed over 0.06 s.
  - **`latAcc`:** `snap.feel.latAcc`. + means the RV accelerates toward its left (+X), i.e. a left turn. Things swing to the outside.
  - **`bump`:** `snap.feel.bump`. Its rising edge kicks everything.
- **Hula spring:** the dancer is a damped spring at about 2.2 Hz (ζ 0.14, `TRINKET_TUNING`). Inertia leans her away from the acceleration, then she wobbles back with some overshoot and settles in about 1.5 s. A hard stop leans her about 0.3–0.5 rad.
  - **Hips:** follow −0.9 × her tilt through a stiffer spring, so the skirt sways opposite, a little late. They also swivel when she wobbles.
  - **Arms:** follow −0.45 × her tilt through a soft spring, so they lag and then overshoot.
  - **Road buzz:** at speed, a tiny buzz keeps her alive.
- **Freshener and dice:** 2-axis pendulums. Their lengths come from `cab.userData.trinkets` (0.082 m and 0.077 m, about 1.7 Hz), with air damping that settles them in about 1.5 s (to 10 %), plus a torsion twist about the string.
  - **Braking** swings them toward the windscreen (−8.4 m/s² gives about 0.8–0.9 rad).
  - **Turning right** swings them left (+X).
  - **The glass:** the forward swing is capped at about 0.9 rad, where the windscreen is, and they bounce off it.
- **Rotated parents:** each pivot's parent may be rotated, e.g. the dancer's anchor faces Rook. The acceleration is turned into the parent's frame, so the trinkets can be moved or re-aimed freely.
- **Other calls:** `kick(strength)` for crashes and landings, `reset()` for teleports.

**FirstPersonDriver recipe**, once the kind string is switched to `rv_cab_fp_r3`:

```js
import { Trinkets } from './trinkets.js';
// _build(), after createModel(...):
this.trinkets = new Trinkets(cab);                 // harmless on rv_cab_fp (no trinket pivots → no-op)
// _animateCab(dt, snap, rv) — once per frame, next to the wheel/gauges:
const feel = snap.feel || {};
this.trinkets.update(dt, { speed: rv.speed || 0, latAcc: feel.latAcc || 0, bump: feel.bump || 0 });
// _onEvent(ev):
//   EV.CRASH  → this.trinkets.kick(0.5 + Math.min(1, ev.power ?? 0.6) * 0.6);
//   EV.LANDED → this.trinkets.kick(ev.hard ? 1.2 : 0.6);
// on a teleport / reset (rv.z jumps) or when the garage phase ends: this.trinkets.reset();
```

The snapshot has no longitudinal acceleration, so leave `accel` out and let `Trinkets` differentiate `rv.speed`. On the cook's client the snapshots are interpolated, and the 0.06 s smoothing absorbs the steps. It costs five pivots and a few dozen multiplies per frame, so it can run even while the cab is hidden.

## Contract and named parts

| Item | Status |
|---|---|
| Frame, `rvOffset`, `eye`, `eyeModel`, `eyePitch`, `fov`, `gauges`, `wipers`, `viewBox` | Same values as `rv_cab_fp`. |
| `userData.wheel` | Same keys, plus `grip` (the grip angle). |
| `userData.perInstanceMaterials` | Adds the three lamps. |
| `userData.controls` | New: lists the props and values below. |

| Part | Parent | Drive (prop: values) | Suggested source |
|---|---|---|---|
| `needle_speed`, `needle_rpm`, `needle_temp` | `gauges` | `rotation.z`, same ranges as `rv_cab_fp` (`userData.gauges`) | unchanged |
| `wheel` | `wheel_mount` | `rotation.z` (> 0 = right) | unchanged |
| `hand_l`, `hand_r` | `wheel` | `rotation.z` (and optionally `position`, see below) | unchanged, or the slide recipe |
| `wiper_l`, `wiper_r` (+ `_mount`) | `rv_frame` | `rotation.z` 0 → 1.75 | unchanged |
| `mirror_l_glass`, `mirror_r_glass`, `mirror_c_glass` | `rv_frame` | render-target material | unchanged (`mirrors.js`) |
| **`horn_pad`** | `wheel` | `position.z`: 0 (rest) → 0.005 (pressed, away from Rook) | horn key held (`audio.horn`) |
| **`stalk_signal`** | `wheel_mount` | `rotation.z`: +0.2 right (lever up), −0.2 left, 0 off | `audio.indicator` / `nearStop.side` while pulling in |
| **`stalk_wiper`** | `wheel_mount` | `rotation.z`: 0 off, +0.18 on (lever down) | `V.wiperA > 0` or `want` in `_animateCab` |
| **`gear_pointer`** | `gauges` | `rotation.z`: P 0.24 (authored), R 0.12, N 0, D −0.12, L −0.24 | `gearbox.gear`: −1 → R, 1–3 → D (or L in gear 1 below about 8 mph if you like), engine off or garage → P. Damp it. |
| **`key`** | `key_mount` | `rotation.z`: 0 off, 0.62 run (authored), 1.05 start | `garage.items.engine`: off → 0, cranking → 1.05, on → 0.62 |
| **`lamp_check`, `lamp_oil`, `lamp_heat`** | `gauges` (meshes) | `material.emissiveIntensity`: 0 off → about 1.3 on, after `cloneInstanceMaterials(cab)` | see below |
| **`hula`** | `rv_frame` | fixed anchor (`rotation.y` = facing); its base is in the body mesh | — |
| **`hula_spring`** | `hula` | `rotation.x` / `.z` tilt (order XZY) | `Trinkets` |
| **`hula_hips`**, **`hula_arms`** | `hula_spring` | `rotation.x` / `.z` (hips also `.y`) | `Trinkets` |
| **`freshener`**, **`dice`** | `rv_frame` | pendulum `rotation.x` / `.z`, twist `.y` (order XZY) | `Trinkets` |

`userData.trinkets` holds the pivot names, the dancer's spring height and the pendulum lengths for `Trinkets`. `userData.controls.trinkets` points at the driver.

Lamp ideas, all from the snapshot:
- **Bulb check:** all three lamps on while `garage.items.engine === 'cranking'`.
- **`lamp_heat`:** on when FirstPersonDriver's `tempT > 0.8`, which already climbs with low hull or a lab fire.
- **`lamp_oil`:** flickers when `rv.hp < 25`.
- **`lamp_check`:** on when `rv.hp < 40`, or after a hard `EV.LANDED`.

The lamps use a Lambert material with `map` = `emissiveMap` = the atlas, like vehicles.js' `lampMaterial` (`userData.lamp = true`, intensity 0 when off). Only the legend glows: amber for CHECK, red for OIL and TEMP.

## Budgets

The asset check (`node public/js/assets/test/check-assets.js`) passes: **ALL OK** (239 kinds, 432 variants at the time of R3-CAB2). `rv_cab_fp_r3` has its own budget line, `BUDGET_OVERRIDE.rv_cab_fp_r3 = 7000`; the expansion default is 6,000.

| Variant | Triangles | Meshes (draw calls) |
|---|---|---|
| `rv_cab_fp` (today) | 4,225 | 12 |
| `rv_cab_fp_r3` v0 (gloves), R3-CAB | 5,553 | 20 |
| `rv_cab_fp_r3` v1 (bare), R3-CAB | 5,577 | 20 |
| **`rv_cab_fp_r3` v0 (gloves), R3-CAB2** | **6,782** | **25** |
| **`rv_cab_fp_r3` v1 (bare, hoodie), R3-CAB2** | **6,782** | **25** |

By mesh (R3-CAB2):
- body 3,246 (it was 2,960; it now also holds the dancer's base and the dash clutter)
- wheel 864, hands 2 × 544 (both variants), key 182, horn pad 148, stalks 68 + 84, wipers 2 × 60
- needles, pointer and lamps 33, and 2 triangles for each mirror plane
- trinkets: `hula_spring` 579, `hula_hips` 80, `hula_arms` 84, `freshener` 38, `dice` 162

The trinkets add **5 draw calls** (20 → 25). The `hula` anchor has no mesh of its own, because its base is baked into the body. Each animated pivot carries exactly one merged mesh.

**The 16-mesh target was not met: 20 meshes is the floor of R3-CAB's spec (25 with the trinkets).**
- The `rv_cab_fp` contract already needs 12 separate meshes: body, wheel, two hands, three needles, two wipers and three mirror planes.
- The brief adds 8 more that it asks to be separate: 5 animatable pivots, each holding its own mesh, and 3 lamp meshes with their own emissive materials.

Ways to get back to 16 or fewer draw calls at runtime:
- Set the lamp meshes to `visible = false` while they are off. The bezel underneath reads as a dark, unlit lamp, which saves 3 calls most of the time.
- three.js already frustum-culls `mirror_r_glass` at the rest head pose.
- If the key and stalks never need to move, bake them into the body. That saves 3 more.

All printed details share the atlas, so text costs no extra draw calls.

## FirstPersonDriver integration notes

- **Swapping the kind.** Swap the kind string as shown at the top. Everything FirstPersonDriver reads (`needle_*`, `wheel`, `hand_*`, `wiper_*`, `wiper_*_mount`, the mirror planes and `rv_frame`) is there with the same parents. Mirrors and windscreen fog work unchanged; `r3-cab-preview.html` runs the real `Mirrors` class on it.
- **Hands with the current recipe.** FirstPersonDriver sets `hand_*.rotation.z = −0.5 × wheel`, and this still works. At 90° the left forearm swings out to the left; see `docs/r3/cab-turn-fp-today.png`.
- **Proposed "slide" recipe (better).** The hands ride the rim for the first ±0.45 rad, then the rim slides through the gloves. The hands never cross, the forearms keep coming up from below, and the fingers stay wrapped round the rim, because a hand moved along the rim still sits on it. See `docs/r3/cab-turn.png`. Replace the two `P.hand*` lines in `_animateCab` with:
  ```js
  const W = this.ud.wheel, R = W.radius, g = W.grip ?? 1.08;
  const ride = clamp(V.wheel, -0.45, 0.45), slip = V.wheel - ride;
  P.handL.position.set(R * Math.sin(g + slip), R * Math.cos(g + slip), 0);  P.handL.rotation.z = -slip;
  P.handR.position.set(R * Math.sin(-g + slip), R * Math.cos(-g + slip), 0); P.handR.rotation.z = -slip;
  ```
  The `?? 1.08` fallback keeps the old cab's 10-and-2 grip.
- **Hand-over-hand past about 100°.** As an extra, when `|slip|` passes about 1.2 rad, ease one hand's `position` back to its home angle over about 0.25 s while the other holds. That is a shuffle-steer beat, purely cosmetic.
- **Head look.** The radio, glovebox, CB and key are below the rest view, as in a real cab. They show up when the head pitches down or turns right (head look allows ±70° yaw and ±20° pitch).
- **Shadows.** Keep `castShadow = false` on the cab (FirstPersonDriver already does).
- **Materials.** The hands and wheel use smooth-shaded Phong (`CR_R3Cab_Glove`, `CR_R3Cab_Skin`, `CR_R3Cab_Smooth`) for a nitrile, leather and chrome sheen. The body is flat Lambert with the atlas (`CR_R3Cab_Body`).

## Preview page and renders

`http://localhost:3100/r3-cab-preview.html` builds the real WorldView (world, sky, lighting) with a parked RV. It hangs the cab under `view.rvAnchor` exactly as FirstPersonDriver does: at `rvOffset`, with RV layer 1 hidden, no cab shadows and live mirrors. The camera sits at the eye with FirstPersonDriver's tuned pitch (−0.16) and FOV (76°).

| Parameter | Effect |
|---|---|
| `kind` | `rv_cab_fp_r3` or `rv_cab_fp` |
| `v` | `0` gloves, `1` bare |
| `cam` | `eye`, `hands`, `hands2`, `dash`, `wide`, `side`, or `custom&cpos=x,y,z&cat=x,y,z` (RV-local camera and target) |
| `wheel` | Wheel angle in degrees; positive = right |
| `follow` | Hand counter-rotation factor; default −0.5 |
| `grip` | `slide` (with `ride=`) for the proposed hand recipe |
| `gear` | `P`, `R`, `N`, `D` or `L` |
| `mph`, `rpm`, `temp` | Needle values |
| `lamps=1` | Lights the warning lamps |
| `signal` | `L` or `R` |
| `wipers` | Wiper angle in radians |
| `horn=1` | Presses the horn pad |
| `key` | `off`, `run` or `start` |
| `hands=0` | Hides the hands for detail shots |
| `z`, `tod` | Route position and time of day |
| `fov`, `pitch`, `yaw` | View tuning |
| `world=0` | Plain backdrop without WorldView |
| `mirrors=0` | Disables live mirrors |
| `shot=1` | Hides the caption |
| `sim=brakebump` | **R3-CAB2.** A scripted 4 s drive that starts and ends at rest: cruise at 13 m/s, a hard brake (−8.4 m/s², 0.2–1.15 s), roll on at 5 m/s, a bump at 1.9 s. It drives the real `Trinkets` at a fixed 1/120 s step and FirstPersonDriver's head bob. The RV moves along the road. |
| `t` | With `sim`: pre-roll the drive to this time (stills). The springs settle from −1.6 s first. |
| `scene=garage` | The RV parked on its bay in Rook's Garage (`garage_interior` at `sim/garage.js` `garageFrame`, roll-up door open, GarageView's interior lights, exterior hidden). |
| `traffic=1` | A few cars in both directions and pedestrians on the sidewalks. |
| `scene=defend` | The RV stopped (speed 0) with two police cars pulled up close ahead at different angles (entity state 1, so their light bars flash) and onlookers on the sidewalks. `copA`, `copB` set their distances ahead (9.5 m and 15.5 m by default). |
| `cam=trinkets`, `hula`, `mirror` | Close-ups of the dash toys. |
| `lane` | The RV's lane (default: the inner forward lane). |
| `hulaX`, `hulaZ`, `swing` | Static trinket poses for detail shots. |

`window.__cab.done` turns true when the frame is settled. `window.__cab.advance(dt)` steps the scripted drive and draws one frame. That is how the GIF frames are made: one screenshot, then `advance(1/12)`, 48 times.

Renders are 1280×720, made with Playwright and SwiftShader (each takes about 10 s):

| File | Shows |
|---|---|
| `docs/r3/cab-before.png` | Today's `rv_cab_fp` from the eye, for comparison. |
| `docs/r3/cab-gloves.png` | v0 from the eye. |
| `docs/r3/cab-bare.png` | v1 from the eye. |
| `docs/r3/cab-hands-closeup.png` | 3/4 close-up of the gloved hands wrapping the rim. |
| `docs/r3/cab-turn.png` | v0, wheel at 90° right, proposed slide recipe. |
| `docs/r3/cab-turn-fp-today.png` | v0, wheel at 90°, FirstPersonDriver's current −0.5 recipe. |
| `docs/r3/cab-dash.png` | 2×2 detail sheet: binnacle with lamps lit and PRNDL in D; centre stack; CB under the dash; key and "Co" fob. |
| `docs/r3/cab2-gloves.png` | **R3-CAB2.** v0 from the eye on a downtown street (z 5000, traffic): the hula dancer, dice, freshener and dash clutter. |
| `docs/r3/cab2-bare.png` | **R3-CAB2.** The same view with v1: bare hands and hoodie cuffs. |
| `docs/r3/cab2-trinkets.png` | **R3-CAB2.** Close-up of the dash toys mid-wobble, 0.2 s after the bump (`cam=trinkets&sim=brakebump&t=2.12`). |
| `docs/r3/cab2-jiggle.gif` | **R3-CAB2.** 4 s loop, 960×540, 12 fps, 48 frames, 5.1 MB: driver's view on a downtown street, hard brake then a bump. The dice and freshener fling toward the glass and swing back, and the dancer wobbles with her skirt counter-swaying. Everything settles before the loop restarts. |
| `docs/r3/bg-cab-city.png` | **R3-CAB2.** CLEAN 1280×720 background for UI mockups: v1 hands, wheel straight, downtown (z 4930), light traffic, no overlays. |
| `docs/r3/bg-cab-garage.png` | **R3-CAB2.** CLEAN 1280×720 background: v1, the RV parked in Rook's Garage looking out of the open roll-up door at the road, no overlays. |
| `docs/r3/bg-cab-defend.png` | **R3-CAB2.** CLEAN 1280×720 background: v1, wheel straight, the RV stopped downtown (z 4930) with two police cruisers pulled up close ahead at different angles, light bars on, trinkets visible, no overlays (`scene=defend`). |

How the R3-CAB2 renders were made: Playwright, headless Chromium with SwiftShader, the server on `:3100`. Stills use `r3-cab-preview.html?…&shot=1`. The GIF frames are rendered at 1280×720 and assembled with ffmpeg (`palettegen stats_mode=diff`, `paletteuse` bayer dither, Lanczos downscale to 960×540).

## Known limits

R3-CAB2:
- **Forward lean.** The dancer's lean under braking points along Rook's line of sight, so from the eye it reads as a dip. Bumps, turns and her hip sway read best. The dice and freshener carry the braking.
- **Body pitch.** `Trinkets` ignores the RV's body pitch and roll (only accelerations and bumps). The nose dive under braking is already in the camera.
- **Clutter stays put.** The clutter is static, baked into the body. Only the dancer, the freshener and the dice move.

R3-CAB:

- The grip is at about 9:30 and 2:30, not exactly 9 and 3, for on-screen visibility (see above).
- The sleeves are rigid with their hand pivot. Very large wheel angles under the −0.5 recipe swing them; the slide recipe avoids this.
- The column shifter is static, posed in D. `gear_pointer` is the animated indicator.
- In node, the textured details (numerals, legends, fob text) show as plain colour patches. Triangle counts are identical.
