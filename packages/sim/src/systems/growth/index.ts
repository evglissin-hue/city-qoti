// Daily growth on lots (docs/spec/13-ledger.md, Zoning and growth). C4.0 stub: registered, does
// nothing yet. C4B scores lots (desirability, demand per zone) at 01:00 and starts grown sites
// with growLot (./api).
import { TICKS_PER_DAY } from '../../constants';
import type { System } from '../../contracts';
import { dailyOffset } from '../economy/time';

export const growth: System = {
  id: 'growth',
  order: 26,
  every: TICKS_PER_DAY,
  offset: dailyOffset(1),
  tick() {},
};
