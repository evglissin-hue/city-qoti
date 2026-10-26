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

  // C4D: with lives, story characters, plans, requests and the Charter claim in play, a valley
  // still grows, eats and never stalls, and the together loop actually happens.
  it('lives, stories and the together loop over six evenings (hazel, 40 days)', () => {
    const run = autoplay('hazel', 40);
    const days = run.days;
    const last = days[days.length - 1]!;
    const why = `\n${formatDays(days)}`;
    expect(last.residents, why).toBeGreaterThanOrEqual(60);
    expect(last.departures, why).toBe(0);
    for (const d of days) {
      expect(d.leanTimes, why).toBe(false);
      expect(d.miserable, why).toBeLessThanOrEqual(1);
    }
    expect(last.couples + last.births, why).toBeGreaterThanOrEqual(2);
    expect(last.story, why).toBeGreaterThanOrEqual(6);
    expect(last.requests, why).toBeGreaterThanOrEqual(1);
    expect(last.plans, why).toBeGreaterThanOrEqual(1);
    expect(last.rank, why).toBe('village');
  });

  it('plays the same valley the same way twice', () => {
    const a = autoplay('willow', 4).hamlet.world;
    const b = autoplay('willow', 4).hamlet.world;
    expect(hashState(a)).toBe(hashState(b));
  });
});
