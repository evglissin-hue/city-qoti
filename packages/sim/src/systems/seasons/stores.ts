// The winter stores (C5A): what a town eats and burns through the winter. Pure: reads state.
import { content } from '@qoti/content';
import type { WorldState } from '../../contracts';
import { FOOD_GOODS } from '../../state/zones';

/** Food in town (the larder a winter is eaten from), units. R1: grain is Food (porridge). */
export function larder(state: WorldState): number {
  let n = 0;
  for (const b of state.buildings) {
    const rt = b.rt;
    if (!rt) continue;
    for (const g of FOOD_GOODS) n += (rt.store[g] ?? 0) + (rt.output[g] ?? 0);
  }
  for (const h of state.households) for (const g of FOOD_GOODS) n += h.pantry[g] ?? 0;
  return n;
}

/**
 * The larder a town can eat from (C5A, the arrivals gate). R1: every Food good is eaten as it is
 * (grain as porridge), so it is the larder whatever the days; `days` is kept for callers.
 */
export function larderWithin(state: WorldState, _days: number): number {
  return larder(state);
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
