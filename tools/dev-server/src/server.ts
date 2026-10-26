import {
  createValley,
  MAX_IMPORT_CHARS,
  MAX_SNAPSHOT_BYTES,
  MemoryStorage,
  randomId,
  type Conn,
  type CreateValleyRequest,
} from '@qoti/protocol';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import { Rooms } from './rooms';

export interface DevServerOptions {
  port: number;
  dataDir: string;
  log?: (msg: string) => void;
}

export interface DevServer {
  port: number;
  close(): Promise<void>;
}

const WS_PATH = /^\/api\/valleys\/([^/]+)\/ws$/;

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, limit = 64 * 1024): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error('Body too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** The local relay: POST /api/valleys and the valley WebSocket, rooms kept in dataDir. */
export function startDevServer(opts: DevServerOptions): Promise<DevServer> {
  const log = opts.log ?? ((msg: string) => console.log(`[dev-server] ${msg}`));
  const rooms = new Rooms(opts.dataDir, log);

  const http = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'POST' && url.pathname === '/api/valleys') {
        try {
          const raw = await readBody(req, MAX_IMPORT_CHARS + 64 * 1024);
          const body = (raw ? JSON.parse(raw) : {}) as CreateValleyRequest;
          const valleyId = randomId();
          const storage = new MemoryStorage();
          const created = await createValley(storage, valleyId, body, Date.now());
          rooms.adopt(valleyId, storage);
          log(`Created valley ${valleyId.slice(0, 6)} (seed ${created.seed})`);
          json(res, 200, created);
        } catch (err) {
          json(res, 400, { error: String(err) });
        }
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true });
      json(res, 404, { error: 'Not found' });
    })();
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_SNAPSHOT_BYTES + 64 * 1024 });

  http.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const match = WS_PATH.exec(url.pathname);
    if (!match) {
      socket.destroy();
      return;
    }
    const valleyId = decodeURIComponent(match[1]!);
    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      const room = rooms.get(valleyId);
      if (!room) {
        ws.send(JSON.stringify({ k: 'error', code: 'NOT_FOUND', message: 'No such valley' }));
        ws.close(4004, 'No such valley');
        return;
      }
      const conn: Conn = {
        send: (msg) => {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
        },
        close: (code, reason) => ws.close(code, reason),
      };
      rooms.socketOpened(room);
      room.core.open(conn);
      ws.on('message', (data, isBinary) => {
        if (!isBinary) room.core.receive(conn, data.toString());
      });
      ws.on('close', () => {
        room.core.close(conn);
        rooms.socketClosed(room);
      });
      ws.on('error', () => ws.close());
    });
  });

  return new Promise((resolve) => {
    http.listen(opts.port, () => {
      const port = (http.address() as AddressInfo).port;
      log(`Relay on http://localhost:${port} (valleys in ${opts.dataDir})`);
      resolve({
        port,
        async close() {
          for (const client of wss.clients) client.terminate();
          wss.close();
          await new Promise<void>((done) => http.close(() => done()));
          await rooms.close();
        },
      });
    });
  });
}
