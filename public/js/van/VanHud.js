// ─────────────────────────────────────────────────────────────────────────────
// VanHud — DOM overlay for the 3D van lab (inside the given hudRoot). Round 3 "dark glass" (tokens.css,
// docs/r3/ui/Cook-Lab.png): batch list (left), step panel with a live gauge (top centre), lab air (right),
// crosshair + station prompt (first person; bottom centre in the overview), shop-run banner, controls legend,
// Recipe Board overlay, pantry, batch result card, cook-down banner, toasts, fumes tint, explosion flash.
// Compact and still: things fade or slide ≤ 8 px; nothing bounces. One DOM write per changed value.
// pointer-events: none except buttons; buttons never take keyboard focus (tabindex=-1, preventDefault on
// mousedown). Styles: css/van.css (all under .vh), built on css/tokens.css (+ css/fonts.css for Archivo).
// Unity: a UI Toolkit document bound to the same CookLab state.
// ─────────────────────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const GROUPS = ['Products', 'Gadgets', 'Repairs'];
const pct = (v) => `${Math.round(clamp(v, 0, 1) * 100)}%`;

// standard line icons (24 × 24, stroke = currentColor)
const ICON = {
  flask: '<path d="M9 3h6M10 3v6L4.5 18.5A1.6 1.6 0 0 0 6 21h12a1.6 1.6 0 0 0 1.5-2.5L14 9V3"/><path d="M7.5 15h9"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 9.5 4.3 4.3 0 0 0 7 18z"/>',
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 1.6 1.2 2.6 2.2 3C12 9 11 6 12 3z"/>',
  fan: '<circle cx="12" cy="12" r="2"/><path d="M12 10c0-3 1-6 4-6s3 4-1 6M14 12c3 0 6 1 6 4s-4 3-6-1M12 14c0 3-1 6-4 6s-3-4 1-6M10 12c-3 0-6-1-6-4s4-3 6 1"/>',
  curtain: '<path d="M4 4h16M6 4v16M18 4v16M6 4c0 6 3 9 5 16M18 4c0 6-3 9-5 16"/>',
  ext: '<path d="M10 7h4v13a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1z"/><path d="M12 7V4h3l3 2M14 9l4 2"/>',
  door: '<path d="M5 21V4a1 1 0 0 1 1-1h9l4 2v16"/><path d="M3 21h18M12 12.5v1"/>',
  hand: '<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5A5.5 5.5 0 0 1 5 17.5L3.6 14a1.5 1.5 0 0 1 2.7-1.3L8 15"/>',
  bag: '<path d="M6 8h12l-1 12H7z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
};
const icon = (n, cls = '') => `<svg class="vh-ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[n] || ''}</svg>`;
const keycap = (k) => `<kbd class="vh-key${k.length > 1 ? ' wide' : ''}">${esc(k)}</kbd>`;
const keyRow = (rows) => rows.map((r) => `<span class="vh-kh">${r.slice(0, -1).map(keycap).join('')}<span>${esc(r[r.length - 1])}</span></span>`).join('');

const STEP_NAMES = { grind: 'Grind', measure: 'Measure', heat: 'Heat', stir: 'Stir', cool: 'Cool', break: 'Break & bag', hammer: 'Hammer' };
const STEP_SUB = {
  grind: (s) => `${s.turns ?? 6} turns, fine`,
  measure: (s) => `${Math.round((s.targetMin ?? 0.6) * 100)}–${Math.round((s.targetMax ?? 0.75) * 100)} % on the line`,
  heat: (s) => `${s.bandMin ?? 170}–${s.bandMax ?? 215}° · hold ${s.duration ?? 8} s`,
  stir: (s) => `steady tempo, ${s.duration ?? 5} s`,
  cool: (s) => `keep it level, ${s.duration ?? 6} s`,
  break: (s) => `${s.shards ?? 6} shards`,
  hammer: (s) => `${s.nails ?? 4} nails`,
};

export class VanHud {
  /**
   * @param {HTMLElement} root  overlay container (covers the canvas)
   * @param {CookLab} lab
   * @param {object} data      { lab, van, ... }
   * @param {object} cb        { onCook(id), onDump(), onBoardClosed(), onPantryClosed() }
   */
  constructor(root, lab, data, cb = {}) {
    this.root = root; this.lab = lab; this.data = data; this.cb = cb;
    const el = document.createElement('div');
    el.className = 'vh vh-mode-fp';
    el.innerHTML = `
      <div class="vh-tint"></div>
      <div class="vh-flash"></div>
      <section class="vh-batch vh-glass" aria-label="Batch">
        <header><span class="vh-lbl vh-batch-k">Lab</span>${icon('flask', 'teal')}</header>
        <div class="vh-batch-name"></div>
        <div class="vh-chips"></div>
        <div class="vh-rule"></div>
        <ol class="vh-steps"></ol>
        <div class="vh-batch-idle"></div>
        <footer class="vh-batch-foot">${keycap('Tab')}<span>all recipes</span></footer>
      </section>
      <section class="vh-step vh-glass" aria-label="Step" hidden>
        <div class="vh-step-top"><span class="vh-chip amber vh-step-n"></span><span class="vh-lbl vh-step-where"></span><span class="vh-step-keys"></span></div>
        <div class="vh-step-main"><b class="vh-step-label"></b><span class="vh-read"><em></em><small></small></span></div>
        <div class="vh-gauge"><div class="vh-track"><i class="vh-fill"></i><i class="vh-band"></i><i class="vh-mark"></i><i class="vh-warn"></i></div><div class="vh-ticks"></div></div>
        <div class="vh-hold"><span class="vh-lbl vh-hold-k">Hold</span><div class="vh-mini"><i></i></div><span class="vh-num vh-hold-v"></span></div>
        <div class="vh-step-hint"></div>
        <div class="vh-away" hidden></div>
      </section>
      <div class="vh-right">
        <section class="vh-air vh-glass" aria-label="Lab air">
          <header><span class="vh-lbl">Lab air</span><span class="vh-kh">${keycap('V')}<span>vent fan</span></span></header>
          <div class="vh-m vh-m-fumes">${icon('cloud')}<span class="vh-lbl">Fumes</span><b class="vh-mini"><i></i></b><em class="vh-num"></em></div>
          <div class="vh-m vh-m-fire">${icon('flame')}<span class="vh-lbl">Fire</span><b class="vh-mini"><i></i></b><em class="vh-num"></em></div>
          <div class="vh-flags"><span class="vh-f-vent" title="Vent fan">${icon('fan')}<i></i></span><span class="vh-f-curt" title="Curtains">${icon('curtain')}<i></i></span><span class="vh-f-ext" title="Extinguisher charges">${icon('ext')}<i></i></span></div>
        </section>
        <div class="vh-pantry vh-glass" hidden></div>
        <div class="vh-result vh-glass" hidden></div>
      </div>
      <div class="vh-xhair" hidden><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="7" fill="none" stroke="#fff" stroke-width="1.5"/><circle cx="32" cy="32" r="1.6" fill="#fff"/></svg></div>
      <div class="vh-lock" hidden>Click to look around</div>
      <div class="vh-prompt vh-glass" hidden></div>
      <div class="vh-shop vh-glass" hidden></div>
      <div class="vh-toasts"></div>
      <section class="vh-legend vh-glass" aria-label="Controls"></section>
      <div class="vh-board" hidden><div class="vh-board-in vh-glass"></div></div>
      <div class="vh-down vh-glass" hidden><b>Doc is out cold</b><span></span></div>`;
    root.appendChild(el);
    this.el = el;
    const $ = (s) => el.querySelector(s);
    this.$ = {
      tint: $('.vh-tint'), flash: $('.vh-flash'), toasts: $('.vh-toasts'),
      batch: $('.vh-batch'), batchFoot: $('.vh-batch-foot'), batchK: $('.vh-batch-k'), batchName: $('.vh-batch-name'), chips: $('.vh-chips'), steps: $('.vh-steps'), batchIdle: $('.vh-batch-idle'),
      step: $('.vh-step'), stepN: $('.vh-step-n'), where: $('.vh-step-where'), keys: $('.vh-step-keys'), stepLabel: $('.vh-step-label'),
      readV: $('.vh-read em'), readS: $('.vh-read small'), gauge: $('.vh-gauge'), fill: $('.vh-fill'), band: $('.vh-band'), mark: $('.vh-mark'), warnT: $('.vh-warn'), ticks: $('.vh-ticks'),
      hold: $('.vh-hold'), holdK: $('.vh-hold-k'), holdBar: $('.vh-hold .vh-mini i'), holdV: $('.vh-hold-v'), stepHint: $('.vh-step-hint'), away: $('.vh-away'),
      fumes: $('.vh-m-fumes i'), fumesV: $('.vh-m-fumes em'), fumesRow: $('.vh-m-fumes'), fire: $('.vh-m-fire i'), fireV: $('.vh-m-fire em'), fireRow: $('.vh-m-fire'),
      vent: $('.vh-f-vent'), ventT: $('.vh-f-vent i'), curt: $('.vh-f-curt'), curtT: $('.vh-f-curt i'), ext: $('.vh-f-ext'), extT: $('.vh-f-ext i'),
      xhair: $('.vh-xhair'), lock: $('.vh-lock'), prompt: $('.vh-prompt'), shop: $('.vh-shop'), legend: $('.vh-legend'),
      pantry: $('.vh-pantry'), board: $('.vh-board'), boardIn: $('.vh-board-in'), result: $('.vh-result'), down: $('.vh-down'), downT: $('.vh-down span'),
    };
    this.boardOpen = false; this.pantryOpen = false;
    this.mode = 'fp';
    this._dumpArm = 0;
    this._c = new Map();                 // write cache: key → last value
    this._boardSig = ''; this._pantrySig = ''; this._resultSig = ''; this._promptSig = ''; this._batchSig = ''; this._stepSig = ''; this._legendSig = ''; this._shopSig = '';
    // never steal focus
    el.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
    el.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) e.stopPropagation(); });
    el.addEventListener('click', (e) => this._click(e));
    // click on the dimmed backdrop (outside the board) closes it
    this.$.board.addEventListener('pointerdown', (e) => { if (e.target === this.$.board) { e.preventDefault(); this.closeBoard(); } });
    this._unsub = lab.subscribe ? lab.subscribe((type, d) => {
      if (type === 'toast') this.toast(d.text, d.tone);
      if (type === 'recipeStarted' || type === 'requested') this.closeBoard();
    }) : null;
    this.visible = true;
  }

  setVisible(v) { this.visible = !!v; this.el.style.display = v ? '' : 'none'; }
  /** 'fp' (crosshair, prompt by the crosshair) | 'overview' (prompt at the bottom). */
  setMode(mode) {
    this.mode = mode === 'overview' ? 'overview' : 'fp';
    this.el.classList.toggle('vh-mode-fp', this.mode === 'fp');
    this.el.classList.toggle('vh-mode-ov', this.mode !== 'fp');
    this._promptSig = ''; this._legendSig = '';
  }
  // cached DOM writes
  _set(key, el, prop, val) {
    if (this._c.get(key) === val) return;
    this._c.set(key, val);
    if (prop === 'text') el.textContent = val;
    else if (prop === 'html') el.innerHTML = val;
    else if (prop === 'hidden') el.hidden = val;
    else if (prop === 'cls') el.className = val;
    else el.style[prop] = val;
  }

  // ── toasts (one line, fade) ──────────────────────────────────────────────
  toast(text, tone = 'info') {
    if (!text) return;
    const box = this.$.toasts;
    const last = box.lastElementChild;
    if (last && last.dataset.text === text && !last.classList.contains('out')) { clearTimeout(last._t); last._t = setTimeout(() => this._fade(last), 2800); return; }
    const t = document.createElement('div');
    t.className = `vh-toast vh-glass ${tone}`;
    t.dataset.text = text;
    t.textContent = text;
    box.appendChild(t);
    while (box.children.length > 3) box.firstElementChild.remove();
    t._t = setTimeout(() => this._fade(t), 2800);
  }
  _fade(t) { t.classList.add('out'); setTimeout(() => t.remove(), 220); }

  // ── recipe board ──────────────────────────────────────────────────────────
  openBoard() { this.boardOpen = true; this.$.board.hidden = false; this._boardSig = ''; this._renderBoard(); }
  closeBoard() {
    if (!this.boardOpen) return;
    this.boardOpen = false; this.$.board.hidden = true; this._dumpArm = 0;
    this.cb.onBoardClosed && this.cb.onBoardClosed();
  }
  togglePantry(on = !this.pantryOpen) { this.pantryOpen = on; this.$.pantry.hidden = !on; this._pantrySig = ''; if (!on && this.cb.onPantryClosed) this.cb.onPantryClosed(); }
  /** Keyboard while the board is open. Returns true if consumed. */
  boardKey(code, isDown) {
    if (!this.boardOpen) return false;
    if (!isDown) return /^(Digit|Numpad)\d$/.test(code) || code === 'Escape';
    if (code === 'Escape' || code === 'KeyQ') { this.closeBoard(); return true; }
    const m = /^(?:Digit|Numpad)(\d)$/.exec(code);
    if (m) {
      const n = +m[1];
      const list = this._orderedRecipes();
      if (n >= 1 && n <= list.length) this._cook(list[n - 1].id);
      return true;
    }
    return false;
  }
  _orderedRecipes() {
    const all = this.lab.availableRecipes();
    return GROUPS.flatMap((g) => all.filter((r) => r.group === g)).concat(all.filter((r) => !GROUPS.includes(r.group)));
  }
  _cook(id) {
    const lab = this.lab;
    if (!lab.canStart) { this.toast(lab.blockedReason || 'Busy', 'bad'); return; }
    const res = this.cb.onCook ? this.cb.onCook(id) : lab.requestRecipe(id);
    if (res && res.ok) this.closeBoard();
  }
  _renderBoard() {
    const lab = this.lab;
    const list = this._orderedRecipes();
    const running = lab.state === 'running' || lab.state === 'requesting';
    const sig = JSON.stringify([list.map((r) => [r.id, r.canMake, r.needs.map((n) => n.have)]), lab.state, lab.canStart, this._dumpArm > 0]);
    if (sig === this._boardSig) return;
    this._boardSig = sig;
    let n = 0;
    const groups = GROUPS.map((g) => {
      const items = list.filter((r) => r.group === g);
      if (!items.length) return '';
      return `<section><h3 class="vh-lbl">${g}</h3><div class="vh-cards">${items.map((r) => {
        n++;
        const can = r.canMake && lab.canStart;
        const yieldTxt = r.kind === 'product' ? `+${r.units} bags` : r.kind === 'gadget' ? `+1 ${esc(r.gadget)}` : r.recipe?.repair?.rv ? `+${r.recipe.repair.rv} hull` : r.recipe?.repair?.crew ? `+${r.recipe.repair.crew} Doc` : '';
        return `<div class="vh-rc ${r.kind} ${r.canMake ? 'ok' : 'no'}">
          <div class="vh-rc-h"><kbd class="vh-key">${n}</kbd><b>${esc(r.name)}</b></div>
          <span class="vh-rc-meta">${r.steps} steps${yieldTxt ? ' · ' + esc(yieldTxt) : ''}</span>
          <p>${esc(r.desc)}</p>
          <ul>${r.needs.map((x) => `<li class="${x.ok ? 'ok' : 'no'}"><i style="background:${esc(x.color)}"></i>${esc(x.name)} <b>${x.have}/${x.need}</b></li>`).join('')}</ul>
          <button type="button" tabindex="-1" data-cook="${esc(r.id)}" ${can ? '' : 'disabled'}>${r.canMake ? 'Cook' : 'Missing stuff'}</button>
        </div>`;
      }).join('')}</div></section>`;
    }).join('');
    const cur = running && lab.recipe ? `<div class="vh-board-cur">Cooking <b>${esc(lab.recipe.name)}</b> — finish or dump it first.
      <button type="button" tabindex="-1" class="vh-dump ${this._dumpArm > 0 ? 'armed' : ''}" data-dump="1">${this._dumpArm > 0 ? 'Really dump it?' : 'Dump batch'}</button></div>` : '';
    this.$.boardIn.innerHTML = `<header><b>Recipe board</b><span class="vh-kh">${keycap('1')}<span>–</span>${keycap(String(Math.max(1, n)))}<span>cook</span>${keycap('Esc')}<span>close</span></span><button type="button" tabindex="-1" class="vh-x" data-close="1" aria-label="Close">${icon('x')}</button></header>${cur}<div class="vh-groups">${groups}</div>`;
  }
  _renderPantry() {
    const lab = this.lab;
    const mat = lab.inv?.mat || {};
    const ing = this.data.lab?.ingredients || {};
    const sig = JSON.stringify(mat);
    if (sig === this._pantrySig) return;
    this._pantrySig = sig;
    this.$.pantry.innerHTML = `<header><span class="vh-lbl">Pantry</span><span class="vh-kh">${keycap('Q')}<span>close</span></span></header><ul>${Object.entries(ing).map(([id, x]) => {
      const c = mat[id] || 0;
      return `<li class="${c ? '' : 'none'}"><i style="background:${esc(x.color)}"></i><span>${esc(x.name)}</span><b class="vh-num">${c}</b></li>`;
    }).join('')}</ul><small>Restock at supply stops</small>`;
  }
  _click(e) {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.cook) this._cook(b.dataset.cook);
    else if (b.dataset.close) this.closeBoard();
    else if (b.dataset.dump) {
      if (this._dumpArm > 0) { this._dumpArm = 0; if (this.cb.onDump) this.cb.onDump(); else this.lab.abortBatch(); this.closeBoard(); }
      else { this._dumpArm = 3; this._boardSig = ''; this._renderBoard(); }
    } else if (b.dataset.ok) this.lab.dismissResult && this.lab.dismissResult();
  }

  // ── batch list (left) ─────────────────────────────────────────────────────
  _renderBatch(s) {
    const lab = this.lab, $ = this.$;
    const r = lab.recipe, st = lab.getCurrentStep ? lab.getCurrentStep() : null;
    const running = lab.state === 'running' && r;
    const req = lab.state === 'requesting';
    const idx = st ? st.index : -1;
    const q = lab.qualitySoFar;
    const sig = JSON.stringify([lab.state, r?.id, idx, st?.paused, q == null ? null : Math.round(q * 100), lab.canStart]);
    if (sig === this._batchSig) return;
    this._batchSig = sig;
    if (!(running || req) || !r) {
      $.batchK.textContent = 'Lab';
      $.batchName.textContent = lab.state === 'done' ? 'Batch done' : lab.state === 'failed' ? 'Batch ruined' : 'Nothing cooking';
      $.chips.innerHTML = '';
      $.steps.innerHTML = '';
      $.batchIdle.hidden = false;
      $.batchFoot.hidden = true;
      $.batchIdle.innerHTML = lab.canStart ? `Pick a recipe at the board<span>or press ${keycap('Tab')}</span>` : esc(lab.blockedReason || 'Lab busy');
      return;
    }
    $.batchIdle.hidden = true;
    $.batchFoot.hidden = false;
    $.batchK.textContent = req ? 'Waiting for Rook' : (r.kind === 'product' ? 'Batch' : r.kind === 'gadget' ? 'Gadget' : 'Repair');
    $.batchName.textContent = r.name;
    const yieldTxt = r.kind === 'product' ? `+${r.units} bags` : r.kind === 'gadget' ? `+1 ${r.gadget}` : 'repair';
    $.chips.innerHTML = `<span class="vh-chip">${q == null ? 'Q —' : `Q ${Math.round(q * 100)}%`}</span><span class="vh-chip">${esc(yieldTxt)}</span><span class="vh-chip">${(r.steps || []).length} steps</span>`;
    $.steps.innerHTML = (r.steps || []).map((step, i) => {
      const cls = req ? 'todo' : i < idx || (i === idx && st?.paused) ? 'done' : i === idx ? 'cur' : 'todo';
      const sub = (STEP_SUB[step.type] || (() => ''))(step);
      return `<li class="${cls}"><i>${cls === 'done' ? icon('check') : i + 1}</i><div><b>${esc(STEP_NAMES[step.type] || step.label)}</b><small>${esc(sub || step.label)}</small></div></li>`;
    }).join('');
  }

  // ── step panel (top centre): live gauge per step type ─────────────────────
  _renderStep(dt, s) {
    const lab = this.lab, $ = this.$;
    const st = lab.getCurrentStep ? lab.getCurrentStep() : null;
    const req = lab.state === 'requesting';
    const show = !!st && lab.state === 'running';
    this._set('step.hidden', $.step, 'hidden', !show);
    if (!show) { void req; return; }
    const g = lab.current;
    this._set('step.n', $.stepN, 'text', `Step ${st.index + 1}/${st.count}`);
    this._set('step.where', $.where, 'text', s.stationName || s.nextName || '');
    const keys = s.working && s.keys ? s.keys : s.awayText ? [['E', `at the ${s.nextName}`]] : [];
    this._set('step.keys', $.keys, 'html', keyRow(keys));
    this._set('step.label', $.stepLabel, 'text', st.paused && st.next ? `Next: ${st.next}` : (st.label || ''));
    // readout + gauge
    let val = '', sub = '', subCls = '', gauge = null, hold = null;
    if (!st.paused && g) {
      if (g.type === 'heat') {
        const t = g.temp ?? 0, lo = g.bandMin ?? 170, hi = g.bandMax ?? 215, fireAt = g.fireAt ?? 265, top = Math.max(250, Math.ceil((fireAt + 10) / 50) * 50);
        val = `${Math.round(t)}°`;
        sub = t >= fireAt ? 'Fire!' : t > hi ? 'Too hot' : t >= lo ? 'In band' : 'Too cold';
        subCls = t >= fireAt ? 'bad' : t > hi ? 'warn' : t >= lo ? 'good' : 'cold';
        gauge = { v: t / top, a: lo / top, b: hi / top, warn: fireAt / top, color: t > hi ? 'var(--g-red, #E5483A)' : 'var(--g-rust, #E07A3C)', ticks: [0, top / 5, (2 * top) / 5, (3 * top) / 5, (4 * top) / 5, top].map(Math.round) };
        hold = { k: 'Hold', v: (g.inBand ?? 0) / (g.duration || 1), t: `${(g.inBand ?? 0).toFixed(1)}<span> / ${(g.duration ?? 8).toFixed(1)} s</span>` };
      } else if (g.type === 'measure') {
        const L = g.level ?? 0, lo = g.min ?? 0.6, hi = g.max ?? 0.75;
        val = `${Math.round(L * 100)}%`;
        sub = L > hi ? 'Over!' : L >= lo ? 'In band' : g.pouring ? 'Pouring' : 'Low';
        subCls = L > hi ? 'bad' : L >= lo ? 'good' : 'cold';
        gauge = { v: L, a: lo, b: hi, color: L > hi ? 'var(--g-red, #E5483A)' : 'var(--g-teal, #5FB3A8)', ticks: [0, 25, 50, 75, 100], unit: '%' };
      } else if (g.type === 'stir') {
        const r = g.rps ?? 0, T = g.target ?? 1;
        val = `${r.toFixed(1)}/s`;
        sub = g.zone === 'good' ? 'Steady' : g.zone === 'fast' ? 'Too fast' : 'Faster';
        subCls = g.zone === 'good' ? 'good' : g.zone === 'fast' ? 'warn' : 'cold';
        gauge = { v: r / (T * 2), a: 0.4, b: 0.6, color: g.zone === 'good' ? 'var(--g-green, #5BBF6A)' : 'var(--g-amber, #F2B90F)', ticks: [0, (T / 2).toFixed(1), T.toFixed(1), (T * 1.5).toFixed(1), (T * 2).toFixed(1)] };
        hold = { k: 'Steady', v: (g.good ?? 0) / (g.duration || 1), t: `${(g.good ?? 0).toFixed(1)}<span> / ${(g.duration ?? 5).toFixed(1)} s</span>` };
      } else if (g.type === 'grind') {
        val = `${(g.turnsDone ?? 0).toFixed(1)}`;
        sub = `of ${g.turns ?? 6} turns`;
        subCls = 'muted';
      } else {
        val = pct(st.progress || 0);
        sub = 'done';
        subCls = 'muted';
      }
    }
    if (!hold) hold = { k: 'Progress', v: st.progress || 0, t: pct(st.progress || 0) };
    this._set('read.v', $.readV, 'text', val);
    this._set('read.s', $.readS, 'text', sub);
    this._set('read.sc', $.readS, 'cls', subCls);
    this._set('gauge.hidden', $.gauge, 'hidden', !gauge);
    if (gauge) {
      this._set('g.fill', $.fill, 'width', `${(clamp(gauge.v, 0, 1) * 100).toFixed(1)}%`);
      this._set('g.fillc', $.fill, 'background', gauge.color);
      this._set('g.band', $.band, 'left', `${(gauge.a * 100).toFixed(1)}%`);
      this._set('g.bandw', $.band, 'width', `${((gauge.b - gauge.a) * 100).toFixed(1)}%`);
      this._set('g.mark', $.mark, 'left', `${(clamp(gauge.v, 0, 1) * 100).toFixed(1)}%`);
      this._set('g.warn', $.warnT, 'display', gauge.warn != null && gauge.warn < 1 ? '' : 'none');
      if (gauge.warn != null) this._set('g.warnl', $.warnT, 'left', `${(gauge.warn * 100).toFixed(1)}%`);
      this._set('g.ticks', $.ticks, 'html', gauge.ticks.map((t, i, a) => `<span style="left:${(i / (a.length - 1)) * 100}%">${t}${gauge.unit && i === a.length - 1 ? gauge.unit : ''}</span>`).join(''));
    }
    this._set('hold.k', $.holdK, 'text', hold.k);
    this._set('hold.w', $.holdBar, 'width', pct(hold.v));
    this._set('hold.t', $.holdV, 'html', hold.t);
    this._set('step.hint', $.stepHint, 'text', !st.paused && s.working && s.hint ? s.hint : '');
    const away = s.awayText;
    this._set('away.h', $.away, 'hidden', !away);
    if (away) this._set('away.t', $.away, 'text', away);
    this._set('step.warn', $.step, 'cls', `vh-step vh-glass${away && /burner/i.test(away) ? ' warn' : ''}${s.working ? ' working' : ''}`);
  }

  _renderLegend(s) {
    let rows;
    if (s.working) rows = [[['Q', 'Esc', 'step away']], s.keys && s.keys.length > 1 ? [s.keys[0], ['Mouse', 'props']] : [['Mouse', 'work the props']]];
    else if (this.mode === 'fp') rows = [[['W', 'A', 'S', 'D', 'walk'], ['E', 'use']], [['Mouse', 'look'], ['Tab', 'recipes'], ['O', 'view']]];
    else rows = [[['W', 'A', 'S', 'D', 'walk'], ['E', 'use']], [['Click', 'walk'], ['Tab', 'recipes'], ['O', 'view']]];
    const sig = JSON.stringify(rows);
    if (sig === this._legendSig) return;
    this._legendSig = sig;
    this.$.legend.innerHTML = rows.map((r) => `<div>${keyRow(r)}</div>`).join('');
  }

  // ── per frame ─────────────────────────────────────────────────────────────
  /**
   * s: { mode, prompt: {key, text, sub, tone}|null, crosshair, xhairOn, lockHint, shop: {key, text, sub, near}|null,
   *      working, keys: [[key…, label]], hint, stationName, nextName, awayText, carrying, docState }
   */
  update(dt, s = {}) {
    if (!this.visible) return;
    const lab = this.lab, $ = this.$;
    if (s.mode && s.mode !== this.mode) this.setMode(s.mode);
    if (this._dumpArm > 0) { this._dumpArm -= dt; if (this._dumpArm <= 0) { this._dumpArm = 0; this._boardSig = ''; } }
    if (this.boardOpen) this._renderBoard();
    if (this.pantryOpen) this._renderPantry();
    // crosshair, pointer-lock hint
    this._set('xh', $.xhair, 'hidden', !s.crosshair);
    this._set('xh.on', $.xhair, 'cls', `vh-xhair${s.xhairOn ? ' on' : ''}`);
    this._set('lock', $.lock, 'hidden', !s.lockHint || !s.crosshair);
    // prompt
    const p = s.prompt;
    const psig = p ? `${p.key}|${p.text}|${p.tone}|${p.sub || ''}|${this.mode}` : '';
    if (psig !== this._promptSig) {
      this._promptSig = psig;
      $.prompt.hidden = !p;
      if (p) {
        $.prompt.className = `vh-prompt vh-glass ${p.tone || ''}`;
        $.prompt.innerHTML = `${p.key ? keycap(p.key) : ''}<div><b>${esc(p.text)}</b>${p.sub ? `<small>${esc(p.sub)}</small>` : ''}</div>`;
      }
    }
    // shop-run banner
    const sh = s.shop;
    const ssig = sh ? `${sh.text}|${sh.sub}|${sh.near ? 1 : 0}` : '';
    if (ssig !== this._shopSig) {
      this._shopSig = ssig;
      $.shop.hidden = !sh;
      if (sh) {
        $.shop.className = `vh-shop vh-glass${sh.near ? ' near' : ''}`;
        $.shop.innerHTML = `${icon('door', 'amber')}<div><b>${esc(sh.text)} — side door</b><small>${esc(sh.sub)}</small></div>${keycap(sh.key || 'E')}`;
      }
    }
    this._renderBatch(s);
    this._renderStep(dt, s);
    this._renderLegend(s);
    // lab air
    const f = lab.fumes || 0, fire = lab.fire || 0;
    const hurt = this.data.lab?.hazards?.fumesHurtAbove ?? 0.75;
    this._set('fu.w', $.fumes, 'width', pct(f));
    this._set('fu.c', $.fumes, 'background', f > hurt ? 'var(--g-red, #E5483A)' : f > hurt - 0.2 ? 'var(--g-amber, #F2B90F)' : 'var(--g-green, #5BBF6A)');
    this._set('fu.v', $.fumesV, 'text', pct(f));
    this._set('fu.hot', $.fumesRow, 'cls', `vh-m vh-m-fumes${f > hurt - 0.15 ? ' hot' : ''}`);
    this._set('fi.w', $.fire, 'width', pct(fire));
    this._set('fi.v', $.fireV, 'text', pct(fire));
    this._set('fi.hot', $.fireRow, 'cls', `vh-m vh-m-fire${fire > 0 ? ' hot' : ''}`);
    this._set('vent', $.ventT, 'text', lab.ventOpen ? 'On' : 'Off');
    this._set('vent.c', $.vent, 'cls', `vh-f-vent${lab.ventOpen ? ' on' : ''}`);
    this._set('curt', $.curtT, 'text', lab.curtainsClosed ? 'Shut' : 'Open');
    this._set('curt.c', $.curt, 'cls', `vh-f-curt${lab.curtainsClosed ? ' on' : ''}${lab.copAlarm ? ' alarm' : ''}`);
    const ex = lab.extinguisher ?? 0;
    this._set('ext', $.extT, 'text', s.carrying ? `Held · ${ex}` : `${ex} left`);
    this._set('ext.c', $.ext, 'cls', `vh-f-ext${s.carrying ? ' on' : ''}${ex <= 0 ? ' empty' : ''}`);
    // fumes tint (> 0.6) + explosion flash
    const tint = clamp((f - 0.6) / 0.4, 0, 1);
    this._set('tint', $.tint, 'opacity', (tint * (0.55 + 0.1 * Math.sin(performance.now() / 400))).toFixed(2));
    this._set('flash', $.flash, 'opacity', clamp(lab.explodedFlash || 0, 0, 1).toFixed(2));
    // cook down
    this._set('down', $.down, 'hidden', !lab.cookDown);
    if (lab.cookDown) this._set('down.t', $.downT, 'text', `Back on his feet in ${Math.ceil(lab.cookDownT || 0)} s`);
    // result card
    const r = (lab.state === 'done' || lab.state === 'failed') ? lab.result : null;
    const rsig = r ? JSON.stringify([r.ok, r.recipeId, r.quality, r.reason]) : '';
    if (rsig !== this._resultSig) {
      this._resultSig = rsig;
      $.result.hidden = !r;
      if (r) {
        const q = Math.round((r.quality ?? 0) * 100);
        const what = r.ok ? (r.kind === 'product' ? `+${r.units} bags of ${esc(this.data.lab?.product?.name || 'product')}` : r.kind === 'gadget' ? `+1 ${esc(r.gadget)} for Rook` : 'Repair done') : esc(r.reason === 'aborted' ? 'Batch dumped' : r.reason === 'explosion' ? 'Blew up the batch' : r.reason || 'Ruined');
        $.result.className = `vh-result vh-glass ${r.ok ? 'good' : 'bad'}`;
        $.result.innerHTML = `<header><span class="vh-lbl">${r.ok ? 'Batch done' : 'Batch failed'}</span>${r.ok ? `<b class="vh-num">${q}%</b>` : ''}</header><h4>${esc(r.name || '')}</h4><p>${what}</p>
          <ul>${(r.steps || []).map((x) => `<li><span>${esc(x.label)}</span><i style="width:${Math.round(x.score * 100)}%"></i></li>`).join('')}</ul>
          <button type="button" tabindex="-1" data-ok="1">OK</button>`;
      }
    }
  }

  destroy() {
    if (this._unsub) this._unsub();
    for (const t of this.$.toasts.children) clearTimeout(t._t);
    this.el.remove();
  }
}
