// The trials system slot (C5.0; C5A owns it): opens and judges the Charter's trial at 00:08 (the
// Village's first winter: fed on stored food, and warm).
// A registered no-op until its owner fills it; it returns at once in sandbox valleys.
import { TICKS_PER_DAY } from '../../constants';
import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { dailyOffset } from '../economy/time';

export const trials: System = {
  id: 'trials',
  order: 95,
  every: TICKS_PER_DAY,
  offset: dailyOffset(0, 8),
  tick(state) {
    if (!isStandard(state)) return;
  },
};
