// A business's daily counters (docs/spec/13-ledger.md, Levels). The writers (production, porters and
// carts, shopping) call these; the levels pass at 23:30 reads and resets them. Only buildings with a
// trade keep counters.
import type { Building, BusinessCounters } from '../../contracts';
import { emptyCounters } from '../../state/zones';

/** The building's counters, created when first needed. Only for a business (has a trade). */
export function countersOf(b: Building): BusinessCounters | null {
  if (!b.trade) return null;
  return (b.counters ??= emptyCounters());
}

/** A business made `qty` units. */
export function countMade(b: Building, qty: number): void {
  const c = countersOf(b);
  if (c) c.madeToday += qty;
}

/** A business's output (or a shop's shelf) lost `qty` units to a buyer or a carrier. */
export function countSold(b: Building, qty: number): void {
  const c = countersOf(b);
  if (c) c.soldToday += qty;
}

/** A shop served a household. */
export function countCustomer(b: Building): void {
  if (b.trade !== 'shop') return;
  const c = countersOf(b);
  if (c) c.customersToday += 1;
}

/** A business with hands in went without its raw good during working hours. */
export function countShort(b: Building): void {
  const c = countersOf(b);
  if (c) c.shortToday = true;
}
