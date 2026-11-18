// The masters system (R3B; docs/spec/19-evenings.md, Masters). Daily at 23:45, after the levels pass
// (23:30): working days by trade (`Resident.craft`), becoming a master (four hearts and twenty days in
// one trade, in a business of level 2 or more or at a specialized building; one new master a trade a
// season, by days then id, no dice), apprentices, and losing one (a household leaving, retiring).
// Where it runs in the day: docs/build/r3-wave-notes.md.
import { TICKS_PER_DAY } from '../../constants';
import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { dailyOffset } from '../economy/time';

export const MASTERS_OFFSET = dailyOffset(23, 150);

export const masters: System = {
  id: 'masters',
  order: 87,
  every: TICKS_PER_DAY,
  offset: MASTERS_OFFSET,
  tick(state) {
    if (!isStandard(state)) return;
    // R3 stand-in (R3B): no working days are counted and nobody becomes a master.
  },
};
