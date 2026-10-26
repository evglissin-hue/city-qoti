import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';

/** Production methods, buffers, fields, felling and planting. Owner: C3C. C3.0 stub: registered at its slot, does nothing yet. */
export const production: System = {
  id: 'production',
  order: 30,
  every: 1,
  tick(state) {
    if (!isStandard(state)) return;
  },
};
