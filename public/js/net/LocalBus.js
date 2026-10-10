// In-process stand-in for NetClient, used by solo mode (driver + cook in one tab).
//
//   const [driverEnd, cookEnd] = LocalBus.pair();
//   driverEnd.sendGame({ k: 'snap', s });      // cookEnd's onGame callbacks get a structuredClone, async
//   cookEnd.onGame((m, from) => ...);
//
// Delivery is asynchronous (queueMicrotask) and every message is structuredClone'd,
// so solo mode exercises the same "no shared references, arrives later" behaviour as
// the network path. Lobby calls (send/connect) are harmless no-ops.

let pairSeq = 0;

class LocalEndpoint {
  constructor(id) {
    this.id = id;
    this.peer = null;
    this.latencyMs = 0;
    this.room = null;
    this.url = 'local';
    this._handlers = new Map();
    this._gameHandlers = new Set();
    this._closed = false;
  }

  get isOpen() { return !this._closed; }
  get roomCode() { return null; }

  connect() { return Promise.resolve(this); }
  send() { return !this._closed; } // lobby messages have no meaning locally

  sendGame(m) {
    const peer = this.peer;
    if (this._closed || !peer || peer._closed) return false;
    let copy;
    try { copy = structuredClone(m); }
    catch (err) { console.error('[LocalBus] message is not cloneable', err); return false; }
    const from = this.id;
    queueMicrotask(() => {
      if (peer._closed) return;
      for (const cb of [...peer._gameHandlers]) {
        try { cb(copy, from); } catch (err) { console.error('[LocalBus] game handler failed', err); }
      }
    });
    return true;
  }

  onGame(cb) { this._gameHandlers.add(cb); return () => this._gameHandlers.delete(cb); }
  offGame(cb) { this._gameHandlers.delete(cb); }

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

  // Closes both ends. Emits 'close' with intentional:true (nothing was "lost").
  close() {
    for (const ep of [this, this.peer]) {
      if (!ep || ep._closed) continue;
      ep._closed = true;
      ep._emit('close', { code: 1000, reason: 'local', wasClean: true, intentional: true });
      ep._gameHandlers.clear();
    }
  }

  _emit(type, payload) {
    const set = this._handlers.get(type);
    if (!set) return;
    for (const cb of [...set]) {
      try { cb(payload); } catch (err) { console.error(`[LocalBus] '${type}' handler failed`, err); }
    }
  }
}

export const LocalBus = {
  // Returns [a, b]. Convention in solo mode: a = driver/host end, b = cook end.
  pair() {
    const n = ++pairSeq;
    const a = new LocalEndpoint(`local-a${n}`);
    const b = new LocalEndpoint(`local-b${n}`);
    a.peer = b;
    b.peer = a;
    return [a, b];
  },
};

export default LocalBus;
