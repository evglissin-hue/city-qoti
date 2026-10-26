// C3C acceptance: a headless three-day run from the standard starting state keeps food flowing
// and the treasury in a sensible band (with the C3A stand-in residents from ./hamlet).
import { content } from '@qoti/content';
import { hashState, PENNIES_PER_COIN, TICKS_PER_DAY, TICKS_PER_HOUR, townStock } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { build, fortyResidentHamlet, runTicks, startingTown } from './hamlet';

const FOODS = content.goods.flatMap((g, i) => (g.food ? [i] : []));

// Long headless runs: generous timeouts, the CI machine may be busy.
describe('the standard start, three days on', { timeout: 30_000 }, () => {
  it('keeps food flowing and the treasury in band', () => {
    const h = startingTown('hazel');
    const w = h.world;
    expect(w.residents).toHaveLength(8);
    runTicks(h, 2 * TICKS_PER_HOUR);
    const placed = ['vegetable-plot', 'fishers-hut', 'market-stall', 'woodcutter'].map((id) => build(h, id));
    expect(placed.every((id) => id > 0)).toBe(true);

    const treasury: number[] = [];
    let made = 0;
    for (let d = 0; d < 3; d++) {
      runTicks(h, TICKS_PER_DAY);
      treasury.push(w.economy.treasury / PENNIES_PER_COIN);
      for (const g of FOODS) made += w.economy.yesterday.produced[g]!;
      expect(w.economy.leanTimes).toBe(false);
    }
    // Everyone ate every breakfast, from food that went through the outlets.
    expect(h.stats.hungry).toBe(0);
    expect(h.stats.meals).toBe(4 * 8);
    expect(h.stats.shopped).toBeGreaterThanOrEqual(24);
    // The new plot and hut are built, staffed and feeding the town.
    expect(w.buildings.every((b) => b.stage === 'built')).toBe(true);
    expect(made).toBeGreaterThanOrEqual(30);
    const stall = w.buildings.find((b) => b.def === 'market-stall')!;
    expect(FOODS.reduce((n, g) => n + stall.rt!.store[g]!, 0)).toBeGreaterThan(10);
    const stock = townStock(w);
    expect(FOODS.reduce((n, g) => n + stock[g]!, 0)).toBeGreaterThan(30);
    // 500 coins, less 55 for the four sites, plus a few coins a day of taxes over upkeep.
    for (const t of treasury) {
      expect(t).toBeGreaterThan(400);
      expect(t).toBeLessThan(520);
    }
    expect(w.chronicle.map((c) => c.kind)).toEqual(['first-of', 'first-of']);
  });

  it('runs the 40-resident hamlet deterministically', () => {
    const a = fortyResidentHamlet('hazel');
    const b = fortyResidentHamlet('hazel');
    runTicks(a, TICKS_PER_DAY);
    runTicks(b, TICKS_PER_DAY);
    expect(hashState(a.world)).toBe(hashState(b.world));
    expect(a.stats.meals).toBeGreaterThan(0);
  });
});
