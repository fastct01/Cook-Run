// WebSocket client for the Cook & Run room server (server/index.js + rooms.js).
//
//   const net = new NetClient();          // ws(s)://<host>/ws, or ?server=host:port override
//   await net.connect();                  // resolves when the socket is open
//   net.on('room', (msg) => ...);         // any S2C type: room, error, start, peerLeft, pong, g
//   net.send({ t: 'create', name });      // queued until open
//   net.sendGame({ k: 'snap', s });       // → { t:'g', m } relayed to the other player
//   const off = net.onGame((m, from) => ...);
//   net.close();
//
// Events besides S2C types: 'open', 'close' ({code, reason, wasClean, intentional}),
// 'error' (server ERROR messages AND socket errors share the shape {t:'error', msg, code}),
// 'latency' (ms). Wire contract: public/js/shared/protocol.js + docs/NOTES-net.md.

const PING_EVERY_MS = 3000;
const CONNECT_TIMEOUT_MS = 15000;

export function defaultServerUrl() {
  if (typeof location === 'undefined') return 'ws://localhost:3000/ws';
  let override = null;
  try { override = new URLSearchParams(location.search).get('server'); } catch { /* ignore */ }
  if (override) return normalizeServerUrl(override);
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

// Accepts "ws://h:p/ws", "https://h", "h:p" → full ws(s) URL ending in /ws (unless a path is given).
export function normalizeServerUrl(s) {
  s = String(s).trim();
  if (/^wss?:\/\//i.test(s)) return s;
  if (/^https?:\/\//i.test(s)) {
    const u = new URL(s);
    const proto = u.protocol === 'https:' ? 'wss' : 'ws';
    const path = u.pathname && u.pathname !== '/' ? u.pathname : '/ws';
    return `${proto}://${u.host}${path}`;
  }
  const secure = typeof location !== 'undefined' && location.protocol === 'https:';
  return `${secure ? 'wss' : 'ws'}://${s.replace(/\/+$/, '')}${s.includes('/') ? '' : '/ws'}`;
}

export class NetClient {
  constructor({ url, pingEveryMs = PING_EVERY_MS, WebSocketImpl } = {}) {
    this.url = url || defaultServerUrl();
    this.latencyMs = null;      // smoothed round trip, null until the first PONG
    this.id = null;             // my player id (from ROOM.you)
    this.room = null;           // last ROOM message (code, you, hostId, state, players)
    this.ws = null;
    this._WS = WebSocketImpl || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    this._pingEveryMs = pingEveryMs;
    this._handlers = new Map(); // type -> Set<cb>
    this._gameHandlers = new Set();
    this._queue = [];
    this._connecting = null;
    this._pingTimer = null;
    this._intentionalClose = false;
    this._closed = false;
  }

  get isOpen() { return !!this.ws && this.ws.readyState === 1; }
  get roomCode() { return this.room ? this.room.code : null; }

  connect() {
    if (this.isOpen) return Promise.resolve(this);
    if (this._connecting) return this._connecting;
    if (!this._WS) return Promise.reject(new Error('WebSocket is not available in this environment.'));
    this._intentionalClose = false;
    this._closed = false;

    this._connecting = new Promise((resolve, reject) => {
      let settled = false;
      let ws;
      try { ws = new this._WS(this.url); }
      catch (err) { this._connecting = null; reject(err); return; }
      this.ws = ws;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this._connecting = null;
        try { ws.close(); } catch { /* ignore */ }
        reject(new Error('Timed out connecting to the server.'));
      }, CONNECT_TIMEOUT_MS);

      ws.onopen = () => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        this._connecting = null;
        const q = this._queue; this._queue = [];
        for (const str of q) ws.send(str);
        this._startPing();
        this._emit('open', {});
        resolve(this);
      };
      ws.onmessage = (ev) => this._onMessage(ev.data);
      ws.onerror = () => {
        const err = { t: 'error', msg: 'Could not reach the game server.', code: 'socket' };
        if (!settled) {
          clearTimeout(timer);
          settled = true;
          this._connecting = null;
          reject(new Error(err.msg));
        }
        this._emit('error', err);
      };
      ws.onclose = (ev) => {
        clearTimeout(timer);
        this._stopPing();
        const info = { code: ev.code, reason: ev.reason || '', wasClean: !!ev.wasClean, intentional: this._intentionalClose };
        if (!settled) {
          settled = true;
          this._connecting = null;
          reject(new Error(`Connection closed (${ev.code}).`));
        }
        if (this.ws === ws) this.ws = null;
        this._closed = true;
        this._emit('close', info);
      };
    });
    return this._connecting;
  }

  // Send a lobby/control message (queued until the socket is open). Returns false if dropped.
  send(obj) {
    let str;
    try { str = JSON.stringify(obj); } catch { return false; }
    if (this.isOpen) { this.ws.send(str); return true; }
    if (this._connecting || (!this.ws && !this._closed)) { this._queue.push(str); return true; }
    return false;
  }

  sendGame(m) { return this.send({ t: 'g', m }); }

  // cb(gameMsg, fromPlayerId). Returns an unsubscribe function.
  onGame(cb) { this._gameHandlers.add(cb); return () => this._gameHandlers.delete(cb); }
  offGame(cb) { this._gameHandlers.delete(cb); }

  // Subscribe to an S2C type ('room','start','error','peerLeft','pong','g') or
  // an event ('open','close','error','latency'). Returns an unsubscribe function.
  on(type, cb) {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type).add(cb);
    return () => this.off(type, cb);
  }

  off(type, cb) {
    const set = this._handlers.get(type);
    if (!set) return;
    if (cb) set.delete(cb); else set.clear();
  }

  close() {
    this._intentionalClose = true;
    this._stopPing();
    this._queue = [];
    if (this.ws) {
      try { this.ws.close(1000, 'bye'); } catch { /* ignore */ }
    } else {
      this._closed = true;
    }
  }

  // ── internals ─────────────────────────────────────────────────────────────
  _onMessage(data) {
    let msg;
    try { msg = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data)); }
    catch { return; }
    if (!msg || typeof msg.t !== 'string') return;

    if (msg.t === 'g') {
      for (const cb of [...this._gameHandlers]) {
        try { cb(msg.m, msg.from); } catch (err) { console.error('[net] game handler failed', err); }
      }
    } else if (msg.t === 'room') {
      this.room = msg;
      this.id = msg.you;
    } else if (msg.t === 'pong') {
      if (typeof msg.at === 'number') {
        const sample = Math.max(0, nowMs() - msg.at);
        this.latencyMs = this.latencyMs == null ? Math.round(sample) : Math.round(this.latencyMs * 0.6 + sample * 0.4);
        this._emit('latency', this.latencyMs);
      }
    }
    this._emit(msg.t, msg);
  }

  _emit(type, payload) {
    const set = this._handlers.get(type);
    if (!set || set.size === 0) return;
    for (const cb of [...set]) {
      try { cb(payload); } catch (err) { console.error(`[net] '${type}' handler failed`, err); }
    }
  }

  _startPing() {
    this._stopPing();
    const ping = () => { if (this.isOpen) this.ws.send(JSON.stringify({ t: 'ping', at: nowMs() })); };
    ping();
    this._pingTimer = setInterval(ping, this._pingEveryMs);
  }

  _stopPing() {
    if (this._pingTimer) clearInterval(this._pingTimer);
    this._pingTimer = null;
  }
}

function nowMs() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

export default NetClient;
