// ─────────────────────────────────────────────────────────────────────────────
// Vehicle physics.
//  • RV: arcade model in the XZ plane — throttle/brake/reverse, speed-sensitive
//    steering, grip-limited lateral velocity (handbrake → drift), off-road
//    slowdown + bump noise, hard lateral limits (buildings / canyon walls / bridge
//    rails), ramp-following Y, ballistic flight off the canyon lip.
//  • aiDrive(): shared "pure pursuit" controller for traffic, cops and the rival.
// Expansion: per-side lateral limits (freeway median barrier at u≈0, the garage side
// near the start, structure rails on bridge decks), the garage/countdown phases keep
// the RV parked, hazard effects (slipT/slipK grip loss, foamT speed cap, shockT lost
// steering), and generic gaps (drawbridge via the set-piece surface): falling below
// −5 m outside the canyon → sim.onFellGeneric().
// Unity port: RvController (MonoBehaviour, FixedUpdate) + AiCarMotor.
// Conventions: forward = (sin yaw, cos yaw), driver's right = (-cos yaw, sin yaw);
// steering right (+steer) ⇒ yaw decreases. Lateral road offset u>0 = driver's right.
// ─────────────────────────────────────────────────────────────────────────────
import { clamp, approach, wrapAngle, lerp } from './util.js';
import { initBodyShape, updateCapsule } from './collisions.js';
import { railAt } from './structures.js';

const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

export function createRv(sim) {
  const R = sim.rules.rv;
  const rv = {
    cat: 'rv', id: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0,
    vx: 0, vz: 0, vy: 0, w: 0, speed: 0, steer: 0, drift: 0,
    hp: R.maxHp, airborne: false, nitroT: 0, flatT: 0, onRoad: true, zone: 'road',
    grace: 0, groundVy: 0, horn: false, handbrake: false, resetCd: 0, latAcc: 0,
    oilT: 0, sandT: 0, bumpT: 0, airStartZ: 0, wallCd: 0,
    slipT: 0, slipK: 1, foamT: 0, foamTo: 4, shockT: 0, regen: false, roofDoc: false, medSide: 1,
  };
  initBodyShape(rv, R.length, R.width, sim.cfg.rv.mass, 0.6);
  return rv;
}

// The lane the RV starts/respawns in: the rightmost-but-one forward lane (u > 0).
export function forwardLaneU(road, z) {
  const n = road.lanesPerDir(z);
  return road.laneU(z, 1, Math.max(0, n - 2));
}

export function placeRv(sim, z, u, yaw = null, x = null) {
  const rv = sim.rv, road = sim.road;
  rv.z = z; rv.x = x ?? road.xAt(z, u); rv.yaw = yaw ?? road.heading(z);
  rv.vx = rv.vz = rv.vy = rv.w = 0; rv.speed = 0; rv.steer = 0; rv.drift = 0;
  rv.slipT = 0; rv.foamT = 0; rv.shockT = 0; rv.medSide = road.uAt(rv.x, z) >= 0 ? 1 : -1;
  rv.airborne = false; rv.groundVy = 0; rv.pitch = 0; rv.roll = 0; rv.latAcc = 0;
  const sy = road.surfaceY(z); rv.y = sy == null ? 0 : sy;
  updateCapsule(rv);
}

// Is the RV standing on a paved lot (supply stop or the drive-in)?
function inPavedLot(sim, x, z) {
  return sim.stops.lotAt(x, z) != null || sim.isNearSell(x, z, 4) || !!(sim.structures && sim.structures.pavedAt(x, z));
}

// Horizontal control + integration. Vertical handled by updateRvVertical.
export function updateRvControl(sim, input, dt) {
  const rv = sim.rv, R = sim.rules.rv, C = sim.cfg.rv, road = sim.road;
  const g = sim.g;
  const driving = sim.phase === 'drive';
  if (sim.phase === 'countdown' || sim.phase === 'garage') {
    rv.vx = rv.vz = rv.w = 0; rv.speed = 0;
    rv.steer = approach(rv.steer, clamp(input.steer || 0, -1, 1), C.steerFollow * dt);
    return;
  }
  let throttle = driving ? clamp(input.throttle || 0, -1, 1) : 0;
  let steerIn = driving ? clamp(input.steer || 0, -1, 1) : 0;
  const handbrake = driving ? !!input.handbrake : true; // after the end: park it
  rv.handbrake = handbrake;

  if (rv.nitroT > 0) { rv.nitroT = Math.max(0, rv.nitroT - dt); if (throttle >= 0) throttle = 1; }
  if (rv.flatT > 0) {
    rv.flatT = Math.max(0, rv.flatT - dt);
    const s = Math.abs(rv.speed) / Math.max(1, R.topSpeed);
    steerIn = clamp(steerIn + C.flatWobble * s * (Math.sin(sim.t * 9.3) * 0.7 + 0.45), -1, 1);
  }
  if (rv.oilT > 0) rv.oilT -= dt;
  if (rv.sandT > 0) rv.sandT -= dt;
  if (rv.resetCd > 0) rv.resetCd -= dt;
  if (rv.wallCd > 0) rv.wallCd -= dt;
  if (rv.slipT > 0) { rv.slipT -= dt; if (rv.slipT <= 0) rv.slipK = 1; }
  if (rv.foamT > 0) rv.foamT -= dt;
  if (rv.shockT > 0) {
    rv.shockT -= dt;
    steerIn = 0.35 * Math.sin(sim.t * 23.0);   // live wire: the wheel jerks, no steering
  }

  // steering wheel follows input (faster when returning to centre is not requested)
  const rate = Math.abs(steerIn) < 0.01 ? R.steerReturn : C.steerFollow;
  rv.steer = approach(rv.steer, steerIn, rate * dt);

  if (rv.airborne) { rv.w *= Math.max(0, 1 - 1.5 * dt); return integrateAir(rv, dt); }

  // ── surface zone
  const u = road.uAt(rv.x, rv.z), hw = road.hw(rv.z), sh = road.sh(rv.z), au = Math.abs(u);
  const lot = au > hw && inPavedLot(sim, rv.x, rv.z);
  let zone = au <= hw ? 'road' : lot ? 'lot' : au <= hw + sh ? 'shoulder' : 'dirt';
  rv.zone = zone; rv.onRoad = zone === 'road' || zone === 'lot';
  const biome = road.biome(rv.z);
  const sandy = (C.sandBiomes || ['ghosttown', 'hideout']).includes(biome.id);
  let topFactor = 1, grip = R.gripCity;
  if (zone === 'shoulder') topFactor = C.shoulderSlow;
  else if (zone === 'dirt') { topFactor = sandy ? R.sandSlow : R.offroadSlow; grip = R.gripOffroad; }
  if (handbrake) grip *= C.handbrakeGrip;
  if (rv.oilT > 0) grip *= C.oilGrip;
  if (rv.slipT > 0) grip *= rv.slipK;
  const aLatMax = grip * g * C.gripScale;

  // ── yaw (kinematic yaw-rate target; the velocity follows through grip)
  const s0 = Math.sin(rv.yaw), c0 = Math.cos(rv.yaw);
  const vF0 = rv.vx * s0 + rv.vz * c0;
  const av = Math.abs(vF0);
  const f = Math.min(1, av / C.steerFullAt) / (1 + Math.max(0, av - C.steerFullAt) / C.steerFalloff);
  let wT = -rv.steer * R.steerRate * f * (vF0 >= 0 ? 1 : -1);
  if (handbrake && av > 3) wT *= C.handbrakeYaw;
  rv.w += (wT - rv.w) * Math.min(1, 8 * dt);
  rv.yaw += rv.w * dt;

  // ── decompose velocity in the new frame
  const s = Math.sin(rv.yaw), c = Math.cos(rv.yaw);
  let vF = rv.vx * s + rv.vz * c;
  let vR = -rv.vx * c + rv.vz * s;

  // ── longitudinal
  const nitro = rv.nitroT > 0;
  let top = (nitro ? R.nitroSpeed : R.topSpeed) * topFactor * (rv.flatT > 0 ? C.flatTopFactor : 1);
  if (rv.foamT > 0) top = Math.min(top, rv.foamTo);
  const acc = nitro ? R.nitroAccel : R.accel;
  const coast = C.rollDecel + R.drag * C.dragScale * Math.abs(vF);
  if (throttle > 0.01) {
    if (vF < -0.5) vF = Math.min(0, vF + R.brake * throttle * dt);
    else if (vF < top) vF = Math.min(top, vF + acc * throttle * Math.max(0.25, 1 - 0.75 * (vF / top) ** 2) * dt);
    else vF = Math.max(top, vF - Math.max(coast, C.overspeedDecel) * dt);
  } else if (throttle < -0.01) {
    const rtop = R.reverseSpeed * Math.max(0.6, topFactor);
    if (vF > 0.5) vF = Math.max(0, vF - R.brake * -throttle * dt);
    else if (vF > -rtop) vF = Math.max(-rtop, vF - acc * 0.6 * -throttle * dt);
    else vF = Math.min(-rtop, vF + C.overspeedDecel * dt);
  } else {
    const d = vF > top ? Math.max(coast, C.overspeedDecel) : coast;
    vF = approach(vF, 0, d * dt);
  }
  if (rv.foamT > 0 && vF > top) vF = Math.max(top, vF - (C.foamDecel ?? 14) * dt);
  if (handbrake) vF = approach(vF, 0, C.handbrakeDecel * dt);
  // drag patches (sand drift, water, flood): a hard slowdown at speed, but never stronger than the
  // engine at a crawl, so the RV can always drive out of one
  if (rv.sandT > 0) vF = approach(vF, 0, (C.sandDriftDecel ?? 12) * clamp(Math.abs(vF) / 12, 0.15, 1) * dt);
  // ramp: gravity along the slope
  const sl = surfaceSlope(road, rv.z);
  if (sl !== 0) vF -= g * Math.sin(Math.atan(sl)) * dt;

  // ── lateral grip
  vR = approach(vR, 0, aLatMax * dt);
  rv.vx = s * vF - c * vR;
  rv.vz = c * vF + s * vR;
  rv.x += rv.vx * dt; rv.z += rv.vz * dt;
  rv.speed = vF; rv.drift = vR;
  updateCapsule(rv);

  // off-road rumble
  if (zone === 'dirt' && av > 3) {
    rv.bumpT -= dt;
    if (rv.bumpT <= 0) {
      rv.bumpT = 0.12 + sim.rngFx.float(0, 0.2);
      sim.addBump((0.08 + sim.rngFx.float(0, 0.25)) * Math.min(1, av / 22));
    }
  }
}

function integrateAir(rv, dt) {
  rv.x += rv.vx * dt; rv.z += rv.vz * dt; rv.yaw += rv.w * dt;
  updateCapsule(rv);
}

export function surfaceSlope(road, z) {
  const a = road.surfaceY(z - 0.25), b = road.surfaceY(z + 0.25);
  if (a == null || b == null) return 0;
  return (b - a) / 0.5;
}

// Vertical: follow the surface, launch off the lip, ballistic flight, landing, falling.
export function updateRvVertical(sim, dt, prevZ) {
  const rv = sim.rv, road = sim.road, C = sim.cfg.rv, br = sim.route.bridge;
  const g = sim.g;
  const canyon = !!br && rv.z > br.rampStart - 5 && rv.z < br.landingEnd + 5;
  if (!rv.airborne) {
    const sy = road.surfaceY(rv.z);
    if (sy == null) {
      rv.airborne = true; rv.vy = rv.groundVy; rv.airStartZ = rv.z;
      rv.airCanyon = canyon;
      sim.emit({ type: 'jump', at: canyon ? 'canyon' : 'gap' });
      if (canyon) sim.bridgeSys.onLaunch(rv.speed);
    } else {
      const prevY = rv.y;
      rv.y = sy;
      rv.groundVy = dt > 0 ? (sy - prevY) / dt : 0;
      const pT = Math.atan(surfaceSlope(road, rv.z));
      rv.pitch = approach(rv.pitch, pT, 1.5 * dt);
      const rT = clamp(rv.latAcc * 0.012, -0.12, 0.12);
      rv.roll += (rT - rv.roll) * Math.min(1, 6 * dt);
      return;
    }
  }
  // airborne
  rv.vy -= g * dt;
  rv.y += rv.vy * dt;
  const hs = Math.hypot(rv.vx, rv.vz);
  rv.pitch = approach(rv.pitch, Math.atan2(rv.vy, Math.max(4, hs)) * 0.7, 1.6 * dt);
  rv.roll *= Math.max(0, 1 - 2 * dt);
  const sy = road.surfaceY(rv.z);
  if (sy != null && rv.y <= sy) {
    if (rv.y < sy - 1.0) {
      // smacked into the face of the far deck / an abutment: bounce back and keep falling
      const back = Math.sign(rv.z - prevZ) || 1;
      rv.z = (br && prevZ < br.gapEnd && rv.z >= br.gapEnd) ? br.gapEnd - 0.05 : prevZ - back * 0.05;
      rv.vz = -0.15 * rv.vz; rv.vx *= 0.3; rv.w *= 0.3;
      updateCapsule(rv);
      sim.addBump(1);
      sim.damageRv(8, 'wall');
      sim.emit({ type: 'crash', x: rv.x, z: rv.z, power: 1 });
    } else {
      const vy = rv.vy;
      rv.y = sy; rv.vy = 0; rv.airborne = false; rv.groundVy = 0;
      const hard = vy < C.hardLandingVy;
      if (hard) sim.damageRv(C.hardLandingBase + (C.hardLandingVy - vy) * C.hardLandingDamagePerMps, 'landing');
      sim.addBump(clamp(Math.abs(vy) / 12, 0.3, 1));
      sim.emit({ type: 'landed', hard });
      if (rv.airCanyon || canyon) sim.bridgeSys.onLanded(hard);
      rv.airCanyon = false;
    }
  }
  if (canyon || rv.airCanyon) { if (br && rv.y < -br.canyonDepth * 0.4) sim.bridgeSys.onFell(); }
  else if (rv.airborne && rv.y < -5 && sim.onFellGeneric) sim.onFellGeneric(rv.z);
}

// Lateral limits at z for a body whose centre is on `side` (+1 right of the centre line,
// −1 left): { hi, lo, rail, median } — the body must stay within lo ≤ u ≤ hi.
//  • walls: buildings / canyon walls at halfWidth + shoulder + sideRoom (garage side: wider)
//  • rails: canyon bridge deck + structure rails (river bridge, drawbridge), tapered
//  • median: freeway barrier at u≈0 — the body stays on its own side of it
export function lateralLimits(sim, z, side) {
  const road = sim.road, br = sim.route.bridge, C = sim.cfg.rv;
  const hw = road.hw(z);
  const wall = hw + road.sh(z) + road.sideRoom(z);
  let hiW = wall, loW = wall;
  const S = sim.structures;
  if (S) {
    const g = S.sideLimit(z, 1); if (g > hiW) hiW = g;
    const g2 = S.sideLimit(z, -1); if (g2 > loW) loW = g2;
  }
  let railT = 0, railHalf = hw + C.railMargin;
  if (br) {
    const a = br.rampStart - 40, b = br.landingEnd + 10;
    if (z >= a && z <= b + 30) {
      if (z < br.rampStart - 10) railT = smooth01((z - a) / 30);
      else if (z <= b) railT = 1;
      else railT = 1 - smooth01((z - b) / 30);
    }
  }
  if (S) {
    const r = railAt(S.layout, z);
    if (r && r.t > railT) { railT = r.t; railHalf = r.half; }
  }
  let hi = hiW, lo = -loW, rail = false;
  if (railT > 0) {
    hi = lerp(hiW, railHalf, railT); lo = -lerp(loW, railHalf, railT); rail = railT > 0.5;
  }
  const mh = road.median(z);
  if (mh > 0) { if (side > 0) lo = mh; else hi = -mh; }
  return { hi, lo, rail, median: mh > 0 };
}

// Back-compat: symmetric limit (min of both sides), as before.
export function lateralLimit(sim, z) {
  const L = lateralLimits(sim, z, 1), R = lateralLimits(sim, z, -1);
  return { limit: Math.min(L.hi, -R.lo), rail: L.rail };
}

// Keep the RV inside the lateral limits (after collisions). Wall hits = crashes.
export function constrainRv(sim, dt) {
  const rv = sim.rv, road = sim.road, R = sim.rules.rv, C = sim.cfg.rv;
  const uC = road.uAt(rv.x, rv.z);
  const mh = road.median(rv.z);
  if (mh <= 0 || Math.abs(uC) > mh + 0.05) rv.medSide = uC >= 0 ? 1 : -1;
  const { hi, lo, rail, median } = lateralLimits(sim, rv.z, rv.medSide);
  const uA = road.uAt(rv.ax, rv.az), uB = road.uAt(rv.bx, rv.bz);
  const maxU = Math.max(uA, uB) + rv.r, minU = Math.min(uA, uB) - rv.r;
  let pen = 0, side = 0, scrape = rail;
  if (maxU > hi) { pen = maxU - hi; side = 1; if (median && rv.medSide < 0) scrape = true; }
  else if (minU < lo) { pen = lo - minU; side = -1; if (median && rv.medSide > 0) scrape = true; }
  if (pen <= 0) return;
  const h = road.heading(rv.z);
  const nx = -Math.cos(h) * side, nz = Math.sin(h) * side; // world dir of the wall normal (into the wall)
  rv.x -= nx * pen; rv.z -= nz * pen;
  const vn = rv.vx * nx + rv.vz * nz;
  if (vn > 0) {
    const k = 1 + C.wallBounce;
    rv.vx -= k * vn * nx; rv.vz -= k * vn * nz;
    if (scrape) {
      sim.damageRv(C.railScrapeDamagePerMps * vn, 'rail');
      if (vn > 1.5) sim.addBump(Math.min(0.6, vn / 10));
      if (vn > 3 && rv.wallCd <= 0) { sim.emit({ type: 'crash', x: rv.x, z: rv.z, power: clamp(vn / 25, 0.05, 0.6) }); rv.wallCd = 0.5; }
    } else if (vn > R.minCrashSpeed) {
      sim.damageRv(R.crashDamagePerMps * (vn - R.minCrashSpeed), 'wall');
      sim.addBump(Math.min(1, vn / 12));
      if (rv.wallCd <= 0) { sim.emit({ type: 'crash', x: rv.x, z: rv.z, power: clamp(vn / 20, 0.1, 1) }); rv.wallCd = 0.5; }
    }
  }
  if (scrape) { // scrape friction
    const f = Math.max(0, 1 - 0.8 * dt);
    rv.vx *= f; rv.vz *= f;
  }
  // refresh forward speed after the velocity change
  rv.speed = rv.vx * Math.sin(rv.yaw) + rv.vz * Math.cos(rv.yaw);
  updateCapsule(rv);
}

// AI bodies: same lateral limits as the RV (walls / rails / median). Returns the wall closing speed.
export function constrainAi(sim, b) {
  if (b.airborne && b.y < -1) return 0;
  const road = sim.road;
  const u = road.uAt(b.x, b.z);
  const mh = road.median(b.z);
  if (mh <= 0 || Math.abs(u) > mh + 0.05 || b.medSide == null) b.medSide = u >= 0 ? 1 : -1;
  const { hi, lo } = lateralLimits(sim, b.z, b.medSide);
  let pen = 0, side = 0;
  if (u > hi - b.r) { pen = u - (hi - b.r); side = 1; } else if (u < lo + b.r) { pen = lo + b.r - u; side = -1; }
  if (pen <= 0) return 0;
  const h = road.heading(b.z);
  const nx = -Math.cos(h) * side, nz = Math.sin(h) * side;
  b.x -= nx * pen; b.z -= nz * pen;
  const vn = b.vx * nx + b.vz * nz;
  if (vn > 0) { b.vx -= 1.2 * vn * nx; b.vz -= 1.2 * vn * nz; }
  updateCapsule(b);
  return vn > 0 ? vn : 0;
}

// ── AI vehicles ──────────────────────────────────────────────────────────────
// Pure pursuit toward (tx, tz) at `speed` (may be 0). P: { accel, brake, grip, maxYawRate }.
// speed < 0 → reverse toward the target (the rear points at it).
export function aiDrive(b, tx, tz, speed, P, dt) {
  const dx = tx - b.x, dz = tz - b.z;
  const rev = speed < 0;
  const want = rev ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz);
  const dyaw = wrapAngle(want - b.yaw);
  const s0 = Math.sin(b.yaw), c0 = Math.cos(b.yaw);
  let vF = b.vx * s0 + b.vz * c0;
  const av = Math.abs(vF);
  const rateMax = P.maxYawRate * Math.min(1, 0.12 + av / 6);
  const wT = clamp(dyaw * 2.5, -rateMax, rateMax);
  b.w += (wT - b.w) * Math.min(1, 6 * dt);
  b.yaw += b.w * dt;
  const s = Math.sin(b.yaw), c = Math.cos(b.yaw);
  vF = b.vx * s + b.vz * c;
  let vR = -b.vx * c + b.vz * s;
  if (speed > vF) vF = Math.min(speed, vF + P.accel * dt);
  else vF = Math.max(speed, vF - P.brake * dt);
  vR = approach(vR, 0, P.grip * dt);
  b.vx = s * vF - c * vR; b.vz = c * vF + s * vR;
  b.x += b.vx * dt; b.z += b.vz * dt;
  b.speed = vF;
  updateCapsule(b);
}

// Uncontrolled motion (crashed / spinning / wrecked): friction on velocity, damped spin.
export function coastBody(b, friction, spinDamp, dt) {
  const v = Math.hypot(b.vx, b.vz);
  if (v > 1e-4) {
    const nv = Math.max(0, v - friction * dt);
    b.vx *= nv / v; b.vz *= nv / v;
  } else { b.vx = 0; b.vz = 0; }
  b.w *= Math.max(0, 1 - spinDamp * dt);
  b.yaw += b.w * dt;
  b.x += b.vx * dt; b.z += b.vz * dt;
  b.speed = b.vx * Math.sin(b.yaw) + b.vz * Math.cos(b.yaw);
  updateCapsule(b);
}

// Ground height/airborne for AI vehicles (cops can fly off the ramp). Returns 'fell' when gone.
export function aiVertical(sim, b, dt) {
  const road = sim.road, br = sim.route.bridge;
  const sy = road.surfaceY(b.z);
  const canyon = !!br && b.z > br.rampStart - 5 && b.z < br.landingEnd + 5;
  if (!b.airborne) {
    if (sy == null) { b.airborne = true; b.vy = b.groundVy || 0; }
    else { const prev = b.y; b.y = sy; b.groundVy = dt > 0 ? (sy - prev) / dt : 0; return null; }
  }
  b.vy -= sim.g * dt; b.y += b.vy * dt;
  if (sy != null && b.y <= sy) {
    if (b.y < sy - 1.0) {
      if (canyon && br) b.z = Math.min(b.z, br.gapEnd - 0.1); else b.z -= Math.sign(b.vz || 1) * 0.3;
      b.vz = -0.1 * b.vz; b.vx *= 0.3;
    } else { b.y = sy; b.vy = 0; b.airborne = false; }
  }
  if (canyon ? (br && b.y < -br.canyonDepth * 0.4) : b.y < -6) return 'fell';
  return null;
}
