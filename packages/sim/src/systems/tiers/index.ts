// Population tiers (docs/spec/13-ledger.md, Population tiers). C4.0 stub: registered, does nothing
// yet. C4C counts household.tierDays at 05:00, upgrades homes in place after TIER_UP_DAYS (with
// materials delivered to rt.upgrade) and slides them back after TIER_DOWN_DAYS.
import { TICKS_PER_DAY } from '../../constants';
import type { System } from '../../contracts';
import { dailyOffset } from '../economy/time';

export const tiers: System = {
  id: 'tiers',
  order: 58,
  every: TICKS_PER_DAY,
  offset: dailyOffset(5),
  tick() {},
};
