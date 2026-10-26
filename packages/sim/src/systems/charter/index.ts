// The Charter board (docs/spec/15-progression.md, Ranks and Charters). C4.0 baseline: hourly at
// offset 160 each goal's measure is counted, the claim opens when every goal is met, and
// charter.updated goes out when anything moved. charter.claim grants the rank. C4D adds the
// County's letter when the claim opens and the rank-up moment (celebrateRank); the trial is I3.
import { content, lifePhrases } from '@qoti/content';
import { ResidentFlags, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../constants';
import type { System, TickCtx, WorldState } from '../../contracts';
import { countOf } from '../../conditions';
import { isStandard } from '../../state/hamlet';
import { fillText } from '../../view/hamlet';
import { charterView } from '../../view/village';
import { chronicle } from '../chronicle/api';
import { creditText } from '../chronicle/text';
import { addMoodModifier } from '../residents/api';

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
  // C4D: the County writes once when the last goal is met.
  const opened = ready && !c.ready;
  c.progress = progress;
  c.ready = ready;
  if (changed) ctx?.events.push({ e: 'charter.updated', c: charterView(state) });
  if (opened && ctx) {
    const lines = lifePhrases.charterReady;
    ctx.events.push({
      e: 'notify',
      kind: 'letter',
      text: fillText(lines[state.charter.history.length % lines.length]!, [['rank', rankName(def.rank)]]),
    });
  }
}

/** A rank as words: 'village', 'market town'. */
export function rankName(rank: string): string {
  return rank.replace(/[A-Z]/g, (ch) => ` ${ch.toLowerCase()}`);
}

/**
 * The rank-up moment (C4D, P40): the proclamation in the Chronicle, credited to the seats present,
 * and a town-wide spring in the step (a mood lift for two days, and everyone hops for an hour).
 */
export function celebrateRank(state: WorldState, ctx: TickCtx, rank: string, proclamation: string): void {
  chronicle(state, ctx, 'rank-up', {
    text: [
      ['proclamation', proclamation],
      ['rank', rankName(rank)],
      ['credit', creditText(state, ctx, state.time.connected)],
    ],
    seats: [...state.time.connected],
  });
  for (const r of state.residents) {
    addMoodModifier(state, r.id, { kind: 'rank-up', value: 10, ticks: 2 * TICKS_PER_DAY });
    r.flags |= ResidentFlags.hop;
  }
}
