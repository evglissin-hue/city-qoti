// The commissions system slot (C5.0; C5B owns it): offers commissions as renown grows, tracks
// progress hourly at offset 180, and closes or expires them.
// A registered no-op until its owner fills it; it returns at once in sandbox valleys.
import { TICKS_PER_HOUR } from '../../constants';
import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';

export const commissions: System = {
  id: 'commissions',
  order: 93,
  every: TICKS_PER_HOUR,
  offset: 180,
  tick(state) {
    if (!isStandard(state)) return;
  },
};
