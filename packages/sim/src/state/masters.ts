// R3 state helpers (R3.0): the four R3 slices as a fresh valley starts them, and the small lookups
// several R3 systems share. docs/spec/20-architecture.md, "R3 contracts". Shapes are fixed; bug fixes by
// anyone.
import type {
  EntityId,
  MastersState,
  PieceSupply,
  Resident,
  SuppliesState,
  ThreadsState,
  TownBookState,
  WorldState,
} from '../contracts';
import { ResidentFlags } from '../constants';
import { content } from '@qoti/content';

/**
 * The masters' goods (content.masters' `good`), by id. Until a master makes one it is no flavor
 * anybody wants, counts or misses: no shelf list, basket, base flavor or Balances line holds it.
 */
export const MASTER_GOOD_IDS: ReadonlySet<string> = new Set(
  content.masters.flatMap((m) => (m.good === undefined ? [] : [m.good])),
);

/** True for a master's good, by good index. */
export function isMasterGood(g: number): boolean {
  const def = content.goods[g];
  return def !== undefined && MASTER_GOOD_IDS.has(def.id);
}

export function emptySupplies(): SuppliesState {
  return {
    night: -1,
    lamps: [],
    pieces: [],
    drawn: [],
    lamplighters: [],
    roundSeasons: 0,
    roundSeason: -1,
    roundBroken: false,
  };
}

export function emptyMasters(): MastersState {
  return { lastMade: [], made: 0 };
}

export function emptyTownBook(): TownBookState {
  return { pages: [], hints: [], callings: [] };
}

export function emptyThreads(): ThreadsState {
  return { pairs: [] };
}

/** The R3 slices of a fresh valley (sandbox valleys keep them so). */
export function emptyMastersSlices(): Pick<WorldState, 'supplies' | 'masters' | 'townBook' | 'threads'> {
  return {
    supplies: emptySupplies(),
    masters: emptyMasters(),
    townBook: emptyTownBook(),
    threads: emptyThreads(),
  };
}

/** A supplied piece's saved record, or undefined (binary search: `supplies.pieces` is sorted by id). */
export function pieceSupply(state: WorldState, id: EntityId): PieceSupply | undefined {
  const list = state.supplies.pieces;
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const row = list[mid]!;
    if (row.id === id) return row;
    if (row.id < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return undefined;
}

/** True when the resident is a master (ResidentFlags.master; their trade is `mastery`). */
export function residentIsMaster(r: Resident): boolean {
  return (r.flags & ResidentFlags.master) !== 0;
}

/** Working days a resident has in a trade (`Resident.craft`), 0 when none. */
export function craftDays(r: Resident, trade: string): number {
  const list = r.craft;
  if (!list) return 0;
  for (const [t, d] of list) if (t === trade) return d;
  return 0;
}
