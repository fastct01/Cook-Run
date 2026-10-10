// ─────────────────────────────────────────────────────────────────────────────
// Small math helpers shared by every sim system. Pure functions, no allocation in
// the hot paths (closest-point helpers write into a caller-provided scratch object).
// Unity port: a static `SimMath` class.
// ─────────────────────────────────────────────────────────────────────────────
export const TAU = Math.PI * 2;
export const FIXED_DT = 1 / 60;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);
export const r2 = (v) => Math.round(v * 100) / 100;

// Wrap an angle into (-PI, PI]. Used for differences only — entity yaw itself is
// kept continuous (never wrapped) so renderers can interpolate it naively.
export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export function approach(v, target, maxDelta) {
  if (v < target) return v + maxDelta > target ? target : v + maxDelta;
  return v - maxDelta < target ? target : v - maxDelta;
}

// Forward/right unit vectors for a yaw. forward = (sin, cos); right = (-cos, sin).
export const fwdX = (yaw) => Math.sin(yaw);
export const fwdZ = (yaw) => Math.cos(yaw);

// Closest points between segment P1Q1 and P2Q2 in the XZ plane (Ericson, RTCD 5.1.9).
export function segSegClosest(p1x, p1z, q1x, q1z, p2x, p2z, q2x, q2z, out) {
  const d1x = q1x - p1x, d1z = q1z - p1z, d2x = q2x - p2x, d2z = q2z - p2z;
  const rx = p1x - p2x, rz = p1z - p2z;
  const a = d1x * d1x + d1z * d1z, e = d2x * d2x + d2z * d2z, f = d2x * rx + d2z * rz;
  const EPS = 1e-9;
  let s, t;
  if (a <= EPS && e <= EPS) { s = 0; t = 0; }
  else if (a <= EPS) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = d1x * rx + d1z * rz;
    if (e <= EPS) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = d1x * d2x + d1z * d2z;
      const denom = a * e - b * b;
      s = denom > EPS ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  out.x1 = p1x + d1x * s; out.z1 = p1z + d1z * s;
  out.x2 = p2x + d2x * t; out.z2 = p2z + d2z * t;
  const dx = out.x2 - out.x1, dz = out.z2 - out.z1;
  out.dist2 = dx * dx + dz * dz;
  return out;
}

// Deep-ish rounding for network snapshots (numbers → 2 dp). Arrays/objects recursed.
export function roundDeep(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
  if (Array.isArray(v)) { const o = new Array(v.length); for (let i = 0; i < v.length; i++) o[i] = roundDeep(v[i]); return o; }
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = roundDeep(v[k]); return o; }
  return v;
}
