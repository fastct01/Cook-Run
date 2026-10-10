// ─────────────────────────────────────────────────────────────────────────────
// GarageView — client view of the opening tutorial in Rook's Garage (Agent ONFOOT), for BOTH roles.
//
//   const gv = new GarageView(view, data, { role: 'driver'|'cook', hudRoot, onSkip, solo });
//   gv.update(dt, snap)            every frame (driver: sim.snapshot(); cook: the latest received snapshot)
//   gv.onKey(e, down) → bool       feed keydown/keyup while snap.phase === 'garage' (WASD/arrows, Shift, E/Enter, Space = jump)
//   gv.consumeInput()              driver: → { moveX, moveZ, run, interact, interactHeld, jump } (world space) — once per sim step
//   gv.pollCommands(dt)            cook:   → CMD objects to send now (avatarMove ≈15 Hz, avatarAct / avatarJump on press)
//   gv.cameraYaw                   world yaw the camera looks along (forward = (sin, cos)); WASD is relative to it
//   gv.finished                    true once the phase left 'garage' and the fade-out is over → destroy()
//   gv.destroy()
//
// Adds to view.scene, at the garage frame (sim/garage.js garageFrame): the `garage_interior` model,
// Rook (`driver`) + Doc (`cook`) with walk cycles / carry poses, the items reflecting snap.garage, glowing
// target markers + a bobbing arrow over YOUR next target, warm interior lights, and a third-person camera
// behind YOUR avatar (view.setCameraController). While it runs the `rooks_garage` exterior is hidden
// (its walls/props overlap the interior); it is shown again on release.
// Unity: GarageView MonoBehaviour + a Cinemachine FreeLook on the local avatar; UI on a Canvas.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { createModel, cloneInstanceMaterials } from '../assets/index.js';
import { LAYOUT, STEPS, garageFrame, moveAvatar } from '../sim/garage.js';
import { Track } from '../sim/track.js';
import { CMD } from '../shared/protocol.js';
import { jumpY, tryJump, stepJump, resetJump } from '../shared/jump.js';
import { Avatar, PoseSmoother } from './avatar.js';
import { OnfootHud, el, keycaps } from './hud.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _t = new THREE.Vector3();

const STEP_LABEL = { markers: 'Find your spot', grab: 'Grab the gear', load: 'Load the crate', door: 'Open the door', board: 'All aboard', crank: 'Start her up' };
const PARTNER = {
  rook: { markers: 'heading to the key rack', wait: 'waiting for you', keys: 'grabbing the keys', plug: 'unplugging the charger', button: 'opening the garage door', board: 'getting in the cab', waitIn: 'in the driver\'s seat', crank: 'cranking the engine' },
  doc: { markers: 'heading to his desk', wait: 'waiting for you', notebook: 'grabbing the notebook', crate: 'going for the crate', carry: 'hauling the crate', board: 'climbing in the back', waitIn: 'in the back of the RV', crank: 'in the back of the RV' },
};
const FB_TEXT = {
  marker: '✓', keys: 'Keys ✓', notebook: 'Notebook ✓', pickup: 'Oof — heavy!', drop: 'Put it down', load: 'Crate loaded ✓',
  plug: 'Unplugged ✓', button: 'Door opening…', board: 'In!', caught: 'She caught!', engine: 'ENGINE ON',
};
const TINT = { rook: new THREE.Color('#ffc65a'), doc: new THREE.Color('#ff8a3a') };

export class GarageView {
  constructor(view, data, { role = 'driver', hudRoot = null, onSkip = null, canSkip = null, solo = false } = {}) {
    this.view = view;
    this.data = data;
    this.role = role === 'cook' ? 'cook' : 'driver';
    this.me = this.role === 'driver' ? 'rook' : 'doc';
    this.other = this.me === 'rook' ? 'doc' : 'rook';
    this.onSkip = onSkip;
    this.canSkip = canSkip ?? (this.role === 'driver');
    this.solo = solo;
    this.track = view.track || new Track(data.route, data.route.defaultSeed ?? 1);
    this.frame = garageFrame(this.track, data.route);
    this.finished = false;
    this.exiting = 0;          // > 0 while fading out
    this.t = 0;
    this.keys = new Set();
    this._edge = false;
    this._lastSent = { mx: 0, mz: 0, run: false, t: -1 };
    this._cmdAcc = 0;
    this._seenFb = 0;
    this._hidden = [];         // exterior objects we hid
    this._exteriorScan = 0;
    this.snap = null;

    // ── scene ────────────────────────────────────────────────────────────
    const root = this.root = new THREE.Group();
    root.name = 'onfoot_garage';
    let baseY = 0;
    try { baseY = this.track.surfaceY(this.frame.gz) ?? 0; } catch (e) { baseY = 0; }
    this.baseY = Number.isFinite(baseY) ? baseY : 0;
    root.position.set(this.frame.ox, this.baseY, this.frame.oz);
    root.rotation.y = this.frame.rot;
    view.scene.add(root);

    const it = this.interior = createModel('garage_interior');
    this.mats = cloneInstanceMaterials(it);
    root.add(it);
    const g = (n) => it.getObjectByName(n);
    this.parts = { door: g('door'), keys: g('keys'), notebook: g('notebook'), crate: g('crate'), plug: g('plug'), m: [0, 1, 2, 3].map((i) => g('marker_' + i)) };
    this.plugHome = this.parts.plug ? this.parts.plug.position.clone() : null;
    // the crate starts where the sim says (moved from its authored spot by the RV door)
    if (this.parts.crate) { this.parts.crate.position.set(LAYOUT.crateStart.x, 0, LAYOUT.crateStart.z); this.parts.crate.rotation.set(0, LAYOUT.crateStart.yaw, 0); }
    // marker_0 = Doc's target, marker_1 = Rook's target; 2/3 unused
    this.markers = { doc: this.parts.m[0], rook: this.parts.m[1] };
    for (const m of [this.parts.m[2], this.parts.m[3]]) if (m) m.visible = false;
    for (const who of ['rook', 'doc']) {
      const mk = this.markers[who];
      const mesh = mk && mk.getObjectByName(mk.name + '_mesh');
      const mat = mesh && (mesh.material);
      if (mat && mat.color) mat.color.copy(TINT[who]);
      this.markers[who + 'Mat'] = mat || null;
    }
    // bobbing arrow over MY next target (the stop arrow, shrunk)
    this.arrow = createModel('stop_arrow');
    this.arrow.scale.setScalar(0.13);
    this.arrow.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    root.add(this.arrow);
    this.arrowArrow = this.arrow.getObjectByName('arrow');
    for (const n of ['ring', 'beam']) { const o = this.arrow.getObjectByName(n); if (o) o.visible = false; }   // just the arrow: the floor marker is the ring
    // warm interior lights under the tube fixtures (no shadows)
    this.lights = [];
    for (const [x, z] of [[-4.5, -1.8], [-0.5, 3.6], [5.2, -1.0]]) {
      const L = new THREE.PointLight('#ffd9a0', 11, 12, 1.4);
      L.position.set(x, 4.7, z);
      root.add(L); this.lights.push(L);
    }

    // ── avatars ──────────────────────────────────────────────────────────
    this.av = { rook: new Avatar(createModel('driver'), { name: 'rook' }), doc: new Avatar(createModel('cook'), { name: 'doc' }) };
    for (const who of ['rook', 'doc']) {
      const s = LAYOUT.start[who];
      this.av[who].set({ x: s.x, z: s.z, yaw: s.yaw });
      root.add(this.av[who].root);
    }
    this.smooth = { rook: new PoseSmoother(), doc: new PoseSmoother() };
    this.boardT = { rook: -1, doc: -1 };
    // local prediction state for MY avatar (cook side; harmless on the host)
    const s0 = LAYOUT.start[this.me];
    this.pred = { x: s0.x, z: s0.z, yaw: s0.yaw, vx: 0, vz: 0, speed: 0, walkPhase: 0, carry: null, idleT: 0, jt: -1, jumpBuf: 0, y: 0 };
    this.jumpRec = { rook: { jt: -1, t: 0 }, doc: { jt: -1, t: 0 } };   // last snapshot jt per avatar (remote arcs are rebuilt from it)

    // ── camera ───────────────────────────────────────────────────────────
    this.camYawLocal = Math.PI;      // looking from the door toward the back wall
    this.camDist = 5.2; this.camH = 4.3; this.camLift = 0;
    this.camPos = null; this.camLook = null;
    this.shake = 0;
    this.ctrl = { update: (dt, camera, snap) => this._camera(dt, camera, snap) };
    view.setCameraController(this.ctrl);
    this._bindPointer();

    // ── HUD ──────────────────────────────────────────────────────────────
    this.hud = new OnfootHud(hudRoot || view.canvas?.parentElement || document.body, { kind: 'garage', role: this.role });
    const top = this.hud.top;
    this.titleEl = el('div', 'ofg-title', top, `<b>ROOK'S GARAGE</b><span>6:36 AM · load up and roll out</span>`);
    this.stepsEl = el('ol', 'ofg-steps', top);
    this.stepEls = STEPS.map((id, i) => el('li', '', this.stepsEl, `<i>${i + 1}</i><span>${STEP_LABEL[id]}</span>`));
    this.partnerEl = el('div', 'ofg-partner', this.hud.bottom);
    this.tags = { rook: el('div', 'ofg-tag ofg-tag--rook', this.hud.root, 'ROOK'), doc: el('div', 'ofg-tag ofg-tag--doc', this.hud.root, 'DOC') };
    this.tags[this.me].classList.add('me');
    this.ebubble = el('div', 'ofg-ebubble', this.hud.root, '<kbd>E</kbd>');
    if (this.canSkip) {
      this.skipBtn = el('button', 'ofg-skip', this.hud.root, 'Skip tutorial <kbd>⏭</kbd>');
      this.skipBtn.type = 'button';
      this.skipBtn.addEventListener('click', () => { this.skipBtn.disabled = true; this.skipBtn.textContent = 'Skipping…'; try { this.onSkip && this.onSkip(); } catch (e) { console.error(e); } });
    }
    this.hud.fade(1, 0);
    requestAnimationFrame(() => this.hud.fade(0, 900));
    this._scanExterior(true);
  }

  // ── public API ─────────────────────────────────────────────────────────────
  get cameraYaw() { return this.frame.yawToWorld(this.camYawLocal); }

  onKey(e, down) {
    if (this.finished || this.exiting) return false;
    const c = e.code;
    const MOVE = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'];
    if (MOVE.includes(c)) { if (down) this.keys.add(c); else this.keys.delete(c); return true; }
    if (c === 'Space') {
      if (down && !e.repeat) this._jumpEdge = true;
      return true;
    }
    if (c === 'KeyE' || c === 'Enter') {
      if (down && !e.repeat) this._edge = true;
      if (down) this.keys.add('ACT'); else this.keys.delete('ACT');
      return true;
    }
    return false;
  }
  clearKeys() { this.keys.clear(); this._edge = false; this._jumpEdge = false; }

  /** Camera-relative WASD → world-space move vector (unit length max). */
  moveVector() {
    const k = this.keys;
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const r = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    return worldMove(f, r, this.cameraYaw);
  }

  /** Driver: DriverInput additions for ONE sim step (the interact edge is delivered once). */
  consumeInput() {
    const m = this.moveVector();
    const out = { moveX: m.x, moveZ: m.z, run: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'), interact: this._edge, interactHeld: this.keys.has('ACT'), jump: !!this._jumpEdge };
    this._edge = false; this._jumpEdge = false;
    return out;
  }

  /** Cook: commands to send now. avatarMove ≈15 Hz while moving (and once when stopping), avatarAct on press. */
  pollCommands(dt) {
    const out = [];
    if (this.finished || this.exiting) return out;
    const m = this.moveVector();
    const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    this._cmdAcc += dt;
    const moving = Math.abs(m.x) + Math.abs(m.z) > 1e-3;
    const changed = Math.abs(m.x - this._lastSent.mx) + Math.abs(m.z - this._lastSent.mz) > 0.05 || run !== this._lastSent.run;
    if ((moving && this._cmdAcc >= 1 / 15) || (changed && this._cmdAcc >= 1 / 30)) {
      this._cmdAcc = 0;
      const c = { type: CMD.AVATAR_MOVE, mx: +m.x.toFixed(3), mz: +m.z.toFixed(3), run };
      out.push(c); this._lastSent = { mx: m.x, mz: m.z, run };
    }
    if (this._edge) { this._edge = false; out.push({ type: CMD.AVATAR_ACT }); }
    if (this._jumpEdge) { this._jumpEdge = false; this._predJump = true; out.push({ type: CMD.AVATAR_JUMP }); }
    this._predIn = { x: m.x, z: m.z, run };
    return out;
  }

  // ── per frame ─────────────────────────────────────────────────────────────
  update(dt, snap) {
    if (this.finished) return;
    dt = clamp(dt || 0, 0, 0.1);
    this.t += dt;
    const fresh = !!snap && snap !== this.snap;
    if (snap) this.snap = snap;
    const S = this.snap;
    const G = S && S.garage;
    if (this.exiting > 0 || (S && S.phase && S.phase !== 'garage')) { this._exit(dt); return; }
    this._scanExterior(false);
    if (!G) { this._anim(dt); return; }
    const now = this.t;
    // avatar poses (world → local)
    for (const who of ['rook', 'doc']) {
      const a = G[who]; if (!a) continue;
      const L = this.frame.toLocal(a.x, a.z);
      const ly = this.frame.yawToLocal(a.yaw);
      this.smooth[who].push(L.x, L.z, ly, now);
      if (fresh) this.jumpRec[who] = { jt: a.jt ?? -1, t: now };
    }
    this._items(dt, G);
    this._predict(dt, G);
    for (const who of ['rook', 'doc']) {
      const a = G[who]; if (!a) continue;
      const av = this.av[who];
      let p = this.smooth[who].update(dt, now, this.role === 'driver' ? 30 : 14);
      const own = who === this.me && this.role === 'cook' && !a.inRv;
      if (own) p = this.pred;
      const jr = this.jumpRec[who];
      const y = own ? this.pred.y : jr.jt >= 0 ? jumpY(jr.jt + (now - jr.t)) : 0;
      const carry = a.carry === 'crate' ? 'crate' : who === 'rook' && this._keysShowT > 0 ? 'keys' : who === 'doc' && G.items.notebook === 'doc' && !a.inRv ? 'notebook' : null;
      av.set({ x: p.x, z: p.z, y, yaw: p.yaw, speed: who === this.me && this.role === 'cook' ? this.pred.speed : a.speed, carry, act: a.act || 0, run: a.speed > 3.3 });
      // boarding: step into the door, then vanish
      if (a.inRv) {
        if (this.boardT[who] < 0) this.boardT[who] = 0;
        this.boardT[who] += dt;
        const k = clamp(this.boardT[who] / 0.45, 0, 1);
        const into = who === 'rook' ? { x: -0.9, z: 0 } : { x: 0.9, z: 0 };
        av.set({ x: p.x + into.x * k, z: p.z + into.z * k, speed: k < 1 ? 1.2 : 0 });
        av.root.scale.setScalar(1 - k * 0.15);
        av.setVisible(k < 1);
      } else if (this.boardT[who] >= 0) { this.boardT[who] = -1; av.root.scale.setScalar(1); av.setVisible(true); }
    }
    this._anim(dt);
    this._hudUpdate(G);
  }

  // ── internals ─────────────────────────────────────────────────────────────
  _predict(dt, G) {
    // cook: predict Doc locally from the keys; reconcile softly toward the host's position
    if (this.role !== 'cook') return;
    const me = G[this.me];
    const L = this.frame.toLocal(me.x, me.z);
    const P = this.pred;
    if (me.inRv) { P.x = L.x; P.z = L.z; P.speed = 0; resetJump(P); this._predJump = false; return; }
    if (this._predJump) { this._predJump = false; tryJump(P); }
    stepJump(P, dt);
    const m = this._predIn || this.moveVector();
    const d = this.frame.dirToLocal(m.x, m.z);
    P.carry = me.carry;
    const other = G[this.other];
    const extra = [];
    if (other && !other.inRv) { const o = this.frame.toLocal(other.x, other.z); extra.push([o.x, o.z, 0.3]); }
    if (G.items.crate === 'floor' && G.crate) { const c = this.frame.toLocal(G.crate.x, G.crate.z); extra.push([c.x, c.z, 0.42]); }
    moveAvatar(P, d.x, d.z, !!(this._predIn && this._predIn.run), dt, extra);
    const err = Math.hypot(P.x - L.x, P.z - L.z);
    const moving = Math.abs(d.x) + Math.abs(d.z) > 0.01;
    P.idleT = moving ? 0 : P.idleT + dt;
    const k = err > 2.5 ? 1 : 1 - Math.exp(-dt * (moving ? (err > 0.7 ? 2.5 : 0.6) : P.idleT > 0.15 ? 7 : 2));
    P.x += (L.x - P.x) * k; P.z += (L.z - P.z) * k;
  }

  _items(dt, G) {
    const I = G.items, P = this.parts;
    // roll-up door
    if (P.door) P.door.position.y = clamp(I.door, 0, 1) * LAYOUT.door.open;
    // keys: on the hook, then a moment in Rook's hand
    if (P.keys) {
      const inHand = I.keys === 'rook';
      if (inHand && !this._keysTaken) { this._keysTaken = true; this._keysShowT = 1.6; this.av.rook.handR.add(P.keys); P.keys.position.set(0, -0.02, 0.06); P.keys.rotation.set(0, 0, 0); P.keys.scale.setScalar(2.2); }
      this._keysShowT = Math.max(0, (this._keysShowT || 0) - dt);
      if (inHand) P.keys.visible = this._keysShowT > 0;
    }
    // notebook: desk → under Doc's arm
    if (P.notebook) {
      const has = I.notebook === 'doc';
      if (has && !this._nbTaken) { this._nbTaken = true; this.av.doc.handR.add(P.notebook); P.notebook.position.set(0, -0.02, 0.08); P.notebook.rotation.set(-0.3, Math.PI / 2, Math.PI / 2); P.notebook.scale.setScalar(1.5); }
      if (has) P.notebook.visible = !G.doc.inRv && G.doc.carry !== 'crate';
    }
    // crate: floor (anywhere) → in Doc's arms → slides into the RV
    if (P.crate) {
      if (I.crate === 'doc') {
        if (P.crate.parent !== this.av.doc.carryAnchor) { this.av.doc.carryAnchor.add(P.crate); P.crate.position.set(0, -0.3, 0.02); P.crate.rotation.set(0, 0, 0); P.crate.scale.setScalar(0.92); }
        P.crate.visible = true; this._crateGone = 0;
      } else {
        if (P.crate.parent !== this.interior) { this.interior.add(P.crate); P.crate.scale.setScalar(1); }
        if (I.crate === 'floor' && G.crate) {
          const L = this.frame.toLocal(G.crate.x, G.crate.z);
          P.crate.position.set(L.x, 0, L.z); P.crate.rotation.set(0, this.frame.yawToLocal(G.crate.yaw), 0); P.crate.visible = true;
        } else if (I.crate === 'rv') {
          this._crateGone = (this._crateGone || 0) + dt;
          const k = clamp(this._crateGone / 0.35, 0, 1);
          P.crate.position.set(LAYOUT.use.sideDoor.x + 0.6 * k, 0.45 * k, LAYOUT.use.sideDoor.z);
          P.crate.scale.setScalar(1 - k * 0.6);
          P.crate.visible = k < 1;
        }
      }
    }
    // plug: pulled away from the RV inlet
    if (P.plug && this.plugHome) {
      const out = I.plug === 'out';
      this._plugK = clamp((this._plugK || 0) + (out ? dt : -dt) * 3, 0, 1);
      const k = this._plugK;
      P.plug.position.set(this.plugHome.x + 0.55 * k, 0.12 * Math.sin(k * Math.PI), this.plugHome.z + 0.25 * k);
      P.plug.rotation.set(0, 0.7 * k, 0);
    }
    // engine shake
    if (I.engine === 'cranking') this.shake = Math.max(this.shake, 0.35);
    if (I.engine === 'on' && !this._engineOn) { this._engineOn = true; this.shake = 1; }
    // target markers
    for (const who of ['rook', 'doc']) {
      const mk = this.markers[who]; if (!mk) continue;
      const tw = G.target && G.target[who];
      if (!tw) { mk.visible = false; continue; }
      const L = this.frame.toLocal(tw.x, tw.z);
      mk.visible = true;
      mk.position.set(L.x, 0.014 + (who === 'rook' ? 0.002 : 0), L.z);
      const mine = who === this.me;
      const pulse = 1 + Math.sin(this.t * (mine ? 5 : 3)) * (mine ? 0.12 : 0.06);
      mk.scale.setScalar((mine ? 1.25 : 0.8) * pulse);
      const mat = this.markers[who + 'Mat'];
      if (mat && 'opacity' in mat) mat.opacity = mine ? 0.95 : 0.45;
    }
    // my arrow
    const tw = G.target && G.target[this.me];
    if (tw && !G[this.me].inRv) {
      const L = this.frame.toLocal(tw.x, tw.z);
      this.arrow.visible = true;
      this.arrow.position.set(L.x, 1.15 + Math.sin(this.t * 2.6) * 0.08, L.z);
      this.arrow.rotation.y += dt * 1.6;
    } else this.arrow.visible = false;
    // feedback pops
    for (const f of G.fb || []) {
      if (f.n <= this._seenFb) continue;
      this._seenFb = f.n;
      const txt = FB_TEXT[f.what];
      if (!txt) continue;
      const scr = this._screenOf(this.av[f.who].root.position, 2.25);
      const big = f.what === 'engine';
      this.hud.pop(txt, big ? 'big' : f.who === this.me ? 'good' : 'info', big ? null : scr && scr.x, big ? null : scr && scr.y);
    }
  }

  _anim(dt) {
    for (const who of ['rook', 'doc']) this.av[who].update(dt);
    this.shake = Math.max(0, this.shake - dt * 1.6);
  }

  _hudUpdate(G) {
    const me = this.me, other = this.other;
    const task = G.task ? G.task[me] : null;
    const near = !!(G.near && G.near[me]);
    const sub = task === 'markers' ? '[W][A][S][D] walk · [Shift] run · [Space] jump · drag the mouse to look' : task === 'crank' && me === 'rook' && G.items.engine !== 'on' ? 'keep it held until she catches' : task === 'carry' ? 'carrying is slow — no running' : '';
    this.hud.instruction(G.prompt ? G.prompt[me] : '', { near, who: me === 'rook' ? 'ROOK · you' : 'DOC · you', sub });
    const otask = G.task ? G.task[other] : null;
    const oname = other === 'rook' ? 'Rook' : 'Doc';
    const ptxt = otask ? `${oname}${G.solo && other === 'doc' ? ' (AI)' : ''} is ${PARTNER[other][otask] || '…'}` : `${oname} is ready`;
    if (this._ptxt !== ptxt) { this._ptxt = ptxt; this.partnerEl.innerHTML = `<i class="ofg-dot ofg-dot--${other}"></i>${keycaps(ptxt)}`; }
    // hold ring
    if (me === 'rook' && task === 'crank') this.hud.hold(G.items.engine === 'on' ? 1 : G.hold || 0, 'E');
    else this.hud.hold(null);
    // steps
    const step = G.step ?? 0, comp = G.complete || {};
    STEPS.forEach((id, i) => {
      const li = this.stepEls[i];
      const st = comp[id] ? 'done' : i === step || (step === 2 && i === 3 && !comp.door) ? 'cur' : '';
      if (li.dataset.st !== st) { li.dataset.st = st; li.className = st; }
    });
    // name tags + E bubble (screen space)
    for (const who of ['rook', 'doc']) {
      const av = this.av[who], tag = this.tags[who];
      const vis = av.visible && !(G[who] && G[who].inRv);
      const scr = vis ? this._screenOf(av.headWorld(_v), 0.55, true) : null;
      if (!scr) { tag.style.display = 'none'; continue; }
      tag.style.display = '';
      tag.style.transform = `translate(${scr.x.toFixed(1)}px, ${scr.y.toFixed(1)}px) translate(-50%, -100%)`;
    }
    const tw = G.target && G.target[me];
    if (near && tw && task !== 'crank') {
      const L = this.frame.toLocal(tw.x, tw.z);
      const scr = this._screenOf(_v2.set(L.x, 1.75, L.z), 0);
      if (scr) { this.ebubble.style.display = 'block'; this.ebubble.style.transform = `translate(${scr.x.toFixed(1)}px, ${scr.y.toFixed(1)}px) translate(-50%, -50%)`; }
      else this.ebubble.style.display = 'none';
    } else this.ebubble.style.display = 'none';
    if (this.skipBtn && G.done) this.skipBtn.style.display = 'none';
  }

  /** Screen px of a point (local to root unless `world`), raised by `up` metres. */
  _screenOf(p, up = 0, world = false) {
    const cam = this.view.camera, cv = this.view.renderer?.domElement;
    if (!cam || !cv) return null;
    _t.copy(p);
    if (!world) { this.root.updateMatrixWorld(); _t.applyMatrix4(this.root.matrixWorld); }
    _t.y += up;
    _t.project(cam);
    if (_t.z > 1 || _t.z < -1) return null;
    const r = cv.getBoundingClientRect(), hr = this.hud.root.getBoundingClientRect();
    return { x: (_t.x * 0.5 + 0.5) * r.width + (r.left - hr.left), y: (-_t.y * 0.5 + 0.5) * r.height + (r.top - hr.top) };
  }

  _camera(dt, camera) {
    if (this.finished) return;
    camera.layers.enable(1);   // the RV body layer (the cook's 'rear' mode hides it); restored on release
    const G = this.snap && this.snap.garage;
    const av = this.av[this.me];
    const meIn = G && G[this.me] && G[this.me].inRv;
    // focus: my avatar; once inside the RV, the RV's flank
    const fx = meIn ? (this.me === 'rook' ? LAYOUT.use.driverDoor.x : LAYOUT.use.sideDoor.x) : av.s.x;
    const fz = meIn ? (this.me === 'rook' ? LAYOUT.use.driverDoor.z : LAYOUT.use.sideDoor.z) : av.s.z;
    // lazy follow: swing behind me while I walk away from the camera
    if (!this._drag && !meIn && av.s.speed > 1.0) {
      const d = wrap(av.s.yaw - this.camYawLocal);
      if (Math.abs(d) < 1.25) this.camYawLocal += d * Math.min(1, dt * 0.9);
    }
    const yaw = this.camYawLocal;
    const fwdX = Math.sin(yaw), fwdZ = Math.cos(yaw);
    const look = _v.set(fx, meIn ? 1.6 : 1.25, fz);
    // occlusion: rise over the RV / lift when they sit between the camera and me
    let lift = 0;
    for (let h = 0; h <= 3.2; h += 0.4) {
      const cx = fx - fwdX * this.camDist, cz = fz - fwdZ * this.camDist, cy = this.camH + h;
      if (!blocked(cx, cy, cz, look.x, look.y, look.z)) { lift = h; break; }
      lift = h;
    }
    this.camLift += (lift - this.camLift) * (1 - Math.exp(-dt * 3));
    let cx = fx - fwdX * this.camDist, cz = fz - fwdZ * this.camDist;
    // stay inside the room (wall-backed furniture and the roll-up door would block from outside):
    // squeezed against a wall, the boom rises instead so the view stays open
    const ux = clamp(cx, -9.1, 9.1), uz = clamp(cz, -7.05, 6.55);
    const squeeze = Math.hypot(ux - cx, uz - cz);
    cx = ux; cz = uz;
    const cy = this.camH + this.camLift + Math.min(1.6, squeeze * 0.4);
    const want = new THREE.Vector3(cx, Math.min(cy, 6.5), cz);
    if (!this.camPos) { this.camPos = want.clone(); this.camLook = look.clone(); }
    const k = 1 - Math.exp(-dt * 5.5);
    this.camPos.lerp(want, k);
    this.camLook.lerp(look, 1 - Math.exp(-dt * 9));
    this.root.updateMatrixWorld();
    camera.position.copy(this.camPos).applyMatrix4(this.root.matrixWorld);
    _v2.copy(this.camLook).applyMatrix4(this.root.matrixWorld);
    camera.up.set(0, 1, 0);
    camera.lookAt(_v2);
    if (this.shake > 0.001) {
      const a = this.shake * 0.035, t = this.t * 40;
      camera.position.x += Math.sin(t * 1.3) * a; camera.position.y += Math.sin(t * 1.9 + 1) * a;
    }
    if (camera.fov !== 55) { camera.fov = 55; camera.updateProjectionMatrix(); }
  }

  _bindPointer() {
    const cv = this.view.renderer && this.view.renderer.domElement;
    if (!cv) return;
    const down = (e) => { if (e.button !== 0 && e.button !== 2) return; this._drag = { x: e.clientX, y: e.clientY }; };
    const move = (e) => {
      if (!this._drag) return;
      const dx = e.clientX - this._drag.x, dy = e.clientY - this._drag.y;
      this._drag.x = e.clientX; this._drag.y = e.clientY;
      this.camYawLocal -= dx * 0.006;
      this.camH = clamp(this.camH + dy * 0.012, 2.2, 6.0);
    };
    const up = () => { this._drag = null; };
    const wheel = (e) => { this.camDist = clamp(this.camDist + Math.sign(e.deltaY) * 0.5, 3.6, 8); };
    cv.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    cv.addEventListener('wheel', wheel, { passive: true });
    this._unbind = () => { cv.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); cv.removeEventListener('wheel', wheel); };
  }

  /** Hide the rooks_garage exterior while we are inside (its walls overlap the interior). */
  _scanExterior(force) {
    // the world view builds structures lazily as they stream in: look every frame (3 levels deep is
    // enough for WORLD-A's structures root; a full traverse every 60 frames catches anything else)
    this._exteriorScan = (this._exteriorScan || 0) + 1;
    try { if (typeof this.view.setGarageExteriorVisible === 'function') this.view.setGarageExteriorVisible(false); } catch (e) { /* optional hook */ }
    const hide = (o) => { if (o.userData && o.userData.kind === 'rooks_garage' && o.visible) { o.visible = false; this._hidden.push(o); } };
    if (force || this._exteriorScan % 60 === 0) { this.view.scene.traverse((o) => { if (o !== this.root) hide(o); }); return; }
    for (const a of this.view.scene.children) { if (a === this.root) continue; hide(a); for (const b of a.children) { hide(b); for (const c of b.children) hide(c); } }
  }
  _restoreExterior() {
    for (const o of this._hidden) o.visible = true;
    this._hidden = [];
    try { if (typeof this.view.setGarageExteriorVisible === 'function') this.view.setGarageExteriorVisible(true); } catch (e) { /* optional */ }
  }

  _exit(dt) {
    if (this.exiting === 0) { this.exiting = 1e-6; this.hud.fade(1, 380); this.clearKeys(); }
    this.exiting += dt;
    this._anim(dt);
    if (this.exiting >= 0.4 && !this._released) {
      this._released = true;
      this.view.setCameraController(null);
      this.root.visible = false;
      this._restoreExterior();
      this.hud.root.classList.add('gone');
      this.hud.fade(0, 650);
    }
    if (this.exiting >= 1.1) this.finished = true;
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.finished = true;
    if (this.view.cameraController === this.ctrl) this.view.setCameraController(null);
    this._restoreExterior();
    if (this._unbind) this._unbind();
    this.root.removeFromParent();
    for (const m of Object.values(this.mats || {})) { try { m.dispose(); } catch (e) { /* shared */ } }
    for (const L of this.lights) L.dispose?.();
    this.hud.destroy();
  }
}

/** Camera-relative input (f forward, r right) → world vector, for a camera looking along `yaw`. */
export function worldMove(f, r, yaw) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const rx = -Math.cos(yaw), rz = Math.sin(yaw);
  let x = fx * f + rx * r, z = fz * f + rz * r;
  const l = Math.hypot(x, z);
  if (l > 1) { x /= l; z /= l; }
  return { x, z };
}

// 3D occluders (interior-local AABBs: [x0,x1,y0,y1,z0,z1]) the camera rises over
const OCC = [[2.65, 5.35, 0, 3.5, -4.55, 4.15], [-6.2, -2.2, 1.2, 2.7, 1.3, 5.9]];
function blocked(ax, ay, az, bx, by, bz) {
  for (const b of OCC) {
    let t0 = 0, t1 = 1;
    const d = [bx - ax, by - ay, bz - az], o = [ax, ay, az], lo = [b[0], b[2], b[4]], hi = [b[1], b[3], b[5]];
    let hit = true;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) { hit = false; break; } continue; }
      let ta = (lo[i] - o[i]) / d[i], tb = (hi[i] - o[i]) / d[i];
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) { hit = false; break; }
    }
    if (hit) return true;
  }
  return false;
}
