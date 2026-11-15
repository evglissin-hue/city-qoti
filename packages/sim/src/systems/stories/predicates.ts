// R1 (R1D): the story arcs' named predicates (docs/spec/11-residents.md, the [R1] note), for goals a
// JSON condition cannot say well. Registered in conditions/code.ts, one line each. Pure: reads
// state, never writes.
import type { Binding } from '../../conditions';
import type { WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { isFood } from '../../state/zones';

function param(params: readonly [string, number][], name: string, fallback: number): number {
  for (const [k, v] of params) if (k === name) return v;
  return fallback;
}

/** Odette: at least `flavors` (default 3) kinds of Food in stock at once on the bound market stall. */
export function stallFlavors(state: WorldState, bind: Binding, params: readonly [string, number][]): boolean {
  const stall = bind.market ? findById(state.buildings, bind.market) : undefined;
  if (!stall?.rt || stall.stage !== 'built') return false;
  const need = param(params, 'flavors', 3);
  let n = 0;
  for (let g = 0; g < stall.rt.store.length; g++) {
    if (isFood(g) && (stall.rt.store[g] ?? 0) > 0 && ++n >= need) return true;
  }
  return false;
}

/** Odette: the season plan has taken one of the neighbors' deals (season.setPlan checks it is on offer). */
export function seasonDeal(state: WorldState): boolean {
  return state.seasonPlan.deal !== null;
}
