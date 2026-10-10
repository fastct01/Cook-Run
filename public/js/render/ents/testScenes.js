// ─────────────────────────────────────────────────────────────────────────────
// Scripted snapshots for public/ents-test.html (not used by the game).
//   const sc = makeScene(name, data, track);
//   sc.snapshot(T) → Snapshot (rv, ents, setpieces, stop.roof, …)
//   sc.camera(T, snap) → { pos:[x,y,z], target:[x,y,z], fov } | null (chase cam)
// Scenes: zoo (every new kind in every state, 12 stations; ?station=i), rhino, tornado,
// steam, roof, parade, comet, west, farm, highway.
// ─────────────────────────────────────────────────────────────────────────────
import { KIND_ID } from '../../shared/protocol.js';

const TAU = Math.PI * 2;
const fract = (x) => x - Math.floor(x);

export const SCENES = ['zoo', 'rhino', 'tornado', 'steam', 'roof', 'parade', 'comet', 'west', 'farm', 'highway'];

export function makeScene(name, data, track, opts = {}) {
  const P = (z, u = 0) => ({ x: track.xAt(z, u), z });
  const hd = (z) => track.headingAt(z);
  let nextId = 1000;
  const ids = new Map();
  const id = (key) => { let v = ids.get(key); if (v === undefined) { v = nextId++; ids.set(key, v); } return v; };
  const ent = (key, kind, x, y, z, yaw, variant = 0, state = 0) => [id(key), KIND_ID[kind], x, y, z, yaw, variant, state];
  const along = (key, kind, z, u, y = 0, yawOff = 0, variant = 0, state = 0) => { const p = P(z, u); return ent(key, kind, p.x, y, p.z, hd(z) + yawOff, variant, state); };
  const rvAt = (z, u, speed = 0, extra = {}) => { const p = P(z, u); return { x: p.x, y: 0, z: p.z, yaw: hd(z), pitch: 0, roll: 0, speed, steer: 0, hp: 88, airborne: false, nitro: 0, flatTyre: false, onRoad: true, regen: false, roofDoc: false, ...extra }; };
  const base = (T, rv, ents, more = {}) => ({
    t: T, phase: 'drive', countdown: 0, rv, ents, events: [], setpieces: [], stop: null, nearStop: null,
    feel: { latAcc: 0, bump: 0, speed: rv.speed }, lab: { fumes: 0, fire: 0, ventOpen: false, curtains: false, cooking: false },
    heat: { value: 2, stars: 2 }, fx: { fog: 0, flash: 0, shock: 0 }, timeOfDay: 14, ...more,
  });
  const camSide = (z, u, h, tz, tu = 0, th = 1.5, fov = 55) => { const a = P(z, u), b = P(tz, tu); return { pos: [a.x, h, a.z], target: [b.x, th, b.z], fov }; };

  // ── zoo ──────────────────────────────────────────────────────────────────
  if (name === 'zoo') {
    const z0 = opts.z ?? 15800, SP = 46;
    const copCycle = [1, 2, 6, 7, 8, 3, 4, 5];
    const stations = [
      { label: 'cops: moto, interceptor, rhino, patrol car — states cycle 1 2 6 7 8 3 4 5', f(T, zs, out) {
        const st = copCycle[Math.floor(T / 2.5) % copCycle.length];
        const w = Math.sin(T * 0.6) * 5;
        out.push(along('m1', 'moto_cop', zs + 6 + w, 5, 0, 0, 0, st));
        out.push(along('i1', 'interceptor', zs + 2 + w, 1.7, 0, 0, 0, st));
        out.push(along('r1', 'rhino_truck', zs + 4 + w, -1.8, 0, 0, 0, st));
        out.push(along('c1', 'cop', zs + w, -5.3, 0, 0, 0, st));
      } },
      { label: 'canisters (flash: flying / armed / burst, foam) + foam patch + paint splats', f(T, zs, out) {
        const c = fract(T / 2.2), p = P(zs + 2, 4);
        out.push(ent('fb0', 'flashbang', p.x + (c - 0.5) * 8, 0.2 + Math.sin(c * Math.PI) * 4, p.z, 0, 0, 0));
        out.push(along('fb1', 'flashbang', zs + 2, 0, 0.08, 0, 0, 1));
        const b = fract(T / 3);
        if (b < 0.7) out.push(along('fb2' + Math.floor(T / 3), 'flashbang', zs + 8, -3, 0.08, 0, Math.floor(T / 3) % 2, b < 0.55 ? 1 : 2));
        out.push(along('fp', 'foam_patch', zs + 14, 2));
        for (let i = 0; i < 4; i++) out.push(along('ps' + i, 'paint_splat', zs + 18 + i * 3, -4 + i * 2.5, 0, 0, i, 0));
      } },
      { label: 'hazards: steam leak (lane, gutter), water main, downed power line', f(T, zs, out) {
        out.push(along('s0', 'steam_leak', zs, 3, 0, 0, 0));
        out.push(along('s1', 'steam_leak', zs + 12, -6, 0, 0, 1));
        out.push(along('wm', 'water_main', zs + 6, -1.5));
        out.push(along('pl', 'power_line_down', zs + 22, 1));
      } },
      { label: 'hazards: broken car, dust devil, flood wash, rolling log, runaway trolley', f(T, zs, out) {
        out.push(along('bc', 'broken_car', zs, 3.5));
        out.push(along('dd', 'dust_devil', zs + 10 + Math.sin(T * 0.4) * 3, -3 + Math.cos(T * 0.3) * 2));
        out.push(along('fw', 'flood_wash', zs + 24, 0));
        const lx = Math.sin(T * 0.5) * 5, lp = P(zs + 16, lx);
        out.push(ent('lg', 'log', lp.x, 0, lp.z, hd(zs) + Math.PI / 2, 0, 1));
        const tp = P(zs + 6 + Math.sin(T * 0.8) * 3, -1);
        out.push(ent('tr', 'trolley', tp.x, 0, tp.z, hd(zs), (Math.floor(T) % 2), 1));
      } },
      { label: 'static hazards: trench plates, open manhole, sinkhole, speed bump', f(T, zs, out) {
        out.push(along('tp', 'trench_plates', zs, 2));
        out.push(along('mh', 'manhole_open', zs + 5, -3));
        out.push(along('sk', 'sinkhole', zs + 13, 1));
        out.push(along('sb', 'speed_bump', zs + 22, 0));
      } },
      { label: 'animals: sheep ×2, goat, horse, cowboy riders', f(T, zs, out) {
        const w = (k) => Math.sin(T * 0.5 + k) * 3;
        out.push(along('sh0', 'sheep', zs + w(0), 4, 0, 0, 0, 1));
        out.push(along('sh1', 'sheep', zs + 3, 5.5, 0, 1.2, 1, 0));
        out.push(along('gt', 'goat', zs + 2 + w(1), 1.5, 0, 0, 0, 1));
        out.push(along('hs', 'horse', zs + 6 + w(2), -1.5, 0, 0, Math.floor(T / 4) % 3, 1));
        out.push(along('cb0', 'cowboy_horse', zs + 10 + w(3) * 2, -4.5, 0, 0, 0, 1));
        out.push(along('cb1', 'cowboy_horse', zs + 14, 2, 0, 0.5, 1, 0));
      } },
      { label: 'set-piece vehicles: Midnight Comet, streetcar, Kestrel car, news van', f(T, zs, out) {
        const w = Math.sin(T * 0.5) * 6;
        out.push(along('cm', 'comet_car', zs + w, 4.5));
        out.push(along('sc', 'streetcar', zs + 6 - w * 0.4, 0, 0, 0, Math.floor(T / 5) % 2));
        out.push(along('kc', 'kestrel_car', zs + w * 0.6, -4, 0, 0, Math.floor(T / 5) % 2));
        out.push(along('nv', 'news_van', zs + 16, -5));
      } },
      { label: 'car carrier, wide load house + escort', f(T, zs, out) {
        out.push(along('cc', 'car_carrier', zs + Math.sin(T * 0.4) * 3, 4.5, 0, 0, 0, 0));
        out.push(along('wl', 'wide_load', zs + 2, -1.5, 0, 0, 0));
        out.push(along('we', 'wide_load', zs + 16 + Math.sin(T * 0.5) * 2, -5.5, 0, 0, 1));
      } },
      { label: 'combine, logging truck, garbage truck, forklift', f(T, zs, out) {
        out.push(along('cmb', 'combine', zs + Math.sin(T * 0.3) * 3, 2, 0, 0, Math.floor(T / 6) % 2));
        out.push(along('lt', 'logging_truck', zs + 4, -4, 0, 0, 0));
        out.push(along('gb', 'garbage_truck', zs + 20, 4.5));
        out.push(along('fk', 'forklift', zs + 22, -2, 0, 0, 0));
      } },
      { label: 'Rattlers choppers ×5, stagecoach', f(T, zs, out) {
        for (let i = 0; i < 5; i++) { const zz = zs + i * 3.5 + Math.sin(T * 0.9 + i) * 2; const p = P(zz, -5 + i * 2.2 + Math.sin(T * 1.3 + i)); out.push(ent('ch' + i, 'chopper', p.x, 0, p.z, hd(zz) + Math.cos(T * 1.3 + i) * 0.25, i, 1)); }
        out.push(along('stc', 'stagecoach', zs + 18 + Math.sin(T * 0.6) * 4, 3, 0, 0, Math.floor(T / 5) % 2, 1));
      } },
      { label: 'parade float, marching band, inflatable gorilla', f(T, zs, out) {
        out.push(along('pf', 'parade_float', zs + 4, 3, 0, 0, Math.floor(T / 6) % 2));
        for (let i = 0; i < 3; i++) out.push(along('bm' + i, 'band_member', zs + 14, -1 + i * 1.6, 0, 0, i));
        out.push(along('gor', 'inflatable_gorilla', zs + 6, -5, 0, 0, Math.floor(T / 6) % 2));
      } },
      { label: 'people: Kestrel, Sgt Pratt, officers (STOP gesture), SWAT, Comet hero; freight wagons', f(T, zs, out) {
        const w = Math.sin(T * 0.5) * 2;
        out.push(along('ks', 'kestrel', zs + w, 5));
        out.push(along('pr', 'sgt_pratt', zs + 1, 3.5, 0, Math.PI, 0, 0));
        // officers: 0 standing with a hand up, 1 walking, 2 diving aside (state 1) on a loop
        for (let i = 0; i < 3; i++) out.push(along('co' + i, 'cop_officer', zs + 2 + i * 1.2 + (i === 1 ? w : 0), 1.5 - i * 1.3, i === 2 && fract(T / 4) < 0.4 ? Math.sin(fract(T / 4) / 0.4 * Math.PI) * 0.8 : 0, i === 0 ? Math.PI : 0, i, i === 2 ? (fract(T / 4) < 0.4 ? 1 : fract(T / 4) < 0.75 ? 3 : 4) : 0));
        out.push(along('sw', 'swat_officer', zs + 3 + w, -3));
        out.push(along('ch', 'comet_hero', zs + 4, -4.5));
        out.push(along('fw0', 'freight_wagon', zs + 14 + Math.sin(T * 0.3) * 4, -2, 0, Math.PI / 2, 0));
        out.push(along('fw1', 'freight_wagon', zs + 18, 4, 0, Math.PI / 2, 1));
      } },
    ];
    const station = opts.station;
    return {
      stations, label: (i) => stations[i]?.label,
      snapshot(T) {
        const out = [];
        stations.forEach((s, i) => s.f(T, z0 + 20 + i * SP, out));
        const rz = station == null || station < 0 ? z0 - 30 : z0 + 20 + station * SP - 28;   // chunks stream around the RV
        return base(T, rvAt(rz, 1.7), out);
      },
      camera(T) {
        if (station == null || station < 0) return camSide(z0 - 10, -10, 22, z0 + 160, 0, 0, 50);
        const zs = z0 + 20 + station * SP;
        return camSide(zs - 15, -3.5, 6.5, zs + 9, 0.5, 1.2, 58);
      },
    };
  }

  // ── rhino: armoured truck lobbing canisters back at the RV ───────────────
  if (name === 'rhino') {
    const z0 = opts.z ?? 21000, V = 22, every = data.rules.heat?.rhino?.throwEvery ?? 5.5;
    const n = track.lanesAt(z0);
    const lane = track.laneU(z0, n - 2);           // a forward lane (u > 0 = driver's right)
    const lane2 = track.laneU(z0, n - 1);
    const zr = (T) => z0 + V * T;
    const GAP = 20;
    return {
      snapshot(T) {
        const out = [];
        const rz = zr(T);
        const rv = rvAt(rz, lane, V);
        out.push(along('rh', 'rhino_truck', rz + GAP, lane + Math.sin(T * 0.5) * 0.4, 0, 0, 0, 1));
        out.push(along('mc', 'moto_cop', rz - 12, lane2 + Math.sin(T * 1.4) * 0.8, 0, Math.cos(T * 1.4) * 0.1, 0, 1));
        out.push(along('ic', 'interceptor', rz - 20, lane + Math.sin(T * 0.7) * 0.5, 0, 0, 0, 1));
        // throws: spawn at the throw point, 1 s flight, landing so the fuse runs out just ahead of the RV
        for (let i = 0; i < 40; i++) {
          const Ti = 1.6 + i * every;
          if (Ti > T) break;
          const foam = i % 2 === 1, fuse = foam ? 0.4 : 0.9, fl = 1.0;
          const ahead = V * fuse + 4;
          const u = T - Ti;
          if (u > fl + fuse + 0.3) { if (foam && u < fl + fuse + 7) out.push(along('fp' + i, 'foam_patch', zr(Ti + fl) + ahead, lane)); continue; }
          const s = P(zr(Ti) + GAP - 3.4, lane - 0.3), e = P(zr(Ti + fl) + ahead, lane + (foam ? 0.4 : -0.6));
          if (u < fl) { const k = u / fl; out.push(ent('cn' + i, 'flashbang', s.x + (e.x - s.x) * k, 2.4 + (0.1 - 2.4) * k + 6 * k * (1 - k), s.z + (e.z - s.z) * k, hd(s.z), foam ? 1 : 0, 0)); }
          else out.push(ent('cn' + i, 'flashbang', e.x, 0.08, e.z, hd(e.z), foam ? 1 : 0, u < fl + fuse ? 1 : 2));
        }
        for (let i = 0; i < 4; i++) out.push(along('tc' + i, 'sedan', zr(T) + 60 + i * 35 - ((T * 8) % 35), track.laneU(z0, n - 1) + 0.2, 0, 0, i, 0));
        return base(T, rv, out, { heat: { value: 5, stars: 5 } });
      },
      camera(T) {
        const rz = zr(T);
        if (opts.cam === 'side') return camSide(rz + GAP - 9, lane - 6.5, 3.2, rz + GAP - 2, lane, 1.8, 50);
        return camSide(rz - 6, lane - 4.5, 4.2, rz + GAP, lane, 1.6, 55);
      },
    };
  }

  // ── tornado on the salt flats, six cars orbiting it ─────────────────────
  if (name === 'tornado') {
    const z0 = opts.z ?? 36300;
    const cars = ['sedan', 'hatch', 'van', 'pickup', 'cop', 'rival'];
    return {
      snapshot(T) {
        const c = P(z0 + 40, -62 + T * 1.6);
        const tx = c.x + Math.sin(T * 0.3) * 3, tz = c.z + Math.cos(T * 0.23) * 3;
        const out = [ent('tor', 'tornado', tx, 0, tz, 0, 0, 1)];
        cars.forEach((k, i) => {
          const r = 13 + i * 3.6, w = 1.25 * Math.sqrt(16 / r);
          const a = i * 1.7 + T * w;
          const h = 8 + i * 6 + Math.sin(T * 0.7 + i * 2) * 4;
          out.push(ent('car' + i, k, tx + Math.cos(a) * r, h, tz + Math.sin(a) * r, -a, i % 4, k === 'cop' ? 1 : 0));
        });
        // one car flung out, landing and bouncing on the flats
        const f = fract(T / 5), a0 = 0.9;
        const fx = tx + Math.cos(a0) * (20 + f * 45), fz = tz + Math.sin(a0) * (20 + f * 45);
        out.push(ent('fl', 'hatch', fx, Math.max(0, 30 * (1 - f * 1.4) + 18 * f * (1 - f)), fz, f * 9, 2, 0));
        out.push(along('pk', 'pickup', z0 - 26, 6, 0, 0.3, 1, 1));
        return base(T, rvAt(z0 - 40, 1.8, 0), out, { setpieces: [{ id: 'tornado', type: 'tornado', phase: T < 0.5 ? 'idle' : 'active', t: T, x: tx, z: tz, radius: 9, height: 70, spin: 2.4, intensity: Math.min(1, Math.max(0, (T - 0.5) / 2)) }] });
      },
      camera(T) {
        if (opts.cam === 'close') return camSide(z0 + 2, -22, 5, z0 + 40, -62 + T * 1.6, 22, 64);
        const p = P(z0 - 62, 7), t = P(z0 + 40, -58 + T * 1.6);
        return { pos: [p.x, 7, p.z], target: [t.x, 30, t.z], fov: 64 };
      },
    };
  }

  // ── steam: the city hazards on one street ───────────────────────────────
  if (name === 'steam') {
    const z0 = opts.z ?? 3600;
    return {
      snapshot(T) {
        const out = [];
        out.push(along('s0', 'steam_leak', z0, 1.8, 0, 0, 0));
        out.push(along('s1', 'steam_leak', z0 + 16, -6.2, 0, 0, 1));
        out.push(along('wm', 'water_main', z0 + 30, 2.5));
        out.push(along('pl', 'power_line_down', z0 + 46, -0.5));
        out.push(along('bc', 'broken_car', z0 + 60, -3.6));
        out.push(along('mh', 'manhole_open', z0 + 8, -2.8));
        out.push(along('sb', 'speed_bump', z0 + 70, 2));
        out.push(along('tp', 'trench_plates', z0 + 76, -2));
        const tp = P(z0 + 22 + Math.sin(T * 0.7) * 3, Math.sin(T * 0.9) * 3);
        out.push(ent('tr', 'trolley', tp.x, 0, tp.z, hd(z0) + Math.PI / 2 + Math.sin(T) * 0.3, 1, 1));
        out.push(along('ck', 'cone', z0 + 2, 4.2)); out.push(along('ck2', 'cone', z0 - 2, 3.2));
        out.push(along('cw', 'sedan', z0 + 90 - ((T * 9) % 60), -5.3, 0, Math.PI, 3, 0));
        return base(T, rvAt(z0 - 22, 1.8, 0), out);
      },
      camera() { return camSide(z0 - 13, -4.5, 3.6, z0 + 22, 1, 3.2, 62); },
    };
  }

  // ── roof: Doc hosing a cop at a supply stop (snap.stop.roof as sim/roof.js state() makes it) ──
  if (name === 'roof') {
    const z0 = opts.z ?? 5050;
    const toW = (rv, lx, lz) => { const c = Math.cos(rv.yaw), s = Math.sin(rv.yaw); return { x: rv.x + lx * c + lz * s, z: rv.z - lx * s + lz * c }; };
    return {
      snapshot(T) {
        const climb = Math.max(0, Math.min(1, (T - 0.2) / 1.6));
        const rv = rvAt(z0, 3, 0, { roofDoc: climb > 0.5 });
        const cop = P(z0 - 13, -2.5), cop2 = P(z0 - 20, 4.5), cop3 = P(z0 + 16, -4);
        const out = [
          ent('c1', 'cop', cop.x, 0, cop.z, hd(z0) + 0.35, 0, T > 2.2 ? 6 : 1),
          ent('c2', 'cop_suv', cop2.x, 0, cop2.z, hd(z0), 0, 8),
          ent('c3', 'interceptor', cop3.x, 0, cop3.z, hd(z0) + Math.PI - 0.4, 0, 7),
          along('ps', 'paint_splat', z0 - 19, 4.8, 0, 0, 0),
        ];
        // aimAt(): from the nozzle pivot (0, 4.2, −1.8) RV-local at the cop's body (y 0.9)
        const n = toW(rv, 0, -1.8), dx = cop.x - n.x, dz = cop.z - n.z;
        const aimYaw = Math.atan2(dx, dz) - rv.yaw + Math.sin(T * 1.7) * 0.05;
        const aimPitch = Math.atan2(0.9 - 4.2, Math.hypot(dx, dz)) + Math.sin(T * 1.3) * 0.02;
        // thrown devices: a balloon in flight, a landed balloon splat, firecrackers popping, a flare burning
        const fx = [];
        const fl = (id, device, x0z0, xz, t, T2) => fx.push({ id, device, phase: 'fly', x0: x0z0.x, z0: x0z0.z, x: xz.x, z: xz.z, t, T: T2 });
        const land = (id, device, xz, t, T2) => fx.push({ id, device, phase: 'land', x0: xz.x, z0: xz.z, x: xz.x, z: xz.z, t, T: T2 });
        const hand = toW(rv, 0, -1.8);
        const bt = (T % 4) / 1.0;
        if (bt < 1) fl(11, 'balloon', hand, P(z0 - 9, 6), bt * 0.8, 0.8);
        land(12, 'balloon', P(z0 - 6, 0.5), Math.min(5.9, T), 6);
        if (T > 0.5) land(13, 'firecracker', P(z0 + 9, 1), (T - 0.5) % 1.8, 1.8);
        land(14, 'flare', P(z0 + 4, 6.5), Math.min(5.5, T), 6);
        return base(T, rv, out, { stop: { id: 'test', name: 'Test Stop', shopType: 'collect', state: 'shopping', progress: 0.3, blocked: false, copDist: 13,
          roof: { active: true, climbing: climb < 1, climbDir: climb < 1 ? 'up' : null, climb, onRoof: climb >= 1, aimYaw, aimPitch, spray: climb >= 1 && T > 2 && fract(T / 5) < 0.85, ammo: { firecracker: 2, balloon: 3, flare: 1 }, ai: false, fx } } });
      },
      camera() { return camSide(z0 + 6, 13, 9, z0 - 5, 0, 2.6, 52); },
    };
  }

  // ── parade on Old Town's main street ────────────────────────────────────
  if (name === 'parade') {
    const z0 = opts.z ?? 10000;
    return {
      snapshot(T) {
        const zz = z0 + T * 1.4;
        const out = [along('pf', 'parade_float', zz, 0, 0, 0, 0, 0), along('pf2', 'parade_float', zz - 24, 0, 0, 0, 1, 0)];
        for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) out.push(along('bm' + r + i, 'band_member', zz + 10 + r * 1.8, -2.4 + i * 1.6, 0, 0, (r + i) % 3));
        out.push(along('of1', 'cop_officer', zz + 18, 5.5, 0, Math.PI, 0, 0));
        out.push(along('of2', 'cop_officer', z0 + 4, -6, 0, Math.PI / 2, 1, 0));
        out.push(along('pr', 'sgt_pratt', z0 + 8, -6.3, 0, Math.PI / 2, 0, 0));
        for (let i = 0; i < 8; i++) out.push(along('pd' + i, 'ped', z0 - 8 + i * 4, i % 2 ? 7 : -7.5, 0, i % 2 ? -Math.PI / 2 : Math.PI / 2, i % 6, 0));
        return base(T, rvAt(z0 - 50, 1.8, 0), out, { setpieces: [{ id: 'parade', type: 'parade', phase: T < 0.3 ? 'idle' : 'active', t: T, x: P(zz, 0).x, z: zz }] });
      },
      camera(T) { const zz = z0 + T * 1.4; return camSide(zz - 14, -9, 7, zz + 8, 0, 2.6, 60); },
    };
  }

  // ── the Midnight Comet pulling 6 cop cars through downtown ──────────────
  if (name === 'comet') {
    const z0 = opts.z ?? 5600;
    return {
      snapshot(T) {
        const zc = z0 - 40 + T * 24;
        const out = [along('cm', 'comet_car', zc, -1.7 + Math.sin(T * 0.8) * 1.2, 0, Math.cos(T * 0.8) * 0.06)];
        for (let i = 0; i < 6; i++) out.push(along('cp' + i, i % 3 === 2 ? 'cop_suv' : 'cop', zc - 11 - i * 9, (i % 2 ? 1.7 : -1.7) + Math.sin(T + i) * 0.8, 0, 0, 0, 1));
        out.push(along('hero', 'comet_hero', z0 + 30, 7.5, 0, -Math.PI / 2));
        return base(T, rvAt(z0 - 90, 1.8, 0), out, { setpieces: [{ id: 'comet', type: 'midnight_comet', phase: 'active', t: T }] });
      },
      camera(T) { const zc = z0 - 40 + T * 24; return camSide(zc + 9, 8.5, 2.6, zc - 12, 0, 1.2, 62); },
    };
  }

  // ── west: ghost-town stagecoach + cattle-drive cowboys + horses ─────────
  if (name === 'west') {
    const z0 = opts.z ?? 37200;
    return {
      snapshot(T) {
        const out = [];
        const sx = -14 + ((T * 7) % 32);
        const sp = P(z0 + 8, sx);
        out.push(ent('stc', 'stagecoach', sp.x, 0, sp.z, hd(z0) - Math.PI / 2, 0, 1));
        for (let i = 0; i < 3; i++) { const p = P(z0 + 18 + i * 5, -12 + ((T * 5 + i * 7) % 26)); out.push(ent('cb' + i, 'cowboy_horse', p.x, 0, p.z, hd(z0) - Math.PI / 2, i % 2, 1)); }
        for (let i = 0; i < 6; i++) { const p = P(z0 + 26 + (i % 3) * 3, -10 + ((T * 3 + i * 4) % 22)); out.push(ent('cw' + i, 'cow', p.x, 0, p.z, hd(z0) - Math.PI / 2, 0, 1)); }
        out.push(along('hs', 'horse', z0 + 2, 7, 0, 0.6, 2, 0));
        for (let i = 0; i < 3; i++) out.push(along('sh' + i, 'sheep', z0 - 2 + i * 1.6, -7 + i * 0.8, 0, 1.2 + i, i % 2, 0));
        return base(T, rvAt(z0 - 30, 1.8, 0), out, { setpieces: [{ id: 'stagecoach', type: 'stagecoach', phase: T < 0.3 ? 'idle' : 'bolt', t: T }] });
      },
      camera() { return camSide(z0 - 8, 9, 5.5, z0 + 14, -2, 1.5, 60); },
    };
  }

  // ── farm: combine, logging truck spilling logs, sheep on the road ───────
  if (name === 'farm') {
    const z0 = opts.z ?? 31200;
    return {
      snapshot(T) {
        const out = [along('cmb', 'combine', z0 + 10 + T * 2.5, 0, 0, 0, 0)];
        const lt = z0 + 40;
        out.push(along('lt', 'logging_truck', lt, -2, 0, 0.25, 0, 1));
        for (let i = 0; i < 3; i++) {
          const t0 = 1 + i * 1.2;
          if (T < t0) continue;
          const u = (T - t0);
          out.push(along('lg' + i, 'log', lt - 2 + i * 0.6, -2 - 1.5 - u * 3.5, Math.max(0, 1.7 - u * 2.2), Math.PI / 2, 0, 1));
        }
        for (let i = 0; i < 5; i++) out.push(along('sh' + i, 'sheep', z0 + 22 + i * 1.8, 4 - ((T * 1.2 + i) % 9), 0, -Math.PI / 2, i % 2, 1));
        out.push(along('gt', 'goat', z0 + 30, 6, 0, 2, 0, 0));
        return base(T, rvAt(z0 - 12, 1.8, 0), out, { setpieces: [{ id: 'logs', type: 'log_spill', phase: T < 1 ? 'idle' : 'spill', t: T }] });
      },
      camera() { return camSide(z0 + 2, -9, 7, z0 + 30, 0, 2, 60); },
    };
  }

  // ── highway: car carrier shedding cars, wide load, Rattlers ─────────────
  if (name === 'highway') {
    const z0 = opts.z ?? 21500, V = 14;
    const nl = track.lanesAt(z0), L1 = track.laneU(z0, nl - 2), L2 = track.laneU(z0, nl - 1);
    return {
      snapshot(T) {
        const cz = z0 + T * V;
        const out = [along('cc', 'car_carrier', cz, L1, 0, 0, 0, 0)];
        // a car comes off the back every 2.2 s and tumbles onto the road
        const ORDER = [0, 3, 1, 4, 2, 5], CZ = [-6.55, -2.75, 1.05], CY = [2.89, 1.24];
        for (let i = 0; i < 6; i++) {
          const t0 = 0.8 + i * 2.2;
          if (T < t0) continue;
          const u = T - t0, k = ORDER[i];
          const sz = z0 + t0 * V + CZ[k % 3];
          const deck = CY[k < 3 ? 0 : 1];
          const y = Math.max(0, deck + 1.2 * u - 4.9 * u * u);
          const zz = sz + V * 0.55 * Math.min(u, 1.2);
          out.push(along('drop' + i, ['sedan', 'hatch', 'van', 'pickup', 'sedan', 'hatch'][i], zz, L1 + (i % 2 ? 1 : -1) * Math.min(1.8, u * 1.5), y, Math.min(u, 1) * 2.2 * (i % 2 ? 1 : -1), i % 4, y > 0 ? 0 : 1));
        }
        out.push(along('wl', 'wide_load', cz + 40, L2 + 0.6, 0, 0, 0));
        out.push(along('we', 'wide_load', cz + 25, L2, 0, 0, 1));
        for (let i = 0; i < 4; i++) out.push(along('rt' + i, 'chopper', cz - 18 - i * 4, L2 - (i % 2) * 2 + Math.sin(T * 1.5 + i) * 0.6, 0, Math.cos(T * 1.5 + i) * 0.2, i, 1));
        return base(T, rvAt(cz - 32, L1, V), out, { setpieces: [{ id: 'carrier', type: 'car_carrier', phase: 'shed', t: T, ramp: T > 9 ? Math.min(1, (T - 9) / 2) : 0 }] });
      },
      camera(T) { const cz = z0 + T * V; return camSide(cz - 26, L1 - 7, 7, cz + 2, L1, 2, 58); },
    };
  }
  return null;
}
