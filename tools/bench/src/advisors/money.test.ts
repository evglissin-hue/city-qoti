// R3X: the money advisor reads household purses. It squeezes (trims wages, firms the tax) only while the
// median Settler purse is at least twice the Craftsfolk savings, and eases (tax down, then wages up)
// while the purse is under the savings and the treasury has its cushion.
import { content } from '@qoti/content';
import { PENNIES_PER_COIN, type Household, type WorldState } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { startingTown } from '../hamlet';
import { Planner } from '../planner';
import { medianSettlerPurse, money } from './money';

const SAVINGS = content.basketByTier.get('craftsfolk')!.savings;

/** A Village-rank town that owes over half its line (so `deep`), every household's purse set to `purse` coins. */
function seen(purse: number, coins: number): { p: Planner; w: WorldState } {
  const p = new Planner(startingTown('willow'));
  const w = p.w;
  w.charter.rank = 'village';
  w.households = [1, 2, 3].map(
    (id) => ({ id, tier: 'settler', members: [], savings: purse * PENNIES_PER_COIN }) as unknown as Household,
  );
  w.economy.treasury = coins * PENNIES_PER_COIN;
  w.loans.loans.push({ id: 9999, principal: 0, balance: 0, rate: 5, takenTick: w.tick });
  p.advisor = { id: 'money', lane: 'ledger' };
  p.runDay = 10;
  return { p, w };
}

const levers = (p: Planner) =>
  p.decisions.filter((d) => d.cmd.t === 'ledger.setTaxRate' || d.cmd.t === 'ledger.setWageLevel');

describe('the money advisor and purses', () => {
  it('reads the median Settler purse', () => {
    const { w } = seen(7, 200);
    expect(medianSettlerPurse(w)).toBe(7 * PENNIES_PER_COIN);
  });

  it('does not squeeze while purses are thin, and eases the tax instead', () => {
    const { p, w } = seen(1, 200);
    // Deep in debt (the old squeeze condition) with a basket that gets by, but thin purses.
    const owedPennies = 1000 * PENNIES_PER_COIN;
    w.loans.loans[0]!.balance = owedPennies;
    w.loans.loans[0]!.principal = owedPennies;
    w.levers.taxRate = 16;
    money.create(p).visit({ afternoon: false });
    const sent = levers(p).map((d) => d.cmd);
    expect(sent.every((c) => c.t === 'ledger.setTaxRate' && c.percent < 16)).toBe(true);
  });

  it('squeezes only once purses hold twice the Craftsfolk savings', () => {
    const wageTrims = (purse: number) => {
      const { p, w } = seen(purse, 200);
      w.loans.loans[0]!.balance = 1000 * PENNIES_PER_COIN;
      w.loans.loans[0]!.principal = 1000 * PENNIES_PER_COIN;
      w.levers.wageLevel = 100;
      money.create(p).visit({ afternoon: false });
      return levers(p).filter((d) => d.cmd.t === 'ledger.setWageLevel').length;
    };
    expect(wageTrims(2 * SAVINGS - 1)).toBe(0);
    expect(wageTrims(2 * SAVINGS)).toBe(1);
  });
});
