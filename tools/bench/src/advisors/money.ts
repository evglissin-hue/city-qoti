// The money advisor (I2, C4A, ported in C5.0): the Ledger's money levers once the market is open
// at Village rank. Wages and tax steer where the coins pile up (it trims wages or firms up the
// income tax when purses fill while the treasury slides, and the other way round when households
// go short); the County Bank tides a short treasury over and is paid back once flush.
// R1.0: the standing order book is gone with standing orders: the carrier imports what is short and
// sells what is over by its own rules. The Trading Post is the village advisor's to place.
import { content } from '@qoti/content';
import {
  basketScore,
  creditLimit,
  expenses,
  income,
  loansOwed,
  PENNIES_PER_COIN,
  rankAtLeast,
  TAX_RATE_RANGE,
  type WorldState,
} from '@qoti/sim';
import type { Planner } from '../planner';
import type { Advisor, AdvisorDef } from './types';

/** R1F: what one visit to the County Bank borrows (it was 300, and a Village borrowed ten times in seventy days; R1X: 1000). */
const LOAN_COINS = 1000;
/**
 * R1X: the highest income tax the Ledger sets. Taxes and wages only move coins between the
 * treasury and the purses, so past this the tax takes back the savings households put by for
 * Craftsfolk (the advisor pushed it to 30% in debt and no household could move up) and the
 * shops sell less; the County Bank tides a Village over until its exports catch up.
 */
const TAX_CEILING = 16;
/** R1F: days between two turns of the wage or tax lever (the levers moved most days, a chore). */
const LEVER_DAYS = 3;
/** R3X: credit room worth a loan while the treasury still holds coins (below it, only at the last coin). */
const LOAN_MIN = 250;
/** R3X: days between the purse-driven eases (tax down, wages up), slower than the treasury's moves. */
const PURSE_DAYS = 6;

/** P3A (meals): a food need under this at the morning look is a missed breakfast. */
const MISSED_MEAL = 60;

/**
 * P3A (meals): households with somebody in work whose food need says they missed breakfast. The
 * advisor trims no wage while there are any (it trimmed to 80% and left two-wage households short
 * of the cheapest food).
 */
export function workingHungry(w: WorldState): number {
  const byId = new Map(w.residents.map((r) => [r.id, r]));
  let n = 0;
  for (const h of w.households) {
    const members = h.members.map((id) => byId.get(id));
    if (!members.some((r) => r && r.jobId)) continue;
    if (members.some((r) => r && (r.needs[0] ?? 100) < MISSED_MEAL)) n++;
  }
  return n;
}

/** R3X: the median purse of the Settler households, in pennies (0 when there are none). */
export function medianSettlerPurse(w: WorldState): number {
  const purses = w.households
    .filter((h) => h.tier === 'settler')
    .map((h) => h.savings)
    .sort((a, b) => a - b);
  return purses[purses.length >> 1] ?? 0;
}

/** R3X: the coins a Craftsfolk household puts by before it moves up (the basket's `savings`). */
function craftsSavings(): number {
  return content.basketByTier.get('craftsfolk')?.savings ?? 0;
}

/** R3X: coins of credit left (a tenth of the line is left unborrowed), as the loan rule reads it. */
function creditRoom(w: WorldState): number {
  return Math.floor((creditLimit(w) * 0.9 - loansOwed(w)) / PENNIES_PER_COIN);
}

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
    const basket = w.households.reduce((n, h) => n + basketScore(w, h), 0) / hh;
    const coins = p.coins();
    const y = w.economy.yesterday;
    const net = income(y) - expenses(y);
    const rested = p.runDay - this.moved >= LEVER_DAYS;
    // P3A (meals): no wage trims while households in work miss meals.
    const fedOnWages = workingHungry(w) === 0;
    const setWage = (percent: number, why: string) =>
      rested &&
      percent !== l.wageLevel &&
      p.do(why, [{ t: 'ledger.setWageLevel', percent }]) &&
      (this.moved = p.runDay);
    const setTax = (percent: number, why: string) =>
      rested &&
      percent !== l.taxRate &&
      p.do(why, [{ t: 'ledger.setTaxRate', percent }]) &&
      (this.moved = p.runDay);
    // C4X: or whenever the treasury is nearly empty while households get by (purses held four
    // thousand coins while the town could not afford a cider press).
    // C5X part 2: or while the town owes more than half its credit line and households get by (the
    // Village's loans grew with its purses and nothing ever firmed the tax past the first dip).
    const deep = loansOwed(w) * 2 > creditLimit(w);
    // R3X: and only while purses can spare it. A Village is always `deep` (the advisor borrows to grow),
    // so the squeeze held wages at 80 and tax at 16 for sixty days and the median Settler purse sat at
    // 1 to 8 coins: nobody put six by for Craftsfolk. The squeeze waits for twice the savings; the ease
    // starts under the savings, while the treasury has its cushion and the credit line's end is far.
    const purse = medianSettlerPurse(w) / PENNIES_PER_COIN;
    // The winter's food comes first: while the treasury holds less than the plan advisor keeps for
    // the carrier's winter food, the squeeze runs whatever the purses (willow's first Village winter
    // ran its larder to nothing on day 24 with the tax eased and the treasury under water).
    const spare = purse >= 2 * craftsSavings() || (p.winterFood > 0 && coins < p.winterFood);
    // Never out of the coins the plan advisor keeps for the carrier's winter food (P3A): easing in
    // autumn on them left hazel's larder at 35 Food for 119 residents in its second winter.
    const thin = purse < craftsSavings() && coins > 150 + p.winterFood && creditRoom(w) >= 300;
    if (
      spare &&
      ((net < 0 && coins < 300 && basket >= 65) || (coins < 100 && basket >= 75) || (deep && basket >= 60))
    ) {
      // The treasury slides while households get by: trim wages a little, then firm up the tax.
      if (l.wageLevel > 85 && fedOnWages) setWage(l.wageLevel - 5, 'trim wages');
      else if (l.wageLevel <= 85 && l.taxRate < Math.min(TAX_CEILING, TAX_RATE_RANGE[1]))
        setTax(Math.min(TAX_CEILING, TAX_RATE_RANGE[1], l.taxRate + 3), 'raise the income tax');
    } else if (basket < 65 && coins > 150) {
      // Households going short while the treasury can spare it: ease off.
      if (l.taxRate > 6) setTax(l.taxRate - 2, 'ease the income tax');
      else if (l.wageLevel < 110) setWage(l.wageLevel + 5, 'raise wages');
    } else if (thin) {
      // R3X: purses under the savings a Craftsfolk household puts by: tax down first, then wages back up.
      if (p.runDay - this.moved < PURSE_DAYS) {
        // A purse fills over days; ease again only once the last move has had a week to show.
      } else if (l.taxRate > 6) setTax(l.taxRate - 2, 'ease the income tax for purses');
      else if (l.wageLevel < 100) setWage(l.wageLevel + 5, 'restore wages for purses');
    } else if (net > 0 && coins > 500 && loansOwed(w) === 0) {
      // Flush: drift back toward the usual levels.
      if (l.wageLevel < 100) setWage(l.wageLevel + 5, 'restore wages');
      else if (l.taxRate > 10) setTax(l.taxRate - 2, 'ease the income tax');
    }
    // The County Bank: borrow when the treasury runs thin, repay when flush.
    const owed = loansOwed(w);
    // R1X: a tenth of the line is left unborrowed. The line is 20 coins a resident, so a town that
    // borrows to its end and then loses a few households owes past it (oak borrowed at 161 and
    // stood at 145 owing 318 coins over).
    const room = creditRoom(w);
    // C4X: near the end of the credit line, wages go to the floor (lean times are a step away).
    if (room < 400 && coins < 200 && l.wageLevel > 80 && fedOnWages) setWage(80, 'trim wages to the floor');
    // P1: a cushion of 120 coins, not 60, and repay only above 500, down to 350. P1 added coin
    // sinks (the peddler's imports, priced decor), and a player who borrows at the last coin
    // stalls the build queue for days (six seeds at day 70 with P1's first economy: 135 residents
    // on average with the old cushion, 142 with this one; main 138 either way).
    // R1X tried a 300 floor here and oak sat lean for weeks with 100 to 299 of credit unused.
    // R3X: near the line's end, borrow only a sizeable sum, or at the last coin: a growing town's line
    // opens twenty coins a newcomer, and borrowing every hundred that opened sent hazel's Ledger 12
    // loans in 70 days (the lanes test's limit is 150 decisions).
    if ((coins < 120 && room >= LOAN_MIN) || (coins < 0 && room >= 100)) {
      p.do('take a loan', [{ t: 'loan.take', coins: Math.min(room, LOAN_COINS) }]);
    } else if (owed > 0 && coins > 500 + p.winterFood) {
      // P3A: the coins the plan advisor keeps for the carrier's winter food are not spare: repaying
      // them in autumn only borrowed them back a few days later (hazel's lanes run: three repays,
      // ten loans, 162 decisions).
      const loan = w.loans.loans[0]!;
      const pay = Math.min(
        Math.ceil(loan.balance / PENNIES_PER_COIN),
        Math.floor(coins - 350 - p.winterFood),
      );
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
