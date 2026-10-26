import type { System } from '../../../contracts';
import { isStandard } from '../../../state/hamlet';

/** Runs pattern detectors over dirty chunks each in-game hour. Owner: C3B. C3.0 stub: registered at its slot, does nothing yet. */
export const patterns: System = {
  id: 'patterns',
  order: 72,
  every: 200,
  tick(state) {
    if (!isStandard(state)) return;
  },
};
