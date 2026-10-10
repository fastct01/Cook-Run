# R3-START — the start district around Rook's Garage (proposal, not wired)

User feedback: *"Add more elements on the right of the garage when the car moves out at the starting
location … add more biome at the left so it doesn't feel empty."*

When the RV leaves the garage door (heading +X), its **right** is +Z: the tyre shop and alley right next
to the garage. Its **left** is −Z: the tow yard, warehouses and refinery behind the route start. Across
the road is Lou's 24h diner, the corner mart, a pumpjack lot, a water tower and a fuel depot. The district
reads as the industrial edge of town, from the garage door out to the fog, at dawn (6:36).

Approval renders are in `docs/r3/`, all 1280×720, made by `python3 docs/r3/render_r3_start.py`:

| view | before | after |
|---|---|---|
| from above (cam −10,70,−30 → 0,0,45) | `start-before-top.png` | `start-after-top.png` |
| on the road looking back (1.5,2.2,75 → 1.5,2,0) | `start-before-back.png` | `start-after-back.png` |
| across the road (1.5,2.2,60 → 60,2,40) | `start-before-left.png` | `start-after-left.png` |
| driver's seat at the open garage door (real FP cab, like `docs/play-cab.png`) | `docs/play-cab.png` | `start-after-door.png` |
| driver's eye after the right turn (RV z 60, right lane, yaw = heading) | — | `start-after-turn.png` |
| the new kinds lined up with tri counts | — | `start-props.png` |

The "before" shots use the same page with `?layout=0`. They match the smoke captures in `/tmp/claude-0/smoke/start-*.png`.

## Files

| file | what |
|---|---|
| `public/js/assets/expansion/r3-start.js` | the PACK (13 kinds, labels, named parts). Registered in `expansion/index.js` with one import and one `PACKS` entry. |
| `public/js/assets/expansion/r3-start-kit.js` | shared helpers: lit kits, cheap tyres, junk-car hulks, chain-link runs that share the `chainlink_fence` material, and sign painters |
| `public/js/assets/expansion/r3-start-industry.js` | `tank_farm`, `pumpjack`, `pipe_bridge`, `refinery_gate`, `utility_pole` |
| `public/js/assets/expansion/r3-start-shops.js` | `diner_24h`, `tyre_shop`, `corner_shop`, `pole_sign` |
| `public/js/assets/expansion/r3-start-yard.js` | `tow_yard`, `tow_truck`, `dumpster_alley`, `scrub_patch` |
| `public/js/assets/expansion/r3-start-layout.js` | **the placement proposal**: plain data plus pure resolvers (Layout items, live items, sim colliders, reservations) |
| `public/r3-start-preview.html` | the proposal inside the real WorldView, route and seeded Ironworks layout, loaded the way the game would load it. Options: `?cam=top\|back\|left\|door\|turn\|custom&layout=0\|1&seed=&hour=&shot=1`, `?mode=props` (lineup), `?mode=props&only=<kind>` (close-up). |
| `docs/r3/render_r3_start.py` | renders every PNG above |

`node public/js/assets/test/check-assets.js` ends **ALL OK** with 239 kinds and 432 variants, including other packs.

## New kinds (tris per variant; budgets: props ≤ 1,500, buildings ≤ 2,600)

| kind | v | tris | size w×h×l (m) | notes |
|---|---|---|---|---|
| `tank_farm` | 0 depot / 1 refinery | 2,540 / 1,984 | 34×12×27 / 30×15×25 | Bunded tanks with bands, rust streaks, roof rails and cage ladders. Catwalks, pipes to a front header, valves, pump house and floodlights. Painted "DRY CREEK FUEL CO." / "…REFINERY". v1 adds an LPG bullet tank and a pipe rack. |
| `pumpjack` | 0 yellow / 1 oxblood | 1,044 | 2.6×6.2×11 | Named parts: **`head`** (walking beam, horsehead, bridle, pitman arms; pivot at the saddle bearing, `rotation.x = 0.22·sin(2πt/6.5)`) and **`crank`** (arms and counterweights, `rotation.x = −2πt/6.5`). Values are in `userData.anim`. 3 meshes. |
| `pipe_bridge` | – | 2,416 | 42×9×2.3 | Spans local X across the road. Towers at x = ±13.5, 6.8 m clearance, three pipes dropping to ground runs, "CAUTION · OVERHEAD PIPES" boards. |
| `refinery_gate` | – | 850 | 34×7×3.7 | Closed gate across the road: arch sign "DRY CREEK REFINERY · NO THROUGH ROAD", lit guard booth, boom, sliding chain-link gates, wings to ±17 m, STOP sign. |
| `utility_pole` | 0 / 1 transformer / 2 lamp | 480 / 606 / 516 | 32×10×2.6–4.1 | Wires sag half a span (16 m) to **both** sides, so poles placed 32 m apart give continuous wires. The bbox stays centred. `userData.span = 32`. |
| `diner_24h` | – | 1,146 | 18.5×7.8×15.7 | Stainless diner with a lit window band, vestibule, kitchen annex, and a neon roof sign "DINER · OPEN 24 HRS" (back: "LOU'S"). |
| `tyre_shop` | – | 1,482 | 17×9×13 | Cinder block, two lit bays (car on a lift), lit office, tyre racks and stacks, giant tyre on the roof, "DRY CREEK TIRE & WHEEL". |
| `corner_shop` | – | 672 | 13×12×12 | Two-storey brick mart: lit shopfront with posters, striped awning, neon OPEN, "DRY CREEK MART", ice chest, payphone, roof water tank, side mural. |
| `pole_sign` | 0 diner / 1 tyres / 2 mart | 832 / 160 / 160 | 4.5×10.8×0.9 | Tall double-sided roadside sign with a sub-board. v0 has marquee bulbs. |
| `tow_yard` | 0 impound / 1 scrap | 2,563 / 1,759 | 28×7.7×22 / 24×7.7×20 | Barbed chain-link lot (open or closed gate), junk-car hulks (stacked and crushed), tyre piles, container, floodlights. v0 adds "ROOK'S TOW YARD · IMPOUND" and a lit office cabin. |
| `tow_truck` | – | 1,084 | 2.8×3.7×9 | Rook's wrecker: boom, hydraulic ram, hook, wheel-lift, amber light bar, "ROOK'S TOWING" doors. |
| `dumpster_alley` | 0 / 1 recycling | 731 / 885 | 7.9×2.3×3.7 | Dumpsters (one lid open), crates, pallets, bags, screen wall. v1 adds a recycling cage with bales, drums and tyres. |
| `scrub_patch` | 0 slab / 1 slab XL / 2 dirt | 303 / 429 / 301 | 5.5–7.9 × ≤1.2 × 5–6.3 | Cracked concrete, weed tufts, scrub bushes and rubble. Flat filler that needs no collider. |

Kinds reused from the existing kits: `warehouse` (v0, v1, v2), `factory` (v0, v1), `water_tower_city`,
`chainlink_fence` v1, `billboard` (v0, v1), `streetlight`, `sedan`, `pickup`, `hatch`, `van`.

Materials: one vertex-colour material per kit. Lit parts use emissive Lambert with no map, so they bake into
the chunk's vertex-colour batch with per-vertex emission. Every sign is an opaque CanvasTexture that goes
through the runtime `SignAtlas`. Chain-link panels reuse the exact `chainlink_fence` material, created with
the same `panel()` options, so they merge with existing fences and never touch the shared texture's `repeat`.

## Layout (`r3-start-layout.js`)

Positions are given relative to the centre line: `u` (+ = driver's right = −X, the garage side), world `z`,
and `rot`. `rot` is `'face'` (front faces the road), `'road'` (local +Z points down the road), a number
(extra yaw on top of the heading), or `'chord'` (utility poles). World `x = track.xAt(z, u)`. The layout
works for any seed; overlaps were checked in-page against the generated Ironworks items for seeds 1337, 7,
42, 99 and 2024, with zero hits.

* **Right side, garage side**:
  * At the garage: Rook's tow yard (u 23, z −3…25), the tow truck on the apron's −Z end (z 26…35, out of the RV's way), and a tank farm (v1) behind the garage.
  * Toward +Z: the tyre shop (z 66…84) with its TIRES pole sign, forecourt and a parked pickup, then a dumpster alley (z 86…94), then the generated factories from z 96.
  * Behind the start: a billboard facing the garage, the HALBERG warehouse with its apron and a van at the dock, a recycling alley, the IRONWORKS factory, MESA cold storage, and the refinery tank farm.
  * Far backdrop at u 78…88 (`batch:'far'`).
* **Left side, across the road**:
  * A fenced pumpjack lot (z −2…29) with one live pumpjack, one idle pumpjack, and scrub.
  * Lou's diner (z 33…51) right across from the garage door, with its lot, three parked cars and the EAT pole sign.
  * The corner mart (z 69…83) with its lot, two cars, the MART sign and an alley. The LAST CHANCE GAS billboard faces the RV after the turn.
  * Further back: the water tower, the fuel depot (tank farm v0), a warehouse in the back lot, a second live pumpjack, the MESA warehouse, a factory and the refinery tanks.
* **On the road axis behind the start**: the pipe bridge (z −88), the closed refinery gate (z −100), and the refinery factory (z −140) in the vanishing point. The generator's streetlights continue every 34 m down to the gate.
* **Utility poles**: 8 poles along the left verge (u −11.6, z −64…160, every 32 m) with continuous sagging wires. The pole signs and the turn billboard are placed clear of the wire line.
* **Decals**: five lots and aprons, in the `chunks._decal` format.
* **Kept clear**:
  * the road and sidewalks (|u| ≤ 9.5);
  * the garage block and its door approach (z 37.5…48.5);
  * the RV's way out: door z 40.3…45.3, right turn toward +Z, swept area u −1…14 / z 38…62;
  * the tutorial, which runs inside the garage;
  * the generated streetlights (|u| 6.8);
  * the generated Ironworks rows beyond z 96 (right) and z 100 (left).

### Sim colliders needed (`startColliders(track)` → 39 segments in `sim/structures.js` format)

Only placements the RV can reach get colliders. The reach limit is `halfWidth + shoulder + sideRoom` =
22.1 m, or 29.5 m on the garage side at z 33…57. Edges entirely beyond 23.5 m are dropped.

| placement | collider |
|---|---|
| tow yard | front fence u 12.4, z −3…25, plus both side fences out to the reach limit |
| tow truck | capsule r 1.3 |
| tyre shop | forecourt rack line at u 21.6 |
| diner, mart | front lines at u ≈ 22.1 |
| 5 parked cars and the dock van | capsules r 1.0–1.1 |
| 3 pole signs | circles r 0.5 |
| 2 billboards | 2 post circles each |
| 3 chain-link fence pieces along the pumpjack lot | lines |
| 8 utility poles | circles r 0.3 |
| pipe-bridge towers | circles r 1.2 at u ±13.5 |
| refinery gate | line across u −17…17 (the reversing RV stops here), plus the booth box |

Everything else sits beyond the reach limit or is flat (scrub, decals). The new streetlights have no
collider, like the generated ones. No new sim zone is needed: the existing `garage` zone (z −15…105)
already keeps obstacles and cop spawns away, and nothing spawns at z < 0.

## How the game would load it (not done; game wiring untouched)

The preview applies exactly these five steps (see `r3-start-preview.html`).

1. **Reservations** (`render/world/layout.js`, `Layout` constructor, before any biome is generated):
   `info.res.push(...startReservations())`. The seeded generator then leaves u 10.5…100 alone for
   z −300…96 (right) and z −300…100 (left). Its far scatter (|u| > 104) and streetlights (|u| 6.8)
   still run.
2. **Static items** (`render/world/layout.js`, end of `GEN.ironworks`):
   `for (const it of startLayoutItems(g.t)) g.items.push(it);`
   These are normal Layout items and decals, so the chunks bake them into the existing near, far and
   atlas batches, with ground height, tint and lamp heads (the streetlights). Pushing directly bypasses
   `put()`'s `from − 200` clamp; the deepest item is at z −182.
   Alternatively, put the same loop in `structures.js buildStaticStructures(ctx)` with
   `put(ctx, protos.get(it.kind, it.v), track.xAt(it.z, it.u), 0, it.z, it.yaw, { batch: it.batch === 'far' ? ctx.B.far : null })`.
   The decals would then need `chunks._decal`, which is why the layout route is cleaner.
3. **Stream the ground back** (`render/chunks.js`, `update()` and `pending()`): today chunks stop at
   ci ≥ −2 (z ≥ −100). Near the start they should reach `R3_START_MIN_Z` = −200:
   ```js
   let a = Math.max(-2, Math.floor((z + this.range[0]) / CHUNK));
   if (z < 300) a = Math.min(a, Math.floor(R3_START_MIN_Z / CHUNK));   // −4
   ```
4. **Live pumpjacks** (`render/world/structures.js`, `StructuresView` constructor): use the same pattern as the garage door.
   ```js
   for (const p of startLive(t)) this.items.push({ key: p.id, z: p.z, make: () => {
     const root = lib.create(p.kind, p.variant); root.position.set(p.x, 0, p.z); root.rotation.y = p.yaw;
     const head = root.getObjectByName('head'), crank = root.getObjectByName('crank');
     const { period = 6.5, headAmp = 0.22 } = root.userData.anim || {}; let k = p.z * 0.37;
     return { root, update: (dt) => { k += dt; const a = k / period * Math.PI * 2;
       if (head) head.rotation.x = headAmp * Math.sin(a); if (crank) crank.rotation.x = -a; } };
   } });
   ```
5. **Colliders** (`sim/structures.js`, `structureLayout()`): `L.segs.push(...startColliders(track));`. All
   resolvers are pure functions of `track`, so the sim, the Autopilot and the renderer agree on every seed.

## Draw-call and triangle impact (frame totals incl. the shadow pass, swiftshader 1280×720, seed 1337, no traffic)

| view | calls before → after | tris before → after |
|---|---|---|
| from above | 68 → 80 | 136k → 172k |
| looking back | 32 → 63 | 63k → 124k |
| across the road | 22 → 38 | 51k → 96k |
| garage door (FP) | 41 → 56 | 72k → 116k |
| after the turn (FP) | 86 → 89 | 156k → 182k |

* **Per chunk**: the start chunks go from 2–6 meshes to 6–8. The added meshes are `decal`, `near:atlas`,
  `far`, and `near:raw` (chain-link) where a chunk had none, plus a second atlas page in two chunks. No
  per-item draw calls: every static prop merges into the chunk's existing batches. Chunks from z ≥ 100 on
  are unchanged.
* **New chunks**: −3 and −4 (z −200…−100), 4–5 meshes each. They exist only while the RV is within the
  first 300 m.
* **Live pumpjacks**: 2 × 3 meshes, plus their shadow casters, only within the `StructuresView` range (700 m).
* **Biggest jump**: the look-back view, +31 calls. That view was nearly empty before (32), and the game's
  normal Ironworks views already run ~85–90.

## Known limits / follow-ups

* Pumpjack pitman arms ride on the beam, so they don't follow the crank exactly. This is invisible at
  game distance.
* The junk cars are deliberately simple hulks. Parked cars reuse traffic models at about 1.1–1.4k tris each.
* In the after-turn shot, the right-hand mirror hides most of the tyre shop at z 60. It is fully visible
  from the garage door, the top view and the back view.
* Atlas page spill gives a second `near:atlas` mesh in two chunks. Smaller canvases for the long wall signs
  would avoid it.
* Night: only the `streetlight` kind registers `LAMP_HEADS`. The lamp pole (`utility_pole` v2) and the
  signs glow through emission but cast no light pools. The run starts at dawn, so this is optional.
