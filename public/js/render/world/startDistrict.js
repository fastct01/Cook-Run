// ─────────────────────────────────────────────────────────────────────────────
// R3-GARAGE · the start district around Rook's Garage + the garage's way-out arrows (render side).
//
//  • Static world: the r3-start-layout.js placements (tow yard, tyre shop + TIRES pole sign, dumpster
//    alleys, warehouses / factories, pipe bridge, refinery gate, Lou's diner + EAT sign, corner mart,
//    pumpjack lot, water tower, fuel-depot tanks, utility poles with sagging wires, scrub, parked cars,
//    lots) are ordinary Layout items, baked into the chunks' existing batches (no per-item draw calls).
//    Hooks (all marked `// R3-GARAGE`):
//      world/layout.js   Layout constructor → applyStartDistrict(layout): reservations so the seeded
//                        Ironworks generator leaves the district alone; Layout._biome → startItemsFor()
//      chunks.js         streams the road + ground back to START_MIN_Z (−200) while the RV is in the
//                        first START_STREAM_UNTIL (300) m (the district's back half lies behind z 0)
//      world/structures.js  StructuresView constructor → startLiveItems(): the two live pumpjacks
//                        (head + crank animated) and the way-out arrows
//    Sim colliders: sim/structures.js structureLayout() (startDistrictOn + startColliders): same data,
//    same rule, so the sim, the Autopilot and the view agree on every seed.
//  • Way-out arrows (ExitArrows): once the engine catches (snap.garage.items.engine === 'on', or the
//    countdown after a skip) a line of yellow floor chevrons lights up one after another from the RV's
//    nose out through the roll-up door, curving right onto the road, and a floating "OUT" arrow appears
//    outside the door (seen from the cab ~20° right of centre). Each chevron fades as the RV's nose
//    passes it; the floating arrow fades as the RV reaches it; everything is gone once the RV is past
//    the end of the path (or 14 s into the drive, or the RV left the path). It lives in the world
//    (StructuresView), not in GarageView, so it survives the garage → countdown → drive hand-over.
// Unity: StartDistrict (static prefabs baked into the chunk scene) + ExitArrows MonoBehaviour.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { startLayoutItems, startLive, startReservations, R3_START_MIN_Z } from '../../assets/expansion/r3-start-layout.js';
import { R3_EXIT_ARROWS } from '../../assets/expansion/r3-garage-layout.js';
import { startDistrictOn } from '../../sim/structures.js';
import { garageFrame, LAYOUT } from '../../sim/garage.js';

export const START_MIN_Z = R3_START_MIN_Z;        // chunks reach back to here near the start
export const START_STREAM_UNTIL = 300;            // … while the RV (camera focus) is before this z

/** True when this route has the start district (garage at z 45 on the right — the layout is authored for it). */
export function startDistrictEnabled(info) {
  if (globalThis.__r3NoStartDistrict) return false;   // harness switch (world-test.html &district=0) for "before" numbers
  try { return !!(info && info.route && startDistrictOn(info.route)); } catch (e) { return false; }
}

/** Layout constructor hook: reservations (once per RoadInfo) + which biome carries the district. */
export function applyStartDistrict(layout) {
  const info = layout.info;
  layout.startBiome = -1;
  if (!startDistrictEnabled(info)) return;
  if (!info._r3StartRes) { info.res.push(...startReservations()); info._r3StartRes = true; }
  const gz = (info.garage && info.garage.z) ?? 45;
  layout.startBiome = info.biomes.findIndex((b) => gz >= b.from && gz < b.to);
  if (layout.startBiome < 0) layout.startBiome = 0;
}

/** Layout._biome hook: the district's static items (+ lot decals) for biome i (pushed after the generator ran). */
export function startItemsFor(layout, i) {
  if (layout.startBiome !== i) return [];
  try { return startLayoutItems(layout.track); } catch (e) { console.warn('[world] start district', e); return []; }
}

/** StructuresView hook: live start-district objects → StructuresView items { key, z, make() → { root, update } }. */
export function startLiveItems(info, lib) {
  const out = [];
  const track = info.track;
  if (startDistrictEnabled(info)) {
    for (const p of startLive(track)) {
      out.push({ key: 'r3_' + p.id, z: p.z, make: () => {
        const root = lib.create(p.kind, p.variant);
        root.position.set(p.x, 0, p.z); root.rotation.y = p.yaw;
        root.name = 'r3_' + p.id;
        const head = root.getObjectByName('head'), crank = root.getObjectByName('crank');
        const { period = 6.5, headAmp = 0.22 } = root.userData.anim || {};
        let k = (p.z * 0.37) % period;
        return { root, update: (dt) => {
          k += dt;
          const a = (k / period) * Math.PI * 2;
          if (head) head.rotation.x = headAmp * Math.sin(a);
          if (crank) crank.rotation.x = -a;
        } };
      } });
    }
  }
  // the way-out arrows of Rook's Garage (any route with the garage tutorial)
  if (info.garage && info.route && info.route.start && info.route.start.garage) {
    out.push({ key: 'r3_exit_arrows', z: info.garage.z ?? 45, make: () => {
      const ea = new ExitArrows(lib, info);
      return { root: ea.root, update: (dt, snap) => ea.update(dt, snap), arrows: ea };
    } });
  }
  return out;
}

// ── way-out arrows ──────────────────────────────────────────────────────────
// Path (garage_interior-local, like sim/garage.js LAYOUT): starts 0.8 m past the parked RV's bumper,
// 4.5 m straight out of the door (+Z), then a right turn (toward −X = down the route) with R = 6 m.
const P0 = R3_EXIT_ARROWS.path.startsAt;          // [4.0, 0, 4.9]
const L1 = 4.5, RAD = 6.0, ARC = RAD * Math.PI / 2, CX = P0[0] - RAD, CZ = P0[2] + L1;
const CHEV_S = Array.from({ length: 8 }, (_, i) => 0.8 + i * 1.72);   // = exit_arrow v0 userData.path.chevronS
const ARROW_S = 14.7;
const RV_HALF = 4.3;                                // RV nose = centre + 4.3 m along its heading
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Arc length along the exit path of a local point (negative before the start). */
export function exitS(lx, lz) {
  if (lz <= CZ) return lz - P0[2];
  const t = Math.atan2(lz - CZ, lx - CX);
  if (lx < CX && t > Math.PI / 2 - 1e-6) return L1 + ARC + (CX - lx);
  return L1 + RAD * Math.max(0, Math.min(Math.PI / 2, t));
}
/** Local point on the exit path at arc length s. */
export function exitPoint(s) {
  if (s <= L1) return { x: P0[0], z: P0[2] + s };
  if (s <= L1 + ARC) { const t = (s - L1) / RAD; return { x: CX + RAD * Math.cos(t), z: CZ + RAD * Math.sin(t) }; }
  return { x: CX - (s - L1 - ARC), z: CZ + RAD };
}

export class ExitArrows {
  constructor(lib, info) {
    const track = info.track;
    this.frame = garageFrame(track, info.route);
    const F = this.frame;
    let baseY = 0;
    try { baseY = track.surfaceY(F.gz) ?? 0; } catch (e) { baseY = 0; }
    this.root = new THREE.Group();
    this.root.name = 'r3_exit_arrows';
    this.root.position.set(F.ox, (Number.isFinite(baseY) ? baseY : 0) + 0.012, F.oz);
    this.root.rotation.y = F.rot;
    this.root.visible = false;
    this.mats = [];
    // floor chevrons (v0): place so the path start lands 0.8 m past the RV's nose
    const path = this.path = lib.create('exit_arrow', 0);
    const st = (path.userData.path && path.userData.path.start) || [P0[0] - R3_EXIT_ARROWS.path.pos[0], 0, P0[2] - R3_EXIT_ARROWS.path.pos[2]];
    path.position.set(P0[0] - st[0], 0, P0[2] - st[2]);
    path.rotation.y = R3_EXIT_ARROWS.path.rotY || 0;
    this.root.add(path);
    // floating OUT arrow (v1): outside the door, inside the curve, facing the RV, pointing to the driver's right
    const fl = this.float = lib.create('exit_arrow', 1);
    fl.position.set(...R3_EXIT_ARROWS.float.pos);
    fl.rotation.y = R3_EXIT_ARROWS.float.rotY;
    this.root.add(fl);
    this.flArrow = fl.getObjectByName('arrow');
    this.restY = (fl.userData.arrow && fl.userData.arrow.restY) || 2.4;
    this.flS = exitS(R3_EXIT_ARROWS.float.pos[0], R3_EXIT_ARROWS.float.pos[2]);
    // own (cloned, fadeable) materials: per chevron / lamp, plus everything else per object
    const own = (obj) => {
      const map = new Map();
      obj.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = false; o.receiveShadow = false;
        const perMesh = /^chev_|^arrow_mesh$/.test(o.name);
        let m = perMesh ? null : map.get(o.material);
        if (!m) {
          m = o.material.clone();
          m.transparent = true;
          m.userData.baseOpacity = o.material.transparent ? (o.material.opacity ?? 1) : 1;
          m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2;
          if (!perMesh) map.set(o.material, m);
          this.mats.push(m);
        }
        o.material = m;
      });
    };
    own(path); own(fl);
    const mat = (obj, n) => { const o = obj.getObjectByName(n); return o && o.isMesh ? o.material : o ? (o.children.find((c) => c.isMesh) || {}).material : null; };
    // floor: chev_0..7 + the end arrow (i = 8) · float: its lamp strip chev_0..7
    this.floor = [...CHEV_S.map((s, i) => ({ s, m: mat(path, 'chev_' + i), node: path.getObjectByName('chev_' + i) })),
      { s: ARROW_S, m: mat(path, 'arrow'), node: path.getObjectByName('arrow') }];
    this.floorFade = this.floor.map(() => 0);
    this.lamps = Array.from({ length: 8 }, (_, i) => mat(fl, 'chev_' + i));
    this.flMats = [];
    fl.traverse((o) => { if (o.isMesh && !this.flMats.includes(o.material)) this.flMats.push(o.material); });
    this.pathOther = [];
    path.traverse((o) => { if (o.isMesh && !this.floor.some((f) => f.m === o.material)) this.pathOther.push(o.material); });
    // state
    this.on = false; this.onT = 0; this.t = 0; this.driveT = 0; this.done = false; this.k = 0; this.flK = 0; this.nose = -1;
    this._fixed = false;
  }

  /** Called every frame by StructuresView (snap = the view's current snapshot). */
  update(dt, snap) {
    if (!snap) return;
    if (!this._fixed) { this._fixed = true; this.root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } }); }
    this.t += dt;
    const ph = snap.phase;
    const G = snap.garage;
    const rv = snap.rv;
    // RV nose → path arc length
    let s = -1, off = 0;
    if (rv) {
      const nx = rv.x + Math.sin(rv.yaw) * RV_HALF, nz = rv.z + Math.cos(rv.yaw) * RV_HALF;
      const L = this.frame.toLocal(nx, nz);
      s = exitS(L.x, L.z);
      const q = exitPoint(Math.max(0, s));
      off = Math.hypot(L.x - q.x, L.z - q.z);
    }
    this.nose = s;
    if (!this.on && !this.done) {
      const engineOn = ph === 'garage' && G && G.items && G.items.engine === 'on';
      const parked = rv && s < 1.5 && off < 3;
      if (engineOn || (ph === 'countdown' && parked)) { this.on = true; this.onT = 0; }
    }
    if (this.on) {
      this.onT += dt;
      if (ph === 'drive') this.driveT += dt;
      const gone = (s > ARROW_S + 1.5) || this.driveT > 14 || (ph === 'drive' && off > 12 && s > 0) || ph === 'won' || ph === 'lost';
      if (gone) this.done = true;
    }
    const want = this.on && !this.done ? 1 : 0;
    this.k += (want - this.k) * Math.min(1, dt * (want ? 6 : 3));
    if (this.done && this.k < 0.01) { this.k = 0; this.on = false; }
    this.root.visible = this.k > 0.01;
    if (!this.root.visible) return;
    // floor chevrons: revealed one after another from the nose (0.15 s apart), chase light, fade once passed
    const ph12 = ((this.onT / 1.2) % 1) * 9;
    this.floor.forEach((f, i) => {
      const reveal = clamp01((this.onT - i * 0.15) / 0.25);
      const passed = s > f.s + 0.6;
      this.floorFade[i] += ((passed ? 0 : 1) - this.floorFade[i]) * Math.min(1, dt * (passed ? 5 : 8));
      const a = reveal * Math.min(this.floorFade[i], 1) * this.k;
      const lit = Math.max(0, 1 - Math.abs(ph12 - i) / 1.6);
      if (f.m) { f.m.opacity = a; f.m.color.setScalar(0.62 + 0.38 * lit); }
      if (f.node) f.node.visible = a > 0.01;
    });
    const endA = clamp01((this.onT - 8 * 0.15) / 0.25) * Math.min(1, this.floorFade[8]) * this.k;
    for (const m of this.pathOther) m.opacity = (m.userData.baseOpacity ?? 1) * endA;   // the OUT lettering on the end arrow
    // floating arrow: fades in with the engine, bobs, its lamp strip chases; fades as the RV reaches it
    const flWant = s > this.flS - 3.5 ? 0 : 1;
    this.flK += (flWant - this.flK) * Math.min(1, dt * (flWant ? 4 : 5));
    const fa = this.flK * this.k * clamp01(this.onT / 0.4);
    this.float.visible = fa > 0.01;
    for (const m of this.flMats) m.opacity = (m.userData.baseOpacity ?? 1) * fa;
    if (this.flArrow) this.flArrow.position.y = this.restY + 0.12 * Math.sin(2.4 * this.t);
    const ph10 = (this.t % 1) * 9;
    this.lamps.forEach((m, i) => { if (m) m.color.setScalar(0.62 + 0.38 * Math.max(0, 1 - Math.abs(ph10 - i) / 1.6)); });
  }

  /** For tests / harnesses. */
  debug() { return { on: this.on, done: this.done, k: +this.k.toFixed(2), nose: +this.nose.toFixed(2), visible: this.root.visible, float: +this.flK.toFixed(2), floor: this.floorFade.map((v) => +v.toFixed(2)) }; }

  dispose() { this.root.removeFromParent(); for (const m of this.mats) m.dispose(); }
}

void LAYOUT;
