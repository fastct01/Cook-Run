// ─────────────────────────────────────────────────────────────────────────────
// Terrain tiles (VIEW-WORLD-A). 80 × 60 m heightfield tiles from ART (`terrain_*`),
// road edge at local x = +40, placed beyond each area's scenery band (RoadInfo
// TilePlan). Tiles are BENT along the road while baking: local z runs along the
// centre line and local x maps to the lateral offset, so 60 m rows follow every
// curve with seamless seams. Forest-floor tiles get a pine on every treeSpot;
// lake / river tiles put their `water` mesh into the chunk's water batch.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { hash2 } from '../roadBuilder.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _tint = new THREE.Color();

/** Tile local (x, z) → world, for tile `tl` on side s. */
export function tileToWorld(info, tl, s, x, y, z, out) {
  const along = tl.zc + (s > 0 ? z : -z);
  const u = s * (tl.u0 + (40 - x));
  out.x = info.track.xAt(along, u);
  out.y = y - (tl.sink || 0);
  out.z = along;
  return out;
}
/** World (u, z) → tile local (x, z) */
export function worldToTile(tl, s, u, z) {
  return { x: 40 - (Math.abs(u) - tl.u0), z: s > 0 ? z - tl.zc : tl.zc - z };
}

export function buildTiles(ctx) {
  const { info, protos, B, z0, z1 } = ctx;
  const t = info.track;
  let n = 0;
  for (const s of [1, -1]) {
    for (const tl of info.tilePlan.tilesIn(z0, z1, s)) {
      const p = protos.get(tl.kind, tl.variant, { split: ['water'] });
      // centre line sampled every metre along the tile (vertex warps lerp it)
      const cx = new Float64Array(63);
      for (let i = 0; i < 63; i++) cx[i] = t.centerX(tl.zc - 31 + i);
      const fn = (x, y, z, out) => {
        const along = tl.zc + (s > 0 ? z : -z);
        const f = along - (tl.zc - 31), i = Math.max(0, Math.min(61, Math.floor(f))), k = f - i;
        const c = cx[i] + (cx[i + 1] - cx[i]) * k;
        out.x = c - s * (tl.u0 + (40 - x)); out.y = y - (tl.sink || 0); out.z = along;
        return out;
      };
      const yaw = (s > 0 ? 0 : Math.PI) + t.headingAt(tl.zc);
      B.ground.addProtoFn(p, fn, yaw);
      if (p.sub && p.sub.water) B.water.addProtoFn(p.sub.water, fn, yaw);
      n++;
      // pines on the forest floor's tree spots
      const spots = p.ud.treeSpots;
      if (spots && spots.length) {
        const w = {};
        for (let i = 0; i < spots.length; i++) {
          const [lx, lz] = spots[i];
          const h = hash2(Math.round(lx * 10), Math.round(lz * 10) + i, Math.round(tl.zc) + (s > 0 ? 1 : 2));
          const v = h < 0.45 ? 0 : h < 0.7 ? 1 : h < 0.88 ? 2 : 3;
          const pine = protos.get('pine', v);
          tileToWorld(info, tl, s, lx, protos.heightAt(p, lx, lz), lz, w);
          const sc = 0.82 + ((h * 7.31) % 1) * 0.36;
          _p.set(w.x, w.y - 0.05, w.z);
          _q.setFromEuler(_e.set(0, h * 40, 0));
          _s.set(sc, sc * (0.9 + ((h * 3.7) % 1) * 0.25), sc);
          _m.compose(_p, _q, _s);
          const k = 0.92 + ((h * 13.1) % 1) * 0.16;
          _tint.setRGB(k, k * (0.97 + ((h * 5.3) % 1) * 0.06), k);
          B.near.addProto(pine, _m, _tint);
        }
      }
    }
  }
  return n;
}

/** Ground height at (u, z) including tiles (for placing scenery on top of them). */
export function groundAt(info, protos, u, z) {
  const s = u > 0 ? 1 : -1;
  const cov = info.tilePlan.cover(z, s, []);
  const a = Math.abs(u);
  for (const c of cov) {
    if (a < c.u0 || a > c.u1 || !c.tile) continue;
    const tl = c.tile;
    const p = protos.get(tl.kind, tl.variant, { split: ['water'] });
    const l = worldToTile(tl, s, u, z);
    return protos.heightAt(p, l.x, l.z) - (tl.sink || 0);
  }
  return info.groundY(u, z);
}
