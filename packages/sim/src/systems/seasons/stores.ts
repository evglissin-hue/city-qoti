// The winter stores (C5A): what a town eats and burns through the winter. Pure: reads state.
import { content } from '@qoti/content';
import type { WorldState } from '../../contracts';

/** Food, wheat and flour in town (the larder a winter is eaten from), units. */
export function larder(state: WorldState): number {
  const wheat = content.goodIndex.get('wheat') ?? -1;
  const flour = content.goodIndex.get('flour') ?? -1;
  let n = 0;
  for (const b of state.buildings) {
    const rt = b.rt;
    if (!rt) continue;
    for (let g = 0; g < content.goods.length; g++) {
      if (content.goods[g]!.food || g === wheat || g === flour) n += (rt.store[g] ?? 0) + (rt.output[g] ?? 0);
    }
  }
  for (const h of state.households)
    for (let g = 0; g < content.goods.length; g++) if (content.goods[g]!.food) n += h.pantry[g] ?? 0;
  return n;
}
