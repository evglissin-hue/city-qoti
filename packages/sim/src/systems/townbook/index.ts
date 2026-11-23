// The Town Book system (R3C; docs/spec/19-evenings.md, The Town Book). Daily at 21:20, after the gaps
// pass (21:10): it closes the evening's counts (customers by good, evenings at 10 or more this season,
// visitors by day of the season), finds specialties and customs like the Pattern Book's detectors,
// credits the seats (Made Together), gives renown, moves the hints on, and earns callings. Where it
// runs in the day: docs/build/r3-wave-notes.md.
import { TICKS_PER_DAY } from '../../constants';
import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { dailyOffset } from '../economy/time';
import { closeTownBook } from './close';

export const TOWNBOOK_OFFSET = dailyOffset(21, 67);

export const townbook: System = {
  id: 'townbook',
  order: 81,
  every: TICKS_PER_DAY,
  offset: TOWNBOOK_OFFSET,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    closeTownBook(state, ctx);
  },
};
