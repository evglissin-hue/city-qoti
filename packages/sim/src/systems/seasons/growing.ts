// What grows when (C5A; docs/spec/14-challenge.md, Seasons): vegetable plots, orchards and herb
// gardens gather by the season (content GoodDef.seasons, permille of the gatherer's rate), nothing
// in winter. The yield hook applies it; wheat follows its own calendar (production/fields).
import { content, type BuildingDef, type ProductionMethod } from '@qoti/content';
import type { Building, WorldState } from '../../contracts';
import { seasonAt } from '../../state/seasons';

/**
 * R1B: true when a good does not come this season: its table says nothing grows (vegetables, fruit
 * and honey in winter), or it is fish while the river is frozen. Goods with no table always come.
 */
export function goodOutOfSeason(state: WorldState, good: string): boolean {
  if (good === 'fish') return state.weather.river.frozen;
  const table = content.goodById.get(good)?.seasons;
  return !!table && (table[seasonAt(state.tick).season] ?? 1000) === 0;
}

/** R1B: true in winter, when a farm's fields lie bare (grain is sown in spring and cut when golden). */
export function fieldsBare(state: WorldState): boolean {
  return seasonAt(state.tick).season === 3;
}

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
