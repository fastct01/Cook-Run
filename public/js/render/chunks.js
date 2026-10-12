// ─────────────────────────────────────────────────────────────────────────────
// Chunk streamer (VIEW-WORLD-A): 50 m slices of road + ground + terrain tiles +
// structures + scenery. Each chunk = a few merged meshes, one per shared material:
//   ground (road, sides, tiles) · cobble · water · decal · marks ·
//   near (scenery, casts shadows) · near:atlas (every sign, see world/atlas.js) · far
// so a chunk costs ~5–8 draw calls whatever is in it. Built on demand, nearest
// first, time-sliced; disposed (geometry only — materials are shared) when out of
// range. Scenery comes from world/layout.js (deterministic per biome + seed), so
// both players see the same world.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { buildRoadChunk, CHUNK } from './roadBuilder.js';
import { WBatch } from './world/wbatch.js';
import { worldMat, cobbleMat, waterMat } from './world/materials.js';
import { SignAtlas } from './world/atlas.js';
import { WorldProtos } from './world/protos.js';
import { Layout } from './world/layout.js';
import { buildTiles, groundAt } from './world/terrain.js';
import { buildStaticStructures } from './world/structures.js';
import { hash2 } from './roadBuilder.js';
import { LAMP_HEADS } from './world/lights.js';
import { START_MIN_Z, START_STREAM_UNTIL, startDistrictEnabled } from './world/startDistrict.js';   // R3-GARAGE

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _tint = new THREE.Color();
const LOT = new THREE.Color('#55575a'), LOT_LINE = new THREE.Color('#e2ddcd'), PLAZA = new THREE.Color('#b9a98e');

export class Chunks {
  constructor(scene, info, lib, seed) {
    this.scene = scene; this.info = info; this.lib = lib; this.seed = seed | 0;
    this.track = info.track;
    this.root = new THREE.Group(); this.root.name = 'chunks';
    scene.add(this.root);
    this.map = new Map();
    this.range = [-150, 500];
    this.stats = { built: 0, disposed: 0, tris: 0, buildMs: 0, maxBuildMs: 0 };
    this.nChunks = Math.ceil(this.track.length / CHUNK) + 4;
    this.atlas = new SignAtlas();
    this.protos = new WorldProtos(lib, this.atlas);
    this.layout = new Layout(info, this.protos, this.seed);
    this._tintsDone = new Set();
    this.startMinZ = startDistrictEnabled(info) ? START_MIN_Z : null;   // R3-GARAGE: the start district reaches back to z −200
    // the garage door position along the road (from the model) for the driveway
    if (info.garage) {
      try {
        const p = this.protos.get(info.garage.model || 'rooks_garage', 0);
        const bx = (p.ud.bay && p.ud.bay.x) || 0;
        info.garageDoorZ = info.garage.z - (info.garage.side || 1) * bx;
      } catch (e) { /* fallback model */ }
    }
  }
  setRange(behind, ahead) { this.range = [-behind, ahead]; }
  // R3-GARAGE: lowest chunk index kept around z (ci ≥ −2 as before; back to the start district's START_MIN_Z
  // while the focus is in the first START_STREAM_UNTIL metres)
  _lowCi(z) {
    let a = Math.max(-2, Math.floor((z + this.range[0]) / CHUNK));
    if (this.startMinZ != null && z < START_STREAM_UNTIL) a = Math.min(a, Math.floor(this.startMinZ / CHUNK));
    return a;
  }

  // Ensure chunks around z exist. budgetMs limits build time per call (Infinity = all, synchronous).
  // Builds are generators that yield between phases (road, tiles, structures, every ~30 scenery
  // items), so one heavy chunk is spread over several frames instead of causing a hitch.
  update(z, budgetMs = 8) {
    const a = this._lowCi(z);   // R3-GARAGE (was max(-2, …))
    const b = Math.min(this.nChunks, Math.floor((z + this.range[1]) / CHUNK));
    for (const [ci, ch] of this.map) {
      if (ci < a - 1 || ci > b + 1) { this._dispose(ch); this.map.delete(ci); }
    }
    if (this.job && (this.job.ci < a - 1 || this.job.ci > b + 1)) this.job = null;
    const want = [];
    for (let ci = a; ci <= b; ci++) if (!this.map.has(ci)) want.push(ci);
    if (!want.length) { this.atlas.flush(); return 0; }
    const zc = Math.floor(z / CHUNK);
    want.sort((p, q) => Math.abs(p - zc) - Math.abs(q - zc));
    const t0 = performance.now();
    let n = 0;
    // the nearest missing chunk pre-empts a far job in progress
    if (this.job && want[0] !== this.job.ci && Math.abs(want[0] - zc) + 1 < Math.abs(this.job.ci - zc)) this.job = null;
    while (performance.now() - t0 <= budgetMs) {
      if (!this.job) {
        const ci = want.find((c) => !this.map.has(c));
        if (ci == null) break;
        this.job = { ci, it: this._buildSteps(ci), ms: 0 };
      }
      const j = this.job;
      const t1 = performance.now();
      let r;
      do { r = j.it.next(); } while (!r.done && (budgetMs === Infinity || performance.now() - t0 <= budgetMs));
      j.ms += performance.now() - t1;
      if (r.done) {
        this.map.set(j.ci, r.value);
        this.stats.buildMs = j.ms; this.stats.maxBuildMs = Math.max(this.stats.maxBuildMs, j.ms);
        this.job = null;
        n++;
      }
    }
    this.atlas.flush();
    return want.length - n;
  }
  pending(z) {
    const a = this._lowCi(z), b = Math.min(this.nChunks, Math.floor((z + this.range[1]) / CHUNK));   // R3-GARAGE
    let n = 0; for (let ci = a; ci <= b; ci++) if (!this.map.has(ci)) n++; return n;
  }

  _dispose(ch) {
    ch.group.removeFromParent();
    ch.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.stats.disposed++;
  }
  clear() { for (const ch of this.map.values()) this._dispose(ch); this.map.clear(); }
  dispose() { this.clear(); this.root.removeFromParent(); this.atlas.dispose(); }

  // tile colours drive the far ground tint of tiled areas (computed once per biome)
  _tileTints(z0, z1) {
    const info = this.info;
    for (const b of info.biomes) {
      if (!b.area.tiles || this._tintsDone.has(b.id) || b.to + 300 < z0 || b.from - 300 > z1) continue;
      this._tintsDone.add(b.id);
      const c = new THREE.Color(0, 0, 0); let tot = 0;
      for (const [kind, v, w] of b.area.tiles.kinds) { const p = this.protos.get(kind, v, { split: ['water'] }); const e = this.protos.edgeColor(p); c.r += e.r * w; c.g += e.g * w; c.b += e.b * w; tot += w; }
      if (tot) info.tilePlan.tints.set(b.id, c.multiplyScalar(1 / tot));
    }
  }

  _build(ci) {
    const it = this._buildSteps(ci);
    let r; do { r = it.next(); } while (!r.done);
    return r.value;
  }

  *_buildSteps(ci) {
    const z0 = ci * CHUNK, z1 = z0 + CHUNK;
    const info = this.info;
    this._tileTints(z0 - CHUNK, z1 + CHUNK);
    const B = {
      ground: new WBatch({ castShadow: false, receiveShadow: true, material: worldMat('ground'), name: 'ground' }),
      cobble: new WBatch({ castShadow: false, receiveShadow: true, material: cobbleMat(), name: 'cobble' }),
      water: new WBatch({ castShadow: false, receiveShadow: true, material: waterMat(), name: 'water' }),
      decal: new WBatch({ castShadow: false, receiveShadow: true, material: worldMat('decal'), name: 'decal', renderOrder: 1 }),
      marks: new WBatch({ castShadow: false, receiveShadow: true, material: worldMat('marks'), name: 'marks', renderOrder: 2 }),
      near: new WBatch({ castShadow: true, receiveShadow: true, material: worldMat('emit'), name: 'near' }),
      far: new WBatch({ castShadow: false, receiveShadow: false, material: worldMat('far'), name: 'far' }),
    };
    B.props = B.near;
    B.far.atlasTo = B.near;
    buildRoadChunk(info, z0, z1, B);
    yield 1;
    const ctx = { ci, z0, z1, B, info, protos: this.protos, lamps: [] };
    buildTiles(ctx);
    yield 2;
    buildStaticStructures(ctx);
    yield 3;
    yield* this._scenery(ctx);
    const group = new THREE.Group();
    group.name = 'chunk_' + ci;
    group.matrixAutoUpdate = false;
    let tris = 0;
    for (const [k, b] of Object.entries(B)) {
      if (k === 'props') continue;
      for (const m of b.toMeshes()) { group.add(m); tris += m.geometry.attributes.position.count / 3; }
    }
    this.root.add(group);
    this.stats.built++;
    return { ci, group, tris, lamps: ctx.lamps };
  }

  // ── scenery from the layout ────────────────────────────────────────────────
  *_scenery(ctx) {
    const { z0, z1, B } = ctx;
    const t = this.track, info = this.info;
    let k = 0;
    for (const it of this.layout.itemsIn(z0, z1)) {
      if (++k % 30 === 0) yield 4;
      if (it.decal) { this._decal(ctx, it); continue; }
      const p = this.protos.get(it.kind, it.v);
      const x = t.xAt(it.z, it.u);
      let y = it.y;
      if (y == null) {
        const w = p.size.w * it.s, l = p.size.l * it.s;
        y = this._yAt(it.u, it.z, Math.min(w, 30), Math.min(l, 30)) - (it.sink ?? 0.05) + (it.yOff || 0);
      }
      _p.set(x, y, it.z);
      _q.setFromEuler(_e.set(0, it.yaw, 0));
      _s.set(it.s, it.s * it.sy, it.s);
      _m.compose(_p, _q, _s);
      let tc = null;
      if (it.tint) {
        const h1 = hash2(Math.round(it.z * 7), Math.round(it.u * 7), 3) - 0.5, h2 = hash2(Math.round(it.z * 5), Math.round(it.u * 3), 4) - 0.5;
        const k = 1 + h1 * 2 * it.tint;
        tc = _tint.setRGB(k * (1 + h2 * it.tint * 0.5), k, k * (1 - h2 * it.tint * 0.5));
      }
      (it.batch === 'far' ? B.far : B.near).addProto(p, _m, tc);
      const heads = LAMP_HEADS[it.kind];
      if (heads) for (const h of heads) { _p.set(h[0], h[1], h[2]).applyMatrix4(_m); ctx.lamps.push(_p.x, _p.y, _p.z); }
    }
    void info;
  }

  // lowest terrain point under a footprint (tiles included) so things never float
  _yAt(u, z, w, l) {
    const info = this.info, P = this.protos;
    let y = groundAt(info, P, u, z);
    if (w > 2 || l > 2) {
      for (const [du, dz] of [[l / 2, 0], [-l / 2, 0], [0, w / 2], [0, -w / 2]]) {
        const uu = u + du;
        if (Math.sign(uu) !== Math.sign(u)) continue;
        y = Math.min(y, groundAt(info, P, uu, z + dz));
      }
    }
    return y;
  }

  // parking lots (stall lines) and paved plazas laid by the layout
  _decal(ctx, d) {
    const t = this.track, B = ctx.B, s = d.side;
    const steps = Math.max(2, Math.ceil((d.z1 - d.z0) / 6));
    const base = d.decal === 'plaza' ? PLAZA : LOT;
    for (let k = 0; k < steps; k++) {
      const za = d.z0 + (d.z1 - d.z0) * k / steps, zb = d.z0 + (d.z1 - d.z0) * (k + 1) / steps;
      const xa = t.centerX(za), xb = t.centerX(zb);
      const c = base.clone().multiplyScalar(0.95 + 0.1 * hash2(k, Math.round(d.z0), 9));
      B.decal.quadXYZ(xa - s * d.u0, 0.012, za, xa - s * d.u1, 0.012, za, xb - s * d.u1, 0.012, zb, xb - s * d.u0, 0.012, zb, c, c, c, c);
    }
    if (d.decal === 'plaza') {
      // paving joints
      for (let z = d.z0 + 3; z < d.z1 - 1; z += 3) {
        const x = t.centerX(z);
        B.marks.quadXYZ(x - s * d.u0, 0.02, z - 0.04, x - s * d.u1, 0.02, z - 0.04, x - s * d.u1, 0.02, z + 0.04, x - s * d.u0, 0.02, z + 0.04, PLAZA.clone().multiplyScalar(0.8));
      }
      return;
    }
    if (d.stalls && d.u1 - d.u0 > 8) {
      // a row of stalls along the front of the building + an aisle line
      const a1 = d.u1 - 0.6, a0 = a1 - 5.2;
      for (let z = d.z0 + 2; z < d.z1 - 1; z += 2.9) {
        const x = t.centerX(z);
        B.marks.quadXYZ(x - s * a0, 0.022, z - 0.06, x - s * a1, 0.022, z - 0.06, x - s * a1, 0.022, z + 0.06, x - s * a0, 0.022, z + 0.06, LOT_LINE);
      }
      if (d.u1 - d.u0 > 16) {
        const b1 = d.u0 + 6.2, b0 = d.u0 + 1.0;
        for (let z = d.z0 + 2; z < d.z1 - 1; z += 2.9) {
          const x = t.centerX(z);
          B.marks.quadXYZ(x - s * b0, 0.022, z - 0.06, x - s * b1, 0.022, z - 0.06, x - s * b1, 0.022, z + 0.06, x - s * b0, 0.022, z + 0.06, LOT_LINE);
        }
      }
    }
  }
}
