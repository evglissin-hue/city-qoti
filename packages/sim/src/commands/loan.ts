// The County Bank (C4.0 baseline; C4A owns loans). Loans arrive with the Village rank; borrowing is
// money entering the valley and repaying is money leaving it, so both go through book().
import { LOAN_RATE, PENNIES_PER_COIN } from '../constants';
import type { Loan, TickCtx, WorldState } from '../contracts';
import { isInt } from '../rules/geometry';
import { findById, removeById } from '../state/entities';
import { isStandard } from '../state/hamlet';
import { rankAtLeast } from '../state/village';
import { book } from '../systems/economy/api';
import { emitMoney } from '../systems/economy/emit';
import { creditLimit, loansOwed, loansView } from '../view/village';
import { takeId, type HandlerFor } from './util';

function emitLoans(state: WorldState, ctx: TickCtx): void {
  ctx.events.push({ e: 'loans.updated', l: loansView(state) });
  emitMoney(state, ctx);
}

export const take: HandlerFor<'loan.take'> = {
  type: 'loan.take',
  validate(state, _seat, cmd) {
    if (!isStandard(state)) return 'NOT_ALLOWED';
    if (!isInt(cmd.coins) || cmd.coins <= 0) return 'INVALID';
    if (!rankAtLeast(state, 'village')) return 'LOCKED';
    return loansOwed(state) + cmd.coins * PENNIES_PER_COIN > creditLimit(state) ? 'CREDIT_LIMIT' : null;
  },
  apply(state, _seat, cmd, ctx) {
    const pennies = cmd.coins * PENNIES_PER_COIN;
    const loan: Loan = {
      id: takeId(state),
      principal: pennies,
      balance: pennies,
      rate: LOAN_RATE,
      takenTick: state.tick,
    };
    state.loans.loans.push(loan);
    book(state, 'loans', pennies);
    emitLoans(state, ctx);
  },
};

export const repay: HandlerFor<'loan.repay'> = {
  type: 'loan.repay',
  validate(state, _seat, cmd) {
    if (!isStandard(state)) return 'NOT_ALLOWED';
    if (!isInt(cmd.coins) || cmd.coins <= 0 || !isInt(cmd.id)) return 'INVALID';
    const loan = findById(state.loans.loans, cmd.id);
    if (!loan) return 'NOT_FOUND';
    const pennies = Math.min(loan.balance, cmd.coins * PENNIES_PER_COIN);
    return pennies > state.economy.treasury ? 'CANNOT_AFFORD' : null;
  },
  apply(state, _seat, cmd, ctx) {
    const loan = findById(state.loans.loans, cmd.id)!;
    const pennies = Math.min(loan.balance, cmd.coins * PENNIES_PER_COIN);
    loan.balance -= pennies;
    book(state, 'repayments', pennies);
    if (loan.balance <= 0) removeById(state.loans.loans, loan.id);
    emitLoans(state, ctx);
  },
};
