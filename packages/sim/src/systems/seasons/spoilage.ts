// Spoilage (C5A; docs/spec/13-ledger.md, Goods). Fish, bread and milk spoil (GoodDef.spoilsDays).
// There are no per-batch ages: each night, for each spoiling good, the town keeps what it eats in
// `spoilsDays` days (yesterday's eating, at least SPOIL_FLOOR units) plus fresh supply, and a pile
// above that loses a `spoilsDays`th of the excess, shared over the piles by size, half as much in
// storehouses (cool and dry). Pantries never spoil (they hold a day or two). So a town that eats
// what it makes loses nothing, a glut shrinks over a few nights, and no larder empties overnight.
import { content } from '@qoti/content';
import type { WorldState } from '../../contracts';
import { isStorehouse } from '../logistics/stores';

/** Units of a spoiling good always safe from spoilage, whatever the town ate yesterday. */
export const SPOIL_FLOOR = 10;

/** One night's spoilage. Returns the units lost, by good index (zeros for the rest). */
export function spoil(state: WorldState): number[] {
  const lost = new Array<number>(content.goods.length).fill(0);
  const e = state.economy;
  for (let g = 0; g < content.goods.length; g++) {
    const days = content.goods[g]!.spoilsDays;
    if (!days || days <= 0) continue;
    let total = 0;
    for (const b of state.buildings) if (b.rt) total += (b.rt.store[g] ?? 0) + (b.rt.output[g] ?? 0);
    const eaten = Math.max(e.yesterday.consumed[g] ?? 0, e.today.consumed[g] ?? 0);
    const fresh = Math.max(e.yesterday.produced[g] ?? 0, e.today.produced[g] ?? 0);
    const keep = Math.max(SPOIL_FLOOR, eaten * days + fresh);
    if (total <= keep) continue;
    const loss = Math.floor((total - keep) / days);
    if (loss <= 0) continue;
    for (const b of state.buildings) {
      const rt = b.rt;
      if (!rt) continue;
      const cool = isStorehouse(content.buildingById.get(b.def));
      for (const pile of [rt.store, rt.output]) {
        const n = pile[g] ?? 0;
        if (n <= 0) continue;
        let share = Math.floor((loss * n) / total);
        if (cool) share >>= 1;
        share = Math.min(n, share);
        pile[g] = n - share;
        lost[g]! += share;
      }
    }
  }
  return lost;
}
