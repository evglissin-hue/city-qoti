// The city-qoti Worker: static client, valley creation, and one ValleyRoom Durable Object per
// valley relaying the room protocol. Routes: docs/spec/21-networking-and-saves.md, Hosting.
import {
  createValley,
  handleImage,
  handlePerf,
  IMAGE_ROUTE,
  MAX_IMPORT_CHARS,
  PERF_ROUTE,
  randomId,
  RoomCore,
  TURN_MS,
  type Conn,
  type CreateValleyRequest,
} from '@qoti/protocol';
import { DurableObject } from 'cloudflare:workers';
import { SqliteStorage } from './storage';

export interface Env {
  VALLEY: DurableObjectNamespace<ValleyRoom>;
  ASSETS: Fetcher;
}

const WS_ROUTE = /^\/api\/valleys\/([0-9a-f]{32})\/ws$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** Same-origin only: a WebSocket from another site's page is refused. */
function sameOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get('Origin');
  return !origin || new URL(origin).host === url.host;
}

/** Reads a request body, refusing (null) once it passes `limit` bytes. */
async function readCapped(request: Request, limit: number): Promise<Uint8Array | null> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

function declaredLength(request: Request): number | null {
  const length = request.headers.get('content-length');
  return length === null ? null : Number(length);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/valleys' && request.method === 'POST') {
      if (!sameOrigin(request, url)) return json({ error: 'Forbidden' }, 403);
      let body: CreateValleyRequest;
      try {
        const text = await request.text();
        if (text.length > MAX_IMPORT_CHARS + 64 * 1024) return json({ error: 'Too large' }, 413);
        body = text ? (JSON.parse(text) as CreateValleyRequest) : {};
      } catch {
        return json({ error: 'Bad request' }, 400);
      }
      const valleyId = randomId();
      const room = env.VALLEY.get(env.VALLEY.idFromName(valleyId));
      return json(await room.create(valleyId, body));
    }

    const ws = WS_ROUTE.exec(url.pathname);
    if (ws && request.method === 'GET') {
      if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'Expected a WebSocket' }, 426);
      if (!sameOrigin(request, url)) return json({ error: 'Forbidden' }, 403);
      return env.VALLEY.get(env.VALLEY.idFromName(ws[1]!)).fetch(request);
    }

    // C5F: Chronicle pictures, handled by the valley's own object (its SQLite holds them).
    const image = IMAGE_ROUTE.exec(url.pathname);
    if (image) {
      if (!sameOrigin(request, url)) return json({ error: 'Forbidden' }, 403);
      return env.VALLEY.get(env.VALLEY.idFromName(image[1]!)).image(
        request,
        image[2] === undefined ? null : Number(image[2]),
      );
    }

    // V2.0: the seats' perf runs (Settings, Measure this laptop), kept by the valley's own object.
    const perf = PERF_ROUTE.exec(url.pathname);
    if (perf) {
      if (!sameOrigin(request, url)) return json({ error: 'Forbidden' }, 403);
      return env.VALLEY.get(env.VALLEY.idFromName(perf[1]!)).perf(request);
    }

    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);

    // The client build, with single-page fallback to index.html (see wrangler.toml).
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

/**
 * One valley: RoomCore over this object's SQLite storage. Sockets use the standard accept (not
 * hibernation) so the turn timer keeps running while anyone is connected.
 */
export class ValleyRoom extends DurableObject<Env> {
  private readonly storage: SqliteStorage;
  private core: RoomCore | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private sockets = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.storage = new SqliteStorage(ctx.storage.sql);
  }

  private room(): RoomCore {
    this.core ??= new RoomCore(this.storage, { turnMs: TURN_MS, now: () => Date.now() });
    return this.core;
  }

  /** Writes a new valley's meta and returns its tokens and invite fragments (once). */
  async create(valleyId: string, body: CreateValleyRequest) {
    return createValley(this.storage, valleyId, body, Date.now());
  }

  /** C5F: the image route (protocol handleImage) over this valley's SQLite, seat token required. */
  async image(request: Request, entry: number | null): Promise<Response> {
    const out = await handleImage(
      {
        method: request.method,
        entry,
        authorization: request.headers.get('authorization'),
        contentType: request.headers.get('content-type'),
        contentLength: declaredLength(request),
        body: (limit) => readCapped(request, limit),
      },
      this.storage,
      await this.storage.getMeta(),
      Date.now(),
    );
    if (out.bytes) {
      return new Response(out.bytes, {
        status: out.status,
        headers: {
          'content-type': out.type ?? 'application/octet-stream',
          'cache-control': 'private, max-age=31536000, immutable',
        },
      });
    }
    return json(out.json ?? {}, out.status);
  }

  /** V2.0: the perf route (protocol handlePerf) over this valley's storage, seat token required. */
  async perf(request: Request): Promise<Response> {
    const out = await handlePerf(
      {
        method: request.method,
        authorization: request.headers.get('authorization'),
        contentLength: declaredLength(request),
        body: async (limit) => {
          // Capped in bytes, which is never fewer than the characters they decode to.
          const bytes = await readCapped(request, limit);
          return bytes === null ? null : new TextDecoder().decode(bytes);
        },
      },
      this.storage,
      await this.storage.getMeta(),
      Date.now(),
    );
    return json(out.json, out.status);
  }

  override async fetch(_request: Request): Promise<Response> {
    const core = this.room();
    await core.ready();
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    const conn: Conn = {
      send: (msg) => {
        try {
          server.send(JSON.stringify(msg));
        } catch {
          // The socket is already closing.
        }
      },
      close: (code, reason) => {
        try {
          server.close(code, reason);
        } catch {
          // Already closed.
        }
      },
    };
    let open = true;
    const done = () => {
      if (!open) return;
      open = false;
      core.close(conn);
      this.sockets--;
      if (this.sockets === 0) this.rest();
    };
    core.open(conn);
    this.sockets++;
    this.timer ??= setInterval(() => core.step(), TURN_MS);
    server.addEventListener('message', (e) => {
      if (typeof e.data === 'string') core.receive(conn, e.data);
    });
    server.addEventListener('close', done);
    server.addEventListener('error', done);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** The last socket left: emit the turn that records it, then stop the timer. */
  private rest(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    setTimeout(() => {
      if (this.sockets === 0) this.core?.step();
    }, TURN_MS);
  }
}
