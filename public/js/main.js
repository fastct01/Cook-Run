// ─────────────────────────────────────────────────────────────────────────────
// Cook & Run — entry point. Wires lobby → game session (sim, 3D view, HUD, cook lab, network).
//
// Session flavours
//   solo           this browser runs the sim, drives with the keyboard and runs a docked lab
//                  with the mouse (lab ⇄ sim calls are direct).
//   online driver  this browser runs the sim (host-authoritative). Sends snapshots to the cook at
//                  rules.net.snapshotHz and applies the cook's LabState/commands.
//   online cook    no sim. Renders the host's snapshots (interpolated) from the rear window and
//                  runs the full-size lab. Sends LabState at rules.net.labHz + commands immediately.
//
// 40-minute version: every game opens on foot in Rook's Garage (onfoot/GarageView + sim/garage.js), the
// driver drives in first person (render/fp, C = 3 s look-around).
// Round 3 (ROUND3_CONTRACT.md): at a supply stop Doc jumps out of the side door and plays the shop run in first
// person (onfoot/shops, on the cook's computer — or the solo host's), while Rook defends the RV from the roof with
// the guns (F / DEFEND → defend/DefendClient + sim/roof.js; solo stops: the AI Rook). Doc cooks in first person
// (VanLab3D, O = cut-away overview). Every session runs on withDifficulty(data, level) (Easy / Hard / Extreme).
// Unity mapping: this file ≈ a GameBootstrap + SessionController MonoBehaviour.
// Solo: Tab swaps seats — while you cook, Rook (AI) cruises (no stops, no jump).
// URL flags: ?lab2d=1 flat 2D lab panel instead of the 3D van · ?demo=1 bot driver + bot cook (2D) ·
//            ?auto=1 bot driver online · ?autocook=1 bot cook online (2D) · ?seed=N · ?solo=1 · ?touch=1 ·
//            ?difficulty=easy|hard|extreme (with ?solo / ?demo)
// ─────────────────────────────────────────────────────────────────────────────
import { loadData } from './data/loadData.js';
import { GM, DCMD, CMD } from './shared/protocol.js';
import { withDifficulty, normDifficulty } from './shared/difficulty.js';
import { DefendClient } from './defend/DefendClient.js';
import { GameSim } from './sim/GameSim.js';
import { Autopilot } from './sim/autopilot.js';
import { WorldView } from './render/WorldView.js';
import { createAudio } from './render/audio.js';
import { Hud } from './ui/hud.js';
import { CookLab } from './cook/CookLab.js';
import { CookUI } from './cook/CookUI.js';
import { VanLab3D } from './van/VanLab3D.js';
import { FirstPersonDriver } from './render/fp/FirstPersonDriver.js';
import { GarageView } from './onfoot/GarageView.js';
import { ShopChallenge } from './onfoot/shops/ShopChallenge.js';
import { showLobby } from './ui/lobby.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const STEP = 1 / 60;
const WRECK_END_MS = 3000;   // a wrecked RV: the end screen waits for the explosion
const endDelay = (r) => (r?.won ? 1600 : r?.reason === 'wrecked' ? WRECK_END_MS : 1200);
const MAX_STEPS_PER_FRAME = 6;
const randomSeed = () => (Math.random() * 0xffffffff) >>> 0;
const LAB2D = params.has('lab2d');

// ── boot ─────────────────────────────────────────────────────────────────────
function bootError(msg) {
  const b = $('boot'); b.classList.add('error'); b.classList.remove('gone');
  b.querySelector('.boot-msg').textContent = msg;
}
function hasWebGL2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

let data;
try {
  if (!hasWebGL2()) throw new Error('nogl');
  data = await loadData();
  window.__bootProgress?.(0.9);
} catch (e) {
  bootError(e.message === 'nogl'
    ? 'This browser can\'t run WebGL 2, which the game needs. Try an up-to-date Chrome, Edge, Firefox or Safari.'
    : `Couldn't load the game data (${e.message}). Refresh to try again.`);
  throw e;
}
const audio = createAudio({ route: data.route });
const isTouch = params.has('touch') || matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('touch', isTouch);
const NET_SNAP_DT = 1 / (data.rules.net?.snapshotHz || 15);
const NET_LAB_DT = 1 / (data.rules.net?.labHz || 6);
const LOCAL_LAB_DT = 1 / 10;

// warm the model cache behind the menu so the first drive starts quickly
import('./assets/index.js').then((m) => {
  // only the models the current route uses; the expansion packs (x_* categories) are proposals for now
  const base = Object.entries(m.CATEGORIES).filter(([c]) => !c.startsWith('x_')).flatMap(([, k]) => k);
  return m.preloadAssets?.({ kinds: base });
}).catch(() => {});

let session = null;

function openMenu(opts = {}) {
  $('game').hidden = true;
  showLobby($('menu'), { onStart: startGame, ...opts });
}

function startGame(cfg) {
  if (session) session.destroy();
  session = new Session(cfg);
  window.__game = session;
}

// ── driver input (keyboard + touch → DriverInput) ───────────────────────────
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'handbrake', KeyH: 'horn',
};
const EDGEMAP = { KeyQ: 'smoke', KeyE: 'oil', ShiftLeft: 'nitro', ShiftRight: 'nitro', KeyR: 'reset' };

class DriverInput {
  constructor() {
    this.held = new Set();      // logical buttons held by keyboard or touch
    this.edges = { smoke: false, oil: false, nitro: false, reset: false };
    this.lastManual = -1e9;
  }
  press(name) { this.held.add(name); this.lastManual = performance.now(); }
  release(name) { this.held.delete(name); }
  edge(name) { this.edges[name] = true; this.lastManual = performance.now(); }
  clear() { this.held.clear(); }
  get manualRecently() { return performance.now() - this.lastManual < 4000 || this.held.size > 0; }
  // Edges are delivered to exactly one sim step, even if a frame runs zero or several steps.
  consume() {
    const h = this.held;
    const out = {
      throttle: (h.has('up') ? 1 : 0) - (h.has('down') ? 1 : 0),
      steer: (h.has('right') ? 1 : 0) - (h.has('left') ? 1 : 0),
      handbrake: h.has('handbrake'), horn: h.has('horn'),
      smoke: this.edges.smoke, oil: this.edges.oil, nitro: this.edges.nitro, reset: this.edges.reset,
    };
    this.edges.smoke = this.edges.oil = this.edges.nitro = this.edges.reset = false;
    return out;
  }
}

const isTyping = (e) => {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};

// ── a game session ───────────────────────────────────────────────────────────
class Session {
  constructor(cfg) {
    this.cfg = cfg;
    // Easy / Hard / Extreme: every module of this session reads the scaled copy (never the raw `data`)
    this.difficulty = normDifficulty(cfg.difficulty ?? params.get('difficulty'));
    const D = this.data = withDifficulty(data, this.difficulty);
    this.mode = cfg.mode === 'online' ? 'online' : 'solo';
    this.role = cfg.role === 'cook' ? 'cook' : 'driver';
    this.net = this.mode === 'online' ? cfg.net : null;
    this.seed = (cfg.seed ?? D.route.defaultSeed) >>> 0;
    this.isHost = this.role === 'driver';
    this.demo = !!cfg.demo;
    this.lab2d = LAB2D || this.demo || params.has('autocook');
    this.inLab = false;
    this._seatToasts = new Set();
    this.peerPresent = this.mode === 'online';
    this.ended = false;
    this.paused = false;
    this.destroyed = false;
    this._offs = [];
    this.netAcc = 0; this.labAcc = 0; this.acc = 0;
    this.lastSnap = null;

    const body = document.body;
    body.classList.remove('role-driver', 'role-cook', 'mode-solo', 'mode-online', 'lab-local', 'lab-hidden', 'lab3d', 'in-lab', 'in-shop');
    body.classList.add(`role-${this.role}`, `mode-${this.mode}`);
    $('game').hidden = false;
    $('boot').classList.add('gone');

    // fresh canvas per session (a disposed WebGL context can't be reused reliably)
    const old = $('view');
    const canvas = document.createElement('canvas');
    canvas.id = 'view'; canvas.setAttribute('aria-label', 'Game view'); canvas.tabIndex = -1;
    old.replaceWith(canvas);
    this.canvas = canvas;
    $('hud').innerHTML = '';
    $('lab').innerHTML = '';
    $('touch').innerHTML = '';

    this.view = new WorldView(canvas, D, { seed: this.seed, role: this.role, audio });
    this.hud = new Hud($('hud'), D, { role: this.role });
    this.hud.setDifficulty?.(this.difficulty);

    if (this.isHost) {
      this.sim = new GameSim(D, { seed: this.seed, solo: this.mode === 'solo' });
      this.input = new DriverInput();
      if (this.demo || params.has('auto')) {
        // bot driver: skips the tutorial, sends the AI Rook up at stops and "plays" Doc's shop run in 25 s
        // through the driver-command sink (solo / bots only — online, the real cook plays the shop)
        this.autopilot = new Autopilot(D, { seed: this.seed, sim: this.sim, onDriverCommand: (c) => this.sim.applyDriverCommand(c), autoShop: this.mode === 'solo' ? 25 : null });
      }
    }
    // the opening garage tutorial (both roles); the sim starts in phase 'garage'
    if (D.route.start?.garage) {
      this.garage = new GarageView(this.view, D, {
        role: this.role, hudRoot: $('hud'), solo: this.mode === 'solo',
        onSkip: this.isHost ? () => this.sim.applyDriverCommand({ type: DCMD.SKIP_TUTORIAL }) : null,
      });
    }
    // the driver drives in first person (it waits until the garage releases the camera)
    if (this.isHost) {
      this.fp = new FirstPersonDriver(this.view, D, { hudRoot: $('hud'), audio });
      this.fp.setActive(true);
      this.hud.setFirstPerson?.(true);
      // Rook's roof defence (F / DEFEND): owns the camera + mouse while he is up there (not while the AI is)
      this.defend = new DefendClient(this.view, D, { hudRoot: $('hud'), audio, canvas, sendDriverCommand: (c) => this.sim.applyDriverCommand(c) });
      this.hud.onDefend = () => this.defendUp();
      const mm = (e) => { if (this.defend?.active) this.defend.onPointer(e); else this.fp?.onPointer(e); };
      const ptr = (e) => {
        if (!this.defend?.active || this.paused || !$('overlay').hidden) return;
        if (this.defend.onPointer(e) && e.type !== 'mousemove') e.preventDefault();
      };
      window.addEventListener('mousemove', mm);
      for (const t of ['mousedown', 'mouseup', 'contextmenu']) canvas.addEventListener(t, ptr);
      canvas.addEventListener('wheel', ptr, { passive: false });
      this._offs.push(() => {
        window.removeEventListener('mousemove', mm);
        for (const t of ['mousedown', 'mouseup', 'contextmenu']) canvas.removeEventListener(t, ptr);
        canvas.removeEventListener('wheel', ptr);
      });
    }
    if (this.mode === 'solo') this.mountLab('solo');
    else if (this.role === 'cook') this.mountLab('cook');

    if (this.net) this.wireNet();
    this.buildPills();
    if (isTouch && this.isHost) this.buildTouch();
    this.bindKeys();

    if (!this.garage) {
      if (this.mode === 'solo' && !this.demo) this.hud.toast(this.van ? 'Drive with WASD / arrows · Tab: go cook in the back' : 'Drive with WASD / arrows · cook with the mouse · Tab hides the lab', 'info');
      if (this.role === 'cook') this.hud.toast(this.van ? 'You\'re Doc. Walk to the Recipe Board and start a batch.' : 'You\'re Doc. Pick a recipe and keep the lab under control.', 'info');
    }
    if (this.demo) this.hud.toast('Demo — bots are playing. Press any driving key to take the wheel.', 'info');

    this._last = performance.now();
    this._rafAt = this._last;
    this._raf = requestAnimationFrame((t) => this.frame(t));
    if (this.isHost && this.net) this._startBgTicker();
  }

  // ── lab (CookLab + CookUI) ────────────────────────────────────────────────
  // kind: 'cook' (online cook, lab is the whole game) · 'solo' · 'takeover' (driver whose cook left)
  mountLab(kind) {
    if (this.lab) return;
    this.lab = new CookLab(this.data, { sendCommand: (c) => this.onCookCommand(c), seed: this.seed });
    if (this.lab2d) {
      const compact = kind !== 'cook';
      this.labUI = new CookUI(this.lab, $('lab'), { compact });
      if (compact) {
        document.body.classList.add('lab-local');
        $('labToggle').onclick = () => this.toggleLabPanel();
      }
      if (this.demo || (this.role === 'cook' && params.has('autocook'))) this.startCookBot();
      return;
    }
    document.body.classList.add('lab3d');
    this.van = new VanLab3D(this.view, this.lab, this.data, { canvas: this.canvas, hudRoot: $('hud'), role: kind === 'cook' ? 'cook' : 'solo' });
    this.van.onShopRun = (def) => this.startShop(def, 'door');
    if (kind === 'cook') { if (!this.garage) this.van.setActive(true); }   // after the garage tutorial otherwise
    else {
      // Rook's AI keeps the RV rolling while you cook: steady cruise, no supply stops, no canyon jump.
      this.labPilot = new Autopilot(this.data, { seed: this.seed, maxSpeed: 19, useNitro: false });
      for (const st of this.data.route.stops) this.labPilot.skipped.add(st.id);
      if (isTouch) this.buildSeatButton();
    }
  }

  toggleLabPanel() {
    if (this.van) this.setInLab(!this.inLab);
    else document.body.classList.toggle('lab-hidden');
  }

  // Solo seat swap (3D lab): in the back you walk Doc around; the AI drives.
  setInLab(on, why = null) {
    if (!this.van || (on && this.ended)) return;
    if (on && (this.garage || this.shop || this.defend?.active)) return;   // not during the tutorial, a shop run or the roof
    if (on === this.inLab) return;
    this.inLab = on;
    this.input?.clear();
    audio.horn?.(false);
    this.van.setActive(on);
    this.fp?.setActive(!on);
    this.hud.setFirstPerson?.(!on);
    if (!on) this.lab.setPresence?.(null);
    document.body.classList.toggle('in-lab', on);
    const seat = $('touch').querySelector('.tc-seat');
    if (seat) seat.textContent = on ? 'DRIVE' : 'COOK';
    this.hud.toast(why || (on ? 'Rook\'s AI has the wheel — Tab to drive again' : 'You\'re back at the wheel'), why ? 'bad' : 'info');
  }

  // While cooking, hand the wheel back for things only the player should do.
  checkSeatHandBack(snap) {
    if (!this.inLab || this.ended) return;
    const b = snap.bridge;
    if (b && b.dist > 0 && b.dist < 520 && !b.cleared) { this.setInLab(false, 'BRIDGE OUT AHEAD — take the wheel for the jump!'); return; }
    if (snap.sell && snap.sell.dist < 320) { this.setInLab(false, 'The buyer\'s close — bring it in yourself'); return; }
    const ns = snap.nearStop;
    if (ns && ns.dist < 170 && !this._seatToasts.has(ns.id) && !(snap.looted || []).includes(ns.id)) {
      this._seatToasts.add(ns.id);
      this.hud.toast(`${ns.name} ahead — Tab to drive in and load up`, 'info');
    }
  }

  buildSeatButton() {
    const b = document.createElement('button');
    b.type = 'button'; b.tabIndex = -1; b.className = 'tc tc-small tc-seat'; b.textContent = 'COOK';
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.setInLab(!this.inLab); });
    $('touch').appendChild(b);
  }

  onCookCommand(c) {
    if (this.isHost) this.sim.applyCookCommand(c);          // local lab (solo, or driver took over)
    else if (this.net && this.peerPresent) this.net.sendGame({ k: GM.CMD, c });
  }

  async startCookBot() {
    try {
      const m = await import('./cook/test/autoplay.js');
      if (this.destroyed) return;
      this.cookBot = m.start({ lab: this.lab, ui: this.labUI }, { skill: 0.9 });
    } catch (e) { console.warn('cook bot unavailable', e); }
    // the autoplay bot plays minigames; this picks what to cook
    const pick = () => {
      if (this.destroyed || this.ended) return;
      const lab = this.lab;
      if (lab.state === 'idle' && lab.canStart && !lab.cookDown) {
        const list = lab.availableRecipes().filter((r) => r.canMake);
        const units = this.lastSnap?.inv?.units ?? 0;
        const need = this.data.route.sellPoint.requiredUnits;
        const g = this.lastSnap?.inv?.gadgets || {};
        const order = units < need + 2 ? ['premium', 'street', 'nitro', 'smoke', 'oil', 'patch'] : ['nitro', 'smoke', 'oil', 'patch', 'icepack'];
        const choice = order.map((id) => list.find((r) => r.id === id)).find((r) => r && !(r.kind === 'gadget' && (g[r.gadget] || 0) >= 2));
        if (choice) lab.requestRecipe(choice.id);
      } else if (lab.state === 'done' || lab.state === 'failed') lab.dismissResult?.();
      if (lab.fire > 0.25) lab.useExtinguisher?.();
      if (lab.copAlarm && !lab.curtainsClosed) lab.toggleCurtains(true);
      else if (!this.lastSnap?.alert?.copClose && lab.curtainsClosed) lab.toggleCurtains(false);
      this._pickT = setTimeout(pick, 700);
    };
    this._pickT = setTimeout(pick, 1500);
  }

  // ── networking ───────────────────────────────────────────────────────────
  wireNet() {
    const net = this.net;
    this._offs.push(net.onGame((m) => this.onGame(m)));
    this._offs.push(net.on('peerLeft', (msg) => this.onPeerLeft(msg)));
    this._offs.push(net.on('close', (info) => { if (!info?.intentional) this.onConnectionLost(); }));
    this._offs.push(net.on('latency', (ms) => this.setLatency(ms)));
  }

  onGame(m) {
    if (!m || this.destroyed) return;
    switch (m.k) {
      case GM.SNAP:
        if (this.isHost) return;
        this.lastSnap = m.s;
        this.view.pushSnapshot(m.s, { interpolate: true });
        this.hud.update(m.s);
        this.lab?.applySnapshot(m.s);
        // fallback if the END message is ever lost: the sim also emits an 'end' event in snapshots
        if (m.s.rv?.wrecked) this.onWrecked();
        if (!this.ended && (m.s.phase === 'won' || m.s.phase === 'lost')) {
          const ev = (m.s.events || []).find((e) => e.type === 'end');
          if (ev?.result) { this.ended = true; setTimeout(() => { if (!this.destroyed) this.showEnd(ev.result); }, endDelay(ev.result)); }
        }
        break;
      case GM.LAB: if (this.isHost && !this.localTakeover) this.sim.setLabState(m.l); break;
      case GM.CMD: if (this.isHost && !this.localTakeover) this.sim.applyCookCommand(m.c); break;
      case GM.END:
        if (this.isHost || this._endShown) break;
        // a wrecked RV: let the explosion play before the end screen (the snapshots keep coming)
        if (m.result?.reason === 'wrecked') { this.ended = true; this.onWrecked(); clearTimeout(this._endT); this._endT = setTimeout(() => { if (!this.destroyed) this.showEnd(m.result); }, WRECK_END_MS); }
        else this.showEnd(m.result);
        break;
      case GM.CHAT: if (m.text) this.hud.toast(String(m.text).slice(0, 60), 'info'); break;
      default: break;
    }
  }

  onPeerLeft(msg) {
    if (this.destroyed) return;
    this.peerPresent = false;
    const who = msg?.name ? msg.name : 'Your partner';
    if (this.isHost) {
      if (this.ended) return;
      // keep playing: the driver takes over the lab in the docked panel
      if (this.sim.phase === 'garage') this.sim.applyDriverCommand({ type: DCMD.SKIP_TUTORIAL });
      this.localTakeover = true;
      this.mountLab('takeover');
      this.hud.toast(`${who} left — you're running the lab now${this.van ? ' (Tab to cook)' : ''}`, 'bad');
    } else if (!this.ended) {
      this.ended = true;
      this.showNotice('The driver left', `${who} left the game, so the RV has stopped.`, [
        { label: 'Back to room', primary: true, onClick: () => this.backToRoom() },
        { label: 'Menu', onClick: () => this.quitToMenu() },
      ]);
    }
  }

  onConnectionLost() {
    if (this.destroyed) return;
    this.peerPresent = false;
    this.setLatency(null, true);
    if (this.isHost && !this.ended) {
      this.localTakeover = true;
      this.mountLab('takeover');
      this.hud.toast(`Connection lost — carrying on solo${this.van ? ' (Tab to cook)' : ''}`, 'bad');
    } else if (!this.ended) {
      this.ended = true;
      this.showNotice('Connection lost', 'The connection to the game server dropped.', [
        { label: 'Menu', primary: true, onClick: () => this.quitToMenu() },
      ]);
    }
  }

  // ── frame loop ───────────────────────────────────────────────────────────
  frame(now) {
    if (this.destroyed) return;
    this._raf = requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, Math.max(0, (now - this._last) / 1000));
    this._last = now; this._rafAt = now;
    try {
      if (this.isHost) this.hostFrame(dt); else this.cookFrame(dt);
    } catch (e) {
      console.error(e);
      if (!this._errShown) { this._errShown = true; this.hud.toast('Something went wrong — see the console', 'bad'); }
    }
  }

  // requestAnimationFrame stops in a hidden / minimised / covered tab. For an online host that froze the
  // whole game (sim, snapshots), so the cook's Doc walked into "invisible walls" while his prediction got
  // pulled back to the frozen position. A worker's timer keeps firing in the background (page timers get
  // throttled to 1 Hz); it only steps the host while the tab is hidden or rAF has stopped, and skips rendering.
  _startBgTicker() {
    let w;
    try {
      const url = URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 50);'], { type: 'text/javascript' }));
      w = new Worker(url); URL.revokeObjectURL(url);
    } catch (e) { console.warn('[host] background ticker unavailable', e); return; }
    w.onmessage = () => {
      if (this.destroyed) return;
      const now = performance.now();
      if (!document.hidden && now - this._rafAt < 1000) return;   // visible and rAF alive: rAF drives the host
      const dt = Math.min(0.1, Math.max(0, (now - this._last) / 1000));
      this._last = now;
      try { this.hostFrame(dt, false); } catch (e) { console.error(e); }
    };
    this._offs.push(() => w.terminate());
  }

  driverInput() {
    const NEUTRAL = { throttle: 0, steer: 0, handbrake: false, horn: false, smoke: false, oil: false, nitro: false, reset: false, jump: false };
    // garage tutorial: WASD walks Rook (relative to the garage camera); the demo bot skips it
    if (this.garage && !this.garage.finished && this.sim.phase === 'garage' && !(this.autopilot && !this.input.manualRecently)) {
      this.input.consume();   // drop driving edges
      return { ...NEUTRAL, ...this.garage.consumeInput() };
    }
    if (this.shop) { this.input.consume(); return NEUTRAL; }   // you're Doc in the shop (solo); the sim holds the RV
    if (this.defend?.active) { this.input.consume(); return NEUTRAL; }   // Rook is on the roof; the sim holds the RV
    if (this.inLab && this.labPilot && this.lastSnap) return this.labPilot.update(this.lastSnap);
    if (this.autopilot && this.lastSnap && !this.input.manualRecently) {
      const a = this.autopilot.update(this.lastSnap);
      const k = this.input.consume();   // still deliver manual gadget presses
      return { ...a, smoke: a.smoke || k.smoke, oil: a.oil || k.oil, nitro: a.nitro || k.nitro };
    }
    return this.input.consume();
  }

  hostFrame(dt, render = true) {
    const sim = this.sim;
    if (!this.paused) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < MAX_STEPS_PER_FRAME) {
        const inp = this.driverInput();
        this._lastInput = inp;
        sim.step(inp, STEP);
        this.acc -= STEP; n++;
      }
      if (n === MAX_STEPS_PER_FRAME) this.acc = 0;
    }
    const snap = sim.snapshot();
    this.lastSnap = snap;
    this.view.pushSnapshot(snap, { interpolate: false });
    this.hud.update(snap);

    if (this.garage) {
      this.garage.update(dt, snap);
      if (this.garage.finished) { this.garage.destroy(); this.garage = null; this.afterGarage(); }
    }
    this.updateShop(snap, dt);

    if (this.lab) {
      this.lab.applySnapshot(snap);
      if (!this.paused) { this.lab.update(dt); }
      this.labUI?.update(dt);
      this.van?.update(this.paused ? 0 : dt, snap);
      this.checkSeatHandBack(snap);
      this.labAcc += dt;
      if (this.labAcc >= LOCAL_LAB_DT) { this.labAcc = 0; sim.setLabState(this.lab.getLabState()); }
    }

    if (this.net && this.peerPresent) {
      this.netAcc += dt;
      if (this.netAcc >= NET_SNAP_DT) {
        this.netAcc %= NET_SNAP_DT;
        this.net.sendGame({ k: GM.SNAP, s: sim.netSnapshot() });
      }
    }

    if (sim.rv.wrecked) this.onWrecked();
    // Rook's roof defence: DefendClient takes the camera while he is up there (not while the AI Rook is)
    this.defend?.update(this.paused ? 0 : dt, snap);
    this.syncRoofCamera();
    this.fp?.update(this.paused ? 0 : dt, snap, this._lastInput);
    this.hud.setMode?.(this.defend?.active ? 'roof' : this.shop ? 'shop' : this.inLab ? 'lab' : 'drive');
    this.hud.setLookCooldown?.(this.fp?.active ? this.fp.cooldown : null, { active: this.fp?.mode === 'look' });
    if (render) this.view.render(this.paused ? 0 : dt);

    if (!this.ended && (sim.phase === 'won' || sim.phase === 'lost')) {
      this.ended = true;
      const result = sim.result;
      if (this.net && this.peerPresent) {
        this.net.sendGame({ k: GM.SNAP, s: sim.netSnapshot() });
        this.net.sendGame({ k: GM.END, result });
      }
      setTimeout(() => { if (!this.destroyed) this.showEnd(result); }, endDelay(result));
    }
  }

  // The RV blew up (both roles, once): leave the cab / the lab so the outside wreck camera
  // (WorldView switches its rig to 'wreck') shows the explosion. In the lab Doc first gets the
  // flash + fire inside (VanLab3D), then the view pulls out.
  onWrecked() {
    if (this._wrecked || this.destroyed) return;
    this._wrecked = true;
    this.input?.clear();
    audio.horn?.(false);
    this.endShop();
    this.fp?.setActive(false);
    this.hud.setFirstPerson?.(false);
    if (this.van?.active) {
      this._wreckT = setTimeout(() => {
        if (this.destroyed || !this.van?.active) return;
        this.inLab = false;
        this.van.setActive(false);
        document.body.classList.remove('in-lab');
      }, 900);
    }
  }

  cookFrame(dt) {
    if (this.lastSnap) this.hud.update(this.lastSnap);  // events are processed once per snapshot object
    if (this.garage) {
      for (const c of this.garage.pollCommands(dt)) if (this.net && this.peerPresent) this.net.sendGame({ k: GM.CMD, c });
      if (this.lastSnap) this.garage.update(dt, this.lastSnap);
      if (this.garage.finished) { this.garage.destroy(); this.garage = null; this.van?.setActive(true); this.afterGarage(); }
    }
    this.updateCookShop(this.lastSnap, dt);
    this.hud.setMode?.(this.shop ? 'shop' : 'lab');
    if (this.lab) {
      this.lab.update(dt);
      this.labUI?.update(dt);
      this.van?.update(dt, this.lastSnap);
      this.labAcc += dt;
      if (this.labAcc >= NET_LAB_DT && this.net && this.peerPresent && !this.ended) {
        this.labAcc = 0;
        this.net.sendGame({ k: GM.LAB, l: this.lab.getLabState() });
      }
    }
    this.view.render(dt);
  }

  // ── garage → road ────────────────────────────────────────────────────────
  afterGarage() {
    if (this.destroyed || this.ended) return;
    if (this.mode === 'solo' && !this.demo) this.hud.toast(this.van ? 'Drive out — Tab goes cooking in the back' : 'Drive out — C looks around', 'info');
    else if (this.role === 'driver') this.hud.toast('Drive out — F defends when the cops close in', 'info');
    else this.hud.toast('Click to look around · walk to the Recipe Board', 'info');
  }

  // ── supply stops: Doc's shop run (first person, local) + Rook's DEFEND ────
  // Online the cook plays the run on his own computer (van.onShopRun → startShop). The host only runs it
  // when the player is Doc too: solo (right away when the stop parks — the AI Rook defends) or after the
  // cook left (takeover). The sim stays authoritative: shopEnter / shopDone / shopAbort, 90 s limit, bust rules.
  hostRunsShop() { return this.mode === 'solo' || this.localTakeover; }

  updateShop(snap, dt) {
    const st = snap.stop;
    if (this.shop && (!st || st.id !== this.shop.stopId || st.state !== 'shopping')) this.endShop();   // timed out / RV left
    if (!st || st.state !== 'shopping') { this._shopActiveFor = null; return; }
    if (!this.hostRunsShop()) return;
    if (this.autopilot && !this.input.manualRecently) return;   // the bot "shops" through its command sink
    if (!this.shop && st.doc === 'in' && this._shopActiveFor !== st.id && !this.inLab && !this.ended) {
      const def = this.data.route.stops.find((s) => s.id === st.id);
      if (def) this.startShop(def, 'auto');
    }
    this.shop?.update(this.paused ? 0 : dt);
  }

  updateCookShop(snap, dt) {
    const st = snap?.stop;
    if (this.shop && (!st || st.id !== this.shop.stopId || st.state !== 'shopping')) this.endShop();   // the host ended it (90 s)
    this.shop?.update(dt);
  }

  // how: 'auto' (solo host at a stop: Doc is out at once) · 'door' (VanLab3D: Doc walked to the side door + E)
  startShop(def, how = 'door') {
    if (!def || this.shop || this.ended || this._wrecked) return;
    this._shopActiveFor = def.id;
    const host = this.isHost;
    const send = (type, extra = {}) => {
      const c = { type, stopId: def.id, ...extra };
      if (host) this.sim.applyDriverCommand(c);
      else if (this.net && this.peerPresent) this.net.sendGame({ k: GM.CMD, c });
    };
    send(CMD.SHOP_ENTER);
    if (host) {
      if (this.inLab && how === 'auto') this.setInLab(false, `${def.name} — Doc jumps out`);
      this.input.clear();
      audio.horn?.(false);
      this.fp?.setActive(false);
      this.hud.setFirstPerson?.(false);
    }
    document.body.classList.add('in-shop');
    const shop = new ShopChallenge(this.view, def, this.data, {
      hudRoot: $('hud'), firstPerson: true,
      onProgress: (p) => this.lab?.setShopProgress?.(p ? { stopId: def.id, ...p } : null),
      onDone: (score) => { if (this.shop === shop) { send(CMD.SHOP_DONE, { score }); this.endShop(); } },
      onAbort: () => { if (this.shop === shop) { send(CMD.SHOP_ABORT); this.endShop(); } },
    });
    shop.stopId = def.id;
    this.shop = shop;
    this.hud.toast(`${def.name} — ${def.shop?.title || 'shop run'}`, 'info');
  }

  endShop() {
    if (!this.shop) return;
    const shop = this.shop;
    this.shop = null;
    try { shop.destroy(); } catch (e) { console.warn(e); }
    this.lab?.setShopProgress?.(null);
    document.body.classList.remove('in-shop');
    try { this.van?.returnFromShop?.(); } catch (e) { console.warn(e); }
    if (this.isHost && !this.inLab && !this._wrecked && !this.defend?.active) { this.fp?.setActive(true); this.hud.setFirstPerson?.(true); }
  }

  // F / the DEFEND button: Rook climbs onto the roof (the sim checks it's allowed: RV stopped, heat, a cop near)
  defendUp() {
    if (!this.isHost || this.ended || this.paused || this.garage || this.shop || this.inLab || this.defend?.active) return;
    const r = this.lastSnap?.roof;
    if (r?.active) return;
    const ok = this.sim.applyDriverCommand({ type: DCMD.DEFEND, on: true });
    if (!ok && r && !r.available) {
      const why = { moving: 'Stop the RV first', noHeat: 'Nobody to fight off — no heat', noCop: 'No cop close enough to fight', airborne: 'Not in mid-air!', cookDown: 'Not now' }[r.why];
      if (why) this.hud.toast(why, 'info');
    }
  }

  // DefendClient owns the camera while Rook is on the roof: first person off, back on when he's in the seat
  syncRoofCamera() {
    const on = !!this.defend?.active;
    if (on === !!this._roofCam) return;
    this._roofCam = on;
    this.input?.clear();
    audio.horn?.(false);
    if (on) { this.fp?.setActive(false); this.hud.setFirstPerson?.(false); }
    else if (!this.inLab && !this.shop && !this._wrecked && !this.garage) { this.fp?.setActive(true); this.hud.setFirstPerson?.(true); }
  }

  // ── end of game ──────────────────────────────────────────────────────────
  showEnd(result) {
    if (this._endShown) return;
    this._endShown = true;
    this.ended = true;
    this.hideOverlay();
    this.input?.clear();
    audio.horn?.(false);
    this.endShop();
    if (this.inLab) { this.inLab = false; this.van?.setActive(false); document.body.classList.remove('in-lab'); }
    if (this.mode === 'solo') {
      this.hud.showEnd(result, {
        canRestart: true, restartLabel: 'Drive again', menuLabel: 'Menu',
        onRestart: () => startGame({ mode: 'solo', role: 'driver', seed: params.has('seed') ? this.seed : randomSeed(), demo: this.demo, difficulty: this.difficulty }),
        onMenu: () => this.quitToMenu(),
      });
    } else {
      this.hud.showEnd(result, {
        canRestart: true, restartLabel: 'Back to room', menuLabel: 'Leave',
        onRestart: () => this.backToRoom(),
        onMenu: () => this.quitToMenu(),
      });
    }
  }

  backToRoom() {
    const net = this.net;
    this.destroy();
    session = null;
    openMenu({ net, resumeRoom: true });
  }

  quitToMenu() {
    const net = this.net;
    this.destroy();
    session = null;
    openMenu(net ? { net } : {});
  }

  // ── pause / notices ──────────────────────────────────────────────────────
  togglePause() {
    if (this.ended) return;
    if (this.mode === 'solo') {
      this.paused = !this.paused;
      this.input?.clear();
      if (this.paused) this.showPauseMenu(); else this.hideOverlay();
    } else if ($('overlay').hidden) this.showPauseMenu();
    else this.hideOverlay();
  }

  showPauseMenu() {
    const solo = this.mode === 'solo';
    const keys = this.isHost ? [
      ['W / ↑', 'Accelerate'], ['S / ↓', 'Brake / reverse'], ['A D / ← →', 'Steer'], ['Space', 'Handbrake'],
      ['H', 'Horn (scares pedestrians off the road)'], ['Q', 'Smoke bomb'], ['E', 'Oil slick'], ['Shift', 'Nitro'],
      ['C', 'Look around outside the RV (3 s, then a cool-down)'], ['Mouse', 'Turn your head in the cab'],
      ['F', 'Defend: Rook climbs onto the roof (RV stopped, cops close)'],
      ['On the roof', 'Mouse aims · click fires · right-click scope · R reload · 1–3 guns · 4–6 throwables · W / F climb down'],
      ['R', 'Reset if stuck'], ['On foot', 'WASD walk · Shift run · E use (hold at the suit rack) · Space jump'],
      ['Tab', this.van ? 'Swap seats: go cook in the back (AI drives)' : 'Show / hide the lab'], ['M', 'Mute'], ['P', 'Pause'],
      ...(solo ? [['At a stop', 'You play Doc\'s shop run in first person while the AI Rook defends the RV']] : []),
      ...(this.van ? [['— in the van —', ''], ['Mouse', 'Look around (click to capture the mouse)'], ['WASD', 'Walk'], ['E / click', 'Use what you look at · work the step'], ['Q', 'Step away'], ['V', 'Vent fan'], ['O', 'Cut-away overview']] : []),
    ] : this.van ? [
      ['Mouse', 'Look around (click to capture the mouse, Esc frees it)'], ['WASD / ↑↓←→', 'Walk Doc around the lab'], ['E / click', 'Use the station you look at · work the step'],
      ['Q', 'Step away from a station'], ['Drag', 'Cook on the props (stir, pour, turn the knob…)'], ['Tab', 'Recipe Board'], ['V', 'Vent fan'], ['O', 'Cut-away overview'],
      ['At a stop', 'Walk to the side door and press E for the shop run · hold Esc to give up'], ['M', 'Mute'], ['P', 'Menu'],
    ] : [
      ['Mouse / touch', 'Pick a recipe, then play each step'], ['V', 'Vent (clears fumes, but cops see smoke)'], ['C', 'Curtains (hide the lab from cops)'],
      ['X', 'Extinguisher'], ['= / −', 'Burner up / down'], ['M', 'Mute'],
    ];
    const need = this.data.route.sellPoint.requiredUnits;
    this.showNotice(solo ? 'Paused' : 'Menu',
      solo ? `Get to the drive-in at the end of the desert with ${need}+ bags, the RV in one piece and nobody busted.`
           : 'The game keeps running while this is open.',
      [
        { label: solo ? 'Resume' : 'Back to game', primary: true, onClick: () => this.togglePause() },
        ...(solo ? [{ label: 'Restart', onClick: () => startGame({ mode: 'solo', role: 'driver', seed: randomSeed(), difficulty: this.difficulty }) }] : []),
        { label: solo ? 'Quit to menu' : 'Leave game', onClick: () => this.quitToMenu() },
      ], keys);
  }

  showNotice(title, text, buttons, keys = null) {
    const ov = $('overlay');
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    ov.innerHTML = `<div class="ov-card" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <h2 class="ov-title">${esc(title)}</h2><p class="ov-sub">${esc(text)}</p>
      ${keys ? `<div class="ov-keys">${keys.map(([k, v]) => `<span><kbd>${esc(k)}</kbd></span><span>${esc(v)}</span>`).join('')}</div>` : ''}
      <div class="ov-btns">${buttons.map((b, i) => `<button type="button" class="ov-btn${b.primary ? ' primary' : ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div></div>`;
    ov.hidden = false;
    ov.querySelectorAll('button').forEach((el) => el.addEventListener('click', () => buttons[+el.dataset.i].onClick()));
    ov.querySelector('.ov-btn.primary')?.focus({ preventScroll: true });
  }

  hideOverlay() { const ov = $('overlay'); ov.hidden = true; ov.innerHTML = ''; }

  // ── pills: mute / pause / latency ────────────────────────────────────────
  buildPills() {
    const wrap = document.createElement('div');
    wrap.id = 'pills';
    wrap.innerHTML = `${this.net ? '<span class="pill static" data-p="lat">— ms</span>' : ''}
      <button type="button" class="pill" data-p="mute" tabindex="-1">${audio.muted ? 'SOUND OFF' : 'SOUND ON'}</button>
      <button type="button" class="pill" data-p="pause" tabindex="-1">${this.mode === 'solo' ? 'PAUSE' : 'MENU'}</button>`;
    $('viewWrap').appendChild(wrap);
    this.pills = wrap;
    wrap.querySelector('[data-p="mute"]').addEventListener('click', () => this.toggleMute());
    wrap.querySelector('[data-p="pause"]').addEventListener('click', () => this.togglePause());
    wrap.addEventListener('mousedown', (e) => e.preventDefault()); // never take keyboard focus
  }

  toggleMute() {
    audio.setMuted(!audio.muted);
    const b = this.pills?.querySelector('[data-p="mute"]');
    if (b) b.textContent = audio.muted ? 'SOUND OFF' : 'SOUND ON';
  }

  setLatency(ms, lost = false) {
    const p = this.pills?.querySelector('[data-p="lat"]');
    if (!p) return;
    p.textContent = lost ? 'OFFLINE' : ms == null ? '— ms' : `${ms} ms`;
    p.classList.toggle('bad', lost || ms > 180);
  }

  // ── keyboard ─────────────────────────────────────────────────────────────
  bindKeys() {
    const down = (e) => {
      if (this.destroyed || isTyping(e)) return;
      const code = e.code;
      if (code === 'KeyM' && !e.repeat && !this.shop) { this.toggleMute(); return; }
      // on foot first: the shop challenge (driver) or the garage tutorial (both roles)
      if (this.shop && $('overlay').hidden && this.shop.onKey(e, true)) { e.preventDefault(); return; }
      if (this.garage && !this.garage.finished && $('overlay').hidden && this.garage.onKey(e, true)) { e.preventDefault(); return; }
      // Rook on the roof: the roof client gets the keys (guns, reload, throw, W / F climbs down); P pauses
      if (this.defend?.active && !this.paused && $('overlay').hidden) {
        if (this.defend.onKey(e, true)) { e.preventDefault(); return; }
        if ((code === 'Escape' || code === 'KeyP') && !e.repeat) { e.preventDefault(); this.togglePause(); }
        if (code === 'Space' || code === 'Tab' || code.startsWith('Arrow')) e.preventDefault();
        return;
      }
      if (code === 'Tab' && (this.mode === 'solo' || this.localTakeover)) { e.preventDefault(); if (!e.repeat && !this.paused && !this.garage && !this.shop) this.toggleLabPanel(); return; }
      if (code === 'KeyC' && !e.repeat && this.fp && !this.van?.active && !this.shop && !this.paused) { e.preventDefault(); this.fp.lookAround(); return; }
      if (code === 'KeyF' && this.isHost && !this.van?.active && !this.shop && !this.garage && !this.paused && $('overlay').hidden) { e.preventDefault(); if (!e.repeat) this.defendUp(); return; }
      // 3D van active (online cook, or solo player in the back): the van gets the keys first
      if (this.van?.active && !this.paused && $('overlay').hidden) {
        if (this.van.onKey(e, true)) { e.preventDefault(); return; }
        if ((code === 'Escape' || code === 'KeyP') && !e.repeat) { e.preventDefault(); this.togglePause(); }
        if (code === 'Space' || code.startsWith('Arrow')) e.preventDefault();
        return;
      }
      if ((code === 'Escape' || code === 'KeyP') && !e.repeat) { e.preventDefault(); this.togglePause(); return; }
      if (!this.isHost || this.ended || this.paused) return;
      if (KEYMAP[code]) {
        e.preventDefault();
        this.input.press(KEYMAP[code]);
        if (KEYMAP[code] === 'horn' && !e.repeat) audio.horn?.(true);
      } else if (EDGEMAP[code] && !e.repeat) {
        e.preventDefault();
        this.input.edge(EDGEMAP[code]);
      }
    };
    const up = (e) => {
      if (this.shop && this.shop.onKey(e, false)) { e.preventDefault(); return; }
      if (this.defend?.active && this.defend.onKey(e, false)) { e.preventDefault(); return; }
      if (this.garage && !this.garage.finished && this.garage.onKey(e, false)) { e.preventDefault(); return; }
      if (this.van?.active && this.van.onKey(e, false)) { e.preventDefault(); return; }
      if (!this.isHost) return;
      if (KEYMAP[e.code]) { this.input.release(KEYMAP[e.code]); if (KEYMAP[e.code] === 'horn') audio.horn?.(false); }
    };
    const blur = () => { this.input?.clear(); this.garage?.clearKeys?.(); audio.horn?.(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    this._offs.push(() => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); });
  }

  // ── touch controls ───────────────────────────────────────────────────────
  buildTouch() {
    const root = $('touch');
    const btns = [
      ['tc-left', '◀', 'left'], ['tc-right', '▶', 'right'], ['tc-gas', 'GAS', 'up'], ['tc-brake', 'BRAKE', 'down'],
      ['tc-small tc-hb', 'DRIFT', 'handbrake'], ['tc-small tc-horn', 'HORN', 'horn'],
      ['tc-small tc-smoke', 'SMOKE', '!smoke'], ['tc-small tc-oil', 'OIL', '!oil'], ['tc-small tc-nitro', 'NITRO', '!nitro'],
    ];
    root.innerHTML = btns.map(([c, t]) => `<button type="button" tabindex="-1" class="tc ${c}">${t}</button>`).join('')
      + '<div id="rotate">Turn your phone sideways<br>for the best view</div>';
    root.querySelectorAll('.tc').forEach((el, i) => {
      const act = btns[i][2];
      const on = (e) => {
        e.preventDefault();
        el.setPointerCapture?.(e.pointerId);
        el.classList.add('on');
        if (act.startsWith('!')) this.input.edge(act.slice(1));
        else { this.input.press(act); if (act === 'horn') audio.horn?.(true); }
      };
      const off = (e) => {
        e.preventDefault();
        el.classList.remove('on');
        if (!act.startsWith('!')) { this.input.release(act); if (act === 'horn') audio.horn?.(false); }
      };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('lostpointercapture', off);
    });
  }

  // ── teardown ─────────────────────────────────────────────────────────────
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this._raf);
    clearTimeout(this._pickT);
    try { this.cookBot?.stop?.(); } catch { /* ignore */ }
    for (const off of this._offs) { try { off?.(); } catch { /* ignore */ } }
    this._offs = [];
    audio.horn?.(false);
    try { this.shop?.destroy(); } catch (e) { console.warn(e); }
    try { this.garage?.destroy(); } catch (e) { console.warn(e); }
    try { this.fp?.destroy(); } catch (e) { console.warn(e); }
    try { this.defend?.destroy(); } catch (e) { console.warn(e); }
    try { this.labUI?.destroy(); } catch (e) { console.warn(e); }
    try { this.van?.destroy(); } catch (e) { console.warn(e); }
    try { this.hud.destroy(); } catch (e) { console.warn(e); }
    try { this.view.destroy(); } catch (e) { console.warn(e); }
    this.pills?.remove();
    this.hideOverlay();
    $('lab').innerHTML = '';
    $('hud').innerHTML = '';
    $('touch').innerHTML = '';
    document.body.classList.remove('role-driver', 'role-cook', 'mode-solo', 'mode-online', 'lab-local', 'lab-hidden', 'lab3d', 'in-lab', 'in-shop');
    $('game').hidden = true;
  }
}

// ── go ──────────────────────────────────────────────────────────────────────
window.__bootProgress?.(1);
$('boot').classList.add('gone');
const urlDifficulty = params.get('difficulty');
if (params.has('demo')) startGame({ mode: 'solo', role: 'driver', seed: params.has('seed') ? +params.get('seed') : data.route.defaultSeed, demo: true, difficulty: urlDifficulty });
else if (params.has('solo')) startGame({ mode: 'solo', role: 'driver', seed: params.has('seed') ? +params.get('seed') : randomSeed(), difficulty: urlDifficulty });
else openMenu();

window.__cookrun = { data, audio, startGame, openMenu, get session() { return session; } };
