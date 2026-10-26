// The County Bank (docs/spec/13-ledger.md, Budget and Levers). loan.take and loan.repay move the
// money (commands/loan.ts); this pass charges interest at each season's end, at 00:30 on the new
// season's first day: LOAN_RATE percent of each loan's balance, paid from the treasury as
// `interest` while it can, otherwise added to what the loan owes (the bank is patient, at a
// price). Running the treasury into the credit line (credit.ts) is borrowing too: the overdraft
// pays the same rate.
import { DAYS_PER_SEASON, LOAN_RATE, TICKS_PER_DAY } from '../../constants';
import type { System, TickCtx, WorldState } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { loansView } from '../../view/village';
import { book } from '../economy/api';
import { coinsText } from '../economy';
import { emitMoney } from '../economy/emit';
import { dailyOffset, dayIndex } from '../economy/time';
import { overdraftLimit } from './credit';

/** Interest on a balance for a season at `rate` percent, pennies (rounded up: banks). */
export function interestOn(balance: number, rate: number): number {
  return balance > 0 ? Math.ceil((balance * rate) / 100) : 0;
}

/** The season's interest on every loan and on the overdraft. Returns pennies charged. */
export function chargeInterest(state: WorldState, ctx: TickCtx): number {
  let charged = 0;
  let added = 0;
  for (const loan of state.loans.loans) {
    const due = interestOn(loan.balance, loan.rate);
    if (due <= 0) continue;
    if (state.economy.treasury - due >= 0) {
      book(state, 'interest', due);
      charged += due;
    } else {
      loan.balance += due;
      added += due;
    }
  }
  // The overdraft: only within the credit line, so it cannot run away with itself.
  const owed = Math.min(Math.max(0, -state.economy.treasury), overdraftLimit(state));
  const due = interestOn(owed, LOAN_RATE);
  if (due > 0) {
    book(state, 'interest', due);
    charged += due;
  }
  if (charged + added === 0) return 0;
  const parts: string[] = [];
  if (charged > 0) parts.push(`${coinsText(charged)} in interest went off to the County Bank`);
  if (added > 0) parts.push(`${coinsText(added)} more was added to what the valley owes`);
  ctx.events.push({
    e: 'notify',
    kind: 'interest',
    text: `A new season, and ${parts.join(', and ')}. The bank sends its warmest regards.`,
  });
  ctx.events.push({ e: 'loans.updated', l: loansView(state) });
  emitMoney(state, ctx);
  return charged + added;
}

export const loans: System = {
  id: 'loans',
  order: 66,
  every: TICKS_PER_DAY,
  offset: dailyOffset(0, 30),
  tick(state, ctx) {
    if (!isStandard(state)) return;
    const day = dayIndex(state.tick);
    if (day > 0 && day % DAYS_PER_SEASON === 0) chargeInterest(state, ctx);
  },
};
