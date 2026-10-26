import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';

/** Construction sites: materials, builders, stages. Owner: C3C. C3.0 stub: registered at its slot, does nothing yet. */
export const construction: System = {
  id: 'construction',
  order: 20,
  every: 1,
  tick(state) {
    if (!isStandard(state)) return;
  },
};
