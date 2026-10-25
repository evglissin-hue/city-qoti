import type { ValleySettings } from '@qoti/sim';
import type { RoomStorage, StoredMeta } from './storage';
import { randomId, sha256Hex } from './tokens';

export interface NewValley {
  valleyId: string;
  /** One token per seat (seat 0 creates, seat 1 joins with the invite link). */
  tokens: string[];
  seed: string;
}

/** Writes a new valley's meta into empty storage and returns the plain seat tokens once. */
export async function initValley(
  storage: RoomStorage,
  opts: { valleyId: string; seed?: string; settings: ValleySettings; now: number; seats?: number },
): Promise<NewValley> {
  const tokens = Array.from({ length: opts.seats ?? 2 }, () => randomId());
  const seed = opts.seed && opts.seed.trim() ? opts.seed.trim().slice(0, 64) : randomId().slice(0, 12);
  const meta: StoredMeta = {
    valley: { id: opts.valleyId, seed, settings: opts.settings, createdAt: opts.now },
    tokenHashes: await Promise.all(tokens.map((t) => sha256Hex(t))),
    nextTurn: 1,
    simVersion: null,
  };
  await storage.putMeta(meta);
  return { valleyId: opts.valleyId, tokens, seed };
}

/** The invite link fragment for a seat; the fragment never reaches servers or logs. */
export function inviteFragment(valleyId: string, seat: number, token: string): string {
  return `#v=${encodeURIComponent(valleyId)}&s=${seat}&k=${encodeURIComponent(token)}`;
}

/** Body of POST /api/valleys. */
export interface CreateValleyRequest {
  seed?: string;
  settings?: Partial<ValleySettings>;
}

/** Response of POST /api/valleys. */
export interface CreateValleyResponse {
  valleyId: string;
  seed: string;
  tokens: string[];
  /** Fragments (#v=...&s=...&k=...) the client turns into invite links. */
  invites: string[];
}
