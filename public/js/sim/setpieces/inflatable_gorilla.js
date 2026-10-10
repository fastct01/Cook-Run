// ─────────────────────────────────────────────────────────────────────────────
// inflatable_gorilla — Strip mall (route.json z 27000).
// A 9 m inflatable gorilla stands tethered on a car lot by the road. When the RV
// is ~170 m away a gust tears it loose: it bounces and tumbles down the road
// toward the RV (−z, ~9 m/s, hops up to 2.6 m), drifting into the RV's line.
// It is soft: touching it shoves the RV aside (small damage, some speed loss)
// and launches the gorilla up and back over the RV — where it can land on the
// chasing cops (blinds + pushes + damages them). Deflates after 4 RV hits, 40 s
// loose, or once it is far behind.
// Entities  inflatable_gorilla  variant 0 purple / 1 slate
//           state 0 tethered (wobble in place) · 1 loose (bouncing: y = height of its base,
//           tumble/spin with yaw; flail the arms) · 2 deflated (collapse flat over ~1.5 s)
// Colliders none (soft body; contact handled here).
// state()   { hits, airborne (bool), copHits }
// Unity: InflatableGorillaSetPiece.
// ─────────────────────────────────────────────────────────────────────────────
import { Scripted, H, clamp, copsNear } from './common.js';

const R = 2.6, HOP = 2.6;

export class InflatableGorilla extends Scripted {
  start() {
    const rng = this.rng, g = this.g, z = this.def.z;
    this.side = rng.sign();
    const u = this.side * (g.edge(z) + 7);
    this.go = this.body('inflatable_gorilla', rng.int(0, 1), 0, 0, g.heading(z) + Math.PI + this.side * 0.4, { s: z, u });
    this.place(this.go, z, u);
    this.wind = rng.float(8.5, 10.5);
    this.hopPh = 0;
    this.flying = false;
    this.hits = 0; this.copHits = 0;
    this.looseT = 0;
    this.copHit = new Map();
    this.phase = 'tethered';
  }

  _rvDist() {
    const rv = this.sim.rv, b = this.go, hl = rv.hl ?? 3;
    const s = Math.sin(rv.yaw), c = Math.cos(rv.yaw);
    const ax = rv.x + s * hl, az = rv.z + c * hl, dx = -2 * s * hl, dz = -2 * c * hl;
    const t = clamp(((b.x - ax) * dx + (b.z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    return Math.hypot(b.x - (ax + dx * t), b.z - (az + dz * t));
  }

  update(dt) {
    this.t += dt;
    this.tickBodies(dt);
    this.clearBlocks();
    const sim = this.sim, rv = sim.rv, b = this.go, g = this.g;
    if (this.phase === 'tethered') {
      b.state = 0;
      const d = b.z - rv.z;
      if (d < -20) { this.setPhase('missed'); this.done = true; return; }
      if (d < 170 || this.eta(b.z) < 7) {
        this.setPhase('loose', "THE GORILLA'S LOOSE!", 'bad');
        b.vz = -this.wind; b.vx = 0;
      } else return;
    }
    if (this.phase === 'loose') {
      this.looseT += dt;
      b.state = 1;
      if (this.flying) {
        b.vy -= 9.81 * dt;
        b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt;
        b.yaw += 4 * dt;
        if (b.y <= 0) { b.y = 0; this.flying = false; this.hopPh = 0; }
        b.u = g.uAt(b.x, b.z); b.s = b.z;
      } else {
        // bounce down the road with the wind, drifting into the RV's line
        const gust = 1 + 0.25 * Math.sin(this.t * 0.9);
        const ds = -this.wind * gust;
        const rvU = this.rvU();
        const ahead = b.z - rv.z;
        const targetU = ahead > 0 ? clamp(rvU, -g.hw(b.z) - 1, g.hw(b.z) + 1) : b.u;
        const du = clamp((targetU - b.u) * 0.7, -3.5, 3.5);
        b.u += du * dt; b.s += ds * dt;
        b.x = g.xAt(b.s, b.u); b.z = b.s;
        b.vx = g.slope(b.s) * ds - du; b.vz = ds; b.vy = 0;
        this.hopPh += dt * 2.3;
        b.y = HOP * Math.abs(Math.sin(this.hopPh));
        b.yaw += 1.3 * dt;
      }
      this._contactRv();
      this._contactCops();
      const behind = rv.z - b.z;
      if (!this.flying && (this.hits >= 4 || this.looseT > 40 || behind > 150)) this._deflate();
      if (b.y < 3) this.blockBody(b, R, R, 0.8);
    } else if (this.phase === 'deflated') {
      b.state = 2; b.y = 0;
      if (rv.z - b.z > 120 || this.t - this.deflateT > 25) this.done = true;
    }
  }

  _deflate() {
    this.flying = false;
    this.go.y = 0; this.go.vx = this.go.vz = this.go.vy = 0;
    this.deflateT = this.t;
    this.setPhase('deflated', this.hits >= 4 ? 'The gorilla deflates with a sad wheeze.' : null, 'good');
  }

  _contactRv() {
    const sim = this.sim, rv = sim.rv, b = this.go;
    if (b.y > 3.0 || b.hitCd > 0) return;
    if (this._rvDist() > R + (rv.r ?? 1.3)) return;
    b.hitCd = 1.0;
    this.hits++;
    const dx = b.x - rv.x, dz = b.z - rv.z, d = Math.hypot(dx, dz) || 1;
    // shove the RV away from it (mostly sideways) + a little speed loss and damage
    const side = (-(rv.vz ?? 0) * dx + (rv.vx ?? 0) * dz) >= 0 ? 1 : -1;
    const rx = -Math.cos(rv.yaw) * side, rz = Math.sin(rv.yaw) * side; // RV right/left
    H.push(sim, -rx * 3.5 - (dx / d) * 1.0, -rz * 3.5 - (dz / d) * 1.0, 0.25);
    H.damage(sim, 2, 'gorilla');
    sim.emit({ type: 'crash', x: b.x, z: b.z, power: 0.25 });
    // launch it up and back over the RV
    const rvx = rv.vx ?? Math.sin(rv.yaw) * rv.speed, rvz = rv.vz ?? Math.cos(rv.yaw) * rv.speed;
    b.vx = rvx * 0.3 + (dx / d) * 2; b.vz = rvz * 0.3 - 14; b.vy = 9.5;
    b.y = Math.max(b.y, 0.5);
    this.flying = true;
    if (this.hits === 1) this.say('BOING!', 'info');
  }

  _contactCops() {
    const sim = this.sim, b = this.go;
    if (b.y > 3.5) return;
    for (const c of copsNear(sim, b.x, b.z, R + 1.6)) {
      const last = this.copHit.get(c.id) ?? -9;
      if (this.t - last < 1.5) continue;
      this.copHit.set(c.id, this.t);
      this.copHits++;
      H.copEffect(sim, c.id, { push: { x: b.vx * 0.5, z: b.vz * 0.5 }, blind: 2.5, damage: 6 });
      if (this.copHits === 1) this.say('The gorilla smothers a cop car!', 'good');
    }
  }

  extraState() { return { hits: this.hits, airborne: this.flying, copHits: this.copHits }; }
}
