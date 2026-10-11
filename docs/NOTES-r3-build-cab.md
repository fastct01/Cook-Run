# Round 3 build — CAB (first-person cab `rv_cab_fp_r3`, cab audio, audio helpers)

Owner: agent CAB. Files: `public/js/render/fp/**` (new `cabR3.js`, changed `FirstPersonDriver.js`), `public/js/render/audio.js`,
`public/fp-test.html`. The asset (`assets/expansion/r3-cab*.js`) and `trinkets.js` are used as they are. `cabInterior.js`
and `cabArms.js` are unchanged and only used by the legacy path.

## What main.js must do (exact)

Nothing is required for the cab swap itself: `new FirstPersonDriver(view, data, { hudRoot, audio })` now builds
`rv_cab_fp_r3`. The hands variant is chosen automatically from the snapshots FP already receives.

1. **Pass the difficulty-scaled data**, the same object as everywhere else:
   `new FirstPersonDriver(this.view, withDifficulty(data, level), { hudRoot: $('hud'), audio })`.
   The look-around cooldown is `data.rules.driver.lookCooldown ?? 30` (Easy 20 / Hard 30 / Extreme 45). It is read
   once, in the constructor.
2. **Keep the per-frame call as it is today:** `this.fp.update(dt, snap, this._lastInput)`. The horn hand uses
   `snap.rv.horn || input.horn`, and `snap.garage.rook.suited` / `snap.garage.skipped` drive the gloves.
3. **HUD look keycap (optional, nicer):** use
   `this.hud.setLookCooldown?.(this.fp?.active ? this.fp.cooldown : null, { active: this.fp?.mode === 'look' })`.
   `fp.cooldown` stays 0..1 (0 = ready).
4. **Roof:** `this.fp.setActive(false)` while `DefendClient.active` (it owns the camera), then `setActive(true)` when he is
   back in the seat. Same as the van, garage and shop.
5. **DEFEND audio:** pass the same `audio` object to `DefendClient` (see "Audio API" below).
6. **Optional override:** `this.fp.setHandsVariant(0|1)` forces gloves or bare hands, and `setHandsVariant(null)` goes back
   to automatic. You only need it if you want a rule other than the garage one, e.g. after a reconnect that missed the
   garage (the default is then gloves).

## FirstPersonDriver API (changes only)

```js
new FirstPersonDriver(view, data, { hudRoot, audio, cab = 'r3' | 'legacy', handsVariant = null | 0 | 1, …as before })
fp.setHandsVariant(v)   // 0 = blue nitrile gloves + yellow suit cuffs · 1 = bare hands + red hoodie cuffs · null = auto
fp.handsVariant         // current 0 | 1
fp.lookCooldown         // seconds (from rules.driver.lookCooldown ?? 30)
fp.cooldown             // 0..1 for the HUD ring (unchanged meaning)
fp.cabKind              // 'rv_cab_fp_r3' (or 'rv_cab_fp' on the legacy path / fallback)
fp.rig                  // CabR3 instance (debug: fp.rig.state)
```

**Automatic hands rule.** FP looks at `snap.garage` on every frame while the garage is in the snapshot (phases
`garage` and `countdown`):
- `garage.skipped` means suited;
- otherwise it remembers `garage.rook.suited` whenever that is a boolean.

The variant is 1 (bare hands) only if a garage was seen and its last value was `suited === false`. In every other case
it is 0: no garage, tutorial skipped, or suited. The value is remembered after the garage leaves the snapshot. The swap
is cheap: the two hand meshes take the other variant's geometry and material. No rebuild, so mirrors and fog stay
wired.

**Fallback.** If `createModel('rv_cab_fp_r3')` is missing or broken (no `rv_frame` / `wheel_mount`), FP logs one warning
and builds today's `rv_cab_fp` with `CabInterior` + `CabArms`. `?cab=legacy` in fp-test.html forces it, for
comparisons.

## CabR3 (`render/fp/cabR3.js`): what drives what

| Part | Source | Behaviour |
|---|---|---|
| `wheel` | `rv.steer` | wheel = steer × 1.9 rad (full lock about 109°; legacy was × 1.7), damped, kicks on bumps |
| `hand_l`, `hand_r` | wheel angle | Grip at 9:30 / 2:30 (asset `grip` 1.3 rad). Each hand's rigid rotation is `0.5·tanh(w/0.5)`: it rides the rim 1:1 when the wheel is near centre, then the rim slides through the gloves (no crossed arms, sleeves stay below). **Hand-over-hand:** past 100° (1.75 rad) the hand pushed toward 12 o'clock lets go, lifts 3.4 cm toward Rook and re-grips at its home spot in 0.26 s while the other hand holds. Back under 66° it re-grips once more. |
| right hand + `horn_pad` | `snap.rv.horn` or `input.horn` | The right fist drops onto the horn cushion in 0.12 s, and the pad presses 5 mm. On release it goes back to the rim in 0.22 s. |
| `gear_pointer` | `gearbox.js` | P when the engine is off, during the garage, when wrecked, or when parked at a stop (stop parked/shopping/returning/loading and speed < 0.3). R for gear −1, N for gear 0, otherwise D. Damped. |
| `lamp_check` | hull | lit below 30 % of `rules.rv.maxHp` |
| `lamp_oil` | `EV.GADGET {gadget:'oil'}` | flashes at about 3 Hz for 3 s; steady while cranking or stalled |
| `lamp_heat` (TEMP legend) | heat | lit at ≥ 4★, or when the engine temperature (the temp needle) is above 0.86 |
| all lamps | key-on | bulb check, 1.6 s, the first time FP takes the camera, and while cranking |
| turn arrows + `stalk_signal` | `indicatorWanted(snap)` from audio.js | Pulling in to a supply stop; the side is `nearStop.side` (+1 right means lever up). Blinks at 0.36 s, in step with the audio tick. Both arrows blink as hazards below 25 % hull. The stalk click plays when it changes. |
| `stalk_wiper` | wipers wanted (fog > 0.1, dust storm) | lever down 0.18; click on change |
| `key` | `garage.items.engine` | off 0 · cranking 1.05 · on 0.62 |
| radio dial (new mesh) | `snap.area.name` | A backlit dial with the area name in caps, an FM scale and a red pointer. When the area changes, the pointer seeks to a per-area frequency in 1.1 s and the new name fades in. |
| `hula_*`, `freshener`, `dice` | `Trinkets` | Longitudinal acceleration (from the speed delta), `snap.feel.latAcc` and `snap.feel.bump`. Kicks on `EV.CRASH`, `EV.LANDED`, `EV.COP_WRECK` and `EV.PED_HIT`. Reset on a teleport (more than 40 m in one frame) and when the garage ends. They settle in about 1.5 s. |

**Kept from before:** eye/camera, FOV/pitch tuning, head look, bob, sway and shakes, live mirrors on the three glass
planes, gauges (speed, rpm, temp), wipers and windscreen fog, flash/shock overlay, the 3 s look-around, and the RV
body layer hidden from the cab camera.

## Draw calls / budget

Measured in fp-test.html (`__fp.cabCalls()`: one frame with the cab hidden vs shown, mirror passes excluded):

| | cab draw calls | cab triangles |
|---|---|---|
| today's `rv_cab_fp` + CabInterior + CabArms | 14 | 10,593 |
| `rv_cab_fp_r3` (this build) | **22** (≤ 25 even with fog + radio in view) | 6,782 |

The asset has 25 meshes. The three lamp meshes (each with its own emissive material) are hidden. One merged unlit mesh
(`fp_r3_lamps`) redraws them, plus the two turn arrows, with vertex colours carrying off/on. That makes 23. The radio
dial adds 1 (frustum-culled at the rest view, visible when you look down-right). The windscreen fog quad adds 1 only
while there is fog. `mirror_r_glass` is often culled.

<!-- PERF -->

## Audio API (`render/audio.js`) — for DEFEND and others

```js
audio.context()        // → AudioContext, or null until the first user gesture unlocked it
audio.ctx              // same, as a getter
audio.bus()            // → GainNode to connect your SFX to (→ muffle → master → compressor): respects mute + volume. null until unlocked
audio.noise()          // → shared 2 s white-noise AudioBuffer (null until unlocked)
audio.registerSfx(name, (ctx, out, opts) => durSeconds)   // any time, even before unlock
audio.sfx(name, { gain = 1, pan = 0, rate = 1, delay = 0, lowpass = null })  // → true if played
audio.hasSfx(name)
```

- `sfx()` returns `false` and does nothing while audio is locked, suspended or muted, or when the name is unknown.
- A name that is not registered but is a built-in one-shot (`'clunk'`, `'tick'`, `'pop'`, `'stalk'`, …) plays the
  built-in.
- For each call, `out` is a fresh chain wired into `bus()`:
  - a GainNode set to `opts.gain`;
  - an optional lowpass at `opts.lowpass` Hz (use it for far, muffled cop fire);
  - an optional StereoPanner set to `opts.pan`.

  It is disconnected automatically after the duration your function returns (default 3 s) plus `delay`.
- Your function receives your opts plus `{ t0, noise, rate }`. `t0 = ctx.currentTime + delay`: schedule everything
  from it.
- Checked in the browser: the context is `running`, `sfx` → true, unknown → false, muted → false, and `bus()` is a
  GainNode.

```js
audio.registerSfx('revolver', (ctx, out, { t0, noise, rate }) => {
  const n = ctx.createBufferSource(); n.buffer = noise; n.playbackRate.value = rate;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(5000, t0);
  f.frequency.exponentialRampToValueAtTime(300, t0 + 0.25);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.9, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
  n.connect(f); f.connect(g); g.connect(out); n.start(t0); n.stop(t0 + 0.35);
  return 0.4;
});
audio.sfx('revolver', { gain: 0.8, pan: -0.2 });
```

**Other audio changes:**
- New built-in one-shots: `play('stalk', on)`, the column-stalk detent click (wipers and indicator), and
  `play('wipe', k)`, one blade sweep, played by FP at each stroke.
- The indicator tick rule is exported as `indicatorWanted(snap)`, so the cab's arrows and stalk follow the same rule.
- `audio.indicatorForced` (getter) reports `audio.indicator(on)` overrides.
- The horn is unchanged.
- The old `audio.context` getter, unused anywhere, is now the function `audio.context()`. Everything else is unchanged.

## Harness (`public/fp-test.html`)

New knobs:

| Knob | What it does |
|---|---|
| `?cab=legacy` | today's cab |
| `?v=0\|1` | hands variant |
| `?garage=suited\|unsuited` | fakes 0.3 s of garage first (auto variant) |
| `?scene=brake\|corner\|bumps\|horn\|oil\|drive` | scripted fake drives |
| `?stars=N`, `?hull=N`, `?steer=deg`, `?horn=1`, `?signal=1`, `?area=Name` | scenario overrides |
| `?difficulty=easy\|hard\|extreme` | runs the data through `withDifficulty` |
| `?debugcab=1` | rig state line |

Keys: G toggles gloves/bare, H horn.

`window.__fp` gains:
- `cab()` (rig state) and `cabCalls()`;
- `variant(v)`, `set({ steer, stars, hull, area, signal })` and `setHorn(on)`;
- `lookCam('trinkets'|'dash'|'radio'|'hands'|'column')` for close-ups.

## Screenshots (`docs/r3/build-cab-*.png`)

<!-- SHOTS -->

## Decisions

- **Slide recipe plus a hand-over-hand beat.** The asset's hands are rigid, with the sleeve baked to an IK'd elbow.
  Riding the rim further than about 30° swings the sleeves into view (`cab-turn-fp-today.png`), so the rim slides
  through the gloves beyond that. The hand-over-hand re-grip is the cosmetic beat NOTES-r3-cab.md suggests. It re-grips
  at the home spot, because re-gripping lower put both hands off screen.
- **Merged lamp mesh.** It keeps the cab within the 25-call budget even with everything lit. The asset's emissive lamp
  meshes stay in the model, hidden.
- **Radio dial.** It is a separate 512×102 canvas plane laid over the atlas dial. It is redrawn only while seeking or
  fading (about 12 Hz) or when the area changes.
- **Heat lamp.** It also lights on engine overheat, because its legend reads TEMP.

## Open issues

- The R3 body material is plain Lambert from the shared atlas, so the gauges are not backlit at dusk. Today's cab drew
  an unlit cluster face. A fix would need an emissive mask in the frozen asset.
- The column shifter is static in D (asset). Only `gear_pointer` moves.
- Hazards blink both arrows below 25 % hull, even when the stop indicator is on.
