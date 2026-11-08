// C4A acceptance: the money invariant across a 10-day headless run of the village with every flow
// at work: wages and income tax, purchases at the till (outings and the household pass), price
// caps and subsidies, the Trading Post's caravans both ways, a fresh loan, a repayment and a
// season's interest. Nothing isolated: every system runs, as in the game.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { LEDGER_CATEGORIES, PRICE_CLAMP, TICKS_PER_DAY } from '../../src/constants';
import { hashState } from '../../src/state/hash';
import { applyTurn, createTickCtx } from '../../src/turn';
import { villageFixture } from '../fixtures/village';
import { run } from '../helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { withTradingPost } from './helpers';

const cat = (id: string) => LEDGER_CATEGORIES.findIndex((c) => c.id === id);

function tenDays() {
  const f = villageFixture();
  const s = f.state;
  const totals = new Array<number>(LEDGER_CATEGORIES.length).fill(0);
  withTradingPost(s, () => {
    const start = moneySnapshot(s);
    run(s, {
      t: 'trade.setStandingOrder',
      good: 'planks',
      order: { min: 0, max: 40, floor: 0, ceiling: 0, neighbor: '' },
    });
    run(s, {
      t: 'trade.setStandingOrder',
      good: 'wheat',
      order: { min: 40, max: 999, floor: 0, ceiling: 0, neighbor: '' },
    });
    run(s, {
      t: 'trade.setStandingOrder',
      good: 'apples',
      order: { min: 20, max: 999, floor: 0, ceiling: 0, neighbor: '' },
    });
    run(s, { t: 'ledger.setPriceCap', good: 'bread', cap: 250, subsidy: 10 });
    run(s, { t: 'ledger.setTaxRate', percent: 14 });
    run(s, { t: 'loan.take', coins: 200 });
    const ctx = createTickCtx(s);
    for (let day = 1; day <= 10; day++) {
      const end = day * TICKS_PER_DAY;
      while (s.tick < end) applyTurn(s, { t: s.lastTurn + 1, cmds: [] }, ctx);
      ctx.events.length = 0;
      if (day === 4) {
        const loan = s.loans.loans[s.loans.loans.length - 1]!;
        run(s, { t: 'loan.repay', id: loan.id, coins: 50 });
        run(s, { t: 'ledger.setWageLevel', percent: 90 });
      }
      // Every day: no money made or lost inside the valley.
      expectMoneyInvariant(start, s);
      for (let i = 0; i < totals.length; i++) totals[i]! += s.economy.yesterday.money[i]!;
      for (let g = 0; g < content.goods.length; g++) {
        const base = content.goods[g]!.basePrice;
        expect(s.market.prices[g]!).toBeGreaterThanOrEqual((base * PRICE_CLAMP[0]) / 100);
        expect(s.market.prices[g]!).toBeLessThanOrEqual((base * PRICE_CLAMP[1]) / 100);
      }
    }
  });
  return { s, totals };
}

describe('ten days of village money', { timeout: 60_000 }, () => {
  it('keeps the invariant with wages, purchases, taxes, trade and loans all moving', () => {
    const { s, totals } = tenDays();
    for (const id of ['wages', 'sales', 'taxes', 'exports', 'imports', 'loans', 'repayments', 'interest']) {
      expect(totals[cat(id)], id).toBeGreaterThan(0);
    }
    // Households hold real money and the books know who has it.
    expect(s.households.some((h) => h.savings > 0)).toBe(true);
    expect(s.trade.log.length).toBeGreaterThan(0);
    expect(s.market.history.length).toBeGreaterThan(10);
  });

  it('plays the same way twice', () => {
    expect(hashState(tenDays().s)).toBe(hashState(tenDays().s));
  });
});
