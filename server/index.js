// Cook & Run server: static files + WebSocket room manager/relay on one port.
// The driver's browser runs the simulation; this process only pairs players
// and relays their game messages (cheap enough for Render's free tier).
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import express from 'express';
import { WebSocketServer } from 'ws';
import { RoomManager, DEFAULT_LIMITS } from './rooms.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const HEARTBEAT_MS = 20_000;
const SWEEP_MS = 60_000;
const STARTED = Date.now();

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ── HTTP ────────────────────────────────────────────────────────────────────
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true); // Render sits behind a proxy (x-forwarded-for)

const rooms = new RoomManager({ log });

app.get('/healthz', (_req, res) => {
  const s = rooms.stats();
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, rooms: s.rooms, playing: s.playing, players: s.players, uptime: Math.round((Date.now() - STARTED) / 1000) });
});

// Long cache for vendored libraries (three.js); they only change with a dependency bump.
app.use('/vendor', express.static(join(PUBLIC, 'vendor'), {
  index: false,
  setHeaders: (res) => res.set('Cache-Control', 'public, max-age=604800'),
}));

app.use(express.static(PUBLIC, {
  index: ['index.html'],
  extensions: ['html'],
  setHeaders: (res, path) => {
    const ext = extname(path).toLowerCase();
    if (ext === '.html') res.set('Cache-Control', 'no-cache');
    else if (ext === '.js' || ext === '.mjs' || ext === '.css' || ext === '.json') res.set('Cache-Control', 'public, max-age=60');
    else res.set('Cache-Control', 'public, max-age=3600');
  },
}));

app.use((req, res) => {
  res.status(404).type('text/plain').send(`Not found: ${req.path}`);
});

const server = http.createServer(app);
server.keepAliveTimeout = 65_000; // longer than typical proxy idle timeouts
server.headersTimeout = 66_000;

// ── WebSocket ───────────────────────────────────────────────────────────────
const wss = new WebSocketServer({
  server,
  path: '/ws',
  // Hard cap (socket closes with 1009 above this). Between 64 KB and this, rooms.js
  // answers with a polite ERROR {code:'tooLarge'} and the connection stays up.
  maxPayload: DEFAULT_LIMITS.messageMax * 4,
  perMessageDeflate: {
    // Snapshots are repetitive JSON. With context takeover, a synthetic 90-entity
    // snapshot stream measured ~3x smaller at level 3 (~0.2 ms/msg); key-heavy real
    // snapshots usually do better. Level 3 keeps CPU low on a shared free-tier core.
    // Memory is ~300 KB per socket at these settings, fine for 2 players per room.
    zlibDeflateOptions: { level: 3, memLevel: 8 },
    zlibInflateOptions: { chunkSize: 16 * 1024 },
    threshold: 512,          // don't bother compressing tiny lobby messages / pongs
    concurrencyLimit: 8,
  },
});

wss.on('connection', (ws, req) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
  const transport = {
    send: (str) => { if (ws.readyState === ws.OPEN) ws.send(str); },
    close: (code, reason) => ws.close(code, reason),
    get bufferedAmount() { return ws.bufferedAmount; },
  };
  const client = rooms.connect(transport);
  ws.isAlive = true;
  log(`[ws] + ${client.id} ${ip} (players=${rooms.clients.size})`);

  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data, isBinary) => {
    ws.isAlive = true;
    rooms.receive(client, isBinary ? data : data.toString('utf8'), isBinary);
  });
  ws.on('close', (code) => {
    rooms.disconnect(client);
    log(`[ws] - ${client.id} code=${code} (players=${rooms.clients.size})`);
  });
  ws.on('error', (err) => log(`[ws] ! ${client.id} ${err.message}`));
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch { /* socket already closing */ }
  }
}, HEARTBEAT_MS);

const sweeper = setInterval(() => rooms.sweep(), SWEEP_MS);
heartbeat.unref?.();
sweeper.unref?.();

server.listen(PORT, HOST, () => {
  log(`[http] Cook & Run listening on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT} (ws path /ws)`);
});

// ── graceful shutdown (Render sends SIGTERM on every deploy) ────────────────
let shuttingDown = false;
function shutdown(sig) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`[http] ${sig} received, shutting down (rooms=${rooms.rooms.size}, players=${rooms.clients.size})`);
  clearInterval(heartbeat);
  clearInterval(sweeper);
  for (const ws of wss.clients) {
    try { ws.close(1012, 'Server restarting'); } catch { /* ignore */ }
  }
  wss.close();
  server.close(() => { log('[http] closed'); process.exit(0); });
  setTimeout(() => {
    for (const ws of wss.clients) ws.terminate();
    process.exit(0);
  }, 4000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
