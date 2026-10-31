// The money advisor (I2, C4A, ported in C5.0): the Ledger's money levers once the market is open
// at Village rank. Wages and tax steer where the coins pile up (it trims wages or firms up the
// income tax when purses fill while the treasury slides, and the other way round when households
// go short); the Trading Post sells what the town has plenty of and buys food when it runs short,
// through a standing order book; the County Bank tides a short treasury over and is paid back
// once flush.
import { content } from '@qoti/content';
import {
  basketScore,
  calendar,
  creditLimit,
  expenses,
  income,
  loansOwed,
  PENNIES_PER_COIN,
  rankAtLeast,
  tradingPost,
} from '@qoti/sim';
import type { Planner } from '../planner';
import { count, G } from '../town';
import type { Advisor, AdvisorDef } from './types';

class Money implements Advisor {
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
    const setWage = (percent: number, why: string) =>
      percent !== l.wageLevel && p.do(why, [{ t: 'ledger.setWageLevel', percent }]);
    const setTax = (percent: number, why: string) =>
      percent !== l.taxRate && p.do(why, [{ t: 'ledger.setTaxRate', percent }]);
    // C4X: or whenever the treasury is nearly empty while households get by (purses held four
    // thousand coins while the town could not afford a cider press).
    if ((net < 0 && coins < 300 && basket >= 65) || (coins < 100 && basket >= 75)) {
      // The treasury slides while households get by: trim wages a little, then firm up the tax.
      if (l.wageLevel > 85) setWage(l.wageLevel - 5, 'trim wages');
      else if (l.taxRate < 20) setTax(l.taxRate + 2, 'raise the income tax');
    } else if (basket < 65 && coins > 150) {
      // Households going short while the treasury can spare it: ease off.
      if (l.taxRate > 6) setTax(l.taxRate - 2, 'ease the income tax');
      else if (l.wageLevel < 110) setWage(l.wageLevel + 5, 'raise wages');
    } else if (net > 0 && coins > 500) {
      // Flush: drift back toward the usual levels.
      if (l.wageLevel < 100) setWage(l.wageLevel + 5, 'restore wages');
      else if (l.taxRate > 10) setTax(l.taxRate - 2, 'ease the income tax');
    }
    // The County Bank: borrow when the treasury runs thin, repay when flush.
    const owed = loansOwed(w);
    const room = Math.floor((creditLimit(w) - owed) / PENNIES_PER_COIN);
    // C4X: near the end of the credit line, wages go to the floor (lean times are a step away).
    if (room < 400 && coins < 200 && l.wageLevel > 80) setWage(80, 'trim wages to the floor');
    if (coins < 60 && room >= 100) {
      p.do('take a loan', [{ t: 'loan.take', coins: Math.min(room, 300) }]);
    } else if (owed > 0 && coins > 350) {
      const loan = w.loans.loans[0]!;
      const pay = Math.min(Math.ceil(loan.balance / PENNIES_PER_COIN), Math.floor(coins - 250));
      if (pay > 0) p.do('repay a loan', [{ t: 'loan.repay', id: loan.id, coins: pay }]);
    }
    // The Trading Post, when the content has one: build it, then keep a standing order book.
    if (content.buildingById.has('trading-post') && count(w, 'trading-post') === 0 && coins > 150) {
      p.build('trading-post');
    }
    if (!tradingPost(w)) return;
    const pop = w.residents.length;
    // C5A: from late spring to the thaw the seasons advisor raises the food reserve; the book keeps
    // a winter's food and buys a little in when the larder runs low in winter.
    const winter = p.foodReserveDays >= 8;
    const keep = winter ? pop * 6 + 10 : pop + 10;
    const low = winter && calendar(w.tick).season === 3 ? pop : 0;
    // Sell what the town has plenty of; buy food only when the larder runs low.
    const book: [good: string, min: number, max: number][] = [
      // C4X: 60 planks in hand, not 30, so a tavern (24) or a townhouse can still be started.
      ['planks', 0, 60],
      ['logs', 0, 40],
      ['bread', low, keep],
      ['fish', 0, keep],
      ['vegetables', low, keep],
      ['apples', Math.ceil(pop / 4), 1000],
      // C4X: what the Village makes past its own needs pays for its upkeep, sites and loans:
      // cloth and cider beyond a few days' shelves, bricks beyond the next few buildings.
      ['bricks', 0, 60],
      ['cider', 0, Math.max(20, Math.ceil(pop / 4))],
      ['cloth', 0, Math.max(20, Math.ceil(pop / 5))],
    ];
    for (const [good, min, max] of book) {
      const g = G(good);
      const o = w.trade.orders.find((x) => x.good === g);
      if (o && o.min === min && o.max === max) continue;
      if (o && Math.abs(o.min - min) + Math.abs(o.max - max) < 6) continue;
      p.do(`order ${good}`, [
        {
          t: 'trade.setStandingOrder',
          good,
          order: { min, max, floor: 0, ceiling: Math.round(content.goods[g]!.basePrice * 1.6), neighbor: '' },
        },
      ]);
    }
  }
}

export const money: AdvisorDef = {
  id: 'money',
  slot: 40,
  plays: () => true,
  create: (p) => new Money(p),
};
