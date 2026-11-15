import { describe, expect, it } from 'vitest';
import { DAYS_PER_SEASON, LEDGER_CATEGORIES, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import { LEAN_MODIFIER } from '../../src/systems/economy';
import { townStock } from '../../src/view/hamlet';
import { hamletFixture } from '../fixtures/hamlet';
import { rejection, run } from '../helpers';
import { building, everyoneToWork, good, ticks, untilHour } from './helpers';

const cat = (id: string) => LEDGER_CATEGORIES.findIndex((c) => c.id === id);
const H = TICKS_PER_HOUR;

// The fixture's upkeep (R1): storehouse 2, granary 2, the baker's workshop 1, windmill 2, the
// Forester's Lodge 1 and the stall 1 make 9 coins a day before the dial (homes, the town hall and
// the well have none). Nine Content residents pay 9 coins of tax.

describe('the daily books', () => {
  it('collects taxes and pays upkeep at midnight, after the dial', () => {
    const f = hamletFixture();
    const before = f.state.economy.treasury;
    untilHour(f.state, 0);
    const today = f.state.economy.today.money;
    expect(today[cat('taxes')]).toBe(900);
    // 9 coins of upkeep a day; gentle pays 70%.
    expect(today[cat('upkeep')]).toBe(630);
    // R1: the carrier's trade at 10:00 (yesterday's imports and exports, now) is the rest.
    const y = f.state.economy.yesterday.money;
    expect(f.state.economy.treasury - before).toBe(900 - 630 - y[cat('imports')]! + y[cat('exports')]!);

    const g = hamletFixture();
    g.state.settings.economy = 'thoughtful';
    untilHour(g.state, 0);
    expect(g.state.economy.today.money[cat('upkeep')]).toBe(1125);
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
    // The day's closing stock (the carrier traded at 10:00, so not the morning's).
    expect(e.stockHistory[0]).toEqual(townStock(f.state));
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
    building(f.state, f.b.storehouse).rt!.store[good('timber')] = 5;
    const busy = ticks(f.state, H);
    expect(busy.filter((e) => e.e === 'stocks.updated')).toHaveLength(1);
  });
});

describe('lean times', () => {
  it('start when upkeep tips the treasury below zero, and end when it recovers', () => {
    const f = hamletFixture();
    f.state.settings.economy = 'thoughtful';
    f.state.economy.treasury = 50;
    // R1: the carrier stays home until the Ledger turns Food selling back on below.
    for (const fam of f.state.carrier.families) fam.rule = 'never';
    const start = untilHour(f.state, 0);
    const e = f.state.economy;
    // Thoughtful upkeep is 125% of the 9 coins.
    expect(e.treasury).toBe(50 + 900 - 1125);
    expect(e.leanTimes).toBe(true);
    expect(start.some((x) => x.e === 'notify' && x.kind === 'lean-times')).toBe(true);
    expect(
      f.state.residents.every((r) => r.modifiers.some((m) => m.kind === LEAN_MODIFIER && m.value === -5)),
    ).toBe(true);
    expect(rejection(run(f.state, { t: 'build.place', def: 'well', x: 47, z: 52, rot: 0 }))).toBe(
      'LEAN_TIMES',
    );

    // The carrier sells the Food over twice its reserve when it calls at 10:00.
    run(f.state, { t: 'carrier.setRule', family: 'food', rule: 'always', sell: true });
    const end = untilHour(f.state, 11);
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
