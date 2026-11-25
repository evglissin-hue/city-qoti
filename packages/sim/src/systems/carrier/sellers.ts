// Who sells what (R1A's carrier terms, R3A's own module): pure functions of content and the valley's
// rank, with no import beyond them, so readers deep in the place pass (the fourth gap's checks) can
// ask without pulling in the views. carrier/terms.ts re-exports both for their older readers.
import { content } from '@qoti/content';
import { RANKS } from '../../constants';
import type { WorldState } from '../../contracts';

/** True when the neighbor trades with the valley at its rank. */
export function neighborTrades(state: WorldState, id: string): boolean {
  const def = content.neighborById.get(id);
  return !!def && (!def.rank || RANKS.indexOf(state.charter.rank) >= RANKS.indexOf(def.rank));
}

/** True when some neighbor trading with the valley sells the good (so the carrier can bring it). */
export function someoneSells(state: WorldState, good: number): boolean {
  const id = content.goods[good]?.id;
  for (const n of content.neighbors) {
    if (neighborTrades(state, n.id) && n.sells.some(([g]) => g === id)) return true;
  }
  return false;
}
