// Room manager + relay for Cook & Run.
//
// The server is NOT authoritative: the driver's browser runs the GameSim.
// This module only pairs two players in a room, validates lobby messages
// and relays game traffic ({t:'g', m}) verbatim to the other player.
//
// Transport-agnostic: index.js hands us a tiny transport per socket
// ({ send(str), close(code, reason), bufferedAmount }) so this file can be
// unit-tested and ported (e.g. to a Unity relay / Netcode transport) easily.
//
// Wire contract: public/js/shared/protocol.js. Extensions are documented in
// docs/NOTES-net.md ({t:'lobby'}, role:'swap', ROOM.state, ERROR.code/re).

import { randomInt, randomBytes } from 'node:crypto';

// No 0/O/1/I (ambiguous) and no vowels at all, so codes never spell words.
export const CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXYZ23456789';
export const CODE_LENGTH = 4;
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export const ROLES = ['driver', 'cook'];

export const DEFAULT_LIMITS = Object.freeze({
  maxPlayers: 2,
  nameMax: 16,
  messageMax: 64 * 1024,        // bytes per message (game payload limit)
  rate: 120,                    // token refill per second
  burst: 200,                   // bucket capacity
  idleMs: 30 * 60 * 1000,       // rooms idle longer than this are swept
  maxRooms: 2000,
  snapBacklogBytes: 256 * 1024, // drop relayed snapshots to a receiver this far behind
});

// Control chars, zero-width/bidi marks, BOM and angle brackets (written as escapes on purpose).
// eslint-disable-next-line no-control-regex
const STRIP_RE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff<>]/g;

export function sanitizeName(raw, max = DEFAULT_LIMITS.nameMax) {
  if (typeof raw !== 'string') return '';
  let s = raw.normalize('NFKC').replace(/\s+/g, ' ').replace(STRIP_RE, '').replace(/ {2,}/g, ' ').trim();
  s = Array.from(s).slice(0, max).join('').trim();
  return s;
}

// Shape check only (4 letters/digits). Whether the code exists is the room lookup's job,
// so a typo like "ABCD" gets "No room with code ABCD" rather than a format lecture.
export function normalizeCode(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toUpperCase();
  return /^[A-Z0-9]{4}$/.test(s) ? s : null;
}

export function isValidCode(code) { return typeof code === 'string' && CODE_RE.test(code); }

function roleLabel(r) { return r === 'driver' ? 'Driver' : r === 'cook' ? 'Cook' : 'nobody'; }

export class RoomManager {
  constructor({ log = (...a) => console.log(...a), limits = {}, now = () => Date.now() } = {}) {
    this.log = log;
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.now = now;
    this.rooms = new Map();   // code -> Room
    this.clients = new Set();
    this._seq = 0;
  }

  // ── connection lifecycle ──────────────────────────────────────────────────
  connect(transport) {
    const id = `p${(++this._seq).toString(36)}${randomBytes(2).toString('hex')}`;
    const client = {
      id,
      transport,
      name: '',
      room: null,
      tokens: this.limits.burst,
      lastRefill: this.now(),
      droppedSince: 0,
      lastDropLog: 0,
    };
    this.clients.add(client);
    return client;
  }

  disconnect(client) {
    if (!this.clients.has(client)) return;
    this._leaveRoom(client, 'disconnected');
    this.clients.delete(client);
  }

  // ── inbound ───────────────────────────────────────────────────────────────
  receive(client, data, isBinary = false) {
    if (!this.clients.has(client)) return;
    if (!this._takeToken(client)) return; // over the rate limit: drop silently

    const size = typeof data === 'string' ? Buffer.byteLength(data) : data.length;
    if (size > this.limits.messageMax) {
      this._error(client, `Message too large (max ${Math.round(this.limits.messageMax / 1024)} KB).`, 'tooLarge');
      return;
    }
    if (isBinary) { this._error(client, 'Binary messages are not supported.', 'badRequest'); return; }

    let msg;
    try { msg = JSON.parse(typeof data === 'string' ? data : data.toString('utf8')); }
    catch { this._error(client, 'Malformed message.', 'badRequest'); return; }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.t !== 'string' || msg.t.length > 16) {
      this._error(client, 'Malformed message.', 'badRequest');
      return;
    }

    // Pings don't count as activity, so a tab left open in a lobby still expires.
    if (client.room && msg.t !== 'ping') client.room.lastActive = this.now();

    switch (msg.t) {
      case 'g': return this._onGame(client, msg);
      case 'ping': return this._onPing(client, msg);
      case 'create': return this._onCreate(client, msg);
      case 'join': return this._onJoin(client, msg);
      case 'role': return this._onRole(client, msg);
      case 'ready': return this._onReady(client, msg);
      case 'start': return this._onStart(client, msg);
      case 'lobby': return this._onLobby(client, msg);
      case 'leave': return this._onLeave(client, msg);
      default: return this._error(client, `Unknown message type "${String(msg.t).slice(0, 16)}".`, 'badRequest', msg.t);
    }
  }

  // ── handlers ──────────────────────────────────────────────────────────────
  _onPing(client, msg) {
    const at = typeof msg.at === 'number' && Number.isFinite(msg.at) ? msg.at : null;
    this._send(client, { t: 'pong', at, now: this.now() });
  }

  _onCreate(client, msg) {
    if (client.room) this._leaveRoom(client, 'left');
    if (this.rooms.size >= this.limits.maxRooms) {
      return this._error(client, 'The server is full right now. Try again in a minute.', 'serverFull', 'create');
    }
    const code = this._newCode();
    if (!code) return this._error(client, 'Could not allocate a room code. Try again.', 'serverFull', 'create');
    const t = this.now();
    const room = { code, hostId: client.id, players: new Map(), state: 'lobby', createdAt: t, lastActive: t, seed: null, games: 0 };
    this.rooms.set(code, room);
    client.name = sanitizeName(msg.name, this.limits.nameMax) || 'Player 1';
    this._addPlayer(room, client, 'driver');
    this.log(`[room] ${code} created by ${client.id} "${client.name}" (rooms=${this.rooms.size})`);
    this._broadcastRoom(room);
  }

  _onJoin(client, msg) {
    const code = normalizeCode(msg.code);
    if (!code) {
      return this._error(client, `Room codes are ${CODE_LENGTH} letters/numbers, like "K7QX".`, 'badCode', 'join');
    }
    const room = this.rooms.get(code);
    if (!room) return this._error(client, `No room with code ${code}. Check the code and try again.`, 'notFound', 'join');
    if (client.room === room) return this._sendRoom(room, client); // already here: just resend state
    if (room.players.size >= this.limits.maxPlayers) return this._error(client, `Room ${code} is full.`, 'full', 'join');
    if (room.state !== 'lobby') return this._error(client, `Room ${code} is already in a game.`, 'started', 'join');

    if (client.room) this._leaveRoom(client, 'left');
    client.name = sanitizeName(msg.name, this.limits.nameMax) || `Player ${room.players.size + 1}`;
    const taken = new Set([...room.players.values()].map((p) => p.role));
    const role = ROLES.find((r) => !taken.has(r)) || 'cook';
    this._addPlayer(room, client, role);
    room.lastActive = this.now();
    this.log(`[room] ${code} joined by ${client.id} "${client.name}" as ${role}`);
    this._broadcastRoom(room);
  }

  _onRole(client, msg) {
    const room = client.room;
    if (!room) return this._error(client, 'You are not in a room.', 'noRoom', 'role');
    if (room.state !== 'lobby') return this._error(client, 'Roles are locked while a game is running.', 'started', 'role');
    const me = room.players.get(client.id);
    const other = this._other(room, client);

    if (msg.role === 'swap') {
      if (!other) return this._error(client, 'There is nobody to swap roles with yet.', 'noPeer', 'role');
      const r = me.role; me.role = other.role; other.role = r;
      me.ready = false; other.ready = false;
      this._broadcastRoom(room);
      return;
    }
    if (!ROLES.includes(msg.role)) return this._error(client, 'Unknown role.', 'badRequest', 'role');
    if (me.role === msg.role) return this._sendRoom(room, client);
    if (other && other.role === msg.role) {
      return this._error(client, `${other.name} is already the ${roleLabel(msg.role)}. Ask to swap instead.`, 'roleTaken', 'role');
    }
    me.role = msg.role;
    me.ready = false;
    this._broadcastRoom(room);
  }

  _onReady(client, msg) {
    const room = client.room;
    if (!room) return this._error(client, 'You are not in a room.', 'noRoom', 'ready');
    if (room.state !== 'lobby') return this._error(client, 'The game is already running.', 'started', 'ready');
    if (typeof msg.ready !== 'boolean') return this._error(client, 'ready must be true or false.', 'badRequest', 'ready');
    const me = room.players.get(client.id);
    if (me.ready === msg.ready) return this._sendRoom(room, client);
    me.ready = msg.ready;
    this._broadcastRoom(room);
  }

  _onStart(client) {
    const room = client.room;
    if (!room) return this._error(client, 'You are not in a room.', 'noRoom', 'start');
    if (room.hostId !== client.id) return this._error(client, 'Only the room host can start the game.', 'notHost', 'start');
    if (room.state !== 'lobby') return this._error(client, 'The game is already running.', 'started', 'start');
    const reason = startBlocker(room);
    if (reason) return this._error(client, reason, 'notReady', 'start');

    room.state = 'playing';
    room.seed = randomBytes(4).readUInt32BE(0);
    room.games += 1;
    room.lastActive = this.now();
    const roles = {};
    for (const p of room.players.values()) roles[p.id] = p.role;
    this.log(`[room] ${room.code} start #${room.games} seed=${room.seed}`);
    for (const p of room.players.values()) this._send(p.client, { t: 'start', seed: room.seed, roles });
    this._broadcastRoom(room); // state:'playing' (keeps NetClient.room current)
  }

  _onLobby(client) {
    const room = client.room;
    if (!room) return this._error(client, 'You are not in a room.', 'noRoom', 'lobby');
    // Idempotent: both players may send it when they get back to the room screen.
    // Only the playing→lobby transition clears ready flags (so a late {t:'lobby'}
    // from the second player doesn't un-ready the first).
    if (room.state === 'lobby') return this._sendRoom(room, client);
    this.log(`[room] ${room.code} back to lobby (by ${client.id})`);
    room.state = 'lobby';
    for (const p of room.players.values()) p.ready = false;
    this._broadcastRoom(room);
  }

  _onLeave(client) {
    if (client.room) this._leaveRoom(client, 'left');
  }

  _onGame(client, msg) {
    const room = client.room;
    if (!room || room.state !== 'playing' || msg.m === undefined) return; // stale/invalid game traffic: drop
    const other = this._other(room, client);
    if (!other) return;
    // Lossy-tolerant snapshots are dropped for a receiver that is badly behind,
    // so its latency can recover instead of growing without bound.
    if (msg.m && msg.m.k === 'snap' && (other.client.transport.bufferedAmount || 0) > this.limits.snapBacklogBytes) return;
    this._send(other.client, { t: 'g', m: msg.m, from: client.id });
  }

  // ── room helpers ──────────────────────────────────────────────────────────
  _addPlayer(room, client, role) {
    room.players.set(client.id, { id: client.id, client, role, ready: false });
    client.room = room;
  }

  _other(room, client) {
    for (const p of room.players.values()) if (p.id !== client.id) return p;
    return null;
  }

  _leaveRoom(client, why) {
    const room = client.room;
    if (!room) return;
    room.players.delete(client.id);
    client.room = null;
    if (room.players.size === 0) {
      this.rooms.delete(room.code);
      this.log(`[room] ${room.code} closed (empty, rooms=${this.rooms.size})`);
      return;
    }
    if (room.hostId === client.id) room.hostId = room.players.keys().next().value;
    if (room.state === 'playing') room.state = 'lobby';
    for (const p of room.players.values()) p.ready = false;
    room.lastActive = this.now();
    this.log(`[room] ${room.code} ${client.id} ${why}`);
    for (const p of room.players.values()) this._send(p.client, { t: 'peerLeft', id: client.id, name: client.name });
    this._broadcastRoom(room);
  }

  _roomPayload(room, you) {
    return {
      t: 'room',
      code: room.code,
      you,
      hostId: room.hostId,
      state: room.state,
      players: [...room.players.values()].map((p) => ({ id: p.id, name: p.client.name, role: p.role, ready: p.ready })),
    };
  }

  _sendRoom(room, client) { this._send(client, this._roomPayload(room, client.id)); }
  _broadcastRoom(room) { for (const p of room.players.values()) this._sendRoom(room, p.client); }

  _newCode() {
    for (let i = 0; i < 64; i++) {
      let c = '';
      for (let j = 0; j < CODE_LENGTH; j++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(c)) return c;
    }
    return null;
  }

  // ── rate limit (token bucket) ─────────────────────────────────────────────
  _takeToken(client) {
    const t = this.now();
    const dt = (t - client.lastRefill) / 1000;
    client.lastRefill = t;
    client.tokens = Math.min(this.limits.burst, client.tokens + dt * this.limits.rate);
    if (client.tokens >= 1) { client.tokens -= 1; return true; }
    client.droppedSince += 1;
    if (t - client.lastDropLog > 10_000) {
      this.log(`[rate] ${client.id} over limit, dropping (dropped=${client.droppedSince})`);
      client.lastDropLog = t;
      client.droppedSince = 0;
    }
    return false;
  }

  // ── outbound ──────────────────────────────────────────────────────────────
  _send(client, obj) {
    try { client.transport.send(JSON.stringify(obj)); }
    catch (err) { this.log(`[ws] send to ${client.id} failed: ${err.message}`); }
  }

  _error(client, msg, code = 'error', re = undefined) {
    const out = { t: 'error', msg, code };
    if (re) out.re = re;
    this._send(client, out);
  }

  // ── maintenance ───────────────────────────────────────────────────────────
  sweep() {
    const t = this.now();
    let n = 0;
    for (const room of [...this.rooms.values()]) {
      if (t - room.lastActive <= this.limits.idleMs) continue;
      for (const p of room.players.values()) {
        p.client.room = null;
        this._error(p.client, 'Room closed after 30 minutes without activity.', 'expired');
      }
      this.rooms.delete(room.code);
      n++;
    }
    if (n) this.log(`[room] swept ${n} idle room(s) (rooms=${this.rooms.size})`);
    return n;
  }

  stats() {
    let playing = 0;
    for (const r of this.rooms.values()) if (r.state === 'playing') playing++;
    return { rooms: this.rooms.size, playing, players: this.clients.size };
  }
}

// Why the host can't start yet (null when it can). Exported for tests/clients.
export function startBlocker(room) {
  const ps = [...room.players.values()];
  if (ps.length < 2) return 'Waiting for a second player to join.';
  if (!ps.every((p) => ROLES.includes(p.role))) return 'Both players need a role.';
  if (ps[0].role === ps[1].role) return 'Pick different roles: one Driver, one Cook.';
  const notReady = ps.filter((p) => !p.ready);
  if (notReady.length) return `Waiting for ${notReady.map((p) => p.client.name).join(' and ')} to be ready.`;
  return null;
}
