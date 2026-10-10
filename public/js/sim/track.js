// ─────────────────────────────────────────────────────────────────────────────
// Track: the road as a function of distance. Shared by the sim (physics) and the
// renderer (road mesh + scenery placement) so both always agree.
//
// Coordinates: Y up, the route runs toward +Z, X is lateral.
// IMPORTANT: facing +Z, the driver's RIGHT is -X.  We use a lateral offset `u`
// where u > 0 means driver's right:  x = centerX(z) - u.
// Two-way roads: forward traffic uses lanes with u > 0, oncoming lanes u < 0.
// ─────────────────────────────────────────────────────────────────────────────
import { mulberry32 } from './rng.js';

const smooth = (t) => t * t * (3 - 2 * t);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Track {
  constructor(route, seed = route.defaultSeed ?? 1) {
    this.route = route;
    this.biomes = route.biomes;
    this.length = route.routeLength;
    this.blendLen = route.biomeBlend ?? 80;
    this.bridge = route.bridge;
    const r = mulberry32(seed);
    // per-biome phases so each seed gives a slightly different road
    this.phases = this.biomes.map(() => [r() * Math.PI * 2, r() * Math.PI * 2]);
  }

  // ── biomes ──────────────────────────────────────────────────────────────────
  biomeIndexAt(z) {
    const b = this.biomes;
    for (let i = 0; i < b.length; i++) if (z < b[i].to) return i;
    return b.length - 1;
  }
  biomeAt(z) { return this.biomes[this.biomeIndexAt(z)]; }

  // Weights of each biome at z (smooth cross-fade of `blendLen` metres around borders).
  biomeWeights(z) {
    const w = new Array(this.biomes.length).fill(0);
    const i = this.biomeIndexAt(z);
    const half = this.blendLen / 2;
    const b = this.biomes[i];
    if (i > 0 && z < b.from + half) {
      const t = smooth(clamp((z - (b.from - half)) / this.blendLen, 0, 1));
      w[i - 1] = 1 - t; w[i] = t;
    } else if (i < this.biomes.length - 1 && z > b.to - half) {
      const t = smooth(clamp((z - (b.to - half)) / this.blendLen, 0, 1));
      w[i] = 1 - t; w[i + 1] = t;
    } else w[i] = 1;
    return w;
  }

  // Numeric biome param blended across borders (e.g. 'shoulder', 'laneWidth').
  param(z, key) {
    const w = this.biomeWeights(z);
    let v = 0;
    for (let i = 0; i < w.length; i++) if (w[i]) v += w[i] * this.biomes[i][key];
    return v;
  }

  // ── geometry ────────────────────────────────────────────────────────────────
  // Curve amplitude multiplier: 0 at the start, 0 through the bridge straight.
  _straightMask(z) {
    const br = this.bridge;
    const startFade = smooth(clamp(z / 120, 0, 1));
    let m = startFade;
    if (br) {
      const a = br.straightFrom, b = br.landingEnd + 60;
      if (z > a - 120 && z < b + 120) {
        const fin = 1 - smooth(clamp((z - (a - 120)) / 120, 0, 1));
        const fout = smooth(clamp((z - b) / 120, 0, 1));
        m *= z < b ? fin : fout;
      }
    }
    return m;
  }

  // One global wiggle shape; each biome only scales its amplitude (blended), so
  // biome borders never kink the road. (`curveWave` in route.json is informational.)
  centerX(z) {
    const amp = this.param(z, 'curveAmp');
    const [p1, p2] = this.phases[0];
    const [p3] = this.phases[1] || [0];
    const k = (Math.PI * 2) / 600;
    const shape = 0.6 * Math.sin(z * k + p1) + 0.28 * Math.sin(z * k * 2.07 + p2) + 0.12 * Math.sin(z * k * 3.9 + p3);
    return amp * shape * this._straightMask(z);
  }

  // dx/dz of the centre line, and the road heading as a yaw (forward = (sin yaw, cos yaw)).
  slope(z) { const e = 0.5; return (this.centerX(z + e) - this.centerX(z - e)) / (2 * e); }
  headingAt(z) { return Math.atan(this.slope(z)); }

  lanesAt(z) { return this.biomeAt(z).lanes; }
  laneWidth(z) { return this.param(z, 'laneWidth'); }
  halfWidth(z) { return (this.param(z, 'lanes') * this.param(z, 'laneWidth')) / 2; }
  shoulder(z) { return this.param(z, 'shoulder'); }

  // Lane i is counted left→right from the driver's point of view (u increasing).
  laneU(z, i) {
    const n = this.lanesAt(z), w = this.laneWidth(z);
    return (i - (n - 1) / 2) * w;
  }
  laneDir(z, i) { return this.laneU(z, i) > 0 ? 1 : -1; } // +1 forward (with RV), -1 oncoming

  xAt(z, u) { return this.centerX(z) - u; }
  uAt(x, z) { return this.centerX(z) - x; }
  isOnRoad(x, z, margin = 0) { return Math.abs(this.uAt(x, z)) <= this.halfWidth(z) + margin; }

  // ── vertical profile (canyon bridge) ────────────────────────────────────────
  // Height of the drivable surface at z, or null over the canyon gap.
  surfaceY(z) {
    const b = this.bridge;
    if (!b) return 0;
    if (z >= b.rampStart && z < b.lip) return ((z - b.rampStart) / (b.lip - b.rampStart)) * b.rampHeight;
    if (z >= b.gapStart && z < b.gapEnd) return null;
    if (z >= b.gapEnd && z < b.landingEnd) {
      const t = (z - b.gapEnd) / (b.landingEnd - b.gapEnd);
      return b.landingHeight * (1 - t);
    }
    return 0;
  }
  rampAngle() { const b = this.bridge; return Math.atan2(b.rampHeight, b.lip - b.rampStart); }
  // In the bridge zone the deck has rails: the sim clamps |u| to the road width there.
  inBridgeZone(z) { const b = this.bridge; return !!b && z >= b.rampStart - 10 && z <= b.landingEnd + 10; }

  // Supply stop lot rectangle, in world space (axis-aligned approximation is fine: lots sit on gentle curves).
  stopLot(stop) {
    const hw = this.halfWidth(stop.z) + this.shoulder(stop.z);
    const u = stop.side * (hw + stop.lotDepth / 2 - 1.0); // lot overlaps the shoulder slightly
    return { cx: this.xAt(stop.z, u), cz: stop.z, halfLen: stop.lotLength / 2, halfDepth: stop.lotDepth / 2, u };
  }

  // ── helpers added by Agent SIM (append-only; shared with the renderer) ─────────
  // Free space beyond the shoulder before buildings / canyon walls (biome `sideRoom`, blended).
  sideRoom(z) {
    return this.biomes.every((b) => typeof b.sideRoom === 'number') ? this.param(z, 'sideRoom') : 14;
  }
  // Hard lateral limit for vehicles: |u| <= halfWidth + shoulder + sideRoom (hitting it = wall crash).
  driveLimitU(z) { return this.halfWidth(z) + this.shoulder(z) + this.sideRoom(z); }

  // Cross-street (crosswalk) positions: every biome.intersectionEvery metres inside biomes that
  // define it, skipping spots too close to supply stops, route events, the start and the bridge.
  intersectionZs() {
    if (this._ints) return this._ints;
    const out = [];
    const r = this.route, stops = r.stops || [], evs = r.events || [];
    const clear = (z) => {
      if (z < 120) return false;
      for (const s of stops) if (Math.abs(z - s.z) < s.lotLength / 2 + 45) return false;
      for (const e of evs) {
        if (e.z != null && Math.abs(z - e.z) < 70) return false;
        if (e.from != null && z > e.from - 50 && z < e.to + 50) return false;
      }
      if (this.bridge && z > this.bridge.straightFrom - 100) return false;
      return true;
    };
    for (const b of this.biomes) {
      const every = b.intersectionEvery;
      if (!every) continue;
      for (let z = b.from + every; z < b.to - 40; z += every) if (clear(z)) out.push(z);
    }
    this._ints = out;
    return out;
  }

  // Buyer's drive-in centre (route.sellPoint.offset metres beyond the shoulder on `side`).
  sellPointPos() {
    const sp = this.route.sellPoint;
    const u = sp.side * (this.halfWidth(sp.z) + this.shoulder(sp.z) + (sp.offset ?? 10));
    return { x: this.xAt(sp.z, u), z: sp.z, u };
  }

  // Roadwork closures from route.events: { from, to, closedSide (+1 forward / -1 oncoming), u0, u1 }
  // where [u0,u1] is the closed lateral band (one lane: the outer lane on that side).
  roadworks() {
    if (this._rw) return this._rw;
    this._rw = (this.route.events || []).filter((e) => e.type === 'roadwork').map((e) => {
      const side = e.closedSide ?? 1, zm = (e.from + e.to) / 2;
      const hw = this.halfWidth(zm), lw = this.laneWidth(zm);
      const outer = side * hw, inner = side * (hw - lw);
      return { from: e.from, to: e.to, closedSide: side, u0: Math.min(outer, inner), u1: Math.max(outer, inner) };
    });
    return this._rw;
  }
}
