// ─────────────────────────────────────────────────────────────────────────────
// OnfootHud — DOM overlay shared by GarageView and the shop challenges (styled by css/onfoot.css).
// Everything lives in ONE container (.ofh) appended to the HUD root you pass in; pointer-events are
// off except on buttons. destroy() removes it.
// R3-GARAGE: "dark glass" (css/tokens.css, docs/r3/ui/Garage-Exit.png). New, additive:
//   hud.left / hud.right                 slots under the main HUD's top row (16 px margins, top 80 px)
//   hud.checklist({ label, title, steps:[{ id, label, who:'both'|'rook'|'doc' }] }) → Checklist
//   checklist.set(states, done)          states: { [id]: 'done'|'cur'|'' } — writes the DOM only on change
//   hud.chip(parent, cls) → Chip         chip.set(html) (only on change), chip.show(bool)
// Unity: a uGUI Canvas prefab with the same pieces (instruction card, hold ring, checklist, chips).
// ─────────────────────────────────────────────────────────────────────────────

export function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** "Grab the keys [E]" → html with <kbd> keycaps. */
export function keycaps(s) { return esc(s).replace(/\[([A-Za-z0-9 ←→↑↓]+?)\]/g, '<kbd>$1</kbd>'); }

const RING = (r) => `<svg viewBox="0 0 44 44" class="ofh-ring"><circle cx="22" cy="22" r="${r}" class="bg"/><circle cx="22" cy="22" r="${r}" class="fg" pathLength="100" stroke-dasharray="0 100"/></svg>`;
/** Standard 24-px stroke icon (the Round 3 UI icon set). */
export const icon = (d, { s = 14, sw = 2.2, c = 'currentColor' } = {}) => `<svg aria-hidden="true" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const ICONS = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  turnRight: '<path d="M6 20v-7a4 4 0 0 1 4-4h9M15 5l4 4-4 4"/>',
  flask: '<path d="M9.5 3.5h5M10.5 3.5v5.2L4.8 18a1.8 1.8 0 0 0 1.6 2.6h11.2a1.8 1.8 0 0 0 1.6-2.6l-5.7-9.3V3.5"/><path d="M7.3 14.5h9.4"/>',
  wheel: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.2"/><path d="M12 14.2v6.3M9.9 11.3l-6.1-2M14.1 11.3l6.1-2"/>',
  skip: '<path d="M5 5l8 7-8 7zM15 5v14"/>',
};
const WHO = { both: 'Both', rook: 'Rook', doc: 'Doc' };

export class OnfootHud {
  constructor(hudRoot, { kind = 'garage', role = 'driver' } = {}) {
    const host = hudRoot || document.body;
    this.root = el('div', `ofh ofh--${kind} ofh--${role}`, host);
    this.root.setAttribute('aria-live', 'polite');
    this.top = el('div', 'ofh-top', this.root);
    this.left = el('div', 'ofh-left', this.root);      // R3-GARAGE: under the main HUD's top-left panel
    this.right = el('div', 'ofh-right', this.root);    // R3-GARAGE: under the main HUD's top-right panel
    this.center = el('div', 'ofh-center', this.root);
    this.bottom = el('div', 'ofh-bottom', this.root);
    this.pops = el('div', 'ofh-pops', this.root);
    this.fadeEl = el('div', 'ofh-fade', this.root);
    this._instr = null; this._hold = null; this._last = {};
  }

  // ── instruction card (bottom centre) ──────────────────────────────────────
  instruction(text, { near = false, who = '', icon: ico = '', sub = '' } = {}) {
    if (!this._instr) {
      const c = el('div', 'ofh-instr', this.bottom);
      const body = el('div', 'ofh-instr-body', c);
      this._instr = { c, who: el('div', 'ofh-instr-who', body), txt: el('div', 'ofh-instr-txt', body), sub: el('div', 'ofh-instr-sub', body) };
    }
    const I = this._instr;
    const key = `${text}|${near}|${who}|${sub}`;
    if (this._last.instr === key) return;
    const textChanged = this._last.instrText !== text;
    this._last.instr = key; this._last.instrText = text;
    I.who.textContent = who;
    I.who.style.display = who ? '' : 'none';
    I.txt.innerHTML = (ico ? `<i class="ofh-ico">${ico}</i>` : '') + keycaps(text);
    I.sub.innerHTML = keycaps(sub);
    I.sub.style.display = sub ? '' : 'none';
    I.c.classList.toggle('near', !!near);
    if (textChanged) { I.c.classList.remove('bump'); void I.c.offsetWidth; I.c.classList.add('bump'); }
  }

  /** Hold-E progress ring next to the instruction (null hides it). */
  hold(v, label = 'E') {
    if (!this._hold) {
      const h = el('div', 'ofh-hold', this._instr ? this._instr.c : this.bottom, RING(18) + `<b></b>`);
      this._hold = { h, fg: h.querySelector('.fg'), b: h.querySelector('b'), v: null };
    }
    const H = this._hold;
    if (v == null) { if (H.v !== null) { H.h.classList.remove('on'); H.v = null; } return; }
    const pct = Math.round(Math.max(0, Math.min(1, v)) * 100);
    if (H.v === pct && H.label === label) return;
    H.v = pct; H.label = label;
    H.h.classList.add('on');
    H.b.textContent = label;
    H.fg.setAttribute('stroke-dasharray', `${pct} 100`);
    H.h.classList.toggle('full', pct >= 100);
  }

  /** Floating pop text (at screen x/y in px, or centred). tone: good | bad | info | big */
  pop(text, tone = 'good', x = null, y = null) {
    const p = el('div', `ofh-pop ofh-pop--${tone}`, this.pops, keycaps(text));
    if (x != null) { p.style.left = `${x}px`; p.style.top = `${y}px`; } else p.classList.add('mid');
    setTimeout(() => p.remove(), tone === 'big' ? 1500 : 1100);
    return p;
  }

  /** Black fade overlay: to 0..1 over ms. */
  fade(to, ms = 400) {
    this.fadeEl.style.transitionDuration = `${ms}ms`;
    this.fadeEl.style.opacity = String(to);
  }

  /** R3-GARAGE: the dark-glass step checklist (Garage-Exit.png). */
  checklist(opts) { return new Checklist(this.left, opts); }
  /** R3-GARAGE: a dark-glass chip (label + value + detail) whose content is written only when it changes. */
  chip(parent, cls = '') { return new Chip(parent || this.right, cls); }

  destroy() { this.root.remove(); }
}

/** Step checklist panel: "ROOK'S GARAGE · 3/7", a title, a progress bar and one row per step. */
export class Checklist {
  constructor(parent, { label = '', title = '', steps = [] } = {}) {
    this.steps = steps;
    this.el = el('section', 'ofc g-panel', parent);
    this.el.setAttribute('aria-label', 'Tutorial');
    const head = el('div', 'ofc-head', this.el);
    el('span', 'ofc-label', head, esc(label));
    this.countEl = el('span', 'ofc-count', head, `0/${steps.length}`);
    this.titleEl = el('div', 'ofc-title', this.el, esc(title));
    const bar = el('div', 'ofc-bar', this.el);
    this.fillEl = el('i', '', bar);
    const list = el('ol', 'ofc-rows', this.el);
    this.rows = steps.map((s) => {
      const li = el('li', '', list, `<span class="ofc-dot">${icon(ICONS.check, { s: 11, sw: 3, c: '#0B1A0E' })}</span><span class="ofc-name">${esc(s.label)}</span><span class="ofc-who ofc-who--${s.who || 'both'}">${WHO[s.who] || WHO.both}</span>`);
      li.dataset.id = s.id;
      return li;
    });
    this._done = -1;
  }
  /** states: { [stepId]: 'done' | 'cur' | '' }; done = number of completed steps. */
  set(states, done) {
    this.steps.forEach((s, i) => {
      const st = states[s.id] || '';
      const li = this.rows[i];
      if (li.dataset.st !== st) { li.dataset.st = st; li.className = st; }
    });
    if (done !== this._done) {
      this._done = done;
      const n = this.steps.length;
      this.countEl.textContent = `${done}/${n}`;
      this.countEl.classList.toggle('all', done >= n);
      this.fillEl.style.width = `${Math.round((done / Math.max(1, n)) * 100)}%`;
    }
  }
  setTitle(t) { if (this._title !== t) { this._title = t; this.titleEl.textContent = t; } }
  remove() { this.el.remove(); }
}

/** A single-line glass chip (28 px): set(html) writes only on change; show(false) hides it. */
export class Chip {
  constructor(parent, cls = '') { this.el = el('div', `ofc-chip g-panel ${cls}`.trim(), parent); this._html = null; this._vis = true; }
  set(html) { if (html !== this._html) { this._html = html; this.el.innerHTML = html; } return this; }
  show(on) { on = !!on; if (on !== this._vis) { this._vis = on; this.el.style.display = on ? '' : 'none'; } return this; }
  remove() { this.el.remove(); }
}

/** Shared result card. score 0..1, bonus at ≥ bonusAt. Calls onContinue once (button, E, Enter, Space or after autoMs). */
export function resultCard(parent, { title, score, bonusAt = 0.8, lines = [], autoMs = 3600, onContinue }) {
  const pct = Math.round(Math.max(0, Math.min(1, score)) * 100);
  const stars = score >= 0.8 ? 3 : score >= 0.5 ? 2 : score > 0 ? 1 : 0;
  const card = el('div', 'ofh-result', parent);
  const grade = score >= 0.95 ? 'FLAWLESS' : score >= 0.8 ? 'GREAT RUN' : score >= 0.5 ? 'GOOD ENOUGH' : score > 0 ? 'SCRAPED BY' : 'NO DICE';
  card.innerHTML = `
    <div class="ofh-res-cap">${esc(title)}</div>
    <div class="ofh-res-grade">${grade}</div>
    <div class="ofh-res-stars">${[0, 1, 2].map((i) => `<i class="${i < stars ? 'on' : ''}" style="animation-delay:${0.25 + i * 0.18}s">★</i>`).join('')}</div>
    <div class="ofh-res-bar"><i style="width:0%"></i><b>${pct}%</b></div>
    ${score >= bonusAt ? '<div class="ofh-res-bonus">+1 BONUS SUPPLY</div>' : ''}
    <ul class="ofh-res-lines">${lines.map((l) => `<li>${keycaps(l)}</li>`).join('')}</ul>
    <button class="ofh-res-btn" type="button">Back to the RV <kbd>E</kbd></button>`;
  requestAnimationFrame(() => { const f = card.querySelector('.ofh-res-bar i'); if (f) f.style.width = `${pct}%`; card.classList.add('in'); });
  let done = false;
  const go = () => { if (done) return; done = true; clearTimeout(tm); card.classList.add('out'); setTimeout(() => card.remove(), 260); onContinue && onContinue(); };
  card.querySelector('button').addEventListener('click', go);
  const tm = setTimeout(go, autoMs);
  return { el: card, go, get done() { return done; } };
}
