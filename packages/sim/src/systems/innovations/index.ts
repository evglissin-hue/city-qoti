// Innovations (docs/spec/15-progression.md, Innovations). Hourly at offset 170: each locked
// innovation whose rank is reached updates its measure (./measures), unlocks when its condition
// holds, and sends innovation.updated when its notebook bar moved. An unlock also sends a notice
// with the innovation's blurb.
import { content } from '@qoti/content';
import { TICKS_PER_HOUR } from '../../constants';
import type { System, TickCtx, WorldState } from '../../contracts';
import { evaluate } from '../../conditions';
import { isStandard } from '../../state/hamlet';
import { rankAtLeast } from '../../state/village';
import { innovationView } from '../../view/village';
import { unlockInnovation } from './api';
import { measureProgress, tickMeasure } from './measures';

/** One hourly pass (exported for tests). */
export function updateInnovations(state: WorldState, ctx: TickCtx): void {
  for (const s of state.innovations) {
    if (s.unlockedTick >= 0) continue;
    const def = content.innovationById.get(s.id);
    if (!def || !rankAtLeast(state, def.rank)) continue;
    tickMeasure(state, def, s);
    if (evaluate(state, def.condition, {})) {
      if (unlockInnovation(state, ctx, s.id)) {
        ctx.events.push({ e: 'notify', kind: 'innovation', text: `${def.name}! ${def.blurb}` });
      }
      continue;
    }
    const progress = measureProgress(state, def, s);
    if (progress !== s.progress) {
      s.progress = progress;
      ctx.events.push({ e: 'innovation.updated', i: innovationView(state, s.id) });
    }
  }
}

export const innovations: System = {
  id: 'innovations',
  order: 92,
  every: TICKS_PER_HOUR,
  offset: 170,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    updateInnovations(state, ctx);
  },
};
