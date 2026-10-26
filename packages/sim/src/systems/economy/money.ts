// Money between the treasury, households and the outside world (C4.0 contract; C4A owns the
// flows). docs/spec/13-ledger.md, Market and prices: workplaces pay wages from the treasury to
// households, households buy goods (money returns to the treasury), income tax returns a share of
// wages; exports, imports, tourism, loans (and the I1 peddler and taxes) are the only money that
// enters or leaves. The invariant: treasury + sum(savings) - economy.external never changes.
import { LEDGER_CATEGORIES, type LedgerCategoryId } from '../../constants';
import type { EntityId, WorldState } from '../../contracts';
import { findById } from '../../state/entities';

/** Who pays or is paid: the town treasury, a household's savings, or the world outside the valley. */
export type Purse = 'treasury' | 'outside' | { household: EntityId };

function savingsOf(state: WorldState, p: Purse): { savings: number } | null {
  return typeof p === 'object' ? (findById(state.households, p.household) ?? null) : null;
}

/**
 * Moves `pennies` from one purse to another and books it under `category` when the treasury is one
 * side (null books nothing). Households never go below zero: the amount is cut to what they have. The treasury may (lean
 * times). Returns the pennies actually moved.
 *
 * - treasury <-> outside: like `book()` (counts in economy.external), but the direction comes from
 *   `from` and `to`, not from the category's kind.
 * - treasury <-> household: internal; booked in the ledger (wages out, sales and taxes in).
 * - household <-> outside: counts in economy.external, not in the ledger (tourism, a seaside
 *   departure taking savings away).
 * - household <-> household: internal, unbooked (gifts, weddings).
 */
export function pay(
  state: WorldState,
  from: Purse,
  to: Purse,
  pennies: number,
  category: LedgerCategoryId | null,
): number {
  if (!(pennies > 0)) return 0;
  const src = savingsOf(state, from);
  const dst = savingsOf(state, to);
  if (typeof from === 'object' && !src) return 0;
  if (typeof to === 'object' && !dst) return 0;
  const amount = src ? Math.min(pennies, Math.max(0, src.savings)) : pennies;
  if (amount <= 0) return 0;
  if (src) src.savings -= amount;
  if (dst) dst.savings += amount;
  const e = state.economy;
  if (from === 'treasury') e.treasury -= amount;
  if (to === 'treasury') e.treasury += amount;
  if (from === 'outside') e.external += amount;
  if (to === 'outside') e.external -= amount;
  if (category && (from === 'treasury' || to === 'treasury')) {
    const i = LEDGER_CATEGORIES.findIndex((c) => c.id === category);
    if (i >= 0) {
      e.today.money[i]! += amount;
      e.season.money[i]! += amount;
    }
  }
  return amount;
}

/** Money inside the valley: treasury plus every household's savings, pennies. */
export function moneyInside(state: WorldState): number {
  let n = state.economy.treasury;
  for (const h of state.households) n += h.savings;
  return n;
}

/**
 * The money invariant's constant: money inside minus what ever crossed the valley's edge. Every
 * flow keeps it unchanged; a change means money was made or lost inside the valley (a bug).
 */
export function moneyBalance(state: WorldState): number {
  return moneyInside(state) - state.economy.external;
}
