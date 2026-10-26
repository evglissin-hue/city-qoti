import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';

/** Checks achievement conditions hourly. Owner: C3B. C3.0 stub: registered at its slot, does nothing yet. */
export const achievements: System = {
  id: 'achievements',
  order: 90,
  every: 200,
  tick(state) {
    if (!isStandard(state)) return;
  },
};
