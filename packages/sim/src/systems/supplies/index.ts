// The supplies system (R3A; docs/spec/19-evenings.md, Supplies): pieces draw on the town's goods from
// Village rank, after homes and businesses, only above the reserves and winter marks. Once a day at the
// settling (`SUPPLIES.settleHour`:`settleMinute`, 17:30) it decides tonight's lit lanterns and their
// reach ticks (stock and priority only, never staffing), burns a night of each household's candle, and
// keeps the pieces' records; at `outHour` (07:00) the lamps go out by themselves (decorLit reads the
// hour) and the view says so. Where it runs in the day: docs/build/r3-wave-notes.md.
import { TICKS_PER_HOUR } from '../../constants';
import type { System } from '../../contracts';
import { content } from '@qoti/content';
import { isStandard } from '../../state/hamlet';
import { dailyOffset } from '../economy/time';

/** The settling's offset in the day's ticks (17:30), a multiple of the system's half hour. */
export const SUPPLIES_OFFSET = dailyOffset(
  content.supplies.settleHour,
  Math.round((content.supplies.settleMinute * TICKS_PER_HOUR) / 60),
);

export const supplies: System = {
  id: 'supplies',
  order: 57,
  // Every half hour, so the settling (17:30) and the lamps out (07:00) each land on a run; R3A may
  // narrow it.
  every: TICKS_PER_HOUR / 2,
  offset: 0,
  tick(state) {
    if (!isStandard(state)) return;
    // R3 stand-in (R3A): no settling yet. Every lantern is lit from 18:00 to 07:00 (decorLit), nothing
    // rests, and no candle burns.
  },
};
