// ─────────────────────────────────────────────────────────────────────────────
// Road & ground geometry (VIEW-WORLD-A). Everything follows Track (centerX /
// halfWidth / shoulder / surfaceY) so the visuals always match the sim.
//
// RoadInfo – precomputed route facts: biome looks (world/areas.js), road types,
//            intersections (= Track.intersectionZs, where the sim's peds cross),
//            lots, flatten regions, scenery reservations, structures (garage,
//            rail crossing, drawbridge channel, overpasses, toll plaza, car wash,
//            cattle grid, river bridge), the docks sea, terrain-tile plan, the
//            time-of-day keyframes, plus terrain height / colour functions.
// buildRoadChunk(info, z0, z1, B) – fills the chunk batches (ground / decal /
//            marks / props / water / cobble) with the road surface by type
//            (city, cobble + tram tracks, freeway + median, rural, dirt), sides,
//            sidewalks, the sea and quays, channels, river beds, lots, rails,
//            side streets and the canyon bridge pieces.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { UP } from './world/wbatch.js';
import { AREAS, VIS_DEFAULT, ROAD_LOOK } from './world/areas.js';

export const CHUNK = 50;
export const ROW = 2;
export const TILE_LEN = 60;
export const SEA_Y = -3.2;          // harbour water level (drawbridge channel + sea)
export const RIVER_Y = -3.65;       // river surface (covered bridge, terrain_river water at local 0.35 − 4)

const smooth = (t) => t * t * (3 - 2 * t);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, v) => smooth(clamp((v - a) / (b - a), 0, 1));

// ── noise ───────────────────────────────────────────────────────────────────
function hash2(ix, iz, s) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, z, s = 0) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const a = hash2(ix, iz, s), b = hash2(ix + 1, iz, s), c = hash2(ix, iz + 1, s), d = hash2(ix + 1, iz + 1, s);
  const ux = smooth(fx), uz = smooth(fz);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
const vhash = (x, z) => hash2(Math.round(x * 4), Math.round(z * 4), 91) - 0.5;

const _ca = new THREE.Color(), _cb = new THREE.Color(), _cc = new THREE.Color();

// The renderer's own Track instance gets small memo caches (pure functions of z): chunk building calls
// centerX / biomeWeights tens of thousands of times per chunk.
function memoTrack(track) {
  if (track.__memo) return;
  track.__memo = true;
  const wrap = (name) => {
    const f = track[name].bind(track);
    let m = new Map();
    track[name] = (z) => { let v = m.get(z); if (v === undefined) { if (m.size > 40000) m = new Map(); v = f(z); m.set(z, v); } return v; };
  };
  for (const n of ['biomeWeights', 'centerX', 'halfWidth', 'shoulder', 'headingAt', 'laneWidth']) if (typeof track[n] === 'function') wrap(n);
}

export class RoadInfo {
  constructor(track, route, seed) {
    this.track = track;
    memoTrack(track);
    this.route = route;
    this.seed = seed | 0;
    this.bridge = route.bridge || null;
    this.biomes = route.biomes.map((b) => {
      const area = AREAS[b.id] || {};
      return {
        ...b,
        area,
        col: Object.fromEntries(Object.entries(b.colors || {}).map(([k, v]) => [k, new THREE.Color(v)])),
        vis: { ...VIS_DEFAULT, ...(area.vis || {}) },
        sw: b.sidewalk ? 1 : 0,
        rt: (b.road && b.road.type) || 'city',
      };
    });
    for (const b of this.biomes) {
      const look = ROAD_LOOK[b.rt] || ROAD_LOOK.city;
      if (look.color) b.col.road = b.col.road ? b.col.road.clone().lerp(new THREE.Color(look.color), look.mix) : new THREE.Color(look.color);
      b.vis.worn = look.worn;
      b.vis.fw = b.rt === 'freeway' ? 1 : 0;
    }
    this.train = (route.events || []).find((e) => e.type === 'train') || null;
    this.dust = (route.events || []).find((e) => e.type === 'dustStorm') || null;
    this.sell = route.sellPoint || null;
    this.stops = (route.stops || []).map((s) => ({ ...s, lot: track.stopLot(s) }));
    this.tod = (route.timeOfDay || [[0, 12]]).slice().sort((a, b) => a[0] - b[0]);

    // ── structures ─────────────────────────────────────────────────────────
    const S = route.structures || [];
    const find = (t) => S.find((s) => s.type === t) || null;
    this.garage = find('garage');
    this.railX = find('rail_crossing');
    this.overpasses = S.filter((s) => s.type === 'overpass');
    this.toll = find('toll_plaza');
    this.carwash = find('car_wash');
    this.cattle = find('cattle_grid');
    const db = find('drawbridge');
    this.drawbridge = db ? { ...db, zc: (db.from + db.to) / 2, half: (db.to - db.from) / 2, deck: 42, chanEnd: 170 } : null;
    const rb = find('river_bridge');
    this.river = rb ? { ...rb, zc: (rb.from + rb.to) / 2, half: (rb.to - rb.from) / 2 } : null;
    this.gaps = [];
    if (this.drawbridge) this.gaps.push({ z0: this.drawbridge.zc - this.drawbridge.deck, z1: this.drawbridge.zc + this.drawbridge.deck, kind: 'drawbridge' });
    if (this.river) this.gaps.push({ z0: this.river.from, z1: this.river.to, kind: 'river' });
    const docks = this.biomes.find((b) => b.water);
    this.sea = docks ? { side: docks.water, from: docks.from, to: docks.to, quay: 30 } : null;

    // intersections: the sim's crosswalk positions (peds cross there)
    this.intersections = [];
    const zs = typeof track.intersectionZs === 'function' ? track.intersectionZs() : [];
    for (const z of zs) {
      const b = track.biomeAt(z);
      if (!b.intersectionEvery) continue;
      if (this.gaps.some((g) => z > g.z0 - 80 && z < g.z1 + 80)) continue;
      if (this.garage && Math.abs(z - this.garage.z) < 60) continue;
      const big = b.lanes >= 4;
      this.intersections.push({ z, W: big ? 11 : 8, len: big ? 80 : 58, biome: b.id });
    }

    // flatten regions: {z0, z1, side (0 = both), u (extent from centre), kind}
    this.flats = [];
    for (const it of this.intersections) this.flats.push({ z0: it.z - it.W / 2, z1: it.z + it.W / 2, side: 0, u: it.len, kind: 'street' });
    for (const s of this.stops) {
      const hw = track.halfWidth(s.z) + track.shoulder(s.z);
      const half = Math.max(s.lotLength / 2, 20);
      this.flats.push({ z0: s.z - half - 2, z1: s.z + half + 2, side: s.side, u: hw + Math.max(s.lotDepth, 42) + 14, kind: 'lot' });
    }
    if (this.sell) {
      this.sellLot = { z0: this.sell.z - 32, z1: this.sell.z + 32 };
      this.flats.push({ z0: this.sellLot.z0, z1: this.sellLot.z1, side: this.sell.side, u: 75, kind: 'sell' });
    }
    if (this.garage) this.flats.push({ z0: this.garage.z - 13, z1: this.garage.z + 13, side: this.garage.side || 1, u: 34, kind: 'drive' });
    if (this.carwash) this.flats.push({ z0: this.carwash.z - 18, z1: this.carwash.z + 18, side: this.carwash.side || 1, u: 30, kind: 'lot' });
    if (this.toll) this.flats.push({ z0: this.toll.z - 16, z1: this.toll.z + 16, side: 0, u: 26, kind: 'plaza' });
    for (const o of this.overpasses) this.flats.push({ z0: o.z - 8, z1: o.z + 8, side: 0, u: 60, kind: 'street' });

    // scenery reservations {z0, z1, side, u0, u1, tag}
    this.res = [];
    const R = (z0, z1, side, u0, u1, tag) => this.res.push({ z0, z1, side, u0, u1, tag });
    for (const s of this.stops) {
      const hw = track.halfWidth(s.z) + track.shoulder(s.z);
      const fp = STORE_FP[s.model] || STORE_FP.default;
      R(s.z - fp.w / 2 - 5, s.z + fp.w / 2 + 5, s.side, 0, hw + fp.l + 6, 'stop');
    }
    if (this.sell) R(this.sellLot.z0 - 6, this.sellLot.z1 + 6, this.sell.side, 0, 90, 'sell');
    if (this.garage) R(this.garage.z - 16, this.garage.z + 16, this.garage.side || 1, 0, 36, 'garage');
    if (this.railX) R(this.railX.z - 9, this.railX.z + 9, 0, 0, 400, 'rail');
    if (this.train && (!this.railX || this.train.z !== this.railX.z)) R(this.train.z - 9, this.train.z + 9, 0, 0, 400, 'rail');
    if (this.drawbridge) { const d = this.drawbridge; R(d.zc - d.deck - 6, d.zc + d.deck + 6, 0, 0, 220, 'drawbridge'); }
    for (const o of this.overpasses) R(o.z - 16, o.z + 16, 0, 0, 260, 'overpass');
    if (this.toll) R(this.toll.z - 24, this.toll.z + 24, 0, 0, 62, 'toll');
    if (this.carwash) R(this.carwash.z - 22, this.carwash.z + 22, this.carwash.side || 1, 0, 34, 'carwash');
    if (this.cattle) R(this.cattle.z - 7, this.cattle.z + 7, 0, 0, 14, 'cattle');
    if (this.river) R(this.river.zc - 36, this.river.zc + 36, 0, 0, 120, 'river');
    for (const it of this.intersections) R(it.z - it.W / 2 - 2.5, it.z + it.W / 2 + 2.5, 0, 0, it.len + 2, 'street');
    const br = this.bridge;
    if (br) R(br.rampStart - 16, br.landingEnd + 16, 0, 0, 30, 'bridge');

    // breakpoints where the cross-section type changes
    const bp = [];
    if (br) bp.push(br.rampStart, br.lip, br.gapStart, br.gapEnd, br.landingEnd);
    for (const f of this.flats) bp.push(f.z0, f.z1);
    if (this.train) bp.push(this.train.z - 2.4, this.train.z + 2.4);
    for (const g of this.gaps) bp.push(g.z0, g.z1);
    if (this.drawbridge) { const d = this.drawbridge; bp.push(d.zc - d.half, d.zc + d.half); }
    if (this.river) { const r = this.river; for (const k of [-14, -8, 8, 14]) bp.push(r.zc + k); }
    this.breaks = bp.sort((a, b) => a - b);
    this._flatB = new Map();
    for (const f of this.flats) for (let k = Math.floor((f.z0 - 1) / 50); k <= Math.floor((f.z1 + 1) / 50); k++) { let l = this._flatB.get(k); if (!l) this._flatB.set(k, (l = [])); l.push(f); }

    this.tilePlan = new TilePlan(this);
    this._wz = NaN; this._w = null;
  }

  // ── blending helpers ────────────────────────────────────────────────────
  weights(z) {
    if (z !== this._wz) { this._wz = z; this._w = this.track.biomeWeights(z); }
    return this._w;
  }
  color(z, key, out) {
    const w = this.weights(z);
    out.setRGB(0, 0, 0);
    for (let i = 0; i < w.length; i++) if (w[i]) {
      const c = this.biomes[i].col[key];
      if (c) { out.r += c.r * w[i]; out.g += c.g * w[i]; out.b += c.b * w[i]; }
    }
    return out;
  }
  vis(z, key) {
    const w = this.weights(z);
    let v = 0;
    for (let i = 0; i < w.length; i++) if (w[i]) v += (this.biomes[i].vis[key] ?? 0) * w[i];
    return v;
  }
  num(z, key) {
    const w = this.weights(z);
    let v = 0;
    for (let i = 0; i < w.length; i++) if (w[i]) v += (this.biomes[i][key] || 0) * w[i];
    return v;
  }
  biome(z) { return this.biomes[this.track.biomeIndexAt(z)]; }
  roadType(z) { return this.biome(z).rt; }
  sidewalk(z) { return this.num(z, 'sw'); }
  // outer edge of the road corridor (road + shoulder + sidewalk)
  corridor(z) {
    const t = this.track;
    return t.halfWidth(z) + t.shoulder(z) + 0.2 + 3.2 * this.sidewalk(z);
  }
  hourAt(z) {
    const k = this.tod;
    if (z <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) if (z <= k[i][0]) { const a = k[i - 1], b = k[i]; return a[1] + (b[1] - a[1]) * (z - a[0]) / (b[0] - a[0]); }
    return k[k.length - 1][1];
  }

  flatAt(z, side) {
    let u = 0, kind = null;
    const list = this._flatB ? this._flatB.get(Math.floor(z / 50)) : this.flats;
    if (!list) return null;
    for (const f of list) {
      if (z >= f.z0 - 1e-6 && z <= f.z1 + 1e-6 && (f.side === 0 || f.side === side)) {
        if (f.u > u) { u = f.u; kind = f.kind; }
      }
    }
    return u ? { u, kind } : null;
  }
  intersectionNear(z, pad = 0) {
    for (const it of this.intersections) if (Math.abs(z - it.z) < it.W / 2 + pad) return it;
    return null;
  }
  /** true when the scenery footprint (|u| ± r at z ± r) hits a reservation */
  reserved(u, z, r = 0, ignore = null) {
    const s = u > 0 ? 1 : -1, a = Math.abs(u);
    for (const q of this.res) {
      if (q.tag === ignore) continue;
      if (q.side !== 0 && q.side !== s) continue;
      if (z + r > q.z0 && z - r < q.z1 && a + r > q.u0 && a - r < q.u1) return q;
    }
    return null;
  }
  inGap(z) { const b = this.bridge; return !!b && z > b.gapStart && z < b.gapEnd; }
  roadGap(z) { for (const g of this.gaps) if (z > g.z0 && z < g.z1) return g; return null; }
  surfaceAt(z, toward) {
    const e = toward > z ? 1e-4 : -1e-4;
    const y = this.track.surfaceY(z + e);
    return y == null ? 0 : y;
  }

  // sea on side `sea.side` (docks): distance from the centre line where the quay edge is (Infinity = none)
  seaU(z) {
    const s = this.sea;
    if (!s) return Infinity;
    const k = sstep(s.from - 260, s.from + 140, z) * (1 - sstep(s.to - 140, s.to + 260, z));
    if (k <= 0) return Infinity;
    return this.corridor(z) + s.quay + (1 - k) * 900;
  }
  inChannel(z) { const d = this.drawbridge; return !!d && Math.abs(z - d.zc) < d.half; }

  // Terrain height (outside the road). Continuous in world space.
  groundY(u, z) {
    const a = Math.abs(u);
    const x = this.track.centerX(z) - u;
    const edge = this.corridor(z);
    let y = -0.03;
    let hills = this.vis(z, 'hills');
    if (hills > 0 && this.river) {
      // a flat valley follows the river chain away from the covered bridge
      const r = this.river, s = u > 0 ? 1 : -1;
      const pathZ = r.zc + s * RIVER_SHIFT * Math.max(0, (a - edge)) / 80;
      hills *= sstep(45, 110, Math.abs(z - pathZ));
    }
    if (hills > 0) {
      const from = this.vis(z, 'hillsFrom');
      const n = vnoise(x * 0.011, z * 0.011, 3) * 0.7 + vnoise(x * 0.04, z * 0.04, 4) * 0.3;
      y += hills * sstep(edge + from, edge + from + 200, a) * (0.25 + 0.95 * n);
    }
    const canyon = this.vis(z, 'canyon');
    if (canyon > 0) {
      const n = vnoise(x * 0.035 + 7, z * 0.022, 5);
      const n2 = vnoise(x * 0.12, z * 0.09, 6);
      y += canyon * (34 + 22 * n) * sstep(edge + 7, edge + 30, a) + canyon * 3 * n2 * sstep(edge + 4, edge + 14, a);
    }
    const f = this.flatAt(z, u > 0 ? 1 : -1);
    if (f && a < f.u) y = Math.min(y, -0.03 + Math.max(0, a - f.u + 10) * 0.05);
    return y;
  }

  // Ground colour at lateral offset u (|u| beyond the corridor), height y.
  groundColor(u, z, y, out) {
    const a = Math.abs(u);
    const x = this.track.centerX(z) - u;
    const edge = this.corridor(z);
    this.color(z, 'ground', out);
    const tint = this.tilePlan.groundTint(z, out);
    void tint;
    this.color(z, 'roadside', _ca);
    const sw = this.sidewalk(z);
    const near = 1 - sstep(edge, edge + 9 - 7 * sw, a);
    out.lerp(_ca, near * (0.85 - 0.6 * sw));
    const fields = this.vis(z, 'fields');
    if (fields > 0.01 && a > edge + 6) {
      const pu = Math.floor((a - edge - 6) / 38), pz = Math.floor((z + (u > 0 ? 0 : 17)) / 55);
      const h = hash2(pu, pz, u > 0 ? 11 : 12);
      const tints = FIELD_TINTS[Math.floor(h * FIELD_TINTS.length)];
      _cb.setRGB(out.r * tints[0], out.g * tints[1], out.b * tints[2]);
      out.lerp(_cb, fields * sstep(edge + 6, edge + 14, a));
    }
    const salt = this.vis(z, 'salt');
    if (salt > 0.01) {
      const cr = vnoise(x * 0.18, z * 0.18, 13);
      _cb.copy(SALT).multiplyScalar(0.94 + 0.08 * cr);
      if (Math.abs(cr - 0.5) < 0.03) _cb.multiplyScalar(0.86);
      out.lerp(_cb, salt * sstep(edge + 1, edge + 4, a));
    }
    const sand = this.vis(z, 'sand');
    if (sand > 0.01) {
      const r = vnoise(x * 0.09, z * 0.05, 8);
      const k = 1 + sand * (r - 0.5) * 0.12;
      out.multiplyScalar(k);
    }
    const canyon = this.vis(z, 'canyon');
    if (canyon > 0.01 && y > 1.5) {
      const band = Math.sin(y * 0.55 + vnoise(x * 0.05, z * 0.05, 9) * 2.2);
      _cb.copy(out);
      if (band > 0.35) _cb.lerp(STRATA_DARK, 0.45); else if (band < -0.45) _cb.lerp(STRATA_LIGHT, 0.4);
      _cb.multiplyScalar(0.92 + Math.min(1, y / 40) * 0.12);
      out.lerp(_cb, canyon);
    } else if (y > 2) {
      out.multiplyScalar(1 + Math.min(0.08, y * 0.002));
    }
    const nz = 1 + vhash(x, z) * 0.09 + (vnoise(x * 0.07, z * 0.07, 2) - 0.5) * 0.1;
    out.multiplyScalar(nz);
    return out;
  }
}

// store model footprints along the road (w) × depth (l), for lots and reservations
export const STORE_FP = {
  store_megamart: { w: 46, l: 40 }, store_junkyard: { w: 40, l: 18 }, store_farm: { w: 36, l: 16 },
  store_market: { w: 34.3, l: 16.6 }, store_chandlery: { w: 34.2, l: 16.3 }, default: { w: 34, l: 16 },
};

// ── terrain tile plan: which tile (if any) sits at tile index k on side s ──
export class TilePlan {
  constructor(info) {
    this.info = info;
    this.cache = new Map();
    this.tints = new Map();   // biome id → THREE.Color (filled by Chunks once tile protos exist)
    this.river = [];          // river crossing chain: [{ kind, variant, zc, u0, sink, side, i }]
    const r = info.river;
    if (r) {
      const corr = info.corridor(r.zc);
      for (const s of [1, -1]) for (let i = 0; i < RIVER_CHAIN; i++) {
        // each terrain_river tile's river leaves its far edge at local z ≈ −6.18 (mirrored on the left)
        this.river.push({ kind: 'terrain_river', variant: 0, zc: r.zc + i * RIVER_SHIFT * (s > 0 ? 1 : -1), u0: corr + i * 80, band: i * 80, sink: 4, side: s, i, river: true });
      }
    }
  }
  /** {kind, variant, band, zc, sink} for grid tile index k (centre z = 30 + 60k) on side s, or null */
  at(k, s) {
    const key = k * 4 + (s > 0 ? 1 : 0);
    if (this.cache.has(key)) return this.cache.get(key);
    const info = this.info, t = info.track;
    const zc = TILE_LEN / 2 + TILE_LEN * k;
    let res = null;
    const r = info.river;
    const b = t.biomeAt(zc);
    const cfg = b && AREAS[b.id] && AREAS[b.id].tiles;
    if (cfg && !(r && Math.abs(zc - r.zc) < TILE_LEN - 1)) {
      let blocked = !(cfg.sides || [1, -1]).includes(s);
      const corr = info.corridor(zc);
      const u0 = corr + cfg.band, u1 = u0 + 80;
      for (let dz = -TILE_LEN / 2; dz <= TILE_LEN / 2 && !blocked; dz += 10) {
        const z = zc + dz;
        if (Math.abs(dz) < TILE_LEN / 2 - 0.1 && t.biomeAt(z).id !== b.id) { blocked = true; break; }
        for (const q of info.res) {
          if (q.side !== 0 && q.side !== s) continue;
          if (z > q.z0 - 2 && z < q.z1 + 2 && u1 > q.u0 && u0 < q.u1) { blocked = true; break; }
        }
      }
      if (!blocked) {
        const h = hash2(k, s > 0 ? 7 : 3, info.seed);
        let tot = 0; for (const e of cfg.kinds) tot += e[2];
        let acc = 0, pick = cfg.kinds[cfg.kinds.length - 1];
        for (const e of cfg.kinds) { acc += e[2] / tot; if (h < acc) { pick = e; break; } }
        res = { kind: pick[0], variant: pick[1], band: cfg.band, zc, sink: 0, u0 };
      }
    }
    this.cache.set(key, res);
    return res;
  }
  /** tiles whose centre lies in [z0, z1) on side s (grid tiles + river chain) */
  tilesIn(z0, z1, s) {
    const out = [];
    for (let k = Math.floor((z0 - TILE_LEN / 2) / TILE_LEN); ; k++) {
      const zc = TILE_LEN / 2 + TILE_LEN * k;
      if (zc >= z1) break;
      if (zc < z0) continue;
      const tl = this.at(k, s);
      if (tl) out.push(tl);
    }
    for (const tl of this.river) if (tl.side === s && tl.zc >= z0 && tl.zc < z1) out.push(tl);
    return out;
  }
  /** lowered spans under tiles at z on side s: [{u0, u1, y}] (the base ground hides below them) */
  cover(z, s, out) {
    out.length = 0;
    const k = Math.floor(z / TILE_LEN);
    for (const kk of [k - 1, k]) {
      const tl = this.at(kk, s);
      if (tl && Math.abs(z - tl.zc) < TILE_LEN / 2 - 0.05) out.push({ u0: tl.u0, u1: tl.u0 + 80, y: -0.35, tile: tl });
    }
    for (const tl of this.river) if (tl.side === s && Math.abs(z - tl.zc) < TILE_LEN / 2 - 0.05) out.push({ u0: tl.u0, u1: tl.u0 + 80, y: -tl.sink - 1.6, tile: tl });
    return out;
  }
  /** blend the base ground colour toward the area's tile colours (so the ground beyond tiles matches) */
  groundTint(z, out) {
    const w = this.info.weights(z);
    let wt = 0; _cc.setRGB(0, 0, 0);
    for (let i = 0; i < w.length; i++) if (w[i]) {
      const b = this.info.biomes[i];
      const tc = b.area.tiles ? this.tints.get(b.id) : null;
      if (tc) { _cc.r += tc.r * w[i]; _cc.g += tc.g * w[i]; _cc.b += tc.b * w[i]; wt += w[i]; }
    }
    if (wt > 0) { _cc.multiplyScalar(1 / wt); out.lerp(_cc, 0.8 * wt); }
    return wt;
  }
}
export const RIVER_CHAIN = 4;
export const RIVER_SHIFT = -6.18;

const FIELD_TINTS = [[1, 1, 1], [0.78, 0.98, 0.62], [0.82, 0.74, 0.62], [1.05, 1.02, 0.8], [0.7, 0.9, 0.55], [0.95, 0.85, 0.7]];
const STRATA_DARK = new THREE.Color('#8e3f2a');
const STRATA_LIGHT = new THREE.Color('#e0a878');
const SALT = new THREE.Color('#ece6d8');
const CURB = new THREE.Color('#b9b4aa');
const WHITE_LINE = new THREE.Color('#e8e3d4');
const YELLOW_LINE = new THREE.Color('#e3c25a');
const ZEBRA = new THREE.Color('#ece8dc');
const LOT = new THREE.Color('#5a5b5d');
const LOT_LINE = new THREE.Color('#e2ddcd');
const CONCRETE = new THREE.Color('#a8a49c');
const CONCRETE_DARK = new THREE.Color('#77736d');
const REBAR = new THREE.Color('#5a3a2a');
const RIVER = new THREE.Color('#3f8f9a');
const RIVER_DEEP = new THREE.Color('#2f6f86');
const BANK = new THREE.Color('#b99a72');
const GRAVEL = new THREE.Color('#8b8378');
const SLEEPER = new THREE.Color('#5d4a3a');
const RAIL = new THREE.Color('#6e6f72');
const RAIL_TOP = new THREE.Color('#a9abad');
const GROOVE = new THREE.Color('#26272a');
const STRIPE_RED = new THREE.Color('#c8402f');
const STRIPE_WHITE = new THREE.Color('#ece8dc');
const QUAY = new THREE.Color('#9d978b');
const QUAY_DARK = new THREE.Color('#5f5a52');
const QUAY_EDGE = new THREE.Color('#d9b23a');
const SEA = new THREE.Color('#2f5f74');
const SEA_NEAR = new THREE.Color('#3f7488');
const MUD = new THREE.Color('#5e5a4e');
const DRIVE = new THREE.Color('#b3ada2');

const GROUND_OFFS = [0.6, 3, 6, 10, 15, 21, 28, 36, 46, 60, 80, 110, 150, 200, 260, 700];

const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _r = new THREE.Vector3(), _s = new THREE.Vector3();
const FACE = { up: UP, px: new THREE.Vector3(1, 0, 0), nx: new THREE.Vector3(-1, 0, 0), pz: new THREE.Vector3(0, 0, 1), nz: new THREE.Vector3(0, 0, -1) };

// Side cross-section at z for side s (+1 right / −1 left): list of {u (signed), y, c}.
// The point COUNT is constant for a given side of a biome (rows are paired by index).
const _cov = [];
let _profCache = null;
function sideProfile(info, z, s, opts = null) {
  if (_profCache && !opts) {
    const key = z * 2 + (s > 0 ? 1 : 0);
    let p = _profCache.get(key);
    if (!p) { p = sideProfileRaw(info, z, s, null); _profCache.set(key, p); }
    return p;
  }
  return sideProfileRaw(info, z, s, opts);
}
function sideProfileRaw(info, z, s, opts = null) {
  const t = info.track;
  const hw = t.halfWidth(z), sh = t.shoulder(z), sw = info.sidewalk(z);
  const rt = info.roadType(z);
  const flat = info.flatAt(z, s);
  const flatU = flat ? flat.u : 0;
  const curbH = (flat && flatU > hw) || rt === 'dirt' ? 0 : 0.16 * sw;
  const pts = [];
  const road = info.color(z, 'road', new THREE.Color());
  const rs = info.color(z, 'roadside', new THREE.Color());
  const fw = info.vis(z, 'fw'), worn = info.vis(z, 'worn');
  const shoulderC = rs.clone().multiplyScalar(0.9).lerp(road.clone().multiplyScalar(1.12), Math.max(sw, fw));
  if (fw > 0) shoulderC.lerp(road.clone().multiplyScalar(1.22), fw);
  if (worn > 0 && sw < 0.5) shoulderC.lerp(GRAVEL, 0.4 * worn);
  const sidewalkC = rt === 'dirt' ? rs.clone().multiplyScalar(0.92) : rt === 'cobble' ? rs.clone().multiplyScalar(0.97) : rs.clone().multiplyScalar(1.02);
  const yFlat = -0.02;
  const d = info.drawbridge;
  const underDeck = !!d && Math.abs(z - d.zc) < d.deck + 0.5;
  const low = opts && opts.low;
  const P = (u, y, c, n = true) => {
    const col = c.clone();
    if (n) col.multiplyScalar(1 + vhash(t.centerX(z) - s * u, z) * 0.07);
    pts.push({ u: s * u, y, c: col });
  };
  let ys = flatU ? yFlat : -0.005;
  if (underDeck) ys = -0.6;
  if (low) ys = -6;
  const wornW = worn > 0.5 && !flatU ? Math.min(0.5, sh * 0.3) : 0.02;
  P(hw, ys, shoulderC);
  P(hw + wornW, ys, wornW > 0.1 ? shoulderC.clone().lerp(road, 0.55) : shoulderC);
  P(hw + sh, ys, shoulderC);
  const ch = underDeck || low ? 0 : curbH;
  P(hw + sh, ys, CURB, false);
  P(hw + sh, ys + ch, CURB, false);
  P(hw + sh + 0.2, ys + ch, CURB, false);
  P(hw + sh + 0.2, ys + ch, sidewalkC, false);
  const base = hw + sh + 0.2 + 3.2 * sw;
  P(base, ys + ch, sidewalkC);
  // ground out to +700 m (collapsing at the quay on the sea side)
  const seaSide = !!info.sea && info.sea.side === s;
  const seaU = seaSide ? info.seaU(z) : Infinity;
  const cov = info.tilePlan.cover(z, s, _cov);
  const gc = new THREE.Color();
  let lastY = 0, lastU = base;
  for (const o of GROUND_OFFS) {
    const u = Math.min(base + o, seaU - 3);
    let y = info.groundY(s * u, z);
    if (flatU && u < flatU) y = Math.min(y, yFlat);
    if (underDeck && u < 7.8) y = -0.6;
    if (low && u < base + 2) y = -6;
    for (const c of cov) if (u > c.u0 + 0.5 && u < c.u1 - 0.5) y = Math.min(y, c.y);
    info.groundColor(s * u, z, y, gc);
    P(u, y, gc, false);
    lastY = y; lastU = u;
  }
  if (seaSide) {
    // quay: paving to the edge, yellow coping, then the wall down into the water (collapsed when there is no sea)
    if (seaU < base + 700) {
      const qc = QUAY.clone().multiplyScalar(1 + vhash(seaU, z) * 0.06);
      P(seaU - 3, 0.0, qc, false);
      P(seaU - 0.35, 0.0, qc, false);
      P(seaU - 0.35, 0.0, QUAY_EDGE, false);
      P(seaU, 0.0, QUAY_EDGE, false);
      P(seaU, 0.0, QUAY_DARK, false);
      P(seaU, SEA_Y - 0.6, QUAY_DARK, false);
    } else for (let i = 0; i < 6; i++) pts.push({ u: s * lastU, y: lastY, c: gc.clone() });
  }
  return pts;
}

// Road surface cross-section from −hw to +hw with tyre-track tint (or ruts).
const LANE_F = [0, 0.16, 0.26, 0.36, 0.64, 0.74, 0.84];
const LANE_D = [1.0, 1.0, 0.86, 1.0, 1.0, 0.86, 1.0];
const RUT_D = [1.06, 1.0, 0.72, 1.0, 1.0, 0.72, 1.0];
function roadProfile(info, z, n) {
  const t = info.track;
  const hw = t.halfWidth(z);
  const lw = (2 * hw) / n;
  const base = info.color(z, 'road', new THREE.Color());
  const rt = info.roadType(z);
  const D = rt === 'dirt' ? RUT_D : LANE_D;
  const pts = [];
  const cx = t.centerX(z);
  const worn = info.vis(z, 'worn');
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < LANE_F.length; k++) {
      const u = -hw + (i + LANE_F[k]) * lw;
      const c = base.clone().multiplyScalar(D[k] * (1 + vhash(cx - u, z) * (0.06 + worn * 0.05)));
      pts.push({ u, c });
    }
  }
  pts.push({ u: hw, c: base.clone().multiplyScalar(0.94) });
  pts[0].c.multiplyScalar(0.94);
  if (worn > 0.5 && rt !== 'dirt') {
    // patched asphalt: darker repair blocks along the lanes
    const pz = Math.floor(z / 7);
    for (const p of pts) if (hash2(Math.floor((p.u + 20) / 2.4), pz, 77) > 0.86) p.c.multiplyScalar(0.84);
  }
  return pts;
}

function stripQuads(batch, t, za, zb, A, B, ya = null, yb = null, face = UP) {
  const xa = t.centerX(za), xb = t.centerX(zb);
  const n = Math.min(A.length, B.length);
  for (let i = 0; i < n - 1; i++) {
    const a0 = A[i], a1 = A[i + 1], b0 = B[i], b1 = B[i + 1];
    if (Math.abs(a1.u - a0.u) + Math.abs((a1.y ?? 0) - (a0.y ?? 0)) < 1e-4 && Math.abs(b1.u - b0.u) + Math.abs((b1.y ?? 0) - (b0.y ?? 0)) < 1e-4) continue;
    _p.set(xa - a0.u, ya ?? a0.y, za);
    _q.set(xa - a1.u, ya ?? a1.y, za);
    _r.set(xb - b1.u, yb ?? b1.y, zb);
    _s.set(xb - b0.u, yb ?? b0.y, zb);
    let f = face;
    if (Math.abs(a1.u - a0.u) < 0.02) f = new THREE.Vector3((a0.u > 0 ? 1 : -1) * ((a1.y ?? 0) > (a0.y ?? 0) ? 1 : -1), 0.05, 0);
    batch.quad(_p, _q, _r, _s, a0.c, a1.c, b1.c, b0.c, f);
  }
}

// a thin quad following the road between za..zb at lateral u (width w)
function roadLine(batch, info, za, zb, u, w, color, lift = 0.012) {
  const t = info.track;
  const steps = Math.max(1, Math.ceil((zb - za) / 2));
  for (let i = 0; i < steps; i++) {
    const z0 = za + ((zb - za) * i) / steps, z1 = za + ((zb - za) * (i + 1)) / steps;
    const zm = (z0 + z1) / 2;
    const y0 = info.surfaceAt(z0, zm) + lift, y1 = info.surfaceAt(z1, zm) + lift;
    const x0 = t.centerX(z0), x1 = t.centerX(z1);
    batch.quadXYZ(x0 - u + w / 2, y0, z0, x0 - u - w / 2, y0, z0, x1 - u - w / 2, y1, z1, x1 - u + w / 2, y1, z1, color);
  }
}

function dashed(batch, info, za, zb, u, w, color, period = 9, len = 3, phase = 0) {
  const k0 = Math.floor((za - phase) / period) - 1;
  for (let k = k0; ; k++) {
    const d0 = k * period + phase, d1 = d0 + len;
    if (d0 >= zb) break;
    const a = Math.max(za, d0), b = Math.min(zb, d1);
    if (b > a + 0.05) roadLine(batch, info, a, b, u, w, color);
  }
}

function boxAt(batch, x, y, z, w, h, l, yaw, color) { batch.box(x, y + h / 2, z, w, h, l, yaw, color); }

// ── main chunk builder ──────────────────────────────────────────────────────
export function buildRoadChunk(info, z0, z1, B) {
  _profCache = new Map();
  try { buildRoadChunkInner(info, z0, z1, B); } finally { _profCache = null; }
}
function buildRoadChunkInner(info, z0, z1, B) {
  const t = info.track;
  const zs = [];
  for (let z = z0; z < z1 - 1e-6; z += ROW) zs.push(z);
  zs.push(z1);
  for (const b of info.breaks) if (b > z0 + 0.05 && b < z1 - 0.05 && !zs.some((v) => Math.abs(v - b) < 0.05)) zs.push(b);
  zs.sort((a, b) => a - b);
  const br = info.bridge;

  const lineC = new THREE.Color();
  for (let i = 0; i < zs.length - 1; i++) {
    const za = zs[i], zb = zs[i + 1], zm = (za + zb) / 2;
    if (info.inGap(zm)) { buildGapSegment(info, za, zb, B); continue; }
    if (info.inChannel(zm)) { buildChannelSegment(info, za, zb, B); continue; }
    const gap = info.roadGap(zm);
    if (gap && gap.kind === 'river') { buildRiverSegment(info, za, zb, B); continue; }
    const n = t.lanesAt(zm);
    const rt = info.roadType(zm);
    // road surface (skipped under the drawbridge model's own deck)
    const ya = info.surfaceAt(za, zm), yb = info.surfaceAt(zb, zm);
    if (!gap) {
      const RA = roadProfile(info, za, n), RB = roadProfile(info, zb, n);
      stripQuads(rt === 'cobble' ? B.cobble : B.ground, t, za, zb, RA, RB, ya, yb);
    }
    const elevated = ya > 0.05 || yb > 0.05;
    // sides
    for (const s of [1, -1]) {
      const SA = sideProfile(info, za, s), SB = sideProfile(info, zb, s);
      stripQuads(B.ground, t, za, zb, SA, SB);
      const fa = info.flatAt(za, s), fm = info.flatAt(zm, s);
      if (!!fa !== !!fm) capProfile(B.ground, info, za, s, fm ? 1 : -1);
      const fb = info.flatAt(zb, s);
      if (!!fb !== !!fm) capProfile(B.ground, info, zb, s, fm ? -1 : 1);
      // the sea beyond the quay
      if (info.sea && info.sea.side === s) {
        const ua = info.seaU(za), ub = info.seaU(zb);
        if (ua < 1e5 && ub < 1e5) seaStrip(B, info, za, zb, s, ua, ub, 760);
      }
    }
    if (elevated) buildDeckSegment(info, za, zb, ya, yb, B);
    if (gap) continue;

    // markings
    const hw = t.halfWidth(zm);
    info.color(zm, 'line', lineC);
    if (rt === 'dirt') continue;
    if (rt === 'freeway' && n >= 6) {
      const lw = (2 * hw) / n;
      for (const s of [1, -1]) {
        roadLine(B.marks, info, za, zb, s * 0.55, 0.14, YELLOW_LINE);
        for (let k = 1; k < n / 2; k++) dashed(B.marks, info, za, zb, s * k * lw, 0.14, WHITE_LINE, 12, 3, 2);
      }
    } else if (n >= 4) {
      roadLine(B.marks, info, za, zb, 0.13, 0.12, lineC);
      roadLine(B.marks, info, za, zb, -0.13, 0.12, lineC);
      const lw = (2 * hw) / n;
      for (let k = 1; k < n; k++) {
        const u = -hw + k * lw;
        if (Math.abs(u) < 0.5) continue;
        dashed(B.marks, info, za, zb, u, 0.13, WHITE_LINE, 9, 3, 1.5);
      }
    } else if (rt === 'rural') {
      dashed(B.marks, info, za, zb, 0, 0.14, lineC, 12, 4, 0);
    } else {
      dashed(B.marks, info, za, zb, 0, 0.15, lineC, 9, 3.2, 0);
    }
    // edge lines (rural: broken / faded)
    for (const s of [1, -1]) {
      const fl = info.flatAt(zm, s);
      if (fl && fl.kind !== 'sell') continue;
      if (rt === 'cobble') continue;
      if (rt === 'rural') { if (hash2(Math.floor(zm / 6), s, 5) > 0.3) roadLine(B.marks, info, za, zb, s * (hw - 0.25), 0.12, WHITE_LINE.clone().multiplyScalar(0.82)); continue; }
      roadLine(B.marks, info, za, zb, s * (hw - 0.3), 0.15, WHITE_LINE);
    }
    // tram tracks in the forward lane
    if (rt === 'cobble' && info.biome(zm).road && info.biome(zm).road.tramTracks) {
      const lu = t.laneU(zm, Math.floor(n / 2));
      for (const d of [-0.7175, 0.7175]) {
        roadLine(B.marks, info, za, zb, lu + d, 0.09, RAIL_TOP, 0.016);
        roadLine(B.marks, info, za, zb, lu + d + Math.sign(d) * -0.07, 0.05, GROOVE, 0.015);
      }
    }
  }

  // ── specials inside this chunk ──
  for (const it of info.intersections) if (it.z >= z0 && it.z < z1) buildIntersection(info, it, B);
  for (const st of info.stops) if (st.z >= z0 && st.z < z1) buildLot(info, st, B);
  if (info.train && info.train.z >= z0 && info.train.z < z1) buildRails(info, info.train.z, B);
  if (info.sell && info.sell.z >= z0 && info.sell.z < z1) buildSellLot(info, B);
  if (info.garage && info.garage.z >= z0 && info.garage.z < z1) buildDriveway(info, B);
  if (info.toll && info.toll.z >= z0 && info.toll.z < z1) buildPlazaApron(info, B);
  for (const o of info.overpasses) if (o.z >= z0 && o.z < z1) buildCrossRoad(info, o.z, B);
  if (info.drawbridge) {
    const d = info.drawbridge;
    for (const e of [-1, 1]) { const zw = d.zc + e * d.half; if (zw >= z0 && zw < z1) buildQuayWall(info, zw, -e, B); }
    if (d.zc >= z0 && d.zc < z1) buildChannelEnd(info, B);
  }
  if (br) {
    if (br.lip >= z0 && br.lip < z1) buildLipBreak(info, B);
    if (br.gapEnd >= z0 && br.gapEnd < z1) buildLandingEdge(info, B);
    if (br.gapStart >= z0 && br.gapStart < z1) buildGapWall(info, br.gapStart, +1, B);
    if (br.gapEnd >= z0 && br.gapEnd < z1) buildGapWall(info, br.gapEnd, -1, B);
    if (br.gapStart + 20 >= z0 && br.gapStart + 20 < z1) buildCanyonDebris(info, B);
  }
}

// vertical cap at z for a raised sidewalk that ends; dir = which way the cap faces (±z)
function capProfile(batch, info, z, s, dir) {
  const t = info.track;
  const hw = t.halfWidth(z), sh = t.shoulder(z), sw = info.sidewalk(z);
  if (sw < 0.05 || info.roadType(z) === 'dirt') return;
  const h = 0.16 * sw;
  const x = t.centerX(z);
  const u0 = hw + sh, u1 = hw + sh + 0.2 + 3.2 * sw;
  batch.quadXYZ(x - s * u0, -0.02, z, x - s * u1, -0.02, z, x - s * u1, h, z, x - s * u0, h, z, CURB, CURB, CURB, CURB, dir > 0 ? FACE.pz : FACE.nz);
}

// ── water ───────────────────────────────────────────────────────────────────
function seaStrip(B, info, za, zb, s, ua, ub, uEnd) {
  const t = info.track;
  const xa = t.centerX(za), xb = t.centerX(zb);
  const cols = [0, 6, 20, 60, 200, uEnd];
  for (let i = 0; i < cols.length - 1; i++) {
    const a0 = ua + cols[i], a1 = Math.max(ua + cols[i + 1], uEnd), b0 = ub + cols[i], b1 = Math.max(ub + cols[i + 1], uEnd);
    const c0 = SEA_NEAR.clone().lerp(SEA, Math.min(1, cols[i] / 40)), c1 = SEA_NEAR.clone().lerp(SEA, Math.min(1, cols[i + 1] / 40));
    const ea = Math.min(a1, ua + cols[i + 1]), eb = Math.min(b1, ub + cols[i + 1]);
    if (ea <= a0 + 0.01) continue;
    B.water.quadXYZ(xa - s * a0, SEA_Y, za, xa - s * ea, SEA_Y, za, xb - s * eb, SEA_Y, zb, xb - s * b0, SEA_Y, zb, c0, c1, c1, c0, UP);
  }
}

// drawbridge channel: water right across, from the sea out to the channel end on the land side
function buildChannelSegment(info, za, zb, B) {
  const t = info.track, d = info.drawbridge;
  const ss = info.sea ? info.sea.side : -1;
  const xa = t.centerX(za), xb = t.centerX(zb);
  const us = [ss * 760, ss * 200, ss * 60, 0, -ss * 60, -ss * d.chanEnd];
  const c = SEA_NEAR.clone().lerp(SEA, 0.45);
  for (let i = 0; i < us.length - 1; i++) {
    const u0 = us[i], u1 = us[i + 1];
    B.water.quadXYZ(xa - u0, SEA_Y, za, xa - u1, SEA_Y, za, xb - u1, SEA_Y, zb, xb - u0, SEA_Y, zb, c, c, c, c, UP);
  }
  // mud bed under the water so the quay walls have a bottom
  const mud = MUD.clone().multiplyScalar(0.6);
  const ua = ss * 760, ub = -ss * d.chanEnd;
  B.ground.quadXYZ(xa - ua, SEA_Y - 4, za, xa - ub, SEA_Y - 4, za, xb - ub, SEA_Y - 4, zb, xb - ua, SEA_Y - 4, zb, mud, mud, mud, mud, UP);
  // the land side beyond the channel end keeps its ground profile
  const s = -ss;
  const SA = sideProfile(info, za, s).filter((p) => Math.abs(p.u) > d.chanEnd + 0.5);
  const SB = sideProfile(info, zb, s).filter((p) => Math.abs(p.u) > d.chanEnd + 0.5);
  const n = Math.min(SA.length, SB.length);
  if (n > 0) {
    const A = [{ u: s * d.chanEnd, y: 0, c: QUAY }, ...SA.slice(0, n)], Bp = [{ u: s * d.chanEnd, y: 0, c: QUAY }, ...SB.slice(0, n)];
    stripQuads(B.ground, t, za, zb, A, Bp);
  }
}

// quay wall across the road line at the channel edge zw, facing `dir` (±z toward the water)
function buildQuayWall(info, zw, dir, B) {
  const t = info.track, d = info.drawbridge;
  const ss = info.sea ? info.sea.side : -1;
  const x = t.centerX(zw);
  const uSea = Math.min(info.seaU(zw), 700);
  const u0 = ss * uSea, u1 = -ss * d.chanEnd;     // signed
  const segs = 24;
  const face = dir > 0 ? FACE.pz : FACE.nz;
  for (let i = 0; i < segs; i++) {
    const a = u0 + (u1 - u0) * i / segs, b = u0 + (u1 - u0) * (i + 1) / segs;
    const c = QUAY_DARK.clone().multiplyScalar(1 + vhash(a, zw) * 0.1);
    B.ground.quadXYZ(x - a, 0.0, zw, x - b, 0.0, zw, x - b, SEA_Y - 4, zw, x - a, SEA_Y - 4, zw, c, c, c, c, face);
    // yellow coping line on the edge
    B.marks.quadXYZ(x - a, 0.012, zw - dir * 0.35, x - b, 0.012, zw - dir * 0.35, x - b, 0.012, zw, x - a, 0.012, zw, QUAY_EDGE);
  }
  // bollards along the channel edge (skip the bridge piers)
  for (let u = Math.min(u0, u1) + 4; u < Math.max(u0, u1) - 2; u += 9) {
    if (Math.abs(u) < 10) continue;
    boxAt(B.props, x - u, 0, zw - dir * 0.8, 0.45, 0.6, 0.45, 0, QUAY_DARK);
  }
}
function buildChannelEnd(info, B) {
  const t = info.track, d = info.drawbridge;
  const ss = info.sea ? info.sea.side : -1;
  const s = -ss;
  const za = d.zc - d.half, zb = d.zc + d.half;
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    const z0 = za + (zb - za) * i / steps, z1 = za + (zb - za) * (i + 1) / steps;
    const x0 = t.centerX(z0) - s * d.chanEnd, x1 = t.centerX(z1) - s * d.chanEnd;
    B.ground.quadXYZ(x0, 0, z0, x1, 0, z1, x1, SEA_Y - 4, z1, x0, SEA_Y - 4, z0, QUAY_DARK, QUAY_DARK, QUAY_DARK, QUAY_DARK, s > 0 ? FACE.px : FACE.nx);
  }
}

// river crossing under the covered bridge: bed + banks + water across the road strip
function riverBedY(dz) {
  const a = Math.abs(dz);
  if (a <= 8) return RIVER_Y - 0.55;
  if (a >= 14) return -0.02;
  return RIVER_Y - 0.55 + (a - 8) / 6 * (-0.02 - (RIVER_Y - 0.55));
}
function buildRiverSegment(info, za, zb, B) {
  const t = info.track, r = info.river;
  const xa = t.centerX(za), xb = t.centerX(zb);
  const W = info.corridor((za + zb) / 2) + 1.5;
  const ya = riverBedY(za - r.zc), yb = riverBedY(zb - r.zc);
  const ca = (ya < RIVER_Y ? MUD : BANK.clone().multiplyScalar(0.8)).clone(), cb = (yb < RIVER_Y ? MUD : BANK.clone().multiplyScalar(0.8)).clone();
  B.ground.quadXYZ(xa + W, ya, za, xa - W, ya, za, xb - W, yb, zb, xb + W, yb, zb, ca, ca, cb, cb, UP);
  if (Math.min(ya, yb) < RIVER_Y) {
    const c = RIVER.clone().lerp(RIVER_DEEP, 0.4);
    B.water.quadXYZ(xa + W, RIVER_Y, za, xa - W, RIVER_Y, za, xb - W, RIVER_Y, zb, xb + W, RIVER_Y, zb, c, c, c, c, UP);
  }
  // far ground keeps going beyond the river tiles (near part sunk under the bed)
  for (const s of [1, -1]) stripQuads(B.ground, t, za, zb, sideProfile(info, za, s, { low: true }), sideProfile(info, zb, s, { low: true }));
}
// ── bridge ramp deck sides, parapets, pillars ──────────────────────────────
function buildDeckSegment(info, za, zb, ya, yb, B) {
  const t = info.track;
  const hwA = t.halfWidth(za), hwB = t.halfWidth(zb);
  const xa = t.centerX(za), xb = t.centerX(zb);
  const th = 0.9;
  for (const s of [1, -1]) {
    const ua = s * (hwA + 0.45), ub = s * (hwB + 0.45);
    const ba = Math.max(-0.03, ya - th), bb = Math.max(-0.03, yb - th);
    const f = s > 0 ? FACE.nx : FACE.px;
    B.ground.quadXYZ(xa - ua, ya + 0.9, za, xb - ub, yb + 0.9, zb, xb - ub, bb, zb, xa - ua, ba, za, CONCRETE_DARK, CONCRETE_DARK, CONCRETE_DARK, CONCRETE_DARK, f);
    const ia = s * (hwA + 0.05), ib = s * (hwB + 0.05);
    B.ground.quadXYZ(xa - ia, ya, za, xb - ib, yb, zb, xb - ib, yb + 0.9, zb, xa - ia, ya + 0.9, za, CONCRETE, CONCRETE, CONCRETE, CONCRETE, s > 0 ? FACE.px : FACE.nx);
    B.ground.quadXYZ(xa - ia, ya + 0.9, za, xb - ib, yb + 0.9, zb, xb - ub, yb + 0.9, zb, xa - ua, ya + 0.9, za, CONCRETE, CONCRETE, CONCRETE, CONCRETE, UP);
    B.ground.quadXYZ(xa - s * hwA, ya, za, xb - s * hwB, yb, zb, xb - ib, yb, zb, xa - ia, ya, za, CONCRETE, CONCRETE, CONCRETE, CONCRETE, UP);
    const zm = (za + zb) / 2;
    if (Math.floor(zm / 2) % 2 === 0) {
      const c = STRIPE_RED;
      B.ground.quadXYZ(xa - ua * 1.002, ya + 0.85, za, xb - ub * 1.002, yb + 0.85, zb, xb - ub * 1.002, yb + 0.45, zb, xa - ua * 1.002, ya + 0.45, za, c, c, c, c, f);
    }
  }
  B.ground.quadXYZ(xa - hwA - 0.45, Math.max(-0.02, ya - th), za, xa + hwA + 0.45, Math.max(-0.02, ya - th), za, xb + hwB + 0.45, Math.max(-0.02, yb - th), zb, xb - hwB - 0.45, Math.max(-0.02, yb - th), zb, CONCRETE_DARK, CONCRETE_DARK, CONCRETE_DARK, CONCRETE_DARK, new THREE.Vector3(0, -1, 0));
  const ga = -0.03;
  B.ground.quadXYZ(xa - hwA, ga, za, xa + hwA, ga, za, xb + hwB, ga, zb, xb - hwB, ga, zb, GRAVEL, GRAVEL, GRAVEL, GRAVEL, UP);
  const br = info.bridge;
  for (let pz = br.rampStart + 12.5; pz < br.lip - 1; pz += 12.5) {
    if (pz >= za && pz < zb) {
      const h = t.surfaceY(pz) - th;
      if (h < 0.5) continue;
      const x = t.centerX(pz), hw = t.halfWidth(pz);
      for (const s of [1, -1]) boxAt(B.props, x - s * (hw - 1.2), -0.05, pz, 1.4, h + 0.05, 1.4, 0, CONCRETE);
      boxAt(B.props, x, h - 0.6, pz, 2 * hw + 0.6, 0.6, 1.6, 0, CONCRETE_DARK);
    }
  }
}

function buildLipBreak(info, B) {
  const t = info.track, br = info.bridge;
  const z = br.lip, y = br.rampHeight, x = t.centerX(z), hw = t.halfWidth(z);
  const th = 0.9;
  B.ground.quadXYZ(x - hw - 0.45, y + 0.9, z, x + hw + 0.45, y + 0.9, z, x + hw + 0.45, y - th, z, x - hw - 0.45, y - th, z, CONCRETE_DARK, CONCRETE_DARK, CONCRETE_DARK, CONCRETE_DARK, FACE.pz);
  let k = 0;
  for (let u = -hw; u <= hw; u += 0.9) {
    k++;
    const l = 0.3 + ((k * 37) % 7) * 0.12;
    boxAt(B.props, x - u, y - th + 0.1, z + l / 2 - 0.05, 0.8, th - 0.15 - ((k * 13) % 5) * 0.08, l, 0, CONCRETE);
    if (k % 2 === 0) B.props.box(x - u + 0.2, y - 0.6 - (k % 3) * 0.2, z + 0.8, 0.07, 0.07, 1.8, (k % 5 - 2) * 0.1, REBAR);
  }
}

function buildLandingEdge(info, B) {
  const t = info.track, br = info.bridge;
  const z = br.gapEnd, x = t.centerX(z), hw = t.halfWidth(z);
  B.ground.quadXYZ(x + hw + 0.4, 0.0, z, x - hw - 0.4, 0.0, z, x - hw - 0.4, -1.2, z, x + hw + 0.4, -1.2, z, CONCRETE_DARK, CONCRETE_DARK, CONCRETE_DARK, CONCRETE_DARK, FACE.nz);
  for (let u = -hw; u <= hw; u += 1.1) B.props.box(x - u, -0.6, z - 0.25, 1.0, 1.1, 0.5, 0, CONCRETE);
  for (const s of [1, -1]) {
    for (let zz = z; zz < Math.min(br.landingEnd, z + 26); zz += 2) {
      const xa = t.centerX(zz), xb = t.centerX(zz + 2), ha = t.halfWidth(zz) + 0.3, hb = t.halfWidth(zz + 2) + 0.3;
      const f = s > 0 ? FACE.px : FACE.nx;
      B.ground.quadXYZ(xa - s * ha, 0, zz, xb - s * hb, 0, zz + 2, xb - s * hb, 0.9, zz + 2, xa - s * ha, 0.9, zz, CONCRETE, CONCRETE, CONCRETE, CONCRETE, f);
      B.ground.quadXYZ(xa - s * ha, 0.9, zz, xb - s * hb, 0.9, zz + 2, xb - s * (hb + 0.4), 0.9, zz + 2, xa - s * (ha + 0.4), 0.9, zz, CONCRETE, CONCRETE, CONCRETE, CONCRETE, UP);
      B.ground.quadXYZ(xa - s * (ha + 0.4), 0.9, zz, xb - s * (hb + 0.4), 0.9, zz + 2, xb - s * (hb + 0.4), -0.05, zz + 2, xa - s * (ha + 0.4), -0.05, zz, CONCRETE_DARK, CONCRETE_DARK, CONCRETE_DARK, CONCRETE_DARK, s > 0 ? FACE.nx : FACE.px);
    }
  }
}

function crossSection(info, z) {
  const L = sideProfile(info, z, -1).reverse();
  const R = sideProfile(info, z, 1);
  const t = info.track, hw = t.halfWidth(z);
  const road = info.color(z, 'road', new THREE.Color());
  const mid = [{ u: -hw * 0.5, y: -0.03, c: road }, { u: 0, y: -0.03, c: road }, { u: hw * 0.5, y: -0.03, c: road }];
  return [...L, ...mid, ...R].sort((a, b) => a.u - b.u);
}

function buildGapWall(info, z, dir, B) {
  const t = info.track, br = info.bridge;
  const top = crossSection(info, z - dir * 0.05);
  const depth = br.canyonDepth || 60;
  const x0 = t.centerX(z);
  const levels = 6;
  const cA = new THREE.Color(), cB = new THREE.Color(), cC = new THREE.Color(), cD = new THREE.Color();
  const face = dir > 0 ? FACE.pz : FACE.nz;
  const pt = (col, k) => {
    const f = k / levels;
    const y = col.y + (-depth - col.y) * f;
    const jit = k === 0 ? 0 : (vnoise(col.u * 0.15, k * 1.7 + (dir > 0 ? 0 : 50), 21) - 0.35) * 3.2 * Math.sin(f * Math.PI);
    return new THREE.Vector3(x0 - col.u, y, z + dir * jit);
  };
  const strata = (y, u, out) => {
    out.copy(info.color(z, 'ground', out));
    const band = Math.sin(y * 0.6 + vnoise(u * 0.05, y * 0.1, 22) * 2.0);
    if (band > 0.3) out.lerp(STRATA_DARK, 0.5); else if (band < -0.5) out.lerp(STRATA_LIGHT, 0.45);
    const d = clamp((-y) / depth, 0, 1);
    out.multiplyScalar(1 - d * 0.55);
    return out;
  };
  for (let i = 0; i < top.length - 1; i++) {
    const a = top[i], b = top[i + 1];
    if (Math.abs(b.u - a.u) < 0.01) continue;
    for (let k = 0; k < levels; k++) {
      const p0 = pt(a, k), p1 = pt(b, k), p2 = pt(b, k + 1), p3 = pt(a, k + 1);
      B.ground.quad(p0, p1, p2, p3, strata(p0.y, a.u, cA), strata(p1.y, b.u, cB), strata(p2.y, b.u, cC), strata(p3.y, a.u, cD), face);
    }
  }
}

function buildGapSegment(info, za, zb, B) {
  const t = info.track, br = info.bridge;
  const depth = br.canyonDepth || 60;
  const y = -depth;
  const cols = [-700, -260, -150, -80, -40, -20, -8, 0, 8, 20, 40, 80, 150, 260, 700];
  const mid = (br.gapStart + br.gapEnd) / 2, rw = (br.gapEnd - br.gapStart) * 0.22;
  const ca = new THREE.Color(), cb = new THREE.Color();
  const colAt = (z, out) => {
    const d = Math.abs(z - mid);
    if (d < rw) return out.copy(d < rw * 0.5 ? RIVER_DEEP : RIVER);
    return out.copy(BANK).multiplyScalar(0.62);
  };
  const zsplit = [za, zb, mid - rw, mid + rw, mid - rw * 0.5, mid + rw * 0.5].filter((v) => v >= za && v <= zb).sort((a, b) => a - b);
  for (let k = 0; k < zsplit.length - 1; k++) {
    const z0 = zsplit[k], z1 = zsplit[k + 1];
    if (z1 - z0 < 0.01) continue;
    const zm = (z0 + z1) / 2;
    const river = Math.abs(zm - mid) < rw;
    colAt(zm, ca); cb.copy(ca);
    const yy = river ? y + 0.4 : y + 0.6;
    for (let i = 0; i < cols.length - 1; i++) {
      const xa0 = t.centerX(z0) - cols[i], xa1 = t.centerX(z0) - cols[i + 1];
      const xb0 = t.centerX(z1) - cols[i], xb1 = t.centerX(z1) - cols[i + 1];
      B.ground.quadXYZ(xa0, yy, z0, xa1, yy, z0, xb1, yy, z1, xb0, yy, z1, ca, ca, cb, cb, UP);
    }
  }
}

function buildCanyonDebris(info, B) {
  const t = info.track, br = info.bridge;
  const depth = br.canyonDepth || 60;
  const zc = (br.gapStart + br.gapEnd) / 2;
  const x = t.centerX(zc);
  for (const s of [1, -1]) boxAt(B.props, x - s * 3.5, -depth, zc - 6, 1.8, depth - 22 + s * 5, 1.8, 0.05 * s, CONCRETE);
  B.props.box(x + 2, -depth + 1.2, zc + 7, 9, 1.0, 14, 0.4, CONCRETE_DARK);
  for (let i = 0; i < 7; i++) {
    const r = 1 + (i % 3);
    B.props.box(x - 25 + i * 9, -depth + 0.6 + r * 0.3, zc + ((i * 7) % 11) - 5, r * 1.6, r, r * 1.3, i, new THREE.Color('#8e5a3e'));
  }
}

// ── intersections, lots, rails, sell lot, structures ────────────────────────
function buildIntersection(info, it, B) {
  const t = info.track;
  const za = it.z - it.W / 2, zb = it.z + it.W / 2;
  const road = info.color(it.z, 'road', new THREE.Color());
  const rc = road.clone().multiplyScalar(1.04);
  const rt = info.roadType(it.z);
  for (const s of [1, -1]) {
    const hwA = t.halfWidth(za), hwB = t.halfWidth(zb);
    const xa = t.centerX(za), xb = t.centerX(zb), xm = t.centerX(it.z);
    const steps = 6;
    for (let k = 0; k < steps; k++) {
      const u0 = hwA + ((it.len - hwA) * k) / steps, u1 = hwA + ((it.len - hwA) * (k + 1)) / steps;
      const v0 = hwB + ((it.len - hwB) * k) / steps, v1 = hwB + ((it.len - hwB) * (k + 1)) / steps;
      const ex0 = k === 0 ? xa : xm, ex1 = k === 0 ? xb : xm;
      (rt === 'cobble' ? B.cobbleDecal || B.decal : B.decal).quadXYZ(ex0 - s * u0, 0.004, za, xm - s * u1, 0.004, za, xm - s * v1, 0.004, zb, ex1 - s * v0, 0.004, zb, rc, rc, rc, rc, UP);
    }
    for (let u = t.halfWidth(it.z) + 6; u < it.len - 2; u += 6) B.marks.quadXYZ(xm - s * u, 0.016, it.z - 0.07, xm - s * (u + 2.5), 0.016, it.z - 0.07, xm - s * (u + 2.5), 0.016, it.z + 0.07, xm - s * u, 0.016, it.z + 0.07, info.color(it.z, 'line', new THREE.Color()));
    for (const e of [-1, 1]) {
      const zz = it.z + e * (it.W / 2 + 1.6);
      const sw = info.sidewalk(it.z);
      if (sw < 0.3) continue;
      const u0 = t.halfWidth(it.z) + t.shoulder(it.z) + 3.4, u1 = it.len;
      B.ground.box(xm - s * (u0 + u1) / 2, 0.08, zz, u1 - u0, 0.16, 3.2, 0, info.color(it.z, 'roadside', new THREE.Color()));
    }
  }
  const hw = t.halfWidth(it.z);
  for (const e of [-1, 1]) {
    const zc = it.z + e * (it.W / 2 + 2.2);
    for (let u = -hw + 0.7; u < hw - 0.5; u += 1.15) roadLineQuad(B.marks, info, zc - 1.6, zc + 1.6, u, 0.6, ZEBRA);
    roadLineQuad(B.marks, info, zc + e * 2.1 - 0.2, zc + e * 2.1 + 0.2, e < 0 ? hw / 2 : -hw / 2, hw, WHITE_LINE);
  }
}
function roadLineQuad(batch, info, za, zb, u, w, color) { roadLine(batch, info, za, zb, u, w, color, 0.014); }

// lot apron between the road edge and the store model's front edge (+ entry arrows)
function buildLot(info, st, B) {
  const t = info.track;
  const s = st.side;
  const fp = STORE_FP[st.model] || STORE_FP.default;
  const hw = t.halfWidth(st.z), sh = t.shoulder(st.z);
  const u0 = hw + 0.05, u1 = hw + sh + 3.6 * info.sidewalk(st.z) + 0.6;
  const zA = st.z - fp.w / 2, zB = st.z + fp.w / 2;
  const steps = 8;
  for (let k = 0; k < steps; k++) {
    const za = zA + ((zB - zA) * k) / steps, zb = zA + ((zB - zA) * (k + 1)) / steps;
    const xa = t.centerX(za), xb = t.centerX(zb);
    const c1 = LOT.clone().multiplyScalar(1 + vhash(xa, za) * 0.1), c2 = LOT.clone().multiplyScalar(1 + vhash(xb, zb) * 0.1);
    B.decal.quadXYZ(xa - s * u0, 0.008, za, xa - s * u1, 0.008, za, xb - s * u1, 0.008, zb, xb - s * u0, 0.008, zb, c1, c1, c2, c2, UP);
  }
  // in / out arrows on the apron (pointing along +Z into the lot)
  for (const zz of [zA + 4, zB - 4]) {
    const x = t.centerX(zz), u = s * (hw + sh * 0.5 + 0.4);
    const head = zz < st.z ? 1 : -1;
    B.marks.quadXYZ(x - u + 0.12, 0.02, zz - 1.4 * head, x - u - 0.12, 0.02, zz - 1.4 * head, x - u - 0.12, 0.02, zz + 0.3 * head, x - u + 0.12, 0.02, zz + 0.3 * head, LOT_LINE);
    B.marks.tri(new THREE.Vector3(x - u + 0.5, 0.02, zz + 0.3 * head), new THREE.Vector3(x - u - 0.5, 0.02, zz + 0.3 * head), new THREE.Vector3(x - u, 0.02, zz + 1.2 * head), LOT_LINE, LOT_LINE, LOT_LINE);
  }
}

function buildSellLot(info, B) {
  const t = info.track, sp = info.sell;
  const s = sp.side;
  const z0 = info.sellLot.z0, z1 = info.sellLot.z1;
  const hw = t.halfWidth(sp.z) + t.shoulder(sp.z);
  const dirt = new THREE.Color('#b8a183');
  for (let z = z0; z < z1 - 0.01; z += 4) {
    const za = z, zb = Math.min(z1, z + 4);
    const xa = t.centerX(za), xb = t.centerX(zb);
    const c1 = dirt.clone().multiplyScalar(1 + vhash(xa, za) * 0.16), c2 = dirt.clone().multiplyScalar(1 + vhash(xb, zb) * 0.16);
    B.decal.quadXYZ(xa - s * (hw - 0.5), 0.01, za, xa - s * 70, 0.01, za, xb - s * 70, 0.01, zb, xb - s * (hw - 0.5), 0.01, zb, c1, c1, c2, c2, UP);
  }
  for (let row = 0; row < 3; row++) {
    const u = hw + 14 + row * 9;
    for (let z = z0 + 8; z < z1 - 6; z += 6) {
      const x = t.centerX(z) - s * u;
      boxAt(B.props, x, 0, z, 0.12, 1.1, 0.12, 0, RAIL);
      boxAt(B.props, x, 1.0, z, 0.3, 0.25, 0.2, 0, new THREE.Color('#4a4d50'));
    }
  }
}

// Rook's Garage: concrete apron from the road to the roll-up door
function buildDriveway(info, B) {
  const t = info.track, g = info.garage;
  const s = g.side || 1;
  const hw = t.halfWidth(g.z);
  const u0 = hw + 0.05, u1 = 18 - 8.6;
  const zd = info.garageDoorZ ?? g.z;
  for (let k = 0; k < 6; k++) {
    const za = zd - 4.2 + k * 1.4, zb = za + 1.4;
    const xa = t.centerX(za), xb = t.centerX(zb);
    const c = DRIVE.clone().multiplyScalar(1 + vhash(xa, za) * 0.08);
    B.decal.quadXYZ(xa - s * u0, 0.01, za, xa - s * u1, 0.01, za, xb - s * u1, 0.01, zb, xb - s * u0, 0.01, zb, c, c, c, c, UP);
  }
  // oil stains
  const x = t.centerX(g.z);
  for (const [du, dz] of [[2.2, -0.6], [3.1, 1.0]]) B.marks.quadXYZ(x - s * (u1 - du - 0.8), 0.02, zd + dz - 0.5, x - s * (u1 - du + 0.8), 0.02, zd + dz - 0.5, x - s * (u1 - du + 0.8), 0.02, zd + dz + 0.6, x - s * (u1 - du - 0.8), 0.02, zd + dz + 0.6, new THREE.Color('#5b5853'));
}

// toll plaza: concrete apron across the carriageways
function buildPlazaApron(info, B) {
  const t = info.track, z = info.toll.z;
  const W = t.halfWidth(z) + t.shoulder(z) + 0.5;
  for (let k = 0; k < 12; k++) {
    const za = z - 14 + k * (28 / 12), zb = za + 28 / 12;
    const xa = t.centerX(za), xb = t.centerX(zb);
    const c = CONCRETE.clone().multiplyScalar(0.92 + 0.06 * (k % 2));
    B.decal.quadXYZ(xa + W, 0.006, za, xa - W, 0.006, za, xb - W, 0.006, zb, xb + W, 0.006, zb, c, c, c, c, UP);
  }
}

// cross road under an overpass: asphalt from the ramp ends out into the hills
function buildCrossRoad(info, z, B) {
  const t = info.track, x = t.centerX(z);
  const road = info.color(z, 'road', new THREE.Color()).multiplyScalar(1.08);
  for (const s of [1, -1]) {
    for (let k = 0; k < 14; k++) {
      const ua = 38 + k * 22, ub = ua + 22;
      const ya = Math.max(0, info.groundY(s * ua, z)) + 0.02, yb = Math.max(0, info.groundY(s * ub, z)) + 0.02;
      B.decal.quadXYZ(x - s * ua, ya, z - 4.6, x - s * ub, yb, z - 4.6, x - s * ub, yb, z + 4.6, x - s * ua, ya, z + 4.6, road, road, road, road, UP);
      if (k % 1 === 0) B.marks.quadXYZ(x - s * (ua + 4), ya + 0.01, z - 0.07, x - s * (ua + 7), ya + 0.01, z - 0.07, x - s * (ua + 7), ya + 0.01, z + 0.07, x - s * (ua + 4), ya + 0.01, z + 0.07, YELLOW_LINE);
    }
  }
}

function buildRails(info, zr, B) {
  const t = info.track;
  const xc = t.centerX(zr), hw = t.halfWidth(zr);
  const cols = [];
  for (let u = -260; u <= 260; u += 10) cols.push(u);
  const gy = (u) => (Math.abs(u) < hw + 0.2 ? 0.0 : Math.max(-0.03, info.groundY(u, zr)));
  for (let i = 0; i < cols.length - 1; i++) {
    const ua = cols[i], ub = cols[i + 1];
    const g1 = GRAVEL.clone().multiplyScalar(1 + vhash(ua, zr) * 0.1);
    B.decal.quadXYZ(xc - ua, gy(ua) + 0.06, zr - 2.2, xc - ub, gy(ub) + 0.06, zr - 2.2, xc - ub, gy(ub) + 0.06, zr + 2.2, xc - ua, gy(ua) + 0.06, zr + 2.2, g1, g1, g1, g1, UP);
  }
  for (let u = -150; u <= 150; u += 0.75) {
    if (Math.abs(u) < hw + 0.4) continue;
    boxAt(B.props, xc - u, gy(u) + 0.04, zr, 0.24, 0.14, 2.7, 0, SLEEPER);
  }
  for (const dz of [-0.75, 0.75]) {
    for (let i = 0; i < cols.length - 1; i++) {
      const ua = cols[i], ub = cols[i + 1];
      if (Math.abs(ua) < 30 && Math.abs(ub) < 30) continue;
      const ya = gy(ua) + 0.2, yb = gy(ub) + 0.2;
      B.props.quadXYZ(xc - ua, ya, zr + dz - 0.06, xc - ub, yb, zr + dz - 0.06, xc - ub, yb, zr + dz + 0.06, xc - ua, ya, zr + dz + 0.06, RAIL);
      B.props.quadXYZ(xc - ua, ya, zr + dz - 0.06, xc - ub, yb, zr + dz - 0.06, xc - ub, ya - 0.14, zr + dz - 0.06, xc - ua, ya - 0.14, zr + dz - 0.06, RAIL, RAIL, RAIL, RAIL, FACE.nz);
    }
    for (let u = -30; u < 30; u += 2) {
      const on = Math.abs(u + 1) < hw + 0.5;
      const ya = on ? 0.02 : gy(u) + 0.2, yb = on ? 0.02 : gy(u + 2) + 0.2;
      (on ? B.marks : B.props).quadXYZ(xc - u, ya, zr + dz - 0.07, xc - u - 2, yb, zr + dz - 0.07, xc - u - 2, yb, zr + dz + 0.07, xc - u, ya, zr + dz + 0.07, RAIL);
      if (!on) B.props.quadXYZ(xc - u, ya, zr + dz - 0.07, xc - u - 2, yb, zr + dz - 0.07, xc - u - 2, yb - 0.14, zr + dz - 0.07, xc - u, ya - 0.14, zr + dz - 0.07, RAIL, RAIL, RAIL, RAIL, FACE.nz);
    }
  }
  roadLine(B.marks, info, zr - 9.4, zr - 9.0, 0, 2 * hw - 0.6, WHITE_LINE, 0.014);
  roadLine(B.marks, info, zr + 9.0, zr + 9.4, 0, 2 * hw - 0.6, WHITE_LINE, 0.014);
  // "RR" box markings before the crossing in each direction
  for (const e of [-1, 1]) {
    const zc = zr + e * 16;
    const u = e < 0 ? hw / 2 : -hw / 2;
    roadLine(B.marks, info, zc - 2.2, zc + 2.2, u - 1.1, 0.14, WHITE_LINE, 0.014);
    roadLine(B.marks, info, zc - 2.2, zc + 2.2, u + 1.1, 0.14, WHITE_LINE, 0.014);
  }
  for (const s of [1, -1]) for (const dz of [-3.2, 3.2]) boxAt(B.props, xc - s * (hw + t.shoulder(zr) + 0.6), 0, zr + dz, 0.25, 1.0, 0.25, 0, (dz > 0) === (s > 0) ? STRIPE_RED : STRIPE_WHITE);
}

export { sstep, clamp, hash2, smooth };
