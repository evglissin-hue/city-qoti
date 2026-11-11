// R1 views (R1.0): the five balances (R1A). The demand bars and the businesses moved to
// view/demand.ts and view/businesses.ts (R1B) on the wave's first day; this file re-exports them.
// Views may use floats freely: nothing here feeds state.
import { content } from '@qoti/content';
import { GOOD_FAMILIES, PENNIES_PER_COIN, TAB_PER_RESIDENT } from '../constants';
import type { BalanceLine, BalancesView, WorldState } from '../contracts';
import { seasonAt } from '../state/seasons';
import { GOODS_BY_FAMILY } from '../state/zones';
import { townStock } from './hamlet';

export { businessesView, businessView, isBusinessLike } from './businesses';
export { demandView, demandWhy } from './demand';

// --- Balances ----------------------------------------------------------------------------------

/**
 * Units a day the town uses of each family. R1 stand-in (R1A): Food a resident a day, Fuel a
 * household a day (the same in June as in January), Materials what open sites still need, Wares and
 * Treats the Settler basket's amounts; R1A reads every tier's basket and yesterday's use.
 */
function familyUse(state: WorldState): number[] {
  const residents = state.residents.length;
  const households = state.households.length;
  let sites = 0;
  for (const b of state.buildings) for (const n of b.rt?.construction?.needs ?? []) sites += n;
  const basket = content.basketByTier.get('settler');
  const want = (family: string): number => {
    const w = basket?.wants.find((x) => x.family === family);
    if (!w) return 0;
    return w.amount * (w.perHousehold ? households : residents);
  };
  return [residents, households, sites, want('wares'), want('treats')];
}

/** The season plan's winter mark for a family, from Summer day 4 to the end of winter; else null. */
function winterMark(state: WorldState, family: number): number | null {
  const { season, day } = seasonAt(state.tick);
  const on = (season === 1 && day >= 4) || season === 2 || season === 3;
  if (!on) return null;
  const plan = state.seasonPlan;
  if (family === 0) return plan.food ?? plan.reserve;
  if (family === 1) return plan.fuel ?? plan.reserve;
  return plan.reserve;
}

/** `balances.updated`: the five families and the carrier's purse. R1 stand-in (R1A) inside. */
export function balancesView(state: WorldState): BalancesView {
  const stock = townStock(state);
  const use = familyUse(state);
  const c = state.carrier;
  const today = c.bought.length - 1;
  const sum = (row: readonly number[] | undefined, goods: readonly number[]): number =>
    goods.reduce((t, g) => t + (row?.[g] ?? 0), 0);
  const lines: BalanceLine[] = GOOD_FAMILIES.map((family, f) => {
    const goods = GOODS_BY_FAMILY[f]!;
    const have = sum(stock, goods);
    const perDay = use[f]!;
    let weight = 0;
    let priced = 0;
    for (const g of goods) {
      const w = Math.max(1, state.market.demand[g] ?? 0);
      weight += w;
      priced += w * (state.market.prices[g] ?? content.goods[g]!.basePrice);
    }
    const terms = c.families[f]!;
    return {
      family,
      stock: have,
      use: perDay,
      cover: perDay > 0 ? Math.floor((have * 100) / perDay) : 0,
      flavors: goods.map((g) => ({
        good: content.goods[g]!.id,
        onOffer: (stock[g] ?? 0) > 0,
        made: (state.economy.everProduced[g] ?? 0) > 0,
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
      history: state.economy.stockHistory.map((row) =>
        perDay > 0 ? Math.floor((sum(row, goods) * 100) / perDay) : 0,
      ),
    };
  });
  return {
    lines,
    budget: c.budget,
    spentToday: c.spentToday,
    tab: c.tab,
    tabCap: TAB_PER_RESIDENT * PENNIES_PER_COIN * state.residents.length,
    passClosed: false,
    plan: { ...state.seasonPlan },
    offers: c.offers.map((o) => ({ ...o })),
  };
}
