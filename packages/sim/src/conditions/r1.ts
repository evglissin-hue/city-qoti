// R1 (R1D): the counts and named predicates the new feats read (docs/spec/15-progression.md, R1
// feats): businesses that grew on their own, the flavors of Food on offer, Porridge No More, Market
// Day. Pure reads of state.
import { content } from '@qoti/content';
import type { WorldState } from '../contracts';
import { familyIndex, hasTag, isFood } from '../state/zones';
import { gardenFlavors } from '../systems/hearth/garden';
import { flavorsOnOffer } from '../systems/market/balances';
import type { Binding } from './index';
import { GOOD_FAMILIES } from '../constants';

/** Standing businesses that grew on a lot, by `ref` (a trade id, def id or tag) when given. */
function grownBusinesses(state: WorldState, ref?: string) {
  return state.buildings.filter(
    (b) => b.stage === 'built' && !!b.trade && b.lot !== undefined && (ref === undefined || hasTag(b, ref)),
  );
}

/** Count 'businesses': businesses standing that nobody placed by hand. */
export function businessCount(state: WorldState, ref?: string): number {
  return grownBusinesses(state, ref).length;
}

/** Count 'businessTrades': distinct trades among them ("three kinds of workshop" with ref 'workshop'). */
export function businessTradeCount(state: WorldState, ref?: string): number {
  const seen = new Set<string>();
  for (const b of grownBusinesses(state, ref)) seen.add(b.trade!);
  return seen.size;
}

/** Count 'foodFlavors': flavors on offer in the Food family, or in the family `ref` names. */
export function foodFlavorCount(state: WorldState, ref?: string): number {
  const family = ref === undefined ? 0 : GOOD_FAMILIES.findIndex((f) => f === ref);
  return family < 0 ? 0 : flavorsOnOffer(state, ref === undefined ? familyIndex('food') : family);
}

/**
 * Porridge No More: there is a household, and every household with a home has three or more
 * flavors of Food in reach. R1 stand-in (R1A): the distinct goods it has eaten lately plus its
 * garden's flavors; R1A's household variety replaces this reading.
 */
export function porridgeNoMore(state: WorldState): boolean {
  let homes = 0;
  for (const h of state.households) {
    if (!h.homeId) continue;
    homes++;
    const flavors = new Set<number>(h.recentFoods.filter((g) => isFood(g)));
    for (const g of gardenFlavors(state, h)) flavors.add(g);
    if (flavors.size < 3) return false;
  }
  return homes > 0;
}

/**
 * Market Day: every base flavor of Food is in stock at once on the town's outlets (buildings tagged
 * 'market': stalls, shops, the market square; storehouses and the granary are outlets but not stalls). A base flavor is a Food good from the land
 * (`raw` true in content/goods.ts: grain, vegetables, fruit, fish, cheese); bread is made, so it is
 * not asked for.
 */
export function marketDay(state: WorldState, _bind?: Binding): boolean {
  const base: number[] = [];
  for (let g = 0; g < content.goods.length; g++) if (isFood(g) && content.goods[g]!.raw) base.push(g);
  if (base.length === 0) return false;
  const have = new Set<number>();
  for (const b of state.buildings) {
    if (b.stage !== 'built' || !b.rt || !hasTag(b, 'market')) continue;
    for (const g of base) if ((b.rt.store[g] ?? 0) > 0) have.add(g);
  }
  return have.size === base.length;
}
