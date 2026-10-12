// ─────────────────────────────────────────────────────────────────────────────
// Structures (VIEW-WORLD-A)
//  • buildStaticStructures(ctx): baked into chunks — store models on their lots
//    (+ pylon signs), sell point, bridge-out signs, cattle grid, overpasses,
//    covered bridge, the engine shed at the rail crossing.
//  • StructuresView: live (animated) instances, added only near the RV:
//      rooks_garage   door ← snap.garage.items.door (0..1)   [contract transform]
//      drawbridge     leaf_l / leaf_r ← snap.setpieces[type 'drawbridge'].angle
//      car_wash       brush_0..2 spin; straddles the right-hand lanes
//      toll_plaza ×2  one per carriageway (scaled 0.7 in x), arms ← toll set-piece
//      stop_arrow     bobbing over the NEXT un-looted stop within rules.stops.arrowDist,
//                     plus a pulsing ring on the lot
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { STORE_FP, SEA_Y } from '../roadBuilder.js';
import { textBoardMaterial } from '../textures.js';
import { structureLayout } from '../../sim/structures.js';
import { startLiveItems } from './startDistrict.js';   // R3-GARAGE

const HALF_PI = Math.PI / 2;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

export const STOP_MODEL = (st) => st.model || 'store_hardware';
const OWN_POLE = new Set(['store_market', 'store_chandlery', 'store_megamart']);

/** u (signed) of a stop's store model centre: front edge 1 m into the shoulder, model depth behind. */
export function storeU(info, st, depth) {
  const t = info.track;
  return st.side * (t.halfWidth(st.z) + t.shoulder(st.z) - 1 + depth / 2);
}

function put(ctx, proto, x, y, z, yaw, { sx = 1, sy = 1, sz = 1, batch = null, tint = null } = {}) {
  _p.set(x, y, z); _q.setFromEuler(_e.set(0, yaw, 0)); _s.set(sx, sy, sz);
  _m.compose(_p, _q, _s);
  (batch || ctx.B.near).addProto(proto, _m, tint);
}

export function buildStaticStructures(ctx) {
  const { info, protos, z0, z1 } = ctx;
  const t = info.track;
  const inChunk = (z) => z >= z0 && z < z1;
  const face = (z, s) => s * HALF_PI + t.headingAt(z);
  // stores on their lots
  for (const st of info.stops) {
    if (!inChunk(st.z)) continue;
    const kind = STOP_MODEL(st);
    const p = protos.get(kind, st.variant || 0);
    const u = storeU(info, st, p.size.l);
    put(ctx, p, t.xAt(st.z, u), 0, st.z, face(st.z, st.side));
    if (!OWN_POLE.has(kind)) {
      const fp = STORE_FP[kind] || STORE_FP.default;
      const zs = st.z - fp.w / 2 - 3;
      const hw = t.halfWidth(zs) + t.shoulder(zs);
      sign(ctx, [st.name.toUpperCase()], st.side * (hw + 1.4), zs, Math.PI + t.headingAt(zs), { pole: 7.5, w: 6, h: 2.6, bg: '#f1ead8', fg: '#22262a', border: '#9c4a32', sub: 'OPEN 24H · SUPPLIES' });
    }
  }
  // the buyer's drive-in
  const sp = info.sell;
  if (sp && inChunk(sp.z)) {
    const s = sp.side;
    const hw = t.halfWidth(sp.z) + t.shoulder(sp.z);
    put(ctx, protos.get(sp.model || 'sell_point', 0), t.xAt(sp.z, s * (hw + 30)), -0.02, sp.z, face(sp.z, s));
    const zs = info.sellLot.z0 + 3;
    sign(ctx, [(sp.name || 'DRIVE-IN').toUpperCase()], s * (hw + 1.5), zs, Math.PI + t.headingAt(zs), { pole: 6.5, w: 7, h: 2.4, bg: '#9c4a32', fg: '#f1ead8', border: '#d9a83a', sub: 'CLOSED SINCE \'79' });
  }
  // canyon bridge: warning signs + barricades
  const br = info.bridge;
  if (br) {
    const signs = [
      { z: br.rampStart - 520, text: ['BRIDGE OUT'], sub: '500 m AHEAD' },
      { z: br.rampStart - 270, text: ['BRIDGE OUT'], sub: '250 m · ROAD CLOSED' },
      { z: br.rampStart - 70, text: ['BRIDGE OUT!'], sub: 'TURN BACK' },
    ];
    for (const sg of signs) {
      if (!inChunk(sg.z)) continue;
      const u = t.halfWidth(sg.z) + t.shoulder(sg.z) + 1.4;
      sign(ctx, sg.text, u, sg.z, Math.PI + t.headingAt(sg.z), { pole: 2.2, w: 3.6, h: 1.9, bg: '#e8a23a', fg: '#22262a', border: '#22262a', sub: sg.sub, legs: true });
      put(ctx, protos.get('warning_sign', 0), t.xAt(sg.z + 4, -u), 0, sg.z + 4, Math.PI + t.headingAt(sg.z));
    }
    for (const dz of [-30, -18]) {
      const z = br.rampStart + dz;
      if (!inChunk(z)) continue;
      for (const s of [1, -1]) put(ctx, protos.get('barrier', 0), t.xAt(z, s * (t.halfWidth(z) + 0.6)), 0, z, t.headingAt(z) + s * 0.4);
    }
  }
  // cattle grid across the road
  if (info.cattle && inChunk(info.cattle.z)) {
    const z = info.cattle.z;
    put(ctx, protos.get('cattle_grid', 0), t.centerX(z), 0, z, t.headingAt(z));
  }
  // overpasses (v0: centre pier in the median of the divided freeway)
  for (const o of info.overpasses) {
    if (!inChunk(o.z)) continue;
    put(ctx, protos.get('overpass', o.variant ?? 0), t.centerX(o.z), 0, o.z, t.headingAt(o.z));
  }
  // covered bridge over the river (deck at local y 4 → placed at roadY − 4)
  const r = info.river;
  if (r && inChunk(r.zc)) {
    const p = protos.get(r.model || 'covered_bridge', 0);
    const dy = p.ud.deckY ?? 4;
    put(ctx, p, t.centerX(r.zc), -dy, r.zc, t.headingAt(r.zc));
  }
  // engine shed whose door track lines up with the rail crossing
  const rx = info.railX || info.train;
  if (rx && inChunk(rx.z)) {
    const p = protos.get('rail_shed', 0);
    const tx = (p.ud.tracks && p.ud.tracks.x && p.ud.tracks.x[0]) || 0;
    const s = 1;
    const u = s * (info.corridor(rx.z) + 46 + p.size.l / 2);
    // facing the road (+π/2): local x → world −z, so the door at local x = tx sits at z = zs − tx
    const zs = rx.z + tx;
    put(ctx, p, t.xAt(rx.z, u), 0, zs, face(rx.z, s));
  }
}

// big pylon / warning sign built from boxes + a text board (atlased by protos.fromObject)
function sign(ctx, lines, u, z, yaw, { pole = 6, w = 6, h = 2.5, bg, fg, border, sub = null, legs = false } = {}) {
  const { info, protos } = ctx;
  const t = info.track;
  const root = new THREE.Group();
  const poleMat = new THREE.MeshLambertMaterial({ color: '#5a5d62' });
  const y0 = info.groundY(u, z);
  const geos = [];
  const box = (sx, sy, sz) => { const g = new THREE.BoxGeometry(sx, sy, sz); geos.push(g); return g; };
  if (legs) {
    for (const dx of [-w * 0.35, w * 0.35]) { const m = new THREE.Mesh(box(0.14, pole, 0.14), poleMat); m.position.set(dx, pole / 2, 0); root.add(m); }
  } else { const m = new THREE.Mesh(box(0.35, pole, 0.35), poleMat); m.position.set(0, pole / 2, 0); root.add(m); }
  const backMat = new THREE.MeshLambertMaterial({ color: border || '#22262a' });
  const back = new THREE.Mesh(box(w + 0.2, h + 0.2, 0.18), backMat);
  back.position.set(0, pole + h / 2, 0); root.add(back);
  const mat = textBoardMaterial(lines, { bg, fg, border, w: 512, h: Math.round(512 * h / w), sub });
  const plane = new THREE.PlaneGeometry(w, h); geos.push(plane);
  const f = new THREE.Mesh(plane, mat); f.position.set(0, pole + h / 2, 0.1); root.add(f);
  const bk = new THREE.Mesh(plane, mat); bk.position.set(0, pole + h / 2, -0.1); bk.rotation.y = Math.PI; root.add(bk);
  root.position.set(t.xAt(z, u), y0, z);
  root.rotation.y = yaw;
  const proto = protos.fromObject(root);
  ctx.B.near.addProto(proto, new THREE.Matrix4());
  for (const g of geos) g.dispose();
  poleMat.dispose(); backMat.dispose();
}

// ── live structures ─────────────────────────────────────────────────────────
const RANGE = 700;

export class StructuresView {
  constructor(scene, info, lib, { rules = {} } = {}) {
    this.scene = scene; this.info = info; this.lib = lib; this.track = info.track;
    this.rules = rules;
    this.root = new THREE.Group(); this.root.name = 'structures';
    scene.add(this.root);
    this.time = 0;
    this.looted = new Set();
    this.garageVisible = true;
    this.items = [];
    // SIM-CORE's pure layout (colliders) — visuals line up with it
    let L = null;
    try { L = structureLayout(info.track, info.route); } catch (e) { L = null; }
    this.simLayout = L;
    this.owned = [];   // cloned materials to dispose
    const t = this.track;
    const g = info.garage;
    if (g) {
      this.items.push({ key: 'garage', z: g.z, make: () => {
        const root = lib.create(g.model || 'rooks_garage', 0);   // own Object3D, userData.kind === 'rooks_garage'
        const s = g.side || 1;
        const G = L && L.garage;
        root.position.set(G ? G.cx : t.xAt(g.z, s * 18), 0, G ? G.cz : g.z);
        root.rotation.y = G ? G.rotY : s * HALF_PI;
        root.name = 'rooks_garage_exterior';
        root.visible = this.garageVisible;
        const door = root.getObjectByName('door');
        const open = (root.userData.door && root.userData.door.open) || 4.4;
        let k = 1;
        return { root, door, update: (dt, snap) => {
          root.visible = this.garageVisible;
          const tgt = snap && snap.garage && snap.garage.items && snap.garage.items.door != null ? +snap.garage.items.door
            : snap && snap.phase === 'garage' ? 0 : 1;
          k += (tgt - k) * Math.min(1, dt * 8);
          if (door) door.position.y = open * Math.max(0, Math.min(1, k));
        } };
      } });
    }
    const d = info.drawbridge;
    if (d) {
      this.items.push({ key: 'drawbridge', z: d.zc, make: () => {
        const root = lib.create('drawbridge', 0);
        const deckY = root.userData.deckY ?? 6;
        root.position.set(t.centerX(d.zc), -deckY, d.zc);
        root.rotation.y = t.headingAt(d.zc);
        const L = root.getObjectByName('leaf_l'), R = root.getObjectByName('leaf_r');
        let a = 0;
        return { root, update: (dt, snap) => {
          const sp = findSetpiece(snap, 'drawbridge');
          const tgt = sp ? leafAngle(sp, this.info.route) : 0;
          a += (tgt - a) * Math.min(1, dt * 10);
          if (L) L.rotation.x = -a;
          if (R) R.rotation.x = a;
        } };
      } });
    }
    const cw = info.carwash;
    if (cw) {
      this.items.push({ key: 'carwash', z: cw.z, make: () => {
        const root = lib.create('car_wash', 0);
        const s = cw.side || 1;
        // tunnel (local z −2.5) over the right-hand lanes: local z → +u, so the model centre sits at axisU + 2.5
        // (axisU = side·hw/2 from SIM-CORE's carWashLayout: its walls are at axisU ± 3.2, like the model's)
        const lay = L && L.carWashes.find((w) => Math.abs(w.z - cw.z) < 1);
        const uT = lay ? lay.axisU : s * t.halfWidth(cw.z) / 2;
        root.position.set(t.xAt(cw.z, uT + s * 2.5), 0, cw.z);
        root.rotation.y = -s * HALF_PI + t.headingAt(cw.z);
        const brushes = [0, 1, 2].map((i) => root.getObjectByName('brush_' + i)).filter(Boolean);
        let spin = 1.5;
        return { root, update: (dt, snap) => {
          const sp = findSetpiece(snap, 'car_wash');
          spin += ((sp && sp.washing ? 9 : 1.5) - spin) * Math.min(1, dt * 2);
          for (let i = 0; i < brushes.length; i++) brushes[i].rotation.y += dt * (i % 2 ? -spin : spin);
        } };
      } });
    }
    const tp = info.toll;
    if (tp) {
      // ONE plaza across the whole freeway (SETPIECES / SIM-CORE layout): rotation π, booth islands at
      // u = 0, ±5, ±10, booth lanes at u = ±2.5, ±7.5; arm_i ← set-piece gates[i] (0 up, 1 down, 2 smashed)
      this.items.push({ key: 'toll', z: tp.z, make: () => {
        const root = lib.create('toll_plaza', 0);
        root.position.set(t.centerX(tp.z), 0, tp.z);
        root.rotation.y = Math.PI + t.headingAt(tp.z);
        const arms = [0, 1, 2, 3].map((i) => root.getObjectByName('arm_' + i));
        const up = (root.userData.arm && root.userData.arm.up) ?? -1.45;
        const k = [0, 0, 0, 0];
        return { root, update: (dt, snap) => {
          const sp = findSetpiece(snap, 'toll_plaza');
          for (let i = 0; i < 4; i++) {
            const a = arms[i]; if (!a) continue;
            const g = sp && Array.isArray(sp.gates) ? sp.gates[i] : 1;
            a.visible = g !== 2;
            const tgt = g === 0 ? up : 0;
            k[i] += (tgt - k[i]) * Math.min(1, dt * 5);
            a.rotation.z = k[i];
          }
        } };
      } });
    }
    this.live = new Map();
    // R3-GARAGE: live start-district objects (the two nodding pumpjacks) + the garage's way-out arrows
    try { for (const it of startLiveItems(info, lib)) this.items.push(it); } catch (e) { console.warn('[world] start district', e); }
    this._initArrow();
  }

  markLooted(id) { this.looted.add(id); }
  setGarageVisible(on) { this.garageVisible = !!on; const L = this.live && this.live.get('garage'); if (L) L.root.visible = this.garageVisible; }

  _initArrow() {
    let m;
    try { m = this.lib.create('stop_arrow', 0); } catch (e) { m = null; }
    if (!m) return;
    m.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.fog = false;
      o.castShadow = false; o.receiveShadow = false;
      this.owned.push(o.material);
    });
    this.arrowRoot = m;
    this.arrow = m.getObjectByName('arrow');
    this.ring = m.getObjectByName('ring');
    this.beam = m.getObjectByName('beam');
    this.arrowRest = (m.userData.arrow && m.userData.arrow.restY) || 6.1;
    if (this.ring) this.ring.scale.setScalar(2.3);
    if (this.beam) this.beam.scale.set(2.3, 1, 2.3);
    this.arrowRoot.visible = false;
    this.root.add(this.arrowRoot);
    // the lot-wide glow ring under the arrow
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffcf5a', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));
    ring.renderOrder = 5;
    this.owned.push(ring.material); this._ringGeo = ring.geometry;
    this.lotRing = ring; ring.visible = false;
    this.root.add(ring);
  }

  _target(snap) {
    const ns = snap && snap.nearStop;
    if (!ns) return null;
    const looted = this.looted;
    const lt = snap.looted;
    const isLooted = (id) => looted.has(id) || (Array.isArray(lt) && lt.includes(id)) || (lt && typeof lt === 'object' && !Array.isArray(lt) && (lt instanceof Set ? lt.has(id) : !!lt[id]));
    if (isLooted(ns.id)) return null;
    const st = this.info.stops.find((s) => s.id === ns.id);
    if (!st) return null;
    const maxD = (this.rules.stops && this.rules.stops.arrowDist) || 600;
    const dist = ns.dist != null ? ns.dist : Math.abs(st.z - (snap.rv ? snap.rv.z : 0));
    if (dist > maxD) return null;
    return { st, dist };
  }

  update(dt, snap, cam, rvZ) {
    this.time += dt;
    // live instances in range
    for (const it of this.items) {
      const near = Math.abs(it.z - rvZ) < RANGE;
      let L = this.live.get(it.key);
      if (near && !L) {
        try {
          L = it.make();
          L.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
          this.root.add(L.root);
          this.live.set(it.key, L);
        } catch (e) { console.warn('[world] structure', it.key, e); this.items = this.items.filter((x) => x !== it); continue; }
      } else if (!near && L) {
        L.root.removeFromParent();
        this.live.delete(it.key);
        L = null;
      }
      if (L) { try { L.update(dt, snap); } catch (e) { /* keep going */ } }
    }
    // stop arrow
    if (!this.arrowRoot) return;
    const tg = this._target(snap);
    if (!tg) { this.arrowRoot.visible = false; this.lotRing.visible = false; return; }
    const { st, dist } = tg;
    const lot = st.lot;
    const y = 0.06;
    this.arrowRoot.visible = true; this.lotRing.visible = true;
    this.arrowRoot.position.set(lot.cx, y, lot.cz);
    const parked = snap.stop && snap.stop.id === st.id;
    const blocked = parked && snap.stop.blocked;
    const col = blocked ? 0xd8433a : parked ? 0x7fd6c2 : 0xffcf5a;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * (parked ? 7 : 3.2));
    if (this.arrow) {
      this.arrow.visible = !parked;
      const sc = Math.min(5, Math.max(1.3, dist / 45));
      this.arrow.scale.setScalar(sc);
      this.arrow.position.y = this.arrowRest + (sc - 1) * 3.5 + 0.6 * Math.abs(Math.sin(this.time * 2.6));
      // far away the arrow shows through buildings (a beacon); close up it is a normal solid object
      const far = dist > 130;
      if (far !== this._arrowFar) {
        this._arrowFar = far;
        this.arrow.traverse((o) => { if (o.isMesh) { o.material.depthTest = !far; o.renderOrder = far ? 20 : 0; } });
      }
      if (cam) this.arrow.rotation.y = Math.atan2(cam.x - lot.cx, cam.z - lot.cz);
    }
    if (this.ring) { const k = 2.3 * (1 + pulse * 0.06); this.ring.scale.set(k, 1, k); this.ring.rotation.y = this.time * 0.4; }
    const R = Math.min(lot.halfLen, lot.halfDepth + 3) * 1.08;
    this.lotRing.position.set(lot.cx, 0.07, lot.cz);
    this.lotRing.scale.set(R * (1 + pulse * 0.04), 1, R * (1 + pulse * 0.04));
    this.lotRing.material.color.setHex(col);
    this.lotRing.material.opacity = 0.35 + 0.35 * pulse;
  }

  /** R3-GARAGE: the way-out arrows (render/world/startDistrict.js ExitArrows) or null when out of range */
  get exitArrows() { const L = this.live.get('r3_exit_arrows'); return L ? L.arrows : null; }
  /** the garage exterior (for the on-foot tutorial): { root, door } or null when out of range */
  get garage() { const L = this.live.get('garage'); return L ? { root: L.root, door: L.door } : null; }

  dispose() {
    for (const L of this.live.values()) L.root.removeFromParent();
    this.live.clear();
    for (const m of this.owned) m.dispose();
    if (this._ringGeo) this._ringGeo.dispose();
    this.root.removeFromParent();
  }
}

export function findSetpiece(snap, type) {
  const list = snap && snap.setpieces;
  if (!Array.isArray(list)) return null;
  for (const e of list) if (e && e.type === type) return e;
  return null;
}
/** drawbridge leaf angle (rad) from a set-piece state: {angle} (preferred) or {open|lift|progress 0..1} × maxAngle */
export function leafAngle(sp, route) {
  if (typeof sp.angle === 'number') return sp.angle;
  if (typeof sp.leaf === 'number') return sp.leaf;
  const def = (route.setpieces || []).find((d) => d.type === 'drawbridge');
  const max = (def && def.maxAngle) || 0.55;
  for (const k of ['open', 'lift', 'progress', 'k']) if (typeof sp[k] === 'number') return Math.max(0, Math.min(1, sp[k])) * max;
  return 0;
}

export { SEA_Y };
