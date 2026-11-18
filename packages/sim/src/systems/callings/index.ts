// The callings system (R3C; docs/spec/15-progression.md, Callings), back in its old slot (88). Daily at
// 15:00: Garden Village's day visitors spend in the town (TOWN_BOOK.visitors, booked as visitors). The
// calling itself is earned by the Town Book (systems/townbook) when three pages of a leaning are found;
// no command picks one.
import { content } from '@qoti/content';
import { TICKS_PER_DAY } from '../../constants';
import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { dailyOffset } from '../economy/time';

export const callings: System = {
  id: 'callings',
  order: 88,
  every: TICKS_PER_DAY,
  offset: dailyOffset(content.townBook.visitors.hour),
  tick(state) {
    if (!isStandard(state)) return;
    // R3 stand-in (R3C): no calling is earned, so no visitors come.
  },
};
