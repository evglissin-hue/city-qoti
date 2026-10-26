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
 * of what the town wants (yesterday's market demand or use, whichever is more) plus what its
 * construction sites still wait for. 0 when covered. A site's needs count as TARGET_COVER days of
 * want spread over the cover, so a town with sites waiting on planks reads as short of planks even
 * before anyone has used one.
 */
export function shortages(state: WorldState, stock: readonly number[] = townStock(state)): number[] {
  const out = new Array<number>(content.goods.length).fill(0);
  const want = wants(state);
  for (let g = 0; g < out.length; g++) {
    const w = want[g]!;
    if (w <= 0) continue;
    const short = w * TARGET_COVER - (stock[g] ?? 0);
    if (short > 0) out[g] = Math.floor((short * 100) / w);
  }
  return out;
}

/** Units a day the town wants of each good: market demand or use, plus site needs over the cover. */
export function wants(state: WorldState): number[] {
  const n = content.goods.length;
  const demand = state.market.demand;
  const used = state.economy.yesterday.consumed;
  const waiting = new Array<number>(n).fill(0);
  for (const b of state.buildings) {
    const c = b.rt?.construction;
    if (c) for (let g = 0; g < n; g++) waiting[g]! += c.needs[g] ?? 0;
  }
  const out = new Array<number>(n);
  for (let g = 0; g < n; g++) out[g] = Math.max(demand[g] ?? 0, used[g] ?? 0) + waiting[g]! / TARGET_COVER;
  return out;
}

/**
 * Shortages a new workshop should answer: only goods the town also makes less of in a day than it
 * wants, so one shortage does not grow a workshop every night while the last one finds its feet.
 */
export function unmetShortages(state: WorldState, short: readonly number[]): number[] {
  const want = wants(state);
  const made = state.economy.yesterday.produced;
  return short.map((s, g) => (s > 0 && (made[g] ?? 0) < want[g]! ? s : 0));
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
