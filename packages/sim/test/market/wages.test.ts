// C4A: wages and income tax (docs/spec/13-ledger.md, Market and prices; i2-wave-notes, Wages).
// Isolated: the residents' schedule and the household pass are off while the clock runs, so
// workers stay assigned and purses change only through wages and taxes.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { LEDGER_CATEGORIES, PENNIES_PER_COIN, WAGES } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { withoutSystems } from '../../src/systems';
import { overdraftLimit } from '../../src/systems/loans/credit';
import { incomeTax, payWages, wageBill } from '../../src/systems/market/wages';
import { createTickCtx } from '../../src/turn';
import { villageFixture } from '../fixtures/village';
import { run } from '../helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { untilDaily } from './helpers';

const cat = (id: string) => LEDGER_CATEGORIES.findIndex((c) => c.id === id);
const ISOLATE = ['residents', 'baskets', 'caravans'];

function workersOf(state: WorldState): number {
  let n = 0;
  for (const b of state.buildings) if (b.stage === 'built' && b.rt) n += b.rt.workers.length;
  return n;
}

const total = (bill: Map<number, number>) => [...bill.values()].reduce((a, b) => a + b, 0);

describe('wages', () => {
  it('pays each worker the tier wage into their household, and takes the income tax back', () => {
    const { state } = villageFixture();
    const before = moneySnapshot(state);
    const treasury = state.economy.treasury;
    const bill = wageBill(state);
    // Every fixture job is a Settler job.
    expect(total(bill)).toBe(workersOf(state) * WAGES[0]);
    const savings = new Map(state.households.map((h) => [h.id, h.savings]));
    payWages(state, createTickCtx(state));
    let tax = 0;
    for (const h of state.households) {
      const gross = bill.get(h.id) ?? 0;
      tax += incomeTax(state, gross);
      expect(h.savings - savings.get(h.id)!).toBe(gross - incomeTax(state, gross));
    }
    expect(state.economy.treasury).toBe(treasury - total(bill) + tax);
    expect(state.economy.today.money[cat('wages')]).toBe(total(bill));
    expect(state.economy.today.money[cat('taxes')]).toBe(tax);
    expectMoneyInvariant(before, state);
  });

  it('follows the wage and tax levers', () => {
    const { state } = villageFixture();
    const before = moneySnapshot(state);
    const base = total(wageBill(state));
    run(state, { t: 'ledger.setWageLevel', percent: 80 });
    expect(total(wageBill(state))).toBe(Math.round((base * 80) / 100));
    run(state, { t: 'ledger.setTaxRate', percent: 20 });
    expect(incomeTax(state, 1000)).toBe(200);
    run(state, { t: 'ledger.setTaxRate', percent: 0 });
    const treasury = state.economy.treasury;
    payWages(state, createTickCtx(state));
    expect(state.economy.treasury).toBe(treasury - Math.round((base * 80) / 100));
    expectMoneyInvariant(before, state);
  });

  it('pays a skilled job the skilled wage', () => {
    const { state, b } = villageFixture();
    const jobs = content.buildingById.get('bakery')!.jobs as { tier?: string };
    const was = jobs.tier;
    jobs.tier = 'craftsfolk';
    try {
      const baker = findById(state.residents, findById(state.buildings, b.bakery)!.rt!.workers[0]!)!;
      const household = findById(state.households, baker.householdId)!;
      const bakers = household.members.filter(
        (id) => findById(state.residents, id)!.jobId === b.bakery,
      ).length;
      expect(wageBill(state).get(household.id)).toBe(bakers * WAGES[1]);
    } finally {
      if (was === undefined) delete jobs.tier;
      else jobs.tier = was;
    }
  });

  it('runs at 17:00 at Village rank and not before it', () => {
    const { state } = villageFixture();
    state.charter.rank = 'hamlet';
    const before = moneySnapshot(state);
    withoutSystems(ISOLATE, () => untilDaily(state, 17, 5));
    expect(state.economy.today.money[cat('wages')]).toBe(0);
    state.charter.rank = 'village';
    withoutSystems(ISOLATE, () => untilDaily(state, 17, 5));
    expect(state.economy.today.money[cat('wages')]).toBe(workersOf(state) * WAGES[0]);
    expectMoneyInvariant(before, state);
  });

  it('in lean times pays out only what the till took in yesterday', () => {
    const { state } = villageFixture();
    const before = moneySnapshot(state);
    // Spend the treasury past the credit line (the world outside took it).
    const spend = state.economy.treasury + overdraftLimit(state) + 100 * PENNIES_PER_COIN;
    state.economy.treasury -= spend;
    state.economy.external -= spend;
    state.economy.yesterday.money[cat('sales')] = 1000;
    state.economy.yesterday.money[cat('taxes')] = 200;
    payWages(state, createTickCtx(state));
    const paid = state.economy.today.money[cat('wages')]!;
    expect(paid).toBeLessThanOrEqual(1200);
    expect(paid).toBeGreaterThan(1200 - state.households.length);
    expectMoneyInvariant(before, state);
  });
});

describe('income tax replaces the flat tax at Village rank', () => {
  it('books no flat tax at midnight once the market is open, and the I1 tax before it', () => {
    const village = villageFixture().state;
    withoutSystems(ISOLATE, () => untilDaily(village, 0, 1));
    expect(village.economy.today.money[cat('taxes')]).toBe(0);
    const hamlet = villageFixture().state;
    hamlet.charter.rank = 'hamlet';
    withoutSystems(ISOLATE, () => untilDaily(hamlet, 0, 1));
    expect(hamlet.economy.today.money[cat('taxes')]).toBeGreaterThan(0);
  });
});
