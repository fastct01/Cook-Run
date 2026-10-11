// ─────────────────────────────────────────────────────────────────────────────
// DEFEND client · aim maths shared by DefendClient / RoofCam / RoofHud (no DOM, no three.js).
// The crosshair is the camera's centre ray; what it hits (a police car via the sim's own hit boxes, else
// the ground, else a point 120 m out) is the target, and the yaw/pitch sent to the host is measured from
// the sim's aim pivot (sim/roof.js ROOF_GEOM.muzzle) to that point — so the round the sim fires goes
// exactly where the crosshair sits, with no over-the-shoulder parallax.
// ─────────────────────────────────────────────────────────────────────────────
import { KIND } from '../shared/protocol.js';
import { ROOF_GEOM, COP_KINDS, rayCops, aimAt, pivotWorld, rvToWorld } from '../sim/roof.js';

const COPS = new Set(COP_KINDS);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const PART_LABEL = Object.freeze({ tyre: 'Tyre', radiator: 'Hood', glass: 'Glass', body: 'Body' });
/** the part each gun is good against (amber label) */
export const GUN_PART = Object.freeze({ revolver: null, shotgun: 'tyre', rifle: 'radiator' });

/** Police cars in the snapshot as hit-test bodies: [{ id, kind, x, y, z, yaw, state }]. */
export function copsFromSnap(snap) {
  const out = [];
  const ents = snap && snap.ents;
  if (!Array.isArray(ents)) return out;
  for (const e of ents) {
    const kind = KIND[e[1]];
    if (!COPS.has(kind) || e[7] === 4) continue;
    out.push({ id: e[0], kind, x: e[2], y: e[3], z: e[4], yaw: e[5], state: e[7] });
  }
  return out;
}

/**
 * The crosshair target for a world ray (eye, unit dir): { x, y, z, cop, part, dist (from the aim pivot),
 * ground: bool }. groundY = the RV's height (lots are flat).
 */
export function crosshairTarget(eye, dir, cops, rv, maxDist = 160) {
  const h = rayCops(eye, dir, cops, maxDist);
  const P = pivotWorld(rv);
  if (h.hit) {
    return { x: h.point.x, y: h.point.y, z: h.point.z, cop: h.cop, part: h.part, wheel: h.wheel, ground: false,
      dist: Math.hypot(h.point.x - P.x, h.point.y - P.y, h.point.z - P.z) };
  }
  const gy = rv.y || 0;
  let t = maxDist * 0.75, ground = false;
  if (dir.y < -1e-4) { const tg = (eye.y - gy) / -dir.y; if (tg < t) { t = tg; ground = true; } }
  const x = eye.x + dir.x * t, y = eye.y + dir.y * t, z = eye.z + dir.z * t;
  return { x, y, z, cop: null, part: null, wheel: null, ground, dist: Math.hypot(x - P.x, y - P.y, z - P.z) };
}

/** RV-local { yaw, pitch } from the sim's aim pivot to a world point (what roofAim sends). */
export function aimToPoint(rv, p) {
  const a = aimAt(rv, p.x, p.z, p.y);
  return { yaw: a.yaw, pitch: clamp(a.pitch, ROOF_GEOM.pitchMin, ROOF_GEOM.pitchMax) };
}

/** Where a throw at the crosshair lands: the ground under the target, clamped by the sim to 3..25 m. */
export function throwPoint(rv, t) {
  return { x: t.x, z: t.z };
}

/** A unit RV-local direction for a camera yaw/pitch → world (flat RV frame, like the sim). */
export function camDirWorld(rv, yaw, pitch) {
  const a = (rv.yaw || 0) + yaw, cp = Math.cos(pitch);
  return { x: Math.sin(a) * cp, y: Math.sin(pitch), z: Math.cos(a) * cp };
}

/** Bearing from the RV to the nearest running cop (initial camera yaw when he gets up). */
export function nearestCopYaw(rv, cops) {
  let best = null, bd = Infinity;
  for (const c of cops) {
    if (c.state !== 1) continue;
    const d = Math.hypot(c.x - rv.x, c.z - rv.z);
    if (d < bd) { bd = d; best = c; }
  }
  if (!best) return null;
  const s = rvToWorld(rv, ROOF_GEOM.stance.x, ROOF_GEOM.stance.z);
  return Math.atan2(Math.sin(Math.atan2(best.x - s.x, best.z - s.z) - (rv.yaw || 0)), Math.cos(Math.atan2(best.x - s.x, best.z - s.z) - (rv.yaw || 0)));
}

/** "Unit 12": a short, stable call sign for a police car id. */
export function unitOf(id) { return ((Math.imul((id | 0) + 7, 2654435761) >>> 0) % 29) + 2; }
