// Plans (docs/spec/16-coop.md, Plans layer). Plans are driven by commands (plan.*); this pass is a
// C4.0 stub that C4D may use to tidy old discarded or approved plans (MAX_PLANS).
import { TICKS_PER_DAY } from '../../constants';
import type { System } from '../../contracts';
import { dailyOffset } from '../economy/time';

export const plans: System = {
  id: 'plans',
  order: 97,
  every: TICKS_PER_DAY,
  offset: dailyOffset(3),
  tick() {},
};
