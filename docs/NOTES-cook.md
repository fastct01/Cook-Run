# Cook lab — integration notes (Agent COOK)

All chemistry is fictional: ingredients and steps come from `lab.json`, and the steps are things like grind, pour, burner dial, stir, ice bath, break and bag.

## Files
| File | Role (Unity analogue) |
|---|---|
| `public/js/cook/CookLab.js` | Gameplay logic, no DOM (plain C# class) |
| `public/js/cook/minigames/*.js` | One class per step type: `grind measure heat stir cool break hammer` + `Minigame.js` base + `index.js` factory |
| `public/js/cook/CookUI.js` | DOM/canvas view (UI Toolkit document) |
| `public/js/cook/LabScene.js` | Canvas lab diorama + hazard overlays |
| `public/js/cook/{theme,draw,icons}.js` | Palette tokens, flat-shaded canvas helpers, inline SVG icons |
| `public/css/cook.css` | Styles, all scoped under `.cook-ui` |
| `public/cook-test.html` | Test bench with a fake host (`?compact=1`, `?dev=1`, `?cop=0`, `?feel=0`, `?empty=1`) |
| `public/js/cook/test/lab-headless.js` | `node public/js/cook/test/lab-headless.js` (logic test) |
| `public/js/cook/test/playthrough.py` | Playwright end-to-end test (needs the static server on :8092) |
| `public/js/cook/test/autoplay.js` | In-page bot that plays each minigame with real PointerEvents |

## Mounting
```js
import { CookLab } from './js/cook/CookLab.js';
import { CookUI } from './js/cook/CookUI.js';
const lab = new CookLab(data, { sendCommand: (c) => net.sendGame({ k: GM.CMD, c }) });
const ui  = new CookUI(lab, containerEl, { compact: soloMode });
// on each snapshot (15 Hz):   lab.applySnapshot(snap)
// every frame:                lab.update(dt); ui.update(dt);
// at rules.net.labHz (6 Hz):  net.sendGame({ k: GM.LAB, l: lab.getLabState() })   // drains cookHurt
```
* `containerEl` must have a definite size. The UI fills 100% × 100% of it and needs `position: relative|absolute|fixed`. Include `css/cook.css`.
* Full layout needs about 1180×640 or more. Between 640 and 1180 px wide the recipe book becomes a drawer behind a "Recipes" button. Below 640×380 it auto-switches to the compact layout. It was tested from 420×320 up to 1920×1080.
* Compact (solo) mode is meant for a docked panel of about 520×400. It shows a toolbar (recipe dropdown, vent, curtains, extinguisher, fumes and fire bars, bags) plus the canvas. Switch live with `ui.setCompact(bool)`.
* `ui.destroy()` removes the DOM and every listener.

## Keyboard / focus rules
* Every button has `tabindex=-1`, and `mousedown` on panel controls calls `preventDefault`, so clicks never move focus. A `focusin` guard blurs anything that slips through. The panel contains no inputs, selects or textareas.
* `preventDefault` is only called for pointer events on the panel canvas (and on its contextmenu).
* Optional lab hotkeys (V vent, C curtains, X extinguisher, `=`/`-` burner) are **on in full mode and off in compact mode** by default. Override with `{ hotkeys: false|true }` or set `ui.hotkeys`. In co-op the cook runs on their own machine, so these keys don't clash with the driver's.

## Host contract (what the sim should do)
* `startRecipe {reqId, recipeId}`: check and deduct `needs`, then put `recipeOk` or `recipeDenied {reason}` (same reqId) in the next snapshot's `events`. The cook times out after 5 s. A late `recipeOk` for a timed-out reqId either starts the batch (if the cook is idle) or is answered with `recipeFail {reason:'timeout'}`. A late OK after the cook cancelled gets `recipeFail {reason:'aborted'}`.
* `recipeDone {reqId, recipeId, quality}`:
  * product: add `units`, blend `inv.quality`
  * gadget: `inv.gadgets[gadget]++`
  * repair: apply `recipe.repair` (`rv` or `crew` hp)
* `recipeFail {reason}`: reason is `'aborted'`, `'explosion'`, or a minigame reason such as `'Dumped the ice bath'`. Ingredients are already gone.
* `explosion {power:1}`: apply `hazards.explosion` (rv damage, cook damage, heat). The lab resets fire and fails any running batch by itself.
* `callout {text}`: show it to the driver (for example `hud.toast`). Cooldown is 0.8 s.
* LabState.`curtains` is **true when the curtains are CLOSED**. Spot the lab when `cooking && !curtains && alert.copClose`. Visible vent smoke means `ventOpen && cooking` (or fumes/fire present). Apply `hazards.ventSmokeHeatPerSec`.
* LabState.`cookHurt` is hp lost since the previous `getLabState()` call (from fumes above `fumesHurtAbove` and from fire). Subtract it from `crew.cook`. Use `getLabState({peek:true})` to read without draining.
* Optional extras the lab reacts to: `EV.STOP_DONE` refills the extinguisher, `EV.SPOTTED` shows a toast, `EV.LANDED{hard}` counts as a big bump.

## Cook down
When `snap.crew.cook <= 0` (or `snap.crew.cookDown`), the UI shows "Doc passed out!" with a 12 s countdown and locks all input. The running batch is paused, not lost. After 12 s the lab recovers locally and emits `cookRecovered {hp:25}`. **The host must also restore the cook to 25 hp after 12 s**, otherwise the next snapshot knocks Doc out again. If the host restores hp sooner, the lab recovers immediately. `lab.cookDownSeconds` and `lab.cookRecoverHp` expose the numbers.

## Feel
The UI uses `snap.feel.latAcc` (m/s², ±4 typical) and `snap.feel.bump` (0..1). A bump impulse is a **rising edge** of `feel.bump` greater than 0.12 (so keep bump high for at least one snapshot). Spill and jolt effects trigger above `hazards.bumpSpillThreshold`. Bumps of 0.45 or more flash "BUMP!".

## Lab events (`lab.subscribe((type, data) => …)`), for audio/fx
`toast, bump, requested, recipeStarted, stepStarted, stepDone, recipeDone, recipeFailed, idle, vent, curtains, fireStarted, extinguish, fireOut, explosion, callout, spotted, cookDown, cookRecovered, hammerHit, hammerMiss`
