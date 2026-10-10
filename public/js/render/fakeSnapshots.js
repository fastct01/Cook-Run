// ─────────────────────────────────────────────────────────────────────────────
// Scripted fake Snapshot generator (no sim) for view-test.html — and handy as an
// attract-mode backdrop. Produces protocol.js-shaped snapshots.
//
//   const gen = new FakeSnapshots(data, { seed, preset: '300' });
//   gen.snapshot(T) → Snapshot   (T = harness seconds since preset start)
// Presets: 300 city · 2000 suburbs+stop · 3550 train · 5000 desert · 5400 dust ·
//          6150 canyon+bridge prompt · 6305 airborne · 6900 sell point · drive (free run)
//          route (expansion, VIEW-WORLD-A): drive the 40 km route from `start` at `speed`
// Expansion fields on EVERY snapshot (world-test.html / world view):
//   timeOfDay (route keyframes, or opts.hour), nearStop {id,name,dist,side,z} (next un-looted stop
//   ≤ rules.stops.bannerDist), looted [ids] (opts.looted), setpieces [drawbridge {angle}] near the
//   drawbridge (opts.bridgeAngle or a slow rise/fall), garage {items:{door}} + phase 'garage' when
//   opts.garage is set (door from opts.door or a slow open cycle).
// ─────────────────────────────────────────────────────────────────────────────
import { Track } from '../sim/track.js';
import { KIND_ID } from '../shared/protocol.js';

const K = KIND_ID;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const PRESETS = {
  '300':  { start: 228, speed: 25, freeze: 2.6, stars: 2, label: 'Downtown chase' },
  '2000': { start: 1872, speed: 22, freeze: 1.9, stars: 0, label: 'Suburbs + supply stop' },
  '3550': { start: 3440, speed: 20, stopAt: 3528, freeze: 6.5, stars: 1, label: 'Train crossing' },
  '5000': { start: 4935, speed: 27, freeze: 2.4, stars: 3, label: 'Open desert' },
  '5400': { start: 5330, speed: 24, freeze: 2.6, stars: 1, dust: true, label: 'Dust storm' },
  '6150': { start: 6095, speed: 23, freeze: 2.4, stars: 5, label: 'Canyon approach' },
  '6305': { start: 6190, speed: 29, freeze: 4.42, stars: 0, gaveUp: true, label: 'Bridge jump' },
  '6900': { start: 6800, speed: 16, stopAt: 6886, freeze: 6.6, stars: 0, label: 'Sell point' },
  drive:  { start: 30, speed: 25, freeze: null, stars: 1, label: 'Free drive' },
  route:  { start: 60, speed: 18, freeze: null, stars: 0, label: 'Expansion route drive (world test)' },
  zoo:    { start: 996, speed: 0, freeze: 2.0, stars: 4, label: 'Entity zoo (close-up of every state)', cam: { pos: [0, 6.5, 1000], target: [0, 1.2, 1021], fov: 55 } },
};

export class FakeSnapshots {
  constructor(data, { seed, preset = '300', role = 'driver', start = null, speed = null, hour = null, looted = null, bridgeAngle = null, garage = false, door = null, lane = 0 } = {}) {
    this.data = data;
    this.route = data.route;
    this.rules = data.rules;
    this.seed = seed ?? this.route.defaultSeed;
    this.track = new Track(this.route, this.seed);
    this.preset = PRESETS[preset] ? preset : '300';
    this.P = { ...PRESETS[this.preset] };
    if (start != null) this.P.start = start;
    if (speed != null) this.P.speed = speed;
    this.role = role;
    this.fired = new Set();
    this.lastT = -1;
    this.biome = null;
    this.hour = hour;
    this.looted = looted ? [...looted] : [];
    this.bridgeAngle = bridgeAngle;
    this.garage = !!garage;
    this.door = door;
    this.lane = lane | 0;
  }

  /** route time-of-day keyframes at z (hours) */
  hourAt(z) {
    const k = this.route.timeOfDay || [[0, 12]];
    if (z <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) if (z <= k[i][0]) { const a = k[i - 1], b = k[i]; return a[1] + (b[1] - a[1]) * (z - a[0]) / (b[0] - a[0]); }
    return k[k.length - 1][1];
  }
  /** next un-looted stop ahead within the banner distance */
  nearStopAt(z) {
    const max = (this.rules && this.rules.stops && this.rules.stops.bannerDist) || 800;
    let best = null;
    for (const st of this.route.stops) {
      if (this.looted.includes(st.id)) continue;
      const d = st.z - z;
      if (d < -st.lotLength / 2 - 4 || d > max) continue;
      if (!best || st.z < best.z) best = { id: st.id, name: st.name, dist: Math.max(0, d), side: st.side, z: st.z };
    }
    return best;
  }

  laneU(z, forward = true, rank = 0) {
    const n = this.track.lanesAt(z);
    const half = n / 2;
    const i = forward ? half + rank : half - 1 - rank;
    return this.track.laneU(z, clamp(i, 0, n - 1));
  }
  pose(z, u, dir = 1) {
    const t = this.track;
    return [t.xAt(z, u), z, t.headingAt(z) + (dir < 0 ? Math.PI : 0)];
  }

  rvAt(T) {
    const P = this.P, t = this.track;
    let z, speed = P.speed;
    if (P.stopAt) {
      // constant speed, then brake to a stop at stopAt
      const dec = 7;
      const brakeDist = (speed * speed) / (2 * dec);
      const tb = Math.max(0, (P.stopAt - brakeDist - P.start) / speed);
      if (T < tb) z = P.start + speed * T;
      else { const tt = Math.min(T - tb, speed / dec); z = P.start + speed * tb + speed * tt - 0.5 * dec * tt * tt; speed = Math.max(0, speed - dec * tt); }
    } else z = P.start + speed * T;
    if (this.preset === 'drive') z = P.start + ((P.speed * T) % (this.route.routeLength - 60 - P.start));
    if (this.preset === 'route') z = Math.min(this.route.routeLength - 5, P.start + P.speed * T);
    const u = this.laneU(z, true, this.preset === 'route' ? this.lane : 0);
    let x = t.xAt(z, u), y = t.surfaceY(z), pitch = 0, airborne = false, roll = 0;
    const br = t.bridge;
    if (br && z >= br.rampStart && z < br.lip) pitch = t.rampAngle();
    if (br && z >= br.lip) {
      // ballistic from the lip
      const zl = br.lip, v = P.speed, a = t.rampAngle();
      const vz = v * Math.cos(a), vy0 = v * Math.sin(a);
      const tt = (z - zl) / vz;
      const yy = br.rampHeight + vy0 * tt - 0.5 * 9.81 * tt * tt;
      const ground = t.surfaceY(z);
      if (ground == null || yy > ground + 0.05) { y = yy; airborne = true; pitch = Math.atan2(vy0 - 9.81 * tt, vz) * 0.6; roll = Math.sin(tt * 3) * 0.04; }
      else { y = ground ?? 0; }
    }
    if (y == null) y = 0;
    const yaw = t.headingAt(z);
    return { x, y, z, yaw, pitch, roll, speed, steer: Math.sin(T * 0.7) * 0.15, hp: 82, airborne, nitro: 0, flatTyre: false, onRoad: true };
  }

  snapshot(T) {
    const P = this.P;
    const Tf = P.freeze != null && !this.free ? Math.min(T, P.freeze) : T;
    const rv = this.rvAt(Tf);
    const t = this.track;
    const z = rv.z;
    const ents = [];
    const events = [];
    const fire = (key, at, ev) => { if (Tf >= at && !this.fired.has(key)) { this.fired.add(key); events.push(ev); } };
    const biome = t.biomeAt(z);
    if (biome.id !== this.biome) { this.biome = biome.id; events.push({ type: 'biome', id: biome.id, name: biome.name }); }
    let id = 1;
    const add = (kind, x, y, zz, yaw, variant = 0, state = 0) => ents.push([id++, K[kind], +x.toFixed(3), +y.toFixed(3), +zz.toFixed(3), +yaw.toFixed(4), variant, state]);
    const hw = t.halfWidth(z), sh = t.shoulder(z);
    const lab = { fumes: 0.2, fire: 0, ventOpen: false, curtains: false, cooking: false };
    let stop = null, nearStop = null, weather = null;
    let heat = { value: P.stars + 0.4, stars: P.stars, seen: P.stars > 0, gaveUp: !!P.gaveUp };
    let bust = 0;
    const feel = { latAcc: Math.sin(Tf * 0.7) * 1.2, bump: 0.05, speed: rv.speed };

    // ── per preset scripted entities ─────────────────────────────────────
    const S = this.preset;
    const civ = (kind, zz, forward, rank, speed, variant) => {
      const z1 = zz + (forward ? 1 : -1) * speed * Tf;
      const [x, , yaw] = this.pose(z1, this.laneU(z1, forward, rank), forward ? 1 : -1);
      add(kind, x, 0, z1, yaw, variant, 0);
    };
    const walker = (zz, u, dirX, speed, variant, state = 0) => {
      const [x0] = this.pose(zz, u);
      const x = x0 + dirX * speed * Tf;
      add('ped', x, 0, zz, dirX > 0 ? Math.PI / 2 : -Math.PI / 2, variant, state);
    };
    const strollZ = (zz, u, dir, speed, variant) => {
      const z1 = zz + dir * speed * Tf;
      const [x, , yaw] = this.pose(z1, u, dir);
      add('ped', x, 0, z1, yaw, variant, 0);
    };
    const prop = (kind, zz, u, variant = 0, state = 0, yaw = 0) => { const [x] = this.pose(zz, u); add(kind, x, 0, zz, t.headingAt(zz) + yaw, variant, state); };

    if (S === '300') {
      // traffic
      civ('sedan', 268, true, 1, 12, 1); civ('bus', 300, true, 0, 9, 0); civ('hatch', 330, true, 1, 13, 3);
      civ('sedan', 420, false, 0, 13, 4); civ('pickup', 470, false, 1, 12, 2); civ('hatch', 520, false, 0, 11, 5); civ('van', 380, true, 1, 11, 1);
      // peds crossing at the crosswalk (z≈292)
      const cw = 300 - 5.5 - 2.2;
      walker(cw - 0.6, -7.5, -1, 1.3, 0); walker(cw + 0.8, -4.8, -1, 1.5, 3); walker(cw - 0.4, 6.8, 1, 1.2, 5);
      walker(cw + 0.5, 3.2, 1, 3.4, 2, 1); // panicking runner
      // sidewalk strollers
      for (let i = 0; i < 8; i++) strollZ(250 + i * 17, (i % 2 ? 1 : -1) * (hw + sh + 1.6 + (i % 3) * 0.6), i % 3 ? 1 : -1, 1.3, i);
      // a knocked ped flying (BONK!)
      const kz = 299 + Math.min(1, Math.max(0, Tf - 2.15)) * 9;
      const ka = Math.max(0, Tf - 2.15);
      if (Tf > 2.15) { const [kx] = this.pose(kz, 5.6 + ka * 3); add('ped', kx, Math.max(0, 0.6 + 6 * ka - 4.9 * ka * ka), kz, Math.PI / 2, 4, 2); }
      else { const [kx] = this.pose(299, 4.0 - Tf * 0.4); add('ped', kx, 0, 299, -Math.PI / 2, 4, 1); }
      fire('bonk', 2.15, { type: 'pedHit', x: t.xAt(301, 5.4), z: 301 });
      // a dazed ped on the far sidewalk with stars
      prop('ped', 318, -(hw + sh + 1.2), 6, 3, Math.PI / 2);
      // obstacles
      prop('cone', 340, hw - 0.6); prop('cone', 343, hw - 0.4); prop('trashcan', 352, hw + sh + 0.6);
      prop('hydrant', 362, -(hw + sh + 0.4)); prop('barrier', 395, hw - 1.2, 0, 0, Math.PI / 2 * 0);
      // cops: one right behind-right (lights), one further back
      { const cz = z - 7.5; const [x, , yaw] = this.pose(cz, this.laneU(cz, true, 1)); add('cop', x, 0, cz, yaw + 0.03, 0, 1); }
      { const cz = z - 34; const [x, , yaw] = this.pose(cz, this.laneU(cz, true, 0)); add('cop_suv', x, 0, cz, yaw, 0, 1); }
      lab.cooking = true; lab.ventOpen = true; lab.fumes = 0.35;
      fire('stars', 0.5, { type: 'stars', stars: 2 });
    }

    if (S === '2000') {
      civ('sedan', 1905, true, 0, 11, 2); civ('pickup', 1990, false, 0, 13, 1); civ('van', 2060, false, 0, 12, 3); civ('hatch', 1960, true, 0, 12, 4);
      for (let i = 0; i < 4; i++) strollZ(1880 + i * 23, (i % 2 ? 1 : -1) * (hw + sh + 1.6), i % 2 ? 1 : -1, 1.2, i + 2);
      prop('mailbox', 1912, hw + sh + 0.5); prop('mailbox', 1930, -(hw + sh + 0.5), 1); prop('sprinkler', 1975, hw + sh + 3.5, 0);
      prop('trashcan', 1945, hw + 0.4); prop('pothole', 1925, 1.6);
      const st = this.route.stops.find((s) => s.id === 'gas_ice');
      nearStop = { id: st.id, name: st.name, dist: Math.max(0, st.z - z) };
      lab.ventOpen = true; lab.cooking = true;
    }

    if (S === '3550') {
      const tz = 3550;
      // gates down on both sides
      prop('crossing_gate', tz - 4.2, hw + 1.4, 0, 1, 0);
      { const [x] = this.pose(tz + 4.2, -(hw + 1.4)); add('crossing_gate', x, 0, tz + 4.2, Math.PI + t.headingAt(tz), 0, 1); }
      // train passing (moving toward +X)
      const tx = t.centerX(tz) - 60 + Tf * 16;
      add('train', tx, 0, tz, Math.PI / 2, 0, 0);
      fire('warn', 0.3, { type: 'train', state: 'warn' });
      civ('tractor', 3600, false, 0, 0.0, 0);
      civ('pickup', 3512, true, 0, 0, 2);
      prop('hay', 3500, -(hw + 2.5)); prop('cow', 3485, hw + 5, 0, 0, 1.2); prop('cow', 3478, hw + 8, 1, 0, -0.6);
    }

    if (S === '5000') {
      // rival pickup ramming from the oncoming lane (same direction)
      { const rz = z + 3.5 + Math.sin(Tf) * 0.6; const [x, , yaw] = this.pose(rz, this.laneU(rz, false, 0) + 0.4); add('rival', x, 0, rz, yaw - 0.05, 0, 0); }
      civ('truck', 5160, false, 0, 15, 1);
      // tumbleweeds rolling across
      for (let i = 0; i < 3; i++) { const zz = 5010 + i * 27; const [x0] = this.pose(zz, 9 - i * 3); add('tumbleweed', x0 + Tf * (5 + i), 0, zz + Math.sin(Tf * 2 + i) * 0.5, Math.PI / 2, i, 1); }
      // dropped smoke + oil behind, cops caught in them
      { const sz = z - 30; const [x] = this.pose(sz, 1.0); add('smoke_cloud', x, 0, sz, 0, 0, Math.round((1.4 + Tf * 0.2) * 10)); }
      { const oz = z - 48; const [x] = this.pose(oz, 1.6); add('oil_slick', x, 0, oz, 0.5, 0, 30); }
      { const cz = z - 50; const [x, , yaw] = this.pose(cz, 1.4); add('cop', x, 0, cz, yaw + Tf * 3.5, 0, 3); }
      { const cz = z - 31; const [x, , yaw] = this.pose(cz, -1.2); add('cop_suv', x, 0, cz, yaw + 0.15, 0, 2); }
      prop('rock', 5080, -2.6, 1); prop('sanddrift', 5045, 0.5); prop('cactus_road', 5072, hw - 0.5, 2);
      const st = this.route.stops.find((s) => s.id === 'lastgas');
      nearStop = { id: st.id, name: st.name, dist: Math.max(0, st.z - z) };
      fire('stars', 0.4, { type: 'stars', stars: 3 });
      lab.cooking = true; lab.ventOpen = true; lab.fumes = 0.5;

    }

    if (S === '5400') {
      weather = 'dust';
      civ('truck', 5470, false, 0, 15, 2);
      for (let i = 0; i < 5; i++) { const zz = 5380 + i * 14; const [x0] = this.pose(zz, 12 - i * 5); add('tumbleweed', x0 + Tf * 9, 0, zz, Math.PI / 2, i, 1); }
      prop('sanddrift', 5410, -1.2); prop('sanddrift', 5440, 1.6, 1);
      { const cz = z - 20; const [x, , yaw] = this.pose(cz, this.laneU(cz, true, 0)); add('cop', x, 0, cz, yaw, 0, 1); }
    }

    if (S === '6150') {
      { const hz = z + 14 + Math.sin(Tf * 0.5) * 2; const [x, , yaw] = this.pose(hz, -6); add('heli', x, 17, hz, yaw + Math.PI, 0, 1); }
      // rockfall: one falling with a shadow, one landed, small ones
      const fy = Math.max(0, 26 - 9.81 * 0.5 * Math.pow((Tf % 2.3) + 0.6, 2) * 1.0);
      prop('falling_rock', 6152, -1.4, 0, 0); ents[ents.length - 1][3] = +fy.toFixed(2);
      prop('falling_rock', 6128, 2.6, 1, 0);
      prop('rock_small', 6170, hw - 0.4, 2); prop('rock', 6188, -hw + 1.2, 1);
      { const cz = z - 30; const [x, , yaw] = this.pose(cz, this.laneU(cz, true, 0)); add('cop', x, 0, cz, yaw, 0, 1); }
      { const cz = z - 45; const [x, , yaw] = this.pose(cz, this.laneU(cz, false, 0)); add('cop_suv', x, 0, cz, yaw, 0, 1); }
    }

    if (S === '6305') {
      fire('jump', 3.75, { type: 'jump' });
      { const cz = 6232; const [x, , yaw] = this.pose(cz, 1.5); add('cop', x, 0, cz, yaw + 0.5, 0, 5); }
      fire('gave', 3.0, { type: 'copsGaveUp' });
    }

    if (S === '6900') {
      prop('tumbleweed', 6930, 6, 0, 0); prop('tumbleweed', 6880, -9, 2, 0);
    }

    if (S === 'zoo') {
      const at = (kind, zz, u, state, variant = 0, y = 0, yawOff = 0) => { const [x, , yaw] = this.pose(zz, u); add(kind, x, y, zz, yaw + yawOff, variant, state); };
      // row 1 — peds: walk, panic, airborne, dazed, getting up
      at('ped', 1010, 6, 0, 0); at('ped', 1010, 3, 1, 1, 0, 0.6); at('ped', 1010, 0, 2, 2, 1.6); at('ped', 1010, -3, 3, 3); at('ped', 1010, -6, 4, 4);
      // row 2 — cops: chase, blinded, spun, wrecked, gave up
      at('cop', 1019, 8, 1); at('cop_suv', 1019, 4, 2); at('cop', 1019, 0, 3, 0, 0, 0.4); at('cop', 1019, -4, 4); at('cop_suv', 1019, -8, 5);
      // row 3 — gadgets / hazards
      at('smoke_cloud', 1032, 7, 25); at('oil_slick', 1030, 2.5, 40); at('falling_rock', 1030, -1.5, 0, 0, 9); at('tumbleweed', 1029, -4.5, 1); at('cow', 1031, -8.5, 0, 0, 0, 1.2);
      at('crossing_gate', 1026, -11, 1); at('heli', 1040, 0, 1, 0, 15);
      // smashable flying
      at('cone', 1014, -9, 1, 0, 1.2); at('hydrant', 1014, 10, 1, 0, 0.8);
      lab.fire = 0.7; lab.cooking = true; lab.ventOpen = true;
      rv.nitro = 0.8;
    }

    if (S === 'route' && this.traffic !== false) {
      // a little ambient traffic from the area's own list (kinds the protocol knows)
      const kinds = (biome.traffic || []).filter((k) => K[k] != null);
      if (kinds.length && !t.inBridgeZone(z)) {
        const spd = 11;
        for (let i = 0; i < 4; i++) {
          const fwd = i % 2 === 1;
          const base = Math.floor((z + 60) / 90) * 90 + i * 37;
          civ(kinds[(Math.floor(base / 90) + i) % kinds.length], base, fwd, i % 2 ? 1 : 0, fwd ? spd * 0.6 : spd, (i * 3) % 6);
        }
      }
    }

    if (S === 'drive') {
      // a few ambient cars around the RV wherever it is
      for (let i = 0; i < 4; i++) civ('sedan', z + 40 + i * 50, i % 2 === 0, 0, 0, i);
    }

    // ── stop / bridge / misc ─────────────────────────────────────────────
    const br = this.route.bridge;
    const bridge = { dist: br.lip - z, speedNeeded: br.minSpeedHint };
    for (const st of this.route.stops) {
      const lot = t.stopLot(st);
      if (Math.abs(z - st.z) < lot.halfLen && Math.abs(t.uAt(rv.x, z) - lot.u) < lot.halfDepth + 2) stop = { id: st.id, name: st.name, progress: 0, blocked: false };
    }
    const inv = { mat: { salts: 1, solvent: 1, fuel: 1 }, units: S === '6900' ? 7 : S === '300' ? 0 : 4, quality: S === '6900' ? 0.86 : 0.72, gadgets: { smoke: S === '300' ? 1 : 2, oil: S === '5000' ? 0 : 1, nitro: S === '6150' ? 1 : 0 } };
    if (S === '6305') rv.nitro = Tf < 4 ? 0.3 : 0;
    const copDist = ents.filter((e) => e[1] === K.cop || e[1] === K.cop_suv).reduce((m, e) => Math.min(m, Math.hypot(e[2] - rv.x, e[4] - rv.z)), 999);
    const snap = {
      t: T, phase: 'drive', countdown: 0, lostReason: null,
      rv, crew: { driver: 91, cook: 64 }, heat, bust,
      score: { points: Math.round(800 + z * 0.9), chaos: S === '300' ? 3 : 7, knocked: S === '300' ? 2 : 5, smashed: 9, copsWrecked: S === '300' ? 0 : 2 },
      inv, stop, nearStop, bridge, biome: biome.id, dist: z, routeLength: this.route.routeLength,
      feel, alert: { copClose: copDist < 9, copDist }, lab, ents, events,
    };
    if (weather) snap.weather = weather;
    // ── expansion fields ──
    snap.timeOfDay = this.hour ?? +this.hourAt(z).toFixed(3);
    if (!snap.nearStop) snap.nearStop = this.nearStopAt(z);
    else if (snap.nearStop && snap.nearStop.side == null) { const st = this.route.stops.find((s) => s.id === snap.nearStop.id); if (st) Object.assign(snap.nearStop, { side: st.side, z: st.z }); }
    snap.looted = this.looted.slice();
    snap.area = { id: biome.id, name: biome.name };
    snap.setpieces = [];
    const db = (this.route.setpieces || []).find((d) => d.type === 'drawbridge');
    if (db && z > db.from - 600 && z < db.to + 300) {
      const max = db.maxAngle || 0.55;
      const ang = this.bridgeAngle != null ? this.bridgeAngle : max * (0.5 - 0.5 * Math.cos(Tf * 0.45));
      snap.setpieces.push({ id: db.id, type: 'drawbridge', phase: ang > 0.01 ? 'rising' : 'down', t: +Tf.toFixed(2), angle: +ang.toFixed(4) });
    }
    const tp = (this.route.setpieces || []).find((d) => d.type === 'toll_plaza');
    if (tp && Math.abs(z - tp.z) < 450) {
      const lane = Math.floor(Tf / 2) % 4;
      snap.setpieces.push({ id: tp.id, type: 'toll_plaza', phase: 'open', t: +Tf.toFixed(2), gates: [0, 1, 2, 3].map((i) => (i === 3 ? (z > tp.z - 60 ? 0 : 1) : i === lane ? 0 : 1)), lanes: [-7.5, -2.5, 2.5, 7.5], gateZ: tp.z + 1.6, checkpoint: false });
    }
    const cw = (this.route.setpieces || []).find((d) => d.type === 'car_wash');
    if (cw && Math.abs(z - cw.z) < 450) snap.setpieces.push({ id: cw.id, type: 'car_wash', phase: 'idle', t: +Tf.toFixed(2), progress: 0, washing: Math.abs(z - cw.z) < 9, u: 3.5, halfWidth: 2.9, z0: cw.z - 9, z1: cw.z + 9, used: false });
    if (this.garage) {
      const door = this.door != null ? this.door : Math.min(1, Math.max(0, (Tf - 1) / 4));
      snap.phase = 'garage';
      snap.garage = { step: 3, stepId: 'door', steps: ['walk', 'grab', 'crate', 'door', 'board', 'crank'], items: { keys: 'rook', notebook: 'doc', crate: 'rv', plug: 'out', door, engine: 'off' }, prompt: { rook: null, doc: null } };
    } else snap.garage = null;
    // HUD state overrides for testing (?hud=load|blocked|bust|countdown|fumes|fire)
    const H = this.hud;
    if (H === 'load' || H === 'blocked') { const st = this.route.stops[1]; snap.stop = { id: st.id, name: st.name, progress: H === 'load' ? 0.62 : 0.3, blocked: H === 'blocked' }; snap.rv.speed = 0; }
    if (H === 'bust') { snap.bust = 0.64; snap.rv.speed = 2; }
    if (H === 'countdown') { snap.phase = 'countdown'; snap.countdown = 2.4; }
    if (H === 'fumes') { snap.lab.fumes = 0.92; snap.lab.cooking = true; }
    if (H === 'fire') { snap.lab.fire = 0.8; snap.rv.nitro = 0.7; snap.lab.cooking = true; snap.lab.ventOpen = true; }
    return snap;
  }
}
