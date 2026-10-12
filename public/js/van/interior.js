// ─────────────────────────────────────────────────────────────────────────────
// interior.js — the cut-away mobile lab inside the RV (Agent VANWORLD).
//
//   const it = buildInterior(data, { createModel });
//   view.rvAnchor.add(it.root);          // RV-local frame (origin = RV model origin, +Z front, +X driver's left)
//   it.anchors[stationId]                // Object3D work frame per station (see VAN_CONTRACT.md "Anchor frame")
//   it.parts.*                           // named dynamic bits animated by hazards3d.js / VanLab3D.js
//
// Built to read as OUR RV from above: exterior paint bands on the outside of every wall
// (off-white, faded teal band, mustard pinstripe), rust-red side door on −X, wheels + skirt.
// Cut-away: the near (−X) wall, the rear wall and the cab partition stop at cutHeight above
// the floor with a dark cap; the far (+X) wall is full height with curtained windows; no roof.
//
// Draw calls: static furniture is merged with the ART Kit into a handful of meshes by material
// (shadow-casting low shell, non-casting tall shell, unlit glow, glass, board/calendar textures),
// dynamic pieces are separate named meshes / InstancedMeshes. ≈ 40 calls incl. shadow passes.
// Unity: this whole builder maps to one prefab (static meshes = MeshRenderers, anchors = empty
// transforms, parts = named child objects animated by a LabInterior MonoBehaviour).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Kit, rng } from '../assets/models/kit.js';
import { PAL, vcolMaterial, mix, shade } from '../assets/palette.js';

export const IPAL = Object.freeze({
  wood: '#8a6a4a', woodDark: '#5e4632', woodLight: '#b5976f', block: '#a8875e',
  steel: '#9aa3a8', steelDark: '#5f666b', steelLight: '#c3c9cb',
  wall: '#e2d8bf', wallLow: '#c9b994', trim: '#a8987a',
  floorA: '#3f6f66', floorB: '#64917e', floorCab: '#2f3336',
  cut: '#2f2a27', cutEdge: '#5a4e45',
  body: PAL.rvBody, teal: PAL.rvTeal, mustard: PAL.rvMustard, door: PAL.rvDoor,
  rust: '#9c4a32', product: '#7fd6c2', curtainA: '#a8583c', curtainB: '#b98552',
  frame: '#cfc8b4', glass: '#9fc3cc', cork: '#b98a5a', red: '#c2412f',
});

const DEG = Math.PI / 180;

/** Derived layout numbers (RV-local metres) from van.json. */
export function vanDims(van) {
  const r = van.rv || {};
  const FY = r.floorY ?? 0.72;
  const D = {
    FY,
    CUT: FY + (r.cutHeight ?? 1.05),
    TOP: (r.ceilingY ?? 3.0) + 0.05,
    XO: 1.27,                       // outer half width of the coach (buildRV: W = 2.54)
    XI: r.wallInnerX ?? 1.19,
    ZRO: -4.28,                     // rear outer face
    ZRI: r.rearInnerZ ?? -4.12,
    ZP: r.cabPartitionZ ?? 2.15,
    T: 0.08,                        // wall thickness
    CH: van.counterHeight ?? 0.95,
    CD: r.counterDepth ?? 0.63,
    CABX: 1.15,                     // cab outer half width
    BODY0: 0.6,                     // bottom of the coach body
  };
  D.TOPC = FY + D.CH;               // counter top height (anchor y = 0)
  D.WIN0 = FY + 1.15; D.WIN1 = FY + 1.8;      // +X window band
  D.WINDOWS = [[-3.4, -2.6], [-0.35, 0.95]];  // +X coach windows (z ranges)
  D.DOOR = [-0.55, 0.35];                     // −X side door opening (z range)
  D.HULL = [-2.82, -1.88];                    // −X full-height hull section with the patch spot
  return D;
}

/** Anchor frame for a station (see VAN_CONTRACT.md): position + rotation.y. */
export function stationFrame(st, D) {
  const s = st.side || 0;
  let x, z = st.z, theta;
  if (st.kind === 'board' || st.faces === 'front') { x = st.x; z = D.ZP - D.T / 2 - 0.6; theta = Math.PI; }
  else if (st.kind === 'crate') { x = st.x; z = st.z + 0.28; theta = 0; }
  else if (st.kind === 'wall') { x = s * (D.XI - 0.6); theta = s > 0 ? -Math.PI / 2 : Math.PI / 2; }
  else if (st.kind === 'shelf') { x = s * (D.XI - 0.42); theta = s > 0 ? -Math.PI / 2 : Math.PI / 2; }
  else { x = s * (D.XI - D.CD); theta = s > 0 ? -Math.PI / 2 : Math.PI / 2; }
  return { pos: [x, D.TOPC, z], theta };
}

// exterior paint by absolute height (matches buildRV's bands)
function extBand(y) {
  if (y < 0.72) return mix(PAL.rvTeal, PAL.mud, 0.5);
  if (y < 0.84) return mix(PAL.rvTeal, PAL.dirt, 0.28);
  if (y < 1.22) return PAL.rvTeal;
  if (y < 1.28) return PAL.rvBody;
  if (y < 1.34) return PAL.rvMustard;
  if (y < 2.78) return PAL.rvBody;
  if (y < 2.82) return PAL.rvMustard;
  if (y < 2.86) return PAL.rvBody;
  if (y < 2.93) return PAL.rvTeal;
  return PAL.rvBody;
}
const BAND_EDGES = [0.72, 0.84, 1.22, 1.28, 1.34, 2.78, 2.82, 2.86, 2.93];

let _imat = null;
/** Interior vertex-colour material: the shared matte look with a warm multiplier (cozy lab light). */
export function interiorMaterial() {
  return _imat || (_imat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, color: '#f6e6cf', name: 'CR_VanInterior_VCol' }));
}

export function buildInterior(data, { createModel } = {}) {
  const van = data.van;
  const D = vanDims(van);
  const { FY, CUT, TOP, XO, XI, ZRO, ZRI, ZP, T, CABX, BODY0 } = D;
  const root = new THREE.Group();
  root.name = 'van_interior';

  // ── kits (one draw call each) ────────────────────────────────────────────
  const kLow = new Kit(31);      // casts shadows: floor, low walls, furniture, cab body
  const kHigh = new Kit(32);     // tall far wall + frames (no shadow: keeps the interior bright)
  const kGlow = new Kit(33);     // unlit: strip light, lava lamp, dials, marker lights
  const kGlass = new Kit(34);    // transparent: window glass, jar glass

  const inner = (y) => (y < FY + D.CH ? IPAL.wallLow : IPAL.wall);
  const levelsOf = (y0, y1, extra = []) => [y0, ...[...BAND_EDGES, FY + D.CH, ...extra].filter((y) => y > y0 + 1e-4 && y < y1 - 1e-4).sort((a, b) => a - b), y1]
    .filter((y, i, a) => i === 0 || y - a[i - 1] > 1e-4);

  // painted wall along Z on side s (x = s*(XO - T/2)), z0..z1, y0..y1
  function wallX(k, s, z0, z1, y0, y1, o = {}) {
    const lv = levelsOf(y0, y1);
    const xc = s * (XO - T / 2);
    for (let i = 0; i < lv.length - 1; i++) {
      const ya = lv[i], yb = lv[i + 1];
      const top = i === lv.length - 2;
      k.box((cx, cy, cz, nx, ny) => {
        if (nx * s > 0.5) return extBand(cy);
        if (nx * s < -0.5) return o.innerColor ? o.innerColor(cy) : inner(cy);
        if (ny > 0.5) return top && o.cap ? IPAL.cut : IPAL.trim;
        if (ny < -0.5) return IPAL.trim;
        return o.jamb || IPAL.frame;
      }, [T, yb - ya, z1 - z0], [xc, (ya + yb) / 2, (z0 + z1) / 2], { jit: 0.03 });
    }
    if (o.cap) capX(k, s, z0, z1, y1);
  }
  function capX(k, s, z0, z1, y) {
    k.box(IPAL.cut, [T + 0.03, 0.03, z1 - z0], [s * (XO - T / 2), y + 0.015, (z0 + z1) / 2]);
    k.box(IPAL.cutEdge, [0.012, 0.031, z1 - z0], [s * (XO - T - 0.006), y + 0.0155, (z0 + z1) / 2]);
  }
  // painted wall across X at z face (outward dir od = ±1), x0..x1
  function wallZ(k, zc, od, x0, x1, y0, y1, o = {}) {
    const lv = levelsOf(y0, y1);
    for (let i = 0; i < lv.length - 1; i++) {
      const ya = lv[i], yb = lv[i + 1];
      const top = i === lv.length - 2;
      k.box((cx, cy, cz, nx, ny, nz) => {
        if (nz * od > 0.5) return o.outer ? o.outer(cy) : extBand(cy);
        if (nz * od < -0.5) return o.innerColor ? o.innerColor(cy) : inner(cy);
        if (ny > 0.5) return top && o.cap ? IPAL.cut : IPAL.trim;
        return o.jamb || IPAL.frame;
      }, [x1 - x0, yb - ya, T], [(x0 + x1) / 2, (ya + yb) / 2, zc], { jit: 0.03 });
    }
    if (o.cap) {
      k.box(IPAL.cut, [x1 - x0, 0.03, T + 0.03], [(x0 + x1) / 2, y1 + 0.015, zc]);
      k.box(IPAL.cutEdge, [x1 - x0, 0.031, 0.012], [(x0 + x1) / 2, y1 + 0.0155, zc - od * (T / 2 + 0.006)]);
    }
  }

  // ── floor + underbody ────────────────────────────────────────────────────
  kLow.box(PAL.under, [2.5, FY - BODY0, ZP + 0.04 - ZRO], [0, (BODY0 + FY) / 2, (ZP + 0.04 + ZRO) / 2]);
  kLow.box(PAL.under, [1.6, 0.28, 7.4], [0, 0.45, -0.3]);                       // chassis rails
  kLow.box(PAL.under, [2.0, 0.2, 1.4], [0, 0.42, 3.3]);
  {
    const tile = 0.3, nx = Math.round((2 * XI) / tile), nz = Math.ceil((ZP - T / 2 - ZRI) / tile);
    const r = rng(7);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x0 = -XI + i * tile, z0 = ZRI + j * tile, z1 = Math.min(ZP - T / 2, z0 + tile);
      let c = (i + j) % 2 ? IPAL.floorA : IPAL.floorB;
      const w = r();
      if (w < 0.12) c = shade(c, 0.86); else if (w > 0.93) c = mix(c, '#7a6a52', 0.25);
      kLow.rectY(c, FY, [x0, x0 + tile], [z0, z1], { off: 0.002 });
    }
    // worn / grimy patches
    const blobs = [[0, -0.6, 0.35, 0.22], [0.1, 1.3, 0.3, 0.2], [-0.2, -2.4, 0.4, 0.25], [0.5, -3.4, 0.3, 0.2], [-0.6, 0.0, 0.25, 0.16]];
    blobs.forEach(([x, z, rx, rz], i) => kLow.blob('#2f4a47', 1, [x, FY + 0.006, z], { sx: rx, sz: rz, seed: 11 + i, seg: 9, off: 0.004 }));
    kLow.blob('#2b2622', 1, [0.62, FY + 0.007, -0.65], { sx: 0.18, sz: 0.4, seed: 5, off: 0.004 });     // scorch by the stove
  }
  // wheel wells (humps over the rear wheels)
  for (const s of [1, -1]) kLow.box(mix(IPAL.floorA, '#2a2d2f', 0.6), [0.24, 0.24, 1.0], [s * (XI - 0.12), FY + 0.12, -1.75], { c: 0.06 });

  // ── walls ────────────────────────────────────────────────────────────────
  // +X (far side): full height with two window holes (glass + curtains), vent fan hole
  {
    const s = 1, segs = [];
    let z = ZRO;
    for (const [w0, w1] of D.WINDOWS) { segs.push([z, w0, false]); segs.push([w0, w1, true]); z = w1; }
    segs.push([z, ZP + T / 2, false]);
    for (const [z0, z1, win] of segs) {
      if (!win) {
        wallX(kLow, s, z0, z1, BODY0, CUT);
        wallX(kHigh, s, z0, z1, CUT, TOP);
      } else {
        wallX(kLow, s, z0, z1, BODY0, CUT);
        wallX(kHigh, s, z0, z1, CUT, D.WIN0);
        wallX(kHigh, s, z0, z1, D.WIN1, TOP);
        // frames (inner + outer) + glass
        for (const side of [1, -1]) {
          const x = side > 0 ? XO + 0.004 : XO - T - 0.004;
          kHigh.rectX(IPAL.frame, x, [z0 - 0.05, z1 + 0.05], [D.WIN0 - 0.05, D.WIN0], side, { off: 0.003 });
          kHigh.rectX(IPAL.frame, x, [z0 - 0.05, z1 + 0.05], [D.WIN1, D.WIN1 + 0.05], side, { off: 0.003 });
          kHigh.rectX(IPAL.frame, x, [z0 - 0.05, z0], [D.WIN0, D.WIN1], side, { off: 0.003 });
          kHigh.rectX(IPAL.frame, x, [z1, z1 + 0.05], [D.WIN0, D.WIN1], side, { off: 0.003 });
        }
        kGlass.rectX(IPAL.glass, XO - T / 2, [z0, z1], [D.WIN0, D.WIN1], -1, { off: 0 });
        // sill
        kHigh.box(IPAL.trim, [0.06, 0.03, z1 - z0 + 0.1], [XO - T - 0.03, D.WIN0 - 0.015, (z0 + z1) / 2]);
        // curtain rod
        kHigh.cyl(IPAL.steelDark, 0.012, 0.012, z1 - z0 + 0.3, [XO - T - 0.07, D.WIN1 + 0.08, (z0 + z1) / 2], { axis: 'z', seg: 6 });
      }
    }
    // roof rim along the far wall (the roof is cut away) + gutter + clearance lights
    kHigh.box(PAL.rvBody, [0.3, 0.06, ZP + 0.04 - ZRO], [XO - 0.15, TOP + 0.03, (ZP + 0.04 + ZRO) / 2]);
    kHigh.box(IPAL.cut, [0.02, 0.065, ZP + 0.04 - ZRO], [XO - 0.3, TOP + 0.032, (ZP + 0.04 + ZRO) / 2]);
    for (const z of [-4.0, -1.0, 1.8]) kGlow.box('#ffb23a', [0.02, 0.05, 0.1], [XO + 0.012, TOP - 0.04, z]);
    // primer repair patch + rust (exterior grime, matches buildRV)
    kHigh.rectX(mix(PAL.rvBody, PAL.primer, 0.55), XO + 0.003, [-2.15, -1.35], [1.42 + 0.4, 1.88 + 0.4], 1, { off: 0.003 });
    kLow.rectX(PAL.rust, XO + 0.003, [-1.25, -0.95], [1.05, 1.18], 1, { off: 0.004 });
  }
  // −X (near side): cut at CUT; door opening; full-height hull section with the patch spot
  {
    const s = -1;
    const [d0, d1] = D.DOOR, [h0, h1] = D.HULL;
    wallX(kLow, s, ZRO, h0, BODY0, CUT, { cap: true });
    wallX(kLow, s, h0, h1, BODY0, CUT);
    wallX(kHigh, s, h0, h1, CUT, FY + 2.0, { cap: true });
    wallX(kLow, s, h1, d0, BODY0, CUT, { cap: true });
    wallX(kLow, s, d1, ZP + T / 2, BODY0, CUT, { cap: true });
    // door: rust-red panel filling the opening — [R3-DOCFP] a separate hinged mesh (built below: doorLow cut for the
    // overview, doorFull full height for first person) so the shop-run jump-out can swing it open; frame + step stay here
    const dx = -(XO - T / 2);
    for (const z of [d0 - 0.035, d1 + 0.035]) kLow.box('#6b5d4e', [T + 0.02, CUT - 0.62, 0.05], [dx, (CUT + 0.62) / 2, z]);
    kLow.box('#5d5f61', [0.3, 0.06, d1 - d0 + 0.05], [-XO - 0.12, 0.42, (d0 + d1) / 2]);
    kLow.box('#4b4c4e', [0.04, 0.2, d1 - d0 + 0.05], [-XO - 0.26, 0.34, (d0 + d1) / 2]);
    // rust patches on the outside
    kLow.rectX(PAL.rust, -XO - 0.004, [-4.1, -3.85], [0.88, 1.02], -1, { off: 0.003 });
    // hull section outside: the RV's rear −X window (dark glass, frame, curtains) + panel seams
    kHigh.flat('#cfc8b4', [[h0 + 0.1, 1.57], [h1 - 0.1, 1.57], [h1 - 0.1, 2.35], [h0 + 0.1, 2.35]], (z, y) => [-XO - 0.004, y, z], { facing: [-1, 0, 0], off: 0 });
    kHigh.flat(PAL.glass, [[h0 + 0.15, 1.62], [h1 - 0.15, 1.62], [h1 - 0.15, 2.3], [h0 + 0.15, 2.3]], (z, y) => [-XO - 0.008, y, z], { facing: [-1, 0, 0], off: 0 });
    kHigh.flat(PAL.curtain2, [[h0 + 0.15, 1.62], [h0 + 0.42, 1.62], [h0 + 0.36, 2.3], [h0 + 0.15, 2.3]], (z, y) => [-XO - 0.011, y, z], { facing: [-1, 0, 0], off: 0 });
    kHigh.flat(PAL.curtain2, [[h1 - 0.4, 1.62], [h1 - 0.15, 1.62], [h1 - 0.15, 2.3], [h1 - 0.34, 2.3]], (z, y) => [-XO - 0.011, y, z], { facing: [-1, 0, 0], off: 0 });
    kHigh.flat(PAL.glassHi, [[h0 + 0.5, 1.7], [h0 + 0.56, 1.7], [h0 + 0.66, 2.22], [h0 + 0.6, 2.22]], (z, y) => [-XO - 0.013, y, z], { facing: [-1, 0, 0], off: 0 });
    // hull section: riveted plate frame on the inner face
    kHigh.rectX(shade(IPAL.wall, 0.92), -XI + 0.004, [h0 + 0.04, h1 - 0.04], [CUT + 0.02, FY + 1.95], 1, { off: 0.002 });
    for (let i = 0; i < 5; i++) for (const y of [FY + 0.93, FY + 1.9]) kHigh.box(IPAL.steelDark, [0.014, 0.022, 0.022], [-XI + 0.008, y, h0 + 0.12 + i * ((h1 - h0 - 0.24) / 4)]);
  }
  // rear wall (cut) with a low rear window, tail lights + bumper outside
  {
    const zc = ZRO + T / 2 + 0.04;   // rear wall is thicker (ZRO..ZRI)
    const tz = ZRI - ZRO;
    const rw0 = -0.55, rw1 = 0.55, ry0 = FY + 0.52;
    const rear = (x0, x1, y0, y1, cap) => {
      const lv = levelsOf(y0, y1);
      for (let i = 0; i < lv.length - 1; i++) {
        const ya = lv[i], yb = lv[i + 1];
        kLow.box((cx, cy, cz, nx, ny, nz) => (nz < -0.5 ? extBand(cy) : nz > 0.5 ? inner(cy) : ny > 0.5 ? (cap && i === lv.length - 2 ? IPAL.cut : IPAL.trim) : IPAL.frame),
          [x1 - x0, yb - ya, tz], [(x0 + x1) / 2, (ya + yb) / 2, (ZRO + ZRI) / 2], { jit: 0.03 });
      }
      if (cap) {
        kLow.box(IPAL.cut, [x1 - x0, 0.03, tz + 0.03], [(x0 + x1) / 2, y1 + 0.015, (ZRO + ZRI) / 2]);
        kLow.box(IPAL.cutEdge, [x1 - x0, 0.031, 0.012], [(x0 + x1) / 2, y1 + 0.0155, ZRI + 0.006]);
      }
    };
    rear(-XO, rw0, BODY0, CUT, true);
    rear(rw1, XO, BODY0, CUT, true);
    rear(rw0, rw1, BODY0, ry0, false);
    // window: frame, glass up to the cut, cap across the top
    kLow.box(IPAL.cut, [rw1 - rw0, 0.03, tz + 0.03], [0, CUT + 0.015, (ZRO + ZRI) / 2]);
    kGlass.rectZ(IPAL.glass, (ZRO + ZRI) / 2, [rw0, rw1], [ry0, CUT], 1, { off: 0 });
    for (const zz of [ZRI + 0.004, ZRO - 0.004]) {
      const f = zz > ZRO ? 1 : -1;
      kLow.rectZ(IPAL.frame, zz, [rw0 - 0.05, rw1 + 0.05], [ry0 - 0.05, ry0], f, { off: 0.003 });
      kLow.rectZ(IPAL.frame, zz, [rw0 - 0.05, rw0], [ry0, CUT], f, { off: 0.003 });
      kLow.rectZ(IPAL.frame, zz, [rw1, rw1 + 0.05], [ry0, CUT], f, { off: 0.003 });
    }
    kLow.cyl(IPAL.steelDark, 0.012, 0.012, 1.4, [0, CUT - 0.05, ZRI + 0.06], { axis: 'x', seg: 6 });
    // outside: tail lights, bumper, plate, mud
    for (const s of [1, -1]) {
      kLow.front('#2a2a2b', ZRO - 0.005, [[s * 1.06 - 0.1, 0.82], [s * 1.06 + 0.1, 0.82], [s * 1.06 + 0.1, 1.38], [s * 1.06 - 0.1, 1.38]], -1, { off: 0.006 });
      kGlow.box(PAL.taillight, [0.15, 0.48, 0.03], [s * 1.06, 1.1, ZRO - 0.02]);
      kLow.box(PAL.amber, [0.16, 0.12, 0.05], [s * 1.06, 0.76, ZRO]);
    }
    kLow.box(PAL.trim, [2.5, 0.24, 0.26], [0, 0.56, ZRO - 0.06], { c: 0.05, cv: true });
    kLow.box(PAL.plate, [0.42, 0.18, 0.02], [0.55, 0.76, ZRO - 0.01]);
    kLow.front(mix(PAL.rvTeal, PAL.mud, 0.5), ZRO - 0.005, [[-1.2, 0.64], [-0.4, 0.64], [-0.6, 0.92], [-0.95, 1.0], [-1.2, 0.86]], -1, { off: 0.008 });
    kLow.cyl('#5a5753', 0.05, 0.05, 0.5, [0.78, 0.36, ZRO + 0.1], { axis: 'z', seg: 6, open: true });
    void zc;
  }
  // cab partition: cut at CUT, raised centre panel carrying the Recipe Board
  {
    const zc = ZP;
    wallZ(kLow, zc, 1, -XI, XI, FY - 0.02, CUT, { cap: true, outer: () => IPAL.wallLow, innerColor: (y) => (y < FY + 0.12 ? IPAL.woodDark : IPAL.wood) });
    // raised centre (board backing): two posts + a plank panel
    kHigh.box(IPAL.woodDark, [1.12, FY + 1.86 - CUT, 0.06], [0, (CUT + FY + 1.86) / 2, zc]);
    for (const x of [-0.58, 0.58]) kHigh.box(IPAL.woodDark, [0.06, FY + 1.92 - CUT, 0.09], [x, (CUT + FY + 1.92) / 2, zc]);
    kHigh.box(IPAL.cut, [1.22, 0.04, 0.1], [0, FY + 1.94, zc]);
  }
  // ── cab: lower body, hood, dash, windshield frame, seats ────────────────
  {
    const z0 = ZP + T / 2, zw = 3.32;
    // floor + sides (+X full to window line + window frame, −X cut)
    kLow.box(IPAL.floorCab, [2 * CABX - 0.1, 0.05, zw - z0 + 0.05], [0, FY - 0.02, (z0 + zw) / 2]);
    kLow.box(PAL.under, [2 * CABX, FY - 0.5, 4.3 - z0], [0, (0.5 + FY) / 2, (z0 + 4.3) / 2]);
    const cabSide = (s, y1, k, cap) => {
      const lv = levelsOf(0.5, y1);
      for (let i = 0; i < lv.length - 1; i++) {
        const ya = lv[i], yb = lv[i + 1];
        k.box((cx, cy, cz, nx, ny) => (nx * s > 0.5 ? extBand(cy) : nx * s < -0.5 ? '#3d3a36' : ny > 0.5 ? (cap && i === lv.length - 2 ? IPAL.cut : IPAL.trim) : IPAL.trim),
          [0.07, yb - ya, zw - z0], [s * (CABX - 0.035), (ya + yb) / 2, (z0 + zw) / 2], { jit: 0.03 });
      }
    };
    cabSide(1, 1.42, kLow, false);
    cabSide(-1, CUT, kLow, true);
    // +X cab door window frame (glass) up to the cab roof line
    kHigh.box(PAL.rvBody, [0.07, 0.1, zw - z0], [CABX - 0.035, 1.42 + 0.05, (z0 + zw) / 2]);
    kHigh.box(PAL.rvBody, [0.07, 0.08, zw - z0 - 0.4], [CABX - 0.035, 2.1, (z0 + zw - 0.4) / 2]);
    kHigh.box(PAL.rvBody, [0.07, 0.62, 0.08], [CABX - 0.035, 1.79, z0 + 0.04]);
    kGlass.flat(IPAL.glass, [[z0 + 0.08, 1.52], [3.12, 1.52], [2.78, 2.06], [z0 + 0.08, 2.06]], (z, y) => [CABX - 0.035, y, z], { facing: [1, 0, 0], off: 0 });
    // hood + nose
    kLow.extrude(PAL.rvBody, [[3.3, 0.5], [4.2, 0.5], [4.3, 0.82], [4.26, 1.18], [4.0, 1.3], [3.3, 1.4]], 2 * CABX, { axis: 'x', bevel: 0.05 });
    kLow.side(PAL.rvTeal, CABX, [[3.3, 0.56], [4.18, 0.56], [4.24, 1.16], [4.0, 1.22], [3.3, 1.22]], { off: 0.012 });
    kLow.side(PAL.rvMustard, CABX, [[3.3, 1.28], [3.95, 1.28], [3.9, 1.34], [3.3, 1.34]], { off: 0.012 });
    kLow.box(PAL.chrome, [1.26, 0.42, 0.06], [0, 0.98, 4.27]);
    kLow.box(PAL.grille, [1.12, 0.32, 0.06], [0, 0.98, 4.3]);
    for (const s of [1, -1]) {
      kLow.cyl(PAL.chrome, 0.155, 0.155, 0.04, [s * 0.86, 0.98, 4.29], { axis: 'z', seg: 8 });
      kGlow.cyl(PAL.headlight, 0.115, 0.115, 0.02, [s * 0.86, 0.98, 4.315], { axis: 'z', seg: 8 });
      kLow.box(PAL.trim, [0.18, 0.04, 0.04], [s * (CABX + 0.08), 1.62, 3.2]);
      kLow.box(PAL.trim, [0.06, 0.32, 0.18], [s * (CABX + 0.18), 1.6, 3.2]);
    }
    kLow.box('#9d9b93', [2.36, 0.22, 0.26], [0, 0.56, 4.3], { c: 0.05, cv: true });
    // dashboard
    kLow.extrude('#3a3836', [[2.88, FY + 0.3], [3.3, FY + 0.3], [3.32, 1.4], [3.05, 1.47], [2.88, 1.36]], 2 * CABX - 0.14, { axis: 'x', bevel: 0.02 });
    kLow.box('#2a2927', [0.5, 0.12, 0.05], [0.55, 1.36, 2.9], { rot: [-0.5, 0, 0] });                 // gauge cluster
    kGlow.box('#e8c27a', [0.08, 0.05, 0.01], [0.48, 1.37, 2.876], { rot: [-0.5, 0, 0] });
    kGlow.box('#9fe0c8', [0.08, 0.05, 0.01], [0.62, 1.37, 2.876], { rot: [-0.5, 0, 0] });
    kLow.box('#55534f', [0.06, 0.06, 0.42], [0.55, 1.43, 3.07], { rot: [0.76, 0, 0] });                // steering column
    // windshield frame (A-pillars + header) + glass
    for (const s of [1, -1]) {
      const p = [[3.32, 1.38], [2.72, 2.14]];
      const len = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]);
      const ang = Math.atan2(p[1][1] - p[0][1], p[0][0] - p[1][0]);
      kHigh.box('#2b2c2e', [0.08, len, 0.08], [s * (CABX - 0.06), (p[0][1] + p[1][1]) / 2, (p[0][0] + p[1][0]) / 2], { rot: [ang - Math.PI / 2, 0, 0] });
    }
    kHigh.box('#2b2c2e', [2 * CABX - 0.04, 0.07, 0.1], [0, 2.14, 2.72]);
    {
      const a = [3.32, 1.38], b = [2.72, 2.14];
      kGlass.poly(IPAL.glass, [[CABX - 0.1, a[1] + 0.03, a[0] - 0.02], [-CABX + 0.1, a[1] + 0.03, a[0] - 0.02], [-CABX + 0.1, b[1] - 0.04, b[0] + 0.03], [CABX - 0.1, b[1] - 0.04, b[0] + 0.03]], { facing: [0, 0.6, 0.8] });
    }
    // seats
    const seat = (x) => {
      kLow.box('#4a4540', [0.5, 0.4, 0.5], [x, FY + 0.2, 2.55], { c: 0.04 });          // base
      kLow.box('#7a4a3a', [0.52, 0.1, 0.52], [x, FY + 0.45, 2.56], { c: 0.04 });       // cushion
      kLow.box('#7a4a3a', [0.52, 0.7, 0.12], [x, FY + 0.82, 2.3], { c: 0.04, rot: [-0.12, 0, 0] });   // backrest
      kLow.box('#6a3e30', [0.36, 0.18, 0.1], [x, FY + 1.27, 2.27], { c: 0.03, rot: [-0.12, 0, 0] });  // headrest
      kLow.box('#e2d6b0', [0.12, 0.5, 0.01], [x + 0.12, FY + 0.82, 2.37], { rot: [-0.12, 0, 0] });    // seat cover stripe
    };
    seat(van.cab?.driverSeat?.x ?? 0.55);
    seat(van.cab?.passengerSeat?.x ?? -0.55);
    // hump over the front wheels + a map in the passenger footwell
    for (const s of [1, -1]) kLow.box('#2a2c2e', [0.26, 0.2, 0.9], [s * (CABX - 0.2), FY + 0.1, 3.05], { c: 0.06 });
    kLow.box('#d6c08a', [0.3, 0.02, 0.22], [-0.6, FY + 0.03, 3.0], { rot: [0, 0.4, 0] });
  }

  // ── counters / stations ──────────────────────────────────────────────────
  const anchors = {};
  const stationById = {};
  for (const st of van.stations) {
    stationById[st.id] = st;
    const f = stationFrame(st, D);
    const a = new THREE.Object3D();
    a.name = `anchor_${st.id}`;
    a.position.set(f.pos[0], f.pos[1], f.pos[2]);
    a.rotation.set(0, f.theta, 0);
    a.userData = { station: st.id, kind: st.kind, side: st.side || 0 };
    root.add(a);
    anchors[st.id] = a;
    st._frame = f;
  }
  const inAnchor = (id, fn) => { const f = stationById[id]._frame; kLow.at(f.pos, [0, f.theta, 0], () => fn(kLow)); };
  const inAnchorHigh = (id, fn) => { const f = stationById[id]._frame; kHigh.at(f.pos, [0, f.theta, 0], () => fn(kHigh)); };
  const inAnchorGlow = (id, fn) => { const f = stationById[id]._frame; kGlow.at(f.pos, [0, f.theta, 0], () => fn(kGlow)); };

  // generic cabinet in anchor space: x ∈ [x0,x1], top at y=0, depth CD (z −CD..0)
  const CD = D.CD, CH = D.CH;
  function cabinet(k, x0, x1, top, o = {}) {
    const len = x1 - x0, xc = (x0 + x1) / 2;
    const h = o.h ?? CH;                 // body height (top surface at y = h - CH)
    const yt = h - CH;
    const topCol = top === 'steel' ? IPAL.steel : top === 'block' ? IPAL.block : top === 'veneer' ? mix(IPAL.wood, '#c9b48e', 0.35) : top;
    k.box(topCol, [len, 0.07, CD], [xc, yt - 0.035, -CD / 2], { jit: 0.05 });
    if (top === 'steel') k.box(IPAL.steelDark, [len, 0.02, 0.012], [xc, yt - 0.035, -0.006]);
    k.box(IPAL.wood, [len - 0.02, h - 0.16, CD - 0.03], [xc, -CH + 0.09 + (h - 0.16) / 2, -CD / 2 - 0.012], { jit: 0.04 });
    k.box('#2e2924', [len - 0.04, 0.09, CD - 0.08], [xc, -CH + 0.045, -CD / 2 - 0.035]);
    // doors / drawers on the front face (z = −0.027 → facing +Z)
    const nD = Math.max(1, Math.round(len / 0.45));
    const dw = (len - 0.04) / nD;
    for (let i = 0; i < nD; i++) {
      const a = x0 + 0.02 + i * dw;
      const yTop = yt - 0.09, yBot = -CH + 0.11;
      if (o.drawer !== false) {
        k.rectZ(shade(IPAL.wood, 0.88), -0.026, [a + 0.015, a + dw - 0.015], [yTop - 0.14, yTop], 1, { off: 0.003 });
        k.box(IPAL.steelLight, [0.1, 0.02, 0.02], [a + dw / 2, yTop - 0.07, -0.01]);
      }
      k.rectZ(shade(IPAL.wood, 0.9), -0.026, [a + 0.015, a + dw - 0.015], [yBot, yTop - 0.17], 1, { off: 0.003 });
      k.rectZ(shade(IPAL.wood, 1.06), -0.026, [a + 0.04, a + dw - 0.04], [yBot + 0.03, yTop - 0.2], 1, { off: 0.005 });
      k.box(IPAL.steelLight, [0.02, 0.1, 0.02], [i % 2 ? a + 0.06 : a + dw - 0.06, yTop - 0.3, -0.01]);
    }
    // worn edges / dents on the top
    const r = rng(Math.round((x0 + 3) * 97 + len * 13));
    for (let i = 0; i < 3; i++) k.blob(shade(topCol, 0.84 + r() * 0.08), 1, [x0 + 0.1 + r() * (len - 0.2), yt + 0.001, -0.08 - r() * 0.45], { sx: 0.04 + r() * 0.05, sz: 0.03 + r() * 0.04, seed: 40 + i, off: 0.002 });
  }

  // measuring bench (+X) — veneer top, ruler strip, pegboard of funnels on the wall
  inAnchor('measure', (k) => {
    cabinet(k, -0.45, 0.45, 'veneer');
    k.rectY('#d9c27a', 0.002, [-0.44, 0.44], [-0.04, -0.01], { off: 0.002 });
    for (let i = 0; i < 18; i++) k.rectY('#3a2f22', 0.004, [-0.43 + i * 0.05, -0.425 + i * 0.05], [-0.04, i % 2 ? -0.025 : -0.03], { off: 0.002 });
  });
  // gap filler between measure and stove (spice-rack style divider)
  {
    const zMid = -0.1;
    kLow.box(IPAL.woodDark, [CD, CH + 0.02, 0.18], [XI - CD / 2, FY + (CH + 0.02) / 2, zMid]);
  }
  // stove (+X) — steel top (VANCOOK's camp stove sits on it), scorch marks, gas line
  inAnchor('stove', (k) => {
    cabinet(k, -0.45, 0.45, 'steel', { drawer: false });
    k.blob('#2a2622', 1, [-0.08, 0.002, -0.34], { sx: 0.3, sz: 0.22, seed: 8, off: 0.002 });
    k.blob('#3a3430', 1, [0.25, 0.002, -0.2], { sx: 0.08, sz: 0.05, seed: 9, off: 0.002 });
    k.cyl('#3a3a38', 0.012, 0.012, 0.5, [0.3, 0.015, -0.55], { axis: 'x', seg: 5 });
  });
  inAnchorHigh('stove', (k) => {
    // soot stain on the wall behind the burner + a backsplash
    k.rectZ('#9a9285', -CD + 0.004, [-0.45, 0.45], [0, 0.45], 1, { off: 0.002 });
    k.flat('#57514b', [[-0.18, 0.05], [0.2, 0.05], [0.26, 0.4], [0.06, 0.6], [-0.2, 0.42]], (u, v) => [u, v, -CD + 0.004], { facing: [0, 0, 1], off: 0.004 });
  });
  // filler under the vent fan (+X): low cabinet with gas cans + coiled tubing on the wall
  {
    const z0 = -1.86, z1 = -1.1, x0 = XI - CD;
    kLow.box(IPAL.wood, [CD, 0.6, z1 - z0], [XI - CD / 2, FY + 0.3, (z0 + z1) / 2], { jit: 0.04 });
    kLow.box(IPAL.woodLight, [CD + 0.02, 0.04, z1 - z0 + 0.02], [XI - CD / 2, FY + 0.62, (z0 + z1) / 2]);
    kLow.rectX(shade(IPAL.wood, 0.85), x0 - 0.002, [z0 + 0.04, z1 - 0.04], [FY + 0.1, FY + 0.55], -1, { off: 0.003 });
    // gas cans (jerrycans)
    const can = (x, z, col, rot) => kLow.at([x, FY + 0.64, z], [0, rot, 0], (k) => {
      k.box(col, [0.17, 0.36, 0.28], [0, 0.18, 0], { c: 0.03 });
      k.box(shade(col, 0.8), [0.18, 0.04, 0.2], [0, 0.2, 0]);
      k.box('#2b2b2b', [0.04, 0.06, 0.14], [0, 0.39, -0.03]);
      k.cyl('#2b2b2b', 0.025, 0.025, 0.06, [0, 0.39, 0.1], { seg: 6 });
    });
    can(0.95, -1.7, '#b23a2c', 0.08);
    can(0.98, -1.33, IPAL.mustard, -0.12);
  }
  // bagging bench (+X) — butcher block, cutting board, roll of bags
  inAnchor('break', (k) => {
    cabinet(k, -0.45, 0.45, 'block');
    k.box('#2c2b29', [0.08, 0.06, 0.08], [0.47, -0.05, -0.45]);
  });
  // grinding bench (−X) — butcher block + bench vice at the end
  inAnchor('grind', (k) => {
    cabinet(k, -0.45, 0.45, 'block');
    k.at([-0.47, 0, -0.25], (kk) => {
      kk.box(IPAL.steelDark, [0.1, 0.1, 0.16], [0, 0.05, 0], { c: 0.02 });
      kk.box('#5a6a74', [0.12, 0.12, 0.05], [0, 0.07, 0.1], { c: 0.02 });
      kk.cyl(IPAL.steelLight, 0.012, 0.012, 0.22, [0, 0.07, 0.17], { axis: 'x', seg: 6 });
    });
  });
  // ice bath (−X) — steel top (VANCOOK's sink tub sits on it) + a faucet on the back edge
  inAnchor('cool', (k) => {
    cabinet(k, -0.45, 0.45, 'steel', { drawer: false });
    k.cyl(IPAL.steelLight, 0.018, 0.018, 0.3, [0.4, 0.15, -0.58], { seg: 6 });
    k.cyl(IPAL.steelLight, 0.016, 0.016, 0.16, [0.4, 0.3, -0.51], { axis: 'z', seg: 6 });
    k.box('#c2412f', [0.04, 0.03, 0.03], [0.34, 0.05, -0.6]);
    k.box('#3a6fd8', [0.04, 0.03, 0.03], [0.46, 0.05, -0.6]);
  });
  // pantry (+X) — tall open shelf; jar contents are an InstancedMesh (fill = inventory)
  const jarSlots = [];
  {
    const st = stationById.pantry, z0 = st.z - 0.45, z1 = st.z + 0.45, x0 = XI - 0.42, xc = (x0 + XI) / 2, depth = XI - x0;
    const shelves = [0.06, 0.52, 0.98, 1.44];
    for (const z of [z0, z1]) kLow.box(IPAL.woodDark, [depth, 1.9, 0.04], [xc, FY + 0.95, z], { jit: 0.04 });
    kLow.box(shade(IPAL.wood, 0.75), [0.02, 1.9, z1 - z0], [XI - 0.01, FY + 0.95, st.z]);
    for (const y of shelves) kLow.box(IPAL.wood, [depth, 0.035, z1 - z0 - 0.04], [xc, FY + y, st.z], { jit: 0.05 });
    kLow.box(IPAL.woodDark, [depth + 0.02, 0.05, z1 - z0 + 0.04], [xc, FY + 1.92, st.z]);
    for (const y of [0.98, 1.44]) kLow.box(IPAL.woodLight, [0.015, 0.05, z1 - z0 - 0.04], [x0 + 0.005, FY + y + 0.04, st.z]); // lip rails
    // bottom shelf: sacks + a crate of ice-pack bags
    kLow.box('#c9b48e', [0.3, 0.3, 0.32], [xc, FY + 0.06 + 0.15, st.z - 0.2], { c: 0.06, rot: [0, 0.2, 0] });
    kLow.box('#b9a47e', [0.26, 0.22, 0.3], [xc, FY + 0.06 + 0.11, st.z + 0.2], { c: 0.06, rot: [0, -0.15, 0] });
    kLow.box('#8b8f93', [0.32, 0.24, 0.36], [xc, FY + 0.52 + 0.12, st.z + 0.16], { c: 0.02 });
    kLow.box('#6f8fb0', [0.2, 0.16, 0.2], [xc, FY + 0.52 + 0.08, st.z - 0.2], { c: 0.03 });
    // jars on the two upper shelves: one per ingredient
    const ids = Object.keys(data.lab?.ingredients || {});
    const rows = [[0.98, Math.min(4, ids.length)], [1.44, Math.max(0, ids.length - 4)]];
    let n = 0;
    for (const [y, cnt] of rows) {
      for (let i = 0; i < cnt; i++) {
        const id = ids[n++];
        const z = st.z - 0.33 + (cnt > 1 ? (i * 0.66) / (cnt - 1) : 0.33);
        const p = [xc - 0.02, FY + y + 0.02, z];
        // glass + lid + label (static)
        kGlass.cyl('#cfe3e6', 0.075, 0.075, 0.24, [p[0], p[1] + 0.12, p[2]], { seg: 8, open: true });
        kLow.cyl('#7a7f83', 0.08, 0.08, 0.035, [p[0], p[1] + 0.255, p[2]], { seg: 8 });
        kLow.cyl('#2a2b2c', 0.06, 0.07, 0.01, [p[0], p[1] + 0.003, p[2]], { seg: 8 });
        kLow.box('#efe6cf', [0.004, 0.06, 0.1], [p[0] - 0.077, p[1] + 0.16, p[2]]);
        kLow.box(data.lab.ingredients[id].color, [0.006, 0.018, 0.1], [p[0] - 0.078, p[1] + 0.18, p[2]]);
        jarSlots.push({ id, pos: p, color: data.lab.ingredients[id].color });
      }
    }
  }
  // stash crate (−X rear corner)
  {
    const st = stationById.stash, cx = st.x, cz = st.z, w = 0.75, d = 0.55, h = 0.5;
    const wood = '#a07a50', dark = '#6e5238';
    for (const [sx, sz, lw, ld] of [[0, -d / 2, w, 0.04], [0, d / 2, w, 0.04], [-w / 2, 0, 0.04, d], [w / 2, 0, 0.04, d]]) {
      kLow.box(wood, [lw, h, ld], [cx + sx, FY + h / 2, cz + sz], { jit: 0.06 });
      for (const y of [0.1, 0.3]) kLow.box(dark, [lw + 0.006, 0.03, ld + 0.006], [cx + sx, FY + y, cz + sz]);
    }
    kLow.box(dark, [w - 0.04, 0.03, d - 0.04], [cx, FY + 0.03, cz]);
    // stencil mark on the crate front (abstract, no text)
    kLow.rectZ('#3a2f22', cz + d / 2 + 0.021, [cx - 0.12, cx + 0.12], [FY + 0.18, FY + 0.22], 1, { off: 0.002 });
    kLow.rectZ('#3a2f22', cz + d / 2 + 0.021, [cx - 0.02, cx + 0.02], [FY + 0.12, FY + 0.28], 1, { off: 0.002 });
  }
  // extinguisher bracket (+X wall, rear)
  const extHome = new THREE.Vector3(XI - 0.1, FY + 0.62, stationById.extinguisher.z);
  {
    const z = stationById.extinguisher.z;
    kLow.box(IPAL.steelDark, [0.02, 0.5, 0.06], [XI - 0.01, FY + 0.95, z]);
    for (const y of [0.78, 1.02]) kLow.box(IPAL.steelDark, [0.2, 0.03, 0.2], [XI - 0.1, FY + y, z], { c: 0.01 });
    kLow.box('#c2412f', [0.005, 0.12, 0.2], [XI - 0.003, FY + 1.35, z]);        // red wall sign (no text)
    kLow.box('#efe6cf', [0.006, 0.06, 0.1], [XI - 0.004, FY + 1.35, z]);
  }
  // curtain cord (−X wall by the door): pulley on the cap, cord + wooden toggle
  {
    const z = stationById.curtains.z;
    kLow.box('#3b3631', [0.1, 0.08, 0.1], [-XI + 0.02, CUT + 0.04, z]);
    kLow.cyl('#d6c08a', 0.008, 0.008, 0.8, [-XI + 0.06, CUT - 0.36, z], { seg: 4 });
    kLow.cyl('#d6c08a', 0.008, 0.008, 0.8, [-XI + 0.06, CUT - 0.36, z + 0.05], { seg: 4 });
    kLow.cyl(IPAL.woodLight, 0.025, 0.02, 0.1, [-XI + 0.06, CUT - 0.8, z + 0.025], { seg: 6 });
    kLow.box('#d6c08a', [0.01, 0.01, 0.04], [-XI + 0.06, CUT - 0.01, z + 0.025]);
  }
  // board station: cork board on the raised partition panel (textured mesh below)
  // ── decor: radio + lava lamp on the partition cap, strip light, calendar, tubing, grime ──
  {
    // radio on the partition cap (left)
    kLow.at([-0.85, CUT + 0.03, ZP], [0, 0.15, 0], (k) => {
      k.box('#6b4a32', [0.36, 0.2, 0.14], [0, 0.1, 0], { c: 0.02 });
      k.box('#d6c08a', [0.14, 0.12, 0.01], [-0.08, 0.1, -0.072]);
      for (let i = 0; i < 4; i++) k.box('#3a2f22', [0.12, 0.008, 0.012], [-0.08, 0.06 + i * 0.03, -0.074]);
      k.cyl('#2a2b2c', 0.025, 0.025, 0.02, [0.1, 0.1, -0.072], { axis: 'z', seg: 8 });
      k.cyl(IPAL.steelLight, 0.005, 0.005, 0.4, [0.14, 0.35, 0.03], { seg: 4, rot: [0, 0, -0.35] });
    });
    kGlow.box('#ffd27a', [0.05, 0.02, 0.01], [-0.73, CUT + 0.2, ZP - 0.075]);
    // lava lamp on the partition cap (right of the board)
    kLow.at([0.86, CUT + 0.03, ZP], (k) => {
      k.cyl('#2f3336', 0.06, 0.08, 0.1, [0, 0.05, 0], { seg: 8 });
      k.cyl('#2f3336', 0.035, 0.05, 0.05, [0, 0.4, 0], { seg: 8 });
    });
    kGlow.lathe('#ff7a4a', [[0.0, 0.1], [0.05, 0.12], [0.06, 0.25], [0.04, 0.38], [0.0, 0.38]], 8, [0.86, CUT + 0.03, ZP]);
    kGlow.ico('#ffd25a', 0.03, [0.86, CUT + 0.25, ZP], {});
    kGlow.ico('#ffd25a', 0.022, [0.865, CUT + 0.18, ZP], {});
    // strip light along the top of the far wall
    kHigh.box(IPAL.steelDark, [0.12, 0.05, 4.6], [XI - 0.08, TOP - 0.2, -1.2], { rot: [0, 0, 0.5] });
    kGlow.box('#fff2cc', [0.05, 0.035, 4.4], [XI - 0.12, TOP - 0.24, -1.2], { rot: [0, 0, 0.5] });
    // coiled tubing on the far wall near the vent (torus coil) + hose to the stove
    for (let i = 0; i < 3; i++) kHigh.torus('#c9cfc6', 0.13, 0.012, [XI - 0.03, CUT + 0.33, -2.05 + i * 0.012], { rot: [0, Math.PI / 2, 0], rs: 4, ts: 12 });
    kHigh.box(IPAL.steelDark, [0.04, 0.04, 0.05], [XI - 0.02, CUT + 0.45, -2.04]);
    kLow.cyl('#3a3a38', 0.012, 0.012, 0.75, [XI - 0.06, FY + 0.88, -1.12], { axis: 'z', seg: 5, rot: [0.18, 0, 0] });
    // grime: rust streaks inside the far wall under the windows, scuffs on the low walls
    kHigh.rectX(mix(IPAL.wall, PAL.rust, 0.3), XI - 0.004, [-3.1, -3.04], [CUT + 0.02, D.WIN0 - 0.06], -1, { off: 0.002 });
    kHigh.rectX(mix(IPAL.wall, PAL.rust, 0.25), XI - 0.004, [0.5, 0.55], [CUT + 0.02, D.WIN0 - 0.06], -1, { off: 0.002 });
    kLow.rectX(mix(IPAL.wallLow, '#5a4e45', 0.3), -XI + 0.004, [-3.6, -3.0], [FY + 0.05, FY + 0.3], 1, { off: 0.002 });
    // a spare propane tank + toolbox in the rear (−X behind the hull wall, out of the walkway)
    kLow.cyl('#d9d2bf', 0.13, 0.13, 0.42, [-1.0, FY + 0.21, -3.2], { seg: 8 });
    kLow.cyl('#d9d2bf', 0.08, 0.13, 0.06, [-1.0, FY + 0.45, -3.2], { seg: 8 });
    kLow.cyl(IPAL.steelDark, 0.03, 0.03, 0.08, [-1.0, FY + 0.51, -3.2], { seg: 6 });
    kLow.box('#b23a2c', [0.4, 0.18, 0.2], [-1.0, FY + 0.09, -2.98], { c: 0.02 });
    kLow.box('#2a2b2c', [0.3, 0.03, 0.04], [-1.0, FY + 0.2, -2.98]);
    // string lights sagging along the top of the far wall
    {
      const y0 = TOP - 0.1, x = XI - 0.05, z0 = -3.95, z1 = 1.95, n = 14;
      const sag = (u) => -0.09 * Math.sin(((u * 3) % 1) * Math.PI);
      const cols = ['#ffd27a', '#ffb45a', '#f7f0d0', '#ff9a6a', '#bfe8d8'];
      let prev = null;
      for (let i = 0; i <= 42; i++) {
        const u = i / 42, z = z0 + (z1 - z0) * u, y = y0 + sag(u);
        if (prev) {
          const dz = z - prev[1], dy = y - prev[0], len = Math.hypot(dz, dy);
          kHigh.box('#2b2622', [0.008, 0.008, len], [x, (y + prev[0]) / 2, (z + prev[1]) / 2], { rot: [-Math.atan2(dy, dz), 0, 0] });
        }
        prev = [y, z];
      }
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n, z = z0 + (z1 - z0) * u, y = y0 + sag(u) - 0.035;
        kGlow.ico(cols[i % cols.length], 0.024, [x, y, z], {});
      }
    }
    // sticky notes + a photo between the fan and the window
    kHigh.rectX('#f2d65a', XI - 0.004, [-1.0, -0.86], [CUT + 0.42, CUT + 0.56], -1, { off: 0.002 });
    kHigh.rectX('#e88aa0', XI - 0.004, [-0.82, -0.68], [CUT + 0.5, CUT + 0.64], -1, { off: 0.002 });
    kHigh.rectX('#9fd6c8', XI - 0.004, [-0.95, -0.81], [CUT + 0.24, CUT + 0.38], -1, { off: 0.002 });
    kHigh.rectX('#f4efe2', XI - 0.004, [-0.74, -0.56], [CUT + 0.16, CUT + 0.38], -1, { off: 0.002 });
    kHigh.rectX('#c97a4a', XI - 0.006, [-0.72, -0.58], [CUT + 0.2, CUT + 0.3], -1, { off: 0.003 });
    kHigh.rectX('#6f8fb0', XI - 0.006, [-0.72, -0.58], [CUT + 0.3, CUT + 0.35], -1, { off: 0.003 });
    // potted cactus + a coffee mug on the cut-wall cap (−X)
    // [R3-DOCFP] on little wall ledges (inside the wall line, so the first-person upper wall doesn't swallow them)
    for (const z of [1.72, -0.72]) kLow.box(IPAL.woodLight, [0.13, 0.03, 0.24], [-XI + 0.05, CUT + 0.015, z]);
    kLow.at([-XI + 0.06, CUT + 0.03, 1.72], (k) => {
      k.cyl('#b5562f', 0.055, 0.045, 0.09, [0, 0.045, 0], { seg: 8 });
      k.cyl('#5a4632', 0.05, 0.05, 0.01, [0, 0.088, 0], { seg: 8 });
      k.cyl(PAL.cactus, 0.022, 0.026, 0.16, [0, 0.17, 0], { seg: 6 });
      k.cyl(PAL.cactus, 0.014, 0.014, 0.06, [0.035, 0.18, 0], { seg: 5, rot: [0, 0, -0.9] });
      k.cyl(PAL.cactusLight, 0.012, 0.012, 0.05, [0.05, 0.215, 0], { seg: 5 });
    });
    kLow.at([-XI + 0.06, CUT + 0.03, -0.72], (k) => {
      k.cyl('#e9e2cf', 0.035, 0.032, 0.085, [0, 0.0425, 0], { seg: 8 });
      k.cyl('#3a2618', 0.03, 0.03, 0.005, [0, 0.083, 0], { seg: 8 });
      k.torus('#e9e2cf', 0.022, 0.007, [0, 0.045, 0.04], { rot: [0, Math.PI / 2, 0], rs: 4, ts: 8 });
      k.box(PAL.rvTeal, [0.072, 0.02, 0.072], [0, 0.05, 0]);
    });
    // air freshener swinging off the windshield header
    kHigh.cyl('#d9d2bf', 0.003, 0.003, 0.12, [0.05, 2.04, 2.74], { seg: 3 });
    kHigh.extrude(PAL.rvTeal, [[-0.04, -0.07], [0.04, -0.07], [0.0, 0.07]].map(([a, y]) => [a, y]), 0.01, { axis: 'z', pos: [0.05, 1.92, 2.74] });
    // floor mat in front of the stove
    kLow.rectY('#2e2b28', FY + 0.004, [0.05, 0.45], [-1.05, -0.25], { off: 0.003 });
  }

  // ── wheels (InstancedMesh: spin with speed) ──────────────────────────────
  const wheelGeo = (() => {
    const k = new Kit(9);
    const r = 0.46, hw = 0.15;
    k.lathe(PAL.tyre, [[r * 0.7, -hw], [r, -hw * 0.6], [r, hw * 0.6], [r * 0.7, hw]], 10, [0, 0, 0], { axis: 'x' });
    k.lathe(PAL.rim, [[r * 0.7, hw - 0.025], [0.0, hw - 0.05]], 10, [0, 0, 0], { axis: 'x' });
    k.lathe(shade(PAL.rim, 0.72), [[r * 0.24, hw - 0.03], [r * 0.2, hw], [0, hw]], 6, [0, 0, 0], { axis: 'x' });
    k.lathe('#1c1c1d', [[0, -hw + 0.03], [r * 0.7, -hw + 0.03]], 10, [0, 0, 0], { axis: 'x' });
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; k.box('#6b6d70', [0.02, 0.05, 0.05], [hw - 0.03, Math.sin(a) * 0.2, Math.cos(a) * 0.2]); }
    return k.geometry();
  })();
  const wheels = new THREE.InstancedMesh(wheelGeo, vcolMaterial(), 4);  // (wheels keep the world's shared material)
  wheels.name = 'wheels';
  wheels.castShadow = true; wheels.receiveShadow = true;
  const wheelDefs = [[1.15, -1.75, 1], [-1.15, -1.75, -1], [1.03, 3.12, 1], [-1.03, 3.12, -1]].map(([x, z, s]) => ({ x, y: 0.46, z, s, front: z > 0 }));
  wheels.frustumCulled = false;
  root.add(wheels);
  // wheel arch shadows on the body (dark decals)
  for (const s of [1, -1]) {
    kLow.flat('#1d1c1b', archPts(-1.75, 0.46, 0.56, 0.6), (z, y) => [s * (XO + 0.004), y, z], { facing: [s, 0, 0], off: 0.002 });
  }

  // ── curtains (named, animatable) ─────────────────────────────────────────
  const curtains = [];
  const curtainMesh = (w, h, color, seed) => {
    const k = new Kit(seed);
    const n = Math.max(3, Math.round(w / 0.07));
    for (let i = 0; i < n; i++) {
      const u0 = (i / n) * w, u1 = ((i + 1) / n) * w;
      const dz = i % 2 ? 0.025 : 0;
      k.quad(i % 2 ? color : shade(color, 0.86), [0, -h, u0], [0, -h, u1], [dz, 0, u1], [dz, 0, u0], { off: 0 });
      k.quad(i % 2 ? color : shade(color, 0.86), [0, -h, u1], [0, -h, u0], [dz, 0, u0], [dz, 0, u1], { off: 0 });
    }
    k.box(shade(color, 0.7), [0.03, 0.04, w], [0.01, -0.02, w / 2]);
    return k.geometry();
  };
  {
    D.WINDOWS.forEach(([z0, z1], wi) => {
      const half = (z1 - z0) / 2 + 0.06, h = D.WIN1 - D.WIN0 + 0.16;
      for (const end of [0, 1]) {
        const g = curtainMesh(half, h, wi % 2 ? IPAL.curtainA : IPAL.curtainB, 60 + wi * 2 + end);
        const m = new THREE.Mesh(g, interiorMaterial());
        m.name = `curtain_w${wi}_${end ? 'front' : 'rear'}`;
        // pivot at the window edge; geometry spans local +Z (u) → mirror for the front curtain
        m.position.set(XO - T - 0.07, D.WIN1 + 0.08, end ? z1 + 0.05 : z0 - 0.05);
        m.scale.set(1, 1, end ? -1 : 1);
        m.receiveShadow = true;
        root.add(m);
        curtains.push({ mesh: m, sign: end ? -1 : 1, open: 0.24, closed: 1 });
      }
    });
    // rear window café curtains (rod just under the cut), geometry spans local +Z → rotate to run along X
    const rw = 0.55, h = CUT - (FY + 0.52) + 0.02;
    for (const end of [0, 1]) {
      const g = curtainMesh(rw + 0.04, h, IPAL.curtainA, 70 + end);
      const m = new THREE.Mesh(g, interiorMaterial());
      m.name = `curtain_rear_${end ? 'left' : 'right'}`;
      m.position.set(end ? rw + 0.05 : -rw - 0.05, CUT - 0.05, ZRI + 0.08);
      m.rotation.set(0, end ? -Math.PI / 2 : Math.PI / 2, 0);
      m.scale.set(1, 1, 1);
      m.receiveShadow = true;
      root.add(m);
      curtains.push({ mesh: m, sign: 1, open: 0.22, closed: 1 });
    }
  }

  // ── [R3-DOCFP] first-person shell + hinged side door ─────────────────────
  // The overview keeps the cut-away; in first person (setViewMode('fp')) these add the missing upper walls
  // (−X with three windows, rear with a taller window, the hull section's top), the coach ceiling (battens,
  // skylight, light strip), the cab roof, the −X cab window and a bulkhead over the cab opening. Non-casting
  // (the lab stays as bright as the dollhouse), receives shadows. 3 meshes + 6 curtains + the door (2–3).
  const fpGroup = new THREE.Group();
  fpGroup.name = 'fp_shell';
  fpGroup.visible = false;
  root.add(fpGroup);
  const DOOR_TOP = FY + 1.95;
  const FPWIN = [[-3.85, -3.1], [-1.75, -0.85], [0.95, 1.9]];   // −X windows (z ranges), same y band as +X
  D.FPWIN = FPWIN; D.DOOR_TOP = DOOR_TOP;
  {
    const kF = new Kit(41), kFG = new Kit(42), kFL = new Kit(43);
    const s = -1, dx = -(XO - T / 2);
    const [d0, d1] = D.DOOR, [h0, h1] = D.HULL;
    const wall = (z0, z1, y0, y1) => wallX(kF, s, z0, z1, y0, y1);
    wall(ZRO, FPWIN[0][0], CUT, TOP);
    wall(FPWIN[0][1], h0, CUT, TOP);
    wall(h0, h1, FY + 2.0, TOP);
    wall(h1, FPWIN[1][0], CUT, TOP);
    wall(FPWIN[1][1], d0, CUT, TOP);
    wall(d0, d1, DOOR_TOP, TOP);
    wall(d1, FPWIN[2][0], CUT, TOP);
    wall(FPWIN[2][1], ZP + T / 2, CUT, TOP);
    for (const [z0, z1] of FPWIN) {
      wall(z0, z1, CUT, D.WIN0);
      wall(z0, z1, D.WIN1, TOP);
      const x = -XO + T + 0.004;
      kF.rectX(IPAL.frame, x, [z0 - 0.05, z1 + 0.05], [D.WIN0 - 0.05, D.WIN0], 1, { off: 0.003 });
      kF.rectX(IPAL.frame, x, [z0 - 0.05, z1 + 0.05], [D.WIN1, D.WIN1 + 0.05], 1, { off: 0.003 });
      kF.rectX(IPAL.frame, x, [z0 - 0.05, z0], [D.WIN0, D.WIN1], 1, { off: 0.003 });
      kF.rectX(IPAL.frame, x, [z1, z1 + 0.05], [D.WIN0, D.WIN1], 1, { off: 0.003 });
      kF.box(IPAL.trim, [0.06, 0.03, z1 - z0 + 0.1], [-XO + T + 0.03, D.WIN0 - 0.015, (z0 + z1) / 2]);
      kF.cyl(IPAL.steelDark, 0.012, 0.012, z1 - z0 + 0.3, [-XO + T + 0.07, D.WIN1 + 0.08, (z0 + z1) / 2], { axis: 'z', seg: 6 });
      kFG.rectX(IPAL.glass, -XO + T / 2, [z0, z1], [D.WIN0, D.WIN1], 1, { off: 0 });
    }
    // trim strips over the dark cut caps (they become a chair rail), door jambs + header
    const trimX = (z0, z1, y) => kF.box(IPAL.trim, [T + 0.05, 0.034, z1 - z0], [dx, y + 0.016, (z0 + z1) / 2]);
    trimX(ZRO, h0, CUT); trimX(h1, d0 - 0.06, CUT); trimX(d1 + 0.06, ZP + T / 2, CUT); trimX(h0, h1, FY + 2.0);
    for (const z of [d0 - 0.035, d1 + 0.035]) kF.box('#6b5d4e', [T + 0.02, DOOR_TOP - CUT + 0.03, 0.05], [dx, (CUT + DOOR_TOP) / 2, z]);
    kF.box('#6b5d4e', [T + 0.02, 0.05, d1 - d0 + 0.12], [dx, DOOR_TOP + 0.02, (d0 + d1) / 2]);
    // rear: upper wall around a taller window (the low pane continues up), mullion over the cut
    {
      const tz = ZRI - ZRO, zc = (ZRO + ZRI) / 2, rw0 = -0.55, rw1 = 0.55, wTop = FY + 1.5;
      const rearBox = (x0, x1, y0, y1) => {
        const lv = levelsOf(y0, y1);
        for (let i = 0; i < lv.length - 1; i++) {
          const ya = lv[i], yb = lv[i + 1];
          kF.box((cx, cy, cz, nx, ny, nz) => (nz < -0.5 ? extBand(cy) : nz > 0.5 ? inner(cy) : ny > 0.5 || ny < -0.5 ? IPAL.trim : IPAL.frame), [x1 - x0, yb - ya, tz], [(x0 + x1) / 2, (ya + yb) / 2, zc], { jit: 0.03 });
        }
      };
      rearBox(-XO, rw0, CUT, TOP); rearBox(rw1, XO, CUT, TOP); rearBox(rw0, rw1, wTop, TOP);
      kF.box(IPAL.trim, [XO + rw0 + 0.02, 0.034, tz + 0.05], [(-XO + rw0) / 2, CUT + 0.016, zc]);
      kF.box(IPAL.trim, [XO - rw1 + 0.02, 0.034, tz + 0.05], [(XO + rw1) / 2, CUT + 0.016, zc]);
      kF.box(IPAL.frame, [rw1 - rw0 + 0.1, 0.05, tz + 0.04], [0, CUT + 0.02, zc]);
      const zi = ZRI + 0.004;
      kF.rectZ(IPAL.frame, zi, [rw0 - 0.05, rw0], [CUT, wTop], 1, { off: 0.003 });
      kF.rectZ(IPAL.frame, zi, [rw1, rw1 + 0.05], [CUT, wTop], 1, { off: 0.003 });
      kF.rectZ(IPAL.frame, zi, [rw0 - 0.05, rw1 + 0.05], [wTop, wTop + 0.05], 1, { off: 0.003 });
      kFG.rectZ(IPAL.glass, zc, [rw0, rw1], [CUT + 0.045, wTop], 1, { off: 0 });
    }
    // cab partition: wood rail over the cut, bulkhead above the cab opening (the over-cab bunk's face)
    {
      const yB = 2.2;
      kF.box(IPAL.woodDark, [2 * XI, 0.034, T + 0.05], [0, CUT + 0.016, ZP]);
      kF.box((cx, cy, cz, nx, ny, nz) => (nz < -0.5 ? IPAL.wall : nz > 0.5 ? '#3d3a36' : IPAL.trim), [2 * XI, TOP - yB, T], [0, (yB + TOP) / 2, ZP], { jit: 0.03 });
      kF.box(IPAL.woodDark, [2 * XI, 0.05, T + 0.04], [0, yB, ZP]);
      for (const x of [-XI + 0.03, XI - 0.03]) kF.box(IPAL.woodDark, [0.06, yB - CUT, 0.08], [x, (yB + CUT) / 2, ZP]);
    }
    // cab: roof (headliner) + the −X door window over the cut cab side
    {
      const z0 = ZP + T / 2, zw = 3.32, xs = -(CABX - 0.035);
      kF.box((cx, cy, cz, nx, ny) => (ny < -0.5 ? '#c9bfa8' : PAL.rvBody), [2 * CABX, 0.06, 2.76 - ZP], [0, 2.17, (ZP + 2.76) / 2]);
      kF.box(PAL.rvBody, [0.07, 0.06, zw - z0], [xs, CUT + 0.03, (z0 + zw) / 2]);
      kF.box(PAL.rvBody, [0.07, 0.08, zw - z0 - 0.4], [xs, 2.1, (z0 + zw - 0.4) / 2]);
      kF.box(PAL.rvBody, [0.07, 2.14 - CUT, 0.08], [xs, (CUT + 2.14) / 2, z0 + 0.04]);
      kFG.flat(IPAL.glass, [[z0 + 0.08, CUT + 0.06], [2.95, CUT + 0.06], [2.78, 2.06], [z0 + 0.08, 2.06]], (z, y) => [xs, y, z], { facing: [-1, 0, 0], off: 0 });
    }
    // coach ceiling: headliner, battens, a frosted skylight and a light strip
    {
      const zc = (ZP + 0.04 + ZRO) / 2, L = ZP + 0.04 - ZRO;
      kF.box((cx, cy, cz, nx, ny) => (ny < -0.5 ? '#ddd2b6' : PAL.rvBody), [2 * XO, 0.05, L], [0, TOP + 0.025, zc]);
      for (let z = ZRI + 0.35; z < ZP - 0.2; z += 0.62) kF.box('#bcae8f', [2 * XI, 0.022, 0.05], [0, TOP - 0.011, z]);
      // skylight over the door / measuring bench
      const sz = 0.45, sx = -0.05;
      for (const [w, l, x, z] of [[0.66, 0.06, sx, sz - 0.33], [0.66, 0.06, sx, sz + 0.33], [0.06, 0.72, sx - 0.33, sz], [0.06, 0.72, sx + 0.33, sz]]) kF.box('#8f8676', [w, 0.06, l], [x, TOP - 0.03, z]);
      kFL.rectY('#dfe9e8', TOP - 0.004, [sx - 0.3, sx + 0.3], [sz - 0.3, sz + 0.3], { off: 0, facing: [0, -1, 0] });
      kFL.rectY('#c9dadb', TOP - 0.006, [sx - 0.3, sx + 0.3], [sz - 0.02, sz + 0.02], { off: 0, facing: [0, -1, 0] });
      // light strip (housing + glow) down the middle of the lab
      kF.box(IPAL.steelDark, [0.16, 0.035, 1.3], [0.1, TOP - 0.018, -1.6]);
      kFL.box('#fff2cc', [0.1, 0.012, 1.2], [0.1, TOP - 0.04, -1.6]);
      kF.box(IPAL.steelDark, [0.16, 0.035, 0.7], [0.1, TOP - 0.018, 1.25]);
      kFL.box('#fff2cc', [0.1, 0.012, 0.6], [0.1, TOP - 0.04, 1.25]);
    }
    const shell = kF.mesh('fp_shell_walls', interiorMaterial(), false);
    shell.receiveShadow = true;
    const glassM = new THREE.Mesh(kFG.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
    glassM.name = 'fp_shell_glass'; glassM.renderOrder = 2;
    const glowM = new THREE.Mesh(kFL.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide }));
    glowM.name = 'fp_shell_glow';
    fpGroup.add(shell, glassM, glowM);
    // curtains on the new −X windows (animated with the others by hazards3d)
    FPWIN.forEach(([z0, z1], wi) => {
      const half = (z1 - z0) / 2 + 0.06, h = D.WIN1 - D.WIN0 + 0.16;
      for (const end of [0, 1]) {
        const m = new THREE.Mesh(curtainMesh(half, h, wi % 2 ? IPAL.curtainB : IPAL.curtainA, 80 + wi * 2 + end), interiorMaterial());
        m.name = `curtain_fp${wi}_${end ? 'front' : 'rear'}`;
        m.position.set(-(XO - T - 0.07), D.WIN1 + 0.08, end ? z1 + 0.05 : z0 - 0.05);
        m.scale.set(1, 1, end ? -1 : 1);
        m.receiveShadow = true;
        fpGroup.add(m);
        curtains.push({ mesh: m, sign: end ? -1 : 1, open: 0.24, closed: 1, fp: true });
      }
    });
  }
  // hinged side door (pivot on the rear jamb): low (cut, overview) and full-height (first person, with a window)
  const doorPivot = new THREE.Group();
  doorPivot.name = 'door_pivot';
  const doorDims = { d0: D.DOOR[0], d1: D.DOOR[1], x: -(XO - T / 2), top: DOOR_TOP };
  doorPivot.position.set(doorDims.x, 0, doorDims.d0);
  root.add(doorPivot);
  const doorKit = (full) => {
    const k = new Kit(full ? 45 : 44);
    const Lz = doorDims.d1 - doorDims.d0, x0 = doorDims.x, yTop = full ? DOOR_TOP : CUT;
    const panelCol = (cx, cy, cz, nx) => (nx < -0.5 ? IPAL.door : nx > 0.5 ? shade(IPAL.door, 0.85) : shade(IPAL.door, 0.7));
    const xo = -XO - x0, xi = -XI - x0;                       // outer / inner faces in door-local x
    if (full) {
      const w0 = 2.0, w1 = 2.45, zA = 0.16, zB = Lz - 0.16;     // window in the upper door
      k.box(panelCol, [T - 0.02, w0 - 0.64, Lz], [0, (w0 + 0.64) / 2, Lz / 2]);
      k.box(panelCol, [T - 0.02, yTop - w1, Lz], [0, (w1 + yTop) / 2, Lz / 2]);
      k.box(panelCol, [T - 0.02, w1 - w0, zA], [0, (w0 + w1) / 2, zA / 2]);
      k.box(panelCol, [T - 0.02, w1 - w0, Lz - zB], [0, (w0 + w1) / 2, (zB + Lz) / 2]);
      for (const xx of [xo - 0.004, xi + 0.004]) {
        const f = xx < 0 ? -1 : 1;
        k.rectX(IPAL.frame, xx, [zA - 0.03, zB + 0.03], [w0 - 0.03, w0], f, { off: 0.003 });
        k.rectX(IPAL.frame, xx, [zA - 0.03, zB + 0.03], [w1, w1 + 0.03], f, { off: 0.003 });
        k.rectX(IPAL.frame, xx, [zA - 0.03, zA], [w0, w1], f, { off: 0.003 });
        k.rectX(IPAL.frame, xx, [zB, zB + 0.03], [w0, w1], f, { off: 0.003 });
      }
      k.rectX(shade(IPAL.door, 0.78), xi + 0.012, [0.08, Lz - 0.08], [FY + 0.12, 1.88], 1, { off: 0.003 });
    } else {
      k.box(panelCol, [T - 0.02, yTop - 0.64, Lz], [0, (yTop + 0.64) / 2, Lz / 2]);
      k.box(IPAL.cut, [T + 0.03, 0.03, Lz], [0, yTop + 0.015, Lz / 2]);
      k.box(IPAL.cutEdge, [0.012, 0.031, Lz], [xi + 0.006, yTop + 0.0155, Lz / 2]);
      k.rectX(shade(IPAL.door, 0.78), xi + 0.012, [0.08, Lz - 0.08], [FY + 0.12, CUT - 0.1], 1, { off: 0.003 });
    }
    k.rectX(shade(IPAL.door, 0.82), xo - 0.004, [0.1, Lz - 0.1], [0.82, 1.5], -1, { off: 0.003 });
    k.rectX(shade(IPAL.door, 1.1), xo - 0.006, [0.14, Lz - 0.14], [0.86, 1.46], -1, { off: 0.003 });
    k.rectX(PAL.rustDark, xo - 0.008, [0.3, 0.5], [0.7, 0.82], -1, { off: 0.003 });
    for (const xx of [xo - 0.03, xi + 0.03]) k.box(PAL.chrome, [0.05, 0.05, 0.14], [xx, FY + 0.82, Lz - 0.12]);
    const m = k.mesh(full ? 'door_full' : 'door_low', interiorMaterial(), true);
    m.visible = !full;
    return m;
  };
  const doorLow = doorKit(false), doorFull = doorKit(true);
  doorPivot.add(doorLow, doorFull);
  const doorGlass = (() => {
    const Lz = doorDims.d1 - doorDims.d0;
    const g = new THREE.PlaneGeometry(Lz - 0.32, 0.45).rotateY(Math.PI / 2).translate(0, 2.225, Lz / 2);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: IPAL.glass, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
    m.name = 'door_glass'; m.renderOrder = 2; m.visible = false;
    return m;
  })();
  doorPivot.add(doorGlass);
  // shop-run marker: a glowing amber outline on the inside of the door (shown while a run is due)
  const doorGlow = (() => {
    const k = new Kit(46);
    const x = -XI + 0.03, z0 = doorDims.d0 + 0.02, z1 = doorDims.d1 - 0.02, y0 = FY + 0.02, y1 = DOOR_TOP - 0.03, w = 0.05;
    k.box('#F2B90F', [0.01, y1 - y0, w], [x, (y0 + y1) / 2, z0 + w / 2]);
    k.box('#F2B90F', [0.01, y1 - y0, w], [x, (y0 + y1) / 2, z1 - w / 2]);
    k.box('#F2B90F', [0.01, w, z1 - z0], [x, y1 - w / 2, (z0 + z1) / 2]);
    k.box('#F2B90F', [0.01, w, z1 - z0], [x, y0 + w / 2, (z0 + z1) / 2]);
    // floor chevrons leading to the door
    for (let i = 0; i < 3; i++) {
      const xc = -0.15 - i * 0.22;
      k.flat('#F2B90F', [[xc, -0.09], [xc - 0.1, 0], [xc, 0.09], [xc - 0.04, 0.09], [xc - 0.14, 0], [xc - 0.04, -0.09]].map(([a, b]) => [a, b]), (a, b) => [a, FY + 0.012, (doorDims.d0 + doorDims.d1) / 2 + b], { facing: [0, 1, 0], off: 0 });
    }
    const m = new THREE.Mesh(k.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
    m.name = 'door_glow'; m.renderOrder = 4; m.visible = false;
    return m;
  })();
  root.add(doorGlow);
  const doorStand = { x: -0.72, z: (doorDims.d0 + doorDims.d1) / 2 };

  // ── vent fan (named fan_blades) + exterior louvers ──────────────────────
  const ventZ = stationById.vent.z, ventY = FY + 1.55;
  {
    // housing ring + grille on the inner face (tall part of the wall → no shadow kit)
    kHigh.torus('#5f666b', 0.27, 0.035, [XI - 0.03, ventY, ventZ], { rot: [0, Math.PI / 2, 0], rs: 4, ts: 16 });
    kHigh.cyl('#2a2b2c', 0.25, 0.25, 0.06, [XI - 0.02, ventY, ventZ], { axis: 'x', seg: 14 });
    kHigh.box('#5f666b', [0.06, 0.6, 0.6], [XO + 0.03, ventY, ventZ], { c: 0.02 });
    kHigh.box(IPAL.steelDark, [0.04, 0.04, 0.04], [XI - 0.09, ventY, ventZ]);
    // switch box with a toggle on the wall below the fan
    kLow.box('#3a3d40', [0.04, 0.12, 0.08], [XI - 0.02, CUT - 0.1, ventZ + 0.32]);
  }
  const fanBlades = (() => {
    const k = new Kit(12);
    k.cyl('#3a3d40', 0.05, 0.05, 0.05, [0, 0, 0], { axis: 'x', seg: 8 });
    for (let i = 0; i < 5; i++) k.at([0, 0, 0], [i * (Math.PI * 2 / 5), 0, 0], (kk) => kk.box('#b9bfc2', [0.012, 0.2, 0.08], [0, 0.12, 0], { rot: [0, 0.35, 0] }));
    const m = new THREE.Mesh(k.geometry(), interiorMaterial());
    m.name = 'fan_blades';
    m.position.set(XI - 0.08, ventY, ventZ);
    return m;
  })();
  root.add(fanBlades);
  const louvers = new THREE.Group();
  louvers.name = 'louvers';
  {
    const g = (() => { const k = new Kit(13); k.box('#8b9196', [0.012, 0.11, 0.5], [0, 0, 0]); return k.geometry(); })();
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(g, interiorMaterial());
      m.name = `louver_${i}`;
      m.position.set(XO + 0.07, ventY - 0.2 + i * 0.13, ventZ);
      louvers.add(m);
    }
  }
  root.add(louvers);

  // ── pantry jar contents (InstancedMesh, per-instance colour, fill = scale.y) ──
  const jarGeo = new THREE.CylinderGeometry(0.064, 0.064, 1, 8).translate(0, 0.5, 0);
  const jars = new THREE.InstancedMesh(jarGeo, new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), Math.max(1, jarSlots.length));
  jars.name = 'pantry_jars';
  jarSlots.forEach((j, i) => jars.setColorAt(i, new THREE.Color(j.color)));
  jars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  jars.frustumCulled = false;
  root.add(jars);

  // ── stash bags (InstancedMesh) ───────────────────────────────────────────
  const bagGeo = (() => {
    const k = new Kit(14);
    k.box(IPAL.product, [0.15, 0.12, 0.2], [0, 0.06, 0], { c: 0.03 });
    k.box(shade(IPAL.product, 0.82), [0.06, 0.05, 0.04], [0, 0.13, 0.08]);
    k.box('#efe6cf', [0.07, 0.02, 0.05], [0, 0.155, 0.08]);
    return k.geometry();
  })();
  const MAX_BAGS = 12;
  const bags = new THREE.InstancedMesh(bagGeo, interiorMaterial(), MAX_BAGS);
  bags.name = 'stash_bags';
  bags.castShadow = true;
  bags.frustumCulled = false;
  bags.count = 0;
  const bagSlots = [];
  {
    const st = stationById.stash;
    for (let i = 0; i < MAX_BAGS; i++) {
      const layer = Math.floor(i / 4), j = i % 4;
      const x = st.x - 0.16 + (j % 2) * 0.32 + (layer % 2 ? 0.04 : 0), z = st.z - 0.12 + Math.floor(j / 2) * 0.24;
      bagSlots.push({ x, y: FY + 0.05 + layer * 0.13, z, rot: ((i * 37) % 11) / 11 - 0.5 });
    }
  }
  root.add(bags);

  // ── hull damage (−X hull section): panel + holes with light leaking in ──
  const hull = new THREE.Group();
  hull.name = 'hull_damage';
  const hullHoles = [];
  {
    const [h0, h1] = D.HULL, zc = (h0 + h1) / 2;
    const pk = new Kit(15);
    pk.flat(mix(IPAL.wall, PAL.rust, 0.35), [[h0 + 0.08, FY + 0.97], [h1 - 0.1, FY + 0.95], [h1 - 0.06, FY + 1.83], [h0 + 0.1, FY + 1.86]], (z, y) => [-XI + 0.006, y, z], { facing: [1, 0, 0], off: 0 });
    pk.flat(mix(IPAL.wall, '#4a3f36', 0.35), [[zc - 0.2, FY + 1.1], [zc + 0.12, FY + 1.05], [zc + 0.25, FY + 1.3], [zc - 0.05, FY + 1.42]], (z, y) => [-XI + 0.008, y, z], { facing: [1, 0, 0], off: 0 });
    const panel = new THREE.Mesh(pk.geometry(), interiorMaterial());
    panel.name = 'hull_panel';
    hull.add(panel);
    const holeDefs = [[-2.12, FY + 1.6, 0.07], [-2.55, FY + 1.25, 0.09], [-2.3, FY + 1.05, 0.06], [-2.02, FY + 1.32, 0.08], [-2.6, FY + 1.7, 0.06]];
    const beamMat = new THREE.MeshBasicMaterial({ color: '#fff1c8', transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    holeDefs.forEach(([z, y, r], i) => {
      const hk = new Kit(20 + i);
      const pts = [];
      const rr = rng(90 + i);
      for (let j = 0; j < 9; j++) { const a = (j / 9) * Math.PI * 2; const f = 0.6 + rr() * 0.7; pts.push([z + Math.cos(a) * r * f, y + Math.sin(a) * r * f]); }
      hk.flat('#151312', pts, (zz, yy) => [-XI + 0.012, yy, zz], { facing: [1, 0, 0], off: 0 });
      hk.flat('#1a1715', pts.map(([zz, yy]) => [zz + (zz - z) * 0.3, yy + (yy - y) * 0.3]), (zz, yy) => [-XO - 0.016, yy, zz], { facing: [-1, 0, 0], off: 0 });
      hk.flat(mix(PAL.rvBody, PAL.rust, 0.6), pts.map(([zz, yy]) => [z + (zz - z) * 1.7, y + (yy - y) * 1.7]), (zz, yy) => [-XO - 0.014, yy, zz], { facing: [-1, 0, 0], off: 0 });
      // bent-in metal petals around the hole
      for (let j = 0; j < 4; j++) { const a = (j / 4) * Math.PI * 2 + 0.4; hk.box('#8a8578', [0.04, 0.012, 0.05], [-XI + 0.03, y + Math.sin(a) * r, z + Math.cos(a) * r], { rot: [a, 0, 0.6] }); }
      const hole = new THREE.Mesh(hk.geometry(), interiorMaterial());
      hole.name = `hull_hole_${i}`;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r * 2.6, 1.4, 8, 1, true).rotateZ(Math.PI / 2).translate(0.7, 0, 0), beamMat);
      beam.position.set(-XI, y, z);
      beam.rotation.set(0, 0, -0.35);
      beam.name = `hull_light_${i}`;
      beam.renderOrder = 3;
      hull.add(hole);
      hull.add(beam);
      hullHoles.push({ hole, beam, at: [90, 75, 60, 45, 30][i] });
    });
  }
  root.add(hull);

  // ── extinguisher (carriable) ─────────────────────────────────────────────
  const extinguisher = (() => {
    const k = new Kit(16);
    k.cyl('#c2412f', 0.075, 0.075, 0.42, [0, 0.21, 0], { seg: 10 });
    k.lathe('#c2412f', [[0.075, 0.42], [0.05, 0.47], [0.02, 0.49]], 10, [0, 0, 0]);
    k.cyl('#efe6cf', 0.076, 0.076, 0.1, [0, 0.26, 0], { seg: 10 });
    k.box('#2a2b2c', [0.03, 0.05, 0.16], [0, 0.52, 0.03]);
    k.box('#2a2b2c', [0.02, 0.02, 0.14], [0, 0.55, -0.02], { rot: [0.3, 0, 0] });
    k.cyl('#1f2022', 0.012, 0.012, 0.3, [0.06, 0.38, 0.05], { seg: 5, rot: [0.2, 0, -0.3] });
    k.cyl('#1f2022', 0.02, 0.012, 0.08, [0.1, 0.24, 0.07], { seg: 6 });
    const g = new THREE.Group();
    g.name = 'extinguisher';
    const m = new THREE.Mesh(k.geometry(), interiorMaterial());
    m.name = 'extinguisher_body';
    m.castShadow = true;
    g.add(m);
    const nozzle = new THREE.Object3D(); nozzle.name = 'extinguisher_nozzle'; nozzle.position.set(0.1, 0.2, 0.08); g.add(nozzle);
    return g;
  })();
  extinguisher.position.copy(extHome);
  root.add(extinguisher);

  // ── steering wheel + Rook ────────────────────────────────────────────────
  const sw = van.cab?.steeringWheel || { x: 0.55, z: 2.93, y: 1.56 };
  const wheelPivot = new THREE.Group();
  wheelPivot.name = 'steering_column';
  wheelPivot.position.set(sw.x, sw.y, sw.z);
  wheelPivot.rotation.set(0.88, 0, 0);        // wheel plane ⟂ the column (tilted ~50°)
  const steeringWheel = (() => {
    const k = new Kit(17);
    k.torus('#2a2b2d', 0.18, 0.022, [0, 0, 0], { rs: 5, ts: 16 });
    for (let i = 0; i < 3; i++) k.box('#3a3b3d', [0.02, 0.17, 0.02], [0, 0, 0], { rot: [0, 0, i * (Math.PI * 2 / 3)] });
    k.cyl('#3a3b3d', 0.04, 0.04, 0.04, [0, 0, 0], { axis: 'z', seg: 8 });
    const m = new THREE.Mesh(k.geometry(), interiorMaterial());
    m.name = 'steering_wheel';
    return m;
  })();
  wheelPivot.add(steeringWheel);
  root.add(wheelPivot);
  let rook = null;
  if (createModel) {
    rook = createModel('driver');
    rook.name = 'rook_seated';
    const seatX = van.cab?.driverSeat?.x ?? 0.55, seatZ = van.cab?.driverSeat?.z ?? 2.5;
    rook.position.set(seatX, FY + 0.5 - 0.88, seatZ + 0.04);
    poseSeated(rook);
    rook.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    root.add(rook);
  }

  // ── textured: recipe board + calendar ────────────────────────────────────
  const board = makeBoard();
  {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.72), new THREE.MeshLambertMaterial({ map: board.texture }));
    m.name = 'recipe_board';
    m.position.set(0, FY + 1.48, ZP - 0.056);
    m.rotation.set(0, Math.PI, 0);
    m.receiveShadow = true;
    root.add(m);
    kHigh.box(IPAL.woodDark, [1.08, 0.8, 0.02], [0, FY + 1.48, ZP - 0.04]);
    board.mesh = m;
  }
  const calendar = (() => {
    const tex = makeCalendarTexture();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.46), new THREE.MeshLambertMaterial({ map: tex }));
    m.name = 'calendar';
    m.position.set(XI - 0.006, CUT + 0.35, -2.2);
    m.rotation.set(0, -Math.PI / 2, 0);
    m.receiveShadow = true;
    return m;
  })();
  root.add(calendar);

  // ── highlight ring + bouncing arrow (next station) ───────────────────────
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.34, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: IPAL.mustard, transparent: true, opacity: 0.85, depthWrite: false }));
  ring.name = 'next_ring';
  ring.renderOrder = 4;
  ring.visible = false;
  root.add(ring);
  const arrow = (() => {
    const k = new Kit(18);
    k.cone(IPAL.mustard, 0.11, 0.18, [0, 0.09, 0], { seg: 4, rot: [Math.PI, 0, 0] });
    k.box(IPAL.mustard, [0.07, 0.14, 0.07], [0, 0.25, 0]);
    const m = new THREE.Mesh(k.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true }));
    m.name = 'next_arrow';
    m.visible = false;
    return m;
  })();
  root.add(arrow);

  // ── lights (only reach the van: short range) ─────────────────────────────
  const warm = new THREE.PointLight('#ffc884', 2.6, 6.5, 1.4);
  warm.name = 'light_warm';
  warm.position.set(0.3, TOP - 0.45, -1.0);
  root.add(warm);
  const fxLight = new THREE.PointLight('#ff7a2a', 0, 7, 1.5);
  fxLight.name = 'light_fx';
  fxLight.position.set(0.6, D.TOPC + 0.5, stationById.stove.z);
  root.add(fxLight);

  // ── floor / station pick volumes (invisible, raycast only) ──────────────
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  const floorPick = new THREE.Mesh(new THREE.PlaneGeometry(2 * XI, ZP - ZRI).rotateX(-Math.PI / 2), pickMat);
  floorPick.position.set(0, FY + 0.01, (ZP + ZRI) / 2);
  floorPick.name = 'pick_floor';
  root.add(floorPick);
  const stationPicks = [];
  for (const st of van.stations) {
    const a = anchors[st.id];
    let size = [0.9, 1.4, 0.63], c = [0, -0.25, -0.315];   // [R3-DOCFP] up to 0.45 m over the top: first-person look picks the props too
    if (st.kind === 'wall') { size = [st.id === 'curtains' ? 0.32 : 0.8, 1.4, 0.3]; c = [0, 0.2, -0.45]; }   // [R3-DOCFP] the cord is thin: don't steal the side door
    if (st.kind === 'board') { size = [1.1, 1.0, 0.3]; c = [0, 0.55, -0.5]; }
    if (st.kind === 'shelf') { size = [0.9, 1.9, 0.45]; c = [0, 0.0, -0.22]; }
    if (st.kind === 'crate') { size = [0.8, 0.6, 0.6]; c = [0, -0.65, -0.3]; }
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), pickMat);
    m.position.set(...c);
    m.name = `pick_${st.id}`;
    m.userData.station = st.id;
    a.add(m);
    stationPicks.push(m);
  }
  // [R3-DOCFP] the side door (shop run): its own pick volume, not a van.json station
  const doorPick = new THREE.Mesh(new THREE.BoxGeometry(0.5, DOOR_TOP - FY, doorDims.d1 - doorDims.d0), pickMat);
  doorPick.position.set(-XI + 0.2, (FY + DOOR_TOP) / 2, (doorDims.d0 + doorDims.d1) / 2);
  doorPick.name = 'pick_door';
  doorPick.userData.station = 'door';
  root.add(doorPick);

  // ── bake the kits ────────────────────────────────────────────────────────
  const low = kLow.mesh('interior_shell_low', interiorMaterial(), true);
  const high = kHigh.mesh('interior_shell_high', interiorMaterial(), false);
  high.receiveShadow = true;
  const glow = new THREE.Mesh(kGlow.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  glow.name = 'interior_glow';
  const glass = new THREE.Mesh(kGlass.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
  glass.name = 'interior_glass';
  glass.renderOrder = 2;
  root.add(low, high, glow, glass);

  root.traverse((o) => { if (o.isMesh && o.receiveShadow === false && o !== glow && o !== glass && o.material !== pickMat && o.material?.isMeshLambertMaterial) o.receiveShadow = true; });

  // everything built here owns its geometry/material (Rook is a createModel clone: shared → skipped)
  const owned = { geos: new Set(), mats: new Set(), texs: [board.texture, calendar.material.map] };
  root.traverse((o) => {
    for (let p = o; p; p = p.parent) if (p === rook) return;
    if (o.geometry) owned.geos.add(o.geometry);
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) if (m !== vcolMaterial() && m !== interiorMaterial()) owned.mats.add(m);
  });
  const dispose = () => {
    root.removeFromParent();
    for (const g of owned.geos) g.dispose();
    for (const m of owned.mats) m.dispose();
    for (const t of owned.texs) t && t.dispose();
  };

  // [R3-DOCFP] 'fp' shows the full-height shell, the tall door and the −X curtains; 'overview' is the cut-away
  let viewMode = 'overview';
  const setViewMode = (mode) => {
    viewMode = mode === 'fp' ? 'fp' : 'overview';
    const fp = viewMode === 'fp';
    fpGroup.visible = fp;
    doorLow.visible = !fp; doorFull.visible = fp; doorGlass.visible = fp;
    doorGlow.scale.y = 1;
  };
  return {
    root, dims: D, anchors, stations: van.stations, stationById, dispose, setViewMode, get viewMode() { return viewMode; },
    parts: {
      low, high, glow, glass, wheels, wheelDefs, curtains, fanBlades, louvers, jars, jarSlots, bags, bagSlots, MAX_BAGS,
      hull, hullHoles, extinguisher, extHome, steeringWheel, wheelPivot, rook, board, calendar, ring, arrow, warm, fxLight,
      floorPick, stationPicks, ventPos: new THREE.Vector3(XO + 0.12, ventY, ventZ),
      fpGroup, doorPivot, doorLow, doorFull, doorGlass, doorGlow, doorPick, doorStand, doorDims,
    },
  };
}

// wheel-arch outline [z, y] (half disc + down to the body bottom)
function archPts(zc, yc, r, yb) {
  const pts = [[zc + r, yb], [zc + r, yc]];
  for (let i = 1; i < 8; i++) { const a = (i / 8) * Math.PI; pts.push([zc + Math.cos(a) * r, yc + Math.sin(a) * r * 0.95]); }
  pts.push([zc - r, yc], [zc - r, yb]);
  return pts.filter((p) => p[1] >= yb - 1e-6).map(([z, y]) => [z, Math.max(y, yb)]);
}

/** Pose Rook seated: thighs forward, arms reaching to the wheel. */
export function poseSeated(m, steer = 0) {
  const get = (n) => m.getObjectByName(n);
  const ll = get('leg_l'), lr = get('leg_r'), al = get('arm_l'), ar = get('arm_r'), hd = get('head');
  if (ll) ll.rotation.x = -1.25;
  if (lr) lr.rotation.x = -1.2;
  if (al) { al.rotation.x = -1.2 + steer * 0.18; al.rotation.z = -0.12; }
  if (ar) { ar.rotation.x = -1.2 - steer * 0.18; ar.rotation.z = 0.12; }
  if (hd) hd.rotation.y = steer * 0.12;
}

// ── recipe board CanvasTexture (redrawn when availability changes) ─────────
function makeBoard() {
  const W = 1024, H = 736;
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  let texture;
  if (canvas) {
    canvas.width = W; canvas.height = H;
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
  } else texture = new THREE.Texture();
  const draw = (cards = [], opts = {}) => {
    if (!canvas) return;
    const g = canvas.getContext('2d');
    // cork + frame
    g.fillStyle = '#6e5238'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#b98a5a'; g.fillRect(22, 22, W - 44, H - 44);
    const r = rng(77);
    for (let i = 0; i < 2600; i++) { g.fillStyle = r() < 0.5 ? 'rgba(90,60,30,.18)' : 'rgba(255,230,190,.14)'; g.fillRect(22 + r() * (W - 44), 22 + r() * (H - 44), 2 + r() * 3, 2 + r() * 3); }
    // header strip
    g.save(); g.translate(W / 2, 92); g.rotate(-0.015);
    g.fillStyle = '#efe6cf'; g.fillRect(-300, -58, 600, 116);
    g.fillStyle = '#9c4a32'; g.fillRect(-300, 46, 600, 12);
    g.fillStyle = '#22262a'; g.font = '900 96px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('RECIPES', 0, 2);
    g.restore();
    // pins
    const pin = (x, y, c) => { g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.arc(x + 3, y + 4, 11, 0, 7); g.fill(); g.fillStyle = c; g.beginPath(); g.arc(x, y, 11, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(x - 3, y - 3, 4, 0, 7); g.fill(); };
    pin(W / 2 - 280, 44, '#d9a83a'); pin(W / 2 + 280, 44, '#4f8f8a');
    // cards: 2 columns
    const colW = 446, cardH = Math.min(100, (H - 210) / Math.ceil(Math.max(1, cards.length) / 2) - 12);
    cards.forEach((c, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = 52 + col * (colW + 28), y = 178 + row * (cardH + 12);
      g.save(); g.translate(x + colW / 2, y + cardH / 2); g.rotate(((i * 37) % 7 - 3) * 0.006);
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(-colW / 2 + 5, -cardH / 2 + 6, colW, cardH);
      g.fillStyle = c.kind === 'product' ? '#f1ead8' : c.kind === 'gadget' ? '#e6dcc0' : '#dfe6d6'; g.fillRect(-colW / 2, -cardH / 2, colW, cardH);
      g.fillStyle = c.kind === 'product' ? '#4f8f8a' : c.kind === 'gadget' ? '#d9a83a' : '#9c4a32'; g.fillRect(-colW / 2, -cardH / 2, 14, cardH);
      g.fillStyle = '#22262a'; g.textAlign = 'left'; g.textBaseline = 'middle';
      let fs = 40; g.font = `800 ${fs}px "Arial Narrow", Arial, sans-serif`;
      while (g.measureText(c.name).width > colW - 110 && fs > 22) { fs -= 2; g.font = `800 ${fs}px "Arial Narrow", Arial, sans-serif`; }
      g.fillText(c.name, -colW / 2 + 30, -6);
      g.font = '600 22px "Arial Narrow", Arial, sans-serif'; g.fillStyle = '#5a5048';
      g.fillText(`${c.steps} steps`, -colW / 2 + 30, cardH / 2 - 18);
      // tick / cross
      g.lineWidth = 9; g.lineCap = 'round';
      if (c.canMake) { g.strokeStyle = '#3f8f6a'; g.beginPath(); g.moveTo(colW / 2 - 66, -2); g.lineTo(colW / 2 - 50, 14); g.lineTo(colW / 2 - 22, -20); g.stroke(); }
      else { g.strokeStyle = '#a8483a'; g.beginPath(); g.moveTo(colW / 2 - 60, -16); g.lineTo(colW / 2 - 30, 14); g.moveTo(colW / 2 - 30, -16); g.lineTo(colW / 2 - 60, 14); g.stroke(); }
      pin(0, -cardH / 2 + 6, ['#c2412f', '#4f8f8a', '#d9a83a'][i % 3]);
      g.restore();
    });
    if (opts.cooking) {
      g.save(); g.translate(W - 150, H - 70); g.rotate(-0.12);
      g.fillStyle = '#c2412f'; g.fillRect(-120, -36, 240, 72);
      g.fillStyle = '#f1ead8'; g.font = '900 40px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('COOKING', 0, 2); g.restore();
    }
    texture.needsUpdate = true;
  };
  draw([]);
  return { canvas, texture, draw };
}

function makeCalendarTexture() {
  if (typeof document === 'undefined') return new THREE.Texture();
  const W = 256, H = 346;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#efe6cf'; g.fillRect(0, 0, W, H);
  // original desert picture: sky gradient, sun, mesas, saguaro
  const sky = g.createLinearGradient(0, 14, 0, 170);
  sky.addColorStop(0, '#e98a4f'); sky.addColorStop(1, '#f3cf86');
  g.fillStyle = sky; g.fillRect(14, 14, W - 28, 160);
  g.fillStyle = '#fff1c8'; g.beginPath(); g.arc(170, 92, 26, 0, 7); g.fill();
  g.fillStyle = '#b5562f'; g.beginPath(); g.moveTo(14, 140); g.lineTo(50, 140); g.lineTo(58, 104); g.lineTo(112, 104); g.lineTo(120, 140); g.lineTo(242, 140); g.lineTo(242, 174); g.lineTo(14, 174); g.fill();
  g.fillStyle = '#9c4a2c'; g.beginPath(); g.moveTo(150, 140); g.lineTo(162, 118); g.lineTo(206, 118); g.lineTo(218, 140); g.fill();
  g.fillStyle = '#d8b47c'; g.fillRect(14, 150, W - 28, 24);
  g.fillStyle = '#4b663a'; g.fillRect(60, 120, 10, 40); g.fillRect(50, 130, 8, 6); g.fillRect(48, 122, 6, 14); g.fillRect(70, 134, 8, 6); g.fillRect(76, 126, 6, 14);
  g.fillStyle = '#22262a'; g.font = '900 30px "Arial Black", Impact, sans-serif'; g.textAlign = 'center';
  g.fillText('OCTOBER', W / 2, 212);
  g.font = '700 15px Arial, sans-serif';
  for (let i = 0; i < 31; i++) {
    const x = 30 + (i % 7) * 33, y = 240 + Math.floor(i / 7) * 22;
    g.fillStyle = i % 7 === 6 ? '#9c4a32' : '#3a3530';
    g.fillText(String(i + 1), x, y);
  }
  g.strokeStyle = '#c2412f'; g.lineWidth = 3; g.beginPath(); g.arc(30 + 3 * 33, 240 + 1 * 22 - 5, 13, 0, 7); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export { DEG };
