import type { RankId, SeatId } from '@qoti/sim';
import { readJson, writeJson } from './storage';

export interface RecentValley {
  valleyId: string;
  seat: SeatId;
  /** The seat token: the only key to the valley, kept on this device only. */
  token: string;
  mode: 'online' | 'solo';
  name: string;
  lastPlayed: number;
  /** For the host of an online valley: the invite fragment for seat 1. */
  invite?: string;
  /** Set by an invite link until the valley is first joined. */
  pending?: boolean;
  /** I1: a creative (sandbox) valley, labeled as such in the list. */
  creative?: boolean;
  /** P1 (playtest item 13): the valley's seed, so it can be shared, and its rank, for the list. */
  seed?: string;
  rank?: RankId;
  /** R1C: founded under the old rules (save version under 6): listed grayed, never opened. */
  old?: true;
}

const KEY = 'qoti.recent';
const MAX = 12;

export function listRecent(): RecentValley[] {
  const list = readJson<RecentValley[]>(KEY, []);
  return Array.isArray(list) ? [...list].sort((a, b) => b.lastPlayed - a.lastPlayed) : [];
}

export function findRecent(valleyId: string): RecentValley | undefined {
  return listRecent().find((v) => v.valleyId === valleyId);
}

/** Adds or updates a valley (matched by id), most recent first. */
export function rememberValley(v: RecentValley): void {
  const others = listRecent().filter((x) => x.valleyId !== v.valleyId);
  writeJson(KEY, [v, ...others].slice(0, MAX));
}

export function updateRecent(valleyId: string, patch: Partial<RecentValley>): void {
  const found = findRecent(valleyId);
  if (found) rememberValley({ ...found, ...patch });
}

export function forgetValley(valleyId: string): void {
  writeJson(
    KEY,
    listRecent().filter((v) => v.valleyId !== valleyId),
  );
}
