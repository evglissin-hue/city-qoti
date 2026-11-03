// The habitats system slot (C5.0; C5C owns it): at 02:00 scores the six habitats for the chunks that
// changed and a rolling sixth of the map, sends habitats.updated for those that moved, then works
// out today's summer pests per crop grower. Returns at once in sandbox valleys.
import { TICKS_PER_DAY } from '../../constants';
import type { System } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { dailyOffset } from '../economy/time';
import { updatePests } from '../nature/effects';
import { updateHabitats } from '../nature/habitats';
import { refreshHints } from '../nature/wildlife';

export const habitats: System = {
  id: 'habitats',
  order: 76,
  every: TICKS_PER_DAY,
  offset: dailyOffset(2),
  tick(state, ctx) {
    if (!isStandard(state)) return;
    updateHabitats(state, ctx);
    updatePests(state);
    if (state.nature.hints.length === 0 && state.nature.guide.length < ctx.content.wildlife.length) {
      refreshHints(state);
    }
  },
};
