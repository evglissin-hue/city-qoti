import { describe, expect, it } from 'vitest';
import { DAYS_PER_SEASON, LEDGER_CATEGORIES, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import type { SimEvent } from '../../src/contracts';
import { LEAN_MODIFIER, PEDDLER_UNITS } from '../../src/systems/economy';
import { hamletFixture } from '../fixtures/hamlet';
import { rejection, run } from '../helpers';
import { building, everyoneToWork, good, stockOf, ticks, untilHour } from './helpers';

const cat = (id: string) => LEDGER_CATEGORIES.findIndex((c) => c.id === id);
const H = TICKS_PER_HOUR;

// The fixture's upkeep: storehouse 2, three cottages 1 each, bakery 2, windmill 2, sawpit 1 and
// the stall 1 make 11 coins a day before the dial. Nine Content residents pay 9 coins of tax.

describe('the daily books', () => {
  it('collects taxes and pays upkeep at midnight, after the dial', () => {
    const f = hamletFixture();
    const before = f.state.economy.treasury;
    untilHour(f.state, 0);
    const today = f.state.economy.today.money;
    expect(today[cat('taxes')]).toBe(900);
    // 8 coins of upkeep a day (homes have none since C3X tuning); gentle pays 70%.
    expect(today[cat('upkeep')]).toBe(560);
    expect(f.state.economy.treasury - before).toBe(340);

    const g = hamletFixture();
    g.state.settings.economy = 'thoughtful';
    untilHour(g.state, 0);
    expect(g.state.economy.today.money[cat('upkeep')]).toBe(1000);
  });

  it('taxes by mood: Glowing residents pay more, Miserable ones less', () => {
    const f = hamletFixture();
    f.state.residents.forEach((r, i) => (r.mood = i < 5 ? 90 : 10));
    untilHour(f.state, 0);
    expect(f.state.economy.today.money[cat('taxes')]).toBe(5 * 120 + 4 * 20);
  });

  it('rolls the day over: yesterday, stock history and produced counts', () => {
    const f = hamletFixture();
    f.state.economy.today.produced[good('bread')] = 7;
    building(f.state, f.b.bakery).rt!.producedToday[good('bread')] = 7;
    const events = untilHour(f.state, 0);
    const e = f.state.economy;
    expect(e.yesterday.produced[good('bread')]).toBe(7);
    expect(e.today.produced[good('bread')]).toBe(0);
    expect(building(f.state, f.b.bakery).rt!.producedToday[good('bread')]).toBe(0);
    expect(e.stockHistory).toHaveLength(1);
    expect(e.stockHistory[0]![good('bread')]).toBe(26);
    for (const kind of ['stocks.updated', 'budget.updated', 'town.updated'] as const) {
      expect(events.some((x) => x.e === kind)).toBe(true);
    }
  });

  it('closes a season, counting it in surplus when income beat expenses', () => {
    const f = hamletFixture();
    // Spring day 1 started at 06:00; the season ends at the sixth midnight.
    ticks(f.state, (DAYS_PER_SEASON - 1) * TICKS_PER_DAY + 18 * H);
    expect(f.state.economy.lastSeason).not.toBeNull();
    expect(f.state.economy.seasonsInSurplus).toBe(1);
    expect(f.state.economy.lastSeason!.money[cat('taxes')]).toBe(5 * 900);
    expect(f.state.economy.stockHistory).toHaveLength(DAYS_PER_SEASON);
  });

  it('sends reports hourly only when something changed', () => {
    const f = hamletFixture();
    untilHour(f.state, 0);
    const quiet = ticks(f.state, 3 * H);
    expect(quiet.filter((e) => e.e === 'stocks.updated')).toHaveLength(0);
    building(f.state, f.b.storehouse).rt!.store[good('logs')] = 5;
    const busy = ticks(f.state, H);
    expect(busy.filter((e) => e.e === 'stocks.updated')).toHaveLength(1);
  });
});

describe('the peddler', () => {
  it('buys up to 40 marked units at 10:00 for 60% of base price, plentiful goods first', () => {
    const f = hamletFixture();
    run(f.state, { t: 'ledger.setForSale', good: 'logs', forSale: true });
    run(f.state, { t: 'ledger.setForSale', good: 'planks', forSale: true });
    const before = f.state.economy.treasury;
    const events = untilHour(f.state, 10);
    const store = building(f.state, f.b.storehouse);
    // Logs (40) go first until they match the planks (30), then both alternate.
    expect(stockOf(store, 'store', 'logs') + stockOf(store, 'store', 'planks')).toBe(70 - PEDDLER_UNITS);
    expect(stockOf(store, 'store', 'logs')).toBe(15);
    expect(stockOf(store, 'store', 'planks')).toBe(15);
    expect(f.state.economy.treasury - before).toBe(25 * 60 + 15 * 180);
    const note = events.find(
      (e): e is Extract<SimEvent, { e: 'notify' }> => e.e === 'notify' && e.kind === 'peddler',
    );
    expect(note?.text).toBe(
      "The peddler's cart rattled off with 25 logs and 15 planks, leaving 42 coins behind.",
    );
  });

  it('stays away when nothing is for sale', () => {
    const f = hamletFixture();
    const before = f.state.economy.treasury;
    untilHour(f.state, 10);
    expect(f.state.economy.treasury).toBe(before);
  });
});

describe('lean times', () => {
  it('start when upkeep tips the treasury below zero, and end when it recovers', () => {
    const f = hamletFixture();
    f.state.settings.economy = 'thoughtful';
    f.state.economy.treasury = 50;
    const start = untilHour(f.state, 0);
    const e = f.state.economy;
    expect(e.treasury).toBe(50 + 900 - 1000);
    expect(e.leanTimes).toBe(true);
    expect(start.some((x) => x.e === 'notify' && x.kind === 'lean-times')).toBe(true);
    expect(
      f.state.residents.every((r) => r.modifiers.some((m) => m.kind === LEAN_MODIFIER && m.value === -5)),
    ).toBe(true);
    expect(rejection(run(f.state, { t: 'build.place', def: 'well', x: 47, z: 52, rot: 0 }))).toBe(
      'LEAN_TIMES',
    );

    run(f.state, { t: 'ledger.setForSale', good: 'stone', forSale: true });
    const end = untilHour(f.state, 10);
    expect(e.treasury).toBeGreaterThan(0);
    expect(e.leanTimes).toBe(false);
    expect(end.some((x) => x.e === 'notify' && x.kind === 'lean-times-over')).toBe(true);
    expect(f.state.residents.every((r) => !r.modifiers.some((m) => m.kind === LEAN_MODIFIER))).toBe(true);
  });

  it('wears buildings down while upkeep goes unpaid, and builders repair them after', () => {
    const f = hamletFixture();
    f.state.economy.treasury = -5000;
    untilHour(f.state, 0);
    const bakery = building(f.state, f.b.bakery);
    expect(f.state.economy.leanTimes).toBe(true);
    expect(f.state.economy.today.money[cat('upkeep')]).toBe(0);
    expect(bakery.rt!.condition).toBe(99); // gentle: 1 point a day
    expect(building(f.state, f.b.well).rt!.condition).toBe(100); // no upkeep, no wear
    // Still lean in the morning: builders leave the repairs for better days.
    untilHour(f.state, 8);
    everyoneToWork(f.state);
    ticks(f.state, 2 * H);
    expect(bakery.rt!.condition).toBe(99);
    f.state.economy.treasury = 1000;
    ticks(f.state, 2 * H);
    expect(f.state.economy.leanTimes).toBe(false);
    expect(bakery.rt!.condition).toBe(100);
  });
});
