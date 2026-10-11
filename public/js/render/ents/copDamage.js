// ─────────────────────────────────────────────────────────────────────────────
// R3-DEFEND · police-car damage from Rook's guns, drawn on the pooled cop entities (both roles).
//   copDamage(E, rec, def, dt) → extra wobble   called at the end of copfx.js copStatus (every cop kind)
//   copEvent(E, ev)                             EntityView.event: EV.COP_HIT (where the round landed),
//                                               EV.COP_DISABLED (tyre burst / steam burst), EV.COP_SHOT
//                                               (the cop's muzzle flash at its window + a warm tracer)
//   disposeCopDamage(rec)                       copfx.js disposeCopFx (pool release)
// Source of truth: snap.copFx = [[copId, holes, crack 0|1, tyreMask (1 fl, 2 fr, 4 rl, 8 rr), steam 0|1]].
// Holes go where EV.COP_HIT said (car-local, on the face of the sim's hit box nearest to the point);
// holes the client never saw an event for (late join) are placed on the flanks by a hash of the id.
// The windscreen gets windshield_crack (v1 heavy from 3 glass hits on); flat tyres swap the rig wheel
// for flat_tyre (sag lower, the body leans onto that corner); radiator steam puffs from the grille.
// States 9 (tyre out) / 10 (radiator, stalled): lights stay on (10 flickers), 10 shudders and steams.
// Officers stay inside their cars; nothing here ever shows a person hurt.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { ATLAS } from '../textures.js';
import { XATLAS } from './atlas.js';
import { GunFx, dirOf } from './gunfx.js';
import { COP_BOXES } from '../../sim/roof.js';

const R = Math.random;
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const TYRE_BITS = [['fl', 1], ['fr', 2], ['rl', 4], ['rr', 8]];
const MAX_HOLES = 14;
const hash = (id, k) => { let h = Math.imul((id | 0) ^ (k * 0x9e3779b1), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const COP_KINDS = new Set(['cop', 'cop_suv', 'interceptor', 'moto_cop', 'rhino_truck']);

function fxMap(E) {
  const snap = E.snap;
  if (E._copFxSnap === snap && E._copFxMap) return E._copFxMap;
  const m = E._copFxMap || new Map();
  m.clear();
  const list = snap && Array.isArray(snap.copFx) ? snap.copFx : null;
  if (list) for (const t of list) if (Array.isArray(t)) m.set(t[0], t);
  E._copFxSnap = snap; E._copFxMap = m;
  return m;
}

function dmgOf(rec) {
  if (!rec.dmg) rec.dmg = { holes: [], pending: [], fillN: 0, crack: 0, crackMesh: null, glassHits: 0, tyre: 0, flats: {}, steam: 0, lastState: rec.state };
  return rec.dmg;
}

/** car-local point + face normal on the sim hit box nearest to a car-local point */
function surfaceOf(kind, lx, ly, lz) {
  const B = COP_BOXES[kind] || COP_BOXES.cop;
  const upper = B.cab && ly > B.belt + 0.02 && lz >= B.cab[0] - 0.05 && lz <= B.cab[1] + 0.05;
  const hw = upper ? B.cw : B.hw, z0 = upper ? B.cab[0] : -B.hl, z1 = upper ? B.cab[1] : B.hl, top = upper ? B.h : B.belt;
  const c = [
    [Math.abs(lx - hw), 1, 0, 0], [Math.abs(lx + hw), -1, 0, 0],
    [Math.abs(lz - z1), 0, 0, 1], [Math.abs(lz - z0), 0, 0, -1],
    [Math.abs(ly - top), 0, 1, 0],
  ].sort((a, b) => a[0] - b[0])[0];
  let px = lx, py = ly, pz = lz, nx = c[1], ny = c[2], nz = c[3];
  if (nx) px = nx * hw; else if (nz) pz = nz > 0 ? z1 : z0; else py = top;
  if (upper && nz) { ny = 0.82; nz *= 0.57; }   // raked windscreen / rear window
  return { x: px, y: py, z: pz, nx, ny, nz, glass: upper };
}

/** a clone of a cached prototype (shares geometry + material: no per-hole allocations to dispose) */
function modelOf(E, kind, variant, shadow = false) {
  const cache = E._r3protos || (E._r3protos = new Map());
  const key = kind + '|' + variant;
  let p = cache.get(key);
  if (p === undefined) {
    try { p = E.lib.create(kind, variant) || null; } catch (e) { p = null; }
    if (p) p.traverse((o) => { if (o.isMesh) { o.castShadow = shadow; o.receiveShadow = true; o.renderOrder = shadow ? 0 : 3; } });
    cache.set(key, p);
  }
  return p ? p.clone() : null;
}

function addDecal(E, rec, kind, variant, p, spin) {
  const m = modelOf(E, kind, variant);
  if (!m) return null;
  _n.set(p.nx, p.ny, p.nz).normalize();
  _q.setFromUnitVectors(_up, _n);
  _q2.setFromAxisAngle(_up, spin);
  m.quaternion.copy(_q).multiply(_q2);
  m.position.set(p.x + _n.x * 0.012, p.y + _n.y * 0.012, p.z + _n.z * 0.012);
  rec.inst.root.add(m);
  return m;
}

/** Called at the end of copStatus (copfx.js). Returns an extra body wobble (rad). */
export function copDamage(E, rec, def, dt) {
  if (!COP_KINDS.has(rec.kind)) return 0;
  const inst = rec.inst, rig = inst.rig, P = E.P;
  const map = fxMap(E);
  const t = map.get(rec.id);
  const s = rec.state;
  const has = t || rec.dmg || s === 9 || s === 10;
  if (!has) return 0;
  const D = dmgOf(rec);
  const [, holes = 0, crack = 0, tyre = 0, steam = 0] = t || [];
  // ── holes: event positions first, then hashed fill-ins up to the authoritative count
  while (D.pending.length && D.holes.length < MAX_HOLES) {
    const h = D.pending.shift();
    const m = addDecal(E, rec, 'bullet_hole', h.glass ? 1 : 0, h, hash(rec.id, D.holes.length + 7) * 6.28);
    if (m) D.holes.push(m);
  }
  const want = Math.min(MAX_HOLES, holes | 0);
  const B = COP_BOXES[rec.kind] || COP_BOXES.cop;
  while (D.holes.length < want) {
    const k = D.holes.length + 31 * (++D.fillN);
    const side = hash(rec.id, k) < 0.5 ? 1 : -1;
    const p = { x: side * B.hw, y: B.floor + 0.12 + hash(rec.id, k + 1) * (B.belt - B.floor - 0.24), z: (hash(rec.id, k + 2) - 0.5) * B.hl * 1.5, nx: side, ny: 0, nz: 0 };
    const m = addDecal(E, rec, 'bullet_hole', 0, p, hash(rec.id, k + 3) * 6.28);
    if (!m) break;
    D.holes.push(m);
  }
  // ── windscreen crack (heavy from the 3rd glass hit)
  const crackV = crack ? (D.glassHits >= 3 || holes >= 8 ? 2 : 1) : 0;
  if (crackV !== D.crack) {
    if (D.crackMesh) { D.crackMesh.removeFromParent(); D.crackMesh = null; }
    D.crack = crackV;
    if (crackV) {
      const m = modelOf(E, 'windshield_crack', crackV - 1);
      if (m) {
        const mount = m.userData && m.userData.mount && m.userData.mount[rec.kind];
        if (mount) { m.position.set(...mount.pos); m.rotation.set(...mount.rot); }
        else if (B.cab) {
          // generic: the front face of the cabin box, raked like the windscreen
          m.position.set(0, (B.belt + B.h) / 2, B.cab[1] - 0.12);
          m.rotation.set(Math.atan2(0.57, 0.82), 0, 0);
          m.scale.setScalar(Math.min(1.2, (B.cw * 2) / 1.5));
        }
        inst.root.add(m);
        D.crackMesh = m;
      }
    }
  }
  // ── flat tyres: hide the rig wheel, put the flat one in its place
  let lean = 0, pitchLean = 0;
  for (const [w, bit] of TYRE_BITS) {
    const flat = !!(tyre & bit);
    const name = inst.proto.parts['wheel_' + w] !== undefined ? 'wheel_' + w : inst.proto.parts['wheel_' + w[0]] !== undefined && w[1] === 'l' ? 'wheel_' + w[0] : null;
    if (!name) continue;
    const idx = inst.proto.parts[name];
    if (flat) {
      rig.setScale(name, 0);
      let fm = D.flats[w];
      if (!fm) {
        fm = modelOf(E, 'flat_tyre', hash(rec.id, bit) < 0.35 ? 1 : 0, true);
        if (fm) {
          const pv = inst.proto.pivots[idx], sag = fm.userData?.flat?.sag ?? 0.07;
          const k = (inst.wheelR || 0.34) / 0.34;
          fm.scale.setScalar(k);
          fm.position.set(pv.x, pv.y - sag * k, pv.z);
          fm.rotation.set(0, pv.x < 0 ? Math.PI : 0, 0);
          inst.root.add(fm);
          D.flats[w] = fm;
        }
      }
      const pv = inst.proto.pivots[idx];
      lean += (pv.x > 0 ? -1 : 1) * 0.035; pitchLean += (pv.z > 0 ? 1 : -1) * 0.016;
      // a rim on the tarmac while it still rolls: sparks
      if (rec.speed > 2.5 && rec.dist < 120 && R() < dt * 18) {
        _v.set(pv.x, 0.04, pv.z); inst.root.localToWorld(_v);
        for (let i = 0; i < 3; i++) P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: -rec.vx * 0.2 + (R() - 0.5) * 3, vy: 1 + R() * 2, vz: -rec.vz * 0.2 + (R() - 0.5) * 3, gravity: 14, life: 0.3, size: 0.12, size1: 0.04, r: 1, g: 0.85, b: 0.5, cell: ATLAS.GLOW, additive: true, floor: rec.y });
      }
    } else if (D.flats[w]) { D.flats[w].removeFromParent(); D.flats[w] = null; }
  }
  D.tyre = tyre;
  inst.root.rotation.set(pitchLean, 0, lean);
  // ── radiator steam (strong while stalled in state 10, a wisp afterwards)
  const steaming = s === 10 || steam;
  if (steaming && rec.dist < 170) {
    const rate = s === 10 ? 16 : 2.5;
    const n = E.rate(rec, 'steam', rate, dt);
    const top = Math.min(B.belt, inst.bbox.max.y);
    for (let i = 0; i < n; i++) {
      _v.set((R() - 0.5) * B.hw * 0.9, top * 0.85, inst.bbox.max.z - 0.35 - R() * 0.4); inst.root.localToWorld(_v);
      P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: rec.vx * 0.5 + (R() - 0.5) * 0.5, vy: 1.1 + R() * 0.9, vz: rec.vz * 0.5 + (R() - 0.5) * 0.5, life: 1.8 + R(), size: 0.35, size1: s === 10 ? 2.4 : 1.4, r: 0.96, g: 0.97, b: 0.98, alpha: s === 10 ? 0.62 : 0.32, cell: XATLAS.SOFT, drag: 0.9, spin: (R() - 0.5) * 0.6, fadeIn: 0.05 });
    }
  }
  // ── states 9 / 10: lights stay on (10 flickers, dimmer), 10 shudders
  let wob = 0;
  if (s === 9 || s === 10) {
    const tt = E.time, flick = s === 10 ? (Math.sin(tt * 23 + rec.phase) > -0.3 ? 0.6 : 0.08) : 1;
    const ph = (tt * 3.2 + rec.phase) % 1, redOn = ph < 0.5;
    rig.setEmitPrefix('light_red', (redOn ? 3.2 : 0.15) * flick);
    rig.setEmitPrefix('light_blue', (redOn ? 0.15 : 3.2) * flick);
    if (rec.dist < 260 && flick > 0.2) {
      for (const L of E.copLights(inst)) {
        if (L.red ? !redOn : redOn) continue;
        _v.copy(L.pos); inst.root.localToWorld(_v);
        P.once({ x: _v.x, y: _v.y, z: _v.z, cell: ATLAS.GLOW, size: 2.4 * flick, r: L.red ? 1 : 0.25, g: L.red ? 0.18 : 0.42, b: L.red ? 0.12 : 1, alpha: 0.85, additive: true });
      }
    }
    if (s === 10) wob = Math.sin(tt * 37 + rec.phase) * 0.006;
  }
  D.lastState = s;
  return wob;
}

/** EntityView.event (R3-DEFEND): gun events that touch a police car. */
export function copEvent(E, ev) {
  if (!ev) return;
  const scene = E.scene, fx = GunFx.of(scene, E.P);
  if (ev.type === 'copShot') {
    if (!Number.isFinite(ev.x)) return;
    const d = dirOf(ev.x, ev.y, ev.z, ev.tx, ev.ty, ev.tz);
    // the officer's muzzle flash at the car window + a warm tracer to the RV (a miss sails past)
    E.P.spawn({ x: ev.x + d.x * 0.3, y: ev.y, z: ev.z + d.z * 0.3, life: 0.07, size: 0.9, size1: 1.1, r: 1, g: 0.78, b: 0.4, alpha: 1, cell: ATLAS.GLOW, additive: true, fadeIn: 0 });
    E.P.spawn({ x: ev.x + d.x * 0.3, y: ev.y, z: ev.z + d.z * 0.3, life: 0.05, size: 0.5, size1: 0.6, r: 1, g: 0.95, b: 0.8, alpha: 1, cell: XATLAS.SPARK2, additive: true, fadeIn: 0, rot: R() * 6 });
    fx.muzzleSmoke(ev.x, ev.y, ev.z, d, false);
    fx.tracer(ev.x + d.x * 0.4, ev.y, ev.z + d.z * 0.4, ev.tx, ev.ty, ev.tz, { warm: true, width: 0.8 });
    return;
  }
  const rec = E.map && E.map.get(ev.copId);
  if (!rec || !COP_KINDS.has(rec.kind)) return;
  if (ev.type === 'copHit' && Number.isFinite(ev.x)) {
    // world → car-local at the car's current pose (the event and the pose are from the same snapshot)
    const c = Math.cos(rec.yaw || 0), s = Math.sin(rec.yaw || 0);
    const dx = ev.x - rec.x, dz = ev.z - rec.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c, ly = ev.y - (rec.y || 0);
    const D = dmgOf(rec);
    if (ev.part === 'tyre') return;   // a round in a tyre leaves no decal (the flat tyre shows it)
    const p = surfaceOf(rec.kind, lx, ly, lz);
    if (p.glass) D.glassHits++;
    D.pending.push(p);
    if (D.pending.length > 6) D.pending.shift();
    return;
  }
  if (ev.type === 'copDisabled') {
    const inst = rec.inst;
    if (!inst || !inst.root) return;
    inst.outer.updateMatrixWorld(true);
    if (ev.how === 'tyre') {
      // the tyre lets go: a grey burst at the lowest wheel nearest the shooter is close enough
      _v.set(0, 0.3, 0); inst.root.localToWorld(_v);
      fx.impact(_v.x, _v.y, _v.z, 'tyre', { big: true });
    } else if (ev.how === 'radiator') {
      _v.set(0, Math.min(1, inst.bbox.max.y * 0.6), inst.bbox.max.z - 0.4); inst.root.localToWorld(_v);
      fx.impact(_v.x, _v.y, _v.z, 'radiator', { big: true });
    } else {
      _v.set(0, inst.bbox.max.y * 0.6, inst.bbox.max.z * 0.6); inst.root.localToWorld(_v);
      for (let i = 0; i < 6; i++) E.P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: (R() - 0.5) * 0.8, vy: 1.2 + R(), vz: (R() - 0.5) * 0.8, life: 1.6, size: 0.6, size1: 2.4, r: 0.45, g: 0.44, b: 0.42, alpha: 0.5, cell: ATLAS.PUFF, drag: 0.9 });
    }
  }
}

/** Pool release: remove decals / flats, undo the lean. */
export function disposeCopDamage(rec) {
  const D = rec.dmg;
  if (!D) return;
  for (const m of D.holes) m.removeFromParent();
  if (D.crackMesh) D.crackMesh.removeFromParent();
  for (const w of Object.keys(D.flats)) if (D.flats[w]) D.flats[w].removeFromParent();
  if (rec.inst && rec.inst.root) rec.inst.root.rotation.set(0, 0, 0);
  rec.dmg = null;
}
