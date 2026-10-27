// The warmth system slot (C5.0; C5A owns it): burns a firewood a household each winter day at 07:30
// (twice in a cold snap), counts cold households and cold household-days.
// A registered no-op until its owner fills it; it returns at once in sandbox valleys.
import { TICKS_PER_DAY } from '../../constants';
import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { dailyOffset } from '../economy/time';

export const warmth: System = {
  id: 'warmth',
  order: 59,
  every: TICKS_PER_DAY,
  offset: dailyOffset(7, 100),
  tick(state) {
    if (!isStandard(state)) return;
  },
};
