// What grows when (C5A; docs/spec/14-challenge.md, Seasons): vegetable plots, orchards and herb
// gardens gather by the season (content GoodDef.seasons, permille of the gatherer's rate), nothing
// in winter. The yield hook applies it; wheat follows its own calendar (production/fields).
import { content, type BuildingDef, type ProductionMethod } from '@qoti/content';
import type { Building, WorldState } from '../../contracts';
import { seasonAt } from '../../state/seasons';

/** Yield hook: a gatherer's first output by the season's table. */
export function seasonalGrowth(
  state: WorldState,
  _b: Building,
  _def: BuildingDef,
  method: ProductionMethod,
): number {
  if (method.kind !== 'gather') return 1000;
  const first = method.outputs[0]?.[0];
  const table = first ? content.goodById.get(first)?.seasons : undefined;
  if (!table) return 1000;
  return table[seasonAt(state.tick).season] ?? 1000;
}
