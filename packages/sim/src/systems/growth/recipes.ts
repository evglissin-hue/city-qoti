// What grown crafts make and grown farms grow (docs/spec/13-ledger.md, Zoning and growth): the
// method whose outputs the town is shortest of, among those it can feed. A craft whose inputs the
// valley has never seen waits; farms weigh the soil too. The Ledger can pin a method
// (build.pinRecipe), and a pinned building never changes its mind.
import type { BuildingDef, ProductionMethod } from '@qoti/content';
import { content } from '@qoti/content';
import { TARGET_COVER } from '../../constants';
import type { WorldState } from '../../contracts';
import { townStock } from '../../view/hamlet';

/**
 * Shortage per good in hundredths of a day: how far town stock falls short of TARGET_COVER days
 * of what the town wants (yesterday's market demand or use, whichever is more). 0 when covered.
 */
export function shortages(state: WorldState, stock: readonly number[] = townStock(state)): number[] {
  const out = new Array<number>(content.goods.length).fill(0);
  const demand = state.market.demand;
  const used = state.economy.yesterday.consumed;
  for (let g = 0; g < out.length; g++) {
    const want = Math.max(demand[g] ?? 0, used[g] ?? 0);
    if (want <= 0) continue;
    const short = want * TARGET_COVER - (stock[g] ?? 0);
    if (short > 0) out[g] = Math.floor((short * 100) / want);
  }
  return out;
}

/** True when the town has the method's inputs, or at least makes them. */
function canFeed(state: WorldState, method: ProductionMethod, stock: readonly number[]): boolean {
  for (const [id] of method.inputs) {
    const g = content.goodIndex.get(id);
    if (g === undefined) return false;
    if ((stock[g] ?? 0) <= 0 && (state.economy.everProduced[g] ?? 0) <= 0) return false;
  }
  return true;
}

/**
 * How much the town wants a method run now: the shortage of its outputs, 0 when it cannot be fed.
 * Farm methods are scaled by the soil (fertility 0 to 100 gives half to full weight).
 */
export function methodScore(
  state: WorldState,
  method: ProductionMethod,
  short: readonly number[],
  stock: readonly number[],
  fertility = 100,
): number {
  if (!canFeed(state, method, stock)) return 0;
  let s = 0;
  for (const [id] of method.outputs) {
    const g = content.goodIndex.get(id);
    if (g !== undefined) s += short[g] ?? 0;
  }
  if (method.kind === 'farm' || method.kind === 'plant') s = Math.floor((s * (50 + fertility / 2)) / 100);
  return s;
}

/** The best method index of a def and its score (the first method on ties; -1 when it has none). */
export function bestMethod(
  state: WorldState,
  def: BuildingDef,
  short: readonly number[],
  stock: readonly number[],
  fertility = 100,
): [index: number, score: number] {
  const methods = def.methods ?? [];
  let best = methods.length > 0 ? 0 : -1;
  let bestScore = -1;
  for (let k = 0; k < methods.length; k++) {
    const s = methodScore(state, methods[k]!, short, stock, fertility);
    if (s > bestScore) {
      bestScore = s;
      best = k;
    }
  }
  return [best, Math.max(0, bestScore)];
}

/** A grown building changes method only when the new one is wanted this much more (half a day short). */
export const SWITCH_MARGIN = 50;
