// The dock system slot (C5.0; C5B owns it): sends and settles the River Dock's boats at 08:00,
// after the caravans; none while the river is frozen.
// A registered no-op until its owner fills it; it returns at once in sandbox valleys.
import { TICKS_PER_DAY } from '../../constants';
import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { dailyOffset } from '../economy/time';

export const dock: System = {
  id: 'dock',
  order: 68,
  every: TICKS_PER_DAY,
  offset: dailyOffset(8, 2),
  tick(state) {
    if (!isStandard(state)) return;
  },
};
