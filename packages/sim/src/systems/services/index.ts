// Service coverage (docs/spec/13-ledger.md, Services). C4.0 stub: registered, does nothing yet.
// C4C fills the social, health and education needs (NEED_IDS) hourly from school, tavern and
// herbalist coverage.
import { TICKS_PER_HOUR } from '../../constants';
import type { System } from '../../contracts';

export const services: System = {
  id: 'services',
  order: 56,
  every: TICKS_PER_HOUR,
  offset: 110,
  tick() {},
};
