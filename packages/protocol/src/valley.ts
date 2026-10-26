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
  opts: {
    valleyId: string;
    seed?: string;
    settings: ValleySettings;
    now: number;
    seats?: number;
    snapshot?: ImportedSnapshot;
  },
): Promise<NewValley> {
  const tokens = Array.from({ length: opts.seats ?? 2 }, () => randomId());
  const seed = opts.seed && opts.seed.trim() ? opts.seed.trim().slice(0, 64) : randomId().slice(0, 12);
  const meta: StoredMeta = {
    valley: { id: opts.valleyId, seed, settings: opts.settings, createdAt: opts.now },
    tokenHashes: await Promise.all(tokens.map((t) => sha256Hex(t))),
    nextTurn: opts.snapshot ? opts.snapshot.t + 1 : 1,
    simVersion: opts.snapshot?.simVersion ?? null,
  };
  await storage.putMeta(meta);
  if (opts.snapshot) {
    const { t, simVersion, data } = opts.snapshot;
    await storage.putSnapshot({ t, simVersion, label: 'Imported', created: opts.now, data });
  }
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

/**
 * A valley imported from a .qoti file: a snapshot the importing client has already migrated and
 * re-serialized with its own sim (so its simVersion matches), with nobody connected.
 */
export interface ImportedSnapshot {
  t: number;
  simVersion: string;
  /** Base64 of the serialized state, as in the snapshot message. */
  data: string;
}

/** Imported snapshots are capped well above a City-scale valley (2 MB gzipped, as base64). */
export const MAX_IMPORT_CHARS = 8 * 1024 * 1024;

/** Body of POST /api/valleys. */
export interface CreateValleyRequest {
  seed?: string;
  settings?: Partial<ValleySettings>;
  /** C3X: start from an imported valley instead of a fresh one. */
  snapshot?: ImportedSnapshot;
}

function importedSnapshot(v: unknown): ImportedSnapshot | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const s = v as Record<string, unknown>;
  if (typeof s.t !== 'number' || !Number.isInteger(s.t) || s.t < 0) return undefined;
  if (typeof s.simVersion !== 'string' || typeof s.data !== 'string') return undefined;
  if (s.data.length === 0 || s.data.length > MAX_IMPORT_CHARS) return undefined;
  return { t: s.t, simVersion: s.simVersion, data: s.data };
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
  const snapshot = importedSnapshot(body.snapshot);
  const v = await initValley(storage, { valleyId, seed, settings, now, ...(snapshot && { snapshot }) });
  return {
    valleyId,
    seed: v.seed,
    tokens: v.tokens,
    invites: v.tokens.map((token, seat) => inviteFragment(valleyId, seat, token)),
  };
}
