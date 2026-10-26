// Requests between seats (docs/spec/16-coop.md, Requests). C4.0 stub: request.add and
// request.resolve work by hand. C4D closes goods and charm requests hourly at offset 130 when they
// are met (counting village.requestsFulfilled) and emits request.updated with progress.
import { TICKS_PER_HOUR } from '../../constants';
import type { System } from '../../contracts';

export const requests: System = {
  id: 'requests',
  order: 98,
  every: TICKS_PER_HOUR,
  offset: 130,
  tick() {},
};
