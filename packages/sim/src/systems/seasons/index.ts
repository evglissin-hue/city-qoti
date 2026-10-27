// The seasons system slot (C5.0; C5A owns it): turns the season over at 00:02: sowing and harvest
// days, the river freezing from Winter day 2, the season card (season.started) and the report
// (season.report).
// A registered no-op until its owner fills it; it returns at once in sandbox valleys.
import { TICKS_PER_DAY } from '../../constants';
import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { dailyOffset } from '../economy/time';

export const seasons: System = {
  id: 'seasons',
  order: 12,
  every: TICKS_PER_DAY,
  offset: dailyOffset(0, 2),
  tick(state) {
    if (!isStandard(state)) return;
  },
};
