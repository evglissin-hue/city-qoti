// The carrier (docs/spec/13-ledger.md, The carrier and trade; R1A builds it): the peddler grown up,
// a cart at the valley gate at 10:00 every day the pass is open, and the boat once a dock stands.
// It buys what a family is short of its reserve and sells what is over twice it, within the
// family's rule, the day's budget and what it can carry, and books both as imports and exports.
//
// R1 stand-in (R1A), as R1.0 wrote it: today's peddler mapped onto families with the default rules.
// - At 10:00 it rolls `carrier.bought` and `.sold` (the oldest day drops, today starts at zero) and
//   zeroes `spentToday`.
// - Units it may carry today: PEDDLER_TERMS.units, or 40 at TRADE_BUY_PERCENT and
//   TRADE_SELL_PERCENT once a Trading Post stands (the peddler's 140% and 60% before).
// - Buying, Food, Fuel, Materials, Wares, Treats in that order: Always buys up to the reserve (days
//   of the family's use: Food a resident a day, Fuel a household a day, Wares and Treats the Settler
//   basket; Materials: what open sites still need beyond stock, plus the reserve in units).
//   Essentials, for Materials, buys only what open sites wait for beyond stock; for the other
//   families it buys nothing yet. Never buys nothing. Within a family it takes the cheapest good a
//   neighbor sells, unit by unit, while the budget and the treasury's credit line hold; the goods go
//   to the nearest store with room (stowNearest), each unit nudging that neighbor's price.
// - Selling, with what load is left: a family with `sell` on and a rule other than Never sells what
//   is over twice the reserve, the good it holds most of first, to the neighbor paying most; never
//   what a festival put by.
// - No County tab, no deals, no boat, no closed pass and no winter marks yet: R1A's.
import { TICKS_PER_DAY, CARRIER_HOUR } from '../../constants';
import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { dailyOffset } from '../economy/time';

export const carrier: System = {
  id: 'carrier',
  order: 65,
  every: TICKS_PER_DAY,
  offset: dailyOffset(CARRIER_HOUR),
  tick(state) {
    if (!isStandard(state)) return;
    // Executor: carrierDay(state, ctx) per the header above.
  },
};
