# SIM notes — Round 3 build (`public/js/sim/**`, `shared/difficulty.js`, cook logic, e2e)

Spec: `ROUND3_CONTRACT.md`. This builds on `docs/NOTES-x-sim.md` and `docs/NOTES-sim.md`; everything there
still holds unless this file says otherwise.

```
npm run test:sim                      # a)–m) + r) DEFEND's roof tests if present
node public/js/sim/test/run-headless.js --only=l          # just the Round 3 unit checks (~20 s)
node public/js/sim/test/run-headless.js --only=m --diffSeeds=1,2   # per-difficulty full runs, more seeds
npm run test:cook                     # CookLab + minigames (+ the difficulty levers)
npm run test:e2e                      # the whole game online; E2E_DIFFICULTY=easy|hard|extreme to override
```

## Files touched

| File | Change |
|---|---|
| `shared/difficulty.js` (new) | `DIFFICULTIES`, `normDifficulty`, `withDifficulty`, `difficultyInfo`, `HARD_DEFAULTS`, `BUILTIN_LEVELS`, `applyOps` |
| `data/rules.json` | `difficulty` block; new Hard keys (below); `rv.regenPerSec` 0.2 → **0.3**; `heat.bust.seconds` 2.5 → **4**, `heat.bust.grace` **3**. `defend` untouched (DEFEND's) |
| `sim/GameSim.js` | difficulty, plumbing for Rook's roof, shop commands, 3-bar regen, snapshot fields, `damageTaken` |
| `sim/heat.js` | bust grace (`rv.stopped`, `bustInfo`), stop "called in" heat hold |
| `sim/stops.js` | Doc's shop run (`doc: in/out/back`, `shopEnter`), stop response dispatch, `stop.docShop/doc/held` |
| `sim/cops.js` | states 9/10, `hole/crack/tyre/radiator` effects, `copFx`, officers duck, cops fire back, stop response |
| `sim/lab.js` | `LabState.shop`, Doc's regen timer, `hurtMult` on the host fallback, alert ignores 9/10 |
| `sim/scoring.js` | `EndResult.difficulty`, `scoreMult`, points × `scoring.mult`, `breakdown.raw/mult`, `damageTaken` |
| `sim/bridge.js` | `rules.bridge.missDamage/missBags` |
| `sim/obstacles.js`, `sim/traffic.js`, `sim/config.js` | `densityMult` levers |
| `sim/autopilot.js` | sends `defend {on, ai: true}` at stops; drives off an unwanted stop while Doc is still inside |
| `sim/test/run-headless.js` | stop-flow tests updated; sections l) m) r) |
| `cook/CookLab.js`, `cook/minigames/*.js`, `cook/test/lab-headless.js` | difficulty levers, `setShopProgress` |
| `scripts/test-e2e.mjs` | the cook bot does the shop runs; the host driver sends the AI Rook up; difficulty |

## Difficulty (`shared/difficulty.js`)

```js
import { DIFFICULTIES, normDifficulty, withDifficulty, difficultyInfo } from './shared/difficulty.js';
DIFFICULTIES                      // ['easy', 'hard', 'extreme']
normDifficulty(x)                 // → valid id, 'hard' for anything unknown
withDifficulty(data, level)       // → NEW { ...data, rules, route, difficulty } (deep copies; input never mutated)
difficultyInfo(level, rules?)     // → { id, label, color }  sand #D9C38A / rust #E07A3C / red #E5483A
```

- `rules.difficulty.levels.{easy,hard,extreme}` are op lists applied to a copy of `{ rules, route }`:
  `set` (absolute), `mul` (× Hard), `add` (+ Hard), `min` (floor). Paths are dotted, in `rules` unless they start
  with `route.`; `*` = every key, `name[]` / `name[1:]` / `name[4:]` = array elements. `hard` is `{}`.
- Ops on a key that is missing use `HARD_DEFAULTS` as the base (e.g. `defend.copFire.*` when DEFEND's block is
  absent), so the result always carries the scaled values. Without a `difficulty` block the built-in table is used.
- Re-applying to an already-scaled object starts from its originals (no double scaling).
- Every lever of the contract table is implemented (test l1 checks 36 of them on all three levels). Notes:
  moto / Rhino ram damage and top speed follow the car numbers (×2/3 · ×1.5, ±2); "heat per incident" also
  scales `sim.patrol.speedingHeat/witnessHeat`; return-fire **rate** ×0.4 / ×1.6 is applied as
  `returnEvery` and `chaseEvery` ×2.5 / ×0.625.

New Hard-default keys in rules.json: `heat.bust.grace` 3, `rv.regenPerSec` 0.3 / `regenDelay` 10,
`cook.{hurtMult, zoneScale, burnerFireMult, spillMult}` 1, `sim.obstacles.densityMult` 1,
`sim.traffic.densityMult` 1, `shops.timeMult` 1, `driver.lookCooldown` 30, `bridge.missDamage` 30 /
`missBags` 1, `scoring.mult` 1, `stops.response { cops 2, delay 8, minStars 1, heat 1.2, spread [1, 2] }`.
DEFEND's block must hold `defend.hitsMult` 1, `ammoMult` 1, `flare` 1, `heatPerShot`, `heatPerDisable`,
`copFire` (its roof.js defaults them all already).

## Snapshot / events (all fields are in `snapshot()` and `netSnapshot()`)

- `difficulty`.
- `rv.roofRook` (from `roof.roofRook`), `rv.stopped` (s at |speed| < `bust.maxRvSpeed`), `rv.roofDoc` = false.
- `crew.regen { driver, cook }` (`rv.regen` is the hull's).
- `bustInfo { grace: s left, armed, defended: roof.onRoof }`.
- `copFx [[id, holes, crack 0|1, tyreMask (1 fl · 2 fr · 4 rl · 8 rr), steam 0|1], …]` — netSnapshot only for
  cops in its `ents`.
- `stop.doc` `'in'|'out'|'back'`, `stop.docShop` `{ stopId, label, frac, tLeft } | null`, `stop.held`.
- `EV.DOC_OUT { stopId, out }`, `EV.STOP_COPS { stopId, count, eta }`, `EV.COP_SHOT { copId, x, y, z, tx, ty, tz,
  target: 'rook'|'rv', hit, damage }`, `EV.REGEN { on, bar: 'rv'|'driver'|'cook' }`.
- `EndResult.difficulty`, `scoreMult`; `points` = round(raw × `scoring.mult`) and the rating stars use it;
  extras `breakdown.raw`, `breakdown.mult`, `damageTaken { rv, driver, cook }`.

## Stop flow

`parked ─0.6 s→ shopping (doc 'in') ──shopEnter──▶ doc 'out' ──shopDone/shopAbort/90 s──▶ returning (doc 'back', 2 s) → loading → done`

- `CMD.shopEnter/shopDone/shopAbort` from the cook (`sim.applyCookCommand`), and the same strings as DCMD
  (`sim.applyDriverCommand`) for solo + bots. `shopDone` implies `shopEnter`.
- Doc inside: the RV is **not** held; leaving the lot (2 m slack) cancels the stop — unlooted, not closed,
  retryable. The 90 s limit counts from 'shopping'.
- `stops.holdsRv()` is true while Doc is out (shopping/out, returning/back). `roof.holdsRv` holds the RV too.
- An abort/timeout while Doc never got out skips the 2 s run back (straight to done, closed).

## Cops sent to every stop

On `stopParked`: heat → 1.2 if below 1★; `stops.response.cops` police cars spawn through the normal spawner
(`_spawnCar`, kind cop / cop_suv) starting `delay` s after parking, each next one 1–2 s later (seeded stream 910);
they are not capped by `maxCops` and don't peel off while their stop runs; regular spawns wait until the response
is in; the heat doesn't cool while the response drives up (`cops.calledIn()`, until last spawn + 12 s or the stop
ends). `EV.STOP_COPS { eta: delay + 4 }` + toast "Someone called it in — cops on the way!". Driving off cancels
pending spawns. The Last Chance Gas alarm stays.

## Bust

`rv.stopped` accumulates while |speed| < 4 on the ground (any faster frame → 0). The meter fills only once
`stopped ≥ heat.bust.grace` and a state-1, non-redirected cop is within `bust.radius`, over `bust.seconds`;
drains at `decayPerSec`. Respawn grace still blocks it. Test l5: Easy 5 + 6 s, Hard 3 + 4 s, Extreme 1.5 + 2.5 s.

## Cops (`sim/cops.js`)

- `applyCopEffect(id, { hole: n, crack, tyre: 'fl'|'fr'|'rl'|'rr', radiator, stall: s, seconds? })` on top of
  push/soak/stall/blind/damage. Tyre → **state 9**: yaw pull to the flat side, coasts to a stop, out for
  `defend.guns.shotgun.tyreSeconds` (20) then state 5. Radiator → **state 10**: stalled, steaming,
  `defend.guns.rifle.radiatorSeconds` (15) then back to the chase. Priority tyre > radiator > stall > paint > soak;
  a state-9 car never changes; a state-10 car only gets longer. Smoke / oil ignore 9/10.
- **Officers duck and back off** (the plan's wording): a non-disabling `hole`/`crack` on a running car → for
  `defend.duckSeconds` (1.5 s) it reverses / pulls away to ≥ 14 m and neither rams nor fires (still state 1).
- 9 and 10 are disabled everywhere: heat sight, bust, loading block, lab alert, `activeCount` (they keep their slot).
- **Cops fire back** (`rules.defend.copFire`, every value defaulted, seeded stream 909): return fire while
  `rv.roofRook` from every running cop/cop_suv/interceptor within `range` going < 5 m/s, every `returnEvery`
  (±25 %); a hit (`accuracy`) → `damageRv(returnDamage, 'gunfire', true)` + `hurtDriver(returnDamage × rookShare)`.
  Chase fire from `chaseStars` at the moving RV (≥ 4 m/s) within `chaseRange`, every `chaseEvery`, hull only.
  Motos, the Rhino, parked / redirected / ducking / disabled cars never fire. `sim.cops.fireStats` counts.

## Regen

Hull (`damageRv`), Rook (`hurtDriver`) and Doc (`labLink.hurtCook`; also when Doc comes round) each have their own
last-damage time; each heals `rv.regenPerSec` after `rv.regenDelay`; never from 0; Doc not while `cookDown`.

## Rook's roof plumbing (GameSim)

- DCMD `defend / roofAim / roofFire / roofReload / roofSelect / roofThrow` → `roof.command(cmd)` (guarded; returns
  its result). The cook's old `roofEnter/roofLeave/roofAim/roofThrow` CMDs are ignored.
- The RV is held while `roof.holdsRv` (drive phase) or `stops.holdsRv()`.
- Optional import + stub as before; the stub has `holdsRv/roofRook/onRoof/climb` getters and a full idle `state()`.

## Cook logic (`cook/CookLab.js`, `cook/minigames/*`)

`lab.levers = cookLevers(data.rules)` (`rules.cook ?? 1`). `hurtMult` × fume/fire damage (LabState.cookHurt);
`zoneScale` × target zones around the same centre (measure band, heat band, stir tempo `g.tol`, cool level
`g.centre`, hammer hit radius, break slab tap); `spillMult` × the `feel.bumpHit` a step sees (Easy: a 0.7 bump spills
nothing; Extreme 1.8×); `burnerFireMult`: an unwatched heat step (station mode, Doc away) drifts × m and creeps
(m − 1) × 30 °C/s, fire amount × m (Extreme: a burner left at the band catches fire in ~8 s; Easy cools down;
Hard = today). `lab.setShopProgress({ stopId, label, frac, tLeft } | null)` → `getLabState().shop`. Hard = 1 →
every number identical to Round 2; the 2D CookUI is unchanged.

## What main.js must do (integrator)

1. **Data once per session:** `const data = withDifficulty(rawData, startPayload.difficulty ?? soloPick ?? 'hard')`
   on BOTH clients (host and cook), and pass `data` to GameSim, WorldView, Hud, CookLab, VanLab3D, ShopChallenge,
   FirstPersonDriver, DefendClient, labPilot/Autopilot. `hud.setDifficulty(data.difficulty)`;
   `difficultyInfo(level)` for colours/labels.
2. **Online cook (Doc's shop run):** `van.onShopRun = (stopDef) => { net CMD.shopEnter {stopId}; create the
   ShopChallenge }`; `onProgress(p) → lab.setShopProgress({ stopId, ...p })` (goes out in LabState.shop);
   `onDone(score) → CMD.shopDone {stopId, score}`, `onAbort() → CMD.shopAbort {stopId}`; both then
   `lab.setShopProgress(null)`, destroy the shop, `van.returnFromShop()`. If the snapshot's stop is gone or no
   longer `shopping` for that id (the driver drove off before Doc got out, or the 90 s ran out) end the shop the
   same way without sending anything.
3. **Solo:** when `snap.stop.state === 'shopping' && snap.stop.doc === 'in'`: `sim.applyDriverCommand({ type:
   'shopEnter', stopId })`, start the ShopChallenge at once; `onDone → DCMD shopDone`, `onAbort → DCMD shopAbort`;
   feed `onProgress` to `lab.setShopProgress` too (the HUD chip reads `stop.docShop` from the host's snapshot —
   in solo also call `sim.setLabState(lab.getLabState())` as today). The AI Rook climbs up by itself in solo.
4. **Driver:** F / `hud.onDefend` → `sim.applyDriverCommand({ type: 'defend', on: !snap.roof.active })`;
   DefendClient's `sendDriverCommand` → `sim.applyDriverCommand`. The old driver-side ShopChallenge (Rook shopping)
   is gone: the driver no longer sends DCMD shopDone online.
5. **Remove** the cook's `roofEnter/roofLeave/roofAim/roofThrow` sends (ignored by the sim now).
6. **Demo autopilot:** `new Autopilot(data, { seed, sim, onDriverCommand: (c) => sim.applyDriverCommand(c),
   autoShop: 25 })` still works (shopDone implies shopEnter; it now also sends the AI Rook up at stops).
   labPilot (cruise) unchanged.
7. **End screen:** `result.difficulty`, `result.scoreMult` (points already multiplied).

## Notes for other agents

- DEFEND: `cops.js` reads `defend.guns.shotgun.tyreSeconds` / `guns.rifle.radiatorSeconds` (or `eff.seconds`) and
  `defend.duckSeconds` (1.5). `sim.rookOnRoof()` exists. Seen in a trace (seed 1337 Hard, before the duck rule): the
  AI Rook skips state-10 cars, so one that recovers beside the RV can bust it within 4 s — pre-targeting a steaming
  car about to recover would help (reported to the integrator).
- DOCFP: `van/presenters/cool.js` draws its own `CENTRE = 0.22`; use `g.centre` so the level band matches the
  difficulty. Heat/measure presenters already read `g.bandMin/bandMax`, `g.min/max`.
- HUD: `bustInfo`, `crew.regen`, `stop.docShop`, `stop.doc`, `EV.REGEN.bar`, `EV.STOP_COPS`.
