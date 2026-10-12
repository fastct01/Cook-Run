// ─────────────────────────────────────────────────────────────────────────────
// HUD — Round 3 "dark glass" (docs/r3/ui/*.png). DOM overlay, pointer-events: none except the
// DEFEND button and the end-screen buttons. Styles: css/tokens.css + css/hud.css. Built once;
// every per-frame write goes through a "changed?" cache, positions use transforms (no layout reads
// per frame — the route strip width comes from a ResizeObserver).
//
//   const hud = new Hud(rootEl, data, { role: 'driver'|'cook' });
//   hud.update(snap)                        // every frame (events are processed once per snapshot object)
//   hud.toast(text, tone?, opts?)           // tone 'info'|'good'|'bad'|'heat'|'cops'; opts { icon, value, sub, key }
//   hud.showEnd(result, { onRestart, onMenu, canRestart = true, restartLabel, menuLabel, title, reasonText })
//   hud.hideEnd(); hud.reset(); hud.destroy();
//   hud.setFirstPerson(bool)                // driver in the cab (hides the small speed pill)
//   hud.setLookCooldown(v, { active }?)     // C Look keycap: v = fp.cooldown (0 ready … 1 just used); null = not in the cab
//   hud.caption(title, sub?)                // set-piece caption (also fired by EV.setpiece)
//   hud.areaTitle(name, hour?)              // "Now entering / Downtown / 10:12 AM" (also on snap.area changes)
// Round 3:
//   hud.onDefend = () => {}                 // click on the DEFEND button (Ready state only)
//   hud.setMode('drive'|'roof'|'lab'|'shop'|'garage')   // which panels show (see NOTES-r3-build-hud.md)
//   hud.setDifficulty('easy'|'hard'|'extreme')          // strip chip, bags needed (raw data), end tile
// ─────────────────────────────────────────────────────────────────────────────
import { EV, KIND_ID } from '../shared/protocol.js';

// ── icons: standard 24×24 stroke icons (currentColor), copied from docs/r3/ui/src ──
const SV = (body, sw = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const ICON = {
  eye: SV('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: SV('<path d="M3 3l18 18M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6M6.4 7.6A16.5 16.5 0 0 0 2.5 12S6 18 12 18a9 9 0 0 0 4-.9"/>'),
  lock: SV('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  gun: SV('<path d="M3 8.5h17v4h-9l-1.5 7H5.5l1.5-7H3z"/>'),
  bag: SV('<path d="M5 8h14l-1.2 11.2a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>'),
  flask: SV('<path d="M9.5 3.5h5M10.5 3.5v5.2L4.8 18a1.8 1.8 0 0 0 1.6 2.6h11.2a1.8 1.8 0 0 0 1.6-2.6l-5.7-9.3V3.5"/><path d="M7.3 14.5h9.4"/>'),
  wheel: SV('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2"/><path d="M3.8 10.5h6.3M13.9 10.5h6.3M12 14v6.5"/>'),
  shield: SV('<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8-7.5 9.5-4.3-1.5-7.5-4.9-7.5-9.5V6z"/>', 2.2),
  binoc: SV('<circle cx="7" cy="15" r="4.2"/><circle cx="17" cy="15" r="4.2"/><path d="M7 10.8V8.5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2.3"/>'),
  turn: SV('<path d="M6 20v-7a4 4 0 0 1 4-4h9M15 5l4 4-4 4"/>', 2.2),
  star: SV('<path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/>', 2.2),
  cloud: SV('<path d="M7 18.5h10a4 4 0 0 0 .6-8 5.6 5.6 0 0 0-10.8 1.5A3.3 3.3 0 0 0 7 18.5z"/>'),
  drop: SV('<path d="M12 2.8s4.6 4.9 4.6 8.2a4.6 4.6 0 0 1-9.2 0c0-3.3 4.6-8.2 4.6-8.2z"/><path d="M3 20.2c1.8-1.3 3.6-1.3 5.4 0s3.6 1.3 5.4 0 3.6-1.3 5.4 0 1.2.6 1.8.4"/>'),
  bolt: SV('<path d="M13.5 2.5L5 13.5h6l-1 8 8.5-11h-6z"/>'),
  plus: SV('<path d="M12 5v14M5 12h14"/>', 3),
  truck: SV('<path d="M2.5 6.5h11v9h-11zM13.5 9.5h4l3 3.2v2.8h-7z"/><circle cx="6.5" cy="17" r="1.8"/><circle cx="16.5" cy="17" r="1.8"/>', 2.2),
  tyre: SV('<path d="M6.3 19.5a8 8 0 1 1 11.4 0z"/><circle cx="12" cy="12.6" r="2.8"/><path d="M18.5 3.5l1.5-1.5M20.5 7.5h2M16 2l.4-1.6"/>', 2.2),
  steam: SV('<path d="M7 20c-1.8-2.2 1.8-3.8 0-6s1.8-3.8 0-6M12 20c-1.8-2.2 1.8-3.8 0-6s1.8-3.8 0-6s1.8-2.6 0-4.5M17 20c-1.8-2.2 1.8-3.8 0-6s1.8-3.8 0-6"/>', 2.2),
  power: SV('<path d="M12 3v8.5"/><path d="M7 6.5a7.5 7.5 0 1 0 10 0"/>', 2.2),
  crack: SV('<path d="M3.5 18L6 6.5h12L20.5 18z"/><path d="M11.5 6.5l1.6 3.4-2.2 2 2.4 3.6-.8 2.5M13.1 9.9l2.9.6"/>', 2.2),
  clock: SV('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  check: SV('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 2.4),
  cross: SV('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>', 2.4),
  alert: SV('<path d="M12 3.8l9 15.7H3z"/><path d="M12 10v4.2M12 17.2v.3"/>', 2.2),
  info: SV('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.2M12 7.8v.3"/>', 2.2),
  run: SV('<circle cx="14.5" cy="4.6" r="1.9"/><path d="M7.5 21l2.8-5.4 3 2.6V21M5.5 11.2l3.3-3.3h4.4l2.3 3.4 3 1M10.3 15.6L12 9.6"/>'),
  can: SV('<rect x="7" y="6.5" width="10" height="14.5" rx="2.5"/><path d="M9.5 3.5h5M7 11.5h10"/>', 2.2),
  train: SV('<rect x="5" y="3.5" width="14" height="13" rx="3"/><path d="M5 10h14M8.5 20.5l1.5-4M15.5 20.5l-1.5-4"/><circle cx="9" cy="13.3" r=".6"/><circle cx="15" cy="13.3" r=".6"/>'),
  flame: SV('<path d="M12 21c-3.9 0-6.5-2.6-6.5-6 0-4.2 4.5-6.3 4.5-11 2.8 1.6 4.5 4 4.5 6.5 1-.6 1.6-1.6 1.8-2.8 1.5 1.5 2.2 3.4 2.2 5.3 0 4.4-2.6 8-6.5 8z"/>'),
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 5v14l11.5-7z" fill="currentColor"/></svg>',
};
// filled star (Wanted, end screen) — fill/stroke come from CSS
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.5 1.1 6.4L12 17.3l-5.8 3 1.1-6.4-4.7-4.5 6.5-.9z"/></svg>';
const STAR_INLINE = '<svg class="crh-istar" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8l3.1 6.4 7 .9-5.1 4.9 1.3 6.9L12 17.6l-6.3 3.3 1.3-6.9-5.1-4.9 7-.9z" fill="currentColor"/></svg>';
// route strip pieces (Driver-HUD.html)
const PIN = (n) => `<svg viewBox="0 0 16 21" aria-hidden="true"><path class="pb" d="M8 21C8 21 1.2 13.6 1.2 8.2A6.8 6.8 0 1 1 14.8 8.2C14.8 13.6 8 21 8 21Z"/><text x="8" y="11.4" text-anchor="middle">${n}</text><path class="pt" d="M4.9 8.3l2.1 2.1 4.1-4.3"/><path class="px" d="M5.7 5.9l4.6 4.6M10.3 5.9l-4.6 4.6"/></svg>`;
const RV_MARK = '<svg viewBox="0 0 22 12" aria-hidden="true"><path d="M1.5 3.2A2 2 0 0 1 3.5 1.2H15.5L19.4 4.6H21V9H1.5z" fill="#F1ECE4" stroke="#0E0F11" stroke-width="1"/><rect x="4" y="3" width="4" height="2.4" rx=".5" fill="#0E0F11"/><rect x="9.5" y="3" width="4" height="2.4" rx=".5" fill="#0E0F11"/><path d="M15.6 3h1.4l1.4 1.6h-2.8z" fill="#0E0F11"/><rect x="1.5" y="6.4" width="19.5" height="1.2" fill="#5FB3A8"/><circle cx="5.5" cy="9.6" r="1.8" fill="#0E0F11"/><circle cx="16.5" cy="9.6" r="1.8" fill="#0E0F11"/></svg>';
const BRIDGE = '<svg viewBox="0 0 14 8" aria-hidden="true"><path d="M1 7.5V4.5H13V7.5M3 4.5V7.5M11 4.5V7.5M5 4.5C5 2.2 9 2.2 9 4.5" fill="none" stroke="#BDB8B0" stroke-width="1.3"/></svg>';
const FLAG = '<svg viewBox="0 0 14 20" aria-hidden="true"><path d="M1 19V1" stroke="#F1ECE4" stroke-width="1.4"/><rect x="1.5" y="1" width="11" height="8" fill="#F1ECE4"/><path d="M1.5 1h2.75v2.67H1.5zM7 1h2.75v2.67H7zM4.25 3.67H7v2.66H4.25zM9.75 3.67h2.75v2.66H9.75zM1.5 6.33h2.75V9H1.5zM7 6.33h2.75V9H7z" fill="#0E0F11"/></svg>';
// gun silhouettes on the DEFEND button (Driver-Defend.html): revolver, pump shotgun, scoped rifle
const GUNS = `<svg class="g-rev" viewBox="0 0 62 26" fill="currentColor" aria-hidden="true"><path d="M20.5 5.2h40v4.4h-40z"/><path d="M56.4 3.4h2.6v2.2h-2.6z"/><rect x="35" y="9.2" width="18.5" height="2.6" rx="1.1"/><rect x="22.5" y="4.4" width="13.5" height="10.6" rx="2.2"/><path d="M16.8 5.4L20.5 4.6 23 4.6 23 15.4 19 15.4z"/><path d="M17.2 6L13.4 2.2 15 1.4 19.6 5z"/><path d="M16.2 5.6C14.6 9 12.6 13.4 10.6 17.6 9.4 20.1 8.8 22.4 9.3 24.6L17.6 24.8C17.1 22.4 17.5 20.2 18.6 18L21 14.6 19.6 7.2z"/><path d="M20.8 15.2c.4 3.4 2.2 5 5 5 2.6 0 4.2-1.6 4.4-4.8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M24 15.2c.2 1.8.9 2.9 2.2 3.3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M24.6 6.6h10M24.6 9.7h10M24.6 12.8h10" stroke="rgba(0,0,0,0.38)" stroke-width="0.9"/></svg>`
  + `<svg class="g-long" viewBox="0 0 120 22" fill="currentColor" aria-hidden="true"><rect x="0.6" y="7" width="2.8" height="13.2" rx="1.1"/><path d="M3 7.2L34 9.3 37 9.3 37 15.6 31 15.8 3 20z"/><path d="M36 7.4h21.5a1.5 1.5 0 0 1 1.5 1.5v6.6H36z"/><path d="M40.5 15.4c.5 3.4 2.4 4.9 5.2 4.9s4.6-1.5 5-4.9" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M44 15.4c.2 1.7.8 2.7 2 3.1" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><rect x="58.5" y="7.8" width="60" height="3.2" rx="0.8"/><rect x="116.4" y="6.6" width="1.8" height="1.4" rx="0.4"/><rect x="58.5" y="11.6" width="47" height="2.8" rx="1.2"/><rect x="67" y="10.4" width="25" height="5.8" rx="2.4"/><path d="M70.5 11.2v4.2M74 11.2v4.2M77.5 11.2v4.2M81 11.2v4.2M84.5 11.2v4.2M88 11.2v4.2" stroke="rgba(0,0,0,0.38)" stroke-width="0.9"/><path d="M38 10.4h18" stroke="rgba(0,0,0,0.3)" stroke-width="0.9"/></svg>`
  + `<svg class="g-long" viewBox="0 0 120 22" fill="currentColor" aria-hidden="true"><rect x="0.6" y="9.2" width="2.8" height="11.4" rx="1.1"/><path d="M3 9.6L29 11.1C33 11.9 36.5 12.4 40.5 12.4H82.5C84 12.4 84.6 13.2 84.6 14 84.6 14.9 84 15.4 82.5 15.4H44.6C42.4 15.6 41.2 16.6 40.6 18.2L39.3 21H34.4L35.4 17.6C33.8 16.7 32.2 16.7 30.2 17.2 21 19.2 12 20 3 20.4z"/><rect x="40" y="9.8" width="26.5" height="3.2" rx="1.2"/><rect x="66" y="10.4" width="53" height="2" rx="0.6"/><rect x="45" y="4.3" width="31" height="2.9" rx="1.4"/><path d="M40.4 3H47V8.6H40.4C39.5 6.8 39.5 4.8 40.4 3z"/><path d="M74.5 3.6L83 2.4V9.2L74.5 8z"/><rect x="57.5" y="2.3" width="3.4" height="2.4" rx="0.6"/><rect x="49.4" y="6.6" width="2.6" height="3.6"/><rect x="68.4" y="6.6" width="2.6" height="3.6"/><path d="M57 12.6L52.6 16.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="52" cy="17.3" r="1.7"/><path d="M42.2 15.4c.4 2.9 2 4.3 4.5 4.3 2.3 0 3.8-1.4 4.2-4.3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M45.6 15.4c.2 1.5.8 2.4 1.8 2.7" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>`;

// ── text tables (all original) ──
const END_TITLE = { won: 'Delivered', busted: 'Busted', wrecked: 'Wrecked', crewDown: 'Crew down', noProduct: 'Nothing to sell' };
const END_REASON = {
  won: 'The buyer took the lot. Nobody asks questions out here.',
  busted: 'The cops boxed you in. Show\'s over.',
  wrecked: 'The RV gave up the ghost.',
  crewDown: 'Somebody needs a doctor. A real one.',
  noProduct: 'You made it — with nothing to sell.',
};
const RATING_LINE = ['No stars this time', 'One star: you got there', 'Two stars: a tidy run', 'Three stars: clean, quick, no fires'];
// Set-piece captions (EV.setpiece kind → [title, subtitle]). All original; no real brands or characters.
export const SETPIECE_CAPTIONS = {
  freight_wagons: ['Runaway freight', 'Wagons rolling across the yard'],
  midnight_comet: ['The Midnight Comet', 'Six cop cars on his tail — and he just saluted you'],
  parade: ['Founders\' Day parade', 'Main Street is shut — take the market alley'],
  drawbridge: ['Drawbridge rising', 'Floor it — or wait it out'],
  wide_load: ['Wide load', 'A whole house on a truck'],
  car_carrier: ['Car carrier', 'It\'s shedding its cargo'],
  toll_plaza: ['Toll plaza', 'Pick a booth — any booth'],
  inflatable_gorilla: ['Gorilla on the loose', 'Forty feet of angry vinyl'],
  car_wash: ['Car wash', 'Lose a star in the suds'],
  cattle_drive: ['Cattle drive', 'Easy… they just moo'],
  combine: ['Combine harvester', 'Both lanes. Every last one of them.'],
  log_spill: ['Log spill', 'Timber rolling down the hill'],
  rattlers: ['The Rattlers', 'Bikers want the product — keep them off'],
  tornado: ['Tornado', 'It\'s throwing cars'],
  stagecoach: ['Runaway stagecoach', 'Out of the dust, straight across'],
  pratt_jump: ['Sergeant Pratt', 'Still right behind you…'],
  handover: ['The handover', 'Kestrel\'s men check the bags'],
};
const STOP_SHORT = { hardware: 'Bolt & Barrel', market: 'the market', chandlery: 'the chandlery', gas_ice: 'Sunny Gas', megamart: 'MegaMart', farm: 'Pete\'s farm', junkyard: 'the junkyard', lastgas: 'Last Chance' };
const SHOP_KIND = { hardware: 'grab run', market: 'haggle', chandlery: 'forklift run', gas_ice: 'pump & ice', megamart: 'trolley run', farm: 'goat round-up', junkyard: 'crane run', lastgas: 'flashlight run' };
const SHOP_KIND_BY_TYPE = { collect: 'grab run', haggle: 'haggle', forklift: 'forklift run', pump: 'pump & ice', trolley: 'trolley run', goat: 'goat round-up', crane: 'crane run', alarm: 'flashlight run' };
const STEP_WORD = { grind: 'grinding', measure: 'measuring', heat: 'heating', stir: 'stirring', cool: 'cooling', pour: 'pouring', bag: 'bagging', mix: 'mixing', filter: 'filtering', dry: 'drying' };
const DIFF = {
  easy: { label: 'Easy', color: '#D9C38A', flames: 1, bags: 4, mult: 0.75 },
  hard: { label: 'Hard', color: '#E07A3C', flames: 2, bags: 6, mult: 1 },
  extreme: { label: 'Extreme', color: '#E5483A', flames: 3, bags: 8, mult: 1.5 },
};
const MODES = new Set(['drive', 'roof', 'lab', 'shop', 'garage']);
const QUIET_PHASES = new Set(['done', 'end', 'ended', 'over', 'idle', 'finished', 'gone', 'cleanup']);
const FLASHBANG = KIND_ID.flashbang;
const NO_COP = 500;   // roof.nearCop ≥ this (the sim reports 999) = no running cop around

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const fmtTime = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmtNum = (n) => Math.round(n || 0).toLocaleString('en-US');
const fmtDist = (d) => (d < 995 ? `${Math.max(0, Math.round(d / 10) * 10)} m` : `${(d / 1000).toFixed(1)} km`);
export const fmtClock = (h) => {
  if (typeof h !== 'number' || !isFinite(h)) return '';
  let m = Math.floor(((h % 24) + 24) % 24 * 60);
  const hh = Math.floor(m / 60); m %= 60;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const normDiff = (x) => (DIFF[x] ? x : 'hard');
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
const flames = (n, color) => [0, 1, 2].map((i) => `<i style="color:${i < n ? color : 'rgba(241,236,228,.28)'}">${ICON.flame}</i>`).join('');

export class Hud {
  constructor(rootEl, data, { role = 'driver' } = {}) {
    this.rootEl = rootEl;
    this.data = data;
    this.route = data.route;
    this.rules = data.rules || {};
    this.lab = data.lab || {};
    this.role = role === 'cook' ? 'cook' : 'driver';
    this.mode = this.role === 'cook' ? 'lab' : 'drive';
    this.onDefend = null;
    this.difficulty = data.difficulty ? normDiff(data.difficulty) : null;
    this._diffSet = false;
    this.bannerDist = this.rules.stops?.bannerDist ?? 800;
    this._L = this.route.routeLength || 40000;
    this._stops = (this.route.stops || []).slice().sort((a, b) => a.z - b.z);
    this.looted = new Set();
    this._closed = new Set();
    this._missed = new Set();
    this._shownSet = new Set();
    this._last = {};
    this._lastSnap = null;
    this._prevStars = 0;
    this._prevPhase = null;
    this._gAct = {};
    this._batch = 0;
    this._shotsUntil = -1;
    this._lastShotT = -99;
    this._hitAcc = null;
    this._copsChip = null;
    this._disabledAt = new Map();
    this._maxStars = 0;
    this._look = { v: null, activeUntil: 0 };
    this._stripW = 600;
    this.time = 0;
    this._t0 = performance.now();
    this._simT = 0;
    if (rootEl && getComputedStyle(rootEl).position === 'static') rootEl.style.position = 'relative';
    const root = el('div', `crh crh--${this.role} crh--m-${this.mode}`);
    this.root = root;
    root.innerHTML = this._template();
    rootEl.appendChild(root);
    this.$ = (s) => root.querySelector(s);
    this._refs();
    this._buildStrip();
    this._applyDifficulty(this.difficulty);
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver((ents) => {
        const w = Math.round(ents[0]?.contentRect?.width || 0) + 2;   // content box + 1 px borders
        if (w > 40 && w !== this._stripW) { this._stripW = w; this._layoutStrip(); }
      });
      this._ro.observe(this.r.strip);
    }
    // text widths measured before the web fonts arrive are wrong: measure again once they are in
    document.fonts?.ready?.then(() => { if (this.root) { this._last.alW = null; this._last.diffW = null; } });
  }

  // ── DOM ───────────────────────────────────────────────────────────────────
  _template() {
    const stars = Array.from({ length: 5 }, () => `<i class="crh-star">${STAR}</i>`).join('');
    const bar = (k, label) => `<div class="crh-bar crh-bar--${k}"><span class="g-label">${label}</span><span class="crh-meter"><em></em><i></i></span><b class="g-num">100</b><span class="crh-heal" title="Healing">${ICON.plus}</span></div>`;
    const key = (k, cap, icon, label) => `<div class="crh-key crh-key--${k}"><span class="crh-key-ov"></span><kbd>${cap}</kbd><span class="crh-key-c g-num"></span><span class="crh-key-i">${icon}</span><span class="crh-key-l">${label}</span></div>`;
    return `
      <div class="crh-vig"></div>
      <section class="crh-heat g-panel st-quiet" aria-label="Wanted level">
        <div class="crh-heat-h"><span class="g-label">Wanted</span><span class="crh-heat-s"><i>${ICON.eyeOff}</i><b>Quiet</b></span></div>
        <div class="crh-heat-r"><div class="crh-stars" role="img" aria-label="0 of 5 stars">${stars}</div><span class="crh-meter"><i></i></span><b class="crh-heat-v g-num">0%</b></div>
      </section>
      <div class="crh-prog g-panel" role="img" aria-label="Route"></div>
      <section class="crh-run g-panel" aria-label="Run">
        <div class="crh-bags"><span class="g-label">Bags</span><div class="crh-bags-v"><i>${ICON.bag}</i><b class="g-num">0</b><span class="g-num">/6</span></div></div>
        <span class="crh-vr"></span>
        <div class="crh-score"><div class="crh-score-h"><span class="g-label">Score</span><span class="crh-q">Q 0%</span></div><b class="g-num">0</b></div>
      </section>
      <div class="crh-line"><div class="crh-ban g-panel"><i class="crh-ban-i"></i><span class="g-label crh-ban-l"></span><b class="crh-ban-n"></b><span class="crh-ban-s"></span><span class="crh-ban-bar crh-meter"><i></i></span><span class="crh-ban-v g-num"></span></div></div>
      <div class="crh-side">
        <div class="crh-tags">
          <div class="crh-tag crh-tag--crew g-panel"><i class="crh-tag-i"></i><span class="crh-tag-l"></span><b class="crh-tag-n"></b><span class="crh-tag-s"></span><span class="crh-tag-bar"><i></i></span></div>
          <div class="crh-tag crh-tag--cops g-panel"><i class="crh-tag-i">${ICON.binoc}</i><span class="crh-tag-l">Cops</span><b class="crh-tag-n"></b><span class="crh-tag-s g-num"></span></div>
        </div>
        <div class="crh-toasts"></div>
      </div>
      <div class="crh-toasts crh-toasts--b"></div>
      <section class="crh-hp g-panel" aria-label="Health">${bar('rv', 'RV hull')}${bar('rook', 'Rook')}${bar('doc', 'Doc')}</section>
      ${this.role === 'driver' ? `
      <section class="crh-gad g-panel" aria-label="Gadgets">
        ${key('look', 'C', ICON.eye, 'Look')}${key('smoke', 'Q', ICON.cloud, 'Smoke')}${key('oil', 'E', ICON.drop, 'Oil slick')}${key('nitro', 'Shift', ICON.bolt, 'Nitro')}
      </section>
      <div class="crh-def">
        <div class="crh-def-row">
          <div class="crh-ring g-panel" role="img" aria-label="Bust">
            <svg viewBox="0 0 48 48" aria-hidden="true"><circle class="bg" cx="24" cy="24" r="22"/><circle class="fg" cx="24" cy="24" r="22" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90 24 24)"/></svg>
            <span class="crh-ring-c"><i>${ICON.binoc}</i><b class="g-num">—</b></span>
          </div>
          <button type="button" class="crh-defend" tabindex="-1" aria-label="Defend (F)">
            <span class="crh-def-ic">${ICON.shield}</span>
            <span class="crh-def-t"><b>Defend</b><small>Climb to the roof</small></span>
            <span class="crh-def-g" aria-hidden="true">${GUNS}</span>
            <kbd class="g-keycap">F</kbd>
            <i class="crh-def-p"></i>
          </button>
        </div>
        <div class="crh-def-info g-panel"><span class="g-label">Nearest cop</span><b class="g-num">—</b><span class="g-label crh-def-x">· busted at 100%</span></div>
      </div>
      <div class="crh-spd g-panel"><b class="g-num">0</b><span class="g-label">km/h</span></div>` : ''}
      <div class="crh-caption"><b></b><small></small></div>
      <div class="crh-area"><span class="g-label">Now entering</span><b></b><small></small></div>
      <div class="crh-count"></div>
      <div class="crh-end"></div>`;
  }

  _refs() {
    const $ = this.$;
    const bar = (k) => { const e = $(`.crh-bar--${k}`); return { e, i: e.querySelector('i'), em: e.querySelector('em'), v: e.querySelector('b') }; };
    const tag = (k) => { const e = $(`.crh-tag--${k}`); return { e, i: e.querySelector('.crh-tag-i'), l: e.querySelector('.crh-tag-l'), n: e.querySelector('.crh-tag-n'), s: e.querySelector('.crh-tag-s'), bar: e.querySelector('.crh-tag-bar i') }; };
    this.r = {
      heat: $('.crh-heat'), heatSi: $('.crh-heat-s i'), heatSb: $('.crh-heat-s b'),
      stars: [...this.root.querySelectorAll('.crh-heat .crh-star')], starsBox: $('.crh-stars'), heatFill: $('.crh-heat .crh-meter i'), heatV: $('.crh-heat-v'),
      strip: $('.crh-prog'),
      run: $('.crh-run'), bags: $('.crh-bags-v b'), need: $('.crh-bags-v span'), score: $('.crh-score > b'), q: $('.crh-q'),
      line: $('.crh-line'), ban: $('.crh-ban'), banI: $('.crh-ban-i'), banL: $('.crh-ban-l'), banN: $('.crh-ban-n'), banS: $('.crh-ban-s'), banBar: $('.crh-ban-bar i'), banV: $('.crh-ban-v'),
      crew: tag('crew'), cops: tag('cops'),
      toasts: $('.crh-side .crh-toasts'), toastsB: $('.crh-toasts--b'),
      bars: { rv: bar('rv'), rook: bar('rook'), doc: bar('doc') },
      caption: $('.crh-caption'), area: $('.crh-area'), count: $('.crh-count'), end: $('.crh-end'),
    };
    if (this.role === 'driver') {
      const key = (k) => { const e = $(`.crh-key--${k}`); return { e, c: e.querySelector('.crh-key-c'), l: e.querySelector('.crh-key-l'), label: e.querySelector('.crh-key-l').textContent }; };
      Object.assign(this.r, {
        keys: { look: key('look'), smoke: key('smoke'), oil: key('oil'), nitro: key('nitro') },
        def: $('.crh-def'), defBtn: $('.crh-defend'), defSub: $('.crh-def-t small'), defP: $('.crh-def-p'),
        ring: $('.crh-ring'), ringFg: $('.crh-ring .fg'), ringV: $('.crh-ring-c b'),
        defInfo: $('.crh-def-info'), defInfoV: $('.crh-def-info b'), defInfoX: $('.crh-def-x'),
        spd: $('.crh-spd b'),
      });
      const btn = this.r.defBtn;
      btn.addEventListener('mousedown', (e) => e.preventDefault());           // never take keyboard focus
      btn.addEventListener('click', (e) => { e.preventDefault(); if (this._last.defState === 'ready') this.onDefend?.(); });
    }
  }

  _buildStrip() {
    const host = this.r.strip;
    const L = this._L;
    const ticks = (this.route.biomes || []).filter((b) => b.from > 0 && b.from < L).map(() => '<i class="crh-tick"></i>').join('');
    const pins = this._stops.map((s, i) => `<span class="crh-pin" data-id="${esc(s.id)}" title="${esc(s.name)}">${PIN(i + 1)}</span>`).join('');
    host.innerHTML = `<i class="crh-rd"></i><i class="crh-rd-fill"></i>${ticks}`
      + (this.route.bridge ? `<span class="crh-brg" title="${esc(this.route.bridge.name || 'Canyon bridge')}">${BRIDGE}</span>` : '')
      + (this.route.sellPoint ? `<span class="crh-flag" title="${esc(this.route.sellPoint.name || 'Drop-off')}">${FLAG}</span>` : '')
      + pins
      + `<span class="crh-rvm">${RV_MARK}</span><span class="crh-nd g-num"></span>`
      + '<span class="crh-al"><span class="g-label"></span><span class="crh-al-km g-num"></span></span>'
      + '<span class="crh-diff"><span class="crh-diff-f"></span><span class="g-label"></span></span>';
    const r = this.r;
    r.ticks = [...host.querySelectorAll('.crh-tick')];
    r.pins = [...host.querySelectorAll('.crh-pin')];
    r.brg = host.querySelector('.crh-brg'); r.flag = host.querySelector('.crh-flag');
    r.rvm = host.querySelector('.crh-rvm'); r.fill = host.querySelector('.crh-rd-fill');
    r.nd = host.querySelector('.crh-nd');
    r.al = host.querySelector('.crh-al'); r.alName = host.querySelector('.crh-al .g-label'); r.alKm = host.querySelector('.crh-al-km');
    r.diff = host.querySelector('.crh-diff'); r.diffF = host.querySelector('.crh-diff-f'); r.diffL = host.querySelector('.crh-diff .g-label');
    this._layoutStrip();
  }

  /** strip x (px) of a route position */
  _sx(z) { return 16 + clamp01(z / this._L) * (this._stripW - 44); }

  // static strip pieces: ticks, pins, bridge, flag (re-run on resize only)
  _layoutStrip() {
    const r = this.r;
    const bounds = (this.route.biomes || []).filter((b) => b.from > 0 && b.from < this._L);
    bounds.forEach((b, i) => { if (r.ticks[i]) r.ticks[i].style.transform = `translateX(${this._sx(b.from).toFixed(1)}px)`; });
    this._stops.forEach((s, i) => { r.pins[i].style.transform = `translateX(${(this._sx(s.z) - 9).toFixed(1)}px)`; });
    if (r.brg) r.brg.style.transform = `translateX(${(this._sx(this.route.bridge.lip) - 7).toFixed(1)}px)`;
    if (r.flag) r.flag.style.transform = `translateX(${(this._sx(this.route.sellPoint.z) - 1).toFixed(1)}px)`;
    r.fill.style.width = (this._stripW - 44) + 'px';
    this._last.rvx = null; this._last.nd = null; this._last.alx = null;
  }

  // ── public API ────────────────────────────────────────────────────────────
  setFirstPerson(on) { if (this.root) this.root.classList.toggle('crh--fp', !!on); }

  setMode(mode) {
    if (!this.root || !MODES.has(mode) || mode === this.mode) return;
    this.root.classList.remove(`crh--m-${this.mode}`);
    this.mode = mode;
    this.root.classList.add(`crh--m-${mode}`);
    this._last.crew = null; this._last.ban = null; this._last.defState = null;
  }

  setDifficulty(level) {
    this._diffSet = true;
    this._applyDifficulty(normDiff(level));
  }

  _applyDifficulty(level) {
    this.difficulty = level;
    const r = this.r;
    if (!r?.diff) return;
    r.diff.style.display = level ? '' : 'none';
    if (level) {
      const d = this._diffInfo(level);
      r.diffF.innerHTML = flames(d.flames, d.color);
      r.diffL.textContent = d.label;
      r.diffL.style.color = d.color;
    }
    this._last.bags = null; this._last.alx = null; this._last.diffW = null;
  }

  _diffInfo(level) {
    const id = normDiff(level);
    const d = DIFF[id];
    return { id, ...d, label: this.rules.difficulty?.labels?.[id] || d.label };
  }

  /** bags needed: the session data is already difficulty-adjusted (withDifficulty) → its value; only when
   *  setDifficulty() names a level the data wasn't built for (e.g. raw data) does the plan's table decide */
  _need() {
    const base = this.route.sellPoint?.requiredUnits ?? 6;
    if (!this._diffSet || !this.difficulty || this.difficulty === (this.data.difficulty ? normDiff(this.data.difficulty) : null)) return base;
    return DIFF[this.difficulty]?.bags ?? base;
  }

  /** Look keycap: v = remaining cooldown 0..1 (0 = ready, 1 = just used); null = not in the cab (dimmed). */
  setLookCooldown(v, opts = null) {
    const k = this.r?.keys?.look;
    if (!k) return;
    const now = performance.now() / 1000;
    const L = this._look;
    const on = v != null && isFinite(v);
    if (on && L.v != null && v > L.v + 0.5) L.activeUntil = now + 3;    // cooldown just restarted → the look is running
    if (opts && typeof opts.active === 'boolean') L.activeUntil = opts.active ? Math.max(L.activeUntil, now + 0.1) : 0;
    L.v = on ? v : null;
    const cdTotal = this.rules.driver?.lookCooldown ?? 30;
    let st = 'ready', lab = k.label, p = 0;
    if (!on) st = 'off';
    else if (now < L.activeUntil) { st = 'act'; lab = `${Math.max(1, Math.ceil(L.activeUntil - now))} s`; }
    else if (v > 0.002) { st = 'cd'; p = 1 - clamp01(v); lab = `${Math.max(1, Math.ceil(v * cdTotal))} s`; }
    this._keyState(k, 'look', st, lab, '', p);
  }

  _keyState(k, id, st, label, count, p) {
    const L = this._last;
    const key = `${st}|${label}|${count}`;
    if (L['k_' + id] !== key) {
      L['k_' + id] = key;
      k.e.className = `crh-key crh-key--${id}${st === 'ready' ? '' : ' ' + st}`;
      k.l.textContent = label;
      k.c.textContent = count;
    }
    const pk = st === 'cd' ? Math.round(p * 90) : -1;
    if (L['kp_' + id] !== pk) { L['kp_' + id] = pk; k.e.style.setProperty('--p', st === 'cd' ? (pk / 90).toFixed(3) : '0'); }
  }

  /** Set-piece caption (Fraunces), fades in and out. */
  caption(title, sub = '') {
    const c = this.r?.caption;
    if (!c || !title) return;
    c.querySelector('b').textContent = title;
    const s = c.querySelector('small');
    s.textContent = sub || '';
    s.style.display = sub ? '' : 'none';
    this._flash(c, 3200, '_capT');
  }

  /** Area intro title: "Now entering / Downtown / 10:12 AM". */
  areaTitle(name, hour = null) {
    const a = this.r?.area;
    if (!a || !name) return;
    a.querySelector('b').textContent = String(name);
    const t = fmtClock(hour);
    const s = a.querySelector('small');
    s.textContent = t;
    s.style.display = t ? '' : 'none';
    this._flash(a, 3600, '_areaT');
  }

  // show an element with a CSS fade ('on' → 'out' → hidden); class swaps only, no forced reflow
  _flash(node, ms, timer) {
    clearTimeout(this[timer]); clearTimeout(this[timer + 'b']);
    node.classList.remove('out');
    node.classList.add('on');
    this[timer] = setTimeout(() => {
      node.classList.add('out');
      this[timer + 'b'] = setTimeout(() => node.classList.remove('on', 'out'), 220);
    }, ms);
  }

  // ── per frame ─────────────────────────────────────────────────────────────
  update(snap) {
    if (!snap || !this.root) return;
    this.time = (performance.now() - this._t0) / 1000;
    if (snap !== this._lastSnap) {
      this._lastSnap = snap;
      this._simT = typeof snap.t === 'number' ? snap.t : this.time;
      if (snap.looted) for (const id of snap.looted) this.looted.add(id);
      if (snap.difficulty && !this._diffSet && normDiff(snap.difficulty) !== this.difficulty) this._applyDifficulty(normDiff(snap.difficulty));
      const st = snap.heat?.stars | 0;
      if (st > this._maxStars) this._maxStars = st;
      if (snap.events && snap.events.length) for (const ev of snap.events) this._event(ev, snap);
    }
    const L = this._last;
    const garage = snap.phase === 'garage';
    if (L.garage !== garage) { L.garage = garage; this.root.classList.toggle('crh--garage', garage); }
    this._heat(snap);
    this._strip(snap);
    this._run(snap);
    this._bars(snap);
    this._line(snap);
    this._tags(snap);
    if (this.role === 'driver') { this._gadgets(snap); this._defend(snap); this._speed(snap); }
    this._countdown(snap);
    this._vignette(snap);
    // area intro (on change, while driving)
    const area = snap.area && (snap.area.name || snap.area.id);
    if (area && snap.phase === 'drive' && area !== this._area) { this._area = area; this.areaTitle(area, snap.timeOfDay); }
  }

  _set(key, v, fn) { if (this._last[key] !== v) { this._last[key] = v; fn(v); } }

  // ── top-left: Wanted ──────────────────────────────────────────────────────
  _heat(snap) {
    const r = this.r, h = snap.heat || {};
    const maxS = this.rules.heat?.maxStars ?? 5;
    const stars = Math.max(0, Math.min(maxS, h.stars | 0));
    const val = typeof h.value === 'number' ? h.value : stars;
    const frac = stars >= maxS ? 1 : clamp01(val - stars);
    const delay = this.rules.heat?.decayDelay ?? 7;
    let st;
    if (stars >= maxS) st = 'max';
    else if (h.gaveUp && stars > 0) st = 'gave';
    else if (this._simT < this._shotsUntil) st = 'shots';
    else if (h.seen) st = 'seen';
    else if (stars <= 0 && val < 0.02) st = 'quiet';
    else if (typeof h.unseen === 'number' ? h.unseen >= delay : (this._prevHeatV != null && val < this._prevHeatV - 1e-5)) st = 'cool';
    else st = 'unseen';
    this._prevHeatV = val;
    this._set('stars', stars, (n) => {
      r.stars.forEach((s, i) => s.classList.toggle('on', i < n));
      r.starsBox.setAttribute('aria-label', `${n} of ${maxS} stars`);
    });
    this._set('heatSt', st, (s) => {
      const [icon, word] = { quiet: [ICON.eyeOff, 'Quiet'], seen: [ICON.eye, 'Seen'], cool: [ICON.eyeOff, 'Cooling'], unseen: [ICON.eyeOff, 'Unseen'], max: [ICON.lock, 'Max heat'], shots: [ICON.gun, 'Shots fired'], gave: [ICON.check, 'Gave up'] }[s];
      r.heat.className = `crh-heat g-panel st-${s}`;
      r.heatSi.innerHTML = icon;
      r.heatSb.textContent = word;
    });
    this._set('heatF', Math.round(frac * 200), (k) => { r.heatFill.style.transform = `scaleX(${(k / 200).toFixed(3)})`; });
    this._set('heatV', st === 'max' ? 'MAX' : `${Math.round(frac * 100)}%`, (t) => { r.heatV.textContent = t; });
  }

  // ── top-centre: route strip ───────────────────────────────────────────────
  _strip(snap) {
    const r = this.r, L = this._last;
    const z = snap.rv?.z ?? snap.dist ?? 0;
    const W = this._stripW;
    const rvx = this._sx(z);
    // RV marker + amber fill (transforms only)
    this._set('rvx', Math.round(rvx * 2) + '|' + W, () => {
      r.rvm.style.transform = `translateX(${(rvx - 11).toFixed(1)}px)`;
      r.fill.style.transform = `scaleX(${clamp01((rvx - 16) / (W - 44)).toFixed(4)})`;
    });
    // pins: done (tick) · missed (×) · next (amber) · ahead
    const cur = snap.stop?.id || null;
    if (Array.isArray(snap.closed)) for (const id of snap.closed) this._closed.add(id);
    let next = null, nextI = -1;
    const states = this._stops.map((s, i) => {
      if (this.looted.has(s.id)) return 'done';
      if (s.id === cur) { if (!next) { next = s; nextI = i; } return 'next'; }
      if (this._closed.has(s.id) || z > s.z + (s.lotLength || 40) / 2) return 'miss';
      if (!next) { next = s; nextI = i; return 'next'; }
      return '';
    });
    this._set('pins', states.join(','), () => {
      states.forEach((s, i) => { r.pins[i].className = 'crh-pin' + (s ? ' ' + s : ''); });
    });
    // next-pin distance label: left of the pin when it fits, else right of it
    let nd = '';
    if (next) nd = cur === next.id ? 'here' : fmtDist(next.z - z);
    const ndKey = `${nd}|${nextI}|${W}`;
    if (L.nd !== ndKey) {
      L.nd = ndKey;
      r.nd.textContent = nd;
      r.nd.style.display = nd ? '' : 'none';
      this._ndHidden = false;
      if (next) {
        // room to the left (back to the previous pin) or to the right (up to the following pin / the bridge)
        const left = this._sx(next.z) - 9;
        const prev = nextI > 0 ? this._sx(this._stops[nextI - 1].z) + 9 : 12;
        const after = nextI < this._stops.length - 1 ? this._sx(this._stops[nextI + 1].z) - 9 : this._sx(this.route.bridge?.lip ?? this._L) - 8;
        const w = nd.length * 6 + 2;
        if (left - prev - 4 >= w) r.nd.style.transform = `translateX(${(left - 3).toFixed(1)}px) translateX(-100%)`;
        else if (after - (left + 21) - 2 >= w) r.nd.style.transform = `translateX(${(left + 21).toFixed(1)}px)`;
        else { r.nd.style.display = 'none'; this._ndHidden = nd !== 'here'; }   // narrow strip: the banner carries the distance
      }
    }
    // area name · km, centred under the RV (clamped inside the strip, clear of the difficulty chip)
    const area = snap.area?.name || this._biomeName(z);
    const km = ` · ${(z / 1000).toFixed(1)} km`;
    if (L.alName !== area) { L.alName = area; r.alName.textContent = area; L.alW = null; }
    if (L.alKm !== km) { if (L.alKm && L.alKm.length !== km.length) L.alW = null; L.alKm = km; r.alKm.textContent = km; }
    if (L.alW == null) { L.alW = r.al.offsetWidth || (area.length * 6.4 + km.length * 5.4); L.alx = null; }   // read only when the text width changes
    if (this.difficulty && L.diffW == null) L.diffW = r.diff.offsetWidth || 54;                              // once per difficulty
    const right = W - 12 - (this.difficulty ? L.diffW + 8 : 0);
    const alx = Math.round(Math.max(12, Math.min(right - L.alW, rvx - L.alW / 2)));
    this._set('alx', alx + '|' + W, () => { r.al.style.transform = `translateX(${alx}px)`; });
    this._set('stripLbl', `${area}|${Math.round(z / 100)}`, () => r.strip.setAttribute('aria-label', `Route: ${(z / 1000).toFixed(1)} of ${(this._L / 1000).toFixed(0)} km, ${area}`));
  }

  _biomeName(z) {
    const b = (this.route.biomes || []).find((bb) => z >= bb.from && z < bb.to);
    return b ? b.name : '';
  }

  // ── top-right: bags · score · Q ───────────────────────────────────────────
  _run(snap) {
    const r = this.r, inv = snap.inv || {};
    const units = inv.units | 0, need = this._need();
    this._set('bags', units + '/' + need, () => {
      const up = this._last.units != null && units > this._last.units;
      this._last.units = units;
      r.bags.textContent = units;
      r.need.textContent = '/' + need;
      r.run.classList.toggle('ok', units >= need);
      if (up && r.bags.animate) r.bags.animate([{ color: '#8EDC9A' }, { color: '#8EDC9A', offset: 0.4 }, { color: '#F1ECE4' }], { duration: 900 });
    });
    this._set('pts', Math.round(snap.score?.points || 0), (v) => { r.score.textContent = fmtNum(v); });
    this._set('q', units > 0 ? Math.round((inv.quality || 0) * 100) : -1, (v) => { r.q.textContent = `Q ${Math.max(0, v)}%`; r.q.style.visibility = v < 0 ? 'hidden' : ''; });
  }

  // ── bottom-left: bars ─────────────────────────────────────────────────────
  _bars(snap) {
    const maxHp = this.rules.rv?.maxHp ?? 100, crewMax = this.rules.rv?.crewMaxHp ?? 100;
    const crew = snap.crew || {};
    const hp = snap.rv?.hp ?? maxHp;
    this._bar('rv', hp / maxHp, hp, !!snap.rv?.regen);
    this._bar('rook', (crew.driver ?? crewMax) / crewMax, crew.driver ?? crewMax, !!crew.regen?.driver);
    this._bar('doc', (crew.cook ?? crewMax) / crewMax, crew.cook ?? crewMax, !!crew.regen?.cook && !crew.cookDown);
  }

  _bar(k, f, v, regen) {
    f = clamp01(f);
    const b = this.r.bars[k];
    const key = Math.round(f * 400);
    const L = this._last;
    if (L['hp_' + k] !== key) {
      L['hp_' + k] = key;
      const s = `scaleX(${f.toFixed(4)})`;
      b.i.style.transform = s;
      b.em.style.transform = s;          // the ghost catches up after a delay (CSS transition)
      b.v.textContent = Math.max(0, Math.round(v));
      b.e.classList.toggle('low', f < 0.25);
    }
    this._set('rg_' + k, regen, (on) => b.e.classList.toggle('regen', on));
  }

  // ── centre line under the strip: one message, by priority ─────────────────
  _line(snap) {
    const r = this.r, L = this._last;
    const msg = this._lineMsg(snap);
    const key = msg ? `${msg.tone}|${msg.icon}|${msg.label}|${msg.name}|${msg.sub}|${msg.flip ? 1 : 0}|${msg.bar != null ? 1 : 0}` : '';
    if (L.ban !== key) {
      L.ban = key;
      const b = r.ban;
      r.line.classList.toggle('on', !!msg);
      if (msg) {
        b.className = `crh-ban g-panel tone-${msg.tone}${msg.flip ? ' flip' : ''}${msg.bar != null ? ' has-bar' : ''}`;
        r.banI.innerHTML = ICON[msg.icon] || '';
        r.banL.textContent = msg.label || '';
        r.banL.style.display = msg.label ? '' : 'none';
        r.banN.textContent = msg.name || '';
        r.banS.textContent = msg.sub || '';
        r.banS.style.display = msg.sub ? '' : 'none';
      }
    }
    const bk = msg && msg.bar != null ? Math.round(clamp01(msg.bar) * 100) : -1;
    if (L.banBar !== bk) {
      L.banBar = bk;
      if (bk >= 0) { r.banBar.style.transform = `scaleX(${(bk / 100).toFixed(2)})`; r.banV.textContent = bk + '%'; }
    }
  }

  _lineMsg(snap) {
    if (snap.phase !== 'drive') return null;
    const st = snap.stop, roof = snap.roof || st?.roof || null;
    const bust = snap.bust || 0;
    const stars = snap.heat?.stars | 0;
    const kmh = Math.abs(snap.rv?.speed || 0) * 3.6;
    // 1. a cop at the RV (bust filling, or a running cop right next to a stopped RV)
    const near = roof && typeof roof.nearCop === 'number' && roof.nearCop < NO_COP ? roof.nearCop : null;
    const upTop = roof && (roof.onRoof || roof.climbing);
    if (!upTop && (bust > 0.01 || (stars > 0 && kmh < 5.4 && near != null && near < (this.rules.heat?.bust?.radius ?? 7.5) * 2))) {
      const docOut = st && (st.doc === 'out' || (st.state === 'shopping' && st.docShop));
      const sub = this.mode === 'lab' || this.mode === 'shop' ? 'Rook has to hold them off'
        : docOut ? 'Doc is still inside — hold them off' : this.role === 'driver' ? 'climb up and hold them off' : 'hold them off';
      return { tone: 'alert', icon: 'binoc', label: '', name: 'Cop at the RV', sub };
    }
    // 2. cop alongside while the lab is cooking with the curtains open
    const lab = snap.lab || {};
    if (snap.alert?.copClose && lab.cooking && !lab.curtains) return { tone: 'alert', icon: 'binoc', label: '', name: 'Cop alongside', sub: this.mode === 'lab' ? 'close the curtains, Doc' : 'Doc\'s curtains are open' };
    // 3. flash / foam canister ahead
    const can = this._canister(snap);
    if (can) return { tone: 'warn', icon: 'can', label: '', name: can.foam ? 'Foam canister' : 'Flash canister', sub: `${Math.round(can.d / 5) * 5} m — swerve` };
    // 4. the canyon bridge: speed check
    const br = snap.bridge || {};
    const needKmh = (br.speedNeeded || 0) * 3.6;
    if (br.dist != null && br.dist > 0 && br.dist < 520 && needKmh > 0 && !br.cleared) {
      const ok = kmh >= needKmh;
      return { tone: ok ? 'good' : 'warn', icon: 'alert', label: 'Bridge out', name: `${Math.round(br.dist / 10) * 10} m`, sub: ok ? `${Math.round(kmh)} km/h — hold it` : `hit ${Math.round(needKmh)} km/h · now ${Math.round(kmh)}` };
    }
    // 5. loading supplies (hold still)
    if (st && (st.state === 'loading' || (st.state == null && st.progress > 0))) {
      return st.blocked
        ? { tone: 'alert', icon: 'binoc', label: 'Loading', name: 'Cops at the lot', sub: 'loading paused', bar: st.progress || 0 }
        : { tone: 'info', icon: 'bag', label: 'Loading', name: 'Supplies', sub: 'hold still', bar: st.progress || 0 };
    }
    // 6. missed a stop / the next stop
    return this._stopMsg(snap);
  }

  // "Next stop / Bolt & Barrel Hardware / on the right" + "Missed it" when the RV drives past (both roles)
  _stopMsg(snap) {
    const near = snap.nearStop, st = snap.stop;
    const z = snap.rv?.z ?? 0;
    const missed = (id, name) => {
      if (this._missed.has(id) || this.looted.has(id)) return;
      this._missed.add(id); this._missUntil = this.time + 3.4;
      this._missName = name || this._stops.find((s) => s.id === id)?.name || '';
    };
    if (Array.isArray(snap.closed)) for (const id of snap.closed) if (!this._closedSeen?.has(id)) { (this._closedSeen ||= new Set()).add(id); missed(id); }
    if (this._near && (!near || near.id !== this._near.id)) {
      const n = this._near;
      if (!(st && st.id === n.id) && z > n.z) missed(n.id, n.name);
      this._near = null;
    }
    if (near && !this.looted.has(near.id) && (!st || st.id !== near.id)) {
      const def = this._stops.find((s) => s.id === near.id);
      this._near = { id: near.id, z: near.z ?? def?.z ?? z + near.dist, name: near.name };
    } else if (st) this._near = null;
    if (this._missUntil && this.time < this._missUntil) return { tone: 'miss', icon: 'cross', label: 'Missed it', name: 'No supplies here', sub: this._missName || '' };
    if (!near || this.looted.has(near.id) || st || near.dist > this.bannerDist || near.dist < -2) return null;
    const def = this._stops.find((s) => s.id === near.id);
    const side = (near.side ?? def?.side ?? 1) > 0 ? 'right' : 'left';
    if (near.dist < 90) return { tone: 'good', icon: 'turn', flip: side === 'left', label: 'Pull in', name: near.name, sub: `on the ${side}` };
    const cookView = this.mode === 'lab' || this.mode === 'shop';
    const kind = SHOP_KIND[near.id] || SHOP_KIND_BY_TYPE[near.shopType || def?.shopType] || '';
    const sub = cookView ? `in ${fmtDist(near.dist)}${kind ? ' · ' + kind : ''}` : this._ndHidden ? `in ${fmtDist(near.dist)} · on the ${side}` : `on the ${side}`;
    return { tone: 'info', icon: 'turn', flip: side === 'left', label: 'Next stop', name: near.name, sub };
  }

  // nearest flash / foam canister ahead of the RV (state 0 flying, 1 armed)
  _canister(snap) {
    const rv = snap.rv;
    if (!rv || !snap.ents || FLASHBANG == null) return null;
    let best = null;
    const fx = Math.sin(rv.yaw || 0), fz = Math.cos(rv.yaw || 0);
    for (const e of snap.ents) {
      if (e[1] !== FLASHBANG || e[7] === 2) continue;
      const dx = e[2] - rv.x, dz = e[4] - rv.z;
      const d = Math.hypot(dx, dz);
      if (d > 40 || dx * fx + dz * fz < -6) continue;
      if (!best || d < best.d) best = { d, foam: e[6] === 1 };
    }
    return best;
  }

  // ── right column: the other player's chip + cops inbound ──────────────────
  _tags(snap) {
    const r = this.r;
    const showRook = this.mode === 'lab' || this.mode === 'shop';
    const c = showRook ? this._rookChip(snap) : this._docChip(snap);
    const key = c ? `${showRook ? 'r' : 'd'}|${c.tone || ''}|${c.icon}|${c.n}|${c.s}|${c.bar != null ? 1 : 0}` : '';
    this._set('crew', key, () => {
      const t = r.crew;
      t.e.style.display = c ? '' : 'none';
      if (!c) return;
      t.e.className = `crh-tag crh-tag--crew g-panel ${showRook ? 'who-rook' : 'who-doc'}${c.tone ? ' tone-' + c.tone : ''}${c.bar != null ? ' has-bar' : ''}`;
      t.i.innerHTML = ICON[c.icon] || '';
      t.l.textContent = showRook ? 'Rook' : 'Doc';
      t.n.textContent = c.n;
      t.s.textContent = c.s || '';
      t.s.style.display = c.s ? '' : 'none';
    });
    const bk = c && c.bar != null ? Math.round(clamp01(c.bar) * 100) : -1;
    this._set('crewBar', bk, (v) => { if (v >= 0) r.crew.bar.style.transform = `scaleX(${(v / 100).toFixed(2)})`; });
    // cops called to the stop (EV.STOP_COPS): countdown until they arrive
    const cc = this._copsChip;
    let ck = '';
    if (cc && snap.phase === 'drive') {
      const left = cc.eta - this._simT;
      if (left > 0 && left < 60) ck = `${cc.count}|${Math.ceil(left)}`;
      else this._copsChip = null;
    }
    this._set('cops', ck, (v) => {
      const t = r.cops;
      t.e.style.display = v ? '' : 'none';
      if (!v) return;
      const [n, s] = v.split('|');
      t.n.textContent = `${n} on the way`;
      t.s.textContent = fmtTime(+s);
    });
  }

  _docChip(snap) {
    const st = snap.stop, crew = snap.crew || {};
    if (snap.phase === 'garage') { const d = snap.garage?.doc; return d?.inRv ? { icon: 'flask', n: 'Aboard', s: 'in the lab' } : { icon: 'flask', n: 'On foot', s: 'in the garage' }; }
    if (snap.phase !== 'drive' && snap.phase !== 'countdown') return null;
    if (crew.cookDown) return { tone: 'bad', icon: 'alert', n: 'Doc is down', s: 'back in a moment' };
    if (st) {
      const short = STOP_SHORT[st.id] || st.name || 'the shop';
      const ds = st.docShop;
      if (st.state === 'loading') return { tone: st.blocked ? 'bad' : '', icon: 'bag', n: st.blocked ? 'Loading paused' : 'Loading supplies', s: `${Math.round(clamp01(st.progress || 0) * 100)}%`, bar: clamp01(st.progress || 0) };
      if (st.state === 'returning' || st.doc === 'back') return { icon: 'run', n: 'Running back', s: '' };
      if (ds && (st.doc === 'out' || st.state === 'shopping')) return { icon: 'flask', n: `In ${short}${ds.label ? ' · ' + ds.label : ''}`, s: ds.tLeft != null ? fmtTime(ds.tLeft) : '', bar: ds.frac != null ? clamp01(ds.frac) : null };
      if (st.doc === 'out') { const left = st.shopMax > 0 && st.shopT != null ? fmtTime(st.shopMax - st.shopT) : ''; return { icon: 'flask', n: `In ${short}`, s: left }; }
      if (st.state === 'shopping') return { icon: 'flask', n: 'Heading out', s: 'side door' };
      if (st.state === 'parked') return { icon: 'flask', n: 'Getting ready', s: short };
    }
    const lab = snap.lab || {};
    if ((lab.fire || 0) > 0.3) return { tone: 'bad', icon: 'flame', n: 'Fire in the lab', s: '' };
    if (lab.cooking) {
      const step = lab.stepType ? (STEP_WORD[lab.stepType] || lab.stepType) : 'cooking';
      return { icon: 'flask', n: `${this._batch ? `Batch ${this._batch}` : 'Batch'} · ${step}`, s: typeof lab.temp === 'number' && lab.temp > 30 ? `${Math.round(lab.temp)}°` : '' };
    }
    return { icon: 'flask', n: 'In the lab', s: (lab.fumes || 0) > 0.6 ? 'fumes high' : 'idle' };
  }

  _rookChip(snap) {
    if (snap.phase === 'garage') { const g = snap.garage?.rook; return g?.inRv ? { icon: 'wheel', n: 'In the seat', s: '' } : { icon: 'wheel', n: 'On foot', s: 'in the garage' }; }
    if (snap.phase !== 'drive' && snap.phase !== 'countdown') return null;
    const st = snap.stop, roof = snap.roof || st?.roof || null;
    const bust = Math.round((snap.bust || 0) * 100);
    if (roof?.onRoof) return { tone: bust > 25 ? 'bad' : '', icon: 'shield', n: 'On the roof', s: `bust ${bust}%` };
    if (roof?.climbing) return { icon: 'shield', n: roof.climbDir === 'down' ? 'Climbing down' : 'Climbing up', s: '' };
    if ((snap.crew?.driver ?? 1) <= 0) return { tone: 'bad', icon: 'alert', n: 'Rook is down', s: '' };
    const kmh = Math.round(Math.abs(snap.rv?.speed || 0) * 3.6);
    if (st && kmh < 4) return { icon: 'wheel', n: 'Parked', s: STOP_SHORT[st.id] || '' };
    if (kmh < 2) return { icon: 'wheel', n: 'Stopped', s: bust > 0 ? `bust ${bust}%` : '' };
    return { icon: 'wheel', n: 'Driving', s: `${kmh} km/h` };
  }

  // ── bottom-right: gadget keycaps ──────────────────────────────────────────
  _gadgets(snap) {
    const g = snap.inv?.gadgets || {};
    const t = this._simT;
    const G = this.rules.gadgets || {};
    for (const id of ['smoke', 'oil']) {
      const n = g[id] | 0, a = this._gAct[id];
      const k = this.r.keys[id];
      if (a && t < a.until) this._keyState(k, id, 'cd', `${Math.max(1, Math.ceil(a.until - t))} s`, '×' + n, clamp01((t - a.t0) / (a.until - a.t0)));
      else this._keyState(k, id, n > 0 ? 'ready' : 'empty', k.label, '×' + n, 0);
    }
    const nitro = snap.rv?.nitro || 0, nn = g.nitro | 0;
    const ns = G.nitro?.seconds ?? this.rules.rv?.nitroSeconds ?? 3.5;
    if (nitro > 0) this._keyState(this.r.keys.nitro, 'nitro', 'act', `${Math.max(1, Math.ceil(nitro * ns))} s`, '×' + nn, 0);
    else this._keyState(this.r.keys.nitro, 'nitro', nn > 0 ? 'ready' : 'empty', 'Nitro', '×' + nn, 0);
    // the Look key starts dimmed until main.js reports the cab's cooldown
    if (this._last.k_look == null) this.setLookCooldown(null);
  }

  // ── bottom-centre: DEFEND (driver, over the dash) ─────────────────────────
  _defend(snap) {
    const r = this.r, L = this._last;
    const roof = snap.roof || snap.stop?.roof || null;
    const stars = snap.heat?.stars | 0;
    const near = roof && typeof roof.nearCop === 'number' && roof.nearCop < NO_COP ? roof.nearCop : null;
    const bust = snap.bust || 0;
    let state = 'hidden', sub = '';
    if (roof && snap.phase === 'drive' && this.mode === 'drive' && !snap.rv?.wrecked) {
      if (roof.climbing && roof.climbDir === 'down') { state = 'held'; sub = 'Climbing down…'; }
      else if (roof.climbing) { state = 'held'; sub = 'Climbing to the roof…'; }
      else if (roof.onRoof || roof.active) { state = 'up'; sub = roof.ai ? 'AI Rook is on the roof' : 'Rook is on the roof'; }
      else if (roof.available) { state = 'ready'; sub = 'Climb to the roof'; }
      else if ((roof.why === 'moving' || roof.why === 'airborne') && stars > 0 && (near == null || near <= 40)) { state = 'locked'; sub = roof.why === 'airborne' ? 'Land first' : 'Stop the RV first'; }
    }
    if (L.defState !== state || L.defSub !== sub) {
      L.defState = state; L.defSub = sub;
      r.def.className = `crh-def${state === 'hidden' ? '' : ' on st-' + state}`;
      r.defSub.textContent = sub;
      r.defBtn.setAttribute('aria-disabled', state === 'ready' ? 'false' : 'true');
    }
    if (state === 'hidden') return;
    this._set('defP', state === 'held' ? Math.round(clamp01(roof.climbDir === 'down' ? 1 - (roof.climb || 0) : (roof.climb || 0)) * 100) : -1, (v) => {
      r.defP.style.transform = `scaleX(${v < 0 ? 0 : (v / 100).toFixed(2)})`;
    });
    // ring: bust % (red) while the meter fills, else how close the nearest running cop is (amber)
    let frac, txt, tone;
    if (bust > 0.005) { frac = bust; txt = `${Math.round(bust * 100)}%`; tone = bust < 0.25 ? 'amber' : 'red'; }
    else if (near != null) { frac = clamp01(1 - near / 40); txt = `${Math.round(near)} m`; tone = 'amber'; }
    else { frac = 0; txt = '—'; tone = 'dim'; }
    this._set('ring', `${Math.round(frac * 100)}|${txt}|${tone}`, () => {
      r.ringFg.setAttribute('stroke-dasharray', `${(frac * 100).toFixed(1)} 100`);
      r.ringV.textContent = txt;
      r.ring.className = `crh-ring g-panel tone-${tone}`;
      r.ring.setAttribute('aria-label', bust > 0.005 ? `Bust ${txt}` : near != null ? `Nearest cop ${txt}` : 'No cop near');
    });
    const bi = snap.bustInfo || {};
    const moving = Math.abs(snap.rv?.speed || 0) >= (this.rules.heat?.bust?.maxRvSpeed ?? 4);
    const grace = !moving && typeof bi.grace === 'number' && bi.grace > 0.05 && !bi.armed && near != null ? bi.grace : 0;
    const tail = moving ? '· safe while moving' : grace ? `· bust arms in ${Math.ceil(grace)} s` : '· busted at 100%';
    this._set('defInfo', near == null ? '' : `${Math.round(near)}|${tail}`, () => {
      r.defInfo.style.visibility = near == null ? 'hidden' : '';
      if (near == null) return;
      r.defInfoV.textContent = `${Math.round(near)} m`;
      r.defInfoX.textContent = tail;
    });
  }

  _speed(snap) {
    this._set('spd', Math.round(Math.abs(snap.rv?.speed || 0) * 3.6), (v) => { this.r.spd.textContent = v; });
  }

  _vignette(snap) {
    const bust = snap.bust || 0;
    const v = snap.phase === 'drive' ? Math.min(1, bust * 1.3 + (this._last.ban && this._last.ban.startsWith('alert') ? 0.35 : 0)) : 0;
    this._set('vig', Math.round(v * 20), (k) => this.root.style.setProperty('--vig', (k / 20).toFixed(2)));
  }

  _countdown(snap) {
    const c = this.r.count;
    let txt = '';
    if (snap.phase === 'countdown') txt = String(Math.max(1, Math.ceil(snap.countdown || 0)));
    if (this._prevPhase === 'countdown' && snap.phase === 'drive') this._goUntil = this.time + 0.9;
    this._prevPhase = snap.phase;
    if (!txt && this._goUntil && this.time < this._goUntil) txt = 'Go!';
    if (txt !== this._last.count) {
      this._last.count = txt;
      // a fresh element per number: its CSS entrance animation plays without a forced reflow
      c.innerHTML = txt ? `<b class="${txt === 'Go!' ? 'go' : ''}">${txt}</b>` : '';
    }
  }

  // ── events ────────────────────────────────────────────────────────────────
  _event(ev, snap) {
    const t = this._simT;
    switch (ev.type) {
      case EV.MSG: this.toast(ev.text, ev.tone || 'info'); break;
      case EV.STOP_DONE: {
        this.looted.add(ev.id);
        const ing = this.lab.ingredients || {};
        const gives = Object.entries(ev.gives || {}).map(([k, n]) => `+${n} ${ing[k]?.name || k}`).join('  ');
        this.toast('Supplies loaded', 'good', { icon: 'bag', sub: gives });
        this._copsChip = null;
        break;
      }
      case EV.STARS: {
        const s = ev.stars | 0;
        if (s > this._prevStars) this.toast('Heat rising', 'heat', { icon: 'star', value: `${s}★`, key: 'stars' });
        else if (s === 0 && this._prevStars > 0) this.toast('Heat gone', 'good', { icon: 'eyeOff', sub: 'lay low', key: 'stars' });
        this._prevStars = s;
        if (s > this._maxStars) this._maxStars = s;
        break;
      }
      case EV.COPS_GAVE_UP: this.toast('The cops gave up', 'good', { icon: 'check' }); break;
      case EV.BIOME:
        if (!snap.area && ev.name && ev.name !== this._area) { this._area = ev.name; if (snap.phase === 'drive') this.areaTitle(ev.name, snap.timeOfDay); }
        break;
      case EV.FELL: this.toast('Into the canyon', 'bad', { icon: 'alert', sub: 'back to the checkpoint' }); break;
      case EV.LANDED: this.toast(ev.hard ? 'Hard landing' : 'Nailed the jump', ev.hard ? 'bad' : 'good', { icon: ev.hard ? 'alert' : 'check' }); break;
      case EV.SPOTTED: this.toast('The cops saw the lab', 'bad', { icon: 'eye' }); break;
      case EV.TRAIN: if (ev.state === 'warn') this.toast('Train coming', 'heat', { icon: 'train' }); break;
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
        if (ev.hitRv) this.toast(ev.kind === 'foam' ? 'Foamed' : 'Flashbang', 'bad', { icon: 'can', sub: ev.kind === 'foam' ? 'the RV is stuck in goo' : '' });
        break;
      case EV.HEAT_DROP: this.toast('Heat dropped', 'good', { icon: 'eyeOff', sub: ev.reason || '' }); break;
      case EV.SHOP_RESULT:
        if (ev.ok === false) this.toast('Doc came back empty-handed', 'bad', { icon: 'bag' });
        break;
      case EV.RECIPE_OK: this._batch++; break;
      case EV.GADGET: {
        const g = ev.gadget;
        const dur = this.rules.gadgets?.[g]?.duration;
        if ((g === 'smoke' || g === 'oil') && dur > 0) this._gAct[g] = { t0: t, until: t + dur };
        break;
      }
      // ── Round 3 ──
      case EV.SHOT: {
        if (t - this._lastShotT > 4) {
          const pct = Math.round((this.rules.defend?.heatPerShot ?? 0.04) * 100);
          this.toast('Shots fired', 'heat', { icon: 'gun', value: `+${pct}% heat`, key: 'shots' });
        }
        this._lastShotT = t;
        this._shotsUntil = t + 2.5;
        break;
      }
      case EV.COP_DISABLED: {
        const last = this._disabledAt.get(ev.copId);
        if (last != null && t - last < 3) break;
        this._disabledAt.set(ev.copId, t);
        const [txt, icon] = { tyre: ['Tyre out', 'tyre'], radiator: ['Radiator hit', 'steam'], stall: ['Stalled', 'power'] }[ev.how] || ['Car stopped', 'power'];
        this.toast(txt, 'info', { icon, sub: ev.copId != null ? `Unit ${ev.copId}` : '' });
        break;
      }
      case EV.COP_SHOT: {
        if (!ev.hit || !(ev.damage > 0)) break;
        const who = ev.target === 'rook' ? 'Rook hit' : 'Hull hit';
        const a = this._hitAcc && this._hitAcc.who === who && t - this._hitAcc.t < 2 ? this._hitAcc : { who, dmg: 0 };
        a.dmg += ev.damage; a.t = t;
        this._hitAcc = a;
        this.toast(who, 'bad', { icon: who === 'Rook hit' ? 'alert' : 'truck', value: `−${Math.round(a.dmg)}`, key: who });
        break;
      }
      case EV.STOP_COPS: this._copsChip = { count: (ev.count | 0) || 1, eta: t + (ev.eta ?? 8) }; break;
      default: break;
    }
  }

  // ── toasts: one line, fade (≤ 6 px slide), 3 s ────────────────────────────
  toast(text, tone = 'info', opts = {}) {
    if (!text || !this.root) return;
    const host = this.mode === 'lab' ? this.r.toastsB : this.r.toasts;
    const icon = opts.icon || { good: 'check', bad: 'alert', heat: 'star', cops: 'binoc', info: 'info' }[tone] || 'info';
    let t = null;
    if (opts.key) for (const c of host.children) if (c.dataset.key === opts.key) t = c;
    if (!t) {
      t = el('div', `crh-toast g-panel tone-${tone}`);
      if (opts.key) t.dataset.key = opts.key;
      host.appendChild(t);
    } else t.classList.remove('out');
    t.innerHTML = `<i>${ICON[icon] || ''}</i><b></b>${opts.sub ? '<span class="s"></span>' : ''}${opts.value ? '<span class="v g-num"></span>' : ''}`;
    t.querySelector('b').textContent = text;
    if (opts.sub) t.querySelector('.s').textContent = opts.sub;
    if (opts.value) t.querySelector('.v').textContent = opts.value;
    while (host.children.length > 3) host.firstChild.remove();
    clearTimeout(t._a); clearTimeout(t._b);
    t._a = setTimeout(() => t.classList.add('out'), 2800);
    t._b = setTimeout(() => t.remove(), 3050);
  }

  // ── end screen (End.png) ──────────────────────────────────────────────────
  showEnd(result = {}, { onRestart, onMenu, canRestart = true, restartLabel = 'Play again', menuLabel = 'Back to lobby', title: titleOverride = null, reasonText = null } = {}) {
    const e = this.r.end;
    const snap = this._lastSnap || {};
    const won = !!result.won;
    const key = won ? 'won' : (result.reason in END_TITLE ? result.reason : (snap.lostReason || 'wrecked'));
    const title = titleOverride || END_TITLE[key] || (won ? 'Delivered' : 'Game over');
    const rating = Math.max(0, Math.min(3, result.stars | 0));
    const reason = reasonText != null ? reasonText
      : typeof result.reason === 'string' && !(result.reason in END_TITLE) ? result.reason
        : won ? RATING_LINE[rating] : END_REASON[key] || '';
    const need = this._need();
    const sc = snap.score || {};
    const z = snap.rv?.z ?? snap.dist ?? 0;
    const areaName = snap.area?.name || this._biomeName(z) || '';
    const tod = fmtClock(snap.timeOfDay);
    const maxStars = result.maxStars ?? snap.maxStars ?? this._maxStars;
    const lvl = this._diffInfo(result.difficulty || this.difficulty || snap.difficulty || 'hard');
    const mult = typeof result.scoreMult === 'number' ? result.scoreMult : lvl.mult;
    const startName = (this.route.biomes || [])[0]?.name?.split(' ')[0] || 'Start';
    const stat = (icon, label, value) => `<div class="crh-end-st"><span class="g-label">${ICON[icon]}${esc(label)}</span><b class="g-num">${value}</b></div>`;
    const lines = (a, b) => [a, b].filter(Boolean).map(esc).join('<br>');
    const rook = lines(result.copsDisabled != null ? `${result.copsDisabled} cops shaken` : `${result.copsWrecked ?? sc.copsWrecked ?? 0} cops shaken`,
      result.roofStands != null ? `${result.roofStands} roof stands won` : `${fmtNum(result.points ?? sc.points ?? 0)} points · chaos ${result.chaos ?? sc.chaos ?? 0}`);
    const doc = lines(result.batches != null ? `${result.batches} batches cooked` : this._batch ? `${this._batch} batches cooked` : `${result.units ?? 0} bags bagged`,
      result.shopRuns != null ? `${result.shopRuns} shop runs, ${result.alarms ?? 0} alarms` : `${Math.round((result.quality || 0) * 100)}% quality`);
    e.innerHTML = `<div class="crh-end-in ${won ? 'won' : 'lost'}">
      <div class="crh-end-mark" aria-label="Cook and Run"><span class="c">Cook</span><span class="a">&amp;</span><span class="r">Run</span></div>
      <div class="crh-end-run"><b class="g-label">${esc(lvl.label)} · Route ${Math.round(this._L / 1000)} km</b><span>${esc(startName)} → ${esc(areaName || 'the road')} · ${(z / 1000).toFixed(1)} km</span></div>
      <div class="crh-end-head">
        <span class="crh-end-where g-label">${esc([areaName, tod].filter(Boolean).join(' · ') || 'On the road')}</span>
        <h1 class="crh-end-title">${esc(title)}</h1>
      </div>
      <section class="crh-end-card" aria-label="Payout">
        <div class="crh-end-top">
          <div><span class="g-label">Payout</span><b class="crh-end-pay g-num">$${fmtNum(result.payout || 0)}</b></div>
          <div class="crh-end-rate"><div class="crh-end-stars" role="img" aria-label="${rating} of 3 stars">${[0, 1, 2].map((i) => `<i class="crh-star${i < rating ? ' on' : ''}">${STAR}</i>`).join('')}</div><p>${esc(reason)}</p></div>
        </div>
        <div class="crh-end-grid">
          ${stat('bag', 'Bags', `${result.units ?? 0}/${need}`)}${stat('clock', 'Time', fmtTime(result.timeSec))}
          ${stat('star', 'Max heat', `${maxStars | 0}<span class="crh-end-istar">${STAR_INLINE}</span>`)}${stat('flask', 'Quality', `${Math.round((result.quality || 0) * 100)}%`)}
        </div>
      </section>
      <div class="crh-end-btns">
        ${canRestart ? `<button type="button" class="g-btn g-btn--primary" data-a="restart">${ICON.play}${esc(restartLabel)}</button>` : '<span class="crh-end-wait">Waiting for the host…</span>'}
        <button type="button" class="g-btn" data-a="menu">${esc(menuLabel)}</button>
        <span class="crh-end-diff" style="--dc:${lvl.color}" title="Difficulty"><span class="f">${flames(lvl.flames, lvl.color)}</span><span class="g-label">${esc(lvl.label)} ×${+mult.toFixed(2)}</span></span>
      </div>
      <section class="crh-end-crew" aria-label="Crew">
        <div><span class="av rook">R</span><div><b>Rook</b><p>${rook}</p></div></div>
        <span class="vr"></span>
        <div><span class="av doc">D</span><div><b>Doc</b><p>${doc}</p></div></div>
      </section>
    </div>`;
    e.classList.add('on');
    const bind = (a, fn) => { const b = e.querySelector(`[data-a="${a}"]`); if (b) { b.addEventListener('click', () => fn && fn()); b.addEventListener('mousedown', (ev) => ev.preventDefault()); } };
    bind('restart', onRestart);
    bind('menu', onMenu);
    this.root.classList.add('crh--ended');
  }

  hideEnd() {
    const e = this.r?.end;
    if (e) { e.classList.remove('on'); e.innerHTML = ''; }
    this.root?.classList.remove('crh--ended');
  }

  // Reset per-run state (looted stops etc.) — call on restart if the Hud is reused.
  reset() {
    this.looted.clear(); this._closed.clear(); this._missed.clear(); this._shownSet.clear();
    this._closedSeen?.clear();
    this._last = {}; this._prevStars = 0; this._prevPhase = null; this._lastSnap = null;
    this._area = null; this._near = null; this._missUntil = 0; this._goUntil = 0;
    this._gAct = {}; this._batch = 0; this._shotsUntil = -1; this._lastShotT = -99; this._hitAcc = null;
    this._copsChip = null; this._disabledAt.clear(); this._maxStars = 0; this._prevHeatV = null;
    this._look = { v: null, activeUntil: 0 };
    for (const h of [this.r.toasts, this.r.toastsB]) h.innerHTML = '';
    for (const n of [this.r.caption, this.r.area]) n.classList.remove('on', 'out');
    this.r.line.classList.remove('on');
    this._layoutStrip();
    this._applyDifficulty(this.difficulty);
    this.hideEnd();
  }

  destroy() {
    for (const k of ['_capT', '_capTb', '_areaT', '_areaTb']) clearTimeout(this[k]);
    this._ro?.disconnect();
    if (this.root) this.root.remove();
    this.root = null;
  }
}
