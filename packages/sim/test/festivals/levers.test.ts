// C5B: market days and quiet hours (docs/spec/13-ledger.md, Levers), and a resident opening a shop
// (docs/spec/11-residents.md, Ages and life events).
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { PENNIES_PER_COIN, PORTER_CARRY } from '../../src/constants';
import {
  isMarketDay,
  MARKET_CARRY,
  MARKET_FEE,
  marketFees,
  QUIET_YIELD,
  quietYield,
} from '../../src/systems/festivals/levers';
import { yieldPermille } from '../../src/systems/production/modifiers';
import { openShop, SHOP_SAVINGS, shopkeeper } from '../../src/systems/residents/shops';
import { villageFixture } from '../fixtures/village';
import { tickAt } from '../fixtures/seasonsPlace';
import { rejection, run } from '../helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { createTickCtx } from '../../src/turn';

describe('market day', () => {
  it('is a day of each season: the stall fees go to the treasury, and shoppers carry more', () => {
    const { state } = villageFixture();
    state.tick = tickAt(0, 1, 3, 10);
    expect(rejection(run(state, { t: 'ledger.setMarketDay', day: 7 }))).toBe('INVALID');
    expect(rejection(run(state, { t: 'ledger.setMarketDay', day: 3 }))).toBeUndefined();
    expect(isMarketDay(state)).toBe(true);
    for (const h of state.households) h.savings = 1000;
    const before = moneySnapshot(state);
    const treasury = state.economy.treasury;
    expect(marketFees(state)).toBe(state.households.length * MARKET_FEE);
    expect(state.economy.treasury - treasury).toBe(state.households.length * MARKET_FEE);
    expectMoneyInvariant(before, state);
    expect(MARKET_CARRY * PORTER_CARRY).toBeGreaterThan(PORTER_CARRY);
    run(state, { t: 'ledger.setMarketDay', day: null });
    expect(isMarketDay(state)).toBe(false);
  });
});

describe('quiet hours', () => {
  it('cost workshops a little output, and nothing else', () => {
    const { state } = villageFixture();
    const bakery = state.buildings.find((b) => b.def === 'bakery')!;
    const def = content.buildingById.get('bakery')!;
    const m = def.methods![0]!;
    const plain = yieldPermille(state, bakery, def, m);
    run(state, { t: 'ledger.setQuietHours', on: true });
    expect(quietYield(state, bakery, def, m)).toBe(def.tags?.includes('workshop') ? QUIET_YIELD : 1000);
    const farm = content.buildingById.get('vegetable-plot')!;
    expect(quietYield(state, bakery, farm, farm.methods![0]!)).toBe(1000);
    expect(yieldPermille(state, bakery, def, m)).toBeLessThanOrEqual(plain);
  });
});

describe('opening a shop', () => {
  it('a grown-up with savings and a fitting trait opens a named shop on a free shop lot', () => {
    const f = villageFixture();
    const state = f.state;
    for (const x of state.households) x.savings = 0;
    expect(shopkeeper(state)).toBeNull();
    const r = state.residents.find((x) => x.stage === 'adult' && x.traits.includes('cheerful'))!;
    const h = state.households.find((x) => x.id === r.householdId)!;
    h.savings = SHOP_SAVINGS * PENNIES_PER_COIN;
    const before = moneySnapshot(state);
    const b = openShop(state, createTickCtx(state))!;
    expect(b).not.toBeNull();
    expect(b.lot).toBeGreaterThan(0);
    expect(typeof b.custom?.sign).toBe('string');
    expect((b.custom!.sign as string).length).toBeLessThanOrEqual(24);
    expect(state.chronicle[state.chronicle.length - 1]!.kind).toBe('shop-opened');
    // One shop a family.
    expect(shopkeeper(state)?.h.id).not.toBe(h.id);
    expectMoneyInvariant(before, state);
  });
});
