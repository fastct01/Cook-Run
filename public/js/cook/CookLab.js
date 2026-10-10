// CookLab — the Cook player's gameplay logic (no DOM). Ports 1:1 to a C# class:
//   new CookLab(data, { sendCommand, onEvent })
//   ApplySnapshot(snap) · Update(dt) · GetLabState() · + the UI-facing methods below.
//
// State machine (lab.state):
//   'idle' ──requestRecipe──▶ 'requesting' ──EV.RECIPE_OK──▶ 'running' ──last step──▶ 'done'   ──▶ 'idle'
//                               │  └─EV.RECIPE_DENIED / 5 s timeout ─▶ 'idle'      └─fail/abort─▶ 'failed' ─▶ 'idle'
//
// Commands sent (protocol.js CMD): START_RECIPE, RECIPE_DONE, RECIPE_FAIL, EXPLOSION, CALLOUT.
// Hazards (fumes / fire / curtains / vent) are simulated here and reported in LabState.
import { CMD, EV } from '../shared/protocol.js';
import { Rng, hashSeed } from '../sim/rng.js';
import { createMinigame, STEP_WEIGHTS } from './minigames/index.js';
import { stationForStep as _stationForStep } from './stations.js';

export const PRESENCE_MODES = Object.freeze(['any', 'station']);

export const LAB_STATES = Object.freeze({ IDLE: 'idle', REQUESTING: 'requesting', RUNNING: 'running', DONE: 'done', FAILED: 'failed' });

export const CALLOUTS = Object.freeze(['Slow down!', 'Hold it steady!', 'Pull over at the next stop!', 'Gadget ready!', 'Floor it!']);

const REQUEST_TIMEOUT = 5;      // s
const STEP_PAUSE = 1.1;         // s between steps (result stamp)
const RESULT_HOLD = 5;          // s the result card stays before returning to idle
const COOK_DOWN_SECONDS = 12;   // auto-recovery timer (display; host should restore 25 hp)
const COOK_RECOVER_HP = 25;
const EXTINGUISHER_CHARGES = 3;
const BEAT_AMOUNT = 0.18;
const SPRAY_AMOUNT = 0.6;
const AMBIENT_TEMP = 24;
const CALLOUT_COOLDOWN = 0.8;
const GROUPS = Object.freeze({ product: 'Products', gadget: 'Gadgets', repair: 'Repairs' });

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class CookLab {
  /**
   * @param {object} data  loadData() result { lab, route, rules } (or the lab.json object itself)
   * @param {object} opts  { sendCommand(cmd), onEvent?(type, data), seed? }
   */
  constructor(data, opts = {}) {
    this.data = data && data.lab ? data : { lab: data, route: {}, rules: {} };
    this.labData = this.data.lab;
    this.hazards = this.labData.hazards || {};
    this.product = this.labData.product || { id: 'glass', name: 'Product', unitName: 'bag', color: '#7fd6c2' };
    this.ingredients = this.labData.ingredients || {};
    this.recipes = this.labData.recipes || [];
    this.requiredUnits = this.data.route?.sellPoint?.requiredUnits ?? 6;
    this._send = opts.sendCommand || (() => {});
    this._listeners = new Set();
    if (opts.onEvent) this._listeners.add(opts.onEvent);
    this._seed = opts.seed ?? 1;
    this._reqCounter = 0;

    // ── host-provided view of the world ──
    this.inv = { mat: {}, units: 0, quality: 0, gadgets: { smoke: 0, oil: 0, nitro: 0 } };
    this.feel = { latAcc: 0, bump: 0, speed: 0, bumpHit: 0 };
    this._rawFeel = { latAcc: 0, bump: 0, speed: 0 };
    this._prevBump = 0;
    this._bumpCd = 0;
    this._pendingBump = 0;
    this.alert = { copClose: false, copDist: Infinity };
    this.crew = { driver: 100, cook: 100 };
    this.rvHp = 100;
    this.phase = null;

    // ── lab-local state ──
    this.state = LAB_STATES.IDLE;
    this.recipe = null;
    this.reqId = null;
    this._reqTimer = 0;
    this._staleReqs = new Map();   // reqId → 'timeout' | 'aborted'
    this.stepIndex = -1;
    this.current = null;           // active minigame instance
    this.stepScores = [];          // [{ type, label, score, weight }]
    this._pause = 0;               // pause between steps
    this.lastStep = null;          // { label, score } of the step just finished (for the stamp)
    this.result = null;            // { ok, recipeId, name, kind, quality, units, gadget, reason }
    this._resultT = 0;
    this.message = null;           // { text, tone, t }

    this.fumes = 0;
    this.fire = 0;
    this.ventOpen = false;
    this.curtainsClosed = false;
    this.extinguisher = EXTINGUISHER_CHARGES;
    this.extinguisherMax = EXTINGUISHER_CHARGES;
    this.temp = AMBIENT_TEMP;
    this._cookHurt = 0;

    this.cookDown = false;
    this.cookDownT = 0;
    this._downLatched = false;
    this._calloutCd = 0;
    this.t = 0;
    this.bumpFlash = 0;            // 1 → 0 after a big bump (UI marker)
    this.explodedFlash = 0;
    this._fireStartedBy = null;

    // ── station presence (3D van lab) ──
    // 'any'     = old behaviour (2D CookUI): input always reaches the minigame.
    // 'station' = Doc must stand at the step's station; away → input blocked and every
    //             step except `heat` pauses (the burner keeps burning while he's away).
    this.presenceMode = 'any';
    this.presence = null;          // station id Doc is working at (null = none)
  }

  // ═══ Events (UI / audio hooks) ═══════════════════════════════════════════════
  /** Subscribe to lab events: (type, data) => void. Returns an unsubscribe fn. */
  subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit(type, data = {}) { for (const fn of this._listeners) { try { fn(type, data); } catch (e) { console.error(e); } } }
  _toast(text, tone = 'info') { this.message = { text, tone, t: this.t }; this._emit('toast', { text, tone }); }

  // ═══ Host → lab ══════════════════════════════════════════════════════════════
  applySnapshot(snap) {
    if (!snap) return;
    if (snap.phase !== undefined) this.phase = snap.phase;
    if (snap.inv) {
      const inv = snap.inv;
      this.inv = {
        mat: { ...(inv.mat || {}) },
        units: inv.units ?? this.inv.units,
        quality: inv.quality ?? this.inv.quality,
        gadgets: { smoke: 0, oil: 0, nitro: 0, ...(inv.gadgets || {}) },
      };
    }
    if (snap.feel) {
      this._rawFeel.latAcc = +snap.feel.latAcc || 0;
      this._rawFeel.speed = +snap.feel.speed || 0;
      const b = +snap.feel.bump || 0;
      this._rawFeel.bump = b;
      // rising edge = a new bump impulse
      if (b > 0.2 && b - this._prevBump > 0.12) this._pendingBump = Math.max(this._pendingBump, b);
      this._prevBump = b;
    }
    if (snap.alert) this.alert = { copClose: !!snap.alert.copClose, copDist: snap.alert.copDist ?? Infinity };
    if (snap.rv && snap.rv.hp !== undefined) this.rvHp = snap.rv.hp;
    if (snap.crew) {
      this.crew = { ...this.crew, ...snap.crew };
      const downNow = (snap.crew.cook !== undefined && snap.crew.cook <= 0) || !!snap.crew.cookDown;
      if (downNow && !this._downLatched && !this.cookDown) this._knockOut();
      if (!downNow) {
        this._downLatched = false;
        if (this.cookDown && this.cookDownT < COOK_DOWN_SECONDS - 1) this._recover('host');
      }
    }
    for (const ev of snap.events || []) this._handleEvent(ev);
  }

  _handleEvent(ev) {
    switch (ev.type) {
      case EV.RECIPE_OK: {
        if (ev.reqId === this.reqId && this.state === LAB_STATES.REQUESTING) {
          this._startRunning();
        } else if (this._staleReqs.has(ev.reqId)) {
          const why = this._staleReqs.get(ev.reqId);
          this._staleReqs.delete(ev.reqId);
          if (why === 'timeout' && this.state === LAB_STATES.IDLE && !this.cookDown) {
            // late approval and we're free: just start it
            const r = this.recipes.find((x) => x.id === ev.recipeId);
            if (r) { this.recipe = r; this.reqId = ev.reqId; this._startRunning(); }
          } else {
            this._send({ type: CMD.RECIPE_FAIL, reqId: ev.reqId, recipeId: ev.recipeId, reason: why });
          }
        }
        break;
      }
      case EV.RECIPE_DENIED: {
        if (ev.reqId === this.reqId && this.state === LAB_STATES.REQUESTING) {
          this._toast(ev.reason ? `Can’t cook: ${ev.reason}` : 'Can’t cook that right now', 'bad');
          this._toIdle();
        }
        this._staleReqs.delete(ev.reqId);
        break;
      }
      case EV.STOP_DONE:
        if (this.extinguisher < this.extinguisherMax) {
          this.extinguisher = this.extinguisherMax;
          this._toast('Extinguisher refilled', 'good');
        }
        break;
      case EV.SPOTTED:
        this._toast('A cop saw the lab! Heat’s rising', 'bad');
        this._emit('spotted', {});
        break;
      case EV.LANDED:
        if (ev.hard) this._pendingBump = Math.max(this._pendingBump, 1);
        break;
      default: break;
    }
  }

  // ═══ Loop ════════════════════════════════════════════════════════════════════
  update(dt) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    this.t += dt;
    this._calloutCd = Math.max(0, this._calloutCd - dt);
    this.bumpFlash = Math.max(0, this.bumpFlash - dt * 1.8);
    this.explodedFlash = Math.max(0, this.explodedFlash - dt * 1.2);

    // smooth feel (snapshots arrive at ~15 Hz)
    const k = 1 - Math.exp(-dt * 10);
    this.feel.latAcc += (this._rawFeel.latAcc - this.feel.latAcc) * k;
    this.feel.speed += (this._rawFeel.speed - this.feel.speed) * k;
    this.feel.bump = Math.max(this._rawFeel.bump, this.feel.bump - dt * 2);
    this._bumpCd -= dt;
    this.feel.bumpHit = 0;
    if (this._pendingBump > 0) {
      if (this._bumpCd <= 0) {
        this.feel.bumpHit = this._pendingBump;
        this._bumpCd = 0.3;
        if (this._pendingBump >= 0.45) { this.bumpFlash = 1; this._emit('bump', { power: this._pendingBump }); }
      }
      this._pendingBump = 0;
    }

    // cook knocked out → countdown
    if (this.cookDown) {
      this.cookDownT -= dt;
      if (this.cookDownT <= 0) this._recover('timer');
    }

    switch (this.state) {
      case LAB_STATES.REQUESTING:
        this._reqTimer -= dt;
        if (this._reqTimer <= 0) {
          this._staleReqs.set(this.reqId, 'timeout');
          this._toast('No answer from the driver’s side — try again', 'bad');
          this._toIdle();
        }
        break;
      case LAB_STATES.RUNNING:
        this._updateRunning(dt);
        break;
      case LAB_STATES.DONE:
      case LAB_STATES.FAILED:
        this._resultT -= dt;
        if (this._resultT <= 0) this._toIdle();
        break;
      default: break;
    }

    this._updateHazards(dt);
  }

  _updateRunning(dt) {
    if (this._pause > 0) {
      this._pause -= dt;
      if (this._pause <= 0) this._nextStep();
      return;
    }
    const g = this.current;
    if (!g) return;
    // away from the station (presence mode 'station'): only the burner keeps going
    const paused = this.awayFromStation && g.type !== 'heat';
    if (!this.cookDown && !paused) g.update(dt, this.feel);
    if (g.type === 'heat') this.temp = g.temp;
    if (g.failed) { this._failBatch(g.failReason || 'ruined'); return; }
    if (g.done) {
      const weight = g.params.weight ?? STEP_WEIGHTS[g.type] ?? 1;
      this.stepScores.push({ type: g.type, label: g.label, score: g.score, weight });
      this.lastStep = { label: g.label, score: g.score, type: g.type };
      this._emit('stepDone', { index: this.stepIndex, type: g.type, score: g.score });
      if (this.stepIndex >= this.recipe.steps.length - 1) this._completeBatch();
      else this._pause = STEP_PAUSE;
    }
  }

  _updateHazards(dt) {
    const H = this.hazards;
    const g = this.state === LAB_STATES.RUNNING && this._pause <= 0 && !this.cookDown ? this.current : null;
    // fumes
    const rise = (g ? g.fumesPerSec : 0) + this.fire * 0.04;
    const decay = this.ventOpen ? (H.fumesDecayVentOpen ?? 0.12) : (H.fumesDecayVentClosed ?? 0.01);
    this.fumes = clamp(this.fumes + (rise - decay) * dt, 0, 1);
    // one-shot nudges so new players learn the vent trade-off
    if (this.fumes > 0.5 && !this.ventOpen && !this._fumeHint) { this._fumeHint = true; this._toast('Fumes building up — open the vent', 'bad'); }
    if (this.fumes < 0.3) this._fumeHint = false;
    if (this.fumes > (H.fumesHurtAbove ?? 0.75) && !this._fumeHurtHint) { this._fumeHurtHint = true; this._toast('Doc is choking on the fumes!', 'bad'); }
    if (this.fumes < (H.fumesHurtAbove ?? 0.75) - 0.1) this._fumeHurtHint = false;
    // burner temperature cools when no heat step is active
    if (!g || g.type !== 'heat') this.temp += (AMBIENT_TEMP - this.temp) * (1 - Math.exp(-dt * 0.35));
    // fire
    if (this.fire > 0) {
      this.fire += (H.fireGrowPerSec ?? 0.08) * dt;
      if (this.fire >= (H.fireExplodeAt ?? 1)) this._explode();
    }
    // damage to the cook (reported in LabState.cookHurt)
    if (!this.cookDown) {
      if (this.fumes > (H.fumesHurtAbove ?? 0.75)) this._cookHurt += (H.fumesCookDamagePerSec ?? 4) * dt;
      if (this.fire > 0.05) this._cookHurt += (H.fireCookDamagePerSec ?? 2) * dt;
    }
  }

  // ═══ Recipes ═════════════════════════════════════════════════════════════════
  /** Recipe list for the book: [{ id, kind, group, name, desc, needs:[{id,name,need,have,ok}], canMake, missing:[…], recipe }] */
  availableRecipes() {
    const mat = this.inv.mat || {};
    return this.recipes.map((r) => {
      const needs = Object.entries(r.needs || {}).map(([id, need]) => {
        const have = mat[id] || 0;
        return { id, name: this.ingredients[id]?.name || id, color: this.ingredients[id]?.color || '#ccc', need, have, ok: have >= need };
      });
      const missing = needs.filter((n) => !n.ok).map((n) => ({ id: n.id, name: n.name, short: n.need - n.have }));
      return {
        id: r.id, kind: r.kind, group: GROUPS[r.kind] || 'Other', name: r.name, desc: r.desc || '',
        gadget: r.gadget || null, units: r.units || 0, steps: (r.steps || []).length,
        needs, canMake: missing.length === 0, missing, recipe: r,
      };
    });
  }

  /** Why the cook can't start anything right now (null if free). */
  get blockedReason() {
    if (this.cookDown) return 'Doc is out cold';
    if (this.phase === 'won' || this.phase === 'lost') return 'The run is over';
    if (this.state === LAB_STATES.REQUESTING) return 'Waiting for the driver’s side…';
    if (this.state === LAB_STATES.RUNNING) return 'Finish the current batch first';
    return null;
  }
  get canStart() { return this.blockedReason === null; }

  /** Ask the host to start a recipe. Returns { ok, reason?, reqId? }. */
  requestRecipe(id) {
    const r = this.recipes.find((x) => x.id === id);
    if (!r) return { ok: false, reason: 'Unknown recipe' };
    if (!this.canStart) return { ok: false, reason: this.blockedReason || 'Busy' };
    const info = this.availableRecipes().find((x) => x.id === id);
    if (!info.canMake) {
      const m = info.missing.map((x) => `${x.short} ${x.name}`).join(', ');
      this._toast(`Missing ${m}`, 'bad');
      return { ok: false, reason: `Missing ${m}` };
    }
    this.result = null;
    this.recipe = r;
    this.reqId = `ck${(++this._reqCounter).toString(36)}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    this._reqTimer = REQUEST_TIMEOUT;
    this.state = LAB_STATES.REQUESTING;
    this._send({ type: CMD.START_RECIPE, reqId: this.reqId, recipeId: r.id });
    this._emit('requested', { recipeId: r.id, reqId: this.reqId });
    return { ok: true, reqId: this.reqId };
  }

  /** Cook dumps the current batch (UI asks for confirmation first). Ingredients are lost. */
  abortBatch() {
    if (this.state === LAB_STATES.REQUESTING) {
      this._staleReqs.set(this.reqId, 'aborted');
      this._toast('Request cancelled', 'info');
      this._toIdle();
      return true;
    }
    if (this.state !== LAB_STATES.RUNNING) return false;
    this._failBatch('aborted');
    return true;
  }

  _startRunning() {
    this.state = LAB_STATES.RUNNING;
    this.stepIndex = -1;
    this.stepScores = [];
    this.lastStep = null;
    this._rng = new Rng(hashSeed(this._seed, this._reqCounter, this.recipe.id.length * 131 + this.recipe.steps.length));
    this._emit('recipeStarted', { recipeId: this.recipe.id });
    this._nextStep();
  }

  _nextStep() {
    this._pause = 0;
    this.stepIndex++;
    const step = this.recipe.steps[this.stepIndex];
    const rng = this._rng;
    this.current = createMinigame(step, {
      hazards: this.hazards,
      product: this.product,
      material: this._materialFor(step, this.recipe),
      rand: () => rng.next(),
      emit: (type, d) => this._emit(type, { ...d, step: this.stepIndex }),
      toast: (text, tone) => this._toast(text, tone),
      startFire: (amt) => this.startFire(amt, 'overheat'),
    });
    this._emit('stepStarted', { index: this.stepIndex, type: step.type, label: step.label });
  }

  _materialFor(step, recipe) {
    const ids = Object.keys(this.ingredients);
    if (step.material && this.ingredients[step.material]) return { id: step.material, ...this.ingredients[step.material] };
    const lbl = (step.label || '').toLowerCase();
    for (const id of ids) {
      const words = [id, ...(this.ingredients[id].name || '').toLowerCase().split(/\s+/)].filter((w) => w.length > 2 && w !== 'bag' && w !== 'of');
      if (words.some((w) => lbl.includes(w))) return { id, ...this.ingredients[id] };
    }
    const prefs = {
      grind: ['salts', 'ice', 'catalyst'], measure: ['solvent', 'syrup', 'fuel', 'salts'], heat: ['syrup', 'solvent', 'fuel', 'salts'],
      stir: ['catalyst', 'syrup', 'solvent', 'salts'], cool: ['ice'], break: [this.product.id], hammer: ['scrap'],
    }[step.type] || [];
    const needs = recipe.needs || {};
    const pick = prefs.find((id) => needs[id] && this.ingredients[id]) || prefs.find((id) => this.ingredients[id]);
    if (pick) return { id: pick, ...this.ingredients[pick] };
    return { id: this.product.id, name: this.product.name, color: this.product.color };
  }

  get qualitySoFar() {
    if (!this.stepScores.length) return null;
    let s = 0, w = 0;
    for (const x of this.stepScores) { s += x.score * x.weight; w += x.weight; }
    return w > 0 ? s / w : 0;
  }

  _completeBatch() {
    const quality = Math.round(clamp(this.qualitySoFar ?? 0, 0, 1) * 1000) / 1000;
    const r = this.recipe;
    this._send({ type: CMD.RECIPE_DONE, reqId: this.reqId, recipeId: r.id, quality });
    this.result = { ok: true, recipeId: r.id, name: r.name, kind: r.kind, gadget: r.gadget || null, units: r.units || 0, repair: r.repair || null, quality, steps: this.stepScores.slice() };
    this.state = LAB_STATES.DONE;
    this._resultT = RESULT_HOLD;
    this.current = null;
    this._emit('recipeDone', this.result);
  }

  _failBatch(reason) {
    const r = this.recipe;
    if (!r) return;
    this._send({ type: CMD.RECIPE_FAIL, reqId: this.reqId, recipeId: r.id, reason });
    this.result = { ok: false, recipeId: r.id, name: r.name, kind: r.kind, reason, steps: this.stepScores.slice() };
    this.state = LAB_STATES.FAILED;
    this._resultT = RESULT_HOLD;
    this.current = null;
    this._pause = 0;
    this._emit('recipeFailed', this.result);
  }

  _toIdle() {
    this.state = LAB_STATES.IDLE;
    this.current = null;
    this.stepIndex = -1;
    this._pause = 0;
    this.reqId = null;
    this._emit('idle', {});
  }

  /** Dismiss the done/failed card immediately. */
  dismissResult() { if (this.state === LAB_STATES.DONE || this.state === LAB_STATES.FAILED) this._toIdle(); }

  // ═══ Step accessors ══════════════════════════════════════════════════════════
  /** { index, count, type, label, instructions, progress, score, paused, lastStep } or null */
  get currentStep() {
    if (this.state !== LAB_STATES.RUNNING || !this.recipe) return null;
    const g = this.current;
    return {
      index: this.stepIndex,
      count: this.recipe.steps.length,
      type: g?.type ?? null,
      label: g?.label ?? '',
      instructions: g ? g.instructions : '',
      progress: g ? g.progress : 0,
      score: g ? g.score : 0,
      paused: this._pause > 0,
      next: this._pause > 0 ? this.recipe.steps[this.stepIndex + 1]?.label : null,
      lastStep: this.lastStep,
    };
  }
  getCurrentStep() { return this.currentStep; }
  get cooking() { return this.state === LAB_STATES.RUNNING; }

  // ═══ Lab controls ════════════════════════════════════════════════════════════
  toggleVent(force) {
    if (this.cookDown) return this.ventOpen;
    this.ventOpen = typeof force === 'boolean' ? force : !this.ventOpen;
    this._emit('vent', { open: this.ventOpen });
    return this.ventOpen;
  }
  toggleCurtains(force) {
    if (this.cookDown) return this.curtainsClosed;
    this.curtainsClosed = typeof force === 'boolean' ? force : !this.curtainsClosed;
    this._emit('curtains', { closed: this.curtainsClosed });
    return this.curtainsClosed;
  }
  /** True while a cop is alongside, we're cooking and the curtains are open. */
  get copAlarm() { return !!this.alert.copClose && this.cooking && !this.curtainsClosed; }
  /** Vent open while cooking → visible smoke (host raises heat). */
  get smokeVisible() { return this.ventOpen && (this.cooking || this.fumes > 0.08 || this.fire > 0); }

  startFire(amount = 0.12, source = 'overheat') {
    if (this.fire <= 0) {
      this.fire = clamp(amount, 0.05, 1);
      this._fireStartedBy = source;
      this._toast('FIRE! Beat it out or grab the extinguisher', 'bad');
      this._emit('fireStarted', { source });
    } else {
      this.fire = clamp(this.fire + amount * 0.25, 0, 1);
    }
  }

  /** Where the flames are, in minigame-focus coords (for hit tests / drawing). */
  fireArea() {
    return { x: 0.34, y: 0.72, r: 0.12 + this.fire * 0.12, active: this.fire > 0 };
  }

  /**
   * Beat the flames (each call −0.18). With (nx, ny) in focus coords the hit is only
   * counted inside fireArea(); without coordinates it always counts.
   * Returns true if it hit the fire.
   */
  extinguish(nx, ny) {
    if (this.fire <= 0 || this.cookDown) return false;
    if (nx !== undefined && ny !== undefined) {
      const a = this.fireArea();
      const d = Math.hypot((nx - a.x) * (4 / 3), ny - a.y);
      if (d > a.r + 0.06) return false;
    }
    this._reduceFire(BEAT_AMOUNT, 'beat');
    return true;
  }

  /** Spray the extinguisher (3 charges, −0.6). Returns false when empty or no fire. */
  useExtinguisher() {
    if (this.cookDown || this.extinguisher <= 0) return false;
    if (this.fire <= 0) { this._toast('No fire to put out', 'info'); return false; }
    this.extinguisher--;
    this._reduceFire(SPRAY_AMOUNT, 'spray');
    return true;
  }

  _reduceFire(amt, how) {
    this.fire = Math.max(0, this.fire - amt);
    this._emit('extinguish', { how, fire: this.fire });
    if (this.fire <= 0) { this.fire = 0; this._toast('Fire’s out', 'good'); this._emit('fireOut', {}); }
  }

  _explode() {
    this._send({ type: CMD.EXPLOSION, power: 1 });
    this.fire = 0;
    this.fumes = clamp(this.fumes + 0.3, 0, 1);
    this.explodedFlash = 1;
    this.bumpFlash = 1;
    this._toast('BOOM! The lab blew up', 'bad');
    this._emit('explosion', { power: 1 });
    if (this.state === LAB_STATES.RUNNING) this._failBatch('explosion');
  }

  /** Quick callout to the driver. */
  callout(text) {
    if (!text || this._calloutCd > 0) return false;
    this._calloutCd = CALLOUT_COOLDOWN;
    this._send({ type: CMD.CALLOUT, text: String(text).slice(0, 60) });
    this._emit('callout', { text });
    return true;
  }

  // ═══ Cook down ═══════════════════════════════════════════════════════════════
  _knockOut() {
    this.cookDown = true;
    this._downLatched = true;
    this.cookDownT = COOK_DOWN_SECONDS;
    if (this.current) this.current.pointerUp?.();
    this._toast('Doc passed out!', 'bad');
    this._emit('cookDown', { seconds: COOK_DOWN_SECONDS });
  }
  _recover(why) {
    if (!this.cookDown) return;
    this.cookDown = false;
    this.cookDownT = 0;
    this._emit('cookRecovered', { hp: COOK_RECOVER_HP, by: why });
  }
  get cookDownSeconds() { return COOK_DOWN_SECONDS; }
  get cookRecoverHp() { return COOK_RECOVER_HP; }

  // ═══ Station presence (3D van lab) ═══════════════════════════════════════════
  /** 'any' (default, 2D UI: no presence needed) | 'station' (Doc must be at the step's station). */
  setPresenceMode(mode) {
    const m = mode === 'station' ? 'station' : 'any';
    if (m === this.presenceMode) return m;
    const wasAway = this.awayFromStation;
    this.presenceMode = m;
    if (!wasAway && this.awayFromStation) this._releaseInput();
    this._emit('presence', { mode: m, station: this.presence, away: this.awayFromStation });
    return m;
  }
  /** Station id Doc is working at right now, or null when he walks off / isn't working. */
  setPresence(stationId) {
    const s = stationId || null;
    if (s === this.presence) return;
    const wasAway = this.awayFromStation;
    this.presence = s;
    if (!wasAway && this.awayFromStation) this._releaseInput();
    this._emit('presence', { mode: this.presenceMode, station: s, away: this.awayFromStation });
  }
  /** Station id for a step type (STEP_STATION in cook/stations.js), null for unknown. */
  stationForStep(type) { return _stationForStep(type); }
  /** Station of the step being worked — or, during the pause between steps, of the next one. null when not cooking. */
  get stepStation() {
    if (this.state !== LAB_STATES.RUNNING || !this.recipe) return null;
    if (this._pause > 0) return _stationForStep(this.recipe.steps[this.stepIndex + 1]?.type);
    return this.current ? _stationForStep(this.current.type) : null;
  }
  /** True in 'station' mode while a step runs and Doc is not at its station. Always false in 'any' mode. */
  get awayFromStation() {
    if (this.presenceMode !== 'station') return false;
    if (this.state !== LAB_STATES.RUNNING || !this.current) return false;
    return this.presence !== _stationForStep(this.current.type);
  }
  _releaseInput() {
    const g = this.current;
    if (g && g.pointer?.down) g.pointerUp();
  }

  // ═══ Input forwarding (normalised focus-area coords) ═════════════════════════
  get inputEnabled() { return !this.cookDown && this.state === LAB_STATES.RUNNING && this._pause <= 0 && !!this.current && !this.awayFromStation; }
  pointerDown(nx, ny) {
    if (this.cookDown) return false;
    // 2D UI: clicking the flames in the focus area beats them. In 'station' mode the 3D van
    // handles the fire itself (extinguish()/useExtinguisher()), so focus coords never hit it.
    if (this.presenceMode === 'any' && this.fire > 0 && this.extinguish(nx, ny)) return 'fire';
    if (!this.inputEnabled) return false;
    this.current.pointerDown(nx, ny);
    return true;
  }
  pointerMove(nx, ny) { if (this.inputEnabled) this.current.pointerMove(nx, ny); }
  pointerUp(nx, ny) { if (this.current) this.current.pointerUp(nx, ny); }
  key(code) { return this.inputEnabled ? !!this.current.key(code) : false; }

  // ═══ Lab → host ══════════════════════════════════════════════════════════════
  /**
   * LabState exactly as protocol.js. `cookHurt` is hp lost since the previous call,
   * so call this once per network send (6 Hz). Pass { peek: true } to read without draining.
   */
  getLabState(opts = {}) {
    const hurt = Math.round(this._cookHurt * 100) / 100;
    if (!opts.peek) this._cookHurt = 0;
    const g = this.current;
    return {
      cooking: this.state === LAB_STATES.RUNNING,
      recipeId: this.state === LAB_STATES.RUNNING || this.state === LAB_STATES.REQUESTING ? this.recipe?.id ?? null : null,
      step: this.state === LAB_STATES.RUNNING ? this.stepIndex : -1,
      stepType: this.state === LAB_STATES.RUNNING && g ? g.type : null,
      temp: Math.round(this.temp * 10) / 10,
      fumes: Math.round(this.fumes * 1000) / 1000,
      fire: Math.round(this.fire * 1000) / 1000,
      ventOpen: this.ventOpen,
      curtains: this.curtainsClosed,
      cookHurt: hurt,
    };
  }
}
