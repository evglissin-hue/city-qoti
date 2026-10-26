// Market API (C4.0 contract; C4A owns it). docs/spec/13-ledger.md, Market and prices.
// Households buy at market prices with their savings, from an outlet's store; the money goes to
// the treasury (booked as sales). `buy` records what was asked for as demand; the household pass
// (baskets.ts) records what every household wants each day instead, whether or not the shelves
// have it, and buys without recording twice. Price caps and subsidies (levers) apply at the till,
// and what they cost the town shows in the Budget as subsidies.
import { content } from '@qoti/content';
import { LEDGER_CATEGORIES, type LedgerCategoryId } from '../../constants';
import type { EntityId, Household, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { isStandard } from '../../state/hamlet';
import { rankAtLeast } from '../../state/village';
import { pay } from '../economy/money';
import { takeFromOutlet } from '../economy/outlets';

/**
 * True once money circulates: a standard valley at Village rank (the Charter unlocks market
 * prices). Before that the I1 books run: a flat tax, free food, no wages, prices at base.
 */
export function marketOpen(state: WorldState): boolean {
  return isStandard(state) && rankAtLeast(state, 'village');
}

/** Today's market price of a good (by index) in pennies; the base price when no market runs. */
export function priceOf(state: WorldState, good: number): number {
  return state.market.prices[good] ?? content.goods[good]?.basePrice ?? 0;
}

/**
 * What a household pays per unit at the till: the market price, capped by the Ledger's price cap,
 * less its subsidy (which the treasury simply does not collect).
 */
export function tillPrice(state: WorldState, good: number): number {
  let p = priceOf(state, good);
  const cap = state.levers.priceCaps[good] ?? 0;
  if (cap > 0 && p > cap) p = cap;
  const sub = state.levers.subsidies[good] ?? 0;
  return Math.max(0, Math.round((p * (100 - sub)) / 100));
}

/**
 * Adds to a ledger row without moving money. Used in pairs that cancel out (sales at the full
 * price, subsidies for what the till let go), so the Budget shows what caps and subsidies cost.
 */
function note(state: WorldState, category: LedgerCategoryId, pennies: number): void {
  if (pennies <= 0) return;
  const i = LEDGER_CATEGORIES.findIndex((c) => c.id === category);
  state.economy.today.money[i]! += pennies;
  state.economy.season.money[i]! += pennies;
}

/** Units of a good an outlet can hand out now (stock not promised to porters). */
export function outletFree(state: WorldState, outlet: EntityId, good: number): number {
  const rt = findById(state.buildings, outlet)?.rt;
  if (!rt) return 0;
  return Math.max(0, (rt.store[good] ?? 0) - (rt.reservedOut[good] ?? 0));
}

/**
 * The household pays for up to `qty` units taken from the outlet(s) at the till price. Goods leave
 * the outlet but are not put anywhere: the caller carries them home or uses them up. With
 * `record`, the full `qty` counts as demand. Returns the units taken.
 */
export function purchase(
  state: WorldState,
  h: Household,
  good: number,
  qty: number,
  outlet: EntityId = 0,
  record = false,
): number {
  if (qty <= 0) return 0;
  if (record) state.market.demandToday[good] = (state.market.demandToday[good] ?? 0) + qty;
  const price = tillPrice(state, good);
  const affordable = price > 0 ? Math.floor(Math.max(0, h.savings) / price) : qty;
  let want = Math.min(qty, affordable);
  if (want <= 0) return 0;
  let got = 0;
  const outlets = outlet ? [outlet] : outletsWith(state, good);
  for (const id of outlets) {
    if (want <= 0) break;
    const n = takeFromOutlet(state, id, good, want);
    got += n;
    want -= n;
  }
  if (got <= 0) return 0;
  pay(state, { household: h.id }, 'treasury', price * got, 'sales');
  const full = priceOf(state, good) * got;
  if (full > price * got) {
    note(state, 'sales', full - price * got);
    note(state, 'subsidies', full - price * got);
  }
  return got;
}

/**
 * A household buys up to `qty` units of a good at an outlet (`outlet`, or the first outlet with
 * stock when 0), into its pantry, paying with savings. Records the full `qty` as demand. Returns
 * the units bought (limited by stock and savings).
 */
export function buy(
  state: WorldState,
  householdId: EntityId,
  good: number,
  qty: number,
  outlet: EntityId = 0,
): number {
  const h = findById(state.households, householdId);
  if (!h || qty <= 0) return 0;
  const got = purchase(state, h, good, qty, outlet, true);
  if (got > 0) h.pantry[good] = (h.pantry[good] ?? 0) + got;
  return got;
}

/**
 * A household sells `qty` units from its pantry back to an outlet (or the first outlet) at the
 * market price, paid from the treasury. Unbooked: it undoes a purchase rather than earning income.
 * Returns the units sold.
 */
export function sell(
  state: WorldState,
  householdId: EntityId,
  good: number,
  qty: number,
  outlet: EntityId = 0,
): number {
  const h = findById(state.households, householdId);
  const target = findById(state.buildings, outlet || (outletsWith(state, -1)[0] ?? 0));
  if (!h || !target?.rt || qty <= 0) return 0;
  const n = Math.min(qty, h.pantry[good] ?? 0);
  if (n <= 0) return 0;
  h.pantry[good]! -= n;
  target.rt.store[good] = (target.rt.store[good] ?? 0) + n;
  pay(state, 'treasury', { household: householdId }, priceOf(state, good) * n, null);
  return n;
}

/** Built outlets (tag 'outlet') holding the good, by id; every outlet when `good` is -1. */
export function outletsWith(state: WorldState, good: number): EntityId[] {
  const out: EntityId[] = [];
  for (const b of state.buildings) {
    if (b.stage !== 'built' || !b.rt) continue;
    if (!content.buildingById.get(b.def)?.tags?.includes('outlet')) continue;
    if (good < 0 || (b.rt.store[good] ?? 0) - (b.rt.reservedOut[good] ?? 0) > 0) out.push(b.id);
  }
  return out;
}
