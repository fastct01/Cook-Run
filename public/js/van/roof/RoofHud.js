// ─────────────────────────────────────────────────────────────────────────────
// RoofHud — DOM overlay for the roof defence (Agent ROOF), inside the van lab's hudRoot.
//   lab view:  stop banner "Rook's in the shop — get on the roof! [R]" (clickable)
//   roof view: crosshair (follows the aim point), device bar (1/2/3 + ammo, clickable), stop status
//              + loading bar from snap.stop, cop markers with distances (on screen: bracket over the
//              car; off screen: edge arrow), hit pops ("SOAKED!"), controls legend, touch buttons.
// Styles are injected once (scoped under .rf). pointer-events: none except buttons; buttons never
// take keyboard focus. Unity: a UI Toolkit document bound to RoofClient state.
// ─────────────────────────────────────────────────────────────────────────────
const CSS = `
.rf { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 7;
  --ch: #22262a; --cream: #f1ead8; --teal: #4f8f8a; --mustard: #d9a83a; --good: #7fd6c2; --red: #d8433a; --water: #8fd8ff;
  --panel: rgba(34, 38, 42, 0.82); --edge: rgba(241, 234, 216, 0.16);
  --font: "Bahnschrift SemiCondensed", "Bahnschrift", "Roboto Condensed", "Arial Narrow", "DejaVu Sans Condensed", system-ui, sans-serif;
  --display: "Bahnschrift Condensed", Impact, Haettenschweiler, "Arial Narrow Bold", "DejaVu Sans Condensed", sans-serif;
  font-family: var(--font); font-weight: 700; color: var(--cream); user-select: none; -webkit-user-select: none; line-height: 1.15; text-shadow: 0 1px 0 rgba(0,0,0,.5); }
.rf * { box-sizing: border-box; }
.rf [hidden] { display: none !important; }
.rf button { pointer-events: auto; font: inherit; cursor: pointer; color: inherit; }
.rf kbd { display: inline-block; min-width: 1.6em; text-align: center; font: 800 12px/1 var(--font); padding: 4px 6px 3px; border-radius: 5px;
  background: var(--cream); color: var(--ch); text-shadow: none; box-shadow: 0 2px 0 rgba(0,0,0,.45); }
.rf-banner { position: absolute; left: 50%; top: 92px; transform: translateX(-50%); display: flex; align-items: center; gap: 12px; padding: 9px 16px 9px 14px;
  border-radius: 12px; background: rgba(34,38,42,.86); border: 2px solid var(--good); white-space: nowrap; pointer-events: auto; cursor: pointer;
  font-family: var(--display); font-weight: 400; font-size: 26px; letter-spacing: .04em; text-transform: uppercase; color: var(--good);
  box-shadow: 0 3px 0 rgba(0,0,0,.3), 0 0 0 0 rgba(127,214,194,.6); animation: rfPulse 1.1s ease-in-out infinite; }
.rf-banner kbd { font-size: 16px; padding: 5px 9px 4px; }
.rf-banner small { font-family: var(--font); font-size: 13px; letter-spacing: .08em; color: var(--cream); opacity: .8; }
@keyframes rfPulse { 50% { box-shadow: 0 3px 0 rgba(0,0,0,.3), 0 0 0 9px rgba(127,214,194,0); border-color: #c8fff2; } }
.rf-cross { position: absolute; left: 50%; top: 50%; width: 46px; height: 46px; margin: -23px 0 0 -23px; }
.rf-cross::before, .rf-cross::after { content: ""; position: absolute; background: rgba(255,255,255,.92); box-shadow: 0 0 0 1px rgba(0,0,0,.45); }
.rf-cross::before { left: 22px; top: 4px; width: 2px; height: 38px; }
.rf-cross::after { left: 4px; top: 22px; width: 38px; height: 2px; }
.rf-cross i { position: absolute; inset: 9px; border-radius: 50%; border: 2px solid rgba(255,255,255,.9); box-shadow: 0 0 0 1px rgba(0,0,0,.35); }
.rf-cross.spray i { border-color: var(--water); }
.rf-cross.hit i { border-color: #fff; background: rgba(143,216,255,.35); }
.rf-cross.far::before, .rf-cross.far::after { opacity: .45; }
.rf-cross b { position: absolute; left: 50%; top: 48px; transform: translateX(-50%); font-size: 12px; letter-spacing: .06em; white-space: nowrap; }
.rf-status { position: absolute; left: 50%; top: 88px; transform: translateX(-50%); min-width: 290px; padding: 7px 14px 8px; border-radius: 12px; text-align: center;
  background: var(--panel); border: 1px solid var(--edge); box-shadow: 0 3px 0 rgba(0,0,0,.28); }
.rf-status .t { font-family: var(--display); font-weight: 400; font-size: 21px; letter-spacing: .05em; text-transform: uppercase; }
.rf-status .s { font-size: 12px; letter-spacing: .1em; text-transform: uppercase; opacity: .8; margin-top: 2px; }
.rf-status.blocked { border-color: var(--red); }
.rf-status.blocked .s { color: #ffb4a8; opacity: 1; animation: rfBlink .7s step-end infinite; }
@keyframes rfBlink { 50% { opacity: .35; } }
.rf-bar { position: relative; height: 8px; margin: 6px 0 2px; border-radius: 5px; background: rgba(0,0,0,.35); overflow: hidden; }
.rf-bar i { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: linear-gradient(90deg, var(--teal), var(--good)); }
.rf-status.blocked .rf-bar i { background: var(--red); }
.rf-devices { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); display: flex; gap: 8px; }
.rf-dev { display: flex; align-items: center; gap: 7px; padding: 6px 10px 6px 7px; white-space: nowrap; border-radius: 12px; border: 2px solid var(--edge); background: var(--panel);
  font-size: 14px; letter-spacing: .03em; text-transform: uppercase; box-shadow: 0 3px 0 rgba(0,0,0,.28); transition: transform .12s; }
.rf-dev i { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; flex: none; }
.rf-dev i svg { width: 22px; height: 22px; }
.rf-dev em { font-style: normal; font-family: var(--display); font-weight: 400; font-size: 22px; min-width: 1.4em; text-align: right; }
.rf-dev.sel { border-color: var(--mustard); transform: translateY(-3px); background: rgba(52,48,38,.92); }
.rf-dev.empty { opacity: .45; }
.rf-dev.hose { cursor: default; }
.rf-dev.hose.on { border-color: var(--water); }
.rf-markers { position: absolute; inset: 0; }
.rf-mk { position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); font-size: 13px; letter-spacing: .04em; white-space: nowrap; text-align: center; }
.rf-mk.on b { display: block; width: 34px; height: 26px; margin: 0 auto 2px; border: 2px solid currentColor; border-radius: 6px; opacity: .9;
  -webkit-mask: linear-gradient(#000 0 0) top/100% 7px no-repeat, linear-gradient(#000 0 0) bottom/100% 7px no-repeat; mask: linear-gradient(#000 0 0) top/100% 7px no-repeat, linear-gradient(#000 0 0) bottom/100% 7px no-repeat; }
.rf-mk.off b { display: block; width: 0; height: 0; margin: 0 auto 3px; border-left: 9px solid transparent; border-right: 9px solid transparent; border-bottom: 16px solid currentColor; }
.rf-mk span { display: inline-block; padding: 1px 5px; border-radius: 5px; background: rgba(34,38,42,.72); }
.rf-mk.s1 { color: #ff6b5e; } .rf-mk.s6 { color: var(--water); } .rf-mk.s7 { color: #ffd34a; } .rf-mk.s8 { color: #ff7ad1; } .rf-mk.s2, .rf-mk.s3, .rf-mk.s5 { color: #c9c3b2; }
.rf-mk.close span { background: rgba(216,67,58,.85); color: #fff; }
.rf-pops { position: absolute; inset: 0; }
.rf-pop { position: absolute; transform: translate(-50%, -50%); font-family: var(--display); font-weight: 400; font-size: 26px; letter-spacing: .05em;
  -webkit-text-stroke: 1px rgba(0,0,0,.55); animation: rfPop 1s ease-out forwards; }
@keyframes rfPop { 0% { opacity: 0; transform: translate(-50%, -30%) scale(.6); } 15% { opacity: 1; transform: translate(-50%, -60%) scale(1.15); } 100% { opacity: 0; transform: translate(-50%, -160%) scale(1); } }
.rf-legend { position: absolute; left: 12px; bottom: 74px; max-width: 30vw; text-align: left; font-size: 12px; letter-spacing: .05em; text-transform: uppercase; opacity: .85; line-height: 1.9; }
.rf-legend kbd { font-size: 11px; padding: 3px 5px 2px; }
.rf-ai { position: absolute; left: 50%; transform: translateX(-50%); top: 150px; padding: 6px 10px; border-radius: 9px; background: var(--panel); border: 1px solid var(--edge); font-size: 13px; letter-spacing: .08em; text-transform: uppercase; }
.rf-touch { position: absolute; right: 12px; bottom: 74px; display: none; flex-direction: column; gap: 8px; }
.rf.touch .rf-touch { display: flex; }
.rf.touch .rf-legend { display: none; }
.rf-touch button { width: 76px; height: 54px; border-radius: 14px; border: 2px solid var(--edge); background: var(--panel); font-family: var(--display); font-weight: 400; font-size: 20px; letter-spacing: .05em; }
.rf-touch .row { display: flex; gap: 8px; }
.rf-touch .row button { width: 34px; }
.rf-touch [data-act=throw] { border-color: var(--mustard); color: var(--mustard); }
@media (max-width: 720px) { .rf-dev { font-size: 12px; padding: 6px 8px 6px 6px; } .rf-dev span { display: none; } .rf-banner { font-size: 18px; } .rf-status { min-width: 220px; } }
.vh.vh-roofmode .vh-meters { bottom: 74px; }
.vh.vh-roofmode .vh-prompt, .vh.vh-roofmode .vh-legend, .vh.vh-roofmode .vh-step, .vh.vh-roofmode .vh-pantry { display: none !important; }
`;
const ICON = {
  hose: '<svg viewBox="0 0 24 24"><path d="M4 16c4-1 6-5 10-6l4-1" stroke="#8fd8ff" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M18 6l3 2-3 3" fill="#c9a24a"/><circle cx="6" cy="16" r="3" fill="#3f7a3f"/></svg>',
  firecracker: '<svg viewBox="0 0 24 24"><rect x="4" y="9" width="12" height="6" rx="1" fill="#c43a2e"/><rect x="7" y="9" width="2" height="6" fill="#d9b13a"/><rect x="12" y="9" width="2" height="6" fill="#d9b13a"/><path d="M16 12c2 0 2-3 4-3" stroke="#3a3228" stroke-width="1.5" fill="none"/><circle cx="20.5" cy="8.5" r="2" fill="#ff8a3a"/></svg>',
  balloon: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="10" rx="6.5" ry="7.5" fill="#c94f6d"/><path d="M12 17.5l-1.5 2.5h3z" fill="#9c3a52"/><ellipse cx="9.5" cy="7" rx="1.6" ry="2.2" fill="#f4c6d2"/></svg>',
  flare: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="6" height="12" rx="1" fill="#c8322a"/><path d="M12 2c3 3 3 5 0 7-3-2-3-4 0-7z" fill="#ffb14a"/><circle cx="12" cy="7" r="1.6" fill="#fff3c0"/></svg>',
};
const NAMES = { firecracker: 'Firecracker', balloon: 'Paint balloon', flare: 'Smoke flare' };
const STATE_WORD = { 6: 'soaked', 7: 'stalled', 8: 'blind', 2: 'blind', 3: 'spun', 5: 'gave up' };
const POP = { hose: ['SOAKED!', '#8fd8ff'], firecracker: ['STALLED!', '#ffd34a'], balloon: ['PAINTED!', '#ff7ad1'], flare: ['LOST IN SMOKE!', '#ff8a7a'] };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class RoofHud {
  /** cb: { onClimb(), onDevice(dev), onThrow(), onDown(), onTurn(dir, down) } */
  constructor(root, cb = {}) {
    this.root = root; this.cb = cb;
    if (!document.getElementById('rf-css')) { const st = document.createElement('style'); st.id = 'rf-css'; st.textContent = CSS; document.head.appendChild(st); }
    const el = this.el = document.createElement('div');
    el.className = 'rf';
    el.innerHTML = `
      <div class="rf-banner" hidden><span class="rf-btext"></span><kbd>R</kbd><small class="rf-bsub"></small></div>
      <div class="rf-roof" hidden>
        <div class="rf-markers"></div>
        <div class="rf-cross"><i></i><b></b></div>
        <div class="rf-status"><div class="t"></div><div class="rf-bar"><i></i></div><div class="s"></div></div>
        <div class="rf-ai" hidden>AI Doc is defending · <kbd>R</kbd> take over</div>
        <div class="rf-devices">
          <div class="rf-dev hose"><i>${ICON.hose}</i><span>Hose</span><kbd>LMB</kbd></div>
          ${['firecracker', 'balloon', 'flare'].map((d, i) => `<button class="rf-dev" data-dev="${d}" tabindex="-1"><kbd>${i + 1}</kbd><i>${ICON[d]}</i><span>${NAMES[d]}</span><em>0</em></button>`).join('')}
        </div>
        <div class="rf-legend"><kbd>Mouse</kbd> aim · hold <kbd>LMB</kbd>/<kbd>Space</kbd> spray<br><kbd>RMB</kbd>/<kbd>E</kbd> throw · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> pick<br><kbd>A</kbd><kbd>D</kbd> turn · <kbd>M</kbd> mouse-lock · <kbd>R</kbd> climb down</div>
        <div class="rf-touch"><div class="row"><button data-act="left" tabindex="-1">◀</button><button data-act="right" tabindex="-1">▶</button></div><button data-act="throw" tabindex="-1">THROW</button><button data-act="down" tabindex="-1">DOWN</button></div>
        <div class="rf-pops"></div>
      </div>`;
    root.appendChild(el);
    const $ = (s) => el.querySelector(s);
    this.$ = { banner: $('.rf-banner'), btext: $('.rf-btext'), bsub: $('.rf-bsub'), roof: $('.rf-roof'), cross: $('.rf-cross'), crossB: $('.rf-cross b'),
      status: $('.rf-status'), st: $('.rf-status .t'), ss: $('.rf-status .s'), bar: $('.rf-bar i'), markers: $('.rf-markers'), pops: $('.rf-pops'), ai: $('.rf-ai'),
      hose: $('.rf-dev.hose'), devs: Object.fromEntries([...el.querySelectorAll('[data-dev]')].map((b) => [b.dataset.dev, b])) };
    this.mk = [];
    el.addEventListener('mousedown', (e) => { if (e.target.closest('button,.rf-banner')) e.preventDefault(); });
    el.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('button,.rf-banner');
      if (!b) return;
      e.stopPropagation(); e.preventDefault();
      if (b.classList.contains('rf-banner')) { cb.onClimb && cb.onClimb(); return; }
      if (b.dataset.dev) { cb.onDevice && cb.onDevice(b.dataset.dev); return; }
      const a = b.dataset.act;
      if (a === 'throw') cb.onThrow && cb.onThrow();
      if (a === 'down') cb.onDown && cb.onDown();
      if (a === 'left' || a === 'right') { cb.onTurn && cb.onTurn(a === 'left' ? 1 : -1, true); b.setPointerCapture?.(e.pointerId); }
    });
    const turnUp = (e) => { const b = e.target.closest?.('[data-act=left],[data-act=right]'); if (b) cb.onTurn && cb.onTurn(0, false); };
    el.addEventListener('pointerup', turnUp); el.addEventListener('pointercancel', turnUp);
    this._sig = {};
  }
  setTouch(on) { this.el.classList.toggle('touch', !!on); }
  setVisible(v) { this.el.style.display = v ? '' : 'none'; }

  /** Lab view: stop banner. */
  banner(on, text = '', sub = '') {
    this.$.banner.hidden = !on;
    if (!on) return;
    if (this._sig.b !== text + sub) { this._sig.b = text + sub; this.$.btext.textContent = text; this.$.bsub.textContent = sub; }
  }
  showRoof(on) { this.$.roof.hidden = !on; if (!on) { for (const m of this.mk) m.hidden = true; } }

  /** Roof view. s = { cross:{x,y,spray,hit,far,label}, device, ammo, spray, status:{text,sub,progress,blocked}, cops:[{x,y,on,dist,state,angle}], ai } */
  update(s) {
    const $ = this.$;
    // crosshair
    const c = s.cross || {};
    $.cross.style.left = `${c.x ?? 0}px`; $.cross.style.top = `${c.y ?? 0}px`;
    $.cross.classList.toggle('spray', !!c.spray); $.cross.classList.toggle('hit', !!c.hit); $.cross.classList.toggle('far', !!c.far);
    $.cross.hidden = !!s.ai;      // spectating the AI: no crosshair of our own
    if (this._sig.cl !== c.label) { this._sig.cl = c.label; $.crossB.textContent = c.label || ''; }
    // devices
    for (const [d, b] of Object.entries($.devs)) {
      const n = s.ammo?.[d] ?? 0;
      b.classList.toggle('sel', s.device === d); b.classList.toggle('empty', n <= 0);
      const em = b.querySelector('em'), t = `×${n}`;
      if (em.textContent !== t) em.textContent = t;
    }
    $.hose.classList.toggle('on', !!s.spray);
    // status
    const st = s.status || {};
    const sig = `${st.text}|${st.sub}|${st.blocked}`;
    if (this._sig.st !== sig) { this._sig.st = sig; $.st.textContent = st.text || ''; $.ss.textContent = st.sub || ''; $.status.classList.toggle('blocked', !!st.blocked); }
    $.bar.style.width = `${Math.round((st.progress ?? 0) * 100)}%`;
    $.bar.parentElement.hidden = st.progress == null;
    $.ai.hidden = !s.ai;
    // cop markers
    const cops = s.cops || [];
    while (this.mk.length < cops.length) {
      const m = document.createElement('div'); m.className = 'rf-mk'; m.innerHTML = '<b></b><span></span>';
      $.markers.appendChild(m); this.mk.push(m);
    }
    this.mk.forEach((m, i) => {
      const k = cops[i];
      if (!k) { m.hidden = true; return; }
      m.hidden = false;
      const cls = `rf-mk ${k.on ? 'on' : 'off'} s${k.state}${k.dist < 12 && k.state === 1 ? ' close' : ''}`;
      if (m.className !== cls) m.className = cls;
      m.style.left = `${k.x}px`; m.style.top = `${k.y}px`;
      const b = m.firstChild;
      b.style.transform = k.on ? '' : `rotate(${k.angle}rad)`;
      const txt = `${Math.round(k.dist)} m${STATE_WORD[k.state] ? ' · ' + STATE_WORD[k.state] : ''}`;
      if (m.lastChild.textContent !== txt) m.lastChild.textContent = txt;
    });
  }
  pop(device, x, y) {
    const [t, col] = POP[device] || ['HIT!', '#fff'];
    const p = document.createElement('div');
    p.className = 'rf-pop'; p.textContent = t; p.style.color = col; p.style.left = `${x}px`; p.style.top = `${y}px`;
    this.$.pops.appendChild(p);
    setTimeout(() => p.remove(), 1050);
  }
  destroy() { this.el.remove(); }
}
export { esc };
