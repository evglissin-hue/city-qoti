import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';

/** Porter jobs, reservations and trips (matching every PORTER_MATCH_EVERY ticks). Owner: C3C. C3.0 stub: registered at its slot, does nothing yet. */
export const logistics: System = {
  id: 'logistics',
  order: 40,
  every: 1,
  tick(state) {
    if (!isStandard(state)) return;
  },
};
