// Business levels (docs/spec/13-ledger.md, Levels; R1B builds it). Daily at 23:30, after the day's
// selling: a business moves up a level after three days running of steady custom, reliable inputs
// and room to grow (and, for level 3, its keeper's 20 working days until R3's masters); it slides
// back one level after four failing days, keeping its walls. Specialized buildings stay at 1.
import { TICKS_PER_DAY } from '../../constants';
import type { System } from '../../contracts';
import { dailyOffset } from '../economy/time';

export const levels: System = {
  id: 'levels',
  order: 69,
  every: TICKS_PER_DAY,
  offset: dailyOffset(23, 100),
  // R1 stand-in (R1B): businesses stay at level 1 and their counters are not kept yet.
  tick() {},
};
