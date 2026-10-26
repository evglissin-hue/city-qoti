import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';

/** Daily taxes and upkeep, the peddler, lean times, consumption and the books. Owner: C3C. C3.0 stub: registered at its slot, does nothing yet. */
export const economy: System = {
  id: 'economy',
  order: 60,
  every: 1,
  tick(state) {
    if (!isStandard(state)) return;
  },
};
