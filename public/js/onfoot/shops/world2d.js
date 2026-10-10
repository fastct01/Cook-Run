// ─────────────────────────────────────────────────────────────────────────────
// World2D — flat collision world for the shop challenges (XZ plane, metres). Pure logic.
// Static AABBs [x0,x1,z0,z1] + circles [x,z,r] (+ tags), room bounds, a mover step and a tiny
// visibility-graph path planner for the scripted test bot and NPCs.
// Unity: BoxCollider / CapsuleCollider on a NavMesh floor.
// ─────────────────────────────────────────────────────────────────────────────
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class World2D {
  constructor(bounds = { x0: -10, x1: 10, z0: -10, z1: 10 }) {
    this.bounds = bounds;
    this.boxes = [];     // { x0, x1, z0, z1, tag, on }
    this.circles = [];   // { x, z, r, tag, on }
    this._nav = null;
  }
  box(x0, x1, z0, z1, tag = '') { const b = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), tag, on: true }; this.boxes.push(b); this._nav = null; return b; }
  boxC(x, z, w, d, tag = '') { return this.box(x - w / 2, x + w / 2, z - d / 2, z + d / 2, tag); }
  circle(x, z, r, tag = '') { const c = { x, z, r, tag, on: true }; this.circles.push(c); this._nav = null; return c; }

  /** Push a circle out of everything. Returns true if it touched something (o.hit gets the tag). */
  pushOut(p, r, o = {}) {
    let touched = false;
    const B = this.bounds;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (const b of this.boxes) {
        if (!b.on || (o.ignore && o.ignore(b))) continue;
        const cx = clamp(p.x, b.x0, b.x1), cz = clamp(p.z, b.z0, b.z1);
        const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-10) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
        else {
          const opts = [[b.x0 - r - p.x, 0], [b.x1 + r - p.x, 0], [0, b.z0 - r - p.z], [0, b.z1 + r - p.z]];
          opts.sort((u, v) => Math.abs(u[0] + u[1]) - Math.abs(v[0] + v[1]));
          p.x += opts[0][0]; p.z += opts[0][1];
        }
        moved = touched = true; o.hit = b.tag;
      }
      for (const c of this.circles) {
        if (!c.on || (o.ignore && o.ignore(c))) continue;
        const dx = p.x - c.x, dz = p.z - c.z, rr = r + c.r, d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2);
        const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
        p.x = c.x + nx * rr; p.z = c.z + nz * rr;
        moved = touched = true; o.hit = c.tag;
      }
      const x = clamp(p.x, B.x0 + r, B.x1 - r), z = clamp(p.z, B.z0 + r, B.z1 - r);
      if (x !== p.x || z !== p.z) { p.x = x; p.z = z; touched = true; o.hit = o.hit || 'wall'; }
      if (!moved) break;
    }
    return touched;
  }

  blockedAt(x, z, r) { const p = { x, z }; return this.pushOut(p, r) && Math.hypot(p.x - x, p.z - z) > 1e-3; }

  // An endpoint that sits closer to an obstacle than the margin shrinks that obstacle's margin
  // (targets next to shelves stay reachable without ignoring the shelf for the whole segment).
  segClear(ax, az, bx, bz, m) {
    for (const b of this.boxes) {
      if (!b.on) continue;
      const dA = Math.hypot(ax - clamp(ax, b.x0, b.x1), az - clamp(az, b.z0, b.z1));
      const dB = Math.hypot(bx - clamp(bx, b.x0, b.x1), bz - clamp(bz, b.z0, b.z1));
      const mm = Math.min(m, dA - 0.02, dB - 0.02);
      if (mm < 0) continue;
      if (segBox(ax, az, bx, bz, b.x0 - mm, b.x1 + mm, b.z0 - mm, b.z1 + mm)) return false;
    }
    for (const c of this.circles) {
      if (!c.on) continue;
      const dA = Math.hypot(ax - c.x, az - c.z) - c.r, dB = Math.hypot(bx - c.x, bz - c.z) - c.r;
      const mm = Math.min(m, dA - 0.02, dB - 0.02);
      if (mm < 0) continue;
      const rr = c.r + mm;
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? clamp(((c.x - ax) * dx + (c.z - az) * dz) / l2, 0, 1) : 0;
      const px = ax + dx * t - c.x, pz = az + dz * t - c.z;
      if (px * px + pz * pz < rr * rr) return false;
    }
    return true;
  }

  /** Waypoints from a to b around the colliders (radius r). */
  path(ax, az, bx, bz, r = 0.35) {
    const m = r + 0.04;
    if (this.segClear(ax, az, bx, bz, m)) return [{ x: bx, z: bz }];
    if (!this._nav || this._nav.r !== r) {
      const pts = [], d = r + 0.2, B = this.bounds;
      const ok = (x, z) => x > B.x0 + r && x < B.x1 - r && z > B.z0 + r && z < B.z1 - r && !this.blockedAt(x, z, r);
      for (const b of this.boxes) if (b.on) for (const [x, z] of [[b.x0 - d, b.z0 - d], [b.x1 + d, b.z0 - d], [b.x0 - d, b.z1 + d], [b.x1 + d, b.z1 + d]]) if (ok(x, z)) pts.push({ x, z });
      for (const c of this.circles) if (c.on) for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const k = (c.r + d) * 1.05; if (ok(c.x + sx * k, c.z + sz * k)) pts.push({ x: c.x + sx * k, z: c.z + sz * k }); }
      const n = pts.length, vis = Array.from({ length: n }, () => new Array(n).fill(false));
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) vis[i][j] = vis[j][i] = this.segClear(pts[i].x, pts[i].z, pts[j].x, pts[j].z, m);
      this._nav = { r, pts, vis };
    }
    const { pts, vis } = this._nav, n = pts.length, S = n, G = n + 1;
    const P = pts.concat([{ x: ax, z: az }, { x: bx, z: bz }]);
    const V = (i, j) => (i < n && j < n ? vis[i][j] : this.segClear(P[i].x, P[i].z, P[j].x, P[j].z, m));
    const dist = new Array(n + 2).fill(Infinity), prev = new Array(n + 2).fill(-1), done = new Array(n + 2).fill(false);
    dist[S] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < n + 2; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0 || u === G) break;
      done[u] = true;
      for (let v = 0; v < n + 2; v++) {
        if (done[v] || v === S || !V(u, v)) continue;
        const dd = best + Math.hypot(P[u].x - P[v].x, P[u].z - P[v].z);
        if (dd < dist[v]) { dist[v] = dd; prev[v] = u; }
      }
    }
    if (!Number.isFinite(dist[G])) return [{ x: bx, z: bz }];
    const out = [];
    for (let i = G; i !== S && i >= 0; i = prev[i]) out.unshift({ x: P[i].x, z: P[i].z });
    return out;
  }
}

function segBox(ax, az, bx, bz, x0, x1, z0, z1) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dz, az - z0], [dz, z1 - az]]) {
    if (Math.abs(p) < 1e-12) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t0 < t1 - 1e-9;
}

/**
 * Walker step (velocity model shared by Rook, NPCs and the bot). a: {x,z,yaw,vx,vz,speed}.
 * (mx, mz): desired world direction (length ≤ 1). Returns the collider tag hit (or undefined).
 */
export function walk(a, mx, mz, max, dt, world, r = 0.3, { accel = 16, turn = 12, ignore = null } = {}) {
  let l = Math.hypot(mx, mz);
  if (l > 1) { mx /= l; mz /= l; l = 1; }
  const tvx = mx * max, tvz = mz * max;
  const ax = tvx - a.vx, az = tvz - a.vz, al = Math.hypot(ax, az), st = accel * dt;
  if (al > st) { a.vx += (ax / al) * st; a.vz += (az / al) * st; } else { a.vx = tvx; a.vz = tvz; }
  const px = a.x, pz = a.z;
  const p = { x: a.x + a.vx * dt, z: a.z + a.vz * dt };
  const o = { ignore };
  world.pushOut(p, r, o);
  a.x = p.x; a.z = p.z;
  const rvx = dt > 0 ? (a.x - px) / dt : 0, rvz = dt > 0 ? (a.z - pz) / dt : 0;
  if (Math.abs(rvx) < Math.abs(a.vx)) a.vx = rvx;
  if (Math.abs(rvz) < Math.abs(a.vz)) a.vz = rvz;
  a.speed = Math.hypot(rvx, rvz);
  if (l > 0.1 && a.speed > 0.05) a.yaw += wrap(Math.atan2(mx, mz) - a.yaw) * Math.min(1, dt * turn);
  return o.hit;
}
