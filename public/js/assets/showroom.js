// ─────────────────────────────────────────────────────────────────────────────
// Asset showroom (Agent ART) — public/assets.html
// One WebGLRenderer on a fixed full-window canvas draws every visible card's
// turntable via setScissor/setViewport (one shared scene, only the active model
// visible per pass). Click a card → orbit inspector. GLTFExporter (binary) for
// single models and whole categories. `?view=road` = in-context road test with
// the game's chase camera (~12 m behind / 6 m above). `?cat=…`, `?kind=…&v=…`,
// `?shot=1` (no turntable motion, for screenshots).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createModel, CATEGORIES, CATEGORY_NAMES, KINDS_3D, variantCount, getFootprint, labelOf, statsOf, NAMED_PARTS, preloadAssets, cloneInstanceMaterials, toRigid } from './index.js';

const params = new URLSearchParams(location.search);
const SHOT = params.has('shot');
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: SHOT });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;

// ── studio scene (shared by all cards) ─────────────────────────────────────
const scene = new THREE.Scene();
const hemi = new THREE.HemisphereLight(0xdfe8ee, 0x6f604c, 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.1);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.ShadowMaterial({ opacity: 0.32 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
ground.position.y = 0.002;
scene.add(ground);
const holder = new THREE.Group();
scene.add(holder);
const cam = new THREE.PerspectiveCamera(30, 4 / 3, 0.05, 2000);

function lightFor(radius) {
  const r = Math.max(1, radius);
  const sc = sun.shadow.camera;
  sc.left = -r * 1.6; sc.right = r * 1.6; sc.top = r * 1.6; sc.bottom = -r * 1.6; sc.near = 0.1; sc.far = r * 8;
  sc.updateProjectionMatrix();
  ground.scale.setScalar(r * 1.9);
}

// ── model bookkeeping ───────────────────────────────────────────────────────
function frameInfo(obj) {
  obj.updateMatrixWorld(true);
  const vb = obj.userData.viewBox; // optional framing hint (e.g. bridge: frame the deck, not the 60 m pillars)
  const box = vb ? new THREE.Box3(new THREE.Vector3(...vb.min), new THREE.Vector3(...vb.max)) : new THREE.Box3().setFromObject(obj, true);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(0.3, size.length() / 2);
  return { box, size, center, radius };
}

const _corners = Array.from({ length: 8 }, () => new THREE.Vector3());
const _v3 = new THREE.Vector3();
/** Distance at which the box fills `margin` of the view from (yaw, pitch); also returns the screen-centring offset. */
function fitDistance(c, info, yaw, pitch, aspect, margin) {
  const { box } = info;
  let k = 0;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) _corners[k++].set(x, y, z);
  c.aspect = aspect; c.near = 0.01; c.far = 1e5; c.updateProjectionMatrix();
  let d = info.radius * 3;
  const tgt = info.center.clone();
  for (let it = 0; it < 4; it++) {
    c.position.set(tgt.x + Math.sin(yaw) * Math.cos(pitch) * d, tgt.y + Math.sin(pitch) * d, tgt.z + Math.cos(yaw) * Math.cos(pitch) * d);
    c.lookAt(tgt); c.updateMatrixWorld(true);
    let mx = 0, my = 0;
    for (const p of _corners) { _v3.copy(p).project(c); mx = Math.max(mx, Math.abs(_v3.x)); my = Math.max(my, Math.abs(_v3.y)); }
    const m = Math.max(mx, my) / margin;
    d *= 0.35 + 0.65 * m;
  }
  return d;
}
/** Stable framing: the largest fit distance over a full orbit (no zoom pulsing while spinning). */
function orbitFit(c, info, pitch, aspect, margin = 0.9) {
  let d = 0;
  for (let i = 0; i < 8; i++) d = Math.max(d, fitDistance(c, info, (i / 8) * Math.PI * 2, pitch, aspect, margin));
  return d;
}
function placeCamera(c, info, yaw, aspect, pitch = 0.42, dist) {
  const tgt = info.center;
  c.position.set(tgt.x + Math.sin(yaw) * Math.cos(pitch) * dist, tgt.y + Math.sin(pitch) * dist, tgt.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  c.near = Math.max(0.02, dist - info.radius * 2.5); c.far = dist + info.radius * 6;
  c.aspect = aspect;
  c.lookAt(tgt);
  c.updateProjectionMatrix();
  // key light follows the camera so every angle is lit the same way
  const r = Math.max(1, info.radius);
  const a = yaw + 0.7;
  sun.position.set(tgt.x + Math.sin(a) * r * 2.4, r * 2.8, tgt.z + Math.cos(a) * r * 2.4);
  sun.target.position.set(tgt.x, 0, tgt.z);
  ground.position.set(tgt.x, 0.002, tgt.z);
}

// ── card grid ───────────────────────────────────────────────────────────────
const grid = document.getElementById('grid');
const tabs = document.getElementById('tabs');
const catNames = { all: 'All', ...Object.fromEntries(Object.keys(CATEGORIES).map((c) => [c, CATEGORY_NAMES[c] || c])) };
let currentCat = params.get('cat') || 'vehicles';
if (!catNames[currentCat]) currentCat = 'vehicles';
const cards = [];
let paused = SHOT;

// sheet mode: `?view=sheet&items=rv,cop,ped:3,…` — chrome-free grid of framed tiles (doc images)
const SHEET = params.get('view') === 'sheet';
const SHEET_ITEMS = (params.get('items') || '').split(',').filter(Boolean).map((t) => { const [k, v] = t.split(':'); return [k, +(v || 0)]; });
function kindsFor(cat) { return SHEET ? SHEET_ITEMS.map(([k]) => k) : cat === 'all' ? KINDS_3D : CATEGORIES[cat]; }

function buildTabs() {
  tabs.innerHTML = '';
  for (const [id, name] of Object.entries(catNames)) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tab';
    b.setAttribute('aria-pressed', String(id === currentCat));
    const n = kindsFor(id).length;
    b.innerHTML = `${name}<span class="n">${n}</span>`;
    b.addEventListener('click', () => { currentCat = id; history.replaceState(null, '', `?cat=${id}`); buildTabs(); buildGrid(); });
    tabs.appendChild(b);
  }
}

function makeCard(kind, v0 = 0) {
  const card = { kind, variant: 0, obj: null, info: null, yaw: 0.65 + (cards.length % 5) * 0.12 };
  const el = document.createElement('article');
  el.className = 'card';
  el.innerHTML = `
    <button class="stage" type="button" aria-label="Inspect ${labelOf(kind)}"></button>
    <div class="meta">
      <h3>${labelOf(kind)}</h3>
      <span class="kind">${kind}</span>
      <div class="row">
        <span class="stepper">
          <button type="button" aria-label="Previous variant">‹</button><span></span><button type="button" aria-label="Next variant">›</button>
        </span>
        <button class="linkbtn" type="button">Export .glb</button>
      </div>
    </div>`;
  const stage = el.querySelector('.stage');
  const [prev, next] = el.querySelectorAll('.stepper button');
  const label = el.querySelector('.stepper span');
  const n = variantCount(kind);
  const setV = (v) => {
    card.variant = ((v % n) + n) % n;
    label.textContent = n > 1 ? `${card.variant + 1} of ${n}` : 'Single';
    card.obj = createModel(kind, card.variant);
    card.info = frameInfo(card.obj);
    card.fit = null;
    const st = card.obj.userData.style;
    el.querySelector('h3').textContent = labelOf(kind) + (st && st !== labelOf(kind) ? ` (${st})` : '');
    prev.disabled = next.disabled = n < 2;
    prev.style.visibility = next.style.visibility = n < 2 ? 'hidden' : 'visible';
  };
  card.fit = null;
  setV(SHEET ? v0 : +(params.get('kind') === kind ? params.get('v') || 0 : 0));
  prev.addEventListener('click', () => setV(card.variant - 1));
  next.addEventListener('click', () => setV(card.variant + 1));
  stage.addEventListener('click', () => openInspector(kind, card.variant));
  el.querySelector('.linkbtn').addEventListener('click', () => exportGLB([[kind, card.variant]], `${kind}_${card.variant}.glb`));
  card.el = el; card.stage = stage;
  return card;
}

function buildGrid() {
  grid.innerHTML = '';
  cards.length = 0;
  const list = SHEET ? SHEET_ITEMS : kindsFor(currentCat).map((k) => [k, 0]);
  for (const [kind, v0] of list) {
    const c = makeCard(kind, v0);
    cards.push(c);
    grid.appendChild(c.el);
  }
  document.getElementById('exportCat').textContent = currentCat === 'all' ? 'Export everything' : `Export ${catNames[currentCat].toLowerCase()}`;
}

// ── render loop ─────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let t = 0;
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) renderer.setSize(w, h, false);
}

const headerEl = document.querySelector('header.top');
function drawInto(rect, obj, info, camera, yaw, extra) {
  const H = window.innerHeight, W = window.innerWidth;
  // never draw over the sticky header: clip the scissor (not the viewport) below it
  const clipTop = ins.open ? 0 : Math.max(0, headerEl.getBoundingClientRect().bottom);
  const top = Math.max(rect.top, clipTop);
  if (rect.bottom <= top || rect.top > H || rect.right < 0 || rect.left > W || rect.width < 2) return false;
  const x = rect.left, y = H - rect.bottom;
  renderer.setViewport(x, y, rect.width, rect.height);
  renderer.setScissor(x, y, rect.width, rect.bottom - top);
  holder.clear();
  holder.add(obj);
  lightFor(info.radius);
  if (camera) extra?.();
  renderer.render(scene, camera);
  return true;
}

function animateParts(obj, time) {
  const s = Math.sin(time * 6);
  obj.traverse((o) => {
    if (/^wheel_/.test(o.name) && !o.name.endsWith('_mesh')) o.rotation.x = time * 6;
    if (o.name === 'wheel_fl' || o.name === 'wheel_fr') o.rotation.y = Math.sin(time * 1.3) * 0.35;
    if (o.name === 'rotor') o.rotation.y = time * 18;
    if (o.name === 'tail_rotor') o.rotation.x = time * 30;
    if (o.name === 'blades') o.rotation.z = time * 2.5;
    if (o.name === 'ball') o.rotation.x = time * 3;
    if (o.name === 'leg_l' || o.name === 'leg_fl' || o.name === 'leg_rr') o.rotation.x = s * 0.55;
    if (o.name === 'leg_r' || o.name === 'leg_fr' || o.name === 'leg_rl') o.rotation.x = -s * 0.55;
    if (o.name === 'arm_l') o.rotation.x = -s * 0.5;
    if (o.name === 'arm_r') o.rotation.x = s * 0.5;
    if (o.name === 'head') o.rotation.y = Math.sin(time * 0.9) * 0.3;
    if (o.name === 'door') o.rotation.y = (0.5 + 0.5 * Math.sin(time * 1.2)) * 1.2;
    if (o.name === 'arm' && obj.userData.kind === 'crossing_gate') o.rotation.z = -(0.5 + 0.5 * Math.sin(time * 0.8)) * 1.45;
    if (o.name === 'car_0') o.position.y = Math.abs(Math.sin(time * 8)) * 0.03;
  });
  const fm = obj.userData.flashMaterials;
  if (fm) {
    const ph = Math.floor(time * 4) % 2;
    if (fm.light_red) fm.light_red.emissiveIntensity = ph ? 2.0 : 0.1;
    if (fm.light_blue) fm.light_blue.emissiveIntensity = ph ? 0.1 : 2.0;
    if (fm.lamp_l) fm.lamp_l.emissiveIntensity = ph ? 1.6 : 0;
    for (const k of ['light_brake_l', 'light_brake_r']) if (fm[k]) fm[k].emissiveIntensity = (Math.sin(time * 2) > 0) ? 1.6 : 0.15;
    if (fm.lamp_r) fm.lamp_r.emissiveIntensity = ph ? 0 : 1.6;
    for (const k of ['lamp_0', 'lamp_1', 'lamp_2']) if (fm[k]) fm[k].emissiveIntensity = (Math.floor(time * 2) % 2) ? 1.2 : 0.2;
  }
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!paused) t += dt;
  resize();
  renderer.setScissorTest(false);
  renderer.clear();
  renderer.setScissorTest(true);
  if (roadMode) { renderRoad(dt); requestAnimationFrame(frame); return; }
  if (ins.open) {
    const r = ins.view.getBoundingClientRect();
    ins.controls.update();
    if (ins.spin && !paused) { const tg = ins.controls.target; const off = ins.camera.position.clone().sub(tg); off.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.35); ins.camera.position.copy(tg).add(off); }
    if (ins.anim) animateParts(ins.obj, t);
    const sph = new THREE.Spherical().setFromVector3(ins.camera.position.clone().sub(ins.controls.target));
    const rr = Math.max(1, ins.info.radius), a = sph.theta + 0.7, tg = ins.controls.target;
    sun.position.set(tg.x + Math.sin(a) * rr * 2.4, rr * 2.8, tg.z + Math.cos(a) * rr * 2.4);
    sun.target.position.set(tg.x, 0, tg.z);
    ground.position.set(ins.info.center.x, 0.002, ins.info.center.z);
    drawInto(r, ins.obj, ins.info, ins.camera, 0, () => {});
  } else {
    for (const c of cards) {
      const r = c.stage.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) continue;
      const aspect = r.width / Math.max(1, r.height);
      const pitch = PITCH[c.kind] ?? 0.42;
      if (!c.fit || Math.abs(c.fitAspect - aspect) > 0.01) { c.fit = orbitFit(cam, c.info, pitch, aspect, 0.9); c.fitAspect = aspect; }
      const yaw = c.yaw + (paused ? 0 : t * 0.4);
      placeCamera(cam, c.info, yaw, aspect, pitch, c.fit);
      drawInto(r, c.obj, c.info, cam, yaw);
    }
  }
  holder.clear();
  requestAnimationFrame(frame);
}

const PITCH = { mesa: 0.28, canyon_wall: 0.3, pothole: 0.75, oil_slick: 0.8, sanddrift: 0.6, spikes: 0.7, train: 0.5, bridge_ramp: 0.25, bridge_landing: 0.3, ped: 0.22, driver: 0.22, cook: 0.22, store_hardware: 0.55, store_gas: 0.55, store_junkyard: 0.6, store_farm: 0.55, sell_point: 0.6 };

// ── inspector ───────────────────────────────────────────────────────────────
const ins = {
  el: document.getElementById('inspector'), view: document.getElementById('insView'), open: false,
  camera: new THREE.PerspectiveCamera(35, 1, 0.05, 3000), controls: null, obj: null, info: null, yaw: 0, anim: false, spin: false,
  kind: null, variant: 0, helpers: [],
};
ins.controls = new OrbitControls(ins.camera, ins.view);
ins.controls.enableDamping = true;
ins.controls.enabled = false;

function openInspector(kind, variant) {
  ins.kind = kind; ins.variant = variant;
  ins.el.classList.add('open');
  ins.open = true;
  ins.controls.enabled = true;
  loadInspector();
  history.replaceState(null, '', `?cat=${currentCat}&kind=${kind}&v=${variant}`);
  document.getElementById('insClose').focus();
}
function loadInspector() {
  const { kind } = ins;
  const n = variantCount(kind);
  ins.variant = ((ins.variant % n) + n) % n;
  ins.obj = createModel(kind, ins.variant);
  cloneInstanceMaterials(ins.obj);
  ins.info = frameInfo(ins.obj);
  ins.yaw = 0;
  const r = ins.view.getBoundingClientRect();
  const asp = r.width / Math.max(1, r.height), pitch = Math.min(0.5, PITCH[kind] ?? 0.38);
  const yaw0 = +(params.get('yaw') ?? 0.75);
  placeCamera(ins.camera, ins.info, yaw0, asp, pitch, fitDistance(ins.camera, ins.info, yaw0, pitch, asp, 0.82));
  ins.camera.far = ins.info.radius * 40;
  ins.camera.updateProjectionMatrix();
  ins.controls.target.copy(ins.info.center);
  ins.controls.maxDistance = ins.info.radius * 12;
  ins.controls.minDistance = ins.info.radius * 0.3;
  ins.controls.update();
  document.getElementById('insTitle').textContent = labelOf(kind);
  document.getElementById('insKind').textContent = `createModel('${kind}', ${ins.variant})`;
  const st = statsOf(ins.obj);
  const fp = getFootprint(kind, ins.variant);
  const sz = ins.info.size;
  const style = ins.obj.userData.style || ins.obj.userData.character;
  document.getElementById('insStats').innerHTML = `
    <dt>Footprint</dt><dd>${fp.w} × ${fp.l} m, ${fp.h} m tall</dd>
    <dt>Visual bounds</dt><dd>${sz.x.toFixed(2)} × ${sz.z.toFixed(2)} × ${sz.y.toFixed(2)} m</dd>
    <dt>Triangles</dt><dd>${st.tris.toLocaleString()}</dd>
    <dt>Meshes</dt><dd>${st.meshes} (the game merges them into one draw call)</dd>
    ${style ? `<dt>Style</dt><dd>${style}</dd>` : ''}`;
  const parts = new Set(NAMED_PARTS[kind] || []);
  ins.obj.traverse((o) => { if (o !== ins.obj && o.name && !o.name.endsWith('_mesh') && o.name !== 'mesh' && !/^(sign|ad|pole|body)$/.test(o.name)) parts.add(o.name); });
  document.getElementById('insParts').innerHTML = parts.size ? [...parts].map((p) => `<span class="chip">${p}</span>`).join('') : '<span class="chip empty">Static — no animated parts</span>';
  const step = document.getElementById('insStepper');
  step.innerHTML = n > 1 ? `<button type="button" aria-label="Previous variant">‹</button><span>Variant ${ins.variant + 1} of ${n}</span><button type="button" aria-label="Next variant">›</button>` : '<span>Single variant</span>';
  const bs = step.querySelectorAll('button');
  if (bs.length) { bs[0].onclick = () => { ins.variant--; loadInspector(); }; bs[1].onclick = () => { ins.variant++; loadInspector(); }; }
  document.getElementById('insNote').textContent = NOTES[kind] || 'Origin at ground centre, front faces +Z, 1 unit = 1 m.';
  applyPointHelpers();
}
function closeInspector() {
  ins.el.classList.remove('open'); ins.open = false; ins.controls.enabled = false;
  history.replaceState(null, '', `?cat=${currentCat}`);
}
function applyPointHelpers() {
  for (const h of ins.helpers) h.removeFromParent();
  ins.helpers.length = 0;
  if (!document.getElementById('optPoints').checked) return;
  const s = Math.max(0.25, ins.info.radius * 0.05);
  ins.obj.traverse((o) => {
    if (o === ins.obj || o.isMesh || !o.name || o.name.endsWith('_mesh')) return;
    const a = new THREE.AxesHelper(s);
    a.material.depthTest = false; a.renderOrder = 10;
    o.add(a); ins.helpers.push(a);
  });
}
document.getElementById('insClose').addEventListener('click', closeInspector);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ins.open) closeInspector(); });
document.getElementById('optAnim').addEventListener('change', (e) => { ins.anim = e.target.checked; if (!ins.anim) loadInspector(); });
document.getElementById('optSpin').addEventListener('change', (e) => { ins.spin = e.target.checked; });
document.getElementById('optPoints').addEventListener('change', applyPointHelpers);
document.getElementById('insExport').addEventListener('click', () => exportGLB([[ins.kind, ins.variant]], `${ins.kind}_${ins.variant}.glb`));

const NOTES = {
  rv: 'Wheels spin on rotation.x (+ = forward). Door opens with rotation.y > 0. window_glow is hidden by default — make it visible and tint it for fire. vent and exhaust are empties for particle emitters.',
  cop: 'Call cloneInstanceMaterials(obj) once per car, then flash userData.flashMaterials.light_red / light_blue via emissiveIntensity.',
  cop_suv: 'Same lights contract as the patrol car: clone per instance, flash emissiveIntensity.',
  heli: 'rotor spins on rotation.y, tail_rotor on rotation.x. spot points down (−Y) for a SpotLight.',
  train: 'Built along +Z, ~61 m. car_0 is the locomotive at the front. The sim rotates the whole train to cross the road.',
  crossing_gate: 'arm extends along local −X. rotation.z = 0 is down (closed), −1.45 is raised. lamp_l / lamp_r flash alternately.',
  ped: 'Pivots: body (pelvis), head, arm_l/arm_r (shoulders), leg_l/leg_r (hips). rotation.x > 0 swings a limb backward.',
  driver: 'Rook — the driver. Same rig as pedestrians.', cook: 'Doc — the cook. Same rig as pedestrians.',
  smoke_cloud: 'puff_0…puff_7 share one transparent material — clone per instance to fade opacity.',
  bridge_ramp: 'Origin at the ramp start. Deck top is y = rampHeight × z / length, matching Track.surfaceY. Pillars reach the canyon floor.',
  bridge_landing: 'Origin at the far deck’s broken edge (gapEnd). Deck is flat at landingHeight.',
  canyon_wall: 'Runs 40 m along X; the cliff face looks toward +Z (the road). Origin is at the cliff foot.',
  mesa: 'Far background piece, 40–90 m wide. Cheap enough to scatter a few per chunk.',
  windmill: 'blades spins on rotation.z.',
  sell_point: 'Abandoned drive-in lot. buyer_car marks the parked mystery car (baked into the lot mesh); handoff marks where the RV should stop.',
};

// ── export ──────────────────────────────────────────────────────────────────
const toastEl = document.getElementById('toast');
function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.classList.remove('show'), 3200); }

// glTF-native materials for export: matte PBR (roughness 1, metalness 0) keeps the look in Unity/Blender.
const _pbr = new Map();
function toPBR(m) {
  if (!m || m.isMeshStandardMaterial || m.isShadowMaterial) return m;
  let out = _pbr.get(m);
  if (out) return out;
  if (m.isMeshBasicMaterial) out = m; // exported as KHR_materials_unlit-free basic colour; fine as-is
  else {
    out = new THREE.MeshStandardMaterial({
      name: m.name, color: m.color, vertexColors: m.vertexColors, map: m.map || null, flatShading: true,
      roughness: m.isMeshPhongMaterial ? 0.35 : 1, metalness: 0, transparent: m.transparent, opacity: m.opacity,
      emissive: m.emissive || new THREE.Color(0), emissiveIntensity: m.emissiveIntensity ?? 1, alphaTest: m.alphaTest, side: m.side,
    });
  }
  _pbr.set(m, out);
  return out;
}
async function exportGLB(list, filename) {
  const sceneOut = new THREE.Scene();
  sceneOut.name = filename.replace(/\.glb$/, '');
  let x = 0;
  for (const [kind, v] of list) {
    const o = toRigid(createModel(kind, v)); // rigid hierarchy: named transforms + plain meshes (Unity-friendly)
    const info = frameInfo(o);
    o.name = `${kind}_${v}`;
    if (list.length > 1) { x += info.size.x / 2; o.position.x = x; x += info.size.x / 2 + 2; }
    if (o.getObjectByName('window_glow')) o.getObjectByName('window_glow').visible = true; // keep it in the file
    o.traverse((c) => { if (c.isMesh) c.material = toPBR(c.material); });
    sceneOut.add(o);
  }
  try {
    const result = await new GLTFExporter().parseAsync(sceneOut, { binary: true, onlyVisible: false, includeCustomExtensions: false });
    const blob = new Blob([result], { type: 'model/gltf-binary' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(`Exported ${filename} (${(blob.size / 1024).toFixed(0)} KB)`);
    window.__lastExport = { filename, bytes: blob.size };
  } catch (err) {
    console.error(err);
    toast(`Export failed: ${err.message}`);
  }
}
window.exportGLB = exportGLB;
document.getElementById('exportCat').addEventListener('click', async (e) => {
  const btn = e.currentTarget; btn.disabled = true;
  await exportGLB(kindsFor(currentCat).map((k) => [k, 0]), `cook-and-run_${currentCat}.glb`);
  btn.disabled = false;
});
document.getElementById('pause').addEventListener('click', (e) => {
  paused = !paused;
  e.currentTarget.setAttribute('aria-pressed', String(paused));
  e.currentTarget.textContent = paused ? 'Play turntables' : 'Pause turntables';
});

// ── road test (in-context view through the game's chase camera) ────────────
let roadMode = params.get('view') === 'road' || params.get('view') === 'lineup';
let road = null;
function buildRoad(biome = params.get('biome') || 'town') {
  const g = new THREE.Group();
  const isDesert = biome === 'desert';
  const asphalt = new THREE.MeshLambertMaterial({ color: isDesert ? '#55504a' : '#45474b' });
  const groundM = new THREE.MeshLambertMaterial({ color: isDesert ? '#d8b47c' : '#7fa063' });
  const line = new THREE.MeshLambertMaterial({ color: '#e9d47c' });
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), groundM); gr.rotation.x = -Math.PI / 2; gr.receiveShadow = true; g.add(gr);
  const rd = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 600), asphalt); rd.rotation.x = -Math.PI / 2; rd.position.y = 0.005; rd.receiveShadow = true; g.add(rd);
  for (let z = -280; z < 300; z += 9) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 4), line); d.rotation.x = -Math.PI / 2; d.position.set(0, 0.01, z); g.add(d); }
  const put = (kind, v, x, z, ry = 0) => { const o = createModel(kind, v); o.position.set(x, 0, z); o.rotation.y = ry; g.add(o); return o; };
  const rv = put('rv', 0, -1.8, 0); rv.name = 'RV';
  if (!isDesert) {
    put('cop', 0, -1.8, -16); cloneInstanceMaterials(g.children[g.children.length - 1]);
    put('sedan', 1, 1.8, 30, Math.PI); put('pickup', 3, -1.8, 26); put('bus', 0, 1.8, 60, Math.PI);
    put('ped', 0, -4.6, 12); put('ped', 3, -4.4, 9, 2.5); put('ped', 5, 4.6, 18, -1.2); put('ped', 1, 4.5, 6, Math.PI);
    put('cone', 0, -0.6, 18); put('cone', 0, -1.0, 19.5); put('barrier', 0, 3.4, 40); put('trashcan', 1, -4.2, 22); put('hydrant', 0, 4.4, 26);
    for (let i = 0; i < 9; i++) {
      put('house', i % 6, -16, -40 + i * 22, Math.PI / 2);
      put(i % 3 === 2 ? 'tree_round' : 'tree_city', i % 3, -8, -30 + i * 22);
      put('building', (i + 2) % 6, 22, -40 + i * 26, -Math.PI / 2);
      put('streetlight', 0, 5.2, -30 + i * 30, -Math.PI / 2);
      put('fence', i % 3, -9.5, -40 + i * 22, 0);
      put('mailbox_deco', i % 5, -6.3, -34 + i * 22, Math.PI / 2);
    }
    put('trafficlight', 0, 5.5, 50, -Math.PI / 2);
    put('store_gas', 0, -26, 110, Math.PI / 2);
  } else {
    put('cop_suv', 0, -1.8, -18); cloneInstanceMaterials(g.children[g.children.length - 1]);
    put('rival', 0, 1.8, -8); put('truck', 1, 1.8, 50, Math.PI);
    put('tumbleweed', 0, 1.0, 22); put('rock', 1, -2.6, 36); put('sanddrift', 0, 0.5, 60); put('pothole', 1, -1.8, 28); put('cactus_road', 0, 3.8, 15);
    for (let i = 0; i < 10; i++) {
      put('cactus', i % 3, (i % 2 ? 1 : -1) * (9 + (i * 7) % 11), -30 + i * 19);
      put('powerpole', i % 2, -6.5, -40 + i * 30);
      put('rock_big', i % 3, (i % 2 ? -1 : 1) * (28 + i * 3), 10 + i * 30);
    }
    put('billboard', 0, 9, 40, -0.2); put('billboard', 2, -10, 120, 0.25); put('shack', 0, 16, 70, -1.9);
    put('mesa', 0, -120, 260); put('mesa', 2, 140, 300); put('mesa', 1, 40, 380);
    put('warning_sign', 0, 4.4, 80, -0.1);
  }
  const hemiR = new THREE.HemisphereLight(0xdfe8ee, 0x6f604c, 1.1);
  const sunR = new THREE.DirectionalLight(0xfff1dc, 2.2);
  sunR.position.set(40, 70, 30); sunR.castShadow = true; sunR.shadow.mapSize.set(2048, 2048);
  Object.assign(sunR.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 200 });
  sunR.target.position.set(0, 0, 10);
  g.add(hemiR, sunR, sunR.target);
  const s = new THREE.Scene();
  s.background = new THREE.Color(isDesert ? '#8cc4e6' : '#9fd0e8');
  s.fog = new THREE.Fog(isDesert ? '#e8d4b0' : '#c5dbe2', 90, 360);
  s.add(g);
  const c = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);
  return { scene: s, cam: c, rv, mode: params.get('cam') || 'chase', biome };
}
// lineup: `?view=lineup&set=characters|peds|rv|vehicles|props|sheet` — models in rows on one studio floor
const LINEUPS = {
  peds: { rows: [[['driver', 0], ['cook', 0], ...[0, 1, 2, 3, 4, 5, 6, 7].map((v) => ['ped', v]), ['cow', 0]]], cam: [0.0, 0.16, 0.86], gap: 0.55 },
  characters: { rows: [[['driver', 0], ['cook', 0]]], cam: [0.35, 0.12, 0.9], gap: 0.6 },
  rv: { rows: [[['rv', 0, 0], ['rv', 0, Math.PI], ['rv', 0, Math.PI / 2, 'fire']]], cam: [0.6, 0.3, 0.97], gap: 2.2 },
  vehicles: { rows: [[['rv', 0], ['cop', 0], ['cop_suv', 0], ['rival', 0], ['tractor', 0]], [['sedan', 0], ['hatch', 1], ['van', 2], ['pickup', 3], ['bus', 0], ['truck', 0]]], cam: [0.5, 0.42, 0.95], gap: 1.6 },
  buildings: { rows: [[0, 1, 2, 3, 4, 5].map((v) => ['building', v])], cam: [0.45, 0.32, 0.95], gap: 4 },
  houses: { rows: [[0, 1, 2, 3, 4, 5].map((v) => ['house', v])], cam: [0.45, 0.42, 0.95], gap: 3 },
  cars: { rows: [[0, 1, 2, 3, 4, 5].map((v) => ['sedan', v]), [0, 1, 2, 3, 4, 5].map((v) => ['hatch', v]), [0, 1, 2, 3, 4, 5].map((v) => ['van', v]), [0, 1, 2, 3, 4, 5].map((v) => ['pickup', v])], cam: [0.6, 0.5, 0.95], gap: 1.2 },
  big: { rows: [[['heli', 0], ['train', 0]], [['bus', 0], ['bus', 1], ['bus', 2], ['truck', 0], ['truck', 2], ['tractor', 1], ['tractor', 2]]], cam: [0.6, 0.45, 0.95], gap: 2 },
  sheet: {
    rows: [
      [['rv', 0], ['cop', 0], ['cop_suv', 0], ['sedan', 0], ['hatch', 2], ['van', 1], ['pickup', 3], ['rival', 0], ['tractor', 0], ['bus', 1]],
      [['driver', 0], ['cook', 0], ['ped', 0], ['ped', 1], ['ped', 2], ['ped', 3], ['ped', 4], ['ped', 5], ['ped', 6], ['ped', 7], ['cow', 0], ['cone', 0], ['trashcan', 0], ['hydrant', 0], ['mailbox', 1], ['barrier', 0], ['hay', 0], ['tumbleweed', 0], ['cactus_road', 0], ['rock', 1], ['roadblock', 0]],
      [['house', 1], ['tree_round', 0], ['house', 3], ['streetlight', 0], ['building', 0], ['tree_city', 0], ['building', 3], ['barn', 0], ['silo', 0], ['windmill', 0], ['cactus', 0], ['billboard', 0], ['warning_sign', 0]],
      [['store_gas', 0], ['store_hardware', 0], ['canyon_wall', 0], ['mesa', 1]],
    ],
    cam: [0.55, 0.5, 0.97], gap: 1.4,
  },
};
let lineup = null;
function buildLineup(name) {
  const def = LINEUPS[name] || LINEUPS.peds;
  const s = new THREE.Scene();
  s.background = new THREE.Color('#35342f');
  const g = new THREE.Group();
  let z = 0;
  const all = [];
  for (const row of def.rows) {
    const items = row.map(([k, v, yaw = 0, tweak]) => {
      const o = createModel(k, v); cloneInstanceMaterials(o);
      o.rotation.y = yaw;
      if (tweak === 'fire') { // show the animated parts: door open, fire glow on, brake lights on
        const d = o.getObjectByName('door'); if (d) d.rotation.y = 1.25;
        const gl = o.getObjectByName('window_glow'); if (gl) gl.visible = true;
        const fm = o.userData.flashMaterials || {};
        for (const k2 of ['light_brake_l', 'light_brake_r']) if (fm[k2]) fm[k2].emissiveIntensity = 1.6;
      }
      return { o, info: frameInfo(o) };
    });
    const depth = Math.max(...items.map((i) => i.info.size.z));
    const total = items.reduce((a, i) => a + i.info.size.x, 0) + def.gap * (items.length - 1);
    let x = -total / 2;
    for (const it of items) {
      x += it.info.size.x / 2;
      it.o.position.set(x - it.info.center.x, 0, z - it.info.center.z);
      g.add(it.o); all.push(it.o);
      x += it.info.size.x / 2 + def.gap;
    }
    z -= depth / 2 + def.gap * 2 + (def.rows.indexOf(row) < def.rows.length - 1 ? 0 : 0);
    z -= def.gap * 2;
  }
  // centre rows on z
  const box = new THREE.Box3().setFromObject(g);
  const c = box.getCenter(new THREE.Vector3());
  g.position.set(-c.x, 0, -c.z);
  s.add(g);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshLambertMaterial({ color: '#4a4842' }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
  const sz = box.getSize(new THREE.Vector3());
  const R = Math.max(sz.x, sz.z, sz.y) * 0.6;
  s.add(new THREE.HemisphereLight(0xdfe8ee, 0x6f604c, 1.15));
  const L = new THREE.DirectionalLight(0xfff1dc, 2.1);
  L.position.set(R * 0.6, R * 1.6, R * 1.2); L.castShadow = true; L.shadow.mapSize.set(4096, 4096);
  L.shadow.bias = -0.0006; L.shadow.normalBias = 0.03;
  Object.assign(L.shadow.camera, { left: -R * 1.2, right: R * 1.2, top: R * 1.2, bottom: -R * 1.2, near: 1, far: R * 6 });
  s.add(L, L.target);
  const cam2 = new THREE.PerspectiveCamera(24, 1, 0.1, 5000);
  const info = { box: new THREE.Box3().setFromObject(g), center: new THREE.Vector3(), radius: 1 };
  info.box.getCenter(info.center); info.radius = info.box.getSize(new THREE.Vector3()).length() / 2;
  return { scene: s, cam: cam2, info, def, all };
}
function renderLineup() {
  if (!lineup) lineup = buildLineup(params.get('set') || 'peds');
  const W = window.innerWidth, H = window.innerHeight;
  renderer.setViewport(0, 0, W, H); renderer.setScissor(0, 0, W, H);
  const [yaw, pitch, margin] = lineup.def.cam;
  const d = fitDistance(lineup.cam, lineup.info, yaw, pitch, W / H, margin);
  const tgt = lineup.info.center;
  lineup.cam.position.set(tgt.x + Math.sin(yaw) * Math.cos(pitch) * d, tgt.y + Math.sin(pitch) * d, tgt.z + Math.cos(yaw) * Math.cos(pitch) * d);
  lineup.cam.near = Math.max(0.1, d * 0.2); lineup.cam.far = d * 4; lineup.cam.aspect = W / H;
  lineup.cam.lookAt(tgt); lineup.cam.updateProjectionMatrix();
  if (params.has('anim')) for (const o of lineup.all) animateParts(o, t);
  renderer.setClearColor(lineup.scene.background, 1);
  renderer.render(lineup.scene, lineup.cam);
  renderer.setClearColor(0x000000, 0);
}

function renderRoad(dt) {
  if (params.get('view') === 'lineup') { renderLineup(); return; }
  if (!road) road = buildRoad();
  const W = window.innerWidth, H = window.innerHeight;
  renderer.setViewport(0, 0, W, H); renderer.setScissor(0, 0, W, H);
  road.cam.aspect = W / H; road.cam.updateProjectionMatrix();
  const rv = road.rv.position;
  if (road.mode === 'chase') { road.cam.position.set(rv.x, 6, rv.z - 12); road.cam.lookAt(rv.x, 1.6, rv.z + 8); }
  else if (road.mode === 'side') { road.cam.position.set(rv.x - 9, 2.2, rv.z + 2); road.cam.lookAt(rv.x, 1.4, rv.z + 1); }
  else { road.cam.position.set(rv.x + 14, 22, rv.z - 18); road.cam.lookAt(rv.x, 0, rv.z + 12); }
  road.scene.traverse((o) => {
    if (o.userData?.kind) animateParts(o, t);
  });
  renderer.setClearColor(road.scene.background, 1);
  renderer.render(road.scene, road.cam);
  renderer.setClearColor(0x000000, 0);
  void dt;
}
document.querySelectorAll('[data-cam]').forEach((b) => b.addEventListener('click', () => { if (road) road.mode = b.dataset.cam; }));
document.querySelectorAll('[data-biome]').forEach((b) => b.addEventListener('click', () => { const m = road?.mode; road = buildRoad(b.dataset.biome); road.mode = m || 'chase'; }));

// ── boot ────────────────────────────────────────────────────────────────────
if (roadMode) document.body.classList.add('roadview');
if (SHEET) document.body.classList.add('sheet');
if (params.get('view') === 'lineup') document.querySelector('.roadui').style.display = 'none';
await preloadAssets({ kinds: roadMode ? KINDS_3D : [...new Set(kindsFor(currentCat))], allVariants: SHEET });
buildTabs();
buildGrid();
if (params.get('kind') && KINDS_3D.includes(params.get('kind')) && !roadMode && params.has('inspect')) openInspector(params.get('kind'), +(params.get('v') || 0));
if (params.has('anim')) { document.getElementById('optAnim').checked = true; ins.anim = true; t = +params.get('anim') || 0.6; }
window.__ready = true;
requestAnimationFrame(frame);
