# 21. Networking and saves

## Model

Deterministic lockstep with a relay (P48). Both browsers run the same simulation. The room (a Cloudflare Durable Object online, `LocalRoom` offline) collects commands, orders them into **turns**, stores the log and snapshots, and relays presence. It never runs the simulation.

- A turn is emitted every 100 ms of real time while at least one seat is connected (and once more after the last seat leaves, to record its `sys.seatLeft`). Each turn carries the commands received since the last one, in arrival order, with server-injected `sys.*` commands first.
- The sim decides how many ticks a turn advances (`effectiveSpeed`, see `20-architecture.md`). Turns therefore carry no speed.
- Empty turns are broadcast (they advance time) but not stored: the log stores only turns with commands; replay fills the gaps.

## Messages

```ts
// packages/protocol/src/messages.ts
type C2S =
  | { k: 'hello'; valleyId: string; seat: SeatId; token: string; simVersion: string }
  | { k: 'cmd'; seq: number; cmd: Command }
  | { k: 'presence'; cursor?: [number, number]; tool?: string; cam?: [x: number, z: number, dist: number, yaw: number] }
  | { k: 'ping'; x: number; z: number; kind: 'look' | 'help' | 'build' }
  | { k: 'emote'; id: string }
  | { k: 'hash'; t: number; h: string }
  | { k: 'snapshot'; t: number; simVersion: string; data: string }   // base64 of gzip
  | { k: 'bye' };

type S2C =
  | { k: 'welcome'; seat: SeatId; valley: ValleyMeta;
      snapshot: { t: number; simVersion: string; data: string } | null;
      log: Turn[]; nextTurn: number; roster: RosterEntry[] }
  | { k: 'turn'; turn: Turn }
  | { k: 'presence'; seat: SeatId; cursor?: [number, number]; tool?: string; cam?: [number, number, number, number] }
  | { k: 'ping'; seat: SeatId; x: number; z: number; kind: 'look' | 'help' | 'build' }
  | { k: 'emote'; seat: SeatId; id: string }
  | { k: 'roster'; roster: RosterEntry[] }
  | { k: 'needSnapshot'; reason: 'periodic' | 'desync' | 'version' }
  | { k: 'resync'; snapshot: { t: number; simVersion: string; data: string }; log: Turn[]; nextTurn: number }
  | { k: 'reloadRequired'; simVersion: string }
  | { k: 'error'; code: 'BAD_TOKEN' | 'SEAT_TAKEN' | 'VERSION_MISMATCH' | 'TOO_LARGE' | 'RATE_LIMIT' | 'NOT_FOUND'; message: string };

interface ValleyMeta { id: string; seed: string; settings: ValleySettings; createdAt: number }
interface RosterEntry { seat: SeatId; connected: boolean }
type PresenceMsg = Extract<S2C, { k: 'presence' | 'ping' | 'emote' | 'roster' }>;
type PresenceUpdate = Omit<Extract<C2S, { k: 'presence' }>, 'k'>;
```

## RoomCore

Transport-agnostic logic in `packages/protocol`, wrapped by three adapters: `ValleyRoom` (Durable Object), `tools/dev-server` (Node `ws`), `LocalRoom` (browser).

```ts
class RoomCore {
  constructor(storage: RoomStorage, opts: { turnMs: number; now: () => number });
  open(conn: Conn): void;                  // waits for hello; closes after 5 s without one
  message(conn: Conn, msg: C2S): void;
  close(conn: Conn): void;
  step(): void;                            // the adapter calls this every turnMs
  receive(conn: Conn, raw: string): void;  // C1: parses a frame and enforces the size limits
  ready(): Promise<void>;                  // C1: storage loaded
  flush(): Promise<void>;                  // C1: queued storage writes done
}
interface Conn { send(msg: S2C): void; close(code: number, reason: string): void }
interface RoomStorage {
  getMeta(): Promise<StoredMeta | null>;   putMeta(m: StoredMeta): Promise<void>;
  appendTurn(turn: Turn): Promise<void>;   turnsAfter(t: number): Promise<Turn[]>;
  putSnapshot(s: StoredSnapshot): Promise<void>;
  latestSnapshot(): Promise<StoredSnapshot | null>;
  pruneTurnsUpTo(t: number): Promise<void>;
}
```

- `StoredMeta` holds the valley meta, SHA-256 hashes of the seat tokens, `nextTurn` (written every 50 turns and when the last seat leaves) and the active `simVersion`.
- Storage operations are queued so their order matches turn order.
- A seat can be connected once; a second connection for the same seat replaces the first (handy after a laptop sleeps).

## Join and catch-up

1. The client opens the socket and sends `hello` (the token travels in the message, never in the URL).
2. The room replies `welcome` with the latest snapshot (or `null` for a fresh valley, which the client generates from the seed), the stored turns after it, and `nextTurn`. It then injects `sys.seatJoined` into the next turn.
3. The client's worker loads the snapshot, replays turns up to `nextTurn - 1` as fast as it can (filling empty turns), and buffers live turns meanwhile. Status shows "catching up" until done.
4. Snapshots every 300 turns keep catch-up under about a second.
5. Reconnects: when the socket closes, or no frame arrives for 5 s (the room sends a turn every 100 ms, so silence means a sleeping laptop or lost wifi), the client replaces it after 0.5 s, then 1 s, 2 s and so on up to 30 s, with 25 percent jitter. The `online` event and the tab becoming visible retry at once. Closes that retrying cannot fix (bad hello, replaced by another tab, bad token, unknown valley, version mismatch) stop the retries. Each new `welcome` re-initializes the worker from its snapshot and log while the valley stays on screen; status goes `offline`, `connecting`, `catching-up`, then `live`.

## Snapshots and backups

- Every 300 turns (30 s) the room sends `needSnapshot` to the seat connected longest; the client replies with a snapshot of its current turn. The room stores it and prunes turns up to it. It accepts unsolicited snapshots too, ignores ones older than its latest, and keeps the latest 20 plus the newest snapshot of each in-game season (`retainSnapshots`).
- The room also asks the longest-connected seat for a snapshot when a turn sets speed 0. Clients send one when they pause and when the tab is hidden (`visibilitychange`), and label every snapshot with the season ("Year 2, Summer", the optional `label` on the `snapshot` message).
- **Retention**: the latest 20 snapshots, plus one per in-game season as a named backup ("Year 2, Summer").
- **Export** (`.qoti`): gzip JSON `{ format: 1, meta, snapshot, log }`. **Import** creates a new valley from a file.

## Desync detection

- Every 50 turns each client sends `hash` for that turn.
- If two seats report different hashes for the same turn: the room asks the seat connected longest for a snapshot (`needSnapshot` with reason `desync`, once until it answers or leaves), stores it like any snapshot, then sends `resync` to the other seat(s) with the snapshot, the stored turns after it and `nextTurn`; live turns emitted meanwhile are buffered and follow the `resync`. With `?debug`, `window.__qoti.corrupt()` applies a local-only turn so tests can force this. Both clients keep a debug dump (snapshot plus the last 300 turns) for download from the debug overlay.
- More than 3 desyncs in an hour shows a "this is a bug, please send the dump" notice.

## Version changes

- Until C2C builds this hand-over, a hello with a different `simVersion` is refused with `VERSION_MISMATCH` while another seat is connected; with nobody else connected, the newcomer's version becomes the active one.
- A client whose `simVersion` differs from the room's active version, while seats with the old version are connected: the room asks an old client for a snapshot, sends `reloadRequired` to the old clients, then admits the new client from that snapshot. Nothing is lost.
- If no one is connected, the new client loads the latest snapshot (migrating by `saveVersion`) and becomes the active version. Turns after that snapshot from an older `simVersion` cannot be replayed and are dropped (at most about 30 s of play, rarer thanks to snapshots on pause and leave). The client shows a short notice.

## Presence

- Never part of sim state. A cursor is the world point under the pointer, to a 32nd of a tile, sent up to 10 times a second while it moves (the room allows 12 per second per seat) and an empty presence once the pointer has been off the valley for a moment. The receiving client plays the points back a gap or so behind, at the pace they came, and smooths the corners, so a partner's cursor glides instead of hopping between tiles. Pings and emotes are rate-limited to 2 per second. The roster counts a seat as connected from its hello until it leaves.
- The room relays presence to the other seats immediately (not in turns).

## Offline solo

`LocalRoom` runs `RoomCore` in the main thread with an IndexedDB storage adapter (one database per valley) and an in-memory connection. Same code path as online. Moving a solo valley online [I2] is export, then import.

## Hosting

One Cloudflare Worker named `city-qoti` serving the client build as static assets, plus the `ValleyRoom` Durable Object class (SQLite storage).

| Route | Purpose |
|---|---|
| `GET /*` | client (single-page fallback to `index.html`) |
| `POST /api/valleys` | create: returns `valleyId` and two seat tokens with invite links |
| `GET /api/valleys/:id/ws` | WebSocket upgrade, handled by the valley's Durable Object |
| `GET /api/valleys/:id/export` | download `.qoti` (seat token in an `Authorization` header; C2C, answers 501 until then) |
| `POST /api/valleys/import` | create a valley from a `.qoti` file (C2C, answers 501 until then) |
| `GET /version.json` | `{ simVersion, build }` for update checks (a static file emitted by the client build) |

Durable Object SQLite schema:

```sql
CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE turns (t INTEGER PRIMARY KEY, cmds TEXT);
CREATE TABLE snapshots (t INTEGER PRIMARY KEY, sim_version TEXT, label TEXT, created INTEGER, data BLOB);
```

- The turn timer is a `setInterval` while at least one socket is open (standard WebSocket accept, not hibernation). If timers prove unreliable on the platform, fall back to client heartbeats: each client sends a heartbeat every 100 ms and the room emits a turn on the first heartbeat of each new 100 ms slot.
- Invite links look like `https://<host>/#v=<valleyId>&s=1&k=<token>`. The fragment never reaches servers or logs; the client moves it into local storage and clears it from the address bar.

**Deploying** (one time, by a human):

1. Create a free Cloudflare account.
2. On a laptop: `npx wrangler login`, then `npm run deploy`. It prints the game's URL.
3. Optional: add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub secrets to enable the deploy workflow on `main`.

Two players for a few hours a day should fit comfortably in the free tier; check current limits when deploying.

## Security and privacy

- Valley ids and seat tokens are 128-bit random values. Tokens are stored only as SHA-256 hashes and never logged.
- Limits: `cmd` 8 KB, `snapshot` 8 MB, `presence` 256 B; 30 commands per second per seat. Oversized or excessive messages get an `error` and are dropped.
- Same-origin only. No analytics, no third-party scripts, no personal data beyond display names.
