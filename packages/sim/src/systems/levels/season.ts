// Out of season (docs/spec/13-ledger.md, Levels: a business resting because its raw good is out of
// season, a cider maker in winter, neither fails nor counts those days). Read from the season facts
// in seasons/growing.ts so the table of what grows when lives in one place.
import type { Building, WorldState } from '../../contracts';
import { methodOf } from '../../state/zones';
import { fieldsBare, goodOutOfSeason } from '../seasons/growing';

/**
 * True when the business's own good or its raw input does not come this season: a farm in winter,
 * a trade making or taking fruit, honey or vegetables in winter, fish while the river is frozen.
 */
export function outOfSeason(state: WorldState, b: Building): boolean {
  const m = methodOf(b);
  if (!m) return false;
  if (m.kind === 'farm' && fieldsBare(state)) return true;
  for (const [g] of m.outputs) if (goodOutOfSeason(state, g)) return true;
  for (const [g] of m.inputs) if (goodOutOfSeason(state, g)) return true;
  return false;
}
