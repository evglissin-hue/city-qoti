// The Balances view (docs/spec/13-ledger.md, Reports: Balances; R1A owns it). Views may use floats
// freely: nothing here feeds state. One line a family, in GOOD_FAMILIES order:
// - stock: units across the town, with Food and Fuel in the pantries (familyStock of balanceStock);
// - use: units the town uses a day (familyUse); cover: days of cover in hundredths (familyCover);
// - flavors: one per shelf good of the family in goods order (wool is never listed): `onOffer` when
//   a household saw it in the last three days, `made` when a built building's method outputs it,
//   `stock` its units;
// - price: pennies, the family's shelf goods' market prices averaged and weighted by what
//   households bought yesterday (a plain average when nothing was bought);
// - carriedIn and carriedOut: the carrier's units today and yesterday;
// - rule, reserve, sell: the carrier's terms; mark: the season plan's winter mark, or null;
// - history: the family's cover in hundredths at each day's end, oldest first, up to a year.
// Around the lines: the carrier's budget and spend today, the County tab and its cap, whether the
// pass is closed, the season plan and the deal offers.
import { content } from '@qoti/content';
import { GOOD_FAMILIES, PENNIES_PER_COIN, TAB_PER_RESIDENT } from '../constants';
import type { BalanceLine, BalancesView, WorldState } from '../contracts';
import { methodOf } from '../state/zones';
import { passClosed, winterMark } from '../systems/carrier/api';
import {
  balanceStock,
  familyCover,
  familyStock,
  familyUses,
  onOfferGoods,
  SHELF_GOODS,
} from '../systems/market/balances';

/** `balances.updated`: the five families and the carrier's purse. */
export function balancesView(
  state: WorldState,
  pre?: { stock?: readonly number[]; uses?: readonly number[]; made?: readonly string[] },
): BalancesView {
  // The carrier passes what it already worked out on its visit (its running stock and the uses).
  const stock = pre?.stock ?? balanceStock(state);
  const offered = onOfferGoods(state);
  const uses = pre?.uses ?? familyUses(state);
  const c = state.carrier;
  const today = c.bought.length - 1;
  const sum = (row: readonly number[] | undefined, goods: readonly number[]): number =>
    goods.reduce((t, g) => t + (row?.[g] ?? 0), 0);
  const made = new Set<string>(pre?.made ?? madeGoods(state));
  const bought = state.market.bought;
  const lines: BalanceLine[] = GOOD_FAMILIES.map((family, f) => {
    const goods = SHELF_GOODS[f]!;
    const terms = c.families[f]!;
    const priceOf = (g: number): number => state.market.prices[g] ?? content.goods[g]!.basePrice;
    let weight = 0;
    let priced = 0;
    for (const g of goods) {
      const w = bought?.[g] ?? 0;
      weight += w;
      priced += w * priceOf(g);
    }
    if (weight === 0) {
      for (const g of goods) priced += priceOf(g);
      weight = goods.length;
    }
    return {
      family,
      stock: familyStock(stock, f),
      use: Math.ceil(uses[f]! / 100),
      cover: familyCover(state, f, stock, uses[f]),
      flavors: goods.map((g) => ({
        good: content.goods[g]!.id,
        onOffer: offered[g] === true,
        made: made.has(content.goods[g]!.id),
        stock: stock[g] ?? 0,
      })),
      price: weight > 0 ? Math.round(priced / weight) : 0,
      carriedIn: sum(c.bought[today], goods),
      carriedOut: sum(c.sold[today], goods),
      carriedInYesterday: sum(c.bought[today - 1], goods),
      carriedOutYesterday: sum(c.sold[today - 1], goods),
      rule: terms.rule,
      reserve: terms.reserve,
      sell: terms.sell,
      mark: winterMark(state, f),
      history: (c.history ?? []).map((row) => row[f] ?? 0),
    };
  });
  return {
    lines,
    budget: c.budget,
    spentToday: c.spentToday,
    tab: c.tab,
    tabCap: TAB_PER_RESIDENT * PENNIES_PER_COIN * state.residents.length,
    passClosed: passClosed(state),
    plan: { ...state.seasonPlan },
    offers: c.offers.map((o) => ({ ...o })),
  };
}

/** Goods some built building makes (a business's trade or a specialized building's method), by id. */
export function madeGoods(state: WorldState): string[] {
  const made = new Set<string>();
  for (const b of state.buildings) {
    if (b.stage !== 'built' || !(b.trade || content.buildingById.get(b.def)?.methods)) continue;
    for (const [good] of methodOf(b)?.outputs ?? []) made.add(good);
  }
  return [...made];
}
