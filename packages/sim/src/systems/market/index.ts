// The daily market pass (docs/spec/13-ledger.md, Market and prices). C4.0 baseline: at 00:10 the
// day's demand becomes yesterday's and today's prices go into the history; prices stay at base.
// C4A adds the price rule (cover against target, the multiplier curve, smoothing, clamps), wages,
// baskets and taxes, and emits market.updated.
import { PRICE_HISTORY_DAYS, TICKS_PER_DAY } from '../../constants';
import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { dailyOffset } from '../economy/time';

/** 00:10, after the books roll over at 00:00 (economy). */
export const MARKET_OFFSET = dailyOffset(0, 10);

export const market: System = {
  id: 'market',
  order: 62,
  every: TICKS_PER_DAY,
  offset: MARKET_OFFSET,
  tick(state) {
    if (!isStandard(state)) return;
    const m = state.market;
    m.demand = m.demandToday;
    m.demandToday = m.demand.map(() => 0);
    m.history.push([...m.prices]);
    if (m.history.length > PRICE_HISTORY_DAYS) m.history.shift();
  },
};
