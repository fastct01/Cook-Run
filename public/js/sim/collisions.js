// ─────────────────────────────────────────────────────────────────────────────
// Collisions: every vehicle is a capsule in the XZ plane (a segment along its
// heading, radius = half width). Props/peds are circles; long props (roadblock
// barricades, spike strips) are capsules across the road.
// Response is a simple impulse with restitution + a small angular kick.
// Unity port: replace with BoxCollider/CapsuleCollider + OnCollisionEnter, keep
// the damage rules (they live in the callers, not here).
// ─────────────────────────────────────────────────────────────────────────────
import { segSegClosest } from './util.js';

const _ss = { x1: 0, z1: 0, x2: 0, z2: 0, dist2: 0 };

// Refresh a body's capsule endpoints from x, z, yaw. Body needs: x, z, yaw, hl, r.
export function updateCapsule(b) {
  const s = Math.sin(b.yaw), c = Math.cos(b.yaw);
  b.ax = b.x + s * b.hl; b.az = b.z + c * b.hl;
  b.bx = b.x - s * b.hl; b.bz = b.z - c * b.hl;
}

// Body factory fields shared by RV, traffic, cops. mass is relative (sedan = 1).
export function initBodyShape(b, len, wid, mass, angular = 1) {
  b.len = len; b.wid = wid; b.mass = mass;
  b.hl = Math.max(0, (len - wid) / 2);
  b.r = wid / 2;
  b.inertia = (mass * (len * len + wid * wid)) / 12;
  b.angular = angular; // scale of the angular kick on impacts
  updateCapsule(b);
  return b;
}

// Capsule vs capsule. Fills `out` with normal (a→b), depth, contact point. Returns bool.
export function capsuleCapsule(a, b, out) {
  segSegClosest(a.ax, a.az, a.bx, a.bz, b.ax, b.az, b.bx, b.bz, _ss);
  const rr = a.r + b.r;
  if (_ss.dist2 >= rr * rr) return false;
  let d = Math.sqrt(_ss.dist2), nx, nz;
  if (d > 1e-6) { nx = (_ss.x2 - _ss.x1) / d; nz = (_ss.z2 - _ss.z1) / d; }
  else {
    nx = b.x - a.x; nz = b.z - a.z; d = Math.hypot(nx, nz);
    if (d < 1e-6) { nx = 1; nz = 0; } else { nx /= d; nz /= d; }
    d = 0;
  }
  out.nx = nx; out.nz = nz; out.depth = rr - d;
  out.px = (_ss.x1 + _ss.x2) / 2; out.pz = (_ss.z1 + _ss.z2) / 2;
  return true;
}

// Capsule vs a static capsule given by endpoints (for long props/train).
export function capsuleSegment(a, ax, az, bx, bz, r, out) {
  segSegClosest(a.ax, a.az, a.bx, a.bz, ax, az, bx, bz, _ss);
  const rr = a.r + r;
  if (_ss.dist2 >= rr * rr) return false;
  let d = Math.sqrt(_ss.dist2), nx, nz;
  if (d > 1e-6) { nx = (_ss.x2 - _ss.x1) / d; nz = (_ss.z2 - _ss.z1) / d; }
  else { nx = (ax + bx) / 2 - a.x; nz = (az + bz) / 2 - a.z; d = Math.hypot(nx, nz) || 1; nx /= d; nz /= d; d = 0; }
  out.nx = nx; out.nz = nz; out.depth = rr - d;
  out.px = (_ss.x1 + _ss.x2) / 2; out.pz = (_ss.z1 + _ss.z2) / 2;
  return true;
}

// Capsule vs circle.
export function capsuleCircle(a, cx, cz, cr, out) {
  return capsuleSegment(a, cx, cz, cx, cz, cr, out);
}

// Velocity of body point (px,pz) including spin: v + w × r  (w about +Y; yaw is right-handed about +Y).
function pointVel(b, px, pz) {
  const rx = px - b.x, rz = pz - b.z;
  return [b.vx + b.w * rz, b.vz - b.w * rx];
}

// Two dynamic bodies. `n` points a→b. Returns closing speed (≥0) before the impulse.
export function resolveBodies(a, b, c, restitution = 0.25) {
  const nx = c.nx, nz = c.nz;
  // positional correction by inverse mass
  const ia = 1 / a.mass, ib = 1 / b.mass, sum = ia + ib;
  const corr = Math.max(0, c.depth - 0.01);
  a.x -= nx * corr * (ia / sum); a.z -= nz * corr * (ia / sum);
  b.x += nx * corr * (ib / sum); b.z += nz * corr * (ib / sum);
  const [vax, vaz] = pointVel(a, c.px, c.pz);
  const [vbx, vbz] = pointVel(b, c.px, c.pz);
  const vn = (vbx - vax) * nx + (vbz - vaz) * nz;
  updateCapsule(a); updateCapsule(b);
  if (vn >= 0) return 0;
  const rax = c.px - a.x, raz = c.pz - a.z, rbx = c.px - b.x, rbz = c.pz - b.z;
  const ca = raz * nx - rax * nz, cb = rbz * nx - rbx * nz;
  const ka = a.angular * (ca * ca) / a.inertia, kb = b.angular * (cb * cb) / b.inertia;
  const j = (-(1 + restitution) * vn) / (ia + ib + ka + kb);
  a.vx -= (j * nx) * ia; a.vz -= (j * nz) * ia;
  b.vx += (j * nx) * ib; b.vz += (j * nz) * ib;
  a.w -= a.angular * (ca * j) / a.inertia;
  b.w += b.angular * (cb * j) / b.inertia;
  return -vn;
}

// Dynamic body vs immovable thing. `n` points body→static. Returns closing speed.
export function resolveStatic(a, c, restitution = 0.2) {
  const nx = c.nx, nz = c.nz;
  const corr = Math.max(0, c.depth - 0.005);
  a.x -= nx * corr; a.z -= nz * corr;
  updateCapsule(a);
  const [vax, vaz] = pointVel(a, c.px, c.pz);
  const vn = -(vax * nx + vaz * nz); // relative velocity of static minus body, along n
  if (vn >= 0) return 0;
  const rax = c.px - a.x, raz = c.pz - a.z;
  const ca = raz * nx - rax * nz;
  const ka = a.angular * (ca * ca) / a.inertia;
  const j = (-(1 + restitution) * vn) / (1 / a.mass + ka);
  a.vx -= (j * nx) / a.mass; a.vz -= (j * nz) / a.mass;
  a.w -= a.angular * (ca * j) / a.inertia;
  return -vn;
}
