// The thread counts' system (R3D): at midnight the door-pair counts halve and the faded ones drop, as
// the flows overlay's do (17-presentation.md, Follow the thread). The counts are written by
// recordThread (api.ts) where goods move.
import { TICKS_PER_DAY } from '../../constants';
import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { dailyOffset } from '../economy/time';

export const threads: System = {
  id: 'threads',
  order: 41,
  every: TICKS_PER_DAY,
  offset: dailyOffset(0),
  tick(state) {
    if (!isStandard(state)) return;
    // R3 stand-in (R3D): there are no counts to halve.
  },
};
