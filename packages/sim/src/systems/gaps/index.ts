// Gaps: requests the town writes itself (docs/spec/19-evenings.md, Gaps). At 21:00, once the evening
// is scored, each R2 rule is read over the evenings running: a gap opens from Village rank, deduped by
// its subject, says what would close it, and closes by itself, crediting the seat that built the piece
// that closed it (once a place a season). R2C writes the rules; the bookkeeping is in api.ts.
import { TICKS_PER_DAY } from '../../constants';
import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { dailyOffset } from '../economy/time';

/** 21:00 and a little: after the residents' 21:00 score (order 50) and the places' evening close (73). */
export const GAPS_OFFSET = dailyOffset(21, 10);

export const gaps: System = {
  id: 'gaps',
  order: 79,
  every: TICKS_PER_DAY,
  offset: GAPS_OFFSET,
  tick(state) {
    if (!isStandard(state)) return;
    // R2 stand-in (R2C): opens no gaps and closes none; no evening.closed yet. R2C reads the rules
    // (content.gaps) from Village rank, opens and closes through openGap and closeGap, keeps the
    // runs in state.evenings, and emits gaps.updated and evening.closed.
  },
};
