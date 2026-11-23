// A business's daily counters (docs/spec/13-ledger.md, Levels). The writers (production, porters and
// carts, shopping) call these; the levels pass at 23:30 reads and resets them. Only buildings with a
// trade keep counters, and (R3H) specialized buildings that climb levels (`BuildingDef.levels`).
import { content } from '@qoti/content';
import type { Building, BusinessCounters } from '../../contracts';
import { emptyCounters } from '../../state/zones';

/** The building's counters, created when first needed: a business, or a specialized building with levels. */
export function countersOf(b: Building): BusinessCounters | null {
  if (!b.trade && !content.buildingById.get(b.def)?.levels) return null;
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

/** A shop (or R3H, a Market Stall that climbs on its customers) served a household. */
export function countCustomer(b: Building): void {
  if (b.trade !== 'shop' && content.buildingById.get(b.def)?.levels?.good !== 'customers') return;
  const c = countersOf(b);
  if (c) c.customersToday += 1;
}

/** A business with hands in went without its raw good during working hours. */
export function countShort(b: Building): void {
  const c = countersOf(b);
  if (c) c.shortToday = true;
}
