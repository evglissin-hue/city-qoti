// The money advisor (I2, C4A, ported in C5.0): the Ledger's money levers once the market is open
// at Village rank. Wages and tax steer where the coins pile up (it trims wages or firms up the
// income tax when purses fill while the treasury slides, and the other way round when households
// go short); the County Bank tides a short treasury over and is paid back once flush.
// R1.0: the standing order book is gone with standing orders: the carrier imports what is short and
// sells what is over by its own rules. The Trading Post is the village advisor's to place.
import {
  basketScore,
  creditLimit,
  expenses,
  income,
  loansOwed,
  PENNIES_PER_COIN,
  rankAtLeast,
  TAX_RATE_RANGE,
} from '@qoti/sim';
import type { Planner } from '../planner';
import type { Advisor, AdvisorDef } from './types';

/** R1F: what one visit to the County Bank borrows (it was 300, and a Village borrowed ten times in seventy days). */
const LOAN_COINS = 600;
/** R1F: days between two turns of the wage or tax lever (the levers moved most days, a chore). */
const LEVER_DAYS = 3;

class Money implements Advisor {
  /** The day a wage or tax lever last moved. */
  private moved = -LEVER_DAYS;

  constructor(readonly p: Planner) {}

  visit(): void {
    const p = this.p;
    const w = p.w;
    if (!rankAtLeast(w, 'village')) return;
    const l = w.levers;
    const hh = Math.max(1, w.households.length);
    const basket = w.households.reduce((n, h) => n + basketScore(h), 0) / hh;
    const coins = p.coins();
    const y = w.economy.yesterday;
    const net = income(y) - expenses(y);
    const rested = p.runDay - this.moved >= LEVER_DAYS;
    const setWage = (percent: number, why: string) =>
      rested && percent !== l.wageLevel && p.do(why, [{ t: 'ledger.setWageLevel', percent }]) && (this.moved = p.runDay);
    const setTax = (percent: number, why: string) =>
      rested && percent !== l.taxRate && p.do(why, [{ t: 'ledger.setTaxRate', percent }]) && (this.moved = p.runDay);
    // C4X: or whenever the treasury is nearly empty while households get by (purses held four
    // thousand coins while the town could not afford a cider press).
    // C5X part 2: or while the town owes more than half its credit line and households get by (the
    // Village's loans grew with its purses and nothing ever firmed the tax past the first dip).
    const deep = loansOwed(w) * 2 > creditLimit(w);
    if ((net < 0 && coins < 300 && basket >= 65) || (coins < 100 && basket >= 75) || (deep && basket >= 60)) {
      // The treasury slides while households get by: trim wages a little, then firm up the tax.
      if (l.wageLevel > 85) setWage(l.wageLevel - 5, 'trim wages');
      else if (l.taxRate < TAX_RATE_RANGE[1]) setTax(Math.min(TAX_RATE_RANGE[1], l.taxRate + 4), 'raise the income tax');
    } else if (basket < 65 && coins > 150) {
      // Households going short while the treasury can spare it: ease off.
      if (l.taxRate > 6) setTax(l.taxRate - 2, 'ease the income tax');
      else if (l.wageLevel < 110) setWage(l.wageLevel + 5, 'raise wages');
    } else if (net > 0 && coins > 500 && loansOwed(w) === 0) {
      // Flush: drift back toward the usual levels.
      if (l.wageLevel < 100) setWage(l.wageLevel + 5, 'restore wages');
      else if (l.taxRate > 10) setTax(l.taxRate - 2, 'ease the income tax');
    }
    // The County Bank: borrow when the treasury runs thin, repay when flush.
    const owed = loansOwed(w);
    const room = Math.floor((creditLimit(w) - owed) / PENNIES_PER_COIN);
    // C4X: near the end of the credit line, wages go to the floor (lean times are a step away).
    if (room < 400 && coins < 200 && l.wageLevel > 80) setWage(80, 'trim wages to the floor');
    // P1: a cushion of 120 coins, not 60, and repay only above 500, down to 350. P1 added coin
    // sinks (the peddler's imports, priced decor), and a player who borrows at the last coin
    // stalls the build queue for days (six seeds at day 70 with P1's first economy: 135 residents
    // on average with the old cushion, 142 with this one; main 138 either way).
    if (coins < 120 && room >= 100) {
      p.do('take a loan', [{ t: 'loan.take', coins: Math.min(room, LOAN_COINS) }]);
    } else if (owed > 0 && coins > 500) {
      const loan = w.loans.loans[0]!;
      const pay = Math.min(Math.ceil(loan.balance / PENNIES_PER_COIN), Math.floor(coins - 350));
      if (pay > 0) p.do('repay a loan', [{ t: 'loan.repay', id: loan.id, coins: pay }]);
    }
  }
}

export const money: AdvisorDef = {
  id: 'money',
  lane: 'ledger',
  slot: 40,
  plays: () => true,
  create: (p) => new Money(p),
};
