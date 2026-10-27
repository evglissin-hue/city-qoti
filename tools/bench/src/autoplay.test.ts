// C3X acceptance (docs/spec/30-roadmap.md, I1): from founding, a hamlet played sensibly grows
// toward 30 residents over about two to three evenings (12 to 18 in-game days) without dead ends:
// nobody leaves, food keeps coming, the books stay out of lean times, and the Hearth side finds
// patterns and grants wishes along the way.
import { hashState } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { autoplay, formatDays } from './autoplay';

describe('two players, three evenings', { timeout: 120_000 }, () => {
  for (const seed of ['willow', 'hazel']) {
    it(`grows ${seed} without dead ends`, () => {
      const run = autoplay(seed, 18);
      const days = run.days;
      const last = days[days.length - 1]!;
      const why = `\n${formatDays(days)}`;
      expect(last.residents, why).toBeGreaterThanOrEqual(28);
      expect(last.departures, why).toBe(0);
      for (const d of days) {
        expect(d.leanTimes, why).toBe(false);
        if (d.day >= 3) expect(d.foodMade + d.food, why).toBeGreaterThan(0);
        expect(d.miserable, why).toBeLessThanOrEqual(1);
      }
      expect(last.wishesGranted, why).toBeGreaterThanOrEqual(3);
      expect(last.patterns, why).toBeGreaterThanOrEqual(2);
      expect(last.achievements, why).toBeGreaterThanOrEqual(5);
    });
  }

  it('plays the same valley the same way twice', () => {
    const a = autoplay('willow', 4).hamlet.world;
    const b = autoplay('willow', 4).hamlet.world;
    expect(hashState(a)).toBe(hashState(b));
  });
});

// C4C: the Village run. From the same start, the players claim (or, until C4D and C4X chase the
// Charter, are granted on VILLAGE_DAY) the Village, then build the chains, services and homes
// toward Craftsfolk. The goal of 40 Craftsfolk comes with C4A's wages and market and C4X's
// tuning; here the run must keep growing without dead ends and raise its first Craftsfolk.
describe('a Village run', { timeout: 240_000 }, () => {
  it('grows on as a Village and raises Craftsfolk (oak)', () => {
    const run = autoplay('oak', 90, { village: true });
    const days = run.days;
    const why = `\n${formatDays(days)}`;
    const village = days.findIndex((d) => d.rank === 'village');
    expect(village, why).toBeGreaterThan(0);
    const last = days[days.length - 1]!;
    expect(last.residents, why).toBeGreaterThan(days[village]!.residents + 60);
    expect(last.craftsfolk, why).toBeGreaterThanOrEqual(16);
    expect(last.departures, why).toBeLessThanOrEqual(2);
    for (const d of days) expect(d.leanTimes, why).toBe(false);
    // The town never stalls: every ten days of the Village half add residents.
    for (let i = village + 10; i < days.length; i += 10)
      expect(days[i]!.residents, why).toBeGreaterThan(days[i - 10]!.residents);
  });
});
