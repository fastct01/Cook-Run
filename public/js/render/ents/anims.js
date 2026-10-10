// ─────────────────────────────────────────────────────────────────────────────
// Animation table for the expansion entity kinds (data-driven, Unity-portable).
//
// Each kind lists
//   parts    RegExp of node names baked as animated rig parts (see rig.js)
//   lights   RegExp of parts whose emission is driven (start dark, `emit` channel)
//   group    'cop' | 'vehicle' | 'person' | 'animal' | 'hazard' | 'prop' | 'virtual'
//            (cop = lights + states 1–8 overlays; vehicle = may be thrown by the tornado)
//   wheels   true → every `wheel_*` part rolls with forward speed (radius measured)
//   channels [{ part, ch, fn, …params, when?, moving? }]  evaluated every frame, summed per (part, ch)
//   ctrl     name of a procedural controller in ents/controllers.js for what a curve can't say
//            (steam plume recipe, Rhino throw sequence, canister flight/burst, cargo detach …)
//   shadow   cast shadows (default true)
//
// Channels (map 1:1 to a Unity AnimationCurve on localEulerAngles / localPosition /
// localScale / an emission float, with the listed Animator parameters as inputs):
//   ch:  rx ry rz (radians, Euler order YXZ like the assets) · px py pz (m) · sx sy sz s (scale) ·
//        emit (emission multiplier) · alpha (translucent parts)
//   fn:  const {v}                          constant
//        sine  {amp, hz, base, phase, phaseStep}   base + amp·sin(2π·hz·t + phase + i·phaseStep)
//        abs   {amp, hz, base, phase, phaseStep}   base + amp·|sin(…)|          (bobbing, hops)
//        spin  {rate, perSpeed}             integrates (rate + perSpeed·speed)·dt  (reels, rings)
//        roll  {r}                          integrates forwardSpeed·dt / r       (wheels, logs)
//        gait  {amp, hz, perSpeed, phase, phaseStep, ref}  walk cycle: phase integrates
//                                           (hz + perSpeed·speed)·2π·dt, amplitude × min(1, speed/ref)
//        flash {hz, on, off, duty, phase}   square wave (lamps)
//        flicker {min, max, hz}             random hold per 1/hz s (sparks)
//        lean  {k, max}                     −yawRate·speed·k clamped (bikes into corners)
//   i  = index of the part within a glob ('flag_*' → flag_0 … flag_3), so phaseStep staggers them.
//   when: [states] only in those entity states;  moving: true only when speed > 0.3 m/s.
// Animator parameters an implementation needs: time, speed, forwardSpeed, yawRate, state.
// ─────────────────────────────────────────────────────────────────────────────

const HUMAN = /^(head|arm_l|arm_r|leg_l|leg_r|scarf|shield|instrument)$/;
const ANIMAL = /^(head|tail|leg_fl|leg_fr|leg_rl|leg_rr)$/;
const NONE = /^$/;

// walk cycle shared by the people (rotation.x > 0 swings a limb backward)
const WALK = [
  { part: 'leg_l', ch: 'rx', fn: 'gait', amp: 0.55, hz: 0.25, perSpeed: 0.55, ref: 1.4 },
  { part: 'leg_r', ch: 'rx', fn: 'gait', amp: 0.55, hz: 0.25, perSpeed: 0.55, ref: 1.4, phase: Math.PI },
];
const ARMSWING = [
  { part: 'arm_l', ch: 'rx', fn: 'gait', amp: 0.35, hz: 0.25, perSpeed: 0.55, ref: 1.4, phase: Math.PI },
  { part: 'arm_r', ch: 'rx', fn: 'gait', amp: 0.35, hz: 0.25, perSpeed: 0.55, ref: 1.4 },
];
const IDLE_HEAD = [{ part: 'head', ch: 'ry', fn: 'sine', amp: 0.25, hz: 0.11 }, { part: 'head', ch: 'rx', fn: 'sine', amp: 0.04, hz: 0.23 }];
// diagonal quadruped gait: FL+RR together, FR+RL opposite
const QUAD = (amp = 0.45, perSpeed = 0.9) => [
  { part: 'leg_fl', ch: 'rx', fn: 'gait', amp, hz: 0.6, perSpeed, ref: 0.8 },
  { part: 'leg_rr', ch: 'rx', fn: 'gait', amp, hz: 0.6, perSpeed, ref: 0.8 },
  { part: 'leg_fr', ch: 'rx', fn: 'gait', amp, hz: 0.6, perSpeed, ref: 0.8, phase: Math.PI },
  { part: 'leg_rl', ch: 'rx', fn: 'gait', amp, hz: 0.6, perSpeed, ref: 0.8, phase: Math.PI },
  { part: 'tail', ch: 'ry', fn: 'sine', amp: 0.35, hz: 1.7 },
  { part: 'tail', ch: 'rz', fn: 'sine', amp: 0.15, hz: 1.1 },
];
const COP_LIGHTS = /^light_/;

export const ANIMS = {
  // ── police ────────────────────────────────────────────────────────────────
  moto_cop: { group: 'cop', parts: /^(wheel_f|wheel_r|rider|light_red|light_blue)$/, lights: COP_LIGHTS, wheels: true, ctrl: 'moto',
    windshield: [0, 1.62, 0.1, -0.2, 0.42],
    channels: [{ part: 'rider', ch: 'rz', fn: 'lean', k: 0.012, max: 0.25 }] },
  rhino_truck: { group: 'cop', parts: /^(wheel_[a-z]+\d*|rear_door_l|rear_door_r|lobber|throw_point|light_red|light_blue)$/, lights: COP_LIGHTS, wheels: true, ctrl: 'rhino',
    windshield: [0, 2.15, 2.05, -0.55, 1.9] },
  interceptor: { group: 'cop', parts: /^(wheel_[a-z]+\d*|light_red|light_blue)$/, lights: COP_LIGHTS, wheels: true,
    windshield: [0, 1.17, 0.55, -1.0, 1.3] },
  flashbang: { group: 'prop', parts: /^(can)$/, ctrl: 'canister', shadow: false },
  paint_splat: { group: 'virtual', ctrl: 'paintSplat' },

  // ── road hazards ──────────────────────────────────────────────────────────
  steam_leak: { group: 'hazard', parts: /^(puff_\d+|cover)$/, ctrl: 'steam', shadow: true },
  water_main: { group: 'hazard', parts: /^(jet)$/, ctrl: 'waterMain',
    channels: [
      { part: 'jet', ch: 'sy', fn: 'sine', base: 0.975, amp: 0.125, hz: 2.3 },
      { part: 'jet', ch: 'sy', fn: 'sine', amp: 0.04, hz: 5.1 },
      { part: 'jet', ch: 'rx', fn: 'sine', amp: 0.05, hz: 0.9 },
      { part: 'jet', ch: 'rz', fn: 'sine', amp: 0.05, hz: 0.7, phase: 1 },
    ] },
  trench_plates: { group: 'hazard', parts: NONE },
  manhole_open: { group: 'hazard', parts: NONE },
  sinkhole: { group: 'hazard', parts: NONE },
  speed_bump: { group: 'hazard', parts: NONE, shadow: false },
  broken_car: { group: 'hazard', parts: /^(hood|hazard_l|hazard_r|engine_steam)$/, lights: /^hazard_/, ctrl: 'brokenCar',
    channels: [
      { part: 'hazard_l', ch: 'emit', fn: 'flash', hz: 1.4, on: 1.6, off: 0.05 },
      { part: 'hazard_r', ch: 'emit', fn: 'flash', hz: 1.4, on: 1.6, off: 0.05 },
      { part: 'engine_steam', ch: 's', fn: 'sine', base: 1, amp: 0.08, hz: 1.3 },
      { part: 'engine_steam', ch: 'alpha', fn: 'sine', base: 0.8, amp: 0.2, hz: 0.9 },
    ] },
  trolley: { group: 'prop', parts: NONE, ctrl: 'trolley' },
  power_line_down: { group: 'hazard', parts: /^(spark|spark_1)$/, lights: /^spark/, ctrl: 'powerLine',
    channels: [
      { part: 'spark', ch: 's', fn: 'flicker', min: 0, max: 1.5, hz: 14 },
      { part: 'spark_1', ch: 's', fn: 'flicker', min: 0, max: 1.5, hz: 12 },
      { part: 'spark', ch: 'emit', fn: 'flicker', min: 0.6, max: 2.2, hz: 14 },
      { part: 'spark_1', ch: 'emit', fn: 'flicker', min: 0.6, max: 2.2, hz: 12 },
    ] },
  log: { group: 'hazard', parts: /^(trunk)$/, channels: [{ part: 'trunk', ch: 'rx', fn: 'roll', r: 0.44 }] },
  dust_devil: { group: 'hazard', parts: /^(ring_\d|debris)$/, ctrl: 'dustDevil', shadow: false,
    channels: [
      { part: 'ring_*', ch: 'ry', fn: 'spin', rate: 2.4, rateStep: -0.25 },
      { part: 'ring_*', ch: 'px', fn: 'sine', amp: 0.18, hz: 0.45, phaseStep: 0.7, ampStep: 0.06 },
      { part: 'ring_*', ch: 'pz', fn: 'sine', amp: 0.12, hz: 0.38, phase: 1.3, phaseStep: 0.6, ampStep: 0.05 },
      { part: 'debris', ch: 'ry', fn: 'spin', rate: 1.6 },
    ] },
  flood_wash: { group: 'hazard', parts: NONE, ctrl: 'flood', shadow: false },
  foam_patch: { group: 'hazard', parts: /^(foam)$/, shadow: false, ctrl: 'foamPatch',
    channels: [
      { part: 'foam', ch: 'sy', fn: 'sine', base: 1, amp: 0.12, hz: 1.6 },
      { part: 'foam', ch: 'sx', fn: 'sine', base: 1, amp: 0.025, hz: 1.6, phase: Math.PI },
      { part: 'foam', ch: 'sz', fn: 'sine', base: 1, amp: 0.025, hz: 1.3, phase: 2 },
    ] },

  // ── animals ───────────────────────────────────────────────────────────────
  sheep: { group: 'animal', parts: ANIMAL, ctrl: 'animal', channels: [...QUAD(0.5, 1.1)] },
  goat: { group: 'animal', parts: ANIMAL, ctrl: 'animal', channels: [...QUAD(0.5, 1.1)] },
  horse: { group: 'animal', parts: ANIMAL, ctrl: 'animal', channels: [...QUAD(0.55, 0.45)] },
  cowboy_horse: { group: 'animal', parts: /^(body|head|tail|leg_fl|leg_fr|leg_rl|leg_rr|rider|rider_head|arm_l|arm_r)$/, ctrl: 'cowboy',
    channels: [
      ...QUAD(0.7, 0.42),
      { part: 'body', ch: 'py', fn: 'gait', amp: 0.07, hz: 0.6, perSpeed: 0.84, ref: 2, abs: true },
      { part: 'body', ch: 'rx', fn: 'gait', amp: 0.05, hz: 0.6, perSpeed: 0.42, ref: 2 },
      { part: 'head', ch: 'rx', fn: 'gait', amp: 0.12, hz: 0.6, perSpeed: 0.42, ref: 2, phase: 1.2 },
      { part: 'rider', ch: 'rx', fn: 'gait', amp: 0.06, hz: 0.6, perSpeed: 0.42, ref: 2, phase: 2.4 },
      { part: 'rider_head', ch: 'ry', fn: 'sine', amp: 0.3, hz: 0.13 },
      { part: 'arm_r', ch: 'rx', fn: 'sine', amp: 0.5, hz: 0.9, base: -1.6, when: [1, 2] },  // lasso overhead
      { part: 'arm_r', ch: 'rz', fn: 'sine', amp: 0.4, hz: 0.9, phase: 1.57, when: [1, 2] },
    ] },

  // ── set-piece vehicles ────────────────────────────────────────────────────
  comet_car: { group: 'vehicle', parts: /^(wheel_[a-z]+\d*|canopy|booster|glow)$/, lights: /^glow$/, wheels: true, ctrl: 'comet',
    channels: [
      { part: 'glow', ch: 'emit', fn: 'sine', base: 1.05, amp: 0.45, hz: 1.7 },
      { part: 'glow', ch: 'emit', fn: 'flicker', min: 0, max: 0.25, hz: 20 },
    ] },
  streetcar: { group: 'vehicle', parts: /^(wheel_[a-z]+\d*|pantograph)$/, wheels: true, ctrl: 'streetcar' },
  car_carrier: { group: 'vehicle', parts: /^(wheel_[a-z]+\d*|cargo_\d|ramp)$/, wheels: true, ctrl: 'carrier',
    detach: { glob: 'cargo_*', kinds: ['sedan', 'hatch', 'van', 'pickup', 'rival', 'kestrel_car', 'interceptor', 'cop'], radius: 16 } },
  wide_load: { group: 'vehicle', parts: /^(wheel_[a-z]+\d*|light_amber)$/, lights: /^light_amber$/, wheels: true, ctrl: 'amber',
    channels: [{ part: 'light_amber', ch: 'emit', fn: 'flash', hz: 1.6, on: 2.4, off: 0.35 }] },
  combine: { group: 'vehicle', parts: /^(wheel_[a-z]+\d*|reel)$/, wheels: true, ctrl: 'combine',
    channels: [{ part: 'reel', ch: 'rx', fn: 'spin', rate: 2.6, when: [0, 1] }] },
  logging_truck: { group: 'vehicle', parts: /^(wheel_[a-z]+\d*|log_\d|chains)$/, wheels: true, ctrl: 'logging',
    detach: { glob: 'log_*', kinds: ['log'], radius: 14, also: 'chains' } },
  chopper: { group: 'vehicle', parts: /^(wheel_f|wheel_r|rider)$/, wheels: true, ctrl: 'chopper',
    channels: [{ part: 'rider', ch: 'rz', fn: 'lean', k: 0.012, max: 0.25 }, { part: 'rider', ch: 'py', fn: 'abs', amp: 0.015, hz: 4, moving: true }] },
  parade_float: { group: 'vehicle', parts: /^(wheel_[a-z]+\d*|flag_\d)$/, wheels: true, ctrl: 'parade',
    channels: [
      { part: 'flag_*', ch: 'ry', fn: 'sine', amp: 0.45, hz: 1.3, phaseStep: 1.1 },
      { part: 'flag_*', ch: 'ry', fn: 'sine', amp: 0.12, hz: 3.7, phaseStep: 0.5 },
    ] },
  stagecoach: { group: 'vehicle', parts: /^(wheel_[a-z]+\d*|horse_\d|leg_fl|leg_fr|leg_rl|leg_rr)$/, wheels: true, ctrl: 'stagecoach' },
  inflatable_gorilla: { group: 'prop', parts: /^(body|arm_l|arm_r)$/, ctrl: 'gorilla',
    channels: [
      { part: 'body', ch: 'rx', fn: 'sine', amp: 0.08, hz: 0.55 },
      { part: 'body', ch: 'rz', fn: 'sine', amp: 0.1, hz: 0.41, phase: 1 },
      { part: 'body', ch: 'rz', fn: 'sine', amp: 0.03, hz: 1.9 },
      { part: 'body', ch: 'sy', fn: 'sine', base: 1, amp: 0.045, hz: 1.2 },          // squash & stretch
      { part: 'body', ch: 'sx', fn: 'sine', base: 1, amp: 0.022, hz: 1.2, phase: Math.PI },
      { part: 'body', ch: 'sz', fn: 'sine', base: 1, amp: 0.022, hz: 1.2, phase: Math.PI },
      { part: 'arm_l', ch: 'rz', fn: 'sine', base: 0.75, amp: 0.65, hz: 0.9 },       // flailing
      { part: 'arm_r', ch: 'rz', fn: 'sine', base: -0.75, amp: 0.65, hz: 0.83, phase: 2.1 },
      { part: 'arm_l', ch: 'rx', fn: 'sine', amp: 0.45, hz: 0.61, phase: 0.5 },
      { part: 'arm_r', ch: 'rx', fn: 'sine', amp: 0.45, hz: 0.67, phase: 2.6 },
    ] },
  garbage_truck: { group: 'vehicle', parts: /^(wheel_[a-z]+\d*|lifter)$/, wheels: true, ctrl: 'garbage' },
  forklift: { group: 'vehicle', parts: /^(wheel_[a-z]+\d*|forks)$/, wheels: true,
    channels: [{ part: 'forks', ch: 'py', fn: 'abs', amp: 0.9, hz: 0.12 }] },
  news_van: { group: 'vehicle', parts: /^(wheel_[a-z]+\d*|dish|mast)$/, wheels: true,
    channels: [{ part: 'dish', ch: 'ry', fn: 'sine', amp: 0.6, hz: 0.07 }] },
  kestrel_car: { group: 'vehicle', parts: /^(wheel_[a-z]+\d*)$/, wheels: true },
  freight_wagon: { group: 'vehicle', parts: /^(wheel_[a-z]+\d*)$/, wheels: true, ctrl: 'freight' },
  tornado: { group: 'virtual', ctrl: 'tornado' },

  // ── people ────────────────────────────────────────────────────────────────
  band_member: { group: 'person', parts: HUMAN, ctrl: 'band',
    channels: [   // marching in place even when slow; arms stay on the instrument
      { part: 'leg_l', ch: 'rx', fn: 'sine', amp: 0.5, hz: 1.05, base: -0.12 },
      { part: 'leg_r', ch: 'rx', fn: 'sine', amp: 0.5, hz: 1.05, base: -0.12, phase: Math.PI },
      { part: 'instrument', ch: 'py', fn: 'abs', amp: 0.035, hz: 1.05 },
      { part: 'instrument', ch: 'rx', fn: 'sine', amp: 0.06, hz: 2.1 },
      { part: 'head', ch: 'rx', fn: 'abs', amp: 0.05, hz: 1.05, base: -0.02 },
    ] },
  kestrel: { group: 'person', parts: HUMAN, ctrl: 'person',   // 0 idle (cane), 1 walking, 2 talking
    channels: [...WALK, ...IDLE_HEAD, { part: 'head', ch: 'rx', fn: 'sine', amp: 0.05, hz: 0.07, phase: 2 },
      { part: 'head', ch: 'rx', fn: 'sine', amp: 0.12, hz: 1.7, when: [2] }, { part: 'arm_r', ch: 'rx', fn: 'sine', base: -0.5, amp: 0.25, hz: 0.9, when: [2] }] },
  sgt_pratt: { group: 'person', parts: HUMAN, ctrl: 'person',
    channels: [...WALK, { part: 'head', ch: 'rx', fn: 'sine', base: 0.18, amp: 0.05, hz: 0.31, when: [0] },
      { part: 'arm_r', ch: 'rz', fn: 'sine', amp: 0.08, hz: 2.7, when: [0] },          // scribbling
      { part: 'arm_r', ch: 'rx', fn: 'sine', amp: 0.05, hz: 1.9, when: [0] }] },
  cop_officer: { group: 'person', parts: HUMAN, ctrl: 'person',
    channels: [...WALK, ...ARMSWING, ...IDLE_HEAD,
      { part: 'arm_r', ch: 'rx', fn: 'const', v: -2.6, when: [0] },                     // standing, hand up ("STOP!")
      { part: 'arm_r', ch: 'rz', fn: 'sine', amp: 0.35, hz: 1.6, when: [0] }] },
  swat_officer: { group: 'person', parts: HUMAN, ctrl: 'person', channels: [...WALK, { part: 'arm_r', ch: 'rx', fn: 'gait', amp: 0.35, hz: 0.25, perSpeed: 0.55, ref: 1.4 }, ...IDLE_HEAD] },
  comet_hero: { group: 'person', parts: HUMAN, ctrl: 'person',
    channels: [...WALK, { part: 'scarf', ch: 'ry', fn: 'sine', amp: 0.35, hz: 1.4 }, { part: 'scarf', ch: 'rx', fn: 'sine', amp: 0.15, hz: 2.3 }, { part: 'head', ch: 'ry', fn: 'sine', amp: 0.2, hz: 0.09 }] },
};

// ── evaluator ────────────────────────────────────────────────────────────────
const TAU = Math.PI * 2;
const hash = (a, b) => { let h = Math.imul((a | 0) ^ Math.imul(b | 0, 0x9e3779b1), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const CH = ['rx', 'ry', 'rz', 'px', 'py', 'pz', 'sx', 'sy', 'sz', 'emit', 'alpha'];
const CHI = Object.fromEntries(CH.map((c, i) => [c, i]));

/** Expand the channel list against a proto's part names once (globs → part indices). */
export function compileChannels(def, proto) {
  const out = [];
  for (const c of def.channels || []) {
    let idxs;
    if (c.part.includes('*')) {
      const re = new RegExp('^' + c.part.replace(/\*/g, '(\\d+)') + '$');
      idxs = Object.entries(proto.parts).filter(([n]) => re.test(n) && !n.includes('.'))
        .sort((a, b) => (+a[0].match(re)[1]) - (+b[0].match(re)[1])).map(([, i]) => i);
    } else idxs = proto.parts[c.part] !== undefined ? [proto.parts[c.part]] : [];
    idxs.forEach((pi, i) => {
      const chans = c.ch === 's' ? ['sx', 'sy', 'sz'] : [c.ch];
      for (const ch of chans) {
        const isS = ch[0] === 's';
        const base = c.base !== undefined ? c.base : (isS && c.fn !== 'flicker' && c.fn !== 'const' ? 1 : 0);
        out.push({ ...c, pi, i, chi: CHI[ch], base });
      }
    });
  }
  // per-part slots used
  const parts = [...new Set(out.map((c) => c.pi))];
  return { list: out, parts };
}

/**
 * Evaluate the compiled channels for one entity and write the pose into the rig.
 * acc: per-entity Float64Array accumulator (spin/roll/gait phases), sized list.length.
 * p: { t, dt, speed, fwd, yawRate, state, seed }
 */
export function evalChannels(comp, rig, acc, p) {
  const n = comp.list.length;
  if (!n) return;
  // pose accumulators: per part → 11 channels
  const pose = evalChannels._pose || (evalChannels._pose = new Map());
  pose.clear();
  for (let k = 0; k < n; k++) {
    const c = comp.list[k];
    if (c.when && !c.when.includes(p.state)) continue;
    if (c.moving && p.speed < 0.3) continue;
    let arr = pose.get(c.pi);
    if (!arr) { arr = [0, 0, 0, 0, 0, 0, 1, 1, 1, NaN, NaN]; arr.touched = new Set(); pose.set(c.pi, arr); }
    const ph = (c.phase || 0) + c.i * (c.phaseStep || 0) + (c.seedPhase ? p.seed * TAU : 0);
    const amp = (c.amp || 0) + c.i * (c.ampStep || 0);
    let v = 0;
    switch (c.fn) {
      case 'const': v = c.v; break;
      case 'sine': v = amp * Math.sin(TAU * c.hz * p.t + ph); break;
      case 'abs': v = amp * Math.abs(Math.sin(TAU * c.hz * p.t + ph)); break;
      case 'spin': acc[k] += ((c.rate || 0) + c.i * (c.rateStep || 0) + (c.perSpeed || 0) * p.speed) * p.dt; v = acc[k]; break;
      case 'roll': acc[k] += (p.fwd * p.dt) / (c.r || 0.4); v = acc[k]; break;
      case 'gait': {
        acc[k] += ((c.hz || 0.5) + (c.perSpeed || 0) * p.speed) * TAU * p.dt * (p.speed > 0.15 ? 1 : 0.2);
        const k01 = Math.min(1, p.speed / (c.ref || 1));
        const s = Math.sin(acc[k] + ph);
        v = amp * (c.abs ? Math.abs(s) : s) * k01;
        break;
      }
      case 'flash': { const f = ((p.t * c.hz + (c.phase || 0) / TAU + c.i * (c.phaseStep || 0)) % 1 + 1) % 1; v = f < (c.duty ?? 0.5) ? c.on : (c.off ?? 0); break; }
      case 'flicker': { const slot = Math.floor(p.t * (c.hz || 10)); const r = hash(slot, (p.seed * 1e6 | 0) + k * 7919); v = c.min + (c.max - c.min) * r; break; }
      case 'lean': v = Math.max(-c.max, Math.min(c.max, -p.yawRate * p.speed * c.k)); break;
      default: v = 0;
    }
    const chi = c.chi;
    if (chi >= 6 && chi <= 8) {
      // scale channels multiply around their base
      if (!arr.touched.has(chi)) { arr[chi] = c.base + v; arr.touched.add(chi); } else arr[chi] *= (c.base + v) / (c.base || 1);
    } else if (chi >= 9) {
      arr[chi] = (Number.isNaN(arr[chi]) ? 0 : arr[chi]) + c.base + v;
    } else arr[chi] += c.base + v;
  }
  for (const [pi, a] of pose) {
    rig.setRotIdx(pi, _eulerQ(a[0], a[1], a[2]));
    rig.setOffsetIdx(pi, a[3], a[4], a[5]);
    rig.setScaleIdx(pi, a[6], a[7], a[8]);
    if (!Number.isNaN(a[9])) rig.setEmitIdx(pi, Math.max(0, a[9]));
    if (!Number.isNaN(a[10])) rig.setAlphaIdx(pi, Math.max(0, Math.min(1, a[10])));
  }
}

// Euler (YXZ) → quaternion without allocating
const _q = { x: 0, y: 0, z: 0, w: 1 };
function _eulerQ(x, y, z) {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  // three.js Quaternion.setFromEuler, order 'YXZ'
  _q.x = s1 * c2 * c3 + c1 * s2 * s3;
  _q.y = c1 * s2 * c3 - s1 * c2 * s3;
  _q.z = c1 * c2 * s3 - s1 * s2 * c3;
  _q.w = c1 * c2 * c3 + s1 * s2 * s3;
  return _q;
}
export const eulerQ = _eulerQ;
