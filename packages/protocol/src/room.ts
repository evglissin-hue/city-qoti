import type { Command, SeatedCommand, SeatId, Turn } from '@qoti/sim';
import {
  CloseCode,
  CMDS_PER_SECOND,
  HASHES_KEPT_TURNS,
  HELLO_TIMEOUT_MS,
  MAX_CMD_BYTES,
  MAX_OTHER_BYTES,
  MAX_PRESENCE_BYTES,
  MAX_SNAPSHOT_BYTES,
  META_SAVE_EVERY_TURNS,
  PINGS_PER_SECOND,
  PRESENCE_PER_SECOND,
  SNAPSHOT_EVERY_TURNS,
} from './limits';
import type { C2S, ErrorCode, RosterEntry, S2C } from './messages';
import { SerialQueue } from './queue';
import type { RoomStorage, StoredMeta, StoredSnapshot } from './storage';
import { sameHash, sha256Hex } from './tokens';

/** One client connection, as seen by the room. Adapters wrap a WebSocket or an in-page channel. */
export interface Conn {
  send(msg: S2C): void;
  close(code: number, reason: string): void;
}

export interface RoomOptions {
  turnMs: number;
  now: () => number;
  /** Where warnings go (desyncs, storage errors). Defaults to console. */
  log?: (level: 'info' | 'warn' | 'error', message: string) => void;
}

interface Client {
  conn: Conn;
  openedAt: number;
  phase: 'hello' | 'joining' | 'live' | 'closed';
  seat: SeatId | null;
  joinedAt: number;
  /** Turns emitted while the welcome was being prepared; sent right after it. */
  buffer: Turn[];
  cmdTimes: number[];
  presenceTimes: number[];
  pingTimes: number[];
}

function isSeat(v: unknown): v is SeatId {
  return v === 0 || v === 1 || v === 2 || v === 3;
}

/** Keeps timestamps from the last second; false when another event would exceed `perSecond`. */
function allow(times: number[], now: number, perSecond: number): boolean {
  while (times.length && now - times[0]! >= 1000) times.shift();
  if (times.length >= perSecond) return false;
  times.push(now);
  return true;
}

/**
 * Transport-agnostic room logic: orders commands into turns, stores the log and snapshots,
 * relays presence. It never runs the simulation. Adapters call step() every turnMs.
 */
export class RoomCore {
  private meta: StoredMeta | null = null;
  private readonly loaded: Promise<void>;
  private readonly clients = new Map<Conn, Client>();
  private readonly seats = new Map<SeatId, Client>();
  private pendingSys: SeatedCommand[] = [];
  private pendingCmds: SeatedCommand[] = [];
  private nextTurn = 1;
  private readonly queue: SerialQueue;
  private readonly hashes = new Map<number, Map<SeatId, string>>();
  /** Turns where two seats reported different hashes. The resync flow arrives with C2C. */
  desyncs = 0;

  constructor(
    private readonly storage: RoomStorage,
    private readonly opts: RoomOptions,
  ) {
    this.queue = new SerialQueue((err) => this.log('error', `Storage failed: ${String(err)}`));
    this.loaded = this.load();
  }

  private log(level: 'info' | 'warn' | 'error', message: string): void {
    if (this.opts.log) this.opts.log(level, message);
    else console[level](`[room] ${message}`);
  }

  private async load(): Promise<void> {
    const meta = await this.storage.getMeta();
    this.meta = meta;
    if (!meta) return;
    const snap = await this.storage.latestSnapshot();
    const turns = await this.storage.turnsAfter(snap?.t ?? 0);
    const lastStored = turns[turns.length - 1]?.t ?? 0;
    this.nextTurn = Math.max(meta.nextTurn, (snap?.t ?? 0) + 1, lastStored + 1);
  }

  /** Resolves once the valley is loaded from storage. */
  ready(): Promise<void> {
    return this.loaded;
  }

  /** Resolves when every storage write submitted so far has finished. */
  flush(): Promise<void> {
    return this.queue.idle();
  }

  get connectedSeats(): SeatId[] {
    return [...this.seats.keys()].sort((a, b) => a - b);
  }

  get currentTurn(): number {
    return this.nextTurn - 1;
  }

  open(conn: Conn): void {
    this.clients.set(conn, {
      conn,
      openedAt: this.opts.now(),
      phase: 'hello',
      seat: null,
      joinedAt: 0,
      buffer: [],
      cmdTimes: [],
      presenceTimes: [],
      pingTimes: [],
    });
  }

  /** Parses a raw frame and enforces size limits before dispatching it. */
  receive(conn: Conn, raw: string): void {
    if (raw.length > MAX_SNAPSHOT_BYTES + 1024) return this.error(conn, 'TOO_LARGE', 'Message too large');
    let msg: C2S;
    try {
      msg = JSON.parse(raw) as C2S;
    } catch {
      return;
    }
    if (typeof msg !== 'object' || msg === null || typeof msg.k !== 'string') return;
    const limit =
      msg.k === 'cmd'
        ? MAX_CMD_BYTES
        : msg.k === 'presence'
          ? MAX_PRESENCE_BYTES
          : msg.k === 'snapshot'
            ? MAX_SNAPSHOT_BYTES
            : MAX_OTHER_BYTES;
    if (raw.length > limit) return this.error(conn, 'TOO_LARGE', `${msg.k} message too large`);
    this.message(conn, msg);
  }

  message(conn: Conn, msg: C2S): void {
    const c = this.clients.get(conn);
    if (!c || c.phase === 'closed') return;
    if (msg.k === 'hello') {
      if (c.phase === 'hello') void this.hello(c, msg);
      return;
    }
    if (c.phase !== 'live' || c.seat === null) return;
    const seat = c.seat;
    const now = this.opts.now();
    switch (msg.k) {
      case 'cmd': {
        const cmd = msg.cmd as Command | undefined;
        if (typeof cmd !== 'object' || cmd === null || typeof cmd.t !== 'string') return;
        // sys.* commands come only from the room.
        if (cmd.t.startsWith('sys.')) return;
        if (!allow(c.cmdTimes, now, CMDS_PER_SECOND))
          return this.error(conn, 'RATE_LIMIT', 'Too many commands');
        this.pendingCmds.push({ seat, seq: typeof msg.seq === 'number' ? msg.seq : 0, cmd });
        return;
      }
      case 'presence': {
        if (!allow(c.presenceTimes, now, PRESENCE_PER_SECOND)) return;
        const out: S2C = { k: 'presence', seat };
        if (msg.cursor) out.cursor = msg.cursor;
        if (msg.tool !== undefined) out.tool = msg.tool;
        if (msg.cam) out.cam = msg.cam;
        return this.broadcast(out, seat);
      }
      case 'ping':
        if (!allow(c.pingTimes, now, PINGS_PER_SECOND)) return;
        return this.broadcast({ k: 'ping', seat, x: msg.x, z: msg.z, kind: msg.kind }, seat);
      case 'emote':
        if (!allow(c.pingTimes, now, PINGS_PER_SECOND)) return;
        return this.broadcast({ k: 'emote', seat, id: msg.id }, seat);
      case 'hash':
        return this.hash(seat, msg.t, msg.h);
      case 'snapshot':
        return this.snapshot(msg.t, msg.simVersion, msg.data);
      case 'bye':
        this.close(conn);
        conn.close(CloseCode.normal, 'Bye');
        return;
    }
  }

  close(conn: Conn): void {
    const c = this.clients.get(conn);
    if (!c) return;
    this.clients.delete(conn);
    const wasActive = c.phase === 'joining' || c.phase === 'live';
    c.phase = 'closed';
    if (wasActive && c.seat !== null && this.seats.get(c.seat) === c) {
      this.seats.delete(c.seat);
      this.pendingSys.push({ seat: c.seat, seq: 0, cmd: { t: 'sys.seatLeft', seat: c.seat } });
      this.broadcastRoster();
      if (this.seats.size === 0) this.saveMeta();
    }
  }

  /** Emits one turn while anyone is connected (or a sys command is waiting). Call every turnMs. */
  step(): void {
    const now = this.opts.now();
    for (const c of [...this.clients.values()]) {
      if (c.phase === 'hello' && now - c.openedAt > HELLO_TIMEOUT_MS) {
        this.close(c.conn);
        c.conn.close(CloseCode.helloTimeout, 'No hello');
      }
    }
    if (!this.meta) return;
    if (this.seats.size === 0 && this.pendingSys.length === 0 && this.pendingCmds.length === 0) return;

    // Server-injected sys.* commands first, then client commands in arrival order.
    const turn: Turn = { t: this.nextTurn++, cmds: [...this.pendingSys, ...this.pendingCmds] };
    this.pendingSys = [];
    this.pendingCmds = [];
    if (turn.cmds.length > 0) this.queue.run(() => this.storage.appendTurn(turn));
    for (const c of this.seats.values()) {
      if (c.phase === 'live') c.conn.send({ k: 'turn', turn });
      else if (c.phase === 'joining') c.buffer.push(turn);
    }
    if (turn.t % SNAPSHOT_EVERY_TURNS === 0) this.requestSnapshot();
    if (turn.t % META_SAVE_EVERY_TURNS === 0) this.saveMeta();
  }

  private async hello(c: Client, msg: Extract<C2S, { k: 'hello' }>): Promise<void> {
    await this.loaded;
    if (c.phase !== 'hello') return;
    const meta = this.meta;
    if (!meta || meta.valley.id !== msg.valleyId) {
      return this.reject(c, 'NOT_FOUND', 'No such valley', CloseCode.notFound);
    }
    const expected = isSeat(msg.seat) ? meta.tokenHashes[msg.seat] : undefined;
    const got = typeof msg.token === 'string' ? await sha256Hex(msg.token) : '';
    if (c.phase !== 'hello') return;
    if (!expected || !sameHash(got, expected)) {
      return this.reject(c, 'BAD_TOKEN', 'That invite does not open this valley', CloseCode.badToken);
    }
    if (meta.simVersion !== msg.simVersion) {
      const others = [...this.seats.values()].some((o) => o.seat !== msg.seat);
      if (meta.simVersion && others) {
        // The hand-over to a new version arrives with C2C; until then, the newcomer waits.
        return this.reject(
          c,
          'VERSION_MISMATCH',
          'Your game version differs from your partner',
          CloseCode.versionMismatch,
        );
      }
      if (meta.simVersion)
        this.log('warn', `simVersion changes from ${meta.simVersion} to ${msg.simVersion}`);
      meta.simVersion = msg.simVersion;
      this.saveMeta();
    }

    const seat = msg.seat;
    const previous = this.seats.get(seat);
    if (previous && previous !== c) {
      // A second connection for a seat replaces the first (handy after a laptop sleeps).
      this.clients.delete(previous.conn);
      previous.phase = 'closed';
      previous.conn.close(CloseCode.replaced, 'Opened somewhere else');
    }
    c.seat = seat;
    c.phase = 'joining';
    c.joinedAt = this.opts.now();
    c.buffer = [];
    this.seats.set(seat, c);
    this.pendingSys.push({ seat, seq: 0, cmd: { t: 'sys.seatJoined', seat } });

    // Every turn before upTo is already queued for storage, so the read below sees all of them;
    // later turns land in c.buffer and follow the welcome.
    const upTo = this.nextTurn;
    const { snap, log } = await this.queue.run(async () => {
      const latest = await this.storage.latestSnapshot();
      return { snap: latest, log: await this.storage.turnsAfter(latest?.t ?? 0) };
    });
    if (c.phase !== 'joining') return;
    c.conn.send({
      k: 'welcome',
      seat,
      valley: meta.valley,
      snapshot: snap ? { t: snap.t, simVersion: snap.simVersion, data: snap.data } : null,
      log: log.filter((turn) => turn.t < upTo),
      nextTurn: upTo,
      roster: this.roster(),
    });
    for (const turn of c.buffer) c.conn.send({ k: 'turn', turn });
    c.buffer = [];
    c.phase = 'live';
    this.broadcastRoster();
  }

  private reject(c: Client, code: ErrorCode, message: string, closeCode: number): void {
    c.conn.send({ k: 'error', code, message });
    this.close(c.conn);
    c.conn.close(closeCode, message);
  }

  private error(conn: Conn, code: ErrorCode, message: string): void {
    conn.send({ k: 'error', code, message });
  }

  private hash(seat: SeatId, t: number, h: string): void {
    if (typeof t !== 'number' || typeof h !== 'string') return;
    let reports = this.hashes.get(t);
    if (!reports) {
      reports = new Map();
      this.hashes.set(t, reports);
    }
    reports.set(seat, h);
    for (const [other, oh] of reports) {
      if (other !== seat && oh !== h) {
        this.desyncs++;
        this.log('warn', `Desync at turn ${t}: seat ${other} has ${oh}, seat ${seat} has ${h}`);
      }
    }
    for (const old of this.hashes.keys()) if (old < t - HASHES_KEPT_TURNS) this.hashes.delete(old);
  }

  private snapshot(t: number, simVersion: string, data: string): void {
    const meta = this.meta;
    if (!meta || typeof t !== 'number' || typeof data !== 'string' || t < 0 || t >= this.nextTurn) return;
    if (simVersion !== meta.simVersion) return;
    const snap: StoredSnapshot = { t, simVersion, label: null, created: this.opts.now(), data };
    this.queue.run(async () => {
      const latest = await this.storage.latestSnapshot();
      if (latest && latest.t >= snap.t) return;
      await this.storage.putSnapshot(snap);
      await this.storage.pruneTurnsUpTo(snap.t);
    });
  }

  /** Asks the seat connected longest for a snapshot of its current turn. */
  private requestSnapshot(): void {
    let oldest: Client | null = null;
    for (const c of this.seats.values()) {
      if (c.phase === 'live' && (!oldest || c.joinedAt < oldest.joinedAt)) oldest = c;
    }
    oldest?.conn.send({ k: 'needSnapshot', reason: 'periodic' });
  }

  private roster(): RosterEntry[] {
    const out: RosterEntry[] = [];
    this.meta?.tokenHashes.forEach((h, seat) => {
      if (h && isSeat(seat)) out.push({ seat, connected: this.seats.has(seat) });
    });
    return out;
  }

  private broadcastRoster(): void {
    this.broadcast({ k: 'roster', roster: this.roster() });
  }

  private broadcast(msg: S2C, except?: SeatId): void {
    for (const [seat, c] of this.seats) {
      if (seat !== except && c.phase === 'live') c.conn.send(msg);
    }
  }

  private saveMeta(): void {
    const meta = this.meta;
    if (!meta) return;
    meta.nextTurn = this.nextTurn;
    const copy = structuredClone(meta);
    this.queue.run(() => this.storage.putMeta(copy));
  }
}
