// The festivals system slot (C5.0; C5B owns it): tidies last night's festival pieces at 04:00,
// reserves the menu, and runs the festival evening (day 6, 18:00 to 22:00; it may add an hourly
// pass of its own).
// A registered no-op until its owner fills it; it returns at once in sandbox valleys.
import { TICKS_PER_DAY } from '../../constants';
import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { dailyOffset } from '../economy/time';

export const festivals: System = {
  id: 'festivals',
  order: 75,
  every: TICKS_PER_DAY,
  offset: dailyOffset(4),
  tick(state) {
    if (!isStandard(state)) return;
  },
};
