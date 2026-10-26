import type { System } from '../../../contracts';
import { isStandard } from '../../../state/hamlet';

/** Recomputes charm for dirty chunks (hourly, and after Hearth commands). Owner: C3B. C3.0 stub: registered at its slot, does nothing yet. */
export const charm: System = {
  id: 'charm',
  order: 70,
  every: 1,
  tick(state) {
    if (!isStandard(state)) return;
  },
};
