// ─────────────────────────────────────────────────────────────────────────────
// DocController — Doc's movement inside the van. PURE LOGIC: no three.js, no DOM.
// Unity port: a CharacterController-driven MonoBehaviour (Move() with the same
// velocity model; the walkable rectangles become BoxColliders / a NavMesh area).
//
//   const doc = new DocController(vanJson);
//   doc.setCameraBasis(rx, rz, fx, fz)   // camera's screen-right / screen-up projected on the van floor (van-local, normalised)
//   doc.setMove(moveX, moveZ)            // keyboard: −1..1 along screen right / screen up
//   doc.walkTo(x, z, stationId?)         // click-to-move (simple pathing along the aisle)
//   doc.startWork(stationId) / doc.stopWork()
//   doc.setDown(bool)                    // lab.cookDown → lies on the floor
//   doc.bumpImpulse(power)               // extra bump source (e.g. hard landing)
//   doc.update(dt, { latAcc, bump })     // snap.feel
//   doc.nearestStation() → { id, dist } | null    (within doc.interactRadius of its stand point)
//   doc.drainEvents() → [{ type: 'arrived'|'stumble'|'hop'|'recovered', ... }]
// State: 'idle' | 'walking' | 'working' | 'stumbling' | 'down'
// Van-local axes: +X = driver's left, +Z = front. Facing yaw: forward = (sin yaw, cos yaw).
// ─────────────────────────────────────────────────────────────────────────────

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class DocController {
  constructor(van, opts = {}) {
    const d = van.doc || {};
    const s = van.sway || {};
    this.radius = d.radius ?? 0.24;
    this.walkSpeed = d.walkSpeed ?? 2.6;
    this.accel = d.accel ?? 14;
    this.interactRadius = d.interactRadius ?? 0.75;
    this.sway = {
      latAccStart: s.latAccStart ?? 2.5, pushPerMps2: s.pushPerMps2 ?? 0.08, bumpHop: s.bumpHop ?? 0.35,
      stumbleBump: s.stumbleBump ?? 0.6, stumbleSeconds: s.stumbleSeconds ?? 0.7, gripWhileWorking: s.gripWhileWorking ?? 0.7,
    };
    this.stations = (van.stations || []).map((st) => ({ id: st.id, name: st.name, kind: st.kind, x: st.x, z: st.z, side: st.side || 0,
      stand: { x: st.stand?.x ?? st.x, z: st.stand?.z ?? st.z }, faces: st.faces || null, steps: st.steps || [] }));
    this.byId = Object.fromEntries(this.stations.map((st) => [st.id, st]));
    this.rects = (van.walkable || []).map((r) => ({ id: r.id, minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ }));
    if (!this.rects.length) this.rects.push({ id: 'all', minX: -1, maxX: 1, minZ: -4, maxZ: 2 });
    // make every stand point reachable: connector rect from the stand to the nearest walkable point
    for (const st of this.stations) {
      if (this.inside(st.stand.x, st.stand.z)) continue;
      const p = this.project(st.stand.x, st.stand.z);
      this.rects.push({ id: 'stand_' + st.id, minX: Math.min(p.x, st.stand.x) - 0.06, maxX: Math.max(p.x, st.stand.x) + 0.06, minZ: Math.min(p.z, st.stand.z) - 0.06, maxZ: Math.max(p.z, st.stand.z) + 0.06 });
    }
    const start = opts.start || this.byId.recipe?.stand || { x: 0, z: 0 };
    const p0 = this.project(start.x, start.z - 0.3);
    this.x = p0.x; this.z = p0.z;
    this.vx = 0; this.vz = 0;            // controlled velocity
    this.pushVx = 0; this.pushVz = 0;    // sway / stumble velocity (van-local)
    this.yaw = Math.PI;                  // facing the rear
    this.state = 'idle';
    this.moveX = 0; this.moveZ = 0;
    this.camR = { x: 1, z: 0 }; this.camF = { x: 0, z: 1 };
    this.path = []; this.goal = null; this.goalStation = null;
    this.workStation = null;
    this.stumbleT = 0; this.stumbleDir = 1;
    this.hopT = 0; this.hopPow = 0;
    this.lean = 0; this.leanV = 0;       // visual lean (m) while working / pushed
    this.walkPhase = 0;
    this.prevBump = 0; this.bumpCd = 0;
    this.t = 0;
    this.events = [];
    this.down = false;
    this._seed = 1;
  }

  // ── geometry ───────────────────────────────────────────────────────────────
  inside(x, z, eps = 1e-6) {
    for (const r of this.rects) if (x >= r.minX - eps && x <= r.maxX + eps && z >= r.minZ - eps && z <= r.maxZ + eps) return true;
    return false;
  }
  /** Closest point of the walkable union. */
  project(x, z) {
    let best = null, bd = Infinity;
    for (const r of this.rects) {
      const px = clamp(x, r.minX, r.maxX), pz = clamp(z, r.minZ, r.maxZ);
      const d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < bd) { bd = d; best = { x: px, z: pz }; }
    }
    return best;
  }
  _rectOf(x, z) {
    for (let i = 0; i < this.rects.length; i++) { const r = this.rects[i]; if (x >= r.minX - 1e-6 && x <= r.maxX + 1e-6 && z >= r.minZ - 1e-6 && z <= r.maxZ + 1e-6) return i; }
    return -1;
  }
  _segmentClear(ax, az, bx, bz) {
    const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.08));
    for (let i = 1; i < n; i++) { const t = i / n; if (!this.inside(ax + (bx - ax) * t, az + (bz - az) * t, 1e-4)) return false; }
    return true;
  }
  /** Waypoints from the current position to (x, z) through overlapping rects (BFS + string pulling). */
  planPath(x, z) {
    const g = this.project(x, z);
    if (this._segmentClear(this.x, this.z, g.x, g.z)) return [g];
    const a = this._rectOf(this.x, this.z), b = this._rectOf(g.x, g.z);
    if (a < 0 || b < 0) return [g];
    const R = this.rects, n = R.length;
    const overlap = (i, j) => {
      const r = { minX: Math.max(R[i].minX, R[j].minX), maxX: Math.min(R[i].maxX, R[j].maxX), minZ: Math.max(R[i].minZ, R[j].minZ), maxZ: Math.min(R[i].maxZ, R[j].maxZ) };
      return r.minX <= r.maxX + 1e-6 && r.minZ <= r.maxZ + 1e-6 ? r : null;
    };
    const prev = new Array(n).fill(-1), seen = new Array(n).fill(false);
    const q = [a]; seen[a] = true;
    while (q.length) {
      const i = q.shift();
      if (i === b) break;
      for (let j = 0; j < n; j++) if (!seen[j] && overlap(i, j)) { seen[j] = true; prev[j] = i; q.push(j); }
    }
    if (!seen[b]) return [g];
    const chain = [];
    for (let i = b; i !== -1; i = prev[i]) chain.unshift(i);
    const pts = [];
    let cx = this.x, cz = this.z;
    for (let k = 0; k < chain.length - 1; k++) {
      const o = overlap(chain[k], chain[k + 1]);
      // portal point: the overlap point closest to the straight line toward the goal
      const px = clamp((cx + g.x) / 2, o.minX, o.maxX), pz = clamp((cz + g.z) / 2, o.minZ, o.maxZ);
      pts.push({ x: px, z: pz }); cx = px; cz = pz;
    }
    pts.push(g);
    // string pulling: drop waypoints we can see past
    const out = [];
    let ax = this.x, az = this.z, i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this._segmentClear(ax, az, pts[j].x, pts[j].z)) j--;
      out.push(pts[j]); ax = pts[j].x; az = pts[j].z; i = j + 1;
    }
    return out;
  }

  // ── input ──────────────────────────────────────────────────────────────────
  setCameraBasis(rx, rz, fx, fz) {
    const lr = Math.hypot(rx, rz) || 1, lf = Math.hypot(fx, fz) || 1;
    this.camR.x = rx / lr; this.camR.z = rz / lr; this.camF.x = fx / lf; this.camF.z = fz / lf;
  }
  setMove(moveX, moveZ) {
    this.moveX = clamp(moveX || 0, -1, 1); this.moveZ = clamp(moveZ || 0, -1, 1);
    if ((this.moveX || this.moveZ) && this.path.length) { this.path = []; this.goal = null; this.goalStation = null; }
  }
  get hasMoveInput() { return Math.abs(this.moveX) + Math.abs(this.moveZ) > 0.05; }
  /** Walk to a floor point (projected onto the walkable area). stationId → 'arrived' event carries it. */
  walkTo(x, z, stationId = null) {
    if (this.state === 'down' || this.state === 'stumbling') return false;
    if (this.state === 'working') this.stopWork();
    this.path = this.planPath(x, z);
    this.goal = this.path[this.path.length - 1];
    this.goalStation = stationId;
    return true;
  }
  walkToStation(id) {
    const st = this.byId[id];
    if (!st) return false;
    return this.walkTo(st.stand.x, st.stand.z, id);
  }
  cancelPath() { this.path = []; this.goal = null; this.goalStation = null; }

  // ── stations ───────────────────────────────────────────────────────────────
  /** Yaw that faces the station from its stand point. */
  facingYawFor(id) {
    const st = this.byId[id];
    if (!st) return this.yaw;
    if (st.kind === 'board' || st.faces === 'front') return 0;
    if (st.kind === 'crate') return Math.atan2(st.x - st.stand.x, st.z - st.stand.z);
    return st.side > 0 ? Math.PI / 2 : st.side < 0 ? -Math.PI / 2 : Math.atan2(st.x - st.stand.x, st.z - st.stand.z);
  }
  nearestStation(filter = null) {
    let best = null;
    for (const st of this.stations) {
      if (filter && !filter(st)) continue;
      const d = Math.hypot(st.stand.x - this.x, st.stand.z - this.z);
      if (d <= this.interactRadius && (!best || d < best.dist)) best = { id: st.id, dist: d, station: st };
    }
    return best;
  }
  distToStation(id) { const st = this.byId[id]; return st ? Math.hypot(st.stand.x - this.x, st.stand.z - this.z) : Infinity; }
  startWork(id) {
    if (this.state === 'down' || !this.byId[id]) return false;
    this.cancelPath();
    this.workStation = id;
    this.state = 'working';
    this.vx = this.vz = 0;
    return true;
  }
  stopWork() {
    if (this.state !== 'working') return;
    this.workStation = null;
    this.state = 'idle';
  }
  setDown(down) {
    if (down && this.state !== 'down') {
      this.workStation = null; this.cancelPath();
      this.state = 'down'; this.down = true; this.vx = this.vz = 0;
    } else if (!down && this.state === 'down') {
      this.state = 'idle'; this.down = false;
      this.events.push({ type: 'recovered' });
    }
  }

  // ── van motion ─────────────────────────────────────────────────────────────
  bumpImpulse(power) {
    if (this.bumpCd > 0 || this.state === 'down') return;
    this.bumpCd = 0.3;
    const S = this.sway;
    if (power >= S.stumbleBump && this.state !== 'working') {
      this.state = 'stumbling';
      this.stumbleT = S.stumbleSeconds;
      this.cancelPath();
      // pseudo-random stagger: mostly sideways, a bit fore/aft (deterministic sequence)
      this._seed = (this._seed * 16807) % 2147483647;
      const r = this._seed / 2147483647;
      this.stumbleDir = (this.pushVx !== 0 ? Math.sign(this.pushVx) : r < 0.5 ? -1 : 1);
      const sp = 0.9 + power * 0.9;
      this.pushVx += this.stumbleDir * sp * 0.8;
      this.pushVz += (r - 0.5) * sp * 0.9;
      this.hopT = 0.32; this.hopPow = Math.min(1, power);
      this.events.push({ type: 'stumble', power });
    } else if (power >= S.bumpHop || (this.state === 'working' && power >= S.stumbleBump)) {
      this.hopT = 0.3; this.hopPow = Math.min(1, power) * 0.8;
      if (this.state === 'working') this.leanV += (this.leanV >= 0 ? 1 : -1) * power * 0.9;
      this.events.push({ type: 'hop', power });
    }
  }
  /** Visual hop height (m) right now. */
  get hop() { return this.hopT > 0 ? Math.sin((1 - this.hopT / 0.3) * Math.PI) * 0.16 * this.hopPow : 0; }

  // ── step ───────────────────────────────────────────────────────────────────
  update(dt, feel = {}) {
    dt = clamp(dt || 0, 0, 0.1);
    this.t += dt;
    this.bumpCd = Math.max(0, this.bumpCd - dt);
    this.hopT = Math.max(0, this.hopT - dt);
    // bump impulses: rising edge of feel.bump (same rule as CookLab)
    const b = +feel.bump || 0;
    if (b > 0.2 && b - this.prevBump > 0.12) this.bumpImpulse(b);
    this.prevBump = b;
    // lateral push from cornering: latAcc = speed·yawRate (+ = turning left toward +X) →
    // Doc is thrown to the OUTSIDE of the turn, i.e. along −X for a positive latAcc.
    const S = this.sway;
    const lat = +feel.latAcc || 0;
    const ex = Math.max(0, Math.abs(lat) - S.latAccStart);
    let pushT = -Math.sign(lat) * ex * S.pushPerMps2;      // target sideways drift speed (m/s)
    if (this.state === 'stumbling') pushT *= 1.5;

    if (this.state === 'down') {
      this.vx = this.vz = 0;
      this.pushVx *= Math.exp(-dt * 6); this.pushVz *= Math.exp(-dt * 6);
      this._lean(dt, 0);
      return;
    }
    if (this.state === 'working') {
      const st = this.byId[this.workStation];
      // hold the counter: stay on the stand point, lean with the van (scaled by grip)
      if (st) {
        const k = 1 - Math.exp(-dt * 12);
        this.x += (st.stand.x - this.x) * k; this.z += (st.stand.z - this.z) * k;
        this.yaw += wrap(this.facingYawFor(st.id) - this.yaw) * Math.min(1, dt * 12);
      }
      this.pushVx = this.pushVz = 0;
      this._lean(dt, clamp(pushT * S.gripWhileWorking * 0.6, -0.14, 0.14));
      return;
    }
    // controlled velocity
    let dx = 0, dz = 0, want = 0;
    if (this.state === 'stumbling') {
      this.stumbleT -= dt;
      if (this.stumbleT <= 0) { this.state = 'idle'; this.events.push({ type: 'steady' }); }
    } else if (this.hasMoveInput) {
      dx = this.camR.x * this.moveX + this.camF.x * this.moveZ;
      dz = this.camR.z * this.moveX + this.camF.z * this.moveZ;
      const l = Math.hypot(dx, dz);
      if (l > 1e-4) { want = Math.min(1, l) * this.walkSpeed; dx /= l; dz /= l; }
    } else if (this.path.length) {
      const w = this.path[0];
      const ddx = w.x - this.x, ddz = w.z - this.z, l = Math.hypot(ddx, ddz);
      const last = this.path.length === 1;
      if (l < (last ? 0.04 : 0.12)) {
        this.path.shift();
        if (!this.path.length) {
          const id = this.goalStation;
          this.goal = null; this.goalStation = null;
          this.events.push({ type: 'arrived', station: id });
        }
      } else {
        dx = ddx / l; dz = ddz / l;
        want = last ? Math.min(this.walkSpeed, l * 5 + 0.4) : this.walkSpeed;
      }
    }
    const tvx = dx * want, tvz = dz * want;
    const ax = tvx - this.vx, az = tvz - this.vz, al = Math.hypot(ax, az), step = this.accel * dt;
    if (al > step) { this.vx += (ax / al) * step; this.vz += (az / al) * step; } else { this.vx = tvx; this.vz = tvz; }
    if (this.state === 'stumbling') { this.vx *= Math.exp(-dt * 5); this.vz *= Math.exp(-dt * 5); }
    // sway velocity (eases toward the cornering push; stumble impulse decays)
    this.pushVx += (pushT - this.pushVx) * (1 - Math.exp(-dt * (this.state === 'stumbling' ? 1.5 : 3)));
    this.pushVz *= Math.exp(-dt * 3);
    // integrate + collide (slide along the walkable union)
    const nx = this.x + (this.vx + this.pushVx) * dt, nz = this.z + (this.vz + this.pushVz) * dt;
    if (this.inside(nx, nz)) { this.x = nx; this.z = nz; }
    else {
      const p = this.project(nx, nz);
      // kill velocity into the wall so we slide instead of sticking
      if (Math.abs(p.x - nx) > 1e-6) { this.vx = 0; this.pushVx *= -0.2; }
      if (Math.abs(p.z - nz) > 1e-6) { this.vz = 0; this.pushVz *= -0.2; }
      this.x = p.x; this.z = p.z;
    }
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > 0.15 && this.state !== 'stumbling') this.yaw += wrap(Math.atan2(this.vx, this.vz) - this.yaw) * Math.min(1, dt * 14);
    this.walkPhase += sp * dt * 5.2;
    if (this.state !== 'stumbling') this.state = sp > 0.25 || this.path.length ? 'walking' : 'idle';
    this._lean(dt, clamp(this.pushVx * 0.25, -0.1, 0.1));
  }
  _lean(dt, target) {
    this.leanV += ((target - this.lean) * 60 - this.leanV * 9) * dt;
    this.lean += this.leanV * dt;
  }
  get speed() { return Math.hypot(this.vx, this.vz); }
  drainEvents() { const e = this.events; this.events = []; return e; }
  /** Plain-data snapshot (debug / tests). */
  toJSON() {
    return { x: +this.x.toFixed(3), z: +this.z.toFixed(3), yaw: +this.yaw.toFixed(3), state: this.state, work: this.workStation, path: this.path.length, speed: +this.speed.toFixed(2), push: +this.pushVx.toFixed(3) };
  }
}
