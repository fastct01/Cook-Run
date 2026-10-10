// ─────────────────────────────────────────────────────────────────────────────
// Road structures (route.json `structures[]`) — the static things the road has to
// know about. `structureLayout(track, route)` is a PURE function (no sim state) so
// the sim, the Autopilot and the renderer all agree on where the walls are.
//
//   garage        Rook's Garage at the start: walls with a roll-up door (closed until
//                 the tutorial's items.door ≥ 0.9), paved apron to the road, RV park.
//                 Frame G = the `rooks_garage` exterior: centre x = track.xAt(z, side·18),
//                 rotation.y = side·π/2 (door faces the road). In G: building x −9…9,
//                 z −9…5, roll-up door x −0.3…4.7 on the z = 5 wall, RV park (2.2, −2.2)
//                 facing +Z = the exterior `bay`. ONFOOT's garage_interior frame sits at
//                 offset (−1.8, −2.0) inside G (sim/garage.js EXT_OFFSET), so its door and
//                 rvPark (4.0, −0.2) land on exactly these spots.
//   rail_crossing the train event (events.js). `railLines` lists every rail line across the
//                 road (the main line + the freight_wagons yard siding, def.z + 24) so the
//                 sim (resets) and the Autopilot never park the RV on the rails; the
//                 no-props / no-patrol zone runs from z − 25 to past the siding (+11 m).
//   drawbridge    surface comes from the set-piece (sim.surfaceAt); here: deck rails.
//   overpass      renderer only.
//   toll_plaza    5 booth islands (u = 0, ±5, ±10; 10 m long, solid) → 4 booth lanes
//                 at u = ±2.5, ±7.5; guard walls from the outer islands to the verge.
//   car_wash      drive-through tunnel over the right-hand (side) lanes: walls at
//                 axisU ± 3.2 along z ± 9. The car_wash SET-PIECE decides the star drop
//                 (speed, cops watching); only when that plugin is missing / crashed does
//                 a pass with no cop within 40 m drop rules.heat.carWashDrop stars here.
//   cattle_grid   a rattle/bump across the road.
//   river_bridge  covered bridge: rails (|u| ≤ 3.6) like the canyon bridge deck.
// Unity port: StructureLayout (ScriptableObject baked from route.json) + StructureSystem.
// ─────────────────────────────────────────────────────────────────────────────
import { capsuleSegment, resolveStatic, updateCapsule } from './collisions.js';
import { clamp } from './util.js';

const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const _c = { nx: 0, nz: 0, depth: 0, px: 0, pz: 0 };

// Garage geometry in the rooks_garage (exterior) frame G, metres.
export const GARAGE_LOCAL = Object.freeze({
  room: { x0: -9, x1: 9, z0: -9, z1: 5 },
  door: { x0: -0.3, x1: 4.7, z: 5 },
  park: { x: 2.2, z: -2.2 },     // RV centre, nose toward the door (+Z)  (= exterior `bay`)
  offset: 18,                    // |u| of the garage centre
});

function garageLayout(track, s) {
  const G = GARAGE_LOCAL;
  const side = s.side ?? 1;
  const cu = side * (s.offset ?? G.offset);
  const cz = s.z, cx = track.xAt(cz, cu);
  const rotY = side * Math.PI / 2;
  const c = Math.cos(rotY), sn = Math.sin(rotY);
  const toWorld = (lx, lz) => ({ x: cx + lx * c + lz * sn, z: cz - lx * sn + lz * c });
  const toLocal = (x, z) => { const dx = x - cx, dz = z - cz; return { x: dx * c - dz * sn, z: dx * sn + dz * c }; };
  const R = G.room, D = G.door;
  const seg = (ax, az, bx, bz, extra = {}) => {
    const a = toWorld(ax, az), b = toWorld(bx, bz);
    return { ax: a.x, az: a.z, bx: b.x, bz: b.z, r: 0.25, kind: 'garage_wall', damage: 0, ...extra };
  };
  const walls = [
    seg(R.x0, R.z0, R.x1, R.z0), seg(R.x0, R.z0, R.x0, R.z1), seg(R.x1, R.z0, R.x1, R.z1),
    seg(R.x0, R.z1, D.x0, R.z1), seg(D.x1, R.z1, R.x1, R.z1),
  ];
  const door = seg(D.x0, D.z, D.x1, D.z, { kind: 'garage_door', door: true });
  const p = toWorld(G.park.x, G.park.z);
  const doorMid = toWorld((D.x0 + D.x1) / 2, D.z);
  const outside = toWorld((D.x0 + D.x1) / 2, D.z + 6);
  return {
    type: 'garage', z: cz, side, cu, cx, cz, rotY, toWorld, toLocal, walls, door,
    park: { x: p.x, z: p.z, yaw: rotY },
    doorMid, outside,                         // world points: door centre, 6 m outside the door
    zRange: [cz - Math.abs(R.x1 - R.x0) / 2 - 3, cz + Math.abs(R.x1 - R.x0) / 2 + 3],
    limitU: Math.abs(cu) + Math.abs(R.z0) + 2.5, // lateral drive limit on the garage side near it
  };
}

function tollLayout(track, s) {
  const z = s.z, hw = track.halfWidth(z), sh = track.shoulder(z);
  const islands = [-10, -5, 0, 5, 10], half = 5, r = 0.75;
  const segs = [];
  for (const u of islands) {
    const a = z - half + r, b = z + half - r;
    segs.push({ ax: track.xAt(a, u), az: a, bx: track.xAt(b, u), bz: b, r, kind: 'toll_island', damage: 6 });
  }
  // guard walls from the outer islands out past the verge (no driving round the plaza)
  const far = hw + sh + 40;
  for (const sgn of [1, -1]) {
    for (const zz of [z - half + 0.3, z + half - 0.3]) {
      segs.push({ ax: track.xAt(zz, sgn * (10 + r)), az: zz, bx: track.xAt(zz, sgn * far), bz: zz, r: 0.3, kind: 'toll_wall', damage: 4 });
    }
    segs.push({ ax: track.xAt(z - half + 0.3, sgn * far), az: z - half + 0.3, bx: track.xAt(z + half - 0.3, sgn * far), bz: z + half - 0.3, r: 0.3, kind: 'toll_wall', damage: 4 });
  }
  return { type: 'toll_plaza', z, from: z - half, to: z + half, islands, booths: [2.5, 7.5], segs, mergeDist: 70 };
}

function carWashLayout(track, s) {
  const z = s.z, side = s.side ?? 1, hw = track.halfWidth(z);
  const axisU = side * hw / 2, half = 9, wallOff = 3.2;
  const segs = [];
  for (const k of [-1, 1]) {
    const u = axisU + k * wallOff;
    segs.push({ ax: track.xAt(z - half, u), az: z - half, bx: track.xAt(z + half, u), bz: z + half, r: 0.2, kind: 'car_wash_wall', damage: 2 });
  }
  return { type: 'car_wash', z, side, from: z - half, to: z + half, axisU, halfIn: wallOff - 0.3, segs };
}

// Rail lines across the road: [{ z, kind: 'main' | 'siding' }] — train events + the freight
// yard siding (freight_wagons set-piece: def.z + (def.siding ?? 24)).
export function railLinesOf(route) {
  const out = [];
  for (const e of route.events || []) if (e.type === 'train') out.push({ z: e.z, kind: 'main' });
  for (const s of route.structures || []) if (s.type === 'rail_crossing' && !out.some((r) => Math.abs(r.z - s.z) < 3)) out.push({ z: s.z, kind: 'main' });
  for (const d of route.setpieces || []) if (d.type === 'freight_wagons' && d.z != null) out.push({ z: d.z + (d.siding ?? 24), kind: 'siding', id: d.id });
  return out.sort((a, b) => a.z - b.z);
}

export function structureLayout(track, route) {
  const L = { garage: null, tolls: [], carWashes: [], cattleGrids: [], rails: [], zones: [], segs: [], railLines: railLinesOf(route) };
  const br = route.bridge;
  for (const s of route.structures || []) {
    switch (s.type) {
      case 'garage': L.garage = garageLayout(track, s); L.zones.push([s.z - 60, s.z + 60, 'garage']); break;
      case 'toll_plaza': { const t = tollLayout(track, s); L.tolls.push(t); L.segs.push(...t.segs); L.zones.push([t.z - 80, t.z + 40, 'toll_plaza']); break; }
      case 'car_wash': { const w = carWashLayout(track, s); L.carWashes.push(w); L.segs.push(...w.segs); L.zones.push([w.from - 40, w.to + 30, 'car_wash']); break; }
      case 'cattle_grid': L.cattleGrids.push({ z: s.z, half: 1.2 }); L.zones.push([s.z - 15, s.z + 15, 'cattle_grid']); break;
      case 'river_bridge': L.rails.push({ from: s.from, to: s.to, half: (s.innerHalf ?? 3.6), taper: 25, kind: 'river_bridge' }); L.zones.push([s.from - 40, s.to + 40, 'river_bridge']); break;
      case 'drawbridge': {
        const zm = (s.from + s.to) / 2;
        L.rails.push({ from: s.from - 30, to: s.to + 30, half: track.halfWidth(zm) + 0.8, taper: 20, kind: 'drawbridge' });
        L.zones.push([s.from - 60, s.to + 60, 'drawbridge']);
        break;
      }
      case 'rail_crossing': {
        // cover the yard siding past the main line too (freight wagons, z + 24 → zone to ~z + 35)
        let to = s.z + 25;
        for (const r of L.railLines) if (r.z > s.z && r.z - s.z < 60) to = Math.max(to, r.z + 11);
        L.zones.push([s.z - 25, to, 'rail_crossing']);
        break;
      }
      case 'overpass': L.zones.push([s.z - 15, s.z + 15, 'overpass']); break;
      default: if (s.z != null) L.zones.push([s.z - 20, s.z + 20, s.type]);
    }
  }
  if (br) L.zones.push([br.rampStart - 40, br.landingEnd + 25, 'bridge']);
  return L;
}

// Rail zones (bridge decks): strongest taper weight t (0..1) and the deck half-width there.
export function railAt(layout, z) {
  let best = null;
  for (const r of layout.rails) {
    if (z < r.from - r.taper - 5 || z > r.to + r.taper + 5) continue;
    let t;
    if (z < r.from) t = smooth01((z - (r.from - r.taper)) / r.taper);
    else if (z <= r.to) t = 1;
    else t = 1 - smooth01((z - r.to) / r.taper);
    if (t > 0 && (!best || t > best.t)) best = { t, half: r.half, kind: r.kind };
  }
  return best;
}

// Booth-lane remap near a toll plaza: returns the target u for a lane (dir, rank) or null.
export function tollLaneU(layout, z, dir, rank, nominalU) {
  for (const t of layout.tolls) {
    const d = (t.z - z) * dir;                         // metres until the plaza in our direction
    if (d < -t.mergeDist * 0.5 || d > t.mergeDist + 10) continue;
    const booth = dir * (rank <= 0 ? t.booths[0] : t.booths[1]);
    const w = d > 0 ? 1 - smooth01((d - 12) / (t.mergeDist - 12)) : 1 - smooth01((-d - 15) / 20);
    return nominalU + (booth - nominalU) * w;
  }
  return null;
}

export class StructureSystem {
  constructor(sim) {
    this.sim = sim;
    this.layout = structureLayout(sim.track, sim.route);
    this.garage = this.layout.garage;
    this.segs = this.layout.segs;
    this.washState = this.layout.carWashes.map(() => ({ inside: false, used: false, dropT: -1 }));
    this.grids = this.layout.cattleGrids.map(() => ({ crossedAt: -99 }));
    this.carWashDropped = false;
    this.hitCd = new Map();
  }

  // ── queries ──────────────────────────────────────────────────────────────
  doorClosed() {
    const sim = this.sim;
    if (!this.garage) return false;
    if (sim.phase === 'garage') return true;
    if (sim.phase === 'drive' && sim.driveTime > 2.5) return false; // never trap the RV
    const st = sim.garage && sim.garage.state ? sim._safeGarageState() : null;
    const door = st && st.items ? +st.items.door : NaN;
    return Number.isFinite(door) ? door < 0.9 : false;
  }

  // Paved, non-road ground (garage floor + apron): no off-road slow/rumble.
  pavedAt(x, z) {
    const g = this.garage;
    if (!g || z < g.zRange[0] || z > g.zRange[1]) return false;
    const l = g.toLocal(x, z), R = GARAGE_LOCAL.room;
    if (l.x < R.x0 - 2 || l.x > R.x1 + 2) return false;
    if (l.z >= R.z0 - 0.5 && l.z <= R.z1) return true;
    // apron: between the door wall and the road edge
    const u = this.sim.road.uAt(x, z) * g.side;
    return l.z > R.z1 && u >= this.sim.road.hw(z) - 0.5;
  }

  // Extra lateral room on the garage side near the start.
  sideLimit(z, side) {
    const g = this.garage;
    if (!g || side !== g.side || z < g.zRange[0] || z > g.zRange[1]) return 0;
    return g.limitU;
  }

  // The car_wash set-piece is running for this tunnel: it alone decides the star drop
  // (a pass it refused — too fast / a cop watching — must not drop a star here).
  _washPluginLive(w) {
    const host = this.sim.setpieces;
    const act = host && Array.isArray(host.active) ? host.active : [];
    return act.some((sp) => sp && !sp.done && (sp.type ?? sp.def?.type) === 'car_wash' && Math.abs((sp.def?.z ?? w.z) - w.z) < 60);
  }

  inZone(z, pad = 0) {
    for (const [a, b] of this.layout.zones) if (z >= a - pad && z <= b + pad) return true;
    return false;
  }

  // ── collisions with static structure segments ─────────────────────────────
  // body: any capsule body (rv / car / cop). Returns the worst closing speed.
  collideBody(b, isRv) {
    let worst = 0;
    const segs = this.segs;
    for (let i = 0; i < segs.length; i++) worst = Math.max(worst, this._seg(b, segs[i], isRv));
    const g = this.garage;
    if (g && Math.abs(b.z - g.cz) < 20) {
      for (const s of g.walls) worst = Math.max(worst, this._seg(b, s, isRv));
      if (this.doorClosed()) worst = Math.max(worst, this._seg(b, g.door, isRv));
    }
    return worst;
  }

  _seg(b, s, isRv) {
    const zmin = Math.min(s.az, s.bz) - s.r - b.hl - b.r - 1, zmax = Math.max(s.az, s.bz) + s.r + b.hl + b.r + 1;
    if (b.z < zmin || b.z > zmax) return 0;
    if (!capsuleSegment(b, s.ax, s.az, s.bx, s.bz, s.r, _c)) return 0;
    const vn = resolveStatic(b, _c, 0.15);
    updateCapsule(b);
    if (isRv && vn > 0) {
      const sim = this.sim, R = sim.rules.rv;
      if (vn > R.minCrashSpeed) {
        sim.damageRv(R.crashDamagePerMps * (vn - R.minCrashSpeed) * 0.8 + (s.damage || 0) * clamp(vn / 15, 0, 1), 'wall');
        sim.addBump(Math.min(1, vn / 12));
        const key = s.kind;
        if ((this.hitCd.get(key) ?? -99) < sim.t - 0.5) { this.hitCd.set(key, sim.t); sim.emit({ type: 'crash', x: _c.px, z: _c.pz, power: clamp(vn / 20, 0.1, 1) }); }
      } else if (vn > 1) sim.addBump(Math.min(0.4, vn / 10));
    }
    return vn;
  }

  // ── per step: car wash heat drop, cattle-grid rattle ─────────────────────
  update(dt) {
    const sim = this.sim, rv = sim.rv, road = sim.road;
    if (sim.phase !== 'drive') return;
    const u = road.uAt(rv.x, rv.z);
    this.layout.carWashes.forEach((w, i) => {
      const st = this.washState[i];
      const inside = !rv.airborne && rv.z >= w.from && rv.z <= w.to && Math.abs(u - w.axisU) <= w.halfIn;
      if (inside) {
        sim.setFx({ fog: 0.55 }, 0.6);               // soap on the windscreen
        if (!st.inside) st.entered = rv.z;
      }
      if (st.inside && !inside && rv.z > w.to - 0.5 && st.entered != null && st.entered < w.from + 6 && !st.used) {
        st.dropT = sim.t + 0.4;                        // give the set-piece a moment to do it itself
      }
      st.inside = inside;
      if (st.dropT > 0 && sim.t >= st.dropT) {
        st.dropT = -1;
        if (!st.used && !this.carWashDropped && !this._washPluginLive(w)) {
          st.used = true;
          const near = sim.copsList().some((c) => c.kind !== 'heli' && c.state === 1 && Math.hypot(c.x - rv.x, c.z - rv.z) < (sim.rules.heat.carWashCopRange ?? 40));
          if (sim.heat.stars >= 1 && !near) sim.dropStars(sim.rules.heat.carWashDrop ?? 1, 'carWash');
          else if (sim.heat.stars >= 1) sim.msg('Too many cops around — the car wash didn\'t help.', 'bad');
          else sim.msg('Squeaky clean!', 'good');
        }
      }
    });
    this.layout.cattleGrids.forEach((g, i) => {
      const st = this.grids[i];
      if (Math.abs(rv.z - g.z) < g.half + rv.hl && !rv.airborne && Math.abs(rv.speed) > 2 && sim.t - st.crossedAt > 0.8) {
        st.crossedAt = sim.t;
        sim.addBump(clamp(0.25 + Math.abs(rv.speed) / 40, 0.25, 0.7));
      }
    });
  }
}
