// The threats system (C5D): at 00:40 grows pressure with wealth, less deterrence, schedules a raid
// on day 1 of a season above the threshold (Village rank on, never on Peaceful), lets fog delay the
// signs a day, adds a sign a day, and plans the wolves' nights each winter. Returns at once in
// sandbox valleys. docs/spec/14-challenge.md, Threat pressure.
import { TICKS_PER_DAY } from '../../constants';
import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { dailyOffset } from '../economy/time';
import { threatDay } from './pressure';

export const threats: System = {
  id: 'threats',
  order: 80,
  every: TICKS_PER_DAY,
  offset: dailyOffset(0, 133),
  tick(state, ctx) {
    if (!isStandard(state)) return;
    threatDay(state, ctx);
  },
};
