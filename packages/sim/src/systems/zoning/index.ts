// Lots from zoned frontage (docs/spec/13-ledger.md, Zoning and growth). C4.0 stub: zone.paint and
// zone.clear set the `zone` layer; C4B cuts lots along roads (2x2 to 3x3, facing the road), keeps
// the `lot` layer and state.lots in step, and emits lot.added / lot.updated / lot.removed.
import { TICKS_PER_HOUR } from '../../constants';
import type { System } from '../../contracts';

export const zoning: System = {
  id: 'zoning',
  order: 24,
  every: TICKS_PER_HOUR,
  offset: 70,
  tick() {},
};
