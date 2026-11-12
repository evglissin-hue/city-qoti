// C3C acceptance: a headless three-day run from the standard starting state keeps food flowing
// and the treasury in a sensible band (with the C3A stand-in residents from ./hamlet).
// R1.0: the player's first day is a fishery, a stall and a Forester's Lodge. R1X: the fishery's two
// hands feed the eight founders (one food hand feeds about four, so a third of the hands in food),
// the carrier's Food reserve keeps three days in store, and the treasury stays in band.
import { content } from '@qoti/content';
import { hashState, PENNIES_PER_COIN, TICKS_PER_DAY, TICKS_PER_HOUR, townStock } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import {
  build,
  FIRST_DAY_BUILDS,
  fortyResidentHamlet,
  HAMLET_WORKPLACES,
  runTicks,
  STAND_IN,
  startingTown,
} from './hamlet';

const FOODS = content.goods.flatMap((g, i) => (g.family === 'food' ? [i] : []));

// Long headless runs: generous timeouts, the CI machine may be busy.
describe('the standard start, three days on', { timeout: 30_000 }, () => {
  it('places the first day and runs three days with the founders in', () => {
    const h = startingTown('hazel');
    const w = h.world;
    // The founders walk in through the valley gate at 08:00 (C3A), two hours after the start.
    runTicks(h, 2 * TICKS_PER_HOUR + 10);
    expect(w.residents).toHaveLength(8);
    const placed = FIRST_DAY_BUILDS.map((id) => build(h, id));
    expect(placed.every((id) => id > 0)).toBe(true);
    runTicks(h, 3 * TICKS_PER_DAY);
    const kinds = w.chronicle.map((c) => c.kind);
    expect(kinds[0]).toBe('founding');
    expect(kinds.filter((k) => k === 'household-arrived')).toHaveLength(2);
  });

  it('keeps food flowing and the treasury in band', () => {
    const h = startingTown('hazel');
    const w = h.world;
    runTicks(h, 2 * TICKS_PER_HOUR + 10);
    const placed = FIRST_DAY_BUILDS.map((id) => build(h, id));
    expect(placed.every((id) => id > 0)).toBe(true);

    const treasury: number[] = [];
    let made = 0;
    let eaten = 0;
    for (let d = 0; d < 3; d++) {
      runTicks(h, TICKS_PER_DAY);
      treasury.push(w.economy.treasury / PENNIES_PER_COIN);
      for (const g of FOODS) made += w.economy.yesterday.produced[g]!;
      for (const g of FOODS) eaten += w.economy.yesterday.consumed[g]!;
      expect(w.economy.leanTimes).toBe(false);
    }
    // Everyone ate every breakfast: days 2 and 3 (the founders arrive after day 1's breakfast).
    expect(eaten).toBeGreaterThanOrEqual(2 * 8);
    if (STAND_IN) {
      // The stand-in also counts empty pantries and food carried home from the outlets.
      expect(h.stats.hungry).toBe(0);
      expect(h.stats.meals).toBe(4 * 8);
      expect(h.stats.shopped).toBeGreaterThanOrEqual(24);
    }
    // The new buildings are built, staffed and feeding the town.
    expect(w.buildings.every((b) => b.stage === 'built')).toBe(true);
    // R1X: the fishery keeps up with the founders' eating (8 a day from day 2).
    expect(made).toBeGreaterThanOrEqual(eaten);
    const stall = w.buildings.find((b) => b.def === 'market-stall')!;
    expect(FOODS.reduce((n, g) => n + stall.rt!.store[g]!, 0)).toBeGreaterThan(10);
    const stock = townStock(w);
    // Three days of Food for eight: the carrier's reserve.
    expect(FOODS.reduce((n, g) => n + stock[g]!, 0)).toBeGreaterThanOrEqual(24);
    // 500 coins, less the first sites, plus a few coins a day of taxes over upkeep.
    for (const t of treasury) {
      expect(t).toBeGreaterThan(400);
      expect(t).toBeLessThan(520);
    }
    const kinds = w.chronicle.map((c) => c.kind);
    // The first catch is news (R1: one food maker on the first day).
    expect(kinds.filter((k) => k === 'first-of').length).toBeGreaterThanOrEqual(1);
  });

  it('builds every workplace of the 40-resident hamlet from content', () => {
    for (const [def, trade] of HAMLET_WORKPLACES) {
      expect(content.buildingById.has(def), def).toBe(true);
      if (trade) expect(content.tradeById.get(trade)?.building, trade).toBe(def);
    }
    for (const def of FIRST_DAY_BUILDS) expect(content.buildingById.has(def), def).toBe(true);
  });

  it('runs the 40-resident hamlet deterministically', () => {
    const a = fortyResidentHamlet('hazel');
    const b = fortyResidentHamlet('hazel');
    runTicks(a, TICKS_PER_DAY);
    runTicks(b, TICKS_PER_DAY);
    expect(hashState(a.world)).toBe(hashState(b.world));
    expect(a.world.economy.yesterday.consumed.some((n) => n > 0)).toBe(true);
  });
});
