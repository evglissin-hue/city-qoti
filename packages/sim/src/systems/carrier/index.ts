// The carrier (docs/spec/13-ledger.md, The carrier and trade): the peddler grown up, a cart at the
// valley gate at 10:00 every day the pass is open, and the boat from Millhaven every three days once
// a River Dock stands and while the river runs. It buys what a family is short of and sells what is
// over twice its reserve, within the family's rule, the day's budget and what it can carry, and
// books both as imports and exports (the money invariant: book() only).
//
// The visit, in order:
// 1. The record rolls a day (`bought`, `sold`, `spentToday`). While snow closes the pass the cart
//    does not come (the boat, held by the ice in winter, keeps its own rule).
// 2. Essentials, in the fixed order, for every family whose rule is not Never: Food the town would
//    go without today (under a day's eating, counting pantries), Fuel likewise on a winter day,
//    Materials an open site waits for beyond stock, and raw goods a maker is resting for (a baker
//    with no grain), under the rule for the family of what it makes. Essentials are always carried:
//    the day's budget does not cap them. The treasury pays while it can (within the County Bank's
//    credit line); past that, Food and Fuel for households and a maker's raw good still come on the
//    County tab, up to TAB_PER_RESIDENT coins a resident, and past the cap nothing comes and the
//    town goes short (a site's Materials never go on the tab: lean times stop building anyway).
// 3. The tab is paid down from what is left of the day's budget.
// 4. For families on Always, in the order Food, Fuel, Materials, Wares, Treats, within the day's
//    budget: first a share of each flavor some tier in town still lacks (the cheapest not on offer),
//    in every family before any bulk, so variety never waits behind another family's reserve; then
//    each reserve, the cheapest unit by unit, up to days of the family's use (Materials: what open
//    sites need plus the reserve in units). From Autumn day 4 to the thaw it buys toward the season
//    plan's winter mark when that is more.
// 5. Selling, with the load that is left, for families with `sell` on and a rule other than Never:
//    what is over twice the reserve (from Summer day 4 to the thaw, never under the winter mark),
//    the flavor the stores hold most of first. A festival's put-by goods are out of the stores, so
//    they are never sold.
//
// Every unit goes by the cheaper of the cart and the boat that day (the boat only to Millhaven),
// nudging that neighbor's price, and lands in the store nearest the gate (the dock for the boat)
// with room for its family. Goods are stowed once per good at the end of the visit.
import { content, type BuildingDef } from '@qoti/content';
import {
  CARRIER_DAYS,
  CARRIER_HOUR,
  IMPACT_PER_UNIT,
  MAP_SIZE,
  PENNIES_PER_COIN,
  TAB_PER_RESIDENT,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  WARMTH_PER_HOUSEHOLD,
} from '../../constants';
import type { Building, DealOffer, NeighborState, System, TickCtx, WorldState } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { seasonAt } from '../../state/seasons';
import { GOODS_BY_FAMILY, methodOf } from '../../state/zones';
import { balancesView } from '../../view/balances';
import { townStock } from '../../view/hamlet';
import { dockView } from '../../view/seasons';
import { tradeView } from '../../view/village';
import { book } from '../economy/api';
import { coinsText, listText } from '../economy';
import { emitMoney, emitReports } from '../economy/emit';
import { dailyOffset, dayIndex } from '../economy/time';
import { overdraftLimit } from '../loans/credit';
import { defOf, isStorehouse, storageSpace, takes, tileDistance } from '../logistics/stores';
import {
  familyUseHundredths,
  flavorsOnOffer,
  onOfferGoods,
  SHELF_GOODS,
  wantedVariety,
} from '../market/balances';
import { doorTile } from '../movement/api';
import { isFrozen } from '../seasons/api';
import { riverDock } from '../dock';
import { buyingTowardMarks, makerFamily, marksStand, PASS_EVENT, passClosed, winterMark } from './api';
import {
  activeDeal,
  BOAT_BUY_PERCENT,
  BOAT_DAYS,
  BOAT_NEIGHBOR,
  BOAT_SELL_PERCENT,
  BOAT_UNITS,
  carrierBuyPrice,
  carrierSellPrice,
  carrierTerms,
  cartPercent,
  logTrade,
  neighborTrades,
  nudge,
} from './terms';

/** Family indexes, in GOOD_FAMILIES order. */
const FOOD = 0;
const FUEL = 1;
const MATERIALS = 2;
/** The fixed buying order of reserves (docs/spec/13-ledger.md): Food, Fuel, Materials, Wares, Treats. */
const ORDER = [0, 1, 2, 3, 4] as const;
/** Cycles of a maker's raw good the carrier brings when it is resting for want of it (a day's work). */
export const MAKER_CYCLES = 4;
/** Hours the boat stays moored at the dock after it calls (for the dock view). */
export const BOAT_MOORED_HOURS = 4;
/**
 * A lacking flavor's share: a day of the family's use split among the flavors wanted, at least
 * LACKING_MIN units (so a shelf shows it for a day or two) and at most a LACKING_LOAD-th of the day's load.
 */
export const LACKING_MIN = 2;
export const LACKING_LOAD = 4;

/** How a purchase is paid: within the budget; an essential outside it; or outside it and on the tab if need be. */
type Pay = 'budget' | 'essential' | 'tab';

interface Store {
  b: Building;
  def: BuildingDef;
  space: number;
}

interface Vehicle {
  boat: boolean;
  room: number;
  /** Stores by distance from where it unloads (the gate, the dock), nearest first. */
  stores: Store[];
  /** What to stow at the end: [index into `stores`, good, units]. */
  stow: [store: number, good: number, qty: number][];
  traded: boolean;
}

interface Day {
  cart: Vehicle;
  boat: Vehicle | null;
  stores: Store[];
  deal: DealOffer | null;
  /** Pennies paid from the treasury today (imports), booked to the tab, and paid off the tab. */
  spent: number;
  onTab: number;
  repaid: number;
  earned: number;
  bought: number[];
  sold: number[];
  /** Units by good the boat brought and took, for its record in the dock view. */
  boatBought: number[];
  boatSold: number[];
  /** Running stock by good: stores, shelves and output buffers, plus what it bought today. */
  town: number[];
  /** Food and Fuel in the pantries, by good. */
  pantry: number[];
  /** [neighbor, good, units, pennies] per deal, for the trade log. */
  deals: [string, number, number, number][];
  /** Essentials it could not bring for want of money or tab. */
  shortOfCredit: boolean;
}

/** The County tab's cap, pennies: TAB_PER_RESIDENT coins a resident. */
export function tabCap(state: WorldState): number {
  return TAB_PER_RESIDENT * PENNIES_PER_COIN * state.residents.length;
}

/** Units of each good open construction sites still wait for. */
function siteNeeds(state: WorldState): number[] {
  const out = new Array<number>(content.goods.length).fill(0);
  for (const b of state.buildings) {
    const c = b.rt?.construction;
    if (c) for (let g = 0; g < out.length; g++) out[g]! += c.needs[g] ?? 0;
  }
  return out;
}

/** A family's units in the day's running stock (shelf goods only, pantries for Food and Fuel). */
function have(day: Day, family: number): number {
  let n = 0;
  for (const g of SHELF_GOODS[family]!) n += (day.town[g] ?? 0) + (day.pantry[g] ?? 0);
  return n;
}

function addDeal(day: Day, neighbor: string, good: number, qty: number, pennies: number): void {
  const d = day.deals.find(([n, g]) => n === neighbor && g === good);
  if (d) {
    d[2] += qty;
    d[3] += pennies;
  } else day.deals.push([neighbor, good, qty, pennies]);
}

/** The nearest store in a vehicle's list with room for a good's family, or -1. */
function roomFor(v: Vehicle, good: number): number {
  for (let i = 0; i < v.stores.length; i++) {
    const s = v.stores[i]!;
    if (s.space > 0 && takes(s.def, good)) return i;
  }
  return -1;
}

interface Offer {
  v: Vehicle;
  n: NeighborState;
  price: number;
}

/** The cheapest way to bring a unit of a good today: a vehicle with room, and a store with room. */
function buyOffer(state: WorldState, day: Day, good: number): Offer | null {
  let best: Offer | null = null;
  const terms = carrierTerms(state);
  if (day.cart.room > 0 && roomFor(day.cart, good) >= 0) {
    for (const n of state.trade.neighbors) {
      if (!neighborTrades(state, n.id)) continue;
      const p = carrierBuyPrice(state, n.id, good, cartPercent(state, n.id, good, false, terms, day.deal));
      if (p !== null && (!best || p < best.price)) best = { v: day.cart, n, price: p };
    }
  }
  const boat = day.boat;
  if (boat && boat.room > 0 && roomFor(boat, good) >= 0) {
    const n = state.trade.neighbors.find((x) => x.id === BOAT_NEIGHBOR);
    if (n && neighborTrades(state, n.id)) {
      const pct = Math.min(BOAT_BUY_PERCENT, cartPercent(state, n.id, good, false, terms, day.deal));
      const p = carrierBuyPrice(state, n.id, good, pct);
      if (p !== null && (!best || p <= best.price)) best = { v: boat, n, price: p };
    }
  }
  return best;
}

/** The best paying way to take a unit of a good away today, or null. */
function sellOffer(state: WorldState, day: Day, good: number): Offer | null {
  let best: Offer | null = null;
  const terms = carrierTerms(state);
  if (day.cart.room > 0) {
    for (const n of state.trade.neighbors) {
      if (!neighborTrades(state, n.id)) continue;
      const p = carrierSellPrice(state, n.id, good, cartPercent(state, n.id, good, true, terms, day.deal));
      if (p !== null && (!best || p > best.price)) best = { v: day.cart, n, price: p };
    }
  }
  const boat = day.boat;
  if (boat && boat.room > 0) {
    const n = state.trade.neighbors.find((x) => x.id === BOAT_NEIGHBOR);
    if (n && neighborTrades(state, n.id)) {
      const pct = Math.max(BOAT_SELL_PERCENT, cartPercent(state, n.id, good, true, terms, day.deal));
      const p = carrierSellPrice(state, n.id, good, pct);
      if (p !== null && (!best || p >= best.price)) best = { v: boat, n, price: p };
    }
  }
  return best;
}

/**
 * Pays for a unit: within the budget when `pay` is 'budget', from the treasury within the credit
 * line, and for a household's Food or Fuel on the County tab when the treasury cannot. False when
 * it cannot be paid.
 */
function settle(state: WorldState, day: Day, price: number, pay: Pay): boolean {
  const c = state.carrier;
  if (pay === 'budget' && c.spentToday + day.spent + day.repaid + price > c.budget) return false;
  if (state.economy.treasury - day.spent - day.repaid - price >= -overdraftLimit(state)) {
    day.spent += price;
    return true;
  }
  if (pay !== 'tab') return false;
  if (c.tab + day.onTab + price > tabCap(state)) {
    day.shortOfCredit = true;
    return false;
  }
  day.onTab += price;
  return true;
}

/** Buys up to `n` units of a good. Returns the units bought. */
function buy(state: WorldState, day: Day, good: number, n: number, pay: Pay): number {
  let got = 0;
  while (got < n) {
    const o = buyOffer(state, day, good);
    if (!o || !settle(state, day, o.price, pay)) break;
    const si = roomFor(o.v, good);
    o.v.stores[si]!.space--;
    const last = o.v.stow[o.v.stow.length - 1];
    if (last && last[0] === si && last[1] === good) last[2]++;
    else o.v.stow.push([si, good, 1]);
    o.v.room--;
    o.v.traded = true;
    day.bought[good]! += 1;
    day.town[good]! += 1;
    if (o.v.boat) day.boatBought[good]! += 1;
    addDeal(day, o.n.id, good, 1, -o.price);
    nudge(o.n, good, IMPACT_PER_UNIT);
    got++;
  }
  return got;
}

/** The cheapest good of a list it can bring today, or -1. */
function cheapest(state: WorldState, day: Day, goods: readonly number[]): number {
  let best = -1;
  let bestPrice = Infinity;
  for (const g of goods) {
    const p = buyOffer(state, day, g)?.price;
    if (p !== undefined && p < bestPrice) {
      bestPrice = p;
      best = g;
    }
  }
  return best;
}

/** Buys `want` units of a family's goods, the cheapest unit by unit. Returns the units bought. */
function buyCheapest(state: WorldState, day: Day, goods: readonly number[], want: number, pay: Pay): number {
  let got = 0;
  while (got < want) {
    const g = cheapest(state, day, goods);
    if (g < 0 || buy(state, day, g, 1, pay) === 0) break;
    got++;
  }
  return got;
}

/** Units a day the town uses of a family, rounded up. */
function dayUse(state: WorldState, family: number): number {
  return Math.ceil(familyUseHundredths(state, family) / 100);
}

/** The family's reserve in units: days of use (or the winter mark, with `toward`), or Materials' units. */
function reserveUnits(state: WorldState, family: number, siteTotal: number, toward: boolean): number {
  const terms = state.carrier.families[family]!;
  if (family === MATERIALS) return siteTotal + terms.reserve;
  let days = terms.reserve;
  const mark = toward ? winterMark(state, family) : null;
  if (mark !== null && mark > days) days = mark;
  return Math.ceil((days * familyUseHundredths(state, family)) / 100);
}

/** Stores by distance from a tile, nearest first (ties in buildings order, as stowNearest has them). */
function storesFrom(stores: readonly Store[], tile: number): Store[] {
  const keyed = stores.map((s, i) => ({ s, i, d: tileDistance(tile, doorTile(s.b, s.def)) }));
  keyed.sort((a, b) => a.d - b.d || a.i - b.i);
  return keyed.map((k) => k.s);
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

/** The dock, when the boat calls today: a River Dock stands, the river runs, three days since its last call. */
function boatDue(state: WorldState): Building | null {
  const dock = riverDock(state);
  if (!dock || isFrozen(state)) return null;
  const last = state.carrier.boatDay;
  if (last !== undefined && dayIndex(state.tick) - last < BOAT_DAYS) return null;
  return dock;
}

/**
 * Units of each raw good makers are resting for want of (a maker with hands whose input buffer,
 * with what porters are bringing, cannot run a cycle), MAKER_CYCLES cycles' worth each, under the
 * rule for the family of what it makes.
 */
export function makersShort(state: WorldState): number[] {
  const want = new Array<number>(content.goods.length).fill(0);
  const families = state.carrier.families;
  for (const b of state.buildings) {
    const rt = b.rt;
    if (b.stage !== 'built' || !rt || rt.paused || rt.workers.length === 0) continue;
    const method = methodOf(b);
    if (!method || method.kind !== 'craft' || method.inputs.length === 0) continue;
    const f = makerFamily(b);
    if (f === null || families[f]!.rule === 'never') continue;
    for (const [id, qty] of method.inputs) {
      const g = content.goodIndex.get(id);
      if (g === undefined) continue;
      const held = (rt.input[g] ?? 0) + (rt.reservedIn[g] ?? 0);
      if (held < qty) want[g]! += MAKER_CYCLES * qty - held;
    }
  }
  return want;
}

/** The 10:00 visit. */
export function carrierDay(state: WorldState, ctx: TickCtx): void {
  rollDay(state);
  const c = state.carrier;
  const n = content.goods.length;
  const today = dayIndex(state.tick);
  const closed = passClosed(state);
  const terms = carrierTerms(state);
  const [gx, gz] = state.meta.valleyGate;
  const gate = Math.min(MAP_SIZE - 1, gz) * MAP_SIZE + Math.min(MAP_SIZE - 1, gx);

  const stores: Store[] = [];
  for (const b of state.buildings) {
    if (b.stage !== 'built' || !b.rt) continue;
    const def = defOf(b);
    if (!def || !isStorehouse(def)) continue;
    stores.push({ b, def, space: storageSpace(def, b.rt) });
  }
  const dock = boatDue(state);
  const pantry = new Array<number>(n).fill(0);
  const larder = [...GOODS_BY_FAMILY[FOOD]!, ...GOODS_BY_FAMILY[FUEL]!];
  for (const h of state.households) for (const g of larder) pantry[g]! += h.pantry[g] ?? 0;
  const day: Day = {
    cart: {
      boat: false,
      room: closed ? 0 : terms.units,
      stores: storesFrom(stores, gate),
      stow: [],
      traded: false,
    },
    boat: dock
      ? { boat: true, room: BOAT_UNITS, stores: storesFrom(stores, doorTile(dock)), stow: [], traded: false }
      : null,
    stores,
    deal: activeDeal(state),
    spent: 0,
    onTab: 0,
    repaid: 0,
    earned: 0,
    bought: new Array<number>(n).fill(0),
    sold: new Array<number>(n).fill(0),
    boatBought: new Array<number>(n).fill(0),
    boatSold: new Array<number>(n).fill(0),
    town: townStock(state),
    pantry,
    deals: [],
    shortOfCredit: false,
  };
  if (dock) c.boatDay = today;
  const families = c.families;
  const needs = siteNeeds(state);
  let siteTotal = 0;
  for (const g of GOODS_BY_FAMILY[MATERIALS]!) siteTotal += needs[g] ?? 0;

  // 2. Essentials, in the fixed order: Food, Fuel, Materials a site waits for, raw goods for makers.
  if (families[FOOD]!.rule !== 'never') {
    const want = dayUse(state, FOOD) - have(day, FOOD);
    if (want > 0) buyCheapest(state, day, SHELF_GOODS[FOOD]!, want, 'tab');
  }
  if (families[FUEL]!.rule !== 'never' && seasonAt(state.tick).season === 3) {
    const want = WARMTH_PER_HOUSEHOLD * state.households.length - have(day, FUEL);
    if (want > 0) buyCheapest(state, day, SHELF_GOODS[FUEL]!, want, 'tab');
  }
  if (families[MATERIALS]!.rule !== 'never') {
    for (const g of GOODS_BY_FAMILY[MATERIALS]!) {
      const want = (needs[g] ?? 0) - (day.town[g] ?? 0);
      if (want > 0) buy(state, day, g, want, 'essential');
    }
  }
  // A maker's raw good comes on the tab too when the treasury cannot pay: nothing stalls (rule 3).
  const makers = makersShort(state);
  for (let g = 0; g < n; g++) {
    const want = makers[g]! - (day.town[g] ?? 0);
    if (want > 0) buy(state, day, g, want, 'tab');
  }

  // 3. The tab is paid down from what is left of the day's budget.
  if (c.tab > 0) {
    const left = Math.max(0, c.budget - day.spent);
    const cash = Math.max(0, state.economy.treasury - day.spent);
    day.repaid = Math.min(c.tab, left, cash);
  }

  // 4. For families on Always, in the fixed order and within the budget: first a share of each
  // flavor some tier in town still lacks (the cheapest not on offer, even when the reserve is met),
  // so variety never waits behind another family's bulk; then the reserve, the cheapest unit by unit.
  const toward = buyingTowardMarks(state);
  const offered = onOfferGoods(state);
  for (const f of ORDER) {
    if (families[f]!.rule !== 'always') continue;
    const wanted = wantedVariety(state, f);
    let lacking = wanted - flavorsOnOffer(state, f, offered);
    if (lacking <= 0) continue;
    const share = Math.max(
      LACKING_MIN,
      Math.min(Math.ceil(dayUse(state, f) / Math.max(1, wanted)), Math.ceil(terms.units / LACKING_LOAD)),
    );
    const tried: number[] = [];
    while (lacking > 0) {
      const fresh = SHELF_GOODS[f]!.filter(
        (g) => !offered[g] && !tried.includes(g) && (day.town[g] ?? 0) === 0,
      );
      const g = cheapest(state, day, fresh);
      if (g < 0) break;
      tried.push(g);
      if (buy(state, day, g, share, 'budget') > 0) lacking--;
    }
  }
  for (const f of ORDER) {
    if (families[f]!.rule !== 'always') continue;
    const want = reserveUnits(state, f, siteTotal, toward) - have(day, f);
    if (want > 0) buyCheapest(state, day, SHELF_GOODS[f]!, want, 'budget');
  }

  // 5. Selling, with the load that is left: what is over twice the reserve, never under a mark.
  const stands = marksStand(state);
  for (let f = 0; f < families.length; f++) {
    const t = families[f]!;
    if (!t.sell || t.rule === 'never') continue;
    let keep = 2 * reserveUnits(state, f, siteTotal, false);
    if (stands) keep = Math.max(keep, reserveUnits(state, f, siteTotal, true));
    let over = have(day, f) - keep;
    while (over > 0 && (day.cart.room > 0 || (day.boat?.room ?? 0) > 0)) {
      // The flavor the stores hold most of that someone takes (ties to the first in goods order).
      let good = -1;
      let most = 0;
      for (const g of SHELF_GOODS[f]!) {
        let free = 0;
        for (const s of day.stores) free += Math.max(0, s.b.rt!.store[g]! - s.b.rt!.reservedOut[g]!);
        if (free > most && sellOffer(state, day, g)) {
          most = free;
          good = g;
        }
      }
      if (good < 0 || !sellOne(state, day, good)) break;
      over--;
    }
  }

  // Stow what came, once per store and good.
  for (const v of [day.cart, day.boat]) {
    if (!v) continue;
    for (const [si, g, qty] of v.stow) v.stores[si]!.b.rt!.store[g]! += qty;
  }

  // Books, record and log.
  const tday = c.bought.length - 1;
  for (let g = 0; g < n; g++) {
    c.bought[tday]![g]! += day.bought[g]!;
    c.sold[tday]![g]! += day.sold[g]!;
  }
  c.spentToday += day.spent + day.repaid;
  c.tab += day.onTab - day.repaid;
  if (day.spent > 0) book(state, 'imports', day.spent);
  if (day.repaid > 0) book(state, 'repayments', day.repaid);
  if (day.earned > 0) book(state, 'exports', day.earned);
  day.deals.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
  for (const [neighbor, good, qty, pennies] of day.deals) logTrade(state, neighbor, good, qty, pennies);
  if (day.boat?.traded) moorBoat(state, ctx, day);

  const lines = visitLines(state, day, closed);
  const at: [number, number] = [Math.min(MAP_SIZE - 1, gx), Math.min(MAP_SIZE - 1, gz)];
  if (lines.length > 0) ctx.events.push({ e: 'notify', kind: 'carrier', text: lines.join(' '), at });
  if (day.spent + day.repaid + day.earned + day.onTab > 0) {
    emitMoney(state, ctx);
    emitReports(state, ctx, false);
    ctx.events.push({ e: 'trade.updated', t: tradeView(state) });
  }
  ctx.events.push({ e: 'balances.updated', b: balancesView(state) });
}

/** Sells a unit of a good from the store holding most of it. False when it cannot. */
function sellOne(state: WorldState, day: Day, good: number): boolean {
  const o = sellOffer(state, day, good);
  if (!o) return false;
  let from: Store | null = null;
  let most = 0;
  for (const s of day.stores) {
    const free = s.b.rt!.store[good]! - s.b.rt!.reservedOut[good]!;
    if (free > most) {
      most = free;
      from = s;
    }
  }
  if (!from) return false;
  from.b.rt!.store[good]! -= 1;
  from.space++;
  day.town[good]! -= 1;
  day.earned += o.price;
  o.v.room--;
  o.v.traded = true;
  day.sold[good]! += 1;
  if (o.v.boat) day.boatSold[good]! += 1;
  addDeal(day, o.n.id, good, -1, o.price);
  nudge(o.n, good, -IMPACT_PER_UNIT);
  return true;
}

/** The boat ties up at the dock for a few hours (a Boat for the dock view, cleared by the dock's pass). */
function moorBoat(state: WorldState, ctx: TickCtx, day: Day): void {
  const pairs = (units: readonly number[]): [number, number][] =>
    units.flatMap((q, g): [number, number][] => (q > 0 ? [[g, q]] : []));
  state.dock.boats.push({
    id: state.nextId++,
    neighbor: BOAT_NEIGHBOR,
    selling: pairs(day.boatSold),
    buying: pairs(day.boatBought),
    arriveTick: state.tick,
    departTick: state.tick + BOAT_MOORED_HOURS * TICKS_PER_HOUR,
    tile: -1,
  });
  ctx.events.push({ e: 'dock.updated', d: dockView(state) });
}

/** The visit in a line or two, for the notice. */
function visitLines(state: WorldState, day: Day, closed: boolean): string[] {
  const lines: string[] = [];
  if (closed) {
    const v = state.weather.events.find(
      (e) => e.event === PASS_EVENT && e.start <= state.tick && state.tick < e.end,
    );
    if (v && dayIndex(v.start) === dayIndex(state.tick))
      lines.push(
        'Snow has shut the valley road, and the carrier is waiting it out on the far side. The town lives on what it put by until the pass clears.',
      );
  }
  const paid = day.spent + day.onTab;
  if (paid > 0) {
    const tab = day.onTab > 0 ? `, ${coinsText(day.onTab)} of it on the County tab` : '';
    const boat = !!day.boat?.traded && !day.cart.traded;
    const who = boat ? 'The boat from Millhaven' : 'The carrier';
    const where = boat ? 'at the dock' : 'at the gate';
    lines.push(`${who} left ${goodsText(day.bought)} ${where} and took ${coinsText(paid)} for it${tab}.`);
  }
  if (day.earned > 0)
    lines.push(`It went off with ${goodsText(day.sold)}, leaving ${coinsText(day.earned)} behind.`);
  if (day.repaid > 0) lines.push(`${coinsText(day.repaid)} went toward the County tab.`);
  if (day.shortOfCredit)
    lines.push(
      'The County tab is full, so nothing more comes on credit. Suppers will be plain until the books mend.',
    );
  return lines;
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
