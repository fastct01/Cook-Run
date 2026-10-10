// Headless self-check for the asset kit (Agent ART).
//   node public/js/assets/test/check-assets.js
// Builds every kind × variant, checks named parts, userData, budgets, origin/facing sanity,
// that createModel returns clones sharing geometry/materials, and that every KIND in
// protocol.js + every route.json scenery/stop model exists.
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createModel, KINDS_3D, CATEGORIES, variantCount, getFootprint, NAMED_PARTS, preloadAssets, statsOf, cloneInstanceMaterials } from '../index.js';
import { KIND } from '../../shared/protocol.js';

const dir = fileURLToPath(new URL('../../data/', import.meta.url));
const route = JSON.parse(readFileSync(dir + 'route.json', 'utf8'));
const rules = JSON.parse(readFileSync(dir + 'rules.json', 'utf8'));

let fails = 0;
const fail = (m) => { fails++; console.log('  FAIL', m); };

// 1. coverage
const need = new Set([...KIND, 'rv', 'driver', 'cook', 'bridge_ramp', 'bridge_landing', 'canyon_wall', 'warning_sign']);
for (const b of route.biomes) for (const s of b.scenery) need.add(s);
for (const s of route.stops) need.add(s.model);
need.add(route.sellPoint.model);
// drawn by the entity layer, not the kit: render/ents/models.js CUSTOM_BUILDERS (freight_wagon) and the
// 'virtual' kinds in render/ents/anims.js (tornado funnel, paint splat decal)
const RENDERED_BY_ENTS = new Set(['freight_wagon', 'tornado', 'paint_splat']);
for (const k of need) if (!KINDS_3D.includes(k) && !RENDERED_BY_ENTS.has(k)) fail(`missing kind ${k}`);
const catKinds = Object.values(CATEGORIES).flat();
if (new Set(catKinds).size !== catKinds.length) fail('duplicate kinds in CATEGORIES');

// 2. budgets (tris)
const BUDGET = { vehicles: 2000, characters: 1200, props: 300, scenery: 1500, stores: 9000, bridge: 6000 };
const BUDGET_OVERRIDE = { train: 6000, mesa: 2500, canyon_wall: 2500, smoke_cloud: 700, roadblock: 900, crossing_gate: 600, truck: 2400, bus: 2000, house: 1800, building: 2600 };
const catOf = (k) => Object.entries(CATEGORIES).find(([, l]) => l.includes(k))[0];

const rows = [];
for (const kind of KINDS_3D) {
  const n = variantCount(kind);
  for (let v = 0; v < n; v++) {
    const o = createModel(kind, v);
    if (!o || !o.isObject3D) { fail(`${kind}#${v} not an Object3D`); continue; }
    if (o.userData.missing) { fail(`${kind}#${v} returned placeholder`); continue; }
    const ud = o.userData;
    if (ud.kind !== kind) fail(`${kind}#${v} userData.kind=${ud.kind}`);
    if (!ud.size || !(ud.size.w > 0 && ud.size.h > 0 && ud.size.l > 0)) fail(`${kind}#${v} bad userData.size ${JSON.stringify(ud.size)}`);
    for (const part of NAMED_PARTS[kind] || []) if (!o.getObjectByName(part)) fail(`${kind}#${v} missing part ${part}`);
    // instances are rigid hierarchies: no skinning, no Bone nodes
    o.traverse((c) => { if (c.isSkinnedMesh || c.isBone) fail(`${kind}#${v} ${c.name} is ${c.isBone ? 'a Bone' : 'skinned'} (expected rigid)`); });
    // animated pivots must actually carry geometry (a mesh child), except attachment empties
    const EMPTY_OK = new Set(['vent', 'exhaust', 'spot', 'headlight_l', 'headlight_r', 'handoff', 'light', 'signals', 'body']);
    o.traverse((c) => {
      if (c === o || c.isMesh || !c.name || EMPTY_OK.has(c.name)) return;
      if ((NAMED_PARTS[kind] || []).includes(c.name) || /^wheel_/.test(c.name)) {
        let ok = false; c.traverse((m) => { if (m.isMesh) ok = true; });
        if (!ok) fail(`${kind}#${v} pivot ${c.name} has no mesh under it`);
      }
    });
    // wheel pivots: local X is the axle → their mesh is symmetric about the pivot in Y/Z
    o.traverse((c) => {
      if (!/^wheel_[a-z0-9]+$/.test(c.name)) return;
      const m = c.children.find((x) => x.isMesh); if (!m) return;
      m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox;
      const cy = (bb.min.y + bb.max.y) / 2, cz = (bb.min.z + bb.max.z) / 2;
      if (Math.abs(cy) > 0.03 || Math.abs(cz) > 0.03) fail(`${kind}#${v} ${c.name} mesh not centred on the axle (${cy.toFixed(3)}, ${cz.toFixed(3)})`);
    });
    const st = statsOf(o);
    const cat = catOf(kind);
    const lim = BUDGET_OVERRIDE[kind] || BUDGET[cat] || (cat.startsWith('x_') ? 6000 : 3000);   // expansion packs: 6k tris default
    if (st.tris > lim) fail(`${kind}#${v} ${st.tris} tris > ${lim}`);
    // bounds sanity: origin at ground centre (min y ≈ 0 except bridge/decals), centred in x/z
    o.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(o);
    const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    // pole/post-anchored kinds: origin is the post base (documented), not the bbox centre
    const POST = ['streetlight', 'trafficlight', 'crossing_gate', 'billboard', 'canyon_wall'];
    if (cat !== 'bridge' && kind !== 'smoke_cloud') {
      if (POST.includes(kind)) { if (b.min.y < -0.05) fail(`${kind}#${v} below ground ${b.min.y.toFixed(2)}`); rows.push([kind, v, st.tris, st.meshes, (b.max.x - b.min.x).toFixed(2), (b.max.y - b.min.y).toFixed(2), (b.max.z - b.min.z).toFixed(2)]); continue; }
      if (b.min.y < -0.05 || b.min.y > 0.6) fail(`${kind}#${v} min.y=${b.min.y.toFixed(2)} (should sit on y=0)`);
      if (Math.abs(cx) > Math.max(0.6, (b.max.x - b.min.x) * 0.2) || Math.abs(cz) > Math.max(0.6, (b.max.z - b.min.z) * 0.2)) fail(`${kind}#${v} off-centre (${cx.toFixed(2)}, ${cz.toFixed(2)})`);
    }
    rows.push([kind, v, st.tris, st.meshes, (b.max.x - b.min.x).toFixed(2), (b.max.y - b.min.y).toFixed(2), (b.max.z - b.min.z).toFixed(2)]);
  }
}

// 3. dimensions vs rules.json
const tol = (a, b, t) => Math.abs(a - b) <= t;
for (const [kind, spec] of Object.entries(rules.traffic)) {
  const f = getFootprint(kind, 0);
  const o = createModel(kind, 0); const b = new THREE.Box3().setFromObject(o);
  // the declared collision footprint wins over the visual box (mirrors, the bin-lifter arm, forks, the header)
  const L = f && f.l ? f.l : b.max.z - b.min.z, Wd = f && f.w ? f.w : b.max.x - b.min.x;
  if (!tol(L, spec.length, spec.length * 0.12)) fail(`${kind} length ${L.toFixed(2)} vs rules ${spec.length}`);
  if (!tol(Wd, spec.width, 0.45)) fail(`${kind} width ${Wd.toFixed(2)} vs rules ${spec.width}`);
}
{
  const o = createModel('rv'); const b = new THREE.Box3().setFromObject(o);
  const L = b.max.z - b.min.z, W = b.max.x - b.min.x, H = b.max.y - b.min.y;
  console.log(`  rv bounds: L=${L.toFixed(2)} W=${W.toFixed(2)} H=${H.toFixed(2)} (rules ${rules.rv.length}×${rules.rv.width}×${rules.rv.height})`);
  // visual bounds include mirrors, rear spare tyre and the roof chimney (body box is 8.6 × 2.54 × 3.42)
  if (!tol(L, rules.rv.length, 0.6) || !tol(W, rules.rv.width, 0.4) || H > rules.rv.height + 0.7) fail('rv dims off');
  const ud = o.userData.size; if (ud.l !== rules.rv.length || ud.w !== rules.rv.width || ud.h !== rules.rv.height) fail('rv userData.size must equal rules.rv');
  // facing: headlights in front (+Z)
  const hl = o.getObjectByName('headlight_l'); if (!(hl && hl.position.z > 3)) fail('rv front not +Z');
  const door = o.getObjectByName('door'); if (!(door.position.x < 0)) fail('rv door must be on −X (driver right)');
}
{
  const t = createModel('train'); const b = new THREE.Box3().setFromObject(t);
  const L = b.max.z - b.min.z; if (L < 55 || L > 66) fail(`train length ${L.toFixed(1)}`);
}
{
  const r = createModel('bridge_ramp'); r.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(r);
  const L = route.bridge.lip - route.bridge.rampStart;
  if (b.min.z < -3 || b.max.z < L - 1 || b.max.z > L + 4) fail(`bridge_ramp z-range ${b.min.z.toFixed(1)}..${b.max.z.toFixed(1)} (want 0..${L})`);
  if (b.min.y > -route.bridge.canyonDepth + 1) fail('bridge_ramp pillars do not reach canyon floor');
  // deck top check: raycast down at a few z
  const ray = new THREE.Raycaster();
  for (const z of [5, 25, 45]) {
    ray.set(new THREE.Vector3(0.4, 50, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(r, true)[0];
    const want = route.bridge.rampHeight * z / L;
    if (!hit || Math.abs(hit.point.y - want) > 0.12) fail(`bridge deck y at z=${z}: ${hit ? hit.point.y.toFixed(2) : 'none'} want ${want.toFixed(2)}`);
  }
  const la = createModel('bridge_landing'); const bl = new THREE.Box3().setFromObject(la);
  const LL = route.bridge.landingEnd - route.bridge.gapEnd;
  if (bl.max.z < LL - 1 || bl.min.z > 0.5) fail(`bridge_landing z-range ${bl.min.z.toFixed(1)}..${bl.max.z.toFixed(1)} want 0..${LL}`);
}

// 4. clones share geometry/material; pivots animate independently; per-instance materials separable
{
  const a = createModel('sedan', 2), b = createModel('sedan', 2);
  const ma = a.getObjectByName('body_mesh'), mb = b.getObjectByName('body_mesh');
  const wa = a.getObjectByName('wheel_fl_mesh'), wb = b.getObjectByName('wheel_fl_mesh');
  if (!ma || !wa) fail('sedan missing body_mesh / wheel_fl_mesh');
  else {
    if (ma === mb) fail('clone returned same object');
    if (ma.geometry !== mb.geometry || ma.material !== mb.material || wa.geometry !== wb.geometry) fail('clones do not share geometry/material');
    a.getObjectByName('wheel_fl').rotation.x = 1.0; a.updateMatrixWorld(true); b.updateMatrixWorld(true);
    if (wa.matrixWorld.equals(wb.matrixWorld)) fail('rotating wheel_fl on one clone did not move its wheel');
    const ba = new THREE.Box3().setFromObject(wa), bb = new THREE.Box3().setFromObject(wb);
    if (ba.getCenter(new THREE.Vector3()).distanceTo(bb.getCenter(new THREE.Vector3())) > 0.02) fail('wheel spin moved the axle centre');
  }
  // ped: positive leg rotation.x swings the foot backward (−Z)
  const p = createModel('ped', 0); p.updateMatrixWorld(true);
  const foot0 = new THREE.Box3().setFromObject(p.getObjectByName('leg_l')).getCenter(new THREE.Vector3());
  p.getObjectByName('leg_l').rotation.x = 0.6; p.updateMatrixWorld(true);
  const foot1 = new THREE.Box3().setFromObject(p.getObjectByName('leg_l')).getCenter(new THREE.Vector3());
  if (!(foot1.z < foot0.z - 0.05)) fail('ped leg_l rotation.x>0 should swing backward (−Z)');
  // crossing gate: rotation.z = −1.45 raises the arm
  const gte = createModel('crossing_gate'); gte.updateMatrixWorld(true);
  const armDown = new THREE.Box3().setFromObject(gte.getObjectByName('arm'));
  gte.getObjectByName('arm').rotation.z = -1.45; gte.updateMatrixWorld(true);
  const armUp = new THREE.Box3().setFromObject(gte.getObjectByName('arm'));
  if (!(armUp.max.y > armDown.max.y + 4)) fail('crossing_gate arm rotation.z=-1.45 should raise it');
  // rv door: rotation.y > 0 swings it outward (−X)
  const rv = createModel('rv'); rv.updateMatrixWorld(true);
  const d0 = new THREE.Box3().setFromObject(rv.getObjectByName('door'));
  rv.getObjectByName('door').rotation.y = 1.2; rv.updateMatrixWorld(true);
  const d1 = new THREE.Box3().setFromObject(rv.getObjectByName('door'));
  if (!(d1.min.x < d0.min.x - 0.4)) fail('rv door rotation.y>0 should open outward (−X)');
  const c1 = createModel('cop'), c2 = createModel('cop');
  cloneInstanceMaterials(c1);
  if (c1.getObjectByName('light_red').material === c2.getObjectByName('light_red').material) fail('cloneInstanceMaterials did not separate');
  if (!c1.userData.flashMaterials.light_red) fail('flashMaterials missing');
}

// 5. unknown kind
{
  const warn = console.warn; let warned = 0; console.warn = () => warned++;
  const u = createModel('definitely_not_a_kind'); createModel('definitely_not_a_kind');
  console.warn = warn;
  if (!u.userData.missing) fail('unknown kind not a placeholder');
  if (warned !== 1) fail(`unknown kind warned ${warned}× (want 1)`);
}

// 6. toRigid keeps names/pivots and world-space vertex positions
{
  const { toRigid } = await import('../index.js');
  for (const kind of ['rv', 'ped', 'truck', 'heli', 'cow']) {
    const a = createModel(kind, 1); a.updateMatrixWorld(true);
    const r = toRigid(a); r.updateMatrixWorld(true);
    let sk = 0; r.traverse((o) => { if (o.isSkinnedMesh) sk++; });
    if (sk) fail(`toRigid(${kind}) left ${sk} skinned meshes`);
    for (const part of NAMED_PARTS[kind] || []) if (!r.getObjectByName(part)) fail(`toRigid(${kind}) lost ${part}`);
    const ba = new THREE.Box3().setFromObject(a, true), br = new THREE.Box3().setFromObject(r, true);
    if (ba.min.distanceTo(br.min) > 0.01 || ba.max.distanceTo(br.max) > 0.01) fail(`toRigid(${kind}) bounds moved`);
  }
}

await preloadAssets();

// report
const pad = (s, n) => String(s).padEnd(n);
console.log('\n  kind             v   tris  meshes   W      H      L');
for (const r of rows) console.log('  ' + pad(r[0], 16) + pad(r[1], 4) + pad(r[2], 7) + pad(r[3], 8) + pad(r[4], 7) + pad(r[5], 7) + r[6]);
console.log(`\n${KINDS_3D.length} kinds, ${rows.length} variants built. ${fails ? fails + ' FAILURE(S)' : 'ALL OK'}`);
process.exit(fails ? 1 : 0);
