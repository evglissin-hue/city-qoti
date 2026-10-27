// The daily market pass (docs/spec/13-ledger.md, Market and prices). At 00:10, after the books roll
// over at 00:00, the day's demand becomes yesterday's and, once the market is open (Village rank),
// every price takes a step toward where its cover points: D is what households wanted yesterday or
// what the town used up (the bakery's flour, the builders' planks), whichever is more; S is the
// town's stock in storehouses, stalls and output buffers; cover c = S / max(1, D) days against a
// target of 3. A good nobody makes or asks for drifts back to base. Then the day goes into the
// history and market.updated goes out.
import { content } from '@qoti/content';
import { PRICE_HISTORY_DAYS, TICKS_PER_DAY } from '../../constants';
import type { System, WorldState } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { townStock } from '../../view/hamlet';
import { marketView } from '../../view/village';
import { dailyOffset } from '../economy/time';
import { marketOpen } from './api';
import { coverOf, stepPrice, targetPrice } from './prices';

/** 00:10, after the books roll over at 00:00 (economy). */
export const MARKET_OFFSET = dailyOffset(0, 10);

/** Yesterday's demand for the price rule: households' wants or the town's use, whichever is more. */
export function effectiveDemand(state: WorldState, good: number): number {
  return Math.max(state.market.demand[good] ?? 0, state.economy.yesterday.consumed[good] ?? 0);
}

/** Today's cover and a price step per good. */
export function updatePrices(state: WorldState): void {
  const m = state.market;
  const stock = townStock(state);
  for (let g = 0; g < content.goods.length; g++) {
    const base = content.goods[g]!.basePrice;
    const d = effectiveDemand(state, g);
    const s = stock[g] ?? 0;
    const price = m.prices[g] ?? base;
    m.cover[g] = d === 0 && s === 0 ? 0 : coverOf(s, d);
    const target = d === 0 && s === 0 ? base : targetPrice(base, m.cover[g]!);
    m.prices[g] = stepPrice(base, price, target);
  }
}

export const market: System = {
  id: 'market',
  order: 62,
  every: TICKS_PER_DAY,
  offset: MARKET_OFFSET,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    const m = state.market;
    m.demand = m.demandToday;
    m.demandToday = m.demand.map(() => 0);
    const open = marketOpen(state);
    if (open) updatePrices(state);
    m.history.push([...m.prices]);
    if (m.history.length > PRICE_HISTORY_DAYS) m.history.shift();
    if (open) ctx.events.push({ e: 'market.updated', m: marketView(state) });
  },
};
