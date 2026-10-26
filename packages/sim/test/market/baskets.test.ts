// C4A: needs baskets (docs/spec/13-ledger.md, Market and prices; i2-wave-notes, Purchases).
// Isolated: the functions are called directly on the village fixture (no clock), except the
// shopping outing at the end, which runs the residents' schedule for a day.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { LEDGER_CATEGORIES, PENNIES_PER_COIN } from '../../src/constants';
import type { Household, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { withoutSystems } from '../../src/systems';
import {
  basketScore,
  ensureBasket,
  GOODS_NEED,
  likeHalves,
  shopBaskets,
  shopFood,
} from '../../src/systems/market/baskets';
import { tillPrice } from '../../src/systems/market/api';
import { createTickCtx } from '../../src/turn';
import { villageFixture } from '../fixtures/village';
import { run } from '../helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { good, runDays } from './helpers';

const cat = (id: string) => LEDGER_CATEGORIES.findIndex((c) => c.id === id);
const household = (state: WorldState, id: number): Household => findById(state.households, id)!;

/** Empties the stall and stocks it with exactly these goods. */
function stall(state: WorldState, id: number, goods: [string, number][]): void {
  const rt = findById(state.buildings, id)!.rt!;
  rt.store.fill(0);
  rt.reservedOut.fill(0);
  for (const [g, n] of goods) rt.store[good(g)] = n;
}

function makeThrifty(state: WorldState, h: Household, on: boolean): void {
  for (const id of h.members) {
    const r = findById(state.residents, id)!;
    r.traits = r.traits.filter((t) => t !== 'thrifty');
    if (on && r.stage !== 'child') r.traits = ['thrifty', ...r.traits.slice(0, 1)];
  }
}

describe('preference', () => {
  it('weighs liking: Thrifty halves the difference, comfortable households lean in', () => {
    expect(likeHalves(1, true, false)).toBe(likeHalves(1, false, false));
    expect(likeHalves(1, false, true)).toBe(likeHalves(1, false, false));
    expect(likeHalves(3, true, false)).toBeLessThan(likeHalves(3, false, false));
    expect(likeHalves(3, false, true)).toBeGreaterThan(likeHalves(3, false, false));
  });
});

describe('a food outing at the till', () => {
  it('buys the best value for the household, pays the treasury and keeps the invariant', () => {
    const f = villageFixture();
    const s = f.state;
    const h = household(s, f.households[0]!);
    makeThrifty(s, h, false);
    h.savings = 5 * PENNIES_PER_COIN;
    const before = moneySnapshot(s);
    h.pantry.fill(0);
    stall(s, f.b.stalls[0], [
      ['bread', 10],
      ['vegetables', 10],
    ]);
    // Settlers like bread twice as much as vegetables; at base prices (2 and 1 coins) it is a tie
    // on value, so make bread a bargain.
    s.market.prices[good('bread')] = 150;
    s.market.prices[good('vegetables')] = 100;
    const got = shopFood(s, h, f.b.stalls[0], 2)!;
    expect(got).toEqual([good('bread'), 2]);
    expect(h.savings).toBe(5 * PENNIES_PER_COIN - 2 * tillPrice(s, good('bread')));
    expect(s.economy.today.money[cat('sales')]).toBe(2 * tillPrice(s, good('bread')));
    expectMoneyInvariant(before, s);
  });

  it('lets a Thrifty household take the cheaper loaf', () => {
    const f = villageFixture();
    const s = f.state;
    const h = household(s, f.households[0]!);
    h.pantry.fill(0);
    stall(s, f.b.stalls[0], [
      ['bread', 10],
      ['vegetables', 10],
    ]);
    s.market.prices[good('bread')] = 180;
    s.market.prices[good('vegetables')] = 100;
    h.savings = 5 * PENNIES_PER_COIN;
    makeThrifty(s, h, false);
    expect(shopFood(s, h, f.b.stalls[0], 1)![0]).toBe(good('bread'));
    h.pantry.fill(0);
    makeThrifty(s, h, true);
    expect(shopFood(s, h, f.b.stalls[0], 1)![0]).toBe(good('vegetables'));
  });

  it('applies caps and subsidies at the till and shows what they cost', () => {
    const f = villageFixture();
    const s = f.state;
    const before = moneySnapshot(s);
    const h = household(s, f.households[0]!);
    h.pantry.fill(0);
    stall(s, f.b.stalls[0], [['bread', 10]]);
    s.market.prices[good('bread')] = 400;
    run(s, { t: 'ledger.setPriceCap', good: 'bread', cap: 300, subsidy: 50 });
    expect(tillPrice(s, good('bread'))).toBe(150);
    const savings = h.savings;
    shopFood(s, h, f.b.stalls[0], 2);
    expect(savings - h.savings).toBe(300);
    expect(s.economy.today.money[cat('subsidies')]).toBe(2 * 400 - 300);
    expect(s.economy.today.money[cat('sales')]).toBe(2 * 400);
    expectMoneyInvariant(before, s);
  });

  it('puts breakfast on the slate for a household without a coin, and the basket remembers', () => {
    const f = villageFixture();
    const s = f.state;
    const h = household(s, f.households[0]!);
    ensureBasket(h);
    h.savings = 0;
    const before = moneySnapshot(s);
    h.pantry.fill(0);
    stall(s, f.b.stalls[0], [['bread', 10]]);
    const got = shopFood(s, h, f.b.stalls[0], 4)!;
    expect(got[1]).toBe(Math.min(4, h.members.length));
    expect(basketScore(h)).toBeLessThan(100);
    expect(h.savings).toBe(0);
    expectMoneyInvariant(before, s);
    // A full pantry and no coin: no slate.
    h.pantry[good('bread')] = h.members.length;
    expect(shopFood(s, h, f.b.stalls[0], 4)).toBeNull();
  });
});

describe('the household pass at 18:00', () => {
  it('buys the Craftsfolk basket, uses it up and records what everyone wanted', () => {
    const f = villageFixture();
    const s = f.state;
    const before = moneySnapshot(s);
    const h = household(s, f.craftsfolk[0]!);
    const basket = content.basketByTier.get('craftsfolk')!;
    const fw = basket.groups.findIndex((g) => g.id === 'firewood');
    const savings = h.savings;
    shopBaskets(s, createTickCtx(s));
    // Firewood: one a day per household, and the fixture has plenty.
    expect(h.basket![fw]).toBe(100);
    expect(s.economy.today.consumed[good('firewood')]).toBeGreaterThan(0);
    expect(h.savings).toBeLessThan(savings);
    // Demand: what households want, even for goods nobody stocks (cider).
    expect(s.market.demandToday[good('cider')]).toBeGreaterThan(0);
    expect(s.market.demandToday[good('bread')]).toBeGreaterThan(0);
    expectMoneyInvariant(before, s);
  });

  it('carries fractions over and lowers satisfaction for what it could not get', () => {
    const f = villageFixture();
    const s = f.state;
    const h = household(s, f.craftsfolk[0]!);
    const basket = content.basketByTier.get('craftsfolk')!;
    const cloth = basket.groups.findIndex((g) => g.id === 'cloth');
    // No cloth anywhere: a household of four owes 0.4 a day, so a unit falls due every third day.
    for (const b of s.buildings) if (b.rt) b.rt.store[good('cloth')] = 0;
    const ctx = createTickCtx(s);
    shopBaskets(s, ctx);
    expect(h.owed![cloth]).toBe(40);
    expect(h.basket![cloth]).toBe(100);
    shopBaskets(s, ctx);
    shopBaskets(s, ctx);
    expect(h.owed![cloth]).toBe(20);
    expect(h.basket![cloth]).toBe(50);
    // And the goods need follows the basket.
    const r = findById(s.residents, h.members[0]!)!;
    expect(r.needs[GOODS_NEED]).toBe(basketScore(h));
    expect(basketScore(h)).toBeLessThan(100);
  });

  it('keeps everyone content with the goods need before the market opens', () => {
    const f = villageFixture();
    const s = f.state;
    s.charter.rank = 'hamlet';
    for (const r of s.residents) r.needs[GOODS_NEED] = 40;
    withoutSystems(['residents'], () => runDays(s, 1));
    for (const r of s.residents) expect(r.needs[GOODS_NEED]).toBe(100);
  });
});

describe('shopping outings with the market open', () => {
  it('pay for their food over a day, with the money invariant intact', () => {
    const f = villageFixture();
    const s = f.state;
    const before = moneySnapshot(s);
    const sales = () => s.economy.today.money[cat('sales')]! + s.economy.yesterday.money[cat('sales')]!;
    // Households whose pantries ran low: they shop in the evening block.
    for (const id of f.households) household(s, id).pantry.fill(0);
    runDays(s, 1);
    expect(sales()).toBeGreaterThan(0);
    expectMoneyInvariant(before, s);
  });
});
