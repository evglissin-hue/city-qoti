import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';

/** Arrivals, departures, jobs, schedules, needs, mood, friendships. Owner: C3A. C3.0 stub: registered at its slot, does nothing yet. */
export const residents: System = {
  id: 'residents',
  order: 50,
  every: 1,
  tick(state) {
    if (!isStandard(state)) return;
  },
};
