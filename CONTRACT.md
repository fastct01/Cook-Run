# Cook & Run — build contract (read fully before writing code)

Two-player co-op browser game. Player 1 (**Driver**) drives an RV down a 7 km route
(Downtown → Suburbs → Outer Suburbs & Farms → Open Desert → Red Canyon → Buyer's Hideout),
running from cops, stopping at supply stores, and jumping a broken canyon bridge. Player 2
(**Cook**) works the mobile lab in the back: cooks batches of the (fictional) product
"Desert Glass", crafts gadgets for the driver, manages fumes/fire, and patches the RV/crew.
Win: reach the sell point (z≈6900) with RV + crew alive and ≥ `route.sellPoint.requiredUnits` units.

This is an original game. **Do not** use names, logos, characters, vehicles or quotes from any
existing TV show or film. No real drug chemistry anywhere: every ingredient/step is invented
(see `public/js/data/lab.json`). Hitting pedestrians is slapstick: they fly, spin, land dazed
with circling stars, then get up and walk off. No blood, no gore, no children or animals as
knock-down targets (cows are solid blockers that just moo).

## Tech
- Plain ES modules, no bundler, no TypeScript. Three.js r170 via import map:
  `{"imports":{"three":"./vendor/three/three.module.js","three/addons/":"./vendor/three/addons/"}}`
  (relative to the HTML page; `public/vendor/three` already exists).
- Server: Node 18+, Express 4 + ws 8 (already installed). `npm start` → `server/index.js`.
- Everything under `public/` must also work as static files (solo mode needs no server).
- Units: metres, seconds, radians. Y up. Route runs toward **+Z**. **Facing +Z, driver's RIGHT is −X.**
  Lateral offset `u` (u>0 = driver's right) → `x = track.centerX(z) - u`. Use `Track` helpers.
- Yaw: `forward = (sin yaw, 0, cos yaw)`; three.js `object.rotation.y = yaw` for models built
  facing **+Z** (glTF convention). Steering right ⇒ yaw decreases.
- Fixed timestep sim at 60 Hz. Deterministic given seed (use `sim/rng.js`, never `Math.random` in sim).

## Folder layout (who owns what)
```
server/index.js, server/rooms.js            Agent NET   (Express static + ws rooms/relay, /healthz)
render.yaml, README.md                      Agent NET
public/index.html, public/css/style.css     INTEGRATOR (lead) — agents may propose, don't overwrite
public/js/main.js                           INTEGRATOR
public/js/data/*.json, loadData.js          INTEGRATOR (agents may ADD keys, never rename/remove)
public/js/shared/protocol.js                INTEGRATOR (the message contract — read it!)
public/js/sim/track.js, rng.js              INTEGRATOR (done — use them)
public/js/sim/**                            Agent SIM   (GameSim + systems + headless test)
public/js/cook/**                           Agent COOK  (CookLab logic + CookUI + minigames)
public/js/assets/**, public/assets.html     Agent ART   (low-poly model builders + showroom)
public/js/render/**, public/js/ui/hud.js    Agent VIEW  (3D world view, cameras, scenery, fx, audio, HUD)
public/js/net/**, public/js/ui/lobby.js     Agent NET   (NetClient, LocalBus, lobby screens)
```

## Module APIs (the seams — implement exactly these signatures)

### Data — `loadData()` → `{ route, lab, rules }` (see the JSON files).

### Track (`sim/track.js`, done)
`new Track(route, seed)`; `biomeAt(z)`, `biomeWeights(z)`, `param(z,key)`, `centerX(z)`, `headingAt(z)`,
`halfWidth(z)`, `shoulder(z)`, `lanesAt(z)`, `laneU(z,i)`, `laneDir(z,i)`, `xAt(z,u)`, `uAt(x,z)`,
`isOnRoad(x,z,margin)`, `surfaceY(z)` (null over the canyon gap), `rampAngle()`, `inBridgeZone(z)`, `stopLot(stop)`.

### GameSim (`sim/GameSim.js`) — Agent SIM. Pure logic, no DOM/three.
```js
const sim = new GameSim(data, { seed, solo: bool });
sim.step(input, dt)           // input: DriverInput (below); dt = 1/60
sim.snapshot()                // → Snapshot (full detail, see protocol.js) and CLEARS pending events
sim.netSnapshot()             // → compact Snapshot for the network (entities within rules.net radii, numbers rounded to 2dp); does NOT clear events
sim.applyCookCommand(cmd)     // CookCommand from protocol.js CMD
sim.setLabState(lab)          // LabState
sim.phase, sim.result         // result = EndResult once phase is 'won'|'lost'
```
DriverInput: `{ throttle: -1..1, steer: -1..1 (+1 = right), handbrake: bool, horn: bool, smoke: bool, oil: bool, nitro: bool, reset: bool }`
(gadget booleans are edge-triggered by the caller: true for one step when the key goes down).
The host keeps pending events between two `netSnapshot()` sends; integrator calls `snapshot()` each frame
for the local renderer and attaches the accumulated events to the next network snapshot — so: keep two event
queues internally (`snapshot()` drains the local queue; `drainNetEvents()` drains the network queue). Expose `drainNetEvents()`.

### CookLab (`cook/CookLab.js`) + CookUI (`cook/CookUI.js`) — Agent COOK
```js
const lab = new CookLab(data, { sendCommand: (cmd) => void });
lab.applySnapshot(snap)       // inventory, feel (latAcc/bump), alert.copClose, events (recipeOk/Denied…)
lab.update(dt)                // advances hazards + current minigame logic
lab.getLabState()             // → LabState (protocol.js)
const ui = new CookUI(lab, containerEl, { compact: bool });  // builds DOM/canvas inside containerEl, handles mouse/touch
ui.update(dt); ui.destroy();
```

### Assets (`assets/index.js`) — Agent ART
```js
import { createModel, KINDS_3D, preloadAssets } from './assets/index.js';
createModel(kind, variant = 0) → THREE.Object3D   // origin at ground centre, front faces +Z, metres
```
Named children for animation (renderer relies on these): vehicles `wheel_*`; RV `vent` (Object3D at the roof
vent outlet), `door`; cop cars `light_red`, `light_blue` (Mesh, emissive); heli `rotor`, `tail_rotor`, `spot`;
ped `leg_l`, `leg_r`, `arm_l`, `arm_r` (pivot at hip/shoulder), `head`; train `car_*`; crossing_gate `arm`.
Kinds needed: every entry of `KIND` in protocol.js that is a physical thing, plus `rv`, scenery kinds listed in
route.json `biomes[].scenery`, store models `store_hardware`, `store_gas`, `store_junkyard`, `store_farm`,
`sell_point`, bridge pieces `bridge_ramp`, `bridge_landing`, `canyon_wall`, `warning_sign`, and `driver`/`cook` characters.

### WorldView (`render/WorldView.js`) + HUD (`ui/hud.js`) — Agent VIEW
```js
const view = new WorldView(canvas, data, { seed, role: 'driver'|'cook' }); // builds scene, road, scenery
view.pushSnapshot(snap, { interpolate: bool })   // driver: every frame (no interp); cook: on arrival (interp buffer ~100ms)
view.render(dt)
view.setCamera('chase'|'rear'|'cinematic')       // driver uses chase; cook uses 'rear' (looking back out the rear window)
view.resize(); view.destroy();
const hud = new Hud(rootEl, data, { role }); hud.update(snap); hud.toast(text, tone); hud.showEnd(result, { onRestart, onMenu });
```

### Net (`net/NetClient.js`, `net/LocalBus.js`, `ui/lobby.js`) — Agent NET
```js
const net = new NetClient();            // ws(s)://<host>/ws ; emits lobby + game messages
await net.connect(); net.send(obj); net.on(type, cb); net.off(type, cb); net.close();
net.sendGame(gameMsg)                   // wraps { t:'g', m }
net.onGame(cb)                          // cb(gameMsg)
const [a, b] = LocalBus.pair();         // two endpoints with the same sendGame/onGame API (solo mode, same tab)
showLobby(rootEl, { onStart })          // onStart({ mode:'solo'|'online', role, seed, net })  net=null for solo
```

## Visual style ("stylised low-poly, grounded — not kiddie")
Inspired by modern indie low-poly sims: chunky simple shapes, flat shading, slightly exaggerated
proportions (vehicles ~10% wider, characters with bigger heads/hands), muted sun-bleached palette,
small grime details (rust patches, mismatched panels, dents), no outlines, no glossy materials.
Use `MeshLambertMaterial` (or `MeshStandardMaterial` with roughness ≥ 0.8, flatShading) and share materials.
Palette tokens live in `assets/palette.js` (ART owns it):
- RV (original design, our hero vehicle): off-white body `#e9e2cf`, faded teal lower band `#4f8f8a`,
  thin mustard pinstripe `#d9a83a`, rust‑red replacement door `#9c4a32`, roof AC box, crooked chimney pipe
  from the lab vent, rear ladder + spare tyre, tinted windows `#2e3a40`, little curtains visible inside.
- Police: navy `#1f2a44` + white `#f1f1ee` doors, red/blue bar lights. SUV variant darker.
- Civilians: dusty pastels (`#c96f4a`, `#6f8fb0`, `#d6c08a`, `#7e9b6e`, `#b85c6a`, `#8a8f99`).
- Characters: Driver "Rook" (trucker cap, flannel, sunglasses), Cook "Doc" (orange rubber apron,
  lab goggles, respirator round on neck). Pedestrians: 6+ adult variants (business, jogger, tourist,
  worker in hi‑vis, granny-free — adults only, no kids).

## Performance budget
60 fps on a mid laptop: < 250 draw calls visible. Reuse geometry/materials (createModel clones from a cached
prototype), merge static scenery per chunk if needed, fog hides spawn distance, pixel ratio ≤ 1.75.

## Testing tools available in the sandbox
- Node 22. Run pure-logic tests with `node`.
- Static server for pages: `cd public && python3 -m http.server 8090` (or `npm start` once the server exists).
- Headless browser with WebGL (Python Playwright):
  `p.chromium.launch(args=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'])`
  Take screenshots and LOOK at them with the Read tool. Print console errors (`page.on('console')`).
- No internet except npm/pip registries. Do not add CDN links.
