# Networking notes (Agent NET)

Architecture: host-authoritative co-op. The **driver's browser runs GameSim**. The Node server
(`server/index.js` + `server/rooms.js`) is a room manager and a dumb relay: it never looks inside
game messages. Traffic: driver → cook `snap` at 15 Hz (3-12 KB JSON, permessage-deflate on),
cook → driver `lab` at 6 Hz plus `cmd` on demand.

## Wire protocol

Base contract: `public/js/shared/protocol.js` (C2S, S2C, GM). Everything below is **additive**:
clients that ignore the extra fields still work.

### Extensions to protocol.js

| Direction | Message | Meaning |
| --- | --- | --- |
| C→S | `{ t:'lobby' }` | **New.** Return the room from `playing` to `lobby` after a game (end screen → "Back to room"). Clears both ready flags on the playing→lobby transition; idempotent when already in lobby (just re-sends ROOM to the caller), so both players can send it. Game relay stops while in lobby. |
| C→S | `{ t:'role', role:'swap' }` | **New value.** Swap roles with the other player (both ready flags cleared). `role:'driver'/'cook'` still works for taking a free seat; asking for a seat the other player holds is rejected (`ERROR code:'roleTaken'`). |
| S→C | `ROOM.state` | **New field.** `'lobby' \| 'playing'`. ROOM is also broadcast right after START with `state:'playing'`. |
| S→C | `ERROR.code`, `ERROR.re` | **New fields.** Machine-readable reason + the request type it answers. Codes: `badRequest, badCode, notFound, full, started, roleTaken, noPeer, notReady, notHost, noRoom, tooLarge, serverFull, expired`. `msg` stays the friendly sentence to show. |
| S→C | `PEER_LEFT.name` | **New field.** Display name of who left. |
| S→C | `PONG.now` | **New field.** Server `Date.now()` (unused by the client; handy for clock-offset estimates later). |

### Server rules (rooms.js)

- Codes: 4 chars from `BCDFGHJKLMNPQRSTVWXYZ23456789` (no 0/O/1/I, no vowels so codes never spell words). JOIN accepts any case.
- Max 2 players. Creator is host and auto `driver`; joiner auto gets the free role (normally `cook`).
- START: host only; needs 2 players, distinct roles, both ready. Broadcasts `{t:'start', seed, roles}` where seed is a random uint32 from `crypto`. Room → `playing`: no new joiners, roles/ready locked, `g` relayed.
- Ready flags are **not** cleared by START (so the room screen shows the last state); `{t:'lobby'}` clears them.
- GAME relay: `{t:'g', m}` → other player gets `{t:'g', m, from}` verbatim. Only while `playing`. Snapshots (`m.k==='snap'`) to a receiver whose socket has > 256 KB buffered are dropped so a slow cook catches up instead of lagging further. `lab`/`cmd`/`end`/`chat` are never dropped.
- Limits: 64 KB per message (bigger gets `ERROR tooLarge`, socket stays open; > 256 KB closes the socket with 1009). Token bucket per socket: 120 msgs/s refill, burst 200, excess dropped silently (one log line per 10 s). Names: NFKC, control/zero-width/bidi chars and `<>` stripped, whitespace collapsed, ≤ 16 chars, default `Player N`.
- LEAVE or socket close: other player gets `PEER_LEFT` then ROOM (room back to `lobby`, ready cleared, the remaining player becomes host). Empty rooms are deleted immediately. Rooms with no non-ping traffic for 30 min are swept (players get `ERROR code:'expired'`).
- Heartbeat: ws ping every 20 s; sockets that missed the last pong are terminated. SIGTERM/SIGINT: sockets closed with **1012** ("Server restarting"), HTTP closed, exit within 4 s.
- `/healthz` → `{ ok, rooms, playing, players, uptime }`.

## Client API

### NetClient (`public/js/net/NetClient.js`)

```js
const net = new NetClient();        // ws(s)://<host>/ws; ?server=host:port (or full ws/http URL) overrides
await net.connect();                // resolves on open, rejects on error/timeout (15 s)
net.send(obj);                      // queued until open
net.on(type, cb) → unsubscribe; net.off(type, cb)
net.sendGame(m);                    // { t:'g', m }
net.onGame((m, from) => {}) → unsubscribe; net.offGame(cb)
net.close();
net.latencyMs   // smoothed RTT (PING every 3 s), null until first PONG
net.id          // my player id (from last ROOM.you)
net.room        // last ROOM message
net.isOpen, net.roomCode
```

Events: every S2C `t` (`room`, `start`, `error`, `peerLeft`, `pong`, `g`), plus `open`, `close`
(`{code, reason, wasClean, intentional}`; `intentional` is true after `net.close()`), `error`
(socket failure shaped `{t:'error', msg, code:'socket'}`), and `latency` (ms).

### LocalBus (`public/js/net/LocalBus.js`)

`const [a, b] = LocalBus.pair()`: same `sendGame / onGame / offGame / on / off / close` surface.
Delivery is async (`queueMicrotask`) and structured-cloned. `close()` closes both ends and emits
`close` with `intentional:true`. `send()`/`connect()` are no-ops. Convention: `a` = driver/host end,
`b` = cook end.

### Lobby (`public/js/ui/lobby.js`)

```js
const lobby = showLobby(rootEl, { onStart, net?, resumeRoom?, inviteBase?, netOptions? });
lobby.destroy();  // or hideLobby()
```

`onStart(payload)`:

```js
{ mode: 'solo'|'online', role: 'driver'|'cook', seed: uint32, net: NetClient|null,
  roomCode: string|null, you: playerId|'solo', isHost: bool, name: string,
  players: [{ id, name, role, ready }] }
```

- Solo: `role:'driver'`, `net:null`, random seed. The integrator makes a `LocalBus.pair()`.
- Online: called on START for both players. The lobby removes itself and hands **ownership of `net`
  to the game** (it won't close it). `net` is still connected and in the room.
- The lobby injects `css/lobby.css` itself if the page didn't link it. It renders a fixed full-screen
  overlay (`z-index: 50`) inside `rootEl`.
- Name persists in `localStorage['cookrun.name']`. `?room=CODE` prefills Join and focuses it.
- `destroy()`/`hideLobby()` while sitting in a room (without a START) sends `leave` and closes the
  socket. Only `onStart` hands the connection over.

## Integrator checklist

1. **Start a game:** `showLobby(document.getElementById('menu'), { onStart })`.
   In `onStart`, for online play subscribe with `const off = net.onGame(...)` and keep `off`.
   Driver: send `{k:'snap'}` at `rules.net.snapshotHz` and `{k:'end'}` once. Cook: `{k:'lab'}` at
   `rules.net.labHz`, `{k:'cmd'}` immediately.
2. **Connection lost:** listen to `net.on('close', i => { if (!i.intentional) hud.toast('Connection lost', 'bad') })`
   and `net.on('peerLeft', …)` ("Your partner left"). On peerLeft the server has already put the room
   back in lobby state, so stop sending game messages and offer "Back to room".
3. **Back to room after a game (play again):** unsubscribe game handlers (`off()`), tear down the
   game view, then `showLobby(root, { onStart, net, resumeRoom: true })`. The lobby sends
   `{t:'lobby'}` for you (idempotent; both players may do it) and shows the same room with ready
   cleared. If the socket died meanwhile it falls back to the title screen with a toast.
4. **Quit to menu:** `showLobby(root, { onStart, net })` (no `resumeRoom`) sends `leave`, closes `net`
   and shows the title. For solo just `showLobby(root, { onStart })`.
5. **Driver's end screen:** the cook's end screen comes from the `{k:'end'}` game message; whoever
   clicks "Back to room" first just waits in the room for the other.
6. The server serves `public/` as is: `index.html` no-cache; `.js/.css/.json` `max-age=60` (so a deploy
   reaches players within a minute); `vendor/` 7 days; other files 1 hour.

## Test

`npm run test:net` (protocol, relay, rate limit, idle sweep with a fake clock, NetClient/LocalBus in
Node 22) and `npm run test:net:browser` (adds two headless Chromium pages through
`public/net-test.html`: create, invite link, join, swap, ready, start, relay, back to room, restart,
quit, bad code, solo; desktop 1280×800 and phone 390×844; screenshots to `docs/lobby-*.png`).
