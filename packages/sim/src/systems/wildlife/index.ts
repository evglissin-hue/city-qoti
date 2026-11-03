// The wildlife system slot (C5.0; C5C owns it): rolls sightings hourly at offset 140 from the
// 'nature' stream; a first sighting fills a Field Guide page for both seats (systems/nature).
// Returns at once in sandbox valleys.
import { TICKS_PER_HOUR } from '../../constants';
import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { rollSightings } from '../nature/wildlife';

export const wildlife: System = {
  id: 'wildlife',
  order: 78,
  every: TICKS_PER_HOUR,
  offset: 140,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    rollSightings(state, ctx);
  },
};
