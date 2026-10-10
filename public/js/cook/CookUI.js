// CookUI — DOM + canvas view for CookLab. Builds everything inside `containerEl`
// and never touches anything outside it (no global styles, no focus stealing).
//
//   const ui = new CookUI(lab, containerEl, { compact: false, hotkeys: !compact });
//   ui.update(dt)        // every animation frame (after lab.update)
//   ui.setCompact(bool)  // switch layouts live
//   ui.destroy()
//
// The container must have a definite size (the UI fills 100% × 100% of it).
// Unity port: CookUI ≈ a UI Toolkit document; LabScene ≈ the diorama camera; the
// canvas minigame view ≈ a RenderTexture panel that forwards pointer events.
import { THEME } from './theme.js';
import { LabScene } from './LabScene.js';
import { ICONS, ingredientIcon, stepIcon } from './icons.js';
import { CALLOUTS, LAB_STATES } from './CookLab.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pct = (v) => `${Math.round(clamp(v, 0, 1) * 100)}%`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
function btn(cls, html, title) {
  const b = el('button', cls, html);
  b.type = 'button';
  b.tabIndex = -1;            // never take keyboard focus
  if (title) b.title = title;
  return b;
}

const KEY_LABEL = { KeyQ: 'Q', KeyE: 'E', ShiftLeft: 'Shift', ShiftRight: 'Shift', Space: 'Space' };
const GADGET_ICON = { smoke: 'smoke', oil: 'oil', nitro: 'nitro' };
const GADGET_NAME = { smoke: 'Smoke', oil: 'Oil', nitro: 'Nitro' };
const STEP_NAME = { grind: 'Grind', measure: 'Measure', heat: 'Heat', stir: 'Stir', cool: 'Cool', break: 'Break', hammer: 'Hammer' };

export class CookUI {
  /**
   * @param {CookLab} lab
   * @param {HTMLElement} containerEl
   * @param {object} opts { compact?: bool, hotkeys?: bool (default !compact), maxDpr?: number }
   */
  constructor(lab, containerEl, opts = {}) {
    this.lab = lab;
    this.container = containerEl;
    this.opts = opts;
    this.compact = !!opts.compact;
    this.hotkeys = opts.hotkeys ?? !this.compact;
    this.maxDpr = opts.maxDpr ?? 1.75;
    this.scene = new LabScene();
    this._sig = {};
    this._toasts = [];
    this._wob = { x: 0, y: 0, r: 0 };
    this._drawerOpen = false;
    this._menuOpen = false;
    this._confirm = false;
    this._resultShownFor = null;
    this._lastSize = { w: 0, h: 0 };
    this._handlers = [];
    this._build();
    this._bind();
    this._unsub = lab.subscribe((type, d) => this._onLabEvent(type, d));
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(this.container);
    this.resize();
    this._renderBook(true);
  }

  // ═══ DOM construction ════════════════════════════════════════════════════════
  _build() {
    const lab = this.lab;
    const root = this.root = el('div', 'cook-ui');
    root.setAttribute('data-cook-ui', '');
    root.innerHTML = `
      <div class="ck-shell">
        <header class="ck-head">
          <button type="button" tabindex="-1" class="ck-book-toggle" title="Recipe book">${ICONS.book()}<span>Recipes</span></button>
          <div class="ck-batch">
            <div class="ck-batch-name">Lab ready</div>
            <div class="ck-step-label">Pick a recipe to start a batch</div>
          </div>
          <div class="ck-dots"></div>
          <div class="ck-quality" hidden><span>Quality</span><b>—</b></div>
          <button type="button" tabindex="-1" class="ck-abort" hidden title="Dump the current batch">${ICONS.trash()}<span>Dump batch</span></button>
        </header>
        <aside class="ck-left">
          <div class="ck-book-scroll">
            <div class="ck-book"></div>
          </div>
          <section class="ck-pantry">
            <h3 class="ck-h">Pantry</h3>
            <div class="ck-pantry-grid"></div>
          </section>
        </aside>
        <div class="ck-toolbar">
          <button type="button" tabindex="-1" class="ck-menu-btn" title="Recipes">
            <span class="ck-menu-label">Recipes</span><span class="ck-menu-sub"></span>${ICONS.chevron()}
          </button>
          <button type="button" tabindex="-1" class="ck-tb ck-tb-vent" title="Vent (smoke is visible to cops)">${ICONS.vent()}</button>
          <button type="button" tabindex="-1" class="ck-tb ck-tb-curtains" title="Curtains">${ICONS.curtains()}</button>
          <button type="button" tabindex="-1" class="ck-tb ck-tb-ext" title="Extinguisher">${ICONS.extinguisher()}<b class="ck-tb-count">3</b></button>
          <div class="ck-tb-bars">
            <div class="ck-tb-bar ck-tb-fumes"><i>${ICONS.fumes()}</i><span><em></em></span></div>
            <div class="ck-tb-bar ck-tb-fire"><i>${ICONS.fire()}</i><span><em></em></span></div>
          </div>
          <div class="ck-tb-units" title="Product bagged">${ICONS.bag()}<b>0</b></div>
        </div>
        <main class="ck-stage">
          <div class="ck-scene">
            <canvas class="ck-canvas"></canvas>
          </div>
          <div class="ck-alarm" hidden><span>COP ALONGSIDE — CLOSE THE CURTAINS!</span></div>
          <div class="ck-smoke" hidden>${ICONS.smoke()}<span class="ck-smoke-long">Smoke is visible — cops will notice</span><span class="ck-smoke-short">Smoke visible</span></div>
          <div class="ck-bump" aria-hidden="true">BUMP!</div>
          <div class="ck-toasts"></div>
          <div class="ck-result" hidden></div>
          <div class="ck-down" hidden>
            <div class="ck-down-card">
              <div class="ck-down-title">Doc passed out!</div>
              <div class="ck-down-sub">Fumes and burns caught up with him. He’ll come round in</div>
              <div class="ck-down-count">12</div>
              <div class="ck-down-note">Open the vent next time the air turns yellow.</div>
            </div>
          </div>
          <div class="ck-confirm" hidden>
            <div class="ck-confirm-card">
              <div class="ck-confirm-title">Dump this batch?</div>
              <div class="ck-confirm-sub">The ingredients are gone either way.</div>
              <div class="ck-confirm-row">
                <button type="button" tabindex="-1" class="ck-btn ck-btn-ghost ck-confirm-no">Keep cooking</button>
                <button type="button" tabindex="-1" class="ck-btn ck-btn-danger ck-confirm-yes">Dump it</button>
              </div>
            </div>
          </div>
          <div class="ck-menu" hidden><div class="ck-menu-list"></div></div>
        </main>
        <aside class="ck-right">
          <section class="ck-sec ck-air">
            <div class="ck-gauge ck-g-fumes">
              <div class="ck-g-top">${ICONS.fumes()}<span>Fumes</span><b>0%</b></div>
              <div class="ck-g-bar"><em></em><i class="ck-g-mark"></i></div>
            </div>
            <div class="ck-gauge ck-g-temp">
              <div class="ck-g-top">${ICONS.thermo()}<span>Burner</span><b>24°</b></div>
              <div class="ck-g-bar"><u></u><em></em></div>
            </div>
            <div class="ck-gauge ck-g-fire">
              <div class="ck-g-top">${ICONS.fire()}<span>Fire</span><b>None</b></div>
              <div class="ck-g-bar"><em></em></div>
            </div>
          </section>
          <section class="ck-sec ck-controls">
            <div class="ck-toggles">
              <button type="button" tabindex="-1" class="ck-toggle ck-vent">${ICONS.vent()}<b>VENT</b><span>Closed</span></button>
              <button type="button" tabindex="-1" class="ck-toggle ck-curtains">${ICONS.curtains()}<b>CURTAINS</b><span>Open</span></button>
            </div>
            <button type="button" tabindex="-1" class="ck-ext">${ICONS.extinguisher()}<b>Extinguisher</b><span class="ck-pips"></span></button>
          </section>
          <section class="ck-sec ck-haul">
            <div class="ck-haul-top">${ICONS.bag()}<div><b class="ck-units">0 / 6</b><span class="ck-units-sub">bags for the buyer</span></div><em class="ck-avgq">—</em></div>
            <div class="ck-g-bar ck-units-bar"><em></em></div>
            <div class="ck-gadgets"></div>
          </section>
          <section class="ck-sec ck-calls">
            <h3 class="ck-h">Shout to the driver</h3>
            <div class="ck-call-list"></div>
          </section>
          <section class="ck-sec ck-hp">
            <div class="ck-g-top">${ICONS.hp()}<span>Doc</span><b>100</b></div>
            <div class="ck-g-bar"><em></em></div>
          </section>
        </aside>
      </div>`;
    this.container.appendChild(root);
    const q = (s) => root.querySelector(s);
    this.$ = {
      shell: q('.ck-shell'), head: q('.ck-head'), batchName: q('.ck-batch-name'), stepLabel: q('.ck-step-label'),
      dots: q('.ck-dots'), quality: q('.ck-quality'), qualityVal: q('.ck-quality b'), abort: q('.ck-abort'),
      bookToggle: q('.ck-book-toggle'), left: q('.ck-left'), book: q('.ck-book'), pantry: q('.ck-pantry-grid'),
      stage: q('.ck-stage'), scene: q('.ck-scene'), canvas: q('.ck-canvas'), alarm: q('.ck-alarm'), smoke: q('.ck-smoke'),
      bump: q('.ck-bump'), toasts: q('.ck-toasts'), result: q('.ck-result'), down: q('.ck-down'), downCount: q('.ck-down-count'),
      confirm: q('.ck-confirm'), confirmYes: q('.ck-confirm-yes'), confirmNo: q('.ck-confirm-no'),
      menu: q('.ck-menu'), menuList: q('.ck-menu-list'), menuBtn: q('.ck-menu-btn'), menuSub: q('.ck-menu-sub'), menuLabel: q('.ck-menu-label'),
      tbVent: q('.ck-tb-vent'), tbCurtains: q('.ck-tb-curtains'), tbExt: q('.ck-tb-ext'), tbExtCount: q('.ck-tb-count'),
      tbFumes: q('.ck-tb-fumes'), tbFire: q('.ck-tb-fire'), tbUnits: q('.ck-tb-units b'),
      right: q('.ck-right'),
      gFumes: q('.ck-g-fumes'), gTemp: q('.ck-g-temp'), gFire: q('.ck-g-fire'),
      vent: q('.ck-vent'), curtains: q('.ck-curtains'), ext: q('.ck-ext'), pips: q('.ck-pips'),
      units: q('.ck-units'), unitsBar: q('.ck-units-bar em'), avgq: q('.ck-avgq'), gadgets: q('.ck-gadgets'),
      calls: q('.ck-call-list'), hp: q('.ck-hp'),
    };
    this.canvas = this.$.canvas;
    this.ctx = this.canvas.getContext('2d');

    // callouts
    for (const text of CALLOUTS) {
      const b = btn('ck-call', `${ICONS.megaphone()}<span>${esc(text)}</span>`);
      b.dataset.callout = text;
      this.$.calls.appendChild(b);
    }
    // gadgets
    const keys = lab.data.rules?.gadgets || {};
    for (const gid of ['smoke', 'oil', 'nitro']) {
      const k = KEY_LABEL[keys[gid]?.key] || '';
      const c = el('div', `ck-gadget ck-gadget-${gid}`, `${ICONS[GADGET_ICON[gid]]()}<span>${GADGET_NAME[gid]}</span><b>0</b>${k ? `<kbd>${k}</kbd>` : ''}`);
      c.dataset.gadget = gid;
      this.$.gadgets.appendChild(c);
    }
    // extinguisher pips
    this.$.pips.innerHTML = Array.from({ length: lab.extinguisherMax }, () => '<i></i>').join('');
    this._applyModeClass();
  }

  _applyModeClass() {
    const c = !!(this.compact || this._autoCompact);
    this.root.classList.toggle('ck-compact', c);
    this.root.classList.toggle('ck-full', !c);
  }

  /** Switch between the full panel and the compact docked panel. */
  setCompact(on) {
    this.compact = !!on;
    if (this.opts.hotkeys === undefined) this.hotkeys = !this.compact;
    this._menuOpen = false;
    this._drawerOpen = false;
    this._applyModeClass();
    this.resize();
    this._renderBook(true);
  }
  get isCompact() { return this.compact || !!this._autoCompact; }

  // ═══ events ══════════════════════════════════════════════════════════════════
  _on(target, type, fn, opts) { target.addEventListener(type, fn, opts); this._handlers.push([target, type, fn, opts]); }

  _bind() {
    const root = this.root, lab = this.lab, $ = this.$;
    // Never let a click move keyboard focus into the panel (driver keeps WASD/Space/Shift).
    this._on(root, 'mousedown', (e) => {
      const t = e.target;
      if (t.closest && (t.closest('button') || t.closest('canvas') || t.closest('.ck-card') || t.closest('.ck-gadget'))) e.preventDefault();
    });
    this._on(root, 'focusin', (e) => { if (e.target && e.target.blur) e.target.blur(); });

    // canvas pointer input
    const cv = this.canvas;
    this._on(cv, 'pointerdown', (e) => this._pointer('down', e));
    this._on(cv, 'pointermove', (e) => this._pointer('move', e));
    this._on(cv, 'pointerup', (e) => this._pointer('up', e));
    this._on(cv, 'pointercancel', (e) => this._pointer('up', e));
    this._on(cv, 'lostpointercapture', (e) => this._pointer('up', e));
    this._on(cv, 'contextmenu', (e) => e.preventDefault());

    // clicks (delegated)
    this._on(root, 'click', (e) => {
      const t = e.target.closest('button, .ck-gadget, .ck-result');
      if (!t || !root.contains(t)) return;
      if (t.matches('.ck-cook')) { this._cook(t.dataset.id); return; }
      if (t.matches('.ck-call')) { if (lab.callout(t.dataset.callout)) this._flashBtn(t); return; }
      if (t === $.vent || t === $.tbVent) { lab.toggleVent(); return; }
      if (t === $.curtains || t === $.tbCurtains) { lab.toggleCurtains(); return; }
      if (t === $.ext || t === $.tbExt) { lab.useExtinguisher(); return; }
      if (t === $.abort) { if (lab.state === LAB_STATES.REQUESTING) lab.abortBatch(); else this._confirm = true; return; }
      if (t === $.confirmNo) { this._confirm = false; return; }
      if (t === $.confirmYes) { this._confirm = false; lab.abortBatch(); return; }
      if (t === $.bookToggle) { this._drawerOpen = !this._drawerOpen; return; }
      if (t === $.menuBtn) { this._menuOpen = !this._menuOpen; this._renderBook(true); return; }
      if (t.matches('.ck-menu-abort')) { this._menuOpen = false; if (lab.state === LAB_STATES.REQUESTING) lab.abortBatch(); else this._confirm = true; return; }
      if (t.matches('.ck-result')) { lab.dismissResult(); return; }
      if (t.matches('.ck-menu-close')) { this._menuOpen = false; return; }
    });
    // close popovers by tapping the stage background
    this._on($.menu, 'pointerdown', (e) => { if (e.target === $.menu) { this._menuOpen = false; e.preventDefault(); } });

    {
      // Optional lab hotkeys (V vent, C curtains, X extinguisher, +/- burner). Off by default in
      // compact/solo mode so the driver's keys are never touched. Bound once; checks this.hotkeys live.
      this._on(window, 'keydown', (e) => {
        if (!this.hotkeys || this.lab.cookDown) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        if (e.repeat) return;
        let used = true;
        switch (e.code) {
          case 'KeyV': lab.toggleVent(); break;
          case 'KeyC': lab.toggleCurtains(); break;
          case 'KeyX': lab.useExtinguisher(); break;
          default: used = lab.key(e.code);
        }
        if (used) e.preventDefault();
      });
    }
  }

  _pointer(kind, e) {
    const lab = this.lab;
    const r = this.canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const f = this.scene.toFocus(px, py);
    const L = this.scene.layout;
    if (kind === 'down') {
      e.preventDefault();
      if (this._menuOpen) { this._menuOpen = false; return; }
      try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      this._activePointer = e.pointerId;
      if (lab.cookDown) return;
      const insideFocus = L && px >= L.fx && px <= L.fx + L.fw && py >= L.fy && py <= L.fy + L.fh;
      const hs = this.scene.hitHotspot(px, py);
      if (hs && (!insideFocus || !lab.inputEnabled)) {
        if (hs === 'curtains') lab.toggleCurtains();
        else if (hs === 'vent') lab.toggleVent();
        else if (hs === 'extinguisher') lab.useExtinguisher();
        this._activePointer = null;
        return;
      }
      lab.pointerDown(f.x, f.y);
    } else if (kind === 'move') {
      if (this._activePointer != null && e.pointerId !== this._activePointer) return;
      if (e.pointerType !== 'mouse' && this._activePointer == null) return;
      lab.pointerMove(f.x, f.y);
      this._hover = { px, py, f };
    } else {
      if (this._activePointer == null || e.pointerId !== this._activePointer) return;
      this._activePointer = null;
      lab.pointerUp(f.x, f.y);
    }
  }

  _cook(id) {
    const res = this.lab.requestRecipe(id);
    if (res.ok) { this._menuOpen = false; this._drawerOpen = false; }
    this._renderBook(true);
  }

  _flashBtn(b) {
    b.classList.remove('is-sent'); void b.offsetWidth; b.classList.add('is-sent');
  }

  _onLabEvent(type, d) {
    if (type === 'toast') this._toast(d.text, d.tone);
    else if (type === 'bump') {
      const b = this.$.bump;
      b.classList.remove('is-on'); void b.offsetWidth; b.classList.add('is-on');
      this._kick = Math.min(1, d.power || 0.6);
    } else if (type === 'explosion') {
      this._kick = 1.6;
    } else if (type === 'callout') {
      this._toast(`You: “${d.text}”`, 'info');
    }
  }

  _toast(text, tone) {
    const now = performance.now();
    const dup = this._toasts.find((t) => t.text === text && now - t.at < 1500);
    if (dup) { dup.at = now; return; }
    const n = el('div', `ck-toast ck-toast-${tone || 'info'}`, esc(text));
    this.$.toasts.appendChild(n);
    this._toasts.push({ text, at: now, node: n });
    while (this._toasts.length > 3) this._toasts.shift().node.remove();
  }

  // ═══ sizing ══════════════════════════════════════════════════════════════════
  resize() {
    const cw = this.container.clientWidth, ch = this.container.clientHeight;
    const auto = !this.compact && (cw < 640 || ch < 380);
    if (auto !== !!this._autoCompact) { this._autoCompact = auto; this._applyModeClass(); this._renderBook(true); }
    this.root.classList.toggle('ck-narrow', !this.isCompact && cw < 1180);
    this.root.classList.toggle('ck-short', ch < 640);
    this.root.classList.toggle('ck-tiny', cw < 470);
    const r = this.$.scene.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    if (w !== this._lastSize.w || h !== this._lastSize.h || dpr !== this._lastSize.dpr) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
      this._lastSize = { w, h, dpr };
      this.scene.computeLayout(w, h);
    }
  }

  // ═══ per-frame ═══════════════════════════════════════════════════════════════
  update(dt) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    const lab = this.lab;
    // cheap size check (ResizeObserver covers most cases; this catches layout shifts)
    const r = this.$.scene;
    if (r.clientWidth !== this._lastSize.w || r.clientHeight !== this._lastSize.h) this.resize();

    this._updateWobble(dt);
    this.scene.update(dt, lab);
    this._draw();
    this._updateHeader();
    this._updateRight();
    this._updateToolbar();
    this._updateOverlays();
    this._renderBook(false);
    this._expireToasts();
  }

  _updateWobble(dt) {
    const lab = this.lab;
    const lat = clamp((lab.feel.latAcc || 0) / 4, -1, 1);
    this._kick = Math.max(0, (this._kick || 0) - dt * 2.8);
    const shake = this._kick > 0 ? Math.sin(performance.now() / 22) * this._kick * 3 : 0;
    const tx = lat * 2.5 + shake;
    const ty = Math.abs(shake) * 0.6 + (lab.feel.bump || 0) * Math.sin(performance.now() / 30) * 1.2;
    const rot = lat * 0.25;
    const k = 1 - Math.exp(-dt * 12);
    this._wob.x += (tx - this._wob.x) * k;
    this._wob.y += (ty - this._wob.y) * k;
    this._wob.r += (rot - this._wob.r) * k;
    const s = `translate3d(${this._wob.x.toFixed(2)}px, ${this._wob.y.toFixed(2)}px, 0) rotate(${this._wob.r.toFixed(3)}deg)`;
    if (s !== this._wobStr) { this.$.scene.style.transform = s; this._wobStr = s; }
  }

  _draw() {
    const lab = this.lab, g = this.ctx, sc = this.scene, L = sc.layout;
    if (!L) return;
    const dpr = this._lastSize.dpr || 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, L.W, L.H);
    sc.drawBackground(g, lab);
    const step = lab.currentStep;
    const g2 = lab.current;
    if ((lab.state === LAB_STATES.RUNNING) && g2) {
      g.save();
      g.translate(L.fx, L.fy);
      if (step?.paused) g.globalAlpha = 0.55;
      g2.draw(g, L.fw, L.fh, THEME);
      g.restore();
    } else {
      sc.drawIdleProps(g, lab);
    }
    sc.drawOverlays(g, lab);

    // banner
    if (lab.cookDown) { /* DOM overlay */ } else if (lab.state === LAB_STATES.RUNNING && step) {
      if (step.paused && step.lastStep) sc.drawStamp(g, step.lastStep.label, step.lastStep.score, step.next);
      else sc.drawBanner(g, step.instructions, lab.fire > 0 ? 'bad' : 'info', this.isCompact ? `${step.index + 1}/${step.count}` : null);
    } else if (lab.state === LAB_STATES.REQUESTING) {
      sc.drawBanner(g, 'Checking the pantry with the driver…', 'info');
    } else if (lab.state === LAB_STATES.IDLE) {
      const anyReady = lab.availableRecipes().some((r) => r.canMake);
      const where = this.isCompact ? 'Open Recipes above to start a batch' : this.root.classList.contains('ck-narrow') && !this._drawerOpen ? 'Open the recipe book to start a batch' : 'Pick a recipe from the book';
      sc.drawBanner(g, anyReady ? where : 'Out of ingredients — grab supplies at the next stop', anyReady ? 'info' : 'bad');
    }

    // cursor
    let cur = 'default';
    const h = this._hover;
    if (h && !lab.cookDown) {
      const hs = sc.hitHotspot(h.px, h.py);
      const insideFocus = h.px >= L.fx && h.px <= L.fx + L.fw && h.py >= L.fy && h.py <= L.fy + L.fh;
      if (lab.fire > 0) cur = 'pointer';
      else if (lab.inputEnabled && insideFocus) cur = lab.current.cursor;
      else if (hs) cur = 'pointer';
    }
    if (cur !== this._cursor) { this.canvas.style.cursor = cur; this._cursor = cur; }
  }

  _set(key, value, fn) {
    if (this._sig[key] === value) return false;
    this._sig[key] = value;
    fn(value);
    return true;
  }

  _updateHeader() {
    const lab = this.lab, $ = this.$;
    const st = lab.state;
    const running = st === LAB_STATES.RUNNING;
    const step = lab.currentStep;
    let name = 'Lab ready', sub = 'Pick a recipe to start a batch';
    if (lab.cookDown) { name = 'Doc is out cold'; sub = 'Hang on…'; }
    else if (st === LAB_STATES.REQUESTING) { name = lab.recipe?.name || 'Batch'; sub = 'Waiting on the ingredients…'; }
    else if (running && step) {
      name = lab.recipe.name;
      sub = step.paused ? `Step ${step.index + 1} done${step.next ? ` · next: ${step.next}` : ''}` : `Step ${step.index + 1} of ${step.count} · ${step.label}`;
    } else if (st === LAB_STATES.DONE) { name = lab.result?.name || 'Batch'; sub = 'Batch complete'; }
    else if (st === LAB_STATES.FAILED) { name = lab.result?.name || 'Batch'; sub = 'Batch ruined'; }
    else if (lab.phase === 'won' || lab.phase === 'lost') { name = 'Run over'; sub = lab.phase === 'won' ? 'You made it to the buyer' : 'The run is over'; }
    this._set('hName', name, (v) => { $.batchName.textContent = v; });
    this._set('hSub', sub, (v) => { $.stepLabel.textContent = v; });

    // dots
    const steps = (running || st === LAB_STATES.DONE || st === LAB_STATES.FAILED || st === LAB_STATES.REQUESTING) && lab.recipe ? lab.recipe.steps : null;
    const dsig = steps ? `${lab.recipe.id}|${lab.stepIndex}|${step?.paused}|${lab.stepScores.length}|${st}` : 'none';
    this._set('dots', dsig, () => {
      if (!steps) { $.dots.innerHTML = ''; return; }
      $.dots.innerHTML = steps.map((s, i) => {
        const sc = lab.stepScores[i];
        let cls = 'ck-dot';
        if (sc) cls += sc.score >= 0.75 ? ' is-good' : sc.score >= 0.5 ? ' is-ok' : ' is-bad';
        else if (running && i === lab.stepIndex) cls += ' is-now';
        else if (st === LAB_STATES.FAILED && i === lab.stepScores.length) cls += ' is-fail';
        return `<span class="${cls}" title="${esc(s.label)}">${stepIcon(s.type)}</span>`;
      }).join('');
    });
    const q = lab.qualitySoFar;
    const showQ = (running || st === LAB_STATES.DONE) && q !== null;
    this._set('qShow', showQ, (v) => { $.quality.hidden = !v; });
    if (showQ) this._set('qVal', pct(q), (v) => { $.qualityVal.textContent = v; $.quality.dataset.tone = q >= 0.75 ? 'good' : q >= 0.5 ? 'ok' : 'bad'; });
    this._set('abort', running || st === LAB_STATES.REQUESTING, (v) => { $.abort.hidden = !v; });
    this._set('abortLbl', st === LAB_STATES.REQUESTING ? 'Cancel' : 'Dump batch', (v) => { $.abort.querySelector('span').textContent = v; });
    this.root.classList.toggle('ck-drawer-open', this._drawerOpen);
  }

  _updateRight() {
    const lab = this.lab, $ = this.$;
    const H = lab.hazards;
    // fumes
    const fumes = lab.fumes;
    const hurtAt = H.fumesHurtAbove ?? 0.75;
    this._set('fumesW', pct(fumes), (v) => { $.gFumes.querySelector('.ck-g-bar em').style.width = v; $.gFumes.querySelector('b').textContent = v; });
    this._set('fumesMark', pct(hurtAt), (v) => { $.gFumes.querySelector('.ck-g-mark').style.left = v; });
    this._set('fumesTone', fumes > hurtAt ? 'bad' : fumes > hurtAt * 0.6 ? 'warn' : 'ok', (v) => { $.gFumes.dataset.tone = v; });
    // temperature
    const heat = lab.current && lab.current.type === 'heat' ? lab.current : null;
    const tMax = heat ? heat.tMax : 300;
    this._set('temp', `${Math.round(lab.temp)}°`, (v) => { $.gTemp.querySelector('b').textContent = v; });
    this._set('tempW', pct((lab.temp - 20) / (tMax - 20)), (v) => { $.gTemp.querySelector('.ck-g-bar em').style.width = v; });
    const band = heat ? `${pct((heat.bandMin - 20) / (tMax - 20))}|${pct((heat.bandMax - heat.bandMin) / (tMax - 20))}` : 'none';
    this._set('tempBand', band, (v) => {
      const u = $.gTemp.querySelector('.ck-g-bar u');
      if (v === 'none') { u.style.display = 'none'; return; }
      const [l, w] = v.split('|'); u.style.display = ''; u.style.left = l; u.style.width = w;
    });
    const tTone = heat ? (lab.temp >= heat.fireAt ? 'bad' : lab.temp > heat.bandMax ? 'warn' : lab.temp >= heat.bandMin ? 'good' : 'ok') : 'idle';
    this._set('tempTone', tTone, (v) => { $.gTemp.dataset.tone = v; });
    // fire
    const fire = lab.fire;
    this._set('fireW', pct(fire), (v) => { $.gFire.querySelector('.ck-g-bar em').style.width = v; });
    this._set('fireTxt', fire > 0 ? pct(fire) : 'None', (v) => { $.gFire.querySelector('b').textContent = v; });
    this._set('fireTone', fire > 0.6 ? 'bad' : fire > 0 ? 'warn' : 'ok', (v) => { $.gFire.dataset.tone = v; });
    // toggles
    this._set('vent', `${lab.ventOpen}|${lab.smokeVisible}`, () => {
      $.vent.classList.toggle('is-on', lab.ventOpen);
      $.vent.querySelector('span').textContent = lab.ventOpen ? (lab.smokeVisible ? 'Open · smoking' : 'Open') : 'Closed';
    });
    this._set('curt', `${lab.curtainsClosed}|${lab.copAlarm}`, () => {
      $.curtains.classList.toggle('is-on', lab.curtainsClosed);
      $.curtains.classList.toggle('is-alarm', lab.copAlarm);
      $.curtains.querySelector('span').textContent = lab.curtainsClosed ? 'Closed' : 'Open';
    });
    this._set('ext', `${lab.extinguisher}|${fire > 0}`, () => {
      $.ext.classList.toggle('is-empty', lab.extinguisher <= 0);
      $.ext.classList.toggle('is-urgent', fire > 0 && lab.extinguisher > 0);
      [...$.pips.children].forEach((p, i) => p.classList.toggle('is-full', i < lab.extinguisher));
    });
    // haul
    const units = lab.inv.units || 0, req = lab.requiredUnits;
    this._set('units', `${units}/${req}`, () => {
      $.units.textContent = `${units} / ${req}`;
      $.unitsBar.style.width = pct(units / req);
      $.unitsBar.parentElement.dataset.tone = units >= req ? 'good' : 'ok';
    });
    this._set('avgq', units > 0 ? pct(lab.inv.quality || 0) : '—', (v) => { $.avgq.textContent = units > 0 ? `${v} quality` : 'No product yet'; });
    const gd = lab.inv.gadgets || {};
    this._set('gadgets', `${gd.smoke | 0}|${gd.oil | 0}|${gd.nitro | 0}`, () => {
      for (const c of $.gadgets.children) {
        const n = gd[c.dataset.gadget] | 0;
        c.querySelector('b').textContent = n;
        c.classList.toggle('is-ready', n > 0);
      }
    });
    // HP
    const hp = Math.max(0, Math.round(lab.crew.cook ?? 100));
    const maxHp = lab.data.rules?.rv?.crewMaxHp ?? 100;
    this._set('hp', hp, () => {
      $.hp.querySelector('b').textContent = `${hp} hp`;
      $.hp.querySelector('.ck-g-bar em').style.width = pct(hp / maxHp);
      $.hp.dataset.tone = hp < 30 ? 'bad' : hp < 60 ? 'warn' : 'ok';
    });
    // lock controls when the cook is down
    this._set('locked', lab.cookDown, (v) => { this.root.classList.toggle('ck-locked', v); });
  }

  _updateToolbar() {
    if (!this.isCompact) return;
    const lab = this.lab, $ = this.$;
    this._set('tbVent', `${lab.ventOpen}|${lab.smokeVisible}`, () => { $.tbVent.classList.toggle('is-on', lab.ventOpen); $.tbVent.classList.toggle('is-smoke', lab.smokeVisible); });
    this._set('tbCurt', `${lab.curtainsClosed}|${lab.copAlarm}`, () => { $.tbCurtains.classList.toggle('is-on', lab.curtainsClosed); $.tbCurtains.classList.toggle('is-alarm', lab.copAlarm); });
    this._set('tbExt', `${lab.extinguisher}|${lab.fire > 0}`, () => { $.tbExtCount.textContent = lab.extinguisher; $.tbExt.classList.toggle('is-empty', lab.extinguisher <= 0); $.tbExt.classList.toggle('is-urgent', lab.fire > 0 && lab.extinguisher > 0); });
    this._set('tbFumes', pct(lab.fumes), (v) => { $.tbFumes.querySelector('em').style.width = v; $.tbFumes.dataset.tone = lab.fumes > (lab.hazards.fumesHurtAbove ?? 0.75) ? 'bad' : lab.fumes > 0.45 ? 'warn' : 'ok'; });
    this._set('tbFire', pct(lab.fire), (v) => { $.tbFire.querySelector('em').style.width = v; $.tbFire.dataset.tone = lab.fire > 0 ? 'bad' : 'ok'; });
    this._set('tbUnits', `${lab.inv.units || 0}/${lab.requiredUnits}`, (v) => { $.tbUnits.textContent = v; });
    const step = lab.currentStep;
    let label = 'Recipes', sub = '';
    if (lab.state === LAB_STATES.RUNNING && step) { label = lab.recipe.name; sub = `${step.index + 1}/${step.count}`; }
    else if (lab.state === LAB_STATES.REQUESTING) { label = lab.recipe?.name || 'Batch'; sub = '…'; }
    this._set('tbLabel', `${label}|${sub}`, () => { $.menuLabel.textContent = label; $.menuSub.textContent = sub; });
    this._set('tbMenu', this._menuOpen, (v) => { $.menuBtn.classList.toggle('is-open', v); });
  }

  _updateOverlays() {
    const lab = this.lab, $ = this.$;
    this._set('alarm', lab.copAlarm, (v) => { $.alarm.hidden = !v; });
    this._set('smokeWarn', lab.smokeVisible && !lab.copAlarm, (v) => { $.smoke.hidden = !v; });
    // result card
    const showRes = (lab.state === LAB_STATES.DONE || lab.state === LAB_STATES.FAILED) && lab.result;
    if (showRes && this._resultShownFor !== lab.result) {
      this._resultShownFor = lab.result;
      $.result.innerHTML = this._resultHtml(lab.result);
    }
    this._set('result', !!showRes, (v) => { $.result.hidden = !v; if (!v) this._resultShownFor = null; });
    // cook down
    this._set('down', lab.cookDown, (v) => { $.down.hidden = !v; });
    if (lab.cookDown) this._set('downT', Math.ceil(lab.cookDownT), (v) => { $.downCount.textContent = v; });
    // confirm
    if (this._confirm && lab.state !== LAB_STATES.RUNNING) this._confirm = false;
    this._set('confirm', this._confirm, (v) => { $.confirm.hidden = !v; });
    // compact menu
    this._set('menu', this._menuOpen && this.isCompact, (v) => { $.menu.hidden = !v; });
  }

  _resultHtml(r) {
    const lab = this.lab;
    if (r.ok) {
      const q = r.quality;
      const grade = q >= 0.9 ? 'Pristine' : q >= 0.75 ? 'Solid batch' : q >= 0.5 ? 'Passable' : 'Cloudy';
      let gain = '';
      if (r.kind === 'product') gain = `+${r.units} ${esc(lab.product.unitName || 'unit')}s of ${esc(lab.product.name)}`;
      else if (r.kind === 'gadget') {
        const k = KEY_LABEL[lab.data.rules?.gadgets?.[r.gadget]?.key] || '';
        gain = `+1 ${esc(GADGET_NAME[r.gadget] || r.gadget)} for the driver${k ? ` <kbd>${k}</kbd>` : ''}`;
      } else if (r.kind === 'repair') {
        gain = r.repair?.rv ? `RV patched +${r.repair.rv}` : r.repair?.crew ? `Crew patched up +${r.repair.crew}` : 'Repaired';
      }
      const rows = (r.steps || []).map((s) => `<li>${stepIcon(s.type)}<span>${esc(s.label)}</span><b data-tone="${s.score >= 0.75 ? 'good' : s.score >= 0.5 ? 'ok' : 'bad'}">${pct(s.score)}</b></li>`).join('');
      return `<div class="ck-result-card is-ok">
        <div class="ck-result-kicker">${esc(r.name)}</div>
        <div class="ck-result-title">${grade}</div>
        <div class="ck-result-q"><b>${pct(q)}</b><span>quality</span></div>
        <div class="ck-result-gain">${gain}</div>
        <ul class="ck-result-steps">${rows}</ul>
        <div class="ck-result-hint">Tap to close</div>
      </div>`;
    }
    const why = {
      explosion: 'The burner went up in flames.', aborted: 'You dumped it.', timeout: 'Took too long.',
    }[r.reason] || (r.reason ? `${r.reason[0].toUpperCase()}${r.reason.slice(1)}.` : 'It’s ruined.');
    return `<div class="ck-result-card is-fail">
      <div class="ck-result-kicker">${esc(r.name)}</div>
      <div class="ck-result-title">Batch ruined</div>
      <div class="ck-result-gain">${esc(why)} The ingredients are lost.</div>
      <div class="ck-result-hint">Tap to close</div>
    </div>`;
  }

  _expireToasts() {
    const now = performance.now();
    for (const t of this._toasts) {
      const age = now - t.at;
      if (age > 2600 && !t.node.classList.contains('is-out')) t.node.classList.add('is-out');
    }
    while (this._toasts.length && now - this._toasts[0].at > 3000) this._toasts.shift().node.remove();
  }

  // ═══ recipe book / pantry / compact menu ═════════════════════════════════════
  _renderBook(force) {
    const lab = this.lab;
    const list = lab.availableRecipes();
    const st = lab.state;
    const sig = `${this.isCompact}|${this._menuOpen}|${st}|${lab.recipe?.id}|${lab.cookDown}|${lab.phase}|` + list.map((r) => `${r.id}:${r.canMake}:${r.needs.map((n) => n.have).join(',')}`).join(';');
    if (!force && sig === this._bookSig) return;
    this._bookSig = sig;
    const blocked = lab.blockedReason;
    const groups = [['product', 'Products'], ['gadget', 'Gadgets'], ['repair', 'Repairs']];
    const card = (r, compact) => {
      const active = (st === LAB_STATES.RUNNING || st === LAB_STATES.REQUESTING) && lab.recipe?.id === r.id;
      const disabled = !r.canMake || !!blocked;
      let yieldTxt = '';
      if (r.kind === 'product') yieldTxt = `+${r.units} bags`;
      else if (r.kind === 'gadget') { const k = KEY_LABEL[lab.data.rules?.gadgets?.[r.gadget]?.key]; yieldTxt = `${GADGET_NAME[r.gadget] || r.gadget}${k ? ` · ${k}` : ''}`; }
      else if (r.kind === 'repair') yieldTxt = r.recipe.repair?.rv ? `+${r.recipe.repair.rv} RV` : r.recipe.repair?.crew ? `+${r.recipe.repair.crew} crew` : '';
      const needs = r.needs.map((n) => `<span class="ck-need ${n.ok ? 'is-ok' : 'is-miss'}" title="${esc(n.name)}: have ${n.have}, need ${n.need}">${ingredientIcon(n.id, n.color)}<b>${n.have}</b><i>/${n.need}</i></span>`).join('');
      const steps = r.recipe.steps.map((s) => `<span title="${esc(STEP_NAME[s.type] || s.type)}">${stepIcon(s.type)}</span>`).join('');
      let btnLabel = 'Cook';
      if (active) btnLabel = st === LAB_STATES.REQUESTING ? 'Waiting…' : 'Cooking';
      else if (!r.canMake) btnLabel = 'Missing';
      else if (blocked) btnLabel = 'Busy';
      return `<div class="ck-card ck-kind-${r.kind} ${r.canMake ? 'is-ready' : 'is-missing'} ${active ? 'is-active' : ''} ${compact ? 'is-compact' : ''}">
        <div class="ck-card-top"><div class="ck-card-name">${esc(r.name)}</div><div class="ck-card-yield">${esc(yieldTxt)}</div></div>
        ${compact ? '' : `<div class="ck-card-desc">${esc(r.desc)}</div>`}
        <div class="ck-card-mid"><div class="ck-card-steps">${steps}</div></div>
        <div class="ck-card-foot"><div class="ck-needs">${needs}</div>
          <button type="button" tabindex="-1" class="ck-cook" data-id="${esc(r.id)}" ${disabled ? 'disabled' : ''}>${esc(btnLabel)}</button></div>
      </div>`;
    };
    const html = (compact) => groups.map(([k, title]) => {
      const rs = list.filter((r) => r.kind === k);
      if (!rs.length) return '';
      return `<div class="ck-group"><h3 class="ck-h">${title}</h3>${rs.map((r) => card(r, compact)).join('')}</div>`;
    }).join('');

    if (this.isCompact) {
      if (this._menuOpen) {
        const busy = st === LAB_STATES.RUNNING || st === LAB_STATES.REQUESTING;
        const top = busy
          ? `<button type="button" tabindex="-1" class="ck-menu-abort">${ICONS.trash()}<span>${st === LAB_STATES.REQUESTING ? 'Cancel request' : `Dump ${esc(lab.recipe?.name || 'batch')}`}</span></button>`
          : (blocked ? `<div class="ck-menu-note">${esc(blocked)}</div>` : '');
        this.$.menuList.innerHTML = top + html(true);
      }
    } else {
      this.$.book.innerHTML = html(false);
    }
    // pantry
    const mat = lab.inv.mat || {};
    this.$.pantry.innerHTML = Object.entries(lab.ingredients).map(([id, ing]) => {
      const n = mat[id] || 0;
      return `<div class="ck-jar ${n ? '' : 'is-empty'}" title="${esc(ing.name)}">${ingredientIcon(id, ing.color)}<span>${esc(ing.name)}</span><b>${n}</b></div>`;
    }).join('');
  }

  // ═══ automation helpers (tests) ══════════════════════════════════════════════
  /** Focus-area normalised coords → client (viewport) px. */
  focusToClient(nx, ny) {
    const L = this.scene.layout, r = this.canvas.getBoundingClientRect();
    return { x: r.left + L.fx + nx * L.fw, y: r.top + L.fy + ny * L.fh };
  }

  destroy() {
    this._unsub?.();
    this._ro?.disconnect();
    for (const [t, type, fn, o] of this._handlers) t.removeEventListener(type, fn, o);
    this._handlers = [];
    this.root.remove();
  }
}
