// ─────────────────────────────────────────────────────────────────────────────
// Bench harness for the 3D cook presenters (public/van-presenters-test.html).
//
//   ?step=grind|measure|heat|stir|cool|break|hammer   one step on a counter (default grind)
//   ?recipe=premium                                    a whole recipe, presenters swap per step
//   ?idle=grind|measure|stove|cool|break|hammer|all    resting props only
//   ?all=1                                             gallery: all seven presenters mid-step (tiles)
//   ?manual=1    test clock: nothing advances until __h.advance(sec); __h.render() draws
//   ?feel=0      no road feel · ?bumps=0 no bumps · ?away=1 Doc not at the station
//   ?orbit=1     orbit camera · ?shots=1 hide dev chrome
// Exposes window.__p (presenter), __lab (CookLab), __h (helpers).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { loadData } from '../../../data/loadData.js';
import { CookLab, LAB_STATES } from '../../../cook/CookLab.js';
import { CMD, EV } from '../../../shared/protocol.js';
import { createPresenter, buildIdleProps, disposeIdleProps, STEP_STATION, presenterTypes, idleStations } from '../index.js';
import { kitMesh, VC } from '../props.js';
import { shade } from '../../../assets/palette.js';

const qs = new URLSearchParams(location.search);
const MANUAL = qs.get('manual') === '1';
const FEEL = qs.get('feel') !== '0';
const BUMPS = qs.get('bumps') !== '0';
const AWAY = qs.get('away') === '1';
if (qs.get('shots') === '1') document.body.classList.add('shots');
const GALLERY = qs.get('all') === '1';
const IDLE = qs.get('idle');
const STEP = qs.get('step') || 'grind';
const RECIPE = qs.get('recipe');

const data = await loadData();

// ── renderer / scene ─────────────────────────────────────────────────────────
const canvas = document.getElementById('cv');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, stencil: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#2a2522');
const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.02, 60);

const hemi = new THREE.HemisphereLight('#fff1dc', '#6a5a48', 1.15);
scene.add(hemi);
const key = new THREE.DirectionalLight('#fff0d8', 1.9);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.01;
scene.add(key, key.target);
const strip = new THREE.PointLight('#ffd391', 2.2, 4.5, 1.6);
scene.add(strip);

function aimKey(cx, span) {
  key.position.set(cx - 1.2, 3.4, 2.2);
  key.target.position.set(cx, 0.9, -0.3);
  const c = key.shadow.camera;
  c.left = -span; c.right = span; c.top = span; c.bottom = -span; c.near = 0.5; c.far = 9;
  c.updateProjectionMatrix();
  strip.position.set(cx + 0.1, 2.15, 0.15);
}

// ── diorama: counter section (wood cabinet, steel top) or a bare wall for the hammer ──
const ANCHOR_Y = 0.95;
function buildDiorama(station) {
  const wall = station === 'hammer';
  return kitMesh('diorama', (k) => {
    // floor: teal vinyl checker
    for (let i = -4; i < 4; i++) for (let j = -2; j < 4; j++) {
      const c = (i + j) & 1 ? VC.floor : shade(VC.floor, 1.12);
      k.box(c, [0.3, 0.02, 0.3], [i * 0.3 + 0.15, -ANCHOR_Y - 0.02, j * 0.3 - 0.45], { base: true });
    }
    // back wall (stained cream) + wood trim
    k.box(VC.cream, [4, 2.4, 0.05], [0, -ANCHOR_Y, -0.65], { base: true });
    k.box(shade(VC.cream, 0.9), [4, 0.5, 0.004], [0, -ANCHOR_Y + 0.1, -0.622], { base: true });
    k.box(VC.woodDark, [4, 0.05, 0.03], [0, 1.02, -0.615], { base: true });
    k.box('#b9a98a', [0.06, 0.5, 0.003], [0.62, 0.35, -0.623], { base: true });           // water stain
    if (!wall) {
      // cabinet
      k.box(VC.wood, [1.12, ANCHOR_Y - 0.04, 0.58], [0, -ANCHOR_Y, -0.33], { base: true });
      k.box(VC.woodDark, [1.1, 0.08, 0.55], [0, -ANCHOR_Y, -0.36], { base: true });              // toe kick
      for (const x of [-0.275, 0.275]) {
        k.box(shade(VC.wood, 1.08), [0.5, 0.66, 0.012], [x, -0.83, -0.035], { base: true, c: 0.004 });
        k.box(VC.woodDark, [0.12, 0.02, 0.02], [x + (x < 0 ? 0.17 : -0.17), -0.2, -0.02]);
      }
      k.box(shade(VC.wood, 0.85), [1.1, 0.12, 0.012], [0, -0.155, -0.035], { base: true });
      // steel top with a rolled front lip
      k.box('#838b90', [1.14, 0.04, 0.62], [0, -0.04, -0.31], { base: true });
      k.box('#a3abaf', [1.14, 0.012, 0.02], [0, -0.012, -0.002], { base: true });
      k.box('#5f666b', [1.14, 0.03, 0.012], [0, -0.045, 0.004], { base: true });
    } else {
      // wall station: hull ribs + a window band above
      k.box(shade(VC.cream, 0.86), [0.05, 1.9, 0.04], [-0.62, -ANCHOR_Y, -0.6], { base: true });
      k.box(shade(VC.cream, 0.86), [0.05, 1.9, 0.04], [0.68, -ANCHOR_Y, -0.6], { base: true });
      k.box(VC.woodDark, [4, 0.04, 0.06], [0, -0.35, -0.6], { base: true });
    }
  }, { seed: 3 });
}

// ── fake host ────────────────────────────────────────────────────────────────
function makeHost() {
  const mat = {};
  for (const id of Object.keys(data.lab.ingredients)) mat[id] = 9;
  return { t: 0, inv: { mat, units: 0, quality: 0, gadgets: { smoke: 0, oil: 0, nitro: 0 } }, events: [], bumpAt: -1, commands: [] };
}
function hostSnapshot(host) {
  const t = host.t;
  let latAcc = 0, bump = 0;
  if (FEEL) latAcc = Math.sin(t * 0.9) * 4 * (0.6 + 0.4 * Math.sin(t * 0.23));
  if (BUMPS) { const ph = t % 9; if (ph > 6.2 && ph < 6.42) bump = 0.7; }
  if (host.bumpAt >= 0 && t - host.bumpAt < 0.2) bump = Math.max(bump, 0.85);
  return {
    t, phase: 'drive', inv: JSON.parse(JSON.stringify(host.inv)), feel: { latAcc, bump, speed: 22 },
    alert: { copClose: false, copDist: 200 }, crew: { driver: 100, cook: 100 }, rv: { hp: 80 }, events: host.events.splice(0),
  };
}
const STEP_SOURCE = { grind: 'premium', measure: 'premium', heat: 'premium', stir: 'premium', cool: 'premium', break: 'premium', hammer: 'patch' };
function benchRecipe(type) {
  const src = data.lab.recipes.find((r) => r.id === STEP_SOURCE[type]);
  const step = src.steps.find((s) => s.type === type);
  return { id: `bench_${type}`, kind: src.kind, name: `Bench · ${step.label}`, needs: { ...src.needs }, units: 0, steps: [{ ...step }] };
}

// ── slots (one counter + anchor + lab + presenter each) ─────────────────────
class Slot {
  constructor(x, o) {
    this.x = x;
    this.o = o;
    this.group = new THREE.Group();
    this.group.position.set(x, 0, 0);
    scene.add(this.group);
    this.anchor = new THREE.Object3D();
    this.anchor.name = 'anchor';
    this.anchor.position.set(0, ANCHOR_Y, 0);
    this.group.add(this.anchor);
    this.station = null;
    this.diorama = null;
    this.idle = null;
    this.p = null;
    this.lab = null;
    this.host = null;
    this.frozen = false;
    if (o.idle) this.setStation(o.idle, true);
    if (o.type || o.recipe) this._startLab();
  }
  setStation(st, showIdle) {
    if (st === this.station) return;
    this.station = st;
    if (this.diorama) { this.diorama.removeFromParent(); this.diorama.geometry.dispose(); }
    this.diorama = buildDiorama(st);
    this.diorama.receiveShadow = true;
    this.anchor.add(this.diorama);
    if (this.idle) { disposeIdleProps(this.idle); this.idle = null; }
    this.idle = buildIdleProps(st, { lab: data.lab });
    if (this.idle) { this.idle.visible = !!showIdle; this.anchor.add(this.idle); }
  }
  _startLab() {
    const host = this.host = makeHost();
    const recipes = data.lab.recipes.slice();
    let rid = this.o.recipe;
    if (!rid) { const r = benchRecipe(this.o.type); recipes.push(r); rid = r.id; }
    const sendCommand = (cmd) => {
      host.commands.push(cmd);
      if (cmd.type === CMD.START_RECIPE) host.events.push({ type: EV.RECIPE_OK, reqId: cmd.reqId, recipeId: cmd.recipeId });
    };
    const lab = this.lab = new CookLab({ ...data, lab: { ...data.lab, recipes } }, { sendCommand, seed: 7 });
    lab.setPresenceMode('station');
    lab.applySnapshot(hostSnapshot(host));
    const r = lab.requestRecipe(rid);
    if (!r.ok) console.error('bench: requestRecipe failed', r);
    lab.applySnapshot(hostSnapshot(host));
    lab.update(1 / 60);
    this._snapAcc = 0;
    this._syncPresenter();
  }
  _syncPresenter() {
    const lab = this.lab;
    const g = lab.current;
    const want = g && lab.state === LAB_STATES.RUNNING ? g : null;
    if (want && (!this.p || this.p.game !== want)) {
      if (this.p && this.p.type === want.type && this.p.game === want) return;
      if (this.p) { this.p.dispose(); this.p = null; }
      const st = STEP_STATION[want.type];
      this.setStation(st, false);
      lab.setPresence(AWAY ? null : st);
      this.p = createPresenter(want.type, { anchor: this.anchor, lab, game: want, step: want.params, recipe: lab.recipe });
      if (this.idle) this.idle.visible = !this.p;
      this.onPresenter?.(this.p);
    }
    if (!want && this.p && (lab.state === LAB_STATES.IDLE)) {
      this.p.dispose(); this.p = null;
      if (this.idle) this.idle.visible = true;
      this.onPresenter?.(null);
    }
  }
  step(dt) {
    if (this.frozen || !this.lab) { return; }
    const host = this.host;
    host.t += dt;
    this._snapAcc += dt;
    if (this._snapAcc >= 1 / 15) { this._snapAcc -= 1 / 15; this.lab.applySnapshot(hostSnapshot(host)); }
    this.lab.update(dt);
    this._syncPresenter();
    if (this.p) this.p.update(dt, { active: true });
    this.bot?.(dt);
  }
  /** Anchor-local point → world. */
  toWorld(p) { return this.anchor.localToWorld(new THREE.Vector3(p[0], p[1], p[2])); }
  cameraPose() {
    const c = this.p ? this.p.camera() : idleCamera(this.station);
    return { pos: this.anchor.localToWorld(c.pos.clone()), target: this.anchor.localToWorld(c.target.clone()), fov: c.fov };
  }
}
function idleCamera(st) {
  if (st === 'hammer') return { pos: new THREE.Vector3(0.38, 0.62, 0.2), target: new THREE.Vector3(0.0, 0.42, -0.6), fov: 46 };
  return { pos: new THREE.Vector3(0.04, 0.68, 0.52), target: new THREE.Vector3(0.0, 0.06, -0.3), fov: 45 };
}

// ── mode setup ───────────────────────────────────────────────────────────────
const slots = [];
let main = null;            // the interactive slot (step / recipe / idle single)
let tiles = null;           // gallery tiles [{ slot, label }]
let orbit = null;

if (GALLERY || IDLE === 'all') {
  const idleGallery = IDLE === 'all' || qs.get('idle') === '1';
  const list = idleGallery ? idleStations.map((id) => ({ idle: id })) : [...presenterTypes.map((t) => ({ type: t })), { idle: 'stove' }, { idle: 'break' }];
  tiles = list.map((it, i) => {
    const slot = new Slot(i * 3, it);
    slots.push(slot);
    if (it.type) slot.bot = galleryBot(slot, it.type);
    return { slot, label: it.type || `idle · ${it.idle}` };
  });
  document.getElementById('nav').style.display = 'none';
  aimKey(list.length * 1.5, list.length * 1.7 + 2);
  if (!idleGallery) {
    // pre-roll: run every slot until its bot freezes it at an interesting moment
    for (let i = 0; i < 60 * 30 && slots.some((s) => !s.frozen); i++) for (const s of slots) s.step(1 / 60);
  }
} else if (IDLE) {
  main = new Slot(0, { idle: IDLE });
  slots.push(main);
  aimKey(0, 2);
} else {
  main = new Slot(0, RECIPE ? { recipe: RECIPE } : { type: STEP });
  slots.push(main);
  aimKey(0, 2);
}

if (qs.get('orbit') === '1' && main) {
  const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
  orbit = new OrbitControls(camera, canvas);
  const pose = main.cameraPose();
  camera.position.copy(pose.pos);
  orbit.target.copy(pose.target);
}

// ── gallery bots (drive presenters with synthetic hits, then freeze mid-step) ─
function galleryBot(slot, type) {
  let a = 0, tt = 0, down = false, clicks = 0, last = 0;
  const hitAt = (p) => ({ local: new THREE.Vector3(p[0], p[1], p[2]), object: null });
  return (dt) => {
    const p = slot.p, g = slot.lab.current;
    if (!p || !g || g.done) return;
    tt += dt;
    const T = p.debugTargets();
    switch (type) {
      case 'grind': case 'stir': {
        a += Math.PI * 2 * (type === 'stir' ? g.target : 1.4) * dt;
        const c = T.center, r = T.radius;
        const pt = hitAt([c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r]);
        if (!down) { p.pointerDown(pt); down = true; } else p.pointerMove(pt);
        if (g.progress > 0.55) slot.frozen = true;
        break;
      }
      case 'measure':
        if (!down) { p.pointerDown(hitAt(T.point)); down = true; }
        if (g.level > 0.5 && tt > 1.2) slot.frozen = true;
        break;
      case 'heat': {
        const mid = (g.bandMin + g.bandMax) / 2;
        g.setDial(Math.max(0, Math.min(1, 0.55 + (g.temp < g.bandMin ? 0.35 : 0) + (mid - g.temp) * 0.006)));
        if (g.inBand > 2.5) slot.frozen = true;
        break;
      }
      case 'cool': {
        const x = (-g.d * 0.6) * T.perHand;
        p.pointerMove(hitAt([x, T.point[1], T.point[2]]));
        if (tt > 3.2) slot.frozen = true;
        break;
      }
      case 'break':
        if (tt - last > 0.32) {
          last = tt;
          const pt = T.points[0];
          if (pt) { p.pointerDown(hitAt(pt)); p.pointerUp(hitAt(pt)); clicks++; }
        }
        if (clicks >= 6 && tt - last > 0.16) slot.frozen = true;
        break;
      case 'hammer':
        if (tt - last > 0.2) {
          last = tt;
          const pt = T.points[0];
          if (pt) { p.pointerDown(hitAt(pt)); p.pointerUp(hitAt(pt)); clicks++; }
        }
        if (clicks >= 8 && tt - last > 0.09) slot.frozen = true;
        break;
      default: slot.frozen = true;
    }
  };
}

// ── pointer routing (single slot) ────────────────────────────────────────────
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function hitFromEvent(e) {
  const p = main?.p;
  if (!p) return null;
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(p.pick(), false);
  if (!hits.length) return null;
  const h = hits[0];
  return { local: main.anchor.worldToLocal(h.point.clone()), object: h.object };
}
canvas.addEventListener('pointerdown', (e) => {
  if (!main?.p || orbit) return;
  canvas.setPointerCapture?.(e.pointerId);
  main.p.pointerDown(hitFromEvent(e));
  e.preventDefault();
});
canvas.addEventListener('pointermove', (e) => { if (main?.p && !orbit) main.p.pointerMove(hitFromEvent(e)); });
const up = (e) => { if (main?.p && !orbit) main.p.pointerUp(hitFromEvent(e)); };
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyB' && main?.host) { main.host.bumpAt = main.host.t; return; }
  if (main?.p && main.p.key(e.code, true)) e.preventDefault();
});
window.addEventListener('keyup', (e) => { if (main?.p && main.p.key(e.code, false)) e.preventDefault(); });

// ── render ───────────────────────────────────────────────────────────────────
const labelEl = document.getElementById('label');
const tileEls = [];
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function applyCamera(pose, aspect) {
  camera.position.copy(pose.pos);
  camera.fov = pose.fov;
  camera.aspect = aspect;
  camera.lookAt(pose.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

let drawCalls = 0;
function render() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (tiles) {
    const cols = tiles.length > 6 ? 3 : tiles.length > 4 ? 3 : 2, rows = Math.ceil(tiles.length / cols);
    const tw = Math.floor(w / cols), th = Math.floor(h / rows);
    renderer.setScissorTest(true);
    renderer.setClearColor('#151312');
    renderer.setViewport(0, 0, w, h); renderer.setScissor(0, 0, w, h); renderer.clear();
    drawCalls = 0;
    tiles.forEach((t, i) => {
      const cx = (i % cols) * tw, cy = h - (Math.floor(i / cols) + 1) * th;
      renderer.setViewport(cx + 2, cy + 2, tw - 4, th - 4);
      renderer.setScissor(cx + 2, cy + 2, tw - 4, th - 4);
      applyCamera(t.slot.cameraPose(), (tw - 4) / (th - 4));
      renderer.render(scene, camera);
      drawCalls = Math.max(drawCalls, renderer.info.render.calls);
      let el = tileEls[i];
      if (!el) { el = tileEls[i] = document.createElement('div'); el.className = 'tile-label'; document.body.appendChild(el); }
      const p = t.slot.p;
      el.textContent = p ? `${t.label} · ${p.drawCalls()} dc · ${Math.round(p.progress * 100)}%` : t.label;
      el.style.left = `${cx + 10}px`; el.style.top = `${h - cy - th + 10}px`;
    });
    renderer.setScissorTest(false);
    labelEl.style.display = 'none';
  } else {
    renderer.setViewport(0, 0, w, h);
    if (!orbit) applyCamera(main.cameraPose(), w / h);
    else { orbit.update(); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    renderer.render(scene, camera);
    drawCalls = renderer.info.render.calls;
    updateLabel();
  }
}

function updateLabel() {
  const p = main.p, lab = main.lab;
  if (!lab) { labelEl.innerHTML = `<div class="step">Idle props · ${main.station}</div><div class="meta">${drawCalls} draw calls (scene)</div>`; return; }
  const g = lab.current;
  const cs = lab.currentStep;
  const prog = g ? g.progress : 0;
  labelEl.innerHTML = `
    <div class="step">${g ? `<b>${g.type}</b> · ${g.label}` : lab.state === 'done' ? `Done · quality ${Math.round((lab.result?.quality ?? 0) * 100)}%` : lab.state}</div>
    ${p ? `<div class="hint">${p.hint}</div>` : ''}
    ${g ? `<div class="ins">${g.instructions}</div>` : ''}
    <div class="bar"><i style="width:${Math.round(prog * 100)}%"></i></div>
    <div>progress ${Math.round(prog * 100)}% · score ${g ? g.score.toFixed(2) : '—'}${lab.awayFromStation ? ' · <b>AWAY</b>' : ''}${lab.fire > 0 ? ` · <b>FIRE ${lab.fire.toFixed(2)}</b>` : ''}</div>
    <div class="meta">${p ? `${p.drawCalls()} presenter dc · ` : ''}${drawCalls} scene dc · ${MANUAL ? 'manual clock' : 'realtime'} · t ${main.host.t.toFixed(1)}s${cs?.paused ? ' · next…' : ''} · B = bump</div>`;
}

function buildNav() {
  const nav = document.getElementById('nav');
  const cur = GALLERY ? 'all' : IDLE ? `idle:${IDLE}` : RECIPE ? `recipe:${RECIPE}` : `step:${STEP}`;
  const links = [...presenterTypes.map((t) => [`step:${t}`, `?step=${t}`, t]), ['all', '?all=1', 'gallery'], ['idle:all', '?idle=all', 'idle'], ['recipe:premium', '?recipe=premium', 'premium']];
  nav.innerHTML = links.map(([k, href, txt]) => `<a href="${href}" class="${k === cur ? 'on' : ''}">${txt}</a>`).join('');
}
buildNav();

// ── clock ────────────────────────────────────────────────────────────────────
function advance(sec) {
  const n = Math.max(1, Math.round(sec * 60));
  for (let i = 0; i < n; i++) for (const s of slots) s.step(1 / 60);
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!MANUAL && !tiles) for (const s of slots) s.step(dt);
  render();
  if (!MANUAL) requestAnimationFrame(frame);
}
render();
if (!MANUAL) requestAnimationFrame(frame);

// ── test hooks ───────────────────────────────────────────────────────────────
function screenOf(p) {
  const s = main || slots[0];
  if (!MANUAL && !orbit) applyCamera(s.cameraPose(), canvas.clientWidth / canvas.clientHeight);
  const v = s.toWorld(p).project(camera);
  const r = canvas.getBoundingClientRect();
  return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, z: v.z };
}
Object.defineProperty(window, '__p', { get: () => main?.p || null });
Object.defineProperty(window, '__lab', { get: () => main?.lab || null });
window.__h = {
  ready: true, slots, tiles, scene, camera, renderer, data,
  advance(sec) { advance(sec); return this.info(); },
  render() { render(); return drawCalls; },
  screenOf,
  screenOfMany(list) { return list.map(screenOf); },
  /** Anchor-local hold/click target of the current presenter → screen px. */
  targets() { const p = main?.p; return p ? p.debugTargets() : null; },
  bump() { if (main?.host) main.host.bumpAt = main.host.t; },
  info() {
    const lab = main?.lab, g = lab?.current, p = main?.p;
    const last = lab?.stepScores?.[lab.stepScores.length - 1];
    const finished = !g && (lab?.state === 'done' || (lab?.state === 'idle' && !!last));
    return {
      state: lab?.state, type: g?.type ?? null, done: !!g?.done || finished, failed: !!g?.failed || lab?.state === 'failed',
      progress: g ? g.progress : finished ? 1 : 0, score: g ? g.score : last ? last.score : 0,
      result: lab?.result || null, stepScores: lab?.stepScores || [], hint: p?.hint ?? '', instructions: g?.instructions ?? '', level: g?.level ?? null, dial: g?.dial ?? null, temp: g?.temp ?? null,
      presenterDrawCalls: p ? p.drawCalls() : 0, sceneDrawCalls: drawCalls, away: lab?.awayFromStation ?? false, t: main?.host?.t ?? 0, fire: lab?.fire ?? 0,
    };
  },
};
