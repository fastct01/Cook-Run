// Small seeded RNG (mulberry32). Deterministic across browsers/Node — and trivial to port to C#.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed = 1) { this.next = mulberry32(seed); }
  float(min = 0, max = 1) { return min + (max - min) * this.next(); }
  int(min, maxInclusive) { return Math.floor(this.float(min, maxInclusive + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
}

// Hash a set of integers to a stable seed (for per-chunk deterministic scenery).
export function hashSeed(...nums) {
  let h = 2166136261 >>> 0;
  for (const n of nums) { h ^= (n | 0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
