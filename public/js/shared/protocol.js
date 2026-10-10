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
});
// S→C
export const S2C = Object.freeze({
  ROOM: 'room',          // { t, code, you: playerId, hostId, players: [{id,name,role,ready}] }
  ERROR: 'error',        // { t, msg }
  START: 'start',        // { t, seed, roles: { [playerId]: role } }
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
});

// Driver-side commands (host-local, never sent over the network): sim.applyDriverCommand(cmd)
export const DCMD = Object.freeze({
  SHOP_DONE: 'shopDone',       // { type, stopId, score: 0..1 }    shop challenge finished
  SHOP_ABORT: 'shopAbort',     // { type, stopId }                 Rook gave up and runs back to the RV
  SKIP_TUTORIAL: 'skipTutorial', // { type }                       host skips the garage tutorial
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
  rv:   { x, y, z, yaw, pitch, roll, speed, steer, hp, airborne: bool, nitro: 0..1, flatTyre: bool, onRoad: bool },
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
  garage:   null | { step, stepId, rook:{x,z,yaw,speed,carry,inRv}, doc:{x,z,yaw,speed,carry,inRv},
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

EndResult:
{ won: bool, reason: string, units, quality, payout, points, chaos, knocked, timeSec, stars: 0..3 (rating) }
*/
