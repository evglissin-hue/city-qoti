import type { Turn } from '@qoti/sim';
import { SNAPSHOTS_KEPT } from './limits';
import type { ValleyMeta } from './messages';

export interface StoredMeta {
  valley: ValleyMeta;
  /** SHA-256 hex of each seat's token, indexed by seat. Tokens themselves are never stored. */
  tokenHashes: string[];
  nextTurn: number;
  /** The active simVersion; null until the first hello. */
  simVersion: string | null;
}

export interface StoredSnapshot {
  t: number;
  simVersion: string;
  /** Named backups ("Year 2, Summer") arrive with C2C. */
  label: string | null;
  created: number;
  /** base64 of the gzip save. */
  data: string;
}

/** Where a room keeps its valley. Implemented by MemoryStorage, IndexedDB and Durable Object SQLite. */
export interface RoomStorage {
  getMeta(): Promise<StoredMeta | null>;
  putMeta(m: StoredMeta): Promise<void>;
  appendTurn(turn: Turn): Promise<void>;
  /** Stored turns with turn.t > t, in order. */
  turnsAfter(t: number): Promise<Turn[]>;
  putSnapshot(s: StoredSnapshot): Promise<void>;
  latestSnapshot(): Promise<StoredSnapshot | null>;
  pruneTurnsUpTo(t: number): Promise<void>;
}

export interface MemoryDump {
  meta: StoredMeta | null;
  turns: Turn[];
  snapshots: StoredSnapshot[];
}

/** In-memory storage for tests and the dev server, which persists it with dump and restore. */
export class MemoryStorage implements RoomStorage {
  private meta: StoredMeta | null = null;
  private turns: Turn[] = [];
  private snapshots: StoredSnapshot[] = [];
  /** Called after every write; the dev server uses it to schedule a save. */
  onChange: (() => void) | null = null;

  static restore(dump: MemoryDump): MemoryStorage {
    const s = new MemoryStorage();
    s.meta = dump.meta;
    s.turns = [...dump.turns].sort((a, b) => a.t - b.t);
    s.snapshots = [...dump.snapshots].sort((a, b) => a.t - b.t);
    return s;
  }

  dump(): MemoryDump {
    return { meta: this.meta, turns: this.turns, snapshots: this.snapshots };
  }

  private changed(): void {
    this.onChange?.();
  }

  async getMeta(): Promise<StoredMeta | null> {
    return this.meta ? structuredClone(this.meta) : null;
  }

  async putMeta(m: StoredMeta): Promise<void> {
    this.meta = structuredClone(m);
    this.changed();
  }

  async appendTurn(turn: Turn): Promise<void> {
    const last = this.turns[this.turns.length - 1];
    if (last && last.t >= turn.t) throw new Error(`Turn ${turn.t} is not after ${last.t}`);
    this.turns.push(turn);
    this.changed();
  }

  async turnsAfter(t: number): Promise<Turn[]> {
    return this.turns.filter((turn) => turn.t > t);
  }

  async putSnapshot(s: StoredSnapshot): Promise<void> {
    this.snapshots = this.snapshots.filter((x) => x.t !== s.t);
    this.snapshots.push(s);
    this.snapshots.sort((a, b) => a.t - b.t);
    if (this.snapshots.length > SNAPSHOTS_KEPT)
      this.snapshots.splice(0, this.snapshots.length - SNAPSHOTS_KEPT);
    this.changed();
  }

  async latestSnapshot(): Promise<StoredSnapshot | null> {
    return this.snapshots[this.snapshots.length - 1] ?? null;
  }

  async pruneTurnsUpTo(t: number): Promise<void> {
    this.turns = this.turns.filter((turn) => turn.t > t);
    this.changed();
  }
}
