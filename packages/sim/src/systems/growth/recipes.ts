// What the town is short of (docs/spec/13-ledger.md, Zoning and growth): per good, against three
// days of what the town wants. The trade score's need term (./trades) reads it.
import { content } from '@qoti/content';
import { TARGET_COVER } from '../../constants';
import type { WorldState } from '../../contracts';
import { townStock } from '../../view/hamlet';

/**
 * Shortage per good in hundredths of a day: how far town stock falls short of TARGET_COVER days
 * of what the town wants (yesterday's market demand or use, whichever is more) plus what its
 * construction sites still wait for. 0 when covered. A site's needs count as TARGET_COVER days of
 * want spread over the cover, so a town with sites waiting on planks reads as short of planks even
 * before anyone has used one.
 */
export function shortages(
  state: WorldState,
  stock: readonly number[] = townStock(state),
  want: readonly number[] = wants(state),
): number[] {
  const out = new Array<number>(content.goods.length).fill(0);
  for (let g = 0; g < out.length; g++) {
    const w = want[g]!;
    if (w <= 0) continue;
    const short = w * TARGET_COVER - (stock[g] ?? 0);
    if (short > 0) out[g] = Math.floor((short * 100) / w);
  }
  return out;
}

/** Units a day the town wants of each good: market demand or use, plus site needs over the cover. */
export function wants(state: WorldState): number[] {
  const n = content.goods.length;
  const demand = state.market.demand;
  const used = state.economy.yesterday.consumed;
  const waiting = new Array<number>(n).fill(0);
  for (const b of state.buildings) {
    const c = b.rt?.construction;
    if (c) for (let g = 0; g < n; g++) waiting[g]! += c.needs[g] ?? 0;
  }
  const out = new Array<number>(n);
  for (let g = 0; g < n; g++) out[g] = Math.max(demand[g] ?? 0, used[g] ?? 0) + waiting[g]! / TARGET_COVER;
  return out;
}
