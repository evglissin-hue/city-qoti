// R1A: the carrier (docs/spec/13-ledger.md, The carrier and trade). Each case sets the clock and
// the stores by hand and calls the 10:00 visit directly, so no other system moves the goods.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { LEDGER_CATEGORIES, PEDDLER_TERMS, TICKS_PER_DAY, TRADE_BUY_PERCENT } from '../../src/constants';
import type { SimEvent, WorldState } from '../../src/contracts';
import { insertBuilding } from '../../src/state/place';
import { carrierDay, makersShort, tabCap } from '../../src/systems/carrier';
import { carrierCovers, passClosed, PASS_EVENT, winterMark } from '../../src/systems/carrier/api';
import {
  BOAT_BUY_PERCENT,
  carrierBuyPrice,
  carrierTerms,
  POST_CART_UNITS,
  POST_UNITS_BY_RANK,
} from '../../src/systems/carrier/terms';
import { dayIndex } from '../../src/systems/economy/time';
import { chargeInterest } from '../../src/systems/loans';
import { carrierCap } from '../../src/systems/market';
import { seasonOffers } from '../../src/systems/trade';
import { markSeen } from '../../src/systems/market/balances';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { tickAt } from '../fixtures/seasonsPlace';
import { villageFixture } from '../fixtures/village';
import { run } from '../helpers';
import { building, good, hire } from '../ledger/helpers';
import { withTradingPost } from '../market/helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';

const cat = (id: string) => LEDGER_CATEGORIES.findIndex((c) => c.id === id);

/** Empties every store, shelf, buffer and pantry. */
function emptyTown(state: WorldState): void {
  for (const b of state.buildings) {
    if (!b.rt) continue;
    b.rt.store.fill(0);
    b.rt.output.fill(0);
    b.rt.input.fill(0);
  }
  for (const h of state.households) h.pantry.fill(0);
}

/** The 10:00 visit on a given day, with its events. */
function visit(state: WorldState, season = 0, day = 2, year = 0): SimEvent[] {
  state.tick = tickAt(year, season, day, 10);
  const ctx = createTickCtx(state);
  carrierDay(state, ctx);
  return ctx.events;
}

const today = (s: WorldState) => s.carrier.bought[s.carrier.bought.length - 1]!;
const soldToday = (s: WorldState) => s.carrier.sold[s.carrier.sold.length - 1]!;
const familyUnits = (row: readonly number[], family: string) =>
  content.goods.reduce((t, g, i) => t + (g.family === family ? (row[i] ?? 0) : 0), 0);
const note = (events: SimEvent[]) =>
  events.find((e): e is Extract<SimEvent, { e: 'notify' }> => e.e === 'notify' && e.kind === 'carrier')?.text;

describe('the buying order', () => {
  it('brings Food first, then what a site waits for, within the load', () => {
    const f = hamletFixture();
    emptyTown(f.state);
    const site = insertBuilding(f.state, null, content.buildingById.get('windmill')!, 90, 90, 0, 0, {
      site: true,
    });
    site.rt!.construction!.needs.fill(0);
    site.rt!.construction!.needs[good('stone')] = 30;
    const residents = f.state.residents.length;
    visit(f.state);
    const row = today(f.state);
    // Food a day for every resident, then the rest of the 20 units to the site.
    expect(familyUnits(row, 'food')).toBe(residents);
    expect(row[good('stone')]).toBe(PEDDLER_TERMS.units - residents);
  });

  it('brings essentials outside the budget, and reserves only within it', () => {
    const f = hamletFixture();
    emptyTown(f.state);
    run(f.state, { t: 'carrier.setBudget', coins: 0 });
    const before = moneySnapshot(f.state);
    visit(f.state);
    // A day's eating came; the three days' reserve did not.
    expect(familyUnits(today(f.state), 'food')).toBe(f.state.residents.length);
    expect(f.state.economy.today.money[cat('imports')]).toBeGreaterThan(0);
    expectMoneyInvariant(before, f.state);
  });

  it('fills the Food reserve on Always, the cheapest flavor first', () => {
    const f = hamletFixture();
    emptyTown(f.state);
    run(f.state, { t: 'carrier.setBudget', coins: 1000 });
    visit(f.state);
    const food = familyUnits(today(f.state), 'food');
    expect(food).toBe(Math.min(PEDDLER_TERMS.units, 3 * f.state.residents.length));
    // Grain is the cheapest Food any neighbor sells.
    expect(today(f.state)[good('grain')]).toBeGreaterThan(0);
  });

  it('buys nothing on Never, and nothing a neighbor does not sell', () => {
    const f = hamletFixture();
    emptyTown(f.state);
    for (const fam of ['food', 'fuel', 'materials', 'wares', 'treats'] as const)
      run(f.state, { t: 'carrier.setRule', family: fam, rule: 'never', sell: false });
    visit(f.state);
    expect(today(f.state).every((n) => n === 0)).toBe(true);
    run(f.state, { t: 'carrier.setRule', family: 'food', rule: 'always', sell: false });
    visit(f.state, 0, 3);
    expect(today(f.state)[good('bread')]).toBe(0);
    expect(today(f.state)[good('fish')]).toBe(0);
  });
});

describe('a maker short of its raw good', () => {
  it('gets it next morning while its family rule lets the carrier buy', () => {
    const f = hamletFixture();
    emptyTown(f.state);
    const bakery = building(f.state, f.b.bakery);
    if (bakery.rt!.workers.length === 0) hire(f.state, bakery.id, 1);
    expect(carrierCovers(f.state, bakery, good('grain'))).toBe(true);
    expect(makersShort(f.state)[good('grain')]).toBeGreaterThan(0);
    // Food on Essentials only: the baker's grain still comes, as an essential.
    run(f.state, { t: 'carrier.setRule', family: 'food', rule: 'essentials', sell: false });
    for (const h of f.state.households) h.pantry[good('vegetables')] = 8;
    visit(f.state);
    expect(today(f.state)[good('grain')]).toBeGreaterThanOrEqual(makersShort(f.state)[good('grain')]!);
  });

  it('gets it on the County tab when the treasury cannot pay', () => {
    const f = hamletFixture();
    emptyTown(f.state);
    for (const h of f.state.households) h.pantry[good('vegetables')] = 8;
    const bakery = building(f.state, f.b.bakery);
    if (bakery.rt!.workers.length === 0) hire(f.state, bakery.id, 1);
    f.state.economy.treasury = 0;
    const before = moneySnapshot(f.state);
    visit(f.state);
    expect(today(f.state)[good('grain')]).toBeGreaterThan(0);
    expect(f.state.carrier.tab).toBeGreaterThan(0);
    expectMoneyInvariant(before, f.state);
  });

  it('waits on Never', () => {
    const f = hamletFixture();
    emptyTown(f.state);
    run(f.state, { t: 'carrier.setRule', family: 'food', rule: 'never', sell: false });
    const bakery = building(f.state, f.b.bakery);
    expect(carrierCovers(f.state, bakery, good('grain'))).toBe(false);
    visit(f.state);
    expect(today(f.state)[good('grain')]).toBe(0);
  });
});

describe('the County tab', () => {
  it('carries households their Food on the tab when the treasury cannot pay, up to the cap', () => {
    const f = hamletFixture();
    emptyTown(f.state);
    f.state.economy.treasury = 0;
    const before = moneySnapshot(f.state);
    const events = visit(f.state);
    expect(familyUnits(today(f.state), 'food')).toBe(f.state.residents.length);
    expect(f.state.carrier.tab).toBeGreaterThan(0);
    expect(f.state.economy.treasury).toBe(0);
    expect(note(events)).toMatch(/on the County tab/);
    expectMoneyInvariant(before, f.state);

    // At the cap nothing more comes, and the notice says so.
    emptyTown(f.state);
    f.state.carrier.tab = tabCap(f.state);
    const capped = visit(f.state, 0, 3);
    expect(familyUnits(today(f.state), 'food')).toBe(0);
    expect(note(capped)).toMatch(/County tab is full/);
  });

  it('never carries Materials on the tab', () => {
    const f = hamletFixture();
    emptyTown(f.state);
    building(f.state, f.b.bakery).rt!.input[good('grain')] = 8;
    for (const h of f.state.households) h.pantry[good('vegetables')] = 8;
    f.state.economy.treasury = 0;
    const site = insertBuilding(f.state, null, content.buildingById.get('windmill')!, 90, 90, 0, 0, {
      site: true,
    });
    site.rt!.construction!.needs.fill(0);
    site.rt!.construction!.needs[good('stone')] = 6;
    visit(f.state);
    expect(today(f.state)[good('stone')]).toBe(0);
    expect(f.state.carrier.tab).toBe(0);
  });

  it('is paid down from the budget and charged a season like a loan', () => {
    const f = hamletFixture();
    for (const h of f.state.households) h.pantry[good('vegetables')] = 8;
    f.state.carrier.tab = 1500;
    const before = moneySnapshot(f.state);
    visit(f.state);
    expect(f.state.carrier.tab).toBeLessThan(1500);
    expect(f.state.economy.today.money[cat('repayments')]).toBe(1500 - f.state.carrier.tab);
    expectMoneyInvariant(before, f.state);

    f.state.carrier.tab = 1000;
    const ctx = createTickCtx(f.state);
    const treasury = f.state.economy.treasury;
    chargeInterest(f.state, ctx);
    expect(f.state.economy.treasury).toBe(treasury - 50);
    expectMoneyInvariant(before, f.state);
    f.state.economy.treasury = 0;
    const broke = moneySnapshot(f.state);
    chargeInterest(f.state, ctx);
    expect(f.state.carrier.tab).toBe(1050);
    expectMoneyInvariant(broke, f.state);
  });
});

describe('the closed pass', () => {
  it('keeps the cart away, says so on the first day, and reads in the view', () => {
    const f = hamletFixture();
    emptyTown(f.state);
    const start = tickAt(0, 3, 3, 0);
    f.state.weather.events.push({
      id: f.state.nextId++,
      event: PASS_EVENT,
      start,
      end: start + 2 * TICKS_PER_DAY,
      forecastTick: start - TICKS_PER_DAY,
    });
    const events = visit(f.state, 3, 3);
    expect(passClosed(f.state)).toBe(true);
    expect(today(f.state).every((n) => n === 0)).toBe(true);
    expect(note(events)).toMatch(/Snow has shut the valley road/);
    const second = visit(f.state, 3, 4);
    expect(today(f.state).every((n) => n === 0)).toBe(true);
    expect(note(second)).toBeUndefined();
    visit(f.state, 3, 5);
    expect(passClosed(f.state)).toBe(false);
    expect(familyUnits(today(f.state), 'food')).toBeGreaterThan(0);
  });

  it('comes every winter on the season card, a day long on Gentle', () => {
    expect(content.seasons[3]!.events).toContain(PASS_EVENT);
    expect(content.eventById.get(PASS_EVENT)!.yearly).toBe(true);
  });
});

describe('selling and the winter marks', () => {
  function overstocked(units: number) {
    const f = hamletFixture();
    emptyTown(f.state);
    building(f.state, f.b.granary).rt!.store[good('grain')] = units;
    return f;
  }

  it('sells what is over twice the reserve in spring', () => {
    const f = overstocked(200);
    const before = moneySnapshot(f.state);
    visit(f.state, 0, 2);
    expect(soldToday(f.state)[good('grain')]).toBeGreaterThan(0);
    expect(f.state.economy.today.money[cat('exports')]).toBeGreaterThan(0);
    expectMoneyInvariant(before, f.state);
  });

  it('sells nothing under the winter mark from Summer day 4', () => {
    const residents = hamletFixture().state.residents.length;
    // Over twice the 3-day reserve, under the 8-day mark.
    const f = overstocked(7 * residents);
    visit(f.state, 0, 2);
    expect(soldToday(f.state)[good('grain')]).toBeGreaterThan(0);
    const g = overstocked(7 * residents);
    visit(g.state, 1, 4);
    expect(winterMark(g.state, 0)).toBe(8);
    expect(soldToday(g.state)[good('grain')]).toBe(0);
  });

  it('buys toward the mark from Autumn day 4, not before', () => {
    const f = hamletFixture();
    emptyTown(f.state);
    run(f.state, { t: 'carrier.setBudget', coins: 1000 });
    withTradingPost(f.state, () => {
      const residents = f.state.residents.length;
      const granary = building(f.state, f.b.granary).rt!;
      granary.store[good('grain')] = 2 * residents;
      granary.store[good('vegetables')] = residents;
      granary.store[good('cheese')] = residents;
      // Three flavors on offer to every home (the Charter asks three), so none is lacking and only
      // the mark moves the carrier.
      f.state.tick = tickAt(0, 2, 3, 10);
      markSeen(f.state);
      visit(f.state, 2, 3);
      expect(familyUnits(today(f.state), 'food')).toBe(0);
      visit(f.state, 2, 4);
      expect(familyUnits(today(f.state), 'food')).toBeGreaterThan(0);
    });
  });
});

describe('variety', () => {
  it('buys a flavor some tier lacks before the cheapest', () => {
    const f = villageFixture();
    emptyTown(f.state);
    run(f.state, { t: 'carrier.setBudget', coins: 1000 });
    // Grain on every shelf, seen by every home; Craftsfolk want three flavors.
    const n = content.goods.length;
    for (const h of f.state.households) {
      h.seen = new Array<number>(n).fill(-1);
      h.seen[good('grain')] = dayIndex(tickAt(0, 0, 2, 10));
    }
    visit(f.state);
    const row = today(f.state);
    const flavors = content.goods.filter((g, i) => g.family === 'food' && i !== good('grain') && row[i]! > 0);
    expect(flavors.length).toBeGreaterThanOrEqual(1);
  });
});

describe('terms', () => {
  it('carries more with a Trading Post by rank and carts, and the boat at 110 percent', () => {
    const f = villageFixture();
    withTradingPost(f.state, () => {
      expect(carrierTerms(f.state).units).toBe(
        POST_UNITS_BY_RANK[1] + POST_CART_UNITS * Math.min(3, f.state.carts.length),
      );
      expect(carrierTerms(f.state).buy).toBe(TRADE_BUY_PERCENT);
    });
    const boat = carrierBuyPrice(f.state, 'millhaven', good('grain'), BOAT_BUY_PERCENT)!;
    const cart = carrierBuyPrice(f.state, 'millhaven', good('grain'))!;
    expect(boat).toBeLessThan(cart);
  });

  it('takes a deal for a season through the plan', () => {
    const f = hamletFixture();
    f.state.tick = tickAt(0, 0, 1, 1);
    const offers = seasonOffers(f.state);
    expect(offers.length).toBeGreaterThan(0);
    f.state.carrier.offers = offers;
    const buy = offers.find((o) => o.side === 'buy')!;
    const g = content.goods.findIndex(
      (x) =>
        x.family === buy.family && content.neighborById.get(buy.neighbor)!.sells.some(([id]) => id === x.id),
    );
    const plain = carrierBuyPrice(f.state, buy.neighbor, g)!;
    run(f.state, { t: 'season.setPlan', plan: { deal: buy.id } });
    expect(carrierBuyPrice(f.state, buy.neighbor, g)!).toBeLessThan(plain);
  });

  it('caps a price at what the carrier pays plus a tenth while it runs for the family', () => {
    const f = hamletFixture();
    const g = good('grain');
    const best = carrierBuyPrice(f.state, 'millhaven', g)!;
    expect(carrierCap(f.state, g, 10 * best)).toBe(Math.floor((best * 110) / 100));
    run(f.state, { t: 'carrier.setRule', family: 'food', rule: 'never', sell: false });
    expect(carrierCap(f.state, g, 10 * best)).toBe(10 * best);
  });
});
