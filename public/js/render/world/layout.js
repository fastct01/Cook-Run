// ─────────────────────────────────────────────────────────────────────────────
// Scenery layout (VIEW-WORLD-A): deterministic placements for the 13 areas.
// Each biome is generated once (lazily, seeded by route seed + biome index) into a
// z-sorted list of items; chunks bake the items whose z falls inside them. Both
// players get the same world. Items never overlap (rect occupancy grid) and keep
// clear of RoadInfo reservations (stops, structures, side streets, bridges).
//
// item: { kind, v, u, z, yaw, s, sy, tint, batch:'near'|'far', y?, sink?, tileY? }
//       or a ground decal { decal:'lot'|'plaza'|'yard', side, u0, u1, z0, z1 }
// Facing rules (ART): roadside fronts face local +Z → faceRoad(z, s) = s·π/2 + heading.
// ─────────────────────────────────────────────────────────────────────────────
import { Rng, hashSeed } from '../../sim/rng.js';

const HALF_PI = Math.PI / 2;
const sstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Layout {
  constructor(info, protos, seed) {
    this.info = info; this.protos = protos; this.seed = seed | 0;
    this.track = info.track;
    this.cache = new Map();
    this.landmarks = planLandmarks(info);
  }
  itemsIn(z0, z1) {
    const out = [];
    const bs = this.info.biomes;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b.to + 400 < z0 || b.from - 400 > z1) continue;
      for (const it of this._biome(i)) if (it.z >= z0 && it.z < z1) out.push(it);
    }
    return out;
  }
  _biome(i) {
    let list = this.cache.get(i);
    if (list) return list;
    const g = new Gen(this, i);
    const fn = GEN[this.info.biomes[i].id] || GEN.generic;
    try { fn(g); } catch (e) { console.error('[world] layout', this.info.biomes[i].id, e); }
    for (const lm of this.landmarks) if (lm.biome === i) g.landmark(lm);
    list = g.items.sort((a, b) => a.z - b.z);
    this.cache.set(i, list);
    return list;
  }
}

// ── fixed landmarks (one-offs) decided up front so the road builder can paint plazas ──
function planLandmarks(info) {
  const out = [];
  const t = info.track;
  const bi = (id) => info.biomes.findIndex((b) => b.id === id);
  const add = (id, o) => { const i = bi(id); if (i >= 0) out.push({ biome: i, ...o }); };
  add('oldtown', { kind: 'clock_tower', z: 8640, side: 1, plaza: { w: 46, d: 34 }, back: 6 });
  add('downtown', { kind: 'police_station', z: 3420, side: -1, back: 0.6 });
  add('downtown', { kind: 'cinema', z: 4300, side: -1, back: 0.6 });
  add('downtown', { kind: 'hotel', z: 5260, side: 1, back: 0.6 });
  add('downtown', { kind: 'fire_station', z: 6060, side: -1, back: 0.6 });
  add('downtown', { kind: 'cinema', z: 7140, side: 1, back: 0.6 });
  add('docks', { kind: 'lighthouse', z: 11330, side: -1, water: 52 });
  add('docks', { kind: 'cargo_ship', z: 11820, side: -1, water: 14, yaw: 0 });
  add('docks', { kind: 'cargo_ship', z: 13760, side: -1, water: 14, yaw: Math.PI });
  add('suburbs', { kind: 'church', z: 14560, side: 1, back: 6 });
  add('suburbs', { kind: 'church', z: 17890, side: 1, back: 6 });
  add('farmland', { kind: 'grain_elevator', z: 29980, side: 1, back: 8 });
  add('farmland', { kind: 'grain_elevator', z: 31620, side: -1, back: 40, far: true });
  add('foothills', { kind: 'sawmill', z: 32420, side: -1, back: 4 });
  add('foothills', { kind: 'lookout_tower', z: 33160, side: 1, back: 24 });
  add('foothills', { kind: 'log_cabin', z: 34560, side: -1, back: 6 });
  add('foothills', { kind: 'log_cabin', z: 32930, side: 1, back: 9 });
  add('saltflats', { kind: 'motel_ruin', z: 35420, side: -1, back: 3 });
  add('saltflats', { kind: 'weather_balloon', z: 35860, side: 1, back: 26, yaw: 0.7 });
  add('saltflats', { kind: 'plane_wreck', z: 36640, side: -1, back: 30, yaw: 2.1 });
  for (const lm of out) {
    const z = lm.z;
    if (lm.plaza) {
      const C = info.corridor(z);
      info.res.push({ z0: z - lm.plaza.w / 2, z1: z + lm.plaza.w / 2, side: lm.side, u0: 0, u1: C + lm.plaza.d + 2, tag: 'plaza' });
      lm.plazaRect = { side: lm.side, u0: C - 0.1, u1: C + lm.plaza.d, z0: z - lm.plaza.w / 2, z1: z + lm.plaza.w / 2 };
    }
  }
  void t;
  return out;
}

class Gen {
  constructor(L, bi) {
    this.L = L; this.info = L.info; this.t = L.track; this.protos = L.protos;
    this.bi = bi; this.b = this.info.biomes[bi];
    this.rng = new Rng(hashSeed(L.seed, bi, 0x5ce7e));
    this.items = [];
    this.occ = new Map();   // 10 m z-bucket → rects {s, a0, a1, z0, z1} (a = |u|)
    this.from = this.b.from; this.to = this.b.to;
  }
  C(z) { return this.info.corridor(z); }
  edge(z) { return this.t.halfWidth(z) + this.t.shoulder(z); }
  size(kind, v = 0) { return this.protos.get(kind, v).size; }
  face(z, s) { return s * HALF_PI + this.t.headingAt(z); }
  /** border thinning: 1 inside the biome, → 0 over `m` metres at each end */
  wz(z, m = 50) { return sstep(this.from, this.from + m, z) * (1 - sstep(this.to - m, this.to, z)); }
  _bucket(z) { return Math.floor(z / 10); }
  hit(s, a0, a1, z0, z1) {
    for (let k = this._bucket(z0) - 1; k <= this._bucket(z1) + 1; k++) {
      const l = this.occ.get(k); if (!l) continue;
      for (const r of l) if ((r.s === 0 || s === 0 || r.s === s) && a1 > r.a0 && a0 < r.a1 && z1 > r.z0 && z0 < r.z1) return true;
    }
    return false;
  }
  occupy(s, a0, a1, z0, z1) {
    const r = { s, a0, a1, z0, z1 };
    for (let k = this._bucket(z0); k <= this._bucket(z1); k++) { let l = this.occ.get(k); if (!l) this.occ.set(k, (l = [])); l.push(r); }
  }
  resHit(s, a0, a1, z0, z1, ignore = null) {
    for (const q of this.info.res) {
      if (q.tag === ignore) continue;
      if (q.side !== 0 && q.side !== s) continue;
      if (z1 > q.z0 && z0 < q.z1 && a1 > q.u0 && a0 < q.u1) return true;
    }
    const br = this.info.bridge;
    if (br && z1 > br.rampStart - 30 && z0 < br.landingEnd + 30 && a0 < 40) return true;
    if (br && z1 > br.gapStart - 4 && z0 < br.gapEnd + 4) return true;
    return false;
  }
  /** free footprint? a0..a1 = |u| range, z0..z1 */
  free(s, a0, a1, z0, z1, { road = true, occ = true, res = true } = {}) {
    if (road && a0 < this.C((z0 + z1) / 2) + 0.2) return false;
    if (res && this.resHit(s, a0, a1, z0, z1)) return false;
    if (occ && this.hit(s, a0, a1, z0, z1)) return false;
    return true;
  }
  put(it, rect = true) {
    if (it.z < this.from - 200 || it.z > this.to + 200) return null;
    it.tint ??= 0; it.s ??= 1; it.sy ??= 1; it.batch ??= 'near';
    this.items.push(it);
    if (rect) {
      const p = this.protos.get(it.kind, it.v);
      const ww = (it.ax ?? p.size.w) * it.s, ll = (it.az ?? p.size.l) * it.s;
      const a = Math.abs(it.u), s = it.u >= 0 ? 1 : -1;
      if (it.along) this.occupy(s, a - ll / 2, a + ll / 2, it.z - ww / 2, it.z + ww / 2);
      else { const r = Math.max(ww, ll) / 2 * 0.85; this.occupy(s, a - r, a + r, it.z - r, it.z + r); }
    }
    return it;
  }

  // ── rule helpers ────────────────────────────────────────────────────────
  /** continuous frontage facing the road. kinds: [[kind, variant|null, weight]] */
  row({ side, kinds, setback = 0.5, at = null, gap = [0.5, 3], z0 = this.from, z1 = this.to, sy = [1, 1], tint = 0.08, skip = 0, thin = 50, away = false, batch = 'near', align = 'front', minDepth = 0 }) {
    const rng = this.rng;
    let z = z0 + rng.float(0, 6);
    let guard = 0;
    while (z < z1 && guard++ < 800) {
      const [kind, v0] = pickW(rng, kinds);
      const nv = this.protos.get(kind, 0).ud.variants;
      const v = v0 ?? rng.int(0, 7);
      const p = this.protos.get(kind, v);
      const w = p.size.w, l = Math.max(minDepth, p.size.l);
      const zc = z + w / 2;
      if (zc + w / 2 > z1) break;
      const C = at != null ? at : this.C(zc);
      const a = align === 'front' ? C + setback + l / 2 : C + setback;
      const ok = !(skip && rng.chance(skip)) && rng.chance(this.wz(zc, thin)) && this.free(side, a - l / 2, a + l / 2, zc - w / 2, zc + w / 2, { road: at == null });
      if (ok) {
        this.put({ kind, v, u: side * a, z: zc, yaw: this.face(zc, side) + (away ? Math.PI : 0), sy: rng.float(sy[0], sy[1]), tint, batch, along: true });
        z += w + rng.float(gap[0], gap[1]);
      } else z += Math.max(4, w * 0.35);
      void nv;
    }
  }
  /** fixed spacing along the road at offset off (from the road edge if `fromEdge`, else from the corridor) */
  regular({ kind, v = 0, every, phase = 0, off, sides = [1, -1], fromEdge = false, sidewalk = false, centre = false, yaw = 'face', z0 = this.from, z1 = this.to, thin = 30, along = false, check = true, sy = 1, batch = 'near', s = 1 }) {
    for (const side of sides) {
      const ph = phase + (side < 0 ? every / 2 : 0);
      for (let k = Math.ceil((z0 - ph) / every); ; k++) {
        const z = k * every + ph;
        if (z >= z1) break;
        if (z < z0) continue;
        if (!this.rng.chance(this.wz(z, thin))) continue;
        const sw = this.info.sidewalk(z);
        const base = centre ? 0 : sidewalk ? (sw > 0.5 ? this.edge(z) + 0.2 : this.C(z)) : fromEdge ? this.edge(z) : this.C(z);
        const a = base + off;
        if (centre) {
          if (this.resHit(1, 0, 12, z - 1, z + 1) || this.resHit(-1, 0, 12, z - 1, z + 1)) continue;
          const y0 = yaw === 'road' ? this.t.headingAt(z) : yaw;
          this.put({ kind, v, u: 0, z, yaw: y0, sy, batch, s }, false);
          continue;
        }
        const p = this.protos.get(kind, v);
        const r = Math.max(0.4, Math.min(p.size.w, p.size.l) / 2);
        const ww = along ? p.size.w / 2 : yaw === 'road' ? p.size.l / 2 : r;
        if (check && !this.free(side, a - r, a + r, z - ww, z + ww, { road: false })) continue;
        if (!check && this.resHit(side, a - r, a + r, z - ww, z + ww)) continue;
        const y = yaw === 'face' ? this.face(z, side) : yaw === 'road' ? this.t.headingAt(z) : yaw === 'back' ? Math.PI + this.t.headingAt(z) : yaw;
        this.put({ kind, v, u: side * a, z, yaw: y, along, sy, batch, s });
      }
    }
  }
  /** random scatter, `per` items per 100 m per side, lateral offset range [a, b] beyond the corridor */
  scatter({ kind, v = null, per, a, b, sides = [1, -1], scale = [1, 1], tint = 0.1, face = false, z0 = this.from, z1 = this.to, batch = null, bias = 1.3, thin = 60, onTile = false, yawFn = null, sink = 0.05, r = null, sidewalk = false }) {
    const rng = this.rng;
    const len = Math.max(0, z1 - z0);
    for (const side of sides) {
      const n = Math.floor(per * len / 100);
      for (let i = 0; i < n; i++) {
        for (let tries = 0; tries < 3; tries++) {
          const z = rng.float(z0, z1);
          const vv = v ?? rng.int(0, 7);
          const sc = rng.float(scale[0], scale[1]);
          const p = this.protos.get(kind, vv);
          const rad = (r ?? Math.max(p.size.w, p.size.l) * 0.5) * sc;
          const aa = this.C(z) + a + (b - a) * Math.pow(rng.next(), bias) + rad;
          if (!rng.chance(this.wz(z, thin))) break;
          if (sidewalk && (this.info.sidewalk(z) < 0.5 || aa - rad < this.edge(z) + 0.4)) continue;
          if (!this.free(side, aa - rad, aa + rad, z - rad, z + rad, { road: !sidewalk })) continue;
          const yaw = yawFn ? yawFn(z, side) : face ? this.face(z, side) : rng.float(0, Math.PI * 2);
          const bt = batch || (aa > 75 || p.size.h * sc > 25 && aa > 40 ? 'far' : 'near');
          this.put({ kind, v: vv, u: side * aa, z, yaw, s: sc, tint, batch: bt, onTile, sink });
          break;
        }
      }
    }
  }
  landmark(lm) {
    const t = this.t, z = lm.z, s = lm.side;
    const p = this.protos.get(lm.kind, lm.v || 0);
    if (lm.water != null) {
      const sea = this.info.seaU(z);
      if (sea > 1e4) return;
      const a = sea + lm.water + p.size.w / 2;
      const draft = p.ud.draft ?? 0;
      const y = lm.kind === 'lighthouse' ? SEA_Y_LM : SEA_Y_LM - draft;
      this.put({ kind: lm.kind, v: lm.v || 0, u: s * a, z, yaw: (lm.yaw ?? 0) + t.headingAt(z), y, batch: 'far', ax: p.size.w, az: p.size.l, along: false }, false);
      return;
    }
    const C = this.C(z);
    if (lm.plazaRect) this.items.push({ decal: 'plaza', ...lm.plazaRect, z });
    const a = C + (lm.back ?? 1) + p.size.l / 2;
    const yaw = lm.yaw != null ? lm.yaw : this.face(z, s);
    const it = { kind: lm.kind, v: lm.v || 0, u: s * a, z, yaw, batch: lm.far ? 'far' : 'near', along: lm.yaw == null };
    // landmarks win: drop anything already placed under them
    const ww = p.size.w, ll = p.size.l;
    const a0 = a - ll / 2 - 1, a1 = a + ll / 2 + 1, zz0 = z - ww / 2 - 1, zz1 = z + ww / 2 + 1;
    this.items = this.items.filter((o) => {
      if (o.decal || (o.u >= 0 ? 1 : -1) !== s) return true;
      const q = this.protos.get(o.kind, o.v), r = Math.max(q.size.w, q.size.l) * 0.5 * (o.s || 1);
      const oa = Math.abs(o.u);
      return !(oa + r > a0 && oa - r < a1 && o.z + r > zz0 && o.z - r < zz1);
    });
    this.put(it);
  }
}
const SEA_Y_LM = -3.2;

function pickW(rng, kinds) {
  let tot = 0; for (const k of kinds) tot += k[2] ?? 1;
  let h = rng.next() * tot;
  for (const k of kinds) { h -= k[2] ?? 1; if (h <= 0) return k; }
  return kinds[kinds.length - 1];
}

// traffic lights on the approach corners of every side street in the biome (arms over the road)
function junctionLights(g) {
  const t = g.t;
  for (const it of g.info.intersections) {
    if (it.z < g.from || it.z >= g.to) continue;
    for (const s of [1, -1]) {
      const z = it.z - s * (it.W / 2 + 1.0);
      const a = g.edge(z) + 0.9;
      const yaw = s > 0 ? HALF_PI + t.headingAt(z) : -HALF_PI + t.headingAt(z);
      g.put({ kind: 'trafficlight', v: 0, u: s * a, z, yaw }, false);
    }
  }
}

// ── per-area generators ─────────────────────────────────────────────────────
const GEN = {
  generic(g) {
    const list = g.b.scenery || [];
    for (const k of list) g.scatter({ kind: k, per: 1, a: 4, b: 60 });
  },

  ironworks(g) {
    // fence line behind the sidewalk, factories / warehouses facing the road on the right,
    // rail yard (tracks along the road, gantry cranes, containers) on the left
    for (const s of [1, -1]) g.regular({ kind: 'chainlink_fence', v: s > 0 ? 1 : 0, every: 10.4, phase: 2, off: 0.9, sides: [s], along: true, z0: g.from + 120 });
    g.row({ side: 1, kinds: [['factory', null, 3], ['warehouse', null, 4], ['water_tower_city', 0, 0.8], ['rail_shed', 0, 0.6]], setback: 3.5, gap: [2, 9], z0: g.from + 90, sy: [1, 1], tint: 0.06 });
    g.row({ side: 1, kinds: [['factory', null, 2], ['warehouse', null, 3]], setback: 48, align: 'front', gap: [4, 16], batch: 'far', tint: 0.08 });
    // left: rail yard
    const C = (z) => g.C(z);
    for (const off of [7.5, 12.5]) g.regular({ kind: 'rail_track', every: 20, phase: 0, off, sides: [-1], yaw: 'road', z0: g.from + 140, check: false, thin: 10 });
    g.regular({ kind: 'overhead_crane', every: 340, phase: 220, off: 10, sides: [-1], yaw: 'road', z0: g.from + 140, check: false });
    g.row({ side: -1, kinds: [['container_stack', null, 3], ['warehouse', null, 2], ['water_tower_city', 0, 0.6]], setback: 21, gap: [3, 14], z0: g.from + 100, tint: 0.08 });
    g.row({ side: -1, kinds: [['factory', null, 2], ['warehouse', null, 2]], setback: 52, gap: [4, 20], batch: 'far', tint: 0.08 });
    g.regular({ kind: 'streetlight', every: 34, phase: 6, off: 0.5, sidewalk: true, sides: [1, -1], check: true });
    junctionLights(g);
    g.scatter({ kind: 'factory', per: 0.25, a: 95, b: 220, batch: 'far', tint: 0.08 });
    void C;
  },

  downtown(g) {
    const front = [['building', null, 7], ['skyscraper', null, 1.6], ['hotel', 0, 0.35]];
    for (const s of [1, -1]) {
      g.row({ side: s, kinds: front, setback: 0.4, gap: [0.2, 1.4], sy: [1, 1.25], tint: 0.1 });
      g.row({ side: s, kinds: [['skyscraper', null, 3], ['building', null, 2]], setback: 36, align: 'front', gap: [1, 6], sy: [1.0, 1.35], tint: 0.08, batch: 'far' });
      g.row({ side: s, kinds: [['skyscraper', null, 1]], setback: 72, gap: [4, 22], sy: [0.9, 1.4], tint: 0.06, batch: 'far' });
    }
    g.regular({ kind: 'streetlight', every: 30, phase: 4, off: 0.5, sidewalk: true });
    g.regular({ kind: 'tree_city', v: null ?? 0, every: 30, phase: 19, off: 1.7, sidewalk: true });
    g.scatter({ kind: 'bench', per: 0.5, a: -2.4, b: -1.4, face: true, tint: 0, bias: 1, sidewalk: true, r: 0.9 });
    junctionLights(g);
  },

  oldtown(g) {
    for (const s of [1, -1]) {
      g.row({ side: s, kinds: [['loft', null, 8], ['diner', 0, 0.7]], setback: 0.3, gap: [0.1, 1.2], sy: [1, 1.08], tint: 0.07 });
      g.row({ side: s, kinds: [['loft', null, 1]], setback: 22, gap: [0.5, 4], sy: [1.05, 1.5], tint: 0.07, batch: 'far' });
      g.row({ side: s, kinds: [['loft', null, 1]], setback: 46, gap: [2, 10], sy: [1.2, 1.8], tint: 0.07, batch: 'far' });
    }
    // bunting across the street and streetcar stops on the tram side
    g.regular({ kind: 'bunting', every: 46, phase: 30, off: 0, sides: [1], centre: true, yaw: 'road', thin: 60 });
    g.regular({ kind: 'streetcar_stop', every: 520, phase: 260, off: -1.75, sidewalk: false, sides: [1], check: true });
    g.regular({ kind: 'streetlight', every: 28, phase: 9, off: 0.45, sidewalk: true });
    g.regular({ kind: 'tree_city', every: 56, phase: 33, off: 1.6, sidewalk: true });
    // market stalls along the sidewalks (dense near the market stop and the clock square)
    const hot = [9500, 8640];
    for (const s of [1, -1]) {
      for (let z = g.from + 30; z < g.to - 30; z += 5.2) {
        const near = hot.some((h) => Math.abs(z - h) < 140);
        if (!g.rng.chance(near ? 0.55 : 0.07)) continue;
        const a = g.edge(z) + 0.2 + 1.7;
        const v = g.rng.int(0, 3);
        if (!g.free(s, a - 1.6, a + 1.6, z - 2.1, z + 2.1, { road: false })) continue;
        g.put({ kind: 'market_stall', v, u: s * a, z, yaw: g.face(z, s), along: true, tint: 0.05 });
      }
    }
    g.scatter({ kind: 'bench', per: 0.4, a: -2.4, b: -1.6, face: true, tint: 0, bias: 1, sidewalk: true, r: 0.9 });
    junctionLights(g);
  },

  docks(g) {
    const t = g.t;
    // land side (+1): fence, bonded warehouses, containers
    g.regular({ kind: 'chainlink_fence', v: 0, every: 10.4, phase: 1, off: 0.9, sides: [1], along: true });
    g.row({ side: 1, kinds: [['dock_warehouse', 0, 4], ['container_stack', null, 2], ['warehouse', null, 1]], setback: 4, gap: [3, 12], tint: 0.06 });
    g.row({ side: 1, kinds: [['dock_warehouse', 0, 2], ['container_stack', null, 3]], setback: 30, gap: [4, 16], tint: 0.06, batch: 'far' });
    // quay side (−1): containers by the road, gantry cranes over the quay edge, boats moored
    g.row({ side: -1, kinds: [['container_stack', null, 1]], setback: 2.5, gap: [2, 10], tint: 0.08, skip: 0.15 });
    for (let k = Math.ceil((g.from + 160) / 150); k * 150 < g.to - 100; k++) {
      const z = k * 150 + 40 * Math.sin(k * 1.7);
      const sea = g.info.seaU(z);
      if (sea > 1e4) continue;
      const a = sea - 12;
      if (g.resHit(-1, a - 9, a + 9, z - 14, z + 14)) continue;
      g.put({ kind: 'gantry_crane', v: 0, u: -a, z, yaw: -HALF_PI + t.headingAt(z), batch: 'far' }, false);
    }
    // bollards + quay clutter along the edge, fishing boats in the gaps between ships
    for (let z = g.from + 120; z < g.to - 120; z += 23) {
      const sea = g.info.seaU(z);
      if (sea > 1e4) continue;
      if (g.rng.chance(0.55)) {
        const a = sea - 2.6;
        if (!g.resHit(-1, a - 3, a + 3, z - 3, z + 3)) g.put({ kind: 'bollard_crates', v: g.rng.int(0, 2), u: -a, z, yaw: g.face(z, -1) + Math.PI, tint: 0.05 }, false);
      }
    }
    const ships = g.L.landmarks.filter((l) => l.kind === 'cargo_ship').map((l) => l.z);
    for (let z = g.from + 200; z < g.to - 150; z += 34) {
      if (ships.some((sz) => Math.abs(sz - z) < 85)) continue;
      if (!g.rng.chance(0.5)) continue;
      const sea = g.info.seaU(z);
      if (sea > 1e4) continue;
      if (g.info.drawbridge && Math.abs(z - g.info.drawbridge.zc) < 70) continue;
      const v = g.rng.int(0, 1);
      g.put({ kind: 'fishing_boat', v, u: -(sea + 5.5), z: z + g.rng.float(-6, 6), yaw: t.headingAt(z) + (g.rng.chance(0.5) ? 0 : Math.PI) + g.rng.float(-0.06, 0.06), y: SEA_Y_LM - 1.45, batch: 'near' }, false);
    }
    g.regular({ kind: 'streetlight', every: 36, phase: 12, off: 0.5, sidewalk: true });
  },

  suburbs(g) {
    const houses = [['house', null, 6], ['house_2storey', null, 3], ['shop_row', 0, 0.5]];
    // right: houses facing the road with front yards, picket fences, mailboxes, trees
    g.row({ side: 1, kinds: houses, setback: 8, gap: [7, 13], tint: 0.08, skip: 0.06 });
    g.row({ side: 1, kinds: [['house', null, 2], ['house_2storey', null, 1]], setback: 36, gap: [8, 16], tint: 0.08, batch: 'far' });
    // left: back gardens open toward the road (wide-load detour), houses turned away
    const yardDepth = 17;
    g.row({ side: -1, kinds: [['house', null, 6], ['house_2storey', null, 3]], setback: yardDepth, gap: [8, 14], tint: 0.08, away: true });
    g.row({ side: -1, kinds: [['house', null, 2], ['house_2storey', null, 1]], setback: yardDepth + 34, gap: [8, 16], tint: 0.08, batch: 'far' });
    // extras per house
    const items = g.items.slice();
    for (const it of items) {
      if (it.kind !== 'house' && it.kind !== 'house_2storey') continue;
      const s = it.u >= 0 ? 1 : -1, z = it.z;
      const p = g.protos.get(it.kind, it.v);
      const a = Math.abs(it.u), front = a - p.size.l / 2, C = g.C(z);
      if (it.batch === 'far') continue;
      if (s > 0) {
        // picket fence along the front yard with a gate gap, a mailbox, a tree beside
        const fp = g.protos.get('fence', 0);
        const segs = Math.max(1, Math.round((p.size.w + 3) / fp.size.w));
        for (let i = 0; i < segs; i++) {
          if (i === Math.floor(segs / 2)) continue;
          const zz = z - (segs * fp.size.w) / 2 + fp.size.w * (i + 0.5);
          if (g.resHit(s, C + 0.8, C + 1.6, zz - 1, zz + 1)) continue;
          g.put({ kind: 'fence', v: 0, u: s * (C + 1.2), z: zz, yaw: g.face(zz, s) }, false);
        }
        const zm = z + p.size.w * 0.15;
        if (!g.resHit(s, C, C + 1, zm - 1, zm + 1)) g.put({ kind: 'mailbox_deco', v: g.rng.int(0, 4), u: s * (C + 0.6), z: zm, yaw: g.face(zm, s) }, false);
      } else {
        // back gardens: yard props in the strip between the sidewalk and the house
        const n = 1 + (g.rng.chance(0.6) ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const zz = z + g.rng.float(-p.size.w / 2 + 2, p.size.w / 2 - 2);
          const aa = C + g.rng.float(3.5, Math.max(4, front - C - 3));
          if (!g.free(-1, aa - 2.4, aa + 2.4, zz - 2.4, zz + 2.4)) continue;
          g.put({ kind: 'yard_props', v: g.rng.int(0, 3), u: -aa, z: zz, yaw: g.face(zz, -1) + g.rng.float(-0.3, 0.3), tint: 0.04 });
        }
      }
      if (g.rng.chance(0.75)) {
        const zz = z + (g.rng.chance(0.5) ? 1 : -1) * (p.size.w / 2 + 2.6);
        const aa = s > 0 ? front - g.rng.float(0, 3) : a + g.rng.float(-2, 4);
        if (g.free(s, aa - 1.6, aa + 1.6, zz - 1.6, zz + 1.6)) g.put({ kind: 'tree_round', v: g.rng.int(0, 2), u: s * aa, z: zz, yaw: g.rng.float(0, 6.28), s: g.rng.float(0.85, 1.2), tint: 0.12 });
      }
    }
    g.regular({ kind: 'streetlight', every: 40, phase: 14, off: 0.5, sidewalk: true });
    junctionLights(g);
    g.scatter({ kind: 'tree_round', per: 2.2, a: 55, b: 160, scale: [0.9, 1.4], tint: 0.14 });
  },

  interstate(g) {
    const t = g.t, info = g.info;
    const ov = info.overpasses.map((o) => o.z), toll = info.toll ? info.toll.z : null;
    const nearStruct = (z, m) => ov.some((o) => Math.abs(z - o) < m) || (toll != null && Math.abs(z - toll) < m);
    // median jersey barrier (6 m pieces) where SIM-CORE's median collider is: biome.from+inset … to−inset
    // (the overpass v0 brings its own 20 m run, the toll plaza its centre island)
    const inset = (g.b.road && g.b.road.medianInset) ?? 50;
    for (let z = g.from + inset + 3; z <= g.to - inset - 3; z += 6) {
      if (ov.some((o) => Math.abs(z - o) < 11) || (toll != null && Math.abs(z - toll) < 6)) continue;
      g.put({ kind: 'jersey_barrier', v: 0, u: 0, z, yaw: HALF_PI + t.headingAt(z), batch: 'near' }, false);
    }
    // gantry signs every ~1.2 km (rotation π: signs face the RV)
    for (let z = g.from + 420; z < g.to - 200; z += 1180) {
      if (nearStruct(z, 140)) z += 200;
      g.put({ kind: 'gantry_sign', v: 0, u: 0, z, yaw: Math.PI + t.headingAt(z), batch: 'near' }, false);
      for (const s of [1, -1]) g.occupy(s, 0, 24, z - 4, z + 4);
    }
    // sound walls in long stretches
    for (const s of [1, -1]) {
      let z = g.from + 160 + (s > 0 ? 0 : 300);
      while (z < g.to - 200) {
        const len = g.rng.float(380, 900);
        const end = Math.min(g.to - 150, z + len);
        for (let zz = z; zz + 20.5 < end; zz += 20.4) {
          const zc = zz + 10.2;
          if (nearStruct(zc, 40)) continue;
          const a = g.C(zc) + 2.2;
          if (!g.free(s, a - 0.6, a + 0.6, zc - 10.2, zc + 10.2, { road: false })) continue;
          g.put({ kind: 'sound_wall', v: 0, u: s * a, z: zc, yaw: g.face(zc, s), along: true, batch: 'near' });
        }
        z = end + g.rng.float(500, 1300);
      }
    }
    // toll plaza guard walls (SIM-CORE colliders): concrete barriers from the outer islands out past the verge
    if (toll != null) {
      for (const s of [1, -1]) for (const dz of [-4.7, 4.7]) {
        const z = toll + dz;
        for (let a = 11 + 3; a < g.edge(z) + 40; a += 6) g.put({ kind: 'jersey_barrier', v: 0, u: s * a, z, yaw: t.headingAt(z) }, false);
      }
    }
    g.scatter({ kind: 'billboard', per: 0.12, a: 5, b: 12, face: false, yawFn: (z, s) => Math.PI + t.headingAt(z) - s * 0.3, tint: 0 });
    g.regular({ kind: 'powerpole', every: 52, phase: 10, off: 7, sides: [-1], yaw: 'face' });
    g.scatter({ kind: 'tree_round', per: 1.2, a: 100, b: 240, scale: [1.2, 1.8], tint: 0.14, batch: 'far' });
  },

  stripmall(g) {
    const t = g.t;
    const kinds = [['motel_2storey', 0, 1.2], ['drive_thru', 0, 1.4], ['donut_shop', 0, 1.2], ['minigolf_dino', 0, 1], ['shop_row', 0, 1.6]];
    for (const s of [1, -1]) {
      const before = g.items.length;
      g.row({ side: s, kinds, setback: 13, gap: [6, 18], tint: 0.04 });
      // parking lots in front of each building + an air dancer at some lot entrances
      for (const it of g.items.slice(before)) {
        const p = g.protos.get(it.kind, it.v);
        const a = Math.abs(it.u), front = a - p.size.l / 2, C = g.C(it.z);
        g.items.push({ decal: 'lot', side: s, u0: C - 0.2, u1: front + 0.5, z0: it.z - p.size.w / 2 - 2, z1: it.z + p.size.w / 2 + 2, z: it.z, stalls: true });
        if (g.rng.chance(0.55)) {
          const zz = it.z - p.size.w / 2 - 1.2;
          g.put({ kind: 'tube_man', v: g.rng.int(0, 2), u: s * (C + 1.2), z: zz, yaw: g.face(zz, s) }, false);
        }
      }
      g.row({ side: s, kinds: [['shop_row', 0, 1], ['motel_2storey', 0, 0.6], ['donut_shop', 0, 0.5]], setback: 52, gap: [8, 26], tint: 0.06, batch: 'far' });
    }
    g.regular({ kind: 'streetlight', every: 36, phase: 3, off: 0.5, sidewalk: true });
    junctionLights(g);
    g.scatter({ kind: 'billboard', per: 0.14, a: 2, b: 9, yawFn: (z, s) => Math.PI + t.headingAt(z) - s * 0.3, tint: 0 });
  },

  farmland(g) {
    const t = g.t;
    // ranch fence along both sides with drive gaps
    for (const s of [1, -1]) {
      for (let z = g.from + 20; z < g.to - 20; z += 4) {
        if (g.wz(z, 40) < 0.99) continue;
        if (Math.floor(z / 4) % 37 === (s > 0 ? 3 : 20)) { z += 8; continue; }
        const a = g.C(z) + 2.4;
        if (g.resHit(s, a - 0.5, a + 0.5, z - 2, z + 2)) continue;
        g.put({ kind: 'fence_wood', v: 0, u: s * a, z, yaw: g.face(z, s) }, false);
      }
    }
    // the band between the fence and the ploughed tiles: crop blocks, pumpkin patches, farmyards
    for (const s of [1, -1]) {
      let z = g.from + 40 + g.rng.float(0, 40);
      while (z < g.to - 60) {
        const r = g.rng.next();
        const C = g.C(z);
        if (r < 0.45) {
          // crop block: 2–4 patches along × 2 deep, same variant, maybe a scarecrow / pivot
          const v = g.rng.int(0, 1), nz = g.rng.int(2, 4), na = 2;
          let placed = 0;
          for (let i = 0; i < nz; i++) for (let j = 0; j < na; j++) {
            const zz = z + 10.4 + i * 20.6, aa = C + 5 + 10.3 + j * 20.6;
            if (!g.free(s, aa - 10.3, aa + 10.3, zz - 10.3, zz + 10.3)) continue;
            g.put({ kind: 'crop_rows', v, u: s * aa, z: zz, yaw: g.t.headingAt(zz), tint: 0.05, along: true }); placed++;
          }
          if (placed && g.rng.chance(0.5)) g.put({ kind: 'scarecrow', v: g.rng.int(0, 1), u: s * (C + 8), z: z + 6, yaw: g.face(z, s) }, false);
          z += nz * 20.6 + g.rng.float(6, 24);
        } else if (r < 0.6) {
          const aa = C + 9;
          if (g.free(s, aa - 7.5, aa + 7.5, z, z + 15)) g.put({ kind: 'pumpkin_patch', v: 0, u: s * aa, z: z + 7.5, yaw: g.face(z, s), along: true });
          z += 26;
        } else if (r < 0.85) {
          // farmyard: farmhouse by the road, barn + silos behind, maybe a windmill
          const fh = g.protos.get('farmhouse', 0).size;
          const aF = C + 6 + fh.l / 2;
          if (g.free(s, aF - fh.l / 2, aF + fh.l / 2, z, z + fh.w)) g.put({ kind: 'farmhouse', v: g.rng.int(0, 1), u: s * aF, z: z + fh.w / 2, yaw: g.face(z, s), along: true, tint: 0.06 });
          const bn = g.protos.get('barn', 0).size;
          const zb = z + fh.w + 8 + bn.w / 2, aB = C + 12 + bn.l / 2;
          if (g.free(s, aB - bn.l / 2, aB + bn.l / 2, zb - bn.w / 2, zb + bn.w / 2)) {
            g.put({ kind: 'barn', v: g.rng.int(0, 1), u: s * aB, z: zb, yaw: g.face(zb, s) + g.rng.float(-0.1, 0.1), along: true, tint: 0.06 });
            const zs = zb + bn.w / 2 + 4;
            for (let i = 0; i < g.rng.int(1, 2); i++) if (g.free(s, aB - 3, aB + 3, zs + i * 7 - 3, zs + i * 7 + 3)) g.put({ kind: 'silo', v: g.rng.int(0, 1), u: s * (aB - 2), z: zs + i * 7, yaw: 0 });
          }
          if (g.rng.chance(0.4)) { const aw = C + 34; if (g.free(s, aw - 3, aw + 3, z - 3, z + 3)) g.put({ kind: 'windmill', v: 0, u: s * aw, z, yaw: g.rng.float(0, 6) }); }
          z += fh.w + bn.w + 34;
        } else {
          const gh = g.protos.get('greenhouse', 0).size;
          const aa = C + 6 + gh.l / 2;
          if (g.free(s, aa - gh.l / 2, aa + gh.l / 2, z, z + gh.w)) g.put({ kind: 'greenhouse', v: 0, u: s * aa, z: z + gh.w / 2, yaw: g.face(z, s), along: true });
          z += gh.w + 14;
        }
      }
    }
    // irrigation pivots over the ploughed fields, a few far barns / silos, power line
    for (let z = g.from + 300; z < g.to - 200; z += 700) {
      const s = (Math.floor(z / 700) % 2) ? 1 : -1;
      const a = g.C(z) + 46 + 30;
      g.put({ kind: 'irrigation_pivot', v: 0, u: s * a, z, yaw: g.rng.float(0, 6.28), batch: 'far', onTile: true }, false);
    }
    g.regular({ kind: 'powerpole', every: 48, phase: 0, off: 4.2, sides: [-1] });
    g.scatter({ kind: 'barn', per: 0.06, a: 140, b: 260, batch: 'far', tint: 0.06 });
    g.scatter({ kind: 'tree_round', per: 0.9, a: 130, b: 300, scale: [1.2, 1.7], batch: 'far', tint: 0.12 });
    void t;
  },

  foothills(g) {
    // pines line the tiles (forest floor tiles carry their own pines); here: verge pines,
    // river rocks at the crossing, far forest
    g.scatter({ kind: 'pine', per: 2.6, a: 1, b: 6, scale: [0.8, 1.15], tint: 0.08, r: 2.2 });
    g.scatter({ kind: 'pine', per: 7, a: 84, b: 260, scale: [1.0, 1.6], tint: 0.1, batch: 'far', r: 3, bias: 1 });
    const r = g.info.river;
    if (r) for (const s of [1, -1]) for (let i = 0; i < 4; i++) {
      const a = g.C(r.zc) + 14 + i * 13, z = r.zc + (s > 0 ? -1 : 1) * (2 + i * 2.5) + (i % 2 ? 9 : -9);
      g.put({ kind: 'river_rocks', v: i % 3, u: s * a, z, yaw: i * 1.3, y: -3.75, tint: 0.05 }, false);
    }
  },

  saltflats(g) {
    const t = g.t;
    g.scatter({ kind: 'hoodoo', per: 1.1, a: 60, b: 280, scale: [1.0, 2.4], tint: 0.06, batch: 'far', bias: 1 });
    g.scatter({ kind: 'hoodoo', per: 0.25, a: 22, b: 60, scale: [0.8, 1.3], tint: 0.06 });
    g.scatter({ kind: 'cactus', per: 0.5, a: 3, b: 40, scale: [0.7, 1.2], tint: 0.1 });
    g.scatter({ kind: 'mesa', per: 0.14, a: 260, b: 520, scale: [1.2, 2.2], tint: 0.05, batch: 'far' });
    g.regular({ kind: 'powerpole', every: 55, phase: 12, off: 4, sides: [1] });
    g.scatter({ kind: 'billboard', per: 0.06, a: 4, b: 10, yawFn: (z, s) => Math.PI + t.headingAt(z) - s * 0.3, tint: 0 });
  },

  ghosttown(g) {
    // main street: boardwalks on the sidewalks, false-front buildings behind them
    const z0 = g.from + 70, z1 = g.to - 60;
    for (const s of [1, -1]) {
      const before = g.items.length;
      g.row({ side: s, kinds: [['saloon', 0, 1.2], ['sheriff_office', 0, 1], ['chapel', 0, 0.6], ['livery_stable', 0, 0.7], ['water_tower_wood', 0, 0.6], ['shack', 0, 0.8]], setback: 0.6, gap: [1.5, 7], z0, z1, tint: 0.06 });
      for (const it of g.items.slice(before)) {
        if (it.kind === 'water_tower_wood' || it.kind === 'livery_stable' || it.kind === 'chapel') continue;
        const p = g.protos.get(it.kind, it.v);
        const n = Math.max(1, Math.round(p.size.w / 11.8));
        for (let i = 0; i < n; i++) {
          const zz = it.z - (n * 11.8) / 2 + 11.8 * (i + 0.5);
          const a = g.edge(zz) + 0.2 + 2.0;
          g.put({ kind: 'boardwalk', v: 0, u: s * a, z: zz, yaw: g.face(zz, s), along: true }, false);
        }
      }
    }
    g.scatter({ kind: 'cactus', per: 1.2, a: 4, b: 28, scale: [0.7, 1.3], tint: 0.1 });
    g.scatter({ kind: 'shack', per: 0.12, a: 8, b: 24, face: true, tint: 0.08 });
  },

  canyon(g) {
    // the original canyon look: walls, rocks, cacti, warning signs
    for (const s of [1, -1]) {
      let z = g.from + g.rng.float(0, 3), guard = 0;
      while (z < g.to && guard++ < 400) {
        const v = g.rng.int(0, 2);
        const p = g.protos.get('canyon_wall', v);
        const w = Math.max(4, p.size.w);
        const zc = z + w / 2;
        if (zc > g.to + w * 0.3) break;
        const a = g.C(zc) + 7 + p.size.l / 2 + g.rng.float(0, 3);
        if (!g.resHit(s, a - 4, a + 4, zc - 2, zc + 2) && g.wz(zc, 80) > 0.2) g.put({ kind: 'canyon_wall', v, u: s * a, z: zc, yaw: g.face(zc, s), sy: g.rng.float(0.9, 1.5), tint: 0.08, yOff: -1.5 }, false);
        z += w * g.rng.float(0.75, 0.95);
      }
    }
    g.scatter({ kind: 'rock_big', per: 2.2, a: 2, b: 30, scale: [0.6, 1.6], tint: 0.1 });
    g.scatter({ kind: 'cactus', per: 0.8, a: 1, b: 12, scale: [0.7, 1.2], tint: 0.1 });
  },

  hideout(g) {
    g.scatter({ kind: 'cactus', per: 2.2, a: 3, b: 30, scale: [0.7, 1.4], tint: 0.1 });
    g.scatter({ kind: 'rock_big', per: 1.2, a: 6, b: 34, scale: [0.6, 1.6], tint: 0.1 });
    g.scatter({ kind: 'mesa', per: 0.5, a: 200, b: 420, scale: [1, 1.9], tint: 0.06, batch: 'far' });
    g.regular({ kind: 'powerpole', every: 50, phase: 20, off: 3, sides: [-1] });
  },
};

export { GEN };
