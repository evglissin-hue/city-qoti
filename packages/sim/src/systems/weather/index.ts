// The weather system slot (C5.0; C5A owns it): rolls today's weather and the forecast at 00:04 from
// the 'weather' stream, and schedules and ends events (flood, drought, early frost, cold snap,
// circus).
// A registered no-op until its owner fills it; it returns at once in sandbox valleys.
import { TICKS_PER_DAY } from '../../constants';
import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { dailyOffset } from '../economy/time';

export const weather: System = {
  id: 'weather',
  order: 14,
  every: TICKS_PER_DAY,
  offset: dailyOffset(0, 4),
  tick(state) {
    if (!isStandard(state)) return;
  },
};
