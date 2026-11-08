// Network contract (docs/spec/21-networking-and-saves.md). Additive changes only during waves.
import type { Command, SeatId, Turn, ValleySettings } from '@qoti/sim';

export type C2S =
  | { k: 'hello'; valleyId: string; seat: SeatId; token: string; simVersion: string }
  | { k: 'cmd'; seq: number; cmd: Command }
  | {
      k: 'presence';
      cursor?: [number, number];
      tool?: string;
      cam?: [x: number, z: number, dist: number, yaw: number];
    }
  | { k: 'ping'; x: number; z: number; kind: 'look' | 'help' | 'build' }
  | { k: 'emote'; id: string }
  | { k: 'hash'; t: number; h: string }
  /** data: base64 of gzip. */
  | {
      k: 'snapshot';
      t: number;
      simVersion: string;
      data: string;
      /** The in-game season ("Year 2, Summer"); the newest snapshot of each is kept as a named backup. */
      label?: string;
    }
  | { k: 'bye' };

export type S2C =
  | {
      k: 'welcome';
      seat: SeatId;
      valley: ValleyMeta;
      snapshot: { t: number; simVersion: string; data: string } | null;
      log: Turn[];
      nextTurn: number;
      roster: RosterEntry[];
    }
  | { k: 'turn'; turn: Turn }
  | {
      k: 'presence';
      seat: SeatId;
      cursor?: [number, number];
      tool?: string;
      cam?: [number, number, number, number];
    }
  | { k: 'ping'; seat: SeatId; x: number; z: number; kind: 'look' | 'help' | 'build' }
  | { k: 'emote'; seat: SeatId; id: string }
  | { k: 'roster'; roster: RosterEntry[] }
  | { k: 'needSnapshot'; reason: 'periodic' | 'desync' | 'version' }
  | { k: 'resync'; snapshot: { t: number; simVersion: string; data: string }; log: Turn[]; nextTurn: number }
  | { k: 'reloadRequired'; simVersion: string }
  | {
      k: 'error';
      code: 'BAD_TOKEN' | 'SEAT_TAKEN' | 'VERSION_MISMATCH' | 'TOO_LARGE' | 'RATE_LIMIT' | 'NOT_FOUND';
      message: string;
    };

export interface ValleyMeta {
  id: string;
  seed: string;
  settings: ValleySettings;
  createdAt: number;
}

export interface RosterEntry {
  seat: SeatId;
  connected: boolean;
}

export type PresenceMsg = Extract<S2C, { k: 'presence' | 'ping' | 'emote' | 'roster' }>;
export type PresenceUpdate = Omit<Extract<C2S, { k: 'presence' }>, 'k'>;

export type Welcome = Extract<S2C, { k: 'welcome' }>;
export type ErrorCode = Extract<S2C, { k: 'error' }>['code'];
