// The carrier (docs/spec/13-ledger.md, The carrier and trade; R1A builds it): the peddler grown up,
// a cart at the valley gate at 10:00 every day the pass is open, and the boat once a dock stands.
// It buys what a family is short of its reserve and sells what is over twice it, within the
// family's rule, the day's budget and what it can carry, and books both as imports and exports.
//
// R1 stand-in (R1A), as R1.0 wrote it: today's peddler mapped onto families with the default rules.
// - At 10:00 it rolls `carrier.bought` and `.sold` (the oldest day drops, today starts at zero) and
//   zeroes `spentToday`.
// - Units it may carry today: PEDDLER_TERMS.units, or 40 at TRADE_BUY_PERCENT and
//   TRADE_SELL_PERCENT once a Trading Post stands (the peddler's 140% and 60% before).
// - Buying, Food, Fuel, Materials, Wares, Treats in that order: Always buys up to the reserve (days
//   of the family's use: Food a resident a day, Fuel a household a day, Wares and Treats the Settler
//   basket; Materials: what open sites still need beyond stock, plus the reserve in units).
//   Essentials, for Materials, buys only what open sites wait for beyond stock; for the other
//   families it buys nothing yet. Never buys nothing. Within a family it takes the cheapest good a
//   neighbor sells, unit by unit, while the budget and the treasury's credit line hold; the goods go
//   to the nearest store with room (stowNearest), each unit nudging that neighbor's price.
// - Selling, with what load is left: a family with `sell` on and a rule other than Never sells what
//   is over twice the reserve, the good it holds most of first, to the neighbor paying most; never
//   what a festival put by.
// - No County tab, no deals, no boat, no closed pass and no winter marks yet: R1A's.
import { content } from '@qoti/content';
import { CARRIER_DAYS, CARRIER_HOUR, GOOD_FAMILIES, IMPACT_PER_UNIT, MAP_SIZE, TICKS_PER_DAY } from '../../constants';
import type { Building, System, TickCtx, WorldState } from '../../contracts';
import { goodsArray, isStandard } from '../../state/hamlet';
import { GOODS_BY_FAMILY } from '../../state/zones';
import { townStock } from '../../view/hamlet';
import { tradeView } from '../../view/village';
import { balancesView } from '../../view/zones';
import { book } from '../economy/api';
import { coinsText, listText } from '../economy';
import { emitMoney, emitReports } from '../economy/emit';
import { dailyOffset } from '../economy/time';
import { overdraftLimit } from '../loans/credit';
import { defOf, isStorehouse, stowNearest } from '../logistics/stores';
import { bestNeighbor, carrierTerms, logTrade, nudge } from './terms';

/** Goods the carrier never carries for households: only ever an input (wool, the weaver's). */
const INPUT_ONLY: ReadonlySet<string> = new Set(['wool']);

/** Family indexes, in GOOD_FAMILIES order. */
const FOOD = 0;
const FUEL = 1;
const MATERIALS = 2;
const WARES = 3;
const TREATS = 4;

/** Units a day the town uses of a family (R1 stand-in (R1A): the header's simple measure). */
function useOf(state: WorldState, family: number): number {
  if (family === FOOD) return state.residents.length;
  if (family === FUEL) return state.households.length;
  if (family === WARES || family === TREATS) {
    const want = content.basketByTier.get('settler')?.wants.find((w) => w.family === GOOD_FAMILIES[family]);
    if (!want) return 0;
    const n = want.perHousehold ? state.households.length : state.residents.length;
    return Math.ceil(want.amount * n);
  }
  return 0;
}

/** Units of each good open construction sites still wait for. */
function siteNeeds(state: WorldState): number[] {
  const out = goodsArray();
  for (const b of state.buildings) {
    const c = b.rt?.construction;
    if (c) for (let g = 0; g < out.length; g++) out[g]! += c.needs[g] ?? 0;
  }
  return out;
}

/** The family's reserve in units: days of use, or (Materials) what sites need plus the reserve. */
function reserveUnits(state: WorldState, family: number, needs: readonly number[]): number {
  const terms = state.carrier.families[family]!;
  if (family === MATERIALS) {
    let n = 0;
    for (const g of GOODS_BY_FAMILY[MATERIALS]!) n += needs[g] ?? 0;
    return n + terms.reserve;
  }
  return terms.reserve * useOf(state, family);
}

interface Day {
  /** Units still to carry today. */
  room: number;
  /** Pennies paid today, against the budget. */
  spent: number;
  /** Pennies taken today. */
  earned: number;
  bought: number[];
  sold: number[];
  /** [neighbor, good, units, pennies] per deal, for the trade log. */
  deals: [string, number, number, number][];
}

function addDeal(day: Day, neighbor: string, good: number, qty: number, pennies: number): void {
  const d = day.deals.find(([n, g]) => n === neighbor && g === good);
  if (d) {
    d[2] += qty;
    d[3] += pennies;
  } else day.deals.push([neighbor, good, qty, pennies]);
}

/** Buys one unit of a good from the cheapest neighbor. False when it cannot (price, budget, room). */
function buyOne(state: WorldState, day: Day, good: number, gate: number): boolean {
  if (day.room <= 0) return false;
  const best = bestNeighbor(state, good, false);
  if (!best) return false;
  const c = state.carrier;
  if (c.spentToday + day.spent + best.price > c.budget) return false;
  if (state.economy.treasury - day.spent - best.price < -overdraftLimit(state)) return false;
  if (stowNearest(state, gate, good, 1, 0) < 1) return false;
  day.spent += best.price;
  day.room--;
  day.bought[good]! += 1;
  addDeal(day, best.n.id, good, 1, -best.price);
  nudge(best.n, good, IMPACT_PER_UNIT);
  return true;
}

/** The cheapest good of a list a neighbor sells today, or -1. */
function cheapest(state: WorldState, goods: readonly number[]): number {
  let best = -1;
  let bestPrice = Infinity;
  for (const g of goods) {
    const p = bestNeighbor(state, g, false)?.price;
    if (p !== undefined && p < bestPrice) {
      bestPrice = p;
      best = g;
    }
  }
  return best;
}

/** Storehouses the carrier loads from (stores, not shelves), by id. */
function stores(state: WorldState): Building[] {
  return state.buildings.filter((b) => b.stage === 'built' && b.rt && isStorehouse(defOf(b)));
}

function free(b: Building, good: number): number {
  return Math.max(0, b.rt!.store[good]! - b.rt!.reservedOut[good]!);
}

/** Sells one unit of a good from the stores to the neighbor paying most. False when it cannot. */
function sellOne(state: WorldState, day: Day, good: number, houses: readonly Building[]): boolean {
  if (day.room <= 0) return false;
  const best = bestNeighbor(state, good, true);
  if (!best) return false;
  let from: Building | null = null;
  for (const h of houses) if (free(h, good) > 0 && (!from || free(h, good) > free(from, good))) from = h;
  if (!from) return false;
  from.rt!.store[good]! -= 1;
  day.earned += best.price;
  day.room--;
  day.sold[good]! += 1;
  addDeal(day, best.n.id, good, -1, best.price);
  nudge(best.n, good, -IMPACT_PER_UNIT);
  return true;
}

/** What the family holds in town, units. */
function familyStock(stock: readonly number[], family: number): number {
  let n = 0;
  for (const g of GOODS_BY_FAMILY[family]!) n += stock[g] ?? 0;
  return n;
}

/** Rolls the carrier's record a day on: the oldest day drops, today starts at zero. */
function rollDay(state: WorldState): void {
  const c = state.carrier;
  const n = content.goods.length;
  c.bought.push(new Array<number>(n).fill(0));
  c.sold.push(new Array<number>(n).fill(0));
  while (c.bought.length > CARRIER_DAYS) c.bought.shift();
  while (c.sold.length > CARRIER_DAYS) c.sold.shift();
  c.spentToday = 0;
}

/** The goods text of a notice: "12 grain and 4 timber". */
function goodsText(units: readonly number[]): string {
  const parts: string[] = [];
  for (let g = 0; g < units.length; g++) {
    if (units[g]) parts.push(`${units[g]} ${content.goods[g]!.name.toLowerCase()}`);
  }
  return listText(parts);
}

/** The 10:00 visit. R1 stand-in (R1A): the header's rules, families in order. */
export function carrierDay(state: WorldState, ctx: TickCtx): void {
  rollDay(state);
  const terms = carrierTerms(state);
  const n = content.goods.length;
  const day: Day = {
    room: terms.units,
    spent: 0,
    earned: 0,
    bought: new Array<number>(n).fill(0),
    sold: new Array<number>(n).fill(0),
    deals: [],
  };
  const [gx, gz] = state.meta.valleyGate;
  const gate = Math.min(MAP_SIZE - 1, gz) * MAP_SIZE + Math.min(MAP_SIZE - 1, gx);
  const stock = townStock(state);
  const needs = siteNeeds(state);
  const families = state.carrier.families;

  // Buying: shortfalls first, family by family.
  for (let f = 0; f < families.length && day.room > 0; f++) {
    const rule = families[f]!.rule;
    if (rule === 'never') continue;
    const goods = GOODS_BY_FAMILY[f]!.filter((g) => !INPUT_ONLY.has(content.goods[g]!.id));
    if (f === MATERIALS) {
      // What open sites wait for beyond stock, good by good.
      for (const g of goods) {
        let want = (needs[g] ?? 0) - (stock[g] ?? 0) - day.bought[g]!;
        while (want > 0 && buyOne(state, day, g, gate)) want--;
      }
      if (rule !== 'always') continue;
    } else if (rule !== 'always') continue;
    let want = reserveUnits(state, f, needs) - familyStock(stock, f) - familyStock(day.bought, f);
    while (want > 0) {
      const g = cheapest(state, goods);
      if (g < 0 || !buyOne(state, day, g, gate)) break;
      want--;
    }
  }

  // Selling, with the load that is left: what is over twice the reserve.
  const houses = stores(state);
  for (let f = 0; f < families.length && day.room > 0; f++) {
    const terms = families[f]!;
    if (!terms.sell || terms.rule === 'never') continue;
    let over = familyStock(stock, f) + familyStock(day.bought, f) - 2 * reserveUnits(state, f, needs);
    const goods = GOODS_BY_FAMILY[f]!;
    while (over > 0 && day.room > 0) {
      // The good it holds most of, that a neighbor buys (ties to the first in goods order).
      let good = -1;
      let most = 0;
      for (const g of goods) {
        if (!bestNeighbor(state, g, true)) continue;
        let have = 0;
        for (const h of houses) have += free(h, g);
        if (have > most) {
          most = have;
          good = g;
        }
      }
      if (good < 0 || !sellOne(state, day, good, houses)) break;
      over--;
    }
  }

  // Books, record and log.
  const c = state.carrier;
  const today = c.bought.length - 1;
  for (let g = 0; g < n; g++) {
    c.bought[today]![g]! += day.bought[g]!;
    c.sold[today]![g]! += day.sold[g]!;
  }
  c.spentToday += day.spent;
  if (day.spent > 0) book(state, 'imports', day.spent);
  if (day.earned > 0) book(state, 'exports', day.earned);
  day.deals.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
  for (const [neighbor, good, qty, pennies] of day.deals) logTrade(state, neighbor, good, qty, pennies);

  const lines: string[] = [];
  if (day.spent > 0)
    lines.push(`The carrier left ${goodsText(day.bought)} at the gate and took ${coinsText(day.spent)} for it.`);
  if (day.earned > 0)
    lines.push(`It rattled off with ${goodsText(day.sold)}, leaving ${coinsText(day.earned)} behind.`);
  if (lines.length > 0) {
    ctx.events.push({
      e: 'notify',
      kind: 'carrier',
      text: lines.join(' '),
      at: [Math.min(MAP_SIZE - 1, gx), Math.min(MAP_SIZE - 1, gz)],
    });
    emitMoney(state, ctx);
    emitReports(state, ctx, false);
    ctx.events.push({ e: 'trade.updated', t: tradeView(state) });
  }
  ctx.events.push({ e: 'balances.updated', b: balancesView(state) });
}

export const carrier: System = {
  id: 'carrier',
  order: 65,
  every: TICKS_PER_DAY,
  offset: dailyOffset(CARRIER_HOUR),
  tick(state, ctx) {
    if (!isStandard(state)) return;
    carrierDay(state, ctx);
  },
};
