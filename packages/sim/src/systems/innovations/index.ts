// Innovations (docs/spec/15-progression.md, Innovations). C4.0 baseline: hourly at offset 170, each
// locked innovation whose rank is reached unlocks when its condition holds. C4C adds the named
// measures behind the progress bars and the code predicates its conditions name (an unknown
// predicate is false, so nothing unlocks early), and emits innovation.updated as bars move.
import { content } from '@qoti/content';
import { TICKS_PER_HOUR } from '../../constants';
import type { System } from '../../contracts';
import { evaluate } from '../../conditions';
import { isStandard } from '../../state/hamlet';
import { rankAtLeast } from '../../state/village';
import { unlockInnovation } from './api';

export const innovations: System = {
  id: 'innovations',
  order: 92,
  every: TICKS_PER_HOUR,
  offset: 170,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    for (const s of state.innovations) {
      if (s.unlockedTick >= 0) continue;
      const def = content.innovationById.get(s.id);
      if (!def || !rankAtLeast(state, def.rank)) continue;
      if (evaluate(state, def.condition, {})) unlockInnovation(state, ctx, s.id);
    }
  },
};
