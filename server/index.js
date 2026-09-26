import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { Room, makeCode } from './Room.js';
import { Progress, JsonFileStore, MemoryStore } from './Progress.js';
import { MODES } from '../src/net/protocol.js';

// Serveur de la Course Royale : WebSocket (salons, matchmaking, course) + fichiers du jeu (dist/) si présents.
//   PORT=2567 DATA_FILE=./data/progress.json STATIC_DIR=./dist node server/index.js
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary' };

export function createRaceServer({ port = 2567, store, staticDir = null, fillMs, endTime, interval } = {}) {
  const progress = new Progress(store ?? new MemoryStore());
  const rooms = new Map();
  let online = 0;

  const http = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      return res.end(JSON.stringify({ ok: true, rooms: rooms.size, online }));
    }
    if (!staticDir) { res.writeHead(404); return res.end(); }
    const path = normalize(join(staticDir, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname)));
    const root = resolve(staticDir);
    if (!resolve(path).startsWith(root + sep)) { res.writeHead(403); return res.end(); }
    try {
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });

  const newRoom = (mode) => {
    const code = makeCode(rooms);
    const room = new Room({ code, mode, progress, fillMs, endTime, interval, onEmpty: (r) => rooms.delete(r.code) });
    rooms.set(code, room);
    return room;
  };

  // Salons en attente : décompte des parties rapides
  const lobbyTimer = setInterval(() => {
    for (const r of rooms.values()) if (r.phase === 'lobby' && r.mode !== 'friends') { r.update(0); if (r.phase === 'lobby') r.broadcastLobby(); }
    for (const r of rooms.values()) if (r.phase === 'done' && !r.timer && !r.clients.size) rooms.delete(r.code);
  }, 1000);

  const wss = new WebSocketServer({ server: http, maxPayload: 4096 });
  wss.on('connection', (ws) => {
    online++;
    const id = randomUUID().slice(0, 8);
    let account = null, name = 'Dino', skin = 'classic', room = null, budget = 60, lastRefill = Date.now();
    const send = (s) => { if (ws.readyState === 1) ws.send(s); };
    const error = (code, msg) => send(JSON.stringify({ t: 'error', code, msg }));
    const leave = () => { room?.leave(id); room = null; };
    const enter = (r) => { leave(); if (r.join(id, { send, account, name, skin })) room = r; else error('full', 'Salon plein ou déjà lancé'); };

    let chain = Promise.resolve();
    ws.on('message', (data) => { chain = chain.then(() => handle(data)).catch(() => {}); });
    const handle = async (data) => {
      // limite de débit : ~60 messages/s en moyenne
      const now = Date.now();
      budget = Math.min(120, budget + (now - lastRefill) * 0.06); lastRefill = now;
      if (--budget < 0) return;
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      if (!msg || typeof msg.t !== 'string') return;
      if (msg.t === 'ping') return send(JSON.stringify({ t: 'pong', c: msg.c, s: Date.now() }));
      if (msg.t === 'hello') {
        name = String(msg.name || 'Dino').replace(/[<>]/g, '').slice(0, 16) || 'Dino';
        skin = String(msg.skin || 'classic').slice(0, 24);
        account = await progress.load(typeof msg.token === 'string' ? msg.token.slice(0, 64) : null, name);
        return send(JSON.stringify({ t: 'welcome', id, profile: Progress.view(account.profile) }));
      }
      if (!account) return error('hello', 'hello attendu');
      switch (msg.t) {
        case 'create': return enter(newRoom(MODES.friends));
        case 'join': {
          const r = rooms.get(String(msg.code || '').toUpperCase());
          return r ? enter(r) : error('notfound', 'Code inconnu');
        }
        case 'quick': {
          const mode = msg.ranked ? MODES.ranked : MODES.quick;
          const r = [...rooms.values()].find((x) => x.mode === mode && x.open && x.clients.size) ?? newRoom(mode);
          return enter(r);
        }
        case 'leave': return leave();
        default: return room?.onMessage(id, msg);
      }
    };
    ws.on('close', () => { online--; leave(); });
  });

  return new Promise((resolve) => http.listen(port, () => resolve({
    port: http.address().port, rooms, progress,
    close: () => new Promise((done) => { clearInterval(lobbyTimer); for (const r of rooms.values()) r.stop(); for (const c of wss.clients) c.terminate(); wss.close(); http.close(done); }),
  })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = +(process.env.PORT || 2567);
  const store = process.env.DATA_FILE ? new JsonFileStore(process.env.DATA_FILE) : new MemoryStore();
  createRaceServer({ port, store, staticDir: process.env.STATIC_DIR || null }).then(({ port: p }) => console.log(`🦖 Course Royale sur ws://localhost:${p}`));
}
