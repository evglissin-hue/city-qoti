// The winter stores (C5A): what a town eats and burns through the winter. Pure: reads state.
import { content, type BuildingDef } from '@qoti/content';
import { WORK_HOURS } from '../../constants';
import type { WorldState } from '../../contracts';

/** Food, wheat and flour in town (the larder a winter is eaten from), units. */
export function larder(state: WorldState): number {
  const wheat = content.goodIndex.get('wheat') ?? -1;
  const flour = content.goodIndex.get('flour') ?? -1;
  let n = 0;
  for (const b of state.buildings) {
    const rt = b.rt;
    if (!rt) continue;
    for (let g = 0; g < content.goods.length; g++) {
      if (content.goods[g]!.food || g === wheat || g === flour) n += (rt.store[g] ?? 0) + (rt.output[g] ?? 0);
    }
  }
  for (const h of state.households)
    for (let g = 0; g < content.goods.length; g++) if (content.goods[g]!.food) n += h.pantry[g] ?? 0;
  return n;
}

const breadPerDay = new Map<string, number>();

/** Bread a building bakes from flour in a full work day (0 for anything that is not a bakery). */
function bakesPerDay(def: BuildingDef): number {
  let n = breadPerDay.get(def.id);
  if (n === undefined) {
    n = 0;
    const m = def.methods?.[0];
    const bread = m?.inputs.some(([g]) => g === 'flour')
      ? (m.outputs.find(([g]) => g === 'bread')?.[1] ?? 0)
      : 0;
    if (m && bread > 0 && m.hours > 0)
      n = (bread * (WORK_HOURS[1] - WORK_HOURS[0]) * (m.perWorker ? Math.max(1, m.workers) : 1)) / m.hours;
    breadPerDay.set(def.id, n);
  }
  return n;
}

/**
 * The larder a town can eat from (C5A, the arrivals gate): its food as it stands, and its wheat and
 * flour only as far as its bakeries can bake them into bread in `days` (a barn of wheat behind one
 * bakery is a week's bread, not a winter's, and newcomers went hungry).
 */
export function larderWithin(state: WorldState, days: number): number {
  const wheat = content.goodIndex.get('wheat') ?? -1;
  const flour = content.goodIndex.get('flour') ?? -1;
  let food = 0;
  let grain = 0;
  let baking = 0;
  for (const b of state.buildings) {
    const rt = b.rt;
    if (!rt) continue;
    for (let g = 0; g < content.goods.length; g++) {
      const n = (rt.store[g] ?? 0) + (rt.output[g] ?? 0);
      if (content.goods[g]!.food) food += n;
      else if (g === wheat || g === flour) grain += n;
    }
    const def = content.buildingById.get(b.def);
    if (def && b.stage === 'built') baking += bakesPerDay(def);
  }
  for (const h of state.households)
    for (let g = 0; g < content.goods.length; g++) if (content.goods[g]!.food) food += h.pantry[g] ?? 0;
  return food + Math.min(grain, Math.floor(baking * days));
}

/** Firewood in town: storehouses, the sheds' output and the households' pantries (what a winter burns). */
export function woodpile(state: WorldState): number {
  const g = content.goodIndex.get('firewood') ?? -1;
  if (g < 0) return 0;
  let n = 0;
  for (const b of state.buildings) if (b.rt) n += (b.rt.store[g] ?? 0) + (b.rt.output[g] ?? 0);
  for (const h of state.households) n += h.pantry[g] ?? 0;
  return n;
}
