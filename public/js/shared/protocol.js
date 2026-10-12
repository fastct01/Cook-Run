// ─────────────────────────────────────────────────────────────────────────────
// Network + in-process message contract. Shared by server, driver(host) and cook.
// Every object here is plain JSON so it maps 1:1 to C# [Serializable] structs.
// ─────────────────────────────────────────────────────────────────────────────

export const ROLES = Object.freeze({ DRIVER: 'driver', COOK: 'cook' });

// ── Lobby messages (client ⇄ server). Field `t` is the message type. ──────────
// C→S
export const C2S = Object.freeze({
  CREATE: 'create',      // { t, name }
  JOIN: 'join',          // { t, code, name }
  ROLE: 'role',          // { t, role: 'driver'|'cook' }
  READY: 'ready',        // { t, ready: bool }
  START: 'start',        // { t }   (room creator only; needs 2 players, distinct roles, both ready)
  LEAVE: 'leave',        // { t }
  GAME: 'g',             // { t, m: GameMsg }  relayed verbatim to the other player in the room
  PING: 'ping',          // { t, at }
  SETTINGS: 'settings',  // { t, difficulty: 'easy'|'hard'|'extreme' }   (room creator only, before START) — Round 3
});
// S→C
export const S2C = Object.freeze({
  ROOM: 'room',          // { t, code, you: playerId, hostId, players: [{id,name,role,ready}], difficulty }
  ERROR: 'error',        // { t, msg }
  START: 'start',        // { t, seed, roles: { [playerId]: role }, difficulty }
  PEER_LEFT: 'peerLeft', // { t, id }
  GAME: 'g',             // { t, m: GameMsg, from }
  PONG: 'pong',          // { t, at }
});

// ── Game messages (inside C2S.GAME / S2C.GAME, or passed directly on LocalBus) ─
// Field `k` is the kind.
export const GM = Object.freeze({
  SNAP: 'snap',          // driver→cook  { k, s: Snapshot }               @ rules.net.snapshotHz
  LAB: 'lab',            // cook→driver  { k, l: LabState }               @ rules.net.labHz
  CMD: 'cmd',            // cook→driver  { k, c: CookCommand }            immediately
  END: 'end',            // driver→cook  { k, result: EndResult }         once
  CHAT: 'chat',          // either       { k, text }   (quick callouts: "COPS!", "HOLD STEADY")
});

// CookCommand.type values (cook → host sim). Host replies through snapshot.events.
export const CMD = Object.freeze({
  START_RECIPE: 'startRecipe', // { type, reqId, recipeId }  → host checks+deducts inventory → event recipeOk|recipeDenied
  RECIPE_DONE: 'recipeDone',   // { type, reqId, recipeId, quality: 0..1 } → product units / gadget charge / repair
  RECIPE_FAIL: 'recipeFail',   // { type, reqId, recipeId, reason }          (ingredients are lost)
  EXPLOSION: 'explosion',      // { type, power: 0..1 }
  CALLOUT: 'callout',          // { type, text }
  // ── expansion (see EXPANSION_CONTRACT.md) ──
  ROOF_ENTER: 'roofEnter',     // { type }                         Doc climbs out of the roof vent (only while stop.state is parked/shopping/returning/loading, or any time? → host decides)
  ROOF_LEAVE: 'roofLeave',     // { type }
  ROOF_AIM: 'roofAim',         // { type, yaw, pitch, spray: bool } yaw/pitch in RV-local frame (yaw 0 = RV forward), ~10 Hz while on the roof
  ROOF_THROW: 'roofThrow',     // { type, device: 'firecracker'|'balloon'|'flare', x, z }   world target point on the ground
  AVATAR_MOVE: 'avatarMove',   // { type, mx, mz, run }           garage tutorial: Doc's world-space move vector (-1..1), ~15 Hz
  AVATAR_ACT: 'avatarAct',     // { type }                         garage tutorial: Doc presses E (pick up / use / get in)
  AVATAR_JUMP: 'avatarJump',   // { type }                         garage tutorial: Doc presses Space (jump)
  // ── Round 3 (ROUND3_CONTRACT.md): Doc does the shop run; Rook defends. roofEnter/Leave/Aim/Throw above are
  //    retired for the cook (the roof belongs to Rook now) — the host ignores them from the cook.
  SHOP_ENTER: 'shopEnter',     // { type, stopId }                 Doc jumped out of the side door: the shop run started
  SHOP_DONE: 'shopDone',       // { type, stopId, score: 0..1 }    Doc finished the shop task
  SHOP_ABORT: 'shopAbort',     // { type, stopId }                 Doc gave up (or timed out on his side) and runs back
});

// Driver-side commands (host-local, never sent over the network): sim.applyDriverCommand(cmd)
export const DCMD = Object.freeze({
  SHOP_DONE: 'shopDone',       // { type, stopId, score: 0..1 }    shop challenge finished
  SHOP_ABORT: 'shopAbort',     // { type, stopId }                 Rook gave up and runs back to the RV
  SKIP_TUTORIAL: 'skipTutorial', // { type }                       host skips the garage tutorial
  // ── Round 3: Rook's roof defence (ROUND3_CONTRACT.md §Defend). All driver-local (host), so the sim stays authoritative.
  DEFEND: 'defend',            // { type, on: bool, ai?: bool }    F / DEFEND button: Rook climbs onto the roof (on) or back down (off).
                               //                                  ai: the sim's AI Rook aims and shoots (bots, solo stops)
  ROOF_AIM: 'roofAim',         // { type, yaw, pitch, ads: bool }  RV-local aim (yaw 0 = RV forward), every frame while on the roof
  ROOF_FIRE: 'roofFire',       // { type }                         one trigger pull with the selected gun (sim adds spread, ammo, heat)
  ROOF_RELOAD: 'roofReload',   // { type }                         R
  ROOF_SELECT: 'roofSelect',   // { type, slot }                   'revolver'|'shotgun'|'rifle'|'firecracker'|'balloon'|'flare'
  ROOF_THROW: 'roofThrow',     // { type, device, x, z }           throw the selected throwable at a world ground point
});

// Snapshot.events[].type values (host → cook + host's own renderer/audio).
export const EV = Object.freeze({
  RECIPE_OK: 'recipeOk',         // { type, reqId, recipeId }
  RECIPE_DENIED: 'recipeDenied', // { type, reqId, recipeId, reason }
  PED_HIT: 'pedHit',             // { type, x, z }
  CRASH: 'crash',                // { type, x, z, power }
  SMASH: 'smash',                // { type, x, z, kind }
  COP_WRECK: 'copWreck',         // { type, x, z }
  STOP_ENTER: 'stopEnter',       // { type, id, name }
  STOP_DONE: 'stopDone',         // { type, id, gives }
  STARS: 'stars',                // { type, stars }      heat level changed
  SPOTTED: 'spotted',            // { type }             cop saw the lab (curtains open while cooking)
  GADGET: 'gadget',              // { type, gadget, x, z }
  JUMP: 'jump',                  // { type }             left the lip
  LANDED: 'landed',              // { type, hard: bool }
  FELL: 'fell',                  // { type }             fell into the canyon → checkpoint
  COPS_GAVE_UP: 'copsGaveUp',    // { type }
  BIOME: 'biome',                // { type, id, name }
  TRAIN: 'train',                // { type, state: 'warn'|'pass'|'clear' }
  MSG: 'msg',                    // { type, text, tone: 'info'|'good'|'bad' }
  END: 'end',                    // { type, result }
  // ── expansion ──
  TUTORIAL: 'tutorial',          // { type, step, stepId }        garage tutorial advanced
  STOP_PARKED: 'stopParked',     // { type, id }                  RV parked in a stop lot → Rook goes shopping, Doc should get on the roof
  SHOP_RESULT: 'shopResult',     // { type, id, score, ok }
  ROOF: 'roof',                  // { type, on: bool }
  ROOF_HIT: 'roofHit',           // { type, copId, device, x, z }  a roof device hit a cop
  CANISTER: 'canister',          // { type, kind: 'flash'|'foam', x, z, hitRv: bool }   Rhino canister went off
  REGEN: 'regen',                // { type, on: bool }
  SETPIECE: 'setpiece',          // { type, id, kind, phase }     set-piece started/changed phase (HUD caption, audio)
  HEAT_DROP: 'heatDrop',         // { type, stars, reason }       e.g. car wash
  RV_EXPLODE: 'rvExplode',       // { type, x, y, z, yaw }         the RV hit 0 hp and blew up (just before EV.END); snapshot rv.wrecked stays true
  // ── Round 3 ──
  DEFEND: 'defend',              // { type, on: bool, ai: bool }   Rook started climbing up (on) / is back in the seat (off)
  SHOT: 'shot',                  // { type, gun, x, y, z, tx, ty, tz, copId: id|null, part: 'tyre'|'radiator'|'glass'|'body'|null, pellets?: [[tx,ty,tz,copId|null,part|null], …] }
                                 //   one trigger pull from the roof: muzzle (x,y,z) → first hit point (tx,ty,tz); shotgun lists every pellet
  RELOAD: 'reload',              // { type, gun, seconds }         reload started
  COP_HIT: 'copHit',             // { type, copId, gun, part, x, y, z, effect: 'hole'|'crack'|'tyre'|'radiator'|'stall' }
  COP_DISABLED: 'copDisabled',   // { type, copId, how: 'tyre'|'radiator'|'stall', x, z }   a police car is out of the fight
  COP_SHOT: 'copShot',           // { type, copId, x, y, z, tx, ty, tz, target: 'rv'|'rook', hit: bool, damage }   cops fire back
  DOC_OUT: 'docOut',             // { type, stopId, out: bool }    Doc jumped out of the side door (true) / is back inside (false)
  STOP_COPS: 'stopCops',         // { type, stopId, count, eta }   someone called it in: cops are on their way to the stop
});

// Entity kind codes used in Snapshot.ents tuples. Keep in sync with assets registry.
export const KIND = Object.freeze([
  'cop', 'cop_suv', 'heli', 'sedan', 'hatch', 'van', 'pickup', 'bus', 'truck', 'tractor', 'rival',
  'ped', 'cow', 'cone', 'trashcan', 'mailbox', 'hydrant', 'barrier', 'sprinkler', 'hay', 'tumbleweed',
  'pothole', 'sanddrift', 'rock_small', 'rock', 'cactus_road', 'spikes', 'falling_rock',
  'smoke_cloud', 'oil_slick', 'train', 'crossing_gate', 'roadblock',
  // ── expansion (appended; never reorder — ids are indices) ──
  'moto_cop', 'rhino_truck', 'interceptor', 'flashbang', 'foam_patch',
  'steam_leak', 'water_main', 'trench_plates', 'manhole_open', 'sinkhole', 'speed_bump', 'broken_car', 'trolley',
  'power_line_down', 'log', 'dust_devil', 'flood_wash', 'sheep', 'goat', 'horse', 'cowboy_horse',
  'comet_car', 'streetcar', 'car_carrier', 'wide_load', 'combine', 'logging_truck', 'chopper', 'parade_float',
  'band_member', 'stagecoach', 'inflatable_gorilla', 'garbage_truck', 'forklift', 'news_van', 'kestrel_car',
  'kestrel', 'sgt_pratt', 'cop_officer', 'swat_officer', 'comet_hero', 'freight_wagon', 'tornado', 'paint_splat',
]);
export const KIND_ID = Object.freeze(Object.fromEntries(KIND.map((k, i) => [k, i])));

/*
Snapshot (host → renderer every frame, → cook at 15 Hz). All distances metres, angles radians.
World: Y up, road runs toward +Z, X is lateral. Forward of yaw θ = (sin θ, 0, cos θ).
{
  t: number,                    // sim seconds
  phase: 'garage'|'countdown'|'drive'|'won'|'lost',   // 'garage' = on-foot tutorial (expansion)
  countdown: number,            // seconds left in countdown
  lostReason: null|'wrecked'|'busted'|'crewDown'|'noProduct',
  rv:   { x, y, z, yaw, pitch, roll, speed, steer, hp, airborne: bool, nitro: 0..1, flatTyre: bool, onRoad: bool },   // + wrecked: true once blown up (only present then)
  crew: { driver: hp, cook: hp },
  heat: { value: 0..5.99, stars: 0..5, seen: bool, gaveUp: bool },
  bust: 0..1,
  score:{ points, chaos, knocked, smashed, copsWrecked },
  inv:  { mat: { [ingredientId]: count }, units: number, quality: 0..1, gadgets: { smoke, oil, nitro } },
  stop: null | { id, name, progress: 0..1, blocked: bool },   // currently inside a supply stop lot
  nearStop: null | { id, name, dist },                         // next stop ahead within 250 m
  bridge: { dist: metres to lip (negative once passed), speedNeeded: m/s },
  biome: string, dist: number (rv.z), routeLength: number,
  feel: { latAcc: m/s², bump: 0..1, speed },                   // drives the cook's wobble
  alert:{ copClose: bool, copDist: number },                   // nearest cop distance
  lab:  { fumes, fire, ventOpen, curtains, cooking },          // echo of last LabState (driver sees fumes/vent smoke)
  ents: [ [id, kindId, x, y, z, yaw, variant, state], ... ],   // see KIND; state is kind-specific (below)
  events: [ {type,...}, ... ]                                  // one-shot, since previous snapshot
}
Entity `state` meanings:
  ped: 0 walk, 1 panic/run, 2 airborne (knocked), 3 dazed on ground, 4 getting up
  cop/cop_suv: 0 patrol(parked), 1 chase (lights on), 2 blinded by smoke, 3 spun out, 4 wrecked, 5 gave up
  heli: 1 chasing (spotlight)
  traffic cars: 0 driving, 1 crashed/stopped, 2 spun out
  cow/tumbleweed: 0 idle/rolling, 1 moving
  smashable props: 0 standing, 1 knocked (flying), 2 gone
  train: 0 passing ; crossing_gate: 0 up, 1 down (flashing)
  smoke_cloud/oil_slick: age seconds * 10 (int)

LabState (cook → host at 6 Hz):
{ cooking: bool, recipeId: string|null, step: int, stepType: string|null, temp: number,
  fumes: 0..1, fire: 0..1, ventOpen: bool, curtains: bool, cookHurt: number (hp lost since last send) }

── Expansion snapshot fields (EXPANSION_CONTRACT.md is the full spec) ──
  garage:   null | { step, stepId, rook:{x,z,yaw,speed,carry,inRv,y,jt}, doc:{x,z,yaw,speed,carry,inRv,y,jt},
                     items:{ keys, notebook, crate, plug, door: 0..1, engine: 'off'|'cranking'|'on' }, prompt:{ rook, doc } }
  stop:     null | { id, name, state:'parked'|'shopping'|'returning'|'loading'|'done', shopType, shopT, loadT, progress,
                     blocked, copDist, roof:{ active, aimYaw, aimPitch, spray, ammo:{ firecracker, balloon, flare } } }
  nearStop: null | { id, name, dist, side, z }       now reported within 800 m (banner) — next un-looted stop
  timeOfDay: hour (6.6 → 19.8)       area: { id, name }
  rv:       { ..., regen: bool, roofDoc: bool (Doc standing on the roof) }
  fx:       { fog: 0..1 (windscreen fog), flash: 0..1 (white-out), shock: 0..1 }
  setpieces:[ { id, type, phase, t, ...type-specific } ]   active set-pieces near the RV
  entity states (cop/cop_suv/interceptor/moto_cop/rhino_truck): 6 soaked (hose), 7 stalled (firecracker), 8 paint-blind
  flashbang: state 0 flying (y>0) · 1 on the ground (fuse) · 2 burst ; variant 0 flash · 1 foam

── Round 3 snapshot fields (ROUND3_CONTRACT.md is the full spec) ──
  difficulty: 'easy'|'hard'|'extreme'
  rv:       { ..., roofRook: bool (Rook visible on the roof), stopped: s the RV has been (nearly) standing still }
            roofDoc stays in the snapshot but is always false now (Doc never climbs up)
  crew:     { driver, cook, cookDown, regen: { driver: bool, cook: bool } }      (rv.regen is the hull's)
  bustInfo: { grace: s left before the meter may fill (0 = armed), armed: bool, defended: bool }
  roof:     Rook's roof defence (sim/roof.js state()) — also in stop.roof:
            { active, climbing, climbDir, climb: 0..1, onRoof, ai, available, why, nearCop: m,
              gun: 'revolver'|'shotgun'|'rifle', slot, ads, aimYaw, aimPitch, reloading: s left, reloadT: total s,
              mag: { revolver, shotgun, rifle }, reserve: { revolver, shotgun, rifle },
              throwables: { firecracker, balloon, flare }, cooldown: s until the next shot, fx: [ … in-flight throws … ] }
  stop:     { ..., doc: 'in'|'out'|'back', docShop: null | { label, frac: 0..1, tLeft: s } }
  copFx:    [ [copId, holes, crack 0|1, tyreMask (bit0 fl, bit1 fr, bit2 rl, bit3 rr), steam 0|1], … ]  damaged police cars
  entity states (cop kinds): 9 tyre out (slewing / stopped), 10 radiator hit (steaming, stalled)
LabState gains: shop: null | { stopId, label, frac: 0..1, tLeft }   (Doc's shop-run progress, shown on the driver's HUD)

EndResult:
{ won: bool, reason: string, units, quality, payout, points, chaos, knocked, timeSec, stars: 0..3 (rating),
  difficulty, scoreMult }
*/
