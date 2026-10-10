// ─────────────────────────────────────────────────────────────────────────────
// HUD (DOM overlay, pointer-events: none except buttons). Styles: css/hud.css.
//
//   const hud = new Hud(rootEl, data, { role: 'driver'|'cook' });
//   hud.update(snap)                       // every frame (events processed once per snapshot object)
//   hud.toast(text, tone)                  // tone: 'info'|'good'|'bad'|'heat'
//   hud.showEnd(result, { onRestart, onMenu, canRestart = true })
//   hud.hideEnd(); hud.reset(); hud.destroy();
// Expansion:
//   hud.setFirstPerson(bool)               // driver in the cab: compact speedo (the cab has a real one)
//   hud.setLookCooldown(v)                 // look-around ring: v = fp.cooldown (0 ready … 1 just used); null hides it
//   hud.caption(title, sub?)               // big comic set-piece caption (also fired by EV.setpiece)
//   hud.areaTitle(name, hour?)             // "OLD TOWN — 10:12 AM" intro (also on snap.area changes)
// Driver: full layout. Cook: compact top strip (heat, progress, HP, product) + banners + toasts.
// Both roles: STOP AT banner (snap.nearStop within rules.stops.bannerDist) with a "missed it" warning,
// status chips (Rook in the shop / Doc on the roof / loading / COPS AT THE LOT), set-piece captions,
// area intro titles, a time-of-day clock chip, canister warnings.
// ─────────────────────────────────────────────────────────────────────────────
import { EV, KIND_ID } from '../shared/protocol.js';

const ICON = {
  star: '<svg viewBox="0 0 24 24"><path d="M12 1.8l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.9l-6.4 3.5 1.4-7.1-5.3-5 7.2-.9z"/></svg>',
  bag: '<svg viewBox="0 0 24 24"><path d="M7 7l2-4h6l2 4h2.5l1.5 14H3L4.5 7z M9.5 7h5L13.6 5h-3.2z" fill-rule="evenodd"/></svg>',
  shop: '<svg viewBox="0 0 24 24"><path d="M3 9l2-6h14l2 6v2a3 3 0 01-3 1.7V21H6v-8.3A3 3 0 013 11z M9 21v-5h6v5"/></svg>',
  flag: '<svg viewBox="0 0 24 24"><path d="M5 22V2h2v1.5c3-1.5 5.5 1.5 8.5 0S19 2.5 20 2.5v10c-1 0-2.5 1.5-4.5 1.5s-5.5-3-8.5-1.5V22z"/></svg>',
  bridge: '<svg viewBox="0 0 24 24"><path d="M12 1.5L23 21H1z" fill="#d8433a" stroke="#22262a" stroke-width="1.6" stroke-linejoin="round"/><path d="M5 15.5h4.6l-1 1.6H5zM19 15.5h-4.6l1 1.6H19z" fill="#f1ead8"/><rect x="11" y="7" width="2" height="6" rx="1" fill="#f1ead8"/><circle cx="12" cy="15" r="1.2" fill="#f1ead8"/></svg>',
  rv: '<svg viewBox="0 0 32 20"><path d="M2 4h20l8 6v6h-3a3 3 0 00-6 0H11a3 3 0 00-6 0H2z" fill="#f1ead8" stroke="#22262a" stroke-width="1.5"/><rect x="2" y="10" width="28" height="3" fill="#4f8f8a"/><rect x="5" y="6" width="5" height="3" fill="#2e3a40"/><rect x="13" y="6" width="5" height="3" fill="#2e3a40"/><circle cx="8" cy="16" r="2.4" fill="#22262a"/><circle cx="24" cy="16" r="2.4" fill="#22262a"/></svg>',
  smoke: '<svg viewBox="0 0 24 24"><path d="M7 18a4 4 0 01-.6-8A5.5 5.5 0 0117 8.6 4.6 4.6 0 0117 18z"/><circle cx="6" cy="21" r="1.4"/><circle cx="11" cy="21.5" r="1"/></svg>',
  oil: '<svg viewBox="0 0 24 24"><path d="M12 2s6 7.2 6 11.5A6 6 0 016 13.5C6 9.2 12 2 12 2z"/></svg>',
  nitro: '<svg viewBox="0 0 24 24"><path d="M13 1L4 14h6l-2 9 10-13h-6z"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="M8 4l8 8-8 8" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  skull: '<svg viewBox="0 0 24 24"><path d="M12 2a9 9 0 00-5 16.5V22h10v-3.5A9 9 0 0012 2zm-3.5 9a2 2 0 110 4 2 2 0 010-4zm7 0a2 2 0 110 4 2 2 0 010-4z"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M12 5C6.5 5 2.7 9.3 1.5 12c1.2 2.7 5 7 10.5 7s9.3-4.3 10.5-7C21.3 9.3 17.5 5 12 5zm0 11.2A4.2 4.2 0 1112 7.8a4.2 4.2 0 010 8.4zm0-6.4a2.2 2.2 0 100 4.4 2.2 2.2 0 000-4.4z" fill-rule="evenodd"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.6"/><g stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 1.8v2.6M12 19.6v2.6M1.8 12h2.6M19.6 12h2.6M4.8 4.8l1.8 1.8M17.4 17.4l1.8 1.8M4.8 19.2l1.8-1.8M17.4 6.6l1.8-1.8"/></g></svg>',
  dusk: '<svg viewBox="0 0 24 24"><path d="M5.5 16a6.5 6.5 0 0113 0z"/><g stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 4.5v2.6M3.6 9l1.9 1.4M20.4 9l-1.9 1.4M1.5 19.5h21"/></g></svg>',
  roof: '<svg viewBox="0 0 24 24"><path d="M2 15h20v4H2z M5 15l2-5h10l2 5z" opacity=".55"/><circle cx="12" cy="5" r="2.2"/><path d="M10.5 7.5h3l1 4h-5z"/><path d="M14.6 8.6l5.6-2.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="21" cy="5.6" r=".9"/><circle cx="22.4" cy="7.4" r=".7"/></svg>',
  run: '<svg viewBox="0 0 24 24"><circle cx="14.5" cy="4" r="2.2"/><path d="M13 7l-4 1.5-2 3.5 1.6.8 1.6-2.6 1.6-.4-1.8 4.6L6 16.5l.9 1.6 4.6-1.8 1.3-2.4 2.2 2.4.6 5.2h1.9l-.5-6.3-2.4-2.7 1-3 1.5 2.2 3.4.6.3-1.7-2.7-.6z"/></svg>',
  cop: '<svg viewBox="0 0 24 24"><path d="M4 13l2-5h12l2 5v6h-2.5v-2h-11v2H4z"/><rect x="8" y="4" width="3.6" height="3" rx="1" fill="#d8433a"/><rect x="12.4" y="4" width="3.6" height="3" rx="1" fill="#3a6fd8"/></svg>',
  can: '<svg viewBox="0 0 24 24"><rect x="7" y="5" width="10" height="16" rx="2.5"/><rect x="9" y="2" width="6" height="3" rx="1"/><path d="M7 10h10v3H7z" fill="#22262a" opacity=".5"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5z"/></svg>',
  miss: '<svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/></svg>',
};

const END_TITLE = {
  won: 'DEAL DONE', busted: 'BUSTED', wrecked: 'WRECKED', crewDown: 'CREW DOWN', noProduct: 'NOTHING TO SELL',
};
// Set-piece captions (EV.setpiece kind → [title, subtitle]). All original; no real brands or characters.
export const SETPIECE_CAPTIONS = {
  freight_wagons: ['RUNAWAY FREIGHT!', 'Wagons rolling across the yard'],
  midnight_comet: ['THE MIDNIGHT COMET!', 'Six cop cars just found someone faster'],
  parade: ["FOUNDERS' DAY PARADE!", 'Main Street is shut — take the market alley'],
  drawbridge: ['DRAWBRIDGE RISING!', 'Floor it — or wait it out'],
  wide_load: ['WIDE LOAD!', 'A whole house on a truck'],
  car_carrier: ['CAR CARRIER!', "It's shedding its cargo"],
  toll_plaza: ['TOLL PLAZA', 'Pick a booth — any booth'],
  inflatable_gorilla: ['GORILLA ON THE LOOSE!', 'Forty feet of angry vinyl'],
  car_wash: ['CAR WASH!', 'Lose a star in the suds'],
  cattle_drive: ['CATTLE DRIVE!', 'Easy… they just moo'],
  combine: ['COMBINE HARVESTER!', 'Both lanes. Every last one of them.'],
  log_spill: ['LOG SPILL!', 'Timber rolling down the hill'],
  rattlers: ['THE RATTLERS!', 'Bikers want the product — keep them off'],
  tornado: ['TORNADO!', "It's throwing cars!"],
  stagecoach: ['RUNAWAY STAGECOACH!', 'Out of the dust, straight across'],
  pratt_jump: ['SERGEANT PRATT!', 'Still right behind you…'],
  handover: ['THE HANDOVER', 'Kestrel\'s men check the bags'],
};
const QUIET_PHASES = new Set(['done', 'end', 'ended', 'over', 'idle', 'finished', 'gone', 'cleanup']);
const FLASHBANG = KIND_ID.flashbang;

const fmtTime = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmtNum = (n) => Math.round(n || 0).toLocaleString('en-US');
export const fmtClock = (h) => {
  if (typeof h !== 'number' || !isFinite(h)) return '';
  let m = Math.floor(((h % 24) + 24) % 24 * 60);
  const hh = Math.floor(m / 60); m %= 60;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
};
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

export class Hud {
  constructor(rootEl, data, { role = 'driver' } = {}) {
    this.rootEl = rootEl;
    this.data = data;
    this.route = data.route;
    this.rules = data.rules || {};
    this.lab = data.lab || {};
    this.role = role;
    this.bannerDist = this.rules.stops?.bannerDist ?? 800;
    this.looted = new Set();
    this._last = {};
    this._lastSnap = null;
    this._prevStars = 0;
    this._prevPhase = null;
    this._shownSet = new Set();
    this._closed = new Set();
    this._missed = new Set();
    this.time = 0;
    this._t0 = performance.now();
    if (rootEl && getComputedStyle(rootEl).position === 'static') rootEl.style.position = 'relative';
    const root = el('div', `crh crh--${role}`);
    this.root = root;
    root.innerHTML = this._template();
    rootEl.appendChild(root);
    this.$ = (s) => root.querySelector(s);
    this._buildProgress();
    if (role === 'driver') this._buildSpeedo();
    this.toasts = this.$('.crh-toasts');
    this._raf = 0;
  }

  _template() {
    const stars = Array.from({ length: 5 }, (_, i) => `<i class="crh-star" data-i="${i}">${ICON.star}</i>`).join('');
    const hp = (k, label) => `<div class="crh-hp crh-hp--${k}"><span class="crh-hp-l">${label}</span><span class="crh-hp-bar"><i></i><em></em></span><span class="crh-hp-v">100</span>${k === 'rv' ? `<span class="crh-regen" title="Repairing">${ICON.plus}</span>` : ''}</div>`;
    const req = this.route.sellPoint?.requiredUnits ?? 6;
    const product = `<div class="crh-product"><span class="crh-bag">${ICON.bag}</span><span class="crh-units"><b>0</b>/<span>${req}</span></span><span class="crh-q">Q <b>0%</b></span></div>`;
    const clock = `<div class="crh-clock crh-panel"><span class="crh-clock-i">${ICON.sun}</span><b></b></div>`;
    const shared = `
      <div class="crh-caption"></div>
      <div class="crh-area"><small class="crh-area-k">NOW ENTERING</small><b class="crh-area-n"></b><span class="crh-area-t"></span></div>`;
    if (this.role === 'cook') {
      return `
      <div class="crh-police"><i class="l"></i><i class="r"></i></div>
      <div class="crh-strip">
        <div class="crh-heat crh-panel">${stars}</div>
        <div class="crh-prog crh-prog--compact"></div>
        <div class="crh-hps crh-panel">${hp('rv', 'RV')}${hp('rook', 'ROOK')}${hp('doc', 'DOC')}</div>
        ${product.replace('crh-product', 'crh-product crh-panel')}
        ${clock}
        <div class="crh-bust-mini"><i></i><span>BUST</span></div>
      </div>
      <div class="crh-sub">
        <div class="crh-stopban"></div>
        <div class="crh-status"></div>
        <div class="crh-canwarn"></div>
      </div>
      <div class="crh-toasts"></div>
      ${shared}
      <div class="crh-count"></div>
      <div class="crh-end"></div>`;
    }
    return `
      <div class="crh-police"><i class="l"></i><i class="r"></i></div>
      <div class="crh-tl">
        <div class="crh-heat crh-panel">${stars}</div>
        <div class="crh-tl-row">
          <div class="crh-chaos crh-panel"><span class="crh-chaos-i">${ICON.star}</span><b>0</b><span class="crh-cap">Chaos</span></div>
          ${clock}
        </div>
        <div class="crh-status"></div>
      </div>
      <div class="crh-top">
        <div class="crh-prog"></div>
        <div class="crh-stopban"></div>
        <div class="crh-toasts"></div>
      </div>
      <div class="crh-tr crh-panel">
        <div class="crh-points"><b>0</b><span class="crh-cap">pts</span></div>
        ${product}
      </div>
      <div class="crh-bl crh-panel">${hp('rv', 'RV HULL')}${hp('rook', 'ROOK')}${hp('doc', 'DOC')}</div>
      <div class="crh-bc"><div class="crh-speedo"></div></div>
      <div class="crh-br">
        <div class="crh-look" style="display:none">
          <svg viewBox="0 0 48 48"><circle class="bg" cx="24" cy="24" r="20"/><circle class="fg" cx="24" cy="24" r="20"/></svg>
          <span class="crh-look-i">${ICON.eye}</span><kbd>C</kbd><span class="crh-look-n">Look</span>
        </div>
        <div class="crh-gadgets">
          <div class="crh-g crh-g--smoke"><kbd>Q</kbd><span class="crh-g-i">${ICON.smoke}</span><span class="crh-g-n">Smoke <b>×0</b></span></div>
          <div class="crh-g crh-g--oil"><kbd>E</kbd><span class="crh-g-i">${ICON.oil}</span><span class="crh-g-n">Oil <b>×0</b></span></div>
          <div class="crh-g crh-g--nitro"><kbd>Shift</kbd><span class="crh-g-i">${ICON.nitro}</span><span class="crh-g-n">Nitro <b>×0</b></span><span class="crh-nitro-meter"><i></i></span></div>
        </div>
      </div>
      <div class="crh-center">
        <div class="crh-prompt"></div>
        <div class="crh-canwarn"></div>
        <div class="crh-load"><span class="crh-load-name"></span><span class="crh-load-bar"><i></i></span><span class="crh-load-sub"></span></div>
        <div class="crh-alert">COP ALONGSIDE!<small>Close the curtains, Doc!</small></div>
      </div>
      ${shared}
      <div class="crh-bust"><svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="50"/><circle class="fg" cx="60" cy="60" r="50"/></svg><span>BUSTED</span><small>KEEP MOVING!</small></div>
      <div class="crh-count"></div>
      <div class="crh-end"></div>`;
  }

  _buildProgress() {
    const host = this.$('.crh-prog');
    const L = this.route.routeLength;
    const SHORT = { city: 'CITY', suburbs: 'SUBURBS', outskirts: 'FARMS', desert: 'DESERT', canyon: 'CANYON', hideout: 'HIDEOUT', ironworks: 'IRONWORKS', downtown: 'DOWNTOWN', oldtown: 'OLD TOWN', docks: 'DOCKS', interstate: 'I-9', stripmall: 'STRIP', farmland: 'FARMS', foothills: 'PINES', saltflats: 'SALT', ghosttown: 'GHOST', };
    const segs = this.route.biomes.map((b) => {
      const w = ((b.to - b.from) / L) * 100;
      const short = SHORT[b.id] || b.name.toUpperCase();
      return `<span class="crh-seg" style="width:${w}%;background:${b.colors?.ground || '#8a8f99'}" title="${esc(b.name)}"><em>${esc(short)}</em></span>`;
    }).join('');
    const pin = (z, cls, icon, title) => `<span class="crh-pin ${cls}" style="left:${(z / L) * 100}%" title="${esc(title)}">${icon}</span>`;
    const stops = (this.route.stops || []).map((s) => pin(s.z, 'crh-pin--stop', ICON.shop, s.name).replace('class="crh-pin', `data-id="${s.id}" class="crh-pin`)).join('');
    const br = this.route.bridge ? pin(this.route.bridge.lip, 'crh-pin--bridge', ICON.bridge, this.route.bridge.name) : '';
    const sp = this.route.sellPoint ? pin(this.route.sellPoint.z, 'crh-pin--sell', ICON.flag, this.route.sellPoint.name) : '';
    host.innerHTML = `<div class="crh-track">${segs}</div><div class="crh-fill"></div>${stops}${br}${sp}<span class="crh-rv">${ICON.rv}</span>`;
    this.progRv = host.querySelector('.crh-rv');
    this.progFill = host.querySelector('.crh-fill');
    this.progStops = [...host.querySelectorAll('.crh-pin--stop')];
  }

  _buildSpeedo() {
    const host = this.$('.crh-speedo');
    const MAX = 160, A0 = -125, A1 = 125;
    this.speedMax = MAX; this.speedA0 = A0; this.speedA1 = A1;
    const ang = (v) => A0 + (A1 - A0) * (v / MAX);
    const pt = (a, r) => { const rad = (a - 90) * Math.PI / 180; return [100 + Math.cos(rad) * r, 100 + Math.sin(rad) * r]; };
    let ticks = '';
    for (let v = 0; v <= MAX; v += 10) {
      const a = ang(v), major = v % 20 === 0;
      const [x1, y1] = pt(a, major ? 76 : 80), [x2, y2] = pt(a, 88);
      ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="${major ? 'mj' : 'mn'}"/>`;
      if (major) { const [tx, ty] = pt(a, 63); ticks += `<text x="${tx.toFixed(1)}" y="${(ty + 4).toFixed(1)}">${v}</text>`; }
    }
    const arc = (a0, a1, r) => { const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r); return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
    host.innerHTML = `<svg viewBox="0 0 200 170">
      <path d="${arc(A0, A1, 92)}" class="rim"/>
      <path d="${arc(A0, A1, 84)}" class="band"/>
      <path class="hot" d="${arc(ang(120), A1, 84)}"/>
      ${ticks}
      <g class="need" style="display:none"><path d=""/></g>
      <g class="needle"><path d="M-3.2 6 L0 -80 L3.2 6 Z"/><circle r="8"/></g>
    </svg>
    <div class="crh-speed"><b>0</b><span>km/h</span></div>`;
    this.speedNeedle = host.querySelector('.needle');
    this.speedNeed = host.querySelector('.need');
    this.speedNeedPath = host.querySelector('.need path');
    this.speedNum = host.querySelector('.crh-speed b');
    this._ang = ang; this._arc = arc;
  }

  // ── expansion API ─────────────────────────────────────────────────────────
  setFirstPerson(on) { if (this.root) this.root.classList.toggle('crh--fp', !!on); }

  /** Look-around ring: v = remaining cooldown 0..1 (0 = ready). null/undefined hides the ring. */
  setLookCooldown(v) {
    const e = this.root && this.$('.crh-look');
    if (!e) return;
    const show = v != null && isFinite(v);
    const key = show ? Math.round(clamp01(v) * 120) : -1;
    if (this._last.look === key) return;
    this._last.look = key;
    e.style.display = show ? '' : 'none';
    if (!show) return;
    const ready = key === 0;
    const c = 2 * Math.PI * 20;
    e.querySelector('.fg').style.strokeDasharray = `${((1 - clamp01(v)) * c).toFixed(1)} ${c.toFixed(1)}`;
    if (ready && !e.classList.contains('ready')) { e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); }
    e.classList.toggle('ready', ready);
  }

  /** Big comic-style caption (set-pieces). */
  caption(title, sub = '') {
    const c = this.$('.crh-caption');
    if (!c || !title) return;
    c.innerHTML = `<div class="crh-cap-burst"></div><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}`;
    c.classList.remove('on'); void c.offsetWidth; c.classList.add('on');
    clearTimeout(this._capT);
    this._capT = setTimeout(() => c.classList.remove('on'), 3000);
  }

  /** Area intro title. */
  areaTitle(name, hour = null) {
    const a = this.$('.crh-area');
    if (!a || !name) return;
    a.querySelector('.crh-area-n').textContent = String(name).toUpperCase();
    const t = fmtClock(hour);
    a.querySelector('.crh-area-t').textContent = t;
    a.classList.toggle('notime', !t);
    a.classList.remove('on'); void a.offsetWidth; a.classList.add('on');
    clearTimeout(this._areaT);
    this._areaT = setTimeout(() => a.classList.remove('on'), 3900);
  }

  // ── per frame ─────────────────────────────────────────────────────────────
  update(snap) {
    if (!snap || !this.root) return;
    this.time = (performance.now() - this._t0) / 1000;
    if (snap !== this._lastSnap) {
      this._lastSnap = snap;
      if (snap.looted) for (const id of snap.looted) if (!this.looted.has(id)) { this.looted.add(id); this.progStops.forEach((p) => { if (p.dataset.id === id) p.classList.add('done'); }); }
      if (snap.events && snap.events.length) for (const ev of snap.events) this._event(ev, snap);
    }
    const L = this._last;
    const set = (key, v, fn) => { if (L[key] !== v) { L[key] = v; fn(v); } };
    const heat = snap.heat || {};
    const stars = heat.stars | 0;
    // heat stars (the old under-star progress lines are gone)
    set('stars', stars + '|' + (heat.gaveUp ? 1 : 0), () => {
      this.root.querySelectorAll('.crh-star').forEach((s, i) => s.classList.toggle('on', i < stars));
      this.root.classList.toggle('crh--heat', stars > 0 && !heat.gaveUp);
    });
    // police edge pulse
    const pol = stars > 0 && !heat.gaveUp && snap.phase === 'drive' ? 0.25 + 0.75 * (stars / 5) : 0;
    set('pol', pol.toFixed(2), (v) => this.root.style.setProperty('--pol', v));
    // progress
    const len = snap.routeLength || this.route.routeLength;
    const p = clamp01((snap.dist ?? snap.rv?.z ?? 0) / len);
    set('prog', (p * 2000) | 0, () => { this.progRv.style.left = (p * 100).toFixed(2) + '%'; this.progFill.style.width = (p * 100).toFixed(2) + '%'; });
    // hp
    const maxHp = this.rules.rv?.maxHp ?? 100, crewMax = this.rules.rv?.crewMaxHp ?? 100;
    this._hp('rv', (snap.rv?.hp ?? maxHp) / maxHp, snap.rv?.hp ?? maxHp);
    this._hp('rook', (snap.crew?.driver ?? crewMax) / crewMax, snap.crew?.driver ?? crewMax);
    this._hp('doc', (snap.crew?.cook ?? crewMax) / crewMax, snap.crew?.cook ?? crewMax);
    set('regen', !!snap.rv?.regen, (v) => this.root.querySelector('.crh-hp--rv')?.classList.toggle('regen', v));
    // product
    const inv = snap.inv || {};
    set('units', inv.units | 0, (v) => {
      const b = this.root.querySelector('.crh-units b'); b.textContent = v;
      this.root.querySelector('.crh-product').classList.toggle('ok', v >= (this.route.sellPoint?.requiredUnits ?? 6));
      b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
    });
    set('q', Math.round((inv.quality || 0) * 100), (v) => { this.root.querySelector('.crh-q b').textContent = v + '%'; });
    // clock
    const tod = typeof snap.timeOfDay === 'number' ? snap.timeOfDay : null;
    set('clock', tod == null ? '' : fmtClock(tod), (v) => {
      const c = this.$('.crh-clock'); if (!c) return;
      c.style.display = v ? '' : 'none';
      c.querySelector('b').textContent = v;
      const dusk = tod != null && (tod >= 17.6 || tod < 7);
      c.classList.toggle('dusk', dusk);
      c.querySelector('.crh-clock-i').innerHTML = dusk ? ICON.dusk : ICON.sun;
    });
    // area intro (on change, while driving)
    const area = snap.area && (snap.area.name || snap.area.id);
    if (area && snap.phase === 'drive' && area !== this._area) { this._area = area; this.areaTitle(area, tod); }
    set('garage', snap.phase === 'garage', (v) => this.root.classList.toggle('crh--garage', v));
    // countdown / GO
    this._countdown(snap);
    // shared banners
    this._stopBanner(snap);
    this._status(snap);
    this._canisters(snap);
    if (this.role === 'cook') {
      const bust = snap.bust || 0;
      set('bustm', Math.round(bust * 50), () => {
        const m = this.$('.crh-bust-mini'); m.classList.toggle('on', bust > 0.01); m.querySelector('i').style.width = (bust * 100).toFixed(0) + '%';
      });
      return;
    }
    // ── driver only ──
    const sc = snap.score || {};
    set('pts', sc.points | 0, (v) => { this.$('.crh-points b').textContent = fmtNum(v); });
    set('chaos', sc.chaos | 0, (v) => { const b = this.$('.crh-chaos b'); b.textContent = v; b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); });
    const g = inv.gadgets || {};
    for (const k of ['smoke', 'oil', 'nitro']) {
      set('g_' + k, g[k] | 0, (v) => { const e = this.$('.crh-g--' + k); e.classList.toggle('empty', v <= 0); e.querySelector('b').textContent = '×' + v; });
    }
    const nitro = snap.rv?.nitro || 0;
    set('nitroM', Math.round(nitro * 40), () => { const e = this.$('.crh-g--nitro'); e.classList.toggle('active', nitro > 0); e.querySelector('.crh-nitro-meter i').style.width = (nitro * 100).toFixed(0) + '%'; });
    // speedometer
    const kmh = Math.abs(snap.rv?.speed || 0) * 3.6;
    const a = this._ang(Math.min(this.speedMax * 1.03, kmh));
    set('spd', Math.round(kmh * 2), () => { this.speedNeedle.setAttribute('transform', `translate(100 100) rotate(${a.toFixed(1)})`); this.speedNum.textContent = Math.round(kmh); });
    const br = snap.bridge || {};
    const needKmh = (br.speedNeeded || 0) * 3.6;
    const showNeed = br.dist != null && br.dist > 0 && br.dist < 600 && needKmh > 0;
    set('need', showNeed ? Math.round(needKmh) : -1, (v) => {
      this.speedNeed.style.display = v < 0 ? 'none' : '';
      if (v >= 0) this.speedNeedPath.setAttribute('d', this._arc(this._ang(v), Math.min(this.speedA1, this._ang(v) + 4), 84));
    });
    set('fast', showNeed && kmh >= needKmh, (v) => this.$('.crh-speedo').classList.toggle('fast', v));
    set('needOn', showNeed, (v) => this.$('.crh-bc').classList.toggle('need', v));
    // prompts
    this._prompts(snap, kmh, needKmh, br);
    // bust ring
    const bust = snap.bust || 0;
    set('bust', Math.round(bust * 100), () => {
      const e = this.$('.crh-bust'); e.classList.toggle('on', bust > 0.01);
      const c = 2 * Math.PI * 50; e.querySelector('.fg').style.strokeDasharray = `${(bust * c).toFixed(1)} ${c.toFixed(1)}`;
    });
    // cop alongside
    const lab = snap.lab || {};
    const alongside = snap.phase === 'drive' && !!(snap.alert && snap.alert.copClose && lab.cooking && !lab.curtains);
    set('along', alongside, (v) => this.$('.crh-alert').classList.toggle('on', v));
  }

  _hp(key, f, v) {
    f = clamp01(f);
    const k = Math.round(f * 200);
    if (this._last['hp_' + key] === k) return;
    const prev = this._last['hp_' + key];
    this._last['hp_' + key] = k;
    const e = this.root.querySelector('.crh-hp--' + key);
    if (!e) return;
    e.querySelector('i').style.width = (f * 100).toFixed(1) + '%';
    e.querySelector('.crh-hp-v').textContent = Math.max(0, Math.round(v));
    e.classList.toggle('low', f < 0.3);
    if (prev != null && k < prev - 1) { e.classList.remove('hit'); void e.offsetWidth; e.classList.add('hit'); }
    // trailing "damage" bar
    const em = e.querySelector('em');
    clearTimeout(e._t);
    e._t = setTimeout(() => (em.style.width = (f * 100).toFixed(1) + '%'), 380);
  }

  _countdown(snap) {
    const c = this.$('.crh-count');
    let txt = '';
    if (snap.phase === 'countdown') txt = String(Math.max(1, Math.ceil(snap.countdown || 0)));
    if (this._prevPhase === 'countdown' && snap.phase === 'drive') this._goUntil = this.time + 0.9;
    this._prevPhase = snap.phase;
    if (!txt && this._goUntil && this.time < this._goUntil) txt = 'GO!';
    if (txt !== this._last.count) {
      this._last.count = txt;
      c.textContent = txt;
      c.classList.remove('pop', 'go'); void c.offsetWidth;
      if (txt) c.classList.add(txt === 'GO!' ? 'go' : 'pop');
    }
  }

  // "STOP AT: <name> — 450 m on your right" (both roles) + "Missed it" when the RV drives past.
  _stopBanner(snap) {
    const b = this.$('.crh-stopban');
    if (!b) return;
    const near = snap.nearStop;
    const st = snap.stop;
    const z = snap.rv?.z ?? 0;
    const driving = snap.phase === 'drive';
    // "Missed it": a stop the sim closed unlooted (abandoned / failed, snap.closed), or the stop we
    // were approaching dropped out of nearStop behind us without being looted (drove past)
    const missed = (id, name) => {
      if (this._missed.has(id) || this.looted.has(id) || !driving) return;
      this._missed.add(id); this._missUntil = this.time + 3.4;
      this._missName = name || (this.route.stops || []).find((s) => s.id === id)?.name || '';
    };
    if (Array.isArray(snap.closed)) for (const id of snap.closed) if (!this._closed.has(id)) { this._closed.add(id); missed(id); }
    if (this._near && (!near || near.id !== this._near.id)) {
      const n = this._near;
      if (!(st && st.id === n.id) && z > n.z) missed(n.id, n.name);
      this._near = null;
    }
    if (near && !this.looted.has(near.id) && (!st || st.id !== near.id)) {
      const def = (this.route.stops || []).find((s) => s.id === near.id);
      this._near = { id: near.id, z: near.z ?? def?.z ?? z + near.dist, name: near.name };
    } else if (st) this._near = null;
    let key = '', html = '', cls = '';
    if (this._missUntil && this.time < this._missUntil) {
      key = 'miss|' + this._missName;
      cls = 'on missed';
      html = `<span class="sb-ic">${ICON.miss}</span><span class="sb-txt"><small>MISSED IT</small><b class="sb-name">No supplies here</b></span><span class="sb-dist"><small>${esc(this._missName || '')}</small></span>`;
    } else if (driving && near && !this.looted.has(near.id) && !st && near.dist <= this.bannerDist && near.dist > -2) {
      const def = (this.route.stops || []).find((s) => s.id === near.id);
      const sideV = near.side ?? def?.side ?? 1;
      const side = sideV > 0 ? 'right' : 'left';
      const d = Math.max(0, Math.round(near.dist / 10) * 10);
      const close = near.dist < 90;
      key = `${near.id}|${d}|${side}|${close}`;
      cls = `on ${side}${close ? ' close' : ''}`;
      html = `<span class="sb-ic">${ICON.shop}</span>
        <span class="sb-txt"><small>STOP AT</small><b class="sb-name">${esc(near.name)}</b></span>
        <span class="sb-dist"><b>${close ? 'PULL IN' : d + ' m'}</b><small>on your ${side}</small></span>
        <span class="sb-chev">${ICON.chev}</span>`;
    }
    if (this._last.ban !== key) {
      const was = this._last.banId, id = key.split('|')[0];
      this._last.ban = key; this._last.banId = id;
      b.className = 'crh-stopban ' + cls;
      b.innerHTML = html;
      if (id && id !== was) { b.classList.remove('in'); void b.offsetWidth; b.classList.add('in'); }
    }
  }

  // status chips: Rook in the shop / running back / loading / Doc on the roof / COPS AT THE LOT
  // (chips are keyed by kind; only their text / progress changes in place, so the slide-in plays once)
  _status(snap) {
    const host = this.$('.crh-status');
    if (!host) return;
    const st = snap.stop;
    const chips = [];
    if (st && snap.phase === 'drive') {
      const s = st.state;
      if (s === 'parked') chips.push(['parked', 'info', ICON.shop, 'Parked — Rook heads in']);
      if (s === 'shopping') {
        const left = st.shopMax > 0 && st.shopT != null ? Math.max(0, st.shopMax - st.shopT) : null;
        chips.push(['shop', 'shop', ICON.shop, `Rook is in the shop${left != null ? ` <b>${fmtTime(left)}</b>` : ''}`]);
      }
      if (s === 'returning') chips.push(['back', 'shop', ICON.run, 'Rook is running back']);
      if (s === 'loading' || (s == null && st.progress > 0)) chips.push(['load', 'load', ICON.bag, `Loading supplies <b>${Math.round(clamp01(st.progress || 0) * 100)}%</b>`, clamp01(st.progress || 0)]);
      if (st.blocked) chips.push(['cops', 'bad', ICON.cop, 'COPS AT THE LOT']);
    }
    if (snap.rv?.roofDoc || st?.roof?.active) chips.push(['roof', 'roof', ICON.roof, 'Doc is on the roof']);
    const ids = chips.map((c) => c[0]).join('|');
    const map = this._chips || (this._chips = new Map());
    if (this._last.statusIds !== ids) {
      this._last.statusIds = ids;
      const keep = new Set(chips.map((c) => c[0]));
      for (const [id, e] of map) if (!keep.has(id)) { e.remove(); map.delete(id); }
      for (const [id, tone, icon] of chips) {
        let e = map.get(id);
        if (!e) { e = el('div', `crh-chip ${tone}`, `<span class="crh-chip-i">${icon}</span><span class="crh-chip-t"></span><i></i>`); map.set(id, e); }
        host.appendChild(e);                                   // keeps the order of `chips`
      }
    }
    for (const [id, , , text, prog] of chips) {
      const e = map.get(id);
      if (e._t !== text) { e._t = text; e.querySelector('.crh-chip-t').innerHTML = text; }
      const w = prog != null ? (prog * 100).toFixed(0) + '%' : '0';
      if (e._w !== w) { e._w = w; e.querySelector('i').style.width = w; }
    }
  }

  // flashbang / foam canisters near the RV (state 0 flying, 1 armed on the ground)
  _canisters(snap) {
    const host = this.$('.crh-canwarn');
    if (!host) return;
    let best = null;
    const rv = snap.rv;
    if (rv && snap.phase === 'drive' && snap.ents) {
      const fx = Math.sin(rv.yaw || 0), fz = Math.cos(rv.yaw || 0);
      for (const e of snap.ents) {
        if (e[1] !== FLASHBANG || e[7] === 2) continue;
        const dx = e[2] - rv.x, dz = e[4] - rv.z;
        const d = Math.hypot(dx, dz);
        const ahead = dx * fx + dz * fz;
        if (d > 40 || ahead < -6) continue;
        if (!best || d < best.d) best = { d, foam: e[6] === 1, armed: e[7] === 1 };
      }
    }
    const key = best ? `${best.foam ? 'f' : 'b'}|${Math.round(best.d / 5)}` : '';
    if (this._last.can === key) return;
    this._last.can = key;
    host.className = 'crh-canwarn' + (best ? ' on' + (best.foam ? ' foam' : '') : '');
    host.innerHTML = best ? `<span class="crh-can-i">${ICON.can}</span><b>${best.foam ? 'FOAM' : 'FLASH'} CANISTER!</b><small>${Math.round(best.d)} m — swerve!</small>` : '';
  }

  _prompts(snap, kmh, needKmh, br) {
    const prompt = this.$('.crh-prompt'), load = this.$('.crh-load');
    let ptxt = '', ptone = '';
    let loading = null;
    const st = snap.stop;
    const near = snap.nearStop;
    if (snap.phase === 'drive') {
      if (st) {
        const s = st.state;
        if (s == null) {
          // legacy stop (no state machine): load while slow in the lot
          if (st.blocked) { ptxt = 'COPS TOO CLOSE TO LOAD!'; ptone = 'bad'; }
          if (st.progress > 0 || (Math.abs(snap.rv?.speed || 0) < 1.5 && !st.blocked)) loading = st;
          else if (!st.blocked) { ptxt = 'PULL INTO THE LOT & STOP'; ptone = 'info'; }
        } else if (s === 'loading') loading = st;
      } else if (near && !this.looted.has(near.id) && near.dist < 70 && near.dist > -30) { ptxt = 'PULL INTO THE LOT & STOP'; ptone = 'info'; }
      if (!ptxt && br.dist != null && br.dist > 0 && br.dist < 520 && needKmh > 0) {
        const ok = kmh >= needKmh;
        ptxt = `BRIDGE OUT ${Math.round(br.dist / 10) * 10} m — ${ok ? 'FAST ENOUGH! HOLD IT!' : `HIT ${Math.round(needKmh)} km/h!`}`;
        ptone = ok ? 'good' : 'warn';
      }
    }
    const pk = ptxt + '|' + ptone;
    if (this._last.prompt !== pk) {
      this._last.prompt = pk;
      prompt.textContent = ptxt;
      prompt.className = 'crh-prompt' + (ptxt ? ' on ' + ptone : '');
    }
    const lk = loading ? loading.id + '|' + Math.round((loading.progress || 0) * 100) + '|' + (loading.blocked ? 1 : 0) : '';
    if (this._last.load !== lk) {
      this._last.load = lk;
      load.classList.toggle('on', !!loading);
      if (loading) {
        load.querySelector('.crh-load-name').textContent = loading.name || 'LOADING';
        load.querySelector('.crh-load-bar i').style.width = (clamp01(loading.progress || 0) * 100).toFixed(0) + '%';
        load.querySelector('.crh-load-sub').textContent = loading.blocked ? 'COPS AT THE LOT — LOADING PAUSED' : 'LOADING SUPPLIES — HOLD STILL';
        load.classList.toggle('blocked', !!loading.blocked);
      }
    }
  }

  _event(ev, snap) {
    switch (ev.type) {
      case EV.MSG: this.toast(ev.text, ev.tone || 'info'); break;
      case EV.STOP_DONE: {
        this.looted.add(ev.id);
        this.progStops.forEach((p) => { if (p.dataset.id === ev.id) p.classList.add('done'); });
        const ing = this.lab.ingredients || {};
        const gives = Object.entries(ev.gives || {}).map(([k, n]) => `+${n} ${ing[k]?.name || k}`).join('  ');
        this.toast(gives || 'Supplies loaded', 'good');
        break;
      }
      case EV.STARS: {
        const s = ev.stars | 0;
        if (s > this._prevStars) this.toast(`${'★'.repeat(s)} HEAT RISING`, 'heat');
        else if (s === 0 && this._prevStars > 0) this.toast('HEAT GONE — LAY LOW', 'good');
        this._prevStars = s;
        break;
      }
      case EV.COPS_GAVE_UP: this.toast('COPS GAVE UP!', 'good'); break;
      case EV.BIOME:
        // the expansion reports snap.area (→ area title); older sims only have this event
        if (!snap.area && ev.name && ev.name !== this._area) { this._area = ev.name; if (snap.phase === 'drive') this.areaTitle(ev.name, snap.timeOfDay); else this.toast(`Entering: ${ev.name}`, 'info'); }
        break;
      case EV.FELL: this.toast('INTO THE CANYON! Back to the checkpoint', 'bad'); break;
      case EV.LANDED: this.toast(ev.hard ? 'HARD LANDING!' : 'NAILED THE JUMP!', ev.hard ? 'bad' : 'good'); break;
      case EV.SPOTTED: this.toast('THE COPS SAW THE LAB!', 'bad'); break;
      case EV.TRAIN: if (ev.state === 'warn') this.toast('TRAIN COMING!', 'bad'); break;
      case EV.SETPIECE: {
        const id = ev.id || ev.kind;
        if (ev.caption) { this.caption(ev.caption, ev.sub || ''); break; }
        if (this._shownSet.has(id) || QUIET_PHASES.has(ev.phase)) break;
        this._shownSet.add(id);
        const c = SETPIECE_CAPTIONS[ev.kind];
        if (c) this.caption(c[0], c[1]);
        break;
      }
      case EV.CANISTER:
        if (ev.hitRv) this.toast(ev.kind === 'foam' ? 'FOAMED! The RV is stuck in goo' : 'FLASHBANG!', 'bad');
        break;
      case EV.HEAT_DROP: this.toast(ev.reason ? `HEAT DROPPED — ${ev.reason}` : 'HEAT DROPPED', 'good'); break;
      case EV.SHOP_RESULT:
        if (ev.ok === false) this.toast('Rook came back empty-handed', 'bad');
        break;
      default: break;
    }
  }

  toast(text, tone = 'info') {
    if (!text || !this.toasts) return;
    const t = el('div', `crh-toast ${tone}`);
    t.textContent = text;
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
  }

  showEnd(result = {}, { onRestart, onMenu, canRestart = true, restartLabel = 'Restart', menuLabel = 'Menu', title: titleOverride = null, reasonText = null } = {}) {
    const e = this.$('.crh-end');
    const won = !!result.won;
    const key = won ? 'won' : (result.reason in END_TITLE ? result.reason : (this._lastSnap?.lostReason || 'wrecked'));
    const title = titleOverride || END_TITLE[key] || (won ? 'DEAL DONE' : 'GAME OVER');
    const reasonLine = reasonText != null ? reasonText : typeof result.reason === 'string' && !(result.reason in END_TITLE) ? result.reason : ({
      won: 'The buyer took the lot. Nobody asks questions out here.',
      busted: 'The cops boxed you in. Show\'s over.',
      wrecked: 'The RV gave up the ghost.',
      crewDown: 'Somebody needs a doctor. A real one.',
      noProduct: 'You made it — with nothing to sell.',
    }[key] || '');
    const sc = this._lastSnap?.score || {};
    const req = this.route.sellPoint?.requiredUnits ?? 6;
    const rating = Math.max(0, Math.min(3, result.stars | 0));
    const rows = [
      ['Time', fmtTime(result.timeSec)],
      ['Product', `${result.units ?? 0} bags · ${Math.round((result.quality || 0) * 100)}% quality`],
      ['Peds knocked', result.knocked ?? sc.knocked ?? 0],
      ['Chaos', result.chaos ?? sc.chaos ?? 0],
      ['Cops wrecked', result.copsWrecked ?? sc.copsWrecked ?? 0],
      ['Points', fmtNum(result.points ?? sc.points ?? 0)],
    ];
    e.innerHTML = `<div class="crh-end-card ${won ? 'won' : 'lost'}">
      <div class="crh-end-title">${esc(title)}</div>
      <div class="crh-end-reason">${esc(reasonLine)}</div>
      <div class="crh-end-rating">${[0, 1, 2].map((i) => `<i class="${i < rating ? 'on' : ''}">${ICON.star}</i>`).join('')}</div>
      <div class="crh-end-pay"><span>PAYOUT</span><b>$${fmtNum(result.payout || 0)}</b>${won ? '' : `<small>${result.units ?? 0}/${req} bags</small>`}</div>
      <table class="crh-end-stats">${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
      <div class="crh-end-btns">
        ${canRestart ? `<button type="button" class="crh-btn primary" data-a="restart">${esc(restartLabel)}</button>` : '<span class="crh-wait">Waiting for the driver…</span>'}
        <button type="button" class="crh-btn" data-a="menu">${esc(menuLabel)}</button>
      </div></div>`;
    e.classList.add('on');
    e.querySelector('[data-a="restart"]')?.addEventListener('click', () => onRestart && onRestart());
    e.querySelector('[data-a="menu"]')?.addEventListener('click', () => onMenu && onMenu());
    this.root.classList.add('crh--ended');
  }
  hideEnd() {
    const e = this.$('.crh-end');
    if (e) { e.classList.remove('on'); e.innerHTML = ''; }
    this.root.classList.remove('crh--ended');
  }

  // Reset per-run state (looted stops etc.) — call on restart if the Hud is reused.
  reset() {
    this.looted.clear();
    this._shownSet.clear();
    this._closed.clear();
    this._missed.clear();
    this.progStops.forEach((p) => p.classList.remove('done'));
    this._last = {}; this._prevStars = 0; this._prevPhase = null; this._lastSnap = null;
    this._area = null; this._near = null; this._missUntil = 0;
    if (this._chips) { for (const e of this._chips.values()) e.remove(); this._chips.clear(); }
    if (this.toasts) this.toasts.innerHTML = '';
    for (const s of ['.crh-caption', '.crh-area']) this.$(s)?.classList.remove('on');
    this.hideEnd();
  }

  destroy() { clearTimeout(this._capT); clearTimeout(this._areaT); if (this.root) this.root.remove(); this.root = null; }
}
