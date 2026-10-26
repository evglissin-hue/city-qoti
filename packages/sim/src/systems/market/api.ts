// Market API (C4.0 contract; C4A owns it). docs/spec/13-ledger.md, Market and prices.
// Households buy at market prices with their savings, from an outlet's store; the money goes to
// the treasury (booked as sales). Demand is what they wanted, bought or not: the daily price pass
// reads it. Price caps and subsidies (levers) apply at the till.
import { content } from '@qoti/content';
import type { EntityId, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { pay } from '../economy/money';
import { takeFromOutlet } from '../economy/outlets';

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
  state.market.demandToday[good] = (state.market.demandToday[good] ?? 0) + qty;
  const price = tillPrice(state, good);
  const affordable = price > 0 ? Math.floor(h.savings / price) : qty;
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
  h.pantry[good] = (h.pantry[good] ?? 0) + got;
  pay(state, { household: householdId }, 'treasury', price * got, 'sales');
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
    if (good < 0 || (b.rt.store[good] ?? 0) > 0) out.push(b.id);
  }
  return out;
}
