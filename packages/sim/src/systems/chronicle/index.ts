import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';

/** Weekly wishes digest and season summaries. Owner: C3B. C3.0 stub: registered at its slot, does nothing yet. */
export const chronicle: System = {
  id: 'chronicle',
  order: 100,
  every: 200,
  tick(state) {
    if (!isStandard(state)) return;
  },
};
