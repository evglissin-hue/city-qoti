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
  basketGroups,
  basketScore,
  ensureBasket,
  GOODS_NEED,
  likeHalves,
  shopBaskets,
  shopFood,
} from '../../src/systems/market/baskets';
import { tillPrice } from '../../src/systems/market/api';
import { createTickCtx } from '../../src/turn';
import { tickAt } from '../fixtures/seasonsPlace';
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
  // R1.0 stand-in: R1A/R1B rewrites this. Every flavor of a family weighs 1, so value for money is
  // price alone.
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
    // Bread and vegetables are liked alike, so the cheaper wins: make vegetables the bargain.
    s.market.prices[good('bread')] = 150;
    s.market.prices[good('vegetables')] = 100;
    const got = shopFood(s, h, f.b.stalls[0], 2)!;
    expect(got).toEqual([good('vegetables'), 2]);
    expect(h.savings).toBe(5 * PENNIES_PER_COIN - 2 * tillPrice(s, good('vegetables')));
    expect(s.economy.today.money[cat('sales')]).toBe(2 * tillPrice(s, good('vegetables')));
    expectMoneyInvariant(before, s);
  });

  // R1.0 stand-in: R1A/R1B rewrites this. With every flavor weighing 1, Thrifty or not, a household
  // takes the cheaper food (likeHalves above still checks how Thrifty weighs a liking).
  it('takes the cheaper food, Thrifty or not', () => {
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
    expect(shopFood(s, h, f.b.stalls[0], 1)![0]).toBe(good('vegetables'));
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

  it('puts breakfast on the slate for a household with nobody in work, and the basket remembers', () => {
    const f = villageFixture();
    const s = f.state;
    // The house families have no jobs; the cottage families do, and pay their way.
    const working = household(s, f.households[0]!);
    working.savings = 0;
    working.pantry.fill(0);
    working.arrivedDay = -10;
    stall(s, f.b.stalls[0], [['bread', 10]]);
    expect(shopFood(s, working, f.b.stalls[0], 4)).toBeNull();
    const h = household(s, f.households[8]!);
    h.arrivedDay = -10;
    ensureBasket(h);
    h.savings = 0;
    const before = moneySnapshot(s);
    h.pantry.fill(0);
    stall(s, f.b.stalls[0], [['bread', 10]]);
    const got = shopFood(s, h, f.b.stalls[0], 4)!;
    expect(got[1]).toBe(Math.min(4, h.members.length));
    expect(basketScore(s, h)).toBeLessThan(100);
    expect(h.savings).toBe(0);
    expectMoneyInvariant(before, s);
    // A full pantry and no coin: no slate.
    h.pantry[good('bread')] = h.members.length;
    expect(shopFood(s, h, f.b.stalls[0], 4)).toBeNull();
  });
});

describe('the household pass at 18:00', () => {
  // R1.0 stand-in: R1A/R1B rewrites this. Baskets want families: Fuel a household a day in winter.
  it('buys the Craftsfolk basket, uses it up and records what everyone wanted', () => {
    const f = villageFixture();
    const s = f.state;
    s.tick = tickAt(0, 3, 2, 18);
    const before = moneySnapshot(s);
    const h = household(s, f.craftsfolk[0]!);
    const basket = content.basketByTier.get('craftsfolk')!;
    const fw = basketGroups(basket).findIndex((g) => g.id === 'fuel');
    const savings = h.savings;
    shopBaskets(s, createTickCtx(s));
    // Fuel: one firewood a day per household in winter, and the fixture has plenty.
    expect(h.basket![fw]).toBe(100);
    expect(s.economy.today.consumed[good('firewood')]).toBeGreaterThan(0);
    expect(h.savings).toBeLessThan(savings);
    // Demand: what households want, even for goods nobody stocks (cider, a Treat).
    expect(s.market.demandToday[good('cider')]).toBeGreaterThan(0);
    expect(s.market.demandToday[good('bread')]).toBeGreaterThan(0);
    expectMoneyInvariant(before, s);
  });

  // R1.0 stand-in: R1A/R1B rewrites this. Wares are a family: any of cloth, furniture or candles.
  it('carries fractions over and lowers satisfaction for what it could not get', () => {
    const f = villageFixture();
    const s = f.state;
    const h = household(s, f.craftsfolk[0]!);
    const basket = content.basketByTier.get('craftsfolk')!;
    const wares = basketGroups(basket).findIndex((g) => g.id === 'wares');
    // No Wares anywhere: a household owes 0.2 a day, so a unit falls due every fifth day.
    for (const b of s.buildings)
      if (b.rt) for (const id of ['cloth', 'furniture', 'candles']) b.rt.store[good(id)] = 0;
    const ctx = createTickCtx(s);
    shopBaskets(s, ctx);
    expect(h.owed![wares]).toBe(20);
    expect(h.basket![wares]).toBe(100);
    for (let day = 2; day <= 5; day++) shopBaskets(s, ctx);
    expect(h.owed![wares]).toBe(0);
    expect(h.basket![wares]).toBe(50);
    // And the goods need follows the basket.
    const r = findById(s.residents, h.members[0]!)!;
    expect(r.needs[GOODS_NEED]).toBe(basketScore(s, h));
    expect(basketScore(s, h)).toBeLessThan(100);
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
