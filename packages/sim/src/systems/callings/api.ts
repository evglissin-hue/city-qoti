// Callings API (docs/spec/15-progression.md, Callings). The offer is made once, when the Village
// Charter is claimed, from the map as it stands then; the choice is made once, by either seat (both
// present in a valley for two). Everything that reads the choice goes through chosenCalling.
import { callingPhrases, callingTuning, content, type CallingDef } from '@qoti/content';
import { dayIndex } from '../economy/time';
import type { CallingState, TickCtx, WorldState } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { rankAtLeast } from '../../state/village';
import { fillText } from '../../view/hamlet';
import { charterView } from '../../view/village';
import { scoreCallings, type CallingScore } from './score';

export { chosenCalling, hasCalling, offerOpen } from './chosen';

/** "Your hills are full of stone, and your river never sits still." From the two strongest factors. */
export function reasonFor(def: CallingDef, score: CallingScore): string {
  const order = score.factors
    .map((v, i) => ({ v, i }))
    .sort((a, b) => b.v - a.v || a.i - b.i)
    .slice(0, 2)
    .sort((a, b) => a.i - b.i)
    .map((x) => def.reasons[x.i] ?? '');
  const [first, second] = order;
  const text = second ? `your ${first}, and your ${second}` : `your ${first}`;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/** Scores the map and returns the offer: the best `offered` callings, ties by id. */
export function makeOffer(state: WorldState): CallingState {
  const best = scoreCallings(state).slice(0, callingTuning.offered);
  return {
    offered: best.map((s) => s.id),
    reasons: best.map((s) => reasonFor(content.callingById.get(s.id)!, s)),
    chosen: null,
    day: dayIndex(state.tick),
  };
}

/**
 * Asks once: when a standard valley holds Village rank or more and has no offer yet, scores the map,
 * stores the offer and has the County write. Later calls change nothing.
 */
export function ensureOffer(state: WorldState, ctx: TickCtx | null): void {
  if (state.calling || !isStandard(state) || !rankAtLeast(state, 'village')) return;
  if (content.callings.length === 0) return;
  state.calling = makeOffer(state);
  if (!ctx) return;
  const [a, b] = state.calling.offered.map((id) => content.callingById.get(id)!.name);
  const [ra, rb] = state.calling.reasons;
  ctx.events.push({
    e: 'notify',
    kind: 'letter',
    text: fillText(callingPhrases.offer, [
      ['town', state.settings.townName],
      ['a', a ?? ''],
      ['ra', ra ?? ''],
      ['b', b ?? ''],
      ['rb', rb ?? ''],
    ]),
  });
  ctx.events.push({ e: 'charter.updated', c: charterView(state) });
}
