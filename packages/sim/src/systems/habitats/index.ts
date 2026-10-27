// The habitats system slot (C5.0; C5C owns it): scores the six habitats per chunk at 02:00 and
// sends habitats.updated for the chunks that moved.
// A registered no-op until its owner fills it; it returns at once in sandbox valleys.
import { TICKS_PER_DAY } from '../../constants';
import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { dailyOffset } from '../economy/time';

export const habitats: System = {
  id: 'habitats',
  order: 76,
  every: TICKS_PER_DAY,
  offset: dailyOffset(2),
  tick(state) {
    if (!isStandard(state)) return;
  },
};
