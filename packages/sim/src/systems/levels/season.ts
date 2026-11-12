// Out of season (docs/spec/13-ledger.md, Levels: a business resting because its raw good is out of
// season, a cider maker in winter, neither fails nor counts those days). Read from the season facts
// in seasons/growing.ts so the table of what grows when lives in one place. A carpenter the frozen
// Sawmill cannot saw for (one fewer while the river is frozen) waits for the thaw the same way.
import { content } from '@qoti/content';
import type { Building, WorldState } from '../../contracts';
import { methodOf } from '../../state/zones';
import { townStock } from '../../view/hamlet';
import { doorTile } from '../movement/api';
import { isFrozen } from '../seasons/api';
import { fieldsBare, goodOutOfSeason } from '../seasons/growing';
import { hasRoomFor, withinReach } from '../specialized/api';

/**
 * True when the business's own good does not come this season (a farm in winter, an orchard or
 * hives in winter, fish while the river is frozen), or its raw input does not and none is left in
 * its buffer or in town (a cider maker with the last fruit pressed), or it is a carpenter the frozen
 * Sawmill has no hands to saw for.
 */
export function outOfSeason(state: WorldState, b: Building): boolean {
  const m = methodOf(b);
  if (!m) return false;
  if (m.kind === 'farm' && fieldsBare(state)) return true;
  for (const [g] of m.outputs) if (goodOutOfSeason(state, g)) return true;
  let stock: number[] | null = null;
  for (const [id, qty] of m.inputs) {
    if (!goodOutOfSeason(state, id)) continue;
    const g = content.goodIndex.get(id);
    if (g === undefined) continue;
    if ((b.rt?.input[g] ?? 0) >= qty) continue;
    stock ??= townStock(state);
    if ((stock[g] ?? 0) <= 0) return true;
  }
  return frozenOut(state, b);
}

/**
 * True for a business of a trade that wants a Sawmill's reach while the river is frozen and no
 * Sawmill in reach has it among the first it can serve (capacityOf drops by one while frozen).
 */
export function frozenOut(state: WorldState, b: Building): boolean {
  if (!b.trade || !isFrozen(state)) return false;
  const reach = content.tradeById.get(b.trade)?.wants.reach;
  if (reach !== 'sawmill') return false;
  const door = doorTile(b);
  let inReach = false;
  for (const sb of state.buildings) {
    if (sb.def !== reach || sb.stage !== 'built' || !withinReach(state, sb, door)) continue;
    inReach = true;
    if (hasRoomFor(state, sb, b.id)) return false;
  }
  return inReach;
}
