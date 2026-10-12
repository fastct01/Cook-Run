// Front-end menu for Cook & Run (Round 3 "dark glass"): live title scene, online room, difficulty
// picker, how-to modal. Reference: docs/r3/ui/Main.png, Main-phone.png, Lobby.png, Difficulty.png.
//
//   import { showLobby, hideLobby } from './ui/lobby.js';
//   const lobby = showLobby(rootEl, { onStart });
//   // onStart({ mode:'solo'|'online', role:'driver'|'cook', seed, net, roomCode, players, you, isHost, name,
//   //           difficulty: 'easy'|'hard'|'extreme' })
//   //   net = NetClient (online, still connected and in the room) or null (solo)
//   //   difficulty: solo = the title's segmented control (remembered per browser); online = the room's
//   //   pick from the START message (the host chooses it in the room, the server locks it at START)
//
//   After a game:
//   showLobby(rootEl, { onStart, net, resumeRoom: true })  // back to the same room (sends {t:'lobby'})
//   showLobby(rootEl, { onStart, net })                    // quit to title (leaves the room, closes net)
//   showLobby(rootEl, { onStart })                         // plain title screen
//
// Options: { onStart, net, resumeRoom, inviteBase, netOptions, toast, onSettings }.
//   toast:      a message to show on open (string, or { text, tone: 'info'|'good'|'bad' })
//   onSettings: if given, the title shows a "Settings" link that calls it (the mockup's link)
// The stylesheet ../../css/lobby.css (which @imports tokens.css + fonts.css) is injected if the page
// didn't link it. window.COOKRUN_STATIC (static build) keeps the menu solo-only.
// Test hooks: window.__titleScene (the live scene: .rvPass({ cop: true }), .stats()).

import { NetClient } from '../net/NetClient.js';
import { DIFFICULTIES, normDifficulty, difficultyInfo } from '../shared/difficulty.js';
import { createTitleScene } from './titleScene.js';

const NAME_KEY = 'cookrun.name';
const DIFF_KEY = 'cookrun.difficulty';
const CODE_LEN = 4;
const IMG = (f) => new URL(`../../img/lobby/${f}`, import.meta.url).href;

// ── copy + numbers (the plan's difficulty table, ROUND3_CONTRACT.md §Data: difficulty) ─────────
const DIFF = {
  easy: {
    flames: 1, flame: '#F2B90F', line: '4 bags · busted in 6 s · score ×0.75', solo: '4 bags · gentler cops · faster healing',
    desc: 'Learn the road. The cops are patient.', stats: ['4', '6 s', '0.45 HP/s', 'Never', '×1.25', '×0.75'],
  },
  hard: {
    flames: 2, flame: '#E07A3C', line: '6 bags · busted in 4 s · score ×1', solo: '6 bags · the run as it is meant to be played',
    desc: 'The run as it is meant to be played.', stats: ['6', '4 s', '0.3 HP/s', 'At ★5', '×1', '×1'],
  },
  extreme: {
    flames: 3, flame: '#E5483A', line: '8 bags · busted in 2.5 s · score ×1.5', solo: '8 bags · cops shoot more · less ammo',
    desc: 'Two and a half seconds. Bring a friend you trust.', stats: ['8', '2.5 s', '0.15 HP/s', 'At ★4', '×0.75', '×1.5'],
  },
};

const ROLE_INFO = {
  driver: {
    who: 'Rook', chip: 'The driver', art: 'bust-rook.png',
    blurb: 'Drives the RV in first person, picks the line through traffic and climbs onto the roof with the guns at every stop.',
    keys: [[['W', 'A', 'S', 'D'], 'drive'], [['Q', 'E'], 'gadgets'], [['C'], 'look back'], [['F'], 'defend']],
  },
  cook: {
    who: 'Doc', chip: 'The cook', art: 'bust-doc.png',
    blurb: 'Runs the lab in the back in first person, cooks the batches and sprints the shopping list at every supply stop.',
    keys: [[['W', 'A', 'S', 'D'], 'walk'], [['E'], 'use'], [['Mouse'], 'look'], [['V'], 'vent fan']],
  },
};

// ── icons (standard line icons, 24 px grid) ─────────────────────────────────
function ico(paths, { stroke = 'currentColor', sw = 2, fill = 'none', size } = {}) {
  const s = size ? ` width="${size}" height="${size}"` : '';
  return `<svg viewBox="0 0 24 24"${s} fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
}
const I = {
  play: ico('<path d="M7.5 5v14l11.5-7z" fill="currentColor" stroke="none"/>'),
  people: ico('<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5c.6-3.3 3-5.2 6-5.2s5.4 1.9 6 5.2"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.4c2.4.2 4 1.9 4.5 4.6"/>'),
  link: ico('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  door: ico('<path d="M5 21V4.5h14V21M3 21h18"/><path d="M14.5 13v.5"/>'),
  back: ico('<path d="M20 12H5M11 6l-6 6 6 6"/>'),
  swap: ico('<path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/>'),
  check: (c = 'currentColor') => ico('<path d="M5 12.5l4.5 4.5L19 7.5"/>', { stroke: c, sw: 3 }),
  crown: ico('<path d="M4 17.5h16M4.5 17.5L3.5 7.5l4.5 4 4-6 4 6 4.5-4-1 10"/>', { stroke: '#BDB8B0' }),
  close: ico('<path d="M6 6l12 12M18 6L6 18"/>'),
  help: ico('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7M12 17.2v.1"/>'),
  flame: (c) => ico('<path d="M12 21c-3.9 0-6.5-2.6-6.5-6 0-4.2 4.5-6.3 4.5-11 2.8 1.6 4.5 4 4.5 6.5 1-.6 1.6-1.6 1.8-2.8 1.5 1.5 2.2 3.4 2.2 5.3 0 4.4-2.6 8-6.5 8z"/>', { stroke: c }),
  bag: ico('<path d="M5 8h14l-1.2 11.2a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>', { stroke: '#BDB8B0' }),
  cuffs: ico('<circle cx="7" cy="15" r="4.2"/><circle cx="17" cy="15" r="4.2"/><path d="M7 10.8V8.5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2.3"/>', { stroke: '#BDB8B0' }),
  plus: ico('<path d="M12 5v14M5 12h14"/>', { stroke: '#BDB8B0' }),
  truck: ico('<path d="M2.5 6.5h11v9h-11zM13.5 9.5h4l3 3.2v2.8h-7z"/><circle cx="6.5" cy="17" r="1.8"/><circle cx="16.5" cy="17" r="1.8"/>', { stroke: '#BDB8B0' }),
  clock: ico('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', { stroke: '#BDB8B0' }),
  star: ico('<path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/>', { stroke: '#BDB8B0' }),
  starFill: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 1.8l3.1 6.4 7 .9-5.1 4.9 1.3 6.9L12 17.6l-6.3 3.3 1.3-6.9-5.1-4.9 7-.9z" fill="currentColor"/></svg>',
};
const STAT_ROWS = [[I.bag, 'Bags to deliver'], [I.cuffs, 'Busted if undefended'], [I.plus, 'Regeneration'], [I.truck, 'Armoured truck'], [I.clock, 'Shop timers'], [I.star, 'Score']];

function flames(level) {
  const d = DIFF[level];
  let s = '';
  for (let i = 0; i < 3; i++) s += I.flame(i < d.flames ? d.flame : 'rgba(241,236,228,0.28)');
  return `<span class="crl-flames" aria-hidden="true">${s}</span>`;
}
const keycaps = (keys) => keys.map((k) => `<kbd class="crl-k${k.length > 1 ? ' crl-k--w' : ''}">${k}</kbd>`).join('');
const label = (level) => difficultyInfo(level).label;
const colorOf = (level) => difficultyInfo(level).color;

let current = null;

export function showLobby(rootEl, opts = {}) {
  if (!rootEl) throw new Error('showLobby(rootEl, opts): rootEl is required');
  if (current) current.destroy();
  current = new Lobby(rootEl, opts);
  return current;
}

export function hideLobby() {
  if (current) current.destroy();
}

export default showLobby;

// ─────────────────────────────────────────────────────────────────────────────

class Lobby {
  constructor(rootEl, opts) {
    this.root = rootEl;
    this.opts = opts;
    this.onStart = typeof opts.onStart === 'function' ? opts.onStart : () => {};
    this.net = null;
    this.ownsNet = false;     // true while the lobby is responsible for closing the socket
    this.room = null;         // last ROOM message
    this.screen = null;
    this.busy = false;
    this.soloDiff = loadDiff();
    this.diffCtx = 'solo';    // the difficulty screen's context: 'solo' (title) or 'room'
    this._unsubs = [];
    this._timers = new Set();
    this._destroyed = false;
    this.inviteCode = readInviteCode();

    ensureStylesheet();
    this._build();

    if (opts.net && opts.resumeRoom && opts.net.isOpen && opts.net.room) {
      this._adoptNet(opts.net, false);
      this.room = opts.net.room;
      this.showRoom();
      opts.net.send({ t: 'lobby' });
    } else {
      if (opts.net) {
        const lost = !opts.net.isOpen;
        try { opts.net.send({ t: 'leave' }); opts.net.close(); } catch { /* ignore */ }
        if (lost && opts.resumeRoom) this._later(() => this.toast('Connection lost. Create or join a room to play online again.', 'bad'), 50);
      }
      this.showTitle();
    }
    if (opts.toast) {
      const t = typeof opts.toast === 'string' ? { text: opts.toast } : opts.toast;
      if (t && t.text) this._later(() => this.toast(t.text, t.tone || 'info'), 60);
    }
  }

  get el() { return this.wrap; }

  // ── shell ──────────────────────────────────────────────────────────────────
  _build() {
    const wrap = h('div', { class: 'crl', style: 'visibility:hidden' });
    wrap.innerHTML = `
      <div class="crl-scene" aria-hidden="true"></div>
      <main class="crl-stage"></main>
      <div class="crl-toasts" role="status" aria-live="polite"></div>`;
    this.wrap = wrap;
    this.stage = wrap.querySelector('.crl-stage');
    this.toasts = wrap.querySelector('.crl-toasts');
    this.root.appendChild(wrap);
    try { this.scene = createTitleScene(wrap.querySelector('.crl-scene')); } catch (err) { console.warn('[lobby] title scene failed', err); this.scene = null; }
    // The stylesheet un-hides .crl; this is only a fallback if it fails to load.
    this._later(() => { wrap.style.visibility = ''; }, 1500);
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    for (const off of this._unsubs) { try { off(); } catch { /* ignore */ } }
    this._unsubs = [];
    for (const t of this._timers) clearTimeout(t);
    this._timers.clear();
    if (this.net && this.ownsNet) {
      try { this.net.send({ t: 'leave' }); this.net.close(); } catch { /* ignore */ }
    }
    if (this.modal && this.modal.open) { try { this.modal.close(); } catch { /* ignore */ } }
    try { this.scene?.destroy(); } catch { /* ignore */ }
    this.wrap.remove();
    if (current === this) current = null;
  }

  _later(fn, ms) {
    const t = setTimeout(() => { this._timers.delete(t); if (!this._destroyed) fn(); }, ms);
    this._timers.add(t);
    return t;
  }

  _setScreen(name, stageClass) {
    this.screen = name;
    this.wrap.dataset.screen = name;
    this.stage.className = `crl-stage ${stageClass}`;
    this.scene?.setMode(name === 'title' ? 'title' : name);
    this.wrap.scrollTop = 0;
  }

  // ── title screen ──────────────────────────────────────────────────────────
  showTitle() {
    this._setScreen('title', 'crl-stage--title');
    this.room = null;
    const name = loadName();
    const invited = this.inviteCode;
    const isStatic = typeof window !== 'undefined' && window.COOKRUN_STATIC;
    const settings = typeof this.opts.onSettings === 'function';
    this.stage.innerHTML = `
      <header class="crl-brand">
        <h1 class="crl-logo" aria-label="Cook and Run"><span class="crl-logo-l1" aria-hidden="true">Cook</span><span class="crl-logo-l2" aria-hidden="true"><span class="crl-amp">&amp;</span>Run</span></h1>
        <p class="crl-tagline">One drives. One cooks. Nobody gets busted.</p>
      </header>
      <section class="crl-menu" aria-label="Main menu">
        <div class="crl-f-name">
          <label class="crl-label" for="crl-name">Your name</label>
          <input class="crl-input" id="crl-name" type="text" maxlength="16" autocomplete="nickname" spellcheck="false" placeholder="Rook, Doc, anything" value="${esc(name)}">
        </div>
        <button class="crl-btn crl-btn--primary crl-btn--solo" type="button" data-act="solo">${I.play}Play Solo</button>
        <div class="crl-solo">
          <div class="crl-solo-head"><span class="crl-label" id="crl-solo-label">Solo</span><button class="crl-info" type="button" data-act="compare" data-keep aria-label="Compare the difficulties" title="What changes?">i</button></div>
          <div class="crl-seg" role="radiogroup" aria-labelledby="crl-solo-label" aria-describedby="crl-solo-sum">
            ${DIFFICULTIES.map((d) => `<button type="button" role="radio" data-diff="${d}" data-keep title="${esc(`${label(d)}: ${DIFF[d].solo}`)}">${label(d)}</button>`).join('')}
          </div>
        </div>
        <p class="crl-solo-sum" id="crl-solo-sum" aria-live="polite"></p>
        <p class="crl-hint">Drive with the keyboard · press Tab to go cook in the back.</p>
        <div class="crl-divider" aria-hidden="true"></div>
        <div class="crl-online">
          <p class="crl-label">Play with a friend</p>
          ${isStatic ? `<p class="crl-hint crl-static-note">Online rooms need the game server. This copy is solo only: run <b>npm start</b> or deploy to Render to play with a friend.</p>` : `
          <button class="crl-btn" type="button" data-act="create">${I.people}Create Online Room</button>
          <form class="crl-join${invited ? ' crl-join--invited' : ''}" novalidate>
            <label class="crl-sr" for="crl-code">Room code</label>
            <input class="crl-input crl-code" id="crl-code" type="text" inputmode="text" maxlength="${CODE_LEN}" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="CODE" value="${esc(invited || '')}" aria-describedby="crl-join-hint">
            <button class="crl-btn" type="submit" data-act="join">Join Room</button>
          </form>
          <p class="crl-hint" id="crl-join-hint">${invited ? `You were invited to room <b>${esc(invited)}</b>. Press Join Room.` : 'Got a code from a friend? Type it here.'}</p>`}
        </div>
        <div class="crl-links">
          <button class="crl-link" type="button" data-act="howto" data-keep>How to play</button>
          ${settings ? '<button class="crl-link crl-link--dim" type="button" data-act="settings" data-keep>Settings</button>' : ''}
        </div>
      </section>`;

    const q = (s) => this.stage.querySelector(s);
    const nameEl = q('#crl-name');
    const codeEl = q('#crl-code');
    nameEl.addEventListener('input', () => saveName(nameEl.value));
    nameEl.addEventListener('keydown', (e) => {
      // Enter in the name box joins when a code is filled in (the invite-link flow).
      if (e.key === 'Enter' && codeEl && codeEl.value.length === CODE_LEN) { e.preventDefault(); this._join(); }
    });
    const joinForm = q('.crl-join');
    const joinHint = q('#crl-join-hint');
    codeEl?.addEventListener('input', () => {
      const pos = codeEl.selectionStart;
      codeEl.value = codeEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);
      try { codeEl.setSelectionRange(pos, pos); } catch { /* ignore */ }
      if (invited && codeEl.value !== invited && joinForm.classList.contains('crl-join--invited')) {
        joinForm.classList.remove('crl-join--invited');
        joinHint.textContent = 'Got a code from a friend? Type it here.';
      }
    });
    joinForm?.addEventListener('submit', (e) => { e.preventDefault(); this._join(); });
    q('[data-act="solo"]').addEventListener('click', () => this._solo());
    q('[data-act="create"]')?.addEventListener('click', () => this._create());
    q('[data-act="howto"]').addEventListener('click', () => this.openHowTo());
    q('[data-act="compare"]').addEventListener('click', () => this.showDifficulty('solo'));
    q('[data-act="settings"]')?.addEventListener('click', () => { try { this.opts.onSettings(); } catch (err) { console.error(err); } });
    radioGroup(q('.crl-seg'), (d) => this._setSoloDiff(d));
    this._setSoloDiff(this.soloDiff, false);

    this._reveal();
    if (invited) q('[data-act="join"]')?.focus({ preventScroll: true });
  }

  _setSoloDiff(d, save = true) {
    this.soloDiff = normDifficulty(d);
    if (save) saveDiff(this.soloDiff);
    if (this.screen !== 'title') return;
    for (const b of this.stage.querySelectorAll('.crl-seg [data-diff]')) {
      const on = b.dataset.diff === this.soloDiff;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      b.style.setProperty('--dc', colorOf(b.dataset.diff));
    }
    const sum = this.stage.querySelector('#crl-solo-sum');
    if (sum) sum.innerHTML = `<b>${label(this.soloDiff)}</b> · ${DIFF[this.soloDiff].solo}`;
  }

  _name() {
    const el = this.stage.querySelector('#crl-name');
    const v = (el ? el.value : loadName()).replace(/\s+/g, ' ').trim().slice(0, 16);
    saveName(v);
    return v;
  }

  _solo() {
    if (this.busy) return;
    const name = this._name() || 'You';
    const payload = {
      mode: 'solo',
      role: 'driver',             // solo player does both jobs; integrator wires a LocalBus pair
      seed: randomSeed(),
      net: null,
      roomCode: null,
      you: 'solo',
      isHost: true,
      name,
      difficulty: this.soloDiff,
      players: [
        { id: 'solo', name, role: 'driver', ready: true },
        { id: 'solo', name, role: 'cook', ready: true },
      ],
    };
    this.destroy();
    this.onStart(payload);
  }

  _create() { this._goOnline({ t: 'create' }); }

  _join() {
    const codeEl = this.stage.querySelector('#crl-code');
    const code = (codeEl.value || '').toUpperCase().trim();
    if (code.length !== CODE_LEN) {
      this.toast(`Room codes have ${CODE_LEN} characters. Check the code your friend sent.`, 'bad');
      codeEl.focus();
      return;
    }
    this._goOnline({ t: 'join', code });
  }

  async _goOnline(msg) {
    if (this.busy) return;
    const name = this._name();
    this._setBusy(true, msg.t === 'join' ? 'join' : 'create');
    const slowHint = this._later(() => this.toast('Still connecting. A sleeping server can take up to a minute to wake up.', 'info'), 4000);
    try {
      if (!this.net || !this.net.isOpen) {
        this._dropNet();
        const net = new NetClient(this.opts.netOptions || {});
        this._adoptNet(net, true);
        await net.connect();
      }
      if (this._destroyed) return;
      this.net.send({ ...msg, name });
    } catch (err) {
      this._dropNet();
      this._setBusy(false);
      this.toast(`Couldn't reach the game server. ${navigator.onLine === false ? 'You look offline.' : 'Try again in a moment.'}`, 'bad');
    } finally {
      clearTimeout(slowHint);
      this._timers.delete(slowHint);
    }
  }

  _setBusy(on, which) {
    this.busy = on;
    if (this.screen !== 'title') return;
    for (const b of this.stage.querySelectorAll('.crl-menu button, .crl-menu input')) {
      if ('keep' in b.dataset || b.id === 'crl-name') continue;
      b.disabled = on;
    }
    const labels = { create: `${I.people}Create Online Room`, join: 'Join Room' };
    for (const [act, html] of Object.entries(labels)) {
      const b = this.stage.querySelector(`[data-act="${act}"]`);
      if (b) b.innerHTML = on && which === act ? 'Connecting…' : html;
    }
  }

  // ── net wiring ────────────────────────────────────────────────────────────
  _adoptNet(net, owns) {
    this.net = net;
    this.ownsNet = owns;
    const on = (type, cb) => this._unsubs.push(net.on(type, cb));
    on('room', (m) => this._onRoom(m));
    on('error', (m) => this._onError(m));
    on('start', (m) => this._onStartMsg(m));
    on('peerLeft', (m) => this.toast(`${m.name || 'Your partner'} left the room. Share the invite link to get a new partner.`, 'info'));
    on('latency', (ms) => this._updatePing(ms));
    on('close', (info) => this._onClose(info));
  }

  _dropNet() {
    for (const off of this._unsubs) { try { off(); } catch { /* ignore */ } }
    this._unsubs = [];
    if (this.net && this.ownsNet) { try { this.net.close(); } catch { /* ignore */ } }
    this.net = null;
    this.ownsNet = false;
  }

  _onRoom(m) {
    const prev = this.room;
    this.room = m;
    this.inviteCode = null; // used up: don't re-advertise the invite after leaving
    if (this.busy) this._setBusy(false);
    this.ownsNet = true; // we're in a room now; leaving the lobby without starting should leave it
    if (prev && prev.code === m.code && prev.difficulty && m.difficulty && prev.difficulty !== m.difficulty && m.hostId !== m.you) {
      this.toast(`The host picked ${label(normDifficulty(m.difficulty))}.`, 'info');
    }
    if (this.screen === 'difficulty' && this.diffCtx === 'room') this._renderDiffCards();
    else if (this.screen !== 'room') this.showRoom();
    else this._renderRoom();
  }

  _onError(m) {
    if (!m || m.code === 'socket') return; // connection problems are reported by connect()/close
    if (this.busy) this._setBusy(false);
    this.toast(m.msg || 'Something went wrong.', 'bad');
    if (m.re === 'join' && this.screen === 'title') {
      const codeEl = this.stage.querySelector('#crl-code');
      if (codeEl) { codeEl.focus(); codeEl.select(); }
    }
    if (m.re === 'settings') { if (this.screen === 'room') this._renderRoom(); else if (this.screen === 'difficulty') this._renderDiffCards(); }
    if ((m.code === 'expired' || m.code === 'noRoom') && this._inRoomScreens()) this._leaveToTitle(false);
  }

  _inRoomScreens() { return this.screen === 'room' || (this.screen === 'difficulty' && this.diffCtx === 'room'); }

  _onStartMsg(m) {
    const net = this.net;
    if (!net || !this.room) return;
    const you = net.id;
    const role = m.roles && m.roles[you];
    if (role !== 'driver' && role !== 'cook') { this.toast('Start failed: no role assigned.', 'bad'); return; }
    const players = (this.room.players || []).map((p) => ({ ...p, role: m.roles[p.id] || p.role }));
    const me = players.find((p) => p.id === you);
    const payload = {
      mode: 'online',
      role,
      seed: m.seed >>> 0,
      net,
      roomCode: this.room.code,
      you,
      isHost: this.room.hostId === you,
      name: me ? me.name : '',
      difficulty: normDifficulty(m.difficulty ?? this.room.difficulty),
      players,
    };
    this.ownsNet = false; // the game owns the connection now
    this.destroy();
    this.onStart(payload);
  }

  _onClose(info) {
    if (this._destroyed) return;
    const wasRoom = this._inRoomScreens();
    this.net = null;
    this.ownsNet = false;
    for (const off of this._unsubs) { try { off(); } catch { /* ignore */ } }
    this._unsubs = [];
    if (this.busy) this._setBusy(false);
    if (info && info.intentional) return;
    const why = info && info.code === 1012 ? 'The server restarted.' : 'Connection lost.';
    this.toast(`${why} Create or join a room to play online again.`, 'bad');
    if (wasRoom) this.showTitle();
  }

  // ── room screen ───────────────────────────────────────────────────────────
  _topBar(right) {
    return `<header class="crl-top">
        <div class="crl-minilogo" role="img" aria-label="Cook and Run"><span class="crl-ml-c">Cook</span><span class="crl-ml-a">&amp;</span><span class="crl-ml-r">Run</span></div>
        <div class="crl-top-right">${right}</div>
      </header>`;
  }

  showRoom() {
    this._setScreen('room', 'crl-stage--room');
    const seat = (r) => {
      const ri = ROLE_INFO[r];
      return `
        <section class="crl-glass crl-role crl-role--${r}" data-role="${r}">
          <div class="crl-seat-art">
            <img class="crl-seat-bust" src="${IMG(ri.art)}" alt="" draggable="false">
            <span class="crl-chip"><i></i>${ri.chip}</span>
            <h3 class="crl-seat-name">${ri.who}</h3>
          </div>
          <div class="crl-seat-body">
            <p class="crl-seat-blurb">${ri.blurb}</p>
            <div class="crl-keys2">${ri.keys.map(([k, what]) => `<div>${keycaps(k)}<span>${what}</span></div>`).join('')}</div>
            <div class="crl-seat-sep"></div>
            <div class="crl-seat-foot">
              <span class="crl-avatar" data-bind="avatar" aria-hidden="true"></span>
              <div class="crl-who"><div class="crl-who-name" data-bind="who"></div><div class="crl-who-sub crl-label" data-bind="sub"></div></div>
              <span class="crl-seat-act" data-bind="action"></span>
            </div>
          </div>
        </section>`;
    };
    this.stage.innerHTML = `
      ${this._topBar(`
        <button class="crl-btn crl-btn--glass crl-btn--sm crl-hide-xs" type="button" data-act="howto">How to play</button>
        <div class="crl-status" data-bind="status"><i class="crl-dot" aria-hidden="true"></i><span class="crl-label crl-st-long" data-bind="statusText">Room open</span><span class="crl-label crl-st-short" data-bind="statusShort" aria-hidden="true"></span><span class="crl-ping" data-bind="ping"></span></div>
        <button class="crl-btn crl-btn--glass crl-btn--sm" type="button" data-act="leave">${I.door}Leave</button>`)}
      <h2 class="crl-sr">Room</h2>
      <div class="crl-room">
        <section class="crl-glass crl-codepanel" aria-label="Room code">
          <div class="crl-row-sb"><span class="crl-label">Room code</span><span class="crl-meta">Desert route · 40 km</span></div>
          <div class="crl-roomcode" data-bind="code"></div>
          <div class="crl-invite">
            <button class="crl-btn" type="button" data-act="copy">${I.link}Copy invite link</button>
            <span class="crl-hint">Your partner types the code on the title screen.</span>
          </div>
          <input class="crl-input crl-invite-url" type="text" readonly aria-label="Invite link" data-bind="url">
        </section>
        <section class="crl-glass crl-diffpanel" aria-labelledby="crl-diff-h">
          <div class="crl-row-sb"><span class="crl-label" id="crl-diff-h">Difficulty</span><span class="crl-diffpanel-right"><span class="crl-label" data-bind="diffWho">Host picks</span><button class="crl-minilink" type="button" data-act="compare" aria-label="Compare the difficulties">Compare</button></span></div>
          <p class="crl-sr" id="crl-diff-note" data-bind="diffNote"></p>
          <div class="crl-difflist" role="radiogroup" aria-labelledby="crl-diff-h" aria-describedby="crl-diff-note" data-bind="diff">
            ${DIFFICULTIES.map((d) => `
            <button class="crl-diffrow" type="button" role="radio" data-diff="${d}" aria-checked="false">
              ${flames(d)}
              <span class="crl-diffrow-text"><span class="crl-diffrow-name">${label(d)}</span><span class="crl-diffrow-sum">${DIFF[d].line}</span></span>
              <span class="crl-check" aria-hidden="true">${I.check('#17130A')}</span>
            </button>`).join('')}
          </div>
        </section>
        <div class="crl-startwrap">
          <button class="crl-btn crl-btn--primary crl-btn--start" type="button" data-act="start">${I.play}<span data-bind="startLabel">Start the run</span></button>
          <p class="crl-reason" aria-live="polite"><span data-bind="reason"></span></p>
          <button class="crl-link crl-show-xs" type="button" data-act="howto">How to play</button>
        </div>
        <div class="crl-seats">
          ${seat('driver')}
          <button class="crl-swap" type="button" data-act="swap" aria-label="Swap seats">${I.swap}<span>Swap</span></button>
          ${seat('cook')}
        </div>
      </div>`;

    const q = (s) => this.stage.querySelector(s);
    q('[data-act="copy"]').addEventListener('click', () => this._copyInvite());
    q('[data-act="start"]').addEventListener('click', () => {
      if (this.net && !this._startBlocker()) this.net.send({ t: 'start' });
    });
    q('[data-act="leave"]').addEventListener('click', () => this._leaveToTitle(true));
    for (const b of this.stage.querySelectorAll('[data-act="howto"]')) b.addEventListener('click', () => this.openHowTo());
    q('[data-act="compare"]').addEventListener('click', () => this.showDifficulty('room'));
    q('[data-act="swap"]').addEventListener('click', () => { if (this.net && this._other()) this.net.send({ t: 'role', role: 'swap' }); });
    radioGroup(q('[data-bind="diff"]'), (d) => this._pickRoomDiff(d), () => this._isHost() && this.room?.state === 'lobby');
    for (const card of this.stage.querySelectorAll('.crl-role')) {
      card.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (btn) {
          if (btn.dataset.act === 'ready') { const me = this._me(); if (me && this.net) this.net.send({ t: 'ready', ready: !me.ready }); }
          else if (btn.dataset.act === 'take') this._clickRole(card.dataset.role);
          return;
        }
        this._clickRole(card.dataset.role);
      });
    }
    q('.crl-invite-url').addEventListener('focus', (e) => e.target.select());

    this._renderRoom();
    this._updatePing(this.net ? this.net.latencyMs : null);
    this._reveal();
    const ready = q('[data-act="ready"]');
    if (ready) ready.focus({ preventScroll: true });
  }

  _me() {
    if (!this.room) return null;
    return this.room.players.find((p) => p.id === this.room.you) || null;
  }

  _other() {
    if (!this.room) return null;
    return this.room.players.find((p) => p.id !== this.room.you) || null;
  }

  _isHost() { return !!this.room && this.room.hostId === this.room.you; }

  _startBlocker() {
    const r = this.room;
    if (!r) return 'Not in a room.';
    const ps = r.players || [];
    const host = ps.find((p) => p.id === r.hostId);
    if (ps.length < 2) return 'Waiting for your partner · send them the invite link';
    if (!ps[0].role || !ps[1].role) return 'Both players need a seat.';
    if (ps[0].role === ps[1].role) return 'Pick different seats: one Rook, one Doc.';
    const notReady = ps.filter((p) => !p.ready);
    if (notReady.length === 2) return 'Waiting for both players to be ready';
    if (notReady.length === 1) return notReady[0].id === r.you ? 'Press “I’m ready” when you are' : `Waiting for ${notReady[0].name} to be ready`;
    if (r.hostId !== r.you) return `Both seats ready · waiting for ${host ? host.name : 'the host'} to start`;
    return null;
  }

  _renderRoom() {
    if (this.screen !== 'room' || !this.room) return;
    const r = this.room;
    const me = this._me();
    const isHost = r.hostId === r.you;
    const lobby = r.state === 'lobby';
    const q = (s) => this.stage.querySelector(s);

    const codeEl = q('[data-bind="code"]');
    if (codeEl.textContent !== r.code) codeEl.textContent = r.code;
    codeEl.setAttribute('aria-label', `Room code ${String(r.code).split('').join(' ')}`);
    q('[data-bind="url"]').value = this._inviteUrl(r.code);

    // status pill
    const n = (r.players || []).length;
    const status = q('[data-bind="status"]');
    status.dataset.q = !lobby ? 'play' : n >= 2 ? 'full' : 'wait';
    setText(q('[data-bind="statusText"]'), !lobby ? 'Run in progress' : n >= 2 ? `Room open · ${n} / 2` : `Waiting · ${n} / 2`);
    setText(q('[data-bind="statusShort"]'), !lobby ? 'Playing' : `${n} / 2`);

    // seats
    for (const card of this.stage.querySelectorAll('.crl-role')) {
      const role = card.dataset.role;
      const ri = ROLE_INFO[role];
      const holder = r.players.find((p) => p.role === role);
      const mine = !!holder && holder.id === r.you;
      card.classList.toggle('is-mine', mine);
      card.classList.toggle('is-taken', !!holder && !mine);
      card.classList.toggle('is-open', !holder);
      card.classList.toggle('is-ready', !!holder && holder.ready);
      card.classList.toggle('is-locked', !lobby);
      const nameShown = mine ? 'You' : holder ? holder.name : 'Open seat';
      setText(card.querySelector('[data-bind="who"]'), nameShown);
      setText(card.querySelector('[data-bind="avatar"]'), holder ? (nameShown.trim()[0] || '?').toUpperCase() : '?');
      const sub = card.querySelector('[data-bind="sub"]');
      const subHtml = !holder ? (me ? 'Free · click to sit here' : 'Waiting for a player')
        : holder.id === r.hostId ? `${I.crown}Host` : 'Joined';
      if (sub.innerHTML !== subHtml) sub.innerHTML = subHtml;
      const act = card.querySelector('[data-bind="action"]');
      const kind = mine ? `mine:${holder.ready}:${lobby}` : holder ? `other:${holder.ready}` : `open:${lobby}`;
      if (act.dataset.kind !== kind) {
        act.dataset.kind = kind;
        const hadFocus = act.contains(document.activeElement);
        if (mine) act.innerHTML = `<button class="crl-ready${holder.ready ? ' is-on' : ''}" type="button" data-act="ready" aria-pressed="${holder.ready}"${lobby ? '' : ' disabled'}>${holder.ready ? `${I.check('currentColor')}Ready` : 'I’m ready'}</button>`;
        else if (holder) act.innerHTML = `<span class="crl-ready${holder.ready ? ' is-on' : ''}">${holder.ready ? `${I.check('currentColor')}Ready` : 'Not ready'}</span>`;
        else act.innerHTML = `<button class="crl-ready crl-take" type="button" data-act="take"${lobby ? '' : ' disabled'}>Take seat</button>`;
        if (hadFocus) act.querySelector('button')?.focus({ preventScroll: true });
      }
      const lbl = mine ? `${ri.who}, ${ri.chip.toLowerCase()}: you${holder.id === r.hostId ? ', host' : ''}. ${holder.ready ? 'Ready.' : 'Not ready.'}`
        : holder ? `${ri.who}, ${ri.chip.toLowerCase()}: ${holder.name}, ${holder.ready ? 'ready' : 'not ready'}. Click to swap seats.`
          : `${ri.who}, ${ri.chip.toLowerCase()}: open seat. Click to sit here.`;
      card.setAttribute('aria-label', lbl);
    }
    q('[data-act="swap"]').disabled = !this._other() || !lobby;

    // difficulty (host picks; both see it; locked once the run starts)
    const diff = normDifficulty(r.difficulty);
    const canPick = isHost && lobby;
    for (const b of this.stage.querySelectorAll('[data-bind="diff"] [data-diff]')) {
      const on = b.dataset.diff === diff;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.setAttribute('aria-disabled', canPick ? 'false' : 'true');
      b.tabIndex = on ? 0 : -1;
    }
    setText(q('[data-bind="diffWho"]'), !lobby ? 'Locked' : 'Host picks');
    setText(q('[data-bind="diffNote"]'), !lobby ? 'Locked for this run.' : isHost ? 'You pick for the room.' : 'Only the host can change it.');

    // start
    const startBtn = q('[data-act="start"]');
    const blocker = this._startBlocker();
    startBtn.disabled = !!blocker || !isHost || !lobby;
    setText(q('[data-bind="startLabel"]'), isHost ? 'Start the run' : 'Host starts the run');
    startBtn.title = isHost ? '' : 'Only the host can start the game';
    const reason = q('[data-bind="reason"]');
    setText(reason, !lobby ? 'Heading back to the room…' : blocker || 'Both seats ready · swap seats until the engine starts');
    reason.parentElement.classList.toggle('is-go', !blocker && lobby);
  }

  _pickRoomDiff(d) {
    if (!this.net || !this.room || !this._isHost() || this.room.state !== 'lobby') return;
    d = normDifficulty(d);
    if (d === normDifficulty(this.room.difficulty)) return;
    this.net.send({ t: 'settings', difficulty: d });
  }

  _clickRole(role) {
    if (!this.net || !this.room || this.room.state !== 'lobby') return;
    const holder = this.room.players.find((p) => p.role === role);
    if (holder && holder.id === this.room.you) return;
    this.net.send({ t: 'role', role: holder ? 'swap' : role });
  }

  _updatePing(ms) {
    if (this.screen !== 'room') return;
    const el = this.stage.querySelector('[data-bind="ping"]');
    if (!el) return;
    el.textContent = ms == null ? '' : `· ${ms} ms`;
  }

  _inviteUrl(code) {
    let base = this.opts.inviteBase;
    if (!base) base = `${location.origin}/`;
    const u = new URL(base, location.href);
    u.searchParams.set('room', code);
    return u.toString();
  }

  async _copyInvite() {
    const url = this._inviteUrl(this.room.code);
    const ok = await copyText(url);
    if (ok) this.toast('Invite link copied. Paste it to your partner.', 'good');
    else {
      const input = this.stage.querySelector('.crl-invite-url');
      if (input) {
        input.classList.add('is-shown');
        input.focus(); input.select();
        this.toast('Copy blocked by the browser. The link is selected: press Ctrl+C or long-press to copy it.', 'info');
      } else {
        this.toast(`Copy blocked by the browser. Send your partner this link: ${url}`, 'info');
      }
    }
  }

  _leaveToTitle(sendLeave) {
    if (this.net) {
      const net = this.net;
      this._dropNet();
      if (sendLeave) { try { net.send({ t: 'leave' }); } catch { /* ignore */ } }
      try { net.close(); } catch { /* ignore */ }
    }
    this.showTitle();
  }

  // ── difficulty screen ("Pick your heat.") ─────────────────────────────────
  showDifficulty(ctx = 'solo') {
    this.diffCtx = ctx === 'room' && this.room ? 'room' : 'solo';
    this._diffBack = this.diffCtx === 'room' ? 'room' : 'title';
    this._setScreen('difficulty', 'crl-stage--diff');
    const room = this.diffCtx === 'room';
    this.stage.innerHTML = `
      ${this._topBar(`<button class="crl-btn crl-btn--glass crl-btn--sm" type="button" data-act="back">${I.back}${room ? 'Back to lobby' : 'Back'}</button>`)}
      <div class="crl-diffhead">
        <h1>Pick your heat.</h1>
        <p data-bind="diffSub"></p>
      </div>
      <div class="crl-diffcards">
        ${DIFFICULTIES.map((d) => `
        <section class="crl-glass crl-dcard" data-diff="${d}" aria-labelledby="crl-dc-${d}">
          <div class="crl-dcard-head"><div><h2 id="crl-dc-${d}">${label(d)}</h2>${flames(d)}</div><span class="crl-difftag" data-bind="tag" hidden></span></div>
          <div class="crl-dstats">${STAT_ROWS.map(([icon, what], i) => `<div>${icon}<span>${what}</span><b>${DIFF[d].stats[i].replace('★', I.starFill)}</b></div>`).join('')}</div>
          <p class="crl-dcard-desc">${DIFF[d].desc}</p>
          <button class="crl-btn" type="button" data-pick="${d}"></button>
        </section>`).join('')}
      </div>`;
    this.stage.querySelector('[data-act="back"]').addEventListener('click', () => this._diffGoBack());
    for (const b of this.stage.querySelectorAll('[data-pick]')) {
      b.addEventListener('click', () => {
        const d = b.dataset.pick;
        if (this.diffCtx === 'room') this._pickRoomDiff(d);
        else { this._setSoloDiff(d); this._renderDiffCards(); }
      });
    }
    this._renderDiffCards();
    this._reveal();
    this.stage.querySelector('[data-act="back"]').focus({ preventScroll: true });
  }

  _diffGoBack() {
    if (this._diffBack === 'room' && this.room && this.net) this.showRoom();
    else this.showTitle();
  }

  _renderDiffCards() {
    if (this.screen !== 'difficulty') return;
    const room = this.diffCtx === 'room';
    const picked = room ? normDifficulty(this.room?.difficulty) : this.soloDiff;
    const canPick = !room || (this._isHost() && this.room?.state === 'lobby');
    setText(this.stage.querySelector('[data-bind="diffSub"]'), room
      ? (canPick ? 'You pick for the room. Harder runs pay a bigger score multiplier.' : 'The host picks for the room. Harder runs pay a bigger score multiplier.')
      : 'Your solo runs use this pick. Harder runs pay a bigger score multiplier.');
    for (const card of this.stage.querySelectorAll('.crl-dcard')) {
      const d = card.dataset.diff;
      const on = d === picked;
      card.classList.toggle('is-picked', on);
      const tag = card.querySelector('[data-bind="tag"]');
      tag.hidden = !on;
      tag.textContent = room ? 'Host’s pick' : 'Your pick';
      const b = card.querySelector('[data-pick]');
      b.classList.toggle('crl-btn--primary', on);
      b.innerHTML = on ? `${I.check('currentColor')}Picked` : canPick ? `Pick ${label(d)}` : 'Host picks';
      b.disabled = !canPick && !on;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  // ── how-to modal ──────────────────────────────────────────────────────────
  openHowTo() {
    if (!this.modal) {
      const k = (...keys) => keycaps(keys);
      const d = h('dialog', { class: 'crl-modal', 'aria-labelledby': 'crl-howto-title' });
      d.innerHTML = `
        <div class="crl-modal-inner">
          <header class="crl-modal-head">
            <h2 id="crl-howto-title">How to play</h2>
            <button class="crl-x" type="button" data-act="close" aria-label="Close how to play">${I.close}</button>
          </header>
          <p class="crl-goal">Load up in Rook's Garage, then haul the mobile lab <b>40 km</b> from the city to the buyer's drive-in past the canyon. Arrive with the RV in one piece, both of you on your feet and enough bags to sell. Stop at the 8 roadside stores for supplies, shake the cops and hit the broken bridge fast enough to jump it.</p>
          <div class="crl-howto-cols">
            <section class="crl-howto-col crl-howto-col--driver">
              <h3>Rook <small>the driver</small></h3>
              <dl class="crl-keys">
                <dt>${k('W', 'A', 'S', 'D')}</dt><dd>Drive (arrows work too)</dd>
                <dt>${k('Space')}</dt><dd>Handbrake</dd>
                <dt>${k('H')}</dt><dd>Horn</dd>
                <dt>${k('Q')} ${k('E')} ${k('Shift')}</dt><dd>Smoke · oil slick · nitro</dd>
                <dt>${k('C')}</dt><dd>Look around outside</dd>
                <dt>${k('F')}</dt><dd><b>Defend</b>: climb onto the roof (RV stopped)</dd>
                <dt>${k('R')}</dt><dd>Reset if stuck</dd>
              </dl>
              <h4>On the roof</h4>
              <dl class="crl-keys">
                <dt>${k('Mouse')}</dt><dd>Aim · click to fire</dd>
                <dt>${k('Right-click')}</dt><dd>Scope (hunting rifle)</dd>
                <dt>${k('R')}</dt><dd>Reload</dd>
                <dt>${k('1')}–${k('6')}</dt><dd>Revolver, shotgun, rifle · firecracker, paint, flare</dd>
                <dt>${k('F')}</dt><dd>Climb back down</dd>
              </dl>
            </section>
            <section class="crl-howto-col crl-howto-col--cook">
              <h3>Doc <small>the cook</small></h3>
              <dl class="crl-keys">
                <dt>${k('Mouse')}</dt><dd>Look around (click to grab the mouse, Esc lets go)</dd>
                <dt>${k('W', 'A', 'S', 'D')}</dt><dd>Walk the lab</dd>
                <dt>${k('E')}</dt><dd>Use the station you look at</dd>
                <dt>${k('O')}</dt><dd>Overview of the whole lab</dd>
                <dt>${k('V')}</dt><dd>Vent fan (clears the fumes)</dd>
              </dl>
              <h4>At a stop</h4>
              <dl class="crl-keys">
                <dt>${k('E')}</dt><dd>At the side door: jump out for the <b>shop run</b></dd>
                <dt>${k('Mouse')} ${k('W', 'A', 'S', 'D')}</dt><dd>Shop in first person, beat the clock, run back</dd>
              </dl>
            </section>
          </div>
          <ul class="crl-rules">
            <li><b>Every stop is a race.</b> Doc jumps out of the side door and does the shop run in first person while the clock runs.</li>
            <li><b>Cops come to every stop.</b> Someone always calls it in. Rook presses <b>F</b> to climb on the roof and keep them off the RV.</li>
            <li><b>Guns hit cars, never people.</b> Burst tyres, steaming radiators, cracked glass. Every shot adds heat.</li>
            <li><b>Busted</b> means a running cop car stays close to a stopped RV. A disabled car can't bust you.</li>
            <li><b>All three bars heal slowly</b> (RV hull, Rook, Doc) once that bar has gone a while without damage.</li>
            <li><b>Difficulty</b> (Easy · Hard · Extreme) sets the bags you need, how fast you're busted, how hard cops shoot back and the score multiplier. The host picks it in the room.</li>
          </ul>
          <p class="crl-solo-note"><b>Playing solo?</b> You drive. At a stop you do Doc's shop run while an AI Rook defends from the roof. Press <kbd class="crl-k">Tab</kbd> to go cook in the back while the AI keeps the RV rolling; it won't pull into stores and hands the wheel back for the canyon jump.</p>
          <div class="crl-modal-foot"><button class="crl-btn crl-btn--primary" type="button" data-act="close">Got it</button></div>
        </div>`;
      for (const b of d.querySelectorAll('[data-act="close"]')) b.addEventListener('click', () => d.close());
      d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
      d.addEventListener('close', () => { if (this._modalReturn && this._modalReturn.isConnected) this._modalReturn.focus(); });
      this.wrap.appendChild(d);
      this.modal = d;
    }
    this._modalReturn = document.activeElement;
    if (typeof this.modal.showModal === 'function') this.modal.showModal();
    else this.modal.setAttribute('open', '');
    const close = this.modal.querySelector('.crl-x');
    if (close) close.focus({ preventScroll: true });
    this.modal.scrollTop = 0;
  }

  // ── toast ─────────────────────────────────────────────────────────────────
  toast(text, tone = 'info') {
    if (this._destroyed) return;
    const t = h('div', { class: `crl-toast crl-toast--${tone}` });
    t.textContent = text;
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
    this._later(() => t.classList.add('is-out'), tone === 'bad' ? 5200 : 3400);
    this._later(() => t.remove(), tone === 'bad' ? 5500 : 3700);
  }

  _reveal() {
    this.stage.classList.remove('crl-in');
    void this.stage.offsetWidth; // restart the entrance animation
    this.stage.classList.add('crl-in');
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────
function h(tag, attrs = {}) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }

// A row of role="radio" buttons with roving focus (arrow keys move the pick). canPick() gates changes.
function radioGroup(group, onPick, canPick = () => true) {
  if (!group) return;
  const items = () => [...group.querySelectorAll('[role="radio"]')];
  group.addEventListener('click', (e) => {
    const b = e.target.closest('[role="radio"]');
    if (b && canPick()) onPick(b.dataset.diff);
  });
  group.addEventListener('keydown', (e) => {
    const keys = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    if (!canPick()) return;
    const list = items();
    const i = list.indexOf(document.activeElement);
    const next = list[(Math.max(0, i) + keys[e.key] + list.length) % list.length];
    onPick(next.dataset.diff);
    next.focus();
  });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function loadName() {
  try { return (localStorage.getItem(NAME_KEY) || '').slice(0, 16); } catch { return ''; }
}

function saveName(v) {
  try { localStorage.setItem(NAME_KEY, String(v).slice(0, 16)); } catch { /* private mode etc. */ }
}

function loadDiff() {
  try { return normDifficulty(localStorage.getItem(DIFF_KEY)); } catch { return normDifficulty(null); }
}

function saveDiff(v) {
  try { localStorage.setItem(DIFF_KEY, v); } catch { /* private mode etc. */ }
}

function readInviteCode() {
  try {
    const c = new URLSearchParams(location.search).get('room');
    if (!c) return null;
    const s = c.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);
    return s.length === CODE_LEN ? s : null;
  } catch { return null; }
}

function randomSeed() {
  try { return crypto.getRandomValues(new Uint32Array(1))[0] >>> 0; }
  catch { return (Math.random() * 0x100000000) >>> 0; }
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

function ensureStylesheet() {
  if (typeof document === 'undefined') return;
  const href = new URL('../../css/lobby.css', import.meta.url).href;
  for (const l of document.querySelectorAll('link[rel="stylesheet"]')) {
    if (l.href === href || /\/css\/lobby\.css(\?|$)/.test(l.href)) return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}
