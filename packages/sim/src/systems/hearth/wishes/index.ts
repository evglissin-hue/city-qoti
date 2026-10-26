import type { System } from '../../../contracts';
import { isStandard } from '../../../state/hamlet';

/** Daily wish generation at 07:00, hourly target checks, expiry. Owner: C3B. C3.0 stub: registered at its slot, does nothing yet. */
export const wishes: System = {
  id: 'wishes',
  order: 74,
  every: 200,
  tick(state) {
    if (!isStandard(state)) return;
  },
};
