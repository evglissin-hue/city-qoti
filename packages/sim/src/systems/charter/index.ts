// The Charter board (docs/spec/15-progression.md, Ranks and Charters). C4.0 baseline: hourly at
// offset 160 each goal's measure is counted, the claim opens when every goal is met, and
// charter.updated goes out when anything moved. charter.claim grants the rank. C4D adds the
// rank-up moment (letters, the Chronicle) and, from I3, the trial.
import { content } from '@qoti/content';
import { TICKS_PER_HOUR } from '../../constants';
import type { System, TickCtx, WorldState } from '../../contracts';
import { countOf } from '../../conditions';
import { isStandard } from '../../state/hamlet';
import { charterView } from '../../view/village';

export const charter: System = {
  id: 'charter',
  order: 94,
  every: TICKS_PER_HOUR,
  offset: 160,
  tick(state, ctx) {
    if (isStandard(state)) refreshCharter(state, ctx);
  },
};

/** Recounts the board; emits charter.updated when a value or the claim changed. */
export function refreshCharter(state: WorldState, ctx: TickCtx | null): void {
  const c = state.charter;
  const def = content.charterById.get(c.charter);
  if (!def) return;
  let changed = c.progress.length !== def.goals.length;
  let ready = true;
  const progress = def.goals.map((g, i) => {
    const v = countOf(state, g.measure.what, g.measure.ref);
    if (v !== c.progress[i]) changed = true;
    if (v < g.target) ready = false;
    return v;
  });
  if (ready !== c.ready) changed = true;
  c.progress = progress;
  c.ready = ready;
  if (changed) ctx?.events.push({ e: 'charter.updated', c: charterView(state) });
}
