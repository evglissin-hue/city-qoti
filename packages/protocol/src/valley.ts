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

/**
 * Valley settings with defaults filled in. Mirrors defaultSettings() in @qoti/sim (the protocol
 * may not import sim code); a client test keeps the two in step.
 */
export function normalizeSettings(partial: Partial<ValleySettings> = {}): ValleySettings {
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback;
  const name = (value: unknown, fallback: string) =>
    typeof value === 'string' && value.trim() ? value.trim().slice(0, 32) : fallback;
  return {
    mode: pick(partial.mode, ['sandbox', 'standard'], 'sandbox'),
    economy: pick(partial.economy, ['gentle', 'standard', 'thoughtful'], 'gentle'),
    threat: pick(partial.threat, ['peaceful', 'standard', 'fierce'], 'peaceful'),
    togetherOnly: partial.togetherOnly === true,
    townName: name(partial.townName, 'Qoti'),
    valleyName: name(partial.valleyName, 'Riverbend'),
  };
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

/** Handles POST /api/valleys for any adapter: fills in settings, writes the meta, builds invites. */
export async function createValley(
  storage: RoomStorage,
  valleyId: string,
  body: CreateValleyRequest,
  now: number,
): Promise<CreateValleyResponse> {
  const settings = normalizeSettings(typeof body.settings === 'object' && body.settings ? body.settings : {});
  const seed = typeof body.seed === 'string' ? body.seed : undefined;
  const v = await initValley(storage, { valleyId, seed, settings, now });
  return {
    valleyId,
    seed: v.seed,
    tokens: v.tokens,
    invites: v.tokens.map((token, seat) => inviteFragment(valleyId, seat, token)),
  };
}
