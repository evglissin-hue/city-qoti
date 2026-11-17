// Gaps: requests the town writes itself (docs/spec/19-evenings.md, Gaps). At 21:10, once the evening is
// scored, the pass keeps the evenings' runs (every rank), then reads each R2 rule from Village rank on
// a fair evening: a gap opens by rule, deduped by its subject, says what would close it, and closes by
// itself, crediting the seat that built the piece that closed it (once a place a season). The rules
// are in rules.ts, the runs in runs.ts, the bookkeeping in api.ts, who is credited in credit.ts.
import { TICKS_PER_DAY } from '../../constants';
import type { System } from '../../contracts';
import type { GapKind } from '@qoti/content';
import { gapClosable } from '../../view/health';
import { isStandard } from '../../state/hamlet';
import { seasonAt } from '../../state/seasons';
import { rankAtLeast } from '../../state/village';
import { eveningView } from '../../view/evening';
import { gapsView } from '../../view/gaps';
import { dailyOffset, dayIndex } from '../economy/time';
import { gapAchievable } from './achievable';
import { growthWaitsOnEvenings } from '../growth/evenings';
import { keepGaps, keepQuietStreets } from './rules';
import { keepRuns } from './runs';
import { keepSupplyGaps } from '../supplies/gaps';

/** 21:00 and a little: after the residents' 21:00 score (order 50) and the places' evening close (73). */
export const GAPS_OFFSET = dailyOffset(21, 10);

export const gaps: System = {
  id: 'gaps',
  order: 79,
  every: TICKS_PER_DAY,
  offset: GAPS_OFFSET,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    // A season's first day clears the credits: once a place a season, whatever tonight says.
    if (seasonAt(state.tick).day === 1) state.gaps.credited = [];
    // No evening happened today (no places yet, or a missed roll): nothing to count or to say.
    const tally = state.evenings.tonight;
    if (tally.day !== dayIndex(state.tick)) return;

    keepRuns(state);

    // Gaps open and close on fair evenings from Village rank; rain and storm hold them as they are.
    // R2X: a Hamlet whose growth waits on its evenings reads the nowhere-to-go rule too.
    const village = rankAtLeast(state, 'village');
    if (tally.weather === 'fair' && (village || growthWaitsOnEvenings(state))) {
      const pass = {
        state,
        ctx,
        changed: false,
        closable: (kind: GapKind, subject: string, tile: number) =>
          gapClosable(state, { id: 0, kind, subject, tile, openedDay: 0, n: 0 }),
      };
      if (village) {
        keepGaps(pass, (kind) => gapAchievable(state, kind));
        // R3.0: the fourth gap, a place short of supplies (R3A's rule).
        keepSupplyGaps(pass, (kind) => gapAchievable(state, kind));
      } else keepQuietStreets(pass, (kind) => gapAchievable(state, kind));
      if (pass.changed) ctx.events.push({ e: 'gaps.updated', g: gapsView(state) });
    }

    const v = eveningView(state);
    if (v) ctx.events.push({ e: 'evening.closed', v });
  },
};
