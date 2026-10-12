# Round 3 build: HUD ("dark glass")

Agent HUD. I own these files:

- `public/js/ui/hud.js` (rewritten)
- `public/css/hud.css` (rewritten)
- `public/css/style.css` (restyled: boot fallback, shell, pause/notice overlay, pills, touch controls)
- `public/css/tokens.css` (extended only; no existing token was renamed)
- `public/hud-test.html` (new harness), plus its backgrounds in `public/test-assets/` (copies of `docs/r3/ui/src/img`, test only)

I edited nothing else.

The HUD matches `docs/r3/ui/Driver-HUD.png`, `Driver-Defend.png`, `Cook-Lab.png`, `Cook-Shop.png`, `End.png`, `HUD-Kit.png`,
`Garage-Exit.png` and `Roof.png` (the HUD parts). Sizes, colours, fonts and SVG icons are copied from `docs/r3/ui/src/*.html`.

Screenshots:

| File | What it shows |
|---|---|
| `docs/r3/build-hud-vs-mockups.png` | Mockup vs build, side by side |
| `build-hud-driving.png` | Driving |
| `build-hud-defend.png` | DEFEND |
| `build-hud-cook-lab.png` | Doc in the lab |
| `build-hud-cook-shop.png` | Doc's shop run |
| `build-hud-roof.png` | Rook on the roof |
| `build-hud-garage.png` | Garage |
| `build-hud-end.png`, `build-hud-end-tiles.png` | End screen; all three difficulties and a bust |
| `build-hud-states.png` | cooling, max, climbing, ready + look active, low HP + missed, loading + cops called, bridge, countdown + caption, area title |
| `build-hud-phone.png` | 390×844 cook, 844×390 touch driver |
| `build-hud-pause.png` | Pause menu |
| `build-hud-real-game.png` | `index.html?demo` on the real sim |

## API (`ui/hud.js`)

```js
const hud = new Hud(rootEl, data, { role: 'driver'|'cook' });   // data = the session data (withDifficulty)
hud.update(snap)                         // every frame; events are processed once per snapshot object
hud.toast(text, tone = 'info', opts)     // tone 'info'|'good'|'bad'|'heat'|'cops'; opts { icon, value, sub, key }
                                         //   one line, fades; max 3; same `key` replaces the toast in place
hud.showEnd(result, { onRestart, onMenu, canRestart = true, restartLabel = 'Play again', menuLabel = 'Back to lobby', title, reasonText })
hud.hideEnd(); hud.reset(); hud.destroy();
hud.setFirstPerson(bool)                 // in the cab (the small "64 km/h" pill only shows when NOT in the cab)
hud.setLookCooldown(v, { active }?)      // C Look keycap: v = fp.cooldown (0 ready … 1 just used), null = not in the cab (dimmed)
                                         //   cooldown → conic shade + "17 s"; look running (auto-detected, or opts.active) → amber "3 s"
hud.caption(title, sub?)                 // set-piece caption (Fraunces); also from EV.setpiece (SETPIECE_CAPTIONS export kept)
hud.areaTitle(name, hour?)               // "Now entering / Downtown / 10:12 AM"; also automatic on snap.area change while driving
// Round 3
hud.onDefend = () => {}                  // click on DEFEND — called only in the Ready state
hud.setMode('drive'|'roof'|'lab'|'shop'|'garage')   // cheap no-op when unchanged → safe to call every frame
hud.setDifficulty('easy'|'hard'|'extreme')          // strip chip (flames + label), end tile; bags-needed table only if
                                                    //   it disagrees with data.difficulty (session data already carries it)
```

Exports `ICON`, `SETPIECE_CAPTIONS` and `fmtClock` are kept or added. The old big speedometer and the flashing police edge are
gone, as the designs have none. The cab has real gauges, and a static red vignette now shows bust danger.

## Layout and modes

| Place | Panel | Data |
|---|---|---|
| top-left 232×56 | **Wanted**: 5 stars plus a slider. Fill = `heat.value − stars`; "62%". State in words: Quiet · Seen (amber) · Unseen (holding, before decay) · Cooling (blue, `heat.unseen ≥ rules.heat.decayDelay`) · Max heat (red lock, "MAX") · Shots fired (rust, 2.5 s after `EV.SHOT`) · Gave up. No underlines | `heat`, `EV.SHOT` |
| top-centre 600×56 | **Route strip**. 8 pins stand on the road line at `stop.z / routeLength` (track x 16 … W−28). States: done = dimmed + tick (`looted`), missed = dimmed + × (`closed`, or passed unlooted), next = amber + distance ("640 m", "4.8 km", "here"), ahead = outlined. Also: the RV marker riding an amber fill line, biome border ticks, the bridge at `bridge.lip`, a chequered flag at `sellPoint.z`, and "AREA · 4.2 km" centred under the RV. Difficulty chip bottom-right | `rv.z`, `stop`, `looted`, `closed`, `area` |
| top-right 232×56 | **Bags** `n / need`, **Score**, **Q %** (hidden at 0 bags). The bag icon turns green at need | `inv`, `score` |
| under the strip (top 80) | **One line, by priority**: Cop at the RV (bust filling, or a running cop < 15 m at a stopped RV) → Cop alongside (curtains open) → Flash/foam canister → Bridge out (speed check) → Loading (with bar; red "Cops at the lot" when blocked) → Missed it → Pull in (green, < 90 m) → Next stop. The driver sees "on the right"; the cook sees "in 400 m · forklift run" | |
| right column (top 80) | **The other player's chip**. In drive/roof/garage modes it is Doc: "In Bolt & Barrel · 2/3 · 0:21" (`stop.docShop`, teal progress hairline), "Heading out", "Running back", "Loading supplies 45%", "Batch 2 · heating 186°", "Fire in the lab", "Doc is down", "Aboard · in the lab". In lab/shop modes it is Rook: "Driving 64 km/h", "Parked", "On the roof · bust 12%", "Climbing up". Then **Cops: 2 on the way 0:08** (`EV.STOP_COPS`), then **toasts** | |
| bottom-left 232×64 | **RV hull / Rook (rust) / Doc (teal)** with numbers. A pulsing green "+" shows on `rv.regen`, `crew.regen.driver` and `crew.regen.cook`. Below 25 % the bar and number turn red. A ghost bar trails damage | `rv.hp`, `crew` |
| bottom-right | **Keycaps**: C Look (eye), Q Smoke (cloud), E Oil slick (droplet), Shift Nitro (bolt). Count is top-right. Empty = dim. Smoke and oil show a conic shade + amber "4 s" for `rules.gadgets.*.duration` after `EV.GADGET`. Nitro is amber while `rv.nitro > 0` | `inv.gadgets`, `rv.nitro` |
| bottom-centre (bottom 100) | **DEFEND** (driver, drive mode). The button has a shield, "DEFEND", a sub-line, gun silhouettes, an F keycap and a climb bar. The ring holds bust % (amber < 25 % < red) or the nearest cop "12 m" (amber, fills as it closes in). Below: "Nearest cop 12 m · busted at 100%", "· bust arms in 2 s", or "· safe while moving" | see below |

**DEFEND states**, from `snap.roof` (or `stop.roof`), `bust` and `bustInfo`:

| State | When | What it shows |
|---|---|---|
| Ready | `available` | Lit red: "Climb to the roof" |
| Held | `climbing` | Red bar = `climb`: "Climbing to the roof…" / "Climbing down…" |
| Up | `onRoof` while still in drive mode | Held style: "AI Rook is on the roof" |
| Locked | `why === 'moving'` (or `'airborne'`), ≥ 1★, cop ≤ 40 m | Dimmed: "Stop the RV first" / "Land first" |
| Hidden | Otherwise (no heat, no cop) | — |

`nearCop ≥ 500` (the sim reports 999) means no cop.

**Modes** (`setMode`; `snap.phase === 'garage'` also adds the garage look automatically):

| Mode | Hidden | Moved |
|---|---|---|
| `drive` (driver default) | — | — |
| `roof` (DefendClient owns the camera) | strip, run panel, centre line, chips, gadgets, DEFEND | bars → bottom-right; toasts at top 88 under DEFEND's bust panel |
| `lab` (cook default; solo in the back) | gadgets, DEFEND | toasts → bottom-centre (VanHud owns the right side) |
| `shop` (a shop run is on screen) | strip, centre line, gadgets, DEFEND | bars → bottom-right (the shop's hint sits bottom-left) |
| `garage` | centre line, DEFEND, vignette | — (GARAGE draws its own banner and checklist) |

Fallbacks without `setMode`: `body.in-shop` acts like shop, `body.in-lab` acts like lab. With the 2D lab docked right
(`body.lab-local`), toasts move to the left of the lab.

**Big moments** use Fraunces 800: the area title, set-piece captions (title + a glass sub-pill), the countdown "3 2 1 Go!" and the
end title. Each fades with a ≤ 8 px slide, with no bounce and no tilt.

**End screen** (End.png): the wordmark, a run chip "HARD · ROUTE 40 KM / Ironworks → Starlite Drive-In · 39.8 km", the place
and time chip, and the Fraunces title (Delivered / Busted / Wrecked / Crew down / Nothing to sell). The payout card shows
stars, a rating line and Bags `n/need` · Time · Max heat ★ · Quality. Then come Play again (amber), Back to lobby (glass) and
the **difficulty tile** (`result.difficulty`): flames + "EASY ×0.75" in sand, "HARD ×1" in rust, "EXTREME ×1.5" in red.
`result.scoreMult` is used when present. Last is a crew card. Rook / Doc use letter avatars, because no portrait images exist
under `public/`. Their lines read optional `result.copsDisabled`, `roofStands`, `batches`, `shopRuns` and `alarms`, and fall back
to cops wrecked, points, bags and quality. Below 1000×600 it becomes one scrollable column.

**Pause menu, notices, pills and touch** (style.css) use dark glass. The title is Archivo 800 condensed, the primary button is
amber and keycaps are raised. Pills sit bottom-left above the health panel (bottom 88). On touch they move under the health
panel, which moves to the top-left (under Wanted). On touch the gadget panel hides (the touch buttons replace it), DEFEND
drops to bottom 16 at 236 px wide without gun art, and the touch buttons sit on 16 px margins. Phones: ≤ 640 px gives a
2-row top bar, and ≤ 900 px wide or ≤ 520 px tall gives 8 px margins. If the strip is too narrow for the distance label, the
banner carries the distance.

**Performance.** The DOM is built once. Every write goes through a changed-value cache, so text and classes change only when
values change. Movement uses `transform` (the RV marker, fills, bars, labels) or a CSS var (the vignette and conic shade).
No layout is read per frame. The strip width comes from a ResizeObserver. Label widths are read only when their text length
changes, and once more after `document.fonts.ready`.

## What main.js / index.html must do (integrator)

**index.html.** Link fonts and tokens first. `hud.css` also `@import`s both, so the other harnesses work, and that is harmless:

```html
<link rel="stylesheet" href="css/fonts.css">
<link rel="stylesheet" href="css/tokens.css">
<link rel="stylesheet" href="css/style.css">
<link rel="stylesheet" href="css/hud.css">
…
```

**main.js** (`startGame` / frame / keys):

```js
// startGame(): data is the withDifficulty() session data
this.hud = new Hud($('hud'), data, { role: this.role });
this.hud.setDifficulty(difficulty);                       // optional (data.difficulty already drives it)
if (this.isHost) this.hud.onDefend = () => this.sim.applyDriverCommand({ type: DCMD.DEFEND, on: true });

// every frame, right after hud.update(snap) — picks the panels (no-op when unchanged):
this.hud.setMode(this.defend?.active ? 'roof'
  : this.shop ? 'shop'
  : (this.role === 'cook' || this.inLab) ? 'lab'
  : 'drive');                                             // garage is automatic from snap.phase

// look keycap (replaces the old call; the 2nd arg is optional — the HUD also detects the look by itself):
this.hud.setLookCooldown(this.fp?.active ? this.fp.cooldown : null, { active: this.fp?.mode === 'look' });
```

- **Keys.** F does the same as the button, when not on the roof: `sim.applyDriverCommand({ type: DCMD.DEFEND, on: true })`. On the
  roof, DefendClient handles F / W itself.
- **End screen labels.** The new defaults are "Play again" and "Back to lobby". The current `restartLabel` / `menuLabel`
  options still work. Pass `result.difficulty` and `result.scoreMult`; SIM adds both to EndResult.
- **Pause menu text** (`showPauseMenu`): add `['F', 'Defend: climb onto the roof']` and drop the old Doc roof row (`R`). The
  styles need no change: they use the same `.ov-*` markup.
- **Toasts.** Keep toasts short (one line, max ~460 px). Today's long hints ("Drive with WASD / arrows · Tab: go cook in the
  back") get an ellipsis. Suggested: "Drive out — C looks around".
- **Speedometer.** The old HUD speedometer is gone. `setFirstPerson(false)` (chase cam, wreck cam, solo in the lab) shows a
  small "64 km/h" pill instead.

**SIM (optional, nice to have).** Echo `stepType`, `temp` (°) and `recipeId` in `snap.lab`. The Doc chip then reads
"Batch 2 · heating 186°" (the batch number counts `EV.RECIPE_OK`). Today it reads "Batch 2 · cooking". Optional EndResult
fields for the crew card: `copsDisabled`, `roofStands`, `batches`, `shopRuns`, `alarms`, `maxStars`.

## Snapshot fields and events read

- **Snapshot fields:** `phase, countdown, t, difficulty, rv.{z,speed,hp,regen,nitro,wrecked}`,
  `crew.{driver,cook,cookDown,regen}`, `heat.{value,stars,seen,gaveUp,unseen}`, `bust`, `bustInfo.{grace,armed}`, and
  `roof.{available,why,nearCop,climbing,climbDir,climb,onRoof,active,ai}` (or `stop.roof`).
- **Stop and route fields:**
  - `stop.{id,name,state,doc,docShop,shopT,shopMax,progress,blocked}`
  - `nearStop.{id,name,dist,side,z,shopType}`
  - `looted, closed, area.name, timeOfDay, inv, score`
  - `bridge.{dist,speedNeeded,cleared}`, `lab.{cooking,curtains,fire,fumes,stepType?,temp?}`
  - `alert.copClose`, `ents` (flashbang canisters), `maxStars`, `garage.{doc,rook}.inRv`.
- **Events:** `msg, stopDone, stars, copsGaveUp, biome, fell, landed, spotted, train, setpiece, canister, heatDrop,
  shopResult, recipeOk, gadget, shot, copDisabled, copShot, stopCops`.

## Harness: `public/hud-test.html`

`hud-test.html?s=<state>` shows one state; `&shot` hides the state bar.

- **No WebGL.** A static mockup background (`public/test-assets/*.jpg`, test-only copies) plus protocol-shaped fake snapshots,
  built with the real `loadData()` + `withDifficulty()`.
- **States:** driving, defend, cooling, max, climbing, ready, lowhp, loading, bridge, roof, cook-lab, cook-shop, garage, moments,
  area, end-easy / end-hard / end-extreme / end-busted, pause, phone-cook, phone-driver.
- **Hooks:** `window.__ready`, `window.__hud`, `window.__states`, `window.__defendClicks`.
- **Results:** zero console errors in every state. `view-test.html` (legacy snapshots, driver and cook) and `index.html?demo`
  (real sim) run with no HUD errors; the only warnings come from the SwiftShader driver and the autoplay policy.

## Open issues / decisions

- **Missed stops.** A closed or passed-unlooted stop gets a dimmed pin with **×**, not a tick, so "visited" and "missed"
  read differently. Change `.crh-pin.miss .px` → `.pt` in hud.css if the plain tick is wanted.
- **"Unseen" state.** The kit has no word for the stretch between losing sight and the cool-down starting. "Unseen" fills it.
- **Area label.** It is centred on the measured text width, so it sits ~7 px off the mockup, whose positions were estimated.
- **Shared scratchpad.** All agents share one scratchpad. At 20:37 a GARAGE scratch file named `hud.js` was copied over
  `public/js/ui/hud.js` for ~7 minutes, and then restored. Anyone who saw "does not provide an export named 'Hud'" in that window
  should re-run. Use a private sub-folder in the scratchpad.
