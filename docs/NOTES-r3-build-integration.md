# Round 3 — integration notes (main.js and how the pieces meet)

Spec: `ROUND3_CONTRACT.md`. Per-module notes exist for SIM, HUD and CAB (`NOTES-r3-build-{sim,hud,cab}.md`). The
DEFEND, DOCFP, SHOPS, GARAGE and LOBBY builds were cut short by a pause before they wrote their notes, so their APIs
are documented in the module headers instead:

| Module | Read its header |
|---|---|
| Rook's roof (sim) | `public/js/sim/roof.js` |
| Rook's roof (client) | `public/js/defend/DefendClient.js` (+ `RoofCam.js`, `RoofHud.js`, `aim.js`, `audio.js`); outside view `render/ents/rookRoof.js`, `copDamage.js`, `gunfx.js` |
| Doc's first-person lab | `public/js/van/VanLab3D.js` (+ `vanCamera.js`, `interior.js`, `VanHud.js`) |
| Doc's hands | `public/js/onfoot/fpHands.js` |
| Shop runs | `public/js/onfoot/shops/ShopChallenge.js`, `fpBase.js`, one file per type |
| Garage + start district | `public/js/sim/garage.js`, `onfoot/GarageView.js`, `render/world/startDistrict.js` |
| Lobby + title | `public/js/ui/lobby.js`, `ui/titleScene.js`, `index.html #boot`, `server/rooms.js` |

## What main.js does

- **Difficulty.** `Session` builds `this.data = withDifficulty(data, normDifficulty(cfg.difficulty ??
  ?difficulty))` once. Every module of the session gets this scaled copy: sim, view, HUD, garage, FP cab, defend
  client, lab, van, shops and the autopilots. The lobby passes `difficulty` in `onStart`. Solo restarts keep the
  level. `?solo=1&difficulty=extreme` works too.
- **DEFEND (host only).** `this.defend = new DefendClient(view, data, { hudRoot, audio, canvas,
  sendDriverCommand })`.
  - **F, or the HUD button** (`hud.onDefend`), calls `defendUp()` → `DCMD.defend {on: true}`. When the sim refuses,
    a toast says why (`roof.why`).
  - **Each frame:** `defend.update(dt, snap)`, then `syncRoofCamera()`. That turns first person off while
    `defend.active` (it owns the camera) and back on once Rook is in the seat.
  - **Input:** keys go to `defend.onKey` first while active. Mouse down/up/contextmenu/wheel on the canvas and window
    mousemove go to `defend.onPointer`. Driving input is neutral while Rook is up, and the sim holds the RV anyway.
  - **Solo:** the AI Rook (sim) climbs up by himself at stops. The client does not take the camera when
    `roof.ai`.
- **Shop run (Doc).**
  - **Online cook:** `van.onShopRun = (def) => startShop(def, 'door')`, after Doc walked to the side door and pressed
    E. That sends `CMD.shopEnter`, then creates `ShopChallenge(view, def, data, { hudRoot, firstPerson, onProgress,
    onDone, onAbort })`. Progress → `lab.setShopProgress()` → `LabState.shop` → `snapshot.stop.docShop` (the
    driver's Doc chip). Done/abort → `CMD.shopDone/shopAbort` → `endShop()` → `van.returnFromShop()`.
  - **Solo, or a host whose cook left:** `updateShop()` starts the run as soon as the stop is `shopping` with Doc
    inside (no walk), with the same commands as driver-local DCMD. First person is paused during the run.
  - If the host ends the stop (90 s limit, RV gone), the client closes its shop.
- **HUD modes.** `hud.setMode('roof'|'shop'|'lab'|'drive')` every frame; the garage mode is automatic.
  `hud.setLookCooldown(cd, { active })`. `hud.setDifficulty(level)`.
- **Pause menu** lists F, the roof controls and Doc's first-person keys. The boot screen reports progress via
  `window.__bootProgress`.

## Also done at integration

- **Junkyard crane:** converted to the first-person base. Doc walks to the crane, looks at the cab door and presses
  E. From the open cab, A/D swing the boom and W/S run the trolley; the mouse looks around. A yellow spot marks
  where the magnet will land.
- **Shop timers** cut ~40% in `route.json` (35 / 30 / 42 / 27 / 42 / 36 / 36 / 24 s), × `rules.shops.timeMult` per
  difficulty.
- **Autopilot (bots / demo):** also defends away from a stop when it is truly stuck (stopped 6+ s with the bust
  meter filling, e.g. at the drawbridge), then climbs down after ~7 s. It never re-climbs straight after a stop
  ends.
- **CSS:**
  - pills move bottom-right during a shop run;
  - the lab-air panel steps down when the HUD's "cops on the way" chip shows;
  - `index.html` links `fonts.css` + `tokens.css`.
- **Removed dead code:** Doc's old roof client (`van/roof/**`, `roof-test.html`) and the third-person `ShopBase.js`.

## Checked

- **Tests:** `npm test` passes — sim 96/96 (incl. 98 roof checks and full bot runs on all three difficulties), cook,
  assets (239 kinds / 433 variants), net 80/80, e2e (the cook bot does 8 shop runs and the AI Rook defends; the bots' result depends on the random
  seed: one run won on Hard, another was busted in the Ghost Town; e2e checks the networking, not the result).
- **All 8 shop runs** finish with the bot inside the new timers (`shop-test.html?bot=1`).
- **Headless browser, solo:**
  - garage → cab;
  - first stop → Doc's shop run in first person while the AI Rook defends → back in the cab with the DEFEND button
    lit;
  - F on the open road → Rook on the roof, the rifle hits a radiator (copFx).
- **Headless browser, two players:**
  - the room's difficulty reaches both players (Easy → 4 bags);
  - the cook gets "SHOP RUN — side door [E]";
  - the host sees "Doc · 2/3 items" in the chip;
  - shopDone → loading.
