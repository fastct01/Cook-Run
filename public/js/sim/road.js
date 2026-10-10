// ─────────────────────────────────────────────────────────────────────────────
// Road: a sampled cache over Track so the sim can query the road geometry
// thousands of times per step without re-blending biome params each call.
// Values are linearly interpolated from 1 m samples (error < 1 mm on our curves).
// Unity port: a ScriptableObject/struct with baked float arrays.
//
// Lanes are addressed as (dir, rank): dir +1 = forward (u>0, with the RV),
// -1 = oncoming (u<0); rank 0 = the lane next to the centre line.
// laneU(z, dir, rank) == track.laneU(z, i) for the matching lane index i.
// Expansion: lanesPerDir() counts only the lanes that physically fit (biome blends
// widen the road gradually); median(z) = half-width of the freeway median barrier at
// u≈0 (0 = none); surfaceY() asks `overlay(z)` first (set-pieces: drawbridge) —
// number = height, null = gap, undefined = no opinion → the Track's own profile.
// ─────────────────────────────────────────────────────────────────────────────
export class Road {
  constructor(track) {
    this.track = track;
    const route = track.route;
    this.route = route;
    this.length = route.routeLength;
    this.z0 = -80;
    this.z1 = route.routeLength + 250;
    const n = Math.ceil(this.z1 - this.z0) + 2;
    this.n = n;
    this.cxA = new Float64Array(n);
    this.hwA = new Float64Array(n);
    this.shA = new Float64Array(n);
    this.lwA = new Float64Array(n);
    this.srA = new Float64Array(n);
    const hasSide = route.biomes.every((b) => typeof b.sideRoom === 'number');
    for (let i = 0; i < n; i++) {
      const z = this.z0 + i;
      this.cxA[i] = track.centerX(z);
      this.hwA[i] = track.halfWidth(z);
      this.shA[i] = track.shoulder(z);
      this.lwA[i] = track.laneWidth(z);
      this.srA[i] = hasSide ? track.param(z, 'sideRoom') : 14;
    }
    this.bridge = route.bridge || null;
    // biome boundaries for fast lookup
    this.biomes = route.biomes;
    // freeway median barriers (biome.road.median): solid wall at u≈0, inset from the biome ends
    this.medians = route.biomes.filter((b) => b.road && b.road.median).map((b) => {
      const inset = b.road.medianInset ?? 50;
      return { from: b.from + inset, to: b.to - inset, half: b.road.medianHalf ?? 0.3 };
    });
    this.overlay = null;   // (z) => number | null | undefined   (GameSim: set-piece surfaces)
  }

  _s(arr, z) {
    let f = z - this.z0;
    if (f < 0) f = 0; else if (f > this.n - 2) f = this.n - 2;
    const i = f | 0, t = f - i;
    return arr[i] + (arr[i + 1] - arr[i]) * t;
  }
  cx(z) { return this._s(this.cxA, z); }
  hw(z) { return this._s(this.hwA, z); }
  sh(z) { return this._s(this.shA, z); }
  lw(z) { return this._s(this.lwA, z); }
  sideRoom(z) { return this._s(this.srA, z); }
  slope(z) { return (this.cx(z + 0.5) - this.cx(z - 0.5)); }
  heading(z) { return Math.atan(this.slope(z)); }

  xAt(z, u) { return this.cx(z) - u; }
  uAt(x, z) { return this.cx(z) - x; }

  biomeIndex(z) {
    const b = this.biomes;
    for (let i = 0; i < b.length; i++) if (z < b[i].to) return i;
    return b.length - 1;
  }
  biome(z) { return this.biomes[this.biomeIndex(z)]; }
  lanes(z) { return this.biome(z).lanes; }
  lanesPerDir(z) {
    const n = (this.biome(z).lanes / 2) | 0;
    const fit = Math.floor((this.hw(z) + 0.5) / this.lw(z));
    const k = fit < n ? fit : n;
    return k < 1 ? 1 : k;
  }
  median(z) {
    const m = this.medians;
    for (let i = 0; i < m.length; i++) if (z >= m[i].from && z <= m[i].to) return m[i].half;
    return 0;
  }
  laneU(z, dir, rank) {
    const n = this.lanesPerDir(z);
    const r = rank < n ? rank : n - 1;
    return dir * (r + 0.5) * this.lw(z);
  }
  // Nearest lane (dir, rank) to lateral offset u.
  nearestLane(z, u) {
    const dir = u >= 0 ? 1 : -1;
    const n = this.lanesPerDir(z), w = this.lw(z);
    let rank = Math.round(Math.abs(u) / w - 0.5);
    if (rank < 0) rank = 0; if (rank > n - 1) rank = n - 1;
    return { dir, rank };
  }

  surfaceY(z) {
    if (this.overlay) { const y = this.overlay(z); if (y !== undefined) return y; }
    return this.track.surfaceY(z);
  }
  inBridgeZone(z) { return this.track.inBridgeZone(z); }
}
