// C4A: the County Bank (docs/spec/13-ledger.md, Budget and Levers): loan limits by rank, interest
// each season, and the credit line that lets a Village dip below zero before lean times.
// Isolated where the clock runs: only the economy and loan passes matter, so the residents'
// schedule, the household pass, wages and caravans are off.
import { describe, expect, it } from 'vitest';
import {
  CREDIT_MIN,
  DAYS_PER_SEASON,
  LEDGER_CATEGORIES,
  LOAN_LIMITS,
  LOAN_RATE,
  PENNIES_PER_COIN,
  RANKS,
} from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { withoutSystems } from '../../src/systems';
import { spendBlocked } from '../../src/systems/economy/api';
import { chargeInterest, interestOn } from '../../src/systems/loans';
import { isLean, overdraftLimit } from '../../src/systems/loans/credit';
import { createTickCtx } from '../../src/turn';
import { creditLimit, loansOwed } from '../../src/view/village';
import { hamletFixture } from '../fixtures/hamlet';
import { villageFixture } from '../fixtures/village';
import { rejection, run } from '../helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { runDays } from './helpers';

const cat = (id: string) => LEDGER_CATEGORIES.findIndex((c) => c.id === id);
const ISOLATE = ['residents', 'baskets', 'wages', 'caravans', 'logistics', 'production', 'construction'];

/** Moves money out of the valley (as if spent on the world outside). */
function spend(state: WorldState, pennies: number): void {
  state.economy.treasury -= pennies;
  state.economy.external -= pennies;
}

describe('borrowing', () => {
  it('lends up to the rank limit, more for a big town, and refuses beyond it', () => {
    const { state } = villageFixture();
    const limit = creditLimit(state);
    expect(limit).toBeGreaterThanOrEqual(LOAN_LIMITS[RANKS.indexOf('village')] * PENNIES_PER_COIN);
    const before = moneySnapshot(state);
    const room = Math.floor((limit - loansOwed(state)) / PENNIES_PER_COIN);
    expect(rejection(run(state, { t: 'loan.take', coins: room + 1 }))).toBe('CREDIT_LIMIT');
    const treasury = state.economy.treasury;
    expect(rejection(run(state, { t: 'loan.take', coins: room }))).toBeUndefined();
    expect(state.economy.treasury).toBe(treasury + room * PENNIES_PER_COIN);
    expect(state.economy.today.money[cat('loans')]).toBe(room * PENNIES_PER_COIN);
    const id = state.loans.loans[state.loans.loans.length - 1]!.id;
    expect(rejection(run(state, { t: 'loan.repay', id, coins: room }))).toBeUndefined();
    expect(state.economy.today.money[cat('repayments')]).toBe(room * PENNIES_PER_COIN);
    expectMoneyInvariant(before, state);
  });

  it('keeps the bank shut at Hamlet rank', () => {
    const f = hamletFixture();
    expect(rejection(run(f.state, { t: 'loan.take', coins: 10 }))).toBe('LOCKED');
  });
});

describe('interest', () => {
  it('rounds a season of interest up to the penny', () => {
    expect(interestOn(10_000, LOAN_RATE)).toBe(500);
    expect(interestOn(10_001, LOAN_RATE)).toBe(501);
    expect(interestOn(0, LOAN_RATE)).toBe(0);
  });

  it('is paid from the treasury when it can be, and added to the loan when not', () => {
    const { state } = villageFixture();
    const before = moneySnapshot(state);
    const loan = state.loans.loans[0]!;
    const due = interestOn(loan.balance, loan.rate);
    const treasury = state.economy.treasury;
    const ctx = createTickCtx(state);
    chargeInterest(state, ctx);
    expect(state.economy.treasury).toBe(treasury - due);
    expect(state.economy.today.money[cat('interest')]).toBe(due);
    expect(ctx.events.some((e) => e.e === 'loans.updated')).toBe(true);
    // Broke: the bank adds it to the balance instead of pushing the town under.
    spend(state, state.economy.treasury);
    const balance = loan.balance;
    chargeInterest(state, ctx);
    expect(loan.balance).toBe(balance + interestOn(balance, loan.rate));
    expect(state.economy.treasury).toBe(0);
    expectMoneyInvariant(before, state);
  });

  it('charges the overdraft too, within the credit line', () => {
    const { state } = villageFixture();
    state.loans.loans = [];
    spend(state, state.economy.treasury + 100 * PENNIES_PER_COIN);
    const before = moneySnapshot(state);
    chargeInterest(state, createTickCtx(state));
    expect(state.economy.today.money[cat('interest')]).toBe(interestOn(100 * PENNIES_PER_COIN, LOAN_RATE));
    expectMoneyInvariant(before, state);
  });

  it('comes due at 00:30 on the first day of each season', () => {
    const { state } = villageFixture();
    const before = moneySnapshot(state);
    const loan = state.loans.loans[0]!;
    let charged = 0;
    withoutSystems(ISOLATE, () => {
      for (let d = 0; d < DAYS_PER_SEASON; d++) {
        runDays(state, 1);
        charged += state.economy.yesterday.money[cat('interest')]!;
      }
      runDays(state, 1);
      charged += state.economy.yesterday.money[cat('interest')]!;
    });
    expect(charged).toBe(interestOn(loan.balance, loan.rate));
    expectMoneyInvariant(before, state);
  });
});

describe('the credit line', () => {
  it('is nothing at Hamlet rank and 200 coins per rank step after', () => {
    const f = hamletFixture();
    expect(overdraftLimit(f.state)).toBe(0);
    const { state } = villageFixture();
    expect(overdraftLimit(state)).toBe(CREDIT_MIN * RANKS.indexOf('village') * PENNIES_PER_COIN);
  });

  it('lets a Village build into the red, then calls lean times past the line', () => {
    const { state } = villageFixture();
    spend(state, state.economy.treasury + 50 * PENNIES_PER_COIN);
    expect(isLean(state)).toBe(false);
    expect(spendBlocked(state, 100 * PENNIES_PER_COIN)).toBeNull();
    expect(spendBlocked(state, overdraftLimit(state))).toBe('CANNOT_AFFORD');
    spend(state, overdraftLimit(state));
    expect(isLean(state)).toBe(true);
    withoutSystems(ISOLATE, () => runDays(state, 1));
    expect(state.economy.leanTimes).toBe(true);
    expect(spendBlocked(state, 1)).toBe('LEAN_TIMES');
  });

  it('still calls lean times at zero in a Hamlet', () => {
    const f = hamletFixture();
    spend(f.state, f.state.economy.treasury + 1);
    expect(isLean(f.state)).toBe(true);
  });
});
