// ─────────────────────────────────────────────────────────────────────────────
// ShopHud — Round 3 (agent SHOPS) first-person shop-run overlay, "dark glass" (css/tokens.css + css/onfoot.css
// `.fps-*`). Matches docs/r3/ui/Cook-Shop.png: task card top-left (under the HUD's Wanted panel), timer card
// top-centre, alert pill under it, crosshair + context prompt in the middle, a chevron over the goal (an edge
// arrow when it is off screen), a threat marker + red side vignette, controls card bottom-left, gauges, result card.
// One container; every setter writes the DOM only when its value changed. Nothing bounces: fades / ≤ 8 px slides.
// ─────────────────────────────────────────────────────────────────────────────
export function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** "Grab [E]" → html with keycaps. */
export function keycaps(s) { return esc(s).replace(/\[([A-Za-z0-9 ←→↑↓/]+?)\]/g, '<kbd class="fps-kc">$1</kbd>'); }

const SVG = (d, { s = 16, sw = 2, c = 'currentColor', fill = 'none' } = {}) => `<svg aria-hidden="true" width="${s}" height="${s}" viewBox="0 0 24 24" fill="${fill}" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const ICON = {
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  cam: '<path d="M3 7l12 4-1.6 4.4L2.2 11.6z"/><path d="M15 11l3-1M13 15.4l1 3.6h5"/><path d="M19 19v-5"/>',
  hand: '<path d="M7 21v-6.5L4.8 10.3a1.4 1.4 0 0 1 2.3-1.5L9 11V4.5a1.3 1.3 0 0 1 2.6 0V10V3.6a1.3 1.3 0 0 1 2.6 0V10V5a1.3 1.3 0 0 1 2.6 0v5.5V7.2a1.3 1.3 0 0 1 2.6 0V15c0 3-2 6-5 6z"/>',
  funnel: '<path d="M3.5 4.5h17l-6.5 7.5v4.5l-4 3v-7.5z"/>',
  tape: '<circle cx="11" cy="12" r="7"/><circle cx="11" cy="12" r="2.6"/><path d="M11 19h10"/>',
  box: '<path d="M3.5 8L12 4l8.5 4v8L12 20l-8.5-4z"/><path d="M3.5 8L12 12l8.5-4M12 12v8"/>',
  tag: '<path d="M3.5 12.5V4.5h8l9 9-8 8z"/><circle cx="8" cy="8.5" r="1.4"/>',
  drop: '<path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>',
  cart: '<path d="M3 4h2.5l2.2 10.5h10.6L20.5 7H6.4"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  scan: '<path d="M4 8V5h3M20 8V5h-3M4 16v3h3M20 16v3h-3M4 12h16"/>',
  goat: '<path d="M7 5c-1.5 0-3 1-3 3M17 5c1.5 0 3 1 3 3"/><path d="M8 8h8l-1 7a3 3 0 0 1-6 0z"/><path d="M12 18v3"/>',
  sack: '<path d="M8 4h8l-1.5 3c3 1.5 4.5 4.5 4.5 8 0 3-2 5-7 5s-7-2-7-5c0-3.5 1.5-6.5 4.5-8z"/>',
  magnet: '<path d="M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4z"/><path d="M6 8h4M14 8h4"/>',
  coil: '<ellipse cx="12" cy="7" rx="7" ry="2.5"/><path d="M5 7v10c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V7"/><path d="M5 11c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5M5 14.5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/>',
  pallet: '<path d="M3 15h18M3 19h18M5 15v4M12 15v4M19 15v4"/><path d="M6 15V8h12v7"/>',
  rack: '<path d="M4 18h16M6 18V9h12v9"/><path d="M9 13h6"/>',
  torch: '<path d="M4 15l6-6 5 5-6 6z"/><path d="M13 7l3-3 4 4-3 3"/><path d="M15 12l4 4"/>',
  jug: '<path d="M9 3h5v3l3 3v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9l3-3z"/><path d="M14 6h3v4"/>',
  door: '<path d="M5 21V4h10v17"/><path d="M15 6l4 1v14"/><circle cx="12" cy="13" r=".8"/>',
  alarm: '<path d="M6 17V12a6 6 0 0 1 12 0v5"/><path d="M4 17h16v3H4zM12 3v2M4.5 6.5l1.4 1.4M19.5 6.5l-1.4 1.4"/>',
  gauge: '<path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4-5"/>',
  esc: '<path d="M15 5l-7 7 7 7"/>',
  arrow: '<path d="M15 5l-7 7 7 7"/>',
};
export const icon = (name, o) => SVG(ICON[name] || ICON.box, o);

const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class ShopHud {
  /**
   * @param {HTMLElement} host
   * @param {{ store: string, timerLabel?: string, controls?: Array<[string, string]> }} o
   */
  constructor(host, o = {}) {
    this.root = el('div', 'fps', host || document.body);
    this.root.setAttribute('aria-live', 'polite');
    this._v = {};
    // vignette + flash
    this.vig = el('div', 'fps-vig', this.root);
    this.flashEl = el('div', 'fps-flash', this.root);
    // timer card (top centre)
    this.timer = el('div', 'fps-timer fps-glass', this.root, `${icon('clock', { s: 18, sw: 2.2 })}<div class="fps-timer-txt"><div class="fps-cap">${esc(o.timerLabel || 'Back to the RV in')}</div><div class="fps-timer-store">${esc(o.store || '')}</div></div><b class="fps-timer-t">0:00</b><div class="fps-timer-bar"><i></i></div>`);
    this.timerT = this.timer.querySelector('.fps-timer-t'); this.timerBar = this.timer.querySelector('.fps-timer-bar i');
    // alert pill (under the timer)
    this.alert = el('div', 'fps-alert fps-glass', this.root, '<span class="fps-alert-ico"></span><b></b><span class="fps-alert-sub"></span><span class="fps-mini"><i></i></span><span class="fps-alert-pct"></span>');
    this.alertIco = this.alert.querySelector('.fps-alert-ico'); this.alertB = this.alert.querySelector('b'); this.alertSub = this.alert.querySelector('.fps-alert-sub');
    this.alertMini = this.alert.querySelector('.fps-mini'); this.alertBar = this.alert.querySelector('.fps-mini i'); this.alertPct = this.alert.querySelector('.fps-alert-pct');
    // task card (top left)
    this.task = el('section', 'fps-task fps-glass fps-glass--hi', this.root, '<div class="fps-task-head"><span class="fps-cap"></span><span class="fps-task-n"></span></div><div class="fps-task-store"></div><div class="fps-task-rows"></div><div class="fps-task-foot"></div>');
    this.taskCap = this.task.querySelector('.fps-cap'); this.taskN = this.task.querySelector('.fps-task-n');
    this.taskStore = this.task.querySelector('.fps-task-store'); this.taskRows = this.task.querySelector('.fps-task-rows'); this.taskFoot = this.task.querySelector('.fps-task-foot');
    // threat marker (left/right edge)
    this.threat = el('div', 'fps-threat fps-glass fps-glass--hi', this.root, `<span class="fps-threat-l">${icon('arrow', { s: 14, sw: 2.6 })}</span>${icon('cam', { s: 14 })}<span class="fps-threat-r">${icon('arrow', { s: 14, sw: 2.6 })}</span>`);
    // goal chevron + edge arrow
    this.mark = el('div', 'fps-mark', this.root, '<svg aria-hidden="true" width="20" height="14" viewBox="0 0 20 14"><path d="M2 2l8 9 8-9" fill="none" stroke="#F2B90F" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    this.edge = el('div', 'fps-edge', this.root, '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24"><path d="M9 4l9 8-9 8" fill="none" stroke="#F2B90F" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    // crosshair + prompt
    this.xhair = el('div', 'fps-xhair', this.root, '<svg aria-hidden="true" width="64" height="64" viewBox="0 0 64 64"><circle class="r" cx="32" cy="32" r="7" fill="none" stroke-width="1.5"/><circle class="d" cx="32" cy="32" r="1.5"/><circle class="h" cx="32" cy="32" r="12" fill="none" stroke-width="2.5" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90 32 32)"/></svg>');
    this.xhold = this.xhair.querySelector('.h');
    this.prompt = el('div', 'fps-prompt fps-glass', this.root, '<kbd class="fps-kc fps-kc--lg">E</kbd><div><div class="fps-prompt-t"></div><div class="fps-prompt-s"></div></div>');
    this.promptK = this.prompt.querySelector('kbd'); this.promptT = this.prompt.querySelector('.fps-prompt-t'); this.promptS = this.prompt.querySelector('.fps-prompt-s');
    // gauge (haggle needle / pump meter / scan beam / mash bar)
    this.gaugeEl = el('div', 'fps-gauge fps-glass', this.root, '<div class="fps-gauge-cap"><span class="fps-cap"></span><span class="fps-gauge-hint"></span></div><div class="fps-gauge-track"><div class="zone"></div><div class="fill"></div><div class="line"></div><div class="needle"></div></div>');
    this.g = {
      cap: this.gaugeEl.querySelector('.fps-cap'), hint: this.gaugeEl.querySelector('.fps-gauge-hint'), track: this.gaugeEl.querySelector('.fps-gauge-track'),
      zone: this.gaugeEl.querySelector('.zone'), fill: this.gaugeEl.querySelector('.fill'), line: this.gaugeEl.querySelector('.line'), needle: this.gaugeEl.querySelector('.needle'),
    };
    // toast line (one at a time, fades)
    this.toastEl = el('div', 'fps-toast', this.root);
    // controls card (bottom left)
    const ctl = o.controls || [['Mouse', 'look'], ['W A S D', 'walk'], ['Shift', 'run'], ['E', 'grab']];
    this.keys = el('section', 'fps-keys fps-glass', this.root);
    this.setControls(ctl);
    // hold-Esc ring + lock hint
    this.escEl = el('div', 'fps-escring fps-glass', this.root, '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="3"/><circle class="p" cx="12" cy="12" r="9" fill="none" stroke="#E5483A" stroke-width="3" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90 12 12)"/></svg><span>Leaving the shop…</span>');
    this.escP = this.escEl.querySelector('.p');
    this.lockEl = el('div', 'fps-lock fps-glass', this.root, '<kbd class="fps-kc">Click</kbd><span>to look around</span>');
    // centre slot (intro / result)
    this.center = el('div', 'fps-center', this.root);
    this.fadeEl = el('div', 'fps-fade', this.root);
  }

  _set(key, val, fn) { if (this._v[key] === val) return; this._v[key] = val; fn(val); }
  show(part, on) { const e = this[part]; if (!e) return; this._set('show_' + part, !!on, (v) => e.classList.toggle('on', v)); }

  setControls(list) {
    const k = list.map(([key, what]) => `<span class="fps-keys-i">${key.split(' ').map((x) => `<kbd class="fps-kc">${esc(x)}</kbd>`).join('')}<span>${esc(what)}</span></span>`).join('');
    this._set('controls', k, (v) => { this.keys.innerHTML = `<div class="fps-keys-row">${v}</div><div class="fps-keys-esc"><kbd class="fps-kc">Esc</kbd><span>hold to leave</span></div>`; });
  }

  setTimer(tLeft, frac, low = false) {
    this._set('timer', fmt(tLeft), (v) => { this.timerT.textContent = v; });
    this._set('timerBar', Math.round(frac * 200) / 200, (v) => { this.timerBar.style.transform = `scaleX(${v})`; });
    this._set('timerLow', !!low, (v) => this.timer.classList.toggle('low', v));
  }
  timerHit() { this.timer.classList.remove('hit'); void this.timer.offsetWidth; this.timer.classList.add('hit'); }

  /** rows: [{ text, state: 'done'|'cur'|'todo', icon }] */
  setTask({ cap = '', n = '', store = '', rows = [], foot = '' } = {}) {
    this._set('taskCap', cap, (v) => { this.taskCap.textContent = v; });
    this._set('taskN', n, (v) => { this.taskN.textContent = v; });
    this._set('taskStore', store, (v) => { this.taskStore.textContent = v; this.taskStore.style.display = v ? '' : 'none'; });
    const html = rows.map((r) => `<div class="fps-row fps-row--${r.state || 'todo'}"><span class="fps-box">${r.state === 'done' ? icon('check', { s: 12, sw: 3, c: '#0B1A0E' }) : ''}</span><span class="fps-row-t">${esc(r.text)}</span>${r.icon ? icon(r.icon, { s: 16 }) : ''}</div>`).join('');
    this._set('taskRows', html, (v) => { this.taskRows.innerHTML = v; });
    this._set('taskFoot', foot, (v) => { this.taskFoot.innerHTML = keycaps(v); this.taskFoot.style.display = v ? '' : 'none'; });
    this.show('task', true);
  }

  /** p: { key='E', text, sub } | null */
  setPrompt(p) {
    if (!p) { this.show('prompt', false); return; }
    this._set('pk', p.key || 'E', (v) => { this.promptK.textContent = v; this.promptK.style.display = v === '-' ? 'none' : ''; });
    this._set('pt', p.text || '', (v) => { this.promptT.innerHTML = keycaps(v); });
    this._set('ps', p.sub || '', (v) => { this.promptS.innerHTML = keycaps(v); this.promptS.style.display = v ? '' : 'none'; });
    this._set('ptone', p.tone || '', (v) => { this.prompt.dataset.tone = v; });
    this.show('prompt', true);
  }
  /** 'idle' | 'on' | 'off' (hidden); hold 0..1 draws a ring around it */
  setCrosshair(state, hold = 0) {
    this._set('xh', state, (v) => { this.xhair.dataset.s = v; });
    this._set('xhold', Math.round(hold * 50) / 50, (v) => { this.xhold.setAttribute('stroke-dasharray', `${Math.round(v * 100)} 100`); });
  }
  /** goal chevron at screen px (null hides); off-screen → edge arrow at angle (rad, 0 = right) */
  setMarker(x, y) {
    const k = x == null ? 'off' : `${Math.round(x)},${Math.round(y)}`;
    this._set('mark', k, () => {
      if (x == null) this.mark.classList.remove('on');
      else { this.mark.classList.add('on'); this.mark.style.transform = `translate(${Math.round(x) - 10}px, ${Math.round(y) - 18}px)`; }
    });
  }
  setEdge(x, y, ang) {
    const k = x == null ? 'off' : `${Math.round(x)},${Math.round(y)},${ang.toFixed(2)}`;
    this._set('edge', k, () => {
      if (x == null) this.edge.classList.remove('on');
      else { this.edge.classList.add('on'); this.edge.style.transform = `translate(${Math.round(x) - 11}px, ${Math.round(y) - 11}px) rotate(${ang}rad)`; }
    });
  }
  /** a: { icon, text, sub, frac (0..1 | null), tone: 'red'|'amber'|'green' } | null */
  setAlert(a) {
    if (!a) { this.show('alert', false); return; }
    this._set('aic', a.icon || '', (v) => { this.alertIco.innerHTML = v ? icon(v, { s: 15, sw: 2.2 }) : ''; });
    this._set('at', a.text || '', (v) => { this.alertB.textContent = v; });
    this._set('as', a.sub || '', (v) => { this.alertSub.textContent = v; this.alertSub.style.display = v ? '' : 'none'; });
    const f = a.frac == null ? null : Math.round(Math.max(0, Math.min(1, a.frac)) * 100);
    this._set('af', f, (v) => {
      this.alertMini.style.display = v == null ? 'none' : ''; this.alertPct.style.display = v == null ? 'none' : '';
      if (v != null) { this.alertBar.style.transform = `scaleX(${v / 100})`; this.alertPct.textContent = `${v}%`; }
    });
    this._set('atone', a.tone || 'red', (v) => { this.alert.dataset.tone = v; });
    this.show('alert', true);
  }
  /** side −1 left, +1 right, 0 none (red camera-direction chip); vignette k 0..1 on that side (or both) */
  setThreat(side, k = 0) {
    this._set('thr', side, (v) => { this.threat.classList.toggle('on', v !== 0); this.threat.dataset.side = v > 0 ? 'r' : 'l'; });
    const vk = Math.round(Math.max(0, Math.min(1, k)) * 20) / 20;
    this._set('vig', `${side}|${vk}`, () => { this.vig.dataset.side = side > 0 ? 'r' : side < 0 ? 'l' : 'b'; this.vig.style.opacity = String(vk); });
  }
  flash(tone = 'red') { this.flashEl.dataset.tone = tone; this.flashEl.classList.remove('on'); void this.flashEl.offsetWidth; this.flashEl.classList.add('on'); }
  toast(text, tone = 'info') {
    clearTimeout(this._toastTm);
    this.toastEl.innerHTML = keycaps(text); this.toastEl.dataset.tone = tone;
    this.toastEl.classList.remove('on'); void this.toastEl.offsetWidth; this.toastEl.classList.add('on');
    this._toastTm = setTimeout(() => this.toastEl.classList.remove('on'), 1500);
  }

  /** g: { cap, hint, zone: [a, b] | null, line: x | null, fill: 0..1 | null, needle: 0..1 | null } | null */
  gauge(g) {
    if (!g) { this.show('gaugeEl', false); return; }
    const G = this.g;
    this._set('gcap', g.cap || '', (v) => { G.cap.innerHTML = v; });
    this._set('ghint', g.hint || '', (v) => { G.hint.innerHTML = keycaps(v); });
    const z = g.zone ? `${(g.zone[0] * 100).toFixed(1)}|${((g.zone[1] - g.zone[0]) * 100).toFixed(1)}` : 'none';
    this._set('gzone', z, () => { G.zone.style.display = g.zone ? '' : 'none'; if (g.zone) { G.zone.style.left = `${g.zone[0] * 100}%`; G.zone.style.width = `${(g.zone[1] - g.zone[0]) * 100}%`; } });
    this._set('gline', g.line ?? 'none', (v) => { G.line.style.display = v === 'none' ? 'none' : ''; if (v !== 'none') G.line.style.left = `${v * 100}%`; });
    const fl = g.fill == null ? 'none' : Math.round(g.fill * 400) / 400;
    this._set('gfill', fl, (v) => { G.fill.style.display = v === 'none' ? 'none' : ''; if (v !== 'none') G.fill.style.transform = `scaleX(${v})`; });
    const nd = g.needle == null ? 'none' : Math.round(g.needle * 400) / 400;
    this._set('gneedle', nd, (v) => { G.needle.style.display = v === 'none' ? 'none' : ''; if (v !== 'none') G.needle.style.left = `${v * 100}%`; });
    this.show('gaugeEl', true);
  }
  gaugeFlash(good) { const t = this.g.track; t.classList.remove('good', 'bad'); void t.offsetWidth; t.classList.add(good ? 'good' : 'bad'); }

  holdEsc(frac) {
    this.show('escEl', frac != null && frac > 0.02);
    if (frac != null) this._set('escp', Math.round(frac * 50) / 50, (v) => this.escP.setAttribute('stroke-dasharray', `${Math.round(v * 100)} 100`));
  }
  lockHint(on) { this.show('lockEl', on); }

  intro(title, sub) {
    const c = el('div', 'fps-intro fps-glass', this.center, `<div class="fps-cap">${esc(sub || '')}</div><div class="fps-intro-t">${esc(title)}</div>`);
    requestAnimationFrame(() => c.classList.add('on'));
    setTimeout(() => { c.classList.remove('on'); setTimeout(() => c.remove(), 220); }, 1100);
  }

  /** Result card; returns { go(), done }. onContinue fires once (button, go(), or autoMs). */
  result({ title, store, score, bonusAt = 0.8, lines = [], autoMs = 2600, onContinue }) {
    const pct = Math.round(Math.max(0, Math.min(1, score)) * 100);
    const stars = score >= 0.8 ? 3 : score >= 0.5 ? 2 : score > 0 ? 1 : 0;
    const grade = score >= 0.95 ? 'Flawless' : score >= 0.8 ? 'Great run' : score >= 0.5 ? 'Good enough' : score > 0 ? 'Scraped by' : 'No dice';
    const star = (on) => `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.5 1.1 6.4L12 17.3l-5.8 3 1.1-6.4-4.7-4.5 6.5-.9z" fill="${on ? '#F2B90F' : 'none'}" stroke="${on ? '#F2B90F' : 'rgba(241,236,228,0.38)'}" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
    const card = el('section', 'fps-result fps-glass fps-glass--hi', this.center, `
      <div class="fps-cap">${esc(store || '')}${title ? ' · ' + esc(title) : ''}</div>
      <div class="fps-res-head"><div class="fps-res-grade">${grade}</div><div class="fps-res-stars">${[0, 1, 2].map((i) => star(i < stars)).join('')}</div></div>
      <div class="fps-res-bar"><i style="transform:scaleX(${pct / 100})"></i></div>
      <div class="fps-res-pct"><b>${pct}%</b>${score >= bonusAt ? '<span class="fps-res-bonus">+1 bonus supply</span>' : ''}</div>
      <ul class="fps-res-lines">${lines.map((l) => `<li>${keycaps(l)}</li>`).join('')}</ul>
      <div class="fps-res-go"><kbd class="fps-kc">E</kbd><span>Run back to the RV</span></div>`);
    requestAnimationFrame(() => card.classList.add('on'));
    let done = false;
    const go = () => { if (done) return; done = true; clearTimeout(tm); card.classList.remove('on'); setTimeout(() => card.remove(), 220); onContinue && onContinue(); };
    const tm = setTimeout(go, autoMs);
    return { el: card, go, get done() { return done; } };
  }

  /** Black fade overlay to 0..1 over ms. */
  fade(to, ms = 300) { this.fadeEl.style.transitionDuration = `${ms}ms`; this.fadeEl.style.opacity = String(to); }
  hideAll() { for (const p of ['prompt', 'alert', 'threat', 'gaugeEl', 'escEl', 'lockEl', 'task']) this.show(p, false); this.setMarker(null); this.setEdge(null); this.setCrosshair('off'); this.setThreat(0, 0); }
  destroy() { clearTimeout(this._toastTm); this.root.remove(); }
}
