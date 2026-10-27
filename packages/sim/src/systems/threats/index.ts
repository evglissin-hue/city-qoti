// The threats system slot (C5.0; C5D owns it): grows pressure with wealth at 00:40, less
// deterrence, schedules a raid on day 1 of a season above the threshold (Village rank on),
// telegraphs it, and plans the wolves' nights.
// A registered no-op until its owner fills it; it returns at once in sandbox valleys.
import { TICKS_PER_DAY } from '../../constants';
import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { dailyOffset } from '../economy/time';

export const threats: System = {
  id: 'threats',
  order: 80,
  every: TICKS_PER_DAY,
  offset: dailyOffset(0, 133),
  tick(state) {
    if (!isStandard(state)) return;
  },
};
