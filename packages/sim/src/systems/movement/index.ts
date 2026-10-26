import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';

/** Advances walking residents along their paths. Owner: C3A. C3.0 stub: registered at its slot, does nothing yet. */
export const movement: System = {
  id: 'movement',
  order: 52,
  every: 1,
  tick(state) {
    if (!isStandard(state)) return;
  },
};
