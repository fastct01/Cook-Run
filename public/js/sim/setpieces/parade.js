// ─────────────────────────────────────────────────────────────────────────────
// parade — Founders' Day parade on Old Town Main Street (route.json 9900–10300, side 1).
// A procession (band row · band row · float A · band row · float B, ~37 m long)
// marches down the lanes TOWARD the RV (−z) at 2 m/s, filling both lanes and the
// far (left) kerb. The free detour is the sidewalk/market alley on def.side (+1 =
// driver's right): u ∈ [hw+0.3, hw+sh+sideRoom−1] (inside the normal drive limit,
// no off-road permission needed).
//  • band members march in formation; when the RV comes at them (horn = from 28 m,
//    otherwise from 9 m at > 6 m/s) they scatter sideways, then fall back in line.
//    Hitting one = slapstick knock (flies, sits dazed, gets up) + ped-hit heat.
//  • the floats are solid and slow. If the RV sits right in front of a float the
//    whole parade halts; after 10 s the marshal waves the floats over to the left
//    lane so the right lane opens ("make way"). Never a soft-lock.
//  • at the end of the route (nearest cross street at/after def.from) every unit
//    turns off left and leaves.
// Entities  parade_float  variant 0 prospector / 1 saguaro · state 0 moving, 1 halted, 2 turning off
//           band_member   variant 0 tuba / 1 bass drum / 2 trumpet · state (ped convention)
//                         0 marching, 1 scattering (run), 2 knocked (airborne, y>0), 3 dazed on the
//                         ground, 4 getting up
// Colliders floats: solid circles (12.6 × 3.0). Band members: handled here (soft knock).
// state()   { head, tail (z), detourSide, free:[u0,u1], halted, makeway }
// Unity: ParadeSetPiece.
// ─────────────────────────────────────────────────────────────────────────────
import { Scripted, H, clamp, approach } from './common.js';

const MARCH = 2.0, FLOAT_LEN = 12.6, FLOAT_WID = 3.0;

export class Parade extends Scripted {
  start() {
    const rng = this.rng, g = this.g, d = this.def;
    this.side = d.side ?? 1;
    this.from = d.from; this.to = d.to;
    // turn-off point: first cross street inside the zone (else the zone start)
    const ints = this.sim.track.intersectionZs ? this.sim.track.intersectionZs() : [];
    this.turnZ = ints.find((z) => z >= d.from - 5 && z <= d.from + 120) ?? d.from;
    this.head = Math.min(d.to - 150, d.from + 250);
    this.haltT = 0; this.makeway = false; this.halted = false;
    const zr = this.head + 20, hw = g.hw(zr), sh = g.sh(zr);
    const s = this.side;
    const v0 = rng.int(0, 1);
    // formation slots: off = metres behind the head (toward +z), u lateral (mirrored by side)
    const slots = [
      ['band', 0, -s * (hw + 0.6)], ['band', 0, -s * 1.15], ['band', 0, s * 1.15], ['band', 0, s * (hw - 0.55)],
      ['band', 2.6, -s * 2.2], ['band', 2.6, 0], ['band', 2.6, s * 2.2],
      ['float', 11, -s * 0.4, v0],
      ['band', 21, -s * 2.2], ['band', 21, 0], ['band', 21, s * 2.2],
      ['float', 31, -s * 0.4, 1 - v0],
    ];
    let bi = 0;
    for (const [k, off, u, v] of slots) {
      if (k === 'float') {
        const b = this.body('parade_float', v, 0, 0, 0, { off, slotU: u, u, isFloat: true, turning: false, gone: false });
        b.vz = -MARCH;
      } else {
        const b = this.body('band_member', bi % 3, 0, 0, 0, { off, slotU: u, u, isFloat: false, du: 0, dz: 0, timer: 0, turning: false, gone: false, phase0: rng.float(0, 6.28) });
        b.vz = -MARCH;
        bi++;
      }
    }
    this.knocks = 0;
    this._layout(0);
    this.phase = 'idle';
  }

  _free() {
    const z = this.head, g = this.g, hw = g.hw(z), sh = g.sh(z), room = g.room(z);
    return this.side > 0 ? [hw + 0.3, hw + sh + room - 1] : [-(hw + sh + room - 1), -(hw + 0.3)];
  }

  _layout(dt) {
    const g = this.g, h = g.heading(this.head);
    const s = this.side, hw = g.hw(this.head);
    for (const b of this.bodies) {
      if (b.gone) continue;
      if (b.turning) {
        // turned off into the side street (toward −side): walk/drive out laterally
        b.u -= s * MARCH * 1.2 * dt;
        b.yaw = h + (s > 0 ? Math.PI / 2 : -Math.PI / 2);
        if (Math.abs(b.u) > g.limit(b.z) + 8) { b.gone = true; b.alive = false; }
        b.x = g.xAt(b.z, b.u);
        continue;
      }
      const z = this.head + b.off;
      if (b.isFloat) {
        const target = this.makeway ? -s * (hw - FLOAT_WID / 2 + 0.2) : b.slotU;
        b.u = approach(b.u, target, 1.2 * dt);
        b.z = z; b.y = 0;
        b.yaw = h + Math.PI;
        b.state = this.halted ? 1 : 0;
      } else if (b.state === 0) {
        const mw = s > 0 ? Math.min(b.slotU, -1.2 - 0.9 * b.variant) : Math.max(b.slotU, 1.2 + 0.9 * b.variant);
        let tu = this.makeway ? mw : b.slotU;
        // the RV is inside the procession: members stay clear of it (step round, don't clip)
        const rv = this.sim.rv, rvU = g.uAt(rv.x, rv.z);
        if (Math.abs(z - rv.z) < 6.5 && Math.abs(tu - rvU) < 2.9) tu = rvU + (tu >= rvU ? 2.9 : -2.9);
        b.u = approach(b.u, tu, 2.0 * dt);
        b.dz = approach(b.dz, 0, 1.5 * dt);
        b.z = z + b.dz;
        b.yaw = h + Math.PI;
      }
      b.x = g.xAt(b.z, b.u);
    }
  }

  _rvSeg() {
    const rv = this.sim.rv, hl = rv.hl ?? 3.0;
    const s = Math.sin(rv.yaw), c = Math.cos(rv.yaw);
    return { ax: rv.x + s * hl, az: rv.z + c * hl, bx: rv.x - s * hl, bz: rv.z - c * hl, r: rv.r ?? 1.3 };
  }
  _distToRv(x, z, seg) {
    const dx = seg.bx - seg.ax, dz = seg.bz - seg.az;
    const L = dx * dx + dz * dz || 1;
    const t = clamp(((x - seg.ax) * dx + (z - seg.az) * dz) / L, 0, 1);
    return Math.hypot(x - (seg.ax + dx * t), z - (seg.az + dz * t));
  }

  _band(b, dt, seg) {
    const sim = this.sim, rv = sim.rv, g = this.g, s = this.side;
    const rvU = this.rvU();
    const front = b.z - rv.z;                 // > 0: the member is ahead of the RV
    const v = Math.abs(rv.speed || 0);
    if (b.state === 0 && !b.turning) {
      const near = Math.abs(b.u - rvU) < 3.2;
      const threat = near && front > -2 && (front < 5.5 || (rv.horn && front < 28) || (v > 6 && front < 9 + v * 0.35));
      if (threat) {
        b.state = 1; b.timer = 2.2;
        const dir = b.u <= rvU ? -1 : 1;
        b.runTo = clamp(b.u + dir * 4.5, -(g.edge(b.z) + 2), g.edge(b.z) + g.room(b.z) - 1);
        // never run into the detour while the RV is on it
        if (s > 0 && b.runTo > g.hw(b.z) && rvU > g.hw(b.z) - 0.5) b.runTo = Math.min(b.u - 3.8, g.hw(b.z) - 3.6);
        if (s < 0 && b.runTo < -g.hw(b.z) && rvU < -g.hw(b.z) + 0.5) b.runTo = Math.max(b.u + 3.8, -g.hw(b.z) + 3.6);
      }
    }
    if (b.state === 1) {
      b.u = approach(b.u, b.runTo, 4.5 * dt);
      b.z += -MARCH * 0.3 * dt; b.dz = b.z - (this.head + b.off);
      b.yaw = g.heading(b.z) + (b.runTo < b.u ? Math.PI / 2 : -Math.PI / 2);
      b.timer -= dt;
      if (b.timer <= 0 && (rv.z > b.z + 6 || Math.abs(b.u - rvU) > 3.6)) b.state = 0;
      b.x = g.xAt(b.z, b.u);
    } else if (b.state === 2) {
      b.vy -= 9.81 * dt; b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt; b.yaw += 6 * dt;
      if (b.y <= 0) { b.y = 0; b.state = 3; b.timer = 2.0; b.vx = b.vz = 0; b.vz = -MARCH; }
      b.u = g.uAt(b.x, b.z);
    } else if (b.state === 3) {
      b.timer -= dt; if (b.timer <= 0) { b.state = 4; b.timer = 1.2; }
    } else if (b.state === 4) {
      b.timer -= dt; if (b.timer <= 0) { b.state = 0; b.dz = b.z - (this.head + b.off); b.vz = -MARCH; }
    }
    // RV contact → slapstick knock
    if (b.state <= 1 && b.hitCd <= 0 && v > 2 && this._distToRv(b.x, b.z, seg) < seg.r + 0.45) {
      b.state = 2; b.hitCd = 3;
      b.vx = (rv.vx ?? 0) * 0.55 + (b.x - rv.x) * 1.2; b.vz = (rv.vz ?? 0) * 0.55; b.vy = 3.5 + v * 0.18; b.y = 0.3;
      this.knocks++;
      const hp = sim.data.rules?.heat?.sources?.pedHit ?? 0.45;
      H.heat(sim, hp, 'pedHit');
      sim.emit({ type: 'pedHit', x: b.x, z: b.z });
      if (this.knocks === 1) this.say('Bandsman down! Oompah!', 'bad');
    }
  }

  update(dt) {
    this.t += dt;
    this.tickBodies(dt);
    this.clearBlocks();
    const rv = this.sim.rv, g = this.g, s = this.side;
    const rvU = this.rvU();
    // halt if the RV sits right in front of a float (inside the road)
    let blockedByRv = false;
    for (const b of this.bodies) {
      if (!b.isFloat || b.turning || b.gone) continue;
      const front = (b.z - FLOAT_LEN / 2) - rv.z;
      if (front > -2 && front < 9 && Math.abs(b.u - rvU) < FLOAT_WID / 2 + 1.6 && Math.abs(rv.speed || 0) < 4) blockedByRv = true;
    }
    this.halted = blockedByRv;
    if (blockedByRv) {
      this.haltT += dt;
      if (this.haltT > 10 && !this.makeway) { this.makeway = true; this.say('The marshal waves you through!', 'good'); }
    } else this.haltT = Math.max(0, this.haltT - dt * 0.5);
    if (this.makeway && rv.z > this.head + 45) this.makeway = false;

    if (!this.halted) this.head -= MARCH * dt;
    // turn off at the end of the route
    for (const b of this.bodies) {
      if (!b.turning && !b.gone && (b.state === 0 || b.isFloat) && this.head + b.off <= this.turnZ) {
        b.turning = true; b.z = this.turnZ; b.state = b.isFloat ? 2 : 0;
      }
    }
    this._layout(dt);
    const seg = this._rvSeg();
    for (const b of this.bodies) if (!b.isFloat && !b.gone && !b.turning) this._band(b, dt, seg);

    // phases / captions
    const d = this.head - rv.z;
    if (this.phase === 'idle' && d < 230) this.setPhase('marching', "FOUNDERS' DAY PARADE — take the sidewalk!", 'info');
    if (this.bodies.every((b) => b.gone)) { this.setPhase('over'); if (rv.z > this.turnZ + 60) this.done = true; }

    // blocked road boxes (everything but the free detour band)
    const free = this._free();
    for (const b of this.bodies) {
      if (b.gone) continue;
      if (b.isFloat) this.blockBody(b, FLOAT_LEN / 2, FLOAT_WID / 2, 1.0);
      else if (b.state === 0) this.blockBody(b, 0.6, 0.6, 0.9);
    }
    // the procession as a whole: lanes on the parade side of the free band
    const tail = this.head + 37.3;
    if (this.bodies.some((b) => !b.gone && !b.turning)) {
      const hw = g.hw(this.head);
      if (this.makeway) this.block(this.head - 1, tail + 1, s > 0 ? -(hw + 2) : 0, s > 0 ? 0 : hw + 2);
      else this.block(this.head - 1, tail + 1, s > 0 ? -(hw + 2) : free[1] + 0.01, s > 0 ? free[0] - 0.01 : hw + 2);
    }
  }

  colliders(out) {
    for (const b of this.bodies) {
      if (!b.isFloat || b.gone) continue;
      if (Math.abs(b.z - this.sim.rv.z) > 40) continue;
      this.solidBox(out, b, FLOAT_LEN, FLOAT_WID, { damage: 5, speedLoss: 0.4, minSpeed: 2 });
    }
  }

  extraState() {
    const r1 = (v) => Math.round(v * 10) / 10;
    const f = this._free();
    return { head: r1(this.head), tail: r1(this.head + 37.3), detourSide: this.side, free: [r1(f[0]), r1(f[1])], halted: this.halted, makeway: this.makeway };
  }
}
