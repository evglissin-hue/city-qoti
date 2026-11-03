// The raids system (C5D), every tick: shows a raid's signs the moment it is telegraphed, starts the
// raid at dusk on its day, runs it tick by tick to the end (run.ts), and on wolf nights lets the
// wolves prowl on the hour (wolves.ts). Outside those it returns after a few comparisons.
import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { raidStartTick } from '../threats/api';
import { raidsPossible, telegraph } from '../threats/pressure';
import { RAID_TICKS, raidTick, startRaid } from './run';
import { wolvesTick } from './wolves';

export const raids: System = {
  id: 'raids',
  order: 84,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    const s = state.threats.scheduled;
    if (s) {
      if (s.signs.length === 0) telegraph(state, ctx);
      if (!state.raid) {
        const start = raidStartTick(s);
        if (state.tick >= start && state.tick < start + RAID_TICKS && raidsPossible(state)) startRaid(state, ctx);
      }
    }
    if (state.raid) raidTick(state, ctx);
    if (state.threats.wolves.length > 0) wolvesTick(state, ctx);
  },
};
