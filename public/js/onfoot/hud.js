// ─────────────────────────────────────────────────────────────────────────────
// OnfootHud — DOM overlay shared by GarageView and the shop challenges (styled by css/onfoot.css).
// Everything lives in ONE container (.ofh) appended to the HUD root you pass in; pointer-events are
// off except on buttons. destroy() removes it.
// Unity: a uGUI Canvas prefab with the same pieces (instruction card, hold ring, timer, result card).
// ─────────────────────────────────────────────────────────────────────────────

export function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** "Grab the keys [E]" → html with <kbd> keycaps. */
export function keycaps(s) { return esc(s).replace(/\[([A-Za-z0-9 ←→↑↓]+?)\]/g, '<kbd>$1</kbd>'); }

const RING = (r) => `<svg viewBox="0 0 44 44" class="ofh-ring"><circle cx="22" cy="22" r="${r}" class="bg"/><circle cx="22" cy="22" r="${r}" class="fg" pathLength="100" stroke-dasharray="0 100"/></svg>`;

export class OnfootHud {
  constructor(hudRoot, { kind = 'garage', role = 'driver' } = {}) {
    const host = hudRoot || document.body;
    this.root = el('div', `ofh ofh--${kind} ofh--${role}`, host);
    this.root.setAttribute('aria-live', 'polite');
    this.top = el('div', 'ofh-top', this.root);
    this.center = el('div', 'ofh-center', this.root);
    this.bottom = el('div', 'ofh-bottom', this.root);
    this.pops = el('div', 'ofh-pops', this.root);
    this.fadeEl = el('div', 'ofh-fade', this.root);
    this._instr = null; this._hold = null; this._last = {};
  }

  // ── instruction card (bottom centre) ──────────────────────────────────────
  instruction(text, { near = false, who = '', icon = '', sub = '' } = {}) {
    if (!this._instr) {
      const c = el('div', 'ofh-instr', this.bottom);
      this._instr = { c, who: el('div', 'ofh-instr-who', c), txt: el('div', 'ofh-instr-txt', c), sub: el('div', 'ofh-instr-sub', c) };
    }
    const I = this._instr;
    const key = `${text}|${near}|${who}|${sub}`;
    if (this._last.instr === key) return;
    this._last.instr = key;
    I.who.textContent = who;
    I.who.style.display = who ? '' : 'none';
    I.txt.innerHTML = (icon ? `<i class="ofh-ico">${icon}</i>` : '') + keycaps(text);
    I.sub.innerHTML = keycaps(sub);
    I.sub.style.display = sub ? '' : 'none';
    I.c.classList.toggle('near', !!near);
    I.c.classList.remove('bump'); void I.c.offsetWidth; I.c.classList.add('bump');
  }

  /** Hold-E progress ring next to the instruction (null hides it). */
  hold(v, label = 'E') {
    if (!this._hold) {
      const h = el('div', 'ofh-hold', this._instr ? this._instr.c : this.bottom, RING(18) + `<b></b>`);
      this._hold = { h, fg: h.querySelector('.fg'), b: h.querySelector('b') };
    }
    const H = this._hold;
    if (v == null) { H.h.classList.remove('on'); return; }
    H.h.classList.add('on');
    H.b.textContent = label;
    H.fg.setAttribute('stroke-dasharray', `${Math.round(Math.max(0, Math.min(1, v)) * 100)} 100`);
    H.h.classList.toggle('full', v >= 0.999);
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

  destroy() { this.root.remove(); }
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
