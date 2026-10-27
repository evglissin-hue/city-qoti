// The watch system slot (C5.0; C5D owns it): takes volunteers up to the target at 05:30, sets the
// day's duty roster, training and morale.
// A registered no-op until its owner fills it; it returns at once in sandbox valleys.
import { TICKS_PER_DAY } from '../../constants';
import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { dailyOffset } from '../economy/time';

export const watch: System = {
  id: 'watch',
  order: 82,
  every: TICKS_PER_DAY,
  offset: dailyOffset(5, 100),
  tick(state) {
    if (!isStandard(state)) return;
  },
};
