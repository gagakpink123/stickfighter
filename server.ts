import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import { RoomDirectory } from './src/game/rooms.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DIST_DIR = path.resolve(__dirname, 'dist');
const DIST_INDEX = path.join(DIST_DIR, 'index.html');
const IS_PROD =
  process.env.NODE_ENV === 'production' ||
  (process.env.NODE_ENV !== 'development' &&
    fs.existsSync(DIST_INDEX) &&
    process.env.DISABLE_HMR !== 'true');

interface ClientSocketState {
  id: string;
  ws: WebSocket;
  isAlive: boolean;
}

interface ServerLeaderboardEntry {
  key: string;
  isGuest: boolean;
  uid: string | null;
  name: string;
  wins: number;
  losses: number;
  matches: number;
  lastMatchAt: number;
  updatedAt: number;
  lastRecordedMatchId?: string;
}

const LEADERBOARD_STORE_PATH = '/tmp/aff_leaderboard1v1.json';
const leaderboardStore = new Map<string, ServerLeaderboardEntry>();

function loadServerLeaderboardStore(): void {
  try {
    if (!fs.existsSync(LEADERBOARD_STORE_PATH)) return;
    const raw = JSON.parse(fs.readFileSync(LEADERBOARD_STORE_PATH, 'utf8')) as Record<
      string,
      ServerLeaderboardEntry
    >;
    if (raw && typeof raw === 'object') {
      for (const key of Object.keys(raw)) {
        const rec = raw[key];
        if (rec && typeof rec === 'object' && typeof rec.key === 'string') {
          leaderboardStore.set(key, rec);
        }
      }
    }
  } catch {
    // ignore corrupt temp cache
  }
}

function saveServerLeaderboardStore(): void {
  try {
    const obj: Record<string, ServerLeaderboardEntry> = {};
    for (const [k, v] of leaderboardStore.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(LEADERBOARD_STORE_PATH, JSON.stringify(obj), 'utf8');
  } catch {
    // ignore
  }
}

function getSortedServerLeaderboard(): ServerLeaderboardEntry[] {
  return Array.from(leaderboardStore.values()).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    const rateA = a.wins / Math.max(1, a.matches);
    const rateB = b.wins / Math.max(1, b.matches);
    if (Math.abs(rateB - rateA) > 0.0001) return rateB - rateA;
    if (b.matches !== a.matches) return b.matches - a.matches;
    return (b.lastMatchAt || b.updatedAt) - (a.lastMatchAt || a.updatedAt);
  });
}

function cleanLabel(raw: unknown, maxLen: number, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const clean = raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
  return clean || fallback;
}

loadServerLeaderboardStore();

const roomDirectory = new RoomDirectory();
const clients = new Map<string, ClientSocketState>();
let clientSeq = 0;

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastWaitingRooms(): void {
  const msg = JSON.stringify({
    t: 'rooms_sync',
    rooms: roomDirectory.getWaitingRooms(),
  });
  for (const client of clients.values()) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(msg);
    }
  }
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json());

  // Handle Vercel Analytics endpoints in non-Vercel environments (Cloud Run, local dev, Docker).
  // Prevents SPA fallback from serving index.html for script.js, which causes "Unexpected token '<'" SyntaxError.
  app.all('/_vercel/*', (req, res) => {
    if (req.path.endsWith('.js')) {
      res.type('application/javascript').send('/* vercel analytics inactive on non-vercel host */');
      return;
    }
    res.status(204).end();
  });

  app.get('/api/rooms', (_req, res) => {
    res.json({ rooms: roomDirectory.getWaitingRooms() });
  });

  app.get('/api/leaderboard1v1', (_req, res) => {
    res.json({ entries: getSortedServerLeaderboard() });
  });

  app.post('/api/leaderboard1v1/record', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const matchId = cleanLabel(body.matchId, 64, '');
    if (!matchId) {
      res.status(400).json({ error: 'matchId is required' });
      return;
    }
    const localSlot = body.localSlot === 2 ? 2 : 1;
    const won = body.won === true;
    const uid = typeof body.uid === 'string' && body.uid.trim() ? body.uid.trim().slice(0, 128) : null;
    const now = Date.now();

    if (uid) {
      const displayName = cleanLabel(body.displayName, 24, 'Pemain');
      const existing = leaderboardStore.get(uid);
      if (!existing) {
        leaderboardStore.set(uid, {
          key: uid,
          isGuest: false,
          uid,
          name: displayName,
          wins: won ? 1 : 0,
          losses: won ? 0 : 1,
          matches: 1,
          lastMatchAt: now,
          updatedAt: now,
          lastRecordedMatchId: matchId,
        });
        saveServerLeaderboardStore();
      } else if (existing.lastRecordedMatchId !== matchId) {
        leaderboardStore.set(uid, {
          key: uid,
          isGuest: false,
          uid,
          name: displayName,
          wins: existing.wins + (won ? 1 : 0),
          losses: existing.losses + (won ? 0 : 1),
          matches: existing.matches + 1,
          lastMatchAt: now,
          updatedAt: now,
          lastRecordedMatchId: matchId,
        });
        saveServerLeaderboardStore();
      }
    } else {
      const safeMatch = matchId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 54) || 'match';
      const guestKey = `guest_${safeMatch}_${localSlot}`;
      if (!leaderboardStore.has(guestKey)) {
        const charName = cleanLabel(body.charName, 22, '');
        const guestName = charName ? `Guest (${charName})`.slice(0, 32) : 'Guest';
        leaderboardStore.set(guestKey, {
          key: guestKey,
          isGuest: true,
          uid: null,
          name: guestName,
          wins: won ? 1 : 0,
          losses: won ? 0 : 1,
          matches: 1,
          lastMatchAt: now,
          updatedAt: now,
          lastRecordedMatchId: matchId,
        });
        saveServerLeaderboardStore();
      }
    }

    res.json({ entries: getSortedServerLeaderboard() });
  });

  app.post('/api/leaderboard1v1/sync-name', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const uid = typeof body.uid === 'string' && body.uid.trim() ? body.uid.trim().slice(0, 128) : '';
    const displayName = cleanLabel(body.displayName, 24, '');
    if (uid && displayName) {
      const existing = leaderboardStore.get(uid);
      if (existing) {
        leaderboardStore.set(uid, {
          ...existing,
          name: displayName,
          updatedAt: Date.now(),
        });
        saveServerLeaderboardStore();
      }
    }
    res.json({ ok: true });
  });

  app.delete('/api/leaderboard1v1/:uid', (req, res) => {
    const uid = typeof req.params.uid === 'string' ? req.params.uid.trim() : '';
    if (uid && leaderboardStore.delete(uid)) {
      saveServerLeaderboardStore();
    }
    res.json({ ok: true });
  });

  if (IS_PROD) {
    app.use(express.static(DIST_DIR));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path === '/ws' || req.path.startsWith('/_vercel/')) {
        next();
        return;
      }
      res.sendFile(DIST_INDEX);
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = request.url
      ? new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname
      : '';
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    clientSeq += 1;
    const clientId = `c-${Date.now()}-${clientSeq}`;
    const state: ClientSocketState = { id: clientId, ws, isAlive: true };
    clients.set(clientId, state);

    ws.on('pong', () => {
      state.isAlive = true;
    });

    // Send immediate initial waiting room directory to newly connected client
    sendJson(ws, {
      t: 'rooms_sync',
      rooms: roomDirectory.getWaitingRooms(),
    });

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;

      const type = msg.t;
      if (type === 'rooms_list') {
        sendJson(ws, {
          t: 'rooms_sync',
          rooms: roomDirectory.getWaitingRooms(),
        });
        return;
      }

      if (type === 'room_create') {
        const roomName = typeof msg.name === 'string' ? msg.name : '';
        const res = roomDirectory.createRoom(clientId, roomName);
        if (!res.ok) {
          sendJson(ws, { t: 'room_error', message: res.error });
          return;
        }
        sendJson(ws, { t: 'room_created', room: res.room });
        broadcastWaitingRooms();
        return;
      }

      if (type === 'room_join') {
        const roomId = typeof msg.roomId === 'string' ? msg.roomId : '';
        const res = roomDirectory.joinRoom(clientId, roomId);
        if (!res.ok) {
          sendJson(ws, { t: 'room_error', message: res.error });
          sendJson(ws, {
            t: 'rooms_sync',
            rooms: roomDirectory.getWaitingRooms(),
          });
          return;
        }
        sendJson(ws, { t: 'room_joined', room: res.room });
        const host = clients.get(res.hostClientId);
        if (host) {
          sendJson(host.ws, { t: 'peer_joined', room: res.room });
        }
        broadcastWaitingRooms();
        return;
      }

      if (type === 'room_leave') {
        const res = roomDirectory.leaveClient(clientId);
        if (res.notifyPeerId) {
          const other = clients.get(res.notifyPeerId);
          if (other) {
            sendJson(other.ws, { t: 'peer_bye' });
          }
        }
        if (res.listChanged) {
          broadcastWaitingRooms();
        }
        return;
      }

      if (type === 'relay') {
        const peerId = roomDirectory.getPeerClientId(clientId);
        if (!peerId) return;
        const peer = clients.get(peerId);
        if (peer && peer.ws.readyState === WebSocket.OPEN) {
          sendJson(peer.ws, { t: 'relay', payload: msg.payload });
        }
      }
    });

    const handleDisconnect = () => {
      clients.delete(clientId);
      const res = roomDirectory.leaveClient(clientId);
      if (res.notifyPeerId) {
        const other = clients.get(res.notifyPeerId);
        if (other) {
          sendJson(other.ws, { t: 'peer_bye' });
        }
      }
      if (res.listChanged) {
        broadcastWaitingRooms();
      }
    };

    ws.on('close', handleDisconnect);
    ws.on('error', handleDisconnect);
  });

  // Periodic heartbeat to purge stale sockets promptly
  const heartbeat = setInterval(() => {
    for (const [cid, client] of clients.entries()) {
      if (!client.isAlive) {
        clients.delete(cid);
        try {
          client.ws.terminate();
        } catch {
          // ignore
        }
        const res = roomDirectory.leaveClient(cid);
        if (res.notifyPeerId) {
          const other = clients.get(res.notifyPeerId);
          if (other) {
            sendJson(other.ws, { t: 'peer_bye' });
          }
        }
        if (res.listChanged) {
          broadcastWaitingRooms();
        }
        continue;
      }
      client.isAlive = false;
      try {
        client.ws.ping();
      } catch {
        // ignore
      }
    }
  }, 15000);

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Adnan Family Fighter server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
