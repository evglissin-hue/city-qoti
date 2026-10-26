// Connection contract (docs/spec/20-architecture.md, I0 contracts). Additive changes only during waves.
import type { Signal } from '@preact/signals';
import type { ErrorCode, PresenceMsg, PresenceUpdate, S2C, Welcome } from '@qoti/protocol';
import type { Command, SeatId, Turn } from '@qoti/sim';

export type { PresenceMsg, PresenceUpdate, Welcome };

export type ConnectionStatus = 'connecting' | 'catching-up' | 'live' | 'offline';

export interface SnapshotUpload {
  t: number;
  simVersion: string;
  /** gzip save bytes from the worker. */
  data: Uint8Array;
}

export interface RoomConnection {
  readonly seat: SeatId;
  /** Returns the command's seq. */
  submit(cmd: Command): number;
  onTurn(cb: (turn: Turn) => void): void;
  onPresence(cb: (p: PresenceMsg) => void): void;
  sendPresence(p: PresenceUpdate): void;
  close(): void;
  status: Signal<ConnectionStatus>;

  // C1 additions: catch-up, snapshots, hashes and errors.
  /** The room's welcome: valley meta, latest snapshot, stored log and nextTurn. */
  onWelcome(cb: (w: Welcome) => void): void;
  onNeedSnapshot(cb: (reason: Extract<S2C, { k: 'needSnapshot' }>['reason']) => void): void;
  onError(cb: (code: ErrorCode, message: string) => void): void;
  sendSnapshot(s: SnapshotUpload): void;
  sendHash(t: number, h: string): void;
}
