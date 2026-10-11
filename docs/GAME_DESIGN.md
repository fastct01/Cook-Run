# Cook & Run: Game Design & Build Plan

> Status: **M2 "40-minute run" built** on top of the M1 prototype and the **3D van lab** (M1.5): a 40 km
> route through 13 areas, the garage tutorial, a first-person cab, 8 shop challenges with Doc's roof
> defence, 17 area events (including the desert tornado), motorbike cops and the 5-star Rhino. **Read
> [§0](#0-the-40-minute-version-what-changed) first:** where it disagrees with §4, §5 or §7 (written for the
> original 7 km route), §0 and the JSON win. The cook walks Doc around a
> cut-away 3D lab inside the moving RV instead of playing a flat 2D panel. Every number below comes
> from the data files, so the doc and the game stay in sync. Paths are cited like
> `rules.json › heat.bust`. If you change a JSON value, update the matching number here (or just
> trust the JSON; it wins). `van.json` is still being tuned, so treat its distances as approximate.
>
> This is an **original** game. It has no names, characters, vehicles, logos or quotes from any show or
> film. All lab "chemistry" is **fictional** game flavour: invented ingredients (Mesa Salts, Prickly
> Syrup…) and dexterity minigames (a gas knob, pouring, stirring). Pedestrian hits are slapstick: people
> fly, land dazed with cartoon stars and get up. No blood, no children, no animals as knock-down
> targets. Audience: adults.

---

## Contents
0. [Round 3: what changed](#0-round-3-what-changed-newest-first) · [The 40-minute version: what changed](#0-the-40-minute-version-what-changed)
1. [Pitch & core loop](#1-pitch--core-loop)
2. [Players & roles](#2-players--roles)
3. [Win, lose & scoring](#3-win-lose--scoring)
4. [The route & biomes](#4-the-route--biomes)
5. [Supply stops](#5-supply-stops)
6. [Cook gameplay: the 3D van lab](#6-cook-gameplay-the-3d-van-lab)
7. [Driver challenges](#7-driver-challenges)
8. [Art direction & asset list](#8-art-direction--asset-list)
9. [Technical architecture](#9-technical-architecture)
10. [Hosting on Render](#10-hosting-on-render)
11. [Milestones & roadmap](#11-milestones--roadmap)
12. [Risks & open questions](#12-risks--open-questions)

---

## 0. Round 3: what changed (newest first)

Round 3 was planned in the "Round 3 plan" doc (16 decisions plus three answers from the user) and split between
eight agents by `ROUND3_CONTRACT.md`. Each module's notes are in `docs/NOTES-r3-build-*.md`.

| Area | Now | Data / code |
|---|---|---|
| Roles at a stop | **Doc** jumps out of the side door and runs the shop task **in first person** (35–40 % shorter timers). **Rook** stays with the RV and defends it from the roof | `onfoot/shops/` (FpShop), `sim/stops.js` (`doc: in/out/back`, `CMD.shopEnter/Done/Abort`) |
| Cops at stops | Someone always calls it in. Parking raises the heat to at least 1★ and sends 1 / 2 / 3 cars (Easy / Hard / Extreme) | `rules.json › stops.response`, `sim/cops.js` |
| DEFEND | **F** or the button. It works while the RV stands still with a cop within 40 m and 1★ or more, or at any stop. Rook climbs onto the roof with a revolver (3 hits stall a car), a pump shotgun (bursts a tyre), a scoped rifle (a radiator hit steams and stalls the car) and the throwables (firecracker, paint balloon, smoke flare). Shots hit police cars only. Every shot adds heat. Ammo refills at stops | `rules.json › defend`, `sim/roof.js`, `defend/`, `render/ents/copDamage.js`, `gunfx.js`, `rookRoof.js` |
| Busts | Stopping never busts at once. The bust meter needs the RV stopped longer than the grace period (5 / 3 / 1.5 s), then a running cop beside it for 6 / 4 / 2.5 s. Disabled cars (tyre out, radiator, stalled, blinded) never count | `rules.json › heat.bust.grace/seconds`, `sim/heat.js` (`rv.stopped`, `bustInfo`) |
| Cops fire back | On every difficulty, more on harder ones. Return fire while Rook is on the roof (hull and Rook). Chase fire at the moving RV from 5 / 4 / 3★ | `rules.json › defend.copFire`, `sim/cops.js` |
| Health | All three bars (hull, Rook, Doc) heal 0.45 / 0.3 / 0.15 HP/s after 6 / 10 / 15 s without damage to that bar, never from zero | `rules.json › rv.regenPerSec/regenDelay`, `sim/GameSim.js` |
| Difficulty | Easy / Hard / Extreme. Hard is the standard game. About 30 levers in one block (cops, heat, bust, regen, damage, density, cooking, shops, ammo, look-around, bags 4 / 6 / 8, start gadgets, canyon penalty, score ×0.75 / 1 / 1.5). Picked on the title (solo) or by the host in the room, and locked at Start | `rules.json › difficulty`, `shared/difficulty.js` (`withDifficulty`) |
| Doc | Cooks in first person: mouse-look, WASD, look at a bench + E, gloved hands, a full-height van. **O** switches to the old cut-away overview and **V** works the vent fan. He no longer climbs onto the roof | `van/VanLab3D.js`, `van/vanCamera.js`, `onfoot/fpHands.js` |
| Cab | A realistic 1980s four-spoke wheel. The hands grip it and re-grip, and wear blue suit gloves after Suit up. PRNDL pointer, warning lamps, a radio dial with the area name. A jiggling hula girl, a mint freshener and fuzzy dice on springs, coffee and a phone | `render/fp/cabR3.js`, `trinkets.js`, asset `rv_cab_fp_r3` |
| Garage | A 7-step tutorial with **Suit up**. Chemistry gear and protective apparel line the walls. Floor chevrons and a floating OUT arrow show the way out | `sim/garage.js`, `onfoot/GarageView.js`, `render/world/startDistrict.js` |
| Start district | Tow yard, tyre shop, diner, corner mart, tank farm, pumpjacks, water tower, pipe bridge, utility poles around the garage, with sim colliders | `render/world/startDistrict.js`, `sim/structures.js` |
| Rook | A young adult of about 20 in a beanie and an oversized red hoodie, everywhere (`driver` → `rook_young`) | `assets/index.js` |
| Interface | "Dark glass": near-black see-through panels, Archivo + Fraunces, standard icons. A heat slider under the stars, map pins on the route strip, a pulsing + on healing bars, the DEFEND button with a cop ring, Doc's shop chip, and a difficulty tile on the end screen | `css/tokens.css`, `ui/hud.js`, `docs/r3/ui/*.png` |
| Title | The desert title is back and live: cars both ways, tumbleweeds, pumpjacks, vultures, and every 18 s the RV wiggling past, smoking (every other time with a cop behind). The same scene is the loading screen | `ui/titleScene.js`, `ui/lobby.js`, `index.html #boot` |

## 0. The 40-minute version: what changed

The expansion was planned and signed off in the plan doc (assets + plot), split between agents by
`EXPANSION_CONTRACT.md`, and each module's notes are in `docs/NOTES-x-*.md`.

| Area | Now | Data / code |
|---|---|---|
| Route | 40 km, 13 areas: Ironworks District, Downtown, Old Town, Harbour Docks, Maple Heights, Interstate 9 (6 lanes), Strip-mall Outskirts, Farmland, Pine Foothills & River, Salt Flats, Ghost Town, Red Canyon, Starlite Drive-In. Day runs from dawn (6:36) to dusk. Par time 45 min; a clean run is about 40 | `route.json › biomes`, `timeOfDay`, `rules.json › parTimeSeconds` |
| Start | Rook's Garage: a 6-step co-op tutorial on foot (find your spot, grab the gear, load the crate, open the door, all aboard, start her up). The host can skip it | `sim/garage.js`, `onfoot/GarageView.js` |
| Driver view | First person from the cab with live mirrors, gauges, wipers and windscreen fog. **C** gives a 3 s third-person look-around every 30 s | `render/fp/` |
| RV | Regenerates 0.2 HP/s once 10 s have passed without damage | `rules.json › rv.regenDelay`, `regenPerSec` |
| Supply stops | 8 stores, each announced 800 m ahead by a **STOP AT …** banner (both players) and an arrow from 600 m. Stopping in the lot sends Rook into a shop challenge (collect, haggle, forklift, pump, trolley, goat, crane, alarm). The score scales the supplies; ≥ 80 % earns a bonus | `route.json › stops[].shop`, `sim/stops.js`, `onfoot/shops/` |
| Roof defence | While Rook shops, Doc climbs out of the roof vent (**R**) and keeps cops off the RV: hose (soak and push back), firecrackers (stall), paint balloons (blind), smoke flares. In solo an AI Doc does it | `rules.json › roof`, `sim/roof.js`, `van/roof/` |
| Heat | Motorbike cops from 2★. At 5★ an armoured **Rhino** truck gets ahead and throws flash and foam canisters in front of the RV | `rules.json › heat.levels[].moto/.rhino`, `heat.rhino` |
| Hazards | Sewer steam leaks (animated vapour that fogs the windscreen), water mains, trench plates, open manholes, sinkholes, speed bumps, broken-down cars, trolleys, downed power lines, logs, dust devils, flash floods, sheep, foam patches | `rules.json › obstacles` |
| Area events | Freight train, the Midnight Comet (an original masked hero outrunning six cop cars), Founders' Day parade, drawbridge, wide load, car carrier, toll plaza, inflatable gorilla, car wash (−1★), cattle drive, combine harvester, log spill, the Rattlers biker gang, **tornado with flying cars**, runaway stagecoach, Sergeant Pratt's last chase, the handover | `route.json › setpieces`, `sim/setpieces/` |
| Canyon | The broken bridge is at 38.9 km (same 24.5 m/s jump); the drive-in sell point at 39.8 km | `route.json › bridge`, `sellPoint` |
| HUD | Wanted stars without the underlines, status chips (Rook in the shop, Doc on the roof, loading, cops at the lot), area titles, event captions, look-around ring | `ui/hud.js` |
| Sound | V8 engine through a simulated 3-speed automatic, starter crank, tyre roar, gravel, brake squeal, rattles and glassware clinks | `render/audio.js` |

---

## 1. Pitch & core loop

**Pitch.** A burned-out science teacher and his reckless ex-student run a rolling lab in a battered RV.
One player drives 7 km from downtown to a canyon hideout with the cops on their tail. The other walks
Doc around the cramped lab in the back of the moving van, cooking batches of the invented product
"Desert Glass" at real benches, crafting gadgets for the driver, and trying not to set the van on fire.
Every pothole the driver hits knocks Doc off his feet, and every puff of smoke from the cook's vent
brings more cops.

**Core loop**

```
            ┌───────────────── materials ─────────────────┐
            │                                             ▼
   STOP FOR SUPPLIES ◀──── DRIVE ═══ smooth ride ════▶   COOK (walk the van, work the benches)
   (5 lots, 4–5 s)        (Rook)  ◀═ gadgets, repairs ═ (Doc)
                           ▲   │                          │
            outrun, smoke, │   │ crashes, ped hits,       │ vent smoke, lab spotted,
            oil, nitro     │   ▼ cop rams, patrols        ▼ explosions
                         ESCAPE HEAT ◀────────────────────┘
                           │
                           ▼  at 6.3 km
                   JUMP THE CANYON (cops give up) ──▶ SELL at the drive-in (≥ 6 bags, 6.9 km)
```

Each run takes about 4–7 minutes. Par time is **420 s** (`rules.json › scoring.parTimeSeconds`), an
average of 16.7 m/s over the 7,000 m route. At full throttle with no stops the RV needs about 233 s.
The gap between the two is the time you spend stopping, dodging and cooking.

---

## 2. Players & roles

### Driver: "Rook" (keyboard)
Trucker cap, flannel, sunglasses. Rook sees the chase camera and the full HUD.

| Key | Action | Notes (`rules.json`) |
|---|---|---|
| W / ↑ | Throttle | accel 7.5 m/s², top speed **30 m/s** (108 km/h) (`rv.accel`, `rv.topSpeed`) |
| S / ↓ | Brake, then reverse | brake 16 m/s², reverse 8 m/s |
| A / ← · D / → | Steer | steer rate 1.9, self-centres at 3.0 (`rv.steerRate`, `rv.steerReturn`) |
| Space | Handbrake | slides the 8.6 m RV round tight corners and into lots |
| H | Horn | scares pedestrians within **22 m** into running (`peds.hornScareRadius`) |
| Q | Smoke bomb | needs a charge (you start with **1**, `rules.sim.startGadgets`; more are crafted by the cook) |
| E | Oil slick | needs a charge |
| Shift | Nitro | needs a charge; 3.5 s at up to 40 m/s |
| R | Reset | puts the RV back on the road if it gets stuck |
| Tab | Solo only: climb into the back and cook (an autopilot drives) | see *Solo mode* below |
| Esc / P | Pause (solo) or menu (online) | |
| M | Mute | audio only |

Grip is 0.92 on asphalt and 0.75 off-road. Leaving the road costs speed (`offroadSlow` 0.55, sand
`sandSlow` 0.4).

Online, Rook never sees inside the van: the interior is hidden in his chase view. He reads the lab from
the outside, the way a real driver would: chimney smoke when the vent is open, a haze in the windows,
an orange fire glow (`rv › window_glow`), and Doc's callouts on his HUD.

### Cook: "Doc" (keyboard + mouse, or touch)
Orange rubber apron, lab goggles, respirator hanging round the neck. **Doc is a character in a 3D lab in
the back of the moving RV.** The cook player walks him from bench to bench and cooks at physical
stations: a recipe board, a pantry, a grinding bench, a measuring bench, a stove, an ice bath, a
bagging bench, a hull patch on the wall, the vent fan, the curtain cord, the extinguisher and the
product stash (floor plan in §6).

The camera is a **cut-away "dollhouse" view**: the roof is removed and the near walls are cut down to
about counter height, and the camera looks back across the van from high above the door side
(`van.json › camera.dollhouse`). So Doc sees the benches **and** the road around the van: the traffic,
the chasing cops behind, and the cruiser pulling alongside. The interior is parented to the RV's body,
so it leans, pitches and bounces with the van; the camera rides along but takes only about 30% of the
pitch and roll, so bumps don't shake the picture. When Doc starts working a station, the camera eases into a
**close-up of that bench**, and the step is played with the mouse on 3D props: grind with the pestle,
pour from the bottle, turn the gas knob, stir the pot, level the ice tray, snap crystal shards,
hammer nails. Stepping away eases the camera back out.

| Input | Action |
|---|---|
| W A S D / arrows | Walk (screen-relative: W is up the screen) |
| E or Space | Use the station Doc is at: open the recipe board, start or continue the step, toggle the vent or curtains, grab or spray the extinguisher, beat a fire with a towel |
| Q or Esc | Step away from the station, or put the extinguisher down (otherwise Esc opens the menu) |
| Click the floor | Walk there |
| Click a station | Walk there and use it |
| Drag / click while working | Play the step on the 3D props. Some steps take keys too: A/D or ←/→ turn the gas knob and press the ice tray level, hold Space to pour |
| Mouse wheel | Zoom (3 levels, `van.json › camera.zoomLevels` 0.75 / 1.0 / 1.35) |
| Touch | Tap to walk or use, drag to play |
| M | Mute |

The **next station** is highlighted with a glowing floor ring and a bouncing arrow. The van HUD shows a
prompt ("E · Stove"), a step panel (step name, progress and the control hint for that bench) and, at the
recipe board, the recipe overlay. A step station that isn't needed says so ("Not needed right now",
"Next step: Stove").

**Classic 2D lab.** `?lab2d=1` keeps the original flat lab panel (`CookUI`: the recipe book, a 2D bench
for each minigame, toggles for the vent, curtains and extinguisher, hotkeys V / C / X and `=` / `-`). It
is the fallback for weak GPUs and the reference for the minigame logic.

### How the roles depend on each other

| What the driver does | What happens in the van |
|---|---|
| Hard cornering (`feel.latAcc`, about ±4 m/s² typical) | Above **2.5 m/s²** (`van.json › sway.latAccStart`) a walking Doc slides across the aisle toward the outside of the turn; a working Doc holds the counter and leans. At the benches: the pour stream swings and misses the beaker, liquid tilts, the ice tray tips |
| Potholes, rocks, kerbs, landings (`feel.bump` 0–1) | Doc hops at **0.35**. At **0.6** a walking Doc stumbles for 0.7 s and drops the extinguisher (`sway.bumpHop`, `stumbleBump`); a working Doc holds on. Above **0.55** (`lab.json › hazards.bumpSpillThreshold`) powder spills, the flask sloshes, the burner temperature jumps and shards fall off the bench. A hard landing after the jump counts as a full bump |
| Smooth driving while Doc cooks | **+2 points/s** (`scoring.smoothBonusPerSec`) while \|latAcc\| < 2 m/s², bump < 0.08 and speed > 5 m/s (`rules.sim.scoring`). And a Doc who isn't being thrown about is a faster Doc |
| Pulling into supply lots | The only source of ingredients. Refills the extinguisher. The van stands still for 4–5 s: the calmest moment for the hardest pour |

| What the cook does | What happens to the driver |
|---|---|
| Crafts Smoke Bomb, Oil Slick, Nitro Brew | Gives the driver Q / E / Shift charges |
| Patch the Hull / Ice Pack | RV +30 hp / crew +30 hp |
| Turns on the vent fan | Clears fumes, but the chimney smokes: **+0.02 heat/s** while cooking (`heat.sources.ventSmokePerSec`). It doesn't count as a witnessed incident, so it never stops heat from decaying |
| Leaves the curtains open while cooking with a cop within 18 m | **Spotted: +0.8 heat** (almost a full star, 6 s cooldown, `rules.sim.lab`) |
| Lets fumes build above 0.75 | The driver loses 1.5 hp/s too (`hazards.fumesDriverDamagePerSec`) |
| Lets a fire grow / explode | RV up to −3 hp/s while it burns (scaled by the fire's size); explosion RV −25, heat +0.6 |

**Callouts.** Doc has quick-callout buttons ("Slow down!", "Hold it steady!", "Pull over at the next
stop!", "Gadget ready!", "Floor it!"; 0.8 s cooldown) that pop up on Rook's HUD. When a cop is within
18 m (`snapshot.alert.copClose`) Doc's screen flashes **"COP ALONGSIDE: CLOSE THE CURTAINS"**, and in the
dollhouse view he can see the cruiser right next to the van. The curtain cord is at the front, by the
side door, so closing the curtains means walking there. Closed curtains also make the lab darker, so
the benches get harder to read: a short-term choice, not a habit. Both sides can send short chat
callouts (`GM.CHAT`). Proposed driver callouts: "BUMP AHEAD!", "PULLING OVER", "HANG ON, JUMP!".

### Solo mode: Tab between the wheel and the lab
One player, one tab, one keyboard and mouse. You start at the wheel (chase camera, keyboard drives).
Press **Tab** to climb into the back: the camera eases into the dollhouse view, **an AI autopilot takes
the wheel**, and W A S D now walk Doc. Press Tab again to take the wheel back. The same message path
runs through `LocalBus` instead of the network.

- **The autopilot** (`sim/autopilot.js`, configured in `main.js` as "cruise mode") keeps the RV in the
  forward lane at a steady 19 m/s (≈ 68 km/h), steers round slow traffic, honks at pedestrians and waits
  for the train. It deliberately **does not pull into supply stops** (you get a toast: "Bolt & Barrel
  Hardware ahead — Tab to drive in and load up"), never uses Nitro, and **hands the wheel back
  automatically** 520 m before the broken bridge ("BRIDGE OUT AHEAD — take the wheel for the jump!") and
  320 m before the drive-in. At 19 m/s it is too slow for the jump (24.5 m/s needed), so the big moments
  stay yours. It is a steady van driver, not a getaway driver: take the wheel for hot chases and roadblocks.
- **While you drive, Doc waits** where you left him. A running step pauses, **except the burner**: a
  heat step keeps cooking (and can catch fire) whether anyone is at the stove or not.
- The skill in solo is choosing *when* to switch: cook on quiet straights, drive the busy bits.

---

## 3. Win, lose & scoring

### Win
Reach the **Abandoned Drive-In** sell point (z = 6,900 m, within an 18 m radius, `route.json ›
sellPoint`) with **≥ 6 bags** (`sellPoint.requiredUnits`), the RV alive and the crew alive.

### Lose (`snapshot.lostReason`)

| Reason | Trigger | Data |
|---|---|---|
| `wrecked` | RV hp reaches 0 (max 100) | `rules.json › rv.maxHp` |
| `busted` | A chasing cop within **7.5 m** while the RV is under **4 m/s** fills the bust meter in **2.5 s**. It drains at 0.6/s when you get free. A moving RV can only be rammed, never busted | `heat.bust` |
| `crewDown` | Driver hp reaches 0 (max 100): fumes reach the cab, and 8% of every RV impact also hurts each crew member. If **Doc** hits 0 he only passes out for 12 s and comes back with 25 hp | `rv.crewMaxHp`, `rules.sim.lab` |
| `noProduct` | You arrive at the sell point with fewer than 6 bags | `sellPoint.requiredUnits` |

Falling into the canyon is not a loss. You respawn at the checkpoint (z = 5,880) with −30 RV hp and
−1 bag (`bridge.fallPenalty`), with the cops cleared and 2 s of grace.

### Scoring

**Payout** (the money, shown on the end screen):

```
payout = Σ over batches  bags × 1200 × quality × recipe valueMult
         (perUnitValue = 1200; Street ×0.7, Premium ×1.4; quality 0–1 from the minigames)
```

| Example | Payout |
|---|---|
| Minimum win: 6 Street bags at quality 0.7 | 6 × 1200 × 0.7 × 0.7 ≈ **3,530** |
| Perfect run: 4 Street + 8 Premium bags at quality 1.0 | 3,360 + 13,440 = **16,800** |

**Points** (the chaos score, `rules.json › scoring` and `obstacles.*.points`):

| Source | Points |
|---|---|
| Pedestrian knocked (slapstick) | +100 each, +1 chaos |
| Smashed prop | cone 5 · sprinkler 5 · tumbleweed 5 · trash can 10 · barrier 10 · roadside cactus 10 · mailbox 15 · hay bale 15 · hydrant 20 · police roadblock 50 |
| Cop wrecked | +250 |
| Smooth driving while Doc cooks | +2/s |
| Payout | + payout ÷ 10 |
| Time under par (420 s) | +4 per second under |
| **Clean run**: zero pedestrians knocked | +1,500 |

There are two valid playstyles: a chaos run (smash everything, high heat) and a clean run
(+1,500, low heat). The +0.45 heat per pedestrian makes chaos expensive.

**Star rating (1–3)** from the final points (`rules.json › scoring.stars` = `[0, 2500, 4000]`; a lost run
gets 0):

| ★ | ★★ | ★★★ |
|---|---|---|
| Any win | ≥ 2,500 points | ≥ 4,000 points |

For scale: a clean minimum win (≈ 350 payout points + 1,500 clean bonus + a little smooth and time bonus)
lands around 1,900–2,300, one star. A clean 12-bag run at high quality (≈ 1,680 + 1,500 + up to ~370
smooth points) reaches two stars. Three stars needs that plus a fast time (4 points per second under
par) or some cop wrecks.

---

## 4. The route & biomes

The road is one continuous 7 km two-way highway along +Z. Traffic drives on the right (US-style:
forward lanes are on the driver's right). Curves come from one global wiggle (base wavelength 600 m)
whose amplitude each biome scales (`curveAmp`). Borders cross-fade over 80 m (`biomeBlend`), so the
road never kinks. The seed shifts the curve phases, so each run's road is slightly different.

### Biome numbers (`route.json › biomes`)

| Biome | km | Lanes × width | Shoulder | Curve amp | Traffic / ped / obstacle per 100 m | ≈ count over the biome | Fog near–far |
|---|---|---|---|---|---|---|---|
| **Downtown** | 0 – 1.4 | 4 × 3.4 m, sidewalks | 3.0 m | 4 m | 2.6 / 3.5 / 0.9 | 36 cars · 49 peds · 13 obstacles | 80–300 m |
| **Suburbs** | 1.4 – 2.8 | 2 × 3.6 m, sidewalks | 2.6 m | 16 m | 1.6 / 2.0 / 1.0 | 22 · 28 · 14 | 90–340 m |
| **Outer Suburbs & Farms** | 2.8 – 4.2 | 2 × 3.5 m | 2.0 m | 26 m | 1.0 / 0.6 / 1.1 | 14 · 8 · 15 | 110–380 m |
| **Open Desert** | 4.2 – 5.8 | 2 × 3.6 m | 1.6 m | 22 m | 0.5 / 0.1 / 1.3 | 8 · 2 · 21 | 130–460 m |
| **Red Canyon** | 5.8 – 6.55 | 2 × 3.6 m | 1.0 m | 10 m | 0.15 / 0 / 0.9 | 1 · 0 · 7 | 120–420 m |
| **Buyer's Hideout** | 6.55 – 7.0 | 2 × 3.6 m | 1.5 m | 6 m | 0 / 0 / 0.3 | 0 · 0 · 1 | 120–440 m |

### Biome feel & events

| Biome | Look & feel | Traffic | Obstacles | Scenery | Special event |
|---|---|---|---|---|---|
| **Downtown** | Grey concrete (`#8a8c90`), dark asphalt, yellow lines, tight urban fog. Four lanes, intersections with crosswalks every 200 m | sedan, hatch, **bus**, pickup | cone, trash can, barrier, hydrant (geyser!), pothole | buildings, streetlights, traffic lights, city trees, benches | Pedestrian crowds at crosswalks. **Parked patrol cars** at about half the intersections (speed limit 17 m/s). Hardware store at 0.62 km |
| **Suburbs** | Green lawns (`#7fa063`), white lines, picket fences. Lazy curves, intersections every 260 m | sedan, hatch, pickup, van | mailbox, trash can, cone, pothole, sprinkler | houses, round trees, fences, decorative mailboxes, streetlights | **Roadwork 2.15–2.33 km**: the forward lane is closed with barriers and cones. Parked patrols (limit 20 m/s). Gas & Ice at 1.95 km |
| **Outer Suburbs & Farms** | Straw-gold fields (`#b5a76a`), the widest curves on the route (26 m), no sidewalks | pickup, **tractor** (4–6 m/s), truck, sedan | hay bale, **cow** (solid), pothole, small rock | barns, silos, farmhouses, wooden fences, windmills, power poles | **Train crossing at 3.55 km**: a 24 s cycle with 5 s of warning bells, then 7 s of train. Junkyard 3.15 km, Farm 3.95 km |
| **Open Desert** | Sand (`#d8b47c`), long sight lines, heat-haze sky, very few people | truck, pickup, **rival** dealer | tumbleweed (rolling), rock, sand drift, pothole, roadside cactus | cacti, big rocks, mesas, shacks, power poles, billboards | **Last Chance Gas at 5.05 km trips an alarm** (the finale chase starts). **Dust storm 5.25–5.55 km**: an orange-brown haze replaces the fog, and cops lose sight of you |
| **Red Canyon** | Red rock (`#c4774a`), canyon walls, an orange late-afternoon sky. Narrow 1 m shoulders | the odd truck | rock, small rock | canyon walls, big rocks, cacti, warning signs | **Rockfall 5.9–6.15 km** (a rock every 2.2 s, landing 0.8–1.8 s before you arrive). Bridge straight from 6.05 km. **Broken bridge jump at 6.3 km**: cops give up here |
| **Buyer's Hideout** | Dusk (`#e79a6e` sky), empty road, mesas: the calm after the jump | none | tumbleweed | cacti, big rocks, mesas, power poles | **Sell point**: the Abandoned Drive-In at 6.9 km (driver's right) |

The palette shifts from pale midday blue (`#a7c7d6`) downtown to sunset orange in the canyon. The run
reads as one long afternoon.

### The canyon jump (`route.json › bridge`)

| Piece | z (m) | Detail |
|---|---|---|
| Straight approach | 6,050 → 6,250 | Curves fade to zero so the run-up is dead straight |
| Ramp | 6,250 → 6,300 | Rises 8 m (a 9.1° lip) |
| Gap | 6,300 → 6,342 | **42 m**, 60 m deep |
| Landing | 6,342 → 6,370 | Flat deck at ground level |

Ballistics with g = 9.81 from an 8 m lip:

| Speed at the lip | Flight | Airtime | Result |
|---|---|---|---|
| 22 m/s (79 km/h) | 36.5 m | 1.7 s | falls short → checkpoint |
| **24.5 m/s (88 km/h)** (`minSpeedHint`) | 41.9 m | 1.7 s | just makes it (the sim's `speedNeeded`, with a 1 m landing margin, is ≈ 25.0 m/s) |
| 30 m/s (top speed) | 54.8 m | 1.9 s | comfortable |
| 40 m/s (nitro) | 81.9 m | 2.1 s | cinematic |

The HUD shows `bridge.dist` and `bridge.speedNeeded`. With `heat.giveUpAtBridge` set, all cops give up
at the bridge (`EV.COPS_GAVE_UP`); a cop within 15 m behind you at the lip sails off the ramp and falls.
Saving one Nitro Brew for the run-up is the classic play. In the van, the landing is a full bump: spills
at the bench, a stumble in the aisle.

---

## 5. Supply stops

### The five lots (`route.json › stops`)

| Stop | km | Side | Lot (L × D) | Load time | Gives | Why it matters |
|---|---|---|---|---|---|---|
| **Bolt & Barrel Hardware** | 0.62 | right | 34 × 14 m | 4.0 s | Mesa Salts ×2, Canyon Solvent ×1 | Salts for every product batch; enough for Street Batch #2 straight away |
| **Sunny Gas & Ice** | 1.95 | **left** (cross the oncoming lane) | 34 × 14 m | 4.0 s | Burner Gas ×2, Bag of Ice ×2 | Fuel after your starting kit. Ice for Premium, Nitro and Ice Packs |
| **Rustbucket Junkyard** ★ key | 3.15 | right | 40 × 16 m | 5.0 s | Copper Coil ×2, Scrap Metal ×3 | **Only source of Copper Coil** (Premium) and Scrap (Oil Slick, Patch) |
| **Prickly Pete's Farm Supply** ★ key | 3.95 | **left** | 36 × 14 m | 4.5 s | Prickly Syrup ×2, Mesa Salts ×1 | **Only source of Prickly Syrup** (Premium) |
| **Last Chance Gas** | 5.05 | right | 34 × 14 m | 4.0 s | Burner Gas ×2, Canyon Solvent ×2, Bag of Ice ×1 | The last top-up before the canyon. **The clerk trips an alarm: +2.6 heat** (`stops[lastgas].alarm`, straight to ★★) and cops arrive 2 s later. The finale chase runs through the desert and canyon to the bridge |

### How stopping works
1. 250 m out, the HUD shows the next stop (`snapshot.nearStop`) and a pulsing ground marker shows the
   lot.
2. Pull into the lot rectangle beside the road (`Track.stopLot(stop)`) and slow to under **2.5 m/s**
   (`rules.sim.stops.maxLoadSpeed`).
3. A loading bar fills over the stop's `loadTime` (`snapshot.stop.progress`). Leaving early cancels it.
4. **Blocked**: while any chasing cop is within **25 m**, loading pauses (`snapshot.stop.blocked`).
   Stopping is also when you're bustable (cop within 7.5 m and you under 4 m/s for 2.5 s). Shake the
   cops first.
5. When the bar finishes, the materials go into the inventory (`EV.STOP_DONE`; the pantry jars fill up)
   and the extinguisher refills. Each lot can be looted once per run.

---

## 6. Cook gameplay: the 3D van lab

Doc cooks **in 3D, inside the moving RV**. The lab is a 6.3 × 2.4 m box behind the cab partition, with
2.3 m of headroom (`van.json › rv`). Its layout, every station and Doc's walking area live in
**`public/js/data/van.json`** in RV-local metres (origin = RV ground centre, +Z = front, +Y up, **+X =
the driver's left**; the rust-red side door is on −X). The interior is parented to the RV's body, so it
inherits position, yaw, pitch, roll and sway automatically.

The step logic is unchanged from the 2D lab: `CookLab` (state machine, hazards, protocol) and the
minigame classes in `public/js/cook/minigames/*` decide scores, spills and failures. The 3D layer adds
**where** each step is played, **how** it's played (3D props instead of a 2D bench), and **the cost of
moving between them**.

### The van floor plan
Drawn from `van.json` (top view, front at the top; 1 column ≈ 5 cm, 1 row = 25 cm; the left side of the
plan is the driver's left, +X).

```
                                ┌────────────────────────────────────────────────┐   FRONT (+Z)
      z +2.93                   │            (◎)                                 │   steering wheel
      z +2.50                   │          [ROOK]                [seat]          │   CAB
      z +2.15                   ├───────────────[ 1 RECIPE BOARD ]───────────────┤   cab partition
      z +2.11                   │                                                │
                                │                                                │
                                │┌────────────┐    · · · ● · · ·   ┌────────────┐│
      z +1.45                   ││2 PANTRY    │    ● · · · · ·●·   │3 GRINDING  ││
                                │└────────────┘    · · · · · · ·   └────────────┘│
                                │                  · · · · · · ·                 │
      z +0.65                   │┌────────────┐    · · · · · · ●                 ╡ ◀ 5 CURTAIN CORD
      z +0.45                   ││4 MEASURING │    ·●· · · · · ·                 ║   rust-red side door
                                │└────────────┘    · · · · · · · · · · · · ·     ║
                                │                  · · · · · · · · · · · · ·     ║
                                │┌────────────┐    · · · · · · · · · · · · ·     ║
      z -0.65                   ││6 STOVE     │    ·●· · · · · ·                 ║
                                │└────────────┘    · · · · · · ·                 │
                                │                  · · · · · · ·   ┌────────────┐│
      z -1.35                   │                  · · · · · ·●·   │8 ICE BATH  ││
      z -1.50       7 VENT FAN ▶╞                  ● · · · · · ·   └────────────┘│
                                │                  · · · · · · ·                 │
                                │┌────────────┐    · · · · · · ·                 │
z -2.30/-2.35                   ││9 BAGGING   │    ·●· · · · · ●                 ╡ ◀ 10 HULL PATCH
                                │└────────────┘    · · · · · · ·                 │
                                │                  · · · · · · ·                 │
                                │      · · · · · · · · · · · · · · · · · · ·     │
                                │      · · · · · · · · · · ·    ●                │
      z -3.55  11 EXTINGUISHER ▶╞      · · · ● · · · · · · ·       ┌────────────┐│
      z -3.83                   │      · · · · · · · · · · ·       │12 STASH    ││
                                │                                  └────────────┘│
                                └────────────────────────────────────────────────┘   REAR (−Z)
                                 +X  driver's left            door side  −X
```

`●` = where Doc stands to use a station (`stations[].stand`). `·` = floor Doc's centre can occupy
(`walkable`: the aisle, the side-door well and the rear area, already inset by his 0.24 m radius).
`▶` / `◀` = wall-mounted stations. The cab is not walkable: Rook sits at the wheel (the `driver` model),
and the steering wheel turns with `rv.steer`.

| # | Station (`id`) | Kind | Position (x, z) | Side | Steps worked here |
|---|---|---|---|---|---|
| 1 | Recipe Board (`recipe`) | board on the cab partition | 0.00, +2.11 | centre | – (choose a batch) |
| 2 | Pantry (`pantry`) | shelf | +0.98, +1.45 | driver's left | – (ingredient jars) |
| 3 | Grinding Bench (`grind`) | counter | −0.88, +1.45 | door side | `grind` |
| 4 | Measuring Bench (`measure`) | counter | +0.88, +0.45 | driver's left | `measure` |
| 5 | Curtain Cord (`curtains`) | wall | −1.15, +0.65 | door side | – (toggle curtains) |
| 6 | Stove (`stove`) | counter | +0.88, −0.65 | driver's left | `heat`, `stir` |
| 7 | Vent Fan (`vent`) | wall | +1.15, −1.50 | driver's left | – (toggle vent) |
| 8 | Ice Bath (`cool`) | counter | −0.88, −1.35 | door side | `cool` |
| 9 | Bagging Bench (`break`) | counter | +0.88, −2.30 | driver's left | `break` |
| 10 | Hull Patch (`hammer`) | wall | −1.15, −2.35 | door side | `hammer` |
| 11 | Extinguisher (`extinguisher`) | wall | +1.15, −3.55 | driver's left | – (grab it) |
| 12 | Product Stash (`stash`) | crate | −0.80, −3.83 | door side | – (bags carried) |

Benches are 0.95 m high (`counterHeight`). The step-to-station map is `STEP_STATION` in
`public/js/cook/stations.js` (shared by CookLab and the presenters). Ids are never renamed; positions
may be tuned.

### Flow of a batch
1. **Recipe board.** Walk to the board at the front and press E. The recipe overlay lists every
   recipe, greyed out when the pantry is short. Pick one: `lab.requestRecipe(id)` sends
   `CMD.START_RECIPE`, and the host checks and deducts the inventory (`EV.RECIPE_OK` /
   `RECIPE_DENIED`, 5 s timeout).
2. **Follow the highlight.** The first step's station lights up (floor ring + bouncing arrow). Walk
   there and press E (or just click the bench). The camera eases into the close-up and the step
   starts taking input.
3. **Play the step** on the 3D props (below). When it's done, a 1.1 s result stamp shows the score and
   the next station lights up. The walk to it overlaps the stamp.
4. **Repeat** until the last step. Product bags appear in the stash crate, gadget charges go to Rook's
   HUD, and repairs heal.

**Batch quality** is the weighted average of the step scores:

| Step | grind | measure | heat | stir | cool | break | hammer |
|---|---|---|---|---|---|---|---|
| Weight | 0.8 | 1.0 | **1.5** | 1.2 | 1.2 | 0.8 | 1.0 |

Product batches add bags and blend `inv.quality`. Gadgets add a charge, and repairs heal. Quality
matters most for product. For gadgets and repairs, finishing the steps is what counts. A failed or
dumped batch loses its ingredients.

**Station presence** (`lab.setPresenceMode('station')`). Input only reaches the minigame while Doc is
at the step's station. While he's away, every step type **pauses**, except `heat`: **the burner keeps
burning**, the temperature keeps drifting, and a fire can start. Fumes and fire always run.

### Station by station

| Station | What's there (3D) | Using it |
|---|---|---|
| **Recipe Board** | A corkboard of recipe cards on the cab partition | Opens the recipe overlay (choose a batch) |
| **Pantry** | A shelf of seven jars, one per ingredient; each jar's fill level is its count | Shows the counts (tooltip / overlay list). Glance from across the van, or walk over for exact numbers |
| **Grinding Bench** | Mortar and pestle | `grind` steps: Premium "Grind the salts", Ice Pack "Crush the ice" |
| **Measuring Bench** | A bottle over a graduated beaker | Every `measure` step: Street, Premium, Smoke Bomb (pack the canister), Oil Slick (fill the can), Nitro (measure the brew) |
| **Stove** | Gas ring with a knob, a pot with a clip-on dial thermometer, a spoon | `heat` and `stir` steps: Street, Premium, Smoke Bomb (mix the fuse), Nitro (pressurise) |
| **Ice Bath** | An ice tray with a spirit level on its rim | `cool` steps: Street, Premium |
| **Bagging Bench** | A slab of teal crystal and a row of bags | `break` steps: Street, Premium |
| **Hull Patch** | A scrap plate over a hole in the wall, nails, a hammer | `hammer` steps: Patch the Hull, and the Oil Slick's drip can |
| **Vent Fan** | An extractor fan in the wall, ducted to the crooked roof chimney | `lab.toggleVent()`: the fan spins, smoke pours out of the chimney |
| **Curtain Cord** | A cord by the side door | `lab.toggleCurtains()`: every window's curtain slides at once; closed curtains darken the lab |
| **Extinguisher** | A wall-mounted extinguisher at the back | Doc grabs it and carries it. Holding E (or the mouse, aimed at the fire) sprays: `lab.useExtinguisher()` once per press (−0.6, 3 charges) plus `lab.extinguish()` while held. A big bump knocks it out of his hands; E picks it up off the floor, and E at the bracket hangs it back |
| **Product Stash** | A crate at the back | Shows the bags carried; finished bags pile up in it |

Without the extinguisher, pressing E next to the fire beats it with a towel (`lab.extinguish()`, −0.18 a
hit).

### The minigames in 3D (`public/js/van/presenters/**`, logic in `public/js/cook/minigames/*.js`)

Each step type has a 3D **presenter** that builds its props on the station's work surface, reads the
minigame's state every frame, and turns mouse drags on the props into the minigame's input. The
numbers are from `lab.json › recipes[].steps`. Van motion arrives through `snapshot.feel`.

| Step (station) | How it's played in 3D | How the van interferes | Scoring |
|---|---|---|---|
| **Grind** (Grinding Bench) | **Mortar & pestle.** Drag in circles over the mortar for N turns (Premium 6, Ice Pack 4); the pestle follows. The close-up looks down into the bowl. Wiggling back and forth doesn't count | A bump above 0.55 throws powder out over the counter (−6% or more). Below 12% powder the mortar tips over and the batch **fails** | Score = powder left |
| **Measure** (Measuring Bench) | **Hold to pour.** Press and hold on the bottle or the beaker (or hold Space): the bottle lifts, tilts and pours into a graduated beaker. The **target band** glows on the beaker wall; release when the level is inside it | Lateral g swings the stream: misses splash on the counter. A bump while pouring sloshes in an extra random amount. Over 100% = **spill** | In band: 0.75–1.0 (best at the band centre). Outside: 0.2–0.74. Spill: 0.2 |
| **Heat** (Stove) | **Gas knob + pot thermometer.** Drag the knob on the stove's front (up/right = more gas) or hold A/D (←/→). The flame ring follows the knob; the needle of the dial thermometer clipped to the pot lags behind (the temperature has inertia) and drifts. Hold it in the green for N cumulative seconds. Steam and bubbles grow with the heat, and the lid rattles when it's too hot | Bumps jolt the temperature by ±(8 + 18 × bump)°. Above the fire point the stove **catches fire**. Hotter = more fumes. **The burner keeps running while Doc is away** | time-in-band ÷ max(duration, time since first reaching the band) |
| **Stir** (Stove) | **Spoon circles.** Drag circles over the pot; the wooden spoon follows and the liquid swirls. A **rhythm ring** pulses round the pot at the target tempo: mustard when you're too slow, green when you're on it (±10% gets full credit), red when you're too fast | A bump above 0.55 sloshes the pot and costs 0.35 s of good stirring | time at a good tempo ÷ time stirred |
| **Cool** (Ice Bath) | **Ice tray + spirit level.** The product tray sits in a steel tub of ice, with a spirit level on it. Move the pointer left/right over the counter (or hold A/D, ←/→): a rubber glove presses that side of the tray down. Keep the bubble centred for N seconds | The tray tilts with lateral g and gets kicked by bumps. Full tilt for > 1 s slops a third of the bath. **3 slops = ruined batch** | levelness × (0.4 + 0.6 × bath left) |
| **Break** (Bagging Bench) | **Snap shards into bags.** Click the crystal slab: a little hammer taps a shard off and it arcs into the open bag beside the tray (Street 6 shards, Premium 10) | Bumps knock loose shards off the bench onto the floor (lost) | bagged ÷ total × time factor. Par = 2.2 s + 0.9 s per shard. Under 70% of par = "Fast hands!" |
| **Hammer** (Hull Patch) | **Hammer the nails.** A dented scrap patch covers a hole in the wall, with nails sticking out. Click a nail and the claw hammer swings; 3 hits drive it home (Oil Slick 4 nails, Patch 6) | The van's wobble shoves the patch around, so the nails move under the cursor | 0.65 × accuracy + 0.35 × speed |

Measure windows, in seconds of pouring between the band's edges: Street 0.50 s, **Premium 0.33 s**
(the hardest pour in the game), Smoke 0.67 s, Oil 0.71 s, Nitro 0.43 s.

### Movement is gameplay
The 2D lab was one screen. The van is a 6 m corridor, and that turns positioning into a resource.

**Walking costs time.** Doc walks at 2.6 m/s and accelerates at 14 m/s² (`van.json › doc`); he can use a
station from within 0.75 m (`interactRadius`). The benches for a product batch zig-zag down the van, so
each leg is short:

| Route (stand point to stand point) | Distance | Pure walking time |
|---|---|---|
| Street: board → measure → stove → ice bath → bagging | 4.2 m (longest leg 1.2 m) | ≈ 2.4 s |
| Premium: board → grind → measure → stove → ice bath → bagging | 4.5 m (longest leg 1.1 m) | ≈ 2.6 s |
| Smoke Bomb / Nitro: board → measure → stove | 2.3 m | ≈ 1.3 s |
| **Oil Slick**: board → hull patch → measure (the walkiest recipe) | 6.8 m | ≈ 3.0 s |
| Patch the Hull: board → hull patch | 4.0 m | ≈ 1.7 s |
| Ice Pack: board → grind | 0.3 m | ≈ 0.3 s |

Every leg of a product batch takes about 0.6 s, shorter than the 1.1 s result stamp between steps. So
a cook who moves on straight away loses almost nothing. **The time goes on the detours:**

| Detour | One way | Round trip |
|---|---|---|
| Stove → vent fan | 0.85 m | ≈ 1.0 s |
| Stove → curtain cord | 1.4 m | ≈ 1.5 s |
| Bagging bench → curtain cord | 3.0 m | ≈ 2.7 s |
| Stove → extinguisher | 2.9 m | ≈ 2.6 s |
| Recipe board → stash | 4.9 m | ≈ 4.2 s |

These are pure walking times at full speed, before sway and stumbles.

**The burner keeps running while you're away.** During a heat step the knob stays where you left it,
and the flame stays lit on the stove.
If you set it high to heat up fast and then walk off to close the curtains, the temperature overshoots,
your time-in-band score drops (it counts from when you first reached the band), and past the fire point
the stove catches fire. Rule of thumb: turn the knob down before you leave the stove. All other steps
simply wait for you.

**Van sway pushes Doc.** Lateral acceleration above 2.5 m/s² (`sway.latAccStart`) makes a walking Doc
drift toward the outside of the turn at 0.08 m/s per m/s² over the threshold (`sway.pushPerMps2`, 1.5×
while he's stumbling), so he has to fight his way across the aisle and click-to-move paths wander.
While he works a station he holds on to the counter: he stays on his spot and only leans with the van
(`sway.gripWhileWorking` scales the lean). The bench itself still feels the corner (stream, tilt,
tray).

**Bumps make him hop or stumble.** A bump of 0.35 or more makes him hop (`sway.bumpHop`). At **0.6 or
more** (`sway.stumbleBump`) a Doc on his feet in the aisle stumbles for **0.7 s** (`sway.stumbleSeconds`):
he staggers sideways, loses his click-to-move path, can't walk or use anything, and **drops the
extinguisher**. Potholes (0.9), small rocks (0.8), rocks, cows and falling rocks (1.0) and hard landings
all do it; a sand drift (0.3) doesn't. A working Doc holds on (just a hop and a lurch), but his bench
takes the spill: powder out of the mortar, a slosh in the beaker, a jolt on the thermometer, shards
on the floor.

**Driving smoothly helps the cook directly**: no shoves, no stumbles, no spills, no dropped
extinguisher, and +2 points/s for the smooth ride. A driver who calls "BUMP AHEAD!" gives Doc time to
stop pouring.

### Hazards in 3D (`lab.json › hazards`, `public/js/van/hazards3d.js`)

| Hazard | What Doc sees in the van | Rules | Counter-play |
|---|---|---|---|
| **Fire at the stove** | Flames rise from the stove; an orange glow fills the van and shows in the windows (Rook sees it too) | Starts when a heat step passes `fireAt` (Street 265°, Premium 260°, Nitro 240°). It starts at 0.12, grows 0.08/s and **explodes at 1.0**, about 11 s later. While burning: RV up to −3 hp/s, Doc −2 hp/s | Stand by the fire and press E to beat it with a towel (−0.18 a hit), or fetch the extinguisher from the back (≈ 1.3 s each way, about +0.2 fire on the round trip) and spray (−0.6 a press, 3 charges, refilled at every stop). Grabbing it early saves the trip, but a big bump knocks it out of Doc's hands |
| **Fumes haze** | A coloured haze fills the van and thickens | Steps add fumes (heat 0.03–0.07/s scaled by temperature, stir 0.02–0.05/s), and fire adds more. Decay is 0.12/s with the vent on, 0.01/s with it off. **Above 0.75**: Doc −4 hp/s, Rook −1.5 hp/s | Walk to the vent fan and switch it on. A 5 s burst clears ~0.6 fumes |
| **Vent smoke** | The fan spins and smoke pours out of the crooked chimney | +0.02 heat/s while cooking with the vent on. Not "witnessed": it never stops heat decaying, so on an empty road it only slows the decay (−0.05 → −0.03/s). It bites when cops can already see you | Switch the fan off once the haze clears, especially in a chase |
| **Cop alongside** | The cruiser pulls up beside the van in the dollhouse view, a red/blue wash flashes through the windows, and the HUD warns "COP ALONGSIDE: CLOSE THE CURTAINS" | Cooking with the curtains **open** while a cop is within **18 m** triggers `EV.SPOTTED`: **+0.8 heat** (6 s cooldown) | Pull the curtain cord by the side door: every curtain slides shut and the lab goes darker. Open them again when the cop is gone |
| **Explosion** | A blast and a burst of smoke from the stove | RV −25 hp, Doc −30 hp, heat +0.6, fumes +0.3, and the running batch fails | Don't let fires reach 1.0 |
| **Doc passes out (cook-down)** | **Doc lies on the floor** with cartoon stars and a 12 s countdown | Doc's hp reaches 0 (fumes, fire, explosion, crash share). Input locks for **12 s** and the batch pauses (it is not lost); the host ignores cook commands meanwhile. He gets up with 25 hp | Ice Pack (+30 crew hp), keep fumes under 0.75 |
| **Hull damage** | Holes punched in the walls show the RV's damage | RV hp from crashes, rams, fire | Patch the Hull at the hull patch: +30 RV hp |

### Recipe book (`lab.json › recipes`)

| Recipe | Kind | Needs | Steps (station) | Output |
|---|---|---|---|---|
| **Street Batch** | product | Salts 1 · Solvent 1 · Burner Gas 1 | Pour solvent 58–72% (measure) → Heat 170–215° for 8 s (stove) → Stir 1.0 rps for 5 s (stove) → Level tray 6 s (ice bath) → Break & bag 6 shards (bagging) | **2 bags**, value ×0.7 |
| **Desert Glass (Premium)** | product | Syrup 1 · Salts 1 · Copper Coil 1 · Solvent 1 · Burner Gas 1 · Ice 1 | Grind salts 6 turns (grind) → Measure syrup 64–72% (measure) → Heat 190–220° for 11 s (stove) → Stir 1.2 rps for 7 s (stove) → Ice bath 9 s (ice bath) → Break & bag 10 shards (bagging) | **4 bags**, value ×1.4 |
| **Smoke Bomb** | gadget | Salts 1 · Burner Gas 1 | Pack canister 50–70% (measure) → Mix fuse 1.0 rps for 3 s (stove) | +1 smoke (Q): a 9 m cloud for 6 s, cops inside are blinded for 4 s |
| **Oil Slick** | gadget | Solvent 1 · Scrap 1 | Punch drip can, 4 nails (hull patch) → Fill it 60–85% (measure) | +1 oil (E): a 4.5 m slick for 14 s, chasers spin out for 2.5 s |
| **Nitro Brew** | gadget | Burner Gas 1 · Ice 1 | Measure brew 62–74% (measure) → Pressurise 140–180° for 5 s (stove) | +1 nitro (Shift): 3.5 s, up to 40 m/s at 16 m/s² |
| **Patch the Hull** | repair | Scrap 1 | Nail the patch, 6 nails (hull patch) | RV +30 hp |
| **Ice Pack** | repair | Ice 1 | Crush ice 4 turns (grind) | Crew +30 hp |

### Ingredients (`lab.json › ingredients`, `startInventory`, `route.json › stops`)

| Ingredient | Colour | Start | Where to get more | Total available |
|---|---|---|---|---|
| Mesa Salts | `#e8e1cf` | 1 | Hardware (2), Farm (1) | 4 |
| Canyon Solvent | `#9fd3c7` | **2** | Hardware (1), Last Chance Gas (2) | 5 |
| Burner Gas | `#e07a3f` | **2** | Gas & Ice (2), Last Chance Gas (2) | 6 |
| Bag of Ice | `#cfe9f5` | 0 | Gas & Ice (2), Last Chance Gas (1) | 3 |
| Copper Coil | `#c46b3c` | 0 | Junkyard (2) | 2 |
| Scrap Metal | `#8d8f93` | 0 | Junkyard (3) | 3 |
| Prickly Syrup | `#b4467a` | 0 | Farm (2) | 2 |

The product is **Desert Glass**, counted in bags, colour `#7fd6c2`. Rook also starts with one Smoke Bomb
charge (`rules.sim.startGadgets`).

### Materials economy
The start kit (`startInventory`: Salts 1, Solvent 2, Gas 2) is one Street Batch plus a spare Solvent and
Gas. **Salts are now the binding limit**: 4 in the whole route, one per product batch, so a full run is
at most **4 batches**. Syrup and Coil cap you at **2 Premium batches (8 bags)**; the other 2 Salts make
2 Street Batches (4 bags). The **maximum is still 12 bags** against the **6 required**.

A 12-bag plan, stop by stop:

| Stretch | km | After the stop | Cook |
|---|---|---|---|
| Start → Hardware | 0 – 0.62 | Salts 1 · Solvent 2 · Gas 2 | **Street #1** (2 bags) downtown |
| Hardware → Gas & Ice | 0.62 – 1.95 | +Salts 2, +Solvent 1 | **Street #2** (2 bags) straight away: no more idle stretch after the first stop |
| Gas & Ice → Junkyard | 1.95 – 3.15 | +Gas 2, +Ice 2 | Nitro Brew (the spare Gas + Ice) or an Ice Pack |
| Junkyard → Farm | 3.15 – 3.95 | +Coil 2, +Scrap 3 | Patch the Hull if the RV is hurt |
| Farm → Last Chance | 3.95 – 5.05 | +Syrup 2, +Salts 1 | **Premium #1** (4 bags): about 55 s over 1.1 km |
| Last Chance → Drive-In | 5.05 – 6.9 | +Gas 2, +Solvent 2, +Ice 1, and the alarm (★★) | **Premium #2** (4 bags) during the finale chase, through the dust storm and rockfall. Leftovers: an Oil Slick and a Patch |

That run ends with 12 bags, a Nitro, an Oil Slick and two Patches crafted, and one Burner Gas spare.
Skipping both key stops leaves only 3 Salts: 3 Street Batches give exactly 6 bags at ×0.7 with zero
margin, and a single fall into the canyon (−1 bag) loses the run. Skipping only the Junkyard (no Coil)
still allows 4 Street Batches (8 bags).

**Gadgets cost product.** Every Smoke Bomb costs a Salt, which is one Street Batch (**2 bags**). Oil
Slicks cost Solvent, and the only spare Solvent arrives at Last Chance Gas. Nitro and Ice Packs share the
single spare Ice. Players decide how many bags of margin to trade for escape tools.

**Time is the hidden ingredient.** A Street Batch takes about 35–40 s of cooking and a Premium about
50–60 s, plus a few seconds of walking. The two Premiums can't start before the Farm (3.95 km), so the
second one is cooked during the alarm chase after Last Chance Gas. The 12-bag run needs Rook to drive
gently after the farms, exactly when heat builds: that's the cook-versus-heat tension, in numbers. The
quiet stretch is now Gas & Ice → Farm (1.95–3.95 km): gadgets and repairs only (§12).

### More cook task ideas for later
Each idea notes the data hook it needs, so it slots into the existing system. In 3D, most of them are
just a new station in `van.json` plus a presenter.

1. **Filter press**: a new step type `filter` at a new wall station: pump a lever at a steady rate while
   the pressure gauge stays in the green. Bumps spike the pressure.
2. **Cracked glassware**: hard bumps can crack the beaker (a crack meter). Fetch a spare from the
   pantry (limited spares, refilled at the hardware store) before it leaks quality.
3. **Label & seal bags**: after break & bag, carry the bags to the stash and seal them. Adds value and
   ties into `valueMult`.
4. **Hide the stash during a traffic stop**: a scripted 1★ pull-over. Carry the bags into a floor
   compartment before the officer reaches the side door, while the driver answers dialogue choices.
5. **Radio scanner**: a dial in the cab doorway. Tune it to catch police chatter and send "ROADBLOCK
   AHEAD 300 m" to the driver (reveals spawns from `heat.roadblockEvery`).
6. **Gas-mask filter swap**: the respirator lets Doc ignore fumes for 20 s, but filters clog. Swap
   them by unscrewing (circular drag).
7. **Rival buyer phone call**: a mid-run negotiation minigame. Pick replies to raise the price
   (payout ×1.1) or lose the deal, while still cooking.
8. **Generator running low**: the burner runs on a generator at the back. Pull-start it (a timing tap)
   and keep it fuelled with Burner Gas, which adds a third use for gas and another walk.
9. **Spice the batch**: an optional Prickly Syrup "garnish" step (timing tap) for a quality bonus,
   giving leftover syrup a use.
10. **Fix the vent fan**: the fan jams on bumps, so the vent half works until Doc hits it with the
    hammer (a hammer variant at the vent station).
11. **Slippery floor**: spills leave puddles that make Doc slide further on corners until he mops them.

---

## 7. Driver challenges

### Obstacles by biome (`rules.json › obstacles`, placed per `route.json › biomes[].obstacles`)

"Slow" is the fraction of speed lost on impact. "Bump" is the jolt sent to the lab (0–1): 0.35+ makes
Doc hop, 0.55+ spills, 0.6+ makes him stumble.

| Obstacle | Biomes | Radius | Smash? | Damage | Slow | Bump | Points | Heat | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Pedestrians crossing / jaywalking | city, suburbs (a few in farms) | 0.45 | knock | 0 | – | – | **+100** | **+0.45** | Cross at crosswalks or anywhere. Horn makes them run (3.5 m/s). Knocked at ≥ 3 m/s: fly, dazed 4 s with stars, get up |
| Traffic cars | all but hideout | 3.9–5.4 m long | – | 0.55 hp per m/s of impact | by mass | – | – | +0.08 | No damage under 4 m/s (`rv.minCrashSpeed`). Heat only when the RV is the aggressor |
| Bus | city | 11 × 2.6 m | – | crash | heavy (mass 3.0) | – | – | +0.08 | Slow (8–11 m/s) rolling wall |
| Cone | city, suburbs | 0.45 | ✔ | 0 | 0.02 | – | 5 | 0 | Roadwork lines |
| Trash can | city, suburbs | 0.6 | ✔ | 1 | 0.05 | – | 10 | 0.03 | |
| Mailbox | suburbs | 0.5 | ✔ | 1 | 0.04 | – | 15 | 0.03 | |
| Hydrant | city | 0.45 | ✔ | 3 | 0.10 | – | 20 | 0.05 | Water geyser FX |
| Construction barrier | city, roadwork | 1.4 | ✔ | 4 | 0.25 | – | 10 | 0.03 | |
| Sprinkler | suburbs | 0.4 | ✔ | 0 | 0 | – | 5 | 0 | Geyser FX |
| Pothole | city → desert | 1.0 | flat | 2 | 0.08 | **0.9** | 0 | 0 | Cheap for the RV, brutal for the lab: Doc stumbles |
| Roadwork lane closure | suburbs 2.15–2.33 km | – | – | – | – | – | – | – | Barriers + cones close the forward lane |
| Tractor | farms | 4.2 × 2.2 m | – | crash | heavy | – | – | +0.08 | 4–6 m/s; overtake into oncoming traffic |
| Cow | farms | 1.3 | **solid blocker** | 10 | 0.8 | 1.0 | 0 | 0 | Wanders, moos, is never knocked down |
| Hay bale | farms | 1.2 | ✔ | 2 | 0.20 | – | 15 | 0 | |
| Small rock | farms, canyon | 0.8 | ✘ | 6 | 0.35 | 0.8 | 0 | 0 | |
| Train crossing | farms 3.55 km | – | – | crash | – | – | – | – | 24 s cycle: 5 s bells + gates, 7 s train. Wait or beat it |
| Tumbleweed | desert, hideout | 0.8 | ✔ | 0 | 0 | – | 5 | 0 | Rolls across the road |
| Rock | desert, canyon | 1.5 | ✘ | 12 | 0.7 | 1.0 | 0 | 0 | |
| Sand drift | desert | 3.0 | flat | 0 | 0 | 0.3 | 0 | 0 | Drags speed while you're in it |
| Roadside cactus | desert | 0.6 | ✔ | 3 | 0.10 | – | 10 | 0 | |
| Rival dealer pickup | desert | 5.4 × 2.0 m | – | 7 per ram | – | – | – | – | Hostile, 22–26 m/s, rams you from behind (up to 4 rams, gives up after 45 s or a gadget hit) |
| Dust storm | desert 5.25–5.55 km | – | – | – | – | – | – | – | Visibility drops to tens of metres; counts as unseen for heat |
| Falling rock (rockfall) | canyon 5.9–6.15 km | 1.6 | ✘ | 14 | 0.6 | 1.0 | 0 | 0 | One every 2.2 s; shadows warn where they'll land |
| Police roadblock | police 3★+ | 0.6 (1.6 half-length) | ✔ | 8 | 0.30 | 0.9 | 50 | +0.1 | Smashable barricade, 220 m ahead |
| Spike strip | police 3★+ | 1.0 | flat | 5 | 0 | – | 0 | 0 | Flat tyre for 8 s (`flatTyreSeconds`) |
| Broken bridge ramp | canyon 6.25–6.3 km | – | – | – | – | – | – | – | Needs ≥ 24.5 m/s; fall = checkpoint, −30 hp, −1 bag |

Traffic speeds (`rules.json › traffic`): sedan 11–16 m/s, hatch 10–15, van 10–14, pickup 12–18,
bus 8–11, truck 14–20, tractor 4–6, rival 22–26.

### Police & heat

**Heat** is a value from 0 to 5.99. Stars are the whole part. Heat sources (`rules.json ›
heat.sources`, `rules.sim.patrol`, `route.json › stops`):

| Source | Heat |
|---|---|
| Pedestrian knocked | +0.45 |
| Ramming a cop (only when the RV drives into it; being rammed adds nothing) | +0.25 |
| Crashing into a car (only as the aggressor) | +0.08 |
| Smashed prop | +0.03 (or the prop's own value; roadblock +0.1) |
| **Speeding past a parked patrol** at 0★ (over 17 m/s downtown, 20 m/s in the suburbs) | +0.35 |
| Any incident in a patrol's sight (45 m) | +0.25 extra (half for props) |
| Vent smoke while cooking (not witnessed) | +0.02/s |
| Lab spotted (curtains open, cop within 18 m) | +0.8 |
| Explosion | +0.6 |
| **Looting Last Chance Gas** (the alarm) | +2.6 |

**Decay** (`heat.decayPerSec`, `decayDelay`, `rules.sim.heatExtra`): −0.05/s once no cop has seen you for
**7 s** (cop sight range 70 m; the dust storm hides you). Even while seen, heat bleeds off at
−0.025/s after 12 s without a new incident: the cops lose interest. Losing one star takes about 27 s
unseen (7 s delay + 20 s), or 40 s of calm driving in sight. The helicopter at ★★★★★ keeps you "seen".

| Stars | Max cops | Cop top speed | New cop every | Adds |
|---|---|---|---|---|
| 0 | 0 | – | – | Parked patrols only: about half the intersections downtown and in the suburbs |
| ★ | 1 | 28 m/s | 9 s | Follows, no ramming. Parked patrols within 35 m pull out and join |
| ★★ | 2 | 30 m/s | 7 s | **Ramming** (6 hp a hit; all cops share an 8 s ram cooldown) |
| ★★★ | 3 | **32 m/s** | 6 s | **Roadblocks** (every 25 s), **spike strips** (every 18 s), rubber-banding (+5 m/s when > 90 m behind) |
| ★★★★ | 4 | 34 m/s | 5 s | **SUVs** (10 hp rams) |
| ★★★★★ | 5 | 36 m/s | 4 s | **Helicopter**: keeps you "seen", so heat can't decay until the bridge |

**Design note:** the RV tops out at 30 m/s, so a 1★ cop (28 m/s) can be outrun at full speed. From
★★★ up, cops are **faster than you** and rubber-band, so you can't outrun them on a straight. You need
gadgets, nitro, traffic and tight corners, or patience at low heat. That makes the cook's gadget
crafting matter. A full-speed chase is also the worst ride for Doc.

**Busting:** a chasing cop within 7.5 m while you're under 4 m/s fills the bust meter in 2.5 s (it
drains at 0.6/s). A moving RV only takes ram damage. Supply stops are the dangerous moments.

**Cop states:** parked → chasing (lights on) → blinded by smoke → spun out on oil → wrecked (+250 pts)
→ gave up (at the bridge).

### Gadgets (`rules.json › gadgets`)

| Gadget | Key | Effect |
|---|---|---|
| Smoke Bomb | Q | A cloud of radius 9 m that lasts 6 s. Cops driving through are blinded for 4 s. You start with one |
| Oil Slick | E | A slick of radius 4.5 m that lasts 14 s. Cars that hit it spin out for 2.5 s |
| Nitro Brew | Shift | 3.5 s boost: top speed 40 m/s, accel 16 m/s². Also the canyon-jump insurance |

### More driver challenge ideas for later
1. **Toll booth**: a barrier arm on the highway. Stop and pay (lose time) or smash through (+heat,
   damage).
2. **Flash flood in a dry wash**: a desert dip floods on a timer. Water slows you hard and stalls the
   engine.
3. **Night section**: a new route with headlights only (a cone of light), cop lights visible from far
   away, and a cool palette.
4. **Drawbridge timing**: a lifting bridge over a canal. Time the jump as it rises (a `route.json`
   event with a cycle like the train).
5. **News van**: a TV van follows you and broadcasts your position, so heat can't decay while it's in
   range. Ram it or lose it with smoke.
6. **Fuel gauge**: Burner Gas also feeds the engine. Run dry and you crawl, which forces trade-offs with
   the cook.
7. **Flat tyre change**: after spikes, a 6 s mini-stop where the driver mashes a key prompt to swap the
   wheel. Bustable while you're stopped.
8. **Border-patrol checkpoint**: a scripted stop. The cook must hide the lab (curtains, stash,
   fumes < 0.2) while the driver bluffs through a dialogue minigame.
9. **Speed camera**: a flash when you pass over the limit gives +0.2 heat. A skill check in town (the
   parked patrols already do a version of this).
10. **Cattle drive**: a herd crosses the road (solid blockers that moo). Weave through slowly or wait.

---

## 8. Art direction & asset list

### Style
**Stylised low-poly, grounded, "cartoonish but not too cartoonish."** Chunky simple shapes, flat
shading, slightly exaggerated proportions (vehicles ~10% wider, characters with bigger heads and
hands), a **muted, sun-bleached palette**, and small grime details (rust patches, mismatched panels,
dents). No outlines, no gloss. Materials are matte (`MeshLambertMaterial`, or Standard with roughness
≥ 0.8). Almost everything is one vertex-coloured mesh sharing one material, which keeps draw calls
under 250 at 60 fps on a mid laptop. The cook's view adds the van interior: **≤ 120 draw calls for the
interior** (static furniture merged) and **≤ 300 in total** (`VAN_CONTRACT.md`).

### Palette (`CONTRACT.md`, `VAN_CONTRACT.md`, `public/js/assets/palette.js`)

| Token | Hex | Used for |
|---|---|---|
| RV body | `#e9e2cf` | off-white hero RV |
| RV band | `#4f8f8a` | faded teal lower band |
| RV pinstripe | `#d9a83a` | thin mustard stripe (and mustard accents inside) |
| RV door | `#9c4a32` | rust-red replacement door (and rust inside) |
| Windows | `#2e3a40` | tinted glass (curtains visible inside) |
| Police | `#1f2a44` / `#f1f1ee` | navy body, white doors (SUV `#141a29`) |
| Civilians | `#c96f4a` `#6f8fb0` `#d6c08a` `#7e9b6e` `#b85c6a` `#8a8f99` | dusty pastel cars |
| Product | `#7fd6c2` | Desert Glass bags, crystal slab, UI |
| Interior cabinets | `#8a6a4a` | worn wood-veneer counters and cupboards |
| Interior walls | `#e2d8bf` | stained cream walls |
| Interior floor | `#3f6f6b` | teal vinyl with a checker |
| Steel | `#9aa3a8` | stove, sink, fittings, extinguisher bracket |

Biome palettes (ground / road / sky / fog) are in `route.json › biomes[].colors`: Downtown
`#8a8c90`/`#3d3f44`/`#a7c7d6`, Suburbs `#7fa063`/`#45474b`/`#9fd0e8`, Farms
`#b5a76a`/`#4b4a48`/`#a9d3e6`, Desert `#d8b47c`/`#55504a`/`#8cc4e6`, Canyon
`#c4774a`/`#4e4643`/`#f2b47c`, Hideout `#d29a68`/`#55504a`/`#e79a6e`.

The interior is lit warm (a ceiling strip light plus a point light) so it reads from the dollhouse
camera in every biome, including the dust storm and the sunset canyon.

### Asset list
Every model follows the same rules: origin at ground centre, front faces **+Z**, metres, and the named
children listed below for animation. Built procedurally in `public/js/assets/` and previewed and
exported as **.glb** from the showroom page **`public/assets.html`**. See **`docs/ASSETS.md`** for the
full kind list, variants and export steps.

| Group | Assets (kind ids) | Named parts |
|---|---|---|
| **Vehicles** | `rv` (hero: roof AC box, crooked lab chimney, rear ladder, spare tyre, curtains), `cop`, `cop_suv`, `heli`, `sedan`, `hatch`, `van`, `pickup`, `bus`, `truck`, `tractor`, `rival`, `train` | `wheel_*`; RV `vent`, `door`, `window_glow`, `exhaust`; cops `light_red`, `light_blue`; heli `rotor`, `tail_rotor`, `spot`; train `car_*` |
| **Characters** | `driver` (Rook), `cook` (Doc), `ped` (8 adult variants: office worker, jogger, tourist, hi-vis road worker, older man in a cardigan, summer dress, hoodie, cowboy hat), `cow` | `body`, `head`, `arm_l`, `arm_r`, `leg_l`, `leg_r` (pivots at hip/shoulder) |
| **Props / obstacles** | `cone`, `trashcan`, `mailbox`, `hydrant`, `barrier`, `sprinkler`, `hay`, `tumbleweed`, `pothole`, `sanddrift`, `rock_small`, `rock`, `cactus_road`, `spikes`, `falling_rock`, `roadblock`, `crossing_gate` | `crossing_gate` › `arm` |
| **FX decals** | `smoke_cloud`, `oil_slick` | – |
| **Scenery: Downtown** | `building`, `streetlight`, `trafficlight`, `tree_city`, `bench` | |
| **Scenery: Suburbs** | `house`, `tree_round`, `fence`, `mailbox_deco`, `streetlight` | |
| **Scenery: Farms** | `barn`, `silo`, `farmhouse`, `tree_round`, `fence_wood`, `windmill`, `powerpole` | |
| **Scenery: Desert** | `cactus`, `rock_big`, `mesa`, `shack`, `powerpole`, `billboard` | |
| **Scenery: Canyon** | `canyon_wall`, `rock_big`, `cactus`, `warning_sign` | |
| **Scenery: Hideout** | `cactus`, `rock_big`, `mesa`, `powerpole` | |
| **Stores & landmarks** | `store_hardware`, `store_gas` (×2: Sunny Gas & Ice, Last Chance Gas), `store_junkyard`, `store_farm`, `sell_point` (Abandoned Drive-In) | |
| **Bridge** | `bridge_ramp`, `bridge_landing`, `canyon_wall`, `warning_sign` | |

The entity `KIND` order in `protocol.js` is the wire id of each kind. Never reorder it, only append.

### Van interior kit (`public/js/van/interior.js`, `hazards3d.js`, `presenters/**`)
Built procedurally like the rest, sized from `van.json` and measured against the `rv` model's coach box,
so the cut-away interior lines up with the exterior.

| Group | Pieces | Notes |
|---|---|---|
| **Shell** | Teal checker floor, cream walls cut down to about counter height on the camera side (`rv.cutHeight`), cab partition, wheel arches, window frames, the rust-red side door and its step well, ceiling strip light | Roof removed for the dollhouse view. Static: merged into a few meshes |
| **Cab** | Driver and passenger seats, dashboard, a steering wheel that turns with `rv.steer`, **Rook** (`driver` model) seated with his hands on the wheel | Seen past the recipe board |
| **Furniture** | Wood-veneer counters along both walls, upper cupboards, steel sink, shelves, decor (radio, road maps, taped-up cracks, a dashboard cactus, a calendar) | Merged; part of the ≤ 120 draw-call interior budget |
| **Stations** | Recipe corkboard with cards · pantry shelf with 7 ingredient jars (fill = count) · mortar & pestle · bottle + graduated beaker with a target band · gas stove with a knob, pot, clip-on dial thermometer and spoon · ice tray with a spirit level · crystal slab + row of bags · scrap hull patch with nails and a hammer · extractor fan · curtain cord + a curtain per window · wall-mounted extinguisher · product stash crate | Idle props when the station has no step (`buildIdleProps(stationId)`), live props from a presenter while a step runs there |
| **Doc** | The `cook` model at scale 0.92: walk, work (hands at the counter), carry the extinguisher, hop, stumble, lie on the floor (cook-down) | Same rig as the pedestrians (`arm_*`, `leg_*`, `head`) |
| **Hazard & feedback FX** | Stove flames + flickering light, fumes haze, chimney smoke + spinning fan, extinguisher spray, towel, explosion puff, hull holes, spilled powder and splash particles, falling shards, next-station floor ring + bouncing arrow | Presenter FX are pooled `InstancedMesh` particles (one draw call per pool, `presenters/fx.js`) |

---

## 9. Technical architecture

### Folder map
```
server/index.js, rooms.js      Express static + WebSocket rooms/relay on one port, GET /healthz
render.yaml, README.md         Render blueprint (Node 22), run/deploy guide
scripts/                       copy-vendor.js (three.js → public/vendor), test-net.mjs
public/
  index.html, css/             game page; HUD / lobby / cook (2D) / van styles
  assets.html                  model showroom + .glb export
  van-test.html                3D van lab harness (WorldView + fake snapshots + VanLab3D)
  van-presenters-test.html     bench harness for the station presenters
  js/main.js                   wiring: lobby → game (solo, online driver, online cook)
  js/data/                     route.json, rules.json, lab.json, van.json + loadData.js   ← all tuning lives here
  js/shared/protocol.js        the message contract (lobby + game messages, events, entity kinds)
  js/sim/                      track.js (road maths), rng.js, road.js, util.js, GameSim + systems, autopilot.js, test/
  js/cook/                     CookLab.js (logic + station presence), stations.js (STEP_STATION),
                               minigames/*.js, CookUI.js + LabScene.js (2D fallback), test/
  js/van/                      the 3D van lab (below)
  js/render/                   WorldView, chunks/roadBuilder (road + scenery), entities, rv, cameras, env, fx, particles, audio
  js/assets/                   palette.js + procedural low-poly model builders
  js/net/                      NetClient.js (WebSocket), LocalBus.js (solo, same tab)
  js/ui/                       lobby.js, hud.js
  vendor/three/                three.js r170 (ES modules, no bundler)
docs/                          this file, UNITY_PORT.md, ASSETS.md, NOTES-*.md, screenshots
```

### The 3D van lab modules (`VAN_CONTRACT.md`)

| Module | Job |
|---|---|
| `van/VanLab3D.js` | Orchestrator, used by `main.js`: `new VanLab3D(view, lab, data, { canvas, hudRoot, role: 'cook'\|'solo' })`, `await van.ready`, `van.setActive(bool)` (dollhouse camera + interior + Doc input, or back to the normal camera with the interior hidden), `van.update(dt, snap)` every frame **before** `view.render(dt)`, `van.onKey(e, isDown) → consumed`, `van.docState` (`idle` / `walking` / `working` / `stumbling` / `down`), `van.destroy()` |
| `van/interior.js` | The cut-away shell, cab, furniture, station bodies and decor, parented to the RV's tilt group in `WorldView` |
| `van/DocController.js` | Pure logic: walking inside `van.json › walkable`, collisions, click-to-move, sway push, hop and stumble, interaction radius |
| `van/vanCamera.js` | The dollhouse camera (zoom levels) and the eased close-up on the station being worked |
| `van/hazards3d.js` | Fire, fumes haze, vent fan, curtains, extinguisher, hull holes, stash, pantry jars |
| `van/VanHud.js`, `css/van.css` | DOM prompts, the step panel and the recipe board overlay |
| `van/presenters/**` | One 3D presenter per step type plus idle props: `createPresenter(stepType, { anchor, lab, game, step, recipe })` with `update(dt, { feel, active })`, `pick()`, `pointerDown/Move/Up(hit)`, `key(code, isDown)`, `camera()`, `hint`, `dispose()`; `buildIdleProps(stationId)`; `STEP_STATION` |

**Station anchors.** `VanLab3D` creates one `Object3D` anchor per station: origin at the front-centre
edge of the work surface, +Y up, **+Z from the counter toward Doc**, +X = Doc's right as he faces the
counter. The counter top is y = 0 and the usable area is x ∈ [−0.45, 0.45], z ∈ [−0.6, 0]. The hull
patch is on the vertical plane z = −0.6. Presenters build their props and report pointer hits and
close-up camera poses in this frame.

**Presence mode** (`CookLab`, added for the van; the 2D UI keeps the default `'any'`):
- `lab.setPresenceMode('any'|'station')`; `lab.setPresence(stationId|null)` (VanLab3D calls it as Doc
  starts or stops working); `lab.stationForStep(type)`; `lab.stepStation` (the station of the current
  step, or of the next one during the result stamp, for the highlight); `lab.awayFromStation`.
- In `'station'` mode pointer input only reaches the minigame while Doc is at the step's station.
  Away, the `heat` step keeps simulating and every other step pauses. Fumes and fire always run. Cook-down
  pauses everything.

**Session flavours (`main.js`)**

| Session | Sim | What's on screen | Lab |
|---|---|---|---|
| Solo | local | Chase camera at the wheel; **Tab** → `van.setActive(true)` (role `'solo'`), the dollhouse camera, and the `Autopilot` drives | `CookLab` local, presence `'station'`, lab state straight into the sim |
| Online driver | local (host) | Chase camera; the interior stays hidden | None: the cook's `LabState` arrives at 6 Hz. If the cook leaves, the driver carries on with the lab locally, like solo |
| Online cook | none | `WorldView` with interpolated snapshots + `VanLab3D` (role `'cook'`), always in the van | `CookLab`, presence `'station'`, `LabState` at 6 Hz + commands |

**Cook frame order:** on each snapshot (15 Hz) `view.pushSnapshot(snap, { interpolate: true })`,
`hud.update(snap)` and `lab.applySnapshot(snap)`. Every frame: `lab.update(dt)`, `van.update(dt, snap)`,
then `view.render(dt)`. At `rules.net.labHz` (6 Hz): `net.sendGame({ k: 'lab', l: lab.getLabState() })`.

### Host-authoritative co-op

```
 Driver's browser (HOST)                     Node server (Render)      Cook's browser
 ───────────────────────                     ────────────────────      ──────────────
 keyboard → DriverInput                      rooms + relay only        WASD / mouse / touch → VanLab3D
 GameSim.step(input, 1/60)  @ 60 Hz          never reads game data       (Doc, stations, presenters)
 snapshot() → own WorldView + HUD (no interp)                            → CookLab (presence 'station')
                                                                         minigames + hazards local @ 60 fps
 netSnapshot() ── {k:'snap'} @ 15 Hz ──────▶ relay ──────────────────▶  WorldView (≈100 ms interp buffer):
                                                                         the RV with its cut-away interior
                                                                         lab.applySnapshot (inventory, feel, cop alert, events)
 sim.setLabState / applyCookCommand ◀─────── relay ◀── {k:'lab'} @ 6 Hz ── lab.getLabState()
                                                   ◀── {k:'cmd'} instantly ─ startRecipe / recipeDone / explosion / callout
 replies ride in snapshot.events (recipeOk / recipeDenied …)
```

**Why it's built this way**
- **Zero input lag for the driver.** The car is the twitchy part, and it runs on the machine with the
  keyboard. Doc's walking and the minigames are local too, so only confirmations and the "feel" of the
  ride travel over the network, and ~100–150 ms of delay is invisible there. The van's sway and Doc's
  shove come from the same interpolated snapshot, so they always agree on screen.
- **A cheap server.** The server only pairs players and forwards messages, so a single free Render
  instance is enough.
- **Determinism where it matters.** `Track` + `mulberry32` mean both players build the same road and
  scenery from the same seed, so only moving entities need sending. The van interior comes from
  `van.json`, so it needs no network traffic at all.

**Traffic.** A snapshot is 3–12 KB of JSON (up to 90 entities within 120 m behind / 260 m ahead, numbers
rounded to 2 dp, `rules.json › net`) at 15 Hz. permessage-deflate shrinks that 5–10×. The cook sends
`lab` at 6 Hz and `cmd` on demand. The 3D lab adds nothing to the wire: Doc's position is local to the
cook.

### Data-driven configs
| File | Controls |
|---|---|
| `route.json` | length, seed, biomes (lanes, densities, colours, fog, curves, side room), supply stops (+ the Last Chance alarm), scripted events, bridge geometry, sell point |
| `rules.json` | RV handling, heat sources & police levels, bust rule, gadgets, every obstacle, traffic types, pedestrians, scoring (+ star thresholds), network rates, and the `sim` tuning block (patrols, calm decay, cops, rival, rockfall…) |
| `lab.json` | start inventory, ingredients, product, recipes & steps (minigame parameters), hazards |
| `van.json` | the 3D lab in RV-local metres: interior box, walkable rectangles, stations (position, side, stand point, steps), cab seats and steering wheel, Doc (radius, speed, accel, interact radius), sway, dollhouse camera and zoom levels |

Rule (from `CONTRACT.md`): **add keys freely, never rename or remove them** (for `van.json`: tune
numbers, never rename ids). The web build and the future Unity port read the same files.

### Message contract (`public/js/shared/protocol.js`)
- **Lobby (client ⇄ server, field `t`)**: `create`, `join`, `role`, `ready`, `start`, `leave`, `ping` →
  `room`, `error`, `start {seed, roles}`, `peerLeft`, `pong`. Extensions (`{t:'lobby'}` back to the room
  after a game, `role:'swap'`, `ROOM.state`, `ERROR.code`) are listed in `docs/NOTES-net.md`.
- **Game (inside `{t:'g', m}`, field `k`)**: `snap` (driver → cook), `lab` and `cmd` (cook → driver),
  `end` (driver → cook), `chat` (either way).
- **Cook commands**: `startRecipe`, `recipeDone {quality}`, `recipeFail`, `explosion`, `callout`.
- **Events** (`snapshot.events`): `recipeOk/Denied`, `pedHit`, `crash`, `smash`, `copWreck`, `stopEnter`,
  `stopDone`, `stars`, `spotted`, `gadget`, `jump`, `landed`, `fell`, `copsGaveUp`, `biome`, `train`,
  `msg`, `end`.
- **Entities**: `[id, kindId, x, y, z, yaw, variant, state]` tuples. The meaning of `state` depends on
  the kind (e.g. ped: walk / panic / airborne / dazed / getting up).
- Snapshot extras from the sim (`crew.cookDown`, `heat.unseen`, `inv.value`, `weather`, `train`, `sell`,
  `maxStars`…) are listed in `docs/NOTES-sim.md`.

All of it is plain JSON, so it maps 1:1 to C# `[Serializable]` structs.

### Sequence of a game
1. **Lobby**: the host clicks *Create Online Room* and gets a 4-character code (no vowels, no 0/O/1/I).
   They share the invite link. The partner joins and gets the free role (swap is allowed). Both press
   *Ready*.
2. **Start**: the host presses *Start*. The server picks a random uint32 **seed** and sends
   `start {seed, roles}` to both players. Each builds `Track(route, seed)` and its WorldView. The driver
   also builds `GameSim(data, {seed})`; the cook builds `CookLab` and `VanLab3D`.
3. **Countdown**: the sim's `phase: 'countdown'` (3 s) shows on both HUDs.
4. **Loop**: `phase: 'drive'`, the 60 Hz sim, 15 Hz snapshots, 6 Hz lab state and commands as above.
5. **End**: when `phase` becomes `won` or `lost`, the driver sends `{k:'end', result}` once. Both see
   the end screen. *Back to room* sends `{t:'lobby'}` so the same pair can play again.

### Scaling & limitations
- 2 players per room. The server caps rooms at 2,000, messages at 64 KB, and rate at 120 msg/s
  (burst 200). Idle rooms are swept after 30 min.
- **A driver disconnect ends the game**, because the sim lives in the driver's tab. If the cook
  disconnects, the driver keeps playing and runs the lab locally.
- No reconnect or resume mid-run.
- No anti-cheat: it's co-op, and the host could edit its own inventory, which hurts nobody.
- A slow driver laptop slows the game for both players. The cook's frame rate doesn't matter to the
  sim, but the cook's view is the heavier one (world + interior, ≤ 300 draw calls).
- A single Render instance with no horizontal scaling. It's fine for friends-and-classmates traffic.

---

## 10. Hosting on Render

`render.yaml` (Blueprint, one free web service):

```yaml
services:
  - type: web
    name: cook-and-run
    runtime: node
    plan: free
    region: frankfurt          # closest Render region to London; can't be changed after creation
    buildCommand: npm install  # postinstall copies three.js into public/vendor
    startCommand: npm start
    healthCheckPath: /healthz
    autoDeployTrigger: commit  # redeploy on every push (replaces the deprecated autoDeploy: true)
    envVars:
      - key: NODE_VERSION
        value: "22"          # Node 20 is end-of-life (Apr 2026); 22 is LTS and what the tests run on
```

**Node 22.** `render.yaml`, `.node-version` and the tests all use Node 22 (`package.json` still accepts
18+).

**Deploy:** push to GitHub, then in the Render dashboard choose **New → Blueprint**, pick the repo and
click **Apply**. The game is live at `https://cook-and-run.onrender.com` (or similar), and every push
redeploys.

**One port, two protocols.** Express serves `public/` and the `ws` server shares the same HTTP server
on the path `/ws` (`wss://…/ws` behind Render's TLS). The server listens on Render's `PORT` env var.
`GET /healthz` returns `{ ok, rooms, playing, players, uptime }`, which Render uses for health checks
and zero-downtime deploys. On a deploy Render sends SIGTERM. The server closes sockets with code 1012
("Server restarting"), so **a deploy ends any games in progress**. Don't push mid-session.
`index.html` is served no-cache and `.js/.css/.json` with a 60 s max-age, so a deploy reaches players
within a minute.

**Free-tier behaviour** ([Render docs](https://render.com/docs/free)):
- The service **sleeps after 15 min without inbound traffic**. HTTP requests and WebSocket messages
  both count, so a running game (15 Hz snapshots) or an open lobby (pings every 3 s) keeps it awake.
- **Cold start takes about 1 minute.** The first visitor sees Render's loading page. Warn your friend
  or open the link yourself first.
- 750 free instance hours per workspace per month. One service awake 24/7 uses about 744, so a second
  free service would run out.
- The filesystem is ephemeral and Render may restart the service at any time. That's fine: the server
  stores nothing.

**Sharing:** in the room screen, *Copy invite link* gives `https://<your-service>.onrender.com/?room=ABCD`.
Opening it pre-fills the code, so the partner only clicks *Join Room*. For testing,
`?server=host:port` points a page at a different server (e.g. a local one).

---

## 11. Milestones & roadmap

Effort is for one student at about **15 h/week**.

| Milestone | Scope | Effort |
|---|---|---|
| **M1: Playable prototype** | Full 7 km route with 6 biomes, 5 supply stops, train, roadwork, dust storm, rockfall, canyon jump, sell point. Host-authoritative co-op over Render plus solo mode. Police heat 1–5 with parked patrols, ramming, roadblocks, spikes, SUVs and heli. 3 gadgets. Cook lab with 7 recipes, 7 minigames, fumes/fire/curtains/pass-out hazards (2D panel). Procedural low-poly assets + showroom with .glb export. Synthesised audio, HUD, lobby, end screen. Headless sim, cook and net tests | done |
| **M1.5: 3D van lab** (built) | The cook walks Doc around a cut-away 3D lab inside the moving RV: `van.json` layout, interior kit, Doc controller with sway and stumbles, dollhouse + close-up cameras, 12 stations, a 3D presenter per step type, hazards in 3D, station presence in `CookLab`, solo Tab switch with the autopilot driving. The 2D lab stays as `?lab2d=1` | 2–3 weeks (30–45 h) |
| **M2a: 40-minute run** (built) | See §0: 40 km / 13 areas, garage tutorial, first-person cab with look-around, 8 shop challenges + roof defence, 17 area events incl. the tornado, moto cops and the 5★ Rhino, regenerating hull, stop banners and arrows, the expansion asset kit | done |
| **M2: Polish & balance** | Recorded sound and music, more art detail (ped variety, signage, interior decor), screen-shake/FX tuning, onboarding (a 60 s tutorial stretch that teaches walking and the first pour), balancing passes with playtest data (heat curve, cop speeds vs RV, minigame difficulty, walking distances, cook idle time), settings (volume, colour-blind palette, key rebinding), gamepad support, cook reconnect | 3–5 weeks (40–70 h) |
| **M3: Unity port** | Unity 6 URP version following `docs/UNITY_PORT.md`: data + sim + lab logic as plain C#, glTF assets → prefabs, the van interior as a prefab under the RV, Cinemachine, UI Toolkit, Netcode for GameObjects + Relay (or WebSocket cross-play) | 9–15 weeks (140–230 h) |
| **M4: Content** | A second route, a **night level** (headlights, cool palette), 3–5 new recipes, step types and stations (from §6's ideas list), new driver events (from §7's list), daily seed + leaderboard, cosmetic RV skins and interiors | 4–8 weeks (60–120 h) |

---

## 12. Risks & open questions

| Risk / question | Why it matters | Mitigation / next step |
|---|---|---|
| **Balancing two roles** | The start kit (Solvent 2, Gas 2) fixed the old idle stretch after the hardware store: Doc now cooks Street #2 there. The quiet stretch is now **Gas & Ice → Farm (1.95–3.95 km)**: only gadgets and repairs (Nitro or Ice Pack, Patch) until the Syrup arrives | Walking, sway and housekeeping (vent, curtains, extinguisher) fill some of it in 3D. Candidates: the radio scanner or generator from §6's list, or moving one Syrup to the Junkyard. Measure cook-idle seconds in playtests |
| Heat vs. cooking tension | Vent smoke is now cheap (+0.02/s, not witnessed, decay 0.05/s after 7 s) | Watch that the vent isn't *too* free: on an empty road it only slows decay. If players never close it, count vent smoke as witnessed in populated biomes (`rules.sim.lab.ventSmokeWitnessed`) |
| Cops faster than the RV from ★★★ | It can feel unfair without gadgets | Keep it (it's what makes the cook's gadgets matter). The free starting Smoke Bomb (`startGadgets`) is the safety net |
| **Dollhouse readability** | The camera rides with a van that rolls, pitches and corners at 30 m/s. The interior must stay readable and must not cause motion sickness, and the near walls must never hide Doc | Camera keeps world-up and damped motion; walls on the camera side cut low; three zoom levels; close-ups for the fiddly steps. Playtest in the canyon at full speed |
| **3D controls discoverability** | Two input styles (WASD and click-to-move) plus drag-to-play on props; new players won't know which bench is next | Next-station floor ring + arrow, "E · Stove" prompts, per-step hints from the presenter, toasts for the first fumes and fire. A 60 s tutorial in M2 |
| Solo autopilot | In solo the autopilot cruises while you cook (19 m/s, no stops, no Nitro, hands the wheel back before the bridge and the drop-off). Players may still find long cooking stints too safe or too slow | Tune the cruise speed per biome; consider letting heat rise faster while the AI drives |
| **Latency for the cook** | The cook sees the world ~100 ms + half the round-trip time late | Doc and the minigames are local. Only recipe confirmation waits on the round trip (5 s timeout). Sway and bumps come from the same interpolated snapshot as the van's motion, so they look consistent |
| Browser performance | Low-end laptops, integrated GPUs. The cook's view is the heaviest (world + interior) | Budget: interior ≤ 120 draw calls, cook total ≤ 300, driver < 250, pixel ratio ≤ 1.75, merged chunks and furniture, fog hiding spawns. `?lab2d=1` as the fallback. Add a "low" preset (no shadows, shorter fog) |
| Touch for the cook | Small props (nails, shards, the knob) are hard to hit with a finger | Generous invisible hit volumes and drag planes on every presenter; tap-to-walk |
| Driver as single point of failure | A driver disconnect ends the run | Fine for M1. Later: snapshot the sim state so a run can resume or migrate |
| **Content rating & store policies** | The theme is cooking and selling an invented illegal product. Even with fictional chemistry, store reviewers judge the theme. Apple's guideline 1.4.3 rejects apps that "encourage consumption of … illegal drugs". Google Play disallows apps that "facilitate or promote illegal activities" (examples include manufacturing illegal drugs). Expect a mature (16+/M-type) rating at best | Keep the browser build as the home of the original theme. Build a **theme toggle / reskin ("food truck")** from day one: product → "Desert Glaze" donuts or "Canyon Chili", lab → food-truck kitchen (the 3D benches already look like one), cops → health inspectors and rival trucks, same minigames. Because names live in `lab.json` and `route.json`, the layout in `van.json` and the art is procedural, a reskin is mostly a data + palette swap. Avoid real slang, real substances or real procedures in any text |
| Slapstick pedestrian hits | Some players or platforms dislike any hitting of people | It's already cartoon-only (stars, get up) with a clean-run bonus. Add an option to replace pedestrians with cardboard cut-outs |
| IP similarity | The vibe is inspired by a well-known crime drama | Keep everything original: no names, likenesses, RV replicas (ours is our own design: teal band, rust door, crooked chimney, our own interior layout), quotes or logos |
| Open: payout vs. points | Two scores can confuse players | Playtest showing a single "street value" total versus both |
| Star thresholds | Now data: `rules.json › scoring.stars` = `[0, 2500, 4000]` points | Tune with playtest data |

References: [Render free tier](https://render.com/docs/free) ·
[Render Blueprint spec](https://render.com/docs/blueprint-spec) ·
[App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) ·
[Google Play: Illegal Activities](https://support.google.com/googleplay/android-developer/answer/9878877)
