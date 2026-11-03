// Market days and quiet hours (C5B; docs/spec/13-ledger.md, Levers, I3 rows). The commands set
// state.levers.marketDay and .quietHours (commands/marketDays.ts); these read them.
// - Market day (a day of each season, 1 to 6): shoppers carry twice as much home a trip (more
//   shopping capacity), outlets give a little comfort charm that day (MARKET_DAY in the charm
//   sources), and at 18:00 each household
//   with the coins pays a small stall fee to the treasury (pay(), 'fees').
// - Quiet hours (workshops idle from 20:00 to 07:00): workshops are half as loud at night, and make
//   QUIET_YIELD permille of their usual output (the yield hook).
import type { BuildingDef, ProductionMethod } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { Building, WorldState } from '../../contracts';
import { pay } from '../economy/money';
import { markCharmDirty } from '../hearth/charm/dirty';
import { seasonNow } from '../seasons/api';

/** Pennies each household pays on market day. */
export const MARKET_FEE = 25;
/** Shoppers carry this many times a usual load on market day. */
export const MARKET_CARRY = 2;
/** Workshop output under quiet hours, permille. */
export const QUIET_YIELD = 950;

export function isMarketDay(state: WorldState): boolean {
  const d = state.levers.marketDay;
  return d !== undefined && d !== null && seasonNow(state).day === d;
}

export function quietHours(state: WorldState): boolean {
  return state.levers.quietHours === true;
}

function isWorkshop(def: BuildingDef): boolean {
  return !!def.tags?.includes('workshop');
}

/** The yield hook: workshops under quiet hours. */
export function quietYield(
  state: WorldState,
  _b: Building,
  def: BuildingDef,
  method: ProductionMethod,
): number {
  return quietHours(state) && method.kind === 'craft' && isWorkshop(def) ? QUIET_YIELD : 1000;
}

/** The stall fees, at 18:00 on market day. Returns the pennies paid. */
export function marketFees(state: WorldState): number {
  let paid = 0;
  for (const h of state.households) {
    if (h.savings >= MARKET_FEE) paid += pay(state, { household: h.id }, 'treasury', MARKET_FEE, 'fees');
  }
  return paid;
}

/** The whole map's charm is redone (a lever that changes many sources at once). */
export function recharm(state: WorldState): void {
  markCharmDirty(state, [0, 0, MAP_SIZE - 1, MAP_SIZE - 1]);
}
