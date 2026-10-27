// The wildlife system slot (C5.0; C5C owns it): rolls sightings hourly at offset 140 from the
// 'nature' stream; a first sighting fills a Field Guide page for both seats.
// A registered no-op until its owner fills it; it returns at once in sandbox valleys.
import { TICKS_PER_HOUR } from '../../constants';
import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';

export const wildlife: System = {
  id: 'wildlife',
  order: 78,
  every: TICKS_PER_HOUR,
  offset: 140,
  tick(state) {
    if (!isStandard(state)) return;
  },
};
