// Front-end menu for Cook & Run: title screen, online room, how-to modal.
//
//   import { showLobby, hideLobby } from './ui/lobby.js';
//   const lobby = showLobby(rootEl, { onStart });
//   // onStart({ mode:'solo'|'online', role:'driver'|'cook', seed, net, roomCode, players, you, isHost, name })
//   //   net = NetClient (online, still connected and in the room) or null (solo)
//
//   After a game:
//   showLobby(rootEl, { onStart, net, resumeRoom: true })  // back to the same room (sends {t:'lobby'})
//   showLobby(rootEl, { onStart, net })                    // quit to title (leaves the room, closes net)
//   showLobby(rootEl, { onStart })                         // plain title screen
//
// Options: { onStart, net, resumeRoom, inviteBase, netOptions, toast }.
// The stylesheet ../../css/lobby.css is injected automatically if the page didn't link it.

import { NetClient } from '../net/NetClient.js';

const NAME_KEY = 'cookrun.name';
const CODE_LEN = 4;

const ROLE_INFO = {
  driver: {
    title: 'Driver',
    blurb: 'Get the RV across the desert alive. Stop for supplies, lose the cops, jump the canyon.',
    icon: `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="24" cy="24" r="4.5" fill="currentColor"/><path d="M7 21.5h12.5M28.5 21.5H41M24 28.5V41" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>`,
  },
  cook: {
    title: 'Cook',
    blurb: 'Walk the lab in the back of the van. Cook at the stations, craft gadgets, keep the fumes and fires under control.',
    icon: `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M18 5h12M20 5v13L8.5 38.5A3 3 0 0 0 11 43h26a3 3 0 0 0 2.5-4.5L28 18V5" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round"/><path d="M13.5 31h21l4 7.5H9.5z" fill="currentColor"/><circle cx="21" cy="25" r="2" fill="currentColor"/><circle cx="27" cy="21" r="1.6" fill="currentColor"/></svg>`,
  },
};

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
  }

  get el() { return this.wrap; }

  // ── shell ──────────────────────────────────────────────────────────────────
  _build() {
    const wrap = h('div', { class: 'crl', style: 'visibility:hidden' });
    wrap.innerHTML = `
      <div class="crl-scene" aria-hidden="true">
        <div class="crl-sun"></div>
        <div class="crl-mesa crl-mesa--far"></div>
        <div class="crl-mesa crl-mesa--near"></div>
        <div class="crl-ground"></div>
        <div class="crl-roadview"><div class="crl-road"><div class="crl-road-dashes"></div></div></div>
        <div class="crl-haze"></div>
      </div>
      <main class="crl-stage"></main>
      <div class="crl-toasts" role="status" aria-live="polite"></div>`;
    this.wrap = wrap;
    this.stage = wrap.querySelector('.crl-stage');
    this.toasts = wrap.querySelector('.crl-toasts');
    this.root.appendChild(wrap);
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
    this.wrap.remove();
    if (current === this) current = null;
  }

  _later(fn, ms) {
    const t = setTimeout(() => { this._timers.delete(t); if (!this._destroyed) fn(); }, ms);
    this._timers.add(t);
    return t;
  }

  // ── title screen ──────────────────────────────────────────────────────────
  showTitle() {
    this.screen = 'title';
    this.wrap.dataset.screen = 'title';
    this.room = null;
    const name = loadName();
    const invited = this.inviteCode;
    this.stage.className = 'crl-stage crl-stage--title';
    this.stage.innerHTML = `
      <header class="crl-brand">
        <h1 class="crl-logo" aria-label="Cook and Run">
          <span class="crl-logo-line" aria-hidden="true">Cook</span>
          <span class="crl-logo-line crl-logo-line--2" aria-hidden="true"><span class="crl-amp">&amp;</span>Run</span>
        </h1>
        <p class="crl-tagline">One drives. One cooks. Nobody gets busted.</p>
      </header>
      <section class="crl-panel crl-menu" aria-label="Main menu">
        <label class="crl-field">
          <span class="crl-field-label">Your name</span>
          <input class="crl-input" id="crl-name" type="text" maxlength="16" autocomplete="nickname" spellcheck="false" placeholder="Rook, Doc, anything" value="${esc(name)}">
        </label>
        <div class="crl-solo">
          <button class="crl-btn crl-btn--primary" type="button" data-act="solo">Play Solo</button>
          <p class="crl-hint">Drive with the keyboard · press Tab to go cook in the back.</p>
        </div>
        ${typeof window !== 'undefined' && window.COOKRUN_STATIC ? `<div class="crl-online">
          <p class="crl-online-label">Play with a friend</p>
          <p class="crl-hint">Online rooms need the game server. This copy is solo only: run <b>npm start</b> or deploy to Render to play with a friend.</p>
        </div>` : `        <div class="crl-online">
          <p class="crl-online-label">Play with a friend</p>
          <button class="crl-btn crl-btn--teal" type="button" data-act="create">Create Online Room</button>
          <form class="crl-join${invited ? ' crl-join--invited' : ''}" novalidate>
            <label class="crl-sr" for="crl-code">Room code</label>
            <input class="crl-input crl-code" id="crl-code" type="text" inputmode="text" maxlength="${CODE_LEN}" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="CODE" value="${esc(invited || '')}" aria-describedby="crl-join-hint">
            <button class="crl-btn crl-btn--cream" type="submit" data-act="join">Join Room</button>
          </form>
          <p class="crl-hint" id="crl-join-hint">${invited ? `You were invited to room <b>${esc(invited)}</b>. Press Join Room.` : 'Got a code from a friend? Type it here.'}</p>
        </div>
`}
        <button class="crl-link" type="button" data-act="howto">How to play</button>
      </section>`;

    const nameEl = this.stage.querySelector('#crl-name');
    const codeEl = this.stage.querySelector('#crl-code');
    nameEl.addEventListener('input', () => saveName(nameEl.value));
    nameEl.addEventListener('keydown', (e) => {
      // Enter in the name box joins when a code is filled in (the invite-link flow).
      if (e.key === 'Enter' && codeEl && codeEl.value.length === CODE_LEN) { e.preventDefault(); this._join(); }
    });
    const joinForm = this.stage.querySelector('.crl-join');
    const joinHint = this.stage.querySelector('#crl-join-hint');
    codeEl?.addEventListener('input', () => {
      const pos = codeEl.selectionStart;
      codeEl.value = codeEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);
      try { codeEl.setSelectionRange(pos, pos); } catch { /* ignore */ }
      if (invited && codeEl.value !== invited && joinForm.classList.contains('crl-join--invited')) {
        joinForm.classList.remove('crl-join--invited');
        joinHint.textContent = 'Got a code from a friend? Type it here.';
      }
    });
    this.stage.querySelector('.crl-join')?.addEventListener('submit', (e) => { e.preventDefault(); this._join(); });
    this.stage.querySelector('[data-act="solo"]').addEventListener('click', () => this._solo());
    this.stage.querySelector('[data-act="create"]')?.addEventListener('click', () => this._create());
    this.stage.querySelector('[data-act="howto"]').addEventListener('click', () => this.openHowTo());

    this._reveal();
    if (invited) this.stage.querySelector('[data-act="join"]')?.focus({ preventScroll: true });
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
      if (b.dataset.act === 'howto' || b.id === 'crl-name') continue;
      b.disabled = on;
    }
    const labels = { create: 'Create Online Room', join: 'Join Room' };
    for (const [act, label] of Object.entries(labels)) {
      const b = this.stage.querySelector(`[data-act="${act}"]`);
      if (b) b.textContent = on && which === act ? 'Connecting…' : label;
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
    this.room = m;
    this.inviteCode = null; // used up: don't re-advertise the invite after leaving
    if (this.busy) this._setBusy(false);
    this.ownsNet = true; // we're in a room now; leaving the lobby without starting should leave it
    if (this.screen !== 'room') this.showRoom();
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
    if ((m.code === 'expired' || m.code === 'noRoom') && this.screen === 'room') this._leaveToTitle(false);
  }

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
      players,
    };
    this.ownsNet = false; // the game owns the connection now
    this.destroy();
    this.onStart(payload);
  }

  _onClose(info) {
    if (this._destroyed) return;
    const wasRoom = this.screen === 'room';
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
  showRoom() {
    this.screen = 'room';
    this.wrap.dataset.screen = 'room';
    this.stage.className = 'crl-stage crl-stage--room';
    this.stage.innerHTML = `
      <section class="crl-room" aria-labelledby="crl-room-title">
        <h2 class="crl-sr" id="crl-room-title">Room</h2>
        <div class="crl-room-top">
          <div class="crl-plate" role="group" aria-label="Room code">
            <span class="crl-plate-top">Room code</span>
            <span class="crl-plate-code" data-bind="code"></span>
            <span class="crl-plate-bottom">Cook &amp; Run desert</span>
          </div>
          <div class="crl-invite">
            <p class="crl-invite-text">Your partner opens this link to join you.</p>
            <div class="crl-invite-row">
              <input class="crl-input crl-invite-url" type="text" readonly aria-label="Invite link" data-bind="url">
              <button class="crl-btn crl-btn--cream crl-btn--sm" type="button" data-act="copy">Copy invite link</button>
            </div>
          </div>
        </div>
        <div class="crl-roles" role="group" aria-label="Roles">
          ${['driver', 'cook'].map((r) => `
          <button class="crl-role crl-role--${r}" type="button" data-role="${r}">
            <span class="crl-role-head"><span class="crl-role-icon">${ROLE_INFO[r].icon}</span><span class="crl-role-title">${ROLE_INFO[r].title}</span></span>
            <span class="crl-role-blurb">${ROLE_INFO[r].blurb}</span>
            <span class="crl-role-seat"><span class="crl-role-whobox"><span class="crl-role-who" data-bind="who"></span><span class="crl-tag" data-bind="you" hidden>you</span><span class="crl-tag crl-tag--host" data-bind="host" hidden>host</span></span><span class="crl-role-state" data-bind="state"></span></span>
            <span class="crl-role-action" data-bind="action"></span>
          </button>`).join('')}
        </div>
        <div class="crl-room-actions">
          <button class="crl-btn crl-btn--ready" type="button" data-act="ready" aria-pressed="false">
            <span class="crl-check" aria-hidden="true"></span><span data-bind="readyLabel">I'm ready</span>
          </button>
          <button class="crl-btn crl-btn--primary crl-btn--start" type="button" data-act="start">Start</button>
        </div>
        <p class="crl-reason" data-bind="reason" aria-live="polite"></p>
        <footer class="crl-room-foot">
          <span class="crl-ping" data-bind="ping"><span class="crl-ping-dot"></span><span data-bind="pingText">Ping …</span></span>
          <button class="crl-link" type="button" data-act="howto">How to play</button>
          <button class="crl-link crl-link--leave" type="button" data-act="leave">Leave room</button>
        </footer>
      </section>`;

    const q = (s) => this.stage.querySelector(s);
    q('[data-act="copy"]').addEventListener('click', () => this._copyInvite());
    q('[data-act="ready"]').addEventListener('click', () => {
      const me = this._me();
      if (me && this.net) this.net.send({ t: 'ready', ready: !me.ready });
    });
    q('[data-act="start"]').addEventListener('click', () => {
      if (this.net && !this._startBlocker()) this.net.send({ t: 'start' });
    });
    q('[data-act="leave"]').addEventListener('click', () => this._leaveToTitle(true));
    q('[data-act="howto"]').addEventListener('click', () => this.openHowTo());
    for (const card of this.stage.querySelectorAll('.crl-role')) {
      card.addEventListener('click', () => this._clickRole(card.dataset.role));
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

  _startBlocker() {
    const r = this.room;
    if (!r) return 'Not in a room.';
    const ps = r.players || [];
    const host = ps.find((p) => p.id === r.hostId);
    if (ps.length < 2) return 'Waiting for your partner to join. Send them the invite link.';
    if (!ps[0].role || !ps[1].role) return 'Both players need a role.';
    if (ps[0].role === ps[1].role) return 'Pick different roles: one Driver, one Cook.';
    const notReady = ps.filter((p) => !p.ready);
    if (notReady.length === 2) return 'Waiting for both players to be ready.';
    if (notReady.length === 1) return notReady[0].id === r.you ? 'Press “I\'m ready” when you are.' : `Waiting for ${notReady[0].name} to be ready.`;
    if (r.hostId !== r.you) return `Everyone's ready. Waiting for ${host ? host.name : 'the host'} to start.`;
    return null;
  }

  _renderRoom() {
    if (this.screen !== 'room' || !this.room) return;
    const r = this.room;
    const me = this._me();
    const isHost = r.hostId === r.you;
    const q = (s) => this.stage.querySelector(s);

    const codeEl = q('[data-bind="code"]');
    if (codeEl.textContent !== r.code) codeEl.textContent = r.code;
    q('.crl-plate').setAttribute('aria-label', `Room code ${r.code.split('').join(' ')}`);
    q('[data-bind="url"]').value = this._inviteUrl(r.code);

    for (const card of this.stage.querySelectorAll('.crl-role')) {
      const role = card.dataset.role;
      const holder = r.players.find((p) => p.role === role);
      const mine = holder && holder.id === r.you;
      const who = card.querySelector('[data-bind="who"]');
      const state = card.querySelector('[data-bind="state"]');
      const action = card.querySelector('[data-bind="action"]');
      card.classList.toggle('is-mine', !!mine);
      card.classList.toggle('is-taken', !!holder && !mine);
      card.classList.toggle('is-open', !holder);
      card.classList.toggle('is-ready', !!holder && holder.ready);
      card.setAttribute('aria-pressed', mine ? 'true' : 'false');
      card.querySelector('[data-bind="you"]').hidden = !mine;
      card.querySelector('[data-bind="host"]').hidden = !(holder && holder.id === r.hostId);
      if (holder) {
        who.textContent = holder.name;
        state.textContent = holder.ready ? 'Ready' : 'Not ready';
      } else {
        who.textContent = 'Open seat';
        state.textContent = '';
      }
      if (mine) action.textContent = role === 'driver' ? "You're behind the wheel" : "You're running the lab";
      else if (!holder) action.textContent = `Take ${ROLE_INFO[role].title}`;
      else action.textContent = `Swap with ${holder.name}`;
      const label = mine ? `${ROLE_INFO[role].title}: you. ${holder.ready ? 'Ready.' : 'Not ready.'}`
        : holder ? `${ROLE_INFO[role].title}: ${holder.name}, ${holder.ready ? 'ready' : 'not ready'}. Activate to swap roles.`
          : `${ROLE_INFO[role].title}: open seat. Activate to take this role.`;
      card.setAttribute('aria-label', label);
      card.disabled = r.state !== 'lobby';
    }

    const readyBtn = q('[data-act="ready"]');
    const ready = !!(me && me.ready);
    readyBtn.setAttribute('aria-pressed', ready ? 'true' : 'false');
    readyBtn.classList.toggle('is-on', ready);
    q('[data-bind="readyLabel"]').textContent = ready ? 'Ready' : "I'm ready";
    readyBtn.disabled = r.state !== 'lobby';

    const startBtn = q('[data-act="start"]');
    const blocker = this._startBlocker();
    startBtn.disabled = !!blocker || !isHost || r.state !== 'lobby';
    startBtn.textContent = isHost ? 'Start' : 'Host starts';
    startBtn.title = isHost ? '' : 'Only the host can start the game';
    q('[data-bind="reason"]').textContent = r.state !== 'lobby' ? 'Heading back to the room…' : blocker || 'Both ready. Hit Start!';
    q('[data-bind="reason"]').classList.toggle('is-go', !blocker && r.state === 'lobby');
  }

  _clickRole(role) {
    if (!this.net || !this.room) return;
    const holder = this.room.players.find((p) => p.role === role);
    if (holder && holder.id === this.room.you) return;
    this.net.send({ t: 'role', role: holder ? 'swap' : role });
  }

  _updatePing(ms) {
    if (this.screen !== 'room') return;
    const el = this.stage.querySelector('[data-bind="ping"]');
    const txt = this.stage.querySelector('[data-bind="pingText"]');
    if (!el || !txt) return;
    if (ms == null) { txt.textContent = 'Ping …'; el.dataset.q = ''; return; }
    txt.textContent = `Ping ${ms} ms`;
    el.dataset.q = ms < 90 ? 'good' : ms < 200 ? 'ok' : 'bad';
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
      if (input.offsetParent !== null && getComputedStyle(input).opacity !== '0') {
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

  // ── how-to modal ──────────────────────────────────────────────────────────
  openHowTo() {
    if (!this.modal) {
      const d = h('dialog', { class: 'crl-modal', 'aria-labelledby': 'crl-howto-title' });
      d.innerHTML = `
        <div class="crl-modal-inner">
          <header class="crl-modal-head">
            <h2 id="crl-howto-title">How to play</h2>
            <button class="crl-x" type="button" data-act="close" aria-label="Close how to play">×</button>
          </header>
          <p class="crl-goal">Load up in Rook's Garage, then haul the mobile lab 40 km from the city to the buyer's drive-in past the canyon (about 40 minutes). Arrive with the RV in one piece, both of you alive and enough product to sell. Stop at the 8 roadside stores for supplies, lose the cops, and hit the broken bridge fast enough to jump it.</p>
          <div class="crl-howto-cols">
            <section class="crl-howto-col crl-howto-col--driver">
              <h3>${ROLE_INFO.driver.icon}Driver <small>keyboard</small></h3>
              <dl class="crl-keys">
                <dt><kbd>W</kbd><kbd>S</kbd> or <kbd>↑</kbd><kbd>↓</kbd></dt><dd>Throttle and brake</dd>
                <dt><kbd>A</kbd><kbd>D</kbd> or <kbd>←</kbd><kbd>→</kbd></dt><dd>Steer</dd>
                <dt><kbd class="crl-kbd-wide">Space</kbd></dt><dd>Handbrake</dd>
                <dt><kbd class="crl-kbd-wide">Shift</kbd></dt><dd>Nitro</dd>
                <dt><kbd>Q</kbd></dt><dd>Smoke bomb</dd>
                <dt><kbd>E</kbd></dt><dd>Oil slick</dd>
                <dt><kbd>H</kbd></dt><dd>Horn</dd>
                <dt><kbd>C</kbd></dt><dd>Look around outside (3 s, every 30 s)</dd>
                <dt><kbd>R</kbd></dt><dd>Reset if stuck</dd>
                <dt><kbd>M</kbd></dt><dd>Mute</dd>
              </dl>
              <ul class="crl-cook-list">
                <li>You drive from the cab. Watch for the <b>STOP AT</b> banner and the arrow, then pull into the lot and stop.</li>
                <li>At each store Rook runs in for a quick challenge: the better you do, the more supplies you load. <kbd>Esc</kbd> gives up.</li>
                <li>On foot (garage, shops): <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk · <kbd>Shift</kbd> run · <kbd>E</kbd> use · <kbd class="crl-kbd-wide">Space</kbd> jump.</li>
              </ul>
            </section>
            <section class="crl-howto-col crl-howto-col--cook">
              <h3>${ROLE_INFO.cook.icon}Cook <small>in the van</small></h3>
              <dl class="crl-keys">
                <dt><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></dt><dd>Walk Doc around the lab</dd>
                <dt><kbd>E</kbd></dt><dd>Use a station</dd>
                <dt><kbd class="crl-kbd-wide">Space</kbd></dt><dd>Jump</dd>
                <dt><kbd>Q</kbd> / <kbd>Esc</kbd></dt><dd>Step away</dd>
                <dt>Click · drag</dt><dd>Walk there · cook on the props</dd>
                <dt><kbd>R</kbd></dt><dd>At a stop: climb onto the roof</dd>
              </dl>
              <ul class="crl-cook-list">
                <li>Start a batch at the Recipe Board. The driver's supply stops decide what you can make.</li>
                <li>Walk to each station in turn: grind, pour, heat, stir, ice bath, bag it. The burner keeps going while you're away.</li>
                <li>Hard turns and bumps knock Doc about, so tell the driver when you're pouring.</li>
                <li>Vent fan for fumes, curtain cord when cops pull alongside, extinguisher for fires.</li>
                <li>Craft smoke bombs, oil slicks and nitro for the driver.</li>
                <li>While Rook shops, keep cops off the RV from the roof: hold click to hose them, <kbd>1</kbd>–<kbd>3</kbd> and right-click to throw firecrackers, paint balloons and smoke flares.</li>
              </ul>
            </section>
          </div>
          <p class="crl-solo-note">Playing solo? You do both jobs (an AI Doc guards the roof while you shop). Press <kbd>Tab</kbd> to swap seats: while you cook in the back, the AI keeps the RV rolling. It won't pull into supply stores, and it hands the wheel back for the canyon jump and the drop-off.</p>
          <div class="crl-modal-foot"><button class="crl-btn crl-btn--primary crl-btn--sm" type="button" data-act="close">Got it</button></div>
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
    this._later(() => t.remove(), tone === 'bad' ? 5600 : 3800);
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

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function loadName() {
  try { return (localStorage.getItem(NAME_KEY) || '').slice(0, 16); } catch { return ''; }
}

function saveName(v) {
  try { localStorage.setItem(NAME_KEY, String(v).slice(0, 16)); } catch { /* private mode etc. */ }
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
