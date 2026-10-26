// Wages and income tax (docs/spec/13-ledger.md, Market and prices; i2-wave-notes, Wages). At 17:00,
// the end of the work day, the treasury pays every worker's household the daily wage of the job's
// tier at the Ledger's wage level, and the household pays the income tax on it straight back. With
// the market open this replaces the I1 flat tax at midnight.
// In lean times (the treasury past the County Bank's credit line) the town pays out no more than
// its till took in from households the day before (sales and taxes), shared pro rata: purses stop
// filling while the treasury cannot, so the books can only climb back (on trade, the peddler or a
// loan) and never slide further on wages.
import { content } from '@qoti/content';
import { LEDGER_CATEGORIES, TICKS_PER_DAY, TIERS } from '../../constants';
import type { EntityId, System, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { wagesAt } from '../../view/village';
import { emitMoney } from '../economy/emit';
import { pay } from '../economy/money';
import { dailyOffset } from '../economy/time';
import { isLean } from '../loans/credit';
import { announceHousehold } from '../residents/records';
import { marketOpen } from './api';

const SALES = LEDGER_CATEGORIES.findIndex((c) => c.id === 'sales');
const TAXES = LEDGER_CATEGORIES.findIndex((c) => c.id === 'taxes');

/** 17:00. */
export const WAGES_OFFSET = dailyOffset(17);

/** Each household's gross wages for the day, pennies, by household id (ascending). */
export function wageBill(state: WorldState): Map<EntityId, number> {
  const rates = wagesAt(state.levers.wageLevel);
  const byHousehold = new Map<EntityId, number>();
  for (const b of state.buildings) {
    if (b.stage !== 'built' || !b.rt || b.rt.workers.length === 0) continue;
    const tier = Math.max(0, TIERS.indexOf(content.buildingById.get(b.def)?.jobs?.tier ?? 'settler'));
    const wage = rates[tier] ?? 0;
    for (const id of b.rt.workers) {
      const r = findById(state.residents, id);
      if (!r || !r.householdId) continue;
      byHousehold.set(r.householdId, (byHousehold.get(r.householdId) ?? 0) + wage);
    }
  }
  return byHousehold;
}

/** Income tax on a day's gross wages at the Ledger's rate, pennies (rounded down). */
export function incomeTax(state: WorldState, gross: number): number {
  return Math.floor((gross * state.levers.taxRate) / 100);
}

/** In lean times, what the till took in yesterday (sales and taxes); otherwise null (no cap). */
export function wageCap(state: WorldState): number | null {
  if (!isLean(state)) return null;
  const y = state.economy.yesterday.money;
  return y[SALES]! + y[TAXES]!;
}

/** Pays the day's wages and takes the income tax back, household by household. */
export function payWages(state: WorldState, ctx: TickCtx): void {
  const bill = wageBill(state);
  if (bill.size === 0) return;
  let total = 0;
  for (const v of bill.values()) total += v;
  const cap = wageCap(state);
  for (const h of state.households) {
    let gross = bill.get(h.id) ?? 0;
    if (cap !== null && cap < total) gross = Math.floor((gross * cap) / total);
    if (gross <= 0) continue;
    pay(state, 'treasury', { household: h.id }, gross, 'wages');
    pay(state, { household: h.id }, 'treasury', incomeTax(state, gross), 'taxes');
    announceHousehold(state, ctx, h.id);
  }
  emitMoney(state, ctx);
}

export const wages: System = {
  id: 'wages',
  order: 63,
  every: TICKS_PER_DAY,
  offset: WAGES_OFFSET,
  tick(state, ctx) {
    if (marketOpen(state)) payWages(state, ctx);
  },
};
