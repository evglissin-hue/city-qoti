// The thread counts' system (R3D): at midnight the door-pair counts halve and the faded ones drop, as
// the flows overlay's do (17-presentation.md, Follow the thread), so they weigh about the last two
// days. A pair whose building is gone drops with it, and a pair to a place the town no longer keeps
// a row for. The counts are written by recordThread (api.ts) where goods move.
import { TICKS_PER_DAY } from '../../constants';
import type { PlaceId, PlaceState, System, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { isStandard } from '../../state/hamlet';
import { dailyOffset } from '../economy/time';

/** Whether the town keeps a row for the place (rows are sorted by id). */
function hasPlaceRow(rows: readonly PlaceState[], id: PlaceId): boolean {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (rows[mid]!.id < id) lo = mid + 1;
    else hi = mid;
  }
  return lo < rows.length && rows[lo]!.id === id;
}

/** Halves every count; drops the faded ones and those whose door or place is gone. Keeps the order. */
export function decayThreads(state: WorldState): void {
  const pairs = state.threads.pairs;
  let kept = 0;
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i]!;
    p.units = Math.floor(p.units / 2);
    if (p.units <= 0) continue;
    if (!findById(state.buildings, p.from)) continue;
    if (p.to !== 0 ? !findById(state.buildings, p.to) : !hasPlaceRow(state.places, p.place ?? '')) continue;
    pairs[kept++] = p;
  }
  pairs.length = kept;
}

export const threads: System = {
  id: 'threads',
  order: 41,
  every: TICKS_PER_DAY,
  offset: dailyOffset(0),
  tick(state) {
    if (!isStandard(state)) return;
    decayThreads(state);
  },
};
