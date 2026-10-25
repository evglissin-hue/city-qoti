import { signal } from '@preact/signals';
import type { C2S, ErrorCode, PresenceMsg, PresenceUpdate, S2C, Welcome } from '@qoti/protocol';
import { bytesToBase64, type Command, type SeatId, type Turn } from '@qoti/sim';
import type { ConnectionStatus, RoomConnection, SnapshotUpload } from './connection';

type NeedSnapshotReason = Extract<S2C, { k: 'needSnapshot' }>['reason'];

/** Shared plumbing for OnlineRoom and LocalRoom: callbacks, seq numbers and message dispatch. */
export abstract class BaseConnection implements RoomConnection {
  readonly status = signal<ConnectionStatus>('connecting');
  private seq = 0;
  private readonly turnCbs: ((turn: Turn) => void)[] = [];
  private readonly presenceCbs: ((p: PresenceMsg) => void)[] = [];
  private readonly welcomeCbs: ((w: Welcome) => void)[] = [];
  private readonly snapshotCbs: ((reason: NeedSnapshotReason) => void)[] = [];
  private readonly errorCbs: ((code: ErrorCode, message: string) => void)[] = [];
  private readonly resyncCbs: ((r: Extract<S2C, { k: 'resync' }>) => void)[] = [];
  private readonly reloadCbs: ((simVersion: string) => void)[] = [];

  constructor(readonly seat: SeatId) {}

  protected abstract send(msg: C2S): void;
  abstract close(): void;

  submit(cmd: Command): number {
    const seq = ++this.seq;
    this.send({ k: 'cmd', seq, cmd });
    return seq;
  }

  sendPresence(p: PresenceUpdate): void {
    this.send({ k: 'presence', ...p });
  }

  sendSnapshot(s: SnapshotUpload): void {
    this.send({
      k: 'snapshot',
      t: s.t,
      simVersion: s.simVersion,
      data: bytesToBase64(s.data),
      ...(s.label ? { label: s.label } : {}),
    });
  }

  sendHash(t: number, h: string): void {
    this.send({ k: 'hash', t, h });
  }

  onTurn(cb: (turn: Turn) => void): void {
    this.turnCbs.push(cb);
  }

  onPresence(cb: (p: PresenceMsg) => void): void {
    this.presenceCbs.push(cb);
  }

  onWelcome(cb: (w: Welcome) => void): void {
    this.welcomeCbs.push(cb);
  }

  onNeedSnapshot(cb: (reason: NeedSnapshotReason) => void): void {
    this.snapshotCbs.push(cb);
  }

  onError(cb: (code: ErrorCode, message: string) => void): void {
    this.errorCbs.push(cb);
  }

  onResync(cb: (r: Extract<S2C, { k: 'resync' }>) => void): void {
    this.resyncCbs.push(cb);
  }

  onReloadRequired(cb: (simVersion: string) => void): void {
    this.reloadCbs.push(cb);
  }

  protected dispatch(msg: S2C): void {
    switch (msg.k) {
      case 'welcome':
        this.status.value = 'catching-up';
        for (const cb of this.welcomeCbs) cb(msg);
        break;
      case 'turn':
        for (const cb of this.turnCbs) cb(msg.turn);
        break;
      case 'presence':
      case 'ping':
      case 'emote':
      case 'roster':
        for (const cb of this.presenceCbs) cb(msg);
        break;
      case 'needSnapshot':
        for (const cb of this.snapshotCbs) cb(msg.reason);
        break;
      case 'error':
        for (const cb of this.errorCbs) cb(msg.code, msg.message);
        break;
      case 'resync':
        this.status.value = 'catching-up';
        for (const cb of this.resyncCbs) cb(msg);
        break;
      case 'reloadRequired':
        for (const cb of this.reloadCbs) cb(msg.simVersion);
        break;
    }
  }
}
