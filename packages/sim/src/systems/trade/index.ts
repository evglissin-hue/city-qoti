// The Trading Post (docs/spec/13-ledger.md, Trade). C4.0 stub: registered, does nothing yet.
// C4A runs regional prices (drift and impact, daily), standing orders and the 08:00 caravan
// (CARAVAN_HOUR), books exports and imports through book() and emits trade.updated.
import { TICKS_PER_DAY } from '../../constants';
import type { System } from '../../contracts';
import { dailyOffset } from '../economy/time';

export const trade: System = {
  id: 'trade',
  order: 64,
  every: TICKS_PER_DAY,
  offset: dailyOffset(0, 20),
  tick() {},
};
