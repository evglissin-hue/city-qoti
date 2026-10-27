// The renown system slot (C5.0; C5B owns it): settles renown effects at 00:06 (arrivals, trade
// terms, notable visitors); points arrive through addRenown at any time.
// A registered no-op until its owner fills it; it returns at once in sandbox valleys.
import { TICKS_PER_DAY } from '../../constants';
import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { dailyOffset } from '../economy/time';

export const renown: System = {
  id: 'renown',
  order: 91,
  every: TICKS_PER_DAY,
  offset: dailyOffset(0, 6),
  tick(state) {
    if (!isStandard(state)) return;
  },
};
