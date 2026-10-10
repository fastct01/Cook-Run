// ─────────────────────────────────────────────────────────────────────────────
// VanHud — DOM overlay for the 3D van lab (inside the given hudRoot).
// Interaction prompt, step panel, Recipe Board overlay, pantry list, hazard meters,
// lab toasts, batch result card, cook-down banner, fumes tint, explosion flash, legend.
// pointer-events: none except buttons; buttons never take keyboard focus (tabindex=-1,
// preventDefault on mousedown). Styles: css/van.css (all under .vh).
// Unity: a UI Toolkit document bound to the same CookLab state.
// ─────────────────────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const GROUPS = ['Products', 'Gadgets', 'Repairs'];

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
    el.className = 'vh';
    el.innerHTML = `
      <div class="vh-tint"></div>
      <div class="vh-flash"></div>
      <div class="vh-toasts"></div>
      <div class="vh-step vh-card" hidden>
        <div class="vh-step-top"><span class="vh-step-name"></span><span class="vh-step-n"></span></div>
        <div class="vh-step-label"></div>
        <div class="vh-step-ins"></div>
        <div class="vh-step-hint"></div>
        <div class="vh-bar"><i></i></div>
        <div class="vh-step-foot"><span class="vh-q"></span><span class="vh-step-where"></span></div>
        <div class="vh-away" hidden></div>
      </div>
      <div class="vh-prompt" hidden></div>
      <div class="vh-meters vh-card">
        <div class="vh-m vh-m-fumes"><span>FUMES</span><b><i></i></b></div>
        <div class="vh-m vh-m-fire"><span>FIRE</span><b><i></i></b></div>
        <div class="vh-m vh-m-ext"><span>EXTING.</span><em></em></div>
        <div class="vh-flags"><span class="vh-f-vent">VENT SHUT</span><span class="vh-f-curt">CURTAINS OPEN</span></div>
      </div>
      <div class="vh-legend"><kbd>WASD</kbd> walk <i>·</i> <kbd>E</kbd> use <i>·</i> <kbd>Q</kbd>/<kbd>Esc</kbd> step away <i>·</i> <kbd>wheel</kbd> zoom <i>·</i> click floor to walk</div>
      <div class="vh-pantry vh-card" hidden></div>
      <div class="vh-board" hidden><div class="vh-board-in vh-card"></div></div>
      <div class="vh-result vh-card" hidden></div>
      <div class="vh-down" hidden><b>DOC IS OUT COLD</b><span></span></div>`;
    root.appendChild(el);
    this.el = el;
    const $ = (s) => el.querySelector(s);
    this.$ = {
      tint: $('.vh-tint'), flash: $('.vh-flash'), toasts: $('.vh-toasts'), step: $('.vh-step'), stepName: $('.vh-step-name'), stepN: $('.vh-step-n'),
      stepLabel: $('.vh-step-label'), stepIns: $('.vh-step-ins'), stepHint: $('.vh-step-hint'), bar: $('.vh-bar i'), q: $('.vh-q'), where: $('.vh-step-where'),
      away: $('.vh-away'), prompt: $('.vh-prompt'), meters: $('.vh-meters'), fumes: $('.vh-m-fumes i'), fire: $('.vh-m-fire i'), ext: $('.vh-m-ext em'),
      fumesRow: $('.vh-m-fumes'), fireRow: $('.vh-m-fire'), vent: $('.vh-f-vent'), curt: $('.vh-f-curt'), pantry: $('.vh-pantry'), board: $('.vh-board'),
      boardIn: $('.vh-board-in'), result: $('.vh-result'), down: $('.vh-down'), downT: $('.vh-down span'), legend: $('.vh-legend'),
    };
    this.boardOpen = false; this.pantryOpen = false;
    this._dumpArm = 0;
    this._boardSig = ''; this._pantrySig = ''; this._resultSig = ''; this._promptSig = ''; this._stepSig = '';
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

  // ── toasts ────────────────────────────────────────────────────────────────
  toast(text, tone = 'info') {
    if (!text) return;
    const box = this.$.toasts;
    const last = box.lastElementChild;
    if (last && last.dataset.text === text && !last.classList.contains('out')) { last.classList.remove('pop'); void last.offsetWidth; last.classList.add('pop'); return; }
    const t = document.createElement('div');
    t.className = `vh-toast ${tone}`;
    t.dataset.text = text;
    t.textContent = text;
    box.appendChild(t);
    while (box.children.length > 4) box.firstElementChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, 2800);
  }

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
      return `<section><h3>${g}</h3><div class="vh-cards">${items.map((r) => {
        n++;
        const can = r.canMake && lab.canStart;
        const yieldTxt = r.kind === 'product' ? `+${r.units} bags` : r.kind === 'gadget' ? `+1 ${esc(r.gadget)}` : r.recipe?.repair?.rv ? `+${r.recipe.repair.rv} hull` : r.recipe?.repair?.crew ? `+${r.recipe.repair.crew} crew` : '';
        return `<div class="vh-rc ${r.kind} ${r.canMake ? 'ok' : 'no'}">
          <kbd>${n}</kbd>
          <div class="vh-rc-h"><b>${esc(r.name)}</b><span>${r.steps} steps${yieldTxt ? ' · ' + esc(yieldTxt) : ''}</span></div>
          <p>${esc(r.desc)}</p>
          <ul>${r.needs.map((x) => `<li class="${x.ok ? 'ok' : 'no'}"><i style="background:${esc(x.color)}"></i>${esc(x.name)} <b>${x.have}/${x.need}</b></li>`).join('')}</ul>
          <button type="button" tabindex="-1" data-cook="${esc(r.id)}" ${can ? '' : 'disabled'}>${r.canMake ? 'Cook' : 'Missing stuff'}</button>
        </div>`;
      }).join('')}</div></section>`;
    }).join('');
    const cur = running && lab.recipe ? `<div class="vh-board-cur">Cooking <b>${esc(lab.recipe.name)}</b> — finish or dump it first.
      <button type="button" tabindex="-1" class="vh-dump ${this._dumpArm > 0 ? 'armed' : ''}" data-dump="1">${this._dumpArm > 0 ? 'Really dump it?' : 'Dump batch'}</button></div>` : '';
    this.$.boardIn.innerHTML = `<header><b>RECIPE BOARD</b><span>number keys pick · Esc closes</span><button type="button" tabindex="-1" class="vh-x" data-close="1">✕</button></header>${cur}<div class="vh-groups">${groups}</div>`;
  }
  _renderPantry() {
    const lab = this.lab;
    const mat = lab.inv?.mat || {};
    const ing = this.data.lab?.ingredients || {};
    const sig = JSON.stringify(mat);
    if (sig === this._pantrySig) return;
    this._pantrySig = sig;
    this.$.pantry.innerHTML = `<h4>PANTRY</h4><ul>${Object.entries(ing).map(([id, x]) => {
      const c = mat[id] || 0;
      return `<li class="${c ? '' : 'none'}"><i style="background:${esc(x.color)}"></i>${esc(x.name)}<b>${c}</b></li>`;
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

  // ── per frame ─────────────────────────────────────────────────────────────
  /**
   * s: { prompt: {key, text, tone}|null, hint, stationName(id), working: bool, nextName, awayText, carrying, docState }
   */
  update(dt, s = {}) {
    if (!this.visible) return;
    const lab = this.lab, $ = this.$;
    if (this._dumpArm > 0) { this._dumpArm -= dt; if (this._dumpArm <= 0) { this._dumpArm = 0; this._boardSig = ''; } }
    if (this.boardOpen) this._renderBoard();
    if (this.pantryOpen) this._renderPantry();
    // prompt
    const p = s.prompt;
    const psig = p ? `${p.key}|${p.text}|${p.tone}|${p.sub || ''}` : '';
    if (psig !== this._promptSig) {
      this._promptSig = psig;
      $.prompt.hidden = !p;
      if (p) {
        $.prompt.className = `vh-prompt ${p.tone || ''}`;
        $.prompt.innerHTML = `${p.key ? `<kbd>${esc(p.key)}</kbd>` : ''}<span>${esc(p.text)}</span>${p.sub ? `<small>${esc(p.sub)}</small>` : ''}`;
      }
    }
    // step panel
    const st = lab.getCurrentStep ? lab.getCurrentStep() : null;
    const req = lab.state === 'requesting';
    $.step.hidden = !(st || req);
    if (req) {
      $.stepName.textContent = lab.recipe?.name || '';
      $.stepN.textContent = '';
      $.stepLabel.textContent = 'Waiting for the driver…';
      $.stepIns.textContent = 'Asking for the ingredients';
      $.stepHint.textContent = '';
      $.bar.style.width = '0%';
      $.q.textContent = ''; $.where.textContent = '';
      $.away.hidden = true;
    } else if (st) {
      $.stepName.textContent = lab.recipe?.name || '';
      $.stepN.textContent = `STEP ${st.index + 1}/${st.count}`;
      $.stepLabel.textContent = st.paused && st.next ? `Next: ${st.next}` : st.label;
      $.stepIns.textContent = st.paused ? (st.lastStep ? `${st.lastStep.label} — ${Math.round(st.lastStep.score * 100)}%` : '') : (st.instructions || '');
      $.stepHint.textContent = !st.paused && s.working && s.hint ? s.hint : '';
      $.bar.style.width = `${Math.round(clamp(st.progress, 0, 1) * 100)}%`;
      const q = lab.qualitySoFar;
      $.q.textContent = q == null ? 'Quality —' : `Quality ${Math.round(q * 100)}%`;
      $.where.textContent = s.nextName ? `@ ${s.nextName}` : '';
      const away = s.awayText;
      $.away.hidden = !away;
      if (away) $.away.textContent = away;
      $.step.classList.toggle('warn', !!away && /burner/i.test(away));
    }
    // meters
    const f = lab.fumes || 0, fire = lab.fire || 0;
    $.fumes.style.width = `${Math.round(f * 100)}%`;
    $.fumesRow.classList.toggle('hot', f > (this.data.lab?.hazards?.fumesHurtAbove ?? 0.75) - 0.15);
    $.fire.style.width = `${Math.round(fire * 100)}%`;
    $.fireRow.classList.toggle('hot', fire > 0);
    const ex = lab.extinguisher ?? 0, exMax = lab.extinguisherMax ?? 3;
    const exSig = `${ex}/${exMax}/${s.carrying ? 1 : 0}`;
    if ($.ext.dataset.sig !== exSig) { $.ext.dataset.sig = exSig; $.ext.innerHTML = Array.from({ length: exMax }, (_, i) => `<i class="${i < ex ? 'on' : ''}"></i>`).join('') + (s.carrying ? '<u>in hand</u>' : ''); }
    $.vent.textContent = lab.ventOpen ? 'VENT OPEN' : 'VENT SHUT';
    $.vent.classList.toggle('on', !!lab.ventOpen);
    $.curt.textContent = lab.curtainsClosed ? 'CURTAINS SHUT' : 'CURTAINS OPEN';
    $.curt.classList.toggle('on', !!lab.curtainsClosed);
    $.curt.classList.toggle('alarm', !!lab.copAlarm);
    // fumes tint (> 0.6) + explosion flash
    const tint = clamp((f - 0.6) / 0.4, 0, 1);
    $.tint.style.opacity = (tint * (0.55 + 0.1 * Math.sin(performance.now() / 400))).toFixed(3);
    $.flash.style.opacity = clamp(lab.explodedFlash || 0, 0, 1).toFixed(3);
    // cook down
    $.down.hidden = !lab.cookDown;
    if (lab.cookDown) $.downT.textContent = `back in ${Math.ceil(lab.cookDownT || 0)}s`;
    // result card
    const r = (lab.state === 'done' || lab.state === 'failed') ? lab.result : null;
    const rsig = r ? JSON.stringify([r.ok, r.recipeId, r.quality, r.reason]) : '';
    if (rsig !== this._resultSig) {
      this._resultSig = rsig;
      $.result.hidden = !r;
      if (r) {
        const q = Math.round((r.quality ?? 0) * 100);
        const what = r.ok ? (r.kind === 'product' ? `+${r.units} bags of ${esc(this.data.lab?.product?.name || 'product')}` : r.kind === 'gadget' ? `+1 ${esc(r.gadget)} for the driver` : 'Repair done') : esc(r.reason === 'aborted' ? 'Batch dumped' : r.reason === 'explosion' ? 'Blew up the batch' : r.reason || 'Ruined');
        $.result.className = `vh-result vh-card ${r.ok ? 'good' : 'bad'}`;
        $.result.innerHTML = `<b>${r.ok ? 'BATCH DONE' : 'BATCH FAILED'}</b><h4>${esc(r.name || '')}</h4><p>${what}</p>${r.ok ? `<div class="vh-qbig">${q}<small>%</small></div>` : ''}
          <ul>${(r.steps || []).map((x) => `<li><span>${esc(x.label)}</span><i style="width:${Math.round(x.score * 100)}%"></i></li>`).join('')}</ul>
          <button type="button" tabindex="-1" data-ok="1">OK</button>`;
      }
    }
  }

  destroy() {
    if (this._unsub) this._unsub();
    this.el.remove();
  }
}
