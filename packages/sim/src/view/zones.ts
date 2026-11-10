// R1 views (R1.0): demand bars, the five balances and the businesses. These builders are stand-ins
// that read what exists in R1.0; R1A (balances) and R1B (demand, businesses) replace their insides,
// keeping the shapes in contracts/zones.ts. Views may use floats freely: nothing here feeds state.
import { content } from '@qoti/content';
import { DEMAND_KINDS, GOOD_FAMILIES, PENNIES_PER_COIN, TAB_PER_RESIDENT } from '../constants';
import type {
  BalanceLine,
  BalancesView,
  Building,
  BusinessView,
  DemandBarView,
  DemandReason,
  DemandView,
  WorldState,
} from '../contracts';
import { seasonAt } from '../state/seasons';
import { GOODS_BY_FAMILY, hasTag, jobsOf, levelOf } from '../state/zones';
import { townStock } from './hamlet';

// --- Demand ------------------------------------------------------------------------------------

const goodName = (id: string | undefined): string => content.goodById.get(id ?? '')?.name ?? 'Something';
const lower = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/** One reason in words, for a bar's hover text. */
export function demandWhy(r: DemandReason): string {
  switch (r.code) {
    case 'newcomers':
      return 'Newcomers would come: there is work, and the town draws them.';
    case 'noOutlet':
      return `${r.value ?? 'Some'} households have no shop in reach.`;
    case 'crowded':
      return 'Every shop already serves more than eight households.';
    case 'short':
      return r.from
        ? `${goodName(r.good)} is short and ${lower(goodName(r.from))} is plentiful.`
        : `${goodName(r.good)} is short.`;
    case 'firstMaker':
      return `Nobody makes ${lower(goodName(r.good))} yet, and ${lower(goodName(r.from))} is made here.`;
    case 'foodCover':
      return 'Food is under four days of cover.';
    case 'imported':
      return `More than a third of the ${lower(goodName(r.good))} comes by carrier.`;
    case 'needsLand':
      return 'The town needs more zoned land for it.';
    case 'lotWaiting':
      return 'A lot is free and waiting: growth is on its way.';
  }
}

/** `demand.updated`: the four bars as the growth pass left them. */
export function demandView(state: WorldState): DemandView {
  const d = state.demand;
  const bars: DemandBarView[] = DEMAND_KINDS.map((kind, i) => {
    const reasons = d.reasons[i] ?? [];
    return { kind, value: d.bars[i] ?? 0, lit: d.lit[i] ?? false, reasons, why: reasons.map(demandWhy) };
  });
  return { bars };
}

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

// --- Businesses --------------------------------------------------------------------------------

/** True for a business or a specialized building: what the Businesses book lists. */
export function isBusinessLike(b: Building): boolean {
  return !!b.trade || !!content.buildingById.get(b.def)?.specialized;
}

/** Door distance (Manhattan, between footprint corners) a reach is measured in, for the stand-in. */
function near(a: Building, b: Building, reach: number): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z) <= reach;
}

/** A status in words. R1 stand-in (R1B): from the stage and who is at work. */
function statusWords(b: Building): string {
  if (b.stage === 'construction') return 'Going up';
  const rt = b.rt;
  if (!rt) return 'Standing';
  if (rt.paused) return 'Paused';
  if (rt.workers.length === 0 && jobsOf(b) > 0) return 'Waiting for hands';
  if (rt.present > 0) return 'At work';
  return 'Resting';
}

/** `business.updated`: one business or specialized building. */
export function businessView(state: WorldState, b: Building): BusinessView {
  const def = content.buildingById.get(b.def);
  const view: BusinessView = {
    id: b.id,
    def: b.def,
    trade: b.trade ?? null,
    level: levelOf(b),
    keeperId: b.keeperId ?? 0,
    pinned: !!b.pinned,
    hands: b.rt?.workers.length ?? 0,
    crew: jobsOf(b),
    status: statusWords(b),
    levelDays: b.counters?.levelDays ?? 0,
  };
  if (def?.capacity && def.enables?.length) {
    let count = 0;
    for (const o of state.buildings) {
      if (o.id !== b.id && def.enables.some((t) => hasTag(o, t)) && near(o, b, def.reach ?? 24)) count++;
    }
    view.served = { count, capacity: def.capacity };
  }
  return view;
}

/** Every business and specialized building, sorted by id. */
export function businessesView(state: WorldState): BusinessView[] {
  return state.buildings.filter(isBusinessLike).map((b) => businessView(state, b));
}
